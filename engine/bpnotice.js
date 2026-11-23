'use strict';
// Thông báo tình hình sử dụng chi phí cho trưởng bộ phận (PDF + nội dung email) – tiếng Việt / tiếng Anh (o.lang = 'en')
const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = v => Math.round(+v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pc = (a, p) => Math.abs(p) > 0.004 ? (a / p * 100).toFixed(1) + '%' : '–';
const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const per = (n, en) => en ? (n.from === n.to ? `${MON[n.to]} ${n.year}` : `${MON[n.from]} – ${MON[n.to]} ${n.year}`) : (n.from === n.to ? `tháng ${n.to}/${n.year}` : `tháng ${n.from} – ${n.to}/${n.year}`);
const nm = s => String(s || '').replace(/^VTL_[A-Z]+_?\d+_/, '');
const T = {
  vi: { co: 'VIETTEL TIMOR UNIP, LDA', fin: 'PHÒNG TÀI CHÍNH KẾ TOÁN', no: 'Số: ……/TB-TCKT', date: d => `Dili, ngày ${d[0]} tháng ${d[1]} năm ${d[2]}`, title: 'THÔNG BÁO', sub: p => `Tình hình sử dụng chi phí ${p}`,
    to: 'Kính gửi:', dept: 'Bộ phận:', head: 'Trưởng bộ phận', intro: (n, p) => `Căn cứ kế hoạch chi phí năm ${n.year} đã được phê duyệt và số liệu hạch toán ${p}, Phòng Tài chính kế toán thông báo tình hình sử dụng chi phí của bộ phận như sau:`,
    s: ['TỔNG QUAN', 'ĐÁNH GIÁ VÀ CẢNH BÁO', 'KHOẢN MỤC VƯỢT KẾ HOẠCH KỲ', 'CHI TIẾT THEO NHÓM CHI PHÍ', 'ĐỀ NGHỊ'], kP: 'Kế hoạch kỳ', kA: 'Thực hiện kỳ', kY: y => `Kế hoạch năm ${y}`, kR: m => `Còn lại ${m} tháng`, ofP: 'KH kỳ', used: 'đã dùng',
    unit: 'Đơn vị tính: USD', cols: ['STT', 'Mã khoản mục', 'Nhóm / khoản mục chi phí', 'KH kỳ', 'TH kỳ', 'Chênh lệch<br>(TH − KH)', '% TH/KH', 'KH năm', 'Còn lại năm'], total: 'TỔNG CỘNG', out: 'Ngoài KH', ok: 'Chi phí của bộ phận nằm trong kế hoạch được duyệt.',
    req: ['Bộ phận rà soát, giải trình nguyên nhân các khoản mục vượt kế hoạch (nếu có);', 'Điều chỉnh kế hoạch chi tiêu các tháng còn lại trong phạm vi ngân sách được duyệt; trường hợp cần bổ sung ngân sách, lập tờ trình theo quy định;', 'Phản hồi Phòng Tài chính kế toán nếu số liệu chưa phù hợp trong vòng 05 ngày làm việc kể từ ngày nhận thông báo.'],
    sign: '(Ký, ghi rõ họ tên)', note: p => `<b>Ghi chú:</b> Số thực hiện là chi phí TK 6xx/8xx (không gồm kết chuyển 911 và thuế TNDN) theo phòng ban sau điều chỉnh. Còn lại năm = KH năm − TH ${p}. Số liệu làm tròn đến đơn vị USD.`,
    sum: (n, p, k) => [`Kế hoạch chi phí ${k} tháng (${p}): <b>${f(n.P)}</b> USD; thực hiện: <b>${f(n.A)}</b> USD (${pc(n.A, n.P)} kế hoạch kỳ).`,
      n.over ? `<b style="color:#B42318">Chi phí đã VƯỢT kế hoạch kỳ ${f(n.A - n.P)} USD.</b>` : `Chi phí trong kế hoạch kỳ, còn chưa sử dụng ${f(n.P - n.A)} USD.`,
      `Kế hoạch năm ${n.year}: <b>${f(n.PY)}</b> USD – đã thực hiện ${pc(n.A, n.PY)}. ` + (n.remain >= 0 ? `Số còn được sử dụng cho ${n.monthsLeft} tháng còn lại: <b>${f(n.remain)}</b> USD${n.monthsLeft > 0 ? ` (bình quân ${f(n.remain / n.monthsLeft)} USD/tháng)` : ''}.` : `<b style="color:#B42318">Đã vượt kế hoạch cả năm ${f(-n.remain)} USD – không còn ngân sách cho ${n.monthsLeft} tháng còn lại.</b>`)],
    w: { over: n => `Tổng chi phí kỳ vượt kế hoạch ${f(n.A - n.P)} USD (${pc(n.A, n.P)}).`, rows: k => `${k} khoản mục vượt kế hoạch kỳ – chi tiết tại Mục III.`, year: n => `Đã vượt kế hoạch cả năm ${f(-n.remain)} USD.`, fast: n => `Tốc độ sử dụng nhanh hơn tiến độ thời gian (${pc(n.A, n.PY)} kế hoạch năm sau ${n.to}/12 tháng) – cần kiểm soát chi tiêu các tháng còn lại.`, outp: k => `${k} khoản mục phát sinh chi phí nhưng không có trong kế hoạch.` },
    mail: { hi: 'Kính gửi Anh/Chị', fig: 'Số liệu chính', item: 'Chỉ tiêu', amt: 'Số tiền (USD)', top: 'Các khoản mục vượt kế hoạch lớn nhất', over: 'Vượt', att: 'Chi tiết theo nhóm chi phí và khoản mục xem tại file PDF đính kèm.', bye: 'Trân trọng,', more: k => `… và ${k} khoản mục khác (xem PDF).`, auto: 'Email được gửi từ hệ thống AccSoft – Phòng Tài chính kế toán.' } },
  en: { co: 'VIETTEL TIMOR UNIP, LDA', fin: 'FINANCE & ACCOUNTING DEPARTMENT', no: 'No.: ……/TB-TCKT', date: d => `Dili, ${MON[+d[1]]} ${+d[0]}, ${d[2]}`, title: 'NOTICE', sub: p => `Expense utilisation – ${p}`,
    to: 'To:', dept: 'Department:', head: 'Head of Department', intro: (n, p) => `Based on the approved ${n.year} expense budget and accounting data for ${p}, the Finance & Accounting Department would like to inform you of your department's expense utilisation as follows:`,
    s: ['OVERVIEW', 'ASSESSMENT AND WARNINGS', 'ITEMS EXCEEDING THE PERIOD BUDGET', 'DETAILS BY COST GROUP', 'REQUESTS'], kP: 'Period budget', kA: 'Period actual', kY: y => `${y} annual budget`, kR: m => `Remaining (${m} months)`, ofP: 'of period budget', used: 'used',
    unit: 'Unit: USD', cols: ['No.', 'Item code', 'Cost group / item', 'Budget', 'Actual', 'Variance<br>(Act − Bud)', '% Act/Bud', 'Annual budget', 'Remaining'], total: 'TOTAL', out: 'Unbudgeted', ok: 'Department expenses are within the approved budget.',
    req: ['Review and explain the reasons for items exceeding the budget (if any);', 'Adjust spending for the remaining months within the approved budget; if additional budget is required, submit a Statement in accordance with regulations;', 'Inform the Finance & Accounting Department of any discrepancies within 05 working days of receiving this notice.'],
    sign: '(Signature, full name)', note: p => `<b>Note:</b> Actual = expenses on accounts 6xx/8xx (excluding 911 closing entries and corporate income tax) by department after adjustments. Remaining = annual budget − actual ${p}. Figures rounded to USD.`,
    sum: (n, p, k) => [`Budget for ${k} month(s) (${p}): <b>${f(n.P)}</b> USD; actual: <b>${f(n.A)}</b> USD (${pc(n.A, n.P)} of period budget).`,
      n.over ? `<b style="color:#B42318">Expenses EXCEEDED the period budget by ${f(n.A - n.P)} USD.</b>` : `Expenses are within the period budget; ${f(n.P - n.A)} USD unused.`,
      `${n.year} annual budget: <b>${f(n.PY)}</b> USD – ${pc(n.A, n.PY)} used. ` + (n.remain >= 0 ? `Available for the remaining ${n.monthsLeft} month(s): <b>${f(n.remain)}</b> USD${n.monthsLeft > 0 ? ` (average ${f(n.remain / n.monthsLeft)} USD/month)` : ''}.` : `<b style="color:#B42318">The annual budget has been exceeded by ${f(-n.remain)} USD – no budget left for the remaining ${n.monthsLeft} month(s).</b>`)],
    w: { over: n => `Total period expenses exceed the budget by ${f(n.A - n.P)} USD (${pc(n.A, n.P)}).`, rows: k => `${k} item(s) exceed the period budget – see Section III.`, year: n => `The annual budget has been exceeded by ${f(-n.remain)} USD.`, fast: n => `Spending is ahead of time progress (${pc(n.A, n.PY)} of annual budget after ${n.to}/12 months) – please control spending in the remaining months.`, outp: k => `${k} item(s) incurred expenses without a budget.` },
    mail: { hi: 'Dear', fig: 'Key figures', item: 'Indicator', amt: 'Amount (USD)', top: 'Largest items exceeding the budget', over: 'Over', att: 'Details by cost group and item are in the attached PDF.', bye: 'Best regards,', more: k => `… and ${k} more item(s) (see PDF).`, auto: 'This email was sent from AccSoft – Finance & Accounting Department.' } } };
const L = o => T[o && o.lang === 'en' ? 'en' : 'vi'];
// Sắp các khoản mục theo cây ngân sách (DM_CP_PB): nhóm cha có cộng nhóm, bỏ nhóm / khoản mục bằng 0; khoản mục ngoài cây cho vào "Khác"
function treeRows(tree, rows, cat) {
  const M = new Map(rows.map(x => [String(x.code).toUpperCase(), x])), used = new Set(), out = [], nz = x => Math.abs(x.P) + Math.abs(x.A) + Math.abs(x.PY) > 0.004;
  const T = (tree || []).filter(t => t.lvl > 0);
  const pl = T.find(t => t.code && String(t.code).endsWith('.' + t.stt)), PFX = pl ? String(pl.code).slice(0, String(pl.code).length - pl.stt.length) : 'E17.1.';
  if (!T.length) return rows.filter(nz).map(x => ({ ...x, stt: '', lvl: 1, leaf: true, name: x.vn || x.en }));
  for (let i = 0; i < T.length; i++) { const t = T[i];
    if (t.code) { const x = M.get(String(t.code).toUpperCase()); if (x && nz(x)) { used.add(String(t.code).toUpperCase()); out.push({ ...x, stt: t.stt, lvl: t.lvl, leaf: true, name: t.vn || x.vn || t.en, en: x.en || t.en }); } continue; }
    let P = 0, A = 0, PY = 0; for (let j = i + 1; j < T.length && T[j].lvl > t.lvl; j++) if (T[j].code) { const x = M.get(String(T[j].code).toUpperCase()); if (x) { P += x.P; A += x.A; PY += x.PY; } }
    const gen = (cat && cat[(PFX + t.stt).toUpperCase()]) || t.en;
    if (Math.abs(P) + Math.abs(A) + Math.abs(PY) > 0.004) out.push({ stt: t.stt, lvl: t.lvl, leaf: false, name: t.vn, en: gen, P, A, PY, remain: PY - A, over: A > P + 0.004 }); }
  const rest = rows.filter(x => !used.has(String(x.code).toUpperCase()) && nz(x));
  if (rest.length) { out.push({ stt: '', lvl: 1, leaf: false, name: 'KHÁC (mã không có trong sheet DM_CP_PB)', en: 'OTHERS (codes not in DM_CP_PB)', P: rest.reduce((a, x) => a + x.P, 0), A: rest.reduce((a, x) => a + x.A, 0), PY: rest.reduce((a, x) => a + x.PY, 0) }); out.at(-1).remain = out.at(-1).PY - out.at(-1).A;
    for (const x of rest) out.push({ ...x, stt: '', lvl: 2, leaf: true, name: x.vn || x.en }); }
  return out;
}
function summary(n, o) { const t = L(o); return t.sum(n, per(n, t === T.en), n.to - n.from + 1); }
function warnings(n, o) {
  const t = L(o).w, w = [];
  if (n.over) w.push(t.over(n));
  if (n.overRows.length) w.push(t.rows(n.overRows.length));
  if (n.remain < 0) w.push(t.year(n));
  else if (n.monthsLeft > 0 && n.PY > 0 && n.A / n.PY > (n.to / 12) + 0.1) w.push(t.fast(n));
  if (n.outPlan.length) w.push(t.outp(n.outPlan.length));
  return w;
}
const CSS = `body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#101828;line-height:1.45}
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
    .sig{display:flex;justify-content:flex-end;margin-top:18px;page-break-inside:avoid}.sig div{width:45%;text-align:center}.note{color:#475467;font-size:9.5px;margin-top:14px;border-top:1px solid #EAECF0;padding-top:5px}`;
const today = () => { const d = new Date(), z = x => String(x).padStart(2, '0'); return [z(d.getDate()), z(d.getMonth() + 1), d.getFullYear()]; };
// Làm tròn đến USD ở từng khoản mục TRƯỚC khi cộng: nhóm / tổng cộng = tổng các số đã làm tròn, chênh lệch & còn lại tính từ số đã làm tròn → cộng tay khớp từng đồng
function rnd(n) {
  const R = x => Math.round(+x || 0), rows = n.rows.map(x => { const P = R(x.P), A = R(x.A), PY = R(x.PY); return { ...x, P, A, PY, remain: PY - A, over: A > P }; });
  const by = new Map(rows.map(x => [x.code, x])), P = rows.reduce((a, x) => a + x.P, 0), A = rows.reduce((a, x) => a + x.A, 0), PY = rows.reduce((a, x) => a + x.PY, 0);
  return { ...n, rows, overRows: n.overRows.map(x => by.get(x.code) || x).filter(x => x.over), outPlan: n.outPlan.map(x => by.get(x.code) || x), P, A, PY, remain: PY - A, over: A > P };
}
function pdfHtml(n0, o = {}) {
  const n = rnd(n0);
  const t = L(o), en = t === T.en, P = per(n, en), W = warnings(n, o), num = x => `<td class=n>${f(x)}</td>`, name = x => en ? (x.en || x.name) : x.name;
  const trow = x => `<tr class="${x.leaf ? (x.over ? 'ov' : '') : 'g g' + Math.min(x.lvl, 3)}"><td class=c>${e(x.stt)}</td><td>${x.leaf ? e(x.code) : ''}</td><td style="padding-left:${6 + (x.lvl - 1) * 12}px">${e(name(x))}</td>${num(x.P)}${num(x.A)}<td class="n${x.A - x.P > 0.5 ? ' neg' : ''}">${f(x.A - x.P)}</td><td class=n>${Math.abs(x.P) < 0.005 && x.A > 0.004 ? t.out : pc(x.A, x.P)}</td>${num(x.PY)}<td class="n${x.remain < -0.5 ? ' neg' : ''}">${f(x.remain)}</td></tr>`;
  const table = (rows, total) => `<div class=unit>${t.unit}</div><table><colgroup><col style="width:6%"><col style="width:11%"><col><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:7%"><col style="width:9%"><col style="width:9%"></colgroup>
    <thead><tr>${t.cols.map(x => `<th>${x}</th>`).join('')}</tr>
    <tr class=ix>${['(1)', '(2)', '(3)', '(4)', '(5)', '(6)=(5)−(4)', '(7)=(5)/(4)', '(8)', '(9)=(8)−(5)'].map(x => `<th>${x}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(trow).join('')}</tbody>${total ? `<tfoot><tr class=tot><td colspan=3>${t.total}</td>${num(n.P)}${num(n.A)}<td class=n>${f(n.A - n.P)}</td><td class=n>${pc(n.A, n.P)}</td>${num(n.PY)}<td class=n>${f(n.remain)}</td></tr></tfoot>` : ''}</table>`;
  let sec = 0; const R = ['I', 'II', 'III', 'IV', 'V', 'VI'], H = i => `<h2>${R[sec++]}. ${t.s[i]}</h2>`;
  return `<style>${CSS}</style>
    <div class=top><div class=c><b>${t.co}</b><br><b>${t.fin}</b><br>${t.no}</div><div class=c style="padding-top:14px"><i>${t.date(today())}</i></div></div>
    <h1>${t.title}</h1><div class=sub><b>${t.sub(P)}</b></div>
    <table class=to style="width:auto"><tr><td>${t.to}</td><td><b>${e(nm(n.head.sname) || t.head)}</b>${n.head.position ? ' – ' + e(n.head.position) : ''}</td></tr><tr><td>${t.dept}</td><td><b>${e(n.dept)} – ${e(n.deptName || '')}</b></td></tr></table>
    <p>${t.intro(n, P)}</p>
    ${H(0)}<div class=k><div>${t.kP}<b>${f(n.P)}</b></div><div>${t.kA}<b style="color:${n.over ? '#B42318' : '#067647'}">${f(n.A)}</b>${pc(n.A, n.P)} ${t.ofP}</div><div>${t.kY(n.year)}<b>${f(n.PY)}</b>${t.used} ${pc(n.A, n.PY)}</div><div>${t.kR(n.monthsLeft)}<b style="color:${n.remain < 0 ? '#B42318' : '#101828'}">${f(n.remain)}</b></div></div>
    <ul>${summary(n, o).map(x => `<li>${x}</li>`).join('')}</ul>
    ${H(1)}${W.length ? `<div class=box><ul>${W.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>` : `<div class="box ok">${t.ok}</div>`}
    ${n.overRows.length ? H(2) + table(treeRows(n.tree, n.overRows, n.catEn), false) : ''}
    ${H(3)}${table(treeRows(n.tree, n.rows, n.catEn), true)}
    ${H(4)}<ul>${(o.note ? [e(o.note)] : t.req).map(x => `<li>${x}</li>`).join('')}</ul>
    <div class=sig><div><b>${t.fin}</b><br><i style="font-size:9.5px">${t.sign}</i></div></div>
    <div class=note>${t.note(P)}</div>`;
}
// Email gửi kèm PDF: cùng bố cục (lời chào, số liệu chính, cảnh báo, khoản mục vượt lớn nhất, đề nghị, chữ ký)
function mailHtml(n0, body, o = {}) {
  const n = rnd(n0);
  const t = L(o), en = t === T.en, m = t.mail, W = warnings(n, o), P = per(n, en), b = 'border:1px solid #D0D5DD;padding:5px 8px', th = b + ';background:#FFF1EB;text-align:left', r = b + ';text-align:right;white-space:nowrap';
  const who = nm(n.head.sname) || t.head, top = n.overRows.slice(0, 10);
  const kv = [[t.kP, f(n.P)], [t.kA, `<b style="color:${n.over ? '#B42318' : '#067647'}">${f(n.A)}</b> (${pc(n.A, n.P)})`], [t.kY(n.year), f(n.PY)], [t.kR(n.monthsLeft), `<b style="color:${n.remain < 0 ? '#B42318' : '#101828'}">${f(n.remain)}</b>`]];
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#101828;line-height:1.5;max-width:720px">
    <div style="border-bottom:3px solid #FA4700;padding-bottom:6px;margin-bottom:12px"><b style="font-size:16px">${t.sub(P)}</b><br><span style="color:#475467;font-size:12px">${e(n.dept)} – ${e(n.deptName || '')}</span></div>
    <p>${m.hi} ${e(who)},</p>
    ${body ? `<p>${e(body).replace(/\n/g, '<br>')}</p>` : `<p>${t.intro(n, P)}</p>`}
    <p style="margin:14px 0 4px"><b>1. ${m.fig}</b></p>
    <table style="border-collapse:collapse;font-size:13px;min-width:420px"><tr><th style="${th}">${m.item}</th><th style="${th};text-align:right">${m.amt}</th></tr>${kv.map(([k, v]) => `<tr><td style="${b}">${k}</td><td style="${r}">${v}</td></tr>`).join('')}</table>
    <ul style="margin:8px 0 0 18px;padding:0">${summary(n, o).map(x => `<li>${x}</li>`).join('')}</ul>
    <p style="margin:14px 0 4px"><b>2. ${t.s[1].charAt(0) + t.s[1].slice(1).toLowerCase()}</b></p>
    ${W.length ? `<ul style="margin:0 0 0 18px;padding:0;color:#B42318">${W.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : `<p style="color:#067647;margin:0">${t.ok}</p>`}
    ${top.length ? `<p style="margin:14px 0 4px"><b>3. ${m.top}</b></p><table style="border-collapse:collapse;font-size:13px"><tr><th style="${th}">${t.cols[1]}</th><th style="${th}">${t.cols[2].replace(/<br>/g, ' ')}</th><th style="${th};text-align:right">${t.cols[3]}</th><th style="${th};text-align:right">${t.cols[4]}</th><th style="${th};text-align:right">${m.over}</th></tr>
      ${top.map(x => `<tr><td style="${b}">${e(x.code)}</td><td style="${b}">${e(en ? (x.en || x.vn) : (x.vn || x.en))}</td><td style="${r}">${f(x.P)}</td><td style="${r}">${f(x.A)}</td><td style="${r};color:#B42318">${f(x.A - x.P)}</td></tr>`).join('')}</table>${n.overRows.length > top.length ? `<p style="font-size:12px;color:#475467;margin:4px 0 0">${m.more(n.overRows.length - top.length)}</p>` : ''}` : ''}
    <p style="margin:14px 0 4px"><b>${top.length ? 4 : 3}. ${t.s[4].charAt(0) + t.s[4].slice(1).toLowerCase()}</b></p>
    <ul style="margin:0 0 0 18px;padding:0">${t.req.map(x => `<li>${x}</li>`).join('')}</ul>
    <p>${m.att}</p>
    <p style="margin-top:18px">${m.bye}<br><b>${en ? 'Finance & Accounting Department' : 'Phòng Tài chính kế toán'}</b><br>${t.co}</p>
    <p style="color:#98A2B3;font-size:11px;border-top:1px solid #EAECF0;padding-top:6px;margin-top:18px">${m.auto}</p></div>`;
}
const fileBase = (n, o) => `${o && o.lang === 'en' ? 'ExpenseNotice' : 'ThongBaoChiPhi'}_${String(n.dept).replace(/[^\w\-]+/g, '_')}_${n.year}_T${n.from}-T${n.to}`;
module.exports = { treeRows, pdfHtml, mailHtml, fileBase, per };
