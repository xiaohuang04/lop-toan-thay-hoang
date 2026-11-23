"""Built-in official annual teaching plans (Kế hoạch dạy học & ĐDDH) for Math Grades 10, 11, 12.

Format conventions:
- First period of a lesson: `Bài X. [Tên bài]`
- Subsequent periods of the same lesson: `Bài X. [Tên bài] (tt)`
- Detailed section/progress info lives in `note` (e.g. `Mục 1, 2, 3`, `Đến hết Luyện tập 2`, `Hướng dẫn giải bài tập cuối bài`).
- Teaching aids (`equipment`) follow the official Kế hoạch sử dụng đồ dùng dạy học per period; Chuyên đề periods have empty equipment.
"""

from __future__ import annotations


def _row(
    ppct: int,
    term: int,
    lesson_name: str,
    note: str = "",
    equipment: str = "",
    *,
    is_special: bool = False,
    is_midterm: bool = False,
    chapter: str = "",
) -> dict:
    item = {
        "ppct": ppct,
        "term": term,
        "isSpecialTopic": is_special,
        "lessonName": lesson_name,
        "note": note,
        "equipment": "" if is_special else equipment,
    }
    if chapter:
        item["chapter"] = chapter
    if is_midterm:
        item["isMidterm"] = True
    return item


def _apply_equipment(rows: list[dict], ranges: list[tuple[list[int], str]]) -> None:
    by_ppct = {r["ppct"]: r for r in rows if not r.get("isSpecialTopic")}
    for ppcts, equip in ranges:
        for p in ppcts:
            if p in by_ppct:
                by_ppct[p]["equipment"] = equip


def build_grade10_plan() -> list[dict]:
    regular: list[dict] = [
        # ==================== HỌC KÌ I (Tiết 1 - 54) ====================
        # Chương I: Mệnh đề và tập hợp (8t)
        _row(1, 1, "Bài 1. Mệnh đề", "Mục 1, 2, 3", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(2, 1, "Bài 1. Mệnh đề (tt)", "Mục 3 (tt), 4, 5", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(3, 1, "Bài 1. Mệnh đề (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(4, 1, "Bài 2. Tập hợp và các phép toán trên tập hợp", "Mục 1", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(5, 1, "Bài 2. Tập hợp và các phép toán trên tập hợp (tt)", "Mục 2", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(6, 1, "Bài 2. Tập hợp và các phép toán trên tập hợp (tt)", "Mục 3", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(7, 1, "Bài 2. Tập hợp và các phép toán trên tập hợp (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Mệnh đề và tập hợp"),
        _row(8, 1, "Bài tập cuối chương I", "", chapter="Chương I: Mệnh đề và tập hợp"),
        # Chương II: Bất phương trình và hệ bất phương trình bậc nhất hai ẩn (7t)
        _row(9, 1, "Bài 3. Bất phương trình bậc nhất hai ẩn", "Mục 1, mục 2 (đến trước VD4)", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(10, 1, "Bài 3. Bất phương trình bậc nhất hai ẩn (tt)", "Mục 2 (tt) + Luyện tập", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(11, 1, "Bài 4. Hệ bất phương trình bậc nhất hai ẩn", "Mục 1, 2", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(12, 1, "Bài 4. Hệ bất phương trình bậc nhất hai ẩn (tt)", "Mục 3", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(13, 1, "Bài 4. Hệ bất phương trình bậc nhất hai ẩn (tt)", "Luyện tập", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(14, 1, "Bài 4. Hệ bất phương trình bậc nhất hai ẩn (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        _row(15, 1, "Bài tập ôn tập chương II", "", chapter="Chương II: BPT và hệ BPT bậc nhất hai ẩn"),
        # Chương III: Hệ thức lượng trong tam giác (7t)
        _row(16, 1, "Bài 5. Giá trị lượng giác của một góc từ 0° đến 180°", "Mục 1", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(17, 1, "Bài 5. Giá trị lượng giác của một góc từ 0° đến 180° (tt)", "Mục 2 + Sửa bài tập cuối bài", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(18, 1, "Bài 6. Hệ thức lượng trong tam giác", "Mục 1", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(19, 1, "Bài 6. Hệ thức lượng trong tam giác (tt)", "Mục 2, 3", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(20, 1, "Bài 6. Hệ thức lượng trong tam giác (tt)", "Mục 4", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(21, 1, "Bài 6. Hệ thức lượng trong tam giác (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương III: Hệ thức lượng trong tam giác"),
        _row(22, 1, "Bài tập ôn tập cuối chương III", "", chapter="Chương III: Hệ thức lượng trong tam giác"),
        # Giữa kì I
        _row(23, 1, "Ôn tập giữa kì I", ""),
        _row(24, 1, "Kiểm tra giữa kì I", "", is_midterm=True),
        _row(25, 1, "Kiểm tra giữa kì I (tt)", "", is_midterm=True),
        # Chương IV: Vectơ (13t)
        _row(26, 1, "Bài 7. Các khái niệm mở đầu", "Mục 1, 2 — Kết thúc ở Luyện tập 2", chapter="Chương IV: Vectơ"),
        _row(27, 1, "Bài 7. Các khái niệm mở đầu (tt)", "Mục 2 (tt) — Bắt đầu từ VD3 + Sửa bài tập cuối bài", chapter="Chương IV: Vectơ"),
        _row(28, 1, "Bài 8. Tổng và hiệu của hai vectơ", "Mục 1, 2 — Kết thúc ở Ví dụ 3", chapter="Chương IV: Vectơ"),
        _row(29, 1, "Bài 8. Tổng và hiệu của hai vectơ (tt)", "Mục 2 (tt) — Bắt đầu ở Luyện tập 2 + Sửa bài tập cuối bài", chapter="Chương IV: Vectơ"),
        _row(30, 1, "Bài 9. Tích của một vectơ với một số", "Mục 1, 2 — Kết thúc ở khung kiến thức về tính chất", chapter="Chương IV: Vectơ"),
        _row(31, 1, "Bài 9. Tích của một vectơ với một số (tt)", "Mục 2 (tt) — Bắt đầu từ VD2 + Sửa bài tập cuối bài", chapter="Chương IV: Vectơ"),
        _row(32, 1, "Bài 10. Vectơ trong mặt phẳng tọa độ", "Mục 1, 2 — Khung kiến thức khoảng cách giữa hai điểm", chapter="Chương IV: Vectơ"),
        _row(33, 1, "Bài 10. Vectơ trong mặt phẳng tọa độ (tt)", "Mục 2 — Ví dụ và luyện tập", chapter="Chương IV: Vectơ"),
        _row(34, 1, "Bài 10. Vectơ trong mặt phẳng tọa độ (tt)", "Vận dụng và sửa bài tập cuối bài", chapter="Chương IV: Vectơ"),
        _row(35, 1, "Bài 11. Tích vô hướng của hai vectơ", "Mục 1, 2", chapter="Chương IV: Vectơ"),
        _row(36, 1, "Bài 11. Tích vô hướng của hai vectơ (tt)", "Mục 3 — Từ đầu mục 3 đến hết tính chất của tích vô hướng và chú ý đi kèm", chapter="Chương IV: Vectơ"),
        _row(37, 1, "Bài 11. Tích vô hướng của hai vectơ (tt)", "Ứng dụng của vectơ vào bài toán hình học, khái niệm công trong Vật lí (từ VD4) và sửa bài tập cuối bài", chapter="Chương IV: Vectơ"),
        _row(38, 1, "Bài tập cuối chương IV", "", chapter="Chương IV: Vectơ"),
        # Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm (8t)
        _row(39, 1, "Bài 12. Số gần đúng và sai số", "Mục 1, 2", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(40, 1, "Bài 12. Số gần đúng và sai số (tt)", "Mục 3 + Sửa bài tập cuối bài", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(41, 1, "Bài 13. Các số đặc trưng đo xu thế trung tâm", "Mục 1", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(42, 1, "Bài 13. Các số đặc trưng đo xu thế trung tâm (tt)", "Mục 2, 3 + Sửa bài tập cuối bài", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(43, 1, "Bài 14. Các số đặc trưng đo độ phân tán", "Mục 1", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(44, 1, "Bài 14. Các số đặc trưng đo độ phân tán (tt)", "Mục 2, 3", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(45, 1, "Bài 14. Các số đặc trưng đo độ phân tán (tt)", "Sửa bài tập cuối bài", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        _row(46, 1, "Bài tập cuối chương V", "", chapter="Chương V: Các số đặc trưng của mẫu số liệu không ghép nhóm"),
        # Hoạt động thực hành trải nghiệm (4t) & Cuối kì I
        _row(47, 1, "Tìm hiểu một số kiến thức về tài chính", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(48, 1, "Tìm hiểu một số kiến thức về tài chính (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(49, 1, "Mạng xã hội: Lợi và hại", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(50, 1, "Mạng xã hội: Lợi và hại (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(51, 1, "Ôn tập cuối kì I", ""),
        _row(52, 1, "Ôn tập cuối kì I (tt)", ""),
        _row(53, 1, "Kiểm tra cuối kì I", ""),
        _row(54, 1, "Kiểm tra cuối kì I (tt)", ""),
        # ==================== HỌC KÌ II (Tiết 55 - 105) ====================
        # Chương VI: Hàm số, đồ thị và ứng dụng (13t)
        _row(55, 2, "Bài 15. Hàm số", "Mục 1", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(56, 2, "Bài 15. Hàm số (tt)", "Mục 2", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(57, 2, "Bài 15. Hàm số (tt)", "Mục 3", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(58, 2, "Bài 15. Hàm số (tt)", "Hướng dẫn giải bài tập", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(59, 2, "Bài 16. Hàm số bậc hai", "Mục 1", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(60, 2, "Bài 16. Hàm số bậc hai (tt)", "Mục 2", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(61, 2, "Bài 16. Hàm số bậc hai (tt)", "Hướng dẫn giải bài tập", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(62, 2, "Bài 17. Dấu của tam thức bậc hai", "Mục 1", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(63, 2, "Bài 17. Dấu của tam thức bậc hai (tt)", "Mục 2", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(64, 2, "Bài 17. Dấu của tam thức bậc hai (tt)", "Hướng dẫn giải bài tập", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(65, 2, "Bài 18. Phương trình quy về phương trình bậc hai", "Nội dung lí thuyết đến hết Luyện tập 2", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(66, 2, "Bài 18. Phương trình quy về phương trình bậc hai (tt)", "Phần Vận dụng và hướng dẫn giải bài tập", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        _row(67, 2, "Bài tập cuối chương VI", "", chapter="Chương VI: Hàm số, đồ thị và ứng dụng"),
        # Chương VII: Phương pháp tọa độ trong mặt phẳng (12t)
        _row(68, 2, "Bài 19. Phương trình đường thẳng", "Phương trình tổng quát của đường thẳng; Vectơ chỉ phương của đường thẳng", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(69, 2, "Bài 19. Phương trình đường thẳng (tt)", "Phương trình tham số của đường thẳng; Hướng dẫn giải bài tập", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(70, 2, "Bài 20. Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách", "Vị trí tương đối giữa hai đường thẳng; Góc giữa hai đường thẳng", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(71, 2, "Bài 20. Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách (tt)", "Luyện tập Góc giữa hai đường thẳng; Khoảng cách từ một điểm đến một đường thẳng", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(72, 2, "Bài 20. Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách (tt)", "Hướng dẫn giải bài tập", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(73, 2, "Bài 21. Đường tròn trong mặt phẳng tọa độ", "Mục 1", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(74, 2, "Bài 21. Đường tròn trong mặt phẳng tọa độ (tt)", "Mục 2 + Hướng dẫn giải bài tập", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(75, 2, "Bài 22. Ba đường conic", "Elip; Định nghĩa Hypebol", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(76, 2, "Bài 22. Ba đường conic (tt)", "Phương trình chính tắc của Hypebol; Định nghĩa Parabol", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(77, 2, "Bài 22. Ba đường conic (tt)", "Phương trình chính tắc của Parabol; Một số ứng dụng của ba đường conic", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(78, 2, "Bài 22. Ba đường conic (tt)", "Hướng dẫn giải bài tập", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        _row(79, 2, "Bài tập cuối chương VII", "", chapter="Chương VII: Phương pháp tọa độ trong mặt phẳng"),
        # Giữa kì II
        _row(80, 2, "Ôn tập giữa kì II", ""),
        _row(81, 2, "Kiểm tra giữa kì II", "", is_midterm=True),
        _row(82, 2, "Kiểm tra giữa kì II (tt)", "", is_midterm=True),
        # Chương VIII: Đại số tổ hợp (11t)
        _row(83, 2, "Bài 23. Quy tắc đếm", "Mục 1", chapter="Chương VIII: Đại số tổ hợp"),
        _row(84, 2, "Bài 23. Quy tắc đếm (tt)", "Mục 2", chapter="Chương VIII: Đại số tổ hợp"),
        _row(85, 2, "Bài 23. Quy tắc đếm (tt)", "Mục 3", chapter="Chương VIII: Đại số tổ hợp"),
        _row(86, 2, "Bài 23. Quy tắc đếm (tt)", "Hướng dẫn giải bài tập", chapter="Chương VIII: Đại số tổ hợp"),
        _row(87, 2, "Bài 24. Hoán vị, chỉnh hợp và tổ hợp", "Mục 1, 2", chapter="Chương VIII: Đại số tổ hợp"),
        _row(88, 2, "Bài 24. Hoán vị, chỉnh hợp và tổ hợp (tt)", "Mục 3, 4", chapter="Chương VIII: Đại số tổ hợp"),
        _row(89, 2, "Bài 24. Hoán vị, chỉnh hợp và tổ hợp (tt)", "Mục 5 + Bài tập mục 4, 5", chapter="Chương VIII: Đại số tổ hợp"),
        _row(90, 2, "Bài 24. Hoán vị, chỉnh hợp và tổ hợp (tt)", "Hướng dẫn giải bài tập", chapter="Chương VIII: Đại số tổ hợp"),
        _row(91, 2, "Bài 25. Nhị thức Newton", "Khai triển lũy thừa của nhị thức với n = 4 bằng sơ đồ hình cây (đến hết Luyện tập 1)", chapter="Chương VIII: Đại số tổ hợp"),
        _row(92, 2, "Bài 25. Nhị thức Newton (tt)", "Khai triển lũy thừa với n = 5, vận dụng công thức nhị thức Newton và hướng dẫn giải bài tập", chapter="Chương VIII: Đại số tổ hợp"),
        _row(93, 2, "Bài tập ôn tập cuối chương VIII", "", chapter="Chương VIII: Đại số tổ hợp"),
        # Chương IX: Tính xác suất theo định nghĩa cổ điển (6t)
        _row(94, 2, "Bài 26. Biến cố và định nghĩa cổ điển của xác suất", "Mục 1", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        _row(95, 2, "Bài 26. Biến cố và định nghĩa cổ điển của xác suất (tt)", "Mục 2, 3 + Hướng dẫn giải bài tập", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        _row(96, 2, "Bài 27. Thực hành tính xác suất theo định nghĩa cổ điển", "Mục 1, 2", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        _row(97, 2, "Bài 27. Thực hành tính xác suất theo định nghĩa cổ điển (tt)", "Mục 3", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        _row(98, 2, "Bài 27. Thực hành tính xác suất theo định nghĩa cổ điển (tt)", "Hướng dẫn giải bài tập", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        _row(99, 2, "Bài tập ôn tập cuối chương IX", "", chapter="Chương IX: Tính xác suất theo định nghĩa cổ điển"),
        # HĐTN (3t) & Cuối năm
        _row(100, 2, "Một số nội dung cho hoạt động trải nghiệm hình học", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(101, 2, "Một số nội dung cho hoạt động trải nghiệm hình học (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(102, 2, "Ước tính số cá thể trong một quần thể", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(103, 2, "Ôn tập cuối năm", ""),
        _row(104, 2, "Kiểm tra cuối năm", ""),
        _row(105, 2, "Kiểm tra cuối năm (tt)", ""),
    ]

    # Kế hoạch sử dụng ĐDDH Lớp 10
    _apply_equipment(
        regular,
        [
            ([5, 6], "Bộ thiết bị để vẽ trên bảng (thước, compa)"),
            ([9, 10], "Thước kẻ, Bảng phụ quy tắc biểu diễn miền nghiệm của BPT bậc nhất hai ẩn"),
            ([16, 17], "Máy tính cầm tay"),
            ([18, 19, 20], "Bảng phụ định lí cosin, định lí sin và công thức tính diện tích tam giác"),
            ([28, 29], "Bảng phụ các công thức tính tổng, hiệu của hai vectơ"),
            ([30, 31], "Bảng phụ các công thức tính tích của vectơ với một số, tọa độ trung điểm, trọng tâm"),
            ([35, 36], "Bảng phụ các ứng dụng của tích vô hướng"),
            ([40, 41, 42], "Máy tính cầm tay"),
            ([43, 44, 45], "Máy tính cầm tay"),
            ([59, 60], "Bảng đồ thị hàm số bậc hai"),
            ([75, 76, 77], "Mô hình 3 đường conic"),
            ([94, 95], "Bộ thiết bị dạy học về thống kê và xác suất (1 quân xúc xắc, 1 hộp nhựa, 2 đồng xu, 1 hộp 3 quả bóng xanh-đỏ-vàng)"),
        ],
    )

    special: list[dict] = [
        # ==================== CHUYÊN ĐỀ TOÁN 10 — HỌC KÌ I (1 - 18) ====================
        _row(1, 1, "Bài 1. Hệ phương trình bậc nhất ba ẩn", "Mục 1", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(2, 1, "Bài 1. Hệ phương trình bậc nhất ba ẩn (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(3, 1, "Bài 1. Hệ phương trình bậc nhất ba ẩn (tt)", "Mục 2 (tt)", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(4, 1, "Bài 1. Hệ phương trình bậc nhất ba ẩn (tt)", "Mục 3", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(5, 1, "Bài 1. Hệ phương trình bậc nhất ba ẩn (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(6, 1, "Bài 2. Ứng dụng của Hệ phương trình bậc nhất ba ẩn", "Mục 1", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(7, 1, "Bài 2. Ứng dụng của Hệ phương trình bậc nhất ba ẩn (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(8, 1, "Bài 2. Ứng dụng của Hệ phương trình bậc nhất ba ẩn (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(9, 1, "Bài 2. Ứng dụng của Hệ phương trình bậc nhất ba ẩn (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(10, 1, "Bài tập cuối chuyên đề 1", "", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(11, 1, "Bài tập cuối chuyên đề 1 (tt)", "", is_special=True, chapter="Chuyên đề 1: Hệ phương trình bậc nhất ba ẩn"),
        _row(12, 1, "Bài 3. Phương pháp quy nạp Toán học", "Mục 1", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(13, 1, "Bài 3. Phương pháp quy nạp Toán học (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(14, 1, "Bài 3. Phương pháp quy nạp Toán học (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(15, 1, "Bài 3. Phương pháp quy nạp Toán học (tt)", "Luyện tập (tt)", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(16, 1, "Bài tập cuối chuyên đề 2", "", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(17, 1, "Ôn tập và kiểm tra", "", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(18, 1, "Ôn tập và kiểm tra (tt)", "", is_special=True, chapter="Chuyên đề 2: Phương pháp quy nạp toán học. Nhị thức Newton"),
        # ==================== CHUYÊN ĐỀ TOÁN 10 — HỌC KÌ II (19 - 35) ====================
        _row(19, 2, "Bài 5. Elip", "Mục 1", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(20, 2, "Bài 5. Elip (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(21, 2, "Bài 5. Elip (tt)", "Hướng dẫn giải bài tập", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(22, 2, "Bài 6. Hypebol", "Mục 1", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(23, 2, "Bài 6. Hypebol (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(24, 2, "Bài 6. Hypebol (tt)", "Hướng dẫn giải bài tập", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(25, 2, "Bài 7. Parabol", "", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(26, 2, "Bài 7. Parabol (tt)", "Hướng dẫn giải bài tập", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(27, 2, "Bài 8. Sự thống nhất giữa ba đường conic", "", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(28, 2, "Bài 8. Sự thống nhất giữa ba đường conic (tt)", "Hướng dẫn giải bài tập", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(29, 2, "Ôn tập cuối chuyên đề 3", "", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(30, 2, "Ôn tập cuối chuyên đề 3 (tt)", "", is_special=True, chapter="Chuyên đề 3: Ba đường conic và ứng dụng"),
        _row(31, 2, "Bài 4. Nhị thức Newton", "Mục 1", is_special=True, chapter="Chuyên đề 2 (tt): Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(32, 2, "Bài 4. Nhị thức Newton (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 2 (tt): Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(33, 2, "Bài 4. Nhị thức Newton (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 2 (tt): Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(34, 2, "Bài 4. Nhị thức Newton (tt)", "Hướng dẫn giải bài tập", is_special=True, chapter="Chuyên đề 2 (tt): Phương pháp quy nạp toán học. Nhị thức Newton"),
        _row(35, 2, "Ôn tập cuối chuyên đề 2", "", is_special=True, chapter="Chuyên đề 2 (tt): Phương pháp quy nạp toán học. Nhị thức Newton"),
    ]

    return regular + special


def build_grade11_plan() -> list[dict]:
    regular: list[dict] = [
        # ==================== HỌC KÌ I (Tiết 1 - 54) ====================
        # Chương I: Hàm số lượng giác và phương trình lượng giác (10t)
        _row(1, 1, "Bài 1. Giá trị lượng giác của góc lượng giác", "Mục 1, 2", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(2, 1, "Bài 1. Giá trị lượng giác của góc lượng giác (tt)", "Mục 3", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(3, 1, "Bài 1. Giá trị lượng giác của góc lượng giác (tt)", "Mục 4 + Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(4, 1, "Bài 2. Công thức lượng giác", "Mục 1, 2", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(5, 1, "Bài 2. Công thức lượng giác (tt)", "Mục 3, 4 + Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(6, 1, "Bài 3. Hàm số lượng giác", "Mục 1, 2, 3", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(7, 1, "Bài 3. Hàm số lượng giác (tt)", "Mục 4, 5, 6 + Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(8, 1, "Bài 4. Phương trình lượng giác cơ bản", "Mục 1, 2, 3", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(9, 1, "Bài 4. Phương trình lượng giác cơ bản (tt)", "Mục 4, 5, 6 + Hướng dẫn giải bài tập cuối bài", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        _row(10, 1, "Bài tập cuối chương I", "", chapter="Chương I: Hàm số lượng giác và phương trình lượng giác"),
        # Chương II: Dãy số. Cấp số cộng và cấp số nhân (7t)
        _row(11, 1, "Bài 5. Dãy số", "Mục 1, 2", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(12, 1, "Bài 5. Dãy số (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(13, 1, "Bài 6. Cấp số cộng", "Mục 1, 2", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(14, 1, "Bài 6. Cấp số cộng (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(15, 1, "Bài 7. Cấp số nhân", "Mục 1, 2", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(16, 1, "Bài 7. Cấp số nhân (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        _row(17, 1, "Bài tập ôn tập chương II", "", chapter="Chương II: Dãy số. Cấp số cộng và cấp số nhân"),
        # Chương III: Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm (4t)
        _row(18, 1, "Bài 8. Mẫu số liệu ghép nhóm", "", chapter="Chương III: Mẫu số liệu ghép nhóm"),
        _row(19, 1, "Bài 9. Các số đặc trưng đo xu thế trung tâm", "Mục 1, 2", chapter="Chương III: Mẫu số liệu ghép nhóm"),
        _row(20, 1, "Bài 9. Các số đặc trưng đo xu thế trung tâm (tt)", "Mục 3, 4 + Hướng dẫn giải bài tập cuối bài", chapter="Chương III: Mẫu số liệu ghép nhóm"),
        _row(21, 1, "Bài tập cuối chương III", "", chapter="Chương III: Mẫu số liệu ghép nhóm"),
        # Giữa kì I
        _row(22, 1, "Ôn tập giữa kì I", ""),
        _row(23, 1, "Kiểm tra giữa kì I", "", is_midterm=True),
        _row(24, 1, "Kiểm tra giữa kì I (tt)", "", is_midterm=True),
        # Chương IV: Quan hệ song song trong không gian (15t)
        _row(25, 1, "Bài 10. Đường thẳng và mặt phẳng trong không gian", "Từ đầu đến hết Vận dụng 1", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(26, 1, "Bài 10. Đường thẳng và mặt phẳng trong không gian (tt)", "Từ HĐ4 đến hết Vận dụng 2", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(27, 1, "Bài 10. Đường thẳng và mặt phẳng trong không gian (tt)", "Mục 4 + Hướng dẫn giải bài tập cuối bài", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(28, 1, "Bài 11. Hai đường thẳng song song", "Mục 1", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(29, 1, "Bài 11. Hai đường thẳng song song (tt)", "Mục 2", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(30, 1, "Bài 11. Hai đường thẳng song song (tt)", "Em có biết? + Hướng dẫn giải bài tập cuối bài", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(31, 1, "Bài 12. Đường thẳng và mặt phẳng song song", "Từ đầu đến hết Luyện tập 2", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(32, 1, "Bài 12. Đường thẳng và mặt phẳng song song (tt)", "Từ VD3 đến hết + Hướng dẫn giải bài tập cuối bài", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(33, 1, "Bài 13. Hai mặt phẳng song song", "Từ đầu đến hết Vận dụng 1", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(34, 1, "Bài 13. Hai mặt phẳng song song (tt)", "Từ HĐ3 đến hết HĐ5", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(35, 1, "Bài 13. Hai mặt phẳng song song (tt)", "Từ VD4 đến hết", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(36, 1, "Bài 13. Hai mặt phẳng song song (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(37, 1, "Bài 14. Phép chiếu song song", "Từ đầu đến VD2", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(38, 1, "Bài 14. Phép chiếu song song (tt)", "Từ LT2 đến hết Vận dụng 2 + Hướng dẫn giải bài tập cuối bài", chapter="Chương IV: Quan hệ song song trong không gian"),
        _row(39, 1, "Bài tập cuối chương IV", "", chapter="Chương IV: Quan hệ song song trong không gian"),
        # Chương V: Giới hạn. Hàm số liên tục (7t)
        _row(40, 1, "Bài 15. Giới hạn của dãy số", "Mục 1, 2", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(41, 1, "Bài 15. Giới hạn của dãy số (tt)", "Mục 3, 4 + Hướng dẫn giải bài tập cuối bài", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(42, 1, "Bài 16. Giới hạn của hàm số", "Mục 1", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(43, 1, "Bài 16. Giới hạn của hàm số (tt)", "Mục 2, 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(44, 1, "Bài 17. Hàm số liên tục", "Mục 1, 2", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(45, 1, "Bài 17. Hàm số liên tục (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        _row(46, 1, "Bài tập cuối chương V", "", chapter="Chương V: Giới hạn. Hàm số liên tục"),
        # HĐTN (4t) & Cuối kì I
        _row(47, 1, "Một vài áp dụng của Toán học trong tài chính", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(48, 1, "Một vài áp dụng của Toán học trong tài chính (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(49, 1, "Lực căng mặt ngoài của nước", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(50, 1, "Lực căng mặt ngoài của nước (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(51, 1, "Ôn tập cuối kì I", ""),
        _row(52, 1, "Ôn tập cuối kì I (tt)", ""),
        _row(53, 1, "Kiểm tra cuối kì I", ""),
        _row(54, 1, "Kiểm tra cuối kì I (tt)", ""),
        # ==================== HỌC KÌ II (Tiết 55 - 105) ====================
        # Chương VI: Hàm số mũ và hàm số lôgarit (8t)
        _row(55, 2, "Bài 18. Lũy thừa với số mũ thực", "Mục 1, 2", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(56, 2, "Bài 18. Lũy thừa với số mũ thực (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(57, 2, "Bài 19. Lôgarit", "Mục 1, 2", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(58, 2, "Bài 19. Lôgarit (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(59, 2, "Bài 20. Hàm số mũ và hàm số lôgarit", "", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(60, 2, "Bài 21. Phương trình, bất phương trình mũ và lôgarit", "Mục 1, 2", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(61, 2, "Bài 21. Phương trình, bất phương trình mũ và lôgarit (tt)", "Mục 3, 4", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        _row(62, 2, "Bài tập cuối chương VI", "", chapter="Chương VI: Hàm số mũ và hàm số lôgarit"),
        # Chương VII: Quan hệ vuông góc trong không gian (17t)
        _row(63, 2, "Bài 22. Hai đường thẳng vuông góc", "Từ đầu bài học đến hết câu hỏi sau định nghĩa hai đường thẳng vuông góc", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(64, 2, "Bài 22. Hai đường thẳng vuông góc (tt)", "Từ VD2 đến hết bài học", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(65, 2, "Bài 23. Đường thẳng vuông góc với mặt phẳng", "Mục 1", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(66, 2, "Bài 23. Đường thẳng vuông góc với mặt phẳng (tt)", "Mục 2", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(67, 2, "Bài 23. Đường thẳng vuông góc với mặt phẳng (tt)", "Mục 3 + Hướng dẫn giải bài tập cuối bài", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(68, 2, "Bài 24. Phép chiếu vuông góc", "Từ đầu đến hết nhận xét ở mục 2", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(69, 2, "Bài 24. Phép chiếu vuông góc (tt)", "Từ VD2 đến hết bài học + Hướng dẫn giải bài tập cuối bài", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(70, 2, "Bài 25. Hai mặt phẳng vuông góc", "Mục 1, 2", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(71, 2, "Bài 25. Hai mặt phẳng vuông góc (tt)", "Mục 3, 4", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(72, 2, "Bài 25. Hai mặt phẳng vuông góc (tt)", "Mục 5, 6", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(73, 2, "Bài 25. Hai mặt phẳng vuông góc (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(74, 2, "Bài 26. Khoảng cách", "Từ đầu bài học đến hết chú ý trước VD2", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(75, 2, "Bài 26. Khoảng cách (tt)", "Từ VD2 đến hết mục 3", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(76, 2, "Bài 26. Khoảng cách (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(77, 2, "Bài 27. Thể tích", "Từ đầu bài học đến hết Luyện tập 2", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(78, 2, "Bài 27. Thể tích (tt)", "Từ VD3 đến hết bài + Hướng dẫn giải bài tập cuối bài", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        _row(79, 2, "Bài tập cuối chương VII", "", chapter="Chương VII: Quan hệ vuông góc trong không gian"),
        # Giữa kì II
        _row(80, 2, "Ôn tập giữa kì II", ""),
        _row(81, 2, "Kiểm tra giữa kì II", "", is_midterm=True),
        _row(82, 2, "Kiểm tra giữa kì II (tt)", "", is_midterm=True),
        # Chương VIII: Các quy tắc tính xác suất (9t)
        _row(83, 2, "Bài 28. Biến cố hợp, biến cố giao, biến cố độc lập", "Từ đầu đến hết VD2", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(84, 2, "Bài 28. Biến cố hợp, biến cố giao, biến cố độc lập (tt)", "Từ LT2 đến hết bài", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(85, 2, "Bài 28. Biến cố hợp, biến cố giao, biến cố độc lập (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(86, 2, "Bài 29. Công thức cộng xác suất", "Mục 1", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(87, 2, "Bài 29. Công thức cộng xác suất (tt)", "Mục 2", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(88, 2, "Bài 29. Công thức cộng xác suất (tt)", "Hướng dẫn giải bài tập cuối bài", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(89, 2, "Bài 30. Công thức nhân xác suất cho hai biến cố độc lập", "Mục 1", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(90, 2, "Bài 30. Công thức nhân xác suất cho hai biến cố độc lập (tt)", "Mục 2", chapter="Chương VIII: Các quy tắc tính xác suất"),
        _row(91, 2, "Bài tập cuối chương VIII", "", chapter="Chương VIII: Các quy tắc tính xác suất"),
        # Chương IX: Đạo hàm (7t)
        _row(92, 2, "Bài 31. Định nghĩa và ý nghĩa của đạo hàm", "Mục 1, 2, 3", chapter="Chương IX: Đạo hàm"),
        _row(93, 2, "Bài 31. Định nghĩa và ý nghĩa của đạo hàm (tt)", "Mục 4 + Hướng dẫn giải bài tập", chapter="Chương IX: Đạo hàm"),
        _row(94, 2, "Bài 32. Các quy tắc tính đạo hàm", "Mục 1, 2", chapter="Chương IX: Đạo hàm"),
        _row(95, 2, "Bài 32. Các quy tắc tính đạo hàm (tt)", "Mục 3, 4", chapter="Chương IX: Đạo hàm"),
        _row(96, 2, "Bài 32. Các quy tắc tính đạo hàm (tt)", "Mục 5 + Hướng dẫn giải bài tập", chapter="Chương IX: Đạo hàm"),
        _row(97, 2, "Bài 33. Đạo hàm cấp hai", "", chapter="Chương IX: Đạo hàm"),
        _row(98, 2, "Bài tập cuối chương IX", "", chapter="Chương IX: Đạo hàm"),
        # HĐTN (3t) & Cuối năm
        _row(99, 2, "Một vài mô hình toán học sử dụng hàm số mũ và hàm số lôgarit", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(100, 2, "Hoạt động thực hành trải nghiệm hình học", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(101, 2, "Hoạt động thực hành trải nghiệm hình học (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(102, 2, "Ôn tập cuối năm", ""),
        _row(103, 2, "Ôn tập cuối năm (tt)", ""),
        _row(104, 2, "Kiểm tra cuối năm", ""),
        _row(105, 2, "Kiểm tra cuối năm (tt)", ""),
    ]

    # Kế hoạch sử dụng ĐDDH Lớp 11
    _apply_equipment(
        regular,
        [
            ([1, 2, 3], "Đường tròn lượng giác, Máy tính cầm tay"),
            ([4, 5], "Công thức lượng giác"),
            ([18], "Máy tính cầm tay"),
            ([19, 20], "Máy tính cầm tay"),
            ([25, 26, 27], "Mô hình hình chóp, hình tứ diện"),
            ([34, 35], "Mô hình hình hộp, hình lăng trụ"),
            ([57, 58], "Công thức lôgarit"),
            ([70, 71, 72], "Mô hình hình lăng trụ đứng, hình hộp chữ nhật, hình lập phương, hình chóp đều"),
            ([77, 78], "Mô hình các khối đa diện"),
            ([83, 84, 85], "Con xúc xắc, đồng xu, máy tính cầm tay"),
        ],
    )

    special: list[dict] = [
        # ==================== CHUYÊN ĐỀ TOÁN 11 — HỌC KÌ I (1 - 18) ====================
        _row(1, 1, "Bài 1. Phép biến hình", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(2, 1, "Bài 2. Phép tịnh tiến", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(3, 1, "Bài 2. Phép tịnh tiến (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(4, 1, "Bài 3. Phép đối xứng trục", "Mục 1", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(5, 1, "Bài 3. Phép đối xứng trục (tt)", "Mục 2 + Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(6, 1, "Bài 4. Phép quay và phép đối xứng tâm", "Mục 1", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(7, 1, "Bài 4. Phép quay và phép đối xứng tâm (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(8, 1, "Bài 4. Phép quay và phép đối xứng tâm (tt)", "Mục 3", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(9, 1, "Bài 4. Phép quay và phép đối xứng tâm (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(10, 1, "Bài 5. Phép dời hình", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(11, 1, "Bài 5. Phép dời hình (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(12, 1, "Bài 6. Phép vị tự", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(13, 1, "Bài 6. Phép vị tự (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(14, 1, "Bài 7. Phép đồng dạng", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(15, 1, "Bài 7. Phép đồng dạng (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(16, 1, "Bài tập cuối chuyên đề 1", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(17, 1, "Ôn tập và kiểm tra cuối chuyên đề 1", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        _row(18, 1, "Ôn tập và kiểm tra cuối chuyên đề 1 (tt)", "", is_special=True, chapter="Chuyên đề 1: Phép biến hình trong mặt phẳng"),
        # ==================== CHUYÊN ĐỀ TOÁN 11 — HỌC KÌ II (19 - 35) ====================
        _row(19, 2, "Bài 8. Một số khái niệm cơ bản", "Mục 1, 2", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(20, 2, "Bài 8. Một số khái niệm cơ bản (tt)", "Mục 3 + Luyện tập", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(21, 2, "Bài 9. Đường đi Euler và đường đi Hamilton", "Mục 1", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(22, 2, "Bài 9. Đường đi Euler và đường đi Hamilton (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(23, 2, "Bài 10. Bài toán tìm lối đi tối ưu trong một vài trường hợp đơn giản", "Mục 1", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(24, 2, "Bài 10. Bài toán tìm lối đi tối ưu trong một vài trường hợp đơn giản (tt)", "Mục 2 + Luyện tập", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(25, 2, "Bài tập cuối chuyên đề 2", "", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(26, 2, "Ôn tập cuối chuyên đề 2", "", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(27, 2, "Ôn tập cuối chuyên đề 2 (tt)", "", is_special=True, chapter="Chuyên đề 2: Làm quen với một vài khái niệm của lí thuyết đồ thị"),
        _row(28, 2, "Bài 11. Hình chiếu vuông góc và hình chiếu trục đo", "Mục 1, 2", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(29, 2, "Bài 11. Hình chiếu vuông góc và hình chiếu trục đo (tt)", "Mục 3, 4", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(30, 2, "Bài 11. Hình chiếu vuông góc và hình chiếu trục đo (tt)", "Luyện tập", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(31, 2, "Bài 12. Bản vẽ kĩ thuật", "Mục 1, 2", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(32, 2, "Bài 12. Bản vẽ kĩ thuật (tt)", "Mục 3", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(33, 2, "Bài tập cuối chuyên đề 3", "", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(34, 2, "Ôn tập cuối chuyên đề 3", "", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
        _row(35, 2, "Ôn tập cuối chuyên đề 3 (tt)", "", is_special=True, chapter="Chuyên đề 3: Một số yếu tố về kĩ thuật"),
    ]

    return regular + special


def build_grade12_plan() -> list[dict]:
    regular: list[dict] = [
        # ==================== HỌC KÌ I (Tiết 1 - 54) ====================
        # Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số (24t)
        _row(1, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số", "Mục 1a", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(2, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số (tt)", "Mục 1b", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(3, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số (tt)", "Mục 2a", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(4, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số (tt)", "Mục 2b", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(5, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số (tt)", "Bài tập", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(6, 1, "Bài 1. Tính đơn điệu và cực trị của hàm số (tt)", "Bài tập", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(7, 1, "Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số", "Mục 1", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(8, 1, "Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số (tt)", "Mục 2", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(9, 1, "Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số (tt)", "Bài tập", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(10, 1, "Bài 3. Đường tiệm cận của đồ thị hàm số", "Mục 1", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(11, 1, "Bài 3. Đường tiệm cận của đồ thị hàm số (tt)", "Mục 2", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(12, 1, "Bài 3. Đường tiệm cận của đồ thị hàm số (tt)", "Mục 3", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(13, 1, "Bài 3. Đường tiệm cận của đồ thị hàm số (tt)", "Bài tập", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(14, 1, "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số", "Mục 1", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(15, 1, "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số (tt)", "Mục 2", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(16, 1, "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số (tt)", "Mục 3a", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(17, 1, "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số (tt)", "Mục 3b", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(18, 1, "Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số (tt)", "Bài tập", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(19, 1, "Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn", "Mục 1", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(20, 1, "Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn (tt)", "Mục 1 (tt)", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(21, 1, "Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn (tt)", "Mục 2", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(22, 1, "Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn (tt)", "Mục 2 (tt)", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(23, 1, "Bài tập cuối chương I", "", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        _row(24, 1, "Bài tập cuối chương I (tt)", "", chapter="Chương I: Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số"),
        # Giữa kì I
        _row(25, 1, "Ôn tập giữa kì I", ""),
        _row(26, 1, "Kiểm tra giữa kì I", "", is_midterm=True),
        _row(27, 1, "Kiểm tra giữa kì I (tt)", "", is_midterm=True),
        # Chương II: Vectơ và hệ trục tọa độ trong không gian (14t)
        _row(28, 1, "Bài 6. Vectơ trong không gian", "Mục 1", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(29, 1, "Bài 6. Vectơ trong không gian (tt)", "Mục 2a", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(30, 1, "Bài 6. Vectơ trong không gian (tt)", "Mục 2b + Bài tập", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(31, 1, "Bài 6. Vectơ trong không gian (tt)", "Mục 3", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(32, 1, "Bài 6. Vectơ trong không gian (tt)", "Mục 4", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(33, 1, "Bài 6. Vectơ trong không gian (tt)", "Mục 4 + Bài tập", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(34, 1, "Bài 7. Hệ trục tọa độ trong không gian", "Mục 1, 2 đến LT3", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(35, 1, "Bài 7. Hệ trục tọa độ trong không gian (tt)", "Mục 2 đến LT5", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(36, 1, "Bài 7. Hệ trục tọa độ trong không gian (tt)", "Vận dụng + Bài tập", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(37, 1, "Bài 8. Biểu thức tọa độ của các phép toán vectơ", "Mục 1", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(38, 1, "Bài 8. Biểu thức tọa độ của các phép toán vectơ (tt)", "Mục 2", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(39, 1, "Bài 8. Biểu thức tọa độ của các phép toán vectơ (tt)", "Mục 3", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(40, 1, "Bài tập cuối chương II", "", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        _row(41, 1, "Bài tập cuối chương II (tt)", "", chapter="Chương II: Vectơ và hệ trục tọa độ trong không gian"),
        # Chương III: Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm (4t)
        _row(42, 1, "Bài 9. Khoảng biến thiên và khoảng tứ phân vị", "", chapter="Chương III: Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm"),
        _row(43, 1, "Bài 10. Phương sai và độ lệch chuẩn", "Mục 1", chapter="Chương III: Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm"),
        _row(44, 1, "Bài 10. Phương sai và độ lệch chuẩn (tt)", "Mục 2", chapter="Chương III: Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm"),
        _row(45, 1, "Bài tập cuối chương III", "", chapter="Chương III: Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm"),
        # HĐTN (5t) & Cuối kì I
        _row(46, 1, "Khảo sát và vẽ đồ thị hàm số với phần mềm GeoGebra", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(47, 1, "Khảo sát và vẽ đồ thị hàm số với phần mềm GeoGebra (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(48, 1, "Vẽ vectơ tổng của ba vectơ trong không gian bằng phần mềm GeoGebra", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(49, 1, "Độ dài gang tay (gang tay của bạn dài bao nhiêu?)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(50, 1, "Độ dài gang tay (gang tay của bạn dài bao nhiêu?) (tt)", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(51, 1, "Ôn tập cuối kì I", ""),
        _row(52, 1, "Ôn tập cuối kì I (tt)", ""),
        _row(53, 1, "Kiểm tra cuối kì I", ""),
        _row(54, 1, "Kiểm tra cuối kì I (tt)", ""),
        # ==================== HỌC KÌ II (Tiết 55 - 105) ====================
        # Chương IV: Nguyên hàm và tích phân (15t)
        _row(55, 2, "Bài 11. Nguyên hàm", "Mục 1", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(56, 2, "Bài 11. Nguyên hàm (tt)", "Mục 2", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(57, 2, "Bài 11. Nguyên hàm (tt)", "Mục 3a", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(58, 2, "Bài 11. Nguyên hàm (tt)", "Mục 3b, c", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(59, 2, "Bài 11. Nguyên hàm (tt)", "Bài tập", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(60, 2, "Bài 12. Tích phân", "Mục 1a", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(61, 2, "Bài 12. Tích phân (tt)", "Mục 1b", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(62, 2, "Bài 12. Tích phân (tt)", "Mục 2", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(63, 2, "Bài 12. Tích phân (tt)", "Bài tập", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(64, 2, "Bài 13. Ứng dụng của tích phân", "Mục 1a", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(65, 2, "Bài 13. Ứng dụng của tích phân (tt)", "Mục 1b", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(66, 2, "Bài 13. Ứng dụng của tích phân (tt)", "Mục 2a", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(67, 2, "Bài 13. Ứng dụng của tích phân (tt)", "Mục 2b", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(68, 2, "Bài tập cuối chương IV", "", chapter="Chương IV: Nguyên hàm và tích phân"),
        _row(69, 2, "Bài tập cuối chương IV (tt)", "", chapter="Chương IV: Nguyên hàm và tích phân"),
        # Chương V: Phương pháp tọa độ trong không gian (18t)
        _row(70, 2, "Bài 14. Phương trình mặt phẳng", "Mục 1", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(71, 2, "Bài 14. Phương trình mặt phẳng (tt)", "Mục 2, 3 đến LT6", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(72, 2, "Bài 14. Phương trình mặt phẳng (tt)", "Mục 3 (tt)", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(73, 2, "Bài 14. Phương trình mặt phẳng (tt)", "Mục 4, 5 đến VD11", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(74, 2, "Bài 14. Phương trình mặt phẳng (tt)", "Mục 5 (tt), 6", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(75, 2, "Bài 14. Phương trình mặt phẳng (tt)", "Bài tập", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        # Giữa kì II
        _row(76, 2, "Ôn tập giữa kì II", ""),
        _row(77, 2, "Kiểm tra giữa kì II", "", is_midterm=True),
        _row(78, 2, "Kiểm tra giữa kì II (tt)", "", is_midterm=True),
        # Tiếp Chương V
        _row(79, 2, "Bài 15. Phương trình đường thẳng trong không gian", "Mục 1", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(80, 2, "Bài 15. Phương trình đường thẳng trong không gian (tt)", "Mục 1 (tt)", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(81, 2, "Bài 15. Phương trình đường thẳng trong không gian (tt)", "Mục 2", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(82, 2, "Bài 15. Phương trình đường thẳng trong không gian (tt)", "Mục 3", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(83, 2, "Bài 15. Phương trình đường thẳng trong không gian (tt)", "Bài tập", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(84, 2, "Bài 16. Công thức tính góc trong không gian", "Mục 1, 2", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(85, 2, "Bài 16. Công thức tính góc trong không gian (tt)", "Mục 3 + Bài tập", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(86, 2, "Bài 17. Phương trình mặt cầu", "Mục 1", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(87, 2, "Bài 17. Phương trình mặt cầu (tt)", "Mục 2", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(88, 2, "Bài 17. Phương trình mặt cầu (tt)", "Bài tập", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(89, 2, "Bài tập cuối chương V", "", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        _row(90, 2, "Bài tập cuối chương V (tt)", "", chapter="Chương V: Phương pháp tọa độ trong không gian"),
        # Chương VI: Xác suất có điều kiện (9t)
        _row(91, 2, "Bài 18. Xác suất có điều kiện", "Mục 1", chapter="Chương VI: Xác suất có điều kiện"),
        _row(92, 2, "Bài 18. Xác suất có điều kiện (tt)", "Mục 1 (tt)", chapter="Chương VI: Xác suất có điều kiện"),
        _row(93, 2, "Bài 18. Xác suất có điều kiện (tt)", "Mục 2", chapter="Chương VI: Xác suất có điều kiện"),
        _row(94, 2, "Bài 18. Xác suất có điều kiện (tt)", "Bài tập", chapter="Chương VI: Xác suất có điều kiện"),
        _row(95, 2, "Bài 19. Công thức xác suất toàn phần và công thức Bayes", "Mục 1", chapter="Chương VI: Xác suất có điều kiện"),
        _row(96, 2, "Bài 19. Công thức xác suất toàn phần và công thức Bayes (tt)", "Mục 1 (tt)", chapter="Chương VI: Xác suất có điều kiện"),
        _row(97, 2, "Bài 19. Công thức xác suất toàn phần và công thức Bayes (tt)", "Mục 2", chapter="Chương VI: Xác suất có điều kiện"),
        _row(98, 2, "Bài 19. Công thức xác suất toàn phần và công thức Bayes (tt)", "Bài tập + Vận dụng", chapter="Chương VI: Xác suất có điều kiện"),
        _row(99, 2, "Bài tập cuối chương VI", "", chapter="Chương VI: Xác suất có điều kiện"),
        # HĐTN (2t) & Cuối năm
        _row(100, 2, "Tính nguyên hàm và tích phân với phần mềm GeoGebra", "Hoạt động thực hành trải nghiệm — Tính gần đúng tích phân bằng phương pháp hình thang", chapter="Hoạt động thực hành trải nghiệm"),
        _row(101, 2, "Vẽ đồ họa 3D với phần mềm GeoGebra", "Hoạt động thực hành trải nghiệm", chapter="Hoạt động thực hành trải nghiệm"),
        _row(102, 2, "Ôn tập cuối năm", ""),
        _row(103, 2, "Ôn tập cuối năm (tt)", ""),
        _row(104, 2, "Kiểm tra cuối năm", ""),
        _row(105, 2, "Kiểm tra cuối năm (tt)", ""),
    ]

    # Kế hoạch sử dụng ĐDDH Lớp 12
    _apply_equipment(
        regular,
        [
            ([14, 15, 16, 17, 18], "Tranh về bảng tổng kết tính chất và các dạng đồ thị hàm số bậc ba và hàm đa thức (tự làm)"),
            ([34, 35, 36], "Mô hình hệ tọa độ trong không gian Oxyz (tự làm)"),
            ([42], "Máy tính cầm tay"),
            ([43, 44, 45], "Máy tính cầm tay"),
            ([46, 47, 48, 49, 50], "Phần mềm GeoGebra"),
            ([55, 56, 57, 58, 59], "Tranh về bảng nguyên hàm các hàm số sơ cấp"),
            ([64, 65, 66, 67], "Mô hình mặt trụ, mặt nón, mặt cầu"),
            ([91, 92, 93, 94], "Con xúc xắc, đồng xu, máy tính cầm tay"),
            ([100, 101], "Phần mềm GeoGebra"),
        ],
    )

    special: list[dict] = [
        # ==================== CHUYÊN ĐỀ TOÁN 12 — HỌC KÌ I (1 - 18) ====================
        _row(1, 1, "Bài 1. Biến ngẫu nhiên rời rạc và các số đặc trưng", "Mục 1", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(2, 1, "Bài 1. Biến ngẫu nhiên rời rạc và các số đặc trưng (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(3, 1, "Bài 1. Biến ngẫu nhiên rời rạc và các số đặc trưng (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(4, 1, "Bài 1. Biến ngẫu nhiên rời rạc và các số đặc trưng (tt)", "Mục 2a", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(5, 1, "Bài 1. Biến ngẫu nhiên rời rạc và các số đặc trưng (tt)", "Mục 2b", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(6, 1, "Bài 2. Biến ngẫu nhiên có phân bố nhị thức và áp dụng", "Mục 1", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(7, 1, "Bài 2. Biến ngẫu nhiên có phân bố nhị thức và áp dụng (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(8, 1, "Bài 2. Biến ngẫu nhiên có phân bố nhị thức và áp dụng (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(9, 1, "Bài 2. Biến ngẫu nhiên có phân bố nhị thức và áp dụng (tt)", "Mục 2 (tt)", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(10, 1, "Bài 2. Biến ngẫu nhiên có phân bố nhị thức và áp dụng (tt)", "Bài tập", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(11, 1, "Bài tập cuối chuyên đề 1", "", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(12, 1, "Bài tập cuối chuyên đề 1 (tt)", "", is_special=True, chapter="Chuyên đề 1: Biến ngẫu nhiên rời rạc"),
        _row(13, 1, "Bài 3. Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính", "Mục 1", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(14, 1, "Bài 3. Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(15, 1, "Bài 3. Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính (tt)", "Mục 3", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(16, 1, "Bài 3. Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính (tt)", "Bài tập", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(17, 1, "Bài 3. Vận dụng hệ bất phương trình bậc nhất để giải quyết một số bài toán quy hoạch tuyến tính (tt)", "Bài tập", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(18, 1, "Bài 4. Vận dụng đạo hàm để giải quyết một số bài toán tối ưu", "Mục 1", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        # ==================== CHUYÊN ĐỀ TOÁN 12 — HỌC KÌ II (19 - 35) ====================
        _row(19, 2, "Bài 4. Vận dụng đạo hàm để giải quyết một số bài toán tối ưu (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(20, 2, "Bài 4. Vận dụng đạo hàm để giải quyết một số bài toán tối ưu (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(21, 2, "Bài 4. Vận dụng đạo hàm để giải quyết một số bài toán tối ưu (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(22, 2, "Bài 4. Vận dụng đạo hàm để giải quyết một số bài toán tối ưu (tt)", "Mục 2 + Bài tập", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(23, 2, "Ôn tập và kiểm tra cuối chuyên đề 2", "", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(24, 2, "Ôn tập và kiểm tra cuối chuyên đề 2 (tt)", "", is_special=True, chapter="Chuyên đề 2: Ứng dụng toán học để giải quyết một số bài toán tối ưu"),
        _row(25, 2, "Bài 5. Tiền tệ. Lãi suất", "Mục 1", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(26, 2, "Bài 5. Tiền tệ. Lãi suất (tt)", "Mục 2", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(27, 2, "Bài 5. Tiền tệ. Lãi suất (tt)", "Mục 3", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(28, 2, "Bài 6. Tín dụng. Vay nợ", "Mục 1", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(29, 2, "Bài 6. Tín dụng. Vay nợ (tt)", "Mục 2a, b", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(30, 2, "Bài 6. Tín dụng. Vay nợ (tt)", "Mục 2c", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(31, 2, "Bài 7. Đầu tư tài chính. Lập kế hoạch tài chính cá nhân", "Mục 1", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(32, 2, "Bài 7. Đầu tư tài chính. Lập kế hoạch tài chính cá nhân (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(33, 2, "Bài 7. Đầu tư tài chính. Lập kế hoạch tài chính cá nhân (tt)", "Mục 1 (tt)", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(34, 2, "Bài tập cuối chuyên đề 3", "", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
        _row(35, 2, "Bài tập cuối chuyên đề 3 (tt)", "", is_special=True, chapter="Chuyên đề 3: Ứng dụng toán học trong một số vấn đề liên quan đến tài chính"),
    ]

    return regular + special


def build_builtin_curriculum_plans() -> dict[str, list[dict]]:
    """Return full official curriculum plans for Grades 10, 11, and 12 (Chính khóa + Chuyên đề)."""
    return {
        "10": build_grade10_plan(),
        "11": build_grade11_plan(),
        "12": build_grade12_plan(),
    }
