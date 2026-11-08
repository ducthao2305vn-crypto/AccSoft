'use strict';
// Kế hoạch năm (mẫu Tập đoàn): PL01 chỉ tiêu tài chính TH theo tháng / quý / năm + KH nhập tay; PL06 giao dịch nội bộ Tập đoàn (TH theo kỳ chọn + KH nhập tay).
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const A = (a, ...p) => p.some(x => String(a || '').startsWith(x));

/* ---------- PL01: dòng chỉ tiêu ----------
   t: 'l' = số lá (luồng – cộng theo kỳ), 'b' = số dư cuối kỳ (quý/năm lấy tháng cuối), 'f' = công thức theo các dòng khác, 'r' = tỷ lệ */
const ROWS = [
  ['A', 'A', 'TỔNG DOANH THU', 'f', v => v.dt1 + v.dt2 + v.dt3, 1],
  ['dt1', '1', 'Doanh thu bán hàng và cung cấp dịch vụ', 'f', v => v.dtqp + v.dtkt, 2], ['dtqp', '', '- Doanh thu sản phẩm quốc phòng', 'l'], ['dtkt', '', '- Doanh thu sản phẩm kinh tế', 'l'],
  ['dt2', '2', 'Doanh thu tài chính', 'l', null, 2], ['dt3', '3', 'Thu nhập khác', 'l', null, 2],
  ['B', 'B', 'TỔNG CHI PHÍ', 'f', v => v.c2 + v.c3 + v.c4 + v.c5 + v.c6 + v.c7, 1],
  ['c1', '1', 'Chi phí nội bộ', 'l', null, 2], ['c2', '2', 'Nguyên vật liệu, giá vốn hàng thương mại', 'l', null, 2], ['c3', '3', 'Chi phí khấu hao TSCĐ', 'l', null, 2],
  ['c4', '4', 'Chi phí nhân công (cả thuê ngoài)', 'f', v => v.c41 + v.c42 + v.c43, 2], ['c41', '', '- Chi phí tiền lương, phụ cấp', 'l'], ['c42', '', '- Chi phí BHXH, BHYT, TN, CĐ', 'l'], ['c43', '', '- Chi phí nhân công thuê ngoài', 'l'],
  ['c5', '5', 'Chi phí dịch vụ mua ngoài', 'l', null, 2], ['c6', '6', 'Chi phí tài chính', 'f', v => v.c61 + v.c62, 2], ['c61', '', '- Chi phí lãi vay', 'l'], ['c62', '', '- Lỗ CLTG CTH', 'l'],
  ['c7', '7', 'Chi phí khác', 'l', null, 2],
  ['C', 'C', 'LỢI NHUẬN', 'f', v => v.A - v.B, 1], ['ln1', '1', 'Lợi nhuận sản phẩm quốc phòng', 'l', null, 2], ['ln2', '2', 'Lợi nhuận sản phẩm kinh tế', 'f', v => v.C - v.ln1 - v.ln3 - v.ln4, 2],
  ['ln3', '3', 'Lợi nhuận hoạt động tài chính', 'f', v => v.dt2 - v.c6, 2], ['ln4', '4', 'Lợi nhuận khác', 'f', v => v.dt3 - v.c7, 2],
  ['D', 'D', 'THUẾ TNDN', 'l', null, 1], ['E', 'E', 'LỢI NHUẬN SAU THUẾ', 'f', v => v.C - v.D, 1],
  ['F', 'F', 'PHÂN PHỐI LỢI NHUẬN', 'f', v => v.f1 + v.f2 + v.f3 + v.f4 + v.f5 + v.f6, 1], ['f1', '-', 'Trích lập quỹ đầu tư phát triển', 'l'], ['f2', '-', 'Trích lập quỹ thưởng ban điều hành', 'l'],
  ['f3', '-', 'Trích lập quỹ khen thưởng, phúc lợi', 'l'], ['f4', '-', 'Trích nộp điều tiết lợi nhuận', 'l'], ['f5', '-', 'Trích lập các quỹ khác (nếu có)', 'l'], ['f6', '-', 'Nộp lợi nhuận còn lại', 'l'],
  ['G1', 'G1', 'EBITDA', 'f', v => v.C + v.c61 + v.c3, 1], ['G2', 'G2', 'Tỷ lệ LNTT/DT', 'r', v => v.A ? v.C / v.A : null, 1],
  ['H', 'H', 'NỘP NGÂN SÁCH NHÀ NƯỚC', 'l', null, 1], ['I', 'I', 'NỘP BỘ QUỐC PHÒNG', 'l', null, 1], ['K', 'K', 'NỘP BỘ TT&TT', 'l', null, 1],
  ['L', 'L', 'Tổng tài sản (Tổng nguồn vốn)', 'b', null, 1], ['Lx', '', 'Trong đó:', 'x'],
  ['L1', 'L1', 'Giá trị tài sản cố định (giá trị còn lại)', 'f', v => v.l1a - v.l1b, 1], ['l1a', '-', 'Nguyên giá', 'b'], ['l1b', '-', 'Khấu hao lũy kế', 'b'],
  ['L2', 'L2', 'Nợ phải thu', 'f', v => v.l2a + v.l2b, 1], ['l2a', '1', 'Nợ phải thu ngắn hạn', 'b'], ['l2b', '2', 'Nợ phải thu dài hạn', 'b'],
  ['M', 'M', 'Vốn chủ sở hữu (cuối kỳ)', 'b', null, 1], ['Mbq', '', 'Vốn chủ sở hữu bình quân', 'q'],
  ['M1', 'M1', 'Nợ phải trả', 'f', v => v.m1a + v.m1b, 1], ['m1a', '1', 'Nợ phải trả ngắn hạn', 'b'], ['m1b', '2', 'Nợ phải trả dài hạn', 'b'],
  ['N', 'N', 'Tồn đọng tài chính', 'f', v => v.n1 + v.n2 + v.n3 + v.n4 + v.n5, 1], ['n1', '1', 'Lỗ lũy kế (ngoài lỗ kế hoạch)', 'b'],
  ['n2', '2', 'Nợ phải thu khó đòi', 'b'], ['n2a', '', 'Nợ phải thu khó đòi đã thu hồi, xử lý trong năm', 'l'], ['n2b', '', 'Trích lập dự phòng nợ phải thu khó đòi cuối năm', 'b'],
  ['n3', '3', 'VT, HH kém mất phẩm chất chưa xử lý', 'b'], ['n3a', '', 'Xử lý trong năm', 'l'], ['n3b', '', 'Trích lập dự phòng cho hàng kém phẩm chất, hàng hỏng', 'b'],
  ['n4', '4', 'Tài sản thiếu chờ xử lý', 'b'], ['n5', '5', 'Tồn đọng tài chính khác (chi tiết)', 'b'],
  ['O', 'O', 'Tỷ suất LNST/Vốn CSH (ROE)', 'r', v => v.Mbq ? v.E / v.Mbq : null, 1], ['P', 'P', 'Tỷ suất LNST/ Tổng Tài sản (ROA)', 'r', v => v.L ? v.E / v.L : null, 1],
  ['Q', 'Q', 'Tỷ lệ Nợ phải trả/ Vốn CSH', 'r', v => v.M ? v.M1 / v.M : null, 1]];
const LEAF = ROWS.filter(r => ['l', 'b', 'q'].includes(r[3])).map(r => r[0]);
// Tính các dòng công thức / tỷ lệ của một cột từ số lá. ratio=false (cột tháng) → bỏ ROE/ROA
function evalCol(leaf, monthCol) {
  if (!leaf) return null; const v = {};
  for (const k of LEAF) v[k] = +leaf[k] || 0;
  // công thức tham chiếu cả dòng phía dưới → tính lặp đến khi ổn định
  for (let i = 0; i < 4; i++) for (const [k, , , t, fn] of ROWS) if (t === 'f' || t === 'r') v[k] = fn(v);
  if (monthCol) { v.O = null; v.P = null; }
  return v;
}
// Gộp tháng → quý / năm: luồng cộng, số dư lấy tháng cuối có số
function agg(cols, mbq) {
  const ok = cols.filter(Boolean); if (!ok.length) return null; const last = ok[ok.length - 1], o = {};
  for (const [k, , , t] of ROWS) if (t === 'l') o[k] = ok.reduce((s, c) => s + (+c[k] || 0), 0); else if (t === 'b') o[k] = last[k];
  o.Mbq = mbq != null ? mbq(last) : last.Mbq; return o;
}

/* ---------- PL06: danh sách đối tác nội bộ Tập đoàn (theo biểu mẫu) ---------- */
// [mã dòng, tên gọi khác, tên, cấp (0 = khối, 1 = đơn vị, 2 = đơn vị con), khối]
const NB = [['A', '', 'KHỐI PHỤ THUỘC', 0],
  ['TD', 'VPTD', 'Tập đoàn Viễn thông Quân đội (Văn phòng Tập đoàn)', 1], ['VTT', 'VTT', 'Tổng Công ty Viễn thông Viettel + 63 chi nhánh', 1], ['VTTcq', '', 'Khối cơ quan Tổng Công ty Viễn thông', 2], ['63CN', '', '63 Chi nhánh (viễn thông) tỉnh thành phố', 2],
  ['VTNet', 'VTN', 'Tổng Công ty Mạng lưới Viettel', 1], ['VTS', 'VTS', 'Tổng Công ty Giải pháp doanh nghiệp', 1], ['VDS', 'VDS', 'Tổng công ty Dịch vụ số', 1], ['BDS', 'VAM', 'Công ty Quản lý Tài sản Viettel', 1],
  ['VTM', 'VTM', 'Công ty Truyền thông Viettel', 1], ['TTTT', 'VTSport', 'Trung tâm thể thao Viettel', 1], ['HVT', 'VTAca', 'Học Viện Viettel', 1], ['ANM', 'VCS', 'Công ty an ninh mạng Viettel', 1],
  ['KGM', 'VTCC', 'Trung tâm không gian mạng Viettel', 1], ['VHT', 'VHT', 'Tổng Công ty Công nghiệp Công nghệ cao Viettel', 1], ['HKVT', 'VTX', 'Viện hàng không vũ trụ Viettel', 1],
  ['VSS', 'VSS', 'Trung tâm Dịch vụ dùng chung', 1], ['VIC', 'VIC', 'Trung tâm Công nghệ thông tin', 1], ['VIT', 'VIT', 'Công ty TNHH MTV Đầu tư Công nghệ Viettel', 1],
  ['B', '', 'KHỐI ĐỘC LẬP', 0],
  ['VPG', 'VPG', 'Tổng Công ty Cổ phần Đầu tư Quốc tế Viettel', 1], ['XNK', 'VTLimex', 'Công ty TNHH MTV Thương mại và Xuất nhập khẩu Viettel', 1], ['BC', 'VTPost', 'Tổng Công ty Cổ phần Bưu chính Viettel', 1],
  ['CPBCVT', '', 'Tổng Công ty Cổ phần Bưu chính Viettel - Công ty mẹ', 2], ['BC_CTcon', '', 'Công ty con thuộc Công ty Bưu chính Viettel', 2],
  ['CTCT', 'VCC', 'Tổng Công ty Cổ phần Công trình Viettel', 1], ['CTR', '', 'Tổng Công ty Cổ phần Công trình Viettel - Công ty mẹ', 2], ['CT_CTcon', '', 'Công ty con thuộc Công ty Công trình Viettel', 2],
  ['XMCP', 'XMCP', 'Công ty Cổ phần Xi măng Cẩm Phả', 1], ['VMC', 'VMC', 'Tổng công ty sản xuất thiết bị Viettel', 1], ['M1', 'M1', 'Công ty TNHH MTV Thông tin M1', 1],
  ['M3', 'M3', 'Công ty TNHH MTV Thông tin M3', 1], ['IDC', 'IDC', 'Công ty TNHH Viettel - CHT', 1], ['TVTK', 'VTK', 'Công ty Cổ phần Tư vấn Thiết kế Viettel', 1],
  ['VTP', 'VTP', 'Công ty Viettel Peru S.A.C', 1], ['VTA', 'VTA', 'Công ty Viettel America (Viettel Mỹ)', 1], ['VTR', 'VTR', 'Công ty Viettel Russiky (Viettel Nga)', 1],
  ['VDTC', 'VDTC', 'Công ty CP Giao thông số Việt Nam', 1], ['DVKH', 'DVKH', 'Công ty Dịch vụ khách hàng', 1],
  ['C', '', 'KHỐI THỊ TRƯỜNG', 0],
  ['VTC', 'VTC', 'Công ty TNHH Viettel Cambodia', 1], ['NAT', 'NAT', 'Công ty National Telecom S.A (NATCOM)', 1], ['MVT', 'MVT', 'Công ty TNHH Movitel', 1],
  ['VTL', 'VTL', 'Công ty Viettel Timor Leste, UNIP., LDA.', 1], ['TFU', 'TFU', 'Công ty Telemor Fintech Unipessoal, Lda (công ty con của VTL)', 2],
  ['VCR', 'VCR', 'Công ty Viettel Cameroon', 1], ['VTB', 'VTB', 'Công ty Viettel Burundi S.A', 1],
  ['VTZ', 'VTZ', 'Công ty TNHH Viettel Tanzania', 1], ['STL', 'STL', 'Công ty TNHH Viễn thông Star', 1], ['MYA', 'MYA', 'Công ty Mytel (Viettel Myanmar)', 1]];
// Mã công ty nội bộ trong danh mục đối tượng (nb_code) → mã dòng PL06 khi tên khác nhau
const ALIAS = { VTG: 'VPG', TTANM: 'ANM', VCS: 'ANM', M3VT: 'M3', IDCVT: 'IDC', MYTEL: 'MYA', VTPERU: 'VTP', XNKVT: 'XNK', XNKVT_CS: 'XNK', VTLIMEX: 'XNK', TD_CS: 'TD', VPTD: 'TD',
  VTTEK: 'VHT', BCVT: 'BC_CTcon', BCVT_HCM: 'BC_CTcon', VTPOST: 'CPBCVT', CTCTVT: 'CTR', VCC: 'CTR', VTACA: 'HVT', VTAVT: 'HVT', VTK: 'TVTK', VTN: 'VTNet', VAM: 'BDS', VTX: 'HKVT', VTCC: 'KGM', VTT: 'VTTcq', VPT: 'VTTcq' };
const NBC = ['E', 'F', 'G', 'H', 'I', 'K', 'L', 'N', 'O']; // cột số lá của PL06 (J = E..I, M = K+L)

function make(db, all, get, run, FIN, PC) {
  const getS = k => { try { return JSON.parse(get(`SELECT v FROM settings WHERE k=?`, k)?.v || 'null'); } catch { return null; } };
  const setS = (k, v) => run(`INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, JSON.stringify(v));

  /* Số thực hiện các dòng lá PL01 theo tháng (from..to dạng YYYY-MM) */
  function thMonths(f, t) {
    const out = {}, M = k => out[k] || (out[k] = Object.fromEntries(LEAF.map(x => [x, 0])));
    // Doanh thu / chi phí: cặp TK (4 ký tự) theo tháng; bỏ kết chuyển 911 và kết chuyển qua 154
    for (const r of all(`SELECT ym, substr(acc_debit,1,4) d, substr(acc_credit,1,4) c, sum(amount) v FROM entries WHERE ym>=? AND ym<=?
        AND (substr(acc_debit,1,1) IN ('5','6','7','8') OR substr(acc_credit,1,1) IN ('5','6','7','8')) GROUP BY 1,2,3`, f, t)) {
      const o = M(r.ym);
      for (const [acc, other, sg] of [[r.d, r.c, 1], [r.c, r.d, -1]]) {
        if (A(other, '911') || A(acc, '911') || A(other, '154')) continue;
        const v = sg * r.v; // dương = phát sinh Nợ của TK đang xét
        if (A(acc, '511', '512')) o.dtkt -= v; else if (A(acc, '521')) o.dtkt -= v; else if (A(acc, '515')) o.dt2 -= v; else if (A(acc, '711')) o.dt3 -= v;
        else if (A(acc, '635')) { if (A(other, '413')) o.c62 += v; else o.c61 += v; }
        else if (A(acc, '811')) o.c7 += v; else if (A(acc, '821')) o.D += v;
        else if (A(acc, '6')) {
          if (A(other, '214')) o.c3 += v; else if (A(other, '334')) o.c41 += v; else if (A(other, '3382', '3383', '3384', '3386')) o.c42 += v;
          else if (A(other, '151', '152', '153', '155', '156', '157', '158', '1412')) o.c2 += v; else o.c5 += v;
        }
      }
    }
    // Phân phối lợi nhuận (Nợ 421, trừ kết chuyển) · nộp NSNN (Nợ 333 / Có tiền)
    for (const r of all(`SELECT ym, sum(amount) v FROM entries WHERE ym>=? AND ym<=? AND acc_debit>='421' AND acc_debit<'422' AND substr(acc_credit,1,3) NOT IN ('911','421') GROUP BY 1`, f, t)) M(r.ym).f6 += r.v;
    for (const r of all(`SELECT ym, sum(amount) v FROM entries WHERE ym>=? AND ym<=? AND acc_debit>='333' AND acc_debit<'334' AND substr(acc_credit,1,3) IN ('111','112','113') GROUP BY 1`, f, t)) M(r.ym).H += r.v;
    // Chi phí nội bộ: chi phí (TK 6, 8) với đối tác nội bộ Tập đoàn
    try { for (const r of PC.internalRows(f, t, false, '', '', 1e9).rows) if (A(r.dr, '6', '8') && !A(r.dr, '911')) M(r.ym).c1 += r.a; else if (A(r.cr, '6', '8') && !A(r.cr, '911')) M(r.ym).c1 -= r.a; } catch { }
    // Số dư cuối tháng từ B01
    const cum = (pre, m) => get(`SELECT ifnull(sum(dr) - sum(cr), 0) v FROM fin_mv WHERE ym<=? AND acc LIKE ?`, m, pre + '%').v;
    for (const m of Object.keys(out)) {
      const bs = FIN.balanceSheet(m.slice(0, 4) + '-01', m), L = new Map(bs.lines.map(l => [l.code, l])), v = c => L.get(c)?.cb || 0, o = out[m];
      o.L = v('270'); o.l1a = v('221') + v('227'); o.l1b = -v('229b'); o.l2a = v('130'); o.l2b = 0; o.M = v('D'); o.m1a = v('310'); o.m1b = 0;
      o.n2b = -cum('2293', m); o.n2 = o.n2b; o.n3b = -cum('2294', m); o.n3 = o.n3b; o.n4 = cum('1381', m); o.n1 = 0; o.n5 = 0;
      o._Mob = L.get('D')?.ob || 0; o.Mbq = (o._Mob + o.M) / 2;
    }
    return out;
  }

  function pl01(o = {}) {
    const to = o.to, Y = +to.slice(0, 4), from = o.from && o.from.slice(0, 4) === String(Y) ? o.from : `${Y}-01`;
    const cur = thMonths(from, to), prev = thMonths(`${Y - 1}-01`, `${Y - 1}-12`);
    const months = Array.from({ length: 12 }, (_, i) => ym(Y, i + 1)), mbq = last => last ? (last._Mob + last.M) / 2 : null;
    const th = months.map(m => cur[m] || null), thQ = [0, 1, 2, 3].map(q => agg(th.slice(q * 3, q * 3 + 3), mbq)), thY = agg(th, mbq);
    const pv = agg(Array.from({ length: 12 }, (_, i) => prev[ym(Y - 1, i + 1)] || null), mbq);
    const plan = getS('kh_pl01') || {}, P0 = plan[Y] || {}, P1 = plan[Y + 1] || {};
    const kh = (P, i) => { const o = {}; let any = false; for (const k of LEAF) { const x = P[k]?.[i]; if (x != null && x !== '') { o[k] = +x; any = true; } } return any ? o : null; };
    const block = P => { const m = Array.from({ length: 12 }, (_, i) => kh(P, i + 1)); return { m, q: [0, 1, 2, 3].map(q => agg(m.slice(q * 3, q * 3 + 3), null)), y: agg(m, null) }; };
    const b0 = block(P0), b1 = block(P1);
    const E = (x, mc) => evalCol(x, mc);
    return { Y, from, to, rows: ROWS.map(r => ({ k: r[0], code: r[1], n: r[2], t: r[3], lvl: r[5] || 0 })),
      prev: E(pv), th: { m: th.map(x => E(x, true)), q: thQ.map(x => E(x)), y: E(thY) },
      kh: { m: b0.m.map(x => E(x, true)), q: b0.q.map(x => E(x)), y: E(b0.y) }, kh1: { m: b1.m.map(x => E(x, true)), q: b1.q.map(x => E(x)), y: E(b1.y) },
      note: (plan.note || {})[Y] || {}, leaf: LEAF };
  }
  // Lưu KH PL01: year → {rowKey: {1..12: số}}; note → {rowKey: text}
  function setPlan01(year, vals, note) { const p = getS('kh_pl01') || {}; p[year] = vals || {}; if (note) { p.note = p.note || {}; p.note[year] = note; } setS('kh_pl01', p); return true; }

  /* ---------- PL06 ---------- */
  const NBKEYS = new Set(NB.filter(r => r[3] > 0).map(r => r[0]));
  const nbMap = () => getS('kh_nbmap') || {};
  const autoRow = key => { const K = String(key || '').toUpperCase().replace(/\s+/g, ''); if (ALIAS[K]) return ALIAS[K]; for (const r of NB) if (r[3] > 0 && (r[0].toUpperCase() === K || (r[1] && r[1].toUpperCase() === K))) return r[0]; return null; };
  // Phân loại một bút toán nội bộ vào cột PL06; trả [cột, số] hoặc null
  function cls(r) {
    if (A(r.cr, '511', '512')) return ['K', r.a]; if (A(r.dr, '511', '521')) return ['K', -r.a];
    if (A(r.cr, '3387')) return ['L', r.a]; if (A(r.dr, '421')) return ['N', r.a]; if (A(r.cr, '515')) return ['O', r.a];
    const col = a => A(a, '156', '151', '157', '158') ? 'E' : A(a, '152', '241') ? 'F' : A(a, '211', '213', '217', '153', '242') ? 'G' : A(a, '356') ? 'H' : A(a, '6', '8') && !A(a, '911') ? 'I' : null;
    const d = col(r.dr); if (d) return [d, r.a]; const c = col(r.cr); if (c && A(r.dr, '13', '14', '33', '34', '35')) return [c, -r.a];
    return null;
  }
  function pl06(o = {}) {
    const { from, to } = o, Y = +to.slice(0, 4), map = nbMap(), th = {}, other = new Map(), unk = new Map();
    const add = (row, c, v) => { const x = th[row] || (th[row] = Object.fromEntries(NBC.map(k => [k, 0]))); x[c] += v; };
    for (const r of PC.internalRows(from, to, false, '', '', 1e9).rows) {
      const c = cls(r); if (!c) continue; let row = map[r.coKey] || autoRow(r.coKey);
      if (!row || !NBKEYS.has(row)) { row = 'X:' + r.coKey; other.set(row, r.company); const u = unk.get(r.coKey) || { key: r.coKey, name: r.company, n: 0, v: 0 }; u.n++; u.v += c[1]; unk.set(r.coKey, u); }
      add(row, c[0], c[1]);
    }
    const plan = (getS('kh_pl06') || {})[Y + 1] || {};
    const rows = NB.map(([k, alias, name, lvl]) => ({ k, alias, name, lvl })).concat(other.size ? [{ k: 'D', alias: '', name: 'ĐƠN VỊ NỘI BỘ KHÁC (chưa ánh xạ mã dòng)', lvl: 0 }, ...[...other].map(([k, n]) => ({ k, alias: k.slice(2), name: n, lvl: 1 }))] : []);
    return { from, to, Y, rows, th, plan, cols: NBC, unmapped: [...unk.values()], map, companies: PC.companies ? PC.companies(false) : [] };
  }
  function setPlan06(year, vals) { const p = getS('kh_pl06') || {}; p[year] = vals || {}; setS('kh_pl06', p); return true; }
  function setNbMap(m) { setS('kh_nbmap', m || {}); return nbMap(); }

  return { pl01, setPlan01, pl06, setPlan06, setNbMap };
}
module.exports = { make, ROWS, NB, NBC, LEAF };
