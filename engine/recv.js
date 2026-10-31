'use strict';
// Phân tích chuyên sâu tài khoản phải thu theo đối tượng (mặc định 138812 – phải thu doanh thu showroom/trung tâm, trả sau).
//   Ghi nhận doanh thu / phải thu: Nợ 1388xx (đối tượng Nợ)  ·  Thu tiền / giảm trừ: Có 1388xx (đối tượng Có), thường Nợ 111/112.
// Mỗi đối tượng: phân bổ tiền thu cho từng khoản phải thu (khớp đúng số tiền / mã tham chiếu trước, sau đó cũ trước – FIFO),
// tính còn nợ, quá hạn, tuổi nợ; phát hiện:
//   (1) tiền thu có thể thuộc đối tượng khác   (2) doanh thu ghi sai đối tượng / ghi thiếu doanh thu   (3) mức rủi ro từng đối tượng.
const { period } = require('./accrual');
// Tên đối tượng: bỏ phần mã đầu (VTL_VEN_043_…, VTL_HOVEN00182_…, BC19_…)
const nameOf = p => { const seg = String(p || '').split('_'); if (seg.length < 2) return String(p || '');
  let i = seg.findIndex((x, k) => k > 0 && /[a-z\s]/.test(x)); if (i < 0) i = seg.length - 1; return seg.slice(i).join('_') || String(p || ''); };
const STOP = new Set('the and for with from payment receive received total amount months month bank transfer transf deposit revenue service services group sim sms data internet postpaid package unipessoal lda ltd limited company co jsc corporation ministry ministerio of da de do dos das do in to by on at a e ho head office branch dili timor leste rdtl east center centre block world business national internacional international public publica empresa top up balance basic leaseline programme program imprest january february march april may june july august september october november december'.split(' '));
const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
// Mã tham chiếu trong diễn giải: mã thuê bao (dil0046_gftth_thao), số điện thoại 7xxxxxxx, số hoá đơn / hợp đồng dạng chữ+số
const refs = s => { const t = String(s || ''); const out = new Set();
  for (const m of t.matchAll(/\b[a-z]{2,6}\d{3,}(?:_[a-z0-9]+)*\b/gi)) out.add(m[0].toLowerCase());
  for (const m of t.matchAll(/\b[67]\d{7}\b/g)) out.add(m[0]);
  return [...out]; };
const GENERIC = /branch|head office|khach le|khách lẻ|walk.?in|retail|cash customer|showroom|unknown|chưa xác định/i;
const BUCKETS = [[0, 'Chưa đến hạn'], [30, '1–30'], [60, '31–60'], [90, '61–90'], [180, '91–180'], [365, '181–365'], [1e9, '> 365']];
const bucketOf = d => d <= 0 ? 0 : BUCKETS.findIndex(([x], i) => i > 0 && d <= x);

function make(all, okYm) {
  function load(acc, asOf) {
    const a = String(acc || '138812').replace(/[^0-9]/g, '') || '138812', hi = a.slice(0, -1) + String.fromCharCode(a.slice(-1).charCodeAt(0) + 1);
    const S = `id, document_no doc, line_no line, account_date d, due_date due, ym, acc_debit dr, acc_credit cr, acc_debit_name drName, acc_credit_name crName, amount amt, partner_debit bp, partner_credit bpCr,
      description ds, invoice inv, contract ct, created_by u, source_table tb`;
    const rev = all(`SELECT ${S} FROM entries WHERE acc_debit>=? AND acc_debit<? AND account_date<=? AND amount<>0`, a, hi, asOf).map(r => ({ ...r, p: r.bp || '(không đối tượng)', side: 'rev' }));
    const pay = all(`SELECT ${S} FROM entries WHERE acc_credit>=? AND acc_credit<? AND account_date<=? AND amount<>0`, a, hi, asOf).map(r => ({ ...r, p: r.bpCr || '(không đối tượng)', side: 'pay' }));
    return { a, rev, pay };
  }

  function analyze(acc = '138812', asOf, term = 30) {
    asOf = asOf || (all(`SELECT max(account_date) d FROM entries`)[0] || {}).d || '9999-12-31';
    const { a, rev, pay } = load(acc, asOf), asD = new Date(asOf), days = d => Math.floor((asD - new Date(d)) / 864e5);
    const firstYm = (all(`SELECT min(ym) m FROM entries`)[0] || {}).m || '';
    // Chỉ mục từ khoá tên đối tượng & mã tham chiếu trên khoản doanh thu → nhận diện tiền thu ghi nhầm đối tượng
    const P = new Map(), kw = new Map(), refOwner = new Map();
    const po = p => P.get(p) || P.set(p, { p, name: nameOf(p), rev: [], pay: [], generic: GENERIC.test(p) }).get(p);
    for (const r of rev) { r.refs = refs(r.ds + ' ' + (r.inv || '') + ' ' + (r.ct || '')); r.per = period(r.ds); r.dueD = r.due && r.due > r.d ? r.due : addDays(r.d, term); r.open = r.amt; r.alloc = []; po(r.p).rev.push(r); for (const x of r.refs) (refOwner.get(x) || refOwner.set(x, new Set()).get(x)).add(r.p); }
    for (const r of pay) { r.refs = refs(r.ds + ' ' + (r.inv || '') + ' ' + (r.ct || '')); r.per = period(r.ds); r.left = r.amt; r.alloc = []; r.flags = []; po(r.p).pay.push(r); }
    for (const o of P.values()) for (const w of new Set(words(o.name))) (kw.get(w) || kw.set(w, new Set()).get(w)).add(o.p);
    // Phân bổ trong từng đối tượng: (a) khớp mã tham chiếu + số tiền, (b) khớp đúng số tiền, (c) cũ trước
    for (const o of P.values()) {
      o.rev.sort((x, y) => x.d.localeCompare(y.d) || x.id - y.id); o.pay.sort((x, y) => x.d.localeCompare(y.d) || x.id - y.id);
      const credits = o.rev.filter(r => r.amt < 0); // điều chỉnh giảm phải thu (ghi Nợ âm) – xử lý như một khoản giảm trừ
      const debits = o.rev.filter(r => r.amt > 0);
      for (const c of credits) { c.left = -c.amt; c.alloc = []; c.side = 'adj'; }
      // Phân bổ theo trình tự thời gian: thu tiền chỉ trừ cho khoản đã phát sinh; phần thu dư (trả trước) chờ trừ cho doanh thu ghi nhận sau
      const take = (s, r, v, how) => { r.open -= v; s.left -= v; r.alloc.push({ id: s.id, doc: s.doc, d: s.d, v, how, kind: s.side }); s.alloc.push({ id: r.id, doc: r.doc, d: r.d, v, how }); };
      const best = (s, open) => open.find(r => r.refs.some(x => s.refs.includes(x)) && Math.abs(r.open - s.left) < 0.01) || open.find(r => r.refs.some(x => s.refs.includes(x)))
        || open.find(r => Math.abs(r.open - s.left) < 0.01 && (!s.per || !r.per || r.per === s.per));
      const howOf = (s, r) => r.refs.some(x => s.refs.includes(x)) ? 'mã tham chiếu' : Math.abs(r.amt - s.amt) < 0.01 ? 'đúng số tiền' : 'cũ trước';
      const ev = [...debits.map(r => ({ t: 0, r })), ...credits.map(r => ({ t: 1, r })), ...o.pay.map(r => ({ t: 1, r }))].sort((x, y) => x.r.d.localeCompare(y.r.d) || x.t - y.t || x.r.id - y.r.id);
      const open = [], avail = [];
      for (const { t, r } of ev) {
        if (t === 0) { // doanh thu mới: trừ bằng tiền trả trước còn dư (ưu tiên cùng mã / đúng số tiền, sau đó cũ trước)
          for (;;) { if (r.open <= 0.004) break; const pool = avail.filter(s => s.left > 0.004); if (!pool.length) break;
            const s = pool.find(s => s.refs.some(x => r.refs.includes(x))) || pool.find(s => Math.abs(s.left - r.open) < 0.01 && (!s.per || !r.per || s.per === r.per)) || pool[0];
            take(s, r, Math.min(r.open, s.left), 'trả trước – ' + howOf(s, r)); }
          if (r.open > 0.004) open.push(r);
        } else { // thu tiền / giảm trừ: trừ cho khoản đang nợ
          const cand = open.filter(x => x.open > 0.004), first = best(r, cand);
          if (first) take(r, first, Math.min(first.open, r.left), howOf(r, first));
          for (const x of cand) { if (r.left <= 0.004) break; if (x.open <= 0.004) continue; take(r, x, Math.min(x.open, r.left), 'cũ trước'); }
          if (r.left > 0.004) avail.push(r);
        }
      }
      o.revTot = debits.reduce((t, r) => t + r.amt, 0); o.adj = credits.reduce((t, r) => t - r.amt, 0); o.paid = o.pay.reduce((t, r) => t + r.amt, 0);
      o.bal = o.revTot - o.adj - o.paid; o.unalloc = o.pay.reduce((t, r) => t + Math.max(0, r.left), 0);
      o.b = BUCKETS.map(() => 0); for (const r of debits) if (r.open > 0.004) { r.age = days(r.dueD); o.b[bucketOf(r.age)] += r.open; }
      o.overdue = o.b.slice(1).reduce((t, v) => t + v, 0); o.od90 = o.b.slice(4).reduce((t, v) => t + v, 0);
      o.maxAge = Math.max(0, ...debits.filter(r => r.open > 0.004).map(r => r.age));
      o.lastPay = o.pay.at(-1)?.d || null; o.lastRev = debits.at(-1)?.d || null;
    }
    const flags = [];
    const F = (type, sev, o, r, msg, cand = []) => flags.push({ type, sev, p: o.p, name: o.name, id: r && r.id, doc: r && r.doc, d: r && r.d, amt: r && r.amt, u: r && r.u, msg, cand: cand.map(c => ({ p: c, name: nameOf(c) })) });
    const openRev = [...P.values()].flatMap(o => o.rev.filter(r => r.amt > 0 && r.open > 0.004));
    for (const o of P.values()) {
      for (const s of o.pay) {
        // (1a) Diễn giải nêu tên / mã tham chiếu của đối tượng khác
        // tên đối tượng khác: phải khớp ≥ 2 từ đặc trưng của tên đó và nhiều hơn số từ khớp với tên chính đối tượng ghi sổ
        const dw = new Set(words(s.ds)), ownHit = words(o.name).filter(x => dw.has(x)).length, hit = new Map();
        for (const x of dw) for (const p of kw.get(x) || []) if (p !== o.p) hit.set(p, (hit.get(p) || 0) + 1);
        const byName = new Set([...hit].filter(([, n]) => n >= 2 && n > ownHit).map(([p]) => p));
        const byRef = new Set(); for (const x of s.refs) for (const p of refOwner.get(x) || []) if (p !== o.p) byRef.add(p);
        if (byRef.size) F('PAY_OTHER', 'H', o, s, `Mã tham chiếu trong diễn giải (${s.refs.slice(0, 3).join(', ')}) thuộc khoản phải thu của đối tượng khác`, [...byRef]);
        else if (byName.size && !o.generic) F('PAY_OTHER', 'M', o, s, `Diễn giải nhắc tới tên đối tượng khác`, [...byName]);
        // (1b) Tiền thu không có khoản phải thu để trừ nhưng khớp đúng số tiền một khoản đang nợ của đối tượng khác
        if (s.left > 0.004) {
          const cand = openRev.filter(r => r.p !== o.p && Math.abs(r.open - s.amt) < 0.01 && r.d <= s.d && days(r.d) - days(s.d) <= 365).map(r => r.p);
          if (cand.length && cand.length <= 5) for (const c of new Set(cand)) { const co = P.get(c), cr = co.rev.find(r => r.open > 0.004 && Math.abs(r.open - s.amt) < 0.01);
            F('REV_OTHER', 'M', co, cr, `Khoản nợ ${fmt(s.amt)} có thể đã được thu ngày ${s.d.split('-').reverse().join('/')} (CT ${s.doc}) nhưng tiền ghi cho đối tượng khác`, [o.p]); }
          if (cand.length && cand.length <= 5) F('PAY_OTHER', 'H', o, s, `Thu ${fmt(s.amt)} nhưng đối tượng không còn khoản phải thu tương ứng; số tiền khớp đúng khoản đang nợ của đối tượng khác`, [...new Set(cand)]);
          else if (o.rev.length) { o.over = o.over || { n: 0, v: 0, s }; o.over.n++; o.over.v += s.left; }
        }
        // (2b) Diễn giải nêu kỳ dịch vụ nhưng đối tượng không có doanh thu kỳ đó
        if (s.per && o.rev.length && !o.rev.some(r => r.per === s.per || (r.ym === s.per)) && s.per >= firstYm) F('REV_PERIOD', 'M', o, s, `Thu tiền kỳ ${s.per} nhưng không có doanh thu kỳ ${s.per} của đối tượng này`);
        if (o.generic && s.refs.length) { o.gen = o.gen || { n: 0, v: 0, s, refs: new Set() }; o.gen.n++; o.gen.v += s.amt; s.refs.forEach(x => o.gen.refs.size < 5 && o.gen.refs.add(x)); }
      }
      if (o.over) F('OVERPAID', 'M', o, o.over.s, `${o.over.n} lần thu vượt phải thu, tổng ${fmt(o.over.v)} – kiểm tra doanh thu còn thiếu hoặc tiền của đối tượng khác`);
      if (o.gen) F('GENERIC_PARTNER', 'L', o, o.gen.s, `${o.gen.n} lần thu (${fmt(o.gen.v)}) ghi vào đối tượng chung "${o.name}" dù diễn giải có mã khách hàng (${[...o.gen.refs].join(', ')}…) – nên ghi đúng đối tượng để theo dõi công nợ từng khách`);
      // (2a) Doanh thu của đối tượng này lại được thu bởi đối tượng khác (cùng mã tham chiếu)
      for (const r of o.rev.filter(r => r.amt > 0 && r.open > 0.004)) {
        const other = new Set(); for (const s of pay) if (s.p !== o.p && s.refs.some(x => r.refs.includes(x))) other.add(s.p);
        if (other.size) F('REV_OTHER', 'H', o, r, `Doanh thu còn nợ ${fmt(r.open)} nhưng tiền thu có cùng mã tham chiếu lại ghi cho đối tượng khác – nghi ghi doanh thu hoặc thu tiền sai đối tượng`, [...other]);
      }
      // (2c) Doanh thu định kỳ hàng tháng bị thiếu tháng
      const yms = [...new Set(o.rev.filter(r => r.amt > 0).map(r => r.ym))].sort();
      if (yms.length >= 4) { const miss = []; for (let m = yms[0]; m <= yms.at(-1); m = addYm(m, 1)) if (!yms.includes(m)) miss.push(m);
        if (miss.length && miss.length <= yms.length / 2) F('REV_GAP', 'M', o, null, `Doanh thu định kỳ thiếu tháng: ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}`); }
      if (!o.rev.length && o.pay.length) { // thu tiền nhưng chưa có doanh thu / phải thu nào của đối tượng
        const early = o.pay[0].ym <= addYm(firstYm, 1) || !rev.length, v = o.paid;
        F('REV_MISSING', early ? 'L' : v >= 1000 ? 'H' : 'M', o, o.pay.at(-1), early ? `Thu ${fmt(v)} (${o.pay.length} lần) nhưng chưa thấy doanh thu ghi Nợ ${a} – ${rev.length ? 'có thể phát sinh trước kỳ dữ liệu (cần số dư đầu kỳ)' : 'dữ liệu chưa có bút toán ghi nhận doanh thu'}`
          : `Thu ${fmt(v)} (${o.pay.length} lần) nhưng đối tượng chưa có doanh thu / phải thu – nghi ghi thiếu doanh thu hoặc ghi doanh thu cho đối tượng khác`);
      } else if (o.bal < -0.5) F('CREDIT_BAL', 'M', o, null, `Dư Có ${fmt(-o.bal)} – thu nhiều hơn phải thu`);
    }
    // Mức rủi ro đối tượng
    const sevW = { H: 3, M: 1, L: 0 };
    for (const o of P.values()) {
      const fl = flags.filter(f => f.p === o.p), score = fl.reduce((t, f) => t + sevW[f.sev], 0) + (o.od90 > 0 ? 2 : 0) + (o.maxAge > 365 ? 2 : 0) + (o.bal < -0.5 ? 1 : 0);
      o.flagN = fl.length; o.flagH = fl.filter(f => f.sev === 'H').length;
      o.risk = score >= 4 || o.flagH ? 'H' : score >= 2 || o.overdue > 0 ? 'M' : 'L';
    }
    const list = [...P.values()].map(o => ({ p: o.p, name: o.name, generic: o.generic, nRev: o.rev.filter(r => r.amt > 0).length, nPay: o.pay.length, rev: o.revTot, adj: o.adj, paid: o.paid, bal: o.bal, unalloc: o.unalloc,
      b: o.b, overdue: o.overdue, od90: o.od90, maxAge: o.maxAge, lastRev: o.lastRev, lastPay: o.lastPay, risk: o.risk, flagN: o.flagN, flagH: o.flagH }))
      .sort((x, y) => 'HML'.indexOf(x.risk) - 'HML'.indexOf(y.risk) || y.od90 - x.od90 || Math.abs(y.bal) - Math.abs(x.bal));
    const sum = k => list.reduce((t, o) => t + o[k], 0);
    const accName = (rev[0] && rev[0].drName) || (pay[0] && pay[0].crName) || a;
    flags.sort((x, y) => 'HML'.indexOf(x.sev) - 'HML'.indexOf(y.sev) || Math.abs(y.amt || 0) - Math.abs(x.amt || 0));
    return { acc: a, accName, asOf, term, firstYm, noRevenue: !rev.length, buckets: BUCKETS.map(b => b[1]), summary: { partners: list.length, rev: sum('rev'), paid: sum('paid'), adj: sum('adj'), bal: sum('bal'), overdue: sum('overdue'), od90: sum('od90'),
      b: BUCKETS.map((_, i) => list.reduce((t, o) => t + o.b[i], 0)), high: list.filter(o => o.risk === 'H').length, nRev: rev.length, nPay: pay.length }, partners: list, flags, _P: P };
  }
  // Chi tiết một đối tượng: từng khoản doanh thu (đã thu bởi chứng từ nào, còn nợ, quá hạn) và từng lần thu tiền (trừ cho doanh thu nào)
  function detail(acc, p, asOf, term = 30) {
    const r = analyze(acc, asOf, term), o = r._P.get(p); if (!o) return null;
    const pick = x => ({ id: x.id, doc: x.doc, d: x.d, due: x.dueD, ds: x.ds, amt: x.amt, open: x.open, left: x.left, age: x.age, refs: x.refs, per: x.per, u: x.u, alloc: x.alloc });
    return { acc: r.acc, asOf: r.asOf, p, name: o.name, rev: o.rev.map(pick), pay: o.pay.map(pick), flags: r.flags.filter(f => f.p === p), partner: r.partners.find(x => x.p === p) };
  }
  const pub = (acc, asOf, term) => { const r = analyze(acc, asOf, term); delete r._P; return r; };
  return { analyze: pub, detail };
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function addYm(m, n) { if (!m) return m; let y = +m.slice(0, 4), mo = +m.slice(5) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return `${y}-${String(mo + 1).padStart(2, '0')}`; }
const fmt = v => (Math.round(v * 100) / 100).toLocaleString('en-US');
module.exports = { make, refs, words };
