// Lưu trữ SQLite (sql.js – SQLite biên dịch WebAssembly, không cần build native)
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// Ánh xạ trường dữ liệu chuẩn hoá trong giao diện -> cột SQLite
const COLS = [
  ['line', 'line_no', 'INTEGER'], ['doc', 'document_no', 'TEXT'], ['date', 'account_date', 'TEXT'], ['due', 'due_date', 'TEXT'],
  ['dr', 'acc_debit', 'TEXT'], ['cr', 'acc_credit', 'TEXT'], ['drName', 'acc_debit_name', 'TEXT'], ['crName', 'acc_credit_name', 'TEXT'],
  ['amt', 'amount', 'REAL'], ['qty', 'quantity', 'REAL'], ['price', 'unit_price', 'REAL'],
  ['bp', 'partner_debit', 'TEXT'], ['bpCr', 'partner_credit', 'TEXT'], ['desc', 'description', 'TEXT'], ['descP', 'description_parent', 'TEXT'],
  ['dept', 'department', 'TEXT'], ['deptSub', 'department_sub', 'TEXT'], ['table', 'source_table', 'TEXT'],
  ['tcost', 'type_of_cost', 'TEXT'], ['trev', 'type_of_revenue', 'TEXT'], ['inv', 'invoice', 'TEXT'], ['adv', 'advance_request', 'TEXT'],
  ['contract', 'contract', 'TEXT'], ['user', 'created_by', 'TEXT'], ['updUser', 'updated_by', 'TEXT'], ['cf', 'cashflow', 'TEXT'], ['bts', 'bts_site', 'TEXT'],
];

class Store {
  static async open(file) {
    const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f) });
    const s = new Store();
    s.file = file;
    s.db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    s.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY, file_name TEXT NOT NULL, file_hash TEXT UNIQUE,
        row_count INTEGER, date_from TEXT, date_to TEXT, imported_at TEXT DEFAULT (datetime('now','localtime')));
      CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        ${COLS.map(c => c[1] + ' ' + c[2]).join(', ')});
      CREATE INDEX IF NOT EXISTS ix_entries_date ON entries(account_date);
      CREATE INDEX IF NOT EXISTS ix_entries_import ON entries(import_id);`);
    s.save();
    return s;
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }
  importRows(fileName, hash, rows, replace) {
    // Chống trùng theo tháng: tháng đã có dữ liệu thì phải xoá (thay thế) trước khi nạp
    const months = [...new Set(rows.map(r => r.date && r.date.slice(0, 7)).filter(Boolean))];
    const exist = months.filter(m => this.monthRows(m) > 0);
    if (exist.length && !replace) return { ok: false, conflict: exist };
    exist.forEach(m => this.deleteMonth(m, false));
    this.db.run('DELETE FROM imports WHERE file_hash=?', [hash]);
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    this.db.run('BEGIN');
    try {
      this.db.run('INSERT INTO imports(file_name,file_hash,row_count,date_from,date_to) VALUES(?,?,?,?,?)',
        [fileName, hash, rows.length, dates[0] || null, dates.at(-1) || null]);
      const id = this.db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      const st = this.db.prepare(`INSERT INTO entries(import_id,${COLS.map(c => c[1]).join(',')}) VALUES(?${',?'.repeat(COLS.length)})`);
      for (const r of rows) st.run([id, ...COLS.map(([k]) => r[k] ?? null)]);
      st.free();
      this.db.run('COMMIT');
    } catch (e) { this.db.run('ROLLBACK'); throw e; }
    this.save();
    return { ok: true };
  }
  loadAll() {
    const st = this.db.prepare(`SELECT i.file_name,${COLS.map(c => 'e.' + c[1]).join(',')} FROM entries e JOIN imports i ON i.id=e.import_id ORDER BY e.id`);
    const out = [];
    while (st.step()) {
      const v = st.get(), r = { file: v[0] };
      COLS.forEach(([k], i) => { r[k] = v[i + 1]; });
      out.push(r);
    }
    st.free();
    return out;
  }
  listImports() {
    const res = this.db.exec('SELECT id,file_name,row_count,date_from,date_to,imported_at FROM imports ORDER BY date_from, id');
    return res.length ? res[0].values.map(([id, file, rows, from, to, at]) => ({ id, file, rows, from, to, at })) : [];
  }
  monthRows(ym) {
    return this.db.exec('SELECT count(*) FROM entries WHERE substr(account_date,1,7)=?', [ym])[0].values[0][0];
  }
  listMonths() {
    const res = this.db.exec(`SELECT substr(e.account_date,1,7) ym, count(*), group_concat(DISTINCT i.file_name)
      FROM entries e JOIN imports i ON i.id=e.import_id WHERE e.account_date IS NOT NULL GROUP BY ym ORDER BY ym`);
    return res.length ? res[0].values.map(([ym, rows, files]) => ({ ym, rows, files })) : [];
  }
  deleteMonth(ym, save = true) {
    this.db.run('DELETE FROM entries WHERE substr(account_date,1,7)=?', [ym]);
    // Cập nhật lại các lần nạp bị ảnh hưởng; lần nạp không còn dòng nào thì xoá
    this.db.run(`UPDATE imports SET row_count=(SELECT count(*) FROM entries WHERE import_id=imports.id),
      date_from=(SELECT min(account_date) FROM entries WHERE import_id=imports.id),
      date_to=(SELECT max(account_date) FROM entries WHERE import_id=imports.id)`);
    this.db.run('DELETE FROM imports WHERE row_count=0');
    if (save) this.save();
  }
  deleteImport(id) { this.db.run('DELETE FROM imports WHERE id=?', [id]); this.save(); }
  clear() { this.db.run('DELETE FROM imports'); this.db.run('VACUUM'); this.save(); }
}
module.exports = { Store };
