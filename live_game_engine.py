#!/usr/bin/env python3
"""
Edu Live Game — Zero-Dependency Real-Time Classroom Multi-Mode Game Engine
Modes supported on ANY question set:
1. classic        — Đấu Trường Tốc Độ (10.0–20.0 speed-scaled individual quiz)
2. bomb_defusal   — Gỡ Bom Mảnh Ghép (4-role asymmetric team wire-cutting)
3. math_impostor  — Ma Sói Toán Học (Secret saboteurs vs Math Reactor + Radar clues & voting)
4. glass_bridge   — Cầu Kính Sinh Tử (2-phase Peer Instruction live panel jumping & glass shatter)

Uses Python 3.12 standard library only. Zero Unicode emojis.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import math
import mimetypes
import os
import random
import re
import secrets
import socket
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

AVATARS = ["blue", "indigo", "purple", "teal", "emerald", "amber", "rose", "sky"]

VALID_GAME_MODES = ("classic", "bomb_defusal", "math_impostor", "glass_bridge")

SQUAD_NAMES = [
    "Đội Alpha", "Đội Beta", "Đội Gamma", "Đội Delta",
    "Đội Epsilon", "Đội Zeta", "Đội Eta", "Đội Theta",
    "Đội Sigma", "Đội Omega", "Đội Lambda", "Đội Kappa",
]

BOMB_WIRES = [
    {"wireIndex": 0, "colorId": "red", "label": "Dây Đỏ", "hex": "#e11d48"},
    {"wireIndex": 1, "colorId": "blue", "label": "Dây Xanh Dương", "hex": "#2563eb"},
    {"wireIndex": 2, "colorId": "amber", "label": "Dây Vàng", "hex": "#d97706"},
    {"wireIndex": 3, "colorId": "emerald", "label": "Dây Xanh Lá", "hex": "#059669"},
]


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def get_lan_ips() -> list[str]:
    """Detect local Wi-Fi / LAN IPv4 addresses for classroom QR code generation."""
    ips: list[str] = []
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
    return arr[1:] + arr[:1]


def build_four_choice_adapter(question: dict, rng: random.Random) -> dict:
    """
    Ensure ANY of the 6 question types exposes 4 clean choices + correctIndex (0..3)
    for modes that rely on 4 wires / 4 glass panels / 4 suspect options.
    """
    q_type = question.get("type", "mcq")
    data = question.get("data", {})

    if q_type == "mcq":
        opts = list(data.get("options", []))[:4]
        while len(opts) < 4:
            opts.append(f"Phương án {chr(65 + len(opts))}")
        ci = max(0, min(3, int(data.get("correctIndex", 0))))
        return {"options": opts, "correctIndex": ci, "adaptedPrompt": question.get("prompt", "")}

    if q_type == "true_false":
        stmts = data.get("statements", [])
        if len(stmts) <= 1:
            ans = bool(stmts[0].get("answer", True)) if stmts else True
            opts = ["Khẳng định Đúng", "Khẳng định Sai", "Chưa đủ điều kiện xác định", "Chỉ đúng với số nguyên"]
            return {"options": opts, "correctIndex": 0 if ans else 1, "adaptedPrompt": question.get("prompt", "")}
        # Multi-statement: summarize statements inside prompt & create 4 D/S combinations
        stmt_lines = "\n".join(
            f"**{chr(97 + i)})** {s.get('text', '')}" for i, s in enumerate(stmts)
        )
        truth = [bool(s.get("answer")) for s in stmts]
        fmt_combo = lambda arr: " • ".join(f"{chr(97 + i)}:{'Đ' if v else 'S'}" for i, v in enumerate(arr))
        correct_str = fmt_combo(truth)
        distractors: list[str] = []
        for flip_i in range(len(truth)):
            alt = list(truth)
            alt[flip_i] = not alt[flip_i]
            s_alt = fmt_combo(alt)
            if s_alt != correct_str and s_alt not in distractors:
                distractors.append(s_alt)
        inv = fmt_combo([not v for v in truth])
        if inv != correct_str and inv not in distractors:
            distractors.append(inv)
        while len(distractors) < 3:
            distractors.append(f"Tất cả đều {'Sai' if len(distractors) % 2 == 0 else 'Đúng'}")
        pool = [correct_str] + distractors[:3]
        rng.shuffle(pool)
        return {
            "options": pool,
            "correctIndex": pool.index(correct_str),
            "adaptedPrompt": f"{question.get('prompt', '')}\n{stmt_lines}",
        }

    if q_type == "short_answer":
        accepted = data.get("acceptedAnswers", ["0"])
        corr = str(accepted[0] if accepted else "0").strip() or "0"
        distractors = []
        try:
            val = float(corr.replace(",", "."))
            is_int = val.is_integer()
            for delta in (-2, 1, 3, -1, 4):
                cand_v = val + delta
                s = str(int(cand_v)) if is_int else f"{cand_v:g}"
                if s != corr and s not in distractors:
                    distractors.append(s)
        except ValueError:
            distractors = [f"Không phải {corr}", "0", "1", "-1"]
        pool = [corr] + distractors[:3]
        rng.shuffle(pool)
        return {"options": pool, "correctIndex": pool.index(corr), "adaptedPrompt": question.get("prompt", "")}

    if q_type == "fill_blank":
        blanks = data.get("blanks", [])
        corr_parts = [str((b.get("accepted") or ["..."])[0]) for b in blanks]
        corr_str = " ; ".join(corr_parts) if corr_parts else "..."
        wb = [str(w) for w in data.get("wordBank", []) if str(w) not in corr_parts]
        distractors = []
        for i in range(6):
            if wb:
                alt = list(corr_parts)
                alt[i % len(alt)] = wb[i % len(wb)]
                s = " ; ".join(alt)
            else:
                s = " ; ".join(reversed(corr_parts)) if len(corr_parts) > 1 and i == 0 else f"Phương án khác #{i + 1}"
            if s != corr_str and s not in distractors:
                distractors.append(s)
        while len(distractors) < 3:
            distractors.append(f"Kết quả nhiễu #{len(distractors) + 1}")
        pool = [corr_str] + distractors[:3]
        rng.shuffle(pool)
        tpl_clean = re.sub(r"\{\{(\d+)\}\}", lambda m: f"[Ô #{int(m.group(1)) + 1}]", data.get("template", ""))
        return {
            "options": pool,
            "correctIndex": pool.index(corr_str),
            "adaptedPrompt": f"{question.get('prompt', '')}\n{tpl_clean}",
        }

    if q_type == "drag_order":
        items = data.get("items", [])
        n = len(items)
        numbered_lines = "\n".join(f"**({i + 1})** {txt}" for i, txt in enumerate(items))
        # Present shuffled labels so students must figure out the sequence
        perm_display = _non_identity_shuffle(n, rng)
        disp_lines = "\n".join(f"**[{chr(65 + pos)}]** {items[orig_i]}" for pos, orig_i in enumerate(perm_display))
        # Correct sequence of letters that restores 0, 1, ..., n-1
        inv_map = {orig_i: chr(65 + pos) for pos, orig_i in enumerate(perm_display)}
        corr_seq = " → ".join(inv_map[i] for i in range(n))
        distractors = []
        for _ in range(12):
            alt_idx = list(range(n))
            rng.shuffle(alt_idx)
            s = " → ".join(inv_map[i] for i in alt_idx)
            if s != corr_seq and s not in distractors:
                distractors.append(s)
            if len(distractors) >= 3:
                break
        while len(distractors) < 3:
            distractors.append(f"Thứ tự khác #{len(distractors) + 1}")
        pool = [corr_seq] + distractors[:3]
        rng.shuffle(pool)
        return {
            "options": pool,
            "correctIndex": pool.index(corr_seq),
            "adaptedPrompt": f"{question.get('prompt', '')}\n{disp_lines}",
        }

    if q_type == "drag_match":
        pairs = data.get("pairs", [])
        n = len(pairs)
        shuf_r = _non_identity_shuffle(n, rng)
        left_desc = " | ".join(f"**{i + 1}.** {p['left']}" for i, p in enumerate(pairs))
        right_desc = " | ".join(f"**{chr(97 + pos)})** {pairs[orig_i]['right']}" for pos, orig_i in enumerate(shuf_r))
        inv_r = {orig_i: chr(97 + pos) for pos, orig_i in enumerate(shuf_r)}
        corr_str = ", ".join(f"{i + 1}-{inv_r[i]}" for i in range(n))
        distractors = []
        for _ in range(12):
            alt = list(range(n))
            rng.shuffle(alt)
            s = ", ".join(f"{i + 1}-{inv_r[alt[i]]}" for i in range(n))
            if s != corr_str and s not in distractors:
                distractors.append(s)
            if len(distractors) >= 3:
                break
        while len(distractors) < 3:
            distractors.append(f"Cách ghép khác #{len(distractors) + 1}")
        pool = [corr_str] + distractors[:3]
        rng.shuffle(pool)
        return {
            "options": pool,
            "correctIndex": pool.index(corr_str),
            "adaptedPrompt": f"{question.get('prompt', '')}\nTrái: {left_desc}\nPhải: {right_desc}",
        }

    return {"options": ["A", "B", "C", "D"], "correctIndex": 0, "adaptedPrompt": question.get("prompt", "")}


def grade_submission(question: dict, payload: dict) -> tuple[bool, float]:
    """Grade a student's submission for any of the 6 question types in classic mode."""
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
    """Thread-safe state container supporting 4 classroom game modes."""

    def __init__(self, code: str, question_set: dict, settings: dict | None = None, game_mode: str = "classic"):
        self.code = code
        self.host_token = secrets.token_urlsafe(18)
        self.set_id = question_set["id"]
        self.set_title = question_set["title"]
        self.subject = question_set.get("subject", "")
        self.questions: list[dict] = json.loads(json.dumps(question_set.get("questions", [])))
        self.created_at = time.time()
        self.updated_at = self.created_at

        self.game_mode = game_mode if game_mode in VALID_GAME_MODES else "classic"

        cfg = settings or {}
        self.settings = {
            "scoringEnabled": bool(cfg.get("scoringEnabled", True)),
            "showLiveChart": bool(cfg.get("showLiveChart", False)),
            "showNamesOnProjector": bool(cfg.get("showNamesOnProjector", False)),
            "allowChangeAnswer": bool(cfg.get("allowChangeAnswer", False)),
        }

        # Phases:
        # lobby | answering | bridge_debate | review | impostor_vote | impostor_vote_result | leaderboard | finished | closed
        self.phase = "lobby"
        self.question_index = -1
        self.question_started_at = 0.0
        self.question_deadline = 0.0
        self.reveal_answer = False
        self.show_explanation = False
        self.teacher_notes: dict[int, str] = {}

        # Rank delta tracking
        self.pre_question_ranks: dict[str, int] = {}
        self.rank_change_seq = 0
        self.last_rank_change_q = -1
        self.last_rank_change_reason = ""
        self.last_rank_changes: list[dict] = []

        # Per-question shuffles & 4-choice adapters
        self.shuffles: dict[int, list[int]] = {}
        self.four_choices: dict[int, dict] = {}
        self._prepare_shuffles()

        # Players & submissions
        self.players: dict[str, dict] = {}
        self.left_players: list[dict] = []
        self.submissions: dict[int, dict[str, dict]] = {}

        # ---- Mode 1: Bomb Defusal State ----
        self.squads: dict[str, dict] = {}  # sq_id -> {id, name, shield, score, defusedCount, explodedCount}
        self.player_squad: dict[str, str] = {}  # pid -> sq_id
        # q_idx -> {sq_id -> {"wireToOpt": [int,int,int,int], "correctWire": int}}
        self.bomb_wirings: dict[int, dict[str, dict]] = {}
        # q_idx -> {sq_id -> {"wireIndex": int, "isDefused": bool, "cutterId": str, "responseMs": int, "submittedAt": float, "pointsEarned": float}}
        self.bomb_cuts: dict[int, dict[str, dict]] = {}
        # Advisory wire signals from squadmates: q_idx -> {sq_id -> {pid: wireIndex}}
        self.bomb_signals: dict[int, dict[str, dict[str, int]]] = {}

        # ---- Mode 2: Math Impostor State ----
        self.impostor_ids: set[str] = set()
        self.ejected_ids: set[str] = set()
        self.reactor_power: int = 55
        self.last_reactor_delta: int = 0
        self.last_sabotage_count: int = 0
        self.impostor_clues: list[str] = []
        self.meeting_votes: dict[str, str] = {}  # voter_pid -> suspect_pid or "skip"
        self.last_vote_result: dict | None = None
        self.impostor_winner: str | None = None  # "crew" | "impostors" | None
        self.impostor_bonus: dict[str, float] = {}  # pid -> extra bonus points from covert sabotage / catching impostor

        # ---- Mode 3: Glass Bridge State ----
        self.bridge_switch_counts: dict[int, dict[str, int]] = {}  # q_idx -> {pid -> jumps}

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
            self.four_choices[idx] = build_four_choice_adapter(q, rng)

    def bump(self) -> None:
        self.version += 1
        self.updated_at = time.time()
        self.cond.notify_all()

    def current_question(self) -> dict | None:
        if 0 <= self.question_index < len(self.questions):
            return self.questions[self.question_index]
        return None

    # -------------------------------------------------------------------------
    # SQUAD MANAGEMENT (Bomb Defusal)
    # -------------------------------------------------------------------------
    def sync_squads(self, force_rebalance: bool = False) -> None:
        """Ensure every active player belongs to a balanced squad of ~4 students."""
        pids = [p["id"] for p in sorted(self.players.values(), key=lambda x: x["joinedAt"])]
        if not pids:
            self.squads = {}
            self.player_squad = {}
            return

        target_squad_count = max(1, min(len(SQUAD_NAMES), math.ceil(len(pids) / 4)))

        if force_rebalance or not self.squads or (self.phase == "lobby" and len(self.squads) != target_squad_count):
            self.squads = {}
            self.player_squad = {}
            for i in range(target_squad_count):
                sq_id = f"sq-{i}"
                self.squads[sq_id] = {
                    "id": sq_id,
                    "name": SQUAD_NAMES[i],
                    "shield": 3,
                    "score": 0.0,
                    "defusedCount": 0,
                    "explodedCount": 0,
                }
            for idx, pid in enumerate(pids):
                sq_id = f"sq-{idx % target_squad_count}"
                self.player_squad[pid] = sq_id
            return

        # Clean stale players and assign any newly joined player to smallest squad
        for pid in list(self.player_squad.keys()):
            if pid not in self.players or self.player_squad[pid] not in self.squads:
                self.player_squad.pop(pid, None)

        for pid in pids:
            if pid not in self.player_squad:
                counts = {sq_id: 0 for sq_id in self.squads}
                for s_pid, s_sq in self.player_squad.items():
                    if s_sq in counts:
                        counts[s_sq] += 1
                smallest_sq = min(counts.keys(), key=lambda k: counts[k])
                self.player_squad[pid] = smallest_sq

        # Ensure wiring exists if a new squad formed mid-game
        if self.question_index >= 0 and self.game_mode == "bomb_defusal":
            self._ensure_bomb_wiring(self.question_index)

    def get_squad_members(self, sq_id: str) -> list[str]:
        return [
            p["id"]
            for p in sorted(self.players.values(), key=lambda x: x["joinedAt"])
            if self.player_squad.get(p["id"]) == sq_id
        ]

    def get_bomb_role(self, pid: str, q_idx: int) -> tuple[str, str, list[str]]:
        """Return (sq_id, role_name, squad_member_ids) for a player on question q_idx."""
        self.sync_squads(False)
        sq_id = self.player_squad.get(pid, "sq-0")
        members = self.get_squad_members(sq_id)
        if not members or pid not in members:
            return sq_id, "solo_cutter", [pid]
        m = len(members)
        pos = members.index(pid)
        rot = (pos + max(0, q_idx)) % m
        if m == 1:
            return sq_id, "solo_cutter", members
        if m == 2:
            return sq_id, ("cutter" if rot == 0 else "intel"), members
        if m == 3:
            role = "cutter" if rot == 0 else ("analyst" if rot == 1 else "decoder_all")
            return sq_id, role, members
        # m >= 4: 1 cutter, 1 analyst, rest split between decoder_ab & decoder_cd
        if rot == 0:
            role = "cutter"
        elif rot == 1:
            role = "analyst"
        elif rot % 2 == 0:
            role = "decoder_ab"
        else:
            role = "decoder_cd"
        return sq_id, role, members

    def _ensure_bomb_wiring(self, q_idx: int) -> None:
        fc = self.four_choices[q_idx]
        correct_opt = fc["correctIndex"]
        q_map = self.bomb_wirings.setdefault(q_idx, {})
        rng = random.Random(f"{self.code}-bomb-{q_idx}")
        for sq_id in self.squads:
            if sq_id not in q_map:
                perm = [0, 1, 2, 3]
                rng.shuffle(perm)
                correct_wire = perm.index(correct_opt)
                q_map[sq_id] = {
                    "wireToOpt": perm,
                    "correctWire": correct_wire,
                }

    # -------------------------------------------------------------------------
    # MATH IMPOSTOR INITIALIZATION & VOTING
    # -------------------------------------------------------------------------
    def _init_impostor_roles(self) -> None:
        pids = list(self.players.keys())
        self.ejected_ids = set()
        self.reactor_power = 55
        self.last_reactor_delta = 0
        self.last_sabotage_count = 0
        self.impostor_clues = []
        self.meeting_votes = {}
        self.last_vote_result = None
        self.impostor_winner = None
        self.impostor_bonus = {}
        if len(pids) <= 1:
            self.impostor_ids = set()
            return
        imp_cnt = 1 if len(pids) <= 5 else max(1, min(5, round(len(pids) / 6)))
        rng = random.Random()
        self.impostor_ids = set(rng.sample(pids, imp_cnt))

    def start_impostor_meeting(self) -> None:
        self.phase = "impostor_vote"
        self.meeting_votes = {}
        self.last_vote_result = None
        self.question_started_at = time.time()
        self.question_deadline = self.question_started_at + 25.0

    def resolve_impostor_meeting(self) -> None:
        active_pids = [pid for pid in self.players if pid not in self.ejected_ids]
        counts: dict[str, int] = {"skip": 0}
        for voter, target in self.meeting_votes.items():
            if voter not in active_pids:
                continue
            if target == "skip" or target in active_pids:
                counts[target] = counts.get(target, 0) + 1

        skip_votes = counts.get("skip", 0)
        suspect_counts = sorted(
            [(pid, cnt) for pid, cnt in counts.items() if pid != "skip"],
            key=lambda kv: -kv[1],
        )

        ejected_pid = None
        tie = False
        if suspect_counts:
            top_pid, top_cnt = suspect_counts[0]
            if len(suspect_counts) > 1 and suspect_counts[1][1] == top_cnt:
                tie = True
            elif top_cnt > skip_votes and top_cnt > 0:
                ejected_pid = top_pid

        was_impostor = False
        ejected_name = ""
        if ejected_pid and ejected_pid in self.players:
            self.ejected_ids.add(ejected_pid)
            ejected_name = self.players[ejected_pid]["name"]
            was_impostor = ejected_pid in self.impostor_ids
            if was_impostor:
                # Reward every voter who accurately voted for this Impostor!
                for voter, target in self.meeting_votes.items():
                    if target == ejected_pid and voter not in self.impostor_ids:
                        self.impostor_bonus[voter] = round(self.impostor_bonus.get(voter, 0.0) + 12.0, 1)
                self.reactor_power = min(100, self.reactor_power + 15)

        remaining_impostors = len([pid for pid in self.impostor_ids if pid in self.players and pid not in self.ejected_ids])
        if remaining_impostors == 0 and len(self.impostor_ids) > 0:
            self.impostor_winner = "crew"

        self.recompute_scores()
        self.last_vote_result = {
            "ejectedId": ejected_pid,
            "ejectedName": ejected_name,
            "wasImpostor": was_impostor,
            "tie": tie,
            "skipVotes": skip_votes,
            "voteCounts": {pid: cnt for pid, cnt in counts.items()},
            "remainingImpostors": remaining_impostors,
        }
        self.phase = "impostor_vote_result"
        self.question_deadline = 0.0

    # -------------------------------------------------------------------------
    # QUESTION LIFECYCLE & SCORING
    # -------------------------------------------------------------------------
    def open_question(self, idx: int) -> None:
        if idx < 0 or idx >= len(self.questions):
            return
        if idx == 0 and self.question_index == -1:
            # Fresh start of match!
            self.submissions = {}
            self.bomb_cuts = {}
            self.bomb_signals = {}
            self.bridge_switch_counts = {}
            if self.game_mode == "bomb_defusal":
                self.sync_squads(force_rebalance=False)
                for sq in self.squads.values():
                    sq["shield"] = 3
                    sq["score"] = 0.0
                    sq["defusedCount"] = 0
                    sq["explodedCount"] = 0
            elif self.game_mode == "math_impostor":
                self._init_impostor_roles()

        has_prior_scores = any(p["score"] > 0 for p in self.players.values())
        self.pre_question_ranks = (
            {row["id"]: row["rank"] for row in self.get_leaderboard(500)}
            if has_prior_scores
            else {}
        )
        self.question_index = idx
        self.phase = "answering"
        self.reveal_answer = False
        self.show_explanation = False
        self.question_started_at = time.time()
        base_tl = int(self.questions[idx].get("timeLimit", 30) or 0)
        if self.game_mode == "bomb_defusal" and base_tl > 0:
            base_tl = max(40, base_tl + 15)  # Give squads time to talk & cut!
        self.question_deadline = (self.question_started_at + base_tl) if base_tl > 0 else 0.0
        self.submissions.setdefault(idx, {})

        if self.game_mode == "bomb_defusal":
            self.sync_squads(False)
            self._ensure_bomb_wiring(idx)
            self.bomb_cuts.setdefault(idx, {})
            self.bomb_signals.setdefault(idx, {})
        elif self.game_mode == "glass_bridge":
            self.bridge_switch_counts.setdefault(idx, {})

    def start_bridge_debate(self) -> None:
        """Transition Glass Bridge from Pha 1 (secret step) -> Pha 2 (15s open debate & live jumping!)."""
        if self.game_mode != "glass_bridge" or self.phase != "answering":
            return
        self.phase = "bridge_debate"
        self.question_started_at = time.time()
        self.question_deadline = self.question_started_at + 15.0

    def recompute_scores(self) -> None:
        scoring_on = bool(self.settings.get("scoringEnabled", True))
        for p in self.players.values():
            p["score"] = 0.0
            p["correctCount"] = 0
            p["answeredCount"] = 0
            p["streak"] = 0
            p["totalResponseMs"] = 0

        if self.game_mode == "bomb_defusal":
            for sq in self.squads.values():
                sq["score"] = 0.0
                sq["defusedCount"] = 0
                sq["explodedCount"] = 0
                sq["shield"] = 3

            for qi in sorted(self.bomb_cuts.keys()):
                cuts = self.bomb_cuts[qi]
                defused_list = [c for sq_id, c in cuts.items() if sq_id in self.squads and c["isDefused"]]
                defused_list.sort(key=lambda c: (c["responseMs"], c["submittedAt"]))
                k = len(defused_list)
                sq_pts: dict[str, float] = {}
                for r, c in enumerate(defused_list):
                    if not scoring_on:
                        sq_pts[c["squadId"]] = 0.0
                    elif k <= 1:
                        sq_pts[c["squadId"]] = 20.0
                    else:
                        sq_pts[c["squadId"]] = round(20.0 - 10.0 * (r / (k - 1)), 1)

                for sq_id, c in cuts.items():
                    if sq_id not in self.squads:
                        continue
                    pts = sq_pts.get(sq_id, 0.0) if c["isDefused"] else 0.0
                    c["pointsEarned"] = pts
                    sq = self.squads[sq_id]
                    sq["score"] = round(sq["score"] + pts, 1)
                    if c["isDefused"]:
                        sq["defusedCount"] += 1
                    else:
                        sq["explodedCount"] += 1
                        sq["shield"] = max(0, sq["shield"] - 1)

                    for pid in self.get_squad_members(sq_id):
                        p = self.players[pid]
                        p["score"] = round(p["score"] + pts, 1)
                        p["answeredCount"] += 1
                        p["totalResponseMs"] += int(c["responseMs"])
                        if c["isDefused"]:
                            p["correctCount"] += 1
                            p["streak"] += 1
                        else:
                            p["streak"] = 0
            return

        # Standard / Impostor / Glass Bridge individual scoring
        for qi in sorted(self.submissions.keys()):
            subs = self.submissions[qi]
            correct_subs = [
                sub for pid, sub in subs.items()
                if pid in self.players and sub["isCorrect"] and not sub["payload"].get("sabotage")
            ]
            correct_subs.sort(key=lambda s: (s["responseMs"], s["submittedAt"], s["playerId"]))
            k = len(correct_subs)
            speed_points: dict[str, float] = {}
            for r, sub in enumerate(correct_subs):
                if not scoring_on:
                    speed_points[sub["playerId"]] = 0.0
                elif k <= 1:
                    speed_points[sub["playerId"]] = 20.0
                else:
                    speed_points[sub["playerId"]] = round(20.0 - 10.0 * (r / (k - 1)), 1)

            for pid, sub in subs.items():
                if pid not in self.players:
                    continue
                is_sab = bool(sub["payload"].get("sabotage")) and pid in self.impostor_ids
                if not scoring_on:
                    pts = 0.0
                elif is_sab:
                    pts = 14.0  # Covert sabotage reward for Impostor
                elif sub["isCorrect"]:
                    pts = speed_points.get(pid, 10.0)
                elif sub["accuracy"] > 0:
                    pts = round(10.0 * float(sub["accuracy"]), 1)
                else:
                    pts = 0.0
                sub["pointsEarned"] = pts

                p = self.players[pid]
                p["score"] = round(p["score"] + pts, 1)
                p["answeredCount"] += 1
                p["totalResponseMs"] += int(sub["responseMs"])
                if sub["isCorrect"]:
                    p["correctCount"] += 1
                    p["streak"] += 1
                else:
                    p["streak"] = 0

        if self.game_mode == "math_impostor" and scoring_on:
            for pid, bonus in self.impostor_bonus.items():
                if pid in self.players:
                    self.players[pid]["score"] = round(self.players[pid]["score"] + bonus, 1)

    def _evaluate_impostor_round(self, q_idx: int) -> None:
        subs = self.submissions.get(q_idx, {})
        active_crew = [pid for pid in self.players if pid not in self.impostor_ids and pid not in self.ejected_ids]
        active_imps = [pid for pid in self.impostor_ids if pid in self.players and pid not in self.ejected_ids]

        crew_correct = sum(1 for pid in active_crew if subs.get(pid, {}).get("isCorrect"))
        crew_ratio = (crew_correct / len(active_crew)) if active_crew else 0.0

        saboteurs: list[str] = []
        wrong_opt_sab: list[str] = []
        for pid in active_imps:
            sub = subs.get(pid)
            if not sub:
                continue
            if sub["payload"].get("sabotage") or not sub["isCorrect"]:
                saboteurs.append(pid)
                ch = sub["payload"].get("choice")
                if ch is not None:
                    wrong_opt_sab.append(chr(65 + int(ch)))

        charge_gain = int(round(crew_ratio * 18)) - (4 if crew_ratio < 0.5 else 0)
        sab_drain = len(saboteurs) * 11
        delta = charge_gain - sab_drain
        self.last_reactor_delta = delta
        self.last_sabotage_count = len(saboteurs)
        self.reactor_power = max(0, min(100, self.reactor_power + delta))

        # Generate truthful Radar Clues for classroom deduction!
        rng = random.Random(f"{self.code}-clue-{q_idx}")
        clues: list[str] = []
        active_all = [pid for pid in self.players if pid not in self.ejected_ids]

        if saboteurs:
            culprit = rng.choice(saboteurs)
            innocents = [pid for pid in active_all if pid != culprit]
            sample_others = rng.sample(innocents, min(4, len(innocents)))
            lineup = [self.players[x]["name"] for x in ([culprit] + sample_others)]
            rng.shuffle(lineup)
            clues.append(
                f"Phát hiện {len(saboteurs)} tín hiệu phá hoại ngầm! Ít nhất 1 Kẻ Phá Hoại nằm trong nhóm: {', '.join(lineup)}."
            )
            if wrong_opt_sab:
                clues.append(
                    f"Dấu vết nhiễu sóng xuất hiện tại phương án {wrong_opt_sab[0]}."
                )
        elif active_imps:
            hidden_imp = rng.choice(active_imps)
            innocents = [pid for pid in active_all if pid != hidden_imp]
            sample_others = rng.sample(innocents, min(4, len(innocents)))
            lineup = [self.players[x]["name"] for x in ([hidden_imp] + sample_others)]
            rng.shuffle(lineup)
            clues.append(
                f"Câu này không có phá hoại lộ liễu, nhưng cảm biến phát hiện 1 mật vụ đang ẩn mình trong nhóm: {', '.join(lineup)}."
            )

        self.impostor_clues = clues
        if self.reactor_power <= 0:
            self.impostor_winner = "impostors"
        elif self.reactor_power >= 100:
            self.impostor_winner = "crew"

    def finalize_current_question(self, auto_triggered: bool = False) -> None:
        if self.question_index < 0:
            return
        self.phase = "review"
        self.reveal_answer = True
        self.question_deadline = 0.0

        if self.game_mode == "math_impostor":
            self._evaluate_impostor_round(self.question_index)

        self.recompute_scores()

        q_subs = self.submissions.get(self.question_index, {})
        q_cuts = self.bomb_cuts.get(self.question_index, {})
        lb = self.get_leaderboard(500)
        changes = []
        for row in lb[:10]:
            pid = row["id"]
            prev_r = self.pre_question_ranks.get(pid)
            delta = (prev_r - row["rank"]) if prev_r is not None else 0
            if self.game_mode == "bomb_defusal":
                sq_id = self.player_squad.get(pid, "")
                cut = q_cuts.get(sq_id)
                gained = round(float(cut["pointsEarned"]), 1) if cut else 0.0
                is_ok = bool(cut["isDefused"]) if cut else False
            else:
                sub = q_subs.get(pid)
                gained = round(float(sub["pointsEarned"]), 1) if sub else 0.0
                is_ok = bool(sub["isCorrect"]) if sub else False
            changes.append(
                {
                    "id": pid,
                    "rank": row["rank"],
                    "prevRank": prev_r,
                    "rankDelta": delta,
                    "name": row["name"],
                    "className": row["className"],
                    "avatar": row["avatar"],
                    "score": row["score"],
                    "pointsGained": gained,
                    "isCorrect": is_ok,
                }
            )
        self.last_rank_changes = changes
        self.last_rank_change_q = self.question_index
        self.last_rank_change_reason = "all_submitted" if auto_triggered else "host_closed"
        self.rank_change_seq += 1

    def _remaining_seconds(self) -> float | None:
        if self.phase not in ("answering", "bridge_debate", "impostor_vote"):
            return 0.0
        if self.question_deadline <= 0:
            return None
        return max(0.0, round(self.question_deadline - time.time(), 1))

    # -------------------------------------------------------------------------
    # QUESTION & MODE VIEWS FOR PLAYERS AND HOST
    # -------------------------------------------------------------------------
    def sanitize_question_for_player(self, idx: int, include_answers: bool, player_id: str | None = None) -> dict | None:
        if idx < 0 or idx >= len(self.questions):
            return None
        q = self.questions[idx]
        fc = self.four_choices[idx]

        # Mode 1: Asymmetric Bomb Defusal!
        if self.game_mode == "bomb_defusal":
            sq_id, role, members = self.get_bomb_role(player_id or "", idx)
            self._ensure_bomb_wiring(idx)
            wiring = self.bomb_wirings[idx].get(sq_id, {"wireToOpt": [0, 1, 2, 3], "correctWire": 0})
            w2o = wiring["wireToOpt"]
            out: dict[str, Any] = {
                "id": q["id"],
                "index": idx,
                "type": "bomb_module",
                "timeLimit": int(q.get("timeLimit", 30) or 0),
                "bombRole": role,
                "squadId": sq_id,
                "squadName": self.squads.get(sq_id, {}).get("name", "Đội"),
            }
            if include_answers:
                out["prompt"] = fc["adaptedPrompt"]
                out["explanation"] = q.get("explanation", "")
                out["correctWire"] = wiring["correctWire"]
                out["correctWireLabel"] = BOMB_WIRES[wiring["correctWire"]]["label"]
                out["correctText"] = fc["options"][fc["correctIndex"]]
                return out

            # Strictly partition information by role so teammates MUST talk!
            wire_cards = [
                {
                    "wireIndex": w["wireIndex"],
                    "colorId": w["colorId"],
                    "label": w["label"],
                    "hex": w["hex"],
                    "optionText": fc["options"][w2o[w["wireIndex"]]],
                }
                for w in BOMB_WIRES
            ]
            if role == "cutter":
                out["prompt"] = ""
                out["wires"] = [{k: v for k, v in wc.items() if k != "optionText"} for wc in wire_cards]
            elif role == "analyst":
                out["prompt"] = fc["adaptedPrompt"]
                out["wires"] = []
            elif role == "decoder_ab":
                out["prompt"] = ""
                out["wires"] = wire_cards[:2]
            elif role == "decoder_cd":
                out["prompt"] = ""
                out["wires"] = wire_cards[2:]
            elif role == "decoder_all":
                out["prompt"] = ""
                out["wires"] = wire_cards
            elif role == "intel":
                out["prompt"] = fc["adaptedPrompt"]
                out["wires"] = wire_cards
            else:  # solo_cutter
                out["prompt"] = fc["adaptedPrompt"]
                out["wires"] = wire_cards
            return out

        # Mode 2 & 3: Math Impostor & Glass Bridge use clean 4-choice adapter
        if self.game_mode in ("math_impostor", "glass_bridge"):
            out = {
                "id": q["id"],
                "index": idx,
                "type": "mcq",
                "prompt": fc["adaptedPrompt"],
                "image": q.get("image", ""),
                "timeLimit": int(q.get("timeLimit", 30) or 0),
                "data": {"options": fc["options"]},
            }
            if include_answers:
                out["explanation"] = q.get("explanation", "")
                out["data"] = {"options": fc["options"], "correctIndex": fc["correctIndex"]}
            return out

        # Classic mode: all 6 native interactive widgets
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

        if q_type == "mcq":
            out["data"] = {"options": data.get("options", [])}
        elif q_type == "true_false":
            out["data"] = {"statements": [{"text": s.get("text", "")} for s in data.get("statements", [])]}
        elif q_type == "short_answer":
            out["data"] = {"placeholder": data.get("placeholder", "Nhập câu trả lời của em...")}
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

        if self.game_mode == "bomb_defusal":
            self.sync_squads(False)
            cuts = self.bomb_cuts.get(idx, {})
            total_sq = len(self.squads)
            sub_sq = len(cuts)
            defused_sq = sum(1 for c in cuts.values() if c["isDefused"])
            fc = self.four_choices[idx]
            return {
                "totalSubmitted": sub_sq,
                "totalPlayers": total_sq,
                "fullCorrectCount": defused_sq,
                "fullCorrectPct": round((defused_sq / sub_sq) * 100, 1) if sub_sq else 0.0,
                "avgAccuracyPct": round((defused_sq / sub_sq) * 100, 1) if sub_sq else 0.0,
                "avgResponseMs": int(sum(c["responseMs"] for c in cuts.values()) / sub_sq) if sub_sq else 0,
                "optionStats": [
                    {
                        "index": i,
                        "label": chr(65 + i),
                        "text": opt,
                        "count": defused_sq if i == fc["correctIndex"] else 0,
                        "pct": round((defused_sq / sub_sq) * 100, 1) if (sub_sq and i == fc["correctIndex"]) else 0.0,
                        "isCorrect": i == fc["correctIndex"],
                        "players": [],
                    }
                    for i, opt in enumerate(fc["options"])
                ],
            }

        if self.game_mode in ("math_impostor", "glass_bridge"):
            fc = self.four_choices[idx]
            options = fc["options"]
            subs = self.submissions.get(idx, {})
            total = len(subs)
            correct_full = sum(1 for s in subs.values() if s["isCorrect"])
            counts = [0] * len(options)
            players_by_opt: list[list[dict]] = [[] for _ in options]
            for pid, sub in subs.items():
                ch = sub["payload"].get("choice")
                if ch is not None and 0 <= int(ch) < len(options):
                    ci = int(ch)
                    counts[ci] += 1
                    p = self.players.get(pid)
                    if p:
                        players_by_opt[ci].append({"id": pid, "name": p["name"], "avatar": p.get("avatar", "blue")})
            return {
                "totalSubmitted": total,
                "totalPlayers": len(self.players),
                "fullCorrectCount": correct_full,
                "fullCorrectPct": round((correct_full / total) * 100, 1) if total else 0.0,
                "avgAccuracyPct": round((correct_full / total) * 100, 1) if total else 0.0,
                "avgResponseMs": int(sum(s["responseMs"] for s in subs.values()) / total) if total else 0,
                "optionStats": [
                    {
                        "index": i,
                        "label": chr(65 + i),
                        "text": opt,
                        "count": counts[i],
                        "pct": round((counts[i] / total) * 100, 1) if total else 0.0,
                        "isCorrect": i == fc["correctIndex"],
                        "players": [x["name"] for x in players_by_opt[i][:50]],
                        "playerBadges": players_by_opt[i][:50],
                    }
                    for i, opt in enumerate(options)
                ],
            }

        # Classic mode analytics (all 6 question types)
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
                    groups[key] = {"label": raw, "count": 0, "isCorrect": sub["isCorrect"], "players": []}
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
                    "avatar": p.get("avatar", "blue"),
                    "score": p["score"],
                    "correctCount": p["correctCount"],
                    "answeredCount": p["answeredCount"],
                    "streak": p["streak"],
                    "isBot": p.get("isBot", False),
                    "squadName": self.squads.get(self.player_squad.get(p["id"], ""), {}).get("name", "") if self.game_mode == "bomb_defusal" else "",
                }
            )
        return out

    def build_mode_host_data(self) -> dict:
        q_idx = self.question_index
        if self.game_mode == "bomb_defusal":
            self.sync_squads(False)
            if q_idx >= 0:
                self._ensure_bomb_wiring(q_idx)
            cuts = self.bomb_cuts.get(q_idx, {}) if q_idx >= 0 else {}
            squad_cards = []
            for sq_id, sq in sorted(self.squads.items(), key=lambda kv: (-kv[1]["score"], kv[0])):
                members = self.get_squad_members(sq_id)
                cutter_name = ""
                member_badges = []
                for m_pid in members:
                    p = self.players[m_pid]
                    _, r_name, _ = self.get_bomb_role(m_pid, max(0, q_idx))
                    if r_name in ("cutter", "solo_cutter"):
                        cutter_name = p["name"]
                    member_badges.append(
                        {"id": m_pid, "name": p["name"], "avatar": p.get("avatar", "blue"), "role": r_name}
                    )
                cut = cuts.get(sq_id)
                squad_cards.append(
                    {
                        "id": sq_id,
                        "name": sq["name"],
                        "shield": sq["shield"],
                        "score": sq["score"],
                        "defusedCount": sq["defusedCount"],
                        "explodedCount": sq["explodedCount"],
                        "cutterName": cutter_name,
                        "members": member_badges,
                        "status": (
                            "idle"
                            if q_idx < 0
                            else ("defused" if cut["isDefused"] else "exploded")
                            if cut
                            else "ticking"
                        ),
                        "cutWireHex": BOMB_WIRES[cut["wireIndex"]]["hex"] if cut else "",
                        "cutWireLabel": BOMB_WIRES[cut["wireIndex"]]["label"] if cut else "",
                        "pointsEarned": cut["pointsEarned"] if cut else 0.0,
                    }
                )
            return {"squads": squad_cards}

        if self.game_mode == "math_impostor":
            active_players = [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "avatar": p.get("avatar", "blue"),
                    "ejected": p["id"] in self.ejected_ids,
                    "voted": p["id"] in self.meeting_votes,
                    "wasImpostor": (p["id"] in self.impostor_ids) if (p["id"] in self.ejected_ids or self.phase == "finished") else None,
                }
                for p in sorted(self.players.values(), key=lambda x: x["name"])
            ]
            active_non_ejected = [p for p in active_players if not p["ejected"]]
            active_imp_cnt = len([pid for pid in self.impostor_ids if pid in self.players and pid not in self.ejected_ids])
            vote_tallies: dict[str, int] = {}
            for voter, target in self.meeting_votes.items():
                if voter not in self.ejected_ids:
                    vote_tallies[target] = vote_tallies.get(target, 0) + 1
            return {
                "reactorPower": self.reactor_power,
                "lastReactorDelta": self.last_reactor_delta,
                "lastSabotageCount": self.last_sabotage_count,
                "remainingImpostors": active_imp_cnt,
                "totalImpostors": len(self.impostor_ids),
                "clues": self.impostor_clues,
                "suspects": active_players,
                "votesCast": len([v for v in self.meeting_votes if v not in self.ejected_ids]),
                "eligibleVoters": len(active_non_ejected),
                "voteTallies": vote_tallies,
                "lastVoteResult": self.last_vote_result,
                "winner": self.impostor_winner,
                "impostorNames": [self.players[pid]["name"] for pid in self.impostor_ids if pid in self.players] if self.phase == "finished" else [],
            }

        if self.game_mode == "glass_bridge":
            total_switches = sum(self.bridge_switch_counts.get(q_idx, {}).values()) if q_idx >= 0 else 0
            return {
                "stepNumber": q_idx + 1,
                "totalSteps": len(self.questions),
                "totalSwitches": total_switches,
            }

        return {}

    def build_host_state(self) -> dict:
        q = self.current_question()
        q_idx = self.question_index
        analytics = self.compute_analytics(q_idx) if q is not None else {}

        # Adapt question view for 4-choice modes on host review screen
        host_q = q
        if q is not None and self.game_mode in ("bomb_defusal", "math_impostor", "glass_bridge"):
            fc = self.four_choices[q_idx]
            host_q = {
                **q,
                "type": "mcq",
                "prompt": fc["adaptedPrompt"],
                "data": {"options": fc["options"], "correctIndex": fc["correctIndex"]},
            }

        subs = self.submissions.get(q_idx, {}) if q is not None else {}
        player_details = []
        for p in sorted(self.players.values(), key=lambda x: x["name"]):
            sub = subs.get(p["id"])
            player_details.append(
                {
                    "id": p["id"],
                    "name": p["name"],
                    "className": p.get("className", ""),
                    "avatar": p.get("avatar", "blue"),
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
            "gameMode": self.game_mode,
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
            "leftPlayers": self.left_players[-30:],
            "question": host_q,
            "questionOutline": [
                {"index": i, "type": qq["type"], "prompt": qq["prompt"][:80]}
                for i, qq in enumerate(self.questions)
            ],
            "analytics": analytics,
            "modeData": self.build_mode_host_data(),
            "leaderboard": self.get_leaderboard(20),
            "rankChangeSeq": self.rank_change_seq,
            "lastRankChangeQ": self.last_rank_change_q,
            "lastRankChangeReason": self.last_rank_change_reason,
            "rankChanges": self.last_rank_changes,
        }

    def build_player_state(self, player_id: str | None) -> dict:
        q_idx = self.question_index
        include_answers = self.reveal_answer or self.phase in ("finished", "closed")
        q_view = self.sanitize_question_for_player(q_idx, include_answers, player_id) if q_idx >= 0 else None

        player = self.players.get(player_id) if player_id else None
        my_sub = None
        mode_player_data: dict[str, Any] = {}

        if self.game_mode == "bomb_defusal" and player_id and player_id in self.players:
            sq_id, role, members = self.get_bomb_role(player_id, max(0, q_idx))
            sq = self.squads.get(sq_id, {})
            teammates = [
                {
                    "id": m_id,
                    "name": self.players[m_id]["name"],
                    "avatar": self.players[m_id].get("avatar", "blue"),
                    "role": self.get_bomb_role(m_id, max(0, q_idx))[1] if q_idx >= 0 else "",
                }
                for m_id in members
                if m_id in self.players
            ]
            cut = self.bomb_cuts.get(q_idx, {}).get(sq_id) if q_idx >= 0 else None
            sigs = self.bomb_signals.get(q_idx, {}).get(sq_id, {}) if q_idx >= 0 else {}
            signal_counts: dict[int, int] = {}
            for w_i in sigs.values():
                signal_counts[w_i] = signal_counts.get(w_i, 0) + 1
            mode_player_data = {
                "squadId": sq_id,
                "squadName": sq.get("name", "Đội"),
                "shield": sq.get("shield", 3),
                "squadScore": sq.get("score", 0.0),
                "role": role,
                "teammates": teammates,
                "allSquads": [{"id": k, "name": v["name"], "count": len(self.get_squad_members(k))} for k, v in self.squads.items()] if self.phase == "lobby" else [],
                "signalCounts": signal_counts,
                "mySignal": sigs.get(player_id),
                "squadCut": {
                    "cut": True,
                    "wireIndex": cut["wireIndex"],
                    "wireLabel": BOMB_WIRES[cut["wireIndex"]]["label"],
                    "isDefused": cut["isDefused"] if include_answers else None,
                    "pointsEarned": cut["pointsEarned"] if include_answers else 0.0,
                }
                if cut
                else None,
            }
            if cut:
                my_sub = {
                    "submitted": True,
                    "payload": {"wireIndex": cut["wireIndex"]},
                    "responseMs": cut["responseMs"],
                    "isCorrect": cut["isDefused"] if include_answers else None,
                    "accuracy": (1.0 if cut["isDefused"] else 0.0) if include_answers else None,
                    "pointsEarned": cut["pointsEarned"] if include_answers else 0.0,
                }

        elif player_id and q_idx >= 0:
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

        if self.game_mode == "math_impostor" and player_id and player_id in self.players:
            is_imp = player_id in self.impostor_ids
            is_ej = player_id in self.ejected_ids
            fc = self.four_choices.get(q_idx) if q_idx >= 0 else None
            suspects = (
                [
                    {"id": p["id"], "name": p["name"], "avatar": p.get("avatar", "blue")}
                    for p in sorted(self.players.values(), key=lambda x: x["name"])
                    if p["id"] not in self.ejected_ids and p["id"] != player_id
                ]
                if self.phase == "impostor_vote"
                else []
            )
            mode_player_data = {
                "secretRole": "impostor" if is_imp else ("crew" if self.impostor_ids else "pending"),
                "ejected": is_ej,
                "reactorPower": self.reactor_power,
                "correctHintIndex": fc["correctIndex"] if (is_imp and fc and not is_ej) else None,
                "clues": self.impostor_clues,
                "suspects": suspects,
                "myVote": self.meeting_votes.get(player_id),
                "lastVoteResult": self.last_vote_result,
                "winner": self.impostor_winner,
            }

        elif self.game_mode == "glass_bridge" and q_idx >= 0:
            subs = self.submissions.get(q_idx, {})
            panel_counts = [0, 0, 0, 0]
            for s in subs.values():
                ch = s["payload"].get("choice")
                if ch is not None and 0 <= int(ch) < 4:
                    panel_counts[int(ch)] += 1
            mode_player_data = {
                "panelCounts": panel_counts if self.phase in ("bridge_debate", "review") else None,
                "canJump": self.phase == "bridge_debate",
            }

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
            "gameMode": self.game_mode,
            "setTitle": self.set_title,
            "phase": self.phase,
            "questionIndex": q_idx,
            "totalQuestions": len(self.questions),
            "remainingSeconds": self._remaining_seconds(),
            "revealAnswer": self.reveal_answer,
            "showExplanation": self.show_explanation,
            "teacherNote": self.teacher_notes.get(q_idx, "") if (self.reveal_answer or self.show_explanation) else "",
            "scoringEnabled": self.settings["scoringEnabled"],
            "allowChangeAnswer": self.settings["allowChangeAnswer"] or (self.phase == "bridge_debate"),
            "playerCount": len(self.players),
            "submittedCount": (
                len(self.bomb_cuts.get(q_idx, {}))
                if self.game_mode == "bomb_defusal" and q_idx >= 0
                else len(self.submissions.get(q_idx, {}))
                if q_idx >= 0
                else 0
            ),
            "question": q_view,
            "mySubmission": my_sub,
            "modeData": mode_player_data,
            "me": {
                "id": player["id"],
                "name": player["name"],
                "className": player.get("className", ""),
                "avatar": player.get("avatar", "blue"),
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
    # Multi-Mode Classroom Bot Simulator (40-student simulation for all 4 modes!)
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
                    "score": 0.0,
                    "correctCount": 0,
                    "answeredCount": 0,
                    "streak": 0,
                    "totalResponseMs": 0,
                    "joinedAt": time.time(),
                    "isBot": True,
                }
                room.bot_ids.append(pid)
                added += 1
            if room.game_mode == "bomb_defusal":
                room.sync_squads(force_rebalance=(room.phase == "lobby"))
            room.bot_sim_active = True
            room.bump()
        if room.phase == "answering":
            self._trigger_bots_answer(room, room.question_index)
        return added

    def _make_bot_payload(self, question: dict, rng: random.Random) -> dict:
        q_type = question.get("type", "mcq")
        data = question.get("data", {})
        smart = rng.random() < 0.68

        if q_type == "mcq":
            opts = data.get("options", [])
            n = len(opts)
            ci = int(data.get("correctIndex", 0))
            if smart or n <= 1:
                return {"choice": ci}
            wrongs = [i for i in range(n) if i != ci]
            return {"choice": wrongs[0] if rng.random() < 0.55 else rng.choice(wrongs)}

        if q_type == "true_false":
            stmts = data.get("statements", [])
            return {
                "answers": [
                    (bool(st.get("answer")) if rng.random() < (0.52 if idx == 1 and len(stmts) > 1 else 0.78) else (not bool(st.get("answer"))))
                    for idx, st in enumerate(stmts)
                ]
            }

        if q_type == "short_answer":
            accepted = data.get("acceptedAnswers", ["0"])
            if smart and accepted:
                return {"text": accepted[0]}
            try:
                num = float(accepted[0].replace(",", "."))
                return {"text": rng.choice([str(int(num) - 3), str(int(num) + 1), str(int(num) * 2), "2"])}
            except Exception:
                return {"text": rng.choice(["0", "2", "Sai dấu"])}

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
            if room.game_mode == "bomb_defusal":
                # Each squad's cutter bot cuts a wire after simulated squad talk!
                time.sleep(0.4)
                with room.cond:
                    sq_ids = list(room.squads.keys())
                rng.shuffle(sq_ids)
                for sq_id in sq_ids:
                    time.sleep(rng.uniform(0.25, 0.55))
                    with room.cond:
                        if room.phase != "answering" or room.question_index != target_q_idx:
                            return
                        if sq_id in room.bomb_cuts.get(target_q_idx, {}):
                            continue
                        members = room.get_squad_members(sq_id)
                        cutter_pid = next(
                            (m for m in members if room.get_bomb_role(m, target_q_idx)[1] in ("cutter", "solo_cutter") and m in room.bot_ids),
                            None,
                        )
                        if not cutter_pid:
                            continue
                        wiring = room.bomb_wirings[target_q_idx][sq_id]
                        cw = wiring["correctWire"]
                        wrongs = [w for w in range(4) if w != cw]
                        picked_w = cw if rng.random() < 0.72 else rng.choice(wrongs)
                        self._record_bomb_cut_locked(room, cutter_pid, target_q_idx, picked_w)
                return

            bot_list = list(room.bot_ids)
            rng.shuffle(bot_list)
            for pid in bot_list:
                time.sleep(rng.uniform(0.03, 0.10))
                with room.cond:
                    if room.phase != "answering" or room.question_index != target_q_idx:
                        return
                    if pid not in room.players:
                        continue
                    subs = room.submissions.setdefault(target_q_idx, {})
                    if pid in subs:
                        continue

                    if room.game_mode in ("math_impostor", "glass_bridge"):
                        fc = room.four_choices[target_q_idx]
                        ci = fc["correctIndex"]
                        wrongs = [i for i in range(4) if i != ci]
                        if room.game_mode == "math_impostor" and pid in room.impostor_ids and pid not in room.ejected_ids:
                            if rng.random() < 0.72:
                                payload = {"choice": rng.choice(wrongs), "sabotage": True}
                            else:
                                payload = {"choice": ci, "sabotage": False}
                        else:
                            payload = {"choice": ci if rng.random() < 0.70 else rng.choice(wrongs)}
                    else:
                        q = room.current_question()
                        if not q:
                            return
                        payload = self._make_bot_payload(q, rng)

                    self._record_submission_locked(room, pid, target_q_idx, payload)

            # If Glass Bridge auto-transitioned to bridge_debate, let a few bots jump panels live!
            with room.cond:
                in_debate = room.game_mode == "glass_bridge" and room.phase == "bridge_debate" and room.question_index == target_q_idx
            if in_debate:
                self._trigger_bots_bridge_jumps(room, target_q_idx)

        threading.Thread(target=_worker, daemon=True).start()

    def _trigger_bots_bridge_jumps(self, room: LiveRoom, target_q_idx: int) -> None:
        if not room.bot_ids:
            return

        def _jumper():
            rng = random.Random()
            jumpers = rng.sample(room.bot_ids, min(max(2, len(room.bot_ids) // 3), len(room.bot_ids)))
            for pid in jumpers:
                time.sleep(rng.uniform(0.35, 0.85))
                with room.cond:
                    if room.phase != "bridge_debate" or room.question_index != target_q_idx:
                        return
                    if pid not in room.players:
                        continue
                    fc = room.four_choices[target_q_idx]
                    new_ch = fc["correctIndex"] if rng.random() < 0.65 else rng.randint(0, 3)
                    self._record_submission_locked(room, pid, target_q_idx, {"choice": new_ch})

        threading.Thread(target=_jumper, daemon=True).start()

    def _trigger_bots_vote(self, room: LiveRoom) -> None:
        if not room.bot_ids:
            return

        def _voter():
            rng = random.Random()
            bots = [b for b in room.bot_ids if b in room.players and b not in room.ejected_ids]
            rng.shuffle(bots)
            for pid in bots:
                time.sleep(rng.uniform(0.05, 0.14))
                with room.cond:
                    if room.phase != "impostor_vote":
                        return
                    if pid in room.meeting_votes or pid in room.ejected_ids:
                        continue
                    active = [x for x in room.players if x not in room.ejected_ids and x != pid]
                    if not active:
                        continue
                    # Crew bots slightly favor suspects whose names appear in radar clues!
                    clue_text = " ".join(room.impostor_clues)
                    clue_suspects = [x for x in active if room.players[x]["name"] in clue_text]
                    if pid in room.impostor_ids:
                        innocents = [x for x in active if x not in room.impostor_ids]
                        choice = rng.choice(innocents) if innocents else "skip"
                    elif clue_suspects and rng.random() < 0.72:
                        choice = rng.choice(clue_suspects)
                    elif rng.random() < 0.2:
                        choice = "skip"
                    else:
                        choice = rng.choice(active)
                    room.meeting_votes[pid] = choice
                    eligible = [x for x in room.players if x not in room.ejected_ids]
                    if len([v for v in room.meeting_votes if v in eligible]) >= len(eligible):
                        room.resolve_impostor_meeting()
                    room.bump()

        threading.Thread(target=_voter, daemon=True).start()

    def _record_bomb_cut_locked(self, room: LiveRoom, player_id: str, q_idx: int, wire_index: int) -> dict:
        sq_id, role, _ = room.get_bomb_role(player_id, q_idx)
        cuts = room.bomb_cuts.setdefault(q_idx, {})
        if sq_id in cuts:
            return cuts[sq_id]
        room._ensure_bomb_wiring(q_idx)
        wiring = room.bomb_wirings[q_idx][sq_id]
        w_idx = max(0, min(3, int(wire_index)))
        is_defused = w_idx == wiring["correctWire"]
        elapsed_ms = max(200, int((time.time() - room.question_started_at) * 1000))
        rec = {
            "squadId": sq_id,
            "cutterId": player_id,
            "wireIndex": w_idx,
            "isDefused": is_defused,
            "pointsEarned": 0.0,
            "responseMs": elapsed_ms,
            "submittedAt": time.time(),
        }
        cuts[sq_id] = rec
        room.recompute_scores()

        active_squads = [sid for sid in room.squads if len(room.get_squad_members(sid)) > 0]
        if room.phase == "answering" and active_squads and all(sid in cuts for sid in active_squads):
            room.finalize_current_question(auto_triggered=True)

        room.bump()
        return rec

    def _record_submission_locked(self, room: LiveRoom, player_id: str, q_idx: int, payload: dict) -> dict:
        """Must be called while holding room.cond."""
        subs = room.submissions.setdefault(q_idx, {})
        existing = subs.get(player_id)
        can_change = room.settings["allowChangeAnswer"] or (room.phase == "bridge_debate")
        if existing and not can_change:
            return existing

        if room.game_mode in ("math_impostor", "glass_bridge"):
            fc = room.four_choices[q_idx]
            ch = payload.get("choice")
            is_correct = (ch is not None and int(ch) == fc["correctIndex"])
            accuracy = 1.0 if is_correct else 0.0
        else:
            q = room.questions[q_idx]
            is_correct, accuracy = grade_submission(q, payload)

        if existing and room.phase == "bridge_debate":
            sw_map = room.bridge_switch_counts.setdefault(q_idx, {})
            if existing["payload"].get("choice") != payload.get("choice"):
                sw_map[player_id] = sw_map.get(player_id, 0) + 1
            elapsed_ms = existing["responseMs"]
        else:
            elapsed_ms = max(200, int((time.time() - room.question_started_at) * 1000))

        record = {
            "playerId": player_id,
            "payload": payload,
            "isCorrect": is_correct,
            "accuracy": round(accuracy, 4),
            "pointsEarned": 0.0,
            "responseMs": elapsed_ms,
            "submittedAt": time.time(),
        }
        subs[player_id] = record
        room.recompute_scores()

        if room.phase == "answering" and len(room.players) > 0 and len(subs) >= len(room.players):
            if room.game_mode == "glass_bridge":
                room.start_bridge_debate()
            else:
                room.finalize_current_question(auto_triggered=True)

        room.bump()
        return subs[player_id]

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
    # Main Request Router
    # -------------------------------------------------------------------------
    def handle_http(self, handler, method: str, parsed_url) -> bool:
        path = unquote(parsed_url.path)
        query = parse_qs(parsed_url.query)

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
        if method == "GET" and path == "/api/live/info":
            self._send_json(
                handler,
                200,
                {
                    "app": "Edu Live Game",
                    "lanIps": get_lan_ips(),
                    "activeRooms": len(self.rooms),
                    "questionSetsCount": len(self.question_sets),
                    "gameModes": list(VALID_GAME_MODES),
                },
            )
            return True

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
                self._send_json(handler, 400, {"error": "Không đọc được câu hỏi hợp lệ nào từ tệp.", "warnings": warnings})
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

        # Create Live Room (accepts gameMode!)
        if method == "POST" and path == "/api/live/rooms":
            body = self._read_json_body(handler)
            set_id = str(body.get("setId", ""))
            game_mode = str(body.get("gameMode", "classic")).strip()
            with self.lock:
                q_set = next((s for s in self.question_sets if s["id"] == set_id), None)
                if not q_set:
                    self._send_json(handler, 404, {"error": "Không tìm thấy bộ câu hỏi để mở phòng."})
                    return True
                if not q_set.get("questions"):
                    self._send_json(handler, 400, {"error": "Bộ câu hỏi chưa có câu hỏi nào."})
                    return True
                code = self._gen_room_code()
                room = LiveRoom(code, q_set, body.get("settings"), game_mode=game_mode)
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
                if avatar not in AVATARS:
                    avatar = random.choice(AVATARS)
                existing_pid = str(body.get("playerId", "")).strip()

                if not name:
                    self._send_json(handler, 400, {"error": "Vui lòng nhập họ tên của em để vào phòng."})
                    return True

                with room.cond:
                    if room.phase == "closed":
                        self._send_json(handler, 410, {"error": "Phòng chơi này đã được giáo viên đóng."})
                        return True
                    if existing_pid and existing_pid in room.players:
                        p = room.players[existing_pid]
                        p["name"] = name
                        if class_name:
                            p["className"] = class_name
                        p["avatar"] = avatar
                        pid = existing_pid
                    else:
                        same = next(
                            (p for p in room.players.values() if not p.get("isBot") and p["name"].lower() == name.lower()),
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
                                "score": 0.0,
                                "correctCount": 0,
                                "answeredCount": 0,
                                "streak": 0,
                                "totalResponseMs": 0,
                                "joinedAt": time.time(),
                                "isBot": False,
                            }
                    if room.game_mode == "bomb_defusal":
                        room.sync_squads(force_rebalance=(room.phase == "lobby"))
                    room.bump()
                    p_state = room.build_player_state(pid)
                self._send_json(handler, 200, {"playerId": pid, "state": p_state})
                return True

            if method == "POST" and sub == "switch_squad":
                body = self._read_json_body(handler)
                pid = str(body.get("playerId", "")).strip()
                target_sq = str(body.get("squadId", "")).strip()
                with room.cond:
                    if pid not in room.players:
                        self._send_json(handler, 404, {"error": "Không tìm thấy học sinh."})
                        return True
                    if room.phase != "lobby" or target_sq not in room.squads:
                        self._send_json(handler, 400, {"error": "Chỉ có thể đổi đội trong phòng chờ."})
                        return True
                    room.player_squad[pid] = target_sq
                    room.bump()
                    p_state = room.build_player_state(pid)
                self._send_json(handler, 200, {"ok": True, "state": p_state})
                return True

            if method == "POST" and sub == "leave":
                body = self._read_json_body(handler)
                pid = str(body.get("playerId", "")).strip()
                reason = str(body.get("reason", "manual")).strip()[:30]
                with room.cond:
                    removed = room.players.pop(pid, None)
                    if removed:
                        if pid in room.bot_ids:
                            room.bot_ids.remove(pid)
                        room.player_squad.pop(pid, None)
                        room.left_players.append(
                            {
                                "name": removed["name"],
                                "className": removed.get("className", ""),
                                "reason": reason,
                                "leftAt": now_iso(),
                            }
                        )
                        if room.game_mode == "bomb_defusal":
                            room.sync_squads(False)
                        room.recompute_scores()
                        if room.phase == "answering" and room.question_index >= 0 and len(room.players) > 0:
                            if room.game_mode == "bomb_defusal":
                                cuts = room.bomb_cuts.get(room.question_index, {})
                                active_sq = [sid for sid in room.squads if len(room.get_squad_members(sid)) > 0]
                                if active_sq and all(sid in cuts for sid in active_sq):
                                    room.finalize_current_question(auto_triggered=True)
                            else:
                                q_subs = room.submissions.get(room.question_index, {})
                                active_submitted = sum(1 for spid in q_subs if spid in room.players)
                                if active_submitted >= len(room.players):
                                    if room.game_mode == "glass_bridge":
                                        room.start_bridge_debate()
                                    else:
                                        room.finalize_current_question(auto_triggered=True)
                        room.bump()
                self._send_json(handler, 200, {"ok": True, "left": bool(removed)})
                return True

            if method == "POST" and sub == "submit":
                body = self._read_json_body(handler)
                pid = str(body.get("playerId", "")).strip()
                payload = body.get("payload", {})
                trigger_jumps_for: int | None = None
                with room.cond:
                    if pid not in room.players:
                        self._send_json(handler, 404, {"error": "Không tìm thấy phiên học sinh. Hãy vào lại phòng."})
                        return True
                    if room.phase not in ("answering", "bridge_debate"):
                        self._send_json(handler, 409, {"error": "Đã hết thời gian nộp câu trả lời cho câu hỏi này."})
                        return True
                    q_idx = room.question_index
                    if q_idx < 0 or q_idx >= len(room.questions):
                        self._send_json(handler, 400, {"error": "Chưa có câu hỏi nào đang mở."})
                        return True

                    if room.game_mode == "bomb_defusal":
                        sq_id, role, _ = room.get_bomb_role(pid, q_idx)
                        if "signalWire" in payload:
                            # Non-cutter squadmate sending a visual wire hint to their squad's cutter!
                            sigs = room.bomb_signals.setdefault(q_idx, {}).setdefault(sq_id, {})
                            sigs[pid] = max(0, min(3, int(payload["signalWire"])))
                            room.bump()
                            p_state = room.build_player_state(pid)
                            self._send_json(handler, 200, {"ok": True, "submitted": False, "state": p_state})
                            return True
                        if role not in ("cutter", "solo_cutter"):
                            self._send_json(handler, 403, {"error": "Chỉ Thợ Gỡ Bom của đội mới có kìm cắt dây ở câu này!"})
                            return True
                        rec = self._record_bomb_cut_locked(room, pid, q_idx, int(payload.get("wireIndex", 0)))
                        p_state = room.build_player_state(pid)
                        self._send_json(handler, 200, {"ok": True, "submitted": True, "responseMs": rec["responseMs"], "state": p_state})
                        return True

                    prev_phase = room.phase
                    rec = self._record_submission_locked(room, pid, q_idx, payload)
                    if prev_phase == "answering" and room.phase == "bridge_debate" and room.bot_sim_active:
                        trigger_jumps_for = q_idx
                    p_state = room.build_player_state(pid)
                if trigger_jumps_for is not None:
                    self._trigger_bots_bridge_jumps(room, trigger_jumps_for)
                self._send_json(handler, 200, {"ok": True, "submitted": True, "responseMs": rec["responseMs"], "state": p_state})
                return True

            if method == "POST" and sub == "vote":
                body = self._read_json_body(handler)
                pid = str(body.get("playerId", "")).strip()
                suspect_id = str(body.get("suspectId", "skip")).strip()
                with room.cond:
                    if pid not in room.players or pid in room.ejected_ids:
                        self._send_json(handler, 403, {"error": "Em không thể bỏ phiếu ở vòng này."})
                        return True
                    if room.phase != "impostor_vote":
                        self._send_json(handler, 409, {"error": "Vòng bỏ phiếu đã đóng."})
                        return True
                    if suspect_id != "skip" and (suspect_id not in room.players or suspect_id in room.ejected_ids):
                        self._send_json(handler, 400, {"error": "Nghi phạm không hợp lệ."})
                        return True
                    room.meeting_votes[pid] = suspect_id
                    eligible = [x for x in room.players if x not in room.ejected_ids]
                    if len([v for v in room.meeting_votes if v in eligible]) >= len(eligible):
                        room.resolve_impostor_meeting()
                    room.bump()
                    p_state = room.build_player_state(pid)
                self._send_json(handler, 200, {"ok": True, "state": p_state})
                return True

            if method == "POST" and sub == "action":
                body = self._read_json_body(handler)
                tok = str(body.get("hostToken", "")) or query.get("token", [""])[0]
                if tok != room.host_token:
                    self._send_json(handler, 403, {"error": "Không có quyền điều khiển phòng."})
                    return True

                act = str(body.get("action", "")).strip()
                trigger_bots_for: int | None = None
                trigger_vote_bots = False
                trigger_bridge_bots: int | None = None

                with room.cond:
                    if act == "set_mode":
                        new_mode = str(body.get("gameMode", "classic")).strip()
                        if room.phase == "lobby" and new_mode in VALID_GAME_MODES:
                            room.game_mode = new_mode
                            if new_mode == "bomb_defusal":
                                room.sync_squads(force_rebalance=True)
                            room.bump()

                    elif act == "shuffle_squads":
                        if room.phase == "lobby" and room.game_mode == "bomb_defusal":
                            pids = list(room.players.keys())
                            random.shuffle(pids)
                            target_sq = max(1, min(len(SQUAD_NAMES), math.ceil(max(1, len(pids)) / 4)))
                            room.squads = {
                                f"sq-{i}": {"id": f"sq-{i}", "name": SQUAD_NAMES[i], "shield": 3, "score": 0.0, "defusedCount": 0, "explodedCount": 0}
                                for i in range(target_sq)
                            }
                            room.player_squad = {pid: f"sq-{i % target_sq}" for i, pid in enumerate(pids)}
                            room.bump()

                    elif act == "start":
                        room.question_index = -1
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
                        if room.game_mode == "math_impostor" and room.impostor_winner is not None:
                            room.phase = "finished"
                            room.reveal_answer = True
                        elif room.question_index + 1 < len(room.questions):
                            nxt = room.question_index + 1
                            room.open_question(nxt)
                            if room.bot_sim_active:
                                trigger_bots_for = nxt
                        else:
                            if room.game_mode == "math_impostor" and room.impostor_winner is None:
                                room.impostor_winner = "crew" if room.reactor_power >= 60 else "impostors"
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

                    elif act == "start_debate":
                        if room.game_mode == "glass_bridge" and room.phase == "answering":
                            room.start_bridge_debate()
                            if room.bot_sim_active:
                                trigger_bridge_bots = room.question_index
                            room.bump()

                    elif act == "lock":
                        if room.phase in ("answering", "bridge_debate"):
                            if room.game_mode == "glass_bridge" and room.phase == "answering":
                                room.start_bridge_debate()
                                if room.bot_sim_active:
                                    trigger_bridge_bots = room.question_index
                            else:
                                room.finalize_current_question(auto_triggered=False)
                            room.bump()

                    elif act == "shatter_glass":
                        if room.phase in ("answering", "bridge_debate"):
                            room.finalize_current_question(auto_triggered=False)
                            room.bump()

                    elif act == "start_meeting":
                        if room.game_mode == "math_impostor" and room.phase in ("review", "leaderboard"):
                            room.start_impostor_meeting()
                            if room.bot_sim_active:
                                trigger_vote_bots = True
                            room.bump()

                    elif act == "resolve_vote":
                        if room.game_mode == "math_impostor" and room.phase == "impostor_vote":
                            room.resolve_impostor_meeting()
                            room.bump()

                    elif act == "close_room":
                        room.phase = "closed"
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
                        if room.phase in ("answering", "bridge_debate"):
                            room.phase = "review"
                        room.reveal_answer = not room.reveal_answer if body.get("value") is None else bool(body["value"])
                        room.bump()

                    elif act == "toggle_explanation":
                        if room.phase in ("answering", "bridge_debate", "leaderboard", "impostor_vote_result"):
                            room.phase = "review"
                            room.show_explanation = True if body.get("value") is None else bool(body["value"])
                        else:
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
                            if key == "scoringEnabled":
                                room.recompute_scores()
                            room.bump()

                    elif act == "extend_time":
                        add_sec = int(body.get("seconds", 15))
                        if room.phase in ("answering", "bridge_debate", "impostor_vote"):
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
                            room.player_squad.pop(kpid, None)
                            if kpid in room.bot_ids:
                                room.bot_ids.remove(kpid)
                            if room.game_mode == "bomb_defusal":
                                room.sync_squads(False)
                            room.bump()

                    elif act == "finish":
                        room.phase = "finished"
                        room.reveal_answer = True
                        room.bump()

                    elif act == "simulate_bots":
                        pass

                    else:
                        self._send_json(handler, 400, {"error": f"Lệnh không hợp lệ: {act}"})
                        return True

                if act == "simulate_bots":
                    cnt = int(body.get("count", 40))
                    self._spawn_bots(room, cnt)
                elif trigger_bots_for is not None:
                    self._trigger_bots_answer(room, trigger_bots_for)
                elif trigger_bridge_bots is not None:
                    self._trigger_bots_bridge_jumps(room, trigger_bridge_bots)
                elif trigger_vote_bots:
                    self._trigger_bots_vote(room)

                with room.cond:
                    self._send_json(handler, 200, {"ok": True, "state": room.build_host_state()})
                return True

        self._send_json(handler, 404, {"error": "Endpoint không tồn tại."})
        return True
