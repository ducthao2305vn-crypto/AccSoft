'use strict';
// Xuất "Kế hoạch năm" ra Excel đúng bố cục mẫu Tập đoàn: PL01 (TH năm trước · KH năm · TH năm · KH năm sau · so sánh) và PL06 (giao dịch nội bộ TH + KH 4 quý).
const ExcelJS = require('exceljs');
const thin = { style: 'thin', color: { argb: 'FF98A2B3' } }, BOX = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7DC' } }, SEC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } }, KHF = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFAEB' } };
const NUM = '#,##0;[Red]-#,##0;"-"', PCT = '0.0%;[Red]-0.0%;"-"';
const col = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const hd = (ws, r, c, r2, c2, t, fill = HEAD) => { if (r2 !== r || c2 !== c) ws.mergeCells(r, c, r2, c2); const x = ws.getCell(r, c); x.value = t; x.font = { bold: true }; x.fill = fill; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let i = r; i <= r2; i++) for (let j = c; j <= c2; j++) { const y = ws.getCell(i, j); y.border = BOX; y.fill = fill; } };
const MN = Array.from({ length: 12 }, (_, i) => 'Tháng ' + (i + 1)), QN = ['Quý I', 'Quý II', 'Quý III', 'Quý IV'];

async function build(P1, P6, o = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'AccSoft'; const unit = o.company || 'VIETTEL TIMOR LESTE UNIPESSOAL';
  if (P1) { const Y = P1.Y, ws = wb.addWorksheet('PL01-TC-KH' + Y, { views: [{ state: 'frozen', xSplit: 2, ySplit: 9, showGridLines: false }] });
    ws.getCell('A1').value = 'TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI'; ws.getCell('A2').value = 'ĐƠN VỊ'; ws.getCell('B2').value = unit; ws.getCell('A1').font = ws.getCell('A2').font = { bold: true };
    ws.mergeCells(4, 1, 4, 20); ws.getCell('A4').value = `TỔNG HỢP CÁC CHỈ TIÊU TÀI CHÍNH THỰC HIỆN NĂM ${Y}, KẾ HOẠCH NĂM ${Y + 1}`; ws.getCell('A4').font = { bold: true, size: 14 }; ws.getCell('A4').alignment = { horizontal: 'center' };
    ws.mergeCells(5, 1, 5, 20); ws.getCell('A5').value = `Số thực hiện năm ${Y}: ${P1.from} → ${P1.to}`; ws.getCell('A5').alignment = { horizontal: 'center' }; ws.getCell('A5').font = { italic: true };
    ws.getCell('BI6').value = 'Đơn vị tính: USD';
    ws.getColumn(1).width = 8; ws.getColumn(2).width = 48; for (let c = 3; c <= 60; c++) ws.getColumn(c).width = 14; ws.getColumn(61).width = 30;
    hd(ws, 7, 1, 8, 1, 'Mã chỉ tiêu'); hd(ws, 7, 2, 8, 2, 'NỘI DUNG'); hd(ws, 7, 3, 8, 3, `TH Năm ${Y - 1}`);
    const blk = (c0, t, fill) => { hd(ws, 7, c0, 7, c0 + 16, t, fill); MN.forEach((m, i) => hd(ws, 8, c0 + i, 8, c0 + i, m, fill)); QN.forEach((q, i) => hd(ws, 8, c0 + 12 + i, 8, c0 + 12 + i, q, fill)); hd(ws, 8, c0 + 16, 8, c0 + 16, t.replace(/^(KH|TH) /, 'Năm '), fill); };
    blk(4, `KH ${Y}`, KHF); blk(21, `TH ${Y}`); blk(38, `KH ${Y + 1}`, KHF);
    hd(ws, 7, 55, 7, 56, `So sánh TH ${Y} - TH ${Y - 1}`); hd(ws, 7, 57, 7, 58, `So sánh TH ${Y} - KH ${Y}`); hd(ws, 7, 59, 7, 60, `So sánh KH ${Y + 1} - TH ${Y}`); hd(ws, 7, 61, 8, 61, 'GHI CHÚ');
    for (const c of [55, 57, 59]) { hd(ws, 8, c, 8, c, 'Delta'); hd(ws, 8, c + 1, 8, c + 1, '%'); }
    for (let c = 1; c <= 61; c++) { const x = ws.getCell(9, c); x.value = c <= 2 ? ['A', 'B'][c - 1] : c - 2; x.fill = SEC; x.border = BOX; x.alignment = { horizontal: 'center' }; x.font = { italic: true, size: 9 }; }
    let r = 10;
    for (const row of P1.rows) {
      const isR = row.t === 'r', fmt = isR ? PCT : NUM, bold = row.lvl === 1, put = (c, v) => { const x = ws.getCell(r, c); x.value = v == null || (typeof v === 'number' && !isFinite(v)) ? null : v; x.numFmt = fmt; x.border = BOX; if (bold) x.font = { bold: true }; };
      ws.getCell(r, 1).value = row.code; ws.getCell(r, 2).value = row.n; for (const c of [1, 2]) { ws.getCell(r, c).border = BOX; if (bold) ws.getCell(r, c).font = { bold: true }; }
      if (row.lvl === 2) ws.getCell(r, 2).alignment = { indent: 1 }; else if (!row.lvl) ws.getCell(r, 2).alignment = { indent: 2 };
      const g = (x, k) => x ? x[k] : null;
      put(3, g(P1.prev, row.k));
      for (const [c0, B] of [[4, P1.kh], [21, P1.th], [38, P1.kh1]]) { B.m.forEach((x, i) => put(c0 + i, g(x, row.k))); B.q.forEach((x, i) => put(c0 + 12 + i, g(x, row.k))); put(c0 + 16, g(B.y, row.k)); if (B !== P1.th) for (let c = c0; c <= c0 + 16; c++) ws.getCell(r, c).fill = KHF; }
      if (!isR && row.t !== 'x') { // so sánh: công thức
        const T = `AK${r}`, C = `C${r}`, K = `T${r}`, K1 = `BB${r}`;
        ws.getCell(r, 55).value = { formula: `IFERROR(${T}-${C},"-")` }; ws.getCell(r, 56).value = { formula: `IFERROR(${col(55)}${r}/${C},"-")` };
        ws.getCell(r, 57).value = { formula: `IFERROR(${T}-${K},"-")` }; ws.getCell(r, 58).value = { formula: `IFERROR(${col(57)}${r}/${K},"-")` };
        ws.getCell(r, 59).value = { formula: `IFERROR(${K1}-${T},"-")` }; ws.getCell(r, 60).value = { formula: `IFERROR(${col(59)}${r}/${T},"-")` };
        for (const c of [55, 57, 59]) ws.getCell(r, c).numFmt = NUM; for (const c of [56, 58, 60]) ws.getCell(r, c).numFmt = PCT;
      }
      for (let c = 55; c <= 61; c++) ws.getCell(r, c).border = BOX; ws.getCell(r, 61).value = (P1.note || {})[row.k] || null;
      r++;
    }
    ws.getCell(r + 1, 2).value = 'Ghi chú: TH lấy từ sổ hạch toán (doanh thu / chi phí theo cặp TK, số dư theo B01-DN); KH nhập tay trong AccSoft.'; ws.getCell(r + 1, 2).font = { italic: true, color: { argb: 'FF667085' } };
  }
  if (P6) P6.v = (k, key, c) => key ? P6.plan?.[key]?.[k]?.[c] : P6.th?.[k]?.[c];
  if (P6) { const Y = P6.Y, ws = wb.addWorksheet('PL06.PL.NB', { views: [{ state: 'frozen', xSplit: 4, ySplit: 8, showGridLines: false }] });
    ws.getCell('A1').value = 'TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI'; ws.getCell('A2').value = unit; ws.getCell('A1').font = ws.getCell('A2').font = { bold: true };
    ws.mergeCells(3, 1, 3, 20); ws.getCell('A3').value = `DỰ KIẾN GIAO DỊCH NỘI BỘ TẬP ĐOÀN TH ${Y} (${P6.from} → ${P6.to}) VÀ KH ${Y + 1}`; ws.getCell('A3').font = { bold: true, size: 14 }; ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getCell('A4').value = 'Ghi chú: Số liệu không bao gồm thuế VAT'; ws.getCell('A4').font = { italic: true };
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 12; ws.getColumn(3).width = 10; ws.getColumn(4).width = 46; for (let c = 5; c <= 70; c++) ws.getColumn(c).width = 13;
    hd(ws, 5, 1, 7, 1, 'Stt'); hd(ws, 5, 2, 7, 2, 'Mã đối tác phát sinh giao dịch'); hd(ws, 5, 3, 7, 3, 'Tên gọi khác'); hd(ws, 5, 4, 7, 4, 'Tên đối tác phát sinh giao dịch nội bộ');
    const SUB = ['Mua hàng tồn kho để bán', 'Mua hàng tồn kho để xây lắp thành TSCĐ', 'Mua TSCĐ, CCDC (CP phân bổ), dịch vụ như thuê hạ tầng (CP trả trước)', 'Mua dùng cho đề tài dự án KHCN (dùng quỹ KHCN)', 'Mua dịch vụ trong kỳ (đưa hết vào CP trong kỳ)', 'Tổng mua trong kỳ (không gồm VAT)', 'Doanh thu ghi nhận trong kỳ', 'DT chưa thực hiện (3387)', 'Tổng bán hàng trong kỳ', 'Chia cổ tức', 'Nhận cổ tức'];
    const NO = ['4', '5', '6', '7', '8', '9=4+5+6+7+8', '10', '11', '12=10+11', '13', '14'];
    const BL = [['TH ' + Y, null], ...[1, 2, 3, 4].map(q => [`KH ${Y + 1} - Q${q}`, 'Q' + q]), [`KH ${Y + 1}`, 'Y']];
    BL.forEach(([t, k], b) => { const c0 = 5 + b * 11, f = k ? KHF : HEAD; hd(ws, 5, c0, 5, c0 + 10, t, f); hd(ws, 6, c0, 6, c0 + 5, 'Mua hàng hóa/dịch vụ (không gồm VAT)', f); hd(ws, 6, c0 + 6, 6, c0 + 8, 'Bán hàng hóa/dịch vụ (ko gồm VAT)', f); hd(ws, 6, c0 + 9, 6, c0 + 10, 'Phân phối LN', f);
      SUB.forEach((s, i) => hd(ws, 7, c0 + i, 7, c0 + i, s, f)); NO.forEach((s, i) => { const x = ws.getCell(8, c0 + i); x.value = s; x.border = BOX; x.fill = SEC; x.alignment = { horizontal: 'center' }; }); });
    for (const [c, s] of [[1, '1'], [2, '2'], [4, '3']]) { const x = ws.getCell(8, c); x.value = s; x.border = BOX; x.fill = SEC; } ws.getCell(8, 3).border = BOX;
    // vị trí số lá trong một khối 11 cột: E F G H I (J) K L (M) N O
    const POS = { E: 0, F: 1, G: 2, H: 3, I: 4, K: 6, L: 7, N: 9, O: 10 };
    const rows = P6.rows, kids = i => { const out = []; for (let j = i + 1; j < rows.length && rows[j].lvl > rows[i].lvl; j++) if (rows[j].lvl === rows[i].lvl + 1) out.push(j); return out; };
    let r = 9; const rowAt = new Map(); rows.forEach((x, i) => rowAt.set(i, 9 + i));
    const blocks0 = [];
    rows.forEach((x, i) => {
      const R = rowAt.get(i), ch = kids(i), stt = x.lvl === 0 ? x.k : '';
      ws.getCell(R, 1).value = x.lvl === 0 ? x.k : null; ws.getCell(R, 2).value = x.lvl === 0 ? null : x.k.replace(/^X:/, ''); ws.getCell(R, 3).value = x.alias || null; ws.getCell(R, 4).value = x.name; void stt;
      if (x.lvl === 0) blocks0.push(R);
      for (let b = 0; b < BL.length; b++) { const c0 = 5 + b * 11, key = BL[b][1];
        for (const [k, p] of Object.entries(POS)) { const c = c0 + p, cell = ws.getCell(R, c);
          if (ch.length) cell.value = { formula: (x.lvl === 0 ? 'SUM(' : `${x.lvl === 1 ? (P6.v(x.k, key, k) || 0) : 0}+SUM(`) + ch.map(j => col(c) + rowAt.get(j)).join(',') + ')' };
          else if (key === 'Y') cell.value = { formula: [1, 2, 3, 4].map(q => col(5 + q * 11 + p) + R).join('+') };
          else cell.value = P6.v(x.k, key, k) || null; cell.numFmt = NUM; }
        ws.getCell(R, c0 + 5).value = { formula: `SUM(${col(c0)}${R}:${col(c0 + 4)}${R})` }; ws.getCell(R, c0 + 8).value = { formula: `${col(c0 + 6)}${R}+${col(c0 + 7)}${R}` };
        ws.getCell(R, c0 + 5).numFmt = ws.getCell(R, c0 + 8).numFmt = NUM;
        for (let c = c0; c <= c0 + 10; c++) { const y = ws.getCell(R, c); y.border = BOX; if (key) y.fill = KHF; if (x.lvl === 0) { y.fill = SEC; y.font = { bold: true }; } } }
      for (let c = 1; c <= 4; c++) { const y = ws.getCell(R, c); y.border = BOX; if (x.lvl === 0) { y.fill = SEC; y.font = { bold: true }; } } if (x.lvl === 2) ws.getCell(R, 4).alignment = { indent: 1 };
      r = R + 1;
    });
    ws.getCell(r, 1).value = 'TỔNG CỘNG'; ws.mergeCells(r, 1, r, 4);
    for (let c = 5; c < 5 + BL.length * 11; c++) { const y = ws.getCell(r, c); y.value = { formula: blocks0.map(b => col(c) + b).join('+') }; y.numFmt = NUM; y.font = { bold: true }; y.fill = HEAD; y.border = BOX; }
    ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 1).fill = HEAD;
    ws.getCell(r + 2, 4).value = 'TH: giao dịch với đơn vị nội bộ Tập đoàn trong danh mục đối tượng (loại NB); phân loại theo TK: 156/151/157 → hàng để bán, 152/241 → xây lắp, 211/213/153/242 → TSCĐ-CCDC-trả trước, 356 → KHCN, 6/8 → dịch vụ; Có 511/512 → doanh thu, Có 3387 → DT chưa thực hiện, Nợ 421 → chia cổ tức, Có 515 → nhận cổ tức.';
    ws.getCell(r + 2, 4).font = { italic: true, color: { argb: 'FF667085' } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { build };
