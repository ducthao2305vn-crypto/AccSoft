const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { Store } = require('./db');
const mailer = require('./mailer');

let store;
async function initDb() {
  const file = path.join(app.getPath('userData'), 'accsoft.db');
  store = await Store.open(file);
  ipcMain.handle('db:import', (_e, name, hash, rows, replace) => store.importRows(name, hash, rows, replace));
  ipcMain.handle('db:months', () => store.listMonths());
  ipcMain.handle('db:deleteMonth', (_e, ym) => store.deleteMonth(ym));
  ipcMain.handle('db:load', () => store.loadAll());
  ipcMain.handle('db:list', () => store.listImports());
  ipcMain.handle('db:delete', (_e, id) => store.deleteImport(id));
  ipcMain.handle('db:clear', () => store.clear());
  ipcMain.handle('db:path', () => file);
  ipcMain.handle('db:getReviews', () => store.getReviews());
  ipcMain.handle('db:setReviews', (_e, list) => store.setReviews(list));
  ipcMain.handle('smtp:get', () => mailer.getConfig(store));
  ipcMain.handle('smtp:set', (_e, cfg) => mailer.setConfig(store, cfg));
  ipcMain.handle('smtp:verify', () => mailer.verify(store).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message || e) })));
  ipcMain.handle('mail:send', (_e, msgs) => mailer.sendAll(store, msgs));
  ipcMain.handle('mail:log', () => store.mailLog());
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('db:openFolder', () => shell.showItemInFolder(file));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: `AccSoft ${app.getVersion()} – Phân tích sổ hạch toán`,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Liên kết ngoài mở bằng trình duyệt mặc định, không mở trong app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Tệp', submenu: [{ role: 'reload', label: 'Tải lại' }, { type: 'separator' }, { role: 'quit', label: 'Thoát' }] },
  { label: 'Xem', submenu: [{ role: 'zoomIn', label: 'Phóng to' }, { role: 'zoomOut', label: 'Thu nhỏ' }, { role: 'resetZoom', label: 'Cỡ gốc' },
    { type: 'separator' }, { role: 'togglefullscreen', label: 'Toàn màn hình' }, { role: 'toggleDevTools', label: 'Công cụ phát triển' }] },
]));

app.whenReady().then(initDb).then(createWindow).catch(err => {
  dialog.showErrorBox('AccSoft – lỗi mở cơ sở dữ liệu', String(err && err.stack || err));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
