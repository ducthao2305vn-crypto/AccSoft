'use strict';
// Báo cáo quản trị chi phí theo một chiều phân tích × nhóm chi phí × tháng:
//   location = mã vị trí (Location): thuê trạm / văn phòng / nhà nghỉ, điện trạm, xăng dầu máy phát…
//   plate    = biển số xe (License Plate): xăng dầu, sửa chữa, dầu – nước làm mát, thuê xe, khấu hao… (có định mức / tháng / xe)
//   dept     = phòng ban ngân sách (Department Sub, ánh xạ sang danh mục phòng ban): mọi chi phí, nhóm theo Expense Group của danh mục khoản mục
// Giá trị chiều hiệu lực = giá trị đã điều chỉnh (field_adj) nếu có, không thì cột gốc. Chi phí = Nợ − Có TK 6xx/8xx (trừ 911).
const DIMS = {
  location: { col: 'e.location', f: 'location', none: '(không có vị trí)' },
  plate: { col: 'e.plate', f: 'plate', none: '(không có biển số)' },
  dept: { col: 'e.department_sub', f: 'dept', none: '(không có Department Sub)' }, // phòng ban ngân sách = Department Sub
};
const GROUPS = {
  location: [
    { k: 'bts_rent', n: 'Thuê trạm BTS / phòng máy / cột', codes: ['E17.1.7.2.1', 'E17.1.7.2.3', 'E17.1.7.2.4'] },
    { k: 'office_rent', n: 'Thuê văn phòng', codes: ['E17.1.10.2.1'] },
    { k: 'guest_rent', n: 'Thuê nhà nghỉ', codes: ['E17.1.10.2.4'] },
    { k: 'other_rent', n: 'Thuê cửa hàng / kho / đất', codes: ['E17.1.4.2.4.1', 'E17.1.10.2.2', 'E17.1.10.2.3'] },
    { k: 'bts_elec', n: 'Điện trạm BTS / phòng máy', codes: ['E17.1.7.1.5', 'E17.1.7.1.6'] },
    { k: 'bts_fuel', n: 'Xăng dầu chạy trạm / máy phát', codes: ['E17.1.7.1.1', 'E17.1.7.1.3'] },
    { k: 'office_elec', n: 'Điện văn phòng / nhà nghỉ / kho / cửa hàng', codes: ['E17.1.10.4.1.1', 'E17.1.10.4.1.2', 'E17.1.10.4.1.3', 'E17.1.4.2.4.4'] },
  ],
  plate: [
    { k: 'fuel', n: 'Xăng dầu xe', codes: ['E17.1.7.1.2', 'E17.1.10.1.1', 'E17.1.10.4.4.5'] },
    { k: 'repair', n: 'Sửa chữa xe (phụ tùng, dịch vụ)', codes: ['E17.1.10.3.4'] },
    { k: 'oil', n: 'Thay dầu, nước làm mát xe', codes: ['E17.1.10.1.3'] },
    { k: 'rent', n: 'Thuê xe', codes: ['E17.1.7.2.10', 'E17.1.7.2.9', 'E17.1.4.2.2.9', 'E17.1.7.2.7', 'E17.1.10.4.4.3'] },
    { k: 'dep', n: 'Khấu hao phương tiện', codes: ['E17.1.1.1.3'] },
  ],
};
const CODE = `CASE WHEN instr(e.type_of_cost,'_')>0 THEN substr(e.type_of_cost,1,instr(e.type_of_cost,'_')-1) ELSE e.type_of_cost END`;
const EXP = s => `(e.acc_${s} LIKE '6%' OR e.acc_${s} LIKE '8%') AND e.acc_${s} NOT LIKE '911%'`;
const addM = (m, d) => { let y = +m.slice(0, 4), mo = +m.slice(5) + d; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
const monthsOf = (f, t) => { const o = []; for (let m = f; m <= t; m = addM(m, 1)) o.push(m); return o; };

function make(db, all, get, okYm) {
  const D = d => DIMS[d] || DIMS.location;
  // chuẩn hoá khoảng trắng (đầu/cuối, NBSP, tab, xuống dòng, 2 dấu cách) để cùng một mã không bị tách thành 2 dòng
  const NORM = x => `trim(replace(replace(replace(replace(replace(replace(${x}, char(160), ' '), char(9), ' '), char(13), ' '), char(10), ' '), '  ', ' '), '  ', ' '))`;
  const nz = v => String(v ?? '').replace(/[\u00a0\t\r\n]/g, ' ').replace(/ {2,}/g, ' ').trim();
  const VAL = d => NORM(`coalesce(f.value, ${D(d).col}, '')`), FJ = d => `LEFT JOIN field_adj f ON f.id=e.id AND f.field='${D(d).f}'`;
  const setting = (k, def) => { const s = get(`SELECT v FROM settings WHERE k=?`, k); try { return s && s.v ? JSON.parse(s.v) : def; } catch { return def; } };
  // Nhóm chi phí: vị trí / xe theo danh sách mã; phòng ban theo Expense Group của danh mục khoản mục
  function groups(d) {
    if (d === 'dept') { const m = new Map(); for (const r of all(`SELECT code, ifnull(nullif(trim(grp),''),'(chưa phân nhóm)') g FROM cost_cat`)) (m.get(r.g) || m.set(r.g, []).get(r.g)).push(r.code);
      return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([g, codes]) => ({ k: g, n: g, codes })).concat([{ k: '(khoản mục ngoài danh mục)', n: '(khoản mục ngoài danh mục)', codes: [] }]); }
    return setting(d === 'plate' ? 'veh_groups' : 'loc_groups', GROUPS[d] || GROUPS.location);
  }
  const norms = () => setting('veh_norm', {}); // định mức chi phí / xe / tháng theo nhóm
  function matrix(d, from, to, keys = []) {
    const f = okYm(from), t = okYm(to), G = groups(d); if (!f || !t) return { months: [], rows: [], groups: G };
    const Gs = G.filter(g => !keys.length || keys.includes(g.k)), gm = new Map(); for (const g of Gs) for (const c of g.codes) gm.set(c, g.k);
    const isDept = d === 'dept', other = isDept && Gs.some(g => g.k === '(khoản mục ngoài danh mục)');
    const codes = [...gm.keys()]; if (!codes.length && !other) return { months: monthsOf(f, t), rows: [], groups: G };
    const W = isDept ? '' : ` AND ${codes.every(c => c.startsWith('E17.1.')) ? "e.type_of_cost LIKE 'E17.1.%' AND " : ''}${CODE} IN (${codes.map(() => '?').join(',')})`, m = new Map();
    for (const [side, sg] of [['debit', 1], ['credit', -1]])
      for (const r of all(`SELECT e.ym, ${VAL(d)} k, ${CODE} c, ${isDept ? 'e.type_of_cost' : "''"} tc, sum(e.amount) a, count(*) n FROM entries e ${FJ(d)} WHERE e.ym>=? AND e.ym<=? AND ${EXP(side)}${W} GROUP BY 1,2,3,4`, addM(f, -12), t, ...(isDept ? [] : codes))) {
        let g = gm.get(r.c); if (!g && isDept && other) g = '(khoản mục ngoài danh mục)'; if (!g) continue;
        const key = r.k + '|' + g, o = m.get(key) || m.set(key, { k: r.k || '', g, v: {}, n: 0 }).get(key); o.v[r.ym] = (o.v[r.ym] || 0) + sg * r.a; o.n += r.n; if (isDept) { o.tcv = o.tcv || {}; const T = o.tcv[r.tc || ''] || (o.tcv[r.tc || ''] = {}); T[r.ym] = (T[r.ym] || 0) + sg * r.a; if (r.ym >= f) { o.tc = o.tc || {}; o.tc[r.tc || ''] = (o.tc[r.tc || ''] || 0) + sg * r.a; } } }
    const months = monthsOf(f, t), gn = Object.fromEntries(G.map(g => [g.k, g.n])), N = d === 'plate' ? norms() : {};
    // phòng ban: tên theo danh mục phòng ban (ánh xạ)
    const dmap = isDept ? new Map(all(`SELECT m.src, d.code, d.name FROM dept_map m JOIN dept_cat d ON d.code=m.code`).map(r => [nz(r.src), r])) : null;
    let rows = [...m.values()].map(o => {
      const nz = Object.keys(o.v).filter(k => Math.abs(o.v[k]) > 0.004).sort(), first = nz[0] || null;
      const inP = months.filter(x => Math.abs(o.v[x] || 0) > 0.004), tot = months.reduce((s, x) => s + (o.v[x] || 0), 0), avg = inP.length ? tot / inP.length : 0;
      // tháng thiếu: chỉ xét mã vị trí có thật và có chi phí trong kỳ xem (mã đã chuyển hết chi phí sang mã khác / dòng "không có vị trí" không bị báo thiếu)
      const gaps = d === 'location' && o.k && inP.length >= 1 && first && nz.length >= 2 ? months.filter(x => x >= first && Math.abs(o.v[x] || 0) <= 0.004) : [];
      const high = months.filter(x => avg > 0 && (o.v[x] || 0) > 1.8 * avg && inP.length >= 3), lim = +N[o.g] || 0, over = lim ? months.filter(x => (o.v[x] || 0) > lim) : [];
      const dm = dmap && dmap.get(o.k);
      return { k: o.k, label: o.k || D(d).none, cat: dm ? dm.code + ' – ' + (dm.name || '') : '', g: o.g, gn: gn[o.g] || o.g, v: Object.fromEntries(months.map(x => [x, o.v[x] || 0])), tot, avg, n: o.n, gaps, high, over, lim, tcRows: o.tcv ? Object.entries(o.tcv).map(([tc, V]) => ({ tc, v: Object.fromEntries(months.map(x => [x, V[x] || 0])), tot: months.reduce((q, x) => q + (V[x] || 0), 0) })).filter(x => months.some(m => Math.abs(x.v[m]) > 0.004)).sort((a, b) => String(a.tc).localeCompare(String(b.tc))) : [], tcs: o.tc ? Object.entries(o.tc).filter(([, a]) => Math.abs(a) > 0.004).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([tc, a]) => ({ tc, a })) : [] };
    }).filter(o => months.some(x => Math.abs(o.v[x]) > 0.004) || o.gaps.length);
    // so với cả đội xe / toàn bộ phòng ban: tổng kỳ của dòng so với trung vị các dòng cùng nhóm
    const byG = new Map(); for (const o of rows) if (o.k) (byG.get(o.g) || byG.set(o.g, []).get(o.g)).push(o.tot);
    const med = a => { const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length ? (s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2) : 0; };
    const M = new Map([...byG].map(([g, a]) => [g, med(a)]));
    rows = rows.map(o => ({ ...o, med: M.get(o.g) || 0, ratio: o.k && M.get(o.g) > 0 && (byG.get(o.g) || []).length >= 3 ? o.tot / M.get(o.g) : null }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)) || a.g.localeCompare(b.g));
    return { dim: d, months, rows, groups: G, norms: N };
  }
  function detail(d, key, g, from, to) {
    const G = groups(d), isDept = d === 'dept', Gs = G.filter(x => !g || x.k === g), codes = Gs.flatMap(x => x.codes), other = isDept && (!g || g === '(khoản mục ngoài danh mục)');
    const known = isDept ? G.flatMap(x => x.codes) : [];
    let W = '', A = [];
    if (isDept) { if (g && g !== '(khoản mục ngoài danh mục)') { W = ` AND ${CODE} IN (${codes.map(() => '?').join(',')})`; A = codes; } else if (g) { W = known.length ? ` AND (e.type_of_cost IS NULL OR ${CODE} NOT IN (${known.map(() => '?').join(',')}))` : ''; A = known; } }
    else { if (!codes.length) return []; W = ` AND ${CODE} IN (${codes.map(() => '?').join(',')})`; A = codes; }
    return all(`SELECT e.id, e.ym, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount a, e.partner_debit bp, e.partner_credit bpCr,
        e.description ds, e.created_by u, e.type_of_cost t, e.location, e.plate, e.department_sub dept, e.department deptAcc, ${VAL(d)} val, f.value newVal
      FROM entries e ${FJ(d)} WHERE e.ym>=? AND e.ym<=?${W} AND (${EXP('debit')} OR ${EXP('credit')})${key == null ? '' : ` AND ${VAL(d)}=?`} ORDER BY e.account_date, e.id LIMIT 30000`, okYm(from), okYm(to), ...A, ...(key == null ? [] : [key || '']))
      .map(r => ({ ...r, orig: d === 'location' ? r.location : d === 'plate' ? r.plate : r.dept, v: (/^[68]/.test(r.dr) && !/^911/.test(r.dr) ? r.a : 0) - (/^[68]/.test(r.cr) && !/^911/.test(r.cr) ? r.a : 0) }));
  }
  // Giá trị đang dùng của chiều (để chọn khi điều chỉnh); phòng ban kèm tên danh mục
  function values(d) {
    const c = D(d).col.replace('e.', ''), f = D(d).f;
    const rows = all(`SELECT ${NORM('v')} v, sum(n) n FROM (SELECT ${c} v, count(*) n FROM entries WHERE ${c} IS NOT NULL AND ${c}<>'' GROUP BY 1 UNION ALL SELECT value, count(*) FROM field_adj WHERE field=? AND value<>'' GROUP BY 1) WHERE ${NORM('v')}<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 5000`, f);
    if (d !== 'dept') return rows;
    const dm = new Map(all(`SELECT m.src, d.code, d.name FROM dept_map m JOIN dept_cat d ON d.code=m.code`).map(r => [nz(r.src), r]));
    return rows.map(r => ({ ...r, cat: dm.get(r.v) ? dm.get(r.v).code + ' – ' + (dm.get(r.v).name || '') : '' }));
  }
  return { matrix, detail, values, groups, norms };
}
module.exports = { make, GROUPS, DIMS };
