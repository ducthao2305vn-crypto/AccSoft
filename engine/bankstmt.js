'use strict';
// Quản lý sao kê ngân hàng: đọc file thô từ internet banking (BNCTL CSV, BNU CMOV CSV, Mandiri XLS, Mosan Balance Report XLSX),
// lưu theo tài khoản; nạp lại cùng khoảng ngày sẽ THAY các dòng cũ của tài khoản trong khoảng đó (không nhân đôi khi nạp hàng ngày).
const num = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, ''); const n = +s; return isFinite(n) ? n : 0; };
const p2 = n => String(n).padStart(2, '0');
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
// dd/mm/yyyy [hh:mm:ss] | yyyy-mm-dd [hh:mm] → [date, time]
function dt(s) {
  s = String(s ?? '').trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (m) return [`${m[1]}-${p2(m[2])}-${p2(m[3])}`, m[4] && m[4] !== '00:00' ? m[4] : ''];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (m) return [`${m[3]}-${p2(m[2])}-${p2(m[1])}`, m[4] || ''];
  return [null, ''];
}
function csvRows(text, sep) {
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
    else f += c; }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}
const T = s => String(s ?? '').trim();
function bnctl(R) { // Name,Account,... / Opening Balance,... / Date,Beneficiary,Transaction ID,Description,Credit,Debit,Balance
  const acc = T(R[1][1]), cur = T(R[1][5]) || 'USD', h = R.findIndex(r => T(r[0]) === 'Date' && T(r[2]) === 'Transaction ID');
  const rows = [];
  for (const r of R.slice(h + 1)) { const [d, t] = dt(r[0]); if (!d) continue;
    rows.push({ d, t, ref: T(r[2]).replace(/\\BNK$/, ''), ds: T(r[3]), ben: T(r[1]), cr: Math.abs(num(r[4])), dr: Math.abs(num(r[5])), bal: num(r[6]) }); }
  return { bank: 'BNCTL', acc, cur, name: T(R[1][0]).replace(/\s+/g, ' '), rows };
}
function bnu(R) { // Movements;;; Source account;;;0096...; ... Movement date;Value date;Movement description;;Amount;Balance
  const kv = k => { const r = R.find(x => T(x[0]).toLowerCase() === k); return r ? T(r[3]) : ''; };
  const h = R.findIndex(r => T(r[0]).toLowerCase().startsWith('movement date')), rows = [];
  for (const r of R.slice(h + 1)) { const [d] = dt(r[0]); if (!d) continue; const a = num(r[4]);
    rows.push({ d, t: '', ref: '', ds: T(r[2]), ben: '', cr: a > 0 ? a : 0, dr: a < 0 ? -a : 0, bal: num(r[5]), vd: dt(r[1])[0] }); }
  return { bank: 'BNU', acc: kv('source account'), cur: (kv('currency') || 'USD').slice(0, 3), name: kv('designation'), rows };
}
function mandiri(R) { // Laporan Rekening Koran
  const cell = re => { for (const r of R) for (let j = 0; j < r.length; j++) if (re.test(T(r[j]))) { for (let k = j + 1; k < r.length; k++) if (T(r[k])) return T(r[k]); } return ''; };
  const an = cell(/^Account No$/i), acc = (an.match(/\d{6,}/) || [''])[0], cur = (an.match(/\b[A-Z]{3}\b/) || ['USD'])[0];
  const h = R.findIndex(r => r.some(c => T(c) === 'Posting Date')), H = R[h] || [], ix = n => H.findIndex(c => T(c) === n), rows = [];
  const [iD, iR, iN, iDr, iCr, iB] = ['Posting Date', 'Remark', 'Reference No', 'Debit', 'Credit', 'Balance'].map(ix);
  for (const r of R.slice(h + 1)) { const [d, t] = dt(r[iD]); if (!d) continue; const ref = T(r[iN]);
    rows.push({ d, t, ref: ref === '-' ? '' : ref, ds: T(r[iR]).replace(/\s{2,}/g, ' '), ben: '', dr: num(r[iDr]), cr: num(r[iCr]), bal: num(r[iB]) }); }
  return { bank: 'MANDIRI', acc, cur, name: an.replace(/^\d+\s+[A-Z]{3}\s*/, ''), rows };
}
function mosan(R) { // BALANCE REPORT: No, Transaction ID, Date Created, Beforce Balance, Direction, Amount, After Balance (mới nhất trước)
  const h = R.findIndex(r => r.some(c => /transaction id/i.test(T(c))) && r.some(c => /direction/i.test(T(c)))), H = R[h].map(c => T(c).toLowerCase());
  const ix = re => H.findIndex(c => re.test(c)), [iI, iD, iB0, iDir, iA, iB] = [/transaction id/, /date/, /before|beforce/, /direction/, /^amount/, /after/].map(ix), rows = [];
  for (const r of R.slice(h + 1)) { const [d, t] = dt(r[iD]); if (!d) continue; const a = Math.abs(num(r[iA])), out = T(r[iDir]) === '-';
    rows.push({ d, t, ref: T(r[iI]), ds: out ? 'Chi / trừ ví' : 'Nạp / cộng ví', ben: '', dr: out ? a : 0, cr: out ? 0 : a, bal: num(r[iB]), b0: num(r[iB0]) }); }
  rows.reverse(); // về thứ tự thời gian; trong cùng giây file xếp lộn → nối chuỗi số dư trước = số dư sau của dòng trước
  rows.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  const key = v => Math.round(v * 100), left = new Set(rows.keys()), out = [];
  const byB0 = new Map(); rows.forEach((r, i) => (byB0.get(key(r.b0)) || byB0.set(key(r.b0), []).get(key(r.b0))).push(i));
  let cur = null;
  while (left.size) {
    let i = cur ? (byB0.get(key(cur.bal)) || []).find(j => left.has(j)) : undefined;
    if (i === undefined) i = Math.min(...left);
    left.delete(i); out.push(cur = rows[i]);
  }
  rows.length = 0; rows.push(...out);
  return { bank: 'MOSAN', acc: 'MOSAN', cur: 'USD', name: T(R[0][0]), rows };
}
// Đọc 1 file → { bank, acc, cur, name, rows[] }
function parse(buf, file, XLSX) {
  const head = buf.slice(0, 8);
  if (head[0] === 0x50 && head[1] === 0x4b || head[0] === 0xd0 && head[1] === 0xcf || /^\s*<(html|table|\?xml)/i.test(buf.slice(0, 200).toString('latin1'))) {
    const wb = XLSX.read(buf, { type: 'buffer' }), R = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    const txt = R.slice(0, 15).map(r => r.join(' ')).join(' ');
    if (/Rekening Koran|Account Statement Report/i.test(txt)) return mandiri(R);
    if (/BALANCE REPORT/i.test(txt) || R.some(r => r.some(c => /direction/i.test(T(c))))) return mosan(R);
    throw new Error(`${file}: không nhận ra mẫu sao kê Excel`);
  }
  let text = buf.toString('utf8'); if (text.includes('�')) text = buf.toString('latin1');
  text = text.replace(/^﻿/, '');
  if (/^Movements;/i.test(text) || /Source account;/i.test(text)) return bnu(csvRows(text, ';'));
  if (/^Name,Account,/i.test(text)) return bnctl(csvRows(text, ','));
  throw new Error(`${file}: không nhận ra mẫu sao kê CSV`);
}
const BANKS = ['BNCTL', 'BNU', 'MANDIRI', 'MOSAN'];

function make(db, all, FIN) {
  db.exec(`CREATE TABLE IF NOT EXISTS bank_acc(acc TEXT PRIMARY KEY, bank TEXT, name TEXT, cur TEXT, gl TEXT, alias TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS bank_tx(id INTEGER PRIMARY KEY AUTOINCREMENT, acc TEXT, d TEXT, t TEXT, seq INTEGER, ref TEXT, ds TEXT, ben TEXT, dr REAL, cr REAL, bal REAL, file TEXT, imp TEXT);
    CREATE INDEX IF NOT EXISTS ix_btx ON bank_tx(acc, d, seq);
    CREATE TABLE IF NOT EXISTS bank_mark(sig TEXT PRIMARY KEY, st TEXT, doc TEXT, note TEXT, at TEXT);
    CREATE TABLE IF NOT EXISTS bank_imp(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, file TEXT, bank TEXT, acc TEXT, d1 TEXT, d2 TEXT, n INTEGER, removed INTEGER);`);
  const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  // Nạp các file đã đọc: thay dòng cũ của tài khoản trong [ngày đầu, ngày cuối] của file
  function importParsed(list) {
    const at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return tx(() => list.map(p => {
      if (!p.acc) throw new Error(`${p.file}: không đọc được số tài khoản`);
      const ex = all(`SELECT acc FROM bank_acc WHERE acc=?`, p.acc)[0];
      if (!ex) db.prepare(`INSERT INTO bank_acc(acc, bank, name, cur) VALUES(?,?,?,?)`).run(p.acc, p.bank, p.name || '', p.cur || 'USD');
      if (!p.rows.length) return { ...p, rows: undefined, n: 0, removed: 0 };
      const ds = p.rows.map(r => r.d).sort(), d1 = ds[0], d2 = ds[ds.length - 1];
      const removed = db.prepare(`DELETE FROM bank_tx WHERE acc=? AND d BETWEEN ? AND ?`).run(p.acc, d1, d2).changes;
      const ins = db.prepare(`INSERT INTO bank_tx(acc, d, t, seq, ref, ds, ben, dr, cr, bal, file, imp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
      p.rows.forEach((r, i) => ins.run(p.acc, r.d, r.t || '', i, r.ref || '', r.ds || '', r.ben || '', r.dr || 0, r.cr || 0, r.bal, p.file, at));
      db.prepare(`INSERT INTO bank_imp(at, file, bank, acc, d1, d2, n, removed) VALUES(?,?,?,?,?,?,?,?)`).run(at, p.file, p.bank, p.acc, d1, d2, p.rows.length, removed);
      return { file: p.file, bank: p.bank, acc: p.acc, d1, d2, n: p.rows.length, removed };
    }));
  }
  const accounts = () => all(`SELECT a.*, (SELECT min(d) FROM bank_tx WHERE acc=a.acc) d1, (SELECT max(d) FROM bank_tx WHERE acc=a.acc) d2, (SELECT count(*) FROM bank_tx WHERE acc=a.acc) n FROM bank_acc a ORDER BY instr('BNCTL BNU MANDIRI MOSAN', a.bank), a.acc`);
  const months = () => all(`SELECT DISTINCT substr(d,1,7) ym FROM bank_tx ORDER BY 1 DESC`).map(r => r.ym);
  function setAcc(acc, o) { for (const k of ['gl', 'alias', 'note', 'name', 'bank']) if (o[k] !== undefined) db.prepare(`UPDATE bank_acc SET ${k}=? WHERE acc=?`).run(o[k], acc); return true; }
  function removeAcc(acc) { return tx(() => { db.prepare(`DELETE FROM bank_tx WHERE acc=?`).run(acc); db.prepare(`DELETE FROM bank_acc WHERE acc=?`).run(acc); return true; }); }
  // Sao kê kỳ [from, to] (yyyy-mm-dd) cho các ngân hàng / tài khoản chọn
  function report(from, to, banks = [], accs = []) {
    const A = accounts().filter(a => (!banks.length || banks.includes(a.bank)) && (!accs.length || accs.includes(a.acc)));
    const out = [];
    for (const a of A) {
      const rows = all(`SELECT id, d, t, ref, ds, ben, dr, cr, bal FROM bank_tx WHERE acc=? AND d BETWEEN ? AND ? ORDER BY d, seq`, a.acc, from, to);
      const prev = all(`SELECT bal FROM bank_tx WHERE acc=? AND d<? ORDER BY d DESC, seq DESC LIMIT 1`, a.acc, from)[0];
      const open = rows.length ? rows[0].bal - rows[0].cr + rows[0].dr : prev ? prev.bal : null;
      let run = open, bad = 0; for (const r of rows) { run += r.cr - r.dr; r.run = run; if (Math.abs(run - r.bal) > 0.005) bad++; }
      const cr = rows.reduce((s, r) => s + r.cr, 0), dr = rows.reduce((s, r) => s + r.dr, 0);
      // thiếu ngày: số dư đầu không khớp số dư cuối dòng trước
      const gap = prev && rows.length && Math.abs(prev.bal - open) > 0.005 ? prev.bal - open : 0;
      out.push({ ...a, rows, open, cr, dr, close: rows.length ? rows[rows.length - 1].bal : open, bad, gap, last: rows.length ? rows[rows.length - 1].d : null });
    }
    return { from, to, accs: out, banks: BANKS };
  }

  const sigOf = (acc, x) => [acc, x.d, x.t || '', x.ref || '', (+x.dr || 0).toFixed(2), (+x.cr || 0).toFixed(2), (+x.bal || 0).toFixed(2)].join('|');
  const glOf = a => a.gl || (a.bank === 'MOSAN' ? '11212' : '1122');
  const addD = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const prevYm = ym => { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
  const dd = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
  function mark(acc, x, o) { const sig = sigOf(acc, x);
    if (!o) { db.prepare(`DELETE FROM bank_mark WHERE sig=?`).run(sig); return true; }
    db.prepare(`INSERT OR REPLACE INTO bank_mark(sig, st, doc, note, at) VALUES(?,?,?,?,datetime('now'))`).run(sig, o.st || 'manual', o.doc || '', o.note || ''); return true; }
  // Đối chiếu sao kê ↔ hạch toán TK 112 (Source Amount). Thu ngân hàng ↔ Nợ 112, chi ngân hàng ↔ Có 112.
  // Lượt 1: từng dòng cùng số tiền, ngày lệch ≤ tol (gần nhất); lượt 2: tổng các dòng cùng số CT × chiều; còn lại: chưa khớp.
  function recon(from, to, banks = [], tol = 5) {
    const r = report(from, to, banks, []), groups = new Map();
    for (const a of r.accs) { const g = glOf(a); (groups.get(g) || groups.set(g, []).get(g)).push(a); }
    const marks = new Map(all(`SELECT * FROM bank_mark`).map(m => [m.sig, m]));
    const bookMax = (all(`SELECT max(account_date) d FROM entries`)[0] || {}).d || null;
    const out = [];
    for (const [gl, A] of groups) {
      const lo = addD(from, -tol), hi = addD(to, tol), L = gl.length;
      const E = all(`SELECT id, document_no doc, account_date d, acc_debit dr, acc_credit cr, amount a, description ds, partner_debit bp, partner_credit bpc FROM entries
        WHERE account_date BETWEEN ? AND ? AND amount<>0 AND (substr(acc_debit,1,?)=? OR substr(acc_credit,1,?)=?)`, lo, hi, L, gl, L, gl);
      const B = []; // phía sổ: in = Nợ 112 (tiền vào), out = Có 112
      for (const e of E) {
        if (e.dr.slice(0, L) === gl) B.push({ ...e, side: e.a > 0 ? 'in' : 'out', v: Math.abs(e.a), oth: e.cr, k: e.id + 'd' });
        if (e.cr.slice(0, L) === gl) B.push({ ...e, side: e.a > 0 ? 'out' : 'in', v: Math.abs(e.a), oth: e.dr, k: e.id + 'c' });
      }
      const used = new Set(), byAmt = new Map(), key = (side, v) => side + Math.round(v * 100);
      for (const b of B) (byAmt.get(key(b.side, b.v)) || byAmt.set(key(b.side, b.v), []).get(key(b.side, b.v))).push(b);
      const T = A.flatMap(a => a.rows.map(x => ({ x, a, side: x.cr > 0 ? 'in' : 'out', v: x.cr > 0 ? x.cr : x.dr })));
      for (const t of T) { const m = marks.get(sigOf(t.a.acc, t.x)); if (m) t.m = { st: m.st, doc: m.doc, note: m.note }; }
      const take = (t, list, st) => { t.m = { st, doc: [...new Set(list.map(b => b.doc))].join(', '), d: list[0].d, oth: [...new Set(list.map(b => b.oth))].join(', '), ds: list[0].ds, lag: dd(list[0].d, t.x.d) }; list.forEach(b => used.add(b.k)); };
      for (const t of T) { if (t.m) continue;
        const c = (byAmt.get(key(t.side, t.v)) || []).filter(b => !used.has(b.k) && Math.abs(dd(b.d, t.x.d)) <= tol).sort((p, q) => Math.abs(dd(p.d, t.x.d)) - Math.abs(dd(q.d, t.x.d)));
        if (c.length) take(t, [c[0]], 'auto'); }
      const docs = new Map(); for (const b of B) if (!used.has(b.k)) { const k = b.doc + '|' + b.side; (docs.get(k) || docs.set(k, []).get(k)).push(b); }
      for (const t of T) { if (t.m) continue;
        for (const [k, list] of docs) { const fr = list.filter(b => !used.has(b.k)); if (fr.length < 2 || fr[0].side !== t.side) continue;
          if (Math.abs(fr.reduce((s, b) => s + b.v, 0) - t.v) < 0.005 && Math.abs(dd(fr[0].d, t.x.d)) <= tol) { take(t, fr, 'group'); docs.delete(k); break; } } }
      for (const t of T) if (!t.m) t.m = { st: bookMax && t.x.d > bookMax ? 'nobook' : 'none' };
      const bookOpen = B.filter(b => !used.has(b.k) && b.d >= from && b.d <= to);
      // số dư sổ: cuối tháng trước (fin_close) + phát sinh trong kỳ
      const ym = from.slice(0, 7), sumGl = m => { let s = 0; for (const [acc, v] of m) if (acc.slice(0, L) === gl) s += v; return s; };
      const ob = FIN ? sumGl(FIN.closeAt(prevYm(ym))) : null;
      const inB = B.filter(b => b.d >= from && b.d <= to && b.side === 'in').reduce((s, b) => s + b.v, 0), outB = B.filter(b => b.d >= from && b.d <= to && b.side === 'out').reduce((s, b) => s + b.v, 0);
      const bank = { open: A.reduce((s, a) => s + (a.open || 0), 0), cr: A.reduce((s, a) => s + a.cr, 0), dr: A.reduce((s, a) => s + a.dr, 0), close: A.reduce((s, a) => s + (a.close || 0), 0) };
      out.push({ gl, accs: A.map(a => ({ acc: a.acc, bank: a.bank, alias: a.alias, name: a.name })), T, bookOpen, bookMax,
        book: { open: ob, in: inB, out: outB, close: ob == null ? null : ob + inB - outB }, bank,
        n: { auto: T.filter(t => t.m.st === 'auto' || t.m.st === 'group').length, manual: T.filter(t => t.m.st === 'manual').length, none: T.filter(t => t.m.st === 'none').length, nobook: T.filter(t => t.m.st === 'nobook').length } });
    }
    return { from, to, tol, bookMax, groups: out, accs: r.accs };
  }
  const imports = () => all(`SELECT * FROM bank_imp ORDER BY id DESC LIMIT 200`);
  return { importParsed, accounts, months, setAcc, removeAcc, report, imports, recon, mark, glOf };
}
// Sổ Excel: Tổng hợp + Chi tiết gộp + 1 sheet / tài khoản (có cột trống để nhân viên đối chiếu hạch toán)
function book(r, XLSX, rc) {
  const M = new Map(); if (rc) for (const g of rc.groups) for (const t of g.T) M.set(t.x.id, t.m);
  const ST = { auto: 'Khớp tự động', group: 'Khớp (gộp số CT)', manual: 'Đánh dấu tay', none: 'CHƯA KHỚP', nobook: 'Chưa có dữ liệu hạch toán' };
  const wb = XLSX.utils.book_new(), lbl = a => `${a.bank} ${a.alias || a.acc}`;
  const sum = r.accs.map(a => ({ 'Ngân hàng': a.bank, 'Số tài khoản': a.acc, 'Tên / ghi chú': a.alias || a.name, 'TK kế toán': a.gl || '', 'Tiền tệ': a.cur, 'Số dư đầu kỳ': a.open, 'Tổng thu (Có)': a.cr, 'Tổng chi (Nợ)': a.dr, 'Số dư cuối kỳ': a.close, 'Số giao dịch': a.rows.length, 'Dữ liệu đến ngày': a.last, 'Kiểm tra số dư': a.bad ? `${a.bad} dòng lệch số dư` : a.gap ? `Thiếu dữ liệu trước kỳ: ${a.gap.toFixed(2)}` : 'Khớp' }));
  sum.push({ 'Ngân hàng': 'TỔNG CỘNG', 'Số dư đầu kỳ': r.accs.reduce((s, a) => s + (a.open || 0), 0), 'Tổng thu (Có)': r.accs.reduce((s, a) => s + a.cr, 0), 'Tổng chi (Nợ)': r.accs.reduce((s, a) => s + a.dr, 0), 'Số dư cuối kỳ': r.accs.reduce((s, a) => s + (a.close || 0), 0) });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum), 'Tong hop');
  const row = (a, x, i) => ({ 'STT': i + 1, 'Ngân hàng': a.bank, 'Số tài khoản': a.acc, 'Ngày': x.d, 'Giờ': x.t, 'Số tham chiếu': x.ref, 'Diễn giải': x.ds, 'Người thụ hưởng': x.ben, 'Thu (Có)': x.cr || null, 'Chi (Nợ)': x.dr || null, 'Số dư': x.bal, 'Số CT hạch toán': (M.get(x.id) || {}).doc || '', 'Ngày hạch toán': (M.get(x.id) || {}).d || '', 'TK đối ứng': (M.get(x.id) || {}).oth || '', 'Đã đối chiếu': ST[(M.get(x.id) || {}).st] || '', 'Ghi chú': (M.get(x.id) || {}).note || '' });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.accs.flatMap(a => a.rows.map((x, i) => row(a, x, i)))), 'Chi tiet');
  if (rc) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rc.groups.map(g => ({ 'TK kế toán': g.gl, 'Tài khoản NH': g.accs.map(a => a.bank + ' ' + (a.alias || a.acc)).join('; '),
      'Đầu kỳ – sao kê': g.bank.open, 'Đầu kỳ – sổ': g.book.open, 'Chênh đầu kỳ': g.book.open == null ? null : g.bank.open - g.book.open,
      'Thu – sao kê': g.bank.cr, 'Nợ 112 – sổ': g.book.in, 'Chi – sao kê': g.bank.dr, 'Có 112 – sổ': g.book.out,
      'Cuối kỳ – sao kê': g.bank.close, 'Cuối kỳ – sổ': g.book.close, 'Chênh cuối kỳ': g.book.close == null ? null : g.bank.close - g.book.close,
      'Khớp tự động': g.n.auto, 'Đánh dấu tay': g.n.manual, 'Sao kê chưa khớp': g.n.none, 'Chưa có dữ liệu HT': g.n.nobook, 'HT chưa có trên sao kê': g.bookOpen.length, 'Dữ liệu HT đến': g.bookMax }))), 'Doi chieu so du');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rc.groups.flatMap(g => g.T.filter(t => t.m.st === 'none').map(t => ({ 'TK kế toán': g.gl, 'Ngân hàng': t.a.bank, 'Số TK': t.a.acc, 'Ngày': t.x.d, 'Số tham chiếu': t.x.ref, 'Diễn giải': t.x.ds, 'Thu': t.x.cr || null, 'Chi': t.x.dr || null })))), 'SK chua khop');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rc.groups.flatMap(g => g.bookOpen.map(b => ({ 'TK kế toán': g.gl, 'Ngày HT': b.d, 'Số CT': b.doc, 'Chiều': b.side === 'in' ? 'Nợ 112 (thu)' : 'Có 112 (chi)', 'TK đối ứng': b.oth, 'Số tiền': b.v, 'Diễn giải': b.ds, 'Đối tượng': b.side === 'in' ? b.bpc : b.bp })))), 'HT chua co tren SK');
  }
  const used = new Set();
  for (const a of r.accs) { let n = lbl(a).replace(/[\\/?*[\]:]/g, '').slice(0, 31); while (used.has(n)) n = n.slice(0, 28) + '_' + used.size; used.add(n);
    const ws = XLSX.utils.json_to_sheet([{ 'STT': '', 'Ngày': '', 'Diễn giải': 'Số dư đầu kỳ', 'Số dư': a.open }, ...a.rows.map((x, i) => { const o = row(a, x, i); delete o['Ngân hàng']; delete o['Số tài khoản']; return o; }),
      { 'Diễn giải': 'Cộng phát sinh', 'Thu (Có)': a.cr, 'Chi (Nợ)': a.dr }, { 'Diễn giải': 'Số dư cuối kỳ', 'Số dư': a.close }]);
    XLSX.utils.book_append_sheet(wb, ws, n); }
  return wb;
}
module.exports = { parse, make, book, BANKS };
