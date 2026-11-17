'use strict';
// Phân tích tài khoản thuế (mặc định 333x): mỗi dòng bút toán có vế TK thuế → 1 dòng phân tích (bút toán Nợ thuế / Có thuế cả 2 vế → 2 dòng).
// Kỳ kê khai mặc định = năm_tháng ngày chứng từ; người dùng đổi kỳ (lưu tax_period theo id bút toán + vế, kèm chữ ký nội dung để gắn lại khi nạp lại dữ liệu).
// Tổng hợp theo TK thuế × kỳ kê khai và theo năm: Có (kê khai / phải nộp) − Nợ (nộp tiền / khấu trừ) = chênh lệch, kỳ đã khớp phải = 0.
const SIG = `document_no||'|'||account_date||'|'||acc_debit||'|'||acc_credit||'|'||cast(round(coalesce(amount_acc,amount)*100) AS INTEGER)||'|'||ifnull(partner_debit,'')||'|'||ifnull(partner_credit,'')`;
function make(db, all) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  db.exec(`CREATE TABLE IF NOT EXISTS tax_period(id INTEGER, side TEXT, period TEXT, note TEXT, sig TEXT, at TEXT, PRIMARY KEY(id, side))`);
  try { db.exec(`ALTER TABLE tax_period ADD COLUMN st TEXT`); } catch { } // trạng thái phân tích: ok = chính xác, sus = nghi ngờ
  const get = k => { const r = all(`SELECT v FROM settings WHERE k=?`, k)[0]; try { return r && r.v ? JSON.parse(r.v) : null; } catch { return null; } };
  const accs = () => get('taxacc_accs') || ['333'];
  const setAccs = L => { db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES('taxacc_accs', ?)`).run(JSON.stringify(String(L || '').split(/[,; ]+/).filter(Boolean))); return accs(); };
  const like = (col, A) => '(' + A.map(() => `${col} LIKE ?`).join(' OR ') + ')';
  const defP = (d, back = 0) => { let y = +String(d || '').slice(0, 4), m = +String(d || '').slice(5, 7) - back; while (m < 1) { m += 12; y--; } return y + '_' + String(m).padStart(2, '0'); };
  // nộp tiền thường trễ so với kỳ kê khai: dòng Nợ thuế / Có tiền mặc định thuộc kỳ = tháng nộp − lag (mặc định 1 tháng)
  const lag = () => { const v = get('taxacc_lag'); return v == null ? 1 : Math.max(0, +v || 0); };
  const setLag = v => { db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES('taxacc_lag', ?)`).run(JSON.stringify(Math.max(0, +v || 0))); return lag(); };
  const cash = a => /^11[123]/.test(a || '');
  // dòng phân tích trong khoảng ngày (theo ngày chứng từ) – kỳ kê khai đã đổi có thể nằm ngoài khoảng, vẫn hiển thị theo kỳ mới
  function lines(o = {}) {
    // lọc theo KỲ KÊ KHAI (không theo ngày chứng từ): lấy chứng từ rộng ra ±12 tháng rồi giữ dòng có kỳ trong khoảng – để kỳ 12 nộp tiền tháng 1 năm sau vẫn đủ
    const A = accs(), F = String(o.from || '0000-01-01').slice(0, 10), T = String(o.to || '9999-12-31').slice(0, 10), P = A.map(a => a + '%');
    const pf = F.slice(0, 4) + '_' + F.slice(5, 7), pt = T.slice(0, 4) + '_' + T.slice(5, 7), sh = (d, k) => { const y = +d.slice(0, 4) + k; return y < 1 ? d : String(y).padStart(4, '0') + d.slice(4); };
    const f = sh(F, -1), t = sh(T, 1);
    const rows = all(`SELECT e.id, e.document_no doc, e.account_date d, e.description ds, e.description_parent dsp, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drn, e.acc_credit_name crn, e.amount a,
        e.partner_debit bp, e.partner_credit bpCr, e.created_by u FROM entries e WHERE e.account_date>=? AND e.account_date<=? AND (${like('e.acc_debit', A)} OR ${like('e.acc_credit', A)}) ORDER BY e.account_date, e.document_no, e.id`, f, t, ...P, ...P);
    const ov = new Map(all(`SELECT id||'|'||side k, period, note, st FROM tax_period`).map(r => [r.k, r])), LAG = lag();
    const isT = a => A.some(p => String(a || '').startsWith(p)), out = [];
    for (const r of rows) for (const side of ['dr', 'cr']) { const acc = side === 'dr' ? r.dr : r.cr; if (!isT(acc)) continue; const o2 = ov.get(r.id + '|' + side), pay = side === 'dr' && cash(r.cr), p0 = defP(r.d, pay ? LAG : 0);
      out.push({ id: r.id, side, doc: r.doc, d: r.d, ds: r.ds || r.dsp || '', dr: r.dr, cr: r.cr, acc, accName: side === 'dr' ? r.drn : r.crn, other: side === 'dr' ? r.cr : r.dr,
        debit: side === 'dr' ? r.a : 0, credit: side === 'cr' ? r.a : 0, bp: side === 'dr' ? r.bp : r.bpCr, u: r.u, pay, p0, period: o2 && o2.period ? o2.period : p0, changed: !!(o2 && o2.period), note: o2 ? o2.note || '' : '', st: o2 ? o2.st || '' : '' }); }
    return out.filter(x => x.period >= pf && x.period <= pt);
  }
  // tổng hợp theo TK thuế × kỳ kê khai, và theo TK × năm (năm của kỳ kê khai)
  function report(o = {}) {
    const L = lines(o), lvl = +o.level || 0, K = a => lvl ? String(a).slice(0, lvl) : a, cash = a => /^11[123]/.test(a || '');
    const byP = new Map(), byY = new Map(), name = new Map();
    for (const x of L) { const acc = K(x.acc); if (!name.has(acc)) name.set(acc, x.accName || ''); const y = String(x.period).slice(0, 4);
      for (const [M, key, per] of [[byP, acc + '|' + x.period, x.period], [byY, acc + '|' + y, y]]) { const g = M.get(key) || M.set(key, { acc, per, credit: 0, debit: 0, paid: 0, other: 0, n: 0, changed: 0, ok: 0, sus: 0 }).get(key); if (x.st === 'ok') g.ok++; if (x.st === 'sus') g.sus++;
        g.credit += x.credit; g.debit += x.debit; if (x.debit) cash(x.other) ? g.paid += x.debit : g.other += x.debit; g.n++; if (x.changed) g.changed++; } }
    const fin = M => [...M.values()].map(g => ({ ...g, name: name.get(g.acc) || '', diff: g.credit - g.debit })).sort((a, b) => a.acc.localeCompare(b.acc) || String(a.per).localeCompare(String(b.per)));
    const P = fin(byP), Y = fin(byY);
    return { accs: accs(), lines: L.length > 20000 && !o.all ? null : L, nLines: L.length, byPeriod: P, byYear: Y,
      tot: { credit: L.reduce((s, x) => s + x.credit, 0), debit: L.reduce((s, x) => s + x.debit, 0), periodsOff: P.filter(g => Math.abs(g.diff) > 0.005).length, changed: L.filter(x => x.changed).length, ok: L.filter(x => x.st === 'ok').length, sus: L.filter(x => x.st === 'sus').length }, lag: lag() };
  }
  // đổi kỳ kê khai cho các dòng [{id, side}]; period rỗng = về mặc định (năm_tháng ngày chứng từ)
  // đổi kỳ kê khai / trạng thái cho các dòng [{id, side}] – giữ thông tin còn lại; bản ghi rỗng (không kỳ, không trạng thái) bị xoá
  function upsert(items, patch) {
    const getR = db.prepare(`SELECT period, note, st FROM tax_period WHERE id=? AND side=?`), del = db.prepare(`DELETE FROM tax_period WHERE id=? AND side=?`);
    const ins = db.prepare(`INSERT OR REPLACE INTO tax_period(id, side, period, note, st, sig, at) VALUES(?,?,?,?,?,(SELECT ${SIG} FROM entries WHERE id=?),datetime('now','localtime'))`);
    db.exec('BEGIN'); let n = 0; try { for (const x of [].concat(items || [])) { if (!x || !x.id) continue; const s = x.side === 'cr' ? 'cr' : 'dr', o = { ...(getR.get(+x.id, s) || {}), ...patch };
      if (!o.period && !o.st) del.run(+x.id, s); else ins.run(+x.id, s, o.period || null, o.note || null, o.st || null, +x.id); n++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n }; }
  function setPeriod(items, period, note) { period = String(period || '').trim(); if (period && !/^\d{4}_\d{2}$/.test(period)) throw new Error('Kỳ kê khai dạng năm_tháng, vd 2026_03');
    return upsert(items, note != null && note !== '' ? { period: period || null, note } : { period: period || null }); }
  function setStatus(items, st, note) { if (st && !['ok', 'sus'].includes(st)) throw new Error('Trạng thái không hợp lệ'); return upsert(items, note ? { st: st || null, note } : { st: st || null }); }
  // gắn lại kỳ đã đổi sau khi nạp lại dữ liệu (id bút toán đổi) theo chữ ký nội dung
  function rebind() { let n = 0;
    for (const x of all(`SELECT k.rowid r, k.sig FROM tax_period k LEFT JOIN entries e ON e.id=k.id WHERE e.id IS NULL AND k.sig IS NOT NULL`)) { const [doc, d, dr, cr, cents, bp, bpCr] = String(x.sig).split('|');
      const e = all(`SELECT id FROM entries WHERE document_no=? AND account_date=? AND acc_debit=? AND acc_credit=? AND round(coalesce(amount_acc,amount)*100)=? AND ifnull(partner_debit,'')=? AND ifnull(partner_credit,'')=? LIMIT 1`, doc, d, dr, cr, +cents, bp, bpCr)[0];
      if (e) { try { run(`UPDATE tax_period SET id=? WHERE rowid=?`, e.id, x.r); n++; } catch { } } }
    return { n }; }
  return { lines, report, setPeriod, setStatus, rebind, accs, setAccs, lag, setLag };
}
module.exports = { make };
