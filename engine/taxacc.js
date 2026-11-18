'use strict';
// Phân tích tài khoản thuế (mặc định 333x): mỗi dòng bút toán có vế TK thuế → 1 dòng phân tích (bút toán Nợ thuế / Có thuế cả 2 vế → 2 dòng).
// Kỳ kê khai mặc định = năm_tháng ngày chứng từ; người dùng đổi kỳ (lưu tax_period theo id bút toán + vế, kèm chữ ký nội dung để gắn lại khi nạp lại dữ liệu).
// Tổng hợp theo TK thuế × kỳ kê khai và theo năm: Có (kê khai / phải nộp) − Nợ (nộp tiền / khấu trừ) = chênh lệch, kỳ đã khớp phải = 0.
const SIG = `document_no||'|'||account_date||'|'||acc_debit||'|'||acc_credit||'|'||cast(round(coalesce(amount_acc,amount)*100) AS INTEGER)||'|'||ifnull(partner_debit,'')||'|'||ifnull(partner_credit,'')`;
// nhóm loại thuế theo diễn giải (không dấu, chữ thường)
const KW = { imp: [/import (tax|duty)/, /\bcustom/], sales: [/sales? tax/, /selective/], cit: [/corporate income/, /profit tax/, /\bcit\b/, /income tax instal/], pit: [/personal income/, /\bpit\b/, /wage tax/, /salary tax/], wht: [/withholding/, /\bwht\b/] };
const KWN = { imp: 'thuế nhập khẩu', sales: 'thuế bán hàng / tiêu thụ', cit: 'thuế TNDN', pit: 'thuế thu nhập cá nhân', wht: 'thuế khấu trừ tại nguồn (WHT)' };
const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const kwOf = s => { const t = nz(s); return Object.keys(KW).filter(k => KW[k].some(r => r.test(t))); };
// Hồ sơ từng TK thuế từ dữ liệu: TK đối ứng vế kê khai / vế nộp (tỉ trọng), đối tượng nhận tiền nộp chính, loại thuế chủ đạo trong diễn giải, trung vị số tiền theo (TK, vế, đối ứng)
function autoProfile(L, cash) {
  const A = {}, med = {}, put = (m, k, v) => (m[k] = (m[k] || 0) + v);
  for (const x of L) { const a = A[x.acc] || (A[x.acc] = { acc: x.acc, name: x.accName || x.acc, cr: {}, dr: {}, nCr: 0, nDr: 0, payBp: {}, nPay: 0, kw: {}, nKw: 0 });
    const o4 = String(x.other || '').slice(0, 4); if (x.side === 'cr') { put(a.cr, o4, 1); a.nCr++; } else { put(a.dr, o4, 1); a.nDr++; }
    if (x.side === 'dr' && cash(x.other)) { put(a.payBp, x.bp || '(trống)', 1); a.nPay++; }
    const k = kwOf(x.ds); if (k.length) { a.nKw++; for (const g of k) put(a.kw, g, 1); }
    const mk = x.acc + '|' + x.side + '|' + o4; (med[mk] || (med[mk] = [])).push(x.credit || x.debit); }
  for (const a of Object.values(A)) { a.kwMain = Object.keys(a.kw).filter(g => a.nKw >= 3 && a.kw[g] / a.nKw >= 0.4);
    a.payMain = Object.entries(a.payBp).sort((p, q) => q[1] - p[1])[0]; a.payMain = a.payMain && a.nPay >= 3 && a.payMain[1] / a.nPay >= 0.6 ? a.payMain[0] : '';
    const top = (m, n) => Object.entries(m).sort((p, q) => q[1] - p[1]).map(([k, v]) => ({ k, n: v, pct: n ? v / n : 0 }));
    a.crTop = top(a.cr, a.nCr); a.drTop = top(a.dr, a.nDr); }
  const dom = {}; for (const a of Object.values(A)) for (const g of a.kwMain) (dom[g] || (dom[g] = [])).push(a.acc);
  const M = {}; for (const [k, v] of Object.entries(med)) { const s = v.slice().sort((p, q) => p - q); M[k] = { med: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], n: s.length }; }
  return { acc: A, dom, med: M };
}
function reasonsOf(x, P, g, cash) {
  const W = [], a = P.acc[x.acc], o4 = String(x.other || '').slice(0, 4), amt = x.credit || x.debit, f = v => (Math.round(v * 100) / 100).toLocaleString('en-US');
  if (g && Math.abs(g.credit - g.debit) > 0.005) W.push({ k: 'diff', t: `Kỳ ${x.period} còn chênh lệch ${f(g.credit - g.debit)} (kê khai ${f(g.credit)} / nộp ${f(g.debit)})` });
  if (!a) return W;
  // TK đối ứng hiếm gặp với TK thuế này (≤ 2% số dòng cùng vế và ≤ 3 dòng)
  const tops = x.side === 'cr' ? a.crTop : a.drTop, n = x.side === 'cr' ? a.nCr : a.nDr, t = tops.find(z => z.k === o4);
  if (n >= 20 && t && t.n <= 3 && t.pct <= 0.02) W.push({ k: 'contra', t: `TK đối ứng ${o4} hiếm gặp với ${x.acc} (${t.n}/${n} dòng ${x.side === 'cr' ? 'Có' : 'Nợ'}) – thường là ${tops.slice(0, 2).map(z => z.k).join(', ')}` });
  // Nợ TK thuế nhưng đối ứng chi phí 6xx/8xx (giảm thuế vào chi phí) – thường là hạch toán ngược
  if (x.side === 'dr' && /^[68]/.test(o4)) W.push({ k: 'revexp', t: `Nợ ${x.acc} / Có chi phí ${o4} – ghi giảm thuế vào chi phí, có thể hạch toán ngược` });
  // nộp tiền cho đối tượng khác cơ quan thuế thường dùng
  if (x.side === 'dr' && cash(x.other) && a.payMain && (x.bp || '(trống)') !== a.payMain) W.push({ k: 'paybp', t: `Nộp tiền cho đối tượng "${x.bp || '(trống)'}" – thường nộp cho "${a.payMain}"` });
  // diễn giải nói loại thuế khác với loại thuế chủ đạo của TK này
  const kw = kwOf(x.ds); if (kw.length && a.kwMain.length && !kw.some(k => a.kwMain.includes(k))) { const other = kw.flatMap(k => P.dom[k] || []).filter(z => z !== x.acc);
    if (other.length) W.push({ k: 'kw', t: `Diễn giải nói ${kw.map(k => KWN[k]).join(', ')} nhưng hạch toán ${x.acc} – loại thuế này thường ở ${[...new Set(other)].join(', ')}` }); }
  // số tiền bất thường so với các dòng cùng TK, vế, đối ứng
  const m = P.med[x.acc + '|' + x.side + '|' + o4]; if (m && m.n >= 20 && m.med > 0 && amt > Math.max(20 * m.med, 3 * m.p95) && amt > 1000) W.push({ k: 'amt', t: `Số tiền ${f(amt)} vượt xa mức thường (trung vị ${f(m.med)}, cao ${f(m.p95)})` });
  if (amt < 0) W.push({ k: 'neg', t: 'Số tiền âm – bút toán điều chỉnh / đảo' });
  return W;
}
// Kỳ ghi trong diễn giải: "in September 2026", "for month Dec-2017", "Feb 2020", "tháng 9/2026", "T09/2026", "month 03/2026" → '2026_09'
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function descPeriod(ds) { const t = nz(ds); let m = t.match(/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?[\s\-_,/]*((?:19|20)\d\d)(?!\d)/);
  if (m) return m[2] + '_' + String(MON[m[1].slice(0, 3)]).padStart(2, '0');
  m = t.match(/\b(?:thang|month|ky|period|t)\s*(\d{1,2})\s*[/\-.]\s*((?:19|20)\d\d)(?!\d)/); if (m && +m[1] >= 1 && +m[1] <= 12) return m[2] + '_' + String(+m[1]).padStart(2, '0');
  return ''; }
const WHY = { diff: 'Kỳ còn chênh lệch', contra: 'TK đối ứng hiếm gặp', revexp: 'Ghi giảm thuế vào chi phí', paybp: 'Nộp tiền sai đối tượng', kw: 'Diễn giải khác loại thuế', amt: 'Số tiền bất thường', neg: 'Số tiền âm' };
function make(db, all) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS tax_period(id INTEGER, side TEXT, period TEXT, note TEXT, sig TEXT, at TEXT, PRIMARY KEY(id, side))`);
  try { db.exec(`ALTER TABLE tax_period ADD COLUMN st TEXT`); } catch { }
  // xác nhận kỳ chính xác theo TK thuế × kỳ kê khai – lưu ảnh chụp số liệu lúc xác nhận để phát hiện thay đổi về sau
  db.exec(`CREATE TABLE IF NOT EXISTS tax_ok(acc TEXT, period TEXT, credit REAL, debit REAL, n INTEGER, note TEXT, at TEXT, PRIMARY KEY(acc, period))`); // trạng thái phân tích: ok = chính xác, sus = nghi ngờ
  const get = k => { const r = all(`SELECT v FROM settings WHERE k=?`, k)[0]; try { return r && r.v ? JSON.parse(r.v) : null; } catch { return null; } };
  const accs = () => get('taxacc_accs') || ['333'];
  const setAccs = L => { db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES('taxacc_accs', ?)`).run(JSON.stringify(String(L || '').split(/[,; ]+/).filter(Boolean))); return accs(); };
  const like = (col, A) => '(' + A.map(() => `${col} LIKE ?`).join(' OR ') + ')';
  const defP = (d, back = 0) => { let y = +String(d || '').slice(0, 4), m = +String(d || '').slice(5, 7) - back; while (m < 1) { m += 12; y--; } return y + '_' + String(m).padStart(2, '0'); };
  // nộp tiền thường trễ so với kỳ kê khai: dòng Nợ thuế / Có tiền mặc định thuộc kỳ = tháng nộp − lag (mặc định 1 tháng)
  const lag = () => { const v = get('taxacc_lag'); return v == null ? 1 : Math.max(0, +v || 0); };
  const setLag = v => { db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES('taxacc_lag', ?)`).run(JSON.stringify(Math.max(0, +v || 0))); return lag(); };
  const cash = a => /^11[123]/.test(a || '');
  // dòng phân tích trong khoảng ngày (theo ngày chứng từ) – kỳ kê khai đã đổi có thể nằm ngoài khoảng, vẫn hiển thị theo kỳ mới
  function lines(o = {}) {
    // lọc theo KỲ KÊ KHAI (không theo ngày chứng từ): lấy chứng từ rộng ra ±12 tháng rồi giữ dòng có kỳ trong khoảng – để kỳ 12 nộp tiền tháng 1 năm sau vẫn đủ
    const A = accs(), F = String(o.from || '0000-01-01').slice(0, 10), T = String(o.to || '9999-12-31').slice(0, 10), P = A.map(a => a + '%');
    const pf = F.slice(0, 4) + '_' + F.slice(5, 7), pt = T.slice(0, 4) + '_' + T.slice(5, 7), sh = (d, k) => { const y = +d.slice(0, 4) + k; return y < 1 ? d : String(y).padStart(4, '0') + d.slice(4); };
    const f = sh(F, -1), t = sh(T, 1);
    const rows = all(`SELECT e.id, e.document_no doc, e.account_date d, e.description ds, e.description_parent dsp, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drn, e.acc_credit_name crn, e.amount a,
        e.partner_debit bp, e.partner_credit bpCr, e.created_by u FROM entries e WHERE e.account_date>=? AND e.account_date<=? AND (${like('e.acc_debit', A)} OR ${like('e.acc_credit', A)}) ORDER BY e.account_date, e.document_no, e.id`, f, t, ...P, ...P);
    const ov = new Map(all(`SELECT id||'|'||side k, period, note, st FROM tax_period`).map(r => [r.k, r])), LAG = lag();
    const isT = a => A.some(p => String(a || '').startsWith(p)), out = [];
    for (const r of rows) for (const side of ['dr', 'cr']) { const acc = side === 'dr' ? r.dr : r.cr; if (!isT(acc)) continue; const o2 = ov.get(r.id + '|' + side), pay = side === 'dr' && cash(r.cr), pd = descPeriod(r.ds || r.dsp), p0 = pd || defP(r.d, pay ? LAG : 0), pSrc = pd ? 'desc' : pay ? 'lag' : 'date';
      out.push({ id: r.id, side, doc: r.doc, d: r.d, ds: r.ds || r.dsp || '', dr: r.dr, cr: r.cr, acc, accName: side === 'dr' ? r.drn : r.crn, other: side === 'dr' ? r.cr : r.dr,
        debit: side === 'dr' ? r.a : 0, credit: side === 'cr' ? r.a : 0, bp: side === 'dr' ? r.bp : r.bpCr, u: r.u, pay, pSrc, p0, period: o2 && o2.period ? o2.period : p0, changed: !!(o2 && o2.period), note: o2 ? o2.note || '' : '', st: o2 ? o2.st || '' : '' }); }
    return out.filter(x => x.period >= pf && x.period <= pt);
  }
  // tổng hợp theo TK thuế × kỳ kê khai, và theo TK × năm (năm của kỳ kê khai)
  function report(o = {}) {
    let L = lines(o); const lvl = +o.level || 0, K = a => lvl ? String(a).slice(0, lvl) : a, cash = a => /^11[123]/.test(a || ''), r2 = v => Math.round((v || 0) * 100) / 100;
    const accList = [...new Map(L.map(x => [x.acc, x.accName || ''])).entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([a, n]) => ({ acc: a, name: n }));
    const LA = L; if (o.acc) L = L.filter(x => String(x.acc).startsWith(o.acc)); // hồ sơ TK luôn lập từ toàn bộ TK thuế (LA)
    const OK = new Map(all(`SELECT * FROM tax_ok`).map(r => [r.acc + '|' + r.period, r]));
    const byP = new Map(), byY = new Map(), name = new Map();
    for (const x of L) { const acc = K(x.acc); x.gk = acc + '|' + x.period; if (!name.has(acc)) name.set(acc, x.accName || ''); const y = String(x.period).slice(0, 4);
      for (const [M, key, per] of [[byP, acc + '|' + x.period, x.period], [byY, acc + '|' + y, y]]) { const g = M.get(key) || M.set(key, { acc, per, credit: 0, debit: 0, paid: 0, other: 0, n: 0, changed: 0, ok: 0, sus: 0 }).get(key);
        g.credit += x.credit; g.debit += x.debit; if (x.debit) cash(x.other) ? g.paid += x.debit : g.other += x.debit; g.n++; if (x.changed) g.changed++; } }
    // kỳ đã xác nhận: còn khớp ảnh chụp lúc xác nhận ⇒ "confirmed"; khác ⇒ "stale" (có thay đổi sau xác nhận – cần xem lại)
    for (const g of byP.values()) { g.diff = g.credit - g.debit; const c = OK.get(g.acc + '|' + g.per);
      g.conf = c ? (r2(c.credit) === r2(g.credit) && r2(c.debit) === r2(g.debit) && c.n === g.n ? 'ok' : 'stale') : ''; g.confAt = c ? c.at : ''; g.confNote = c ? c.note || '' : ''; }
    // ---- PHÂN TÍCH TỰ ĐỘNG: tự lập hồ sơ từng TK thuế từ dữ liệu, so từng dòng với hồ sơ → lý do nghi ngờ
    const prof = autoProfile(LA, cash);
    for (const x of L) x.why = reasonsOf(x, prof, byP.get(x.gk), cash);
    // trạng thái dòng: tay > tự động (có lý do nghi ngờ ⇒ Nghi ngờ; kỳ đã xác nhận bỏ qua lý do 'kỳ chênh lệch'; không lý do ⇒ Chính xác)
    for (const x of L) { const g = byP.get(x.gk); x.auto = ''; if (g && g.conf === 'ok') x.why = x.why.filter(w => w.k !== 'diff');
      // lý do cấp dòng ⇒ Nghi ngờ; chỉ thuộc kỳ còn chênh lệch ⇒ 'Kỳ lệch' (xem ở tổng hợp kỳ, không tính là nghi ngờ từng dòng); không lý do ⇒ Chính xác
      if (!x.st) { const own = x.why.filter(w => w.k !== 'diff'); if (own.length) { x.stEff = 'sus'; x.auto = 'rule'; } else if (x.why.length) { x.stEff = 'chk'; x.auto = 'diff'; } else { x.stEff = 'ok'; x.auto = g && g.conf === 'ok' ? 'conf' : 'rule'; } } else x.stEff = x.st;
      if (g) { if (x.stEff === 'ok') g.ok++; if (x.stEff === 'sus') g.sus++; } const y = byY.get(K(x.acc) + '|' + String(x.period).slice(0, 4)); if (y) { if (x.stEff === 'ok') y.ok++; if (x.stEff === 'sus') y.sus++; } }
    const fin = M => [...M.values()].map(g => ({ ...g, name: name.get(g.acc) || '', diff: g.credit - g.debit })).sort((a, b) => a.acc.localeCompare(b.acc) || String(a.per).localeCompare(String(b.per)));
    const P = fin(byP), Y = fin(byY);
    for (const g of Y) { const ps = P.filter(z => z.acc === g.acc && String(z.per).startsWith(g.per)); g.confN = ps.filter(z => z.conf === 'ok').length; g.pN = ps.length; }
    const why = {}; for (const x of L) for (const w of x.why) why[w.k] = (why[w.k] || 0) + 1;
    const accTab = Object.values(prof.acc).filter(a => !o.acc || a.acc.startsWith(o.acc)).map(a => ({ ...a, sus: L.filter(x => x.acc === a.acc && x.stEff === 'sus').length, n: L.filter(x => x.acc === a.acc).length })).sort((a, b) => a.acc.localeCompare(b.acc));
    return { why, accTab, accs: accs(), accList, lines: L.length > 20000 && !o.all ? null : L, nLines: L.length, byPeriod: P, byYear: Y,
      tot: { credit: L.reduce((s, x) => s + x.credit, 0), debit: L.reduce((s, x) => s + x.debit, 0), periodsOff: P.filter(g => Math.abs(g.diff) > 0.005 && g.conf !== 'ok').length, changed: L.filter(x => x.changed).length,
        ok: L.filter(x => x.stEff === 'ok').length, sus: L.filter(x => x.stEff === 'sus').length, chk: L.filter(x => x.stEff === 'chk').length, susAuto: L.filter(x => x.auto === 'rule' && x.stEff === 'sus').length, conf: P.filter(g => g.conf === 'ok').length, stale: P.filter(g => g.conf === 'stale').length }, lag: lag() };
  }
  // xác nhận / bỏ xác nhận kỳ chính xác: [{acc, per, credit, debit, n}]
  function confirm(groups, note, undo) { const ins = db.prepare(`INSERT OR REPLACE INTO tax_ok(acc, period, credit, debit, n, note, at) VALUES(?,?,?,?,?,?,datetime('now','localtime'))`), del = db.prepare(`DELETE FROM tax_ok WHERE acc=? AND period=?`);
    db.exec('BEGIN'); let n = 0; try { for (const g of [].concat(groups || [])) { if (!g || !g.acc || !g.per) continue; undo ? del.run(g.acc, g.per) : ins.run(g.acc, g.per, +g.credit || 0, +g.debit || 0, +g.n || 0, note || null); n++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n }; }
  // đổi kỳ kê khai / trạng thái cho các dòng [{id, side}] – giữ thông tin còn lại; bản ghi rỗng (không kỳ, không trạng thái) bị xoá
  function upsert(items, patch) {
    const getR = db.prepare(`SELECT period, note, st FROM tax_period WHERE id=? AND side=?`), del = db.prepare(`DELETE FROM tax_period WHERE id=? AND side=?`);
    const ins = db.prepare(`INSERT OR REPLACE INTO tax_period(id, side, period, note, st, sig, at) VALUES(?,?,?,?,?,(SELECT ${SIG} FROM entries WHERE id=?),datetime('now','localtime'))`);
    db.exec('BEGIN'); let n = 0; try { for (const x of [].concat(items || [])) { if (!x || !x.id) continue; const s = x.side === 'cr' ? 'cr' : 'dr', o = { ...(getR.get(+x.id, s) || {}), ...patch };
      if (!o.period && !o.st) del.run(+x.id, s); else ins.run(+x.id, s, o.period || null, o.note || null, o.st || null, +x.id); n++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n }; }
  function setPeriod(items, period, note) { period = String(period || '').trim(); if (period && !/^\d{4}_\d{2}$/.test(period)) throw new Error('Kỳ kê khai dạng năm_tháng, vd 2026_03');
    return upsert(items, note != null && note !== '' ? { period: period || null, note } : { period: period || null }); }
  function setStatus(items, st, note) { if (st && !['ok', 'sus'].includes(st)) throw new Error('Trạng thái không hợp lệ'); return upsert(items, note ? { st: st || null, note } : { st: st || null }); }
  // gắn lại kỳ đã đổi sau khi nạp lại dữ liệu (id bút toán đổi) theo chữ ký nội dung
  function rebind() { let n = 0;
    for (const x of all(`SELECT k.rowid r, k.sig FROM tax_period k LEFT JOIN entries e ON e.id=k.id WHERE e.id IS NULL AND k.sig IS NOT NULL`)) { const [doc, d, dr, cr, cents, bp, bpCr] = String(x.sig).split('|');
      const e = all(`SELECT id FROM entries WHERE document_no=? AND account_date=? AND acc_debit=? AND acc_credit=? AND round(coalesce(amount_acc,amount)*100)=? AND ifnull(partner_debit,'')=? AND ifnull(partner_credit,'')=? LIMIT 1`, doc, d, dr, cr, +cents, bp, bpCr)[0];
      if (e) { try { run(`UPDATE tax_period SET id=? WHERE rowid=?`, e.id, x.r); n++; } catch { } } }
    return { n }; }
  return { confirm, lines, report, setPeriod, setStatus, rebind, accs, setAccs, lag, setLag };
}
module.exports = { make, WHY };
