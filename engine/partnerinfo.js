'use strict';
// Danh mục thông tin đối tác (nhà cung cấp / khách hàng): thông tin chung, nhiều người liên hệ, nhiều tài khoản ngân hàng.
// Khoá = mã đối tượng ERP (bp, vd "VTL_SUP000123_ABC CO"). Thông tin chung dùng chung bảng ap331_partner (tên in trên biên bản 331).
// Người liên hệ có vai trò nhận email đối chiếu: 'to' = người nhận chính, 'cc' = đồng gửi, '' = chỉ lưu thông tin.
function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS ap331_partner(bp TEXT PRIMARY KEY, name TEXT, contact TEXT, email TEXT, tel TEXT, updated_at TEXT)`);
  for (const c of ['tin TEXT', 'address TEXT', 'website TEXT', 'note TEXT']) { try { db.exec(`ALTER TABLE ap331_partner ADD COLUMN ${c}`); } catch { } }
  db.exec(`CREATE TABLE IF NOT EXISTS pc_contact(id INTEGER PRIMARY KEY AUTOINCREMENT, bp TEXT, name TEXT, position TEXT, dept TEXT, email TEXT, phone TEXT, role TEXT, note TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_pc_contact_bp ON pc_contact(bp);
    CREATE TABLE IF NOT EXISTS pc_bank(id INTEGER PRIMARY KEY AUTOINCREMENT, bp TEXT, bank TEXT, branch TEXT, acc_no TEXT, acc_name TEXT, currency TEXT, swift TEXT, is_default INTEGER, note TEXT, updated_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_pc_bank_bp ON pc_bank(bp);`);
  for (const c of ['emoney INTEGER', 'source TEXT']) { try { db.exec(`ALTER TABLE pc_bank ADD COLUMN ${c}`); } catch { } }
  // chuyển người liên hệ cũ (1 người / đối tác trong ap331_partner) sang danh mục mới – chạy một lần
  try { run(`INSERT INTO pc_contact(bp, name, email, phone, role, updated_at)
    SELECT p.bp, p.contact, p.email, p.tel, 'to', datetime('now','localtime') FROM ap331_partner p
    WHERE (ifnull(p.email,'')<>'' OR ifnull(p.contact,'')<>'') AND NOT EXISTS (SELECT 1 FROM pc_contact c WHERE c.bp=p.bp)`); } catch { }
  const s = v => String(v ?? '').trim();
  const CC = ['name', 'position', 'dept', 'email', 'phone', 'role', 'note'], BC = ['bank', 'branch', 'acc_no', 'acc_name', 'currency', 'swift', 'is_default', 'note', 'emoney'], PC = ['name', 'tin', 'address', 'tel', 'website', 'note'];
  // danh sách: đối tác đã có thông tin + (tuỳ chọn) đối tượng ERP có phát sinh theo tài khoản acc
  function list(o = {}) {
    const q = s(o.q).toLowerCase(), acc = s(o.acc).replace(/[^0-9]/g, '');
    const known = all(`SELECT p.*, (SELECT count(*) FROM pc_contact c WHERE c.bp=p.bp) nc, (SELECT count(*) FROM pc_contact c WHERE c.bp=p.bp AND c.role='to' AND c.email<>'') nto,
        (SELECT group_concat(c.email, '; ') FROM pc_contact c WHERE c.bp=p.bp AND c.email<>'') emails, (SELECT count(*) FROM pc_bank b WHERE b.bp=p.bp) nb FROM ap331_partner p`);
    const M = new Map(known.map(r => [r.bp, r]));
    for (const bp of all(`SELECT DISTINCT bp FROM pc_contact UNION SELECT DISTINCT bp FROM pc_bank`).map(r => r.bp)) if (!M.has(bp)) M.set(bp, { bp, nc: get(`SELECT count(*) n FROM pc_contact WHERE bp=?`, bp).n, nb: get(`SELECT count(*) n FROM pc_bank WHERE bp=?`, bp).n, nto: 0, emails: all(`SELECT email FROM pc_contact WHERE bp=? AND email<>''`, bp).map(r => r.email).join('; ') });
    if (acc) for (const r of all(`SELECT partner_credit bp FROM entries WHERE acc_credit LIKE ? AND partner_credit<>'' UNION SELECT partner_debit FROM entries WHERE acc_debit LIKE ? AND partner_debit<>''`, acc + '%', acc + '%')) if (!M.has(r.bp)) M.set(r.bp, { bp: r.bp, nc: 0, nb: 0, nto: 0, emails: '' });
    let rows = [...M.values()];
    if (q) rows = rows.filter(r => [r.bp, r.name, r.tin, r.emails, r.address].join(' ').toLowerCase().includes(q));
    if (o.only === 'noemail') rows = rows.filter(r => !r.emails); else if (o.only === 'has') rows = rows.filter(r => r.nc || r.nb || r.name);
    rows.sort((a, b) => (b.nc + b.nb > 0) - (a.nc + a.nb > 0) || String(a.bp).localeCompare(String(b.bp)));
    return { rows: rows.slice(0, 5000), total: rows.length };
  }
  function detail(bp) {
    return { bp, info: get(`SELECT * FROM ap331_partner WHERE bp=?`, bp) || { bp }, contacts: all(`SELECT * FROM pc_contact WHERE bp=? ORDER BY CASE role WHEN 'to' THEN 0 WHEN 'cc' THEN 1 ELSE 2 END, id`, bp), banks: all(`SELECT * FROM pc_bank WHERE bp=? ORDER BY is_default DESC, id`, bp) };
  }
  // lưu toàn bộ một đối tác (thay danh sách liên hệ / tài khoản bằng danh sách gửi lên)
  function save(bp, o = {}) {
    bp = s(bp); if (!bp) throw new Error('Thiếu mã đối tượng');
    const i = o.info || {};
    run(`INSERT INTO ap331_partner(bp, name, tin, address, tel, website, note, updated_at) VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(bp) DO UPDATE SET name=excluded.name, tin=excluded.tin, address=excluded.address, tel=excluded.tel, website=excluded.website, note=excluded.note, updated_at=excluded.updated_at`, bp, ...PC.map(k => s(i[k])));
    if (o.contacts) { run(`DELETE FROM pc_contact WHERE bp=?`, bp);
      for (const c of o.contacts) if (CC.some(k => k !== 'role' && s(c[k]))) run(`INSERT INTO pc_contact(bp, ${CC.join(',')}, updated_at) VALUES(?,${CC.map(() => '?').join(',')},datetime('now','localtime'))`, bp, ...CC.map(k => k === 'role' ? (['to', 'cc'].includes(s(c.role)) ? s(c.role) : '') : s(c[k])));
      const first = get(`SELECT * FROM pc_contact WHERE bp=? AND email<>'' ORDER BY CASE role WHEN 'to' THEN 0 WHEN 'cc' THEN 1 ELSE 2 END, id LIMIT 1`, bp) || {}; // giữ cột cũ cho các chỗ đang đọc
      run(`UPDATE ap331_partner SET contact=?, email=? WHERE bp=?`, s(first.name), s(first.email), bp); }
    if (o.banks) { run(`DELETE FROM pc_bank WHERE bp=?`, bp);
      for (const b of o.banks) if (s(b.acc_no) || s(b.bank)) run(`INSERT INTO pc_bank(bp, ${BC.join(',')}, updated_at) VALUES(?,${BC.map(() => '?').join(',')},datetime('now','localtime'))`, bp, ...BC.map(k => k === 'is_default' || k === 'emoney' ? (b[k] ? 1 : 0) : s(b[k]))); }
    return detail(bp);
  }
  function remove(bp) { run(`DELETE FROM pc_contact WHERE bp=?`, bp); run(`DELETE FROM pc_bank WHERE bp=?`, bp); run(`DELETE FROM ap331_partner WHERE bp=?`, bp); return true; }
  // người nhận email đối chiếu: To = vai trò 'to' (không có thì người đầu tiên có email), CC = vai trò 'cc'
  function recipients(bp) {
    const C = all(`SELECT * FROM pc_contact WHERE bp=? AND email<>'' ORDER BY id`, bp), split = e => s(e).split(/[;,\s]+/).filter(x => /@/.test(x));
    let to = C.filter(c => c.role === 'to'); if (!to.length) to = C.filter(c => c.role !== 'cc').slice(0, 1);
    const cc = C.filter(c => c.role === 'cc' && !to.includes(c));
    return { to: [...new Set(to.flatMap(c => split(c.email)))], cc: [...new Set(cc.flatMap(c => split(c.email)))], names: to.map(c => c.name).filter(Boolean) };
  }
  // Excel: 3 sheet – Đối tác, Người liên hệ, Tài khoản ngân hàng (nhập lại được)
  const HP = ['Mã đối tượng', 'Tên đối tác', 'Mã số thuế', 'Địa chỉ', 'Điện thoại', 'Website', 'Ghi chú'], HC = ['Mã đối tượng', 'Họ tên', 'Chức vụ', 'Phòng ban', 'Email', 'Điện thoại', 'Nhận đối chiếu (To / CC)', 'Ghi chú'], HB = ['Mã đối tượng', 'Ngân hàng', 'Chi nhánh', 'Số tài khoản', 'Tên tài khoản', 'Loại tiền', 'SWIFT', 'Mặc định (x)', 'Ghi chú', 'Ví điện tử (x)'];
  function exportAoa() {
    return { partners: [HP, ...all(`SELECT * FROM ap331_partner ORDER BY bp`).map(r => [r.bp, r.name, r.tin, r.address, r.tel, r.website, r.note].map(s))],
      contacts: [HC, ...all(`SELECT * FROM pc_contact ORDER BY bp, id`).map(r => [r.bp, r.name, r.position, r.dept, r.email, r.phone, r.role === 'to' ? 'To' : r.role === 'cc' ? 'CC' : '', r.note].map(s))],
      banks: [HB, ...all(`SELECT * FROM pc_bank ORDER BY bp, id`).map(r => [r.bp, r.bank, r.branch, r.acc_no, r.acc_name, r.currency, r.swift, r.is_default ? 'x' : '', r.note, r.emoney ? 'x' : ''].map(s))] };
  }
  // nhập: đối tác có trong file được thay toàn bộ liên hệ / tài khoản bằng dòng trong file
  function importAoa(P = [], C = [], B = []) {
    const body = A => (A || []).slice(1).filter(r => r && s(r[0])), bps = new Set([...body(P), ...body(C), ...body(B)].map(r => s(r[0])));
    db.exec('BEGIN'); try { for (const bp of bps) {
      const p = body(P).find(r => s(r[0]) === bp), old = detail(bp).info;
      const info = p ? { name: p[1], tin: p[2], address: p[3], tel: p[4], website: p[5], note: p[6] } : old;
      const cs = body(C).filter(r => s(r[0]) === bp).map(r => ({ name: r[1], position: r[2], dept: r[3], email: r[4], phone: r[5], role: /^to$/i.test(s(r[6])) ? 'to' : /^cc$/i.test(s(r[6])) ? 'cc' : '', note: r[7] }));
      const bs = body(B).filter(r => s(r[0]) === bp).map(r => ({ bank: r[1], branch: r[2], acc_no: r[3], acc_name: r[4], currency: r[5], swift: r[6], is_default: /x|1|có|yes/i.test(s(r[7])), note: r[8], emoney: /x|1|có|yes|y/i.test(s(r[9])) }));
      save(bp, { info, contacts: body(C).length ? cs : undefined, banks: body(B).length ? bs : undefined }); } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { n: bps.size };
  }
  // Nạp tài khoản ngân hàng / ví điện tử từ danh mục đối tượng ERP (Export_C_BPartner: Code, Name, Account No, Account Name, IsEmoney, Bank Name, SwiftCode).
  // Mã ERP "VTL_HOVEN01268" ứng với mã đối tượng trong sổ "VTL_HOVEN01268_Tên…" – tìm theo tiền tố; chưa có trong sổ thì tạo "Mã_Tên".
  // Một đối tượng nhiều tài khoản: thêm mới theo số tài khoản, cập nhật nếu đã có (không xoá tài khoản nhập tay).
  function importBanks(A = []) {
    const H = (A[0] || []).map(x => s(x).toLowerCase().replace(/[^a-z]/g, '')), ix = k => H.findIndex(h => h === k);
    const I = { code: ix('code'), name: ix('name'), no: ix('accountno'), an: ix('accountname'), em: ix('isemoney'), bank: ix('bankname'), sw: ix('swiftcode') };
    if (I.code < 0 || I.no < 0) throw new Error('File cần cột Code và Account No (mẫu Export_C_BPartner)');
    const known = all(`SELECT DISTINCT bp FROM (SELECT partner_debit bp FROM entries WHERE partner_debit<>'' UNION SELECT partner_credit FROM entries WHERE partner_credit<>'' UNION SELECT bp FROM ap331_partner UNION SELECT bp FROM pc_contact)`).map(r => r.bp);
    const byCode = new Map(); for (const bp of known) { const P = String(bp).split('_'); for (let k = 1; k <= Math.min(P.length, 4); k++) { const c = P.slice(0, k).join('_').toUpperCase(); if (/\d/.test(c) && !byCode.has(c)) byCode.set(c, bp); } } // mọi tiền tố có số trước dấu _ (VTL_HOVEN01268, VTL_VEN_245…)
    const bankName = t => { const v = s(t), p = v.split('-'); return p.length === 2 && p[0].trim() === p[1].trim() ? p[0].trim() : v; };
    let n = 0, up = 0, parts = new Set(), newBp = 0;
    db.exec('BEGIN'); try {
      for (const r of A.slice(1)) { const code = s(r[I.code]), no = s(r[I.no]).replace(/\s+/g, ''); if (!code || !no) continue;
        const full = code + '_' + s(r[I.name]).replace(/_+$/, ''); let bp = byCode.get(code.toUpperCase()) || (known.includes(full) ? full : null); if (!bp) { bp = code + '_' + s(r[I.name]).replace(/_+$/, ''); byCode.set(code.toUpperCase(), bp); newBp++; }
        parts.add(bp); const em = /^(y|yes|1|true)$/i.test(s(r[I.em])) ? 1 : 0, o = { bank: bankName(r[I.bank]), acc_name: s(r[I.an]), swift: s(r[I.sw]) };
        const ex = get(`SELECT id FROM pc_bank WHERE bp=? AND replace(acc_no,' ','')=?`, bp, no);
        if (ex) { run(`UPDATE pc_bank SET bank=?, acc_name=?, swift=?, emoney=?, source='ERP', updated_at=datetime('now','localtime') WHERE id=?`, o.bank, o.acc_name, o.swift, em, ex.id); up++; }
        else { const first = !get(`SELECT 1 x FROM pc_bank WHERE bp=?`, bp); run(`INSERT INTO pc_bank(bp, bank, acc_no, acc_name, swift, emoney, is_default, source, updated_at) VALUES(?,?,?,?,?,?,?,'ERP',datetime('now','localtime'))`, bp, o.bank, no, o.acc_name, o.swift, em, first ? 1 : 0); n++; }
        if (!get(`SELECT 1 x FROM ap331_partner WHERE bp=?`, bp)) run(`INSERT INTO ap331_partner(bp, name, updated_at) VALUES(?,?,datetime('now','localtime'))`, bp, s(r[I.name]).replace(/_+$/, '')); }
      db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { added: n, updated: up, partners: parts.size, newPartners: newBp };
  }
  const banksOf = bps => { bps = [].concat(bps || []).filter(Boolean); return bps.length ? all(`SELECT * FROM pc_bank WHERE bp IN (${bps.map(() => '?').join(',')}) ORDER BY bp, is_default DESC, id`, ...bps) : []; };
  return { list, detail, save, remove, recipients, exportAoa, importAoa, importBanks, banksOf };
}
module.exports = { make };
