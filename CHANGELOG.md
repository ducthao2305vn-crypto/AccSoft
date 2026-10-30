# Lịch sử phiên bản

## v2.2.1 – 30/10/2026
- **Sửa lỗi** nạp file Excel trên bản Windows: `Cannot find module 'call-bind-apply-helpers'` (bản đóng gói thiếu thư viện phụ của exceljs). Mã nguồn và thư viện giờ được gộp sẵn (esbuild), bản đóng gói không còn phụ thuộc node_modules.
- **Nhật ký lỗi** tại `AccSoft_Data\logs\accsoft-YYYY-MM-DD.log` (giữ 60 ngày): ghi khởi động, từng lần nạp file (thành công/thất bại kèm stack đầy đủ), lỗi xử lý, lỗi giao diện.
- Thông báo kết quả nạp gọn: ✓/✗ từng file và một dòng lỗi; chi tiết xem trong nhật ký (menu Tệp → Mở nhật ký lỗi, hoặc nút trong tab Quản lý dữ liệu).

## v2.2.0 – 30/10/2026
- Cơ sở dữ liệu lưu tại **thư mục ứng dụng**: `<thư mục chứa AccSoft>\AccSoft_Data\accsoft.db` (bản Portable: cạnh file .exe; bản cài: thư mục cài đặt).
- Lần chạy đầu tự chuyển dữ liệu cũ từ `%APPDATA%\AccSoft` sang (bản cũ được giữ làm dự phòng).
- Nếu thư mục ứng dụng không có quyền ghi (vd cài vào Program Files) thì tự dùng `%APPDATA%\AccSoft` và báo trong tab Quản lý dữ liệu.
- Gỡ cài đặt / cập nhật phiên bản mới **không xoá** thư mục AccSoft_Data.

## v2.1.0 – 30/10/2026
Phân tích **tuổi nợ phải thu – phải trả** làm lại:
- Đối tượng công nợ lấy đúng theo phía hạch toán: TK ghi Nợ ↔ Đối tượng Nợ (Business Partner), TK ghi Có ↔ Đối tượng Có (Bpartner credit); không lấy thay đối tượng phía kia (thiếu thì ghi "không có đối tượng" và cảnh báo).
- Mở rộng tài khoản: phải thu 131, 136, 1388, 141; phải trả 331, 336, 334, 3388.
- Xem theo tài khoản tổng hợp hoặc tài khoản chi tiết; lọc nhóm phải thu / phải trả; bảng tổng hợp tuổi nợ theo tài khoản có dòng cộng từng nhóm.
- Biểu đồ cơ cấu tuổi nợ xếp chồng theo tài khoản; chi tiết đối tượng kèm phát sinh Nợ/Có, đánh giá (đôn đốc thu, xem xét dự phòng, ưu tiên thanh toán).
- Xuất Excel 3 sheet: tổng hợp theo TK, chi tiết đối tượng, dư ngược chiều.

## v2.0.0 – 30/10/2026
**Xử lý dữ liệu lớn (hàng trăm MB, hàng triệu dòng)** và **giao diện mới theo TLM Design System**.
- Nạp file dạng luồng (streaming) xlsx và CSV trong tiến trình nền, có thanh tiến độ; RAM ổn định bất kể kích thước file.
- SQLite ghi trực tiếp trên đĩa (WAL) thay cho sql.js trong RAM; cảnh báo lỗi được tính khi nạp và lưu thành bảng có chỉ mục.
- Tổng quan, kết quả kinh doanh, chi phí, tuổi nợ, báo cáo tính bằng SQL; bảng lỗi phân trang 200 dòng, lọc/sắp xếp bằng SQL.
- Xuất Excel và soạn email chạy ở tiến trình chính, lấy dữ liệu thẳng từ CSDL.
- Giao diện mới: thanh điều hướng bên trái với logo Telemor, màu cam thương hiệu (#FA4700) làm chủ đạo, thẻ KPI, nhãn mức độ/trạng thái theo bảng màu TLM, kéo-thả file vào cửa sổ.
- Tự nâng cấp CSDL từ bản 1.x (giữ dữ liệu, trạng thái và ghi chú; tính lại bảng lỗi một lần).
- Bản web (mở index.html bằng trình duyệt) ngừng hỗ trợ – dùng bản desktop.

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
