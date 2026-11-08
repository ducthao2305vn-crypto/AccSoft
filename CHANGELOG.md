# Lịch sử phiên bản

## v4.85.4 – 08/11/2026
- Đầu tư ra nước ngoài – Mẫu 03 / 05: thêm bảng **TK công nợ còn số dư nhưng không thuộc mẫu nào**. Liệt kê mọi TK chi tiết nhóm 131, 136, 138, 141, 244, 331, 336, 338, 344, 353 còn số dư trên TB nhưng nằm ngoài danh sách của 2 mẫu, kèm ghi chú (vd 1412 → Mẫu 04), để không sót số dư. Có cả trên màn hình và trong file Excel.

## v4.85.3 – 08/11/2026
- Đầu tư ra nước ngoài – Mẫu 03 / 05: bảng đối chiếu Trial balance có thêm dòng **"131 khác (ròng)"** và **"331 khác (ròng)"**, tức các TK 131 / 331 chi tiết ngoài 13111, 33111, 33121. Mỗi dòng ghi số TK, số dư TB, tổng ròng, chênh lệch và phần dư đúng / ngược chiều.

## v4.85.2 – 08/11/2026
- Thuyết minh B09 **V.5 / V.17:** số đầu kỳ và cuối kỳ của từng TK xếp chiều độc lập như B01, nên tổng đầu kỳ khớp B01 (mã 133 + 136; mã 316 + 319). TK đổi chiều số dư trong kỳ được ghi chú ngay trên dòng và để trống cột phát sinh.

## v4.85.1 – 08/11/2026
- **Thuyết minh B09** theo nguyên tắc B01 mới, tổng các mục khớp đúng B01:
  - **V.3, V.4, V.12, V.13** (top 10): 13111, 33111, 33121 liệt kê theo đối tượng (ghi rõ TK). Các TK 131 / 331 chi tiết khác là một dòng "số dư ròng".
  - **V.5** = B01 mã 133 + 136: TK công nợ khác có dư Nợ ròng, cộng 138812 dư Nợ theo đối tượng. 14121 đã chuyển sang mục hàng tồn kho.
  - **V.17** = B01 mã 316 + 319: TK có dư Có ròng, cộng 138812 dư Có theo đối tượng.

## v4.85.0 – 08/11/2026
- **Báo cáo tài chính (B01) – nguyên tắc trình bày công nợ mới:**
  - TK theo dõi **lưỡng tính** 138812, 13111, 33111, 33121: tách dư Nợ / dư Có **theo từng đối tượng của chính TK đó**.
  - Các TK công nợ khác (131x, 331x, 136, 336, 138, 141, 244, 338…): **số dư ròng từng TK chi tiết**. Dư Nợ vào tài sản, dư Có vào nợ phải trả; không tách theo đối tượng.
  - **14121 tạm ứng vật tư** chuyển sang **Hàng tồn kho** (B01 mã 140, B09 mục V.7, B03 gián tiếp mã 10). Không còn tính vào phải thu.
- Đầu tư ra nước ngoài – Mẫu 03 / 05 theo cùng nguyên tắc: dòng theo đối tượng cho 4 TK lưỡng tính, dòng số dư ròng cho các TK 131 / 331 chi tiết khác, nên tổng khớp B01 mã 131, 132, 311, 312.
- **CĐPS và CĐPS theo đối tượng tô màu cho dễ đọc:**
  - Mỗi nhóm cột đầu kỳ / phát sinh / cuối kỳ có nền riêng; số Nợ màu xanh, số Có màu cam.
  - Các dòng cùng một đối tượng được nhóm bằng dải màu xen kẽ; TK lưỡng tính có nhãn "2 chiều".
  - File Excel CĐPS theo đối tượng cũng tô dải màu theo đối tượng.

## v4.84.0 – 08/11/2026
- Đầu tư ra nước ngoài – **Mẫu 04 hàng tồn kho**: chi tiết theo **mã đối tượng** (đối tượng phía Nợ / Có của TK kho) × TK × mặt hàng, không còn theo kho. Ví dụ với 1412 xem được từng người tạm ứng còn tồn hàng nào, giá trị bao nhiêu, tuổi bao lâu.
- **Mẫu 01:** thuế TNDN hoãn lại lấy từ TK 8212, cộng thêm bút toán 821 đối ứng 243/347 (khi đơn vị không tách 8212). Thuế hiện hành = tổng 821 − hoãn lại.
- **Mẫu 03 và 05:** thêm bảng **đối chiếu Trial balance** cho từng TK:
  - Số dư trên CĐPS so với tổng số dư ròng của mọi đối tượng, kèm chênh lệch.
  - Tách phần dư đúng chiều (đưa vào báo cáo) và dư ngược chiều (thuộc mẫu còn lại). Có cả trên màn hình và trong file Excel.

## v4.83.1 – 08/11/2026
- Kế hoạch năm – PL06: thêm dòng **TFU** (Telemor Fintech) là đơn vị con của VTL. Giao dịch với TFU tự vào dòng này; dòng VTL = số của VTL + TFU.

## v4.83.0 – 08/11/2026
- Module mới **Kế hoạch năm** (nhóm Kết quả & báo cáo) theo mẫu kế hoạch Tập đoàn. Chọn từ tháng – đến tháng; xuất Excel đúng bố cục mẫu (sheet PL01 và PL06).
- **PL01 – chỉ tiêu tài chính**
  - Số thực hiện tự lấy theo tháng, cộng lên quý và năm, kèm TH cả năm trước:
    - Doanh thu SP kinh tế, doanh thu tài chính, thu nhập khác.
    - Chi phí NVL/giá vốn, khấu hao, lương, BHXH, dịch vụ mua ngoài, lãi vay, lỗ CLTG, chi phí khác (theo cặp TK). Lợi nhuận khớp B02.
    - Thuế TNDN, phân phối lợi nhuận (Nợ 421), nộp NSNN (Nợ 333 / Có tiền), chi phí nội bộ (đối tác nội bộ Tập đoàn).
    - Tổng tài sản, TSCĐ, nợ phải thu, VCSH, nợ phải trả (B01 cuối tháng); dự phòng 2293/2294.
    - EBITDA, ROE, ROA, nợ/VCSH.
  - KH năm và KH năm sau nhập tay theo tháng; dòng tổng tự tính. Có ghi chú và so sánh TH/TH năm trước, TH/KH.
- **PL06 – giao dịch nội bộ Tập đoàn**
  - Số TH theo kỳ chọn, chia mua (hàng để bán / xây lắp / TSCĐ-CCDC-trả trước / KHCN / dịch vụ), bán (doanh thu, 3387), chia và nhận cổ tức.
  - Mỗi đơn vị trong danh mục đối tượng (loại NB) tự ánh xạ vào dòng mẫu; đơn vị chưa ánh xạ thì chọn dòng bằng tay.
  - KH năm sau nhập theo 4 quý; cả năm tự cộng.
- **Nạp KH từ file mẫu:** đọc số kế hoạch PL01 (KH năm, KH năm sau, ghi chú) và PL06 (4 quý) từ file Excel mẫu.

## v4.82.0 – 08/11/2026
- Báo cáo quản trị mới **Đầu tư ra nước ngoài** (nhóm Kết quả & báo cáo), theo biểu mẫu giám sát của Tổng công ty. Chọn kỳ: tháng / quý / 6 tháng / 9 tháng / năm / tuỳ chọn. Xuất Excel đủ 6 mẫu, có định dạng và công thức.
  - **Mẫu 01** – SXKD & tài chính (Tr USD): TH cùng kỳ 2 năm trước, năm trước và năm nay lấy từ KQKD (thuế TNDN tách hiện hành / hoãn lại 8212). Cột **KH** và số thuê bao nhập tay, lưu theo kỳ. Có tỷ lệ biến động.
  - **Mẫu 02** – chỉ tiêu tài chính cuối kỳ / đầu năm lấy từ B01-DN. Bổ sung dòng trả trước người bán, phải thu khác, XDCB dở dang. Nợ quá hạn lấy từ mẫu 03.
  - **Mẫu 03** – nợ phải trả theo đối tượng: dư Có 331, 131 (người mua trả trước), 138812, 3388, 353. Có đầu kỳ / tăng / giảm / cuối kỳ, quá hạn theo năm (6 tháng–1 năm, 1–2, 2–3, ≥ 3 năm; FIFO, hạn thanh toán mặc định 30 ngày hoặc theo ngày đến hạn). Đối chiếu với B01 mã 311, 312.
  - **Mẫu 04** – hàng tồn kho 152, 153, 156, 151, 1412 theo TK × kho × mặt hàng (1412 theo đối tượng): số lượng và giá trị đầu kỳ / nhập / xuất / cuối kỳ, phân loại thời gian lưu kho (hạn lưu kho chọn được). Đối chiếu sổ cái từng nhóm.
  - **Mẫu 05** – nợ phải thu theo đối tượng: dư Nợ 131 (1311, 1317), dư Nợ 331 (trả trước người bán), số dư ròng 138811, 13888, 1411. Tuổi nợ theo mẫu (trong hạn, < 3 tháng … ≥ 3 năm), nợ khó đòi (quá hạn ≥ 6 tháng). Đối chiếu B01 mã 131, 132.
  - **Mẫu 06** – danh sách quy trình, quy chế: nạp từ file biểu mẫu (sheet có cột "Tên văn bản"), sửa trực tiếp, thêm / xoá dòng, tick **hết hiệu lực**. Văn bản đã qua ngày hết hiệu lực được cảnh báo, đánh dấu nhanh một lần.

## v4.81.0 – 08/11/2026
- Phân tích ledger: dòng **Khớp** hiện ngay **↔ các chứng từ đang khớp cùng** (kèm số tiền) ở cột Cách khớp – kể cả dòng tổng chứng từ; bấm tên chứng từ để lọc nhanh chứng từ đó.
- Ô tìm trên bảng nhận **nhiều chứng từ cách nhau dấu phẩy** (vd `VTLMN23120006, VTL_HOBT23120091, VTL_HOBT23120090`) → hiện cùng lúc để so và khớp lại.
- Khớp lại: tick các chứng từ (kể cả chứng từ đang thuộc nhóm khớp khác) → **✅ Khớp các chứng từ đã chọn**; phần mềm báo sẽ tách khỏi nhóm cũ, phần còn lại của nhóm cũ được phân tích lại tự động.

## v4.80.1 – 08/11/2026
- Phân tích ledger: nút **✅ Khớp các chứng từ đã chọn** trên thanh tổng luôn hiện khi chọn từ 2 dòng (tick dòng tổng chứng từ A và B) – cân thì khớp ngay, chưa cân thì hỏi lại.

## v4.80.0 – 08/11/2026
- Phân tích ledger: **🕵 Rà sai TK / đối tượng** – với các dòng chưa khớp / cần phân tích (theo bộ lọc đang xem), tìm bút toán **ngược chiều cùng số tiền** trong cửa sổ thời gian nhưng **cùng tài khoản – khác đối tượng** (nghi nhân viên chọn sai đối tượng) hoặc **cùng đối tượng – khác tài khoản** (nghi hạch toán sai tài khoản; bỏ qua TK tiền 111–113). Mỗi dòng liệt kê bút toán nghi vấn (chứng từ, ngày, Nợ/Có TK · đối tượng, diễn giải, số tiền); nhấn đúp để mở; **Ghi nhận** → ghi chú vào dòng chưa khớp (“Nghi hạch toán sai đối tượng – đối ứng … ”) và chuyển Cần phân tích để theo dõi / đề nghị điều chỉnh. Hỗ trợ sai số ± theo tham số.

## v4.79.0 – 08/11/2026
Phân tích ledger – tăng tốc thao tác:
- **🔍 Gợi ý chứng từ đối ứng** (nút trên dòng chưa khớp / cần phân tích hoặc phím **G**): liệt kê chứng từ ngược chiều trong cửa sổ thời gian – A ↔ B cùng số tiền, A = B + C, khớp một phần – xếp theo độ giống diễn giải và gần ngày, hiện Nợ − Có sau khi khớp; bấm **Khớp với** là xong.
- **Phím tắt**: ↑/↓ chuyển dòng, Space tick, **K** khớp / **C** cần phân tích / **X** chưa khớp (dòng đang tick hoặc dòng hiện tại), N ghi chú, G gợi ý, Enter mở bút toán / nhóm khớp, Esc bỏ chọn (nút ⌨ xem lại).
- **Mẫu ghi chú nhanh** (Chờ đối tác xác nhận, Hạch toán sai đối tượng, Chuyển kỳ sau…) ở ô ghi chú chung và ô ghi chú từng dòng.
- **⚡ Khớp hàng loạt theo diễn giải**: gom dòng chưa khớp cùng mẫu diễn giải theo tháng (hoặc ≤ 3 tháng) có tổng Nợ − Có = 0 → duyệt và khớp cả loạt.
- **📈 Chưa khớp theo tháng**: số dòng / số tiền treo từng tháng, so với lần phân tích trước; nhấn đúp một tháng để lọc.
- **Shift + click** ô tick để chọn cả dải dòng.
- Tham số **Cửa sổ** khớp (3 / 5 / 6 / 12 tháng) và **Sai số ±** (vd 0.05 USD làm tròn / tỷ giá); đổi tham số → tự phân tích lại phần tự động.
- **⚡ Phân tích tất cả đối tượng** của tài khoản (có nút Dừng); danh sách “Đã phân tích” xếp đối tượng còn treo nhiều nhất lên đầu.

## v4.78.0 – 08/11/2026
- Phân tích ledger: **thanh tổng các dòng đang chọn** nổi ở cuối màn hình khi tick dòng (hoặc tick dòng tổng chứng từ = cả chứng từ): số dòng, số chứng từ, **tổng Nợ, tổng Có, Nợ − Có** (xanh ✅ khi cân, đỏ khi lệch); khi cân có nút **Đánh dấu khớp nhóm này** (các dòng chọn thành một nhóm khớp tay); nút ✕ Bỏ chọn.

## v4.77.3 – 08/11/2026
- Phân tích ledger (gom theo chứng từ): **dòng tổng chứng từ tô màu theo nhóm khớp** (viền trái + nền nhạt cùng màu cho các chứng từ cùng nhóm; rê chuột xem mã nhóm); chứng từ chưa khớp / cần phân tích giữ nền đỏ / vàng.

## v4.77.2 – 08/11/2026
- Phân tích ledger: tick **Gom theo chứng từ** nay luôn gom (kể cả khi sắp xếp Theo nhóm khớp – các chứng từ cùng nhóm khớp xếp liền nhau); bỏ tick để xem từng dòng tô màu theo nhóm.

## v4.77.1 – 08/11/2026
- Phân tích ledger – **chỉ khớp khi tổng cả chứng từ khớp**: chứng từ nào có một phần dòng đã khớp / sửa tay / nằm ngoài phần phân tích thì không được dùng để tự khớp (B0, B1, B2) – không còn trường hợp một phần chứng từ A khớp với một phần hoặc cả chứng từ B. Kết quả tự động cũ được phân tích lại một lần.

## v4.77.0 – 08/11/2026
- Phân tích ledger – **viết lại nguyên tắc tự khớp theo chứng từ** (không còn tách lẻ từng dòng của một chứng từ để ghép với nơi khác, bỏ các bước ghép theo diễn giải / tổ hợp nhiều dòng dễ khớp sai):
  - B0: chứng từ tự cân (Nợ = Có trong cùng chứng từ).
  - **B1**: tổng chứng từ A = tổng chứng từ B ngược chiều, **trong vòng 5 tháng** (ưu tiên cùng diễn giải, gần ngày).
  - **B2**: chứng từ A + chứng từ B + chứng từ C = 0 (vd A Có = B Nợ + C Nợ), **trong vòng 5 tháng**.
  - Còn lại: bù trừ FIFO → Cần phân tích; còn treo → Chưa khớp.
- Kết quả tự động cũ được phân tích lại một lần theo nguyên tắc mới (giữ dòng sửa tay và ghi chú).

## v4.76.2 – 08/11/2026
- Bản build lại có đủ cột **Liên kết chứng từ (khớp với)** trong Excel ledger (bản 4.76.1 thiếu thay đổi này).

## v4.76.1 – 08/11/2026
- Xuất Excel ledger: thêm cột **Liên kết chứng từ (khớp với)** – với mỗi dòng khớp, liệt kê các chứng từ khác cùng nhóm khớp kèm số tiền (vd “↔ VTL_HOBT26100064 (+15,840)”), hoặc “tự cân trong chứng từ”.

## v4.76.0 – 08/11/2026
- Phân tích ledger – cửa sổ nhóm khớp: dòng **Liên kết chứng từ** cho biết chứng từ nào khớp với chứng từ nào (chứng từ ghi Có −số tiền ↔ chứng từ ghi Nợ +số tiền, chứng từ tự cân); mục **➕ Thêm dòng khác vào nhóm**: danh sách dòng chưa khớp / cần phân tích của cùng tài khoản – đối tượng (tìm theo chứng từ / diễn giải / số tiền, nhấn đúp xem bút toán gốc), tick để thấy Nợ − Có của nhóm sau khi thêm, bấm Thêm → cả nhóm được khoá là khớp tay.

## v4.75.0 – 08/11/2026
- Phân tích ledger: **nhấn đúp một dòng Khớp** → cửa sổ liệt kê **tất cả bút toán cùng nhóm khớp** (kể cả ngoài kỳ đang xem) với Nợ − Có của nhóm; điều chỉnh ngay: **bỏ dòng đã chọn khỏi nhóm** (→ Chưa khớp; phần còn lại nếu không cân cũng chuyển Chưa khớp), chuyển dòng sang Cần phân tích, **huỷ cả nhóm**, hoặc **✅ xác nhận nhóm khớp đúng** (khoá lại, không bị phân tích tự động thay đổi). Nhấn đúp dòng trong cửa sổ để xem bút toán gốc. Dòng chưa khớp / cần phân tích nhấn đúp vẫn mở bút toán gốc.

## v4.74.1 – 07/11/2026
- Phân tích ledger: lọc trên kết quả đã phân tích **theo khoảng ngày** (Lọc ngày từ – đến) và **ô tìm** chứng từ / diễn giải / ghi chú / mã nhóm – không phải phân tích lại; kết hợp được với lọc tình trạng, cách khớp, sắp xếp, xuất Excel theo đúng phần đang lọc; nút ✕ Bỏ lọc.

## v4.74.0 – 07/11/2026
- Phân tích ledger – **sửa thứ tự tự khớp** theo đúng nghiệp vụ: (1) cùng chứng từ Nợ = Có → (2) **theo chứng từ**: tổng một chứng từ = chứng từ ngược chiều (ưu tiên cùng nội dung diễn giải, gần ngày) → (3) một khoản = tổng nhiều dòng gần ngày / cùng diễn giải → (4) **sau cùng mới ghép từng dòng theo số tiền** → nhóm tham chiếu / diễn giải → FIFO. Trước đây ghép dòng lẻ theo số tiền chạy trước nên các dòng 50 USD của chứng từ VTLMN… bị ghép lẻ với nơi khác, chứng từ không còn khớp được với chứng từ thanh toán VTL_HOBT….
- Kết quả tự động cũ được **phân tích lại một lần** theo thứ tự mới (giữ nguyên dòng sửa tay và ghi chú).

## v4.73.2 – 07/11/2026
- Phân tích ledger: đổi tình trạng bằng ô xổ xuống nay **báo lỗi rõ** nếu không lưu được (trước đây lỗi bị bỏ qua nên tải lại vẫn thấy tình trạng cũ); dòng chưa có trong bảng kết quả đã lưu được tạo mới khi sửa tay thay vì bị bỏ qua.

## v4.73.1 – 07/11/2026
- Xuất Excel ledger **tô màu theo nhóm khớp**: mỗi nhóm khớp một màu nền (8 màu xoay vòng), dòng chưa khớp nền đỏ nhạt, cần phân tích nền vàng nhạt; tiêu đề cột nền cam, cố định dòng tiêu đề, định dạng số, dòng số dư đầu kỳ và dòng TỔNG CỘNG; dòng đối ứng trước kỳ ghi rõ. Khi đang sắp xếp theo nhóm khớp, file cũng xếp các dòng cùng nhóm liền nhau.

## v4.73.0 – 07/11/2026
- Phân tích ledger: Sắp xếp **Theo nhóm khớp** – các dòng khớp với nhau nằm liền nhau dưới một dòng tiêu đề nhóm (mã nhóm, số dòng, cách khớp, Nợ − Có = 0 ✅), mỗi nhóm **một màu** (viền trái + nền nhạt) xen kẽ để dễ phân biệt; nhóm sắp theo ngày phát sinh đầu tiên. Bấm lọc ✅ Khớp tự chuyển sang cách sắp xếp này.

## v4.72.5 – 07/11/2026
- Phân tích ledger (gom theo chứng từ): **bấm** dòng tổng → xổ chi tiết ngay dưới; **nhấn đúp** dòng tổng hoặc dòng chi tiết (số tiền…) → mở bút toán gốc. Khi gom theo chứng từ, bấm tiêu đề cột không sắp xếp lại bảng (trước đây làm dòng chi tiết tách khỏi chứng từ tổng) – dùng ô Sắp xếp.

## v4.72.4 – 07/11/2026
- Xuất Excel ledger: cột xếp đúng thứ tự Số chứng từ · Ngày · Diễn giải · TK Nợ · TK Có · Số tiền Nợ · Số tiền Có · Nợ / Có · **Tình trạng** · **Nhóm khớp** · Cách khớp · Ghi chú (trước đây cột Nợ / Có bị đẩy lên đầu, Tình trạng / Nhóm khớp nằm cuối dễ bị bỏ sót).

## v4.72.3 – 07/11/2026
- Phân tích ledger: giữ **đúng bản chất bút toán** – số tiền âm hiện là số âm ở đúng cột phát sinh gốc (vd Có 33888 −150 hiện ở cột Số tiền Có là −150); cột Nợ / Có = Nợ − Có. Dòng tổng các dòng Khớp: tổng Nợ − tổng Có = 0. Thẻ phát sinh Nợ / Có và dòng gom chứng từ tính theo cùng cách.

## v4.72.2 – 07/11/2026
- Phân tích ledger: sửa cột **Số tiền Nợ / Số tiền Có** với bút toán số tiền âm (vd Nợ 13888 / Có 33888 số tiền −150 thực chất là Nợ 33888 150): nay hiện theo chiều thực tế trên tài khoản nên dòng tổng cộng của các dòng Khớp ra Nợ = Có. Xuất Excel cũng sửa tương tự.

## v4.72.1 – 07/11/2026
- Phân tích ledger: lọc **✅ Khớp** nay hiện kèm các **dòng đối ứng trước kỳ** của các nhóm khớp (chữ xám nghiêng, ghi “dòng trước kỳ – đối ứng của nhóm khớp”) để **tổng Nợ = tổng Có** trên bảng; các bộ lọc khác và thẻ số liệu không tính các dòng này. Tăng giới hạn hiển thị lên 20.000 dòng để dòng tổng cộng đủ.

## v4.72.0 – 07/11/2026
- Phân tích ledger – **“Khớp” phải cân Nợ = Có**: mỗi lần mở báo cáo kiểm tra lại các nhóm khớp tự động đã lưu; nhóm nào không cân (vd mã nhóm trùng của bản cũ, dữ liệu nạp lại) được **phân tích lại** – mỗi dòng chỉ thuộc một nhóm, đã khớp với chứng từ này thì không dùng để khớp chứng từ khác.
- Đánh dấu khớp bằng tay: các dòng chọn cùng lúc thành **một nhóm khớp**; nếu chưa cân thì hỏi lại kèm số lệch. Ô “Đã chọn” hiện **Nợ − Có của các dòng đang tick** (✅ cân khi = 0) để chọn đủ dòng đối ứng trước khi lưu.
- Dòng tiêu đề bảng hiện **“Khớp trong kỳ: Nợ − Có”** và giải thích phần lệch: **đối ứng ngoài kỳ** (dòng khớp nằm trước / sau kỳ đang xem – có nhãn ↔ trên dòng) và **nhóm khớp tay chưa cân** (nhãn ⚠ nhóm lệch).

## v4.71.0 – 07/11/2026
- Phân tích ledger: cột **Tình trạng là ô xổ xuống** ngay trên từng dòng (✅ Khớp / ⚠ Cần phân tích / ❌ Chưa khớp / ↺ Tự động) – chọn là lưu luôn, đổi màu dòng và cập nhật số đếm, không cần tick rồi bấm Lưu. Ở chế độ gom theo chứng từ, ô xổ xuống của dòng tổng đổi tình trạng cho cả chứng từ.

## v4.70.0 – 07/11/2026
- Phân tích ledger: khung **📚 Đã phân tích** – danh sách tài khoản × đối tượng đã phân tích (lần cuối, kỳ, số dòng khớp / cần phân tích / chưa khớp, còn treo, số dư, thanh tiến độ % khớp), bấm để mở lại kết quả đã lưu; trong ô chọn đối tượng, đối tượng đã phân tích có dấu ✓ và ngày phân tích.
- **Gom theo chứng từ**: các dòng cùng số chứng từ gom thành một dòng tổng (số dòng, khoảng ngày, diễn giải của dòng gần nhất, tổng Nợ / Có / Nợ−Có, tình trạng chung, ghi chú), bấm để xổ xuống chi tiết; tick dòng tổng = chọn cả chứng từ.
- **Sắp xếp theo |số tiền|**: khoản âm và dương cùng giá trị nằm cạnh nhau (vd −10,000 và 10,000) để dễ đối chiếu; chứng từ tự cân (Nợ = Có) xếp cuối.

## v4.69.0 – 07/11/2026
- Giao diện: **menu chia 7 nhóm** theo nghiệp vụ (Tổng quan · Công nợ phải thu · Công nợ phải trả · Sổ sách & phân tích · Kết quả & báo cáo · Chi phí quản trị · Danh mục & dữ liệu), bấm tên nhóm để thu gọn / mở (nhớ lựa chọn, nhóm chứa trang đang xem luôn mở); tên menu ngắn gọn một dòng.
- **Thống nhất định dạng số** 1,234,567.89 trên mọi màn hình (trước đây số đếm dùng dấu chấm, số tiền dùng dấu phẩy); ô chọn ngày hiển thị **dd/mm/yyyy**.
- Thẻ số liệu gọn hơn (biểu tượng bên trái, thấp hơn ~40%) để bảng dữ liệu lên cao hơn; dòng hướng dẫn dài thu còn 1 dòng (ⓘ, bấm để xem đủ); cột đối tượng / hợp đồng ở đối chiếu 331 rộng hơn.

## v4.68.0 – 07/11/2026
- Phân tích ledger – thêm luật khớp **một khoản = tổng nhiều dòng ngược chiều gần ngày** (vd chi phí hạch toán 1 dòng ↔ thanh toán nhiều dòng, hoặc ngược lại; khoản có thể là 1 dòng hoặc tổng 1 chứng từ), trong cửa sổ ±120 ngày, thử lần lượt: chuỗi dòng liên tiếp theo ngày → chuỗi các dòng có diễn giải giống → tổ hợp tối đa 20 dòng giống diễn giải / gần ngày nhất.
- Lọc nhanh theo tình trạng bằng nút có số đếm: Tất cả / Chưa xong / Chưa khớp / Cần phân tích / Khớp / **Sửa tay** / **Có ghi chú**; thêm lọc **Cách khớp**.

## v4.67.0 – 07/11/2026
- **Phân tích sổ chi tiết (ledger)** (menu mới): chọn kỳ, tài khoản (vd 33888, 1388, 331 – theo tiền tố) và đối tượng (hoặc tất cả) → bảng: số chứng từ, ngày, diễn giải, TK Nợ, TK Có, số tiền Nợ, số tiền Có, **Nợ / Có** (Nợ dương, Có âm), **tình trạng** (Khớp / Cần phân tích / Chưa khớp), cách khớp + mã nhóm khớp, **ghi chú** (sửa trực tiếp, tự lưu).
- Tự đánh giá tình trạng theo thứ tự: (1) cùng chứng từ Nợ = Có, (2) cặp đúng số tiền (ưu tiên cùng tham chiếu / gần ngày), (3) tổng một chứng từ = chứng từ ngược chiều (vd ghi nhận nhiều dòng ↔ một lần chi), (4) nhóm cùng số tham chiếu / cùng diễn giải có tổng = 0 → **Khớp**; phần còn lại bù trừ FIFO → **Cần phân tích**; còn treo → **Chưa khớp** (kèm số còn treo).
- **Kết quả tự lưu**: lần sau cùng tài khoản + đối tượng chỉ phân tích dòng mới và dòng chưa khớp; dòng sửa tay (tình trạng / ghi chú) không bị ghi đè; có “Phân tích lại từ đầu”. Lọc theo tình trạng, bấm mã nhóm để xem các dòng cùng nhóm, nhấn đúp xem chứng từ, xuất Excel.

## v4.66.0 – 07/11/2026
- Công nợ phải thu (1388 / 131): **🛡 khoản đặc biệt – chắc chắn thu được, không tính quá hạn**. Trong sổ chi tiết đối tượng (thẻ Khoản còn nợ): nhập **lý do** + **ngày dự kiến thu** rồi áp dụng cho **các khoản đã tick** hoặc **cả đối tượng**; bỏ được. Khoản đặc biệt vẫn hiện tuổi nợ nhưng không cộng vào “Quá hạn”, tô xanh; **quá ngày dự kiến thu** mà chưa thu → tự tính quá hạn lại và cảnh báo đỏ. Thẻ Quá hạn hiện số miễn quá hạn và số quá ngày cam kết; danh sách có nhãn 🛡 / ⚠ và bộ lọc “Có khoản đặc biệt”, “Khoản đặc biệt đã quá ngày dự kiến thu”.

## v4.65.0 – 06/11/2026
- Công nợ phải thu (trước là “Công nợ 138811 / 138812”): ô **Tài khoản** thêm **1388 (tất cả TK con)** và **131 – Phải thu khách hàng**; FIFO / tuổi nợ, đánh dấu bút toán ghi sai đối tượng, chuyển sang đối tượng đúng dùng chung cho các TK này.
- Bảng **⚠ Nghi trùng tên khác mã**: nhóm các đối tượng có tên giống nhau hoặc gần giống (bỏ mã, dấu, Lda / Unip / S.A / Corp…, phần trong ngoặc) nhưng khác mã, kèm số dư từng mã và tổng nhóm – nhấn đúp để mở sổ chi tiết, đánh dấu bút toán chọn sai đối tượng và chuyển về mã đúng.

## v4.64.2 – 06/11/2026
- Đối chiếu 331 – ô **Hiện** thêm 2 lựa chọn: **Tổng số dư = 0 nhưng còn dư theo hợp đồng** (nghi nhân viên chọn sai hợp đồng khi thanh toán – cần chuyển hợp đồng) và **Tổng số dư khác 0** (đối tượng thật sự còn nợ / ứng trước).

## v4.64.1 – 06/11/2026
- Đối chiếu 331 – sửa theo diễn giải: thêm ô **Chỉ hiện dòng lệch diễn giải** (chỉ còn các dòng có gợi ý để kiểm tra) và nút **↪ chuyển** ngay trên từng dòng để chuyển riêng dòng đó về hợp đồng ghi trong diễn giải.

## v4.64.0 – 06/11/2026
- Đối chiếu 331 – chi tiết: **sửa hợp đồng theo diễn giải**. Dòng có diễn giải nhắc số hợp đồng (thuộc danh sách hợp đồng của đối tượng) khác với hợp đồng nhân viên đã chọn được đánh dấu “⚠ theo diễn giải: …”. Nút **☑ Tick dòng lệch diễn giải** và **✔ Sửa theo diễn giải (dòng đã tick)** – mỗi dòng chuyển về đúng hợp đồng ghi trong diễn giải của nó (xác nhận trước khi lưu, lưu ở điều chỉnh dữ liệu, có thể trả về hợp đồng gốc).

## v4.63.1 – 06/11/2026
- Sửa lỗi đối chiếu 331: hợp đồng có **khoảng trắng thừa ở cuối mã** (vd “…Promotion Telemor image ”) có số dư nhưng nhấn đúp không ra giao dịch (sheet Detail của Excel cũng trống) – nay chuẩn hóa mã hợp đồng.
- Nhấn đúp theo ô (danh sách và bảng hợp đồng trong chi tiết): **Đầu kỳ** → chỉ giao dịch trước kỳ tạo số dư đầu kỳ; **Phát sinh Có** / **Phát sinh Nợ** → chỉ phát sinh Có / Nợ trong kỳ; **Cuối kỳ** → phát sinh Nợ + Có trong kỳ; **tên hợp đồng / đối tượng** → toàn bộ giao dịch đến ngày cuối kỳ. Tiêu đề bảng ghi rõ đang xem phần nào; nút ↺ Xem tất cả.

## v4.63.0 – 06/11/2026
- Đối chiếu 331 – chi tiết hợp đồng: **làm nổi bật khoản còn treo (chưa thanh toán)**. Mỗi hợp đồng ghép khoản phát sinh với khoản thanh toán theo thứ tự: (1) **khớp đúng số tiền**, (2) **theo diễn giải** (thanh toán nhắc số chứng từ / số hóa đơn / mã tham chiếu của khoản phát sinh), (3) **FIFO** cho phần còn lại. Cột **Còn treo** (tô vàng) và **Khớp với** (cách ghép + chứng từ đối ứng); tùy chọn **Chỉ khoản còn treo** kèm số dòng và tổng tiền. Hợp đồng dư Nợ (ứng trước) thì khoản ứng là khoản treo, khoản nhận hàng / hóa đơn là khoản trừ.

## v4.62.0 – 06/11/2026
- Đối chiếu 331: trạng thái đã khớp / chưa khớp **lưu theo tháng phân tích** (tháng của ô “Đến ngày”) – vd tháng 09 đã khớp thì tháng 10 vẫn là “chưa đối chiếu”, kèm gợi ý trạng thái tháng gần nhất trước đó; cửa sổ chi tiết có lịch sử trạng thái theo tháng. Bộ lọc **Trạng thái tháng**: Tất cả / **Ẩn đã khớp** / Đã khớp / Chưa khớp / Chưa đối chiếu; thẻ Đối tượng đếm theo tháng. Trạng thái đã đánh dấu ở bản trước được chuyển sang đúng tháng.

## v4.61.1 – 06/11/2026
- Sửa lỗi Excel đối chiếu 331 báo “Repaired … XML error” khi mở: phần cài đặt in (khổ ngang) bị chèn sai thứ tự trong sheet – nay đúng chuẩn Excel.

## v4.61.0 – 06/11/2026
- Đối chiếu 331: **trạng thái đối chiếu theo đối tượng** – ✅ Đã khớp / ❌ Chưa khớp / chưa đối chiếu, kèm ghi chú (lý do chưa khớp…) và ngày số dư đã đối chiếu. Đánh dấu hàng loạt (tick đối tượng → nút ✅ Đã khớp / ❌ Chưa khớp) hoặc trong cửa sổ chi tiết; cột **Đối chiếu** trong danh sách, bộ lọc **Đối chiếu** (đã khớp / chưa khớp / chưa đối chiếu) và số đếm ở thẻ Đối tượng.

## v4.60.2 – 06/11/2026
- Excel đối chiếu 331: thiết kế lại theo tông màu ứng dụng (tiêu đề cam, khung viền cam nhạt, dòng tổng nền cam nhạt), **cột của đối tác điền sẵn bằng số của công ty** (đầu kỳ, phát sinh, đã nhận, cuối kỳ = công thức) để đối tác chỉ sửa số khác – cột Chênh lệch tự tính; “Currency: USD” canh đúng mép phải bảng; **chân ký** mới: “Confirmed by …”, ngày, Kế toán / Kế toán trưởng mỗi bên, dòng ký tên; in khổ ngang vừa 1 trang.

## v4.60.1 – 06/11/2026
- Đối chiếu 331: **nhấn đúp một dòng hợp đồng** (ở danh sách hoặc bảng hợp đồng trong cửa sổ chi tiết, kể cả “(không có hợp đồng)”) → chỉ hiện giao dịch của đúng hợp đồng đó; nút **↺ Xem tất cả hợp đồng** để quay lại. Nhấn đúp dòng đối tượng vẫn hiện giao dịch mọi hợp đồng còn số dư. Sau khi lưu sửa hợp đồng vẫn giữ hợp đồng đang lọc.

## v4.60.0 – 06/11/2026
- **Đối chiếu công nợ 331 theo hợp đồng** (menu mới): chọn khoảng ngày → danh sách đối tượng × hợp đồng có số dư đầu kỳ, phát sinh Có (phải trả), phát sinh Nợ (trả / ứng), cuối kỳ; **tách số dư phải trả (dư Có) và ứng trước cho NCC (dư Nợ) theo từng hợp đồng** (TK 3311 vừa phải trả vừa cho ứng trước). Lọc: còn số dư / có ứng trước / vừa phải trả vừa ứng trước / có số dư không có hợp đồng.
- Nhấn đúp đối tượng → cửa sổ chi tiết: hợp đồng **còn số dư** (ẩn hợp đồng hết dư, có nút hiện tất cả) và toàn bộ giao dịch của các hợp đồng đó; tick dòng → chọn / nhập **hợp đồng đúng** → Lưu (lưu ở điều chỉnh dữ liệu, không sửa dữ liệu gốc; có “trả về hợp đồng gốc”). Lưu tên đối tác / liên hệ in trên biên bản.
- **Xuất biên bản**: Word xác nhận số dư theo mẫu (số dư phải trả, ứng trước, số dư từng hợp đồng – đã bỏ phần phải thu) và Excel (sheet Summary theo mẫu đối chiếu chỉ phần phải trả + cột để đối tác điền, sheet Detail giao dịch từng hợp đồng trong kỳ có số dư đầu / cuối). Xuất một đối tượng hoặc nhiều đối tượng đã tick (chọn thư mục).

## v4.59.0 – 06/11/2026
- Chi phí theo phòng ban: lựa chọn **Hiển thị: Tổng hợp / Chi tiết theo type of cost**. Chi tiết: mỗi phòng ban × nhóm chi phí tách thành từng dòng type of cost theo tháng, có dòng cộng của phòng ban; nhấn đúp ô của một dòng type of cost → chỉ các bút toán của type of cost đó để điều chỉnh phòng ban. Ô Tìm cũng tìm theo type of cost.

## v4.58.1 – 06/11/2026
- Chi phí theo phòng ban: thêm cột **Type of cost** – mỗi dòng (phòng ban × nhóm chi phí) hiện các type of cost trong kỳ xem kèm số tiền (3 loại lớn nhất, rê chuột xem đủ) để xác định chi phí thuộc phòng ban nào trước khi điều chỉnh.

## v4.58.0 – 06/11/2026
- Đối chiếu hóa đơn – 138812: **🏦 Thu hộ** – quy tắc “mã gạch nợ (Collection code / Payment staff) chứa … → đối tượng ERP thu hộ”. Mặc định **MOSANMM_VTL** (Mosan); hóa đơn Payment khớp quy tắc được tính cho đối tượng thu hộ (vd **Telemor Fintech**) thay vì khách hàng gốc, cả ở bảng đối chiếu lẫn cửa sổ chi tiết (dòng có nhãn 🏦 thu hộ). Có thể thêm nhiều quy tắc.

## v4.57.1 – 06/11/2026
- Map khách hàng: **nhấn đúp một dòng** (chỗ không phải ô chọn / nút) → cửa sổ giao dịch gần nhất của account đó: hóa đơn BCCS (ngày lập, tháng HĐ, số HĐ, shop, nhân viên, loại giao dịch, hợp đồng/ISDN, tiền), hóa đơn phát hành và Payment (ngày nộp, kỳ cước, số HĐ, hợp đồng, dịch vụ, nhân viên thu) – 100 dòng mới nhất mỗi loại, có dòng tổng – để nhận diện khách hàng trước khi map.

## v4.57.0 – 06/11/2026
- **🔎 Tra cứu bút toán ERP** (nút trên thanh đầu trang hoặc **Ctrl+K**): popup tìm bút toán theo ô tìm nhanh mọi trường (gõ nhiều từ = phải chứa tất cả; gõ số = khớp đúng số tiền hoặc chứa số đó) và lọc riêng theo số chứng từ, nội dung, đối tượng công nợ (Nợ/Có), hợp đồng, mã vị trí / trạm, biển số xe, nhân viên nhập, tài khoản, số hóa đơn, đề nghị tạm ứng, khoảng số tiền, khoảng ngày. Kết quả có dòng tổng cộng; nhấn đúp dòng để xem toàn bộ chứng từ (đóng chi tiết quay lại kết quả tìm). Giữ điều kiện tìm lần trước.

## v4.56.2 – 05/11/2026
- Map khách hàng: mỗi dòng có nút **💾 Lưu** – chọn mã ERP xong dòng hiện “● chưa lưu”, bấm Lưu → “✓ đã lưu”. Thêm nút **💾 Lưu tất cả thay đổi (n)** ở hàng Map đồng loạt.

## v4.56.1 – 05/11/2026
- Sửa lỗi **map không lưu**: gõ vào ô “🔍 Gõ để tìm” cạnh danh sách chọn trước đây tự hiện mục đầu tiên như đã chọn nhưng **chưa lưu** (phải nhấn Enter). Nay gõ chỉ lọc danh sách (ô viền vàng = có mục khớp); nhấn **Enter** để chọn mục đầu hoặc mở danh sách và chọn → lưu ngay.
- Nạp lại danh mục khách hàng (DMKH) **không ghi đè** các map đã chọn trong phần mềm.

## v4.56.0 – 05/11/2026
- Đối chiếu hóa đơn – nhấn đúp ô: thêm bảng **🔗 Ghép hóa đơn ↔ bút toán ERP** – ghép từng hóa đơn với từng dòng hạch toán: (1) số hóa đơn nằm trong diễn giải ERP, (2) account trong diễn giải + cùng số tiền, (3) cùng số tiền duy nhất. Trạng thái Khớp / Lệch tiền / Chỉ có hóa đơn / Chỉ có ERP, lọc nhanh bằng nút; dòng lệch xếp lên đầu.
- Mọi bảng trong cửa sổ chi tiết có **dòng TỔNG CỘNG** (tự cộng lại theo dòng đang hiện khi lọc bằng ô tìm).
- Map khách hàng: lọc **Nguồn: BCCS (theo tên khách hàng) / Cước (theo account)**; dòng BCCS có nhãn BCCS; số hóa đơn, tổng tiền, ngày gần nhất của BCCS nay được tính (trước chỉ tính cước).

## v4.55.1 – 05/11/2026
- Sửa dòng tổng cộng cột HĐ BCCS / HĐ Payment.

## v4.55.0 – 05/11/2026
- Đối chiếu hóa đơn – 138812: tách hóa đơn thành 3 cột **HĐ BCCS**, **HĐ Payment (cước)** và **Tổng HĐ** (có ở dòng tổng cộng và file Excel).

## v4.54.1 – 05/11/2026
- Đối chiếu hóa đơn: cột **Nộp tiền** cộng thêm **Có 138811** của đối tượng BC19 (giống phía ghi nhận Nợ 138811 BC19); bảng chi tiết nộp tiền cũng hiện bút toán 138811.

## v4.54.0 – 05/11/2026
- Đối chiếu hóa đơn – 138812: **nộp tiền tách cột riêng** – mỗi ô tháng thêm dòng 💰 nộp tiền (ERP Có 138812) và cột **Nộp tiền** tổng; không tính vào chênh lệch (chênh lệch chỉ so doanh thu hóa đơn ↔ ghi nhận Nợ 138812). Bỏ chế độ so sánh “Thu cước theo ngày nộp ↔ Có 138812”. Nhấn đúp ô: thêm bảng bút toán nộp tiền. Xuất Excel có cột nộp tiền theo tháng.

## v4.53.0 – 05/11/2026
- Đối chiếu hóa đơn: **điều chỉnh hóa đơn BCCS thành số âm** – nhấn đúp ô tháng / tổng → bảng hóa đơn có nút **− Điều chỉnh âm** trên từng dòng BCCS (báo cáo BCCS xuất số dương cho hóa đơn điều chỉnh giảm); bấm **↺ Bỏ âm** để trả lại. Chỉ áp dụng hóa đơn BCCS – hóa đơn cước không điều chỉnh được.

## v4.52.4 – 05/11/2026
- Doanh thu BCCS: **giữ đúng dấu âm** của hóa đơn âm – đọc được số âm dạng `-1,200`, `(1,200)`, `1,200-`, dấu trừ Unicode; giao dịch trả hàng / hủy / hoàn tiền / điều chỉnh giảm (theo Transaction type, Status, Reason) ghi âm nếu file để số dương.
- Nạp lại file BCCS cũ: các hóa đơn âm đã nạp sai thành dương được **tự sửa dấu** (vẫn chặn nhân đôi các hóa đơn còn lại).

## v4.52.3 – 05/11/2026
- Đối chiếu hóa đơn: ô **ngày / tháng** không tải lại khi đang gõ – tab Map: chọn *Thu gần nhất từ – đến* rồi nhấn **Enter** hoặc **🔍 Tìm**; tab Đối chiếu: chọn *Từ tháng – Đến tháng* rồi bấm **Xem** (hoặc Enter).

## v4.52.2 – 05/11/2026
- Map khách hàng: ô tìm **không tải lại khi đang gõ** – gõ xong nhấn **Enter** hoặc bấm **🔍 Tìm**; tải danh mục account nhanh hơn (gộp truy vấn).

## v4.52.1 – 05/11/2026
- Map đồng loạt: khi không tick dòng nào, áp cho các dòng **đang hiện trên bảng** – kể cả khi lọc bằng ô *Tìm trong bảng* (vd gõ “_gftth_” → 424 dòng → map 1 lần). Ô chọn tất cả chỉ tick các dòng đang hiện.

## v4.52.0 – 05/11/2026
- Đối chiếu hóa đơn – tab Map khách hàng: lọc theo **Thu gần nhất từ – đến** (ngày); **Map đồng loạt** – tick dòng (hoặc ô chọn tất cả) rồi chọn mã đối tượng ERP → *Map các dòng*; không tick dòng nào thì áp cho **toàn bộ dòng đang lọc** (vd tìm “polisia” → map 22 account một lần). Có nút *Bỏ map các dòng*.

## v4.51.3 – 05/11/2026
- Đối chiếu hóa đơn – 138812: nhấn đúp ô **Tổng HĐ / Tổng ERP** giờ chỉ hiện hóa đơn và bút toán ERP **trong kỳ đang chọn** (Từ tháng – Đến tháng), không còn lấy toàn bộ lịch sử; nhấn đúp **Tổng ERP** hiện bảng bút toán ERP lên trước.

## v4.51.2 – 05/11/2026
- Đối chiếu hóa đơn – 138812: **chống nạp trùng** – khi nạp bổ sung, nếu file có hóa đơn (số hóa đơn + account; BCCS: số hóa đơn + mã giao dịch) **đã nạp trước đó**, phần mềm **dừng, không nạp dòng nào** và hiện danh sách hóa đơn trùng (sheet, loại, số hóa đơn, khách hàng, tháng, số tiền) để bạn loại khỏi file rồi nạp lại. File chỉ có danh mục khách hàng vẫn nạp / cập nhật bình thường.

## v4.51.1 – 05/11/2026
- Đối chiếu hóa đơn – 138812: tháng so sánh = **tháng / năm trên hóa đơn** (BCCS: cột *Năm_tháng* hoặc *Năm* + *Tháng*; cước phát sinh: *Year_month_Cuoc*), không phụ thuộc ngày lập giao dịch hay ngày nạp file. Nạp lại file BCCS đã nạp trước sẽ tự sửa tháng các dòng cũ. Cách so sánh mặc định: **Doanh thu theo tháng trên hóa đơn ↔ Nợ 138812**.

## v4.51.0 – 05/11/2026
- Đối chiếu hóa đơn – 138812: thêm **doanh thu bán hàng BCCS** (file "Doanh thu theo hóa đơn BCCS": Shop, Staff, Transaction type/code, Date of creation, Before tax, Tax, After tax, Status, Invoice no, Name of customer, ISDN, Contract, Code ERP…).
  - Chỉ lấy giao dịch đã lập hóa đơn (bỏ "Not created invoice"); khách hàng có *Code ERP* hoặc tên dạng "VTL_VEN_043-…" được map sẵn mã ERP, còn lại map ở tab Map (có gợi ý tên).
  - Doanh thu so với ERP = **cước phát sinh** (file thu cước theo hóa đơn, theo kỳ cước) **+ doanh thu BCCS**; chọn nguồn *Cước + BCCS / Chỉ cước / Chỉ BCCS*.
  - Phía ERP = **Nợ 138812 (mọi đối tượng) + Nợ 138811 của đối tượng BC19** (đổi được mã đối tượng 138811 tính thêm).
  - **Nạp bổ sung** bất kỳ lúc nào cho tháng mới / tương lai (cùng nút *Nạp file (bổ sung)*): mọi loại file – danh mục, cước, phát hành, BCCS – nạp chồng, dòng đã có tự bỏ qua (BCCS khoá theo số hóa đơn + mã giao dịch).
  - Chi tiết ô ghi rõ dòng BCCS (shop, nhân viên) và dòng cước.

## v4.50.0 – 05/11/2026
- Đối chiếu hóa đơn – 138812: thêm **báo cáo phát hành hóa đơn** để so với **Nợ 138812** (doanh thu ghi nhận ERP).
  - Nạp cùng nút *Nạp file*: sheet có cột số hóa đơn + account / subscriber + ngày phát hành / kỳ cước (không có "Pay date") được nhận là báo cáo phát hành; tự nhận các cột chưa thuế / thuế / tổng tiền, khách hàng, hợp đồng, dịch vụ. Nạp lại không nhân đôi.
  - Cách so sánh mới (mặc định): **Phát hành hóa đơn theo tháng phát hành ↔ Nợ 138812**, hoặc **theo kỳ cước ↔ Nợ 138812**; tuỳ chọn **Chưa thuế**. Vẫn giữ so sánh thu cước (kỳ cước / ngày nộp).
  - Chi tiết ô: danh sách hóa đơn phát hành (ngày phát hành, kỳ cước, số hóa đơn, thuế, tổng) và bút toán ERP.

## v4.49.0 – 05/11/2026
**Mô-đun mới: Đối chiếu hóa đơn – 138812** (menu Phân tích)
- **Nạp file** Excel nhiều sheet: sheet danh mục khách hàng (cột *Account chuẩn hoá*, *Code ERP*, *Name ERP*, phí tháng…) và sheet báo cáo thu cước theo hóa đơn (*Pay date, Contract no, Subscriber, Customer name, Total amount, Invoice no, Year_month_Cuoc*…); tự nhận theo tên cột, nạp lại không nhân đôi hóa đơn, giữ map đã sửa.
- **Map khách hàng ↔ ERP**: mỗi account gán mã đối tượng ERP của 138812 (một mã ERP có thể nhiều account); chọn trong danh sách đối tượng 138812 trên sổ, **gợi ý theo tên** (bỏ các từ chung như Unip, Lda, Timor…), *Nhận tất cả gợi ý*.
- **Đối chiếu theo tháng × đối tượng**: *Doanh thu* – hóa đơn theo kỳ cước ↔ Nợ 138812; hoặc *Thu tiền* – hóa đơn theo ngày nộp ↔ Có 138812. Mỗi ô hiện hóa đơn / ERP, tô đỏ khi lệch; trạng thái khớp / chênh lệch / có hóa đơn ERP chưa ghi / ERP có không có hóa đơn / account chưa map.
- **Nghi ghi nhầm đối tượng**: liệt kê các cặp cùng tháng – đối tượng A thiếu đúng bằng số đối tượng B thừa – để chuyển bút toán ở mô-đun Công nợ 138811 / 138812.
- Nhấn đúp ô tháng / tổng: danh sách hóa đơn và bút toán ERP tương ứng; xuất Excel (đối chiếu + cặp nghi nhầm).

## v4.48.0 – 05/11/2026
**Mô-đun mới: Công nợ 138811 / 138812 theo đối tượng** (menu Phân tích)
- FIFO theo đối tượng: Nợ 1388x = doanh thu / ghi nợ (thường nhập ngày cuối tháng), Có = nộp / thu tiền (theo ngày thực tế). Số còn nợ = các khoản ghi Nợ gần nhất cộng đủ số dư → tiền nộp trước ngày ghi doanh thu cuối tháng vẫn cân trừ đúng, không bị tính quá hạn sai.
- **Đánh dấu bút toán ghi sai đối tượng** (doanh thu hoặc thu tiền) ngay trong sổ chi tiết, kèm ghi chú: *loại khỏi tuổi nợ* (để trống đối tượng đúng) hoặc *chuyển sang đối tượng đúng* (bút toán được tính cho đối tượng đó). Dữ liệu gốc không bị sửa; danh sách bút toán ghi sai xem / bỏ đánh dấu tập trung.
- Bảng theo đối tượng: đầu kỳ, phát sinh Nợ / Có, cuối kỳ theo sổ, phần ghi sai, số dư tính tuổi nợ, ≤ 30 / 31–60 / 61–90 / > 90 ngày, khoản cũ nhất; lọc còn số dư / quá hạn / số dư âm / có bút toán ghi sai; nhấn đúp số liệu nào mở đúng phần đó; xuất Excel.

## v4.47.2 – 05/11/2026
- Công nợ tạm ứng: **trạng thái đối chiếu lưu theo mã đối tượng** (đã gửi / đã xác nhận / có chênh lệch, ghi chú, số xác nhận). Trạng thái cũ lưu theo nhân viên được tự chuyển sang từng mã đối tượng của người đó. Ở chế độ *Gộp theo nhân viên*, đánh dấu sẽ áp cho mọi mã của người đó và trạng thái hiển thị tổng hợp từ các mã (có chênh lệch → chênh lệch; tất cả xác nhận → đã xác nhận).

## v4.47.1 – 05/11/2026
- Công nợ tạm ứng: mặc định **theo mã đối tượng** – mỗi mã đối tượng công nợ là một dòng, tên giống nhau nhưng mã khác là 2 đối tượng (tuổi nợ, FIFO, backup, đối chiếu tính riêng từng mã). Dòng hiện thêm mã đối tượng dưới tên nhân viên. Muốn xem tổng theo người: ô **Hiển thị → Gộp theo nhân viên (danh mục)**.

## v4.47.0 – 05/11/2026
- **Ô tìm nhanh cho mọi bảng chi tiết, toàn ứng dụng**: mọi bảng trong cửa sổ chi tiết (nhấn đúp) – vd backup money, khoản còn treo, theo đề nghị, sổ chi tiết tạm ứng, sổ công nợ chủ nhà trạm, bút toán vị trí / xe / phòng ban, tài chính… – và các bảng trên trang chưa có ô tìm riêng đều có ô 🔍 phía trên. Gõ nhiều từ (không phân biệt hoa thường / dấu) → chỉ còn dòng chứa đủ các từ, hiện "x / y dòng"; Esc để xoá.

## v4.46.4 – 05/11/2026
- Backup money: danh sách để chọn **loại các khoản thuộc đề nghị tạm ứng đã clear** (hoàn ứng / quyết toán) **từ 60% trở lên** tổng số tiền của đề nghị – ngưỡng % chỉnh được (ô "Ẩn đề nghị đã clear ≥ … %", ghi nhớ). Bảng thêm cột *Đề nghị: tạm ứng*, *Đã clear*, *% clear*. Khoản đã chọn backup luôn hiện.

## v4.46.3 – 05/11/2026
- Backup money: danh sách mặc định **chỉ hiện các khoản đã chọn backup**; ô "Hiện" để chuyển sang *Khoản số tiền chẵn – để chọn thêm* hoặc *Mọi khoản tạm ứng* (nhân viên chưa có backup thì mở sẵn danh sách số tiền chẵn).

## v4.46.2 – 05/11/2026
- Công nợ tạm ứng – đổi đề nghị tạm ứng: ô gợi ý mặc định **chỉ hiện các đề nghị của nhân viên còn số dư** (còn treo hoặc hoàn ứng vượt), kèm số dư từng đề nghị; tích **"Hiện tất cả đề nghị"** để xem cả đề nghị đã hết số dư.

## v4.46.1 – 05/11/2026
- Công nợ tạm ứng: **nhấn đúp vào số liệu nào thì chỉ mở đúng phần đó** thay vì mở tất cả:
  - Đầu kỳ / Tạm ứng / Hoàn ứng → sổ chi tiết (Tạm ứng chỉ hiện dòng tạm ứng, Hoàn ứng chỉ hiện dòng hoàn ứng).
  - Ô ≤ 30 / 31–60 / 61–90 / > 90 ngày → chỉ các khoản còn treo của đúng nhóm tuổi đó.
  - Ô **Backup money** → chỉ phần backup (khoản backup đang treo + danh sách chọn backup).
  - Khoản treo / Cũ nhất → khoản còn treo + theo đề nghị tạm ứng; Đối chiếu → phần đối chiếu; Cuối kỳ → khoản treo, backup, sổ chi tiết.
  - Nhấn đúp tên nhân viên → tất cả. Thanh chọn phía trên để chuyển phần khác mà không cần đóng.

## v4.46.0 – 05/11/2026
- Công nợ tạm ứng: chọn **Phương pháp FIFO**:
  1. **Chỉ theo đối tượng** (như trước) – hoàn ứng trừ vào tạm ứng của cùng nhân viên.
  2. **Theo đối tượng + Đề nghị tạm ứng** – mỗi đề nghị tạm ứng (Advance Request) cân trừ riêng; đề nghị hoàn ứng vượt / hoàn ứng không có đề nghị được trừ vào các đề nghị còn dư cũ nhất → tổng vẫn = số dư; backup money ưu tiên trong từng đề nghị.
- Màn hình chi tiết nhân viên: bảng **Theo đề nghị tạm ứng** (tạm ứng, hoàn ứng, chênh lệch, còn treo, tuổi; đề nghị *hoàn ứng vượt* tô đỏ – dấu hiệu chọn sai đề nghị).
- **Sửa đề nghị tạm ứng** ngay trong sổ chi tiết: tích các dòng chọn sai → nhập / chọn đề nghị đúng → *Đổi đề nghị tạm ứng* (hoặc *Trả về gốc*). Không sửa dữ liệu gốc; lưu ở Điều chỉnh dữ liệu (trường mới "Đề nghị tạm ứng"), tuổi nợ tính lại ngay.
- Biên bản và email đối chiếu dùng phương pháp FIFO đang chọn.

## v4.45.2 – 04/11/2026
- Sửa công nợ tạm ứng có **backup money**: trước đây chọn backup xong tuổi nợ vẫn giữ nguyên số tiền đó (backup + tuổi nợ > số dư). Nay luôn **Tổng nợ = Backup money + các nhóm tuổi nợ**: số dư dành trước cho khoản backup đã đánh dấu, phần còn lại mới phân tuổi cho các khoản tạm ứng thường gần nhất còn treo (backup không còn bị tính quá hạn 30 ngày).

## v4.45.1 – 04/11/2026
- Công nợ tạm ứng: **không còn tính TK 1412 (tạm ứng vật tư)** – khoản này đã theo dõi ở *Tuổi hàng tồn kho* (vật tư hàng hoá). Báo cáo, đối chiếu, biên bản, email chỉ gồm tạm ứng tiền (141 trừ 1412); tổng khớp số dư TK 1411 trên sổ.

## v4.45.0 – 04/11/2026
- Công nợ tạm ứng: **Backup money** (tạm ứng duy trì, mặc định 12 tháng).
  - Nhấn đúp nhân viên → mục **💼 Backup money** liệt kê các khoản tạm ứng **số tiền chẵn** (tích "Hiện mọi khoản tạm ứng" để xem tất cả); tích chọn khoản là backup money rồi **Lưu**.
  - Khoản backup **không tính quá hạn** theo hạn thường (vd 30 ngày); hoàn ứng / quyết toán trừ vào **các khoản tạm ứng thường trước**, chỉ phần dư mới trừ vào backup → tuổi nợ, quá hạn tính tiếp đúng cho các giao dịch khác.
  - Backup chỉ quá hạn khi vượt số tháng backup (ô "Backup money … tháng" trên thanh lọc). Bảng có cột **Backup money** (đỏ nếu quá hạn backup); xuất Excel có thêm cột backup.

## v4.44.0 – 04/11/2026
**Mô-đun mới: Danh mục chủ nhà trạm** (menu Phân tích → Chủ nhà trạm)
- Tự lấy từ sổ: chủ nhà = đối tượng **Có 331** trong bút toán **Nợ 24211**; đã trả = **Nợ 331 / Có 112**; còn phải trả = số dư 331 của đối tượng.
- Tự rút: tên chủ nhà, mã nhà cung cấp, **mã nhà trạm** (vd AN0002 – từ tên đối tượng, hợp đồng, diễn giải), **hợp đồng thuê** (cột Contract), **kỳ thuê gần nhất** và ngày hết hạn, **giá thuê / tháng** (đọc "$40/month", "$60 * 6 months" trong diễn giải), ngày trả gần nhất.
- **Số tài khoản, ngân hàng, chủ tài khoản, SĐT, địa chỉ** (sổ không có): nhập tay (nhấn đúp) hoặc **nạp từ file Excel** (khớp theo mã đối tượng / mã NCC / mã trạm / tên); có thể sửa mã trạm, ngày hết hạn, giá thuê, ghi chú.
- Lọc: chưa có số tài khoản, chưa có mã trạm, còn công nợ, kỳ thuê sắp / đã hết hạn (số ngày tự đặt); sổ công nợ 331 từng chủ nhà; xuất Excel.

## v4.43.0 – 04/11/2026
**Mô-đun mới: Công nợ tạm ứng theo nhân viên & đối chiếu** (menu Phân tích → Công nợ tạm ứng)
- Theo TK 141 (hoặc 1411 / 1412): số dư đầu kỳ, tạm ứng (Nợ), hoàn ứng / quyết toán (Có), số dư cuối kỳ cho từng nhân viên – gộp mọi mã đối tượng của cùng một người theo *Danh mục nhân viên → Ghép đối tượng công nợ*; đối tượng chưa ghép vẫn hiện riêng (tô vàng).
- Khoản tạm ứng **còn treo** tính FIFO (hoàn ứng trừ khoản cũ nhất), tuổi ≤ 30 / 31–60 / 61–90 / > 90 ngày, khoản cũ nhất; lọc còn số dư / quá hạn / chưa xác nhận / chưa ghép, phòng ban, tìm kiếm; tổng khớp số dư TK 141 trên sổ.
- Nhấn đúp nhân viên: sổ chi tiết tạm ứng có số dư luỹ kế, danh sách khoản còn treo (chứng từ, đề nghị tạm ứng, nội dung, số ngày).
- **Đối chiếu**: xuất **biên bản đối chiếu** Excel (biên bản + khoản còn treo + sổ chi tiết; nhiều nhân viên → mỗi người 1 sheet); **gửi email đối chiếu** riêng cho từng nhân viên kèm file biên bản; theo dõi trạng thái *Đã gửi / Đã xác nhận / Có chênh lệch*, số dư nhân viên xác nhận và chênh lệch so với sổ.
- Xuất báo cáo công nợ tạm ứng Excel.

## v4.42.0 – 04/11/2026
- Danh mục nhân viên: tab mới **Ghép đối tượng công nợ** – dò mọi đối tượng công nợ dạng mã nhân viên trong sổ (vd `VTL_HOEMP000305_Luong Van Thai`) và ghép với nhân viên trong danh mục.
  - **Tự ghép theo họ tên** (không phân biệt hoa thường / dấu; trùng tên hoặc trùng đủ các từ, chỉ ghép khi duy nhất một người khớp); gợi ý từng dòng, bấm để nhận.
  - Ghép / đổi / bỏ ghép thủ công từng dòng hoặc nhiều dòng; một nhân viên có thể có **nhiều mã đối tượng** (vd Ngo Van My có HOEMP000213 và HOEMP000353).
  - Lọc chưa ghép / đã ghép, tìm kiếm; thẻ số liệu tỷ lệ đã ghép. Thông tin nhân viên hiện danh sách đối tượng công nợ đã ghép kèm số bút toán.

## v4.41.0 – 04/11/2026
**Mô-đun mới: Danh mục nhân viên** (menu Kiểm soát → Danh mục nhân viên)
- **Nạp file** danh sách CBCNV dạng "LIST NAME ALL STAFF OF COMPANY" (tiêu đề 2 dòng, tự nhận cột theo tên) – *thêm / cập nhật* theo mã nhân viên hoặc *thay toàn bộ*; nạp lại không mất User ERP / ghi chú / trạng thái đã sửa.
- Thông tin lưu: mã, họ tên, chức danh, phòng ban, đơn vị, loại HĐ, cấp bậc, khối, lĩnh vực, trực tiếp / gián tiếp, quốc tịch, giới tính, ngày sinh, ngày vào làm, ngày hết HĐ / về nước, SĐT, email 1 / 2, **User ERP**, trạng thái, ghi chú. Không lưu CMT / hộ chiếu / NISS / hộ khẩu.
- **Thêm / sửa / xoá** (nhấn đúp dòng để sửa; nên đặt trạng thái "Đã nghỉ" thay vì xoá để giữ lịch sử); tìm kiếm, lọc phòng ban, đơn vị, trạng thái, loại HĐ, quốc tịch; thẻ số liệu (chưa có email, HĐ hết hạn trong 60 ngày); xuất Excel.
- **Gửi email** cho một hoặc nhiều nhân viên (qua SMTP đã cấu hình), nội dung tự soạn với biến {name} {code} {position} {dept} {unit}.
- Gửi thư lỗi nhập liệu: người nhập ERP được tra email theo danh mục nhân viên (khớp email, User ERP, mã NV hoặc phần trước @) khi chứng từ không có sẵn email.

## v4.40.0 – 04/11/2026
**Sửa dự báo dòng tiền: có đầu tư, khấu hao, vay**
- Trước đây HĐĐT luôn = 0 và khấu hao không được cộng lại → dòng tiền sai. Nay theo đúng phương pháp gián tiếp:
  - **HĐKD** = LNST + **khấu hao TSCĐ** (chi phí không chi tiền) ± biến động phải thu, tồn kho, TS ngắn hạn khác, nợ phải trả (không gồm vay đầu tư).
  - **HĐĐT** = **chi mua sắm TSCĐ** = đầu tư duy trì + kế hoạch đầu tư, ± đầu tư tài chính / XDCB / TS dài hạn khác.
  - **HĐTC** = tiền vay / trả nợ vay đầu tư − chia lợi nhuận.
- Khấu hao và đầu tư duy trì lấy **từ sổ**: bình quân 3 năm gần nhất của Có 214 và Nợ 211/213/241 (không tính kết chuyển giữa các TK tài sản); có ô **Đầu tư duy trì / năm** để tự nhập.
- TSCĐ trên B01 = đầu kỳ + đầu tư (duy trì + kế hoạch) − khấu hao (hiện có + đầu tư mới).
- Thêm tab **Lưu chuyển tiền tệ (B03)** theo năm; LCTT theo tháng cũng tính lại theo cách mới. Tiền đầu kỳ + lưu chuyển thuần = Tiền cuối kỳ.

## v4.39.1 – 04/11/2026
- Sửa **dự báo giao dịch nội bộ ra số âm** (vd Telemor Fintech −504.238 … −8.533.619): giao dịch nội bộ không bao giờ âm (chặn tại 0) và không giảm quá 50% / năm so với năm trước.
- Khi chỉ có < 4 năm dữ liệu (vd chọn "Dùng dữ liệu từ năm 2026" → chỉ 2025–2026), **không ngoại suy xu hướng** nữa: mọi dòng (KQKD, CĐKT, giao dịch nội bộ) giữ mức năm gần nhất và chỉ thay đổi theo % kịch bản, chi phí cố định, kế hoạch đầu tư; trang hiện cảnh báo. Trước đây hồi quy trên 2 điểm kéo số liệu đi rất xa.

## v4.39.0 – 04/11/2026
- Dự báo tài chính: **Kế hoạch đầu tư** – nhập từng khoản đầu tư (năm, nội dung, vốn, số năm khấu hao, % vay, lãi suất, chi phí vận hành %/năm, doanh thu tăng thêm/năm – để 0 nếu không tăng doanh thu):
  - KQKD: khấu hao đều + chi phí vận hành vào giá vốn, lãi vay vào chi phí tài chính, doanh thu tăng thêm (nếu có); có dòng "↳ trong đó …" để thấy riêng ảnh hưởng.
  - CĐKT: TSCĐ = lũy kế đầu tư − khấu hao; dư nợ vay vào nợ phải trả (trả đều); phần tự có trả bằng tiền.
- Sửa logic làm lợi nhuận / tài sản tăng ảo:
  - **Chi phí không tự giảm khi doanh thu tăng** (mặc định bật): mô hình xu hướng không còn kéo chi phí bán hàng, quản lý, giá vốn giảm dần trong khi doanh thu tăng.
  - TSCĐ hiện có giữ giá trị cuối kỳ (không ngoại suy tăng mãi); tài sản tăng chỉ khi có kế hoạch đầu tư.
  - **Chia lợi nhuận % LNST** (nộp về công ty mẹ) – trước đây toàn bộ LNST tích luỹ vào tiền làm tổng tài sản phình to.
  - Thêm dòng biên lợi nhuận gộp và biên LNST / doanh thu thuần; cảnh báo khi chỉ dùng < 4 năm dữ liệu.

## v4.38.1 – 04/11/2026
- Sửa **dự báo Cân đối kế toán ra số âm** (đầu tư tài chính, XDCB dở dang… bị ngoại suy xu hướng xuống dưới 0). Phương pháp mới (mặc định, theo cách lập kế hoạch):
  - Vốn lưu động – phải thu, tồn kho, TS ngắn hạn khác, nợ phải trả = **tỷ lệ % trên doanh thu thuần** bình quân 3 năm gần nhất × doanh thu dự báo.
  - Đầu tư tài chính ngắn / dài hạn, XDCB dở dang, TS dài hạn khác: **giữ số dư cuối kỳ gần nhất** (quyết định đầu tư, không ngoại suy).
  - TSCĐ: mô hình chuỗi thời gian. Mọi khoản chưa từng âm trong lịch sử **không được dự báo âm**.
  - Cột cuối ghi rõ cách tính từng khoản; Tiền (khoản cân đối) âm được cảnh báo "thiếu tiền – cần vay / góp vốn".
  - Vẫn chọn được cách cũ "Theo mô hình chuỗi thời gian từng khoản" (đã chặn âm).
- KQKD: các dòng chưa từng âm (doanh thu, giá vốn, chi phí tài chính, bán hàng, quản lý…) không còn bị dự báo âm.

## v4.38.0 – 04/11/2026
- Dự báo KQKD: **chi phí cố định định kỳ** (thuê trạm BTS / phòng máy / cột, thuê văn phòng – nhà nghỉ – cửa hàng – kho – đất, điện trạm & điện văn phòng, xăng dầu máy phát, xăng dầu xe, thuê xe, khấu hao phương tiện) được **tách riêng**: dự báo = chi phí của **tháng gốc × 12 × (1 + % tăng thêm)**, không lấy bình quân / xu hướng như các chi phí khác.
  - Tháng gốc: tháng 12 gần nhất (mặc định) / tháng gần nhất có dữ liệu / bình quân 3 tháng gần nhất; % tăng thêm mỗi năm; chọn nhóm chi phí tính là cố định (theo danh mục nhóm của báo cáo chi phí theo vị trí / xe).
  - Tách theo dòng B02 (giá vốn 62x/632, bán hàng 641, quản lý 642); bảng hiện dòng "↳ trong đó cố định định kỳ". Phần chi phí còn lại vẫn dự báo bằng mô hình đã chọn.
  - Dự báo theo tháng: phần cố định chia đều 12 tháng, chỉ phần còn lại theo mùa vụ.
- Sửa: biểu đồ dự báo có lúc trắng – nay vẽ sau khi khung hiển thị xong và tự vẽ lại; nếu lỗi sẽ báo rõ thay vì để trống.

## v4.37.0 – 04/11/2026
- Dự báo tài chính: tab mới **Giao dịch nội bộ** – dự báo giao dịch với từng đơn vị nội bộ cho các năm tới (cùng số năm, mô hình, "dùng dữ liệu từ năm" như trang dự báo).
  - Chỉ tiêu giống báo cáo nội bộ theo năm: mua ghi 627 / 641 / 642 / chi phí khác, mua hàng hoá vật tư, mua tài sản – XDCB – trả trước, tổng mua, bán (doanh thu), giảm trừ, bán thuần; mỗi chỉ tiêu × mỗi công ty dự báo riêng, tổng tính lại.
  - Lọc theo công ty, Nhóm 1 (mẹ & con) / Nhóm 2 (cùng tập đoàn), tách nhóm có dòng cộng; tuỳ chọn bỏ trích trước 335 / 1317, gồm bên liên quan.
  - Kịch bản % điều chỉnh mua / bán nội bộ; biểu đồ mua – bán nội bộ thực tế và dự báo; bảng tổng hợp theo chỉ tiêu; xuất Excel (dự báo từng công ty × chỉ tiêu × năm, chi tiết, tổng hợp).
  - Năm dở dang quy đổi cả năm theo số tháng có dữ liệu.

## v4.36.0 – 04/11/2026
- Dự báo theo tháng: thêm **Cân đối kế toán** và **Lưu chuyển tiền tệ** theo tháng (tab con trong "Theo tháng năm …").
  - B01: đi từ số dư thực tế tháng gần nhất tới số dư dự báo cuối năm, gồm cả các tháng còn lại của năm nay (đánh dấu "ước"); vốn chủ cộng dồn LNST từng tháng; Tiền là khoản cân đối → Tổng tài sản = Tổng nguồn vốn từng tháng.
  - LCTT (gián tiếp): LNST ± biến động phải thu, tồn kho, TS ngắn hạn khác, nợ phải trả (HĐKD); tài sản dài hạn, đầu tư (HĐĐT); vốn chủ ngoài LNST (HĐTC). Tiền đầu tháng + lưu chuyển thuần = Tiền cuối tháng.
  - Xuất Excel theo tháng gồm 3 sheet KQKD / CĐKT / LCTT.
- Dự báo năm: vốn chủ năm đầu nay cộng thêm LNST ước của các tháng còn lại năm dở dang (B01 năm và tháng khớp nhau).

## v4.35.0 – 04/11/2026
- Dự báo tài chính: tab mới **Theo tháng năm …** – dự báo B02 cho 12 tháng của năm dự báo đầu tiên, 3 cách chia:
  - **Dự báo năm × tỷ trọng mùa vụ** (mặc định): tỷ trọng từng tháng lấy bình quân 3 năm đủ 12 tháng gần nhất → tổng 12 tháng khớp đúng dự báo năm.
  - **Holt-Winters** trên chuỗi tháng (xu hướng + mùa vụ 12 tháng, cần ≥ 24 tháng dữ liệu).
  - **Bình quân 2 cách**.
- Dòng tổng (lợi nhuận gộp, HĐKD, trước / sau thuế) tính lại theo công thức B02 từng tháng; biểu đồ 24 tháng thực tế + 12 tháng dự báo; bảng tỷ trọng mùa vụ; xuất Excel theo tháng.

## v4.34.0 – 04/11/2026
**Mô-đun mới: Dự báo tài chính** (menu Phân tích → Dự báo tài chính)
- Lịch sử lấy từ chính B02 / B01 của phần mềm theo từng năm (gồm điều chỉnh); năm dở dang quy đổi cả năm (có thể bỏ).
- 7 mô hình: hồi quy tuyến tính, Holt (san bằng mũ kép), CAGR, tăng trưởng bình quân 3 năm, hồi quy mũ, bình quân trượt 3 năm, naive + drift; **Tự động** = bình quân gia quyền theo độ chính xác kiểm định lại (backtest 3 năm gần nhất, MAPE).
- B02: dự báo từng dòng gốc (doanh thu, giảm trừ, giá vốn, DT/CP tài chính, bán hàng, quản lý, khác), dòng tổng tính lại đúng công thức; thuế TNDN theo thuế suất thực tế bình quân. Tuỳ chọn chi phí theo % doanh thu.
- B01: khoản mục cấp I dự báo theo mô hình; vốn chủ = năm trước + LNST dự báo; Tiền là khoản cân đối (Tổng tài sản = Tổng nguồn vốn).
- Kịch bản Thận trọng / Cơ sở / Lạc quan hoặc tự nhập % điều chỉnh doanh thu, chi phí; 1–10 năm; biểu đồ thực tế + dự báo + các mô hình; bảng so sánh mô hình; xuất Excel 3 sheet.

## v4.33.2 – 04/11/2026
- Sửa: cùng một mã vị trí / biển số / phòng ban hiện thành **2 dòng** (vd "211026_Guest House Suai Cov_Ain Branch") – do dữ liệu gốc có khoảng trắng thừa / ký tự trắng ẩn (dấu cách đầu-cuối, NBSP, tab, xuống dòng, 2 dấu cách). Nay mọi mã được chuẩn hoá khoảng trắng trước khi gộp, nên mã giống nhau gộp về một dòng; danh sách chọn cũng không còn mã trùng.

## v4.33.1 – 04/11/2026
- Sửa: **tiêu đề cột bảng biến mất khi cuộn xuống** (mọi bảng trong ứng dụng – do tính năng kéo rộng / ẩn cột ghi đè kiểu "dính" của tiêu đề). Nay tiêu đề luôn đứng yên ở đầu bảng khi cuộn.
- Chi phí theo vị trí / xe / phòng ban: ô **Khoản mục / nhóm chi phí** có ô 🔍 riêng; ô 🔍 của cả khoản mục và mã vị trí / biển số / phòng ban **tự lọc sau khi ngừng gõ ~0,8 giây** (không cần Enter).

## v4.33.0 – 04/11/2026
- **Chế độ tối**: nút 🌙 / ☀️ trên thanh trên cùng (ghi nhớ).
- **Thu gọn menu**: nút ‹ cạnh logo → menu chỉ còn biểu tượng (rê chuột xem tên), bảng rộng thêm ~190px.
- **Chế độ tập trung** (nút ⛶ hoặc Ctrl+Shift+F): ẩn menu và thanh trên, chỉ còn nội dung; nút "Thoát chế độ tập trung" ở góc dưới phải.
- **Nút ẩn / hiện** cho khối phụ: thẻ số liệu (KPI), banner trang Tổng quan, đoạn mô tả dài – ghi nhớ theo từng trang.
- **Hộp thoại mới** trong ứng dụng thay cho hộp thoại của Windows (xác nhận / thông báo): Enter = Đồng ý, Esc = Huỷ; không còn mất con trỏ gõ sau hộp thoại.

## v4.32.0 – 04/11/2026
**Làm mới giao diện (gọn, dễ đọc, dễ thao tác) – không đổi chức năng**
- Ô nhập / ô chọn thống nhất: bo góc, cao đều, viền rõ khi rê chuột, vòng sáng cam khi đang gõ; ô chọn có mũi tên mảnh; ô 🔍 có biểu tượng kính lúp.
- Bảng: tiêu đề cột in hoa nhỏ, dòng xen kẽ màu nhạt, tô cam nhạt khi rê chuột, số căn đều.
- Thẻ số liệu (KPI) bo tròn, nổi nhẹ khi rê chuột; nút có phản hồi khi bấm.
- Hiệu ứng chuyển trang và mở cửa sổ chi tiết mượt (tự tắt nếu Windows bật "giảm hiệu ứng").
- Thanh cuộn mảnh, menu bên mềm hơn. Toàn bộ dùng CSS / SVG nội bộ – không tải tài nguyên ngoài mạng, chạy offline.

## v4.31.8 – 04/11/2026
- Sửa **Chi phí theo vị trí**: sau khi chuyển chi phí sang mã vị trí mới, dòng mã cũ / dòng "(không có vị trí)" còn hiện với tổng 0 và cả kỳ bị báo **thiếu** (do chỉ còn chi phí của 12 tháng trước kỳ). Nay chỉ báo tháng thiếu cho mã vị trí có thật **và có chi phí trong kỳ đang xem**; dòng không còn chi phí trong kỳ bị ẩn.
- Chi phí theo xe / phòng ban: không có cảnh báo tháng thiếu nên không bị lỗi này (đã kiểm tra).

## v4.31.7 – 04/11/2026
- Sửa: sau hộp thoại xác nhận / thông báo (vd "Đổi mã vị trí của N bút toán?"), không bấm vào ô gõ được – phải chuyển sang ứng dụng khác rồi quay lại mới hiện con trỏ (lỗi Electron trên Windows). Nay cửa sổ tự lấy lại focus bàn phím ngay sau mỗi hộp thoại.

## v4.31.6 – 04/11/2026
**Sửa đơ khi gõ vào ô tìm kiếm**
- Nguyên nhân: mỗi phím gõ vẽ lại ngay toàn bộ bảng (tới 3.000 dòng, ~3 giây / lần) nên phím gõ bị dồn lại.
- Mọi ô tìm (lỗi nhập liệu, tuổi nợ, tồn kho, chi phí theo vị trí / xe / phòng ban, khoản mục, danh mục, ô 🔍 trong danh sách chọn) nay **chờ ngừng gõ ~0,25 giây** rồi mới lọc.
- Cửa sổ chi tiết vị trí / xe / phòng ban hiện 400 dòng đầu, có nút **Hiện thêm**; "chọn tất cả" và "Đổi …" vẫn áp dụng cho toàn bộ dòng đang lọc. Đo trên dữ liệu thử: gõ 3 ký tự từ 8,7 giây xuống dưới 0,1 giây.

## v4.31.5 – 04/11/2026
- Danh mục khoản mục chi phí: bảng **"chưa có trong danh mục"** cũng lọc theo ô 🔍 tìm (mã, tên; không phân biệt hoa thường / dấu), tiêu đề hiện số dòng khớp / tổng.

## v4.31.4 – 04/11/2026
- **Danh mục khoản mục chi phí**: ô 🔍 tìm nhanh – gõ liên tục không bị mất con trỏ (trước đây mỗi lần lọc lại phải bấm lại vào ô); tìm thêm theo **nhóm chi phí** ngoài mã, tên, mô tả, tiếng Việt, KD1.

## v4.31.3 – 04/11/2026
- **Danh mục phòng ban** (tab Phòng ban và tab Ánh xạ): thêm ô 🔍 tìm nhanh dòng – gõ vài ký tự (mã, tên, tên phòng ban trong dữ liệu gốc, phòng ban đã gắn; không phân biệt hoa thường / dấu) → chỉ hiện dòng khớp. Tích "chọn tất cả" ở tab Ánh xạ chỉ chọn các dòng đang hiện. Ô chọn phòng ban danh mục vẫn có ô tìm riêng.

## v4.31.2 – 04/11/2026
- **Điều chỉnh dữ liệu**: ô giá trị mới (hợp đồng, mã vị trí, biển số, phòng ban) đổi thành danh sách chọn có ô 🔍 tìm nhanh, kèm **(Xoá trống)** và tuỳ chọn **Nhập thủ công** cho giá trị chưa có.

## v4.31.1 – 04/11/2026
- Ô **chọn hợp đồng** (sổ chi tiết công nợ / tuổi nợ theo hợp đồng) luôn có ô 🔍 tìm nhanh, kể cả khi danh sách ít mục.
- Sửa: danh sách nạp sau (bất đồng bộ) trước đây không hiện ô tìm – nay tự gắn khi danh sách được điền.

## v4.31.0 – 03/11/2026
- **Tìm nhanh trong danh sách chọn dài** (mã vị trí, biển số, hợp đồng, phòng ban, đối tượng…): mọi danh sách từ 25 mục trở lên có thêm ô 🔍 bên cạnh. Gõ vài ký tự (không phân biệt hoa thường / dấu) → danh sách chỉ còn mục chứa ký tự đó và tự chọn mục đầu tiên; **Enter** để chốt, **Esc** để xoá tìm.

## v4.30.1 – 03/11/2026
- Sửa: cửa sổ chi tiết vị trí / xe / phòng ban – nút **Đổi …** bị mờ khi chưa tích dòng. Nay nếu không tích dòng nào thì áp dụng cho **toàn bộ dòng đang lọc** (có hỏi xác nhận số dòng).

## v4.30.0 – 03/11/2026
**Chi phí theo vị trí / xe / phòng ban: sắp theo khoản mục, lọc, nhấn đúp Tổng**
- Vị trí và xe: bảng sắp theo **Khoản mục chi phí → Mã vị trí / Biển số xe**, có dòng **Cộng <khoản mục>** và **TỔNG CỘNG**.
- Lọc theo khoản mục chi phí và theo mã vị trí / biển số / phòng ban (danh sách chọn).
- Nhấn đúp ô **Tổng** (của dòng, dòng cộng khoản mục hoặc tổng cộng) mở toàn bộ bút toán chi tiết cả kỳ để điều chỉnh mã vị trí / biển số / phòng ban.

## v4.29.2 – 03/11/2026
**Chi phí theo phòng ban dùng cột Department Sub (phòng ban ngân sách)**
- Báo cáo **Chi phí theo phòng ban** đọc cột **Department Sub**, không dùng Department nữa. Trường "Phòng ban" ở Điều chỉnh dữ liệu cũng ghi vào Department Sub.
- Cửa sổ bút toán có thêm cột **Department (hạch toán)** để đối chiếu. Dòng nào Department khác Department Sub được tô đỏ.
- Ánh xạ phòng ban: liệt kê tên ở cả Department Sub và Department. Department Sub có nhiều tên kiểu cũ (VTL_Tech center …, VTL_Business center …, VTL_VAS & Content Dept. …) cần gắn vào phòng ban danh mục.

## v4.29.1 – 03/11/2026
**Mã vị trí / biển số xe cho dữ liệu đã nạp – không cần nạp lại từ đầu**
- Nguyên nhân trống mã vị trí: dữ liệu được nạp trước khi ứng dụng đọc cột **Location**. File ERP vẫn có Location (vd DI0147).
- Biển số xe: nhận đúng cột **"License plate"** (không phân biệt hoa thường) và cả cột viết sai **"Lisence plate"**; lấy cột đầu tiên có dữ liệu.
- Chức năng **Quản lý dữ liệu → Bổ sung thông tin cho dữ liệu đã nạp** nay điền thêm **mã vị trí** và **biển số xe**, ngoài mã hàng, kho, kỳ phân bổ, tỷ giá. Chọn lại các file đã nạp; ứng dụng chỉ điền vào cột đang trống, không xoá hay thay dữ liệu, giữ nguyên các điều chỉnh đã làm.

## v4.29.0 – 03/11/2026
**Mới: Chi phí theo xe (biển số) và Chi phí theo phòng ban, điều chỉnh tại bút toán gốc**
- **Phân tích → Chi phí theo xe:** ma trận **biển số xe (License Plate) × nhóm chi phí × tháng**.
  - Nhóm chi phí: Xăng dầu xe; Sửa chữa xe (phụ tùng, dịch vụ); Thay dầu, nước làm mát xe; Thuê xe; Khấu hao phương tiện.
  - **Định mức / xe / tháng** cho từng nhóm, nhập và lưu trên trang. Ô **đỏ** là tháng vượt định mức, ô **cam** là tháng cao hơn 1,8 lần bình quân của chính xe đó.
  - Cột **"So với đội xe"** = tổng kỳ của xe / trung vị các xe cùng nhóm; từ 1,5 lần trở lên được đánh dấu.
  - Lọc "Chỉ xe vượt định mức / bất thường".
- **Phân tích → Chi phí theo phòng ban:** mọi chi phí TK 6xx/8xx theo **phòng ban hạch toán × nhóm chi phí (Expense Group) × tháng**.
  - Có cột **Phòng ban danh mục** theo ánh xạ; tên chưa ánh xạ được báo đỏ.
  - Cột "So với các phòng"; lọc theo một nhóm chi phí.
- **Nhấn đúp một ô** để xem bút toán gốc, rồi đổi **biển số xe / phòng ban** cho đúng. Chọn từ danh sách giá trị đang dùng (phòng ban kèm tên danh mục) hoặc nhập thủ công; có nút "Trả về giá trị gốc". Dữ liệu gốc không bị sửa; điều chỉnh xem ở Kiểm soát → Điều chỉnh dữ liệu, ở đó cũng có trường **Phòng ban** mới.
- **Chi phí theo vị trí** dùng chung bộ máy mới, chức năng giữ nguyên.
- Xuất Excel cho cả 3 báo cáo.

## v4.28.0 – 03/11/2026
**Mới: Báo cáo quản trị chi phí theo vị trí**
- Thêm trang **Phân tích → Chi phí theo vị trí**: ma trận **mã vị trí (Location) × nhóm chi phí × từng tháng**, chọn được kỳ từ tháng đến tháng.
- 7 nhóm, gom theo mã khoản mục:
  - Thuê trạm BTS / phòng máy / cột.
  - Thuê văn phòng.
  - Thuê nhà nghỉ.
  - Thuê cửa hàng / kho / đất.
  - Điện trạm BTS / phòng máy.
  - Xăng dầu chạy trạm / máy phát.
  - Điện văn phòng / nhà nghỉ / kho / cửa hàng.
- **Phát hiện tháng thiếu chi phí:** ô **đỏ "thiếu"** là tháng bằng 0 trong khi vị trí đã phát sinh chi phí từ trước (xét cả 12 tháng trước kỳ, chỉ với nhóm phát sinh từ 2 tháng trở lên). Ô **cam** là tháng cao bất thường, trên 1,8 lần bình quân (nghi ghi trùng hoặc ghi bù). Có cột "Số tháng thiếu", lọc "Chỉ dòng có tháng thiếu" và tìm mã vị trí.
- Các thẻ tổng hợp: tổng chi phí, số mã vị trí, số dòng có tháng thiếu, chi phí **không có mã vị trí**.
- **Nhấn đúp một ô** để xem bút toán gốc của vị trí × nhóm × tháng; nhấn đúp tên vị trí để xem cả kỳ.
  - Tích chọn bút toán, chọn mã vị trí đúng từ danh sách (hoặc tích "Nhập thủ công"), rồi bấm **Đổi mã vị trí**. Có nút "Trả về mã gốc".
  - Dữ liệu gốc không bị sửa; điều chỉnh xem lại ở Kiểm soát → Điều chỉnh dữ liệu. Ma trận cập nhật ngay.
- Xuất Excel kèm danh sách tháng thiếu.

## v4.27.1 – 03/11/2026
**KQKD theo mẫu: EBT / LNST bằng đúng báo cáo tài chính**
- Cộng theo **khoản mục doanh thu / chi phí**. Tài khoản chỉ dùng để xác định vế doanh thu (loại 5, 7) và vế chi phí (loại 6, 8) của bút toán; không gồm kết chuyển 911.
- Khoản mục **Profit Tax** (và Minimum tax), cùng TK 8211, vào dòng **Thuế TNDN (hiện hành)**. TK 8212 vào dòng **Thuế TNDN (hoãn lại)**. Các khoản này không cộng vào Tổng chi phí.
- Phần chưa ánh xạ được tự đưa vào dòng mặc định, nên tổng luôn khớp sổ:
  - Doanh thu: theo TK + tên loại doanh thu.
  - Chi phí không có khoản mục: 632 → giá vốn hàng hoá khác, 635 → phí tài chính khác, 811 → chi trả khác, còn lại → chi phí bằng tiền khác.
- Thêm dòng kiểm tra **"Khớp báo cáo tài chính (B02-DN)"**: so EBT (100% CLTG) với LN trước thuế B02 mã 50, và LNST với B02 mã 60.
- Dữ liệu test: năm 2025, tháng 10/2026 và cả giai đoạn 2016–2026 đều khớp B02 ✓.

## v4.27.0 – 03/11/2026
**KQKD theo mẫu: đủ phần doanh thu; mọi bảng chỉnh độ rộng / ẩn cột được**
- **KQKD theo mẫu – doanh thu:**
  - Bỏ mặc định "Ẩn dòng bằng 0": phần tóm tắt luôn hiện đủ cấu trúc mẫu, cả các dòng doanh thu. Tuỳ chọn mới "Ẩn dòng chi tiết bằng 0" chỉ ẩn dòng lá của phần chi tiết.
  - Thêm **tự phân loại doanh thu** khi chưa ánh xạ tay, theo TK, tên TK và tên loại doanh thu:
    - TK 515: chênh lệch tỷ giá chưa / đã thực hiện, lãi tiền gửi, cổ tức, lãi trả chậm, lãi vay cổ đông, chiết khấu, tài chính khác.
    - TK 413: chênh lệch tỷ giá đã thực hiện.
    - TK 711: khuyến mại, doanh thu khác.
    - TK 521: điều chỉnh doanh thu.
    - TK 511: thoại, SMS, data, VAS, thẻ cào, sim/kit, máy, trả sau, kết nối, roaming, quốc tế chiều về, IPLC, cố định, lắp đặt, CNTT, TMĐT, thiết bị, công ích, quảng cáo, xổ số; không khớp mẫu nào thì vào "Các loại doanh thu khác".
  - Ánh xạ tay luôn được ưu tiên. Có ô tích bật / tắt tự phân loại. Cột "Ánh xạ" ghi "tự động · n loại DT"; rê chuột vào để xem danh sách.
  - Dữ liệu test năm 2025: doanh thu vào mẫu đủ 370.259,76 ✓.
- **Mọi bảng:**
  - **Kéo mép phải tiêu đề cột** để đổi độ rộng.
  - **Chuột phải tiêu đề**: "Ẩn cột này", "Hiện lại cột …", "Hiện tất cả cột & đặt lại độ rộng".
  - Ứng dụng nhớ cài đặt theo từng loại bảng, tự áp lại khi mở lại. Bảng có cột ẩn hiện nhãn "⋯n ẩn".

## v4.26.0 – 03/11/2026
**Mới: Báo cáo kết quả kinh doanh theo mẫu của đơn vị (MAU_BAO_CAO_KQKD)**
- Thêm tab **Báo cáo tài chính → KQKD theo mẫu**, lập đúng cấu trúc file mẫu:
  - Phần tóm tắt: 84 chỉ tiêu, từ Tổng doanh thu, EBT, thuế TNDN, LNST, lợi nhuận chuyển về nước đến EBITDA, EBITDA Margin.
  - Phần chi tiết: khoảng 430 khoản mục (doanh thu, khấu hao, CLTG, lãi vay, Opex…).
- Mẫu có 359 dòng lá (lấy số từ dữ liệu), 156 dòng tính bằng **chính công thức của mẫu** và 5 tham số. Đã kiểm tra: đưa số tháng 1/2025 của file mẫu vào thì cả 156 dòng tính ra đúng số trong file.
- **Kỳ báo cáo:** tháng, quý, năm, luỹ kế, khoảng tháng. **So sánh cùng kỳ năm trước** (hoặc kỳ liền trước): kỳ này, cùng kỳ, chênh lệch, %. Có tuỳ chọn hiện từng tháng trong kỳ, ẩn dòng bằng 0, xem riêng phần tóm tắt hoặc chi tiết.
- **Cách lấy số lá:**
  - Chi phí = Nợ − Có TK 6xx/8xx theo khoản mục (Type of cost).
  - Doanh thu = Có − Nợ TK 5xx/7xx theo loại doanh thu (Type of revenue).
  - Hoặc theo tiền tố TK (vd 515:cr, 635:dr).
  - Không gồm bút toán kết chuyển 911.
- **Ánh xạ chỉ tiêu:** lần đầu tự ánh xạ theo tên tiếng Anh trùng danh mục khoản mục chi phí (263 dòng). Sửa được từng dòng trong cửa sổ "Ánh xạ chỉ tiêu"; một chỉ tiêu có thể gồm nhiều mã.
- **Đối chiếu với sổ:** so tổng doanh thu / chi phí trên sổ với phần đã vào mẫu. Có danh sách khoản mục / loại doanh thu **chưa vào mẫu**, gán nhanh vào chỉ tiêu ngay trong danh sách.
- **Tham số** (thuế suất TNDN, tỷ lệ miễn, tỷ lệ sở hữu VTG, thuế chuyển LN…) sửa được. Nạp được **mẫu khác** cùng cấu trúc.
- Nhấn đúp dòng lá để xem bút toán (lọc đúng khoản mục / loại doanh thu). Xuất Excel theo mẫu.

## v4.25.0 – 03/11/2026
**Mới: Danh mục phòng ban & khoản mục chi phí**
- Thêm trang **Kiểm soát → Danh mục phòng ban & chi phí**, gồm 3 tab:
  - **Phòng ban:** nạp sẵn 24 phòng ban từ DANH_MUC_PHONG_BAN.xls. Thêm, sửa (cả mã), xoá; nạp file (thêm / cập nhật, hoặc thay toàn bộ); xuất Excel. Mỗi phòng ban hiện các tên phòng ban dữ liệu gốc đã gắn và số dòng hạch toán.
  - **Ánh xạ phòng ban dữ liệu gốc:** liệt kê mọi tên phòng ban trong dữ liệu hạch toán (số dòng, từ ngày – đến ngày) để chọn phòng ban danh mục. **Một phòng ban danh mục gắn được nhiều tên gốc.** Có các cách gắn: từng dòng (lưu ngay), nhiều dòng cùng lúc, hoặc "Tự ánh xạ theo tên trùng". Dòng chưa gắn được tô vàng.
  - **Khoản mục chi phí:** nạp sẵn 358 khoản mục từ DANH_MUC_TYPE_OF_COST.xls, đủ các cột Code, Name, Description, Summary Level, Active, Has Location, Has Product, Expense Group, Tiếng Việt, Khoản mục KD1. Tìm, lọc theo nhóm chi phí, thêm / sửa / xoá, nạp / xuất Excel, xem số dòng đang hạch toán. Có danh sách khoản mục **đang hạch toán nhưng chưa có trong danh mục**, kèm nút "Thêm vào danh mục".
- Khớp khoản mục với dữ liệu theo mã trước dấu "_" (vd "E17.1.1.1.4_Dep…" → E17.1.1.1.4).
- Lần đầu mở, ứng dụng tự ánh xạ phòng ban theo tên trùng: 23/24 tên được gắn. "VTL_NOC Dept." chưa có trong danh mục, cần gắn tay.

## v4.24.3 – 03/11/2026
**Đổi hợp đồng: chọn từ danh sách hợp đồng của đối tượng**
- Trong sổ chi tiết công nợ, ô "Đổi hợp đồng" là **danh sách mọi hợp đồng của đối tượng** đó: lấy trên mọi tài khoản, cả phía Nợ và Có, gồm cả hợp đồng đã điều chỉnh. Mỗi hợp đồng ghi số dòng và ngày phát sinh gần nhất, sắp theo hợp đồng mới nhất. Có mục "(Xoá trống hợp đồng)".
- Tích **"Nhập thủ công"** khi cần nhập hợp đồng mới chưa có trong danh sách.
- Mục đích: tránh gõ sai tên hợp đồng (vd "46/2026/VTL/VMC/…" và "46/2026/VTL-VMC/…" là 2 hợp đồng khác nhau) làm phân tích sai.

## v4.24.2 – 03/11/2026
**Tuổi nợ theo hợp đồng: phần tổng hợp phải bằng đúng số dư đối tượng**
- **Lỗi cũ:** khi "Phân tích theo" là Đối tượng × Hợp đồng / Đề nghị TU / Khoản mục, FIFO được tính riêng cho từng hợp đồng. Các hợp đồng dư theo chiều bị cộng thành "Tổng phải trả", còn các hợp đồng dư ngược tách riêng. Ví dụ VTG TK 33121: tổng 26,1 triệu, dư ngược −25,6 triệu, trong khi số dư thật chỉ 454.084,06.
- **Sửa:** các thẻ KPI, bảng tổng hợp theo TK, biểu đồ và bảng **Tuổi nợ theo từng đối tượng** luôn tính FIFO ở **cấp đối tượng**, bù trừ giữa các hợp đồng, nên bằng đúng số dư trên Trial Balance.
- Bảng **Chi tiết đối tượng × hợp đồng** và **Dư ngược chiều** vẫn hiện theo từng hợp đồng, để thấy hợp đồng nào thanh toán / hoá đơn ghi lệch và đổi hợp đồng cho đúng.
- Cửa sổ đối tượng, tab "Theo hợp đồng": các ô tổng lấy số dư cấp đối tượng; có ghi chú tổng dư theo chiều / dư ngược chiều theo hợp đồng.

## v4.24.1 – 03/11/2026
**Bút toán tự triệt tiêu: xét cả TK chi tiết khác nhau trong cùng nhóm**
- Xem theo **TK tổng hợp**: bút toán Nợ – Có thuộc cùng nhóm TK (vd 33111/33112, 15611/15614, 11212/11221) được coi là tự triệt tiêu nếu cùng đối tượng, và bị loại khỏi FIFO tuổi nợ / tuổi tồn kho. Xem theo **TK chi tiết**: vẫn tính, vì đây là chuyển thật giữa hai TK chi tiết.
- Nhóm TK theo danh mục phân tích; các nhóm 4 số (1412, 1388, 3388) được tách riêng. Vd Nợ 1412 / Có 1411 là chuyển tạm ứng tiền sang tạm ứng vật tư, vẫn được giữ.
- Tồn kho loại theo cách xem: theo mặt hàng → loại mọi bút toán cùng nhóm TK (mỗi dòng chỉ có một mặt hàng); theo kho → loại khi cùng kho; theo đối tượng → loại khi cùng đối tượng.
- Phải thu 138812 và trích trước 335: loại bút toán Nợ – Có trong cùng TK đang phân tích, cùng đối tượng.
- Đã kiểm tra: tổng số dư tồn kho và tuổi nợ ở mọi cách xem vẫn bằng sổ cái.

## v4.24.0 – 03/11/2026
**Loại bút toán Nợ – Có cùng tài khoản, cùng đối tượng khỏi các phân tích**
- Bút toán ghi Nợ và Có cùng một tài khoản cho cùng một đối tượng (vd chuyển giữa các tài khoản ngân hàng cùng mã 112) không làm thay đổi số dư. Nhưng nếu tính vào, chúng làm sai:
  - FIFO tuổi nợ và tuổi tồn kho (tuổi bị "trẻ" lại).
  - Ghép thu tiền – doanh thu của phải thu 138812.
  - Nhận diện trích / huỷ trích 335.
  - Giao dịch nội bộ, chi phí định kỳ, biến động, Benford, nhà cung cấp, tỷ giá.
- Đã loại các bút toán này khỏi những phân tích trên. Với tồn kho, chỉ loại khi cùng TK, cùng đối tượng và cùng kho; chuyển kho thì vẫn giữ.
- **Vẫn giữ** bút toán cùng tài khoản nhưng **khác đối tượng** (vd chuyển tạm ứng 141 từ nhân viên A sang B, chuyển công nợ 331 giữa nhà cung cấp), vì đây là chuyển số dư thật giữa các đối tượng.
- Bảng cân đối số phát sinh, CĐPS theo đối tượng và báo cáo tài chính vẫn ghi đủ phát sinh, để khớp với ERP. Số dư ở mọi báo cáo không đổi.

## v4.23.0 – 03/11/2026
**Tuổi nợ theo hợp đồng của từng đối tượng, khớp CĐPS; đổi hợp đồng ngay trong sổ chi tiết; mọi cửa sổ mở toàn màn hình**
- **Cửa sổ đối tượng (nhấn đúp ở "Tuổi nợ theo từng đối tượng"):**
  - Thêm tab **Theo tài khoản / Theo hợp đồng**. Tab hợp đồng liệt kê toàn bộ hợp đồng của đối tượng, có các nhóm tuổi nợ, dòng cộng và ô tìm.
  - Có dòng **đối chiếu tự động với CĐPS theo đối tượng** (dữ liệu gốc): ✓ khớp, hoặc ⚠ kèm số chênh lệch.
- **Số dư tuổi nợ và tuổi hàng tồn kho** tính trên toàn bộ dữ liệu đến ngày báo cáo, không còn phụ thuộc vào các tháng chọn "đưa vào phân tích", nên luôn bằng số dư sổ cái / CĐPS.
- **Sổ chi tiết bút toán (mọi nơi mở bằng nhấn đúp):**
  - Bộ lọc: tìm kiếm, Nợ/Có, TK đối ứng, tháng, hợp đồng / khoản mục / mặt hàng, chỉ dòng có lỗi, khoảng số tiền.
  - Sắp xếp bằng cách nhấn tiêu đề cột.
  - Riêng sổ công nợ: tích chọn bút toán rồi bấm **Đổi hợp đồng** ngay tại đây. Dữ liệu gốc không bị sửa; điều chỉnh lưu ở Kiểm soát → Điều chỉnh dữ liệu.
- **Mọi cửa sổ chi tiết** mở toàn màn hình, không còn chiếm một góc nhỏ.

## v4.22.1 – 03/11/2026
**Điều chỉnh dữ liệu: mã vị trí lấy từ cột Location**
- Mã vị trí đọc và điều chỉnh theo cột **Location** của ERP, không còn dùng BTS Site.
- Biển số xe lấy từ cột **License Plate**.

## v4.22.0 – 03/11/2026
**Mới: Điều chỉnh dữ liệu quản trị (Hợp đồng, Mã vị trí, Biển số xe, Loại dòng tiền)**
- Thêm trang **Kiểm soát → Điều chỉnh dữ liệu**.
  - Tìm bút toán theo tháng, chứng từ, TK, đối tượng, diễn giải, giá trị của trường. Lọc được dòng đang trống, bút toán thu/chi tiền, dòng đã điều chỉnh.
  - Tích chọn dòng rồi đặt giá trị mới, có gợi ý các giá trị đang dùng và ô ghi chú. Bỏ điều chỉnh được từng trường.
  - Bảng hiện giá trị gốc (gạch ngang) và giá trị mới. Có xuất Excel.
- **Không sửa dữ liệu gốc:** giá trị mới lưu riêng ở bảng `field_adj`. Riêng dòng tiền dùng chung bảng `cf_adj`, nên sửa ở trang này thì B03 sau điều chỉnh cập nhật theo.
- Tab **Lịch sử điều chỉnh**: xem, bỏ và xuất toàn bộ điều chỉnh.
- Tuổi nợ "theo hợp đồng" dùng hợp đồng sau điều chỉnh.
- Nạp dữ liệu đọc thêm cột **biển số xe** (License Plate / TOC_LicensePlate / Vehicle / Biển số xe…). Dữ liệu đã nạp trước đây chưa có cột này; cần nạp lại file (chọn "Thay thế") thì mới hiện biển số gốc.

## v4.21.0 – 03/11/2026
**Bảng cân đối phát sinh theo đối tượng công nợ; số dư nội bộ theo dữ liệu gốc**
- **Mới – Báo cáo tài chính → "CĐPS theo đối tượng":** lấy từ dữ liệu gốc, theo đúng phía (TK ghi Nợ ↔ đối tượng Nợ, TK ghi Có ↔ đối tượng Có).
  - Cột: dư đầu kỳ Nợ/Có, phát sinh Nợ/Có, dư cuối kỳ Nợ/Có. Kỳ báo cáo dùng chung bộ chọn kỳ của báo cáo tài chính.
  - Lọc: tài khoản (TK công nợ, mọi TK có đối tượng, hoặc tự nhập), nhóm đối tượng trong danh mục, công ty nội bộ hoặc nhóm 1/2, tìm đối tượng.
  - Xem theo: đối tượng × TK, đối tượng, hoặc TK.
  - Nhấn đúp để xem bút toán của đúng đối tượng và TK đó. Có xuất Excel.
- **Sửa – Số dư giao dịch nội bộ:** không còn áp dụng các điều chỉnh "loại khỏi nội bộ / gán lại" vào số dư, để số dư khớp sổ gốc. Điều chỉnh chỉ còn áp dụng cho tổng hợp kỳ, chi tiết giao dịch và tổng hợp theo năm.
- Bảng truy nguồn số liệu báo cáo tài chính lọc được theo đối tượng (tham số `bp`).

## v4.20.1 – 03/11/2026
**Sửa lỗi Excel báo "Repaired… XML error" khi mở file xuất**
- Bản 4.19 chèn thẻ định dạng dòng (`sheetFormatPr`) sai vị trí trong sheet, nên Excel từ chối và xoá toàn bộ dữ liệu sheet. Đã bỏ thẻ này. Định dạng số, tiêu đề, màu, cố định dòng tiêu đề vẫn giữ nguyên.

## v4.20.0 – 03/11/2026
**Giao diện: tách rõ thanh chuyên đề và thanh báo cáo**
- Thanh trên **"Chuyên đề phân tích"** có nhãn nhỏ phía trên, kiểu tab gạch chân: tab đang mở có chữ cam, gạch chân cam, nền nhạt.
- Thanh dưới là các **báo cáo của chuyên đề đang mở**, hiển thị dạng nút tròn; nút đang chọn tô cam đặc, chữ trắng. Phía trước có tên chuyên đề (vd "▌Giao dịch nội bộ"). Bộ lọc nằm ở hàng riêng, cách thanh báo cáo bằng đường kẻ.
- Các chuyên đề khác (phải thu 138812, trích – huỷ trích…) dùng cùng kiểu nút cho thanh báo cáo con.
- Biểu đồ "Theo tháng" của giao dịch nội bộ hiển thị ổn định, luôn đủ chiều cao.

## v4.19.0 – 03/11/2026
**Giao dịch nội bộ chia 2 nhóm; file Excel xuất ra định dạng chuyên nghiệp**
- **Hai nhóm nội bộ:**
  - **Nhóm 1 – Công ty mẹ & công ty con** (mặc định TFU, VTC, STL, VTG; sửa được ở ô "Nhóm 1 (mẹ – con)").
  - **Nhóm 2 – Cùng tập đoàn** (các đơn vị còn lại).
  - Ô "Công ty nội bộ" chọn được cả nhóm 1 hoặc nhóm 2. Mỗi công ty có nhãn [N1] hoặc [N2].
  - Tích "Tách theo nhóm" để các bảng theo công ty (tổng hợp kỳ, số dư, theo năm) tách thành 2 phần, mỗi phần có dòng "Cộng nhóm". File Excel có thêm cột "Nhóm nội bộ".
- **Excel (mọi báo cáo):**
  - Phần đầu file: dòng tiêu đề báo cáo, dòng tên sheet và kỳ báo cáo, dòng ghi thời điểm lập.
  - Tiêu đề cột in đậm, nền cam, cố định khi cuộn; có lọc tự động.
  - Định dạng số: số tiền #,##0.00 (số âm màu đỏ, số 0 hiện "-"), số lượng và số dòng #,##0, ngày dd/mm/yyyy, tỷ lệ 0.0%.
  - Độ rộng cột tự động, kẻ viền ô, dòng Tổng/Cộng in đậm, tên sheet có dấu.
  - File mẫu số dư đầu kỳ và file danh mục đối tượng giữ dạng thô để nạp lại được. File GL Journal nhập ERP vẫn giữ đúng mẫu ERP.

## v4.18.1 – 03/11/2026
**Giao dịch nội bộ: loại TK thuế ở mọi báo cáo**
- Bút toán có vế đối tượng nội bộ là TK thuế 133 hoặc 333 (thuế GTGT, thuế nhà thầu, khấu trừ tại nguồn 33381…) bị loại khỏi Tổng hợp kỳ, Chi tiết giao dịch và Tổng hợp theo năm. Trước đây chỉ số dư nội bộ đã loại các TK này.

## v4.18.0 – 03/11/2026
**Số dư nội bộ: chỉ tính TK công nợ, có đầu kỳ – phát sinh – cuối kỳ theo khoảng ngày**
- Chỉ tính TK công nợ: 131, 136, 138, 141 (gồm 1412), 244, 1283, 1288, 331, 335, 336, 337, 338, 341, 344.
- Bỏ hẳn tiền 111/112/113, tài sản 211/213/241/242, thuế 133/333, lương 334, quỹ 353, vốn và lợi nhuận 4xx. Hệ thống chỉ gắn đối tượng cho các TK này theo bút toán gốc, nên chúng không phải số dư nội bộ.
- Chọn **Từ ngày – Đến ngày**. Số dư đầu kỳ là số dư trước "Từ ngày".
  - Bảng nhóm → TK cấp 3 → TK chi tiết: đầu kỳ, phát sinh Nợ/Có, cuối kỳ (dư Nợ, dư Có, ròng), tăng/giảm so với đầu kỳ.
  - Theo công ty: phải thu đầu kỳ/cuối kỳ, phải trả đầu kỳ/cuối kỳ, bù trừ và mức thay đổi.
  - Chọn một công ty để xem riêng các TK của công ty đó.
- Xuất Excel có đủ cột đầu kỳ và phát sinh.

## v4.17.0 – 03/11/2026
**Sắp xếp theo tiêu đề cột; lỗi mới: bút toán tay VTLMN có phát sinh tiền**
- **Sắp xếp:** nhấn tiêu đề cột của bất kỳ bảng nào để sắp xếp.
  - Lần 1 tăng dần ▲, lần 2 giảm dần ▼, lần 3 trả về thứ tự gốc.
  - Tự nhận biết số, ngày (dd/mm/yyyy, mm/yyyy) và chữ tiếng Việt. Ô trống luôn nằm cuối; dòng Tổng cộng / Cộng giữ nguyên ở cuối bảng.
  - Báo cáo có cấu trúc (B01, B02, B03, các bảng có dòng nhóm ở giữa) không bị sắp xếp, để giữ đúng mẫu biểu.
- **Quy tắc mới MANUAL_CASH (mức Cao):** chứng từ **VTLMN** (bút toán tay) ghi Nợ/Có TK tiền 111, 112, 113 thường là nhân viên điều chỉnh sai; thu/chi tiền phải đi qua phiếu thu, phiếu chi hoặc ngân hàng. Có hướng khắc phục và căn cứ kiểm toán (VSA 240). Phiên bản bộ quy tắc tăng lên 13, nên ứng dụng sẽ tự rà soát lại dữ liệu cũ.

## v4.16.0 – 03/11/2026
**Chuột phải để sao chép trên mọi bảng**
- Nhấn chuột phải vào bất kỳ ô nào của bất kỳ bảng nào (bút toán, báo cáo tài chính, công nợ, tồn kho, nội bộ…) để chọn một trong các mục:
  - Sao chép ô.
  - Sao chép dòng, hoặc dòng kèm tiêu đề.
  - Sao chép cả cột.
  - Sao chép toàn bộ bảng, có hoặc không kèm tiêu đề.
  - Sao chép vùng đang bôi đen.
- Dữ liệu ngăn cách bằng Tab nên dán thẳng vào Excel đúng cột. Số được bỏ dấu phân cách hàng nghìn, số trong ngoặc (1,234) chuyển thành −1234. Tiêu đề nhiều tầng được ghép lại, vd "Số dư đầu kỳ Nợ".

## v4.15.0 – 03/11/2026
**Báo cáo tài chính: truy nguồn số liệu, điều chỉnh dòng tiền, B03 trước / sau điều chỉnh**
- **Truy nguồn:** nhấn đúp một tài khoản (CĐSPS) hoặc một chỉ tiêu (B01, B02, B03 gián tiếp) để mở cửa sổ toàn màn hình gồm:
  - Các TK cấu thành, kèm dư đầu kỳ, phát sinh Nợ/Có, dư cuối kỳ.
  - Bút toán gốc trong kỳ, có bộ lọc: tìm kiếm, TK, TK đối ứng, Nợ/Có, tháng, đối tượng, khoản mục, người nhập, khoảng số tiền; kèm tổng Nợ, tổng Có, chênh lệch.
- **Điều chỉnh dòng tiền:** nhấn đúp một chỉ tiêu B03 (hoặc bấm "Rà soát & điều chỉnh dòng tiền") để xem từng bút toán thu/chi tiền.
  - Mỗi dòng có: dòng tiền nhân viên chọn trên ERP, gợi ý theo TK đối ứng, mã sau điều chỉnh.
  - Lọc được: NV chọn khác gợi ý, chưa chọn dòng tiền, đã/chưa điều chỉnh.
  - Tích chọn dòng rồi chuyển sang mã đúng, đặt theo gợi ý TK, hoặc bỏ điều chỉnh; kèm ghi chú.
- **B03 trực tiếp:** có 3 cột Trước điều chỉnh (theo dòng tiền nhân viên chọn; chưa chọn thì phân loại theo TK đối ứng), Sau điều chỉnh và Chênh lệch.
- **B03 gián tiếp sau điều chỉnh:**
  - Mục II, III (vd mã 21 mua sắm TSCĐ) lấy đúng số của báo cáo trực tiếp sau điều chỉnh.
  - Các khoản phải trả, phải thu và mã 07 tự cân đối lại theo bút toán kép, nên mã 20 luôn khớp trực tiếp.
  - Cũng có cột trước / sau điều chỉnh.
- File Excel ghi cả số trước điều chỉnh và sau điều chỉnh của B03.

## v4.14.1 – 03/11/2026
**Số dư nội bộ: bỏ tài khoản thuế**
- Số dư nội bộ tại ngày không còn tính TK thuế 133 (thuế GTGT được khấu trừ) và 333 (thuế và các khoản phải nộp Nhà nước). Thuế không phải công nợ nội bộ; hệ thống chỉ gắn thuế theo đối tượng của bút toán gốc.

## v4.14.0 – 03/11/2026
**B03-DN theo phương pháp gián tiếp: lập chính xác theo bút toán kép**
- Phương pháp gián tiếp được lập lại từ biến động Nợ − Có trong kỳ của từng TK không phải tiền, loại phần thu/chi tiền đã xếp vào hoạt động đầu tư/tài chính.
  - Mã 20 (gián tiếp) tự khớp với mã 20 (trực tiếp).
  - Lợi nhuận trước thuế (mã 01) khớp B02 mã 50.
  - Không còn dòng bù chênh lệch.
- Các mã được tính theo nhóm tài khoản:
  - 02 khấu hao: 214. 03 dự phòng: 229, 352. 04 chênh lệch tỷ giá: 413.
  - 05 lãi/lỗ hoạt động đầu tư: phần thu nhập đã xếp vào mục II.
  - 09 phải thu, 10 hàng tồn kho, 11 phải trả, 12 chi phí trả trước, 13 chứng khoán kinh doanh.
  - 15 thuế TNDN: 821, 3334.
- Mã 07 gồm biến động phi tiền tệ của các TK khác, vd. mua TSCĐ/XDCB qua công nợ. Có bảng chi tiết theo TK ở cả màn hình và file Excel.
- Màn hình ghi rõ hai kết quả kiểm tra: mã 20 gián tiếp so với trực tiếp, và LNTT so với B02.

## v4.13.0 – 03/11/2026
**Đối chiếu số dư phân tích với sổ cái (tuổi hàng tồn, tuổi nợ)**
- Bảng tổng hợp theo tài khoản có thêm 3 cột:
  - **Số dư thuần** = giá trị tồn dương + tồn âm (hoặc số dư + dư ngược chiều).
  - **Số dư sổ cái** = Nợ − Có của toàn bộ bút toán đến ngày báo cáo.
  - **Chênh lệch**: ✓ nếu khớp.
- Thẻ "Giá trị hàng tồn" ghi thêm số dư thuần gồm cả tồn âm.
- Khi đang lọc theo đối tượng, cột đối chiếu được ẩn, vì sổ cái tính cho toàn bộ đối tượng.

## v4.12.0 – 03/11/2026
**Tuổi hàng tồn theo đối tượng; giao diện tràn màn hình**
- Thêm ô chọn **Đối tượng**. Khi chọn, ứng dụng tự chuyển sang "Đối tượng × Mặt hàng", hiện đối tượng đó đang giữ mặt hàng nào, số lượng, giá trị, tồn bao lâu và nhóm tuổi; nhấn đúp để xem sổ bút toán.
- Cách tính mới "Đối tượng × Mặt hàng" có cột Đối tượng và Mặt hàng tách riêng. Xuất Excel theo đối tượng đang chọn.
- Nội dung các trang trải hết chiều rộng màn hình, không còn bị giới hạn 1500px khiến hai bên trống.
- Biểu đồ cơ cấu tuổi hàng tồn hiển thị đúng khi mới mở trang.

## v4.11.0 – 03/11/2026
**Số dư nội bộ theo nhóm và tài khoản**
- Số dư nội bộ tại ngày được chia thành 3 nhóm:
  - Nhóm phải thu: TK loại 1–2 (131, 136, 138, 141…).
  - Nhóm phải trả: TK loại 3 (331, 335, 336, 338…).
  - Nhóm vốn: TK loại 4.
- Mỗi nhóm chia tiếp: tài khoản cấp 3 → tài khoản chi tiết, kèm dư Nợ, dư Có, số dư ròng theo bản chất nhóm và số công ty.
- Bảng theo công ty có các cột phải thu, phải trả, bù trừ (thu − trả), phần ước tính (335/1317).
- Cảnh báo tài khoản dư ngược chiều, vd. 331 dư Nợ (trả trước người bán), 131 dư Có (người mua trả trước).
- Nhấn đúp nhóm tài khoản hoặc tài khoản chi tiết để xem bút toán. File Excel có thêm sheet "Theo nhom tai khoan".

## v4.10.0 – 03/11/2026
**Tuổi nợ theo từng đối tượng; tách TK 1412 (tạm ứng vật tư)**
- TK 1412 – Tạm ứng vật tư có dòng riêng trong tuổi nợ; TK 141 tổng hợp không còn gồm 1412. Thêm nút xem nhanh "1412 tạm ứng vật tư theo đối tượng".
- Tuổi hàng tồn kho có thêm TK 1412 (vật tư đã tạm ứng, chưa nhập kho).
- Bảng mới **Tuổi nợ theo từng đối tượng**: gộp mọi TK công nợ của mỗi đối tượng, gồm phải thu, phải trả, ròng, các nhóm tuổi nợ, tuổi tối đa, dư ngược chiều.
  - Đối tượng lấy theo đúng phía hạch toán: TK Nợ ↔ đối tượng Nợ, TK Có ↔ đối tượng Có.
  - Có ô chọn đối tượng, ô tìm kiếm và 4 cách sắp xếp: số dư, quá hạn > 90 ngày, tuổi lâu nhất, dư ngược.
  - Bấm một đối tượng để lọc bảng chi tiết; nhấn đúp để mở từng tài khoản của đối tượng, nhấn đúp tiếp để xem sổ bút toán.
- File Excel tuổi nợ có thêm sheet "Theo doi tuong".

## v4.9.0 – 03/11/2026
**Giao dịch nội bộ: điều chỉnh đối tượng chọn sai, xem chi tiết toàn màn hình**
- Cửa sổ chi tiết mở toàn màn hình, có nút Thu nhỏ / Toàn màn hình.
- Lọc trong cửa sổ chi tiết: tìm chứng từ, diễn giải, đối tượng, người nhập; lọc theo nghiệp vụ, công ty, tài khoản, khoảng số tiền; chỉ dòng ước tính, nghi ngờ hoặc đã gán lại; sắp xếp.
- Tích chọn dòng để **Loại khỏi nội bộ** (từng dòng hoặc cả chứng từ) hoặc **Gán lại** sang công ty nội bộ đúng; kèm ghi chú lý do.
- Chế độ mới **Điều chỉnh đối tượng**: xem và bỏ các điều chỉnh đã lưu, xuất Excel; tìm chứng từ để đưa giao dịch bị chọn nhầm đối tượng bên ngoài vào nội bộ.
- Mọi điều chỉnh áp dụng cho tất cả báo cáo nội bộ: tổng hợp kỳ, số dư tại ngày, chi tiết, theo năm.
- Cảnh báo "Nghi ngờ sai đối tượng" khi diễn giải nhắc tới mã hoặc tên một công ty nội bộ khác với công ty đang gắn.

## v4.8.0 – 03/11/2026
**Báo cáo giao dịch nội bộ (4 chế độ)**
- Tổng hợp kỳ: chọn từ tháng – đến tháng, lọc theo công ty nội bộ, có ô tích **Không tính TK ước tính (335, 1317)**.
- Số dư nội bộ tại ngày: số dư của các tài khoản thuộc nhóm 1–4 theo từng công ty và tài khoản, kèm dư Nợ / dư Có và ngày phát sinh cuối.
- Chi tiết giao dịch từ ngày đến ngày, xuất được Excel.
- Tổng hợp theo năm (chọn nhiều năm): phần mua tách riêng 627 / 641 / 642 / chi phí khác / hàng hoá – vật tư (15x) / tài sản (211, 213, 241, 242); phần bán gồm doanh thu 511/512/515/711, trừ các khoản giảm trừ.
- Khi cả hai vế đều là đối tượng nội bộ, ứng dụng lấy vế công nợ (13x/14x/33x/34x/35x).

## v4.7.1 – 03/11/2026
**Giao dịch nội bộ / Thanh toán quốc tế: báo rõ lý do khi chưa có số liệu**
- Khi trang không có số liệu, ứng dụng nêu đúng nguyên nhân:
  1. Chưa nạp danh mục đối tượng. Có nút "Nạp file danh mục đối tượng" ngay trên trang, nạp xong số liệu hiện luôn.
  2. Danh mục có nhưng không đối tượng nào trong dữ liệu thuộc nhóm NB / TT / BN_QT / ROAMING.
  3. Có đối tượng nhưng không phát sinh trong kỳ đang chọn.
- Hiện thống kê danh mục: số đối tượng, số khớp với dữ liệu, số đối tượng theo từng nhóm.

## v4.7.0 – 03/11/2026
**Danh mục đối tượng, phân tích giao dịch nội bộ và thanh toán quốc tế**
- **Trang mới "Danh mục đối tượng":**
  - Nạp từ Excel theo mẫu `2026.10_DANH_MUC_KHACH_HANG_TIMOR` (Code_Name, Code, Name, Kind Of Customer, Code_NB, Name_NB). Hai cách nạp: thêm / cập nhật, hoặc thay toàn bộ.
  - Thêm, sửa, xoá từng dòng hoặc xoá nhiều dòng; tìm kiếm, lọc theo nhóm, chia trang; xuất Excel.
  - Các nhóm: NV nhân viên, BN_TM đối tác Timor, BN_QT đối tác quốc tế, ROAMING, NB nội bộ (kèm mã / tên công ty nội bộ), TT trung tâm / chi nhánh, NH ngân hàng, NO khác. Có thể thêm nhóm khác.
  - Khớp với đối tượng trong dữ liệu theo "Mã_Tên", nếu không có thì theo Mã. Có danh sách "đối tượng trong dữ liệu chưa có trong danh mục" để thêm nhanh.
- **Phân tích chuyên sâu → Giao dịch nội bộ:**
  - Giao dịch với các công ty nội bộ (NB, tuỳ chọn gồm cả TT), chia thành doanh thu, giảm trừ doanh thu, chi phí, mua hàng / vật tư / tài sản, bán / xuất hàng, thu tiền, trả tiền, công nợ / bù trừ.
  - Xem theo tháng (biểu đồ), theo công ty nội bộ, theo mã đối tượng. Nhấn đúp một ô để xem bút toán. Xuất Excel.
- **Phân tích chuyên sâu → Thanh toán quốc tế:**
  - Các lần chi tiền (Có 111/112/113) cho đối tác BN_QT và ROAMING.
  - Mỗi tháng: số lần chuyển, số đối tác, tổng tiền, TK ngân hàng.
  - Phí chuyển tiền ước tính theo cài đặt: phí cố định / lần + %, có tối thiểu / tối đa.
  - So sánh với phí ngân hàng đã hạch toán (Nợ 635/642/627, diễn giải có bank charge / fee / SWIFT / remittance).
  - Xem theo đối tác và danh sách từng lần chuyển. Xuất Excel.
- **Tác vụ nền:** thêm chỉ mục theo đối tượng (một lần, chạy nền khi mở ứng dụng) để các phân tích theo đối tượng chạy nhanh.

## v4.6.0 – 31/10/2026
**Lọc theo số dư tại ngày đang chọn – phải thu 138812**
- Ô chọn đối tượng hiện số dư tại "Tại ngày" ngay sau tên, ví dụ "ABC — còn nợ 2,200", "XYZ — dư Có 7,650", "… — hết số dư".
- Thêm bộ lọc "Số dư tại dd/mm/yyyy", mỗi lựa chọn kèm số đối tượng:
  - Còn nợ (dư Nợ).
  - Dư Có.
  - Còn số dư (Nợ hoặc Có).
  - Hết số dư.
- Khi lọc theo số dư, ô chọn đối tượng chỉ còn các đối tượng thoả điều kiện. Các ô tổng hợp, tuổi nợ, cảnh báo, bảng đối tượng tính lại theo bộ lọc.

## v4.5.1 – 31/10/2026
**Sửa lỗi lọc đối tượng ở trang phải thu 138812**
- **Lỗi:** chọn đối tượng A xong thì không chọn lại được đối tượng khác. Ô gõ có gợi ý của trình duyệt chỉ hiện các tên chứa chữ đang có trong ô, nên chỉ còn lại A.
- **Ô chọn thả xuống "Đối tượng":** liệt kê đủ mọi đối tượng theo tên (⚠ = rủi ro cao), dòng đầu "— Tất cả đối tượng —" để bỏ lọc.
- **Ô "Tìm":** gõ một phần tên hoặc mã để lọc nhiều đối tượng; bấm vào ô thì chữ cũ tự được chọn để gõ đè.
- Bấm tên đối tượng trong bảng thì ô chọn tự chuyển sang đối tượng đó.

## v4.5.0 – 31/10/2026
**Lọc theo tài khoản chi tiết 335**
- Ô chọn "TK chi tiết" (Tất cả TK 335 / 3353 – Accrued vas, roaming… / 3358 – Other accrued expenses…), danh sách tự lấy theo dữ liệu. Có ở:
  - "Trích – huỷ trích 335": đối chiếu chi tiết, theo kỳ, theo đối tượng, theo khoản mục, theo nhân viên, tuổi khoản treo, lập trích trước kỳ mới.
  - "Trích trước 335 & Phân bổ 242".
- Áp dụng cho:
  - File huỷ trích và file trích trước để import ERP.
  - Xuất Excel; tên file có số TK.
  - Sổ chi tiết khi nhấn đúp.
- Lựa chọn được nhớ cho lần mở sau.
- **Sửa lỗi:** đổi bộ lọc khi đang ở chế độ "Lập trích trước kỳ mới" có thể báo lỗi giao diện.

## v4.4.0 – 31/10/2026
**Lọc chi tiết từng đối tượng trong phân tích phải thu 138812**
- Thanh lọc mới:
  - **Đối tượng:** gõ tên hoặc mã, có danh sách gợi ý.
  - **Mức rủi ro:** Cao / Trung bình / Thấp.
  - **Loại cảnh báo.**
  - **Chỉ đối tượng có cảnh báo.**
  - Nút "Xoá lọc", nhãn "Đang lọc x / y đối tượng". Bộ lọc được nhớ cho lần mở sau.
- Các ô tổng hợp, biểu đồ tuổi nợ, bảng cảnh báo và bảng đối tượng tính lại theo bộ lọc.
- Khi lọc còn đúng một đối tượng, chi tiết hiện ngay trong trang: cảnh báo, từng khoản doanh thu được trừ bởi chứng từ thu nào, còn nợ, quá hạn; từng lần thu trừ cho khoản nào.
- Bấm vào tên đối tượng trong bảng để lọc nhanh theo đối tượng đó.
- **Sửa lỗi:** thanh "Đang tải dữ liệu…" che hàng tab nên không bấm được tab trong lúc tải.

## v4.3.0 – 31/10/2026
**Phân tích chuyên sâu phải thu 138812 theo đối tượng (nghi chọn sai đối tượng khi giảm trừ công nợ)**
- Trang mới "Phân tích chuyên sâu → Phải thu 138812 theo đối tượng". Nhập được TK khác (ví dụ 138811, 131), chọn ngày tính và số ngày hạn thanh toán.
- **Phân bổ tiền thu cho từng khoản phải thu**, theo trình tự thời gian:
  - Ưu tiên khoản có cùng mã tham chiếu trong diễn giải (mã thuê bao `dil0046_gftth_…`, số điện thoại, số hoá đơn, số hợp đồng).
  - Sau đó khoản đúng số tiền và cùng kỳ dịch vụ, rồi đến khoản cũ nhất.
  - Tiền trả trước được giữ lại và trừ cho doanh thu ghi nhận sau.
- **(1) Tiền thu có thể thuộc đối tượng khác:**
  - Mã tham chiếu trong diễn giải thuộc khoản phải thu của đối tượng khác.
  - Thu tiền khi đối tượng không còn nợ, mà số tiền khớp đúng khoản đang nợ của đối tượng khác.
  - Diễn giải nêu tên đối tượng khác (ít nhất 2 từ đặc trưng).
- **(2) Doanh thu sai đối tượng / ghi thiếu doanh thu:**
  - Khoản nợ còn treo trong khi tiền thu cùng mã lại ghi cho đối tượng khác.
  - Khoản nợ có thể đã được thu nhưng tiền ghi cho đối tượng khác.
  - Thu tiền nhưng đối tượng chưa có doanh thu.
  - Thu tiền kỳ X nhưng không có doanh thu kỳ X.
  - Doanh thu định kỳ thiếu tháng.
  - Thu vượt phải thu, dư Có.
  - Thu tiền ghi vào đối tượng chung (chi nhánh) dù diễn giải có mã khách hàng.
- **(3) Theo đối tượng:**
  - Phải thu, giảm trừ, đã thu, còn nợ, tuổi nợ 7 nhóm, tuổi tối đa, lần thu gần nhất, số cảnh báo.
  - Mức rủi ro Cao / Trung bình / Thấp.
- **Chi tiết đối tượng (nhấn đúp):**
  - Từng khoản doanh thu được trừ bởi chứng từ thu nào, theo cách khớp nào; còn nợ, hạn, số ngày quá hạn.
  - Từng lần thu trừ cho khoản nào, phần chưa phân bổ.
- Xuất Excel gồm các sheet Đối tượng, Cảnh báo, Tổng hợp.
- **Sửa lỗi:** chuyển giữa các tab con của Phân tích chuyên sâu đôi khi làm mất thao tác nhấn đúp.

## v4.2.0 – 31/10/2026
**Gom lỗi theo chứng từ nhanh hơn**
- **Bảng gom sẵn:** lỗi theo chứng từ × tháng × người nhập × bộ phận × trạng thái × nhóm lỗi.
  - Dùng cho chế độ "Theo chứng từ" trên trang Lỗi nhập liệu khi lọc theo người nhập, tháng, bộ phận, trạng thái, nhóm lỗi (hoặc không lọc).
  - Lọc theo loại lỗi hoặc mức độ vẫn gom trực tiếp, đã có chỉ mục.
  - Dựng lại sau mỗi lần phân tích (chỉ các tháng trong kỳ).
  - Khi đổi trạng thái lỗi, các chứng từ liên quan được tính lại ngay.
- **Tốc độ** đo trên 1,3 triệu dòng / 3 triệu cảnh báo: từ 4,2–5,2 giây xuống 0,2–2,1 giây. Chế độ mặc định được tính sẵn, mở ra 0,24 giây.
- **Bộ nhớ đệm:** bỏ qua các ô lọc đang để trống khi so khớp, nên dùng lại được kết quả tính sẵn.
- **Kiểm tra:** kết quả khớp từng dòng với cách gom cũ, kể cả sau khi đổi trạng thái.

## v4.1.0 – 31/10/2026
**Sửa lỗi "Đang tải dữ liệu…" rất lâu với dữ liệu trên 1 triệu dòng, thêm thanh tiến độ**

Nguyên nhân: ở v3.9–4.0 mọi truy vấn xếp hàng trong một luồng. Khi mở ứng dụng, luồng này bận tính sẵn trang Tổng quan, bộ lọc lỗi, Báo cáo (5–7 giây mỗi việc trên dữ liệu lớn), nên trang đang mở phải chờ.

- **Nhiều luồng truy vấn:**
  - 2–3 luồng chạy song song; trang đang mở không phải xếp hàng sau trang khác.
  - Chỉ tính sẵn khi có luồng rảnh, luôn chừa một luồng cho người dùng.
  - Bộ nhớ đệm dùng chung; truy vấn trùng đang chạy thì dùng chung kết quả.
  - Tính sẵn thêm Công nợ, Tồn kho, danh sách cần khắc phục.
- **Bảng đếm tổng hợp:**
  - Lỗi: theo tháng × quy tắc × mức × trạng thái × người nhập × bộ phận.
  - Bút toán: theo tháng × người nhập.
  - Tổng quan, bộ lọc lỗi, Báo cáo, Chấm điểm nhân viên đọc vài nghìn dòng thay vì hàng triệu.
  - Đổi trạng thái lỗi thì bảng được cộng trừ tại chỗ.
- **Thanh tiến độ tải dữ liệu:** hiện phần trăm, số phần đã tải và thời gian còn lại ước tính (học theo thời gian các lần mở trước). Áp dụng cho chuyển trang và chuyển tab trong Phân tích chuyên sâu và Báo cáo tài chính.
- **Lập trích trước kỳ mới:**
  - Trước đây vẽ cùng lúc hàng nghìn dòng có ô nhập, làm treo giao diện 10–18 giây.
  - Nay hiển thị 300 dòng mỗi lần, có ô tìm kiếm và nút "Hiển thị thêm".
- Các bảng phân tích hiển thị tối đa 1.000 dòng (xuất Excel để xem đủ).
- **Phân tích 1 tháng:**
  - Quy tắc "nghi trùng lặp" chỉ so với các dòng cùng TK Nợ / TK Có / số tiền, có chỉ mục riêng.
  - Bảng đếm lỗi chỉ dựng lại các tháng trong kỳ.
  - Tiến độ hiện chi tiết từng quy tắc toàn cục.
- Trang Quản lý dữ liệu đếm số dòng mỗi tháng theo chỉ mục: 82 ms thay vì quét toàn bảng.
- Đo trên 1,3 triệu dòng với 3 triệu cảnh báo:
  - Mở ứng dụng ~1,5 giây.
  - Lần đầu mở mỗi trang 0,1–2,4 giây; lần sau 0,1–0,5 giây.
  - Trước đây nhiều trang 5–18 giây.

## v4.0.0 – 31/10/2026
**Sổ số dư tổng hợp theo tháng: lập báo cáo tài chính tức thì cho dữ liệu nhiều năm**
- **Sổ số dư tổng hợp (khoá sổ theo tháng)** được lưu sẵn trong CSDL:
  - Phát sinh Nợ/Có theo tháng × tài khoản chi tiết.
  - Phát sinh công nợ theo tháng × đối tượng (131, 331, 138, 338, 141, 136, 336).
  - Số dư đầu kỳ, phát sinh, cuối kỳ của **mọi tháng**, cộng dồn từ tháng đầu tiên. Tháng không phát sinh vẫn có số dư.
- **Báo cáo đọc số dư đầu kỳ trực tiếp** từ sổ, không cộng lại hàng triệu bút toán từ năm 2015. Đo trên 647.000 dòng:

| Báo cáo | Trước | Sau |
|---|---|---|
| Bảng cân đối số phát sinh | 1,0 s | 0,02 s |
| B01 | 1,9 s | 0,06 s |
| B09 | 1,9 s | 0,3 s |
| Đổi kỳ báo cáo (năm/quý/tháng) | 1–4 s | 0,1–0,3 s |

- **Tự cập nhật khi nạp/xoá dữ liệu:** chỉ tính lại phát sinh của tháng thay đổi (0,05 s mỗi tháng), rồi cộng dồn lại số dư.
- Nút "Tổng hợp lại toàn bộ" và dòng trạng thái của sổ trên trang Báo cáo tài chính.
- Lần đầu mở bản mới, ứng dụng tự tổng hợp sổ một lần (khoảng 2 giây trên 650.000 dòng).
- Báo cáo tài chính luôn dùng **toàn bộ dữ liệu đã nạp**, không phụ thuộc lựa chọn tháng "đưa vào phân tích", để số dư liên tục qua các năm.

## v3.9.0 – 31/10/2026
**Tối ưu cho dữ liệu 1–2 triệu dòng và hàng triệu cảnh báo**

Đo trên 647.000 dòng với 1,17 triệu cảnh báo:

| Thao tác | Trước | Sau |
|---|---|---|
| Tổng quan (lần đầu) | 7,0 s | ~0 s (tính sẵn) |
| Bộ lọc trang Lỗi | 9,4 s | 0,01 s |
| Danh sách lỗi | 3,1 s | 0,4 s |
| Gom theo chứng từ | 4,9 s | 1,6 s |
| Báo cáo & Thông báo | 4,7 s | ~0 s |
| Phân tích toàn bộ dữ liệu | 102 s | 42 s |
| Phân tích 1 tháng | 16 s | 7,6 s |
| Mở lại trang đã xem | như lần đầu | < 0,1 s |

- **Bảng lỗi ghi sẵn thông tin:** tháng, người nhập, bộ phận, chứng từ và trạng thái xử lý được lưu ngay trong bảng lỗi, kèm chỉ mục bao phủ. Đếm và lọc cảnh báo không còn phải nối với bảng 1,5 triệu dòng hạch toán. Trạng thái tự đồng bộ khi bấm Đã khắc phục / Không phải lỗi.
- **Danh sách lỗi lấy trang trước:** chỉ lấy đúng 200 dòng của trang đang xem rồi mới đọc chi tiết bút toán.
- **Phân tích chạy song song:** quy tắc từng dòng chạy trên nhiều luồng CPU (số luồng = số nhân − 1, tối đa 6).
  - Phân tích kỳ lớn: tạm gỡ chỉ mục khi xoá và ghi hàng loạt, dựng lại một lần ở cuối.
  - Phân tích một tháng: giữ nguyên chỉ mục.
- **Bộ nhớ đệm truy vấn:**
  - Kết quả các trang được giữ lại cho tới khi dữ liệu thay đổi.
  - Khi rảnh, ứng dụng tính sẵn các trang Tổng quan, bộ lọc lỗi, Báo cáo.
- **Lần mở đầu tiên sau khi nâng cấp:** ứng dụng tự bổ sung các cột mới cho bảng lỗi. Bước này mất khoảng 20–40 giây với 1–2 triệu cảnh báo và chỉ chạy một lần.

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
