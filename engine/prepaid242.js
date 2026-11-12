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
  // Phát hiện sai sót phân bổ theo từng đợt trả trước (đợt = kỳ ghi trên diễn giải dòng Nợ 242):
  //  - Book sai kỳ: phân bổ (Có 242) hạch toán tháng nằm ngoài kỳ của đợt
  //  - Chậm / thiếu kỳ: tháng trong kỳ (≤ ngày xem) chưa phân bổ
  //  - Dồn kỳ: một tháng phân bổ ≈ k lần mức tháng (book chậm rồi gộp)
  //  - Số tiền phân bổ sai: lệch mức tháng (trả trước ÷ số tháng của kỳ), không phải bội số
  //  - Diễn giải kỳ khác: diễn giải dòng phân bổ ghi kỳ khác với đợt đang phân bổ
  const ymAdd = (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const ymsOf = (f, t) => { const out = []; for (let y = f.slice(0, 7); y <= t.slice(0, 7) && out.length < 240; y = ymAdd(y, 1)) out.push(y); return out; };
  function analyze(L, asOf) {
    const B = new Map(), cur = asOf.slice(0, 7), iss = [];
    for (const x of L) { if (x.side !== 'dr') continue; const p = period(x.ds); if (!p) continue; const k = p.f + '|' + p.t; const b = B.get(k) || B.set(k, { f: p.f, t: p.t, up: 0, am: new Map(), amDs: [] }).get(k); b.up += x.a; }
    if (!B.size) return iss;
    const batches = [...B.values()].sort((a, b) => a.f.localeCompare(b.f));
    for (const x of L) { if (x.side !== 'cr') continue; const p = period(x.ds); let b = p ? B.get(p.f + '|' + p.t) : null;
      if (!b) b = batches.find(z => x.ym >= z.f.slice(0, 7) && x.ym <= z.t.slice(0, 7)) || null;
      if (!b) { iss.push({ k: 'wrongperiod', ym: x.ym, a: x.a, msg: `Phân bổ ${x.ym} không thuộc kỳ trả trước nào` }); continue; }
      b.am.set(x.ym, (b.am.get(x.ym) || 0) + x.a); if (p && !(p.f === b.f && p.t === b.t)) iss.push({ k: 'descperiod', ym: x.ym, a: x.a, msg: `Diễn giải ghi kỳ ${p.f.slice(0, 7)}→${p.t.slice(0, 7)} khác kỳ đợt ${b.f.slice(0, 7)}→${b.t.slice(0, 7)}` }); }
    for (const b of batches) {
      const M = ymsOf(b.f, b.t), per = b.up / Math.max(1, M.length), tol = Math.max(0.05, per * 0.02);
      for (const [ym, a] of b.am) {
        if (ym < M[0] || ym > M[M.length - 1]) iss.push({ k: 'wrongperiod', ym, a, msg: `Book sai kỳ: phân bổ tháng ${ym} cho kỳ ${b.f.slice(0, 7)}→${b.t.slice(0, 7)}` });
        else { const r = a / per; if (Math.abs(a - per) > tol) { if (r > 1.5 && Math.abs(r - Math.round(r)) < 0.05) iss.push({ k: 'lumped', ym, a, msg: `Dồn ${Math.round(r)} kỳ vào tháng ${ym} (mức tháng ${per.toFixed(2)})` }); else iss.push({ k: 'amount', ym, a, msg: `Số tiền phân bổ ${ym} = ${a.toFixed(2)} ≠ mức tháng ${per.toFixed(2)}` }); } } }
      let lumpedCover = 0; for (const z of iss) if (z.k === 'lumped') lumpedCover += Math.round(z.a / per) - 1;
      const miss = M.filter(ym => ym <= cur && !b.am.has(ym)); if (miss.length > lumpedCover) iss.push({ k: 'late', ym: miss[0], a: per * (miss.length - lumpedCover), msg: `Chậm / thiếu phân bổ ${miss.length - lumpedCover} tháng: ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}` });
      const tot = [...b.am.values()].reduce((q, v) => q + v, 0); if (tot - b.up > tol) iss.push({ k: 'over', ym: '', a: tot - b.up, msg: `Phân bổ vượt số trả trước của kỳ ${b.f.slice(0, 7)}→${b.t.slice(0, 7)}: ${(tot - b.up).toFixed(2)}` });
    }
    // gộp theo loại: số lần, tổng tiền, các tháng, một câu mô tả mẫu
    const KM = { wrongperiod: 'Book sai kỳ', late: 'Chậm / thiếu phân bổ', lumped: 'Dồn kỳ', amount: 'Số tiền phân bổ sai', descperiod: 'Diễn giải kỳ khác kỳ phân bổ', over: 'Phân bổ vượt' }, G2 = new Map();
    for (const z of iss) { const g = G2.get(z.k) || G2.set(z.k, { k: z.k, label: KM[z.k], n: 0, a: 0, months: new Set(), msg: z.msg }).get(z.k); g.n++; g.a += z.a || 0; if (z.ym) g.months.add(z.ym); }
    return [...G2.values()].map(g => ({ ...g, months: [...g.months].sort() }));
  }
  function report(o = {}) {
    const asOf = day(o.asOf) || new Date().toISOString().slice(0, 10), accs = (o.accs && o.accs.length ? o.accs : ['24211', '24218', '24228']).map(x => s(x).replace(/\D/g, '')).filter(Boolean);
    const W = c => '(' + accs.map(a => `${c} LIKE '${a}%'`).join(' OR ') + ')';
    const L = all(`SELECT account_date d, document_no doc, acc_debit dr, acc_credit cr, partner_debit pd, partner_credit pc, amount a, contract c, type_of_cost t, dist_from df, dist_to dt, description ds, bts_site bts, location loc
      FROM entries WHERE (${W('acc_debit')} OR ${W('acc_credit')}) AND account_date<=? AND NOT (acc_debit=acc_credit AND ifnull(partner_debit,'')=ifnull(partner_credit,'') AND ifnull(contract,'')<>'')`, asOf);
    const G = new Map();
    for (const x of L) for (const side of ['dr', 'cr']) {
      const acc = s(x[side]); if (!accs.some(a => acc.startsWith(a))) continue;
      const bp = s(side === 'dr' ? x.pd : x.pc) || s(side === 'dr' ? x.pc : x.pd), c = s(x.c);
      const key = acc + '|' + (c || 'NOC|' + bp + '|' + s(x.t)), g = G.get(key) || G.set(key, { acc, c, bp, t: s(x.t), up: 0, amo: 0, n: 0, f: null, to: null, first: x.d, lastAmo: null, sites: new Set(), desc: '', L: [] }).get(key);
      if (g.L.length < 2000) g.L.push({ side, d: x.d, ym: s(x.d).slice(0, 7), a: x.a, ds: x.ds, doc: x.doc });
      g.n++; if (!g.t && x.t) g.t = s(x.t); if (!g.bp && bp) g.bp = bp;
      for (const st of sitesOf(c, bp, x.ds, x.bts, x.loc)) g.sites.add(st);
      if (side === 'dr') { g.up += x.a; if (!g.desc) g.desc = s(x.ds);
        const p = x.df && x.dt ? { f: day(x.df), t: day(x.dt) } : period(x.ds); if (p) { if (!g.f || p.f < g.f) g.f = p.f; if (!g.to || p.t > g.to) g.to = p.t; } }
      else { g.amo += x.a; if (!g.lastAmo || x.d > g.lastAmo) g.lastAmo = x.d; }
      if (x.d < g.first) g.first = x.d;
    }
    const items = [];
    for (const g of G.values()) {
      const bal = g.up - g.amo; if (Math.abs(bal) < 0.005 && !o.all && !o.withIssues) continue;
      let expected = null, monthsLeft = null, st = 'ok';
      if (g.f && g.to && g.up > 0.005) { const tot = Math.max(1, mdiff(g.f, g.to) + 1), done = Math.min(tot, Math.max(0, mdiff(g.f, asOf) + 1)); expected = g.up * (tot - done) / tot; monthsLeft = tot - done; }
      if (bal < -0.005) st = 'over';
      else if (g.up > 0.005 && g.amo < 0.005 && bal > 0.005 && (!g.f || g.f <= asOf)) st = 'never';
      else if (g.to && g.to < asOf && bal > Math.max(1, 0.01 * g.up)) st = 'expired';
      else if (expected != null && bal - expected > Math.max(1, 0.1 * g.up)) st = 'slow';
      else if (expected != null && expected - bal > Math.max(1, 0.1 * g.up)) st = 'fast';
      else if (!g.f && bal > 0.005) st = 'noperiod';
      const { L: GL, ...g0 } = g, issues = analyze(GL, asOf);
      items.push({ ...g0, sites: [...g.sites], bal, expected, monthsLeft, st, idle: g.lastAmo ? mdiff(g.lastAmo, asOf) : null, issues });
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
  return { report, lines, period, analyze, ymsOf };
}
module.exports = { make };
