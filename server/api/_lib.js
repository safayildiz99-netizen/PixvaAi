import { createClient } from '@supabase/supabase-js';

export function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

export function supabaseUrl() {
  return env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
}

export function supabaseAnonKey() {
  return env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY');
}

export function serviceClient() {
  const url = supabaseUrl();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase Server-Variablen fehlen.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'yildiz-ai-v10-server' } }
  });
}

export function bearerToken(req) {
  const raw = String(req.headers?.authorization || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

export function userClient(req) {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  const token = bearerToken(req);
  if (!url || !key) throw new Error('Supabase Client-Variablen fehlen.');
  if (!token) throw Object.assign(new Error('Nicht angemeldet.'), { status: 401 });
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

export async function requireUser(req, { admin = false } = {}) {
  const token = bearerToken(req);
  if (!token) throw Object.assign(new Error('Nicht angemeldet.'), { status: 401 });
  const db = serviceClient();
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData?.user) throw Object.assign(new Error('Sitzung ungültig oder abgelaufen.'), { status: 401 });
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', authData.user.id).single();
  if (error || !profile) throw Object.assign(new Error('Benutzerprofil fehlt.'), { status: 401 });
  if (profile.blocked) throw Object.assign(new Error('Dieses Konto ist gesperrt.'), { status: 403 });
  if (admin && profile.role !== 'admin') throw Object.assign(new Error('Nur für Admins.'), { status: 403 });
  return { user: authData.user, profile, token, db };
}

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readRaw(req, maxBytes = 10 * 1024 * 1024) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('Anfrage ist zu groß.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, maxBytes = 10 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req, maxBytes);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 }); }
}

export function redact(value) {
  return String(value || '')
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{10,}/g, '[OPENAI_KEY]')
    .replace(/(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+/g, '[JWT]')
    .replace(/(?:password|passwort|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 4000);
}

export async function logError({ userId = null, jobId = null, functionName, model = '', publicMessage, technicalMessage = '', retryable = false }) {
  try {
    await serviceClient().from('system_errors').insert({
      user_id: userId,
      job_id: jobId,
      function_name: String(functionName || 'unknown').slice(0, 160),
      model: String(model || '').slice(0, 100),
      public_message: String(publicMessage || 'Unbekannter Fehler').slice(0, 1000),
      technical_message: redact(technicalMessage),
      retryable: Boolean(retryable)
    });
  } catch (error) {
    console.error('System error logging failed:', redact(error?.message));
  }
}

export async function audit({ adminId, targetUserId = null, action, details = {} }) {
  await serviceClient().from('audit_logs').insert({ admin_id: adminId, target_user_id: targetUserId, action, details });
}

export async function createSignedUrl(asset, expiresIn = 3600) {
  const db = serviceClient();
  const { data, error } = await db.storage.from(asset.bucket || 'user-media').createSignedUrl(asset.storage_path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadAsset({ userId, folder, filename, buffer, mimeType, assetType, sourceType = 'upload', metadata = {}, originalName = '', sourceUrl = '', sourceProvider = '', usageRightsNote = '' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) throw new Error('Leere Datei kann nicht gespeichert werden.');
  const safeFolder = ['bilder','videos','pdf','designs','uploads'].includes(folder) ? folder : 'uploads';
  const safeName = String(filename || 'datei').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 140);
  const path = `${userId}/${safeFolder}/${Date.now()}-${safeName}`;
  const db = serviceClient();
  const { error: uploadError } = await db.storage.from('user-media').upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
    cacheControl: '3600'
  });
  if (uploadError) throw uploadError;
  const { data: asset, error } = await db.from('media_assets').insert({
    user_id: userId,
    asset_type: assetType,
    bucket: 'user-media',
    storage_path: path,
    original_name: originalName || safeName,
    mime_type: mimeType,
    size_bytes: buffer.length,
    source_type: sourceType,
    source_url: sourceUrl,
    source_provider: sourceProvider,
    usage_rights_note: usageRightsNote,
    metadata
  }).select('*').single();
  if (error) {
    await db.storage.from('user-media').remove([path]);
    throw error;
  }
  return { asset, signedUrl: await createSignedUrl(asset) };
}

export async function finishJob({ jobId, status, actualCostUsd = null, progress = null, providerJobId = null, resultAssetId = null, errorMessage = '', metadataPatch = null }) {
  const db = serviceClient();
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    error_message: String(errorMessage || '').slice(0, 2000)
  };
  if (progress != null) updates.progress = Math.max(0, Math.min(100, Number(progress)));
  if (providerJobId != null) updates.provider_job_id = String(providerJobId);
  if (resultAssetId != null) updates.result_asset_id = resultAssetId;
  if (actualCostUsd != null) updates.actual_cost_usd = Number(actualCostUsd);
  if (status === 'completed') updates.completed_at = new Date().toISOString();
  if (status === 'in_progress' || status === 'queued') updates.started_at = new Date().toISOString();
  if (metadataPatch) {
    const { data: current } = await db.from('ai_jobs').select('metadata').eq('id', jobId).single();
    updates.metadata = { ...(current?.metadata || {}), ...metadataPatch };
  }
  const { data: job, error } = await db.from('ai_jobs').update(updates).eq('id', jobId).select('*').single();
  if (error) throw error;
  const failed = ['failed','canceled','expired'].includes(status);
  const refunded = status === 'refunded';
  await db.from('usage_events').update({
    request_status: status === 'completed' ? 'completed' : failed ? (status === 'canceled' ? 'canceled' : 'failed') : 'reserved',
    billing_status: refunded ? 'refunded' : failed ? 'not_charged' : status === 'completed' ? 'charged' : 'reserved',
    actual_cost_usd: failed ? 0 : actualCostUsd,
    updated_at: new Date().toISOString()
  }).eq('job_id', jobId);
  return job;
}

export async function reserveJob(req, params) {
  const client = userClient(req);
  const { data, error } = await client.rpc('reserve_ai_job', {
    p_request_id: params.requestId,
    p_kind: params.kind,
    p_model: params.model || '',
    p_prompt: params.prompt || '',
    p_units: Number(params.units || 1),
    p_format: params.format || '',
    p_quality: params.quality || '',
    p_estimated_cost_usd: Number(params.estimatedCostUsd || 0),
    p_metadata: params.metadata || {},
    p_cost_confirmed: Boolean(params.costConfirmed)
  });
  if (error) throw Object.assign(new Error(error.message), { status: 400 });
  if (data?.error) throw Object.assign(new Error(data.error), { status: data.code === 'AUTH_REQUIRED' ? 401 : data.code === 'ACCOUNT_BLOCKED' || data.code === 'PLAN_DENIED' ? 403 : data.code === 'RATE_LIMIT' ? 429 : data.code === 'COST_CONFIRMATION_REQUIRED' ? 402 : 400, code: data.code, details: data });
  return data;
}

export async function rateLimit({ userId, endpoint, limit = 30, windowSeconds = 600, requestKey = '' }) {
  const db = serviceClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await db.from('request_events').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('endpoint', endpoint).gte('created_at', since);
  if (error) throw error;
  if ((count || 0) >= limit) throw Object.assign(new Error('Zu viele Anfragen. Bitte kurz warten.'), { status: 429 });
  await db.from('request_events').insert({ user_id: userId, endpoint, request_key: requestKey });
}

export function handleApiError(res, error, fallback = 'Die Anfrage ist fehlgeschlagen.') {
  const status = Number(error?.status || 500);
  const payload = { error: error?.message || fallback };
  if (error?.code) payload.code = error.code;
  if (error?.details?.estimatedCostUsd != null) payload.estimatedCostUsd = error.details.estimatedCostUsd;
  return send(res, status, payload);
}
