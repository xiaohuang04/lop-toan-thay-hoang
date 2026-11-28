#!/usr/bin/env python3
"""
Zero-dependency Excel (.xlsx) template generator & importer for `/on-tap` (Math Review).
Uses Python standard library only (zipfile, xml.etree.ElementTree, io, re, uuid).

Produces and parses a 5-sheet workbook aligned 100% with the unified Cấp số cộng (CSC) format:
  1. ThongTinBai  — Grade, Chapter, Lesson code/title/summary
  2. KienThuc     — Core Knowledge Boxes, lines, chips/cases tags, and double-click Speech Cloud examples
  3. BayHaySai    — Blind Trap Flip Cards (single / multi answers)
  4. LuyenNhanh   — Quick Quiz (mc / tf / sa)
  5. HuongDan     — Vietnamese authoring guide
"""

from __future__ import annotations

import io
import re
import uuid
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape


# =========================================================================
# LOW-LEVEL XLSX HELPERS (ZERO DEPENDENCIES)
# =========================================================================

def _col_letter_to_index(ref: str) -> int:
    col_str = "".join(ch for ch in ref if ch.isalpha()).upper()
    idx = 0
    for ch in col_str:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return max(0, idx - 1)


def _index_to_col_letter(idx: int) -> str:
    out = []
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out.append(chr(ord("A") + rem))
    return "".join(reversed(out))


def _norm_key(s: str) -> str:
    """Normalize Vietnamese/ASCII header or token to lowercase snake_case without accents."""
    raw = str(s or "").strip().lower()
    # Strip basic Vietnamese diacritics cleanly
    repl_map = {
        "àáạảãâầấậẩẫăằắặẳẵ": "a",
        "èéẹẻẽêềếệểễ": "e",
        "ìíịỉĩ": "i",
        "òóọỏõôồốộổỗơờớợởỡ": "o",
        "ùúụủũưừứựửữ": "u",
        "ỳýỵỷỹ": "y",
        "đ": "d",
    }
    for chars, rep in repl_map.items():
        for ch in chars:
            raw = raw.replace(ch, rep)
    raw = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    return raw


def _extract_rich_text_from_container(container: ET.Element) -> str:
    """
    Extract text from an Excel <si> (sharedString) or <is> (inlineStr) element,
    preserving native Excel Bold (Ctrl+B) as **...** and Italic (Ctrl+I) as *...*.
    """
    runs = [ch for ch in container if ch.tag.endswith("}r") or ch.tag == "r"]
    if not runs:
        parts = []
        for t in container.iter():
            if t.tag.endswith("}t") or t.tag == "t":
                if t.text:
                    parts.append(t.text)
        return "".join(parts)

    segments: list[tuple[str, bool, bool]] = []
    for r in runs:
        is_bold = False
        is_italic = False
        run_texts: list[str] = []
        for child in r:
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "rPr":
                for prop in child:
                    ptag = prop.tag.rsplit("}", 1)[-1]
                    pval = str(prop.attrib.get("val", "1")).strip().lower()
                    enabled = pval not in ("0", "false", "none")
                    if ptag == "b" and enabled:
                        is_bold = True
                    elif ptag == "i" and enabled:
                        is_italic = True
            elif tag == "t" and child.text:
                run_texts.append(child.text)
        txt = "".join(run_texts)
        if not txt:
            continue
        if segments and segments[-1][1] == is_bold and segments[-1][2] == is_italic:
            prev_txt, pb, pi = segments[-1]
            segments[-1] = (prev_txt + txt, pb, pi)
        else:
            segments.append((txt, is_bold, is_italic))

    out_parts: list[str] = []
    for txt, is_bold, is_italic in segments:
        if not (is_bold or is_italic):
            out_parts.append(txt)
            continue
        # Keep leading/trailing whitespace outside markers so markdown parsing stays clean
        m_ws = re.match(r"^(\s*)([\s\S]*?)(\s*)$", txt)
        lead, core, trail = (m_ws.group(1), m_ws.group(2), m_ws.group(3)) if m_ws else ("", txt, "")
        if not core:
            out_parts.append(txt)
            continue
        wrapped = core
        # Avoid double-wrapping if the author already typed **...**
        if is_bold and not (wrapped.startswith("**") and wrapped.endswith("**")):
            wrapped = f"**{wrapped}**"
        if is_italic and not (wrapped.startswith("*") and wrapped.endswith("*") and not wrapped.startswith("**")):
            wrapped = f"*{wrapped}*"
        out_parts.append(f"{lead}{wrapped}{trail}")
    return "".join(out_parts)


def _read_xlsx_sheets(raw_bytes: bytes) -> dict[str, list[list[str]]]:
    """Read all worksheets of an .xlsx file into {sheet_name: rows} (preserving native Excel Bold/Italic)."""
    with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as zf:
        names = set(zf.namelist())
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in names:
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    shared_strings.append(_extract_rich_text_from_container(si))

        # Map rId -> target path from xl/_rels/workbook.xml.rels
        rid_to_target: dict[str, str] = {}
        if "xl/_rels/workbook.xml.rels" in names:
            rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
            for rel in rels_root.iter():
                if rel.tag.endswith("}Relationship") or rel.tag == "Relationship":
                    rid = rel.attrib.get("Id", "")
                    target = rel.attrib.get("Target", "").lstrip("/")
                    if target and not target.startswith("xl/"):
                        target = f"xl/{target}"
                    if rid and target:
                        rid_to_target[rid] = target

        # Map sheet names -> paths via xl/workbook.xml
        sheet_entries: list[tuple[str, str]] = []
        if "xl/workbook.xml" in names:
            wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
            for sh in wb_root.iter():
                if sh.tag.endswith("}sheet") or sh.tag == "sheet":
                    sh_name = sh.attrib.get("name", "")
                    rid = ""
                    for k, v in sh.attrib.items():
                        if k.endswith("}id") or k == "r:id":
                            rid = v
                            break
                    target = rid_to_target.get(rid, "")
                    if sh_name and target and target in names:
                        sheet_entries.append((sh_name, target))

        if not sheet_entries:
            for idx, cand in enumerate(
                sorted(n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")),
                start=1,
            ):
                sheet_entries.append((f"Sheet{idx}", cand))

        if not sheet_entries:
            raise ValueError("Tệp Excel không chứa trang tính (worksheet) hợp lệ.")

        result: dict[str, list[list[str]]] = {}
        for sh_name, sh_path in sheet_entries:
            sh_root = ET.fromstring(zf.read(sh_path))
            rows: list[list[str]] = []
            for row_el in sh_root.iter():
                if not (row_el.tag.endswith("}row") or row_el.tag == "row"):
                    continue
                row_map: dict[int, str] = {}
                max_col = -1
                for cell in row_el:
                    if not (cell.tag.endswith("}c") or cell.tag == "c"):
                        continue
                    ref = cell.attrib.get("r", "")
                    col_idx = _col_letter_to_index(ref) if ref else (max_col + 1)
                    cell_type = cell.attrib.get("t", "")
                    val = ""
                    if cell_type == "inlineStr":
                        is_el = None
                        for child in cell:
                            if child.tag.endswith("}is") or child.tag == "is":
                                is_el = child
                                break
                        val = _extract_rich_text_from_container(is_el if is_el is not None else cell)
                    else:
                        v_el = None
                        for child in cell:
                            if child.tag.endswith("}v") or child.tag == "v":
                                v_el = child
                                break
                        raw_val = v_el.text if (v_el is not None and v_el.text is not None) else ""
                        if cell_type == "s" and raw_val.isdigit():
                            s_idx = int(raw_val)
                            val = shared_strings[s_idx] if 0 <= s_idx < len(shared_strings) else ""
                        elif cell_type == "b":
                            val = "TRUE" if raw_val == "1" else "FALSE"
                        else:
                            val = raw_val
                    row_map[col_idx] = val.strip()
                    if col_idx > max_col:
                        max_col = col_idx
                if max_col >= 0:
                    row_list = [row_map.get(i, "") for i in range(max_col + 1)]
                    if any(cell != "" for cell in row_list):
                        rows.append(row_list)
            result[sh_name] = rows
        return result


# =========================================================================
# ZERO-HTML FRIENDLY TEXT -> HTML CONVERSION (MATCHES math-review-editor.js)
# =========================================================================

def friendly_inline_to_html(raw_text: str) -> str:
    s = str(raw_text or "").strip()
    if not s:
        return ""
    # Bold works even when wrapping inline math like **công sai $d$**
    s = re.sub(r"\*\*([\s\S]+?)\*\*", r"<strong>\1</strong>", s)
    # Protect LaTeX $...$ / $$...$$ before italicizing *...* so \mathbb{N}^* or 2*3 stays untouched
    math_tokens: list[str] = []

    def _stash_math(m: re.Match) -> str:
        idx = len(math_tokens)
        math_tokens.append(m.group(0))
        return f"@@MATH{idx}@@"

    s = re.sub(r"\$\$[\s\S]+?\$\$|\$[^$\n]+?\$", _stash_math, s)
    s = re.sub(r"(^|[\s(>])\*([^*\n]+?)\*(?=[\s.,;:?!<)]|$)", r"\1<em>\2</em>", s)
    for idx, m_str in enumerate(math_tokens):
        s = s.replace(f"@@MATH{idx}@@", m_str)

    s = s.replace("\r\n", "\n")
    s = re.sub(r"\n\s*(\$\$)", r" \1", s)
    s = re.sub(r"(\$\$)\s*\n", r"\1 ", s)
    s = s.replace("\n", "<br/>")
    return s


def _build_item_html(text: str, tags_kind: str, raw_tags: str) -> str:
    main_html = friendly_inline_to_html(text)
    if not raw_tags.strip():
        return main_html

    parts = [p.strip() for p in raw_tags.split("|") if p.strip()]
    if not parts:
        return main_html

    kind_norm = _norm_key(tags_kind)
    if kind_norm in ("chips", "chip", "danh_so", "so", "list"):
        chips_html = "".join(
            f'<span class="rv-chip-item"><span class="rv-chip-num">{idx}</span>{friendly_inline_to_html(p)}</span>'
            for idx, p in enumerate(parts, start=1)
        )
        return f'{main_html}<div class="rv-chip-list">{chips_html}</div>'

    # Default to `cases` pills (supports optional tone prefix `up:`, `down:`, `flat:`)
    cases_html_parts = []
    for p in parts:
        tone_cls = ""
        body = p
        m = re.match(r"^(up|down|flat|tang|giam|khongdoi|xanh|do|xam)\s*:\s*(.+)$", p, re.IGNORECASE)
        if m:
            tok = m.group(1).lower()
            body = m.group(2).strip()
            if tok in ("up", "tang", "xanh"):
                tone_cls = " is-up"
            elif tok in ("down", "giam", "do"):
                tone_cls = " is-down"
            elif tok in ("flat", "khongdoi", "xam"):
                tone_cls = " is-flat"
        cases_html_parts.append(f'<span class="rv-case-pill{tone_cls}">{friendly_inline_to_html(body)}</span>')
    return f'{main_html}<div class="rv-case-row">{"".join(cases_html_parts)}</div>'


BOX_TYPE_ALIASES = {
    "theory": "theory",
    "dinh_nghia": "theory",
    "ly_thuyet": "theory",
    "dinh_nghia_ly_thuyet": "theory",
    "khai_niem": "theory",
    "theorem": "theorem",
    "dinh_li": "theorem",
    "dinh_ly": "theorem",
    "tinh_chat": "theorem",
    "dinh_li_tinh_chat": "theorem",
    "formula": "formula",
    "cong_thuc": "formula",
    "cong_thuc_cot_loi": "formula",
    "method": "method",
    "phuong_phap": "method",
    "phuong_phap_giai": "method",
    "warning": "warning",
    "luu_y": "warning",
    "meo": "warning",
    "meo_nhanh": "warning",
    "luu_y_meo_nhanh": "warning",
    "note": "note",
    "nhan_xet": "note",
    "vi_du_nhanh": "note",
}

BOX_STYLE_ALIASES = {
    "": "",
    "mac_dinh": "",
    "default": "",
    "editorial": "editorial",
    "mo_thoang": "editorial",
    "tinted": "tinted",
    "nen_mau": "tinted",
    "outlined": "outlined",
    "vien_manh": "outlined",
}


def _parse_bool_vn(val: str) -> bool:
    t = _norm_key(val)
    return t in ("1", "co", "yes", "y", "true", "t", "d", "dung", "x")


# =========================================================================
# PARAMETRIC VARIABLE EVALUATOR (MATCHES js/review-param.js 1-to-1)
# =========================================================================

def _parse_fixed_vars(vars_str: str) -> dict[str, float]:
    env: dict[str, float] = {}
    raw = str(vars_str or "").strip()
    if not raw:
        return env
    for chunk in re.split(r"\s*;\s*", raw):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?\d+(?:[.,]\d+)?)", chunk)
        if m:
            env[m.group(1)] = float(m.group(2).replace(",", "."))
    return env


def _format_param_num(val: float) -> str:
    if abs(val) < 1e-10:
        return "0"
    rounded = round(val, 6)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return str(round(rounded, 2)).replace(".", ",")


def _eval_safe_expr(expr: str, env: dict[str, float]) -> str:
    import ast
    import math

    trimmed = str(expr or "").strip()
    if not trimmed:
        return ""

    m_helper = re.match(r"^(signed|paren)\s*\(([\s\S]+)\)$", trimmed)
    if m_helper:
        fn = m_helper.group(1)
        inner_num = float(_eval_safe_expr(m_helper.group(2), env).replace(",", "."))
        fmt = _format_param_num(inner_num)
        if fn == "signed":
            if inner_num > 0:
                return f"+ {fmt}"
            if inner_num < 0:
                return f"- {_format_param_num(abs(inner_num))}"
            return ""
        return f"({fmt})" if inner_num < 0 else fmt

    py_expr = trimmed.replace("^", "**")
    tree = ast.parse(py_expr, mode="eval")
    funcs = {
        "abs": abs,
        "round": round,
        "floor": math.floor,
        "ceil": math.ceil,
        "sqrt": math.sqrt,
        "min": min,
        "max": max,
    }

    def _ev(node):
        if isinstance(node, ast.Expression):
            return _ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name):
            if node.id in env:
                return float(env[node.id])
            raise ValueError(f"Unknown variable {node.id}")
        if isinstance(node, ast.UnaryOp):
            v = _ev(node.operand)
            if isinstance(node.op, ast.UAdd):
                return +v
            if isinstance(node.op, ast.USub):
                return -v
            raise ValueError("Unsupported unary op")
        if isinstance(node, ast.BinOp):
            l = _ev(node.left)
            r = _ev(node.right)
            if isinstance(node.op, ast.Add):
                return l + r
            if isinstance(node.op, ast.Sub):
                return l - r
            if isinstance(node.op, ast.Mult):
                return l * r
            if isinstance(node.op, ast.Div):
                return l / r
            if isinstance(node.op, ast.Pow):
                return l ** r
            raise ValueError("Unsupported binary op")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            fn = funcs.get(node.func.id.lower())
            if not fn:
                raise ValueError(f"Unknown func {node.func.id}")
            return float(fn(*[_ev(a) for a in node.args]))
        raise ValueError("Unsupported expression")

    return _format_param_num(_ev(tree))


def _render_param_template(tpl: str, env: dict[str, float]) -> str:
    s = str(tpl or "")
    if "{{" not in s or not env:
        return s

    def _repl(match: re.Match) -> str:
        try:
            return _eval_safe_expr(match.group(1), env)
        except Exception:
            return match.group(0)

    return re.sub(r"\{\{([^{}]+)\}\}", _repl, s)


# =========================================================================
# TEMPLATE WORKBOOK GENERATOR (PRE-FILLED WITH BÀI 2: CẤP SỐ CỘNG)
# =========================================================================

def build_review_template_xlsx() -> bytes:
    """
    Build a styled 5-sheet .xlsx template pre-filled with Bài 2: Cấp số cộng (CSC)
    matching 100% of `/on-tap` features (Box presets, [CHE:], chips/cases, Speech Cloud examples,
    Blind Trap flip cards, and MC/TF/SA quizzes).
    """

    sheet1_meta = [
        ["Truong", "GiaTri", "GhiChu"],
        ["Khoi", "11", "Nhập số khối: 10, 11 hoặc 12"],
        ["MaChuong", "Chương II", "Mã chương hiển thị ở thanh bên trái (VD: Chương I, Chương II...)"],
        ["TenChuong", "Dãy số, Cấp số cộng và Cấp số nhân", "Tên đầy đủ của chương"],
        ["MaBai", "Bài 2", "Mã bài (VD: Bài 1, Bài 2, Bài 3...)"],
        ["TenBai", "Cấp số cộng (CSC)", "Tên bài học hiển thị ở tiêu đề lớn"],
        ["TomTat", "Định nghĩa công sai $d$, số hạng tổng quát $u_n$, tính chất 3 số hạng liên tiếp và tổng $S_n$ của CSC.", "Mô tả ngắn gọn trọng tâm bài học (hỗ trợ $LaTeX$)"],
    ]

    sheet2_knowledge = [
        [
            "STT_Box",
            "LoaiBox",
            "TieuDeBox",
            "KieuKhung",
            "NoiDungDong",
            "LoaiThe",
            "DanhSachThe",
            "CoViDu",
            "TieuDeViDu",
            "DeViDu",
            "LoiGiaiViDu",
        ],
        [
            "1",
            "theory",
            "Định nghĩa & Nhận biết",
            "",
            "Mỗi số hạng (từ $u_2$) bằng số hạng liền trước cộng **công sai $d$** không đổi: $$u_{n+1} = u_n + d \\quad (\\forall n \\in \\mathbb{N}^*)$$",
            "",
            "",
            "Co",
            "Ví dụ về Định nghĩa CSC",
            "Xét dãy số $3; 7; 11; 15; \\dots$ có phải cấp số cộng không? Nếu có, chỉ ra $u_1$ và công sai $d$.",
            "Ta thấy $7 - 3 = 11 - 7 = 15 - 11 = 4$ (không đổi). Vậy đây là cấp số cộng với $u_1 = \\mathbf{3}$ và công sai $d = \\mathbf{4}$.",
        ],
        [
            "1",
            "theory",
            "Định nghĩa & Nhận biết",
            "",
            "**Dấu hiệu nhận biết:** Hiệu $u_{n+1} - u_n = d$ (hằng số không phụ thuộc $n$).",
            "",
            "",
            "Co",
            "Ví dụ Nhận biết CSC",
            "Chứng minh dãy số $(u_n)$ với $u_n = 5n - 2$ là một cấp số cộng và tìm công sai $d$.",
            "Xét hiệu $u_{n+1} - u_n = [5(n + 1) - 2] - (5n - 2) = \\mathbf{5}$ (hằng số với mọi $n \\in \\mathbb{N}^*$). Suy ra $(u_n)$ là CSC với công sai $d = \\mathbf{5}$.",
        ],
        [
            "1",
            "theory",
            "Định nghĩa & Nhận biết",
            "",
            "**Tính đơn điệu theo công sai $d$:**",
            "cases",
            "up:$d > 0$: Dãy tăng | down:$d < 0$: Dãy giảm | flat:$d = 0$: Dãy không đổi",
            "Co",
            "Ví dụ Xét chiều tăng/giảm theo d",
            "Xét tính tăng, giảm của hai CSC: $(a_n)$ có $a_1 = 10, d = -3$ và $(b_n)$ có $b_1 = -5, d = 2$.",
            "• Dãy $(a_n)$ có $d = -3 < 0$ nên là **dãy giảm** ($10; 7; 4; 1; \\dots$).\n• Dãy $(b_n)$ có $d = 2 > 0$ nên là **dãy tăng** ($-5; -3; -1; 1; \\dots$).",
        ],
        [
            "2",
            "formula",
            "Công thức Cấp số cộng",
            "",
            "**Số hạng tổng quát** ($n \\ge 2$): $u_n =$ [CHE: $u_1 + (n - 1)d$].",
            "",
            "",
            "Co",
            "Ví dụ Tính số hạng tổng quát",
            "Cho cấp số cộng $(u_n)$ có $u_1 = -2$ và công sai $d = 3$. Tính giá trị số hạng $u_{10}$.",
            "Áp dụng công thức $u_n = u_1 + (n - 1)d$:\n$$u_{10} = u_1 + 9d = -2 + 9 \\cdot 3 = \\mathbf{25}$$",
        ],
        [
            "2",
            "formula",
            "Công thức Cấp số cộng",
            "",
            "**Liên hệ 2 số hạng:** $u_m - u_k =$ [CHE: $(m - k)d$].",
            "",
            "",
            "Co",
            "Ví dụ Tìm nhanh công sai d",
            "Cho cấp số cộng $(u_n)$ biết $u_3 = 7$ và $u_8 = 22$. Tìm công sai $d$.",
            "Ta có $u_8 - u_3 = (8 - 3)d \\iff 22 - 7 = 5d \\iff 5d = 15 \\Rightarrow d = \\mathbf{3}$.",
        ],
        [
            "2",
            "formula",
            "Công thức Cấp số cộng",
            "",
            "**3 số hạng liên tiếp** $a, b, c$: [CHE: $a + c = 2b$] $\\iff b =$ [CHE: $\\dfrac{a + c}{2}$].",
            "",
            "",
            "Co",
            "Ví dụ Trung bình cộng 3 số",
            "Tìm $x$ để ba số $2; x; 14$ theo thứ tự đó lập thành một cấp số cộng.",
            "Theo tính chất CSC: $x = \\dfrac{2 + 14}{2} = \\mathbf{8}$ (ta được CSC $2; 8; 14$ có $d = 6$).",
        ],
        [
            "2",
            "formula",
            "Công thức Cấp số cộng",
            "",
            "**Tổng $n$ số hạng đầu:** $S_n =$ [CHE: $\\dfrac{n(u_1 + u_n)}{2}$] $=$ [CHE: $\\dfrac{n}{2}[2u_1 + (n - 1)d]$].",
            "",
            "",
            "Co",
            "Ví dụ Thực tế (Rạp chiếu phim)",
            "Một rạp chiếu phim có $15$ hàng ghế, hàng đầu $20$ ghế, mỗi hàng sau nhiều hơn hàng trước $3$ ghế. Hỏi rạp có tất cả bao nhiêu ghế?",
            "Số ghế các hàng lập thành CSC với $u_1 = 20, d = 3, n = 15$. Tổng số ghế:\n$$S_{15} = \\frac{15}{2}[2 \\cdot 20 + 14 \\cdot 3] = \\frac{15 \\cdot 82}{2} = \\mathbf{615}\\text{ ghế}$$",
        ],
        [
            "3",
            "warning",
            "Mẹo giải hệ CSC",
            "",
            "Đưa mọi số hạng $u_k$ về **2 ẩn $u_1, d$** qua $u_k = u_1 + (k - 1)d$ rồi bấm máy hệ bậc nhất.",
            "",
            "",
            "Co",
            "Ví dụ Giải hệ phương trình CSC",
            "Tìm $u_1, d$ của CSC thỏa mãn $\\begin{cases} u_2 + u_5 = 16 \\\\ u_3 + u_7 = 22 \\end{cases}$.",
            "Biểu diễn theo $u_1, d$: $\\begin{cases} 2u_1 + 5d = 16 \\\\ 2u_1 + 8d = 22 \\end{cases}$.\nTrừ vế theo vế: $3d = 6 \\Rightarrow d = \\mathbf{2}$, thay ngược lại được $u_1 = \\mathbf{3}$.",
        ],
    ]

    sheet3_flips = [
        ["TenBay", "DeBai", "KieuDapAn", "DapAnDung", "GiaiThichBay", "LoiGiaiDung"],
        [
            "Bẫy nhầm hệ số $(n - 1)$",
            "Cho cấp số cộng có $u_1 = 3$ và công sai $d = 2$. Tính $u_{10}$.",
            "single",
            "21",
            "Nhẩm $u_{10} = u_1 + 10d = 3 + 20 = 23$ (quên trừ $1$ ở hệ số của $d$).",
            "$u_{10} = u_1 + 9d = 3 + 9 \\cdot 2 = \\mathbf{21}$.",
        ],
        [
            "Bẫy thiếu hệ số $2u_1$",
            "Cho cấp số cộng có $u_1 = 3$ và công sai $d = 2$. Tính tổng $S_{10}$.",
            "single",
            "120",
            "Viết $S_{10} = \\dfrac{10}{2}[u_1 + 9d] = 105$ (quên nhân $2$ trước $u_1$).",
            "$S_{10} = \\dfrac{10}{2}[2u_1 + 9d] = 5(6 + 18) = \\mathbf{120}$.",
        ],
    ]

    sheet4_quizzes = [
        ["Loai", "CauHoi", "A", "B", "C", "D", "DapAnDung", "GiaiThich", "BienSo"],
        [
            "mc",
            "Cho cấp số cộng $(u_n)$ có $u_1 = {{u1}}$ và công sai $d = {{d}}$. Giá trị của $u_{{{n}}}$ là:",
            "${{u1 + (n - 1) * d}}$",
            "${{u1 + n * d}}$",
            "${{u1 + (n - 2) * d}}$",
            "${{u1 - (n - 1) * d}}$",
            "A",
            "$u_{{{n}}} = u_1 + {{n - 1}}d = {{u1}} + {{n - 1}} \\cdot {{paren(d)}} = {{u1 + (n - 1) * d}}$.",
            "u1 = -2 [-5..6]; d = 3 [2..6]; n = 10 [6..14]",
        ],
        [
            "mc",
            "Ba số $2; x; 14$ theo thứ tự đó lập thành một cấp số cộng. Giá trị của $x$ bằng:",
            "$6$",
            "$8$",
            "$10$",
            "$12$",
            "B",
            "Theo tính chất cấp số cộng, $x = \\dfrac{2 + 14}{2} = 8$.",
            "",
        ],
        [
            "tf",
            "Cho cấp số cộng $(u_n)$ có $u_1 = 5$ và $u_4 = 17$. Xét tính Đúng/Sai của các khẳng định sau:",
            "Công sai của cấp số cộng là $d = 4$.",
            "Số hạng tổng quát của cấp số cộng là $u_n = 4n + 1$.",
            "Số $81$ là số hạng thứ 19 của cấp số cộng.",
            "Tổng 10 số hạng đầu tiên của cấp số cộng bằng $230$.",
            "D,D,S,D",
            "$u_4 = u_1 + 3d \\Rightarrow d = 4$. | $u_n = 5 + (n - 1) \\cdot 4 = 4n + 1$. | $4n + 1 = 81 \\Leftrightarrow n = 20$ (thứ 20). | $S_{10} = \\dfrac{10}{2}[10 + 36] = 230$.",
            "",
        ],
        [
            "sa",
            "Cho cấp số cộng $(u_n)$ có $u_{{{k1}}} = {{u1 + (k1 - 1) * d}}$ và $u_{{{k2}}} = {{u1 + (k2 - 1) * d}}$. Tính tổng ${{m}}$ số hạng đầu tiên của cấp số cộng đó.",
            "",
            "",
            "",
            "",
            "{{m * (2 * u1 + (m - 1) * d) / 2}}",
            "Ta có $u_{{{k2}}} - u_{{{k1}}} = {{k2 - k1}}d \\Rightarrow d = {{d}}$. Suy ra $u_1 = {{u1}}$. Tổng $S_{{{m}}} = \\dfrac{{{m}}}{2}[2 \\cdot {{paren(u1)}} + {{m - 1}} \\cdot {{paren(d)}}] = {{m * (2 * u1 + (m - 1) * d) / 2}}$.",
            "u1 = 1 [-3..5]; d = 3 [2..6]; k1 = 3 [2..4]; k2 = 8 [6..9]; m = 12 [8..12]",
        ],
        [
            "sa",
            "Một người xếp các khối gỗ lập phương thành một tháp nhiều tầng. Tầng trên cùng có ${{u1}}$ khối, tầng thứ hai có ${{u1 + d}}$ khối, tầng thứ ba có ${{u1 + 2 * d}}$ khối,... cứ như vậy tầng dưới hơn tầng kề trên ${{d}}$ khối gỗ. Nếu người đó dùng hết đúng ${{n * (2 * u1 + (n - 1) * d) / 2}}$ khối gỗ thì tháp gỗ có bao nhiêu tầng?",
            "",
            "",
            "",
            "",
            "{{n}}",
            "Ta có CSC với $u_1 = {{u1}}, d = {{d}}$ và $S_n = {{n * (2 * u1 + (n - 1) * d) / 2}}$. Giải phương trình $\\dfrac{n}{2}[2 \\cdot {{u1}} + {{d}}(n - 1)] = {{n * (2 * u1 + (n - 1) * d) / 2}}$ thu được $n = {{n}}$ (nhận).",
            "u1 = 1 [1..3]; d = 3 [2..4]; n = 10 [6..12]",
        ],
    ]

    sheet5_guide = [
        ["MỤC", "QUY TẮC & CÚ PHÁP CHUẨN (CHO THẦY VÀ AI)", "VÍ DỤ CỤ THỂ"],
        [
            "1. IN ĐẬM & IN NGHIÊNG NGAY TRONG EXCEL",
            "Hệ thống hỗ trợ CẢ 2 CÁCH — không cần lên trình duyệt bôi đen lại:\n"
            "• Cách 1 (Khuyên dùng cho AI & gõ nhanh): Bọc đoạn cần in đậm bằng **...**, in nghiêng bằng *...*.\n"
            "• Cách 2 (Trực tiếp trong Microsoft Excel / Google Sheets): Bôi đen đoạn chữ ngay trong ô rồi bấm Ctrl+B (in đậm) hoặc Ctrl+I (in nghiêng). Hệ thống tự đọc rich-text XML của Excel khi nạp file!\n"
            "• Để in đậm kết quả số bên trong công thức toán $...$, dùng \\mathbf{...}.",
            "**Số hạng tổng quát** ($n \\ge 2$): $u_n = u_1 + (n - 1)d$\n"
            "Kết quả: $u_{10} = \\mathbf{25}$",
        ],
        [
            "2. Công thức LaTeX & Xuống dòng",
            "• Công thức cùng dòng: bọc trong $...$\n"
            "• Công thức tách dòng căn giữa: bọc trong $$...$$\n"
            "• Phân số đẹp dùng \\dfrac{a}{b}, hệ phương trình dùng \\begin{cases} ... \\\\ ... \\end{cases}\n"
            "• Xuống dòng trong ô: bấm Alt+Enter (hoặc ký tự \\n).\n"
            "• TUYỆT ĐỐI KHÔNG viết thẻ HTML (<b>, <br>, <div>...).",
            "$$S_n = \\dfrac{n}{2}[2u_1 + (n - 1)d]$$",
        ],
        [
            "3. Sheet ThongTinBai",
            "Khai báo 6 dòng: Khoi (10 / 11 / 12), MaChuong, TenChuong, MaBai, TenBai, TomTat.\n"
            "Khi nạp vào web:\n"
            "• Nếu Chương chưa có → tự tạo Chương mới trong đúng Khối.\n"
            "• Nếu Bài cùng MaBai hoặc TenBai đã tồn tại → cập nhật đè sạch sẽ bài đó; nếu chưa có → thêm bài mới.",
            "Khoi = 11\nMaChuong = Chương II\nMaBai = Bài 2\nTenBai = Cấp số cộng (CSC)",
        ],
        [
            "4. Sheet KienThuc — Cột STT_Box",
            "Đánh số 1, 2, 3... Các dòng có CÙNG STT_Box sẽ tự động gom thành các gạch đầu dòng bên trong cùng 1 Box kiến thức theo đúng thứ tự từ trên xuống.",
            "STT_Box = 1 cho 3 dòng đầu -> 1 Box có 3 ý",
        ],
        [
            "5. Sheet KienThuc — LoaiBox & KieuKhung",
            "Cột LoaiBox chọn 1 trong 6 loại chuẩn (tiếng Anh hoặc tiếng Việt):\n"
            "• theory (Định nghĩa) — Viền xanh dương\n"
            "• theorem (Định lí / Tính chất) — Viền tím Indigo\n"
            "• formula (Công thức) — Viền hồng sen\n"
            "• method (Phương pháp) — Viền xanh ngọc\n"
            "• warning (Lưu ý / Mẹo) — Viền cam ấm\n"
            "• note (Nhận xét) — Viền xanh lá\n"
            "Cột KieuKhung: để trống (mặc định đẹp nhất), hoặc editorial / tinted / outlined.",
            "LoaiBox = formula\nKieuKhung = (để trống)",
        ],
        [
            "6. Che công thức (Active Recall)",
            "Bọc đúng phần công thức muốn ẩn khi học sinh bấm nút con mắt (Che công thức) bằng cú pháp [CHE: ...].\n"
            "Có thể đặt nhiều vùng [CHE: ...] trên cùng một dòng.",
            "**Tổng $n$ số hạng đầu:** $S_n =$ [CHE: $\\dfrac{n(u_1 + u_n)}{2}$]",
        ],
        [
            "7. Thẻ phân loại (LoaiThe & DanhSachThe)",
            "Ngăn cách các thẻ trong cột DanhSachThe bằng dấu | (gạch đứng):\n"
            "• LoaiThe = chips: Thẻ đánh số tròn 1, 2, 3...\n"
            "• LoaiThe = cases: Pill phân trường hợp ngang có màu theo tiền tố:\n"
            "  - up: hoặc xanh: → Nền xanh lá (tăng / dương)\n"
            "  - down: hoặc do: → Nền đỏ hồng (giảm / âm)\n"
            "  - flat: hoặc xam: → Nền xám trung tính (không đổi)",
            "LoaiThe = cases\nDanhSachThe = up:$d > 0$: Dãy tăng | down:$d < 0$: Dãy giảm | flat:$d = 0$: Không đổi",
        ],
        [
            "8. Đám mây Ví dụ khi Click đúp",
            "Mỗi dòng kiến thức nên có 1 ví dụ minh họa đi kèm (CoViDu = Co, điền TieuDeViDu, DeViDu, LoiGiaiViDu).\n"
            "Khi học sinh click đúp vào dòng đó, bóng nói ví dụ (Speech Cloud) sẽ bung ra ngay bên dưới.\n"
            "Hỗ trợ **in đậm** và $LaTeX$ trong cả DeViDu và LoiGiaiViDu.",
            "CoViDu = Co\nTieuDeViDu = Ví dụ Tính u_10\nDeViDu = Cho CSC...\nLoiGiaiViDu = Ta có $u_{10} = \\mathbf{25}$.",
        ],
        [
            "9. Sheet BayHaySai (Thẻ lật 2 mặt)",
            "• Mặt trước hiển thị DeBai + ô nhập đáp án (KHÔNG lộ tên bẫy).\n"
            "• Mặt sau hiển thị TenBay, GiaiThichBay (chỉ ra lỗi hay nhầm) và LoiGiaiDung.\n"
            "• Cột KieuDapAn: ghi single (1 đáp án; nhiều cách viết tương đương cách nhau dấu ;) hoặc multi (bắt buộc nhập đủ mọi nghiệm, VD: -6; 6).",
            "KieuDapAn = single, DapAnDung = 21\nhoặc KieuDapAn = multi, DapAnDung = -6; 6",
        ],
        [
            "10. Sheet LuyenNhanh — 3 Phần chuẩn BGD 2025",
            "Hệ thống tự động gom câu vào đúng 3 phần chuẩn tên:\n"
            "• Loai = mc → Phần I: Câu trắc nghiệm nhiều phương án lựa chọn (điền A..D, DapAnDung = A/B/C/D).\n"
            "• Loai = tf → Phần II: Câu trắc nghiệm đúng sai (4 ý a..d điền vào cột A..D; DapAnDung = D,D,S,D; GiaiThich 4 ý ngăn cách dấu |).\n"
            "• Loai = sa → Phần III: Câu trắc nghiệm trả lời ngắn (để trống cột A..D, ghi đáp số vào DapAnDung).",
            "mc: DapAnDung = A\ntf: DapAnDung = D,D,S,D\nsa: DapAnDung = 120",
        ],
        [
            "11. GIỚI HẠN QUAN TRỌNG CHO PHẦN III (sa)",
            "Phần III hiển thị trên KHUNG 4 Ô PHIẾU TÔ THỐNG NHẤT chuẩn thi THPT 2025!\n"
            "Do đó đáp án câu `sa` BẮT BUỘC:\n"
            "• Chỉ gồm chữ số, dấu trừ (-), dấu phẩy (,) hoặc dấu chấm (.)\n"
            "• Độ dài TỐI ĐA 4 KÝ TỰ (VD: 15, -3, 2,5, -0,5, 1024 — KHÔNG vượt quá 4 ký tự!).",
            "Hợp lệ: 7 | -12 | 2,5 | 615\nKHÔNG hợp lệ: 12345 | -12,5 | 3/4",
        ],
        [
            "12. Cột BienSo — Cố định ở trên & Đổi số ngẫu nhiên ở dưới",
            "Khai báo danh sách biến ngăn cách bằng dấu ; theo mẫu: ten = gia_tri_co_dinh [min..max] hoặc ten = gia_tri_co_dinh {v1, v2, v3}:\n"
            "• Giá trị cố định (trước ngoặc vuông/nhọn) dùng để tạo BỘ CÂU HỎI CỐ ĐỊNH hiển thị ở phần Luyện nhanh phía trên.\n"
            "• Miền ngẫu nhiên (trong [...] hoặc {...}) dùng để tự động sinh câu hỏi mới trong mục 'Bài tập đổi số ngẫu nhiên' ở cuối trang!\n"
            "• Trong CauHoi, A..D, DapAnDung, GiaiThich: viết biểu thức trong {{...}} (hỗ trợ +, -, *, /, ^, abs, round, floor, ceil, sqrt, min, max, paren(x), signed(x)).\n"
            "• LƯU Ý: Chỉ những câu Loai = sa có cột BienSo mới được lấy vào nguồn sinh 'Bài tập đổi số ngẫu nhiên'!",
            "BienSo:\nu1 = 1 [-3..5]; d = 3 [-4..6, !=0]; n = 10 [6..12]\n\nDapAnDung:\n{{u1 + (n - 1) * d}}",
        ],
        [
            "13. CHECKLIST CHO AI TRƯỚC KHI XUẤT FILE .XLSX",
            "1. Giữ nguyên chính xác tên 5 sheet (ThongTinBai, KienThuc, BayHaySai, LuyenNhanh, HuongDan) và tên các cột dòng 1.\n"
            "2. Dùng **...** để in đậm các cụm từ khóa / đầu mục quan trọng ngay trong Excel.\n"
            "3. Mọi công thức toán đều nằm trong $...$ hoặc $$...$$; tuyệt đối không chèn thẻ HTML.\n"
            "4. Mỗi dòng KienThuc nên có sẵn Ví dụ click đúp (CoViDu = Co) để đồng nhất trải nghiệm.\n"
            "5. Có ít nhất 2 câu Loai = sa kèm BienSo hợp lệ, đảm bảo mọi tổ hợp biến đều cho đáp án <= 4 ký tự.\n"
            "6. Chạy kiểm tra công thức {{...}} với giá trị cố định trước khi xuất file để đảm bảo đáp án chuẩn xác 100%.",
            "Tham khảo kèm file Mo_Phong_Giao_Dien_On_Tap_Cho_AI.html để thấy chính xác từng ô Excel đổ vào vị trí nào trên web!",
        ],
    ]

    def _sheet_xml(rows_data: list[list[str]], col_widths: list[int], is_guide: bool = False) -> str:
        cols_xml = "".join(
            f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>'
            for i, w in enumerate(col_widths)
        )
        rows_xml = []
        for r_idx, row in enumerate(rows_data, start=1):
            cells = []
            for c_idx, val in enumerate(row):
                ref = f"{_index_to_col_letter(c_idx)}{r_idx}"
                if r_idx == 1:
                    s_attr = ' s="1"'
                elif is_guide and c_idx == 0:
                    s_attr = ' s="3"'
                elif r_idx % 2 == 1:
                    s_attr = ' s="4"'
                else:
                    s_attr = ' s="2"'
                escaped = xml_escape(str(val))
                cells.append(f'<c r="{ref}" t="inlineStr"{s_attr}><is><t xml:space="preserve">{escaped}</t></is></c>')
            ht = ' ht="28" customHeight="1"' if r_idx == 1 else ""
            rows_xml.append(f'<row r="{r_idx}"{ht}>{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0">'
            '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            "</sheetView></sheetViews>"
            f"<cols>{cols_xml}</cols>"
            f'<sheetData>{"".join(rows_xml)}</sheetData>'
            "</worksheet>"
        )

    sheets_spec = [
        ("ThongTinBai", sheet1_meta, [18, 56, 52], False),
        ("KienThuc", sheet2_knowledge, [10, 14, 24, 14, 48, 12, 42, 10, 26, 44, 52], False),
        ("BayHaySai", sheet3_flips, [28, 44, 14, 16, 44, 48], False),
        ("LuyenNhanh", sheet4_quizzes, [10, 46, 22, 22, 22, 22, 16, 46, 40], False),
        ("HuongDan", sheet5_guide, [32, 74, 46], True),
    ]

    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(1, len(sheets_spec) + 1)
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        f"{overrides}"
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )

    sheets_xml_decl = "".join(
        f'<sheet name="{xml_escape(name)}" sheetId="{i}" r:id="rId{i}"/>'
        for i, (name, _, _, _) in enumerate(sheets_spec, start=1)
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheets_xml_decl}</sheets>"
        "</workbook>"
    )

    wb_rels_entries = "".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
        for i in range(1, len(sheets_spec) + 1)
    )
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{wb_rels_entries}"
        f'<Relationship Id="rId{len(sheets_spec) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )

    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="3">'
        '<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>'
        "</fonts>"
        '<fills count="5">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>'
        "</fills>"
        '<borders count="2">'
        '<border><left/><right/><top/><bottom/><diagonal/></border>'
        '<border>'
        '<left style="thin"><color rgb="FFE2E8F0"/></left>'
        '<right style="thin"><color rgb="FFE2E8F0"/></right>'
        '<top style="thin"><color rgb="FFE2E8F0"/></top>'
        '<bottom style="thin"><color rgb="FFE2E8F0"/></bottom>'
        "<diagonal/>"
        "</border>"
        "</borders>"
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="5">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
        "</cellXfs>"
        "</styleSheet>"
    )

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        zf.writestr("xl/styles.xml", styles)
        for i, (_, rows_data, widths, is_guide) in enumerate(sheets_spec, start=1):
            zf.writestr(f"xl/worksheets/sheet{i}.xml", _sheet_xml(rows_data, widths, is_guide=is_guide))
    return out.getvalue()


# =========================================================================
# PARSER: EXCEL (.xlsx) -> STRUCTURED `/on-tap` LESSON OBJECT
# =========================================================================

def _find_sheet(sheets: dict[str, list[list[str]]], aliases: tuple[str, ...]) -> list[list[str]]:
    for name, rows in sheets.items():
        if _norm_key(name) in aliases:
            return rows
    return []


def _col_map(header_row: list[str], alias_groups: dict[str, tuple[str, ...]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        norm = _norm_key(cell)
        for key, aliases in alias_groups.items():
            if norm in aliases and key not in mapping:
                mapping[key] = idx
    return mapping


def _get_cell(row: list[str], idx: int | None) -> str:
    if idx is None or idx < 0 or idx >= len(row):
        return ""
    return row[idx].strip()


def _parse_tf_flags(raw: str) -> list[bool]:
    toks = [t.strip() for t in re.split(r"[\s,;|/]+", str(raw or "").strip()) if t.strip()]
    out: list[bool] = []
    for t in toks[:4]:
        out.append(_parse_bool_vn(t))
    while len(out) < 4:
        out.append(False)
    return out


def parse_review_lesson_xlsx(raw_bytes: bytes) -> dict:
    """Parse a filled `/on-tap` Excel workbook into {grade, chapterCode, chapterTitle, lesson, summary, warnings}."""
    sheets = _read_xlsx_sheets(raw_bytes)
    warnings: list[str] = []

    # 1. Sheet ThongTinBai
    meta_rows = _find_sheet(sheets, ("thongtinbai", "thong_tin_bai", "info", "meta", "baihoc"))
    meta: dict[str, str] = {}
    for row in meta_rows:
        if len(row) < 2:
            continue
        k = _norm_key(row[0])
        v = row[1].strip()
        if k in ("truong", "field", "key"):
            continue
        if k:
            meta[k] = v

    grade_raw = meta.get("khoi") or meta.get("grade") or meta.get("lop") or "11"
    m_grade = re.search(r"(10|11|12)", grade_raw)
    grade = int(m_grade.group(1)) if m_grade else 11
    chapter_code = meta.get("machuong") or meta.get("ma_chuong") or "Chương mới"
    chapter_title = meta.get("tenchuong") or meta.get("ten_chuong") or "Chương mới"
    lesson_code = meta.get("mabai") or meta.get("ma_bai") or "Bài mới"
    lesson_title = meta.get("tenbai") or meta.get("ten_bai") or "Bài học mới"
    lesson_summary = meta.get("tomtat") or meta.get("tom_tat") or ""

    uid = uuid.uuid4().hex[:6]

    # 2. Sheet KienThuc -> coreCards[]
    know_rows = _find_sheet(sheets, ("kienthuc", "kien_thuc", "corecards", "lythuyet", "box"))
    core_cards: list[dict] = []
    if len(know_rows) >= 2:
        cmap = _col_map(
            know_rows[0],
            {
                "stt": ("stt_box", "stt", "box", "nhom", "box_id"),
                "type": ("loaibox", "loai_box", "loai", "type"),
                "title": ("tieudebox", "tieu_de_box", "tieude", "tieu_de", "title"),
                "style": ("kieukhung", "kieu_khung", "style", "boxstyle"),
                "text": ("noidungdong", "noi_dung_dong", "noidung", "noi_dung", "text", "content"),
                "tags_kind": ("loaithe", "loai_the", "tagskind", "tags_kind"),
                "tags": ("danhsachthe", "danh_sach_the", "the", "tags"),
                "has_ex": ("covidu", "co_vi_du", "hasexample", "has_example"),
                "ex_title": ("tieudevidu", "tieu_de_vi_du", "ex_title"),
                "ex_prob": ("devidu", "de_vi_du", "debai_vidu", "ex_problem"),
                "ex_sol": ("loigiaividu", "loi_giai_vi_du", "giaividu", "ex_solution"),
            },
        )
        cards_by_key: dict[str, dict] = {}
        card_order: list[str] = []
        last_key = ""
        for r_idx, row in enumerate(know_rows[1:], start=2):
            line_text = _get_cell(row, cmap.get("text"))
            raw_tags = _get_cell(row, cmap.get("tags"))
            if not line_text and not raw_tags:
                continue

            stt_val = _get_cell(row, cmap.get("stt"))
            box_title = _get_cell(row, cmap.get("title"))
            box_type_raw = _get_cell(row, cmap.get("type"))
            box_style_raw = _get_cell(row, cmap.get("style"))

            if stt_val:
                card_key = f"stt:{stt_val}"
            elif box_title:
                card_key = f"title:{_norm_key(box_title)}"
            elif last_key:
                card_key = last_key
            else:
                card_key = f"auto:{r_idx}"
            last_key = card_key

            if card_key not in cards_by_key:
                c_num = len(card_order) + 1
                b_type = BOX_TYPE_ALIASES.get(_norm_key(box_type_raw), "theory")
                b_style = BOX_STYLE_ALIASES.get(_norm_key(box_style_raw), "")
                card_obj: dict = {
                    "id": f"xl-{uid}-c{c_num}",
                    "type": b_type,
                    "title": box_title or f"Mục kiến thức {c_num}",
                    "items": [],
                }
                if b_style:
                    card_obj["boxStyle"] = b_style
                cards_by_key[card_key] = card_obj
                card_order.append(card_key)

            card_obj = cards_by_key[card_key]
            tags_kind = _get_cell(row, cmap.get("tags_kind"))
            item_html = _build_item_html(line_text, tags_kind, raw_tags)

            ex_title = _get_cell(row, cmap.get("ex_title"))
            ex_prob = _get_cell(row, cmap.get("ex_prob"))
            ex_sol = _get_cell(row, cmap.get("ex_sol"))
            has_ex_cell = _get_cell(row, cmap.get("has_ex"))
            has_ex = bool(ex_prob or ex_sol) or _parse_bool_vn(has_ex_cell)

            item_idx = len(card_obj["items"]) + 1
            card_obj["items"].append(
                {
                    "id": f"{card_obj['id']}-i{item_idx}",
                    "html": item_html,
                    "hasExample": has_ex and bool(ex_prob or ex_sol),
                    "example": (
                        {
                            "title": ex_title or "Ví dụ minh họa",
                            "problem": friendly_inline_to_html(ex_prob),
                            "solution": friendly_inline_to_html(ex_sol),
                        }
                        if (has_ex and (ex_prob or ex_sol))
                        else None
                    ),
                }
            )

        core_cards = [cards_by_key[k] for k in card_order]
    else:
        warnings.append("Không tìm thấy dữ liệu ở sheet KienThuc.")

    # 3. Sheet BayHaySai -> flipCards[]
    flip_rows = _find_sheet(sheets, ("bayhaysai", "bay_hay_sai", "flipcards", "thelat", "bay"))
    flip_cards: list[dict] = []
    if len(flip_rows) >= 2:
        fmap = _col_map(
            flip_rows[0],
            {
                "label": ("tenbay", "ten_bay", "traplabel", "trap_label", "tieude"),
                "problem": ("debai", "de_bai", "problem", "cauhoi"),
                "mode": ("kieudapan", "kieu_dap_an", "mode", "loai"),
                "answer": ("dapandung", "dap_an_dung", "dapan", "answer"),
                "trap": ("giaithichbay", "giai_thich_bay", "bay", "trap"),
                "correct": ("loigiaidung", "loi_giai_dung", "dung", "correct", "giaithich"),
            },
        )
        for row in flip_rows[1:]:
            prob = _get_cell(row, fmap.get("problem"))
            if not prob:
                continue
            label = _get_cell(row, fmap.get("label")) or "Bẫy hay sai"
            mode_tok = _norm_key(_get_cell(row, fmap.get("mode")))
            ans_raw = _get_cell(row, fmap.get("answer"))
            ans_parts = [p.strip() for p in re.split(r"\s*[;|]\s*", ans_raw) if p.strip()]
            is_multi = mode_tok in ("multi", "nhieu", "nhieu_nghiem", "multiset")

            fc: dict = {
                "id": f"xl-{uid}-f{len(flip_cards) + 1}",
                "trapCategory": "custom",
                "trapLabel": label,
                "problem": friendly_inline_to_html(prob),
                "placeholder": "Nhập đáp án...",
                "trapExplanation": friendly_inline_to_html(_get_cell(row, fmap.get("trap"))),
                "correctExplanation": friendly_inline_to_html(_get_cell(row, fmap.get("correct"))),
            }
            if is_multi:
                fc["acceptedMultiSet"] = ans_parts or [""]
            else:
                fc["acceptedAnswers"] = ans_parts or [""]
            flip_cards.append(fc)

    # 4. Sheet LuyenNhanh -> quizzes { multipleChoice, trueFalse, shortAnswer }
    quiz_rows = _find_sheet(sheets, ("luyennhanh", "luyen_nhanh", "quizzes", "quiz", "cauhoi", "luyentap"))
    mcs: list[dict] = []
    tfs: list[dict] = []
    sas: list[dict] = []
    if len(quiz_rows) >= 2:
        qmap = _col_map(
            quiz_rows[0],
            {
                "type": ("loai", "type", "dang"),
                "question": ("cauhoi", "cau_hoi", "question", "debai", "stem"),
                "a": ("a", "dapan_a", "phuongan_a", "y_a"),
                "b": ("b", "dapan_b", "phuongan_b", "y_b"),
                "c": ("c", "dapan_c", "phuongan_c", "y_c"),
                "d": ("d", "dapan_d", "phuongan_d", "y_d"),
                "answer": ("dapandung", "dap_an_dung", "dapan", "answer"),
                "explanation": ("giaithich", "giai_thich", "loigiai", "explanation"),
                "vars": ("bienso", "bien_so", "vars", "thamso", "tham_so", "params"),
            },
        )
        for r_idx, row in enumerate(quiz_rows[1:], start=2):
            q_text_raw = _get_cell(row, qmap.get("question"))
            if not q_text_raw:
                continue
            q_type = _norm_key(_get_cell(row, qmap.get("type")))
            vars_raw = _get_cell(row, qmap.get("vars"))
            fixed_env = _parse_fixed_vars(vars_raw)

            q_text = _render_param_template(q_text_raw, fixed_env)
            opt_a = _render_param_template(_get_cell(row, qmap.get("a")), fixed_env)
            opt_b = _render_param_template(_get_cell(row, qmap.get("b")), fixed_env)
            opt_c = _render_param_template(_get_cell(row, qmap.get("c")), fixed_env)
            opt_d = _render_param_template(_get_cell(row, qmap.get("d")), fixed_env)
            ans_tpl = _get_cell(row, qmap.get("answer"))
            ans_raw = _render_param_template(ans_tpl, fixed_env)
            exp_tpl = _get_cell(row, qmap.get("explanation"))
            exp_raw = _render_param_template(exp_tpl, fixed_env)

            if q_type in ("mc", "mcq", "tn", "trac_nghiem", "tracnghiem", "multiple_choice"):
                letter_map = {"a": 0, "b": 1, "c": 2, "d": 3, "1": 0, "2": 1, "3": 2, "4": 3}
                c_idx = letter_map.get(ans_raw.strip().lower()[:1], 0)
                mcs.append(
                    {
                        "id": f"xl-{uid}-mc{len(mcs) + 1}",
                        "question": friendly_inline_to_html(q_text),
                        "options": [
                            friendly_inline_to_html(opt_a),
                            friendly_inline_to_html(opt_b),
                            friendly_inline_to_html(opt_c),
                            friendly_inline_to_html(opt_d),
                        ],
                        "correctIndex": c_idx,
                        "explanation": friendly_inline_to_html(exp_raw),
                    }
                )
            elif q_type in ("tf", "ds", "dung_sai", "dungsai", "true_false"):
                flags = _parse_tf_flags(ans_raw)
                exp_parts = [p.strip() for p in exp_raw.split("|")] if "|" in exp_raw else []
                opts = [opt_a, opt_b, opt_c, opt_d]
                labels = ["a", "b", "c", "d"]
                statements = []
                for si in range(4):
                    st_exp = exp_parts[si] if si < len(exp_parts) else (exp_raw if si == 0 else "")
                    statements.append(
                        {
                            "label": labels[si],
                            "text": friendly_inline_to_html(opts[si]),
                            "isTrue": flags[si],
                            "explanation": friendly_inline_to_html(st_exp),
                        }
                    )
                tfs.append(
                    {
                        "id": f"xl-{uid}-tf{len(tfs) + 1}",
                        "stem": friendly_inline_to_html(q_text),
                        "statements": statements,
                    }
                )
            elif q_type in ("sa", "tln", "short", "short_answer", "tra_loi_ngan", "traloingan"):
                sa_item: dict = {
                    "id": f"xl-{uid}-sa{len(sas) + 1}",
                    "question": friendly_inline_to_html(q_text),
                    "correctAnswer": ans_raw,
                    "explanation": friendly_inline_to_html(exp_raw),
                }
                if vars_raw:
                    sa_item["paramSpec"] = {
                        "vars": vars_raw,
                        "questionTemplate": friendly_inline_to_html(q_text_raw),
                        "answerTemplate": ans_tpl,
                        "explanationTemplate": friendly_inline_to_html(exp_tpl),
                    }
                sas.append(sa_item)
            else:
                warnings.append(f"Sheet LuyenNhanh dòng {r_idx}: không nhận diện được loại '{_get_cell(row, qmap.get('type'))}' (dùng mc / tf / sa).")

    lesson = {
        "id": f"xl-lesson-{uid}",
        "code": lesson_code,
        "title": lesson_title,
        "summary": lesson_summary,
        "coreCards": core_cards,
        "flipCards": flip_cards,
        "examples": [],
        "quizzes": {
            "multipleChoice": mcs,
            "trueFalse": tfs,
            "shortAnswer": sas,
        },
    }

    total_lines = sum(len(c.get("items", [])) for c in core_cards)
    total_examples = sum(1 for c in core_cards for it in c.get("items", []) if it.get("hasExample"))

    return {
        "grade": grade,
        "chapterCode": chapter_code,
        "chapterTitle": chapter_title,
        "lesson": lesson,
        "summary": {
            "boxCount": len(core_cards),
            "lineCount": total_lines,
            "exampleCount": total_examples,
            "flipCount": len(flip_cards),
            "mcCount": len(mcs),
            "tfCount": len(tfs),
            "saCount": len(sas),
        },
        "warnings": warnings,
    }
