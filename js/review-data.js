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

export const REVIEW_CURRICULUM = [
  {
    grade: 10,
    label: 'Toán 10',
    chapters: [
      {
        id: 'toan10-c1',
        grade: 10,
        code: 'Chương I',
        title: 'Mệnh đề và Tập hợp',
        comingSoon: true,
        lessons: [],
      },
      {
        id: 'toan10-c3',
        grade: 10,
        code: 'Chương III',
        title: 'Hệ thức lượng trong tam giác',
        comingSoon: true,
        lessons: [],
      },
    ],
  },
  {
    grade: 11,
    label: 'Toán 11',
    chapters: [
      {
        id: 'toan11-c1',
        grade: 11,
        code: 'Chương I',
        title: 'Hàm số lượng giác và Phương trình lượng giác',
        comingSoon: true,
        lessons: [],
      },
      {
        id: 'toan11-c2',
        grade: 11,
        code: 'Chương II',
        title: 'Dãy số, Cấp số cộng và Cấp số nhân',
        comingSoon: false,
        lessons: [
          // ===================================================================
          // BÀI 1: DÃY SỐ
          // ===================================================================
          {
            id: 'toan11-c2-b1',
            code: 'Bài 1',
            title: 'Dãy số',
            summary: 'Khái niệm dãy số, cách cho dãy số, xét tính tăng giảm và tính bị chặn của dãy số.',
            coreCards: [
              {
                id: 'b1-card-1',
                type: 'theory',
                title: 'Khái niệm dãy số và cách cho dãy số',
                content: `
                  <ul class="rv-bullet-list">
                    <li><strong>Dãy số vô hạn:</strong> Là một hàm số $u$ xác định trên tập các số nguyên dương $\\mathbb{N}^*$. Ký hiệu là $(u_n)$, dạng khai triển: $u_1, u_2, u_3, \\dots, u_n, \\dots$ với $u_1$ là số hạng đầu, $u_n$ là số hạng tổng quát (số hạng thứ $n$).</li>
                    <li>
                      <strong>Các cách cho dãy số phổ biến:</strong>
                      <ol class="rv-num-list">
                        <li>Liệt kê các số hạng.</li>
                        <li>Diễn đạt bằng lời.</li>
                        <li>Cho bằng công thức số hạng tổng quát $u_n = f(n)$.</li>
                        <li>Cho bằng phương pháp truy hồi (cho số hạng đầu và hệ thức liên hệ giữa $u_{n+1}$ với các số hạng trước đó).</li>
                      </ol>
                    </li>
                  </ul>
                `,
              },
              {
                id: 'b1-card-2',
                type: 'formula',
                title: 'Tiêu chuẩn xét tính tăng, giảm của dãy số',
                content: `
                  <ul class="rv-bullet-list">
                    <li>Dãy số $(u_n)$ là <strong>dãy số tăng</strong> nếu với mọi $n \\in \\mathbb{N}^*$: [CHE: $u_{n+1} > u_n$] (tương đương [CHE: $u_{n+1} - u_n > 0$]).</li>
                    <li>Dãy số $(u_n)$ là <strong>dãy số giảm</strong> nếu với mọi $n \\in \\mathbb{N}^*$: [CHE: $u_{n+1} < u_n$] (tương đương [CHE: $u_{n+1} - u_n < 0$]).</li>
                    <li>
                      <strong>Phương pháp xét tỉ số</strong> (chỉ áp dụng khi [CHE: $u_n > 0$ với mọi $n \\in \\mathbb{N}^*$]):
                      <ul class="rv-sub-list">
                        <li>Dãy tăng nếu [CHE: $\\dfrac{u_{n+1}}{u_n} > 1$].</li>
                        <li>Dãy giảm nếu [CHE: $\\dfrac{u_{n+1}}{u_n} < 1$].</li>
                      </ul>
                    </li>
                  </ul>
                `,
              },
              {
                id: 'b1-card-3',
                type: 'formula',
                title: 'Dãy số bị chặn',
                content: `
                  <ul class="rv-bullet-list">
                    <li>Dãy số $(u_n)$ <strong>bị chặn trên</strong> nếu tồn tại số $M$ sao cho [CHE: $u_n \\le M, \\forall n \\in \\mathbb{N}^*$].</li>
                    <li>Dãy số $(u_n)$ <strong>bị chặn dưới</strong> nếu tồn tại số $m$ sao cho [CHE: $u_n \\ge m, \\forall n \\in \\mathbb{N}^*$].</li>
                    <li>Dãy số $(u_n)$ <strong>bị chặn</strong> nếu nó vừa bị chặn trên vừa bị chặn dưới, tức là tồn tại $m, M$ sao cho [CHE: $m \\le u_n \\le M, \\forall n \\in \\mathbb{N}^*$].</li>
                  </ul>
                `,
              },
              {
                id: 'b1-card-4',
                type: 'warning',
                title: 'Lưu ý quan trọng',
                content: `
                  <ul class="rv-bullet-list">
                    <li>Không phải mọi dãy số đều tăng hoặc giảm (ví dụ dãy đan dấu $u_n = (-1)^n$ không tăng cũng không giảm).</li>
                    <li>Chỉ cần tính $u_1, u_2, u_3$ là có thể dự đoán tính tăng/giảm, nhưng để chứng minh bắt buộc phải kiểm tra với mọi $n \\in \\mathbb{N}^*$.</li>
                  </ul>
                `,
              },
            ],
            flipCards: [
              {
                id: 'b1-flip-1',
                title: 'Tình huống 1.1 • Xét tỉ số dãy âm',
                frontError:
                  'Xét tính tăng giảm của dãy $u_n = -2^n$. Học sinh lập tỉ số $\\dfrac{u_{n+1}}{u_n} = \\dfrac{-2^{n+1}}{-2^n} = 2 > 1$ rồi kết luận dãy số tăng. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Phương pháp xét tỉ số $\\dfrac{u_{n+1}}{u_n} > 1$ <strong>chỉ đúng khi mọi số hạng</strong> $u_n > 0$. Ở đây $u_n = -2^n < 0$ với mọi $n$. Khi chia hai vế cho số âm $u_n$, bất đẳng thức đổi chiều: $\\dfrac{u_{n+1}}{u_n} > 1 \\Leftrightarrow u_{n+1} < u_n$, nên dãy số này là <strong>dãy số giảm</strong>.',
              },
              {
                id: 'b1-flip-2',
                title: 'Tình huống 1.2 • Thay chỉ số $u_{n+1}$',
                frontError:
                  'Tính số hạng $u_{n+1}$ của dãy $u_n = \\dfrac{2n - 1}{n + 1}$. Học sinh viết $u_{n+1} = \\dfrac{2n - 1 + 1}{n + 1 + 1} = \\dfrac{2n}{n + 2}$. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Để tìm $u_{n+1}$, phải thay toàn bộ chữ $n$ bằng biểu thức $(n + 1)$ có dấu ngoặc. Cách đúng: $u_{n+1} = \\dfrac{2(n + 1) - 1}{(n + 1) + 1} = \\dfrac{2n + 1}{n + 2}$.',
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
                },
                {
                  id: 'b1-sa-2',
                  question:
                    'Cho dãy số $(u_n)$ với $u_n = \\dfrac{5n + 2}{n + 1}$. Tìm số nguyên $M$ nhỏ nhất sao cho $u_n < M$ với mọi $n \\in \\mathbb{N}^*$.',
                  correctAnswer: '5',
                  explanation:
                    'Ta có $u_n = 5 - \\dfrac{3}{n + 1} < 5$ với mọi $n \\ge 1$. Mặt khác khi $n \\ge 3$ thì $u_n > 4$, nên không thể chọn $M \\le 4$. Vậy giá trị nguyên nhỏ nhất của $M$ là $5$.',
                },
              ],
            },
            generators: [
              {
                id: 'gen-b1-term',
                title: 'Tính giá trị số hạng dãy số (Đổi số tự động)',
                generate() {
                  const a = randInt(2, 6);
                  const b = randNonZero(-5, 5);
                  const n = randInt(4, 12);
                  const K = a * n + b;
                  const bStr = fmtSignedConst(b);
                  return {
                    prompt: `Cho dãy số $(u_n)$ với $u_n = ${a}n ${bStr}$. Tính giá trị của số hạng $u_{${n}}$.`,
                    unitHint: 'Nhập kết quả là số nguyên',
                    answer: String(K),
                    solution: `Thay $n = ${n}$ vào công thức số hạng tổng quát:<br/>$$u_{${n}} = ${a} \\cdot ${n} ${bStr} = ${a * n} ${bStr} = ${K}$$`,
                  };
                },
              },
            ],
          },

          // ===================================================================
          // BÀI 2: CẤP SỐ CỘNG (CSC)
          // ===================================================================
          {
            id: 'toan11-c2-b2',
            code: 'Bài 2',
            title: 'Cấp số cộng (CSC)',
            summary: 'Định nghĩa công sai $d$, số hạng tổng quát $u_n$, tính chất 3 số hạng liên tiếp và tổng $S_n$ của CSC.',
            coreCards: [
              {
                id: 'b2-card-1',
                type: 'theory',
                title: 'Định nghĩa Cấp số cộng',
                content: `
                  <ul class="rv-bullet-list">
                    <li>
                      Cấp số cộng là một dãy số (hữu hạn hoặc vô hạn), trong đó kể từ số hạng thứ hai, mỗi số hạng đều bằng số hạng đứng ngay trước nó cộng với một số không đổi $d$ gọi là <strong>công sai</strong>:
                      $$u_{n+1} = u_n + d \\quad (\\forall n \\in \\mathbb{N}^*)$$
                    </li>
                    <li><strong>Dấu hiệu nhận biết nhanh:</strong> Hiệu $u_{n+1} - u_n = d$ là một hằng số không phụ thuộc vào $n$.</li>
                    <li>Nếu $d > 0$: CSC tăng; nếu $d < 0$: CSC giảm; nếu $d = 0$: CSC là dãy không đổi.</li>
                  </ul>
                `,
              },
              {
                id: 'b2-card-2',
                type: 'formula',
                title: 'Các công thức cốt lõi của Cấp số cộng',
                content: `
                  <ul class="rv-bullet-list">
                    <li><strong>Số hạng tổng quát:</strong> Với $n \\ge 2$, ta có $u_n =$ [CHE: $u_1 + (n - 1)d$].</li>
                    <li><strong>Liên hệ hai số hạng bất kỳ:</strong> $u_m - u_k =$ [CHE: $(m - k)d$].</li>
                    <li><strong>Tính chất 3 số hạng liên tiếp:</strong> Ba số $a, b, c$ theo thứ tự lập thành CSC khi và chỉ khi [CHE: $a + c = 2b$] (hay $b =$ [CHE: $\\dfrac{a + c}{2}$]).</li>
                    <li>
                      <strong>Tổng $n$ số hạng đầu tiên $S_n = u_1 + u_2 + \\dots + u_n$:</strong>
                      <ul class="rv-sub-list">
                        <li>Dạng 1 (biết $u_1$ và $u_n$): $S_n =$ [CHE: $\\dfrac{n(u_1 + u_n)}{2}$].</li>
                        <li>Dạng 2 (biết $u_1$ và $d$): $S_n =$ [CHE: $\\dfrac{n}{2}[2u_1 + (n - 1)d]$].</li>
                      </ul>
                    </li>
                  </ul>
                `,
              },
              {
                id: 'b2-card-3',
                type: 'warning',
                title: 'Mẹo giải nhanh hệ phương trình CSC',
                content: `
                  <p style="margin:0;">Khi đề bài cho hệ phương trình liên quan đến nhiều số hạng như $u_2, u_5, u_7, \\dots$, chiến thuật tối ưu luôn là <strong>đưa tất cả về hai ẩn $u_1$ và $d$</strong> bằng công thức $u_k = u_1 + (k - 1)d$ để giải hệ bậc nhất hai ẩn.</p>
                `,
              },
            ],
            flipCards: [
              {
                id: 'b2-flip-1',
                title: 'Tình huống 2.1 • Nhầm hệ số công sai d',
                frontError:
                  'Cho CSC có $u_1 = 3, d = 2$. Học sinh tính số hạng thứ 10 là $u_{10} = 3 + 10 \\cdot 2 = 23$. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Quên trừ 1 ở hệ số của $d$. Công thức chuẩn là $u_n = u_1 + (n - 1)d$, do đó $u_{10} = u_1 + 9d = 3 + 9 \\cdot 2 = 21$.',
              },
              {
                id: 'b2-flip-2',
                title: 'Tình huống 2.2 • Quên nhân 2 trước $u_1$ khi tính $S_n$',
                frontError:
                  'Tính tổng 10 số hạng đầu với $u_1 = 3, d = 2$. Học sinh viết $S_{10} = \\dfrac{10}{2}[u_1 + 9d] = 5(3 + 18) = 105$. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Thiếu hệ số $2$ trước $u_1$ trong ngoặc vuông! Công thức đúng là $S_n = \\dfrac{n}{2}[2u_1 + (n - 1)d]$, suy ra $S_{10} = \\dfrac{10}{2}[2 \\cdot 3 + 9 \\cdot 2] = 5 \\cdot 24 = 120$.',
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
                },
                {
                  id: 'b2-sa-2',
                  question:
                    'Một người xếp các khối gỗ lập phương thành một tháp nhiều tầng. Tầng trên cùng có 1 khối, tầng thứ hai có 4 khối, tầng thứ ba có 7 khối,... cứ như vậy tầng dưới hơn tầng kề trên 3 khối gỗ. Nếu người đó dùng hết đúng 145 khối gỗ thì tháp gỗ có bao nhiêu tầng?',
                  correctAnswer: '10',
                  explanation:
                    'Ta có CSC với $u_1 = 1, d = 3$ và $S_n = 145$. Phương trình: $\\dfrac{n}{2}[2 \\cdot 1 + 3(n - 1)] = 145 \\Leftrightarrow 3n^2 - n - 290 = 0 \\Leftrightarrow n = 10$ (nhận) hoặc $n = -\\dfrac{29}{3}$ (loại).',
                },
              ],
            },
            generators: [
              {
                id: 'gen-b2-csc',
                title: 'Tính số hạng tổng quát & Tổng n số hạng đầu CSC',
                _turn: 0,
                generate() {
                  const u1 = randInt(-10, 15);
                  const d = randNonZero(-6, 8);
                  const n = randInt(6, 20);
                  const isSum = this._turn++ % 2 === 1;
                  const dParen = fmtParenNeg(d);
                  const u1Paren = fmtParenNeg(u1);

                  if (!isSum) {
                    const ans = u1 + (n - 1) * d;
                    return {
                      prompt: `Cho cấp số cộng $(u_n)$ có số hạng đầu $u_1 = ${u1}$ và công sai $d = ${d}$. Tính giá trị số hạng $u_{${n}}$.`,
                      unitHint: 'Dạng A • Tính số hạng u_n',
                      answer: String(ans),
                      solution: `Áp dụng công thức $u_n = u_1 + (n - 1)d$:<br/>$$u_{${n}} = ${u1} + (${n} - 1) \\cdot ${dParen} = ${u1} + ${n - 1} \\cdot ${dParen} = ${ans}$$`,
                    };
                  }

                  const inside = 2 * u1 + (n - 1) * d;
                  const sum = (n * inside) / 2;
                  return {
                    prompt: `Cho cấp số cộng $(u_n)$ có số hạng đầu $u_1 = ${u1}$ và công sai $d = ${d}$. Tính tổng ${n} số hạng đầu tiên $S_{${n}}$.`,
                    unitHint: 'Dạng B • Tính tổng S_n',
                    answer: String(sum),
                    solution: `Áp dụng công thức $S_n = \\dfrac{n}{2}[2u_1 + (n - 1)d]$:<br/>$$S_{${n}} = \\frac{${n}}{2}\\left[2 \\cdot ${u1Paren} + (${n} - 1) \\cdot ${dParen}\\right] = \\frac{${n} \\cdot ${fmtParenNeg(inside)}}{2} = ${sum}$$`,
                  };
                },
              },
            ],
          },

          // ===================================================================
          // BÀI 3: CẤP SỐ NHÂN (CSN)
          // ===================================================================
          {
            id: 'toan11-c2-b3',
            code: 'Bài 3',
            title: 'Cấp số nhân (CSN)',
            summary: 'Định nghĩa công bội $q$, số hạng tổng quát $u_n$, trung bình nhân và tổng $S_n$ của Cấp số nhân.',
            coreCards: [
              {
                id: 'b3-card-1',
                type: 'theory',
                title: 'Định nghĩa Cấp số nhân',
                content: `
                  <ul class="rv-bullet-list">
                    <li>
                      Cấp số nhân là một dãy số (hữu hạn hoặc vô hạn), trong đó kể từ số hạng thứ hai, mỗi số hạng đều là tích của số hạng đứng ngay trước nó với một số không đổi $q$ gọi là <strong>công bội</strong>:
                      $$u_{n+1} = u_n \\cdot q \\quad (\\forall n \\in \\mathbb{N}^*)$$
                    </li>
                    <li><strong>Dấu hiệu nhận biết nhanh:</strong> Khi $u_n \\neq 0$, tỉ số $\\dfrac{u_{n+1}}{u_n} = q$ là hằng số không phụ thuộc vào $n$.</li>
                  </ul>
                `,
              },
              {
                id: 'b3-card-2',
                type: 'formula',
                title: 'Các công thức cốt lõi của Cấp số nhân',
                content: `
                  <ul class="rv-bullet-list">
                    <li><strong>Số hạng tổng quát:</strong> Với $n \\ge 2$, ta có $u_n =$ [CHE: $u_1 \\cdot q^{n-1}$].</li>
                    <li><strong>Liên hệ hai số hạng bất kỳ ($u_k \\neq 0$):</strong> $\\dfrac{u_m}{u_k} =$ [CHE: $q^{m-k}$].</li>
                    <li><strong>Tính chất 3 số hạng liên tiếp:</strong> Ba số $a, b, c$ theo thứ tự lập thành CSN khi và chỉ khi [CHE: $b^2 = a \\cdot c$] (hay $|b| =$ [CHE: $\\sqrt{ac}$]).</li>
                    <li>
                      <strong>Tổng $n$ số hạng đầu tiên $S_n = u_1 + u_2 + \\dots + u_n$:</strong>
                      <ul class="rv-sub-list">
                        <li>Nếu $q \\neq 1$: $S_n =$ [CHE: $u_1 \\cdot \\dfrac{1 - q^n}{1 - q}$] (hoặc [CHE: $u_1 \\cdot \\dfrac{q^n - 1}{q - 1}$]).</li>
                        <li>Nếu $q = 1$: $S_n =$ [CHE: $n \\cdot u_1$].</li>
                      </ul>
                    </li>
                  </ul>
                `,
              },
              {
                id: 'b3-card-3',
                type: 'warning',
                title: 'Hai bẫy cần đặc biệt cảnh giác',
                content: `
                  <ul class="rv-bullet-list">
                    <li><strong>Bẫy công bội $q = 1$:</strong> Công thức phân số $S_n = u_1 \\dfrac{1 - q^n}{1 - q}$ có mẫu số là $1 - q$, tuyệt đối không dùng khi $q = 1$.</li>
                    <li><strong>Bẫy khai căn chẵn:</strong> Khi giải $q^2 = 9$ hoặc $u_2^2 = 81$, nếu đề bài <strong>không</strong> cho thêm điều kiện "các số hạng đều dương" hay "$q > 0$", bắt buộc phải lấy <strong>cả hai giá trị dương và âm</strong> ($\\pm$).</li>
                  </ul>
                `,
              },
            ],
            flipCards: [
              {
                id: 'b3-flip-1',
                title: 'Tình huống 3.1 • Quên nghiệm âm khi khai căn',
                frontError:
                  'Ba số $2; x; 18$ theo thứ tự lập thành một cấp số nhân. Học sinh viết $x^2 = 2 \\cdot 18 = 36 \\Rightarrow x = 6$ và kết luận chỉ có 1 giá trị. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Thiếu nghiệm âm! Phương trình $x^2 = 36$ có <strong>hai nghiệm</strong> $x = 6$ (ứng với $q = 3$) và $x = -6$ (ứng với $q = -3$). Cả hai dãy $(2; 6; 18)$ và $(2; -6; 18)$ đều là cấp số nhân hợp lệ.',
              },
              {
                id: 'b3-flip-2',
                title: 'Tình huống 3.2 • Nhầm số mũ n với n − 1',
                frontError:
                  'Cho CSN có $u_1 = 2, q = 3$. Học sinh tính $u_5 = 2 \\cdot 3^5 = 486$. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Nhầm số mũ $n$ với $n - 1$. Công thức chuẩn là $u_n = u_1 \\cdot q^{n-1}$, nên $u_5 = u_1 \\cdot q^4 = 2 \\cdot 3^4 = 2 \\cdot 81 = 162$.',
              },
              {
                id: 'b3-flip-3',
                title: 'Tình huống 3.3 • Lệch mốc thời gian t = 0',
                frontError:
                  'Trong bài toán tăng trưởng vi khuẩn: ban đầu có 100 con, cứ sau 1 giờ nhân đôi. Học sinh gán $u_1 = 100, q = 2$ rồi tính số vi khuẩn sau 8 giờ là $u_8 = 100 \\cdot 2^7 = 12800$. <strong>Sai ở đâu?</strong>',
                backCorrection:
                  'Nhầm mốc chỉ số ban đầu! Ban đầu là thời điểm $t = 0$ (chưa qua giờ nào). Sau 1 giờ số vi khuẩn đã là $200$, sau 8 giờ phải nhân đôi đủ 8 lần: $100 \\cdot 2^8 = 25600$ con. <strong>Mẹo tránh sai:</strong> Gọi $u_1$ là kết quả <strong>sau 1 giờ</strong> ($u_1 = 200$), khi đó sau 8 giờ là $u_8 = 200 \\cdot 2^7 = 25600$.',
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
                },
                {
                  id: 'b3-sa-2',
                  question:
                    'Một quả bóng cao su được thả từ độ cao $16\\text{ m}$ xuống mặt đất. Mỗi lần chạm đất, quả bóng nảy lên độ cao bằng $\\dfrac{1}{2}$ độ cao ngay trước đó. Gọi $h_1, h_2, h_3, h_4$ lần lượt là độ cao lớn nhất mà quả bóng đạt được sau lần chạm đất thứ 1, 2, 3, 4. Tính tổng $h_1 + h_2 + h_3 + h_4$ (đơn vị: mét).',
                  correctAnswer: '15',
                  explanation:
                    'Độ cao các lần nảy lập thành CSN với $h_1 = 16 \\cdot \\dfrac{1}{2} = 8\\text{ m}$ và $q = \\dfrac{1}{2}$. Tổng cần tìm là $S_4 = 8 + 4 + 2 + 1 = 15\\text{ m}$.',
                },
              ],
            },
            generators: [
              {
                id: 'gen-b3-csn',
                title: 'Tính số hạng tổng quát & Tổng n số hạng đầu CSN',
                _turn: 0,
                generate() {
                  const u1 = randNonZero(-5, 6);
                  const q = pickRandom([-3, -2, 2, 3]);
                  const n = randInt(3, 6);
                  const isSum = this._turn++ % 2 === 1;
                  const qParen = fmtParenNeg(q);
                  const u1Paren = fmtParenNeg(u1);

                  if (!isSum) {
                    const qPow = Math.pow(q, n - 1);
                    const ans = u1 * qPow;
                    return {
                      prompt: `Cho cấp số nhân $(u_n)$ có số hạng đầu $u_1 = ${u1}$ và công bội $q = ${q}$. Tính giá trị số hạng $u_{${n}}$.`,
                      unitHint: 'Dạng A • Tính số hạng u_n',
                      answer: String(ans),
                      solution: `Áp dụng công thức $u_n = u_1 \\cdot q^{n - 1}$:<br/>$$u_{${n}} = ${u1Paren} \\cdot ${qParen}^{${n - 1}} = ${u1Paren} \\cdot ${fmtParenNeg(qPow)} = ${ans}$$`,
                    };
                  }

                  const qPowN = Math.pow(q, n);
                  const sum = (u1 * (qPowN - 1)) / (q - 1);
                  return {
                    prompt: `Cho cấp số nhân $(u_n)$ có số hạng đầu $u_1 = ${u1}$ và công bội $q = ${q}$. Tính tổng ${n} số hạng đầu tiên $S_{${n}}$.`,
                    unitHint: 'Dạng B • Tính tổng S_n',
                    answer: String(sum),
                    solution: `Áp dụng công thức $S_n = u_1 \\cdot \\dfrac{q^n - 1}{q - 1}$:<br/>$$S_{${n}} = ${u1Paren} \\cdot \\frac{${qParen}^{${n}} - 1}{${q} - 1} = ${u1Paren} \\cdot \\frac{${qPowN} - 1}{${q - 1}} = ${sum}$$`,
                  };
                },
              },
            ],
          },
        ],
      },
      {
        id: 'toan11-c3',
        grade: 11,
        code: 'Chương III',
        title: 'Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm',
        comingSoon: true,
        lessons: [],
      },
    ],
  },
  {
    grade: 12,
    label: 'Toán 12',
    chapters: [
      {
        id: 'toan12-c1',
        grade: 12,
        code: 'Chương I',
        title: 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
        comingSoon: true,
        lessons: [],
      },
      {
        id: 'toan12-c2',
        grade: 12,
        code: 'Chương II',
        title: 'Vectơ và hệ tọa độ trong không gian Oxyz',
        comingSoon: true,
        lessons: [],
      },
    ],
  },
];
