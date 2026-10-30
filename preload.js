const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('accsoft', {
  importRows: (fileName, hash, rows, replace) => ipcRenderer.invoke('db:import', fileName, hash, rows, replace),
  listMonths: () => ipcRenderer.invoke('db:months'),
  deleteMonth: ym => ipcRenderer.invoke('db:deleteMonth', ym),
  loadAll: () => ipcRenderer.invoke('db:load'),
  listImports: () => ipcRenderer.invoke('db:list'),
  deleteImport: id => ipcRenderer.invoke('db:delete', id),
  clear: () => ipcRenderer.invoke('db:clear'),
  getReviews: () => ipcRenderer.invoke('db:getReviews'),
  setReviews: list => ipcRenderer.invoke('db:setReviews', list),
  version: () => ipcRenderer.invoke('app:version'),
  dbPath: () => ipcRenderer.invoke('db:path'),
  openDbFolder: () => ipcRenderer.invoke('db:openFolder'),
});
