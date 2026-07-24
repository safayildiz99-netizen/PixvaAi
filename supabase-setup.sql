-- Yildiz AI Studio – einmal vollständig im Supabase SQL Editor ausführen.
-- Start-Login danach: admin / SafaStart2026!

create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists private;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username citext not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin','user')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  name text not null default 'Unbenanntes Projekt',
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_projects_owner_idx on public.app_projects(owner_id);
create index if not exists app_projects_updated_idx on public.app_projects(updated_at desc);
create index if not exists app_sessions_user_idx on public.app_sessions(user_id);

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_projects enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke all on public.app_projects from anon, authenticated;

insert into public.app_users (username, password_hash, role, active, must_change_password)
values ('admin', crypt('SafaStart2026!', gen_salt('bf', 12)), 'admin', true, true)
on conflict (username) do nothing;

create or replace function private.session_user_id(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select s.user_id
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
    and u.active = true
  limit 1;
$$;

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists(
    select 1 from public.app_users
    where id = p_user_id and active = true and role = 'admin'
  );
$$;

revoke all on function private.session_user_id(text) from public, anon, authenticated;
revoke all on function private.is_admin(uuid) from public, anon, authenticated;

create or replace function public.app_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user public.app_users%rowtype;
  v_token text;
begin
  delete from public.app_sessions where expires_at <= now();

  select * into v_user
  from public.app_users
  where username = trim(coalesce(p_username, ''))::citext
  limit 1;

  if v_user.id is null or not v_user.active or crypt(coalesce(p_password, ''), v_user.password_hash) <> v_user.password_hash then
    return jsonb_build_object('error', 'Benutzername oder Passwort ist falsch.');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token_hash, user_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_user.id, now() + interval '7 days');

  return jsonb_build_object(
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username::text,
      'role', v_user.role,
      'active', v_user.active,
      'mustChangePassword', v_user.must_change_password,
      'createdAt', v_user.created_at
    )
  );
end;
$$;

create or replace function public.app_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_user public.app_users%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Sitzung ungültig oder abgelaufen.'); end if;
  select * into v_user from public.app_users where id = v_id;
  return jsonb_build_object('user', jsonb_build_object(
    'id', v_user.id,
    'username', v_user.username::text,
    'role', v_user.role,
    'active', v_user.active,
    'mustChangePassword', v_user.must_change_password,
    'createdAt', v_user.created_at
  ));
end;
$$;

create or replace function public.app_change_password(
  p_token text,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_id uuid;
  v_hash text;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then
    return jsonb_build_object('error', 'Nicht angemeldet oder Sitzung abgelaufen.');
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('error', 'Das neue Passwort braucht mindestens 8 Zeichen.');
  end if;

  select password_hash into v_hash
  from public.app_users
  where id = v_id and active = true;

  if v_hash is null or extensions.crypt(coalesce(p_current_password, ''), v_hash) <> v_hash then
    return jsonb_build_object('error', 'Das aktuelle Passwort ist falsch.');
  end if;

  update public.app_users
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      must_change_password = false
  where id = v_id;

  delete from public.app_sessions
  where user_id = v_id
    and token_hash <> encode(
      extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'),
      'hex'
    );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_list_users(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_users jsonb;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null or not private.is_admin(v_id) then return jsonb_build_object('error', 'Nur für Admins.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'username', u.username::text,
    'role', u.role,
    'active', u.active,
    'mustChangePassword', u.must_change_password,
    'createdAt', u.created_at
  ) order by u.created_at), '[]'::jsonb)
  into v_users from public.app_users u;
  return jsonb_build_object('users', v_users);
end;
$$;

create or replace function public.app_create_user(
  p_token text,
  p_username text,
  p_password text,
  p_role text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_user public.app_users%rowtype;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error', 'Nur für Admins.'); end if;
  if trim(coalesce(p_username, '')) !~ '^[A-Za-z0-9._-]{3,32}$' then
    return jsonb_build_object('error', 'Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.');
  end if;
  if length(coalesce(p_password, '')) < 8 then return jsonb_build_object('error', 'Passwort braucht mindestens 8 Zeichen.'); end if;
  if exists(select 1 from public.app_users where username = trim(p_username)::citext) then
    return jsonb_build_object('error', 'Benutzername ist bereits vergeben.');
  end if;
  insert into public.app_users(username, password_hash, role)
  values (trim(p_username), crypt(p_password, gen_salt('bf', 12)), case when p_role = 'admin' then 'admin' else 'user' end)
  returning * into v_user;
  return jsonb_build_object('user', jsonb_build_object(
    'id', v_user.id, 'username', v_user.username::text, 'role', v_user.role,
    'active', v_user.active, 'mustChangePassword', v_user.must_change_password,
    'createdAt', v_user.created_at
  ));
end;
$$;

create or replace function public.app_set_user_active(p_token text, p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error', 'Nur für Admins.'); end if;
  if p_user_id = v_admin then return jsonb_build_object('error', 'Das eigene Konto kann hier nicht deaktiviert werden.'); end if;
  update public.app_users set active = coalesce(p_active, false) where id = p_user_id;
  if not found then return jsonb_build_object('error', 'Konto nicht gefunden.'); end if;
  if not p_active then delete from public.app_sessions where user_id = p_user_id; end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_list_projects(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_projects jsonb;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'ownerId', p.owner_id,
    'name', p.name,
    'type', p.type,
    'data', p.data,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  ) order by p.updated_at desc), '[]'::jsonb)
  into v_projects
  from public.app_projects p
  where p.owner_id = v_id or private.is_admin(v_id);
  return jsonb_build_object('projects', v_projects);
end;
$$;

create or replace function public.app_create_project(
  p_token text,
  p_name text,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_project public.app_projects%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  insert into public.app_projects(owner_id, name, type, data)
  values (v_id, left(coalesce(nullif(trim(p_name), ''), 'Unbenanntes Projekt'), 100), left(coalesce(p_type, 'design'), 30), coalesce(p_data, '{}'::jsonb))
  returning * into v_project;
  return jsonb_build_object('project', jsonb_build_object(
    'id', v_project.id, 'ownerId', v_project.owner_id, 'name', v_project.name,
    'type', v_project.type, 'data', v_project.data,
    'createdAt', v_project.created_at, 'updatedAt', v_project.updated_at
  ));
end;
$$;

create or replace function public.app_update_project(
  p_token text,
  p_project_id uuid,
  p_name text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_project public.app_projects%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  select * into v_project from public.app_projects where id = p_project_id;
  if v_project.id is null then return jsonb_build_object('error', 'Projekt nicht gefunden.'); end if;
  if v_project.owner_id <> v_id and not private.is_admin(v_id) then return jsonb_build_object('error', 'Kein Zugriff.'); end if;
  update public.app_projects
  set name = left(coalesce(nullif(trim(p_name), ''), name), 100),
      data = coalesce(p_data, data),
      updated_at = now()
  where id = p_project_id
  returning * into v_project;
  return jsonb_build_object('project', jsonb_build_object(
    'id', v_project.id, 'ownerId', v_project.owner_id, 'name', v_project.name,
    'type', v_project.type, 'data', v_project.data,
    'createdAt', v_project.created_at, 'updatedAt', v_project.updated_at
  ));
end;
$$;

create or replace function public.app_delete_project(p_token text, p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  select owner_id into v_owner from public.app_projects where id = p_project_id;
  if v_owner is null then return jsonb_build_object('error', 'Projekt nicht gefunden.'); end if;
  if v_owner <> v_id and not private.is_admin(v_id) then return jsonb_build_object('error', 'Kein Zugriff.'); end if;
  delete from public.app_projects where id = p_project_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.app_login(text,text) to anon, authenticated;
grant execute on function public.app_me(text) to anon, authenticated;
grant execute on function public.app_change_password(text,text,text) to anon, authenticated;
grant execute on function public.app_list_users(text) to anon, authenticated;
grant execute on function public.app_create_user(text,text,text,text) to anon, authenticated;
grant execute on function public.app_set_user_active(text,uuid,boolean) to anon, authenticated;
grant execute on function public.app_list_projects(text) to anon, authenticated;
grant execute on function public.app_create_project(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.app_update_project(text,uuid,text,jsonb) to anon, authenticated;
grant execute on function public.app_delete_project(text,uuid) to anon, authenticated;
