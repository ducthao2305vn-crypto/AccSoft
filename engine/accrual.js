'use strict';
// Đối chiếu trích trước 335 với chi phí thực tế: phát hiện đã ghi chi phí thực tế nhưng chưa huỷ trích (chi phí bị ghi 2 lần).
// Mẫu hạch toán trong dữ liệu ERP:
//   Trích trước:  Nợ 6xx / Có 335x, số dương  – "Estimate … In April 2026"
//   Huỷ trích:    Nợ 6xx / Có 335x, số ÂM (hoặc Nợ 335x / Có 6xx) – cùng kỳ dịch vụ
//   Thực tế:      Nợ 6xx / Có 331x (111, 112, 141…), số dương – "Real … In April 2026", có số hoá đơn
//   Quyết toán qua 335 (đúng): Nợ 335x / Có 331x – cũng làm giảm số trích
// Khoá đối chiếu: đối tượng × khoản mục × kỳ dịch vụ (đọc từ diễn giải; không có thì lấy tháng hạch toán).
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const RX = [
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,/-]*(20\d\d)\b/gi, m => [m[2], MON[m[1].slice(0, 3).toLowerCase()]]],
  [/(?:tháng|thang|t)\s*(\d{1,2})\s*(?:\/|-|năm|nam)\s*(20\d\d)/gi, m => [m[2], +m[1]]],
  [/\b(\d{1,2})\/(20\d\d)\b/g, m => [m[2], +m[1]]],
];
function period(desc) {
  const s = String(desc || ''); let best = null;
  for (const [rx, f] of RX) for (const m of s.matchAll(rx)) { const [y, mo] = f(m); if (mo >= 1 && mo <= 12 && (!best || m.index >= best.i)) best = { i: m.index, ym: `${y}-${String(mo).padStart(2, '0')}` }; }
  return best ? best.ym : null; // lấy kỳ cuối cùng xuất hiện ("From April 2026 To June 2026: June 2026" → 2026-06)
}
const EXP = c => `substr(${c},1,1) IN ('6','8') AND ${c} NOT LIKE '911%'`;

// all(sql,...args) → rows. Trả về danh sách nhóm và các dòng chi phí thực tế bị nghi chưa huỷ trích.
function match(all, { tol = 1, tolPct = 0.02 } = {}) {
  const acc = all(`SELECT id, document_no doc, account_date d, ym, acc_debit dr, acc_credit cr, amount a, partner_debit bp, partner_credit bpCr, type_of_cost t, description ds, created_by u
    FROM entries WHERE id IN (SELECT id FROM entries WHERE acc_credit>='335' AND acc_credit<'336' UNION SELECT id FROM entries WHERE acc_debit>='335' AND acc_debit<'336') AND amount<>0 AND ifnull(source_table,'')<>'OPENING_BALANCE'`);
  const G = new Map(), byPT = new Map();
  const grp = (p, t, per) => { const k = p + '|' + t + '|' + per; let o = G.get(k);
    if (!o) { o = { k, p, t, per, accrued: 0, released: 0, actual: 0, accDocs: new Set(), relDocs: new Set(), actRows: [], parsed: false, users: new Set() }; G.set(k, o); (byPT.get(p + '|' + t) || byPT.set(p + '|' + t, []).get(p + '|' + t)).push(o); }
    return o; };
  for (const r of acc) {
    const side = String(r.cr).startsWith('335') ? 'cr' : 'dr', p = (side === 'cr' ? r.bpCr : r.bp) || '', t = r.t || '';
    const per = period(r.ds), o = grp(p, t, per || r.ym); if (per) o.parsed = true;
    if (side === 'cr' && r.a > 0) { o.accrued += r.a; o.accDocs.add(r.doc); o.lastAcc = !o.lastAcc || r.d > o.lastAcc ? r.d : o.lastAcc; }
    else { o.released += Math.abs(r.a); o.relDocs.add(r.doc); o.lastRel = !o.lastRel || r.d > o.lastRel ? r.d : o.lastRel; }
  }
  const partners = [...new Set(acc.map(r => String(r.cr).startsWith('335') ? r.bpCr : r.bp).filter(Boolean))];
  if (!partners.length) return { groups: [], flagged: [] };
  const act = [];
  for (let i = 0; i < partners.length; i += 500) {
    const ps = partners.slice(i, i + 500);
    act.push(...all(`SELECT id, document_no doc, line_no line, account_date d, ym, acc_debit dr, acc_credit cr, amount a, partner_credit p, type_of_cost t, description ds, invoice inv, created_by u
      FROM entries WHERE ((acc_debit>='6' AND acc_debit<'7') OR (acc_debit>='8' AND acc_debit<'9')) AND acc_debit NOT LIKE '911%' AND acc_credit NOT LIKE '335%' AND acc_credit NOT LIKE '911%' AND amount>0 AND type_of_cost IS NOT NULL
        AND ifnull(source_table,'')<>'OPENING_BALANCE' AND partner_credit IN (${ps.map(() => '?').join(',')})`, ...ps));
  }
  for (const r of act) {
    const per = period(r.ds), k = r.p + '|' + r.t + '|' + (per || r.ym);
    let o = G.get(k), how = per ? 'kỳ' : 'tháng';
    if (!o) { // không cùng kỳ: tìm khoản trích còn dư sớm nhất của cùng đối tượng × khoản mục, kỳ ≤ kỳ thực tế
      const cand = (byPT.get(r.p + '|' + r.t) || []).filter(g => g.per <= (per || r.ym) && g.accrued - g.released > tol).sort((a, b) => a.per.localeCompare(b.per));
      o = cand[0]; how = 'gần';
    }
    if (!o) continue;
    o.actual += r.a; o.actRows.push({ ...r, per: per || r.ym, how }); o.users.add(r.u);
  }
  // Thanh toán: phân bổ FIFO các khoản Nợ 331 (theo đối tượng) cho các hoá đơn Có 331 theo ngày
  const pays = new Map(), invs = new Map();
  for (let i = 0; i < partners.length; i += 500) {
    const ps = partners.slice(i, i + 500), ph = ps.map(() => '?').join(',');
    for (const r of all(`SELECT id, partner_credit p, account_date d, amount a FROM entries WHERE acc_credit>='331' AND acc_credit<'332' AND partner_credit IN (${ph}) ORDER BY account_date, id`, ...ps)) (invs.get(r.p) || invs.set(r.p, []).get(r.p)).push(r);
    for (const r of all(`SELECT partner_debit p, account_date d, amount a FROM entries WHERE acc_debit>='331' AND acc_debit<'332' AND partner_debit IN (${ph}) ORDER BY account_date, id`, ...ps)) (pays.get(r.p) || pays.set(r.p, []).get(r.p)).push(r);
  }
  const paid = new Map(); // id hoá đơn → {v: số đã trả, d: ngày trả đủ/gần nhất}
  for (const [p, list] of invs) {
    const ps = pays.get(p) || [], cum = []; let t = 0; for (const x of ps) { t += x.a; cum.push(t); }
    let pool = t, inv = 0;
    for (const iv of list) {
      if (iv.a <= 0) { pool -= iv.a; continue; } // hoá đơn âm (giảm trừ) cộng lại vào quỹ thanh toán
      const v = Math.min(iv.a, Math.max(0, pool)); pool -= v; inv += v;
      const k = cum.findIndex(c => c >= inv - 0.005);
      paid.set(iv.id, { v, d: v > 0 ? (ps[k >= 0 ? k : ps.length - 1] || {}).d || null : null });
    }
  }
  for (const o of G.values()) { o.paid = 0; o.lastPay = null;
    for (const x of o.actRows) { if (!String(x.cr).startsWith('331')) { o.paid += x.a; if (!o.lastPay || x.d > o.lastPay) o.lastPay = x.d; continue; } // chi thẳng tiền/tạm ứng: coi như đã thanh toán
      const q = paid.get(x.id); if (q) { o.paid += q.v; if (q.d && (!o.lastPay || q.d > o.lastPay)) o.lastPay = q.d; } } }
  const asOf = all(`SELECT max(account_date) d FROM entries`)[0].d, days = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) : null;
  const groups = [], flagged = [];
  for (const o of G.values()) {
    const remain = o.accrued - o.released, lim = Math.max(tol, tolPct * o.accrued);
    let status = null, sev = null;
    if (o.actual > 0 && remain > lim) { status = 'Chưa huỷ trích'; sev = o.actRows.some(x => x.how === 'kỳ') && o.parsed ? 'H' : 'M'; }
    else if (o.accrued > 0 && o.released > o.accrued + lim) { status = 'Huỷ trích vượt số đã trích'; sev = 'M'; }
    else if (o.actual > 0 && o.accrued > 0) status = 'Đã huỷ trích';
    else if (o.accrued > 0 && remain > lim) status = 'Chưa có chi phí thực tế';
    else if (o.accrued > 0) status = 'Đã huỷ / quyết toán';
    else if (o.released > 0) status = 'Huỷ trích của kỳ trước dữ liệu';
    else continue;
    const g = { key: o.k, p: o.p, t: o.t, per: o.per, accrued: o.accrued, released: o.released, remain, actual: o.actual, diff: o.actual - o.accrued, status, sev,
      conf: !sev ? '' : sev === 'H' ? 'Cao – cùng đối tượng, khoản mục, kỳ dịch vụ' : 'Trung bình – cùng đối tượng, khoản mục; kỳ suy ra',
      accDocs: [...o.accDocs], relDocs: [...o.relDocs], actDocs: [...new Set(o.actRows.map(x => x.doc))], invs: [...new Set(o.actRows.map(x => x.inv).filter(Boolean))],
      lastAcc: o.lastAcc || null, lastRel: o.lastRel || null, paid: o.paid, unpaid: Math.max(0, o.actual - o.paid), lastPay: o.lastPay, age: remain > lim ? days(o.lastAcc, asOf) : null, asOf, firstAct: o.actRows.reduce((m, x) => !m || x.d < m ? x.d : m, null), users: [...o.users] };
    groups.push(g);
    if (status === 'Chưa huỷ trích') for (const x of o.actRows) flagged.push({ ...x, g });
  }
  const ord = { 'Chưa huỷ trích': 0, 'Huỷ trích vượt số đã trích': 1, 'Chưa có chi phí thực tế': 2, 'Đã huỷ trích': 3, 'Đã huỷ / quyết toán': 4, 'Huỷ trích của kỳ trước dữ liệu': 5 };
  groups.sort((a, b) => ord[a.status] - ord[b.status] || Math.min(b.remain, b.actual) - Math.min(a.remain, a.actual));
  return { groups, flagged };
}
const STATUSES = ['Chưa huỷ trích', 'Huỷ trích vượt số đã trích', 'Chưa có chi phí thực tế', 'Đã huỷ trích', 'Đã huỷ / quyết toán', 'Huỷ trích của kỳ trước dữ liệu'];
// Tổng hợp nhóm theo một chiều (per | p | t | u)
function summarize(groups, by) {
  const m = new Map();
  for (const g of groups) for (const key of by === 'u' ? (g.users.length ? g.users : ['(chưa có thực tế)']) : [g[by]]) {
    const o = m.get(key) || m.set(key, { key, name: g.name, n: 0, accrued: 0, released: 0, remain: 0, actual: 0, paid: 0, unpaid: 0, open: 0, dbl: 0 }).get(key);
    o.n++; for (const k of ['accrued', 'released', 'remain', 'actual', 'paid', 'unpaid']) o[k] += g[k];
    if (g.status === 'Chưa huỷ trích') { o.open++; o.dbl += Math.min(g.remain, g.actual); }
  }
  return [...m.values()];
}
const AGE = [[30, '0–30 ngày'], [60, '31–60'], [90, '61–90'], [180, '91–180'], [365, '181–365'], [1e9, '> 1 năm']];
module.exports = { match, period, summarize, STATUSES, AGE };
