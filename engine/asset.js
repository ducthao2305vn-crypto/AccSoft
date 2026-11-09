'use strict';
// Báo cáo tài sản cố định & khấu hao theo trường Asset của dữ liệu hạch toán (cột Asset file ERP), ưu tiên giá trị điều chỉnh ở Điều chỉnh dữ liệu (field_adj, trường 'asset').
// Nguyên giá: TK 211, 213 (Nợ tăng, Có giảm) · hao mòn luỹ kế: TK 214 (Có tăng, Nợ giảm) · khấu hao trong kỳ: Có 214 đối ứng Nợ TK chi phí (6xx, 241, 8xx).
const NONE = '(chưa gắn tài sản)';
const months = (f, t) => { const o = []; let [y, m] = f.split('-').map(Number); const [ty, tm] = t.split('-').map(Number); while (y < ty || (y === ty && m <= tm)) { o.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return o; };
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

function make(db, all, get) {
  function status() {
    const r = get(`SELECT count(*) n, count(nullif(coalesce(fa.value, e.asset),'')) a, count(DISTINCT nullif(coalesce(fa.value, e.asset),'')) k FROM entries e LEFT JOIN field_adj fa ON fa.id=e.id AND fa.field='asset' WHERE (e.acc_debit LIKE '21%' OR e.acc_credit LIKE '21%')`);
    return { lines: r.n, withAsset: r.a, assets: r.k };
  }
  function report(o = {}) {
    const { from, to } = o, d0 = from + '-01', d1 = lastDay(to), M = new Map(), ms = months(from, to);
    const get0 = k => M.get(k) || M.set(k, { asset: k, acc: new Set(), cost: { ob: 0, inc: 0, dec: 0 }, dep: { ob: 0, inc: 0, dec: 0 }, depM: {}, expAcc: new Set(), dept: new Set(), first: null, last: null, n: 0 }).get(k);
    // Nguyên giá 211 / 213 và hao mòn 214 – gộp theo tài sản × TK × phía × trước/trong kỳ
    for (const [side, sg] of [['debit', 1], ['credit', -1]]) {
      for (const r of all(`SELECT ifnull(nullif(coalesce(fa.value, e.asset),''),'') k, e.acc_${side} a, e.acc_${side === 'debit' ? 'credit' : 'debit'} o, CASE WHEN e.account_date<? THEN 'P' ELSE e.ym END p, min(e.account_date) d1, max(e.account_date) d2, max(e.department) dep, sum(e.amount) v, count(*) n
          FROM entries e LEFT JOIN field_adj fa ON fa.id=e.id AND fa.field='asset' WHERE e.account_date<=? AND (e.acc_${side} LIKE '211%' OR e.acc_${side} LIKE '213%' OR e.acc_${side} LIKE '214%') AND e.acc_debit<>e.acc_credit GROUP BY 1,2,3,4`, d0, d1)) {
        const x = get0(r.k || NONE); x.n += r.n; const isDep = String(r.a).startsWith('214');
        if (!isDep) { x.acc.add(r.a); if (sg > 0 && (!x.first || r.d1 < x.first)) x.first = r.d1; }
        const B = isDep ? x.dep : x.cost, v = isDep ? -sg * r.v : sg * r.v; // hao mòn: Có = tăng
        if (r.p === 'P') B.ob += v; else if (v >= 0) B.inc += v; else B.dec -= v;
        // khấu hao trong kỳ: Có 214 / Nợ chi phí
        if (isDep && sg < 0 && r.p !== 'P' && /^(6|8|241|154)/.test(String(r.o))) { x.depM[r.p] = (x.depM[r.p] || 0) + r.v; x.expAcc.add(String(r.o).slice(0, 4)); }
        if (r.dep) x.dept.add(r.dep); if (!x.last || r.d2 > x.last) x.last = r.d2;
      }
    }
    const rows = [...M.values()].map(x => { const cb = B => B.ob + B.inc - B.dec, ng = cb(x.cost), hm = cb(x.dep), depP = ms.reduce((s, m) => s + (x.depM[m] || 0), 0);
      return { asset: x.asset, acc: [...x.acc].sort().join(', '), dept: [...x.dept].slice(0, 3).join(', '), expAcc: [...x.expAcc].sort().join(', '), first: x.first, n: x.n,
        cost: { ...x.cost, cb: ng }, dep: { ...x.dep, cb: hm }, nbv: ng - hm, nbvOb: x.cost.ob - x.dep.ob, depP, depM: ms.map(m => x.depM[m] || 0),
        rate: ng > 0.005 ? depP / ng * 12 / ms.length : null, full: ng > 0.005 && Math.abs(ng - hm) < 0.01 }; })
      .filter(r => Math.abs(r.cost.ob) + Math.abs(r.cost.inc) + Math.abs(r.cost.dec) + Math.abs(r.dep.ob) + Math.abs(r.dep.inc) + Math.abs(r.dep.dec) > 0.005)
      .sort((a, b) => (a.asset === NONE) - (b.asset === NONE) || b.cost.cb - a.cost.cb);
    // Đối chiếu sổ cái (fin_mv): tổng mọi tài sản = số dư TK
    const led = pre => get(`SELECT ifnull(sum(dr) - sum(cr), 0) v FROM fin_mv WHERE ym<=? AND acc LIKE ?`, to, pre + '%').v;
    const T = f => rows.reduce((s, r) => s + f(r), 0);
    const check = [['Nguyên giá (211 + 213)', T(r => r.cost.cb), led('211') + led('213')], ['Hao mòn luỹ kế (214)', T(r => r.dep.cb), -led('214')]].map(([n, v, l]) => ({ n, v, l, diff: v - l }));
    return { from, to, months: ms, rows, check, status: status(), none: rows.find(r => r.asset === NONE) || null };
  }
  return { report, status };
}
module.exports = { make };
