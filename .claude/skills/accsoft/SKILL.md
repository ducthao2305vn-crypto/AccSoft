---
name: accsoft
description: Phát triển, sửa lỗi, kiểm thử và phát hành AccSoft — ứng dụng desktop Electron + SQLite rà soát rủi ro hạch toán (dữ liệu ERP Export_Accounts_DuLieuHachToan của Viettel Timor). Dùng khi thêm/sửa quy tắc rà soát lỗi, phân tích tuổi nợ/tồn kho/335/242, báo cáo, giao diện, hiệu năng dữ liệu lớn, hoặc ra phiên bản/Release mới.
---

# AccSoft – hướng dẫn làm việc

Người dùng: chuyên gia tài chính/kiểm toán, giao tiếp tiếng Việt, ngắn gọn, chỉ thẳng nếu họ sai.
Mục đích phần mềm: **quản trị rủi ro khi nhân viên hạch toán**, kèm bộ báo cáo tài chính lập tự động (mục "Báo cáo tài chính").

## Kiến trúc
| File | Vai trò |
|---|---|
| `main.js` | Tiến trình chính Electron: IPC, hộp thoại, sao lưu/khôi phục, PDF, mail. Mọi truy vấn đi qua `qa(name,...args)` tới `engine/qworker.js`, **không** chạy SQL trên main (tránh treo). IPC `q` chỉ cho phép tên trong mảng `READ` / `WRITE`. |
| `engine/worker.js` | Tác vụ ghi chạy trong worker_threads: `import` (exceljs stream / csv-parse, lô 5000), `finalize` (mode `replace`/`merge`), `analyze` (chạy quy tắc theo kỳ), `enrich`, `opening` (số dư đầu kỳ), `buildAgg`, xoá tháng/lần nạp. |
| `engine/qworker.js` | Worker đọc thường trực, gọi `engine/queries.js`. |
| `engine/db.js` | Lược đồ SQLite (`node:sqlite`, WAL). `COLS` = ánh xạ cột ERP → cột `entries`; cột thiếu tự `ALTER TABLE`. Bảng `agg` tổng hợp sẵn TK 5–8 (bỏ 911, bỏ OPENING_BALANCE). |
| `engine/rules.js` | 37 quy tắc theo dòng (`RULES` {k,s:H/M/L,n,d,fix,f}) + `GROUP` staff/audit, `AUDIT_WHY`, ngưỡng `CFG`/`setConfig`, `RULES_VERSION`. |
| `engine/queries.js` | Truy vấn báo cáo: overview, errors, aging (FIFO, gom SQL 2 phía), inventory, pl/plRange/plTrend (từ `agg`), cost, ledger (drill-down), thresholds, backup. |
| `engine/fin.js` | Báo cáo tài chính: Bảng cân đối số phát sinh, B01, B02, B03 (Thông tư 99/2025). |
| `engine/accrual.js` | Đối chiếu trích trước – huỷ trích 335. |
| `engine/deep.js` | Phân tích chuyên sâu: recurring, variance, accruals (335), prepaid (242), benford, staff, vendors, fx. |
| `engine/reports.js` | Xuất Excel, nội dung mail, `ruleInfo()`. |
| `index.html` + `app.js` | Giao diện (TLM Design, cam #FA4700 chủ đạo, Chart.js). Mỗi trang là `<section id>` + hàm trong `VIEWS`. Nhấn đúp số liệu → `openLedger(title, sub, spec, nat)`. |
| `preload.js` | `window.api.*`. |
| `scripts/bundle.js` | esbuild → `out/`; electron-builder đóng gói `out/`. |

DB: `<thư mục app>/AccSoft_Data/accsoft.db` (portable: `PORTABLE_EXECUTABLE_DIR`). Log: `AccSoft_Data/logs/`. Sao lưu: `AccSoft_Data/backups` (giữ 10 bản). Không commit `AccSoft_Data`.

## Hiệu năng dữ liệu lớn (v3.9–4.1) – bắt buộc giữ
Người dùng có 1,1–1,5 triệu dòng (2015 → nay, còn tăng) và hàng trăm nghìn tới hàng triệu cảnh báo. **Mọi tính năng mới phải chạy được ở quy mô này.**

**Mục tiêu đo trên 1,3 triệu dòng / 3 triệu cảnh báo:**

| Thao tác | Mục tiêu |
|---|---|
| Mở app đến khi thấy Tổng quan | ~1,5 s |
| Mở trang lần đầu | ≤ 2,5 s |
| Mở lại trang | ≤ 0,5 s |
| Báo cáo tài chính | ≤ 0,2 s |
| Phân tích 1 tháng | ~15 s |
| Phân tích toàn bộ | ~140 s (song song) |

### Nguyên tắc
1. **Không quét `entries` hoặc `errors` để đếm hay tổng hợp khi đã có bảng tổng hợp.** Các bảng sẵn có:

   | Bảng | Nội dung | Dựng / cập nhật ở đâu |
   |---|---|---|
   | `agg` | P&L, doanh thu – chi phí theo tháng × TK × bộ phận × khoản mục | `rebuildAgg` |
   | `fin_mv`, `fin_pmv`, `fin_close` | Sổ số dư tháng cho BCTC | `rebuildFin`, gọi trong `rebuildAgg` |
   | `ent_sum` | Bút toán theo tháng × người nhập: n, nx (không tính số dư đầu kỳ), docs, dmin/dmax | `rebuildAgg` |
   | `err_sum` | Cảnh báo theo tháng × quy tắc × mức × trạng thái × người nhập × bộ phận | `rebuildErrSum(db, from, to)` sau phân tích (chỉ các tháng trong kỳ); `setReviews` cộng trừ tại chỗ |
   | `err_ent` | Số dòng có lỗi / có lỗi mức H–M theo tháng × người nhập | cùng `rebuildErrSum` |
   | `err_doc` | Lỗi theo chứng từ × tháng × người nhập × bộ phận × trạng thái × nhóm (n, high, rules, eid) | `rebuildErrSum`; `setReviews` gọi `refreshErrDoc(docs)` |

   - `syncErrSum` tự dựng lại khi `settings.err_sum_n` khác `count(errors)`.
   - Khi khởi động, `aggEmpty()` kiểm tra thiếu hoặc lệch → chạy task nền `buildAgg`, không khoá cửa sổ.
   - **Không** gọi `rebuildErrSum` trong `open()`: chậm, khoá cửa sổ.
   - Thêm thống kê mới thì mở rộng các bảng này; đừng viết `GROUP BY` trên entries hoặc errors trong truy vấn trang.
2. **Bảng `errors` ghi sẵn `ym, u, dept, doc, st`:**
   - Ghi khi chèn: `insErrFull` cho quy tắc từng dòng; `insErr` (INSERT … SELECT) cho quy tắc toàn cục.
   - `fillErrCols()` bổ sung các dòng còn trống.
   - Lọc lỗi bằng `EINC + RV('er')`; chỉ nối `entries` khi lọc theo TK, số tiền hoặc chữ (`where().from`).
   - Trang danh sách: lấy id theo trang trước (sắp xếp theo sev/rule/user/st/doc) rồi mới nối dữ liệu chi tiết.
   - Tổng số dòng lấy từ `err_sum` qua `sumWhere(f)`, trả null nếu bộ lọc cần dữ liệu chi tiết.
   - `errorGroups` dùng `err_doc` khi bộ lọc chỉ gồm user/month/dept/status/statusIn/group; lọc khác thì gom trực tiếp. Kiểm tra: so `{...}` với `{..., minSev:'L'}` (ép đi nhánh cũ), kết quả phải khớp từng dòng.
3. **Chỉ mục:**
   - Chỉ mục lỗi khai báo trong `ERR_IDX`. Phân tích kỳ trên 200k dòng thì `dropErrIndexes` trước, `createErrIndexes` sau; kỳ nhỏ giữ nguyên.
   - Chỉ mục `entries` cần có: `ix_e_ym`, `ix_e_ym_imp` (để `months()` đếm theo chỉ mục), `ix_e_dup(acc_debit, acc_credit, amount)` (quy tắc trùng), `ix_e_accd`, `ix_e_accc`, `ix_e_doc`.
   - Lọc TK theo khoảng (`acc>='335' AND acc<'336'`), không dùng `LIKE`.
4. **Phân tích:**
   - `analyze()` (async) chia khoảng id cho K = số nhân − 1 (tối đa 6) luồng phụ chạy task `scan`. Luồng phụ mở DB với `{light: true}`, chỉ đọc, gửi `errs` về; luồng chính ghi.
   - Quy tắc toàn cục khi phân tích theo kỳ phải giới hạn theo kỳ. Ví dụ DUPLICATE: dựng bảng tạm `dk` gồm các khoá (TK Nợ, TK Có, số tiền) của dòng trong kỳ; `dg` gom trước `nd` và `ds` (danh sách chứng từ); duyệt từ dòng trong kỳ (`entries e CROSS JOIN dg`).
   - Mỗi bước có nhãn tiến độ "Quy tắc toàn cục: …".
5. **Nhóm worker truy vấn (`main.js`):**
   - `qPool` gồm 2–3 `qworker`. Hàng đợi `qQueue`. Bộ nhớ đệm `qCache` chỉ cho tên trong `READ`; xoá khi có truy vấn ghi hoặc task ghi xong (`invalidateQueries`). `qInflight` gộp các truy vấn trùng đang chạy.
   - `warmJob()` chỉ chạy khi còn ít nhất 2 luồng rảnh. `WARM` gồm overview, errorFacets, report, pl…, cộng thêm aging/inventory/todo theo tham số mặc định của giao diện. Nếu đổi mặc định ô chọn trên giao diện thì sửa `WARM` theo.
   - Khoá cache `qKey()` bỏ các ô lọc trống, nên `{group:''}` dùng chung kết quả với `{}`.
   - Truy vấn đọc mới **phải** thêm vào `READ`; nếu không, nó bị coi là truy vấn ghi và xoá cache.
   - Debug: `ACCSOFT_QDEBUG=/tmp/q.log` ghi thời gian từng truy vấn, số việc trong hàng đợi, số luồng bận.
6. **Giao diện:**
   - Gọi truy vấn bằng `aq()` (đếm phần để vẽ thanh tiến độ). **Không** khai báo lại `api`: trùng biến của contextBridge làm hỏng toàn bộ app.js.
   - Chuyển trang hoặc tab nặng thì bọc trong `loadWith(key, sec, fn)` để có thanh tiến độ (ước lượng theo `pageMs` trong localStorage).
   - Không vẽ quá 1.000 dòng (`tbl()` tự cắt). Bảng có ô nhập phải phân trang và có ô tìm (`mkTable`): hàng nghìn ô nhập làm treo giao diện 10–20 giây.

### Đo hiệu năng (`scripts/bench/`)
- `node scripts/bench/queries.js [db]`: thời gian lạnh từng truy vấn chính; dòng vượt 1 s có dấu ⚠.
- `node scripts/bench/analyze.js '{"from":"2026-10","to":"2026-10"}' [db]`: mốc thời gian từng bước phân tích.
- `node scripts/bench/make-big-db.js <db-thử> [N]`: nhân đôi dữ liệu (lùi N năm) để tạo dữ liệu thử lớn. **Chỉ chạy trên bản sao.**
  - Sau đó chạy `analyze.js '{}'` và `rebuildAgg`.
- Đo giao diện bằng Playwright Electron (`xvfb-run -a`):
  - Đợi `.content>section:not(.hide)` hết class `loading` và `#pageLoad` có class `hide`, rồi đo từng trang hai vòng (lạnh / có cache).
  - Nếu có thời gian chờ mà không có truy vấn nào (xem bằng `ACCSOFT_QDEBUG`), nguyên nhân là phía giao diện. Dùng CDP `Profiler` để tìm hàm tốn thời gian (thường là bảng quá nhiều phần tử).
- Kiểm tra tính đúng sau tối ưu:
  - `sum(err_sum.n) = count(errors)` và phép EXCEPT giữa hai cách nhóm cho 0 dòng lệch.
  - Số cảnh báo theo quy tắc trước và sau phải bằng nhau.
  - BCTC: tổng Nợ = tổng Có, B01 `diff` = 0, B03 `check` = 0.

## Quy ước nghiệp vụ (bắt buộc giữ)
- Công nợ / tồn kho: **TK Nợ ↔ đối tượng Nợ (partner_debit), TK Có ↔ đối tượng Có (partner_credit)**. Dùng `sidePairs`.
- Phải thu: 131/136/1388/141. Phải trả: 331/335/336/334/3388. Tồn kho: 151–158, trừ 154.
- 331 theo hợp đồng, 1411 theo đề nghị tạm ứng, 335 theo đối tượng × khoản mục.
- Import **không** phân tích. Phân tích riêng bằng nút "Phân tích dữ liệu" theo kỳ rà soát (tháng/quý/năm). Trạng thái lưu ở `months.analyzed_ver`.
- Dòng `source_table='OPENING_BALANCE'` (TK giả `OB`) không bao giờ là lỗi và không vào `agg`.
- Trạng thái và ghi chú lỗi lưu ở `reviews` theo `err_key`, giữ qua các lần phân tích lại.
- Dữ liệu thật: RateToVND = 0 nên kiểm tra tỷ giá báo "không có dữ liệu".

## Báo cáo tài chính (v3.5–3.7, `engine/fin.js`)
- **Văn bản áp dụng:** Thông tư **99/2025/TT-BTC**, thay Thông tư 200 từ năm tài chính 2026. Người dùng có thể gọi nhầm là "Thông tư 49"; nếu vậy thì nói thẳng là nhầm.
  - Tên mẫu: B01-DN "Báo cáo tình hình tài chính", B02-DN "Kết quả hoạt động kinh doanh", B03-DN "Lưu chuyển tiền tệ".
  - Mã số B03 theo cấu trúc chuẩn: 01–07, 20, 21–27, 30, 31–36, 40, 50, 60, 61, 70.
  - Chưa đối chiếu được với nguyên văn Thông tư 99 (mạng chặn). Nếu người dùng gửi mẫu chuẩn thì chỉnh lại theo mẫu đó.
- **Sổ số dư tổng hợp (v4.0, `db.rebuildFin`)**:
  - Bảng `fin_mv(ym, acc, name, dr, cr)`, `fin_pmv(ym, a3, p, v)` và `fin_close(ym, acc, ob, dr, cr, cb)` (luỹ kế mọi tháng liên tục).
  - Được dựng lại trong `rebuildAgg`, tức sau mỗi lần nạp/xoá dữ liệu: chỉ tính lại phát sinh các tháng thay đổi, rồi cộng dồn lại toàn bộ `fin_close` trong JS.
  - BCTC đọc số đầu kỳ bằng `closeAt(prevYm(from))` và phát sinh từ `fin_mv`; **không quét bảng entries**, trừ B03 (dòng tiền theo TK đối ứng, có chỉ mục).
  - BCTC dùng **mọi tháng** (INC = '1', plBy với allMonths = true).
  - Khi CSDL chưa có sổ, lúc khởi động tự chạy `buildAgg`. `finStatus` trả trạng thái sổ.
- **Hàm dữ liệu:**
  - `make(all, okYm, INC, plRange)` tạo các hàm báo cáo; queries xuất ra `finTrial`, `finBalance`, `finIncome`, `finCash` (đã có trong mảng READ).
- **`trial(from,to,level)` – bảng cân đối số phát sinh:**
  - Số đầu kỳ = luỹ kế mọi bút toán có `ym < from` (gồm cả số dư đầu kỳ nhập từ file mẫu với TK giả `OB`). Không có dữ liệu trước kỳ thì bằng 0 và `hasOpening=false`.
  - `level` 1 là TK cấp 1 (3 số), 0 là TK chi tiết. Tên TK lấy từ bảng `L1`.
- **`balanceSheet` – B01:**
  - Danh sách `L` gồm `[mã, tên, hàm(w), cấp, các mã con]`; `w` = 'cb' (cuối kỳ) hoặc 'ob' (đầu kỳ, tức cuối tháng trước `from`).
  - Công nợ 131/331/138/338/141/136/336 tách dư Nợ / dư Có theo đối tượng bằng `partnerSplits`.
  - Số dư còn lại của TK loại 5–9 đưa vào mã 421b. TK OB là dòng riêng.
  - Trả về `diff` (phải bằng 0) và `unmapped` (TK chưa gán chỉ tiêu). Thêm TK mới thì thêm vào cả `L` và tập `used`.
- **`income` – B02:** dùng lại `plRange` (bảng `agg`, không tính 911). Có kỳ so sánh `cmpFrom/cmpTo`.
- **`cashFlow` – B03:**
  - Tiền = TK 111–113. Mỗi khoản thu/chi tiền được phân loại theo TK đối ứng qua bảng `IN`/`OUT` (regex, quy tắc đầu tiên khớp được áp dụng); chuyển tiền giữa các TK tiền bị loại.
  - Phương pháp gián tiếp: lợi nhuận trước thuế + khấu hao (biến động 214) + dự phòng − doanh thu tài chính + biến động vốn lưu động lấy từ bảng cân đối số phát sinh. **Mã 07 là số cân đối** để mã 20 bằng dòng tiền thực tế.
  - Kiểm tra: `check` = 50 + 60 + 61 − tiền cuối kỳ phải bằng 0.
- **Giao diện (`vFin` trong `app.js`):**
  - Các tab tb/bs/pl/cf; B03 có nút chuyển trực tiếp/gián tiếp (`FP.cfm`).
  - Kỳ báo cáo `FP.mode`: m (tháng), q (quý), y (năm), ytd (luỹ kế đầu năm), r (khoảng tháng); mode suy ra `from/to`. Kỳ chưa đủ tháng được cắt đến tháng cuối có dữ liệu (`partial`).
  - So sánh B02: cùng kỳ năm trước = lùi 12 tháng; kỳ liền trước = lùi N tháng (m: 1, q: 3, y/ytd: 12), luôn cùng số tháng.
  - Nhấn đúp chỉ tiêu B02 mở `openLedger` kind 'pl'.
- **`notes` – B09:**
  - Danh sách `sections`, mỗi mục có `code` (V.x, VI.x), `title`, `type`:
    - 'mov': `mov(pres, nat)` lấy từ bảng CĐSPS chi tiết, gồm đầu kỳ / tăng / giảm / cuối kỳ (`nat` −1 cho TK dư Có).
    - 'top': 10 đối tượng dư lớn nhất qua `partnerTop`; một truy vấn gom sẵn 131/331 để nhanh.
    - 'kv': cặp tên – giá trị.
  - Văn bản phần I–IV, VII lưu trong `settings` khoá `b09Info` (getB09Info/setB09Info); mặc định ở hàm `b09Def()` trong `app.js`.
  - Kiểm tra: V.1 = mã 110, V.3 = 131, V.12 = 311 trên B01.
- **Excel:** IPC `report:fin` gọi `reports.finBook(tb, bs, pl, o, cf)`, tạo 8 sheet: CDSPS, B01-DN, B02-DN, B03 trực tiếp, B03 gián tiếp, B09-DN, B03 phân loại, Thông tin.
- **Kiểm thử:**
  - Gọi `require('./engine/queries')(db)` với DB chỉ đọc.
  - Kiểm tra: tổng Nợ = tổng Có (đầu kỳ, phát sinh, cuối kỳ); B01 `diff` ≈ 0 và `diffOb` ≈ 0; B03 `check` ≈ 0; bản gián tiếp cộng ra đúng mã 20.
- **Chưa có:** tách ngắn hạn/dài hạn theo kỳ hạn; lãi vay đã trả (mã 04) đang suy từ 635/3351; ảnh hưởng tỷ giá (mã 61) theo 413 (RateToVND trong dữ liệu đều bằng 0).

## Danh mục đối tượng & phân tích theo nhóm (v4.7, `engine/partners.js`)
### Phòng ban = Department Sub (v4.29.2)
- Báo cáo chi phí theo phòng ban (`DIMS.dept`) và trường điều chỉnh `dept` dùng cột **department_sub** (phòng ban ngân sách), không dùng `department` (phòng ban hạch toán).
- `deptSources` liệt kê tên ở cả hai cột để ánh xạ.

### Bổ sung cột cho dữ liệu cũ (v4.29.1)
- `worker.enrichFile` (nút "Bổ sung thông tin" ở Quản lý dữ liệu) cập nhật bằng `coalesce` các cột product/uom/locator/dist/rate/group_cost/services/location/project/period/plate.
- `SRC` khai báo dạng mảng tên cột thì so khớp không phân biệt hoa thường và lấy cột đầu tiên có giá trị (`normalize`).
- Khi thêm cột mới vào COLS/SRC, nhớ thêm cột đó vào `enrichFile` để dữ liệu đã nạp được bổ sung mà không cần nạp lại.

### Chi phí theo vị trí / xe / phòng ban (v4.29, `engine/loccost.js` dùng chung)
- v4.30: vị trí/xe sắp khoản mục → mã, dòng cộng `data-dsub` + tổng `data-dtot`; lọc `dmG_<d>` (khoản mục) và `dK_<d>` (giá trị, `DIMF.key`). Nhấn đúp ô Tổng → `dimDetail` với `k:null` = mọi giá trị (`loccost.detail` key==null, giới hạn 30000 dòng).
- `DIMS`: `location` (e.location, field_adj 'location'), `plate` (e.plate, 'plate'), `dept` (e.department, 'dept').
- Nhóm chi phí:
  - `GROUPS.location` / `GROUPS.plate` ghi đè được bằng `settings.loc_groups` / `settings.veh_groups`.
  - `dept` nhóm theo `cost_cat.grp`, thêm nhóm '(khoản mục ngoài danh mục)'.
- `matrix(d, from, to, keys)` trả về `gaps` (chỉ dim location), `high`, `over` (so với định mức `settings.veh_norm`, chỉ dim plate), `ratio` (tổng kỳ / trung vị cùng nhóm, cần ≥ 3 dòng) và `cat` (phòng ban danh mục).
- IPC: `locMatrix(d, …)`, `locDetail(d, key, g, from, to)`, `locList(d)`, `locNorms` nằm trong READ; `locSetNorms` nằm trong WRITE.
- `fieldadj.FIELDS` có thêm `dept` (cột department).
- UI: `vDim(d)`, `dimDraw`, `dimDetail` dùng chung cho 3 trang `locc`, `vehc`, `deptc`.

### Chi phí theo vị trí (v4.28, `engine/loccost.js`)
- `GROUPS`: danh sách nhóm và mã khoản mục, có thể ghi đè bằng `settings.loc_groups`.
- Mã vị trí hiệu lực = `coalesce(field_adj(location).value, e.location)`, lấy qua LEFT JOIN, không dùng subquery tương quan (chậm hơn khoảng 20 lần).
- Truy vấn có điều kiện `type_of_cost LIKE 'E17.1.%'` để tăng tốc; nếu thêm nhóm với mã khác tiền tố này thì phải bỏ điều kiện.
- `matrix(from, to, keys)` đọc thêm 12 tháng trước kỳ để xác định tháng đầu tiên phát sinh, trả về `gaps` (tháng thiếu) và `dbl` (tháng > 1,8 lần bình quân). `detail(loc, g, from, to)` trả bút toán; `locations()` trả danh sách mã vị trí.
- UI: trang `locc` gồm `vLoc`, `locDraw`, `locDetail`. Đổi mã vị trí gọi `faSet(…, 'location')`. Lưu ý trùng id: ô nhập tháng trên trang dùng `lcPF`/`lcPT`, còn `lcT` là bảng trong cửa sổ chi tiết.

### KQKD khớp B02 (v4.27.1)
- Cộng theo khoản mục, chỉ trên vế TK loại 5/7 (doanh thu) và 6/8 (chi phí, trừ 821); không gồm 911.
- Thuế TNDN: khoản mục Profit/Minimum tax và 8211 vào dòng 74, 8212 vào dòng 75 (dòng label nhưng vẫn nhận giá trị).
- `EXP_DEF`: chi phí chưa ánh xạ vào dòng mặc định theo TK.
- `compute` trả thêm `b02` (từ `plBy`) để UI so dòng 68 với mã 50 và dòng 76 với mã 60.

### Cột bảng & tự phân loại doanh thu (v4.27)
- `COLP` (cuối `app.js`) xử lý kéo đổi độ rộng ở mép phải `thead th` (vùng 7px) và ẩn / hiện cột qua menu chuột phải.
  - Cài đặt lưu trong `localStorage['accsoft.colPrefs']`, khoá = tên các cột lá, đọc từ `dataset.cn` (dùng textContent, không dùng innerText vì th đang ẩn sẽ ra chuỗi rỗng).
  - `MutationObserver` tự áp cài đặt khi bảng mới xuất hiện.
- `kqkd.REV_RULES` / `autoRev(acc, trev, accName)` phân loại doanh thu chưa ánh xạ. Bật/tắt bằng `settings.kqkd_autorev`. Kết quả `compute` có thêm `lines[].auto` và `autoOn`.

### KQKD theo mẫu (v4.26, `engine/kqkd.js`)
- **Đọc mẫu:** `parseTemplate(XLSX, wb)` đọc sheet đầu: cột A là STT, B là tên tiếng Anh, C là tên tiếng Việt; công thức chuẩn lấy ở cột Q (quý 1).
  - Dòng lá: Q = SUM(E r : G r).
  - Dòng tính: Q là công thức, `Qnn` được đổi thành `Rnn`.
  - Dòng tham số: không có Q, chỉ có giá trị E.
- **Lưu trữ:** mẫu mặc định ở `kqkd_template.json`; mẫu người dùng nạp lưu trong `settings.kqkd_tpl`. `compile(expr)` dịch R/SUM/IFERROR sang JS.
- **Bảng ánh xạ:** `kq_map(row, cost[], rev[], acc[{p, side}])`.
- **Tính số:** `compute(cols)` đọc bảng `agg` (ym, side, acc, tcost, trev), cộng vào các dòng lá, rồi tính các dòng tính theo từng kỳ. Kết quả gồm `values`, `totals` (rev/exp và phần đã map) và `unmapped`.
- `autoMap` khớp theo tên trong `cost_cat` và tên trong dữ liệu. UI tự gọi `autoMap` khi chưa có ánh xạ nào.
- IPC: `kqCompute`, `kqTpl`, `kqSources`, `kqMaps` nằm trong READ; `kq*` còn lại nằm trong WRITE; `kq:template` để nạp mẫu.
- `fin.drill` nhận `tc` (mã khoản mục) và `tr` (loại doanh thu).
- UI: `FT = 'kq'`, `kqMapDrawer(r)`.

### Danh mục phòng ban & khoản mục chi phí (v4.25, `engine/catalogs.js`)
- Bảng dữ liệu:
  - `dept_cat(code, name, descr, note)`: danh mục phòng ban.
  - `dept_map(src PK, code)`: ánh xạ nhiều tên phòng ban gốc → một phòng ban danh mục.
  - `cost_cat(code, name, descr, level, active, has_loc, has_prod, grp, vn, kd1, note)`: khoản mục chi phí.
- `ensure(db)` được gọi trong `db.open`: tạo bảng, nạp dữ liệu từ `seed_catalogs.json` nếu bảng còn trống, và tự ánh xạ theo tên trùng lần đầu.
- IPC: `dmDeptList`, `dmDeptSources`, `dmCostList`, `dmCostUnmatched`, `dmExport` nằm trong READ; các hàm `dm*` còn lại nằm trong WRITE. `dm:import` tự tìm dòng tiêu đề có cột "Code".
- Tra cứu khi lập báo cáo: `deptOf()` (src → {code, name}), `costOf()` (code → khoản mục), `tocCode(type_of_cost)`.
- UI: trang `dmc` → `vDM`, `dmDept`, `dmMap`, `dmCost`. Tên file xuất `DANH_MUC_*` khớp `RAW` nên giữ dạng thô để nạp lại được.

### Chọn hợp đồng (v4.24.3)
- `fieldadj.contractsOf(bp)` (IPC `faContracts`, nằm trong READ) trả về các hợp đồng trong entries và field_adj của đối tượng, ở cả hai phía Nợ/Có.
- Trong openLedger: `#lHdS` là ô chọn hợp đồng, giá trị `__EMPTY__` nghĩa là xoá trống; `#lHdM` là ô tích nhập thủ công, bật nó thì hiện ô nhập `#lHd`.

### Tuổi nợ cấp đối tượng (v4.24.2)
- `vAging` luôn tải thêm `AGBP = aging(dim = 'bp')` khi dim khác 'bp'. KPI, bảng theo TK, biểu đồ và `#tAgBp` dùng `AGBP` (biến `sel`/`pos`/`abn`). Bảng `#tAging` và `#tAbn` dùng dữ liệu theo dim (biến `selD`/`posD`/`abnD`).
- Quy tắc: tổng hợp theo đối tượng phải bằng số dư sổ cái. FIFO theo hợp đồng chỉ dùng để rà soát hợp đồng ghi lệch.

### Bút toán tự triệt tiêu (v4.24, cập nhật 4.24.1)
- `grpSql(col, defs, level)`: khi level là `detail` thì dùng đúng mã TK; ngược lại dùng tiền tố trong defs (tiền tố dài xét trước), không khớp thì lấy 3 số đầu.
- `selfX(AG_ACC, level)` dùng cho aging; `invSelf(by, level)` dùng cho tồn kho. Với recv/accrual, loại khi cả 2 vế cùng nằm trong khoảng TK phân tích và cùng đối tượng.
- Điều kiện loại: `NOT (acc_debit=acc_credit AND ifnull(partner_debit,'')=ifnull(partner_credit,''))`. Với tồn kho, thêm điều kiện `locator = locator_credit`.
- Áp dụng cho: `aging`, `inventory`, `recv.js` (cả phía phải thu và phía thu tiền), `accrual.js` (nguồn 335), `partners.rowsOfKinds`, và mọi truy vấn `${INC}` trong `deep.js`.
- Không áp dụng cho: `trial` / `fin_mv`, `partnerTB`, ledger (vì phải khớp ERP).
- Bút toán cùng TK nhưng khác đối tượng được giữ lại.

### Tuổi nợ theo hợp đồng & sổ chi tiết (v4.23)
- `aging`, `inventory`, và `ledger` (kind `ag`/`inv`) không còn lọc INC: số dư phải bằng CĐPS. INC chỉ còn dùng cho rà soát lỗi và P&L.
- `agBpDetail(x, tab = 'acc' | 'ct')`: tab `ct` gọi `aging(dim = 'contract')`. Đối chiếu bằng `finPartnerTB('', asOf ym, accs, [], '', bp)`; nhóm TK lấy qua `AG_GRP` (thu/tra).
- `openLedger(title, sub, spec, nat, after)`:
  - Bộ lọc dựng bằng `fltBar`/`bindFlt`.
  - Với `kind === 'ag'`: có checkbox chọn dòng và nút đổi hợp đồng, gọi `faSet(items {id: rid, …}, 'contract', v)`.
  - Cột Hợp đồng trong SEL đã là giá trị sau điều chỉnh (`coalesce` với field_adj).
- CSS: `#drawer .pane{width:100%}` cho mọi cửa sổ chi tiết.

### Điều chỉnh dữ liệu quản trị (v4.22, `engine/fieldadj.js`)
- Bảng `field_adj(id, field, value, orig, sig, doc, d, ym, note, PK(id, field))`, với field là `contract | location | plate` (Mã vị trí = cột ERP **Location**, Biển số xe = **License Plate**). Riêng `cf` ghi vào `cf_adj` qua `FIN.cfAdjSet` (sig dạng `'c:'+…`).
- Hàm: `search` (tối đa 5000 dòng, trả kèm `xxxNew`), `values`, `set`, `remove`, `list`, `rebind` (gắn lại theo `sig` sau khi nạp lại dữ liệu).
- IPC: `faSearch`, `faValues`, `faList` nằm trong READ; `faSet`, `faRemove`, `faRebind` nằm trong WRITE.
- Cột `entries.plate` lấy từ nhiều tên tiêu đề có thể có; `worker.SRC` chấp nhận mảng tên.
- Hợp đồng hiệu lực = `coalesce(field_adj.value, e.contract)`, dùng trong aging (dim contract) và ledger.
- UI: trang `fadj` → `vFA`, `faRun`, `faDraw`, `faHist`.

### CĐPS theo đối tượng (v4.21)
- `partners.partnerTB(from, to, accs, kinds, company, q)` (IPC `finPartnerTB`, nằm trong READ): gom bút toán theo (TK, đối tượng cùng phía, trước/trong kỳ) bằng 2 truy vấn SQL (phía Nợ, phía Có). Kết quả gồm `rows {p, kind, company, coKey, acc, ob, dr, cr, cb}` và `tot`.
- UI: `FT = 'ptb'`, tham số lưu trong `FP.ptbAcc | ptbCustom | ptbKind | ptbCo | ptbQ | ptbV`.
- `fin.drill` nhận thêm `bp`, chỉ lấy phía có đúng đối tượng; khi có `bp` thì không trả bảng TK cấu thành.
- Quy tắc: `internalBalance` không áp dụng `ig_adj` (luôn dùng dữ liệu gốc). Kiểm tra: số dư nội bộ của một công ty phải bằng CĐPS theo đối tượng khi lọc cùng công ty và cùng danh sách TK.

### Phân cấp tab (v4.20)
- **Cấp 1** (chọn chuyên đề, vd `#dpTabs`): class `navtabs`, kiểu gạch chân, kèm nhãn `navlbl`.
- **Cấp 2** (chọn báo cáo trong chuyên đề): `subbar` gồm `.crumb` (tên chuyên đề) và `.subtabs` (nút tròn).
- Mọi phần tử `.tabs` nằm trong `#dpCtl` tự hiển thị kiểu nút tròn.
- Bộ lọc đặt trong `.filterrow`.
- Không dùng `.tabs` cho cả hai cấp nữa.

### Nhóm nội bộ & định dạng Excel (v4.19)
- **Lọc công ty:** `partners.js` có `coMatch(k, f)`. Giá trị `f` có thể là '' (tất cả), một mã công ty, hoặc `'G:1:TFU,VTC,…'` / `'G:2:…'` (nhóm 2 = ngoài danh sách nhóm 1).
- **UI:** `IG.par` (danh sách nhóm 1) và `IG.split`. Hàm `SPL(list, key, row, sub, nc)` tạo dòng tiêu đề nhóm và dòng "Cộng nhóm".
- **Excel (`engine/xlsfmt.js`):** `main.saveXlsx` gọi `prettify(wb, tên file)`, sau đó `stylize(buffer, wb)`.
  - `prettify` thêm 4 dòng đầu (tiêu đề cột ở dòng 5), gán định dạng số theo kiểu cột, đặt độ rộng cột, autofilter, đổi tên sheet có dấu (`SHEET_VN`), lấy tên báo cáo theo tên file (`TITLE`).
  - `stylize` dùng CFB để mở gói zip và chèn font/fill/border/xf vào styles.xml, gán `s` cho từng ô, thêm freeze pane.
  - Tên file khớp `RAW` (mẫu số dư đầu kỳ, DANH_MUC) được giữ dạng thô.
- Lưu ý khi chèn XML: Excel kiểm tra nghiêm ngặt thứ tự các thẻ con của `worksheet` (sheetPr, dimension, sheetViews, sheetFormatPr, cols, sheetData, …, autoFilter, …). openpyxl và LibreOffice bỏ qua lỗi thứ tự, nên không phát hiện được. Không chèn thẻ mới nếu chưa chắc vị trí đúng.
- Không dùng được xlsx-js-style (bị chặn cài code bên ngoài), nên phải tự chèn kiểu như trên.
- **Thêm báo cáo Excel mới:**
  - Đặt tên file theo dạng `AccSoft_<Ten>_<từ>_<đến>.xlsx`. Ngày dạng `YYYY-MM` hoặc `YYYY-MM-DD` trong tên file được đưa lên dòng "Kỳ báo cáo"; hai ngày thành "từ – đến", một ngày thành "Tại".
  - Thêm một dòng `[/^AccSoft_<Ten>/, 'TIÊU ĐỀ']` vào `TITLE`, đặt trước các mẫu tổng quát hơn.
  - Tên sheet không dấu (tối đa 31 ký tự) thì thêm vào `SHEET_VN`.
  - Dữ liệu là mảng object, cột là key. Giữ số dạng number (không format sẵn thành chuỗi) và ngày dạng chuỗi `YYYY-MM-DD`.
- **Quy tắc định dạng theo tên cột:**
  - Có '%' và giá trị ≤ 5 → 0.0%.
  - Tên cột đúng là Năm/Tháng/Kỳ/Mã/TK/Số hiệu/Line → để nguyên số.
  - Bắt đầu bằng "SL" hoặc "Số lượng" → #,##0.##.
  - Bắt đầu bằng "Số dòng", "Số lần", "Số TK", "Tuổi"… → #,##0.
  - Còn lại → số tiền #,##0.00, âm màu đỏ, 0 hiện "-".
- **Dòng in đậm:** dòng bắt đầu bằng Tổng/Cộng/Total, hoặc dòng chữ in hoa có khoảng trắng và dài hơn 10 ký tự (vd "A. TÀI SẢN NGẮN HẠN").
- **File cần nạp lại** (vào ứng dụng hoặc ERP) phải giữ dạng thô: đặt tên khớp `RAW`, hoặc ghi trực tiếp bằng `R.XLSX.write` như file GL Journal (biff8).
- **Nhóm nội bộ:**
  - Mặc định nhóm 1 là `'TFU,VTC,STL,VTG'`, lưu trong `localStorage` (khoá `igPick.par`), so sánh với `coKey` (= nb_code trong danh mục). Mã công ty sai so với Code_NB thì công ty đó rơi sang nhóm 2.
  - Lọc nhóm truyền qua tham số `company`/`key` sẵn có của `grpInternal`, `grpInternalRows`, `grpBalance`, `grpYears`, không thêm tham số mới.
  - `SPL` chỉ tách khi `IG.split` bật và không chọn một công ty đơn lẻ.
  - Khi thêm bảng mới theo công ty: dùng `SPL(list, o=>o.key, row, (L,lab)=>dòng cộng, số cột)`, và thêm cột `'Nhóm nội bộ': GN[gOf(o.key)]` khi xuất Excel.

### Sắp xếp theo tiêu đề cột (v4.17)
- Cuối `app.js` có một IIFE bắt sự kiện click trên `thead th`. `colOf` tính vị trí cột khi tiêu đề có rowspan/colspan; `num_` chuyển ô thành số hoặc ngày để so sánh.
- Dòng ghim cuối bảng: dòng colspan, hoặc dòng có style `font-weight:700` / `brand-25`.
- Không sắp xếp khi bảng có dòng ghim nằm giữa, khi tiêu đề đầu là "Chỉ tiêu", hoặc khi bảng có `data-nosort`.
- Quy tắc `MANUAL_CASH`: chứng từ `^VTLMN` có TK `11[123]` ở bên Nợ hoặc Có. Từ bản này `RULES_VERSION = 13`.

### Sao chép chuột phải (v4.16)
- Cuối `app.js` có một IIFE bắt sự kiện `contextmenu` trên mọi `td/th` và mở menu `#ctxMenu`.
- `hgrid` gộp tiêu đề nhiều tầng (rowspan/colspan). `clean` chuẩn hoá số trước khi sao chép.
- Bảng mới không cần làm gì thêm. Lưu ý: bảng dùng `tbl()` chỉ hiện tối đa 1000 dòng; muốn đủ dữ liệu thì xuất Excel.

### Truy nguồn & điều chỉnh dòng tiền (v4.15, `engine/fin.js`)
- **Mã dòng tiền:** `ERP(cf)` đổi mã trên ERP `0102_…` thành mã B03 `02` (01xx → 0x, 02xx → 2x, 03xx → 3x, 04 = chuyển nội bộ). `baseCode` = mã ERP, nếu không có thì dùng `autoCode` (phân loại theo TK đối ứng, tức IN/OUT).
- **Bảng điều chỉnh:** `cf_adj(sig PK, code, note, doc, d, ym, dr, cr, a, cf, bp, bpCr)`, với `sig = 'c:'+doc|d|dr|cr|cent|bp|bpCr`. Các dòng giống hệt nhau được điều chỉnh cùng lúc (`a` = số tiền × số dòng).
- **Tính toán:**
  - `cfGroups(from, to, adjusted)` gom bút toán theo (dr, cr, code); điều chỉnh được áp dụng dưới dạng cặp delta.
  - `cfBuild(groups)` lập cả trực tiếp và gián tiếp. `nop` lấy theo mã dòng tiền đã điều chỉnh, nên mục II/III của gián tiếp = trực tiếp.
  - `cashFlow` trả `direct`/`indirect` (sau điều chỉnh) và `directBefore`/`indirectBefore`.
- **IPC:** `cfRows`, `cfAdjList`, `finDrill` nằm trong READ; `cfAdjSet`, `cfAdjRemove` nằm trong WRITE. `drill({accs, from, to, pl})` trả về TK cấu thành và bút toán (tối đa 50.000 dòng).
- **UI:** `finDrawer`, `cfDrawer`, `fltBar`/`bindFlt`; bảng ánh xạ `BACC` (mã B01 → TK) và `PLA`/`PLK` (B02).

### B03 gián tiếp (v4.14, `engine/fin.js` `cashFlow`)
- Gom bút toán theo cặp (TK Nợ, TK Có) trong kỳ:
  - Bỏ bút toán chuyển giữa các TK tiền.
  - `full[k]`: biến động Nợ − Có của TK k.
  - `nop[k]`: phần biến động của k đến từ bút toán tiền có mã 21–36 hoặc 61.
- Khoá `key()`: các TK 5–9 (trừ 821) và bút toán kết chuyển 421 ↔ 911 gộp vào khoá 'PL'. 3334 và 214 có khoá riêng.
- Công thức:
  - Mã 01 = −full.PL. Mã 05 = nop.PL.
  - Các mã còn lại = −(full − nop) theo nhóm TK (hàm `take`). Phần còn lại vào mã 07, chi tiết trong `indOther`.
  - Đồng nhất thức bút toán kép bảo đảm mã 20 gián tiếp = mã 20 trực tiếp; độ lệch trả về trong `indCheck`.

### Đối chiếu sổ cái (v4.13)
- `ledgerBal(defs, asOf, level)` tính Nợ − Có theo TK (không lọc INC). Kết quả trả về trong `inventory().ledger` và `aging().ledger` (aging nhân với dấu bản chất TK).
- UI: `LG` (tồn kho) và `AGLG` (công nợ) so sánh số dư thuần với sổ cái.
- "Giá trị tồn" và "Số dư" chỉ cộng các dòng dương; phần âm nằm ở cột "Tồn âm" / "Dư ngược".

### Tuổi hàng tồn theo đối tượng (v4.12)
- `inventory(by='bp_product')`: `obj = bp + ' · ' + product`. Mỗi item có thêm `bp` và `prod`. Ledger `kind: 'inv'` nhận `by: 'bp_product'`.
- UI `#ivBp`: lọc theo `o.bp`. Khi đang ở `by` product/loc/bp, chọn một đối tượng sẽ tự chuyển sang `bp_product`.
- `export:inventory` nhận thêm tham số `bp`.
- CSS `section` không giới hạn chiều rộng (trước đây `max-width: 1500px`).

### Số dư nội bộ theo nhóm (v4.11)
- Từ v4.18, `internalBalance(asOf, withTT, excl, company, from)` chỉ tính các TK trong danh sách `IB_ACC` (TK công nợ). Đầu kỳ `ob` = các dòng có ngày < `from`; `dr`/`cr` = phát sinh trong kỳ; `bal` = số dư cuối kỳ. Mỗi công ty có `obThu`, `obTra`, `psDr`, `psCr`.
- `accGroup(acc, bal)` trả về `{grp: thu|tra|von, grpName, a3, a3Name (ACC3), rev, revName}`.
- `internalBalance` trả thêm `groups[]` (nhóm → accs (TK cấp 3) → sub (TK chi tiết)). Mỗi phần tử trong `companies[]` có thêm `thu, tra, von, est, rev`.

### Tuổi nợ theo đối tượng (v4.10)
- `AG_ACC` đặt `1412` trước `141`, vì `find` lấy tiền tố khớp đầu tiên. Ledger `kind: 'ag'` loại các TK con đã tách riêng, qua `AG_LONG(acc)`. `INV_ACC` có thêm 1412.
- UI `#tAgBp`: dữ liệu gộp theo `o.bp` từ `AGDATA.items`; `AGV.bpPick` dùng để lọc `#tAging`; `agBpDetail(x)` mở drawer theo từng TK.
- Click trên bảng được trì hoãn bằng timer (`AGBT`), nếu không lần render lại sẽ làm mất sự kiện dblclick.
- `agingBook` có thêm sheet 'Theo doi tuong'.

### Điều chỉnh đối tượng nội bộ (v4.9)
- Lưu trong bảng `ig_adj(sig PK, scope row|doc, action out|move, to_key, doc, d, a, ds, from_key, note)`.
- Khoá của dòng: `sig = 'r:'+doc|d|dr|cr|round(a*100)|bp|bpCr`. Khoá này không phụ thuộc id, nên vẫn khớp khi nạp lại dữ liệu. Khoá cả chứng từ: `'d:'+doc`.
- `picker(map, kinds, adjMap())` áp dụng điều chỉnh trước. `rowsOfKinds` nạp thêm các chứng từ đã gán lại (`move`), kể cả khi đối tượng gốc không thuộc nhóm nội bộ.
- `internalBalance` bỏ dòng `out`; với `move`, gán công ty mới cho vế TK công nợ.
- `suspect()` đánh dấu khi diễn giải nhắc tới nb_code / nb_name của công ty khác.
- IPC: `igAdjList` và `igDocLines` nằm trong READ; `igAdjSet` và `igAdjRemove` nằm trong WRITE.
- UI: `igGrid(host, rows, cos, onChange, opt)` gồm lọc, chọn dòng và hành động; `igDrawer` dùng `#drawer.full`. Chế độ `IG.m='adj'`.

### Báo cáo nội bộ (v4.8)
- `partners.js` cung cấp các hàm sau:
  - `EST`: nhận diện bút toán ước tính 335/1317, dùng cho tham số `excl`.
  - `picker`: khi cả hai vế đều là NB thì chọn vế công nợ.
  - `companies`, `internal`, `internalRows`, `internalBalance(asOf)`, `internalYears(years)`; danh sách cột theo năm nằm trong `YCOL`.
- IPC tương ứng: `grpBalance`, `grpYears`, `grpCompanies` (đều nằm trong READ).
- Trên UI: `vInternal` dùng state `IG {m:sum|bal|det|year, co, tt, ex, years}` và lưu vào localStorage với khoá `igPick`.

- **Bảng `partners_cat`** gồm `code_name` (khoá chính = đúng chuỗi partner_debit / partner_credit trong dữ liệu), code, name, kind, nb_code, nb_name, note.
  - Nạp từ Excel bằng IPC `cat:import` (chấp nhận tiêu đề Code_Name/Code/Name/Kind Of Customer/Code_NB/Name_NB hoặc tiếng Việt), mode merge | replace.
  - Truy vấn: `catList`, `catUpsert(r, oldKey)`, `catRemove(keys)`, `catExport`, `catUnmatched`, `catStats`. Các hàm ghi đã có trong mảng `WRITE`.
- **`kindMap()`:** ghép theo `code_name`, nếu không khớp thì theo `code` (cắt dần từ phải các đoạn "_"). Dữ liệu tháng 10 khớp 622/624 đối tượng.
- **Nhóm:** NV, BN_TM, BN_QT, ROAMING, NB (nội bộ, có nb_code như TFU, VTC), TT (business center), NH, NO.
- **`internal(from,to,withTT)`:** phân loại nghiệp vụ bằng `category()` theo cặp TK; `internalRows` trả chi tiết.
- **`intlPayments(from,to,fee)`:** lần chuyển = (chứng từ, đối tượng, tháng) có Có 111/112/113; phí = flat + % (trong khoảng min/max); so với phí đã hạch toán (Nợ 635/642/627 có từ khoá fee/charge/SWIFT).
- **Chỉ mục `ix_e_pd`, `ix_e_pc`:** tạo ở tác vụ nền `buildAgg` (`ensurePartnerIdx`), vì mất khoảng 36 giây với 1,3 triệu dòng. **Không** tạo trong `open()`.
- **Giao diện:**
  - Trang `cat` (`vCat`, `catForm`); tab `intg` và `intl` trong Phân tích chuyên sâu.
  - Xuất Excel chung qua IPC `xlsx:sheets(name, [[sheet, rows]])`.
  - `dpCtl` xử lý checkbox bằng `checked`.

## Phải thu theo đối tượng – TK 138812 (v4.3, `engine/recv.js`)
- **Dữ liệu thật:**
  - Có 138812 là thu tiền (Nợ 1122, từ sổ phụ ngân hàng). Đối tượng ghi ở `partner_credit`. Diễn giải chứa mã thuê bao (`dil0046_gftth_thao`), số điện thoại `7xxxxxxx` và kỳ ("AUGUST 2026").
  - Nợ 138812 là ghi nhận doanh thu trả sau, đối tượng ở `partner_debit`. File tháng 10 chưa có dòng nào → hiển thị banner `noRevenue`.
- **`analyze(acc, asOf, term)`:**
  - Phân bổ theo trình tự thời gian (sự kiện doanh thu trước, thu tiền sau trong cùng ngày). Ưu tiên: mã tham chiếu (`refs()`), rồi đúng số tiền + kỳ (`period()`), rồi cũ trước. Tiền trả trước nằm trong `avail`, trừ dần cho doanh thu sau.
  - Hạn = `due_date`, nếu trống thì ngày ghi nhận + `term`.
- **Cảnh báo:**
  - PAY_OTHER: tiền thu có thể của đối tượng khác (theo mã, số tiền hoặc tên ≥ 2 từ đặc trưng, nhiều hơn số từ khớp với tên chính đối tượng).
  - REV_OTHER, REV_MISSING (một dòng mỗi đối tượng; mức L nếu thuộc 2 tháng đầu dữ liệu hoặc không có doanh thu nào), REV_PERIOD, REV_GAP, OVERPAID, CREDIT_BAL, GENERIC_PARTNER.
  - OVERPAID và GENERIC_PARTNER gộp một dòng cho mỗi đối tượng để tránh nhiễu.
- **Mức rủi ro:** Cao nếu có cảnh báo H hoặc điểm ≥ 4 (H = 3, M = 1, quá hạn > 90 ngày = 2, tuổi > 365 ngày = 2, dư Có = 1).
- **Giao diện:**
  - Tab `recv`: tab con của Phân tích chuyên sâu; `recvDetail(p)` mở bảng chi tiết bên phải. Phần HTML dùng chung `recvDetailHtml(d, inline)`.
  - Bộ lọc `RCF` (p = mã đối tượng từ ô chọn `#rcSel`, q = chuỗi tìm). **Không** dùng `<datalist>` cho ô chọn đối tượng: trình duyệt chỉ gợi ý theo chữ đang có trong ô nên không đổi được đối tượng. Các trường còn lại: risk, type, flag, bal (debt / credit / any / zero theo `o.bal` tại asOf, ngưỡng 0,5; ô chọn đối tượng hiện số dư và chỉ liệt kê đối tượng thoả `bal`) lưu ở `ls 'rcFilter'`, lọc phía giao diện trên kết quả `recvAnalyze` (đã cache).
  - Lọc còn đúng một đối tượng thì hiện chi tiết ngay trong trang. Gõ tìm: chờ 600 ms rồi vẽ lại; giữ con trỏ trong ô bằng cờ `window.__rcFocus`.
  - `#pageLoad` phải có `pointer-events:none`, nếu không sẽ che các tab.
  - Xuất Excel: IPC `report:recv` (`reports.recvBook`).
  - `vDeep` xoá các sự kiện `B.on*` ở đầu hàm; mỗi tab tự gắn sự kiện của mình. **Không** dùng `else B.onclick=null` sau từng khối.
- **Test:** `/tmp`-style bảng in-memory với các ca: mã tham chiếu chéo, số tiền khớp đối tượng khác, thu không có doanh thu, thiếu tháng, trả trước.

## Trích trước – huỷ trích 335 (v3.1–3.4)
Mẫu hạch toán trong ERP:
| Nghiệp vụ | Bút toán | Diễn giải mẫu |
|---|---|---|
| Trích trước | Nợ 6xx / Có 335x, số **dương** | "Estimate … In April 2026" |
| Huỷ trích | Nợ 6xx / Có 335x, số **ÂM** (hoặc Nợ 335 / Có 6xx) | cùng kỳ dịch vụ |
| Chi phí thực tế | Nợ 6xx / Có 331, 111, 112… (có hoá đơn) | "Real … In April 2026" |
| Quyết toán qua 335 (đúng) | Nợ 335 / Có 331 | |

- **`engine/accrual.js`**
  - `period(desc)` đọc kỳ dịch vụ trong diễn giải (tháng tiếng Anh + năm, "tháng m/yyyy", "mm/yyyy"; lấy kỳ cuối cùng xuất hiện).
  - `match(all, {acc})`: `acc` là TK chi tiết 335 (vd '3353'); trống thì xét mọi TK 335. Hàm `accRange` đổi thành điều kiện khoảng. Truyền `acc` xuyên suốt: `deepReversal(from,to,acc)`, `deepAccruals(asOf,acc)`, `accrualSource(per,target,acc)`, `reversalLines(keys,acc)` (`o.acc335`), `report:accrual`. Danh sách TK lấy từ `acc335List` (đọc `fin_mv`); giao diện lưu ở `DPS.a335`.
  - `match(all)` ghép theo khoá **đối tượng × khoản mục × kỳ dịch vụ**; diễn giải không có kỳ thì lấy tháng hạch toán, và chi phí thực tế ghép với khoản trích còn dư sớm nhất. Trả về `{groups, flagged}`.
  - Mỗi group có: `accrued`, `released`, `remain`, `actual`, `paid`/`unpaid`/`lastPay`, `status`, `sev`, `accIds`, `accDocs`, `actDocs`, `invs`, `users`, `age`.
  - Các tình trạng: Chưa huỷ trích (H khi khớp đúng kỳ, M khi kỳ suy ra), Huỷ trích vượt số đã trích, Chưa có chi phí thực tế, Đã huỷ trích, Đã huỷ / quyết toán, Huỷ trích của kỳ trước dữ liệu.
  - Thanh toán: các khoản Nợ 331 của đối tượng trả dần cho hoá đơn Có 331 cũ nhất trước (FIFO). Dữ liệu thanh toán ERP không có số hoá đơn, nên số đã thanh toán của từng hoá đơn chỉ là ước tính.
  - Truy vấn dùng điều kiện khoảng (`acc_credit>='335' AND <'336'`) để dùng được chỉ mục, chạy khoảng 0,5 giây trên 650k dòng; không đổi sang `LIKE`.
  - `summarize()`, `STATUSES`, `AGE` dùng cho báo cáo.
- **Quy tắc `ACCRUAL_NOT_REVERSED`** (SET_RULES, nhóm staff): sinh trong `setRules()` của `worker.js`, gắn lỗi vào bút toán **chi phí thực tế** để nó vào email nhắc nhân viên.
- **`deep.reversal(from,to)`**: dữ liệu cho trang "Phân tích chuyên sâu → Trích – huỷ trích 335", gồm 7 chế độ (`RVM`): detail, per, p, t, u, age, make. Excel 6 sheet: `reports.accrualBook`.
- **Xuất file import ERP** theo mẫu GL Journal 126 cột:
  - Tiêu đề cột lấy từ `engine/gl_journal_headers.json` (lấy từ file mẫu `2026.08_HUY_IT_SLA_2026.xls`).
  - Ghi bằng `reports.reversalErpBook(lines, o)`, xuất `.xls` dạng biff8. Thông tin chứng từ (cột 1–7) chỉ ở dòng đầu; dòng: 12 DueDate, 13 Description, 18/20 TK Nợ/Có, 19/21 số tiền, 22/23 đối tượng, 24 khoản mục, 25 Department Sub, 27 Group cost, 29 Services, 36 Location.
  - Đổi `mã_tên` của dữ liệu xuất ERP sang `mã-tên` của file import: `vd()` thay `_` đầu tiên (TK, khoản mục, Group cost…); `bpVd()` tách mã đối tượng theo quy tắc, ví dụ `VTL_INTER_0002_TIMOR…` thành `VTL_INTER_0002-TIMOR…`.
  - **Huỷ trích**: IPC `report:reversalErp(keys,o)`, dùng `queries.reversalLines`. Đảo dòng trích gốc với số âm bằng `remain`, phân bổ từ dòng trích mới nhất. Kèm file `_DoiChieu.xlsx` (`reversalCheckBook`).
  - **Trích trước kỳ mới**: IPC `report:accrueErp(items,o)`, dùng `queries.accrualSource(per,target)` và `accrualLinesByIds`. Mỗi dòng truyền `out` (số dương) và `outDesc`; `swapPeriod()` trong `app.js` đổi tháng trong diễn giải. Khoản đã có trích ở kỳ đích được đánh `dup` và mặc định bỏ chọn. File đối chiếu: `accrueCheckBook`.
  - Các cột Group cost, Services, Location, Project, Period có từ v3.3. Dữ liệu cũ bổ sung bằng tác vụ `enrich`.
- **Test**:
  - Dựng bảng `entries` in-memory với các ca trích / huỷ / thực tế / quyết toán qua 335, rồi gọi `match()`.
  - Hoặc chèn dòng TEST vào bản sao DB, chạy Electron (mock `dialog.showSaveDialog`), so file xuất với mẫu: cùng 126 cột, cùng tên sheet. Sau đó khôi phục DB.

## Thêm / sửa quy tắc
1. Quy tắc theo dòng: thêm `{k,s,n,d,fix,f:r=>…&&'thông báo'}` vào `RULES`, gán `GROUP[k]` (staff/audit), và `AUDIT_WHY[k]` nếu thuộc nhóm audit. Ngưỡng số đặt trong `CFG_DEFAULT`, sau đó thêm nhãn vào `THL` trong `app.js`.
2. Quy tắc theo tập (trùng, ngoại lai, chia nhỏ…): viết trong `setRules()` của `worker.js` và thêm mã vào danh sách DELETE ở đầu hàm.
3. **Tăng `RULES_VERSION`** để các tháng hiện "Cần phân tích lại".
4. Chống báo nhầm: bỏ qua bút toán tự động / 911 / OB; đếm theo số chứng từ khác nhau.

## Thêm truy vấn hoặc trang
- Viết hàm trong `queries.js` hoặc `deep.js`, thêm vào object return, rồi thêm tên vào `READ` (hoặc `WRITE`) trong `main.js`.
- UI gọi `api.q('ten', ...args)`. Trang mới cần: nút `data-p` trong `#nav`, `<section id>`, `TITLES`, `VIEWS`.
- Dữ liệu lớn (~650k dòng, 500–600 MB): gom bằng SQL (GROUP BY), dùng `agg` khi có thể, tránh OR qua 2 cột (dùng `sidePairs`). Truy vấn > 3 giây sẽ bị ghi log.

## Kiểm thử
```bash
node -c main.js && node -c engine/worker.js && node -e "new Function(require('fs').readFileSync('app.js','utf8'))"
npm run -s bundle
```
Chạy Electron thật bằng Playwright (cần `xvfb-run -a`):
```js
const {_electron}=require('playwright');
const app=await _electron.launch({executablePath:'node_modules/electron/dist/electron',args:['.','--no-sandbox']});
const p=await app.firstWindow(); p.on('pageerror',e=>console.log('PAGEERR',e.message));
await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:['file.xlsx']}); dialog.showSaveDialog=async()=>({canceled:false,filePath:'/tmp/out'}); dialog.showMessageBox=async()=>({response:0})});
await p.evaluate(()=>window.api.q('stats'));
```
- Sao lưu `AccSoft_Data/accsoft.db` trước khi thử thao tác ghi, và khôi phục sau đó (xoá `-wal`/`-shm`).
- Kiểm tra bản đóng gói: `npm run -s dist:linux -- --dir --publish never`.

## Phát hành
1. Tăng `version` trong `package.json`. Thêm mục đầu `CHANGELOG.md` (`## vX.Y.Z – dd/mm/yyyy`, tiếng Việt). Cập nhật README nếu có tính năng mới.
2. Commit, rồi `git push -u origin <nhánh làm việc>`. Workflow `.github/workflows/build-desktop.yml` tự tạo tag và Release `vX.Y.Z` (Setup .exe, Portable .exe, .dmg, .AppImage) từ phiên bản trong package.json, sau khoảng 2–3 phút.
3. Kiểm tra bằng GitHub MCP: `actions_list` (list_workflow_runs) và `get_latest_release`.
4. Không tạo PR nếu người dùng không yêu cầu.

### Tìm nhanh trong select (v4.31)
- Cuối `app.js`: MutationObserver tự chèn `input.selsrch` trước mọi `<select>` ≥ 25 option (không multiple). Gõ → ẩn option không khớp (bỏ dấu), đặt value = mục khớp đầu (không bắn change); Enter → bắn `change`. Không cần sửa từng màn hình. Select có class `srch` luôn có ô tìm (vd `#lHdS` chọn hợp đồng); option thêm sau vẫn kích hoạt.

### Hiệu năng ô tìm (v4.31.6)
- Dùng `deb(fn, ms=250)` (đầu `app.js`) cho mọi `oninput` vẽ lại bảng; `bindFlt` đã debounce ô text. Bảng trong drawer không vẽ quá ~400 dòng một lần (nút Hiện thêm) – layout bảng 3.000 dòng mất ~1–3 giây.

### Focus sau alert/confirm (v4.31.7)
- Đầu `app.js` bọc `alert/confirm/prompt` → gọi `api.refocus()` (IPC `win:refocus` ở main.js: `blur(); focus(); webContents.focus()`), rồi focus lại phần tử cũ. Không dùng hộp thoại native khác mà bỏ qua wrapper này.

### Lớp giao diện v4.32
- Cuối `<style>` trong `index.html` có khối "v4.32 – lớp hoàn thiện": style chung cho mọi input/select/textarea, bảng (zebra, hover), KPI, animation trang/drawer. Không cần thêm class cho ô nhập mới. Không dùng font/ảnh từ mạng (app chạy offline).

### UI v4.33
- `confirm()` đã thay bằng `await ask(msg)` (Promise, hộp thoại trong app) – hàm gọi phải là async. `alert()` bị ghi đè thành `uiModal` (không chặn). Viết mới: dùng `await ask(...)`, không dùng `confirm`.
- Theme: `html[data-theme=dark]` (CSS cuối `<style>`), `body.mini` (menu thu gọn), `body.focusm` (ẩn aside + topbar); trạng thái lưu `ls ui_dark / ui_mini / ui_focus`.
- Nút ẩn: tự gắn cho `.kpis`, `.hero`, `.card > .hint` dài (class `.hidetg`, lưu `ls uiHide`). Màu nền viết inline (#FFF6F2, #FEE4E2…) được ánh xạ sang tối bằng selector `[style*=...]`.

### Dự báo tài chính (v4.34, `engine/forecast.js`)
- `history()` gọi `FIN.income`/`FIN.balanceSheet` từng năm (cache 15 phút, `refresh` để đọc lại); năm < 12 tháng nhân 12/n. `forecastSeries(y,h,model)` – 7 mô hình + `ens` (trọng số 1/MAPE rolling-origin). `compute(o)` → `{hist, fc:[{y,P,B}], compare, mape, bsMape}`; P dùng khoá dòng B02 (`rev, net, cogs, gp, op, pbt, tax, pat…`), B dùng mã B01. IPC `fcCompute` (READ). UI `vFC`/`fcDraw` (trang `fcst`).
- v4.35: `FC.monthly(o)` (IPC `fcMonthly`): `monthHist` = FIN.income từng tháng (cache); `mmethod` season (tỷ trọng TB 3 năm đủ 12 tháng × dự báo năm) / hw (Holt-Winters cộng tính L=12) / avg. UI `fcMon` (tab `mon`).
- v4.36: `monthly()` trả thêm `bsM` (B01 từng tháng từ `lastYm`+1 tới 12/Y, nội suy tuyến tính startB→fc[0].B, vốn chủ cộng LNST, Tiền plug) và `cfM` (LCTT gián tiếp từ ΔB01; `cfGroups` opA/liab/invA). UI `fcMonBS`, `fcBSRows`, `fcCFRows`; FCF.ms = pl/bs/cf.
- v4.37: `FC.internal(o)` (IPC `fcInternal`, make(FIN, months, PC)) – dùng `PC.internalYears` (YCOL), quy năm dở dang, `forecastSeries` từng công ty × cột ICOL; buyTot/salesNet tính lại. UI `fcIG` (tab `ig`, state `ls fcIG`).
- v4.38: chi phí cố định định kỳ – `queries.fixedCosts(codes)` (theo tháng × cogs/sell/admin theo TK Nợ/Có 62x-632/641/642, mã khoản mục trước dấu `_`), `fixedGroups()` = nhóm loc + plate. `forecast.fixedPart(o)`: base = T12 gần nhất / tháng cuối / BQ 3 tháng; fc = base×12×(1+g)^(năm−năm gốc); series mô hình = dòng − phần cố định. Tuỳ chọn `fixed, fixedBase, fixedG, fixedKeys`. `fcChartSafe` vẽ biểu đồ sau 2 rAF.
- v4.38.1: B01 `bsMode` ratio (mặc định): 130/140/150 + mục C = tỷ lệ/doanh thu thuần TB 3 năm × net dự báo; 120/250/240/260 giữ số dư cuối; còn lại mô hình; chặn ≥0 nếu lịch sử không âm (`bsHow`). Dòng B02 không âm trong lịch sử → chặn ≥0.
- v4.39: `o.inv` [{y,amt,life,loan%,rate%,opex%,rev}] → invY (dep/opex vào cogs, int vào finExp, rev cộng doanh thu; BS 220 += capCum−accDep, nợ C += loanBal); `o.divPct` chia LNST (giảm vốn chủ, tiền); `o.costFloor` (mặc định) chi phí không < năm cuối × tăng trưởng doanh thu; ratio mode giữ 220.
- v4.40: `queries.capexDep()` (năm: capex Nợ 211/213/241 trừ đối ứng TK TS/214; dep Có 214). compute: `cap[]` (maint = TB 3 năm hoặc `o.capexMaint`/`capexMode:'dep'`, depE TB 3 năm, + invY), 220 roll-forward; `cfY` B03 năm (cfo = pat+dep±WC±nợ trừ vay; cfi = −capex±đầu tư; cff = Δvay−chia LN). monthly `cfM` cùng logic. UI tab `cf` (`fcCFYear`), `fcCFRows(r,yearly)`.

### Danh mục nhân viên (v4.41, `engine/staff.js`)
- Bảng `staff(code PK, …FIELDS, updated_at)`. `importAoa(aoa, mode)` dò dòng tiêu đề chứa "Employee code", cột gộp "Phòng ban/Unit" = chức danh|phòng ban|đơn vị; chỉ dòng có mã chứa số + tên. `emailOf(u)`/`byUser(u)`: u dạng `USER_email` → khớp email, erp_user, code, phần trước @. IPC: READ staffList/staffEmailOf/staffByUser, WRITE staffUpsert/staffRemove/staffImport; `staff:import` (chọn file), `staff:mail` (list, subject, body – biến {name}…). UI `vStaff`, `stForm`, `stMail` (trang `staff`). Không commit dữ liệu nhân viên vào repo.
- v4.42: bảng `staff_bp(bp PK, code, auto)`. `partners(o)` = đối tượng có `…EMP\d+` (+ đã ghép), tên = phần sau mã; `suggest` trùng tên chuẩn hoá hoặc trùng tập từ (duy nhất). `autoMatch`, `setMap(bps, code|'')`, `bpOfStaff`, `staffOfBp` (dùng cho báo cáo công nợ nhân viên sau này). UI `vStaffBp` (STF.tab='bp').

### Công nợ tạm ứng (v4.43, `engine/advance.js`)
- `lines(acc, asOf, bps)` hai phía Nợ/Có TK 141x; gộp theo `staff_bp` (key `S:<mã NV>` hoặc `P:<đối tượng>`); `fifo` khoản treo + tuổi; `report(o)` / `detail(key,o)`; bảng `adv_recon(key, as_of, status sent|confirmed|disputed, amount, confirmed, note, sent_to)`. main: `adv:reconBook` (biên bản xlsx, ≤60 NV), `adv:reconMail` (thư + đính kèm, set 'sent'). UI `vAdv`, `advDetail`, `advMail` (trang `adv`). `askText()` thay `prompt()` (Electron không hỗ trợ).

### Chủ nhà trạm (v4.44, `engine/landlord.js`)
- `scan(o)`: đối tượng Có 331 khi Nợ 24211 (gộp theo partner_credit), paid Nợ 331/Có 11x, bal 331; site regex `[A-Z]{2}\d{4}` từ partner/contract/bts_site/location/diễn giải; period `dd/mm/yyyy - dd/mm/yyyy`, rate `$x/month` hoặc `$x * n months`. Bảng `landlord(bp PK, site, bank_acc, bank_name, acc_holder, phone, address, contract_end, rent_month, status, note)` ghi đè. IPC READ llScan/llDetail, WRITE llSave/llClear/llImport, `ll:import`. UI `vLL`, `llForm` (trang `landl`).
- v4.45: bảng `adv_backup(id = entries.id của dòng Nợ 141, key, note)`; `fifo(L, asOf, BK)` 2 hàng đợi (thường / backup), Có 141 trừ hàng thường trước rồi backup; report `bkAmt, bkOver` (quá `backupMonths`×30.4 ngày); detail `advances` (round = chẵn chục), `bkItems`; WRITE `advSetBackup(ids, key, on)`.
- v4.45.1: advance.lines luôn loại `1412%` (tạm ứng vật tư thuộc tuổi tồn kho); acc '1412' bị đổi về '141'.
- v4.45.2: `fifo` mới: bal = Σ(Nợ−Có); backup = các dòng Nợ đã đánh dấu, lấp từ mới nhất tới min(bal); phần còn lại lấp các dòng Nợ thường từ mới nhất → Σbuckets + bkAmt = max(0, close).
- v4.46: `lines()` ar = coalesce(field_adj field 'ar', advance_request), ar0 gốc. `fifoAR` (o.mode='ar'): nhóm theo AR, nhóm âm + nhóm không AR dồn vào pool trừ nhóm dương cũ nhất; trong nhóm lấp backup rồi khoản thường từ mới nhất; `ars[]` bảng theo đề nghị. `setAr(ids, value)` ghi field_adj (sig như fieldadj); FIELDS thêm `ar`. UI: `#adM` (bp|ar), bảng AR + chọn dòng sổ chi tiết đổi AR.

### Ô tìm bảng tự động (v4.47)
- Cuối `app.js`: MutationObserver gắn `.tsrchw input.tsrch` trước mọi `.tbl` – trong `#dPane` khi ≥ 2 dòng, trên trang khi ≥ 6 dòng và card chưa có ô tìm riêng. Lọc ẩn `tr` theo text (bỏ dấu, nhiều từ = AND). Bảng mới không cần làm gì thêm.
- v4.47.1–2: advance mặc định `group='bp'` (key P:<mã đối tượng>), `group='staff'` gộp S:<mã NV>. adv_recon luôn key P:; key S: cũ tự chuyển; setRecon/clearRecon `expand` S: → các P:.

### Công nợ 138811/138812 (v4.48, `engine/recv1388.js`)
- `lines` hai phía TK 138811/138812, bảng `r1388_wrong(id, side dr|cr, note, to_bp)`: to_bp rỗng = loại khỏi tuổi nợ, có = chuyển sang đối tượng đó. `aging` = lấp số dư (dòng hợp lệ) bằng Nợ mới nhất. report: close theo sổ (đối tượng gốc), adj sau loại/chuyển. IPC READ r88Report/r88Detail/r88Wrong, WRITE r88SetWrong. UI `vR88`, `r88Detail`, `r88Wrong` (trang `r88`).

### Đối chiếu hóa đơn 138812 (v4.49, `engine/inv1388.js`)
- Bảng `inv_cust(acc PK, name, fee, erp_code…)`, `inv_line(pay_date, ym_pay, ym_bill, acc, total, invoice… UNIQUE(invoice, acc, pay_date, total))`. `importBook(sheets)` dò sheet có cột Account + Code ERP (danh mục) và Invoice no + Subscriber (hóa đơn, dòng có Index số). `codeOf(partner)` = tiền tố mã (VTL_HOVEN00316 / VTL_VEN_197). `compare(o)` basis bill (ym_bill ↔ Nợ 138812) | pay (ym_pay ↔ Có 138812); `sus` cặp thiếu–thừa bằng nhau cùng tháng. IPC `inv:import`, READ invCustomers/invCompare/invCell, WRITE invImport/invSetMap. UI `vInv88` (trang `inv88`).
- v4.50: bảng `inv_issue(issue_date, ym, ym_bill, acc, invoice, amt_notax, amt_tax, total… UNIQUE(invoice, acc, ym, total))`; sheet phát hành = có cột hóa đơn + account + ngày phát hành/kỳ cước, không có 'Pay date'. compare basis `issue` (ym) | `issuecyc` (ym_bill) ↔ Nợ 138812, `notax`.
- v4.51: inv_issue thêm `kind (cuoc|bccs), shop, staff, txtype`; sheet BCCS = cột Transaction code + Invoice no + After tax; invoice lưu `số HĐ#mã giao dịch`; acc = `erp:<code>` nếu có Code ERP / tên dạng mã, ngược lại `bccs:<tên>`. compare issue/issuecyc: `src` all|cuoc|bccs, khi chưa có báo cáo phát hành cước thì gộp inv_line theo ym_bill làm cước phát sinh; ERP debit + Nợ 138811 partner LIKE `extra11` (mặc định BC19).

- v4.51.2: inv1388.importBook(sheets,mode,force) chặn nạp trùng — hóa đơn (invoice|acc) đã có trong inv_line/inv_issue → ROLLBACK, trả {blocked,nDup,sample,months,kinds}; app.invImp hiện danh sách trùng trong drawer. Trùng trong cùng 1 file vẫn cho phép.

- v4.51.3: invCell(x,ym,erpFirst) — ô Tổng gửi from/to = tháng đầu/cuối đang hiển thị (IVM); cellDetail lọc BETWEEN cho hóa đơn và ERP.

- v4.52.0: tab Map (inv88): IVF.cl1/cl2 lọc c.last; checkbox data-ick + #icBulk/#icApply/#icClear gọi invSetMap(accs[],code,name) một lần.

- v4.52.4: inv1388 num() hiểu (x), x-, U+2212; BCCS REV regex (return/cancel/hủy…) → âm; nạp lại: hóa đơn âm khớp dòng cũ total=-tot → UPDATE đổi dấu (FX, áp cả khi blocked).

- v4.53.0: inv_issue.neg_adj; INV.bccsNeg(rids,neg) chỉ WHERE kind=bccs (WRITE invBccsNeg); cellDetail trả rid; nút data-bneg trong invCell.

- v4.54.0: compare() cell.pay = ERP Có 138812 theo tháng (không vào diff); bỏ basis pay ở UI; cellDetail trả pay[].

- v4.56.0: cellDetail.match (số HĐ trong diễn giải → acc+tiền → tiền duy nhất); invMatchCard; footSum() tfoot động; customers() srcK bccs/cuoc + thống kê inv_issue bccs, lọc o.src.

- v4.57.0: queries.entrySearch(o) (READ) + entryFind() popup #efWrap, Ctrl+K, nút #btnFind.
