#!/usr/bin/env python3
"""
Edu Live Game — Zero-Dependency Real-Time Classroom Quiz Engine
Designed to run standalone OR drop directly into `edu-exam-2025` (Lớp toán thầy Hoàng).
Uses Python 3.12 standard library only (threading, http.server, json, csv, socket, etc.).
"""

from __future__ import annotations

import base64
import csv
import io
import json
import mimetypes
import os
import random
import re
import secrets
import socket
import string
import threading
import time
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote

from seed_packs import build_seed_question_sets
from xlsx_io import (
    build_template_csv,
    build_template_xlsx,
    read_csv_rows,
    read_xlsx_rows,
    rows_to_questions,
)

VIET_BOT_NAMES = [
    ("Nguyễn Minh Anh", "12A1"), ("Trần Gia Huy", "12A1"), ("Lê Hoàng Nam", "12A1"),
    ("Phạm Thảo Vy", "12A1"), ("Hoàng Đức Anh", "12A1"), ("Vũ Ngọc Hân", "12A1"),
    ("Đặng Quốc Bảo", "12A1"), ("Bùi Khánh Linh", "12A1"), ("Đỗ Thanh Tùng", "12A1"),
    ("Ngô Phương Thảo", "12A1"), ("Dương Nhật Minh", "12A1"), ("Lý Gia Bảo", "12A1"),
    ("Phan Quỳnh Anh", "12A1"), ("Võ Thành Đạt", "12A1"), ("Trịnh Hải Yến", "12A1"),
    ("Nguyễn Tuấn Kiệt", "12A1"), ("Trần Bảo Ngọc", "12A1"), ("Lê Quang Vinh", "12A1"),
    ("Phạm Minh Khôi", "12A1"), ("Hoàng Mai Phương", "12A1"), ("Vũ Tiến Dũng", "12A1"),
    ("Đặng Thu Hà", "12A1"), ("Bùi Hoàng Long", "12A1"), ("Đỗ Ánh Dương", "12A1"),
    ("Ngô Mạnh Hùng", "12A1"), ("Dương Khánh Vy", "12A1"), ("Lý Trung Hiếu", "12A1"),
    ("Phan Gia Linh", "12A1"), ("Võ Minh Quân", "12A1"), ("Trịnh Ngọc Diệp", "12A1"),
    ("Nguyễn Phúc Thịnh", "12A1"), ("Trần Yến Nhi", "12A1"), ("Lê Anh Tú", "12A1"),
    ("Phạm Lan Anh", "12A1"), ("Hoàng Việt Anh", "12A1"), ("Vũ Phương Linh", "12A1"),
    ("Đặng Hữu Nghĩa", "12A1"), ("Bùi Nhật Hạ", "12A1"), ("Đỗ Công Danh", "12A1"),
    ("Ngô Thùy Trang", "12A1"), ("Dương Trọng Nhân", "12A1"), ("Lý Mỹ Duyên", "12A1"),
    ("Phan Khắc Duy", "12A1"), ("Võ Thanh Trúc", "12A1"), ("Trịnh Xuân Bách", "12A1"),
]

AVATARS = ["🦊", "🐼", "🦁", "🐨", "🐸", "🦄", "🐙", "🐝", "🦋", "🐢", "🐬", "🦉", "🐧", "🦖", "🚀", "⭐"]


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def get_lan_ips() -> list[str]:
    """Detect local Wi-Fi / LAN IPv4 addresses for classroom QR code generation."""
    ips: list[str] = []
    # Method 1: UDP connect trick (doesn't send packets)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            ips.append(ip)
    except Exception:
        pass
    # Method 2: hostname resolution
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips


def _strip_accents(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def normalize_answer_text(text: str, case_sensitive: bool = False) -> str:
    t = re.sub(r"\s+", " ", str(text or "").strip())
    if not case_sensitive:
        t = t.lower()
    # Normalize Vietnamese decimal comma for numeric strings (e.g. "-3,5" -> "-3.5")
    num_candidate = t.replace(",", ".")
    if re.fullmatch(r"[+-]?\d+(\.\d+)?", num_candidate):
        try:
            f = float(num_candidate)
            if f.is_integer():
                return str(int(f))
            return f"{f:g}"
        except ValueError:
            pass
    return t


def _non_identity_shuffle(n: int, rng: random.Random) -> list[int]:
    arr = list(range(n))
    if n <= 1:
        return arr
    for _ in range(12):
        rng.shuffle(arr)
        if arr != list(range(n)):
            return arr
    # Guarantee non-identity
    return arr[1:] + arr[:1]


def grade_submission(question: dict, payload: dict) -> tuple[bool, float]:
    """
    Grade a student's submission for any of the 6 question types.
    Returns (is_fully_correct: bool, accuracy_ratio: float in [0.0, 1.0]).
    """
    q_type = question.get("type", "mcq")
    data = question.get("data", {})

    if q_type == "mcq":
        correct_idx = int(data.get("correctIndex", 0))
        choice = payload.get("choice")
        if choice is None:
            return False, 0.0
        ok = int(choice) == correct_idx
        return ok, 1.0 if ok else 0.0

    if q_type == "true_false":
        stmts = data.get("statements", [])
        if not stmts:
            return False, 0.0
        answers = payload.get("answers", [])
        if not isinstance(answers, list):
            return False, 0.0
        correct_count = 0
        for i, st in enumerate(stmts):
            if i < len(answers) and answers[i] is not None and bool(answers[i]) == bool(st.get("answer")):
                correct_count += 1
        ratio = correct_count / len(stmts)
        return correct_count == len(stmts), ratio

    if q_type == "short_answer":
        case_sens = bool(data.get("caseSensitive", False))
        accepted = data.get("acceptedAnswers", [])
        student_raw = str(payload.get("text", "")).strip()
        if not student_raw:
            return False, 0.0
        norm_student = normalize_answer_text(student_raw, case_sens)
        norm_student_no_acc = _strip_accents(norm_student)
        for acc in accepted:
            norm_acc = normalize_answer_text(acc, case_sens)
            if not norm_acc:
                continue
            if norm_student == norm_acc:
                return True, 1.0
            if not case_sens and norm_student_no_acc == _strip_accents(norm_acc):
                return True, 1.0
        return False, 0.0

    if q_type == "fill_blank":
        blanks = data.get("blanks", [])
        if not blanks:
            return False, 0.0
        student_blanks = payload.get("blanks", [])
        if not isinstance(student_blanks, list):
            return False, 0.0
        correct_count = 0
        for i, b in enumerate(blanks):
            val = str(student_blanks[i] if i < len(student_blanks) else "").strip()
            if not val:
                continue
            norm_v = normalize_answer_text(val, False)
            norm_v_no_acc = _strip_accents(norm_v)
            matched = False
            for acc in b.get("accepted", []):
                norm_a = normalize_answer_text(acc, False)
                if norm_v == norm_a or norm_v_no_acc == _strip_accents(norm_a):
                    matched = True
                    break
            if matched:
                correct_count += 1
        ratio = correct_count / len(blanks)
        return correct_count == len(blanks), ratio

    if q_type == "drag_order":
        items = data.get("items", [])
        n = len(items)
        if n == 0:
            return False, 0.0
        order = payload.get("order", [])
        if not isinstance(order, list) or len(order) != n:
            return False, 0.0
        correct_pos = sum(1 for pos, item_idx in enumerate(order) if int(item_idx) == pos)
        ratio = correct_pos / n
        return correct_pos == n, ratio

    if q_type == "drag_match":
        pairs = data.get("pairs", [])
        n = len(pairs)
        if n == 0:
            return False, 0.0
        matches = payload.get("matches", [])
        if not isinstance(matches, list) or len(matches) != n:
            return False, 0.0
        correct_pairs = sum(1 for left_i, right_i in enumerate(matches) if right_i is not None and int(right_i) == left_i)
        ratio = correct_pairs / n
        return correct_pairs == n, ratio

    return False, 0.0


class LiveRoom:
    """Thread-safe state container for one live classroom game room."""

    def __init__(self, code: str, question_set: dict, settings: dict | None = None):
        self.code = code
        self.host_token = secrets.token_urlsafe(18)
        self.set_id = question_set["id"]
        self.set_title = question_set["title"]
        self.subject = question_set.get("subject", "")
        self.questions: list[dict] = json.loads(json.dumps(question_set.get("questions", [])))
        self.created_at = time.time()
        self.updated_at = self.created_at

        cfg = settings or {}
        self.settings = {
            "scoringEnabled": bool(cfg.get("scoringEnabled", True)),
            "showLiveChart": bool(cfg.get("showLiveChart", False)),
            "showNamesOnProjector": bool(cfg.get("showNamesOnProjector", False)),
            "allowChangeAnswer": bool(cfg.get("allowChangeAnswer", False)),
        }

        # Phases: lobby | answering | review | leaderboard | finished
        self.phase = "lobby"
        self.question_index = -1
        self.question_started_at = 0.0
        self.question_deadline = 0.0
        self.reveal_answer = False
        self.show_explanation = False
        self.teacher_notes: dict[int, str] = {}

        # Per-question deterministic shuffle maps (for drag_order & drag_match & fill_blank wordBank)
        self.shuffles: dict[int, list[int]] = {}
        self._prepare_shuffles()

        # Players: player_id -> dict
        self.players: dict[str, dict] = {}
        # Submissions: question_index -> {player_id -> submission_record}
        self.submissions: dict[int, dict[str, dict]] = {}

        # Real-time notification primitives
        self.version = 1
        self.cond = threading.Condition()

        # Bot simulation tracking
        self.bot_sim_active = False
        self.bot_ids: list[str] = []

    def _prepare_shuffles(self) -> None:
        rng = random.Random(f"{self.code}-{self.created_at}")
        for idx, q in enumerate(self.questions):
            q_type = q.get("type")
            data = q.get("data", {})
            if q_type == "drag_order":
                n = len(data.get("items", []))
                self.shuffles[idx] = _non_identity_shuffle(n, rng)
            elif q_type == "drag_match":
                n = len(data.get("pairs", []))
                self.shuffles[idx] = _non_identity_shuffle(n, rng)
            elif q_type == "fill_blank":
                wb = data.get("wordBank", [])
                order = list(range(len(wb)))
                rng.shuffle(order)
                self.shuffles[idx] = order

    def bump(self) -> None:
        self.version += 1
        self.updated_at = time.time()
        self.cond.notify_all()

    def current_question(self) -> dict | None:
        if 0 <= self.question_index < len(self.questions):
            return self.questions[self.question_index]
        return None

    def open_question(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.questions):
            return
        self.question_index = idx
        self.phase = "answering"
        self.reveal_answer = False
        self.show_explanation = False
        self.question_started_at = time.time()
        tl = int(self.questions[idx].get("timeLimit", 30) or 0)
        self.question_deadline = (self.question_started_at + tl) if tl > 0 else 0.0
        self.submissions.setdefault(idx, {})

    def _remaining_seconds(self) -> float | None:
        if self.phase != "answering":
            return 0.0
        if self.question_deadline <= 0:
            return None  # Unlimited
        return max(0.0, round(self.question_deadline - time.time(), 1))

    def _check_auto_lock(self) -> None:
        """Note: we keep teacher in control, or mark timeExpired flag cleanly."""
        pass

    def sanitize_question_for_player(self, idx: int, include_answers: bool) -> dict | None:
        if idx < 0 or idx >= len(self.questions):
            return None
        q = self.questions[idx]
        q_type = q.get("type", "mcq")
        data = q.get("data", {})
        out = {
            "id": q["id"],
            "index": idx,
            "type": q_type,
            "prompt": q.get("prompt", ""),
            "image": q.get("image", ""),
            "timeLimit": int(q.get("timeLimit", 30) or 0),
            "points": int(q.get("points", 1000) or 1000),
        }
        if include_answers:
            out["explanation"] = q.get("explanation", "")
            out["data"] = data
            out["shuffle"] = self.shuffles.get(idx, [])
            return out

        # Strip correct answers while students are answering
        if q_type == "mcq":
            out["data"] = {"options": data.get("options", [])}
        elif q_type == "true_false":
            out["data"] = {
                "statements": [{"text": s.get("text", "")} for s in data.get("statements", [])]
            }
        elif q_type == "short_answer":
            out["data"] = {
                "placeholder": data.get("placeholder", "Nhập câu trả lời của em...")
            }
        elif q_type == "fill_blank":
            wb = data.get("wordBank", [])
            shuf = self.shuffles.get(idx, list(range(len(wb))))
            shuffled_wb = [wb[i] for i in shuf if i < len(wb)]
            out["data"] = {
                "template": data.get("template", ""),
                "blankCount": len(data.get("blanks", [])),
                "wordBank": shuffled_wb,
                "useWordBank": bool(data.get("useWordBank", False)) and len(shuffled_wb) > 0,
            }
        elif q_type == "drag_order":
            items = data.get("items", [])
            shuf = self.shuffles.get(idx, list(range(len(items))))
            out["data"] = {
                "shuffledItems": [{"id": orig_i, "text": items[orig_i]} for orig_i in shuf if orig_i < len(items)]
            }
        elif q_type == "drag_match":
            pairs = data.get("pairs", [])
            shuf = self.shuffles.get(idx, list(range(len(pairs))))
            out["data"] = {
                "leftItems": [{"id": i, "text": p["left"]} for i, p in enumerate(pairs)],
                "rightItems": [{"id": orig_i, "text": pairs[orig_i]["right"]} for orig_i in shuf if orig_i < len(pairs)],
            }
        return out

    def compute_analytics(self, idx: int) -> dict:
        if idx < 0 or idx >= len(self.questions):
            return {}
        q = self.questions[idx]
        q_type = q.get("type", "mcq")
        data = q.get("data", {})
        subs = self.submissions.get(idx, {})
        total = len(subs)
        correct_full = sum(1 for s in subs.values() if s["isCorrect"])
        avg_acc = round((sum(s["accuracy"] for s in subs.values()) / total) * 100, 1) if total else 0.0
        avg_ms = int(sum(s["responseMs"] for s in subs.values()) / total) if total else 0

        base = {
            "totalSubmitted": total,
            "totalPlayers": len(self.players),
            "fullCorrectCount": correct_full,
            "fullCorrectPct": round((correct_full / total) * 100, 1) if total else 0.0,
            "avgAccuracyPct": avg_acc,
            "avgResponseMs": avg_ms,
        }

        if q_type == "mcq":
            options = data.get("options", [])
            counts = [0] * len(options)
            names_by_opt: list[list[str]] = [[] for _ in options]
            for pid, sub in subs.items():
                ch = sub["payload"].get("choice")
                if ch is not None and 0 <= int(ch) < len(options):
                    ci = int(ch)
                    counts[ci] += 1
                    p = self.players.get(pid)
                    if p:
                        names_by_opt[ci].append(p["name"])
            base["optionStats"] = [
                {
                    "index": i,
                    "label": chr(65 + i),
                    "text": opt,
                    "count": counts[i],
                    "pct": round((counts[i] / total) * 100, 1) if total else 0.0,
                    "isCorrect": i == int(data.get("correctIndex", 0)),
                    "players": names_by_opt[i][:50],
                }
                for i, opt in enumerate(options)
            ]

        elif q_type == "true_false":
            stmts = data.get("statements", [])
            stmt_stats = []
            for i, st in enumerate(stmts):
                t_cnt = 0
                f_cnt = 0
                for sub in subs.values():
                    ans = sub["payload"].get("answers", [])
                    if isinstance(ans, list) and i < len(ans) and ans[i] is not None:
                        if bool(ans[i]):
                            t_cnt += 1
                        else:
                            f_cnt += 1
                answered_i = t_cnt + f_cnt
                correct_ans = bool(st.get("answer"))
                corr_cnt = t_cnt if correct_ans else f_cnt
                stmt_stats.append(
                    {
                        "index": i,
                        "label": chr(97 + i) + ")" if len(stmts) > 1 else "",
                        "text": st.get("text", ""),
                        "correctAnswer": correct_ans,
                        "trueCount": t_cnt,
                        "falseCount": f_cnt,
                        "truePct": round((t_cnt / answered_i) * 100, 1) if answered_i else 0.0,
                        "falsePct": round((f_cnt / answered_i) * 100, 1) if answered_i else 0.0,
                        "accuracyPct": round((corr_cnt / answered_i) * 100, 1) if answered_i else 0.0,
                    }
                )
            base["statementStats"] = stmt_stats

        elif q_type == "short_answer":
            case_sens = bool(data.get("caseSensitive", False))
            groups: dict[str, dict] = {}
            for pid, sub in subs.items():
                raw = str(sub["payload"].get("text", "")).strip()
                if not raw:
                    continue
                key = _strip_accents(normalize_answer_text(raw, case_sens))
                if key not in groups:
                    groups[key] = {
                        "label": raw,
                        "count": 0,
                        "isCorrect": sub["isCorrect"],
                        "players": [],
                    }
                groups[key]["count"] += 1
                if sub["isCorrect"]:
                    groups[key]["isCorrect"] = True
                p = self.players.get(pid)
                if p:
                    groups[key]["players"].append(p["name"])
            sorted_groups = sorted(groups.values(), key=lambda g: (-g["count"], not g["isCorrect"], g["label"]))
            for g in sorted_groups:
                g["pct"] = round((g["count"] / total) * 100, 1) if total else 0.0
                g["players"] = g["players"][:50]
            base["groups"] = sorted_groups[:24]
            base["acceptedAnswers"] = data.get("acceptedAnswers", [])

        elif q_type == "fill_blank":
            blanks = data.get("blanks", [])
            blank_stats = []
            for i, b in enumerate(blanks):
                ans_counts: dict[str, dict] = {}
                corr_i = 0
                for sub in subs.values():
                    sb = sub["payload"].get("blanks", [])
                    val = str(sb[i] if isinstance(sb, list) and i < len(sb) else "").strip()
                    if not val:
                        continue
                    norm_v = normalize_answer_text(val, False)
                    norm_v_na = _strip_accents(norm_v)
                    is_ok = any(
                        norm_v == normalize_answer_text(a, False)
                        or norm_v_na == _strip_accents(normalize_answer_text(a, False))
                        for a in b.get("accepted", [])
                    )
                    if is_ok:
                        corr_i += 1
                    if norm_v_na not in ans_counts:
                        ans_counts[norm_v_na] = {"text": val, "count": 0, "isCorrect": is_ok}
                    ans_counts[norm_v_na]["count"] += 1
                top_ans = sorted(ans_counts.values(), key=lambda x: (-x["count"], not x["isCorrect"]))[:6]
                blank_stats.append(
                    {
                        "index": i,
                        "accepted": b.get("accepted", []),
                        "correctCount": corr_i,
                        "accuracyPct": round((corr_i / total) * 100, 1) if total else 0.0,
                        "topAnswers": top_ans,
                    }
                )
            base["template"] = data.get("template", "")
            base["blankStats"] = blank_stats

        elif q_type == "drag_order":
            items = data.get("items", [])
            n = len(items)
            pos_stats = []
            for pos in range(n):
                chosen_map: dict[int, int] = {}
                corr_pos = 0
                for sub in subs.values():
                    order = sub["payload"].get("order", [])
                    if isinstance(order, list) and pos < len(order):
                        it_i = int(order[pos])
                        chosen_map[it_i] = chosen_map.get(it_i, 0) + 1
                        if it_i == pos:
                            corr_pos += 1
                top_chosen = sorted(chosen_map.items(), key=lambda kv: -kv[1])[:3]
                pos_stats.append(
                    {
                        "slot": pos + 1,
                        "correctItemIndex": pos,
                        "correctText": items[pos],
                        "correctCount": corr_pos,
                        "accuracyPct": round((corr_pos / total) * 100, 1) if total else 0.0,
                        "topChosen": [
                            {"itemIndex": it_i, "text": items[it_i] if 0 <= it_i < n else "?", "count": cnt}
                            for it_i, cnt in top_chosen
                        ],
                    }
                )
            seq_counts: dict[tuple, int] = {}
            for sub in subs.values():
                order = sub["payload"].get("order", [])
                if isinstance(order, list) and len(order) == n:
                    k = tuple(int(x) for x in order)
                    seq_counts[k] = seq_counts.get(k, 0) + 1
            top_seqs = sorted(seq_counts.items(), key=lambda kv: -kv[1])[:4]
            base["positionStats"] = pos_stats
            base["topSequences"] = [
                {
                    "order": list(seq),
                    "labels": [f"#{i + 1}" for i in seq],
                    "count": cnt,
                    "pct": round((cnt / total) * 100, 1) if total else 0.0,
                    "isCorrect": list(seq) == list(range(n)),
                }
                for seq, cnt in top_seqs
            ]

        elif q_type == "drag_match":
            pairs = data.get("pairs", [])
            n = len(pairs)
            pair_stats = []
            for left_i, p in enumerate(pairs):
                right_counts: dict[int, int] = {}
                corr_cnt = 0
                for sub in subs.values():
                    matches = sub["payload"].get("matches", [])
                    if isinstance(matches, list) and left_i < len(matches) and matches[left_i] is not None:
                        ri = int(matches[left_i])
                        right_counts[ri] = right_counts.get(ri, 0) + 1
                        if ri == left_i:
                            corr_cnt += 1
                wrong = [
                    {"rightText": pairs[ri]["right"], "count": cnt}
                    for ri, cnt in sorted(right_counts.items(), key=lambda kv: -kv[1])
                    if ri != left_i and 0 <= ri < n
                ][:3]
                pair_stats.append(
                    {
                        "index": left_i,
                        "left": p["left"],
                        "correctRight": p["right"],
                        "correctCount": corr_cnt,
                        "accuracyPct": round((corr_cnt / total) * 100, 1) if total else 0.0,
                        "wrongMatches": wrong,
                    }
                )
            base["pairStats"] = pair_stats

        return base

    def get_leaderboard(self, limit: int = 50) -> list[dict]:
        ranked = sorted(
            self.players.values(),
            key=lambda p: (-p["score"], -p["correctCount"], p["totalResponseMs"], p["joinedAt"]),
        )
        out = []
        for rank, p in enumerate(ranked[:limit], start=1):
            out.append(
                {
                    "rank": rank,
                    "id": p["id"],
                    "name": p["name"],
                    "className": p.get("className", ""),
                    "avatar": p.get("avatar", "🦊"),
                    "score": p["score"],
                    "correctCount": p["correctCount"],
                    "answeredCount": p["answeredCount"],
                    "streak": p["streak"],
                    "isBot": p.get("isBot", False),
                }
            )
        return out

    def build_host_state(self) -> dict:
        q = self.current_question()
        q_idx = self.question_index
        analytics = self.compute_analytics(q_idx) if q is not None else {}

        # Detailed student list for current question modal
        subs = self.submissions.get(q_idx, {}) if q is not None else {}
        player_details = []
        for p in sorted(self.players.values(), key=lambda x: x["name"]):
            sub = subs.get(p["id"])
            player_details.append(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "className": p.get("className", ""),
                    "avatar": p.get("avatar", "🦊"),
                    "score": p["score"],
                    "isBot": p.get("isBot", False),
                    "submitted": sub is not None,
                    "isCorrect": sub["isCorrect"] if sub else None,
                    "accuracy": sub["accuracy"] if sub else None,
                    "pointsEarned": sub["pointsEarned"] if sub else 0,
                    "responseMs": sub["responseMs"] if sub else None,
                }
            )

        return {
            "version": self.version,
            "code": self.code,
            "setId": self.set_id,
            "setTitle": self.set_title,
            "subject": self.subject,
            "phase": self.phase,
            "questionIndex": q_idx,
            "totalQuestions": len(self.questions),
            "remainingSeconds": self._remaining_seconds(),
            "revealAnswer": self.reveal_answer,
            "showExplanation": self.show_explanation,
            "teacherNote": self.teacher_notes.get(q_idx, ""),
            "settings": dict(self.settings),
            "playerCount": len(self.players),
            "botSimActive": self.bot_sim_active,
            "players": player_details,
            "question": q,
            "questionOutline": [
                {"index": i, "type": qq["type"], "prompt": qq["prompt"][:80]}
                for i, qq in enumerate(self.questions)
            ],
            "analytics": analytics,
            "leaderboard": self.get_leaderboard(20),
        }

    def build_player_state(self, player_id: str | None) -> dict:
        q_idx = self.question_index
        include_answers = self.reveal_answer or self.phase in ("finished",)
        q_view = self.sanitize_question_for_player(q_idx, include_answers) if q_idx >= 0 else None

        player = self.players.get(player_id) if player_id else None
        my_sub = None
        if player_id and q_idx >= 0:
            sub = self.submissions.get(q_idx, {}).get(player_id)
            if sub:
                my_sub = {
                    "submitted": True,
                    "payload": sub["payload"],
                    "responseMs": sub["responseMs"],
                }
                if include_answers or self.phase == "leaderboard":
                    my_sub["isCorrect"] = sub["isCorrect"]
                    my_sub["accuracy"] = sub["accuracy"]
                    my_sub["pointsEarned"] = sub["pointsEarned"]

        my_rank = None
        if player_id:
            lb = self.get_leaderboard(500)
            for row in lb:
                if row["id"] == player_id:
                    my_rank = row["rank"]
                    break

        return {
            "version": self.version,
            "code": self.code,
            "setTitle": self.set_title,
            "phase": self.phase,
            "questionIndex": q_idx,
            "totalQuestions": len(self.questions),
            "remainingSeconds": self._remaining_seconds(),
            "revealAnswer": self.reveal_answer,
            "showExplanation": self.show_explanation,
            "teacherNote": self.teacher_notes.get(q_idx, "") if (self.reveal_answer or self.show_explanation) else "",
            "scoringEnabled": self.settings["scoringEnabled"],
            "allowChangeAnswer": self.settings["allowChangeAnswer"],
            "playerCount": len(self.players),
            "submittedCount": len(self.submissions.get(q_idx, {})) if q_idx >= 0 else 0,
            "question": q_view,
            "mySubmission": my_sub,
            "me": {
                "id": player["id"],
                "name": player["name"],
                "className": player.get("className", ""),
                "avatar": player.get("avatar", "🦊"),
                "score": player["score"],
                "correctCount": player["correctCount"],
                "streak": player["streak"],
                "rank": my_rank,
            }
            if player
            else None,
            "topLeaderboard": self.get_leaderboard(5) if self.phase in ("leaderboard", "finished") and self.settings["scoringEnabled"] else [],
        }

    def export_report_csv(self) -> bytes:
        buf = io.StringIO()
        writer = csv.writer(buf)
        headers = ["STT", "Họ và tên", "Lớp", "Tổng điểm", "Số câu đúng trọn vẹn"]
        for i in range(len(self.questions)):
            headers.append(f"Câu {i + 1} (%)")
        writer.writerow(headers)

        ranked = self.get_leaderboard(500)
        for row in ranked:
            pid = row["id"]
            line = [row["rank"], row["name"], row["className"], row["score"], row["correctCount"]]
            for qi in range(len(self.questions)):
                sub = self.submissions.get(qi, {}).get(pid)
                if sub is None:
                    line.append("-")
                else:
                    line.append(f"{round(sub['accuracy'] * 100)}%")
            writer.writerow(line)
        return ("\ufeff" + buf.getvalue()).encode("utf-8")


class LiveGameEngine:
    """Self-contained HTTP/SSE engine for standalone use or drop-in embedding into edu-exam-2025."""

    def __init__(self, data_dir: Path, static_dir: Path, standalone: bool = True):
        self.data_dir = Path(data_dir)
        self.static_dir = Path(static_dir)
        self.standalone = standalone
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sets_file = self.data_dir / "live_question_sets.json"

        self.lock = threading.Lock()
        self.question_sets: list[dict] = self._load_sets()
        self.rooms: dict[str, LiveRoom] = {}

    def _load_sets(self) -> list[dict]:
        if self.sets_file.exists():
            try:
                with open(self.sets_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list) and data:
                    return data
            except Exception:
                pass
        seeded = build_seed_question_sets()
        self._save_sets(seeded)
        return seeded

    def _save_sets(self, sets_list: list[dict]) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.sets_file.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(sets_list, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.sets_file)

    def _gen_room_code(self) -> str:
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        for _ in range(100):
            code = "".join(random.choice(alphabet) for _ in range(6))
            if code not in self.rooms:
                return code
        return uuid.uuid4().hex[:6].upper()

    # -------------------------------------------------------------------------
    # Bot Simulator (Realistic 40-student classroom testing!)
    # -------------------------------------------------------------------------
    def _spawn_bots(self, room: LiveRoom, count: int) -> int:
        count = max(1, min(45, int(count)))
        added = 0
        with room.cond:
            existing_names = {p["name"] for p in room.players.values()}
            for name, cls in VIET_BOT_NAMES:
                if added >= count:
                    break
                if name in existing_names:
                    continue
                pid = f"bot-{uuid.uuid4().hex[:8]}"
                room.players[pid] = {
                    "id": pid,
                    "name": name,
                    "className": cls,
                    "avatar": random.choice(AVATARS),
                    "score": 0,
                    "correctCount": 0,
                    "answeredCount": 0,
                    "streak": 0,
                    "totalResponseMs": 0,
                    "joinedAt": time.time(),
                    "isBot": True,
                }
                room.bot_ids.append(pid)
                added += 1
            room.bot_sim_active = True
            room.bump()
        if room.phase == "answering":
            self._trigger_bots_answer(room, room.question_index)
        return added

    def _make_bot_payload(self, question: dict, rng: random.Random) -> dict:
        q_type = question.get("type", "mcq")
        data = question.get("data", {})
        smart = rng.random() < 0.66  # ~66% accurate, rest realistic classroom mistakes

        if q_type == "mcq":
            opts = data.get("options", [])
            n = len(opts)
            ci = int(data.get("correctIndex", 0))
            if smart or n <= 1:
                return {"choice": ci}
            # Distractor bias: one plausible wrong answer gets more votes
            wrongs = [i for i in range(n) if i != ci]
            if rng.random() < 0.55:
                return {"choice": wrongs[0]}
            return {"choice": rng.choice(wrongs)}

        if q_type == "true_false":
            stmts = data.get("statements", [])
            ans = []
            for idx, st in enumerate(stmts):
                correct_b = bool(st.get("answer"))
                # Make statement #2 slightly trickier for realistic classroom graph!
                prob = 0.52 if idx == 1 and len(stmts) > 1 else 0.78
                ans.append(correct_b if rng.random() < prob else (not correct_b))
            return {"answers": ans}

        if q_type == "short_answer":
            accepted = data.get("acceptedAnswers", ["0"])
            if smart and accepted:
                return {"text": accepted[0]}
            # Generate plausible nearby wrong numbers if numeric
            try:
                num = float(accepted[0].replace(",", "."))
                wrongs = [str(int(num) - 3), str(int(num) + 1), str(int(num) * 2), "2", "-5"]
                return {"text": rng.choice(wrongs)}
            except Exception:
                return {"text": rng.choice(["Không chắc", "0", "2", "Sai dấu"])}

        if q_type == "fill_blank":
            blanks = data.get("blanks", [])
            wb = data.get("wordBank", [])
            out = []
            for b in blanks:
                acc = b.get("accepted", [""])[0]
                if rng.random() < 0.70 or not wb:
                    out.append(acc)
                else:
                    others = [w for w in wb if w != acc]
                    out.append(rng.choice(others) if others else acc)
            return {"blanks": out}

        if q_type == "drag_order":
            n = len(data.get("items", []))
            arr = list(range(n))
            if not smart and n >= 2:
                # Realistic mistake: swap two adjacent steps
                i = rng.randint(0, n - 2)
                arr[i], arr[i + 1] = arr[i + 1], arr[i]
            return {"order": arr}

        if q_type == "drag_match":
            n = len(data.get("pairs", []))
            arr = list(range(n))
            if not smart and n >= 2:
                i, j = rng.sample(range(n), 2)
                arr[i], arr[j] = arr[j], arr[i]
            return {"matches": arr}

        return {}

    def _trigger_bots_answer(self, room: LiveRoom, target_q_idx: int) -> None:
        if not room.bot_ids:
            return

        def _worker():
            rng = random.Random()
            bot_list = list(room.bot_ids)
            rng.shuffle(bot_list)
            # Spread bot answers across ~1.2s to 3.8s so the teacher sees live bars animating!
            for pid in bot_list:
                time.sleep(rng.uniform(0.03, 0.11))
                with room.cond:
                    if room.phase != "answering" or room.question_index != target_q_idx:
                        return
                    if pid not in room.players:
                        continue
                    q = room.current_question()
                    if not q:
                        return
                    subs = room.submissions.setdefault(target_q_idx, {})
                    if pid in subs:
                        continue
                    payload = self._make_bot_payload(q, rng)
                    self._record_submission_locked(room, pid, target_q_idx, payload)

        threading.Thread(target=_worker, daemon=True).start()

    def _record_submission_locked(self, room: LiveRoom, player_id: str, q_idx: int, payload: dict) -> dict:
        """Must be called while holding room.cond."""
        q = room.questions[q_idx]
        subs = room.submissions.setdefault(q_idx, {})
        existing = subs.get(player_id)
        if existing and not room.settings["allowChangeAnswer"]:
            return existing

        # If changing answer, roll back previous score delta first
        player = room.players[player_id]
        if existing:
            player["score"] = max(0, player["score"] - existing["pointsEarned"])
            if existing["isCorrect"]:
                player["correctCount"] = max(0, player["correctCount"] - 1)
            player["answeredCount"] = max(0, player["answeredCount"] - 1)
            player["totalResponseMs"] = max(0, player["totalResponseMs"] - existing["responseMs"])

        is_correct, accuracy = grade_submission(q, payload)
        elapsed_ms = max(200, int((time.time() - room.question_started_at) * 1000))
        base_pts = int(q.get("points", 1000) or 1000)
        tl = int(q.get("timeLimit", 30) or 0)

        points_earned = 0
        if room.settings["scoringEnabled"] and accuracy > 0:
            if tl > 0:
                speed_ratio = max(0.0, min(1.0, 1.0 - (elapsed_ms / (tl * 1000.0)) * 0.5))
            else:
                speed_ratio = 1.0
            streak_bonus = min(200, player["streak"] * 50) if is_correct else 0
            points_earned = int(round(base_pts * accuracy * (0.55 + 0.45 * speed_ratio))) + streak_bonus

        record = {
            "playerId": player_id,
            "payload": payload,
            "isCorrect": is_correct,
            "accuracy": round(accuracy, 4),
            "pointsEarned": points_earned,
            "responseMs": elapsed_ms,
            "submittedAt": time.time(),
        }
        subs[player_id] = record

        player["score"] += points_earned
        player["answeredCount"] += 1
        player["totalResponseMs"] += elapsed_ms
        if is_correct:
            player["correctCount"] += 1
            player["streak"] += 1
        else:
            player["streak"] = 0

        room.bump()
        return record

    # -------------------------------------------------------------------------
    # HTTP Helpers
    # -------------------------------------------------------------------------
    def _send_json(self, handler, status: int, data: Any) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(raw)))
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        handler.wfile.write(raw)

    def _send_bytes(self, handler, status: int, data: bytes, content_type: str, download_name: str | None = None) -> None:
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(data)))
        handler.send_header("Cache-Control", "no-store")
        if download_name:
            handler.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
        handler.end_headers()
        handler.wfile.write(data)

    def _read_json_body(self, handler) -> dict:
        length = int(handler.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = handler.rfile.read(min(length, 15 * 1024 * 1024))
        return json.loads(raw.decode("utf-8"))

    def _serve_static_file(self, handler, rel_path: str) -> bool:
        safe_rel = rel_path.lstrip("/").replace("\\", "/")
        if ".." in safe_rel.split("/"):
            return False
        target = (self.static_dir / safe_rel).resolve()
        if not str(target).startswith(str(self.static_dir.resolve())) or not target.is_file():
            return False
        ctype, _ = mimetypes.guess_type(str(target))
        if target.suffix == ".js":
            ctype = "application/javascript; charset=utf-8"
        elif target.suffix == ".css":
            ctype = "text/css; charset=utf-8"
        elif target.suffix == ".html":
            ctype = "text/html; charset=utf-8"
        elif target.suffix == ".svg":
            ctype = "image/svg+xml"
        elif not ctype:
            ctype = "application/octet-stream"
        data = target.read_bytes()
        handler.send_response(200)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Length", str(len(data)))
        handler.send_header("Cache-Control", "no-cache")
        handler.end_headers()
        handler.wfile.write(data)
        return True

    def _stream_sse(self, handler, room: LiveRoom, role: str, player_id: str | None) -> None:
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
        handler.send_header("Cache-Control", "no-cache, no-transform")
        handler.send_header("Connection", "keep-alive")
        handler.send_header("X-Accel-Buffering", "no")
        handler.end_headers()

        last_version = -1
        try:
            while True:
                with room.cond:
                    if room.version == last_version:
                        room.cond.wait(timeout=15.0)
                    current_v = room.version
                    if current_v != last_version:
                        payload = (
                            room.build_host_state()
                            if role == "host"
                            else room.build_player_state(player_id)
                        )
                        last_version = current_v
                    else:
                        payload = None

                if payload is not None:
                    chunk = f"event: state\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
                    handler.wfile.write(chunk)
                    handler.wfile.flush()
                else:
                    handler.wfile.write(b": ping\n\n")
                    handler.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return

    # -------------------------------------------------------------------------
    # Main Request Router (Drop-in Hook for Any BaseHTTPRequestHandler!)
    # -------------------------------------------------------------------------
    def handle_http(self, handler, method: str, parsed_url) -> bool:
        """
        Handle all /api/live/*, /live-game/*, /host, /play/* routes.
        Returns True if handled, False if the parent server should handle it.
        """
        path = unquote(parsed_url.path)
        query = parse_qs(parsed_url.query)

        # ---- Static Frontend Routes ----
        if method == "GET":
            host_paths = ("/host", "/live-game", "/live-game/", "/live-game/host", "/live-game/host.html")
            if self.standalone:
                host_paths = ("/",) + host_paths
            if path in host_paths:
                return self._serve_static_file(handler, "host.html")
            if path in ("/play", "/join", "/live-game/play", "/live-game/play.html") or path.startswith("/play/") or path.startswith("/live-game/play/"):
                return self._serve_static_file(handler, "play.html")
            if path.startswith("/live-game/"):
                sub = path[len("/live-game/"):]
                return self._serve_static_file(handler, sub)

        # ---- API Routes ----
        if not path.startswith("/api/live"):
            return False

        try:
            return self._route_api(handler, method, path, query)
        except json.JSONDecodeError:
            self._send_json(handler, 400, {"error": "Dữ liệu JSON không hợp lệ."})
            return True
        except Exception as exc:
            self._send_json(handler, 500, {"error": f"Lỗi máy chủ: {exc}"})
            return True

    def _route_api(self, handler, method: str, path: str, query: dict) -> bool:
        # 1. Server Info & LAN IPs
        if method == "GET" and path == "/api/live/info":
            self._send_json(
                handler,
                200,
                {
                    "app": "Edu Live Game",
                    "lanIps": get_lan_ips(),
                    "activeRooms": len(self.rooms),
                    "questionSetsCount": len(self.question_sets),
                },
            )
            return True

        # 2. Template Downloads
        if method == "GET" and path == "/api/live/template/xlsx":
            self._send_bytes(
                handler,
                200,
                build_template_xlsx(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Mau_Bo_Cau_Hoi_Game_Tuong_Tac.xlsx",
            )
            return True

        if method == "GET" and path == "/api/live/template/csv":
            self._send_bytes(
                handler,
                200,
                build_template_csv(),
                "text/csv; charset=utf-8",
                "Mau_Bo_Cau_Hoi_Game_Tuong_Tac.csv",
            )
            return True

        # 3. Question Sets CRUD
        if method == "GET" and path == "/api/live/sets":
            with self.lock:
                self._send_json(handler, 200, {"sets": self.question_sets})
            return True

        if method == "POST" and path == "/api/live/sets":
            body = self._read_json_body(handler)
            title = str(body.get("title", "")).strip() or "Bộ câu hỏi mới"
            ts = now_iso()
            new_set = {
                "id": f"set-{uuid.uuid4().hex[:8]}",
                "title": title,
                "subject": str(body.get("subject", "")).strip() or "Tổng hợp",
                "description": str(body.get("description", "")).strip(),
                "createdAt": ts,
                "updatedAt": ts,
                "questions": body.get("questions", []),
            }
            with self.lock:
                self.question_sets.insert(0, new_set)
                self._save_sets(self.question_sets)
            self._send_json(handler, 201, {"set": new_set})
            return True

        m_set = re.fullmatch(r"/api/live/sets/([^/]+)", path)
        if m_set:
            set_id = m_set.group(1)
            if method == "GET":
                with self.lock:
                    found = next((s for s in self.question_sets if s["id"] == set_id), None)
                if not found:
                    self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi."})
                else:
                    self._send_json(handler, 200, {"set": found})
                return True

            if method == "PUT":
                body = self._read_json_body(handler)
                with self.lock:
                    found = next((s for s in self.question_sets if s["id"] == set_id), None)
                    if not found:
                        self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi."})
                        return True
                    found["title"] = str(body.get("title", found["title"])).strip() or found["title"]
                    found["subject"] = str(body.get("subject", found.get("subject", ""))).strip()
                    found["description"] = str(body.get("description", found.get("description", ""))).strip()
                    if isinstance(body.get("questions"), list):
                        found["questions"] = body["questions"]
                    found["updatedAt"] = now_iso()
                    self._save_sets(self.question_sets)
                    saved = json.loads(json.dumps(found))
                self._send_json(handler, 200, {"set": saved})
                return True

            if method == "DELETE":
                with self.lock:
                    before = len(self.question_sets)
                    self.question_sets = [s for s in self.question_sets if s["id"] != set_id]
                    if len(self.question_sets) == before:
                        self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi."})
                        return True
                    self._save_sets(self.question_sets)
                self._send_json(handler, 200, {"ok": True})
                return True

        m_dup = re.fullmatch(r"/api/live/sets/([^/]+)/duplicate", path)
        if method == "POST" and m_dup:
            set_id = m_dup.group(1)
            with self.lock:
                found = next((s for s in self.question_sets if s["id"] == set_id), None)
                if not found:
                    self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi."})
                    return True
                copy_set = json.loads(json.dumps(found))
                copy_set["id"] = f"set-{uuid.uuid4().hex[:8]}"
                copy_set["title"] = f"{found['title']} (Bản sao)"
                copy_set["createdAt"] = now_iso()
                copy_set["updatedAt"] = copy_set["createdAt"]
                self.question_sets.insert(0, copy_set)
                self._save_sets(self.question_sets)
            self._send_json(handler, 201, {"set": copy_set})
            return True

        # 4. Import Excel (.xlsx) / CSV / JSON
        if method == "POST" and path == "/api/live/import":
            body = self._read_json_body(handler)
            filename = str(body.get("filename", "import.xlsx"))
            title = str(body.get("title", "")).strip()
            subject = str(body.get("subject", "Lớp học")).strip()
            content_b64 = str(body.get("contentBase64", ""))
            if not content_b64:
                self._send_json(handler, 400, {"error": "Thiếu nội dung tệp tải lên."})
                return True
            if "," in content_b64 and content_b64.startswith("data:"):
                content_b64 = content_b64.split(",", 1)[1]
            raw_bytes = base64.b64decode(content_b64)
            ext = Path(filename).suffix.lower()

            warnings: list[str] = []
            questions: list[dict] = []

            if ext == ".xlsx":
                rows = read_xlsx_rows(raw_bytes)
                questions, warnings = rows_to_questions(rows)
            elif ext in (".csv", ".txt"):
                rows = read_csv_rows(raw_bytes)
                questions, warnings = rows_to_questions(rows)
            elif ext == ".json":
                parsed = json.loads(raw_bytes.decode("utf-8-sig"))
                if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
                    questions = parsed["questions"]
                    if not title:
                        title = str(parsed.get("title", "")).strip()
                    if parsed.get("subject"):
                        subject = str(parsed["subject"]).strip()
                elif isinstance(parsed, list):
                    questions = parsed
                else:
                    self._send_json(handler, 400, {"error": "Cấu trúc JSON không đúng định dạng bộ câu hỏi."})
                    return True
            else:
                self._send_json(handler, 400, {"error": "Chỉ hỗ trợ tệp Excel (.xlsx), CSV (.csv) hoặc JSON (.json)."})
                return True

            if not questions:
                self._send_json(
                    handler,
                    400,
                    {"error": "Không đọc được câu hỏi hợp lệ nào từ tệp.", "warnings": warnings},
                )
                return True

            if not title:
                title = Path(filename).stem.replace("_", " ").replace("-", " ").strip() or "Bộ câu hỏi nhập từ file"

            ts = now_iso()
            new_set = {
                "id": f"set-{uuid.uuid4().hex[:8]}",
                "title": title,
                "subject": subject,
                "description": f"Nhập từ tệp {filename} ({len(questions)} câu hỏi).",
                "createdAt": ts,
                "updatedAt": ts,
                "questions": questions,
            }
            with self.lock:
                self.question_sets.insert(0, new_set)
                self._save_sets(self.question_sets)
            self._send_json(handler, 201, {"set": new_set, "warnings": warnings})
            return True

        # 5. Create Live Room
        if method == "POST" and path == "/api/live/rooms":
            body = self._read_json_body(handler)
            set_id = str(body.get("setId", ""))
            with self.lock:
                q_set = next((s for s in self.question_sets if s["id"] == set_id), None)
                if not q_set:
                    self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi để mở phòng."})
                    return True
                if not q_set.get("questions"):
                    self._send_json(handler, 400, {"error": "Bộ câu hỏi chưa có câu hỏi nào."})
                    return True
                code = self._gen_room_code()
                room = LiveRoom(code, q_set, body.get("settings"))
                self.rooms[code] = room
            self._send_json(
                handler,
                201,
                {
                    "roomCode": code,
                    "hostToken": room.host_token,
                    "state": room.build_host_state(),
                },
            )
            return True

        # 6. Room-scoped endpoints
        m_room = re.fullmatch(r"/api/live/rooms/([A-Za-z0-9]+)(?:/([A-Za-z0-9._-]+))?", path)
        if m_room:
            code = m_room.group(1).upper()
            sub = m_room.group(2) or ""
            room = self.rooms.get(code)
            if not room:
                self._send_json(handler, 404, {"error": f"Không tìm thấy phòng chơi mã {code}. Hãy kiểm tra lại mã phòng."})
                return True

            if method == "GET" and sub == "events":
                role = (query.get("role", ["player"])[0] or "player").lower()
                if role == "host":
                    tok = query.get("token", [""])[0]
                    if tok != room.host_token:
                        self._send_json(handler, 403, {"error": "Không có quyền điều khiển phòng này."})
                        return True
                    self._stream_sse(handler, room, "host", None)
                else:
                    pid = query.get("playerId", [None])[0]
                    self._stream_sse(handler, room, "player", pid)
                return True

            if method == "GET" and sub == "host":
                tok = query.get("token", [""])[0]
                if tok != room.host_token:
                    self._send_json(handler, 403, {"error": "Mã xác thực giáo viên không hợp lệ."})
                    return True
                with room.cond:
                    self._send_json(handler, 200, room.build_host_state())
                return True

            if method == "GET" and sub == "player":
                pid = query.get("playerId", [None])[0]
                with room.cond:
                    self._send_json(handler, 200, room.build_player_state(pid))
                return True

            if method == "GET" and sub == "report.csv":
                tok = query.get("token", [""])[0]
                if tok != room.host_token:
                    self._send_json(handler, 403, {"error": "Không có quyền tải báo cáo."})
                    return True
                with room.cond:
                    csv_bytes = room.export_report_csv()
                self._send_bytes(handler, 200, csv_bytes, "text/csv; charset=utf-8", f"KetQua_Phong_{code}.csv")
                return True

            if method == "POST" and sub == "join":
                body = self._read_json_body(handler)
                name = re.sub(r"\s+", " ", str(body.get("name", "")).strip())[:40]
                class_name = str(body.get("className", "")).strip()[:20]
                avatar = str(body.get("avatar", "")).strip() or random.choice(AVATARS)
                existing_pid = str(body.get("playerId", "")).strip()

                if not name:
                    self._send_json(handler, 400, {"error": "Vui lòng nhập họ tên của em để vào phòng."})
                    return True

                with room.cond:
                    if existing_pid and existing_pid in room.players:
                        p = room.players[existing_pid]
                        p["name"] = name
                        if class_name:
                            p["className"] = class_name
                        p["avatar"] = avatar
                        pid = existing_pid
                    else:
                        # If a non-bot player with exact same name reconnects, reuse slot
                        same = next(
                            (
                                p for p in room.players.values()
                                if not p.get("isBot") and p["name"].lower() == name.lower()
                            ),
                            None,
                        )
                        if same:
                            pid = same["id"]
                            same["avatar"] = avatar
                            if class_name:
                                same["className"] = class_name
                        else:
                            pid = f"p-{uuid.uuid4().hex[:10]}"
                            room.players[pid] = {
                                "id": pid,
                                "name": name,
                                "className": class_name,
                                "avatar": avatar,
                                "score": 0,
                                "correctCount": 0,
                                "answeredCount": 0,
                                "streak": 0,
                                "totalResponseMs": 0,
                                "joinedAt": time.time(),
                                "isBot": False,
                            }
                    room.bump()
                    p_state = room.build_player_state(pid)
                self._send_json(handler, 200, {"playerId": pid, "state": p_state})
                return True

            if method == "POST" and sub == "submit":
                body = self._read_json_body(handler)
                pid = str(body.get("playerId", "")).strip()
                payload = body.get("payload", {})
                with room.cond:
                    if pid not in room.players:
                        self._send_json(handler, 404, {"error": "Không tìm thấy phiên học sinh. Hãy vào lại phòng."})
                        return True
                    if room.phase != "answering":
                        self._send_json(handler, 409, {"error": "Đã hết thời gian nộp câu trả lời cho câu hỏi này."})
                        return True
                    q_idx = room.question_index
                    if q_idx < 0 or q_idx >= len(room.questions):
                        self._send_json(handler, 400, {"error": "Chưa có câu hỏi nào đang mở."})
                        return True
                    rec = self._record_submission_locked(room, pid, q_idx, payload)
                    p_state = room.build_player_state(pid)
                self._send_json(handler, 200, {"ok": True, "submitted": True, "responseMs": rec["responseMs"], "state": p_state})
                return True

            if method == "POST" and sub == "action":
                body = self._read_json_body(handler)
                tok = str(body.get("hostToken", "")) or query.get("token", [""])[0]
                if tok != room.host_token:
                    self._send_json(handler, 403, {"error": "Không có quyền điều khiển phòng."})
                    return True

                act = str(body.get("action", "")).strip()
                trigger_bots_for: int | None = None

                with room.cond:
                    if act == "start":
                        room.open_question(0)
                        if room.bot_sim_active:
                            trigger_bots_for = 0
                        room.bump()

                    elif act == "goto":
                        idx = int(body.get("questionIndex", 0))
                        if 0 <= idx < len(room.questions):
                            room.open_question(idx)
                            if room.bot_sim_active:
                                trigger_bots_for = idx
                            room.bump()

                    elif act == "next":
                        if room.question_index + 1 < len(room.questions):
                            nxt = room.question_index + 1
                            room.open_question(nxt)
                            if room.bot_sim_active:
                                trigger_bots_for = nxt
                        else:
                            room.phase = "finished"
                            room.reveal_answer = True
                        room.bump()

                    elif act == "prev":
                        if room.question_index > 0:
                            prv = room.question_index - 1
                            room.question_index = prv
                            room.phase = "review"
                            room.reveal_answer = True
                            room.bump()

                    elif act == "lock":
                        if room.phase == "answering":
                            room.phase = "review"
                            if body.get("reveal") is True:
                                room.reveal_answer = True
                            room.bump()

                    elif act == "reopen":
                        if room.question_index >= 0:
                            room.phase = "answering"
                            room.reveal_answer = False
                            tl = int(room.questions[room.question_index].get("timeLimit", 30) or 0)
                            room.question_started_at = time.time()
                            room.question_deadline = (room.question_started_at + tl) if tl > 0 else 0.0
                            room.bump()

                    elif act == "reveal":
                        if room.phase == "answering":
                            room.phase = "review"
                        room.reveal_answer = not room.reveal_answer if body.get("value") is None else bool(body["value"])
                        room.bump()

                    elif act == "toggle_explanation":
                        if room.phase == "answering":
                            room.phase = "review"
                        room.show_explanation = not room.show_explanation if body.get("value") is None else bool(body["value"])
                        if room.show_explanation:
                            room.reveal_answer = True
                        room.bump()

                    elif act == "show_leaderboard":
                        if room.phase == "leaderboard":
                            room.phase = "review"
                        else:
                            room.phase = "leaderboard"
                            room.reveal_answer = True
                        room.bump()

                    elif act == "toggle_setting":
                        key = str(body.get("key", ""))
                        if key in room.settings:
                            val = body.get("value")
                            room.settings[key] = (not room.settings[key]) if val is None else bool(val)
                            room.bump()

                    elif act == "extend_time":
                        add_sec = int(body.get("seconds", 15))
                        if room.phase == "answering":
                            if room.question_deadline <= 0:
                                room.question_deadline = time.time() + add_sec
                            else:
                                room.question_deadline = max(time.time(), room.question_deadline) + add_sec
                            room.bump()

                    elif act == "set_note":
                        if room.question_index >= 0:
                            room.teacher_notes[room.question_index] = str(body.get("note", ""))[:1000]
                            room.bump()

                    elif act == "kick_player":
                        kpid = str(body.get("playerId", ""))
                        if kpid in room.players:
                            del room.players[kpid]
                            if kpid in room.bot_ids:
                                room.bot_ids.remove(kpid)
                            room.bump()

                    elif act == "finish":
                        room.phase = "finished"
                        room.reveal_answer = True
                        room.bump()

                    elif act == "simulate_bots":
                        pass  # handled right below outside lock

                    else:
                        self._send_json(handler, 400, {"error": f"Lệnh không hợp lệ: {act}"})
                        return True

                if act == "simulate_bots":
                    cnt = int(body.get("count", 40))
                    self._spawn_bots(room, cnt)
                elif trigger_bots_for is not None:
                    self._trigger_bots_answer(room, trigger_bots_for)

                with room.cond:
                    self._send_json(handler, 200, {"ok": True, "state": room.build_host_state()})
                return True

        self._send_json(handler, 404, {"error": "Endpoint không tồn tại."})
        return True
