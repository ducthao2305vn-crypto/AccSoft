'use strict';
// Công nợ phải thu khác 138811 / 138812 theo đối tượng (FIFO theo đối tượng).
// Phát sinh Nợ 1388x (doanh thu / ghi nợ – thường nhập ngày cuối tháng), Có 1388x (nộp / thu tiền – theo thời gian thực).
// Tuổi nợ tính theo số dư: số dư còn nợ = các khoản ghi Nợ gần nhất cộng đủ số dư (thu tiền trước ngày ghi doanh thu cuối tháng vẫn cân trừ đúng).
// Người dùng đánh dấu bút toán ghi sai đối tượng: loại khỏi tuổi nợ, hoặc chuyển sang đối tượng đúng.
const ACCS = ['138811', '138812'];

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS r1388_wrong(id INTEGER, side TEXT, note TEXT, to_bp TEXT, updated_at TEXT, PRIMARY KEY(id, side))`);
  const day = d => String(d || '').slice(0, 10), days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  // tài khoản: '' = 138811+138812; '138811' / '138812' đúng TK; '1388' / '131' = cả nhóm (theo tiền tố)
  const accsOf = a => { const x = String(a || '').replace(/[^0-9]/g, ''); return ACCS.includes(x) ? [x] : x === '1388' || x === '131' ? [x + '%'] : ACCS; };
  const accW = (A, col) => A.some(a => a.endsWith('%')) ? `${col} LIKE ?` : `${col} IN (${A.map(() => '?').join(',')})`;
  function lines(acc, asOf, bps) {
    const A = accsOf(acc), t = day(asOf) || '9999-12-31', W = A.map(() => '?').join(','), B = bps && bps.length ? ` AND p IN (${bps.map(() => '?').join(',')})` : '';
    const L = all(`SELECT * FROM (
        SELECT e.id, 'dr' side, e.account_date d, e.document_no doc, e.acc_debit acc, e.acc_credit oacc, e.partner_debit p, e.amount dr, 0 cr, e.description ds, e.created_by u FROM entries e WHERE ${accW(A, 'e.acc_debit')} AND e.account_date<=?
        UNION ALL
        SELECT e.id, 'cr', e.account_date, e.document_no, e.acc_credit, e.acc_debit, e.partner_credit, 0, e.amount, e.description, e.created_by FROM entries e WHERE ${accW(A, 'e.acc_credit')} AND e.account_date<=?) WHERE 1${B} ORDER BY d, id`, ...A, t, ...A, t, ...(bps || []));
    const Wr = new Map(all(`SELECT * FROM r1388_wrong`).map(r => [r.id + '|' + r.side, r]));
    for (const x of L) { const w = Wr.get(x.id + '|' + x.side); x.p0 = x.p || ''; if (w) { x.wrong = true; x.note = w.note || ''; x.to = w.to_bp || ''; if (x.to) x.p = x.to; } }
    return L;
  }
  // Khoản còn nợ: lấp số dư (đã loại bút toán ghi sai) bằng các khoản ghi Nợ gần nhất
  function aging(L, asOf) {
    const use = L.filter(x => !x.wrong || x.to), bal = use.reduce((a, x) => a + x.dr - x.cr, 0), out = []; let r = Math.max(0, bal);
    for (const x of use.filter(x => x.dr > 0).reverse()) { if (r <= 0.004) break; const u = Math.min(x.dr, r); r -= u; out.push({ id: x.id, d: x.d, doc: x.doc, ds: x.ds, acc: x.acc, amt: x.dr, left: u, age: days(x.d, asOf) }); }
    return { items: out.reverse(), bal };
  }
  const STOP = new Set(['lda', 'ltd', 'limited', 'unip', 'unipessoal', 'unipesoal', 'sa', 's', 'a', 'co', 'company', 'corp', 'corporation', 'jsc', 'pte', 'plc', 'inc', 'llc', 'the', 'of', 'and', 'de', 'da', 'do', 'dos', 'das', 'e', 'em', 'ip', 'ep']);
  const nameOf = bp => String(bp || '').replace(/^[A-Za-z]+_(?:[A-Za-z]+_)?[A-Za-z]*\d+_?/, '').replace(/^[A-Za-z]+\d+_/, '');
  const normN = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && !STOP.has(w));
  function dupNames(L) { const X = L.map(x => ({ ...x, name: nameOf(x.bp), t: normN(nameOf(x.bp)) })).filter(x => x.t.length), par = X.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i])), why = new Map();
    const key = new Map(); X.forEach((x, i) => { const k = x.t.slice().sort().join(' '); if (key.has(k)) { par[f(i)] = f(key.get(k)); why.set(f(i), 'tên giống nhau'); } else key.set(k, i); });
    for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) { if (f(i) === f(j)) continue; const A = new Set(X[i].t), B = new Set(X[j].t), inter = [...A].filter(w => B.has(w)).length, uni = new Set([...A, ...B]).size;
      const sub = (A.size >= 2 || B.size >= 2) && inter === Math.min(A.size, B.size) && inter >= 2; if ((uni && inter / uni >= 0.75 && inter >= 2) || sub) { par[f(j)] = f(i); } }
    const G = new Map(); X.forEach((x, i) => { const r = f(i); (G.get(r) || G.set(r, []).get(r)).push(x); });
    return [...G.values()].filter(g => g.length > 1 && new Set(g.map(x => x.bp.split('_').slice(0, 2).join('_'))).size > 1).map(g => ({ items: g.map(({ bp, name, bal }) => ({ bp, name, bal })), bal: g.reduce((q, x) => q + x.bal, 0) }))
      .sort((a, b) => b.items.length - a.items.length || Math.abs(b.bal) - Math.abs(a.bal)); }
  function report(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), from = day(o.from) || asOf.slice(0, 4) + '-01-01', L = lines(o.acc, asOf), G = new Map(), over = +o.overDays || 30;
    // bút toán chuyển sang đối tượng đúng: vào nhóm đối tượng đúng; bút toán ghi sai không chuyển: vẫn ở đối tượng gốc nhưng không tính tuổi nợ
    const BK = new Map(); for (const x of L) { const k = x.p0 || ''; BK.set(k, (BK.get(k) || 0) + x.dr - x.cr); } // số dư theo sổ (đối tượng gốc)
    for (const x of L) { const k = x.p || '', g = G.get(k) || G.set(k, { bp: k, L: [], open: 0, dr: 0, cr: 0, wrong: 0, nWrong: 0, moved: 0, last: '' }).get(k);
      g.L.push(x); if (x.d < from) g.open += x.dr - x.cr; else { g.dr += x.dr; g.cr += x.cr; } if (x.wrong && !x.to) { g.wrong += x.dr - x.cr; g.nWrong++; } if (x.to) g.moved++; if (x.d > g.last) g.last = x.d; }
    for (const k of BK.keys()) if (!G.has(k)) G.set(k, { bp: k, L: [], open: 0, dr: 0, cr: 0, wrong: 0, nWrong: 0, moved: 0, last: '' });
    let rows = [...G.values()].map(g => { const close = BK.get(g.bp) || 0, A = aging(g.L, asOf), b = [0, 0, 0, 0]; for (const it of A.items) b[it.age <= 30 ? 0 : it.age <= 60 ? 1 : it.age <= 90 ? 2 : 3] += it.left;
      return { bp: g.bp, open: g.open, dr: g.dr, cr: g.cr, close, wrong: g.wrong, nWrong: g.nWrong, moved: g.moved, adj: A.bal, b, nOpen: A.items.length, oldest: A.items.length ? Math.max(...A.items.map(x => x.age)) : 0, overAmt: A.items.filter(x => x.age > over).reduce((a, x) => a + x.left, 0), last: g.last }; })
      .filter(r => [r.open, r.dr, r.cr, r.close].some(v => Math.abs(v) > 0.004));
    const q = String(o.q || '').toLowerCase(); if (q) rows = rows.filter(r => r.bp.toLowerCase().includes(q));
    if (o.only === 'open') rows = rows.filter(r => Math.abs(r.adj) > 0.004); else if (o.only === 'over') rows = rows.filter(r => r.overAmt > 0.004); else if (o.only === 'neg') rows = rows.filter(r => r.adj < -0.004); else if (o.only === 'wrong') rows = rows.filter(r => r.nWrong || r.moved);
    rows.sort((a, b) => Math.abs(b.adj) - Math.abs(a.adj));
    // nghi trùng tên khác mã: chuẩn hoá tên (bỏ mã, dấu, từ loại hình công ty) rồi nhóm tên giống hệt hoặc gần giống
    const dups = dupNames([...BK.keys()].filter(Boolean).map(bp => ({ bp, bal: BK.get(bp) || 0 })));
    const t = k => rows.reduce((s, r) => s + r[k], 0);
    return { asOf, from, acc: accsOf(o.acc).join(', '), over, rows, tot: { open: t('open'), dr: t('dr'), cr: t('cr'), close: t('close'), wrong: t('wrong'), adj: t('adj'), overAmt: t('overAmt'), b: [0, 1, 2, 3].map(i => rows.reduce((s, r) => s + r.b[i], 0)) },
      nWrong: all(`SELECT count(*) n FROM r1388_wrong`)[0].n, dups };
  }
  function detail(bp, o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), from = day(o.from) || asOf.slice(0, 4) + '-01-01';
    const moved = all(`SELECT id FROM r1388_wrong WHERE to_bp=?`, bp).map(r => r.id);
    let L = lines(o.acc, asOf, [bp]); if (moved.length) { const L2 = lines(o.acc, asOf).filter(x => x.to === bp && !L.some(y => y.id === x.id && y.side === x.side)); L = L.concat(L2).sort((a, b) => a.d.localeCompare(b.d) || a.id - b.id); }
    const mine = L.filter(x => x.p === bp || (x.p0 === bp && x.wrong && !x.to)); let open = 0, bal = 0; const book = [];
    for (const x of mine) if (x.d < from) open += x.dr - x.cr; bal = open;
    for (const x of mine) { if (x.d < from) continue; bal += x.dr - x.cr; book.push({ ...x, bal }); }
    const A = aging(mine, asOf);
    const AA = accsOf(o.acc), partners = all(`SELECT p, count(*) n FROM (SELECT partner_debit p FROM entries WHERE ${accW(AA, 'acc_debit')} UNION ALL SELECT partner_credit FROM entries WHERE ${accW(AA, 'acc_credit')}) WHERE p IS NOT NULL AND p<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 3000`, ...AA, ...AA).map(r => r.p);
    return { bp, asOf, from, open, close: bal, adj: A.bal, dr: book.reduce((a, x) => a + x.dr, 0), cr: book.reduce((a, x) => a + x.cr, 0), book, items: A.items, partners };
  }
  // Đánh dấu bút toán ghi sai: keys [{id, side}], note, toBp ('' = chỉ loại khỏi tuổi nợ); on=false để bỏ đánh dấu
  function setWrong(keys, on, note = '', toBp = '') { let n = 0;
    for (const k of [].concat(keys || [])) { if (on) run(`INSERT OR REPLACE INTO r1388_wrong(id, side, note, to_bp, updated_at) VALUES(?,?,?,?,datetime('now','localtime'))`, +k.id, k.side, note || '', toBp || ''); else run(`DELETE FROM r1388_wrong WHERE id=? AND side=?`, +k.id, k.side); n++; }
    return { n }; }
  function wrongList() { return all(`SELECT w.*, e.account_date d, e.document_no doc, e.amount a, e.description ds, CASE WHEN w.side='dr' THEN e.partner_debit ELSE e.partner_credit END bp, CASE WHEN w.side='dr' THEN e.acc_debit ELSE e.acc_credit END acc FROM r1388_wrong w LEFT JOIN entries e ON e.id=w.id ORDER BY w.updated_at DESC`); }
  return { report, detail, setWrong, wrongList };
}
module.exports = { make };
