# AccSoft – Phân tích sổ hạch toán ERP

Ứng dụng web 1 file (`index.html`), mở trực tiếp bằng trình duyệt, dữ liệu xử lý hoàn toàn trên máy (không upload).
Đầu vào: file xuất `Export_Accounts_DuLieuHachToan` (cột Account, Account credit, Accounted Amount, Business Partner, Bpartner credit, Description, Type of cost, Created By…). Có thể nạp nhiều file để gộp nhiều tháng/năm.

## Chức năng
- **Lỗi nhập liệu**: 20 quy tắc kiểm tra (tài khoản sai, doanh thu/chi phí ghi sai chiều, thiếu khoản mục/đối tượng, diễn giải trống, diễn giải tính sai, SL×ĐG ≠ thành tiền, chi phí nhiều kỳ không qua 242, sai kỳ cut-off, nghi trùng, số tiền bất thường, …). Thống kê theo người nhập, xuất Excel.
- **Công nợ & tuổi nợ**: 131, 1388, 141, 331, 3388 theo đối tượng, phân bổ FIFO vào 7 nhóm tuổi; phát hiện dư ngược chiều. Xuất Excel.
- **Kết quả kinh doanh**: P&L theo năm, so sánh năm trước, biên lợi nhuận, xu hướng tháng, nhận xét tự động.
- **Cơ cấu chi phí**: theo Type of cost, bộ phận, biến động theo năm.

## Hạn chế
- Tuổi nợ chính xác cần đủ lịch sử phát sinh hoặc số dư đầu kỳ.
- Doanh thu viễn thông ghi nhận từ BCCS nếu không có trong file xuất thì P&L sẽ thiếu doanh thu.

## Bản desktop (Electron + SQLite)
- Dữ liệu nạp vào được lưu vĩnh viễn trong file SQLite `accsoft.db` (Windows: `%APPDATA%\AccSoft\accsoft.db`). Tab **Dữ liệu (SQLite)** liệt kê các lần nạp, cho xoá từng lần, mở thư mục để sao lưu.
- Mỗi file chỉ nạp một lần (chống trùng theo SHA-256). Bảng `imports` lưu các lần nạp, bảng `entries` lưu dòng hạch toán – có thể truy vấn bằng DB Browser for SQLite / Excel ODBC.
- Chạy thử: `npm install` rồi `npm start`.
- Đóng gói: GitHub → Actions → **Build desktop app** → Run workflow (hoặc push tag `v1.0.0`); tải file `.exe` (bộ cài + bản portable), `.dmg`, `.AppImage` ở mục Artifacts. Trên Windows có thể build trực tiếp: `npm run dist:win`.
- Chạy offline hoàn toàn (thư viện nằm trong `vendor/`).
