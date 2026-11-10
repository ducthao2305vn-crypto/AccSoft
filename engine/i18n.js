'use strict';
// Dịch nội dung file xuất (Excel, Word, PDF/HTML, email) sang tiếng Anh khi giao diện chọn EN.
// Dùng chung từ điển với giao diện (i18n_en.js, i18n_en2.js). Ô dữ liệu chỉ dịch khi khớp nguyên chuỗi
// (hoặc nhãn + số / ngày như "Số dư tại 01/01/2026") để không làm sai tên đối tượng, diễn giải do người dùng nhập.
const fs = require('fs'), path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
let LANG = 'vi', D = null, PH = null;
const VIRX = /[À-ỹđĐ]/;
function load() {
  if (D) return; const w = {};
  for (const f of ['i18n_en.js', 'i18n_en2.js']) { const p = [path.join(__dirname, f), path.join(__dirname, '..', f)].find(x => fs.existsSync(x)); if (p) new Function('window', fs.readFileSync(p, 'utf8'))(w); } // bản đóng gói: main.js và i18n_*.js cùng thư mục out/
  D = w.I18N_EN || {}; PH = w.I18N_PH || [];
}
const phrase = s => { let r = s; for (const [a, b] of PH) if (r.includes(a)) r = r.split(a).join(b); return r; };
// mode: 'cell' = ô dữ liệu (thận trọng), 'text' = văn bản do phần mềm soạn (cho phép thay cụm từ)
function tr(t, mode = 'cell') {
  if (LANG !== 'en' || typeof t !== 'string' || !VIRX.test(t)) return t; load();
  const k = t.trim(); let r = D[k];
  if (r == null) { const k2 = k.replace(/\s*:$/, ''); if (k2 !== k && D[k2] != null) r = D[k2] + ':'; }
  if (r == null) { const m = k.match(/^([^\p{L}\d(]+)(.+)$/u); if (m && D[m[2].trim()] != null) r = m[1] + D[m[2].trim()]; }
  if (r == null) {
    const labelNum = /\d/.test(k) && k.length <= 160 && PH.some(([a]) => k.startsWith(a)), caps = k.length <= 160 && k === k.toUpperCase();
    if (mode === 'text' || labelNum) r = phrase(k);
    else if (caps) { const up = phrase(k.toLowerCase()); if (!VIRX.test(up)) r = up.toUpperCase(); }
  }
  return r == null ? t : t.replace(k, r);
}
const unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esx = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const trXmlT = (xml, tag) => xml.replace(new RegExp(`(<${tag}(?:\\s[^>]*)?>)([^<]*)(</${tag}>)`, 'g'), (m, a, t, b) => { if (!VIRX.test(t)) return m; const v = tr(unx(t)); return a + esx(v) + b; });
// File xlsx (SheetJS hoặc ExcelJS): chuỗi dùng chung, chuỗi trong ô, tên sheet (đổi cả tham chiếu công thức)
function xlsx(buf) {
  if (LANG !== 'en') return buf;
  try {
    const z = XLSX.CFB.read(buf, { type: 'buffer' }), get = p => { const f = XLSX.CFB.find(z, p); return f ? Buffer.from(f.content).toString('utf8') : null; };
    const put = (p, s) => { const f = XLSX.CFB.find(z, p); if (f) { f.content = Buffer.from(s, 'utf8'); f.size = f.content.length; } };
    const ss = get('/xl/sharedStrings.xml'); if (ss) put('/xl/sharedStrings.xml', trXmlT(ss, 't'));
    let wbx = get('/xl/workbook.xml'); const ren = [];
    if (wbx) { const used = new Set();
      wbx = wbx.replace(/<sheet ([^>]*?)name="([^"]*)"/g, (m, pre, nm) => { const o = unx(nm); let n = tr(o).replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31); if (!n.trim() || used.has(n.toLowerCase())) n = o; used.add(n.toLowerCase()); if (n !== o) ren.push([o, n]); return `<sheet ${pre}name="${esx(n).replace(/"/g, '&quot;')}"`; });
      put('/xl/workbook.xml', wbx); }
    for (const e of z.FullPaths) if (/\/xl\/worksheets\/sheet\d+\.xml$/.test(e)) { let x = get(e); if (!x) continue; x = trXmlT(x, 't');
      x = x.replace(/(<c [^>]*t="str"[^>]*>(?:<f>[^<]*<\/f>)?<v>)([^<]*)(<\/v>)/g, (m, b, t, e2) => VIRX.test(t) ? b + esx(tr(unx(t))) + e2 : m); // SheetJS ghi chuỗi trực tiếp trong ô
      for (const [o, n] of ren) { const q = s => s.replace(/'/g, "''"); x = x.split(`'${esx(q(o))}'!`).join(`'${esx(q(n))}'!`); if (/^\w+$/.test(o)) x = x.split(`${o}!`).join(`'${esx(q(n))}'!`); }
      put(e, x); }
    const dn = get('/xl/workbook.xml'); if (dn && ren.length) { let y = dn; for (const [o, n] of ren) y = y.split(`'${o}'!`).join(`'${n}'!`); put('/xl/workbook.xml', y); }
    return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
  } catch { return buf; }
}
function docx(buf) {
  if (LANG !== 'en') return buf;
  try { const z = XLSX.CFB.read(buf, { type: 'buffer' }), f = XLSX.CFB.find(z, '/word/document.xml'); if (!f) return buf;
    const x = trXmlT(Buffer.from(f.content).toString('utf8'), 'w:t'); f.content = Buffer.from(x, 'utf8'); f.size = f.content.length;
    return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true })); } catch { return buf; }
}
// HTML (PDF, email): văn bản trong <td> dịch thận trọng, còn lại dịch cả cụm từ
function html(h) {
  if (LANG !== 'en' || !h) return h;
  return String(h).replace(/(<(\w+)[^>]*>)([^<]+)/g, (m, tag, name, t) => tag + (VIRX.test(t) ? tr(t, /^td$/i.test(name) ? 'cell' : 'text') : t));
}
module.exports = { tr, xlsx, docx, html, setLang: l => { LANG = l === 'en' ? 'en' : 'vi'; return LANG; }, lang: () => LANG };
