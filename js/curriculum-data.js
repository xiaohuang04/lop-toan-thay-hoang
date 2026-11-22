/**
 * Danh mục chương trình Toán THPT (Lớp 10 – Lớp 11 – Lớp 12)
 * Bộ SGK: Kết nối tri thức với cuộc sống (GDPT 2018)
 */

export const MATH_CURRICULUM = {
  '10': {
    grade: '10',
    label: 'Toán 10',
    chapters: [
      {
        id: '10-c1',
        volume: 'Tập 1',
        title: 'Chương I: Mệnh đề và tập hợp',
        lessons: [
          { id: '10-b1', code: 'Bài 1', title: 'Mệnh đề' },
          { id: '10-b2', code: 'Bài 2', title: 'Tập hợp và các phép toán trên tập hợp' },
        ],
      },
      {
        id: '10-c2',
        volume: 'Tập 1',
        title: 'Chương II: Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
        lessons: [
          { id: '10-b3', code: 'Bài 3', title: 'Bất phương trình bậc nhất hai ẩn' },
          { id: '10-b4', code: 'Bài 4', title: 'Hệ bất phương trình bậc nhất hai ẩn' },
        ],
      },
      {
        id: '10-c3',
        volume: 'Tập 1',
        title: 'Chương III: Hệ thức lượng trong tam giác',
        lessons: [
          { id: '10-b5', code: 'Bài 5', title: 'Giá trị lượng giác của một góc từ 0° đến 180°' },
          { id: '10-b6', code: 'Bài 6', title: 'Hệ thức lượng trong tam giác' },
        ],
      },
      {
        id: '10-c4',
        volume: 'Tập 1',
        title: 'Chương IV: Vectơ',
        lessons: [
          { id: '10-b7', code: 'Bài 7', title: 'Các khái niệm mở đầu' },
          { id: '10-b8', code: 'Bài 8', title: 'Tổng và hiệu của hai vectơ' },
          { id: '10-b9', code: 'Bài 9', title: 'Tích của một vectơ với một số' },
          { id: '10-b10', code: 'Bài 10', title: 'Vectơ trong mặt phẳng tọa độ' },
          { id: '10-b11', code: 'Bài 11', title: 'Tích vô hướng của hai vectơ' },
        ],
      },
      {
        id: '10-c5',
        volume: 'Tập 1',
        title: 'Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm',
        lessons: [
          { id: '10-b12', code: 'Bài 12', title: 'Số gần đúng và sai số' },
          { id: '10-b13', code: 'Bài 13', title: 'Các số đặc trưng đo xu thế trung tâm' },
          { id: '10-b14', code: 'Bài 14', title: 'Các số đặc trưng đo độ phân tán' },
        ],
      },
      {
        id: '10-c6',
        volume: 'Tập 2',
        title: 'Chương VI: Hàm số, đồ thị và ứng dụng',
        lessons: [
          { id: '10-b15', code: 'Bài 15', title: 'Hàm số' },
          { id: '10-b16', code: 'Bài 16', title: 'Hàm số bậc hai' },
          { id: '10-b17', code: 'Bài 17', title: 'Dấu của tam thức bậc hai' },
          { id: '10-b18', code: 'Bài 18', title: 'Phương trình quy về phương trình bậc hai' },
        ],
      },
      {
        id: '10-c7',
        volume: 'Tập 2',
        title: 'Chương VII: Phương pháp tọa độ trong mặt phẳng',
        lessons: [
          { id: '10-b19', code: 'Bài 19', title: 'Phương trình đường thẳng' },
          { id: '10-b20', code: 'Bài 20', title: 'Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách' },
          { id: '10-b21', code: 'Bài 21', title: 'Đường tròn trong mặt phẳng tọa độ' },
          { id: '10-b22', code: 'Bài 22', title: 'Ba đường conic' },
        ],
      },
      {
        id: '10-c8',
        volume: 'Tập 2',
        title: 'Chương VIII: Đại số tổ hợp',
        lessons: [
          { id: '10-b23', code: 'Bài 23', title: 'Quy tắc đếm' },
          { id: '10-b24', code: 'Bài 24', title: 'Hoán vị, chỉnh hợp và tổ hợp' },
          { id: '10-b25', code: 'Bài 25', title: 'Nhị thức Newton' },
        ],
      },
      {
        id: '10-c9',
        volume: 'Tập 2',
        title: 'Chương IX: Tính xác suất theo định nghĩa cổ điển',
        lessons: [
          { id: '10-b26', code: 'Bài 26', title: 'Biến cố và định nghĩa cổ điển của xác suất' },
          { id: '10-b27', code: 'Bài 27', title: 'Thực hành tính xác suất theo định nghĩa cổ điển' },
          { id: '10-ot9', code: 'Ôn tập', title: 'Bài tập cuối chương IX' },
        ],
      },
    ],
  },

  '11': {
    grade: '11',
    label: 'Toán 11',
    chapters: [
      {
        id: '11-c1',
        volume: 'Tập 1',
        title: 'Chương I: Hàm số lượng giác và phương trình lượng giác',
        lessons: [
          { id: '11-b1', code: 'Bài 1', title: 'Giá trị lượng giác của góc lượng giác' },
          { id: '11-b2', code: 'Bài 2', title: 'Công thức lượng giác' },
          { id: '11-b3', code: 'Bài 3', title: 'Hàm số lượng giác' },
          { id: '11-b4', code: 'Bài 4', title: 'Phương trình lượng giác cơ bản' },
        ],
      },
      {
        id: '11-c2',
        volume: 'Tập 1',
        title: 'Chương II: Dãy số. Cấp số cộng và cấp số nhân',
        lessons: [
          { id: '11-b5', code: 'Bài 5', title: 'Dãy số' },
          { id: '11-b6', code: 'Bài 6', title: 'Cấp số cộng' },
          { id: '11-b7', code: 'Bài 7', title: 'Cấp số nhân' },
        ],
      },
      {
        id: '11-c3',
        volume: 'Tập 1',
        title: 'Chương III: Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm',
        lessons: [
          { id: '11-b8', code: 'Bài 8', title: 'Mẫu số liệu ghép nhóm' },
          { id: '11-b9', code: 'Bài 9', title: 'Các số đặc trưng đo xu thế trung tâm' },
        ],
      },
      {
        id: '11-c4',
        volume: 'Tập 1',
        title: 'Chương IV: Quan hệ song song trong không gian',
        lessons: [
          { id: '11-b10', code: 'Bài 10', title: 'Đường thẳng và mặt phẳng trong không gian' },
          { id: '11-b11', code: 'Bài 11', title: 'Hai đường thẳng song song' },
          { id: '11-b12', code: 'Bài 12', title: 'Đường thẳng và mặt phẳng song song' },
          { id: '11-b13', code: 'Bài 13', title: 'Hai mặt phẳng song song' },
          { id: '11-b14', code: 'Bài 14', title: 'Phép chiếu song song' },
        ],
      },
      {
        id: '11-c5',
        volume: 'Tập 1',
        title: 'Chương V: Giới hạn. Hàm số liên tục',
        lessons: [
          { id: '11-b15', code: 'Bài 15', title: 'Giới hạn của dãy số' },
          { id: '11-b16', code: 'Bài 16', title: 'Giới hạn của hàm số' },
          { id: '11-b17', code: 'Bài 17', title: 'Hàm số liên tục' },
        ],
      },
      {
        id: '11-c6',
        volume: 'Tập 2',
        title: 'Chương VI: Hàm số mũ và hàm số lôgarit',
        lessons: [
          { id: '11-b18', code: 'Bài 18', title: 'Lũy thừa với số mũ thực' },
          { id: '11-b19', code: 'Bài 19', title: 'Lôgarit' },
          { id: '11-b20', code: 'Bài 20', title: 'Hàm số mũ và hàm số lôgarit' },
          { id: '11-b21', code: 'Bài 21', title: 'Phương trình, bất phương trình mũ và lôgarit' },
        ],
      },
      {
        id: '11-c7',
        volume: 'Tập 2',
        title: 'Chương VII: Quan hệ vuông góc trong không gian',
        lessons: [
          { id: '11-b22', code: 'Bài 22', title: 'Hai đường thẳng vuông góc' },
          { id: '11-b23', code: 'Bài 23', title: 'Đường thẳng vuông góc với mặt phẳng' },
          { id: '11-b24', code: 'Bài 24', title: 'Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng' },
          { id: '11-b25', code: 'Bài 25', title: 'Hai mặt phẳng vuông góc' },
          { id: '11-b26', code: 'Bài 26', title: 'Khoảng cách' },
          { id: '11-b27', code: 'Bài 27', title: 'Thể tích' },
        ],
      },
      {
        id: '11-c8',
        volume: 'Tập 2',
        title: 'Chương VIII: Các quy tắc tính xác suất',
        lessons: [
          { id: '11-b28', code: 'Bài 28', title: 'Biến cố hợp, biến cố giao, biến cố độc lập' },
          { id: '11-b29', code: 'Bài 29', title: 'Công thức cộng xác suất' },
          { id: '11-b30', code: 'Bài 30', title: 'Công thức nhân xác suất cho hai biến cố độc lập' },
        ],
      },
      {
        id: '11-c9',
        volume: 'Tập 2',
        title: 'Chương IX: Đạo hàm',
        lessons: [
          { id: '11-b31', code: 'Bài 31', title: 'Định nghĩa và ý nghĩa của đạo hàm' },
          { id: '11-b32', code: 'Bài 32', title: 'Các quy tắc tính đạo hàm' },
          { id: '11-b33', code: 'Bài 33', title: 'Đạo hàm cấp hai' },
        ],
      },
    ],
  },

  '12': {
    grade: '12',
    label: 'Toán 12',
    chapters: [
      {
        id: '12-c1',
        volume: 'Tập 1',
        title: 'Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
        lessons: [
          { id: '12-b1', code: 'Bài 1', title: 'Tính đơn điệu và cực trị của hàm số' },
          { id: '12-b2', code: 'Bài 2', title: 'Giá trị lớn nhất và giá trị nhỏ nhất của hàm số' },
          { id: '12-b3', code: 'Bài 3', title: 'Đường tiệm cận của đồ thị hàm số' },
          { id: '12-b4', code: 'Bài 4', title: 'Khảo sát sự biến thiên và vẽ đồ thị của hàm số' },
          { id: '12-b5', code: 'Bài 5', title: 'Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn' },
        ],
      },
      {
        id: '12-c2',
        volume: 'Tập 1',
        title: 'Chương II: Vectơ và hệ trục tọa độ trong không gian',
        lessons: [
          { id: '12-b6', code: 'Bài 6', title: 'Vectơ trong không gian' },
          { id: '12-b7', code: 'Bài 7', title: 'Hệ trục tọa độ trong không gian' },
          { id: '12-b8', code: 'Bài 8', title: 'Biểu thức tọa độ của các phép toán vectơ' },
        ],
      },
      {
        id: '12-c3',
        volume: 'Tập 1',
        title: 'Chương III: Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm',
        lessons: [
          { id: '12-b9', code: 'Bài 9', title: 'Khoảng biến thiên và khoảng tứ phân vị' },
          { id: '12-b10', code: 'Bài 10', title: 'Phương sai và độ lệch chuẩn' },
        ],
      },
      {
        id: '12-c4',
        volume: 'Tập 2',
        title: 'Chương IV: Nguyên hàm và tích phân',
        lessons: [
          { id: '12-b11', code: 'Bài 11', title: 'Nguyên hàm' },
          { id: '12-b12', code: 'Bài 12', title: 'Tích phân' },
          { id: '12-b13', code: 'Bài 13', title: 'Ứng dụng hình học của tích phân' },
        ],
      },
      {
        id: '12-c5',
        volume: 'Tập 2',
        title: 'Chương V: Phương pháp tọa độ trong không gian',
        lessons: [
          { id: '12-b14', code: 'Bài 14', title: 'Phương trình mặt phẳng' },
          { id: '12-b15', code: 'Bài 15', title: 'Phương trình đường thẳng trong không gian' },
          { id: '12-b16', code: 'Bài 16', title: 'Công thức tính góc trong không gian' },
          { id: '12-b17', code: 'Bài 17', title: 'Phương trình mặt cầu' },
        ],
      },
      {
        id: '12-c6',
        volume: 'Tập 2',
        title: 'Chương VI: Xác suất có điều kiện',
        lessons: [
          { id: '12-b18', code: 'Bài 18', title: 'Xác suất có điều kiện' },
          { id: '12-b19', code: 'Bài 19', title: 'Công thức xác suất toàn phần và công thức Bayes' },
        ],
      },
    ],
  },
};

export function findLessonInfo(lessonId) {
  for (const gradeObj of Object.values(MATH_CURRICULUM)) {
    for (const ch of gradeObj.chapters) {
      for (const ls of ch.lessons) {
        if (ls.id === lessonId) {
          return { grade: gradeObj.grade, chapter: ch, lesson: ls };
        }
      }
    }
  }
  return null;
}
