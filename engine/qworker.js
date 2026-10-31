'use strict';
// Worker truy vấn (main.js chạy 2–3 worker song song, giữ bộ nhớ đệm và điều phối) – mỗi worker chỉ thực thi truy vấn.
const { parentPort, workerData } = require('worker_threads');
const { open } = require('./db');
const { make } = require('./queries');

const { db } = open(workerData.dbPath, { light: true });
const Q = make(db);
parentPort.on('message', ({ id, name, args }) => {
  try { parentPort.postMessage({ id, ok: true, result: Q[name](...(args || [])) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, error: String(e && e.message || e), stack: String(e && e.stack || e) }); }
});
