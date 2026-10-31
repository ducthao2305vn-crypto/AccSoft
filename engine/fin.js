'use strict';
// Bảng cân đối số phát sinh + Báo cáo tài chính (B01, B02, B03-DN theo Thông tư 99/2025/TT-BTC, rút gọn) dựng từ dữ liệu hạch toán.
// Không có số dư đầu kỳ thì số đầu kỳ = 0 (chỉ cộng các bút toán trước kỳ đã nạp, kể cả số dư đầu kỳ nhập từ file mẫu – TK giả 'OB').
const L1 = { '111': 'Tiền mặt', '112': 'Tiền gửi ngân hàng', '113': 'Tiền đang chuyển', '121': 'Chứng khoán kinh doanh', '128': 'Đầu tư nắm giữ đến ngày đáo hạn',
  '131': 'Phải thu của khách hàng', '133': 'Thuế GTGT được khấu trừ', '136': 'Phải thu nội bộ', '138': 'Phải thu khác', '141': 'Tạm ứng', '151': 'Hàng mua đang đi đường',
  '152': 'Nguyên liệu, vật liệu', '153': 'Công cụ, dụng cụ', '154': 'Chi phí SXKD dở dang', '155': 'Thành phẩm', '156': 'Hàng hoá', '157': 'Hàng gửi đi bán', '158': 'Hàng hoá kho bảo thuế',
  '211': 'TSCĐ hữu hình', '212': 'TSCĐ thuê tài chính', '213': 'TSCĐ vô hình', '214': 'Hao mòn TSCĐ', '217': 'Bất động sản đầu tư', '221': 'Đầu tư vào công ty con', '222': 'Đầu tư vào công ty liên doanh, liên kết',
  '228': 'Đầu tư khác', '229': 'Dự phòng tổn thất tài sản', '241': 'Xây dựng cơ bản dở dang', '242': 'Chi phí trả trước', '243': 'Tài sản thuế thu nhập hoãn lại', '244': 'Cầm cố, thế chấp, ký quỹ, ký cược',
  '331': 'Phải trả cho người bán', '333': 'Thuế và các khoản phải nộp Nhà nước', '334': 'Phải trả người lao động', '335': 'Chi phí phải trả', '336': 'Phải trả nội bộ', '337': 'Thanh toán theo tiến độ HĐXD',
  '338': 'Phải trả, phải nộp khác', '341': 'Vay và nợ thuê tài chính', '343': 'Trái phiếu phát hành', '344': 'Nhận ký quỹ, ký cược', '347': 'Thuế TNDN hoãn lại phải trả', '352': 'Dự phòng phải trả',
  '353': 'Quỹ khen thưởng, phúc lợi', '356': 'Quỹ phát triển khoa học công nghệ', '411': 'Vốn đầu tư của chủ sở hữu', '412': 'Chênh lệch đánh giá lại tài sản', '413': 'Chênh lệch tỷ giá hối đoái',
  '414': 'Quỹ đầu tư phát triển', '418': 'Các quỹ thuộc vốn chủ sở hữu', '419': 'Cổ phiếu quỹ', '421': 'Lợi nhuận sau thuế chưa phân phối', '441': 'Nguồn vốn đầu tư XDCB',
  '511': 'Doanh thu bán hàng và cung cấp dịch vụ', '515': 'Doanh thu hoạt động tài chính', '521': 'Các khoản giảm trừ doanh thu', '611': 'Mua hàng', '621': 'Chi phí nguyên liệu, vật liệu trực tiếp',
  '622': 'Chi phí nhân công trực tiếp', '623': 'Chi phí sử dụng máy thi công', '627': 'Chi phí sản xuất chung', '631': 'Giá thành sản xuất', '632': 'Giá vốn hàng bán', '635': 'Chi phí tài chính',
  '641': 'Chi phí bán hàng', '642': 'Chi phí quản lý doanh nghiệp', '711': 'Thu nhập khác', '811': 'Chi phí khác', '821': 'Chi phí thuế TNDN', '911': 'Xác định kết quả kinh doanh', OB: 'Số dư đầu kỳ (đối ứng nhập từ file mẫu)' };

function make(all, okYm, INC, plRange) {
  const nameOf = (a, n) => { const k = a.slice(0, 3); return a.length <= 3 || a === 'OB' ? (L1[a] || n || a) : (n ? String(n).replace(/^[^_]*_/, '') : L1[k] || a); };

  // Đọc từ sổ số dư tổng hợp (fin_close / fin_mv / fin_pmv – xem db.rebuildFin): số đầu kỳ của mọi tháng có sẵn, không cộng lại lịch sử.
  // Báo cáo tài chính luôn dùng toàn bộ dữ liệu đã nạp (không phụ thuộc lựa chọn tháng "đưa vào phân tích") để số dư liên tục.
  const prevYm = m => { const y = +m.slice(0, 4), mo = +m.slice(5) - 1; return mo ? `${y}-${String(mo).padStart(2, '0')}` : `${y - 1}-12`; };
  const names = () => new Map(all(`SELECT acc, max(name) n FROM fin_mv GROUP BY acc`).map(r => [r.acc, r.n]));
  // Số dư cuối tháng `at` theo TK chi tiết (tháng không phát sinh: lấy tháng gần nhất trước đó)
  const closeAt = at => new Map(all(`SELECT c.acc, c.cb FROM fin_close c JOIN (SELECT acc, max(ym) ym FROM fin_close WHERE ym<=? GROUP BY acc) l ON l.acc=c.acc AND l.ym=c.ym`, at).map(r => [r.acc, r.cb]));
  function status() {
    const r = get1(`SELECT min(ym) a, max(ym) b, count(DISTINCT ym) n, (SELECT count(*) FROM fin_mv) mv FROM fin_close`);
    return { from: r.a, to: r.b, months: r.n, rows: r.mv, built: (get1(`SELECT v FROM settings WHERE k='fin_built'`) || {}).v || null };
  }
  const get1 = (q, ...a) => all(q, ...a)[0] || {};

  /* Bảng cân đối số phát sinh. level: 1 = TK cấp 1 (3 số), 0 = chi tiết */
  function trial(from, to, level = 1) {
    const f = okYm(from) || '0000-00', t = okYm(to) || '9999-12', K = a => !level || a === 'OB' ? a : a.slice(0, 3), N = names();
    const m = new Map(), get = a => m.get(K(a)) || m.set(K(a), { a: K(a), n: nameOf(K(a), N.get(a)), ob: 0, dr: 0, cr: 0 }).get(K(a));
    const open = f === '0000-00' ? new Map() : closeAt(prevYm(f));
    for (const [a, v] of open) get(a).ob += v;
    for (const r of all(`SELECT acc, sum(dr) dr, sum(cr) cr FROM fin_mv WHERE ym>=? AND ym<=? GROUP BY acc`, f, t)) { const o = get(r.acc); o.dr += r.dr; o.cr += r.cr; }
    const rows = [...m.values()].map(o => { const cb = o.ob + o.dr - o.cr; return { a: o.a, n: o.n, obDr: o.ob > 0 ? o.ob : 0, obCr: o.ob < 0 ? -o.ob : 0, dr: o.dr, cr: o.cr, cbDr: cb > 0 ? cb : 0, cbCr: cb < 0 ? -cb : 0, bal: cb }; })
      .filter(r => Math.abs(r.obDr) + Math.abs(r.obCr) + Math.abs(r.dr) + Math.abs(r.cr) > 0.004).sort((a, b) => a.a.localeCompare(b.a));
    const tot = rows.reduce((s, r) => { for (const k of ['obDr', 'obCr', 'dr', 'cr', 'cbDr', 'cbCr']) s[k] += r[k]; return s; }, { obDr: 0, obCr: 0, dr: 0, cr: 0, cbDr: 0, cbCr: 0 });
    const hasOpening = f !== '0000-00' && !!all(`SELECT 1 FROM fin_mv WHERE ym<? LIMIT 1`, f).length;
    return { from: f === '0000-00' ? null : f, to: t === '9999-12' ? null : t, level, rows, tot, hasOpening };
  }

  /* Số dư TK công nợ theo từng đối tượng tại cuối các tháng cần (để tách dư Nợ / dư Có lên B01) */
  const PS = ['131', '331', '138', '338', '141', '136', '336'];
  const pBal = (at, pres = PS) => all(`SELECT a3 a, p, sum(v) v FROM fin_pmv WHERE ym<=? AND a3 IN (${pres.map(() => '?').join(',')}) GROUP BY 1,2`, at, ...pres);
  function partnerSplits(ats) {
    const out = {};
    for (const at of ats) { if (!at) continue; const o = {}; for (const a of PS) o[a] = { dr: 0, cr: 0 };
      for (const r of pBal(at)) r.v > 0 ? o[r.a].dr += r.v : o[r.a].cr -= r.v; out[at] = o; }
    return out;
  }

  /* B01-DN: Bảng cân đối kế toán tại cuối tháng `to` (và đầu kỳ = cuối tháng trước `from`) */
  function balanceSheet(from, to) {
    const tb = trial(from, to, 1), B = new Map(tb.rows.map(r => [r.a, r]));
    const t = okYm(to) || '9999-12', f0 = okYm(from);
    const prevYm = f0 ? (m => { const y = +m.slice(0, 4), mo = +m.slice(5) - 1; return mo ? `${y}-${String(mo).padStart(2, '0')}` : `${y - 1}-12`; })(f0) : null;
    const bal = (a, when) => { const r = B.get(a); if (!r) return 0; return when === 'ob' ? r.obDr - r.obCr : r.bal; };
    const sum = (accs, when, sign = 1) => sign * accs.reduce((s, a) => s + bal(a, when), 0);
    const pos = (accs, when) => Math.max(0, sum(accs, when)), neg = (accs, when) => Math.max(0, -sum(accs, when));
    const sp = partnerSplits([t, prevYm]);
    const P = (a, side) => w => w === 'ob' ? (prevYm ? sp[prevYm][a][side] : 0) : sp[t][a][side];
    // P&L chưa kết chuyển (TK loại 5–9 còn số dư) → LNST chưa phân phối
    const pl = w => -['5', '6', '7', '8', '9'].reduce((s, c) => s + tb.rows.filter(r => r.a[0] === c).reduce((x, r) => x + (w === 'ob' ? r.obDr - r.obCr : r.bal), 0), 0);
    const L = [ // [mã số, chỉ tiêu, hàm(w) → số, cấp]
      ['A', 'A. TÀI SẢN NGẮN HẠN', null, 0, ['110', '120', '130', '140', '150']],
      ['110', 'I. Tiền và các khoản tương đương tiền', w => sum(['111', '112', '113'], w), 1],
      ['120', 'II. Đầu tư tài chính ngắn hạn', w => sum(['121', '128'], w), 1],
      ['130', 'III. Các khoản phải thu ngắn hạn', null, 1, ['131', '132', '133b', '136', '138']],
      ['131', '1. Phải thu ngắn hạn của khách hàng', P('131', 'dr'), 2], ['132', '2. Trả trước cho người bán ngắn hạn', P('331', 'dr'), 2],
      ['133b', '3. Phải thu nội bộ ngắn hạn', P('136', 'dr'), 2], ['136', '6. Phải thu ngắn hạn khác (138, 141, 244, 338 dư Nợ)', w => P('138', 'dr')(w) + P('141', 'dr')(w) + P('338', 'dr')(w) + sum(['244'], w), 2],
      ['138', '7. Dự phòng phải thu ngắn hạn khó đòi (*)', w => -neg(['229'], w), 2],
      ['140', 'IV. Hàng tồn kho', w => sum(['151', '152', '153', '154', '155', '156', '157', '158'], w), 1],
      ['150', 'V. Tài sản ngắn hạn khác', null, 1, ['152b', '153b']],
      ['152b', '2. Thuế GTGT được khấu trừ', w => pos(['133'], w), 2], ['153b', '3. Thuế và các khoản phải thu Nhà nước', w => pos(['333'], w), 2],
      ['B', 'B. TÀI SẢN DÀI HẠN', null, 0, ['220', '240', '250', '260']],
      ['220', 'II. Tài sản cố định', null, 1, ['221', '227', '229b']],
      ['221', '1. TSCĐ hữu hình – nguyên giá', w => sum(['211', '212'], w), 2], ['227', '3. TSCĐ vô hình – nguyên giá', w => sum(['213'], w), 2],
      ['229b', '   Giá trị hao mòn luỹ kế (*)', w => sum(['214'], w), 2],
      ['240', 'IV. Tài sản dở dang dài hạn (XDCB dở dang)', w => sum(['241'], w), 1],
      ['250', 'V. Đầu tư tài chính dài hạn', w => sum(['221', '222', '228'], w), 1],
      ['260', 'VI. Tài sản dài hạn khác (chi phí trả trước, thuế hoãn lại)', w => sum(['242', '243'], w), 1],
      ['270', 'TỔNG CỘNG TÀI SẢN (270 = 100 + 200)', null, 0, ['A', 'B']],
      ['C', 'C. NỢ PHẢI TRẢ', null, 0, ['310']],
      ['310', 'I. Nợ ngắn hạn', null, 1, ['311', '312', '313', '314', '315', '316', '319', '320', '322']],
      ['311', '1. Phải trả người bán ngắn hạn', P('331', 'cr'), 2], ['312', '2. Người mua trả tiền trước ngắn hạn', P('131', 'cr'), 2],
      ['313', '3. Thuế và các khoản phải nộp Nhà nước', w => neg(['333'], w), 2], ['314', '4. Phải trả người lao động', w => -sum(['334'], w), 2],
      ['315', '5. Chi phí phải trả ngắn hạn', w => -sum(['335'], w), 2], ['316', '6. Phải trả nội bộ ngắn hạn', P('336', 'cr'), 2],
      ['319', '9. Phải trả ngắn hạn khác (338, 344; 138/141 dư Có)', w => P('338', 'cr')(w) + P('138', 'cr')(w) + P('141', 'cr')(w) - sum(['344'], w), 2],
      ['320', '10. Vay và nợ thuê tài chính', w => -sum(['341', '343'], w), 2], ['322', '12. Quỹ khen thưởng, phúc lợi, dự phòng phải trả', w => -sum(['352', '353', '356', '347'], w), 2],
      ['D', 'D. VỐN CHỦ SỞ HỮU', null, 0, ['410']],
      ['410', 'I. Vốn chủ sở hữu', null, 1, ['411', '416', '418', '421', '421b', 'OB']],
      ['411', '1. Vốn góp của chủ sở hữu', w => -sum(['411', '419'], w), 2], ['416', '7. Chênh lệch tỷ giá, đánh giá lại tài sản', w => -sum(['412', '413'], w), 2],
      ['418', '8. Quỹ đầu tư phát triển và quỹ khác', w => -sum(['414', '418', '441'], w), 2],
      ['421', '11a. LNST chưa phân phối (TK 421)', w => -sum(['421'], w), 2], ['421b', '11b. Kết quả kỳ chưa kết chuyển (TK loại 5–9 còn số dư)', pl, 2],
      ['OB', '   Đối ứng số dư đầu kỳ nhập từ file mẫu (TK OB)', w => -sum(['OB'], w), 2],
      ['440', 'TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)', null, 0, ['C', 'D']],
    ];
    const val = new Map(), out = [];
    const calc = (code, w) => { const k = code + w; if (val.has(k)) return val.get(k); const l = L.find(x => x[0] === code); const v = l[2] ? l[2](w) : l[4].reduce((s, c) => s + calc(c, w), 0); val.set(k, v); return v; };
    for (const l of L) out.push({ code: l[0], name: l[1], lvl: l[3], cb: calc(l[0], 'cb'), ob: calc(l[0], 'ob') });
    // tài khoản chưa được đưa vào chỉ tiêu nào → để kiểm tra
    const used = new Set(['111', '112', '113', '121', '128', '131', '331', '136', '336', '138', '338', '141', '244', '229', '151', '152', '153', '154', '155', '156', '157', '158', '133', '333', '211', '212', '213', '214', '241', '221', '222', '228', '242', '243', '334', '335', '344', '341', '343', '352', '353', '356', '347', '411', '419', '412', '413', '414', '418', '441', '421', 'OB']);
    const unmapped = tb.rows.filter(r => !used.has(r.a) && !'56789'.includes(r.a[0]) && Math.abs(r.bal) > 0.004).map(r => ({ a: r.a, n: r.n, bal: r.bal }));
    const A = calc('270', 'cb'), N = calc('440', 'cb');
    return { to: tb.to, from: tb.from, lines: out, diff: A - N, diffOb: calc('270', 'ob') - calc('440', 'ob'), unmapped, hasOpening: tb.hasOpening };
  }

  /* B02-DN: Báo cáo kết quả hoạt động kinh doanh (kỳ này và kỳ trước cùng độ dài) */
  function income(from, to, cmpFrom, cmpTo) {
    const c = plRange(from, to), p = cmpFrom ? plRange(cmpFrom, cmpTo) : null;
    const L = [['01', '1. Doanh thu bán hàng và cung cấp dịch vụ', 'rev'], ['02', '2. Các khoản giảm trừ doanh thu', 'ded'], ['10', '3. Doanh thu thuần (10 = 01 − 02)', 'net'],
      ['11', '4. Giá vốn hàng bán (gồm 621, 622, 623, 627, 632)', 'cogs'], ['20', '5. Lợi nhuận gộp (20 = 10 − 11)', 'gp'], ['21', '6. Doanh thu hoạt động tài chính', 'finInc'],
      ['22', '7. Chi phí tài chính', 'finExp'], ['25', '8. Chi phí bán hàng', 'sell'], ['26', '9. Chi phí quản lý doanh nghiệp', 'admin'],
      ['30', '10. Lợi nhuận thuần từ HĐKD (30 = 20 + 21 − 22 − 25 − 26)', 'op'], ['31', '11. Thu nhập khác', 'othInc'], ['32', '12. Chi phí khác', 'othExp'],
      ['40', '13. Lợi nhuận khác (40 = 31 − 32)', 'other'], ['50', '14. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)', 'pbt'], ['51', '15. Chi phí thuế TNDN', 'tax'],
      ['60', '16. Lợi nhuận sau thuế TNDN (60 = 50 − 51)', 'pat']];
    return { from, to, cmpFrom, cmpTo, lines: L.map(([code, name, k]) => ({ code, name, k, cur: c[k] || 0, prev: p ? p[k] || 0 : null, bold: ['10', '20', '30', '50', '60'].includes(code) })) };
  }
  /* B03-DN: Báo cáo lưu chuyển tiền tệ (TT99/2025) – trực tiếp và gián tiếp.
     Tiền = TK 111, 112, 113. Mỗi bút toán thu/chi tiền được phân loại theo TK đối ứng; chuyển tiền nội bộ giữa các TK tiền bị loại. */
  const CASH = a => /^11[123]/.test(a || '');
  const IN = [['31', /^411/], ['33', /^34[13]/], ['24', /^128|^1288/], ['26', /^22[128]/], ['22', /^711.*|^211|^213|^217/], ['27', /^515/], ['01', /^511|^131|^3331|^3387|^512/], ['61', /^413/], ['06', /./]];
  const OUT = [['21', /^21[1-7]|^241/], ['23', /^128/], ['25', /^22[128]/], ['32', /^411|^419/], ['34', /^341|^343/], ['36', /^421|^3388.*DIV/i], ['03', /^334/], ['04', /^635|^3351/], ['05', /^3334|^821/],
    ['02', /^331|^15[1-8]|^611|^62[1-7]|^632|^64[12]|^133|^242|^335/], ['61', /^413/], ['07', /./]];
  const cls = (a, T) => T.find(([, rx]) => rx.test(a))[0];
  function cashFlows(from, to) {
    const f = okYm(from) || '0000-00', t = okYm(to) || '9999-12';
    const q = (cashSide, other) => all(`SELECT ym, acc_${other} a, max(acc_${other}_name) n, sum(amount) v FROM entries WHERE ym>=? AND ym<=? AND acc_${cashSide}>='111' AND acc_${cashSide}<'114' GROUP BY 1,2`, f, t)
      .filter(r => !CASH(r.a));
    const by = {}, det = [];
    for (const r of q('debit', 'credit')) { const c = cls(r.a, IN); by[c] = (by[c] || 0) + r.v; det.push({ code: c, dir: 'Thu', a: r.a, n: r.n, v: r.v }); }
    for (const r of q('credit', 'debit')) { const c = cls(r.a, OUT); by[c] = (by[c] || 0) - r.v; det.push({ code: c, dir: 'Chi', a: r.a, n: r.n, v: -r.v }); }
    return { by, det };
  }
  function cashFlow(from, to) {
    const { by, det } = cashFlows(from, to), g = c => by[c] || 0, tb = trial(from, to, 1), B = new Map(tb.rows.map(r => [r.a, r]));
    const ob = accs => accs.reduce((s, a) => s + (B.get(a) ? B.get(a).obDr - B.get(a).obCr : 0), 0), cb = accs => accs.reduce((s, a) => s + (B.get(a) ? B.get(a).bal : 0), 0);
    const mv = accs => cb(accs) - ob(accs); // tăng (+) / giảm (−) số dư Nợ
    const cash0 = ob(['111', '112', '113']), cash1 = cb(['111', '112', '113']);
    const s = (...cs) => cs.reduce((x, c) => x + g(c), 0);
    const op = s('01', '02', '03', '04', '05', '06', '07'), inv = s('21', '22', '23', '24', '25', '26', '27'), fin = s('31', '32', '33', '34', '35', '36');
    const sec = (code, name, v, bold) => ({ code, name, v, bold: !!bold });
    const tail = [sec('50', 'Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)', op + inv + fin, 1), sec('60', 'Tiền và tương đương tiền đầu kỳ', cash0, 1),
      sec('61', 'Ảnh hưởng của thay đổi tỷ giá hối đoái quy đổi ngoại tệ', g('61')), sec('70', 'Tiền và tương đương tiền cuối kỳ (70 = 50 + 60 + 61)', op + inv + fin + cash0 + g('61'), 1)];
    const invFin = [sec('', 'II. Lưu chuyển tiền từ hoạt động đầu tư', null, 1),
      sec('21', '1. Tiền chi để mua sắm, xây dựng TSCĐ và các tài sản dài hạn khác', g('21')), sec('22', '2. Tiền thu từ thanh lý, nhượng bán TSCĐ và các tài sản dài hạn khác', g('22')),
      sec('23', '3. Tiền chi cho vay, mua các công cụ nợ của đơn vị khác', g('23')), sec('24', '4. Tiền thu hồi cho vay, bán lại các công cụ nợ của đơn vị khác', g('24')),
      sec('25', '5. Tiền chi đầu tư góp vốn vào đơn vị khác', g('25')), sec('26', '6. Tiền thu hồi đầu tư góp vốn vào đơn vị khác', g('26')), sec('27', '7. Tiền thu lãi cho vay, cổ tức và lợi nhuận được chia', g('27')),
      sec('30', 'Lưu chuyển tiền thuần từ hoạt động đầu tư', inv, 1),
      sec('', 'III. Lưu chuyển tiền từ hoạt động tài chính', null, 1),
      sec('31', '1. Tiền thu từ phát hành cổ phiếu, nhận vốn góp của chủ sở hữu', g('31')), sec('32', '2. Tiền trả lại vốn góp cho các chủ sở hữu, mua lại cổ phiếu', g('32')),
      sec('33', '3. Tiền thu từ đi vay', g('33')), sec('34', '4. Tiền trả nợ gốc vay', g('34')), sec('35', '5. Tiền trả nợ gốc thuê tài chính', g('35')), sec('36', '6. Cổ tức, lợi nhuận đã trả cho chủ sở hữu', g('36')),
      sec('40', 'Lưu chuyển tiền thuần từ hoạt động tài chính', fin, 1)];
    const direct = [sec('', 'I. Lưu chuyển tiền từ hoạt động kinh doanh', null, 1),
      sec('01', '1. Tiền thu từ bán hàng, cung cấp dịch vụ và doanh thu khác', g('01')), sec('02', '2. Tiền chi trả cho người cung cấp hàng hóa và dịch vụ', g('02')),
      sec('03', '3. Tiền chi trả cho người lao động', g('03')), sec('04', '4. Tiền lãi vay đã trả', g('04')), sec('05', '5. Thuế thu nhập doanh nghiệp đã nộp', g('05')),
      sec('06', '6. Tiền thu khác từ hoạt động kinh doanh', g('06')), sec('07', '7. Tiền chi khác cho hoạt động kinh doanh', g('07')),
      sec('20', 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', op, 1), ...invFin, ...tail];
    // Gián tiếp: từ lợi nhuận trước thuế, điều chỉnh khoản phi tiền và biến động vốn lưu động (theo số dư đầu/cuối kỳ trên bảng CĐSPS)
    const pl = plRange(from, to), dep = -mv(['214']), prov = -mv(['229', '352']);
    const d09 = -mv(['131', '136', '138', '141', '133', '244']), d10 = -mv(['151', '152', '153', '154', '155', '156', '157', '158']);
    const d11 = -mv(['331', '333', '334', '335', '336', '338', '344', '337']), d12 = -mv(['242']);
    const known = pl.pbt + dep + prov - pl.finInc + d09 + d10 + d11 + d12 + g('04') + g('05');
    const indirect = [sec('', 'I. Lưu chuyển tiền từ hoạt động kinh doanh', null, 1), sec('01', '1. Lợi nhuận trước thuế', pl.pbt), sec('', '2. Điều chỉnh cho các khoản', null),
      sec('02', '- Khấu hao TSCĐ (tăng hao mòn luỹ kế TK 214)', dep), sec('03', '- Các khoản dự phòng (TK 229, 352)', prov), sec('04', '- Lãi, lỗ chênh lệch tỷ giá do đánh giá lại các khoản mục tiền tệ có gốc ngoại tệ', 0),
      sec('05', '- Lãi, lỗ từ hoạt động đầu tư (doanh thu tài chính TK 515)', -pl.finInc), sec('06', '- Chi phí lãi vay', 0),
      sec('07', '- Các khoản điều chỉnh khác (chênh lệch đối chiếu với dòng tiền thực tế)', op - known), sec('08', '3. Lợi nhuận từ HĐKD trước thay đổi vốn lưu động', pl.pbt + dep + prov - pl.finInc + (op - known), 1),
      sec('09', '- Tăng, giảm các khoản phải thu', d09), sec('10', '- Tăng, giảm hàng tồn kho', d10), sec('11', '- Tăng, giảm các khoản phải trả (không kể lãi vay, thuế TNDN phải nộp)', d11),
      sec('12', '- Tăng, giảm chi phí trả trước', d12), sec('13', '- Tăng, giảm chứng khoán kinh doanh', 0), sec('14', '- Tiền lãi vay đã trả', g('04')), sec('15', '- Thuế thu nhập doanh nghiệp đã nộp', g('05')),
      sec('16', '- Tiền thu khác từ hoạt động kinh doanh', 0), sec('17', '- Tiền chi khác cho hoạt động kinh doanh', 0),
      sec('20', 'Lưu chuyển tiền thuần từ hoạt động kinh doanh', op, 1), ...invFin, ...tail];
    const agg = new Map(); for (const d of det) { const k = d.code + '|' + d.dir + '|' + d.a.slice(0, 3); const o = agg.get(k) || agg.set(k, { code: d.code, dir: d.dir, a: d.a.slice(0, 3), n: L1[d.a.slice(0, 3)] || d.n, v: 0 }).get(k); o.v += d.v; }
    return { from: tb.from, to: tb.to, direct, indirect, check: op + inv + fin + cash0 + g('61') - cash1, cash0, cash1, detail: [...agg.values()].sort((a, b) => a.code.localeCompare(b.code) || Math.abs(b.v) - Math.abs(a.v)), hasOpening: tb.hasOpening };
  }
  /* B09-DN: Thuyết minh báo cáo tài chính – phần số liệu chi tiết lập tự động; phần chính sách là văn bản người dùng sửa */
  function partnerTop(pres, at, n = 10, credit = false, raw) {
    const m = new Map();
    for (const r of raw) if (pres.includes(r.a) && r.ym <= at) m.set(r.p, (m.get(r.p) || 0) + r.s * r.v);
    const list = [...m].map(([p, v]) => ({ p, v: credit ? -v : v })).filter(x => x.v > 0.005).sort((a, b) => b.v - a.v);
    const tot = list.reduce((s, x) => s + x.v, 0), top = list.slice(0, n);
    return { rows: top.map(x => ({ p: x.p, v: x.v })), other: tot - top.reduce((s, x) => s + x.v, 0), total: tot, count: list.length };
  }
  function notes(from, to) {
    const tb = trial(from, to, 0), t = tb.to || '9999-12', f = tb.from;
    const raw = all(`SELECT ym, a3 a, p, v, 1 s FROM fin_pmv WHERE a3 IN ('131','331') AND ym<=?`, t);
    const PT = (pres, at, credit) => partnerTop(pres, at, 10, credit, raw);
    const prev = f ? (m => { const y = +m.slice(0, 4), mo = +m.slice(5) - 1; return mo ? `${y}-${String(mo).padStart(2, '0')}` : `${y - 1}-12`; })(f) : null;
    // Bảng biến động theo TK chi tiết: nat = 1 (dư Nợ: tăng = PS Nợ), −1 (dư Có: tăng = PS Có)
    const mov = (pres, nat = 1) => { const rows = tb.rows.filter(r => pres.some(p => r.a.startsWith(p))).map(r => ({ a: r.a, n: r.n, ob: nat * (r.obDr - r.obCr), inc: nat > 0 ? r.dr : r.cr, dec: nat > 0 ? r.cr : r.dr, cb: nat * r.bal }));
      const tot = rows.reduce((s, r) => ({ ob: s.ob + r.ob, inc: s.inc + r.inc, dec: s.dec + r.dec, cb: s.cb + r.cb }), { ob: 0, inc: 0, dec: 0, cb: 0 }); return { rows, tot }; };
    const pl = plRange(f, t), cost = all(`SELECT coalesce(tcost,'(chưa phân loại)') k, sum(CASE WHEN side='dr' THEN amount ELSE -amount END) v FROM agg e WHERE ${INC} AND (substr(acc,1,1) IN ('6','8')) AND acc NOT LIKE '911%'${f ? ` AND ym>='${f}'` : ''} AND ym<='${t}' GROUP BY 1 ORDER BY v DESC`);
    const top = cost.slice(0, 15), costOther = cost.slice(15).reduce((s, r) => s + r.v, 0);
    const N = (code, title, body) => ({ code, title, ...body });
    return { from: f, to: tb.to, prev, hasOpening: tb.hasOpening, currency: (all(`SELECT currency c, count(*) n FROM entries WHERE currency IS NOT NULL AND currency<>'' GROUP BY 1 ORDER BY n DESC LIMIT 1`)[0] || {}).c || 'USD',
      sections: [
        N('V.1', 'Tiền và các khoản tương đương tiền', { type: 'mov', ...mov(['111', '112', '113']) }),
        N('V.2', 'Các khoản đầu tư tài chính', { type: 'mov', ...mov(['121', '128', '221', '222', '228']) }),
        N('V.3', 'Phải thu của khách hàng (10 khách hàng có số dư lớn nhất)', { type: 'top', ...PT(['131'], t), ob: prev ? PT(['131'], prev).total : 0 }),
        N('V.4', 'Trả trước cho người bán (dư Nợ TK 331)', { type: 'top', ...PT(['331'], t), ob: prev ? PT(['331'], prev).total : 0 }),
        N('V.5', 'Phải thu khác, tạm ứng, ký quỹ', { type: 'mov', ...mov(['136', '138', '141', '244']) }),
        N('V.7', 'Hàng tồn kho', { type: 'mov', ...mov(['151', '152', '153', '154', '155', '156', '157', '158']) }),
        N('V.8', 'Chi phí trả trước', { type: 'mov', ...mov(['242']) }),
        N('V.9', 'Tài sản cố định hữu hình, vô hình – nguyên giá', { type: 'mov', ...mov(['211', '212', '213']) }),
        N('V.10', 'Giá trị hao mòn luỹ kế', { type: 'mov', ...mov(['214'], -1) }),
        N('V.11', 'Chi phí xây dựng cơ bản dở dang', { type: 'mov', ...mov(['241']) }),
        N('V.12', 'Phải trả người bán (10 nhà cung cấp có số dư lớn nhất)', { type: 'top', ...PT(['331'], t, true), ob: prev ? PT(['331'], prev, true).total : 0 }),
        N('V.13', 'Người mua trả tiền trước (dư Có TK 131)', { type: 'top', ...PT(['131'], t, true), ob: prev ? PT(['131'], prev, true).total : 0 }),
        N('V.14', 'Thuế và các khoản phải nộp Nhà nước', { type: 'mov', cols: ['Đầu kỳ', 'Số phải nộp', 'Số đã nộp', 'Cuối kỳ'], ...mov(['333'], -1) }),
        N('V.15', 'Phải trả người lao động', { type: 'mov', ...mov(['334'], -1) }),
        N('V.16', 'Chi phí phải trả', { type: 'mov', ...mov(['335'], -1) }),
        N('V.17', 'Phải trả nội bộ, phải trả khác', { type: 'mov', ...mov(['336', '338', '344'], -1) }),
        N('V.18', 'Vay và nợ thuê tài chính', { type: 'mov', ...mov(['341', '343'], -1) }),
        N('V.20', 'Vốn chủ sở hữu – bảng đối chiếu biến động', { type: 'mov', ...mov(['411', '412', '413', '414', '418', '419', '421', '441'], -1) }),
        N('VI.1', 'Doanh thu bán hàng và cung cấp dịch vụ', { type: 'mov', cols: ['', 'Ghi Có', 'Ghi Nợ (giảm trừ/kết chuyển)', 'Thuần trong kỳ'], ...mov(['511', '521'], -1) }),
        N('VI.3', 'Giá vốn hàng bán và chi phí sản xuất (621–627, 632)', { type: 'mov', cols: ['', 'Phát sinh Nợ', 'Phát sinh Có (kết chuyển)', 'Số dư'], ...mov(['621', '622', '623', '627', '632'], 1) }),
        N('VI.4', 'Doanh thu và chi phí hoạt động tài chính', { type: 'kv', rows: [['Doanh thu hoạt động tài chính (515)', pl.finInc], ['Chi phí tài chính (635)', pl.finExp]] }),
        N('VI.5', 'Chi phí bán hàng và chi phí quản lý doanh nghiệp', { type: 'kv', rows: [['Chi phí bán hàng (641)', pl.sell], ['Chi phí quản lý doanh nghiệp (642)', pl.admin]] }),
        N('VI.6', 'Thu nhập khác và chi phí khác', { type: 'kv', rows: [['Thu nhập khác (711)', pl.othInc], ['Chi phí khác (811)', pl.othExp]] }),
        N('VI.7', 'Chi phí sản xuất, kinh doanh theo khoản mục (15 khoản mục lớn nhất)', { type: 'kv', rows: [...top.map(r => [r.k, r.v]), ['Các khoản mục khác', costOther]] }),
        N('VI.8', 'Chi phí thuế thu nhập doanh nghiệp hiện hành', { type: 'kv', rows: [['Lợi nhuận kế toán trước thuế', pl.pbt], ['Chi phí thuế TNDN (821)', pl.tax], ['Lợi nhuận sau thuế', pl.pat]] }),
      ] };
  }
  return { trial, balanceSheet, income, cashFlow, notes, status };
}
module.exports = { make, L1 };
