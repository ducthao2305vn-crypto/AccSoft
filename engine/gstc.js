'use strict';
// Báo cáo giám sát tài chính (biểu mẫu Tổng công ty): 7.1 công nợ phải thu (+ PL02 phân tích 131/138/141), 7.2 công nợ phải trả,
// 7.3 hàng tồn kho, 7.4 đầu tư lên tài sản, 7.7 tuân thủ thuế phí. Số dư công nợ theo nguyên tắc B01 (TK lưỡng tính theo đối tượng, TK khác số dư ròng),
// phân loại nhóm theo bảng quy tắc người dùng sửa được.
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const months = (f, t) => { const o = []; let [y, m] = f.split('-').map(Number); const [ty, tm] = t.split('-').map(Number); while (y < ty || (y === ty && m <= tm)) { o.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return o; };
const prevYm = ym => { const [y, m] = ym.split('-').map(Number); return m > 1 ? `${y}-${String(m - 1).padStart(2, '0')}` : `${y - 1}-12`; };

// Nhóm công nợ / phân loại theo mẫu
const AR_G = ['Phải thu doanh thu bán hàng tại các TT (thẻ cào, sim, kit…)', 'Cước kết nối trong nước', 'Cước kết nối quốc tế, roaming, thuê kênh', 'Phải thu tiền bán hàng của khách hàng', 'Thương mại điện tử', 'Thanh lý VTTB',
  'Dự thu lãi tiền gửi', 'Phải thu cầm cố, thế chấp, ký quỹ, ký cược', 'Phải thu khác', 'Tạm ứng tiền', 'Tạm ứng vật tư', 'Trả trước người bán'];
const AP_G = ['Phải trả tiền Hàng hóa,VTTB', 'Phải trả đối tác thuê kênh', 'Cước kết nối trong nước', 'Cước kết nối quốc tế, roaming, vas', 'Phải trả nợ vay cổ đông', 'Phải trả nợ vay ngân hàng', 'Phải trả lãi vay',
  'Phải trả lãi trả chậm', 'Thuế và các khoản phải nộp nhà nước', 'Phải trả người lao động', 'Phải trả khác'];
const INV_G = [['I', 'VẬT TƯ, THIẾT BỊ', ['Vật tư giao thầu', 'Vật tư mua đi đường', 'Vật tư ứng cứu thông tin', 'Vật tư phát triển mới CIP', 'VTTB khác']],
  ['II', 'HÀNG HÓA', ['Thẻ cào', 'Sim, Kit', 'Thiết bị đầu cuối', 'Hàng hóa khác', 'Vật tư cố định băng rộng AP', 'Hàng hóa đi đường']]];
const TAX_R = [['I', 'Nộp cơ quan thuế, hải quan', ['Thuế Giá trị gia tăng đầu ra', 'Thuế giá trị gia tăng phải nộp hàng nhập khẩu', 'Thuế tiêu thụ đặc biệt đầu vào mua hàng hàng mua trong nước', 'Thuế tiêu thụ đặc biệt đầu vào phát sinh khi nhập khẩu hàng',
  'Thuế tiêu thụ đặc biệt đầu ra', 'Thuế xuất nhập khẩu', 'Thuế mua hàng', 'Thuế thu nhập doanh nghiệp', 'Thuế TNCN', 'Thuế tài nguyên', 'Thuế nhà đất', 'Tiền thuê đất', 'Thuế Perception', 'Thuế tài sản', 'Thuế PATENTE',
  'Thuế quỹ lương', 'Thuế lãnh thổ theo lương', 'Lệ phí trước bạ', 'Phí, lệ phí hải quan', 'Thuế khác, minimum tax']],
  ['II', 'Thuế khấu trừ tại nguồn', ['Thuế chuyển lợi nhuận về nước', 'Thuế withholding khấu trừ từ cá nhân, tổ chức trong nước', 'Thuế withholding khấu trừ từ cá nhân, tổ chức nước ngoài', 'Thuế khấu trừ khác']],
  ['III', 'Nộp cho cơ quan quản lý', ['Thuế dịch vụ Viễn thông', 'Thuế viễn thông', 'Thuế lãnh thổ', 'Thuế biển hiệu', 'Phí chia sẻ doanh thu', 'Phí tần số, phí cấp giấy phép, phí kho số và kiểm định', 'Phí hội viên GSM quốc tế',
    'Quỹ thuế âm thanh & Thuế thành phố', 'Thuế khác (cơ quan quản lý)', 'Phí, lệ phí khác']],
  ['IV', 'Nộp công ty bảo hiểm', ['Bảo hiểm xã hội, y tế', 'Quỹ hưu trí', 'Bảo hiểm rủi ro nghề nghiệp', 'Quỹ bảo hộ lao động', 'Quỹ an sinh, hỗ trợ xã hội', 'Quỹ hỗ trợ khẩn cấp', 'Quỹ giáo dục', 'Khoản nộp khác']]];
// Quy tắc mặc định: [tiền tố TK, biểu thức đối tượng / mặt hàng (không phân biệt hoa thường, rỗng = mọi), nhóm] – dòng đầu tiên khớp được dùng
const DEF = {
  ar: [['13111', '^TLSV', 'Cước kết nối quốc tế, roaming, thuê kênh'], ['13111', 'INTER_|TIMOR TELECOM|TELKOM', 'Cước kết nối trong nước'], ['131', '', 'Phải thu tiền bán hàng của khách hàng'],
    ['13881', '', 'Phải thu doanh thu bán hàng tại các TT (thẻ cào, sim, kit…)'], ['244', '', 'Phải thu cầm cố, thế chấp, ký quỹ, ký cược'], ['1411', '', 'Tạm ứng tiền'], ['1412', '', 'Tạm ứng vật tư'],
    ['331', '', 'Trả trước người bán'], ['', '', 'Phải thu khác']],
  ap: [['331', '^TLSV', 'Cước kết nối quốc tế, roaming, vas'], ['331', 'INTER_|TIMOR TELECOM|TELKOM', 'Cước kết nối trong nước'], ['3353', '', 'Cước kết nối quốc tế, roaming, vas'], ['331', '', 'Phải trả tiền Hàng hóa,VTTB'],
    ['341', 'VTG|GLOBAL', 'Phải trả nợ vay cổ đông'], ['341', '', 'Phải trả nợ vay ngân hàng'], ['343', '', 'Phải trả nợ vay ngân hàng'], ['333', '', 'Thuế và các khoản phải nộp nhà nước'], ['334', '', 'Phải trả người lao động'], ['', '', 'Phải trả khác']],
  inv: [['15212', '', 'Vật tư giao thầu'], ['1412', '', 'Vật tư ứng cứu thông tin'], ['151', '', 'Vật tư mua đi đường'], ['15211', '', 'Vật tư phát triển mới CIP'], ['152', '', 'VTTB khác'], ['153', '', 'VTTB khác'],
    ['156', 'SIM|KIT', 'Sim, Kit'], ['156', 'SCRATCH|THẺ CÀO|CARD', 'Thẻ cào'], ['156', 'PHONE|HANDSET|DEVICE|ROUTER|ONT|CPE|MODEM|TERMINAL|ĐIỆN THOẠI', 'Thiết bị đầu cuối'], ['156', '^FTTH|^AP', 'Vật tư cố định băng rộng AP'],
    ['157', '', 'Hàng hóa đi đường'], ['', '', 'Hàng hóa khác']],
  tax: [['33311', '', 'Thuế Giá trị gia tăng đầu ra'], ['33312', '', 'Thuế giá trị gia tăng phải nộp hàng nhập khẩu'], ['33331', '', 'Thuế xuất nhập khẩu'], ['33332', '', 'Thuế mua hàng'], ['3334', '', 'Thuế thu nhập doanh nghiệp'],
    ['333524', '', 'Thuế TNCN'], ['3335', '', 'Thuế TNCN'], ['33381', '', 'Thuế withholding khấu trừ từ cá nhân, tổ chức nước ngoài'], ['333522', '', 'Thuế withholding khấu trừ từ cá nhân, tổ chức trong nước'],
    ['33385', '', 'Thuế dịch vụ Viễn thông'], ['3336', '', 'Tiền thuê đất'], ['3337', '', 'Thuế nhà đất'], ['3339', '', 'Phí, lệ phí khác'], ['3383', '', 'Bảo hiểm xã hội, y tế'], ['3384', '', 'Bảo hiểm xã hội, y tế'], ['333', '', 'Thuế khác, minimum tax']] };

function make(db, all, get, run, FIN, OI) {
  const getS = k => { try { return JSON.parse(get(`SELECT v FROM settings WHERE k=?`, k)?.v || 'null'); } catch { return null; } };
  const setS = (k, v) => run(`INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, JSON.stringify(v));
  const rules = () => ({ ...DEF, ...(getS('gs_rules') || {}) });
  function setRules(r) { const o = {}; for (const k of Object.keys(DEF)) if (Array.isArray(r?.[k])) o[k] = r[k].filter(x => Array.isArray(x) && x[2]).map(x => [String(x[0] || '').trim(), String(x[1] || '').trim(), String(x[2]).trim()]); setS('gs_rules', o); return rules(); }
  const matcher = list => { const L = list.map(([a, re, g]) => { let rx = null; try { rx = re ? new RegExp(re, 'i') : null; } catch { rx = null; } return [a, rx, g]; });
    return (acc, txt, fb) => { for (const [a, rx, g] of L) if (String(acc || '').startsWith(a) && (!rx || rx.test(txt || ''))) return g; return fb; }; };

  /* 7.1 / PL02 phải thu – 7.2 phải trả */
  function debtRep(kind, from, to, term) {
    const D = OI.debtsG(kind, from, to, term), G = kind === 'ap' ? AP_G : AR_G, M = matcher(rules()[kind]), rows = [];
    for (const s of D.secs) for (const r of s.rows) rows.push({ ...r, sec: s.no, grp: M(r.acc, r.bp, G[G.length - 1]) });
    const sum = (L, k) => L.reduce((t, x) => t + (x[k] || 0), 0), sumA = (L, k, i) => L.reduce((t, x) => t + ((x[k] || [])[i] || 0), 0);
    const summ = G.map(g => { const L = rows.filter(x => x.grp === g); return { g, n: L.length, ob: sum(L, 'ob'), cb: sum(L, 'cb'), ag: [0, 1, 2, 3, 4, 5].map(i => sumA(L, 'ag', i)), bad: sum(L, 'bad'), badOb: sum(L, 'badOb') }; });
    for (const s of summ) s.notDue = s.cb - s.ag.slice(1).reduce((a, b) => a + b, 0); // phần không quá hạn (gồm số âm của đối tượng dư ngược chiều trong TK ròng)
    return { from: D.from, to: D.to, d0: D.d0, d1: D.d1, rows, summ, groups: G, tb: D.secs.flatMap(s => s.tb), rest: D.rest };
  }

  /* 7.3 hàng tồn kho theo mặt hàng (tuổi tồn: ≤ 6 tháng, 6 tháng–1 năm, 1–2, 2–3, > 3 năm theo ngày nhập, FIFO) */
  function inv(from, to) {
    const R = OI.m04(from, to, 0), M = matcher(rules().inv), m = new Map();
    for (const s of R.secs) for (const x of s.rows) { const k = x.acc + '|' + x.code + '|' + x.name; let o = m.get(k);
      if (!o) m.set(k, o = { acc: x.acc, code: x.code, name: x.name, uom: x.uom, cat: M(x.acc, x.code + ' ' + x.name, 'Hàng hóa khác'), obQ: 0, obV: 0, inQ: 0, inV: 0, outQ: 0, outV: 0, cbQ: 0, cbV: 0, ag: [0, 0, 0, 0, 0] });
      for (const f of ['obQ', 'obV', 'inQ', 'inV', 'outQ', 'outV', 'cbQ', 'cbV']) o[f] += x[f] || 0;
      const b = [x.ok + x.od[0], x.od[1], x.od[2], x.od[3], x.od[4]]; b.forEach((v, i) => { o.ag[i] += v; }); }
    // tuổi tồn tính theo từng đối tượng giữ hàng → gộp mặt hàng: tổng tuổi không vượt tồn cuối (tồn ≤ 0 thì 0)
    for (const o of m.values()) { const t = o.ag.reduce((a, b) => a + b, 0); if (o.cbV <= 0.005) o.ag = [0, 0, 0, 0, 0]; else if (t > o.cbV) o.ag = o.ag.map(v => v * o.cbV / t); }
    const rows = [...m.values()].filter(o => Math.abs(o.cbV) > 0.005 || Math.abs(o.obV) > 0.005 || Math.abs(o.inV) > 0.005 || Math.abs(o.outV) > 0.005).sort((a, b) => a.cat.localeCompare(b.cat) || a.code.localeCompare(b.code));
    const summ = INV_G.map(([no, t, cats]) => ({ no, t, cats: cats.map(c => { const L = rows.filter(r => r.cat === c), S = k => L.reduce((a, r) => a + r[k], 0); return { c, n: L.length, obV: S('obV'), inV: S('inV'), outV: S('outV'), cbV: S('cbV'), ag: [0, 1, 2, 3, 4].map(i => L.reduce((a, r) => a + r.ag[i], 0)) }; }) }));
    const known = new Set(INV_G.flatMap(g => g[2])); for (const r of rows) if (!known.has(r.cat)) r.cat = 'Hàng hóa khác';
    return { from, to, rows, summ, ledger: R.secs.map(s => ({ pre: s.pre, ledger: s.ledger, rep: s.rows.reduce((a, x) => a + x.cbV, 0) })) };
  }

  /* 7.4 tình hình đầu tư lên tài sản: số dư đầu / cuối từng tháng TK 211, 213, 241, 152, 151 + điều chỉnh nhập tay */
  const ASSET = [['211', 'Tài khoản 211'], ['213', 'Tài khoản 213'], ['241', 'Tài khoản 241'], ['152', 'Tài khoản 152'], ['151', 'Tài khoản 151 (vật tư)']];
  const ADJ = [['dec152ap', 'Điều chỉnh giảm – 152 AP', -1], ['dec152cp', 'Điều chỉnh giảm – 152 (số dư cuối kỳ xác định là chi phí)', -1], ['decLease', 'Điều chỉnh giảm – chi phí thuê hoạt động chuyển sang thuê tài chính', -1], ['incLiq', 'Điều chỉnh tăng – thanh lý tài sản', 1]];
  function invest(from, to) {
    const bal = (pre, ym) => get(`SELECT ifnull(sum(dr) - sum(cr), 0) v FROM fin_mv WHERE ym<=? AND acc>=? AND acc<?`, ym, pre, pre.slice(0, -1) + String.fromCharCode(pre.charCodeAt(pre.length - 1) + 1)).v;
    const adj = getS('gs_adj74') || {}, rate = getS('gs_rate74') || {};
    const cols = months(from, to).map(m => { const p = prevYm(m), a = adj[m] || {};
      const o = { ym: m, ob: Object.fromEntries(ASSET.map(([k]) => [k, bal(k, p)])), cb: Object.fromEntries(ASSET.map(([k]) => [k, bal(k, m)])), adj: Object.fromEntries(ADJ.map(([k, , sg]) => [k, sg * Math.abs(+a[k] || 0)])), rate: +rate[m] || 1 };
      o.inc = ASSET.reduce((s, [k]) => s + o.cb[k] - o.ob[k], 0) + ADJ.reduce((s, [k]) => s + o.adj[k], 0);
      return o; });
    // luỹ kế đầu tư đến cuối từng tháng = tổng số dư các TK + điều chỉnh luỹ kế đã nhập đến tháng đó
    let cumAdj = Object.entries(adj).filter(([m]) => m < (cols[0]?.ym || '')).reduce((s, [, a]) => s + ADJ.reduce((t, [k, , sg]) => t + sg * Math.abs(+a[k] || 0), 0), 0);
    for (const c of cols) { cumAdj += ADJ.reduce((s, [k]) => s + c.adj[k], 0); c.cum = ASSET.reduce((s, [k]) => s + c.cb[k], 0) + cumAdj; }
    return { from, to, assets: ASSET, adjs: ADJ, cols };
  }
  function setInvestAdj(ym, vals, rate) { const a = getS('gs_adj74') || {}; a[ym] = vals || {}; setS('gs_adj74', a); if (rate != null) { const r = getS('gs_rate74') || {}; r[ym] = +rate || 1; setS('gs_rate74', r); } return true; }

  /* 7.7 tuân thủ thuế phí: số phải nộp (PS Có), đã nộp (PS Nợ), còn phải nộp theo tháng của năm báo cáo + luỹ kế đến hết năm trước */
  function tax(year) {
    const M = matcher(rules().tax), pres = [...new Set(rules().tax.map(r => r[0]).filter(Boolean))], m = new Map(), Y = +year;
    const like = col => '(' + pres.map(p => `${col} LIKE '${p.replace(/'/g, '')}%'`).join(' OR ') + ')';
    for (const [side, sg] of [['credit', 1], ['debit', -1]]) for (const r of all(`SELECT acc_${side} a, CASE WHEN ym<? THEN 'P' ELSE ym END k, sum(amount) v FROM entries WHERE ym<=? AND ${like('acc_' + side)} AND NOT (acc_debit=acc_credit) GROUP BY 1,2`, `${Y}-01`, `${Y}-12`)) {
      const row = M(r.a, '', null); if (!row) continue; const o = m.get(row) || m.set(row, {}).get(row), x = o[r.k] || (o[r.k] = { due: 0, paid: 0 }); if (sg > 0) x.due += r.v; else x.paid += r.v; }
    const ms = months(`${Y}-01`, `${Y}-12`);
    const secs = TAX_R.map(([no, t, items]) => ({ no, t, rows: items.map(n => { const o = m.get(n) || {}, P = o.P || { due: 0, paid: 0 }; let bal = P.due - P.paid;
      const mm = ms.map(k => { const x = o[k] || { due: 0, paid: 0 }; bal += x.due - x.paid; return { ym: k, due: x.due, paid: x.paid, bal }; });
      return { n, prior: { due: P.due, paid: P.paid, bal: P.due - P.paid }, year: { due: mm.reduce((s, x) => s + x.due, 0), paid: mm.reduce((s, x) => s + x.paid, 0), bal }, mm }; }) }));
    return { year: Y, secs, accs: pres };
  }

  function compute(o = {}) {
    const { from, to } = o, term = +o.term || 30;
    return { from, to, term, ar: debtRep('ar', from, to, term), ap: debtRep('ap', from, to, term), inv: inv(from, to), invest: invest(from, to), tax: tax(to.slice(0, 4)), rules: rules(), groups: { ar: AR_G, ap: AP_G, inv: INV_G, tax: TAX_R } };
  }
  return { compute, rules, setRules, setInvestAdj, defaults: () => DEF };
}
module.exports = { make, AR_G, AP_G, INV_G, TAX_R };
