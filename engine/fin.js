'use strict';
// Bảng cân đối số phát sinh + Báo cáo tài chính (B01-DN, B02-DN theo TT200) dựng từ dữ liệu hạch toán.
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

  // Một lượt gom theo tháng × TK Nợ × TK Có (vài nghìn dòng) rồi tính trong JS – nhanh hơn nhiều so với quét có điều kiện tháng được chọn
  const incl = () => new Set(all(`SELECT ym FROM months WHERE included=1`).map(r => r.ym));
  const base = () => { const inc = incl(); return all(`SELECT ym, acc_debit d, acc_credit c, max(acc_debit_name) dn, max(acc_credit_name) cn, sum(amount) v FROM entries GROUP BY 1,2,3`).filter(r => inc.has(r.ym)); };

  /* Bảng cân đối số phát sinh. level: 1 = TK cấp 1 (3 số), 0 = chi tiết */
  function trial(from, to, level = 1, rowsIn) {
    const f = okYm(from) || '0000-00', t = okYm(to) || '9999-12', K = a => !level || a === 'OB' ? a : a.slice(0, 3);
    const m = new Map(), get = (a, n) => m.get(a) || m.set(a, { a, n: nameOf(a, n), ob: 0, dr: 0, cr: 0 }).get(a);
    let hasOpening = false;
    for (const r of rowsIn || base()) {
      if (r.ym > t) continue; const before = r.ym < f; if (before) hasOpening = true;
      if (r.d) { const o = get(K(r.d), r.dn); before ? o.ob += r.v : o.dr += r.v; }
      if (r.c) { const o = get(K(r.c), r.cn); before ? o.ob -= r.v : o.cr += r.v; }
    }
    const rows = [...m.values()].map(o => { const cb = o.ob + o.dr - o.cr; return { a: o.a, n: o.n, obDr: o.ob > 0 ? o.ob : 0, obCr: o.ob < 0 ? -o.ob : 0, dr: o.dr, cr: o.cr, cbDr: cb > 0 ? cb : 0, cbCr: cb < 0 ? -cb : 0, bal: cb }; })
      .filter(r => Math.abs(r.obDr) + Math.abs(r.obCr) + Math.abs(r.dr) + Math.abs(r.cr) > 0.004).sort((a, b) => a.a.localeCompare(b.a));
    const tot = rows.reduce((s, r) => { for (const k of ['obDr', 'obCr', 'dr', 'cr', 'cbDr', 'cbCr']) s[k] += r[k]; return s; }, { obDr: 0, obCr: 0, dr: 0, cr: 0, cbDr: 0, cbCr: 0 });
    return { from: f === '0000-00' ? null : f, to: t === '9999-12' ? null : t, level, rows, tot, hasOpening };
  }

  /* Số dư TK công nợ theo từng đối tượng tại cuối các tháng cần (để tách dư Nợ / dư Có lên B01) */
  const PS = ['131', '331', '138', '338', '141', '136', '336'];
  function partnerSplits(ats) {
    const inc = incl(), q = side => all(`SELECT ym, substr(acc_${side},1,3) a, coalesce(partner_${side},'') p, sum(amount) v FROM entries WHERE substr(acc_${side},1,3) IN (${PS.map(() => '?').join(',')}) GROUP BY 1,2,3`, ...PS);
    const rows = [...q('debit').map(r => ({ ...r, s: 1 })), ...q('credit').map(r => ({ ...r, s: -1 }))].filter(r => inc.has(r.ym));
    const out = {};
    for (const at of ats) { const m = new Map(); for (const r of rows) if (at && r.ym <= at) { const k = r.a + '|' + r.p; m.set(k, (m.get(k) || 0) + r.s * r.v); }
      const o = {}; for (const a of PS) o[a] = { dr: 0, cr: 0 }; for (const [k, v] of m) { const a = k.slice(0, 3); v > 0 ? o[a].dr += v : o[a].cr -= v; } out[at] = o; }
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
  return { trial, balanceSheet, income };
}
module.exports = { make, L1 };
