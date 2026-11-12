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
const NUM = ['b0', 'b1', 'b2', 'done'], ARR = ['proc', 'pay', 'ast', 'proc_a', 'pay_a', 'ast_a'];

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS cx_item(id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, parent INTEGER, grp TEXT, stt TEXT, name TEXT, dept TEXT,
    b0 REAL, b1 REAL, b2 REAL, done REAL, proc TEXT, pay TEXT, ast TEXT, proc_a TEXT, pay_a TEXT, ast_a TEXT, atype TEXT, acode TEXT, status TEXT, note TEXT, sort INTEGER, upd TEXT);
    CREATE INDEX IF NOT EXISTS ix_cx_year ON cx_item(year);`);
  const years = () => all(`SELECT DISTINCT year y FROM cx_item ORDER BY year`).map(r => r.y);
  const raw = y => all(`SELECT * FROM cx_item WHERE year=? ORDER BY ifnull(sort, id), id`, +y);

  // cây + cộng dồn + cảnh báo; asOf (YYYY-MM) dùng so kế hoạch / thực hiện luỹ kế
  function list(o = {}) {
    const y = +o.year || new Date().getFullYear(), R = raw(y).map(r => ({ ...r, ...Object.fromEntries(ARR.map(k => [k, arr(r[k])])), ...Object.fromEntries(NUM.map(k => [k, n(r[k])])) }));
    const kids = new Map(); for (const r of R) { const p = r.parent || 0; (kids.get(p) || kids.set(p, []).get(p)).push(r); }
    const cm = o.asOf && +o.asOf.slice(0, 4) === y ? +o.asOf.slice(5, 7) : o.asOf && +o.asOf.slice(0, 4) > y ? 12 : 0;
    const out = [];
    const roll = (r, lvl) => { const ch = kids.get(r.id) || []; r.lvl = lvl; r.kids = ch.length; out.push(r);
      for (const c of ch) roll(c, lvl + 1);
      if (ch.length) { for (const k of NUM) r[k] = ch.reduce((q, c) => q + c[k], 0); for (const k of ARR) r[k] = Z().map((_, i) => ch.reduce((q, c) => q + c[k][i], 0)); }
      const T = k => r[k].reduce((q, v) => q + v, 0);
      r.bud = r.b0 + r.b1 + r.b2; r.procT = T('proc'); r.payT = T('pay'); r.astT = T('ast'); r.procA = T('proc_a'); r.payA = T('pay_a'); r.astA = T('ast_a');
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
      r.warn = W; r.autoStatus = Math.abs(r.remain) <= tol(r.bud) ? 'Đã lên TS hết' : r.remain > 0 ? 'Chuyển năm sau' : '';
      return r; };
    for (const r of kids.get(0) || []) roll(r, 0);
    // thứ tự hiển thị: theo nhóm normal → station → freq, giữ thứ tự cây trong nhóm
    const top = (kids.get(0) || []), byG = g => top.filter(r => (r.grp || 'normal') === g);
    const ordered = []; const walk = r => { ordered.push(r); for (const c of kids.get(r.id) || []) walk(c); };
    for (const g of Object.keys(GRP)) for (const r of byG(g)) walk(r);
    const sum = rows => { const t = { bud: 0, b0: 0, b1: 0, b2: 0, done: 0, procT: 0, payT: 0, astT: 0, procA: 0, payA: 0, astA: 0, remain: 0, payPlanTo: 0, payActTo: 0, astPlanTo: 0, astActTo: 0, procPlanTo: 0, procActTo: 0 };
      for (const k of ARR) t[k] = Z(); for (const r of rows) { for (const k in t) if (!Array.isArray(t[k])) t[k] += r[k] || 0; for (const k of ARR) r[k].forEach((v, i) => t[k][i] += v); } t.n = rows.length; return t; };
    const G = Object.fromEntries(Object.keys(GRP).map(g => [g, sum(byG(g))]));
    const tot = { all: sum(top), noFreq: sum(top.filter(r => (r.grp || 'normal') !== 'freq')), station: G.station, normal: G.normal, freq: G.freq };
    return { year: y, cm, rows: ordered, groups: GRP, G, tot, statuses: STATUS, years: years(), ledger: ledger(y) };
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
      ...Object.fromEntries(NUM.map(k => [k, n(r[k])])), ...Object.fromEntries(ARR.map(k => [k, JSON.stringify(arr(r[k]))])), atype: s(r.atype), acode: s(r.acode), status: s(r.status), note: s(r.note), sort: r.sort != null ? +r.sort : null };
    if (v.parent) { const p = get(`SELECT * FROM cx_item WHERE id=?`, v.parent); if (p) { v.grp = p.grp;
      // hạng mục tổng lần đầu được chi tiết: chuyển số liệu đang có của nó sang chi tiết "(Chưa phân bổ chi tiết)" để không mất kế hoạch
      if (!r.id && !get(`SELECT 1 x FROM cx_item WHERE parent=?`, p.id) && (NUM.some(k => n(p[k])) || ARR.some(k => arr(p[k]).some(x => x)))) {
        run(`INSERT INTO cx_item(year, parent, grp, stt, name, dept, b0, b1, b2, done, proc, pay, ast, proc_a, pay_a, ast_a, atype, status, note, sort, upd) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
          p.year, p.id, p.grp, '', '(Chưa phân bổ chi tiết)', p.dept, n(p.b0), n(p.b1), n(p.b2), n(p.done), p.proc, p.pay, p.ast, p.proc_a, p.pay_a, p.ast_a, p.atype, p.status, 'Phần còn lại của hạng mục tổng – giảm dần khi thêm chi tiết', 999999); } } }
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
    else if (['name', 'dept', 'stt', 'atype', 'acode', 'status', 'note'].includes(k)) run(`UPDATE cx_item SET ${k}=?, upd=datetime('now','localtime') WHERE id=?`, s(val), +id);
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
  return { list, save, setCell, remove, move, rollForward, importAoa, exportAoa, years, GRP, STATUS };
}
module.exports = { make, grpOf };
