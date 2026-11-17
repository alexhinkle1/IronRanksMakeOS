// Vercel serverless route: keeps the MakeOS webhook URL secret (env var), never exposed to the browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const url = process.env.MAKEOS_WEBHOOK_URL;
  if (!url) return res.status(500).json({ error: 'MAKEOS_WEBHOOK_URL not set' });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body || {}),
  });
  return res.status(r.ok ? 200 : 502).json({ forwarded: r.status });
}
