#!/usr/bin/env python3
"""Built-in demo question packs for Edu Live Game (all 6 interactive question types)."""

from __future__ import annotations

from datetime import datetime


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def build_seed_question_sets() -> list[dict]:
    ts = _now_iso()
    return [
        {
            "id": "set-toan12-hamso",
            "title": "Toán 12 — Khảo sát Hàm số & Đạo hàm (Đủ 6 dạng)",
            "subject": "Toán 12",
            "description": "Bộ câu hỏi tương tác minh họa đầy đủ 6 dạng: Trắc nghiệm 4 đáp án, Đúng/Sai 4 ý (chuẩn 2025), Trả lời ngắn, Điền vào chỗ trống (kéo thẻ), Kéo thả sắp xếp thứ tự và Kéo thả ghép đôi.",
            "createdAt": ts,
            "updatedAt": ts,
            "questions": [
                {
                    "id": "q-t12-1",
                    "type": "mcq",
                    "prompt": "Hàm số $y = x^3 - 3x + 2$ đồng biến trên khoảng nào dưới đây?",
                    "image": "",
                    "timeLimit": 30,
                    "points": 1000,
                    "explanation": "Ta tính đạo hàm $y' = 3x^2 - 3$. Giải $y' = 0 \\Leftrightarrow x = \\pm 1$. Vì hệ số bậc cao nhất $a = 3 > 0$, theo quy tắc *trong trái – ngoài cùng*, ta có $y' > 0$ trên $(-\\infty; -1)$ và $(1; +\\infty)$. Đây cũng chính là các khoảng đồng biến của hàm số.",
                    "data": {
                        "options": [
                            "$(-1; 1)$",
                            "$(-\\infty; -1)$ và $(1; +\\infty)$",
                            "$(0; +\\infty)$",
                            "$(-\\infty; 2)$",
                        ],
                        "correctIndex": 1,
                    },
                },
                {
                    "id": "q-t12-2",
                    "type": "true_false",
                    "prompt": "Cho hàm số $y = \\dfrac{2x - 1}{x - 1}$. Hãy xác định tính **Đúng / Sai** của từng mệnh đề sau:",
                    "image": "",
                    "timeLimit": 45,
                    "points": 1000,
                    "explanation": "• **a) Đúng**: Mẫu thức $x - 1 \\ne 0 \\Leftrightarrow x \\ne 1$.\n• **b) Sai**: Dùng công thức $y' = \\dfrac{ad - bc}{(cx+d)^2} = \\dfrac{2(-1) - (-1)(1)}{(x-1)^2} = \\dfrac{-1}{(x-1)^2} < 0$. Rất nhiều bạn nhầm dấu ở tử số!\n• **c) Đúng**: $\\lim_{x \\to 1} y = \\infty \\Rightarrow$ TCĐ $x = 1$; $\\lim_{x \\to \\pm\\infty} y = 2 \\Rightarrow$ TCN $y = 2$.\n• **d) Sai**: Hàm phân thức bậc nhất trên bậc nhất luôn đơn điệu trên từng khoảng xác định nên **không bao giờ có cực trị**.",
                    "data": {
                        "statements": [
                            {"text": "Tập xác định của hàm số là $D = \\mathbb{R} \\setminus \\{1\\}$.", "answer": True},
                            {"text": "Đạo hàm của hàm số là $y' = \\dfrac{1}{(x-1)^2} > 0, \\forall x \\ne 1$.", "answer": False},
                            {"text": "Đồ thị có tiệm cận đứng $x = 1$ và tiệm cận ngang $y = 2$.", "answer": True},
                            {"text": "Hàm số có đúng 1 điểm cực trị.", "answer": False},
                        ]
                    },
                },
                {
                    "id": "q-t12-3",
                    "type": "short_answer",
                    "prompt": "Tìm giá trị lớn nhất của hàm số $y = -x^2 + 4x + 1$ trên $\\mathbb{R}$. *(Chỉ nhập số)*",
                    "image": "",
                    "timeLimit": 30,
                    "points": 1000,
                    "explanation": "Ta biến đổi hằng đẳng thức: $y = -(x^2 - 4x + 4) + 5 = -(x - 2)^2 + 5 \\le 5$ với mọi $x \\in \\mathbb{R}$. Dấu bằng xảy ra tại $x = 2$, vậy $\\max_{\\mathbb{R}} y = 5$. *(Lưu ý: đề hỏi **giá trị lớn nhất** là $y = 5$, không phải hoành độ đỉnh $x = 2$!)*",
                    "data": {
                        "acceptedAnswers": ["5", "5.0", "5,0"],
                        "caseSensitive": False,
                        "placeholder": "Nhập một số (ví dụ: 5)",
                    },
                },
                {
                    "id": "q-t12-4",
                    "type": "fill_blank",
                    "prompt": "Điền vào chỗ trống cho đúng bản chất cực trị của hàm bậc ba:",
                    "image": "",
                    "timeLimit": 40,
                    "points": 1000,
                    "explanation": "Xét $y = x^3 - 3x \\Rightarrow y' = 3x^2 - 3 = 0 \\Leftrightarrow x = -1$ hoặc $x = 1$. Khi đi qua $x = -1$, $y'$ đổi dấu từ **dương sang âm** nên hàm số đạt **cực đại** tại $x = -1$ với giá trị cực đại $y_{CĐ} = (-1)^3 - 3(-1) = 2$.",
                    "data": {
                        "template": "Hàm số $y = x^3 - 3x$ đạt cực đại tại điểm $x = {{0}}$ và giá trị cực đại là $y_{CĐ} = {{1}}$.",
                        "blanks": [
                            {"accepted": ["-1"]},
                            {"accepted": ["2"]},
                        ],
                        "wordBank": ["-1", "1", "2", "-2", "0"],
                        "useWordBank": True,
                    },
                },
                {
                    "id": "q-t12-5",
                    "type": "drag_order",
                    "prompt": "Kéo thả để sắp xếp đúng thứ tự 4 bước chuẩn khi khảo sát sự biến thiên của một hàm số:",
                    "image": "",
                    "timeLimit": 45,
                    "points": 1000,
                    "explanation": "Luôn nhớ **tập xác định $D$** phải tìm đầu tiên (đặc biệt với hàm phân thức, căn thức, logarit) để không bị lấy nhầm nghiệm ngoại lai khi giải $y' = 0$. Sau đó mới tính đạo hàm, lập bảng biến thiên rồi rút ra kết luận.",
                    "data": {
                        "items": [
                            "Tìm tập xác định $D$ của hàm số",
                            "Tính đạo hàm $y'$ và giải phương trình $y' = 0$",
                            "Xét dấu $y'$ và lập bảng biến thiên",
                            "Kết luận các khoảng đơn điệu và cực trị",
                        ]
                    },
                },
                {
                    "id": "q-t12-6",
                    "type": "drag_match",
                    "prompt": "Kéo thả (hoặc chạm ghép) mỗi hàm số ở cột trái với công thức đạo hàm tương ứng ở cột phải:",
                    "image": "",
                    "timeLimit": 45,
                    "points": 1000,
                    "explanation": "Ôn nhanh 4 công thức đạo hàm nền tảng:\n• $(x^3)' = 3x^2$\n• $(\\sin x)' = \\cos x$ *(còn $(\\cos x)' = -\\sin x$, nhớ dấu trừ!)*\n• $(e^x)' = e^x$ *(hàm duy nhất có đạo hàm bằng chính nó)*\n• $(\\ln x)' = \\dfrac{1}{x}$ với $x > 0$.",
                    "data": {
                        "pairs": [
                            {"left": "$y = x^3$", "right": "$y' = 3x^2$"},
                            {"left": "$y = \\sin x$", "right": "$y' = \\cos x$"},
                            {"left": "$y = e^x$", "right": "$y' = e^x$"},
                            {"left": "$y = \\ln x$", "right": "$y' = \\dfrac{1}{x}$"},
                        ]
                    },
                },
            ],
        },
        {
            "id": "set-khoi-dong-logic",
            "title": "Khởi động lớp học — Tư duy Logic & Kiến thức Tổng hợp",
            "subject": "Hoạt động khởi động",
            "description": "Bộ câu hỏi vui và nhanh giúp cả lớp làm quen cách quét mã QR, kéo thả và trả lời tương tác chỉ trong 5 phút đầu giờ.",
            "createdAt": ts,
            "updatedAt": ts,
            "questions": [
                {
                    "id": "q-kd-1",
                    "type": "mcq",
                    "prompt": "Nếu hôm qua của ngày mai là thứ Tư, thì hôm nay là thứ mấy?",
                    "image": "",
                    "timeLimit": 25,
                    "points": 1000,
                    "explanation": "“Hôm qua của ngày mai” chính là **hôm nay**! Đây là câu đố đánh lừa ngôn từ kinh điển giúp học sinh rèn thói quen đọc kỹ đề bài trước khi vội bấm đáp án.",
                    "data": {
                        "options": ["Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu"],
                        "correctIndex": 1,
                    },
                },
                {
                    "id": "q-kd-2",
                    "type": "true_false",
                    "prompt": "Số $0$ là một số chẵn. Nhận định này Đúng hay Sai?",
                    "image": "",
                    "timeLimit": 20,
                    "points": 1000,
                    "explanation": "**Đúng!** Theo định nghĩa số học, một số nguyên $n$ là số chẵn nếu $n = 2k$ với $k \\in \\mathbb{Z}$. Với $k = 0$ ta có $0 = 2 \\times 0$, nên $0$ hoàn toàn là số chẵn.",
                    "data": {
                        "statements": [{"text": "", "answer": True}]
                    },
                },
                {
                    "id": "q-kd-3",
                    "type": "drag_order",
                    "prompt": "Sắp xếp các giá trị sau theo thứ tự **TĂNG DẦN** (từ nhỏ nhất đến lớn nhất):",
                    "image": "",
                    "timeLimit": 35,
                    "points": 1000,
                    "explanation": "So sánh xấp xỉ: $\\frac{1}{2} = 0{,}5 < \\frac{\\sqrt{2}}{2} \\approx 0{,}707 < 1 < \\sqrt{3} \\approx 1{,}732$.",
                    "data": {
                        "items": [
                            "$\\dfrac{1}{2}$",
                            "$\\dfrac{\\sqrt{2}}{2}$",
                            "$1$",
                            "$\\sqrt{3}$",
                        ]
                    },
                },
                {
                    "id": "q-kd-4",
                    "type": "fill_blank",
                    "prompt": "Hoàn thành định lý Pythagore cho tam giác vuông:",
                    "image": "",
                    "timeLimit": 30,
                    "points": 1000,
                    "explanation": "Trong tam giác vuông có hai cạnh góc vuông $a, b$ và cạnh huyền $c$, bình phương cạnh huyền luôn bằng tổng bình phương hai cạnh góc vuông: $a^2 + b^2 = c^2$.",
                    "data": {
                        "template": "Trong tam giác vuông, bình phương cạnh {{0}} bằng {{1}} bình phương hai cạnh góc vuông.",
                        "blanks": [
                            {"accepted": ["huyền", "huyen"]},
                            {"accepted": ["tổng", "tong"]},
                        ],
                        "wordBank": ["huyền", "đối", "tổng", "hiệu", "tích"],
                        "useWordBank": True,
                    },
                },
            ],
        },
    ]
