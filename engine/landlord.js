'use strict';
// Danh mục chủ nhà trạm: đối tượng công nợ có bút toán Nợ 24211 (chi phí trả trước thuê) / Có 331 (phải trả người bán);
// thanh toán: Nợ 331 / Có 112. Tự rút: tên, mã nhà cung cấp, mã nhà trạm (site), hợp đồng thuê, kỳ thuê, giá thuê / tháng,
// số đã ghi nhận, đã trả, còn phải trả. Người dùng bổ sung / sửa: số tài khoản ngân hàng, ngân hàng, SĐT, mã trạm, ghi chú (bảng landlord).
const SITE = /\b([A-Z]{2}\d{4}[A-Z]?|\d[A-Z]{2}\d{3}[A-Z]?)\b/g;
const EDIT = [['site', 'Mã nhà trạm'], ['bank_acc', 'Số tài khoản'], ['bank_name', 'Ngân hàng'], ['acc_holder', 'Chủ tài khoản'], ['phone', 'Số điện thoại'], ['address', 'Địa chỉ / vị trí'], ['contract_end', 'Hết hạn hợp đồng'], ['rent_month', 'Giá thuê / tháng'], ['status', 'Trạng thái'], ['note', 'Ghi chú']];

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS landlord(bp TEXT PRIMARY KEY, ${EDIT.map(e => e[0] + ' TEXT').join(', ')}, updated_at TEXT)`);
  const s = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  const nameOf = bp => { const t = s(bp), m = t.match(/^(?:[A-Z]{2,4}_)?([A-Z]*VEN_?\d+)[_\-\s]+(.+)$/i); return m ? { vcode: m[1], name: s(m[2].replace(/\(\s*[A-Z0-9 ,\/-]*\)\s*$/i, '')) || s(m[2]) } : { vcode: '', name: t }; };
  const sitesIn = (...xs) => { const out = new Set(); for (const x of xs) for (const m of String(x || '').toUpperCase().matchAll(SITE)) out.add(m[1]); return [...out]; };
  const dmy = t => { const m = String(t).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  const period = ds => { const m = String(ds || '').match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:-|–|to|đến)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i); return m ? { f: dmy(m[1]), t: dmy(m[2]) } : null; };
  const rate = ds => { const m = String(ds || '').match(/\$\s*([\d,.]+)\s*\*\s*\d+\s*months?/i) || String(ds || '').match(/\$\s*([\d,.]+)\s*(?:\/|per\s*)\s*(?:month|tháng)/i) || String(ds || '').match(/([\d,.]+)\s*(?:USD|\$)\s*(?:\/|per\s*)\s*(?:month|tháng)/i); return m ? +m[1].replace(/,/g, '') : null; };

  function scan(o = {}) {
    const asOf = s(o.asOf) || '9999-12-31';
    const L = all(`SELECT partner_credit bp, account_date d, document_no doc, contract, description ds, amount a, bts_site site, location FROM entries WHERE acc_debit LIKE '24211%' AND acc_credit LIKE '331%' AND account_date<=? AND partner_credit IS NOT NULL AND partner_credit<>''`, asOf);
    const G = new Map();
    for (const x of L) { const g = G.get(x.bp) || G.set(x.bp, { bp: x.bp, ...nameOf(x.bp), rec: 0, n: 0, contracts: new Map(), sites: new Set(), periods: [], rates: [], first: x.d, last: '' }).get(x.bp);
      g.rec += x.a; g.n++; if (x.contract) g.contracts.set(x.contract, (g.contracts.get(x.contract) || 0) + x.a);
      for (const t of sitesIn(x.bp, x.contract, x.site, x.location, x.ds)) g.sites.add(t);
      const p = period(x.ds); if (p) g.periods.push(p); const r = rate(x.ds); if (r) g.rates.push({ d: x.d, r }); if (x.d > g.last) g.last = x.d; if (x.d < g.first) g.first = x.d; }
    const bps = [...G.keys()]; if (!bps.length) return { rows: [], fields: EDIT, asOf };
    const pay = new Map(), bal = new Map(), ph = bps.map(() => '?').join(',');
    for (const r of all(`SELECT partner_debit bp, sum(amount) a, max(account_date) d, count(*) n FROM entries WHERE acc_debit LIKE '331%' AND acc_credit LIKE '11%' AND account_date<=? AND partner_debit IN (${ph}) GROUP BY 1`, asOf, ...bps)) pay.set(r.bp, r);
    for (const r of all(`SELECT bp, sum(c) - sum(dv) b FROM (SELECT partner_credit bp, amount c, 0 dv FROM entries WHERE acc_credit LIKE '331%' AND account_date<=? AND partner_credit IN (${ph}) UNION ALL SELECT partner_debit, 0, amount FROM entries WHERE acc_debit LIKE '331%' AND account_date<=? AND partner_debit IN (${ph})) GROUP BY 1`, asOf, ...bps, asOf, ...bps)) bal.set(r.bp, r.b);
    // tài khoản ngân hàng / ví từ Danh mục đối tác (nạp file ERP Export_C_BPartner) – dùng khi chủ nhà chưa nhập tay số tài khoản
    const K = new Map(); try { for (const r of all(`SELECT * FROM pc_bank WHERE bp IN (${ph}) ORDER BY is_default DESC, id`, ...bps)) (K.get(r.bp) || K.set(r.bp, []).get(r.bp)).push(r); } catch { }
    const E = new Map(all(`SELECT * FROM landlord`).map(r => [r.bp, r])), today = asOf < '9999' ? asOf : new Date().toISOString().slice(0, 10);
    let rows = [...G.values()].map(g => { const e = E.get(g.bp) || {}, p = pay.get(g.bp) || {}, pe = g.periods.sort((a, b) => a.t.localeCompare(b.t)).at(-1) || null, rr = g.rates.sort((a, b) => a.d.localeCompare(b.d)).at(-1);
      const cons = [...g.contracts].sort((a, b) => b[1] - a[1]).map(c => c[0]), end = e.contract_end || (pe ? pe.t : '');
      return { bp: g.bp, vcode: g.vcode, name: g.name, site: e.site || [...g.sites].join(', '), sitesAuto: [...g.sites], contracts: cons, contract: cons[0] || '', rec: g.rec, n: g.n, paid: p.a || 0, lastPay: p.d || '', nPay: p.n || 0, bal: bal.get(g.bp) || 0,
        periodFrom: pe ? pe.f : '', periodTo: pe ? pe.t : '', end, daysLeft: end ? Math.round((Date.parse(end) - Date.parse(today)) / 864e5) : null, rent: e.rent_month !== undefined && e.rent_month !== null && e.rent_month !== '' ? +e.rent_month : (rr ? rr.r : null),
        first: g.first, last: g.last, bank_acc: e.bank_acc || (K.get(g.bp) || [])[0]?.acc_no || '', bank_name: e.bank_name || (e.bank_acc ? '' : (K.get(g.bp) || [])[0]?.bank || ''), acc_holder: e.acc_holder || (e.bank_acc ? '' : (K.get(g.bp) || [])[0]?.acc_name || ''), bankSrc: e.bank_acc ? 'manual' : K.get(g.bp) ? 'erp' : '', banks: (K.get(g.bp) || []).map(b => ({ bank: b.bank, acc_no: b.acc_no, acc_name: b.acc_name, swift: b.swift, emoney: b.emoney, is_default: b.is_default })), phone: e.phone || '', address: e.address || '', status: e.status || '', note: e.note || '', edited: !!E.get(g.bp) }; });
    const q = s(o.q).toLowerCase(); if (q) rows = rows.filter(r => [r.bp, r.name, r.site, r.contracts.join(' '), r.bank_acc, r.phone].join(' ').toLowerCase().includes(q));
    if (o.only === 'nobank') rows = rows.filter(r => !r.bank_acc); else if (o.only === 'bal') rows = rows.filter(r => Math.abs(r.bal) > 0.004); else if (o.only === 'exp') rows = rows.filter(r => r.daysLeft != null && r.daysLeft <= (+o.days || 60));
    else if (o.only === 'nosite') rows = rows.filter(r => !r.site);
    rows.sort((a, b) => String(a.site || 'zz').localeCompare(String(b.site || 'zz')) || a.name.localeCompare(b.name));
    return { rows, fields: EDIT, asOf: today, total: G.size };
  }
  function detail(bp, o = {}) { const asOf = s(o.asOf) || '9999-12-31';
    return all(`SELECT id, account_date d, document_no doc, acc_debit dr, acc_credit cr, amount a, contract, description ds, CASE WHEN acc_credit LIKE '331%' THEN amount ELSE -amount END sgn FROM entries
      WHERE ((acc_credit LIKE '331%' AND partner_credit=?) OR (acc_debit LIKE '331%' AND partner_debit=?)) AND account_date<=? ORDER BY account_date, id LIMIT 20000`, bp, bp, asOf); }
  function save(bp, o) { const v = EDIT.map(([k]) => s(o[k])); run(`INSERT OR REPLACE INTO landlord(bp, ${EDIT.map(e => e[0]).join(',')}, updated_at) VALUES(?,${EDIT.map(() => '?').join(',')},datetime('now','localtime'))`, bp, ...v); return { ok: 1 }; }
  function clear(bp) { return { n: run(`DELETE FROM landlord WHERE bp=?`, bp).changes }; }
  // Nạp bổ sung từ Excel: cột nhận theo tên (mã đối tượng / mã NCC / tên / mã trạm + số tài khoản, ngân hàng, chủ TK, SĐT, địa chỉ, hết hạn HĐ, giá thuê, ghi chú)
  function importAoa(aoa) {
    const low = v => s(v).toLowerCase(), h = aoa.findIndex(r => r.some(c => /tài khoản|account|bank/i.test(s(c)))); if (h < 0) throw new Error('Không thấy cột số tài khoản / account trong file');
    const H = aoa[h].map(low), col = re => H.findIndex(x => re.test(x));
    const C = { bp: col(/đối tượng|partner|vendor code|mã ncc|supplier code/), name: col(/^tên|name|chủ nhà|landlord/), site: col(/mã (nhà )?trạm|site|bts/), bank_acc: col(/số tài khoản|account no|account number|^account$|bank account|^stk$/), bank_name: col(/ngân hàng|^bank$|bank name/),
      acc_holder: col(/chủ tài khoản|account name|holder/), phone: col(/điện thoại|phone|sđt|mobile/), address: col(/địa chỉ|address|vị trí/), contract_end: col(/hết hạn|expir|end date/), rent_month: col(/giá thuê|rent|monthly/), note: col(/ghi chú|note/) };
    if (C.bank_acc < 0) throw new Error('Thiếu cột số tài khoản');
    const R = scan({}).rows, byVc = new Map(R.map(r => [r.vcode.toUpperCase(), r])), byBp = new Map(R.map(r => [r.bp.toUpperCase(), r])), bySite = new Map(), byName = new Map();
    for (const r of R) { for (const t of r.sitesAuto) bySite.set(t, r); byName.set(r.name.toLowerCase(), r); }
    let n = 0, miss = [];
    for (const row of aoa.slice(h + 1)) { const g = k => C[k] >= 0 ? s(row[C[k]]) : ''; if (!g('bank_acc') && !g('phone')) continue;
      const key = g('bp').toUpperCase(), r = byBp.get(key) || byVc.get(key) || byVc.get((key.match(/[A-Z]*VEN_?\d+/) || [''])[0]) || bySite.get(g('site').toUpperCase()) || byName.get(g('name').toLowerCase());
      if (!r) { miss.push(g('bp') || g('site') || g('name')); continue; }
      const old = get(`SELECT * FROM landlord WHERE bp=?`, r.bp) || {}, o = {}; for (const [k] of EDIT) o[k] = g(k) || old[k] || ''; save(r.bp, o); n++; }
    return { n, miss: miss.length, missList: miss.slice(0, 20) };
  }
  return { scan, detail, save, clear, importAoa, FIELDS: EDIT };
}
module.exports = { make };
