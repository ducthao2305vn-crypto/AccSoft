'use strict';
// Worker truy vấn thường trực: mọi truy vấn đọc chạy ở đây để cửa sổ ứng dụng không bị treo khi dữ liệu lớn
const { parentPort, workerData } = require('worker_threads');
const { open } = require('./db');
const { make } = require('./queries');

const { db } = open(workerData.dbPath);
const Q = make(db);
parentPort.on('message', ({ id, name, args }) => {
  try { parentPort.postMessage({ id, ok: true, result: Q[name](...(args || [])) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, error: String(e && e.message || e), stack: String(e && e.stack || e) }); }
});
