'use strict';
// Xuất Excel và soạn nội dung email – chạy ở tiến trình chính, dữ liệu lấy thẳng từ SQLite
const XLSX = require('../vendor/xlsx.full.min.js');
const { FIX, ST, ALL_RULES, fmt2, GROUP, GROUPS } = require('./rules');

const RULE = Object.fromEntries(ALL_RULES.map(r => [r.k, r]));
const SEV = { H: 'Cao', M: 'Trung bình', L: 'Thấp' };
const BUCKETS = ['Chưa đến hạn', '1–30', '31–60', '61–90', '91–180', '181–365', '> 365'];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vnDate = s => (s ? s.split('-').reverse().join('/') : '');
const shortName = u => String(u || '').split('_')[0];
const emailOf = u => String(u || '').split(/[_\s]/).find(x => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(x)) || '';

const errRow = e => ({
  'Nhóm': GROUPS[GROUP[e.k]], 'Mức': SEV[e.sev], 'Trạng thái': ST[e.status], 'Loại lỗi': RULE[e.k]?.n, 'Chi tiết': e.msg, 'Cần chỉnh sửa': FIX[e.k] || '',
  'Ngày HT': vnDate(e.date), 'Chứng từ': e.doc, 'Line': e.line, 'TK Nợ': e.drName, 'TK Có': e.crName, 'Số tiền': e.amt,
  'Diễn giải': e.desc, 'Bộ phận': e.dept, 'Người nhập': e.user, 'Ghi chú kiểm soát': e.note || '', 'Cập nhật': e.at || '',
});
function book(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Không có dữ liệu' }]), name.slice(0, 31));
  return wb;
}
const toBuffer = wb => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });

function errorsBook(rows, byUser) {
  return book([['Loi nhap lieu', rows.map(errRow)], ['Theo nguoi nhap', byUser]]);
}
function agingBook(items, dim = 'bp') {
  const REF = { contract: 'Hợp đồng', adv: 'Đề nghị tạm ứng', tcost: 'Khoản mục chi phí' }[dim];
  const GRP = { thu: 'Phải thu', tra: 'Phải trả' };
  const sum = new Map();
  for (const o of items) {
    const s = sum.get(o.acc) || sum.set(o.acc, { 'Nhóm': GRP[o.grp], 'TK': o.acc, 'Tên TK': o.accName, 'Số đối tượng': 0, 'Số dư': 0, ...Object.fromEntries(BUCKETS.map(b => [b, 0])), 'Dư ngược chiều': 0 }).get(o.acc);
    if (o.bal > 0) { s['Số đối tượng']++; s['Số dư'] += o.bal; BUCKETS.forEach((b, i) => { s[b] += o.b[i]; }); } else s['Dư ngược chiều'] += o.bal;
  }
  const detail = items.filter(o => o.bal > 0).sort((a, c) => a.acc.localeCompare(c.acc) || c.bal - a.bal).map(o => Object.assign({ 'Nhóm': GRP[o.grp], 'TK': o.acc, 'Tên TK': o.accName, 'Đối tượng': o.bp, ...(REF ? { [REF]: o.ref } : {}),
    'PS Nợ': o.dr, 'PS Có': o.cr, 'Số dư': o.bal }, ...BUCKETS.map((b, i) => ({ [b]: o.b[i] })), { 'Phát sinh đầu tiên': o.first, 'Phát sinh gần nhất': o.last, 'Tuổi tối đa (ngày)': o.maxAge }));
  const abn = items.filter(o => o.bal < 0).map(o => ({ 'Nhóm': GRP[o.grp], 'TK': o.acc, 'Tên TK': o.accName, 'Đối tượng': o.bp, ...(REF ? { [REF]: o.ref } : {}), 'PS Nợ': o.dr, 'PS Có': o.cr, 'Số dư ngược chiều': o.bal }));
  return book([['Tong hop theo TK', [...sum.values()]], ['Chi tiet doi tuong', detail], ['Du nguoc chieu', abn]]);
}
const IBUCKETS = ['0–30 ngày', '31–90', '91–180', '181–365', '1–2 năm', '> 2 năm'];
function inventoryBook(items) {
  const sum = new Map();
  for (const o of items) {
    const s = sum.get(o.acc) || sum.set(o.acc, { 'TK': o.acc, 'Tên TK': o.accName, 'Số mặt hàng/đối tượng': 0, 'Giá trị tồn': 0, ...Object.fromEntries(IBUCKETS.map(b => [b, 0])), 'Tồn âm': 0 }).get(o.acc);
    if (o.bal > 0) { s['Số mặt hàng/đối tượng']++; s['Giá trị tồn'] += o.bal; IBUCKETS.forEach((b, i) => { s[b] += o.b[i]; }); } else s['Tồn âm'] += o.bal;
  }
  const row = o => Object.assign({ 'TK': o.acc, 'Tên TK': o.accName, 'Mặt hàng / Đối tượng': o.obj, 'ĐVT': o.uom, 'SL nhập': o.qtyIn, 'SL xuất': o.qtyOut, 'SL tồn': o.qtyBal,
    'Giá trị nhập': o.valIn, 'Giá trị xuất': o.valOut, 'Giá trị tồn': o.bal }, ...IBUCKETS.map((b, i) => ({ [b]: o.b[i] })),
    { 'Nhập gần nhất': o.lastIn || '', 'Xuất gần nhất': o.lastOut || '', 'Số ngày không xuất': o.sinceOut ?? '', 'Tuổi tối đa (ngày)': o.maxAge });
  return book([['Tong hop theo TK', [...sum.values()]], ['Chi tiet ton kho', items.filter(o => o.bal > 0).sort((a, c) => c.bal - a.bal).map(row)], ['Ton am', items.filter(o => o.bal < 0).map(row)]]);
}
function reportBook(rep, checked, todo) {
  const cross = (rows, label, name) => rows.map(r => ({ ...(label === 'Loại lỗi' ? { 'Nhóm': GROUPS[GROUP[r.k]] } : {}), [label]: name(r.k), 'Tổng': r.n, 'Mức cao': r.high, 'Chưa xử lý': r.open, 'Đang xử lý': r.doing,
    'Đã khắc phục': r.fixed, 'Không phải lỗi': r.ignore, '% hoàn thành': r.n ? (r.fixed + r.ignore) / r.n : 0 }));
  return book([['Theo loai loi', cross(rep.byRule, 'Loại lỗi', k => RULE[k]?.n || k)], ['Theo nguoi nhap', cross(rep.byUser, 'Người nhập', k => k)],
    ['Da kiem tra', checked.map(errRow)], ['Can khac phuc', todo.map(errRow)]]);
}

function mailHtml(user, rows, o) {
  const max = 150, dl = o.deadline ? vnDate(o.deadline) : '';
  const td = 'style="border:1px solid #E9EAEB;padding:6px 8px;vertical-align:top"', th = 'style="border:1px solid #E9EAEB;padding:6px 8px;background:#FAFAFA;text-align:left;color:#414651"';
  const col = { H: '#D92D20', M: '#CA8504', L: '#155EEF' };
  const docs = new Set(rows.map(e => e.doc)).size, high = rows.filter(e => e.sev === 'H').length;
  return `<div style="font-family:'Museo Sans',Segoe UI,Arial,sans-serif;font-size:14px;color:#181D27;max-width:1000px">
  <div style="border-top:4px solid #FA4700;padding:16px 0 4px"><b style="font-size:18px">Thông báo bút toán cần khắc phục</b></div>
  <p>Chào ${esc(shortName(user))},</p>
  <p>${esc(o.intro).replace(/\n/g, '<br>')}</p>
  <table style="border-collapse:collapse;margin:8px 0 14px"><tr>
    <td style="padding:10px 16px;background:#FFF4ED;border-radius:8px"><div style="color:#535862;font-size:12px">Cần khắc phục</div><b style="font-size:20px">${rows.length}</b></td><td width=8></td>
    <td style="padding:10px 16px;background:#FEF3F2;border-radius:8px"><div style="color:#535862;font-size:12px">Mức cao</div><b style="font-size:20px;color:#D92D20">${high}</b></td><td width=8></td>
    <td style="padding:10px 16px;background:#FAFAFA;border-radius:8px"><div style="color:#535862;font-size:12px">Chứng từ</div><b style="font-size:20px">${docs}</b></td>
    ${dl ? `<td width=8></td><td style="padding:10px 16px;background:#FAFAFA;border-radius:8px"><div style="color:#535862;font-size:12px">Hạn hoàn thành</div><b style="font-size:20px">${dl}</b></td>` : ''}
  </tr></table>
  <table style="border-collapse:collapse;font-size:12px"><tr><th ${th}>Mức</th><th ${th}>Chứng từ</th><th ${th}>Ngày</th><th ${th}>Số tiền</th><th ${th}>Lỗi</th><th ${th}>Cần chỉnh sửa</th><th ${th}>Diễn giải</th><th ${th}>Ghi chú</th></tr>
  ${rows.slice(0, max).map(e => `<tr><td ${td}><b style="color:${col[e.sev]}">${SEV[e.sev]}</b></td><td ${td}>${esc(e.doc)}<br><small style="color:#717680">line ${esc(e.line)}</small></td>
    <td ${td}>${vnDate(e.date)}</td><td ${td} align=right>${fmt2(e.amt)}</td><td ${td}><b>${esc(RULE[e.k]?.n)}</b><br>${esc(e.msg)}</td><td ${td}>${esc(FIX[e.k] || '')}</td>
    <td ${td}>${esc(String(e.desc || '').slice(0, 160))}</td><td ${td}>${esc(e.note || '')}</td></tr>`).join('')}
  </table>${rows.length > max ? `<p><i>… và ${rows.length - max} dòng khác – xem file Excel đính kèm.</i></p>` : '<p>Danh sách đầy đủ trong file Excel đính kèm.</p>'}
  <p>Sau khi chỉnh sửa trên ERP, vui lòng phản hồi email này để bộ phận kiểm soát cập nhật trạng thái.</p>
  <p>${esc(o.sign).replace(/\n/g, '<br>')}</p></div>`;
}
const mailSubject = u => `[AccSoft] Danh sách bút toán cần khắc phục – ${shortName(u)}`;

module.exports = { inventoryBook, XLSX, errorsBook, agingBook, reportBook, toBuffer, book, errRow, mailHtml, mailSubject, emailOf, shortName };
