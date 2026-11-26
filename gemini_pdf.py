r"""
Gemini Vision AI PDF -> Structured Vietnamese 2025 Math Exam & LaTeX Converter.
Zero external dependencies — uses Python 3.12 standard library (urllib) only.

Uses the Gemini Interactions API (/v1beta/interactions) with inline PDF bytes
and strict JSON Schema structured output so EVERY PDF (Word/MathType export,
LaTeX/TikZ PDF, or scanned photo PDF) is converted into:
  - 4 structured parts: part1 (MC), part2 (True/False), part3 (Short Answer), part4 (Essay)
  - High-precision LaTeX math (\dfrac, \overrightarrow, ^\circ, tight coordinates)
  - Normalized figure bounding boxes (page + [ymin, xmin, ymax, xmax] on 0..1000 scale)
    for client-side high-DPI cropping with PDF.js
  - Clean ex_test LaTeX source export
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any

INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
API_REVISION = "2026-05-20"

AVAILABLE_GEMINI_MODELS = [
    {
        "id": "gemini-3.8-flash",
        "label": "Gemini 3.8 Flash (Khuyên dùng · Chính xác cao · Có Free Tier)",
    },
    {
        "id": "gemini-3.6-flash",
        "label": "Gemini 3.6 Flash (Cân bằng tốc độ & độ chính xác · Có Free Tier)",
    },
    {
        "id": "gemini-3.5-flash-lite",
        "label": "Gemini 3.5 Flash-Lite (Siêu nhanh · Có Free Tier)",
    },
]

DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"


class GeminiPdfError(Exception):
    def __init__(self, message: str, *, code: str = "GEMINI_ERROR", http_status: int = 400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


def mask_api_key(key: str) -> str:
    k = str(key or "").strip()
    if not k:
        return ""
    if len(k) <= 10:
        return k[:2] + "..." + k[-2:]
    return f"{k[:6]}...{k[-4:]}"


def resolve_gemini_config(db: dict | None) -> dict[str, Any]:
    """Resolve effective Gemini API key and model from db['settings'] or GEMINI_API_KEY env var."""
    settings = (db or {}).get("settings")
    if not isinstance(settings, dict):
        settings = {}

    db_key = str(settings.get("geminiApiKey") or "").strip()
    env_key = str(os.environ.get("GEMINI_API_KEY") or "").strip()
    effective_key = db_key or env_key
    source = "db" if db_key else ("env" if env_key else "none")

    model = str(settings.get("geminiModel") or "").strip() or DEFAULT_GEMINI_MODEL

    return {
        "apiKey": effective_key,
        "configured": bool(effective_key),
        "source": source,
        "maskedKey": mask_api_key(effective_key),
        "model": model,
        "availableModels": AVAILABLE_GEMINI_MODELS,
    }


def _extract_interaction_text(resp_json: dict[str, Any]) -> str:
    """Extract text output robustly from a Gemini Interactions API JSON response (steps & legacy outputs)."""
    if not isinstance(resp_json, dict):
        return ""
    direct = resp_json.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    texts: list[str] = []

    # 1. Modern Interactions API (Api-Revision: 2026-05-20+): resp["steps"]
    steps = resp_json.get("steps")
    if isinstance(steps, list):
        for step in steps:
            if not isinstance(step, dict):
                continue
            stype = step.get("type")
            if stype in ("user_input", "thought", "thinking"):
                continue
            content = step.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                        texts.append(part["text"])
            elif isinstance(content, str) and content.strip():
                texts.append(content)
            elif stype == "text" and isinstance(step.get("text"), str):
                texts.append(step["text"])
    if texts:
        return "\n".join(texts).strip()

    # 2. Legacy Interactions API: resp["outputs"]
    outputs = resp_json.get("outputs")
    if isinstance(outputs, list):
        for item in outputs:
            if not isinstance(item, dict):
                continue
            itype = item.get("type")
            if itype == "text" and isinstance(item.get("text"), str):
                texts.append(item["text"])
            elif isinstance(item.get("content"), list):
                for part in item["content"]:
                    if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                        texts.append(part["text"])
            elif isinstance(item.get("text"), str) and itype != "thought":
                texts.append(item["text"])
    if texts:
        return "\n".join(texts).strip()

    # 3. Fallback if classic generateContent candidates shape
    candidates = resp_json.get("candidates")
    if isinstance(candidates, list) and candidates:
        parts = candidates[0].get("content", {}).get("parts", [])
        c_texts = [p.get("text", "") for p in parts if isinstance(p, dict) and isinstance(p.get("text"), str)]
        if c_texts:
            return "\n".join(c_texts).strip()
    return ""


def _post_gemini_interaction(
    api_key: str,
    payload: dict[str, Any],
    *,
    timeout_sec: int = 120,
) -> dict[str, Any]:
    body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        INTERACTIONS_ENDPOINT,
        data=body_bytes,
        method="POST",
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
            "Api-Revision": API_REVISION,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raw_err = ""
        try:
            raw_err = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        detail = ""
        try:
            err_obj = json.loads(raw_err)
            detail = (
                err_obj.get("error", {}).get("message")
                or err_obj.get("message")
                or raw_err[:240]
            )
        except Exception:
            detail = raw_err[:240]

        if e.code in (401, 403):
            raise GeminiPdfError(
                "Gemini API Key không hợp lệ hoặc không có quyền truy cập. Thầy hãy kiểm tra lại API Key trong Cài đặt Gemini AI.",
                code="INVALID_GEMINI_KEY",
                http_status=400,
            )
        if e.code == 429:
            raise GeminiPdfError(
                "Đã tạm chạm hạn mức gọi miễn phí của Gemini API (RPM/RPD). Thầy hãy chờ khoảng 1 phút rồi thử lại, hoặc chuyển sang model Gemini 3.5 Flash-Lite trong Cài đặt.",
                code="GEMINI_RATE_LIMIT",
                http_status=429,
            )
        if e.code == 400 and ("API key" in detail or "API_KEY" in detail):
            raise GeminiPdfError(
                "Gemini API Key không đúng định dạng hoặc chưa hợp lệ. Thầy hãy dán lại API Key từ Google AI Studio.",
                code="INVALID_GEMINI_KEY",
                http_status=400,
            )
        if e.code == 404:
            raise GeminiPdfError(
                f"Model Gemini hiện tại không khả dụng ({detail or '404'}). Thầy hãy chọn model khác trong Cài đặt Gemini AI.",
                code="GEMINI_MODEL_NOT_FOUND",
                http_status=400,
            )
        if e.code == 503:
            raise GeminiPdfError(
                f"Model {payload.get('model', '')} của Google Gemini đang tạm quá tải lượng truy cập (HTTP 503). Hệ thống sẽ tự thử lại hoặc chuyển model dự phòng.",
                code="GEMINI_OVERLOADED",
                http_status=503,
            )
        raise GeminiPdfError(
            f"Lỗi gọi Gemini API (HTTP {e.code}): {detail or str(e)}",
            code="GEMINI_HTTP_ERROR",
            http_status=502,
        )
    except urllib.error.URLError as e:
        raise GeminiPdfError(
            f"Không thể kết nối tới máy chủ Google Gemini API ({e.reason}). Hãy kiểm tra kết nối mạng.",
            code="GEMINI_NETWORK_ERROR",
            http_status=502,
        )
    except TimeoutError:
        raise GeminiPdfError(
            "Quá thời gian chờ Gemini xử lý file PDF (file quá dài hoặc mạng chậm). Thầy thử tách bớt trang hoặc chuyển sang model Gemini 3.5 Flash-Lite.",
            code="GEMINI_TIMEOUT",
            http_status=504,
        )


def _build_fallback_models(primary_model: str) -> list[str]:
    ordered = [primary_model] if primary_model else []
    for m in ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"):
        if m not in ordered:
            ordered.append(m)
    return ordered


def _post_with_fallback(
    api_key: str,
    payload: dict[str, Any],
    *,
    timeout_sec: int = 120,
) -> tuple[dict[str, Any], str]:
    """Call Gemini Interactions API with automatic retry + fallback to sibling Flash models on HTTP 503/429/404."""
    models_to_try = _build_fallback_models(str(payload.get("model") or DEFAULT_GEMINI_MODEL).strip())
    last_err: GeminiPdfError | None = None

    for idx, mdl in enumerate(models_to_try):
        attempt_payload = dict(payload, model=mdl)
        # Retry once on transient 503 for the primary model before falling back
        max_tries = 2 if idx == 0 else 1
        for attempt in range(max_tries):
            try:
                resp = _post_gemini_interaction(api_key, attempt_payload, timeout_sec=timeout_sec)
                return resp, mdl
            except GeminiPdfError as ge:
                last_err = ge
                if ge.code in ("GEMINI_OVERLOADED", "GEMINI_RATE_LIMIT", "GEMINI_MODEL_NOT_FOUND"):
                    if ge.code == "GEMINI_OVERLOADED" and attempt + 1 < max_tries:
                        time.sleep(1.5)
                        continue
                    # Fall through to next fallback model
                    break
                # Fatal errors (invalid API key, network error, etc.) fail immediately
                raise

    assert last_err is not None
    if last_err.code == "GEMINI_OVERLOADED":
        raise GeminiPdfError(
            "Các model Flash của Google Gemini hiện đều đang quá tải tạm thời (HTTP 503). Thầy hãy đợi khoảng 30–60 giây rồi thả lại file PDF nhé.",
            code="GEMINI_OVERLOADED",
            http_status=503,
        )
    raise last_err


def test_gemini_connection(api_key: str, model: str = DEFAULT_GEMINI_MODEL) -> dict[str, Any]:
    key = str(api_key or "").strip()
    if not key:
        raise GeminiPdfError(
            "Chưa có Gemini API Key để kiểm tra.",
            code="MISSING_GEMINI_KEY",
            http_status=400,
        )
    t0 = time.monotonic()
    resp, used_model = _post_with_fallback(
        key,
        {
            "model": model or DEFAULT_GEMINI_MODEL,
            "store": False,
            "input": [{"type": "text", "text": "Trả lời đúng 1 từ: OK"}],
        },
        timeout_sec=25,
    )
    elapsed_ms = int((time.monotonic() - t0) * 1000)
    reply = _extract_interaction_text(resp) or "OK"
    return {
        "ok": True,
        "model": used_model,
        "latencyMs": elapsed_ms,
        "reply": reply[:60],
    }


_FIGURE_SCHEMA = {
    "type": "object",
    "nullable": True,
    "description": "Set only if the question contains a visual diagram, graph, geometric figure, or illustration to crop from the PDF page; otherwise null.",
    "properties": {
        "page": {
            "type": "integer",
            "description": "1-based PDF page number where the diagram appears.",
        },
        "box_2d": {
            "type": "array",
            "description": "Tight bounding box [ymin, xmin, ymax, xmax] on a 0..1000 normalized page scale covering ONLY the diagram/figure (excluding surrounding question text).",
            "items": {"type": "integer"},
        },
    },
    "required": ["page", "box_2d"],
}

_EXAM_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": "Tiêu đề đề thi / đề cương nhận diện được từ trang đầu (không để rỗng).",
        },
        "subject": {
            "type": "string",
            "description": "Môn học và khối lớp nếu nhận diện được, ví dụ 'Toán học 10', 'Toán học 12'.",
        },
        "part1": {
            "type": "array",
            "description": "PHẦN I: Các câu trắc nghiệm nhiều phương án lựa chọn (A, B, C, D).",
            "items": {
                "type": "object",
                "properties": {
                    "stem": {"type": "string", "description": "Nội dung đề bài (KHÔNG gồm tiền tố 'Câu 1.'), công thức toán viết bằng LaTeX $...$."},
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string", "enum": ["A", "B", "C", "D"]},
                                "text": {"type": "string", "description": "Nội dung phương án (KHÔNG gồm 'A.', 'B.', ...)."},
                            },
                            "required": ["key", "text"],
                        },
                    },
                    "answer": {
                        "type": "string",
                        "description": "Đáp án đúng ('A','B','C','D') NẾU đề có gạch chân/tô màu/bảng đáp án; nếu đề không có đáp án thì để chuỗi rỗng ''.",
                    },
                    "explanation": {"type": "string", "description": "Lời giải nếu có trong PDF, không thì để ''."},
                    "figure": _FIGURE_SCHEMA,
                },
                "required": ["stem", "options", "answer", "explanation"],
            },
        },
        "part2": {
            "type": "array",
            "description": "PHẦN II: Các câu trắc nghiệm Đúng / Sai gồm 4 ý a), b), c), d).",
            "items": {
                "type": "object",
                "properties": {
                    "stem": {"type": "string", "description": "Đề bài dẫn nhập (KHÔNG gồm 'Câu 1.')."},
                    "statements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": {"type": "string", "enum": ["a", "b", "c", "d"]},
                                "text": {"type": "string", "description": "Nội dung mệnh đề (KHÔNG gồm 'a)', 'b)', ...)."},
                                "answer": {"type": "boolean", "description": "true nếu đề đánh dấu Đúng, false nếu Sai hoặc chưa có đáp án."},
                            },
                            "required": ["key", "text", "answer"],
                        },
                    },
                    "explanation": {"type": "string"},
                    "figure": _FIGURE_SCHEMA,
                },
                "required": ["stem", "statements", "explanation"],
            },
        },
        "part3": {
            "type": "array",
            "description": "PHẦN III: Các câu trắc nghiệm trả lời ngắn.",
            "items": {
                "type": "object",
                "properties": {
                    "stem": {"type": "string", "description": "Nội dung câu hỏi (KHÔNG gồm 'Câu 1.')."},
                    "answer": {"type": "string", "description": "Đáp số ngắn tối đa 4 ký tự nếu có trong PDF (VD '-1,5' hoặc '12'), không thì ''."},
                    "explanation": {"type": "string"},
                    "figure": _FIGURE_SCHEMA,
                },
                "required": ["stem", "answer", "explanation"],
            },
        },
        "part4": {
            "type": "array",
            "description": "PHẦN IV: Các câu tự luận (nếu có). Dùng thẻ <br/> để xuống dòng giữa các ý a), b), c).",
            "items": {
                "type": "object",
                "properties": {
                    "stem": {"type": "string", "description": "Nội dung câu tự luận (KHÔNG gồm 'Câu 1.' hay 'Bài 1.')."},
                    "explanation": {"type": "string"},
                    "figure": _FIGURE_SCHEMA,
                },
                "required": ["stem", "explanation"],
            },
        },
    },
    "required": ["title", "subject", "part1", "part2", "part3", "part4"],
}

_PDF_EXTRACTION_PROMPT = r"""Bạn là chuyên gia số hóa đề thi Toán học Việt Nam (chương trình GDPT 2018 / cấu trúc BGD 2025) sang LaTeX chuẩn xác 100%.

Hãy đọc toàn bộ các trang của file PDF đính kèm và trích xuất ĐẦY ĐỦ, CHÍNH XÁC từng câu hỏi vào đúng 4 phần JSON:
- `part1`: PHẦN I — Trắc nghiệm nhiều phương án lựa chọn (A, B, C, D).
- `part2`: PHẦN II — Trắc nghiệm Đúng/Sai (gồm 4 ý a, b, c, d).
- `part3`: PHẦN III — Trắc nghiệm trả lời ngắn.
- `part4`: PHẦN IV — Tự luận (nếu đề có phần tự luận; nếu câu có nhiều ý a), b) hãy xuống dòng bằng `<br/>` và in đậm `<strong>a)</strong>`, `<strong>b)</strong>`).

QUY TẮC QUAN TRỌNG VỀ CÔNG THỨC TOÁN LATEX (BẮT BUỘC TUÂN THỦ):
1. Mọi ký hiệu toán học, biến số, tọa độ, phân số, căn thức, hệ phương trình, số đo góc, vectơ đều phải bọc trong `$...$` (hoặc `$$...$$` nếu là công thức riêng dòng). Không bỏ sót các biểu thức như `(3;1)`, `A(-2;5)`, `x = 2`, `45^\circ`.
2. Phân số: LUÔN dùng `\dfrac{tử}{mẫu}` (không dùng `\frac` nhỏ, trừ khi nằm trong số mũ).
3. Vectơ: LUÔN dùng `\overrightarrow{...}` cho MỌI vectơ kể cả 1 chữ cái (VD: `\overrightarrow{a}`, `\overrightarrow{i}`, `\overrightarrow{j}`, `\overrightarrow{AB}` — KHÔNG dùng `\vec`).
4. Dấu độ: LUÔN dùng `^\circ` (VD: `45^\circ`, `150^\circ` — KHÔNG dùng `^o`).
5. Tọa độ và khoảng: KHÔNG thêm dấu cách quanh dấu `;` (VD: `A(2;1)`, `(0;-2)`, `[1;3)`).
6. Hệ phương trình / bất phương trình: dùng `\left\{\begin{aligned} ... \\ ... \end{aligned}\right.`.
7. Không giữ lại tiền tố số thứ tự câu (`Câu 1.`, `Bài 1.`), tiền tố đáp án (`A.`, `B.`, `a)`, `b)`), dòng `------ HẾT ------`, hay các lệnh căn lề thừa (`\choicew`, `\vspace`, `\noindent`).
8. Đáp án: Nếu PDF có đánh dấu đáp án đúng (gạch chân, tô màu đỏ/vàng, in đậm đáp án hoặc có Bảng đáp án ở cuối file) thì điền vào trường `answer`. Nếu PDF là đề trắng không có đáp án, để `answer` là chuỗi rỗng `""` (không tự đoán bừa).
9. HÌNH VẼ MINH HỌA (`figure`): Nếu câu hỏi có kèm hình vẽ, đồ thị hàm số, hình học không gian, miền nghiệm, sơ đồ hoặc ảnh minh họa trong PDF, HÃY ĐIỀN trường `figure` với:
   - `page`: số thứ tự trang PDF (bắt đầu từ 1).
   - `box_2d`: `[ymin, xmin, ymax, xmax]` theo thang chuẩn hóa `0..1000` (0 = mép trên/trái trang, 1000 = mép dưới/phải trang) bao gọn CHỈ vùng hình vẽ/đồ thị (không bao lẫn chữ đề bài). Nếu câu không có hình vẽ thì đặt `figure: null`.
10. Không bỏ sót bất kỳ câu hỏi nào từ trang đầu đến trang cuối. Chỉ xuất JSON đúng schema."""


def _normalize_ai_math_text(text: str) -> str:
    """Apply consistent Vietnamese math LaTeX conventions on AI-extracted text."""
    s = str(text or "").strip()
    if not s:
        return ""
    # Strip any accidental leading 'Câu 1.' or 'Bài 1:'
    s = re.sub(r"^(?:Câu|Bài)\s+\d+\s*[\.:\)]\s*", "", s, flags=re.IGNORECASE).strip()

    def _clean_math(m: re.Match) -> str:
        seg = m.group(0)
        seg = re.sub(r"(\^\{?|_\{?)?\\frac(?=\s*\{)", lambda x: x.group(0) if x.group(1) else r"\dfrac", seg)
        seg = re.sub(r"\\vec\s*\{([^{}]+)\}", r"\\overrightarrow{\1}", seg)
        seg = re.sub(r"\\vec\s+([A-Za-z0-9])", r"\\overrightarrow{\1}", seg)
        seg = re.sub(r"(\d)\s*\^\s*\{\s*[oO°]\s*\}", r"\1^\\circ", seg)
        seg = re.sub(r"(\d)\s*\^\s*[oO°](?![A-Za-z])", r"\1^\\circ", seg)
        seg = re.sub(r"(\d)\s*°", r"\1^\\circ", seg)
        seg = re.sub(r"(?:\\[,:! ]|\s)+(?=(?<!\\);)", "", seg)
        seg = re.sub(r"(?<!\\);(?:\\[,:! ]|\s)+", ";", seg)
        return seg

    s = re.sub(r"(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))", _clean_math, s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\n+", "<br/>", s)
    return s.strip()


def _valid_figure_box(fig: Any) -> dict[str, Any] | None:
    if not isinstance(fig, dict):
        return None
    try:
        page = int(fig.get("page", 0))
    except (TypeError, ValueError):
        return None
    box = fig.get("box_2d")
    if page < 1 or not isinstance(box, list) or len(box) != 4:
        return None
    try:
        y1, x1, y2, x2 = [int(round(float(v))) for v in box]
    except (TypeError, ValueError):
        return None
    y1 = max(0, min(1000, y1))
    x1 = max(0, min(1000, x1))
    y2 = max(0, min(1000, y2))
    x2 = max(0, min(1000, x2))
    if y2 - y1 < 25 or x2 - x1 < 25:
        return None
    return {"page": page, "box_2d": [y1, x1, y2, x2]}


def build_extest_latex_from_exam(exam: dict[str, Any]) -> str:
    """Generate clean Vietnamese ex_test LaTeX code from a parsed 4-part exam dict."""
    lines: list[str] = []
    title = str(exam.get("title") or "").strip()
    if title:
        lines.append(f"% {title}")
        lines.append("")

    def _html_to_tex(s: str) -> str:
        t = str(s or "")
        t = re.sub(r"EDULABPDFFIG_\d+END", "\n% [Hình vẽ minh họa]\n", t)
        t = re.sub(r'<div class="q-figure">[\s\S]*?</div>', "\n% [Hình vẽ minh họa]\n", t)
        t = re.sub(r"<br\s*/?>", "\n", t, flags=re.IGNORECASE)
        t = re.sub(r"<strong>([^<]+)</strong>", r"\\textbf{\1}", t)
        t = re.sub(r"<em>([^<]+)</em>", r"\\textit{\1}", t)
        t = re.sub(r"<[^>]+>", "", t)
        return t.strip()

    p1 = exam.get("part1") or []
    p2 = exam.get("part2") or []
    p3 = exam.get("part3") or []
    p4 = exam.get("part4") or []

    if p1:
        lines.append("% --- PHẦN I: Câu trắc nghiệm nhiều phương án lựa chọn ---")
        for q in p1:
            lines.append("\\begin{ex}")
            lines.append(_html_to_tex(q.get("stem", "")))
            lines.append("\\choice")
            ans = str(q.get("answer") or "").upper()
            for opt in q.get("options") or []:
                k = str(opt.get("key") or "").upper()
                otxt = _html_to_tex(opt.get("text", ""))
                prefix = "\\True " if ans and k == ans else ""
                lines.append(f"{{{prefix}{otxt}}}")
            expl = _html_to_tex(q.get("explanation", ""))
            if expl:
                lines.append(f"\\loigiai{{\n{expl}\n}}")
            lines.append("\\end{ex}\n")

    if p2:
        lines.append("% --- PHẦN II: Câu trắc nghiệm đúng sai ---")
        for q in p2:
            lines.append("\\begin{ex}")
            lines.append(_html_to_tex(q.get("stem", "")))
            lines.append("\\choiceTF")
            for st in q.get("statements") or []:
                stxt = _html_to_tex(st.get("text", ""))
                prefix = "\\True " if st.get("answer") else ""
                lines.append(f"{{{prefix}{stxt}}}")
            expl = _html_to_tex(q.get("explanation", ""))
            if expl:
                lines.append(f"\\loigiai{{\n{expl}\n}}")
            lines.append("\\end{ex}\n")

    if p3:
        lines.append("% --- PHẦN III: Câu trắc nghiệm trả lời ngắn ---")
        for q in p3:
            lines.append("\\begin{ex}")
            lines.append(_html_to_tex(q.get("stem", "")))
            ans = str(q.get("answer") or "").strip()
            lines.append(f"\\shortans{{{ans}}}")
            expl = _html_to_tex(q.get("explanation", ""))
            if expl:
                lines.append(f"\\loigiai{{\n{expl}\n}}")
            lines.append("\\end{ex}\n")

    if p4:
        lines.append("% --- PHẦN IV: Tự luận ---")
        for q in p4:
            lines.append("\\begin{ex}")
            lines.append(_html_to_tex(q.get("stem", "")))
            expl = _html_to_tex(q.get("explanation", ""))
            if expl:
                lines.append(f"\\loigiai{{\n{expl}\n}}")
            lines.append("\\end{ex}\n")

    return "\n".join(lines).strip()


def parse_pdf_with_gemini(
    pdf_base64: str,
    *,
    filename: str = "",
    api_key: str,
    model: str = DEFAULT_GEMINI_MODEL,
    for_presentation: bool = False,
) -> dict[str, Any]:
    """Send raw PDF bytes (base64) to Gemini Vision AI and return normalized 4-part exam/deck + figure crop boxes."""
    key = str(api_key or "").strip()
    if not key:
        raise GeminiPdfError(
            "Chưa cài đặt Gemini API Key để đọc file PDF. Hãy bấm nút 'Cài đặt Gemini AI' để dán API Key miễn phí từ Google AI Studio.",
            code="MISSING_GEMINI_KEY",
            http_status=400,
        )

    b64_clean = str(pdf_base64 or "").strip()
    if not b64_clean:
        raise GeminiPdfError("Thiếu dữ liệu file PDF.", code="EMPTY_PDF", http_status=400)
    # Inline PDF limit (~25MB base64 ≈ ~18MB binary — comfortably safe for web requests)
    if len(b64_clean) > 36 * 1024 * 1024:
        raise GeminiPdfError(
            "File PDF quá lớn (> 25 MB). Thầy hãy nén nhẹ hoặc tách bớt trang trước khi nạp.",
            code="PDF_TOO_LARGE",
            http_status=413,
        )

    use_model = str(model or "").strip() or DEFAULT_GEMINI_MODEL

    resp, used_model = _post_with_fallback(
        key,
        {
            "model": use_model,
            "store": False,
            "input": [
                {
                    "type": "document",
                    "data": b64_clean,
                    "mime_type": "application/pdf",
                },
                {
                    "type": "text",
                    "text": _PDF_EXTRACTION_PROMPT,
                },
            ],
            "response_format": {
                "type": "text",
                "mime_type": "application/json",
                "schema": _EXAM_RESPONSE_SCHEMA,
            },
        },
        timeout_sec=150,
    )
    use_model = used_model

    raw_text = _extract_interaction_text(resp)
    if not raw_text:
        raise GeminiPdfError(
            "Gemini không trả về nội dung văn bản cho file PDF này. Thầy hãy thử lại hoặc đổi model.",
            code="GEMINI_EMPTY_RESPONSE",
            http_status=502,
        )

    # Strip accidental markdown code fences if any
    cleaned_json = raw_text.strip()
    if cleaned_json.startswith("```"):
        cleaned_json = re.sub(r"^```(?:json)?\s*", "", cleaned_json)
        cleaned_json = re.sub(r"\s*```$", "", cleaned_json)

    try:
        parsed = json.loads(cleaned_json)
    except json.JSONDecodeError as e:
        raise GeminiPdfError(
            f"Dữ liệu JSON từ Gemini bị cắt ngang hoặc chưa hợp lệ ({e}). Nếu file PDF quá dài, thầy thử tách làm 2 phần.",
            code="GEMINI_INVALID_JSON",
            http_status=502,
        )

    stamp = hex(int(time.time() * 1000))[2:][-5:]
    pending_pdf_figures: list[dict[str, Any]] = []
    warnings: list[str] = []

    def _attach_figure(stem_html: str, raw_fig: Any) -> str:
        fig = _valid_figure_box(raw_fig)
        if not fig:
            return stem_html
        tok = f"EDULABPDFFIG_{len(pending_pdf_figures)}END"
        pending_pdf_figures.append({"token": tok, "page": fig["page"], "box_2d": fig["box_2d"]})
        if stem_html:
            return f"{stem_html}<br/>{tok}"
        return tok

    part1 = []
    for idx, q in enumerate(parsed.get("part1") or [], start=1):
        if not isinstance(q, dict):
            continue
        stem = _normalize_ai_math_text(q.get("stem", ""))
        stem = _attach_figure(stem, q.get("figure"))
        raw_opts = q.get("options") or []
        opt_map = {}
        for o in raw_opts:
            if isinstance(o, dict):
                k = str(o.get("key") or "").strip().upper()[:1]
                if k in ("A", "B", "C", "D"):
                    opt_map[k] = _normalize_ai_math_text(o.get("text", ""))
        options = [{"key": k, "text": opt_map.get(k, "")} for k in ("A", "B", "C", "D")]
        ans = str(q.get("answer") or "").strip().upper()[:1]
        if ans not in ("A", "B", "C", "D"):
            ans = "A"
            if not for_presentation:
                warnings.append(f"Phần I - Câu {idx}: Chưa thấy đáp án đúng trong PDF, tạm đặt A.")
        part1.append({
            "id": f"pdfai-p1-{idx}-{stamp}",
            "topic": "",
            "stem": stem,
            "options": options,
            "answer": ans,
            "explanation": _normalize_ai_math_text(q.get("explanation", "")),
        })

    part2 = []
    for idx, q in enumerate(parsed.get("part2") or [], start=1):
        if not isinstance(q, dict):
            continue
        stem = _normalize_ai_math_text(q.get("stem", ""))
        stem = _attach_figure(stem, q.get("figure"))
        raw_sts = q.get("statements") or []
        st_map = {}
        for st in raw_sts:
            if isinstance(st, dict):
                k = str(st.get("key") or "").strip().lower()[:1]
                if k in ("a", "b", "c", "d"):
                    st_map[k] = (_normalize_ai_math_text(st.get("text", "")), bool(st.get("answer")))
        statements = [
            {"key": k, "text": st_map.get(k, ("", False))[0], "answer": st_map.get(k, ("", False))[1]}
            for k in ("a", "b", "c", "d")
        ]
        part2.append({
            "id": f"pdfai-p2-{idx}-{stamp}",
            "topic": "",
            "stem": stem,
            "statements": statements,
            "explanation": _normalize_ai_math_text(q.get("explanation", "")),
        })

    part3 = []
    for idx, q in enumerate(parsed.get("part3") or [], start=1):
        if not isinstance(q, dict):
            continue
        stem = _normalize_ai_math_text(q.get("stem", ""))
        stem = _attach_figure(stem, q.get("figure"))
        ans = str(q.get("answer") or "").strip().replace(".", ",")[:4]
        if not ans:
            ans = "0"
            if not for_presentation:
                warnings.append(f"Phần III - Câu {idx}: Chưa thấy đáp số ngắn trong PDF, tạm đặt 0.")
        part3.append({
            "id": f"pdfai-p3-{idx}-{stamp}",
            "topic": "",
            "stem": stem,
            "answer": ans,
            "explanation": _normalize_ai_math_text(q.get("explanation", "")),
        })

    part4 = []
    for idx, q in enumerate(parsed.get("part4") or [], start=1):
        if not isinstance(q, dict):
            continue
        stem = _normalize_ai_math_text(q.get("stem", ""))
        stem = _attach_figure(stem, q.get("figure"))
        if stem:
            part4.append({
                "id": f"pdfai-p4-{idx}-{stamp}",
                "topic": "",
                "stem": stem,
                "explanation": _normalize_ai_math_text(q.get("explanation", "")),
            })

    if len(part1) + len(part2) + len(part3) + len(part4) == 0:
        raise GeminiPdfError(
            "Không nhận diện được câu hỏi nào trong file PDF này.",
            code="NO_QUESTIONS_FOUND",
            http_status=400,
        )

    title_fallback = re.sub(r"\.pdf$", "", filename or "", flags=re.IGNORECASE).strip()
    title = str(parsed.get("title") or "").strip() or title_fallback or "Đề trích xuất từ PDF (Gemini AI)"
    subject = str(parsed.get("subject") or "").strip() or "Toán học"

    exam_obj = {
        "title": title,
        "subject": subject,
        "code": f"PDF-{stamp[-3:].upper()}",
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
    }

    latex_source = build_extest_latex_from_exam(exam_obj)

    if for_presentation:
        return {
            "deck": {
                "title": title,
                "part1": part1,
                "part2": part2,
                "part3": part3,
                "part4": part4,
            },
            "warnings": warnings,
            "pendingPdfFigures": pending_pdf_figures,
            "latexSource": latex_source,
            "aiModel": use_model,
            "sourceFormat": "pdf_ai",
        }

    return {
        "exam": exam_obj,
        "warnings": warnings,
        "pendingPdfFigures": pending_pdf_figures,
        "latexSource": latex_source,
        "aiModel": use_model,
        "sourceFormat": "pdf_ai",
    }
