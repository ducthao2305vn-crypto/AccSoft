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
];
const SEL_ENTRY = 'e.id, e.ym, (SELECT schema FROM imports i WHERE i.id=e.import_id) AS _schema, ' + COLS.map(c => 'e.' + c[1] + ' AS "' + c[0] + '"').join(', ');

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
  if (!db.prepare('PRAGMA table_info(imports)').all().some(c => c.name === 'schema')) db.exec(`ALTER TABLE imports ADD COLUMN schema INTEGER DEFAULT 1`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_e_import ON entries(import_id);
    CREATE INDEX IF NOT EXISTS ix_e_ym ON entries(ym);
    CREATE INDEX IF NOT EXISTS ix_e_doc ON entries(document_no);
    CREATE INDEX IF NOT EXISTS ix_e_user ON entries(created_by);
    CREATE INDEX IF NOT EXISTS ix_err_entry ON errors(entry_id);
    CREATE INDEX IF NOT EXISTS ix_err_rule ON errors(rule);
    CREATE INDEX IF NOT EXISTS ix_err_key ON errors(err_key);`);
  // Lần nạp bị gián đoạn (tắt máy giữa chừng) thì xoá – chỉ làm khi ứng dụng khởi động
  if (cleanup) db.exec(`DELETE FROM imports WHERE status='pending'`);
  return { db, needRecheck };
}

// Chuyển dòng đọc từ CSDL về đối tượng dùng cho quy tắc (ngày dạng Date)
const isoToDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function rowFromDb(r) { return { ...r, date: isoToDate(r.date), due: isoToDate(r.due) }; }

module.exports = { open, COLS, SEL_ENTRY, rowFromDb, isoToDate };
