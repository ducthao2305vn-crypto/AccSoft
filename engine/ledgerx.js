'use strict';
// Phân tích sổ chi tiết (ledger) theo tài khoản × đối tượng: tự đánh giá tình trạng khớp từng dòng hạch toán và lưu lại kết quả.
// Mỗi dòng = một vế của bút toán trên tài khoản đã chọn (vế Nợ: +số tiền, vế Có: −số tiền).
// Thứ tự tự khớp (đặt mã nhóm khớp cho các dòng cộng lại = 0):
//   1) Cùng chứng từ: các vế của cùng số chứng từ cộng lại = 0 (điều chỉnh / chuyển đối tượng / đảo bút toán)
//   2) Cặp đúng số tiền: một dòng Nợ X và một dòng Có X (ưu tiên gần ngày nhất, cùng tham chiếu trong diễn giải)
//   3) Nhóm theo tham chiếu chung trong diễn giải (số đề nghị, số hoá đơn, mã…) có tổng = 0
//   4) Còn lại: FIFO Nợ ↔ Có → các dòng được bù trừ hết = "Cần phân tích" (khớp tương đối); phần còn treo = "Chưa khớp"
// Kết quả lưu ở bảng lg_line (theo id + vế). Lần sau: dòng đã "Khớp" giữ nguyên; trạng thái / ghi chú người dùng sửa tay không bị ghi đè;
// chỉ các dòng mới hoặc chưa khớp được phân tích lại (để khớp với phát sinh mới).
function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS lg_line(id INTEGER, side TEXT, acc TEXT, bp TEXT, status TEXT, grp TEXT, how TEXT, note TEXT, manual INTEGER DEFAULT 0, left REAL, at TEXT, PRIMARY KEY(id, side));
    CREATE INDEX IF NOT EXISTS ix_lg_line_bp ON lg_line(acc, bp);`);
  const s = v => String(v ?? '').trim(), day = d => String(d || '').slice(0, 10), Z = v => Math.abs(v) < 0.005;
  const accL = a => (s(a).replace(/[^0-9]/g, '') || '0') + '%';
  // đối tượng có phát sinh trên tài khoản
  function partners(acc) { const L = accL(acc);
    return all(`SELECT p, count(*) n, sum(v) bal FROM (SELECT partner_debit p, amount v FROM entries WHERE acc_debit LIKE ? UNION ALL SELECT partner_credit, -amount FROM entries WHERE acc_credit LIKE ?) GROUP BY 1 ORDER BY 2 DESC LIMIT 5000`, L, L)
      .map(r => ({ bp: r.p || '', n: r.n, bal: r.bal })); }
  function legs(acc, bp, to) { const L = accL(acc), t = day(to) || '9999-12-31', B = bp === '*' ? '' : ' AND ifnull(p,\'\')=?';
    return all(`SELECT * FROM (
      SELECT e.id, 'dr' side, e.account_date d, e.document_no doc, e.description ds, e.acc_debit dr, e.acc_credit cr, e.acc_debit acc, e.acc_credit oacc, e.partner_debit p, e.amount a, e.amount v, e.created_by u, e.invoice inv, e.advance_request ar, e.contract c FROM entries e WHERE e.acc_debit LIKE ? AND e.account_date<=?
      UNION ALL
      SELECT e.id, 'cr', e.account_date, e.document_no, e.description, e.acc_debit, e.acc_credit, e.acc_credit, e.acc_debit, e.partner_credit, e.amount, -e.amount, e.created_by, e.invoice, e.advance_request, e.contract FROM entries e WHERE e.acc_credit LIKE ? AND e.account_date<=?) WHERE 1${B} ORDER BY d, id, side`, L, t, L, t, ...(bp === '*' ? [] : [s(bp)])); }
  // tham chiếu trong diễn giải: chuỗi có chữ số, dài ≥ 5 (số chứng từ, đề nghị, hoá đơn…), bỏ ngày tháng / năm / số tiền
  const refs = x => { const t = new Set((String(x.ds || '').toUpperCase().match(/[A-Z0-9][A-Z0-9\/\-_.]{4,}/g) || []).filter(w => /\d/.test(w) && /[A-Z]/.test(w) || /\d{6,}/.test(w)).filter(w => !/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(w)));
    for (const k of [x.inv, x.ar]) if (s(k)) t.add(s(k).toUpperCase()); return t; };
  function analyze(L) { // L: các dòng cần phân tích (chưa khớp) – trả Map key→{status, grp, how, left}
    const R = new Map(), key = x => x.id + '|' + x.side, done = new Set(); let g = 0;
    const RUN = Date.now().toString(36).slice(-4).toUpperCase(), mark = (xs, how) => { g++; const id = RUN + '-' + g; for (const x of xs) { done.add(key(x)); R.set(key(x), { status: 'ok', grp: id, how, left: 0 }); } };
    // 1) cùng chứng từ
    const byDoc = new Map(); for (const x of L) { const k = s(x.doc); if (k) (byDoc.get(k) || byDoc.set(k, []).get(k)).push(x); }
    for (const [, xs] of byDoc) if (xs.length > 1 && Z(xs.reduce((q, x) => q + x.v, 0))) mark(xs, 'Cùng chứng từ (Nợ = Có)');
    // 2) cặp đúng số tiền
    const rest = () => L.filter(x => !done.has(key(x))), RF = new Map(L.map(x => [key(x), refs(x)]));
    const pos = rest().filter(x => x.v > 0), neg = rest().filter(x => x.v < 0), byAmt = new Map();
    for (const x of neg) { const k = Math.round(-x.v * 100); (byAmt.get(k) || byAmt.set(k, []).get(k)).push(x); }
    for (const x of pos) { const C = (byAmt.get(Math.round(x.v * 100)) || []).filter(y => !done.has(key(y))); if (!C.length) continue;
      const rx = RF.get(key(x)), sc = y => { const ry = RF.get(key(y)); let c = 0; for (const w of rx) if (ry.has(w)) c++; return c; };
      const t0 = Date.parse(x.d), best = C.map(y => ({ y, c: sc(y), dd: Math.abs(Date.parse(y.d) - t0) })).sort((a, b) => b.c - a.c || a.dd - b.dd)[0];
      mark([x, best.y], best.c ? 'Cặp đúng số tiền + cùng tham chiếu' : 'Cặp đúng số tiền'); }
    // 2b) theo tổng chứng từ: tổng các dòng cùng chứng từ (cùng chiều) = một chứng từ ngược chiều (vd chứng từ ghi nhận nhiều dòng ↔ một lần chi trả)
    { const U = new Map(); for (const x of rest()) { const k = s(x.doc) + '|' + (x.v > 0 ? '+' : '-'); (U.get(k) || U.set(k, { xs: [], v: 0, d: x.d, w: new Set() }).get(k)).xs.push(x); }
      for (const u of U.values()) { u.v = u.xs.reduce((q, x) => q + x.v, 0); u.d = u.xs[0].d; for (const x of u.xs) for (const w of String(x.ds || '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 3) u.w.add(w); }
      const UP = [...U.values()].filter(u => u.v > 0), UN = [...U.values()].filter(u => u.v < 0), byV = new Map();
      for (const u of UN) { const k = Math.round(-u.v * 100); (byV.get(k) || byV.set(k, []).get(k)).push(u); }
      for (const u of UP) { if (u.xs.length < 2 && (byV.get(Math.round(u.v * 100)) || []).every(v => v.xs.length < 2)) continue;
        const C = (byV.get(Math.round(u.v * 100)) || []).filter(v => !v.used && v.xs.every(x => !done.has(key(x)))); if (!C.length || u.xs.some(x => done.has(key(x)))) continue;
        const sim = v => { let c = 0; for (const w of u.w) if (v.w.has(w)) c++; return c; }, t0 = Date.parse(u.d);
        const b = C.map(v => ({ v, c: sim(v), dd: Math.abs(Date.parse(v.d) - t0) })).sort((a, b) => b.c - a.c || a.dd - b.dd)[0]; b.v.used = true; mark([...u.xs, ...b.v.xs], 'Khớp tổng chứng từ'); } }
    // 3) nhóm theo tham chiếu chung có tổng = 0
    const byRef = new Map(); for (const x of rest()) for (const w of RF.get(key(x))) (byRef.get(w) || byRef.set(w, []).get(w)).push(x);
    const cand = [...byRef].filter(([, xs]) => xs.length >= 2 && xs.length <= 60).sort((a, b) => a[1].length - b[1].length);
    for (const [w, xs0] of cand) { const xs = xs0.filter(x => !done.has(key(x))); if (xs.length >= 2 && xs.some(x => x.v > 0) && xs.some(x => x.v < 0) && Z(xs.reduce((q, x) => q + x.v, 0))) mark(xs, 'Nhóm tham chiếu “' + w + '”'); }
    // 3b) nhóm cùng nội dung diễn giải (bỏ số tiền, ký tự đặc biệt) có tổng = 0 – vd 2 dòng ghi nhận + 1 dòng chi trả cùng đề nghị
    const dk = x => String(x.ds || '').toLowerCase().replace(/\$?\s?[\d,]+\.\d{1,2}\b/g, ' ').replace(/(amount|total|with|usd|\$)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
    const byDs = new Map(); for (const x of rest()) { const k = dk(x); if (k.length >= 12) (byDs.get(k) || byDs.set(k, []).get(k)).push(x); }
    for (const [, xs] of byDs) { if (xs.length < 2 || !xs.some(x => x.v > 0) || !xs.some(x => x.v < 0)) continue;
      if (Z(xs.reduce((q, x) => q + x.v, 0))) { mark(xs, 'Nhóm cùng diễn giải'); continue; }
      // một dòng = tổng các dòng ngược chiều cùng diễn giải
      for (const x of xs) { if (done.has(key(x))) continue; const opp = xs.filter(y => !done.has(key(y)) && Math.sign(y.v) !== Math.sign(x.v)); if (opp.length >= 2 && opp.length <= 20 && Z(opp.reduce((q, y) => q + y.v, 0) + x.v)) mark([x, ...opp], 'Nhóm cùng diễn giải (1 ↔ nhiều)'); } }
    // 4) FIFO
    const P = rest().filter(x => x.v > 0).map(x => ({ x, left: x.v })), N = rest().filter(x => x.v < 0).map(x => ({ x, left: -x.v }));
    let i = 0, j = 0; while (i < P.length && j < N.length) { const q = Math.min(P[i].left, N[j].left); P[i].left -= q; N[j].left -= q; if (P[i].left < 0.005) i++; if (N[j].left < 0.005) j++; }
    for (const o of P.concat(N)) R.set(key(o.x), Z(o.left) ? { status: 'check', grp: '', how: 'Bù trừ FIFO (tương đối)', left: 0 } : { status: 'open', grp: '', how: o.left < Math.abs(o.x.v) - 0.004 ? 'Còn treo một phần (FIFO)' : 'Chưa có khoản đối ứng', left: (o.x.v > 0 ? 1 : -1) * o.left });
    return R; }
  // Báo cáo: phân tích (dùng kết quả đã lưu) và trả các dòng trong kỳ
  function report(o = {}) {
    const acc = s(o.acc), bp = o.bp == null ? '' : String(o.bp), to = day(o.to) || new Date().toISOString().slice(0, 10), from = day(o.from) || '1900-01-01';
    if (!acc) throw new Error('Chọn tài khoản cần phân tích');
    const L = legs(acc, bp, to), key = x => x.id + '|' + x.side;
    const S = new Map(all(`SELECT * FROM lg_line WHERE id IN (SELECT id FROM entries WHERE (acc_debit LIKE ? OR acc_credit LIKE ?) AND account_date<=?)`, accL(acc), accL(acc), to).map(r => [r.id + '|' + r.side, r]));
    // các dòng đã khớp (tự động) hoặc đã sửa tay giữ nguyên; phần còn lại phân tích lại
    const keep = x => { const r = S.get(key(x)); return r && (r.manual || r.status === 'ok') && (!o.reanalyze || r.manual); };
    const todo = L.filter(x => !keep(x)), A = analyze(todo), stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.exec('BEGIN'); try {
      for (const x of todo) { const a = A.get(key(x)), r = S.get(key(x));
        run(`INSERT INTO lg_line(id, side, acc, bp, status, grp, how, note, manual, left, at) VALUES(?,?,?,?,?,?,?,?,0,?,?) ON CONFLICT(id, side) DO UPDATE SET acc=excluded.acc, bp=excluded.bp, status=excluded.status, grp=excluded.grp, how=excluded.how, left=excluded.left, at=excluded.at`,
          x.id, x.side, x.acc, x.p || '', a.status, a.grp, a.how, r ? r.note : '', a.left, stamp); S.set(key(x), { ...(r || {}), ...a, note: r ? r.note : '', manual: 0 }); }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    let open = 0; const rows = [];
    for (const x of L) { const r = S.get(key(x)) || {}; if (x.d < from) { open += x.v; continue; }
      rows.push({ id: x.id, side: x.side, d: x.d, doc: x.doc, ds: x.ds, dr: x.dr, cr: x.cr, acc: x.acc, oacc: x.oacc, bp: x.p || '', a: x.a, v: x.v, u: x.u, status: r.status || 'open', grp: r.grp || '', how: r.how || '', note: r.note || '', manual: !!r.manual, left: r.left ?? x.v }); }
    const cnt = k => rows.filter(r => r.status === k).length, sum = k => rows.filter(r => r.status === k).reduce((q, r) => q + r.v, 0);
    return { acc, bp, from, to, open, dr: rows.filter(r => r.v > 0).reduce((q, r) => q + r.v, 0), cr: -rows.filter(r => r.v < 0).reduce((q, r) => q + r.v, 0), close: open + rows.reduce((q, r) => q + r.v, 0),
      rows, n: { ok: cnt('ok'), open: cnt('open'), check: cnt('check') }, sum: { ok: sum('ok'), open: rows.filter(r => r.status === 'open').reduce((q, r) => q + (r.left || 0), 0), check: sum('check') }, analyzed: todo.length, total: L.length };
  }
  // Sửa tay: trạng thái và / hoặc ghi chú cho các dòng [{id, side}]; status '' = giữ nguyên trạng thái, chỉ sửa ghi chú; status 'auto' = trả về tự động
  function setLine(keys, status, note) { let n = 0;
    for (const k of [].concat(keys || [])) { const r = get(`SELECT * FROM lg_line WHERE id=? AND side=?`, +k.id, k.side); if (!r) continue;
      if (status === 'auto') run(`UPDATE lg_line SET manual=0, status='open', grp='', at=NULL WHERE id=? AND side=?`, +k.id, k.side);
      else if (status) run(`UPDATE lg_line SET status=?, manual=1, how=? WHERE id=? AND side=?`, status, 'Người dùng đánh dấu', +k.id, k.side);
      if (note != null) run(`UPDATE lg_line SET note=? WHERE id=? AND side=?`, s(note), +k.id, k.side); n++; }
    return { n }; }
  return { partners, report, setLine };
}
module.exports = { make };
