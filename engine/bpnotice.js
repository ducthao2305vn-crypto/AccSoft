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
  for (let i = 0; i < T.length; i++) { const t = T[i];
    if (t.code) { const x = M.get(String(t.code).toUpperCase()); if (x && nz(x)) { used.add(String(t.code).toUpperCase()); out.push({ ...x, stt: t.stt, lvl: t.lvl, leaf: true, name: t.vn || x.vn || t.en, en: t.en || x.en }); } continue; }
    let P = 0, A = 0, PY = 0; for (let j = i + 1; j < T.length && T[j].lvl > t.lvl; j++) if (T[j].code) { const x = M.get(String(T[j].code).toUpperCase()); if (x) { P += x.P; A += x.A; PY += x.PY; } }
    if (Math.abs(P) + Math.abs(A) + Math.abs(PY) > 0.004) out.push({ stt: t.stt, lvl: t.lvl, leaf: false, name: t.vn, en: t.en, P, A, PY, remain: PY - A, over: A > P + 0.004 }); }
  const rest = rows.filter(x => !used.has(String(x.code).toUpperCase()) && nz(x));
  if (rest.length) { out.push({ stt: '', lvl: 1, leaf: false, name: 'KHÁC (chưa có trong cây ngân sách)', en: 'OTHERS', P: rest.reduce((a, x) => a + x.P, 0), A: rest.reduce((a, x) => a + x.A, 0), PY: rest.reduce((a, x) => a + x.PY, 0) }); out.at(-1).remain = out.at(-1).PY - out.at(-1).A;
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
  const W = warnings(n), row = (x, i) => `<tr${x.over ? ' class=ov' : ''}><td class=c>${i + 1}</td><td>${e(x.code)}</td><td>${e(x.vn || x.en)}</td><td class=n>${f(x.P)}</td><td class=n>${f(x.A)}</td><td class=n>${f(x.A - x.P)}</td><td class=n>${Math.abs(x.P) < 0.005 && x.A > 0.004 ? 'Ngoài KH' : pc(x.A, x.P)}</td><td class=n>${f(x.PY)}</td><td class=n>${f(x.remain)}</td></tr>`;
  const trow = x => `<tr class="${x.leaf ? (x.over ? 'ov' : '') : 'g' + Math.min(x.lvl, 3)}"><td>${e(x.stt)}</td><td>${x.leaf ? e(x.code) : ''}</td><td style="padding-left:${6 + (x.lvl - 1) * 10}px">${x.leaf ? '' : '<b>'}${e(x.name)}${x.leaf ? '' : '</b>'}</td><td class=n>${f(x.P)}</td><td class=n>${f(x.A)}</td><td class=n>${f(x.A - x.P)}</td><td class=n>${Math.abs(x.P) < 0.005 && x.A > 0.004 ? 'Ngoài KH' : pc(x.A, x.P)}</td><td class=n>${f(x.PY)}</td><td class=n>${f(x.remain)}</td></tr>`;
  const head = `<tr><th>STT</th><th>Mã</th><th>Khoản mục</th><th>KH kỳ</th><th>TH kỳ</th><th>Chênh lệch</th><th>% TH/KH</th><th>KH năm</th><th>Còn lại năm</th></tr>`;
  return `<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#101828}h1{font-size:17px;text-align:center;margin:4px 0}.c{text-align:center}.m{color:#475467}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #D0D5DD;padding:4px 6px}th{background:#FFF1EB;font-size:10.5px}td.n{text-align:right;white-space:nowrap}tr.ov td{background:#FEF3F2}tr.g1 td{background:#FFE4D5;font-weight:700}tr.g2 td{background:#FFF1EB;font-weight:600}tr.g3 td{background:#FFF8F4}
    .box{border:1px solid #FDA29B;background:#FEF3F2;border-radius:6px;padding:8px 12px;margin-top:10px}.ok{border-color:#ABEFC6;background:#ECFDF3}.k{display:flex;gap:8px;margin-top:10px}.k div{flex:1;border:1px solid #EAECF0;border-radius:6px;padding:6px 8px}.k b{display:block;font-size:14px}</style>
    <h1>THÔNG BÁO TÌNH HÌNH SỬ DỤNG CHI PHÍ</h1><div class="c m">Kỳ: ${per(n)} · Ngày lập: ${new Date().toLocaleDateString('vi-VN')}</div>
    <p>Kính gửi: <b>${e(nm(n.head.sname) || 'Trưởng bộ phận')}</b>${n.head.position ? ' – ' + e(n.head.position) : ''}<br>Bộ phận: <b>${e(n.dept)} – ${e(n.deptName || '')}</b></p>
    <div class=k><div>KH kỳ<b>${f(n.P)}</b></div><div>TH kỳ<b style="color:${n.over ? '#B42318' : '#067647'}">${f(n.A)}</b>${pc(n.A, n.P)}</div><div>KH năm<b>${f(n.PY)}</b></div><div>Còn lại ${n.monthsLeft} tháng<b style="color:${n.remain < 0 ? '#B42318' : '#101828'}">${f(n.remain)}</b></div></div>
    <p>${summary(n).join('<br>')}</p>
    ${W.length ? `<div class=box><b>⚠ Cảnh báo</b><ul style="margin:4px 0 0 18px;padding:0">${W.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>` : `<div class="box ok"><b>✓ Chi phí trong kế hoạch.</b></div>`}
    ${n.overRows.length ? `<h3 style="margin:14px 0 0">Khoản mục vượt kế hoạch kỳ</h3><table>${head.replace('Khoản mục','Nhóm / khoản mục')}${treeRows(n.tree, n.overRows).map(trow).join('')}</table>` : ''}
    <h3 style="margin:14px 0 0">Chi tiết theo nhóm quản trị và khoản mục</h3><table><tr><th>STT</th><th>Mã</th><th>Nhóm / khoản mục</th><th>KH kỳ</th><th>TH kỳ</th><th>Chênh lệch</th><th>% TH/KH</th><th>KH năm</th><th>Còn lại năm</th></tr>${treeRows(n.tree, n.rows).map(trow).join('')}<tr style="font-weight:700;background:#F9FAFB"><td colspan=3>Tổng cộng</td><td class=n>${f(n.P)}</td><td class=n>${f(n.A)}</td><td class=n>${f(n.A - n.P)}</td><td class=n>${pc(n.A, n.P)}</td><td class=n>${f(n.PY)}</td><td class=n>${f(n.remain)}</td></tr></table>
    <p class=m style="margin-top:10px;font-size:10.5px">Số thực hiện: chi phí TK 6xx/8xx (không gồm kết chuyển 911, thuế TNDN) theo phòng ban sau điều chỉnh. Còn lại năm = KH năm − TH ${per(n)}. ${e(o.note || 'Đề nghị bộ phận rà soát, giải trình các khoản mục vượt và điều chỉnh kế hoạch chi tiêu các tháng còn lại; phản hồi Phòng Tài chính nếu số liệu chưa đúng.')}</p>`;
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
