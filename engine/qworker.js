'use strict';
// Worker truy vấn thường trực: mọi truy vấn đọc chạy ở đây để cửa sổ ứng dụng không bị treo khi dữ liệu lớn.
// Kết quả truy vấn đọc được giữ trong bộ nhớ đệm cho tới khi dữ liệu thay đổi (tác vụ ghi xong, hoặc truy vấn ghi chạy ở đây)
// → mở lại trang, đổi tab trên dữ liệu 1–2 triệu dòng gần như tức thì.
const { parentPort, workerData } = require('worker_threads');
const { open } = require('./db');
const { make } = require('./queries');

const { db } = open(workerData.dbPath);
const Q = make(db);
const CACHEABLE = new Set(workerData.cache || []), cache = new Map(), MAX = 300;
// Làm nóng: khi rảnh, tính sẵn các trang hay mở nhất để người dùng mở ra là có ngay
const WARM = [['overview', []], ['errorFacets', []], ['report', []], ['analysisStatus', []], ['months', []], ['stats', []]];
let warmTimer = null;
function warm(i = 0) {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => { const [n, a] = WARM[i] || []; if (!n) return;
    const key = n + '\u0000' + JSON.stringify(a);
    if (!cache.has(key)) try { cache.set(key, Q[n](...a)); } catch (e) { /* bỏ qua */ }
    warm(i + 1); }, i ? 0 : 1500);
}
warm();
parentPort.on('message', ({ id, name, args, invalidate }) => {
  if (invalidate) { cache.clear(); warm(); return; }
  try {
    const key = CACHEABLE.has(name) ? name + '\u0000' + JSON.stringify(args || []) : null;
    if (key && cache.has(key)) return parentPort.postMessage({ id, ok: true, result: cache.get(key) });
    const result = Q[name](...(args || []));
    if (key) { if (cache.size >= MAX) cache.delete(cache.keys().next().value); cache.set(key, result); }
    else { cache.clear(); warm(); } // truy vấn ghi (đổi trạng thái lỗi, kỳ rà soát, tháng…) → kết quả cũ không còn đúng
    parentPort.postMessage({ id, ok: true, result });
  } catch (e) { parentPort.postMessage({ id, ok: false, error: String(e && e.message || e), stack: String(e && e.stack || e) }); }
});
