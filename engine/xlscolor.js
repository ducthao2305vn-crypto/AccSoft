'use strict';
// Xuất Excel có tô màu từng dòng (vd sổ ledger tô theo nhóm khớp). aoa: mảng dòng; opt: {head: chỉ số dòng tiêu đề, fills: [màu nền hex | null theo dòng], bold: [true theo dòng], cols: [độ rộng], num: [chỉ số cột số]}
const XLSX = require('../vendor/xlsx.full.min.js');
function build(sheet, aoa, opt = {}) {
  const ws = XLSX.utils.aoa_to_sheet(aoa), wb = XLSX.utils.book_new();
  if (opt.cols) ws['!cols'] = opt.cols.map(w => ({ wch: w }));
  if (opt.merges) ws['!merges'] = opt.merges;
  XLSX.utils.book_append_sheet(wb, ws, String(sheet || 'Sheet1').slice(0, 31));
  const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const z = XLSX.CFB.read(buf, { type: 'buffer' }), get = p => { const f = XLSX.CFB.find(z, p); return f ? Buffer.from(f.content).toString('utf8') : null; };
  const put = (p, s) => { const f = XLSX.CFB.find(z, p); f.content = Buffer.from(s, 'utf8'); f.size = f.content.length; };
  let st = get('/xl/styles.xml'); const grab = t => { const m = st.match(new RegExp(`<${t} count="(\\d+)">([\\s\\S]*?)</${t}>`)); return { n: +m[1], body: m[2] }; };
  const fonts = grab('fonts'), fills = grab('fills'), borders = grab('borders'), xfs = grab('cellXfs'), F = fonts.n, B = borders.n;
  const colors = [...new Set((opt.fills || []).filter(Boolean).map(c => c.replace('#', '').toUpperCase()))], fillId = new Map(colors.map((c, i) => [c, fills.n + 1 + i]));
  const nf = ['<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>', '<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="14"/><color rgb="FFFA4700"/><name val="Calibri"/></font>'];
  const fl = c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`, nl = [fl('FA4700'), ...colors.map(fl)];
  const nb = '<border><left style="thin"><color rgb="FFE4E7EC"/></left><right style="thin"><color rgb="FFE4E7EC"/></right><top style="thin"><color rgb="FFE4E7EC"/></top><bottom style="thin"><color rgb="FFE4E7EC"/></bottom><diagonal/></border>';
  if (/<numFmts count="(\d+)">/.test(st)) st = st.replace(/<numFmts count="(\d+)">/, (m, n) => `<numFmts count="${+n + 1}"><numFmt numFmtId="190" formatCode="#,##0.00;[Red]\\-#,##0.00"/>`);
  else st = st.replace('<fonts', '<numFmts count="1"><numFmt numFmtId="190" formatCode="#,##0.00;[Red]\\-#,##0.00"/></numFmts><fonts');
  const base = xfs.body.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [], add = [], cache = new Map();
  const xf = (num, font, fill, border, wrap) => { const k = [num, font, fill, border, wrap].join('|'); if (cache.has(k)) return cache.get(k);
    add.push(`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"${wrap ? ' wrapText="1"' : ''}/></xf>`); const id = base.length + add.length - 1; cache.set(k, id); return id; };
  st = st.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, `<fonts count="${F + nf.length}">${fonts.body}${nf.join('')}</fonts>`).replace(/<fills count="\d+">[\s\S]*?<\/fills>/, `<fills count="${fills.n + nl.length}">${fills.body}${nl.join('')}</fills>`)
    .replace(/<borders count="\d+">[\s\S]*?<\/borders>/, `<borders count="${B + 1}">${borders.body}${nb}</borders>`);
  const head = opt.head ?? 0, NUM = new Set(opt.num || []), WRAP = new Set(opt.wrap || []), title = new Set(opt.title || []);
  let x = get('/xl/worksheets/sheet1.xml');
  x = x.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, (all, col, rs, at, sc) => { const r = +rs - 1, c = XLSX.utils.decode_col(col); let s;
    if (title.has(r)) s = xf(0, F + 3, 0, 0, false); else if (r === head) s = xf(0, F, fills.n, B, true);
    else if (r > head) { const f = (opt.fills || [])[r], fid = f ? fillId.get(f.replace('#', '').toUpperCase()) : 0; s = xf(NUM.has(c) ? 190 : 0, (opt.bold || [])[r] ? F + 1 : F + 2, fid || 0, B, WRAP.has(c)); }
    else return all; return `<c r="${col}${rs}"${at.replace(/\ss="\d+"/, '')} s="${s}"${sc}>`; });
  x = x.replace(/<sheetView workbookViewId="0"\s*\/>/, `<sheetView workbookViewId="0"><pane ySplit="${head + 1}" topLeftCell="A${head + 2}" activePane="bottomLeft" state="frozen"/></sheetView>`);
  put('/xl/worksheets/sheet1.xml', x);
  st = st.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${base.length + add.length}">${base.join('')}${add.join('')}</cellXfs>`);
  put('/xl/styles.xml', st);
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}
module.exports = { build };
