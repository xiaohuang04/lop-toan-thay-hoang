#!/usr/bin/env python3
r"""
EduLab / Lớp toán thầy Hoàng — Exam Parsers
1. Primary: LaTeX `ex_test` parser (\begin{ex}...\end{ex}, \choice, \choiceTF, \shortans, \loigiai, \heva, \hoac, \immini, tabular)
2. Word (.docx) parser with Microsoft Equation (OMML -> LaTeX) & MathType OLE/image support + auto answer detection (underline / red / bold)
3. Structured plain-text parser (used for PDF extracted text & Word fallback)
"""

from __future__ import annotations

import base64
import io
import re
import struct
import time
import zipfile
import xml.etree.ElementTree as ET


# =============================================================================
# UTILITY: BALANCED BRACE / ARGUMENT EXTRACTOR FOR LATEX
# =============================================================================

def strip_latex_comments(text: str) -> str:
    """Remove unescaped % line comments while preserving \\% and extracting %[...] metadata first."""
    lines = []
    for line in text.splitlines():
        out = []
        i = 0
        n = len(line)
        while i < n:
            ch = line[i]
            if ch == "\\" and i + 1 < n:
                out.append(ch)
                out.append(line[i + 1])
                i += 2
                continue
            if ch == "%":
                break
            out.append(ch)
            i += 1
        lines.append("".join(out))
    return "\n".join(lines)


def skip_ws(text: str, pos: int) -> int:
    n = len(text)
    while pos < n and text[pos] in " \t\r\n":
        pos += 1
    return pos


def read_balanced(text: str, pos: int, open_ch: str = "{", close_ch: str = "}") -> tuple[str | None, int]:
    """Read a balanced {...} or [...] block starting at pos (after skipping whitespace)."""
    pos = skip_ws(text, pos)
    if pos >= len(text) or text[pos] != open_ch:
        return None, pos
    depth = 0
    start = pos + 1
    i = pos
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\" and i + 1 < n:
            i += 2
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
        i += 1
    return text[start:], n


def replace_command_1arg(text: str, cmd: str, transform) -> str:
    """Replace all occurrences of \\cmd{...} with transform(inner), handling nested braces."""
    token = "\\" + cmd
    out = []
    i = 0
    n = len(text)
    while i < n:
        idx = text.find(token, i)
        if idx == -1:
            out.append(text[i:])
            break
        after = idx + len(token)
        # Ensure exact command boundary (next char not ASCII letter)
        if after < n and text[after].isalpha():
            out.append(text[i:after])
            i = after
            continue
        # Skip optional [...] argument if present
        p = skip_ws(text, after)
        if p < n and text[p] == "[":
            _, p = read_balanced(text, p, "[", "]")
        inner, end_pos = read_balanced(text, p, "{", "}")
        if inner is None:
            out.append(text[i:after])
            i = after
            continue
        out.append(text[i:idx])
        out.append(transform(inner))
        i = end_pos
    return "".join(out)


def replace_command_2args(text: str, cmd: str, transform) -> str:
    """Replace \\cmd[opt]{arg1}{arg2} using balanced braces."""
    token = "\\" + cmd
    out = []
    i = 0
    n = len(text)
    while i < n:
        idx = text.find(token, i)
        if idx == -1:
            out.append(text[i:])
            break
        after = idx + len(token)
        if after < n and text[after].isalpha():
            out.append(text[i:after])
            i = after
            continue
        p = skip_ws(text, after)
        while p < n and text[p] == "[":
            _, p = read_balanced(text, p, "[", "]")
            p = skip_ws(text, p)
        arg1, p1 = read_balanced(text, p, "{", "}")
        if arg1 is None:
            out.append(text[i:after])
            i = after
            continue
        arg2, p2 = read_balanced(text, p1, "{", "}")
        if arg2 is None:
            out.append(text[i:after])
            i = after
            continue
        out.append(text[i:idx])
        out.append(transform(arg1, arg2))
        i = p2
    return "".join(out)


def convert_tabular_to_html(body: str) -> str:
    """Convert a LaTeX tabular body to an HTML <table class='q-table'>."""
    cleaned = re.sub(r"\\(hline|cline\{[^}]*\}|toprule|midrule|bottomrule)", "", body)
    rows = [r.strip() for r in re.split(r"\\\\", cleaned) if r.strip()]
    if not rows:
        return ""
    html_rows = []
    for ri, row in enumerate(rows):
        cells = [clean_latex_fragment(c.strip()) for c in row.split("&")]
        tag = "th" if ri == 0 else "td"
        tds = "".join(f"<{tag}>{c}</{tag}>" for c in cells)
        html_rows.append(f"<tr>{tds}</tr>")
    if len(html_rows) > 1:
        return f'<table class="q-table"><thead>{html_rows[0]}</thead><tbody>{"".join(html_rows[1:])}</tbody></table>'
    return f'<table class="q-table"><tbody>{"".join(html_rows)}</tbody></table>'


def clean_latex_fragment(raw: str) -> str:
    """Normalize Vietnamese ex_test LaTeX fragment into clean HTML + KaTeX math."""
    s = raw.strip()
    if not s:
        return ""

    # Handle \immini[...]{left}{right} -> keep text and figure/note
    def _immini(a1: str, a2: str) -> str:
        t1 = clean_latex_fragment(a1)
        t2 = clean_latex_fragment(a2)
        if not t2:
            return t1
        return f"{t1}<div class=\"q-figure\">{t2}</div>"

    s = replace_command_2args(s, "immini", _immini)

    # Convert \begin{tabular}{cols}...\end{tabular}
    def _tabular_sub(m: re.Match) -> str:
        return convert_tabular_to_html(m.group(2))

    s = re.sub(
        r"\\begin\{tabular\}(\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}",
        _tabular_sub,
        s,
    )

    # Replace TikZ diagrams with clear note so teacher knows where figure was
    s = re.sub(
        r"\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}",
        '<div class="tikz-placeholder">[Hình vẽ TikZ — có thể chèn ảnh SVG/HTML trong Trình tinh chỉnh]</div>',
        s,
    )

    # Handle \begin{itemchoice} ... \end{itemchoice} (Part II ex_test solutions)
    def _itemchoice_sub(m: re.Match) -> str:
        inner = m.group(1)
        parts = re.split(r"\\itemch\b", inner)
        labels = ["a", "b", "c", "d", "e", "f"]
        items = []
        idx = 0
        for p in parts:
            p = p.strip()
            if not p:
                continue
            lbl = labels[idx] if idx < len(labels) else str(idx + 1)
            idx += 1
            items.append(f"• <strong>{lbl})</strong> {clean_latex_fragment(p)}")
        return "<br/>".join(items)

    s = re.sub(r"\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}", _itemchoice_sub, s)

    # Handle itemize / enumerate
    def _list_sub(m: re.Match) -> str:
        inner = m.group(2)
        items = [clean_latex_fragment(x.strip()) for x in re.split(r"\\item\b", inner) if x.strip()]
        return "<br/>".join(f"• {x}" for x in items)

    s = re.sub(r"\\begin\{(itemize|enumerate)\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{\1\}", _list_sub, s)

    # Center / flushleft
    s = re.sub(r"\\begin\{center\}([\s\S]*?)\\end\{center\}", lambda m: f'<div style="text-align:center;margin:6px 0;">{clean_latex_fragment(m.group(1))}</div>', s)

    # Vietnamese ex_test math macros: \heva{...} and \hoac{...}
    s = replace_command_1arg(s, "heva", lambda inner: r"\left\{\begin{aligned}" + inner.strip() + r"\end{aligned}\right.")
    s = replace_command_1arg(s, "hoac", lambda inner: r"\left[\begin{aligned}" + inner.strip() + r"\end{aligned}\right.")

    # Common Vietnamese math shortcuts
    s = re.sub(r"\\vec\{([^}]+)\}", r"\\overrightarrow{\1}", s)
    s = s.replace("\\limits", "")
    s = s.replace("\\lq\\lq", "“").replace("\\rq\\rq", "”")
    s = s.replace("``", "“").replace("''", "”")
    s = s.replace("~", " ")

    # Text formatting commands (safe outside math)
    s = replace_command_1arg(s, "textbf", lambda inner: f"<strong>{inner}</strong>")
    s = replace_command_1arg(s, "textit", lambda inner: f"<em>{inner}</em>")
    s = replace_command_1arg(s, "underline", lambda inner: f"<u>{inner}</u>")
    s = replace_command_1arg(s, "emph", lambda inner: f"<em>{inner}</em>")

    # Convert display math \[ ... \] -> $$ ... $$ and inline \( ... \) -> $ ... $
    # (KaTeX supports both, normalizing helps clean spacing)
    # Handle explicit line breaks \\ outside math environments carefully
    s = _convert_text_newlines(s)

    # Clean multiple spaces
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"(<br/>\s*){3,}", "<br/><br/>", s)
    return s.strip()


def _convert_text_newlines(s: str) -> str:
    """Replace \\\\ and blank lines with <br/> ONLY outside $...$, $$...$$, and \\begin{...} math blocks."""
    out = []
    i = 0
    n = len(s)
    in_dollar = False
    in_ddollar = False
    math_env_depth = 0

    while i < n:
        if not in_dollar and not in_ddollar and s.startswith("\\begin{", i):
            m = re.match(r"\\begin\{(aligned|align\*?|equation\*?|cases|array|pmatrix|bmatrix|vmatrix|matrix|gather\*?)\}", s[i:])
            if m:
                math_env_depth += 1
                out.append(m.group(0))
                i += len(m.group(0))
                continue
        if math_env_depth > 0 and s.startswith("\\end{", i):
            m = re.match(r"\\end\{(aligned|align\*?|equation\*?|cases|array|pmatrix|bmatrix|vmatrix|matrix|gather\*?)\}", s[i:])
            if m:
                math_env_depth = max(0, math_env_depth - 1)
                out.append(m.group(0))
                i += len(m.group(0))
                continue

        if s[i] == "\\" and i + 1 < n and s[i + 1] == "$":
            out.append("\\$")
            i += 2
            continue

        if s.startswith("$$", i) and not in_dollar:
            in_ddollar = not in_ddollar
            out.append("$$")
            i += 2
            continue

        if s[i] == "$" and not in_ddollar:
            in_dollar = not in_dollar
            out.append("$")
            i += 1
            continue

        in_math = in_dollar or in_ddollar or math_env_depth > 0
        if not in_math:
            if s.startswith("\\\\", i):
                # Skip optional spacing like \\[4pt]
                j = i + 2
                if j < n and s[j] == "[":
                    _, j = read_balanced(s, j, "[", "]")
                out.append("<br/>")
                i = j
                continue
            if s[i] == "\n":
                # Blank line -> paragraph break, single newline -> space
                j = i + 1
                nl_count = 1
                while j < n and s[j] in " \t\r\n":
                    if s[j] == "\n":
                        nl_count += 1
                    j += 1
                out.append("<br/>" if nl_count >= 2 else " ")
                i = j
                continue

        out.append(s[i])
        i += 1

    return "".join(out)


def clean_short_answer_value(raw: str) -> str:
    """Normalize ex_test \\shortans{...} content (e.g. '$4{,}5$' -> '4,5')."""
    s = raw.strip()
    s = re.sub(r"\\text\{([^}]*)\}", r"\1", s)
    s = s.replace("$", "").replace("{,}", ",").replace("{.}", ".")
    s = s.replace("\\,", "").replace("\\;", "").replace("\\ ", "")
    s = s.replace("−", "-").replace("–", "-")
    s = re.sub(r"[{}]", "", s)
    s = re.sub(r"\s+", "", s)
    return s


# =============================================================================
# 1. PRIMARY PARSER: LATEX `ex_test` (\begin{ex} ... \end{ex})
# =============================================================================

def parse_extest_latex(raw_tex: str, filename: str = "") -> dict:
    r"""
    Parse a Vietnamese LaTeX ex_test exam into EduLab 2025 structure:
    - \choice{A}{B}{C}{D} -> part1
    - \choiceTF{a}{b}{c}{d} / \choiceTF[t]{...} / \choiceTFt{...} -> part2
    - \shortans{...} / \shortans[oly]{...} -> part3
    """
    warnings: list[str] = []
    # Extract title hint from comments or \title / section if present
    title_hint = ""
    m_title = re.search(r"\\title\{([^}]+)\}", raw_tex)
    if m_title:
        title_hint = re.sub(r"\\[a-zA-Z]+\s*", "", m_title.group(1)).replace("\\_", "_").replace("\\&", "&").strip()
    elif filename:
        title_hint = re.sub(r"\.tex$", "", filename, flags=re.IGNORECASE).strip()

    # Find all \begin{ex}...\end{ex} blocks (also accept \begin{bt}...\end{bt})
    ex_blocks = re.findall(r"\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}", raw_tex)
    if not ex_blocks:
        raise ValueError(
            "Không tìm thấy môi trường \\begin{ex}...\\end{ex} nào trong mã LaTeX. "
            "Hãy kiểm tra lại đúng chuẩn gói ex_test."
        )

    part1 = []
    part2 = []
    part3 = []
    stamp = hex(int(time.time() * 1000))[2:][-5:]

    for idx, (_, raw_block) in enumerate(ex_blocks, start=1):
        # Extract optional topic tag from %[2D1N1-1] or leading [tag]
        topic = ""
        m_tag = re.search(r"%\[([^\]]+)\]", raw_block)
        if m_tag:
            topic = m_tag.group(1).strip()

        block = strip_latex_comments(raw_block).strip()
        # Strip optional [...] right after \begin{ex}[...]
        if block.startswith("["):
            opt_tag, rest_pos = read_balanced(block, 0, "[", "]")
            if opt_tag and not topic:
                topic = opt_tag.strip()
            block = block[rest_pos:].strip()

        # Extract \loigiai{...}
        explanation = ""
        lg_match = re.search(r"\\loigiai\b", block)
        if lg_match:
            lg_inner, lg_end = read_balanced(block, lg_match.end(), "{", "}")
            if lg_inner is not None:
                explanation = clean_latex_fragment(lg_inner)
                block = (block[:lg_match.start()] + block[lg_end:]).strip()

        # Detect question type inside remaining block:
        # Priority: \choiceTF / \choiceTFt -> Part II; \shortans -> Part III; \choice -> Part I
        m_tf = re.search(r"\\choiceTFt?\b", block, flags=re.IGNORECASE)
        m_sa = re.search(r"\\shortans\b", block, flags=re.IGNORECASE)
        m_mc = re.search(r"\\choice(?:fix)?\b", block)

        if m_tf:
            stem_raw = block[:m_tf.start()].strip()
            p = skip_ws(block, m_tf.end())
            while p < len(block) and block[p] == "[":
                _, p = read_balanced(block, p, "[", "]")
                p = skip_ws(block, p)
            args = []
            for _ in range(4):
                arg, p = read_balanced(block, p, "{", "}")
                if arg is None:
                    break
                args.append(arg)
            if len(args) != 4:
                warnings.append(f"Câu ex #{idx} (\\choiceTF) có {len(args)} mệnh đề thay vì 4; đã tự bù mệnh đề trống.")
                while len(args) < 4:
                    args.append("")
            labels = ["a", "b", "c", "d"]
            statements = []
            for si, a_raw in enumerate(args):
                is_true = bool(re.search(r"\\True\b", a_raw))
                text_clean = re.sub(r"\\True\b\s*", "", a_raw)
                statements.append({
                    "key": labels[si],
                    "text": clean_latex_fragment(text_clean),
                    "answer": is_true,
                })
            part2.append({
                "id": f"tex-p2-{len(part2)+1}-{stamp}",
                "topic": topic or "Phần II",
                "stem": clean_latex_fragment(stem_raw),
                "statements": statements,
                "explanation": explanation,
            })

        elif m_sa:
            stem_raw = block[:m_sa.start()].strip()
            p = skip_ws(block, m_sa.end())
            while p < len(block) and block[p] == "[":
                _, p = read_balanced(block, p, "[", "]")
                p = skip_ws(block, p)
            ans_raw, end_pos = read_balanced(block, p, "{", "}")
            tail = block[end_pos:].strip()
            if tail:
                stem_raw = (stem_raw + "\n" + tail).strip()
            ans_clean = clean_short_answer_value(ans_raw or "")
            if not ans_clean:
                warnings.append(f"Câu ex #{idx} (\\shortans) chưa có đáp án số.")
            part3.append({
                "id": f"tex-p3-{len(part3)+1}-{stamp}",
                "topic": topic or "Phần III",
                "stem": clean_latex_fragment(stem_raw),
                "answer": ans_clean or "0",
                "explanation": explanation,
            })

        elif m_mc:
            stem_raw = block[:m_mc.start()].strip()
            p = skip_ws(block, m_mc.end())
            while p < len(block) and block[p] == "[":
                _, p = read_balanced(block, p, "[", "]")
                p = skip_ws(block, p)
            args = []
            for _ in range(4):
                arg, p = read_balanced(block, p, "{", "}")
                if arg is None:
                    break
                args.append(arg)
            if len(args) < 2:
                warnings.append(f"Câu ex #{idx} (\\choice) thiếu phương án lựa chọn.")
                continue
            keys = ["A", "B", "C", "D"]
            options = []
            correct_key = None
            for oi, a_raw in enumerate(args):
                if re.search(r"\\True\b", a_raw):
                    correct_key = keys[oi]
                text_clean = re.sub(r"\\True\b\s*", "", a_raw)
                options.append({
                    "key": keys[oi],
                    "text": clean_latex_fragment(text_clean),
                })
            if not correct_key:
                correct_key = "A"
                warnings.append(f"Câu Phần I #{len(part1)+1} (ex #{idx}) không thấy \\True, tạm đặt đáp án A.")
            part1.append({
                "id": f"tex-p1-{len(part1)+1}-{stamp}",
                "topic": topic or "Phần I",
                "stem": clean_latex_fragment(stem_raw),
                "options": options,
                "answer": correct_key,
                "explanation": explanation,
            })
        else:
            warnings.append(f"Bỏ qua khối ex #{idx} vì không thấy \\choice, \\choiceTF hoặc \\shortans.")

    if len(part1) + len(part2) + len(part3) == 0:
        raise ValueError("Không trích xuất được câu hỏi hợp lệ nào từ mã LaTeX ex_test.")

    return {
        "exam": {
            "title": title_hint or "Đề thi nạp từ LaTeX (ex_test)",
            "subject": "Toán học 12",
            "code": f"TEX-{stamp[-3:].upper()}",
            "durationMinutes": 90 if len(part1) >= 10 else 45,
            "description": f"Nạp tự động từ LaTeX ex_test: {len(part1)} câu Phần I, {len(part2)} câu Phần II, {len(part3)} câu Phần III.",
            "scoring": {
                "part1PerQuestion": 0.25,
                "part2Progressive": [0, 0.1, 0.25, 0.5, 1.0],
                "part3PerQuestion": 0.5,
            },
            "part1": part1,
            "part2": part2,
            "part3": part3,
        },
        "warnings": warnings,
        "sourceFormat": "latex_extest",
    }


# =============================================================================
# 2. WORD (.DOCX) PARSER: MICROSOFT EQUATION (OMML -> LATEX) & MATHTYPE
# =============================================================================

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
V_NS = "{urn:schemas-microsoft-com:vml}"
O_NS = "{urn:schemas-microsoft-com:office:office}"
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

MATH_CHAR_MAP = {
    "×": r"\times ",
    "·": r"\cdot ",
    "÷": r"\div ",
    "±": r"\pm ",
    "∓": r"\mp ",
    "≤": r"\le ",
    "≥": r"\ge ",
    "≠": r"\neq ",
    "≈": r"\approx ",
    "∞": r"\infty ",
    "∈": r"\in ",
    "∉": r"\notin ",
    "⊂": r"\subset ",
    "∪": r"\cup ",
    "∩": r"\cap ",
    "∅": r"\varnothing ",
    "ℝ": r"\mathbb{R}",
    "ℤ": r"\mathbb{Z}",
    "ℕ": r"\mathbb{N}",
    "ℚ": r"\mathbb{Q}",
    "→": r"\to ",
    "⇒": r"\Rightarrow ",
    "⇔": r"\Leftrightarrow ",
    "∀": r"\forall ",
    "∃": r"\exists ",
    "⊥": r"\perp ",
    "∥": r"\parallel ",
    "°": r"^\circ ",
    "π": r"\pi ",
    "α": r"\alpha ",
    "β": r"\beta ",
    "γ": r"\gamma ",
    "δ": r"\delta ",
    "Δ": r"\Delta ",
    "θ": r"\theta ",
    "λ": r"\lambda ",
    "μ": r"\mu ",
    "φ": r"\varphi ",
    "ω": r"\omega ",
    "Ω": r"\Omega ",
    "−": "-",
    "–": "-",
    "∫": r"\int ",
    "∑": r"\sum ",
    "∏": r"\prod ",
    "√": r"\sqrt",
}


def _map_math_text(txt: str) -> str:
    return "".join(MATH_CHAR_MAP.get(ch, ch) for ch in txt)


def omml_to_latex(elem: ET.Element) -> str:
    """Recursively convert Word OMML (<m:oMath> / <m:oMathPara>) into KaTeX LaTeX."""
    tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag

    if tag in ("oMathPara", "oMath", "e", "num", "den", "deg", "sub", "sup", "lim", "mr"):
        return "".join(omml_to_latex(c) for c in elem)

    if tag == "r":
        parts = []
        for c in elem:
            ctag = c.tag.split("}")[-1]
            if ctag == "t" and c.text:
                parts.append(_map_math_text(c.text))
        return "".join(parts)

    if tag == "t":
        return _map_math_text(elem.text or "")

    if tag == "f":  # Fraction
        num = elem.find(f"{M_NS}num")
        den = elem.find(f"{M_NS}den")
        n_tex = omml_to_latex(num) if num is not None else ""
        d_tex = omml_to_latex(den) if den is not None else ""
        return rf"\dfrac{{{n_tex}}}{{{d_tex}}}"

    if tag == "sSup":  # Superscript
        e = elem.find(f"{M_NS}e")
        sup = elem.find(f"{M_NS}sup")
        return f"{{{omml_to_latex(e) if e is not None else ''}}}^{{{omml_to_latex(sup) if sup is not None else ''}}}"

    if tag == "sSub":  # Subscript
        e = elem.find(f"{M_NS}e")
        sub = elem.find(f"{M_NS}sub")
        return f"{{{omml_to_latex(e) if e is not None else ''}}}_{{{omml_to_latex(sub) if sub is not None else ''}}}"

    if tag == "sSubSup":  # Subscript + Superscript
        e = elem.find(f"{M_NS}e")
        sub = elem.find(f"{M_NS}sub")
        sup = elem.find(f"{M_NS}sup")
        return (
            f"{{{omml_to_latex(e) if e is not None else ''}}}"
            f"_{{{omml_to_latex(sub) if sub is not None else ''}}}"
            f"^{{{omml_to_latex(sup) if sup is not None else ''}}}"
        )

    if tag == "rad":  # Radical / sqrt
        deg = elem.find(f"{M_NS}deg")
        e = elem.find(f"{M_NS}e")
        d_tex = omml_to_latex(deg).strip() if deg is not None else ""
        e_tex = omml_to_latex(e) if e is not None else ""
        if d_tex:
            return rf"\sqrt[{d_tex}]{{{e_tex}}}"
        return rf"\sqrt{{{e_tex}}}"

    if tag == "nary":  # Integral / Sum / Product
        pr = elem.find(f"{M_NS}naryPr")
        chr_el = pr.find(f"{M_NS}chr") if pr is not None else None
        op_char = chr_el.get(f"{M_NS}val", "∫") if chr_el is not None else "∫"
        op_tex = {"∫": r"\int", "∑": r"\sum", "∏": r"\prod", "⋃": r"\bigcup", "⋂": r"\bigcap"}.get(op_char, r"\int")
        sub = elem.find(f"{M_NS}sub")
        sup = elem.find(f"{M_NS}sup")
        e = elem.find(f"{M_NS}e")
        s_tex = omml_to_latex(sub).strip() if sub is not None else ""
        p_tex = omml_to_latex(sup).strip() if sup is not None else ""
        e_tex = omml_to_latex(e) if e is not None else ""
        res = op_tex
        if s_tex:
            res += f"_{{{s_tex}}}"
        if p_tex:
            res += f"^{{{p_tex}}}"
        return f"{res} {e_tex}"

    if tag == "d":  # Delimiters (parentheses, brackets, braces, abs)
        pr = elem.find(f"{M_NS}dPr")
        beg = "("
        end = ")"
        if pr is not None:
            bc = pr.find(f"{M_NS}begChr")
            ec = pr.find(f"{M_NS}endChr")
            if bc is not None:
                beg = bc.get(f"{M_NS}val", "(")
            if ec is not None:
                end = ec.get(f"{M_NS}val", ")")
        beg_tex = {"{": r"\{", "}": r"\}", "": "."}.get(beg, beg)
        end_tex = {"{": r"\{", "}": r"\}", "": "."}.get(end, end)
        inner_list = [omml_to_latex(c) for c in elem if c.tag == f"{M_NS}e"]
        return rf"\left{beg_tex}{', '.join(inner_list)}\right{end_tex}"

    if tag == "acc":  # Accent (vector arrow, bar, hat)
        pr = elem.find(f"{M_NS}accPr")
        chr_el = pr.find(f"{M_NS}chr") if pr is not None else None
        ch = chr_el.get(f"{M_NS}val", "→") if chr_el is not None else "→"
        e = elem.find(f"{M_NS}e")
        e_tex = omml_to_latex(e) if e is not None else ""
        cmd = {"→": r"\overrightarrow", "⃗": r"\overrightarrow", "̄": r"\overline", "̂": r"\widehat", "̃": r"\widetilde"}.get(ch, r"\overline")
        return rf"{cmd}{{{e_tex}}}"

    if tag == "bar":
        e = elem.find(f"{M_NS}e")
        return rf"\overline{{{omml_to_latex(e) if e is not None else ''}}}"

    if tag == "func":
        fname = elem.find(f"{M_NS}fName")
        e = elem.find(f"{M_NS}e")
        fn = omml_to_latex(fname).strip() if fname is not None else ""
        if fn in ("sin", "cos", "tan", "cot", "log", "ln", "lim", "max", "min"):
            fn = "\\" + fn
        return f"{fn} {omml_to_latex(e) if e is not None else ''}"

    if tag == "limLow":
        e = elem.find(f"{M_NS}e")
        lim = elem.find(f"{M_NS}lim")
        base = omml_to_latex(e).strip() if e is not None else ""
        if base == "lim":
            base = r"\lim"
        return rf"{base}_{{{omml_to_latex(lim) if lim is not None else ''}}}"

    if tag == "m":  # Matrix / system of equations
        rows = []
        for mr in elem.findall(f"{M_NS}mr"):
            cells = [omml_to_latex(e) for e in mr.findall(f"{M_NS}e")]
            rows.append(" & ".join(cells))
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"

    if tag == "eqArr":
        rows = [omml_to_latex(e) for e in elem.findall(f"{M_NS}e")]
        return r"\begin{aligned}" + r" \\ ".join(rows) + r"\end{aligned}"

    # Fallback: recurse children
    return "".join(omml_to_latex(c) for c in elem)


def _extract_docx_rels(zf: zipfile.ZipFile) -> dict[str, str]:
    rels: dict[str, str] = {}
    rels_path = "word/_rels/document.xml.rels"
    if rels_path not in zf.namelist():
        return rels
    root = ET.fromstring(zf.read(rels_path))
    for rel in root:
        rid = rel.get("Id")
        target = rel.get("Target")
        if rid and target:
            rels[rid] = target.lstrip("/")
    return rels


def _is_marked_correct_run(r_el: ET.Element) -> bool:
    """Detect Vietnamese Word exam answer markers: underline, red text, or highlight."""
    rpr = r_el.find(f"{W_NS}rPr")
    if rpr is None:
        return False
    u = rpr.find(f"{W_NS}u")
    if u is not None and u.get(f"{W_NS}val", "single") != "none":
        return True
    hl = rpr.find(f"{W_NS}highlight")
    if hl is not None and hl.get(f"{W_NS}val", "none") != "none":
        return True
    col = rpr.find(f"{W_NS}color")
    if col is not None:
        val = (col.get(f"{W_NS}val") or "").upper()
        # Red / crimson / bright highlight colors used by Vietnamese teachers for answer keys
        if val and val not in ("AUTO", "000000", "111111", "222222", "333333", "FFFFFF"):
            if len(val) == 6:
                try:
                    rr, gg, bb = int(val[0:2], 16), int(val[2:4], 16), int(val[4:6], 16)
                    if rr >= 170 and gg <= 95 and bb <= 95:
                        return True
                except ValueError:
                    pass
    return False


def _ole_preview_img_html(zf: zipfile.ZipFile, rels: dict[str, str], obj_el: ET.Element) -> tuple[str, bool]:
    """
    For MathType OLE objects in .docx:
    - If a raster preview image (png/jpg/gif) exists in word/media, embed it cleanly as inline <img>.
    - If only WMF/EMF vector preview exists (browsers don't render raw WMF), return a clean placeholder & flag.
    """
    for img in obj_el.iter(f"{V_NS}imagedata"):
        rid = img.get(f"{R_NS}id")
        if not rid or rid not in rels:
            continue
        target = rels[rid]
        zip_path = target if target.startswith("word/") else f"word/{target}"
        if zip_path not in zf.namelist():
            continue
        ext = zip_path.lower().rsplit(".", 1)[-1]
        if ext in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
            mime = "image/svg+xml" if ext == "svg" else ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
            b64 = base64.b64encode(zf.read(zip_path)).decode("ascii")
            return f'<img src="data:{mime};base64,{b64}" alt="MathType" style="vertical-align:middle;max-height:2.4em;" />', False
        # WMF / EMF MathType preview
        return '<span class="mathtype-placeholder">[Công thức MathType — khuyến nghị chuyển sang LaTeX trong Word bằng MathType Toggle TeX]</span>', True
    return '<span class="mathtype-placeholder">[Công thức MathType]</span>', True


def parse_docx_bytes(raw_bytes: bytes, filename: str = "") -> dict:
    """
    Parse a .docx file containing Microsoft Equation (OMML) and/or MathType objects
    into EduLab 2025 structure.
    """
    warnings: list[str] = []
    mathtype_wmf_count = 0

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_bytes))
    except zipfile.BadZipFile:
        raise ValueError("File Word không hợp lệ (hệ thống hỗ trợ định dạng .docx).")

    if "word/document.xml" not in zf.namelist():
        raise ValueError("Không tìm thấy nội dung word/document.xml trong file .docx.")

    rels = _extract_docx_rels(zf)
    root = ET.fromstring(zf.read("word/document.xml"))
    body = root.find(f"{W_NS}body")
    if body is None:
        raise ValueError("File Word rỗng.")

    # Extract lines preserving answer markers (<<ANS>> tag before underlined/red choice labels)
    extracted_lines: list[str] = []

    for child in body:
        ctag = child.tag.split("}")[-1]
        if ctag == "p":
            line_parts: list[str] = []
            for sub in child:
                stag = sub.tag.split("}")[-1]
                if stag == "r":
                    marked = _is_marked_correct_run(sub)
                    run_buf: list[str] = []
                    for rchild in sub:
                        rctag = rchild.tag.split("}")[-1]
                        if rctag == "t" and rchild.text:
                            run_buf.append(rchild.text)
                        elif rctag == "tab":
                            run_buf.append("    ")
                        elif rctag == "br":
                            run_buf.append("\n")
                        elif rctag == "object":
                            img_html, is_wmf = _ole_preview_img_html(zf, rels, rchild)
                            if is_wmf:
                                mathtype_wmf_count += 1
                            run_buf.append(img_html)
                        elif rctag == "drawing":
                            # Embedded picture inside question
                            for blip in rchild.iter(f"{A_NS}blip"):
                                rid = blip.get(f"{R_NS}embed")
                                if rid and rid in rels:
                                    target = rels[rid]
                                    zp = target if target.startswith("word/") else f"word/{target}"
                                    if zp in zf.namelist():
                                        ext = zp.lower().rsplit(".", 1)[-1]
                                        if ext in ("png", "jpg", "jpeg", "gif", "webp"):
                                            mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
                                            b64 = base64.b64encode(zf.read(zp)).decode("ascii")
                                            run_buf.append(f'<div class="q-figure"><img src="data:{mime};base64,{b64}" style="max-width:100%;max-height:280px;" /></div>')
                    run_str = "".join(run_buf)
                    if marked and run_str.strip():
                        line_parts.append(f"«KEY»{run_str}«/KEY»")
                    else:
                        line_parts.append(run_str)
                elif stag in ("oMath", "oMathPara"):
                    tex = omml_to_latex(sub).strip()
                    if tex:
                        line_parts.append(f"${tex}$")
            line = "".join(line_parts).strip()
            if line:
                extracted_lines.append(line)

        elif ctag == "tbl":
            # Convert Word table into HTML table
            tbl_rows = []
            for tr in child.findall(f"{W_NS}tr"):
                cells = []
                for tc in tr.findall(f"{W_NS}tc"):
                    cell_parts = []
                    for p in tc.findall(f"{W_NS}p"):
                        pbuf = []
                        for sub in p:
                            stag = sub.tag.split("}")[-1]
                            if stag == "r":
                                for t in sub.findall(f"{W_NS}t"):
                                    if t.text:
                                        pbuf.append(t.text)
                            elif stag in ("oMath", "oMathPara"):
                                tex = omml_to_latex(sub).strip()
                                if tex:
                                    pbuf.append(f"${tex}$")
                        if pbuf:
                            cell_parts.append("".join(pbuf))
                    cells.append(" ".join(cell_parts).strip())
                tbl_rows.append(cells)
            if tbl_rows:
                trs_html = []
                for ri, row in enumerate(tbl_rows):
                    tag = "th" if ri == 0 else "td"
                    trs_html.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in row) + "</tr>")
                extracted_lines.append(f'<table class="q-table"><tbody>{"".join(trs_html)}</tbody></table>')

    full_text = "\n".join(extracted_lines)

    # If the Word file actually contains ex_test LaTeX (\begin{ex}...\end{ex}), delegate to ex_test parser!
    if "\\begin{ex}" in full_text:
        clean_for_tex = full_text.replace("«KEY»", "").replace("«/KEY»", "")
        res = parse_extest_latex(clean_for_tex, filename=filename)
        res["sourceFormat"] = "docx_extest"
        return res

    res = parse_structured_exam_text(full_text, filename=filename, source_format="docx")
    if mathtype_wmf_count > 0:
        res["warnings"].insert(
            0,
            f"Phát hiện {mathtype_wmf_count} đối tượng MathType dạng WMF. Mẹo: Trong Word, mở tab MathType → chọn 'Toggle TeX' để chuyển toàn bộ công thức MathType sang LaTeX rồi nạp lại sẽ hiển thị sắc nét 100%!",
        )
    return res


# =============================================================================
# 3. STRUCTURED VIETNAMESE 2025 EXAM TEXT PARSER (FOR WORD & PDF)
# =============================================================================

def parse_structured_exam_text(raw_text: str, filename: str = "", source_format: str = "pdf") -> dict:
    """
    Parse Vietnamese 2025 exam text (extracted from Word or PDF):
    - Detects PHẦN I / PHẦN II / PHẦN III headers
    - Splits questions by 'Câu 1.' / 'Câu 1:'
    - Parses A. B. C. D. options (with «KEY» marker or answer key table)
    - Parses a) b) c) d) statements for Part II
    - Parses Đáp án / Đáp số for Part III
    """
    warnings: list[str] = []
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")

    # If someone pasted LaTeX ex_test inside PDF/text
    if "\\begin{ex}" in text:
        return parse_extest_latex(text.replace("«KEY»", "").replace("«/KEY»", ""), filename=filename)

    # Extract trailing "BẢNG ĐÁP ÁN" if present
    answer_table_p1: dict[int, str] = {}
    m_ans_sec = re.search(r"(?:^|\n)\s*(BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+THAM\s+KHẢO)[\s\S]*$", text, flags=re.IGNORECASE)
    if m_ans_sec:
        ans_block = m_ans_sec.group(0).replace("«KEY»", "").replace("«/KEY»", "")
        for m in re.finditer(r"\b(\d{1,2})\s*[\.\-:]?\s*([ABCD])\b", ans_block):
            answer_table_p1[int(m.group(1))] = m.group(2)
        text = text[:m_ans_sec.start()]

    # Detect current section as we iterate through lines
    part_blocks: list[tuple[int, int, str]] = []  # (part_num 1|2|3, q_num, body)
    current_part = 1
    current_q_num: int | None = None
    current_buf: list[str] = []

    def flush():
        nonlocal current_q_num, current_buf
        if current_q_num is not None and current_buf:
            part_blocks.append((current_part, current_q_num, "\n".join(current_buf).strip()))
        current_q_num = None
        current_buf = []

    for line in text.splitlines():
        plain = line.replace("«KEY»", "").replace("«/KEY»", "").strip()
        if not plain:
            continue

        # Detect PHẦN I / II / III
        m_part = re.match(r"^(?:PHẦN|Phần)\s+(III|II|I|3|2|1)\b", plain)
        if m_part:
            flush()
            tok = m_part.group(1).upper()
            current_part = {"I": 1, "1": 1, "II": 2, "2": 2, "III": 3, "3": 3}[tok]
            continue

        # Detect Câu N. or Câu N:
        m_q = re.match(r"^(?:«KEY»)?(?:Câu|Bài)\s+(\d+)\s*[\.:\)]\s*(.*)$", line.strip(), flags=re.IGNORECASE)
        if m_q:
            flush()
            current_q_num = int(m_q.group(1))
            rest = m_q.group(2).strip()
            if rest:
                current_buf.append(rest)
            continue

        if current_q_num is not None:
            current_buf.append(line)

    flush()

    part1 = []
    part2 = []
    part3 = []
    stamp = hex(int(time.time() * 1000))[2:][-5:]

    for pnum, qnum, body in part_blocks:
        # Extract inline Lời giải / Hướng dẫn giải
        explanation = ""
        m_sol = re.search(r"(?:^|\n)\s*(?:«KEY»)?(?:Lời giải|Hướng dẫn giải|Giải)\s*:?\s*(?:«/KEY»)?([\s\S]*)$", body, flags=re.IGNORECASE)
        if m_sol:
            explanation = m_sol.group(1).replace("«KEY»", "").replace("«/KEY»", "").strip().replace("\n", "<br/>")
            body = body[:m_sol.start()].strip()

        # Auto-detect Part II if a) b) c) d) statements exist even without PHẦN II header
        has_abcd_lower = all(re.search(rf"(?:^|\n|\s)(?:«KEY»)?{ch}\)", body) for ch in ("a", "b", "c", "d"))
        has_ABCD = all(re.search(rf"(?:^|\n|\s)(?:«KEY»)?{ch}\.", body) for ch in ("A", "B", "C", "D"))

        effective_part = pnum
        if pnum == 1 and has_abcd_lower and not has_ABCD:
            effective_part = 2
        elif pnum == 1 and not has_ABCD and not has_abcd_lower:
            effective_part = 3

        if effective_part == 1 and has_ABCD:
            # Split by A. B. C. D.
            parts = re.split(r"(?:^|\s|\n)(?=(?:«KEY»)?[ABCD]\.)", body)
            stem = parts[0].replace("«KEY»", "").replace("«/KEY»", "").strip()
            opt_map: dict[str, str] = {}
            detected_ans = answer_table_p1.get(qnum)
            for seg in parts[1:]:
                m_opt = re.match(r"^(«KEY»)?([ABCD])\.(«/KEY»)?\s*([\s\S]*)$", seg.strip())
                if not m_opt:
                    continue
                k = m_opt.group(2)
                raw_val = m_opt.group(4)
                if m_opt.group(1) or "«KEY»" in raw_val:
                    detected_ans = k
                opt_map[k] = raw_val.replace("«KEY»", "").replace("«/KEY»", "").strip()
            # Also check inline "Chọn A/B/C/D" in explanation
            if not detected_ans and explanation:
                m_ch = re.search(r"(?:Chọn|Đáp án)\s*(?:đúng\s*(?:là)?)?\s*([ABCD])\b", explanation, flags=re.IGNORECASE)
                if m_ch:
                    detected_ans = m_ch.group(1).upper()
            if not detected_ans:
                detected_ans = "A"
                warnings.append(f"Phần I - Câu {qnum}: Chưa nhận diện được đáp án đúng, tạm đặt A (hãy kiểm tra lại trong Trình tinh chỉnh).")
            options = [{"key": k, "text": opt_map.get(k, "")} for k in ("A", "B", "C", "D")]
            part1.append({
                "id": f"{source_format}-p1-{len(part1)+1}-{stamp}",
                "topic": "Phần I",
                "stem": stem.replace("\n", "<br/>"),
                "options": options,
                "answer": detected_ans,
                "explanation": explanation,
            })

        elif effective_part == 2 and has_abcd_lower:
            parts = re.split(r"(?:^|\n|\s)(?=(?:«KEY»)?[abcd]\))", body)
            stem = parts[0].replace("«KEY»", "").replace("«/KEY»", "").strip()
            st_map: dict[str, tuple[str, bool]] = {}
            for seg in parts[1:]:
                m_st = re.match(r"^(«KEY»)?([abcd])\)(«/KEY»)?\s*([\s\S]*)$", seg.strip())
                if not m_st:
                    continue
                k = m_st.group(2)
                raw_val = m_st.group(4)
                is_true = bool(m_st.group(1) or "«KEY»" in raw_val)
                clean_val = raw_val.replace("«KEY»", "").replace("«/KEY»", "").strip()
                # Check explicit trailing (Đ)/(S) or [Đúng]/[Sai]
                if re.search(r"[\(\[]\s*(?:Đ|Đúng)\s*[\)\]]$", clean_val, flags=re.IGNORECASE):
                    is_true = True
                    clean_val = re.sub(r"\s*[\(\[]\s*(?:Đ|Đúng)\s*[\)\]]$", "", clean_val, flags=re.IGNORECASE).strip()
                elif re.search(r"[\(\[]\s*(?:S|Sai)\s*[\)\]]$", clean_val, flags=re.IGNORECASE):
                    is_true = False
                    clean_val = re.sub(r"\s*[\(\[]\s*(?:S|Sai)\s*[\)\]]$", "", clean_val, flags=re.IGNORECASE).strip()
                st_map[k] = (clean_val, is_true)
            statements = [
                {"key": k, "text": st_map.get(k, ("", False))[0], "answer": st_map.get(k, ("", False))[1]}
                for k in ("a", "b", "c", "d")
            ]
            part2.append({
                "id": f"{source_format}-p2-{len(part2)+1}-{stamp}",
                "topic": "Phần II",
                "stem": stem.replace("\n", "<br/>"),
                "statements": statements,
                "explanation": explanation,
            })

        else:
            clean_body = body.replace("«KEY»", "").replace("«/KEY»", "").strip()
            ans_val = ""
            m_ans = re.search(r"(?:Đáp án|Đáp số|Trả lời|KQ)\s*[:=]?\s*([\-0-9,\.]+)", clean_body, flags=re.IGNORECASE)
            if m_ans:
                ans_val = m_ans.group(1).strip()
                clean_body = clean_body[:m_ans.start()].strip()
            elif explanation:
                m_ans2 = re.search(r"(?:Đáp án|Đáp số|Trả lời|KQ)\s*[:=]?\s*([\-0-9,\.]+)", explanation, flags=re.IGNORECASE)
                if m_ans2:
                    ans_val = m_ans2.group(1).strip()
            if not ans_val:
                ans_val = "0"
                warnings.append(f"Phần III - Câu {qnum}: Chưa thấy đáp số ngắn, tạm đặt 0 (hãy nhập đáp số trong Trình tinh chỉnh).")
            part3.append({
                "id": f"{source_format}-p3-{len(part3)+1}-{stamp}",
                "topic": "Phần III",
                "stem": clean_body.replace("\n", "<br/>"),
                "answer": ans_val.replace(".", ",")[:4],
                "explanation": explanation,
            })

    if len(part1) + len(part2) + len(part3) == 0:
        raise ValueError(
            "Không nhận diện được cấu trúc câu hỏi (Câu 1., Câu 2., ...). "
            "Hãy đảm bảo đề có đánh số 'Câu 1.' và các phương án 'A. B. C. D.' hoặc dùng định dạng LaTeX ex_test."
        )

    title_hint = re.sub(r"\.(docx|pdf|txt)$", "", filename, flags=re.IGNORECASE).strip() if filename else ""
    src_label = {"docx": "Word (.docx)", "pdf": "PDF (.pdf)"}.get(source_format, source_format)

    return {
        "exam": {
            "title": title_hint or f"Đề thi nạp từ {src_label}",
            "subject": "Toán học 12",
            "code": f"{source_format.upper()[:3]}-{stamp[-3:].upper()}",
            "durationMinutes": 90 if len(part1) >= 10 else 45,
            "description": f"Nạp tự động từ {src_label}: {len(part1)} câu Phần I, {len(part2)} câu Phần II, {len(part3)} câu Phần III.",
            "scoring": {
                "part1PerQuestion": 0.25,
                "part2Progressive": [0, 0.1, 0.25, 0.5, 1.0],
                "part3PerQuestion": 0.5,
            },
            "part1": part1,
            "part2": part2,
            "part3": part3,
        },
        "warnings": warnings,
        "sourceFormat": source_format,
    }
