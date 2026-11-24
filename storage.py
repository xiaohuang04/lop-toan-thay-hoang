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
        self.uploads_dir = self.data_dir / "uploads"
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
            with urllib.request.urlopen(req, timeout=60) as resp:
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
        # Only fetch core metadata keys on boot — never load heavy `file:<id>` blobs into boot RAM
        rows = self._sb_request(
            "GET",
            "app_store?key=in.(users,exams,assignments,submissions,posts,files,sessions,teaching_log,settings,tuition,analytics,gradebook)&select=key,value",
        )
        kv = {r["key"]: r["value"] for r in (rows or []) if isinstance(r, dict)}

        if "users" in kv and "exams" in kv:
            db = {
                "users": kv.get("users", []),
                "exams": kv.get("exams", []),
                "assignments": kv.get("assignments", []),
                "submissions": kv.get("submissions", []),
                "posts": kv.get("posts", []),
                "files": kv.get("files", []),
                "teaching_log": kv.get("teaching_log"),
                "settings": kv.get("settings") if isinstance(kv.get("settings"), dict) else {},
                "tuition": kv.get("tuition") if isinstance(kv.get("tuition"), dict) else None,
                "analytics": kv.get("analytics") if isinstance(kv.get("analytics"), dict) else None,
                "gradebook": kv.get("gradebook") if isinstance(kv.get("gradebook"), dict) else None,
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
                "posts": seeded.get("posts", []),
                "files": seeded.get("files", []),
                "teaching_log": seeded.get("teaching_log"),
                "settings": seeded.get("settings", {}),
                "tuition": seeded.get("tuition"),
                "analytics": seeded.get("analytics"),
                "gradebook": seeded.get("gradebook"),
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
                    {"key": "posts", "value": db["posts"]},
                    {"key": "files", "value": db["files"]},
                    {"key": "teaching_log", "value": db["teaching_log"] or {}},
                    {"key": "settings", "value": db["settings"] or {}},
                    {"key": "tuition", "value": db["tuition"] or {}},
                    {"key": "analytics", "value": db["analytics"] or {}},
                    {"key": "gradebook", "value": db["gradebook"] or {}},
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
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        if self.db_file.exists():
            db = self._read_json(self.db_file, {})
            if db and "users" in db and "exams" in db:
                db.setdefault("assignments", [])
                db.setdefault("submissions", [])
                db.setdefault("models", [])
                db.setdefault("posts", [])
                db.setdefault("files", [])
                db.setdefault("teaching_log", None)
                if not isinstance(db.get("settings"), dict):
                    db["settings"] = {}
                if not isinstance(db.get("tuition"), dict):
                    db["tuition"] = None
                if not isinstance(db.get("analytics"), dict):
                    db["analytics"] = None
                if not isinstance(db.get("gradebook"), dict):
                    db["gradebook"] = None
                self._db_cache = db
                return db
        db = self.seed_factory()
        db.setdefault("posts", [])
        db.setdefault("files", [])
        db.setdefault("teaching_log", None)
        db.setdefault("settings", {})
        db.setdefault("tuition", None)
        db.setdefault("analytics", None)
        db.setdefault("gradebook", None)
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
            target_keys = keys or ["users", "exams", "assignments", "submissions", "posts", "files"]
            payload = [
                {
                    "key": k,
                    "value": db.get(k) if db.get(k) is not None else ({} if k in ("teaching_log", "settings", "tuition", "analytics", "gradebook") else []),
                }
                for k in target_keys
            ]
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
    def _normalize_model(self, m: dict, html_content: str = "") -> dict:
        return {
            "id": m["id"],
            "name": m.get("name", "Mô hình tương tác"),
            "fileName": m.get("fileName", m.get("file_name", "model.html")),
            "grade": str(m.get("grade", "12")),
            "chapterId": str(m.get("chapterId", "12-c1")),
            "lessonId": str(m.get("lessonId", "12-b4")),
            "visible": bool(m.get("visible", True)),
            "thumbnail": str(m.get("thumbnail", "")),
            "addedAt": m.get("addedAt", m.get("added_at", "")),
            "isBuiltin": False,
            "html": html_content,
        }

    def list_models(self) -> list[dict]:
        if self.use_supabase:
            if self._models_cache is None:
                rows = self._sb_request(
                    "GET",
                    "html_models?select=id,name,file_name,added_at,html&order=created_at.desc",
                )
                meta_map = self._sb_get_kv("models_meta")
                if not isinstance(meta_map, dict):
                    meta_map = {}
                self._models_cache = []
                for r in (rows or []):
                    extra = meta_map.get(r["id"], {}) if isinstance(meta_map.get(r["id"]), dict) else {}
                    merged = {**r, **extra}
                    self._models_cache.append(self._normalize_model(merged, r.get("html", "")))
            return list(self._models_cache)

        db = self.load_db()
        models_out = []
        for m in db.get("models", []):
            html_file = self.models_dir / f"{m['id']}.html"
            html_content = html_file.read_text(encoding="utf-8") if html_file.exists() else ""
            models_out.append(self._normalize_model(m, html_content))
        return models_out

    def get_model_by_id(self, model_id: str) -> dict | None:
        for m in self.list_models():
            if m["id"] == model_id:
                return m
        return None

    def _save_supabase_models_meta(self) -> None:
        if not self.use_supabase or self._models_cache is None:
            return
        meta_map = {
            m["id"]: {
                "name": m["name"],
                "fileName": m["fileName"],
                "grade": m["grade"],
                "chapterId": m["chapterId"],
                "lessonId": m["lessonId"],
                "visible": m["visible"],
                "thumbnail": m["thumbnail"],
                "addedAt": m["addedAt"],
            }
            for m in self._models_cache
        }
        self._sb_set_kv("models_meta", meta_map)

    def add_model(self, model_meta: dict, html_content: str) -> dict:
        full_model = self._normalize_model(model_meta, html_content)
        if self.use_supabase:
            self._sb_request(
                "POST",
                "html_models?on_conflict=id",
                body=[
                    {
                        "id": full_model["id"],
                        "name": full_model["name"],
                        "file_name": full_model["fileName"],
                        "added_at": full_model["addedAt"],
                        "html": html_content,
                    }
                ],
                extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
            if self._models_cache is None:
                self.list_models()
            self._models_cache = [m for m in (self._models_cache or []) if m["id"] != full_model["id"]]
            self._models_cache.insert(0, full_model)
            self._save_supabase_models_meta()
            return full_model

        self.models_dir.mkdir(parents=True, exist_ok=True)
        (self.models_dir / f"{full_model['id']}.html").write_text(html_content, encoding="utf-8")
        db = self.load_db()
        stored_meta = {k: v for k, v in full_model.items() if k != "html"}
        db.setdefault("models", []).insert(0, stored_meta)
        self.save_db(db)
        return full_model

    def update_model(self, model_id: str, patch: dict) -> dict | None:
        if self.use_supabase:
            models = self.list_models()
            target = next((m for m in models if m["id"] == model_id), None)
            if not target:
                return None
            for field in ("name", "grade", "chapterId", "lessonId", "thumbnail"):
                if field in patch and patch[field] is not None:
                    target[field] = str(patch[field]).strip() if field != "thumbnail" else str(patch[field])
            if "visible" in patch:
                target["visible"] = bool(patch["visible"])
            if "html" in patch and str(patch["html"]).strip():
                target["html"] = str(patch["html"])
                if patch.get("fileName"):
                    target["fileName"] = str(patch["fileName"])
                self._sb_request(
                    "POST",
                    "html_models?on_conflict=id",
                    body=[
                        {
                            "id": target["id"],
                            "name": target["name"],
                            "file_name": target["fileName"],
                            "added_at": target["addedAt"],
                            "html": target["html"],
                        }
                    ],
                    extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                )
            elif "name" in patch:
                self._sb_request(
                    "PATCH",
                    f"html_models?id=eq.{urllib.parse.quote(model_id)}",
                    body={"name": target["name"]},
                    extra_headers={"Prefer": "return=minimal"},
                )
            self._models_cache = models
            self._save_supabase_models_meta()
            return target

        db = self.load_db()
        target = next((m for m in db.get("models", []) if m["id"] == model_id), None)
        if not target:
            return None
        for field in ("name", "grade", "chapterId", "lessonId", "thumbnail"):
            if field in patch and patch[field] is not None:
                target[field] = str(patch[field]).strip() if field != "thumbnail" else str(patch[field])
        if "visible" in patch:
            target["visible"] = bool(patch["visible"])
        html_file = self.models_dir / f"{model_id}.html"
        if "html" in patch and str(patch["html"]).strip():
            html_file.write_text(str(patch["html"]), encoding="utf-8")
            if patch.get("fileName"):
                target["fileName"] = str(patch["fileName"])
        self.save_db(db)
        html_content = html_file.read_text(encoding="utf-8") if html_file.exists() else ""
        return self._normalize_model(target, html_content)

    def delete_model(self, model_id: str) -> None:
        if self.use_supabase:
            self._sb_request("DELETE", f"html_models?id=eq.{urllib.parse.quote(model_id)}")
            if self._models_cache is None:
                self.list_models()
            self._models_cache = [m for m in (self._models_cache or []) if m["id"] != model_id]
            self._save_supabase_models_meta()
            return

        db = self.load_db()
        db["models"] = [m for m in db.get("models", []) if m["id"] != model_id]
        html_file = self.models_dir / f"{model_id}.html"
        if html_file.exists():
            html_file.unlink()
        self.save_db(db)

    # =========================================================
    # CLASSROOM UPLOADED FILES STORAGE (PDF HANDOUTS, IMAGES, DOCS)
    # =========================================================
    def add_file(self, file_meta: dict, raw_bytes: bytes) -> dict:
        import base64 as _b64

        file_id = file_meta["id"]
        db = self.load_db()
        db.setdefault("files", [])
        if self.use_supabase:
            self._sb_set_kv(
                f"file:{file_id}",
                {
                    "mimeType": file_meta["mimeType"],
                    "fileName": file_meta["fileName"],
                    "base64Data": _b64.b64encode(raw_bytes).decode("ascii"),
                },
            )
        else:
            self.uploads_dir.mkdir(parents=True, exist_ok=True)
            (self.uploads_dir / file_id).write_bytes(raw_bytes)

        db["files"] = [f for f in db["files"] if f["id"] != file_id]
        db["files"].insert(0, file_meta)
        self.save_db(db, keys=["files"])
        return file_meta

    def get_file(self, file_id: str) -> tuple[dict | None, bytes | None]:
        import base64 as _b64

        db = self.load_db()
        meta = next((f for f in db.get("files", []) if f["id"] == file_id), None)
        if self.use_supabase:
            row = self._sb_get_kv(f"file:{file_id}")
            if not isinstance(row, dict) or not row.get("base64Data"):
                return None, None
            if not meta:
                meta = {
                    "id": file_id,
                    "fileName": row.get("fileName", "document"),
                    "mimeType": row.get("mimeType", "application/octet-stream"),
                }
            return meta, _b64.b64decode(row["base64Data"])

        if not meta:
            return None, None
        fpath = self.uploads_dir / file_id
        if not fpath.exists():
            return None, None
        return meta, fpath.read_bytes()

    def delete_file(self, file_id: str) -> None:
        db = self.load_db()
        db["files"] = [f for f in db.get("files", []) if f["id"] != file_id]
        if self.use_supabase:
            try:
                self._sb_request("DELETE", f"app_store?key=eq.{urllib.parse.quote(f'file:{file_id}')}")
            except Exception:
                pass
        else:
            fpath = self.uploads_dir / file_id
            if fpath.exists():
                fpath.unlink()
        self.save_db(db, keys=["files"])

    # =========================================================
    # STORAGE USAGE ANALYTICS (SUPABASE / LOCAL QUOTA MONITOR)
    # =========================================================
    def get_storage_stats(self, db: dict) -> dict:
        def json_bytes(obj) -> int:
            return len(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

        posts = db.get("posts", [])
        files = db.get("files", [])
        exams = db.get("exams", [])
        models = self.list_models()

        # Map fileId -> list of post titles referencing it
        file_refs: dict[str, list[str]] = {}
        for p in posts:
            ptitle = p.get("title") or "Bài viết không tiêu đề"
            for att in p.get("attachments", []):
                fid = att.get("fileId")
                if fid:
                    file_refs.setdefault(fid, []).append(ptitle)

        # Calculate files storage (on Supabase, base64 in JSONB takes ~1.34x raw size)
        factor = 1.34 if self.use_supabase else 1.0
        files_raw_bytes = 0
        files_stored_bytes = 0
        file_items = []
        orphan_count = 0
        orphan_bytes = 0

        for f in files:
            raw_sz = int(f.get("size") or 0)
            est_sz = int(raw_sz * factor) + 256
            files_raw_bytes += raw_sz
            files_stored_bytes += est_sz
            refs = file_refs.get(f["id"], [])
            is_orphan = len(refs) == 0
            if is_orphan:
                orphan_count += 1
                orphan_bytes += est_sz
            file_items.append({
                "kind": "file",
                "id": f["id"],
                "name": f.get("fileName", "document"),
                "mimeType": f.get("mimeType", ""),
                "rawBytes": raw_sz,
                "storedBytes": est_sz,
                "uploadedAt": f.get("uploadedAt", ""),
                "usedIn": refs,
                "isOrphan": is_orphan,
                "url": f.get("url", f"/file/{f['id']}"),
            })

        models_bytes = 0
        model_items = []
        for m in models:
            html_b = len((m.get("html") or "").encode("utf-8"))
            thumb_b = len((m.get("thumbnail") or "").encode("utf-8"))
            total_m = html_b + thumb_b + 300
            models_bytes += total_m
            model_items.append({
                "kind": "model",
                "id": m["id"],
                "name": m.get("name", "Mô hình HTML"),
                "fileName": m.get("fileName", "model.html"),
                "grade": m.get("grade", ""),
                "rawBytes": html_b + thumb_b,
                "storedBytes": total_m,
                "uploadedAt": m.get("addedAt", ""),
                "visible": bool(m.get("visible", True)),
            })

        exams_bytes = json_bytes(exams)
        other_bytes = (
            json_bytes(db.get("users", []))
            + json_bytes(db.get("assignments", []))
            + json_bytes(db.get("submissions", []))
            + json_bytes(posts)
            + json_bytes(files)
        )
        total_bytes = files_stored_bytes + models_bytes + exams_bytes + other_bytes
        quota_bytes = 500 * 1024 * 1024  # 500 MB Supabase Free Tier database limit

        items = sorted(file_items + model_items, key=lambda x: x["storedBytes"], reverse=True)

        return {
            "mode": self.mode,
            "supabaseError": self.supabase_error,
            "quotaBytes": quota_bytes,
            "totalBytes": total_bytes,
            "percentUsed": round((total_bytes / quota_bytes) * 100, 2) if quota_bytes else 0,
            "breakdown": {
                "files": {"count": len(files), "bytes": files_stored_bytes, "rawBytes": files_raw_bytes},
                "models": {"count": len(models), "bytes": models_bytes},
                "exams": {"count": len(exams), "bytes": exams_bytes},
                "other": {
                    "count": len(posts) + len(db.get("users", [])) + len(db.get("submissions", [])),
                    "postsCount": len(posts),
                    "bytes": other_bytes,
                },
            },
            "orphans": {"count": orphan_count, "bytes": orphan_bytes},
            "items": items,
        }
