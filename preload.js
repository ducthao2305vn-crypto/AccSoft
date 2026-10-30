const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('accsoft', {
  importRows: (fileName, hash, rows) => ipcRenderer.invoke('db:import', fileName, hash, rows),
  loadAll: () => ipcRenderer.invoke('db:load'),
  listImports: () => ipcRenderer.invoke('db:list'),
  deleteImport: id => ipcRenderer.invoke('db:delete', id),
  clear: () => ipcRenderer.invoke('db:clear'),
  dbPath: () => ipcRenderer.invoke('db:path'),
  openDbFolder: () => ipcRenderer.invoke('db:openFolder'),
});
