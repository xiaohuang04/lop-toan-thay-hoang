/**
 * Built-in Question Bank conforming to Bộ GD&ĐT 2025 THPT Exam Structure:
 * - Part I: Multiple Choice (4 options A, B, C, D) — 0.25 pts/question (12 q = 3.0 pts)
 * - Part II: True / False (4 statements a, b, c, d) — BGD 2025 progressive scoring:
 *     1 right = 0.1 | 2 right = 0.25 | 3 right = 0.5 | 4 right = 1.0 (4 q = 4.0 pts)
 * - Part III: Short Answer (max 4 chars: digits, '-', ',') — 0.5 pts/question (6 q = 3.0 pts)
 */

const CUBIC_GRAPH_SVG = `
<svg width="340" height="230" viewBox="0 0 340 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Đồ thị hàm số bậc ba">
  <defs>
    <marker id="arrowAxis" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155"/>
    </marker>
  </defs>
  <!-- Grid -->
  <g stroke="#e2e8f0" stroke-width="1">
    <line x1="50" y1="20" x2="50" y2="210"/>
    <line x1="110" y1="20" x2="110" y2="210"/>
    <line x1="230" y1="20" x2="230" y2="210"/>
    <line x1="290" y1="20" x2="290" y2="210"/>
    <line x1="30" y1="45" x2="310" y2="45"/>
    <line x1="30" y1="80" x2="310" y2="80"/>
    <line x1="30" y1="115" x2="310" y2="115"/>
    <line x1="30" y1="185" x2="310" y2="185"/>
  </g>
  <!-- Origin at (170, 150), scale: x = 60px/unit, y = 35px/unit -->
  <!-- Axes -->
  <line x1="24" y1="150" x2="318" y2="150" stroke="#334155" stroke-width="1.6" marker-end="url(#arrowAxis)"/>
  <line x1="170" y1="215" x2="170" y2="16" stroke="#334155" stroke-width="1.6" marker-end="url(#arrowAxis)"/>
  <text x="314" y="168" font-size="13" font-style="italic" font-weight="700" fill="#0f172a">x</text>
  <text x="155" y="24" font-size="13" font-style="italic" font-weight="700" fill="#0f172a">y</text>
  <text x="157" y="166" font-size="12" fill="#475569">O</text>

  <!-- Dashed guides for (-1, 3) -> (110, 45) and (1, -1) -> (230, 185) -->
  <g stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4">
    <line x1="110" y1="45" x2="110" y2="150"/>
    <line x1="110" y1="45" x2="170" y2="45"/>
    <line x1="230" y1="185" x2="230" y2="150"/>
    <line x1="230" y1="185" x2="170" y2="185"/>
  </g>

  <!-- Curve y = x^3 - 3x + 1 sampled smoothly -->
  <!-- Points: (-2,-1)->(50,185), (-1.5,2.125)->(80,75.6), (-1,3)->(110,45), (0,1)->(170,115), (1,-1)->(230,185), (1.5,-0.125)->(260,154.4), (2,3)->(290,45) -->
  <path d="M 44 205 C 66 125, 86 45, 110 45 C 138 45, 152 92, 170 115 C 188 138, 202 185, 230 185 C 254 185, 274 115, 296 32"
        fill="none" stroke="#1d4ed8" stroke-width="2.8" stroke-linecap="round"/>

  <!-- Extrema & y-intercept dots -->
  <circle cx="110" cy="45" r="4" fill="#1d4ed8"/>
  <circle cx="230" cy="185" r="4" fill="#1d4ed8"/>
  <circle cx="170" cy="115" r="3.5" fill="#1d4ed8"/>

  <!-- Tick labels -->
  <text x="101" y="167" font-size="12" font-weight="600" fill="#0f172a">-1</text>
  <text x="226" y="143" font-size="12" font-weight="600" fill="#0f172a">1</text>
  <text x="176" y="49" font-size="12" font-weight="600" fill="#0f172a">3</text>
  <text x="176" y="119" font-size="12" font-weight="600" fill="#0f172a">1</text>
  <text x="150" y="189" font-size="12" font-weight="600" fill="#0f172a">-1</text>
</svg>
`;

const STAT_TABLE_P1_Q4 = `
<table class="q-table">
  <thead>
    <tr>
      <th>Thời gian (phút)</th>
      <th>$[30; 60)$</th>
      <th>$[60; 90)$</th>
      <th>$[90; 120)$</th>
      <th>$[120; 150)$</th>
      <th>$[150; 180)$</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Số học sinh</strong></td>
      <td>$6$</td>
      <td>$10$</td>
      <td>$14$</td>
      <td>$7$</td>
      <td>$3$</td>
    </tr>
  </tbody>
</table>
`;

const STAT_TABLE_P3_Q5 = `
<table class="q-table">
  <thead>
    <tr>
      <th>Nhóm điểm</th>
      <th>$[4; 6)$</th>
      <th>$[6; 8)$</th>
      <th>$[8; 10)$</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Số học sinh</strong></td>
      <td>$4$</td>
      <td>$10$</td>
      <td>$6$</td>
    </tr>
  </tbody>
</table>
`;

export const BUILTIN_EXAMS = [
  {
    id: 'bgd-toan-2025-01',
    title: 'Đề mô phỏng Tốt nghiệp THPT 2025 — Môn Toán (Đề số 01)',
    subject: 'Toán học 12',
    code: 'MĐ 101',
    durationMinutes: 90,
    description:
      'Bám sát 100% cấu trúc đề thi tham khảo Bộ GD&ĐT 2025 (Chương trình GDPT 2018): 12 câu nhiều lựa chọn, 4 câu Đúng/Sai tính điểm lũy tiến và 6 câu trả lời ngắn.',
    isBuiltin: true,
    scoring: {
      part1PerQuestion: 0.25,
      part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: 0.5,
    },
    part1: [
      {
        id: 'p1-1',
        topic: 'Nguyên hàm',
        stem: 'Họ nguyên hàm của hàm số $f(x) = 3x^2 + 2x - 1$ là:',
        options: [
          { key: 'A', text: '$x^3 + x^2 - x + C$' },
          { key: 'B', text: '$6x + 2 + C$' },
          { key: 'C', text: '$x^3 + 2x^2 - x + C$' },
          { key: 'D', text: '$3x^3 + x^2 - x + C$' },
        ],
        answer: 'A',
        explanation:
          'Ta có $\\displaystyle \\int (3x^2 + 2x - 1)\\,dx = 3\\cdot\\frac{x^3}{3} + 2\\cdot\\frac{x^2}{2} - x + C = x^3 + x^2 - x + C$.',
      },
      {
        id: 'p1-2',
        topic: 'Phương trình mũ',
        stem: 'Nghiệm của phương trình $2^{x-1} = 8$ là:',
        options: [
          { key: 'A', text: '$x = 2$' },
          { key: 'B', text: '$x = 3$' },
          { key: 'C', text: '$x = 4$' },
          { key: 'D', text: '$x = 5$' },
        ],
        answer: 'C',
        explanation:
          'Phương trình tương đương $2^{x-1} = 2^3 \\Leftrightarrow x - 1 = 3 \\Leftrightarrow x = 4$.',
      },
      {
        id: 'p1-3',
        topic: 'Hình học Oxyz',
        stem: 'Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - y + 3z - 5 = 0$. Vectơ nào dưới đây là một vectơ pháp tuyến của $(P)$?',
        options: [
          { key: 'A', text: '$\\vec{n}_1 = (2; 1; 3)$' },
          { key: 'B', text: '$\\vec{n}_2 = (2; -1; 3)$' },
          { key: 'C', text: '$\\vec{n}_3 = (-1; 3; -5)$' },
          { key: 'D', text: '$\\vec{n}_4 = (2; -1; -5)$' },
        ],
        answer: 'B',
        explanation:
          'Mặt phẳng $Ax + By + Cz + D = 0$ có vectơ pháp tuyến $\\vec{n} = (A; B; C)$. Do đó $(P)$ có $\\vec{n} = (2; -1; 3)$.',
      },
      {
        id: 'p1-4',
        topic: 'Thống kê ghép nhóm',
        stem: 'Thời gian tự học mỗi ngày (đơn vị: phút) của $40$ học sinh lớp 12A được thống kê như bảng dưới đây. Khoảng biến thiên của mẫu số liệu ghép nhóm này bằng:',
        figureHtml: STAT_TABLE_P1_Q4,
        options: [
          { key: 'A', text: '$120$' },
          { key: 'B', text: '$150$' },
          { key: 'C', text: '$30$' },
          { key: 'D', text: '$180$' },
        ],
        answer: 'B',
        explanation:
          'Khoảng biến thiên của mẫu số liệu ghép nhóm là $R = u_{m+1} - u_1 = 180 - 30 = 150$ (phút).',
      },
      {
        id: 'p1-5',
        topic: 'Đường tiệm cận',
        stem: 'Tiệm cận đứng của đồ thị hàm số $y = \\dfrac{2x - 1}{x + 3}$ là đường thẳng có phương trình:',
        options: [
          { key: 'A', text: '$x = 2$' },
          { key: 'B', text: '$y = 2$' },
          { key: 'C', text: '$x = 3$' },
          { key: 'D', text: '$x = -3$' },
        ],
        answer: 'D',
        explanation:
          'Vì $\\lim_{x \\to (-3)^+} \\frac{2x-1}{x+3} = -\\infty$ nên đường thẳng $x = -3$ là tiệm cận đứng của đồ thị hàm số.',
      },
      {
        id: 'p1-6',
        topic: 'Cấp số cộng',
        stem: 'Cho cấp số cộng $(u_n)$ có số hạng đầu $u_1 = 3$ và công sai $d = 4$. Giá trị của $u_5$ bằng:',
        options: [
          { key: 'A', text: '$19$' },
          { key: 'B', text: '$23$' },
          { key: 'C', text: '$15$' },
          { key: 'D', text: '$12$' },
        ],
        answer: 'A',
        explanation: 'Áp dụng công thức $u_n = u_1 + (n - 1)d$, ta có $u_5 = 3 + 4 \\cdot 4 = 19$.',
      },
      {
        id: 'p1-7',
        topic: 'Bất phương trình logarit',
        stem: 'Tập nghiệm của bất phương trình $\\log_2(x - 1) < 3$ là:',
        options: [
          { key: 'A', text: '$(-\\infty; 9)$' },
          { key: 'B', text: '$(1; 9)$' },
          { key: 'C', text: '$(1; 7)$' },
          { key: 'D', text: '$(9; +\\infty)$' },
        ],
        answer: 'B',
        explanation:
          'Điều kiện $x > 1$. Bất phương trình tương đương $x - 1 < 2^3 = 8 \\Leftrightarrow x < 9$. Kết hợp điều kiện thu được $S = (1; 9)$.',
      },
      {
        id: 'p1-8',
        topic: 'Tích phân',
        stem: 'Cho $\\displaystyle \\int_1^3 f(x)\\,dx = 5$ và $\\displaystyle \\int_1^3 g(x)\\,dx = -2$. Giá trị của $\\displaystyle \\int_1^3 \\big[2f(x) - g(x)\\big]\\,dx$ bằng:',
        options: [
          { key: 'A', text: '$8$' },
          { key: 'B', text: '$12$' },
          { key: 'C', text: '$7$' },
          { key: 'D', text: '$3$' },
        ],
        answer: 'B',
        explanation:
          'Ta có $\\int_1^3 [2f(x) - g(x)]\\,dx = 2\\int_1^3 f(x)\\,dx - \\int_1^3 g(x)\\,dx = 2\\cdot 5 - (-2) = 12$.',
      },
      {
        id: 'p1-9',
        topic: 'Đọc đồ thị hàm số',
        stem: 'Cho hàm số bậc ba $y = f(x)$ có đồ thị như hình vẽ bên dưới. Hàm số đã cho nghịch biến trên khoảng nào dưới đây?',
        figureHtml: CUBIC_GRAPH_SVG,
        options: [
          { key: 'A', text: '$(-\\infty; -1)$' },
          { key: 'B', text: '$(1; +\\infty)$' },
          { key: 'C', text: '$(-1; 1)$' },
          { key: 'D', text: '$(-1; 3)$' },
        ],
        answer: 'C',
        explanation:
          'Quan sát đồ thị từ trái sang phải, đồ thị đi xuống trên khoảng $(-1; 1)$ nên hàm số nghịch biến trên $(-1; 1)$.',
      },
      {
        id: 'p1-10',
        topic: 'Mặt cầu Oxyz',
        stem: 'Trong không gian $Oxyz$, mặt cầu $(S): (x - 1)^2 + (y + 2)^2 + (z - 3)^2 = 16$ có tâm $I$ và bán kính $R$ là:',
        options: [
          { key: 'A', text: '$I(-1; 2; -3),\\, R = 4$' },
          { key: 'B', text: '$I(1; -2; 3),\\, R = 16$' },
          { key: 'C', text: '$I(1; -2; 3),\\, R = 4$' },
          { key: 'D', text: '$I(-1; 2; -3),\\, R = 16$' },
        ],
        answer: 'C',
        explanation:
          'Mặt cầu $(x - a)^2 + (y - b)^2 + (z - c)^2 = R^2$ có tâm $I(1; -2; 3)$ và bán kính $R = \\sqrt{16} = 4$.',
      },
      {
        id: 'p1-11',
        topic: 'Thể tích khối chóp',
        stem: 'Cho khối chóp $S.ABCD$ có đáy $ABCD$ là hình vuông cạnh $3$, cạnh bên $SA$ vuông góc với mặt phẳng đáy và $SA = 4$. Thể tích của khối chóp $S.ABCD$ bằng:',
        options: [
          { key: 'A', text: '$36$' },
          { key: 'B', text: '$12$' },
          { key: 'C', text: '$18$' },
          { key: 'D', text: '$6$' },
        ],
        answer: 'B',
        explanation:
          'Ta có $V = \\dfrac{1}{3} S_{ABCD} \\cdot SA = \\dfrac{1}{3} \\cdot 3^2 \\cdot 4 = 12$.',
      },
      {
        id: 'p1-12',
        topic: 'Xác suất có điều kiện',
        stem: 'Cho hai biến cố $A$ và $B$ với $P(A) = 0{,}6$, $P(B) = 0{,}5$ và $P(A \\cap B) = 0{,}3$. Xác suất có điều kiện $P(A \\mid B)$ bằng:',
        options: [
          { key: 'A', text: '$0{,}5$' },
          { key: 'B', text: '$0{,}3$' },
          { key: 'C', text: '$0{,}6$' },
          { key: 'D', text: '$0{,}8$' },
        ],
        answer: 'C',
        explanation:
          'Áp dụng công thức xác suất có điều kiện: $P(A \\mid B) = \\dfrac{P(A \\cap B)}{P(B)} = \\dfrac{0{,}3}{0{,}5} = 0{,}6$.',
      },
    ],
    part2: [
      {
        id: 'p2-1',
        topic: 'Khảo sát hàm phân thức',
        stem: 'Cho hàm số $f(x) = \\dfrac{x^2 - 2x + 2}{x - 1}$. Xét tính đúng sai của các khẳng định sau:',
        statements: [
          { key: 'a', text: 'Tập xác định của hàm số là $\\mathbb{R} \\setminus \\{1\\}$.', answer: true },
          { key: 'b', text: 'Đạo hàm của hàm số là $f\'(x) = \\dfrac{x^2 - 2x}{(x - 1)^2}$ với mọi $x \\neq 1$.', answer: true },
          { key: 'c', text: 'Đường thẳng $y = x + 1$ là đường tiệm cận xiên của đồ thị hàm số.', answer: false },
          { key: 'd', text: 'Giá trị nhỏ nhất của hàm số trên khoảng $(1; +\\infty)$ bằng $2$.', answer: true },
        ],
        explanation:
          'Viết lại $f(x) = x - 1 + \\dfrac{1}{x - 1}$.<br/>• <strong>a) Đúng</strong> vì mẫu $x - 1 \\neq 0 \\Leftrightarrow x \\neq 1$.<br/>• <strong>b) Đúng</strong> vì $f\'(x) = 1 - \\dfrac{1}{(x-1)^2} = \\dfrac{x^2 - 2x}{(x-1)^2}$.<br/>• <strong>c) Sai</strong> vì đường tiệm cận xiên là $y = x - 1$ (không phải $y = x + 1$).<br/>• <strong>d) Đúng</strong> vì với $x > 1$, theo bất đẳng thức AM-GM: $(x - 1) + \\dfrac{1}{x - 1} \\ge 2$, dấu bằng đạt tại $x = 2$.',
      },
      {
        id: 'p2-2',
        topic: 'Ứng dụng tích phân',
        stem: 'Một ô tô đang chạy với vận tốc $20\\text{ m/s}$ thì người lái đạp phanh. Từ thời điểm đó (tính là $t = 0$), ô tô chuyển động chậm dần đều với vận tốc $v(t) = -4t + 20\\text{ (m/s)}$, trong đó $t$ tính bằng giây, cho đến khi dừng hẳn.',
        statements: [
          { key: 'a', text: 'Kể từ lúc đạp phanh, sau $5$ giây thì ô tô dừng hẳn.', answer: true },
          { key: 'b', text: 'Quãng đường ô tô đi được trong $2$ giây đầu kể từ lúc đạp phanh là $36\\text{ m}$.', answer: false },
          { key: 'c', text: 'Tổng quãng đường ô tô đi được từ lúc đạp phanh đến khi dừng hẳn là $50\\text{ m}$.', answer: true },
          { key: 'd', text: 'Nếu phía trước cách vị trí đạp phanh $48\\text{ m}$ có một chướng ngại vật cố định thì ô tô dừng lại kịp thời mà không va chạm.', answer: false },
        ],
        explanation:
          '• <strong>a) Đúng</strong>: Ô tô dừng khi $v(t) = 0 \\Leftrightarrow -4t + 20 = 0 \\Leftrightarrow t = 5\\text{ s}$.<br/>• <strong>b) Sai</strong>: $S_2 = \\int_0^2 (-4t + 20)\\,dt = [-2t^2 + 20t]_0^2 = -8 + 40 = 32\\text{ m} \\neq 36\\text{ m}$.<br/>• <strong>c) Đúng</strong>: $S = \\int_0^5 (-4t + 20)\\,dt = [-2t^2 + 20t]_0^5 = -50 + 100 = 50\\text{ m}$.<br/>• <strong>d) Sai</strong>: Vì $50\\text{ m} > 48\\text{ m}$ nên ô tô không kịp dừng trước chướng ngại vật.',
      },
      {
        id: 'p2-3',
        topic: 'Mô hình hóa Oxyz',
        stem: 'Trong không gian với hệ trục tọa độ $Oxyz$ (đơn vị trên mỗi trục là mét), một máy bay không người lái (drone) cất cánh từ điểm $A(1; 2; 0)$ và bay thẳng đều đến điểm $B(5; -2; 8)$ trong thời gian $4$ giây.',
        statements: [
          { key: 'a', text: 'Vectơ $\\overrightarrow{AB} = (4; -4; 8)$.', answer: true },
          { key: 'b', text: 'Quãng đường bay từ $A$ đến $B$ bằng $4\\sqrt{6}\\text{ m}$.', answer: true },
          { key: 'c', text: 'Sau $2$ giây kể từ lúc cất cánh, drone ở vị trí có tọa độ $(3; 0; 4)$.', answer: true },
          { key: 'd', text: 'Phương trình chính tắc của đường thẳng $AB$ là $\\dfrac{x - 1}{1} = \\dfrac{y - 2}{1} = \\dfrac{z}{2}$.', answer: false },
        ],
        explanation:
          '• <strong>a) Đúng</strong>: $\\overrightarrow{AB} = (5-1; -2-2; 8-0) = (4; -4; 8)$.<br/>• <strong>b) Đúng</strong>: $AB = \\sqrt{4^2 + (-4)^2 + 8^2} = \\sqrt{96} = 4\\sqrt{6}\\text{ m}$.<br/>• <strong>c) Đúng</strong>: Vì bay thẳng đều hết $4\\text{ s}$, sau $2\\text{ s}$ drone ở trung điểm $M$ của $AB$: $M\\left(\\frac{1+5}{2}; \\frac{2-2}{2}; \\frac{0+8}{2}\\right) = (3; 0; 4)$.<br/>• <strong>d) Sai</strong>: Vectơ chỉ phương rút gọn là $\\vec{u} = (1; -1; 2)$, do đó mẫu số ở $y - 2$ phải là $-1$.',
      },
      {
        id: 'p2-4',
        topic: 'Công thức Bayes',
        stem: 'Một nhà máy có hai dây chuyền sản xuất bóng đèn. Dây chuyền I sản xuất $60\\%$ tổng sản lượng với tỉ lệ phế phẩm là $2\\%$. Dây chuyền II sản xuất $40\\%$ tổng sản lượng với tỉ lệ phế phẩm là $5\\%$. Chọn ngẫu nhiên một bóng đèn từ kho. Gọi $A$ là biến cố "bóng đèn do dây chuyền I sản xuất" và $B$ là biến cố "bóng đèn là phế phẩm".',
        statements: [
          { key: 'a', text: '$P(A) = 0{,}6$ và $P(B \\mid A) = 0{,}02$.', answer: true },
          { key: 'b', text: 'Xác suất để bóng đèn được chọn là phế phẩm bằng $0{,}035$.', answer: false },
          { key: 'c', text: 'Xác suất để bóng đèn được chọn đạt chuẩn (không phải phế phẩm) bằng $0{,}968$.', answer: true },
          { key: 'd', text: 'Biết rằng bóng đèn được chọn là phế phẩm, xác suất để bóng đèn đó do dây chuyền I sản xuất bằng $0{,}375$.', answer: true },
        ],
        explanation:
          '• <strong>a) Đúng</strong> theo giả thiết đề bài.<br/>• <strong>b) Sai</strong>: Theo công thức xác suất toàn phần, $P(B) = 0{,}6 \\cdot 0{,}02 + 0{,}4 \\cdot 0{,}05 = 0{,}012 + 0{,}020 = 0{,}032$.<br/>• <strong>c) Đúng</strong>: $P(\\overline{B}) = 1 - P(B) = 1 - 0{,}032 = 0{,}968$.<br/>• <strong>d) Đúng</strong>: Theo công thức Bayes, $P(A \\mid B) = \\dfrac{0{,}6 \\cdot 0{,}02}{0{,}032} = \\dfrac{12}{32} = 0{,}375$.',
      },
    ],
    part3: [
      {
        id: 'p3-1',
        topic: 'Bài toán tối ưu',
        stem: 'Từ một tấm tôn hình vuông cạnh $12\\text{ cm}$, người ta cắt bỏ ở bốn góc bốn hình vuông bằng nhau có cạnh $x\\text{ (cm)}$ rồi gập lên thành một chiếc hộp không nắp. Tìm giá trị của $x$ (đơn vị: cm) để thể tích chiếc hộp đạt lớn nhất.',
        answer: '2',
        explanation:
          'Điều kiện $0 < x < 6$. Thể tích hộp là $V(x) = x(12 - 2x)^2 = 4x^3 - 48x^2 + 144x$. Đạo hàm $V\'(x) = 12(x^2 - 8x + 12) = 0 \\Leftrightarrow x = 2$ (nhận) hoặc $x = 6$ (loại). Lập bảng biến thiên thấy $V(x)$ đạt cực đại tại $x = 2$.',
      },
      {
        id: 'p3-2',
        topic: 'Diện tích hình phẳng',
        stem: 'Tính diện tích hình phẳng giới hạn bởi đồ thị hai hàm số $y = x^2 - 2x$ và $y = x$ (kết quả viết dưới dạng số thập phân).',
        answer: '4,5',
        explanation:
          'Hoành độ giao điểm: $x^2 - 2x = x \\Leftrightarrow x = 0$ hoặc $x = 3$. Diện tích $S = \\displaystyle \\int_0^3 |x - (x^2 - 2x)|\\,dx = \\int_0^3 (3x - x^2)\\,dx = \\left[\\frac{3}{2}x^2 - \\frac{x^3}{3}\\right]_0^3 = \\frac{27}{2} - 9 = 4{,}5$.',
      },
      {
        id: 'p3-3',
        topic: 'Khoảng cách không gian',
        stem: 'Cho hình chóp $S.ABC$ có đáy $ABC$ là tam giác vuông tại $B$, $AB = 3$, $BC = 4$, cạnh bên $SA$ vuông góc với mặt phẳng đáy và $SA = 6$. Tính khoảng cách từ điểm $B$ đến mặt phẳng $(SAC)$ (kết quả viết dưới dạng số thập phân).',
        answer: '2,4',
        explanation:
          'Vì $SA \\perp (ABC)$ nên $(SAC) \\perp (ABC)$ theo giao tuyến $AC$. Trong $\\triangle ABC$ vuông tại $B$, kẻ đường cao $BH \\perp AC \\Rightarrow BH \\perp (SAC)$. Vậy $d(B, (SAC)) = BH = \\dfrac{AB \\cdot BC}{\\sqrt{AB^2 + BC^2}} = \\dfrac{3 \\cdot 4}{5} = 2{,}4$.',
      },
      {
        id: 'p3-4',
        topic: 'Giao điểm Oxyz',
        stem: 'Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - y + 2z - 9 = 0$ và đường thẳng $d: \\dfrac{x - 1}{1} = \\dfrac{y + 2}{2} = \\dfrac{z - 1}{-1}$. Biết đường thẳng $d$ cắt mặt phẳng $(P)$ tại điểm $I(a; b; c)$. Tính giá trị biểu thức $T = a + b + c$.',
        answer: '-3',
        explanation:
          'Tham số hóa $I(1 + t; -2 + 2t; 1 - t) \\in d$. Thay vào $(P)$: $2(1 + t) - (-2 + 2t) + 2(1 - t) - 9 = 0 \\Leftrightarrow -2t - 3 = 0 \\Leftrightarrow t = -1{,}5$. Suy ra $I(-0{,}5; -5; 2{,}5)$ nên $T = -0{,}5 - 5 + 2{,}5 = -3$.',
      },
      {
        id: 'p3-5',
        topic: 'Trung vị ghép nhóm',
        stem: 'Khảo sát điểm kiểm tra (thang điểm $10$) của $20$ học sinh thu được bảng tần số ghép nhóm dưới đây. Tính trung vị $M_e$ của mẫu số liệu ghép nhóm trên (viết dưới dạng số thập phân).',
        figureHtml: STAT_TABLE_P3_Q5,
        answer: '7,2',
        explanation:
          'Cỡ mẫu $n = 20 \\Rightarrow \\dfrac{n}{2} = 10$. Tần số tích lũy nhóm $[4; 6)$ là $4$, nhóm $[6; 8)$ là $14$, nên nhóm chứa trung vị là $[6; 8)$. Ta có $M_e = 6 + \\dfrac{10 - 4}{10} \\cdot (8 - 6) = 6 + 1{,}2 = 7{,}2$.',
      },
      {
        id: 'p3-6',
        topic: 'Xác suất cổ điển',
        stem: 'Một hộp có $5$ viên bi đỏ và $4$ viên bi xanh cùng kích thước và khối lượng. Lấy ngẫu nhiên đồng thời $3$ viên bi từ hộp. Tính xác suất để trong $3$ viên bi lấy ra có đúng $2$ viên bi đỏ (làm tròn kết quả đến hàng phần trăm).',
        answer: '0,48',
        explanation:
          'Số phần tử không gian mẫu $n(\\Omega) = C_9^3 = 84$. Số cách lấy đúng $2$ bi đỏ và $1$ bi xanh là $C_5^2 \\cdot C_4^1 = 10 \\cdot 4 = 40$. Xác suất $P = \\dfrac{40}{84} = \\dfrac{10}{21} \\approx 0{,}48$.',
      },
    ],
  },
  {
    id: 'bgd-mini-demo-02',
    title: 'Đề luyện nhanh Chuẩn BGD 2025 (6 câu — Trải nghiệm nhanh)',
    subject: 'Toán học 12',
    code: 'DEMO 02',
    durationMinutes: 15,
    description:
      'Phiên bản rút gọn gồm đầy đủ 3 dạng câu hỏi (2 câu Phần I + 2 câu Phần II + 2 câu Phần III) để thầy/cô hoặc học sinh kiểm thử nhanh giao diện, cách chấm điểm và xem lời giải.',
    isBuiltin: true,
    scoring: {
      part1PerQuestion: 1.5,
      part2Progressive: [0, 0.2, 0.5, 1.0, 2.0],
      part3PerQuestion: 1.5,
    },
    part1: [
      {
        id: 'm1-1',
        topic: 'Đạo hàm',
        stem: 'Đạo hàm của hàm số $y = e^{2x}$ là:',
        options: [
          { key: 'A', text: '$y\' = e^{2x}$' },
          { key: 'B', text: '$y\' = 2e^{2x}$' },
          { key: 'C', text: '$y\' = 2xe^{2x-1}$' },
          { key: 'D', text: '$y\' = \\dfrac{1}{2}e^{2x}$' },
        ],
        answer: 'B',
        explanation: 'Áp dụng công thức $(e^u)\' = u\'\\cdot e^u$, ta có $(e^{2x})\' = 2e^{2x}$.',
      },
      {
        id: 'm1-2',
        topic: 'Tích phân cơ bản',
        stem: 'Giá trị của tích phân $I = \\displaystyle \\int_0^2 3x^2\\,dx$ bằng:',
        options: [
          { key: 'A', text: '$6$' },
          { key: 'B', text: '$12$' },
          { key: 'C', text: '$8$' },
          { key: 'D', text: '$4$' },
        ],
        answer: 'C',
        explanation: 'Ta có $I = \\big[x^3\\big]_0^2 = 2^3 - 0^3 = 8$.',
      },
    ],
    part2: [
      {
        id: 'm2-1',
        topic: 'Hàm số bậc ba',
        stem: 'Cho hàm số $y = x^3 - 3x + 2$. Xét các mệnh đề sau:',
        statements: [
          { key: 'a', text: 'Đạo hàm của hàm số là $y\' = 3x^2 - 3$.', answer: true },
          { key: 'b', text: 'Hàm số đạt cực đại tại $x = 1$.', answer: false },
          { key: 'c', text: 'Giá trị cực tiểu của hàm số bằng $0$.', answer: true },
          { key: 'd', text: 'Đồ thị hàm số cắt trục tung tại điểm có tung độ bằng $2$.', answer: true },
        ],
        explanation:
          '$y\' = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. Hàm số đạt cực đại tại $x = -1$ ($y_{\\text{CĐ}} = 4$) và đạt cực tiểu tại $x = 1$ ($y_{\\text{CT}} = 0$). Tại $x = 0$ thì $y = 2$.',
      },
      {
        id: 'm2-2',
        topic: 'Vectơ Oxyz',
        stem: 'Trong không gian $Oxyz$, cho hai vectơ $\\vec{a} = (1; -2; 2)$ và $\\vec{b} = (2; 1; 0)$.',
        statements: [
          { key: 'a', text: 'Độ dài vectơ $|\\vec{a}| = 3$.', answer: true },
          { key: 'b', text: 'Tích vô hướng $\\vec{a} \\cdot \\vec{b} = 0$.', answer: true },
          { key: 'c', text: 'Hai vectơ $\\vec{a}$ và $\\vec{b}$ cùng phương.', answer: false },
          { key: 'd', text: 'Tọa độ vectơ $\\vec{a} + \\vec{b} = (3; -1; 2)$.', answer: true },
        ],
        explanation:
          '$|\\vec{a}| = \\sqrt{1 + 4 + 4} = 3$; $\\vec{a} \\cdot \\vec{b} = 1\\cdot 2 + (-2)\\cdot 1 + 2\\cdot 0 = 0$ nên $\\vec{a} \\perp \\vec{b}$ (không cùng phương); $\\vec{a} + \\vec{b} = (3; -1; 2)$.',
      },
    ],
    part3: [
      {
        id: 'm3-1',
        topic: 'Logarit',
        stem: 'Tính giá trị của biểu thức $P = \\log_2 8 + \\log_3 9$.',
        answer: '5',
        explanation: '$P = \\log_2(2^3) + \\log_3(3^2) = 3 + 2 = 5$.',
      },
      {
        id: 'm3-2',
        topic: 'Phương trình bậc hai',
        stem: 'Tìm nghiệm dương của phương trình $x^2 - 2x - 3 = 0$? Thay vào đó, tính trung bình cộng hai nghiệm của phương trình $2x^2 - 5x + 1 = 0$ (viết dạng số thập phân).',
        answer: '1,25',
        explanation: 'Theo định lí Vi-ét, tổng hai nghiệm $x_1 + x_2 = \\dfrac{5}{2} = 2{,}5$. Trung bình cộng hai nghiệm là $\\dfrac{x_1 + x_2}{2} = 1{,}25$.',
      },
    ],
  },
];

// Clean up m3-2 stem phrasing directly
BUILTIN_EXAMS[1].part3[1].stem =
  'Tính trung bình cộng hai nghiệm của phương trình $2x^2 - 5x + 1 = 0$ (kết quả viết dưới dạng số thập phân).';

export function getSampleJsonTemplate() {
  return {
    id: 'de-tu-soan-2025',
    title: 'Đề kiểm tra thử chuẩn BGD 2025 — Tự soạn',
    subject: 'Toán học / Vật lí / Hóa học...',
    code: 'MĐ 205',
    durationMinutes: 45,
    description: 'Mẫu file JSON chuẩn để giáo viên nạp ngân hàng đề 3 dạng câu hỏi BGD 2025 vào hệ thống.',
    scoring: {
      part1PerQuestion: 0.25,
      part2Progressive: [0, 0.1, 0.25, 0.5, 1.0],
      part3PerQuestion: 0.5,
    },
    part1: [
      {
        id: 'q1',
        topic: 'Chủ đề 1',
        stem: 'Giá trị của biểu thức $\\sin^2 30^\\circ + \\cos^2 30^\\circ$ bằng:',
        options: [
          { key: 'A', text: '$0$' },
          { key: 'B', text: '$1$' },
          { key: 'C', text: '$2$' },
          { key: 'D', text: '$\\dfrac{1}{2}$' },
        ],
        answer: 'B',
        explanation: 'Với mọi góc $\\alpha$, ta luôn có $\\sin^2\\alpha + \\cos^2\\alpha = 1$.',
      },
    ],
    part2: [
      {
        id: 'q2',
        topic: 'Chủ đề 2',
        stem: 'Cho hàm số $y = x^2 - 4x + 3$. Xét các khẳng định sau:',
        statements: [
          { key: 'a', text: 'Đồ thị là một parabol có bề lõm hướng lên trên.', answer: true },
          { key: 'b', text: 'Đỉnh của parabol là $I(2; -1)$.', answer: true },
          { key: 'c', text: 'Hàm số đồng biến trên $(-\\infty; 2)$.', answer: false },
          { key: 'd', text: 'Phương trình $y = 0$ có hai nghiệm phân biệt $x = 1$ và $x = 3$.', answer: true },
        ],
        explanation: 'Hệ số $a = 1 > 0$, đỉnh $I(2; -1)$, đồng biến trên $(2; +\\infty)$, hai nghiệm $1$ và $3$.',
      },
    ],
    part3: [
      {
        id: 'q3',
        topic: 'Chủ đề 3',
        stem: 'Tính diện tích tam giác vuông có hai cạnh góc vuông bằng $3$ và $5$ (viết dưới dạng số thập phân).',
        answer: '7,5',
        explanation: '$S = \\dfrac{1}{2} \\cdot 3 \\cdot 5 = 7{,}5$.',
      },
    ],
  };
}
