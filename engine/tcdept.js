'use strict';
// Quy tắc khoản mục (Type of cost / mã doanh thu) → phòng ban phụ trách.
// Khoản mục có phòng ban = chỉ thuộc 1 phòng ban → bút toán ghi phòng ban khác là hạch toán sai, chuyển hàng loạt về phòng ban đúng (qua field_adj, không sửa dữ liệu gốc).
// Khoản mục "Chưa phân" / để trống = thuộc nhiều phòng ban → không tự chuyển, giữ để phân thủ công.
const norm = s => String(s ?? '').trim();
const key = s => norm(s).toUpperCase().replace(/[\s ]+/g, ' ').replace(/[.]+$/, '');
const CODE = `CASE WHEN instr(e.type_of_cost,'_')>0 THEN substr(e.type_of_cost,1,instr(e.type_of_cost,'_')-1) ELSE e.type_of_cost END`;
const NORM = x => `trim(replace(replace(replace(replace(${x}, char(160), ' '), char(9), ' '), char(13), ' '), char(10), ' '))`;
const PL = s => `((e.acc_${s} GLOB '[5678]*') AND e.acc_${s} NOT LIKE '911%')`; // doanh thu 5xx/7xx, chi phí 6xx/8xx

function make(db, all, get, okYm) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS tc_dept(code TEXT PRIMARY KEY, dept_raw TEXT, dept_code TEXT, name TEXT, updated_at TEXT)`);
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
    tx(() => { for (const r of aoa.slice(h + 1)) { const code = norm(r[cC]); if (!code || code === '0' || /^#/.test(code)) continue;
      const raw = norm(r[cD]), m = isMulti(raw), dc = m ? '' : R(raw); if (m) multi++; else if (!dc) unk.set(raw, (unk.get(raw) || 0) + 1);
      run(`INSERT OR REPLACE INTO tc_dept(code, dept_raw, dept_code, name, updated_at) VALUES(?,?,?,?,datetime('now','localtime'))`, code, raw || 'Chưa phân', dc, cN >= 0 ? norm(r[cN]) : null); n++; } });
    return { n, multi, unknown: [...unk].map(([raw, n]) => ({ raw, n })) };
  }
  const list = () => all(`SELECT t.*, d.name dept_name FROM tc_dept t LEFT JOIN dept_cat d ON d.code=t.dept_code ORDER BY t.code`);
  const setRow = (code, dc) => (run(`UPDATE tc_dept SET dept_code=?, updated_at=datetime('now','localtime') WHERE code=?`, norm(dc), norm(code)), { ok: 1 });
  const clear = () => (run(`DELETE FROM tc_dept`), { ok: 1 });

  // Giá trị Department Sub ghi vào khi chuyển: tên gốc dùng nhiều nhất đang ánh xạ về mã danh mục đó (để báo cáo nhận đúng), không có thì dùng mã
  function srcOf() { const m = new Map();
    for (const r of all(`SELECT m.code, m.src, (SELECT count(*) FROM entries e WHERE e.department_sub=m.src) n FROM dept_map m ORDER BY n DESC`)) if (!m.has(r.code)) m.set(r.code, r.src);
    return c => m.get(c) || c; }

  // Bút toán có khoản mục đã gán 1 phòng ban nhưng phòng ban hiệu lực (sau điều chỉnh) khác → đề xuất chuyển
  function scan(from, to) {
    const f = okYm(from), t = okYm(to); if (!f || !t) return { groups: [], rows: [], multi: { n: 0, a: 0 } };
    const toCat = new Map(all(`SELECT src, code FROM dept_map`).map(r => [key(r.src), r.code])), cats = new Set(all(`SELECT code FROM dept_cat`).map(r => r.code));
    const catOf = v => toCat.get(key(v)) || (cats.has(norm(v)) ? norm(v) : ''), S = srcOf();
    const rows = all(`SELECT e.id, e.ym, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.amount a, e.partner_debit bp, e.partner_credit bpCr, e.description ds, e.created_by u,
        e.type_of_cost tc, e.department_sub orig, ${NORM('coalesce(f.value, e.department_sub, \'\')')} cur, f.value adj, t.code code, t.dept_code want, t.dept_raw raw
      FROM entries e JOIN tc_dept t ON t.code=${NORM(CODE)} LEFT JOIN field_adj f ON f.id=e.id AND f.field='dept'
      WHERE e.ym>=? AND e.ym<=? AND (${PL('debit')} OR ${PL('credit')})`, f, t);
    const out = [], multi = { n: 0, a: 0 }, G = new Map();
    for (const r of rows) {
      const v = (/^[5678]/.test(r.dr) && !/^911/.test(r.dr) ? r.a : 0) - (/^[5678]/.test(r.cr) && !/^911/.test(r.cr) ? r.a : 0);
      if (!r.want) { multi.n++; multi.a += v; continue; }
      const cc = catOf(r.cur); if (cc === r.want) continue;
      const o = { ...r, v, curCat: cc, target: S(r.want) }; out.push(o);
      const k = r.code + '|' + r.cur, g = G.get(k) || G.set(k, { code: r.code, tc: r.tc, cur: r.cur, curCat: cc, want: r.want, n: 0, a: 0 }).get(k); g.n++; g.a += v;
    }
    const nm = new Map(all(`SELECT code, name FROM dept_cat`).map(r => [r.code, r.name]));
    for (const g of G.values()) { g.wantName = nm.get(g.want) || ''; g.curName = nm.get(g.curCat) || ''; }
    return { groups: [...G.values()].sort((a, b) => Math.abs(b.a) - Math.abs(a.a)), rows: out.slice(0, 200000), multi };
  }
  return { importAoa, list, setRow, clear, scan, srcOf };
}
module.exports = { make };
