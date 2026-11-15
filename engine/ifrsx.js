'use strict';
// Xuất bộ báo cáo tài chính IFRS ra Excel theo bố cục file mẫu: mỗi báo cáo một sheet, tiêu đề công ty / tên báo cáo / năm, cột Note – năm nay – năm trước,
// số kiểu kế toán #,##0;(#,##0);"-", dòng tổng in đậm có gạch trên. SheetJS cộng đồng không ghi kiểu chữ ⇒ ghi xong chèn styles.xml + thuộc tính s.
const XLSX = require('../vendor/xlsx.full.min.js');

// sheets: [{name, rows: [[...]], bold: Set(index dòng), title: Set, head: Set, cols: [độ rộng], num: Set(cột số), pct: Set(cột %)}]
function build(sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) { const ws = XLSX.utils.aoa_to_sheet(s.rows); ws['!cols'] = (s.cols || []).map(w => ({ wch: w })); if (s.merges) ws['!merges'] = s.merges; XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); }
  const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const z = XLSX.CFB.read(buf, { type: 'buffer' }), get = p => { const f = XLSX.CFB.find(z, p); return f ? Buffer.from(f.content).toString('utf8') : null; };
  const put = (p, t) => { const f = XLSX.CFB.find(z, p); f.content = Buffer.from(t, 'utf8'); f.size = f.content.length; };
  let st = get('/xl/styles.xml'); const grab = t => { const m = st.match(new RegExp(`<${t} count="(\\d+)">([\\s\\S]*?)</${t}>`)); return { n: +m[1], body: m[2] }; };
  const fonts = grab('fonts'), borders = grab('borders'), xfs = grab('cellXfs'), F = fonts.n, B = borders.n;
  const nf = ['<font><sz val="11"/><name val="Times New Roman"/></font>', '<font><b/><sz val="11"/><name val="Times New Roman"/></font>', '<font><b/><sz val="13"/><name val="Times New Roman"/></font>', '<font><i/><sz val="10"/><color rgb="FF667085"/><name val="Times New Roman"/></font>'];
  const nb = ['<border><left/><right/><top style="thin"/><bottom/><diagonal/></border>', '<border><left/><right/><top/><bottom style="thin"/><diagonal/></border>'];
  const NUM = 191, PCT = 192, fmt = '<numFmt numFmtId="191" formatCode="#,##0;\\(#,##0\\);&quot;-&quot;"/><numFmt numFmtId="192" formatCode="0.0%"/>';
  if (/<numFmts count="(\d+)">/.test(st)) st = st.replace(/<numFmts count="(\d+)">/, (m, n) => `<numFmts count="${+n + 2}">${fmt}`); else st = st.replace('<fonts', `<numFmts count="2">${fmt}</numFmts><fonts`);
  st = st.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, `<fonts count="${F + nf.length}">${fonts.body}${nf.join('')}</fonts>`).replace(/<borders count="\d+">[\s\S]*?<\/borders>/, `<borders count="${B + nb.length}">${borders.body}${nb.join('')}</borders>`);
  const base = xfs.body.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [], add = [], cache = new Map();
  const xf = (num, font, border, align) => { const k = [num, font, border, align].join('|'); if (cache.has(k)) return cache.get(k);
    add.push(`<xf numFmtId="${num}" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"${align ? ` horizontal="${align}"` : ''}/></xf>`);
    const id = base.length + add.length - 1; cache.set(k, id); return id; };
  sheets.forEach((s, i) => { const p = `/xl/worksheets/sheet${i + 1}.xml`; let x = get(p); if (!x) return;
    x = x.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, (all, col, rs, at, sc) => { const r = +rs - 1, c = XLSX.utils.decode_col(col);
      const isNum = (s.num || new Set()).has(c), isPct = (s.pct || new Set()).has(c), bold = (s.bold || new Set()).has(r);
      let id; if ((s.title || new Set()).has(r)) id = xf(0, r === 1 ? F + 2 : F + 1, 0, c === 0 ? null : 'center');
      else if ((s.head || new Set()).has(r)) id = xf(0, F + 1, B + 1, c === 0 ? null : 'center');
      else if ((s.note || new Set()).has(r)) id = xf(0, F + 3, 0, null);
      else id = xf(isPct ? PCT : isNum ? NUM : 0, bold ? F + 1 : F, bold && (isNum || isPct) ? B : 0, null);
      return `<c r="${col}${rs}"${at.replace(/\ss="\d+"/, '')} s="${id}"${sc}>`; });
    x = x.replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0" showGridLines="0"/>'); put(p, x); });
  st = st.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${base.length + add.length}">${base.join('')}${add.join('')}</cellXfs>`); put('/xl/styles.xml', st);
  return Buffer.from(XLSX.CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
}

// Dựng các sheet từ kết quả IFR.build
function sheetsOf(r) {
  const y = r.year, p = y - 1, M = r.meta, R0 = x => Math.round(x || 0), out = [];
  const hdr = (title, cols) => [[M.company], [title], [`FOR THE YEAR ENDED 31 DECEMBER ${y}`], [], cols];
  const sign = [[], [`Prepared by${M.preparer ? ': ' + M.preparer : ''}`, '', `Chief Accountant${M.chief ? ': ' + M.chief : ''}`, '', `Director${M.director ? ': ' + M.director : ''}`]];
  // SOPL
  { const I = r.I, P = r.I0, rows = hdr('STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME', ['', 'Note', y, p]), bold = new Set();
    const L = [['Revenue', 'rev', 5], ['Cost of sales', 'cos'], ['Gross profit', 'gp', '', 1], [], ['Finance income', 'fini', 6], ['Other income', 'othi'], ['Selling and distribution expenses', 'sell'], ['Administrative expenses', 'adm'], ['Finance costs', 'finc', 7], ['Other expenses', 'othe'],
      ['Profit before tax', 'pbt', 8, 1], [], ['Income tax expense', 'tax', 9], ['Profit for the year from continuing operations', 'pat', '', 1], [], ['Other comprehensive income'], ['Other comprehensive income for the year', null], ['Total comprehensive income for the year', 'pat', '', 1]];
    for (const [n, k, note, b] of L) { if (b) bold.add(rows.length); rows.push(n == null ? [] : [n, note || '', k ? R0(I[k]) : (k === null ? 0 : ''), k ? R0(P[k]) : (k === null ? 0 : '')]); }
    rows.push(...sign); out.push({ name: 'SOPL', rows, bold, title: new Set([0, 1, 2]), head: new Set([4]), cols: [62, 8, 16, 16], num: new Set([2, 3]) }); }
  // SOFP
  { const rows = hdr('STATEMENT OF FINANCIAL POSITION', ['', 'Note', y, p]), bold = new Set(), note = { cash: 10, tdep: 11, recv: 12, inv: 13, oca: 14, ppe: 15, intg: 16, rou: 17, invsub: 18, pay: 19, tax: 20, leaseS: 21, div: 22, borS: 23, welf: 23, payL: 19, leaseL: 21, dtl: 24, cap: 25 };
    const grp = (g, n) => { bold.add(rows.length); rows.push([n]); let a = 0, b = 0; for (const [k, nm, gg] of r.lines) if (gg === g && (Math.abs(r.cur[k]) + Math.abs(r.prior[k]) > 0.5 || ['cash', 'recv', 'inv', 'ppe', 'pay', 'cap', 're'].includes(k))) { rows.push(['        ' + nm, note[k] || '', R0(r.cur[k]), R0(r.prior[k])]); a += r.cur[k]; b += r.prior[k]; }
      bold.add(rows.length); rows.push(['', '', R0(a), R0(b)]); return [a, b]; };
    bold.add(rows.length); rows.push(['ASSETS']); const a1 = grp('AC', 'Current assets'), a2 = grp('AN', 'Non-current assets'); bold.add(rows.length); rows.push(['Total assets', '', R0(a1[0] + a2[0]), R0(a1[1] + a2[1])]); rows.push([]);
    bold.add(rows.length); rows.push(['LIABILITIES AND EQUITY']); const l1 = grp('LC', 'Current liabilities'), l2 = grp('LN', 'Non-current liabilities'), e = grp('EQ', 'Equity');
    bold.add(rows.length); rows.push(['Total liabilities and equity', '', R0(l1[0] + l2[0] + e[0]), R0(l1[1] + l2[1] + e[1])]); rows.push(...sign);
    out.push({ name: 'SOFP', rows, bold, title: new Set([0, 1, 2]), head: new Set([4]), cols: [62, 8, 16, 16], num: new Set([2, 3]) }); }
  // SOCF
  { const c = r.cf, rows = hdr('STATEMENT OF CASH FLOWS', ['', 'Note', y]), bold = new Set(), add = (n, v, b) => { if (b) bold.add(rows.length); rows.push([n, '', v == null ? '' : R0(v)]); };
    add('Cash flows from operating activities', null, 1); for (const [n, v] of c.op) add(n, v); add('', c.opSub, 1); add('Changes in operating assets and liabilities', null, 1); for (const [n, v] of c.wc) add(n, v);
    if (Math.abs(c.other) > 0.5) add('Other operating movements (unclassified)', c.other); add('', c.wcSub + c.other, 1); for (const [n, v] of c.opTail) add(n, v); add('Net cash from operating activities', c.netOp, 1); rows.push([]);
    add('Cash flows from investing activities', null, 1); for (const [n, v] of c.inv) add(n, v); add('Net cash used in investing activities', c.netInv, 1); rows.push([]);
    add('Cash flows from financing activities', null, 1); for (const [n, v] of c.fin) add(n, v); add('Net cash used in financing activities', c.netFin, 1); rows.push([]);
    add('Net (decrease)/increase in cash and cash equivalents', c.net, 1); add('Cash and cash equivalents at beginning of year', c.open); add('Cash and cash equivalents at end of year', c.close, 1); rows.push(...sign);
    out.push({ name: 'SOCF', rows, bold, title: new Set([0, 1, 2]), head: new Set([4]), cols: [70, 8, 18], num: new Set([2]) }); }
  // SOCE
  { const E = r.socE, rows = hdr('STATEMENT OF CHANGES IN EQUITY', ['', 'Contributed capital', 'Legal reserves', 'Retained earnings', 'Total equity']), bold = new Set();
    const ln = (n, o, b) => { if (b) bold.add(rows.length); rows.push([n, R0(o.cap), R0(o.res), R0(o.re), R0(o.cap + o.res + o.re)]); };
    ln(`Balance at 1 January ${y}`, E.open, 1); ln('Profit after tax for the year', { cap: 0, res: 0, re: E.profit }); ln('Transfer to Reward and Welfare fund', { cap: 0, res: 0, re: E.welf }); ln('Dividends', { cap: 0, res: 0, re: E.div });
    if (Math.abs(E.other.cap) + Math.abs(E.other.res) + Math.abs(E.other.re) > 0.5) ln('Other movements', E.other); ln(`Balance at 31 December ${y}`, E.close, 1); rows.push(...sign);
    out.push({ name: 'SOCE', rows, bold, title: new Set([0, 1, 2]), head: new Set([4]), cols: [52, 18, 16, 18, 18], num: new Set([1, 2, 3, 4]) }); }
  // Notes
  { const N = r.notes, rows = [[M.company], ['NOTES TO THE FINANCIAL STATEMENTS'], [`FOR THE YEAR ENDED 31 DECEMBER ${y}`], [], ['', '', y, p]], bold = new Set();
    const sec = (no, t) => { rows.push([]); bold.add(rows.length); rows.push([`${no}. ${t}`]); };
    const tbl = (L) => { let a = 0, b = 0; for (const x of L) { rows.push([`   ${x.acc} ${x.n || ''}`, '', R0(x.y), R0(x.p)]); a += x.y; b += x.p; } bold.add(rows.length); rows.push(['   Total', '', R0(a), R0(b)]); };
    sec(5, 'Revenue'); { let a = 0; for (const x of N.rev) { rows.push([`   ${x.k}`, '', R0(x.v), '']); a += x.v; } bold.add(rows.length); rows.push(['   Total revenue', '', R0(a), R0(r.I0.rev)]); }
    sec(9, 'Income tax'); rows.push(['   Current income tax expense', '', R0(N.taxRec.cur), R0(-r.I0.ctax)], ['   Deferred income tax expense', '', R0(N.taxRec.def), R0(-r.I0.dtax)]); bold.add(rows.length); rows.push(['   Income tax expense', '', R0(N.taxRec.cur + N.taxRec.def), R0(-r.I0.tax)]);
    rows.push(['   Profit before tax', '', R0(N.taxRec.pbt), R0(r.I0.pbt)], [`   Tax at the statutory rate of ${(N.taxRec.rate * 100).toFixed(0)}%`, '', R0(N.taxRec.pbt * N.taxRec.rate), R0(r.I0.pbt * N.taxRec.rate)], ['   Effect of non-deductible items / timing', '', R0(N.taxRec.cur + N.taxRec.def - N.taxRec.pbt * N.taxRec.rate), '']);
    sec(10, 'Cash and cash equivalents'); tbl(N.cash); sec(11, 'Term deposits'); tbl(N.tdep); sec(12, 'Trade and other receivables'); tbl(N.recv); sec(13, 'Inventories'); tbl(N.inv); sec(14, 'Other assets'); tbl(N.oca);
    for (const [no, t, m] of [[15, 'Property, plant and equipment', N.ppe], [16, 'Intangible assets', N.intg]]) { sec(no, t);
      rows.push(['   Cost at 1 January', '', R0(m.op)], ['   Additions', '', R0(m.add)], ['   Disposals / transfers', '', R0(-m.dis)]); bold.add(rows.length); rows.push(['   Cost at 31 December', '', R0(m.cl)]);
      rows.push(['   Accumulated depreciation at 1 January', '', R0(m.dop)], ['   Charge for the year', '', R0(m.chg)], ['   Disposals', '', R0(-m.ddis)]); bold.add(rows.length); rows.push(['   Accumulated depreciation at 31 December', '', R0(m.dcl)]);
      bold.add(rows.length); rows.push(['   Net book value at 31 December', '', R0(m.nbvC), R0(m.nbvO)]); }
    sec(19, 'Trade and other payables'); tbl(N.pay); sec(20, 'Taxes payables'); tbl(N.tax);
    if (N.dt) { sec(24, 'Deferred tax'); rows.push(['   Item', 'Carrying amount', 'Tax base', 'Temporary difference', `DTA/(DTL) ${y}`, `DTA/(DTL) ${p}`]); for (const x of N.dt.rows) rows.push(['   ' + x.n, R0(x.carry), R0(x.base), R0(x.td), R0(x.dt), R0(x.p)]);
      bold.add(rows.length); rows.push(['   Net deferred tax', '', '', '', R0(N.dt.net), R0(N.dt.prior)]); }
    out.push({ name: 'Notes', rows, bold, title: new Set([0, 1, 2]), head: new Set([4]), cols: [60, 16, 16, 16, 16, 16], num: new Set([1, 2, 3, 4, 5]) }); }
  // TB – phân loại tài khoản
  // TB: như sheet TB của file mẫu – TK / đối tượng, đầu kỳ, phát sinh, cuối kỳ (Nợ / Có), điều chỉnh IFRS, sau điều chỉnh, rồi mỗi chỉ tiêu IFRS một cột (số đặt vào đúng cột chỉ tiêu)
  { const LN = r.lines, G = { AC: 'Current', AN: 'Non-current', LC: 'Current', LN: 'Non-current', EQ: 'Equity' };
    const rows = [[M.company], [`TRIAL BALANCE ${y} – IFRS MAPPING`], [], ['', '', '', 'Opening balance', '', 'Arising', '', 'Closing balance', '', 'IFRS adjustments', '', 'Adjusted closing', '', ...LN.map(x => G[x[2]])],
      ['Account / Partner', 'Account', 'Account name', 'Debit', 'Credit', 'Debit', 'Credit', 'Debit', 'Credit', 'Debit', 'Credit', 'Debit', 'Credit', ...LN.map(x => x[1])]], bold = new Set();
    const dc = v => v > 0.004 ? [R2(v), ''] : v < -0.004 ? ['', R2(-v)] : ['', ''], R2 = v => Math.round(v * 100) / 100;
    const T = r.tb, tot = Array(13 + LN.length).fill(0);
    bold.add(rows.length); const totRow = rows.length; rows.push([]);
    for (const t of T.rows) { const o = dc(t.ob), c = dc(t.cb), a = dc(t.adj), line = LN.map(x => { if (!t.lv) return ''; const v = (t.parts || (t.line ? [{ line: t.line, v: t.adj }] : [])).filter(p => p.line === x[0]).reduce((s, p) => s + p.v, 0); return Math.abs(v) > 0.004 ? R2(x[3] * v) : ''; });
      const row = [t.lv === 2 ? '    ' + t.acc : t.acc, t.par || t.acc, t.lv === 2 ? '' : t.n, ...o, R2(t.dr) || '', R2(t.cr) || '', ...c, R2(t.jd) || '', R2(t.jc) || '', ...a, ...line];
      if (t.lv === 0) bold.add(rows.length); rows.push(row);
      if (t.lv) for (let i = 3; i < row.length; i++) if (typeof row[i] === 'number') tot[i] += row[i]; }
    rows[totRow] = ['TOTAL', '', '', ...tot.slice(3).map(R2)];
    const cols = [30, 10, 44, ...Array(10).fill(15), ...LN.map(() => 16)], num = new Set([...Array(10 + LN.length)].map((_, i) => i + 3));
    out.push({ name: 'TB', rows, bold, title: new Set([0, 1]), head: new Set([3, 4]), cols, num }); }
  // JE
  { const rows = [[M.company], [`IFRS ADJUSTING JOURNAL ENTRIES ${y}`], [], [], ['Debit', 'Credit', 'Amount', 'Description']]; for (const j of r.je) rows.push([j.dr, j.cr, j.a, j.n]);
    out.push({ name: 'JE ' + y, rows, title: new Set([0, 1]), head: new Set([4]), cols: [16, 16, 18, 70], num: new Set([2]) }); }
  return out;
}
module.exports = { build, sheetsOf };
