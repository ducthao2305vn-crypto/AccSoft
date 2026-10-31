// Chạy tác vụ "Phân tích dữ liệu" ngoài giao diện và in mốc thời gian từng bước (theo nhãn tiến độ).
// Dùng: node scripts/bench/analyze.js '{"from":"2026-10","to":"2026-10"}' [đường dẫn accsoft.db]   – '{}' = toàn bộ
const path = require('path'), { Worker } = require('worker_threads');
const t0 = Date.now(); let last = '';
const w = new Worker(path.join(__dirname, '../../engine/worker.js'), { workerData: { dbPath: process.argv[3] || path.join(__dirname, '../../AccSoft_Data/accsoft.db'), task: 'analyze', args: JSON.parse(process.argv[2] || '{}') } });
w.on('message', m => {
  if (m.type === 'progress') { if (m.label !== last) { console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), 's', m.label); last = m.label; } }
  else { console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), 's', m.type, JSON.stringify(m.result || m.error)); process.exit(); }
});
