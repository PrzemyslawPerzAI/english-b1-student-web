const crypto = require('crypto');

function configured() {
  return Boolean(process.env.STUDENT_PIN && process.env.SESSION_SECRET);
}
function sign(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}
function validSession(req) {
  if (!configured()) return true; // keeps DEV usable until Vercel secrets are configured
  const raw = String(req.headers.cookie || '');
  const m = raw.match(/(?:^|;\s*)student_session=([^;]+)/);
  if (!m) return false;
  const value = decodeURIComponent(m[1]);
  const parts = value.split('.');
  if (parts.length !== 2 || parts[0] !== 'ok') return false;
  const expected = sign(parts[0]);
  try {
    return crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected));
  } catch (_) { return false; }
}
function sessionCookie() {
  const value = 'ok.' + sign('ok');
  return 'student_session=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200';
}
module.exports = { configured, validSession, sessionCookie };
