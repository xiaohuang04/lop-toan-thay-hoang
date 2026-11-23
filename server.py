#!/usr/bin/env python3
"""
EduLab 2025 — Zero-Dependency Python Backend + Static File Server
Supports:
- Admin (Teacher) & Student accounts with PBKDF2-SHA256 password hashing
- Exam Bank CRUD + JSON import
- Assignments with Deadlines (dueAt) and Student Selection
- Student Submissions & Grading History
- Shared Interactive HTML Models Lab
"""

import base64
import hashlib
import json
import os
import secrets
import sys
import threading
import time
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from parsers import parse_docx_bytes, parse_extest_latex, parse_structured_exam_text
from storage import StorageBackend

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SEED_EXAMS_FILE = DATA_DIR / "seed_exams.json"

LOCK = threading.Lock()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def hash_password(password: str, salt: str | None = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hex_hash = stored.split("$", 1)
        return secrets.compare_digest(hash_password(password, salt), f"{salt}${hex_hash}")
    except Exception:
        return False


def atomic_write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def build_seed_db() -> dict:
    seed_exams = read_json(SEED_EXAMS_FILE, [])
    due_7d = (datetime.now() + timedelta(days=7)).replace(hour=23, minute=59, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")
    due_2d = (datetime.now() + timedelta(days=2)).replace(hour=22, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")

    users = [
        {
            "id": "u-admin",
            "username": "admin",
            "passwordHash": hash_password("admin123"),
            "role": "admin",
            "fullName": "Lê Viết Hoàng",
            "className": "Tổ Toán - Tin",
            "studentCode": "GV001",
            "email": "hoang.toan@edulab.vn",
            "phone": "0901234567",
            "dob": "",
            "createdAt": now_iso(),
        },
        {
            "id": "u-hs01",
            "username": "hs01",
            "passwordHash": hash_password("123456"),
            "role": "student",
            "fullName": "Nguyễn Minh Anh",
            "className": "12A1",
            "studentCode": "250101",
            "email": "minhanh.12a1@school.vn",
            "phone": "0912345601",
            "dob": "2008-05-14",
            "createdAt": now_iso(),
        },
        {
            "id": "u-hs02",
            "username": "hs02",
            "passwordHash": hash_password("123456"),
            "role": "student",
            "fullName": "Trần Gia Huy",
            "className": "12A1",
            "studentCode": "250102",
            "email": "giahuy.12a1@school.vn",
            "phone": "0912345602",
            "dob": "2008-09-20",
            "createdAt": now_iso(),
        },
        {
            "id": "u-hs03",
            "username": "hs03",
            "passwordHash": hash_password("123456"),
            "role": "student",
            "fullName": "Lê Thảo Vy",
            "className": "12A2",
            "studentCode": "250201",
            "email": "thaovy.12a2@school.vn",
            "phone": "0912345603",
            "dob": "2008-02-08",
            "createdAt": now_iso(),
        },
    ]

    assignments = []
    if len(seed_exams) >= 1:
        assignments.append({
            "id": "asg-demo-01",
            "examId": seed_exams[0]["id"],
            "assignmentType": "homework",
            "title": "Bài tập tuần — Đề thi thử THPT 2025 (Đề số 01)",
            "note": "Hoàn thành đầy đủ 3 phần trước hạn nộp. Được phép xem lời giải chi tiết ngay sau khi nộp bài.",
            "openAt": "",
            "dueAt": due_7d,
            "studentIds": ["u-hs01", "u-hs02", "u-hs03"],
            "assignAll": True,
            "shuffle": False,
            "timedMode": False,
            "durationMinutes": seed_exams[0].get("durationMinutes", 90),
            "allowRetake": False,
            "createdAt": now_iso(),
        })
    if len(seed_exams) >= 2:
        open_now = datetime.now().replace(second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")
        assignments.append({
            "id": "asg-demo-02",
            "examId": seed_exams[1]["id"],
            "assignmentType": "test",
            "title": "Kiểm tra nhanh 15 phút — Làm quen dạng đề 2025",
            "note": "Bài kiểm tra tính giờ 15 phút gồm cả 3 dạng câu hỏi chuẩn BGD 2025.",
            "openAt": open_now,
            "dueAt": due_2d,
            "studentIds": ["u-hs01", "u-hs02"],
            "assignAll": False,
            "shuffle": True,
            "timedMode": True,
            "durationMinutes": 15,
            "allowRetake": False,
            "createdAt": now_iso(),
        })

    return {
        "users": users,
        "exams": seed_exams,
        "assignments": assignments,
        "submissions": [],
        "models": [],
    }


STORE = StorageBackend(BASE_DIR, build_seed_db)


def init_db() -> dict:
    return STORE.init()


def load_db() -> dict:
    return STORE.load_db()


def save_db(db: dict, keys: list[str] | None = None) -> None:
    STORE.save_db(db, keys=keys)


def load_sessions() -> dict:
    return STORE.load_sessions()


def save_sessions(sessions: dict) -> None:
    STORE.save_sessions(sessions)


def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "passwordHash"}


def is_past_due(due_at_str: str | None) -> bool:
    if not due_at_str:
        return False
    try:
        due_dt = datetime.fromisoformat(due_at_str)
        now = datetime.now(due_dt.tzinfo) if due_dt.tzinfo else datetime.now()
        return now > due_dt
    except Exception:
        return False


def is_before_open(open_at_str: str | None) -> bool:
    if not open_at_str:
        return False
    try:
        open_dt = datetime.fromisoformat(open_at_str)
        now = datetime.now(open_dt.tzinfo) if open_dt.tzinfo else datetime.now()
        return now < open_dt
    except Exception:
        return False


def gen_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000):x}-{secrets.token_hex(2)}"


class EduLabHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        if (
            not self.path.startswith("/api/")
            and not self.path.startswith("/model/")
            and not self.path.startswith("/file/")
        ):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Clean concise server log
        sys.stdout.write(f"[EduLab] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()

    def send_json(self, status: int, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def read_body_json(self) -> dict | list:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        if length > 32 * 1024 * 1024:
            raise ValueError("Dữ liệu gửi lên vượt quá giới hạn cho phép (tối đa 20MB mỗi tệp).")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def get_auth_user(self, db: dict) -> tuple[dict | None, str | None]:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None, None
        token = auth[7:].strip()
        if not token:
            return None, None
        sessions = load_sessions()
        user_id = sessions.get(token)
        if not user_id:
            return None, None
        for u in db["users"]:
            if u["id"] == user_id:
                return u, token
        return None, None

    def block_private_paths(self, path: str) -> bool:
        norm = path.lstrip("/").lower()
        if norm.startswith("data/") or norm == "data" or norm.endswith(".py"):
            self.send_error(403, "Forbidden")
            return True
        return False

    # =========================================================
    # HTTP METHODS
    # =========================================================
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Serve synchronized brand favicon for both /favicon.ico and /favicon.svg
        if path == "/favicon.ico":
            fav_path = BASE_DIR / "favicon.svg"
            if fav_path.exists():
                raw = fav_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(raw)
                return

        # Full-viewport standalone HTML model page (opened in separate tab!)
        # When ?preview=1 is passed (for showcase preview cards), inject a lightweight
        # "render-once & freeze" script so WebGL/Three.js scenes paint a crisp frame
        # and then pause rAF/intervals to keep GPU/CPU at 0% while scrolling.
        if path.startswith("/model/"):
            model_id = path.split("/model/", 1)[1].strip("/")
            qs = parse_qs(parsed.query)
            is_preview = qs.get("preview", ["0"])[0] == "1"
            is_capture = qs.get("capture", ["0"])[0] == "1"
            with LOCK:
                model = STORE.get_model_by_id(model_id)
            if not model:
                self.send_error(404, "Không tìm thấy mô hình tương tác.")
                return
            html_str = model.get("html") or ""
            inject_parts = []
            # Synchronize brand favicon into standalone 3D model tabs if not already defined
            if 'rel="icon"' not in html_str.lower() and "rel='icon'" not in html_str.lower():
                inject_parts.append('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
            if is_capture:
                inject_parts.append(
                    "<script>(function(){"
                    "var oGC=HTMLCanvasElement.prototype.getContext;"
                    "HTMLCanvasElement.prototype.getContext=function(t,a){"
                    "if(t==='webgl'||t==='webgl2'||t==='experimental-webgl'){"
                    "a=Object.assign({},a||{},{preserveDrawingBuffer:true,antialias:true});"
                    "}return oGC.call(this,t,a);};"
                    "})();</script>"
                )
            elif is_preview:
                inject_parts.append(
                    "<script>(function(){"
                    "var oGC=HTMLCanvasElement.prototype.getContext;"
                    "HTMLCanvasElement.prototype.getContext=function(t,a){"
                    "if(t==='webgl'||t==='webgl2'||t==='experimental-webgl'){"
                    "a=Object.assign({},a||{},{preserveDrawingBuffer:true,powerPreference:'low-power'});"
                    "}return oGC.call(this,t,a);};"
                    "var oRAF=window.requestAnimationFrame.bind(window);"
                    "var oSI=window.setInterval.bind(window);"
                    "var loadedAt=0,frames=0,frozen=false,timers=[];"
                    "function freezeNow(){if(frozen)return;frozen=true;"
                    "timers.forEach(function(id){clearInterval(id);});timers=[];"
                    "var s=document.createElement('style');"
                    "s.textContent='*,*::before,*::after{animation-play-state:paused!important;transition:none!important;}';"
                    "(document.head||document.documentElement).appendChild(s);}"
                    "window.addEventListener('load',function(){loadedAt=Date.now();setTimeout(freezeNow,2600);},{once:true});"
                    "window.requestAnimationFrame=function(cb){"
                    "if(frozen)return 0;"
                    "if(loadedAt>0){frames++;if(frames>=28&&(Date.now()-loadedAt)>=450){freezeNow();return 0;}}"
                    "return oRAF(cb);};"
                    "window.setInterval=function(fn,ms){if(frozen)return 0;var id=oSI(fn,ms);timers.push(id);return id;};"
                    "})();</script>"
                )
            if inject_parts:
                inject_block = "".join(inject_parts)
                if "<head>" in html_str:
                    html_str = html_str.replace("<head>", f"<head>{inject_block}", 1)
                elif "<HEAD>" in html_str:
                    html_str = html_str.replace("<HEAD>", f"<HEAD>{inject_block}", 1)
                else:
                    html_str = inject_block + html_str
            html_bytes = html_str.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(html_bytes)
            return

        # Classroom uploaded files (PDF handout inline viewer / image / video with Range support / download)
        if path.startswith("/file/"):
            file_id = path.split("/file/", 1)[1].strip("/")
            qs = parse_qs(parsed.query)
            force_dl = qs.get("download", ["0"])[0] == "1"
            with LOCK:
                meta, raw_bytes = STORE.get_file(file_id)
            if not meta or raw_bytes is None:
                self.send_error(404, "Không tìm thấy tệp đính kèm.")
                return
            fname = meta.get("fileName", "document")
            mime = meta.get("mimeType", "application/octet-stream")
            disp = "attachment" if force_dl else "inline"
            total_len = len(raw_bytes)
            range_hdr = self.headers.get("Range", "").strip()

            if not force_dl and range_hdr.startswith("bytes=") and total_len > 0:
                try:
                    spec = range_hdr[6:].split(",", 1)[0].strip()
                    start_s, end_s = spec.split("-", 1)
                    if start_s == "":
                        suffix = int(end_s)
                        start = max(0, total_len - suffix)
                        end = total_len - 1
                    else:
                        start = int(start_s)
                        end = int(end_s) if end_s else total_len - 1
                    end = min(end, total_len - 1)
                    if 0 <= start <= end:
                        chunk = raw_bytes[start : end + 1]
                        self.send_response(206)
                        self.send_header("Content-Type", mime)
                        self.send_header("Accept-Ranges", "bytes")
                        self.send_header("Content-Range", f"bytes {start}-{end}/{total_len}")
                        self.send_header("Content-Length", str(len(chunk)))
                        self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{quote(fname)}")
                        self.send_header("Cache-Control", "public, max-age=3600")
                        self.end_headers()
                        self.wfile.write(chunk)
                        return
                except Exception:
                    pass

            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(total_len))
            self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{quote(fname)}")
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(raw_bytes)
            return

        if not path.startswith("/api/"):
            if self.block_private_paths(path):
                return
            # Clean SPA routes (/lop-hoc, /mo-hinh, /mo-hinh/toan-11, etc.) -> serve index.html
            if (
                path == "/lop-hoc"
                or path.startswith("/lop-hoc/")
                or path == "/mo-hinh"
                or path.startswith("/mo-hinh/")
            ):
                idx_bytes = (BASE_DIR / "index.html").read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(idx_bytes)))
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                self.wfile.write(idx_bytes)
                return
            return super().do_GET()

        with LOCK:
            db = load_db()
            user, _ = self.get_auth_user(db)

            if path == "/api/health":
                return self.send_json(200, {
                    "ok": True,
                    "storage": STORE.mode,
                    "supabaseError": STORE.supabase_error,
                })

            if path == "/api/me":
                if not user:
                    return self.send_json(200, {"user": None})
                return self.send_json(200, {"user": public_user(user)})

            if path == "/api/models":
                qs = parse_qs(parsed.query)
                summary_only = qs.get("summary", ["0"])[0] == "1"
                all_models = STORE.list_models()
                if not user or user.get("role") != "admin":
                    all_models = [m for m in all_models if m.get("visible", True)]
                if summary_only:
                    all_models = [{k: v for k, v in m.items() if k != "html"} for m in all_models]
                return self.send_json(200, {"models": all_models})

            if path.startswith("/api/models/"):
                model_id = path.split("/api/models/", 1)[1].strip("/")
                model = STORE.get_model_by_id(model_id)
                if not model:
                    return self.send_json(404, {"error": "Không tìm thấy mô hình."})
                if (not user or user.get("role") != "admin") and not model.get("visible", True):
                    return self.send_json(404, {"error": "Không tìm thấy mô hình."})
                return self.send_json(200, {"model": model})

            if not user:
                return self.send_json(401, {"error": "Vui lòng đăng nhập để tiếp tục."})

            if path == "/api/admin/storage":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền xem dung lượng."})
                return self.send_json(200, STORE.get_storage_stats(db))

            if path == "/api/admin/overview":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền truy cập."})
                students = [public_user(u) for u in db["users"] if u["role"] == "student"]
                posts = sorted(
                    db.get("posts", []),
                    key=lambda p: (1 if p.get("pinned") else 0, p.get("createdAt", "")),
                    reverse=True,
                )
                return self.send_json(200, {
                    "user": public_user(user),
                    "storageMode": STORE.mode,
                    "storageError": STORE.supabase_error,
                    "exams": db["exams"],
                    "students": students,
                    "assignments": db["assignments"],
                    "submissions": db["submissions"],
                    "posts": posts,
                })

            if path == "/api/student/dashboard":
                exams_by_id = {e["id"]: e for e in db["exams"]}
                my_subs = [s for s in db["submissions"] if s["studentId"] == user["id"]]
                subs_by_asg: dict[str, list] = {}
                for s in my_subs:
                    subs_by_asg.setdefault(s["assignmentId"], []).append(s)

                assigned_list = []
                for asg in db["assignments"]:
                    is_mine = asg.get("assignAll") or (user["id"] in asg.get("studentIds", []))
                    if not is_mine:
                        continue
                    exam = exams_by_id.get(asg["examId"])
                    if not exam:
                        continue
                    asg_subs = sorted(subs_by_asg.get(asg["id"], []), key=lambda x: x["submittedAt"], reverse=True)
                    assigned_list.append({
                        **asg,
                        "assignmentType": asg.get("assignmentType", "homework"),
                        "openAt": asg.get("openAt", ""),
                        "allowRetake": False,
                        "isNotOpen": is_before_open(asg.get("openAt")),
                        "isExpired": is_past_due(asg.get("dueAt")),
                        "exam": exam,
                        "mySubmissions": asg_subs,
                    })

                stu_class = str(user.get("className", "")).strip().lower()
                visible_posts = [
                    p
                    for p in db.get("posts", [])
                    if p.get("targetAll", True)
                    or any(str(c).strip().lower() == stu_class for c in p.get("targetClasses", []))
                ]
                visible_posts.sort(
                    key=lambda p: (1 if p.get("pinned") else 0, p.get("createdAt", "")),
                    reverse=True,
                )

                return self.send_json(200, {
                    "user": public_user(user),
                    "assignments": assigned_list,
                    "submissions": sorted(my_subs, key=lambda x: x["submittedAt"], reverse=True),
                    "examsById": exams_by_id,
                    "posts": visible_posts,
                })

            return self.send_json(404, {"error": "API không tồn tại."})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self.send_error(404)

        try:
            body = self.read_body_json()
        except Exception as e:
            return self.send_json(400, {"error": f"Dữ liệu gửi lên không hợp lệ: {e}"})

        with LOCK:
            db = load_db()

            # Login
            if path == "/api/login":
                username = str(body.get("username", "")).strip().lower()
                password = str(body.get("password", ""))
                matched = next((u for u in db["users"] if u["username"].lower() == username), None)
                if not matched or not verify_password(password, matched["passwordHash"]):
                    return self.send_json(401, {"error": "Sai tên đăng nhập hoặc mật khẩu."})
                token = secrets.token_urlsafe(32)
                sessions = load_sessions()
                sessions[token] = matched["id"]
                save_sessions(sessions)
                return self.send_json(200, {"token": token, "user": public_user(matched)})

            user, token = self.get_auth_user(db)
            if path == "/api/logout":
                if token:
                    sessions = load_sessions()
                    sessions.pop(token, None)
                    save_sessions(sessions)
                return self.send_json(200, {"ok": True})

            if not user:
                return self.send_json(401, {"error": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."})

            # Change own password
            if path == "/api/change-password":
                current_pw = str(body.get("currentPassword", ""))
                new_pw = str(body.get("newPassword", ""))
                if not verify_password(current_pw, user["passwordHash"]):
                    return self.send_json(400, {"error": "Mật khẩu hiện tại không chính xác."})
                if len(new_pw) < 4:
                    return self.send_json(400, {"error": "Mật khẩu mới phải có ít nhất 4 ký tự."})
                user["passwordHash"] = hash_password(new_pw)
                save_db(db)
                return self.send_json(200, {"ok": True, "message": "Đổi mật khẩu thành công!"})

            # Student submits exam
            if path == "/api/student/submissions":
                asg_id = str(body.get("assignmentId", ""))
                asg = next((a for a in db["assignments"] if a["id"] == asg_id), None)
                if not asg:
                    return self.send_json(404, {"error": "Không tìm thấy bài tập được giao."})
                if user["role"] == "student":
                    is_mine = asg.get("assignAll") or (user["id"] in asg.get("studentIds", []))
                    if not is_mine:
                        return self.send_json(403, {"error": "Bạn không có trong danh sách được giao bài tập này."})
                    if is_before_open(asg.get("openAt")):
                        return self.send_json(400, {"error": "Chưa đến thời gian mở đề."})
                    if is_past_due(asg.get("dueAt")):
                        return self.send_json(400, {"error": "Bài tập đã quá hạn nộp."})
                    existing = [s for s in db["submissions"] if s["assignmentId"] == asg_id and s["studentId"] == user["id"]]
                    if existing and not asg.get("allowRetake", False):
                        return self.send_json(400, {"error": "Bạn đã nộp bài này rồi (không cho phép làm lại)."})

                sub = {
                    "id": gen_id("sub"),
                    "assignmentId": asg_id,
                    "assignmentTitle": asg["title"],
                    "examId": asg["examId"],
                    "studentId": user["id"],
                    "studentUsername": user["username"],
                    "studentName": user["fullName"],
                    "studentClass": user.get("className", ""),
                    "studentCode": user.get("studentCode", ""),
                    "answers": body.get("answers", {"part1": {}, "part2": {}, "part3": {}}),
                    "result": body.get("result", {}),
                    "examSnapshot": body.get("examSnapshot"),
                    "elapsedSeconds": int(body.get("elapsedSeconds", 0)),
                    "submittedAt": now_iso(),
                }
                db["submissions"].insert(0, sub)
                save_db(db)
                return self.send_json(201, {"submission": sub})

            # Admin-only POST routes
            if user["role"] != "admin":
                return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền thực hiện."})

            # Parse Exam from LaTeX (ex_test), Word (.docx), or PDF text
            if path == "/api/admin/parse-exam":
                fmt = str(body.get("format", "latex")).lower().strip()
                filename = str(body.get("filename", "")).strip()
                try:
                    if fmt == "latex":
                        result = parse_extest_latex(str(body.get("content", "")), filename=filename)
                    elif fmt == "docx":
                        b64 = str(body.get("base64Data", ""))
                        if not b64:
                            raise ValueError("Thiếu dữ liệu file Word (.docx).")
                        raw_bytes = base64.b64decode(b64)
                        result = parse_docx_bytes(raw_bytes, filename=filename)
                    elif fmt == "pdf_text":
                        result = parse_structured_exam_text(
                            str(body.get("content", "")), filename=filename, source_format="pdf"
                        )
                    else:
                        raise ValueError(f"Định dạng không được hỗ trợ: {fmt}")
                    return self.send_json(200, result)
                except ValueError as ve:
                    return self.send_json(400, {"error": str(ve)})
                except Exception as exc:
                    return self.send_json(400, {"error": f"Không thể phân tích đề thi: {exc}"})

            # Create / Import Exams
            if path == "/api/admin/exams":
                items = body if isinstance(body, list) else [body]
                created = []
                for item in items:
                    exam = {
                        "id": str(item.get("id") or gen_id("exam")),
                        "title": str(item.get("title", "Đề thi mới")).strip() or "Đề thi mới",
                        "subject": str(item.get("subject", "Toán học 12")).strip(),
                        "code": str(item.get("code", "MĐ 01")).strip(),
                        "durationMinutes": max(1, int(item.get("durationMinutes", 45))),
                        "description": str(item.get("description", "")).strip(),
                        "isBuiltin": False,
                        "scoring": item.get("scoring") or {
                            "part1PerQuestion": 0.25,
                            "part2Progressive": [0, 0.1, 0.25, 0.5, 1.0],
                            "part3PerQuestion": 0.5,
                        },
                        "part1": item.get("part1", []),
                        "part2": item.get("part2", []),
                        "part3": item.get("part3", []),
                        "updatedAt": now_iso(),
                    }
                    # Ensure unique id
                    if any(e["id"] == exam["id"] for e in db["exams"]):
                        exam["id"] = gen_id("exam")
                    db["exams"].insert(0, exam)
                    created.append(exam)
                save_db(db)
                return self.send_json(201, {"exams": created})

            # Create Student Account
            if path == "/api/admin/students":
                username = str(body.get("username", "")).strip().lower()
                password = str(body.get("password", "")).strip() or "123456"
                full_name = str(body.get("fullName", "")).strip()
                if not username or len(username) < 3:
                    return self.send_json(400, {"error": "Tên đăng nhập phải có ít nhất 3 ký tự."})
                if len(password) < 4:
                    return self.send_json(400, {"error": "Mật khẩu khởi tạo phải có ít nhất 4 ký tự."})
                if not full_name:
                    return self.send_json(400, {"error": "Vui lòng nhập họ tên học sinh."})
                if any(u["username"].lower() == username for u in db["users"]):
                    return self.send_json(409, {"error": f"Tên đăng nhập '{username}' đã tồn tại."})

                new_student = {
                    "id": gen_id("u"),
                    "username": username,
                    "passwordHash": hash_password(password),
                    "role": "student",
                    "fullName": full_name,
                    "className": str(body.get("className", "")).strip(),
                    "studentCode": str(body.get("studentCode", "")).strip(),
                    "email": str(body.get("email", "")).strip(),
                    "phone": str(body.get("phone", "")).strip(),
                    "dob": str(body.get("dob", "")).strip(),
                    "createdAt": now_iso(),
                }
                db["users"].append(new_student)
                save_db(db)
                return self.send_json(201, {"student": public_user(new_student)})

            # Create Assignment
            if path == "/api/admin/assignments":
                exam_id = str(body.get("examId", ""))
                exam = next((e for e in db["exams"] if e["id"] == exam_id), None)
                if not exam:
                    return self.send_json(404, {"error": "Đề thi được chọn không tồn tại."})
                assign_all = bool(body.get("assignAll", False))
                student_ids = list(body.get("studentIds", []))
                if not assign_all and len(student_ids) == 0:
                    return self.send_json(400, {"error": "Vui lòng chọn ít nhất 1 học sinh hoặc chọn 'Giao tất cả học sinh'."})

                asg_type = "test" if str(body.get("assignmentType", "homework")) == "test" else "homework"
                open_at = str(body.get("openAt", "")).strip()
                due_at = str(body.get("dueAt", "")).strip()
                if asg_type == "test" and not open_at:
                    return self.send_json(400, {"error": "Bài kiểm tra bắt buộc phải có thời gian mở đề."})
                if not due_at:
                    return self.send_json(400, {"error": "Vui lòng thiết lập thời gian nộp bài."})
                if open_at and due_at:
                    try:
                        if datetime.fromisoformat(due_at) <= datetime.fromisoformat(open_at):
                            return self.send_json(400, {"error": "Thời gian nộp bài phải sau thời gian mở đề."})
                    except Exception:
                        pass

                timed_mode = True if asg_type == "test" else bool(body.get("timedMode", False))
                dur_mins = max(1, int(body.get("durationMinutes") or exam.get("durationMinutes") or 45))

                asg = {
                    "id": gen_id("asg"),
                    "examId": exam_id,
                    "assignmentType": asg_type,
                    "title": str(body.get("title", "")).strip() or exam["title"],
                    "note": str(body.get("note", "")).strip(),
                    "openAt": open_at,
                    "dueAt": due_at,
                    "assignAll": assign_all,
                    "studentIds": student_ids,
                    "shuffle": bool(body.get("shuffle", False)),
                    "timedMode": timed_mode,
                    "durationMinutes": dur_mins if timed_mode else None,
                    "allowRetake": False,
                    "createdAt": now_iso(),
                }
                db["assignments"].insert(0, asg)
                save_db(db, keys=["assignments"])
                return self.send_json(201, {"assignment": asg})

            # Upload HTML Model (Admin)
            if path == "/api/models":
                name = str(body.get("name", "Mô hình HTML")).strip()
                file_name = str(body.get("fileName", "model.html")).strip()
                html_content = str(body.get("html", ""))
                if not html_content.strip():
                    return self.send_json(400, {"error": "Nội dung file HTML rỗng."})
                model_id = gen_id("html")
                meta = {
                    "id": model_id,
                    "name": name,
                    "fileName": file_name,
                    "grade": str(body.get("grade", "12")),
                    "chapterId": str(body.get("chapterId", "12-c1")),
                    "lessonId": str(body.get("lessonId", "12-b4")),
                    "visible": bool(body.get("visible", True)),
                    "thumbnail": str(body.get("thumbnail", "")),
                    "addedAt": datetime.now().strftime("%d/%m/%Y"),
                    "isBuiltin": False,
                }
                try:
                    saved_model = STORE.add_model(meta, html_content)
                except Exception as e:
                    return self.send_json(500, {"error": f"Lỗi lưu mô hình lên máy chủ: {e}"})
                return self.send_json(201, {"model": saved_model})

            # Upload Classroom Attachment File (PDF handout, image, doc...)
            if path == "/api/admin/files":
                fname = str(body.get("fileName", "document.pdf")).strip()
                mime = str(body.get("mimeType", "application/octet-stream")).strip()
                b64 = str(body.get("base64Data", ""))
                if not b64:
                    return self.send_json(400, {"error": "Thiếu dữ liệu tệp tải lên."})
                try:
                    raw_bytes = base64.b64decode(b64)
                except Exception:
                    return self.send_json(400, {"error": "Dữ liệu tệp không hợp lệ."})
                if len(raw_bytes) > 20 * 1024 * 1024:
                    return self.send_json(400, {"error": "Kích thước tệp vượt quá giới hạn 20MB."})
                fid = gen_id("file")
                meta = {
                    "id": fid,
                    "fileName": fname,
                    "mimeType": mime,
                    "size": len(raw_bytes),
                    "url": f"/file/{fid}",
                    "uploadedAt": now_iso(),
                }
                try:
                    STORE.add_file(meta, raw_bytes)
                except Exception as e:
                    return self.send_json(500, {"error": f"Lỗi lưu tệp đính kèm lên máy chủ: {e}"})
                return self.send_json(201, {"file": meta})

            # Cleanup orphan uploaded files not referenced by any post (Admin)
            if path == "/api/admin/storage/cleanup-orphans":
                used_ids = set()
                for p in db.get("posts", []):
                    for att in p.get("attachments", []):
                        if att.get("fileId"):
                            used_ids.add(att["fileId"])
                orphan_ids = [f["id"] for f in db.get("files", []) if f["id"] not in used_ids]
                for fid in orphan_ids:
                    STORE.delete_file(fid)
                return self.send_json(200, {"removedCount": len(orphan_ids), "stats": STORE.get_storage_stats(db)})

            # Create Classroom Newsfeed Post (Admin)
            if path == "/api/admin/posts":
                title = str(body.get("title", "")).strip()
                content = str(body.get("content", "")).strip()
                attachments = body.get("attachments", [])
                if not title and not content and not attachments:
                    return self.send_json(400, {"error": "Vui lòng nhập nội dung hoặc đính kèm ít nhất 1 tài liệu/video."})
                post = {
                    "id": gen_id("post"),
                    "title": title,
                    "content": content,
                    "authorName": user.get("fullName", "Lê Viết Hoàng"),
                    "targetAll": bool(body.get("targetAll", True)),
                    "targetClasses": list(body.get("targetClasses", [])),
                    "pinned": bool(body.get("pinned", False)),
                    "attachments": attachments if isinstance(attachments, list) else [],
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db.setdefault("posts", []).insert(0, post)
                save_db(db, keys=["posts"])
                return self.send_json(201, {"post": post})

            return self.send_json(404, {"error": "API không tồn tại."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self.send_error(404)

        try:
            body = self.read_body_json()
        except Exception as e:
            return self.send_json(400, {"error": f"Dữ liệu gửi lên không hợp lệ: {e}"})

        with LOCK:
            db = load_db()
            user, _ = self.get_auth_user(db)
            if not user:
                return self.send_json(401, {"error": "Vui lòng đăng nhập."})

            # Self profile update (Student or Admin)
            if path == "/api/profile":
                full_name = str(body.get("fullName", "")).strip()
                if not full_name:
                    return self.send_json(400, {"error": "Họ và tên không được để trống."})
                user["fullName"] = full_name
                # Students are NOT permitted to change their className or studentCode
                if user.get("role") == "admin":
                    user["className"] = str(body.get("className", user.get("className", ""))).strip()
                    user["studentCode"] = str(body.get("studentCode", user.get("studentCode", ""))).strip()
                user["email"] = str(body.get("email", user.get("email", ""))).strip()
                user["phone"] = str(body.get("phone", user.get("phone", ""))).strip()
                user["dob"] = str(body.get("dob", user.get("dob", ""))).strip()
                # Also refresh display name on past submissions for consistency
                for s in db["submissions"]:
                    if s["studentId"] == user["id"]:
                        s["studentName"] = user["fullName"]
                        s["studentClass"] = user["className"]
                save_db(db)
                return self.send_json(200, {"user": public_user(user)})

            # Admin-only PUT routes
            if user["role"] != "admin":
                return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền chỉnh sửa."})

            # Update Exam
            if path.startswith("/api/admin/exams/"):
                exam_id = path.split("/api/admin/exams/", 1)[1]
                idx = next((i for i, e in enumerate(db["exams"]) if e["id"] == exam_id), None)
                if idx is None:
                    return self.send_json(404, {"error": "Không tìm thấy đề thi."})
                existing = db["exams"][idx]
                updated = {
                    **existing,
                    "title": str(body.get("title", existing["title"])).strip() or existing["title"],
                    "subject": str(body.get("subject", existing.get("subject", ""))).strip(),
                    "code": str(body.get("code", existing.get("code", ""))).strip(),
                    "durationMinutes": max(1, int(body.get("durationMinutes", existing.get("durationMinutes", 45)))),
                    "description": str(body.get("description", existing.get("description", ""))).strip(),
                    "scoring": body.get("scoring", existing.get("scoring")),
                    "part1": body.get("part1", existing.get("part1", [])),
                    "part2": body.get("part2", existing.get("part2", [])),
                    "part3": body.get("part3", existing.get("part3", [])),
                    "updatedAt": now_iso(),
                }
                db["exams"][idx] = updated
                save_db(db)
                return self.send_json(200, {"exam": updated})

            # Update Student Account (including optional password reset)
            if path.startswith("/api/admin/students/"):
                stu_id = path.split("/api/admin/students/", 1)[1]
                stu = next((u for u in db["users"] if u["id"] == stu_id and u["role"] == "student"), None)
                if not stu:
                    return self.send_json(404, {"error": "Không tìm thấy học sinh."})
                full_name = str(body.get("fullName", stu["fullName"])).strip()
                if not full_name:
                    return self.send_json(400, {"error": "Họ và tên không được để trống."})
                stu["fullName"] = full_name
                stu["className"] = str(body.get("className", stu.get("className", ""))).strip()
                stu["studentCode"] = str(body.get("studentCode", stu.get("studentCode", ""))).strip()
                stu["email"] = str(body.get("email", stu.get("email", ""))).strip()
                stu["phone"] = str(body.get("phone", stu.get("phone", ""))).strip()
                stu["dob"] = str(body.get("dob", stu.get("dob", ""))).strip()
                new_pw = str(body.get("newPassword", "")).strip()
                if new_pw:
                    if len(new_pw) < 4:
                        return self.send_json(400, {"error": "Mật khẩu mới phải có ít nhất 4 ký tự."})
                    stu["passwordHash"] = hash_password(new_pw)
                save_db(db)
                return self.send_json(200, {"student": public_user(stu)})

            # Update Assignment
            if path.startswith("/api/admin/assignments/"):
                asg_id = path.split("/api/admin/assignments/", 1)[1]
                asg = next((a for a in db["assignments"] if a["id"] == asg_id), None)
                if not asg:
                    return self.send_json(404, {"error": "Không tìm thấy đợt giao bài."})
                asg_type = "test" if str(body.get("assignmentType", asg.get("assignmentType", "homework"))) == "test" else "homework"
                open_at = str(body.get("openAt", asg.get("openAt", ""))).strip()
                due_at = str(body.get("dueAt", asg["dueAt"])).strip()
                if asg_type == "test" and not open_at:
                    return self.send_json(400, {"error": "Bài kiểm tra bắt buộc phải có thời gian mở đề."})
                if not due_at:
                    return self.send_json(400, {"error": "Vui lòng thiết lập thời gian nộp bài."})
                if open_at and due_at:
                    try:
                        if datetime.fromisoformat(due_at) <= datetime.fromisoformat(open_at):
                            return self.send_json(400, {"error": "Thời gian nộp bài phải sau thời gian mở đề."})
                    except Exception:
                        pass
                timed_mode = True if asg_type == "test" else bool(body.get("timedMode", asg.get("timedMode", False)))
                dur_mins = max(1, int(body.get("durationMinutes") or asg.get("durationMinutes") or 45))

                asg["assignmentType"] = asg_type
                asg["title"] = str(body.get("title", asg["title"])).strip() or asg["title"]
                asg["note"] = str(body.get("note", asg.get("note", ""))).strip()
                asg["openAt"] = open_at
                asg["dueAt"] = due_at
                asg["assignAll"] = bool(body.get("assignAll", asg.get("assignAll", False)))
                asg["studentIds"] = list(body.get("studentIds", asg.get("studentIds", [])))
                asg["shuffle"] = bool(body.get("shuffle", asg.get("shuffle", False)))
                asg["timedMode"] = timed_mode
                asg["durationMinutes"] = dur_mins if timed_mode else None
                asg["allowRetake"] = False
                save_db(db, keys=["assignments"])
                return self.send_json(200, {"assignment": asg})

            # Update Classroom Newsfeed Post (Admin)
            if path.startswith("/api/admin/posts/"):
                post_id = path.split("/api/admin/posts/", 1)[1]
                post = next((p for p in db.get("posts", []) if p["id"] == post_id), None)
                if not post:
                    return self.send_json(404, {"error": "Không tìm thấy bài viết."})
                if "title" in body:
                    post["title"] = str(body["title"]).strip()
                if "content" in body:
                    post["content"] = str(body["content"]).strip()
                if "targetAll" in body:
                    post["targetAll"] = bool(body["targetAll"])
                if "targetClasses" in body:
                    post["targetClasses"] = list(body["targetClasses"])
                if "pinned" in body:
                    post["pinned"] = bool(body["pinned"])
                if "attachments" in body and isinstance(body["attachments"], list):
                    post["attachments"] = body["attachments"]
                post["updatedAt"] = now_iso()
                save_db(db, keys=["posts"])
                return self.send_json(200, {"post": post})

            # Update HTML Model metadata / visibility / file (Admin)
            if path.startswith("/api/models/"):
                model_id = path.split("/api/models/", 1)[1]
                updated = STORE.update_model(model_id, body)
                if not updated:
                    return self.send_json(404, {"error": "Không tìm thấy mô hình."})
                return self.send_json(200, {"model": updated})

            return self.send_json(404, {"error": "API không tồn tại."})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return self.send_error(404)

        with LOCK:
            db = load_db()
            user, _ = self.get_auth_user(db)
            if not user:
                return self.send_json(401, {"error": "Vui lòng đăng nhập."})
            if user["role"] != "admin":
                return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền xóa."})

            if path.startswith("/api/admin/exams/"):
                exam_id = path.split("/api/admin/exams/", 1)[1]
                db["exams"] = [e for e in db["exams"] if e["id"] != exam_id]
                db["assignments"] = [a for a in db["assignments"] if a["examId"] != exam_id]
                save_db(db)
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/students/"):
                stu_id = path.split("/api/admin/students/", 1)[1]
                db["users"] = [u for u in db["users"] if not (u["id"] == stu_id and u["role"] == "student")]
                for a in db["assignments"]:
                    a["studentIds"] = [sid for sid in a.get("studentIds", []) if sid != stu_id]
                save_db(db)
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/assignments/"):
                asg_id = path.split("/api/admin/assignments/", 1)[1]
                db["assignments"] = [a for a in db["assignments"] if a["id"] != asg_id]
                save_db(db)
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/posts/"):
                post_id = path.split("/api/admin/posts/", 1)[1]
                target = next((p for p in db.get("posts", []) if p["id"] == post_id), None)
                if target:
                    for att in target.get("attachments", []):
                        if att.get("fileId"):
                            STORE.delete_file(att["fileId"])
                db["posts"] = [p for p in db.get("posts", []) if p["id"] != post_id]
                save_db(db, keys=["posts"])
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/files/"):
                file_id = path.split("/api/admin/files/", 1)[1]
                STORE.delete_file(file_id)
                posts_changed = False
                for p in db.get("posts", []):
                    orig_len = len(p.get("attachments", []))
                    if orig_len:
                        p["attachments"] = [a for a in p["attachments"] if a.get("fileId") != file_id]
                        if len(p["attachments"]) != orig_len:
                            posts_changed = True
                if posts_changed:
                    save_db(db, keys=["posts"])
                return self.send_json(200, {"ok": True, "stats": STORE.get_storage_stats(db)})

            if path.startswith("/api/models/"):
                model_id = path.split("/api/models/", 1)[1]
                STORE.delete_model(model_id)
                return self.send_json(200, {"ok": True})

            return self.send_json(404, {"error": "API không tồn tại."})


def main():
    default_port = int(os.environ.get("PORT", "8085"))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else default_port
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", port), EduLabHandler)
    print(f"Lớp toán thầy Hoàng Server running at http://localhost:{port} (storage: {STORE.mode})")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
