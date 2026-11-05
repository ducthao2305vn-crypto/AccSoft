'use strict';
// Đối chiếu doanh thu theo hóa đơn (file báo cáo thu cước theo hóa đơn) với ghi nhận ERP TK 138812, theo tháng × đối tượng ERP.
// Danh mục khách hàng (sheet DMKH): Account chuẩn hoá ↔ Code ERP (người dùng map / sửa trong phần mềm).
// Hóa đơn (sheet TH_1): Pay date, Subscriber (account), Total amount, Invoice no, Year_month_Cuoc (kỳ cước)…
const codeOf = p => { const m = String(p || '').match(/^([A-Za-z]+_(?:[A-Za-z]+_)?[A-Za-z]*\d+)/); return m ? m[1].toUpperCase() : String(p || '').toUpperCase(); };

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS inv_cust(acc TEXT PRIMARY KEY, name TEXT, bw TEXT, price REAL, fee REAL, erp_code TEXT, erp_name TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS inv_line(pay_date TEXT, ym_pay TEXT, ym_bill TEXT, contract TEXT, acc TEXT, cust TEXT, amt_notax REAL, amt_tax REAL, total REAL, invoice TEXT, collection TEXT, staff TEXT, service TEXT, src TEXT, UNIQUE(invoice, acc, pay_date, total));
    CREATE INDEX IF NOT EXISTS ix_inv_line_acc ON inv_line(acc);
    CREATE TABLE IF NOT EXISTS inv_issue(issue_date TEXT, ym TEXT, ym_bill TEXT, acc TEXT, cust TEXT, contract TEXT, invoice TEXT, service TEXT, amt_notax REAL, amt_tax REAL, total REAL, src TEXT, UNIQUE(invoice, acc, ym, total));
    CREATE INDEX IF NOT EXISTS ix_inv_issue_acc ON inv_issue(acc)`);
  for (const c of ['kind TEXT', 'shop TEXT', 'staff TEXT', 'txtype TEXT']) { try { db.exec(`ALTER TABLE inv_issue ADD COLUMN ${c}`); } catch { } }
  try { db.exec(`UPDATE inv_issue SET kind='cuoc' WHERE kind IS NULL`); } catch { }
  const s = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim(), num = v => { const n = typeof v === 'number' ? v : +String(v || '').replace(/,/g, ''); return Number.isFinite(n) ? n : 0; };
  const dmy = v => { if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10); if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const m = s(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s(v).slice(0, 10); };
  const ymOf = v => { const t = s(v), m = t.match(/^(\d{4})[_\-\/.](\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, '0')}` : ''; };

  // Nạp workbook: sheets = { name: aoa }. Nhận sheet danh mục (có cột "Account" + "Code ERP") và sheet hóa đơn (có "Invoice no" + "Subscriber")
  function importBook(sheets, mode = 'merge', force = false) {
    // Chống nạp trùng: hóa đơn (số HĐ + account) đã có trong dữ liệu từ lần nạp trước → cảnh báo, KHÔNG nạp cả file
    const exL = new Set(all(`SELECT invoice||'|'||acc k FROM inv_line`).map(r => r.k)), exI = new Set(all(`SELECT invoice||'|'||acc k FROM inv_issue`).map(r => r.k)), dupEx = [];
    const chk = (set, inv, acc, info) => { if (set.has(inv + '|' + acc)) { dupEx.push(info); return true; } return false; };
    let nC = 0, nL = 0, dup = 0, nI = 0, dupI = 0, nB = 0, dupB = 0, sheetC = '', sheetL = '', sheetI = '', sheetB = '';
    db.exec('BEGIN'); try {
      if (mode === 'replace') { run(`DELETE FROM inv_line`); } if (mode === 'replaceIssue') run(`DELETE FROM inv_issue`);
      for (const [name, aoa] of Object.entries(sheets)) {
        const low = r => (r || []).map(c => s(c).toLowerCase());
        let h = aoa.findIndex(r => low(r).some(c => /account/.test(c)) && low(r).some(c => /code erp/.test(c)));
        if (h >= 0) { const H = low(aoa[h]), c = re => H.findIndex(x => re.test(x)); sheetC = name;
          const C = { name: c(/customer name|tên/), acc: c(/account/), bw: c(/bandwidth/), price: c(/unit price/), fee: c(/monthly fee/), code: c(/code erp/), ename: c(/name erp/) };
          for (const r of aoa.slice(h + 1)) { const acc = s(r[C.acc]).toLowerCase(); if (!acc || /^\d+$/.test(acc)) continue; const old = get(`SELECT * FROM inv_cust WHERE acc=?`, acc) || {};
            const code = s(r[C.code]) || old.erp_code || '', en = s(r[C.ename]) || old.erp_name || '';
            run(`INSERT OR REPLACE INTO inv_cust(acc, name, bw, price, fee, erp_code, erp_name, note, updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))`, acc, s(r[C.name]), s(r[C.bw]), num(r[C.price]), num(r[C.fee]), code.toUpperCase(), en, old.note || ''); nC++; }
          continue; }
        // Doanh thu bán hàng BCCS: cột Transaction code + Invoice no + After tax (+ Name of customer, Code ERP…)
        { const hb = aoa.findIndex(r => { const L = low(r); return L.includes('transaction code') && L.includes('invoice no') && L.some(c => /after tax/.test(c)); });
          if (hb >= 0) { const H = low(aoa[hb]), c = re => H.findIndex(x => re.test(x)); sheetB = name;
            const C = { txc: c(/^transaction code$/), shop: c(/^shop$/), st: c(/^staff$/), tt: c(/transaction type/), d: c(/date of creation|^date$/), bt: c(/before tax/), tx: c(/^tax$/), at: c(/after tax/), status: c(/^status$/), inv: c(/^invoice no$/), cust: c(/name of customer|customer/), isdn: c(/^isdn$/), con: c(/contract/), code: c(/^code erp$/), ename: c(/^mã erp$|name erp/), ym: c(/^năm_tháng$|^nam_thang$|year_month/), yy: c(/^năm$|^year$/), mm: c(/^tháng$|^month$/) };
            for (const r of aoa.slice(hb + 1)) { const inv = s(r[C.inv]), st = s(r[C.status]); if (!inv || /not created/i.test(st)) continue;
              const cust = s(r[C.cust]), code0 = s(r[C.code]).toUpperCase(), m = cust.match(/^([A-Za-z]+_(?:[A-Za-z]+_)?[A-Za-z]*\d+)\s*[-_]/), code = code0 || (m ? m[1].toUpperCase() : '');
              const acc = code ? 'erp:' + code.toLowerCase() : 'bccs:' + cust.toLowerCase().replace(/\s+/g, ' ').trim();
              const d = dmy(r[C.d]), tot = num(r[C.at]);
              // Tháng ghi nhận = tháng / năm trên hóa đơn (cột Năm_tháng hoặc Năm + Tháng), không phải ngày lập / ngày nạp
              const ymI = (C.ym >= 0 && ymOf(r[C.ym])) || (C.yy >= 0 && C.mm >= 0 && +r[C.yy] > 1990 && +r[C.mm] >= 1 && +r[C.mm] <= 12 ? `${+r[C.yy]}-${String(+r[C.mm]).padStart(2, '0')}` : '') || d.slice(0, 7);
              const invK = inv + (C.txc >= 0 && s(r[C.txc]) ? '#' + s(r[C.txc]) : ''); if (chk(exI, invK, acc, { sheet: name, kind: 'BCCS', invoice: inv, acc: cust, ym: ymI, amt: tot })) continue; run(`DELETE FROM inv_issue WHERE kind='bccs' AND invoice=? AND acc=? AND ym<>?`, invK, acc, ymI); // bản nạp cũ theo ngày lập → sửa theo tháng hóa đơn
              const x = run(`INSERT INTO inv_issue(issue_date, ym, ym_bill, acc, cust, contract, invoice, service, amt_notax, amt_tax, total, src, kind, shop, staff, txtype) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(invoice, acc, ym, total) DO NOTHING`,
                d, ymI, ymI, acc, cust, s(r[C.con]) || s(r[C.isdn]), inv + (C.txc >= 0 && s(r[C.txc]) ? '#' + s(r[C.txc]) : ''), s(r[C.tt]), num(r[C.bt]), num(r[C.tx]), tot, name, 'bccs', s(r[C.shop]), s(r[C.st]), s(r[C.tt]));
              if (x.changes) nB++; else dupB++;
              if (!get(`SELECT 1 x FROM inv_cust WHERE acc=?`, acc)) run(`INSERT INTO inv_cust(acc, name, erp_code, erp_name, note, updated_at) VALUES(?,?,?,?,?, datetime('now','localtime'))`, acc, cust, code, s(r[C.ename]), 'BCCS');
              else if (code) run(`UPDATE inv_cust SET erp_code=? WHERE acc=? AND (erp_code IS NULL OR erp_code='')`, code, acc); }
            continue; } }
        // Báo cáo PHÁT HÀNH hóa đơn: có cột số hóa đơn + account/subscriber + ngày phát hành / kỳ cước, KHÔNG có "Pay date"
        { const hi = aoa.findIndex(r => { const L = low(r); return L.some(c => /invoice|hóa đơn|hoa don/.test(c)) && L.some(c => /subscriber|account|thuê bao|isdn/.test(c)) && L.some(c => /issue|phát hành|invoice date|ngày hóa đơn|bill (cycle|month|period)|kỳ cước|cycle/.test(c)) && !L.some(c => /^pay date$/.test(c)); });
          if (hi >= 0 && (mode === 'issue' || !/pay/i.test(name))) { const H = low(aoa[hi]), c = re => H.findIndex(x => re.test(x)); sheetI = name;
            const C = { d: c(/issue date|ngày phát hành|invoice date|ngày hóa đơn|^date$|ngày/), cyc: c(/bill (cycle|month|period)|kỳ cước|cycle|year_month|bill_month/), acc: c(/subscriber|account|thuê bao|isdn/), cust: c(/customer|khách hàng|tên/), con: c(/contract|hợp đồng/), inv: c(/invoice no|số hóa đơn|invoice number|^invoice$|hóa đơn/), svc: c(/service|dịch vụ/),
              nt: c(/not tax|before tax|chưa thuế|trước thuế|amount excl/), tx: c(/^tax$|amount tax|tiền thuế|vat/), tot: c(/total|tổng tiền|thành tiền|amount with tax|^amount$/) };
            for (const r of aoa.slice(hi + 1)) { const acc = s(r[C.acc]).toLowerCase(), inv = s(r[C.inv]); if (!acc || !inv || /^\d+$/.test(acc) && acc.length < 3) continue;
              const d = dmy(r[C.d]), ymb = ymOf(r[C.cyc]) || (C.cyc >= 0 ? dmy(r[C.cyc]).slice(0, 7) : '') || d.slice(0, 7), tot = num(r[C.tot]) || (num(r[C.nt]) + num(r[C.tx]));
              if (!tot && !num(r[C.nt])) continue;
              if (chk(exI, inv, acc, { sheet: name, kind: 'Phát hành', invoice: inv, acc, ym: ymb, amt: tot })) continue;
              const x = run(`INSERT OR IGNORE INTO inv_issue(issue_date, ym, ym_bill, acc, cust, contract, invoice, service, amt_notax, amt_tax, total, src) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, d, (d || ymb).slice(0, 7), ymb, acc, s(r[C.cust]), s(r[C.con]), inv, s(r[C.svc]), num(r[C.nt]), num(r[C.tx]), tot, name); run(`UPDATE inv_issue SET kind='cuoc' WHERE kind IS NULL`);
              if (x.changes) nI++; else dupI++;
              if (!get(`SELECT 1 x FROM inv_cust WHERE acc=?`, acc)) run(`INSERT INTO inv_cust(acc, name, erp_code, updated_at) VALUES(?,?, '', datetime('now','localtime'))`, acc, s(r[C.cust])); }
            continue; } }
        h = aoa.findIndex(r => low(r).some(c => c === 'invoice no') && low(r).some(c => c === 'subscriber'));
        if (h >= 0) { const H = low(aoa[h]), c = re => H.findIndex(x => re.test(x)); sheetL = name;
          const C = { pd: c(/^pay date$/), con: c(/^contract no$/), acc: c(/^subscriber$/), cust: c(/^customer name$/), nt: c(/amount not tax/), at: c(/^amount tax$/), tot: c(/^total amount$/), inv: c(/^invoice no$/), col: c(/collection code/), st: c(/payment staff/), svc: c(/^service$/), ymb: c(/year_month/) };
          for (const r of aoa.slice(h + 1)) { if (typeof r[0] !== 'number' && !/^\d+$/.test(s(r[0]))) continue; const acc = s(r[C.acc]).toLowerCase(); if (!acc) continue;
            const pd = dmy(r[C.pd]), ymb = ymOf(r[C.ymb]) || pd.slice(0, 7);
            if (chk(exL, s(r[C.inv]), acc, { sheet: name, kind: 'Cước', invoice: s(r[C.inv]), acc, ym: ymb, amt: num(r[C.tot]) })) continue;
            const x = run(`INSERT OR IGNORE INTO inv_line(pay_date, ym_pay, ym_bill, contract, acc, cust, amt_notax, amt_tax, total, invoice, collection, staff, service, src) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              pd, pd.slice(0, 7), ymb, s(r[C.con]), acc, s(r[C.cust]), num(r[C.nt]), num(r[C.at]), num(r[C.tot]), s(r[C.inv]), s(r[C.col]), s(r[C.st]), s(r[C.svc]), name);
            if (x.changes) nL++; else dup++;
            if (!get(`SELECT 1 x FROM inv_cust WHERE acc=?`, acc)) run(`INSERT INTO inv_cust(acc, name, erp_code, updated_at) VALUES(?,?, '', datetime('now','localtime'))`, acc, s(r[C.cust])); }
        }
      }
      if (dupEx.length && !force) { db.exec('ROLLBACK'); return { blocked: true, nDup: dupEx.length, sample: dupEx.slice(0, 60), months: [...new Set(dupEx.map(d => d.ym))].sort(), kinds: [...new Set(dupEx.map(d => d.kind))] }; }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    if (!sheetC && !sheetL && !sheetI && !sheetB) throw new Error('Không thấy sheet danh mục (Account + Code ERP), sheet thu cước (Invoice no + Subscriber + Pay date) hoặc sheet phát hành hóa đơn (số hóa đơn + account + ngày phát hành / kỳ cước)');
    return { nC, nL, dup, nI, dupI, nB, dupB, sheetB, bccs: get(`SELECT count(*) n FROM inv_issue WHERE kind='bccs'`).n, sheetC, sheetL, sheetI, issues: get(`SELECT count(*) n FROM inv_issue`).n, cust: get(`SELECT count(*) n FROM inv_cust`).n, lines: get(`SELECT count(*) n FROM inv_line`).n };
  }

  // Đối tượng ERP của TK (mã + tên) để chọn khi map
  function erpPartners(acc = '138812') {
    const m = new Map();
    for (const r of all(`SELECT p, count(*) n FROM (SELECT partner_debit p FROM entries WHERE acc_debit=? UNION ALL SELECT partner_credit FROM entries WHERE acc_credit=?) WHERE p IS NOT NULL AND p<>'' GROUP BY 1`, acc, acc)) {
      const k = codeOf(r.p), o = m.get(k) || m.set(k, { code: k, name: String(r.p).slice(k.length).replace(/^[_\-\s]+/, ''), full: r.p, n: 0 }).get(k); o.n += r.n; }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }
  const STOP = new Set(['unip', 'lda', 'timor', 'leste', 'viettel', 'branch', 'company', 'ltd', 'limited', 'unipessoal', 'the', 'and', 'office', 'centre', 'center', 'national', 'nasional', 'block', 'dili', 'uni']);
  const nz = t => s(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function customers(o = {}) {
    const P = erpPartners(o.acc), byCode = new Map(P.map(p => [p.code, p])), C = all(`SELECT c.*, (SELECT count(*) FROM inv_line l WHERE l.acc=c.acc) n, (SELECT sum(total) FROM inv_line l WHERE l.acc=c.acc) amt, (SELECT max(pay_date) FROM inv_line l WHERE l.acc=c.acc) last FROM inv_cust c ORDER BY c.name`);
    const PN = P.map(p => ({ ...p, t: new Set(nz(p.name).split(' ').filter(w => w.length > 2 && !STOP.has(w))) }));
    for (const c of C) { c.erpName = c.erp_code ? ((byCode.get(c.erp_code) || {}).name || c.erp_name || '(không có trên ERP)') : '';
      if (!c.erp_code) { const t = nz(c.name).split(' ').filter(w => w.length > 2 && !STOP.has(w)); let best = null; for (const p of PN) { const hit = t.filter(w => p.t.has(w)).length; if (hit >= Math.min(2, t.length) && hit > 0 && (!best || hit > best.hit)) best = { hit, p }; } c.sug = best ? best.p.code : ''; c.sugName = best ? best.p.name : ''; } }
    let rows = C; const q = nz(o.q); if (q) rows = rows.filter(c => nz(c.acc + ' ' + c.name + ' ' + c.erp_code + ' ' + c.erpName).includes(q));
    if (o.only === 'unmapped') rows = rows.filter(c => !c.erp_code); else if (o.only === 'mapped') rows = rows.filter(c => c.erp_code);
    return { rows, partners: P.map(({ code, name, n }) => ({ code, name, n })), total: C.length, mapped: C.filter(c => c.erp_code).length };
  }
  function setMap(accs, code, name = '') { let n = 0; for (const a of [].concat(accs || [])) { n += run(`UPDATE inv_cust SET erp_code=?, erp_name=?, updated_at=datetime('now','localtime') WHERE acc=?`, s(code).toUpperCase(), name, a).changes; } return { n }; }

  // Đối chiếu theo tháng × đối tượng ERP. basis 'bill': hóa đơn theo kỳ cước ↔ Nợ 138812 (doanh thu); 'pay': theo ngày nộp ↔ Có 138812 (thu tiền)
  function compare(o = {}) {
    const acc = s(o.acc) || '138812', basis = ['pay', 'issue', 'issuecyc'].includes(o.basis) ? o.basis : 'bill', f = s(o.from), t = s(o.to), side = basis === 'pay' ? 'credit' : 'debit', TBL = basis.startsWith('issue') ? 'inv_issue' : 'inv_line';
    const map = new Map(all(`SELECT acc, erp_code FROM inv_cust`).map(r => [r.acc, r.erp_code || ''])), P = erpPartners(acc), pname = new Map(P.map(p => [p.code, p.name]));
    const ymCol = basis === 'pay' ? 'ym_pay' : basis === 'issue' ? 'ym' : 'ym_bill', W = [], A = []; if (f) { W.push(`${ymCol}>=?`); A.push(f); } if (t) { W.push(`${ymCol}<=?`); A.push(t); }
    const G = new Map(), cell = (k, ym) => { const g = G.get(k) || G.set(k, { key: k, accs: new Set(), m: {}, inv: 0, erp: 0 }).get(k); return g.m[ym] || (g.m[ym] = { inv: 0, erp: 0, nInv: 0, nErp: 0 }); };
    if (TBL === 'inv_issue' && o.src && o.src !== 'all') { W.push('kind=?'); A.push(o.src); }
    for (const r of all(`SELECT acc, ${ymCol} ym, sum(${o.notax ? 'amt_notax' : 'total'}) a, count(*) n FROM ${TBL} ${W.length ? 'WHERE ' + W.join(' AND ') : ''} GROUP BY 1,2`, ...A)) {
      const code = map.get(r.acc) || ('?' + r.acc), c = cell(code, r.ym); c.inv += r.a; c.nInv += r.n; G.get(code).accs.add(r.acc); }
    // Cước phát sinh (file thu cước theo hóa đơn – TH_1) cũng là doanh thu: gộp theo kỳ cước khi so doanh thu (nguồn 'all' / 'cuoc'), trừ khi đã có báo cáo phát hành cước riêng
    if (TBL === 'inv_issue' && (!o.src || o.src === 'all' || o.src === 'cuoc') && !get(`SELECT 1 x FROM inv_issue WHERE kind='cuoc' LIMIT 1`)) {
      const W2 = [], A2 = []; if (f) { W2.push('ym_bill>=?'); A2.push(f); } if (t) { W2.push('ym_bill<=?'); A2.push(t); }
      for (const r of all(`SELECT acc, ym_bill ym, sum(${o.notax ? 'amt_notax' : 'total'}) a, count(*) n FROM inv_line ${W2.length ? 'WHERE ' + W2.join(' AND ') : ''} GROUP BY 1,2`, ...A2)) {
        const code = map.get(r.acc) || ('?' + r.acc), c = cell(code, r.ym); c.inv += r.a; c.nInv += r.n; G.get(code).accs.add(r.acc); } }
    const WE = [], AE = []; if (f) { WE.push('ym>=?'); AE.push(f); } if (t) { WE.push('ym<=?'); AE.push(t); }
    for (const r of all(`SELECT partner_${side} p, ym, sum(amount) a, count(*) n FROM entries WHERE acc_${side}=? ${WE.length ? 'AND ' + WE.join(' AND ') : ''} GROUP BY 1,2`, acc, ...AE)) {
      const c = cell(codeOf(r.p), r.ym); c.erp += r.a; c.nErp += r.n; }
    // Doanh thu BCCS đối tượng BC19 ghi Nợ 138811 (cấu hình được): cộng thêm vào phía ERP
    const x11 = s(o.extra11 ?? 'BC19'); if (side === 'debit' && x11) for (const r of all(`SELECT partner_debit p, ym, sum(amount) a, count(*) n FROM entries WHERE acc_debit='138811' AND upper(partner_debit) LIKE ? ${WE.length ? 'AND ' + WE.join(' AND ') : ''} GROUP BY 1,2`, x11.toUpperCase() + '%', ...AE)) {
      const c = cell(codeOf(r.p), r.ym); c.erp += r.a; c.nErp += r.n; }
    const months = [...new Set([...G.values()].flatMap(g => Object.keys(g.m)))].sort();
    const rows = [...G.values()].map(g => { let inv = 0, erp = 0; for (const v of Object.values(g.m)) { inv += v.inv; erp += v.erp; }
      const unm = g.key.startsWith('?'), diffM = months.filter(m => g.m[m] && Math.abs(g.m[m].inv - g.m[m].erp) > 0.5).length;
      return { key: g.key, code: unm ? '' : g.key, name: unm ? (get(`SELECT name FROM inv_cust WHERE acc=?`, g.key.slice(1)) || {}).name || g.key.slice(1) : (pname.get(g.key) || (get(`SELECT erp_name FROM inv_cust WHERE erp_code=? AND erp_name<>'' LIMIT 1`, g.key) || {}).erp_name || ''),
        accs: [...g.accs], unmapped: unm, m: g.m, inv, erp, diff: inv - erp, diffM,
        status: unm ? 'unmapped' : Math.abs(inv - erp) <= 0.5 && !diffM ? 'ok' : !inv ? 'erp_only' : !erp ? 'inv_only' : 'diff' }; });
    // Gợi ý ghi nhầm đối tượng: cùng tháng, đối tượng A thiếu (hóa đơn > ERP) đúng bằng đối tượng B thừa (ERP > hóa đơn)
    const sus = [];
    for (const m of months) { const pos = [], neg = []; for (const r of rows) { const c = r.m[m]; if (!c || r.unmapped) continue; const d = c.inv - c.erp; if (d > 0.5) pos.push({ r, d }); else if (d < -0.5) neg.push({ r, d: -d }); }
      for (const a of pos) for (const b of neg) if (Math.abs(a.d - b.d) <= Math.max(0.5, a.d * 0.001)) sus.push({ ym: m, amt: a.d, short: a.r.key, shortName: a.r.name, over: b.r.key, overName: b.r.name }); }
    rows.sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || Math.abs(b.diff) - Math.abs(a.diff));
    const tm = Object.fromEntries(months.map(m => [m, { inv: rows.reduce((x, r) => x + (r.m[m] ? r.m[m].inv : 0), 0), erp: rows.reduce((x, r) => x + (r.m[m] ? r.m[m].erp : 0), 0) }]));
    return { acc, basis, months, rows, tm, sus, inv: rows.reduce((x, r) => x + r.inv, 0), erp: rows.reduce((x, r) => x + r.erp, 0), lines: get(`SELECT count(*) n FROM inv_line`).n, issues: get(`SELECT count(*) n FROM inv_issue`).n, bccs: get(`SELECT count(*) n FROM inv_issue WHERE kind='bccs'`).n };
  }
  function cellDetail(key, ym, o = {}) {
    const acc = s(o.acc) || '138812', basis = ['pay', 'issue', 'issuecyc'].includes(o.basis) ? o.basis : 'bill', side = basis === 'pay' ? 'credit' : 'debit', ymCol = basis === 'pay' ? 'ym_pay' : basis === 'issue' ? 'ym' : 'ym_bill', TBL = basis.startsWith('issue') ? 'inv_issue' : 'inv_line';
    const accs = key.startsWith('?') ? [key.slice(1)] : all(`SELECT acc FROM inv_cust WHERE erp_code=?`, key).map(r => r.acc), R = !ym && o.from && o.to ? [o.from, o.to] : null, Y = ym ? ` AND ${ymCol}=?` : R ? ` AND ${ymCol} BETWEEN ? AND ?` : '', YP = ym ? [ym] : R || [];
    const SRC = TBL === 'inv_issue' && o.src && o.src !== 'all' ? ` AND kind='${o.src === 'bccs' ? 'bccs' : 'cuoc'}'` : '';
    const inv = accs.length ? all(`SELECT * FROM ${TBL} WHERE acc IN (${accs.map(() => '?').join(',')})${Y}${SRC} ORDER BY ${TBL === 'inv_issue' ? 'issue_date' : 'pay_date'} LIMIT 20000`, ...accs, ...YP) : [];
    const x11 = s(o.extra11 ?? 'BC19'), accs2 = side === 'debit' && x11 && key.toUpperCase().startsWith(x11.toUpperCase()) ? [acc, '138811'] : [acc];
    const erp = key.startsWith('?') ? [] : all(`SELECT id, account_date d, ym, document_no doc, acc_debit dr, acc_credit cr, partner_${side} p, amount a, description ds FROM entries WHERE acc_${side} IN (${accs2.map(() => '?').join(',')}) AND upper(partner_${side}) LIKE ?${ym ? ' AND ym=?' : R ? ' AND ym BETWEEN ? AND ?' : ''} ORDER BY account_date, id LIMIT 20000`, ...accs2, key + '%', ...YP);
    if (TBL === 'inv_issue' && (!o.src || o.src === 'all' || o.src === 'cuoc') && accs.length && !get(`SELECT 1 x FROM inv_issue WHERE kind='cuoc' LIMIT 1`))
      for (const l of all(`SELECT * FROM inv_line WHERE acc IN (${accs.map(() => '?').join(',')})${ym ? ' AND ym_bill=?' : R ? ' AND ym_bill BETWEEN ? AND ?' : ''} ORDER BY pay_date LIMIT 20000`, ...accs, ...YP)) inv.push({ ...l, issue_date: l.pay_date, kind: 'cuoc', amt_tax: l.amt_tax });
    return { key, ym, from: R && R[0], to: R && R[1], accs, inv, erp, issue: TBL === 'inv_issue' };
  }
  return { importBook, customers, setMap, compare, cellDetail, erpPartners };
}
module.exports = { make, codeOf };
