'use strict';
// Đối chiếu công nợ phải trả 331 theo đối tượng × hợp đồng.
// Số dư = Có 331 − Nợ 331 (dương = còn phải trả; âm = ứng trước cho nhà cung cấp – vd TK 3311 trả trước theo hợp đồng).
// Hợp đồng dùng giá trị sau điều chỉnh (field_adj field 'contract' – cùng bảng với mô-đun Điều chỉnh dữ liệu).
const sigOf = r => [r.doc, r.d, r.dr, r.cr, Math.round((+(r.aa ?? r.a) || 0) * 100), r.bp || '', r.bpCr || ''].join('|');

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS ap331_partner(bp TEXT PRIMARY KEY, name TEXT, contact TEXT, email TEXT, tel TEXT, updated_at TEXT)`);
  for (const c of ['status TEXT', 'st_note TEXT', 'st_asof TEXT', 'st_at TEXT']) { try { db.exec(`ALTER TABLE ap331_partner ADD COLUMN ${c}`); } catch { } }
  // Giao việc đối chiếu cho nhân viên theo kỳ (ym = tháng của ngày 'đến')
  db.exec(`CREATE TABLE IF NOT EXISTS ap331_assign(bp TEXT, ym TEXT, staff TEXT, name TEXT, email TEXT, due TEXT, note TEXT, pfrom TEXT, pto TEXT, mailed_at TEXT, PRIMARY KEY(bp, ym))`);
  db.exec(`CREATE TABLE IF NOT EXISTS ap331_status(bp TEXT, ym TEXT, status TEXT, note TEXT, at TEXT, PRIMARY KEY(bp, ym))`);
  try { db.exec(`INSERT OR IGNORE INTO ap331_status(bp, ym, status, note, at) SELECT bp, substr(st_asof,1,7), status, st_note, st_at FROM ap331_partner WHERE status<>'' AND st_asof<>''`); } catch { }
  const day = d => String(d || '').slice(0, 10), s = v => String(v ?? '').trim();
  const accW = a => { const p = s(a).replace(/[^0-9]/g, '') || '331'; return { w: p, l: p + '%' }; };
  // các vế 331 (mỗi dòng bút toán có thể có vế Nợ 331 và/hoặc vế Có 331)
  function legs(o = {}, bps) {
    const A = accW(o.acc), to = day(o.to) || '9999-12-31', B = bps && bps.length ? ` AND bp IN (${bps.map(() => '?').join(',')})` : '';
    return all(`SELECT * FROM (
        SELECT e.id, 'dr' side, e.account_date d, e.document_no doc, e.acc_debit acc, e.acc_credit oacc, e.partner_debit bp, e.amount a, coalesce(e.amount_acc, e.amount) aa, e.description ds, e.created_by u, e.contract c0,
          coalesce((SELECT f.value FROM field_adj f WHERE f.id=e.id AND f.field='contract'), e.contract) c, e.acc_debit dr, e.acc_credit cr, e.partner_debit bpDr, e.partner_credit bpCr, e.invoice inv
        FROM entries e WHERE e.acc_debit LIKE ? AND e.account_date<=?
        UNION ALL
        SELECT e.id, 'cr', e.account_date, e.document_no, e.acc_credit, e.acc_debit, e.partner_credit, e.amount, coalesce(e.amount_acc, e.amount), e.description, e.created_by, e.contract,
          coalesce((SELECT f.value FROM field_adj f WHERE f.id=e.id AND f.field='contract'), e.contract), e.acc_debit, e.acc_credit, e.partner_debit, e.partner_credit, e.invoice
        FROM entries e WHERE e.acc_credit LIKE ? AND e.account_date<=?) WHERE 1${B} ORDER BY d, id`, A.l, to, A.l, to, ...(bps || []));
  }
  const agg = (L, from) => { const M = new Map();
    for (const x of L) { const k = s(x.c), o = M.get(k) || M.set(k, { c: k, open: 0, cr: 0, dr: 0, close: 0, n: 0, last: '' }).get(k), v = x.side === 'cr' ? x.a : -x.a;
      if (x.d < from) o.open += v; else { if (x.side === 'cr') o.cr += x.a; else o.dr += x.a; o.n++; } o.close += v; if (x.d > o.last) o.last = x.d; }
    return [...M.values()]; };
  const nz = v => Math.abs(v) > 0.004;
  function report(o = {}) {
    const to = day(o.to) || new Date().toISOString().slice(0, 10), from = day(o.from) || to.slice(0, 4) + '-01-01', L = legs({ ...o, to }), G = new Map();
    for (const x of L) { const k = x.bp || ''; (G.get(k) || G.set(k, []).get(k)).push(x); }
    const info = new Map(all(`SELECT * FROM ap331_partner`).map(r => [r.bp, r]));
    const ym = to.slice(0, 7), ASG = new Map(all(`SELECT * FROM ap331_assign WHERE ym=?`, ym).map(r => [r.bp, r])), STm = new Map(all(`SELECT * FROM ap331_status WHERE ym=?`, ym).map(r => [r.bp, r])), PREV = new Map(all(`SELECT s.* FROM ap331_status s JOIN (SELECT bp, max(ym) m FROM ap331_status WHERE ym<? GROUP BY bp) x ON x.bp=s.bp AND x.m=s.ym`, ym).map(r => [r.bp, r]));
    let rows = [...G].map(([bp, X]) => { const C = agg(X, from).filter(c => nz(c.open) || nz(c.cr) || nz(c.dr) || nz(c.close)).sort((a, b) => Math.abs(b.close) - Math.abs(a.close));
      const t = k => C.reduce((q, c) => q + c[k], 0);
      return { bp, contracts: C, open: t('open'), cr: t('cr'), dr: t('dr'), close: t('close'), pay: C.filter(c => c.close > 0.004).reduce((q, c) => q + c.close, 0), adv: -C.filter(c => c.close < -0.004).reduce((q, c) => q + c.close, 0),
        nOpenC: C.filter(c => nz(c.close)).length, noC: C.filter(c => !c.c && nz(c.close)).reduce((q, c) => q + c.close, 0), info: info.get(bp) || null, asg: ASG.get(bp) || null, st: STm.get(bp) || null, prev: PREV.get(bp) || null }; })
      .filter(r => r.contracts.length);
    const q = s(o.q).toLowerCase(); if (q) rows = rows.filter(r => (r.bp + ' ' + r.contracts.map(c => c.c).join(' ')).toLowerCase().includes(q));
    if (o.only === 'open') rows = rows.filter(r => r.nOpenC); else if (o.only === 'adv') rows = rows.filter(r => r.adv > 0.004); else if (o.only === 'mixed') rows = rows.filter(r => r.adv > 0.004 && r.pay > 0.004); else if (o.only === 'noc') rows = rows.filter(r => nz(r.noC)); else if (o.only === 'zero') rows = rows.filter(r => !nz(r.close) && r.nOpenC); else if (o.only === 'nonzero') rows = rows.filter(r => nz(r.close)); const stOf = r => (r.st && r.st.status) || ''; if (o.st === 'hideok') rows = rows.filter(r => stOf(r) !== 'ok'); else if (o.st === 'none') rows = rows.filter(r => !stOf(r)); else if (o.st) rows = rows.filter(r => stOf(r) === o.st);
    if (o.who === '__none') rows = rows.filter(r => !r.asg); else if (o.who) rows = rows.filter(r => r.asg && String(r.asg.staff).split(';').includes(o.who)); // một đối tác có thể giao cho nhiều nhân viên (mã cách nhau ;)
    rows.sort((a, b) => Math.abs(b.close) - Math.abs(a.close));
    const t = k => rows.reduce((q, r) => q + r[k], 0);
    return { from, to, ym: to.slice(0, 7), acc: accW(o.acc).w, rows, tot: { open: t('open'), cr: t('cr'), dr: t('dr'), close: t('close'), pay: t('pay'), adv: t('adv') } };
  }
  // Chi tiết một đối tượng: giao dịch theo hợp đồng – chỉ các hợp đồng còn số dư (trừ khi all=true)
  function detail(bp, o = {}) {
    const to = day(o.to) || new Date().toISOString().slice(0, 10), from = day(o.from) || to.slice(0, 4) + '-01-01', L = legs({ ...o, to }, [bp]);
    const C = agg(L, from), keep = new Set(C.filter(c => o.all || nz(c.close)).map(c => c.c));
    const contracts = C.filter(c => keep.has(c.c)).sort((a, b) => Math.abs(b.close) - Math.abs(a.close));
    const lines = L.filter(x => keep.has(s(x.c))).map(x => ({ ...x, c: s(x.c), v: x.side === 'cr' ? x.a : -x.a, inP: x.d >= from, adj: s(x.c) !== s(x.c0) }));
    const allC = [...new Set(C.map(c => c.c).concat(all(`SELECT DISTINCT contract c FROM entries WHERE (partner_debit=? OR partner_credit=?) AND contract<>'' LIMIT 500`, bp, bp).map(r => r.c)))].filter(Boolean).sort();
    return { bp, from, to, contracts, lines, allC, hidden: C.length - contracts.length, info: get(`SELECT * FROM ap331_partner WHERE bp=?`, bp) || null, st: get(`SELECT * FROM ap331_status WHERE bp=? AND ym=?`, bp, to.slice(0, 7)) || null, hist: all(`SELECT * FROM ap331_status WHERE bp=? ORDER BY ym DESC LIMIT 24`, bp) };
  }
  // Điều chỉnh hợp đồng của bút toán (theo id) – lưu ở field_adj 'contract'; value '' = trả về hợp đồng gốc
  function setContract(ids, value, note = '') { let n = 0; const v = s(value);
    for (const id of [].concat(ids || [])) { const e = get(`SELECT id, document_no doc, account_date d, acc_debit dr, acc_credit cr, amount a, coalesce(amount_acc, amount) aa, partner_debit bp, partner_credit bpCr, contract FROM entries WHERE id=?`, +id); if (!e) continue;
      if (!v || v === s(e.contract)) run(`DELETE FROM field_adj WHERE id=? AND field='contract'`, e.id);
      else run(`INSERT OR REPLACE INTO field_adj(id, field, value, orig, sig, doc, d, ym, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`, e.id, 'contract', v, e.contract, sigOf(e), e.doc, e.d, String(e.d || '').slice(0, 7), note || 'Đối chiếu 331');
      n++; }
    return { n }; }
  function setPartner(bp, o = {}) { run(`INSERT INTO ap331_partner(bp, name, contact, email, tel, updated_at) VALUES(?,?,?,?,?,datetime('now','localtime')) ON CONFLICT(bp) DO UPDATE SET name=excluded.name, contact=excluded.contact, email=excluded.email, tel=excluded.tel, updated_at=excluded.updated_at`, bp, s(o.name), s(o.contact), s(o.email), s(o.tel)); return get(`SELECT * FROM ap331_partner WHERE bp=?`, bp); }
  // Trạng thái đối chiếu theo đối tượng: 'ok' đã khớp, 'diff' chưa khớp, '' chưa đối chiếu
  function setStatus(bps, status, note = '', asOf = '') { let n = 0; const ym = day(asOf).slice(0, 7) || new Date().toISOString().slice(0, 7);
    for (const bp of [].concat(bps || [])) { if (!s(status)) run(`DELETE FROM ap331_status WHERE bp=? AND ym=?`, bp, ym); else run(`INSERT OR REPLACE INTO ap331_status(bp, ym, status, note, at) VALUES(?,?,?,?,datetime('now','localtime'))`, bp, ym, s(status), s(note)); n++; }
    return { n }; }
  function assign(bps, o = {}) { const ym = day(o.to).slice(0, 7); let n = 0;
    for (const bp of [].concat(bps || [])) { if (!o.staff) run(`DELETE FROM ap331_assign WHERE bp=? AND ym=?`, bp, ym);
      else run(`INSERT OR REPLACE INTO ap331_assign(bp, ym, staff, name, email, due, note, pfrom, pto, mailed_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, bp, ym, s(o.staff), s(o.name), s(o.email), s(o.due), s(o.note), day(o.from), day(o.to), o.mailed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null); n++; }
    return { n }; }
  const assignList = (o = {}) => all(`SELECT * FROM ap331_assign WHERE ym=? ORDER BY name, bp`, day(o.to).slice(0, 7));
  return { report, detail, setContract, setPartner, setStatus, assign, assignList };
}
module.exports = { make };
