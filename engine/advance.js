'use strict';
// Công nợ tạm ứng tiền (TK 141, không gồm 1412 tạm ứng vật tư) theo nhân viên: số dư đầu kỳ, phát sinh tạm ứng / hoàn ứng, số dư cuối kỳ,
// các khoản tạm ứng còn treo (FIFO) và tuổi nợ; gộp theo nhân viên qua bảng ghép đối tượng công nợ staff_bp.
// Đối chiếu: trạng thái từng nhân viên tại một ngày (đã gửi / đã xác nhận / có chênh lệch) lưu ở adv_recon.

function make(db, all, get, run, okYm) {
  db.exec(`CREATE TABLE IF NOT EXISTS adv_recon(key TEXT, as_of TEXT, status TEXT, amount REAL, confirmed REAL, note TEXT, sent_to TEXT, updated_at TEXT, PRIMARY KEY(key, as_of))`);
  const day = d => String(d || '').slice(0, 10), days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  // Tạm ứng vật tư (1412) KHÔNG thuộc báo cáo này – đã theo dõi ở Tuổi hàng tồn kho (vật tư hàng hoá)
  const pfx = acc => { let a = String(acc || '141').replace(/[^0-9]/g, '') || '141'; if (a.startsWith('1412')) a = '141'; return a; };

  // Mọi phát sinh của TK tạm ứng đến ngày asOf, theo đối tượng (bên Nợ: tạm ứng; bên Có: hoàn ứng / quyết toán)
  function lines(acc, asOf, bps) {
    const A = pfx(acc) + '%', t = day(asOf) || '9999-12-31', B = bps && bps.length ? bps : null, W = B ? ` AND p IN (${B.map(() => '?').join(',')})` : '';
    return all(`SELECT * FROM (
        SELECT e.id, e.account_date d, e.ym, e.document_no doc, e.acc_debit acc, e.acc_credit oacc, e.partner_debit p, e.amount dr, 0 cr, e.description ds, coalesce((SELECT f.value FROM field_adj f WHERE f.id=e.id AND f.field='ar'), e.advance_request) ar, e.advance_request ar0, e.created_by u FROM entries e WHERE e.acc_debit LIKE ? AND e.acc_debit NOT LIKE '1412%' AND e.account_date<=?
        UNION ALL
        SELECT e.id, e.account_date, e.ym, e.document_no, e.acc_credit, e.acc_debit, e.partner_credit, 0, e.amount, e.description, coalesce((SELECT f.value FROM field_adj f WHERE f.id=e.id AND f.field='ar'), e.advance_request), e.advance_request, e.created_by FROM entries e WHERE e.acc_credit LIKE ? AND e.acc_credit NOT LIKE '1412%' AND e.account_date<=?)
      WHERE 1${W} ORDER BY d, id`, A, t, A, t, ...(B || []));
  }
  const staffMap = () => { const m = new Map(); try { for (const r of all(`SELECT b.bp, s.code, s.name, s.dept, s.unit, s.position, s.email1, s.email2, s.status FROM staff_bp b JOIN staff s ON s.code=b.code`)) m.set(r.bp, r); } catch { } return m; };
  const keyOf = (p, S) => { const s = S.get(p); return s ? 'S:' + s.code : 'P:' + (p || ''); };

  // FIFO: hoàn ứng trừ dần các khoản tạm ứng cũ nhất → khoản còn treo + tuổi
  // Backup money (tạm ứng duy trì – thường 12 tháng): người dùng đánh dấu bút toán tạm ứng; không tính quá hạn theo hạn thường,
  // hoàn ứng trừ vào các khoản tạm ứng thường trước, chỉ phần dư mới trừ vào backup; backup quá hạn khi vượt số tháng backup.
  db.exec(`CREATE TABLE IF NOT EXISTS adv_backup(id INTEGER PRIMARY KEY, key TEXT, note TEXT, updated_at TEXT)`);
  const backupIds = () => { const m = new Set(); for (const r of all(`SELECT id FROM adv_backup`)) m.add(r.id); return m; };
  // Tổng nợ = backup money + các nhóm tuổi nợ. Số dư (tạm ứng − hoàn ứng) dành trước cho các khoản backup đã đánh dấu (khoản mới nhất trước),
  // phần còn lại là các khoản tạm ứng thường còn treo theo FIFO (= những khoản thường gần nhất cộng đủ phần còn lại).
  function fifo(L, asOf, BK = new Set()) {
    const bal = L.reduce((a, x) => a + x.dr - x.cr, 0), fill = (rows, amt) => { const out = []; let r = amt;
      for (const x of rows.slice().reverse()) { if (r <= 0.004) break; const u = Math.min(x.dr, r); r -= u; out.push({ id: x.id, d: x.d, doc: x.doc, ar: x.ar, ds: x.ds, p: x.p, acc: x.acc, amt: x.dr, left: u, backup: BK.has(x.id), age: days(x.d, asOf) }); }
      return { out: out.reverse(), rest: r }; };
    const D = L.filter(x => x.dr > 0), bkD = D.filter(x => BK.has(x.id)), nD = D.filter(x => !BK.has(x.id));
    const b1 = fill(bkD, Math.max(0, bal)), n1 = fill(nD, b1.rest);
    return { open: n1.out, bk: b1.out, neg: bal < 0 ? -bal : 0, unalloc: n1.rest };
  }

  // FIFO theo đối tượng + Đề nghị tạm ứng: mỗi đề nghị (AR) cân trừ riêng (tạm ứng − hoàn ứng của chính đề nghị đó);
  // đề nghị hoàn ứng vượt / hoàn ứng không có đề nghị → trừ vào các đề nghị còn dư cũ nhất. Tổng vẫn = số dư; backup ưu tiên trong từng đề nghị.
  const ARK = x => String(x.ar || '').trim();
  function fifoAR(L, asOf, BK = new Set()) {
    const G = new Map(); for (const x of L) { const k = ARK(x), g = G.get(k) || G.set(k, { ar: k, L: [], bal: 0, first: x.d }).get(k); g.L.push(x); g.bal += x.dr - x.cr; }
    let pool = 0; const pos = []; for (const g of G.values()) { if (!g.ar) { pool += g.bal; if (g.bal > 0) { pos.push(g); pool -= g.bal; } } else if (g.bal < 0) pool += g.bal; else if (g.bal > 0) pos.push(g); }
    pos.sort((a, b) => a.first.localeCompare(b.first)); let neg = -Math.min(0, pool);
    for (const g of pos) { const u = Math.min(g.bal, neg); g.left = g.bal - u; neg -= u; }
    const open = [], bk = [], ars = [];
    for (const g of pos) { if (g.left <= 0.004) continue; const D = g.L.filter(x => x.dr > 0), fill = (rows, amt) => { let r = amt; const out = [];
        for (const x of rows.slice().reverse()) { if (r <= 0.004) break; const u = Math.min(x.dr, r); r -= u; out.push({ id: x.id, d: x.d, doc: x.doc, ar: x.ar, ar0: x.ar0, ds: x.ds, p: x.p, acc: x.acc, amt: x.dr, left: u, backup: BK.has(x.id), age: days(x.d, asOf) }); } return { out: out.reverse(), rest: r }; };
      const b1 = fill(D.filter(x => BK.has(x.id)), g.left), n1 = fill(D.filter(x => !BK.has(x.id)), b1.rest); bk.push(...b1.out); open.push(...n1.out);
      const it = [...b1.out, ...n1.out]; ars.push({ ar: g.ar || '(không có đề nghị)', first: g.first, dr: D.reduce((a, x) => a + x.dr, 0), cr: g.L.reduce((a, x) => a + x.cr, 0), bal: g.bal, left: g.left, age: it.length ? Math.max(...it.map(t => t.age)) : 0, n: g.L.length }); }
    for (const g of G.values()) if (!pos.includes(g) && g.ar) ars.push({ ar: g.ar, first: g.first, dr: g.L.reduce((a, x) => a + x.dr, 0), cr: g.L.reduce((a, x) => a + x.cr, 0), bal: g.bal, left: 0, age: 0, n: g.L.length, over: g.bal < -0.004 });
    open.sort((a, b) => a.d.localeCompare(b.d)); bk.sort((a, b) => a.d.localeCompare(b.d)); ars.sort((a, b) => b.left - a.left || a.first.localeCompare(b.first));
    return { open, bk, ars, neg: 0 };
  }
  const FIFO = (mode, L, asOf, BK) => mode === 'ar' ? fifoAR(L, asOf, BK) : fifo(L, asOf, BK);

  // Báo cáo theo nhân viên. o = { asOf, from (YYYY-MM-DD), acc ('141' | '1411' | '1412'), q, dept, only: 'open' | 'over' , overDays }
  function report(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), from = day(o.from) || asOf.slice(0, 4) + '-01-01', S = staffMap(), L = lines(o.acc, asOf), BK = backupIds(), bkTerm = (+o.backupMonths || 12) * 30.4;
    const G = new Map();
    for (const x of L) { const k = keyOf(x.p, S), g = G.get(k) || G.set(k, { key: k, staff: S.get(x.p) || null, partners: new Set(), L: [], open: 0, dr: 0, cr: 0, n: 0, last: '' }).get(k);
      g.partners.add(x.p || ''); g.L.push(x); g.n++; if (x.d < from) g.open += x.dr - x.cr; else { g.dr += x.dr; g.cr += x.cr; } if (x.d > g.last) g.last = x.d; }
    const R = new Map(all(`SELECT key, status, amount, confirmed, note, sent_to, updated_at FROM adv_recon WHERE as_of=?`, asOf).map(r => [r.key, r]));
    const over = +o.overDays || 30;
    let rows = [...G.values()].map(g => { const close = g.open + g.dr - g.cr, F = FIFO(o.mode, g.L, asOf, BK), b = [0, 0, 0, 0], bkAmt = F.bk.reduce((a, x) => a + x.left, 0), bkOver = F.bk.filter(x => x.age > bkTerm).reduce((a, x) => a + x.left, 0);
      for (const it of F.open) b[it.age <= 30 ? 0 : it.age <= 60 ? 1 : it.age <= 90 ? 2 : 3] += it.left;
      const s = g.staff, rc = R.get(g.key);
      return { key: g.key, code: s ? s.code : '', name: s ? s.name : String([...g.partners][0] || '(không có đối tượng)'), dept: s ? s.dept : '', unit: s ? s.unit : '', position: s ? s.position : '', email: s ? (s.email1 || s.email2 || '') : '', status: s ? s.status : '',
        mapped: !!s, partners: [...g.partners], open: g.open, dr: g.dr, cr: g.cr, close, nOpen: F.open.length, nAr: F.ars ? F.ars.filter(a => a.left > 0.004).length : null, oldest: F.open.length ? Math.max(...F.open.map(x => x.age)) : 0, b, overAmt: F.open.filter(x => x.age > over).reduce((a, x) => a + x.left, 0) + bkOver, bkAmt, bkOver, nBk: F.bk.length, last: g.last,
        recon: rc ? { status: rc.status, amount: rc.amount, confirmed: rc.confirmed, note: rc.note, sent: rc.sent_to, at: rc.updated_at } : null };
    }).filter(r => Math.abs(r.open) > 0.004 || Math.abs(r.dr) > 0.004 || Math.abs(r.cr) > 0.004 || Math.abs(r.close) > 0.004);
    const q = String(o.q || '').toLowerCase();
    if (q) rows = rows.filter(r => (r.name + ' ' + r.code + ' ' + r.dept + ' ' + r.partners.join(' ')).toLowerCase().includes(q));
    if (o.dept) rows = rows.filter(r => r.dept === o.dept);
    if (o.only === 'open') rows = rows.filter(r => Math.abs(r.close) > 0.004); else if (o.only === 'over') rows = rows.filter(r => r.overAmt > 0.004); else if (o.only === 'unmapped') rows = rows.filter(r => !r.mapped);
    else if (o.only === 'notconf') rows = rows.filter(r => Math.abs(r.close) > 0.004 && (!r.recon || r.recon.status !== 'confirmed'));
    rows.sort((a, b) => Math.abs(b.close) - Math.abs(a.close));
    const tot = k => rows.reduce((s, r) => s + r[k], 0);
    return { mode: o.mode === 'ar' ? 'ar' : 'bp', asOf, from, acc: pfx(o.acc), over, rows, tot: { open: tot('open'), dr: tot('dr'), cr: tot('cr'), close: tot('close'), overAmt: tot('overAmt'), bkAmt: tot('bkAmt'), bkOver: tot('bkOver'), b: [0, 1, 2, 3].map(i => rows.reduce((s, r) => s + r.b[i], 0)) },
      depts: [...new Set(rows.map(r => r.dept).filter(Boolean))].sort(), nStaff: rows.filter(r => r.mapped).length, nUnmapped: rows.filter(r => !r.mapped).length };
  }

  // Chi tiết một nhân viên (tất cả mã đối tượng đã ghép): sổ chi tiết có số dư luỹ kế + khoản còn treo
  function detail(key, o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), from = day(o.from) || asOf.slice(0, 4) + '-01-01', S = staffMap();
    const bps = key.startsWith('S:') ? all(`SELECT bp FROM staff_bp WHERE code=?`, key.slice(2)).map(r => r.bp) : [key.slice(2)];
    const L = lines(o.acc, asOf, bps.length ? bps : ['\u0000']).filter(x => keyOf(x.p, S) === key); let bal = 0, open = 0; const book = [];
    for (const x of L) { if (x.d < from) { open += x.dr - x.cr; continue; } }
    bal = open; for (const x of L) { if (x.d < from) continue; bal += x.dr - x.cr; book.push({ ...x, bal }); }
    const BK = backupIds(), F = FIFO(o.mode, L, asOf, BK), FA = fifoAR(L, asOf, BK), s = key.startsWith('S:') ? get(`SELECT * FROM staff WHERE code=?`, key.slice(2)) : null;
    return { key, asOf, from, staff: s, partners: [...new Set(L.map(x => x.p))], open, close: bal, dr: book.reduce((a, x) => a + x.dr, 0), cr: book.reduce((a, x) => a + x.cr, 0), book, items: F.open, bkItems: F.bk, ars: FA.ars, arList: [...new Set(L.map(x => x.ar).filter(Boolean))].sort(), advances: L.filter(x => x.dr > 0).map(x => ({ id: x.id, d: x.d, doc: x.doc, ar: x.ar, ds: x.ds, amt: x.dr, round: Math.abs(x.dr - Math.round(x.dr)) < 0.005 && Math.round(x.dr) % 10 === 0, backup: BK.has(x.id) })), recon: get(`SELECT * FROM adv_recon WHERE key=? AND as_of=?`, key, asOf) || null };
  }
  function setRecon(keys, asOf, status, o = {}) { let n = 0; asOf = day(asOf);
    for (const k of [].concat(keys || [])) { const old = get(`SELECT * FROM adv_recon WHERE key=? AND as_of=?`, k, asOf) || {};
      run(`INSERT OR REPLACE INTO adv_recon(key, as_of, status, amount, confirmed, note, sent_to, updated_at) VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))`, k, asOf, status || old.status || '', o.amount ?? old.amount ?? null, o.confirmed ?? old.confirmed ?? null, o.note ?? old.note ?? '', o.sent ?? old.sent_to ?? ''); n++; }
    return { n }; }
  function clearRecon(keys, asOf) { let n = 0; for (const k of [].concat(keys || [])) n += run(`DELETE FROM adv_recon WHERE key=? AND as_of=?`, k, day(asOf)).changes; return { n }; }
  function setBackup(ids, key, on, note = '') { let n = 0; for (const id of [].concat(ids || [])) { if (on) run(`INSERT OR REPLACE INTO adv_backup(id, key, note, updated_at) VALUES(?,?,?,datetime('now','localtime'))`, +id, key || '', note); else run(`DELETE FROM adv_backup WHERE id=?`, +id); n++; } return { n }; }
  // Sửa đề nghị tạm ứng (lưu ở field_adj field 'ar' – không sửa dữ liệu gốc; '' = bỏ điều chỉnh)
  function setAr(ids, value, note = '') { let n = 0;
    for (const id of [].concat(ids || [])) { const e = get(`SELECT id, document_no doc, account_date d, acc_debit dr, acc_credit cr, amount a, partner_debit bp, partner_credit bpCr, advance_request ar, ym FROM entries WHERE id=?`, +id); if (!e) continue;
      const v = String(value ?? '').trim();
      if (!v || v === String(e.ar || '').trim()) run(`DELETE FROM field_adj WHERE id=? AND field='ar'`, e.id);
      else run(`INSERT OR REPLACE INTO field_adj(id, field, value, orig, sig, doc, d, ym, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`, e.id, 'ar', v, e.ar, [e.doc, e.d, e.dr, e.cr, Math.round((+e.a || 0) * 100), e.bp || '', e.bpCr || ''].join('|'), e.doc, e.d, e.ym, note); n++; }
    return { n }; }
  return { report, detail, setRecon, clearRecon, setBackup, setAr };
}
module.exports = { make };
