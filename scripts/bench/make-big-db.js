// Nhân đôi dữ liệu hạch toán (lùi N năm, số chứng từ thêm hậu tố) để thử hiệu năng với dữ liệu lớn.
// CHỈ dùng trên bản sao CSDL thử nghiệm! Dùng: node scripts/bench/make-big-db.js <accsoft.db> [số năm lùi = 4]
// Sau đó: chạy analyze.js '{}' rồi `node -e "require('./engine/db').rebuildAgg(require('./engine/db').open(F).db)"` để dựng sổ tổng hợp.
const { DatabaseSync } = require('node:sqlite');
const file = process.argv[2]; if (!file) throw new Error('Thiếu đường dẫn CSDL thử nghiệm');
const N = +(process.argv[3] || 4), db = new DatabaseSync(file);
const cols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name).filter(c => c !== 'id');
const yr = c => `CASE WHEN ${c} IS NULL THEN NULL ELSE printf('%04d',cast(substr(${c},1,4) as int)-${N})||substr(${c},5) END`;
const map = c => c === 'ym' || c === 'account_date' || c === 'due_date' ? yr(c) : c === 'document_no' ? `document_no||'-H${N}'` : c;
db.exec(`INSERT INTO entries(${cols.join(',')}) SELECT ${cols.map(map).join(',')} FROM entries; INSERT OR IGNORE INTO months(ym) SELECT DISTINCT ym FROM entries WHERE ym IS NOT NULL;`);
console.log('Số dòng:', db.prepare('SELECT count(*) n FROM entries').get().n);
