'use strict';
// Theo dõi đầu tư (CAPEX) theo năm kế hoạch – mẫu "DAUTU": hạng mục tổng → chi tiết (cây nhiều cấp), 3 nhóm:
//   normal = đầu tư thông thường (không gồm tổng trạm, tần số) · station = đầu tư tổng trạm · freq = tần số
// Mỗi hạng mục: ngân sách 3 năm (năm trước / năm KH / năm sau), đã thực hiện, kế hoạch tháng T1–T12 cho 3 lớp:
//   proc = mua sắm / thủ tục thầu · pay = thanh toán (dòng tiền) · ast = nghiệm thu lên tài sản; kèm số thực hiện tháng (proc_a, pay_a, ast_a).
// Hạng mục có chi tiết: số liệu = cộng các chi tiết. Chưa lên TS = tổng ngân sách − tổng lên TS (kế hoạch).
const Z = () => Array(12).fill(0);
const s = v => String(v ?? '').trim();
const n = v => { if (v == null || v === '') return 0; if (typeof v === 'number') return isFinite(v) ? v : 0; const t = String(v).replace(/[,\s]/g, ''); return isFinite(+t) ? +t : 0; };
const arr = v => { let a; try { a = Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { a = []; } return Array.from({ length: 12 }, (_, i) => n(a[i])); };
const GRP = { normal: 'Đầu tư thông thường', station: 'Đầu tư tổng trạm', freq: 'Đầu tư tần số' };
const grpOf = name => /tần số|tan so|frequency|spectrum/i.test(name) ? 'freq' : /tổng trạm|tong tram|core site|tổng tram/i.test(name) ? 'station' : 'normal';
const STATUS = ['Chưa bắt đầu', 'Đang thực hiện', 'Đã hoàn thành', 'Đã lên TS hết', 'Chuyển năm sau', 'Tạm dừng'];
const NUM = ['b0', 'b1', 'b2', 'done', 'cval', 'adv'], ARR = ['proc', 'pay', 'ast', 'proc_a', 'pay_a', 'ast_a'], ROLL = [...ARR, 'cip_a'];

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS cx_item(id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, parent INTEGER, grp TEXT, stt TEXT, name TEXT, dept TEXT,
    b0 REAL, b1 REAL, b2 REAL, done REAL, proc TEXT, pay TEXT, ast TEXT, proc_a TEXT, pay_a TEXT, ast_a TEXT, atype TEXT, acode TEXT, status TEXT, note TEXT, sort INTEGER, upd TEXT);
    CREATE INDEX IF NOT EXISTS ix_cx_year ON cx_item(year);`);
  for (const c of ['acodes TEXT', 'vendor TEXT', 'cval REAL', 'adv REAL', 'appr TEXT']) { try { db.exec(`ALTER TABLE cx_item ADD COLUMN ${c}`); } catch { } }
  db.exec(`CREATE TABLE IF NOT EXISTS cx_ver(id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, name TEXT, at TEXT, data TEXT)`);
  const getS = k => { try { return JSON.parse((get(`SELECT v FROM settings WHERE k=?`, k) || {}).v || 'null'); } catch { return null; } };
  const setS = (k, v) => run(`INSERT OR REPLACE INTO settings(k, v) VALUES(?, ?)`, k, JSON.stringify(v));
  const codesOf = r => { try { return (JSON.parse(r.acodes || '[]') || []).map(s).filter(Boolean); } catch { return []; } };
  const AS = `coalesce((SELECT value FROM field_adj fa WHERE fa.id=e.id AND fa.field='asset'), e.asset)`;
  // số thực hiện theo mã tài sản trong năm y (Source Amount): cap = Nợ 211/213 (từ TK ngoài 21x) – lên tài sản; cip = Nợ 241 (từ TK ngoài 241) – giá trị thực hiện / nghiệm thu khối lượng;
  // pay = Nợ 331 / Có 11x có ghi mã tài sản (nếu ERP có ghi)
  let _lb = null;
  function ledgerByAsset(y) { if (_lb && _lb.y === y && Date.now() - _lb.t < 5000) return _lb.m; const m = new Map();
    try { for (const x of all(`SELECT ${AS} k, substr(e.account_date,6,2) mo, CASE WHEN (e.acc_debit LIKE '211%' OR e.acc_debit LIKE '213%') AND NOT (e.acc_credit LIKE '211%' OR e.acc_credit LIKE '213%') THEN 'cap'
          WHEN e.acc_debit LIKE '241%' AND e.acc_credit NOT LIKE '241%' THEN 'cip' WHEN e.acc_debit LIKE '331%' AND e.acc_credit LIKE '11%' THEN 'pay' END kind, sum(e.amount) v, max(e.description) ds, max(e.acc_debit) acc, min(e.account_date) f
        FROM entries e WHERE e.account_date>=? AND e.account_date<=? AND ifnull(${AS},'')<>'' AND (e.acc_debit LIKE '211%' OR e.acc_debit LIKE '213%' OR e.acc_debit LIKE '241%' OR e.acc_debit LIKE '331%') GROUP BY 1,2,3`, y + '-01-01', y + '-12-31')) {
        if (!x.kind) continue; const g = m.get(x.k) || m.set(x.k, { code: x.k, cap: Z(), cip: Z(), pay: Z(), ds: '', acc: '', f: x.f }).get(x.k); g[x.kind][+x.mo - 1] += x.v; if (x.kind === 'cap' || !g.ds) { g.ds = x.ds || g.ds; if (x.kind === 'cap') g.acc = x.acc; } if (x.f < g.f) g.f = x.f; } } catch { }
    _lb = { y, t: Date.now(), m }; return m; }
  const matchCodes = (codes, M) => { const out = []; for (const c of codes) { const C = c.toUpperCase(); if (C.endsWith('*')) { const p = C.slice(0, -1); for (const [k, v] of M) if (String(k).toUpperCase().startsWith(p)) out.push(v); } else for (const [k, v] of M) if (String(k).toUpperCase() === C) out.push(v); } return [...new Set(out)]; };
  const LIMIT = () => +(getS('cx_limit') || 0);
  const years = () => all(`SELECT DISTINCT year y FROM cx_item ORDER BY year`).map(r => r.y);
  const raw = y => all(`SELECT * FROM cx_item WHERE year=? ORDER BY ifnull(sort, id), id`, +y);

  // cây + cộng dồn + cảnh báo; asOf (YYYY-MM) dùng so kế hoạch / thực hiện luỹ kế
  function list(o = {}) {
    const y = +o.year || new Date().getFullYear(), R = raw(y).map(r => ({ ...r, ...Object.fromEntries(ARR.map(k => [k, arr(r[k])])), ...Object.fromEntries(NUM.map(k => [k, n(r[k])])) }));
    const kids = new Map(); for (const r of R) { const p = r.parent || 0; (kids.get(p) || kids.set(p, []).get(p)).push(r); }
    const LB = ledgerByAsset(y);
    for (const r of R) { r.codes = codesOf(r); r.cip_a = Z(); r.linked = [];
      if (r.codes.length && !(kids.get(r.id) || []).length) { const H = matchCodes(r.codes, LB); r.linked = H.map(h => h.code);
        if (H.length) { r.ast_a = Z().map((_, i) => H.reduce((q, h) => q + h.cap[i], 0)); r.cip_a = Z().map((_, i) => H.reduce((q, h) => q + h.cip[i], 0));
          const pay = Z().map((_, i) => H.reduce((q, h) => q + h.pay[i], 0)); if (pay.some(v => v)) r.pay_a = pay; r.auto = true; } } }
    const cm = o.asOf && +o.asOf.slice(0, 4) === y ? +o.asOf.slice(5, 7) : o.asOf && +o.asOf.slice(0, 4) > y ? 12 : 0;
    const out = [];
    const roll = (r, lvl) => { const ch = kids.get(r.id) || []; r.lvl = lvl; r.kids = ch.length; out.push(r);
      for (const c of ch) roll(c, lvl + 1);
      if (ch.length) { for (const k of NUM) r[k] = ch.reduce((q, c) => q + c[k], 0); for (const k of ROLL) r[k] = Z().map((_, i) => ch.reduce((q, c) => q + c[k][i], 0)); r.linked = ch.flatMap(c => c.linked || []); }
      const T = k => r[k].reduce((q, v) => q + v, 0);
      r.bud = r.b0 + r.b1 + r.b2; r.procT = T('proc'); r.payT = T('pay'); r.astT = T('ast'); r.procA = T('proc_a'); r.payA = T('pay_a'); r.astA = T('ast_a'); r.cipA = T('cip_a');
      r.remain = r.bud - r.astT; r.remainA = r.bud - r.astA;
      const cum = (a, m) => a.slice(0, m).reduce((q, v) => q + v, 0); r.payPlanTo = cum(r.pay, cm); r.astPlanTo = cum(r.ast, cm); r.procPlanTo = cum(r.proc, cm); r.payActTo = cum(r.pay_a, cm); r.astActTo = cum(r.ast_a, cm); r.procActTo = cum(r.proc_a, cm);
      const W = [], tol = v => Math.max(1, Math.abs(v) * 0.001), first = a => a.findIndex(v => Math.abs(v) > 0.004);
      if (r.procT > r.bud + tol(r.bud)) W.push(['proc_over', 'Mua sắm vượt ngân sách', r.procT - r.bud]);
      if (r.payT > r.bud + tol(r.bud)) W.push(['pay_over', 'Thanh toán vượt ngân sách', r.payT - r.bud]);
      if (r.astT > r.bud + tol(r.bud)) W.push(['ast_over', 'Lên tài sản vượt ngân sách', r.astT - r.bud]);
      const fP = first(r.proc), fA = first(r.ast), fPay = first(r.pay);
      if (fA >= 0 && fP >= 0 && fA < fP) W.push(['ast_early', `Lên TS (T${fA + 1}) trước mua sắm (T${fP + 1})`]);
      if (fPay >= 0 && fP >= 0 && fPay < fP) W.push(['pay_early', `Thanh toán (T${fPay + 1}) trước mua sắm (T${fP + 1}) – tạm ứng?`]);
      if (r.bud > 0 && r.procT === 0 && r.payT === 0 && r.astT === 0) W.push(['noplan', 'Chưa có kế hoạch tháng']);
      const trk = r.procA + r.payA + r.astA > 0; // chỉ cảnh báo chậm khi hạng mục đã bắt đầu nhập số thực hiện
      if (cm && trk && r.payPlanTo > 0 && r.payActTo < r.payPlanTo * 0.9) W.push(['pay_late', 'Thanh toán chậm so kế hoạch', r.payPlanTo - r.payActTo]);
      if (cm && trk && r.astPlanTo > 0 && r.astActTo < r.astPlanTo * 0.9) W.push(['ast_late', 'Lên tài sản chậm so kế hoạch', r.astPlanTo - r.astActTo]);
      if (cm && trk && r.procPlanTo > 0 && r.procActTo < r.procPlanTo * 0.9) W.push(['proc_late', 'Mua sắm chậm so kế hoạch', r.procPlanTo - r.procActTo]);
      if (/hoàn thành|lên TS hết/i.test(r.status || '') && Math.abs(r.remain) > tol(r.bud)) W.push(['status', 'Trạng thái hoàn thành nhưng còn chưa lên TS', r.remain]);
      // gói thầu / HĐ nhà thầu: thanh toán (KH, TH) không vượt giá trị HĐ; tạm ứng chưa thu hồi khi đã lên TS hết
      if (r.cval > 0 && !r.kids) { if (r.payA > r.cval + tol(r.cval)) W.push(['cval_paya', 'Thanh toán thực hiện vượt giá trị HĐ', r.payA - r.cval]); else if (r.payT > r.cval + tol(r.cval)) W.push(['cval_pay', 'Kế hoạch thanh toán vượt giá trị HĐ', r.payT - r.cval]);
        if (r.cval > r.bud + tol(r.bud) && r.bud > 0) W.push(['cval_bud', 'Giá trị HĐ vượt ngân sách', r.cval - r.bud]); }
      if (r.adv > 0 && !r.kids && r.astA >= r.bud - tol(r.bud) && r.bud > 0) W.push(['adv', 'Đã lên TS hết nhưng còn tạm ứng ' + Math.round(r.adv).toLocaleString('en-US') + ' – kiểm tra thu hồi']);
      // phân cấp phê duyệt: giá trị gói (HĐ hoặc ngân sách) vượt hạn mức ủy quyền mà chưa ghi số / ngày QĐ phê duyệt
      const lim = +(o.limit ?? LIMIT()) || 0, val = r.cval || r.bud; if (lim > 0 && !r.kids && val > lim && !s(r.appr)) W.push(['appr', `Vượt hạn mức ủy quyền ${lim.toLocaleString('en-US')} – chưa có QĐ phê duyệt`, val - lim]);
      r.save = r.cval > 0 && r.bud > 0 ? r.bud - r.cval : 0;
      r.warn = W; r.autoStatus = Math.abs(r.remain) <= tol(r.bud) ? 'Đã lên TS hết' : r.remain > 0 ? 'Chuyển năm sau' : '';
      return r; };
    for (const r of kids.get(0) || []) roll(r, 0);
    // thứ tự hiển thị: theo nhóm normal → station → freq, giữ thứ tự cây trong nhóm
    const top = (kids.get(0) || []), byG = g => top.filter(r => (r.grp || 'normal') === g);
    const ordered = []; const walk = r => { ordered.push(r); for (const c of kids.get(r.id) || []) walk(c); };
    for (const g of Object.keys(GRP)) for (const r of byG(g)) walk(r);
    const sum = rows => { const t = { cipA: 0, cval: 0, adv: 0, save: 0, bud: 0, b0: 0, b1: 0, b2: 0, done: 0, procT: 0, payT: 0, astT: 0, procA: 0, payA: 0, astA: 0, remain: 0, payPlanTo: 0, payActTo: 0, astPlanTo: 0, astActTo: 0, procPlanTo: 0, procActTo: 0 };
      for (const k of ROLL) t[k] = Z(); for (const r of rows) { for (const k in t) if (!Array.isArray(t[k])) t[k] += r[k] || 0; for (const k of ROLL) (r[k] || Z()).forEach((v, i) => t[k][i] += v); } t.n = rows.length; return t; };
    const G = Object.fromEntries(Object.keys(GRP).map(g => [g, sum(byG(g))]));
    const tot = { all: sum(top), noFreq: sum(top.filter(r => (r.grp || 'normal') !== 'freq')), station: G.station, normal: G.normal, freq: G.freq };
    if (o.ver) { const V = verMap(o.ver); if (V) { const vr = r => { const ch = (kids.get(r.id) || []); if (!ch.length) return V.get(r.id) || { bud: 0, b1: 0, procT: 0, payT: 0, astT: 0, cval: 0 }; const a = ch.map(vr); return Object.fromEntries(['bud', 'b1', 'procT', 'payT', 'astT', 'cval'].map(k => [k, a.reduce((q, x) => q + x[k], 0)])); };
      for (const r of ordered) r.ver = vr(r); const vs = rows => Object.fromEntries(['bud', 'b1', 'procT', 'payT', 'astT'].map(k => [k, rows.reduce((q, r) => q + r.ver[k], 0)]));
      for (const g of Object.keys(GRP)) G[g].ver = vs(byG(g)); tot.all.ver = vs(top); tot.noFreq.ver = vs(top.filter(r => (r.grp || 'normal') !== 'freq')); } }
    return { year: y, cm, limit: LIMIT(), versions: versions(y), rows: ordered, groups: GRP, G, tot, statuses: STATUS, years: years(), ledger: ledger(y) };
  }
  // tham chiếu sổ cái: tăng TSCĐ theo tháng (Nợ 211/213 từ TK ngoài nhóm 21x) và số dư XDCB 241 cuối mỗi tháng
  function ledger(y) {
    try { const A = Z(), B = Z();
      for (const x of all(`SELECT substr(account_date,6,2) m, sum(amount) v FROM entries WHERE account_date>=? AND account_date<=? AND (acc_debit LIKE '211%' OR acc_debit LIKE '213%') AND NOT (acc_credit LIKE '211%' OR acc_credit LIKE '213%') GROUP BY m`, y + '-01-01', y + '-12-31')) A[+x.m - 1] = x.v;
      const o = get(`SELECT ifnull(sum(CASE WHEN acc_debit LIKE '241%' THEN amount ELSE 0 END),0)-ifnull(sum(CASE WHEN acc_credit LIKE '241%' THEN amount ELSE 0 END),0) v FROM entries WHERE account_date<?`, y + '-01-01').v;
      const mv = Z(); for (const x of all(`SELECT substr(account_date,6,2) m, sum(CASE WHEN acc_debit LIKE '241%' THEN amount ELSE 0 END)-sum(CASE WHEN acc_credit LIKE '241%' THEN amount ELSE 0 END) v FROM entries WHERE account_date>=? AND account_date<=? AND (acc_debit LIKE '241%' OR acc_credit LIKE '241%') GROUP BY m`, y + '-01-01', y + '-12-31')) mv[+x.m - 1] = x.v;
      let c = o; for (let i = 0; i < 12; i++) { c += mv[i]; B[i] = c; } return { fa: A, faT: A.reduce((q, v) => q + v, 0), cip: B, cip0: o }; } catch { return null; }
  }
  function save(r) {
    const v = { year: +r.year, parent: r.parent ? +r.parent : null, grp: GRP[r.grp] ? r.grp : grpOf(s(r.name)), stt: s(r.stt), name: s(r.name), dept: s(r.dept),
      ...Object.fromEntries(NUM.map(k => [k, n(r[k])])), ...Object.fromEntries(ARR.map(k => [k, JSON.stringify(arr(r[k]))])), atype: s(r.atype), acode: s(r.acode), acodes: JSON.stringify([].concat(r.acodes || []).map(s).filter(Boolean)), vendor: s(r.vendor), cval: n(r.cval), adv: n(r.adv), appr: s(r.appr), status: s(r.status), note: s(r.note), sort: r.sort != null ? +r.sort : null };
    if (v.parent) { const p = get(`SELECT * FROM cx_item WHERE id=?`, v.parent); if (p) { v.grp = p.grp;
      // hạng mục tổng lần đầu được chi tiết: chuyển số liệu đang có của nó sang chi tiết "(Chưa phân bổ chi tiết)" để không mất kế hoạch
      if (!r.id && !get(`SELECT 1 x FROM cx_item WHERE parent=?`, p.id) && (NUM.some(k => n(p[k])) || ARR.some(k => arr(p[k]).some(x => x)))) {
        run(`INSERT INTO cx_item(year, parent, grp, stt, name, dept, b0, b1, b2, done, proc, pay, ast, proc_a, pay_a, ast_a, atype, status, note, sort, upd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
          p.year, p.id, p.grp, '', '(Chưa phân bổ chi tiết)', p.dept, n(p.b0), n(p.b1), n(p.b2), n(p.done), p.proc, p.pay, p.ast, p.proc_a, p.pay_a, p.ast_a, p.atype, p.status, 'Phần còn lại của hạng mục tổng – giảm dần khi thêm chi tiết', 999999);
        run(`UPDATE cx_item SET ${NUM.map(k => k + '=0').join(', ')}, ${ARR.map(k => k + "='[]'").join(', ')} WHERE id=?`, p.id); } } } // số của hạng mục tổng đã chuyển xuống chi tiết
    const K = Object.keys(v);
    if (r.id) run(`UPDATE cx_item SET ${K.map(k => k + '=?').join(', ')}, upd=datetime('now','localtime') WHERE id=?`, ...K.map(k => v[k]), +r.id);
    else { run(`INSERT INTO cx_item(${K.join(', ')}, upd) VALUES(${K.map(() => '?').join(', ')}, datetime('now','localtime'))`, ...K.map(k => v[k])); r.id = get(`SELECT max(id) id FROM cx_item`).id; if (v.sort == null) run(`UPDATE cx_item SET sort=id*10 WHERE id=?`, r.id); }
    if (r.grp && !r.parent) run(`UPDATE cx_item SET grp=? WHERE id IN (WITH RECURSIVE t(id) AS (SELECT id FROM cx_item WHERE parent=? UNION ALL SELECT c.id FROM cx_item c JOIN t ON c.parent=t.id) SELECT id FROM t)`, v.grp, +r.id);
    return { id: r.id };
  }
  // sửa nhanh 1 ô: field số / text, hoặc ô tháng (k = 'pay', i = 0..11)
  function setCell(id, k, val, i) { const r = get(`SELECT * FROM cx_item WHERE id=?`, +id); if (!r) return false;
    if (ARR.includes(k)) { const a = arr(r[k]); a[+i] = n(val); run(`UPDATE cx_item SET ${k}=?, upd=datetime('now','localtime') WHERE id=?`, JSON.stringify(a), +id); }
    else if (NUM.includes(k)) run(`UPDATE cx_item SET ${k}=?, upd=datetime('now','localtime') WHERE id=?`, n(val), +id);
    else if (['cval', 'adv'].includes(k)) run(`UPDATE cx_item SET ${k}=?, upd=datetime('now','localtime') WHERE id=?`, n(val), +id);
    else if (['name', 'dept', 'stt', 'atype', 'acode', 'status', 'note', 'vendor', 'appr'].includes(k)) run(`UPDATE cx_item SET ${k}=?, upd=datetime('now','localtime') WHERE id=?`, s(val), +id);
    else if (k === 'grp' && GRP[val]) run(`UPDATE cx_item SET grp=? WHERE id=? OR id IN (WITH RECURSIVE t(id) AS (SELECT id FROM cx_item WHERE parent=? UNION ALL SELECT c.id FROM cx_item c JOIN t ON c.parent=t.id) SELECT id FROM t)`, val, +id, +id);
    return true; }
  function remove(id) { run(`DELETE FROM cx_item WHERE id IN (WITH RECURSIVE t(id) AS (SELECT ? UNION ALL SELECT c.id FROM cx_item c JOIN t ON c.parent=t.id) SELECT id FROM t)`, +id); return true; }
  // đổi thứ tự: dir = -1 lên / +1 xuống trong cùng cấp
  function move(id, dir) { const r = get(`SELECT * FROM cx_item WHERE id=?`, +id); if (!r) return false;
    const sib = all(`SELECT id, sort FROM cx_item WHERE year=? AND ifnull(parent,0)=? ORDER BY ifnull(sort,id), id`, r.year, r.parent || 0), i = sib.findIndex(x => x.id === r.id), j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= sib.length) return false; sib.forEach((x, k) => x.sort = (k + 1) * 10); [sib[i].sort, sib[j].sort] = [sib[j].sort, sib[i].sort]; for (const x of sib) run(`UPDATE cx_item SET sort=? WHERE id=?`, x.sort, x.id); return true; }
  // chuyển phần chưa lên tài sản sang năm sau (tạo hạng mục năm y+1, ngân sách năm KH = phần còn lại; giữ cây chi tiết)
  function rollForward(y) { const L = list({ year: y }), map = new Map(); let k = 0;
    for (const r of L.rows) { if (r.remain <= 0.5) continue; if (r.parent && !map.has(r.parent)) continue;
      const id = save({ year: +y + 1, parent: r.parent ? map.get(r.parent) : null, grp: r.grp, stt: r.stt, name: r.name, dept: r.dept, b0: 0, b1: r.kids ? 0 : r.remain, b2: 0, atype: r.atype, acode: r.acode, status: 'Chuyển năm sau', note: `Chuyển từ năm ${y}: còn chưa lên TS ${Math.round(r.remain).toLocaleString('en-US')}` }).id;
      map.set(r.id, id); k++; }
    return { n: k }; }
  // nhập mẫu Excel DAUTU: dòng tiêu đề có "Hạng mục"; D/E/F = ngân sách 3 năm; G tổng; H đã thực hiện; I–T mua sắm; V–AG thanh toán; AI–AT lên TS; AV loại TS; AX trạng thái; AY ghi chú.
  // Dòng "Tổng …" bỏ qua. mode: replace (xoá năm) | add.
  function importAoa(aoa, year, mode = 'replace') {
    const h = aoa.findIndex(r => r.some(c => /hạng mục/i.test(s(c)))); if (h < 0) throw new Error('Không thấy dòng tiêu đề "Hạng mục" trong file');
    const H = aoa[h].map(s), col = re => H.findIndex(c => re.test(c)), ci = { stt: col(/^stt$/i), name: col(/hạng mục/i), dept: col(/bộ phận/i), done: col(/đã thực hiện/i), atype: col(/mã tài sản|loại tài sản|thẻ/i), pct: col(/tiến độ/i), status: col(/trạng thái/i), note: col(/ghi chú|vướng/i) };
    const ycols = H.map((c, i) => [i, (c.match(/năm\s*(\d{4})/i) || [])[1]]).filter(x => x[1]).slice(0, 3);
    const yr = +year || (ycols[1] ? +ycols[1][1] : new Date().getFullYear()), bcol = k => (ycols.find(x => +x[1] === yr + k - 1) || [])[0];
    const mcols = re => H.map((c, i) => [i, c.match(re)]).filter(x => x[1]).map(x => x[0]).slice(0, 12);
    const PRC = mcols(/mua sắm\s*T\d+/i), PAY = mcols(/thanh toán\s*T\d+/i), AST = mcols(/lên TS\s*T\d+/i);
    if (mode === 'replace') run(`DELETE FROM cx_item WHERE year=?`, yr);
    let k = 0; db.exec('BEGIN');
    try { for (const r of aoa.slice(h + 1)) { const name = s(r[ci.name]), a0 = s(r[0]);
        if (!name && !a0) continue; if (/^tổng/i.test(a0) || /^tổng cộng/i.test(name)) continue; if (!name) continue;
        const v = (i) => i == null || i < 0 ? 0 : n(r[i]), ms = cols => Array.from({ length: 12 }, (_, i) => cols[i] != null ? n(r[cols[i]]) : 0);
        save({ year: yr, stt: a0, name, dept: s(r[ci.dept]), grp: grpOf(name), b0: v(bcol(0)), b1: v(bcol(1)), b2: v(bcol(2)), done: v(ci.done), proc: ms(PRC), pay: ms(PAY), ast: ms(AST), atype: ci.atype >= 0 ? s(r[ci.atype]) : '', status: ci.status >= 0 ? s(r[ci.status]) : '', note: ci.note >= 0 ? s(r[ci.note]) : '' }); k++; }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n: k, year: yr };
  }
  // xuất đúng bố cục mẫu (kèm chi tiết, dòng tổng theo nhóm)
  function exportAoa(y, o = {}) { const L = list({ year: y, asOf: o.asOf }), M = Array.from({ length: 12 }, (_, i) => i + 1);
    const head1 = ['THÔNG TIN CHUNG & NGÂN SÁCH', '', '', '', '', '', '', '', 'KẾ HOẠCH MUA SẮM (THÁNG 1 - 12)', ...Array(12).fill(''), 'KẾ HOẠCH THANH TOÁN / CASHFLOW (THÁNG 1 - 12)', ...Array(12).fill(''), 'KẾ HOẠCH LÊN TÀI SẢN / GHI NHẬN (THÁNG 1 - 12)', ...Array(12).fill(''), 'QUẢN LÝ TÀI SẢN & TIẾN ĐỘ', '', '', '', ''];
    const head = ['STT', 'Hạng mục / Gói thầu đầu tư', 'Bộ phận chủ trì', `Năm ${y - 1}`, `Năm ${y}`, `Năm ${y + 1}`, 'Tổng', 'Đã thực hiện (USD)', ...M.map(m => 'Mua sắm T' + m), 'Tổng', ...M.map(m => 'Thanh toán T' + m), 'Tổng', ...M.map(m => 'Lên TS T' + m), 'Tổng lên TS', 'Loại tài sản', 'Chưa lên TS', 'Trạng thái', 'Ghi chú / Vướng mắc', 'Nhóm', 'Cảnh báo'];
    const line = (r, lab) => [lab ? lab : (r.lvl ? '  '.repeat(r.lvl) + (r.stt || '-') : r.stt), lab ? '' : '  '.repeat(r.lvl) + r.name, lab ? '' : r.dept, r.b0, r.b1, r.b2, r.bud, r.done, ...r.proc, r.procT, ...r.pay, r.payT, ...r.ast, r.astT, lab ? '' : r.atype, r.remain, lab ? '' : (r.status || r.autoStatus), lab ? '' : r.note, lab ? '' : GRP[r.grp || 'normal'], lab ? '' : (r.warn || []).map(w => w[1]).join('; ')];
    const rows = [head1, head, ...L.rows.map(r => line(r)), [], line(L.tot.all, 'Tổng cộng đã bao gồm tần số'), line(L.tot.noFreq, 'Tổng cộng chưa bao gồm tần số'), line(L.tot.station, 'Tổng đầu tư tổng trạm'), line(L.tot.normal, 'Tổng đầu tư thông thường (không gồm tổng trạm, tần số)'), line(L.tot.freq, 'Tổng đầu tư tần số')];
    return rows; }
  // tài sản có phát sinh trong năm (lên TS / 241 / thanh toán) – đã gắn hạng mục nào, gợi ý hạng mục theo từ khoá diễn giải ↔ tên hạng mục, loại TS (211 hữu hình / 213 vô hình)
  function assets(o = {}) { const y = +o.year, LB = ledgerByAsset(y), R = raw(y), leaf = R.filter(r => !R.some(c => c.parent === r.id)), own = new Map();
    for (const r of leaf) for (const h of matchCodes(codesOf(r), LB)) own.set(h.code, r);
    const tok = t => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^(cho|cua|the|and|bts|vtl|nam|thang|tai|san|dau|tu|lap|dat|hop|dong)$/.test(w)));
    const IT = leaf.map(r => ({ r, t: tok(r.name + ' ' + r.note + ' ' + (r.atype || '')) }));
    return [...LB.values()].map(a => { const T = k => a[k].reduce((q, v) => q + v, 0), w = tok(a.code + ' ' + a.ds), vh = /^213/.test(a.acc);
      const sug = IT.map(x => { let k = 0; for (const t of w) if (x.t.has(t)) k++; if (x.r.atype && /vô hình/i.test(x.r.atype) === vh && a.acc) k += 0.5; return { id: x.r.id, name: x.r.name, k }; }).filter(x => x.k >= 1).sort((p, q) => q.k - p.k).slice(0, 5);
      const it = own.get(a.code); return { code: a.code, ds: a.ds, acc: a.acc, f: a.f, cap: T('cap'), cip: T('cip'), pay: T('pay'), item: it ? { id: it.id, name: it.name } : null, sug }; })
      .sort((p, q) => (p.item ? 1 : 0) - (q.item ? 1 : 0) || (q.cap + q.cip) - (p.cap + p.cip)); }
  function linkAsset(id, codes, unlink) { const r = get(`SELECT acodes FROM cx_item WHERE id=?`, +id); if (!r) return false; let C = codesOf(r);
    for (const c of [].concat(codes || []).map(s).filter(Boolean)) C = unlink ? C.filter(x => x !== c) : C.includes(c) ? C : [...C, c];
    run(`UPDATE cx_item SET acodes=? WHERE id=?`, JSON.stringify(C), +id); _lb = null; return true; }
  // ---- phiên bản kế hoạch (KH được duyệt, điều chỉnh lần 1…) ----
  function snapshot(y, name) { const d = raw(y).map(r => ({ id: r.id, parent: r.parent, name: r.name, ...Object.fromEntries(NUM.map(k => [k, n(r[k])])), ...Object.fromEntries(['proc', 'pay', 'ast'].map(k => [k, arr(r[k])])) }));
    run(`INSERT INTO cx_ver(year, name, at, data) VALUES(?,?,datetime('now','localtime'),?)`, +y, s(name) || 'Phiên bản', JSON.stringify(d)); return { n: d.length }; }
  const versions = y => all(`SELECT id, name, at FROM cx_ver WHERE year=? ORDER BY id`, +y);
  const delVersion = id => { run(`DELETE FROM cx_ver WHERE id=?`, +id); return true; };
  // số của phiên bản theo id hạng mục (cộng dồn cây theo cấu trúc hiện tại; hạng mục mới sau khi chốt = 0)
  function verMap(vid) { const v = get(`SELECT data FROM cx_ver WHERE id=?`, +vid); if (!v) return null; const m = new Map(); for (const r of JSON.parse(v.data)) { const T = k => r[k].reduce((q, x) => q + x, 0); m.set(r.id, { bud: r.b0 + r.b1 + r.b2, b1: r.b1, procT: T('proc'), payT: T('pay'), astT: T('ast'), cval: r.cval || 0 }); } return m; }
  // ---- XDCB 241 tồn đọng theo mã tài sản: số dư 241 > 0 đến ngày xem, phát sinh 241 cuối cùng cách ≥ N tháng ----
  function cipAging(o = {}) { const asOf = s(o.asOf) || new Date().toISOString().slice(0, 7), d1 = asOf.length === 7 ? asOf + '-31' : asOf, N = +o.months || 6;
    const lim = (() => { const [y, m] = d1.slice(0, 7).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 - N, 1)); return d.toISOString().slice(0, 10); })();
    let L = []; try { L = all(`SELECT ifnull(nullif(${AS},''),'(chưa gắn mã TS)') k, sum(CASE WHEN e.acc_debit LIKE '241%' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_credit LIKE '241%' THEN e.amount ELSE 0 END) b, min(e.account_date) f, max(e.account_date) t, max(e.description) ds, count(*) n
      FROM entries e WHERE e.account_date<=? AND (e.acc_debit LIKE '241%' OR e.acc_credit LIKE '241%') AND NOT (e.acc_debit LIKE '241%' AND e.acc_credit LIKE '241%') GROUP BY 1 HAVING b > 0.5 ORDER BY b DESC`, d1); } catch { }
    const R = raw(+d1.slice(0, 4)), own = new Map(); for (const r of R) for (const c of codesOf(r)) own.set(c.toUpperCase(), r);
    const ownOf = k => { const K = String(k).toUpperCase(); if (own.has(K)) return own.get(K); for (const [c, r] of own) if (c.endsWith('*') && K.startsWith(c.slice(0, -1))) return r; return null; };
    return L.map(x => { const it = ownOf(x.k), age = Math.round((Date.parse(d1) - Date.parse(x.t)) / 864e5 / 30.4); return { ...x, age, stale: x.t < lim, item: it ? { id: it.id, name: it.name } : null }; }); }
  // ---- chỉ số kiểm soát: giải ngân / KH, lên TS / KH, đầu tư / doanh thu thuần, tiết kiệm đấu thầu ----
  function kpis(o = {}) { const L = list(o), t = L.tot.all, cm = L.cm || 12, y = L.year;
    let rev = 0; const d0 = y + '-01-01', d1 = y + '-' + String(cm).padStart(2, '0') + '-31';
    try { rev = get(`SELECT ifnull(sum(CASE WHEN acc_credit LIKE '511%' AND acc_debit NOT LIKE '511%' THEN amount ELSE 0 END),0) - ifnull(sum(CASE WHEN acc_debit LIKE '511%' AND acc_credit NOT LIKE '911%' AND acc_credit NOT LIKE '511%' THEN amount ELSE 0 END),0) v FROM entries WHERE account_date>=? AND account_date<=? AND (acc_credit LIKE '511%' OR acc_debit LIKE '511%')`, d0, d1).v; } catch { }
    const inv = t.cipA || t.payActTo; // giá trị đầu tư thực hiện: theo Nợ 241 gắn mã TS, chưa gắn thì theo thanh toán thực hiện
    return { cm, rev, inv, invRev: rev ? inv / rev : null, disb: t.payPlanTo ? t.payActTo / t.payPlanTo : null, cap: t.astPlanTo ? t.astActTo / t.astPlanTo : null, capYear: t.astT ? t.astA / t.astT : null, save: t.save, saveRate: t.cval ? t.save / (t.cval + t.save) : null, kpiMax: +(getS('cx_kpi_inv') ?? 0.2) }; }
  // ---- báo cáo theo bộ phận chủ trì: hạng mục cảnh báo / chậm / vướng mắc ----
  function deptReport(o = {}) { const L = list(o), D = new Map();
    for (const r of L.rows) { if (r.kids) continue; const k = r.dept || '(chưa ghi bộ phận)'; const g = D.get(k) || D.set(k, { dept: k, items: [], bud: 0, payT: 0, payA: 0, astT: 0, astA: 0, warn: 0 }).get(k);
      g.items.push(r); g.bud += r.bud; g.payT += r.payPlanTo; g.payA += r.payActTo; g.astT += r.astPlanTo; g.astA += r.astActTo; if (r.warn.length) g.warn++; }
    return { year: L.year, cm: L.cm, depts: [...D.values()] }; }
  const setLimit = (v, kpi) => { setS('cx_limit', +v || 0); if (kpi != null) setS('cx_kpi_inv', +kpi || 0.2); return { limit: LIMIT(), kpi: +(getS('cx_kpi_inv') ?? 0.2) }; };
  const getLimit = () => ({ limit: LIMIT(), kpi: +(getS('cx_kpi_inv') ?? 0.2) });
  return { list, save, setCell, remove, move, rollForward, importAoa, exportAoa, years, assets, linkAsset, snapshot, versions, delVersion, verMap, cipAging, kpis, deptReport, setLimit, getLimit, GRP, STATUS };
}
module.exports = { make, grpOf };
