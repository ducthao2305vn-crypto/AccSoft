'use strict';
// Danh mục nhân viên (CBCNV): nạp từ file LIST NAME ALL STAFF, thêm / sửa / xoá, tra email theo user ERP (người nhập chứng từ) để gửi thư.
const F = [
  ['code', 'Mã nhân viên'], ['name', 'Họ và tên'], ['position', 'Chức danh'], ['dept', 'Phòng ban'], ['unit', 'Đơn vị'], ['contract', 'Loại hợp đồng'],
  ['rank', 'Cấp bậc'], ['block', 'Khối'], ['field', 'Lĩnh vực'], ['direct', 'Trực tiếp / gián tiếp'], ['nationality', 'Quốc tịch'], ['gender', 'Giới tính'],
  ['dob', 'Ngày sinh'], ['start_date', 'Ngày bắt đầu làm việc'], ['end_date', 'Ngày hết HĐLĐ / về nước'], ['phone', 'Số điện thoại'], ['email1', 'Email 1'], ['email2', 'Email 2'],
  ['erp_user', 'User ERP (người nhập)'], ['status', 'Trạng thái'], ['note', 'Ghi chú'],
];
const COLS = F.map(f => f[0]);

function make(db, all, get, run) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff(code TEXT PRIMARY KEY, ${COLS.slice(1).map(c => c + ' TEXT').join(', ')}, updated_at TEXT)`);
  const s = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  const xd = v => { // ngày: Date / số Excel / chuỗi → YYYY-MM-DD
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 1000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const t = s(v), m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t;
  };
  const em = v => s(v).toLowerCase().replace(/^mailto:/, '');
  const userOf = o => o.erp_user || (o.email1 || o.email2 || '').split('@')[0].toUpperCase();

  function list(o = {}) {
    const w = [], a = [];
    if (o.q) { w.push(`(${['code', 'name', 'position', 'dept', 'unit', 'email1', 'email2', 'phone', 'erp_user'].map(c => `ifnull(${c},'') LIKE ?`).join(' OR ')})`); for (let i = 0; i < 9; i++) a.push('%' + o.q + '%'); }
    for (const k of ['dept', 'unit', 'status', 'contract', 'block', 'nationality']) if (o[k]) { w.push(`ifnull(${k},'')=?`); a.push(o[k]); }
    const rows = all(`SELECT * FROM staff ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY CASE WHEN status='inactive' THEN 1 ELSE 0 END, dept, name`, ...a);
    const facet = k => all(`SELECT ifnull(${k},'') v, count(*) n FROM staff GROUP BY 1 ORDER BY 1`);
    return { rows, total: get(`SELECT count(*) n FROM staff`).n, fields: F, facets: { dept: facet('dept'), unit: facet('unit'), status: facet('status'), contract: facet('contract'), block: facet('block'), nationality: facet('nationality') } };
  }
  function upsert(o, oldCode) {
    const r = Object.fromEntries(COLS.map(c => [c, ['dob', 'start_date', 'end_date'].includes(c) ? xd(o[c]) : ['email1', 'email2'].includes(c) ? em(o[c]) : s(o[c])]));
    if (!r.code) throw new Error('Thiếu mã nhân viên'); if (!r.name) throw new Error('Thiếu họ tên');
    if (!r.status) r.status = 'active'; if (!r.erp_user) r.erp_user = userOf(r);
    if (oldCode && oldCode !== r.code) { if (get(`SELECT 1 x FROM staff WHERE code=?`, r.code)) throw new Error('Mã ' + r.code + ' đã tồn tại'); run(`DELETE FROM staff WHERE code=?`, oldCode); }
    run(`INSERT OR REPLACE INTO staff(${COLS.join(',')}, updated_at) VALUES(${COLS.map(() => '?').join(',')}, datetime('now','localtime'))`, ...COLS.map(c => r[c]));
    return r;
  }
  function remove(codes) { let n = 0; for (const c of [].concat(codes || [])) n += run(`DELETE FROM staff WHERE code=?`, c).changes; return { n }; }

  // Nạp file dạng "LIST NAME ALL STAFF OF COMPANY" (tiêu đề 2 dòng, cột theo tên) hoặc file xuất lại từ AccSoft (tiêu đề = tên trường tiếng Việt)
  function importAoa(aoa, mode = 'merge') {
    const low = v => s(v).toLowerCase();
    let h = aoa.findIndex(r => r.some(c => /employee code|mã nhân viên/i.test(s(c))));
    if (h < 0) throw new Error('Không thấy cột "Mã nhân viên / Employee code" trong file');
    const H1 = aoa[h].map(low), H2 = (aoa[h + 1] || []).map(low), col = (...re) => { for (const R of re) { let i = H2.findIndex(x => R.test(x)); if (i >= 0) return i; i = H1.findIndex(x => R.test(x)); if (i >= 0) return i; } return -1; };
    const C = { code: col(/employee code|mã nhân viên/), name: col(/^họ và tên/, /^name$/), position: col(/chức danh\/\s*\n?\s*position|^chức danh$|position/), dept: col(/phòng ban\/\s*\n?\s*department|department|^phòng ban$/), unit: col(/đơn vị\/\s*\n?\s*unit|^đơn vị$/),
      contract: col(/kind of contract|loại hợp đồng|đối tượng/), rank: col(/cấp bậc/), block: col(/^khối$/), field: col(/^lĩnh vực công việc$|^lĩnh vực$/), direct: col(/direct|trực tiếp/), nationality: col(/nationality|quốc tịch/), gender: col(/gender|giới tính/),
      dob: col(/date of birth|ngày sinh/), start_date: col(/date of start working\s*$|ngày bắt đầu làm việc/), end_date: col(/expiration of labor|ngày hết hđlđ/), phone: col(/telemor number|số điện thoại/), email1: col(/^email 1$/), email2: col(/^email 2$/),
      erp_user: col(/user erp/), status: col(/^trạng thái$/), note: col(/^ghi chú$/) };
    // vị trí cột ở dòng tiêu đề 1 cho các cột gộp (Phòng ban/Unit chia 3 cột con: Chức danh | Phòng ban | Đơn vị)
    const pu = H1.findIndex(x => /^phòng ban\/unit/.test(x)); if (pu >= 0) { C.position = pu; C.dept = pu + 1; C.unit = pu + 2; }
    if (C.code < 0 || C.name < 0) throw new Error('Thiếu cột mã nhân viên hoặc họ tên');
    const out = [];
    for (const r of aoa.slice(h + 1)) { const code = s(r[C.code]), name = s(r[C.name]); if (!code || !name || /^\d+$/.test(name) || !/\d/.test(code)) continue;
      const o = {}; for (const k in C) if (C[k] >= 0) o[k] = r[C[k]]; out.push(o); }
    if (!out.length) throw new Error('Không đọc được dòng nhân viên nào');
    db.exec('BEGIN'); try { if (mode === 'replace') run(`DELETE FROM staff`); let n = 0, upd = 0;
      for (const o of out) { const old = get(`SELECT * FROM staff WHERE code=?`, s(o.code)); if (old) { upd++; for (const k of ['erp_user', 'note', 'status']) if (!s(o[k]) && old[k]) o[k] = old[k]; } upsert(o); n++; }
      db.exec('COMMIT'); return { n, upd, added: n - upd, total: get(`SELECT count(*) n FROM staff`).n }; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // Email theo user ERP (người nhập chứng từ): khớp user ERP, mã NV hoặc phần trước @ của email
  // user ERP dạng "ANDRE_andre.jesus@telemor.tl": tách phần mã (trước "_") và email
  const keyOf = u => { const t = s(u), m = t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/); return { k: t.split(/[_\s]/)[0].toUpperCase(), e: m ? m[0].toLowerCase() : '' }; };
  function emailOf(u) {
    const { k, e } = keyOf(u); if (!k && !e) return '';
    if (e) { const r = get(`SELECT email1, email2 FROM staff WHERE lower(email1)=? OR lower(email2)=? LIMIT 1`, e, e); if (r) return r.email1 || r.email2; }
    const r = get(`SELECT email1, email2 FROM staff WHERE upper(erp_user)=? OR upper(code)=? OR upper(substr(email1,1,instr(email1,'@')-1))=? OR upper(substr(email2,1,instr(email2,'@')-1))=? ORDER BY CASE WHEN status='inactive' THEN 1 ELSE 0 END LIMIT 1`, k, k, k, k);
    return r ? (r.email1 || r.email2 || '') : '';
  }
  function byUser(u) { const { k, e } = keyOf(u); return get(`SELECT * FROM staff WHERE (?<>'' AND (lower(email1)=? OR lower(email2)=?)) OR upper(erp_user)=? OR upper(code)=? OR upper(substr(email1,1,instr(email1,'@')-1))=? LIMIT 1`, e, e, e, k, k, k) || null; }
  return { list, upsert, remove, importAoa, emailOf, byUser, FIELDS: F };
}
module.exports = { make, FIELDS: F };
