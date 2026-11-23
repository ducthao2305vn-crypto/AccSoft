'use strict';
// Phân tích quỹ khen thưởng – phúc lợi (TK 353 hạch toán chung): gom theo số chứng từ, tách Khen thưởng / Phúc lợi, gán "năm của quỹ".
// Chỉ phân tích theo năm. Vế Có 353 = tăng quỹ (trích lập, hoàn lại); vế Nợ 353 = chi quỹ.
// Tự động: loại theo từ khoá diễn giải, năm quỹ = năm nhắc trong diễn giải (nếu có) hoặc năm chứng từ.
// Người dùng sửa loại / năm quỹ / số khen thưởng trong chứng từ trích lập chung → lưu fund_cls theo (số CT, vế, năm CT) nên giữ nguyên khi nạp lại dữ liệu.
const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const KT = [/khen thuong/, /\breward/, /\bbonus/, /thi dua/, /emulation/, /\baward/, /\bprize/, /incentive/, /\btien thuong\b/, /\bthuong (tet|nam|quy|thang|hoan thanh|dot xuat|ca nhan|tap the)/];
const PL = [/phuc loi/, /welfare/, /birthday/, /sinh nhat/, /insurance/, /bao hiem/, /healthcare/, /health check/, /kham suc khoe/, /holiday/, /du lich/, /\btrip\b/, /\btour\b/, /om dau/, /\bsick/, /funeral/, /hieu hy/, /\bhieu\b/, /wedding/, /dam cuoi/, /\bgift/, /qua tet/, /\bparty/, /tiec/, /team ?building/, /the thao/, /\bsport/, /tro cap/, /allowance for (staff|employee)/, /condolence/, /thai san/, /maternity/, /trung thu/, /mid.?autumn/, /children'?s day/, /thieu nhi/, /\b8\/3\b/, /women'?s day/, /phu nu/];
const yearOf = (s, lo, hi) => { const m = String(s || '').match(/(?:^|[^\d])(20\d\d)(?!\d)/g) || []; for (const x of m) { const y = +x.replace(/\D/g, ''); if (y >= lo && y <= hi) return y; } return null; };
function autoType(ds) {
  const t = nz(ds), k = KT.some(r => r.test(t)), p = PL.some(r => r.test(t));
  if (k && !p) return 'kt'; if (p && !k) return 'pl';
  if (k && p) return /khen thuong|reward|bonus/.test(t) && !/phuc loi|welfare/.test(t) ? 'kt' : /phuc loi|welfare/.test(t) && !/khen thuong|reward|bonus/.test(t) ? 'pl' : 'mix';
  return '';
}
function make(db, all, get) {
  db.exec(`CREATE TABLE IF NOT EXISTS fund_cls(doc TEXT, side TEXT, y INTEGER, typ TEXT, fy INTEGER, kt REAL, note TEXT, at TEXT, PRIMARY KEY(doc, side, y))`);
  const cfgGet = () => { try { return Object.assign({ accs: ['353'] }, JSON.parse((get(`SELECT v FROM settings WHERE k='fund353_cfg'`) || {}).v || '{}')); } catch { return { accs: ['353'] }; } };
  const setCfg = o => { const old = cfgGet(), c = { accs: o && o.accs != null ? [...new Set(String(o.accs).split(/[,;\s]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x)))] : old.accs, ob: o && o.ob ? { kt: +o.ob.kt || 0, pl: +o.ob.pl || 0, un: +o.ob.un || 0 } : old.ob }; if (!c.accs.length) c.accs = ['353']; db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES('fund353_cfg', ?)`).run(JSON.stringify(c)); return c; };
  // Dòng bút toán có vế TK quỹ (một bút toán Nợ 353 / Có 353 → 2 dòng)
  function lines() { const A = cfgGet().accs, like = c => '(' + A.map(() => `${c} LIKE ?`).join(' OR ') + ')', P = A.map(a => a + '%');
    const R = all(`SELECT id, document_no doc, account_date d, acc_debit dr, acc_credit cr, amount v, description ds, description_parent dsp, partner_debit bpD, partner_credit bpC, department dept
      FROM entries WHERE ${like('acc_debit')} OR ${like('acc_credit')} ORDER BY account_date, document_no, id`, ...P, ...P);
    const isF = a => A.some(x => String(a || '').startsWith(x)), out = [];
    for (const r of R) { if (isF(r.cr)) out.push({ ...r, side: 'cr', acc: r.cr, other: r.dr, bp: r.bpC || r.bpD }); if (isF(r.dr)) out.push({ ...r, side: 'dr', acc: r.dr, other: r.cr, bp: r.bpD || r.bpC }); }
    return out; }
  // Gom theo (số CT, vế, năm CT)
  function docs() {
    const L = lines(), M = new Map(), O = new Map(all(`SELECT * FROM fund_cls`).map(x => [x.doc + '|' + x.side + '|' + x.y, x]));
    let lo = 9999, hi = 0; for (const x of L) { const y = +String(x.d).slice(0, 4); if (y < lo) lo = y; if (y > hi) hi = y; }
    for (const x of L) { const y = +String(x.d).slice(0, 4), k = (x.doc || '(không số)') + '|' + x.side + '|' + y;
      let g = M.get(k); if (!g) M.set(k, g = { key: k, doc: x.doc || '(không số)', side: x.side, y, d1: x.d, d2: x.d, v: 0, n: 0, accs: new Set(), oth: new Set(), ds: x.dsp || x.ds || '', dss: new Set(), dept: x.dept || '', bp: x.bp || '', ob: true });
      g.v += +x.v || 0; g.n++; if (String(x.other || '').toUpperCase() !== 'OB') g.ob = false; if (x.d < g.d1) g.d1 = x.d; if (x.d > g.d2) g.d2 = x.d; g.accs.add(x.acc); if (x.other) g.oth.add(String(x.other)); if (x.ds) g.dss.add(x.ds); }
    const out = [];
    for (const g of M.values()) { const all_ = [g.ds, ...g.dss].join(' \n '), at = autoType(all_), ay = yearOf(g.ds, lo - 3, hi + 1) || yearOf(all_, lo - 3, hi + 1) || g.y, o = O.get(g.key);
      const typ = o && o.typ ? o.typ : at, fy = o && o.fy ? o.fy : ay, split = typ === 'mix' && o && o.kt != null;
      // trích chung: chưa nhập số khen thưởng → cả chứng từ tính "chưa phân loại" cho tới khi tách
      const kt = typ === 'mix' ? (split ? Math.min(g.v, Math.max(0, +o.kt)) : 0) : typ === 'kt' ? g.v : 0, pl = typ === 'mix' ? (split ? g.v - kt : 0) : typ === 'pl' ? g.v : 0;
      out.push({ key: g.key, doc: g.doc, side: g.side, y: g.y, d1: g.d1, d2: g.d2, v: g.v, n: g.n, accs: [...g.accs].join(', '), other: [...g.oth].slice(0, 4).join(', ') + (g.oth.size > 4 ? '…' : ''), ds: g.ds || [...g.dss][0] || '', nDs: g.dss.size, dept: g.dept, bp: g.bp,
        autoTyp: at, autoFy: ay, typ, fy, kt, pl, un: typ === 'kt' || typ === 'pl' || split ? 0 : g.v, split, ob: g.ob, edited: !!o, note: o ? o.note || '' : '' }); }
    return out.sort((a, b) => a.d1 < b.d1 ? -1 : a.d1 > b.d1 ? 1 : a.doc < b.doc ? -1 : 1);
  }
  // Tổng hợp theo năm quỹ: tăng / chi / còn của Khen thưởng, Phúc lợi, Chưa phân loại; kèm theo năm chứng từ
  function report() {
    const D = docs(), Y = new Map(), C = new Map(), row = (m, y) => m.get(y) || (m.set(y, { y, ktIn: 0, ktOut: 0, plIn: 0, plOut: 0, unIn: 0, unOut: 0, n: 0 }), m.get(y));
    // Số dư đầu kỳ: bút toán đối ứng TK OB (nạp từ file số dư) + số nhập tay; tách KT/PL như chứng từ trích chung
    const man = Object.assign({ kt: 0, pl: 0, un: 0 }, cfgGet().ob || {}), dat = { kt: 0, pl: 0, un: 0 };
    for (const x of D) if (x.ob) { const g = x.side === 'cr' ? 1 : -1; dat.kt += g * x.kt; dat.pl += g * x.pl; dat.un += g * x.un; }
    const OB = { kt: dat.kt + man.kt, pl: dat.pl + man.pl, un: dat.un + man.un }; OB.tot = OB.kt + OB.pl + OB.un;
    for (const x of D) { if (x.ob) continue; const s = x.side === 'cr' ? 'In' : 'Out';
      for (const [m, y] of [[Y, x.fy], [C, x.y]]) { const r = row(m, y); r['kt' + s] += x.kt; r['pl' + s] += x.pl; r['un' + s] += x.un; r.n++; } }
    const fin = m => [...m.values()].sort((a, b) => a.y - b.y).map(r => ({ ...r, kt: r.ktIn - r.ktOut, pl: r.plIn - r.plOut, un: r.unIn - r.unOut, bal: r.ktIn + r.plIn + r.unIn - r.ktOut - r.plOut - r.unOut }));
    const byFund = fin(Y); let ck = OB.kt, cp = OB.pl, cu = OB.un; for (const r of byFund) { Object.assign(r, { ktDk: ck, plDk: cp, unDk: cu, dk: ck + cp + cu }); ck += r.kt; cp += r.pl; cu += r.un; Object.assign(r, { ktCum: ck, plCum: cp, unCum: cu, cum: ck + cp + cu }); }
    // Chéo năm chứng từ × năm quỹ (chi): chi năm nay từ quỹ năm nào
    const X = {}; for (const x of D) if (x.side === 'dr' && !x.ob) { const k = x.y + '|' + x.fy; X[k] = X[k] || { y: x.y, fy: x.fy, kt: 0, pl: 0, un: 0 }; X[k].kt += x.kt; X[k].pl += x.pl; X[k].un += x.un; }
    return { cfg: cfgGet(), docs: D, ob: { ...OB, data: dat, manual: man, nDocs: D.filter(x => x.ob).length }, byFund, byDoc: fin(C), cross: Object.values(X).sort((a, b) => a.y - b.y || a.fy - b.fy), nUn: D.filter(x => x.un).length, nEdit: D.filter(x => x.edited).length };
  }
  // L: [{key, typ?, fy?, kt?, note?}] – chỉ ghi trường được gửi; typ '' + fy null + kt null = xoá sửa tay
  function set(L) { const up = db.prepare(`INSERT INTO fund_cls(doc, side, y, typ, fy, kt, note, at) VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(doc, side, y) DO UPDATE SET typ=coalesce(excluded.typ, fund_cls.typ), fy=coalesce(excluded.fy, fund_cls.fy), kt=coalesce(excluded.kt, fund_cls.kt), note=coalesce(excluded.note, fund_cls.note), at=excluded.at`);
    let n = 0; db.exec('BEGIN'); try { for (const x of [].concat(L || [])) { const [doc, side, y] = String(x.key).split('|'); if (!doc || !side || !y) continue;
        up.run(doc, side, +y, x.typ === undefined ? null : String(x.typ), x.fy === undefined || x.fy === '' || x.fy == null ? null : +x.fy, x.kt === undefined || x.kt === '' || x.kt == null ? null : +x.kt, x.note === undefined ? null : String(x.note)); n++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n }; }
  function reset(keys) { const del = db.prepare(`DELETE FROM fund_cls WHERE doc=? AND side=? AND y=?`); let n = 0; for (const k of [].concat(keys || [])) { const [doc, side, y] = String(k).split('|'); n += del.run(doc, side, +y).changes; } return { n }; }
  function docLines(key) { const [doc, side, y] = String(key).split('|'); return lines().filter(x => (x.doc || '(không số)') === doc && x.side === side && String(x.d).startsWith(y)); }
  return { report, set, reset, docLines, cfg: cfgGet, setCfg };
}
module.exports = { make, autoType, yearOf };
