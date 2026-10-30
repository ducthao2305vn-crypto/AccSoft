'use strict';
// Nhật ký lỗi: <thư mục dữ liệu>/logs/accsoft-YYYY-MM-DD.log – mỗi dòng có thời điểm, mức độ, nội dung và stack đầy đủ
const fs = require('fs');
const path = require('path');

let dir = null;
const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function init(logDir) {
  dir = logDir;
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Giữ nhật ký 60 ngày gần nhất
    const old = Date.now() - 60 * 864e5;
    for (const f of fs.readdirSync(dir)) if (/^accsoft-.*\.log$/.test(f) && fs.statSync(path.join(dir, f)).mtimeMs < old) fs.unlinkSync(path.join(dir, f));
  } catch (e) { /* không chặn ứng dụng nếu không ghi được log */ }
}
const file = () => dir && path.join(dir, `accsoft-${stamp(new Date()).slice(0, 10)}.log`);

function write(level, msg, err, extra) {
  const lines = [`[${stamp(new Date())}] ${level.toUpperCase()} ${msg}`];
  if (extra) lines.push('  ' + JSON.stringify(extra));
  if (err) lines.push(String(err && err.stack || err).split('\n').map(l => '  ' + l).join('\n'));
  const text = lines.join('\n') + '\n';
  if (level === 'error') console.error(text); else console.log(text);
  try { if (dir) fs.appendFileSync(file(), text); } catch (e) { /* bỏ qua */ }
}
module.exports = {
  init, file, dir: () => dir,
  info: (m, x) => write('info', m, null, x),
  warn: (m, e, x) => write('warn', m, e, x),
  error: (m, e, x) => write('error', m, e, x),
};
