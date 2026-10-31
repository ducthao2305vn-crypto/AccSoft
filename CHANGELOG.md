# Lịch sử phiên bản

## v3.8.0 – 31/10/2026
**Thuyết minh báo cáo tài chính (B09-DN, TT99/2025)**
- Phần I–IV và VII là nội dung văn bản: đặc điểm hoạt động, kỳ kế toán và đơn vị tiền tệ, chế độ kế toán áp dụng, chính sách kế toán, thông tin khác.
  - Có sẵn nội dung mẫu, sửa trực tiếp trên màn hình rồi bấm "Lưu nội dung"; nội dung được lưu trong CSDL để dùng lại cho các kỳ sau.
- Phần V–VI lập tự động theo kỳ đang chọn, khớp với B01/B02:
  - **Biến động đầu kỳ – tăng – giảm – cuối kỳ theo TK chi tiết:** tiền, đầu tư tài chính, phải thu khác, hàng tồn kho, chi phí trả trước, TSCĐ và hao mòn, XDCB, thuế, phải trả người lao động, chi phí phải trả, phải trả khác, vay, vốn chủ sở hữu, doanh thu, giá vốn.
  - **10 đối tượng có số dư lớn nhất:** phải thu khách hàng, trả trước người bán, phải trả người bán, người mua trả trước.
  - **Doanh thu, chi phí, thu nhập khác:** doanh thu và chi phí tài chính, chi phí bán hàng và quản lý doanh nghiệp, thu nhập và chi phí khác, chi phí theo 15 khoản mục lớn nhất, thuế TNDN.
- Excel bộ báo cáo tài chính thêm sheet B09-DN.

## v3.7.0 – 31/10/2026
**Báo cáo tài chính theo tháng, quý, năm**
- Trang Báo cáo tài chính thêm ô chọn "Kỳ báo cáo": Tháng, Quý, Năm, Luỹ kế từ đầu năm, Khoảng tháng. Áp dụng cho cả Bảng cân đối số phát sinh, B01, B02, B03 và file Excel.
- Kỳ chưa đủ tháng (ví dụ quý 4 hoặc năm 2026 mới có dữ liệu đến tháng 10) được tính đến tháng cuối có dữ liệu và có nhãn báo rõ.
- So sánh B02 luôn trên cùng số tháng:
  - Cùng kỳ năm trước.
  - Kỳ liền trước: tháng trước, quý trước hoặc năm trước.

## v3.6.0 – 31/10/2026
**Báo cáo lưu chuyển tiền tệ (B03-DN), cập nhật theo Thông tư 99/2025/TT-BTC**
- **Phương pháp trực tiếp:**
  - Mỗi bút toán thu/chi TK 111, 112, 113 được xếp vào chỉ tiêu theo TK đối ứng. Ví dụ: 131/511 vào mã 01; 331, hàng tồn kho, chi phí vào mã 02; 334 vào mã 03; 3334/821 vào mã 05; TSCĐ/XDCB vào mã 21; 128 vào mã 23/24; 411 vào mã 31/32; 341 vào mã 33/34; 421 vào mã 36.
  - Chuyển tiền giữa các TK tiền được loại ra.
- **Phương pháp gián tiếp:**
  - Đi từ lợi nhuận trước thuế, điều chỉnh khấu hao (TK 214), dự phòng, lãi đầu tư.
  - Biến động phải thu, hàng tồn kho, phải trả, chi phí trả trước lấy theo số dư đầu kỳ và cuối kỳ.
  - Mã 07 là phần chênh lệch để mã 20 khớp với dòng tiền thực tế.
- Kiểm tra: tiền đầu kỳ + lưu chuyển thuần + ảnh hưởng tỷ giá = tiền cuối kỳ trên sổ.
- Bảng phân loại dòng tiền theo TK đối ứng để kiểm tra.
- Đổi tên mẫu theo TT99: "Báo cáo tình hình tài chính" (B01-DN), B02-DN, B03-DN.
- Excel bộ báo cáo tài chính gồm 7 sheet: CĐSPS, B01, B02, B03 trực tiếp, B03 gián tiếp, phân loại dòng tiền, thông tin.

## v3.5.0 – 31/10/2026
**Báo cáo tài chính lập tự động từ dữ liệu hạch toán**
- Trang mới "Báo cáo tài chính", chọn kỳ từ tháng đến tháng:
  - **Bảng cân đối số phát sinh:** dư đầu kỳ, phát sinh, dư cuối kỳ (Nợ/Có); xem theo TK cấp 1 hoặc chi tiết; kiểm tra tổng Nợ = tổng Có.
  - **Bảng cân đối kế toán (B01-DN, TT200 rút gọn):**
    - Số cuối kỳ và số đầu kỳ.
    - Công nợ 131/331/138/338/141/136/336 được tách dư Nợ và dư Có theo từng đối tượng.
    - Kết quả chưa kết chuyển được đưa vào chỉ tiêu LNST chưa phân phối.
    - Kiểm tra tổng tài sản = tổng nguồn vốn và cảnh báo TK chưa được đưa vào chỉ tiêu nào.
  - **Kết quả kinh doanh (B02-DN):** so sánh với cùng kỳ năm trước hoặc kỳ liền trước; nhấn đúp một chỉ tiêu để xem bút toán.
- Số dư đầu kỳ = luỹ kế các tháng đã nạp trước kỳ (kể cả số dư đầu kỳ nhập từ file mẫu); không có dữ liệu trước kỳ thì bằng 0.
- Xuất Excel 4 sheet: CĐSPS, B01-DN, B02-DN, Thông tin.
- Bảng cân đối số phát sinh lập trong khoảng 1 giây trên 650.000 dòng.

## v3.4.0 – 31/10/2026
**Lập file trích trước chi phí để import vào ERP**
- Màn hình mới: "Trích – huỷ trích 335 → Lập trích trước kỳ mới".
  - Chọn kỳ dịch vụ mẫu và kỳ trích mới.
  - Các dòng trích kỳ mẫu được sao chép sang kỳ mới, giữ nguyên TK, đối tượng, khoản mục, Group cost, Services, Location.
  - Diễn giải tự đổi tháng, ví dụ "December 2026" thành "January 2027", hoặc "tháng 12/2026" thành "tháng 01/2027".
- Trên màn hình có thể sửa số tiền ước tính và diễn giải từng dòng, bỏ chọn dòng không trích.
- Cảnh báo khi kỳ mới đã có trích của cùng đối tượng × khoản mục, để tránh trích trùng. Các dòng này mặc định bỏ chọn.
- Xuất file .xls đúng mẫu GL Journal (126 cột) kèm file _DoiChieu.xlsx.

## v3.3.0 – 31/10/2026
**Xuất file huỷ trích để import vào ERP**
- Cách dùng:
  - Vào "Trích – huỷ trích 335 → Đối chiếu chi tiết", tích chọn các khoản còn treo (có nút chọn nhanh mọi khoản "Chưa huỷ trích").
  - Bấm "Xuất file huỷ trích (import ERP)".
- File .xls đúng mẫu Export_GL_Journal của ERP (126 cột, theo file mẫu 2026.08_HUY_IT_SLA):
  - Mỗi dòng đảo dòng trích gốc với số tiền âm bằng số còn treo.
  - Giữ nguyên TK Nợ/Có, đối tượng, khoản mục, Department Sub, Group cost, Services, Location.
- Nhập trên màn hình: ngày hạch toán (tự tính kỳ), hạn thanh toán, bộ phận, loại chứng từ, số chứng từ, diễn giải.
- Kèm file _DoiChieu.xlsx liệt kê chứng từ trích gốc, số huỷ và các thông tin còn thiếu để kiểm tra trước khi import.
- Nạp thêm các cột Group cost, Services, Location, Project, Period:
  - Dữ liệu đã nạp trước đây: dùng "Bổ sung thông tin" với file gốc để điền các cột này.

## v3.2.0 – 31/10/2026
**Báo cáo quản lý trích trước – huỷ trích – chi phí thực tế – thanh toán (TK 335)**
- Trang "Phân tích chuyên sâu → Trích – huỷ trích 335", 6 chế độ xem:
  - Đối chiếu chi tiết.
  - Theo kỳ dịch vụ (có biểu đồ).
  - Theo đối tượng.
  - Theo khoản mục.
  - Theo nhân viên.
  - Tuổi khoản trích còn treo.
- KPI: đã trích, đã huỷ / quyết toán, còn treo 335, chi phí thực tế (đã / chưa thanh toán), chi phí nghi ghi 2 lần.
- Thanh toán thực tế:
  - Các khoản Nợ 331 của đối tượng được phân bổ cho hoá đơn cũ trước (FIFO).
  - Hiển thị số đã thanh toán, số chưa thanh toán và ngày thanh toán của từng khoản.
- Thêm tình trạng "Đã huỷ / quyết toán" và "Huỷ trích của kỳ trước dữ liệu".
- Chênh lệch thực tế − trích cho thấy độ chính xác của số ước tính theo đối tượng và khoản mục.
- Xuất Excel 6 sheet: Đối chiếu chi tiết, Theo kỳ dịch vụ, Theo đối tượng, Theo khoản mục, Theo nhân viên, Tuổi khoản treo.

## v3.1.0 – 31/10/2026
**Phát hiện "đã ghi chi phí thực tế nhưng chưa huỷ trích 335"**
- Cách ghép: đối chiếu khoản trích trước (Nợ 6xx/Có 335), khoản huỷ trích (Có 335 số âm hoặc Nợ 335/Có 6xx) và chi phí thực tế (Nợ 6xx/Có 331, 111, 112…) theo đối tượng × khoản mục × kỳ dịch vụ.
- Kỳ dịch vụ đọc từ diễn giải, ví dụ "In April 2026" hoặc "tháng 10/2026".
- Quy tắc lỗi mới "Đã ghi chi phí thực tế nhưng chưa huỷ trích":
  - Mức Cao: khớp đúng kỳ dịch vụ.
  - Mức Trung bình: kỳ suy ra từ tháng hạch toán.
  - Gắn vào bút toán chi phí thực tế của nhân viên, nên vào báo cáo và email nhắc nhở.
- Trang "Phân tích chuyên sâu → Chưa huỷ trích 335":
  - Tổng chi phí nghi ghi 2 lần, tổng hợp theo nhân viên.
  - Bảng đối chiếu: đã trích / đã huỷ / còn treo / thực tế, kèm chứng từ, hoá đơn, mức độ tin cậy.
  - Lọc: chưa huỷ, huỷ vượt, chưa có thực tế, đã huỷ đúng.
- Đây là thay đổi quy tắc: cần "Phân tích dữ liệu" lại.

## v3.0.0 – 31/10/2026
**Phân tích chuyên sâu & vận hành an toàn**
- Trang mới "Phân tích chuyên sâu":
  - Chi phí định kỳ: tháng bị thiếu hoặc ghi trùng.
  - Biến động bất thường so với trung bình 12 tháng, theo khoản mục, đối tượng, tài khoản và bộ phận.
  - TK 335 trích trước (quá hạn, quyết toán vượt trích) và TK 242 phân bổ theo lịch.
  - Chấm điểm nhân viên.
  - Benford và tỷ lệ số tròn.
  - Nhà cung cấp: tập trung, NCC mới, tên gần giống, trả trước khi có hoá đơn.
  - Kiểm tra tỷ giá.
- Số dư đầu kỳ: tải file mẫu và nạp số dư (công nợ, tạm ứng, tồn kho, 335). Số dư đầu kỳ không bị tính là lỗi.
- Cài đặt ngưỡng cảnh báo theo quy chế công ty.
- Nạp file trùng tháng có thêm lựa chọn "Gộp", chỉ thêm bút toán chưa có.
- Sao lưu:
  - Sao lưu ngay, khôi phục.
  - Tự sao lưu trước khi xoá hoặc nạp số dư; giữ 10 bản.
- Báo cáo tổng hợp rủi ro 1 trang dạng PDF.
- Tuổi nợ nhanh hơn khoảng 3,5 lần.

## v2.9.0 – 31/10/2026
**Không còn treo máy khi dữ liệu lớn**
- Mọi truy vấn báo cáo chạy trong worker thường trực – cửa sổ luôn phản hồi (độ trễ < 10 ms khi đang tải báo cáo trên 647.000 dòng); hiển thị "Đang tải dữ liệu…".
- Bảng tổng hợp sẵn (tháng × TK × khoản mục × bộ phận, TK loại 5–8): Kết quả kinh doanh 5,7 → 0,4 giây; Doanh thu & Chi phí 2,3 → 0,4 giây. Tự cập nhật khi nạp/xoá dữ liệu; CSDL cũ được tạo bảng một lần khi mở.
- Thêm chỉ mục tài khoản; ghi nhật ký các truy vấn chậm (> 3 giây).

**Nhấn đúp để xem bút toán chi tiết**
- Áp dụng cho: chi tiết & tổng hợp công nợ, dư ngược chiều, chi tiết & tổng hợp tồn kho, tồn âm, từng ô số liệu của Kết quả kinh doanh (kỳ hiện tại, kỳ so sánh, từng năm), bảng Doanh thu & Chi phí.
- Màn hình chi tiết: phát sinh Nợ/Có của đúng tài khoản – đối tượng – hợp đồng/đề nghị/khoản mục, số dư lũy kế từng dòng; dòng có lỗi nhấn đúp để mở phần xử lý lỗi.

**TK 335 – Chi phí phải trả (trích trước)**
- Thêm vào phân tích công nợ (nhóm phải trả); lựa chọn mới "Đối tượng × Khoản mục chi phí"; nút xem nhanh "335 theo đối tượng & khoản mục"; cảnh báo trích trước quá 90 ngày chưa quyết toán/hoàn nhập.

## v2.8.0 – 31/10/2026
Công nợ & tuổi nợ – **phân tích theo hợp đồng và đề nghị tạm ứng**:
- Lựa chọn "Phân tích theo": Đối tượng · Đối tượng × Hợp đồng (cột Contract) · Đối tượng × Đề nghị tạm ứng (cột Advance Request). Đối tượng vẫn lấy theo phía hạch toán (Nợ ↔ Business Partner, Có ↔ Bpartner credit).
- Nút xem nhanh: **331 theo hợp đồng**, **1411 theo đề nghị tạm ứng**.
- Chi tiết có cột hợp đồng / đề nghị tạm ứng, ngày phát sinh đầu; đánh giá: thiếu hợp đồng / đề nghị, **tạm ứng quá 30 ngày chưa quyết toán**; dư ngược chiều (quyết toán vượt tạm ứng, trả vượt hợp đồng) hiện theo từng hợp đồng / đề nghị.
- Excel tuổi nợ thêm cột hợp đồng / đề nghị tạm ứng, phát sinh đầu tiên và gần nhất.

## v2.7.0 – 31/10/2026
**Chọn kỳ và so sánh** cho Kết quả kinh doanh và Doanh thu & Chi phí:
- Kỳ phân tích: năm, quý, tháng, lũy kế từ đầu năm, khoảng tháng tuỳ chọn.
- So sánh với: kỳ liền trước, cùng kỳ năm trước, hoặc cả hai – chênh lệch tuyệt đối và % (tô màu tốt/xấu theo bản chất chỉ tiêu).
- Kỳ chưa đủ dữ liệu (vd quý/năm hiện tại) tự cắt đến tháng cuối có dữ liệu và so sánh tương đương (cùng số tháng).
- Biểu đồ xu hướng theo khoảng nhìn 12 tháng / 24 tháng / 3 năm / 5 năm / toàn bộ – tự chọn độ chi tiết tháng/quý/năm, cột của kỳ đang xem được tô đậm.
- Kết quả kinh doanh: thẻ KPI có % so sánh, bảng so sánh, **so sánh nhiều năm cùng khoảng tháng**, nhận xét tự động.
- Doanh thu & Chi phí: bảng nhóm (TK / TK chi tiết / khoản mục / bộ phận) theo kỳ đang xem với các cột so sánh; xem chi tiết bút toán của đúng kỳ; Excel kèm cột so sánh.
- Lựa chọn kỳ được ghi nhớ cho lần mở sau.

## v2.6.0 – 31/10/2026
Phân tách kết quả rà soát thành **2 nhóm**:
- **Sai sót nhân viên** (16 quy tắc): lỗi thao tác nhập liệu – thiếu khoản mục/đối tượng/mã hàng, chọn sai TK, diễn giải trống/chung chung, SL×ĐG lệch, hạn thanh toán sai, khấu hao sai khoản mục… → dùng để nhắc nhở, đào tạo.
- **Sai sót dễ bị kiểm toán** (21 quy tắc): dấu hiệu kiểm toán viên thường chọn mẫu / nêu trong thư quản lý – doanh thu/chi phí ghi sai chiều, sai kỳ (cut-off), chi phí nhiều kỳ không qua 242, trùng lặp, bất thường, chia nhỏ khoản chi, chi số tròn, thiếu chứng từ, bút toán ngày nghỉ/cuối tháng/cặp TK hiếm, tồn kho âm… Mỗi quy tắc có giải thích **"Vì sao kiểm toán quan tâm"** (VSA 240, 500, 520, VAS 01).
- Quy tắc mới: **Bút toán thủ công giá trị lớn** (GL Journal ≥ 10.000 vào doanh thu/chi phí/tiền) – kiểm tra bút toán ghi sổ theo VSA 240.
- Tab Lỗi nhập liệu: 3 thẻ chọn nhóm có số đếm; bảng quy tắc chia theo nhóm. Tổng quan: thẻ số lỗi từng nhóm (bấm để xem). Báo cáo & email: lọc theo nhóm; Excel thêm cột Nhóm.

## v2.5.0 – 30/10/2026
**Tách nạp dữ liệu và phân tích**
- Nạp dữ liệu chỉ đọc và lưu, không chạy quy tắc → nhanh hơn (file 575 MB: 104 → 52 giây).
- Nút **Phân tích dữ liệu** (thanh trên cùng) chạy toàn bộ quy tắc cho **kỳ rà soát** đang chọn; quy tắc so sánh (trùng lặp, bất thường, chia nhỏ khoản chi, tồn kho…) vẫn đối chiếu với toàn bộ dữ liệu đã nạp nhưng chỉ gắn lỗi trong kỳ. Phân tích 1 tháng trên kho 647.000 dòng: khoảng 7 giây.
- Ứng dụng ghi nhận tháng nào đã phân tích theo bộ quy tắc nào; nhắc "chưa phân tích / cần phân tích lại" ở Tổng quan, Lỗi nhập liệu, Báo cáo và trên từng thẻ tháng. Không còn tự phân tích lại toàn bộ khi khởi động.

**Kỳ rà soát lỗi** (tháng / quý / năm / khoảng tháng / toàn bộ)
- Lỗi nhập liệu, số đếm trên menu, Báo cáo & Thông báo, email và số lỗi ở Tổng quan chỉ tính trong kỳ rà soát. Dữ liệu cũ vẫn dùng đầy đủ cho công nợ, tồn kho, doanh thu – chi phí, kết quả kinh doanh.

**Bổ sung thông tin hàng tồn kho cho dữ liệu đã nạp** (tab Quản lý dữ liệu)
- Xuất từ ERP chỉ các dòng TK 151–158; ứng dụng khớp theo số chứng từ + line + TK Nợ/Có + số tiền và điền thêm mã hàng, ĐVT, kho – không cần nạp lại toàn bộ. Báo cáo số dòng khớp / không tìm thấy, ghi nhật ký.

## v2.4.0 – 30/10/2026
Tab mới **Tuổi hàng tồn kho** (TK 151, 152, 153, 155, 156, 157, 158 – trừ 154):
- Tính tuổi theo mặt hàng (Product), mặt hàng × kho, kho hoặc đối tượng; theo TK tổng hợp hoặc chi tiết.
- Đối tượng theo phía hạch toán: dòng ghi Nợ TK kho lấy kho Locator / Business Partner, dòng ghi Có lấy Locator Credit / Bpartner credit.
- FIFO theo ngày nhập: 0–30, 31–90, 91–180, 181–365 ngày, 1–2 năm, > 2 năm; số lượng nhập/xuất/tồn, ngày nhập và xuất gần nhất.
- Cảnh báo: tồn trên 1 – 2 năm (xem xét dự phòng giảm giá), chậm luân chuyển (> 180 ngày không xuất), tồn âm, thiếu mã hàng; xuất Excel 3 sheet.
- Quy tắc rà soát mới: **Hàng tồn kho thiếu mã hàng**, **Xuất kho vượt tồn** (chỉ xét mặt hàng có phiếu nhập đầu tiên trong dữ liệu, tránh báo nhầm hàng tồn trước kỳ).
- CSDL lưu thêm mặt hàng, ĐVT, kho Nợ/Có. Dữ liệu nạp bằng bản cũ cần **nạp lại** để có thông tin này (ứng dụng nhắc trong tab).

## v2.3.0 – 30/10/2026
**Rà soát dữ liệu mở rộng: 34 quy tắc** (thêm 14):
- Ngày hạch toán ở tương lai · Diễn giải chung chung · Bù trừ công nợ giữa hai đối tượng · Ghi giảm TSCĐ vào chi phí
- Chi phí lớn thiếu hợp đồng/hoá đơn/đề nghị · Bút toán bị người khác sửa · Chi phí số tròn lớn · Bút toán lớn sát cuối tháng (cut-off)
- Hạn thanh toán quá dài · Khấu hao sai khoản mục · Doanh thu không gắn hoá đơn
- Toàn bộ dữ liệu: Chứng từ trải nhiều kỳ · Nghi chia nhỏ khoản chi (≥ 3 chứng từ chi cho một đối tượng trong ngày) · Cặp tài khoản đối ứng bất thường
- Bút toán tự động (khấu hao, phân bổ, kết chuyển XDCB) không còn bị báo "số tiền bất thường".
- Khi bộ quy tắc thay đổi, ứng dụng tự rà soát lại dữ liệu đã nạp (giữ trạng thái/ghi chú).

**Tab mới "Doanh thu & Chi phí"** (thay "Cơ cấu chi phí"):
- Phân tích chi phí hoặc doanh thu theo tài khoản tổng hợp, tài khoản chi tiết, khoản mục (Type of cost / revenue) hoặc bộ phận; theo tháng, quý, năm.
- Bảng nhóm × kỳ có tổng, tỷ trọng, biến động kỳ cuối so với kỳ trước (tô màu tăng/giảm mạnh); biểu đồ diễn biến và cơ cấu.
- Bấm một nhóm để xem các bút toán chi tiết (500 dòng lớn nhất), bút toán có lỗi mở thẳng sang màn hình xử lý lỗi; xuất Excel.

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
