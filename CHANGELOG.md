# Lịch sử phiên bản

## v1.0.0 – 30/10/2026
Phiên bản đầu tiên.
- Nạp file xuất ERP `Export_Accounts_DuLieuHachToan` (xlsx/csv), nhiều file cùng lúc.
- Kiểm tra lỗi nhập liệu: 20 quy tắc (sai chiều doanh thu/chi phí, thiếu khoản mục/đối tượng, diễn giải trống hoặc tính sai, SL×ĐG ≠ thành tiền, chi phí nhiều kỳ không qua 242, sai kỳ, nghi trùng, số tiền bất thường…), thống kê theo người nhập, xuất Excel.
- Công nợ & tuổi nợ (131, 1388, 141, 331, 3388) theo FIFO, phát hiện dư ngược chiều, xuất Excel.
- Báo cáo kết quả kinh doanh theo năm/tháng, cơ cấu chi phí.
- Lưu dữ liệu SQLite; quản lý dữ liệu theo tháng: thêm, thay thế, xoá, bỏ khỏi phân tích.
- Bản desktop Windows chạy offline.
