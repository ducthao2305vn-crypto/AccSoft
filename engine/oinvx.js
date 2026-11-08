'use strict';
// Xuất báo cáo "Đầu tư ra nước ngoài" ra Excel theo bố cục biểu mẫu giám sát (6 sheet 01–06), dùng ExcelJS để có định dạng, gộp ô, công thức.
const ExcelJS = require('exceljs');
const ORG = 'TỔNG CÔNG TY CP ĐẦU TƯ QUỐC TẾ VIETTEL', CO = 'CÔNG TY VIETTEL TIMOR UNIPESSOAL LDA';
const thin = { style: 'thin', color: { argb: 'FF98A2B3' } }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7DC' } }, SEC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
const NUM = '#,##0.00;[Red]-#,##0.00;"-"', MIO = '#,##0.000;[Red]-#,##0.000;"-"', PCT = '0.0%';
const dmy = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.split('-').reverse().join('/') : (d || '');
const col = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

function sheet(wb, name, width) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getCell('A1').value = ORG; ws.getCell('A1').font = { bold: true, size: 11 };
  ws.getCell('A2').value = 'ĐƠN VỊ: ' + CO; ws.getCell('A2').font = { bold: true, size: 11 };
  ws.columns = width.map(w => ({ width: w }));
  return ws;
}
function title(ws, row, text, sub, ncol) {
  ws.mergeCells(row, 1, row, ncol); const c = ws.getCell(row, 1); c.value = text; c.font = { bold: true, size: 14 }; c.alignment = { horizontal: 'center' };
  if (sub) { ws.mergeCells(row + 1, 1, row + 1, ncol); const d = ws.getCell(row + 1, 1); d.value = sub; d.font = { italic: true }; d.alignment = { horizontal: 'center' }; }
}
// Ô tiêu đề cột: hd = [[r, c, r2, c2, text]]
function heads(ws, hd) {
  for (const [r, c, r2, c2, t] of hd) { if (r2 !== r || c2 !== c) ws.mergeCells(r, c, r2, c2); const x = ws.getCell(r, c); x.value = t; x.font = { bold: true }; x.fill = HEAD; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
  const r0 = Math.min(...hd.map(h => h[0])), r1 = Math.max(...hd.map(h => h[2])), c1 = Math.max(...hd.map(h => h[3]));
  for (let r = r0; r <= r1; r++) for (let c = 1; c <= c1; c++) { const x = ws.getCell(r, c); x.border = BOX; if (!x.fill || x.fill.type !== 'pattern') x.fill = HEAD; }
}
function put(ws, r, vals, o = {}) {
  vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); if (v !== undefined) c.value = v; c.border = BOX;
    if (o.fmt && o.fmt[i]) c.numFmt = o.fmt[i]; if (o.bold) c.font = { bold: true }; if (o.fill) c.fill = o.fill; if (o.wrap && o.wrap.includes(i)) c.alignment = { wrapText: true, vertical: 'top' }; });
}
const sign = (ws, r, cells) => { for (const [c, t] of cells) { ws.getCell(r, c).value = t; ws.getCell(r, c).font = { bold: true }; ws.getCell(r + 1, c).value = '(ký, ghi rõ họ tên)'; ws.getCell(r + 1, c).font = { italic: true }; } };

async function build(R, o = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'AccSoft';
  const L = o.label || `${R.from} – ${R.to}`, Y = +R.to.slice(0, 4);

  /* 01 */
  { const ws = sheet(wb, '01', [52, 16, 16, 16, 16, 14, 14, 14]);
    ws.getCell('H1').value = 'Biểu 02 Mẫu 03'; title(ws, 4, `TÌNH HÌNH SẢN XUẤT KINH DOANH VÀ TÌNH HÌNH TÀI CHÍNH ${L.toUpperCase()}`, null, 8); ws.getCell('H6').value = 'ĐVT: Tr USD';
    heads(ws, [[7, 1, 8, 1, 'Nội dung'], [7, 2, 8, 2, `Thực hiện ${L} năm ${Y - 2}`], [7, 3, 8, 3, `Thực hiện ${L} năm ${Y - 1}`], [7, 4, 7, 5, `Thực hiện ${L} năm ${Y}`], [8, 4, 8, 4, 'KH'], [8, 5, 8, 5, 'TH'],
      [7, 6, 7, 8, 'Biến động so với (tỷ lệ %)'], [8, 6, 8, 6, `Cùng kỳ ${Y - 2}`], [8, 7, 8, 7, `Cùng kỳ ${Y - 1}`], [8, 8, 8, 8, `Kế hoạch ${Y}`]]);
    put(ws, 9, ['', '[1]', '[2]', '[3]', '[4]', '[5]=[4]/[1]', '[6]=[4]/[2]', '[7]=[4]/[3]'], { fill: SEC });
    let r = 10;
    for (const x of R.m01.rows) {
      if (x.head) { put(ws, r, [x.n, '', '', '', '', '', '', ''], { bold: true, fill: SEC }); r++; continue; }
      const f = x.man ? '#,##0' : MIO;
      put(ws, r, [x.n, x.B ?? null, x.C ?? null, x.D ?? null, x.E ?? null, { formula: `IFERROR(E${r}/B${r},"")` }, { formula: `IFERROR(E${r}/C${r},"")` }, { formula: `IFERROR(E${r}/D${r},"")` }],
        { fmt: [null, f, f, f, f, PCT, PCT, PCT], bold: ['gp', 'op', 'pbt', 'pat'].includes(x.k) });
      r++;
    }
    sign(ws, r + 1, [[1, 'Người lập biểu'], [3, 'Phụ trách phòng'], [6, 'Tổng Giám đốc']]); }

  /* 02 */
  { const ws = sheet(wb, '02', [52, 18, 18, 18, 30]);
    ws.getCell('D1').value = 'Biểu 03 Mẫu 03'; title(ws, 3, 'MỘT SỐ CHỈ TIÊU TÀI CHÍNH CỦA CÔNG TY VIETTEL TIMOR', `(Kỳ báo cáo: ${L} ${Y})`, 5); ws.getCell('D5').value = 'ĐVT: Tr USD';
    heads(ws, [[6, 1, 6, 1, 'Chỉ tiêu'], [6, 2, 6, 2, `${L} ${Y}`], [6, 3, 6, 3, `Đầu năm ${Y}`], [6, 4, 6, 4, 'Tỷ lệ % Năm BC/Năm trước'], [6, 5, 6, 5, 'Ghi chú']]);
    let r = 7;
    for (const x of R.m02.rows) { put(ws, r, [x.n, x.B, x.C, { formula: `IFERROR(B${r}/C${r},"")` }, x.note], { fmt: [null, MIO, MIO, PCT], bold: x.lvl === 0 }); if (x.lvl) ws.getCell(r, 1).alignment = { indent: x.lvl }; r++; }
    sign(ws, r + 1, [[1, 'Người lập biểu'], [2, 'Phụ trách phòng'], [3, 'Tổng Giám đốc']]); }

  /* 03 – nợ phải trả */
  { const ws = sheet(wb, '03', [6, 46, 12, 18, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
    title(ws, 4, `BÁO CÁO PHÂN TÍCH NỢ PHẢI TRẢ ${L.toUpperCase()} NĂM ${Y}`, `Từ ${dmy(R.m03.d0)} đến ${dmy(R.m03.d1)} · hạn thanh toán mặc định ${R.term} ngày (dùng ngày đến hạn nếu có)`, 16); ws.getCell('P6').value = 'Đơn vị tính: USD';
    const a = dmy(R.m03.d0), b = dmy(R.m03.d1);
    heads(ws, [[7, 1, 9, 1, 'TT'], [7, 2, 9, 2, 'Đối tượng công nợ'], [7, 3, 9, 3, 'Tài khoản theo dõi'], [7, 4, 9, 4, 'Nội dung công nợ'], [7, 5, 7, 8, 'Tổng'],
      [8, 5, 9, 5, `Số dư tại ${a}`], [8, 6, 9, 6, 'Số phát sinh tăng trong kỳ'], [8, 7, 9, 7, 'Số phát sinh giảm trong kỳ'], [8, 8, 9, 8, `Số dư tại ${b}`],
      [7, 9, 7, 16, 'Trong đó, Nợ phải trả quá hạn (≥ 6 tháng)'], [8, 9, 9, 9, `Số dư tại ${a}`], [8, 10, 9, 10, 'Số phát sinh tăng trong kỳ'], [8, 11, 9, 11, 'Số phát sinh giảm trong kỳ'], [8, 12, 9, 12, `Số dư tại ${b}`],
      [8, 13, 8, 16, `Chi tiết theo thời gian quá hạn thời điểm ${b}`], [9, 13, 9, 13, '6 tháng <= Nợ < 1 năm'], [9, 14, 9, 14, '1 năm <= Nợ < 2 năm'], [9, 15, 9, 15, '2 năm <= Nợ < 3 năm'], [9, 16, 9, 16, 'Nợ >= 3 năm']]);
    put(ws, 10, ['A', 'B', 'C', 'D', ...Array.from({ length: 12 }, (_, i) => String(i + 1))], { fill: SEC });
    let r = 11; const tot = [];
    for (const s of R.m03.secs) {
      const r0 = r; tot.push(r0); r++;
      s.rows.forEach((x, i) => { put(ws, r, [i + 1, x.bp, x.accs, '', x.ob, x.inc + Math.max(0, x.adj || 0), x.dec - Math.min(0, x.adj || 0), { formula: `E${r}+F${r}-G${r}` }, x.odOb || 0, null, null, { formula: `SUM(M${r}:P${r})` }, ...x.od],
        { fmt: [null, null, null, null, ...Array(12).fill(NUM)], wrap: [1] }); r++; });
      put(ws, r0, [s.no, s.title, '', '', ...Array.from({ length: 12 }, (_, i) => ({ formula: s.rows.length ? `SUM(${col(5 + i)}${r0 + 1}:${col(5 + i)}${r - 1})` : '0' }))], { bold: true, fill: SEC, fmt: [null, null, null, null, ...Array(12).fill(NUM)] });
    }
    put(ws, r, ['', 'Tổng cộng', '', '', ...Array.from({ length: 12 }, (_, i) => ({ formula: tot.map(t => col(5 + i) + t).join('+') }))], { bold: true, fill: HEAD, fmt: [null, null, null, null, ...Array(12).fill(NUM)] });
    r += 2; ws.getCell(r, 2).value = 'Đối chiếu với BCTC (B01-DN)'; ws.getCell(r, 2).font = { bold: true }; r++;
    put(ws, r, ['', 'Chỉ tiêu', '', '', 'Đầu kỳ – báo cáo', 'Đầu kỳ – B01', 'Chênh lệch', 'Cuối kỳ – báo cáo', 'Cuối kỳ – B01', 'Chênh lệch'], { bold: true, fill: SEC }); r++;
    for (const c of R.m03.check) { put(ws, r, ['', c.n, '', '', c.vOb, c.fsOb, c.diffOb, c.v, c.fs, c.diff], { fmt: [null, null, null, null, NUM, NUM, NUM, NUM, NUM, NUM] }); r++; }
    r++; ws.getCell(r, 2).value = 'Đối chiếu Trial balance theo tài khoản (cuối kỳ)'; ws.getCell(r, 2).font = { bold: true }; r++;
    put(ws, r, ['', 'Tài khoản', 'Số đối tượng', '', 'Số dư TB (CĐPS)', 'Tổng ròng theo đối tượng', 'Chênh lệch', 'Dư đúng chiều (báo cáo)', 'Dư ngược chiều (mẫu khác)'], { bold: true, fill: SEC }); r++;
    for (const s of R.m03.secs) for (const t of s.tb) { put(ws, r, ['', t.acc + (t.mode === 'net' ? ' (ròng)' : ''), t.n, '', t.tb, t.net, t.diff, t.rep, t.mode === 'side' ? t.neg : null], { fmt: [null, null, '#,##0', null, NUM, NUM, NUM, NUM, NUM] }); r++; }
    r++; ws.getCell(r, 2).value = 'TK công nợ còn số dư nhưng không thuộc mẫu nào'; ws.getCell(r, 2).font = { bold: true }; r++;
    if (!(R.m03.rest || []).length) { ws.getCell(r, 2).value = 'Không còn TK nào bị sót'; r++; }
    for (const x of R.m03.rest || []) { put(ws, r, ['', x.acc + ' ' + x.name, '', '', x.v, x.note], { fmt: [null, null, null, null, NUM] }); r++; }
    ws.getCell(r, 2).value = 'Đầu kỳ = số dư cuối tháng trước kỳ báo cáo; mỗi đối tượng / TK xếp chiều theo số dư tại từng thời điểm như B01'; ws.getCell(r, 2).font = { italic: true, color: { argb: 'FF667085' } };
    ws.views = [{ state: 'frozen', ySplit: 10, xSplit: 2, showGridLines: false }];
    sign(ws, r + 2, [[2, 'Người lập biểu'], [6, 'Phụ trách phòng'], [12, 'Tổng Giám đốc']]); }

  /* 04 – hàng tồn kho */
  { const ws = sheet(wb, '04', [6, 12, 46, 10, 26, 8, 12, 15, 12, 15, 12, 15, 12, 15, 15, 15, 15, 15, 15, 15, 15]);
    title(ws, 4, 'BÁO CÁO SỐ LIỆU HÀNG TỒN KHO', `Kỳ báo cáo: ${dmy(R.m04.d0)} – ${dmy(R.m04.d1)} · hạn lưu kho ${R.m04.keepM} tháng (FIFO theo ngày nhập)`, 21); ws.getCell('U6').value = 'Đơn vị tính: USD';
    heads(ws, [[7, 1, 9, 1, 'STT'], [7, 2, 9, 2, 'MÃ HÀNG TỒN KHO'], [7, 3, 9, 3, 'TÊN HÀNG TỒN KHO'], [7, 4, 9, 4, 'Tài khoản theo dõi'], [7, 5, 9, 5, 'Mã đối tượng'], [7, 6, 9, 6, 'ĐVT'],
      [7, 7, 8, 8, 'TỒN ĐẦU KỲ'], [7, 9, 8, 10, 'NHẬP TRONG KỲ'], [7, 11, 8, 12, 'XUẤT TRONG KỲ'], [7, 13, 8, 14, 'TỒN CUỐI KỲ'],
      ...[7, 9, 11, 13].flatMap(c => [[9, c, 9, c, 'Số lượng'], [9, c + 1, 9, c + 1, 'Giá trị']]),
      [7, 15, 7, 21, 'PHÂN LOẠI THEO THỜI GIAN LƯU KHO'], [8, 15, 9, 15, 'Trong hạn'], [8, 16, 8, 21, 'Quá hạn'], [9, 16, 9, 16, 'Tổng'], [9, 17, 9, 17, 'Quá hạn < 6 tháng'],
      [9, 18, 9, 18, '6 tháng <= quá hạn < 1 năm'], [9, 19, 9, 19, '1 năm <= quá hạn < 2 năm'], [9, 20, 9, 20, '2 năm <= quá hạn < 3 năm'], [9, 21, 9, 21, 'Quá hạn >= 3 năm']]);
    put(ws, 10, ['A', 'B', 'C', 'D', 'E', 'F', ...Array.from({ length: 15 }, (_, i) => String(i + 1))], { fill: SEC });
    let r = 11; const tot = [], F = [null, null, null, null, null, null, '#,##0.##', NUM, '#,##0.##', NUM, '#,##0.##', NUM, '#,##0.##', NUM, ...Array(7).fill(NUM)];
    for (const s of R.m04.secs) {
      const r0 = r; tot.push(r0); r++;
      s.rows.forEach((x, i) => { put(ws, r, [i + 1, x.code, x.name, x.acc, x.loc, x.uom, x.obQ, x.obV, x.inQ, x.inV, x.outQ, x.outV, { formula: `G${r}+I${r}-K${r}` }, { formula: `H${r}+J${r}-L${r}` }, x.ok, { formula: `SUM(Q${r}:U${r})` }, ...x.od], { fmt: F, wrap: [2] }); r++; });
      put(ws, r0, [s.no, '', s.title, s.pre, '', '', ...Array.from({ length: 15 }, (_, i) => ({ formula: s.rows.length ? `SUBTOTAL(9,${col(7 + i)}${r0 + 1}:${col(7 + i)}${r - 1})` : '0' }))], { bold: true, fill: SEC, fmt: F });
      ws.getCell(r0, 22).value = `Sổ cái: ${Math.round(s.ledger * 100) / 100}`; ws.getCell(r0, 22).font = { italic: true, color: { argb: 'FF667085' } };
    }
    put(ws, r, ['', '', 'TỔNG CỘNG', '', '', '', ...Array.from({ length: 15 }, (_, i) => ({ formula: tot.map(t => col(7 + i) + t).join('+') }))], { bold: true, fill: HEAD, fmt: F });
    ws.views = [{ state: 'frozen', ySplit: 10, xSplit: 3, showGridLines: false }]; ws.autoFilter = { from: { row: 10, column: 1 }, to: { row: 10, column: 21 } };
    sign(ws, r + 2, [[3, 'NGƯỜI LẬP'], [10, 'PHỤ TRÁCH PHÒNG'], [16, 'TỔNG GIÁM ĐỐC']]); }

  /* 05 – nợ phải thu */
  { const ws = sheet(wb, '05', [6, 46, 12, 18, 16, 16, 16, 16, ...Array(16).fill(14), 16]);
    ws.getCell('X1').value = 'Biểu 6 - Mẫu 3'; title(ws, 4, `BÁO CÁO PHÂN TÍCH NỢ PHẢI THU ${L.toUpperCase()} NĂM ${Y}`, `Từ ${dmy(R.m05.d0)} đến ${dmy(R.m05.d1)} · hạn thanh toán mặc định ${R.term} ngày (dùng ngày đến hạn nếu có)`, 24); ws.getCell('X6').value = 'Đơn vị tính: USD';
    const a = dmy(R.m05.d0), b = dmy(R.m05.d1);
    heads(ws, [[7, 1, 9, 1, 'TT'], [7, 2, 9, 2, 'Đối tượng công nợ'], [7, 3, 9, 3, 'Tài khoản theo dõi'], [7, 4, 9, 4, 'Nội dung công nợ'], [7, 5, 7, 24, 'Công nợ phải thu'],
      [8, 5, 9, 5, `Số dư tại ${a}`], [8, 6, 9, 6, 'Số phát sinh tăng trong kỳ'], [8, 7, 9, 7, 'Số phát sinh giảm trong kỳ'], [8, 8, 9, 8, `Số dư tại ${b}`],
      [8, 9, 8, 16, 'Nợ cước viễn thông, CNTT, phải thu khách hàng'], ...['Trong hạn', 'Quá hạn < 3 tháng', '3 tháng <= Nợ < 6 tháng', '6 tháng <= Nợ < 9 tháng', '9 tháng <= Nợ < 12 tháng', '1 năm <= Nợ < 2 năm', '2 năm <= Nợ < 3 năm', 'Nợ >= 3 năm'].map((t, i) => [9, 9 + i, 9, 9 + i, t]),
      [8, 17, 8, 22, 'Nợ phải thu khác'], ...['Trong hạn', 'Quá hạn < 6 tháng', '6 tháng <= Nợ < 1 năm', '1 năm <= Nợ < 2 năm', '2 năm <= Nợ < 3 năm', 'Nợ >= 3 năm'].map((t, i) => [9, 17 + i, 9, 17 + i, t]),
      [8, 23, 8, 24, 'Nợ khó đòi (quá hạn ≥ 6 tháng)'], [9, 23, 9, 23, `Tại ${a}`], [9, 24, 9, 24, `Tại ${b}`], [7, 25, 9, 25, 'Ghi chú']]);
    put(ws, 10, ['A', 'B', 'C', 'D', ...Array.from({ length: 20 }, (_, i) => String(i + 1)), ''], { fill: SEC });
    let r = 11; const tot = [], F = [null, null, null, null, ...Array(20).fill(NUM)];
    R.m05.secs.forEach((s, si) => {
      const r0 = r; tot.push(r0); r++;
      s.rows.forEach((x, i) => { const trade = si === 0, ag = trade ? [...x.trade, ...Array(6).fill(null)] : [...Array(8).fill(null), ...x.oth];
        put(ws, r, [i + 1, x.bp, x.accs, '', x.ob, x.inc + Math.max(0, x.adj || 0), x.dec - Math.min(0, x.adj || 0), { formula: `E${r}+F${r}-G${r}` }, ...ag, x.badOb || 0, x.bad, x.cb < 0 ? 'Số dư ròng âm (dư Có)' : ''], { fmt: F, wrap: [1] }); r++; });
      put(ws, r0, [s.no, s.title, '', '', ...Array.from({ length: 20 }, (_, i) => ({ formula: s.rows.length ? `SUBTOTAL(9,${col(5 + i)}${r0 + 1}:${col(5 + i)}${r - 1})` : '0' })), ''], { bold: true, fill: SEC, fmt: F });
    });
    put(ws, r, ['', 'Tổng cộng', '', '', ...Array.from({ length: 20 }, (_, i) => ({ formula: tot.map(t => col(5 + i) + t).join('+') })), ''], { bold: true, fill: HEAD, fmt: F });
    r += 2; ws.getCell(r, 2).value = 'Đối chiếu với BCTC (B01-DN)'; ws.getCell(r, 2).font = { bold: true }; r++;
    put(ws, r, ['', 'Chỉ tiêu', '', '', 'Đầu kỳ – báo cáo', 'Đầu kỳ – B01', 'Chênh lệch', 'Cuối kỳ – báo cáo', 'Cuối kỳ – B01', 'Chênh lệch'], { bold: true, fill: SEC }); r++;
    if (R.m05.bad) { const B = R.m05.bad; put(ws, r, ['', 'Nợ khó đòi (quá hạn ≥ 6 tháng) – so với dự phòng đã trích (B01 mã 137, TK 2293)', '', '', B.ob, B.provOb, B.ob - B.provOb, B.cb, B.provCb, B.cb - B.provCb], { fmt: [null, null, null, null, NUM, NUM, NUM, NUM, NUM, NUM] }); r++; }
    for (const c of R.m05.check) { put(ws, r, ['', c.n, '', '', c.vOb, c.fsOb, c.diffOb, c.v, c.fs, c.diff], { fmt: [null, null, null, null, NUM, NUM, NUM, NUM, NUM, NUM] }); r++; }
    r++; ws.getCell(r, 2).value = 'Đối chiếu Trial balance theo tài khoản (cuối kỳ)'; ws.getCell(r, 2).font = { bold: true }; r++;
    put(ws, r, ['', 'Tài khoản', 'Số đối tượng', '', 'Số dư TB (CĐPS)', 'Tổng ròng theo đối tượng', 'Chênh lệch', 'Dư đúng chiều (báo cáo)', 'Dư ngược chiều (mẫu khác)'], { bold: true, fill: SEC }); r++;
    for (const s of R.m05.secs) for (const t of s.tb) { put(ws, r, ['', t.acc + (t.mode === 'net' ? ' (ròng)' : ''), t.n, '', t.tb, t.net, t.diff, t.rep, t.mode === 'side' ? t.neg : null], { fmt: [null, null, '#,##0', null, NUM, NUM, NUM, NUM, NUM] }); r++; }
    r++; ws.getCell(r, 2).value = 'TK công nợ còn số dư nhưng không thuộc mẫu nào'; ws.getCell(r, 2).font = { bold: true }; r++;
    if (!(R.m05.rest || []).length) { ws.getCell(r, 2).value = 'Không còn TK nào bị sót'; r++; }
    for (const x of R.m05.rest || []) { put(ws, r, ['', x.acc + ' ' + x.name, '', '', x.v, x.note], { fmt: [null, null, null, null, NUM] }); r++; }
    ws.views = [{ state: 'frozen', ySplit: 10, xSplit: 2, showGridLines: false }];
    sign(ws, r + 2, [[2, 'Người lập biểu'], [8, 'Phụ trách phòng'], [16, 'Tổng Giám đốc']]); }

  /* 06 – quy trình, quy chế */
  { const ws = sheet(wb, '06', [6, 20, 16, 22, 60, 22, 13, 13, 13, 12, 12, 30]);
    title(ws, 5, 'PHỤ LỤC 8: DANH SÁCH CÁC QUY TRÌNH, QUY CHẾ, QUY ĐỊNH, HƯỚNG DẪN ĐANG ÁP DỤNG', null, 12);
    heads(ws, [[7, 1, 7, 1, 'STT'], [7, 2, 7, 2, 'Loại VB'], [7, 3, 7, 3, 'Scope'], [7, 4, 7, 4, 'Ký hiệu văn bản'], [7, 5, 7, 5, 'Tên văn bản'], [7, 6, 7, 6, 'Đơn vị ban hành'], [7, 7, 7, 7, 'Ngày ban hành'],
      [7, 8, 7, 8, 'Ngày có hiệu lực'], [7, 9, 7, 9, 'Ngày hết hiệu lực'], [7, 10, 7, 10, 'Hết hiệu lực'], [7, 11, 7, 11, 'Cần ban hành lại'], [7, 12, 7, 12, 'Ghi chú']]);
    let r = 8; const red = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE4E2' } };
    (R.m06 || []).forEach((x, i) => { put(ws, r, [i + 1, x.type, x.scope, x.code, x.name, x.issuer, dmy(x.issued), dmy(x.eff), dmy(x.exp), x.expired ? 'x' : '', x.reissue, x.note], { wrap: [4, 11], fill: x.expired ? red : undefined }); r++; });
    ws.views = [{ state: 'frozen', ySplit: 7, showGridLines: false }]; }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { build };
