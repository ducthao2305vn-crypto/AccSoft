'use strict';
// Định dạng file Excel xuất ra cho chuyên nghiệp: tiêu đề báo cáo, thông tin kỳ / thời điểm lập, tiêu đề cột in đậm nền màu,
// định dạng số tiền (#,##0.00, số âm màu đỏ), số lượng, ngày (dd/mm/yyyy), %, độ rộng cột, lọc tự động, cố định dòng tiêu đề, dòng tổng in đậm.
// Thư viện SheetJS bản cộng đồng không ghi được kiểu chữ → ghi file xong mới chèn kiểu (styles.xml + thuộc tính s của ô) vào gói xlsx.
const XLSX = require('../vendor/xlsx.full.min.js');

// Tên sheet có dấu
const SHEET_VN = {
  'Can khac phuc': 'Cần khắc phục', 'Canh bao': 'Cảnh báo', 'Chi tiet': 'Chi tiết', 'Chi tiet doi tuong x TK': 'Chi tiết đối tượng × TK', 'Chi tiet tai khoan': 'Chi tiết tài khoản',
  'Chi tiet ton kho': 'Chi tiết tồn kho', 'Da kiem tra': 'Đã kiểm tra', 'Danh muc': 'Danh mục', 'Dieu chinh': 'Điều chỉnh', 'Doi chieu chi tiet': 'Đối chiếu chi tiết',
  'Doi chieu huy trich': 'Đối chiếu huỷ trích', 'Doi chieu trich truoc': 'Đối chiếu trích trước', 'Doi tuong': 'Đối tượng', 'Du nguoc chieu': 'Dư ngược chiều', 'Huong dan': 'Hướng dẫn',
  'Loi nhap lieu': 'Lỗi nhập liệu', 'Nhom': 'Nhóm', 'So du dau ky': 'Số dư đầu kỳ', 'So du theo cong ty': 'Số dư theo công ty', 'Theo cong ty': 'Theo công ty', 'Theo doi tac': 'Theo đối tác',
  'Theo doi tuong': 'Theo đối tượng', 'Theo khoan muc': 'Theo khoản mục', 'Theo ky dich vu': 'Theo kỳ dịch vụ', 'Theo loai loi': 'Theo loại lỗi', 'Theo nam': 'Theo năm',
  'Theo nguoi nhap': 'Theo người nhập', 'Theo nhan vien': 'Theo nhân viên', 'Theo nhom tai khoan': 'Theo nhóm tài khoản', 'Theo thang': 'Theo tháng', 'Thong tin': 'Thông tin',
  'Thong tin chung tu': 'Thông tin chứng từ', 'Ton am': 'Tồn âm', 'Tong hop': 'Tổng hợp', 'Tong hop theo TK': 'Tổng hợp theo TK', 'Tuoi khoan treo': 'Tuổi khoản treo',
  'CDSPS': 'Bảng CĐSPS', 'B03-DN truc tiep': 'B03-DN trực tiếp', 'B03-DN gian tiep': 'B03-DN gián tiếp', 'B03 gian tiep - ma 07': 'B03 gián tiếp - mã 07', 'B03 phan loai': 'B03 phân loại',
  'Cach tinh phi': 'Cách tính phí', 'Theo nhom': 'Theo nhóm', 'CDPS theo doi tuong': 'CĐPS theo đối tượng',
};
// Tên báo cáo theo tên file
const TITLE = [[/^AccSoft_CDPS_DoiTuong/, 'BẢNG CÂN ĐỐI PHÁT SINH THEO ĐỐI TƯỢNG'], [/^AccSoft_DieuChinhDuLieu/, 'ĐIỀU CHỈNH DỮ LIỆU QUẢN TRỊ'], [/^AccSoft_LichSuDieuChinh/, 'LỊCH SỬ ĐIỀU CHỈNH DỮ LIỆU'], [/^AccSoft_BCTC/, 'BÁO CÁO TÀI CHÍNH'], [/^AccSoft_BaoCaoKiemTra/, 'BÁO CÁO KIỂM TRA DỮ LIỆU HẠCH TOÁN'], [/^AccSoft_BaoCaoRuiRo/, 'BÁO CÁO RỦI RO HẠCH TOÁN'],
  [/^AccSoft_CanKhacPhuc/, 'DANH SÁCH LỖI CẦN KHẮC PHỤC'], [/^AccSoft_LoiNhapLieu/, 'DANH SÁCH LỖI NHẬP LIỆU'], [/^AccSoft_NoiBo_SoDu/, 'SỐ DƯ GIAO DỊCH NỘI BỘ'],
  [/^AccSoft_NoiBo_TheoNam/, 'TỔNG HỢP GIAO DỊCH NỘI BỘ THEO NĂM'], [/^AccSoft_NoiBo_ChiTiet/, 'CHI TIẾT GIAO DỊCH NỘI BỘ'], [/^AccSoft_NoiBo_TongHop/, 'TỔNG HỢP GIAO DỊCH NỘI BỘ'],
  [/^AccSoft_NoiBo_DieuChinh/, 'ĐIỀU CHỈNH ĐỐI TƯỢNG NỘI BỘ'], [/^AccSoft_NoiBo/, 'GIAO DỊCH NỘI BỘ'], [/^AccSoft_PhaiThu/, 'PHÂN TÍCH PHẢI THU THEO ĐỐI TƯỢNG'],
  [/^AccSoft_ThanhToanQuocTe/, 'THANH TOÁN CHO ĐỐI TÁC QUỐC TẾ'], [/^AccSoft_TrichTruoc/, 'TRÍCH TRƯỚC – HUỶ TRÍCH CHI PHÍ PHẢI TRẢ'], [/^AccSoft_TuoiHangTonKho/, 'TUỔI HÀNG TỒN KHO'],
  [/^AccSoft_TuoiNo/, 'TUỔI NỢ PHẢI THU – PHẢI TRẢ']];
// File dùng để nạp lại vào ứng dụng / ERP → giữ nguyên định dạng thô
const RAW = /^AccSoft_MauSoDuDauKy|^DANH_MUC/i;

const dmy = s => s.split('-').reverse().join('/');
function subtitle(name) {
  const base = String(name).replace(/\.xlsx?$/i, '').replace(/^AccSoft_/, '');
  const ds = [...base.matchAll(/(\d{4})-?(\d{2})(?:-?(\d{2}))?/g)].map(m => m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`);
  return ds.length === 2 ? `Kỳ báo cáo: ${ds[0]} – ${ds[1]}` : ds.length === 1 ? `Tại: ${ds[0]}` : '';
}
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const serial = v => { const [y, m, d] = v.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
const CNT = /^(số (dòng|lần|tk|khoản|đối tượng|công ty|chứng từ|mặt hàng|bút toán|lỗi|tháng|giao dịch)|sl\b|số lượng|line$|tuổi|ngày quá hạn|số ngày)/i;
const NOFMT = /^(năm|tháng|kỳ|mã|tk|số hiệu|tài khoản|line|stt|no\.?)$/i;
const F_AMT = '#,##0.00;[Red]-#,##0.00;"-"', F_CNT = '#,##0;[Red]-#,##0;"-"', F_QTY = '#,##0.##;[Red]-#,##0.##;"-"', F_PCT = '0.0%', F_DATE = 'dd/mm/yyyy';
const totalRow = r => { const t = r.filter(x => typeof x === 'string' && x.trim()).slice(0, 3).join(' ').trim(); const f = r.find(x => typeof x === 'string' && x.trim()) || ''; return /^(tổng|cộng|total)/i.test(t) || (f.length > 10 && /\s/.test(f) && f === f.toUpperCase() && /[A-ZÀ-Ỹ]/.test(f) && !/_/.test(f)); };

// Dựng lại từng sheet: 3 dòng tiêu đề + 1 dòng trống + dòng tiêu đề cột (dòng 5) + dữ liệu
function prettify(wb, fileName) {
  if (RAW.test(fileName)) return wb;
  const title = (TITLE.find(([re]) => re.test(fileName)) || [, 'BÁO CÁO ACCSOFT'])[1], sub = subtitle(fileName);
  const now = new Date(), stamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const names = [], sheets = {}, meta = {};
  for (const sn of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
    const vn = (SHEET_VN[sn] || sn).slice(0, 31); let name = vn, k = 2; while (names.includes(name)) name = vn.slice(0, 28) + ' ' + k++;
    names.push(name);
    const head = (aoa[0] || []).map(h => h == null ? '' : String(h)), body = aoa.slice(1), nc = Math.max(head.length, ...body.map(r => r.length), 1);
    // Kiểu dữ liệu theo cột
    const kind = Array.from({ length: nc }, (_, c) => { const h = head[c] || '', vals = body.map(r => r[c]).filter(v => v != null && v !== '');
      if (!vals.length) return 'txt'; if (vals.every(isDate)) return 'date'; if (!vals.every(v => typeof v === 'number')) return 'txt';
      if (/%/.test(h)) return vals.every(v => Math.abs(v) <= 5) ? 'pct' : 'amt'; if (NOFMT.test(h.trim())) return 'raw';
      if (/^sl\b|số lượng/i.test(h)) return 'qty'; if (CNT.test(h)) return 'cnt'; return vals.every(v => Number.isInteger(v)) && /số|count|n$/i.test(h) && !/tiền|dư|phát sinh|giá trị|doanh|chi phí|phải|thu|trả/i.test(h) ? 'cnt' : 'amt'; });
    const rows = [[title], [(SHEET_VN[sn] || sn) + (sub ? ' · ' + sub : '')], [`Lập bởi AccSoft lúc ${stamp} · Đơn vị tiền: theo dữ liệu hạch toán`], [], head.concat(Array(nc - head.length).fill(''))];
    const tot = new Set();
    body.forEach((r, i) => { const row = Array.from({ length: nc }, (_, c) => r[c] ?? null); if (totalRow(row)) { tot.add(6 + i); for (let c = 0; c < nc; c++) if (row[c] == null) row[c] = ''; } rows.push(row); });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let i = 0; i < body.length; i++) for (let c = 0; c < nc; c++) { const a = XLSX.utils.encode_cell({ r: 5 + i, c }), cell = ws[a]; if (!cell) continue;
      const kd = kind[c]; if (kd === 'date' && isDate(cell.v)) { cell.t = 'n'; cell.v = serial(cell.v); cell.z = F_DATE; }
      else if (cell.t === 'n') cell.z = kd === 'pct' ? F_PCT : kd === 'cnt' ? F_CNT : kd === 'qty' ? F_QTY : kd === 'raw' ? undefined : F_AMT; }
    // độ rộng cột
    ws['!cols'] = Array.from({ length: nc }, (_, c) => { let w = String(head[c] || '').length + 2;
      for (const r of body.slice(0, 3000)) { const v = r[c]; if (v == null) continue; const l = typeof v === 'number' ? (kind[c] === 'raw' ? String(v).length : Math.abs(v).toFixed(2).length + Math.floor(Math.abs(v).toFixed(0).length / 3) + 2) : isDate(v) ? 10 : String(v).length; if (l > w) w = l; }
      return { wch: Math.max(8, Math.min(kind[c] === 'txt' ? 60 : 22, w + 1)) }; });
    if (body.length && head.some(Boolean)) ws['!autofilter'] = { ref: `A5:${XLSX.utils.encode_col(nc - 1)}${5 + body.length}` };
    sheets[name] = ws; meta[name] = { tot, nc, last: 5 + body.length };
  }
  const out = XLSX.utils.book_new(); for (const n of names) XLSX.utils.book_append_sheet(out, sheets[n], n);
  out.__fmt = meta; return out;
}

// Chèn kiểu chữ vào gói xlsx đã ghi
function stylize(buf, wb) {
  if (!wb || !wb.__fmt) return buf;
  const z = XLSX.CFB.read(buf, { type: 'buffer' }), get = p => { const f = XLSX.CFB.find(z, p); return f ? Buffer.from(f.content).toString('utf8') : null; };
  const put = (p, s) => { const f = XLSX.CFB.find(z, p); f.content = Buffer.from(s, 'utf8'); f.size = f.content.length; };
  let st = get('/xl/styles.xml'); if (!st) return buf;
  const grab = tag => { const m = st.match(new RegExp(`<${tag} count="(\\d+)">([\\s\\S]*?)</${tag}>`)); return { n: +m[1], body: m[2] }; };
  const fonts = grab('fonts'), fills = grab('fills'), borders = grab('borders'), xfs = grab('cellXfs');
  const F0 = fonts.n, newFonts = ['<font><b/><sz val="11"/><color rgb="FF101828"/><name val="Calibri"/><family val="2"/></font>', '<font><b/><sz val="15"/><color rgb="FFFA4700"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>', '<font><i/><sz val="10"/><color rgb="FF667085"/><name val="Calibri"/><family val="2"/></font>', '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>'];
  const FB = F0, FT = F0 + 1, FW = F0 + 2, FI = F0 + 3, FN = F0 + 4;
  const L0 = fills.n, newFills = ['<fill><patternFill patternType="solid"><fgColor rgb="FFFA4700"/><bgColor indexed="64"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1EB"/><bgColor indexed="64"/></patternFill></fill>'];
  const LH = L0, LT = L0 + 1, B0 = borders.n, BD = B0;
  const newBorders = ['<border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border>'];
  const xfList = xfs.body.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [], added = [], cache = new Map();
  const numOf = i => +((xfList[i] || '').match(/numFmtId="(\d+)"/) || [, 0])[1];
  const mk = (num, font, fill, border, align) => { const k = [num, font, fill, border, align].join('|'); if (cache.has(k)) return cache.get(k);
    const x = `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`;
    const id = xfList.length + added.length; added.push(x); cache.set(k, id); return id; };
  const S_T = mk(0, FT, 0, 0, ''), S_S = mk(0, FI, 0, 0, ''), S_H = mk(0, FW, LH, BD, '<alignment horizontal="center" vertical="center" wrapText="1"/>');
  st = st.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, `<fonts count="${F0 + newFonts.length}">${fonts.body}${newFonts.join('')}</fonts>`)
    .replace(/<fills count="\d+">[\s\S]*?<\/fills>/, `<fills count="${L0 + newFills.length}">${fills.body}${newFills.join('')}</fills>`)
    .replace(/<borders count="\d+">[\s\S]*?<\/borders>/, `<borders count="${B0 + newBorders.length}">${borders.body}${newBorders.join('')}</borders>`);
  wb.SheetNames.forEach((n, i) => {
    const p = `/xl/worksheets/sheet${i + 1}.xml`, m = wb.__fmt[n]; let x = get(p); if (!x || !m) return;
    x = x.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, (all, col, rs, attrs, sc) => { const r = +rs, s0 = +((attrs.match(/\ss="(\d+)"/) || [, 0])[1]), a = attrs.replace(/\ss="\d+"/, '');
      let s; if (r === 1) s = S_T; else if (r === 2 || r === 3) s = S_S; else if (r === 5) s = S_H; else if (r > 5 && r <= m.last) s = m.tot.has(r) ? mk(numOf(s0), FB, LT, BD, '') : mk(numOf(s0), FN, 0, BD, numOf(s0) === 0 ? '<alignment vertical="top" wrapText="0"/>' : '');
      else return all; return `<c r="${col}${rs}"${a} s="${s}"${sc}>`; });
    x = x.replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0" showGridLines="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A6" sqref="A6"/></sheetView>');
    x = x.replace(/(<row r="5")/, '$1 ht="32" customHeight="1"').replace(/(<row r="1")/, '$1 ht="24" customHeight="1"');
    put(p, x);
  });
  st = st.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${xfList.length + added.length}">${xfList.join('')}${added.join('')}</cellXfs>`);
  put('/xl/styles.xml', st);
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}
module.exports = { prettify, stylize, RAW };
