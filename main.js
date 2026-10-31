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

let win, Q, dbFile, busy = false;
const send = (ch, m) => win && !win.isDestroyed() && win.webContents.send(ch, m);

// Chạy một tác vụ ghi nặng trong worker; tiến độ được đẩy lên giao diện
function runTask(task, args, label) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'engine', 'worker.js'), { workerData: { dbPath: dbFile, task, args } });
    w.on('message', m => {
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
        let replace = false;
        if (r.conflicts.length) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'question', buttons: ['Thay thế dữ liệu các tháng này', 'Huỷ, bỏ qua file'], defaultId: 0, cancelId: 1,
            title: 'Tháng đã có dữ liệu', message: `${name}: các tháng ${r.conflicts.join(', ')} đã có dữ liệu.`,
            detail: 'Thay thế sẽ xoá dữ liệu cũ của các tháng này rồi dùng dữ liệu mới (trạng thái & ghi chú xử lý lỗi được giữ nếu bút toán không đổi).',
          });
          if (response === 1) { await runTask('cancel', { importId: r.importId }, 'Đang huỷ'); log.info(`Bỏ qua ${name} (tháng trùng)`); out.push(`– ${name}: bỏ qua`); continue; }
          replace = true;
        }
        await runTask('finalize', { importId: r.importId, replace }, 'Đang hoàn tất');
        const msg = `${r.rows.toLocaleString('vi')} dòng · ${r.months.join(', ')} · ${Math.round(r.secs)} giây`;
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

async function saveXlsx(defName, wb) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: defName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (canceled) return null;
  fs.writeFileSync(filePath, R.toBuffer(wb));
  shell.showItemInFolder(filePath);
  return filePath;
}

// Truy vấn đọc được phép gọi từ giao diện
const READ = ['meta', 'plRange', 'plTrend', 'analysisRange', 'analysisStatus', 'reviewPeriod', 'inventory', 'analysis', 'analysisDrill', 'errors', 'errorGroups', 'errorFacets', 'errorDetail', 'overview', 'pl', 'cost', 'aging', 'report', 'todo', 'months', 'imports', 'mailLog', 'stats'];
const WRITE = ['setReviewPeriod', 'setReviews', 'setStatusWhere', 'setStatusDoc', 'setMonths', 'setAllMonths'];

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
  Q = make(r.db);
  handle('q', (_e, name, ...args) => { if (!READ.includes(name) && !WRITE.includes(name)) throw new Error('Không hỗ trợ: ' + name); return Q[name](...args); });
  handle('app:info', () => ({ version: app.getVersion(), dbFile, needRecheck: r.needRecheck, appDir: appDir(), ...dbInfo }));
  handle('db:openFolder', () => shell.showItemInFolder(dbFile));
  handle('import:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : importFiles(filePaths);
  });
  handle('import:files', (_e, files) => importFiles(files));
  handle('enrich:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Chọn file ERP chỉ gồm các dòng TK 151–158', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : enrichFiles(filePaths);
  });
  handle('task', (_e, task, args) => exclusive(() => runTask(task, args, { deleteMonth: 'Đang xoá tháng', deleteImport: 'Đang xoá lần nạp', clear: 'Đang xoá dữ liệu', recheck: 'Đang phân tích lại toàn bộ dữ liệu', analyze: 'Đang phân tích dữ liệu' }[task])).then(r => { if (task === 'analyze' || task === 'recheck') log.info(`Phân tích dữ liệu ${JSON.stringify(args)}: ${r.rows} dòng, ${r.months} tháng, ${Math.round(r.secs)} giây`); return r; }));
  // Xuất Excel
  handle('export:errors', (_e, f, sort) => {
    const rows = Q.errors(f, sort, 0, 2e6).rows;
    const by = {}; for (const e of rows) { const k = e.user + '|' + e.k; by[k] = (by[k] || 0) + 1; }
    const byUser = Object.entries(by).map(([k, n]) => { const [u, c] = k.split('|'); return { 'Người nhập': u, 'Mã lỗi': c, 'Số lượng': n }; });
    return saveXlsx('AccSoft_LoiNhapLieu.xlsx', R.errorsBook(rows, byUser));
  });
  handle('export:analysis', (_e, title, rows) => saveXlsx(`AccSoft_${title}.xlsx`, R.book([[title.slice(0, 31), rows]])));
  handle('export:inventory', (_e, asOf, by, level, acc) => saveXlsx('AccSoft_TuoiHangTonKho.xlsx', R.inventoryBook(Q.inventory(asOf, by, level).items.filter(o => !acc || o.acc === acc))));
  handle('export:aging', (_e, asOf, term, level, grp, acc) => saveXlsx('AccSoft_TuoiNo.xlsx', R.agingBook(Q.aging(asOf, term, level).items.filter(o => (!grp || o.grp === grp) && (!acc || o.acc === acc)))));
  handle('export:report', (_e, minSev, group) => saveXlsx('AccSoft_BaoCaoKiemTra.xlsx',
    R.reportBook(Q.report(), Q.errors({ statusIn: ['fixed', 'ignore'] }, { k: 'user', d: 1 }, 0, 2e6).rows, Q.errors({ minSev, group, statusIn: ['open', 'doing'] }, { k: 'user', d: 1 }, 0, 2e6).rows)));
  handle('export:employee', (_e, user, minSev, group) => saveXlsx(`AccSoft_CanKhacPhuc_${R.shortName(user)}.xlsx`, R.book([['Can khac phuc', Q.employeeErrors(user, minSev, 100000, group).map(R.errRow)]])));
  // Email
  handle('mail:preview', (_e, user, o) => ({ subject: R.mailSubject(user), html: R.mailHtml(user, Q.employeeErrors(user, o.minSev, 100000, o.group), o), count: Q.employeeErrors(user, o.minSev, 100000, o.group).length }));
  handle('smtp:get', () => mailer.getConfig(Q));
  handle('smtp:set', (_e, cfg) => mailer.setConfig(Q, cfg));
  handle('smtp:verify', () => mailer.verify(Q).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) })));
  handle('mail:send', async (_e, list, o) => {
    const msgs = list.map(({ user, to }) => {
      const rows = Q.employeeErrors(user, o.minSev, 100000, o.group);
      return { user, rows, to, subject: R.mailSubject(user) + (o.test ? ' (THỬ)' : ''), html: R.mailHtml(user, rows, o),
        attachment: { name: `AccSoft_CanKhacPhuc_${R.shortName(user)}.xlsx`, base64: R.toBuffer(R.book([['Can khac phuc', rows.map(R.errRow)]])).toString('base64') },
        employee: user, count: rows.length };
    });
    const res = await mailer.sendAll(Q, msgs);
    if (!o.test && o.mark) {
      const ok = new Set(res.filter(r => r.ok).map(r => r.to));
      Q.setReviews(msgs.filter(m => ok.has(m.to)).flatMap(m => m.rows.filter(e => e.status === 'open')
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
  return false;
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
  if (needRecheck) win.webContents.once('did-finish-load', () => exclusive(() => runTask('recheck', {}, 'Đang rà soát lại dữ liệu theo bộ quy tắc mới')).then(() => { Q.setSetting('rules_version', String(RULES_VERSION)); log.info('Đã rà soát lại theo quy tắc phiên bản ' + RULES_VERSION); send('reload'); }).catch(e => { log.error('Nâng cấp CSDL thất bại', e); dialog.showErrorBox('AccSoft', firstLine(e.message) + '\n\nChi tiết: ' + log.file()); }));
}).catch(err => {
  log.error('Không khởi động được ứng dụng', err);
  dialog.showErrorBox('AccSoft – lỗi mở cơ sở dữ liệu', String(err && err.stack || err));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
