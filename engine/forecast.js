'use strict';
// Dự báo báo cáo tài chính (B02 kết quả kinh doanh, B01 cân đối kế toán) cho các năm tương lai.
// Lịch sử lấy từ chính FIN.income / FIN.balanceSheet theo từng năm (năm dở dang được quy đổi cả năm theo số tháng có dữ liệu).
// Nhiều mô hình chuỗi thời gian; "Tự động (tổng hợp)" = bình quân gia quyền theo sai số kiểm định lại (backtest) của từng mô hình.

const MODELS = {
  ens: 'Tự động – tổng hợp các mô hình (trọng số theo độ chính xác)',
  linear: 'Hồi quy tuyến tính (xu hướng)',
  holt: 'Holt – san bằng mũ kép (xu hướng thích nghi)',
  cagr: 'Tăng trưởng kép bình quân (CAGR)',
  growth3: 'Tăng trưởng bình quân 3 năm gần nhất',
  loglin: 'Hồi quy mũ (log-tuyến tính)',
  ma3: 'Bình quân trượt 3 năm',
  drift: 'Ngẫu nhiên có xu hướng (Naive + drift)',
};
const FIT = ['linear', 'holt', 'cagr', 'growth3', 'loglin', 'ma3', 'drift'];
const clampG = g => Math.max(-0.6, Math.min(0.8, g));

// ---- các mô hình: nhận chuỗi y (năm), trả về h giá trị dự báo hoặc null nếu không áp dụng được ----
function linear(y, h) {
  const n = y.length; if (n < 2) return null;
  const mx = (n - 1) / 2, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0; y.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; });
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  return Array.from({ length: h }, (_, k) => a + b * (n + k));
}
function holt(y, h) {
  const n = y.length; if (n < 3) return null;
  let best = null;
  for (const al of [0.2, 0.4, 0.6, 0.8]) for (const be of [0.1, 0.3, 0.5]) {
    let l = y[0], t = y[1] - y[0], sse = 0;
    for (let i = 1; i < n; i++) { const f = l + t; sse += (y[i] - f) ** 2; const l2 = al * y[i] + (1 - al) * (l + t); t = be * (l2 - l) + (1 - be) * t; l = l2; }
    if (!best || sse < best.sse) best = { sse, l, t };
  }
  return Array.from({ length: h }, (_, k) => best.l + best.t * (k + 1));
}
function cagr(y, h) {
  const n = y.length; if (n < 3) return null;
  const a = y[0], b = y[n - 1]; if (!(a > 0 && b > 0)) return null;
  const g = clampG(Math.pow(b / a, 1 / (n - 1)) - 1);
  return Array.from({ length: h }, (_, k) => b * Math.pow(1 + g, k + 1));
}
function growth3(y, h) {
  const n = y.length; if (n < 3) return null;
  const gs = []; for (let i = Math.max(1, n - 3); i < n; i++) if (Math.abs(y[i - 1]) > 1e-9) gs.push((y[i] - y[i - 1]) / Math.abs(y[i - 1]));
  if (!gs.length) return null; const g = clampG(gs.reduce((s, v) => s + v, 0) / gs.length), b = y[n - 1];
  return Array.from({ length: h }, (_, k) => b * Math.pow(1 + g, k + 1));
}
function loglin(y, h) {
  if (y.length < 3 || y.some(v => !(v > 0))) return null;
  const f = linear(y.map(Math.log), h); return f && f.map(Math.exp);
}
function ma3(y, h) { if (y.length < 2) return null; const w = y.slice(-3), m = w.reduce((s, v) => s + v, 0) / w.length; return Array(h).fill(m); }
function drift(y, h) { const n = y.length; if (n < 2) return null; const d = (y[n - 1] - y[0]) / (n - 1); return Array.from({ length: h }, (_, k) => y[n - 1] + d * (k + 1)); }
const FN = { linear, holt, cagr, growth3, loglin, ma3, drift };

// Kiểm định lại: dùng dữ liệu đến năm t dự báo năm t+1 (rolling origin) trên tối đa 3 năm cuối → sai số % bình quân (MAPE, có chặn)
function backtest(y, m) {
  const n = y.length, errs = [];
  for (let cut = Math.max(3, n - 3); cut < n; cut++) {
    const f = FN[m](y.slice(0, cut), 1); if (!f) continue;
    const act = y[cut], den = Math.max(Math.abs(act), Math.abs(y[cut - 1]) * 0.1, 1e-6);
    errs.push(Math.min(2, Math.abs(f[0] - act) / den));
  }
  return errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : null;
}
function forecastSeries(y, h, model) {
  const res = {};
  for (const m of FIT) { const f = FN[m](y, h); if (f && f.every(Number.isFinite)) res[m] = { f, mape: backtest(y, m) }; }
  const ok = Object.entries(res).filter(([, r]) => r.mape != null);
  let ens = null;
  if (ok.length) { const w = ok.map(([, r]) => 1 / Math.max(r.mape, 0.01)), W = w.reduce((s, v) => s + v, 0);
    ens = { f: Array.from({ length: h }, (_, k) => ok.reduce((s, [, r], i) => s + r.f[k] * w[i], 0) / W), mape: ok.reduce((s, [, r], i) => s + r.mape * w[i], 0) / W,
      weights: Object.fromEntries(ok.map(([m], i) => [m, w[i] / W])) }; }
  else if (Object.keys(res).length) { const ks = Object.keys(res); ens = { f: Array.from({ length: h }, (_, k) => ks.reduce((s, m) => s + res[m].f[k], 0) / ks.length), mape: null, weights: {} }; }
  res.ens = ens || { f: Array(h).fill(y.length ? y[y.length - 1] : 0), mape: null, weights: {} };
  const pick = res[model] ? model : 'ens';
  return { pick, f: res[pick].f, mape: res[pick].mape, models: res };
}

function make(FIN, monthsFn, PC) {
  let HC = null;
  // Lịch sử theo năm: B02 cả năm (năm dở dang quy đổi 12 tháng) + B01 số dư cuối năm
  function history(force) {
    const yms = monthsFn().map(m => m.ym).sort();
    const key = yms.length + '|' + yms[0] + '|' + yms.at(-1);
    if (!force && HC && HC.key === key && Date.now() - HC.t < 15 * 60e3) return HC.v;
    const years = [...new Set(yms.map(m => m.slice(0, 4)))].sort(), out = [];
    for (const y of years) {
      const ms = yms.filter(m => m.startsWith(y)), from = ms[0], to = ms.at(-1), nm = ms.length;
      const inc = FIN.income(from, to), bs = FIN.balanceSheet(from, to);
      const k = nm < 12 ? 12 / nm : 1, P = {}; for (const l of inc.lines) P[l.k] = (l.cur || 0) * k;
      const B = {}; for (const l of bs.lines) B[l.code] = l.cb || 0;
      out.push({ y: +y, months: nm, partial: nm < 12, annualized: k !== 1, P, B, bsLines: bs.lines.map(l => ({ code: l.code, name: l.name, lvl: l.lvl })), incLines: inc.lines.map(l => ({ code: l.code, k: l.k, name: l.name, bold: l.bold })) });
    }
    HC = { key, t: Date.now(), v: out }; return out;
  }

  // o: { h: số năm dự báo, model, fromYear: bỏ các năm trước năm này, skipPartial: không dùng năm dở dang, adj: { k: % điều chỉnh tăng trưởng doanh thu / chi phí } }
  function compute(o = {}) {
    const H = history(!!o.refresh); if (!H.length) return { years: [], hist: [], fc: [], models: MODELS };
    const h = Math.max(1, Math.min(10, +o.h || 3)), model = MODELS[o.model] ? o.model : 'ens';
    let hist = H.filter(x => !o.fromYear || x.y >= +o.fromYear); if (o.skipPartial) hist = hist.filter(x => !x.partial);
    if (hist.length < 2) hist = H.slice(-2);
    const last = hist.at(-1), fy = Array.from({ length: h }, (_, i) => last.y + 1 + i), adj = o.adj || {};
    const lines = H.at(-1).incLines, bsL = H.at(-1).bsLines;
    const ser = k => hist.map(x => x.P[k] || 0), tweak = (arr, pct) => pct ? arr.map((v, i) => v * Math.pow(1 + pct / 100, i + 1)) : arr;
    // 1) Doanh thu thuần & các dòng gốc dự báo trực tiếp; 2) dòng tổng tính lại theo công thức B02 cho khớp
    const BASE = ['rev', 'ded', 'cogs', 'finInc', 'finExp', 'sell', 'admin', 'othInc', 'othExp'], detail = {}, F = {};
    for (const k of BASE) { const r = forecastSeries(ser(k), h, model); detail[k] = r; F[k] = tweak(r.f, k === 'rev' ? adj.rev : ['cogs', 'sell', 'admin'].includes(k) ? adj.cost : 0); }
    // Mô hình "tỷ lệ % doanh thu" cho giá vốn / chi phí: tham khảo, hiển thị song song
    const revH = ser('rev'), pctOf = k => { const w = hist.slice(-3), s = w.reduce((a, x) => a + (x.P.rev || 0), 0); return s ? w.reduce((a, x) => a + (x.P[k] || 0), 0) / s : null; };
    const ratio = {}; for (const k of ['cogs', 'sell', 'admin']) { const p = pctOf(k); ratio[k] = p == null ? null : F.rev.map(v => v * p); }
    if (o.costByRatio) for (const k of ['cogs', 'sell', 'admin']) if (ratio[k]) F[k] = tweak(ratio[k], adj.cost);
    const T = i => { const g = x => F[x][i]; const net = g('rev') - g('ded'), gp = net - g('cogs'), op = gp + g('finInc') - g('finExp') - g('sell') - g('admin'), other = g('othInc') - g('othExp'), pbt = op + other;
      const er = (() => { const w = hist.slice(-3).filter(x => (x.P.pbt || 0) > 0); const s = w.reduce((a, x) => a + x.P.pbt, 0); return s ? Math.max(0, Math.min(0.5, w.reduce((a, x) => a + (x.P.tax || 0), 0) / s)) : 0.2; })();
      const tax = pbt > 0 ? pbt * er : 0; return { net, gp, op, other, pbt, tax, pat: pbt - tax, er }; };
    const fcP = fy.map((y, i) => { const t = T(i); const P = {}; for (const k of BASE) P[k] = F[k][i]; Object.assign(P, t); return { y, P }; });
    // B01: từng khoản mục cấp I dự báo bằng cùng mô hình; vốn chủ = năm trước + LNST dự báo; Tiền = khoản cân đối
    const L1 = bsL.filter(l => l.lvl === 1).map(l => l.code), sec = {}; let cur = null;
    for (const l of bsL) { if (l.lvl === 0 && /^[ABCD]$/.test(l.code)) cur = l.code; if (l.lvl === 1) sec[l.code] = cur; }
    const bsDet = {}, BF = fy.map(() => ({}));
    for (const c of L1) { if (c === '110' || sec[c] === 'D') continue; const r = forecastSeries(hist.map(x => x.B[c] || 0), h, model); bsDet[c] = r; r.f.forEach((v, i) => BF[i][c] = v); }
    // số dư B01 thực tế là tại tháng cuối có dữ liệu → cộng LNST ước của các tháng còn lại của năm dở dang
    const HL = H.at(-1); let eq = (HL.B['D'] || 0) + (HL.partial ? (HL.P.pat || 0) * (12 - HL.months) / 12 : 0);
    fcP.forEach((x, i) => { const B = BF[i]; eq += x.P.pat; for (const c of L1) if (sec[c] === 'D') B[c] = 0; const eqc = L1.find(c => sec[c] === 'D'); if (eqc) B[eqc] = eq;
      B.C = L1.filter(c => sec[c] === 'C').reduce((s, c) => s + (B[c] || 0), 0); B.D = eq; B['440'] = B.C + B.D;
      const nonCash = L1.filter(c => (sec[c] === 'A' || sec[c] === 'B') && c !== '110').reduce((s, c) => s + (B[c] || 0), 0);
      B['110'] = B['440'] - nonCash; B.A = L1.filter(c => sec[c] === 'A').reduce((s, c) => s + (B[c] || 0), 0); B.B = L1.filter(c => sec[c] === 'B').reduce((s, c) => s + (B[c] || 0), 0); B['270'] = B.A + B.B; x.B = B; });
    const sumMape = k => (detail[k] && detail[k].models) ? Object.fromEntries(Object.entries(detail[k].models).map(([m, r]) => [m, { mape: r.mape, f: r.f, w: r.weights }])) : {};
    return { models: MODELS, model, h, years: hist.map(x => x.y), hist: hist.map(x => ({ y: x.y, months: x.months, partial: x.partial, P: x.P, B: x.B })), fc: fcP, incLines: lines, bsLines: bsL.filter(l => l.lvl <= 1),
      compare: { rev: sumMape('rev'), cogs: sumMape('cogs'), sell: sumMape('sell'), admin: sumMape('admin') }, ratio, mape: Object.fromEntries(BASE.map(k => [k, detail[k].mape])), bsMape: Object.fromEntries(Object.entries(bsDet).map(([c, r]) => [c, r.mape])) };
  }
  // ---- Dự báo theo tháng cho năm dự báo đầu tiên ----
  let MC = null;
  function monthHist(force) {
    const yms = monthsFn().map(m => m.ym).sort(), key = yms.length + '|' + yms.at(-1);
    if (!force && MC && MC.key === key && Date.now() - MC.t < 15 * 60e3) return MC.v;
    const v = yms.map(ym => { const P = {}; for (const l of FIN.income(ym, ym).lines) P[l.k] = l.cur || 0; return { ym, P }; });
    MC = { key, t: Date.now(), v }; return v;
  }
  // Holt-Winters cộng tính (mùa vụ 12 tháng) – tham số chọn theo sai số nhỏ nhất
  function hw(y, h) {
    const n = y.length, L = 12; if (n < 2 * L) return null; let best = null;
    for (const al of [0.2, 0.4, 0.6]) for (const be of [0.05, 0.2]) for (const ga of [0.1, 0.3, 0.5]) {
      let l = y.slice(0, L).reduce((s, v) => s + v, 0) / L, t = (y.slice(L, 2 * L).reduce((s, v) => s + v, 0) / L - l) / L;
      const S = y.slice(0, L).map(v => v - l); let sse = 0;
      for (let i = L; i < n; i++) { const si = S[i % L], f = l + t + si; sse += (y[i] - f) ** 2; const l2 = al * (y[i] - si) + (1 - al) * (l + t); t = be * (l2 - l) + (1 - be) * t; S[i % L] = ga * (y[i] - l2) + (1 - ga) * si; l = l2; }
      if (!best || sse < best.sse) best = { sse, l, t, S: S.slice() };
    }
    return Array.from({ length: h }, (_, k) => best.l + best.t * (k + 1) + best.S[(n + k) % L]);
  }
  // o.mmethod: 'season' = dự báo năm × tỷ trọng mùa vụ từng tháng (khớp tổng năm); 'hw' = Holt-Winters trên chuỗi tháng; 'avg' = bình quân 2 phương pháp
  function monthly(o = {}) {
    const R = compute(o); if (!R.fc.length) return { months: [], rows: {}, hist: [] };
    const Y = R.fc[0].y, MH = monthHist(!!o.refresh), method = ['season', 'hw', 'avg'].includes(o.mmethod) ? o.mmethod : 'season';
    const full = new Set(); { const c = {}; for (const x of MH) c[x.ym.slice(0, 4)] = (c[x.ym.slice(0, 4)] || 0) + 1; for (const y in c) if (c[y] === 12) full.add(y); }
    const BASE = ['rev', 'ded', 'cogs', 'finInc', 'finExp', 'sell', 'admin', 'othInc', 'othExp'], out = {}, share = {};
    for (const k of BASE) {
      // tỷ trọng mùa vụ: bình quân tỷ trọng từng tháng trong các năm đủ 12 tháng (3 năm gần nhất); thiếu năm đủ → chia đều
      const ys = [...full].sort().slice(-3), sh = Array(12).fill(0); let used = 0;
      for (const y of ys) { const vs = MH.filter(x => x.ym.startsWith(y)).map(x => x.P[k] || 0), tot = vs.reduce((s, v) => s + v, 0); if (Math.abs(tot) < 1e-6) continue; vs.forEach((v, i) => sh[i] += v / tot); used++; }
      const S = used ? sh.map(v => v / used) : Array(12).fill(1 / 12); share[k] = S;
      const annual = R.fc[0].P[k] || 0, a1 = S.map(v => annual * v);
      // Holt-Winters: chuỗi tháng đến hết dữ liệu, dự báo tới hết năm Y
      const ser = MH.map(x => x.P[k] || 0), lastYm = MH.at(-1).ym, gap = (Y - +lastYm.slice(0, 4)) * 12 - +lastYm.slice(5, 7);
      const hwf = hw(ser, gap + 12), a2 = hwf ? hwf.slice(gap, gap + 12) : null;
      out[k] = method === 'hw' && a2 ? a2 : method === 'avg' && a2 ? a1.map((v, i) => (v + a2[i]) / 2) : a1;
    }
    const er = (() => { const t = R.fc[0].P; return t.pbt > 0 ? t.tax / t.pbt : 0; })();
    const months = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`);
    const rows = months.map((ym, i) => { const P = {}; for (const k of BASE) P[k] = out[k][i];
      P.net = P.rev - P.ded; P.gp = P.net - P.cogs; P.op = P.gp + P.finInc - P.finExp - P.sell - P.admin; P.other = P.othInc - P.othExp; P.pbt = P.op + P.other; P.tax = P.pbt * er; P.pat = P.pbt - P.tax; return { ym, P }; });
    const hist = MH.slice(-24);
    // ---- B01 theo tháng: đi từ số dư thực tế gần nhất tới số dư dự báo cuối năm Y; vốn chủ cộng dồn LNST từng tháng; Tiền = khoản cân đối ----
    const HA = history(), lastA = HA.at(-1), lastYm = MH.at(-1).ym, bsL = lastA.bsLines, sec = {}; let cs = null;
    for (const l of bsL) { if (l.lvl === 0 && /^[ABCD]$/.test(l.code)) cs = l.code; if (l.lvl === 1) sec[l.code] = cs; }
    const L1 = bsL.filter(l => l.lvl === 1).map(l => l.code), endB = R.fc[0].B, startB = lastA.B;
    const path = []; { let [yy, mo] = lastYm.split('-').map(Number); while (true) { mo++; if (mo > 12) { mo = 1; yy++; } if (yy > Y) break; path.push(`${yy}-${String(mo).padStart(2, '0')}`); } }
    const N = path.length, patOf = ym => { const r = rows.find(x => x.ym === ym); return r ? r.P.pat : (lastA.P.pat || 0) / 12; };
    let eq = startB.D || 0; const eqc = L1.find(c => sec[c] === 'D');
    const bsM = path.map((ym, i) => { const B = {}, w = (i + 1) / N;
      for (const c of L1) { if (c === '110' || sec[c] === 'D') continue; B[c] = (startB[c] || 0) + ((endB[c] || 0) - (startB[c] || 0)) * w; }
      eq += patOf(ym); if (eqc) B[eqc] = eq; B.D = eq;
      B.C = L1.filter(c => sec[c] === 'C').reduce((s, c) => s + (B[c] || 0), 0); B['440'] = B.C + B.D;
      const nonCash = L1.filter(c => (sec[c] === 'A' || sec[c] === 'B') && c !== '110').reduce((s, c) => s + (B[c] || 0), 0); B['110'] = B['440'] - nonCash;
      B.A = L1.filter(c => sec[c] === 'A').reduce((s, c) => s + (B[c] || 0), 0); B.B = L1.filter(c => sec[c] === 'B').reduce((s, c) => s + (B[c] || 0), 0); B['270'] = B.A + B.B; return { ym, B, est: ym.slice(0, 4) < String(Y) }; });
    // ---- Lưu chuyển tiền tệ theo tháng (gián tiếp, từ chênh lệch B01 dự báo) – ΔTiền = HĐKD + HĐĐT + HĐTC luôn khớp ----
    const opA = L1.filter(c => sec[c] === 'A' && !['110', '120'].includes(c)), invA = L1.filter(c => c === '120' || sec[c] === 'B'), liab = L1.filter(c => sec[c] === 'C');
    const cfM = bsM.map((x, i) => { const p = i ? bsM[i - 1].B : startB, d = c => (x.B[c] || 0) - (p[c] || 0), pat = patOf(x.ym);
      const wc = -opA.reduce((s, c) => s + d(c), 0), lb = liab.reduce((s, c) => s + d(c), 0), cfo = pat + wc + lb, cfi = -invA.reduce((s, c) => s + d(c), 0), eqOther = d('D') - pat, cff = eqOther;
      return { ym: x.ym, est: x.est, pat, wc, lb, cfo, cfi, cff, net: cfo + cfi + cff, open: p['110'] || 0, close: x.B['110'] || 0,
        det: Object.fromEntries([...opA.map(c => [c, -d(c)]), ...liab.map(c => [c, d(c)]), ...invA.map(c => [c, -d(c)])]) }; });
    return { year: Y, method, months, rows, hist, share, annual: R.fc[0].P, hasHW: MH.length >= 24, fullYears: [...full].sort(),
      bsLines: bsL.filter(l => l.lvl <= 1), bsM, cfM, lastYm, startB, cfGroups: { opA, liab, invA } };
  }
  // ---- Dự báo giao dịch nội bộ theo công ty (dựa trên PC.internalYears: mua theo nhóm TK chi phí / hàng / tài sản, bán theo doanh thu) ----
  const ICOL = ['buy627', 'buy641', 'buy642', 'buyExpO', 'buyGoods', 'buyAsset', 'sales', 'salesAdj'];
  function internal(o = {}) {
    if (!PC || !PC.internalYears) return { years: [], rows: [] };
    const yms = monthsFn().map(m => m.ym).sort(), cnt = {}; for (const m of yms) cnt[m.slice(0, 4)] = (cnt[m.slice(0, 4)] || 0) + 1;
    let years = Object.keys(cnt).sort(); if (o.fromYear) years = years.filter(y => +y >= +o.fromYear); if (o.skipPartial) years = years.filter(y => cnt[y] === 12);
    if (years.length < 2) years = Object.keys(cnt).sort().slice(-2);
    const r = PC.internalYears(years, !!o.tt, !!o.ex, o.company || ''), h = Math.max(1, Math.min(10, +o.h || 3)), model = MODELS[o.model] ? o.model : 'ens';
    const k = y => cnt[y] < 12 ? 12 / cnt[y] : 1, fy = Array.from({ length: h }, (_, i) => +years.at(-1) + 1 + i), adj = o.adj || {};
    const tw = (arr, pct) => pct ? arr.map((v, i) => v * Math.pow(1 + pct / 100, i + 1)) : arr, mapes = [];
    const rows = r.rows.map(c => {
      const hist = Object.fromEntries(years.map(y => { const t = {}; for (const col of ICOL) t[col] = (c.y[y][col] || 0) * k(y); return [y, t]; }));
      const fc = fy.map(() => ({})), mp = {};
      for (const col of ICOL) { const ser = years.map(y => hist[y][col]); if (ser.every(v => Math.abs(v) < 0.005)) { fc.forEach(x => x[col] = 0); continue; }
        const f = forecastSeries(ser, h, model); mp[col] = f.mape; if (f.mape != null) mapes.push(f.mape);
        tw(f.f, col === 'sales' || col === 'salesAdj' ? adj.sales : adj.buy).forEach((v, i) => fc[i][col] = (o.noNeg && v < 0 && ser.at(-1) >= 0) ? 0 : v); }
      const tot = t => { t.buyTot = t.buy627 + t.buy641 + t.buy642 + t.buyExpO + t.buyGoods + t.buyAsset; t.salesNet = t.sales - t.salesAdj; return t; };
      Object.values(hist).forEach(tot); fc.forEach(tot);
      return { key: c.key, company: c.company, kind: c.kind, hist, fc, mape: mp };
    }).filter(x => years.some(y => Math.abs(x.hist[y].buyTot) + Math.abs(x.hist[y].salesNet) > 0.005));
    const sum = (get) => { const t = {}; for (const col of [...ICOL, 'buyTot', 'salesNet']) t[col] = rows.reduce((s, x) => s + (get(x)[col] || 0), 0); return t; };
    return { years: years.map(Number), partial: Object.fromEntries(years.map(y => [y, cnt[y] < 12 ? cnt[y] : 0])), fy, cols: r.cols, rows, model, models: MODELS,
      totHist: Object.fromEntries(years.map(y => [y, sum(x => x.hist[y])])), totFc: fy.map((_, i) => sum(x => x.fc[i])), mape: mapes.length ? mapes.reduce((a, b) => a + b, 0) / mapes.length : null };
  }
  return { compute, history, monthly, internal, MODELS };
}
module.exports = { make, forecastSeries, MODELS };
