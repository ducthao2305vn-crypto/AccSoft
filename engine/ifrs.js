'use strict';
// Báo cáo tài chính theo IFRS (mô hình theo file "Viettel Timor Financial Statement"): bảng cân đối thử (TB) → phân tài khoản vào chỉ tiêu IFRS
// (bảng quy tắc sửa được, mặc định theo sheet TB) → bút toán điều chỉnh IFRS theo năm (như sheet "JE") → SOFP, SOPL, SOCF (gián tiếp), SOCE, Notes.
// Số dư cuối năm đọc từ fin_close; TK công nợ lưỡng tính tách dư Nợ / dư Có theo từng đối tượng (fin_pmv); phát sinh năm bỏ bút toán kết chuyển 911.
const LINES = [ // k, tên, nhóm, dấu (+1 tài sản = dư Nợ; −1 nợ phải trả / vốn = dư Có)
  ['cash', 'Cash', 'AC', 1], ['tdep', 'Term Deposit', 'AC', 1], ['recv', 'Trade and other receivables', 'AC', 1], ['inv', 'Inventories', 'AC', 1], ['oca', 'Other assets', 'AC', 1],
  ['ppe', 'Property, plant and equipment', 'AN', 1], ['intg', 'Intangible assets', 'AN', 1], ['rou', 'Right of use assets', 'AN', 1], ['invsub', 'Investment in subsidiary', 'AN', 1], ['loansub', 'Loan to Subsidiary', 'AN', 1], ['onca', 'Other assets', 'AN', 1],
  ['pay', 'Trade and other payables', 'LC', -1], ['sal', 'Employee salaries', 'LC', -1], ['tax', 'Taxes payables', 'LC', -1], ['leaseS', 'Lease liabilities', 'LC', -1], ['div', 'Dividend payable', 'LC', -1], ['borS', 'Borrowings', 'LC', -1], ['welf', 'Reward Welfare Fund', 'LC', -1],
  ['payL', 'Trade and other payables', 'LN', -1], ['leaseL', 'Lease liabilities', 'LN', -1], ['dtl', 'Deferred tax liability', 'LN', -1], ['borL', 'Borrowings', 'LN', -1],
  ['cap', 'Equity', 'EQ', -1], ['res', 'Legal Reserves', 'EQ', -1], ['re', 'Retained earnings', 'EQ', -1],
];
const GROUPS = { AC: 'Current assets', AN: 'Non-current assets', LC: 'Current liabilities', LN: 'Non-current liabilities', EQ: 'Equity' };
// quy tắc mặc định (theo sheet TB của file 2025): [chỉ tiêu, đầu TK, dư (dr / cr / '' = mọi)] – khớp đầu TK dài nhất
const RULES = [
  ['cash', '111'], ['cash', '112'], ['cash', '113'], ['tdep', '128'],
  ['recv', '131', 'dr'], ['recv', '133'], ['recv', '136', 'dr'], ['recv', '138', 'dr'], ['recv', '2293'], ['recv', '333', 'dr'], ['recv', '331', 'dr'],
  ['inv', '151'], ['inv', '152'], ['inv', '153'], ['inv', '154'], ['inv', '155'], ['inv', '156'], ['inv', '157'], ['inv', '158'], ['inv', '1412'], ['inv', '2294'],
  ['oca', '141'], ['oca', '242'], ['oca', '244'],
  ['ppe', '211'], ['ppe', '2141'], ['ppe', '2142'], ['ppe', '241'], ['intg', '213'], ['intg', '2143'], ['rou', '2138'], ['invsub', '221'], ['invsub', '222'], ['invsub', '228'],
  ['pay', '331', 'cr'], ['pay', '131', 'cr'], ['pay', '138', 'cr'], ['pay', '136', 'cr'], ['pay', '335'], ['pay', '336'], ['pay', '338'], ['pay', '344'], ['pay', '3387'],
  ['sal', '334'], ['tax', '333', 'cr'], ['div', '33882'], ['borS', '341'], ['welf', '353'], ['dtl', '347'], ['dtl', '243'],
  ['cap', '411'], ['res', '414'], ['res', '417'], ['res', '418'], ['re', '421'], ['re', '5'], ['re', '6'], ['re', '7'], ['re', '8'], ['re', '9'], // TK kết quả chưa kết chuyển → lợi nhuận chưa phân phối
];
const PL = [ // chỉ tiêu SOPL: [k, tên, TK, dấu (+1 = thu nhập: Có − Nợ; −1 = chi phí)]
  ['rev', 'Revenue', ['511', '521'], 1], ['cos', 'Cost of sales', ['632'], -1], ['fini', 'Finance income', ['515'], 1], ['othi', 'Other income', ['711'], 1],
  ['sell', 'Selling and distribution expenses', ['641'], -1], ['adm', 'Administrative expenses', ['642'], -1], ['finc', 'Finance costs', ['635'], -1], ['othe', 'Other expenses', ['811'], -1],
  ['ctax', 'Current income tax', ['8211'], -1], ['dtax', 'Deferred income tax', ['8212'], -1],
];
const CFG = { ltAccs: ['3311', '33888'], split: ['131', '331', '138'], cash: ['111', '112', '113'], dep: ['2141', '2142'], amort: ['2143'], invProv: ['2294'], ecl: ['2293'], cit: ['3334'], welf: ['353'], divPay: ['3388', '421'],
  capex: ['211', '241'], capexI: ['213'], lease: [], loan: ['341'], tdep: ['128'] };
const isP = (a, L) => (L || []).some(p => String(a || '').startsWith(p));

function make(db, all, FIN, DTX) {
  const get = k => { const r = all(`SELECT v FROM settings WHERE k=?`, k)[0]; try { return r && r.v ? JSON.parse(r.v) : null; } catch { return null; } };
  const put = (k, v) => db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)`).run(k, JSON.stringify(v));
  const rules = () => get('ifrs_rules') || RULES.map(r => ({ line: r[0], pre: r[1], side: r[2] || '' }));
  const setRules = L => { put('ifrs_rules', (L || []).filter(r => r && r.line && r.pre).map(r => ({ line: r.line, pre: String(r.pre).trim(), side: r.side || '' }))); return rules(); };
  const resetRules = () => { db.prepare(`DELETE FROM settings WHERE k='ifrs_rules'`).run(); return rules(); };
  const cfg = () => ({ ...CFG, ...(get('ifrs_cfg') || {}) });
  const setCfg = o => { const c = { ...cfg() }; for (const k of Object.keys(CFG)) if (o && o[k] != null) c[k] = Array.isArray(o[k]) ? o[k] : String(o[k]).split(/[,; ]+/).filter(Boolean); put('ifrs_cfg', c); return c; };
  // bút toán điều chỉnh IFRS theo năm: [{dr, cr, a, n}] – cộng vào số dư cuối năm và phát sinh năm (không sửa dữ liệu gốc)
  const jeOf = y => get('ifrs_je_' + y) || [];
  const setJe = (y, L) => { put('ifrs_je_' + y, (L || []).filter(x => x && (x.dr || x.cr)).map(x => ({ dr: String(x.dr || '').trim(), cr: String(x.cr || '').trim(), a: +x.a || 0, n: String(x.n || '') }))); return jeOf(y); };
  // thông tin chung báo cáo (tên công ty, người lập …) và điều chỉnh tay dòng tiền theo năm
  const meta = () => ({ company: 'VIETTEL TIMOR UNIPESSOAL LDA', preparer: '', chief: '', director: '', ...(get('ifrs_meta') || {}) });
  const setMeta = o => { put('ifrs_meta', { ...meta(), ...(o || {}) }); return meta(); };
  // Phân loại ngắn hạn / dài hạn theo đối tượng (TK trong cfg.ltAccs): {'TK|đối tượng': {lt: số dài hạn (dương), kind: 'pay' | 'lease' | 'bor'}}
  const ltOf = y => get('ifrs_lt_' + y) || {};
  const setLt = (y, key, o) => { const m = ltOf(y); if (!o || (!(+o.lt) && !o.kind)) delete m[key]; else m[key] = { lt: +o.lt || 0, kind: o.kind || 'pay' }; put('ifrs_lt_' + y, m); return m; };
  const copyLt = (from, to) => { put('ifrs_lt_' + to, { ...ltOf(from) }); return ltOf(to); };
  const cfAdjOf = y => get('ifrs_cfadj_' + y) || {};
  const setCfAdj = (y, o) => { put('ifrs_cfadj_' + y, { ...cfAdjOf(y), ...(o || {}) }); return cfAdjOf(y); };

  function classify(R) { const L = [...R].sort((a, b) => b.pre.length - a.pre.length); return (acc, v) => { const side = v >= 0 ? 'dr' : 'cr';
    const r = L.find(r => String(acc).startsWith(r.pre) && (!r.side || r.side === side)); return r ? r.line : null; }; }
  // SOFP = cộng các dòng TB theo chỉ tiêu (TB là nguồn duy nhất)
  function sofp(y) { const T = tb(y), accs = [], un = [];
    for (const r of T.rows) { if (!r.lv || Math.abs(r.adj) < 0.004) continue; if (!r.line) { un.push({ acc: r.par || r.acc, v: r.adj, n: r.n }); continue; }
      for (const x of (r.parts || [{ line: r.line, v: r.adj }])) accs.push({ acc: r.par || r.acc, part: r.lv === 2 ? r.acc : '', v: x.v, line: x.line, shown: LINES.find(z => z[0] === x.line)[3] * x.v, je: 0 }); }
    return { L: T.byLine, accs, un, T }; }
  // phát sinh năm theo cặp TK Nợ / Có (bỏ kết chuyển 911) + bút toán điều chỉnh
  function pairs(y) { const P = all(`SELECT acc_debit d, acc_credit c, sum(amount) a FROM entries WHERE ym>=? AND ym<=? AND acc_debit NOT LIKE '911%' AND acc_credit NOT LIKE '911%' GROUP BY 1,2`, `${y}-01`, `${y}-12`);
    for (const j of jeOf(y)) P.push({ d: j.dr, c: j.cr, a: +j.a, je: 1 }); return P; }
  const S = (P, f) => P.reduce((s, r) => s + (f(r.d || '', r.c || '') ? r.a : 0), 0);
  function sopl(P) { const L = {}; for (const [k, , A, sg] of PL) L[k] = sg > 0 ? S(P, (d, c) => isP(c, A)) - S(P, (d, c) => isP(d, A)) : -(S(P, (d, c) => isP(d, A)) - S(P, (d, c) => isP(c, A)));
    L.gp = L.rev + L.cos; L.pbt = L.gp + L.fini + L.othi + L.sell + L.adm + L.finc + L.othe; L.tax = L.ctax + L.dtax; L.pat = L.pbt + L.tax; return L; }

  function build(y) {
    y = +y; const C = cfg(), F1 = sofp(y), F0 = sofp(y - 1), P = pairs(y), P0 = pairs(y - 1), I = sopl(P), I0 = sopl(P0);
    const bal = (y2, L) => { const m = FIN.closeAt(`${y2}-12`); let s = 0; for (const [a, v] of m) if (isP(a, L)) s += v; for (const j of jeOf(y2)) { if (isP(j.dr, L)) s += +j.a; if (isP(j.cr, L)) s -= +j.a; } return s; };
    const isPLacc = a => /^[5-8]/.test(a || '');
    // ---- SOCF gián tiếp
    const A = cfAdjOf(y), d = k => F1.L[k] - F0.L[k];
    const dep = S(P, (dd, c) => isP(c, C.dep) && isPLacc(dd)) - S(P, (dd, c) => isP(dd, C.dep) && isPLacc(c));
    const amort = S(P, (dd, c) => isP(c, C.amort) && isPLacc(dd)) - S(P, (dd, c) => isP(dd, C.amort) && isPLacc(c));
    const invProv = S(P, (dd, c) => isP(c, C.invProv) && isPLacc(dd)) - S(P, (dd, c) => isP(dd, C.invProv) && isPLacc(c));
    const ecl = S(P, (dd, c) => isP(c, C.ecl) && isPLacc(dd)) - S(P, (dd, c) => isP(dd, C.ecl) && isPLacc(c));
    const isCash = a => isP(a, C.cash);
    const taxPaid = S(P, (dd, c) => isP(dd, C.cit) && isCash(c)) - S(P, (dd, c) => isP(c, C.cit) && isCash(dd));
    const welfPaid = S(P, (dd, c) => isP(dd, C.welf) && isCash(c));
    const capex = S(P, (dd, c) => isP(dd, C.capex) && isCash(c)) + (+A.capexVia331 || 0), capexI = S(P, (dd, c) => isP(dd, C.capexI) && isCash(c)) + (+A.capexIVia331 || 0);
    const divPaid = S(P, (dd, c) => isP(dd, C.divPay) && isCash(c)), leasePaid = C.lease.length ? S(P, (dd, c) => isP(dd, C.lease) && isCash(c)) : (+A.leasePaid || 0);
    const loanNet = S(P, (dd, c) => isCash(dd) && isP(c, C.loan)) - S(P, (dd, c) => isP(dd, C.loan) && isCash(c));
    const proceeds = +A.proceeds || 0, gain = +A.gain || 0;
    const citMov = -(bal(y, C.cit) - bal(y - 1, C.cit)); // tăng thuế TNDN phải nộp (dư Có)
    const op = [
      ['Profit before tax for the year', I.pbt], ['Adjustments:', null],
      ['Interest and finance expense', -I.finc], ['Depreciation of property, plant and equipment and right of use assets', dep], ['Amortisation of intangible assets', amort],
      ['Gain on disposal of property, plant and equipment', -gain], ['Provision/(reversal) of inventories', invProv], ['(Increase)/reversal of expected credit loss', ecl],
    ];
    const opSub = op.reduce((s, x) => s + (x[1] || 0), 0);
    const wc = [['(Increase)/decrease in trade receivables', -d('recv') - ecl], ['(Increase)/decrease in inventories', -d('inv') - invProv], ['Decrease/(increase) in prepayments, deposits and other assets', -d('oca') - d('onca')],
      ['Increase/(decrease) in trade and other payables', d('pay') + d('payL') + d('sal') + (d('tax') - citMov) - (+A.capexVia331 || 0) - (+A.capexIVia331 || 0)]];
    const wcSub = opSub + wc.reduce((s, x) => s + x[1], 0);
    const opTail = [['Income tax paid', -taxPaid], ['Reward welfare fund distributions', -welfPaid]];
    const inv = [['Purchases of property, plant and equipment', -capex], ['Purchases of intangible assets', -capexI], ['(Payment)/withdrawal of term deposits', -d('tdep')], ['Lending to subsidiaries', -d('loansub')]];
    const fin = [['Proceeds from property, plant and equipment disposal', proceeds], ['Dividend paid', -divPaid], ['Loans received/(repaid)', loanNet], ['Repayment of lease liabilities', -leasePaid]];
    const sum = L => L.reduce((s, x) => s + (x[1] || 0), 0);
    const netOp0 = wcSub + sum(opTail), netInv = sum(inv), netFin = sum(fin), dCash = d('cash');
    const other = dCash - (netOp0 + netInv + netFin); // phần chưa phân loại được (dồn vào hoạt động kinh doanh, hiển thị riêng để rà soát)
    const cf = { op, opSub, wc, wcSub, opTail, other, netOp: netOp0 + other, inv, netInv, fin, netFin, net: dCash, open: F0.L.cash, close: F1.L.cash };
    // ---- SOCE
    const divDecl = S(P, (dd, c) => isP(dd, ['421']) && !isP(c, ['421', '911']) && !isP(c, C.welf)), toWelf = S(P, (dd, c) => isP(dd, ['421']) && isP(c, C.welf));
    const eq = k => ({ cap: F0.L.cap, res: F0.L.res, re: F0.L.re })[k];
    const socE = { open: { cap: F0.L.cap, res: F0.L.res, re: F0.L.re }, profit: I.pat, div: -divDecl, welf: -toWelf,
      close: { cap: F1.L.cap, res: F1.L.res, re: F1.L.re } };
    socE.other = { cap: socE.close.cap - socE.open.cap, res: socE.close.res - socE.open.res, re: socE.close.re - socE.open.re - I.pat + divDecl + toWelf };
    // ---- Notes
    const accName = new Map(all(`SELECT acc, max(name) n FROM fin_mv GROUP BY acc`).map(r => [r.acc, r.n]));
    const noteOf = k => { const g = new Map(); for (const [F, col] of [[F1, 'y'], [F0, 'p']]) for (const a of F.accs.filter(x => x.line === k)) { const key = a.acc + (a.part ? (a.v >= 0 ? ' (dư Nợ)' : ' (dư Có)') : '');
      const o = g.get(key) || g.set(key, { acc: key, n: a.je ? 'Bút toán điều chỉnh IFRS' : (accName.get(a.acc) || ''), y: 0, p: 0 }).get(key); o[col] += a.shown; } return [...g.values()].filter(x => Math.abs(x.y) + Math.abs(x.p) > 0.004).sort((a, b) => a.acc.localeCompare(b.acc)); };
    const mvt = (cost, dep) => { // biến động TSCĐ: nguyên giá & hao mòn
      const op = bal(y - 1, cost), cl = bal(y, cost), add = S(P, (dd, c) => isP(dd, cost) && !isP(c, cost)), dis = S(P, (dd, c) => isP(c, cost) && !isP(dd, cost));
      const dop = -bal(y - 1, dep), dcl = -bal(y, dep), chg = S(P, (dd, c) => isP(c, dep) && !isP(dd, dep)), ddis = S(P, (dd, c) => isP(dd, dep) && !isP(c, dep));
      return { op, add, dis, cl, dop, chg, ddis, dcl, nbvO: op - dop, nbvC: cl - dcl }; };
    let dt = null; try { const r = DTX.compute(y); dt = { rows: r.d1.rows.map(x => ({ n: x.n, carry: x.carry, base: x.base, td: x.td, dt: x.dt, p: (r.d0.rows.find(z => z.n === x.n) || {}).dt || 0 })), net: r.d1.net, prior: r.d0.net, cur: r.cur.tax, rate: r.cfg.rate }; } catch { }
    const revDet = all(`SELECT coalesce(e.sales_region, e.type_of_revenue, e.acc_credit) k, sum(CASE WHEN e.acc_credit GLOB '511*' THEN e.amount ELSE 0 END) - sum(CASE WHEN e.acc_debit GLOB '511*' THEN e.amount ELSE 0 END) v
      FROM entries e WHERE e.ym>=? AND e.ym<=? AND (e.acc_credit GLOB '511*' OR e.acc_debit GLOB '511*') AND e.acc_debit NOT LIKE '911%' AND e.acc_credit NOT LIKE '911%' GROUP BY 1 HAVING abs(v)>0.004 ORDER BY v DESC`, `${y}-01`, `${y}-12`);
    const notes = { cash: noteOf('cash'), tdep: noteOf('tdep'), recv: noteOf('recv'), inv: noteOf('inv'), oca: [...noteOf('oca'), ...noteOf('onca')], pay: [...noteOf('pay'), ...noteOf('payL')], tax: noteOf('tax'), sal: noteOf('sal'),
      ppe: mvt(['211'], C.dep), intg: mvt(['213'].filter(Boolean), C.amort), cip: { op: bal(y - 1, ['241']), cl: bal(y, ['241']) }, dt, rev: revDet,
      taxRec: { pbt: I.pbt, rate: dt ? dt.rate : 0.1, cur: -I.ctax, def: -I.dtax } };
    const tot = (F, g) => LINES.filter(x => x[2] === g).reduce((s, x) => s + F.L[x[0]], 0);
    const chk = (F) => tot(F, 'AC') + tot(F, 'AN') - (tot(F, 'LC') + tot(F, 'LN') + tot(F, 'EQ'));
    return { year: y, meta: meta(), lines: LINES, groups: GROUPS, plLines: PL, cur: F1.L, prior: F0.L, unmapped: F1.un.concat(F0.un.map(x => ({ ...x, prior: 1 }))), I, I0, cf, socE, notes, je: jeOf(y), cfAdj: A,
      check: { y: chk(F1), p: chk(F0) }, tb: F1.T };
  }
  // Bảng cân đối thử chi tiết (như sheet TB của file mẫu): TK chi tiết (+ từng đối tượng với TK tách dư Nợ/Có), đầu kỳ, phát sinh, cuối kỳ,
  // bút toán điều chỉnh IFRS, cuối kỳ sau điều chỉnh, chỉ tiêu IFRS được phân vào. Tổng các dòng theo chỉ tiêu = số trên SOFP.
  function tb(y) { y = +y; const C = cfg(), cl = classify(rules()), f = `${y}-01`, t = `${y}-12`, T = FIN.trial(f, t, 0), split = new Set([...C.split, ...(C.ltAccs || []).map(a => a.slice(0, 3))]), out = [], LT = ltOf(y);
    const nm = new Map(all(`SELECT acc, max(name) n FROM fin_mv GROUP BY acc`).map(r => [r.acc, r.n]));
    const je = new Map(); for (const j of jeOf(y)) { if (j.dr) { const o = je.get(j.dr) || je.set(j.dr, { dr: 0, cr: 0 }).get(j.dr); o.dr += +j.a; } if (j.cr) { const o = je.get(j.cr) || je.set(j.cr, { dr: 0, cr: 0 }).get(j.cr); o.cr += +j.a; } }
    const row = (lv, acc, par, name, ob, dr, cr, jd, jc) => { const cb = ob + dr - cr, adj = cb + jd - jc; return { lv, acc, par, n: name, ob, dr, cr, cb, jd, jc, adj, line: lv ? cl(par || acc, adj) : null }; };
    // đối tượng của TK tách: đầu kỳ (fin_pmv trước năm), phát sinh Nợ / Có trong năm (bút toán)
    const pOpen = new Map(), pMv = new Map();
    if (split.size) { const L = [...split], q = L.map(() => '?').join(',');
      for (const r of all(`SELECT acc_debit a, coalesce(partner_debit,'(không đối tượng)') p, sum(amount) v FROM entries WHERE ym<? AND substr(acc_debit,1,3) IN (${q}) GROUP BY 1,2`, f, ...L)) pOpen.set(r.a + '|' + r.p, (pOpen.get(r.a + '|' + r.p) || 0) + r.v);
      for (const r of all(`SELECT acc_credit a, coalesce(partner_credit,'(không đối tượng)') p, sum(amount) v FROM entries WHERE ym<? AND substr(acc_credit,1,3) IN (${q}) GROUP BY 1,2`, f, ...L)) pOpen.set(r.a + '|' + r.p, (pOpen.get(r.a + '|' + r.p) || 0) - r.v);
      for (const r of all(`SELECT acc_debit a, coalesce(partner_debit,'(không đối tượng)') p, sum(amount) v FROM entries WHERE ym>=? AND ym<=? AND substr(acc_debit,1,3) IN (${q}) GROUP BY 1,2`, f, t, ...L)) { const k = r.a + '|' + r.p, o = pMv.get(k) || pMv.set(k, { dr: 0, cr: 0 }).get(k); o.dr += r.v; }
      for (const r of all(`SELECT acc_credit a, coalesce(partner_credit,'(không đối tượng)') p, sum(amount) v FROM entries WHERE ym>=? AND ym<=? AND substr(acc_credit,1,3) IN (${q}) GROUP BY 1,2`, f, t, ...L)) { const k = r.a + '|' + r.p, o = pMv.get(k) || pMv.set(k, { dr: 0, cr: 0 }).get(k); o.cr += r.v; } }
    for (const a of T.rows) { const ob = (a.obDr || 0) - (a.obCr || 0), j = je.get(a.a) || { dr: 0, cr: 0 }; je.delete(a.a);
      const head = row(0, a.a, '', nm.get(a.a) || a.n || '', ob, a.dr, a.cr, j.dr, j.cr);
      if (!split.has(a.a.slice(0, 3))) { head.lv = 1; head.line = cl(a.a, head.adj); out.push(head); continue; }
      out.push(head); // TK tách: dòng tổng TK + từng đối tượng (đầu kỳ đối tượng phân theo TK chi tiết theo phát sinh – fin_pmv chỉ có 3 số)
      const keys = new Set([...pMv.keys(), ...pOpen.keys()].filter(k => k.split('|')[0] === a.a)), parts = [];
      for (const k of keys) { const v = pMv.get(k) || { dr: 0, cr: 0 }; parts.push({ p: k.slice(k.indexOf('|') + 1), po: pOpen.get(k) || 0, dr: v.dr, cr: v.cr }); }
      let sumOb = 0; for (const x of parts) { sumOb += x.po; const r = row(2, x.p, a.a, x.p, x.po, x.dr, x.cr, 0, 0); if (Math.abs(r.ob) + Math.abs(r.dr) + Math.abs(r.cr) > 0.004) out.push(r); }
      const rest = row(2, '(chênh lệch đầu kỳ / chưa tách đối tượng)', a.a, 'Số dư không gắn đối tượng', ob - sumOb, a.dr - parts.reduce((s, x) => s + x.dr, 0), a.cr - parts.reduce((s, x) => s + x.cr, 0), j.dr, j.cr);
      if (Math.abs(rest.ob) + Math.abs(rest.dr) + Math.abs(rest.cr) + Math.abs(rest.jd) + Math.abs(rest.jc) > 0.004) out.push(rest); }
    for (const [a, j] of je) out.push(row(1, a, '', 'Bút toán điều chỉnh IFRS (TK không có số dư)', 0, 0, 0, j.dr, j.cr));
    const ST = { lease: 'leaseS', bor: 'borS' }, LTL = { pay: 'payL', lease: 'leaseL', bor: 'borL' };
    for (const r of out) { if (r.lv !== 2 || !isP(r.par, C.ltAccs)) continue; const o = LT[r.par + '|' + r.acc]; if (!o) continue;
      const lt = r.adj < 0 ? Math.min(Math.abs(r.adj), Math.max(0, +o.lt || 0)) : 0, stLine = ST[o.kind] || r.line; // phần dài hạn không vượt số dư Có
      r.parts = [{ line: stLine, v: r.adj + lt }, { line: LTL[o.kind] || 'payL', v: -lt }].filter(x => Math.abs(x.v) > 0.004); r.lt = lt; r.kind = o.kind; r.line = stLine; }
    const L = {}; for (const k of LINES) L[k[0]] = 0; for (const r of out) if (r.lv) for (const x of (r.parts || (r.line ? [{ line: r.line, v: r.adj }] : []))) L[x.line] += LINES.find(z => z[0] === x.line)[3] * x.v;
    return { year: y, rows: out, lines: LINES, byLine: L, tot: out.filter(r => r.lv).reduce((s, r) => { for (const k of ['ob', 'dr', 'cr', 'cb', 'jd', 'jc', 'adj']) s[k] += r[k]; return s; }, { ob: 0, dr: 0, cr: 0, cb: 0, jd: 0, jc: 0, adj: 0 }) };
  }
  function ltList(y) { y = +y; const C = cfg(), T = tb(y), LT = ltOf(y), P = ltOf(y - 1);
    return T.rows.filter(r => r.lv === 2 && isP(r.par, C.ltAccs) && r.adj < -0.004).map(r => { const k = r.par + '|' + r.acc, o = LT[k] || {};
      return { key: k, acc: r.par, bp: r.acc, bal: -r.adj, lt: r.lt || 0, kind: o.kind || r.kind || (isP(r.par, ['33888']) ? 'lease' : 'pay'), set: !!LT[k], prevLt: (P[k] || {}).lt || 0 }; }).sort((a, b) => b.bal - a.bal); }
  const years = () => all(`SELECT DISTINCT substr(ym,1,4) y FROM entries WHERE ym IS NOT NULL ORDER BY 1`).map(r => +r.y);
  return { build, tb, ltList, setLt, copyLt, years, rules, setRules, resetRules, cfg, setCfg, jeOf, setJe, meta, setMeta, setCfAdj, LINES };
}
module.exports = { make, LINES, RULES };
