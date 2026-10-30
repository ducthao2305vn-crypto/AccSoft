'use strict';
// Tiến trình nền: mọi thao tác ghi nặng (nạp file, xoá tháng, tính lại lỗi) chạy ở đây để giao diện không bị treo
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { open, COLS, SEL_ENTRY, rowFromDb } = require('./db');
const { checkRow, errKey, code, fmt2 } = require('./rules');

const { db } = open(workerData.dbPath);
const post = m => parentPort.postMessage(m);
const BATCH = 5000;

/* ---------- Chuẩn hoá giá trị ô ---------- */
function cell(v) {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return cell(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v === '' ? null : v;
}
const pad = n => String(n).padStart(2, '0');
function isoDate(v) {
  v = cell(v);
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const num = v => { v = cell(v); if (v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
const str = v => { v = cell(v); return v == null ? null : v instanceof Date ? isoDate(v) : String(v); };

// Cột nguồn (tiêu đề file ERP) -> trường chuẩn hoá. Tiêu đề trùng tên: lấy cột xuất hiện đầu tiên.
const SRC = {
  line: ['Line No', num], doc: ['Document No', str], date: ['Account Date', isoDate], due: ['Due Date', isoDate],
  drName: ['Account', str], crName: ['Account credit', str], amt: ['Accounted Amount', num], qty: ['Quantity', num], price: ['Unit Price', num],
  bp: ['Business Partner', str], bpCr: ['Bpartner credit', str], desc: ['Description', str], descP: ['DescriptionParent', str],
  dept: ['Department', str], deptSub: ['Department Sub', str], table: ['Table', str], tcost: ['Type of cost', str],
  trev: ['Type of revenue ERP', str], trev2: ['Type of revenue BCCS', str], inv: ['Invoice', str], adv: ['Advance Request', str],
  contract: ['Contract', str], user: ['Created By', str], updUser: ['Updated By', str], cf: ['Cashflow activities', str], bts: ['BTS Site', str],
};
function headerMap(header) {
  const idx = {};
  header.forEach((h, i) => { const k = String(h ?? '').trim(); if (k && !(k in idx)) idx[k] = i; });
  if (!('Account' in idx) || !('Accounted Amount' in idx)) return null;
  return Object.fromEntries(Object.entries(SRC).map(([k, [h, fn]]) => [k, [idx[h], fn]]));
}
function normalize(vals, map) {
  const r = {};
  for (const k in map) { const [i, fn] = map[k]; r[k] = i == null ? null : fn(vals[i]); }
  r.trev = r.trev || r.trev2; delete r.trev2;
  r.amt = r.amt ?? 0; r.desc = r.desc ?? ''; r.user = r.user || '(không rõ)';
  r.dr = code(r.drName); r.cr = code(r.crName);
  return r;
}

/* ---------- Ghi CSDL ---------- */
const insEntry = db.prepare(`INSERT INTO entries(import_id, ym, ${COLS.map(c => c[1]).join(',')}) VALUES(?,?${',?'.repeat(COLS.length)})`);
const insErr = db.prepare('INSERT INTO errors(entry_id, rule, sev, msg, err_key) VALUES(?,?,?,?,?)');
const toDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function writeRow(importId, r) {
  const { lastInsertRowid: id } = insEntry.run(importId, r.date ? r.date.slice(0, 7) : null, ...COLS.map(([k]) => r[k] ?? null));
  const rr = { ...r, date: toDate(r.date), due: toDate(r.due) };
  for (const e of checkRow(rr)) insErr.run(id, e.k, e.s, e.msg, errKey(e.k, rr));
}

/* ---------- Đọc file dạng luồng ---------- */
async function* xlsxRows(file, onBytes) {
  const ExcelJS = require('exceljs');
  const input = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  input.on('data', b => onBytes(b.length));
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(input, { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit', entries: 'emit' });
  for await (const ws of wb) for await (const row of ws) yield row.values.slice(1); // exceljs đánh số cột từ 1
}
async function* csvRows(file, onBytes) {
  const { parse } = require('csv-parse');
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(65536); // chỉ đọc phần đầu để đoán dấu phân cách
  const head = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).toString('utf8').split(/\r?\n/)[0] || ''; fs.closeSync(fd);
  const delimiter = [',', ';', '\t', '|'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const input = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  input.on('data', b => onBytes(b.length));
  yield* input.pipe(parse({ delimiter, bom: true, relax_quotes: true, relax_column_count: true }));
}

async function importFile({ file, name }) {
  const size = fs.statSync(file).size;
  const hash = `${name}|${size}|${fs.statSync(file).mtimeMs}`;
  const { lastInsertRowid: importId } = db.prepare(`INSERT INTO imports(file_name,file_hash,status) VALUES(?,?,'pending')`).run(name, hash);
  let read = 0, n = 0, map = null, sheetOk = false, t0 = Date.now(), lastPost = 0;
  const rows = /\.csv$|\.txt$/i.test(name) ? csvRows(file, b => read += b) : xlsxRows(file, b => read += b);
  db.exec('BEGIN');
  try {
    for await (const vals of rows) {
      if (!map) { map = headerMap(vals); if (map) sheetOk = true; continue; } // dòng tiêu đề (mỗi sheet)
      if (vals.every(v => v == null || v === '')) continue;
      writeRow(importId, normalize(vals, map));
      if (++n % BATCH === 0) {
        db.exec('COMMIT'); db.exec('BEGIN');
        if (Date.now() - lastPost > 400) { lastPost = Date.now(); post({ type: 'progress', rows: n, pct: Math.min(99, read / size * 100), secs: (Date.now() - t0) / 1000 }); }
      }
    }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} db.prepare('DELETE FROM imports WHERE id=?').run(importId); throw e; }
  if (!sheetOk || !n) { db.prepare('DELETE FROM imports WHERE id=?').run(importId); throw new Error('Không đúng định dạng file hạch toán (thiếu cột Account / Accounted Amount) hoặc file trống.'); }
  const months = db.prepare('SELECT DISTINCT ym FROM entries WHERE import_id=? AND ym IS NOT NULL ORDER BY ym').all(importId).map(r => r.ym);
  const conflicts = months.filter(m => db.prepare(`SELECT 1 FROM entries e JOIN imports i ON i.id=e.import_id WHERE e.ym=? AND i.status='ok' LIMIT 1`).get(m));
  return { importId: Number(importId), rows: n, months, conflicts, secs: (Date.now() - t0) / 1000 };
}

function refreshImports() {
  db.exec(`UPDATE imports SET row_count=(SELECT count(*) FROM entries WHERE import_id=imports.id),
      date_from=(SELECT min(account_date) FROM entries WHERE import_id=imports.id),
      date_to=(SELECT max(account_date) FROM entries WHERE import_id=imports.id) WHERE status='ok';
    DELETE FROM imports WHERE status='ok' AND row_count=0;
    DELETE FROM months WHERE ym NOT IN (SELECT DISTINCT ym FROM entries WHERE ym IS NOT NULL);
    INSERT OR IGNORE INTO months(ym) SELECT DISTINCT ym FROM entries WHERE ym IS NOT NULL;`);
}
function deleteMonths(months, exceptImport = -1) {
  for (const m of months) {
    post({ type: 'progress', label: 'Đang xoá dữ liệu tháng ' + m });
    db.exec('BEGIN');
    db.prepare('DELETE FROM errors WHERE entry_id IN (SELECT id FROM entries WHERE ym=? AND import_id<>?)').run(m, exceptImport);
    db.prepare('DELETE FROM entries WHERE ym=? AND import_id<>?').run(m, exceptImport);
    db.exec('COMMIT');
  }
}

/* ---------- Quy tắc toàn cục (trùng lặp, bất thường) ---------- */
function setRules() {
  post({ type: 'progress', label: 'Đang tìm bút toán trùng lặp và số tiền bất thường…' });
  db.exec('BEGIN');
  db.exec(`DELETE FROM errors WHERE rule IN ('DUPLICATE','OUTLIER')`);
  const keyOf = (k, r) => errKey(k, { doc: r.doc, line: r.line, dr: r.dr, cr: r.cr, amt: r.amt });
  const F = (t = '') => `${t}amount<>0 AND ifnull(${t}source_table,'') NOT LIKE '%Depreciation%' AND ifnull(${t}source_table,'') NOT LIKE '%Distribution%' AND ifnull(${t}source_table,'') NOT LIKE '%CIP%'`;
  db.exec(`DROP TABLE IF EXISTS temp.dg;
    CREATE TEMP TABLE dg AS SELECT acc_debit a, acc_credit b, ifnull(partner_debit,'') p, ifnull(partner_credit,'') q, amount m, lower(trim(ifnull(description,''))) d
      FROM entries WHERE ${F()} GROUP BY 1,2,3,4,5,6 HAVING count(DISTINCT document_no)>1;
    CREATE INDEX temp.ix_dg ON dg(a,b,m);`);
  const dups = db.prepare(`SELECT e.id, e.document_no doc, e.line_no line, e.acc_debit dr, e.acc_credit cr, e.amount amt, dg.rowid grp
    FROM entries e JOIN dg ON dg.a=e.acc_debit AND dg.b=e.acc_credit AND dg.m=e.amount AND dg.p=ifnull(e.partner_debit,'')
      AND dg.q=ifnull(e.partner_credit,'') AND dg.d=lower(trim(ifnull(e.description,''))) WHERE ${F('e.')}`).all();
  const groups = new Map();
  for (const r of dups) (groups.get(r.grp) || groups.set(r.grp, []).get(r.grp)).push(r);
  for (const arr of groups.values()) {
    const docs = [...new Set(arr.map(x => x.doc))];
    for (const r of arr) insErr.run(r.id, 'DUPLICATE', 'H', `${docs.length} chứng từ: ${docs.slice(0, 4).join(', ')}`, keyOf('DUPLICATE', r));
  }
  const EXP = `substr(acc_debit,1,1) IN ('6','8') AND acc_debit NOT LIKE '911%' AND type_of_cost IS NOT NULL AND amount>0`;
  for (const { t } of db.prepare(`SELECT type_of_cost t FROM entries WHERE ${EXP} GROUP BY type_of_cost HAVING count(*)>=10`).all()) {
    const c = db.prepare(`SELECT count(*) n FROM entries WHERE ${EXP} AND type_of_cost=?`).get(t).n;
    const med = db.prepare(`SELECT amount FROM entries WHERE ${EXP} AND type_of_cost=? ORDER BY amount LIMIT 1 OFFSET ?`).get(t, c >> 1).amount;
    for (const r of db.prepare(`SELECT id, document_no doc, line_no line, acc_debit dr, acc_credit cr, amount amt FROM entries WHERE ${EXP} AND type_of_cost=? AND amount>? AND amount>100`).all(t, 10 * med))
      insErr.run(r.id, 'OUTLIER', 'M', `${fmt2(r.amt)} so với trung vị ${fmt2(med)}`, keyOf('OUTLIER', r));
  }
  db.exec('COMMIT');
}

/* ---------- Kiểm tra lại toàn bộ (khi nâng cấp / thay đổi quy tắc) ---------- */
function recheck() {
  const total = db.prepare('SELECT count(*) n FROM entries').get().n;
  db.exec(`DELETE FROM errors`);
  const page = db.prepare(`SELECT ${SEL_ENTRY} FROM entries e WHERE e.id>? ORDER BY e.id LIMIT ${BATCH}`);
  let last = 0, done = 0;
  for (;;) {
    const rows = page.all(last);
    if (!rows.length) break;
    db.exec('BEGIN');
    for (const raw of rows) {
      const r = rowFromDb(raw);
      for (const e of checkRow(r)) insErr.run(raw.id, e.k, e.s, e.msg, errKey(e.k, r));
    }
    db.exec('COMMIT');
    last = rows.at(-1).id; done += rows.length;
    post({ type: 'progress', label: 'Đang kiểm tra lại dữ liệu', rows: done, pct: done / total * 100 });
  }
  setRules();
}

/* ---------- Điều phối ---------- */
const TASKS = {
  import: importFile,
  finalize({ importId, replace }) {
    const months = db.prepare('SELECT DISTINCT ym FROM entries WHERE import_id=? AND ym IS NOT NULL').all(importId).map(r => r.ym);
    if (replace) deleteMonths(months, importId);
    db.prepare(`UPDATE imports SET status='ok' WHERE id=?`).run(importId);
    refreshImports(); setRules();
    db.exec('PRAGMA optimize');
    return { months };
  },
  cancel({ importId }) { post({ type: 'progress', label: 'Đang huỷ lần nạp…' }); db.prepare('DELETE FROM imports WHERE id=?').run(importId); refreshImports(); return {}; },
  deleteMonth({ ym }) { deleteMonths([ym]); refreshImports(); setRules(); return {}; },
  deleteImport({ id }) { post({ type: 'progress', label: 'Đang xoá lần nạp…' }); db.prepare('DELETE FROM imports WHERE id=?').run(id); refreshImports(); setRules(); return {}; },
  clear() { post({ type: 'progress', label: 'Đang xoá toàn bộ dữ liệu…' }); db.exec(`DELETE FROM errors; DELETE FROM entries; DELETE FROM imports; DELETE FROM months;`); db.exec('VACUUM'); return {}; },
  recheck() { recheck(); return {}; },
};
(async () => {
  try { post({ type: 'done', result: await TASKS[workerData.task](workerData.args || {}) }); }
  catch (e) { post({ type: 'error', error: String(e && e.message || e), stack: String(e && e.stack || e) }); }
  finally { db.close(); }
})();
