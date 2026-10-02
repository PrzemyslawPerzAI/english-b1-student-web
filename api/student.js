const DEV_DATA_URL = 'https://script.google.com/macros/s/AKfycbylZfdAmcwnjMad6CHBZ383HI-RSdiTpGpL9isnUrTaHQvMzo2oiYZfNOilyox9zFd6/exec?api=student';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const upstream = await fetch(DEV_DATA_URL, {
      redirect: 'follow',
      headers: { 'User-Agent': 'English-B1-Student-Web/1.0' }
    });
    if (!upstream.ok) throw new Error('DEV API HTTP ' + upstream.status);
    const text = await upstream.text();
    const data = JSON.parse(text);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(data);
  } catch (err) {
    console.error('student-api', err);
    return res.status(502).json({ error: 'Nie udało się pobrać danych DEV.' });
  }
}
