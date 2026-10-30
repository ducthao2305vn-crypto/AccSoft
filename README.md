# AccSoft – Phân tích sổ hạch toán ERP

Ứng dụng desktop (Windows/macOS/Linux) phân tích file xuất `Export_Accounts_DuLieuHachToan` từ ERP: phát hiện lỗi nhập liệu, theo dõi khắc phục, công nợ & tuổi nợ, kết quả kinh doanh, cơ cấu chi phí, báo cáo kiểm tra và gửi email yêu cầu khắc phục cho nhân viên.

## Tải về
Trang **[Releases](https://github.com/ducthao2305vn-crypto/AccSoft/releases/latest)**:
- `AccSoft-Setup-x.y.z.exe` – bộ cài Windows, hoặc `AccSoft-Portable-x.y.z.exe` – chạy ngay không cần cài.
- Ứng dụng chưa ký số: nếu SmartScreen cảnh báo chọn *More info* → *Run anyway*.

## Dữ liệu lớn
- Đọc file dạng luồng (xlsx, csv) trong tiến trình nền; dữ liệu lưu SQLite tại `AccSoft_Data\accsoft.db` trong thư mục ứng dụng (cạnh file .exe bản Portable, hoặc thư mục cài đặt). Sao lưu = chép thư mục `AccSoft_Data` khi ứng dụng đã đóng.
- Khuyến nghị: RAM ≥ 8 GB, ổ trống ≥ 3 lần dung lượng file nạp. CSV nạp nhanh hơn xlsx đáng kể – nên xuất CSV từ ERP với file rất lớn.
- Dữ liệu quản lý theo tháng: bật/tắt tháng khỏi phân tích, xoá tháng, nạp lại tháng (hỏi thay thế).

## Chức năng
- **Lỗi nhập liệu**: 34 quy tắc (sai chiều doanh thu/chi phí, thiếu khoản mục/đối tượng, diễn giải trống hoặc tính sai, SL×ĐG ≠ thành tiền, chi phí nhiều kỳ không qua 242, sai kỳ, nghi trùng, số tiền bất thường…); hướng dẫn "Cần chỉnh sửa"; xem toàn bộ chứng từ; trạng thái + ghi chú; lọc/sắp xếp; xuất Excel.
- **Công nợ & tuổi nợ** phải thu 131, 136, 1388, 141 – phải trả 331, 336, 334, 3388 (FIFO, đối tượng theo phía Nợ/Có), dư ngược chiều.
- **Kết quả kinh doanh** theo năm/tháng.
- **Doanh thu & Chi phí** theo tài khoản, khoản mục, bộ phận × tháng/quý/năm, xem chi tiết bút toán.
- **Báo cáo & Thông báo**: báo cáo kết quả kiểm tra (in/PDF/Excel), danh sách lỗi cần khắc phục theo nhân viên, gửi email qua SMTP kèm Excel.

## Phát triển
```
npm install
npm start
```
Phát hành: sửa `version` trong `package.json`, thêm mục vào `CHANGELOG.md`, push → GitHub Actions tự build và tạo Release.
