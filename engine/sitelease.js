'use strict';
// Danh mục hợp đồng thuê trạm / văn phòng / kho (mẫu "2025_List contract": Contract No (Code), (Name), Payment Term, From Date, To Date, Total amount (giá thuê / tháng), Type of cost, Mã vị trí).
// - Map với hạch toán: các giá trị cột Contract trong dữ liệu ERP (tự động: "Mã_Tên" bắt đầu bằng mã HĐ, hoặc chứa mã vị trí) – người dùng sửa / thêm tay.
// - Đối chiếu 242: các đợt trả trước (Nợ 242, kỳ ghi trên diễn giải) phủ được tháng nào của hợp đồng → tháng chưa thanh toán; số tiền đợt ≠ giá × số tháng (cho phép gross-up thuế nhà thầu 10%); kỳ đợt ≠ kỳ thanh toán; sai sót phân bổ (prepaid242.analyze).
// - IFRS 16: nợ thuê = PV các khoản thanh toán (trả trước đầu mỗi kỳ thanh toán), lãi suất chiết khấu năm; tài sản quyền sử dụng = nợ thuê ban đầu, khấu hao đều theo thời hạn thuê.
function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS site_contract(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, term INTEGER, from_d TEXT, to_d TEXT, rent REAL, rent_note TEXT, tcost TEXT, site TEXT, status TEXT, bp TEXT, erp TEXT, rate REAL, note TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_sc_site ON site_contract(site);`);
  const P = require('./prepaid242').make(db, all);
  const s = v => String(v ?? '').trim(), day = d => s(d).slice(0, 10), J = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
  const whtRate = () => { const v = (get(`SELECT v FROM settings WHERE k='wht_rental'`) || {}).v; return v == null || v === '' ? 10 : +v; }; // thuế WHT cho thuê (%), giá HĐ trước thuế
  const isWht = x => /^333/.test(s(x.oacc)) || /\bWHT\b|withholding/i.test(s(x.ds));
  const defRate = () => +((get(`SELECT v FROM settings WHERE k='ifrs16_rate'`) || {}).v || 8);
  const isoD = v => { if (v == null || v === '') return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); const t = s(v); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (/^\d{5}$/.test(t)) return new Date(Math.round((+t - 25569) * 864e5)).toISOString().slice(0, 10); return ''; };
  const months = (f, t) => f && t ? Math.max(1, (+t.slice(0, 4) - +f.slice(0, 4)) * 12 + (+t.slice(5, 7) - +f.slice(5, 7)) + 1) : 0;
  const row = r => ({ ...r, erp: J(r.erp) });
  // ---- danh mục ----
  function list(o = {}) { const q = s(o.q).toLowerCase(); let R = all(`SELECT * FROM site_contract ORDER BY site, from_d`).map(row);
    if (q) R = R.filter(r => [r.code, r.name, r.site, r.tcost, r.bp, r.note].join(' ').toLowerCase().includes(q)); return R; }
  function save(o = {}) { const v = [s(o.code), s(o.name) || s(o.code), +o.term || 1, isoD(o.from_d), isoD(o.to_d), o.rent === '' || o.rent == null || !isFinite(+o.rent) ? null : +o.rent, s(o.rent_note), s(o.tcost), s(o.site).toUpperCase(), s(o.status), s(o.bp), JSON.stringify([].concat(o.erp || []).map(s).filter(Boolean)), o.rate === '' || o.rate == null ? null : +o.rate, s(o.note)];
    if (o.id) run(`UPDATE site_contract SET code=?, name=?, term=?, from_d=?, to_d=?, rent=?, rent_note=?, tcost=?, site=?, status=?, bp=?, erp=?, rate=?, note=?, updated_at=datetime('now','localtime') WHERE id=?`, ...v, +o.id);
    else run(`INSERT INTO site_contract(code, name, term, from_d, to_d, rent, rent_note, tcost, site, status, bp, erp, rate, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`, ...v);
    return o.id ? +o.id : get(`SELECT max(id) i FROM site_contract`).i; }
  const remove = ids => { for (const i of [].concat(ids || [])) run(`DELETE FROM site_contract WHERE id=?`, +i); return true; };
  // nạp Excel theo mẫu (cột nhận theo tên); mode 'replace' = xoá danh mục cũ
  function importAoa(A = [], mode = 'merge') {
    const h = A.findIndex(r => (r || []).some(c => /contract no/i.test(s(c)))); if (h < 0) throw new Error('Không thấy cột "Contract No (Code)"');
    const H = A[h].map(c => s(c).toLowerCase()), col = re => H.findIndex(x => re.test(x));
    const C = { code: col(/contract no.*code/), name: col(/contract no.*name/), term: col(/payment term/), f: col(/from date/), t: col(/to date/), amt: col(/total amount|amount|giá/), tc: col(/type of cost|khoản mục/), site: col(/mã v[ịi]|site|location/), st: H.findIndex((x, i) => i > Math.max(...[col(/mã v[ịi]|site/)]) && x === '') };
    let n = 0, up = 0; db.exec('BEGIN'); try { if (mode === 'replace') run(`DELETE FROM site_contract`);
      for (const r of A.slice(h + 1)) { const code = s(r[C.code]); if (!code) continue; const amt = r[C.amt], num = typeof amt === 'number' ? amt : (isFinite(+s(amt).replace(/,/g, '')) && s(amt) !== '' ? +s(amt).replace(/,/g, '') : null);
        const o = { code, name: s(r[C.name]) || code, term: +r[C.term] || 1, from_d: isoD(r[C.f]), to_d: isoD(r[C.t]), rent: num, rent_note: num == null ? s(amt) : '', tcost: s(r[C.tc]), site: s(r[C.site]), status: C.st >= 0 ? s(r[C.st]) : '' };
        const ex = get(`SELECT id, erp, bp, rate, note FROM site_contract WHERE code=? AND ifnull(site,'')=?`, code, o.site.toUpperCase());
        if (ex) { save({ ...o, id: ex.id, erp: J(ex.erp), bp: ex.bp, rate: ex.rate, note: ex.note }); up++; } else { save(o); n++; } }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    const m = autoMap(); return { added: n, updated: up, mapped: m.n };
  }
  const exportAoa = () => [['No', 'Contract No (Code)', 'Contract No (Name)', 'Payment Term', 'From Date', 'To Date', 'Total amount', 'Type of cost', 'Mã Vị trí', 'Trạng thái', 'Đối tượng (ERP)', 'Hợp đồng ERP đã map', 'Lãi suất IFRS16 (%/năm)', 'Ghi chú'],
    ...list().map((r, i) => [i + 1, r.code, r.name, r.term, r.from_d, r.to_d, r.rent ?? r.rent_note, r.tcost, r.site, r.status, r.bp, r.erp.join('; '), r.rate ?? '', r.note])];
  // ---- map với hạch toán ----
  const erpContracts = () => all(`SELECT contract c, max(coalesce(partner_credit, partner_debit)) p, count(*) n, min(account_date) f, max(account_date) t FROM entries WHERE ifnull(contract,'')<>'' AND (acc_debit LIKE '242%' OR acc_credit LIKE '242%' OR acc_debit LIKE '331%' OR acc_credit LIKE '331%') GROUP BY 1`);
  function candidates(id) { const r = get(`SELECT * FROM site_contract WHERE id=?`, +id); if (!r) return [];
    const code = s(r.code).toUpperCase(), site = s(r.site).toUpperCase(), E = erpContracts();
    return E.map(e => { const C = s(e.c).toUpperCase(); const sc = C === code || C.startsWith(code + '_') ? 3 : site && site.length >= 4 && (C.includes(site) || s(e.p).toUpperCase().includes(site)) ? 2 : code.length >= 6 && C.includes(code) ? 1 : 0; return { ...e, score: sc }; })
      .filter(e => e.score).sort((a, b) => b.score - a.score || b.n - a.n).slice(0, 60); }
  function autoMap(onlyEmpty = true) { const E = erpContracts(); let n = 0;
    for (const r of all(`SELECT * FROM site_contract`)) { if (onlyEmpty && J(r.erp).length) continue; const code = s(r.code).toUpperCase(), site = s(r.site).toUpperCase();
      let hit = E.filter(e => { const C = s(e.c).toUpperCase(); return C === code || C.startsWith(code + '_'); });
      if (!hit.length && /^[A-Z]{2}\d{4}[A-Z]?$/.test(site)) hit = E.filter(e => new RegExp('\\b' + site + '\\b').test(s(e.c).toUpperCase())); // mã trạm BTS
      if (hit.length) { run(`UPDATE site_contract SET erp=?, bp=coalesce(nullif(bp,''), ?) WHERE id=?`, JSON.stringify(hit.map(e => e.c)), hit[0].p || '', r.id); n++; } }
    return { n }; }
  const setMap = (id, erp) => { run(`UPDATE site_contract SET erp=? WHERE id=?`, JSON.stringify([].concat(erp || []).map(s).filter(Boolean)), +id); return true; };
  // ---- đối chiếu 242 / thanh toán ----
  function reconcile(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), cur = asOf.slice(0, 7), D0 = (get(`SELECT min(ym) m FROM entries WHERE ym IS NOT NULL`) || {}).m || '2016-01', R = list(o), allErp = [...new Set(R.flatMap(r => r.erp))];
    const L = new Map(); if (allErp.length) for (let i = 0; i < allErp.length; i += 400) { const ch = allErp.slice(i, i + 400), ph = ch.map(() => '?').join(',');
      for (const x of all(`SELECT contract c, account_date d, document_no doc, acc_debit dr, acc_credit cr, amount a, description ds FROM entries WHERE contract IN (${ph}) AND account_date<=? AND (acc_debit LIKE '242%' OR acc_credit LIKE '242%' OR (acc_debit LIKE '331%' AND (acc_credit LIKE '111%' OR acc_credit LIKE '112%')))`, ...ch, asOf))
        (L.get(x.c) || L.set(x.c, []).get(x.c)).push(x); }
    return R.map(r => {
      const X = r.erp.flatMap(c => L.get(c) || []), lines = [], paid = X.filter(x => s(x.dr).startsWith('331')).reduce((q, x) => q + x.a, 0);
      for (const x of X) { if (s(x.dr).startsWith('242')) lines.push({ side: 'dr', d: x.d, ym: s(x.d).slice(0, 7), a: x.a, ds: x.ds, oacc: s(x.cr) }); else if (s(x.cr).startsWith('242')) lines.push({ side: 'cr', d: x.d, ym: s(x.d).slice(0, 7), a: x.a, ds: x.ds }); }
      const up = lines.filter(x => x.side === 'dr').reduce((q, x) => q + x.a, 0), amo = lines.filter(x => x.side === 'cr').reduce((q, x) => q + x.a, 0);
      // đợt trả trước theo kỳ diễn giải
      const B = new Map(); for (const x of lines) if (x.side === 'dr') { const p = P.period(x.ds); if (!p) continue; const k = p.f + '|' + p.t; const b = B.get(k) || B.set(k, { f: p.f, t: p.t, a: 0, net: 0, wht: 0 }).get(k); b.a += x.a; if (isWht(x)) b.wht += x.a; else b.net += x.a; }
      const W = whtRate() / 100, iss = [], cov = new Set(), start = r.from_d ? (r.from_d.slice(0, 7) > D0 ? r.from_d.slice(0, 7) : D0) : null, end = r.to_d ? r.to_d.slice(0, 7) : cur;
      for (const b of B.values()) { const M = P.ymsOf(b.f, b.t); M.forEach(m => cov.add(m)); const exp = r.rent != null ? r.rent * M.length : null;
        // Giá HĐ là giá trước thuế (số chủ nhà nhận); công ty chịu thuế khấu trừ tại nguồn (WHT) cho thuê 10% → ghi nhận 242 = giá × số tháng ÷ (1 − 10%), gồm phần trả chủ nhà (Có 331) + phần WHT (Có 333 / diễn giải "WHT")
        if (exp != null) { const expW = exp * W / (1 - W), tol = x => Math.max(1, x * 0.02);
          if (Math.abs(b.net - exp) > tol(exp)) iss.push({ k: 'payamt', label: 'Thanh toán sai số tiền', msg: `Kỳ ${b.f.slice(0, 7)}→${b.t.slice(0, 7)}: tiền thuê ghi nhận ${b.net.toFixed(2)} ≠ giá ${r.rent} × ${M.length} tháng = ${exp.toFixed(2)}`, a: b.net - exp });
          if (W > 0 && Math.abs(b.wht - expW) > tol(expW)) iss.push({ k: 'wht', label: b.wht < 0.005 ? 'Thiếu thuế WHT 10%' : 'Thuế WHT sai số tiền', msg: `Kỳ ${b.f.slice(0, 7)}→${b.t.slice(0, 7)}: WHT ghi nhận ${b.wht.toFixed(2)} ≠ ${(W * 100).toFixed(0)}% × ${(exp + expW).toFixed(2)} (giá gồm thuế) = ${expW.toFixed(2)}`, a: b.wht - expW }); }
        if ((r.from_d && b.f < r.from_d.slice(0, 7) + '-01') || (r.to_d && b.t > r.to_d)) iss.push({ k: 'payout', label: 'Kỳ thanh toán ngoài thời hạn HĐ', msg: `Kỳ ${b.f}→${b.t} ngoài HĐ ${r.from_d}→${r.to_d}` });
        if (r.term && M.length !== +r.term && M.length > 1) iss.push({ k: 'payterm', label: 'Kỳ thanh toán khác điều khoản', msg: `Kỳ ${b.f.slice(0, 7)}→${b.t.slice(0, 7)} = ${M.length} tháng, điều khoản ${r.term} tháng` }); }
      const due = start && start <= cur ? P.ymsOf(start + '-01', (end < cur ? end : cur) + '-01') : [], miss = due.filter(m => !cov.has(m));
      if (miss.length) iss.push({ k: 'unpaid', label: 'Chưa thanh toán / chưa ghi nhận trả trước', msg: `${miss.length} tháng: ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? '…' : ''}`, a: r.rent != null ? r.rent * miss.length / (1 - W) : null, months: miss });
      if (!r.erp.length) iss.push({ k: 'nomap', label: 'Chưa map với hạch toán', msg: 'Chưa tìm thấy hợp đồng ERP tương ứng – map tay trong danh mục' });
      for (const z of P.analyze(lines, asOf)) iss.push({ k: 'amo_' + z.k, label: z.label, msg: `${z.n} lần · ${z.msg}`, months: z.months });
      const active = (!r.from_d || r.from_d <= asOf) && (!r.to_d || r.to_d >= asOf.slice(0, 8) + '01');
      return { ...r, up, amo, bal: up - amo, paid, batches: [...B.values()].sort((a, b) => a.f.localeCompare(b.f)), coveredTo: [...cov].sort().pop() || '', active, iss };
    });
  }
  // ---- IFRS 16 ----
  function ifrs16(id, o = {}) {
    const r = row(get(`SELECT * FROM site_contract WHERE id=?`, +id) || {}); if (!r.id || r.rent == null || !r.from_d || !r.to_d) return { r, err: 'Thiếu giá thuê / thời hạn' };
    const rate = (r.rate != null ? +r.rate : +o.rate || defRate()) / 100, i = rate / 12, n = months(r.from_d, r.to_d), term = Math.max(1, +r.term || 1), asOf = day(o.asOf) || new Date().toISOString().slice(0, 10);
    const gross = r.rent / (1 - whtRate() / 100), pay = k => (k % term === 0 ? gross * Math.min(term, n - k) : 0); // tiền thuê gồm WHT công ty chịu // trả trước đầu mỗi kỳ thanh toán
    let L0 = 0; for (let k = 0; k < n; k++) L0 += pay(k) / Math.pow(1 + i, k);
    const rou = L0, dep = rou / n, sch = []; let liab = L0, nbv = rou;
    const ym0 = r.from_d.slice(0, 7);
    for (let k = 0; k < n; k++) { const ym = P.ymsOf(ym0 + '-01', '9999-12-01')[k] || ''; const p = pay(k), open = liab; liab -= p; const int = liab * i; liab += int; nbv -= dep;
      sch.push({ k: k + 1, ym, open, pay: p, int, close: liab, dep, nbv: Math.max(0, nbv), rent: gross }); }
    const cur = asOf.slice(0, 7), y = asOf.slice(0, 4), past = sch.filter(x => x.ym <= cur), at = past[past.length - 1] || { close: L0, nbv: rou };
    const next12 = sch.filter(x => x.ym > cur).slice(0, 12), curPart = next12.reduce((q, x) => q + x.pay - x.int, 0);
    const ytd = past.filter(x => x.ym.startsWith(y)), short = n <= 12;
    return { r, rate: rate * 100, n, term, L0, rou, dep, sch, asOf, short,
      at: { liab: Math.max(0, past.length ? at.close : L0), nbv: past.length ? at.nbv : rou, liabCur: Math.max(0, Math.min(curPart, past.length ? at.close : L0)), liab0: 0, intYtd: ytd.reduce((q, x) => q + x.int, 0), depYtd: ytd.reduce((q, x) => q + x.dep, 0), rentYtd: ytd.length * gross } };
  }
  function ifrs16All(o = {}) { return list(o).map(r => { const x = ifrs16(r.id, o); return x.err ? { r, err: x.err } : { r, n: x.n, rate: x.rate, L0: x.L0, short: x.short, ...x.at }; }); }
  const setWht = v => { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('wht_rental', ?)`, String(+v || 0)); return whtRate(); };
  const setRate = v => { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('ifrs16_rate', ?)`, String(+v || 8)); return defRate(); };
  return { list, save, remove, importAoa, exportAoa, candidates, autoMap, setMap, reconcile, ifrs16, ifrs16All, defRate, setRate, whtRate, setWht };
}
module.exports = { make };
