'use strict';
// Phiếu trích / huỷ trích chi phí → file nhập bút toán ERP (GL Journal, 121 cột).
// Cột A–J: phần chung của phiếu (chỉ ghi ở dòng đầu); cột K…: từng dòng chi tiết.
// Lưu: jv(id, kind 'acc' trích | 'rev' huỷ trích, hdr JSON {tên cột: giá trị}, lines JSON [{tên cột: giá trị}], src id phiếu gốc).
const COLS = ["GL_Journal_ID", "C_Department_ID[Name]", "C_DocType_ID[Name]", "DocumentNo", "DocRecord_ID[DocRecord]", "DateAcct", "C_Period_ID[Name]", "Description", "ApprovedStatus[Name]", "CheckStatus[Name]", "GL_JournalLine>GL_JournalLine_ID", "GL_JournalLine>GL_Journal_ID[GL_Journal_ID]", "GL_JournalLine>DueDate", "GL_JournalLine>Description", "GL_JournalLine>AmtDueDebt", "GL_JournalLine>ProvisionRate", "GL_JournalLine>C_Currency_ID[ISO_Code]", "GL_JournalLine>CurrencyRate", "GL_JournalLine>Account_ID[Value||'-'||Name]", "GL_JournalLine>AmtSource", "GL_JournalLine>Account_Cr_ID[Value||'-'||Name]", "GL_JournalLine>AmountConvert", "GL_JournalLine>C_BPartner_ID[Value||'-'||Name]", "GL_JournalLine>C_Bpartner_Cr_ID[Value||'-'||Name]", "GL_JournalLine>User4_ID[Value||'-'||Name]", "GL_JournalLine>C_DepartmentSub_ID[Name]", "GL_JournalLine>User2_ID[Value||'-'||Name]", "GL_JournalLine>User6_ID[Value||'-'||Name]", "GL_JournalLine>User3_ID[Value||'-'||Name]", "GL_JournalLine>User1_ID[Value||'-'||Name]", "GL_JournalLine>UserElement6_ID[Value||'-'||Name]", "GL_JournalLine>M_Product_ID[Value||'-'||Name]", "GL_JournalLine>UserElement5_ID[InvoiceNo]", "GL_JournalLine>UserElement2_ID[Value]", "GL_JournalLine>UserElement7_ID[Value]", "GL_JournalLine>User5_ID[Value||'-'||Name]", "GL_JournalLine>UserElement10_ID[Value]", "GL_JournalLine>UserElement8_ID[Value||'-'||Name]", "GL_JournalLine>A_Asset_ID[Name]", "GL_JournalLine>UserElement9_Cr_ID[Value||'-'||Name]", "GL_JournalLine>UserElement1_ID", "GL_JournalLine>UserElement13_ID[Name]", "GL_JournalLine>UserElement9_ID[Value||'-'||Name]", "GL_JournalLine>UserElement13_Cr_ID[Name]", "GL_JournalLine>C_Project_ID[Value||'-'||Name]", "GL_JournalLine>C_BP_Center_ID[Value||'-'||Name]", "GL_JournalLine>Qty", "GL_JournalLine>PriceActual", "GL_JournalLine>M_Locator_ID[Value]", "GL_JournalLine>M_Locator_Cr_ID[Value]", "GL_JournalLine>UserElement4_ID[DocumentNo]", "GL_JournalLine>IsDistribution", "GL_JournalLine>C_DistributionAccount_ID[Value||'-'||Name]", "GL_JournalLine>FromDate", "GL_JournalLine>ToDate", "C_TOC_Value>C_TOC_Value_ID", "C_TOC_Value>TOC_PriceMonth", "C_TOC_Value>TOC_Set", "C_TOC_Value>TOC_AmountHaveTax", "C_TOC_Value>TOC_RevenueHaveFee", "C_TOC_Value>TOC_Services_ID[Value||'-'||Name]", "C_TOC_Value>TOC_Rate", "C_TOC_Value>TOC_ShareRatio", "C_TOC_Value>TOC_LicensePlate", "C_TOC_Value>TOC_QuantityKm", "C_TOC_Value>TOC_QuantityTRX", "C_TOC_Value>TOC_ShareForPartner", "C_TOC_Value>TOC_QuantityOil", "C_TOC_Value>TOC_ShareRevenue", "C_TOC_Value>TOC_PeriodExpense", "C_TOC_Value>TOC_QuantitySRCTV", "C_TOC_Value>TOC_QuantityPeople", "C_TOC_Value>TOC_ShiftQuantity", "C_TOC_Value>TOC_QuantitySIM", "C_TOC_Value>TOC_QuantityEmployee", "C_TOC_Value>TOC_QuantityMessage", "C_TOC_Value>TOC_QuantityMinutes", "C_TOC_Value>TOC_QuantityBanderol", "C_TOC_Value>TOC_QuantityM3", "C_TOC_Value>TOC_QuantityInk", "C_TOC_Value>TOC_QuantityMegabite", "C_TOC_Value>TOC_QuantityHour", "C_TOC_Value>TOC_PricePrint", "C_TOC_Value>TOC_PricePaper", "C_TOC_Value>TOC_PriceLiter", "C_TOC_Value>GL_JournalLine_ID[GL_JournalLine_ID]", "C_TOC_Value>C_Contract_Capex_ID[Value]", "C_TOC_Value>C_Contract_Sign_ID[Value]", "C_TOC_Value>C_Contract_Loan_ID[Value]", "C_TOC_Value>C_Contract_Transit_ID[Value]", "C_TOC_Value>C_CategoryShowroom_ID[Name]", "C_TOC_Value>C_InterType_ID[Value||'-'||Name]", "C_TOC_Value>TOC_Quantity", "C_TOC_Value>TOC_QtyKW_Diffrence", "C_TOC_Value>TOC_QuantityKw", "C_TOC_Value>TOC_QuantityMaxKw", "C_TOC_Value>TOC_QuantityMinKw", "C_TOC_Value>TOC_Quantity_Liter", "C_TOC_Value>User4_ID[Value||'-'||Name]", "C_TOC_Value>C_ObjectList_ID[Value||'-'||Name]", "C_TOC_Value>C_Vehicles_ID[Value||'-'||Name]", "C_TOC_Value>C_BusinessPrograme_ID[Value||'-'||Name]", "C_TOC_Value>C_TaxBase_ID[Value||'-'||Name]", "C_TOC_Value>TOC_LocationCode_ID[Value]", "C_TOC_Value>C_Outsource_ID[Value||'-'||Name]", "C_TOC_Value>C_Shipping_ID[Value||'-'||Name]", "C_TOC_Value>C_CallCenter_ID[Value||'-'||Name]", "C_TOC_Value>C_Collaborator_ID[Value||'-'||Name]", "C_TOC_Value>C_Vasservice_ID[Value||'-'||Name]", "C_TOC_Value>C_OperatingType_ID[Value||'-'||Name]", "C_TOC_Value>C_Commissions_ID[Value||'-'||Name]", "C_TOC_Value>C_InterService_ID[Value||'-'||Name]", "C_TOC_Value>C_Advertisement_ID[Value||'-'||Name]", "C_TOC_Value>C_Fees_ID[Value||'-'||Name]", "C_TOC_Value>C_RoamingService_ID[Value||'-'||Name]", "C_TOC_Value>C_EnergyType_ID[Value||'-'||Name]", "C_TOC_Value>C_CommissionsPolicy_ID[Value||'-'||Name]", "C_TOC_Value>TOC_BTS_ID[Value]", "C_TOC_Value>TOC_Qty1", "C_TOC_Value>C_UOM1_ID[Name]", "C_TOC_Value>TOC_Qty2"];
const NH = 10; // số cột phần chung (A–J)
const C = { dept: 'C_Department_ID[Name]', doctype: 'C_DocType_ID[Name]', docno: 'DocumentNo', date: 'DateAcct', period: 'C_Period_ID[Name]', desc: 'Description', check: 'CheckStatus[Name]',
  due: 'GL_JournalLine>DueDate', ldesc: 'GL_JournalLine>Description', debt: 'GL_JournalLine>AmtDueDebt', prov: 'GL_JournalLine>ProvisionRate', cur: 'GL_JournalLine>C_Currency_ID[ISO_Code]', rate: 'GL_JournalLine>CurrencyRate',
  dr: "GL_JournalLine>Account_ID[Value||'-'||Name]", amt: 'GL_JournalLine>AmtSource', cr: "GL_JournalLine>Account_Cr_ID[Value||'-'||Name]", conv: 'GL_JournalLine>AmountConvert',
  bpDr: "GL_JournalLine>C_BPartner_ID[Value||'-'||Name]", bpCr: "GL_JournalLine>C_Bpartner_Cr_ID[Value||'-'||Name]", tcost: "GL_JournalLine>User4_ID[Value||'-'||Name]", dsub: 'GL_JournalLine>C_DepartmentSub_ID[Name]',
  u6: "GL_JournalLine>User6_ID[Value||'-'||Name]", u1: "GL_JournalLine>User1_ID[Value||'-'||Name]", loc: 'GL_JournalLine>UserElement10_ID[Value]', qty: 'GL_JournalLine>Qty', price: 'GL_JournalLine>PriceActual', dist: 'GL_JournalLine>IsDistribution' };
const NUM = new Set([C.debt, C.prov, C.rate, C.amt, C.conv, C.qty, C.price]);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const dmy = d => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const parseDmy = s => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null; };
const eom = (y, m) => new Date(Date.UTC(y, m + 1, 0)); // m: 0–11
const periodOf = s => { const d = parseDmy(s); return d ? `${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}` : ''; };
const r2 = v => Math.round((+v || 0) * 100) / 100;
// Tổng tiền phiếu (theo nguyên tệ AmtSource)
const total = j => (j.lines || []).reduce((a, l) => a + (+l[C.amt] || 0), 0);
// Đổi tháng trong diễn giải: "October 2026" → "November 2026", "10/2026" → "11/2026", "2026_10" → "2026_11"
function shiftText(s, from, to) { let t = String(s || '');
  t = t.replace(new RegExp(`${MON[from.m]}(\\s+)${from.y}`, 'g'), `${MON[to.m]}$1${to.y}`);
  t = t.replace(new RegExp(`(^|[^\\d])${pad(from.m + 1)}/${from.y}`, 'g'), `$1${pad(to.m + 1)}/${to.y}`);
  t = t.replace(new RegExp(`${from.y}_${pad(from.m + 1)}`, 'g'), `${to.y}_${pad(to.m + 1)}`);
  return t; }
function make(db, all, get) {
  db.exec(`CREATE TABLE IF NOT EXISTS jv(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, hdr TEXT, lines TEXT, src INTEGER, created_at TEXT, updated_at TEXT)`);
  const row = r => r && { id: r.id, kind: r.kind, src: r.src, hdr: JSON.parse(r.hdr || '{}'), lines: JSON.parse(r.lines || '[]'), created_at: r.created_at, updated_at: r.updated_at };
  const list = () => all(`SELECT * FROM jv ORDER BY updated_at DESC, id DESC`).map(row).map(j => ({ id: j.id, kind: j.kind, src: j.src, docno: j.hdr[C.docno] || '', date: j.hdr[C.date] || '', period: j.hdr[C.period] || '', desc: j.hdr[C.desc] || '', n: j.lines.length, total: r2(total(j)), updated_at: j.updated_at }));
  const one = id => row(get(`SELECT * FROM jv WHERE id=?`, +id));
  function save(j) { const hdr = { ...(j.hdr || {}) }; if (hdr[C.date]) hdr[C.period] = periodOf(hdr[C.date]) || hdr[C.period] || '';
    const lines = (j.lines || []).map(l => { const o = { ...l }; for (const k of NUM) if (o[k] !== '' && o[k] != null) o[k] = +o[k] || 0; o[C.conv] = r2((+o[C.amt] || 0) * (+o[C.rate] || 1)); return o; });
    if (j.id) { db.prepare(`UPDATE jv SET kind=?, hdr=?, lines=?, updated_at=datetime('now','localtime') WHERE id=?`).run(j.kind || 'acc', JSON.stringify(hdr), JSON.stringify(lines), +j.id); return one(j.id); }
    const r = db.prepare(`INSERT INTO jv(kind, hdr, lines, src, created_at, updated_at) VALUES(?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))`).run(j.kind || 'acc', JSON.stringify(hdr), JSON.stringify(lines), j.src || null);
    return one(r.lastInsertRowid); }
  const remove = ids => { const st = db.prepare(`DELETE FROM jv WHERE id=?`); let n = 0; for (const i of [].concat(ids || [])) n += st.run(+i).changes; return { n }; };
  // Sao chép sang tháng sau (hoặc ngày hạch toán chọn): đổi ngày, kỳ, tháng trong diễn giải; bỏ số chứng từ (ERP cấp mới)
  function copyNext(id, o = {}) { const j = one(id); if (!j) throw new Error('Không tìm thấy phiếu');
    const d0 = parseDmy(j.hdr[C.date]) || new Date(), d1 = o.date ? parseDmy(o.date) : eom(d0.getUTCFullYear(), d0.getUTCMonth() + 1);
    if (!d1) throw new Error('Ngày hạch toán không hợp lệ (dd/mm/yyyy)');
    const f = { y: d0.getUTCFullYear(), m: d0.getUTCMonth() }, t = { y: d1.getUTCFullYear(), m: d1.getUTCMonth() }, sh = s => shiftText(s, f, t);
    const hdr = { ...j.hdr, [C.docno]: '', [C.date]: dmy(d1), [C.desc]: sh(j.hdr[C.desc]) };
    return save({ kind: j.kind, hdr, lines: j.lines.map(l => ({ ...l, [C.ldesc]: sh(l[C.ldesc]) })), src: j.id }); }
  // Phiếu huỷ trích từ phiếu trích (theo cách hạch toán của đơn vị): giữ nguyên TK Nợ / Có, đối tượng Nợ / Có, khoản mục…; số tiền ÂM; diễn giải thêm "Adjust" ở đầu
  function reverse(id, o = {}) { const j = one(id); if (!j) throw new Error('Không tìm thấy phiếu');
    const d0 = parseDmy(j.hdr[C.date]) || new Date(), d1 = o.date ? parseDmy(o.date) : eom(d0.getUTCFullYear(), d0.getUTCMonth() + 1);
    if (!d1) throw new Error('Ngày hạch toán không hợp lệ (dd/mm/yyyy)');
    const pre = o.prefix ?? 'VTL: Adjust ', px = s => s ? pre + String(s).replace(/^VTL[:_\s]*/i, '') : s;
    const hdr = { ...j.hdr, [C.docno]: '', [C.date]: dmy(d1), [C.desc]: px(j.hdr[C.desc]) };
    const lines = j.lines.map(l => ({ ...l, [C.amt]: -Math.abs(+l[C.amt] || 0), [C.ldesc]: px(l[C.ldesc]) }));
    return save({ kind: 'rev', hdr, lines, src: j.id }); }
  // Đọc file ERP (sheet đầu, dòng 1 = tiêu đề cột) → phiếu (chưa lưu) để người dùng xem lại rồi Lưu
  function fromAoa(aoa) { const H = (aoa[0] || []).map(x => String(x || '').trim()); if (!H.includes(C.docno) || !H.includes(C.amt)) throw new Error('File không đúng mẫu GL Journal (thiếu cột DocumentNo / GL_JournalLine>AmtSource)');
    const rows = aoa.slice(1).filter(r => r.some(v => v !== '' && v != null)), val = v => v instanceof Date ? dmy(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))) : v;
    const hdr = {}, lines = [];
    rows.forEach((r, i) => { H.forEach((h, c) => { if (!h) return; const v = val(r[c]); if (COLS.indexOf(h) > -1 && COLS.indexOf(h) < NH) { if (i === 0 && v !== '' && v != null) hdr[h] = v; } });
      const l = {}; H.forEach((h, c) => { const k = COLS.indexOf(h); if (k >= NH) { const v = val(r[c]); if (v !== '' && v != null) l[h] = v; } }); if (Object.keys(l).length) lines.push(l); });
    return { kind: /revers|huỷ|hủy/i.test(String(hdr[C.desc] || '')) ? 'rev' : 'acc', hdr, lines }; }
  // Bảng xuất: đúng 121 cột; phần chung chỉ ở dòng đầu
  function toAoa(j) { const out = [COLS.slice()], L = j.lines.length ? j.lines : [{}];
    L.forEach((l, i) => out.push(COLS.map((h, c) => { const v = c < NH ? (i === 0 ? j.hdr[h] : '') : l[h]; return v == null ? '' : v; })));
    return out; }
  // Gợi ý nhập liệu: giá trị đã dùng ở các phiếu trước (mỗi trường)
  function hints() { const S = {}; for (const j of all(`SELECT hdr, lines FROM jv ORDER BY id DESC LIMIT 200`).map(row)) { for (const [k, v] of Object.entries(j.hdr)) (S[k] = S[k] || new Set()).add(String(v));
      for (const l of j.lines) for (const [k, v] of Object.entries(l)) if (!NUM.has(k)) (S[k] = S[k] || new Set()).add(String(v)); }
    return Object.fromEntries(Object.entries(S).map(([k, s]) => [k, [...s].filter(Boolean).slice(0, 300)])); }
  return { list, one, save, remove, copyNext, reverse, fromAoa, toAoa, hints };
}
module.exports = { make, COLS, C, NH, periodOf, total };
