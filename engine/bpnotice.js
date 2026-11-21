'use strict';
// Thông báo tình hình sử dụng chi phí cho trưởng bộ phận (PDF + nội dung email)
const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = v => Math.round(+v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pc = (a, p) => Math.abs(p) > 0.004 ? (a / p * 100).toFixed(1) + '%' : '–';
const per = n => n.from === n.to ? `tháng ${n.to}/${n.year}` : `tháng ${n.from} – ${n.to}/${n.year}`;
const nm = s => String(s || '').replace(/^VTL_[A-Z]+_?\d+_/, '');

// Sắp các khoản mục theo cây ngân sách (DM_CP_PB): nhóm cha có cộng nhóm, bỏ nhóm / khoản mục bằng 0; khoản mục ngoài cây cho vào "Khác"
function treeRows(tree, rows) {
  const M = new Map(rows.map(x => [String(x.code).toUpperCase(), x])), used = new Set(), out = [], nz = x => Math.abs(x.P) + Math.abs(x.A) + Math.abs(x.PY) > 0.004;
  const T = (tree || []).filter(t => t.lvl > 0);
  if (!T.length) return rows.filter(nz).map(x => ({ ...x, stt: '', lvl: 1, leaf: true, name: x.vn || x.en }));
  for (let i = 0; i < T.length; i++) { const t = T[i];
    if (t.code) { const x = M.get(String(t.code).toUpperCase()); if (x && nz(x)) { used.add(String(t.code).toUpperCase()); out.push({ ...x, stt: t.stt, lvl: t.lvl, leaf: true, name: t.vn || x.vn || t.en, en: t.en || x.en }); } continue; }
    let P = 0, A = 0, PY = 0; for (let j = i + 1; j < T.length && T[j].lvl > t.lvl; j++) if (T[j].code) { const x = M.get(String(T[j].code).toUpperCase()); if (x) { P += x.P; A += x.A; PY += x.PY; } }
    if (Math.abs(P) + Math.abs(A) + Math.abs(PY) > 0.004) out.push({ stt: t.stt, lvl: t.lvl, leaf: false, name: t.vn, en: t.en, P, A, PY, remain: PY - A, over: A > P + 0.004 }); }
  const rest = rows.filter(x => !used.has(String(x.code).toUpperCase()) && nz(x));
  if (rest.length) { out.push({ stt: '', lvl: 1, leaf: false, name: 'KHÁC (mã không có trong sheet DM_CP_PB)', en: 'OTHERS', P: rest.reduce((a, x) => a + x.P, 0), A: rest.reduce((a, x) => a + x.A, 0), PY: rest.reduce((a, x) => a + x.PY, 0) }); out.at(-1).remain = out.at(-1).PY - out.at(-1).A;
    for (const x of rest) out.push({ ...x, stt: '', lvl: 2, leaf: true, name: x.vn || x.en }); }
  return out;
}
// Đoạn nhận xét chính (dùng cho PDF và email)
function summary(n) {
  const k = n.to - n.from + 1, lines = [];
  lines.push(`Kế hoạch chi phí ${k} tháng (${per(n)}): <b>${f(n.P)}</b> USD; thực hiện: <b>${f(n.A)}</b> USD (${pc(n.A, n.P)} kế hoạch kỳ).`);
  lines.push(n.over ? `<b style="color:#B42318">Chi phí đã VƯỢT kế hoạch kỳ ${f(n.A - n.P)} USD.</b>` : `Chi phí trong kế hoạch kỳ, còn chưa sử dụng ${f(n.P - n.A)} USD.`);
  lines.push(`Kế hoạch năm ${n.year}: <b>${f(n.PY)}</b> USD – đã thực hiện ${pc(n.A, n.PY)}. ` + (n.remain >= 0
    ? `Số còn được sử dụng cho ${n.monthsLeft} tháng còn lại: <b>${f(n.remain)}</b> USD${n.monthsLeft > 0 ? ` (bình quân ${f(n.remain / n.monthsLeft)} USD/tháng)` : ''}.`
    : `<b style="color:#B42318">Đã vượt kế hoạch cả năm ${f(-n.remain)} USD – không còn ngân sách cho ${n.monthsLeft} tháng còn lại.</b>`));
  return lines;
}
// Cảnh báo
function warnings(n) {
  const w = [];
  if (n.over) w.push(`Tổng chi phí kỳ vượt kế hoạch ${f(n.A - n.P)} USD (${pc(n.A, n.P)}).`);
  if (n.overRows.length) w.push(`${n.overRows.length} khoản mục vượt kế hoạch kỳ – chi tiết ở bảng "Khoản mục vượt kế hoạch".`);
  if (n.remain < 0) w.push(`Đã vượt kế hoạch cả năm ${f(-n.remain)} USD.`);
  else if (n.monthsLeft > 0 && n.PY > 0 && n.A / n.PY > (n.to / 12) + 0.1) w.push(`Tốc độ sử dụng nhanh hơn tiến độ thời gian (${pc(n.A, n.PY)} kế hoạch năm sau ${n.to}/12 tháng) – cần kiểm soát chi tiêu các tháng còn lại.`);
  if (n.outPlan.length) w.push(`${n.outPlan.length} khoản mục phát sinh chi phí nhưng không có trong kế hoạch.`);
  return w;
}
function pdfHtml(n, o = {}) {
  const W = warnings(n), num = x => `<td class=n>${f(x)}</td>`;
  const trow = x => `<tr class="${x.leaf ? (x.over ? 'ov' : '') : 'g g' + Math.min(x.lvl, 3)}"><td class=c>${e(x.stt)}</td><td>${x.leaf ? e(x.code) : ''}</td><td style="padding-left:${6 + (x.lvl - 1) * 12}px">${e(x.name)}</td>${num(x.P)}${num(x.A)}<td class="n${x.A - x.P > 0.5 ? ' neg' : ''}">${f(x.A - x.P)}</td><td class=n>${Math.abs(x.P) < 0.005 && x.A > 0.004 ? 'Ngoài KH' : pc(x.A, x.P)}</td>${num(x.PY)}<td class="n${x.remain < -0.5 ? ' neg' : ''}">${f(x.remain)}</td></tr>`;
  const table = (rows, total) => `<div class=unit>Đơn vị tính: USD</div><table><colgroup><col style="width:6%"><col style="width:11%"><col><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:7%"><col style="width:9%"><col style="width:9%"></colgroup>
    <thead><tr><th>STT</th><th>Mã khoản mục</th><th>Nhóm / khoản mục chi phí</th><th>KH kỳ</th><th>TH kỳ</th><th>Chênh lệch<br>(TH − KH)</th><th>% TH/KH</th><th>KH năm</th><th>Còn lại năm</th></tr>
    <tr class=ix>${['(1)', '(2)', '(3)', '(4)', '(5)', '(6)=(5)−(4)', '(7)=(5)/(4)', '(8)', '(9)=(8)−(5)'].map(x => `<th>${x}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(trow).join('')}</tbody>${total ? `<tfoot><tr class=tot><td colspan=3>TỔNG CỘNG</td>${num(n.P)}${num(n.A)}<td class=n>${f(n.A - n.P)}</td><td class=n>${pc(n.A, n.P)}</td>${num(n.PY)}<td class=n>${f(n.remain)}</td></tr></tfoot>` : ''}</table>`;
  let sec = 0; const R = ['I', 'II', 'III', 'IV', 'V', 'VI'], H = t => `<h2>${R[sec++]}. ${t}</h2>`;
  const today = new Date(), d2 = x => String(x).padStart(2, '0');
  return `<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#101828;line-height:1.45}
    .top{display:flex;justify-content:space-between;font-size:10.5px}.top .c{text-align:center}h1{font-size:16px;text-align:center;margin:14px 0 2px;letter-spacing:.3px}.sub{text-align:center;color:#475467;margin-bottom:10px}
    h2{font-size:12px;margin:14px 0 6px;padding-bottom:3px;border-bottom:1.5px solid #FA4700;color:#101828;page-break-after:avoid;break-after:avoid}
    .to{margin:6px 0 4px}.to td{border:none;padding:1px 6px 1px 0;font-size:11px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #D0D5DD;padding:3px 5px;font-size:10px;vertical-align:middle}
    thead{display:table-header-group}tfoot{display:table-row-group}tr{page-break-inside:avoid;break-inside:avoid}
    th{background:#FFF1EB;font-weight:600;text-align:center}tr.ix th{background:#FFF8F4;font-weight:400;font-style:italic;font-size:8.5px;color:#475467;padding:1px}
    td.n{text-align:right;white-space:nowrap}td.c{text-align:center}.neg{color:#B42318}
    tr.g td{font-weight:700}tr.g1 td{background:#FFE4D5;text-transform:uppercase}tr.g2 td{background:#FFF1EB}tr.g3 td{background:#FFF8F4;font-weight:600}tr.ov td{background:#FEF3F2}tr.tot td{font-weight:700;background:#F2F4F7}
    .unit{text-align:right;font-style:italic;font-size:9.5px;color:#475467;margin:2px 0}
    .k{display:flex;gap:8px;margin:6px 0}.k div{flex:1;border:1px solid #EAECF0;border-left:3px solid #FA4700;border-radius:4px;padding:5px 8px;font-size:10px;color:#475467}.k b{display:block;font-size:13px;color:#101828}
    ul{margin:2px 0 0 18px;padding:0}li{margin:2px 0}.box{border:1px solid #FDA29B;background:#FEF3F2;border-radius:4px;padding:6px 10px}.ok{border-color:#ABEFC6;background:#ECFDF3}
    .sig{display:flex;justify-content:flex-end;margin-top:18px;page-break-inside:avoid}.sig div{width:45%;text-align:center}.note{color:#475467;font-size:9.5px;margin-top:14px;border-top:1px solid #EAECF0;padding-top:5px}</style>
    <div class=top><div class=c><b>VIETTEL TIMOR UNIP, LDA</b><br><b>PHÒNG TÀI CHÍNH KẾ TOÁN</b><br>Số: ……/TB-TCKT</div><div class=c style="padding-top:14px"><i>Dili, ngày ${d2(today.getDate())} tháng ${d2(today.getMonth() + 1)} năm ${today.getFullYear()}</i></div></div>
    <h1>THÔNG BÁO</h1><div class=sub><b>Tình hình sử dụng chi phí ${per(n)}</b></div>
    <table class=to style="width:auto"><tr><td>Kính gửi:</td><td><b>${e(nm(n.head.sname) || 'Trưởng bộ phận')}</b>${n.head.position ? ' – ' + e(n.head.position) : ''}</td></tr><tr><td>Bộ phận:</td><td><b>${e(n.dept)} – ${e(n.deptName || '')}</b></td></tr></table>
    <p>Căn cứ kế hoạch chi phí năm ${n.year} đã được phê duyệt và số liệu hạch toán đến hết ${per(n).replace(/^tháng [\d ]+– /, 'tháng ')}, Phòng Tài chính kế toán thông báo tình hình sử dụng chi phí của bộ phận như sau:</p>
    ${H('TỔNG QUAN')}<div class=k><div>Kế hoạch kỳ<b>${f(n.P)}</b></div><div>Thực hiện kỳ<b style="color:${n.over ? '#B42318' : '#067647'}">${f(n.A)}</b>${pc(n.A, n.P)} KH kỳ</div><div>Kế hoạch năm ${n.year}<b>${f(n.PY)}</b>đã dùng ${pc(n.A, n.PY)}</div><div>Còn lại ${n.monthsLeft} tháng<b style="color:${n.remain < 0 ? '#B42318' : '#101828'}">${f(n.remain)}</b></div></div>
    <ul>${summary(n).map(x => `<li>${x}</li>`).join('')}</ul>
    ${H('ĐÁNH GIÁ VÀ CẢNH BÁO')}${W.length ? `<div class=box><ul>${W.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>` : `<div class="box ok">Chi phí của bộ phận nằm trong kế hoạch được duyệt.</div>`}
    ${n.overRows.length ? H('KHOẢN MỤC VƯỢT KẾ HOẠCH KỲ') + table(treeRows(n.tree, n.overRows), false) : ''}
    ${H('CHI TIẾT THEO NHÓM CHI PHÍ')}${table(treeRows(n.tree, n.rows), true)}
    ${H('ĐỀ NGHỊ')}<ul>${(o.note ? [e(o.note)] : ['Bộ phận rà soát, giải trình nguyên nhân các khoản mục vượt kế hoạch (nếu có);', 'Điều chỉnh kế hoạch chi tiêu các tháng còn lại trong phạm vi ngân sách được duyệt; trường hợp cần bổ sung ngân sách, lập tờ trình theo quy định;', 'Phản hồi Phòng Tài chính kế toán nếu số liệu chưa phù hợp trong vòng 05 ngày làm việc kể từ ngày nhận thông báo.']).map(x => `<li>${x}</li>`).join('')}</ul>
    <div class=sig><div><b>PHÒNG TÀI CHÍNH KẾ TOÁN</b><br><i style="font-size:9.5px">(Ký, ghi rõ họ tên)</i></div></div>
    <div class=note><b>Ghi chú:</b> Số thực hiện là chi phí TK 6xx/8xx (không gồm kết chuyển 911 và thuế TNDN) theo phòng ban sau điều chỉnh. Còn lại năm = KH năm − TH ${per(n)}. Số liệu làm tròn đến đơn vị USD.</div>`;
}
function mailHtml(n, body) {
  const W = warnings(n);
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#101828"><p>${String(body || '').replace(/\n/g, '<br>')}</p>
    <p>${summary(n).join('<br>')}</p>${W.length ? `<p style="color:#B42318"><b>Cảnh báo:</b><br>• ${W.map(e).join('<br>• ')}</p>` : ''}
    ${n.overRows.length ? `<table style="border-collapse:collapse;font-size:13px"><tr style="background:#FFF1EB"><th style="border:1px solid #D0D5DD;padding:4px 6px">Khoản mục vượt</th><th style="border:1px solid #D0D5DD;padding:4px 6px">KH kỳ</th><th style="border:1px solid #D0D5DD;padding:4px 6px">TH kỳ</th><th style="border:1px solid #D0D5DD;padding:4px 6px">Vượt</th></tr>${n.overRows.slice(0, 15).map(x => `<tr><td style="border:1px solid #D0D5DD;padding:4px 6px">${e(x.code)} ${e(x.vn || x.en)}</td><td style="border:1px solid #D0D5DD;padding:4px 6px;text-align:right">${f(x.P)}</td><td style="border:1px solid #D0D5DD;padding:4px 6px;text-align:right">${f(x.A)}</td><td style="border:1px solid #D0D5DD;padding:4px 6px;text-align:right;color:#B42318">${f(x.A - x.P)}</td></tr>`).join('')}</table>` : ''}
    <p style="color:#475467;font-size:12px">Chi tiết theo khoản mục trong file PDF đính kèm.</p></div>`;
}
const fileBase = n => `ThongBaoChiPhi_${String(n.dept).replace(/[^\w\-]+/g, '_')}_${n.year}_T${n.from}-T${n.to}`;
module.exports = { treeRows, pdfHtml, mailHtml, fileBase, per };
