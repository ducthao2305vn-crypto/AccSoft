'use strict';
// Quy tắc khoản mục (Type of cost / mã doanh thu) → phòng ban phụ trách.
// Khoản mục có phòng ban = chỉ thuộc 1 phòng ban → bút toán ghi phòng ban khác là hạch toán sai, chuyển hàng loạt về phòng ban đúng (qua field_adj, không sửa dữ liệu gốc).
// Khoản mục "Chưa phân" / để trống = thuộc nhiều phòng ban → không tự chuyển, giữ để phân thủ công.
const norm = s => String(s ?? '').trim();
const key = s => norm(s).toUpperCase().replace(/[\s ]+/g, ' ').replace(/[.]+$/, '');
const CODE = `CASE WHEN instr(e.type_of_cost,'_')>0 THEN substr(e.type_of_cost,1,instr(e.type_of_cost,'_')-1) ELSE e.type_of_cost END`;
// mã khoản mục chung: chi phí = Type of cost, doanh thu = Sales Region (A0xx_…)
const KM = `coalesce(e.type_of_cost, e.sales_region)`, KCODE = `CASE WHEN instr(${KM},'_')>0 THEN substr(${KM},1,instr(${KM},'_')-1) ELSE ${KM} END`;
const NORM = x => `trim(replace(replace(replace(replace(${x}, char(160), ' '), char(9), ' '), char(13), ' '), char(10), ' '))`;
const PL = s => `((e.acc_${s} GLOB '[5678]*') AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%')`; // loại hẳn bút toán kết chuyển (một vế là 911) // doanh thu 5xx/7xx, chi phí 6xx/8xx

function make(db, all, get, okYm) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS tc_dept(code TEXT PRIMARY KEY, dept_raw TEXT, dept_code TEXT, name TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS td_tpl(ord INTEGER PRIMARY KEY, code TEXT, stt TEXT, vn TEXT, en TEXT, dept_raw TEXT)`); // mẫu báo cáo (giữ nguyên thứ tự, phân cấp theo STT)
  const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const isMulti = s => !norm(s) || /^ch(ư|u)a\s*ph(â|a)n/i.test(norm(s)) || /nhi(ề|e)u\s*ph(ò|o)ng/i.test(norm(s));

  // Tên phòng ban trong file → mã danh mục: khớp mã, tên danh mục, hoặc tên gốc đã ánh xạ (dept_map)
  function resolver() {
    const cat = all(`SELECT code, name FROM dept_cat`), maps = all(`SELECT src, code FROM dept_map`), M = new Map();
    for (const c of cat) { M.set(key(c.code), c.code); if (c.name) M.set(key(c.name), c.code); }
    for (const m of maps) if (!M.has(key(m.src))) M.set(key(m.src), m.code);
    return s => { const k = key(s); if (M.has(k)) return M.get(k);
      const c = cat.find(c => c.name && (key(c.name).includes(k) || k.includes(key(c.name)))); return c ? c.code : ''; };
  }
  function importAoa(aoa) {
    aoa = aoa || []; let h = -1, cC = -1, cD = -1, cN = -1;
    for (let i = 0; i < Math.min(aoa.length, 40) && h < 0; i++) { const r = (aoa[i] || []).map(x => key(x));
      const a = r.findIndex(x => /^CODE( ERP)?$|^MÃ( KHOẢN MỤC)?$/.test(x)), b = r.findIndex(x => /PH(Ò|O)NG BAN|DEPARTMENT/.test(x));
      if (a >= 0 && b >= 0) { h = i; cC = a; cD = b; cN = r.findIndex(x => /TI(Ế|E)NG VI(Ệ|E)T|T(Ê|E)N/.test(x)); } }
    if (h < 0) throw new Error('Không thấy dòng tiêu đề có cột "CODE ERP" và "Phòng Ban"');
    const R = resolver(); let n = 0, multi = 0; const unk = new Map();
    const r2 = (aoa[h] || []).map(x => key(x)), cS = r2.findIndex(x => x === 'STT'), cE = r2.findIndex(x => /TI(Ế|E)NG ?ANH|ENGLISH/.test(x));
    tx(() => { run(`DELETE FROM td_tpl`); let o = 0;
      for (const r of aoa.slice(h + 1)) { const stt = cS >= 0 ? norm(r[cS]) : '', vn = cN >= 0 ? norm(r[cN]) : ''; if (!stt && !vn) continue;
        run(`INSERT INTO td_tpl(ord, code, stt, vn, en, dept_raw) VALUES(?,?,?,?,?,?)`, ++o, norm(r[cC]), stt, vn, cE >= 0 ? norm(r[cE]) : '', norm(r[cD])); } for (const r of aoa.slice(h + 1)) { const code = norm(r[cC]); if (!code || code === '0' || /^#/.test(code)) continue;
      const raw = norm(r[cD]), m = isMulti(raw), dc = m ? '' : R(raw); if (m) multi++; else if (!dc) unk.set(raw, (unk.get(raw) || 0) + 1);
      run(`INSERT OR REPLACE INTO tc_dept(code, dept_raw, dept_code, name, updated_at) VALUES(?,?,?,?,datetime('now','localtime'))`, code, raw || 'Chưa phân', dc, cN >= 0 ? norm(r[cN]) : null); n++; } });
    return { n, multi, unknown: [...unk].map(([raw, n]) => ({ raw, n })) };
  }
  const list = () => all(`SELECT t.*, d.name dept_name FROM tc_dept t LEFT JOIN dept_cat d ON d.code=t.dept_code ORDER BY t.code`);
  const setRow = (code, dc) => (run(`UPDATE tc_dept SET dept_code=?, updated_at=datetime('now','localtime') WHERE code=?`, norm(dc), norm(code)), { ok: 1 });
  const clear = () => (run(`DELETE FROM tc_dept`), { ok: 1 });

  // Giá trị Department Sub ghi vào khi chuyển: tên gốc dùng nhiều nhất đang ánh xạ về mã danh mục đó (để báo cáo nhận đúng), không có thì dùng mã
  function srcOf() { const cnt = new Map(all(`SELECT department_sub s, count(*) n FROM entries WHERE department_sub IS NOT NULL GROUP BY 1`).map(r => [r.s, r.n])), m = new Map(); // 1 lần quét, không đếm lồng từng phòng ban
    for (const r of all(`SELECT code, src FROM dept_map`).map(r => ({ ...r, n: cnt.get(r.src) || 0 })).sort((x, y) => y.n - x.n)) if (!m.has(r.code)) m.set(r.code, r.src);
    return c => m.get(c) || c; }

  // Bút toán có khoản mục đã gán 1 phòng ban nhưng phòng ban hiệu lực (sau điều chỉnh) khác → đề xuất chuyển
  function scan(from, to) {
    const f = okYm(from), t = okYm(to); if (!f || !t) return { groups: [], n: 0, a: 0, multi: { n: 0, a: 0 } };
    const toCat = new Map(all(`SELECT src, code FROM dept_map`).map(r => [key(r.src), r.code])), cats = new Set(all(`SELECT code FROM dept_cat`).map(r => r.code));
    const catOf = v => toCat.get(key(v)) || (cats.has(norm(v)) ? norm(v) : ''), S = srcOf(), TD = new Map(all(`SELECT code, dept_code FROM tc_dept`).map(r => [r.code, r.dept_code]));
    // gộp sẵn ở SQL theo (mã khoản mục, phòng ban hiệu lực) – không kéo từng bút toán về (nhanh, nhẹ bộ nhớ); bút toán chỉ lấy khi bấm chuyển
    const agg = all(`SELECT ${NORM(KCODE)} code, ${NORM('coalesce(f.value, e.department_sub, \'\')')} cur, min(${KM}) tc, count(*) n,
        sum(CASE WHEN e.acc_debit GLOB '[68]*' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_credit GLOB '[68]*' THEN e.amount ELSE 0 END) + sum(CASE WHEN e.acc_credit GLOB '[57]*' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_debit GLOB '[57]*' THEN e.amount ELSE 0 END) a
      FROM entries e LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept'
      WHERE e.ym>=? AND e.ym<=? AND ${KM} IS NOT NULL AND (${PL('debit')} OR ${PL('credit')}) GROUP BY 1,2`, f, t);
    const multi = { n: 0, a: 0 }, G = [], nm = new Map(all(`SELECT code, name FROM dept_cat`).map(r => [r.code, r.name]));
    for (const r of agg) { if (!TD.has(r.code)) continue; const want = TD.get(r.code);
      if (!want) { multi.n += r.n; multi.a += r.a; continue; }
      const cc = catOf(r.cur); if (cc === want) continue;
      G.push({ code: r.code, tc: r.tc, cur: r.cur, curCat: cc, want, target: S(want), n: r.n, a: r.a, wantName: nm.get(want) || '', curName: nm.get(cc) || '' }); }
    G.sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
    return { groups: G, n: G.reduce((s, g) => s + g.n, 0), a: G.reduce((s, g) => s + g.a, 0), multi };
  }
  // Bút toán của các nhóm (mã khoản mục × phòng ban đang ghi) đã chọn – để ghi điều chỉnh; trả về theo giá trị đích
  function rowsOf(from, to, pairs) {
    const f = okYm(from), t = okYm(to), P = new Map([].concat(pairs || []).map(p => [p.code + '|' + p.cur, p.target])); if (!f || !t || !P.size) return new Map();
    const codes = [...new Set([].concat(pairs).map(p => p.code))], by = new Map();
    for (const r of all(`SELECT e.id, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.amount a, e.partner_debit bp, e.partner_credit bpCr, e.department_sub dept,
        ${NORM(KCODE)} code, ${NORM('coalesce(f.value, e.department_sub, \'\')')} cur
      FROM entries e LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept'
      WHERE e.ym>=? AND e.ym<=? AND ${KM} IS NOT NULL AND (${PL('debit')} OR ${PL('credit')}) AND ${NORM(KCODE)} IN (${codes.map(() => '?').join(',')})`, f, t, ...codes)) {
      const tg = P.get(r.code + '|' + r.cur); if (tg == null) continue; (by.get(tg) || by.set(tg, []).get(tg)).push(r); }
    return by;
  }
  // Báo cáo theo mẫu: chọn phòng ban (mã danh mục; rỗng = toàn công ty) + giai đoạn → cây mẫu, số theo tháng, cộng dồn các dòng tổng theo STT
  function report(dept, from, to) {
    const f = okYm(from), t = okYm(to), T = all(`SELECT * FROM td_tpl ORDER BY ord`); if (!T.length) return { tpl: 0 };
    const months = []; if (f && t) for (let y = +f.slice(0, 4), m = +f.slice(5); `${y}-${String(m).padStart(2, '0')}` <= t; m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
    const toCat = new Map(all(`SELECT src, code FROM dept_map`).map(r => [key(r.src), r.code])), cats = new Set(all(`SELECT code FROM dept_cat`).map(r => r.code));
    const catOf = v => toCat.get(key(v)) || (cats.has(norm(v)) ? norm(v) : '');
    const RV = `coalesce(e.sales_region, e.type_of_revenue)`, RC = `CASE WHEN instr(${RV},'_')>0 THEN substr(${RV},1,instr(${RV},'_')-1) ELSE ${RV} END`; // doanh thu: mã Sales Region (A0xx), thiếu thì Type of revenue
    const rows = all(`SELECT e.ym, ${NORM('coalesce(f.value, e.department_sub, \'\')')} dv, ${NORM(CODE)} c, ${NORM(RC)} rc,
        sum(CASE WHEN e.acc_debit GLOB '[68]*' AND e.acc_debit NOT LIKE '911%' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_credit GLOB '[68]*' AND e.acc_credit NOT LIKE '911%' THEN e.amount ELSE 0 END) ex,
        sum(CASE WHEN e.acc_credit GLOB '[57]*' AND e.acc_credit NOT LIKE '911%' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_debit GLOB '[57]*' AND e.acc_debit NOT LIKE '911%' THEN e.amount ELSE 0 END) rv
      FROM entries e LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept' WHERE e.ym>=? AND e.ym<=? AND (${PL('debit')} OR ${PL('credit')}) GROUP BY 1,2,3,4`, f, t);
    const V = new Map(), add = (k, ym, a) => { if (!k || Math.abs(a) < 1e-9) return; const o = V.get(k) || V.set(k, {}).get(k); o[ym] = (o[ym] || 0) + a; };
    for (const r of rows) { if (dept && catOf(r.dv) !== dept) continue; add('E:' + r.c, r.ym, r.ex); add('R:' + r.rc, r.ym, r.rv); }
    // phân cấp: A/B = 0, còn lại = số đoạn của STT; dòng lá = dòng sau không sâu hơn
    const lv = s => /^[A-Z]$/i.test(s) ? 0 : String(s).split('.').filter(Boolean).length || 9, revSec = [];
    let sec = 'R'; const L = T.map(x => { if (/^[A-Z]$/i.test(x.stt)) sec = /CHI PH|EXPENSE/i.test(x.vn + x.en) ? 'E' : 'R'; return { ...x, lv: lv(x.stt), sec }; });
    const R = resolver(), used = new Set();
    L.forEach((x, i) => { x.leaf = !(L[i + 1] && L[i + 1].lv > x.lv); const code = /^[A-Z0-9][\w.]*$/i.test(x.code) && x.code !== '0' ? x.code : '';
      x.own = isMulti(x.dept_raw) ? '' : R(x.dept_raw); x.multi = x.leaf && isMulti(x.dept_raw);
      x.v = {}; if (x.leaf && code) { const k = (x.sec === 'E' ? 'E:' : 'R:') + code; used.add(k); Object.assign(x.v, V.get(k) || {}); } });
    for (let i = L.length - 1; i >= 0; i--) { const x = L[i]; if (x.leaf) continue;
      for (let j = i + 1; j < L.length && L[j].lv > x.lv; j++) if (L[j].leaf) for (const m of months) if (L[j].v[m]) x.v[m] = (x.v[m] || 0) + L[j].v[m]; } // dòng tổng = cộng các dòng lá bên trong
    // phát sinh không có trong mẫu
    const other = []; for (const [k, o] of V) if (!used.has(k)) other.push({ code: k.slice(2), sec: k[0], v: o });
    const tot = o => months.reduce((s, m) => s + (o[m] || 0), 0);
    return { tpl: T.length, months, rows: L.map(x => ({ ord: x.ord, code: x.code, stt: x.stt, vn: x.vn, en: x.en, lv: x.lv, leaf: x.leaf, sec: x.sec, own: x.own, raw: x.dept_raw, multi: x.multi, v: x.v, tot: tot(x.v) })),
      other: other.map(o => ({ ...o, tot: tot(o.v) })).filter(o => Math.abs(o.tot) > 0.004).sort((a, b) => a.sec.localeCompare(b.sec) || String(a.code).localeCompare(String(b.code))) };
  }
  return { importAoa, list, setRow, clear, scan, rowsOf, srcOf, report };
}
module.exports = { make };
