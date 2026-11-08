'use strict';
// Xuất Excel báo cáo giám sát tài chính (7.1, PL02, 7.2, 7.3, 7.4, 7.7) – mỗi biểu một/vài sheet, định dạng gọn theo bố cục mẫu.
const ExcelJS = require('exceljs');
const thin = { style: 'thin', color: { argb: 'FF98A2B3' } }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
const F = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } }), HEAD = F('FDE7DC'), SEC = F('F2F4F7'), TOT = F('FFE4D1');
const NUM = '#,##0.00;[Red]-#,##0.00;"-"', QTY = '#,##0.##;[Red]-#,##0.##;"-"';
const dmy = d => d ? d.split('-').reverse().join('/') : '';
const ORG = 'TỔNG CÔNG TY CP ĐẦU TƯ QUỐC TẾ VIETTEL', CO = 'CÔNG TY VIETTEL TIMOR';

// groups: [[text, span]] (dòng tiêu đề nhóm, span 1 = gộp dọc 2 dòng), leaf: tiêu đề dòng 2 cho các cột nằm trong nhóm span > 1
function table(wb, name, o) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 7, xSplit: o.freezeX || 2, showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.getCell('A1').value = ORG; ws.getCell('A2').value = CO; ws.getCell('A1').font = ws.getCell('A2').font = { bold: true };
  const n = o.groups.reduce((s, g) => s + g[1], 0);
  ws.mergeCells(3, 1, 3, n); ws.getCell('A3').value = o.title; ws.getCell('A3').font = { bold: true, size: 14 }; ws.getCell('A3').alignment = { horizontal: 'center' };
  ws.mergeCells(4, 1, 4, n); ws.getCell('A4').value = o.sub || ''; ws.getCell('A4').font = { italic: true }; ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.getCell(5, n).value = o.unit || 'Đơn vị tính: USD'; ws.getCell(5, n).alignment = { horizontal: 'right' };
  let c = 1, li = 0;
  for (const [t, span] of o.groups) {
    if (span === 1 && !(o.leafAlways)) ws.mergeCells(6, c, 7, c); else ws.mergeCells(6, c, 6, c + span - 1);
    ws.getCell(6, c).value = t;
    if (span > 1 || o.leafAlways) for (let i = 0; i < span; i++) ws.getCell(7, c + i).value = o.leaf[li++] ?? '';
    c += span;
  }
  for (let r = 6; r <= 7; r++) for (let j = 1; j <= n; j++) { const x = ws.getCell(r, j); x.fill = HEAD; x.font = { bold: true }; x.border = BOX; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
  ws.getRow(6).height = 36; ws.getRow(7).height = 42;
  (o.widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = 8; const numFrom = o.numFrom ?? 2;
  for (const row of o.rows) {
    row.v.forEach((v, j) => { const x = ws.getCell(r, j + 1); x.value = v == null || (typeof v === 'number' && !isFinite(v)) ? null : v; x.border = BOX;
      if (j >= numFrom && typeof v === 'number') x.numFmt = (o.qtyCols || []).includes(j) ? QTY : NUM;
      if (row.bold) x.font = { bold: true }; if (row.fill) x.fill = row.fill; if ((o.wrap || []).includes(j)) x.alignment = { wrapText: true, vertical: 'top' }; });
    for (let j = row.v.length + 1; j <= n; j++) { ws.getCell(r, j).border = BOX; if (row.fill) ws.getCell(r, j).fill = row.fill; }
    r++;
  }
  if (o.note) { ws.getCell(r + 1, 2).value = o.note; ws.getCell(r + 1, 2).font = { italic: true, color: { argb: 'FF667085' } }; }
  ws.getCell(r + 3, 2).value = 'NGƯỜI LẬP'; ws.getCell(r + 3, Math.max(4, n - 2)).value = 'TRƯỞNG PHÒNG TÀI CHÍNH KẾ TOÁN'; ws.getCell(r + 3, 2).font = ws.getCell(r + 3, Math.max(4, n - 2)).font = { bold: true };
  return ws;
}
const sumRows = (L, f) => L.reduce((s, x) => s + (f(x) || 0), 0);
const AGE = ['Chưa đến hạn', '< 6 tháng', '6 tháng – < 1 năm', '1 năm – < 2 năm', '2 năm – < 3 năm', '≥ 3 năm'];

function debtSheets(wb, D, kind, pre, title, period) {
  const sub = `Kỳ báo cáo ${period} · số dư theo nguyên tắc B01 (TK lưỡng tính theo đối tượng, TK khác số dư ròng) · tuổi nợ FIFO theo hạn thanh toán`;
  // Tổng hợp theo nhóm
  const rows = D.summ.map((s, i) => ({ v: [i + 1, s.g, s.ob, s.cb, 0, s.notDue, s.cb - s.notDue, ...s.ag.slice(1), s.badOb, s.bad] }));
  const T = k => sumRows(D.summ, k);
  rows.push({ v: ['', 'Tổng cộng', T(s => s.ob), T(s => s.cb), 0, T(s => s.notDue), T(s => s.cb - s.notDue), ...[1, 2, 3, 4, 5].map(i => T(s => s.ag[i])), T(s => s.badOb), T(s => s.bad)], bold: true, fill: TOT });
  table(wb, `${pre} Tong hop`, { title: `BÁO CÁO PHÂN TÍCH CÔNG NỢ ${kind === 'ap' ? 'PHẢI TRẢ' : 'PHẢI THU'} THEO NHÓM ${title}`, sub, widths: [6, 46, 16, 16, 12, 16, 16, 14, 14, 14, 14, 14, 15, 15],
    groups: [['TT', 1], [kind === 'ap' ? 'Nội dung công nợ' : 'Phân loại nhóm công nợ', 1], [`Số dư đầu kỳ ${dmy(D.d0)}`, 1], [`Số dư cuối kỳ ${dmy(D.d1)}`, 1], ['Dài hạn', 1], ['Ngắn hạn – chưa đến hạn', 1], ['Quá hạn', 6], [kind === 'ap' ? 'Nợ quá hạn ≥ 6 tháng' : 'Nợ khó đòi (quá hạn ≥ 6 tháng)', 2]],
    leaf: ['Tổng', ...AGE.slice(1), 'Đầu kỳ', 'Cuối kỳ'], rows });
  return rows;
}
function detailSheet(wb, name, title, D, L, period, kind) {
  const secName = { I: '', II: '', III: '', IV: '', V: '' }; void secName;
  const out = []; let i = 0; const bySec = new Map(); for (const r of L) { const k = r.sec; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(r); }
  for (const [sec, rs] of bySec) {
    const S = f => sumRows(rs, f);
    out.push({ v: [sec, '', `Mục ${sec}`, '', '', S(x => x.ob), S(x => x.inc + Math.max(0, x.adj || 0)), S(x => x.dec - Math.min(0, x.adj || 0)), S(x => x.cb), S(x => x.cb - x.ag.slice(1).reduce((a, b) => a + b, 0)), ...[1, 2, 3, 4, 5].map(k => S(x => x.ag[k])), S(x => x.bad)], bold: true, fill: SEC });
    for (const x of rs) out.push({ v: [++i, (String(x.bp).match(/^(VTL_[A-Z]+_?\d+|[^_]+)/) || [])[1] || '', x.bp, x.accs || x.acc, x.grp, x.ob, x.inc + Math.max(0, x.adj || 0), x.dec - Math.min(0, x.adj || 0), x.cb, x.cb - x.ag.slice(1).reduce((a, b) => a + b, 0), ...x.ag.slice(1), x.bad] });
  }
  out.push({ v: ['', '', 'Tổng cộng', '', '', ...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(j => sumRows(out.filter(r => r.fill === SEC), r => r.v[j]))], bold: true, fill: TOT });
  table(wb, name, { title, sub: `Kỳ báo cáo ${period}`, freezeX: 3, widths: [6, 18, 40, 10, 30, 15, 15, 15, 15, 15, 13, 13, 13, 13, 13, 15], numFrom: 5, wrap: [2],
    groups: [['TT', 1], ['Mã đối tượng', 1], ['Đối tượng công nợ', 1], ['Tài khoản', 1], [kind === 'ap' ? 'Nội dung công nợ' : 'Phân loại nhóm công nợ', 1], ['Số dư công nợ', 4], ['Chưa đến hạn', 1], ['Quá hạn', 5], [kind === 'ap' ? 'Quá hạn ≥ 6 tháng' : 'Khó đòi (≥ 6 tháng)', 1]],
    leaf: ['Đầu kỳ', 'Tăng trong kỳ', 'Giảm trong kỳ', 'Cuối kỳ', ...AGE.slice(1)], rows: out });
}

async function build(R, o = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'AccSoft'; const period = `${dmy(R.ar.d0)} – ${dmy(R.ar.d1)}`;
  // 7.1
  debtSheets(wb, R.ar, 'ar', '7.1', '', period);
  detailSheet(wb, '7.1 PL01.1 chi tiet', 'BÁO CÁO CHI TIẾT CÔNG NỢ PHẢI THU THEO ĐỐI TƯỢNG', R.ar, R.ar.rows, period, 'ar');
  detailSheet(wb, '7.1 PL01.2 kho doi', 'BÁO CÁO TỒN ĐỌNG PHẢI THU KHÓ ĐÒI (quá hạn ≥ 6 tháng)', R.ar, R.ar.rows.filter(x => x.bad > 0.005), period, 'ar');
  // PL02 – phân tích 131 / 138 / 141
  debtSheets(wb, R.ar, 'ar', 'PL02', '(1311, 1411, 1388)', period);
  detailSheet(wb, 'PL02 131_D', 'BÁO CÁO PHÂN TÍCH CHI TIẾT CÔNG NỢ PHẢI THU – TK 131', R.ar, R.ar.rows.filter(x => String(x.acc).startsWith('131')), period, 'ar');
  detailSheet(wb, 'PL02 138_D', 'BÁO CÁO PHÂN TÍCH CHI TIẾT CÔNG NỢ PHẢI THU – TK 138, 244, 136, 338', R.ar, R.ar.rows.filter(x => /^(138|244|136|336|338)/.test(x.acc)), period, 'ar');
  detailSheet(wb, 'PL02 141_D', 'BÁO CÁO PHÂN TÍCH CHI TIẾT CÔNG NỢ TẠM ỨNG – TK 141', R.ar, R.ar.rows.filter(x => String(x.acc).startsWith('141')), period, 'ar');
  // 7.2
  debtSheets(wb, R.ap, 'ap', '7.2', '', period);
  detailSheet(wb, '7.2 PL03 chi tiet', 'BÁO CÁO CHI TIẾT CÔNG NỢ PHẢI TRẢ THEO ĐỐI TƯỢNG', R.ap, R.ap.rows, period, 'ap');
  // 7.3
  { const I = R.inv, rows = [], AG = ['≤ 6 tháng', '6 tháng – < 1 năm', '1 năm – < 2 năm', '2 năm – < 3 năm', '> 3 năm'];
    for (const g of I.summ) { const S = f => sumRows(g.cats, f);
      rows.push({ v: [g.no, g.t, S(c => c.obV), S(c => c.inV), S(c => c.outV), S(c => c.cbV), ...[0, 1, 2, 3, 4].map(i => S(c => c.ag[i])), S(c => c.cbV), 0, 0], bold: true, fill: SEC });
      g.cats.forEach((c, i) => rows.push({ v: [`${g.no}.${i + 1}`, c.c, c.obV, c.inV, c.outV, c.cbV, ...c.ag, c.cbV, 0, 0] })); }
    rows.push({ v: ['', 'TỔNG CỘNG', ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(j => sumRows(rows.filter(r => r.fill === SEC), r => r.v[j]))], bold: true, fill: TOT });
    table(wb, '7.3 Tong hop', { title: 'BÁO CÁO TỔNG HỢP NHẬP XUẤT TỒN HÀNG HÓA, VẬT TƯ', sub: `Kỳ báo cáo ${dmy(R.from + '-01')} – ${dmy(R.ar.d1)} · tuổi tồn theo ngày nhập (FIFO)`, widths: [7, 40, 15, 15, 15, 15, 14, 14, 14, 14, 14, 15, 14, 14],
      groups: [['STT', 1], ['NỘI DUNG', 1], ['TỒN ĐẦU KỲ', 1], ['NHẬP TRONG KỲ', 1], ['XUẤT TRONG KỲ', 1], ['TỒN CUỐI KỲ', 1], ['PHÂN LOẠI THEO THỜI GIAN TỒN KHO', 5], ['PHÂN LOẠI THEO CHẤT LƯỢNG', 3]],
      leaf: [...AG, 'Hàng tốt', 'Chậm luân chuyển', 'Kém phẩm chất'], rows, note: 'Chất lượng: mặc định toàn bộ là hàng tốt – đơn vị điều chỉnh khi có kết quả kiểm kê.' });
    const det = I.rows.map((x, i) => ({ v: [i + 1, x.code, x.name, x.cat, x.acc, x.uom, x.obQ, x.obV, x.inQ, x.inV, x.outQ, x.outV, x.cbQ, x.cbV, ...x.ag] }));
    table(wb, '7.3 PL03.1 chi tiet', { title: 'BÁO CÁO CHI TIẾT NHẬP XUẤT TỒN HÀNG HÓA, VẬT TƯ', sub: `Kỳ báo cáo ${dmy(R.from + '-01')} – ${dmy(R.ar.d1)}`, freezeX: 3, numFrom: 6, qtyCols: [6, 8, 10, 12],
      widths: [6, 12, 46, 24, 9, 8, 11, 14, 11, 14, 11, 14, 11, 14, 13, 13, 13, 13, 13], wrap: [2],
      groups: [['STT', 1], ['MÃ HÀNG', 1], ['TÊN HÀNG TỒN KHO', 1], ['PHÂN LOẠI', 1], ['TK', 1], ['ĐVT', 1], ['TỒN ĐẦU KỲ', 2], ['NHẬP TRONG KỲ', 2], ['XUẤT TRONG KỲ', 2], ['TỒN CUỐI KỲ', 2], ['THỜI GIAN TỒN KHO (giá trị)', 5]],
      leaf: ['Số lượng', 'Thành tiền', 'Số lượng', 'Thành tiền', 'Số lượng', 'Thành tiền', 'Số lượng', 'Thành tiền', ...AG], rows: det }); }
  // 7.4
  { const V = R.invest, C = V.cols, rows = [];
    V.assets.forEach(([k, n], i) => rows.push({ v: [i + 1, n, ...C.flatMap(c => [c.ob[k], c.cb[k]])] }));
    V.adjs.forEach(([k, n]) => rows.push({ v: ['-', n, ...C.flatMap(c => [null, c.adj[k]])] }));
    rows.push({ v: ['', 'Tổng giá trị đầu tư phát sinh trong kỳ', ...C.flatMap(c => [null, c.inc])], bold: true, fill: SEC });
    rows.push({ v: ['', 'Tổng giá trị đầu tư luỹ kế đến cuối kỳ', ...C.flatMap(c => [null, c.cum])], bold: true, fill: SEC });
    rows.push({ v: ['', 'Tỷ giá bình quân (bản tệ/USD)', ...C.flatMap(c => [null, c.rate])] });
    rows.push({ v: ['', 'Giá trị đầu tư phát sinh (USD)', ...C.flatMap(c => [null, c.inc / (c.rate || 1)])], bold: true });
    rows.push({ v: ['', 'Giá trị đầu tư luỹ kế (USD)', ...C.flatMap(c => [null, c.cum / (c.rate || 1)])], bold: true, fill: TOT });
    table(wb, '7.4 Dau tu luy ke', { title: 'TÌNH HÌNH ĐẦU TƯ LÊN TÀI SẢN, KHẤU HAO', sub: `Số dư TK 211, 213, 241, 152, 151 theo tháng · điều chỉnh nhập tay trong AccSoft`, widths: [6, 52, ...C.flatMap(() => [16, 16])],
      groups: [['Stt', 1], ['Tài khoản / chỉ tiêu', 1], ...C.map(c => [c.ym.split('-').reverse().join('/'), 2])], leaf: C.flatMap(c => [`Số dư ${dmy(c.ym + '-01')}`, 'Số dư cuối tháng']), rows }); }
  // 7.7
  { const X = R.tax, rows = [], ms = X.secs[0]?.rows[0]?.mm.map(m => m.ym) || [];
    for (const s of X.secs) { rows.push({ v: [s.no, s.t], bold: true, fill: SEC }); s.rows.forEach((x, i) => rows.push({ v: [i + 1, x.n, x.prior.due, x.prior.paid, x.prior.bal, x.year.due, x.year.paid, x.year.bal, ...x.mm.flatMap(m => [m.due, m.paid, m.bal])] })); }
    table(wb, '7.7 Thue phi', { title: 'BÁO CÁO CÁC KHOẢN THU NỘP NGÂN SÁCH', sub: `Năm ${X.year} · phải nộp = phát sinh Có, đã nộp = phát sinh Nợ của TK thuế/phí theo bảng quy tắc`, widths: [6, 48, ...Array(6 + ms.length * 3).fill(13)],
      groups: [['TT', 1], ['Tên loại thuế, phí', 1], [`Luỹ kế đến hết năm ${X.year - 1}`, 3], [`Năm ${X.year}`, 3], ...ms.map(m => [`T${+m.slice(5)}/${m.slice(0, 4)}`, 3])],
      leaf: Array(2 + ms.length).fill(['Số phải nộp', 'Số đã nộp', 'Số còn phải nộp']).flat(), rows }); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { build };
