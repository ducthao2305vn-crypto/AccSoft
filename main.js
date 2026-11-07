const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { open } = require('./engine/db');
const { make } = require('./engine/queries');
const R = require('./engine/reports');
const mailer = require('./mailer');
const log = require('./engine/log');
const { RULES_VERSION } = require('./engine/rules');
const firstLine = m => String(m || '').split('\n')[0];

let dbHandle = null, win, Q, dbFile, busy = false, qSeq = 0;
// Nhóm worker truy vấn (2–3 luồng): trang đang mở không phải xếp hàng sau truy vấn nặng của trang khác.
// Bộ nhớ đệm kết quả nằm ở đây (dùng chung cho mọi luồng), xoá khi dữ liệu thay đổi; truy vấn trùng đang chạy thì dùng chung kết quả.
// Khi có luồng rảnh, tính sẵn các trang hay mở (WARM) – không bao giờ chiếm luồng khi người dùng đang chờ.
const qPool = [], qQueue = [], qCache = new Map(), qInflight = new Map();
let qEpoch = 0;
const WARM = [['overview', []], ['errorFacets', []], ['analysisStatus', []], ['months', []], ['stats', []], ['reviewPeriod', []], ['report', []], ['pl', []]];
// Khoá bộ nhớ đệm: bỏ các ô lọc trống ('' / null) để { group: '', rule: '' } trùng với {} (dùng chung kết quả tính sẵn)
const qKey = (name, args) => name + '\u0000' + JSON.stringify(args, (k, v) => (k && (v === '' || v == null) ? undefined : v));
function qa(name, ...args) {
  const cacheable = READ.includes(name), key = cacheable ? qKey(name, args) : null;
  if (key && qCache.has(key)) return Promise.resolve(qCache.get(key));
  if (key && qInflight.has(key)) return qInflight.get(key);
  if (!cacheable) { qCache.clear(); qEpoch++; if (process.env.ACCSOFT_QDEBUG) fs.appendFileSync(process.env.ACCSOFT_QDEBUG, `${new Date().toISOString().slice(11, 23)} CLEAR by ${name}\n`); } // truy vấn ghi → kết quả cũ không còn đúng
  const p = new Promise((resolve, reject) => { qQueue.push({ id: ++qSeq, name, args, key, epoch: qEpoch, resolve, reject, t: Date.now() }); pump(); });
  if (key) { qInflight.set(key, p); p.finally(() => qInflight.delete(key)).catch(() => {}); }
  return p;
}
function pump() {
  for (const w of qPool) {
    if (w.job) continue;
    const job = qQueue.shift() || warmJob(); if (!job) return;
    w.job = job; w.worker.postMessage({ id: job.id, name: job.name, args: job.args });
  }
}
function warmJob() {
  if (qPool.filter(w => !w.job).length < 2 && qPool.length > 1) return null; // luôn chừa ít nhất một luồng rảnh cho người dùng
  // sau khi có Tổng quan: làm nóng thêm tuổi nợ, tồn kho, danh sách cần khắc phục với tham số mặc định của giao diện
  const ov = qCache.get(qKey('overview', [])), extra = ov && ov.dmax ? [['aging', [ov.dmax, 30, 'l1', 'bp']], ['inventory', [ov.dmax, 'product', 'l1']], ['todo', ['L', '']], ['errorGroups', [{}, 0, 200]], ['errors', [{}, { k: 'sev', d: 1 }, 0, 200]]] : [];
  for (const [name, args] of [...WARM, ...extra]) { const key = qKey(name, args);
    if (!qCache.has(key) && !qInflight.has(key)) { let ok; const p = new Promise(r => { ok = r; }); qInflight.set(key, p); p.finally(() => qInflight.delete(key));
      return { id: ++qSeq, name, args, key, epoch: qEpoch, resolve: ok, reject: ok, t: Date.now(), warm: true }; } }
  return null;
}
function startQueryWorker() {
  const n = Math.max(2, Math.min(3, os.cpus().length - 1));
  for (let i = 0; i < n; i++) addQueryWorker();
}
function addQueryWorker() {
  const w = { worker: new Worker(path.join(__dirname, 'engine', 'qworker.js'), { workerData: { dbPath: dbFile } }), job: null };
  w.worker.on('message', m => { const job = w.job; w.job = null; if (job && job.id === m.id) {
      const ms = Date.now() - job.t; if (ms > 3000 && !job.warm) log.info(`Truy vấn chậm "${job.name}": ${ms} ms`);
      if (process.env.ACCSOFT_QDEBUG) fs.appendFileSync(process.env.ACCSOFT_QDEBUG, `${new Date().toISOString().slice(11, 23)} ${job.warm ? 'warm ' : ''}${job.name} ${ms}ms queue=${qQueue.length} busy=${qPool.filter(x => x.job).length}\n`);
      if (m.ok) { if (job.key && job.epoch === qEpoch) { if (qCache.size > 400) qCache.delete(qCache.keys().next().value); qCache.set(job.key, m.result); } job.resolve(m.result); }
      else job.warm ? job.resolve(null) : job.reject(Object.assign(new Error(m.error), { stack: m.stack })); }
    pump(); });
  w.worker.on('error', e => { log.error('Worker truy vấn lỗi', e); if (w.job) w.job.reject(e); qPool.splice(qPool.indexOf(w), 1); addQueryWorker(); pump(); });
  qPool.push(w);
}
const invalidateQueries = () => { qCache.clear(); qEpoch++; setTimeout(pump, 300); };
const send = (ch, m) => win && !win.isDestroyed() && win.webContents.send(ch, m);

// Chạy một tác vụ ghi nặng trong worker; tiến độ được đẩy lên giao diện
function runTask(task, args, label) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'engine', 'worker.js'), { workerData: { dbPath: dbFile, task, args } });
    w.on('message', m => {
      if (m.type === 'done' || m.type === 'error') invalidateQueries(); // dữ liệu đã đổi → bỏ bộ nhớ đệm truy vấn
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
        const r = await runTask('enrich', { file, name }, `Đang bổ sung thông tin (mã vị trí, biển số xe, mã hàng, kho…) từ ${name} (${mb} MB)`);
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
  for (const w of qPool) try { await w.worker.terminate(); } catch (e) { /* bỏ qua */ }
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
  const XF = require('./engine/xlsfmt'), nm = path.basename(defName || filePath);
  if (XF.RAW.test(nm)) fs.writeFileSync(filePath, R.toBuffer(wb));
  else { const w2 = XF.prettify(wb, nm); fs.writeFileSync(filePath, XF.stylize(R.toBuffer(w2), w2)); }
  shell.showItemInFolder(filePath);
  return filePath;
}

// Truy vấn đọc được phép gọi từ giao diện
const READ = ['r88Exempt', 'apReport', 'apDetail', 'invPartners', 'invRules', 'invCustTx', 'entrySearch', 'meta', 'getThresholds', 'deepRecurring', 'deepVariance', 'deepAccruals', 'deepPrepaid', 'deepBenford', 'deepStaff', 'deepVendors', 'deepFx', 'acc335List', 'catList', 'catExport', 'catUnmatched', 'catStats', 'grpInternal', 'grpInternalRows', 'grpBalance', 'grpYears', 'grpCompanies', 'igAdjList', 'igDocLines', 'grpIntl', 'recvAnalyze', 'recvDetail', 'finTrial', 'finBalance', 'finIncome', 'finCash', 'invCustomers', 'invCompare', 'invCell', 'r88Report', 'r88Detail', 'r88Wrong', 'llScan', 'llDetail', 'advReport', 'advDetail', 'staffList', 'staffEmailOf', 'staffByUser', 'staffPartners', 'staffBpOf', 'staffOfBp', 'fcCompute', 'fcMonthly', 'fcInternal', 'locMatrix', 'locDetail', 'locList', 'locNorms', 'kqCompute', 'kqTpl', 'kqSources', 'kqMaps', 'dmDeptList', 'dmDeptSources', 'dmCostList', 'dmCostUnmatched', 'dmExport', 'faSearch', 'faContracts', 'faValues', 'faList', 'finPartnerTB', 'cfRows', 'cfAdjList', 'finDrill', 'finNotes', 'finStatus', 'getB09Info', 'deepReversal', 'accrualSource', 'ledger', 'plRange', 'plTrend', 'analysisRange', 'analysisStatus', 'reviewPeriod', 'inventory', 'analysis', 'analysisDrill', 'errors', 'errorGroups', 'errorFacets', 'errorDetail', 'overview', 'pl', 'cost', 'aging', 'report', 'todo', 'months', 'imports', 'mailLog', 'stats'];
const WRITE = ['r88SetExempt', 'apSetStatus', 'apSetContract', 'apSetPartner', 'invSetRules', 'invBccsNeg', 'invImport', 'invSetMap', 'r88SetWrong', 'advSetAr', 'advSetBackup', 'llSave', 'llClear', 'llImport', 'advSetRecon', 'advClearRecon', 'staffSetMap', 'staffAutoMatch', 'staffUpsert', 'staffRemove', 'staffImport', 'locSetNorms', 'kqSetAutoRev', 'kqAutoMap', 'kqSetMap', 'kqClearMap', 'kqSetParams', 'kqImportTpl', 'dmDeptUpsert', 'dmDeptRemove', 'dmDeptMapSet', 'dmDeptAutoMap', 'dmCostUpsert', 'dmCostRemove', 'dmImport', 'faSet', 'faRemove', 'faRebind', 'cfAdjSet', 'cfAdjRemove', 'igAdjSet', 'igAdjRemove', 'catUpsert', 'catRemove', 'catImport', 'setB09Info', 'setThresholds', 'setReviewPeriod', 'setReviews', 'setStatusWhere', 'setStatusDoc', 'setMonths', 'setAllMonths'];

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
  // Windows: sau alert/confirm cửa sổ mất focus bàn phím (không gõ được tới khi chuyển ứng dụng) → trả lại focus
  ipcMain.handle('win:refocus', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w && !w.isDestroyed()) { w.blur(); w.focus(); w.webContents.focus(); } return true; });
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
    const lines = await qa('reversalLines', keys, o.acc335 || '');
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
  handle('report:recv', async (_e, acc, asOf, term) => saveXlsx(`AccSoft_PhaiThu_${acc}_${(asOf || '').replace(/-/g, '')}.xlsx`, R.recvBook(await qa('recvAnalyze', acc, asOf, term))));
  // Danh mục đối tượng: nạp từ Excel (mẫu 2026.10_DANH_MUC_KHACH_HANG_TIMOR: Code_Name, Code, Name, Kind Of Customer, Code_NB, Name_NB)
  // Nạp danh mục phòng ban / khoản mục chi phí (tự tìm dòng tiêu đề có cột "Code")
  handle('kq:template', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file mẫu báo cáo KQKD', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }] });
    if (canceled) return null;
    const lines = require('./engine/kqkd').parseTemplate(R.XLSX, R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer', cellFormula: true }));
    if (!lines.some(l => l.kind === 'leaf')) throw new Error('File không đúng cấu trúc mẫu (cần cột Q là công thức quý: SUM(E:G))');
    return { ...(await qa('kqImportTpl', lines)), file: path.basename(filePaths[0]) };
  });
  handle('dm:import', async (_e, kind, mode) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: kind === 'dept' ? 'Chọn file danh mục phòng ban' : 'Chọn file danh mục khoản mục chi phí', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }] });
    if (canceled) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), aoa = R.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const h = aoa.findIndex(r => r.some(c => /^(code|mã)$/i.test(String(c).trim()))); if (h < 0) throw new Error('Không thấy cột "Code" trong file');
    const head = aoa[h].map(c => String(c).trim()), rows = aoa.slice(h + 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
    return { ...(await qa('dmImport', kind, rows, mode)), file: path.basename(filePaths[0]) };
  });
  handle('cat:import', async (_e, mode) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file danh mục đối tượng', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }] });
    if (canceled) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), rows = R.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
    const pick = (r, ...names) => { for (const k of Object.keys(r)) if (names.includes(norm(k))) return r[k] == null ? null : String(r[k]).trim(); return null; };
    const out = rows.map(r => { const code = pick(r, 'code', 'ma', 'madoituong'), name = pick(r, 'name', 'ten', 'tendoituong');
      return { code_name: pick(r, 'codename', 'matendoituong', 'matenten', 'doituong') || (code && name ? code + '_' + name : null), code, name,
        kind: pick(r, 'kindofcustomer', 'kind', 'nhom', 'loai', 'loaidoituong', 'nhomdoituong'), nb_code: pick(r, 'codenb', 'manoibo'), nb_name: pick(r, 'namenb', 'tennoibo', 'congtynoibo'), note: pick(r, 'note', 'ghichu') }; })
      .filter(r => r.code_name);
    if (!out.length) throw new Error('Không thấy cột "Code_Name" (hoặc Code + Name) trong file.');
    const r = await qa('catImport', out, mode === 'replace' ? 'replace' : 'merge'); log.info(`Nạp danh mục đối tượng ${filePaths[0]}: ${r.n} dòng (${mode})`); return { ...r, file: path.basename(filePaths[0]) };
  });
  // Xuất Excel nhiều sheet từ dữ liệu giao diện đã tính: sheets = [[tên sheet, [ {cột: giá trị} ]]]
  handle('xlsx:sheets', (_e, name, sheets) => saveXlsx(name, R.book(sheets)));
  handle('report:accrual', async (_e, from, to, acc) => saveXlsx(`AccSoft_TrichTruoc_HuyTrich_${acc || '335'}_${new Date().toISOString().slice(0, 10)}.xlsx`, R.accrualBook(await qa('deepReversal', from, to, acc || ''))));
  handle('enrich:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file ERP chỉ gồm các dòng TK 151–158', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : enrichFiles(filePaths);
  });
  const TASK_LABEL = { buildAgg: 'Đang tổng hợp sổ số dư theo tháng', deleteMonth: 'Đang xoá tháng', deleteImport: 'Đang xoá lần nạp', clear: 'Đang xoá dữ liệu', recheck: 'Đang phân tích lại toàn bộ dữ liệu', analyze: 'Đang phân tích dữ liệu' };
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
  handle('export:inventory', async (_e, asOf, by, level, acc, bp) => saveXlsx(`AccSoft_TuoiHangTonKho${bp ? '_' + String(bp).replace(/[^\w-]+/g, '_').slice(0, 40) : ''}.xlsx`, R.inventoryBook((await qa('inventory', asOf, by, level)).items.filter(o => (!acc || o.acc === acc) && (!bp || o.bp === bp)), by)));
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
  handle('util:emailOf', async (_e, u) => R.emailOf(u) || (await qa('staffEmailOf', u)) || '');
  handle('staff:import', async (_e, mode) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file danh sách nhân viên (LIST NAME ALL STAFF)', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }] });
    if (canceled) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer', cellDates: true }), aoa = R.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    return { ...(await qa('staffImport', aoa, mode)), file: path.basename(filePaths[0]) };
  });
  handle('inv:import', async (_e, mode) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file danh mục khách hàng + doanh thu theo hóa đơn', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }] });
    if (canceled) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer', cellDates: true }), sheets = {};
    for (const n of wb.SheetNames) sheets[n] = R.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
    return { ...(await qa('invImport', sheets, mode)), file: path.basename(filePaths[0]) };
  });
  handle('ll:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file thông tin chủ nhà trạm (số tài khoản, ngân hàng…)', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }] });
    if (canceled) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer', cellDates: true }), aoa = R.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    return { ...(await qa('llImport', aoa)), file: path.basename(filePaths[0]) };
  });
  // ---- Đối chiếu công nợ tạm ứng: biên bản (Excel) & gửi email cho từng nhân viên ----
  const advSheets = (d, co) => { const nm = d.staff ? d.staff.name : (d.partners[0] || d.key), f2 = v => Math.round((+v || 0) * 100) / 100;
    const head = [['BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ TẠM ỨNG'], [co || ''], [], ['Nhân viên', nm], ['Mã nhân viên', d.staff ? d.staff.code : ''], ['Phòng ban / Đơn vị', d.staff ? [d.staff.dept, d.staff.unit].filter(Boolean).join(' / ') : ''], ['Mã đối tượng công nợ', d.partners.join('; ')],
      ['Kỳ đối chiếu', `${d.from} → ${d.asOf}`], [], ['Số dư đầu kỳ', f2(d.open)], ['Tạm ứng trong kỳ', f2(d.dr)], ['Hoàn ứng / quyết toán trong kỳ', f2(d.cr)], ['Số dư cuối kỳ (nhân viên còn phải hoàn / quyết toán)', f2(d.close)], [],
      ['Xác nhận của nhân viên:  ☐ Đồng ý số dư trên      ☐ Không đồng ý – số dư theo nhân viên: ................................'], ['Ghi chú: ...........................................................................................'], [], ['Kế toán', '', '', 'Nhân viên']];
    return { name: nm, sheets: [['Bien ban doi chieu', head], ['Khoan tam ung con treo', d.items.map(x => ({ 'Ngày tạm ứng': x.d, 'Số chứng từ': x.doc, 'Đề nghị tạm ứng': x.ar || '', 'Nội dung': x.ds, 'Số tiền tạm ứng': f2(x.amt), 'Còn phải hoàn / quyết toán': f2(x.left), 'Số ngày': x.age }))],
      ['So chi tiet', d.book.map(x => ({ 'Ngày': x.d, 'Số chứng từ': x.doc, 'TK': x.acc, 'TK đối ứng': x.oacc, 'Đề nghị tạm ứng': x.ar || '', 'Nội dung': x.ds, 'Tạm ứng (Nợ)': f2(x.dr), 'Hoàn ứng (Có)': f2(x.cr), 'Số dư': f2(x.bal) }))]] };
  };
  const aoaBook = sheets => { const wb = R.XLSX.utils.book_new(); for (const [n, rows] of sheets) { const ws = Array.isArray(rows[0]) || !rows.length ? R.XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(không có)']]) : R.XLSX.utils.json_to_sheet(rows); R.XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); } return wb; };
  // Đối chiếu công nợ 331 theo hợp đồng: xuất Excel (tổng hợp + chi tiết) và/hoặc Word (xác nhận số dư) – nhiều đối tượng → chọn thư mục
  handle('ap:export', async (_e, bps, o, kinds) => {
    const X = require('./engine/ap331x'), vd = p => path.join(__dirname, 'vendor', p), tpl = fs.readFileSync(vd('c331_confirm.docx')), parts = JSON.parse(fs.readFileSync(vd('c331_tpl.json'), 'utf8'));
    const rep = await qa('apReport', o), safe = t => String(t).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 50), ymd = String(o.to || '').replace(/-/g, '');
    const build = async bp => { const row = rep.rows.find(r => r.bp === bp); if (!row) return null; const d = await qa('apDetail', bp, { ...o, all: true });
      return { ...d, acc: rep.acc, open: row.open, cr: row.cr, dr: row.dr, close: row.close, pay: row.pay, adv: row.adv, contracts: row.contracts }; };
    let dir = null; if (bps.length > 1) { const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục lưu biên bản đối chiếu', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; dir = r.filePaths[0]; }
    const out = [];
    for (const bp of bps.slice(0, 300)) { const d = await build(bp); if (!d) continue; const base = `DoiChieu331_${safe(X.pname(bp, d.info))}_${ymd}`;
      for (const k of kinds) { const buf = k === 'docx' ? X.buildDocx(d, tpl, parts) : X.buildXlsx(d), ext = k === 'docx' ? 'docx' : 'xlsx';
        let fp; if (dir) fp = path.join(dir, `${base}.${ext}`); else { const r = await dialog.showSaveDialog(win, { defaultPath: `${base}.${ext}`, filters: [{ name: ext === 'docx' ? 'Word' : 'Excel', extensions: [ext] }] }); if (r.canceled) continue; fp = r.filePath; }
        fs.writeFileSync(fp, buf); out.push(fp); } }
    if (out.length) shell.showItemInFolder(out[out.length - 1]);
    return { files: out };
  });
  handle('adv:reconBook', async (_e, keys, o) => {
    const ds = []; for (const k of keys.slice(0, 60)) ds.push(await qa('advDetail', k, o));
    if (ds.length === 1) { const x = advSheets(ds[0], o.company); return saveXlsx(`DoiChieuTamUng_${x.name.replace(/[^\w]+/g, '_').slice(0, 40)}_${o.asOf}.xlsx`, aoaBook(x.sheets)); }
    const sum = ds.map(d => ({ 'Mã NV': d.staff ? d.staff.code : '', 'Nhân viên': d.staff ? d.staff.name : d.partners[0], 'Phòng ban': d.staff ? d.staff.dept : '', 'Đầu kỳ': d.open, 'Tạm ứng': d.dr, 'Hoàn ứng': d.cr, 'Cuối kỳ': d.close, 'Khoản còn treo': d.items.length }));
    const sh = [['Tong hop', sum]]; ds.forEach((d, i) => { const x = advSheets(d, o.company); sh.push([`${i + 1}_${x.name}`.replace(/[\\/*?:\[\]]/g, '').slice(0, 31), x.sheets[0][1].concat([[], ['KHOẢN CÒN TREO']], [['Ngày', 'Chứng từ', 'Đề nghị TƯ', 'Nội dung', 'Số tiền', 'Còn lại', 'Số ngày']], d.items.map(t => [t.d, t.doc, t.ar || '', t.ds, t.amt, t.left, t.age]))]); });
    return saveXlsx(`DoiChieuTamUng_${ds.length}NV_${o.asOf}.xlsx`, aoaBook(sh));
  });
  handle('adv:reconMail', async (_e, keys, o) => {
    const esc = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), fmt = v => (+v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }), msgs = [], skip = [];
    for (const k of keys) { const d = await qa('advDetail', k, o), to = d.staff && (d.staff.email1 || d.staff.email2); if (!to) { skip.push(k); continue; }
      const x = advSheets(d, o.company), nm = x.name, fill = t => String(t || '').replace(/\{name\}/g, nm).replace(/\{balance\}/g, fmt(d.close)).replace(/\{asOf\}/g, d.asOf);
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6">${esc(fill(o.body)).replace(/\n/g, '<br>')}
        <table style="border-collapse:collapse;margin:12px 0" border="1" cellpadding="6"><tr><td>Số dư đầu kỳ (${esc(d.from)})</td><td align="right">${fmt(d.open)}</td></tr><tr><td>Tạm ứng trong kỳ</td><td align="right">${fmt(d.dr)}</td></tr><tr><td>Hoàn ứng / quyết toán trong kỳ</td><td align="right">${fmt(d.cr)}</td></tr><tr><td><b>Số dư tại ${esc(d.asOf)}</b></td><td align="right"><b>${fmt(d.close)}</b></td></tr></table>
        ${d.items.length ? `<b>Các khoản tạm ứng chưa hoàn / quyết toán:</b><table style="border-collapse:collapse;font-size:12px" border="1" cellpadding="4"><tr><th>Ngày</th><th>Chứng từ</th><th>Đề nghị TƯ</th><th>Nội dung</th><th>Còn lại</th><th>Số ngày</th></tr>${d.items.slice(0, 50).map(t => `<tr><td>${esc(t.d)}</td><td>${esc(t.doc)}</td><td>${esc(t.ar || '')}</td><td>${esc(String(t.ds || '').slice(0, 120))}</td><td align="right">${fmt(t.left)}</td><td align="right">${t.age}</td></tr>`).join('')}</table>` : ''}
        <p>Chi tiết xem file đính kèm. Vui lòng phản hồi xác nhận <b>đồng ý</b> hoặc <b>không đồng ý</b> (kèm số dư theo anh/chị).</p></div>`;
      msgs.push({ key: k, to, subject: fill(o.subject), html, employee: nm, count: d.items.length, amount: d.close, attachment: { name: `DoiChieuTamUng_${nm.replace(/[^\w]+/g, '_').slice(0, 40)}_${d.asOf}.xlsx`, base64: R.toBuffer(aoaBook(x.sheets)).toString('base64') } });
    }
    const res = await mailer.sendAll(Q, msgs), ok = new Set(res.filter(r => r.ok).map(r => r.to));
    for (const m of msgs) if (ok.has(m.to)) await qa('advSetRecon', [m.key], o.asOf, 'sent', { amount: m.amount, sent: m.to });
    return { res, skipped: skip.length };
  });
  // Gửi email tự soạn cho nhân viên: {name} {code} {position} {dept} trong tiêu đề / nội dung được thay theo từng người
  handle('staff:mail', async (_e, list, subject, body) => {
    const esc = t => String(t || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), fill = (t, p) => String(t || '').replace(/\{(name|code|position|dept|unit)\}/g, (_, k) => p[k] || '');
    const msgs = list.filter(p => p.to).map(p => ({ to: p.to, subject: fill(subject, p), html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6">${esc(fill(body, p)).replace(/\n/g, '<br>')}</div>`, employee: p.code || p.name, count: 0 }));
    return mailer.sendAll(Q, msgs);
  });
  handle('log:renderer', (_e, msg, stack) => log.error('Lỗi giao diện: ' + msg, stack));
  handle('log:open', () => shell.openPath(log.dir()));
  handle('log:file', () => log.file());
  // Không tự phân tích khi khởi động: tháng nào chưa phân tích (hoặc phân tích bằng bộ quy tắc cũ) sẽ được nhắc trên giao diện
  Q.setSetting('rules_version', String(RULES_VERSION));
  return Q.aggEmpty() || Q.finEmpty() ? 'agg' : false;
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
  if (needRecheck === 'agg') win.webContents.once('did-finish-load', () => exclusive(() => runTask('buildAgg', {}, 'Đang tổng hợp sổ số dư theo tháng để lập báo cáo nhanh (chỉ lần đầu)')).then(() => { log.info('Đã tạo bảng tổng hợp agg'); send('reload'); }).catch(e => log.error('Tạo bảng tổng hợp thất bại', e)));
  else if (needRecheck) win.webContents.once('did-finish-load', () => exclusive(() => runTask('recheck', {}, 'Đang rà soát lại dữ liệu theo bộ quy tắc mới')).then(() => { Q.setSetting('rules_version', String(RULES_VERSION)); log.info('Đã rà soát lại theo quy tắc phiên bản ' + RULES_VERSION); send('reload'); }).catch(e => { log.error('Nâng cấp CSDL thất bại', e); dialog.showErrorBox('AccSoft', firstLine(e.message) + '\n\nChi tiết: ' + log.file()); }));
}).catch(err => {
  log.error('Không khởi động được ứng dụng', err);
  dialog.showErrorBox('AccSoft – lỗi mở cơ sở dữ liệu', String(err && err.stack || err));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
