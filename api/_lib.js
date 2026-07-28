function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

function supabaseKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
}

export function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function readToken(req) {
  const raw = String(req.headers.authorization || '');
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
}

export async function validateUser(req) {
  const url = supabaseUrl();
  const key = supabaseKey();
  const token = readToken(req);
  if (!url || !key) throw new Error('Supabase-Variablen fehlen in Vercel.');
  if (!token) throw new Error('Nicht angemeldet.');

  const response = await fetch(`${url}/rest/v1/rpc/app_me`, {
    method: 'POST',
    headers: {
      apikey: key,
      ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_token: token })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error || !data?.user) {
    throw new Error(data?.error || 'Sitzung ungültig oder abgelaufen.');
  }
  return data.user;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}
