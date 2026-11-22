# Lớp toán thầy Hoàng — Thi Online & Mô Hình Tương Tác

Hệ thống thi trắc nghiệm trực tuyến chuẩn cấu trúc Bộ GD&ĐT 2025 (3 dạng câu hỏi: Nhiều lựa chọn, Đúng/Sai tính điểm lũy tiến, Trả lời ngắn 4 ký tự) và thư viện mô hình tương tác HTML.

## Chạy cục bộ (Local)
```bash
python server.py
```
Mở trình duyệt tại: http://localhost:8085

## Tài khoản mặc định
- **Giáo viên (Admin):** `admin` / `admin123` (Lê Viết Hoàng)
- **Học sinh mẫu:** `hs01` / `123456`, `hs02` / `123456`, `hs03` / `123456`

## Đưa lên Web qua GitHub + Render (Tự động cập nhật khi push)
1. Đẩy toàn bộ thư mục dự án lên một repository trên GitHub.
2. Đăng nhập [Render.com](https://render.com) bằng tài khoản GitHub.
3. Chọn **New + → Blueprint** (hoặc **Web Service**) và chọn repository GitHub vừa tạo.
4. Render tự đọc file `render.yaml` và chạy `python server.py` công khai trên Internet.
5. Mỗi khi chỉnh sửa mã nguồn trên máy và `git push` lên GitHub, Render tự động cập nhật web sau ~30–60 giây.
