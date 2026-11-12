'use strict';
// Báo cáo dòng tiền thanh toán: mọi dòng ghi Có tiền (111 / 112 / 113), Nợ không phải tiền (bỏ chuyển tiền nội bộ giữa quỹ / ngân hàng).
// Phân nhóm theo TK Nợ + nhóm đối tượng Nợ (Danh mục đối tượng – partners_cat.kind):
//  1. Thanh toán quốc tế  – đối tượng BN_QT (đối tác quốc tế), ROAMING
//  2. Thanh toán nội bộ   – NB (tập đoàn: VTG, TFU…), TT (trung tâm / chi nhánh nội bộ)
//  3. Thanh toán nội địa  – nhà trạm (đối tượng có Nợ 24211 / Có 331), đối tác Timor & hợp đồng khác
//  4. Chi tạm ứng nhân viên – Nợ 141x
//  5. Khác – thuế (333), lương (334), gửi có kỳ hạn (128), đối tượng chưa phân loại
const G = [
  { k: 'intl', vi: '1. Thanh toán quốc tế', en: '1. International payments' },
  { k: 'int', vi: '2. Thanh toán nội bộ (tập đoàn, chi nhánh)', en: '2. Intra-group payments' },
  { k: 'dom', vi: '3. Thanh toán đối tác nội địa', en: '3. Domestic partner payments' },
  { k: 'adv', vi: '4. Chi tạm ứng nhân viên', en: '4. Staff advances' },
  { k: 'oth', vi: '5. Chi khác', en: '5. Other payments' },
];
const SUB = { BN_QT: ['Đối tác quốc tế', 'International partners'], ROAMING: ['Đối tác roaming', 'Roaming partners'], NB: ['Tập đoàn / công ty trong tập đoàn', 'Group companies'], TT: ['Trung tâm / chi nhánh nội bộ', 'Internal centres / branches'],
  LL: ['Chủ nhà trạm (thuê trạm)', 'Site landlords'], DOM: ['Đối tác Timor / hợp đồng khác', 'Timor partners / other contracts'], ADV: ['Tạm ứng nhân viên (141)', 'Staff advances (141)'],
  TAX: ['Thuế, phí nộp NSNN (333)', 'Taxes (333)'], SAL: ['Lương, thưởng nhân viên (334)', 'Salaries (334)'], DEP: ['Gửi tiền có kỳ hạn (128)', 'Term deposits (128)'], NV: ['Chi khác cho nhân viên', 'Other staff payments'], NH: ['Ngân hàng / quỹ', 'Banks / funds'], UNK: ['Đối tượng chưa phân loại', 'Unclassified partners'], NONE: ['Không có đối tượng', 'No partner'] };
const GOF = { BN_QT: 'intl', ROAMING: 'intl', NB: 'int', TT: 'int', LL: 'dom', DOM: 'dom', ADV: 'adv', TAX: 'oth', SAL: 'oth', DEP: 'oth', NV: 'oth', NH: 'oth', UNK: 'oth', NONE: 'oth' };
function make(db, all) {
  const s = v => String(v ?? '').trim(), day = d => s(d).slice(0, 10);
  const pkey = (d, per) => per === 'y' ? d.slice(0, 4) : per === 'q' ? d.slice(0, 4) + '-Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) : d.slice(0, 7);
  function lines(o) {
    const from = day(o.from) || '0000-00-00', to = day(o.to) || '9999-12-31';
    return all(`SELECT id, account_date d, document_no doc, acc_debit dr, acc_credit cr, partner_debit bp, amount a, description ds, contract, created_by u FROM entries
      WHERE (acc_credit LIKE '111%' OR acc_credit LIKE '112%' OR acc_credit LIKE '113%') AND NOT (acc_debit LIKE '111%' OR acc_debit LIKE '112%' OR acc_debit LIKE '113%')
      AND account_date>=? AND account_date<=?`, from, to);
  }
  function classifier() {
    // khớp danh mục như Danh mục đối tượng: đúng mã_tên, hoặc theo mã (phần trước dấu _ cuối dần)
    const cat = all(`SELECT code_name, code, kind FROM partners_cat`), exact = new Map(cat.map(r => [r.code_name, r.kind])), byCode = new Map(cat.filter(r => r.code).map(r => [r.code, r.kind])), memo = new Map();
    const kind = { get: p => { if (memo.has(p)) return memo.get(p); let k = exact.get(p); if (!k && p) { const seg = p.split('_'); for (let i = seg.length - 1; i >= 1 && !k; i--) k = byCode.get(seg.slice(0, i).join('_')); } memo.set(p, k); return k; } };
    const ll = new Set(all(`SELECT DISTINCT partner_credit p FROM entries WHERE acc_debit LIKE '24211%' AND acc_credit LIKE '331%' AND ifnull(partner_credit,'')<>''`).map(r => r.p));
    return x => { const dr = s(x.dr), bp = s(x.bp), k = kind.get(bp);
      if (dr.startsWith('141')) return 'ADV'; if (dr.startsWith('128')) return 'DEP'; if (dr.startsWith('333')) return 'TAX'; if (dr.startsWith('334')) return 'SAL';
      if (k === 'BN_QT' || k === 'ROAMING' || k === 'NB' || k === 'TT') return k; if (ll.has(bp)) return 'LL';
      if (k === 'BN_TM' || k === 'NO') return 'DOM'; if (k === 'NV') return 'NV'; if (k === 'NH') return 'NH'; return bp ? 'UNK' : 'NONE'; };
  }
  function report(o = {}) {
    const per = ['m', 'q', 'y'].includes(o.per) ? o.per : 'm', cls = classifier(), L = lines(o), P = new Set(), S = new Map(), BP = new Map();
    for (const x of L) { const sub = cls(x), p = pkey(x.d, per); P.add(p);
      const q = S.get(sub) || S.set(sub, { sub, g: GOF[sub], by: {}, a: 0, n: 0 }).get(sub); q.by[p] = (q.by[p] || 0) + x.a; q.a += x.a; q.n++;
      const kb = sub + '|' + s(x.bp), b = BP.get(kb) || BP.set(kb, { sub, bp: s(x.bp) || '(không có đối tượng)', by: {}, a: 0, n: 0 }).get(kb); b.by[p] = (b.by[p] || 0) + x.a; b.a += x.a; b.n++; }
    const periods = [...P].sort(), en = o.lang === 'en';
    const groups = G.map(g => { const subs = [...S.values()].filter(q => q.g === g.k).sort((a, b) => b.a - a.a).map(q => ({ ...q, name: SUB[q.sub][en ? 1 : 0],
        partners: [...BP.values()].filter(b => b.sub === q.sub).sort((a, b) => b.a - a.a).slice(0, 300) }));
      const by = {}; for (const q of subs) for (const p in q.by) by[p] = (by[p] || 0) + q.by[p];
      return { k: g.k, name: en ? g.en : g.vi, subs, by, a: subs.reduce((t, q) => t + q.a, 0), n: subs.reduce((t, q) => t + q.n, 0) }; });
    const by = {}; for (const g of groups) for (const p in g.by) by[p] = (by[p] || 0) + g.by[p];
    return { from: day(o.from), to: day(o.to), per, periods, groups, tot: { by, a: groups.reduce((t, g) => t + g.a, 0), n: L.length } };
  }
  // chứng từ chi tiết của một nhóm con (và một đối tượng / một kỳ nếu có)
  function detail(o = {}) { const per = o.per || 'm', cls = classifier();
    return lines(o).filter(x => cls(x) === o.sub && (o.bp == null || (s(x.bp) || '(không có đối tượng)') === o.bp) && (!o.p || pkey(x.d, per) === o.p)).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5000); }
  return { report, detail };
}
module.exports = { make };
