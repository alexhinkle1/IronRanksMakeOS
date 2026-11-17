const LIFTS = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const hook = process.env.MAKEOS_LOG_LIFT_URL;
  const sbUrl = process.env.SUPABASE_URL || 'https://yqadckmauiqehwhfgmzl.supabase.co';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RHCcXXMAO-bIxJK-raWbuA_XsO7OKYJ';
  if (!hook) {
    res.status(500).json({ error: 'MAKEOS_LOG_LIFT_URL is not set' });
    return;
  }
  const auth = req.headers.authorization || '';
  if (auth.indexOf('Bearer ') !== 0) {
    res.status(401).json({ error: 'Please sign in first.' });
    return;
  }
  const who = await fetch(sbUrl + '/auth/v1/user', { headers: { apikey: key, authorization: auth } });
  if (!who.ok) {
    res.status(401).json({ error: 'Your sign-in has ended. Reload the page.' });
    return;
  }
  const user = await who.json();
  const b = req.body || {};
  const weightKg = Number(b.weightKg);
  const reps = Number(b.reps);
  if (LIFTS.indexOf(b.lift) < 0) { res.status(400).json({ error: 'Unknown lift.' }); return; }
  if (!(weightKg > 0 && weightKg <= 700)) { res.status(400).json({ error: 'Weight must be between 0 and 700 kg.' }); return; }
  if (!(reps >= 1 && reps <= 30)) { res.status(400).json({ error: 'Reps must be between 1 and 30.' }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.performedOn))) { res.status(400).json({ error: 'Date must look like 2026-01-31.' }); return; }
  const up = await fetch(hook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: user.id, lift: b.lift, weightKg: weightKg, reps: Math.round(reps), performedOn: b.performedOn })
  });
  if (!up.ok) {
    res.status(502).json({ error: 'The ranking service did not accept that lift.' });
    return;
  }
  res.status(200).json({ ok: true, routed: 'targets' });
};
