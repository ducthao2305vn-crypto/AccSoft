'use strict';
// Thuế TNDN phải nộp + thuế hoãn lại theo luật thuế Timor-Leste (mô hình theo file "Viettel Timor's Income Tax"):
//  • Hàng hoá, vật tư mua vào được trừ NGAY khi mua (Purchases – Inventory, dòng 10); giá vốn / xuất dùng / dự phòng giảm giá kế toán KHÔNG được trừ (đã trừ khi mua).
//  • Tài sản cố định được trừ TOÀN BỘ khi ghi tăng (dòng 15 hữu hình, 20 vô hình); khấu hao / hao mòn kế toán KHÔNG được trừ.
//  → Cơ sở tính thuế của hàng tồn kho, TSCĐ = 0 ⇒ chênh lệch tạm thời chịu thuế = giá trị ghi sổ ⇒ thuế hoãn lại phải trả (DTL) = thuế suất × giá trị ghi sổ.
// Mọi số lấy từ dữ liệu hạch toán (Source Amount theo cài đặt amount), bỏ bút toán kết chuyển 911.
const DEF = {
  rate: 0.1,
  inv: ['152', '153', '156', '1412'],     // hàng tồn kho (tính thuế = trừ khi mua)
  invProv: ['2294'],                       // dự phòng giảm giá hàng tồn kho
  ppe: ['211'], ppeDep: ['2141', '2142'],  // TSCĐ hữu hình / hao mòn
  intg: ['213'], intgDep: ['2143'],        // TSCĐ vô hình / hao mòn
  cip: ['241'],                            // XDCB dở dang
  ar: ['131', '1388'], arProv: ['2293'],   // phải thu / dự phòng phải thu khó đòi
  nondeduct: [],                           // TK chi phí khác không được trừ (vd lãi vay 635x nếu áp dụng)
  cit: ['3334'], citExp: ['8211'], dtExp: ['8212'], dta: ['243'], dtl: ['347'],
  cash: ['111', '112', '113'],
};
const isP = (a, L) => (L || []).some(p => String(a || '').startsWith(p));
const PL = a => /^[5678]/.test(a || '') && !/^911/.test(a || '');

function make(db, all, FIN) {
  const get = k => { const r = all(`SELECT v FROM settings WHERE k=?`, k)[0]; try { return r && r.v ? JSON.parse(r.v) : null; } catch { return null; } };
  const put = (k, v) => db.prepare(`INSERT OR REPLACE INTO settings(k, v) VALUES(?,?)`).run(k, JSON.stringify(v));
  const cfg = () => ({ ...DEF, ...(get('dtax_cfg') || {}) });
  const setCfg = o => { const c = { ...cfg(), ...(o || {}) }; for (const k of Object.keys(DEF)) if (Array.isArray(DEF[k]) && typeof c[k] === 'string') c[k] = c[k].split(/[,; ]+/).filter(Boolean); c.rate = +c.rate || 0.1; put('dtax_cfg', c); return c; };
  // nhập tay theo năm: lỗ chuyển kỳ trước, điều chỉnh thủ công, khoản mục chênh lệch khác, cơ sở thuế XDCB dở dang
  const yIn = y => ({ lossCF: null, adj: [], extra: [], cipBase: null, ...(get('dtax_y_' + y) || {}) }); // lossCF null = tự tính từ các năm trước
  const setYear = (y, o) => { const v = { ...yIn(y), ...(o || {}) }; put('dtax_y_' + y, v); return v; };

  // Số dư cuối kỳ (Nợ − Có) theo đầu TK tại tháng `ym`
  const balAt = ym => { const m = FIN.closeAt(ym); return L => { let s = 0; for (const [a, v] of m) if (isP(a, L)) s += v; return s; }; };
  // Phát sinh trong năm theo cặp TK Nợ / Có (vài nghìn cặp – nhanh)
  const pairs = y => all(`SELECT acc_debit d, acc_credit c, sum(amount) a FROM entries WHERE ym>=? AND ym<=? AND acc_debit NOT LIKE '911%' AND acc_credit NOT LIKE '911%' GROUP BY 1,2`, `${y}-01`, `${y}-12`);
  const years = () => all(`SELECT DISTINCT substr(ym,1,4) y FROM entries WHERE ym IS NOT NULL ORDER BY 1`).map(r => +r.y);

  function current(y, C, P, lossAvail) {
    const S = f => P.reduce((s, r) => s + (f(r.d, r.c) ? r.a : 0), 0);
    const rev = S((d, c) => /^[57]/.test(c)) - S((d, c) => /^[57]/.test(d));
    const exp = S((d, c) => /^[68]/.test(d) && !isP(d, C.citExp) && !isP(d, C.dtExp)) - S((d, c) => /^[68]/.test(c) && !isP(c, C.citExp) && !isP(c, C.dtExp));
    const exp6 = (d, c, L) => S((x, z) => PL(x) && /^[68]/.test(x) && isP(z, L)) - S((x, z) => PL(z) && /^[68]/.test(z) && isP(x, L)); // chi phí ghi Nợ 6/8 – Có L (trừ đảo)
    const depT = exp6(0, 0, C.ppeDep), depI = exp6(0, 0, C.intgDep);
    const cogs = exp6(0, 0, C.inv), prov = exp6(0, 0, C.invProv);
    const nbv = exp6(0, 0, [...C.ppe, ...C.intg]); // giá trị còn lại TS thanh lý / ghi giảm vào chi phí
    const nond = S((d, c) => /^[68]/.test(d) && isP(d, C.nondeduct)) - S((d, c) => /^[68]/.test(c) && isP(c, C.nondeduct));
    const notInv = a => !isP(a, C.inv) && !isP(a, C.invProv);
    const purch = S((d, c) => isP(d, C.inv) && notInv(c) && !/^[68]/.test(c)) - S((d, c) => isP(c, C.inv) && notInv(d) && !/^[68]/.test(d) && !isP(d, C.cip) && !isP(d, C.ppe) && !isP(d, C.intg)); // mua vào − trả lại nhà cung cấp
    // Vật tư nằm trong TSCĐ ghi tăng trong năm (= ô "Material" của bảng TS ghi tăng trong file mẫu): đã được trừ khi mua ⇒ bỏ khỏi dòng 10 để không trừ hai lần.
    // Mặc định ước tính: vật tư xuất thẳng lên TS + TS kết chuyển từ XDCB × tỷ lệ vật tư trong XDCB của năm; nhập tay số chính xác từ báo cáo TS nếu có.
    const isA = a => isP(a, C.ppe) || isP(a, C.intg);
    const direct = S((d, c) => isA(d) && isP(c, C.inv)), cap = S((d, c) => isA(d) && isP(c, C.cip));
    const mCip = S((d, c) => isP(d, C.cip) && isP(c, C.inv)), dCip = S((d, c) => isP(d, C.cip) && !isP(c, C.cip)), share = dCip > 0 ? Math.min(1, Math.max(0, mCip / dCip)) : 0;
    const I0 = yIn(y), toAsset = I0.matInAssets != null && I0.matInAssets !== '' ? +I0.matInAssets : direct + cap * share;
    const addT = S((d, c) => isP(d, C.ppe) && !isP(c, C.ppe) && !isP(c, C.ppeDep)) - S((d, c) => isP(c, C.ppe) && !isP(d, C.ppe) && !isP(d, C.ppeDep) && !/^[68]/.test(d)); // ghi tăng hữu hình (trừ điều chỉnh giảm nguyên giá)
    const addI = S((d, c) => isP(d, C.intg) && !isP(c, C.intg) && !isP(c, C.intgDep)) - S((d, c) => isP(c, C.intg) && !isP(d, C.intg) && !isP(d, C.intgDep) && !/^[68]/.test(d));
    const paid = S((d, c) => isP(d, C.cit) && isP(c, C.cash)) - S((d, c) => isP(c, C.cit) && isP(d, C.cash));
    const booked = S((d, c) => isP(d, C.citExp)) - S((d, c) => isP(c, C.citExp));
    const I = yIn(y), manual = (I.adj || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const addBack = depT + depI + cogs + prov + nbv + nond, ded = (purch - toAsset) + addT + addI;
    const acctProfit = rev - exp, ti0 = acctProfit + addBack - ded + manual, lossIn = I.lossCF != null && I.lossCF !== '' ? +I.lossCF : (lossAvail || 0), lossUsed = Math.min(Math.max(0, ti0), lossIn), ti = ti0 - lossUsed, lossOut = lossIn - lossUsed + Math.max(0, -ti0);
    const tax = Math.max(0, ti) * C.rate; // lỗ: thu nhập chịu thuế âm ⇒ thuế 0, chuyển lỗ sang năm sau
    // trình bày theo tờ khai Timor (ITR): dòng 5 thu nhập, 10/15/20 các khoản trừ đặc thù, 110 chi phí khác được trừ
    const other = exp - addBack + manual * -1; // chi phí kế toán đã bỏ phần không được trừ (điều chỉnh tay dương = tăng thu nhập ⇒ giảm chi phí)
    const itr = [
      { l: '5', n: 'Tổng thu nhập (Total Gross Income)', v: rev },
      { l: '10', n: 'Mua hàng tồn kho, vật tư (Purchases – Inventory and trading stock)', v: purch - toAsset },
      { l: '15', n: 'Khấu hao được trừ – TSCĐ hữu hình ghi tăng trong năm', v: addT },
      { l: '20', n: 'Hao mòn được trừ – TSCĐ vô hình ghi tăng trong năm', v: addI },
      { l: '110', n: 'Chi phí khác được trừ', v: other },
    ];
    const totExp = itr.slice(1).reduce((s, x) => s + x.v, 0);
    itr.push({ l: '', n: 'Tổng chi phí được trừ', v: totExp, b: 1 }, { l: '140', n: 'Thu nhập trước bù lỗ', v: rev - totExp, b: 1 }, { l: '145', n: 'Lỗ năm trước chuyển sang', v: -lossUsed },
      { l: '150', n: 'Thu nhập chịu thuế', v: ti, b: 1 }, { l: '155', n: 'Lỗ chuyển sang năm sau', v: lossOut }, { l: '165', n: `Thuế TNDN (${(C.rate * 100).toFixed(0)}%)`, v: tax, b: 1 }, { l: '175', n: 'Thuế đã tạm nộp trong năm', v: -paid }, { l: '220', n: 'Thuế còn phải nộp / (nộp thừa)', v: tax - paid, b: 1 });
    const recon = [
      { n: 'Lợi nhuận kế toán (doanh thu − chi phí, bỏ chi phí thuế TNDN)', v: acctProfit, b: 1 },
      { n: '(+) Khấu hao TSCĐ hữu hình kế toán', v: depT }, { n: '(+) Hao mòn TSCĐ vô hình kế toán', v: depI },
      { n: '(+) Giá vốn / xuất dùng hàng tồn kho vào chi phí', v: cogs }, { n: '(+) Dự phòng giảm giá hàng tồn kho', v: prov },
      { n: '(+) Giá trị còn lại TSCĐ thanh lý / ghi giảm', v: nbv }, { n: '(+) Chi phí không được trừ khác (TK cấu hình)', v: nond },
      { n: '(−) Mua hàng tồn kho, vật tư trong năm', v: -purch }, { n: '(+) Vật tư trong TSCĐ ghi tăng (đã trừ khi mua – tránh trừ hai lần)' + (I0.matInAssets != null && I0.matInAssets !== '' ? ' – nhập tay' : ' – ước tính'), v: toAsset },
      { n: '(−) TSCĐ hữu hình ghi tăng', v: -addT }, { n: '(−) TSCĐ vô hình ghi tăng', v: -addI },
      ...(I.adj || []).filter(x => +x.amount).map(x => ({ n: '(±) ' + (x.name || 'Điều chỉnh khác'), v: +x.amount })),
      { n: 'Thu nhập chịu thuế trước bù lỗ', v: ti0, b: 1 },
    ];
    return { lossIn, lossOut, lossAuto: !(I.lossCF != null && I.lossCF !== ''), matEst: direct + cap * share, rev, exp, acctProfit, addBack, ded, ti0, lossUsed, ti, tax, paid, booked, payable: tax - paid, itr, recon };
  }

  // Thuế hoãn lại theo bảng cân đối: TS → chênh lệch = giá trị ghi sổ − cơ sở thuế (dương = chịu thuế ⇒ DTL); nợ phải trả → chênh lệch = cơ sở thuế − giá trị ghi sổ
  // tỷ lệ vật tư trong XDCB dở dang (luỹ kế tới cuối năm): vật tư xuất vào 241 / tổng phát sinh Nợ 241
  let CIPP = null; // phát sinh Nợ XDCB theo năm × TK Có (1 lần quét / lần tính)
  function cipShare(y, C) { if (!CIPP) CIPP = all(`SELECT substr(ym,1,4) y, acc_debit d, acc_credit c, sum(amount) a FROM entries WHERE acc_debit GLOB '24*' GROUP BY 1,2,3`); const P = CIPP.filter(r => +r.y <= y);
    let m = 0, t = 0; for (const r of P) { if (!isP(r.d, C.cip) || isP(r.c, C.cip)) continue; t += r.a; if (isP(r.c, C.inv)) m += r.a; } return t > 0 ? Math.min(1, m / t) : 0; }
  function deferred(y, C) {
    const at = `${y}-12`, B = balAt(at), I = yIn(y), r = C.rate;
    const rows = [];
    const add = (k, n, carry, base, note) => { const td = carry - base; rows.push({ k, n, carry, base, td, dt: -r * td, note }); };
    const inv = B(C.inv) + B(C.invProv);
    add('inv', 'Hàng tồn kho (thuần sau dự phòng)', inv, 0, 'Hàng mua được trừ khi mua ⇒ cơ sở thuế = 0');
    add('ppe', 'TSCĐ hữu hình (giá trị còn lại)', B(C.ppe) + B(C.ppeDep), 0, 'Được trừ toàn bộ khi ghi tăng ⇒ cơ sở thuế = 0');
    add('intg', 'TSCĐ vô hình (giá trị còn lại)', B(C.intg) + B(C.intgDep), 0, 'Được trừ toàn bộ khi ghi tăng ⇒ cơ sở thuế = 0');
    const cip = B(C.cip), sh = cipShare(y, C), est = cip * (1 - sh);
    add('cip', 'Chi phí XDCB dở dang', cip, I.cipBase == null || I.cipBase === '' ? est : +I.cipBase, I.cipBase == null || I.cipBase === '' ? `Vật tư trong XDCB đã được trừ khi mua ⇒ cơ sở thuế = phần nhân công, chi phí khác ≈ ${(100 - sh * 100).toFixed(1)}% (ước tính theo luỹ kế); nhập tay nếu có số chính xác` : 'Cơ sở thuế nhập tay');
    const ar = B(C.ar), arp = B(C.arProv); if (Math.abs(arp) > 0.004) add('arp', 'Phải thu (dự phòng khó đòi chưa được trừ)', ar + arp, ar, 'Dự phòng kế toán chưa được trừ ⇒ chênh lệch được khấu trừ (DTA)');
    for (const x of I.extra || []) if (x && x.name) { const carry = +x.carry || 0, base = +x.base || 0; x.liab ? rows.push({ k: 'x', n: x.name, carry, base, td: base - carry, dt: -r * (base - carry), note: 'Nợ phải trả – nhập tay', liab: 1 }) : add('x', x.name, carry, base, 'Nhập tay'); }
    const net = rows.reduce((s, x) => s + x.dt, 0), gl = B(C.dta) + B(C.dtl); // GL: 243 dư Nợ (+), 347 dư Có (−)
    return { at, rows, net, dta: rows.filter(x => x.dt > 0).reduce((s, x) => s + x.dt, 0), dtl: rows.filter(x => x.dt < 0).reduce((s, x) => s + x.dt, 0), gl };
  }

  // Chạy lần lượt các năm có dữ liệu để chuyển lỗ: lỗ năm trước (còn chưa bù) → năm sau
  function chain(C, upto) { const out = new Map(); let avail = 0;
    for (const y of years()) { if (upto != null && y > upto) break; const c = current(y, C, pairs(y), avail); out.set(y, c); avail = c.lossOut; } return out; }
  function compute(y) {
    CIPP = null; y = +y; const C = cfg(), CH = chain(C, y), cur = CH.get(y) || current(y, C, pairs(y), 0), d1 = deferred(y, C), d0 = deferred(y - 1, C);
    const mov = d1.net - d0.net; // + = tăng DTA / giảm DTL ⇒ thu nhập thuế hoãn lại
    const dtExpense = -mov, totalExpense = cur.tax + dtExpense;
    const glMov = d1.gl - d0.gl, je = [];
    const fix = cur.tax - cur.booked; if (Math.abs(fix) > 0.5) je.push(fix > 0 ? { dr: C.citExp[0], cr: C.cit[0], a: fix, n: 'Ghi nhận chi phí thuế TNDN hiện hành còn thiếu' } : { dr: C.cit[0], cr: C.citExp[0], a: -fix, n: 'Giảm chi phí thuế TNDN hiện hành ghi thừa' });
    const dfix = (d1.net - d1.gl); // chênh lệch giữa thuế hoãn lại tính toán và số dư sổ cuối năm
    if (Math.abs(dfix) > 0.5) je.push(dfix < 0 ? { dr: C.dtExp[0], cr: C.dtl[0], a: -dfix, n: 'Ghi nhận thuế hoãn lại phải trả (tăng DTL)' } : { dr: C.dtl[0], cr: C.dtExp[0], a: dfix, n: 'Hoàn nhập thuế hoãn lại phải trả (giảm DTL) / ghi nhận DTA' });
    return { year: y, cfg: C, input: yIn(y), cur, d1, d0, mov, glMov, dtExpense, totalExpense, etr: cur.acctProfit ? totalExpense / cur.acctProfit : null, je, hasPrior: years().includes(y - 1) };
  }
  // Tổng hợp nhiều năm (tự động từ dữ liệu)
  function summary() { CIPP = null; const C = cfg(), CH = chain(C), DM = new Map(), dOf = y => DM.get(y) || DM.set(y, deferred(y, C)).get(y); return years().map(y => { const c = CH.get(y), d = dOf(y), d0 = dOf(y - 1);
    return { lossOut: c.lossOut, year: y, rev: c.rev, profit: c.acctProfit, ti: c.ti, tax: c.tax, paid: c.paid, payable: c.payable, dtNet: d.net, dtMov: d.net - d0.net, gl: d.gl, booked: c.booked }; }); }
  return { compute, summary, cfg, setCfg, setYear, years, DEF };
}
module.exports = { make };
