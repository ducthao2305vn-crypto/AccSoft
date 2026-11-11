'use strict';
// Logo Telemor trên file xuất: chèn ảnh vào mọi sheet Excel (góc phải phía trên, sau cột cuối có dữ liệu) và đầu trang PDF / email HTML.
const fs = require('fs'), path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
let PNG = null;
const png = () => { if (PNG) return PNG; const p = [path.join(__dirname, 'vendor', 'telemor-logo.png'), path.join(__dirname, '..', 'vendor', 'telemor-logo.png')].find(x => fs.existsSync(x)); PNG = p ? fs.readFileSync(p) : Buffer.alloc(0); return PNG; };
// File dùng để nạp lại vào ứng dụng / ERP → không chèn logo
const RAW = /AccSoft_MauSoDuDauKy|DANH_MUC|MauGanMaTaiSan|GL_?Journal/i;
const CX = 1371600, CY = Math.round(CX * 198 / 603); // 1.5 inch, giữ tỉ lệ ảnh 603 × 198
const colIdx = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const drawingXml = col => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${CX}" cy="${CY}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Telemor logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${CX}" cy="${CY}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
const RELNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
function xlsx(buf, name = '', opt = {}) {
  if (RAW.test(name) || !png().length) return buf;
  try {
    const z = XLSX.CFB.read(buf, { type: 'buffer' }), find = p => XLSX.CFB.find(z, p), get = p => { const f = find(p); return f ? Buffer.from(f.content).toString('utf8') : null; };
    const put = (p, s) => { const f = find(p), c = Buffer.isBuffer(s) ? s : Buffer.from(s, 'utf8'); if (f) { f.content = c; f.size = c.length; } else XLSX.CFB.utils.cfb_add(z, p, c); };
    if (get('/xl/media/accsoft_logo.png') != null) return buf; // đã có logo
    let ct = get('/[Content_Types].xml'); if (!ct) return buf;
    const sheets = z.FullPaths.map(p => p.replace(/^Root Entry/, '')).filter(p => /^\/xl\/worksheets\/sheet\d+\.xml$/.test(p)); if (!sheets.length) return buf;
    put('/xl/media/accsoft_logo.png', png()); let n = 0, added = [];
    for (const sp of sheets) {
      let x = get(sp); if (!x || /<drawing\b/.test(x)) continue;
      const m = /<dimension ref="[A-Z]+\d+:([A-Z]+)\d+"/.exec(x), col = opt.col != null ? opt.col : Math.min(m ? colIdx(m[1]) + 1 : 8, 40); // opt.col: đặt logo trong vùng in (biểu mẫu có chỗ trống đầu trang)
      n++; const dp = `/xl/drawings/accsoft_logo${n}.xml`;
      put(dp, drawingXml(col)); put(`/xl/drawings/_rels/accsoft_logo${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELNS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/accsoft_logo.png"/></Relationships>`);
      const rp = sp.replace(/sheet(\d+)\.xml$/, '_rels/sheet$1.xml.rels'), rel = `<Relationship Id="rIdAccLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/accsoft_logo${n}.xml"/>`;
      const old = get(rp); put(rp, old ? old.replace('</Relationships>', rel + '</Relationships>') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELNS}">${rel}</Relationships>`);
      if (!/xmlns:r=/.test(x.slice(0, x.indexOf('>', x.indexOf('<worksheet')) + 1))) x = x.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
      const tag = '<drawing r:id="rIdAccLogo"/>', after = x.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
      x = after >= 0 ? x.slice(0, after) + tag + x.slice(after) : x.replace('</worksheet>', tag + '</worksheet>');
      put(sp, x); added.push(dp);
    }
    if (!/Extension="png"/i.test(ct)) ct = ct.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>');
    ct = ct.replace('</Types>', added.map(p => `<Override PartName="${p}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('') + '</Types>');
    put('/[Content_Types].xml', ct);
    return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
  } catch { return buf; }
}
// HTML (PDF / email): logo góc phải đầu trang
function html(h) {
  if (!h || !png().length || /accsoft-logo/.test(h)) return h;
  const img = `<div class="accsoft-logo" style="text-align:right;margin:0 0 4px"><img src="data:image/png;base64,${png().toString('base64')}" alt="Telemor" style="height:40px"></div>`;
  return /<body[^>]*>/i.test(h) ? h.replace(/(<body[^>]*>)/i, '$1' + img) : img + h;
}
// PDF: dòng tiêu đề bảng (<tr> toàn <th> đầu bảng) → <thead> để Chromium lặp lại khi sang trang; không cắt đôi dòng
function pdfHtml(h) {
  if (!h) return h;
  h = String(h).replace(/(<table[^>]*>)\s*(<tr[^>]*>(?:\s*<th\b[^>]*>[\s\S]*?<\/th>)+\s*<\/tr>)/gi, '$1<thead>$2</thead>');
  const css = '<style>thead{display:table-header-group}tr,img{break-inside:avoid;page-break-inside:avoid}</style>';
  return /<\/head>/i.test(h) ? h.replace(/<\/head>/i, css + '</head>') : css + h;
}
// Tuỳ chọn printToPDF: số trang ở chân trang
const pdfOpts = (en, o = {}) => ({ pageSize: 'A4', printBackground: true, generateTaggedPDF: false, generateDocumentOutline: false, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:8px;color:#666;text-align:center;font-family:Arial">${en ? 'Page' : 'Trang'} <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  margins: { marginType: 'custom', top: 0.4, bottom: 0.55, left: 0.4, right: 0.4 }, ...o });
module.exports = { xlsx, html, pdfHtml, pdfOpts, RAW, png };
