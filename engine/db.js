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

function open(file, { cleanup = false } = {}) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=60000; PRAGMA cache_size=-200000;`);
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
    CREATE INDEX IF NOT EXISTS ix_e_doc ON entries(document_no);
    CREATE INDEX IF NOT EXISTS ix_e_docline ON entries(document_no, line_no);
    CREATE INDEX IF NOT EXISTS ix_e_user ON entries(created_by);
    CREATE INDEX IF NOT EXISTS ix_err_entry ON errors(entry_id);
    CREATE TABLE IF NOT EXISTS agg(ym TEXT, side TEXT, acc TEXT, acc_name TEXT, dept TEXT, tcost TEXT, trev TEXT, amount REAL, n INTEGER);
    CREATE INDEX IF NOT EXISTS ix_agg_ym ON agg(ym);
    CREATE INDEX IF NOT EXISTS ix_e_accd ON entries(acc_debit);
    CREATE INDEX IF NOT EXISTS ix_e_accc ON entries(acc_credit);
    CREATE INDEX IF NOT EXISTS ix_err_rule ON errors(rule);
    CREATE INDEX IF NOT EXISTS ix_err_key ON errors(err_key);`);
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
}
module.exports = { rebuildAgg, open, COLS, SEL_ENTRY, rowFromDb, isoToDate };
