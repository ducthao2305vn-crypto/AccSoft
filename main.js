const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { open } = require('./engine/db');
const { make } = require('./engine/queries');
const R = require('./engine/reports');
const mailer = require('./mailer');
const log = require('./engine/log');
const { RULES_VERSION } = require('./engine/rules');
const firstLine = m => String(m || '').split('\n')[0];

let dbHandle = null, win, Q, dbFile, busy = false, qw = null, qSeq = 0;
const qPending = new Map();
// Gửi truy vấn sang worker thường trực → tiến trình chính (cửa sổ) không bao giờ bị khoá
function qa(name, ...args) {
  return new Promise((resolve, reject) => { const id = ++qSeq; qPending.set(id, { resolve, reject, name, t: Date.now() }); qw.postMessage({ id, name, args }); });
}
function startQueryWorker() {
  qw = new Worker(path.join(__dirname, 'engine', 'qworker.js'), { workerData: { dbPath: dbFile, cache: READ } });
  qw.on('message', m => { const p = qPending.get(m.id); if (!p) return; qPending.delete(m.id);
    const ms = Date.now() - p.t; if (ms > 3000) log.info(`Truy vấn chậm "${p.name}": ${ms} ms`);
    if (m.ok) p.resolve(m.result); else p.reject(Object.assign(new Error(m.error), { stack: m.stack })); });
  qw.on('error', e => { log.error('Worker truy vấn lỗi', e); for (const p of qPending.values()) p.reject(e); qPending.clear(); startQueryWorker(); });
}
const send = (ch, m) => win && !win.isDestroyed() && win.webContents.send(ch, m);

// Chạy một tác vụ ghi nặng trong worker; tiến độ được đẩy lên giao diện
function runTask(task, args, label) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'engine', 'worker.js'), { workerData: { dbPath: dbFile, task, args } });
    w.on('message', m => {
      if (m.type === 'done' || m.type === 'error') qw && qw.postMessage({ invalidate: true }); // dữ liệu đã đổi → bỏ bộ nhớ đệm truy vấn
      if (m.type === 'progress') send('progress', { label, ...m });
      else if (m.type === 'done') resolve(m.result);
      else if (m.type === 'error') reject(Object.assign(new Error(m.error), { stack: m.stack || m.error }));
    });
    w.on('error', e => { log.error(`Worker ${task} lỗi`, e); reject(e); });
  });
}
async function exclusive(fn) {
  if (busy) throw new Error('Đang có tác vụ khác chạy, vui lòng đợi.');
  busy = true;
  try { return await fn(); } finally { busy = false; send('progress', { done: true }); }
}

async function importFiles(files) {
  return exclusive(async () => {
    const out = []; let failed = false;
    for (const file of files) {
      const name = path.basename(file);
      const mb = (fs.statSync(file).size / 1048576).toFixed(1);
      try {
        const r = await runTask('import', { file, name }, `Đang nạp ${name} (${mb} MB)`);
        let replace = false, mode = 'new';
        if (r.conflicts.length) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'question', buttons: ['Thay thế dữ liệu các tháng này', 'Gộp – giữ dữ liệu cũ, chỉ thêm bút toán chưa có', 'Huỷ, bỏ qua file'], defaultId: 0, cancelId: 2,
            title: 'Tháng đã có dữ liệu', message: `${name}: các tháng ${r.conflicts.join(', ')} đã có dữ liệu.`,
            detail: 'Thay thế: xoá dữ liệu cũ của các tháng này rồi dùng dữ liệu mới.\nGộp: dùng khi một tháng nằm ở 2 file (vd file kết thúc giữa tháng) – chỉ thêm bút toán chưa có (so khớp chứng từ + line + TK + số tiền).\nTrạng thái & ghi chú xử lý lỗi được giữ nếu bút toán không đổi.',
          });
          if (response === 1) mode = 'merge';
          if (response === 2) { await runTask('cancel', { importId: r.importId }, 'Đang huỷ'); log.info(`Bỏ qua ${name} (tháng trùng)`); out.push(`– ${name}: bỏ qua`); continue; }
          if (mode !== 'merge') { replace = true; mode = 'replace'; }
        }
        const fin = await runTask('finalize', { importId: r.importId, mode }, 'Đang hoàn tất');
        const msg = `${(mode === 'merge' ? fin.kept : r.rows).toLocaleString('vi')} dòng · ${r.months.join(', ')} · ${Math.round(r.secs)} giây` + (mode === 'merge' ? ` · gộp: bỏ ${fin.merged.toLocaleString('vi')} bút toán đã có` : mode === 'replace' ? ' · thay thế tháng trùng' : '');
        log.info(`Nạp ${name} (${mb} MB) thành công (chưa phân tích): ${msg}`, { file });
        out.push(`✓ ${name}: ${msg}`);
      } catch (e) { failed = true; log.error(`Nạp ${name} (${mb} MB) thất bại`, e, { file }); out.push(`✗ ${name}: LỖI – ${firstLine(e.message)}`); }
    }
    if (out.some(x => x.startsWith('✓'))) out.push('', 'Dữ liệu đã nạp, CHƯA phân tích. Chọn kỳ rà soát rồi bấm "Phân tích dữ liệu" để rà soát lỗi.');
    if (failed) out.push('', 'Chi tiết lỗi đã ghi vào nhật ký: ' + log.file(), '(menu Tệp → Mở nhật ký lỗi)');
    return out;
  });
}

async function enrichFiles(files) {
  return exclusive(async () => {
    const out = []; let failed = false;
    for (const file of files) {
      const name = path.basename(file), mb = (fs.statSync(file).size / 1048576).toFixed(1);
      try {
        const r = await runTask('enrich', { file, name }, `Đang bổ sung thông tin hàng tồn kho từ ${name} (${mb} MB)`);
        log.info(`Bổ sung từ ${name}: ${r.rows} dòng, khớp ${r.matched}, cập nhật ${r.updated}, không tìm thấy ${r.notFound}, trùng khoá ${r.ambiguous}, bỏ qua ${r.skipped}`, { file, samples: r.samples });
        out.push(`✓ ${name}: ${r.rows.toLocaleString('vi')} dòng · khớp ${r.matched.toLocaleString('vi')} · cập nhật ${r.updated.toLocaleString('vi')} bút toán` +
          (r.notFound ? ` · ${r.notFound.toLocaleString('vi')} dòng không tìm thấy (xem nhật ký)` : '') + (r.ambiguous ? ` · ${r.ambiguous} dòng trùng khoá` : '') + ` · ${Math.round(r.secs)} giây`);
        if (r.notFound) failed = true;
      } catch (e) { failed = true; log.error(`Bổ sung từ ${name} thất bại`, e, { file }); out.push(`✗ ${name}: LỖI – ${firstLine(e.message)}`); }
    }
    if (failed) out.push('', 'Chi tiết: ' + log.file());
    return out;
  });
}

/* ---------- Sao lưu / khôi phục ---------- */
const backupDir = () => path.join(path.dirname(dbFile), 'backups');
async function backupNow(reason = 'thu-cong') {
  fs.mkdirSync(backupDir(), { recursive: true });
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const file = path.join(backupDir(), `accsoft-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${reason}.db`);
  send('progress', { label: 'Đang sao lưu cơ sở dữ liệu…' });
  await qa('backup', file);
  // giữ 10 bản gần nhất
  const files = fs.readdirSync(backupDir()).filter(f => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 10))) try { fs.unlinkSync(path.join(backupDir(), f)); } catch (e) { /* bỏ qua */ }
  log.info('Đã sao lưu: ' + file);
  return file;
}
function listBackups() {
  try { return fs.readdirSync(backupDir()).filter(f => f.endsWith('.db')).sort().reverse().map(f => { const st = fs.statSync(path.join(backupDir(), f)); return { file: path.join(backupDir(), f), name: f, size: st.size, at: st.mtime.toISOString() }; }); }
  catch (e) { return []; }
}
async function restoreBackup(file) {
  const { response } = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Khôi phục và khởi động lại', 'Huỷ'], defaultId: 1, cancelId: 1,
    title: 'Khôi phục dữ liệu', message: 'Khôi phục CSDL từ bản sao lưu?', detail: path.basename(file) + '\n\nDữ liệu hiện tại được sao lưu trước khi thay thế. Ứng dụng sẽ khởi động lại.' });
  if (response !== 0) return false;
  await backupNow('truoc-khoi-phuc');
  log.info('Khôi phục từ ' + file);
  try { await qw.terminate(); } catch (e) { /* bỏ qua */ }
  try { Q && Q.close && Q.close(); } catch (e) { /* bỏ qua */ }
  try { dbHandle.close(); } catch (e) { /* bỏ qua */ }
  for (const ext of ['-wal', '-shm']) try { fs.unlinkSync(dbFile + ext); } catch (e) { /* không có */ }
  fs.copyFileSync(file, dbFile);
  app.relaunch(); app.exit(0);
  return true;
}

/* ---------- Số dư đầu kỳ ---------- */
function openingTemplate() {
  return R.book([['So du dau ky', [
    { 'Tài khoản': '131', 'Đối tượng': 'VTL_CUS_001_KHACH HANG A', 'Hợp đồng': '01/2025/HD', 'Đề nghị tạm ứng': '', 'Khoản mục': '', 'Mặt hàng': '', 'Ngày số dư': '31/12/2014', 'Hạn thanh toán': '31/01/2015', 'Dư Nợ': 12000, 'Dư Có': 0, 'Số lượng': '', 'Diễn giải': 'VÍ DỤ – xoá dòng này' },
    { 'Tài khoản': '331', 'Đối tượng': 'VTL_VEN_001_NHA CUNG CAP B', 'Hợp đồng': '05/2014/HD', 'Đề nghị tạm ứng': '', 'Khoản mục': '', 'Mặt hàng': '', 'Ngày số dư': '31/12/2014', 'Hạn thanh toán': '', 'Dư Nợ': 0, 'Dư Có': 8500, 'Số lượng': '', 'Diễn giải': 'VÍ DỤ – xoá dòng này' },
    { 'Tài khoản': '1411', 'Đối tượng': 'VTL_HOEMP000001_NGUYEN VAN A', 'Hợp đồng': '', 'Đề nghị tạm ứng': 'VTL_HOMTA14120001', 'Khoản mục': '', 'Mặt hàng': '', 'Ngày số dư': '31/12/2014', 'Hạn thanh toán': '', 'Dư Nợ': 500, 'Dư Có': 0, 'Số lượng': '', 'Diễn giải': 'VÍ DỤ – xoá dòng này' },
    { 'Tài khoản': '15211', 'Đối tượng': '', 'Hợp đồng': '', 'Đề nghị tạm ứng': '', 'Khoản mục': '', 'Mặt hàng': '000086_Optical Patch Cord', 'Ngày số dư': '31/12/2014', 'Hạn thanh toán': '', 'Dư Nợ': 320, 'Dư Có': 0, 'Số lượng': 40, 'Diễn giải': 'VÍ DỤ – xoá dòng này' },
    { 'Tài khoản': '335', 'Đối tượng': 'VTL_VEN_002_NHA CUNG CAP C', 'Hợp đồng': '', 'Đề nghị tạm ứng': '', 'Khoản mục': 'E17.1.7.1.5_BTS cell site electric', 'Mặt hàng': '', 'Ngày số dư': '31/12/2014', 'Hạn thanh toán': '', 'Dư Nợ': 0, 'Dư Có': 1500, 'Số lượng': '', 'Diễn giải': 'VÍ DỤ – xoá dòng này' },
  ]], ['Huong dan', [
    { 'Cột': 'Tài khoản', 'Bắt buộc': 'Có', 'Ghi chú': 'Mã TK chi tiết hoặc tổng hợp (131, 331, 1411, 15211, 335…)' },
    { 'Cột': 'Đối tượng', 'Bắt buộc': 'Nên có', 'Ghi chú': 'Ghi đúng như cột Business Partner của ERP để khớp với phát sinh' },
    { 'Cột': 'Hợp đồng / Đề nghị tạm ứng / Khoản mục / Mặt hàng', 'Bắt buộc': 'Tuỳ', 'Ghi chú': 'Để phân tích công nợ theo hợp đồng, tạm ứng theo đề nghị, 335 theo khoản mục, tồn kho theo mặt hàng' },
    { 'Cột': 'Ngày số dư', 'Bắt buộc': 'Có', 'Ghi chú': 'Ngày chốt số dư (thường là ngày cuối kỳ trước khi dữ liệu phát sinh bắt đầu); dd/mm/yyyy' },
    { 'Cột': 'Hạn thanh toán', 'Bắt buộc': 'Không', 'Ghi chú': 'Dùng để tính tuổi nợ; trống thì tính từ Ngày số dư + hạn mặc định' },
    { 'Cột': 'Dư Nợ / Dư Có', 'Bắt buộc': 'Có', 'Ghi chú': 'Một trong hai cột có số dương' },
    { 'Cột': 'Dòng ví dụ', 'Bắt buộc': '', 'Ghi chú': 'Dòng có Diễn giải bắt đầu bằng "VÍ DỤ" sẽ bị bỏ qua khi nạp' },
  ]]]);
}

/* ---------- Báo cáo tổng hợp rủi ro (PDF 1–2 trang) ---------- */
async function riskPdf() {
  const rp = await qa('reviewPeriod'), st = await qa('analysisStatus');
  const [ov, rep, staff, ag, inv, varc, rec, acc, pre] = await Promise.all([qa('overview'), qa('report'), qa('deepStaff', rp.from, rp.to),
    qa('aging', (await qa('overview')).dmax || new Date().toISOString().slice(0, 10), 30, 'l1', 'bp'), qa('inventory', (await qa('overview')).dmax || new Date().toISOString().slice(0, 10), 'product', 'l1'),
    qa('deepVariance', rp.to || '', 'tcost', 'exp'), qa('deepRecurring', rp.to || '', 12), qa('deepAccruals', (await qa('overview')).dmax), qa('deepPrepaid', (await qa('overview')).dmax)]);
  const { RULE_NAMES, GROUPS, GROUP } = R.ruleInfo();
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = v => v == null || isNaN(v) ? '' : Math.round(v).toLocaleString('en-US'), pc = v => isFinite(v) ? (v * 100).toFixed(1) + '%' : '–';
  const sum = k => rep.byRule.reduce((a, r) => a + r[k], 0), n = sum('n'), done = sum('fixed') + sum('ignore');
  const g = gg => rep.byRule.filter(r => GROUP[r.k] === gg).reduce((a, r) => a + r.n, 0);
  const pos = ag.items.filter(o => o.bal > 0), od90 = pos.reduce((a, o) => a + o.b[4] + o.b[5] + o.b[6], 0), tot = pos.reduce((a, o) => a + o.bal, 0);
  const ipos = inv.items.filter(o => o.bal > 0), i365 = ipos.reduce((a, o) => a + o.b[4] + o.b[5], 0), itot = ipos.reduce((a, o) => a + o.bal, 0);
  const period = !rp.from && !rp.to ? 'Toàn bộ dữ liệu' : `${rp.from || '…'} → ${rp.to || '…'}`;
  const K = (l, v, s, c = '#FA4700') => `<div class=k><div class=l>${l}</div><div class=v style="color:${c}">${v}</div><div class=s>${s || ''}</div></div>`;
  const html = `<!doctype html><html><head><meta charset=utf-8><style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#181D27;margin:0;font-size:11px}h1{font-size:20px;margin:0}h2{font-size:13px;margin:14px 0 6px;color:#A62900;border-bottom:2px solid #FFE6D6;padding-bottom:3px}
    .hd{background:linear-gradient(110deg,#D63600,#FA4700 60%,#FF6929);color:#fff;padding:16px 22px}.hd p{margin:4px 0 0;opacity:.9}.wrap{padding:6px 22px 16px}
    .ks{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.k{border:1px solid #E9EAEB;border-radius:8px;padding:8px 10px}.k .l{color:#535862}.k .v{font-size:18px;font-weight:700}.k .s{color:#717680;font-size:10px}
    table{width:100%;border-collapse:collapse}th{background:#FAFAFA;text-align:left;color:#414651;font-weight:600}th,td{border-bottom:1px solid #E9EAEB;padding:3px 5px}td.n,th.n{text-align:right}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.foot{color:#717680;font-size:9px;margin-top:10px}.red{color:#D92D20}</style></head><body>
    <div class=hd><h1>Báo cáo tổng hợp rủi ro hạch toán</h1><p>Kỳ rà soát: ${e(period)} · Dữ liệu ${e(ov.dmin || '')} → ${e(ov.dmax || '')} · Lập ngày ${new Date().toLocaleDateString('vi-VN')}${st.pending.length ? ` · <b>${st.pending.length} tháng chưa phân tích</b>` : ''}</p></div><div class=wrap>
    <h2>1. Kết quả rà soát</h2><div class=ks>${K('Cảnh báo trong kỳ', f(n), `${f(ov.high)} mức cao`)}${K('Sai sót nhân viên', f(g('staff')), 'lỗi thao tác nhập liệu', '#155EEF')}${K('Sai sót dễ bị kiểm toán', f(g('audit')), 'dấu hiệu kiểm toán chọn mẫu', '#7839EE')}${K('Đã xử lý', pc(done / n), `${f(sum('fixed'))} khắc phục · ${f(sum('ignore'))} không phải lỗi`, '#079455')}</div>
    <div class=two><div><h2>2. Top loại lỗi</h2><table><tr><th>Loại lỗi</th><th>Nhóm</th><th class=n>Số</th><th class=n>Cao</th><th class=n>Xong</th></tr>
      ${rep.byRule.slice(0, 12).map(r => `<tr><td>${e(RULE_NAMES[r.k] || r.k)}</td><td>${GROUP[r.k] === 'audit' ? 'Kiểm toán' : 'Nhân viên'}</td><td class=n>${f(r.n)}</td><td class="n red">${r.high || ''}</td><td class=n>${pc((r.fixed + r.ignore) / r.n)}</td></tr>`).join('')}</table></div>
    <div><h2>3. Nhân viên cần chú ý</h2><table><tr><th>Người nhập</th><th class=n>Điểm</th><th class=n>Lỗi/100 bt</th><th class=n>Cao</th><th>Lỗi lặp lại</th></tr>
      ${staff.items.filter(x => x.errors).slice(0, 10).map(x => `<tr><td>${e(String(x.u).split('_')[0])}</td><td class=n><b>${x.score}</b></td><td class=n>${x.rate.toFixed(1)}</td><td class="n red">${x.high || ''}</td><td>${e(x.repeat.slice(0, 2).map(r => RULE_NAMES[r.k]).join(', '))}</td></tr>`).join('')}</table></div></div>
    <h2>4. Công nợ, tồn kho, trích trước – phân bổ</h2><div class=ks>${K('Công nợ còn dư', f(tot), `quá hạn > 90 ngày: ${f(od90)} (${pc(od90 / tot)})`)}${K('Dư ngược chiều', f(ag.items.filter(o => o.bal < 0).length), 'đối tượng cần đối chiếu')}
      ${K('Hàng tồn > 1 năm', f(i365), `${pc(i365 / itot)} giá trị tồn`)}${K('335 / 242 cần xem', `${acc.items.filter(x => x.flags.length).length} / ${pre.items.filter(x => x.flags.length).length}`, 'trích trước / phân bổ có cảnh báo')}</div>
    <div class=two><div><h2>5. Biến động chi phí bất thường (${e(varc.ym || '')})</h2><table><tr><th>Khoản mục</th><th class=n>Kỳ này</th><th class=n>TB 12 tháng</th><th class=n>±%</th></tr>
      ${(varc.items || []).slice(0, 10).map(x => `<tr><td>${e(String(x.g).slice(0, 48))}</td><td class=n>${f(x.cur)}</td><td class=n>${f(x.avg)}</td><td class="n ${x.diff > 0 ? 'red' : ''}">${x.pct == null ? 'mới' : pc(x.pct)}</td></tr>`).join('') || '<tr><td colspan=4>Không có biến động vượt ngưỡng</td></tr>'}</table></div>
    <div><h2>6. Chi phí định kỳ thiếu / trùng kỳ</h2><table><tr><th>Khoản mục · đối tượng</th><th class=n>Thiếu</th><th class=n>Trùng</th></tr>
      ${(rec.items || []).slice(0, 10).map(x => `<tr><td>${e((x.t || '').slice(0, 30) + ' · ' + x.name.slice(0, 25))}</td><td class="n red">${x.missing.length || ''}</td><td class="n red">${x.double.length || ''}</td></tr>`).join('') || `<tr><td colspan=3>${e(rec.note || 'Không phát hiện')}</td></tr>`}</table></div></div>
    <div class=foot>AccSoft – báo cáo quản trị rủi ro nội bộ, không thay thế báo cáo kiểm toán. Số liệu theo dữ liệu ERP đã nạp và kết quả phân tích tại thời điểm lập.</div></div></body></html>`;
  const w = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  w.destroy();
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `AccSoft_BaoCaoRuiRo_${new Date().toISOString().slice(0, 10)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled) return null;
  fs.writeFileSync(filePath, pdf); shell.openPath(filePath);
  return filePath;
}

async function saveXlsx(defName, wb) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: defName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (canceled) return null;
  fs.writeFileSync(filePath, R.toBuffer(wb));
  shell.showItemInFolder(filePath);
  return filePath;
}

// Truy vấn đọc được phép gọi từ giao diện
const READ = ['meta', 'getThresholds', 'deepRecurring', 'deepVariance', 'deepAccruals', 'deepPrepaid', 'deepBenford', 'deepStaff', 'deepVendors', 'deepFx', 'finTrial', 'finBalance', 'finIncome', 'finCash', 'finNotes', 'getB09Info', 'deepReversal', 'accrualSource', 'ledger', 'plRange', 'plTrend', 'analysisRange', 'analysisStatus', 'reviewPeriod', 'inventory', 'analysis', 'analysisDrill', 'errors', 'errorGroups', 'errorFacets', 'errorDetail', 'overview', 'pl', 'cost', 'aging', 'report', 'todo', 'months', 'imports', 'mailLog', 'stats'];
const WRITE = ['setB09Info', 'setThresholds', 'setReviewPeriod', 'setReviews', 'setStatusWhere', 'setStatusDoc', 'setMonths', 'setAllMonths'];

// Thư mục chứa ứng dụng: bản Portable = nơi đặt file .exe; bản cài = thư mục cài; khi phát triển = thư mục mã nguồn
function appDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  return app.isPackaged ? path.dirname(process.execPath) : __dirname;
}
function writable(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, '.write-test'); fs.writeFileSync(t, ''); fs.unlinkSync(t); return true; } catch (e) { return false; }
}
// CSDL nằm trong <thư mục ứng dụng>/AccSoft_Data; nếu không ghi được (vd cài vào Program Files) thì dùng thư mục người dùng
function resolveDbFile() {
  const dataDir = path.join(appDir(), 'AccSoft_Data');
  const legacy = path.join(app.getPath('userData'), 'accsoft.db');
  if (!writable(dataDir)) return { file: legacy, fallback: true };
  const file = path.join(dataDir, 'accsoft.db');
  // Chuyển CSDL cũ (ở %APPDATA%) sang thư mục ứng dụng ở lần chạy đầu – bản cũ được giữ nguyên làm dự phòng
  if (!fs.existsSync(file) && fs.existsSync(legacy)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const old = new DatabaseSync(legacy); old.exec('PRAGMA wal_checkpoint(TRUNCATE)'); old.close();
      fs.copyFileSync(legacy, file);
      return { file, migratedFrom: legacy };
    } catch (e) { try { fs.unlinkSync(file); } catch (_) {} return { file: legacy, fallback: true, error: String(e.message || e) }; }
  }
  return { file };
}

let dbInfo = {};
async function init() {
  dbInfo = resolveDbFile();
  dbFile = dbInfo.file;
  log.init(path.join(path.dirname(dbFile), 'logs'));
  log.info(`Khởi động AccSoft ${app.getVersion()}`, { dbFile, appDir: appDir(), platform: process.platform, arch: process.arch, electron: process.versions.electron, packaged: app.isPackaged, ...dbInfo });
  const handle = (ch, fn) => ipcMain.handle(ch, async (...a) => { try { return await fn(...a); } catch (e) { log.error(`Lỗi khi xử lý "${ch}"`, e); throw e; } });
  const r = open(dbFile, { cleanup: true });
  dbHandle = r.db;
  Q = make(r.db);
  startQueryWorker();
  handle('q', (_e, name, ...args) => { if (!READ.includes(name) && !WRITE.includes(name)) throw new Error('Không hỗ trợ: ' + name); return qa(name, ...args); });
  handle('app:info', () => ({ version: app.getVersion(), dbFile, needRecheck: r.needRecheck, appDir: appDir(), ...dbInfo }));
  handle('db:openFolder', () => shell.showItemInFolder(dbFile));
  handle('import:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : importFiles(filePaths);
  });
  handle('import:files', (_e, files) => importFiles(files));
  handle('backup:now', () => exclusive(() => backupNow('thu-cong')));
  handle('backup:list', () => listBackups());
  handle('backup:restore', (_e, file) => restoreBackup(file));
  handle('backup:pick', async () => { const { canceled, filePaths } = await dialog.showOpenDialog(win, { defaultPath: backupDir(), filters: [{ name: 'AccSoft DB', extensions: ['db'] }] }); return canceled ? false : restoreBackup(filePaths[0]); });
  handle('opening:template', () => saveXlsx('AccSoft_MauSoDuDauKy.xlsx', openingTemplate()));
  handle('opening:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file số dư đầu kỳ (theo mẫu)', filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (canceled) return null;
    return exclusive(async () => { await backupNow('truoc-so-du-dau-ky'); const r = await runTask('opening', { file: filePaths[0], name: path.basename(filePaths[0]) }, 'Đang nạp số dư đầu kỳ');
      await runTask('buildAgg', {}, 'Đang cập nhật bảng tổng hợp'); log.info(`Nạp số dư đầu kỳ ${filePaths[0]}: ${r.rows} dòng`); return r; });
  });
  handle('report:pdf', () => riskPdf());
  handle('report:reversalErp', async (_e, keys, o) => {
    const lines = await qa('reversalLines', keys);
    if (!lines.length) throw new Error('Các khoản đã chọn không còn số trích treo để huỷ.');
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${o.date.slice(0, 7).replace('-', '.')}_HUY_TRICH_AccSoft.xls`, filters: [{ name: 'Excel 97-2003', extensions: ['xls'] }] });
    if (canceled) return null;
    fs.writeFileSync(filePath, R.XLSX.write(R.reversalErpBook(lines, o), { type: 'buffer', bookType: 'biff8' }));
    const chk = filePath.replace(/\.xls$/i, '') + '_DoiChieu.xlsx';
    fs.writeFileSync(chk, R.toBuffer(R.reversalCheckBook(lines, o)));
    log.info(`Xuất file huỷ trích ${filePath}: ${lines.length} dòng`); shell.showItemInFolder(filePath);
    return { file: filePath, check: chk, lines: lines.length, total: lines.reduce((s, r) => s + r.rev, 0) };
  });
  handle('report:accrueErp', async (_e, items, o) => { // items: [{id, amt, desc}]
    const src = new Map((await qa('accrualLinesByIds', items.map(x => x.id))).map(r => [r.id, r]));
    const lines = items.filter(x => src.has(x.id) && Math.abs(x.amt) > 0.004).map(x => ({ ...src.get(x.id), out: Math.round(x.amt * 100) / 100, outDesc: x.desc, per: x.per, dup: x.dup }));
    if (!lines.length) throw new Error('Chưa có dòng nào có số tiền.');
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${o.date.slice(0, 7).replace('-', '.')}_TRICH_TRUOC_AccSoft.xls`, filters: [{ name: 'Excel 97-2003', extensions: ['xls'] }] });
    if (canceled) return null;
    fs.writeFileSync(filePath, R.XLSX.write(R.reversalErpBook(lines, o), { type: 'buffer', bookType: 'biff8' }));
    const chk = filePath.replace(/\.xls$/i, '') + '_DoiChieu.xlsx';
    fs.writeFileSync(chk, R.toBuffer(R.accrueCheckBook(lines, o)));
    log.info(`Xuất file trích trước ${filePath}: ${lines.length} dòng`); shell.showItemInFolder(filePath);
    return { file: filePath, check: chk, lines: lines.length, total: lines.reduce((s, r) => s + r.out, 0) };
  });
  handle('report:fin', async (_e, p) => {
    const [tb, bs, pl, cf, nt, txt] = await Promise.all([qa('finTrial', p.from, p.to, p.level), qa('finBalance', p.from, p.to), qa('finIncome', p.from, p.to, p.cmpFrom, p.cmpTo), qa('finCash', p.from, p.to), qa('finNotes', p.from, p.to), qa('getB09Info')]);
    return saveXlsx(`AccSoft_BCTC_${(p.from || 'dau').replace('-', '')}-${(p.to || 'cuoi').replace('-', '')}.xlsx`, R.finBook(tb, bs, pl, p, cf, nt, txt || p.b09Def));
  });
  handle('report:accrual', async (_e, from, to) => saveXlsx(`AccSoft_TrichTruoc_HuyTrich_${new Date().toISOString().slice(0, 10)}.xlsx`, R.accrualBook(await qa('deepReversal', from, to))));
  handle('enrich:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file ERP chỉ gồm các dòng TK 151–158', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : enrichFiles(filePaths);
  });
  const TASK_LABEL = { deleteMonth: 'Đang xoá tháng', deleteImport: 'Đang xoá lần nạp', clear: 'Đang xoá dữ liệu', recheck: 'Đang phân tích lại toàn bộ dữ liệu', analyze: 'Đang phân tích dữ liệu' };
  handle('task', (_e, task, args) => exclusive(async () => {
    if (['deleteMonth', 'deleteImport', 'clear'].includes(task)) await backupNow('truoc-' + task); // tự sao lưu trước thao tác xoá
    const r = await runTask(task, args, TASK_LABEL[task]);
    if (task === 'analyze' || task === 'recheck') log.info(`Phân tích dữ liệu ${JSON.stringify(args)}: ${r.rows} dòng, ${r.months} tháng, ${Math.round(r.secs)} giây`);
    return r;
  }));
  // Xuất Excel (dữ liệu lấy qua worker truy vấn)
  handle('export:errors', async (_e, f, sort) => {
    const rows = (await qa('errors', f, sort, 0, 2e6)).rows;
    const by = {}; for (const e of rows) { const k = e.user + '|' + e.k; by[k] = (by[k] || 0) + 1; }
    const byUser = Object.entries(by).map(([k, n]) => { const [u, c] = k.split('|'); return { 'Người nhập': u, 'Mã lỗi': c, 'Số lượng': n }; });
    return saveXlsx('AccSoft_LoiNhapLieu.xlsx', R.errorsBook(rows, byUser));
  });
  handle('export:analysis', (_e, title, rows) => saveXlsx(`AccSoft_${title}.xlsx`, R.book([[title.slice(0, 31), rows]])));
  handle('export:inventory', async (_e, asOf, by, level, acc) => saveXlsx('AccSoft_TuoiHangTonKho.xlsx', R.inventoryBook((await qa('inventory', asOf, by, level)).items.filter(o => !acc || o.acc === acc))));
  handle('export:aging', async (_e, asOf, term, level, grp, acc, dim) => saveXlsx(`AccSoft_TuoiNo${dim === 'contract' ? '_HopDong' : dim === 'adv' ? '_TamUng' : dim === 'tcost' ? '_KhoanMuc' : ''}.xlsx`,
    R.agingBook((await qa('aging', asOf, term, level, dim)).items.filter(o => (!grp || o.grp === grp) && (!acc || o.acc === acc)), dim)));
  handle('export:report', async (_e, minSev, group) => saveXlsx('AccSoft_BaoCaoKiemTra.xlsx', R.reportBook(await qa('report'),
    (await qa('errors', { statusIn: ['fixed', 'ignore'] }, { k: 'user', d: 1 }, 0, 2e6)).rows, (await qa('errors', { minSev, group, statusIn: ['open', 'doing'] }, { k: 'user', d: 1 }, 0, 2e6)).rows)));
  handle('export:employee', async (_e, user, minSev, group) => saveXlsx(`AccSoft_CanKhacPhuc_${R.shortName(user)}.xlsx`, R.book([['Can khac phuc', (await qa('employeeErrors', user, minSev, 100000, group)).map(R.errRow)]])));
  // Email
  handle('mail:preview', async (_e, user, o) => { const rows = await qa('employeeErrors', user, o.minSev, 100000, o.group); return { subject: R.mailSubject(user), html: R.mailHtml(user, rows, o), count: rows.length }; });
  handle('smtp:get', () => mailer.getConfig(Q));
  handle('smtp:set', (_e, cfg) => mailer.setConfig(Q, cfg));
  handle('smtp:verify', () => mailer.verify(Q).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) })));
  handle('mail:send', async (_e, list, o) => {
    const msgs = [];
    for (const { user, to } of list) msgs.push(await (async () => {
      const rows = await qa('employeeErrors', user, o.minSev, 100000, o.group);
      return { user, rows, to, subject: R.mailSubject(user) + (o.test ? ' (THỬ)' : ''), html: R.mailHtml(user, rows, o),
        attachment: { name: `AccSoft_CanKhacPhuc_${R.shortName(user)}.xlsx`, base64: R.toBuffer(R.book([['Can khac phuc', rows.map(R.errRow)]])).toString('base64') },
        employee: user, count: rows.length };
    })());
    const res = await mailer.sendAll(Q, msgs);
    if (!o.test && o.mark) {
      const ok = new Set(res.filter(r => r.ok).map(r => r.to));
      await qa('setReviews', msgs.filter(m => ok.has(m.to)).flatMap(m => m.rows.filter(e => e.status === 'open')
        .map(e => ({ key: e.key, rule: e.k, doc: e.doc, status: 'doing', note: e.note || '', snapshot: JSON.stringify({ m: e.ym, amt: e.amt, desc: String(e.desc || '').slice(0, 200) }) }))));
    }
    return res;
  });
  handle('util:emailOf', (_e, u) => R.emailOf(u));
  handle('log:renderer', (_e, msg, stack) => log.error('Lỗi giao diện: ' + msg, stack));
  handle('log:open', () => shell.openPath(log.dir()));
  handle('log:file', () => log.file());
  // Không tự phân tích khi khởi động: tháng nào chưa phân tích (hoặc phân tích bằng bộ quy tắc cũ) sẽ được nhắc trên giao diện
  Q.setSetting('rules_version', String(RULES_VERSION));
  return Q.aggEmpty() ? 'agg' : false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1000, minHeight: 640, backgroundColor: '#FAFAFA',
    title: `AccSoft ${app.getVersion()} – Phân tích sổ hạch toán`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Tệp', submenu: [{ label: 'Mở nhật ký lỗi', click: () => log.dir() && shell.openPath(log.dir()) }, { role: 'reload', label: 'Tải lại' }, { type: 'separator' }, { role: 'quit', label: 'Thoát' }] },
  { label: 'Xem', submenu: [{ role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ gốc' },
    { type: 'separator' }, { role: 'togglefullscreen', label: 'Toàn màn hình' }, { role: 'toggleDevTools', label: 'Công cụ phát triển' }] },
]));

process.on('uncaughtException', e => log.error('Lỗi không bắt được (main)', e));
process.on('unhandledRejection', e => log.error('Promise bị từ chối không xử lý (main)', e));
app.whenReady().then(init).then(async needRecheck => {
  createWindow();
  // CSDL từ phiên bản cũ: tính lại bảng lỗi một lần
  if (needRecheck === 'agg') win.webContents.once('did-finish-load', () => exclusive(() => runTask('buildAgg', {}, 'Đang tạo bảng tổng hợp để báo cáo nhanh hơn (chỉ lần đầu)')).then(() => { log.info('Đã tạo bảng tổng hợp agg'); send('reload'); }).catch(e => log.error('Tạo bảng tổng hợp thất bại', e)));
  else if (needRecheck) win.webContents.once('did-finish-load', () => exclusive(() => runTask('recheck', {}, 'Đang rà soát lại dữ liệu theo bộ quy tắc mới')).then(() => { Q.setSetting('rules_version', String(RULES_VERSION)); log.info('Đã rà soát lại theo quy tắc phiên bản ' + RULES_VERSION); send('reload'); }).catch(e => { log.error('Nâng cấp CSDL thất bại', e); dialog.showErrorBox('AccSoft', firstLine(e.message) + '\n\nChi tiết: ' + log.file()); }));
}).catch(err => {
  log.error('Không khởi động được ứng dụng', err);
  dialog.showErrorBox('AccSoft – lỗi mở cơ sở dữ liệu', String(err && err.stack || err));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
