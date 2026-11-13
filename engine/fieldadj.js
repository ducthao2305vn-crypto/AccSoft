'use strict';
// Điều chỉnh các trường quản trị của bút toán (không sửa dữ liệu gốc): Hợp đồng, Mã vị trí (Location), Biển số xe, Loại dòng tiền.
// Hợp đồng / vị trí / biển số lưu ở bảng field_adj (theo id bút toán + chữ ký nội dung); dòng tiền dùng chung bảng cf_adj của B03.
const FIELDS = { contract: { col: 'contract', name: 'Hợp đồng' }, location: { col: 'location', name: 'Mã vị trí (Location)' }, plate: { col: 'plate', name: 'Biển số xe' }, dept: { col: 'department_sub', name: 'Phòng ban (Department Sub)' }, ar: { col: 'advance_request', name: 'Đề nghị tạm ứng (Advance Request)' }, cf: { col: 'cashflow', name: 'Loại dòng tiền' }, asset: { col: 'asset', name: 'Mã tài sản (Asset)' } };
const RS = require('./rules');
const sigOf = r => [r.doc, r.d, r.dr, r.cr, Math.round((+(r.aa ?? r.a) || 0) * 100), r.bp || '', r.bpCr || ''].join('|');

function make(db, all, run, okYm, FIN) {
  db.exec(`CREATE TABLE IF NOT EXISTS fa_ok(id INTEGER PRIMARY KEY, cf TEXT, at TEXT); CREATE TABLE IF NOT EXISTS cf_learn(k TEXT, code TEXT, n INTEGER, PRIMARY KEY(k, code));`);
  // mẫu đã học: chiều thu/chi + TK đối ứng (4 ký tự đầu) → mã dòng tiền đã được xác nhận / điều chỉnh
  // dọn một lần: điều chỉnh dòng tiền trùng mã gốc (VD 0102 → 02) không phải điều chỉnh – chuyển thành "xác nhận đúng"
  try { if (!(all(`SELECT v FROM settings WHERE k='cf_same_clean'`)[0])) { for (const a of all(`SELECT * FROM cf_adj`)) { if (RS.cfCode(a.cf) !== a.code) continue;
        const e = all(`SELECT id FROM entries WHERE document_no IS ? AND account_date=? AND acc_debit=? AND acc_credit=? LIMIT 1`, a.doc, a.d, a.dr, a.cr)[0];
        if (e) run(`INSERT OR REPLACE INTO fa_ok(id, cf, at) VALUES(?,?,datetime('now','localtime'))`, e.id, a.code); run(`DELETE FROM cf_adj WHERE sig=?`, a.sig); }
      run(`INSERT OR REPLACE INTO settings(k, v) VALUES('cf_same_clean','1')`); } } catch { }
  const lkey = o => (CASH(o.dr) ? 'R|' + String(o.cr || '').slice(0, 4) : 'P|' + String(o.dr || '').slice(0, 4));
  const learn = (items, code) => { for (const x of items) if (code) run(`INSERT INTO cf_learn(k, code, n) VALUES(?,?,1) ON CONFLICT(k, code) DO UPDATE SET n=n+1`, lkey(x), code); };
  // xác nhận dòng tiền đang ghi nhận là ĐÚNG (không cần điều chỉnh)
  function confirmCf(items, undo) { let n = 0; db.exec('BEGIN'); try { for (const x of [].concat(items || [])) { if (!x.id) continue;
        if (undo) n += run(`DELETE FROM fa_ok WHERE id=?`, +x.id).changes; else { const c = RS.cfCode(x.cf); if (!c || c === 'TR') continue; run(`INSERT OR REPLACE INTO fa_ok(id, cf, at) VALUES(?,?,datetime('now','localtime'))`, +x.id, c); learn([x], c); n++; } }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return { n }; }
  const CASH = a => /^11[123]/.test(a || '');
  // Tìm bút toán theo điều kiện; trả kèm giá trị gốc và giá trị sau điều chỉnh của 4 trường
  function search(o = {}) {
    const w = [], a = [], f = okYm(o.from), t = okYm(o.to);
    if (f) { w.push('e.ym>=?'); a.push(f); } if (t) { w.push('e.ym<=?'); a.push(t); }
    if (o.doc) { w.push('e.document_no LIKE ?'); a.push('%' + o.doc.trim() + '%'); }
    if (o.acc) { const ps = String(o.acc).split(/[,;\s]+/).filter(Boolean); if (ps.length) { w.push('(' + ps.map(() => '(e.acc_debit LIKE ? OR e.acc_credit LIKE ?)').join(' OR ') + ')'); for (const p of ps) a.push(p + '%', p + '%'); } }
    if (o.bp) { w.push('(e.partner_debit LIKE ? OR e.partner_credit LIKE ?)'); a.push('%' + o.bp + '%', '%' + o.bp + '%'); }
    if (o.q) { w.push('(e.description LIKE ? OR e.document_no LIKE ?)'); a.push('%' + o.q + '%', '%' + o.q + '%'); }
    if (o.cash) w.push(`((e.acc_debit>='111' AND e.acc_debit<'114') OR (e.acc_credit>='111' AND e.acc_credit<'114')) AND NOT ((e.acc_debit>='111' AND e.acc_debit<'114') AND (e.acc_credit>='111' AND e.acc_credit<'114'))`); // bỏ chuyển tiền nội bộ giữa các TK tiền (không tính LCTT)
    const F = FIELDS[o.field];
    if (F && o.val) { w.push(`ifnull(e.${F.col},'') LIKE ?`); a.push('%' + o.val + '%'); }
    if (F && o.empty) w.push(`ifnull(e.${F.col},'')=''`);
    if (o.adjOnly) w.push(`(EXISTS (SELECT 1 FROM field_adj x WHERE x.id=e.id) OR EXISTS (SELECT 1 FROM cf_adj c WHERE c.doc=e.document_no AND c.d=e.account_date AND c.dr=e.acc_debit AND c.cr=e.acc_credit))`);
    if (!w.length) w.push('1');
    const lim = Math.min(+o.limit || 5000, o.report ? 300000 : 60000);
    const rows = all(`SELECT e.id, e.ym, e.account_date d, e.document_no doc, e.acc_debit dr, e.acc_credit cr, e.acc_debit_name drName, e.acc_credit_name crName, e.amount a, coalesce(e.amount_acc, e.amount) aa, e.partner_debit bp, e.partner_credit bpCr,
        e.description ds, e.created_by u, e.contract, e.location, e.plate, e.department_sub dept, e.cashflow cf, e.asset FROM entries e WHERE ${w.join(' AND ')} ORDER BY e.account_date, e.id LIMIT ${lim + 1}`, ...a);
    const ids = rows.map(r => r.id), adj = new Map();
    for (let i = 0; i < ids.length; i += 500) { const c = ids.slice(i, i + 500); for (const x of all(`SELECT * FROM field_adj WHERE id IN (${c.map(() => '?').join(',')})`, ...c)) adj.set(x.id + '|' + x.field, x); }
    const OK = new Map(); for (let i = 0; i < ids.length; i += 500) { const c = ids.slice(i, i + 500); for (const x of all(`SELECT * FROM fa_ok WHERE id IN (${c.map(() => '?').join(',')})`, ...c)) OK.set(x.id, x); }
    const LRN = new Map(); for (const x of all(`SELECT k, code, n FROM cf_learn`)) { const g = LRN.get(x.k); if (!g || x.n > g.n) LRN.set(x.k, x); }
    const cfa = new Map(); try { for (const x of all(`SELECT sig, code, note, updated_at FROM cf_adj`)) cfa.set(x.sig, x); } catch { }
    const CFN = (FIN.cfRows ? null : null), out = rows.slice(0, lim).map(r => {
      const o2 = { ...r, sig: sigOf(r), cash: CASH(r.dr) !== CASH(r.cr) };
      for (const k of ['contract', 'location', 'plate', 'dept', 'asset']) { const x = adj.get(r.id + '|' + k); o2[k + 'New'] = x ? x.value : null; o2[k + 'Note'] = x ? x.note : ''; if (x) { (o2.adjF = o2.adjF || []).push(k); if (!o2.adjAt || x.updated_at > o2.adjAt) o2.adjAt = x.updated_at; } }
      const c = cfa.get('c:' + o2.sig); o2.cfNew = c ? c.code : null; o2.cfNote = c ? c.note : ''; if (c) { (o2.adjF = o2.adjF || []).push('cf'); if (!o2.adjAt || (c.updated_at || '') > o2.adjAt) o2.adjAt = c.updated_at; } if (o2.cash) { const g = RS.cfSuggest(o2.dr, o2.cr), e = RS.cfCode(o2.cf); o2.cfSug = g.b03; o2.cfCur = e; o2.cfBad = !!(e && (e === 'TR' || (g.fixed && e !== g.b03) || (CASH(o2.dr) && ['02','03','04','05','07','21','23','25','32','34','35','36'].includes(e)) || (!CASH(o2.dr) && ['01','06','22','24','26','27','31','33'].includes(e)))); }
      if (o2.cash) { const ok = OK.get(o2.id), L = LRN.get(lkey(o2)), g = RS.cfSuggest(o2.dr, o2.cr);
        o2.cfLearn = L ? L.code : null; o2.cfLearnN = L ? L.n : 0; if (L && !o2.cfNew && !o2.cfCur) o2.cfSug = L.code; // gợi ý theo mẫu đã học cho dòng trống
        o2.cfState = o2.cfNew != null ? 'adj' : ok && ok.cf === o2.cfCur ? 'ok' : !o2.cfCur ? 'blank' : o2.cfBad ? 'bad'
          : (g.fixed && g.b03 === o2.cfCur) || (L && L.code === o2.cfCur) ? 'auto' : 'review'; o2.okAt = ok ? ok.at : null; }
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
    if (field === 'cf') { const cash = items.filter(x => CASH(x.dr) !== CASH(x.cr)); if (!cash.length) throw new Error('Chỉ điều chỉnh dòng tiền cho bút toán có thu / chi tiền (TK 111, 112, 113)'); learn(cash, value);
      // trùng mã đang ghi nhận → không phải điều chỉnh: ghi "xác nhận đúng", bỏ điều chỉnh cũ (nếu có)
      const same = cash.filter(x => RS.cfCode(x.cf) === value), diff = cash.filter(x => RS.cfCode(x.cf) !== value);
      if (same.length) { confirmCf(same); FIN.cfAdjRemove(same.map(x => 'c:' + sigOf(x))); }
      const r = diff.length ? FIN.cfAdjSet(diff.map(x => ({ ...x, sig: 'c:' + sigOf(x) })), value, note) : { n: 0 }; r.same = same.length; return r; }
    db.exec('BEGIN'); try { let n = 0;
      for (const x of items) { run(`INSERT OR REPLACE INTO field_adj(id, field, value, orig, sig, doc, d, ym, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
        x.id, field, String(value ?? '').trim(), x[field] ?? null, sigOf(x), x.doc, x.d, String(x.d || '').slice(0, 7), note || ''); n++; }
      db.exec('COMMIT'); return { n }; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function remove(keys) { let n = 0;
    for (const k of [].concat(keys || [])) { if (k.field === 'cf') n += FIN.cfAdjRemove(['c:' + k.sig]).n; else n += run(`DELETE FROM field_adj WHERE id=? AND field=?`, k.id, k.field).changes; }
    return { n }; }
  function list() {
    const a = all(`SELECT f.*, e.acc_debit dr, e.acc_credit cr, e.amount a, coalesce(e.amount_acc, e.amount) aa, e.partner_debit bp, e.partner_credit bpCr, e.description ds FROM field_adj f LEFT JOIN entries e ON e.id=f.id ORDER BY f.updated_at DESC LIMIT 20000`);
    const c = (FIN.cfAdjList ? FIN.cfAdjList() : []).map(x => ({ id: null, field: 'cf', value: x.code, orig: x.cf, sig: String(x.sig || '').replace(/^c:/, ''), doc: x.doc, d: x.d, ym: x.ym, note: x.note, updated_at: x.updated_at, dr: x.dr, cr: x.cr, a: x.a, bp: x.bp, bpCr: x.bpCr }));
    return a.concat(c).sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)));
  }
  // Sau khi nạp lại dữ liệu (id bút toán thay đổi): gắn lại điều chỉnh theo chữ ký nội dung
  function rebind() { let n = 0;
    for (const x of all(`SELECT f.rowid r, f.sig, f.field FROM field_adj f LEFT JOIN entries e ON e.id=f.id WHERE e.id IS NULL`)) {
      const [doc, d, dr, cr, cents, bp, bpCr] = String(x.sig).split('|');
      const e = all(`SELECT id FROM entries WHERE document_no=? AND account_date=? AND acc_debit=? AND acc_credit=? AND round(coalesce(amount_acc,amount)*100)=? AND ifnull(partner_debit,'')=? AND ifnull(partner_credit,'')=? LIMIT 1`, doc, d, dr, cr, +cents, bp, bpCr)[0];
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
  // File mẫu gán mã tài sản: các dòng TK 211 / 213 / 214 (và TK thêm) chưa có mã tài sản (gồm cả giá trị đã điều chỉnh)
  function assetTemplate(o = {}) {
    const f = okYm(o.from), t = okYm(o.to), pres = String(o.acc || '211,213,214').split(/[,;\s]+/).filter(Boolean), w = [], a = [];
    if (f) { w.push('e.ym>=?'); a.push(f); } if (t) { w.push('e.ym<=?'); a.push(t); }
    w.push('(' + pres.map(() => '(e.acc_debit LIKE ? OR e.acc_credit LIKE ?)').join(' OR ') + ')'); for (const p of pres) a.push(p + '%', p + '%');
    if (!o.all) w.push(`nullif(coalesce((SELECT x.value FROM field_adj x WHERE x.id=e.id AND x.field='asset'), e.asset),'') IS NULL`);
    return all(`SELECT e.document_no doc, e.line_no line, e.account_date d, e.acc_debit dr, e.acc_credit cr, e.amount a, coalesce(e.amount_acc, e.amount) aa, e.partner_debit bp, e.partner_credit bpCr, e.description ds,
      coalesce((SELECT x.value FROM field_adj x WHERE x.id=e.id AND x.field='asset'), e.asset) asset FROM entries e WHERE ${w.join(' AND ')} ORDER BY e.account_date, e.document_no, e.line_no LIMIT 100000`, ...a);
  }
  // Nạp mã tài sản từ Excel: mỗi dòng {doc (bắt buộc), line, date, acc, amt, asset (bắt buộc), note} → gán cho mọi bút toán khớp
  function assetImport(rows, mode = 'fill') {
    let ok = 0, lines = 0, skip = 0; const miss = [], multi = [];
    for (const r of rows || []) {
      const doc = String(r.doc || '').trim(), asset = String(r.asset || '').trim(); if (!doc || !asset) { skip++; continue; }
      const w = ['document_no=?'], a = [doc];
      if (r.line != null && r.line !== '') { w.push('line_no=?'); a.push(+r.line); }
      if (r.acc) { w.push('(acc_debit LIKE ? OR acc_credit LIKE ?)'); a.push(String(r.acc).trim() + '%', String(r.acc).trim() + '%'); }
      if (r.amt != null && r.amt !== '' && !isNaN(+r.amt)) { w.push('abs(amount-?)<0.005'); a.push(+r.amt); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '').slice(0, 10))) { w.push('account_date=?'); a.push(String(r.date).slice(0, 10)); }
      let hit = all(`SELECT id, document_no doc, account_date d, acc_debit dr, acc_credit cr, amount a, coalesce(amount_acc, amount) aa, partner_debit bp, partner_credit bpCr, asset FROM entries WHERE ${w.join(' AND ')}`, ...a);
      if (mode === 'fill') { const done = new Set(all(`SELECT id FROM field_adj WHERE field='asset' AND id IN (${hit.map(() => '?').join(',') || 'NULL'})`, ...hit.map(h => h.id)).map(x => x.id)); hit = hit.filter(h => !h.asset && !done.has(h.id)); }
      if (!hit.length) { if (miss.length < 30) miss.push(`${doc}${r.line != null && r.line !== '' ? ' line ' + r.line : ''}${r.acc ? ' TK ' + r.acc : ''}${r.amt ? ' · ' + r.amt : ''}`); continue; }
      if (hit.length > 1 && multi.length < 10 && (r.line == null || r.line === '')) multi.push(`${doc}: ${hit.length} dòng`);
      set(hit, 'asset', asset, r.note || 'Nạp từ Excel'); ok++; lines += hit.length;
    }
    return { rows: (rows || []).length, ok, lines, skip, notFound: miss.length, miss, multi };
  }
  return { search, confirmCf, values, set, remove, list, rebind, contractsOf, assetTemplate, assetImport, FIELDS };
}
module.exports = { make, FIELDS };
