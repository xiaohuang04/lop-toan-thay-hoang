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
import re
import secrets
import sys
import threading
import time
import urllib.request
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from curriculum_data import build_builtin_curriculum_plans
from gemini_pdf import (
    DEFAULT_GEMINI_MODEL,
    GeminiPdfError,
    parse_pdf_with_gemini,
    resolve_gemini_config,
    test_gemini_connection,
)
from live_game_engine import LiveGameEngine
from parsers import parse_docx_bytes, parse_extest_latex, parse_presentation_source, parse_structured_exam_text
from storage import StorageBackend

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SEED_EXAMS_FILE = DATA_DIR / "seed_exams.json"

LOCK = threading.Lock()
LIVE_GAME = LiveGameEngine(
    data_dir=DATA_DIR,
    static_dir=BASE_DIR / "live-game",
    standalone=False,
)


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
        "teaching_log": build_default_teaching_log(),
    }


def build_default_teaching_log() -> dict:
    """Seed teaching log with the built-in official annual curriculum plans for Grades 10, 11, 12
    (105 regular periods + 35 Chuyên đề periods per grade) and a ready-to-use HK I semester."""
    return {
        "demoVersion": 3,
        "curriculumVersion": 1,
        "activeSemesterId": "sem-demo-hk1",
        "semesters": [
            {
                "id": "sem-demo-hk1",
                "name": "Học kì I — Năm học 2026–2027",
                "termNumber": 1,
                "session": "sang",
                "startWeek": 1,
                "startDate": "2026-09-07",
                "totalWeeks": 18,
                "classes": [
                    {"id": "cls-10a1", "name": "10A1", "grade": "10"},
                    {"id": "cls-10a2", "name": "10A2", "grade": "10"},
                ],
                "timetables": [
                    {
                        "id": "tkb-1",
                        "name": "TKB 1",
                        "fromWeek": 1,
                        "slots": [
                            # 10A1 (Buổi Sáng): 4 tiết/tuần (tự động 3 Chính khóa + 1 CĐ)
                            {"dayOfWeek": 1, "session": "sang", "period": 1, "classId": "cls-10a1"},
                            {"dayOfWeek": 1, "session": "sang", "period": 2, "classId": "cls-10a1"},
                            {"dayOfWeek": 3, "session": "sang", "period": 3, "classId": "cls-10a1"},
                            {"dayOfWeek": 5, "session": "sang", "period": 1, "classId": "cls-10a1"},
                            # 10A2 (Buổi Sáng): 4 tiết/tuần (tự động 3 Chính khóa + 1 CĐ)
                            {"dayOfWeek": 1, "session": "sang", "period": 3, "classId": "cls-10a2"},
                            {"dayOfWeek": 1, "session": "sang", "period": 4, "classId": "cls-10a2"},
                            {"dayOfWeek": 3, "session": "sang", "period": 1, "classId": "cls-10a2"},
                            {"dayOfWeek": 3, "session": "sang", "period": 2, "classId": "cls-10a2"},
                        ],
                    }
                ],
                "timetable": [
                    {"dayOfWeek": 1, "session": "sang", "period": 1, "classId": "cls-10a1"},
                    {"dayOfWeek": 1, "session": "sang", "period": 2, "classId": "cls-10a1"},
                    {"dayOfWeek": 3, "session": "sang", "period": 3, "classId": "cls-10a1"},
                    {"dayOfWeek": 5, "session": "sang", "period": 1, "classId": "cls-10a1"},
                    {"dayOfWeek": 1, "session": "sang", "period": 3, "classId": "cls-10a2"},
                    {"dayOfWeek": 1, "session": "sang", "period": 4, "classId": "cls-10a2"},
                    {"dayOfWeek": 3, "session": "sang", "period": 1, "classId": "cls-10a2"},
                    {"dayOfWeek": 3, "session": "sang", "period": 2, "classId": "cls-10a2"},
                ],
                "holidays": [],
                "swaps": [],
                "saturdayMidterms": [],
                "actualPlans": {
                    "grade:10": {
                        "regularPerWeek": 3,
                        "extraPerWeek": 1,
                        "cells": {},
                    }
                },
            }
        ],
        "curriculumPlans": build_builtin_curriculum_plans(),
    }


def ensure_teaching_log(db: dict) -> dict:
    tl = db.get("teaching_log")
    if not isinstance(tl, dict) or not tl.get("semesters"):
        tl = build_default_teaching_log()
        db["teaching_log"] = tl
        save_db(db, keys=["teaching_log"])
        return tl
    changed = False
    # Seed/upgrade official built-in Grade 10-12 curriculum plans into program state
    if tl.get("curriculumVersion", 0) < 1:
        if (
            tl.get("demoVersion", 1) < 3
            and len(tl.get("semesters", [])) == 1
            and tl["semesters"][0].get("id") == "sem-demo-hk1"
        ):
            tl = build_default_teaching_log()
            db["teaching_log"] = tl
        else:
            tl["curriculumPlans"] = build_builtin_curriculum_plans()
            tl["curriculumVersion"] = 1
        changed = True
    if changed:
        save_db(db, keys=["teaching_log"])
    return tl


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


VALID_MODEL_VISIBILITY_MODES = ("admin_only", "own_grade", "all_grades")


def get_models_visibility_mode(db: dict) -> str:
    settings = db.get("settings")
    if isinstance(settings, dict):
        mode = str(settings.get("modelsVisibilityMode", "")).strip()
        if mode in VALID_MODEL_VISIBILITY_MODES:
            return mode
    return "all_grades"


def extract_student_grade(user: dict | None) -> str | None:
    if not user:
        return None
    cls_name = str(user.get("className", "")).strip()
    m = re.search(r"(10|11|12)", cls_name)
    return m.group(1) if m else None


def build_default_gradebook() -> dict:
    """School Gradebook (Sổ điểm — Admin only, synced with school classes from Sổ báo giảng)."""
    return {
        "classes": {},
    }


def ensure_gradebook(db: dict) -> dict:
    gb = db.get("gradebook")
    if not isinstance(gb, dict):
        gb = build_default_gradebook()
        db["gradebook"] = gb
        return gb
    if not isinstance(gb.get("classes"), dict):
        gb["classes"] = {}
    return gb


def get_school_classes_from_teaching_log(db: dict) -> tuple[list[dict], str, int]:
    tl = ensure_teaching_log(db)
    sems = tl.get("semesters") if isinstance(tl.get("semesters"), list) else []
    active_id = tl.get("activeSemesterId")
    active_sem = next((s for s in sems if s.get("id") == active_id), None) or (sems[0] if sems else None)
    seen = set()
    classes_out: list[dict] = []
    if active_sem and isinstance(active_sem.get("classes"), list):
        for c in active_sem["classes"]:
            name = str(c.get("name", "")).strip()
            if name and name not in seen:
                seen.add(name)
                classes_out.append({"id": c.get("id", name), "name": name, "grade": str(c.get("grade", ""))})
    # Also include any other semester's classes if not already present
    for s in sems:
        if s is active_sem:
            continue
        for c in s.get("classes") or []:
            name = str(c.get("name", "")).strip()
            if name and name not in seen:
                seen.add(name)
                classes_out.append({"id": c.get("id", name), "name": name, "grade": str(c.get("grade", ""))})
    sem_name = str(active_sem.get("name", "")) if active_sem else ""
    sem_term = 2 if (active_sem and int(active_sem.get("termNumber", 1) or 1) == 2) else 1
    return classes_out, sem_name, sem_term


def build_default_analytics() -> dict:
    """Student engagement analytics: logins and interactive HTML model clicks."""
    return {
        "studentTotals": {},
        "modelTotals": {},
        "events": [],
    }


def ensure_analytics(db: dict) -> dict:
    an = db.get("analytics")
    if not isinstance(an, dict):
        an = build_default_analytics()
        db["analytics"] = an
        return an
    if not isinstance(an.get("studentTotals"), dict):
        an["studentTotals"] = {}
    if not isinstance(an.get("modelTotals"), dict):
        an["modelTotals"] = {}
    if not isinstance(an.get("events"), list):
        an["events"] = []
    return an


def record_student_login(db: dict, user: dict) -> None:
    if not user or user.get("role") != "student":
        return
    an = ensure_analytics(db)
    uid = str(user.get("id", ""))
    if not uid:
        return
    ts = now_iso()
    st = an["studentTotals"].setdefault(
        uid,
        {"logins": 0, "modelClicks": 0, "lastLoginAt": "", "lastModelClickAt": "", "models": {}},
    )
    st["logins"] = int(st.get("logins", 0) or 0) + 1
    st["lastLoginAt"] = ts
    an["events"].append({"type": "login", "studentId": uid, "at": ts})
    if len(an["events"]) > 2500:
        an["events"] = an["events"][-2500:]
    save_db(db, keys=["analytics"])


def record_student_model_click(db: dict, user: dict, model: dict) -> None:
    if not user or user.get("role") != "student" or not model:
        return
    an = ensure_analytics(db)
    uid = str(user.get("id", ""))
    mid = str(model.get("id", ""))
    if not uid or not mid:
        return
    ts = now_iso()
    m_name = str(model.get("name", "")).strip()
    m_grade = str(model.get("grade", "")).strip()

    st = an["studentTotals"].setdefault(
        uid,
        {"logins": 0, "modelClicks": 0, "lastLoginAt": "", "lastModelClickAt": "", "models": {}},
    )
    if not isinstance(st.get("models"), dict):
        st["models"] = {}
    st["modelClicks"] = int(st.get("modelClicks", 0) or 0) + 1
    st["lastModelClickAt"] = ts
    st["models"][mid] = int(st["models"].get(mid, 0) or 0) + 1

    mt = an["modelTotals"].setdefault(
        mid,
        {"clicks": 0, "lastClickAt": "", "students": {}, "name": m_name, "grade": m_grade},
    )
    if not isinstance(mt.get("students"), dict):
        mt["students"] = {}
    mt["clicks"] = int(mt.get("clicks", 0) or 0) + 1
    mt["lastClickAt"] = ts
    mt["name"] = m_name or mt.get("name", "")
    mt["grade"] = m_grade or mt.get("grade", "")
    mt["students"][uid] = int(mt["students"].get(uid, 0) or 0) + 1

    an["events"].append({
        "type": "model_click",
        "studentId": uid,
        "modelId": mid,
        "modelName": m_name,
        "grade": m_grade,
        "at": ts,
    })
    if len(an["events"]) > 2500:
        an["events"] = an["events"][-2500:]
    save_db(db, keys=["analytics"])


def build_default_tuition() -> dict:
    """Default tuition structure supporting class-level effective rate history,
    one-click monthly adjustments, per-student prorated overrides, and payment logs."""
    return {
        "defaultRates": [
            {"id": "rate-default-1", "fromMonth": "2026-09", "amount": 300000, "note": "Mức định mức chung"},
        ],
        "classRateHistory": {},
        "monthAdjustments": {},
        "studentOverrides": {},
        "payments": {},
    }


def ensure_tuition(db: dict) -> dict:
    t = db.get("tuition")
    if not isinstance(t, dict) or "payments" not in t:
        t = build_default_tuition()
        db["tuition"] = t
        save_db(db, keys=["tuition"])
        return t
    changed = False
    if not isinstance(t.get("defaultRates"), list) or len(t["defaultRates"]) == 0:
        t["defaultRates"] = build_default_tuition()["defaultRates"]
        changed = True
    for k in ("classRateHistory", "monthAdjustments", "studentOverrides", "payments"):
        if not isinstance(t.get(k), dict):
            t[k] = {}
            changed = True
    if "bankQr" in t:
        t.pop("bankQr", None)
        changed = True
    if changed:
        save_db(db, keys=["tuition"])
    return t


def _vn_month_label(month_key: str) -> str:
    m = re.match(r"^(\d{4})-(\d{2})$", str(month_key or ""))
    if not m:
        return str(month_key or "")
    mm = int(m.group(2))
    mm_str = f"0{mm}" if mm in (1, 2) else str(mm)
    return f"Tháng {mm_str}/{m.group(1)}"


def _iter_months(start_month: str, end_month: str) -> list[str]:
    ms = re.match(r"^(\d{4})-(\d{2})$", str(start_month or ""))
    me = re.match(r"^(\d{4})-(\d{2})$", str(end_month or ""))
    if not ms or not me:
        return [end_month] if me else []
    sy, sm = int(ms.group(1)), int(ms.group(2))
    ey, em = int(me.group(1)), int(me.group(2))
    if (sy, sm) > (ey, em):
        return []
    out: list[str] = []
    y, m = sy, sm
    guard = 0
    while (y, m) <= (ey, em) and guard < 48:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
        guard += 1
    return out


def _compute_raw_month_fee(student: dict, tuition: dict, month_key: str) -> dict:
    cls = str(student.get("className", "")).strip()
    stu_id = str(student.get("id", ""))

    # 1. Resolve standard rate from classRateHistory[cls] or defaultRates (latest fromMonth <= month_key)
    class_hist = tuition.get("classRateHistory", {}).get(cls) if cls else None
    rate_list = class_hist if isinstance(class_hist, list) and len(class_hist) > 0 else tuition.get("defaultRates", [])
    sorted_rates = sorted(
        [r for r in rate_list if isinstance(r, dict) and r.get("fromMonth")],
        key=lambda r: str(r.get("fromMonth", "")),
    )
    picked_rate = None
    for r in sorted_rates:
        if str(r.get("fromMonth", "")) <= month_key:
            picked_rate = r
    if picked_rate is None and sorted_rates:
        picked_rate = sorted_rates[0]

    base_amount = max(0, int(picked_rate.get("amount", 0))) if picked_rate else 0
    month_fee = base_amount
    source = "default"
    adj_note = ""

    # 2. Apply monthly class/global adjustment
    m_adjs = tuition.get("monthAdjustments", {}).get(month_key)
    if isinstance(m_adjs, dict):
        adj = (m_adjs.get(cls) if cls else None) or m_adjs.get("__all__")
        if isinstance(adj, dict):
            mode = str(adj.get("mode", "set"))
            val = int(adj.get("value", 0) or 0)
            if mode == "delta":
                month_fee = max(0, base_amount + val)
            else:
                month_fee = max(0, val)
            source = "adjusted"
            adj_note = str(adj.get("note", "")).strip()

    # 3. Apply per-student override (highest priority)
    ov_key = f"{stu_id}|{month_key}"
    ov = tuition.get("studentOverrides", {}).get(ov_key)
    if isinstance(ov, dict) and ov.get("amount") is not None:
        month_fee = max(0, int(ov.get("amount", 0)))
        source = "custom"
        adj_note = str(ov.get("note", "")).strip()

    return {
        "baseAmount": base_amount,
        "monthFee": month_fee,
        "source": source,
        "adjustmentNote": adj_note,
    }


def compute_student_month_tuition(student: dict, tuition: dict, month_key: str) -> dict:
    stu_id = str(student.get("id", ""))
    start_date = str(student.get("startDate") or student.get("createdAt") or "")[:10]
    start_month = start_date[:7] if re.match(r"^\d{4}-\d{2}", start_date) else ""

    not_enrolled = bool(start_month and month_key < start_month)
    if not_enrolled:
        return {
            "monthKey": month_key,
            "monthLabel": _vn_month_label(month_key),
            "notEnrolled": True,
            "startDate": start_date,
            "baseAmount": 0,
            "monthFee": 0,
            "carryFromPrev": 0,
            "carryFromMonth": "",
            "carryFromMonthLabel": "",
            "amount": 0,
            "source": "default",
            "adjustmentNote": "",
            "paid": False,
            "paidAt": "",
            "paidAmount": 0,
            "balanceDiff": 0,
            "method": "",
            "note": "",
        }

    # Walk consecutively from start_month up to month_key so overpayment/underpayment
    # automatically carries into the following month.
    chain_start = start_month if (start_month and start_month <= month_key) else month_key
    months_chain = _iter_months(chain_start, month_key) or [month_key]
    payments_map = tuition.get("payments", {}) if isinstance(tuition.get("payments"), dict) else {}

    prev_balance = 0  # > 0 means overpaid (credit next month); < 0 means underpaid (add to next month)
    prev_month_key = ""
    result = None

    for mk in months_chain:
        raw = _compute_raw_month_fee(student, tuition, mk)
        carry_from_prev = prev_balance
        carry_from_month = prev_month_key if carry_from_prev != 0 else ""
        raw_due = raw["monthFee"] - carry_from_prev
        amount = max(0, raw_due)

        ov_key = f"{stu_id}|{mk}"
        pay = payments_map.get(ov_key)
        paid = bool(isinstance(pay, dict) and pay.get("paid"))
        paid_at = str(pay.get("paidAt", "")).strip() if paid else ""
        paid_amount = int(pay.get("amount", amount)) if paid and pay.get("amount") is not None else (amount if paid else 0)
        method = str(pay.get("method", "transfer")) if paid else ""
        pay_note = str(pay.get("note", "")).strip() if paid else ""

        if paid:
            balance_diff = paid_amount - raw_due
            next_balance = balance_diff
        else:
            balance_diff = 0
            next_balance = -raw_due if raw_due < 0 else 0

        result = {
            "monthKey": mk,
            "monthLabel": _vn_month_label(mk),
            "notEnrolled": False,
            "startDate": start_date,
            "baseAmount": raw["baseAmount"],
            "monthFee": raw["monthFee"],
            "carryFromPrev": carry_from_prev,
            "carryFromMonth": carry_from_month,
            "carryFromMonthLabel": _vn_month_label(carry_from_month) if carry_from_month else "",
            "amount": amount,
            "source": raw["source"],
            "adjustmentNote": raw["adjustmentNote"],
            "paid": paid,
            "paidAt": paid_at,
            "paidAmount": paid_amount,
            "balanceDiff": balance_diff,
            "method": method,
            "note": pay_note,
        }
        prev_balance = next_balance
        prev_month_key = mk

    return result


def build_student_tuition_payload(student: dict, tuition: dict) -> dict:
    now_dt = datetime.now().astimezone()
    cur_month = f"{now_dt.year:04d}-{now_dt.month:02d}"
    start_date = str(student.get("startDate") or student.get("createdAt") or "")[:10]
    start_month = start_date[:7] if re.match(r"^\d{4}-\d{2}", start_date) else cur_month
    # Also include any month that has an explicit payment or override for this student
    stu_prefix = f"{student.get('id', '')}|"
    extra_months = []
    for k in list(tuition.get("payments", {}).keys()) + list(tuition.get("studentOverrides", {}).keys()):
        if isinstance(k, str) and k.startswith(stu_prefix):
            mk = k.split("|", 1)[1]
            if re.match(r"^\d{4}-\d{2}$", mk) and mk <= cur_month:
                extra_months.append(mk)
    earliest = min([start_month] + extra_months) if extra_months else start_month
    if earliest > cur_month:
        earliest = cur_month

    all_months = _iter_months(earliest, cur_month)
    current_entry = compute_student_month_tuition(student, tuition, cur_month)
    prev_entries = [
        compute_student_month_tuition(student, tuition, mk)
        for mk in reversed([m for m in all_months if m < cur_month])
    ]
    prev_entries = [e for e in prev_entries if not e["notEnrolled"] or e["paid"]]

    return {
        "currentMonth": current_entry,
        "previousMonths": prev_entries,
        "startDate": start_date,
    }


def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k != "passwordHash"}


def format_post_for_user(post: dict, viewer: dict | None, users_by_id: dict) -> dict:
    """Serialize a newsfeed post with like counts & viewer's liked state.
    Privacy rule: ONLY admin receives the list of who liked the post (likedBy);
    students strictly receive likeCount and likedByMe only."""
    raw_likes = post.get("likes") if isinstance(post.get("likes"), list) else []
    seen: set[str] = set()
    clean_likes: list[dict] = []
    for item in raw_likes:
        if isinstance(item, str):
            uid = item.strip()
            at = ""
        elif isinstance(item, dict):
            uid = str(item.get("userId", "")).strip()
            at = str(item.get("at", "")).strip()
        else:
            continue
        if not uid or uid in seen:
            continue
        seen.add(uid)
        clean_likes.append({"userId": uid, "at": at})

    viewer_id = str(viewer.get("id", "")) if isinstance(viewer, dict) else ""
    is_admin = isinstance(viewer, dict) and viewer.get("role") == "admin"

    out = {k: v for k, v in post.items() if k not in ("likes", "likedBy")}
    author_user = users_by_id.get(post.get("authorId", "")) or next(
        (u for u in users_by_id.values() if u.get("role") == "admin"),
        None,
    )
    out["authorAvatarUrl"] = str(author_user.get("avatarUrl", "")).strip() if author_user else ""
    if author_user and author_user.get("fullName"):
        out["authorName"] = author_user["fullName"]
    out["likeCount"] = len(clean_likes)
    out["likedByMe"] = bool(viewer_id and viewer_id in seen)

    if is_admin:
        liked_by = []
        for entry in reversed(clean_likes):
            u = users_by_id.get(entry["userId"])
            if u:
                liked_by.append({
                    "userId": u["id"],
                    "fullName": u.get("fullName") or u.get("username") or "Người dùng",
                    "username": u.get("username", ""),
                    "className": u.get("className", ""),
                    "role": u.get("role", "student"),
                    "avatarUrl": u.get("avatarUrl", ""),
                    "at": entry["at"],
                })
            else:
                liked_by.append({
                    "userId": entry["userId"],
                    "fullName": "Tài khoản đã xóa",
                    "username": "",
                    "className": "",
                    "role": "student",
                    "avatarUrl": "",
                    "at": entry["at"],
                })
        out["likedBy"] = liked_by
    return out


def normalize_external_url(raw: str | None) -> str:
    url = str(raw or "").strip()
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return ""
    return url


def resolve_student_ids_for_classes(db: dict, target_classes: list[str]) -> list[str]:
    norm = {str(c).strip().lower() for c in (target_classes or []) if str(c).strip()}
    if not norm:
        return []
    return [
        u["id"]
        for u in db.get("users", [])
        if u.get("role") == "student" and str(u.get("className", "")).strip().lower() in norm
    ]


def student_matches_assignment(user: dict, asg: dict) -> bool:
    if asg.get("assignAll"):
        return True
    if user.get("id") in (asg.get("studentIds") or []):
        return True
    target_classes = asg.get("targetClasses")
    if isinstance(target_classes, list) and target_classes:
        stu_cls = str(user.get("className", "")).strip().lower()
        if stu_cls and any(str(c).strip().lower() == stu_cls for c in target_classes):
            return True
    return False


def build_or_update_assignment(
    db: dict,
    body: dict,
    existing: dict | None = None,
    *,
    default_title: str = "",
    default_target_all: bool | None = None,
    default_target_classes: list[str] | None = None,
    linked_post_id: str | None = None,
) -> tuple[dict | None, str | None]:
    base = existing or {}
    submission_mode = (
        "external_link"
        if str(body.get("submissionMode", base.get("submissionMode", "online"))) == "external_link"
        else "online"
    )
    asg_type = "test" if str(body.get("assignmentType", base.get("assignmentType", "homework"))) == "test" else "homework"

    if default_target_all is not None:
        assign_all = bool(default_target_all)
        target_classes = [str(c).strip() for c in (default_target_classes or []) if str(c).strip()]
        student_ids = [] if assign_all else resolve_student_ids_for_classes(db, target_classes)
    else:
        assign_all = bool(body.get("assignAll", base.get("assignAll", False)))
        target_classes = [
            str(c).strip()
            for c in (body.get("targetClasses", base.get("targetClasses", [])) or [])
            if str(c).strip()
        ]
        student_ids = list(body.get("studentIds", base.get("studentIds", [])))
        if not assign_all and len(student_ids) == 0 and len(target_classes) == 0:
            return None, "Vui lòng chọn ít nhất 1 học sinh hoặc chọn 'Giao tất cả học sinh'."

    open_at = str(body.get("openAt", base.get("openAt", ""))).strip()
    due_at = str(body.get("dueAt", base.get("dueAt", ""))).strip()
    if open_at and due_at:
        try:
            if datetime.fromisoformat(due_at) <= datetime.fromisoformat(open_at):
                return None, "Thời gian nộp bài phải sau thời gian mở đề."
        except Exception:
            pass

    note = str(body.get("note", base.get("note", ""))).strip()
    post_link_id = linked_post_id if linked_post_id is not None else str(base.get("linkedPostId", "")).strip()

    if submission_mode == "external_link":
        ext_url = normalize_external_url(body.get("externalUrl", base.get("externalUrl", "")))
        if not ext_url:
            return None, "Vui lòng nhập đường link nộp bài hợp lệ (VD: link Google Form https://...)."
        ext_label = str(body.get("externalLabel", base.get("externalLabel", ""))).strip()
        title = str(body.get("title", "")).strip() or default_title or base.get("title") or "Bài tập nộp qua link"
        manual_checks = base.get("manualChecks") if isinstance(base.get("manualChecks"), dict) else {}

        asg = {
            **base,
            "id": base.get("id") or gen_id("asg"),
            "submissionMode": "external_link",
            "examId": "",
            "externalUrl": ext_url,
            "externalLabel": ext_label,
            "manualChecks": manual_checks,
            "assignmentType": asg_type,
            "title": title,
            "note": note,
            "openAt": open_at,
            "dueAt": due_at,
            "assignAll": assign_all,
            "targetClasses": target_classes,
            "studentIds": student_ids,
            "shuffle": False,
            "timedMode": False,
            "durationMinutes": None,
            "allowRetake": False,
            "linkedPostId": post_link_id,
            "createdAt": base.get("createdAt") or now_iso(),
        }
        return asg, None

    # Online exam mode
    exam_id = str(body.get("examId", base.get("examId", ""))).strip()
    exam = next((e for e in db.get("exams", []) if e["id"] == exam_id), None)
    if not exam:
        return None, "Đề thi được chọn không tồn tại."
    if asg_type == "test" and not open_at:
        return None, "Bài kiểm tra bắt buộc phải có thời gian mở đề."
    if not due_at:
        return None, "Vui lòng thiết lập thời gian nộp bài."

    timed_mode = True if asg_type == "test" else bool(body.get("timedMode", base.get("timedMode", False)))
    dur_mins = max(1, int(body.get("durationMinutes") or base.get("durationMinutes") or exam.get("durationMinutes") or 45))
    title = str(body.get("title", "")).strip() or default_title or base.get("title") or exam["title"]

    asg = {
        **base,
        "id": base.get("id") or gen_id("asg"),
        "submissionMode": "online",
        "examId": exam_id,
        "externalUrl": "",
        "externalLabel": "",
        "assignmentType": asg_type,
        "title": title,
        "note": note,
        "openAt": open_at,
        "dueAt": due_at,
        "assignAll": assign_all,
        "targetClasses": target_classes,
        "studentIds": student_ids,
        "shuffle": bool(body.get("shuffle", base.get("shuffle", False))),
        "timedMode": timed_mode,
        "durationMinutes": dur_mins if timed_mode else None,
        "allowRetake": False,
        "linkedPostId": post_link_id,
        "createdAt": base.get("createdAt") or now_iso(),
    }
    return asg, None


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

    def send_json(self, status: int, payload: object, extra_headers: list[tuple[str, str]] | None = None) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for hk, hv in extra_headers:
                self.send_header(hk, hv)
        self.end_headers()
        self.wfile.write(raw)

    def _get_cookie_token(self) -> str:
        cookie_hdr = self.headers.get("Cookie", "")
        for part in cookie_hdr.split(";"):
            k, sep, v = part.strip().partition("=")
            if sep and k.strip() == "edulab_session":
                return v.strip()
        return ""

    def _session_cookie_header(self, token: str) -> tuple[str, str]:
        if token:
            return ("Set-Cookie", f"edulab_session={token}; Path=/; HttpOnly; SameSite=Lax")
        return ("Set-Cookie", "edulab_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")

    def send_html_error(self, status: int, message: str) -> None:
        html_body = (
            f"<!doctype html><html lang='vi'><head><meta charset='utf-8'/>"
            f"<title>Thông báo</title></head>"
            f"<body style='font-family:system-ui,sans-serif;padding:40px;text-align:center;color:#334155;'>"
            f"<h2>{message}</h2></body></html>"
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html_body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(html_body)

    def read_body_json(self) -> dict | list:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        if length > 32 * 1024 * 1024:
            raise ValueError("Dữ liệu gửi lên vượt quá giới hạn cho phép (tối đa 20MB mỗi tệp).")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _parse_session_entry(self, entry) -> tuple[str | None, str | None]:
        if isinstance(entry, str):
            uid = entry.strip()
            return (uid or None), None
        if isinstance(entry, dict):
            uid = str(entry.get("userId", "")).strip() or None
            imp_id = str(entry.get("impersonatedByAdminId", "")).strip() or None
            return uid, imp_id
        return None, None

    def get_auth_session(self, db: dict) -> tuple[dict | None, str | None, str | None]:
        token = ""
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
        if not token:
            token = self._get_cookie_token()
        if not token:
            return None, None, None
        sessions = load_sessions()
        user_id, imp_admin_id = self._parse_session_entry(sessions.get(token))
        if not user_id:
            return None, None, None
        for u in db["users"]:
            if u["id"] == user_id:
                return u, token, imp_admin_id
        return None, None, None

    def get_auth_user(self, db: dict) -> tuple[dict | None, str | None]:
        u, tok, _ = self.get_auth_session(db)
        return u, tok

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

        if LIVE_GAME.handle_http(self, "GET", parsed):
            return

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
                db = load_db()
                user, _ = self.get_auth_user(db)
                vis_mode = get_models_visibility_mode(db)
                model = STORE.get_model_by_id(model_id)
            if not model:
                self.send_html_error(404, "Không tìm thấy mô hình tương tác.")
                return
            is_admin_user = bool(user and user.get("role") == "admin")
            if not is_admin_user:
                if vis_mode == "admin_only":
                    self.send_html_error(403, "Chế độ hiện tại chỉ cho phép Giáo viên xem mô hình.")
                    return
                if not model.get("visible", True):
                    self.send_html_error(404, "Không tìm thấy mô hình tương tác.")
                    return
                if vis_mode == "own_grade":
                    stu_grade = extract_student_grade(user)
                    if not stu_grade or str(model.get("grade")) != stu_grade:
                        self.send_html_error(403, "Bạn chỉ có thể xem mô hình thuộc khối lớp của mình.")
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
            # Clean SPA routes (/lop-hoc, /mo-hinh, /so-bao-giang, ...) -> serve index.html
            if (
                path == "/lop-hoc"
                or path.startswith("/lop-hoc/")
                or path == "/mo-hinh"
                or path.startswith("/mo-hinh/")
                or path == "/so-bao-giang"
                or path.startswith("/so-bao-giang/")
                or path == "/so-diem"
                or path.startswith("/so-diem/")
                or path == "/trinh-chieu"
                or path.startswith("/trinh-chieu/")
                or path == "/on-tap"
                or path.startswith("/on-tap/")
                or path == "/game-tuong-tac"
                or path.startswith("/game-tuong-tac/")
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
                vis_mode = get_models_visibility_mode(db)
                me_user, tok, imp_admin_id = self.get_auth_session(db)
                if not me_user:
                    return self.send_json(
                        200,
                        {"user": None, "modelsVisibilityMode": vis_mode, "canSwitchBackToAdmin": False},
                    )
                can_switch_back = bool(
                    imp_admin_id
                    and any(u["id"] == imp_admin_id and u.get("role") == "admin" for u in db["users"])
                )
                payload = {
                    "user": public_user(me_user),
                    "modelsVisibilityMode": vis_mode,
                    "canSwitchBackToAdmin": can_switch_back,
                }
                if me_user.get("role") == "admin":
                    demo_stu = next(
                        (u for u in db["users"] if u.get("role") == "student" and bool(u.get("isDemo"))),
                        None,
                    )
                    payload["demoStudent"] = (
                        {
                            "id": demo_stu["id"],
                            "fullName": demo_stu.get("fullName", ""),
                            "username": demo_stu.get("username", ""),
                            "className": demo_stu.get("className", ""),
                        }
                        if demo_stu
                        else None
                    )
                extra = [self._session_cookie_header(tok)] if tok and self._get_cookie_token() != tok else None
                return self.send_json(200, payload, extra_headers=extra)

            if path == "/api/models":
                qs = parse_qs(parsed.query)
                summary_only = qs.get("summary", ["0"])[0] == "1"
                vis_mode = get_models_visibility_mode(db)
                is_admin_user = bool(user and user.get("role") == "admin")
                stu_grade = extract_student_grade(user) if not is_admin_user else None

                if not is_admin_user and vis_mode == "admin_only":
                    return self.send_json(200, {
                        "models": [],
                        "modelsVisibilityMode": vis_mode,
                        "studentGrade": stu_grade,
                    })

                all_models = STORE.list_models()
                if not is_admin_user:
                    all_models = [m for m in all_models if m.get("visible", True)]
                    if vis_mode == "own_grade":
                        if stu_grade:
                            all_models = [m for m in all_models if str(m.get("grade")) == stu_grade]
                        else:
                            all_models = []
                if summary_only:
                    all_models = [{k: v for k, v in m.items() if k != "html"} for m in all_models]
                return self.send_json(200, {
                    "models": all_models,
                    "modelsVisibilityMode": vis_mode,
                    "studentGrade": stu_grade,
                })

            if path.startswith("/api/models/"):
                model_id = path.split("/api/models/", 1)[1].strip("/")
                vis_mode = get_models_visibility_mode(db)
                is_admin_user = bool(user and user.get("role") == "admin")
                if not is_admin_user and vis_mode == "admin_only":
                    return self.send_json(403, {"error": "Chế độ hiện tại chỉ cho phép Giáo viên xem mô hình."})
                model = STORE.get_model_by_id(model_id)
                if not model:
                    return self.send_json(404, {"error": "Không tìm thấy mô hình."})
                if not is_admin_user:
                    if not model.get("visible", True):
                        return self.send_json(404, {"error": "Không tìm thấy mô hình."})
                    if vis_mode == "own_grade":
                        stu_grade = extract_student_grade(user)
                        if not stu_grade or str(model.get("grade")) != stu_grade:
                            return self.send_json(403, {"error": "Bạn chỉ có thể xem mô hình thuộc khối lớp của mình."})
                return self.send_json(200, {"model": model})

            if not user:
                return self.send_json(401, {"error": "Vui lòng đăng nhập để tiếp tục."})

            if path == "/api/admin/teaching-log":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền truy cập Sổ báo giảng."})
                return self.send_json(200, {"teachingLog": ensure_teaching_log(db)})

            if path == "/api/admin/gradebook":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền truy cập Sổ điểm."})
                school_classes, sem_name, sem_term = get_school_classes_from_teaching_log(db)
                return self.send_json(200, {
                    "gradebook": ensure_gradebook(db),
                    "schoolClasses": school_classes,
                    "activeSemesterName": sem_name,
                    "activeTerm": sem_term,
                })

            if path == "/api/admin/storage":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền xem dung lượng."})
                return self.send_json(200, STORE.get_storage_stats(db))

            if path == "/api/admin/ai-settings":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền xem cài đặt AI."})
                cfg = resolve_gemini_config(db)
                return self.send_json(
                    200,
                    {
                        "configured": cfg["configured"],
                        "source": cfg["source"],
                        "maskedKey": cfg["maskedKey"],
                        "model": cfg["model"],
                        "availableModels": cfg["availableModels"],
                    },
                )

            if path == "/api/admin/presentation-sample":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền truy cập."})
                sample_path = BASE_DIR / "samples" / "de-minh-hoa-trinh-chieu.docx"
                if not sample_path.is_file():
                    return self.send_json(404, {"error": "Chưa có file Đề minh họa mẫu."})
                try:
                    b64 = base64.b64encode(sample_path.read_bytes()).decode("ascii")
                    result = parse_presentation_source("docx_base64", b64, filename="Đề minh họa (File Word gốc).docx")
                    return self.send_json(200, result)
                except Exception as e:
                    return self.send_json(400, {"error": str(e)})

            if path == "/api/admin/overview":
                if user["role"] != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền truy cập."})
                students = [public_user(u) for u in db["users"] if u["role"] == "student"]
                users_by_id = {u["id"]: u for u in db["users"]}
                posts = [
                    format_post_for_user(p, user, users_by_id)
                    for p in sorted(
                        db.get("posts", []),
                        key=lambda p: (1 if p.get("pinned") else 0, p.get("createdAt", "")),
                        reverse=True,
                    )
                ]
                models_summary = [
                    {
                        "id": m.get("id", ""),
                        "name": m.get("name", ""),
                        "grade": str(m.get("grade", "")),
                        "visible": bool(m.get("visible", True)),
                        "lessonId": m.get("lessonId", ""),
                    }
                    for m in STORE.list_models()
                ]
                return self.send_json(200, {
                    "user": public_user(user),
                    "storageMode": STORE.mode,
                    "storageError": STORE.supabase_error,
                    "exams": db["exams"],
                    "students": students,
                    "assignments": db["assignments"],
                    "submissions": db["submissions"],
                    "posts": posts,
                    "tuition": ensure_tuition(db),
                    "analytics": ensure_analytics(db),
                    "modelsSummary": models_summary,
                })

            if path == "/api/student/dashboard":
                exams_by_id = {e["id"]: e for e in db["exams"]}
                my_subs = [s for s in db["submissions"] if s["studentId"] == user["id"]]
                subs_by_asg: dict[str, list] = {}
                for s in my_subs:
                    subs_by_asg.setdefault(s["assignmentId"], []).append(s)

                assigned_list = []
                safe_exams_by_id: dict[str, dict] = {}
                for s in my_subs:
                    sub_ex_id = s.get("examId", "")
                    if sub_ex_id and sub_ex_id in exams_by_id:
                        safe_exams_by_id[sub_ex_id] = exams_by_id[sub_ex_id]

                for asg in db["assignments"]:
                    if not student_matches_assignment(user, asg):
                        continue
                    sub_mode = "external_link" if asg.get("submissionMode") == "external_link" else "online"
                    if sub_mode == "external_link":
                        raw_checks = asg.get("manualChecks") if isinstance(asg.get("manualChecks"), dict) else {}
                        my_check = raw_checks.get(user["id"])
                        is_checked = bool(isinstance(my_check, dict) and my_check.get("checked"))
                        sanitized = {k: v for k, v in asg.items() if k != "manualChecks"}
                        assigned_list.append({
                            **sanitized,
                            "submissionMode": "external_link",
                            "assignmentType": asg.get("assignmentType", "homework"),
                            "openAt": asg.get("openAt", ""),
                            "dueAt": asg.get("dueAt", ""),
                            "externalUrl": asg.get("externalUrl", ""),
                            "externalLabel": asg.get("externalLabel", ""),
                            "linkedPostId": asg.get("linkedPostId", ""),
                            "allowRetake": False,
                            "isNotOpen": is_before_open(asg.get("openAt")),
                            "isExpired": is_past_due(asg.get("dueAt")),
                            "isManuallyChecked": is_checked,
                            "myManualCheck": my_check if is_checked else None,
                            "exam": None,
                            "mySubmissions": [],
                        })
                        continue

                    exam = exams_by_id.get(asg.get("examId", ""))
                    if not exam:
                        continue
                    asg_subs = sorted(subs_by_asg.get(asg["id"], []), key=lambda x: x["submittedAt"], reverse=True)
                    not_open = is_before_open(asg.get("openAt"))
                    # Never leak question counts, part breakdown, or exam content before openAt
                    if not_open and not asg_subs:
                        exam_payload = {
                            "id": exam["id"],
                            "title": exam.get("title", ""),
                            "subject": exam.get("subject", ""),
                            "durationMinutes": exam.get("durationMinutes", 45),
                            "locked": True,
                        }
                    else:
                        exam_payload = exam
                        safe_exams_by_id[exam["id"]] = exam

                    sanitized = {k: v for k, v in asg.items() if k != "manualChecks"}
                    assigned_list.append({
                        **sanitized,
                        "submissionMode": "online",
                        "assignmentType": asg.get("assignmentType", "homework"),
                        "openAt": asg.get("openAt", ""),
                        "linkedPostId": asg.get("linkedPostId", ""),
                        "allowRetake": False,
                        "isNotOpen": not_open,
                        "isExpired": is_past_due(asg.get("dueAt")),
                        "exam": exam_payload,
                        "mySubmissions": asg_subs,
                    })

                stu_class = str(user.get("className", "")).strip().lower()
                users_by_id = {u["id"]: u for u in db["users"]}
                visible_posts = [
                    format_post_for_user(p, user, users_by_id)
                    for p in sorted(
                        (
                            p
                            for p in db.get("posts", [])
                            if p.get("targetAll", True)
                            or any(str(c).strip().lower() == stu_class for c in p.get("targetClasses", []))
                        ),
                        key=lambda p: (1 if p.get("pinned") else 0, p.get("createdAt", "")),
                        reverse=True,
                    )
                ]

                return self.send_json(200, {
                    "user": public_user(user),
                    "assignments": assigned_list,
                    "submissions": sorted(my_subs, key=lambda x: x["submittedAt"], reverse=True),
                    "examsById": safe_exams_by_id,
                    "posts": visible_posts,
                    "tuition": build_student_tuition_payload(user, ensure_tuition(db)),
                })

            return self.send_json(404, {"error": "API không tồn tại."})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if LIVE_GAME.handle_http(self, "POST", parsed):
            return
        if not path.startswith("/api/"):
            return self.send_error(404)

        try:
            body = self.read_body_json()
        except Exception as e:
            return self.send_json(400, {"error": f"Dữ liệu gửi lên không hợp lệ: {e}"})

        # Lock-free Gemini Vision AI routes (external HTTP I/O must not block LOCK!)
        if path in ("/api/admin/ai-settings/test", "/api/admin/parse-presentation", "/api/admin/parse-exam"):
            req_fmt = str(body.get("format", "")).lower().strip() if isinstance(body, dict) else ""
            if path == "/api/admin/ai-settings/test" or req_fmt == "pdf_base64":
                with LOCK:
                    db_snap = load_db()
                    auth_user, _, _ = self.get_auth_session(db_snap)
                    ai_cfg = resolve_gemini_config(db_snap)
                if not auth_user:
                    return self.send_json(401, {"error": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."})
                if auth_user.get("role") != "admin":
                    return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền thực hiện."})

                if path == "/api/admin/ai-settings/test":
                    raw_key = str(body.get("apiKey", "")).strip() or ai_cfg["apiKey"]
                    raw_model = str(body.get("model", "")).strip() or ai_cfg["model"]
                    try:
                        res = test_gemini_connection(raw_key, raw_model)
                        return self.send_json(200, res)
                    except GeminiPdfError as ge:
                        return self.send_json(ge.http_status, {"error": str(ge), "code": ge.code})
                    except Exception as exc:
                        return self.send_json(500, {"error": f"Lỗi kiểm tra kết nối Gemini: {exc}"})

                # Parse PDF with Gemini Vision AI (shared by both Presentation Slides & Exam Bank)
                b64_pdf = str(body.get("base64Data", "")).strip()
                filename = str(body.get("filename", "")).strip()
                for_pres = path == "/api/admin/parse-presentation"
                try:
                    result = parse_pdf_with_gemini(
                        b64_pdf,
                        filename=filename,
                        api_key=ai_cfg["apiKey"],
                        model=ai_cfg["model"],
                        for_presentation=for_pres,
                    )
                    return self.send_json(200, result)
                except GeminiPdfError as ge:
                    return self.send_json(ge.http_status, {"error": str(ge), "code": ge.code})
                except Exception as exc:
                    return self.send_json(500, {"error": f"Lỗi trích xuất PDF bằng Gemini AI: {exc}"})

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
                if matched.get("role") == "student":
                    record_student_login(db, matched)
                login_payload = {
                    "token": token,
                    "user": public_user(matched),
                    "modelsVisibilityMode": get_models_visibility_mode(db),
                    "canSwitchBackToAdmin": False,
                }
                if matched.get("role") == "admin":
                    demo_stu = next(
                        (u for u in db["users"] if u.get("role") == "student" and bool(u.get("isDemo"))),
                        None,
                    )
                    login_payload["demoStudent"] = (
                        {
                            "id": demo_stu["id"],
                            "fullName": demo_stu.get("fullName", ""),
                            "username": demo_stu.get("username", ""),
                            "className": demo_stu.get("className", ""),
                        }
                        if demo_stu
                        else None
                    )
                return self.send_json(
                    200,
                    login_payload,
                    extra_headers=[self._session_cookie_header(token)],
                )

            user, token, imp_admin_id = self.get_auth_session(db)
            if path == "/api/logout":
                if token:
                    sessions = load_sessions()
                    sessions.pop(token, None)
                    save_sessions(sessions)
                return self.send_json(200, {"ok": True}, extra_headers=[self._session_cookie_header("")])

            if not user:
                return self.send_json(401, {"error": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."})

            # Admin -> Switch into the single marked Demo Student (works both online & local)
            if path == "/api/impersonate/demo-student":
                if user.get("role") != "admin":
                    return self.send_json(403, {"error": "Chỉ Giáo viên mới có quyền chuyển sang Học sinh Demo."})
                demo_stu = next(
                    (u for u in db["users"] if u.get("role") == "student" and bool(u.get("isDemo"))),
                    None,
                )
                if not demo_stu:
                    return self.send_json(
                        404,
                        {
                            "error": "Chưa có tài khoản Học sinh Demo. Thầy vào Tài khoản học sinh → Sửa hoặc Tạo mới 1 học sinh và tích chọn 'Đánh dấu là Học sinh Demo'."
                        },
                    )
                new_token = secrets.token_urlsafe(32)
                sessions = load_sessions()
                if token:
                    sessions.pop(token, None)
                sessions[new_token] = {"userId": demo_stu["id"], "impersonatedByAdminId": user["id"]}
                save_sessions(sessions)
                return self.send_json(
                    200,
                    {
                        "token": new_token,
                        "user": public_user(demo_stu),
                        "modelsVisibilityMode": get_models_visibility_mode(db),
                        "canSwitchBackToAdmin": True,
                    },
                    extra_headers=[self._session_cookie_header(new_token)],
                )

            # Demo Student preview -> Switch back to Admin (strictly verified by server session!)
            if path == "/api/impersonate/back-to-admin":
                if not imp_admin_id:
                    return self.send_json(403, {"error": "Phiên đăng nhập hiện tại không có quyền chuyển về Giáo viên."})
                admin_user = next(
                    (u for u in db["users"] if u["id"] == imp_admin_id and u.get("role") == "admin"),
                    None,
                )
                if not admin_user:
                    return self.send_json(403, {"error": "Không tìm thấy tài khoản Giáo viên gốc."})
                new_token = secrets.token_urlsafe(32)
                sessions = load_sessions()
                if token:
                    sessions.pop(token, None)
                sessions[new_token] = admin_user["id"]
                save_sessions(sessions)
                demo_stu = next(
                    (u for u in db["users"] if u.get("role") == "student" and bool(u.get("isDemo"))),
                    None,
                )
                return self.send_json(
                    200,
                    {
                        "token": new_token,
                        "user": public_user(admin_user),
                        "modelsVisibilityMode": get_models_visibility_mode(db),
                        "canSwitchBackToAdmin": False,
                        "demoStudent": (
                            {
                                "id": demo_stu["id"],
                                "fullName": demo_stu.get("fullName", ""),
                                "username": demo_stu.get("username", ""),
                                "className": demo_stu.get("className", ""),
                            }
                            if demo_stu
                            else None
                        ),
                    },
                    extra_headers=[self._session_cookie_header(new_token)],
                )

            # Track student click on an interactive HTML model
            if path == "/api/analytics/model-click":
                model_id = str(body.get("modelId", "")).strip()
                if user.get("role") == "student" and model_id:
                    model = STORE.get_model_by_id(model_id)
                    if model:
                        record_student_model_click(db, user, model)
                return self.send_json(200, {"ok": True})

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

            # Toggle Like on a Classroom Newsfeed Post (Admin or eligible Student)
            if path.startswith("/api/posts/") and path.endswith("/like"):
                post_id = path[len("/api/posts/"):-len("/like")].strip("/")
                post = next((p for p in db.get("posts", []) if p["id"] == post_id), None)
                if not post:
                    return self.send_json(404, {"error": "Không tìm thấy bài viết."})
                if user.get("role") != "admin":
                    stu_class = str(user.get("className", "")).strip().lower()
                    allowed = post.get("targetAll", True) or any(
                        str(c).strip().lower() == stu_class for c in post.get("targetClasses", [])
                    )
                    if not allowed:
                        return self.send_json(403, {"error": "Bạn không có quyền tương tác với bài viết này."})
                raw_likes = post.get("likes")
                if not isinstance(raw_likes, list):
                    raw_likes = []
                uid = user["id"]
                existing_idx = next(
                    (
                        i
                        for i, x in enumerate(raw_likes)
                        if (x == uid) or (isinstance(x, dict) and x.get("userId") == uid)
                    ),
                    -1,
                )
                if existing_idx >= 0:
                    raw_likes.pop(existing_idx)
                else:
                    raw_likes.append({"userId": uid, "at": now_iso()})
                post["likes"] = raw_likes
                save_db(db, keys=["posts"])
                users_by_id = {u["id"]: u for u in db["users"]}
                return self.send_json(200, {"post": format_post_for_user(post, user, users_by_id)})

            # Admin-only POST routes
            if user["role"] != "admin":
                return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền thực hiện."})

            # Save Gemini AI settings (API key & model) to db['settings'] (synced to Supabase Cloud / local)
            if path == "/api/admin/ai-settings":
                if not isinstance(db.get("settings"), dict):
                    db["settings"] = {}
                if bool(body.get("clearKey")):
                    db["settings"].pop("geminiApiKey", None)
                else:
                    new_key = str(body.get("apiKey", "")).strip()
                    if new_key:
                        db["settings"]["geminiApiKey"] = new_key
                new_model = str(body.get("model", "")).strip()
                if new_model:
                    db["settings"]["geminiModel"] = new_model
                elif not db["settings"].get("geminiModel"):
                    db["settings"]["geminiModel"] = DEFAULT_GEMINI_MODEL
                save_db(db, keys=["settings"])
                cfg = resolve_gemini_config(db)
                return self.send_json(
                    200,
                    {
                        "configured": cfg["configured"],
                        "source": cfg["source"],
                        "maskedKey": cfg["maskedKey"],
                        "model": cfg["model"],
                        "availableModels": cfg["availableModels"],
                    },
                )

            # Parse Lecture Presentation Deck (Word .docx, PDF text, or LaTeX .tex -> Part I/II/III/IV slides)
            if path == "/api/admin/parse-presentation":
                fmt = str(body.get("format", "docx")).lower().strip()
                filename = str(body.get("filename", "")).strip()
                try:
                    if fmt == "docx":
                        b64 = str(body.get("base64Data", ""))
                        if not b64:
                            raise ValueError("Thiếu dữ liệu file Word (.docx).")
                        result = parse_presentation_source("docx_base64", b64, filename=filename)
                    elif fmt == "latex":
                        result = parse_presentation_source("latex", str(body.get("content", "")), filename=filename)
                    else:
                        result = parse_presentation_source("pdf", str(body.get("content", "")), filename=filename)
                    return self.send_json(200, result)
                except Exception as e:
                    return self.send_json(400, {"error": str(e)})

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
                        "part4": item.get("part4", []),
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

                is_demo = bool(body.get("isDemo", False))
                if is_demo:
                    for u in db["users"]:
                        if u.get("role") == "student" and u.get("isDemo"):
                            u["isDemo"] = False

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
                    "startDate": str(body.get("startDate", "")).strip() or datetime.now().astimezone().strftime("%Y-%m-%d"),
                    "isDemo": is_demo,
                    "createdAt": now_iso(),
                }
                db["users"].append(new_student)
                save_db(db)
                return self.send_json(201, {"student": public_user(new_student)})

            # Create Assignment (supports both Online Exam and External Link / Google Form)
            if path == "/api/admin/assignments":
                asg, err = build_or_update_assignment(db, body)
                if err:
                    return self.send_json(400, {"error": err})
                db["assignments"].insert(0, asg)
                save_db(db, keys=["assignments"])
                return self.send_json(201, {"assignment": asg})

            # Teacher manual submission check for External Link / Google Form assignments
            if path.startswith("/api/admin/assignments/") and path.endswith("/manual-check"):
                asg_id = path[len("/api/admin/assignments/"):-len("/manual-check")].strip("/")
                asg = next((a for a in db.get("assignments", []) if a["id"] == asg_id), None)
                if not asg:
                    return self.send_json(404, {"error": "Không tìm thấy đợt giao bài."})
                checks = asg.get("manualChecks")
                if not isinstance(checks, dict):
                    checks = {}
                updates = body.get("updates")
                if not isinstance(updates, list):
                    updates = [{
                        "studentId": body.get("studentId", ""),
                        "checked": bool(body.get("checked", False)),
                        "note": body.get("note", ""),
                    }]
                for item in updates:
                    sid = str(item.get("studentId", "")).strip()
                    if not sid:
                        continue
                    if bool(item.get("checked", False)):
                        prev_entry = checks.get(sid) if isinstance(checks.get(sid), dict) else {}
                        checks[sid] = {
                            "checked": True,
                            "checkedAt": prev_entry.get("checkedAt") or now_iso(),
                            "note": str(item.get("note", prev_entry.get("note", ""))).strip(),
                        }
                    else:
                        checks.pop(sid, None)
                asg["manualChecks"] = checks
                save_db(db, keys=["assignments"])
                return self.send_json(200, {"assignment": asg})

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

            # Create Classroom Newsfeed Post (Admin) — optionally linked to an Assignment
            if path == "/api/admin/posts":
                title = str(body.get("title", "")).strip()
                content = str(body.get("content", "")).strip()
                attachments = body.get("attachments", [])
                asg_cfg = body.get("assignmentConfig")
                has_asg = isinstance(asg_cfg, dict) and bool(asg_cfg.get("enabled"))
                if not title and not content and not attachments and not has_asg:
                    return self.send_json(400, {"error": "Vui lòng nhập nội dung hoặc đính kèm ít nhất 1 tài liệu/video."})
                target_all = bool(body.get("targetAll", True))
                target_classes = list(body.get("targetClasses", []))
                post_id = gen_id("post")

                linked_asg = None
                if has_asg:
                    linked_asg, err = build_or_update_assignment(
                        db,
                        asg_cfg,
                        default_title=title,
                        default_target_all=target_all,
                        default_target_classes=target_classes,
                        linked_post_id=post_id,
                    )
                    if err:
                        return self.send_json(400, {"error": err})

                post = {
                    "id": post_id,
                    "title": title or (linked_asg["title"] if linked_asg else ""),
                    "content": content,
                    "authorName": user.get("fullName", "Lê Viết Hoàng"),
                    "targetAll": target_all,
                    "targetClasses": target_classes,
                    "pinned": bool(body.get("pinned", False)),
                    "attachments": attachments if isinstance(attachments, list) else [],
                    "linkedAssignmentId": linked_asg["id"] if linked_asg else "",
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db.setdefault("posts", []).insert(0, post)
                if linked_asg:
                    db.setdefault("assignments", []).insert(0, linked_asg)
                    save_db(db, keys=["posts", "assignments"])
                else:
                    save_db(db, keys=["posts"])
                return self.send_json(201, {"post": post, "assignment": linked_asg})

            return self.send_json(404, {"error": "API không tồn tại."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if LIVE_GAME.handle_http(self, "PUT", parsed):
            return
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
                if "avatarUrl" in body:
                    raw_av = str(body.get("avatarUrl") or "").strip()
                    if raw_av == "":
                        user["avatarUrl"] = ""
                    elif re.match(r"^/assets/avatars/[a-z0-9_-]+\.(svg|png|jpg|jpeg|webp)$", raw_av):
                        preset_path = (BASE_DIR / raw_av.lstrip("/")).resolve()
                        avatars_root = (BASE_DIR / "assets" / "avatars").resolve()
                        if preset_path.parent == avatars_root and preset_path.is_file():
                            user["avatarUrl"] = raw_av
                        else:
                            return self.send_json(400, {"error": "Ảnh đại diện có sẵn không tồn tại."})
                    elif re.match(r"^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$", raw_av) and len(raw_av) <= 85000:
                        user["avatarUrl"] = raw_av
                    else:
                        return self.send_json(400, {"error": "Ảnh đại diện không hợp lệ hoặc vượt quá giới hạn sau khi nén."})
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
                    "part4": body.get("part4", existing.get("part4", [])),
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
                if "startDate" in body:
                    stu["startDate"] = str(body.get("startDate", "")).strip()
                if "isDemo" in body:
                    is_demo = bool(body.get("isDemo", False))
                    if is_demo:
                        for u in db["users"]:
                            if u.get("role") == "student" and u["id"] != stu["id"] and u.get("isDemo"):
                                u["isDemo"] = False
                    stu["isDemo"] = is_demo
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
                idx = next((i for i, a in enumerate(db["assignments"]) if a["id"] == asg_id), -1)
                if idx < 0:
                    return self.send_json(404, {"error": "Không tìm thấy đợt giao bài."})
                updated_asg, err = build_or_update_assignment(db, body, existing=db["assignments"][idx])
                if err:
                    return self.send_json(400, {"error": err})
                db["assignments"][idx] = updated_asg
                save_db(db, keys=["assignments"])
                return self.send_json(200, {"assignment": updated_asg})

            # Save Teaching Log & Equipment Register (Admin only)
            if path == "/api/admin/teaching-log":
                if not isinstance(body, dict) or not isinstance(body.get("semesters"), list):
                    return self.send_json(400, {"error": "Dữ liệu Sổ báo giảng không hợp lệ."})
                db["teaching_log"] = body
                save_db(db, keys=["teaching_log"])
                return self.send_json(200, {"teachingLog": db["teaching_log"]})

            # Save Interactive Models visibility mode (Admin only)
            if path == "/api/admin/models-settings":
                mode = str(body.get("modelsVisibilityMode", "")).strip()
                if mode not in VALID_MODEL_VISIBILITY_MODES:
                    return self.send_json(400, {"error": "Chế độ hiển thị không hợp lệ."})
                if not isinstance(db.get("settings"), dict):
                    db["settings"] = {}
                db["settings"]["modelsVisibilityMode"] = mode
                save_db(db, keys=["settings"])
                return self.send_json(200, {"modelsVisibilityMode": mode})

            # Save Tuition configuration & payment records (Admin only)
            if path == "/api/admin/tuition":
                if not isinstance(body, dict):
                    return self.send_json(400, {"error": "Dữ liệu học phí không hợp lệ."})
                clean_tuition = {
                    "defaultRates": body.get("defaultRates") if isinstance(body.get("defaultRates"), list) else build_default_tuition()["defaultRates"],
                    "classRateHistory": body.get("classRateHistory") if isinstance(body.get("classRateHistory"), dict) else {},
                    "monthAdjustments": body.get("monthAdjustments") if isinstance(body.get("monthAdjustments"), dict) else {},
                    "studentOverrides": body.get("studentOverrides") if isinstance(body.get("studentOverrides"), dict) else {},
                    "payments": body.get("payments") if isinstance(body.get("payments"), dict) else {},
                }
                db["tuition"] = clean_tuition
                save_db(db, keys=["tuition"])
                return self.send_json(200, {"tuition": clean_tuition})

            if path == "/api/admin/gradebook":
                if not isinstance(body, dict) or not isinstance(body.get("classes"), dict):
                    return self.send_json(400, {"error": "Dữ liệu Sổ điểm không hợp lệ."})
                clean_gb = {"classes": body["classes"]}
                db["gradebook"] = clean_gb
                save_db(db, keys=["gradebook"])
                return self.send_json(200, {"gradebook": clean_gb})

            # Update Classroom Newsfeed Post (Admin) — syncs optional linked assignment
            if path.startswith("/api/admin/posts/"):
                post_id = path.split("/api/admin/posts/", 1)[1]
                post = next((p for p in db.get("posts", []) if p["id"] == post_id), None)
                if not post:
                    return self.send_json(404, {"error": "Không tìm thấy bài viết."})

                next_title = str(body["title"]).strip() if "title" in body else post.get("title", "")
                next_target_all = bool(body["targetAll"]) if "targetAll" in body else bool(post.get("targetAll", True))
                next_target_classes = list(body["targetClasses"]) if "targetClasses" in body else list(post.get("targetClasses", []))

                asg_changed = False
                linked_asg = None
                if "assignmentConfig" in body and isinstance(body["assignmentConfig"], dict):
                    asg_cfg = body["assignmentConfig"]
                    cur_asg_id = str(post.get("linkedAssignmentId", "")).strip()
                    cur_idx = next((i for i, a in enumerate(db.get("assignments", [])) if a["id"] == cur_asg_id), -1) if cur_asg_id else -1
                    if asg_cfg.get("enabled"):
                        existing_asg = db["assignments"][cur_idx] if cur_idx >= 0 else None
                        linked_asg, err = build_or_update_assignment(
                            db,
                            asg_cfg,
                            existing=existing_asg,
                            default_title=next_title,
                            default_target_all=next_target_all,
                            default_target_classes=next_target_classes,
                            linked_post_id=post_id,
                        )
                        if err:
                            return self.send_json(400, {"error": err})
                        if cur_idx >= 0:
                            db["assignments"][cur_idx] = linked_asg
                        else:
                            db.setdefault("assignments", []).insert(0, linked_asg)
                        post["linkedAssignmentId"] = linked_asg["id"]
                        asg_changed = True
                    else:
                        if cur_idx >= 0 and db["assignments"][cur_idx].get("linkedPostId") == post_id:
                            db["assignments"].pop(cur_idx)
                        post["linkedAssignmentId"] = ""
                        asg_changed = True

                if "title" in body:
                    post["title"] = next_title
                if "content" in body:
                    post["content"] = str(body["content"]).strip()
                if "targetAll" in body:
                    post["targetAll"] = next_target_all
                if "targetClasses" in body:
                    post["targetClasses"] = next_target_classes
                if "pinned" in body:
                    post["pinned"] = bool(body["pinned"])
                if "attachments" in body and isinstance(body["attachments"], list):
                    post["attachments"] = body["attachments"]
                post["updatedAt"] = now_iso()
                save_db(db, keys=["posts", "assignments"] if asg_changed else ["posts"])
                return self.send_json(200, {"post": post, "assignment": linked_asg})

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
        if LIVE_GAME.handle_http(self, "DELETE", parsed):
            return
        if not path.startswith("/api/"):
            return self.send_error(404)

        with LOCK:
            db = load_db()
            user, _ = self.get_auth_user(db)
            if not user:
                return self.send_json(401, {"error": "Vui lòng đăng nhập."})
            if user["role"] != "admin":
                return self.send_json(403, {"error": "Chỉ tài khoản Giáo viên (Admin) mới có quyền xóa."})

            if path == "/api/admin/analytics":
                db["analytics"] = build_default_analytics()
                save_db(db, keys=["analytics"])
                return self.send_json(200, {"ok": True, "analytics": db["analytics"]})

            if path.startswith("/api/admin/exams/"):
                exam_id = path.split("/api/admin/exams/", 1)[1]
                db["exams"] = [e for e in db["exams"] if e["id"] != exam_id]
                removed_asg_ids = {a["id"] for a in db["assignments"] if a.get("examId") == exam_id}
                db["assignments"] = [a for a in db["assignments"] if a.get("examId") != exam_id]
                for p in db.get("posts", []):
                    if p.get("linkedAssignmentId") in removed_asg_ids:
                        p["linkedAssignmentId"] = ""
                save_db(db)
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/students/"):
                stu_id = path.split("/api/admin/students/", 1)[1]
                db["users"] = [u for u in db["users"] if not (u["id"] == stu_id and u["role"] == "student")]
                for a in db["assignments"]:
                    a["studentIds"] = [sid for sid in a.get("studentIds", []) if sid != stu_id]
                    if isinstance(a.get("manualChecks"), dict):
                        a["manualChecks"].pop(stu_id, None)
                save_db(db)
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/assignments/"):
                asg_id = path.split("/api/admin/assignments/", 1)[1]
                db["assignments"] = [a for a in db["assignments"] if a["id"] != asg_id]
                for p in db.get("posts", []):
                    if p.get("linkedAssignmentId") == asg_id:
                        p["linkedAssignmentId"] = ""
                save_db(db, keys=["assignments", "posts"])
                return self.send_json(200, {"ok": True})

            if path.startswith("/api/admin/posts/"):
                post_id = path.split("/api/admin/posts/", 1)[1]
                target = next((p for p in db.get("posts", []) if p["id"] == post_id), None)
                linked_asg_id = ""
                if target:
                    linked_asg_id = str(target.get("linkedAssignmentId", "")).strip()
                    for att in target.get("attachments", []):
                        if att.get("fileId"):
                            STORE.delete_file(att["fileId"])
                db["posts"] = [p for p in db.get("posts", []) if p["id"] != post_id]
                if linked_asg_id:
                    db["assignments"] = [
                        a
                        for a in db.get("assignments", [])
                        if not (a["id"] == linked_asg_id and a.get("linkedPostId") == post_id)
                    ]
                    save_db(db, keys=["posts", "assignments"])
                else:
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
    server.daemon_threads = True
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
