'use strict';
// Xuất biên bản đối chiếu công nợ 331: Excel (tổng hợp theo hợp đồng + chi tiết giao dịch) và Word (theo mẫu xác nhận số dư).
const XLSX = require('../vendor/xlsx.full.min.js');
const enc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = v => Math.round((+v || 0) * 100) / 100;
const fmt = v => r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = d => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return `${dd} ${MON[m - 1]} ${y}`; };
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const letterDate = (d = new Date()) => `${MON[d.getMonth()]} ${ord(d.getDate())}, ${d.getFullYear()}`;
const dmy = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const pname = (bp, info) => (info && info.name) || String(bp || '').replace(/^[A-Za-z]+_[A-Za-z]*\d+_?/, '') || bp;

// ---------- Excel ----------
function buildXlsx(d, company = 'VIETTEL TIMOR UNIP LDA') {
  const P = pname(d.bp, d.info), C = d.contracts, wb = XLSX.utils.book_new(), ST = {};
  // Sheet 1: tổng hợp theo hợp đồng (chỉ phải trả)
  const A = [], M = [], st = (r, c, k) => { ST['S1|' + XLSX.utils.encode_cell({ r, c })] = k; };
  A.push([`CONFIRMATION OF CLOSING BALANCE BETWEEN ${P.toUpperCase()} AND ${company} AS ${dmy(d.to)}`]); M.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }); st(0, 0, 'T');
  A.push([`Period: ${dmy(d.from)} – ${dmy(d.to)} · Partner code: ${d.bp}`]); st(1, 0, 'I');
  A.push([]); A.push(['', '', '', '', '', '', '', '', '', '', '', '', '', 'Currency: USD']);
  A.push(['No', 'Contract', 'Balance type', `STATISTIC OF ${company} (Trade payables)`, '', '', '', `STATISTIC OF ${P} (Trade receivable)`, '', '', '', 'Difference', 'Reasons']);
  A.push(['', '', '', 'Opening balance', 'Performance amount (Expenses)', 'Paid', 'Closing balance', 'Opening balance', 'Performance amount (Revenue)', 'Received', 'Closing balance', '', '']);
  M.push({ s: { r: 4, c: 3 }, e: { r: 4, c: 6 } }, { s: { r: 4, c: 7 }, e: { r: 4, c: 10 } }); for (const c of [0, 1, 2, 11, 12]) M.push({ s: { r: 4, c }, e: { r: 5, c } });
  for (let r = 4; r <= 5; r++) for (let c = 0; c <= 12; c++) st(r, c, 'H');
  const R0 = A.length;
  C.forEach((c, i) => { const r = A.length + 1; A.push([i + 1, c.c || '(không có hợp đồng)', c.close < -0.004 ? 'Advance (prepayment)' : 'Payable', r2(c.open), r2(c.cr), r2(c.dr), { f: `D${r}+E${r}-F${r}`, v: r2(c.close) }, null, null, null, null, { f: `G${r}-K${r}`, v: r2(c.close) }, '']);
    for (let k = 0; k <= 12; k++) st(A.length - 1, k, k >= 3 && k <= 11 ? 'N' : 'B'); });
  const RT = A.length + 1, col = 'DEFGHIJKL'.split('');
  A.push(['', 'Total', '', ...col.map(L => ({ f: `SUBTOTAL(9,${L}${R0 + 1}:${L}${RT - 1})`, v: L === 'D' ? r2(d.open) : L === 'E' ? r2(d.cr) : L === 'F' ? r2(d.dr) : L === 'G' || L === 'L' ? r2(d.close) : 0 })), '']);
  for (let k = 0; k <= 12; k++) st(A.length - 1, k, k >= 3 && k <= 11 ? 'NT' : 'BT');
  A.push([]); A.push(['', `Of which: amount payable ${fmt(d.pay)} · advance (prepayment) ${fmt(d.adv)} · net ${fmt(d.close)}`]); st(A.length - 1, 1, 'I');
  A.push([]); A.push(['', company, '', '', '', '', '', '', P]); st(A.length - 1, 1, 'BB'); st(A.length - 1, 8, 'BB');
  A.push(['', 'Accountant', '', 'Chief accountant', '', '', '', '', 'Accountant', '', 'Chief accountant']);
  const ws = XLSX.utils.aoa_to_sheet(A); ws['!merges'] = M; ws['!cols'] = [6, 34, 18, 15, 17, 15, 15, 15, 17, 15, 15, 14, 24].map(w => ({ wch: w }));
  for (const k in ws) if (k[0] !== '!' && typeof ws[k].v === 'number' && ws[k].t === 'n') ws[k].z = '#,##0.00;[Red]-#,##0.00';
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  // Sheet 2: chi tiết giao dịch theo hợp đồng
  const B = [], M2 = [], st2 = (r, c, k) => { ST['S2|' + XLSX.utils.encode_cell({ r, c })] = k; };
  B.push([`DETAIL OF TRANSACTIONS BY CONTRACT – ${P.toUpperCase()}`]); st2(0, 0, 'T'); B.push([`Period: ${dmy(d.from)} – ${dmy(d.to)} · Account ${d.acc || '331'} · Currency: USD`]); st2(1, 0, 'I'); B.push([]);
  B.push(['Date', 'Document', 'Description', 'Dr account', 'Cr account', 'Increase (Cr 331)', 'Decrease (Dr 331)', 'Balance', 'Invoice', 'Original contract']); for (let k = 0; k < 10; k++) st2(3, k, 'H');
  for (const c of C) {
    B.push([`Contract: ${c.c || '(không có hợp đồng)'}`]); M2.push({ s: { r: B.length - 1, c: 0 }, e: { r: B.length - 1, c: 9 } }); st2(B.length - 1, 0, 'G');
    B.push(['', '', 'Opening balance', '', '', '', '', r2(c.open)]); st2(B.length - 1, 2, 'B'); st2(B.length - 1, 7, 'N');
    let bal = c.open;
    for (const x of d.lines.filter(x => (x.c || '') === (c.c || '') && x.inP)) { bal += x.v; B.push([dmy(x.d), x.doc, x.ds, x.dr, x.cr, x.side === 'cr' ? r2(x.a) : null, x.side === 'dr' ? r2(x.a) : null, r2(bal), x.inv || '', x.adj ? x.c0 || '' : '']);
      for (let k = 0; k < 10; k++) st2(B.length - 1, k, k >= 5 && k <= 7 ? 'N' : 'B'); }
    B.push(['', '', `Closing balance${c.close < -0.004 ? ' (advance)' : ''}`, '', '', r2(c.cr), r2(c.dr), r2(c.close)]); for (let k = 0; k < 10; k++) st2(B.length - 1, k, k >= 5 && k <= 7 ? 'NT' : 'BT');
    B.push([]);
  }
  const w2 = XLSX.utils.aoa_to_sheet(B); w2['!merges'] = M2; w2['!cols'] = [11, 20, 60, 11, 11, 16, 16, 16, 16, 30].map(w => ({ wch: w }));
  for (const k in w2) if (k[0] !== '!' && w2[k].t === 'n') w2[k].z = '#,##0.00;[Red]-#,##0.00';
  XLSX.utils.book_append_sheet(wb, w2, 'Detail');
  return style(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), ST);
}
// chèn kiểu ô (SheetJS bản cộng đồng không ghi kiểu chữ)
function style(buf, ST) {
  const z = XLSX.CFB.read(buf, { type: 'buffer' }), get = p => { const f = XLSX.CFB.find(z, p); return f ? Buffer.from(f.content).toString('utf8') : null; };
  const put = (p, s) => { const f = XLSX.CFB.find(z, p); f.content = Buffer.from(s, 'utf8'); f.size = f.content.length; };
  let st = get('/xl/styles.xml'); const grab = t => { const m = st.match(new RegExp(`<${t} count="(\\d+)">([\\s\\S]*?)</${t}>`)); return { n: +m[1], body: m[2] }; };
  const fonts = grab('fonts'), fills = grab('fills'), borders = grab('borders'), xfs = grab('cellXfs'), F = fonts.n, L = fills.n, Bd = borders.n;
  const nf = ['<font><b/><sz val="14"/><color rgb="FF101828"/><name val="Times New Roman"/></font>', '<font><b/><sz val="11"/><name val="Times New Roman"/></font>', '<font><sz val="11"/><name val="Times New Roman"/></font>', '<font><i/><sz val="10"/><color rgb="FF475467"/><name val="Times New Roman"/></font>'];
  const nl = ['<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>'];
  const nb = ['<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'];
  st = st.replace(/<numFmts count="(\d+)">/, (m, n) => `<numFmts count="${+n + 1}"><numFmt numFmtId="190" formatCode="#,##0.00;[Red]\\-#,##0.00"/>`);
  if (!/<numFmts/.test(st)) st = st.replace('<fonts', '<numFmts count="1"><numFmt numFmtId="190" formatCode="#,##0.00;[Red]\\-#,##0.00"/></numFmts><fonts');
  const X = (num, font, fill, border, al) => `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment ${al}/></xf>`;
  const K = { T: X(0, F, 0, 0, 'horizontal="center" vertical="center"'), I: X(0, F + 3, 0, 0, 'vertical="center"'), H: X(0, F + 1, L, Bd, 'horizontal="center" vertical="center" wrapText="1"'),
    B: X(0, F + 2, 0, Bd, 'vertical="top" wrapText="1"'), N: X(190, F + 2, 0, Bd, 'vertical="top"'), BT: X(0, F + 1, L + 1, Bd, 'vertical="top"'), NT: X(190, F + 1, L + 1, Bd, 'vertical="top"'),
    G: X(0, F + 1, L + 2, Bd, 'vertical="center"'), BB: X(0, F + 1, 0, 0, 'horizontal="left"') };
  const base = (xfs.body.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || []), keys = Object.keys(K), id = Object.fromEntries(keys.map((k, i) => [k, base.length + i]));
  st = st.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, `<fonts count="${F + nf.length}">${fonts.body}${nf.join('')}</fonts>`).replace(/<fills count="\d+">[\s\S]*?<\/fills>/, `<fills count="${L + nl.length}">${fills.body}${nl.join('')}</fills>`)
    .replace(/<borders count="\d+">[\s\S]*?<\/borders>/, `<borders count="${Bd + nb.length}">${borders.body}${nb.join('')}</borders>`).replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${base.length + keys.length}">${base.join('')}${keys.map(k => K[k]).join('')}</cellXfs>`);
  put('/xl/styles.xml', st);
  for (const [sh, p] of [['S1', '/xl/worksheets/sheet1.xml'], ['S2', '/xl/worksheets/sheet2.xml']]) { let x = get(p); if (!x) continue;
    x = x.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/?)>/g, (all, ref, at, sc) => { const k = ST[sh + '|' + ref]; return k ? `<c r="${ref}"${at.replace(/\ss="\d+"/, '')} s="${id[k]}"${sc}>` : all; });
    // ô trống được định dạng (khung) cần tồn tại: bổ sung ô rỗng cho các ô có kiểu nhưng chưa có trong sheet
    put(p, x); }
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}

// ---------- Word ----------
function buildDocx(d, tplBuf, parts, company) {
  const z = XLSX.CFB.read(tplBuf, { type: 'buffer' }), f = XLSX.CFB.find(z, '/word/document.xml'); let s = Buffer.from(f.content).toString('utf8');
  const P = pname(d.bp, d.info), open = d.contracts.filter(c => Math.abs(c.close) > 0.004);
  const rows = open.map(c => parts.row.replace('{{C}}', enc(c.c || '(no contract)')).replace('{{KIND}}', c.close < 0 ? 'Advance (prepayment)' : 'Payable').replace('{{AMT}}', fmt(Math.abs(c.close)))).join('');
  s = s.replace('{{ADVROW}}', d.adv > 0.004 ? parts.adv.replace('{{ADV}}', fmt(d.adv)) : '').replace('{{ROWS}}', rows)
    .replace(/\{\{DATE\}\}/g, letterDate()).replace(/\{\{PARTNER\}\}/g, enc(P)).replace(/\{\{PEND\}\}/g, longDate(d.to)).replace(/\{\{PSTART\}\}/g, longDate(d.from)).replace(/\{\{PAY\}\}/g, fmt(d.pay));
  f.content = Buffer.from(s, 'utf8'); f.size = f.content.length;
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}
module.exports = { buildXlsx, buildDocx, pname };
