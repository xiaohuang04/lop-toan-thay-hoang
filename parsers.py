#!/usr/bin/env python3
r"""
EduLab / Lớp toán thầy Hoàng — Exam Parsers
1. Primary: LaTeX `ex_test` parser (\begin{ex}...\end{ex}, \choice, \choiceTF, \shortans, \loigiai, \heva, \hoac, \immini, tabular)
2. Word (.docx) parser with Microsoft Equation (OMML -> LaTeX) & MathType OLE/image support + auto answer detection (underline / red / bold)
3. Structured plain-text parser (used for PDF extracted text & Word fallback)
"""

from __future__ import annotations

import base64
import concurrent.futures
import io
import json
import re
import shutil
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from mtef_parser import ole_bytes_to_latex, wmf_bytes_to_latex


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


def _build_tikz_standalone_doc(tikz_codes: str | list[str]) -> str:
    code_list = [tikz_codes] if isinstance(tikz_codes, str) else list(tikz_codes)
    cleaned_list = [re.sub(r"\\usetkzobj\{[^}]*\}", "", c) for c in code_list]
    combined = "\n".join(cleaned_list)

    extra_pkgs = []
    if "\\tkzTab" in combined or "tkz-tab" in combined:
        extra_pkgs.append(r"\usepackage{tkz-tab}")
    if re.search(r"\\tkz(?!Tab)[A-Za-z]+", combined):
        extra_pkgs.append(r"\usepackage{tkz-euclide}")
    if "\\begin{axis}" in combined or "\\addplot" in combined:
        extra_pkgs.append(r"\usepackage{pgfplots}")
        extra_pkgs.append(r"\pgfplotsset{compat=1.18}")
    if "\\tdplot" in combined:
        extra_pkgs.append(r"\usepackage{tikz-3dplot}")

    extra_block = "\n".join(extra_pkgs)
    body = "\n\n".join(cleaned_list)
    return (
        r"\documentclass[tikz,multi=tikzpicture,border=4pt]{standalone}" "\n"
        r"\usepackage[utf8]{inputenc}" "\n"
        r"\usepackage[T5]{fontenc}" "\n"
        r"\usepackage[dvipsnames,svgnames]{xcolor}" "\n"
        r"\usepackage{amsmath,amssymb,mathrsfs}" "\n"
        r"\usepackage{tikz}" "\n"
        r"\usetikzlibrary{calc,angles,quotes,intersections,patterns,arrows,arrows.meta,shapes.geometric,decorations.markings,decorations.pathreplacing,positioning,3d,backgrounds,fit}" "\n"
        r"\providecommand{\heva}[1]{\left\{\begin{aligned}#1\end{aligned}\right.}" "\n"
        r"\providecommand{\hoac}[1]{\left[\begin{aligned}#1\end{aligned}\right.}" "\n"
        f"{extra_block}\n"
        r"\begin{document}" "\n"
        f"{body}\n"
        r"\end{document}" "\n"
    )


def _compile_single_tikz_local(tikz_code: str) -> tuple[str | None, str | None]:
    """Compile a TikZ block locally using MiKTeX / TeX Live pdflatex + pdftocairo (or dvisvgm)."""
    pdflatex = shutil.which("pdflatex")
    if not pdflatex:
        return None, None
    pdftocairo = shutil.which("pdftocairo")
    dvisvgm = shutil.which("dvisvgm")
    if not pdftocairo and not dvisvgm:
        return None, None

    doc = _build_tikz_standalone_doc(tikz_code)
    tmp_dir = Path(tempfile.mkdtemp(prefix="edulab_tikz_"))
    try:
        tex_path = tmp_dir / "fig.tex"
        pdf_path = tmp_dir / "fig.pdf"
        svg_path = tmp_dir / "fig.svg"
        tex_path.write_text(doc, encoding="utf-8")

        p1 = subprocess.run(
            [pdflatex, "-interaction=nonstopmode", "-halt-on-error", "fig.tex"],
            cwd=str(tmp_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=25,
        )
        if p1.returncode != 0 or not pdf_path.exists():
            # Grab concise error line from pdflatex log
            err_lines = [ln for ln in (p1.stdout or "").splitlines() if ln.startswith("!")]
            err_msg = err_lines[0] if err_lines else "pdflatex compile error"
            return None, err_msg

        if pdftocairo:
            p2 = subprocess.run(
                [pdftocairo, "-svg", "fig.pdf", "fig.svg"],
                cwd=str(tmp_dir),
                capture_output=True,
                timeout=15,
            )
            if p2.returncode == 0 and svg_path.exists():
                b64 = base64.b64encode(svg_path.read_bytes()).decode("ascii")
                return f'<div class="q-figure"><img src="data:image/svg+xml;base64,{b64}" class="tikz-figure" alt="Hình vẽ TikZ" /></div>', None

        if dvisvgm:
            p2 = subprocess.run(
                [dvisvgm, "--pdf", "--no-fonts", "-o", "fig.svg", "fig.pdf"],
                cwd=str(tmp_dir),
                capture_output=True,
                timeout=15,
            )
            if p2.returncode == 0 and svg_path.exists():
                b64 = base64.b64encode(svg_path.read_bytes()).decode("ascii")
                return f'<div class="q-figure"><img src="data:image/svg+xml;base64,{b64}" class="tikz-figure" alt="Hình vẽ TikZ" /></div>', None

        return None, "Không chuyển đổi được PDF sang SVG"
    except Exception as exc:
        return None, str(exc)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _request_ytotech_pdf(doc: str, retries: int = 2) -> tuple[bytes | None, str | None]:
    """Send a standalone LaTeX doc to latex.ytotech.com with automatic retry on HTTP 429."""
    payload = json.dumps({
        "compiler": "pdflatex",
        "resources": [{"main": True, "content": doc}],
    }).encode("utf-8")

    last_err = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            "https://latex.ytotech.com/builds/sync",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                ctype = resp.headers.get("Content-Type", "")
                raw = resp.read()
                if ("application/pdf" in ctype or raw.startswith(b"%PDF")) and raw:
                    return raw, None
                return None, "Phản hồi biên dịch không phải PDF"
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and attempt < retries:
                time.sleep(2.2 * (attempt + 1))
                continue
            try:
                j = json.loads(body)
                logs = str(j.get("logs", ""))
                err_lines = [ln.strip() for ln in logs.splitlines() if ln.strip().startswith("!")]
                if err_lines:
                    return None, err_lines[0][:120]
            except Exception:
                pass
            last_err = f"HTTP {e.code}"
            break
        except Exception as exc:
            last_err = str(exc)
            break
    return None, last_err


def _compile_single_tikz_cloud(tikz_code: str) -> tuple[str | None, str | None, str | None]:
    """
    Cloud compiler (for Render.com where pdflatex is not installed) via latex.ytotech.com.
    Returns (html_or_none, pdf_b64_or_none, err_or_none).
    """
    doc = _build_tikz_standalone_doc(tikz_code)
    raw, err = _request_ytotech_pdf(doc, retries=2)
    if not raw:
        return None, None, err

    pdftocairo = shutil.which("pdftocairo")
    if pdftocairo:
        tmp_dir = Path(tempfile.mkdtemp(prefix="edulab_cpdf_"))
        try:
            (tmp_dir / "fig.pdf").write_bytes(raw)
            p2 = subprocess.run([pdftocairo, "-svg", "fig.pdf", "fig.svg"], cwd=str(tmp_dir), capture_output=True, timeout=15)
            if p2.returncode == 0 and (tmp_dir / "fig.svg").exists():
                b64 = base64.b64encode((tmp_dir / "fig.svg").read_bytes()).decode("ascii")
                return f'<div class="q-figure"><img src="data:image/svg+xml;base64,{b64}" class="tikz-figure" alt="Hình vẽ TikZ" /></div>', None, None
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    return None, base64.b64encode(raw).decode("ascii"), None


def compile_tikz_blocks_in_tex(raw_tex: str, warnings: list[str]) -> tuple[str, dict[str, str], dict[str, str], dict | None, dict[str, str]]:
    """
    Find all \\begin{tikzpicture}...\\end{tikzpicture} blocks in raw_tex:
    - Local MiKTeX: compiles in parallel to crisp vector SVG.
    - Cloud (Render): compiles ALL diagrams in 1 SINGLE multi-page standalone PDF request (zero HTTP 429!);
      falls back to sequential 1-by-1 with backoff only if a single broken diagram breaks the batch.
    """
    pattern = re.compile(r"\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}")
    matches = list(pattern.finditer(raw_tex))
    if not matches:
        return raw_tex, {}, {}, None, {}

    has_local = bool(shutil.which("pdflatex") and (shutil.which("pdftocairo") or shutil.which("dvisvgm")))
    unique_codes: list[str] = []
    code_to_idx: dict[str, int] = {}
    for m in matches:
        code = m.group(0)
        if code not in code_to_idx:
            code_to_idx[code] = len(unique_codes)
            unique_codes.append(code)

    tokens: dict[str, str] = {}
    pending_pdfs: dict[str, str] = {}
    batch_pdf: dict | None = None

    if not has_local:
        # Cloud mode: compile ALL unique TikZ diagrams in ONE single HTTP request (prevents HTTP 429!)
        batch_doc = _build_tikz_standalone_doc(unique_codes)
        batch_raw, _ = _request_ytotech_pdf(batch_doc, retries=2)
        if batch_raw:
            pdf_tokens = []
            for idx in range(len(unique_codes)):
                tok = f"EDULABTIKZTOKEN{idx}END"
                pdf_tok = f"EDULABTIKZPDF{idx}END"
                tokens[tok] = pdf_tok
                pdf_tokens.append(pdf_tok)
            batch_pdf = {
                "pdfBase64": base64.b64encode(batch_raw).decode("ascii"),
                "tokens": pdf_tokens,
            }
        else:
            # Batch failed (likely 1 figure has syntax error) -> compile sequentially with gentle spacing
            for idx, code in enumerate(unique_codes):
                if idx > 0:
                    time.sleep(1.2)
                html, pdf_b64, err = _compile_single_tikz_cloud(code)
                tok = f"EDULABTIKZTOKEN{idx}END"
                if html:
                    tokens[tok] = html
                elif pdf_b64:
                    pdf_tok = f"EDULABTIKZPDF{idx}END"
                    tokens[tok] = pdf_tok
                    pending_pdfs[pdf_tok] = pdf_b64
                else:
                    warnings.append(f"Hình TikZ #{idx + 1} chưa biên dịch được ({err or 'lỗi cú pháp'}).")
                    tokens[tok] = '<div class="tikz-placeholder">[Hình vẽ TikZ chưa biên dịch được — kiểm tra mã nguồn]</div>'
    else:
        # Local MiKTeX mode: compile in parallel to vector SVG
        def _compile_one_local(code: str) -> tuple[str | None, str | None, str | None]:
            html, err = _compile_single_tikz_local(code)
            if html:
                return html, None, None
            html2, pdf_b64, err2 = _compile_single_tikz_cloud(code)
            if html2 or pdf_b64:
                return html2, pdf_b64, None
            return None, None, err or err2

        results: list[tuple[str | None, str | None, str | None]] = [None] * len(unique_codes)  # type: ignore
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(unique_codes))) as pool:
            futs = {pool.submit(_compile_one_local, code): idx for idx, code in enumerate(unique_codes)}
            for fut in concurrent.futures.as_completed(futs):
                idx = futs[fut]
                try:
                    results[idx] = fut.result()
                except Exception as exc:
                    results[idx] = (None, None, str(exc))

        for idx, (html, pdf_b64, err) in enumerate(results):
            tok = f"EDULABTIKZTOKEN{idx}END"
            if html:
                tokens[tok] = html
            elif pdf_b64:
                pdf_tok = f"EDULABTIKZPDF{idx}END"
                tokens[tok] = pdf_tok
                pending_pdfs[pdf_tok] = pdf_b64
            else:
                warnings.append(f"Hình TikZ #{idx + 1} chưa biên dịch được ({err or 'lỗi cú pháp'}).")
                tokens[tok] = '<div class="tikz-placeholder">[Hình vẽ TikZ chưa biên dịch được — kiểm tra mã nguồn]</div>'

    # Build token -> raw TikZ source map so we can preserve pure LaTeX figureTex for editing
    tikz_sources: dict[str, str] = {}
    for code, idx in code_to_idx.items():
        tikz_sources[f"EDULABTIKZTOKEN{idx}END"] = code

    out = raw_tex
    for m in reversed(matches):
        idx = code_to_idx[m.group(0)]
        out = out[:m.start()] + f" EDULABTIKZTOKEN{idx}END " + out[m.end():]
    return out, tokens, pending_pdfs, batch_pdf, tikz_sources


def _to_roman(n: int) -> str:
    vals = [
        (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"),
        (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
        (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
    ]
    out = []
    rem = max(1, n)
    for v, sym in vals:
        while rem >= v:
            out.append(sym)
            rem -= v
    return "".join(out)


def _format_enum_label(opt: str, index_1: int) -> str:
    """Format an enumerate item marker from optional [...] spec (enumitem / enumerate pkg)."""
    o = (opt or "").strip()
    # Extract label=... if enumitem syntax is used
    m_lbl = re.search(r"label\s*=\s*(?:\{([^}]*)\}|([^,\]]+))", o)
    spec = (m_lbl.group(1) or m_lbl.group(2) or o).strip() if m_lbl else o

    alpha_lo = chr(ord("a") + ((index_1 - 1) % 26))
    alpha_hi = chr(ord("A") + ((index_1 - 1) % 26))
    roman_lo = _to_roman(index_1)
    roman_hi = roman_lo.upper()
    arabic = str(index_1)

    if not spec or "numeric" in spec.lower():
        return f"{arabic}."

    # Handle enumitem macros like \alph*), (\arabic*), \roman*., \Alph*)
    if any(tok in spec for tok in ("\\alph*", "\\Alph*", "\\arabic*", "\\roman*", "\\Roman*")):
        res = spec
        res = res.replace("\\alph*", alpha_lo)
        res = res.replace("\\Alph*", alpha_hi)
        res = res.replace("\\arabic*", arabic)
        res = res.replace("\\roman*", roman_lo)
        res = res.replace("\\Roman*", roman_hi)
        res = re.sub(r"\\(?:textbf|bfseries|itshape|emph)\b", "", res)
        res = res.replace("{", "").replace("}", "").strip()
        return res or f"{arabic}."

    # Handle classic enumerate package short specs like [a)], [(a)], [a.], [A)], [1)], [(1)], [i)], [I.]
    clean_spec = re.sub(r"\\(?:textbf|bfseries|itshape|emph)\b", "", spec).replace("{", "").replace("}", "").strip()
    if re.search(r"\ba\b|^\(?a[\)\.]", clean_spec):
        return re.sub(r"a", alpha_lo, clean_spec, count=1)
    if re.search(r"\bA\b|^\(?A[\)\.]", clean_spec):
        return re.sub(r"A", alpha_hi, clean_spec, count=1)
    if re.search(r"\bi\b|^\(?i[\)\.]", clean_spec):
        return re.sub(r"i", roman_lo, clean_spec, count=1)
    if re.search(r"\bI\b|^\(?I[\)\.]", clean_spec):
        return re.sub(r"I", roman_hi, clean_spec, count=1)
    if re.search(r"\b1\b|^\(?1[\)\.]", clean_spec):
        return re.sub(r"1", arabic, clean_spec, count=1)
    return f"{arabic}."


def _html_escape_attr(s: str) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def clean_latex_fragment(
    raw: str,
    tikz_tokens: dict[str, str] | None = None,
    missing_imgs: list[str] | None = None,
) -> str:
    """Normalize Vietnamese ex_test LaTeX fragment into clean HTML + KaTeX math."""
    s = raw.strip()
    if not s:
        return ""

    # Strip layout/spacing/ex_test column-width macros BEFORE structural transforms
    s = replace_command_2args(s, "setlength", lambda a1, a2: "")
    s = replace_command_2args(s, "addtolength", lambda a1, a2: "")
    s = replace_command_2args(s, "setcounter", lambda a1, a2: "")
    s = replace_command_2args(s, "fontsize", lambda a1, a2: "")
    for _cmd1 in (
        "choicew",
        "choiceh",
        "choiceTFw",
        "choiceTFh",
        "shortansw",
        "vspace*",
        "vspace",
        "hspace*",
        "hspace",
        "label",
        "linespread",
        "setstretch",
        "phantom",
        "vphantom",
        "hphantom",
    ):
        s = replace_command_1arg(s, _cmd1, lambda a: "")
    s = re.sub(
        r"\\(noindent|indent|smallskip|medskip|bigskip|hfill|vfill|newpage|clearpage|pagebreak|nopagebreak|linebreak|nolinebreak|centering|raggedright|raggedleft|allowdisplaybreaks|selectfont|normalsize|small|footnotesize|scriptsize|tiny|large|Large|LARGE|huge|Huge)\b",
        "",
        s,
    )

    # Strip figure wrappers cleanly while keeping inner content (e.g. \includegraphics)
    s = re.sub(r"\\begin\{figure\*?\}(?:\[[^\]]*\])?", "", s)
    s = re.sub(r"\\end\{figure\*?\}", "", s)

    # Detect \includegraphics[...]{imgName} -> interactive missing-image placeholder + auto-warning
    inc_tokens: dict[str, str] = {}

    def _inc_sub(m: re.Match) -> str:
        img_name = (m.group(1) or "").strip()
        if not img_name:
            return ""
        if missing_imgs is not None:
            missing_imgs.append(img_name)
        safe_attr = _html_escape_attr(img_name)
        safe_txt = _html_escape_attr(img_name)
        tok = f" EDULABMISSINGIMG{len(inc_tokens)}END "
        inc_tokens[tok.strip()] = (
            f'<div class="q-figure is-missing-img" data-missing-img="{safe_attr}" title="Bấm để tải ảnh {safe_attr} lên">'
            f'<span class="missing-img-badge">Thiếu ảnh: <strong>{safe_txt}</strong></span>'
            f'<span class="missing-img-hint">Bấm để tải ảnh lên</span>'
            f"</div>"
        )
        return tok

    s = re.sub(r"\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}", _inc_sub, s)

    # Handle \immini[thm]{left}{right} (and multiple optional args) -> clean text + figure
    def _immini(a1: str, a2: str) -> str:
        t1 = clean_latex_fragment(a1, tikz_tokens, missing_imgs)
        t2 = clean_latex_fragment(a2, tikz_tokens, missing_imgs)
        if not t2:
            return t1
        if not t1:
            return t2
        if 'class="q-figure"' in t2 or 'EDULABMISSINGIMG' in t2 or 'EDULABTIKZTOKEN' in t2:
            return f"{t1}{t2}"
        return f'{t1}<div class="q-figure">{t2}</div>'

    s = replace_command_2args(s, "immini", _immini)

    # Convert \begin{tabular}{cols}...\end{tabular}
    def _tabular_sub(m: re.Match) -> str:
        return convert_tabular_to_html(m.group(2))

    s = re.sub(
        r"\\begin\{tabular\}(\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}",
        _tabular_sub,
        s,
    )

    # Any leftover uncompiled tikzpicture (if clean_latex_fragment called standalone)
    s = re.sub(
        r"\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}",
        '<div class="tikz-placeholder">[Hình vẽ TikZ]</div>',
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
            items.append(
                f'<div class="tex-list-item"><span class="tex-list-lbl">{lbl})</span>'
                f'<div class="tex-list-body">{clean_latex_fragment(p, tikz_tokens, missing_imgs)}</div></div>'
            )
        if not items:
            return ""
        return f'<div class="tex-list is-enum">{"".join(items)}</div>'

    s = re.sub(r"\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}", _itemchoice_sub, s)

    # Handle itemize / enumerate cleanly (supports nested lists, [a)], [(a)], [1.], label=\alph*), and \item[custom])
    list_tokens: dict[str, str] = {}
    innermost_list_re = re.compile(
        r"\\begin\{(itemize|enumerate)\}(?:\[([^\]]*)\])?((?:(?!\\begin\{(?:itemize|enumerate)\})[\s\S])*?)\\end\{\1\}"
    )

    def _list_sub(m: re.Match) -> str:
        env = m.group(1)
        opt = (m.group(2) or "").strip()
        inner = m.group(3)
        rendered_items: list[str] = []
        enum_idx = 0
        for raw_item in re.split(r"\\item\b", inner):
            seg = raw_item.strip()
            if not seg:
                continue
            enum_idx += 1
            m_lbl = re.match(r"^\[([^\]]+)\]\s*([\s\S]*)$", seg)
            if m_lbl:
                lbl = m_lbl.group(1).strip()
                body_html = clean_latex_fragment(m_lbl.group(2).strip(), tikz_tokens, missing_imgs)
                rendered_items.append(
                    f'<div class="tex-list-item"><span class="tex-list-lbl">{lbl}</span>'
                    f'<div class="tex-list-body">{body_html}</div></div>'
                )
            elif env == "enumerate":
                lbl = _format_enum_label(opt, enum_idx)
                body_html = clean_latex_fragment(seg, tikz_tokens, missing_imgs)
                rendered_items.append(
                    f'<div class="tex-list-item"><span class="tex-list-lbl">{lbl}</span>'
                    f'<div class="tex-list-body">{body_html}</div></div>'
                )
            else:
                body_html = clean_latex_fragment(seg, tikz_tokens, missing_imgs)
                rendered_items.append(
                    f'<div class="tex-list-item"><span class="tex-list-lbl is-bullet">•</span>'
                    f'<div class="tex-list-body">{body_html}</div></div>'
                )
        if not rendered_items:
            return ""
        cls = "is-enum" if env == "enumerate" else "is-itemize"
        tok = f" EDULABLISTTOKEN{len(list_tokens)}END "
        list_tokens[tok.strip()] = f'<div class="tex-list {cls}">{"".join(rendered_items)}</div>'
        return tok

    for _ in range(12):
        new_s, n_sub = innermost_list_re.subn(_list_sub, s)
        s = new_s
        if n_sub == 0:
            break

    # Center / flushleft
    def _center_sub(m: re.Match) -> str:
        inner_html = clean_latex_fragment(m.group(1), tikz_tokens, missing_imgs)
        if not inner_html:
            return ""
        if 'class="q-figure"' in inner_html or "EDULABMISSINGIMG" in inner_html or "EDULABTIKZTOKEN" in inner_html:
            return inner_html
        return f'<div style="text-align:center;margin:6px 0;">{inner_html}</div>'

    s = re.sub(r"\\begin\{center\}([\s\S]*?)\\end\{center\}", _center_sub, s)

    # Vietnamese ex_test math macros: \heva{...} and \hoac{...}
    s = replace_command_1arg(s, "heva", lambda inner: r"\left\{\begin{aligned}" + inner.strip() + r"\end{aligned}\right.")
    s = replace_command_1arg(s, "hoac", lambda inner: r"\left[\begin{aligned}" + inner.strip() + r"\end{aligned}\right.")

    # Strip \par cleanly: remove leading/trailing \par, turn internal \par into line break
    s = re.sub(r"(?:\s*\\par\b\s*)+$", "", s)
    s = re.sub(r"^(?:\s*\\par\b\s*)+", "", s)
    s = re.sub(r"\s*\\par\b\s*", "<br/>", s)

    # Clean any stray unmatched list environments
    s = re.sub(r"\\begin\{(?:enumerate|itemize)\}(?:\[[^\]]*\])?", "", s)
    s = re.sub(r"\\end\{(?:enumerate|itemize)\}", "", s)
    s = re.sub(r"\\item\s*\[([^\]]+)\]\s*", r"<br/><strong>\1</strong> ", s)
    s = re.sub(r"\\item\b\s*", "<br/>• ", s)

    # Common Vietnamese math shortcuts
    s = re.sub(r"\\vec\{([^}]+)\}", r"\\overrightarrow{\1}", s)
    s = s.replace("\\limits", "")
    s = s.replace("\\lq\\lq", "“").replace("\\rq\\rq", "”")
    s = s.replace("``", "“").replace("''", "”")
    s = s.replace("~", " ")

    # Text formatting commands
    s = replace_command_1arg(s, "textbf", lambda inner: f"<strong>{inner}</strong>")
    s = replace_command_1arg(s, "textit", lambda inner: f"<em>{inner}</em>")
    s = replace_command_1arg(s, "underline", lambda inner: f"<u>{inner}</u>")
    s = replace_command_1arg(s, "emph", lambda inner: f"<em>{inner}</em>")

    s = _convert_text_newlines(s)

    # Re-inject list blocks, missing-image placeholders, and compiled TikZ SVG/PNG HTML
    for tok, html in list_tokens.items():
        if tok in s:
            s = s.replace(tok, html)
    for tok, html in inc_tokens.items():
        if tok in s:
            s = s.replace(tok, html)
    if tikz_tokens:
        for tok, html in tikz_tokens.items():
            if tok in s:
                s = s.replace(tok, html)

    # Clean redundant <br/> immediately before/after block divs (tex-list / q-figure)
    s = re.sub(r"(?:<br/>\s*)+(<div class=\"(?:tex-list|q-figure))", r"\1", s)
    s = re.sub(r"(</div>)(?:\s*<br/>)+", r"\1", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"(<br/>\s*){3,}", "<br/><br/>", s)
    s = re.sub(r"^(?:<br/>\s*)+", "", s)
    s = re.sub(r"(?:<br/>\s*)+$", "", s)

    return s.strip()


def _convert_text_newlines(s: str) -> str:
    """Replace \\\\ and blank lines with <br/> ONLY outside $...$, $$...$$, \\(...\\), \\[...\\], and \\begin{...} math blocks."""
    out = []
    i = 0
    n = len(s)
    in_dollar = False
    in_ddollar = False
    in_paren = False
    in_bracket = False
    math_env_depth = 0

    while i < n:
        if s.startswith("\\begin{", i):
            m = re.match(r"\\begin\{(aligned|align\*?|equation\*?|cases|array|pmatrix|bmatrix|vmatrix|matrix|gather\*?|split|eqnarray\*?)\}", s[i:])
            if m:
                math_env_depth += 1
                out.append(m.group(0))
                i += len(m.group(0))
                continue
        if math_env_depth > 0 and s.startswith("\\end{", i):
            m = re.match(r"\\end\{(aligned|align\*?|equation\*?|cases|array|pmatrix|bmatrix|vmatrix|matrix|gather\*?|split|eqnarray\*?)\}", s[i:])
            if m:
                math_env_depth = max(0, math_env_depth - 1)
                out.append(m.group(0))
                i += len(m.group(0))
                continue

        if s[i] == "\\" and i + 1 < n and s[i + 1] == "$":
            out.append("\\$")
            i += 2
            continue

        if not in_dollar and not in_ddollar:
            if s.startswith("\\(", i) and not in_paren and not in_bracket:
                in_paren = True
                out.append("\\(")
                i += 2
                continue
            if s.startswith("\\)", i) and in_paren:
                in_paren = False
                out.append("\\)")
                i += 2
                continue
            if s.startswith("\\[", i) and not in_paren and not in_bracket:
                in_bracket = True
                out.append("\\[")
                i += 2
                continue
            if s.startswith("\\]", i) and in_bracket:
                in_bracket = False
                out.append("\\]")
                i += 2
                continue

        if s.startswith("$$", i) and not in_dollar and not in_paren and not in_bracket:
            in_ddollar = not in_ddollar
            out.append("$$")
            i += 2
            continue

        if s[i] == "$" and not in_ddollar and not in_paren and not in_bracket:
            in_dollar = not in_dollar
            out.append("$")
            i += 1
            continue

        in_math = in_dollar or in_ddollar or in_paren or in_bracket or math_env_depth > 0
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
        else:
            # Inside math: flatten bare newlines into single spaces so downstream inline regexes never split math
            if s[i] in "\r\n":
                out.append(" ")
                i += 1
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

def _extract_dapso_command(raw_tex: str) -> tuple[str, str]:
    """Extract \\dapso{...} from raw LaTeX text, returning (answer_tex, remaining_tex)."""
    m = re.search(r"\\dapso\b", raw_tex or "")
    if not m:
        return "", raw_tex
    inner, end_pos = read_balanced(raw_tex, m.end(), "{", "}")
    if inner is None:
        return "", raw_tex
    rem = (raw_tex[:m.start()] + raw_tex[end_pos:]).strip()
    return inner.strip(), rem


def _restore_tikz_tokens_to_tex(raw_tex: str, tikz_sources: dict[str, str]) -> str:
    out = str(raw_tex or "")
    for tok, src in (tikz_sources or {}).items():
        if tok in out:
            out = out.replace(tok, src)
    return out.strip()


def _split_stem_and_figures(
    raw_tex: str,
    tikz_tokens: dict[str, str],
    tikz_sources: dict[str, str],
    missing_imgs: list[str],
) -> tuple[str, str, str, str]:
    """
    Separate text LaTeX (`stemTex`) from figure LaTeX (`figureTex`) and rendered `figureHtml`,
    keeping the teacher's raw LaTeX 100% clean (no HTML or base64 <img> dumped into stemTex).
    """
    fig_tex_parts: list[str] = []
    fig_html_parts: list[str] = []
    work = str(raw_tex or "").strip()

    # Extract TikZ tokens out of stem into figureTex + figureHtml
    for tok in re.findall(r"EDULABTIKZTOKEN\d+END", work):
        src = tikz_sources.get(tok, "")
        if src:
            fig_tex_parts.append(src)
        html = tikz_tokens.get(tok, "")
        if html:
            fig_html_parts.append(html)
        work = work.replace(tok, "")

    # Extract \includegraphics[...]{name} out of stem into figureHtml (missing placeholders) & figureTex
    inc_re = re.compile(r"\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}")
    for m in inc_re.finditer(work):
        img_name = (m.group(1) or "").strip()
        if img_name:
            missing_imgs.append(img_name)
            safe = _html_escape_attr(img_name)
            fig_html_parts.append(
                f'<div class="q-figure is-missing-img" data-missing-img="{safe}" title="Bấm để tải ảnh {safe} lên">'
                f'<span class="missing-img-badge">Thiếu ảnh: <strong>{safe}</strong></span>'
                f'<span class="missing-img-hint">Bấm để tải ảnh lên</span>'
                f"</div>"
            )
    work = inc_re.sub("", work)

    # Strip now-empty \begin{center}...\end{center} or \begin{figure}...\end{figure} wrappers
    work = re.sub(r"\\begin\{(?:center|figure\*?)\}(?:\[[^\]]*\])?\s*\\end\{(?:center|figure\*?)\}", "", work)
    stem_tex = re.sub(r"\n{3,}", "\n\n", work).strip()
    stem_html = clean_latex_fragment(stem_tex, tikz_tokens, missing_imgs)
    figure_tex = "\n\n".join(fig_tex_parts).strip()
    figure_html = "".join(fig_html_parts).strip()
    return stem_tex, stem_html, figure_tex, figure_html


def _compile_figure_tex_to_html(figure_tex: str, warnings: list[str]) -> str:
    """Compile pure LaTeX figure source (TikZ blocks and/or \\includegraphics) into figureHtml."""
    raw = str(figure_tex or "").strip()
    if not raw:
        return ""
    processed, tikz_tokens, _, _, _ = compile_tikz_blocks_in_tex(raw, warnings)
    missing: list[str] = []
    html = clean_latex_fragment(processed, tikz_tokens, missing)
    # Mark compiled TikZ figures with data-tikz-compiled="1" so uploaded PNG/JPGs stay separate
    html = html.replace('<div class="q-figure"><img ', '<div class="q-figure" data-tikz-compiled="1"><img ')
    return html


def compile_exam_latex_fields(exam: dict) -> dict:
    """
    Compile teacher-edited pure LaTeX fields (`stemTex`, `figureTex`, `explanationTex`)
    into rendered HTML (`stem`, `figureHtml`, `explanation`) while preserving uploaded PNG/JPG images.
    """
    if not isinstance(exam, dict):
        return exam
    warnings: list[str] = []
    img_block_re = re.compile(
        r'<div\b[^>]*class="[^"]*\bq-figure\b[^"]*"[^>]*>[\s\S]*?<\/div>',
        flags=re.IGNORECASE,
    )

    for part_key in ("part1", "part2", "part3", "part4"):
        q_list = exam.get(part_key)
        if not isinstance(q_list, list):
            continue
        for q in q_list:
            if not isinstance(q, dict):
                continue

            # 1. Stem LaTeX -> rendered HTML
            if "stemTex" in q and isinstance(q.get("stemTex"), str):
                s_tex = q["stemTex"].strip()
                q["stemTex"] = s_tex
                if s_tex:
                    proc, t_toks, _, _, _ = compile_tikz_blocks_in_tex(s_tex, warnings)
                    q["stem"] = clean_latex_fragment(proc, t_toks, [])
                else:
                    q["stem"] = ""

            # 2. Figure LaTeX (TikZ) + Uploaded PNG/JPG images -> figureHtml
            if "figureTex" in q and isinstance(q.get("figureTex"), str):
                f_tex = q["figureTex"].strip()
                q["figureTex"] = f_tex
                existing_fig = str(q.get("figureHtml") or "")
                # Preserve non-TikZ uploaded PNG/JPG blocks cleanly
                kept_uploads = [
                    m.group(0)
                    for m in img_block_re.finditer(existing_fig)
                    if (
                        'data-tikz-compiled="1"' not in m.group(0)
                        and 'class="tikz-figure"' not in m.group(0)
                    )
                    or 'data-upload-img="1"' in m.group(0)
                ]
                compiled_tikz = _compile_figure_tex_to_html(f_tex, warnings) if f_tex else ""
                q["figureHtml"] = (compiled_tikz + "".join(kept_uploads)).strip()

            # 3. Explanation LaTeX -> rendered HTML
            if "explanationTex" in q and isinstance(q.get("explanationTex"), str):
                e_tex = q["explanationTex"].strip()
                q["explanationTex"] = e_tex
                if e_tex:
                    proc, t_toks, _, _, _ = compile_tikz_blocks_in_tex(e_tex, warnings)
                    q["explanation"] = clean_latex_fragment(proc, t_toks, [])
                else:
                    q["explanation"] = ""

    return exam


def parse_extest_latex(raw_tex: str, filename: str = "") -> dict:
    r"""
    Parse a Vietnamese LaTeX ex_test exam into EduLab 2025 structure:
    - \choice{A}{B}{C}{D} -> part1
    - \choiceTF{a}{b}{c}{d} / \choiceTF[t]{...} / \choiceTFt{...} -> part2
    - \shortans{...} / \shortans[oly]{...} -> part3
    - No choice/shortans -> part4 (Tự luận)
    Preserves pure LaTeX in `stemTex`, `figureTex`, `explanationTex` for clean editing.
    """
    warnings: list[str] = []
    # Extract title hint from comments or \title / section if present
    title_hint = ""
    m_title = re.search(r"\\title\{([^}]+)\}", raw_tex)
    if m_title:
        title_hint = re.sub(r"\\[a-zA-Z]+\s*", "", m_title.group(1)).replace("\\_", "_").replace("\\&", "&").strip()
    elif filename:
        title_hint = re.sub(r"\.tex$", "", filename, flags=re.IGNORECASE).strip()

    # Compile all TikZ diagrams before stripping LaTeX comments/commands
    processed_tex, tikz_tokens, pending_tikz_pdfs, pending_tikz_batch_pdf, tikz_sources = compile_tikz_blocks_in_tex(raw_tex, warnings)

    # Find all \begin{ex}...\end{ex} blocks (also accept \begin{bt}...\end{bt})
    ex_blocks = re.findall(r"\\begin\{(ex|bt)\}([\s\S]*?)\\end\{\1\}", processed_tex)
    if not ex_blocks:
        raise ValueError(
            "Không tìm thấy môi trường \\begin{ex}...\\end{ex} nào trong mã LaTeX. "
            "Hãy kiểm tra lại đúng chuẩn gói ex_test."
        )

    part1 = []
    part2 = []
    part3 = []
    part4 = []
    missing_imgs: list[str] = []
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

        # Extract \loigiai{...} and optional \dapso{...}
        explanation = ""
        explanation_tex = ""
        essay_answer = ""
        lg_match = re.search(r"\\loigiai\b", block)
        if lg_match:
            lg_inner, lg_end = read_balanced(block, lg_match.end(), "{", "}")
            if lg_inner is not None:
                dapso_in_lg, lg_without_dapso = _extract_dapso_command(lg_inner)
                if dapso_in_lg:
                    essay_answer = dapso_in_lg
                explanation_tex = _restore_tikz_tokens_to_tex(lg_without_dapso, tikz_sources)
                explanation = clean_latex_fragment(lg_without_dapso, tikz_tokens, missing_imgs)
                block = (block[:lg_match.start()] + block[lg_end:]).strip()
        dapso_in_body, block = _extract_dapso_command(block)
        if dapso_in_body and not essay_answer:
            essay_answer = dapso_in_body

        # Unwrap top-level \immini[thm]{arg1}{arg2} BEFORE splitting \choice / \choiceTF / \shortans
        # so cases where \choice or \shortans sits inside arg1 still keep the figure (arg2) in the stem!
        def _unwrap_immini_block(a1: str, a2: str) -> str:
            m_inner = re.search(
                r"\\(choiceTF(?:t|fix|w|h)?|choice(?:fix|t|w|h)?|shortansw?)\b",
                a1,
                flags=re.IGNORECASE,
            )
            if m_inner:
                return a1[:m_inner.start()].rstrip() + "\n" + a2.strip() + "\n" + a1[m_inner.start():]
            return a1.strip() + "\n" + a2.strip()

        block = replace_command_2args(block, "immini", _unwrap_immini_block)
        block = replace_command_2args(block, "setlength", lambda a1, a2: "")

        # Handle \choicew{width} / \choiceTFw{width} safely:
        # - If followed by \choice / \choiceTF later in the same block -> strip it as a width modifier.
        # - If NOT followed by \choice / \choiceTF (used directly as \choicew{0.4\textwidth}{A}{B}{C}{D})
        #   -> replace it with \choice / \choiceTF so options are preserved!
        has_explicit_tf = bool(re.search(r"\\choiceTF(?:t|fix)?\b", block, flags=re.IGNORECASE))
        has_explicit_mc = bool(re.search(r"\\choice(?:fix|t)?\b", block))
        for _wcmd in ("choiceTFw", "choiceTFh"):
            block = replace_command_1arg(block, _wcmd, (lambda a: "") if has_explicit_tf else (lambda a: "\\choiceTF "))
        for _wcmd in ("choicew", "choiceh"):
            block = replace_command_1arg(block, _wcmd, (lambda a: "") if has_explicit_mc else (lambda a: "\\choice "))
        block = replace_command_1arg(block, "shortansw", lambda a: "")

        # Detect question type inside remaining block:
        # Priority: \choiceTF / \choiceTFt / \choiceTFfix -> Part II; \shortans -> Part III; \choice / \choicefix / \choicet -> Part I
        m_tf = re.search(r"\\choiceTF(?:t|fix)?\b", block, flags=re.IGNORECASE)
        m_sa = re.search(r"\\shortans\b", block, flags=re.IGNORECASE)
        m_mc = re.search(r"\\choice(?:fix|t)?\b", block)

        if m_tf:
            stem_raw = block[:m_tf.start()].strip()
            p = skip_ws(block, m_tf.end())
            while p < len(block) and block[p] in "*!":
                p = skip_ws(block, p + 1)
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
                    "text": clean_latex_fragment(text_clean, tikz_tokens, missing_imgs),
                    "answer": is_true,
                })
            stem_tex, stem_html, fig_tex, fig_html = _split_stem_and_figures(stem_raw, tikz_tokens, tikz_sources, missing_imgs)
            part2.append({
                "id": f"tex-p2-{len(part2)+1}-{stamp}",
                "topic": "",
                "stem": stem_html,
                "stemTex": stem_tex,
                "figureTex": fig_tex,
                "figureHtml": fig_html,
                "statements": statements,
                "explanation": explanation,
                "explanationTex": explanation_tex,
            })

        elif m_sa:
            stem_raw = block[:m_sa.start()].strip()
            p = skip_ws(block, m_sa.end())
            while p < len(block) and block[p] in "*!":
                p = skip_ws(block, p + 1)
            while p < len(block) and block[p] == "[":
                _, p = read_balanced(block, p, "[", "]")
                p = skip_ws(block, p)
            ans_raw, end_pos = read_balanced(block, p, "{", "}")
            tail = block[end_pos:].strip()
            # Strip trailing \par / whitespace right after \shortans{...}
            tail = re.sub(r"^(?:\s*\\par\b\s*)+", "", tail)
            tail = re.sub(r"(?:\s*\\par\b\s*)+$", "", tail).strip()
            if tail:
                stem_raw = (stem_raw + "\n" + tail).strip()
            ans_clean = clean_short_answer_value(ans_raw or "")
            if not ans_clean:
                warnings.append(f"Câu ex #{idx} (\\shortans) chưa có đáp án số.")
            stem_tex, stem_html, fig_tex, fig_html = _split_stem_and_figures(stem_raw, tikz_tokens, tikz_sources, missing_imgs)
            part3.append({
                "id": f"tex-p3-{len(part3)+1}-{stamp}",
                "topic": "",
                "stem": stem_html,
                "stemTex": stem_tex,
                "figureTex": fig_tex,
                "figureHtml": fig_html,
                "answer": ans_clean or "0",
                "explanation": explanation,
                "explanationTex": explanation_tex,
            })

        elif m_mc:
            stem_raw = block[:m_mc.start()].strip()
            p = skip_ws(block, m_mc.end())
            while p < len(block) and block[p] in "*!":
                p = skip_ws(block, p + 1)
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
                    "text": clean_latex_fragment(text_clean, tikz_tokens, missing_imgs),
                })
            if not correct_key:
                correct_key = "A"
                warnings.append(f"Câu Phần I #{len(part1)+1} (ex #{idx}) không thấy \\True, tạm đặt đáp án A.")
            stem_tex, stem_html, fig_tex, fig_html = _split_stem_and_figures(stem_raw, tikz_tokens, tikz_sources, missing_imgs)
            part1.append({
                "id": f"tex-p1-{len(part1)+1}-{stamp}",
                "topic": "",
                "stem": stem_html,
                "stemTex": stem_tex,
                "figureTex": fig_tex,
                "figureHtml": fig_html,
                "options": options,
                "answer": correct_key,
                "explanation": explanation,
                "explanationTex": explanation_tex,
            })
        else:
            # Essay / Tự luận question (no \choice, \choiceTF, or \shortans)
            stem_tex, stem_html, fig_tex, fig_html = _split_stem_and_figures(block, tikz_tokens, tikz_sources, missing_imgs)
            if stem_html or fig_html:
                part4.append({
                    "id": f"tex-p4-{len(part4)+1}-{stamp}",
                    "topic": "",
                    "stem": stem_html,
                    "stemTex": stem_tex,
                    "figureTex": fig_tex,
                    "figureHtml": fig_html,
                    "answer": essay_answer,
                    "explanation": explanation,
                    "explanationTex": explanation_tex,
                })
            else:
                warnings.append(f"Bỏ qua khối ex #{idx} vì nội dung trống.")

    if len(part1) + len(part2) + len(part3) + len(part4) == 0:
        raise ValueError("Không trích xuất được câu hỏi hợp lệ nào từ mã LaTeX ex_test.")

    unique_missing_imgs: list[str] = []
    for img_ref in missing_imgs:
        if img_ref not in unique_missing_imgs:
            unique_missing_imgs.append(img_ref)
    if unique_missing_imgs:
        warnings.insert(
            0,
            f"Thiếu {len(unique_missing_imgs)} ảnh minh họa (\\includegraphics): "
            + ", ".join(unique_missing_imgs)
            + " — hãy tải ảnh lên để thay thế tự động.",
        )

    return {
        "exam": {
            "title": title_hint or "Đề thi nạp từ LaTeX (ex_test)",
            "subject": "Toán học 12",
            "code": f"TEX-{stamp[-3:].upper()}",
            "durationMinutes": 90 if len(part1) >= 10 else 45,
            "description": "",
            "scoring": {
                "part1PerQuestion": 0.25,
                "part2Progressive": [0, 0.1, 0.25, 0.5, 1.0],
                "part3PerQuestion": 0.5,
            },
            "part1": part1,
            "part2": part2,
            "part3": part3,
            "part4": part4,
        },
        "warnings": warnings,
        "missingImages": unique_missing_imgs,
        "sourceFormat": "latex_extest",
        "pendingTikzPdfs": pending_tikz_pdfs,
        "pendingTikzBatchPdf": pending_tikz_batch_pdf,
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


WP_NS = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"


def _ole_preview_img_html(zf: zipfile.ZipFile, rels: dict[str, str], obj_el: ET.Element) -> tuple[str, bool]:
    """
    For MathType OLE objects in .docx:
    1. First decode the embedded OLE2 'Equation Native' MTEF v5 stream -> crisp KaTeX LaTeX!
    2. Fallback: decode MTEF v5 from WMF AppsMFCC comment if present!
    3. Fallback: embed raster preview (png/jpg/gif/svg) if present.
    """
    # 1. Try OLE2 binary stream (100% crisp LaTeX)
    for ole in obj_el.iter(f"{O_NS}OLEObject"):
        rid = ole.get(f"{R_NS}id")
        if not rid or rid not in rels:
            continue
        target = rels[rid]
        zip_path = target if target.startswith("word/") else f"word/{target}"
        if zip_path in zf.namelist():
            tex = ole_bytes_to_latex(zf.read(zip_path))
            if tex:
                return f"${tex}$", False

    # 2. Try imagedata preview (WMF MTEF comment or raster image)
    for img in obj_el.iter(f"{V_NS}imagedata"):
        rid = img.get(f"{R_NS}id")
        if not rid or rid not in rels:
            continue
        target = rels[rid]
        zip_path = target if target.startswith("word/") else f"word/{target}"
        if zip_path not in zf.namelist():
            continue
        ext = zip_path.lower().rsplit(".", 1)[-1]
        if ext == "wmf":
            tex = wmf_bytes_to_latex(zf.read(zip_path))
            if tex:
                return f"${tex}$", False
        if ext in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
            mime = "image/svg+xml" if ext == "svg" else ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
            b64 = base64.b64encode(zf.read(zip_path)).decode("ascii")
            return f'<img src="data:{mime};base64,{b64}" class="inline-eq-img" alt="MathType" style="vertical-align:middle;max-height:2.4em;" />', False
        # Unreadable WMF / EMF MathType preview
        return '<span class="mathtype-placeholder">[Công thức MathType — khuyến nghị chuyển sang LaTeX trong Word bằng MathType Toggle TeX]</span>', True
    return '<span class="mathtype-placeholder">[Công thức MathType]</span>', True


def _drawing_or_pict_html(zf: zipfile.ZipFile, rels: dict[str, str], elem: ET.Element) -> tuple[str, bool, bool]:
    """
    Extract HTML/LaTeX from a <w:drawing> or <w:pict> element.
    Returns (html_str, is_block_figure, had_unreadable_wmf).
    """
    # Check image height in EMUs (914400 EMU = 1 inch = 96px; <= 420000 EMU ~ 44px => inline formula pic)
    cy_emu = 0
    for ext_el in elem.iter(f"{WP_NS}extent"):
        try:
            cy_emu = max(cy_emu, int(ext_el.get("cy") or 0))
        except ValueError:
            pass
    is_small_inline = 0 < cy_emu <= 420000

    # 1. DrawingML <a:blip r:embed="...">
    for blip in elem.iter(f"{A_NS}blip"):
        rid = blip.get(f"{R_NS}embed")
        if not rid or rid not in rels:
            continue
        target = rels[rid]
        zp = target if target.startswith("word/") else f"word/{target}"
        if zp not in zf.namelist():
            continue
        ext = zp.lower().rsplit(".", 1)[-1]
        if ext == "wmf":
            tex = wmf_bytes_to_latex(zf.read(zp))
            if tex:
                return f"${tex}$", False, False
            return "", False, True
        if ext in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
            mime = "image/svg+xml" if ext == "svg" else ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
            b64 = base64.b64encode(zf.read(zp)).decode("ascii")
            if is_small_inline:
                return f'<img src="data:{mime};base64,{b64}" class="inline-eq-img" alt="Công thức" />', False, False
            return f'<div class="q-figure"><img src="data:{mime};base64,{b64}" alt="Hình minh họa" /></div>', True, False

    # 2. VML <v:imagedata r:id="..."> inside <w:pict>
    for img in elem.iter(f"{V_NS}imagedata"):
        rid = img.get(f"{R_NS}id")
        if not rid or rid not in rels:
            continue
        target = rels[rid]
        zp = target if target.startswith("word/") else f"word/{target}"
        if zp not in zf.namelist():
            continue
        ext = zp.lower().rsplit(".", 1)[-1]
        if ext == "wmf":
            tex = wmf_bytes_to_latex(zf.read(zp))
            if tex:
                return f"${tex}$", False, False
            return "", False, True
        if ext in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
            mime = "image/svg+xml" if ext == "svg" else ("image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}")
            b64 = base64.b64encode(zf.read(zp)).decode("ascii")
            return f'<div class="q-figure"><img src="data:{mime};base64,{b64}" alt="Hình minh họa" /></div>', True, False

    return "", False, False


def _is_hidden_run(r_el: ET.Element) -> bool:
    """Return True if a <w:r> run is marked hidden (<w:vanish/> or <w:webHidden/>)."""
    rPr = r_el.find(f"{W_NS}rPr")
    if rPr is None:
        return False
    for tag_name in ("vanish", "webHidden"):
        el = rPr.find(f"{W_NS}{tag_name}")
        if el is not None:
            val = (el.get(f"{W_NS}val") or "true").lower()
            if val not in ("0", "false", "none"):
                return True
    return False


def _extract_paragraph_text(zf: zipfile.ZipFile, rels: dict[str, str], p_el: ET.Element, *, mark_keys: bool = True) -> tuple[str, int]:
    """Extract text, OMML LaTeX, MathType OLE/WMF LaTeX, and embedded figures from a <w:p> element.
    Skips hidden Word complex field instruction runs (between fldChar begin..separate/end) and vanish runs.
    Moves any leading floating figures (anchored before 'Câu N.') to the end of the paragraph so question headers match cleanly."""
    line_parts: list[str] = []
    leading_figs: list[str] = []
    seen_text = False
    wmf_fail = 0
    # Word complex field stack: 'instr' = hidden field code (before separate), 'result' = visible output (after separate)
    field_stack: list[str] = []

    def _walk_children(parent: ET.Element):
        nonlocal seen_text, wmf_fail
        for sub in parent:
            stag = sub.tag.split("}")[-1]
            if stag in ("del", "moveFrom"):
                continue
            if stag in ("ins", "hyperlink", "smartTag", "sdtContent"):
                _walk_children(sub)
                continue
            if stag == "sdt":
                sdt_c = sub.find(f"{W_NS}sdtContent")
                if sdt_c is not None:
                    _walk_children(sdt_c)
                continue
            if stag == "r":
                # Track Word complex field boundaries inside this run
                in_hidden_field_before = "instr" in field_stack
                has_fld_char = False
                for fc in sub.findall(f"{W_NS}fldChar"):
                    has_fld_char = True
                    ftype = (fc.get(f"{W_NS}fldCharType") or "").lower()
                    if ftype == "begin":
                        field_stack.append("instr")
                    elif ftype == "separate":
                        if field_stack:
                            field_stack[-1] = "result"
                    elif ftype == "end":
                        if field_stack:
                            field_stack.pop()
                if has_fld_char or in_hidden_field_before or ("instr" in field_stack) or _is_hidden_run(sub):
                    continue

                marked = _is_marked_correct_run(sub) if mark_keys else False
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
                        obj_html, is_wmf = _ole_preview_img_html(zf, rels, rchild)
                        if is_wmf:
                            wmf_fail += 1
                        run_buf.append(obj_html)
                    elif rctag in ("drawing", "pict"):
                        d_html, is_blk, bad_wmf = _drawing_or_pict_html(zf, rels, rchild)
                        if bad_wmf:
                            wmf_fail += 1
                        if d_html:
                            if is_blk and not seen_text and not "".join(run_buf).strip():
                                leading_figs.append(d_html)
                            else:
                                run_buf.append(d_html)
                run_str = "".join(run_buf)
                if run_str.strip():
                    seen_text = True
                if marked and run_str.strip():
                    line_parts.append(f"«KEY»{run_str}«/KEY»")
                else:
                    line_parts.append(run_str)
            elif stag in ("oMath", "oMathPara"):
                if "instr" in field_stack:
                    continue
                tex = omml_to_latex(sub).strip()
                if tex:
                    seen_text = True
                    line_parts.append(f"${tex}$")

    _walk_children(p_el)

    text_part = "".join(line_parts).strip()
    if leading_figs:
        if text_part:
            text_part = f"{text_part}\n" + "".join(leading_figs)
        else:
            text_part = "".join(leading_figs)
    return text_part, wmf_fail


def parse_docx_bytes(raw_bytes: bytes, filename: str = "") -> dict:
    """
    Parse a .docx file containing Microsoft Equation (OMML) and/or MathType objects
    into EduLab 2025 structure (Part I, II, III, IV).
    """
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

    extracted_lines: list[str] = []

    for child in body:
        ctag = child.tag.split("}")[-1]
        if ctag == "p":
            line, wf = _extract_paragraph_text(zf, rels, child, mark_keys=True)
            mathtype_wmf_count += wf
            if line:
                extracted_lines.append(line)

        elif ctag == "tbl":
            tbl_rows: list[list[str]] = []
            for tr in child.findall(f"{W_NS}tr"):
                cells = []
                for tc in tr.findall(f"{W_NS}tc"):
                    cell_parts = []
                    for p in tc.findall(f"{W_NS}p"):
                        ptxt, wf = _extract_paragraph_text(zf, rels, p, mark_keys=True)
                        mathtype_wmf_count += wf
                        if ptxt:
                            cell_parts.append(ptxt)
                    cells.append(" ".join(cell_parts).strip())
                tbl_rows.append(cells)

            if tbl_rows:
                # Detect Vietnamese Part II True/False 4-row statement table: ['a)', 'statement...', 'Đúng', 'Sai']
                tf_lines: list[str] = []
                if len(tbl_rows) >= 2 and all(
                    len(r) >= 2 and re.match(r"^(?:«KEY»)?[a-d][\)\.](?:«/KEY»)?$", r[0].strip(), re.IGNORECASE)
                    for r in tbl_rows
                ):
                    for r in tbl_rows:
                        lbl = r[0].replace("«KEY»", "").replace("«/KEY»", "").strip().lower()
                        if lbl.endswith("."):
                            lbl = lbl[:-1] + ")"
                        stmt_txt = r[1].strip()
                        tf_lines.append(f"{lbl} {stmt_txt}")
                if tf_lines:
                    extracted_lines.extend(tf_lines)
                else:
                    trs_html = []
                    for ri, row in enumerate(tbl_rows):
                        tag = "th" if ri == 0 else "td"
                        clean_row = [c.replace("«KEY»", "").replace("«/KEY»", "") for c in row]
                        trs_html.append("<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in clean_row) + "</tr>")
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
            f"Còn {mathtype_wmf_count} đối tượng MathType chưa đọc được tự động. Mẹo: Trong Word, mở tab MathType → chọn 'Toggle TeX' rồi nạp lại.",
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

    # Protect embedded HTML media tags (<div class="q-figure">...</div>, <img ...>)
    # so base64 payloads can never accidentally trigger text regexes (e.g. "KQ", "A.", "a)").
    protected_html: list[str] = []

    def _stash_html(m: re.Match) -> str:
        idx = len(protected_html)
        protected_html.append(m.group(0))
        return f"«HTMLTAG_{idx}»"

    text = re.sub(r'<div class="q-figure">[\s\S]*?</div>', _stash_html, text)
    text = re.sub(r"<img\b[^>]*>", _stash_html, text)

    def _restore_html(s: str) -> str:
        if not protected_html or "«HTMLTAG_" not in s:
            return s
        return re.sub(r"«HTMLTAG_(\d+)»", lambda m: protected_html[int(m.group(1))], s)

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
        plain = line.replace("«KEY»", "").replace("«/KEY»", "").replace("\xa0", " ").strip()
        if not plain:
            continue

        # Ignore trailing "------ HẾT ------" markers
        if re.match(r"^[-–—=\s]*HẾT[-–—=\s\.]*$", plain, flags=re.IGNORECASE):
            continue

        # Detect PHẦN I / II / III / IV
        m_part = re.match(r"^(?:PHẦN|Phần)\s+(IV|III|II|I|4|3|2|1)\b", plain)
        if m_part:
            flush()
            tok = m_part.group(1).upper()
            current_part = {"I": 1, "1": 1, "II": 2, "2": 2, "III": 3, "3": 3, "IV": 4, "4": 4}[tok]
            continue

        # Detect Câu N. or Câu N:
        m_q = re.match(r"^(?:«KEY»)?(?:Câu|Bài)\s+(\d+)\s*[\.:\)]\s*(.*)$", line.replace("\xa0", " ").strip(), flags=re.IGNORECASE)
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
    part4 = []
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
                "topic": "",
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
                "topic": "",
                "stem": stem.replace("\n", "<br/>"),
                "statements": statements,
                "explanation": explanation,
            })

        elif effective_part == 4:
            clean_body = body.replace("«KEY»", "").replace("«/KEY»", "").strip()
            part4.append({
                "id": f"{source_format}-p4-{len(part4)+1}-{stamp}",
                "topic": "",
                "stem": clean_body.replace("\n", "<br/>"),
                "explanation": explanation,
            })

        else:
            clean_body = body.replace("«KEY»", "").replace("«/KEY»", "").strip()
            ans_val = ""
            m_ans = re.search(r"\b(?:Đáp án|Đáp số|Trả lời|KQ)\s*[:=]?\s*([\-0-9,\.]+)", clean_body, flags=re.IGNORECASE)
            if m_ans:
                ans_val = m_ans.group(1).strip()
                clean_body = clean_body[:m_ans.start()].strip()
            elif explanation:
                m_ans2 = re.search(r"\b(?:Đáp án|Đáp số|Trả lời|KQ)\s*[:=]?\s*([\-0-9,\.]+)", explanation, flags=re.IGNORECASE)
                if m_ans2:
                    ans_val = m_ans2.group(1).strip()
            if not ans_val:
                ans_val = "0"
                warnings.append(f"Phần III - Câu {qnum}: Chưa thấy đáp số ngắn, tạm đặt 0 (hãy nhập đáp số trong Trình tinh chỉnh).")
            part3.append({
                "id": f"{source_format}-p3-{len(part3)+1}-{stamp}",
                "topic": "",
                "stem": clean_body.replace("\n", "<br/>"),
                "answer": ans_val.replace(".", ",")[:4],
                "explanation": explanation,
            })

    if protected_html:
        for q in part1:
            q["stem"] = _restore_html(q["stem"])
            q["explanation"] = _restore_html(q["explanation"])
            for o in q["options"]:
                o["text"] = _restore_html(o["text"])
        for q in part2:
            q["stem"] = _restore_html(q["stem"])
            q["explanation"] = _restore_html(q["explanation"])
            for st in q["statements"]:
                st["text"] = _restore_html(st["text"])
        for q in part3:
            q["stem"] = _restore_html(q["stem"])
            q["explanation"] = _restore_html(q["explanation"])
        for q in part4:
            q["stem"] = _restore_html(q["stem"])
            q["explanation"] = _restore_html(q["explanation"])

    if len(part1) + len(part2) + len(part3) + len(part4) == 0:
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
            "description": "",
            "scoring": {
                "part1PerQuestion": 0.25,
                "part2Progressive": [0, 0.1, 0.25, 0.5, 1.0],
                "part3PerQuestion": 0.5,
            },
            "part1": part1,
            "part2": part2,
            "part3": part3,
            "part4": part4,
        },
        "warnings": warnings,
        "sourceFormat": source_format,
    }


def parse_presentation_source(source_type: str, content: str, filename: str = "") -> dict:
    """
    Parse Word (.docx base64), PDF extracted text, or LaTeX (.tex) into a clean 4-part lecture slide deck:
    - part1: Multiple Choice (grouped 1 / 2 / 3 per slide on frontend)
    - part2: True/False (1 question per slide)
    - part3: Short Answer (1 question per slide)
    - part4: Essay / Tự luận (1 question per slide)
    """
    stype = str(source_type or "").strip().lower()
    if stype in ("docx", "docx_base64"):
        raw_bytes = base64.b64decode(content)
        res = parse_docx_bytes(raw_bytes, filename=filename)
    elif stype in ("latex", "tex", "extest"):
        res = parse_extest_latex(content, filename=filename)
    else:
        res = parse_structured_exam_text(content, filename=filename, source_format="pdf")

    ex = res.get("exam") or {}
    # Presentation mode does NOT grade answers — completely ignore all answer-key warnings
    # (missing \True, default answer A/0, missing short-answer key, etc.) while keeping them in Exam Bank.
    answer_warn_re = re.compile(
        r"(\\True|tạm đặt đáp án|chưa có đáp án|đáp án đúng|đáp số ngắn|chưa thấy đáp số|tạm đặt\s+[A0])",
        flags=re.IGNORECASE,
    )
    clean_warnings = [
        w
        for w in (res.get("warnings") or [])
        if not answer_warn_re.search(str(w or ""))
    ]
    return {
        "deck": {
            "title": ex.get("title") or "Bài giảng trình chiếu",
            "part1": ex.get("part1") or [],
            "part2": ex.get("part2") or [],
            "part3": ex.get("part3") or [],
            "part4": ex.get("part4") or [],
        },
        "warnings": clean_warnings,
        "missingImages": res.get("missingImages") or [],
        "sourceFormat": res.get("sourceFormat", stype),
    }
