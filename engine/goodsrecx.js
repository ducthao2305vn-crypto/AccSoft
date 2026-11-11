'use strict';
// Biểu mẫu đối chiếu hàng hoá 15611 / vật tư 14121 theo đúng nhận diện biểu mẫu Telemor:
// Times New Roman, chữ đen, kẻ khung mảnh, tiêu đề in đậm căn giữa, logo Telemor góc trên (Excel: chèn qua engine/brand; PDF: đầu trang).
const ExcelJS = require('exceljs');
const r2 = v => Math.round((+v || 0) * 100) / 100, r0 = v => Math.round((+v || 0) * 10000) / 10000;
const dmy = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pname = (bp, info) => (info && info.name) || String(bp || '').replace(/^[A-Za-z]+_[A-Za-z]*_?\d+_?/, '') || bp;
const FONT = 'Times New Roman', THIN = { style: 'thin', color: { argb: 'FF000000' } }, BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const NQ = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@_-', NA = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';
const ACCNAME = { '14121': 'Advances in rescuring information materials', '15611': 'Trading goods' };

// ---------- 15611: CONFIRMATION OF GOODS SHEET ----------
async function xlsx15611(row, rep, sg, co = {}) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Print', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  const W = [4, 34, 7, 11, 11, 8, 11, 11, 8, 11, 11, 8, 11, 11, 8, 14]; ws.columns = W.map(w => ({ width: w }));
  const P = pname(row.bp, row.info), F = (c, o = {}) => { c.font = { name: FONT, size: o.sz || 11, bold: !!o.b, italic: !!o.i }; if (o.al) c.alignment = { horizontal: o.al, vertical: 'middle', wrapText: !!o.wrap }; if (o.box) c.border = BOX; if (o.nf) c.numFmt = o.nf; };
  const put = (addr, v, o) => { const c = ws.getCell(addr); c.value = v; F(c, o); return c; };
  ws.mergeCells('A2:P2'); put('A2', 'CONFIRMATION OF GOODS SHEET', { b: 1, sz: 16, al: 'center' }); ws.getRow(2).height = 24;
  ws.mergeCells('A3:P3'); put('A3', `From: ${dmy(rep.from)}  To: ${dmy(rep.to)}`, { b: 1, i: 1, al: 'center' });
  put('A4', '1. VIETTEL TIMOR UNIPESSOAL LDA', { b: 1, al: 'left' });
  [[sg.vgd, sg.vgdPos], [sg.cfo, sg.cfoPos], [sg.staff, sg.staffPos]].forEach(([n, p], i) => { const r = 5 + i; ws.mergeCells(`B${r}:C${r}`); ws.mergeCells(`D${r}:J${r}`); put(`B${r}`, `${i + 1}. ${n || '……………………………'}`, { al: 'left' }); put(`D${r}`, `Position: ${p || '……………………'}`, { al: 'left' }); });
  put('A8', `2. ${P.toUpperCase()}`, { b: 1, al: 'left' });
  ws.mergeCells('B9:C9'); ws.mergeCells('D9:J9'); put('B9', `1. ${co.contact || '……………………………'}`, { al: 'left' }); put('D9', `Position: ${co.position || '……………………'}`, { al: 'left' });
  put('A10', `All of parties unify to compare goods from ${dmy(rep.from)} to ${dmy(rep.to)} as following:`, { al: 'left' });
  const H = [['A11:A12', 'No'], ['B11:B12', "GOODS'S NAME"], ['C11:C12', 'Unit'], ['D11:F11', 'OPENING BALANCE'], ['G11:I11', 'RECEIVED GOODS'], ['J11:L11', 'CLEAR'], ['M11:O11', 'CLOSING BALANCE'], ['P11:P12', 'Note']];
  for (const [rg, t] of H) { ws.mergeCells(rg); put(rg.split(':')[0], t, { b: 1, al: 'center', box: 1, wrap: 1 }); }
  'DEFGHIJKLMNO'.split('').forEach((L, i) => put(L + '12', ['BRANCH', 'VTL', 'DIF'][i % 3], { b: 1, sz: 10, al: 'center', box: 1 }));
  for (let c = 1; c <= 16; c++) { const cell = ws.getRow(13).getCell(c); cell.value = c; F(cell, { b: 1, sz: 9, al: 'center', box: 1 }); }
  for (let r = 11; r <= 12; r++) for (let c = 1; c <= 16; c++) ws.getRow(r).getCell(c).border = BOX;
  ws.getRow(11).height = 20;
  // BRANCH = số đối tác (mặc định điền bằng số VTL để đối tác sửa), DIF = BRANCH − VTL (công thức)
  let r = 14; const first = r;
  row.items.forEach((it, i) => { const R = ws.getRow(r);
    const v = [i + 1, it.code && it.code !== it.name ? `${it.name} (${it.code})` : it.name, it.unit];
    R.height = Math.max(16, 14 * Math.ceil(String(v[1] || '').length / 36));
    const grp = [r0(it.oq), r0(it.iq), r0(it.xq), r0(it.cq)];
    v.forEach((x, k) => { const c = R.getCell(k + 1); c.value = x; F(c, { al: k === 1 ? 'left' : 'center', box: 1, wrap: k === 1 }); });
    grp.forEach((q, g) => { const b = 4 + g * 3, L = n => ws.getColumn(n).letter;
      R.getCell(b).value = q; R.getCell(b + 1).value = q; R.getCell(b + 2).value = { formula: `${L(b)}${r}-${L(b + 1)}${r}`, result: 0 };
      for (let k = 0; k < 3; k++) F(R.getCell(b + k), { al: 'right', box: 1, nf: NQ }); });
    F(R.getCell(16), { box: 1, al: 'left', wrap: 1 }); r++; });
  const T = ws.getRow(r); ws.mergeCells(`A${r}:C${r}`); T.getCell(1).value = 'TOTAL'; F(T.getCell(1), { b: 1, al: 'center', box: 1 });
  for (let c = 4; c <= 15; c++) { const L = ws.getColumn(c).letter; T.getCell(c).value = { formula: `SUBTOTAL(9,${L}${first}:${L}${r - 1})` }; F(T.getCell(c), { b: 1, al: 'right', box: 1, nf: NQ }); }
  for (const c of [2, 3, 16]) T.getCell(c).border = BOX;
  r += 2; ws.mergeCells(`M${r}:P${r}`); put(`M${r}`, `Date ${dmy(rep.to)}`, { i: 1, al: 'right' });
  r++; ws.mergeCells(`A${r}:E${r}`); ws.mergeCells(`G${r}:P${r}`); put(`A${r}`, P.toUpperCase(), { b: 1, al: 'center' }); put(`G${r}`, 'VIETTEL TIMOR UNIPESSOAL LDA', { b: 1, al: 'center' });
  r++; ws.mergeCells(`A${r}:E${r}`); ws.mergeCells(`G${r}:I${r}`); ws.mergeCells(`J${r}:L${r}`); ws.mergeCells(`M${r}:P${r}`);
  put(`A${r}`, 'REPRESENTATIVE', { b: 1, al: 'center' }); put(`G${r}`, 'FINANCE STAFF', { b: 1, al: 'center' }); put(`J${r}`, 'CHIEF OF ACCOUNTANT', { b: 1, al: 'center' }); put(`M${r}`, 'VICE GENERAL DIRECTOR', { b: 1, al: 'center' });
  r++; for (const [rg, t] of [[`A${r}:E${r}`, '(Sign, Fullname, Stamp)'], [`G${r}:I${r}`, '(Sign, Fullname)'], [`J${r}:L${r}`, '(Sign, Fullname)'], [`M${r}:P${r}`, '(Sign, Fullname, Stamp)']]) { ws.mergeCells(rg); put(rg.split(':')[0], t, { i: 1, al: 'center', sz: 10 }); }
  ws.views = [{ state: 'frozen', ySplit: 13 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function html15611(row, rep, sg, co = {}) {
  const P = pname(row.bp, row.info), e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const q = v => { v = r0(v); return Math.abs(v) < 1e-9 ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: 4 }); }, T = k => row.items.reduce((s, i) => s + (+i[k] || 0), 0);
  const grp = k => `<td class=n>${q(k)}</td><td class=n>${q(k)}</td><td class=n>-</td>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <h1>CONFIRMATION OF GOODS SHEET</h1><div class="sub"><b><i>From: ${dmy(rep.from)}&nbsp; To: ${dmy(rep.to)}</i></b></div>
  <p class=b>1. VIETTEL TIMOR UNIPESSOAL LDA</p><table class=np>${[[sg.vgd, sg.vgdPos], [sg.cfo, sg.cfoPos], [sg.staff, sg.staffPos]].map(([n, p], i) => `<tr><td style="width:36%">${i + 1}. ${e(n || '……………………………')}</td><td>Position: ${e(p || '……………………')}</td></tr>`).join('')}</table>
  <p class=b>2. ${e(P.toUpperCase())}</p><table class=np><tr><td style="width:36%">1. ${e(co.contact || '……………………………')}</td><td>Position: ${e(co.position || '……………………')}</td></tr></table>
  <p>All of parties unify to compare goods from ${dmy(rep.from)} to ${dmy(rep.to)} as following:</p>
  <table class=g><thead><tr><th rowspan=2>No</th><th rowspan=2>GOODS'S NAME</th><th rowspan=2>Unit</th><th colspan=3>OPENING BALANCE</th><th colspan=3>RECEIVED GOODS</th><th colspan=3>CLEAR</th><th colspan=3>CLOSING BALANCE</th><th rowspan=2>Note</th></tr>
  <tr>${'<th class=s>BRANCH</th><th class=s>VTL</th><th class=s>DIF</th>'.repeat(4)}</tr><tr class=idx>${Array.from({ length: 16 }, (_, i) => `<td>${i + 1}</td>`).join('')}</tr></thead><tbody>
  ${row.items.map((it, i) => `<tr><td class=c>${i + 1}</td><td>${e(it.code && it.code !== it.name ? `${it.name} (${it.code})` : it.name)}</td><td class=c>${e(it.unit)}</td>${grp(it.oq)}${grp(it.iq)}${grp(it.xq)}${grp(it.cq)}<td></td></tr>`).join('')}
  <tr class=t><td colspan=3 class=c>TOTAL</td>${['oq', 'iq', 'xq', 'cq'].map(k => grp(T(k))).join('')}<td></td></tr></tbody></table>
  <div class="dt"><i>Date ${dmy(rep.to)}</i></div>
  <table class="sig"><tr><td style="width:34%"><b>${e(P.toUpperCase())}</b></td><td colspan=3><b>VIETTEL TIMOR UNIPESSOAL LDA</b></td></tr>
  <tr><td><b>REPRESENTATIVE</b><br><i>(Sign, Fullname, Stamp)</i></td><td><b>FINANCE STAFF</b><br><i>(Sign, Fullname)</i></td><td><b>CHIEF OF ACCOUNTANT</b><br><i>(Sign, Fullname)</i></td><td><b>VICE GENERAL DIRECTOR</b><br><i>(Sign, Fullname, Stamp)</i></td></tr>
  <tr class=sp><td></td><td></td><td></td><td></td></tr></table></body></html>`;
}

// ---------- 14121: PRODUCT LIABILITY BY PARTNER REPORT ----------
async function xlsx14121(row, rep, sg) {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Report', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } } });
  ws.columns = [5, 10, 42, 8, 9, 12, 9, 12, 9, 12, 9, 12].map(w => ({ width: w }));
  const P = pname(row.bp, row.info), F = (c, o = {}) => { c.font = { name: FONT, size: o.sz || 10, bold: !!o.b, italic: !!o.i }; c.alignment = { horizontal: o.al || 'left', vertical: 'middle', wrapText: !!o.wrap }; if (o.box) c.border = BOX; if (o.nf) c.numFmt = o.nf; };
  const put = (a, v, o) => { const c = ws.getCell(a); c.value = v; F(c, o); return c; };
  put('A4', 'Viettel Timor Unipessoal Lda', { sz: 9 });
  ws.mergeCells('A5:L5'); put('A5', 'PRODUCT LIABILITY BY PARTNER REPORT', { b: 1, sz: 14, al: 'center' }); ws.getRow(5).height = 22;
  ws.mergeCells('A6:L6'); put('A6', `From: ${dmy(rep.from)}  To: ${dmy(rep.to)}`, { b: 1, al: 'center' });
  ws.mergeCells('A7:L7'); put('A7', `Account: ${rep.acc} - ${ACCNAME[rep.kind] || ''}`, { b: 1, al: 'center' });
  ws.mergeCells('A8:L8'); put('A8', 'Unit: USD', { b: 1, al: 'right' });
  for (const [rg, t] of [['A9:A10', 'No'], ['B9:B10', 'Code'], ['C9:C10', 'ProductName'], ['D9:D10', 'Unit'], ['E9:F9', 'Opening Balance'], ['G9:H9', 'Input'], ['I9:J9', 'Output'], ['K9:L9', 'Closing balance']]) { ws.mergeCells(rg); put(rg.split(':')[0], t, { b: 1, al: 'center', box: 1, wrap: 1 }); }
  'EFGHIJKL'.split('').forEach((L, i) => put(L + '10', i % 2 ? 'Amount' : 'Qty', { b: 1, al: 'center', box: 1 }));
  for (let r = 9; r <= 10; r++) for (let c = 1; c <= 12; c++) ws.getRow(r).getCell(c).border = BOX;
  const head = 11, first = 12, last = first + row.items.length - 1, tr = last + 1;
  ws.mergeCells(`A${head}:D${head}`); put(`A${head}`, P, { b: 1, box: 1 });
  'EFGHIJKL'.split('').forEach((L, i) => { const c = ws.getCell(L + head); c.value = { formula: `${L}${tr}` }; F(c, { b: 1, al: 'right', box: 1, nf: i % 2 ? NA : NQ }); });
  row.items.forEach((it, i) => { const R = ws.getRow(first + i), v = [i + 1, it.code, it.name, it.unit, r0(it.oq), r2(it.oa), r0(it.iq), r2(it.ia), r0(it.xq), r2(it.xa), r0(it.cq), r2(it.ca)];
    R.height = Math.max(15, 13 * Math.ceil(String(it.name || '').length / 44)); v.forEach((x, k) => { const c = R.getCell(k + 1); c.value = k >= 4 && Math.abs(x) < 1e-9 ? null : x; F(c, { al: k === 2 ? 'left' : k < 4 ? 'center' : 'right', box: 1, wrap: k === 2, nf: k >= 4 ? (k % 2 ? NA : NQ) : undefined }); }); });
  ws.mergeCells(`A${tr}:D${tr}`); put(`A${tr}`, 'Total', { b: 1, al: 'center', box: 1 });
  'EFGHIJKL'.split('').forEach((L, i) => { const c = ws.getCell(L + tr); c.value = { formula: `SUM(${L}${first}:${L}${Math.max(first, last)})` }; F(c, { b: 1, al: 'right', box: 1, nf: i % 2 ? NA : NQ }); });
  const d = new Date(rep.to); let r = tr + 1; ws.mergeCells(`I${r}:L${r}`); put(`I${r}`, `Day ${d.getDate()} month ${d.getMonth() + 1} year ${d.getFullYear()}`, { i: 1, al: 'center' });
  r++; for (const [rg, t] of [[`A${r}:C${r}`, 'Prepared by'], [`D${r}:F${r}`, 'Recipient Debt'], [`G${r}:I${r}`, 'Chief of Accountant'], [`J${r}:L${r}`, 'Vice General Director']]) { ws.mergeCells(rg); put(rg.split(':')[0], t, { b: 1, al: 'center' }); }
  r++; for (const [rg, t] of [[`A${r}:C${r}`, '(Sign, Fullname)'], [`D${r}:F${r}`, '(Sign, Fullname)'], [`G${r}:I${r}`, '(Sign, Fullname)'], [`J${r}:L${r}`, '(Sign, Fullname, Stamp)']]) { ws.mergeCells(rg); put(rg.split(':')[0], t, { i: 1, al: 'center', sz: 9 }); }
  ws.views = [{ state: 'frozen', ySplit: 10 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function html14121(row, rep, sg) {
  const P = pname(row.bp, row.info), e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const q = v => { v = r0(v); return Math.abs(v) < 1e-9 ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: 4 }); }, a = v => { v = r2(v); return Math.abs(v) < 0.005 ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const T = k => row.items.reduce((s, i) => s + (+i[k] || 0), 0), cells = o => ['oq', 'oa', 'iq', 'ia', 'xq', 'xa', 'cq', 'ca'].map((k, i) => `<td class=n>${i % 2 ? a(o(k)) : q(o(k))}</td>`).join(''), d = new Date(rep.to);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div style="font-size:9px">Viettel Timor Unipessoal Lda</div><h1>PRODUCT LIABILITY BY PARTNER REPORT</h1><div class="sub"><b>From: ${dmy(rep.from)}&nbsp; To: ${dmy(rep.to)}</b></div><div class="sub"><b>Account: ${e(rep.acc)} - ${e(ACCNAME[rep.kind] || '')}</b></div><div style="text-align:right"><b>Unit: USD</b></div>
  <table class=g><thead><tr><th rowspan=2>No</th><th rowspan=2>Code</th><th rowspan=2>ProductName</th><th rowspan=2>Unit</th><th colspan=2>Opening Balance</th><th colspan=2>Input</th><th colspan=2>Output</th><th colspan=2>Closing balance</th></tr>
  <tr>${'<th class=s>Qty</th><th class=s>Amount</th>'.repeat(4)}</tr></thead><tbody>
  <tr class=t><td colspan=4>${e(P)}</td>${cells(T)}</tr>
  ${row.items.map((it, i) => `<tr><td class=c>${i + 1}</td><td class=c>${e(it.code)}</td><td>${e(it.name)}</td><td class=c>${e(it.unit)}</td>${cells(k => it[k])}</tr>`).join('')}
  <tr class=t><td colspan=4 class=c>Total</td>${cells(T)}</tr></tbody></table>
  <div class="dt"><i>Day ${d.getDate()} month ${d.getMonth() + 1} year ${d.getFullYear()}</i></div>
  <table class="sig"><tr><td><b>Prepared by</b><br><i>(Sign, Fullname)</i></td><td><b>Recipient Debt</b><br><i>(Sign, Fullname)</i></td><td><b>Chief of Accountant</b><br><i>(Sign, Fullname)</i></td><td><b>Vice General Director</b><br><i>(Sign, Fullname, Stamp)</i></td></tr>
  <tr class=sp><td></td><td></td><td></td><td></td></tr></table></body></html>`;
}
const CSS = `body{font-family:'Times New Roman',Times,serif;font-size:11px;color:#000;margin:0}h1{font-size:17px;text-align:center;margin:4px 0 2px}.sub{text-align:center;margin:1px 0}p{margin:5px 0}.b{font-weight:700}
  table{border-collapse:collapse;width:100%}table.np td{padding:1px 4px 1px 18px}table.g{margin-top:6px}table.g th,table.g td{border:1px solid #000;padding:3px 4px;vertical-align:middle}table.g th{font-weight:700;text-align:center}table.g th.s{font-size:10px}
  tr.idx td{text-align:center;font-weight:700;font-size:9px}.n{text-align:right;white-space:nowrap}.c{text-align:center}tr.t td{font-weight:700}.dt{text-align:right;margin:8px 0 4px}
  table.sig td{text-align:center;vertical-align:top;padding:2px 4px}table.sig i{font-weight:400;font-size:10px}table.sig tr.sp td{padding-top:60px;font-weight:700}`;
const build = { '15611': { xlsx: xlsx15611, html: html15611 }, '14121': { xlsx: xlsx14121, html: html14121 } };
module.exports = { build, pname, dmy };
