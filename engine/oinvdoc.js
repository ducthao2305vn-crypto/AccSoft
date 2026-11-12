'use strict';
// Điền báo cáo Word "Phụ lục 01 – Báo cáo tình hình tài chính dự án đầu tư ra nước ngoài" (mẫu của đơn vị) từ số liệu sổ:
//  - Bảng tình hình tài chính (Tổng tài sản … Vay ngân hàng): cột cuối kỳ / đầu năm / tỷ lệ – theo Mẫu 02.
//  - Bảng kết quả SXKD: cột thực hiện 2 năm trước, năm trước, năm nay (cùng kỳ) – theo Mẫu 01; tính lại tỷ lệ %.
//  - Đoạn tổng tài sản, tài sản cố định: viết lại theo số liệu.
//  - Nội dung không có trong dữ liệu kế toán (thuê bao, kế hoạch, vốn đầu tư / thu hồi vốn, đầu tư mua sắm, nhân sự, thuế NSNN,
//    ví điện tử, kiến nghị…) và các đoạn lời văn cần cập nhật theo số mới → bôi vàng để đơn vị bổ sung. Giữ nguyên định dạng mẫu.
const XLSX = require('../vendor/xlsx.full.min.js');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unx = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const txt = x => unx((x.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
const nf = (v, d = 2) => v == null || !isFinite(v) ? '-' : Math.abs(v) < 0.005 && d === 2 ? '-' : (v < 0 ? '-' : '') + Math.abs(v).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, '#').replace('.', ',').replace(/#/g, '.');
const pct = (a, b) => b && isFinite(a / b) && Math.abs(b) > 1e-9 ? nf(a / b * 100, 1) + '%' : '';
// bôi vàng mọi run trong đoạn XML
function hl(x) { return x.replace(/<w:r>|<w:r( [^>]*)>/g, m => m).replace(/(<w:r(?: [^>]*)?>)(<w:rPr>([\s\S]*?)<\/w:rPr>)?/g, (m, r, rp, inner) => {
  if (inner != null) return inner.includes('<w:highlight') ? m : r + '<w:rPr>' + inner.replace(/<w:highlight [^>]*\/>/, '') + '<w:highlight w:val="yellow"/></w:rPr>';
  return r + '<w:rPr><w:highlight w:val="yellow"/></w:rPr>'; }); }
// thay nội dung đoạn, giữ định dạng run đầu tiên
function setText(p, t, mark) { const r0 = (p.match(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/) || [''])[0], rp = (r0.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
  const head = p.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>[\s\S]*$/, '').replace(/<\/w:p>$/, ''), run = `<w:r>${rp}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const out = (head.startsWith('<w:p') ? head : p.slice(0, p.indexOf('>') + 1)) + run + '</w:p>'; return mark ? hl(out) : out; }
const isNum = s => /^[\s\-–()]*[\d.,%\s]*$/.test(s) || /^\s*-\s*$/.test(s);
const cells = tr => tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
function setCell(tc, t, mark) { const ps = tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []; if (!ps.length) return tc; let first = true;
  return tc.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => { if (!first) return ''; first = false; return setText(p, t, mark); }); }
const hlCell = tc => tc.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => hl(p));

function fill(buf, R, o = {}) {
  const z = XLSX.CFB.read(buf, { type: 'buffer' }), f = XLSX.CFB.find(z, '/word/document.xml'); if (!f) throw new Error('File không phải Word (.docx)');
  let x = Buffer.from(f.content).toString('utf8'); const log = [];
  const yr = (R && R.to || '').slice(0, 4), toD = R && R.to ? lastD(R.to) : '', fromM = R && R.from ? +R.from.slice(5, 7) : 1, toM = R && R.to ? +R.to.slice(5, 7) : 12;
  const data = !!(R && R.m02 && o.fill !== false);
  // ---- bảng ----
  let tIdx = 0, seenBS = 0;
  x = x.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => { tIdx++; const T = txt(tbl);
    if (/Theo GCN/i.test(T) || /thu hồi vốn|Cổ tức/i.test(T) && !/Tổng tài sản/.test(T) || /TH 6 ?TĐN|EBITDA/i.test(T)) { log.push('Bảng ' + tIdx + ': số liệu đơn vị bổ sung'); return hlNums(tbl); }
    if (/1\. Tổng tài sản/.test(T)) { seenBS++; if (seenBS === 1) return data ? bsTable(tbl) : tbl; log.push('Bảng ' + tIdx + ': tình hình tài chính ' + (seenBS === 1 ? '(không có dữ liệu)' : 'công ty ví – đơn vị bổ sung')); return hlNums(tbl); }
    if (/Chỉ tiêu sản xuất kinh doanh|DT thuần về bán hàng/.test(T)) return plTable(tbl);
    return tbl; });
  function hlNums(tbl) { return tbl.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, tc => { const s = txt(tc).trim(); return s && isNum(s) ? hlCell(tc) : tc; }); }
  // bảng tình hình tài chính: [chỉ tiêu | cuối kỳ | (trống?) | đầu năm | %]
  function bsTable(tbl) { const M = new Map(); for (const r of R.m02.rows) M.set(norm(r.n), r); const used = new Map();
    return tbl.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, tr => { const C = cells(tr); if (C.length < 3) return tr; const lab = norm(txt(C[0])); if (!lab) return tr;
      const k = used.get(lab) || 0; used.set(lab, k + 1); const cand = R.m02.rows.filter(r => norm(r.n) === lab), r = cand[k] || cand[0];
      if (!r) return tr; const num = C.map((c, i) => i > 0 && isNum(txt(c).trim())).map((b, i) => b ? i : -1).filter(i => i > 0); if (num.length < 2) return tr;
      const [iB, iC] = num, iP = num[2]; let out = tr; const rep = (i, v, mk) => { out = out.replace(C[i], setCell(C[i], v, mk)); };
      rep(iB, nf(r.B)); rep(iC, nf(r.C)); if (iP != null) rep(iP, pct(r.B, r.C)); return out; }); }
  // bảng SXKD: [nội dung | TH Y-2 | TH Y-1 | KH Y | TH Y | %Y/Y-2 | %Y/Y-1 | %Y/KH]
  function plTable(tbl) { const rows = R && R.m01 ? R.m01.rows.filter(r => !r.head) : [];
    return tbl.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, tr => { const C = cells(tr); if (C.length < 8) return tr; const lab = norm(txt(C[0])); const r = rows.find(q => norm(q.n) === lab);
      if (!/^\d+\./.test(lab)) return tr; let out = tr; const rep = (i, v, mk) => { out = out.replace(C[i], setCell(C[i], v, mk)); }, hc = i => { out = out.replace(C[i], hlCell(C[i])); };
      const num = s => { const t = String(s).replace(/[^\d,.\-]/g, ''); if (!t || t === '-') return 0; const neg = /-/.test(s.trim().replace(/^\s*-\s*$/, '')) && /\d/.test(s); return (neg ? -1 : 1) * +t.replace(/-/g, '').replace(/\./g, '').replace(',', '.'); };
      const man = r ? r.man : /thuê bao/i.test(lab); if (man) { [1, 2, 3, 4, 5, 6, 7].forEach(hc); return out; }
      if (!r || !data) { hc(3); hc(7); return out; }
      const [a, b, c] = r.auto, kh = num(txt(C[3])); rep(1, nf(a)); rep(2, nf(b)); hc(3); rep(4, nf(c)); rep(5, pct(c, a)); rep(6, pct(c, b)); rep(7, kh ? pct(c, kh) : '', true); return out; }); }
  // ---- đoạn văn ----
  const FY = /Thuê bao|thuê bao|Giá trị đầu tư|Giá trị thanh toán|tiết kiệm|Tỷ trọng|Đề xuất phê duyệt|Đánh giá tiến độ|quân số|tuyển dụng|tiền lương|Thu nhập bình quân|hành lang pháp lý|quỹ khen thưởng|phúc lợi|Tặng quà|Khen thưởng|nghĩa vụ ngân sách|Đánh giá sự tuân thủ|ví điện tử|Telemor Fintech|Fintech|CAR|ROA|ROE|Nợ phải trả\/Vốn|Doanh thu 6 tháng|LNST 6 tháng|Quản lý nợ phải trả|Quản lý nợ phải thu|Quản lý hàng tồn kho|Biến động vốn chủ sở hữu|Doanh thu bán hàng và cung cấp dịch vụ|Trung tâm [A-Z]|Vốn chủ sở hữu tại|tỷ lệ thu hồi|Kiến nghị|Phụ lục 0|Số:|ngày\s+tháng/;
  const bs = data ? new Map(R.m02.rows.map(r => [norm(r.n), r])) : null, TA = bs && bs.get(norm('1. Tổng tài sản'));
  x = x.replace(/<w:body>([\s\S]*)<\/w:body>/, (m, body) => '<w:body>' + body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g, p => {
    if (p.startsWith('<w:tbl>')) return p; const t = txt(p); if (!t.trim()) return p;
    if (data && TA && /^Tổng tài sản tại thời điểm/.test(t.trim())) { log.push('Viết lại: tổng tài sản'); return setText(p, `Tổng tài sản tại thời điểm ${toD} đạt ${nf(TA.B)} triệu USD ${TA.B >= TA.C ? 'tăng' : 'giảm'} ${nf(Math.abs(TA.B / TA.C - 1) * 100)}% so với thời điểm đầu năm,`); }
    if (data && R.fa) { const F = R.fa;
      if (/^Tổng giá trị ghi nhận tăng tài sản cố định/.test(t.trim())) return setText(p, `Tổng giá trị ghi nhận tăng tài sản cố định trong kỳ: ${nf(F.inc)} triệu USD`);
      if (/^Tổng nguyên giá tài sản cố định/.test(t.trim())) return setText(p, `Tổng nguyên giá tài sản cố định đến ${toD}: ${nf(F.cost)} triệu USD`);
      if (/^Tổng khấu hao luỹ kế|^Tổng khấu hao lũy kế/.test(t.trim())) return setText(p, `Tổng khấu hao luỹ kế đến ${toD}: ${nf(F.dep)} triệu USD`);
      if (/^Giá trị còn lại tại thời điểm/.test(t.trim())) return setText(p, `Giá trị còn lại tại thời điểm ${toD}: ${nf(F.cost - F.dep)} triệu USD`); }
    if (FY.test(t)) return hl(p);
    return p; }) + '</w:body>');
  f.content = Buffer.from(x, 'utf8'); f.size = f.content.length;
  return { buf: Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true })), log };
  function lastD(ym) { const [y, m] = ym.split('-').map(Number); return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y; }
}
function norm(s) { return String(s || '').replace(/\s+/g, ' ').replace(/[()]/g, '').trim().toLowerCase(); }
module.exports = { fill };
