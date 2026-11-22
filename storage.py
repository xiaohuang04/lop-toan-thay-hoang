#!/usr/bin/env python3
"""
Hybrid Storage Layer for Lớp toán thầy Hoàng:
- Cloud Mode (when SUPABASE_URL + SUPABASE_SERVICE_KEY env vars are set):
  Persists all users, exams, assignments, submissions, sessions, and HTML models
  permanently to Supabase PostgreSQL via HTTPS PostgREST (zero external pip deps!).
- Local Fallback Mode (default on local machine without Supabase env vars):
  Persists to data/db.json, data/sessions.json, and data/models/*.html.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class StorageBackend:
    def __init__(self, base_dir: Path, seed_factory):
        self.base_dir = base_dir
        self.data_dir = base_dir / "data"
        self.models_dir = self.data_dir / "models"
        self.db_file = self.data_dir / "db.json"
        self.sessions_file = self.data_dir / "sessions.json"
        self.seed_factory = seed_factory

        raw_url = os.environ.get("SUPABASE_URL", "").strip().strip('"').strip("'").rstrip("/")
        # Normalize if user pasted full Data API URL ending in /rest/v1
        if raw_url.lower().endswith("/rest/v1"):
            raw_url = raw_url[:-8].rstrip("/")
        self.supabase_url = raw_url
        self.supabase_key = (
            os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
            or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
            or os.environ.get("SUPABASE_KEY", "").strip()
        ).strip('"').strip("'")
        self.use_supabase = bool(self.supabase_url and self.supabase_key)
        self.supabase_error: str | None = None

        # Write-through memory cache so reads are instant on single-instance Render
        self._db_cache: dict | None = None
        self._sessions_cache: dict | None = None
        self._models_cache: list[dict] | None = None

    @property
    def mode(self) -> str:
        return "supabase" if self.use_supabase else "local"

    # =========================================================
    # SUPABASE REST HELPERS (urllib stdlib only)
    # =========================================================
    def _sb_headers(self, extra: dict | None = None) -> dict:
        headers = {
            "apikey": self.supabase_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        # Classic JWT service_role keys require Authorization: Bearer;
        # New sb_secret_* keys work via apikey directly.
        if self.supabase_key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {self.supabase_key}"
        if extra:
            headers.update(extra)
        return headers

    def _sb_request(self, method: str, endpoint: str, body=None, extra_headers: dict | None = None):
        url = f"{self.supabase_url}/rest/v1/{endpoint.lstrip('/')}"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=self._sb_headers(extra_headers), method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw.strip() else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase HTTP {e.code}: {detail}") from e
        except Exception as e:
            raise RuntimeError(f"Supabase connection error: {e}") from e

    def _sb_get_kv(self, key: str):
        rows = self._sb_request("GET", f"app_store?key=eq.{urllib.parse.quote(key)}&select=value")
        if isinstance(rows, list) and rows:
            return rows[0].get("value")
        return None

    def _sb_set_kv(self, key: str, value) -> None:
        self._sb_request(
            "POST",
            "app_store?on_conflict=key",
            body=[{"key": key, "value": value}],
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    # =========================================================
    # LOCAL FILE HELPERS
    # =========================================================
    def _atomic_write_json(self, path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    def _read_json(self, path: Path, default):
        if not path.exists():
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default

    # =========================================================
    # PUBLIC STORAGE API
    # =========================================================
    def init(self) -> dict:
        if self.use_supabase:
            try:
                return self._init_supabase()
            except Exception as e:
                self.supabase_error = str(e)
                sys.stderr.write(f"[EduLab] Supabase init warning: {e}\n")
                sys.stderr.flush()
                # Fall back cleanly so server still boots and reports error
                self.use_supabase = False
        return self._init_local()

    def _init_supabase(self) -> dict:
        rows = self._sb_request("GET", "app_store?select=key,value")
        kv = {r["key"]: r["value"] for r in (rows or []) if isinstance(r, dict)}

        if "users" in kv and "exams" in kv:
            db = {
                "users": kv.get("users", []),
                "exams": kv.get("exams", []),
                "assignments": kv.get("assignments", []),
                "submissions": kv.get("submissions", []),
            }
            self._sessions_cache = kv.get("sessions", {}) if isinstance(kv.get("sessions"), dict) else {}
        else:
            # First-time cloud bootstrap: seed default admin, demo students, exams & assignments
            seeded = self.seed_factory()
            db = {
                "users": seeded["users"],
                "exams": seeded["exams"],
                "assignments": seeded["assignments"],
                "submissions": seeded["submissions"],
            }
            self._sessions_cache = {}
            self._sb_request(
                "POST",
                "app_store?on_conflict=key",
                body=[
                    {"key": "users", "value": db["users"]},
                    {"key": "exams", "value": db["exams"]},
                    {"key": "assignments", "value": db["assignments"]},
                    {"key": "submissions", "value": db["submissions"]},
                    {"key": "sessions", "value": {}},
                ],
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
            print("[EduLab] Seeded initial data into Supabase Cloud successfully!")
            sys.stdout.flush()

        self._db_cache = db
        return db

    def _init_local(self) -> dict:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        if self.db_file.exists():
            db = self._read_json(self.db_file, {})
            if db and "users" in db and "exams" in db:
                db.setdefault("assignments", [])
                db.setdefault("submissions", [])
                db.setdefault("models", [])
                self._db_cache = db
                return db
        db = self.seed_factory()
        self._atomic_write_json(self.db_file, db)
        self._db_cache = db
        return db

    def load_db(self) -> dict:
        if self._db_cache is not None:
            return self._db_cache
        return self.init()

    def save_db(self, db: dict, keys: list[str] | None = None) -> None:
        self._db_cache = db
        if self.use_supabase:
            target_keys = keys or ["users", "exams", "assignments", "submissions"]
            payload = [{"key": k, "value": db.get(k, [])} for k in target_keys]
            self._sb_request(
                "POST",
                "app_store?on_conflict=key",
                body=payload,
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
        else:
            self._atomic_write_json(self.db_file, db)

    def load_sessions(self) -> dict:
        if self._sessions_cache is not None:
            return self._sessions_cache
        if self.use_supabase:
            val = self._sb_get_kv("sessions")
            self._sessions_cache = val if isinstance(val, dict) else {}
        else:
            self._sessions_cache = self._read_json(self.sessions_file, {})
        return self._sessions_cache

    def save_sessions(self, sessions: dict) -> None:
        self._sessions_cache = sessions
        if self.use_supabase:
            self._sb_set_kv("sessions", sessions)
        else:
            self._atomic_write_json(self.sessions_file, sessions)

    # =========================================================
    # HTML INTERACTIVE MODELS STORAGE
    # =========================================================
    def list_models(self) -> list[dict]:
        if self.use_supabase:
            if self._models_cache is None:
                rows = self._sb_request(
                    "GET",
                    "html_models?select=id,name,file_name,added_at,html&order=created_at.desc",
                )
                self._models_cache = [
                    {
                        "id": r["id"],
                        "name": r["name"],
                        "fileName": r["file_name"],
                        "addedAt": r["added_at"],
                        "isBuiltin": False,
                        "html": r["html"],
                    }
                    for r in (rows or [])
                ]
            return list(self._models_cache)

        db = self.load_db()
        models_out = []
        for m in db.get("models", []):
            html_file = self.models_dir / f"{m['id']}.html"
            html_content = html_file.read_text(encoding="utf-8") if html_file.exists() else ""
            models_out.append({**m, "html": html_content})
        return models_out

    def add_model(self, model_meta: dict, html_content: str) -> dict:
        full_model = {**model_meta, "html": html_content}
        if self.use_supabase:
            self._sb_request(
                "POST",
                "html_models?on_conflict=id",
                body=[
                    {
                        "id": model_meta["id"],
                        "name": model_meta["name"],
                        "file_name": model_meta["fileName"],
                        "added_at": model_meta["addedAt"],
                        "html": html_content,
                    }
                ],
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
            if self._models_cache is None:
                self._models_cache = []
            self._models_cache.insert(0, full_model)
            return full_model

        self.models_dir.mkdir(parents=True, exist_ok=True)
        (self.models_dir / f"{model_meta['id']}.html").write_text(html_content, encoding="utf-8")
        db = self.load_db()
        db.setdefault("models", []).insert(0, model_meta)
        self.save_db(db)
        return full_model

    def delete_model(self, model_id: str) -> None:
        if self.use_supabase:
            self._sb_request("DELETE", f"html_models?id=eq.{urllib.parse.quote(model_id)}")
            if self._models_cache is not None:
                self._models_cache = [m for m in self._models_cache if m["id"] != model_id]
            return

        db = self.load_db()
        db["models"] = [m for m in db.get("models", []) if m["id"] != model_id]
        html_file = self.models_dir / f"{model_id}.html"
        if html_file.exists():
            html_file.unlink()
        self.save_db(db)
