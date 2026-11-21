'use strict';
// Kế hoạch chi phí theo năm × tháng × mã khoản mục (Code ERP = phần trước "_" của Type of cost) × phòng ban giao.
// So sánh với thực hiện: chi phí = Nợ − Có TK 6xx/8xx (bỏ kết chuyển 911), Source Amount, phòng ban hiệu lực (sau điều chỉnh) ánh xạ về danh mục.
const norm = s => String(s ?? '').trim();
const key = s => norm(s).toUpperCase().replace(/[\s ]+/g, ' ').replace(/[.]+$/, '');
const CODE = `CASE WHEN instr(e.type_of_cost,'_')>0 THEN substr(e.type_of_cost,1,instr(e.type_of_cost,'_')-1) ELSE e.type_of_cost END`;
const NORM = x => `trim(replace(replace(replace(replace(${x}, char(160), ' '), char(9), ' '), char(13), ' '), char(10), ' '))`;
// bút toán kết chuyển (một vế là 911) bị loại hẳn – không tính vế 6xx/8xx đối ứng
const EXP = s => `(e.acc_${s} GLOB '[68]*' AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%')`;
const num = v => { const n = typeof v === 'number' ? v : +String(v ?? '').replace(/,/g, ''); return isFinite(n) ? n : 0; };

// Thuế TNDN (Profit tax): không giao cho phòng ban nào – loại khỏi so sánh kế hoạch – thực hiện (xem ở Kết quả hoạt động: LNTT → thuế → LNST)
const TAX = ['E17.1.11.4.3'];
function make(db, all) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS bud_plan(id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, ord INTEGER, code TEXT, en TEXT, vn TEXT, dept_raw TEXT, dept_code TEXT, m TEXT, note TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_bud_year ON bud_plan(year);`);
  const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  function resolver() {
    const cat = all(`SELECT code, name FROM dept_cat`), M = new Map();
    for (const c of cat) { M.set(key(c.code), c.code); if (c.name) M.set(key(c.name), c.code); }
    for (const m of all(`SELECT src, code FROM dept_map`)) if (!M.has(key(m.src))) M.set(key(m.src), m.code);
    return s => { const k = key(s); if (!k) return ''; if (M.has(k)) return M.get(k); const c = cat.find(c => c.name && (key(c.name).includes(k) || k.includes(key(c.name)))); return c ? c.code : ''; };
  }
  const pack = r => ({ ...r, m: JSON.parse(r.m || '[]').map(num), tot: JSON.parse(r.m || '[]').reduce((s, x) => s + num(x), 0) });
  const years = () => all(`SELECT year, count(*) n, sum(0) a FROM bud_plan GROUP BY year ORDER BY year`).map(y => ({ ...y, a: all(`SELECT m FROM bud_plan WHERE year=?`, y.year).reduce((s, r) => s + JSON.parse(r.m || '[]').reduce((t, x) => t + num(x), 0), 0) }));
  const list = year => all(`SELECT p.*, d.name dept_name FROM bud_plan p LEFT JOIN dept_cat d ON d.code=p.dept_code WHERE year=? ORDER BY ord, id`, +year).map(pack);

  // Nạp file: dòng tiêu đề có "Code ERP" + T1…T12 (+ Khoản mục tiếng Anh / Việt, KH năm, Phòng ban). mode: replace = thay cả năm, append = thêm dòng
  function importAoa(aoa, year, mode = 'replace') {
    aoa = aoa || []; let h = -1, C = {};
    for (let i = 0; i < Math.min(aoa.length, 30) && h < 0; i++) { const r = (aoa[i] || []).map(key), f = re => r.findIndex(x => re.test(x));
      const c = f(/^CODE( ERP)?$|^MÃ( KHOẢN MỤC)?$/), t1 = f(/^(T|THÁNG ?)0?1$/);
      if (c >= 0 && t1 >= 0) { h = i; C = { c, en: f(/TI(Ế|E)NG ?ANH|ENGLISH/), vn: f(/TI(Ế|E)NG ?VI(Ệ|E)T|VIETNAM/), d: f(/PH(Ò|O)NG ?BAN|DEPARTMENT/), m: Array.from({ length: 12 }, (_, k) => f(new RegExp(`^(T|THÁNG ?)0?${k + 1}$`))) };
        const y = r.map(x => /(20\d\d)/.exec(x)).find(Boolean); if (!year && y) year = +y[1]; } }
    if (h < 0) throw new Error('Không thấy dòng tiêu đề có cột "Code ERP" và T1…T12');
    year = +year; if (!(year > 2000)) throw new Error('Chưa xác định năm kế hoạch');
    const R = resolver(), unk = new Map(); let n = 0;
    tx(() => { if (mode !== 'append') run(`DELETE FROM bud_plan WHERE year=?`, year);
      let o = mode === 'append' ? ((all(`SELECT max(ord) o FROM bud_plan WHERE year=?`, year)[0] || {}).o || 0) : 0;
      for (const r of aoa.slice(h + 1)) { const code = norm(r[C.c]); if (!code || /^#|^0$/.test(code)) continue;
        const raw = C.d >= 0 ? norm(r[C.d]) : '', dc = R(raw); if (raw && !dc) unk.set(raw, (unk.get(raw) || 0) + 1);
        run(`INSERT INTO bud_plan(year, ord, code, en, vn, dept_raw, dept_code, m, updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))`, year, ++o, code,
          C.en >= 0 ? norm(r[C.en]) : '', C.vn >= 0 ? norm(r[C.vn]) : '', raw, dc, JSON.stringify(C.m.map(k => k >= 0 ? num(r[k]) : 0))); n++; } });
    return { year, n, unknown: [...unk].map(([raw, n]) => ({ raw, n })) };
  }
  // Thêm / sửa một dòng kế hoạch (nhập tay, bổ sung trong năm)
  function save(r) {
    const m = JSON.stringify((r.m || []).slice(0, 12).concat(Array(12).fill(0)).slice(0, 12).map(num)), code = norm(r.code); if (!code) throw new Error('Nhập Code ERP');
    const dc = norm(r.dept_code), raw = norm(r.dept_raw) || (dc ? ((all(`SELECT name FROM dept_cat WHERE code=?`, dc)[0] || {}).name || dc) : '');
    if (r.id) run(`UPDATE bud_plan SET code=?, en=?, vn=?, dept_raw=?, dept_code=?, m=?, note=?, updated_at=datetime('now','localtime') WHERE id=?`, code, norm(r.en), norm(r.vn), raw, dc, m, norm(r.note), +r.id);
    else run(`INSERT INTO bud_plan(year, ord, code, en, vn, dept_raw, dept_code, m, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`, +r.year,
      ((all(`SELECT max(ord) o FROM bud_plan WHERE year=?`, +r.year)[0] || {}).o || 0) + 1, code, norm(r.en), norm(r.vn), raw, dc, m, norm(r.note));
    return { ok: 1 };
  }
  // Cây ngân sách (sheet DM_CP_PB): STT phân cấp · Funding Type · Group Cost · Erp Code · tên EN / VN · phòng ban phụ trách
  db.exec(`CREATE TABLE IF NOT EXISTS bud_tree(ord INTEGER PRIMARY KEY, stt TEXT, lvl INTEGER, code TEXT, en TEXT, vn TEXT, funding TEXT, grp TEXT, dept_raw TEXT)`);
  function importTree(aoa) { let h = -1; for (let i = 0; i < Math.min(aoa.length, 15); i++) { const r = aoa[i].map(x => norm(x).toUpperCase()); if (r.includes('STT') && r.some(x => x.startsWith('ERP CODE'))) { h = i; break; } }
    if (h < 0) throw new Error('Không thấy tiêu đề (STT, Funding Type, Group Cost, Erp Code, Type of cost, Khoản mục, PHONG BAN) – như sheet DM_CP_PB');
    const H = aoa[h].map(x => norm(x).toUpperCase()), ix = re => H.findIndex(x => re.test(x)), c = { stt: ix(/^STT/), fund: ix(/FUNDING/), grp: ix(/GROUP COST/), code: ix(/^ERP CODE/), en: ix(/^TYPE OF COST/), vn: ix(/TI(Ế|E)NG VI/), dept: ix(/PH(Ò|O)NG BAN/) };
    return tx(() => { run(`DELETE FROM bud_tree`); let n = 0; const ins = db.prepare(`INSERT INTO bud_tree(ord, stt, lvl, code, en, vn, funding, grp, dept_raw) VALUES(?,?,?,?,?,?,?,?,?)`);
      for (const r of aoa.slice(h + 1)) { const stt = norm(r[c.stt]), en = norm(r[c.en]), vn = norm(r[c.vn]); if (!stt && !en && !vn) continue; if (/^[a-z]$/.test(stt)) continue;
        const code = norm(r[c.code]); ins.run(++n, stt, /^[A-Z]$/.test(stt) ? 0 : stt.split('.').length, code || null, en, vn, norm(r[c.fund]), norm(r[c.grp]), code ? norm(r[c.dept]) : ''); }
      return { n }; }); }
  const tree = () => all(`SELECT * FROM bud_tree ORDER BY ord`);
  // Trưởng bộ phận nhận thông báo chi phí: phòng ban danh mục → nhân viên (danh mục nhân viên)
  db.exec(`CREATE TABLE IF NOT EXISTS dept_head(dept_code TEXT PRIMARY KEY, staff_code TEXT, cc TEXT, note TEXT, sent_at TEXT, sent_to TEXT)`);
  const heads = () => all(`SELECT c.code dept, c.name, h.staff_code, h.cc, h.sent_at, h.sent_to, s.name sname, s.position, coalesce(nullif(s.email1,''), s.email2) email FROM dept_cat c LEFT JOIN dept_head h ON h.dept_code=c.code LEFT JOIN staff s ON s.code=h.staff_code ORDER BY c.code`);
  const setHead = (dept, staff, cc) => { run(`INSERT INTO dept_head(dept_code, staff_code, cc) VALUES(?,?,?) ON CONFLICT(dept_code) DO UPDATE SET staff_code=excluded.staff_code, cc=coalesce(excluded.cc, dept_head.cc)`, norm(dept), norm(staff) || null, cc == null ? null : norm(cc)); return { ok: 1 }; };
  const markSent = (dept, to) => run(`UPDATE dept_head SET sent_at=datetime('now','localtime'), sent_to=? WHERE dept_code=?`, to, dept);
  // Nội dung thông báo cho 1 phòng ban: KH – TH kỳ, vượt / không, khoản mục vượt, KH năm còn lại cho các tháng còn lại
  function notice(year, from, to, dept) {
    const r = compare({ year, from, to, view: 'dept', dept }), T = r.total, g = r.groups[0] || { rows: [] };
    const CC = new Map(); try { for (const r of all(`SELECT code, name FROM cost_cat WHERE ifnull(name,'')<>''`)) CC.set(String(r.code).toUpperCase(), r.name); } catch { }
    const rows = g.rows.filter(x => Math.abs(x.P) + Math.abs(x.A) + Math.abs(x.PY) > 0.004).map(x => ({ code: x.code, vn: x.vn, en: CC.get(String(x.code).toUpperCase()) || x.en, P: x.P, A: x.A, PY: x.PY, over: x.A > x.P + 0.004, remain: x.PY - x.A, inPlan: x.inPlan }));
    const h = heads().find(z => z.dept === dept) || { dept, name: dept };
    return { year: r.year, from: r.from, to: r.to, dept, deptName: h.name, head: h, P: T.P, A: T.A, PY: T.PY, over: T.A > T.P + 0.004, remain: T.PY - T.A, monthsLeft: 12 - r.to,
      tree: tree(), rows, overRows: rows.filter(x => x.over).sort((a, b) => (b.A - b.P) - (a.A - a.P)), outPlan: rows.filter(x => !x.inPlan && x.A > 0.004), hasPlan: r.hasPlan };
  }
  // Đổi phòng ban các dòng kế hoạch của (năm, mã khoản mục, phòng ban cũ) → phòng ban mới
  function moveDept(year, code, from, to) { to = norm(to); if (!to) throw new Error('Chọn phòng ban đích'); const nm = ((all(`SELECT name FROM dept_cat WHERE code=?`, to)[0] || {}).name || to);
    return tx(() => ({ n: run(`UPDATE bud_plan SET dept_code=?, dept_raw=?, updated_at=datetime('now','localtime') WHERE year=? AND code=? AND ifnull(dept_code,'')=?`, to, nm, +year, norm(code), norm(from)).changes })); }
  const remove = ids => tx(() => ({ n: [].concat(ids || []).reduce((s, id) => s + run(`DELETE FROM bud_plan WHERE id=?`, +id).changes, 0) }));
  // Lập kế hoạch năm mới từ năm có sẵn (giữ mã, tên, phòng ban; số theo hệ số, mặc định 0)
  function copyYear(from, to, factor = 0) {
    if (all(`SELECT 1 x FROM bud_plan WHERE year=? LIMIT 1`, +to).length) throw new Error(`Năm ${to} đã có kế hoạch – xoá trước hoặc nạp file`);
    return tx(() => { let n = 0; for (const r of all(`SELECT * FROM bud_plan WHERE year=? ORDER BY ord, id`, +from)) {
      run(`INSERT INTO bud_plan(year, ord, code, en, vn, dept_raw, dept_code, m, updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))`, +to, r.ord, r.code, r.en, r.vn, r.dept_raw, r.dept_code,
        JSON.stringify(JSON.parse(r.m || '[]').map(x => Math.round(num(x) * +factor * 100) / 100))); n++; } return { n }; });
  }

  // So sánh KH – TH. view: co = toàn công ty theo khoản mục; dept = 1 phòng ban theo khoản mục; bydept = toàn công ty theo phòng ban → khoản mục
  function compare(o = {}) {
    const year = +o.year, f = Math.max(1, Math.min(12, +o.from || 1)), t = Math.max(f, Math.min(12, +o.to || 12)), dept = norm(o.dept), view = o.view || 'co';
    const ym = k => `${year}-${String(k).padStart(2, '0')}`;
    const toCat = new Map(all(`SELECT src, code FROM dept_map`).map(r => [key(r.src), r.code])), cats = all(`SELECT code, name FROM dept_cat`), catSet = new Set(cats.map(c => c.code)), dName = new Map(cats.map(c => [c.code, c.name]));
    const catOf = v => toCat.get(key(v)) || (catSet.has(norm(v)) ? norm(v) : '');
    const isTax = c => TAX.includes(c);
    const ccName = new Map(); try { for (const r of all(`SELECT code, name, vn FROM cost_cat`)) ccName.set(r.code, r); } catch { }
    const A = new Map(), P = new Map(), names = new Map(), add = (M, k, mi, v) => { const o = M.get(k) || M.set(k, Array(13).fill(0)).get(k); o[mi] += v; };
    for (const r of all(`SELECT e.ym, ${NORM('coalesce(f.value, e.department_sub, \'\')')} dv, ${NORM(CODE)} c, e.type_of_cost tc,
        sum(CASE WHEN ${EXP('debit')} THEN e.amount ELSE 0 END) - sum(CASE WHEN ${EXP('credit')} THEN e.amount ELSE 0 END) v
      FROM entries e LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept' WHERE e.ym>=? AND e.ym<=? AND (${EXP('debit')} OR ${EXP('credit')}) AND e.acc_debit NOT LIKE '821%' AND e.acc_credit NOT LIKE '821%' GROUP BY 1,2,3,4`, ym(1), ym(12))) {
      const dc = catOf(r.dv) || '(chưa ánh xạ)', c = r.c || '(không có khoản mục)'; if ((dept && dc !== dept) || isTax(c)) continue;
      add(A, c + '|' + dc, +r.ym.slice(5), r.v); if (r.tc && !names.has(c)) names.set(c, { en: norm(String(r.tc).slice(String(r.tc).indexOf('_') + 1)) }); }
    for (const r of all(`SELECT * FROM bud_plan WHERE year=?`, year)) { const dc = r.dept_code || '(chưa ánh xạ)'; if ((dept && dc !== dept) || isTax(r.code)) continue;
      JSON.parse(r.m || '[]').forEach((v, i) => add(P, r.code + '|' + dc, i + 1, num(v))); const nm = names.get(r.code) || {}; if (!nm.vn) names.set(r.code, { en: r.en || nm.en, vn: r.vn }); }
    const keys = new Set([...A.keys(), ...P.keys()]), sum = (a, x, y) => { let s = 0; for (let k = x; k <= y; k++) s += a ? a[k] : 0; return s; };
    const lines = [...keys].map(k => { const [code, dc] = k.split('|'), a = A.get(k), p = P.get(k), nm = names.get(code) || {}, cc = ccName.get(code) || {};
      return { code, dept: dc, deptName: dName.get(dc) || dc, vn: nm.vn || cc.vn || '', en: nm.en || cc.name || '', inPlan: !!p,
        mP: p ? p.slice(1) : Array(12).fill(0), mA: a ? a.slice(1) : Array(12).fill(0), P: sum(p, f, t), A: sum(a, f, t), PY: sum(p, 1, 12), AY: sum(a, 1, 12) }; })
      .filter(x => Math.abs(x.P) > 0.004 || Math.abs(x.A) > 0.004 || Math.abs(x.PY) > 0.004);
    const merge = L => { const M = new Map(); for (const x of L) { const o = M.get(x.code) || M.set(x.code, { ...x, dept: '', deptName: '', mP: Array(12).fill(0), mA: Array(12).fill(0), P: 0, A: 0, PY: 0, AY: 0, inPlan: false }).get(x.code);
      x.mP.forEach((v, i) => o.mP[i] += v); x.mA.forEach((v, i) => o.mA[i] += v); o.P += x.P; o.A += x.A; o.PY += x.PY; o.AY += x.AY; o.inPlan = o.inPlan || x.inPlan; if (!o.vn) o.vn = x.vn; } return [...M.values()]; };
    const byCode = (a, b) => a.code.localeCompare(b.code, 'en', { numeric: true });
    const tot = L => L.reduce((s, x) => { s.P += x.P; s.A += x.A; s.PY += x.PY; s.AY += x.AY; x.mP.forEach((v, i) => s.mP[i] += v); x.mA.forEach((v, i) => s.mA[i] += v); return s; }, { P: 0, A: 0, PY: 0, AY: 0, mP: Array(12).fill(0), mA: Array(12).fill(0) });
    let groups;
    if (view === 'bydept') { const D = new Map(); for (const x of lines) (D.get(x.dept) || D.set(x.dept, []).get(x.dept)).push(x);
      groups = [...D].map(([dc, L]) => ({ dept: dc, name: dName.get(dc) || dc, rows: L.sort(byCode), ...tot(L) })).sort((a, b) => b.PY - a.PY || b.A - a.A); }
    else { const L = merge(lines).sort(byCode); groups = [{ dept: dept, name: dept ? (dName.get(dept) || dept) : 'Toàn công ty', rows: L, ...tot(L) }]; }
    return { year, from: f, to: t, dept, view, groups, total: tot(lines), hasPlan: !!all(`SELECT 1 x FROM bud_plan WHERE year=? LIMIT 1`, year).length };
  }
  // Bút toán thực hiện của 1 mã khoản mục (và phòng ban danh mục) trong kỳ
  function lines(code, dept, from, to) {
    const toCat = new Map(all(`SELECT src, code FROM dept_map`).map(r => [key(r.src), r.code])), catSet = new Set(all(`SELECT code FROM dept_cat`).map(r => r.code)), catOf = v => toCat.get(key(v)) || (catSet.has(norm(v)) ? norm(v) : '') || '(chưa ánh xạ)';
    return all(`SELECT e.id, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.amount a, coalesce(e.amount_acc, e.amount) aa, e.department_sub dept0, e.partner_debit bp, e.partner_credit bpCr, e.description ds, e.created_by u, ${NORM('coalesce(f.value, e.department_sub, \'\')')} dept
      FROM entries e LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept' WHERE e.ym>=? AND e.ym<=? AND ${NORM(CODE)}=? AND (${EXP('debit')} OR ${EXP('credit')}) ORDER BY e.account_date, e.id`, from, to, code === '(không có khoản mục)' ? '' : code)
      .filter(r => !dept || catOf(r.dept) === dept).map(r => ({ ...r, v: (/^[68]/.test(r.dr) ? r.a : 0) - (/^[68]/.test(r.cr) ? r.a : 0) }));
  }
  return { importTree, tree, heads, setHead, markSent, notice, moveDept, years, list, importAoa, save, remove, copyYear, compare, lines };
}
module.exports = { make };
