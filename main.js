const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { open } = require('./engine/db');
const { make } = require('./engine/queries');
const R = require('./engine/reports');
const XLSX = require('./vendor/xlsx.full.min.js');
const mailer = require('./mailer');
// Ngôn ngữ file xuất: khi giao diện chọn EN, mọi file .xlsx / .docx ghi ra, PDF và email được dịch sang tiếng Anh (engine/i18n.js)
const I18 = require('./engine/i18n');
const BRAND = require('./engine/brand'); // logo Telemor trên file xuất
{ const _wfs = fs.writeFileSync; fs.writeFileSync = (p, data, ...a) => { if (I18.lang() === 'en' && typeof p === 'string' && (Buffer.isBuffer(data) || data instanceof Uint8Array)) { if (/\.xlsx$/i.test(p)) data = I18.xlsx(Buffer.from(data)); else if (/\.docx$/i.test(p)) data = I18.docx(Buffer.from(data)); } if (typeof p === 'string' && /\.xlsx$/i.test(p) && (Buffer.isBuffer(data) || data instanceof Uint8Array)) data = BRAND.xlsx(Buffer.from(data), path.basename(p)); return _wfs(p, data, ...a); }; }
{ const _sa = mailer.sendAll; mailer.sendAll = (store, msgs) => _sa(store, msgs.map(m => {
    const en = I18.lang() === 'en', att = (m.attachments || (m.attachment ? [m.attachment] : [])).map(x => {
      if (/\.xlsx$/i.test(x.name)) { let b = Buffer.from(x.base64, 'base64'); if (en) b = I18.xlsx(b); return { ...x, base64: BRAND.xlsx(b, x.name).toString('base64') }; }
      if (en && /\.docx$/i.test(x.name)) return { ...x, base64: I18.docx(Buffer.from(x.base64, 'base64')).toString('base64') }; return x; });
    const logo = BRAND.png(); if (logo.length) att.push({ name: 'telemor-logo.png', base64: logo.toString('base64'), cid: 'telemorlogo' }); // logo hiển thị trong thư (ảnh nhúng CID)
    const own = /cid:telemorlogo/.test(m.html || ''), body = (logo.length && !own ? '<div style="text-align:right;margin:0 0 8px"><img src="cid:telemorlogo" width="120" height="39" alt="Telemor" style="width:120px;height:39px"></div>' : '') + (en && !own ? I18.html(m.html) : m.html);
    return { ...m, subject: en ? I18.tr(m.subject, 'text') : m.subject, html: body, attachment: undefined, attachments: att }; })); }
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
      else if (m.type === 'done') { if (task !== 'cancel') { try { qa('excApply').catch(() => { }); } catch { } } resolve(m.result); } // áp dụng quy tắc ngoại lệ cho cảnh báo mới
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
        log.info(`Bổ sung từ ${name}: ${r.rows} dòng, khớp ${r.matched}, cập nhật ${r.updated}, số tiền / Code Booking ${r.amtUpd || 0}, không tìm thấy ${r.notFound}, trùng khoá ${r.ambiguous}, bỏ qua ${r.skipped}`, { file, samples: r.samples });
        out.push(`✓ ${name}: ${r.rows.toLocaleString('vi')} dòng · khớp ${r.matched.toLocaleString('vi')} · cập nhật ${r.updated.toLocaleString('vi')} bút toán` + (r.amtUpd ? ` · Source Amount / Code Booking: ${r.amtUpd.toLocaleString('vi')} dòng` : '') +
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
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(BRAND.pdfHtml(BRAND.html(I18.html(html)))));
  const pdf = await w.webContents.printToPDF(BRAND.pdfOpts(I18.lang() === 'en'));
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
const READ = ['tdList', 'tdScan', 'todoDetail', 'tcostFacet', 'tcostList', 'excList', 'cxVers', 'cxCip', 'cxKpi', 'cxDept', 'cxAssets', 'slMapReview', 'cxList', 'cxExport', 'slIfrsBook', 'slIfrsOne', 'slDue', 'slYearEnd', 'slWht', 'slList', 'slExport', 'slCand', 'slRecon', 'slIfrs', 'slIfrsAll', 'slRate', 'p242Report', 'p242Lines', 'pfReport', 'pfDetail', 'amountBasis', 'piBanksOf', 'grReport', 'grDetail', 'grLines', 'grAssignList', 'grSigners', 'apAssignList', 'piList', 'piDetail', 'piRecipients', 'piExport', 'asDetail', 'asValues', 'faAssetTpl', 'asReport', 'asStatus', 'gsCompute', 'gsRules', 'gsDefaults', 'khPl01', 'khPl06', 'oiCompute', 'oiProcList', 'lgCross', 'lgGroup', 'lgRuns', 'lgPartners', 'r88Exempt', 'apReport', 'apDetail', 'invPartners', 'invRules', 'invCustTx', 'entrySearch', 'meta', 'getThresholds', 'deepRecurring', 'deepVariance', 'deepAccruals', 'deepPrepaid', 'deepBenford', 'deepStaff', 'deepVendors', 'deepFx', 'acc335List', 'catList', 'catExport', 'catUnmatched', 'catStats', 'grpInternal', 'grpInternalRows', 'grpBalance', 'grpYears', 'grpCompanies', 'igAdjList', 'igDocLines', 'grpIntl', 'recvAnalyze', 'recvDetail', 'finTrial', 'finBalance', 'finIncome', 'finCash', 'invCustomers', 'invCompare', 'invCell', 'r88Report', 'r88Detail', 'r88Wrong', 'llScan', 'llDetail', 'advReport', 'advDetail', 'staffList', 'staffEmailOf', 'staffByUser', 'staffPartners', 'staffBpOf', 'staffOfBp', 'fcCompute', 'fcMonthly', 'fcInternal', 'locMatrix', 'locDetail', 'locList', 'locNorms', 'kqCompute', 'kqTpl', 'kqSources', 'kqMaps', 'dmDeptList', 'dmDeptSources', 'dmCostList', 'dmCostUnmatched', 'dmExport', 'faSearch', 'faContracts', 'faValues', 'faList', 'finPartnerTB', 'cfRows', 'cfAdjList', 'finDrill', 'finNotes', 'finStatus', 'getB09Info', 'deepReversal', 'accrualSource', 'ledger', 'plRange', 'plTrend', 'analysisRange', 'analysisStatus', 'reviewPeriod', 'inventory', 'analysis', 'analysisDrill', 'errors', 'errorGroups', 'errorFacets', 'errorDetail', 'overview', 'pl', 'cost', 'aging', 'report', 'todo', 'months', 'imports', 'mailLog', 'stats'];
const WRITE = ['tdImport', 'tdSet', 'tdClear', 'locMark', 'faConfirmCf', 'setStatusKeys', 'excSave', 'excRemove', 'excApply', 'cxSnap', 'cxDelVer', 'cxSetLimit', 'cxLink', 'slAddMap', 'cxSave', 'cxCell', 'cxRemove', 'cxMove', 'cxRoll', 'cxImport', 'slPayMark', 'slSetWht', 'slSave', 'slRemove', 'slImport', 'slAutoMap', 'slSetMap', 'slSetRate', 'setAmountBasis', 'piImportBanks', 'grAssign', 'grSetStatus', 'grSetSigners', 'apAssign', 'piSave', 'piRemove', 'piImport', 'faAssetImport', 'gsSetRules', 'gsSetAdj', 'khSetPlan01', 'khSetPlan06', 'khSetNbMap', 'oiSetM01', 'oiProcSave', 'lgReport', 'lgSetLine', 'r88SetExempt', 'apSetStatus', 'apSetContract', 'apSetPartner', 'invSetRules', 'invBccsNeg', 'invImport', 'invSetMap', 'r88SetWrong', 'advSetAr', 'advSetBackup', 'llSave', 'llClear', 'llImport', 'advSetRecon', 'advClearRecon', 'staffSetMap', 'staffAutoMatch', 'staffUpsert', 'staffRemove', 'staffImport', 'locSetNorms', 'kqSetAutoRev', 'kqAutoMap', 'kqSetMap', 'kqClearMap', 'kqSetParams', 'kqImportTpl', 'dmDeptUpsert', 'dmDeptRemove', 'dmDeptMapSet', 'dmDeptAutoMap', 'dmCostUpsert', 'dmCostRemove', 'dmImport', 'faSet', 'faRemove', 'faRebind', 'cfAdjSet', 'cfAdjRemove', 'igAdjSet', 'igAdjRemove', 'catUpsert', 'catRemove', 'catImport', 'setB09Info', 'setThresholds', 'setReviewPeriod', 'setReviews', 'setStatusWhere', 'setStatusDoc', 'setMonths', 'setAllMonths'];

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
  handle('export:report', async (_e, minSev, group, month) => saveXlsx(`AccSoft_BaoCaoKiemTra${month ? '_' + month : ''}.xlsx`, R.reportBook(await qa('report', { month }),
    (await qa('errors', { month, statusIn: ['fixed', 'ignore'] }, { k: 'user', d: 1 }, 0, 2e6)).rows, (await qa('errors', { minSev, group, month, statusIn: ['open', 'doing'] }, { k: 'user', d: 1 }, 0, 2e6)).rows)));
  handle('export:employee', async (_e, user, minSev, group, month) => saveXlsx(`AccSoft_CanKhacPhuc_${R.shortName(user)}${month ? '_' + month : ''}.xlsx`, R.book([['Can khac phuc', (await qa('employeeErrors', user, minSev, 100000, group, month)).map(R.errRow)]])));
  // Email
  handle('mail:preview', async (_e, user, o) => { const rows = await qa('employeeErrors', user, o.minSev, 100000, o.group, o.month || ''); return { subject: R.mailSubject(user), html: R.mailHtml(user, rows, o), count: rows.length }; });
  handle('ui:lang', (_e, l) => I18.setLang(l));
  handle('smtp:get', () => mailer.getConfig(Q));
  handle('smtp:set', (_e, cfg) => mailer.setConfig(Q, cfg));
  handle('smtp:verify', () => mailer.verify(Q).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) })));
  handle('mail:send', async (_e, list, o) => {
    const msgs = [];
    for (const { user, to } of list) msgs.push(await (async () => {
      const rows = await qa('employeeErrors', user, o.minSev, 100000, o.group, o.month || '');
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
  const advSheets = (d, co, sg) => { const nm = d.staff ? d.staff.name : (d.partners[0] || d.key), f2 = v => Math.round((+v || 0) * 100) / 100;
    const head = [['BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ TẠM ỨNG'], [co || ''], [], ['Nhân viên', nm], ['Mã nhân viên', d.staff ? d.staff.code : ''], ['Phòng ban / Đơn vị', d.staff ? [d.staff.dept, d.staff.unit].filter(Boolean).join(' / ') : ''], ['Mã đối tượng công nợ', d.partners.join('; ')],
      ['Kỳ đối chiếu', `${d.from} → ${d.asOf}`], [], ['Số dư đầu kỳ', f2(d.open)], ['Tạm ứng trong kỳ', f2(d.dr)], ['Hoàn ứng / quyết toán trong kỳ', f2(d.cr)], ['Số dư cuối kỳ (nhân viên còn phải hoàn / quyết toán)', f2(d.close)], [],
      ['Xác nhận của nhân viên:  ☐ Đồng ý số dư trên      ☐ Không đồng ý – số dư theo nhân viên: ................................'], ['Ghi chú: ...........................................................................................'], [],
      ['NGƯỜI TẠM ỨNG', '', 'KẾ TOÁN', '', 'GIÁM ĐỐC TÀI CHÍNH (CFO)'], ['(Ký, ghi rõ họ tên)', '', '(Ký, ghi rõ họ tên)', '', '(Ký, ghi rõ họ tên)'], [], [], [], [nm, '', (sg && sg.acc) || '', '', (sg && sg.cfo) || '']];
    const kind = (sg && sg.kind) || 'sum', AR = advArRows(d, kind), arRows = [];
    for (const a of AR) { arRows.push({ 'Đề nghị tạm ứng': a.ar, 'Ngày': a.d, 'Số chứng từ': '', 'Nội dung': a.ds, 'Số tạm ứng': f2(a.dr), 'Đã hoàn / quyết toán': f2(a.cr), 'Còn phải hoàn': f2(a.left) });
      if (kind === 'detail') for (const x of a.L) arRows.push({ 'Đề nghị tạm ứng': '', 'Ngày': x.d, 'Số chứng từ': x.doc, 'Nội dung': x.ds, 'Số tạm ứng': x.dr ? f2(x.dr) : '', 'Đã hoàn / quyết toán': x.cr ? f2(x.cr) : '', 'Còn phải hoàn': '' }); }
    arRows.push({ 'Đề nghị tạm ứng': 'Tổng cộng', 'Số tạm ứng': f2(AR.reduce((s, a) => s + a.dr, 0)), 'Đã hoàn / quyết toán': f2(AR.reduce((s, a) => s + a.cr, 0)), 'Còn phải hoàn': f2(AR.reduce((s, a) => s + a.left, 0)) });
    return { name: nm, sheets: [['Bien ban doi chieu', head], [kind === 'detail' ? 'Chi tiet theo de nghi TU' : 'Tong hop theo de nghi TU', arRows],
      ['So chi tiet', d.book.map(x => ({ 'Ngày': x.d, 'Số chứng từ': x.doc, 'TK': x.acc, 'TK đối ứng': x.oacc, 'Đề nghị tạm ứng': x.ar || '', 'Nội dung': x.ds, 'Tạm ứng (Nợ)': f2(x.dr), 'Hoàn ứng (Có)': f2(x.cr), 'Số dư': f2(x.bal) }))]] };
  };
  // Biên bản đối chiếu tạm ứng dạng PDF (A4) – 3 chữ ký: người tạm ứng, kế toán, CFO
  // Bảng theo đề nghị tạm ứng: 'sum' = tổng hợp, chỉ đề nghị còn số dư; 'detail' = mọi đề nghị (cả số dư 0) kèm từng bút toán
  const advArRows = (d, kind) => { const A = (d.ars || []).map(a => { const L = (d.arLines || []).filter(x => x.ar === a.ar), first = L.find(x => x.dr > 0) || L[0] || {};
      return { ar: a.ar, d: a.first, ds: first.ds || '', dr: a.dr, cr: a.cr, left: a.left || 0, L }; });
    return (kind === 'detail' ? A : A.filter(a => Math.abs(a.left) > 0.005)).sort((a, b) => String(a.d).localeCompare(String(b.d))); };
  // Email đối chiếu tạm ứng: bố cục bảng + style inline (Outlook / Gmail bỏ qua CSS class), logo kích thước cố định, ngôn ngữ theo giao diện
  function advMailHtml(d, kind, intro, en) {
    const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), r2 = v => Math.round((+v || 0) * 100) / 100;
    const f = v => r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dmy = t => t ? String(t).slice(0, 10).split('-').reverse().join('/') : '';
    const L = en ? { op: 'Opening balance', adv: 'Advances in period', st: 'Settled in period', cl: 'Balance as of', h: kind === 'detail' ? 'Details by advance request (including fully settled)' : 'Outstanding advance requests', ar: 'Advance request', dt: 'Date', ds: 'Description', a: 'Advanced', s: 'Settled', l: 'Outstanding', tot: 'Total', none: 'No outstanding advance request.', att: 'The reconciliation statement (Excel and PDF) is attached. Please reply to confirm whether you <b>agree</b> or <b>disagree</b> with the balance (stating your balance if different).', ft: 'This email was sent automatically by the Finance Department – Telemor.' }
      : { op: 'Số dư đầu kỳ', adv: 'Tạm ứng trong kỳ', st: 'Hoàn ứng / quyết toán trong kỳ', cl: 'Số dư tại ngày', h: kind === 'detail' ? 'Chi tiết theo đề nghị tạm ứng (gồm đề nghị đã hoàn hết)' : 'Các đề nghị tạm ứng còn số dư', ar: 'Đề nghị tạm ứng', dt: 'Ngày', ds: 'Nội dung', a: 'Số tạm ứng', s: 'Đã hoàn', l: 'Còn phải hoàn', tot: 'Tổng cộng', none: 'Không còn đề nghị tạm ứng nào có số dư.', att: 'Biên bản đối chiếu (Excel và PDF) đính kèm thư này. Đề nghị anh/chị phản hồi xác nhận <b>đồng ý</b> hoặc <b>không đồng ý</b> (kèm số dư theo anh/chị nếu khác).', ft: 'Thư gửi tự động từ Phòng Tài chính – Telemor.' };
    const OR = '#FA4700', td = 'padding:8px 10px;border-bottom:1px solid #EAECF0;font-size:13px;color:#101828;vertical-align:top', th = 'padding:8px 10px;background:#FEF0EB;color:#B93815;font-size:12px;font-weight:600;text-align:left;border-bottom:2px solid ' + OR, n = ';text-align:right;white-space:nowrap';
    const R = advArRows(d, kind).map(a => ({ ...a, dr: r2(a.dr), cr: r2(a.cr), left: r2(a.left) })), T = k => R.reduce((x, a) => x + a[k], 0);
    const sumRow = (k, v, b) => `<tr><td style="${td}${b ? ';font-weight:700' : ''}">${k}</td><td style="${td}${n}${b ? ';font-weight:700;color:' + OR : ''}">${f(v)}</td></tr>`;
    const rows = R.map(a => `<tr><td style="${td};font-weight:600;white-space:nowrap">${e(a.ar)}</td><td style="${td};white-space:nowrap">${dmy(a.d)}</td><td style="${td};color:#475467">${e(String(a.ds).slice(0, 110))}</td><td style="${td}${n}">${f(a.dr)}</td><td style="${td}${n}">${f(a.cr)}</td><td style="${td}${n};font-weight:600">${f(a.left)}</td></tr>` +
      (kind === 'detail' ? a.L.map(x => `<tr><td style="${td};padding-left:22px;color:#667085;font-size:12px">↳ ${e(x.doc)}</td><td style="${td};color:#667085;font-size:12px">${dmy(x.d)}</td><td style="${td};color:#667085;font-size:12px">${e(String(x.ds || '').slice(0, 110))}</td><td style="${td}${n};color:#667085;font-size:12px">${x.dr ? f(x.dr) : ''}</td><td style="${td}${n};color:#667085;font-size:12px">${x.cr ? f(x.cr) : ''}</td><td style="${td}"></td></tr>`).join('') : '')).join('');
    return `<div style="background:#F2F4F7;padding:24px 0;font-family:Segoe UI,Arial,sans-serif"><table role="presentation" width="760" align="center" cellpadding="0" cellspacing="0" style="width:760px;max-width:100%;background:#fff;border-radius:8px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:18px 28px;border-bottom:3px solid ${OR}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#101828">${en ? 'Advance balance confirmation' : 'Đối chiếu công nợ tạm ứng'}<div style="font-size:12px;font-weight:400;color:#667085">${en ? 'As of' : 'Đến ngày'} ${dmy(d.asOf)}</div></td><td align="right"><img src="cid:telemorlogo" width="120" height="39" alt="Telemor" style="display:block;width:120px;height:39px;border:0"></td></tr></table></td></tr>
<tr><td style="padding:22px 28px 6px;font-size:14px;line-height:1.6;color:#101828">${e(intro).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:10px 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:420px;max-width:100%;border:1px solid #EAECF0">${sumRow(`${L.op} (${dmy(d.from)})`, d.open)}${sumRow(L.adv, d.dr)}${sumRow(L.st, d.cr)}${sumRow(`${L.cl} ${dmy(d.asOf)}`, d.close, 1)}</table></td></tr>
<tr><td style="padding:14px 28px 4px;font-size:14px;font-weight:700;color:#101828">${L.h}</td></tr>
<tr><td style="padding:4px 28px 10px">${R.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #EAECF0"><tr><th style="${th}">${L.ar}</th><th style="${th}">${L.dt}</th><th style="${th}">${L.ds}</th><th style="${th};text-align:right">${L.a}</th><th style="${th};text-align:right">${L.s}</th><th style="${th};text-align:right">${L.l}</th></tr>${rows}<tr><td colspan="3" style="${td};font-weight:700;background:#F9FAFB">${L.tot}</td><td style="${td}${n};font-weight:700;background:#F9FAFB">${f(T('dr'))}</td><td style="${td}${n};font-weight:700;background:#F9FAFB">${f(T('cr'))}</td><td style="${td}${n};font-weight:700;background:#F9FAFB;color:${OR}">${f(T('left'))}</td></tr></table>` : `<i style="font-size:13px;color:#667085">${L.none}</i>`}</td></tr>
<tr><td style="padding:10px 28px 22px;font-size:13px;line-height:1.6;color:#344054">${L.att}</td></tr>
<tr><td style="padding:12px 28px;background:#F9FAFB;font-size:11px;color:#98A2B3;border-top:1px solid #EAECF0">${L.ft}</td></tr></table></div>`;
  }
  function arTable(d, kind, e, f, dmy) {
    const R = advArRows(d, kind); if (!R.length) return '<p><i>Không còn đề nghị tạm ứng nào có số dư.</i></p>';
    const T = k => R.reduce((s, a) => s + a[k], 0);
    return `<div style="margin-top:10px"><b>${kind === 'detail' ? 'Chi tiết theo đề nghị tạm ứng (gồm đề nghị đã hoàn ứng hết)' : 'Tổng hợp theo đề nghị tạm ứng còn số dư'}</b></div><table><tr><th>Đề nghị tạm ứng</th><th>Ngày</th><th>Nội dung</th><th class=n>Số tạm ứng</th><th class=n>Đã hoàn / quyết toán</th><th class=n>Còn phải hoàn</th></tr>
      ${R.map(a => `<tr><td><b>${e(a.ar)}</b></td><td>${dmy(a.d)}</td><td>${e(String(a.ds).slice(0, 90))}</td><td class=n>${f(a.dr)}</td><td class=n>${f(a.cr)}</td><td class=n><b>${f(a.left)}</b></td></tr>` +
        (kind === 'detail' ? a.L.map(x => `<tr style="color:#444"><td style="padding-left:18px">↳ ${e(x.doc)}</td><td>${dmy(x.d)}</td><td>${e(String(x.ds || '').slice(0, 90))}</td><td class=n>${x.dr ? f(x.dr) : ''}</td><td class=n>${x.cr ? f(x.cr) : ''}</td><td></td></tr>`).join('') : '')).join('')}
      <tr><td colspan=3><b>Tổng cộng</b></td><td class=n><b>${f(T('dr'))}</b></td><td class=n><b>${f(T('cr'))}</b></td><td class=n><b>${f(T('left'))}</b></td></tr></table>`;
  }
  async function advPdf(d, co, sg = {}) {
    const e = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), f = v => (+v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
    const nm = d.staff ? d.staff.name : (d.partners[0] || d.key), st = d.staff || {};
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Biên bản đối chiếu công nợ tạm ứng – ${e(String(nm).replace(/^VTL_[A-Z]+_?\d+_/, ''))}</title><style>body{font-family:'Times New Roman',serif;font-size:13px;margin:28px 34px;color:#111}h1{text-align:center;font-size:18px;margin:14px 0 2px}.c{text-align:center}.m{color:#444}
      table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #888;padding:3px 5px;vertical-align:top;font-size:11.5px}th{background:#f2f2f2}.n{text-align:right;white-space:nowrap}.nb td{border:none;padding:2px 4px}
      .sig{display:flex;justify-content:space-between;margin-top:26px;text-align:center;page-break-inside:avoid}.sig>div{width:32%}.sig b{display:block}.sig i{display:block;font-size:12px;color:#444}.sig .nm{margin-top:70px;font-weight:bold}</style></head><body>
      <div><b>${e(co || '')}</b><br><span class=m>Phòng Tài chính – Kế toán</span></div>
      <h1>BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ TẠM ỨNG</h1><div class="c m">${sg.kind === 'detail' ? '(Chi tiết)' : '(Tổng hợp)'}</div><div class="c m">Kỳ đối chiếu: ${dmy(d.from)} – ${dmy(d.asOf)}</div>
      <table class=nb style="margin-top:14px"><tr><td style="width:190px">Người tạm ứng:</td><td><b>${e(nm)}</b></td></tr><tr><td>Mã nhân viên:</td><td>${e(st.code || '')}</td></tr>
        <tr><td>Phòng ban / Đơn vị:</td><td>${e([st.dept, st.unit].filter(Boolean).join(' / '))}</td></tr><tr><td>Mã đối tượng công nợ:</td><td>${e(d.partners.join('; '))}</td></tr></table>
      <table><tr><th>Chỉ tiêu</th><th class=n style="width:150px">Số tiền</th></tr><tr><td>Số dư đầu kỳ (${dmy(d.from)})</td><td class=n>${f(d.open)}</td></tr><tr><td>Tạm ứng trong kỳ</td><td class=n>${f(d.dr)}</td></tr>
        <tr><td>Hoàn ứng / quyết toán trong kỳ</td><td class=n>${f(d.cr)}</td></tr><tr><td><b>Số dư cuối kỳ tại ${dmy(d.asOf)} (còn phải hoàn / quyết toán)</b></td><td class=n><b>${f(d.close)}</b></td></tr></table>
      ${arTable(d, sg.kind, e, f, dmy)}
      <p style="margin-top:12px">Xác nhận của người tạm ứng: &nbsp; ☐ Đồng ý số dư trên &nbsp;&nbsp; ☐ Không đồng ý – số dư theo người tạm ứng: ..............................</p>
      <p>Ghi chú / giải trình: .............................................................................................................................</p>
      <p class=m style="font-size:12px">Đề nghị người tạm ứng kiểm tra, ký xác nhận và gửi lại Phòng Tài chính trong vòng 07 ngày. Quá thời hạn trên không có phản hồi, số dư được coi là đã xác nhận.</p>
      <div class=sig><div><b>NGƯỜI TẠM ỨNG</b><i>(Ký, ghi rõ họ tên)</i><div class=nm>${e(String(nm).replace(/^VTL_[A-Z]+_?\d+_/, ''))}</div></div><div><b>KẾ TOÁN</b><i>(Ký, ghi rõ họ tên)</i><div class=nm>${e(sg.acc || '')}</div></div><div><b>GIÁM ĐỐC TÀI CHÍNH (CFO)</b><i>(Ký, ghi rõ họ tên)</i><div class=nm>${e(sg.cfo || '')}</div></div></div></body></html>`;
    const w = new BrowserWindow({ show: false, width: 900, height: 1300, webPreferences: { sandbox: true } });
    try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(BRAND.pdfHtml(BRAND.html(I18.html(html))))); return await w.webContents.printToPDF(BRAND.pdfOpts(I18.lang() === 'en')); } finally { w.destroy(); }
  }
  const aoaBook = sheets => { const wb = R.XLSX.utils.book_new(); for (const [n, rows] of sheets) { const ws = Array.isArray(rows[0]) || !rows.length ? R.XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(không có)']]) : R.XLSX.utils.json_to_sheet(rows); R.XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); } return wb; };
  // Đối chiếu công nợ 331 theo hợp đồng: xuất Excel (tổng hợp + chi tiết) và/hoặc Word (xác nhận số dư) – nhiều đối tượng → chọn thư mục
  handle('xls:color', async (_e, name, sheet, aoa, opt) => { const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, require('./engine/xlscolor').build(sheet, aoa, opt)); shell.showItemInFolder(filePath); return filePath; });
  // Báo cáo "Đầu tư ra nước ngoài": xuất 6 biểu mẫu; nạp danh sách quy trình (mẫu 06) từ file Excel biểu mẫu
  // Kế hoạch năm: xuất PL01 + PL06; nạp số KH từ file mẫu (PL01: cột D–O KH năm, AL–AW KH năm sau, BI ghi chú; PL06: 4 khối KH quý từ cột P)
  // Đọc file Excel gán mã tài sản: tìm dòng tiêu đề có cột "Số chứng từ" / Document No và "Mã tài sản" / Asset
  handle('fa:assetRead', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(filePaths[0]);
    const txt = v => { if (v == null) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === 'object') return v.result != null ? txt(v.result) : v.richText ? v.richText.map(t => t.text).join('') : v.text || ''; return String(v).trim(); };
    const K = [['doc', /^(số chứng từ|chứng từ|document no|documentno|doc)$/], ['line', /^(line|line no|dòng)$/], ['date', /^(ngày|ngày hạch toán|date|account date)$/], ['acc', /^(tk|tài khoản|account)$/], ['amt', /^(số tiền|amount|accounted amount)$/], ['asset', /^(mã tài sản|tài sản|asset|asset code|asset name)$/], ['note', /^(ghi chú|note)$/]];
    for (const ws of wb.worksheets) { let hr = 0, map = {};
      for (let r = 1; r <= Math.min(ws.rowCount, 20) && !hr; r++) { const m = {}; ws.getRow(r).eachCell((c, i) => { const h = txt(c.value).toLowerCase().replace(/\s+/g, ' '); for (const [k, rx] of K) if (rx.test(h) && !(k in m)) m[k] = i; }); if (m.doc && m.asset) { hr = r; map = m; } }
      if (!hr) continue; const rows = [];
      for (let r = hr + 1; r <= ws.rowCount; r++) { const R = ws.getRow(r), o = {}; for (const [k, i] of Object.entries(map)) o[k] = txt(R.getCell(i).value); if (o.doc && o.asset) rows.push(o); }
      return { file: path.basename(filePaths[0]), sheet: ws.name, rows };
    }
    return { file: path.basename(filePaths[0]), rows: [], err: 'Không tìm thấy dòng tiêu đề có cột "Số chứng từ" và "Mã tài sản"' };
  });
  handle('gs:export', async (_e, R) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `AccSoft_GiamSatTaiChinh_${R.from}_${R.to}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, await require('./engine/gstcx').build(R)); shell.showItemInFolder(filePath); return filePath;
  });
  handle('kh:export', async (_e, P1, P6, o) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `AccSoft_KeHoachNam_${(P1 || P6).Y}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, await require('./engine/khnamx').build(P1, P6, o || {})); shell.showItemInFolder(filePath); return filePath;
  });
  handle('kh:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(filePaths[0]);
    const val = v => { if (v == null) return null; if (typeof v === 'object') { if (v.result !== undefined) return val(v.result); if (v.richText) return v.richText.map(t => t.text).join(''); if (v.error) return null; return null; } return v; };
    const num = v => { v = val(v); return typeof v === 'number' && isFinite(v) ? v : null; };
    const out = { file: path.basename(filePaths[0]), pl01: [], pl06: [] };
    const s1 = wb.worksheets.find(w => /^PL01/i.test(w.name)), s6 = wb.worksheets.find(w => /^PL06/i.test(w.name));
    if (s1) for (let r = 10; r <= s1.rowCount; r++) { const R = s1.getRow(r), lb = String(val(R.getCell(2).value) || '').trim(); if (!lb) continue;
      out.pl01.push({ code: String(val(R.getCell(1).value) || '').trim(), label: lb, kh: Array.from({ length: 12 }, (_, i) => num(R.getCell(4 + i).value)), kh1: Array.from({ length: 12 }, (_, i) => num(R.getCell(38 + i).value)), note: String(val(R.getCell(61).value) || '').trim() }); }
    const POS = { E: 0, F: 1, G: 2, H: 3, I: 4, K: 6, L: 7, N: 9, O: 10 };
    if (s6) for (let r = 9; r <= s6.rowCount; r++) { const R = s6.getRow(r), code = String(val(R.getCell(2).value) || '').trim(); if (!code) continue; const q = {};
      [16, 27, 38, 49].forEach((c0, i) => { const o = {}; for (const [k, p] of Object.entries(POS)) { const v = num(R.getCell(c0 + p).value); if (v) o[k] = v; } if (Object.keys(o).length) q['Q' + (i + 1)] = o; });
      out.pl06.push({ code, q }); }
    return out;
  });
  handle('oi:export', async (_e, R, o) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `AccSoft_DauTuNuocNgoai_${R.from}_${R.to}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, await require('./engine/oinvx').build(R, o || {})); shell.showItemInFolder(filePath); return filePath;
  });
  // Xuất báo cáo Word "Phụ lục 01 – Báo cáo tình hình tài chính dự án ĐTRNN" theo mẫu dựng sẵn (vendor/oinv_pl01.docx) cho kỳ đang lập
  handle('oi:word', async (_e, R) => {
    const D = require('./engine/oinvdoc'), K = D.periodLbl(R.from, R.to);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `BC_tinh_hinh_tai_chinh_DTRNN_${K.S.replace(/[^\w]+/g, '_')}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, D.build(fs.readFileSync(path.join(__dirname, 'vendor', 'oinv_pl01.docx')), R)); shell.showItemInFolder(filePath); return { file: filePath };
  });
  handle('cx:import', async (_e, year, mode) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file kế hoạch đầu tư (mẫu DAUTU)', filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const wb = R.XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), aoa = R.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    return { ...(await qa('cxImport', aoa, year, mode)), file: path.basename(filePaths[0]) };
  });
  handle('oi:import06', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(filePaths[0]);
    const txt = v => { if (v == null) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === 'object') return v.result != null ? txt(v.result) : v.richText ? v.richText.map(t => t.text).join('') : v.text || ''; return String(v).trim(); };
    const K = { 'loại vb': 'type', scope: 'scope', 'ký hiệu văn bản': 'code', 'tên văn bản': 'name', 'đơn vị ban hành': 'issuer', 'ngày ban hành': 'issued', 'ngày có hiệu lực': 'eff', 'ngày hết hiệu lực': 'exp', 'cần ban hành lại': 'reissue', 'ghi chú': 'note' };
    for (const ws of wb.worksheets) {
      let hr = 0, map = {};
      for (let r = 1; r <= Math.min(ws.rowCount, 30) && !hr; r++) { const m = {}; ws.getRow(r).eachCell((c, i) => { const k = K[txt(c.value).toLowerCase().replace(/\s+/g, ' ')]; if (k) m[i] = k; }); if (Object.values(m).includes('name')) { hr = r; map = m; } }
      if (!hr) continue;
      const rows = [];
      for (let r = hr + 1; r <= ws.rowCount; r++) { const o = {}; for (const [i, k] of Object.entries(map)) o[k] = txt(ws.getRow(r).getCell(+i).value); for (const k of ['issued', 'eff', 'exp']) { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(o[k] || ''); if (m) o[k] = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } if (o.name || o.code) rows.push(o); }
      return { file: path.basename(filePaths[0]), sheet: ws.name, rows };
    }
    return { file: path.basename(filePaths[0]), rows: [], err: 'Không tìm thấy sheet có cột "Tên văn bản"' };
  });
  // ---- Đối chiếu 331: dữ liệu một đối tác, biên bản PDF, email; danh mục thông tin đối tác ----
  const apData = async (bp, o) => { const rep = await qa('apReport', o), row = rep.rows.find(r => r.bp === bp); if (!row) return null; const d = await qa('apDetail', bp, { ...o, all: true });
    return { ...d, acc: rep.acc, open: row.open, cr: row.cr, dr: row.dr, close: row.close, pay: row.pay, adv: row.adv, contracts: row.contracts }; };
  function apPdfHtml(d, bank) {
    const X = require('./engine/ap331x'), P = X.pname(d.bp, d.info), e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const r2 = v => Math.round((+v || 0) * 100) / 100, f = v => r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dmy = t => t ? String(t).slice(0, 10).split('-').reverse().join('/') : '';
    const C = d.contracts.filter(c => Math.abs(c.open) > 0.004 || Math.abs(c.cr) > 0.004 || Math.abs(c.dr) > 0.004 || Math.abs(c.close) > 0.004), inf = d.info || {}, T = k => C.reduce((q, c) => q + r2(c[k]), 0);
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px;color:#101828;margin:0}h1{font-size:16px;text-align:center;margin:6px 0 2px}.sub{text-align:center;color:#475467;margin-bottom:12px}
      table{border-collapse:collapse;width:100%;margin-top:8px}th{background:#FEF0EB;color:#B93815;border:1px solid #D0D5DD;padding:5px;font-size:10px}td{border:1px solid #D0D5DD;padding:4px 5px;vertical-align:top}.n{text-align:right;white-space:nowrap}.t td{font-weight:700;background:#F9FAFB}
      .info td{border:0;padding:2px 4px}.sig{display:flex;justify-content:space-between;margin-top:22px}.sig>div{width:46%;text-align:center}.sig i{color:#667085;display:block}.sig .sp{height:70px}.note{color:#475467;margin-top:10px}</style></head><body>
      <h1>CONFIRMATION OF CLOSING BALANCE</h1><div class=sub>As of ${dmy(d.to)} · Period ${dmy(d.from)} – ${dmy(d.to)} · Currency: USD</div>
      <table class=info><tr><td style="width:50%;vertical-align:top"><b>VIETTEL TIMOR UNIPESSOAL, LDA (Telemor)</b><br>Timor Plaza, CBD 10, 3rd floor, Comoro, Dom Aleixo, Dili, Timor-Leste</td>
        <td style="vertical-align:top"><b>${e(P)}</b>${inf.tin ? '<br>TIN: ' + e(inf.tin) : ''}${inf.address ? '<br>' + e(inf.address) : ''}<br><span style="color:#667085">Partner code: ${e(d.bp)}</span>${bank ? `<br>Bank account: ${e(bank.acc_no)} – ${e(bank.bank)}${bank.acc_name ? ' (' + e(bank.acc_name) + ')' : ''}` : ''}</td></tr></table>
      <table><thead><tr><th>No</th><th>Contract</th><th>Type</th><th>Opening balance</th><th>Invoiced / payable</th><th>Paid / advanced</th><th>Closing balance</th><th>Partner's balance</th><th>Difference / reason</th></tr></thead><tbody>
      ${C.map((c, i) => `<tr><td class=n>${i + 1}</td><td>${e(c.c || '(no contract)')}</td><td>${c.close < -0.004 ? 'Advance' : 'Payable'}</td><td class=n>${f(c.open)}</td><td class=n>${f(c.cr)}</td><td class=n>${f(c.dr)}</td><td class=n><b>${f(c.close)}</b></td><td></td><td></td></tr>`).join('')}
      <tr class=t><td colspan=3>Total</td><td class=n>${f(T('open'))}</td><td class=n>${f(T('cr'))}</td><td class=n>${f(T('dr'))}</td><td class=n>${f(T('close'))}</td><td></td><td></td></tr></tbody></table>
      <p class=note>Of which: amount payable by Telemor <b>${f(d.pay)}</b> · advance (prepayment) to partner <b>${f(d.adv)}</b> · net balance <b>${f(d.close)}</b> (positive = Telemor owes the partner).</p>
      <p class=note>Please check the balances above against your records. If they agree, sign and return this confirmation; if not, fill in your balance and the reason for the difference in the last two columns.</p>
      <div class=sig><div><b>CONFIRMED BY TELEMOR</b><i>Date: ……/……/………</i><div class=sp></div>Chief Accountant<br><i>(Signature, full name, stamp)</i></div><div><b>CONFIRMED BY ${e(P.toUpperCase())}</b><i>Date: ……/……/………</i><div class=sp></div>Authorised representative<br><i>(Signature, full name, stamp)</i></div></div></body></html>`;
  }
  async function apPdf(d) { const pi = await qa('piDetail', d.bp), bank = (pi.banks || [])[0], html = apPdfHtml(d, bank);
    const w = new BrowserWindow({ show: false, width: 1100, height: 1400, webPreferences: { sandbox: true } });
    try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(BRAND.pdfHtml(BRAND.html(html)))); return await w.webContents.printToPDF(BRAND.pdfOpts(true, { landscape: true })); } finally { w.destroy(); } }
  const apBase = (bp, d, o) => `DoiChieu331_${String(require('./engine/ap331x').pname(bp, d.info)).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 50)}_${String(o.to || '').replace(/-/g, '')}`;
  handle('ap:pdfPreview', async (_e, bp, o) => { const d = await apData(bp, o); if (!d) throw new Error(I18.lang() === 'en' ? 'No reconciliation data for this partner in the period' : 'Không có số liệu đối chiếu cho đối tượng này trong kỳ');
    const fp = path.join(os.tmpdir(), `${apBase(bp, d, o)}_${Date.now()}.pdf`); fs.writeFileSync(fp, await apPdf(d));
    const er = await shell.openPath(fp); if (er) throw new Error((I18.lang() === 'en' ? 'Cannot open PDF: ' : 'Không mở được PDF: ') + er); setTimeout(() => { try { fs.unlinkSync(fp); } catch { } }, 30 * 60e3).unref?.(); return fp; });
  handle('ap:pdf', async (_e, bp, o) => { const d = await apData(bp, o); if (!d) throw new Error(I18.lang() === 'en' ? 'No data' : 'Không có số liệu');
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: apBase(bp, d, o) + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, await apPdf(d)); shell.openPath(filePath); return filePath; });
  // Gửi email đối chiếu cho MỘT đối tác (giao diện gọi lần lượt từng đối tác): To = liên hệ vai trò To, CC = liên hệ CC + CC nhập + CC mặc định SMTP
  handle('ap:mail', async (_e, bp, o) => {
    const cfg = mailer.getConfig(Q); if (!cfg.host) throw new Error(I18.lang() === 'en' ? 'SMTP mail server is not configured. Go to Report → SMTP mail server to set it up.' : 'Chưa cấu hình máy chủ gửi mail (SMTP). Vào mục Báo cáo → Máy chủ gửi mail (SMTP) để thiết lập.');
    const rc = await qa('piRecipients', bp); if (!rc.to.length) return { ok: false, skip: true, error: I18.lang() === 'en' ? 'The partner has no contact email' : 'Đối tác chưa có email người liên hệ' };
    const d = await apData(bp, o); if (!d) return { ok: false, skip: true, error: I18.lang() === 'en' ? 'No data in this period' : 'Không có số liệu trong kỳ' };
    const X = require('./engine/ap331x'), P = X.pname(bp, d.info), r2 = v => Math.round((+v || 0) * 100) / 100, f = v => r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dmy = t => String(t).slice(0, 10).split('-').reverse().join('/');
    const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const fill = t => String(t || '').replace(/\{partner\}/g, P).replace(/\{contact\}/g, rc.names[0] || 'Sir/Madam').replace(/\{asOf\}/g, dmy(d.to)).replace(/\{balance\}/g, f(d.close)).replace(/\{payable\}/g, f(d.pay)).replace(/\{advance\}/g, f(d.adv));
    const toL = rc.to.map(x => x.toLowerCase()), cc = [...new Set([...rc.cc, ...String(o.cc || '').split(/[;,]/), ...String(o.defCc ? cfg.cc || '' : '').split(/[;,]/)].map(x => x.trim()).filter(x => /@/.test(x) && !toL.includes(x.toLowerCase())))];
    const OR = '#FA4700', td = 'padding:7px 9px;border-bottom:1px solid #EAECF0;font-size:13px', th = 'padding:7px 9px;background:#FEF0EB;color:#B93815;font-size:12px;text-align:left;border-bottom:2px solid ' + OR, n = ';text-align:right;white-space:nowrap';
    const C = d.contracts.filter(c => Math.abs(c.close) > 0.004);
    const html = `<div style="background:#F2F4F7;padding:24px 0;font-family:Segoe UI,Arial,sans-serif"><table role="presentation" width="760" align="center" cellpadding="0" cellspacing="0" style="width:760px;max-width:100%;background:#fff;border-radius:8px">
<tr><td style="padding:18px 28px;border-bottom:3px solid ${OR}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#101828">Confirmation of closing balance<div style="font-size:12px;font-weight:400;color:#667085">${e(P)} · as of ${dmy(d.to)}</div></td><td align="right"><img src="cid:telemorlogo" width="120" height="39" alt="Telemor" style="display:block;width:120px;height:39px;border:0"></td></tr></table></td></tr>
<tr><td style="padding:22px 28px 8px;font-size:14px;line-height:1.6;color:#101828">${e(fill(o.body)).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:8px 28px">${C.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #EAECF0"><tr><th style="${th}">Contract</th><th style="${th}">Type</th><th style="${th};text-align:right">Closing balance (USD)</th></tr>
${C.map(c => `<tr><td style="${td}">${e(c.c || '(no contract)')}</td><td style="${td}">${c.close < 0 ? 'Advance (prepayment)' : 'Payable'}</td><td style="${td}${n};font-weight:600">${f(Math.abs(c.close))}</td></tr>`).join('')}
<tr><td colspan="2" style="${td};font-weight:700;background:#F9FAFB">Net balance (payable − advance)</td><td style="${td}${n};font-weight:700;background:#F9FAFB;color:${OR}">${f(d.close)}</td></tr></table>` : '<i>No outstanding balance.</i>'}</td></tr>
<tr><td style="padding:10px 28px 22px;font-size:13px;line-height:1.6;color:#344054">The confirmation (PDF, Excel${o.docx ? ', Word' : ''}) is attached. Please sign and return it, or reply with your balance and the reason for any difference.</td></tr>
<tr><td style="padding:12px 28px;background:#F9FAFB;font-size:11px;color:#98A2B3;border-top:1px solid #EAECF0">Finance Department – Telemor (Viettel Timor Unipessoal, Lda)</td></tr></table></div>`;
    const base = apBase(bp, d, o), att = [{ name: base + '.pdf', base64: Buffer.from(await apPdf(d)).toString('base64') }, { name: base + '.xlsx', base64: Buffer.from(X.buildXlsx(d)).toString('base64') }];
    if (o.docx) { const vd = p => path.join(__dirname, 'vendor', p); att.push({ name: base + '.docx', base64: Buffer.from(X.buildDocx(d, fs.readFileSync(vd('c331_confirm.docx')), JSON.parse(fs.readFileSync(vd('c331_tpl.json'), 'utf8')))).toString('base64') }); }
    const res = await mailer.sendAll(Q, [{ to: rc.to.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: fill(o.subject), html, employee: bp, count: C.length, attachments: att }]);
    return { ...res[0], to: rc.to.join('; '), cc: cc.join('; ') };
  });
  // Giao việc đối chiếu 331 cho nhân viên: một thư cho nhân viên, kèm danh sách đối tác (liên hệ, số dư theo kỳ đã chọn) và biên bản từng đối tác (Word / Excel / PDF)
  handle('ap:assignMail', async (_e, bps, o) => {
    const cfg = mailer.getConfig(Q); if (!cfg.host) throw new Error(I18.lang() === 'en' ? 'SMTP mail server is not configured. Go to Report → SMTP mail server to set it up.' : 'Chưa cấu hình máy chủ gửi mail (SMTP). Vào mục Báo cáo → Máy chủ gửi mail (SMTP) để thiết lập.');
    const EN = I18.lang() === 'en', T = (vi, en) => EN ? en : vi, emails = [...new Set(String(o.email || '').split(/[;,\s]+/).filter(x => /@/.test(x)))];
    if (!emails.length) throw new Error(T('Nhân viên chưa có email', 'The staff member has no email address'));
    const X = require('./engine/ap331x'), vd = p => path.join(__dirname, 'vendor', p), kinds = o.kinds || ['docx', 'xlsx', 'pdf'];
    const r2 = v => Math.round((+v || 0) * 100) / 100, f = v => r2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), dmy = t => t ? String(t).slice(0, 10).split('-').reverse().join('/') : '';
    const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const att = [], R = [];
    for (const bp of bps) { const d = await apData(bp, o); if (!d) continue; const base = apBase(bp, d, o), rc = await qa('piRecipients', bp), pi = await qa('piDetail', bp);
      if (kinds.includes('docx')) att.push({ name: base + '.docx', base64: Buffer.from(X.buildDocx(d, fs.readFileSync(vd('c331_confirm.docx')), JSON.parse(fs.readFileSync(vd('c331_tpl.json'), 'utf8')))).toString('base64') });
      if (kinds.includes('xlsx')) att.push({ name: base + '.xlsx', base64: Buffer.from(X.buildXlsx(d)).toString('base64') });
      if (kinds.includes('pdf')) att.push({ name: base + '.pdf', base64: Buffer.from(await apPdf(d)).toString('base64') });
      R.push({ bp, name: X.pname(bp, d.info), d, rc, contacts: pi.contacts.filter(c => c.email || c.phone) }); }
    if (!R.length) throw new Error(T('Các đối tác đã chọn không có số liệu trong kỳ', 'The selected partners have no data in this period'));
    const OR = '#FA4700', td = 'padding:7px 9px;border-bottom:1px solid #EAECF0;font-size:13px;vertical-align:top', th = 'padding:7px 9px;background:#FEF0EB;color:#B93815;font-size:12px;text-align:left;border-bottom:2px solid ' + OR, n = ';text-align:right;white-space:nowrap';
    const html = `<div style="background:#F2F4F7;padding:24px 0;font-family:Segoe UI,Arial,sans-serif"><table role="presentation" width="820" align="center" cellpadding="0" cellspacing="0" style="width:820px;max-width:100%;background:#fff;border-radius:8px">
<tr><td style="padding:18px 28px;border-bottom:3px solid ${OR}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#101828">${T('Giao việc đối chiếu công nợ', 'Balance confirmation assignment')} ${e(o.acc || '331')}<div style="font-size:12px;font-weight:400;color:#667085">${T('Kỳ', 'Period')} ${dmy(o.from)} – ${dmy(o.to)} · ${R.length} ${T('đối tác', 'partners')}${o.due ? ' · ' + T('hạn hoàn thành', 'due') + ' <b style="color:' + OR + '">' + dmy(o.due) + '</b>' : ''}</div></td><td align="right"><img src="cid:telemorlogo" width="120" height="39" alt="Telemor" style="display:block;width:120px;height:39px;border:0"></td></tr></table></td></tr>
<tr><td style="padding:20px 28px 6px;font-size:14px;line-height:1.6;color:#101828">${e(String(o.body || '').replace(/\{name\}/g, o.name || '').replace(/\{n\}/g, R.length).replace(/\{from\}/g, dmy(o.from)).replace(/\{to\}/g, dmy(o.to)).replace(/\{due\}/g, dmy(o.due))).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #EAECF0"><tr><th style="${th}">#</th><th style="${th}">${T('Đối tác', 'Partner')}</th><th style="${th}">${T('Người liên hệ', 'Contacts')}</th><th style="${th};text-align:right">${T('Đầu kỳ', 'Opening')}</th><th style="${th};text-align:right">${T('PS Có', 'Credit')}</th><th style="${th};text-align:right">${T('PS Nợ', 'Debit')}</th><th style="${th};text-align:right">${T('Cuối kỳ', 'Closing')}</th></tr>
${R.map((x, i) => `<tr><td style="${td}">${i + 1}</td><td style="${td}"><b>${e(x.name)}</b><div style="font-size:11px;color:#667085">${e(x.bp)} · ${x.d.contracts.filter(c => Math.abs(c.close) > 0.004).length} ${T('hợp đồng còn dư', 'open contracts')}</div></td><td style="${td};font-size:12px">${x.contacts.length ? x.contacts.map(c => `${e(c.name || '')}${c.position ? ' (' + e(c.position) + ')' : ''}${c.role === 'to' ? ' <b>[To]</b>' : c.role === 'cc' ? ' [CC]' : ''}<br><span style="color:#155EEF">${e(c.email || '')}</span>${c.phone ? ' · ' + e(c.phone) : ''}`).join('<div style="height:4px"></div>') : '<span style="color:#D92D20">' + T('chưa có thông tin liên hệ – cần bổ sung', 'no contact details – please update') + '</span>'}</td><td style="${td}${n}">${f(x.d.open)}</td><td style="${td}${n}">${f(x.d.cr)}</td><td style="${td}${n}">${f(x.d.dr)}</td><td style="${td}${n};font-weight:700">${f(x.d.close)}</td></tr>`).join('')}
<tr><td colspan="3" style="${td};font-weight:700;background:#F9FAFB">${T('Tổng cộng', 'Total')}</td>${['open', 'cr', 'dr', 'close'].map(k => `<td style="${td}${n};font-weight:700;background:#F9FAFB${k === 'close' ? ';color:' + OR : ''}">${f(R.reduce((q, x) => q + r2(x.d[k]), 0))}</td>`).join('')}</tr></table></td></tr>
<tr><td style="padding:10px 28px 20px;font-size:13px;line-height:1.6;color:#344054">${T('Đính kèm biên bản đối chiếu từng đối tác', 'Attached: confirmation for each partner')} (${kinds.map(k => ({ docx: 'Word', xlsx: 'Excel', pdf: 'PDF' })[k]).join(', ')}) – ${T('số liệu phát sinh theo kỳ', 'figures for the period')} ${dmy(o.from)} – ${dmy(o.to)}. ${T('Sau khi gửi đối tác và nhận phản hồi, cập nhật trạng thái <b>Đã khớp / Chưa khớp</b> trên AccSoft.', 'After sending to the partners and receiving their replies, update the status <b>Matched / Not matched</b> in AccSoft.')}</td></tr>
<tr><td style="padding:12px 28px;background:#F9FAFB;font-size:11px;color:#98A2B3;border-top:1px solid #EAECF0">${T('Phòng Tài chính – Telemor · gửi từ AccSoft', 'Finance Department – Telemor · sent from AccSoft')}</td></tr></table></div>`;
    const cc = [...new Set([...String(o.cc || '').split(/[;,]/), ...String(o.defCc ? cfg.cc || '' : '').split(/[;,]/)].map(x => x.trim()).filter(x => /@/.test(x) && !emails.map(y => y.toLowerCase()).includes(x.toLowerCase())))];
    const subj = String(o.subject || '').replace(/\{name\}/g, o.name || '').replace(/\{n\}/g, R.length).replace(/\{from\}/g, dmy(o.from)).replace(/\{to\}/g, dmy(o.to)).replace(/\{due\}/g, dmy(o.due));
    const res = (await mailer.sendAll(Q, [{ to: emails.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: subj, html, employee: o.staff, count: R.length, attachments: att }]))[0];
    if (res.ok) await qa('apAssign', R.map(x => x.bp), { ...o, mailed: true });
    return { ...res, n: R.length, files: att.length, cc: cc.join('; ') };
  });
  // ---- Đối chiếu hàng hoá 15611 / vật tư 14121 theo đối tượng: biểu mẫu Excel + PDF, email đối tượng, giao việc nhân viên ----
  const GX = require('./engine/goodsrecx');
  const grData = async (kind, bp, o) => { const r = await qa('grDetail', bp, { ...o, kind }); if (!r.row) throw new Error(I18.lang() === 'en' ? 'No data for this partner in the period' : 'Không có số liệu của đối tượng trong kỳ'); return r; };
  // người nhận: danh mục đối tác (To / CC); không có thì nhân viên đã ghép với mã đối tượng (Danh mục nhân viên)
  const grRecip = async bp => { const rc = await qa('piRecipients', bp); if (rc.to.length) return rc; const st = await qa('staffOfBp', bp); const e = st && (st.email1 || st.email2); return { to: e ? [e] : [], cc: rc.cc, names: st ? [st.name] : [], staff: st || null }; };
  const grCo = async bp => { const pi = await qa('piDetail', bp), c = pi.contacts.find(x => x.role === 'to') || pi.contacts[0], st = c ? null : await qa('staffOfBp', bp); return c ? { contact: c.name, position: c.position } : st ? { contact: st.name, position: st.position } : {}; };
  const grBase = (kind, bp, r) => `DoiChieu${kind}_${String(GX.pname(bp, r.row.info)).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 50)}_${String(r.to).replace(/-/g, '')}`;
  async function grFiles(kind, bp, o) { const r = await grData(kind, bp, o), sg = await qa('grSigners'), co = await grCo(bp), B = GX.build[kind];
    const w = new BrowserWindow({ show: false, width: 1200, height: 1400, webPreferences: { sandbox: true } }); let pdf;
    try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(BRAND.pdfHtml(BRAND.html(B.html(r.row, r, sg, co))))); pdf = Buffer.from(await w.webContents.printToPDF(BRAND.pdfOpts(I18.lang() === 'en', { landscape: true }))); } finally { w.destroy(); }
    const base = grBase(kind, bp, r); return { r, base, pdf, xlsx: BRAND.xlsx(await B.xlsx(r.row, r, sg, co), base + '.xlsx', { col: 0 }) }; }
  handle('gr:preview', async (_e, kind, bp, o) => { const f = await grFiles(kind, bp, o), fp = path.join(os.tmpdir(), `${f.base}_${Date.now()}.pdf`); fs.writeFileSync(fp, f.pdf);
    const er = await shell.openPath(fp); if (er) throw new Error(er); setTimeout(() => { try { fs.unlinkSync(fp); } catch { } }, 30 * 60e3).unref?.(); return fp; });
  handle('gr:export', async (_e, kind, bps, o, kinds) => { let dir = null; if (bps.length > 1) { const d = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); if (d.canceled) return null; dir = d.filePaths[0]; }
    const out = []; for (const bp of bps.slice(0, 300)) { const f = await grFiles(kind, bp, o);
      for (const k of kinds) { let fp = dir ? path.join(dir, `${f.base}.${k}`) : null; if (!fp) { const d = await dialog.showSaveDialog(win, { defaultPath: `${f.base}.${k}`, filters: [{ name: k.toUpperCase(), extensions: [k] }] }); if (d.canceled) continue; fp = d.filePath; }
        fs.writeFileSync(fp, k === 'pdf' ? f.pdf : f.xlsx); out.push(fp); } }
    if (out.length) shell.showItemInFolder(out[out.length - 1]); return { files: out }; });
  const grMailHtml = (title, sub, intro, table, foot) => `<div style="background:#F2F4F7;padding:24px 0;font-family:Segoe UI,Arial,sans-serif"><table role="presentation" width="820" align="center" cellpadding="0" cellspacing="0" style="width:820px;max-width:100%;background:#fff;border-radius:8px">
<tr><td style="padding:18px 28px;border-bottom:3px solid #FA4700"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:16px;font-weight:700;color:#101828">${title}<div style="font-size:12px;font-weight:400;color:#667085">${sub}</div></td><td align="right"><img src="cid:telemorlogo" width="120" height="39" alt="Telemor" style="display:block;width:120px;height:39px;border:0"></td></tr></table></td></tr>
<tr><td style="padding:20px 28px 6px;font-size:14px;line-height:1.6;color:#101828">${intro}</td></tr><tr><td style="padding:8px 28px">${table}</td></tr>
<tr><td style="padding:10px 28px 20px;font-size:13px;line-height:1.6;color:#344054">${foot}</td></tr><tr><td style="padding:12px 28px;background:#F9FAFB;font-size:11px;color:#98A2B3;border-top:1px solid #EAECF0">Finance Department – Telemor (Viettel Timor Unipessoal, Lda)</td></tr></table></div>`;
  const esc_ = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fq = v => (Math.round((+v || 0) * 10000) / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 }), fa = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const TD = 'padding:6px 8px;border-bottom:1px solid #EAECF0;font-size:12px', TH = 'padding:6px 8px;background:#FEF0EB;color:#B93815;font-size:11px;text-align:left;border-bottom:2px solid #FA4700', NR = ';text-align:right;white-space:nowrap';
  const grItemsTable = (kind, row) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #EAECF0"><tr><th style="${TH}">Item</th><th style="${TH}">Unit</th><th style="${TH};text-align:right">Opening</th><th style="${TH};text-align:right">Received</th><th style="${TH};text-align:right">${kind === '15611' ? 'Clear' : 'Output'}</th><th style="${TH};text-align:right">Closing qty</th>${kind === '14121' ? `<th style="${TH};text-align:right">Closing amount</th>` : ''}</tr>
${row.items.slice(0, 60).map(i => `<tr><td style="${TD}">${esc_(i.name)}<div style="color:#98A2B3;font-size:11px">${esc_(i.code)}</div></td><td style="${TD}">${esc_(i.unit)}</td><td style="${TD}${NR}">${fq(i.oq)}</td><td style="${TD}${NR}">${fq(i.iq)}</td><td style="${TD}${NR}">${fq(i.xq)}</td><td style="${TD}${NR};font-weight:700">${fq(i.cq)}</td>${kind === '14121' ? `<td style="${TD}${NR};font-weight:700">${fa(i.ca)}</td>` : ''}</tr>`).join('')}${row.items.length > 60 ? `<tr><td colspan="7" style="${TD};color:#667085">… ${row.items.length - 60} more items in the attachment</td></tr>` : ''}</table>`;
  const ccOf = (o, cfg, base, ex) => [...new Set([...base, ...String(o.cc || '').split(/[;,]/), ...String(o.defCc ? cfg.cc || '' : '').split(/[;,]/)].map(x => String(x).trim()).filter(x => /@/.test(x) && !ex.map(y => y.toLowerCase()).includes(x.toLowerCase())))];
  // email đối chiếu tới MỘT đối tượng (giao diện gọi lần lượt)
  handle('gr:mail', async (_e, kind, bp, o) => {
    const cfg = mailer.getConfig(Q); if (!cfg.host) throw new Error(I18.lang() === 'en' ? 'SMTP mail server is not configured. Go to Report → SMTP mail server to set it up.' : 'Chưa cấu hình máy chủ gửi mail (SMTP). Vào mục Báo cáo → Máy chủ gửi mail (SMTP) để thiết lập.');
    const rc = await grRecip(bp); if (!rc.to.length) return { ok: false, skip: true, error: I18.lang() === 'en' ? 'No email for this partner' : 'Đối tượng chưa có email' };
    const f = await grFiles(kind, bp, o), P = GX.pname(bp, f.r.row.info), dm = GX.dmy, fill = t => String(t || '').replace(/\{partner\}/g, P).replace(/\{contact\}/g, rc.names[0] || 'Sir/Madam').replace(/\{from\}/g, dm(f.r.from)).replace(/\{to\}/g, dm(f.r.to)).replace(/\{acc\}/g, f.r.acc);
    const html = grMailHtml(kind === '15611' ? 'Confirmation of goods' : 'Product liability confirmation', `${esc_(P)} · ${dm(f.r.from)} – ${dm(f.r.to)} · account ${esc_(f.r.acc)}`, esc_(fill(o.body)).replace(/\n/g, '<br>'), grItemsTable(kind, f.r.row), 'The confirmation (PDF and Excel) is attached. Please check, sign and return it, or reply with your figures and the reason for any difference.');
    const cc = ccOf(o, cfg, rc.cc, rc.to);
    const res = (await mailer.sendAll(Q, [{ to: rc.to.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: fill(o.subject), html, employee: bp, count: f.r.row.items.length, attachments: [{ name: f.base + '.pdf', base64: f.pdf.toString('base64') }, { name: f.base + '.xlsx', base64: f.xlsx.toString('base64') }] }]))[0];
    if (res.ok) await qa('grSetStatus', kind, [bp], 'sent', rc.to.join('; '), o.to);
    return { ...res, to: rc.to.join('; '), cc: cc.join('; ') };
  });
  // giao việc: một email cho nhân viên phụ trách, đính kèm PDF + Excel của từng đối tượng
  handle('gr:assignMail', async (_e, kind, bps, o) => {
    const EN = I18.lang() === 'en', T = (v, e) => EN ? e : v, cfg = mailer.getConfig(Q); if (!cfg.host) throw new Error(T('Chưa cấu hình máy chủ gửi mail (SMTP).', 'SMTP mail server is not configured.'));
    const emails = [...new Set(String(o.email || '').split(/[;,\s]+/).filter(x => /@/.test(x)))]; if (!emails.length) throw new Error(T('Nhân viên chưa có email', 'The staff member has no email address'));
    const att = [], R = []; for (const bp of bps) { let f; try { f = await grFiles(kind, bp, o); } catch { continue; } att.push({ name: f.base + '.pdf', base64: f.pdf.toString('base64') }, { name: f.base + '.xlsx', base64: f.xlsx.toString('base64') }); R.push({ bp, f, rc: await grRecip(bp) }); }
    if (!R.length) throw new Error(T('Các đối tượng đã chọn không có số liệu trong kỳ', 'The selected partners have no data in this period'));
    const dm = GX.dmy, r0 = R[0].f.r, sub = s0 => String(s0 || '').replace(/\{name\}/g, o.name || '').replace(/\{n\}/g, R.length).replace(/\{from\}/g, dm(r0.from)).replace(/\{to\}/g, dm(r0.to)).replace(/\{due\}/g, o.due ? dm(o.due) : '').replace(/\{acc\}/g, r0.acc);
    const tbl = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #EAECF0"><tr><th style="${TH}">#</th><th style="${TH}">${T('Đối tượng', 'Partner')}</th><th style="${TH}">${T('Email', 'Email')}</th><th style="${TH};text-align:right">${T('Số mặt hàng', 'Items')}</th><th style="${TH};text-align:right">${T('SL cuối kỳ', 'Closing qty')}</th>${kind === '14121' ? `<th style="${TH};text-align:right">${T('Giá trị cuối kỳ', 'Closing amount')}</th>` : ''}</tr>
${R.map((x, i) => `<tr><td style="${TD}">${i + 1}</td><td style="${TD}"><b>${esc_(GX.pname(x.bp, x.f.r.row.info))}</b><div style="color:#98A2B3;font-size:11px">${esc_(x.bp)}</div></td><td style="${TD}">${x.rc.to.length ? esc_(x.rc.to.join('; ')) : `<span style="color:#D92D20">${T('chưa có email', 'no email')}</span>`}</td><td style="${TD}${NR}">${x.f.r.row.items.length}</td><td style="${TD}${NR}">${fq(x.f.r.row.tot.cq)}</td>${kind === '14121' ? `<td style="${TD}${NR};font-weight:700">${fa(x.f.r.row.tot.ca)}</td>` : ''}</tr>`).join('')}</table>`;
    const html = grMailHtml(T(`Giao việc đối chiếu ${kind === '15611' ? 'hàng hoá' : 'vật tư'} ${r0.acc}`, `${kind === '15611' ? 'Goods' : 'Materials'} reconciliation assignment – ${r0.acc}`), `${T('Kỳ', 'Period')} ${dm(r0.from)} – ${dm(r0.to)} · ${R.length} ${T('đối tượng', 'partners')}${o.due ? ' · ' + T('hạn', 'due') + ' <b style="color:#FA4700">' + dm(o.due) + '</b>' : ''}`,
      esc_(sub(o.body)).replace(/\n/g, '<br>'), tbl, T(`Đính kèm biên bản đối chiếu từng đối tượng (PDF + Excel) – số liệu kỳ ${dm(r0.from)} – ${dm(r0.to)}.`, `Attached: confirmation for each partner (PDF + Excel) – figures for ${dm(r0.from)} – ${dm(r0.to)}.`));
    const cc = ccOf(o, cfg, [], emails);
    const res = (await mailer.sendAll(Q, [{ to: emails.join(', '), cc: cc.length ? cc.join(', ') : undefined, subject: sub(o.subject), html, employee: o.staff, count: R.length, attachments: att }]))[0];
    if (res.ok) await qa('grAssign', kind, R.map(x => x.bp), { ...o, mailed: true });
    return { ...res, n: R.length, files: att.length, cc: cc.join('; ') };
  });
  handle('td:import', async () => { const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsb'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const wb = XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), ws = wb.Sheets[wb.SheetNames.find(n => !wb.Sheets[n]['!hidden']) || wb.SheetNames[0]];
    return { ...(await qa('tdImport', XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }))), file: path.basename(filePaths[0]) }; });
  handle('sl:import', async (_e, mode) => { const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsb'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const wb = XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer', cellDates: true }), ws = wb.Sheets[wb.SheetNames.find(n => !wb.Sheets[n]['!hidden']) || wb.SheetNames[0]];
    const A = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }); return { ...(await qa('slImport', A, mode)), file: path.basename(filePaths[0]) }; });
  handle('pi:export', async () => { const A = await qa('piExport'), wb = XLSX.utils.book_new();
    for (const [k, nm] of [['partners', 'Doi tac'], ['contacts', 'Nguoi lien he'], ['banks', 'Tai khoan ngan hang']]) { const ws = XLSX.utils.aoa_to_sheet(A[k]); ws['!cols'] = A[k][0].map((_, i) => ({ wch: i === 0 ? 34 : 22 })); XLSX.utils.book_append_sheet(wb, ws, nm); }
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: 'DANH_MUC_DoiTac_LienHe.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); shell.showItemInFolder(filePath); return filePath; });
  handle('pi:importBanks', async () => { const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Export_C_BPartner (Code, Name, Account No, Account Name, IsEmoney, Bank Name, SwiftCode)', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'xlsb', 'csv'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const wb = XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), A = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }); return qa('piImportBanks', A); });
  handle('pi:import', async () => { const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }], properties: ['openFile'] }); if (canceled || !filePaths[0]) return null;
    const wb = XLSX.read(fs.readFileSync(filePaths[0]), { type: 'buffer' }), sh = re => { const n = wb.SheetNames.find(x => re.test(x)); return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false }) : []; };
    return qa('piImport', sh(/doi ?tac|partner/i), sh(/lien ?he|contact/i), sh(/tai ?khoan|bank/i)); });
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
    if (ds.length === 1) { const x = advSheets(ds[0], o.company, o.signers); return saveXlsx(`DoiChieuTamUng_${x.name.replace(/[^\w]+/g, '_').slice(0, 40)}_${o.asOf}.xlsx`, aoaBook(x.sheets)); }
    const sum = ds.map(d => ({ 'Mã NV': d.staff ? d.staff.code : '', 'Nhân viên': d.staff ? d.staff.name : d.partners[0], 'Phòng ban': d.staff ? d.staff.dept : '', 'Đầu kỳ': d.open, 'Tạm ứng': d.dr, 'Hoàn ứng': d.cr, 'Cuối kỳ': d.close, 'Khoản còn treo': d.items.length }));
    const sh = [['Tong hop', sum]]; ds.forEach((d, i) => { const x = advSheets(d, o.company, o.signers); sh.push([`${i + 1}_${x.name}`.replace(/[\\/*?:\[\]]/g, '').slice(0, 31), x.sheets[0][1].concat([[], ['KHOẢN CÒN TREO']], [['Ngày', 'Chứng từ', 'Đề nghị TƯ', 'Nội dung', 'Số tiền', 'Còn lại', 'Số ngày']], d.items.map(t => [t.d, t.doc, t.ar || '', t.ds, t.amt, t.left, t.age]))]); });
    return saveXlsx(`DoiChieuTamUng_${ds.length}NV_${o.asOf}.xlsx`, aoaBook(sh));
  });
  // Xem trước biên bản đối chiếu PDF trong cửa sổ riêng (trình xem PDF tích hợp) – không cần lưu file
  handle('adv:reconPdfPreview', async (_e, key, o) => { const d = await qa('advDetail', key, o), nm = d.staff ? d.staff.name : (d.partners[0] || key);
    const fp = path.join(os.tmpdir(), `AccSoft_XemTruoc_${String(nm).replace(/[^\w]+/g, '_').slice(0, 40)}_${Date.now()}.pdf`);
    fs.writeFileSync(fp, await advPdf(d, o.company, o.signers));
    // Mở bằng trình đọc PDF mặc định của máy (cửa sổ PDF nội bộ Electron không hiển thị được trên một số máy); file tạm xoá sau 30 phút / khi thoát
    const er = await shell.openPath(fp); if (er) throw new Error((I18.lang() === 'en' ? 'Cannot open PDF: ' : 'Không mở được PDF: ') + er);
    setTimeout(() => { try { fs.unlinkSync(fp); } catch { } }, 30 * 60e3).unref?.(); app.once('will-quit', () => { try { fs.unlinkSync(fp); } catch { } }); return fp; });
  handle('adv:reconPdf', async (_e, key, o) => { const d = await qa('advDetail', key, o), nm = d.staff ? d.staff.name : (d.partners[0] || key);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `DoiChieuTamUng_${nm.replace(/[^\w]+/g, '_').slice(0, 40)}_${d.asOf}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (canceled) return null;
    fs.writeFileSync(filePath, await advPdf(d, o.company, o.signers)); shell.openPath(filePath); return filePath; });
  handle('adv:reconMail', async (_e, keys, o) => {
    if (!mailer.getConfig(Q).host) throw new Error(I18.lang() === 'en' ? 'SMTP mail server is not configured. Go to Report → SMTP mail server to set it up.' : 'Chưa cấu hình máy chủ gửi mail (SMTP). Vào mục Báo cáo → Máy chủ gửi mail (SMTP) để thiết lập.');
    const esc = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), fmt = v => (+v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }), msgs = [], skip = [];
    for (const k of keys) { const d = await qa('advDetail', k, o), to = d.staff && (d.staff.email1 || d.staff.email2); if (!to) { skip.push(k); continue; }
      const x = advSheets(d, o.company, o.signers), nm = x.name, fill = t => String(t || '').replace(/\{name\}/g, nm).replace(/\{balance\}/g, fmt(d.close)).replace(/\{asOf\}/g, String(d.asOf).split('-').reverse().join('/'));
      const html = advMailHtml(d, (o.signers && o.signers.kind) || 'sum', fill(o.body), I18.lang() === 'en');
      const fn = `DoiChieuTamUng_${nm.replace(/[^\w]+/g, '_').slice(0, 40)}_${d.asOf}`, att = [{ name: fn + '.xlsx', base64: R.toBuffer(aoaBook(x.sheets)).toString('base64') }];
      if (o.pdf !== false) att.push({ name: fn + '.pdf', base64: Buffer.from(await advPdf(d, o.company, o.signers)).toString('base64') });
      const ccl = [...new Set([...String(o.cc || '').split(/[;,]/), ...String(o.defCc ? mailer.getConfig(Q).cc || '' : '').split(/[;,]/)].map(x => x.trim()).filter(x => /@/.test(x) && x.toLowerCase() !== String(to).toLowerCase()))]; // CC = CC nhập khi gửi + CC mặc định trong cấu hình SMTP
      msgs.push({ key: k, to, cc: ccl.length ? ccl.join(', ') : undefined, subject: fill(o.subject), html, employee: nm, count: d.items.length, amount: d.close, attachments: att });
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
app.commandLine.appendSwitch('lang', 'en-GB'); // ô ngày hiển thị dd/mm/yyyy
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
