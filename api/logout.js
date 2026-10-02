module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', 'student_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
};
