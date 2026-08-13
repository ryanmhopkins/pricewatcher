import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM = 'PlanSentry Contact <hello@plansentry.com>';
const TO = 'hello@plansentry.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rateLimited(ip: string) {
  const key = `contact:${await hash(ip)}`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/beta_rate_limits?key=eq.${encodeURIComponent(key)}&select=*`, { headers });
  if (!response.ok) throw new Error('Unable to check request limit');
  const row = (await response.json())[0];
  const now = Date.now();
  if (!row) {
    await fetch(`${SUPABASE_URL}/rest/v1/beta_rate_limits`, { method: 'POST', headers, body: JSON.stringify({ key, window_start: new Date(now).toISOString(), count: 1 }) });
    return false;
  }
  if (now - new Date(row.window_start).getTime() >= 60 * 60 * 1000) {
    await fetch(`${SUPABASE_URL}/rest/v1/beta_rate_limits?key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', headers, body: JSON.stringify({ window_start: new Date(now).toISOString(), count: 1 }) });
    return false;
  }
  if (Number(row.count) >= 5) return true;
  await fetch(`${SUPABASE_URL}/rest/v1/beta_rate_limits?key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', headers, body: JSON.stringify({ count: Number(row.count) + 1 }) });
  return false;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    if (clean(body.company_website, 200)) return json({ ok: true });
    const name = clean(body.name, 100);
    const email = clean(body.email, 254).toLowerCase();
    const topic = clean(body.topic, 80) || 'General question';
    const message = clean(body.message, 5000);
    if (!name || !email || !message) return json({ error: 'Name, email, and message are required.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (message.length < 10) return json({ error: 'Please include a little more detail.' }, 400);
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    if (await rateLimited(ip)) return json({ error: 'Too many messages. Please try again later.' }, 429);
    if (!RESEND_KEY) throw new Error('Email delivery is not configured');
    const subject = `[PlanSentry contact] ${topic} — ${name}`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#090a0c;color:#f4f4f5;padding:32px"><div style="max-width:620px;margin:auto;background:#131419;border:1px solid #30323a;border-radius:16px;padding:28px"><h1 style="font-size:22px">New PlanSentry message</h1><p><b>From:</b> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p><b>Topic:</b> ${escapeHtml(topic)}</p><div style="white-space:pre-wrap;line-height:1.6;color:#d4d4d8">${escapeHtml(message)}</div></div></body></html>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: TO, subject, html }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Email provider returned ${response.status}`);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'We could not send your message. Email hello@plansentry.com instead.' }, 500);
  }
});
