#!/usr/bin/env python3
"""
Zero-dependency Excel (.xlsx) & CSV importer/exporter for Edu Live Game.
Uses Python 3.12 standard library only (zipfile, xml.etree.ElementTree, csv, io).
"""

from __future__ import annotations

import csv
import io
import re
import uuid
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape


TEMPLATE_HEADERS = [
    "Loai",
    "CauHoi",
    "DapAn_A",
    "DapAn_B",
    "DapAn_C",
    "DapAn_D",
    "DapAnDung",
    "GoiY_MoRong",
    "ThoiGian",
    "GiaiThich",
]

TYPE_ALIASES = {
    "mcq": "mcq",
    "trac_nghiem": "mcq",
    "tracnghiem": "mcq",
    "tn": "mcq",
    "multiple_choice": "mcq",
    "true_false": "true_false",
    "tf": "true_false",
    "dung_sai": "true_false",
    "dungsai": "true_false",
    "ds": "true_false",
    "short_answer": "short_answer",
    "short": "short_answer",
    "tra_loi_ngan": "short_answer",
    "traloingan": "short_answer",
    "tln": "short_answer",
    "fill_blank": "fill_blank",
    "cloze": "fill_blank",
    "dien_cho_trong": "fill_blank",
    "dienchotrong": "fill_blank",
    "dct": "fill_blank",
    "drag_order": "drag_order",
    "order": "drag_order",
    "sap_xep": "drag_order",
    "sapxep": "drag_order",
    "sx": "drag_order",
    "drag_match": "drag_match",
    "match": "drag_match",
    "ghep_doi": "drag_match",
    "ghepdoi": "drag_match",
    "gd": "drag_match",
}

TEMPLATE_SAMPLE_ROWS = [
    [
        "mcq",
        "Hàm số $y = x^3 - 3x + 2$ đồng biến trên khoảng nào dưới đây?",
        "$(-1; 1)$",
        "$(-\\infty; -1)$ và $(1; +\\infty)$",
        "$(0; +\\infty)$",
        "$(-\\infty; +\\infty)$",
        "B",
        "",
        "30",
        "Ta có $y' = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. Vì hệ số $a = 3 > 0$ nên $y' > 0$ trên $(-\\infty; -1)$ và $(1; +\\infty)$.",
    ],
    [
        "true_false",
        "Cho hàm số $y = \\frac{2x - 1}{x - 1}$. Xét tính Đúng / Sai của các mệnh đề sau:",
        "Tập xác định của hàm số là $D = \\mathbb{R} \\setminus \\{1\\}$.",
        "Đạo hàm của hàm số là $y' = \\frac{1}{(x-1)^2} > 0$.",
        "Đồ thị hàm số có tiệm cận đứng $x = 1$ và tiệm cận ngang $y = 2$.",
        "Hàm số có đúng 1 điểm cực trị.",
        "D,S,D,S",
        "",
        "45",
        "a) Đúng ($x \\neq 1$). b) Sai vì $y' = \\frac{2(-1) - 1(-1)}{(x-1)^2} = \\frac{-1}{(x-1)^2} < 0$. c) Đúng. d) Sai vì hàm nhất biến không có cực trị.",
    ],
    [
        "short_answer",
        "Tìm giá trị lớn nhất của hàm số $y = -x^2 + 4x + 1$ trên $\\mathbb{R}$.",
        "",
        "",
        "",
        "",
        "5",
        "Nhập số nguyên",
        "30",
        "Ta viết $y = -(x - 2)^2 + 5 \\le 5$ với mọi $x \\in \\mathbb{R}$. Dấu bằng xảy ra khi $x = 2$, suy ra $\\max y = 5$.",
    ],
    [
        "fill_blank",
        "Hàm số $y = x^3 - 3x$ đạt cực đại tại $x = {{-1}}$ và giá trị cực đại là $y_{CĐ} = {{2}}$.",
        "",
        "",
        "",
        "",
        "",
        "1 | -2 | 0 | 3",
        "40",
        "Từ $y' = 3x^2 - 3 = 0 \\Rightarrow x = \\pm 1$. Qua $x = -1$, $y'$ đổi dấu từ $+$ sang $-$ nên đạt cực đại $y(-1) = 2$.",
    ],
    [
        "drag_order",
        "Kéo thả để sắp xếp đúng thứ tự 4 bước khảo sát sự biến thiên của hàm số:",
        "Tìm tập xác định $D$ của hàm số",
        "Tính đạo hàm $y'$ và tìm các điểm tại đó $y' = 0$ hoặc không xác định",
        "Xét dấu $y'$ và lập bảng biến thiên",
        "Kết luận các khoảng đơn điệu và điểm cực trị",
        "",
        "",
        "40",
        "Quy trình chuẩn luôn bắt đầu từ tập xác định $D$, tiếp theo là đạo hàm $y'$, lập bảng biến thiên rồi mới kết luận.",
    ],
    [
        "drag_match",
        "Kéo thả ghép mỗi hàm số ở cột trái với đạo hàm tương ứng ở cột phải:",
        "$y = x^3$ => $y' = 3x^2$",
        "$y = \\sin x$ => $y' = \\cos x$",
        "$y = e^x$ => $y' = e^x$",
        "$y = \\ln x$ => $y' = \\frac{1}{x}$",
        "",
        "",
        "45",
        "Đây là 4 công thức đạo hàm sơ cấp cơ bản hay gặp nhất trong đề thi THPT: $(x^n)' = nx^{n-1}$, $(\\sin x)' = \\cos x$, $(e^x)' = e^x$, $(\\ln x)' = 1/x$.",
    ],
]


def _col_letter_to_index(ref: str) -> int:
    """Convert Excel cell reference like 'C5' to 0-based column index 2."""
    col_str = "".join(ch for ch in ref if ch.isalpha()).upper()
    idx = 0
    for ch in col_str:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return max(0, idx - 1)


def _index_to_col_letter(idx: int) -> str:
    """Convert 0-based column index to Excel column letters (0->A, 26->AA)."""
    out = []
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out.append(chr(ord("A") + rem))
    return "".join(reversed(out))


def read_xlsx_rows(raw_bytes: bytes) -> list[list[str]]:
    """Parse the first worksheet of an .xlsx file into a list of string rows."""
    with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as zf:
        names = set(zf.namelist())
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in names:
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    parts = []
                    for t in si.iter():
                        if t.tag.endswith("}t") or t.tag == "t":
                            if t.text:
                                parts.append(t.text)
                    shared_strings.append("".join(parts))

        # Locate first worksheet
        sheet_path = "xl/worksheets/sheet1.xml"
        if sheet_path not in names:
            candidates = sorted(
                n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")
            )
            if not candidates:
                raise ValueError("File Excel không chứa trang tính (worksheet) hợp lệ.")
            sheet_path = candidates[0]

        sheet_root = ET.fromstring(zf.read(sheet_path))
        rows: list[list[str]] = []
        for row_el in sheet_root.iter():
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
                    parts = []
                    for t in cell.iter():
                        if t.tag.endswith("}t") or t.tag == "t":
                            if t.text:
                                parts.append(t.text)
                    val = "".join(parts)
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
        return rows


def read_csv_rows(raw_bytes: bytes) -> list[list[str]]:
    """Decode UTF-8 (with or without BOM) or UTF-16 CSV bytes into rows."""
    text = None
    for enc in ("utf-8-sig", "utf-8", "utf-16", "cp1258", "latin-1"):
        try:
            text = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Không thể giải mã tệp CSV. Vui lòng lưu file dưới dạng UTF-8.")

    # Auto-detect delimiter (, or ;)
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") and "\n" in sample else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [[cell.strip() for cell in row] for row in reader if any(c.strip() for c in row)]
    return rows


def parse_fill_blank_template(raw_prompt: str, extra_distractors: str = "") -> dict:
    """
    Convert 'Hàm số đạt cực đại tại $x = {{-1}}$ và $y = {{2}}$'
    into structured {template, blanks, wordBank, useWordBank}.
    """
    blanks = []
    blank_answers_display = []

    def _repl(match: re.Match) -> str:
        inner = match.group(1).strip()
        accepted = [part.strip() for part in inner.split("|") if part.strip()]
        if not accepted:
            accepted = [""]
        idx = len(blanks)
        blanks.append({"accepted": accepted})
        blank_answers_display.append(accepted[0])
        return f"{{{{{idx}}}}}"

    template = re.sub(r"\{\{(.+?)\}\}", _repl, raw_prompt)
    if not blanks:
        # Fallback if user forgot {{...}}
        blanks = [{"accepted": ["..."]}]
        template = raw_prompt.rstrip() + " {{0}}"
        blank_answers_display = ["..."]

    distractors = [
        p.strip()
        for p in re.split(r"\s*[|;]\s*", extra_distractors or "")
        if p.strip()
    ]
    word_bank: list[str] = []
    if distractors:
        seen = set()
        for item in blank_answers_display + distractors:
            if item and item not in seen:
                seen.add(item)
                word_bank.append(item)

    return {
        "template": template,
        "blanks": blanks,
        "wordBank": word_bank,
        "useWordBank": len(word_bank) > 0,
    }


def _parse_bool_token(tok: str) -> bool:
    t = tok.strip().lower()
    return t in ("d", "đ", "dung", "đúng", "t", "true", "1", "yes", "y")


def rows_to_questions(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """Convert spreadsheet rows (header + data rows) into structured question dicts."""
    if not rows:
        return [], ["Tệp không có dữ liệu."]

    # Normalize header mapping
    first = [c.strip().lower().replace(" ", "").replace("-", "_") for c in rows[0]]
    has_header = any(
        h in ("loai", "type", "cauhoi", "question", "dapan_a", "dapandung")
        for h in first
    )
    start_row = 1 if has_header else 0

    col_idx = {
        "loai": 0,
        "cauhoi": 1,
        "a": 2,
        "b": 3,
        "c": 4,
        "d": 5,
        "dapandung": 6,
        "goiy": 7,
        "thoigian": 8,
        "giaithich": 9,
    }

    if has_header:
        for i, h in enumerate(first):
            if h in ("loai", "type", "dang"):
                col_idx["loai"] = i
            elif h in ("cauhoi", "question", "noidung", "prompt"):
                col_idx["cauhoi"] = i
            elif h in ("dapan_a", "a", "phuongan_a", "opt_a"):
                col_idx["a"] = i
            elif h in ("dapan_b", "b", "phuongan_b", "opt_b"):
                col_idx["b"] = i
            elif h in ("dapan_c", "c", "phuongan_c", "opt_c"):
                col_idx["c"] = i
            elif h in ("dapan_d", "d", "phuongan_d", "opt_d"):
                col_idx["d"] = i
            elif h in ("dapandung", "answer", "correct", "dapan"):
                col_idx["dapandung"] = i
            elif h in ("goiy_morong", "goiy_hoac_capghep", "goiy", "extra", "wordbank"):
                col_idx["goiy"] = i
            elif h in ("thoigian", "time", "timelimit", "giay"):
                col_idx["thoigian"] = i
            elif h in ("giaithich", "explanation", "loigiai"):
                col_idx["giaithich"] = i

    def _get(r: list[str], key: str) -> str:
        idx = col_idx[key]
        return r[idx].strip() if idx < len(r) else ""

    questions: list[dict] = []
    warnings: list[str] = []

    for r_num, row in enumerate(rows[start_row:], start=start_row + 1):
        raw_type = _get(row, "loai").lower().replace(" ", "_").replace("-", "_")
        if not raw_type or raw_type.startswith("#"):
            continue
        q_type = TYPE_ALIASES.get(raw_type)
        if not q_type:
            warnings.append(f"Dòng {r_num}: Không nhận diện được loại câu hỏi '{raw_type}', đã bỏ qua.")
            continue

        prompt = _get(row, "cauhoi")
        if not prompt:
            warnings.append(f"Dòng {r_num}: Thiếu nội dung câu hỏi, đã bỏ qua.")
            continue

        a = _get(row, "a")
        b = _get(row, "b")
        c = _get(row, "c")
        d = _get(row, "d")
        ans_raw = _get(row, "dapandung")
        extra = _get(row, "goiy")
        time_raw = _get(row, "thoigian")
        explanation = _get(row, "giaithich")

        try:
            time_limit = int(float(time_raw)) if time_raw else 30
            time_limit = max(0, min(600, time_limit))
        except ValueError:
            time_limit = 30

        q_id = f"q-{uuid.uuid4().hex[:8]}"
        data: dict = {}

        if q_type == "mcq":
            options = [opt for opt in (a, b, c, d) if opt != ""]
            while len(options) < 4:
                options.append(f"Phương án {chr(65 + len(options))}")
            ans_upper = ans_raw.strip().upper()
            letter_map = {"A": 0, "B": 1, "C": 2, "D": 3, "1": 0, "2": 1, "3": 2, "4": 3}
            correct_idx = letter_map.get(ans_upper[:1], 0) if ans_upper else 0
            data = {"options": options[:4], "correctIndex": correct_idx}

        elif q_type == "true_false":
            stmts_text = [s for s in (a, b, c, d) if s != ""]
            ans_tokens = [t.strip() for t in re.split(r"[,;|/\s]+", ans_raw) if t.strip()]
            if not stmts_text:
                # Single-statement True/False directly from prompt
                ans_bool = _parse_bool_token(ans_tokens[0]) if ans_tokens else True
                data = {"statements": [{"text": "", "answer": ans_bool}]}
            else:
                statements = []
                for idx, txt in enumerate(stmts_text):
                    ans_bool = _parse_bool_token(ans_tokens[idx]) if idx < len(ans_tokens) else True
                    statements.append({"text": txt, "answer": ans_bool})
                data = {"statements": statements}

        elif q_type == "short_answer":
            accepted = [p.strip() for p in re.split(r"\s*[|;]\s*", ans_raw) if p.strip()]
            if not accepted:
                accepted = [""]
            data = {
                "acceptedAnswers": accepted,
                "caseSensitive": False,
                "placeholder": extra or "Nhập câu trả lời của em...",
            }

        elif q_type == "fill_blank":
            data = parse_fill_blank_template(prompt, extra)

        elif q_type == "drag_order":
            items = [x for x in (a, b, c, d) if x != ""]
            if extra:
                more = [p.strip() for p in extra.split("||") if p.strip()]
                items.extend(more)
            if len(items) < 2:
                warnings.append(f"Dòng {r_num}: Dạng kéo thả sắp xếp cần ít nhất 2 mục.")
                continue
            data = {"items": items}

        elif q_type == "drag_match":
            raw_pairs = [x for x in (a, b, c, d) if x != ""]
            if extra:
                raw_pairs.extend([p.strip() for p in extra.split("||") if p.strip()])
            pairs = []
            for rp in raw_pairs:
                if "=>" in rp:
                    left, right = rp.split("=>", 1)
                elif "->" in rp:
                    left, right = rp.split("->", 1)
                elif "::" in rp:
                    left, right = rp.split("::", 1)
                elif "=" in rp:
                    left, right = rp.split("=", 1)
                else:
                    continue
                if left.strip() and right.strip():
                    pairs.append({"left": left.strip(), "right": right.strip()})
            if len(pairs) < 2:
                warnings.append(f"Dòng {r_num}: Dạng kéo thả ghép đôi cần ít nhất 2 cặp dạng 'Trái => Phải'.")
                continue
            data = {"pairs": pairs}

        questions.append(
            {
                "id": q_id,
                "type": q_type,
                "prompt": prompt,
                "image": "",
                "timeLimit": time_limit,
                "points": 1000,
                "explanation": explanation,
                "data": data,
            }
        )

    return questions, warnings


def build_template_csv() -> bytes:
    """Return UTF-8 BOM CSV bytes so Excel opens Vietnamese characters cleanly."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(TEMPLATE_HEADERS)
    for row in TEMPLATE_SAMPLE_ROWS:
        writer.writerow(row)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def build_template_xlsx() -> bytes:
    """Generate a valid, styled .xlsx workbook with sample questions + guide sheet."""
    guide_rows = [
        ["HƯỚNG DẪN SOẠN BỘ CÂU HỎI EXCEL — GAME TƯƠNG TÁC LỚP HỌC", ""],
        ["", ""],
        ["1. Các mã loại câu hỏi (cột Loai):", "Ý nghĩa & Cách nhập"],
        ["mcq (hoặc trac_nghiem)", "Trắc nghiệm 4 đáp án A, B, C, D. Cột DapAnDung ghi A, B, C hoặc D."],
        ["true_false (hoặc dung_sai)", "Đúng/Sai 1 mệnh đề (để trống A..D, DapAnDung ghi D hoặc S) HOẶC Đúng/Sai 4 ý a,b,c,d chuẩn 2025 (điền mệnh đề vào A..D, DapAnDung ghi D,S,D,S)."],
        ["short_answer (hoặc tra_loi_ngan)", "Trả lời ngắn. Cột DapAnDung liệt kê các đáp án đúng cách nhau dấu | (vd: 3,5 | 3.5 | 7/2)."],
        ["fill_blank (hoặc dien_cho_trong)", "Điền chỗ trống. Trong cột CauHoi, bọc đáp án đúng bằng {{...}} (vd: Đạo hàm của $x^2$ là {{2x}}). Cột GoiY_MoRong nhập thêm các từ nhiễu cách nhau dấu | để tạo thẻ kéo thả cho học sinh."],
        ["drag_order (hoặc sap_xep)", "Kéo thả sắp xếp thứ tự. Nhập các bước theo ĐÚNG THỨ TỰ vào DapAn_A, B, C, D (nếu nhiều hơn 4 bước, nhập thêm vào GoiY_MoRong cách nhau dấu ||)."],
        ["drag_match (hoặc ghep_doi)", "Kéo thả ghép đôi. Nhập các cặp vào DapAn_A..D theo mẫu: Vế trái => Vế phải (thêm cặp ở GoiY_MoRong cách nhau ||)."],
        ["", ""],
        ["2. Công thức Toán học (KaTeX):", "Bọc công thức trong $...$ (cùng dòng) hoặc $$...$$ (riêng dòng). Ví dụ: $\\int_0^1 x^2 dx = \\frac{1}{3}$."],
        ["3. Cột ThoiGian:", "Số giây cho mỗi câu (ví dụ: 30, 45). Nhập 0 nếu không giới hạn thời gian."],
        ["4. Cột GiaiThich:", "Nội dung trình chiếu trên màn hình chính sau khi khóa đáp án để giáo viên giải thích cho cả lớp."],
    ]

    def _sheet_xml(rows_data: list[list[str]], col_widths: list[int], style_header: bool = True) -> str:
        cols_xml = "".join(
            f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>'
            for i, w in enumerate(col_widths)
        )
        rows_xml = []
        for r_idx, row in enumerate(rows_data, start=1):
            cells = []
            for c_idx, val in enumerate(row):
                ref = f"{_index_to_col_letter(c_idx)}{r_idx}"
                s_attr = ' s="1"' if (style_header and r_idx == 1) else ' s="2"'
                escaped = xml_escape(str(val))
                cells.append(f'<c r="{ref}" t="inlineStr"{s_attr}><is><t xml:space="preserve">{escaped}</t></is></c>')
            ht = ' ht="26" customHeight="1"' if r_idx == 1 else ""
            rows_xml.append(f'<row r="{r_idx}"{ht}>{"".join(cells)}</row>')
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f"<cols>{cols_xml}</cols>"
            f'<sheetData>{"".join(rows_xml)}</sheetData>'
            "</worksheet>"
        )

    sheet1_xml = _sheet_xml(
        [TEMPLATE_HEADERS] + TEMPLATE_SAMPLE_ROWS,
        [15, 48, 28, 28, 28, 28, 16, 22, 12, 48],
        style_header=True,
    )
    sheet2_xml = _sheet_xml(guide_rows, [32, 85], style_header=True)

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )

    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        '<sheet name="BoCauHoi" sheetId="1" r:id="rId1"/>'
        '<sheet name="HuongDan" sheetId="2" r:id="rId2"/>'
        "</sheets>"
        "</workbook>"
    )

    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )

    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2">'
        '<font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
        "</fonts>"
        '<fills count="3">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/></patternFill></fill>'
        "</fills>"
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
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
        zf.writestr("xl/worksheets/sheet1.xml", sheet1_xml)
        zf.writestr("xl/worksheets/sheet2.xml", sheet2_xml)
    return out.getvalue()
