'use strict';
// Kết nối SQLite trên đĩa (node:sqlite có sẵn trong Electron – không cần biên dịch native)
const { DatabaseSync } = require('node:sqlite');

// Ánh xạ trường dữ liệu chuẩn hoá -> cột SQLite
const COLS = [
  ['line', 'line_no', 'INTEGER'], ['doc', 'document_no', 'TEXT'], ['date', 'account_date', 'TEXT'], ['due', 'due_date', 'TEXT'],
  ['dr', 'acc_debit', 'TEXT'], ['cr', 'acc_credit', 'TEXT'], ['drName', 'acc_debit_name', 'TEXT'], ['crName', 'acc_credit_name', 'TEXT'],
  ['amt', 'amount', 'REAL'], ['qty', 'quantity', 'REAL'], ['price', 'unit_price', 'REAL'],
  ['bp', 'partner_debit', 'TEXT'], ['bpCr', 'partner_credit', 'TEXT'], ['desc', 'description', 'TEXT'], ['descP', 'description_parent', 'TEXT'],
  ['dept', 'department', 'TEXT'], ['deptSub', 'department_sub', 'TEXT'], ['table', 'source_table', 'TEXT'],
  ['tcost', 'type_of_cost', 'TEXT'], ['trev', 'type_of_revenue', 'TEXT'], ['inv', 'invoice', 'TEXT'], ['adv', 'advance_request', 'TEXT'],
  ['contract', 'contract', 'TEXT'], ['user', 'created_by', 'TEXT'], ['updUser', 'updated_by', 'TEXT'], ['cf', 'cashflow', 'TEXT'], ['bts', 'bts_site', 'TEXT'],
  ['product', 'product', 'TEXT'], ['uom', 'uom', 'TEXT'], ['loc', 'locator', 'TEXT'], ['locCr', 'locator_credit', 'TEXT'],
  ['distFrom', 'dist_from', 'TEXT'], ['distTo', 'dist_to', 'TEXT'], ['currency', 'currency', 'TEXT'], ['rate', 'rate', 'REAL'], ['rateVnd', 'rate_vnd', 'REAL'],
  ['grpCost', 'group_cost', 'TEXT'], ['services', 'services', 'TEXT'], ['location', 'location', 'TEXT'], ['project', 'project', 'TEXT'], ['period', 'period', 'TEXT'],
];
const SEL_ENTRY = 'e.id, e.ym, (SELECT schema FROM imports i WHERE i.id=e.import_id) AS _schema, e.enriched AS _enriched, ' + COLS.map(c => 'e.' + c[1] + ' AS "' + c[0] + '"').join(', ');

// Điền các cột phi chuẩn hoá cho dòng lỗi mới (sau mỗi lần phân tích) – chỉ đụng các dòng còn trống
// Bảng đếm lỗi tổng hợp: tháng × quy tắc × mức × trạng thái × người nhập × bộ phận → Tổng quan, bộ lọc, Báo cáo, Chấm điểm nhân viên
// đọc vài nghìn dòng thay vì hàng triệu cảnh báo. Dựng lại sau phân tích / xoá dữ liệu; đổi trạng thái thì cộng trừ tại chỗ.
// Gom lỗi theo chứng từ (trang Lỗi → "Theo chứng từ"): chứng từ × tháng × người nhập × bộ phận × trạng thái × nhóm lỗi
const ERR_DOC_SEL = (() => { const { GROUP } = require('./rules'); const audit = Object.keys(GROUP).filter(k => GROUP[k] === 'audit').map(k => `'${k}'`).join(',') || "''";
  return `SELECT ifnull(doc,''), ifnull(ym,''), ifnull(u,''), ifnull(dept,''), coalesce(st,'open'), CASE WHEN rule IN (${audit}) THEN 'audit' ELSE 'staff' END,
    count(*), sum(sev='H'), group_concat(DISTINCT rule), min(id) FROM errors`; })();
function refreshErrDoc(db, docs) { // sau khi đổi trạng thái: tính lại các chứng từ liên quan
  const del = db.prepare('DELETE FROM err_doc WHERE doc=?'), ins = db.prepare(`INSERT INTO err_doc ${ERR_DOC_SEL} WHERE doc=? GROUP BY 1,2,3,4,5,6`);
  for (const d of docs) { del.run(d ?? ''); ins.run(d); }
}
function rebuildErrSum(db, from = '', to = '') { // from/to: chỉ dựng lại các tháng trong kỳ vừa phân tích
  const ok = v => /^\d{4}-\d{2}$/.test(v || '') ? v : '', f = ok(from), t = ok(to);
  const W = (f ? ` AND ym>='${f}'` : '') + (t ? ` AND ym<='${t}'` : '');
  db.exec(`BEGIN; DELETE FROM err_sum WHERE 1${W}; DELETE FROM err_ent WHERE 1${W};
    INSERT INTO err_sum SELECT ifnull(ym,''), rule, sev, coalesce(st,'open'), ifnull(u,''), ifnull(dept,''), count(*) FROM errors WHERE 1${W} GROUP BY 1,2,3,4,5,6;
    INSERT INTO err_ent SELECT ym, u, count(*), sum(hm) FROM (SELECT ifnull(ym,'') ym, ifnull(u,'') u, entry_id, max(sev IN ('H','M')) hm FROM errors WHERE 1${W} GROUP BY entry_id) GROUP BY 1,2;
    DELETE FROM err_doc WHERE 1${W}; INSERT INTO err_doc ${ERR_DOC_SEL} WHERE 1${W} GROUP BY 1,2,3,4,5,6;
    INSERT INTO settings(k,v) VALUES('err_sum_n',(SELECT count(*) FROM errors)) ON CONFLICT(k) DO UPDATE SET v=excluded.v; COMMIT;`);
}
function syncErrSum(db) {
  const es = db.prepare(`SELECT (SELECT v FROM settings WHERE k='err_sum_n') v, (SELECT count(*) FROM errors) n`).get();
  if (String(es.v) !== String(es.n) || (es.n > 0 && !db.prepare('SELECT 1 FROM err_doc LIMIT 1').get())) rebuildErrSum(db);
}
function fillErrCols(db) {
  if (!db.prepare('SELECT 1 FROM errors WHERE ym IS NULL OR st IS NULL LIMIT 1').get()) return 0;
  db.exec(`UPDATE errors SET ym=e.ym, u=e.created_by, dept=e.department, doc=e.document_no FROM entries e WHERE e.id=errors.entry_id AND errors.ym IS NULL;
    UPDATE errors SET st=coalesce((SELECT nullif(r.status,'') FROM reviews r WHERE r.err_key=errors.err_key),'open') WHERE st IS NULL;`);
  return 1;
}
// Chỉ mục của bảng lỗi: gỡ ra khi xoá/chèn hàng loạt (phân tích lại) rồi dựng lại một lần – nhanh hơn nhiều so với cập nhật từng dòng
const ERR_IDX = [['ix_err_entry', 'errors(entry_id)'], ['ix_err_rule', 'errors(rule)'], ['ix_err_key', 'errors(err_key)'],
  ['ix_err_cov', 'errors(ym, rule, sev, st, u, doc, entry_id)'], ['ix_err_u', 'errors(u, ym)'], ['ix_err_doc', 'errors(doc)']];
const dropErrIndexes = db => { for (const [n] of ERR_IDX) db.exec(`DROP INDEX IF EXISTS ${n}`); };
const createErrIndexes = db => { for (const [n, d] of ERR_IDX) db.exec(`CREATE INDEX IF NOT EXISTS ${n} ON ${d}`); };
function open(file, { cleanup = false, light = false } = {}) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=60000; PRAGMA cache_size=-200000;`);
  if (light) return { db, needRecheck: false }; // luồng phụ chỉ đọc (quét quy tắc song song): không chạy nâng cấp/tạo chỉ mục
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY, file_name TEXT NOT NULL, file_hash TEXT, row_count INTEGER,
      date_from TEXT, date_to TEXT, imported_at TEXT DEFAULT (datetime('now','localtime')), status TEXT DEFAULT 'ok');
    CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      ${COLS.map(c => c[1] + ' ' + c[2]).join(', ')});
    CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      rule TEXT, sev TEXT, msg TEXT, err_key TEXT);
    CREATE TABLE IF NOT EXISTS months(ym TEXT PRIMARY KEY, included INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS mail_log(id INTEGER PRIMARY KEY, sent_at TEXT DEFAULT (datetime('now','localtime')), employee TEXT,
      to_addr TEXT, subject TEXT, error_count INTEGER, status TEXT, info TEXT);
    CREATE TABLE IF NOT EXISTS reviews(err_key TEXT PRIMARY KEY, rule TEXT, document_no TEXT, status TEXT, note TEXT,
      snapshot TEXT, updated_at TEXT DEFAULT (datetime('now','localtime')));`);
  // Nâng cấp CSDL từ phiên bản 1.x (chưa có cột ym, chưa có bảng errors)
  const cols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
  let needRecheck = false;
  if (!cols.includes('ym')) {
    db.exec(`ALTER TABLE entries ADD COLUMN ym TEXT; UPDATE entries SET ym=substr(account_date,1,7);
      INSERT OR IGNORE INTO months(ym) SELECT DISTINCT ym FROM entries WHERE ym IS NOT NULL;`);
    needRecheck = true;
  }
  if (!db.prepare('PRAGMA table_info(imports)').all().some(c => c.name === 'status')) db.exec(`ALTER TABLE imports ADD COLUMN status TEXT DEFAULT 'ok'`);
  // v2.4: thêm cột mặt hàng / ĐVT / kho; schema=2 đánh dấu lần nạp có các cột này
  const ecols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
  for (const [, col, type] of COLS) if (!ecols.includes(col)) db.exec(`ALTER TABLE entries ADD COLUMN ${col} ${type}`);
  // v2.5: đánh dấu tháng đã phân tích theo phiên bản bộ quy tắc nào (NULL = chưa phân tích)
  if (!db.prepare('PRAGMA table_info(months)').all().some(c => c.name === 'analyzed_ver')) {
    db.exec(`ALTER TABLE months ADD COLUMN analyzed_ver INTEGER`);
    const v = db.prepare(`SELECT v FROM settings WHERE k='rules_version'`).get()?.v;
    if (v && !needRecheck) db.prepare('UPDATE months SET analyzed_ver=?').run(+v);
  }
  if (!db.prepare('PRAGMA table_info(entries)').all().some(c => c.name === 'enriched')) db.exec(`ALTER TABLE entries ADD COLUMN enriched INTEGER`);
  if (!db.prepare('PRAGMA table_info(imports)').all().some(c => c.name === 'schema')) db.exec(`ALTER TABLE imports ADD COLUMN schema INTEGER DEFAULT 1`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_e_import ON entries(import_id);
    CREATE INDEX IF NOT EXISTS ix_e_ym ON entries(ym);
    CREATE INDEX IF NOT EXISTS ix_e_ym_imp ON entries(ym, import_id);
    CREATE INDEX IF NOT EXISTS ix_e_dup ON entries(acc_debit, acc_credit, amount);
    CREATE INDEX IF NOT EXISTS ix_e_doc ON entries(document_no);
    CREATE INDEX IF NOT EXISTS ix_e_docline ON entries(document_no, line_no);
    CREATE INDEX IF NOT EXISTS ix_e_user ON entries(created_by);
    CREATE INDEX IF NOT EXISTS ix_err_entry ON errors(entry_id);
    CREATE TABLE IF NOT EXISTS ent_sum(ym TEXT, u TEXT, n INTEGER, nx INTEGER, docs INTEGER, dmin TEXT, dmax TEXT, PRIMARY KEY(ym, u)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS err_sum(ym TEXT, rule TEXT, sev TEXT, st TEXT, u TEXT, dept TEXT, n INTEGER, PRIMARY KEY(ym, rule, sev, st, u, dept)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS err_doc(doc TEXT, ym TEXT, u TEXT, dept TEXT, st TEXT, g TEXT, n INTEGER, high INTEGER, rules TEXT, eid INTEGER, PRIMARY KEY(doc, ym, u, dept, st, g)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS ix_errdoc_ym ON err_doc(ym);
    CREATE TABLE IF NOT EXISTS err_ent(ym TEXT, u TEXT, n INTEGER, nhm INTEGER, PRIMARY KEY(ym, u)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS fin_mv(ym TEXT, acc TEXT, name TEXT, dr REAL, cr REAL);
    CREATE INDEX IF NOT EXISTS ix_finmv ON fin_mv(ym, acc);
    CREATE TABLE IF NOT EXISTS fin_pmv(ym TEXT, a3 TEXT, p TEXT, v REAL);
    CREATE INDEX IF NOT EXISTS ix_finpmv ON fin_pmv(ym, a3);
    CREATE TABLE IF NOT EXISTS fin_close(ym TEXT, acc TEXT, ob REAL, dr REAL, cr REAL, cb REAL, PRIMARY KEY(ym, acc)) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS agg(ym TEXT, side TEXT, acc TEXT, acc_name TEXT, dept TEXT, tcost TEXT, trev TEXT, amount REAL, n INTEGER);
    CREATE INDEX IF NOT EXISTS ix_agg_ym ON agg(ym);
    CREATE INDEX IF NOT EXISTS ix_e_accd ON entries(acc_debit);
    CREATE INDEX IF NOT EXISTS ix_e_accc ON entries(acc_credit);
    CREATE INDEX IF NOT EXISTS ix_err_rule ON errors(rule);
    CREATE INDEX IF NOT EXISTS ix_err_key ON errors(err_key);`);
  // v3.9: ghi sẵn tháng / người nhập / bộ phận / chứng từ / trạng thái vào bảng lỗi → đếm, lọc lỗi không phải nối với bảng entries (1,5 triệu dòng)
  const xcols = db.prepare('PRAGMA table_info(errors)').all().map(c => c.name);
  for (const c of ['ym', 'u', 'dept', 'doc', 'st']) if (!xcols.includes(c)) db.exec(`ALTER TABLE errors ADD COLUMN ${c} TEXT`);
  db.exec(`DROP INDEX IF EXISTS ix_err_ym;`);
  fillErrCols(db); createErrIndexes(db);
  // bảng đếm lỗi / bút toán (err_sum, ent_sum) được dựng ở tác vụ nền buildAgg khi khởi động nếu còn thiếu – không khoá cửa sổ
  // Lần nạp bị gián đoạn (tắt máy giữa chừng) thì xoá – chỉ làm khi ứng dụng khởi động
  if (cleanup) db.exec(`DELETE FROM imports WHERE status='pending'`);
  return { db, needRecheck };
}

// Chuyển dòng đọc từ CSDL về đối tượng dùng cho quy tắc (ngày dạng Date)
const isoToDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function rowFromDb(r) { return { ...r, date: isoToDate(r.date), due: isoToDate(r.due) }; }

// Bảng tổng hợp sẵn cho báo cáo KQKD / doanh thu – chi phí: phát sinh TK loại 5–8 theo tháng × phía × TK × bộ phận × khoản mục (đã loại kết chuyển 911)
function rebuildAgg(db, months = null) {
  const IN = months ? ` AND ym IN (${months.map(m => `'${String(m).replace(/'/g, '')}'`).join(',')})` : '';
  db.exec('BEGIN');
  db.exec(`DELETE FROM agg WHERE 1${IN}`);
  for (const [side, col] of [['dr', 'debit'], ['cr', 'credit']])
    db.exec(`INSERT INTO agg SELECT ym, '${side}', acc_${col}, acc_${col}_name, department, type_of_cost, type_of_revenue, sum(amount), count(*) FROM entries
      WHERE substr(acc_${col},1,1) IN ('5','6','7','8') AND ifnull(source_table,'')<>'OPENING_BALANCE' AND acc_debit NOT LIKE '911%' AND acc_credit NOT LIKE '911%' AND ym IS NOT NULL${IN}
      GROUP BY ym, acc_${col}, acc_${col}_name, department, type_of_cost, type_of_revenue`);
  db.exec('COMMIT');
  rebuildFin(db, months);
  // Đếm bút toán theo tháng × người nhập (Tổng quan, Chấm điểm nhân viên không phải đếm hàng triệu dòng)
  db.exec(`BEGIN; DELETE FROM ent_sum WHERE 1${IN};
    INSERT INTO ent_sum SELECT ym, ifnull(created_by,''), count(*), sum(ifnull(source_table,'')<>'OPENING_BALANCE'), count(DISTINCT document_no), min(account_date), max(account_date)
      FROM entries WHERE ym IS NOT NULL${IN} GROUP BY 1,2; COMMIT;`);
  syncErrSum(db);
}

/* Sổ số dư tổng hợp cho báo cáo tài chính (khoá sổ theo tháng):
   fin_mv   – phát sinh Nợ/Có theo tháng × TK chi tiết (vài nghìn dòng thay cho hàng triệu bút toán)
   fin_pmv  – phát sinh ròng theo tháng × TK công nợ (3 số) × đối tượng (tách dư Nợ/Có trên B01, top đối tượng trên B09)
   fin_close – số dư đầu kỳ / phát sinh / cuối kỳ từng tháng (luỹ kế từ tháng đầu tiên) → số dư đầu kỳ của bất kỳ tháng nào đọc thẳng, không cộng lại lịch sử.
   Cập nhật cùng bảng agg mỗi khi nạp / xoá dữ liệu: chỉ tính lại phát sinh của các tháng thay đổi, rồi cộng dồn lại số dư (rất nhanh). */
const FIN_PS = ['131', '331', '138', '338', '141', '136', '336'];
function rebuildFin(db, months = null) {
  const IN = months ? ` AND ym IN (${months.map(m => `'${String(m).replace(/'/g, '')}'`).join(',')})` : '';
  db.exec('BEGIN');
  db.exec(`DELETE FROM fin_mv WHERE 1${IN}; DELETE FROM fin_pmv WHERE 1${IN};`);
  db.exec(`INSERT INTO fin_mv SELECT ym, acc_debit, max(acc_debit_name), sum(amount), 0 FROM entries WHERE ym IS NOT NULL AND ifnull(acc_debit,'')<>''${IN} GROUP BY ym, acc_debit;
    INSERT INTO fin_mv SELECT ym, acc_credit, max(acc_credit_name), 0, sum(amount) FROM entries WHERE ym IS NOT NULL AND ifnull(acc_credit,'')<>''${IN} GROUP BY ym, acc_credit;`);
  const ps = FIN_PS.map(a => `'${a}'`).join(',');
  db.exec(`INSERT INTO fin_pmv SELECT ym, substr(acc_debit,1,3), coalesce(partner_debit,'(không đối tượng)'), sum(amount) FROM entries WHERE substr(acc_debit,1,3) IN (${ps}) AND ym IS NOT NULL${IN} GROUP BY 1,2,3;
    INSERT INTO fin_pmv SELECT ym, substr(acc_credit,1,3), coalesce(partner_credit,'(không đối tượng)'), -sum(amount) FROM entries WHERE substr(acc_credit,1,3) IN (${ps}) AND ym IS NOT NULL${IN} GROUP BY 1,2,3;`);
  // Cộng dồn số dư theo tháng (cả tháng không phát sinh vẫn có dòng số dư để đọc đầu kỳ trực tiếp)
  const mv = db.prepare(`SELECT ym, acc, sum(dr) dr, sum(cr) cr FROM fin_mv GROUP BY ym, acc ORDER BY ym`).all();
  const yms = [...new Set(mv.map(r => r.ym))].sort();
  db.exec('DELETE FROM fin_close');
  if (yms.length) {
    const all = []; let [y, m] = yms[0].split('-').map(Number); const last = yms.at(-1);
    for (;;) { const k = `${y}-${String(m).padStart(2, '0')}`; all.push(k); if (k >= last) break; m++; if (m > 12) { m = 1; y++; } }
    const by = new Map(); for (const r of mv) (by.get(r.ym) || by.set(r.ym, []).get(r.ym)).push(r);
    const bal = new Map(), ins = db.prepare('INSERT INTO fin_close VALUES(?,?,?,?,?,?)');
    for (const ym of all) {
      const cur = new Map(); for (const r of by.get(ym) || []) cur.set(r.acc, r);
      for (const acc of new Set([...bal.keys(), ...cur.keys()])) {
        const ob = bal.get(acc) || 0, r = cur.get(acc), dr = r ? r.dr : 0, cr = r ? r.cr : 0, cb = ob + dr - cr;
        if (Math.abs(ob) < 0.005 && !r) continue;
        ins.run(ym, acc, ob, dr, cr, cb); bal.set(acc, cb);
      }
    }
  }
  db.prepare(`INSERT INTO settings(k,v) VALUES('fin_built', datetime('now','localtime')) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run();
  db.exec('COMMIT');
}
module.exports = { refreshErrDoc, syncErrSum, rebuildErrSum, rebuildFin, FIN_PS, fillErrCols, dropErrIndexes, createErrIndexes, rebuildAgg, open, COLS, SEL_ENTRY, rowFromDb, isoToDate };
