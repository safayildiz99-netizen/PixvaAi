import { readToken } from './_lib.js';

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function supabaseKey() {
  return String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
}

async function rpc(name, args) {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error('Supabase-Variablen fehlen in Vercel.');

  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase RPC ${name} fehlgeschlagen.`;
    if (/does not exist|could not find the function|schema cache/i.test(message)) {
      throw new Error('Bitte zuerst die V6-Supabase-Browserdatei vollständig in Supabase ausführen.');
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function authorizeUsage(req, { requestId, kind, model, units, estimatedCostUsd }) {
  const token = readToken(req);
  if (!token) throw new Error('Für kostenpflichtige Bilder und Videos musst du dich anmelden.');
  const access = await rpc('app_plan_access', { p_token: token, p_kind: String(kind || '') });
  if (!access?.allowed) throw new Error(access?.error || 'Diese kostenpflichtige KI-Funktion ist in deinem aktuellen Beta-Abo nicht enthalten.');
  return rpc('app_authorize_ai_usage', {
    p_token: token,
    p_request_id: requestId,
    p_kind: kind,
    p_model: model,
    p_units: Number(units || 1),
    p_estimated_cost_usd: Number(estimatedCostUsd || 0)
  });
}

export async function finishUsage(req, { requestId, status, actualCostUsd = null, error = '' }) {
  const token = readToken(req);
  if (!token || !requestId) return null;
  try {
    return await rpc('app_finish_ai_usage', {
      p_token: token,
      p_request_id: requestId,
      p_status: status,
      p_actual_cost_usd: actualCostUsd == null ? null : Number(actualCostUsd),
      p_error: String(error || '').slice(0, 1000)
    });
  } catch (finishError) {
    console.error('Usage finish failed', finishError);
    return null;
  }
}


export async function bindUsageProvider(req, { requestId, providerId }) {
  const token = readToken(req);
  if (!token) throw new Error('Für diesen Medienauftrag musst du dich anmelden.');
  return rpc('app_bind_ai_provider_id', {
    p_token: token,
    p_request_id: requestId,
    p_provider_id: String(providerId || '')
  });
}

export async function verifyUsageAccess(req, { requestId, providerId, kind }) {
  const token = readToken(req);
  if (!token) throw new Error('Für diesen Medienauftrag musst du dich anmelden.');
  return rpc('app_verify_ai_usage', {
    p_token: token,
    p_request_id: requestId,
    p_provider_id: String(providerId || ''),
    p_kind: String(kind || '')
  });
}
