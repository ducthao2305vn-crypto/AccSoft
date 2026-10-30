# Lịch sử phiên bản

## v1.2.0 – 30/10/2026
Tab mới **Báo cáo & Thông báo**:
- Báo cáo kết quả kiểm tra: tổng hợp theo loại lỗi và theo người nhập (đã khắc phục / không phải lỗi / còn tồn, % hoàn thành); in hoặc lưu PDF, xuất Excel.
- Báo cáo lỗi cần khắc phục theo từng nhân viên, chọn mức độ tối thiểu và hạn khắc phục.
- Gửi email thông báo qua SMTP (Office 365, Gmail, máy chủ nội bộ): nội dung HTML liệt kê lỗi + hướng dẫn chỉnh sửa, đính kèm file Excel riêng của từng người; email lấy tự động từ cột Created By, sửa được.
- Gửi thử, xem trước email, lịch sử gửi; tuỳ chọn tự chuyển lỗi sang "Đang xử lý" sau khi gửi.
- Mật khẩu SMTP được mã hoá bằng kho khoá của hệ điều hành.

## v1.1.0 – 30/10/2026
Làm lại màn hình **Lỗi nhập liệu**:
- Highlight theo mức độ: dòng lỗi Cao nền đỏ, viền màu theo mức; lỗi đã xử lý được làm mờ.
- Bấm một dòng → mở bảng chi tiết: toàn bộ bút toán cùng chứng từ (dòng lỗi được tô màu, dòng đang chọn được viền), đầy đủ các trường dữ liệu, chuyển lỗi trước/sau bằng phím mũi tên.
- Hướng dẫn **"Cần chỉnh sửa"** cho từng loại lỗi (cũng có trong bảng quy tắc và file Excel xuất ra).
- Theo dõi xử lý: trạng thái Chưa xử lý / Đang xử lý / Đã khắc phục / Không phải lỗi + ghi chú, lưu trong SQLite; áp dụng cho cả chứng từ hoặc hàng loạt cho các dòng đang lọc.
- Tự nhận biết lỗi đã được sửa trong ERP khi nạp lại dữ liệu tháng (mục "Đã sửa trong ERP").
- Bộ lọc mới: trạng thái, tháng, bộ phận, tài khoản, khoảng số tiền, tìm theo ghi chú; gộp theo chứng từ; sắp xếp theo cột.

## v1.0.0 – 30/10/2026
Phiên bản đầu tiên.
- Nạp file xuất ERP `Export_Accounts_DuLieuHachToan` (xlsx/csv), nhiều file cùng lúc.
- Kiểm tra lỗi nhập liệu: 20 quy tắc (sai chiều doanh thu/chi phí, thiếu khoản mục/đối tượng, diễn giải trống hoặc tính sai, SL×ĐG ≠ thành tiền, chi phí nhiều kỳ không qua 242, sai kỳ, nghi trùng, số tiền bất thường…), thống kê theo người nhập, xuất Excel.
- Công nợ & tuổi nợ (131, 1388, 141, 331, 3388) theo FIFO, phát hiện dư ngược chiều, xuất Excel.
- Báo cáo kết quả kinh doanh theo năm/tháng, cơ cấu chi phí.
- Lưu dữ liệu SQLite; quản lý dữ liệu theo tháng: thêm, thay thế, xoá, bỏ khỏi phân tích.
- Bản desktop Windows chạy offline.
