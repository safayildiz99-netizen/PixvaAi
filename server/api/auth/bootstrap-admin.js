import { timingSafeEqual } from 'node:crypto';
import { handleApiError, readJson, send, serviceClient } from '../_lib.js';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function findAuthUserByEmail(db, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (found) return found;
    if (users.length < 100) break;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST ist erlaubt.' });

  try {
    const configuredSecret = String(process.env.ADMIN_SETUP_SECRET || '');
    if (configuredSecret.length < 16) {
      return send(res, 503, {
        error: 'ADMIN_SETUP_SECRET fehlt oder ist zu kurz. Lege zuerst in Vercel ein geheimes Setup-Passwort mit mindestens 16 Zeichen an.'
      });
    }

    const body = await readJson(req, 64 * 1024);
    const providedSecret = String(body?.setupSecret || '');
    if (!safeEqual(configuredSecret, providedSecret)) {
      return send(res, 403, { error: 'Das Setup-Passwort ist falsch.' });
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!validEmail(email)) return send(res, 400, { error: 'Bitte eine gültige Admin-E-Mail eingeben.' });
    if (password.length < 10) return send(res, 400, { error: 'Das Admin-Passwort braucht mindestens 10 Zeichen.' });

    const db = serviceClient();
    const { data: existingProfile, error: profileLookupError } = await db
      .from('profiles')
      .select('id,username,role')
      .ilike('username', 'admin')
      .maybeSingle();

    if (profileLookupError) throw profileLookupError;

    let userId = existingProfile?.id || null;
    let authUser = null;

    if (userId) {
      const { data, error } = await db.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { username: 'admin', display_name: 'Administrator' }
      });
      if (error) throw error;
      authUser = data.user;
    } else {
      authUser = await findAuthUserByEmail(db, email);
      if (authUser) {
        userId = authUser.id;
        const { data, error } = await db.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { username: 'admin', display_name: 'Administrator' }
        });
        if (error) throw error;
        authUser = data.user;
      } else {
        const { data, error } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: 'admin', display_name: 'Administrator' }
        });
        if (error) throw error;
        authUser = data.user;
        userId = authUser.id;
      }
    }

    const { error: upsertError } = await db.from('profiles').upsert({
      id: userId,
      username: 'admin',
      display_name: 'Administrator',
      role: 'admin',
      blocked: false,
      must_change_password: false,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (upsertError) throw upsertError;

    return send(res, 200, {
      ok: true,
      username: 'admin',
      email: authUser?.email || email,
      message: 'Der Admin-Account wurde eingerichtet. Du kannst dich jetzt mit admin oder der Admin-E-Mail anmelden.'
    });
  } catch (error) {
    return handleApiError(res, error, 'Admin-Account konnte nicht eingerichtet werden.');
  }
}
