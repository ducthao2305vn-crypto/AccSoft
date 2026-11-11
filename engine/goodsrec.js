'use strict';
// Đối chiếu hàng hoá / vật tư theo đối tượng × mặt hàng:
//  - 15611 (hàng hoá tại chi nhánh / cửa hàng) – mẫu "CONFIRMATION OF GOODS SHEET" (số lượng: Đầu kỳ / Nhận / Xuất-thanh lý / Cuối kỳ, cột BRANCH – VTL – DIF)
//  - 14121 (vật tư tạm ứng cho nhân viên / đối tượng) – mẫu "PRODUCT LIABILITY BY PARTNER REPORT" (số lượng + giá trị)
// Đối tượng = partner vế tài khoản (Nợ → nhập / nhận, Có → xuất / trả). Mặt hàng = trường product ("MÃ_Tên"), đơn vị = uom.
// Bút toán số âm (điều chỉnh) giữ nguyên dấu tiền; số lượng mang dấu theo tiền.
function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS gr_assign(kind TEXT, bp TEXT, ym TEXT, staff TEXT, name TEXT, email TEXT, due TEXT, mailed_at TEXT, PRIMARY KEY(kind, bp, ym));
    CREATE TABLE IF NOT EXISTS gr_status(kind TEXT, bp TEXT, ym TEXT, status TEXT, note TEXT, at TEXT, PRIMARY KEY(kind, bp, ym));`);
  const NONE = '(không có đối tượng)';
  const day = d => String(d || '').slice(0, 10), s = v => String(v ?? '').trim();
  const KIND = { '15611': { acc: '15611' }, '14121': { acc: '14121' } };
  const split = p => { const t = s(p), i = t.indexOf('_'); return i > 0 && i < 24 ? { code: t.slice(0, i), name: t.slice(i + 1) } : { code: t, name: t }; };
  const accOf = o => (s(o.acc).replace(/[^0-9]/g, '') || (KIND[o.kind] || KIND['15611']).acc);
  function legs(o, bps) {
    const A = accOf(o) + '%', to = day(o.to) || '9999-12-31', NO = bps && bps.includes(NONE), B0 = (bps || []).filter(b => b !== NONE);
    // "(không có đối tượng)" = bút toán để trống mã đối tượng
    const B = bps && bps.length ? ` AND (${[B0.length ? `bp IN (${B0.map(() => '?').join(',')})` : '', NO ? `ifnull(bp,'')=''` : ''].filter(Boolean).join(' OR ')})` : '', bps0 = B0;
    return all(`SELECT * FROM (
      SELECT 'in' side, account_date d, document_no doc, partner_debit bp, product p, uom u, quantity q, amount a, description ds, id, acc_debit dr, acc_credit cr, partner_credit obp, created_by usr FROM entries WHERE acc_debit LIKE ? AND account_date<=?
      UNION ALL SELECT 'out', account_date, document_no, partner_credit, product, uom, quantity, amount, description, id, acc_debit, acc_credit, partner_debit, created_by FROM entries WHERE acc_credit LIKE ? AND account_date<=?) WHERE 1${B}`, A, to, A, to, ...(bps ? bps0 : []));
  }
  const nz = v => Math.abs(v) > 0.004;
  function build(L, from) {
    const P = new Map();
    for (const x of L) { const bp = s(x.bp) || NONE, it = split(x.p), k = it.code + '|' + s(x.u);
      const g = P.get(bp) || P.set(bp, { bp, items: new Map() }).get(bp), r = g.items.get(k) || g.items.set(k, { code: it.code, name: it.name, unit: s(x.u), oq: 0, oa: 0, iq: 0, ia: 0, xq: 0, xa: 0 }).get(k);
      const a = +x.a || 0, q0 = +x.q || 0, q = q0 < 0 ? q0 : (a < 0 ? -q0 : q0); // SL âm giữ dấu; SL dương + tiền âm (bút toán đảo) = giảm
      if (x.d < from) { const sg = x.side === 'in' ? 1 : -1; r.oq += sg * q; r.oa += sg * a; } else if (x.side === 'in') { r.iq += q; r.ia += a; } else { r.xq += q; r.xa += a; } }
    return [...P.values()].map(g => { const items = [...g.items.values()].map(r => ({ ...r, cq: r.oq + r.iq - r.xq, ca: r.oa + r.ia - r.xa }))
      .filter(r => [r.oq, r.oa, r.iq, r.ia, r.xq, r.xa].some(nz)).sort((a, b) => a.name.localeCompare(b.name));
      const t = k => items.reduce((q, r) => q + r[k], 0);
      return { bp: g.bp, items, tot: Object.fromEntries(['oq', 'oa', 'iq', 'ia', 'xq', 'xa', 'cq', 'ca'].map(k => [k, t(k)])) }; }).filter(g => g.items.length);
  }
  function report(o = {}) {
    const to = day(o.to) || new Date().toISOString().slice(0, 10), from = day(o.from) || to.slice(0, 7) + '-01', kind = KIND[o.kind] ? o.kind : '15611', ym = to.slice(0, 7);
    let rows = build(legs({ ...o, kind, to }), from);
    const info = new Map(all(`SELECT * FROM ap331_partner`).map(r => [r.bp, r])), ASG = new Map(all(`SELECT * FROM gr_assign WHERE kind=? AND ym=?`, kind, ym).map(r => [r.bp, r])), ST = new Map(all(`SELECT * FROM gr_status WHERE kind=? AND ym=?`, kind, ym).map(r => [r.bp, r]));
    rows = rows.map(r => ({ ...r, info: info.get(r.bp) || null, asg: ASG.get(r.bp) || null, st: ST.get(r.bp) || null }));
    const q = s(o.q).toLowerCase(); if (q) rows = rows.filter(r => (r.bp + ' ' + (r.info && r.info.name || '') + ' ' + r.items.map(i => i.code + ' ' + i.name).join(' ')).toLowerCase().includes(q));
    if (o.only === 'open') rows = rows.filter(r => r.items.some(i => nz(i.cq) || nz(i.ca)));
    if (o.who === '__none') rows = rows.filter(r => !r.asg); else if (o.who) rows = rows.filter(r => r.asg && String(r.asg.staff).split(';').includes(o.who));
    if (o.st === 'none') rows = rows.filter(r => !r.st); else if (o.st) rows = rows.filter(r => r.st && r.st.status === o.st);
    rows.sort((a, b) => Math.abs(b.tot.ca) - Math.abs(a.tot.ca) || a.bp.localeCompare(b.bp));
    const T = k => rows.reduce((q, r) => q + r.tot[k], 0);
    // kiểm tra: tổng cuối kỳ (mọi đối tượng, không lọc) = số dư sổ cái TK (Nợ − Có) đến ngày 'đến'
    const A = accOf({ ...o, kind }) + '%', all0 = build(legs({ ...o, kind, to }), from), sum0 = k => all0.reduce((q, r) => q + r.tot[k], 0);
    const glA = get(`SELECT (SELECT ifnull(sum(amount),0) FROM entries WHERE acc_debit LIKE ? AND account_date<=?) - (SELECT ifnull(sum(amount),0) FROM entries WHERE acc_credit LIKE ? AND account_date<=?) b`, A, to, A, to).b;
    const chk = { gl: glA, rep: sum0('ca'), diff: sum0('ca') - glA, none: (all0.find(r => r.bp === NONE) || { tot: { ca: 0 } }).tot.ca };
    return { chk, kind, acc: accOf({ ...o, kind }), from, to, ym, rows, tot: Object.fromEntries(['oq', 'oa', 'iq', 'ia', 'xq', 'xa', 'cq', 'ca'].map(k => [k, T(k)])) };
  }
  function detail(bp, o = {}) { const r = report({ ...o, q: '', only: '', who: '', st: '' }); return { ...r, row: r.rows.find(x => x.bp === bp) || null }; }
  // chứng từ của một đối tượng × mặt hàng (xem khi nhấn đúp)
  function lines(bp, code, o = {}, name = '') { const to = day(o.to), from = day(o.from); return legs({ ...o, to }, [bp]).filter(x => !code || (split(x.p).code === code && (!name || split(x.p).name === name))).map(x => ({ ...x, inP: x.d >= from })).sort((a, b) => a.d.localeCompare(b.d)); }
  function assign(kind, bps, o = {}) { const ym = day(o.to).slice(0, 7);
    for (const bp of [].concat(bps || [])) { if (!o.staff) run(`DELETE FROM gr_assign WHERE kind=? AND bp=? AND ym=?`, kind, bp, ym);
      else run(`INSERT OR REPLACE INTO gr_assign(kind, bp, ym, staff, name, email, due, mailed_at) VALUES(?,?,?,?,?,?,?,?)`, kind, bp, ym, s(o.staff), s(o.name), s(o.email), s(o.due), o.mailed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null); }
    return { n: [].concat(bps || []).length }; }
  const assignList = (kind, o = {}) => all(`SELECT * FROM gr_assign WHERE kind=? AND ym=?`, kind, day(o.to).slice(0, 7));
  function setStatus(kind, bps, status, note, to) { const ym = day(to).slice(0, 7);
    for (const bp of [].concat(bps || [])) { if (!s(status)) run(`DELETE FROM gr_status WHERE kind=? AND bp=? AND ym=?`, kind, bp, ym); else run(`INSERT OR REPLACE INTO gr_status(kind, bp, ym, status, note, at) VALUES(?,?,?,?,?,datetime('now','localtime'))`, kind, bp, ym, s(status), s(note)); }
    return true; }
  // thông tin người ký VTL (dùng chung các biểu mẫu)
  const signers = () => JSON.parse(get(`SELECT v FROM settings WHERE k='gr_signers'`)?.v || 'null') || { vgd: 'Mr. Phung Trung Dung', vgdPos: 'Vice General Director of VTL', cfo: 'Mr. Nguyen Tran Duc Thao', cfoPos: 'Chief Finance Officer of VTL', staff: '', staffPos: 'Finance Staff', chief: '' };
  const setSigners = o => { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('gr_signers', ?)`, JSON.stringify(o || {})); return signers(); };
  return { report, detail, lines, assign, assignList, setStatus, signers, setSigners, split };
}
module.exports = { make };
