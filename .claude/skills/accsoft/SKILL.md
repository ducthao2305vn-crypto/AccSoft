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

## Hiệu năng dữ liệu lớn (v3.9) – bắt buộc giữ
- **Bảng `errors` có cột ghi sẵn `ym, u, dept, doc, st`:**
  - Ghi khi chèn: `insErrFull` cho quy tắc từng dòng; `insErr` (INSERT … SELECT từ entries) cho quy tắc toàn cục.
  - Dòng còn trống được bổ sung bằng `fillErrCols()`.
  - `setReviews` cập nhật `errors.st`.
  - Truy vấn lỗi lọc theo `EINC` + `RV('er')` trên `errors er`; chỉ nối `entries` khi lọc theo TK, số tiền hoặc chữ (`where().from`).
  - `STATUS = coalesce(er.st,'open')`.
- **Chỉ mục lỗi khai báo trong `ERR_IDX` (db.js):**
  - Phân tích kỳ lớn (trên 200k dòng) thì `dropErrIndexes` trước, `createErrIndexes` sau.
  - Thêm chỉ mục mới cho bảng lỗi thì thêm vào `ERR_IDX`.
- **Phân tích song song:** `analyze()` (async) chia khoảng id cho K luồng phụ chạy task `scan`. Luồng phụ mở DB với `{ light: true }`, chỉ đọc, gửi `errs` về; luồng chính ghi kết quả.
- **Nhóm worker truy vấn (v4.1, `main.js`):**
  - `qPool` gồm 2–3 `engine/qworker.js`; qworker mở DB `{light: true}` và chỉ thực thi truy vấn.
  - Hàng đợi `qQueue`; bộ nhớ đệm `qCache` ở main, chỉ cho tên trong `READ`, xoá khi có truy vấn ghi hoặc task ghi xong (`invalidateQueries`); `qInflight` gộp các truy vấn trùng đang chạy.
  - `warmJob()` chỉ chạy khi còn ít nhất 2 luồng rảnh. Danh sách `WARM` cộng thêm aging/inventory/todo theo tham số mặc định của giao diện. **Không** để việc tính sẵn chiếm luồng người dùng đang cần.
  - Debug: đặt `ACCSOFT_QDEBUG=<file>` để ghi thời gian từng truy vấn.
- **Bảng đếm:**
  - `err_sum` (tháng × quy tắc × mức × trạng thái × người nhập × bộ phận) và `err_ent` (dòng có lỗi / lỗi mức H–M theo tháng × người nhập): `rebuildErrSum(db, from, to)` sau phân tích, `syncErrSum` khi số lượng lệch.
  - `setReviews` cộng trừ tại chỗ.
  - `ent_sum` (bút toán theo tháng × người nhập) dựng trong `rebuildAgg`.
  - overview / errorFacets / report / deepStaff / tổng của `errors()` đọc từ các bảng này (`sumWhere`).
- **Giao diện:**
  - `aq()` thay cho `api.q()`: đếm số truy vấn để vẽ thanh tiến độ. **Không** khai báo lại `api` (trùng biến contextBridge làm hỏng toàn bộ app.js).
  - `loadWith(key, sec, fn)` hiện thanh tiến độ (ước lượng theo `pageMs` lưu trong localStorage).
  - Bảng lớn: `tbl()` giới hạn 1.000 dòng; bảng có ô nhập phải phân trang (xem `mkTable`). Không vẽ hàng nghìn ô nhập cùng lúc.
- **Đo hiệu năng:**
  - Chạy `node /tmp/.../an.js` với `new Worker('engine/worker.js', {workerData:{task:'analyze'}})` và in mốc thời gian theo nhãn tiến độ.
  - Gọi `require('./engine/queries')(db)` rồi đo từng hàm.

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
