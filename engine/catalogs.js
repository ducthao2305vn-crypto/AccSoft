'use strict';
// Danh mục phòng ban (có ánh xạ: 1 phòng ban danh mục ↔ nhiều tên phòng ban trong dữ liệu gốc) và danh mục khoản mục chi phí (Type of cost)
const COST_COLS = ['code', 'name', 'descr', 'level', 'active', 'has_loc', 'has_prod', 'grp', 'vn', 'kd1', 'note'];
const COST_HDR = { code: 'Code', name: 'Name', descr: 'Description', level: 'Summary Level', active: 'Active', has_loc: 'Has Location', has_prod: 'Has Product', grp: 'Expense Group', vn: 'Tiếng Việt', kd1: 'Khoản mục KD1', note: 'Ghi chú' };
const DEPT_HDR = { code: 'Code', name: 'Name', descr: 'Description', note: 'Ghi chú' };
const norm = s => String(s ?? '').trim();
const key = s => norm(s).toUpperCase().replace(/\s+/g, ' ');
const tocCode = t => { const s = norm(t), i = s.indexOf('_'); return i > 0 ? s.slice(0, i) : s; }; // 'E17.1.1.1.4_Dep…' → 'E17.1.1.1.4'

function make(db, all, get, run) {
  const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  /* ---- Phòng ban ---- */
  function deptList() {
    const maps = all(`SELECT m.src, m.code, (SELECT count(*) FROM entries e WHERE e.department=m.src) n FROM dept_map m`);
    const by = new Map(); for (const m of maps) (by.get(m.code) || by.set(m.code, []).get(m.code)).push({ src: m.src, n: m.n });
    return all(`SELECT * FROM dept_cat ORDER BY code`).map(d => ({ ...d, maps: by.get(d.code) || [], n: (by.get(d.code) || []).reduce((s, x) => s + x.n, 0) }));
  }
  function deptUpsert(r, old) {
    r = { code: norm(r.code), name: norm(r.name), descr: norm(r.descr), note: norm(r.note) }; if (!r.code) throw new Error('Nhập mã phòng ban');
    return tx(() => { if (old && old !== r.code) { run(`DELETE FROM dept_cat WHERE code=?`, old); run(`UPDATE dept_map SET code=? WHERE code=?`, r.code, old); }
      run(`INSERT INTO dept_cat(code, name, descr, note, updated_at) VALUES(?,?,?,?,datetime('now','localtime')) ON CONFLICT(code) DO UPDATE SET name=excluded.name, descr=excluded.descr, note=excluded.note, updated_at=excluded.updated_at`, r.code, r.name, r.descr, r.note); return r; });
  }
  const deptRemove = codes => tx(() => { let n = 0; for (const c of [].concat(codes || [])) { run(`DELETE FROM dept_map WHERE code=?`, c); n += run(`DELETE FROM dept_cat WHERE code=?`, c).changes; } return { n }; });
  // Tên phòng ban trong dữ liệu gốc + phòng ban danh mục đang ánh xạ
  function deptSources() {
    return all(`SELECT e.department src, count(*) n, min(e.account_date) f, max(e.account_date) l, m.code FROM entries e LEFT JOIN dept_map m ON m.src=e.department WHERE e.department IS NOT NULL AND e.department<>'' GROUP BY 1 ORDER BY n DESC`);
  }
  function deptMapSet(srcs, code) { return tx(() => { let n = 0; for (const s of [].concat(srcs || [])) { if (!s) continue; if (!code) run(`DELETE FROM dept_map WHERE src=?`, s); else run(`INSERT OR REPLACE INTO dept_map(src, code) VALUES(?,?)`, s, code); n++; } return { n }; }); }
  // Tự ánh xạ theo tên / mã / mô tả trùng (không phân biệt hoa thường); chỉ điền các tên chưa ánh xạ
  function deptAutoMap() {
    const cat = all(`SELECT * FROM dept_cat`), idx = new Map(); for (const d of cat) for (const k of [d.name, d.code, d.descr]) if (norm(k)) idx.set(key(k), d.code);
    let n = 0; return tx(() => { for (const s of deptSources()) { if (s.code) continue; const c = idx.get(key(s.src)); if (c) { run(`INSERT OR REPLACE INTO dept_map(src, code) VALUES(?,?)`, s.src, c); n++; } } return { n }; });
  }
  /* ---- Khoản mục chi phí ---- */
  function costList(q = '', grp = '', offset = 0, limit = 500) {
    const w = ['1'], a = []; if (grp) { w.push(grp === '(trống)' ? "ifnull(grp,'')=''" : 'grp=?'); if (grp !== '(trống)') a.push(grp); }
    if (q) { w.push('(code LIKE ? OR name LIKE ? OR descr LIKE ? OR vn LIKE ? OR kd1 LIKE ?)'); a.push(...Array(5).fill('%' + q + '%')); }
    const W = 'WHERE ' + w.join(' AND '), used = new Map(all(`SELECT type_of_cost t, count(*) n FROM entries WHERE type_of_cost IS NOT NULL GROUP BY 1`).map(r => [tocCode(r.t), r.n]));
    return { total: get(`SELECT count(*) n FROM cost_cat ${W}`, ...a).n, groups: all(`SELECT ifnull(grp,'') g, count(*) n FROM cost_cat GROUP BY 1 ORDER BY 1`),
      rows: all(`SELECT * FROM cost_cat ${W} ORDER BY code LIMIT ? OFFSET ?`, ...a, limit, offset).map(r => ({ ...r, used: used.get(r.code) || 0 })) };
  }
  function costUpsert(r, old) {
    const v = Object.fromEntries(COST_COLS.map(k => [k, norm(r[k])])); if (!v.code) throw new Error('Nhập mã khoản mục');
    return tx(() => { if (old && old !== v.code) run(`DELETE FROM cost_cat WHERE code=?`, old);
      run(`INSERT INTO cost_cat(${COST_COLS.join(',')}, updated_at) VALUES(${COST_COLS.map(() => '?').join(',')}, datetime('now','localtime')) ON CONFLICT(code) DO UPDATE SET ${COST_COLS.slice(1).map(k => `${k}=excluded.${k}`).join(',')}, updated_at=excluded.updated_at`, ...COST_COLS.map(k => v[k])); return v; });
  }
  const costRemove = codes => tx(() => { let n = 0; for (const c of [].concat(codes || [])) n += run(`DELETE FROM cost_cat WHERE code=?`, c).changes; return { n }; });
  // Khoản mục đang hạch toán nhưng chưa có trong danh mục
  function costUnmatched() {
    const have = new Set(all(`SELECT code FROM cost_cat`).map(r => r.code));
    return all(`SELECT type_of_cost t, count(*) n, max(account_date) l FROM entries WHERE type_of_cost IS NOT NULL AND type_of_cost<>'' GROUP BY 1 ORDER BY n DESC`).filter(r => !have.has(tocCode(r.t))).map(r => ({ ...r, code: tocCode(r.t), name: norm(r.t).slice(tocCode(r.t).length + 1) }));
  }
  /* ---- Nạp / xuất ---- */
  const pick = (r, ...ks) => { for (const k of ks) { const f = Object.keys(r).find(x => key(x) === key(k)); if (f != null && norm(r[f]) !== '') return norm(r[f]); } return ''; };
  function importRows(kind, rows, mode = 'merge') {
    let n = 0;
    return tx(() => {
      if (kind === 'dept') { if (mode === 'replace') run(`DELETE FROM dept_cat`);
        for (const r of rows) { const code = pick(r, 'Code', 'Mã', 'Ma'); if (!code) continue; run(`INSERT INTO dept_cat(code, name, descr, note, updated_at) VALUES(?,?,?,?,datetime('now','localtime')) ON CONFLICT(code) DO UPDATE SET name=excluded.name, descr=excluded.descr, note=coalesce(nullif(excluded.note,''),dept_cat.note), updated_at=excluded.updated_at`,
          code, pick(r, 'Name', 'Tên'), pick(r, 'Description', 'Mô tả', 'Diễn giải'), pick(r, 'Ghi chú', 'Note')); n++;
          const src = pick(r, 'Phòng ban dữ liệu gốc', 'Mapped departments'); if (src) for (const s of src.split(/\s*;\s*/).filter(Boolean)) run(`INSERT OR REPLACE INTO dept_map(src, code) VALUES(?,?)`, s, code); } }
      else { if (mode === 'replace') run(`DELETE FROM cost_cat`);
        for (const r of rows) { const v = Object.fromEntries(COST_COLS.map(k => [k, pick(r, COST_HDR[k], k)])); if (!v.code) continue;
          run(`INSERT INTO cost_cat(${COST_COLS.join(',')}, updated_at) VALUES(${COST_COLS.map(() => '?').join(',')}, datetime('now','localtime')) ON CONFLICT(code) DO UPDATE SET ${COST_COLS.slice(1).map(k => `${k}=excluded.${k}`).join(',')}, updated_at=excluded.updated_at`, ...COST_COLS.map(k => v[k])); n++; } }
      return { n, total: get(`SELECT count(*) n FROM ${kind === 'dept' ? 'dept_cat' : 'cost_cat'}`).n };
    });
  }
  function exportAll(kind) {
    if (kind === 'dept') return deptList().map(d => ({ Code: d.code, Name: d.name, Description: d.descr, 'Ghi chú': d.note, 'Phòng ban dữ liệu gốc': d.maps.map(m => m.src).join('; '), 'Số dòng hạch toán': d.n }));
    return all(`SELECT * FROM cost_cat ORDER BY code`).map(r => Object.fromEntries(COST_COLS.map(k => [COST_HDR[k], r[k]])));
  }
  // Tra cứu dùng cho báo cáo: tên phòng ban gốc → phòng ban danh mục; type_of_cost → khoản mục danh mục
  const deptOf = () => new Map(all(`SELECT m.src, d.code, d.name FROM dept_map m JOIN dept_cat d ON d.code=m.code`).map(r => [r.src, r]));
  const costOf = () => new Map(all(`SELECT * FROM cost_cat`).map(r => [r.code, r]));
  return { deptList, deptUpsert, deptRemove, deptSources, deptMapSet, deptAutoMap, costList, costUpsert, costRemove, costUnmatched, importRows, exportAll, deptOf, costOf, tocCode };
}
// Tạo bảng + nạp sẵn danh mục mặc định (2 file khách hàng cung cấp) khi chưa có
function ensure(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS dept_cat(code TEXT PRIMARY KEY, name TEXT, descr TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS dept_map(src TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE IF NOT EXISTS cost_cat(code TEXT PRIMARY KEY, ${COST_COLS.slice(1).map(c => c + ' TEXT').join(', ')}, updated_at TEXT);`);
  try {
    const seed = require('./seed_catalogs.json');
    if (!db.prepare('SELECT 1 FROM dept_cat LIMIT 1').get()) { const st = db.prepare(`INSERT OR IGNORE INTO dept_cat(code, name, descr, updated_at) VALUES(?,?,?,datetime('now','localtime'))`); for (const r of seed.dept) st.run(r.code, r.name, r.descr); }
    if (!db.prepare('SELECT 1 FROM cost_cat LIMIT 1').get()) { const st = db.prepare(`INSERT OR IGNORE INTO cost_cat(${COST_COLS.join(',')}, updated_at) VALUES(${COST_COLS.map(() => '?').join(',')}, datetime('now','localtime'))`); for (const r of seed.cost) st.run(...COST_COLS.map(k => r[k] ?? '')); }
    // ánh xạ ban đầu theo tên trùng
    if (!db.prepare('SELECT 1 FROM dept_map LIMIT 1').get()) {
      const idx = new Map(); for (const d of db.prepare('SELECT * FROM dept_cat').all()) for (const k of [d.name, d.code, d.descr]) if (norm(k)) idx.set(key(k), d.code);
      const st = db.prepare('INSERT OR IGNORE INTO dept_map(src, code) VALUES(?,?)');
      for (const r of db.prepare(`SELECT DISTINCT department s FROM entries WHERE department IS NOT NULL AND department<>''`).all()) { const c = idx.get(key(r.s)); if (c) st.run(r.s, c); }
    }
  } catch (e) { /* seed không bắt buộc */ }
}
module.exports = { make, ensure };
