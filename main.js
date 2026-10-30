const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const { open } = require('./engine/db');
const { make } = require('./engine/queries');
const R = require('./engine/reports');
const mailer = require('./mailer');

let win, Q, dbFile, busy = false;
const send = (ch, m) => win && !win.isDestroyed() && win.webContents.send(ch, m);

// Chạy một tác vụ ghi nặng trong worker; tiến độ được đẩy lên giao diện
function runTask(task, args, label) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'engine', 'worker.js'), { workerData: { dbPath: dbFile, task, args } });
    w.on('message', m => {
      if (m.type === 'progress') send('progress', { label, ...m });
      else if (m.type === 'done') resolve(m.result);
      else if (m.type === 'error') reject(new Error(m.error));
    });
    w.on('error', reject);
  });
}
async function exclusive(fn) {
  if (busy) throw new Error('Đang có tác vụ khác chạy, vui lòng đợi.');
  busy = true;
  try { return await fn(); } finally { busy = false; send('progress', { done: true }); }
}

async function importFiles(files) {
  return exclusive(async () => {
    const log = [];
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
          if (response === 1) { await runTask('cancel', { importId: r.importId }, 'Đang huỷ'); log.push(`${name}: bỏ qua`); continue; }
          replace = true;
        }
        await runTask('finalize', { importId: r.importId, replace }, 'Đang hoàn tất');
        log.push(`${name}: ${r.rows.toLocaleString('vi')} dòng · ${r.months.join(', ')} · ${Math.round(r.secs)} giây`);
      } catch (e) { log.push(`${name}: LỖI – ${e.message}`); }
    }
    return log;
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
const READ = ['meta', 'errors', 'errorGroups', 'errorFacets', 'errorDetail', 'overview', 'pl', 'cost', 'aging', 'report', 'todo', 'months', 'imports', 'mailLog', 'stats'];
const WRITE = ['setReviews', 'setStatusWhere', 'setStatusDoc', 'setMonths', 'setAllMonths'];

async function init() {
  dbFile = path.join(app.getPath('userData'), 'accsoft.db');
  const r = open(dbFile, { cleanup: true });
  Q = make(r.db);
  ipcMain.handle('q', (_e, name, ...args) => { if (!READ.includes(name) && !WRITE.includes(name)) throw new Error('Không hỗ trợ: ' + name); return Q[name](...args); });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dbFile, needRecheck: r.needRecheck }));
  ipcMain.handle('db:openFolder', () => shell.showItemInFolder(dbFile));
  ipcMain.handle('import:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Dữ liệu hạch toán', extensions: ['xlsx', 'csv', 'txt'] }] });
    return canceled ? null : importFiles(filePaths);
  });
  ipcMain.handle('import:files', (_e, files) => importFiles(files));
  ipcMain.handle('task', (_e, task, args) => exclusive(() => runTask(task, args, { deleteMonth: 'Đang xoá tháng', deleteImport: 'Đang xoá lần nạp', clear: 'Đang xoá dữ liệu', recheck: 'Đang kiểm tra lại dữ liệu' }[task])));
  // Xuất Excel
  ipcMain.handle('export:errors', (_e, f, sort) => {
    const rows = Q.errors(f, sort, 0, 2e6).rows;
    const by = {}; for (const e of rows) { const k = e.user + '|' + e.k; by[k] = (by[k] || 0) + 1; }
    const byUser = Object.entries(by).map(([k, n]) => { const [u, c] = k.split('|'); return { 'Người nhập': u, 'Mã lỗi': c, 'Số lượng': n }; });
    return saveXlsx('AccSoft_LoiNhapLieu.xlsx', R.errorsBook(rows, byUser));
  });
  ipcMain.handle('export:aging', (_e, asOf, term, level, grp, acc) => saveXlsx('AccSoft_TuoiNo.xlsx', R.agingBook(Q.aging(asOf, term, level).items.filter(o => (!grp || o.grp === grp) && (!acc || o.acc === acc)))));
  ipcMain.handle('export:report', (_e, minSev) => saveXlsx('AccSoft_BaoCaoKiemTra.xlsx',
    R.reportBook(Q.report(), Q.errors({ statusIn: ['fixed', 'ignore'] }, { k: 'user', d: 1 }, 0, 2e6).rows, Q.errors({ minSev, statusIn: ['open', 'doing'] }, { k: 'user', d: 1 }, 0, 2e6).rows)));
  ipcMain.handle('export:employee', (_e, user, minSev) => saveXlsx(`AccSoft_CanKhacPhuc_${R.shortName(user)}.xlsx`, R.book([['Can khac phuc', Q.employeeErrors(user, minSev).map(R.errRow)]])));
  // Email
  ipcMain.handle('mail:preview', (_e, user, o) => ({ subject: R.mailSubject(user), html: R.mailHtml(user, Q.employeeErrors(user, o.minSev), o), count: Q.employeeErrors(user, o.minSev).length }));
  ipcMain.handle('smtp:get', () => mailer.getConfig(Q));
  ipcMain.handle('smtp:set', (_e, cfg) => mailer.setConfig(Q, cfg));
  ipcMain.handle('smtp:verify', () => mailer.verify(Q).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) })));
  ipcMain.handle('mail:send', async (_e, list, o) => {
    const msgs = list.map(({ user, to }) => {
      const rows = Q.employeeErrors(user, o.minSev);
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
  ipcMain.handle('util:emailOf', (_e, u) => R.emailOf(u));
  return r.needRecheck;
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
  { label: 'Tệp', submenu: [{ role: 'reload', label: 'Tải lại' }, { type: 'separator' }, { role: 'quit', label: 'Thoát' }] },
  { label: 'Xem', submenu: [{ role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ gốc' },
    { type: 'separator' }, { role: 'togglefullscreen', label: 'Toàn màn hình' }, { role: 'toggleDevTools', label: 'Công cụ phát triển' }] },
]));

app.whenReady().then(init).then(async needRecheck => {
  createWindow();
  // CSDL từ phiên bản cũ: tính lại bảng lỗi một lần
  if (needRecheck) win.webContents.once('did-finish-load', () => exclusive(() => runTask('recheck', {}, 'Đang nâng cấp CSDL từ phiên bản cũ')).then(() => send('reload')).catch(e => dialog.showErrorBox('AccSoft', e.message)));
}).catch(err => {
  dialog.showErrorBox('AccSoft – lỗi mở cơ sở dữ liệu', String(err && err.stack || err));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
