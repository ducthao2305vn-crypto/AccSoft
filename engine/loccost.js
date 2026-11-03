'use strict';
// Báo cáo quản trị chi phí theo vị trí (Location): thuê trạm, thuê văn phòng / nhà nghỉ / cửa hàng, điện trạm, xăng dầu máy phát…
// Ma trận vị trí × nhóm chi phí × tháng; phát hiện tháng thiếu chi phí (tháng = 0 trong khoảng vị trí đang phát sinh chi phí định kỳ).
// Mã vị trí hiệu lực = giá trị đã điều chỉnh (field_adj, field 'location') nếu có, không thì cột Location gốc.
const GROUPS = [
  { k: 'bts_rent', n: 'Thuê trạm BTS / phòng máy / cột', codes: ['E17.1.7.2.1', 'E17.1.7.2.3', 'E17.1.7.2.4'] },
  { k: 'office_rent', n: 'Thuê văn phòng', codes: ['E17.1.10.2.1'] },
  { k: 'guest_rent', n: 'Thuê nhà nghỉ', codes: ['E17.1.10.2.4'] },
  { k: 'other_rent', n: 'Thuê cửa hàng / kho / đất', codes: ['E17.1.4.2.4.1', 'E17.1.10.2.2', 'E17.1.10.2.3'] },
  { k: 'bts_elec', n: 'Điện trạm BTS / phòng máy', codes: ['E17.1.7.1.5', 'E17.1.7.1.6'] },
  { k: 'bts_fuel', n: 'Xăng dầu chạy trạm / máy phát', codes: ['E17.1.7.1.1', 'E17.1.7.1.3'] },
  { k: 'office_elec', n: 'Điện văn phòng / nhà nghỉ / kho / cửa hàng', codes: ['E17.1.10.4.1.1', 'E17.1.10.4.1.2', 'E17.1.10.4.1.3', 'E17.1.4.2.4.4'] },
];
const CODE = `CASE WHEN instr(e.type_of_cost,'_')>0 THEN substr(e.type_of_cost,1,instr(e.type_of_cost,'_')-1) ELSE e.type_of_cost END`;
const LOC = `coalesce(f.value, e.location, '')`, FJ = `LEFT JOIN field_adj f ON f.id=e.id AND f.field='location'`;
const EXP = s => `(e.acc_${s} LIKE '6%' OR e.acc_${s} LIKE '8%') AND e.acc_${s} NOT LIKE '911%'`;
const addM = (m, d) => { let y = +m.slice(0, 4), mo = +m.slice(5) + d; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
const monthsOf = (f, t) => { const o = []; for (let m = f; m <= t; m = addM(m, 1)) o.push(m); return o; };

function make(db, all, get, okYm) {
  const groups = () => { const s = get(`SELECT v FROM settings WHERE k='loc_groups'`); try { return s && s.v ? JSON.parse(s.v) : GROUPS; } catch { return GROUPS; } };
  const gOf = G => { const m = new Map(); for (const g of G) for (const c of g.codes) m.set(c, g.k); return m; };
  // Ma trận: from/to = tháng; keys = nhóm chọn (rỗng = tất cả)
  function matrix(from, to, keys = []) {
    const f = okYm(from), t = okYm(to); if (!f || !t) return { months: [], rows: [], groups: groups() };
    const G = groups().filter(g => !keys.length || keys.includes(g.k)), gm = gOf(G), codes = [...gm.keys()]; if (!codes.length) return { months: monthsOf(f, t), rows: [], groups: groups() };
    const ph = codes.map(() => '?').join(','), m = new Map();
    for (const [side, sg] of [['debit', 1], ['credit', -1]])
      for (const r of all(`SELECT e.ym, ${LOC} loc, ${CODE} c, sum(e.amount) a, count(*) n FROM entries e ${FJ} WHERE e.ym>=? AND e.ym<=? AND e.type_of_cost LIKE 'E17.1.%' AND ${EXP(side)} AND ${CODE} IN (${ph}) GROUP BY 1,2,3`, addM(f, -12), t, ...codes)) {
        const g = gm.get(r.c); if (!g) continue; const key = r.loc + '|' + g, o = m.get(key) || m.set(key, { loc: r.loc || '', g, v: {}, n: 0 }).get(key);
        o.v[r.ym] = (o.v[r.ym] || 0) + sg * r.a; o.n += r.n; }
    const months = monthsOf(f, t), gn = Object.fromEntries(groups().map(g => [g.k, g.n]));
    const rows = [...m.values()].map(o => {
      const all12 = Object.keys(o.v).filter(k => Math.abs(o.v[k]) > 0.004).sort(), first = all12[0] || null, last = all12.at(-1) || null;
      const inP = months.filter(x => Math.abs(o.v[x] || 0) > 0.004), tot = months.reduce((s, x) => s + (o.v[x] || 0), 0);
      // tháng thiếu: trong kỳ, từ tháng đầu tiên có chi phí (kể cả 12 tháng trước kỳ) đến tháng cuối kỳ, mà = 0; chỉ xét nhóm phát sinh ≥ 2 tháng
      const gaps = first && (all12.length >= 2) ? months.filter(x => x >= first && Math.abs(o.v[x] || 0) <= 0.004) : [];
      const avg = inP.length ? tot / inP.length : 0, dbl = months.filter(x => avg > 0 && (o.v[x] || 0) > 1.8 * avg && inP.length >= 3);
      return { loc: o.loc, g: o.g, gn: gn[o.g] || o.g, v: Object.fromEntries(months.map(x => [x, o.v[x] || 0])), tot, n: o.n, first, last, gaps, dbl, avg };
    }).filter(o => months.some(x => Math.abs(o.v[x]) > 0.004) || o.gaps.length).sort((a, b) => String(a.loc).localeCompare(String(b.loc)) || a.g.localeCompare(b.g));
    return { months, rows, groups: groups() };
  }
  // Bút toán gốc của 1 ô (vị trí × nhóm × tháng) – hoặc cả kỳ khi ym rỗng
  function detail(loc, g, from, to) {
    const G = groups().filter(x => !g || x.k === g), codes = G.flatMap(x => x.codes); if (!codes.length) return [];
    const ph = codes.map(() => '?').join(',');
    return all(`SELECT e.id, e.ym, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount a, e.partner_debit bp, e.partner_credit bpCr,
        e.description ds, e.created_by u, e.type_of_cost t, e.location, e.contract, e.plate, e.cashflow cf, ${LOC} loc, f.value locationNew
      FROM entries e ${FJ} WHERE e.ym>=? AND e.ym<=? AND ${CODE} IN (${ph}) AND (${EXP('debit')} OR ${EXP('credit')}) AND ${LOC}=? ORDER BY e.account_date, e.id LIMIT 20000`, okYm(from), okYm(to), ...codes, loc || '')
      .map(r => ({ ...r, v: (/^[68]/.test(r.dr) && !/^911/.test(r.dr) ? r.a : 0) - (/^[68]/.test(r.cr) && !/^911/.test(r.cr) ? r.a : 0) }));
  }
  // Danh sách mã vị trí đang dùng (để chọn khi điều chỉnh)
  const locations = () => all(`SELECT loc, sum(n) n FROM (SELECT location loc, count(*) n FROM entries WHERE location IS NOT NULL AND location<>'' GROUP BY 1 UNION ALL SELECT value, count(*) FROM field_adj WHERE field='location' AND value<>'' GROUP BY 1) GROUP BY 1 ORDER BY 2 DESC LIMIT 5000`);
  return { matrix, detail, locations, groups };
}
module.exports = { make, GROUPS };
