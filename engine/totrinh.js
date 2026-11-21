'use strict';
// Mẫu tờ trình song ngữ (Việt – Anh) dựng từ tờ trình chuẩn của đơn vị (vendor/totrinh_tpl.docx): điền đơn vị, tiêu đề, bảng ngân sách theo quy định
const XLSX = require('../vendor/xlsx.full.min.js');
const enc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = v => v == null || v === '' ? '' : (Math.round((+v || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// o: { unit, unitVn, ucode, title, year, to, items:[{code, vn, en, PY, A}], prop, note, asof }  – items rỗng = mẫu trắng gửi các đơn vị
function build(tpl, o) {
  const z = XLSX.CFB.read(tpl, { type: 'buffer' }), f = XLSX.CFB.find(z, '/word/document.xml'); let s = Buffer.from(f.content).toString('utf8');
  const X = o.items || [], blank = !X.length, PY = X.reduce((a, x) => a + (+x.PY || 0), 0), A = X.reduce((a, x) => a + (+x.A || 0), 0), pr = +o.prop || 0, rem = PY - A - pr;
  const nm = x => `${x.vn || x.en}${x.en && x.vn && x.en !== x.vn ? ' / ' + x.en : ''}`, names = blank ? '[khoản mục ngân sách / budget item]' : X.map(x => `${x.code} ${x.vn || x.en}`).join('; ');
  const per = o.to ? `T1 – T${o.to}/${o.year} (Jan – ${MON[o.to]} ${o.year})` : '[kỳ / period]';
  const rows = [['1', `Ngân sách từ đầu năm ${o.year} / Budget from the beginning of ${o.year}${X.length === 1 ? ' – ' + nm(X[0]) : ''}`, blank ? '' : PY, '']];
  if (X.length > 1) X.forEach((x, i) => rows.push([`1.${i + 1}`, `Ngân sách đầu năm / Budget – ${nm(x)}`, x.PY, x.code]));
  if (blank) rows.push(['1.1', 'Ngân sách đầu năm / Budget – [khoản mục / item]', '', '']);
  rows.push(['2', 'Số tiền đã sử dụng ở các tờ trình trước / Spent amount', blank ? '' : A, blank ? '' : `Luỹ kế / Accumulated ${per}`]);
  rows.push(['3', 'Số tiền đề xuất ở tờ trình này / The amount proposed in this Statement', blank && !pr ? '' : pr, o.note || '']);
  rows.push(['4', 'Số tiền ngân sách còn lại / Remaining Budget Amount', blank ? '' : rem, !blank && rem < 0 ? 'Vượt ngân sách / Exceeds budget' : '']);
  const m = s.match(/<w:tr\b(?:(?!<w:tr\b)[\s\S])*?\{\{R_NO\}\}[\s\S]*?<\/w:tr>/);
  if (m) s = s.replace(m[0], rows.map(r => m[0].replace('{{R_NO}}', enc(r[0])).replace('{{R_C}}', enc(r[1])).replace('{{R_A}}', enc(typeof r[2] === 'number' ? fmt(r[2]) : r[2])).replace('{{R_N}}', enc(r[3]))).join(''));
  const V = { UNIT: o.unit || '[ĐƠN VỊ ĐỀ XUẤT / PROPOSING UNIT]', UNIT_VN: o.unitVn || o.unit || '[Đơn vị đề xuất]', UCODE: o.ucode || '[MÃ ĐV]', TITLE: o.title || '[Nội dung đề xuất / Subject of the proposal]', YEAR: o.year || '', ITEMS: names,
    PROP: blank && !pr ? '……' : fmt(pr), PROP_NOTE: o.note || 'chưa gồm thuế nhà thầu / excluding withholding tax', PERIOD: per, ASOF: o.asof || '[ngày / date]' };
  s = s.replace(/\{\{([A-Z_]+)\}\}/g, (a, k) => k in V ? enc(V[k]) : a);
  f.content = Buffer.from(s, 'utf8'); f.size = f.content.length;
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}
module.exports = { build };
