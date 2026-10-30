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
    }),
  };
}
async function verify(store) { const { t } = transport(store); await t.verify(); return true; }

// msgs: [{to, cc, subject, html, attachment:{name, base64}, employee, count}]
async function sendAll(store, msgs) {
  const { c, t } = transport(store);
  const out = [];
  for (const m of msgs) {
    try {
      const info = await t.sendMail({
        from: c.from || c.user, to: m.to, cc: m.cc || c.cc || undefined, subject: m.subject, html: m.html,
        attachments: m.attachment ? [{ filename: m.attachment.name, content: Buffer.from(m.attachment.base64, 'base64') }] : [],
      });
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
