'use strict';
// Chi phí trả trước 242 (24211 thuê trạm / 24218 trả trước khác / 24228 CCDC chờ phân bổ…) – còn lại chưa phân bổ theo khoản mục, trạm, hợp đồng.
// Mỗi "khoản" = TK 242 chi tiết × hợp đồng (không có HĐ: đối tượng × khoản mục × chứng từ gốc). Tăng = Nợ 242, phân bổ = Có 242 (bỏ dòng Nợ / Có cùng TK cùng khoản).
// Kỳ phân bổ: Distribution From / To; không có thì đọc diễn giải ("from 01/08/2026 - 31/07/2027", "Distribution 06 months from 01/10/2026 to 31/03/2027").
function make(db, all) {
  const s = v => String(v ?? '').trim(), day = d => s(d).slice(0, 10);
  const SITE = /\b([A-Z]{2}\d{4})\b/g; // mã trạm: DI0148, AL0003, AN0002…
  const sitesOf = (...t) => { const o = new Set(); for (const x of t) for (const m of s(x).toUpperCase().matchAll(SITE)) o.add(m[1]); return [...o]; };
  const ymd = (d, m, y) => `${y.length === 2 ? '20' + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function period(ds) { const t = s(ds), m = t.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\s*(?:-|–|to|đến|den)\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
    if (m) return { f: ymd(m[1], m[2], m[3]), t: ymd(m[4], m[5], m[6]) };
    const n = t.match(/(\d{1,3})\s*(?:months?|tháng)/i), f = t.match(/from\s+(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
    if (n && f) { const a = ymd(f[1], f[2], f[3]), d = new Date(a); d.setMonth(d.getMonth() + +n[1]); d.setDate(d.getDate() - 1); return { f: a, t: d.toISOString().slice(0, 10) }; }
    return null; }
  const mdiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  function report(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), accs = (o.accs && o.accs.length ? o.accs : ['24211', '24218', '24228']).map(x => s(x).replace(/\D/g, '')).filter(Boolean);
    const W = c => '(' + accs.map(a => `${c} LIKE '${a}%'`).join(' OR ') + ')';
    const L = all(`SELECT account_date d, document_no doc, acc_debit dr, acc_credit cr, partner_debit pd, partner_credit pc, amount a, contract c, type_of_cost t, dist_from df, dist_to dt, description ds, bts_site bts, location loc
      FROM entries WHERE (${W('acc_debit')} OR ${W('acc_credit')}) AND account_date<=? AND NOT (acc_debit=acc_credit AND ifnull(partner_debit,'')=ifnull(partner_credit,'') AND ifnull(contract,'')<>'')`, asOf);
    const G = new Map();
    for (const x of L) for (const side of ['dr', 'cr']) {
      const acc = s(x[side]); if (!accs.some(a => acc.startsWith(a))) continue;
      const bp = s(side === 'dr' ? x.pd : x.pc) || s(side === 'dr' ? x.pc : x.pd), c = s(x.c);
      const key = acc + '|' + (c || 'NOC|' + bp + '|' + s(x.t)), g = G.get(key) || G.set(key, { acc, c, bp, t: s(x.t), up: 0, amo: 0, n: 0, f: null, to: null, first: x.d, lastAmo: null, sites: new Set(), desc: '' }).get(key);
      g.n++; if (!g.t && x.t) g.t = s(x.t); if (!g.bp && bp) g.bp = bp;
      for (const st of sitesOf(c, bp, x.ds, x.bts, x.loc)) g.sites.add(st);
      if (side === 'dr') { g.up += x.a; if (!g.desc) g.desc = s(x.ds);
        const p = x.df && x.dt ? { f: day(x.df), t: day(x.dt) } : period(x.ds); if (p) { if (!g.f || p.f < g.f) g.f = p.f; if (!g.to || p.t > g.to) g.to = p.t; } }
      else { g.amo += x.a; if (!g.lastAmo || x.d > g.lastAmo) g.lastAmo = x.d; }
      if (x.d < g.first) g.first = x.d;
    }
    const items = [];
    for (const g of G.values()) {
      const bal = g.up - g.amo; if (Math.abs(bal) < 0.005 && !o.all) continue;
      let expected = null, monthsLeft = null, st = 'ok';
      if (g.f && g.to && g.up > 0.005) { const tot = Math.max(1, mdiff(g.f, g.to) + 1), done = Math.min(tot, Math.max(0, mdiff(g.f, asOf) + 1)); expected = g.up * (tot - done) / tot; monthsLeft = tot - done; }
      if (bal < -0.005) st = 'over';
      else if (g.up > 0.005 && g.amo < 0.005 && bal > 0.005 && (!g.f || g.f <= asOf)) st = 'never';
      else if (g.to && g.to < asOf && bal > Math.max(1, 0.01 * g.up)) st = 'expired';
      else if (expected != null && bal - expected > Math.max(1, 0.1 * g.up)) st = 'slow';
      else if (expected != null && expected - bal > Math.max(1, 0.1 * g.up)) st = 'fast';
      else if (!g.f && bal > 0.005) st = 'noperiod';
      items.push({ ...g, sites: [...g.sites], bal, expected, monthsLeft, st, idle: g.lastAmo ? mdiff(g.lastAmo, asOf) : null });
    }
    items.sort((a, b) => b.bal - a.bal);
    const sum = (k, f) => { const m = new Map(); for (const x of items) { const key = f(x); const q = m.get(key) || m.set(key, { key, bal: 0, n: 0, bad: 0, badBal: 0 }).get(key); q.bal += x.bal; q.n++; if (['expired', 'never', 'over', 'slow'].includes(x.st)) { q.bad++; q.badBal += x.bal; } } return [...m.values()].sort((a, b) => b.bal - a.bal); };
    return { asOf, accs, items, byAcc: sum('acc', x => x.acc), byCost: sum('t', x => x.acc + '|' + (x.t || '(chưa có khoản mục)')), bySite: sum('site', x => x.sites[0] || '(không nhận ra mã trạm)'),
      byStatus: sum('st', x => x.st), tot: { bal: items.reduce((q, x) => q + x.bal, 0), n: items.length } };
  }
  function lines(o = {}) { const asOf = day(o.asOf) || '9999-12-31', acc = s(o.acc), c = s(o.c);
    return all(`SELECT account_date d, document_no doc, acc_debit dr, acc_credit cr, partner_debit pd, partner_credit pc, amount a, contract c, type_of_cost t, description ds, created_by u FROM entries
      WHERE (acc_debit=? OR acc_credit=?) AND account_date<=? AND ${c ? 'contract=?' : `ifnull(contract,'')='' AND (partner_debit=? OR partner_credit=?) AND ifnull(type_of_cost,'')=?`} ORDER BY account_date LIMIT 3000`,
      acc, acc, asOf, ...(c ? [c] : [s(o.bp), s(o.bp), s(o.t)])); }
  return { report, lines, period };
}
module.exports = { make };
