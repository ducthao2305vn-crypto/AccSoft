'use strict';
// Tiến trình nền: mọi thao tác ghi nặng (nạp file, xoá tháng, tính lại lỗi) chạy ở đây để giao diện không bị treo
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { open, COLS, SEL_ENTRY, rowFromDb, rebuildAgg, dropErrIndexes, createErrIndexes } = require('./db');
const os = require('os');
const { Worker } = require('worker_threads');
const { checkRow, errKey, code, fmt2, RULES_VERSION, setConfig, CFG } = require('./rules');

const { db } = open(workerData.dbPath, { light: workerData.task === 'scan' });
const post = m => parentPort.postMessage(m);
try { setConfig(JSON.parse(db.prepare(`SELECT v FROM settings WHERE k='thresholds'`).get()?.v || '{}')); } catch (e) { /* dùng mặc định */ }
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
  product: ['Product', str], uom: ['UOM', str], loc: ['Locator', str], locCr: ['Locator Credit', str],
  distFrom: ['Distribution From', isoDate], distTo: ['Distribution To', isoDate], currency: ['Currency', str], rate: ['Rate', num], rateVnd: ['RateToVND', num],
  grpCost: ['Group cost', str], services: ['Services', str], location: ['Location', str], project: ['Project', str], period: ['Period', str],
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
// Ghi lỗi kèm sẵn tháng / người nhập / bộ phận / chứng từ / trạng thái (để lọc, đếm lỗi không phải nối bảng entries)
const insErrFull = db.prepare('INSERT INTO errors(entry_id, rule, sev, msg, err_key, ym, u, dept, doc, st) VALUES(?,?,?,?,?,?,?,?,?,?)');
const insErrSel = db.prepare(`INSERT INTO errors(entry_id, rule, sev, msg, err_key, ym, u, dept, doc, st)
  SELECT e.id, ?, ?, ?, ?, e.ym, e.created_by, e.department, e.document_no, coalesce((SELECT nullif(r.status,'') FROM reviews r WHERE r.err_key=?),'open') FROM entries e WHERE e.id=?`);
const insErr = { run: (id, k, s, msg, key) => insErrSel.run(k, s, msg, key, key, id) };
function writeRow(importId, r) {
  const { lastInsertRowid: id } = insEntry.run(importId, r.date ? r.date.slice(0, 7) : null, ...COLS.map(([k]) => r[k] ?? null));
  void id; // nạp nhanh: không chạy quy tắc – phân tích riêng bằng nút "Phân tích dữ liệu"
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
  const { lastInsertRowid: importId } = db.prepare(`INSERT INTO imports(file_name,file_hash,status,schema) VALUES(?,?,'pending',2)`).run(name, hash);
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
// scope = {from,to}: so sánh trên toàn bộ dữ liệu đã nạp nhưng chỉ gắn lỗi cho bút toán trong kỳ
function setRules(scope = {}) {
  post({ type: 'progress', label: 'Đang rà soát trùng lặp, bất thường, chứng từ, chia nhỏ khoản chi, tồn kho…' });
  db.exec('BEGIN');
  // Điều kiện kỳ đưa thẳng vào truy vấn: chỉ lấy ứng viên trong kỳ, phép so sánh vẫn dựa trên toàn bộ dữ liệu
  const S = t => (scope.from ? ` AND ${t}ym>='${scope.from}'` : '') + (scope.to ? ` AND ${t}ym<='${scope.to}'` : '');
  const inYm = y => (!scope.from || y >= scope.from) && (!scope.to || y <= scope.to);
  if (!scope.from && !scope.to) db.exec(`DELETE FROM errors WHERE rule IN ('DUPLICATE','OUTLIER','DOC_MULTI_MONTH','SPLIT_PAYMENT','RARE_PAIR','INV_NEGATIVE','ACCRUAL_NOT_REVERSED')`);
  const keyOf = (k, r) => errKey(k, { doc: r.doc, line: r.line, dr: r.dr, cr: r.cr, amt: r.amt });
  const F = (t = '') => `${t}amount<>0 AND ifnull(${t}source_table,'') NOT LIKE '%Depreciation%' AND ifnull(${t}source_table,'') NOT LIKE '%Distribution%' AND ifnull(${t}source_table,'') NOT LIKE '%CIP%'`;
  db.exec(`DROP TABLE IF EXISTS temp.dg;
    CREATE TEMP TABLE dg AS SELECT acc_debit a, acc_credit b, ifnull(partner_debit,'') p, ifnull(partner_credit,'') q, amount m, lower(trim(ifnull(description,''))) d
      FROM entries WHERE ${F()} GROUP BY 1,2,3,4,5,6 HAVING count(DISTINCT document_no)>1${scope.from || scope.to ? ` AND sum(1${S('')})>0` : ''};
    CREATE INDEX temp.ix_dg ON dg(a,b,m);`);
  const dups = db.prepare(`SELECT e.id, e.document_no doc, e.line_no line, e.acc_debit dr, e.acc_credit cr, e.amount amt, dg.rowid grp
    FROM entries e JOIN dg ON dg.a=e.acc_debit AND dg.b=e.acc_credit AND dg.m=e.amount AND dg.p=ifnull(e.partner_debit,'')
      AND dg.q=ifnull(e.partner_credit,'') AND dg.d=lower(trim(ifnull(e.description,''))) WHERE ${F('e.')}`).all();
  const dupIn = db.prepare('SELECT ym FROM entries WHERE id=?');
  const groups = new Map();
  for (const r of dups) (groups.get(r.grp) || groups.set(r.grp, []).get(r.grp)).push(r);
  for (const arr of groups.values()) {
    const docs = [...new Set(arr.map(x => x.doc))];
    for (const r of arr) if (inYm(dupIn.get(r.id).ym)) insErr.run(r.id, 'DUPLICATE', 'H', `${docs.length} chứng từ: ${docs.slice(0, 4).join(', ')}`, keyOf('DUPLICATE', r));
  }
  const EXP = `substr(acc_debit,1,1) IN ('6','8') AND acc_debit NOT LIKE '911%' AND type_of_cost IS NOT NULL AND amount>0
    AND ifnull(source_table,'') NOT LIKE '%Depreciation%' AND ifnull(source_table,'') NOT LIKE '%Distribution%' AND ifnull(source_table,'') NOT LIKE '%CIP%'`;
  // Trung vị theo khoản mục: một lượt đọc đã sắp xếp (nhanh hơn nhiều so với truy vấn từng khoản mục)
  const med = new Map(); let curT = null, buf = [];
  const flush = () => { if (curT != null && buf.length >= 10) med.set(curT, buf[buf.length >> 1]); };
  for (const r of db.prepare(`SELECT type_of_cost t, amount a FROM entries WHERE ${EXP} ORDER BY type_of_cost, amount`).iterate()) {
    if (r.t !== curT) { flush(); curT = r.t; buf = []; }
    buf.push(r.a);
  }
  flush();
  for (const r of db.prepare(`SELECT id, document_no doc, line_no line, acc_debit dr, acc_credit cr, amount amt, type_of_cost t FROM entries WHERE ${EXP} AND amount>100${S('')}`).iterate()) {
    const m = med.get(r.t);
    if (m != null && r.amt > CFG.outlierFactor * m) insErr.run(r.id, 'OUTLIER', 'M', `${fmt2(r.amt)} so với trung vị ${fmt2(m)}`, keyOf('OUTLIER', r));
  }
  const SELR = `e.id, e.document_no doc, e.line_no line, e.acc_debit dr, e.acc_credit cr, e.amount amt, e.quantity qty`;
  // Chứng từ có dòng thuộc nhiều tháng
  for (const r of db.prepare(`SELECT ${SELR}, d.ms FROM entries e JOIN (SELECT document_no, group_concat(DISTINCT ym) ms FROM entries
      WHERE document_no IS NOT NULL GROUP BY document_no HAVING count(DISTINCT ym)>1) d ON d.document_no=e.document_no WHERE 1${S('e.')}`).all())
    insErr.run(r.id, 'DOC_MULTI_MONTH', 'M', `Các tháng: ${r.ms}`, keyOf('DOC_MULTI_MONTH', r));
  // Nhiều khoản chi tiền cho cùng đối tượng trong một ngày
  for (const r of db.prepare(`SELECT ${SELR}, g.n, g.tot FROM entries e JOIN (SELECT partner_debit p, account_date d, count(DISTINCT document_no) n, sum(amount) tot FROM entries
      WHERE (acc_credit LIKE '111%' OR acc_credit LIKE '112%') AND partner_debit IS NOT NULL AND amount>0${S('')} GROUP BY partner_debit, account_date HAVING count(DISTINCT document_no)>=3) g
      ON g.p=e.partner_debit AND g.d=e.account_date WHERE (e.acc_credit LIKE '111%' OR e.acc_credit LIKE '112%') AND e.amount>0${S('e.')}`).all())
    insErr.run(r.id, 'SPLIT_PAYMENT', 'M', `${r.n} chứng từ chi trong ngày, tổng ${fmt2(r.tot)}`, keyOf('SPLIT_PAYMENT', r));
  // Xuất kho vượt tồn: luỹ kế giá trị theo mặt hàng, chỉ xét mặt hàng có chứng từ đầu tiên là nhập (đã thấy từ đầu lịch sử)
  const INV = c => `(${c} LIKE '15%' AND substr(${c},1,3) BETWEEN '151' AND '158' AND ${c} NOT LIKE '154%')`;
  let cur = null, bal = 0, valid = false;
  for (const r of db.prepare(`SELECT ${SELR}, e.ym, e.product, e.account_date d, ${INV('e.acc_debit')} isIn, ${INV('e.acc_credit')} isOut FROM entries e
      WHERE e.product IS NOT NULL AND (${INV('e.acc_debit')} OR ${INV('e.acc_credit')})${scope.from || scope.to ? ` AND e.product IN (SELECT x.product FROM entries x WHERE x.product IS NOT NULL${S('x.')})` : ''} ORDER BY e.product, e.account_date, ${INV('e.acc_debit')} DESC, e.id`).all()) {
    if (r.product !== cur) { cur = r.product; bal = 0; valid = !!r.isIn && !r.isOut && r.qty > 0; } // chứng từ đầu tiên phải là phiếu nhập thật (từ ngoài kho, có số lượng)
    if (r.isIn && !r.isOut) bal += r.amt; else if (r.isOut && !r.isIn) bal -= r.amt;
    if (valid && r.isOut && !r.isIn && bal < -0.01 && inYm(r.ym)) insErr.run(r.id, 'INV_NEGATIVE', 'H', `Tồn luỹ kế ${fmt2(bal)} sau khi xuất ngày ${r.d.split('-').reverse().join('/')}`, keyOf('INV_NEGATIVE', r));
  }
  // Đã ghi chi phí thực tế nhưng chưa huỷ trích 335
  post({ type: 'progress', label: 'Đang đối chiếu trích trước 335 với chi phí thực tế…' });
  for (const x of require('./accrual').match((q, ...a) => db.prepare(q).all(...a)).flagged) if (inYm(x.ym)) {
    const g = x.g, sh = s => String(s || '').split('_').slice(0, 2).join('_');
    insErr.run(x.id, 'ACCRUAL_NOT_REVERSED', g.sev, `Kỳ ${g.per}: đã trích ${fmt2(g.accrued)} (${g.accDocs.slice(0, 2).map(sh).join(', ')}), mới huỷ ${fmt2(g.released)}, còn treo ${fmt2(g.remain)}; chi phí thực tế ${fmt2(g.actual)}${g.invs.length ? ' HĐ ' + g.invs.slice(0, 2).join(', ') : ''}`,
      errKey('ACCRUAL_NOT_REVERSED', { doc: x.doc, line: x.line, dr: x.dr, cr: x.cr, amt: x.a }));
  }
  // Cặp tài khoản đối ứng hiếm
  if (db.prepare('SELECT count(*) n FROM entries').get().n >= 1000)
    for (const r of db.prepare(`SELECT ${SELR}, g.n FROM entries e JOIN (SELECT substr(acc_debit,1,3) a, substr(acc_credit,1,3) b, count(*) n FROM entries
        GROUP BY 1,2 HAVING count(*)<=2) g ON g.a=substr(e.acc_debit,1,3) AND g.b=substr(e.acc_credit,1,3) WHERE 1${S('e.')}`).all())
      insErr.run(r.id, 'RARE_PAIR', 'L', `Nợ ${r.dr.slice(0, 3)} / Có ${r.cr.slice(0, 3)} chỉ có ${r.n} lần`, keyOf('RARE_PAIR', r));
  db.exec('COMMIT');
}

/* ---------- Phân tích dữ liệu theo kỳ (chạy toàn bộ quy tắc) ---------- */
// Quy tắc từng dòng chạy song song trên nhiều luồng CPU (mỗi luồng quét một khoảng id, chỉ đọc); luồng này gom kết quả và ghi.
function scanRange({ lo, hi, sc }) { // chạy trong luồng phụ
  const page = db.prepare(`SELECT ${SEL_ENTRY}, e.department AS _dept FROM entries e WHERE e.id>? AND e.id<=?${sc} ORDER BY e.id LIMIT ${BATCH}`);
  let last = lo, n = 0;
  for (;;) {
    const rows = page.all(last, hi); if (!rows.length) break;
    const out = [];
    for (const raw of rows) { const r = rowFromDb(raw); for (const e of checkRow(r)) out.push([raw.id, e.k, e.s, e.msg, errKey(e.k, r), raw.ym, r.user, raw._dept ?? null, r.doc ?? null]); }
    last = rows.at(-1).id; n += rows.length; post({ type: 'errs', list: out, n: rows.length });
  }
  return { n };
}
async function analyze({ from = '', to = '' } = {}) {
  const sc = (from ? ` AND e.ym>='${from}'` : '') + (to ? ` AND e.ym<='${to}'` : '');
  const total = db.prepare(`SELECT count(*) n FROM entries e WHERE 1${sc}`).get().n;
  const t0 = Date.now();
  post({ type: 'progress', label: 'Đang xoá kết quả phân tích cũ của kỳ', pct: 0 });
  const big = total > 200000; // kỳ lớn: gỡ chỉ mục lỗi để xoá/chèn hàng loạt nhanh, dựng lại một lần ở cuối; kỳ nhỏ (1 tháng) giữ chỉ mục
  if (big) dropErrIndexes(db);
  db.exec('BEGIN');
  if (sc) db.exec(`DELETE FROM errors WHERE entry_id IN (SELECT e.id FROM entries e WHERE 1${sc})`); else db.exec('DELETE FROM errors');
  db.exec('COMMIT');
  const rv = new Map(db.prepare(`SELECT err_key k, status s FROM reviews WHERE ifnull(status,'')<>''`).all().map(r => [r.k, r.s]));
  const ids = db.prepare(`SELECT min(e.id) lo, max(e.id) hi FROM entries e WHERE 1${sc}`).get();
  const K = total < 50000 ? 1 : Math.max(1, Math.min(6, os.cpus().length - 1));
  let done = 0;
  const write = list => { db.exec('BEGIN'); for (const x of list) insErrFull.run(...x, rv.get(x[4]) || 'open'); db.exec('COMMIT'); };
  if (ids.lo != null) {
    const step = Math.ceil((ids.hi - ids.lo + 1) / K), parts = [];
    for (let k = 0; k < K; k++) parts.push({ lo: ids.lo - 1 + k * step, hi: Math.min(ids.hi, ids.lo - 1 + (k + 1) * step), sc });
    await Promise.all(parts.map(a => new Promise((res, rej) => {
      const w = new Worker(__filename, { workerData: { dbPath: workerData.dbPath, task: 'scan', args: a } });
      w.on('message', m => {
        if (m.type === 'errs') { write(m.list); done += m.n; post({ type: 'progress', label: `Đang phân tích từng bút toán (${K} luồng song song)`, rows: done, pct: done / total * 80, secs: (Date.now() - t0) / 1000 }); }
        else if (m.type === 'done') res(); else if (m.type === 'error') rej(new Error(m.error));
      });
      w.on('error', rej);
    })));
  }
  setRules({ from, to });
  db.exec(`DELETE FROM errors WHERE entry_id IN (SELECT id FROM entries WHERE source_table='OPENING_BALANCE')`); // số dư đầu kỳ không phải bút toán của nhân viên
  post({ type: 'progress', label: big ? 'Đang dựng chỉ mục kết quả rà soát…' : 'Đang hoàn tất…', pct: 95 });
  require('./db').fillErrCols(db); if (big) createErrIndexes(db); db.exec('PRAGMA optimize');
  const ms = db.prepare(`UPDATE months SET analyzed_ver=? WHERE 1${sc.replace(/e\.ym/g, 'ym')} RETURNING ym`).all(RULES_VERSION).map(r => r.ym);
  return { rows: total, months: ms.length, secs: (Date.now() - t0) / 1000 };
}

/* ---------- Bổ sung mã hàng / ĐVT / kho cho dữ liệu đã nạp (không thay dữ liệu) ---------- */
async function enrichFile({ file, name }) {
  const size = fs.statSync(file).size;
  let read = 0, n = 0, matched = 0, updated = 0, notFound = 0, ambiguous = 0, skipped = 0, map = null, t0 = Date.now(), lastPost = 0;
  const rows = /\.csv$|\.txt$/i.test(name) ? csvRows(file, b => read += b) : xlsxRows(file, b => read += b);
  // Khớp theo số chứng từ + line + TK Nợ + TK Có + số tiền
  const find = db.prepare(`SELECT id, product, uom, locator, locator_credit FROM entries WHERE document_no IS ? AND line_no IS ? AND acc_debit=? AND acc_credit=? AND abs(amount-?)<0.005`);
  const upd = db.prepare(`UPDATE entries SET product=coalesce(?,product), uom=coalesce(?,uom), locator=coalesce(?,locator), locator_credit=coalesce(?,locator_credit),
    dist_from=coalesce(?,dist_from), dist_to=coalesce(?,dist_to), currency=coalesce(?,currency), rate=coalesce(?,rate), rate_vnd=coalesce(?,rate_vnd),
    group_cost=coalesce(?,group_cost), services=coalesce(?,services), location=coalesce(?,location), project=coalesce(?,project), period=coalesce(?,period), enriched=1 WHERE id=?`);
  const samples = [];
  db.exec('BEGIN');
  try {
    for await (const vals of rows) {
      if (!map) { map = headerMap(vals); continue; }
      if (vals.every(v => v == null || v === '')) continue;
      const r = normalize(vals, map); n++;
      const hit = find.all(r.doc ?? null, r.line ?? null, r.dr, r.cr, r.amt);
      if (!hit.length) { notFound++; if (samples.length < 20) samples.push(`${r.doc} line ${r.line} · ${r.dr}/${r.cr} · ${r.amt}`); continue; }
      if (hit.length > 1) ambiguous++;
      matched++;
      if (!r.product && !r.loc && !r.locCr && !r.uom) skipped++; // file gốc cũng không có mã hàng/kho: chỉ đánh dấu đã đối chiếu
      for (const h of hit) { upd.run(r.product, r.uom, r.loc, r.locCr, r.distFrom, r.distTo, r.currency, r.rate, r.rateVnd, r.grpCost, r.services, r.location, r.project, r.period, h.id); if (h.product !== r.product || h.uom !== r.uom || h.locator !== r.loc || h.locator_credit !== r.locCr) updated++; }
      if (n % BATCH === 0) {
        db.exec('COMMIT'); db.exec('BEGIN');
        if (Date.now() - lastPost > 400) { lastPost = Date.now(); post({ type: 'progress', rows: n, pct: Math.min(99, read / size * 100), secs: (Date.now() - t0) / 1000 }); }
      }
    }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  if (!map) throw new Error('Không đúng định dạng file hạch toán (thiếu cột Account / Accounted Amount).');
  // Thông tin hàng tồn kho thay đổi → các tháng liên quan cần phân tích lại
  db.exec(`UPDATE months SET analyzed_ver=NULL WHERE ym IN (SELECT DISTINCT ym FROM entries WHERE enriched=1)`);
  return { rows: n, matched, updated, notFound, ambiguous, skipped, samples, secs: (Date.now() - t0) / 1000 };
}

/* ---------- Số dư đầu kỳ (file mẫu) ---------- */
// Mỗi dòng: TK + đối tượng (+ hợp đồng / đề nghị TU / khoản mục / mặt hàng) + Dư Nợ / Dư Có. Lưu như bút toán đối ứng với TK giả 'OB'.
async function importOpening({ file, name }) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0]; if (!ws) throw new Error('File không có sheet dữ liệu.');
  const head = ws.getRow(1).values.slice(1).map(h => String(cell(h) ?? '').trim().toLowerCase());
  const col = (...names) => { const i = head.findIndex(h => names.some(n => h === n || h.startsWith(n))); return i < 0 ? null : i; };
  const C = { acc: col('tài khoản', 'tk', 'account'), bp: col('đối tượng', 'business partner'), contract: col('hợp đồng', 'contract'), adv: col('đề nghị tạm ứng', 'advance'),
    tcost: col('khoản mục', 'type of cost'), product: col('mặt hàng', 'product'), date: col('ngày số dư', 'ngày', 'date'), due: col('hạn thanh toán', 'due'),
    dr: col('dư nợ', 'debit'), cr: col('dư có', 'credit'), qty: col('số lượng', 'quantity'), desc: col('diễn giải', 'description') };
  if (C.acc == null || (C.dr == null && C.cr == null) || C.date == null) throw new Error('Thiếu cột bắt buộc: Tài khoản, Ngày số dư, Dư Nợ / Dư Có (dùng file mẫu).');
  const { lastInsertRowid: importId } = db.prepare(`INSERT INTO imports(file_name,file_hash,status,schema) VALUES(?,?,'pending',2)`).run('Số dư đầu kỳ: ' + name, name);
  let n = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const v = row.values.slice(1), g = k => C[k] == null ? null : cell(v[C[k]]);
      const acc = String(g('acc') ?? '').trim().split(/[_\s]/)[0]; if (!acc) return;
      if (/^v[íi] d[ụu]/i.test(String(g('desc') ?? '').trim())) { skipped++; return; } // dòng ví dụ của file mẫu
      const date = isoDate(g('date')); if (!date) throw new Error(`Dòng ${i}: thiếu hoặc sai Ngày số dư.`);
      const base = { line: i, doc: 'SO-DU-DAU-KY', date, due: isoDate(g('due')), amt: 0, qty: num(g('qty')), contract: str(g('contract')), adv: str(g('adv')), tcost: str(g('tcost')),
        product: str(g('product')), desc: str(g('desc')) || 'Số dư đầu kỳ', table: 'OPENING_BALANCE', user: 'Số dư đầu kỳ', currency: 'USD' };
      const dr = num(g('dr')) || 0, cr = num(g('cr')) || 0, bp = str(g('bp'));
      if (dr) { writeRow(importId, { ...base, amt: dr, dr: acc, cr: 'OB', drName: acc, crName: 'OB_Số dư đầu kỳ', bp, bpCr: null }); n++; }
      if (cr) { writeRow(importId, { ...base, amt: cr, dr: 'OB', cr: acc, drName: 'OB_Số dư đầu kỳ', crName: acc, bp: null, bpCr: bp }); n++; }
    });
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} db.prepare('DELETE FROM imports WHERE id=?').run(importId); throw e; }
  db.prepare(`UPDATE imports SET status='ok' WHERE id=?`).run(importId);
  refreshImports();
  // tháng chỉ chứa số dư đầu kỳ: coi như đã phân tích
  db.prepare(`UPDATE months SET analyzed_ver=? WHERE ym IN (SELECT DISTINCT ym FROM entries WHERE import_id=?) AND NOT EXISTS (SELECT 1 FROM entries x WHERE x.ym=months.ym AND ifnull(x.source_table,'')<>'OPENING_BALANCE')`).run(RULES_VERSION, importId);
  return { rows: n, skipped };
}

/* ---------- Điều phối ---------- */
const TASKS = {
  import: importFile,
  enrich: enrichFile,
  opening: importOpening,
  // mode: 'replace' = thay dữ liệu tháng trùng; 'merge' = giữ dữ liệu cũ, chỉ thêm bút toán chưa có; khác = tháng mới
  finalize({ importId, replace, mode }) {
    if (replace) mode = 'replace';
    const months = db.prepare('SELECT DISTINCT ym FROM entries WHERE import_id=? AND ym IS NOT NULL').all(importId).map(r => r.ym);
    let merged = 0;
    if (mode === 'replace') deleteMonths(months, importId);
    if (mode === 'merge') {
      post({ type: 'progress', label: 'Đang gộp – bỏ các bút toán đã có…' });
      db.exec('BEGIN');
      merged = db.prepare(`DELETE FROM entries WHERE import_id=? AND EXISTS (SELECT 1 FROM entries x WHERE x.import_id<>entries.import_id
        AND x.document_no IS entries.document_no AND x.line_no IS entries.line_no AND x.acc_debit=entries.acc_debit AND x.acc_credit=entries.acc_credit AND abs(x.amount-entries.amount)<0.005)`).run(importId).changes;
      db.exec('COMMIT');
    }
    db.prepare(`UPDATE imports SET status='ok' WHERE id=?`).run(importId);
    refreshImports();
    post({ type: 'progress', label: 'Đang cập nhật bảng tổng hợp báo cáo…' }); rebuildAgg(db, months);
    const mark = db.prepare('UPDATE months SET analyzed_ver=NULL WHERE ym=?'); for (const m of months) mark.run(m); // tháng mới nạp: chưa phân tích
    db.exec('PRAGMA optimize');
    return { months, merged, kept: db.prepare('SELECT count(*) n FROM entries WHERE import_id=?').get(importId).n };
  },
  cancel({ importId }) { post({ type: 'progress', label: 'Đang huỷ lần nạp…' }); db.prepare('DELETE FROM imports WHERE id=?').run(importId); refreshImports(); return {}; },
  deleteMonth({ ym }) { deleteMonths([ym]); refreshImports(); rebuildAgg(db, [ym]); return {}; },
  buildAgg() { post({ type: 'progress', label: 'Đang tạo bảng tổng hợp để báo cáo nhanh hơn (một lần)…' }); rebuildAgg(db); return {}; },
  deleteImport({ id }) { post({ type: 'progress', label: 'Đang xoá lần nạp…' }); db.prepare('DELETE FROM imports WHERE id=?').run(id); refreshImports(); rebuildAgg(db); return {}; },
  clear() { post({ type: 'progress', label: 'Đang xoá toàn bộ dữ liệu…' }); db.exec(`DELETE FROM errors; DELETE FROM entries; DELETE FROM imports; DELETE FROM months; DELETE FROM agg;`); db.exec('VACUUM'); return {}; },
  recheck() { return analyze({}); },
  analyze: args => analyze(args),
  scan: args => scanRange(args),
};
(async () => {
  try { post({ type: 'done', result: await TASKS[workerData.task](workerData.args || {}) }); }
  catch (e) { post({ type: 'error', error: String(e && e.message || e), stack: String(e && e.stack || e) }); }
  finally { db.close(); }
})();
