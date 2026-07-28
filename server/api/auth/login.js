import { createClient } from '@supabase/supabase-js';
import { handleApiError, readJson, send, serviceClient, supabaseAnonKey, supabaseUrl } from '../_lib.js';

function genericLoginError() {
  return Object.assign(new Error('Benutzername, E-Mail oder Passwort ist falsch.'), { status: 401 });
}

async function resolveEmail(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) throw genericLoginError();
  if (clean.includes('@')) return clean.toLowerCase();

  if (!/^[A-Za-z0-9._-]{3,32}$/.test(clean)) throw genericLoginError();

  const db = serviceClient();
  const { data: profile, error } = await db
    .from('profiles')
    .select('id,username,blocked')
    .ilike('username', clean)
    .maybeSingle();

  if (error || !profile || profile.blocked) throw genericLoginError();

  const { data, error: authError } = await db.auth.admin.getUserById(profile.id);
  const email = data?.user?.email;
  if (authError || !email) throw genericLoginError();
  return String(email).toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });

  try {
    const body = await readJson(req, 64 * 1024);
    const identifier = String(body?.identifier || body?.email || '').trim();
    const password = String(body?.password || '');

    if (!identifier || !password) throw genericLoginError();

    const email = await resolveEmail(identifier);
    const url = supabaseUrl();
    const key = supabaseAnonKey();
    if (!url || !key) throw new Error('Supabase Client-Variablen fehlen.');

    const authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data?.session || !data?.user) throw genericLoginError();

    const db = serviceClient();
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id,username,display_name,role,blocked,must_change_password')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile || profile.blocked) throw genericLoginError();

    return send(res, 200, {
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type
      },
      user: {
        id: data.user.id,
        username: profile.username,
        displayName: profile.display_name,
        role: profile.role,
        mustChangePassword: profile.must_change_password
      }
    });
  } catch (error) {
    return handleApiError(res, error, 'Anmeldung fehlgeschlagen.');
  }
}
