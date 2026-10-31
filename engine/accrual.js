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
  const groups = [], flagged = [];
  for (const o of G.values()) {
    const remain = o.accrued - o.released, lim = Math.max(tol, tolPct * o.accrued);
    let status = null, sev = null;
    if (o.actual > 0 && remain > lim) { status = 'Chưa huỷ trích'; sev = o.actRows.some(x => x.how === 'kỳ') && o.parsed ? 'H' : 'M'; }
    else if (o.accrued > 0 && o.released > o.accrued + lim) { status = 'Huỷ trích vượt số đã trích'; sev = 'M'; }
    else if (o.actual > 0 && o.accrued > 0) status = 'Đã huỷ trích';
    else if (o.accrued > 0 && remain > lim) status = 'Chưa có chi phí thực tế';
    else continue;
    const g = { key: o.k, p: o.p, t: o.t, per: o.per, accrued: o.accrued, released: o.released, remain, actual: o.actual, diff: o.actual - o.accrued, status, sev,
      conf: !sev ? '' : sev === 'H' ? 'Cao – cùng đối tượng, khoản mục, kỳ dịch vụ' : 'Trung bình – cùng đối tượng, khoản mục; kỳ suy ra',
      accDocs: [...o.accDocs], relDocs: [...o.relDocs], actDocs: [...new Set(o.actRows.map(x => x.doc))], invs: [...new Set(o.actRows.map(x => x.inv).filter(Boolean))],
      lastAcc: o.lastAcc || null, lastRel: o.lastRel || null, firstAct: o.actRows.reduce((m, x) => !m || x.d < m ? x.d : m, null), users: [...o.users] };
    groups.push(g);
    if (status === 'Chưa huỷ trích') for (const x of o.actRows) flagged.push({ ...x, g });
  }
  const ord = { 'Chưa huỷ trích': 0, 'Huỷ trích vượt số đã trích': 1, 'Chưa có chi phí thực tế': 2, 'Đã huỷ trích': 3 };
  groups.sort((a, b) => ord[a.status] - ord[b.status] || Math.min(b.remain, b.actual) - Math.min(a.remain, a.actual));
  return { groups, flagged };
}
module.exports = { match, period };
