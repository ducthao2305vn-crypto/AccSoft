'use strict';
// Danh mục đối tượng (khách hàng / nhà cung cấp / nhân viên / nội bộ / quốc tế…) và các phân tích theo nhóm đối tượng:
//   • Giao dịch nội bộ (NB, TT): doanh thu, chi phí, mua – bán, thu – trả tiền với từng công ty nội bộ theo tháng
//   • Thanh toán cho đối tác quốc tế (BN_QT, ROAMING): số lần chuyển tiền, số tiền mỗi tháng → ước tính phí chuyển tiền quốc tế
const KINDS = { NV: 'Nhân viên', BN_TM: 'Đối tác Timor', BN_QT: 'Đối tác quốc tế', ROAMING: 'Đối tác roaming (quốc tế)', NB: 'Nội bộ (tập đoàn)', TT: 'Trung tâm / chi nhánh nội bộ', NH: 'Ngân hàng / quỹ', NO: 'Khác' };
const nm = s => { const t = String(s || ''); const i = t.indexOf('_'); return i > 0 ? t.slice(i + 1) : t; };

function make(db, all, get, okYm) {
  const run = (q, ...a) => db.prepare(q).run(...a);
  // Ghép đối tượng trong dữ liệu với danh mục: đúng "Mã_Tên"; nếu không có thì theo mã (phần trước "_Tên")
  function kindMap() {
    const cat = all(`SELECT code_name, code, name, kind, nb_code, nb_name FROM partners_cat`);
    const exact = new Map(cat.map(r => [r.code_name, r])), byCode = new Map(cat.filter(r => r.code).map(r => [r.code, r]));
    const parts = all(`SELECT DISTINCT partner_debit p FROM entries WHERE partner_debit IS NOT NULL UNION SELECT DISTINCT partner_credit FROM entries WHERE partner_credit IS NOT NULL`).map(r => r.p);
    const m = new Map();
    for (const p of parts) { let r = exact.get(p); if (!r) { const seg = p.split('_'); for (let i = seg.length - 1; i >= 1 && !r; i--) r = byCode.get(seg.slice(0, i).join('_')); } if (r) m.set(p, r); }
    return { map: m, parts };
  }
  function list(q = '', kind = '', offset = 0, limit = 200) {
    const w = ['1'], a = [];
    if (kind) { w.push(kind === '(trống)' ? "ifnull(kind,'')=''" : 'kind=?'); if (kind !== '(trống)') a.push(kind); }
    if (q) { w.push(`(code_name LIKE ? OR nb_code LIKE ? OR nb_name LIKE ? OR note LIKE ?)`); a.push(...Array(4).fill('%' + q + '%')); }
    const W = 'WHERE ' + w.join(' AND ');
    return { total: get(`SELECT count(*) n FROM partners_cat ${W}`, ...a).n, rows: all(`SELECT * FROM partners_cat ${W} ORDER BY kind, code_name LIMIT ? OFFSET ?`, ...a, limit, offset),
      counts: all(`SELECT ifnull(kind,'') k, count(*) n FROM partners_cat GROUP BY 1 ORDER BY 2 DESC`), kinds: KINDS };
  }
  function upsert(r, oldKey) {
    const code_name = String(r.code_name || '').trim(); if (!code_name) throw new Error('Thiếu "Mã_Tên" đối tượng');
    const code = String(r.code || code_name.split('_').slice(0, -1).join('_') || code_name).trim();
    if (oldKey && oldKey !== code_name) run('DELETE FROM partners_cat WHERE code_name=?', oldKey);
    run(`INSERT INTO partners_cat(code_name, code, name, kind, nb_code, nb_name, note, updated_at) VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))
      ON CONFLICT(code_name) DO UPDATE SET code=excluded.code, name=excluded.name, kind=excluded.kind, nb_code=excluded.nb_code, nb_name=excluded.nb_name, note=excluded.note, updated_at=excluded.updated_at`,
      code_name, code, String(r.name || nm(code_name)).trim(), String(r.kind || '').trim().toUpperCase() || null, r.nb_code || null, r.nb_name || null, r.note || null);
    return get('SELECT * FROM partners_cat WHERE code_name=?', code_name);
  }
  const remove = keys => { db.exec('BEGIN'); const d = db.prepare('DELETE FROM partners_cat WHERE code_name=?'); for (const k of [].concat(keys)) d.run(k); db.exec('COMMIT'); return keys.length; };
  // Nạp danh mục từ file (đã đọc thành mảng dòng ở main): mode 'replace' = xoá hết rồi nạp, 'merge' = thêm mới / cập nhật theo Mã_Tên
  function importRows(rows, mode = 'merge') {
    db.exec('BEGIN');
    try {
      if (mode === 'replace') db.exec('DELETE FROM partners_cat');
      let n = 0; for (const r of rows) { if (!r.code_name) continue; upsert(r); n++; }
      db.exec('COMMIT'); return { n, total: get('SELECT count(*) n FROM partners_cat').n };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const exportAll = () => all(`SELECT * FROM partners_cat ORDER BY kind, code_name`);
  // Đối tượng có trong dữ liệu nhưng chưa có trong danh mục (để bổ sung nhanh)
  function unmatched(limit = 500) {
    const { map, parts } = kindMap(), miss = parts.filter(p => !map.has(p));
    if (!miss.length) return [];
    const cnt = new Map();
    for (let i = 0; i < miss.length; i += 400) { const c = miss.slice(i, i + 400), ph = c.map(() => '?').join(',');
      for (const r of all(`SELECT p, sum(n) n, max(d) d FROM (SELECT partner_debit p, count(*) n, max(account_date) d FROM entries WHERE partner_debit IN (${ph}) GROUP BY 1 UNION ALL SELECT partner_credit, count(*), max(account_date) FROM entries WHERE partner_credit IN (${ph}) GROUP BY 1) GROUP BY p`, ...c, ...c)) cnt.set(r.p, r); }
    return [...cnt.values()].sort((a, b) => b.n - a.n).slice(0, limit).map(r => ({ code_name: r.p, n: r.n, last: r.d }));
  }

  // Lấy bút toán có đối tượng thuộc các nhóm cần xét (dùng chỉ mục partner_debit / partner_credit)
  function rowsOfKinds(kinds, from, to) {
    const { map } = kindMap(), ps = [...map].filter(([, r]) => kinds.includes(r.kind)).map(([p]) => p);
    if (!ps.length) return { rows: [], map };
    const f = okYm(from), t = okYm(to), R = (f ? ` AND ym>='${f}'` : '') + (t ? ` AND ym<='${t}'` : ''), out = new Map();
    for (let i = 0; i < ps.length; i += 400) { const c = ps.slice(i, i + 400), ph = c.map(() => '?').join(',');
      for (const side of ['debit', 'credit']) for (const r of all(`SELECT id, ym, account_date d, document_no doc, acc_debit dr, acc_credit cr, acc_debit_name drName, acc_credit_name crName, amount a, partner_debit bp, partner_credit bpCr, description ds, created_by u, type_of_cost t
          FROM entries WHERE partner_${side} IN (${ph})${R} AND amount<>0`, ...c)) out.set(r.id, r); }
    try { const docs = [...new Set(all(`SELECT doc FROM ig_adj WHERE action='move'`).map(x => x.doc).filter(Boolean))];
      for (let i = 0; i < docs.length; i += 400) { const c = docs.slice(i, i + 400);
        for (const r of all(`SELECT id, ym, account_date d, document_no doc, acc_debit dr, acc_credit cr, acc_debit_name drName, acc_credit_name crName, amount a, partner_debit bp, partner_credit bpCr, description ds, created_by u, type_of_cost t
          FROM entries WHERE document_no IN (${c.map(() => '?').join(',')})${R} AND amount<>0`, ...c)) if (!out.has(r.id)) out.set(r.id, r); } } catch { }
    return { rows: [...out.values()], map };
  }
  const A = (a, ...p) => p.some(x => String(a || '').startsWith(x));
  // Phân loại nghiệp vụ theo cặp TK (dùng cho giao dịch nội bộ)
  function category(r) {
    if (A(r.cr, '511', '512', '515', '711')) return 'Doanh thu';
    if (A(r.dr, '511', '521')) return 'Giảm trừ / điều chỉnh doanh thu';
    if (A(r.dr, '15', '211', '213', '241', '242')) return 'Mua hàng hoá, vật tư, tài sản';
    if (A(r.dr, '6', '8') && !A(r.dr, '911')) return 'Chi phí';
    if (A(r.cr, '111', '112', '113') && !A(r.dr, '111', '112', '113')) return 'Trả tiền';
    if (A(r.dr, '111', '112', '113') && !A(r.cr, '111', '112', '113')) return 'Thu tiền';
    if (A(r.cr, '15') && A(r.dr, '131', '136', '138', '632')) return 'Bán / xuất hàng';
    return 'Công nợ, bù trừ, khác';
  }
  const CATS = ['Doanh thu', 'Giảm trừ / điều chỉnh doanh thu', 'Chi phí', 'Mua hàng hoá, vật tư, tài sản', 'Bán / xuất hàng', 'Thu tiền', 'Trả tiền', 'Công nợ, bù trừ, khác'];

  // TK ước tính: 335 (chi phí phải trả – trích trước), 1317 (doanh thu ước tính)
  const EST = r => A(r.dr, '335', '1317') || A(r.cr, '335', '1317');
  // Đối tượng nội bộ của bút toán: nếu cả hai phía đều là đối tượng nội bộ thì lấy phía TK công nợ (13x, 14x, 33x, 34x, 35x), không thì phía Có
  const DEBT = a => A(a, '13', '14', '33', '34', '35');
  // Điều chỉnh của người dùng: loại bút toán / chứng từ khỏi nội bộ, hoặc gán lại sang công ty nội bộ khác (khi nhân viên chọn sai đối tượng)
  const sigRow = r => 'r:' + [r.doc, r.d, r.dr, r.cr, Math.round(r.a * 100), r.bp || '', r.bpCr || ''].join('|'), sigDoc = r => 'd:' + r.doc;
  const adjMap = () => { try { return new Map(all(`SELECT * FROM ig_adj`).map(x => [x.sig, x])); } catch { return new Map(); } };
  const adjOf = (adj, r) => adj.get(sigRow(r)) || adj.get(sigDoc(r));
  function coIndex(map, kinds) { const m = new Map(); for (const [p, c] of map) if (kinds.includes(c.kind)) { const k = coKey(c, p); if (!m.has(k)) m.set(k, [p, c]); } return m; }
  function picker(map, kinds, adj) {
    const base = picker0(map, kinds); if (!adj || !adj.size) return base; const ci = coIndex(map, kinds);
    return r => { const a = adjOf(adj, r); if (a) { if (a.action === 'out') return [null, null]; if (a.action === 'move' && ci.has(a.to_key)) return ci.get(a.to_key); } return base(r); };
  }
  function picker0(map, kinds) {
    return r => { const c = map.get(r.bpCr), d = map.get(r.bp), okC = c && kinds.includes(c.kind), okD = d && kinds.includes(d.kind);
      if (okC && okD) return DEBT(r.dr) && !DEBT(r.cr) ? [r.bp, d] : [r.bpCr, c];
      return okC ? [r.bpCr, c] : okD ? [r.bp, d] : [null, null]; };
  }
  const coKey = (c, p) => c.nb_code || c.nb_name || c.name || nm(p), coName = (c, p) => c.nb_name || c.nb_code || c.name || nm(p);
  // Danh sách công ty / đơn vị nội bộ trong danh mục (để lọc)
  function companies(withTT = false) {
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], m = new Map();
    for (const r of all(`SELECT * FROM partners_cat WHERE kind IN (${kinds.map(() => '?').join(',')})`, ...kinds)) { const k = coKey(r, r.code_name); const o = m.get(k) || m.set(k, { key: k, name: coName(r, r.code_name), kind: r.kind, codes: [] }).get(k); o.codes.push(r.code_name); }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function internal(from, to, withTT = false, excl = false, company = '') {
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], { rows: rows0, map } = rowsOfKinds(kinds, from, to), pick = picker(map, kinds, adjMap());
    const rows = rows0.filter(r => (!excl || !EST(r)) && (!company || (() => { const [p, c] = pick(r); return c && coKey(c, p) === company; })()));
    const months = [...new Set(rows.map(r => r.ym))].sort(), co = new Map(), pt = new Map(), mm = new Map();
    for (const r of rows) {
      const [p, c] = pick(r); if (!c) continue; const cat = category(r), company = coName(c, p), key = coKey(c, p);
      const o = co.get(key) || co.set(key, { key, company, code: c.nb_code, kind: c.kind, partners: new Set(), by: Object.fromEntries(CATS.map(k => [k, 0])), n: 0 }).get(key);
      o.by[cat] += r.a; o.n++; o.partners.add(p);
      const q = pt.get(p) || pt.set(p, { p, name: nm(p), company, kind: c.kind, by: Object.fromEntries(CATS.map(k => [k, 0])), n: 0 }).get(p); q.by[cat] += r.a; q.n++;
      const m = mm.get(r.ym) || mm.set(r.ym, Object.fromEntries(CATS.map(k => [k, 0]))).get(r.ym); m[cat] += r.a;
    }
    const tot = Object.fromEntries(CATS.map(k => [k, [...co.values()].reduce((s, o) => s + o.by[k], 0)]));
    return { from: okYm(from) || months[0], to: okYm(to) || months.at(-1), withTT, excl, company, cats: CATS, tot, n: rows.length, months: months.map(m => ({ ym: m, ...mm.get(m) })),
      companies: [...co.values()].map(o => ({ ...o, partners: o.partners.size })).sort((a, b) => b.n - a.n), partners: [...pt.values()].sort((a, b) => b.n - a.n) };
  }
  function internalRows(from, to, withTT, key, cat, limit = 20000, excl = false) { // chi tiết bút toán nội bộ (lọc theo công ty / loại nghiệp vụ)
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], { rows, map } = rowsOfKinds(kinds, from, to), adj = adjMap(), pick = picker(map, kinds, adj), sus = suspect(map, kinds);
    const out = [];
    for (const r of rows) { const [p, c] = pick(r); if (!c || (excl && EST(r))) continue; const k = coKey(c, p);
      if ((key && k !== key) || (cat && category(r) !== cat)) continue; const a = adjOf(adj, r);
      out.push({ ...r, cat: category(r), company: coName(c, p), coKey: k, ip: p, est: EST(r), sig: sigRow(r), adj: a ? (a.action === 'move' ? 'Gán lại → ' + a.to_key : '') : '', sus: sus(r, k) }); }
    out.sort((a, b) => a.d.localeCompare(b.d) || a.doc.localeCompare(b.doc));
    return { total: out.length, rows: out.slice(0, limit) };
  }
  // (1) Số dư nội bộ tại ngày: cộng dồn phát sinh của TK bảng cân đối (loại 1–4) theo đúng phía đối tượng (TK Nợ ↔ đối tượng Nợ, TK Có ↔ đối tượng Có)
  function internalBalance(asOf, withTT = false, excl = false, company = '') {
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], { rows, map } = rowsOfKinds(kinds, '', String(asOf || '').slice(0, 7)), adj = adjMap(), ci = coIndex(map, kinds);
    const m = new Map();
    for (const r of rows) { if (asOf && r.d > asOf) continue; const ad = adjOf(adj, r); if (ad && ad.action === 'out') continue;
      const mv = ad && ad.action === 'move' && ci.get(ad.to_key);
      for (const [acc, accName, p0, sgn] of [[r.dr, r.drName, r.bp, 1], [r.cr, r.crName, r.bpCr, -1]]) {
        let p = p0, c = map.get(p); if (mv && DEBT(acc)) [p, c] = mv; if (!c || !kinds.includes(c.kind) || !/^[1-4]/.test(acc || '')) continue;
        if (excl && A(acc, '335', '1317')) continue; const k = coKey(c, p); if (company && k !== company) continue;
        const key = k + '|' + acc, o = m.get(key) || m.set(key, { key: k, company: coName(c, p), acc, accName: accName || acc, bal: 0, dr: 0, cr: 0, last: null, est: A(acc, '335', '1317') }).get(key);
        o.bal += sgn * r.a; sgn > 0 ? o.dr += r.a : o.cr += r.a; if (!o.last || r.d > o.last) o.last = r.d; } }
    const lines = [...m.values()].filter(o => Math.abs(o.bal) > 0.005).sort((a, b) => a.company.localeCompare(b.company) || a.acc.localeCompare(b.acc));
    const by = new Map(); for (const o of lines) { const x = by.get(o.key) || by.set(o.key, { key: o.key, company: o.company, dr: 0, cr: 0, net: 0, n: 0 }).get(o.key); o.bal > 0 ? x.dr += o.bal : x.cr -= o.bal; x.net += o.bal; x.n++; }
    return { asOf, excl, lines, companies: [...by.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)), tot: lines.reduce((t, o) => (o.bal > 0 ? t.dr += o.bal : t.cr -= o.bal, t), { dr: 0, cr: 0 }) };
  }
  // (4) Tổng hợp theo năm: mua (ghi chi phí 627 / 641 / 642 / chi phí khác; hàng hoá – vật tư 15x; tài sản 211/213/241/242), bán (doanh thu 511/512/515/711, trừ giảm trừ)
  const YCOL = [['buy627', 'Mua – ghi chi phí 627'], ['buy641', 'Mua – ghi chi phí 641'], ['buy642', 'Mua – ghi chi phí 642'], ['buyExpO', 'Mua – chi phí khác (6xx/8xx)'], ['buyGoods', 'Mua hàng hoá, vật tư (15x)'], ['buyAsset', 'Mua tài sản, XDCB, trả trước (211/213/241/242)'], ['buyTot', 'Tổng mua'], ['sales', 'Bán – doanh thu (511/512/515/711)'], ['salesAdj', 'Giảm trừ / điều chỉnh doanh thu'], ['salesNet', 'Bán thuần']];
  function internalYears(years, withTT = false, excl = false, company = '') {
    years = [...new Set([].concat(years || []).map(String).filter(y => /^\d{4}$/.test(y)))].sort(); if (!years.length) return { years, cols: YCOL, rows: [] };
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], { rows, map } = rowsOfKinds(kinds, years[0] + '-01', years.at(-1) + '-12'), pick = picker(map, kinds, adjMap());
    const m = new Map(), z = () => Object.fromEntries(YCOL.map(([k]) => [k, 0]));
    for (const r of rows) { const y = r.ym.slice(0, 4); if (!years.includes(y) || (excl && EST(r))) continue; const [p, c] = pick(r); if (!c) continue; const k = coKey(c, p); if (company && k !== company) continue;
      const o = m.get(k) || m.set(k, { key: k, company: coName(c, p), kind: c.kind, y: Object.fromEntries(years.map(x => [x, z()])) }).get(k), t = o.y[y];
      if (A(r.dr, '627')) t.buy627 += r.a; else if (A(r.dr, '641')) t.buy641 += r.a; else if (A(r.dr, '642')) t.buy642 += r.a;
      else if (A(r.dr, '6', '8') && !A(r.dr, '911', '632')) t.buyExpO += r.a; else if (A(r.dr, '15')) t.buyGoods += r.a; else if (A(r.dr, '211', '213', '241', '242')) t.buyAsset += r.a;
      if (A(r.cr, '511', '512', '515', '711')) t.sales += r.a; if (A(r.dr, '511', '512', '521')) t.salesAdj += r.a;
      if (A(r.cr, '627', '641', '642')) { const col = A(r.cr, '627') ? 'buy627' : A(r.cr, '641') ? 'buy641' : 'buy642'; t[col] -= r.a; } // ghi giảm chi phí
    }
    for (const o of m.values()) for (const y of years) { const t = o.y[y]; t.buyTot = t.buy627 + t.buy641 + t.buy642 + t.buyExpO + t.buyGoods + t.buyAsset; t.salesNet = t.sales - t.salesAdj; }
    const list = [...m.values()].sort((a, b) => Math.abs(b.y[years.at(-1)].buyTot) + Math.abs(b.y[years.at(-1)].salesNet) - Math.abs(a.y[years.at(-1)].buyTot) - Math.abs(a.y[years.at(-1)].salesNet));
    const tot = Object.fromEntries(years.map(y => [y, Object.fromEntries(YCOL.map(([k]) => [k, list.reduce((s, o) => s + o.y[y][k], 0)]))]));
    return { years, cols: YCOL, rows: list, tot, excl, company };
  }

  // Nghi ngờ chọn sai đối tượng: diễn giải nhắc tới mã / tên công ty nội bộ khác với công ty đang gắn
  function suspect(map, kinds) {
    const toks = []; for (const [p, c] of coIndex(map, kinds)) { for (const t of [c.nb_code, c.nb_name].filter(x => x && String(x).trim().length >= 3)) toks.push([p, new RegExp('(^|[^a-z0-9])' + String(t).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])')]); }
    return (r, k) => { const d = String(r.ds || '').toLowerCase(); if (!d) return ''; let hitOwn = false; const other = [];
      for (const [key, re] of toks) if (re.test(d)) key === k ? hitOwn = true : other.includes(key) || other.push(key);
      return !hitOwn && other.length ? 'Diễn giải nhắc tới ' + other.slice(0, 2).join(', ') : ''; };
  }
  // Quản lý điều chỉnh
  function adjList() { try { return all(`SELECT * FROM ig_adj ORDER BY updated_at DESC`); } catch { return []; } }
  function adjSet(items, action, toKey = '', note = '') {
    if (!['out', 'move'].includes(action)) throw new Error('Hành động không hợp lệ'); if (action === 'move' && !toKey) throw new Error('Chọn công ty nội bộ cần gán');
    db.exec('BEGIN'); try { let n = 0;
      for (const x of [].concat(items || [])) { const doc = x.doc; if (!doc) continue; const scope = x.scope === 'doc' ? 'doc' : 'row', sig = scope === 'doc' ? 'd:' + doc : (x.sig || sigRow(x));
        run(`INSERT OR REPLACE INTO ig_adj(sig, scope, action, to_key, doc, d, a, ds, from_key, note, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`, sig, scope, action, action === 'move' ? toKey : '', doc, x.d || '', scope === 'doc' ? null : +x.a || 0, String(x.ds || '').slice(0, 300), x.coKey || x.from_key || '', note || ''); n++; }
      db.exec('COMMIT'); return { n }; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function adjRemove(sigs) { let n = 0; for (const s of [].concat(sigs || [])) n += run(`DELETE FROM ig_adj WHERE sig=?`, s).changes; return { n }; }
  // Các dòng của một chứng từ (để gán thêm vào nội bộ khi nhân viên chọn nhầm đối tượng ngoài)
  function docLines(doc, withTT = false) {
    const kinds = withTT ? ['NB', 'TT'] : ['NB'], { map } = kindMap(), adj = adjMap(), pick = picker(map, kinds, adj);
    return all(`SELECT id, ym, account_date d, document_no doc, acc_debit dr, acc_credit cr, acc_debit_name drName, acc_credit_name crName, amount a, partner_debit bp, partner_credit bpCr, description ds, created_by u FROM entries WHERE document_no=? ORDER BY line_no, id LIMIT 2000`, String(doc || '').trim())
      .map(r => { const [p, c] = pick(r), a = adjOf(adj, r); return { ...r, cat: category(r), company: c ? coName(c, p) : '', coKey: c ? coKey(c, p) : '', sig: sigRow(r), adj: a ? (a.action === 'out' ? 'Đã loại' : 'Gán lại → ' + a.to_key) : '' }; });
  }

  // Thanh toán cho đối tác quốc tế: bút toán Có TK tiền (111/112/113), đối tượng Nợ thuộc nhóm quốc tế
  function intlPayments(from, to, fee = {}) {
    const kinds = fee.kinds && fee.kinds.length ? fee.kinds : ['BN_QT', 'ROAMING'], { rows, map } = rowsOfKinds(kinds, from, to);
    const flat = +fee.flat || 0, pct = +fee.pct || 0, min = +fee.min || 0, max = +fee.max || 0;
    const feeOf = v => { let x = flat + Math.abs(v) * pct / 100; if (min && x < min) x = min; if (max && x > max) x = max; return x; };
    // Mỗi lần chuyển tiền = một chứng từ chi cho một đối tượng (gộp các dòng cùng chứng từ)
    const pays = new Map();
    for (const r of rows) {
      if (!A(r.cr, '111', '112', '113') || A(r.dr, '111', '112', '113')) continue;
      const c = map.get(r.bp); if (!c || !kinds.includes(c.kind)) continue;
      const k = r.doc + '|' + r.bp + '|' + r.ym, o = pays.get(k) || pays.set(k, { doc: r.doc, d: r.d, ym: r.ym, p: r.bp, name: nm(r.bp), kind: c.kind, bank: r.crName || r.cr, a: 0, ds: r.ds, u: r.u }).get(k); o.a += r.a;
    }
    const list = [...pays.values()].filter(x => x.a > 0.004).map(x => ({ ...x, fee: feeOf(x.a) })).sort((a, b) => a.d.localeCompare(b.d));
    // Phí ngân hàng thực tế ghi nhận (Nợ 635 / 642x / 627, diễn giải có "fee/charge/phí")
    const f = okYm(from), t = okYm(to), R = (f ? ` AND ym>='${f}'` : '') + (t ? ` AND ym<='${t}'` : '');
    const act = all(`SELECT ym, sum(amount) v, count(*) n FROM entries WHERE (acc_debit LIKE '635%' OR acc_debit LIKE '642%' OR acc_debit LIKE '6418%' OR acc_debit LIKE '627%')
      AND (lower(description) LIKE '%bank charge%' OR lower(description) LIKE '%bank fee%' OR lower(description) LIKE '%transfer fee%' OR lower(description) LIKE '%swift%' OR lower(description) LIKE '%phí chuyển%' OR lower(description) LIKE '%phi chuyen%' OR lower(description) LIKE '%remittance%')${R} GROUP BY ym`);
    const am = new Map(act.map(r => [r.ym, r])), bym = new Map();
    for (const x of list) { const o = bym.get(x.ym) || bym.set(x.ym, { ym: x.ym, n: 0, a: 0, fee: 0, partners: new Set(), banks: {} }).get(x.ym); o.n++; o.a += x.a; o.fee += x.fee; o.partners.add(x.p); o.banks[x.bank] = (o.banks[x.bank] || 0) + 1; }
    const months = [...bym.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map(o => ({ ...o, partners: o.partners.size, actFee: am.get(o.ym)?.v || 0, actN: am.get(o.ym)?.n || 0 }));
    const bp = new Map(); for (const x of list) { const o = bp.get(x.p) || bp.set(x.p, { p: x.p, name: x.name, kind: x.kind, n: 0, a: 0, fee: 0, months: new Set(), last: null }).get(x.p); o.n++; o.a += x.a; o.fee += x.fee; o.months.add(x.ym); o.last = x.d; }
    return { kinds, fee: { flat, pct, min, max }, months, partners: [...bp.values()].map(o => ({ ...o, months: o.months.size })).sort((a, b) => b.a - a.a), list: list.slice(-3000),
      tot: { n: list.length, a: list.reduce((s, x) => s + x.a, 0), fee: list.reduce((s, x) => s + x.fee, 0), actFee: act.reduce((s, r) => s + r.v, 0) } };
  }
  // Phân bố đối tượng theo nhóm trong dữ liệu (số dòng hạch toán)
  function kindStats() {
    const { map, parts } = kindMap(), c = {};
    for (const p of parts) { const k = map.get(p)?.kind || '(chưa phân loại)'; c[k] = (c[k] || 0) + 1; }
    return { partners: parts.length, matched: map.size, byKind: c, catalog: get('SELECT count(*) n FROM partners_cat').n };
  }
  return { list, upsert, remove, importRows, exportAll, unmatched, internal, internalRows, internalBalance, internalYears, companies, adjList, adjSet, adjRemove, docLines, intlPayments, kindStats, KINDS };
}
module.exports = { make, KINDS };
