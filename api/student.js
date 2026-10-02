const { validSession } = require('./_auth');

const DEFAULT_DEV_BACKEND = 'https://script.google.com/macros/s/AKfycbylZfdAmcwnjMad6CHBZ383HI-RSdiTpGpL9isnUrTaHQvMzo2oiYZfNOilyox9zFd6/exec';

function backendUrl() {
  const configured = String(process.env.STUDENT_BACKEND_URL || '').trim();
  if (configured) return configured.replace(/\/+$/,'');
  if (process.env.VERCEL_ENV === 'production') throw new Error('STUDENT_BACKEND_URL is required in production');
  return DEFAULT_DEV_BACKEND;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!validSession(req)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const upstream = await fetch(backendUrl() + '?api=student', { redirect: 'follow' });
    if (!upstream.ok) throw new Error('Backend API HTTP ' + upstream.status);
    const data = await upstream.json();
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(data);
  } catch (err) {
    console.error('student-api', err);
    return res.status(502).json({ error: 'Nie udało się pobrać danych.' });
  }
};
