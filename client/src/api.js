import { supabase } from './supabase.js';

export function getToken() {
  return localStorage.getItem('yildiz_ai_token') || '';
}

export function setToken(token) {
  if (token) localStorage.setItem('yildiz_ai_token', token);
  else localStorage.removeItem('yildiz_ai_token');
}

function parseBody(options) {
  if (!options?.body) return {};
  if (typeof options.body === 'string') {
    try { return JSON.parse(options.body); } catch { return {}; }
  }
  return options.body;
}

async function rpc(name, args = {}) {
  if (!supabase) throw new Error('Supabase ist noch nicht verbunden. Prüfe die Vercel Environment Variables.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'Datenbankfehler.');
  if (data?.error) throw new Error(data.error);
  return data;
}

async function callServer(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data?.error || data || `Fehler ${response.status}`);
  return data;
}

export async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = parseBody(options);
  const token = getToken();

  if (path.startsWith('/api/ai/') || path === '/api/settings' || path === '/api/video/merge') {
    return callServer(path, options);
  }

  if (path === '/api/auth/login' && method === 'POST') {
    return rpc('app_login', { p_username: body.username, p_password: body.password });
  }
  if (path === '/api/me' && method === 'GET') {
    return rpc('app_me', { p_token: token });
  }
  if (path === '/api/auth/change-password' && method === 'POST') {
    return rpc('app_change_password', {
      p_token: token,
      p_current_password: body.currentPassword,
      p_new_password: body.newPassword
    });
  }
  if (path === '/api/users' && method === 'GET') {
    return rpc('app_list_users', { p_token: token });
  }
  if (path === '/api/users' && method === 'POST') {
    return rpc('app_create_user', {
      p_token: token,
      p_username: body.username,
      p_password: body.password,
      p_role: body.role
    });
  }
  const userMatch = path.match(/^\/api\/users\/([0-9a-f-]+)$/i);
  if (userMatch && method === 'PATCH') {
    return rpc('app_set_user_active', {
      p_token: token,
      p_user_id: userMatch[1],
      p_active: Boolean(body.active)
    });
  }

  if (path === '/api/projects' && method === 'GET') {
    return rpc('app_list_projects', { p_token: token });
  }
  if (path === '/api/projects' && method === 'POST') {
    return rpc('app_create_project', {
      p_token: token,
      p_name: body.name,
      p_type: body.type,
      p_data: body.data || {}
    });
  }
  const projectMatch = path.match(/^\/api\/projects\/([0-9a-f-]+)$/i);
  if (projectMatch && method === 'PUT') {
    return rpc('app_update_project', {
      p_token: token,
      p_project_id: projectMatch[1],
      p_name: body.name,
      p_data: body.data || {}
    });
  }
  if (projectMatch && method === 'DELETE') {
    return rpc('app_delete_project', {
      p_token: token,
      p_project_id: projectMatch[1]
    });
  }

  throw new Error(`Unbekannte Funktion: ${method} ${path}`);
}

export function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
