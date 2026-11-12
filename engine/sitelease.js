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
  const defRate = () => +((get(`SELECT v FROM settings WHERE k='ifrs16_rate'`) || {}).v || 9.0175);
  const isoD = v => { if (v == null || v === '') return ''; if (v instanceof Date) { const d = new Date(v.getTime() + 12 * 36e5 - v.getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 10); } /* ngày Excel = 0h giờ máy (Timor UTC+9) → lấy ngày theo giờ máy */ const t = s(v); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (/^\d{5}$/.test(t)) return new Date(Math.round((+t - 25569) * 864e5)).toISOString().slice(0, 10); return ''; };
  const months = (f, t) => f && t ? Math.max(1, (+t.slice(0, 4) - +f.slice(0, 4)) * 12 + (+t.slice(5, 7) - +f.slice(5, 7)) + 1) : 0;
  const row = r => ({ ...r, erp: J(r.erp) });
  db.exec(`CREATE TABLE IF NOT EXISTS sl_pay(cid INTEGER, ym TEXT, status TEXT, note TEXT, at TEXT, PRIMARY KEY(cid, ym))`);
  // đánh dấu tiến độ thanh toán một kỳ (HĐ × tháng bắt đầu kỳ): sub = đã trình ký, paid = đã chuyển tiền; status rỗng = bỏ đánh dấu
  function payMark(items, status, note) { for (const x of [].concat(items || [])) { if (!s(status)) run(`DELETE FROM sl_pay WHERE cid=? AND ym=?`, +x.id, s(x.ym));
      else run(`INSERT OR REPLACE INTO sl_pay(cid, ym, status, note, at) VALUES(?,?,?,?,datetime('now','localtime'))`, +x.id, s(x.ym), s(status), s(note ?? (get(`SELECT note FROM sl_pay WHERE cid=? AND ym=?`, +x.id, s(x.ym)) || {}).note)); } return true; }
  // sửa một lần: bản trước nạp Excel ở máy UTC+9 làm ngày lùi 1 ngày (01/11 → 31/10). Ngày bắt đầu = ngày cuối tháng → cộng 1 ngày cho cả từ / đến.
  try { if (!get(`SELECT v FROM settings WHERE k='sl_tzfix'`)) { const nx = d => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)); return x.toISOString().slice(0, 10); };
    for (const r of all(`SELECT id, from_d, to_d FROM site_contract WHERE from_d<>''`)) if (nx(r.from_d).slice(8, 10) === '01') run(`UPDATE site_contract SET from_d=?, to_d=? WHERE id=?`, nx(r.from_d), r.to_d ? nx(r.to_d) : r.to_d, r.id);
    run(`INSERT OR REPLACE INTO settings(k, v) VALUES('sl_tzfix', '1')`); } } catch { }
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
    // Theo mẫu "IFRS16_Viettel_Timor": tháng đầu = 1/tháng bắt đầu, tháng cuối = tháng kết thúc; số tháng = DATEDIF (+1 nếu khác tháng);
    // kỳ đầu trả trước (Down payment = kỳ TT × giá) → ROU; các kỳ sau trả ở tháng thứ 1+k·kỳ TT; nợ thuê đầu mỗi tháng = XNPV(lãi năm, các khoản trả còn lại, theo ngày thực / 365);
    // lãi = khoản trả − giảm nợ; khấu hao ROU đều theo số tháng. Tiền thuê không gồm WHT (WHT tách cột).
    const rate = (r.rate != null ? +r.rate : +o.rate || defRate()) / 100, term = Math.max(1, +r.term || 1), asOf = day(o.asOf) || new Date().toISOString().slice(0, 10);
    const W = whtRate() / 100, gross = r.rent, f = r.from_d, t = r.to_d, ym0 = f.slice(0, 7), ymE = t.slice(0, 7);
    const dd = (+t.slice(0, 4) - +f.slice(0, 4)) * 12 + (+t.slice(5, 7) - +f.slice(5, 7)) - (+t.slice(8, 10) < +f.slice(8, 10) ? 1 : 0), n = Math.max(1, f.slice(5, 7) === t.slice(5, 7) ? dd : dd + 1);
    const YM = P.ymsOf(ym0 + '-01', ymE + '-01'), N = YM.length, down = term * gross, C = YM.map((ym, k) => (k > 0 && k % term === 0 && Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1) < Date.parse(t) ? term * gross : 0));
    const T = YM.map(ym => Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1) / 864e5), xnpv = k => { let v = 0; for (let j = k; j < N; j++) if (C[j]) v += C[j] / Math.pow(1 + rate, (T[j] - T[k]) / 365); return v; };
    const F = YM.map((_, k) => xnpv(k)); F.push(0);
    const L0 = F[0], rou = L0 + down, dep = rou / n, sch = []; let nbv = rou;
    for (let k = 0; k < N; k++) { const red = F[k] - F[k + 1], int = C[k] - red, d = k < n ? Math.min(dep, nbv) : 0; nbv -= d;
      sch.push({ k: k + 1, ym: YM[k], date: YM[k] + '-01', open: F[k], pay: C[k] + (k === 0 ? down : 0), down: k === 0 ? down : 0, lp: C[k], pv: F[k], red, wht: (C[k] + (k === 0 ? down : 0)) * W / (1 - W), int, close: F[k + 1], rouOpen: nbv + d, dep: d, nbv: Math.max(0, nbv), rent: gross, rentWht: gross * W / (1 - W) }); }
    const cur = asOf.slice(0, 7), y = asOf.slice(0, 4), past = sch.filter(x => x.ym <= cur), at = past[past.length - 1] || { close: L0, nbv: rou };
    const next12 = sch.filter(x => x.ym > cur).slice(0, 12), curPart = next12.reduce((q, x) => q + x.pay - x.int, 0);
    const ytd = past.filter(x => x.ym.startsWith(y)), short = n <= 12;
    return { r, rate: rate * 100, n, term, L0, rou, down, dep, sch, asOf, short,
      at: { liab: Math.max(0, past.length ? at.close : L0), nbv: past.length ? at.nbv : rou, liabCur: Math.max(0, Math.min(curPart, past.length ? at.close : L0)), liab0: 0, intYtd: ytd.reduce((q, x) => q + x.int, 0), depYtd: ytd.reduce((q, x) => q + x.dep, 0), rentYtd: ytd.length * gross } };
  }
  // Bảng cuối năm: phân bổ Nợ 627 / 641 / 642… – Có 24211 trong năm của từng HĐ, tách tiền thuê (ghi âm khi áp dụng IFRS 16) và thuế WHT (giữ lại),
  // kèm khấu hao ROU, lãi thuê IFRS 16 cùng kỳ (01/01 → ngày xem) để lập bút toán.
  function yearEnd(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), y = asOf.slice(0, 4), R = list(o), allErp = [...new Set(R.flatMap(r => r.erp))], L = new Map();
    for (let i = 0; i < allErp.length; i += 400) { const ch = allErp.slice(i, i + 400);
      for (const x of all(`SELECT contract c, acc_debit dr, acc_credit cr, amount a, description ds FROM entries WHERE contract IN (${ch.map(() => '?').join(',')}) AND acc_credit LIKE '242%' AND account_date>=? AND account_date<=?`, ...ch, y + '-01-01', asOf))
        (L.get(x.c) || L.set(x.c, []).get(x.c)).push(x); }
    const out = [];
    for (const r of R) { const X = r.erp.flatMap(c => L.get(c) || []), by = new Map();
      for (const x of X) { const acc = s(x.dr), g = by.get(acc) || by.set(acc, { acc, cr: s(x.cr), rent: 0, wht: 0, n: 0 }).get(acc); g.n++; if (isWht({ oacc: '', ds: x.ds })) g.wht += x.a; else g.rent += x.a; }
      const f = ifrs16(r.id, { asOf }), dep = f.err ? 0 : f.at.depYtd, int = f.err ? 0 : f.at.intYtd, rows = [...by.values()];
      if (!rows.length && !dep) continue;
      const rent = rows.reduce((q, g) => q + g.rent, 0), wht = rows.reduce((q, g) => q + g.wht, 0);
      out.push({ id: r.id, site: r.site, code: r.code, tcost: r.tcost, accs: rows, rent, wht, dep, int, short: !f.err && f.short, err: f.err || '', liab: f.err ? 0 : f.at.liab, nbv: f.err ? 0 : f.at.nbv, diff: dep + int - rent });
    }
    return { asOf, year: y, rows: out, tot: ['rent', 'wht', 'dep', 'int', 'diff', 'liab', 'nbv'].reduce((o2, k) => (o2[k] = out.filter(x => !x.short).reduce((q, x) => q + x[k], 0), o2), {}) };
  }
  // Trạm cần thanh toán tại kỳ m (YYYY-MM) + số tháng nhìn trước: HĐ còn hiệu lực mà kỳ trả trước đã ghi nhận (Nợ 242) chưa phủ tới tháng đó.
  // Đề xuất kỳ thanh toán tiếp theo = từ tháng sau "đã trả đến" (hoặc đầu HĐ) dài đúng điều khoản (term), không vượt ngày hết hạn; số tiền thuê (trước thuế) + WHT.
  function due(o = {}) {
    const m = s(o.ym) || new Date().toISOString().slice(0, 7), ahead = Math.max(0, +o.ahead || 0), lim = P.ymsOf(m + '-01', '9999-12-01')[ahead] || m, W = whtRate() / 100;
    const asOf = lim + '-' + String(new Date(Date.UTC(+lim.slice(0, 4), +lim.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
    const R = reconcile({ ...o, asOf }), info = new Map(all(`SELECT * FROM ap331_partner`).map(r => [r.bp, r]));
    let bank = new Map(), ll = new Map(); try { for (const b of all(`SELECT * FROM pc_bank ORDER BY is_default DESC, id`)) if (!bank.has(b.bp)) bank.set(b.bp, b); } catch { } try { ll = new Map(all(`SELECT * FROM landlord`).map(r => [r.bp, r])); } catch { } const ct = new Map(); try { for (const c of all(`SELECT * FROM pc_contact ORDER BY id`)) if (!ct.has(c.bp)) ct.set(c.bp, c); } catch { }
    // số dư 24211 theo cột Contract đến cuối tháng trước kỳ xem (Nợ − Có)
    const prevEnd = m + '-00', B242 = new Map(all(`SELECT contract c, sum(CASE WHEN acc_debit LIKE '24211%' THEN amount ELSE 0 END) - sum(CASE WHEN acc_credit LIKE '24211%' THEN amount ELSE 0 END) b FROM entries WHERE (acc_debit LIKE '24211%' OR acc_credit LIKE '24211%') AND account_date<? AND ifnull(contract,'')<>'' GROUP BY contract`, m + '-01').map(x => [x.c, x.b]));
    const out = [];
    for (const r of R) {
      // HĐ đã hết hạn: nếu kỳ kế tiếp sau ngày hết hạn rơi vào kỳ xem và trạm chưa có HĐ mới phủ kỳ này → cần gia hạn + thanh toán (dự kiến cùng giá, cùng kỳ TT)
      let renew = false;
      if (r.to_d && r.to_d.slice(0, 7) < m) { const nx = P.ymsOf(r.to_d.slice(0, 7) + '-01', '9999-12-01')[1];
        if (!(nx >= m && nx <= lim) || R.some(z => z !== r && z.site === r.site && z.from_d && z.from_d.slice(0, 7) <= nx && (!z.to_d || z.to_d.slice(0, 7) >= nx))) continue; renew = nx; } if (r.from_d && r.from_d.slice(0, 7) > lim) continue;
      const D0 = (get(`SELECT min(ym) m FROM entries WHERE ym IS NOT NULL`) || {}).m || '2016-01', f0 = r.from_d ? r.from_d.slice(0, 7) : m, startYm = f0 > D0 ? f0 : D0, cov = r.coveredTo || '', next = cov ? P.ymsOf(cov + '-01', '9999-12-01')[1] : startYm;
      const term = Math.max(1, +r.term || 1), endYm = renew ? '9999-12' : r.to_d ? r.to_d.slice(0, 7) : '9999-12', md = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
      // kỳ đến hạn theo lịch HĐ: tháng bắt đầu HĐ, cứ mỗi "term" tháng một lần; chỉ lấy kỳ rơi vào [kỳ xem .. nhìn trước]
      const fA = r.from_d && +r.from_d.slice(8, 10) >= 16 ? P.ymsOf(f0 + '-01', '9999-12-01')[1] : f0; // HĐ bắt đầu cuối tháng (vd 30/04) → kỳ tính từ tháng sau
      const win = P.ymsOf(m + '-01', lim + '-01'), sched = renew ? renew : cov ? (next >= m && next <= lim ? next : null) : r.from_d ? win.find(x => x >= fA && x <= endYm && md(fA, x) % term === 0) : (next >= m && next <= lim ? next : null);
      let M, back = false;
      if (sched) { M = P.ymsOf(sched + '-01', '9999-12-01').slice(0, term).filter(x => x <= endYm); if (cov && cov >= M[M.length - 1]) continue; } // đã trả trước cho kỳ này
      else if (o.backlog && next < m) { back = true; M = P.ymsOf(next + '-01', '9999-12-01').slice(0, term).filter(x => x <= endYm); }
      else continue;
      const gap = !back && (!cov ? f0 < M[0] && !!r.from_d : P.ymsOf(cov + '-01', '9999-12-01')[1] < M[0]);
      const overdue = back ? P.ymsOf(next + '-01', m + '-01').filter(x => x < m).length : 0, rent = r.rent != null ? r.rent * M.length : null, wht = rent != null ? rent * W / (1 - W) : null;
      const bal242 = r.erp.reduce((q, c) => q + (B242.get(c) || 0), 0), balMonths = r.rent ? bal242 / (r.rent / (1 - W)) : null;
      const bp = r.bp || '', l = ll.get(bp) || {}, b = bank.get(bp) || null, nm = (info.get(bp) || {}).name || String(bp).replace(/^[A-Za-z]+_[A-Za-z]*_?\d+_?/, '');
      out.push({ id: r.id, site: r.site, code: r.code, tcost: r.tcost, bp, landlord: nm, phone: l.phone || '', bank: b ? `${b.bank || ''} ${b.acc_no || ''}`.trim() : (l.bank_acc ? `${l.bank_name || ''} ${l.bank_acc}`.trim() : ''), accName: b ? b.acc_name || '' : l.acc_holder || '', bankName: (b ? b.bank : l.bank_name) || '', accNo: (b ? b.acc_no : l.bank_acc) || '', branch: b ? b.branch || '' : '', swift: b ? b.swift || '' : '', ccy: b ? b.currency || '' : '', emoney: b ? !!b.emoney : false, address: l.address || '', email: (ct.get(bp) || {}).email || '', contact: (ct.get(bp) || {}).name || '', phone2: (ct.get(bp) || {}).phone || '', llNote: l.note || '',
        rentM: r.rent, rentNote: r.rent_note, term, from: r.from_d, to: r.to_d, paidTo: cov, payFrom: M[0] || next, payTo: M[M.length - 1] || next, months: M.length, rent, wht, total: rent != null ? rent + wht : null, overdue, status: back ? (!cov ? 'nodata' : 'overdue') : M[0] === m ? 'due' : 'soon', gap: gap && !renew, renew: !!renew, bal242, balMonths, susPaid: bal242 > 0.5 && (r.rent ? balMonths >= 0.5 : true), expiring: r.to_d && r.to_d.slice(0, 7) <= lim, nomap: !r.erp.length });
    }
    const PM = new Map(all(`SELECT * FROM sl_pay`).map(x => [x.cid + '|' + x.ym, x])); for (const x of out) x.pay = PM.get(x.id + '|' + x.payFrom) || null;
    out.sort((a, b) => b.overdue - a.overdue || a.payFrom.localeCompare(b.payFrom) || String(a.site).localeCompare(String(b.site)));
    return { ym: m, ahead, lim, rows: out, tot: { n: out.length, rent: out.reduce((q, x) => q + (x.rent || 0), 0), wht: out.reduce((q, x) => q + (x.wht || 0), 0), overdue: out.filter(x => x.status === 'overdue').length } };
  }
  // Xuất theo mẫu "IFRS16_Viettel_Timor": mỗi loại (Office / Warehouse / Showroom / BTS) một sheet, mỗi HĐ (trạm / vị trí) một khối cột
  // [Month, Date, Lease payments, Other payments, Present Value, Liability Balance, Reduction, ROU Balance, Depreciation, (trống)], cột trái = cộng các khối; sheet "List contract" tổng hợp.
  const TYPES = [['01. Office', /office|văn phòng|van phong/i], ['02. Warehouse', /warehouse|kho/i], ['03. Showroom', /showroom|shop|super ?market|cửa hàng/i], ['04. BTS', /./]];
  const typeOf = r => TYPES.find(([, re]) => re.test(s(r.tcost) + ' ' + s(r.name)))[0];
  const D = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)), r2 = v => Math.round((+v || 0) * 100) / 100;
  function blockOf(x) { const r = x.r, M = new Map(x.sch.map(z => [z.ym, z]));
    const head = [['Contract data', '', '', '', '', '', '', '', ''], ['Name', '', 'Value'], ['Contract', '', r.code], ['Site / location', '', r.site], ['Start date', '', D(x.sch[0].ym)], ['End date', '', r.to_d ? new Date(Date.parse(r.to_d)) : ''], ['Payment term', '', x.term],
      ['Contract term in months', '', x.n], ['Down payment for the lease', '', r2(x.down)], ['Lease payment per month', '', r.rent], ['Service payment per month', '', 0], ['Discount rate', '', x.rate / 100], ['ROU', '', r2(x.rou)]];
    return { head, at: ym => { const z = M.get(ym); return z ? [z.k, D(ym), r2(z.lp + z.down * 0), 0, r2(z.pv), r2(z.pv), r2(z.red), r2(z.rouOpen), r2(z.dep)] : ['', D(ym), 0, 0, 0, 0, 0, 0, 0]; } }; }
  function ifrsBook(o = {}) {
    const all0 = list(o).map(r => ({ r, x: ifrs16(r.id, o) })).filter(q => !q.x.err && !(o.noShort && q.x.short) && (o.allYears || !q.r.to_d || q.r.to_d >= (day(o.asOf) || '0000').slice(0, 4) + '-01-01')), out = [], W = 10, HDR = ['Month', 'Date', 'Lease payments', 'Other payments', 'Present Value', 'Lease Liability – Balance', 'Lease Liability – Reduction', 'Right of Use Asset – Balance', 'Right of Use Asset – Depreciation'];
    const list0 = [['Contract No', 'Site / location', 'Type of cost', 'File', 'Payment Term', 'From Date', 'To Date', 'Monthly Fee', 'Months', 'Discount rate', 'Down payment', 'Initial liability (PV)', 'ROU', 'Depreciation / month', 'Liability at ' + day(o.asOf), 'ROU NBV at ' + day(o.asOf), 'Interest YTD', 'Depreciation YTD', 'Liability nil', 'ROU nil']];
    for (const [tn] of TYPES) { const G = all0.filter(q => typeOf(q.r) === tn); if (!G.length) continue;
      const yms = [...new Set(G.flatMap(q => q.x.sch.map(z => z.ym)))].sort(), axis = P.ymsOf(yms[0] + '-01', yms[yms.length - 1] + '-01'), B = G.map(q => blockOf(q.x)), off = 11;
      const rows = []; const put = (ri, ci, v) => { (rows[ri] = rows[ri] || [])[ci] = v; };
      put(0, 1, 'Lessee contracts – ' + tn + ' (IFRS 16)'); put(1, 1, 'Discount rate'); put(1, 3, (G[0].x.rate) / 100); put(2, 1, 'As of'); put(2, 3, day(o.asOf));
      B.forEach((b, i) => { const c = off + i * W; b.head.forEach((h, k) => h.forEach((v, j) => put(4 + k, c + j, v))); });
      const H0 = 19; put(H0 - 1, 1, 'Calculation (total of all contracts in this sheet)'); ['Month', 'Date', 'Lease payments', 'Other payments', 'Present Value', 'Liability Balance', 'Liability Reduction', 'ROU Balance', 'ROU Depreciation', 'Interest'].forEach((h, j) => put(H0, 1 + j, h));
      B.forEach((b, i) => HDR.forEach((h, j) => put(H0, off + i * W + j, h)));
      axis.forEach((ym, k) => { const ri = H0 + 1 + k, sum = Array(9).fill(0); B.forEach((b, i) => { const v = b.at(ym); v.forEach((q, j) => put(ri, off + i * W + j, q)); for (let j = 2; j < 9; j++) sum[j] += +v[j] || 0; });
        put(ri, 1, k + 1); put(ri, 2, D(ym)); for (let j = 2; j < 9; j++) put(ri, 1 + j, r2(sum[j])); put(ri, 10, r2(sum[2] - sum[6])); });
      for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] || [], v => v ?? '');
      out.push([tn, rows]);
      for (const q of G) { const x = q.x, at = x.at, S = x.sch, lp = S.reduce((a, z, k) => z.lp > 0 ? k : a, 0), zl = (S.slice(lp).find(z => Math.abs(z.close) < 0.01) || S[S.length - 1]).ym;
        list0.push([q.r.code, q.r.site, q.r.tcost, tn, x.term, q.r.from_d, q.r.to_d, q.r.rent, x.n, x.rate / 100, r2(x.down), r2(x.L0), r2(x.rou), r2(x.dep), r2(at.liab), r2(at.nbv), r2(at.intYtd), r2(at.depYtd), zl, S[S.length - 1].ym]); } }
    out.unshift(['List contract', list0]); out.unshift(['Interest rate', [['Period', 'Rate'], ['Average', defRate() / 100]]]);
    return out;
  }
  function ifrsOne(id, o = {}) { const x = ifrs16(id, o); if (x.err) return x; const b = blockOf(x), rows = [...b.head.map(h => h.slice()), [], ['Calculation'],
      ['Month', 'Date', 'Lease payments', 'Other payments', 'Present Value', 'Lease Liability – Balance', 'Lease Liability – Reduction', 'Right of Use Asset – Balance', 'Right of Use Asset – Depreciation', 'Interest', 'WHT (separate)'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', '']];
    for (const z of x.sch) { const v = b.at(z.ym); rows.push([...v, r2(z.int), r2(z.wht)]); }
    const T = k => r2(x.sch.reduce((q, z) => q + (z[k] || 0), 0)); rows.push(['Total', '', T('lp'), 0, '', '', T('red'), '', T('dep'), T('int'), T('wht')]);
    return { sheets: [[String(x.r.site || x.r.code).slice(0, 31), rows]], x }; }
  function ifrs16All(o = {}) { return list(o).map(r => { const x = ifrs16(r.id, o); if (x.err) return { r, err: x.err };
    // tháng nợ thuê về 0 (sau lần trả cuối, không còn kỳ trả nào) và tháng ROU khấu hao hết; số dư 31/12 từng năm
    const S = x.sch, lastPay = S.reduce((q, z, k) => z.pay > 0 ? k : q, 0), zl = (S.slice(lastPay).find(z => Math.abs(z.close) < 0.01) || S[S.length - 1] || {}).ym || '', zr = (S[S.length - 1] || {}).ym || '';
    const yr = {}; for (const z of S) if (z.ym.endsWith('-12') || z === S[S.length - 1]) yr[z.ym.slice(0, 4)] = { liab: Math.max(0, z.close), nbv: z.nbv };
    return { r, n: x.n, rate: x.rate, L0: x.L0, short: x.short, ...x.at, zeroLiab: zl, zeroRou: zr, yr }; }); }
  const setWht = v => { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('wht_rental', ?)`, String(+v || 0)); return whtRate(); };
  const setRate = v => { run(`INSERT OR REPLACE INTO settings(k, v) VALUES('ifrs16_rate', ?)`, String(+v || 8)); return defRate(); };
  return { list, save, remove, importAoa, exportAoa, candidates, autoMap, setMap, reconcile, ifrs16, ifrs16All, defRate, setRate, whtRate, setWht, yearEnd, due, payMark, ifrsBook, ifrsOne };
}
module.exports = { make };
