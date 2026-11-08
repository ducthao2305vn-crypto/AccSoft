'use strict';
// Báo cáo quản trị "Đầu tư ra nước ngoài" (biểu mẫu giám sát của Tổng công ty): Mẫu 01 SXKD–tài chính, 02 chỉ tiêu tài chính,
// 03 phân tích nợ phải trả, 04 hàng tồn kho, 05 phân tích nợ phải thu, 06 danh sách quy trình / quy chế.
// Kỳ báo cáo = khoảng tháng from..to (tháng / quý / 6 tháng / năm / tuỳ chọn). Số liệu kỳ so sánh = cùng các tháng của 1 và 2 năm trước.
const nextStr = p => p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1);
const rng = (col, p) => `(${col} >= '${p}' AND ${col} < '${nextStr(p)}')`;
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const shiftY = (ym, k) => `${+ym.slice(0, 4) + k}${ym.slice(4)}`;
const DAY = 864e5;

function make(db, all, get, run, FIN) {
  const getS = k => { try { return JSON.parse(get(`SELECT v FROM settings WHERE k=?`, k)?.v || 'null'); } catch { return null; } };
  const setS = (k, v) => run(`INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, JSON.stringify(v));

  /* ---------- Mẫu 01: tình hình SXKD và tài chính (Tr USD) ---------- */
  const M01 = [
    ['A', 'A. Chỉ tiêu sản xuất kinh doanh', null, 1], ['s1', '1. Thuê bao di động (TB)', 'man'], ['s2', '2. Thuê bao cố định (TB)', 'man'], ['s3', '3. Thuê bao thu data (TB)', 'man'],
    ['B', 'B. Chỉ tiêu tài chính', null, 1],
    ['net', '1. DT thuần về bán hàng và cung cấp dịch vụ', p => p.net], ['cogs', '2. Giá vốn hàng bán', p => -p.cogs], ['gp', '3. LN gộp về bán hàng và cung cấp dịch vụ', p => p.gp],
    ['finInc', '4. Doanh thu hoạt động tài chính', p => p.finInc], ['finExp', '5. Chi phí tài chính', p => -p.finExp], ['sell', '6. Chi phí bán hàng', p => -p.sell],
    ['admin', '7. Chi phí quản lý doanh nghiệp', p => -p.admin], ['op', '8. Lợi nhuận thuần từ hoạt động kinh doanh', p => p.op], ['othInc', '9. Thu nhập khác', p => p.othInc],
    ['othExp', '10. Chi phí khác', p => -p.othExp], ['other', '11. Lợi nhuận khác', p => p.other], ['pbt', '12. Tổng lợi nhuận kế toán trước thuế', p => p.pbt],
    ['taxC', '13. Chi phí thuế TNDN hiện hành', p => -(p.tax - p.def)], ['taxD', '14. Chi phí thuế TNDN hoãn lại', p => -p.def], ['pat', '15. Lợi nhuận sau thuế thu nhập DN', p => p.pat]];
  // Thuế TNDN hoãn lại: TK 8212 (trừ kết chuyển 911) + bút toán 821 đối ứng 243 / 347 (tài sản / thuế thu nhập hoãn lại) khi đơn vị không tách 8212
  const deferred = (f, t) => get(`SELECT ifnull(sum(CASE WHEN acc_debit LIKE '821%' THEN amount ELSE -amount END), 0) v FROM entries WHERE ym>=? AND ym<=? AND (
      (acc_debit LIKE '8212%' AND acc_credit NOT LIKE '911%') OR (acc_credit LIKE '8212%' AND acc_debit NOT LIKE '911%')
      OR (acc_debit LIKE '821%' AND acc_debit NOT LIKE '8212%' AND (acc_credit LIKE '243%' OR acc_credit LIKE '347%'))
      OR (acc_credit LIKE '821%' AND acc_credit NOT LIKE '8212%' AND (acc_debit LIKE '243%' OR acc_debit LIKE '347%')))`, f, t).v;
  function plOf(f, t) { const inc = FIN.income(f, t), o = {}; for (const l of inc.lines) o[l.k] = l.cur; o.def = deferred(f, t); return o; }
  function m01(from, to) {
    const P = [plOf(shiftY(from, -2), shiftY(to, -2)), plOf(shiftY(from, -1), shiftY(to, -1)), plOf(from, to)];
    const man = getS('oinv_m01') || {}, key = from + '_' + to, mk = man[key] || {};
    return { key, rows: M01.map(([k, n, fn, hd]) => {
      if (hd) return { k, n, head: true };
      const v = fn === 'man' ? [null, null, null] : P.map(p => fn(p) / 1e6), m = mk[k] || {};
      return { k, n, man: fn === 'man', B: m.B ?? v[0], C: m.C ?? v[1], D: m.D ?? null, E: m.E ?? v[2], auto: v };
    }) };
  }
  // Lưu số nhập tay của mẫu 01 (cột KH, hoặc số thuê bao) theo kỳ: vals = {rowKey: {B, C, D, E}}
  function setM01(key, vals) { const man = getS('oinv_m01') || {}; man[key] = vals || {}; setS('oinv_m01', man); return man[key]; }

  /* ---------- Mẫu 02: một số chỉ tiêu tài chính (cuối kỳ và đầu năm, Tr USD) ---------- */
  function m02(from, to, overdue) {
    const bs = FIN.balanceSheet(to.slice(0, 4) + '-01', to), L = new Map(bs.lines.map(l => [l.code, l]));
    const v = (c, w) => (L.get(c)?.[w] || 0), S = (cs, w) => cs.reduce((s, c) => s + v(c, w), 0);
    const R = [ // [chỉ tiêu, hàm(w), cấp, ghi chú]
      ['1. Tổng tài sản', w => v('270', w), 0], ['- Tài sản ngắn hạn', w => v('A', w), 1], ['+ Tiền', w => v('110', w), 2], ['+ Đầu tư tài chính ngắn hạn', w => v('120', w), 2],
      ['+ Hàng tồn kho', w => v('140', w), 2], ['+ Phải thu khách hàng', w => v('131', w), 2], ['+ Trả trước cho người bán', w => v('132', w), 2, 'bổ sung'],
      ['+ Phải thu khác (nội bộ, 138, 141, 244)', w => S(['133b', '136'], w), 2, 'bổ sung'], ['+ Tài sản ngắn hạn khác', w => v('A', w) - S(['110', '120', '140', '131', '132', '133b', '136'], w), 2],
      ['- Tài sản dài hạn', w => v('B', w), 1], ['+ Tài sản cố định', w => v('220', w), 2], ['+ Xây dựng cơ bản dở dang', w => v('240', w), 2, 'bổ sung'],
      ['+ Đầu tư công ty con, liên kết', w => v('250', w), 2], ['+ Tài sản dài hạn khác', w => v('B', w) - S(['220', '240', '250'], w), 2],
      ['2. Vốn chủ sở hữu', w => v('D', w), 0], ['- Vốn góp chủ sở hữu', w => v('411', w), 1], ['- Lợi nhuận để lại và các quỹ', w => v('D', w) - v('411', w), 1],
      ['3. Tổng nợ', w => v('C', w), 0], ['- Nợ ngắn hạn', w => v('310', w), 1], ['+ Nợ phải trả', w => v('310', w) - v('320', w), 2],
      ['Trong đó: Nợ quá hạn', w => w === 'cb' ? overdue?.cb ?? null : overdue?.ob ?? null, 2, 'theo mẫu 03 (quá hạn ≥ 6 tháng)'], ['+ Vay ngân hàng', w => v('320', w), 2],
      ['- Nợ dài hạn', () => 0, 1], ['+ Nợ phải trả', () => 0, 2], ['+ Vay ngân hàng', () => 0, 2]];
    return { rows: R.map(([n, fn, lvl, note]) => { const B = fn('cb'), C = fn('ob'); return { n, lvl, note: note || '', B: B == null ? null : B / 1e6, C: C == null ? null : C / 1e6 }; }), diff: bs.diff, unmapped: bs.unmapped };
  }

  /* ---------- Số dư công nợ theo đối tượng + tuổi nợ FIFO ---------- */
  // pre: tiền tố TK; nat: +1 dư Nợ (phải thu), −1 dư Có (phải trả). Bút toán Nợ – Có cùng tiền tố, cùng đối tượng tự triệt tiêu → loại.
  function partnerBal(pre, d0, d1) {
    const self = `NOT (${rng('e.acc_debit', pre)} AND ${rng('e.acc_credit', pre)} AND ifnull(e.partner_debit,'')=ifnull(e.partner_credit,''))`, m = new Map();
    for (const [side, bp, sg] of [['debit', 'partner_debit', 1], ['credit', 'partner_credit', -1]]) {
      for (const r of all(`SELECT e.${bp} bp, e.account_date d, ifnull(e.due_date, '') due, group_concat(DISTINCT e.acc_${side}) accs, sum(e.amount) v FROM entries e
          WHERE e.account_date<=? AND ${rng('e.acc_' + side, pre)} AND ${self} GROUP BY 1,2,3`, d1)) {
        const k = r.bp || '(không có đối tượng)'; let o = m.get(k);
        if (!o) m.set(k, o = { bp: k, accs: new Set(), ob: 0, dr: 0, cr: 0, mv: [] });
        for (const a of String(r.accs || '').split(',')) if (a) o.accs.add(a);
        if (r.d < d0) o.ob += sg * r.v; else if (sg > 0) o.dr += r.v; else o.cr += r.v;
        o.mv.push({ d: r.d, due: r.due, v: sg * r.v });
      }
    }
    return m;
  }
  const DUAL = ['138812', '13111', '33111', '33121'];
  function acctBal(pre, d0, d1) { const m = new Map();
    for (const [side, sg] of [['debit', 1], ['credit', -1]]) for (const r of all(`SELECT e.acc_${side} a, sum(CASE WHEN e.account_date<? THEN e.amount ELSE 0 END) ob, sum(CASE WHEN e.account_date>=? THEN e.amount ELSE 0 END) mv FROM entries e WHERE e.account_date<=? AND ${rng('e.acc_' + side, pre)} GROUP BY 1`, d0, d0, d1)) {
      if (DUAL.some(d => String(r.a).startsWith(d))) continue; const o = m.get(r.a) || m.set(r.a, { acc: r.a, ob: 0, dr: 0, cr: 0 }).get(r.a); o.ob += sg * r.ob; if (sg > 0) o.dr += r.mv; else o.cr += r.mv; }
    return [...m.values()]; }
  // Phân bổ số dư (theo chiều nat) vào các khoản tăng gần nhất (FIFO) → số ngày quá hạn của từng phần
  function fifo(mv, nat, asOf, term) {
    const at = new Date(asOf).getTime(); let bal = 0; const inc = [];
    for (const x of mv) { if (x.d > asOf) continue; const v = nat * x.v; bal += v; if (v > 0) inc.push({ t: x.due && x.due >= x.d ? new Date(x.due).getTime() : new Date(x.d).getTime() + term * DAY, v }); }
    const out = []; if (bal <= 0.005) return { bal, parts: out };
    inc.sort((a, b) => b.t - a.t); let rem = bal;
    for (const it of inc) { if (rem <= 0) break; const take = Math.min(rem, it.v); rem -= take; out.push({ od: Math.floor((at - it.t) / DAY), v: take }); }
    if (rem > 0.005) out.push({ od: 99999, v: rem });
    return { bal, parts: out };
  }
  // b[0] = trong hạn (chưa đến hạn), b[i] = quá hạn trong (edges[i−2], edges[i−1]], phần tử cuối = quá hạn > edges cuối
  const bk = (parts, edges) => { const b = Array(edges.length + 2).fill(0); for (const p of parts) { if (p.od <= 0) { b[0] += p.v; continue; } let i = 1; while (i <= edges.length && p.od > edges[i - 1]) i++; b[i] += p.v; } return b; };

  // Nguyên tắc (giống B01): TK lưỡng tính (DUAL) → mỗi đối tượng xếp chiều theo số dư của chính nó tại từng thời điểm
  //   (đầu kỳ dư Có, cuối kỳ dư Nợ → ở mẫu phải trả: đầu kỳ có số, cuối kỳ 0; ở mẫu phải thu: đầu kỳ 0, cuối kỳ có số);
  //   TK công nợ khác ('acctp') → xếp chiều theo số dư ròng của TK chi tiết tại từng thời điểm; khi TK đúng chiều thì liệt kê các đối tượng của TK đó (số có dấu, cộng lại = số dư TK).
  // Nhờ vậy tổng mẫu 03 = các mã nợ phải trả, tổng mẫu 05 = các mã phải thu trên B01, cả đầu kỳ và cuối kỳ.
  const OTH = ['136', '336', '138', '141', '244', '338', '344'];
  const AP_SEC = [['I', 'Phải trả người bán (C33111, C33121 theo đối tượng; TK 331 khác số dư ròng)', [['33111', -1, 'side'], ['33121', -1, 'side'], [['331'], -1, 'acctp']]],
    ['II', 'Người mua trả tiền trước (C13111, C138812 theo đối tượng; TK 131 khác số dư ròng)', [['13111', -1, 'side'], [['131'], -1, 'acctp'], ['138812', -1, 'side']]],
    ['III', 'Phải trả khác (136, 336, 138, 141, 244, 338, 344 – TK dư Có ròng)', [[OTH, -1, 'acctp']]],
    ['IV', 'Quỹ khen thưởng, phúc lợi (353)', [[['353'], -1, 'acctp']]]];
  const AR_SEC = [['I', 'Phải thu khách hàng (N13111 theo đối tượng; TK 131 khác số dư ròng)', [['13111', 1, 'side'], [['131'], 1, 'acctp']]],
    ['II', 'Trả trước cho người bán (N33111, N33121 theo đối tượng; TK 331 khác số dư ròng)', [['33111', 1, 'side'], ['33121', 1, 'side'], [['331'], 1, 'acctp']]],
    ['III', 'Phải thu khác (N138812 theo đối tượng; 136, 336, 138, 141, 244, 338 – TK dư Nợ ròng; 14121 ở Mẫu 04)', [['138812', 1, 'side'], [OTH.filter(x => x !== '344'), 1, 'acctp']]]];
  const INV_ADV = ['14121'], skipAcc = a => DUAL.some(d => String(a).startsWith(d)) || INV_ADV.some(d => String(a).startsWith(d));
  // Số dư theo TK chi tiết × đối tượng (bỏ TK lưỡng tính, 14121; bỏ bút toán cùng TK cùng đối tượng)
  function accPartnerBal(pres, d0, d1) {
    const m = new Map();
    for (const pre of pres) for (const [side, bp, sg] of [['debit', 'partner_debit', 1], ['credit', 'partner_credit', -1]]) {
      for (const r of all(`SELECT e.acc_${side} a, e.${bp} bp, e.account_date d, ifnull(e.due_date, '') due, sum(e.amount) v FROM entries e
          WHERE e.account_date<=? AND ${rng('e.acc_' + side, pre)} AND NOT (e.acc_debit=e.acc_credit AND ifnull(e.partner_debit,'')=ifnull(e.partner_credit,'')) GROUP BY 1,2,3,4`, d1)) {
        if (skipAcc(r.a)) continue; const k = r.a + '|' + (r.bp || ''); let o = m.get(k);
        if (!o) m.set(k, o = { acc: r.a, bp: r.bp || '(không có đối tượng)', ob: 0, dr: 0, cr: 0, mv: [] });
        if (r.d < d0) o.ob += sg * r.v; else if (sg > 0) o.dr += r.v; else o.cr += r.v;
        o.mv.push({ d: r.d, due: r.due, v: sg * r.v });
      }
    }
    return [...m.values()];
  }
  const tbOf = (pres, to) => pres.reduce((x, pre) => x + all(`SELECT acc, sum(dr) - sum(cr) v FROM fin_mv WHERE ym<=? AND acc>=? AND acc<? GROUP BY acc`, to, pre, pre.slice(0, -1) + String.fromCharCode(pre.charCodeAt(pre.length - 1) + 1)).filter(r => !skipAcc(r.acc)).reduce((y, r) => y + r.v, 0), 0);
  function debts(secs, from, to, term, ageFn) {
    const d0 = from + '-01', d1 = lastDay(to), d00 = new Date(new Date(d0).getTime() - DAY).toISOString().slice(0, 10), out = [];
    for (const [no, title, defs] of secs) {
      const rows = [], tb = [];
      for (const [pre, nat, mode] of defs) {
        if (mode === 'acctp') {
          const PB = accPartnerBal(pre, d0, d1), acc = new Map();
          for (const o of PB) { const a = acc.get(o.acc) || acc.set(o.acc, { ob: 0, cb: 0 }).get(o.acc); a.ob += nat * o.ob; a.cb += nat * (o.ob + o.dr - o.cr); }
          let net = 0, pos = 0, neg = 0; for (const a of acc.values()) { net += a.cb; if (a.cb > 0) pos += a.cb; else neg += a.cb; }
          const tbv = nat * tbOf(pre, to); tb.push({ acc: pre.join(', ') + (pre.length > 1 ? '' : ' (ròng)'), mode: 'side', tb: tbv, net, pos, neg, rep: pos, diff: net - tbv, n: acc.size });
          for (const o of PB) {
            const A = acc.get(o.acc), okOb = A.ob > 0.005, okCb = A.cb > 0.005; if (!okOb && !okCb) continue;
            const ob = okOb ? nat * o.ob : 0, cb = okCb ? nat * (o.ob + o.dr - o.cr) : 0; if (Math.abs(ob) <= 0.005 && Math.abs(cb) <= 0.005) continue;
            const inc = nat > 0 ? o.dr : o.cr, dec = nat > 0 ? o.cr : o.dr, r = { acc: o.acc, accs: o.acc, bp: o.bp, ob, inc, dec, cb };
            r.adj = cb - (ob + inc - dec); // TK đổi chiều trong kỳ → phần chuyển sang mẫu kia
            Object.assign(r, ageFn(fifo(o.mv, nat, d1, term).parts, fifo(o.mv, nat, d00, term).parts)); rows.push(r);
          }
          continue;
        }
        const PB = partnerBal(pre, d0, d1);
        const tbv = nat * tbOf([pre], to);
        let net = 0, pos = 0, neg = 0; for (const o of PB.values()) { const c = nat * (o.ob + o.dr - o.cr); net += c; if (c > 0) pos += c; else neg += c; }
        tb.push({ acc: pre, mode, tb: tbv, net, pos, neg, rep: pos, diff: net - tbv, n: PB.size });
        for (const o of PB.values()) {
          const ob = nat * o.ob, cb = nat * (o.ob + o.dr - o.cr); if (cb <= 0.005 && ob <= 0.005) continue;
          const inc = nat > 0 ? o.dr : o.cr, dec = nat > 0 ? o.cr : o.dr;
          const r = { acc: pre, accs: [...o.accs].sort().join(', '), bp: o.bp, ob: Math.max(0, ob), inc, dec, cb: Math.max(0, cb) };
          r.adj = r.cb - (r.ob + inc - dec); // đối tượng đổi chiều: đầu kỳ / cuối kỳ phía ngược chiều = 0 ở mẫu này
          Object.assign(r, ageFn(fifo(o.mv, nat, d1, term).parts, fifo(o.mv, nat, d00, term).parts)); rows.push(r);
        }
      }
      rows.sort((a, b) => b.cb - a.cb || a.bp.localeCompare(b.bp));
      out.push({ no, title, rows, tb });
    }
    // TK công nợ còn số dư nhưng không thuộc mẫu nào (hiện chỉ còn 14121 – hàng tồn kho)
    const GRP = ['131', '136', '138', '141', '244', '331', '336', '338', '344', '353'];
    const rest = all(`SELECT acc, max(name) name, sum(dr) - sum(cr) v FROM fin_mv WHERE ym<=? AND substr(acc,1,3) IN (${GRP.map(() => '?').join(',')}) GROUP BY acc`, to, ...GRP)
      .filter(r => Math.abs(r.v) > 0.005 && INV_ADV.some(c => String(r.acc).startsWith(c)))
      .map(r => ({ acc: r.acc, name: String(r.name || '').replace(/^[^_]*_/, ''), v: r.v, note: 'Tạm ứng vật tư – trình bày ở Mẫu 04 (hàng tồn kho)' }));
    return { from, to, d0, d1, secs: out, rest };
  }
  // Đối chiếu B01 cả đầu kỳ và cuối kỳ: [tên, lọc dòng, mã B01]
  function checkB01(r, from, to, items) {
    const bs = FIN.balanceSheet(from, to), L = new Map(bs.lines.map(l => [l.code, l]));
    return items.map(([n, rows, codes]) => { const v = rows.reduce((a, x) => a + x.cb, 0), vOb = rows.reduce((a, x) => a + x.ob, 0);
      const fs = codes.reduce((a, c) => a + (L.get(c)?.cb || 0), 0), fsOb = codes.reduce((a, c) => a + (L.get(c)?.ob || 0), 0);
      return { n, v, fs, diff: v - fs, vOb, fsOb, diffOb: vOb - fsOb }; });
  }
  // Mẫu 03 – quá hạn tính từ 6 tháng (TT48/2019): 6 tháng–1 năm · 1–2 năm · 2–3 năm · ≥ 3 năm
  const apAge = (p, p0) => { const b = bk(p, [180, 365, 730, 1095]), b0 = bk(p0, [180, 365, 730, 1095]); return { odOb: b0[2] + b0[3] + b0[4] + b0[5], od: [b[2], b[3], b[4], b[5]], odCb: b[2] + b[3] + b[4] + b[5], odLt6: b[1] }; };
  function m03(from, to, term = 30) {
    const r = debts(AP_SEC, from, to, term, apAge), S = r.secs;
    r.check = checkB01(r, from, to, [['Phải trả người bán – B01 mã 311', S[0].rows, ['311']], ['Người mua trả tiền trước (TK 131) – B01 mã 312', S[1].rows.filter(x => x.acc.startsWith('131')), ['312']],
      ['138812 dư Có + phải trả khác – B01 mã 316 + 319', S[1].rows.filter(x => x.acc.startsWith('138812')).concat(S[2].rows), ['316', '319']],
      ['Tổng nợ phải trả công nợ (I–III) – B01 mã 311 + 312 + 316 + 319', S[0].rows.concat(S[1].rows, S[2].rows), ['311', '312', '316', '319']]]);
    return r;
  }
  // Mẫu 05 – phải thu khách hàng: trong hạn · < 3 tháng · 3–6 · 6–9 · 9–12 tháng · 1–2 · 2–3 · ≥ 3 năm; phải thu khác: trong hạn · < 6 tháng · 6 tháng–1 năm · 1–2 · 2–3 · ≥ 3 năm
  const arAge = p => { const t = bk(p, [90, 180, 270, 365, 730, 1095]), o = bk(p, [180, 365, 730, 1095]); return { trade: t, oth: o, bad: o[2] + o[3] + o[4] + o[5] }; };
  function m05(from, to, term = 30) {
    const r = debts(AR_SEC, from, to, term, arAge), S = r.secs;
    r.check = checkB01(r, from, to, [['Phải thu khách hàng – B01 mã 131', S[0].rows, ['131']], ['Trả trước cho người bán – B01 mã 132', S[1].rows, ['132']],
      ['Phải thu khác – B01 mã 133 + 136', S[2].rows, ['133b', '136']], ['Tổng phải thu ngắn hạn (trừ dự phòng) – B01 mã 131 + 132 + 133 + 136', S[0].rows.concat(S[1].rows, S[2].rows), ['131', '132', '133b', '136']]]);
    return r;
  }

  /* ---------- Mẫu 04: hàng tồn kho theo TK × kho × mặt hàng ---------- */
  const INV_SEC = [['1', 'Nguyên, nhiên, vật liệu (152)', '152'], ['2', 'Công cụ, dụng cụ (153)', '153'], ['4', 'Hàng hóa (156)', '156'], ['7', 'Hàng mua đang đi đường (151)', '151'], ['8', 'Tạm ứng vật tư (1412)', '1412']];
  function m04(from, to, keepM = 12) {
    const d0 = from + '-01', d1 = lastDay(to), at = new Date(d1).getTime(), out = [];
    for (const [no, title, pre] of INV_SEC) {
      const objD = 'e.partner_debit', objC = 'e.partner_credit'; // theo đối tượng (mã đối tượng phía Nợ / Có của TK kho)
      const self = `NOT (${rng('e.acc_debit', pre)} AND ${rng('e.acc_credit', pre)} AND e.acc_debit=e.acc_credit AND ifnull(${objD},'')=ifnull(${objC},''))`, m = new Map();
      for (const [side, obj, sg] of [['debit', objD, 1], ['credit', objC, -1]]) {
        for (const r of all(`SELECT e.acc_${side} acc, ${obj} loc, e.product prod, max(e.uom) uom, e.account_date d, sum(e.amount) v, sum(abs(ifnull(e.quantity,0))) q FROM entries e
            WHERE e.account_date<=? AND ${rng('e.acc_' + side, pre)} AND ${self} GROUP BY 1,2,3,5`, d1)) {
          const k = r.acc + '|' + (r.loc || '') + '|' + (r.prod || ''); let o = m.get(k);
          if (!o) { const p = String(r.prod || ''), i = p.indexOf('_'); m.set(k, o = { acc: r.acc, loc: r.loc || '', code: i > 0 ? p.slice(0, i) : p, name: i > 0 ? p.slice(i + 1) : '', uom: r.uom || '', obQ: 0, obV: 0, inQ: 0, inV: 0, outQ: 0, outV: 0, inc: [] }); }
          if (r.d < d0) { o.obQ += sg * r.q; o.obV += sg * r.v; } else if (sg > 0) { o.inQ += r.q; o.inV += r.v; } else { o.outQ += r.q; o.outV += r.v; }
          if (sg > 0 && r.v > 0) o.inc.push({ t: new Date(r.d).getTime(), v: r.v });
        }
      }
      const rows = [];
      for (const o of m.values()) {
        const cbQ = o.obQ + o.inQ - o.outQ, cbV = o.obV + o.inV - o.outV;
        if (Math.abs(cbV) <= 0.005 && Math.abs(o.obV) <= 0.005 && Math.abs(o.inV) <= 0.005 && Math.abs(o.outV) <= 0.005 && Math.abs(cbQ) < 1e-6) continue;
        // Thời gian lưu kho FIFO: phần trong hạn ≤ keepM tháng; quá hạn < 6 tháng · 6 tháng–1 năm · 1–2 · 2–3 · ≥ 3 năm (tính từ khi hết hạn lưu kho)
        const b = Array(6).fill(0); let rem = cbV; o.inc.sort((x, y) => y.t - x.t);
        if (rem > 0) { for (const it of o.inc) { if (rem <= 0) break; const take = Math.min(rem, it.v); rem -= take; const od = Math.floor((at - it.t) / DAY) - Math.round(keepM * 30.44);
          b[od <= 0 ? 0 : od < 183 ? 1 : od < 365 ? 2 : od < 730 ? 3 : od < 1095 ? 4 : 5] += take; } if (rem > 0) b[5] += rem; }
        const { inc, ...x } = o; void inc;
        rows.push({ ...x, cbQ, cbV, ok: b[0], od: b.slice(1) });
      }
      rows.sort((a, b) => a.acc.localeCompare(b.acc) || a.loc.localeCompare(b.loc) || a.code.localeCompare(b.code));
      const led = get(`SELECT (SELECT ifnull(sum(amount),0) FROM entries e WHERE e.account_date<=? AND ${rng('e.acc_debit', pre)}) - (SELECT ifnull(sum(amount),0) FROM entries e WHERE e.account_date<=? AND ${rng('e.acc_credit', pre)}) v`, d1, d1).v;
      out.push({ no, title, pre, rows, ledger: led });
    }
    return { from, to, d0, d1, keepM, secs: out };
  }

  /* ---------- Mẫu 06: danh sách quy trình, quy chế ---------- */
  const procList = () => getS('oinv_proc') || [];
  function procSave(rows) { setS('oinv_proc', (rows || []).map(r => ({ type: r.type || '', scope: r.scope || '', code: r.code || '', name: r.name || '', issuer: r.issuer || '', issued: r.issued || '', eff: r.eff || '', exp: r.exp || '', reissue: r.reissue || '', note: r.note || '', expired: !!r.expired }))); return procList(); }

  function compute(o = {}) {
    const { from, to } = o, term = +o.term || 30, keepM = +o.keepM || 12;
    const a = m03(from, to, term), od = { cb: a.secs.reduce((s, x) => s + x.rows.reduce((t, r) => t + r.odCb, 0), 0), ob: a.secs.reduce((s, x) => s + x.rows.reduce((t, r) => t + r.odOb, 0), 0) };
    return { from, to, term, keepM, m01: m01(from, to), m02: m02(from, to, od), m03: a, m04: m04(from, to, keepM), m05: m05(from, to, term), m06: procList() };
  }
  return { compute, setM01, procList, procSave };
}
module.exports = { make };
