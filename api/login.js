const crypto = require('crypto');
const { configured, sessionCookie } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!configured()) return res.status(503).json({ error: 'Access protection is not configured.' });
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const given = Buffer.from(String(body.pin || ''));
  const expected = Buffer.from(String(process.env.STUDENT_PIN));
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: 'Nieprawidłowy PIN.' });
  res.setHeader('Set-Cookie', sessionCookie());
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
};
