'use strict';
// Điều chỉnh các trường quản trị của bút toán (không sửa dữ liệu gốc): Hợp đồng, Mã vị trí (Location), Biển số xe, Loại dòng tiền.
// Hợp đồng / vị trí / biển số lưu ở bảng field_adj (theo id bút toán + chữ ký nội dung); dòng tiền dùng chung bảng cf_adj của B03.
const FIELDS = { contract: { col: 'contract', name: 'Hợp đồng' }, location: { col: 'location', name: 'Mã vị trí (Location)' }, plate: { col: 'plate', name: 'Biển số xe' }, dept: { col: 'department_sub', name: 'Phòng ban (Department Sub)' }, cf: { col: 'cashflow', name: 'Loại dòng tiền' } };
const sigOf = r => [r.doc, r.d, r.dr, r.cr, Math.round((+r.a || 0) * 100), r.bp || '', r.bpCr || ''].join('|');

function make(db, all, run, okYm, FIN) {
  const CASH = a => /^11[123]/.test(a || '');
  // Tìm bút toán theo điều kiện; trả kèm giá trị gốc và giá trị sau điều chỉnh của 4 trường
  function search(o = {}) {
    const w = [], a = [], f = okYm(o.from), t = okYm(o.to);
    if (f) { w.push('e.ym>=?'); a.push(f); } if (t) { w.push('e.ym<=?'); a.push(t); }
    if (o.doc) { w.push('e.document_no LIKE ?'); a.push('%' + o.doc.trim() + '%'); }
    if (o.acc) { const ps = String(o.acc).split(/[,;\s]+/).filter(Boolean); if (ps.length) { w.push('(' + ps.map(() => '(e.acc_debit LIKE ? OR e.acc_credit LIKE ?)').join(' OR ') + ')'); for (const p of ps) a.push(p + '%', p + '%'); } }
    if (o.bp) { w.push('(e.partner_debit LIKE ? OR e.partner_credit LIKE ?)'); a.push('%' + o.bp + '%', '%' + o.bp + '%'); }
    if (o.q) { w.push('(e.description LIKE ? OR e.document_no LIKE ?)'); a.push('%' + o.q + '%', '%' + o.q + '%'); }
    if (o.cash) w.push(`((e.acc_debit>='111' AND e.acc_debit<'114') OR (e.acc_credit>='111' AND e.acc_credit<'114'))`);
    const F = FIELDS[o.field];
    if (F && o.val) { w.push(`ifnull(e.${F.col},'') LIKE ?`); a.push('%' + o.val + '%'); }
    if (F && o.empty) w.push(`ifnull(e.${F.col},'')=''`);
    if (o.adjOnly) w.push(`(EXISTS (SELECT 1 FROM field_adj x WHERE x.id=e.id) OR EXISTS (SELECT 1 FROM cf_adj c WHERE c.doc=e.document_no AND c.d=e.account_date AND c.dr=e.acc_debit AND c.cr=e.acc_credit))`);
    if (!w.length) w.push('1');
    const lim = Math.min(+o.limit || 5000, 20000);
    const rows = all(`SELECT e.id, e.ym, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount a, e.partner_debit bp, e.partner_credit bpCr,
        e.description ds, e.created_by u, e.contract, e.location, e.plate, e.department_sub dept, e.cashflow cf FROM entries e WHERE ${w.join(' AND ')} ORDER BY e.account_date, e.id LIMIT ${lim + 1}`, ...a);
    const ids = rows.map(r => r.id), adj = new Map();
    for (let i = 0; i < ids.length; i += 500) { const c = ids.slice(i, i + 500); for (const x of all(`SELECT * FROM field_adj WHERE id IN (${c.map(() => '?').join(',')})`, ...c)) adj.set(x.id + '|' + x.field, x); }
    const cfa = new Map(); try { for (const x of all(`SELECT sig, code, note FROM cf_adj`)) cfa.set(x.sig, x); } catch { }
    const CFN = (FIN.cfRows ? null : null), out = rows.slice(0, lim).map(r => {
      const o2 = { ...r, sig: sigOf(r), cash: CASH(r.dr) !== CASH(r.cr) };
      for (const k of ['contract', 'location', 'plate', 'dept']) { const x = adj.get(r.id + '|' + k); o2[k + 'New'] = x ? x.value : null; o2[k + 'Note'] = x ? x.note : ''; }
      const c = cfa.get('c:' + o2.sig); o2.cfNew = c ? c.code : null; o2.cfNote = c ? c.note : '';
      return o2;
    });
    return { total: rows.length > lim ? lim + '+' : rows.length, rows: out, truncated: rows.length > lim };
  }
  // Giá trị đang có trong dữ liệu (gợi ý khi nhập)
  function values(field, q = '') {
    const F = FIELDS[field]; if (!F || field === 'cf') return [];
    const base = all(`SELECT ${F.col} v, count(*) n FROM entries WHERE ${F.col} IS NOT NULL AND ${F.col}<>''${q ? ` AND ${F.col} LIKE ?` : ''} GROUP BY 1 ORDER BY 2 DESC LIMIT 300`, ...(q ? ['%' + q + '%'] : []));
    const adj = all(`SELECT value v, count(*) n FROM field_adj WHERE field=? AND value<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 200`, field);
    const m = new Map(); for (const r of [...adj, ...base]) m.set(r.v, (m.get(r.v) || 0) + r.n); return [...m].map(([v, n]) => ({ v, n })).slice(0, 400);
  }
  function set(items, field, value, note = '') {
    const F = FIELDS[field]; if (!F) throw new Error('Trường không hợp lệ');
    items = [].concat(items || []).filter(x => x && x.id);
    if (field === 'cf') { const cash = items.filter(x => CASH(x.dr) !== CASH(x.cr)); if (!cash.length) throw new Error('Chỉ điều chỉnh dòng tiền cho bút toán có thu / chi tiền (TK 111, 112, 113)'); return FIN.cfAdjSet(cash.map(x => ({ ...x, sig: 'c:' + sigOf(x) })), value, note); }
    db.exec('BEGIN'); try { let n = 0;
      for (const x of items) { run(`INSERT OR REPLACE INTO field_adj(id, field, value, orig, sig, doc, d, ym, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
        x.id, field, String(value ?? '').trim(), x[field] ?? null, sigOf(x), x.doc, x.d, String(x.d || '').slice(0, 7), note || ''); n++; }
      db.exec('COMMIT'); return { n }; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function remove(keys) { let n = 0;
    for (const k of [].concat(keys || [])) { if (k.field === 'cf') n += FIN.cfAdjRemove(['c:' + k.sig]).n; else n += run(`DELETE FROM field_adj WHERE id=? AND field=?`, k.id, k.field).changes; }
    return { n }; }
  function list() {
    const a = all(`SELECT f.*, e.acc_debit dr, e.acc_credit cr, e.amount a, e.partner_debit bp, e.partner_credit bpCr, e.description ds FROM field_adj f LEFT JOIN entries e ON e.id=f.id ORDER BY f.updated_at DESC LIMIT 20000`);
    const c = (FIN.cfAdjList ? FIN.cfAdjList() : []).map(x => ({ id: null, field: 'cf', value: x.code, orig: x.cf, sig: String(x.sig || '').replace(/^c:/, ''), doc: x.doc, d: x.d, ym: x.ym, note: x.note, updated_at: x.updated_at, dr: x.dr, cr: x.cr, a: x.a, bp: x.bp, bpCr: x.bpCr }));
    return a.concat(c).sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
  }
  // Sau khi nạp lại dữ liệu (id bút toán thay đổi): gắn lại điều chỉnh theo chữ ký nội dung
  function rebind() { let n = 0;
    for (const x of all(`SELECT f.rowid r, f.sig, f.field FROM field_adj f LEFT JOIN entries e ON e.id=f.id WHERE e.id IS NULL`)) {
      const [doc, d, dr, cr, cents, bp, bpCr] = String(x.sig).split('|');
      const e = all(`SELECT id FROM entries WHERE document_no=? AND account_date=? AND acc_debit=? AND acc_credit=? AND round(amount*100)=? AND ifnull(partner_debit,'')=? AND ifnull(partner_credit,'')=? LIMIT 1`, doc, d, dr, cr, +cents, bp, bpCr)[0];
      if (e) { try { run(`UPDATE field_adj SET id=? WHERE rowid=?`, e.id, x.r); n++; } catch { } } }
    return { n }; }
  // Mọi hợp đồng của một đối tượng (cả hai phía Nợ / Có, gồm hợp đồng đã điều chỉnh) – để chọn khi đổi hợp đồng, tránh gõ sai
  function contractsOf(bp) {
    if (!bp) return [];
    const m = new Map(), add = (v, n, a, last) => { if (!v) return; const o = m.get(v) || m.set(v, { v, n: 0, a: 0, last: '' }).get(v); o.n += n; o.a += a || 0; if (last > o.last) o.last = last; };
    for (const r of all(`SELECT contract v, count(*) n, sum(amount) a, max(account_date) l FROM entries WHERE (partner_debit=? OR partner_credit=?) AND contract IS NOT NULL AND contract<>'' GROUP BY 1`, bp, bp)) add(r.v, r.n, r.a, r.l);
    for (const r of all(`SELECT f.value v, count(*) n, max(f.d) l FROM field_adj f JOIN entries e ON e.id=f.id WHERE f.field='contract' AND (e.partner_debit=? OR e.partner_credit=?) GROUP BY 1`, bp, bp)) add(r.v, r.n, 0, r.l);
    return [...m.values()].sort((a, b) => b.last.localeCompare(a.last) || b.n - a.n);
  }
  return { search, values, set, remove, list, rebind, contractsOf, FIELDS };
}
module.exports = { make, FIELDS };
