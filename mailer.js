// Gửi email thông báo qua SMTP (nodemailer). Mật khẩu được mã hoá bằng safeStorage của hệ điều hành.
const nodemailer = require('nodemailer');
const { safeStorage } = require('electron');

const enc = s => (s && safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : s || '');
const dec = s => (s && s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s || '');

function getConfig(store) {
  const c = JSON.parse(store.getSetting('smtp') || '{}');
  return { ...c, pass: '', hasPass: !!c.pass };
}
function setConfig(store, cfg) {
  const old = JSON.parse(store.getSetting('smtp') || '{}');
  const pass = cfg.pass ? enc(cfg.pass) : old.pass; // để trống = giữ mật khẩu cũ
  store.setSetting('smtp', JSON.stringify({ ...cfg, pass }));
}
function transport(store) {
  const c = JSON.parse(store.getSetting('smtp') || '{}');
  if (!c.host) throw new Error('Chưa cấu hình máy chủ SMTP.');
  return {
    c,
    t: nodemailer.createTransport({
      host: c.host, port: +c.port || 587, secure: !!c.secure,
      auth: c.user ? { user: c.user, pass: dec(c.pass) } : undefined,
      tls: { rejectUnauthorized: !c.allowSelfSigned },
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000, // không treo "Đang gửi…" khi máy chủ không phản hồi
    }),
  };
}
// "Finance Department" (không có @) → "Finance Department" <tài khoản>
const fromOf = c => { const f = String(c.from || '').trim(); return !f ? c.user : /@/.test(f) ? f : { name: f, address: c.user }; };
async function verify(store) { const { t } = transport(store); await t.verify(); return true; }

// msgs: [{to, cc, subject, html, attachment:{name, base64} | attachments:[{name, base64}], employee, count}]
async function sendAll(store, msgs) {
  const { c, t } = transport(store);
  const out = [];
  for (const m of msgs) {
    try {
      // CC mặc định trong cấu hình chỉ thêm khi người dùng tick "Kèm CC mặc định" ở màn gửi
      const mail = { from: fromOf(c), to: m.to, cc: m.cc || undefined, subject: m.subject, html: m.html,
        attachments: (m.attachments || (m.attachment ? [m.attachment] : [])).map(x => ({ filename: x.name, content: Buffer.from(x.base64, 'base64'), ...(x.cid ? { cid: x.cid } : {}) })) };
      // Máy chủ ngắt kết nối giữa chừng (ECONNRESET / timeout) → mở kết nối mới, gửi lại tối đa 2 lần
      let info, err;
      for (let k = 0; k < 3; k++) {
        try { info = await (k ? transport(store).t : t).sendMail(mail); err = null; break; }
        catch (e) { err = e; if (!/ECONNRESET|ETIMEDOUT|ESOCKET|ECONNECTION|EPIPE|socket hang up|Connection closed/i.test(String(e.code || '') + ' ' + String(e.message || e))) break; await new Promise(r => setTimeout(r, 1500 * (k + 1))); }
      }
      if (err) { if (/ECONNRESET|socket hang up|Connection closed/i.test(String(err.message || err))) err = new Error(`${err.message || err} – máy chủ mail ngắt kết nối (đã thử lại 3 lần). Kiểm tra mạng / VPN, cổng và SSL/TLS trong cấu hình SMTP (587 = STARTTLS bỏ tick SSL; 465 = tick SSL), hoặc dung lượng tệp đính kèm.`); throw err; }
      store.logMail(m.employee, m.to, m.subject, m.count, 'ok', info.messageId || '');
      out.push({ to: m.to, ok: true });
    } catch (e) {
      store.logMail(m.employee, m.to, m.subject, m.count, 'error', String(e.message || e));
      out.push({ to: m.to, ok: false, error: String(e.message || e) });
    }
  }
  return out;
}
module.exports = { getConfig, setConfig, verify, sendAll };
