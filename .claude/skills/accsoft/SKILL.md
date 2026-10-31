---
name: accsoft
description: Phát triển, sửa lỗi, kiểm thử và phát hành AccSoft — ứng dụng desktop Electron + SQLite rà soát rủi ro hạch toán (dữ liệu ERP Export_Accounts_DuLieuHachToan của Viettel Timor). Dùng khi thêm/sửa quy tắc rà soát lỗi, phân tích tuổi nợ/tồn kho/335/242, báo cáo, giao diện, hiệu năng dữ liệu lớn, hoặc ra phiên bản/Release mới.
---

# AccSoft – hướng dẫn làm việc

Người dùng: chuyên gia tài chính/kiểm toán, giao tiếp tiếng Việt, ngắn gọn, chỉ thẳng nếu họ sai.
Mục đích phần mềm: **quản trị rủi ro khi nhân viên hạch toán**. Không làm báo cáo tài chính.

## Kiến trúc
| File | Vai trò |
|---|---|
| `main.js` | Tiến trình chính Electron: IPC, hộp thoại, sao lưu/khôi phục, PDF, mail. Mọi truy vấn đi qua `qa(name,...args)` tới `engine/qworker.js`, **không** chạy SQL trên main (tránh treo). IPC `q` chỉ cho phép tên trong mảng `READ` / `WRITE`. |
| `engine/worker.js` | Tác vụ ghi chạy trong worker_threads: `import` (exceljs stream / csv-parse, lô 5000), `finalize` (mode `replace`/`merge`), `analyze` (chạy quy tắc theo kỳ), `enrich`, `opening` (số dư đầu kỳ), `buildAgg`, xoá tháng/lần nạp. |
| `engine/qworker.js` | Worker đọc thường trực, gọi `engine/queries.js`. |
| `engine/db.js` | Lược đồ SQLite (`node:sqlite`, WAL). `COLS` = ánh xạ cột ERP → cột `entries`; cột thiếu tự `ALTER TABLE`. Bảng `agg` tổng hợp sẵn TK 5–8 (bỏ 911, bỏ OPENING_BALANCE). |
| `engine/rules.js` | 37 quy tắc theo dòng (`RULES` {k,s:H/M/L,n,d,fix,f}) + `GROUP` staff/audit, `AUDIT_WHY`, ngưỡng `CFG`/`setConfig`, `RULES_VERSION`. |
| `engine/queries.js` | Truy vấn báo cáo: overview, errors, aging (FIFO, gom SQL 2 phía), inventory, pl/plRange/plTrend (từ `agg`), cost, ledger (drill-down), thresholds, backup. |
| `engine/deep.js` | Phân tích chuyên sâu: recurring, variance, accruals (335), prepaid (242), benford, staff, vendors, fx. |
| `engine/reports.js` | Xuất Excel, nội dung mail, `ruleInfo()`. |
| `index.html` + `app.js` | Giao diện (TLM Design, cam #FA4700 chủ đạo, Chart.js). Mỗi trang là `<section id>` + hàm trong `VIEWS`. Nhấn đúp số liệu → `openLedger(title, sub, spec, nat)`. |
| `preload.js` | `window.api.*`. |
| `scripts/bundle.js` | esbuild → `out/`; electron-builder đóng gói `out/`. |

DB: `<thư mục app>/AccSoft_Data/accsoft.db` (portable: `PORTABLE_EXECUTABLE_DIR`). Log: `AccSoft_Data/logs/`. Sao lưu: `AccSoft_Data/backups` (giữ 10 bản). Không commit `AccSoft_Data`.

## Quy ước nghiệp vụ (bắt buộc giữ)
- Công nợ / tồn kho: **TK Nợ ↔ đối tượng Nợ (partner_debit), TK Có ↔ đối tượng Có (partner_credit)**. Dùng `sidePairs`.
- Phải thu: 131/136/1388/141. Phải trả: 331/335/336/334/3388. Tồn kho: 151–158, trừ 154.
- 331 theo hợp đồng, 1411 theo đề nghị tạm ứng, 335 theo đối tượng × khoản mục.
- Import **không** phân tích. Phân tích riêng bằng nút "Phân tích dữ liệu" theo kỳ rà soát (tháng/quý/năm). Trạng thái lưu ở `months.analyzed_ver`.
- Dòng `source_table='OPENING_BALANCE'` (TK giả `OB`) không bao giờ là lỗi và không vào `agg`.
- Trạng thái và ghi chú lỗi lưu ở `reviews` theo `err_key`, giữ qua các lần phân tích lại.
- Huỷ trích 335 (`engine/accrual.js`): trích = Nợ 6xx/Có 335 dương; huỷ = Có 335 số âm hoặc Nợ 335; thực tế = Nợ 6xx/Có khác 335. Ghép đối tượng × khoản mục × kỳ dịch vụ (`period()` đọc diễn giải). Test: dựng bảng `entries` in-memory với các ca trích/huỷ/thực tế.
- Dữ liệu thật: RateToVND = 0 nên kiểm tra tỷ giá báo "không có dữ liệu".

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
