'use strict';
// Phân tích chuyên sâu (chạy trong worker truy vấn). Mỗi hàm trả về dữ liệu gọn cho giao diện.
const { CFG, GROUP } = require('./rules');

const addM = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${y}-${String(m + 1).padStart(2, '0')}`; };
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const EXP_D = `substr(e.acc_debit,1,1) IN ('6','8') AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%'`;
const AUTO = `ifnull(e.source_table,'') NOT LIKE '%Depreciation%' AND ifnull(e.source_table,'') NOT LIKE '%Distribution%' AND ifnull(e.source_table,'') NOT LIKE '%CIP%' AND ifnull(e.source_table,'')<>'OPENING_BALANCE'`;
const nameOf = p => String(p || '').split('_').slice(2).join('_') || String(p || '');

function make(db, { INC, all, get, okYm }) {
  const monthsIn = (from, to) => all(`SELECT ym FROM months WHERE included=1 AND ym>=? AND ym<=? ORDER BY ym`, from, to).map(r => r.ym);
  const lastYm = () => get(`SELECT max(ym) m FROM months WHERE included=1`)?.m;

  /* #1 Chi phí định kỳ: thiếu kỳ / nghi ghi 2 lần (theo khoản mục × đối tượng) */
  function recurring(end, span = 12) {
    end = okYm(end) || lastYm(); if (!end) return { items: [], months: [] };
    const from = addM(end, -(span - 1)), months = monthsIn(from, end);
    if (months.length < 4) return { items: [], months, note: `Cần ít nhất 4 tháng dữ liệu trong khoảng ${from} → ${end} (hiện có ${months.length}).` };
    const rows = all(`SELECT e.type_of_cost t, coalesce(e.partner_credit, e.partner_debit) p, e.ym, sum(e.amount) v, count(DISTINCT e.document_no) d
      FROM entries e WHERE ${INC} AND e.ym>=? AND e.ym<=? AND ${EXP_D} AND ${AUTO} AND e.type_of_cost IS NOT NULL GROUP BY 1,2,3`, from, end);
    const g = new Map();
    for (const r of rows) { const k = r.t + '|' + r.p; const o = g.get(k) || g.set(k, { t: r.t, p: r.p, by: {} }).get(k); o.by[r.ym] = { v: r.v, d: r.d }; }
    const need = Math.max(3, Math.ceil(months.length * CFG.recurringShare / 100)), items = [];
    for (const o of g.values()) {
      const present = months.filter(m => (o.by[m]?.v || 0) > 0.005);
      if (present.length < need) continue;
      const med = median(present.map(m => o.by[m].v));
      const first = present[0], missing = months.filter(m => m > first && !((o.by[m]?.v || 0) > 0.005));
      const double = present.filter(m => o.by[m].v > 1.8 * med && o.by[m].d >= 2);
      if (!missing.length && !double.length) continue;
      items.push({ t: o.t, p: o.p, name: nameOf(o.p), present: present.length, total: months.length, med, missing, double,
        series: months.map(m => o.by[m]?.v || 0), impact: missing.length * med + double.reduce((s, m) => s + o.by[m].v - med, 0) });
    }
    items.sort((a, b) => b.impact - a.impact);
    return { items, months, from, end, need };
  }

  /* #2 Biến động bất thường so với trung bình 12 tháng trước */
  function variance(ym, by = 'tcost', kind = 'exp') {
    ym = okYm(ym) || lastYm(); if (!ym) return { items: [] };
    const from = addM(ym, -12), prev = monthsIn(from, addM(ym, -1));
    if (!prev.length) return { items: [], ym, note: 'Chưa có dữ liệu các tháng trước để so sánh.' };
    const sign = kind === 'rev' ? `CASE e.side WHEN 'cr' THEN 1 ELSE -1 END` : `CASE e.side WHEN 'dr' THEN 1 ELSE -1 END`;
    const accF = kind === 'rev' ? `(e.acc LIKE '511%' OR e.acc LIKE '512%' OR e.acc LIKE '515%' OR e.acc LIKE '711%')` : `substr(e.acc,1,1) IN ('6','8')`;
    let rows;
    if (by === 'tcost_bp') {
      rows = all(`SELECT coalesce(e.type_of_cost,'(chưa phân loại)')||' · '||coalesce(e.partner_credit,e.partner_debit,'(không đối tượng)') g, e.ym, sum(e.amount) v
        FROM entries e WHERE ${INC} AND e.ym>=? AND e.ym<=? AND ${EXP_D} AND ${AUTO} GROUP BY 1,2`, from, ym);
    } else {
      const G = by === 'acc' ? 'coalesce(e.acc_name,e.acc)' : by === 'dept' ? `coalesce(e.dept,'(trống)')` : kind === 'rev' ? `coalesce(e.trev,'(chưa phân loại)')` : `coalesce(e.tcost,'(chưa phân loại)')`;
      rows = all(`SELECT ${G} g, e.ym, sum(e.amount*${sign}) v FROM agg e WHERE ${INC} AND e.ym>=? AND e.ym<=? AND ${accF} GROUP BY 1,2`, from, ym);
    }
    const g = new Map();
    for (const r of rows) { const o = g.get(r.g) || g.set(r.g, { g: r.g, by: {} }).get(r.g); o.by[r.ym] = r.v; }
    const items = [];
    for (const o of g.values()) {
      const cur = o.by[ym] || 0, avg = prev.reduce((s, m) => s + (o.by[m] || 0), 0) / prev.length, diff = cur - avg;
      if (Math.abs(diff) < CFG.varianceMin) continue;
      const pct = avg ? diff / Math.abs(avg) : null;
      if (pct != null && Math.abs(pct) * 100 < CFG.variancePct) continue;
      items.push({ g: o.g, cur, avg, diff, pct, type: !avg ? 'Phát sinh mới' : !cur ? 'Không phát sinh' : diff > 0 ? 'Tăng đột biến' : 'Giảm đột biến', series: [...prev, ym].map(m => o.by[m] || 0) });
    }
    items.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return { items: items.slice(0, 300), ym, months: [...prev, ym] };
  }

  /* #3a TK 335: trích trước – quyết toán/hoàn nhập theo đối tượng × khoản mục */
  function accruals(asOf) {
    const rows = all(`SELECT e.account_date d, e.ym, e.acc_debit dr, e.acc_credit cr, e.amount a, e.partner_debit bp, e.partner_credit bpCr, e.type_of_cost t
      FROM entries e WHERE ${INC} AND e.account_date<=? AND (e.acc_debit LIKE '335%' OR e.acc_credit LIKE '335%')`, asOf);
    const g = new Map(), asD = new Date(asOf);
    for (const r of rows) for (const side of ['dr', 'cr']) {
      if (!String(r[side]).startsWith('335')) continue;
      const p = (side === 'dr' ? r.bp : r.bpCr) || '(không có đối tượng)', t = r.t || '(không có khoản mục)', k = p + '|' + t;
      const o = g.get(k) || g.set(k, { p, t, acc: 0, set: 0, accM: new Set(), setM: new Set(), lastAcc: null, lastSet: null, inc: [] }).get(k);
      if (side === 'cr') { o.acc += r.a; if (r.a > 0) { o.accM.add(r.ym); o.inc.push({ d: r.d, v: r.a }); } if (!o.lastAcc || r.d > o.lastAcc) o.lastAcc = r.d; }
      else { o.set += r.a; o.setM.add(r.ym); if (!o.lastSet || r.d > o.lastSet) o.lastSet = r.d; }
    }
    const items = [];
    for (const o of g.values()) {
      const bal = o.acc - o.set; if (Math.abs(bal) < 0.005 && !o.accM.size) continue;
      let rem = bal, oldest = null; o.inc.sort((a, b) => b.d.localeCompare(a.d));
      for (const it of o.inc) { if (rem <= 0.005) break; rem -= it.v; oldest = it.d; }
      const age = oldest ? Math.floor((asD - new Date(oldest)) / 864e5) : 0;
      const sinceSet = [...o.accM].filter(m => !o.lastSet || m > o.lastSet.slice(0, 7)).length;
      const flags = [];
      if (bal < -0.005) flags.push(['H', 'Quyết toán/hoàn nhập vượt số đã trích']);
      if (bal > 0.005 && age > CFG.accrualDays) flags.push(['H', `Trích trước ${age} ngày chưa quyết toán`]);
      if (sinceSet >= 3) flags.push(['M', `Trích liên tục ${sinceSet} tháng chưa quyết toán`]);
      if (o.p.startsWith('(không')) flags.push(['M', 'Thiếu đối tượng']);
      items.push({ p: o.p, name: nameOf(o.p), t: o.t, accrued: o.acc, settled: o.set, bal, months: o.accM.size, lastAcc: o.lastAcc, lastSet: o.lastSet, age, flags });
    }
    items.sort((a, b) => b.flags.length - a.flags.length || Math.abs(b.bal) - Math.abs(a.bal));
    return { items };
  }

  /* #3b TK 242: lịch phân bổ theo hợp đồng (kỳ phân bổ lấy từ Distribution From/To của dòng ghi Nợ 242) */
  function prepaid(asOf) {
    const rows = all(`SELECT e.account_date d, e.acc_debit dr, e.acc_credit cr, e.amount a, e.contract c, coalesce(e.partner_debit,e.partner_credit) p, e.type_of_cost t,
        e.dist_from f, e.dist_to tt, e.description ds FROM entries e WHERE ${INC} AND e.account_date<=? AND (e.acc_debit LIKE '242%' OR e.acc_credit LIKE '242%')`, asOf);
    const g = new Map(), mdiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
    for (const r of rows) {
      const k = r.c || `(không HĐ) ${nameOf(r.p) || ''} · ${r.t || ''}`;
      const o = g.get(k) || g.set(k, { k, c: r.c, p: r.p, t: r.t, pre: 0, amo: 0, f: null, to: null, lastAmo: null, desc: r.ds }).get(k);
      if (String(r.dr).startsWith('242')) { o.pre += r.a; if (r.f && (!o.f || r.f < o.f)) o.f = r.f; if (r.tt && (!o.to || r.tt > o.to)) o.to = r.tt; }
      if (String(r.cr).startsWith('242')) { o.amo += r.a; if (!o.lastAmo || r.d > o.lastAmo) o.lastAmo = r.d; }
    }
    const items = [];
    for (const o of g.values()) {
      const bal = o.pre - o.amo, flags = []; let expected = null;
      if (o.pre > 0.005 && o.f && o.to) {
        const total = Math.max(1, mdiff(o.f, o.to) + 1), done = Math.min(total, Math.max(0, mdiff(o.f, asOf) + 1));
        expected = o.pre * done / total;
        if (asOf > o.to && bal > Math.max(1, 0.01 * o.pre)) flags.push(['H', 'Hết kỳ phân bổ nhưng còn số dư']);
        else if (Math.abs(o.amo - expected) > Math.max(1, 0.1 * o.pre)) flags.push(['M', o.amo > expected ? 'Phân bổ nhanh hơn lịch' : 'Phân bổ chậm hơn lịch']);
      } else if (o.pre > 0.005) flags.push(['M', 'Thiếu kỳ phân bổ (Distribution From/To)']);
      if (o.pre <= 0.005 && o.amo > 0.005) flags.push(['L', 'Có phân bổ nhưng chưa thấy số trả trước (cần số dư đầu kỳ)']);
      if (bal < -0.005 && o.pre > 0.005) flags.push(['H', 'Phân bổ vượt số trả trước']);
      if (Math.abs(bal) < 0.005 && !flags.length) continue;
      items.push({ ...o, bal, expected, flags });
    }
    items.sort((a, b) => b.flags.filter(f => f[0] === 'H').length - a.flags.filter(f => f[0] === 'H').length || Math.abs(b.bal) - Math.abs(a.bal));
    return { items };
  }

  /* #4 Benford chữ số đầu + tỷ lệ số tròn, theo người nhập */
  const BEN = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => Math.log10(1 + 1 / d));
  function benford(from, to) {
    const rows = all(`SELECT e.created_by u, substr(printf('%d', abs(e.amount)),1,1) d, count(*) n, sum(CASE WHEN abs(e.amount)>=100 AND CAST(abs(e.amount) AS INTEGER) % 100 = 0 AND abs(e.amount)=CAST(abs(e.amount) AS INTEGER) THEN 1 ELSE 0 END) r
      FROM entries e WHERE ${INC} AND abs(e.amount)>=10 AND ${AUTO}${okYm(from) ? ` AND e.ym>='${okYm(from)}'` : ''}${okYm(to) ? ` AND e.ym<='${okYm(to)}'` : ''} GROUP BY 1,2`);
    const g = new Map(), tot = { u: 'Toàn bộ', c: Array(9).fill(0), r: 0 };
    for (const r of rows) { const d = +r.d; if (!(d >= 1 && d <= 9)) continue; const o = g.get(r.u) || g.set(r.u, { u: r.u, c: Array(9).fill(0), r: 0 }).get(r.u); o.c[d - 1] += r.n; o.r += r.r; tot.c[d - 1] += r.n; tot.r += r.r; }
    const fin = o => { const n = o.c.reduce((a, b) => a + b, 0), obs = o.c.map(x => n ? x / n : 0), mad = obs.reduce((s, x, i) => s + Math.abs(x - BEN[i]), 0) / 9;
      return { u: o.u, n, obs, mad, round: n ? o.r / n : 0, level: n < 300 ? 'Ít dữ liệu' : mad < 0.006 ? 'Phù hợp chặt' : mad < 0.012 ? 'Chấp nhận được' : mad < 0.015 ? 'Cận biên' : 'Không phù hợp' }; };
    return { expected: BEN, total: fin(tot), users: [...g.values()].map(fin).sort((a, b) => b.mad - a.mad) };
  }

  /* #5 Phiếu chấm điểm nhân viên */
  function staff(from, to) {
    const R = (okYm(from) ? ` AND e.ym>='${okYm(from)}'` : '') + (okYm(to) ? ` AND e.ym<='${okYm(to)}'` : '');
    const ent = new Map(all(`SELECT s.u u, sum(s.nx) n FROM ent_sum s WHERE s.ym IN (SELECT ym FROM months WHERE included=1)${R.replace(/e\.ym/g, 's.ym')} GROUP BY 1`).map(r => [r.u, r.n]));
    const er = all(`SELECT s.u u, s.rule k, s.sev s, s.ym ym, s.st st, sum(s.n) n FROM err_sum s
      WHERE s.ym IN (SELECT ym FROM months WHERE included=1)${R.replace(/e\.ym/g, 's.ym')} GROUP BY 1,2,3,4,5`);
    const months = [...new Set(er.map(r => r.ym))].sort().slice(-6), out = new Map();
    for (const [u, n] of ent) out.set(u, { u, entries: n, errors: 0, staff: 0, audit: 0, high: 0, fixed: 0, ignore: 0, open: 0, rules: {}, ruleMonths: {}, byMonth: {} });
    for (const r of er) {
      const o = out.get(r.u) || out.set(r.u, { u: r.u, entries: 0, errors: 0, staff: 0, audit: 0, high: 0, fixed: 0, ignore: 0, open: 0, rules: {}, ruleMonths: {}, byMonth: {} }).get(r.u);
      o.errors += r.n; o[GROUP[r.k] || 'staff'] += r.n; if (r.s === 'H') o.high += r.n; o[r.st === 'fixed' ? 'fixed' : r.st === 'ignore' ? 'ignore' : 'open'] += r.n;
      o.rules[r.k] = (o.rules[r.k] || 0) + r.n; (o.ruleMonths[r.k] ??= new Set()).add(r.ym); o.byMonth[r.ym] = (o.byMonth[r.ym] || 0) + r.n;
    }
    const entByMonth = all(`SELECT s.u u, s.ym, s.n FROM ent_sum s WHERE s.ym IN (SELECT ym FROM months WHERE included=1)${R.replace(/e\.ym/g, 's.ym')}`);
    const em = new Map(entByMonth.map(r => [r.u + '|' + r.ym, r.n]));
    const items = [...out.values()].filter(o => o.entries || o.errors).map(o => {
      const top = Object.entries(o.rules).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const repeat = Object.entries(o.ruleMonths).filter(([, s]) => s.size >= 3).map(([k, s]) => ({ k, months: s.size }));
      const rate = o.entries ? o.errors / o.entries * 100 : 0;
      const score = Math.max(0, Math.round(100 - Math.min(100, (o.staff + 2 * o.audit + 3 * o.high) / Math.max(1, o.entries) * 100)));
      return { u: o.u, entries: o.entries, errors: o.errors, staff: o.staff, audit: o.audit, high: o.high, fixed: o.fixed, ignore: o.ignore, open: o.open, rate, score,
        top, repeat, trend: months.map(m => { const n = em.get(o.u + '|' + m) || 0; return n ? (o.byMonth[m] || 0) / n * 100 : null; }) };
    }).sort((a, b) => a.score - b.score);
    return { items, months };
  }

  /* #6 Nhà cung cấp (TK 331): tập trung, mới, tên gần giống, trả tiền trước khi có hoá đơn */
  const norm = s => nameOf(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/\b(company|co|ltd|limited|unipessoal|lda|jsc|joint|stock|corporation|corp|trading|cong ty|tnhh|co phan|group|the|sarl|sa|pte|inc|llc)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  function vendors(from, to) {
    const R = (okYm(from) ? ` AND e.ym>='${okYm(from)}'` : '') + (okYm(to) ? ` AND e.ym<='${okYm(to)}'` : '');
    const buy = all(`SELECT e.partner_credit p, sum(e.amount) v, count(*) n, min(e.account_date) f FROM entries e WHERE ${INC}${R} AND e.acc_credit LIKE '331%' AND e.partner_credit IS NOT NULL AND ifnull(e.source_table,'')<>'OPENING_BALANCE' GROUP BY 1`);
    const firstAll = new Map(all(`SELECT p, min(d) d FROM (SELECT e.partner_credit p, e.account_date d FROM entries e WHERE e.acc_credit LIKE '331%' UNION ALL SELECT e.partner_debit, e.account_date FROM entries e WHERE e.acc_debit LIKE '331%') WHERE p IS NOT NULL GROUP BY p`).map(r => [r.p, r.d]));
    const total = buy.reduce((s, r) => s + r.v, 0);
    buy.sort((a, b) => b.v - a.v);
    let cum = 0;
    const list = buy.map(r => { cum += r.v; return { p: r.p, name: nameOf(r.p), v: r.v, n: r.n, share: total ? r.v / total : 0, cum: total ? cum / total : 0, first: firstAll.get(r.p), isNew: !!(okYm(from) && firstAll.get(r.p) && firstAll.get(r.p).slice(0, 7) >= okYm(from)) }; });
    // tên gần giống nhau nhưng khác mã
    const byNorm = new Map();
    for (const p of firstAll.keys()) { const k = norm(p); if (k.length < 3) continue; (byNorm.get(k) || byNorm.set(k, []).get(k)).push(p); }
    const similar = [...byNorm.entries()].filter(([, a]) => a.length > 1).map(([k, a]) => ({ k, codes: a }));
    // trả tiền trước khi có hoá đơn: lần ghi Nợ 331 đầu tiên sớm hơn lần ghi Có 331 đầu tiên
    const fd = new Map(all(`SELECT e.partner_debit p, min(e.account_date) d, sum(e.amount) v FROM entries e WHERE e.acc_debit LIKE '331%' AND e.partner_debit IS NOT NULL AND ifnull(e.source_table,'')<>'OPENING_BALANCE' GROUP BY 1`).map(r => [r.p, r]));
    const fc = new Map(all(`SELECT e.partner_credit p, min(e.account_date) d FROM entries e WHERE e.acc_credit LIKE '331%' AND e.partner_credit IS NOT NULL GROUP BY 1`).map(r => [r.p, r.d]));
    const prepay = [...fd.values()].filter(r => !fc.get(r.p) || r.d < fc.get(r.p)).map(r => ({ p: r.p, name: nameOf(r.p), firstPay: r.d, firstInv: fc.get(r.p) || null, paid: r.v })).sort((a, b) => b.paid - a.paid);
    const top10 = list.slice(0, 10).reduce((s, r) => s + r.share, 0);
    return { total, count: list.length, top10, list: list.slice(0, 500), newVendors: list.filter(r => r.isNew), similar, prepay };
  }

  /* #7 Tỷ giá */
  function fx(from, to) {
    const R = (okYm(from) ? ` AND e.ym>='${okYm(from)}'` : '') + (okYm(to) ? ` AND e.ym<='${okYm(to)}'` : '');
    const s = get(`SELECT count(*) n, sum(CASE WHEN ifnull(e.rate_vnd,0)>0 THEN 1 ELSE 0 END) has, count(DISTINCT e.currency) cur FROM entries e WHERE ${INC}${R}`);
    if (!s.has) return { noData: true, rows: s.n, currencies: all(`SELECT e.currency c, count(*) n FROM entries e WHERE ${INC}${R} GROUP BY 1`) };
    const multi = all(`SELECT e.account_date d, e.currency c, count(DISTINCT e.rate_vnd) k, min(e.rate_vnd) lo, max(e.rate_vnd) hi, count(*) n FROM entries e
      WHERE ${INC}${R} AND e.rate_vnd>0 GROUP BY 1,2 HAVING count(DISTINCT e.rate_vnd)>1 ORDER BY (max(e.rate_vnd)-min(e.rate_vnd))/min(e.rate_vnd) DESC LIMIT 200`);
    const dev = all(`WITH m AS (SELECT e.ym, e.currency c, avg(e.rate_vnd) a FROM entries e WHERE ${INC}${R} AND e.rate_vnd>0 GROUP BY 1,2)
      SELECT e.id rid, e.account_date d, e.document_no doc, e.currency c, e.rate_vnd r, m.a avg, e.amount amt, e.created_by u FROM entries e JOIN m ON m.ym=e.ym AND m.c=e.currency
      WHERE ${INC}${R} AND e.rate_vnd>0 AND abs(e.rate_vnd-m.a)/m.a>0.02 ORDER BY abs(e.rate_vnd-m.a)/m.a DESC LIMIT 300`);
    return { noData: false, rows: s.n, has: s.has, multi, dev };
  }

  /* #13 Số liệu cho báo cáo tổng hợp rủi ro */
  /* Đã ghi chi phí thực tế nhưng chưa huỷ trích 335 */
  function reversal(from, to) {
    const r = require('./accrual').match(all), f = okYm(from), t = okYm(to);
    const groups = r.groups.filter(g => (!f || g.per >= f || (g.firstAct || '').slice(0, 7) >= f) && (!t || g.per <= t)).map(g => ({ ...g, name: nameOf(g.p) }));
    const byUser = new Map();
    for (const g of groups) if (g.status === 'Chưa huỷ trích') for (const u of g.users) { const o = byUser.get(u) || byUser.set(u, { u, n: 0, amt: 0, H: 0 }).get(u); o.n++; o.amt += Math.min(g.remain, g.actual); if (g.sev === 'H') o.H++; }
    return { groups, users: [...byUser.values()].sort((a, b) => b.amt - a.amt) };
  }
  return { recurring, variance, accruals, prepaid, benford, staff, vendors, fx, reversal };
}
module.exports = { make, addM };
