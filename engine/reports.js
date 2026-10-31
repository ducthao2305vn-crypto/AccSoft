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

// File GL Journal để import vào ERP (đúng 126 cột như file mẫu Export_GL_Journal)
const vd = s => s == null || s === '' ? null : String(s).replace('_', '-'); // '627_Overhead costs' → '627-Overhead costs'
function bpVd(s) { // 'VTL_INTER_0002_TIMOR TELECOM, S.A (TT)' → 'VTL_INTER_0002-TIMOR TELECOM, S.A (TT)'
  if (!s) return null; const seg = String(s).split('_');
  if (seg.length < 2) return String(s);
  let n = seg.findIndex((x, i) => i > 0 && /[a-z\s,.()&]/.test(x)); if (n < 0) n = seg.length - 1;
  let c = n; while (c > 1 && !/[\d-]/.test(seg[c - 1])) c--; if (!/[\d-]/.test(seg[c - 1])) c = n;
  return seg.slice(0, c).join('_') + '-' + seg.slice(c).join('_');
}
function reversalErpBook(lines, o) {
  const { sheet, headers } = require('./gl_journal_headers.json');
  const d8 = String(o.date), dmy = d8.split('-').reverse().join('/'), per = `${d8.slice(0, 4)}_${+d8.slice(5, 7)}`;
  const due = o.due ? String(o.due).split('-').reverse().join('/') : dmy;
  const aoa = [headers];
  lines.forEach((r, i) => {
    const row = new Array(headers.length).fill(null);
    if (i === 0) { row[1] = o.dept || null; row[2] = o.docType || 'GL Journal (Sub)'; row[3] = o.docNo || null; row[5] = dmy; row[6] = per; row[7] = o.desc || 'VTL: Adjust Estimate expense (AccSoft)'; }
    const bp = bpVd(r.bpCr || r.bp);
    const amt = r.out != null ? r.out : -r.rev;
    Object.assign(row, { 12: due, 13: r.outDesc != null ? r.outDesc : (o.prefix ?? 'VTL: Adjust ') + String(r.ds || '').replace(/^VTL[:_\s]*/i, ''), 14: 0, 15: 0, 16: r.currency || 'USD', 17: 1, 18: vd(r.drName), 19: amt, 20: vd(r.crName), 21: amt,
      22: bp, 23: bp, 24: vd(r.t), 25: r.deptSub || null, 27: vd(r.grpCost), 29: vd(r.services), 36: vd(r.location), 44: vd(r.project), 46: 1, 47: 0, 51: 'N', 55: 'N' });
    aoa.push(row);
  });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.slice(0, 31)); return wb;
}
function accrueCheckBook(lines, o) {
  return book([['Doi chieu trich truoc', lines.map(r => ({ 'Kỳ trích mới': o.target, 'Từ CT trích kỳ': r.per, 'CT gốc': r.doc, 'TK Nợ': r.drName, 'TK Có': r.crName, 'Đối tượng': r.bpCr || r.bp, 'Đối tượng (ERP)': bpVd(r.bpCr || r.bp),
    'Khoản mục': r.t, 'Số kỳ gốc': r.a, 'Số trích mới': r.out, 'Diễn giải mới': r.outDesc, 'Đã có trích kỳ mới': r.dup ? 'CÓ – kiểm tra trùng' : '',
    'Thiếu thông tin': [!r.grpCost && 'Group cost', !r.services && 'Services', !r.deptSub && 'Department Sub'].filter(Boolean).join(', ') }))]]);
}
function reversalCheckBook(lines, o) {
  return book([['Doi chieu huy trich', lines.map(r => ({ 'Kỳ dịch vụ': r.per, 'CT trích gốc': r.doc, 'Ngày trích': r.d, 'TK Nợ': r.drName, 'TK Có': r.crName, 'Đối tượng': r.bpCr || r.bp, 'Đối tượng (ERP)': bpVd(r.bpCr || r.bp),
    'Khoản mục': r.t, 'Số trích gốc': r.a, 'Số huỷ trích': -r.rev, 'Diễn giải gốc': r.ds, 'Người ghi chi phí thực tế': (r.users || []).map(u => String(u).split('_')[0]).join(', '),
    'Thiếu thông tin': [!r.grpCost && 'Group cost', !r.services && 'Services', !r.deptSub && 'Department Sub'].filter(Boolean).join(', ') }))],
    ['Thong tin chung tu', [{ 'Ngày hạch toán': o.date, 'Kỳ': o.date.slice(0, 7), 'Bộ phận': o.dept, 'Loại CT': o.docType, 'Diễn giải': o.desc, 'Số dòng': lines.length, 'Tổng huỷ trích': -lines.reduce((s, r) => s + r.rev, 0) }]]]);
}
function accrualBook(r) {
  const { summarize, AGE } = require('./accrual');
  const sh = s => String(s || '').split('_').slice(2).join('_') || String(s || '');
  const S = (by, label) => summarize(r.groups, by).sort((a, b) => by === 'per' ? a.key.localeCompare(b.key) : b.remain - a.remain).map(o => ({ [label]: by === 'p' ? o.key : by === 'u' ? String(o.key).split('_')[0] : o.key,
    'Số khoản': o.n, 'Đã trích': o.accrued, 'Đã huỷ / quyết toán': o.released, 'Còn treo 335': o.remain, 'Chi phí thực tế': o.actual, 'Chênh lệch thực tế − trích': o.actual - o.accrued,
    'Đã thanh toán': o.paid, 'Chưa thanh toán': o.unpaid, 'Khoản chưa huỷ trích': o.open, 'Chi phí nghi ghi 2 lần': o.dbl }));
  const det = r.groups.map(g => ({ 'Tình trạng': g.status, 'Mức': g.sev === 'H' ? 'Cao' : g.sev === 'M' ? 'Trung bình' : '', 'Đối tượng': g.p, 'Khoản mục': g.t, 'Kỳ dịch vụ': g.per,
    'Đã trích': g.accrued, 'Đã huỷ / quyết toán': g.released, 'Còn treo 335': g.remain, 'Chi phí thực tế': g.actual, 'Chênh lệch thực tế − trích': g.actual && g.accrued ? g.diff : null,
    'Đã thanh toán': g.paid, 'Chưa thanh toán': g.unpaid, 'Ngày thanh toán gần nhất': g.lastPay, 'CT trích': g.accDocs.join(', '), 'CT huỷ': g.relDocs.join(', '), 'CT thực tế': g.actDocs.join(', '), 'Hoá đơn': g.invs.join(', '),
    'Trích gần nhất': g.lastAcc, 'Tuổi khoản treo (ngày)': g.age, 'Người ghi chi phí thực tế': g.users.map(u => String(u).split('_')[0]).join(', '), 'Độ tin cậy': g.conf }));
  const open = r.groups.filter(g => g.remain > 0.005 && g.age != null);
  const age = AGE.map(([d, l], i) => { const xs = open.filter(g => g.age <= d && (i === 0 || g.age > AGE[i - 1][0])); return { 'Tuổi khoản trích còn treo': l, 'Số khoản': xs.length, 'Số tiền': xs.reduce((s, g) => s + g.remain, 0), 'Trong đó đã có chi phí thực tế': xs.filter(g => g.actual).reduce((s, g) => s + g.remain, 0) }; });
  return book([['Doi chieu chi tiet', det], ['Theo ky dich vu', S('per', 'Kỳ dịch vụ')], ['Theo doi tuong', S('p', 'Đối tượng')], ['Theo khoan muc', S('t', 'Khoản mục')], ['Theo nhan vien', S('u', 'Nhân viên')], ['Tuoi khoan treo', age]]);
}
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

const ruleInfo = () => ({ RULE_NAMES: Object.fromEntries(ALL_RULES.map(r => [r.k, r.n])), GROUPS, GROUP });
module.exports = { accrueCheckBook, accrualBook, reversalErpBook, reversalCheckBook, bpVd, ruleInfo, inventoryBook, XLSX, errorsBook, agingBook, reportBook, toBuffer, book, errRow, mailHtml, mailSubject, emailOf, shortName };
