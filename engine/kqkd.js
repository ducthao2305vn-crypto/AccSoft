'use strict';
// Báo cáo kết quả kinh doanh quản trị theo MẪU của đơn vị (file Excel: STT, Khoản mục EN, Khoản mục VN, cột tháng E..P, quý Q..T…).
// Mẫu được đọc 1 lần thành danh sách dòng: lá (lấy số từ dữ liệu theo ánh xạ), dòng tính (công thức của mẫu), tham số (thuế suất, tỷ lệ sở hữu…).
// Số liệu lá: chi phí = Nợ − Có TK 6xx/8xx theo khoản mục (Type of cost); doanh thu = Có − Nợ TK 5xx/7xx theo loại doanh thu; hoặc theo tiền tố TK.
const norm = s => String(s ?? '').trim();
const nk = s => norm(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const tocCode = t => { const s = norm(t), i = s.indexOf('_'); return i > 0 ? s.slice(0, i) : s; };

// Đọc mẫu từ workbook SheetJS (sheet đầu): công thức chuẩn lấy ở cột Q (quý 1) – lá là dòng có Q = SUM(E r : G r)
function parseTemplate(XLSX, wb) {
  const ws = wb.Sheets[wb.SheetNames[0]], R = XLSX.utils.decode_range(ws['!ref']), lines = [];
  const cell = (c, r) => ws[XLSX.utils.encode_cell({ r, c })];
  // tìm cột "Q" theo vị trí: tiêu đề tháng T1 ở cột E → quý 1 ở cột E + 12
  for (let r = R.s.r; r <= R.e.r; r++) {
    const a = cell(0, r), b = cell(1, r), c = cell(2, r); if (!b && !c) continue;
    const row = r + 1, stt = a ? norm(a.v) : '', en = b ? norm(b.v) : '', vn = c ? norm(c.v) : '';
    if (/^STT$/i.test(stt)) continue;
    const q = ws['Q' + row], e = ws['E' + row], f = q && q.f ? String(q.f).replace(/^\+/, '') : '';
    let kind, expr = null, param = null;
    if (new RegExp(`^SUM\\(E${row}:G${row}\\)$`, 'i').test(f)) kind = 'leaf';
    else if (f) { kind = 'calc'; expr = f.replace(/\$?Q\$?(\d+)/g, 'R$1'); }
    else if (e && typeof e.v === 'number') { kind = 'param'; param = e.v; }
    else kind = 'label';
    lines.push({ row, stt, en, vn, kind, expr, param, sec: row < 94 ? 'sum' : 'det' });
  }
  return lines;
}
// Biên dịch công thức Excel (R123, SUM(...), IFERROR(...), + - * / ( )) thành hàm JS
function compile(expr) {
  const ex = String(expr).replace(/SUM\(([^()]*)\)/gi, (_, a) => '(' + a.split(',').map(t => { const m = /^R(\d+):R(\d+)$/.exec(t.trim()); return m ? `S(${m[1]},${m[2]})` : `(${t.trim()})`; }).join('+') + ')')
    .replace(/IFERROR\(/gi, 'IE(').replace(/R(\d+)/g, 'V($1)');
  if (/[^0-9V()SIE+\-*/.,\s]/.test(ex)) throw new Error('Công thức không hỗ trợ: ' + expr);
  return new Function('V', 'S', 'IE', 'return ' + ex);
}

function make(db, all, get, run, okYm) {
  const tpl = () => { const s = get(`SELECT v FROM settings WHERE k='kqkd_tpl'`); if (s && s.v) return JSON.parse(s.v); return require('./kqkd_template.json'); };
  const params = () => { const s = get(`SELECT v FROM settings WHERE k='kqkd_params'`); return s && s.v ? JSON.parse(s.v) : {}; };
  const maps = () => new Map(all(`SELECT * FROM kq_map`).map(r => [r.row, { cost: JSON.parse(r.cost || '[]'), rev: JSON.parse(r.rev || '[]'), acc: JSON.parse(r.acc || '[]'), note: r.note }]));
  // Tự ánh xạ lá ↔ khoản mục chi phí (theo tên tiếng Anh trùng tên danh mục Type of cost) – chỉ cho lá chưa có ánh xạ
  function autoMap() {
    const L = tpl().filter(l => l.kind === 'leaf'), M = maps(), cm = new Map();
    for (const c of all(`SELECT code, name FROM cost_cat`)) if (!cm.has(nk(c.name))) cm.set(nk(c.name), c.code);
    for (const r of all(`SELECT DISTINCT tcost t FROM agg WHERE tcost IS NOT NULL`)) { const nm = nk(norm(r.t).slice(tocCode(r.t).length + 1)); if (nm && !cm.has(nm)) cm.set(nm, tocCode(r.t)); }
    const rm = new Map(); for (const r of all(`SELECT DISTINCT trev t FROM agg WHERE trev IS NOT NULL`)) rm.set(nk(norm(r.t).replace(/^[^_]*_/, '')), r.t);
    let n = 0; db.exec('BEGIN'); try {
      for (const l of L) { if (M.has(l.row)) continue; const k = nk(l.en), c = cm.get(k), v = rm.get(k); if (!c && !v) continue;
        run(`INSERT OR REPLACE INTO kq_map(row, cost, rev, acc, note) VALUES(?,?,?,?,?)`, l.row, JSON.stringify(c ? [c] : []), JSON.stringify(v ? [v] : []), '[]', 'tự ánh xạ theo tên'); n++; }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n };
  }
  function setMap(row, m) { run(`INSERT OR REPLACE INTO kq_map(row, cost, rev, acc, note) VALUES(?,?,?,?,?)`, +row, JSON.stringify(m.cost || []), JSON.stringify(m.rev || []), JSON.stringify(m.acc || []), norm(m.note)); return { ok: 1 }; }
  const clearMap = row => ({ n: run(`DELETE FROM kq_map WHERE row=?`, +row).changes });
  function setParams(p) { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('kqkd_params', ?)`, JSON.stringify(p || {})); return p; }
  function importTemplate(lines) { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('kqkd_tpl', ?)`, JSON.stringify(lines)); return { n: lines.length }; }
  // Số liệu lá cho một danh sách kỳ [{key, from, to}] + các khoản chưa ánh xạ
  function compute(cols) {
    cols = (cols || []).map(c => ({ ...c, from: okYm(c.from) || '0000-00', to: okYm(c.to) || '9999-12' })).filter(c => c.from <= c.to);
    const L = tpl(), P = { ...Object.fromEntries(L.filter(l => l.kind === 'param').map(l => [l.row, l.param])), ...params() }, M = maps();
    const lo = cols.reduce((m, c) => c.from < m ? c.from : m, '9999-12'), hi = cols.reduce((m, c) => c.to > m ? c.to : m, '0000-00');
    // chỉ mục ánh xạ
    const byCost = new Map(), byRev = new Map(), byAcc = [];
    for (const [row, m] of M) { for (const c of m.cost) (byCost.get(c) || byCost.set(c, []).get(c)).push(row); for (const v of m.rev) (byRev.get(v) || byRev.set(v, []).get(v)).push(row); for (const a of m.acc) if (a && a.p) byAcc.push({ row, p: String(a.p), side: a.side === 'dr' ? 'dr' : 'cr' }); }
    const accW = byAcc.length ? ' OR ' + byAcc.map(a => `acc LIKE '${a.p.replace(/[^0-9A-Za-z]/g, '')}%'`).join(' OR ') : '';
    const rows = all(`SELECT ym, side, acc, tcost, trev, sum(amount) a FROM agg WHERE ym>=? AND ym<=? AND (substr(acc,1,1) IN ('5','6','7','8')${accW}) AND acc NOT LIKE '911%' GROUP BY 1,2,3,4,5`, lo, hi);
    const val = cols.map(() => new Map()), un = new Map(), tot = cols.map(() => ({ rev: 0, exp: 0, mRev: 0, mExp: 0 }));
    const add = (i, row, v) => val[i].set(row, (val[i].get(row) || 0) + v);
    for (const r of rows) {
      const ci = cols.map((c, i) => (r.ym >= c.from && r.ym <= c.to) ? i : -1).filter(i => i >= 0); if (!ci.length) continue;
      const a1 = String(r.acc || '')[0], isExp = a1 === '6' || a1 === '8', isRev = a1 === '5' || a1 === '7';
      const sgnE = r.side === 'dr' ? 1 : -1, sgnR = -sgnE; let hit = false;
      if (isExp) { const L1 = byCost.get(tocCode(r.tcost)); if (L1) { hit = true; for (const i of ci) for (const row of L1) add(i, row, sgnE * r.a); } }
      if (isRev) { const L2 = byRev.get(r.trev); if (L2) { hit = true; for (const i of ci) for (const row of L2) add(i, row, sgnR * r.a); } }
      for (const m of byAcc) if (String(r.acc).startsWith(m.p) && !(isExp && byCost.has(tocCode(r.tcost))) && !(isRev && byRev.has(r.trev))) { hit = true; for (const i of ci) add(i, m.row, (m.side === 'dr' ? sgnE : sgnR) * r.a); }
      if (isExp || isRev) for (const i of ci) { const t = tot[i]; if (isExp) { t.exp += sgnE * r.a; if (hit) t.mExp += sgnE * r.a; } else { t.rev += sgnR * r.a; if (hit) t.mRev += sgnR * r.a; } }
      if (!hit && (isExp || isRev)) { const k = isExp ? 'C|' + (r.tcost || '(trống)') : 'R|' + (r.trev || '(trống)') + '|' + String(r.acc).slice(0, 3); const o = un.get(k) || un.set(k, { kind: isExp ? 'cost' : 'rev', key: isExp ? (r.tcost || '') : (r.trev || ''), acc: String(r.acc).slice(0, 3), v: cols.map(() => 0) }).get(k); for (const i of ci) o.v[i] += isExp ? sgnE * r.a : sgnR * r.a; }
    }
    // tính công thức
    const fn = new Map(); for (const l of L) if (l.kind === 'calc') { try { fn.set(l.row, compile(l.expr)); } catch (e) { fn.set(l.row, null); } }
    const out = cols.map((c, i) => { const memo = new Map(), stack = new Set();
      const V = row => { row = +row; if (memo.has(row)) return memo.get(row); const l = L.find(x => x.row === row); let v = 0;
        if (!l) v = 0; else if (l.kind === 'leaf') v = val[i].get(row) || 0; else if (l.kind === 'param') v = P[row] != null ? +P[row] : 0;
        else if (l.kind === 'calc' && fn.get(row) && !stack.has(row)) { stack.add(row); try { v = fn.get(row)(V, (a, b) => { let s = 0; for (let k = +a; k <= +b; k++) s += V(k); return s; }, (x, y) => (isFinite(x) ? x : y)); } catch { v = 0; } stack.delete(row); }
        if (!isFinite(v)) v = 0; memo.set(row, v); return v; };
      return Object.fromEntries(L.map(l => [l.row, V(l.row)])); });
    return { cols, lines: L.map(l => ({ ...l, map: M.get(l.row) || null })), values: out, unmapped: [...un.values()].filter(u => u.v.some(x => Math.abs(x) > 0.004)).sort((a, b) => Math.abs(b.v[0]) - Math.abs(a.v[0])), totals: tot, params: P };
  }
  // Danh sách khoản mục / loại doanh thu đang có trong dữ liệu (để chọn khi ánh xạ)
  function sources() {
    return { cost: all(`SELECT c.code, c.name, c.vn, c.grp FROM cost_cat c ORDER BY c.code`), costData: all(`SELECT tcost t, sum(amount) a FROM agg WHERE tcost IS NOT NULL GROUP BY 1`).map(r => ({ code: tocCode(r.t), t: r.t, a: r.a })),
      rev: all(`SELECT trev t, sum(CASE WHEN side='cr' THEN amount ELSE -amount END) a, count(*) n FROM agg WHERE trev IS NOT NULL AND substr(acc,1,1) IN ('5','7') GROUP BY 1 ORDER BY a DESC`) };
  }
  return { tpl, compute, autoMap, setMap, clearMap, setParams, importTemplate, sources, maps: () => [...maps()].map(([row, m]) => ({ row, ...m })) };
}
function ensure(db) { db.exec(`CREATE TABLE IF NOT EXISTS kq_map(row INTEGER PRIMARY KEY, cost TEXT, rev TEXT, acc TEXT, note TEXT)`); }
module.exports = { make, ensure, parseTemplate, compile };
