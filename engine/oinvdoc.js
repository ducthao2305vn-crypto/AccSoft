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
      if (!/^\d+\./.test(lab)) return tr; let out = tr; const rep = (i, v, mk) => { out = out.replace(C[i], setCell(C[i], v, mk)); }, hc = i => { out = out.replace(C[i], txt(C[i]).trim() ? hlCell(C[i]) : setCell(C[i], ' ', true)); };
      const num = s => { const t = String(s).replace(/[^\d,.\-]/g, ''); if (!t || t === '-') return 0; const neg = /-/.test(s.trim().replace(/^\s*-\s*$/, '')) && /\d/.test(s); return (neg ? -1 : 1) * +t.replace(/-/g, '').replace(/\./g, '').replace(',', '.'); };
      const man = r ? r.man : /thuê bao/i.test(lab); if (man) { [1, 2, 3, 4, 5, 6, 7].forEach(hc); return out; }
      if (!r || !data) { hc(3); hc(7); return out; }
      const [a, b, c] = r.auto, kh = num(txt(C[3])); rep(1, nf(a)); rep(2, nf(b)); hc(3); rep(4, nf(c)); rep(5, pct(c, a)); rep(6, pct(c, b)); rep(7, kh ? pct(c, kh) : '', true); return out; }); }
  // ---- đoạn văn ----
  const FY = /Thuê bao|thuê bao|Giá trị đầu tư|Giá trị thanh toán|tiết kiệm|Tỷ trọng|Đề xuất phê duyệt|Đánh giá tiến độ|quân số|tuyển dụng|tiền lương|Thu nhập bình quân|hành lang pháp lý|quỹ khen thưởng|phúc lợi|Tặng quà|Khen thưởng|nghĩa vụ ngân sách|Đánh giá sự tuân thủ|ví điện tử|Telemor Fintech|Fintech|CAR|ROA|ROE|Nợ phải trả\/Vốn|Doanh thu 6 tháng|LNST 6 tháng|Quản lý nợ phải trả|Quản lý nợ phải thu|Quản lý hàng tồn kho|Biến động vốn chủ sở hữu|Doanh thu bán hàng và cung cấp dịch vụ|Trung tâm [A-Z]|Vốn chủ sở hữu tại|tỷ lệ thu hồi|Kiến nghị|Phụ lục 0|Số:|ngày\s+tháng/;
  const bs = data ? new Map(R.m02.rows.map(r => [norm(r.n), r])) : null, TA = bs && bs.get(norm('1. Tổng tài sản'));
  if (!o.tablesOnly) x = x.replace(/<w:body>([\s\S]*)<\/w:body>/, (m, body) => '<w:body>' + body.replace(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g, p => {
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
// ---- Xuất báo cáo từ mẫu dựng sẵn (vendor/oinv_pl01.docx – dựng từ báo cáo 6TĐN của đơn vị, đã bỏ số liệu) ----
function setRuns(p, parts) { const r0 = (p.match(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/) || [''])[0], rp = ((r0.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [])[1] || '').replace(/<w:b\/>|<w:bCs\/>|<w:highlight [^>]*\/>/g, '');
  const i = p.search(/<w:r[ >]/), head = i < 0 ? p.replace(/<\/w:p>$/, '') : p.slice(0, i);
  return head + parts.filter(q => q[0]).map(([t, o = {}]) => `<w:r><w:rPr>${o.b ? '<w:b/><w:bCs/>' : ''}${rp}${o.y ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('') + '</w:p>'; }
function periodLbl(from, to) { const y = to.slice(0, 4), a = +from.slice(5, 7), b = +to.slice(5, 7), sameY = from.slice(0, 4) === y;
  const U = !sameY ? `TỪ THÁNG ${a}/${from.slice(0, 4)} ĐẾN THÁNG ${b}/${y}` : a === 1 && b === 12 ? `NĂM ${y}` : a === 1 && b === 3 ? `QUÝ I NĂM ${y}` : a === 1 && b > 1 ? `${b} THÁNG ĐẦU NĂM ${y}` : a === b ? `THÁNG ${b} NĂM ${y}` : `TỪ THÁNG ${a} ĐẾN THÁNG ${b} NĂM ${y}`;
  const S = !sameY ? `${from.slice(5, 7)}/${from.slice(0, 4)}–${to.slice(5, 7)}/${y}` : a === 1 && b === 12 ? `Năm` : a === 1 && b > 1 ? `${b}TĐN` : a === b ? `T${b}` : `T${a}–T${b}`;
  return { U, L: U.toLowerCase(), S0: S, S: S === 'Năm' ? 'Năm ' + y : S + ' ' + y }; }
function build(tplBuf, R) {
  const z = XLSX.CFB.read(tplBuf, { type: 'buffer' }), f = XLSX.CFB.find(z, '/word/document.xml'); let x = Buffer.from(f.content).toString('utf8');
  const y = +R.to.slice(0, 4), K = periodLbl(R.from, R.to), [yy, mm] = R.to.split('-').map(Number), den = String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0') + '/' + String(mm).padStart(2, '0') + '/' + yy;
  const bs = new Map(R.m02.rows.map(r => [norm(r.n), r])), B = n => bs.get(norm(n)) || { B: 0, C: 0 }, pl = new Map(R.m01.rows.filter(r => !r.head).map(r => [r.k, r]));
  const ch = (a, b) => { if (!b) return 'chưa có số so sánh'; const d = a / b - 1; return Math.abs(d) < 0.0005 ? 'không đổi' : `${d > 0 ? 'tăng' : 'giảm'} ${nf(Math.abs(d) * 100)}%`; };
  const TA = B('1. Tổng tài sản'), TL = B('3. Tổng nợ'), SL = B('- Nợ ngắn hạn'), OD = B('Trong đó: Nợ quá hạn'), EQ = B('2. Vốn chủ sở hữu'), CAP = B('- Vốn góp chủ sở hữu'), RE = B('- Lợi nhuận để lại và các quỹ');
  const AR = ['+ Phải thu khách hàng', '+ Trả trước cho người bán', '+ Phải thu khác (nội bộ, 138, 141, 244)'].map(B), arB = AR.reduce((q, r) => q + (r.B || 0), 0), arC = AR.reduce((q, r) => q + (r.C || 0), 0), INV = B('+ Hàng tồn kho');
  const NET = pl.get('net') || { auto: [0, 0, 0] }, PAT = pl.get('pat') || { auto: [0, 0, 0] }, F = R.fa || { cost: 0, dep: 0, inc: 0 }, SUP = ' [Đơn vị bổ sung nguyên nhân / đánh giá]';
  const G = {
    ta: [[`Tổng tài sản tại thời điểm ${den} đạt ${nf(TA.B)} triệu USD, ${ch(TA.B, TA.C)} so với thời điểm đầu năm (${nf(TA.C)} triệu USD).`]],
    fa1: [[`Tổng giá trị ghi nhận tăng tài sản cố định trong ${K.S}: ${nf(F.inc)} triệu USD`]], fa2: [[`Tổng nguyên giá tài sản cố định đến ${den}: ${nf(F.cost)} triệu USD`]],
    fa3: [[`Tổng khấu hao luỹ kế đến ${den}: ${nf(F.dep)} triệu USD`]], fa4: [[`Giá trị còn lại tại thời điểm ${den}: ${nf(F.cost - F.dep)} triệu USD`]],
    ap: [['Quản lý nợ phải trả: ', { b: 1 }], [`Tổng số dư ${nf(TL.B)} triệu USD, ${ch(TL.B, TL.C)} so với đầu năm. Trong đó: nợ ngắn hạn ${nf(SL.B)} triệu USD, ${ch(SL.B, SL.C)} so với đầu năm; nợ quá hạn (từ 6 tháng) ${nf(OD.B)} triệu USD.`], [SUP, { y: 1 }]],
    ar: [['Quản lý nợ phải thu: ', { b: 1 }], [`Tại thời điểm ${den}, tổng số nợ phải thu (phải thu khách hàng, trả trước người bán, phải thu khác) đạt ${nf(arB)} triệu USD, ${ch(arB, arC)} so với đầu năm; trong đó phải thu khách hàng ${nf(AR[0].B)} triệu USD.`], [' [Đơn vị bổ sung nguyên nhân, nợ khó đòi / quá hạn và trích lập dự phòng]', { y: 1 }]],
    inv: [['Quản lý hàng tồn kho: ', { b: 1 }], [`Tổng giá trị hàng tồn kho tại thời điểm ${den} là ${nf(INV.B)} triệu USD, ${ch(INV.B, INV.C)} so với thời điểm đầu năm.`], [' [Đơn vị bổ sung nguyên nhân, hàng chậm luân chuyển và dự phòng giảm giá]', { y: 1 }]],
    eq: [['Biến động vốn chủ sở hữu của dự án tại nước ngoài: ', { b: 1 }], [`Tính đến ngày ${den}, tổng vốn chủ sở hữu đạt ${nf(EQ.B)} triệu USD, ${ch(EQ.B, EQ.C)} so với đầu năm; vốn góp chủ sở hữu ${nf(CAP.B)} triệu USD, lợi nhuận để lại và các quỹ ${nf(RE.B)} triệu USD.`], [SUP, { y: 1 }]],
    rev: [[`Doanh thu bán hàng và cung cấp dịch vụ ${K.L} đạt ${nf(NET.auto[2])} triệu USD, ${ch(NET.auto[2], NET.auto[1])} so với cùng kỳ năm ${y - 1} và ${ch(NET.auto[2], NET.auto[0])} so với cùng kỳ năm ${y - 2}; lợi nhuận sau thuế đạt ${nf(PAT.auto[2])} triệu USD, ${ch(PAT.auto[2], PAT.auto[1])} so với cùng kỳ năm ${y - 1} và ${ch(PAT.auto[2], PAT.auto[0])} so với cùng kỳ năm ${y - 2}.`], [' [Đơn vị bổ sung % hoàn thành kế hoạch và đánh giá]', { y: 1 }]] };
  x = x.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => { const m = txt(p).trim().match(/^\{\{G:(\w+)\}\}$/); return m && G[m[1]] ? setRuns(p, G[m[1]]) : p; });
  const T = { '{{KYU}}': K.U, '{{KYL}}': K.L, '{{KYS}}': K.S, '{{KYS0}}': K.S0, '{{DEN}}': den, '{{Y}}': String(y), '{{Y1}}': String(y - 1), '{{Y2}}': String(y - 2) };
  x = x.replace(/\{\{(KYU|KYL|KYS0|KYS|DEN|Y1|Y2|Y)\}\}/g, m => esc(T[m]));
  f.content = Buffer.from(x, 'utf8'); f.size = f.content.length;
  // điền bảng bằng hàm fill (bảng tình hình tài chính, bảng SXKD; bảng khác bôi vàng sẵn trong mẫu)
  const mid = Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
  return fill(mid, R, { tablesOnly: true }).buf;
}
module.exports = { fill, build, periodLbl };
