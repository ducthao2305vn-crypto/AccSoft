// Đo thời gian "lạnh" (không bộ nhớ đệm) của các truy vấn chính trên CSDL thật.
// Dùng: node scripts/bench/queries.js [đường dẫn accsoft.db]   (mặc định AccSoft_Data/accsoft.db)
const path = require('path');
const { open } = require('../../engine/db');
const { db } = open(process.argv[2] || path.join(__dirname, '../../AccSoft_Data/accsoft.db'));
const q = require('../../engine/queries').make(db);
const T = (l, f) => { const t = Date.now(); try { f(); } catch (e) { return console.log('ERR', l, e.message); } const ms = Date.now() - t; console.log(String(ms).padStart(6), 'ms', ms > 1000 ? '⚠' : ' ', l); };
const ov = q.overview(), ld = ov.dmax, y = String(ld || '').slice(0, 4);
console.log(`${ov.rows} dòng, ${ov.errs} cảnh báo, dữ liệu đến ${ld}`);
T('months', () => q.months()); T('stats', () => q.stats()); T('overview', () => q.overview()); T('errorFacets', () => q.errorFacets());
T('errors (trang đầu)', () => q.errors({}, { k: 'sev', d: 1 }, 0, 200)); T('errorGroups', () => q.errorGroups({}, 0, 200)); T('report', () => q.report()); T('todo', () => q.todo('L', ''));
T('pl', () => q.pl()); T('plRange', () => q.plRange(y + '-01', ld.slice(0, 7))); T('aging', () => q.aging(ld, 30, 'l1', 'bp')); T('inventory', () => q.inventory(ld, 'product', 'l1'));
T('finTrial', () => q.finTrial(y + '-01', ld.slice(0, 7), 1)); T('finBalance', () => q.finBalance(y + '-01', ld.slice(0, 7))); T('finCash', () => q.finCash(y + '-01', ld.slice(0, 7))); T('finNotes', () => q.finNotes(y + '-01', ld.slice(0, 7)));
T('deepStaff', () => q.deepStaff('', '')); T('deepReversal', () => q.deepReversal(y + '-01', ld.slice(0, 7))); T('deepVendors', () => q.deepVendors(y + '-01', ld.slice(0, 7)));
