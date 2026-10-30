'use strict';
// Truy vấn đọc cho giao diện – mọi phép tổng hợp chạy bằng SQL, giao diện chỉ nhận kết quả đã gọn
const { COLS, rowFromDb } = require('./db');
const { meta, ST } = require('./rules');

const INC = `e.ym IN (SELECT ym FROM months WHERE included=1)`;
const STATUS = `coalesce(nullif(rv.status,''),'open')`;
const SEVN = `CASE er.sev WHEN 'H' THEN 0 WHEN 'M' THEN 1 ELSE 2 END`;
const like = (col, pres) => '(' + pres.map(p => `${col} LIKE '${p}%'`).join(' OR ') + ')';

function make(db) {
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const get = (sql, ...a) => db.prepare(sql).get(...a);

  /* ---------- Lỗi nhập liệu ---------- */
  function where(f = {}) {
    const w = [INC], a = [];
    if (f.rule) { w.push('er.rule=?'); a.push(f.rule); }
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
    const base = `${FROM} WHERE ${INC}`;
    const sc = Object.fromEntries(Object.keys(ST).map(k => [k, 0]));
    for (const r of all(`SELECT ${STATUS} s, count(*) n ${base} GROUP BY s`)) sc[r.s] = r.n;
    const gone = all(`SELECT rv.err_key key, rv.rule, rv.document_no doc, rv.status, rv.note, rv.updated_at at, rv.snapshot FROM reviews rv
      WHERE NOT EXISTS (SELECT 1 FROM errors x WHERE x.err_key=rv.err_key)`).filter(r => {
      try { const m = JSON.parse(r.snapshot).m; return get('SELECT included FROM months WHERE ym=?', m)?.included === 1; } catch (e) { return false; }
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
    const er = get(`SELECT count(DISTINCT er.entry_id) rows, sum(er.sev='H') high, count(*) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC}`);
    const byRule = all(`SELECT er.rule k, er.sev, count(*) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC} GROUP BY er.rule ORDER BY n DESC`);
    const tot = all(`SELECT created_by u, count(*) n FROM entries e WHERE ${INC} GROUP BY u`);
    const bad = Object.fromEntries(all(`SELECT e.created_by u, count(DISTINCT er.entry_id) n FROM errors er JOIN entries e ON e.id=er.entry_id WHERE ${INC} AND er.sev IN ('H','M') GROUP BY u`).map(r => [r.u, r.n]));
    const byUser = tot.map(r => ({ u: r.u, total: r.n, bad: bad[r.u] || 0 })).sort((a, c) => c.bad - a.bad).slice(0, 12);
    const P = pl(), last = P.years.at(-1) || {};
    const trend = P.months.slice(-12);
    return { ...b, errRows: er.rows || 0, errs: er.n || 0, high: er.high || 0, byRule, byUser, net: last.net || 0, pat: last.pat || 0, year: last.k, trend };
  }

  /* ---------- Kết quả kinh doanh ---------- */
  const PLG = [['rev', ['511', '512'], -1], ['ded', ['521'], 1], ['cogs', ['621', '622', '623', '627', '632'], 1], ['finInc', ['515'], -1], ['finExp', ['635'], 1],
    ['sell', ['641'], 1], ['admin', ['642'], 1], ['othInc', ['711'], -1], ['othExp', ['811'], 1], ['tax', ['821'], 1]];
  function plBy(keyExpr) {
    const cols = PLG.map(([k, pres, sign]) =>
      `${sign} * (sum(CASE WHEN ${like('e.acc_debit', pres)} THEN e.amount ELSE 0 END) - sum(CASE WHEN ${like('e.acc_credit', pres)} THEN e.amount ELSE 0 END)) AS ${k}`).join(',');
    return all(`SELECT ${keyExpr} k, ${cols} FROM entries e WHERE ${INC} AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%' GROUP BY k ORDER BY k`).map(r => {
      const net = r.rev - r.ded, gp = net - r.cogs, op = gp + r.finInc - r.finExp - r.sell - r.admin, other = r.othInc - r.othExp, pbt = op + other;
      return { ...r, net, gp, op, other, pbt, pat: pbt - r.tax };
    });
  }
  function pl() { return { years: plBy('substr(e.ym,1,4)'), months: plBy('e.ym') }; }

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

  /* ---------- Công nợ – tuổi nợ (FIFO) ---------- */
  const AG_ACC = [['131', 'Phải thu khách hàng', 1], ['1388', 'Phải thu khác', 1], ['141', 'Tạm ứng nhân viên', 1], ['331', 'Phải trả người bán', -1], ['3388', 'Phải trả khác', -1]];
  function aging(asOf, term = 30) {
    const asD = new Date(asOf), map = new Map();
    const pres = AG_ACC.map(a => a[0]);
    const rows = all(`SELECT e.account_date date, e.due_date due, e.acc_debit dr, e.acc_credit cr, e.amount amt, e.partner_debit bp, e.partner_credit bpCr, e.document_no doc
      FROM entries e WHERE ${INC} AND e.account_date<=? AND (${like('e.acc_debit', pres)} OR ${like('e.acc_credit', pres)})`, asOf);
    for (const r of rows) {
      for (const [pre, name, nat] of AG_ACC) for (const side of ['dr', 'cr']) {
        if (!String(r[side] || '').startsWith(pre)) continue;
        const bp = (side === 'dr' ? r.bp : (r.bpCr || r.bp)) || '(không có đối tượng)';
        const key = pre + '|' + bp; let o = map.get(key);
        if (!o) map.set(key, o = { acc: pre, accName: name, bp, bal: 0, inc: [] });
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
      out.push({ acc: o.acc, accName: o.accName, bp: o.bp, bal: o.bal, b, maxAge });
    }
    return { accounts: AG_ACC.map(a => ({ k: a[0], n: a[1] })), items: out };
  }

  /* ---------- Báo cáo & thông báo ---------- */
  function report() {
    const cross = col => all(`SELECT ${col} k, count(*) n, sum(er.sev='H') high, sum(${STATUS}='open') open, sum(${STATUS}='doing') doing,
        sum(${STATUS}='fixed') fixed, sum(${STATUS}='ignore') ignore ${FROM} WHERE ${INC} GROUP BY k ORDER BY n DESC`);
    const months = all(`SELECT ym FROM months WHERE included=1 ORDER BY ym`).map(r => r.ym);
    return { byRule: cross('er.rule'), byUser: cross('e.created_by'), months };
  }
  function todo(minSev) {
    const { sql, args } = where({ minSev, statusIn: ['open', 'doing'] });
    return all(`SELECT e.created_by u, count(*) n, sum(er.sev='H') high, count(DISTINCT e.document_no) docs ${FROM} ${sql} GROUP BY u ORDER BY n DESC`, ...args);
  }
  function employeeErrors(user, minSev, limit = 100000) {
    const { sql, args } = where({ minSev, user, statusIn: ['open', 'doing'] });
    return all(`SELECT ${ERR_COLS} ${FROM} ${sql} ORDER BY ${SEVN}, e.account_date LIMIT ?`, ...args, limit);
  }

  /* ---------- Dữ liệu ---------- */
  const months = () => all(`SELECT m.ym, m.included, (SELECT count(*) FROM entries e WHERE e.ym=m.ym) n,
      (SELECT group_concat(DISTINCT i.file_name) FROM entries e JOIN imports i ON i.id=e.import_id WHERE e.ym=m.ym) files FROM months m ORDER BY m.ym`);
  const imports = () => all(`SELECT id, file_name file, row_count rows, date_from "from", date_to "to", imported_at at FROM imports WHERE status='ok' ORDER BY date_from, id`);
  function setMonths(list, included) { const st = db.prepare('UPDATE months SET included=? WHERE ym=?'); db.exec('BEGIN'); for (const m of list) st.run(included ? 1 : 0, m); db.exec('COMMIT'); }
  function setAllMonths(included) { db.prepare('UPDATE months SET included=?').run(included ? 1 : 0); }
  const getSetting = k => get('SELECT v FROM settings WHERE k=?', k)?.v ?? null;
  const setSetting = (k, v) => { db.prepare('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v); };
  const logMail = (employee, to, subject, count, status, info) =>
    db.prepare('INSERT INTO mail_log(employee,to_addr,subject,error_count,status,info) VALUES(?,?,?,?,?,?)').run(employee, to, subject, count, status, info);
  const mailLog = () => all(`SELECT sent_at at, employee, to_addr "to", error_count count, status, CASE WHEN status='ok' THEN '' ELSE info END error FROM mail_log ORDER BY id DESC LIMIT 500`);
  const stats = () => get(`SELECT (SELECT count(*) FROM entries) entries, (SELECT count(*) FROM errors) errors, (SELECT count(*) FROM months WHERE included=1) monthsOn, (SELECT count(*) FROM months) months`);

  return { meta, errors, errorGroups, errorFacets, errorDetail, setReviews, setStatusWhere, setStatusDoc, overview, pl, cost, aging,
    report, todo, employeeErrors, months, imports, setMonths, setAllMonths, getSetting, setSetting, logMail, mailLog, stats, rowFromDb };
}
module.exports = { make };
