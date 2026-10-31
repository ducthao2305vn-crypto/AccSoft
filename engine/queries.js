'use strict';
// Truy vấn đọc cho giao diện – mọi phép tổng hợp chạy bằng SQL, giao diện chỉ nhận kết quả đã gọn
const { COLS, rowFromDb } = require('./db');
const { meta, ST, RULES_VERSION, GROUP } = require('./rules');
const RULES_OF = g => Object.keys(GROUP).filter(k => GROUP[k] === g).map(k => `'${k}'`).join(',');

const INC = `e.ym IN (SELECT ym FROM months WHERE included=1)`;
const STATUS = `coalesce(nullif(rv.status,''),'open')`;
const SEVN = `CASE er.sev WHEN 'H' THEN 0 WHEN 'M' THEN 1 ELSE 2 END`;
const like = (col, pres) => '(' + pres.map(p => `${col} LIKE '${p}%'`).join(' OR ') + ')';

function make(db) {
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const get = (sql, ...a) => db.prepare(sql).get(...a);

  /* ---------- Kỳ rà soát lỗi: chỉ phân tích lỗi trong khoảng tháng này; dữ liệu ngoài kỳ vẫn dùng cho phân tích ---------- */
  const okYm = v => (/^\d{4}-\d{2}$/.test(v || '') ? v : '');
  function reviewPeriod() { return { from: okYm(getSetting('review_from')), to: okYm(getSetting('review_to')) }; }
  function setReviewPeriod(from, to) { setSetting('review_from', okYm(from)); setSetting('review_to', okYm(to)); return reviewPeriod(); }
  function RV() { const { from, to } = reviewPeriod(); return (from ? ` AND e.ym>='${from}'` : '') + (to ? ` AND e.ym<='${to}'` : ''); }

  /* ---------- Lỗi nhập liệu ---------- */
  function where(f = {}) {
    const w = [INC + RV()], a = [];
    if (f.rule) { w.push('er.rule=?'); a.push(f.rule); }
    if (f.group === 'staff' || f.group === 'audit') w.push(`er.rule IN (${RULES_OF(f.group)})`);
    if (f.sev) { w.push('er.sev=?'); a.push(f.sev); }
    if (f.minSev) w.push({ H: `er.sev='H'`, M: `er.sev IN ('H','M')`, L: '1' }[f.minSev] || '1');
    if (f.user) { w.push('e.created_by=?'); a.push(f.user); }
    if (f.month) { w.push('e.ym=?'); a.push(f.month); }
    if (f.dept) { w.push('e.department=?'); a.push(f.dept); }
    if (f.acc) { w.push('(e.acc_debit LIKE ? OR e.acc_credit LIKE ?)'); a.push(f.acc + '%', f.acc + '%'); }
    if (f.min != null && f.min !== '') { w.push('abs(e.amount)>=?'); a.push(+f.min); }
    if (f.max != null && f.max !== '') { w.push('abs(e.amount)<=?'); a.push(+f.max); }
    if (f.status) { w.push(`${STATUS}=?`); a.push(f.status); }
    if (f.statusIn) { w.push(`${STATUS} IN (${f.statusIn.map(() => '?').join(',')})`); a.push(...f.statusIn); }
    if (f.text) {
      w.push(`(e.document_no LIKE ? OR e.description LIKE ? OR e.partner_debit LIKE ? OR e.partner_credit LIKE ? OR er.msg LIKE ? OR rv.note LIKE ?)`);
      a.push(...Array(6).fill('%' + f.text + '%'));
    }
    return { sql: 'WHERE ' + w.join(' AND '), args: a };
  }
  const FROM = `FROM errors er JOIN entries e ON e.id=er.entry_id LEFT JOIN reviews rv ON rv.err_key=er.err_key`;
  const ERR_COLS = `er.id eid, er.rule k, er.sev, er.msg, er.err_key key, e.id rid, e.account_date date, e.document_no doc, e.line_no line,
    e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount amt, e.description "desc",
    e.created_by user, e.department dept, e.ym, ${STATUS} status, rv.note, rv.updated_at at`;
  const SORTS = { sev: SEVN, date: 'e.account_date', amt: 'abs(e.amount)', doc: 'e.document_no', rule: 'er.rule', user: 'e.created_by', st: STATUS };

  function errors(f = {}, sort = { k: 'sev', d: 1 }, offset = 0, limit = 200) {
    const { sql, args } = where(f);
    const total = get(`SELECT count(*) n ${FROM} ${sql}`, ...args).n;
    const ord = `${SORTS[sort.k] || SEVN} ${sort.d < 0 ? 'DESC' : 'ASC'}, ${SEVN}, er.id`;
    const rows = all(`SELECT ${ERR_COLS} ${FROM} ${sql} ORDER BY ${ord} LIMIT ? OFFSET ?`, ...args, limit, offset);
    return { total, rows };
  }
  function errorGroups(f = {}, offset = 0, limit = 200) {
    const { sql, args } = where(f);
    const total = get(`SELECT count(DISTINCT e.document_no) n ${FROM} ${sql}`, ...args).n;
    const rows = all(`SELECT e.document_no doc, min(e.account_date) date, count(*) n, sum(er.sev='H') high,
        sum(${STATUS} IN ('open','doing')) open, group_concat(DISTINCT er.rule) rules, min(e.created_by) user, min(er.id) eid
      ${FROM} ${sql} GROUP BY e.document_no ORDER BY high DESC, n DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
    return { total, rows };
  }
  function errorFacets() {
    const base = `${FROM} WHERE ${INC}${RV()}`;
    const sc = Object.fromEntries(Object.keys(ST).map(k => [k, 0]));
    for (const r of all(`SELECT ${STATUS} s, count(*) n ${base} GROUP BY s`)) sc[r.s] = r.n;
    const P = reviewPeriod();
    const gone = all(`SELECT rv.err_key key, rv.rule, rv.document_no doc, rv.status, rv.note, rv.updated_at at, rv.snapshot FROM reviews rv
      WHERE NOT EXISTS (SELECT 1 FROM errors x WHERE x.err_key=rv.err_key)`).filter(r => {
      try { const m = JSON.parse(r.snapshot).m; return (!P.from || m >= P.from) && (!P.to || m <= P.to) && get('SELECT included FROM months WHERE ym=?', m)?.included === 1; } catch (e) { return false; }
    });
    return {
      status: sc, gone,
      rules: all(`SELECT er.rule k, count(*) n ${base} GROUP BY er.rule ORDER BY n DESC`),
      users: all(`SELECT DISTINCT e.created_by u ${base} ORDER BY 1`).map(r => r.u),
      months: all(`SELECT DISTINCT e.ym m ${base} ORDER BY 1`).map(r => r.m),
      depts: all(`SELECT DISTINCT e.department d ${base} AND e.department IS NOT NULL ORDER BY 1`).map(r => r.d),
    };
  }
  function errorDetail(eid) {
    const e = get(`SELECT ${ERR_COLS} ${FROM} WHERE er.id=?`, eid);
    if (!e) return null;
    const full = get(`SELECT ${COLS.map(c => c[1] + ' AS "' + c[0] + '"').join(',')}, i.file_name file FROM entries e JOIN imports i ON i.id=e.import_id WHERE e.id=?`, e.rid);
    const rowErrs = all(`SELECT er.id eid, er.rule k, er.sev, er.msg, er.err_key key, ${STATUS} status FROM errors er LEFT JOIN reviews rv ON rv.err_key=er.err_key WHERE er.entry_id=?`, e.rid);
    const lines = all(`SELECT e.id rid, e.line_no line, e.account_date date, e.acc_debit_name drName, e.acc_credit_name crName, e.amount amt,
        e.partner_debit bp, e.partner_credit bpCr, e.description "desc", e.type_of_cost tcost,
        (SELECT json_group_array(json_object('k',x.rule,'sev',x.sev,'msg',x.msg,'key',x.err_key)) FROM errors x WHERE x.entry_id=e.id) errs
      FROM entries e WHERE e.document_no IS ? ORDER BY e.line_no LIMIT 2000`, e.doc).map(l => ({ ...l, errs: JSON.parse(l.errs) }));
    return { e, full, rowErrs, lines };
  }
  function reviewTargets(f) { // khoá lỗi cho thao tác hàng loạt
    const { sql, args } = where(f);
    return all(`SELECT er.err_key key, er.rule k, e.document_no doc, e.ym m, e.amount amt, substr(e.description,1,200) d, rv.note ${FROM} ${sql}`, ...args);
  }
  function setReviews(list) {
    const del = db.prepare('DELETE FROM reviews WHERE err_key=?');
    const up = db.prepare(`INSERT INTO reviews(err_key,rule,document_no,status,note,snapshot,updated_at) VALUES(?,?,?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(err_key) DO UPDATE SET status=excluded.status,note=excluded.note,snapshot=excluded.snapshot,updated_at=excluded.updated_at`);
    db.exec('BEGIN');
    for (const r of list) { if (!r.status && !r.note) del.run(r.key); else up.run(r.key, r.rule, r.doc, r.status || '', r.note || '', r.snapshot || ''); }
    db.exec('COMMIT');
    return list.length;
  }
  function setStatusWhere(f, status) {
    const t = reviewTargets(f);
    setReviews(t.map(x => ({ key: x.key, rule: x.k, doc: x.doc, status, note: x.note || '', snapshot: JSON.stringify({ m: x.m, amt: x.amt, desc: x.d }) })));
    return t.length;
  }
  function setStatusDoc(doc, status, note) {
    const t = all(`SELECT er.err_key key, er.rule k, e.document_no doc, e.ym m, e.amount amt, substr(e.description,1,200) d FROM errors er JOIN entries e ON e.id=er.entry_id WHERE e.document_no IS ?`, doc);
    return setReviews(t.map(x => ({ key: x.key, rule: x.k, doc: x.doc, status, note, snapshot: JSON.stringify({ m: x.m, amt: x.amt, desc: x.d }) })));
  }

  /* ---------- Tổng quan ---------- */
  function overview() {
    const b = get(`SELECT count(*) rows, count(DISTINCT document_no) docs, min(account_date) dmin, max(account_date) dmax FROM entries e WHERE ${INC}`);
    const er = get(`SELECT count(DISTINCT er.entry_id) rows, sum(er.sev='H') high, count(*) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC}${RV()}`);
    const rvRows = get(`SELECT count(*) n FROM entries e WHERE ${INC}${RV()}`).n;
    const byRule = all(`SELECT er.rule k, er.sev, count(*) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC}${RV()} GROUP BY er.rule ORDER BY n DESC`);
    const tot = all(`SELECT created_by u, count(*) n FROM entries e WHERE ${INC}${RV()} GROUP BY u`);
    const bad = Object.fromEntries(all(`SELECT e.created_by u, count(DISTINCT er.entry_id) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC}${RV()} AND er.sev IN ('H','M') GROUP BY u`).map(r => [r.u, r.n]));
    const byUser = tot.map(r => ({ u: r.u, total: r.n, bad: bad[r.u] || 0 })).sort((a, c) => c.bad - a.bad).slice(0, 12);
    const P = pl(), last = P.years.at(-1) || {};
    const trend = P.months.slice(-12);
    return { ...b, review: reviewPeriod(), rvRows, errRows: er.rows || 0, errs: er.n || 0, high: er.high || 0, byRule, byUser, net: last.net || 0, pat: last.pat || 0, year: last.k, trend };
  }

  /* ---------- Kết quả kinh doanh ---------- */
  const PLG = [['rev', ['511', '512'], -1], ['ded', ['521'], 1], ['cogs', ['621', '622', '623', '627', '632'], 1], ['finInc', ['515'], -1], ['finExp', ['635'], 1],
    ['sell', ['641'], 1], ['admin', ['642'], 1], ['othInc', ['711'], -1], ['othExp', ['811'], 1], ['tax', ['821'], 1]];
  // Khoảng tháng [from, to] (YYYY-MM); trống = không giới hạn
  const RNG = (from, to) => (okYm(from) ? ` AND e.ym>='${okYm(from)}'` : '') + (okYm(to) ? ` AND e.ym<='${okYm(to)}'` : '');
  function plBy(keyExpr, from, to) {
    const cols = PLG.map(([k, pres, sign]) =>
      `${sign} * (sum(CASE WHEN ${like('e.acc_debit', pres)} THEN e.amount ELSE 0 END) - sum(CASE WHEN ${like('e.acc_credit', pres)} THEN e.amount ELSE 0 END)) AS ${k}`).join(',');
    return all(`SELECT ${keyExpr} k, ${cols} FROM entries e WHERE ${INC}${RNG(from, to)} AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%' GROUP BY k ORDER BY k`).map(r => {
      const net = r.rev - r.ded, gp = net - r.cogs, op = gp + r.finInc - r.finExp - r.sell - r.admin, other = r.othInc - r.othExp, pbt = op + other;
      return { ...r, net, gp, op, other, pbt, pat: pbt - r.tax };
    });
  }
  function pl() { return { years: plBy('substr(e.ym,1,4)'), months: plBy('e.ym') }; }
  // Kết quả kinh doanh của một khoảng tháng (một con số cho mỗi chỉ tiêu)
  function plRange(from, to) {
    const r = plBy(`'x'`, from, to)[0];
    return r || { rev: 0, ded: 0, cogs: 0, finInc: 0, finExp: 0, sell: 0, admin: 0, othInc: 0, othExp: 0, tax: 0, net: 0, gp: 0, op: 0, other: 0, pbt: 0, pat: 0 };
  }
  const plTrend = (from, to, gran = 'm') => plBy(PERIOD[gran] || PERIOD.m, from, to);

  /* ---------- Chi phí ---------- */
  function cost() {
    const EXPD = `(substr(e.acc_debit,1,1) IN ('6','8') AND e.acc_debit NOT LIKE '911%')`, EXPC = `(substr(e.acc_credit,1,1) IN ('6','8') AND e.acc_credit NOT LIKE '911%')`;
    const V = `sum(CASE WHEN ${EXPD} THEN e.amount ELSE 0 END) - sum(CASE WHEN ${EXPC} THEN e.amount ELSE 0 END)`;
    const W = `WHERE ${INC} AND (${EXPD} OR ${EXPC}) AND e.acc_credit NOT LIKE '911%'`;
    return {
      byType: all(`SELECT coalesce(e.type_of_cost,'(chưa phân loại)') t, substr(e.ym,1,4) y, ${V} v FROM entries e ${W} GROUP BY t, y`),
      byDept: all(`SELECT coalesce(e.department,'(trống)') d, ${V} v FROM entries e ${W} GROUP BY d ORDER BY v DESC LIMIT 12`),
    };
  }

  /* ---------- Phân tích doanh thu – chi phí theo tài khoản / khoản mục ---------- */
  const ACC1 = { '511': 'Doanh thu bán hàng & CCDV', '512': 'Doanh thu nội bộ', '515': 'Doanh thu hoạt động tài chính', '711': 'Thu nhập khác',
    '621': 'Chi phí NVL trực tiếp', '622': 'Chi phí nhân công trực tiếp', '623': 'Chi phí sử dụng máy', '627': 'Chi phí sản xuất chung', '632': 'Giá vốn hàng bán',
    '635': 'Chi phí tài chính', '641': 'Chi phí bán hàng', '642': 'Chi phí quản lý doanh nghiệp', '811': 'Chi phí khác', '821': 'Chi phí thuế TNDN' };
  const PERIOD = { m: 'e.ym', q: `substr(e.ym,1,4)||'-Q'||((cast(substr(e.ym,6,2) AS INTEGER)+2)/3)`, y: 'substr(e.ym,1,4)' };
  function sides(kind) {
    const exp = s => `(substr(e.acc_${s},1,1) IN ('6','8') AND e.acc_${s} NOT LIKE '911%')`;
    const rev = s => `(e.acc_${s} LIKE '511%' OR e.acc_${s} LIKE '512%' OR e.acc_${s} LIKE '515%' OR e.acc_${s} LIKE '711%')`;
    const no911 = `e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%'`;
    // [phía TK, điều kiện, dấu]: chi phí = Nợ − Có; doanh thu = Có − Nợ
    return kind === 'rev' ? [['credit', `${rev('credit')} AND ${no911}`, 1], ['debit', `${rev('debit')} AND ${no911}`, -1]]
      : [['debit', `${exp('debit')} AND ${no911}`, 1], ['credit', `${exp('credit')} AND ${no911}`, -1]];
  }
  function groupExpr(kind, by, side) {
    if (by === 'acc1') return `substr(e.acc_${side},1,3)`;
    if (by === 'acc') return `coalesce(e.acc_${side}_name, e.acc_${side})`;
    if (by === 'dept') return `coalesce(e.department,'(trống)')`;
    return kind === 'rev' ? `coalesce(e.type_of_revenue,'(chưa phân loại)')` : `coalesce(e.type_of_cost,'(chưa phân loại)')`;
  }
  function analysis(kind = 'exp', by = 'acc1', period = 'm', from = '', to = '') {
    const P = PERIOD[period] || PERIOD.m;
    const parts = sides(kind).map(([side, cond, sign]) => `SELECT ${groupExpr(kind, by, side)} g, ${P} p, e.amount*${sign} v FROM entries e WHERE ${INC}${RNG(from, to)} AND ${cond}`);
    const rows = all(`SELECT g, p, sum(v) v, count(*) n FROM (${parts.join(' UNION ALL ')}) GROUP BY g, p`);
    return { rows: rows.map(r => ({ ...r, name: by === 'acc1' ? (ACC1[r.g] || '') : '' })), periods: [...new Set(rows.map(r => r.p))].sort() };
  }
  // Tổng theo nhóm trong một khoảng tháng
  function analysisRange(kind = 'exp', by = 'acc1', from = '', to = '') {
    const parts = sides(kind).map(([side, cond, sign]) => `SELECT ${groupExpr(kind, by, side)} g, e.amount*${sign} v FROM entries e WHERE ${INC}${RNG(from, to)} AND ${cond}`);
    return all(`SELECT g, sum(v) v, count(*) n FROM (${parts.join(' UNION ALL ')}) GROUP BY g`).map(r => ({ ...r, name: by === 'acc1' ? (ACC1[r.g] || '') : '' }));
  }
  function analysisDrill(kind, by, g, from = '', to = '', limit = 500) {
    const parts = sides(kind).map(([side, cond, sign]) => `SELECT e.id rid, e.document_no doc, e.account_date date, e.acc_debit_name drName, e.acc_credit_name crName,
        e.amount*${sign} amt, e.description "desc", e.created_by user, e.type_of_cost tcost, e.type_of_revenue trev, e.department dept, e.partner_debit bp, e.partner_credit bpCr,
        (SELECT min(er.id) FROM errors er WHERE er.entry_id=e.id) eid
      FROM entries e WHERE ${INC}${RNG(from, to)} AND ${cond} AND ${groupExpr(kind, by, side)}=?`);
    const args = [g, g];
    const sql = parts.join(' UNION ALL ');
    const tot = get(`SELECT count(*) n, sum(amt) v FROM (${sql})`, ...args);
    return { total: tot.n, sum: tot.v, rows: all(`SELECT * FROM (${sql}) ORDER BY abs(amt) DESC LIMIT ?`, ...args, limit) };
  }

  /* ---------- Công nợ – tuổi nợ (FIFO) ---------- */
  // Tài khoản công nợ: [mã cấp 1, tên, nhóm, chiều số dư tự nhiên (1 = dư Nợ, -1 = dư Có)]
  const AG_ACC = [
    ['131', 'Phải thu khách hàng', 'thu', 1], ['136', 'Phải thu nội bộ', 'thu', 1], ['1388', 'Phải thu khác', 'thu', 1], ['141', 'Tạm ứng', 'thu', 1],
    ['331', 'Phải trả người bán', 'tra', -1], ['336', 'Phải trả nội bộ', 'tra', -1], ['334', 'Phải trả người lao động', 'tra', -1], ['3388', 'Phải trả, phải nộp khác', 'tra', -1]];
  const NO_BP = '(không có đối tượng)';
  // Đối tượng gắn theo phía hạch toán: TK bên Nợ ↔ Đối tượng Nợ (Business Partner), TK bên Có ↔ Đối tượng Có (Bpartner credit)
  // dim: 'bp' = theo đối tượng; 'contract' = đối tượng × hợp đồng; 'adv' = đối tượng × đề nghị tạm ứng (Advance Request)
  function aging(asOf, term = 30, level = 'l1', dim = 'bp') {
    const asD = new Date(asOf), map = new Map();
    const pres = AG_ACC.map(a => a[0]);
    const rows = all(`SELECT e.account_date date, e.due_date due, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName,
        e.amount amt, e.partner_debit bp, e.partner_credit bpCr, e.contract, e.advance_request adv FROM entries e
      WHERE ${INC} AND e.account_date<=? AND (${like('e.acc_debit', pres)} OR ${like('e.acc_credit', pres)})`, asOf);
    for (const r of rows) {
      for (const side of ['dr', 'cr']) {
        const accCode = String(r[side] || '');
        const def = AG_ACC.find(a => accCode.startsWith(a[0]));
        if (!def) continue;
        const [pre, name, grp, nat] = def;
        const bp = (side === 'dr' ? r.bp : r.bpCr) || NO_BP;
        const acc = level === 'detail' ? accCode : pre;
        const accName = level === 'detail' ? (String(side === 'dr' ? r.drName : r.crName).split('_').slice(1).join('_') || name) : name;
        const ref = dim === 'contract' ? (r.contract || '(không có hợp đồng)') : dim === 'adv' ? (r.adv || '(không có đề nghị tạm ứng)') : '';
        const key = acc + '|' + bp + '|' + ref; let o = map.get(key);
        if (!o) map.set(key, o = { acc, accName, parent: pre, grp, bp, ref, bal: 0, dr: 0, cr: 0, inc: [], first: r.date, last: r.date });
        if (r.date < o.first) o.first = r.date; if (r.date > o.last) o.last = r.date;
        if (side === 'dr') o.dr += r.amt; else o.cr += r.amt;
        const v = (side === 'dr' ? 1 : -1) * nat * r.amt; o.bal += v;
        if (v > 0) { const d = r.due ? new Date(r.due) : new Date(new Date(r.date).getTime() + term * 864e5); o.inc.push({ d, v }); }
      }
    }
    const bucket = d => d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : d <= 180 ? 4 : d <= 365 ? 5 : 6;
    const out = [];
    for (const o of map.values()) {
      if (Math.abs(o.bal) <= 0.005) continue;
      const b = Array(7).fill(0); let rem = o.bal, maxAge = 0;
      if (rem > 0) {
        o.inc.sort((x, y) => y.d - x.d);
        for (const it of o.inc) { if (rem <= 0) break; const take = Math.min(rem, it.v); rem -= take; const age = Math.floor((asD - it.d) / 864e5); b[bucket(age)] += take; maxAge = Math.max(maxAge, age); }
        if (rem > 0) b[6] += rem;
      }
      const { inc, ...rest } = o; void inc;
      out.push({ ...rest, b, maxAge });
    }
    return { accounts: AG_ACC.map(a => ({ k: a[0], n: a[1], grp: a[2] })), items: out };
  }

  /* ---------- Tuổi hàng tồn kho (FIFO theo ngày nhập) ---------- */
  const INV_ACC = [['151', 'Hàng mua đang đi đường'], ['152', 'Nguyên liệu, vật liệu'], ['153', 'Công cụ, dụng cụ'], ['155', 'Thành phẩm'],
    ['156', 'Hàng hoá'], ['157', 'Hàng gửi đi bán'], ['158', 'Hàng hoá kho bảo thuế']];
  // Đối tượng theo phía hạch toán: dòng ghi Nợ TK kho lấy thông tin phía Nợ, dòng ghi Có lấy thông tin phía Có
  const INV_OBJ = {
    product: () => '',
    loc: side => side === 'dr' ? 'loc' : 'locCr',
    bp: side => side === 'dr' ? 'bp' : 'bpCr',
    product_loc: side => side === 'dr' ? 'loc' : 'locCr',
  };
  function inventory(asOf, by = 'product', level = 'l1') {
    const asD = new Date(asOf), map = new Map(), pres = INV_ACC.map(a => a[0]);
    const rows = all(`SELECT e.account_date date, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount amt, e.quantity qty,
        e.product, e.uom, e.locator loc, e.locator_credit locCr, e.partner_debit bp, e.partner_credit bpCr
      FROM entries e WHERE ${INC} AND e.account_date<=? AND (${like('e.acc_debit', pres)} OR ${like('e.acc_credit', pres)}) ORDER BY e.account_date`, asOf);
    const NONE = { product: '(không có mã hàng)', loc: '(không có kho)', bp: '(không có đối tượng)' };
    for (const r of rows) {
      for (const side of ['dr', 'cr']) {
        const code = String(r[side] || ''), def = INV_ACC.find(a => code.startsWith(a[0]));
        if (!def) continue;
        // Bút toán chuyển nội bộ cùng TK kho (Nợ 152 / Có 152) vẫn tính hai phía: tăng ở đối tượng Nợ, giảm ở đối tượng Có
        const acc = level === 'detail' ? code : def[0];
        const accName = level === 'detail' ? (String(side === 'dr' ? r.drName : r.crName).split('_').slice(1).join('_') || def[1]) : def[1];
        let obj;
        if (by === 'product') obj = r.product || NONE.product;
        else if (by === 'product_loc') obj = (r.product || NONE.product) + ' @ ' + (r[INV_OBJ.loc(side)] || NONE.loc);
        else obj = r[INV_OBJ[by](side)] || NONE[by];
        const key = acc + '|' + obj; let o = map.get(key);
        if (!o) map.set(key, o = { acc, accName, obj, uom: r.uom || '', valIn: 0, valOut: 0, qtyIn: 0, qtyOut: 0, lastIn: null, lastOut: null, inc: [] });
        const q = Math.abs(r.qty || 0);
        if (side === 'dr') { o.valIn += r.amt; o.qtyIn += q; o.lastIn = r.date; if (r.amt > 0) o.inc.push({ d: new Date(r.date), v: r.amt }); }
        else { o.valOut += r.amt; o.qtyOut += q; o.lastOut = r.date; }
      }
    }
    // 0–30 · 31–90 · 91–180 · 181–365 · 1–2 năm · > 2 năm
    const bucket = d => d <= 30 ? 0 : d <= 90 ? 1 : d <= 180 ? 2 : d <= 365 ? 3 : d <= 730 ? 4 : 5;
    const out = [];
    for (const o of map.values()) {
      const bal = o.valIn - o.valOut;
      if (Math.abs(bal) <= 0.005 && Math.abs(o.qtyIn - o.qtyOut) < 1e-9) continue;
      const b = Array(6).fill(0); let rem = bal, maxAge = 0;
      if (rem > 0) {
        o.inc.sort((x, y) => y.d - x.d);
        for (const it of o.inc) { if (rem <= 0) break; const take = Math.min(rem, it.v); rem -= take; const age = Math.max(0, Math.floor((asD - it.d) / 864e5)); b[bucket(age)] += take; maxAge = Math.max(maxAge, age); }
        if (rem > 0) b[5] += rem;
      }
      const sinceOut = o.lastOut ? Math.floor((asD - new Date(o.lastOut)) / 864e5) : null, sinceIn = o.lastIn ? Math.floor((asD - new Date(o.lastIn)) / 864e5) : null;
      const { inc, ...rest } = o; void inc;
      out.push({ ...rest, bal, qtyBal: o.qtyIn - o.qtyOut, b, maxAge, sinceOut, sinceIn });
    }
    const missing = get(`SELECT count(*) n FROM entries e JOIN imports i ON i.id=e.import_id WHERE ${INC} AND i.schema<2 AND e.product IS NULL AND ifnull(e.enriched,0)=0 AND (${like('e.acc_debit', pres)} OR ${like('e.acc_credit', pres)})`).n;
    return { accounts: INV_ACC.map(a => ({ k: a[0], n: a[1] })), items: out, oldImportRows: missing };
  }

  /* ---------- Báo cáo & thông báo ---------- */
  function report() {
    const cross = col => all(`SELECT ${col} k, count(*) n, sum(er.sev='H') high, sum(${STATUS}='open') open, sum(${STATUS}='doing') doing,
        sum(${STATUS}='fixed') fixed, sum(${STATUS}='ignore') ignore ${FROM} WHERE ${INC}${RV()} GROUP BY k ORDER BY n DESC`);
    const P = reviewPeriod();
    const months = all(`SELECT ym FROM months WHERE included=1 ORDER BY ym`).map(r => r.ym).filter(m => (!P.from || m >= P.from) && (!P.to || m <= P.to));
    return { review: P, byRule: cross('er.rule'), byUser: cross('e.created_by'), months };
  }
  function todo(minSev, group) {
    const { sql, args } = where({ minSev, group, statusIn: ['open', 'doing'] });
    return all(`SELECT e.created_by u, count(*) n, sum(er.sev='H') high, count(DISTINCT e.document_no) docs ${FROM} ${sql} GROUP BY u ORDER BY n DESC`, ...args);
  }
  function employeeErrors(user, minSev, limit = 100000, group = '') {
    const { sql, args } = where({ minSev, user, group, statusIn: ['open', 'doing'] });
    return all(`SELECT ${ERR_COLS} ${FROM} ${sql} ORDER BY ${SEVN}, e.account_date LIMIT ?`, ...args, limit);
  }

  /* ---------- Dữ liệu ---------- */
  const months = () => all(`SELECT m.ym, m.included, m.analyzed_ver, (SELECT count(*) FROM entries e WHERE e.ym=m.ym) n,
      (SELECT group_concat(DISTINCT i.file_name) FROM entries e JOIN imports i ON i.id=e.import_id WHERE e.ym=m.ym) files FROM months m ORDER BY m.ym`);
  const imports = () => all(`SELECT id, file_name file, row_count rows, date_from "from", date_to "to", imported_at at FROM imports WHERE status='ok' ORDER BY date_from, id`);
  function setMonths(list, included) { const st = db.prepare('UPDATE months SET included=? WHERE ym=?'); db.exec('BEGIN'); for (const m of list) st.run(included ? 1 : 0, m); db.exec('COMMIT'); }
  function setAllMonths(included) { db.prepare('UPDATE months SET included=?').run(included ? 1 : 0); }
  const getSetting = k => get('SELECT v FROM settings WHERE k=?', k)?.v ?? null;
  const setSetting = (k, v) => { db.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v); };
  const logMail = (employee, to, subject, count, status, info) =>
    db.prepare('INSERT INTO mail_log(employee,to_addr,subject,error_count,status,info) VALUES(?,?,?,?,?,?)').run(employee, to, subject, count, status, info);
  const mailLog = () => all(`SELECT sent_at at, employee, to_addr "to", error_count count, status, CASE WHEN status='ok' THEN '' ELSE info END error FROM mail_log ORDER BY id DESC LIMIT 500`);
  // Trạng thái phân tích của các tháng trong kỳ rà soát
  function analysisStatus() {
    const P = reviewPeriod(), V = +RULES_VERSION;
    const ms = all(`SELECT ym, analyzed_ver v FROM months WHERE 1${P.from ? ` AND ym>='${P.from}'` : ''}${P.to ? ` AND ym<='${P.to}'` : ''} ORDER BY ym`);
    return { review: P, version: V, months: ms.length, pending: ms.filter(m => m.v !== V).map(m => ({ ym: m.ym, old: m.v != null })) };
  }
  const stats = () => get(`SELECT (SELECT count(*) FROM entries) entries, (SELECT count(*) FROM errors) errors, (SELECT count(*) FROM months WHERE included=1) monthsOn, (SELECT count(*) FROM months) months`);

  return { meta, plRange, plTrend, analysisRange, analysisStatus, reviewPeriod, setReviewPeriod, inventory, analysis, analysisDrill, errors, errorGroups, errorFacets, errorDetail, setReviews, setStatusWhere, setStatusDoc, overview, pl, cost, aging,
    report, todo, employeeErrors, months, imports, setMonths, setAllMonths, getSetting, setSetting, logMail, mailLog, stats, rowFromDb };
}
module.exports = { make };
