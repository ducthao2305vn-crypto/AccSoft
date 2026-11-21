'use strict';
// Kết quả hoạt động (Operation Result) theo khoản mục – mẫu file "Operation_Result_end_of_month":
//   Doanh thu theo Sales Region (mã trước "_"; thiếu thì Type of revenue), Chi phí theo Type of cost; nhóm Level 1 → Level 2 → khoản mục theo danh mục (sheet DM).
//   Kỳ: tháng / quý / năm trong khoảng chọn; so sánh 2 kỳ bất kỳ cùng loại. Số liệu từ bảng tổng hợp agg (đã loại kết chuyển 911), Source Amount.
const T = s => String(s ?? '').trim();
const codeOf = s => { s = T(s); if (!s) return ''; const i = s.indexOf('_'); return (i > 0 ? s.slice(0, i) : s).trim().toUpperCase(); };
const nameOf = s => { s = T(s); const i = s.indexOf('_'); return i > 0 ? s.slice(i + 1).trim() : s; };
const perOf = (ym, g) => g === 'y' ? ym.slice(0, 4) : g === 'q' ? ym.slice(0, 4) + '-Q' + Math.ceil(+ym.slice(5, 7) / 3) : ym;
const isRevAcc = a => /^(5|7)/.test(a || ''), isExpAcc = a => /^(6|8)/.test(a || '');

function make(db, all) {
  db.exec(`CREATE TABLE IF NOT EXISTS or_cat(code TEXT PRIMARY KEY, en TEXT, vn TEXT, lv1 TEXT, lv2 TEXT, ord INTEGER, kind TEXT)`);
  const run = (q, ...a) => db.prepare(q).run(...a);
  // Nạp danh mục từ sheet DM (cột TYPE, CATEGORY, CATEGORY_VN, Level 1, Level 2) hoặc bảng bất kỳ có các tiêu đề này
  function importCat(rows, mode = 'replace') {
    let h = -1, ix = null;
    for (let i = 0; i < Math.min(rows.length, 30) && h < 0; i++) { const r = rows[i].map(x => T(x).toUpperCase());
      for (let j = r.length - 1; j >= 0; j--) if (r[j] === 'TYPE' && r[j + 1] === 'CATEGORY' && r.slice(j).some(x => x.startsWith('LEVEL 1'))) { h = i;
        ix = { code: j, en: j + 1, vn: r.indexOf('CATEGORY_VN', j), lv1: r.findIndex((x, k) => k > j && x.startsWith('LEVEL 1')), lv2: r.findIndex((x, k) => k > j && x.startsWith('LEVEL 2')) }; break; } }
    if (h < 0) throw new Error('Không tìm thấy bảng danh mục (cần các cột TYPE, CATEGORY, CATEGORY_VN, Level 1, Level 2 – như sheet DM)');
    db.exec('BEGIN'); try { if (mode === 'replace') db.exec('DELETE FROM or_cat'); let n = 0;
      const ins = db.prepare(`INSERT OR REPLACE INTO or_cat(code, en, vn, lv1, lv2, ord, kind) VALUES(?,?,?,?,?,?,?)`);
      for (const r of rows.slice(h + 1)) { const c = codeOf(r[ix.code]); if (!c) continue; const lv1 = T(r[ix.lv1]), lv2 = T(r[ix.lv2]) || lv1;
        const kind = /DOANH THU/i.test(lv1) || /^A\d|^R\d/i.test(c) && !/CHI PH/i.test(lv1) ? 'rev' : 'exp';
        ins.run(c, T(r[ix.en]), ix.vn >= 0 ? T(r[ix.vn]) : '', lv1, lv2, ++n, kind); }
      db.exec('COMMIT'); return { n }; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const cat = () => all(`SELECT * FROM or_cat ORDER BY ord`);
  const months = () => all(`SELECT DISTINCT ym FROM agg WHERE ym IS NOT NULL ORDER BY ym`).map(r => r.ym);
  // Số liệu theo khoản mục × tháng
  function data(from, to) {
    const rows = all(`SELECT ym, side, acc, tcost, coalesce(srev, trev) rv, sum(amount) a FROM agg WHERE ym>=? AND ym<=? AND substr(acc,1,1) IN ('5','6','7','8') GROUP BY 1,2,3,4,5`, from, to);
    const M = new Map(), names = new Map(), add = (kind, code, nm, ym, v) => { const k = kind + '|' + code; const o = M.get(k) || M.set(k, { kind, code, m: {} }).get(k); o.m[ym] = (o.m[ym] || 0) + v; if (nm && !names.has(k)) names.set(k, nm); };
    for (const r of rows) {
      if (isRevAcc(r.acc)) add('rev', codeOf(r.rv) || '(TRỐNG)', nameOf(r.rv), r.ym, r.side === 'cr' ? r.a : -r.a);
      else if (isExpAcc(r.acc)) add('exp', codeOf(r.tcost) || '(TRỐNG)', nameOf(r.tcost), r.ym, r.side === 'dr' ? r.a : -r.a);
    }
    return { M, names };
  }
  // gran: m | q | y; from/to: YYYY-MM; cmp: [kỳ A, kỳ B] (cùng loại với gran)
  function report(o = {}) {
    const ms = months(), g = ['m', 'q', 'y'].includes(o.gran) ? o.gran : 'm';
    const from = o.from || ms[0] || '0000-00', to = o.to || ms.at(-1) || '9999-12';
    const cmp = (o.cmp || []).filter(Boolean);
    // cần dữ liệu cả kỳ so sánh (có thể ngoài khoảng)
    const lo = [from, ...cmp.map(p => p.length === 4 ? p + '-01' : /Q/.test(p) ? p.slice(0, 4) + '-' + String((+p.slice(-1) - 1) * 3 + 1).padStart(2, '0') : p)].sort()[0];
    const hi = [to, ...cmp.map(p => p.length === 4 ? p + '-12' : /Q/.test(p) ? p.slice(0, 4) + '-' + String(+p.slice(-1) * 3).padStart(2, '0') : p)].sort().at(-1);
    const { M, names } = data(lo, hi), C = cat(), CM = new Map(C.map(c => [c.code, c]));
    const pers = [...new Set(ms.filter(m => m >= from && m <= to).map(m => perOf(m, g)))];
    const allPers = [...new Set(ms.map(m => perOf(m, g)))];
    const val = (o2, p) => { let s = 0; for (const [ym, v] of Object.entries(o2.m)) if (perOf(ym, g) === p) s += v; return s; };
    const items = [];
    for (const [k, x] of M) { const c = CM.get(x.code), kind = c ? c.kind : x.kind;
      const v = Object.fromEntries([...pers, ...cmp].map(p => [p, val(x, p)])), tot = pers.reduce((s, p) => s + v[p], 0);
      if (!Object.values(v).some(z => Math.abs(z) > 0.004)) continue;
      items.push({ kind, code: x.code, en: c ? c.en : names.get(k) || '', vn: c ? c.vn : '', lv1: c ? c.lv1 : (kind === 'rev' ? 'DOANH THU CHƯA CÓ TRONG DANH MỤC' : 'CHI PHÍ CHƯA CÓ TRONG DANH MỤC'), lv2: c ? c.lv2 : '(chưa có trong danh mục)', ord: c ? c.ord : 1e6, mapped: !!c, v, tot }); }
    items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'rev' ? -1 : 1) || a.ord - b.ord || a.code.localeCompare(b.code));
    return { gran: g, from, to, pers, allPers, cmp, items, nCat: C.length, unmapped: items.filter(i => !i.mapped).length };
  }
  return { importCat, cat, months, report };
}
module.exports = { make, codeOf, perOf };
