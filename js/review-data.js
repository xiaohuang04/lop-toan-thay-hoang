/**
 * Data-Driven High School Math Review Curriculum (Khối 10 - 11 - 12)
 * Follows the exact schema in PRD Section 5.1 (`chapterData`):
 * - Easy for teachers to add new chapters/lessons without touching HTML/CSS.
 * - Supports `[CHE: ...]` Active Recall masks (including nested brackets inside LaTeX).
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randNonZero(min, max) {
  let val = 0;
  while (val === 0) {
    val = randInt(min, max);
  }
  return val;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtSignedConst(b) {
  return b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
}

function fmtParenNeg(x) {
  return x < 0 ? `(${x})` : `${x}`;
}

export const DEFAULT_BOX_PRESETS = [
  {
    id: 'theory',
    name: 'Định nghĩa / Lý thuyết',
    accent: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: 'book',
    style: 'editorial',
    builtin: true,
  },
  {
    id: 'theorem',
    name: 'Định lí / Tính chất',
    accent: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    icon: 'award',
    style: 'tinted',
    builtin: true,
  },
  {
    id: 'formula',
    name: 'Công thức cốt lõi',
    accent: '#db2777',
    bg: '#fdf2f8',
    border: '#fbcfe8',
    icon: 'sigma',
    style: 'editorial',
    builtin: true,
  },
  {
    id: 'method',
    name: 'Phương pháp giải',
    accent: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
    icon: 'compass',
    style: 'tinted',
    builtin: true,
  },
  {
    id: 'warning',
    name: 'Lưu ý / Mẹo nhanh',
    accent: '#ea580c',
    bg: '#fff7ed',
    border: '#fed7aa',
    icon: 'bulb',
    style: 'editorial',
    builtin: true,
  },
  {
    id: 'note',
    name: 'Nhận xét / Ví dụ nhanh',
    accent: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    icon: 'check',
    style: 'outlined',
    builtin: true,
  },
];

const BUILTIN_TOAN11_C2_LESSONS = [
          // ===================================================================
          // BÀI 1: DÃY SỐ
          // ===================================================================
          {
            id: 'toan11-c2-b1',
            code: 'Bài 5',
            title: 'Dãy số',
            summary: 'Khái niệm dãy số, cách cho dãy số, xét tính tăng giảm và tính bị chặn của dãy số.',
            coreCards: [
              {
                id: 'b1-card-1',
                type: 'theory',
                title: 'Khái niệm & Cách cho dãy số',
                items: [
                  {
                    id: 'b1-c1-i1',
                    html: '<strong>Dãy số vô hạn $(u_n)$:</strong> Hàm số xác định trên $\\mathbb{N}^*$, viết dạng khai triển $u_1, u_2, \\dots, u_n, \\dots$ (với $u_1$ là số hạng đầu, $u_n$ là số hạng tổng quát).',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ về Khai triển dãy số',
                      problem: 'Cho dãy số $(u_n)$ có số hạng tổng quát $u_n = 2n + 1$. Tìm $3$ số hạng đầu và số hạng thứ $10$ của dãy.',
                      solution: 'Lần lượt thay $n = 1; 2; 3; 10$ vào công thức:<br/>• $u_1 = 3$, $u_2 = 5$, $u_3 = 7$.<br/>• Số hạng thứ $10$: $u_{10} = 2 \\cdot 10 + 1 = \\mathbf{21}$.',
                    },
                  },
                  {
                    id: 'b1-c1-i2',
                    html: `<strong>4 cách cho một dãy số:</strong>
                      <div class="rv-chip-list">
                        <span class="rv-chip-item"><span class="rv-chip-num">1</span>Liệt kê các số hạng</span>
                        <span class="rv-chip-item"><span class="rv-chip-num">2</span>Diễn đạt bằng lời</span>
                        <span class="rv-chip-item"><span class="rv-chip-num">3</span>Công thức $u_n = f(n)$</span>
                        <span class="rv-chip-item"><span class="rv-chip-num">4</span>Hệ thức truy hồi</span>
                      </div>`,
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Dãy số cho bằng hệ thức truy hồi',
                      problem: 'Cho dãy số $(u_n)$ xác định bởi $u_1 = 2$ và $u_{n+1} = 2u_n + 1$ ($\\forall n \\ge 1$). Tính $u_2, u_3, u_4$.',
                      solution: 'Tính nối tiếp từng số hạng từ $u_1 = 2$:<br/>• $u_2 = 2u_1 + 1 = 2 \\cdot 2 + 1 = \\mathbf{5}$.<br/>• $u_3 = 2u_2 + 1 = 2 \\cdot 5 + 1 = \\mathbf{11}$.<br/>• $u_4 = 2u_3 + 1 = 2 \\cdot 11 + 1 = \\mathbf{23}$.',
                    },
                  },
                ],
              },
              {
                id: 'b1-card-2',
                type: 'formula',
                title: 'Tính tăng, giảm (Đơn điệu)',
                items: [
                  {
                    id: 'b1-c2-i1',
                    html: '<strong>Dãy tăng</strong> ($\\forall n \\in \\mathbb{N}^*$): [CHE: $u_{n+1} > u_n$] $\\iff$ [CHE: $u_{n+1} - u_n > 0$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Chứng minh dãy tăng bằng xét hiệu',
                      problem: 'Xét tính tăng, giảm của dãy số $(u_n)$ với $u_n = 3n - 1$.',
                      solution: 'Xét hiệu $u_{n+1} - u_n = [3(n + 1) - 1] - (3n - 1) = \\mathbf{3} > 0$ ($\\forall n \\in \\mathbb{N}^*$).<br/>Vậy $(u_n)$ là <strong>dãy số tăng</strong>.',
                    },
                  },
                  {
                    id: 'b1-c2-i2',
                    html: '<strong>Dãy giảm</strong> ($\\forall n \\in \\mathbb{N}^*$): [CHE: $u_{n+1} < u_n$] $\\iff$ [CHE: $u_{n+1} - u_n < 0$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Chứng minh dãy giảm bằng xét hiệu',
                      problem: 'Xét tính tăng, giảm của dãy số $(u_n)$ với $u_n = \\dfrac{1}{n + 1}$.',
                      solution: 'Xét hiệu:<br/>$$u_{n+1} - u_n = \\frac{1}{n + 2} - \\frac{1}{n + 1} = \\frac{-1}{(n + 1)(n + 2)} < 0 \\quad (\\forall n \\in \\mathbb{N}^*)$$Vậy $(u_n)$ là <strong>dãy số giảm</strong>.',
                    },
                  },
                  {
                    id: 'b1-c2-i3',
                    html: `<strong>Xét tỉ số</strong> (chỉ khi [CHE: $u_n > 0, \\forall n \\in \\mathbb{N}^*$]):
                      <div class="rv-case-row">
                        <span class="rv-case-pill is-up">Dãy tăng $\\iff$ [CHE: $\\dfrac{u_{n+1}}{u_n} > 1$]</span>
                        <span class="rv-case-pill is-down">Dãy giảm $\\iff$ [CHE: $\\dfrac{u_{n+1}}{u_n} < 1$]</span>
                      </div>`,
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Xét tính đơn điệu bằng tỉ số',
                      problem: 'Xét tính tăng, giảm của dãy số $(u_n)$ với $u_n = \\dfrac{3^n}{n + 1}$ ($n \\in \\mathbb{N}^*$).',
                      solution: 'Vì $u_n > 0$ với mọi $n \\in \\mathbb{N}^*$, lập tỉ số:<br/>$$\\frac{u_{n+1}}{u_n} = \\frac{3^{n+1}}{n + 2} \\cdot \\frac{n + 1}{3^n} = \\frac{3n + 3}{n + 2} = 1 + \\frac{2n + 1}{n + 2} > 1$$Vậy $(u_n)$ là <strong>dãy số tăng</strong>.',
                    },
                  },
                ],
              },
              {
                id: 'b1-card-3',
                type: 'formula',
                title: 'Dãy số bị chặn',
                items: [
                  {
                    id: 'b1-c3-i1',
                    html: '<strong>Bị chặn trên:</strong> $\\exists M$ sao cho [CHE: $u_n \\le M, \\forall n \\in \\mathbb{N}^*$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Dãy bị chặn trên',
                      problem: 'Chứng minh dãy số $u_n = 5 - 2n$ ($n \\in \\mathbb{N}^*$) bị chặn trên.',
                      solution: 'Vì $n \\ge 1$ nên $-2n \\le -2$, suy ra $u_n = 5 - 2n \\le \\mathbf{3}$ với mọi $n \\in \\mathbb{N}^*$.<br/>Vậy dãy bị chặn trên bởi $M = \\mathbf{3}$.',
                    },
                  },
                  {
                    id: 'b1-c3-i2',
                    html: '<strong>Bị chặn dưới:</strong> $\\exists m$ sao cho [CHE: $u_n \\ge m, \\forall n \\in \\mathbb{N}^*$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Dãy bị chặn dưới',
                      problem: 'Chứng minh dãy số $u_n = n^2 + 2$ ($n \\in \\mathbb{N}^*$) bị chặn dưới.',
                      solution: 'Vì $n \\ge 1$ nên $n^2 \\ge 1$, suy ra $u_n = n^2 + 2 \\ge \\mathbf{3}$ với mọi $n \\in \\mathbb{N}^*$.<br/>Vậy dãy bị chặn dưới bởi $m = \\mathbf{3}$.',
                    },
                  },
                  {
                    id: 'b1-c3-i3',
                    html: '<strong>Bị chặn:</strong> Vừa chặn trên vừa chặn dưới $\\iff \\exists m, M:$ [CHE: $m \\le u_n \\le M, \\forall n \\in \\mathbb{N}^*$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Chứng minh dãy số bị chặn',
                      problem: 'Chứng minh dãy số $u_n = \\dfrac{n}{n + 1}$ ($n \\in \\mathbb{N}^*$) là dãy số bị chặn.',
                      solution: 'Ta có $u_n = 1 - \\dfrac{1}{n + 1}$. Vì $n \\ge 1 \\Rightarrow 0 < \\dfrac{1}{n + 1} \\le \\dfrac{1}{2}$, suy ra:<br/>$$\\frac{1}{2} \\le u_n < 1 \\quad (\\forall n \\in \\mathbb{N}^*)$$Vậy $(u_n)$ là <strong>dãy số bị chặn</strong>.',
                    },
                  },
                ],
              },
              {
                id: 'b1-card-4',
                type: 'warning',
                title: 'Mẹo xét tăng, giảm & bị chặn',
                items: [
                  {
                    id: 'b1-c4-i1',
                    html: 'Với dãy phân thức $u_n = \\dfrac{an + b}{cn + d}$, luôn <strong>tách phần nguyên</strong> trước rồi đánh giá từ $n \\ge 1$; khi gặp lũy thừa $a^n$ hoặc $n!$ dương thì ưu tiên <strong>xét tỉ số $\\dfrac{u_{n+1}}{u_n}$</strong>.',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Tách phần nguyên nhanh',
                      problem: 'Chứng minh dãy số $(u_n)$ với $u_n = \\dfrac{3n + 1}{n + 2}$ là dãy số bị chặn.',
                      solution: 'Tách phần nguyên: $u_n = \\dfrac{3(n + 2) - 5}{n + 2} = 3 - \\dfrac{5}{n + 2}$.<br/>Vì $n \\ge 1 \\Rightarrow 0 < \\dfrac{5}{n + 2} \\le \\dfrac{5}{3}$, suy ra $\\mathbf{\\dfrac{4}{3} \\le u_n < 3}$ nên $(u_n)$ là <strong>dãy bị chặn</strong>.',
                    },
                  },
                ],
              },
            ],
            flipCards: [
              {
                id: 'b1-flip-1',
                trapCategory: 'index',
                trapLabel: 'Bẫy thay chỉ số $(n + 1)$',
                problem: 'Cho dãy số $(u_n)$ với $u_n = 3n - 2$. Tính hiệu $u_{n+1} - u_n$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['3'],
                trapExplanation: 'Viết nhầm $u_{n+1} = 3n - 2 + 1 = 3n - 1 \\Rightarrow$ ra $1$.',
                correctExplanation: 'Thay $n$ bởi $(n + 1)$: $u_{n+1} = 3(n + 1) - 2 = 3n + 1 \\Rightarrow u_{n+1} - u_n = \\mathbf{3}$.',
              },
              {
                id: 'b1-flip-2',
                trapCategory: 'sign',
                trapLabel: 'Bẫy xét tỉ số dãy âm ($u_n < 0$)',
                problem: 'Cho dãy số $u_n = -2^n$ ($n \\in \\mathbb{N}^*$). Tìm giá trị lớn nhất của $u_n$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['-2'],
                trapExplanation: 'Lập $\\dfrac{u_{n+1}}{u_n} = 2 > 1$ tưởng dãy tăng (quên $u_n < 0$ làm đổi chiều BĐT).',
                correctExplanation: 'Dãy giảm ngặt ($-2, -4, -8, \\dots$) nên số hạng lớn nhất là $u_1 = \\mathbf{-2}$.',
              },
              {
                id: 'b1-flip-3',
                trapCategory: 'alternating',
                trapLabel: 'Bẫy dãy đan dấu $(-1)^n$',
                problem: 'Cho dãy số $u_n = (-1)^n \\cdot 2 + 3$. Tính tổng $u_1 + u_2$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['6'],
                trapExplanation: 'Quên $(-1)^1 = -1$ hoặc nhầm dãy hằng nên cộng ra $10$ hoặc $0$.',
                correctExplanation: '$u_1 = -2 + 3 = 1$, $u_2 = 2 + 3 = 5 \\Rightarrow u_1 + u_2 = \\mathbf{6}$ (dãy đan dấu không tăng, không giảm).',
              },
            ],
            examples: [
              {
                id: 'b1-ex-1',
                title: 'Ví dụ 1.1 — Xét tính tăng, giảm của dãy phân thức',
                problem:
                  'Xét tính tăng, giảm của dãy số $(u_n)$ có số hạng tổng quát $u_n = \\dfrac{2n - 1}{n + 1}$.',
                hint: 'Lập hiệu $u_{n+1} - u_n$, quy đồng mẫu số rồi xét dấu của hiệu này với mọi $n \\in \\mathbb{N}^*$.',
                steps: [
                  `<strong>Bước 1:</strong> Biểu diễn số hạng $u_{n+1}$ bằng cách thay $n$ bởi $(n + 1)$:
                   $$u_{n+1} = \\frac{2(n + 1) - 1}{(n + 1) + 1} = \\frac{2n + 1}{n + 2}$$`,
                  `<strong>Bước 2:</strong> Lập hiệu $u_{n+1} - u_n$ và quy đồng mẫu số:
                   $$u_{n+1} - u_n = \\frac{2n + 1}{n + 2} - \\frac{2n - 1}{n + 1} = \\frac{(2n + 1)(n + 1) - (2n - 1)(n + 2)}{(n + 2)(n + 1)}$$`,
                  `<strong>Bước 3:</strong> Rút gọn tử số và đánh giá dấu:
                   $$u_{n+1} - u_n = \\frac{(2n^2 + 3n + 1) - (2n^2 + 3n - 2)}{(n + 2)(n + 1)} = \\frac{3}{(n + 2)(n + 1)}$$
                   Vì $n \\in \\mathbb{N}^*$ nên $(n + 2)(n + 1) > 0$, suy ra $u_{n+1} - u_n > 0$ với mọi $n \\in \\mathbb{N}^*$.`,
                ],
                finalAnswer: 'Dãy số $(u_n)$ là <strong>dãy số tăng</strong>.',
              },
              {
                id: 'b1-ex-2',
                title: 'Ví dụ 1.2 — Chứng minh dãy số bị chặn',
                problem:
                  'Chứng minh dãy số $(u_n)$ với $u_n = \\dfrac{3n + 1}{n + 2}$ là dãy số bị chặn.',
                hint: 'Tách phần nguyên ra khỏi phân thức (biến đổi tử số chứa mẫu số $n + 2$), sau đó đánh giá bất đẳng thức từ điều kiện $n \\ge 1$.',
                steps: [
                  `<strong>Bước 1:</strong> Tách phần nguyên của phân thức:
                   $$u_n = \\frac{3(n + 2) - 5}{n + 2} = 3 - \\frac{5}{n + 2}$$`,
                  `<strong>Bước 2:</strong> Đánh giá phân thức $\\dfrac{5}{n + 2}$ với mọi $n \\in \\mathbb{N}^*$:
                   Vì $n \\ge 1$ nên $n + 2 \\ge 3$, suy ra:
                   $$0 < \\frac{5}{n + 2} \\le \\frac{5}{3}$$`,
                  `<strong>Bước 3:</strong> Nhân hai vế với $-1$ (đổi chiều bất đẳng thức) rồi cộng thêm $3$:
                   $$-\\frac{5}{3} \\le -\\frac{5}{n + 2} < 0 \\Leftrightarrow \\frac{4}{3} \\le 3 - \\frac{5}{n + 2} < 3 \\Leftrightarrow \\frac{4}{3} \\le u_n < 3$$`,
                ],
                finalAnswer:
                  'Vì $\\dfrac{4}{3} \\le u_n < 3$ với mọi $n \\in \\mathbb{N}^*$, nên dãy số $(u_n)$ bị chặn dưới bởi $\\dfrac{4}{3}$ và bị chặn trên bởi $3$. Vậy $(u_n)$ là <strong>dãy số bị chặn</strong>.',
              },
            ],
            quizzes: {
              multipleChoice: [
                {
                  id: 'b1-mc-1',
                  question:
                    'Cho dãy số $(u_n)$ với $u_n = \\dfrac{(-1)^n}{2n + 1}$. Số hạng thứ 4 của dãy số là:',
                  options: ['$\\dfrac{1}{9}$', '$-\\dfrac{1}{9}$', '$\\dfrac{1}{7}$', '$-\\dfrac{1}{7}$'],
                  correctIndex: 0,
                  explanation:
                    'Thay $n = 4$ vào công thức tổng quát: $u_4 = \\dfrac{(-1)^4}{2 \\cdot 4 + 1} = \\dfrac{1}{9}$.',
                },
                {
                  id: 'b1-mc-2',
                  question: 'Trong các dãy số dưới đây, dãy số nào là dãy số giảm?',
                  options: [
                    '$u_n = 2n + 3$',
                    '$u_n = (-1)^n \\cdot n$',
                    '$u_n = \\dfrac{1}{n + 1}$',
                    '$u_n = 2^n$',
                  ],
                  correctIndex: 2,
                  explanation:
                    'Với $u_n = \\dfrac{1}{n + 1}$, khi $n$ tăng thì mẫu số $n + 1$ tăng, do đó giá trị phân số giảm dần ($u_{n+1} = \\dfrac{1}{n+2} < \\dfrac{1}{n+1} = u_n$).',
                },
              ],
              trueFalse: [
                {
                  id: 'b1-tf-1',
                  stem: 'Cho dãy số $(u_n)$ xác định bởi công thức truy hồi: $u_1 = 2$ và $u_{n+1} = 2u_n + 1$ với mọi $n \\ge 1$. Xét tính Đúng/Sai của các khẳng định sau:',
                  statements: [
                    {
                      label: 'a',
                      text: '$u_2 = 5$.',
                      isTrue: true,
                      explanation: '$u_2 = 2u_1 + 1 = 2 \\cdot 2 + 1 = 5$.',
                    },
                    {
                      label: 'b',
                      text: '$u_4 = 21$.',
                      isTrue: false,
                      explanation: '$u_3 = 2 \\cdot 5 + 1 = 11$, suy ra $u_4 = 2 \\cdot 11 + 1 = 23$.',
                    },
                    {
                      label: 'c',
                      text: 'Dãy số $(u_n)$ là dãy số tăng.',
                      isTrue: true,
                      explanation:
                        'Mọi số hạng của dãy đều dương, nên $u_{n+1} - u_n = (2u_n + 1) - u_n = u_n + 1 > 0$.',
                    },
                    {
                      label: 'd',
                      text: 'Công thức số hạng tổng quát của dãy là $u_n = 3 \\cdot 2^{n-1} - 1$.',
                      isTrue: true,
                      explanation:
                        'Ta có $u_{n+1} + 1 = 2(u_n + 1)$, nên dãy $v_n = u_n + 1$ nhân đôi sau mỗi bước với $v_1 = 3$, suy ra $v_n = 3 \\cdot 2^{n-1} \\Rightarrow u_n = 3 \\cdot 2^{n-1} - 1$.',
                    },
                  ],
                },
              ],
              shortAnswer: [
                {
                  id: 'b1-sa-1',
                  question:
                    'Cho dãy số $(u_n)$ có $u_n = n^2 - 4n + 5$. Hỏi số $50$ là số hạng thứ mấy của dãy số?',
                  correctAnswer: '9',
                  explanation:
                    'Giải phương trình $n^2 - 4n + 5 = 50 \\Leftrightarrow n^2 - 4n - 45 = 0 \\Leftrightarrow n = 9$ (nhận) hoặc $n = -5$ (loại vì $n \\in \\mathbb{N}^*$).',
                  paramSpec: {
                    vars: 'n0 = 9 [5..12]; p = 2 [1..3]; c = 5 [1..8]',
                    questionTemplate:
                      'Cho dãy số $(u_n)$ có $u_n = n^2 - {{2 * p}}n + {{c}}$. Hỏi số ${{n0^2 - 2 * p * n0 + c}}$ là số hạng thứ mấy của dãy số?',
                    answerTemplate: '{{n0}}',
                    explanationTemplate:
                      'Giải phương trình $n^2 - {{2 * p}}n + {{c}} = {{n0^2 - 2 * p * n0 + c}} \\Leftrightarrow (n - {{n0}})(n + {{n0 - 2 * p}}) = 0 \\Leftrightarrow n = {{n0}}$ (nhận, vì $n \\in \\mathbb{N}^*$).',
                  },
                },
                {
                  id: 'b1-sa-2',
                  question:
                    'Cho dãy số $(u_n)$ với $u_n = \\dfrac{5n + 2}{n + 1}$. Tìm số nguyên $M$ nhỏ nhất sao cho $u_n < M$ với mọi $n \\in \\mathbb{N}^*$.',
                  correctAnswer: '5',
                  explanation:
                    'Ta có $u_n = 5 - \\dfrac{3}{n + 1} < 5$ với mọi $n \\ge 1$. Mặt khác khi $n \\ge 3$ thì $u_n > 4$, nên không thể chọn $M \\le 4$. Vậy giá trị nguyên nhỏ nhất của $M$ là $5$.',
                  paramSpec: {
                    vars: 'M = 5 [3..9]; k = 3 [2..5]',
                    questionTemplate:
                      'Cho dãy số $(u_n)$ với $u_n = \\dfrac{{{M}}n {{signed(M - k)}}}{n + 1}$. Tìm số nguyên $M$ nhỏ nhất sao cho $u_n < M$ với mọi $n \\in \\mathbb{N}^*$.',
                    answerTemplate: '{{M}}',
                    explanationTemplate:
                      'Tách phần nguyên: $u_n = {{M}} - \\dfrac{{{k}}}{n + 1} < {{M}}$ với mọi $n \\ge 1$. Khi $n \\ge {{k}}$ thì $u_n > {{M - 1}}$, nên giá trị nguyên nhỏ nhất của $M$ là ${{M}}$.',
                  },
                },
              ],
            },
          },

          // ===================================================================
          // BÀI 2: CẤP SỐ CỘNG (CSC)
          // ===================================================================
          {
            id: 'toan11-c2-b2',
            code: 'Bài 6',
            title: 'Cấp số cộng',
            summary: 'Định nghĩa công sai $d$, số hạng tổng quát $u_n$, tính chất 3 số hạng liên tiếp và tổng $S_n$ của CSC.',
            coreCards: [
              {
                id: 'b2-card-1',
                type: 'theory',
                title: 'Định nghĩa & Nhận biết',
                items: [
                  {
                    id: 'b2-c1-i1',
                    html: 'Mỗi số hạng (từ $u_2$) bằng số hạng liền trước cộng <strong>công sai $d$</strong> không đổi: $$u_{n+1} = u_n + d \\quad (\\forall n \\in \\mathbb{N}^*)$$',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ về Định nghĩa CSC',
                      problem: 'Xét dãy số $3; 7; 11; 15; \\dots$ có phải cấp số cộng không? Nếu có, chỉ ra $u_1$ và công sai $d$.',
                      solution: 'Ta thấy $7 - 3 = 11 - 7 = 15 - 11 = 4$ (không đổi). Vậy đây là cấp số cộng với $u_1 = \\mathbf{3}$ và công sai $d = \\mathbf{4}$.',
                    },
                  },
                  {
                    id: 'b2-c1-i2',
                    html: '<strong>Dấu hiệu nhận biết:</strong> Hiệu $u_{n+1} - u_n = d$ (hằng số không phụ thuộc $n$).',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Nhận biết CSC',
                      problem: 'Chứng minh dãy số $(u_n)$ với $u_n = 5n - 2$ là một cấp số cộng và tìm công sai $d$.',
                      solution: 'Xét hiệu $u_{n+1} - u_n = [5(n + 1) - 2] - (5n - 2) = \\mathbf{5}$ (hằng số với mọi $n \\in \\mathbb{N}^*$). Suy ra $(u_n)$ là CSC với công sai $d = \\mathbf{5}$.',
                    },
                  },
                  {
                    id: 'b2-c1-i3',
                    html: `<strong>Tính đơn điệu theo công sai $d$:</strong>
                      <div class="rv-case-row">
                        <span class="rv-case-pill is-up">$d > 0$: Dãy tăng</span>
                        <span class="rv-case-pill is-down">$d < 0$: Dãy giảm</span>
                        <span class="rv-case-pill is-flat">$d = 0$: Dãy không đổi</span>
                      </div>`,
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Xét chiều tăng/giảm theo d',
                      problem: 'Xét tính tăng, giảm của hai CSC: $(a_n)$ có $a_1 = 10, d = -3$ và $(b_n)$ có $b_1 = -5, d = 2$.',
                      solution: '• Dãy $(a_n)$ có $d = -3 < 0$ nên là <strong>dãy giảm</strong> ($10; 7; 4; 1; \\dots$).<br/>• Dãy $(b_n)$ có $d = 2 > 0$ nên là <strong>dãy tăng</strong> ($-5; -3; -1; 1; \\dots$).',
                    },
                  },
                ],
              },
              {
                id: 'b2-card-2',
                type: 'formula',
                title: 'Công thức Cấp số cộng',
                items: [
                  {
                    id: 'b2-c2-i1',
                    html: '<strong>Số hạng tổng quát</strong> ($n \\ge 2$): $u_n =$ [CHE: $u_1 + (n - 1)d$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Tính số hạng tổng quát',
                      problem: 'Cho cấp số cộng $(u_n)$ có $u_1 = -2$ và công sai $d = 3$. Tính giá trị số hạng $u_{10}$.',
                      solution: 'Áp dụng công thức $u_n = u_1 + (n - 1)d$:<br/>$$u_{10} = u_1 + 9d = -2 + 9 \\cdot 3 = \\mathbf{25}$$',
                    },
                  },
                  {
                    id: 'b2-c2-i2',
                    html: '<strong>Liên hệ 2 số hạng:</strong> $u_m - u_k =$ [CHE: $(m - k)d$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Tìm nhanh công sai d',
                      problem: 'Cho cấp số cộng $(u_n)$ biết $u_3 = 7$ và $u_8 = 22$. Tìm công sai $d$.',
                      solution: 'Ta có $u_8 - u_3 = (8 - 3)d \\iff 22 - 7 = 5d \\iff 5d = 15 \\Rightarrow d = \\mathbf{3}$.',
                    },
                  },
                  {
                    id: 'b2-c2-i3',
                    html: '<strong>3 số hạng liên tiếp</strong> $a, b, c$: [CHE: $a + c = 2b$] $\\iff b =$ [CHE: $\\dfrac{a + c}{2}$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Trung bình cộng 3 số',
                      problem: 'Tìm $x$ để ba số $2; x; 14$ theo thứ tự đó lập thành một cấp số cộng.',
                      solution: 'Theo tính chất CSC: $x = \\dfrac{2 + 14}{2} = \\mathbf{8}$ (ta được CSC $2; 8; 14$ có $d = 6$).',
                    },
                  },
                  {
                    id: 'b2-c2-i4',
                    html: '<strong>Tổng $n$ số hạng đầu:</strong> $S_n =$ [CHE: $\\dfrac{n(u_1 + u_n)}{2}$] $=$ [CHE: $\\dfrac{n}{2}[2u_1 + (n - 1)d]$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Thực tế (Rạp chiếu phim)',
                      problem: 'Một rạp chiếu phim có $15$ hàng ghế, hàng đầu $20$ ghế, mỗi hàng sau nhiều hơn hàng trước $3$ ghế. Hỏi rạp có tất cả bao nhiêu ghế?',
                      solution: 'Số ghế các hàng lập thành CSC với $u_1 = 20, d = 3, n = 15$. Tổng số ghế:<br/>$$S_{15} = \\frac{15}{2}[2 \\cdot 20 + 14 \\cdot 3] = \\frac{15 \\cdot 82}{2} = \\mathbf{615}\\text{ ghế}$$',
                    },
                  },
                ],
              },
              {
                id: 'b2-card-3',
                type: 'warning',
                title: 'Mẹo giải hệ CSC',
                items: [
                  {
                    id: 'b2-c3-i1',
                    html: 'Đưa mọi số hạng $u_k$ về <strong>2 ẩn $u_1, d$</strong> qua $u_k = u_1 + (k - 1)d$ rồi bấm máy hệ bậc nhất.',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Giải hệ phương trình CSC',
                      problem: 'Tìm $u_1, d$ của CSC thỏa mãn $\\begin{cases} u_2 + u_5 = 16 \\\\ u_3 + u_7 = 22 \\end{cases}$.',
                      solution: 'Biểu diễn theo $u_1, d$: $\\begin{cases} (u_1 + d) + (u_1 + 4d) = 16 \\\\ (u_1 + 2d) + (u_1 + 6d) = 22 \\end{cases} \\iff \\begin{cases} 2u_1 + 5d = 16 \\\\ 2u_1 + 8d = 22 \\end{cases}$.<br/>Trừ vế theo vế: $3d = 6 \\Rightarrow d = \\mathbf{2}$, thay ngược lại được $u_1 = \\mathbf{3}$.',
                    },
                  },
                ],
              },
            ],
            flipCards: [
              {
                id: 'b2-flip-1',
                trapCategory: 'index',
                trapLabel: 'Bẫy nhầm hệ số $(n - 1)$',
                problem: 'Cho cấp số cộng có $u_1 = 3$ và công sai $d = 2$. Tính $u_{10}$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['21'],
                trapExplanation: 'Nhẩm $u_{10} = u_1 + 10d = 3 + 20 = 23$ (quên trừ $1$ ở hệ số của $d$).',
                correctExplanation: '$u_{10} = u_1 + 9d = 3 + 9 \\cdot 2 = \\mathbf{21}$.',
              },
              {
                id: 'b2-flip-2',
                trapCategory: 'coeff',
                trapLabel: 'Bẫy thiếu hệ số $2u_1$',
                problem: 'Cho cấp số cộng có $u_1 = 3$ và công sai $d = 2$. Tính tổng $S_{10}$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['120'],
                trapExplanation: 'Viết $S_{10} = \\dfrac{10}{2}[u_1 + 9d] = 105$ (quên nhân $2$ trước $u_1$).',
                correctExplanation: '$S_{10} = \\dfrac{10}{2}[2u_1 + 9d] = 5(6 + 18) = \\mathbf{120}$.',
              },
            ],
            examples: [
              {
                id: 'b2-ex-1',
                title: 'Ví dụ 2.1 — Giải hệ phương trình Cấp số cộng',
                problem:
                  'Cho cấp số cộng $(u_n)$ thỏa mãn $\\begin{cases} u_2 + u_5 = 16 \\\\ u_3 + u_7 = 22 \\end{cases}$. Tìm số hạng đầu $u_1$, công sai $d$ và tổng 10 số hạng đầu $S_{10}$.',
                hint: 'Thay $u_2, u_3, u_5, u_7$ theo $u_1$ và $d$ để lập hệ phương trình hai ẩn, giải tìm $u_1, d$ rồi áp dụng công thức tính $S_{10}$.',
                steps: [
                  `<strong>Bước 1:</strong> Biểu diễn các số hạng theo $u_1$ và $d$:
                   <ul class="rv-sub-list">
                     <li>$u_2 + u_5 = (u_1 + d) + (u_1 + 4d) = 2u_1 + 5d$.</li>
                     <li>$u_3 + u_7 = (u_1 + 2d) + (u_1 + 6d) = 2u_1 + 8d$.</li>
                   </ul>`,
                  `<strong>Bước 2:</strong> Giải hệ phương trình bậc nhất hai ẩn:
                   $$\\begin{cases} 2u_1 + 5d = 16 \\\\ 2u_1 + 8d = 22 \\end{cases}$$
                   Lấy phương trình dưới trừ phương trình trên ta được $3d = 6 \\Rightarrow d = 2$.<br/>
                   Thay $d = 2$ vào phương trình đầu: $2u_1 + 10 = 16 \\Rightarrow u_1 = 3$.`,
                  `<strong>Bước 3:</strong> Tính tổng 10 số hạng đầu tiên $S_{10}$:
                   $$S_{10} = \\frac{10}{2}[2u_1 + (10 - 1)d] = 5 \\cdot (2 \\cdot 3 + 9 \\cdot 2) = 5 \\cdot 24 = 120$$`,
                ],
                finalAnswer: '$u_1 = 3$, $d = 2$ và $S_{10} = 120$.',
              },
              {
                id: 'b2-ex-2',
                title: 'Ví dụ 2.2 — Bài toán thực tế (Rạp chiếu phim)',
                problem:
                  'Một rạp chiếu phim có 15 hàng ghế. Hàng đầu tiên có 20 ghế, mỗi hàng sau nhiều hơn hàng ngay trước nó 3 ghế. Hỏi rạp chiếu phim đó có tất cả bao nhiêu ghế?',
                hint: 'Mô hình hóa số ghế ở từng hàng thành một cấp số cộng. Xác định rõ $u_1$, $d$, $n$ rồi tính tổng $S_n$.',
                steps: [
                  `<strong>Bước 1:</strong> Gọi $u_n$ là số ghế ở hàng thứ $n$ ($1 \\le n \\le 15$). Vì mỗi hàng sau hơn hàng trước 3 ghế nên dãy $(u_n)$ lập thành một cấp số cộng với:
                   <ul class="rv-sub-list">
                     <li>Số hạng đầu: $u_1 = 20$.</li>
                     <li>Công sai: $d = 3$.</li>
                     <li>Số hàng ghế: $n = 15$.</li>
                   </ul>`,
                  `<strong>Bước 2:</strong> Tổng số ghế của cả rạp là tổng 15 số hạng đầu $S_{15}$:
                   $$S_{15} = \\frac{15}{2}[2u_1 + (15 - 1)d] = \\frac{15}{2}(2 \\cdot 20 + 14 \\cdot 3) = \\frac{15}{2} \\cdot 82 = 615$$`,
                ],
                finalAnswer: 'Rạp chiếu phim có tất cả <strong>615 ghế</strong>.',
              },
            ],
            quizzes: {
              multipleChoice: [
                {
                  id: 'b2-mc-1',
                  question:
                    'Cho cấp số cộng $(u_n)$ có $u_1 = -2$ và công sai $d = 3$. Giá trị của $u_{10}$ là:',
                  options: ['$25$', '$28$', '$22$', '$-29$'],
                  correctIndex: 0,
                  explanation: '$u_{10} = u_1 + 9d = -2 + 9 \\cdot 3 = 25$.',
                },
                {
                  id: 'b2-mc-2',
                  question:
                    'Ba số $2; x; 14$ theo thứ tự đó lập thành một cấp số cộng. Giá trị của $x$ bằng:',
                  options: ['$6$', '$8$', '$10$', '$12$'],
                  correctIndex: 1,
                  explanation: 'Theo tính chất cấp số cộng, $x = \\dfrac{2 + 14}{2} = 8$.',
                },
              ],
              trueFalse: [
                {
                  id: 'b2-tf-1',
                  stem: 'Cho cấp số cộng $(u_n)$ có $u_1 = 5$ và $u_4 = 17$. Xét tính Đúng/Sai của các khẳng định sau:',
                  statements: [
                    {
                      label: 'a',
                      text: 'Công sai của cấp số cộng là $d = 4$.',
                      isTrue: true,
                      explanation: '$u_4 = u_1 + 3d \\Rightarrow 17 = 5 + 3d \\Rightarrow d = 4$.',
                    },
                    {
                      label: 'b',
                      text: 'Số hạng tổng quát của cấp số cộng là $u_n = 4n + 1$.',
                      isTrue: true,
                      explanation: '$u_n = 5 + (n - 1) \\cdot 4 = 4n + 1$.',
                    },
                    {
                      label: 'c',
                      text: 'Số $81$ là số hạng thứ 19 của cấp số cộng.',
                      isTrue: false,
                      explanation:
                        '$4n + 1 = 81 \\Leftrightarrow 4n = 80 \\Leftrightarrow n = 20$, nên $81$ là số hạng thứ 20.',
                    },
                    {
                      label: 'd',
                      text: 'Tổng 10 số hạng đầu tiên của cấp số cộng bằng $230$.',
                      isTrue: true,
                      explanation:
                        '$S_{10} = \\dfrac{10}{2}[2 \\cdot 5 + 9 \\cdot 4] = 5 \\cdot 46 = 230$.',
                    },
                  ],
                },
              ],
              shortAnswer: [
                {
                  id: 'b2-sa-1',
                  question:
                    'Cho cấp số cộng $(u_n)$ có $u_3 = 7$ và $u_8 = 22$. Tính tổng 12 số hạng đầu tiên của cấp số cộng đó.',
                  correctAnswer: '210',
                  explanation:
                    'Ta có $u_8 - u_3 = 5d \\Rightarrow 15 = 5d \\Rightarrow d = 3$. Suy ra $u_1 = u_3 - 2d = 7 - 6 = 1$. Tổng $S_{12} = \\dfrac{12}{2}[2 \\cdot 1 + 11 \\cdot 3] = 6 \\cdot 35 = 210$.',
                  paramSpec: {
                    vars: 'u1 = 1 [-3..5]; d = 3 [2..6]; k1 = 3 [2..4]; k2 = 8 [6..9]; m = 12 [8..12]',
                    questionTemplate:
                      'Cho cấp số cộng $(u_n)$ có $u_{{{k1}}} = {{u1 + (k1 - 1) * d}}$ và $u_{{{k2}}} = {{u1 + (k2 - 1) * d}}$. Tính tổng ${{m}}$ số hạng đầu tiên của cấp số cộng đó.',
                    answerTemplate: '{{m * (2 * u1 + (m - 1) * d) / 2}}',
                    explanationTemplate:
                      'Ta có $u_{{{k2}}} - u_{{{k1}}} = {{k2 - k1}}d \\Rightarrow d = {{d}}$. Suy ra $u_1 = {{u1}}$. Tổng $S_{{{m}}} = \\dfrac{{{m}}}{2}[2 \\cdot {{paren(u1)}} + {{m - 1}} \\cdot {{paren(d)}}] = {{m * (2 * u1 + (m - 1) * d) / 2}}$.',
                  },
                },
                {
                  id: 'b2-sa-2',
                  question:
                    'Một người xếp các khối gỗ lập phương thành một tháp nhiều tầng. Tầng trên cùng có 1 khối, tầng thứ hai có 4 khối, tầng thứ ba có 7 khối,... cứ như vậy tầng dưới hơn tầng kề trên 3 khối gỗ. Nếu người đó dùng hết đúng 145 khối gỗ thì tháp gỗ có bao nhiêu tầng?',
                  correctAnswer: '10',
                  explanation:
                    'Ta có CSC với $u_1 = 1, d = 3$ và $S_n = 145$. Phương trình: $\\dfrac{n}{2}[2 \\cdot 1 + 3(n - 1)] = 145 \\Leftrightarrow 3n^2 - n - 290 = 0 \\Leftrightarrow n = 10$ (nhận) hoặc $n = -\\dfrac{29}{3}$ (loại).',
                  paramSpec: {
                    vars: 'u1 = 1 [1..3]; d = 3 [2..4]; n = 10 [6..12]',
                    questionTemplate:
                      'Một người xếp các khối gỗ lập phương thành một tháp nhiều tầng. Tầng trên cùng có ${{u1}}$ khối, tầng thứ hai có ${{u1 + d}}$ khối, tầng thứ ba có ${{u1 + 2 * d}}$ khối,... cứ như vậy tầng dưới hơn tầng kề trên ${{d}}$ khối gỗ. Nếu người đó dùng hết đúng ${{n * (2 * u1 + (n - 1) * d) / 2}}$ khối gỗ thì tháp gỗ có bao nhiêu tầng?',
                    answerTemplate: '{{n}}',
                    explanationTemplate:
                      'Ta có CSC với $u_1 = {{u1}}, d = {{d}}$ và $S_n = {{n * (2 * u1 + (n - 1) * d) / 2}}$. Giải phương trình $\\dfrac{n}{2}[2 \\cdot {{u1}} + {{d}}(n - 1)] = {{n * (2 * u1 + (n - 1) * d) / 2}}$ thu được $n = {{n}}$ (nhận).',
                  },
                },
              ],
            },
          },

          // ===================================================================
          // BÀI 3: CẤP SỐ NHÂN (CSN)
          // ===================================================================
          {
            id: 'toan11-c2-b3',
            code: 'Bài 7',
            title: 'Cấp số nhân',
            summary: 'Định nghĩa công bội $q$, số hạng tổng quát $u_n$, trung bình nhân và tổng $S_n$ của Cấp số nhân.',
            coreCards: [
              {
                id: 'b3-card-1',
                type: 'theory',
                title: 'Định nghĩa & Nhận biết',
                items: [
                  {
                    id: 'b3-c1-i1',
                    html: 'Mỗi số hạng (từ $u_2$) bằng số hạng liền trước nhân <strong>công bội $q$</strong> không đổi: $$u_{n+1} = u_n \\cdot q \\quad (\\forall n \\in \\mathbb{N}^*)$$',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ về Định nghĩa CSN',
                      problem: 'Xét dãy số $2; 6; 18; 54; \\dots$ có phải cấp số nhân không? Nếu có, chỉ ra $u_1$ và công bội $q$.',
                      solution: 'Ta thấy $\\dfrac{6}{2} = \\dfrac{18}{6} = \\dfrac{54}{18} = 3$ (không đổi). Vậy đây là cấp số nhân với $u_1 = \\mathbf{2}$ và công bội $q = \\mathbf{3}$.',
                    },
                  },
                  {
                    id: 'b3-c1-i2',
                    html: '<strong>Dấu hiệu nhận biết</strong> ($u_n \\neq 0$): Tỉ số $\\dfrac{u_{n+1}}{u_n} = q$ (hằng số không phụ thuộc $n$).',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Nhận biết CSN',
                      problem: 'Chứng minh dãy số $(u_n)$ với $u_n = 3 \\cdot 2^n$ là một cấp số nhân và tìm $u_1, q$.',
                      solution: 'Xét tỉ số $\\dfrac{u_{n+1}}{u_n} = \\dfrac{3 \\cdot 2^{n+1}}{3 \\cdot 2^n} = \\mathbf{2}$ (hằng số với mọi $n \\in \\mathbb{N}^*$). Suy ra $(u_n)$ là CSN với $u_1 = 3 \\cdot 2^1 = \\mathbf{6}$ và công bội $q = \\mathbf{2}$.',
                    },
                  },
                  {
                    id: 'b3-c1-i3',
                    html: `<strong>Tính đơn điệu theo công bội $q$</strong> (với $u_1 > 0$):
                      <div class="rv-case-row">
                        <span class="rv-case-pill is-up">$q > 1$: Dãy tăng</span>
                        <span class="rv-case-pill is-down">$0 < q < 1$: Dãy giảm</span>
                        <span class="rv-case-pill is-flat">$q = 1$: Không đổi ($q < 0$: Đan dấu)</span>
                      </div>`,
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Xét chiều tăng/giảm theo q',
                      problem: 'Xét tính tăng, giảm của hai CSN: $(a_n)$ có $a_1 = 4, q = \\dfrac{1}{2}$ và $(b_n)$ có $b_1 = 2, q = -3$.',
                      solution: '• Dãy $(a_n)$ có $a_1 > 0, 0 < q < 1$ nên là <strong>dãy giảm</strong> ($4; 2; 1; \\dfrac{1}{2}; \\dots$).<br/>• Dãy $(b_n)$ có $q = -3 < 0$ nên là <strong>dãy đan dấu</strong> ($2; -6; 18; -54; \\dots$, không tăng, không giảm).',
                    },
                  },
                ],
              },
              {
                id: 'b3-card-2',
                type: 'formula',
                title: 'Công thức Cấp số nhân',
                items: [
                  {
                    id: 'b3-c2-i1',
                    html: '<strong>Số hạng tổng quát</strong> ($n \\ge 2$): $u_n =$ [CHE: $u_1 \\cdot q^{n-1}$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Tính số hạng tổng quát',
                      problem: 'Cho cấp số nhân $(u_n)$ có $u_1 = 2$ và công bội $q = -3$. Tính giá trị số hạng $u_4$.',
                      solution: 'Áp dụng công thức $u_n = u_1 \\cdot q^{n-1}$:<br/>$$u_4 = u_1 \\cdot q^3 = 2 \\cdot (-3)^3 = 2 \\cdot (-27) = \\mathbf{-54}$$',
                    },
                  },
                  {
                    id: 'b3-c2-i2',
                    html: '<strong>Liên hệ 2 số hạng</strong> ($u_k \\neq 0$): $\\dfrac{u_m}{u_k} =$ [CHE: $q^{m-k}$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Tìm nhanh công bội q',
                      problem: 'Cho cấp số nhân $(u_n)$ biết $u_2 = 6$ và $u_5 = 48$. Tìm công bội $q$.',
                      solution: 'Ta có $\\dfrac{u_5}{u_2} = q^{5 - 2} \\iff q^3 = \\dfrac{48}{6} = 8 \\Rightarrow q = \\mathbf{2}$.',
                    },
                  },
                  {
                    id: 'b3-c2-i3',
                    html: '<strong>3 số hạng liên tiếp</strong> $a, b, c$: [CHE: $b^2 = a \\cdot c$] $\\iff |b| =$ [CHE: $\\sqrt{ac}$].',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Trung bình nhân 3 số',
                      problem: 'Tìm $x$ để ba số $3; x; 27$ theo thứ tự đó lập thành một cấp số nhân.',
                      solution: 'Theo tính chất CSN: $x^2 = 3 \\cdot 27 = 81 \\iff x = \\mathbf{9}$ hoặc $x = \\mathbf{-9}$ (lấy đủ cả hai dấu $\\pm$).',
                    },
                  },
                  {
                    id: 'b3-c2-i4',
                    html: `<strong>Tổng $n$ số hạng đầu $S_n$:</strong>
                      <div class="rv-case-row">
                        <span class="rv-case-pill">Khi $q \\neq 1$: $S_n =$ [CHE: $u_1 \\cdot \\dfrac{1 - q^n}{1 - q}$]</span>
                        <span class="rv-case-pill">Khi $q = 1$: $S_n =$ [CHE: $n \\cdot u_1$]</span>
                      </div>`,
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Thực tế (Bóng nảy)',
                      problem: 'Một quả bóng thả rơi và nảy lên các độ cao tạo thành CSN với $u_1 = 8\\text{ m}$ và $q = \\dfrac{1}{2}$. Tính tổng độ cao $4$ lần nảy đầu tiên $S_4$.',
                      solution: 'Vì $q = \\dfrac{1}{2} \\neq 1$, áp dụng công thức tổng $S_n$:<br/>$$S_4 = 8 \\cdot \\frac{1 - (1/2)^4}{1 - 1/2} = 16 \\cdot \\frac{15}{16} = \\mathbf{15}\\text{ m}$$',
                    },
                  },
                ],
              },
              {
                id: 'b3-card-3',
                type: 'warning',
                title: 'Mẹo giải hệ CSN',
                items: [
                  {
                    id: 'b3-c3-i1',
                    html: 'Đưa mọi số hạng $u_k$ về <strong>2 ẩn $u_1, q$</strong> qua $u_k = u_1 \\cdot q^{k-1}$, đặt nhân tử chung rồi <strong>chia hai phương trình cho nhau</strong> để triệt tiêu $u_1$ và tìm $q$.',
                    hasExample: true,
                    example: {
                      title: 'Ví dụ Giải hệ phương trình CSN',
                      problem: 'Tìm $u_1, q$ của CSN có các số hạng dương thỏa mãn $\\begin{cases} u_1 + u_2 = 9 \\\\ u_3 + u_4 = 36 \\end{cases}$.',
                      solution: 'Đặt nhân tử chung: $\\begin{cases} u_1(1 + q) = 9 \\\\ u_1 q^2(1 + q) = 36 \\end{cases}$.<br/>Chia vế theo vế: $q^2 = \\dfrac{36}{9} = 4 \\Rightarrow q = \\mathbf{2}$ (vì $u_n > 0$), thay lại được $u_1 = \\mathbf{3}$.',
                    },
                  },
                ],
              },
            ],
            flipCards: [
              {
                id: 'b3-flip-1',
                trapCategory: 'sign',
                trapLabel: 'Bẫy bỏ sót nghiệm âm ($\\pm$)',
                problem: 'Ba số $2; x; 18$ theo thứ tự lập thành cấp số nhân. Tìm $x$.',
                placeholder: 'Nhập đáp án...',
                acceptedMultiSet: ['-6', '6'],
                trapExplanation: 'Khai căn $x^2 = 36$ chỉ lấy $x = 6$ mà bỏ quên nghiệm âm $x = -6$.',
                correctExplanation: '$x^2 = 2 \\cdot 18 = 36 \\iff x = \\mathbf{6}$ hoặc $x = \\mathbf{-6}$ (ứng với $q = \\pm 3$).',
              },
              {
                id: 'b3-flip-2',
                trapCategory: 'index',
                trapLabel: 'Bẫy nhầm mũ $n$ với $n - 1$',
                problem: 'Cho cấp số nhân có $u_1 = 2$ và công bội $q = 3$. Tính $u_5$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['162'],
                trapExplanation: 'Tính nhầm $u_5 = 2 \\cdot 3^5 = 486$ (dùng mũ $5$ thay vì mũ $4$).',
                correctExplanation: '$u_5 = u_1 \\cdot q^{5 - 1} = 2 \\cdot 3^4 = \\mathbf{162}$.',
              },
              {
                id: 'b3-flip-3',
                trapCategory: 'time',
                trapLabel: 'Bẫy lệch mốc ban đầu $t = 0$',
                problem: 'Ban đầu có $100$ vi khuẩn, sau mỗi giờ nhân đôi. Hỏi sau $8$ giờ có bao nhiêu con?',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['25600'],
                trapExplanation: 'Gán nhầm $u_1 = 100$ rồi tính $u_8 = 100 \\cdot 2^7 = 12800$ (thiếu $1$ lần nhân đôi).',
                correctExplanation: 'Ban đầu là $t = 0$. Sau $1$ giờ: $u_1 = 200 \\Rightarrow u_8 = 200 \\cdot 2^7 = \\mathbf{25600}$.',
              },
              {
                id: 'b3-flip-4',
                trapCategory: 'domain',
                trapLabel: 'Bẫy suy biến công bội $q = 1$',
                problem: 'Cho cấp số nhân có $u_1 = 5$ và công bội $q = 1$. Tính tổng $S_{10}$.',
                placeholder: 'Nhập đáp án...',
                acceptedAnswers: ['50'],
                trapExplanation: 'Ốp công thức $\\dfrac{1 - q^n}{1 - q}$ bị mẫu bằng $0$ (hoặc nhầm $S_{10} = 5$).',
                correctExplanation: 'Khi $q = 1$, mọi số hạng đều bằng $5 \\Rightarrow S_{10} = 10 \\cdot u_1 = \\mathbf{50}$.',
              },
            ],
            examples: [
              {
                id: 'b3-ex-1',
                title: 'Ví dụ 3.1 — Tìm $u_1$, công bội $q$ và tổng $S_6$ của CSN',
                problem:
                  'Cho cấp số nhân $(u_n)$ có các số hạng đều dương thỏa mãn $\\begin{cases} u_2 = 6 \\\\ u_5 = 48 \\end{cases}$. Tìm số hạng đầu $u_1$, công bội $q$ và tổng 6 số hạng đầu $S_6$.',
                hint: 'Viết $u_2, u_5$ theo $u_1$ và $q$, sau đó chia hai phương trình cho nhau để triệt tiêu $u_1$ và tìm $q$.',
                steps: [
                  `<strong>Bước 1:</strong> Biểu diễn hệ phương trình theo $u_1$ và $q$:
                   $$\\begin{cases} u_1 \\cdot q = 6 \\\\ u_1 \\cdot q^4 = 48 \\end{cases}$$`,
                  `<strong>Bước 2:</strong> Chia phương trình dưới cho phương trình trên để tìm $q$, sau đó suy ra $u_1$:
                   $$\\frac{u_1 q^4}{u_1 q} = \\frac{48}{6} \\Leftrightarrow q^3 = 8 \\Leftrightarrow q = 2$$
                   Thay $q = 2$ vào phương trình đầu: $u_1 \\cdot 2 = 6 \\Rightarrow u_1 = 3$.`,
                  `<strong>Bước 3:</strong> Áp dụng công thức tính tổng 6 số hạng đầu $S_6$ (vì $q = 2 \\neq 1$):
                   $$S_6 = u_1 \\cdot \\frac{q^6 - 1}{q - 1} = 3 \\cdot \\frac{2^6 - 1}{2 - 1} = 3 \\cdot (64 - 1) = 189$$`,
                ],
                finalAnswer: '$u_1 = 3$, $q = 2$ và $S_6 = 189$.',
              },
              {
                id: 'b3-ex-2',
                title: 'Ví dụ 3.2 — Bài toán thực tế (Tăng trưởng vi khuẩn)',
                problem:
                  'Một loại vi khuẩn trong phòng thí nghiệm cứ sau mỗi giờ lại phân đôi (số lượng tăng gấp 2 lần). Ban đầu có 100 con vi khuẩn. Hỏi sau 8 giờ có bao nhiêu con vi khuẩn?',
                hint: 'Xác định cẩn thận số lượng vi khuẩn <strong>sau 1 giờ</strong> làm số hạng đầu $u_1$ để số giờ trùng khớp với chỉ số $n$ của dãy.',
                steps: [
                  `<strong>Bước 1:</strong> Gọi $u_n$ là số lượng vi khuẩn có được sau $n$ giờ ($n \\in \\mathbb{N}^*$).
                   <ul class="rv-sub-list">
                     <li>Sau 1 giờ: $u_1 = 100 \\cdot 2 = 200$ (con).</li>
                     <li>Vì sau mỗi giờ số vi khuẩn tăng gấp 2 lần nên $(u_n)$ là cấp số nhân với $u_1 = 200$ và công bội $q = 2$.</li>
                   </ul>`,
                  `<strong>Bước 2:</strong> Số lượng vi khuẩn sau 8 giờ là số hạng thứ 8 của cấp số nhân:
                   $$u_8 = u_1 \\cdot q^{8 - 1} = 200 \\cdot 2^7 = 200 \\cdot 128 = 25600$$`,
                ],
                finalAnswer: 'Sau 8 giờ có <strong>25600 con vi khuẩn</strong>.',
              },
            ],
            quizzes: {
              multipleChoice: [
                {
                  id: 'b3-mc-1',
                  question:
                    'Cho cấp số nhân $(u_n)$ có $u_1 = 2$ và công bội $q = -3$. Giá trị của $u_4$ là:',
                  options: ['$54$', '$-54$', '$162$', '$-162$'],
                  correctIndex: 1,
                  explanation: '$u_4 = u_1 \\cdot q^3 = 2 \\cdot (-3)^3 = 2 \\cdot (-27) = -54$.',
                },
                {
                  id: 'b3-mc-2',
                  question:
                    'Ba số $3; x; 27$ theo thứ tự đó lập thành một cấp số nhân. Giá trị của $x$ có thể là:',
                  options: ['Chỉ $x = 9$', 'Chỉ $x = -9$', '$x = 9$ hoặc $x = -9$', '$x = 15$'],
                  correctIndex: 2,
                  explanation:
                    'Theo tính chất cấp số nhân, $x^2 = 3 \\cdot 27 = 81 \\Leftrightarrow x = 9$ hoặc $x = -9$.',
                },
              ],
              trueFalse: [
                {
                  id: 'b3-tf-1',
                  stem: 'Cho cấp số nhân $(u_n)$ có $u_1 = 4$ và công bội $q = \\dfrac{1}{2}$. Xét tính Đúng/Sai của các khẳng định sau:',
                  statements: [
                    {
                      label: 'a',
                      text: '$u_3 = 1$.',
                      isTrue: true,
                      explanation:
                        '$u_3 = 4 \\cdot \\left(\\dfrac{1}{2}\\right)^2 = 4 \\cdot \\dfrac{1}{4} = 1$.',
                    },
                    {
                      label: 'b',
                      text: 'Dãy số $(u_n)$ là dãy số tăng.',
                      isTrue: false,
                      explanation:
                        'Các số hạng đầu là $4; 2; 1; \\dfrac{1}{2}; \\dots$ giảm dần vì $u_1 > 0$ và $0 < q < 1$.',
                    },
                    {
                      label: 'c',
                      text: 'Số $\\dfrac{1}{16}$ là số hạng thứ 7 của cấp số nhân.',
                      isTrue: true,
                      explanation:
                        '$4 \\cdot \\left(\\dfrac{1}{2}\\right)^{n-1} = \\dfrac{1}{16} \\Leftrightarrow 2^{3-n} = 2^{-4} \\Leftrightarrow n = 7$.',
                    },
                    {
                      label: 'd',
                      text: 'Tổng 5 số hạng đầu tiên của cấp số nhân bằng $\\dfrac{31}{4}$.',
                      isTrue: true,
                      explanation:
                        '$S_5 = 4 \\cdot \\dfrac{1 - (1/2)^5}{1 - 1/2} = 8 \\cdot \\dfrac{31}{32} = \\dfrac{31}{4}$.',
                    },
                  ],
                },
              ],
              shortAnswer: [
                {
                  id: 'b3-sa-1',
                  question:
                    'Cho cấp số nhân $(u_n)$ có $u_1 = 3$ và công bội $q = 2$. Biết tổng $n$ số hạng đầu tiên $S_n = 381$. Tìm $n$.',
                  correctAnswer: '7',
                  explanation:
                    '$S_n = 3 \\cdot \\dfrac{2^n - 1}{2 - 1} = 381 \\Leftrightarrow 2^n - 1 = 127 \\Leftrightarrow 2^n = 128 = 2^7 \\Rightarrow n = 7$.',
                  paramSpec: {
                    vars: 'u1 = 3 [1..5]; q = 2 {2, 3}; n = 7 [4..7]',
                    questionTemplate:
                      'Cho cấp số nhân $(u_n)$ có $u_1 = {{u1}}$ và công bội $q = {{q}}$. Biết tổng $n$ số hạng đầu tiên $S_n = {{u1 * (q^n - 1) / (q - 1)}}$. Tìm $n$.',
                    answerTemplate: '{{n}}',
                    explanationTemplate:
                      'Ta có $S_n = {{u1}} \\cdot \\dfrac{{{q}}^n - 1}{{{q}} - 1} = {{u1 * (q^n - 1) / (q - 1)}} \\Leftrightarrow {{q}}^n = {{q^n}} = {{q}}^{{{n}}} \\Rightarrow n = {{n}}$.',
                  },
                },
                {
                  id: 'b3-sa-2',
                  question:
                    'Một quả bóng cao su được thả từ độ cao $16\\text{ m}$ xuống mặt đất. Mỗi lần chạm đất, quả bóng nảy lên độ cao bằng $\\dfrac{1}{2}$ độ cao ngay trước đó. Gọi $h_1, h_2, h_3, h_4$ lần lượt là độ cao lớn nhất mà quả bóng đạt được sau lần chạm đất thứ 1, 2, 3, 4. Tính tổng $h_1 + h_2 + h_3 + h_4$ (đơn vị: mét).',
                  correctAnswer: '15',
                  explanation:
                    'Độ cao các lần nảy lập thành CSN với $h_1 = 16 \\cdot \\dfrac{1}{2} = 8\\text{ m}$ và $q = \\dfrac{1}{2}$. Tổng cần tìm là $S_4 = 8 + 4 + 2 + 1 = 15\\text{ m}$.',
                  paramSpec: {
                    vars: 'k = 1 [1..4]; m = 4 [3..5]',
                    questionTemplate:
                      'Một quả bóng cao su được thả từ độ cao ${{k * 2^m}}\\text{ m}$ xuống mặt đất. Mỗi lần chạm đất, quả bóng nảy lên độ cao bằng $\\dfrac{1}{2}$ độ cao ngay trước đó. Tính tổng độ cao lớn nhất đạt được của ${{m}}$ lần nảy đầu tiên (đơn vị: mét).',
                    answerTemplate: '{{k * (2^m - 1)}}',
                    explanationTemplate:
                      'Độ cao các lần nảy lập thành CSN với $h_1 = {{k * 2^(m - 1)}}\\text{ m}$ và $q = \\dfrac{1}{2}$. Tổng ${{m}}$ lần nảy đầu: $S_{{{m}}} = {{k * 2^(m - 1)}} \\cdot \\dfrac{1 - (1/2)^{{{m}}}}{1 - 1/2} = {{k * (2^m - 1)}}\\text{ m}$.',
                  },
                },
              ],
            },
          },
        ];

/**
 * Official numbered Chapters & Lessons from Sổ báo giảng (Kế hoạch dạy học Toán 10, 11, 12).
 * Strictly excludes Hoạt động thực hành trải nghiệm, Ôn tập, Kiểm tra.
 * Content of all lessons (except the 3 pre-built Toán 11 Chương II lessons) starts empty for teacher editing.
 */
export const OFFICIAL_PLAN_SCAFFOLD = {
  "10": [
    {
      "code": "Chương I",
      "title": "Mệnh đề và tập hợp",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Mệnh đề"
        },
        {
          "code": "Bài 2",
          "title": "Tập hợp và các phép toán trên tập hợp"
        }
      ]
    },
    {
      "code": "Chương II",
      "title": "BPT và hệ BPT bậc nhất hai ẩn",
      "lessons": [
        {
          "code": "Bài 3",
          "title": "Bất phương trình bậc nhất hai ẩn"
        },
        {
          "code": "Bài 4",
          "title": "Hệ bất phương trình bậc nhất hai ẩn"
        }
      ]
    },
    {
      "code": "Chương III",
      "title": "Hệ thức lượng trong tam giác",
      "lessons": [
        {
          "code": "Bài 5",
          "title": "Giá trị lượng giác của một góc từ 0° đến 180°"
        },
        {
          "code": "Bài 6",
          "title": "Hệ thức lượng trong tam giác"
        }
      ]
    },
    {
      "code": "Chương IV",
      "title": "Vectơ",
      "lessons": [
        {
          "code": "Bài 7",
          "title": "Các khái niệm mở đầu"
        },
        {
          "code": "Bài 8",
          "title": "Tổng và hiệu của hai vectơ"
        },
        {
          "code": "Bài 9",
          "title": "Tích của một vectơ với một số"
        },
        {
          "code": "Bài 10",
          "title": "Vectơ trong mặt phẳng tọa độ"
        },
        {
          "code": "Bài 11",
          "title": "Tích vô hướng của hai vectơ"
        }
      ]
    },
    {
      "code": "Chương V",
      "title": "Các số đặc trưng của mẫu số liệu không ghép nhóm",
      "lessons": [
        {
          "code": "Bài 12",
          "title": "Số gần đúng và sai số"
        },
        {
          "code": "Bài 13",
          "title": "Các số đặc trưng đo xu thế trung tâm"
        },
        {
          "code": "Bài 14",
          "title": "Các số đặc trưng đo độ phân tán"
        }
      ]
    },
    {
      "code": "Chương VI",
      "title": "Hàm số, đồ thị và ứng dụng",
      "lessons": [
        {
          "code": "Bài 15",
          "title": "Hàm số"
        },
        {
          "code": "Bài 16",
          "title": "Hàm số bậc hai"
        },
        {
          "code": "Bài 17",
          "title": "Dấu của tam thức bậc hai"
        },
        {
          "code": "Bài 18",
          "title": "Phương trình quy về phương trình bậc hai"
        }
      ]
    },
    {
      "code": "Chương VII",
      "title": "Phương pháp tọa độ trong mặt phẳng",
      "lessons": [
        {
          "code": "Bài 19",
          "title": "Phương trình đường thẳng"
        },
        {
          "code": "Bài 20",
          "title": "Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách"
        },
        {
          "code": "Bài 21",
          "title": "Đường tròn trong mặt phẳng tọa độ"
        },
        {
          "code": "Bài 22",
          "title": "Ba đường conic"
        }
      ]
    },
    {
      "code": "Chương VIII",
      "title": "Đại số tổ hợp",
      "lessons": [
        {
          "code": "Bài 23",
          "title": "Quy tắc đếm"
        },
        {
          "code": "Bài 24",
          "title": "Hoán vị, chỉnh hợp và tổ hợp"
        },
        {
          "code": "Bài 25",
          "title": "Nhị thức Newton"
        }
      ]
    },
    {
      "code": "Chương IX",
      "title": "Tính xác suất theo định nghĩa cổ điển",
      "lessons": [
        {
          "code": "Bài 26",
          "title": "Biến cố và định nghĩa cổ điển của xác suất"
        },
        {
          "code": "Bài 27",
          "title": "Thực hành tính xác suất theo định nghĩa cổ điển"
        }
      ]
    },
    {
      "code": "Chuyên đề 1",
      "title": "Hệ phương trình bậc nhất ba ẩn",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Hệ phương trình bậc nhất ba ẩn"
        },
        {
          "code": "Bài 2",
          "title": "Ứng dụng của Hệ phương trình bậc nhất ba ẩn"
        }
      ]
    },
    {
      "code": "Chuyên đề 2",
      "title": "Phương pháp quy nạp toán học. Nhị thức Newton",
      "lessons": [
        {
          "code": "Bài 3",
          "title": "Phương pháp quy nạp Toán học"
        },
        {
          "code": "Bài 4",
          "title": "Nhị thức Newton"
        }
      ]
    },
    {
      "code": "Chuyên đề 3",
      "title": "Ba đường conic và ứng dụng",
      "lessons": [
        {
          "code": "Bài 5",
          "title": "Elip"
        },
        {
          "code": "Bài 6",
          "title": "Hypebol"
        },
        {
          "code": "Bài 7",
          "title": "Parabol"
        },
        {
          "code": "Bài 8",
          "title": "Sự thống nhất giữa ba đường conic"
        }
      ]
    }
  ],
  "11": [
    {
      "code": "Chương I",
      "title": "Hàm số lượng giác và phương trình lượng giác",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Giá trị lượng giác của góc lượng giác"
        },
        {
          "code": "Bài 2",
          "title": "Công thức lượng giác"
        },
        {
          "code": "Bài 3",
          "title": "Hàm số lượng giác"
        },
        {
          "code": "Bài 4",
          "title": "Phương trình lượng giác cơ bản"
        }
      ]
    },
    {
      "code": "Chương II",
      "title": "Dãy số. Cấp số cộng và cấp số nhân",
      "lessons": [
        {
          "code": "Bài 5",
          "title": "Dãy số"
        },
        {
          "code": "Bài 6",
          "title": "Cấp số cộng"
        },
        {
          "code": "Bài 7",
          "title": "Cấp số nhân"
        }
      ]
    },
    {
      "code": "Chương III",
      "title": "Mẫu số liệu ghép nhóm",
      "lessons": [
        {
          "code": "Bài 8",
          "title": "Mẫu số liệu ghép nhóm"
        },
        {
          "code": "Bài 9",
          "title": "Các số đặc trưng đo xu thế trung tâm"
        }
      ]
    },
    {
      "code": "Chương IV",
      "title": "Quan hệ song song trong không gian",
      "lessons": [
        {
          "code": "Bài 10",
          "title": "Đường thẳng và mặt phẳng trong không gian"
        },
        {
          "code": "Bài 11",
          "title": "Hai đường thẳng song song"
        },
        {
          "code": "Bài 12",
          "title": "Đường thẳng và mặt phẳng song song"
        },
        {
          "code": "Bài 13",
          "title": "Hai mặt phẳng song song"
        },
        {
          "code": "Bài 14",
          "title": "Phép chiếu song song"
        }
      ]
    },
    {
      "code": "Chương V",
      "title": "Giới hạn. Hàm số liên tục",
      "lessons": [
        {
          "code": "Bài 15",
          "title": "Giới hạn của dãy số"
        },
        {
          "code": "Bài 16",
          "title": "Giới hạn của hàm số"
        },
        {
          "code": "Bài 17",
          "title": "Hàm số liên tục"
        }
      ]
    },
    {
      "code": "Chương VI",
      "title": "Hàm số mũ và hàm số lôgarit",
      "lessons": [
        {
          "code": "Bài 18",
          "title": "Lũy thừa với số mũ thực"
        },
        {
          "code": "Bài 19",
          "title": "Lôgarit"
        },
        {
          "code": "Bài 20",
          "title": "Hàm số mũ và hàm số lôgarit"
        },
        {
          "code": "Bài 21",
          "title": "Phương trình, bất phương trình mũ và lôgarit"
        }
      ]
    },
    {
      "code": "Chương VII",
      "title": "Quan hệ vuông góc trong không gian",
      "lessons": [
        {
          "code": "Bài 22",
          "title": "Hai đường thẳng vuông góc"
        },
        {
          "code": "Bài 23",
          "title": "Đường thẳng vuông góc với mặt phẳng"
        },
        {
          "code": "Bài 24",
          "title": "Phép chiếu vuông góc"
        },
        {
          "code": "Bài 25",
          "title": "Hai mặt phẳng vuông góc"
        },
        {
          "code": "Bài 26",
          "title": "Khoảng cách"
        },
        {
          "code": "Bài 27",
          "title": "Thể tích"
        }
      ]
    },
    {
      "code": "Chương VIII",
      "title": "Các quy tắc tính xác suất",
      "lessons": [
        {
          "code": "Bài 28",
          "title": "Biến cố hợp, biến cố giao, biến cố độc lập"
        },
        {
          "code": "Bài 29",
          "title": "Công thức cộng xác suất"
        },
        {
          "code": "Bài 30",
          "title": "Công thức nhân xác suất cho hai biến cố độc lập"
        }
      ]
    },
    {
      "code": "Chương IX",
      "title": "Đạo hàm",
      "lessons": [
        {
          "code": "Bài 31",
          "title": "Định nghĩa và ý nghĩa của đạo hàm"
        },
        {
          "code": "Bài 32",
          "title": "Các quy tắc tính đạo hàm"
        },
        {
          "code": "Bài 33",
          "title": "Đạo hàm cấp hai"
        }
      ]
    },
    {
      "code": "Chuyên đề 1",
      "title": "Phép biến hình trong mặt phẳng",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Phép biến hình"
        },
        {
          "code": "Bài 2",
          "title": "Phép tịnh tiến"
        },
        {
          "code": "Bài 3",
          "title": "Phép đối xứng trục"
        },
        {
          "code": "Bài 4",
          "title": "Phép quay và phép đối xứng tâm"
        },
        {
          "code": "Bài 5",
          "title": "Phép dời hình"
        },
        {
          "code": "Bài 6",
          "title": "Phép vị tự"
        },
        {
          "code": "Bài 7",
          "title": "Phép đồng dạng"
        }
      ]
    },
    {
      "code": "Chuyên đề 2",
      "title": "Làm quen với một vài khái niệm của lí thuyết đồ thị",
      "lessons": [
        {
          "code": "Bài 8",
          "title": "Một số khái niệm cơ bản"
        },
        {
          "code": "Bài 9",
          "title": "Đường đi Euler và đường đi Hamilton"
        },
        {
          "code": "Bài 10",
          "title": "Bài toán tìm lối đi tối ưu trong một vài trường hợp đơn giản"
        }
      ]
    },
    {
      "code": "Chuyên đề 3",
      "title": "Một số yếu tố về kĩ thuật",
      "lessons": [
        {
          "code": "Bài 11",
          "title": "Hình chiếu vuông góc và hình chiếu trục đo"
        },
        {
          "code": "Bài 12",
          "title": "Bản vẽ kĩ thuật"
        }
      ]
    }
  ],
  "12": [
    {
      "code": "Chương I",
      "title": "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Tính đơn điệu và cực trị của hàm số"
        },
        {
          "code": "Bài 2",
          "title": "Giá trị lớn nhất và giá trị nhỏ nhất của hàm số"
        },
        {
          "code": "Bài 3",
          "title": "Đường tiệm cận của đồ thị hàm số"
        },
        {
          "code": "Bài 4",
          "title": "Khảo sát sự biến thiên và vẽ đồ thị của hàm số"
        },
        {
          "code": "Bài 5",
          "title": "Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn"
        }
      ]
    },
    {
      "code": "Chương II",
      "title": "Vectơ và hệ trục tọa độ trong không gian",
      "lessons": [
        {
          "code": "Bài 6",
          "title": "Vectơ trong không gian"
        },
        {
          "code": "Bài 7",
          "title": "Hệ trục tọa độ trong không gian"
        },
        {
          "code": "Bài 8",
          "title": "Biểu thức tọa độ của các phép toán vectơ"
        }
      ]
    },
    {
      "code": "Chương III",
      "title": "Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm",
      "lessons": [
        {
          "code": "Bài 9",
          "title": "Khoảng biến thiên và khoảng tứ phân vị"
        },
        {
          "code": "Bài 10",
          "title": "Phương sai và độ lệch chuẩn"
        }
      ]
    },
    {
      "code": "Chương IV",
      "title": "Nguyên hàm và tích phân",
      "lessons": [
        {
          "code": "Bài 11",
          "title": "Nguyên hàm"
        },
        {
          "code": "Bài 12",
          "title": "Tích phân"
        },
        {
          "code": "Bài 13",
          "title": "Ứng dụng của tích phân"
        }
      ]
    },
    {
      "code": "Chương V",
      "title": "Phương pháp tọa độ trong không gian",
      "lessons": [
        {
          "code": "Bài 14",
          "title": "Phương trình mặt phẳng"
        },
        {
          "code": "Bài 15",
          "title": "Phương trình đường thẳng trong không gian"
        },
        {
          "code": "Bài 16",
          "title": "Công thức tính góc trong không gian"
        },
        {
          "code": "Bài 17",
          "title": "Phương trình mặt cầu"
        }
      ]
    },
    {
      "code": "Chương VI",
      "title": "Xác suất có điều kiện",
      "lessons": [
        {
          "code": "Bài 18",
          "title": "Xác suất có điều kiện"
        },
        {
          "code": "Bài 19",
          "title": "Công thức xác suất toàn phần và công thức Bayes"
        }
      ]
    },
    {
      "code": "Chuyên đề 1",
      "title": "Biến ngẫu nhiên rời rạc",
      "lessons": [
        {
          "code": "Bài 1",
          "title": "Biến ngẫu nhiên rời rạc và các số đặc trưng"
        },
        {
          "code": "Bài 2",
          "title": "Biến ngẫu nhiên có phân bố nhị thức và áp dụng"
        }
      ]
    },
    {
      "code": "Chuyên đề 2",
      "title": "Ứng dụng toán học để giải quyết một số bài toán tối ưu",
      "lessons": [
        {
          "code": "Bài 3",
          "title": "Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính"
        },
        {
          "code": "Bài 4",
          "title": "Vận dụng đạo hàm để giải quyết một số bài toán tối ưu"
        }
      ]
    },
    {
      "code": "Chuyên đề 3",
      "title": "Ứng dụng toán học trong một số vấn đề liên quan đến tài chính",
      "lessons": [
        {
          "code": "Bài 5",
          "title": "Tiền tệ. Lãi suất"
        },
        {
          "code": "Bài 6",
          "title": "Tín dụng. Vay nợ"
        },
        {
          "code": "Bài 7",
          "title": "Đầu tư tài chính. Lập kế hoạch tài chính cá nhân"
        }
      ]
    }
  ]
};

export const REVIEW_CURRICULUM = [
  {
    grade: 10,
    label: 'Toán 10',
    chapters: [],
  },
  {
    grade: 11,
    label: 'Toán 11',
    chapters: [],
  },
  {
    grade: 12,
    label: 'Toán 12',
    chapters: [],
  },
];
