-- YILDIZ AI KOMPLETTES SUPABASE-SETUP
-- Kann auch bei einer bestehenden Installation erneut ausgeführt werden.

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

create table if not exists public.app_chat_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  chats jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_projects_owner_idx on public.app_projects(owner_id);
create index if not exists app_projects_updated_idx on public.app_projects(updated_at desc);
create index if not exists app_sessions_user_idx on public.app_sessions(user_id);
create index if not exists app_chat_state_updated_idx on public.app_chat_state(updated_at desc);

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_projects enable row level security;
alter table public.app_chat_state enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;
revoke all on public.app_projects from anon, authenticated;
revoke all on public.app_chat_state from anon, authenticated;

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
set search_path = public, private
as $$
declare
  v_id uuid;
  v_hash text;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  if length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('error', 'Das neue Passwort braucht mindestens 8 Zeichen.');
  end if;
  select password_hash into v_hash from public.app_users where id = v_id;
  if crypt(coalesce(p_current_password, ''), v_hash) <> v_hash then
    return jsonb_build_object('error', 'Das aktuelle Passwort ist falsch.');
  end if;
  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf', 12)), must_change_password = false
  where id = v_id;
  delete from public.app_sessions where user_id = v_id and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
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

create or replace function public.app_get_chat_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_chats jsonb;
  v_updated timestamptz;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;

  select chats, updated_at into v_chats, v_updated
  from public.app_chat_state
  where user_id = v_id;

  return jsonb_build_object(
    'chats', coalesce(v_chats, '[]'::jsonb),
    'updatedAt', v_updated
  );
end;
$$;

create or replace function public.app_save_chat_state(p_token text, p_chats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_updated timestamptz;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  if jsonb_typeof(coalesce(p_chats, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('error', 'Ungültige Chat-Daten.');
  end if;
  if pg_column_size(coalesce(p_chats, '[]'::jsonb)) > 25 * 1024 * 1024 then
    return jsonb_build_object('error', 'Der Chat-Verlauf ist für eine einzelne Synchronisierung zu groß. Große Videos bitte als Projekt speichern.');
  end if;

  insert into public.app_chat_state(user_id, chats, updated_at)
  values (v_id, coalesce(p_chats, '[]'::jsonb), now())
  on conflict (user_id) do update
  set chats = excluded.chats,
      updated_at = excluded.updated_at
  returning updated_at into v_updated;

  return jsonb_build_object('ok', true, 'updatedAt', v_updated);
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
  where p.owner_id = v_id;
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
  if v_project.owner_id <> v_id then return jsonb_build_object('error', 'Kein Zugriff.'); end if;
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
  if v_owner <> v_id then return jsonb_build_object('error', 'Kein Zugriff.'); end if;
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
grant execute on function public.app_get_chat_state(text) to anon, authenticated;
grant execute on function public.app_save_chat_state(text,jsonb) to anon, authenticated;
grant execute on function public.app_list_projects(text) to anon, authenticated;
grant execute on function public.app_create_project(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.app_update_project(text,uuid,text,jsonb) to anon, authenticated;
grant execute on function public.app_delete_project(text,uuid) to anon, authenticated;

-- === YILDIZ AI PRO-KERN V1: NUTZUNG UND KOSTENKONTROLLE ===
-- Yildiz AI PRO-KERN V1
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Fügt serverseitige Kostenkontrolle, Nutzungsprotokoll und Admin-Limits hinzu.

create table if not exists public.app_usage_limits (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  daily_image_limit integer not null default 20 check (daily_image_limit >= -1),
  daily_video_seconds_limit integer not null default 24 check (daily_video_seconds_limit >= -1),
  monthly_budget_usd numeric(12,4) not null default 10 check (monthly_budget_usd >= -1),
  allow_images boolean not null default true,
  allow_videos boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Bestehende Admin-Konten starten unbegrenzt; Mitarbeiter erhalten sichere Standardlimits.
insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
select id,
       case when role='admin' then -1 else 20 end,
       case when role='admin' then -1 else 24 end,
       case when role='admin' then -1 else 10 end
from public.app_users
on conflict(user_id) do nothing;

update public.app_usage_limits l
set daily_image_limit=-1, daily_video_seconds_limit=-1, monthly_budget_usd=-1, updated_at=now()
from public.app_users u
where u.id=l.user_id and u.role='admin'
  and l.daily_image_limit=20 and l.daily_video_seconds_limit=24 and l.monthly_budget_usd=10;

create table if not exists public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  model text not null default '',
  units numeric(12,3) not null default 1,
  estimated_cost_usd numeric(12,4) not null default 0,
  actual_cost_usd numeric(12,4),
  status text not null default 'reserved' check (status in ('reserved','completed','failed','cancelled')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_usage_events_user_created_idx on public.app_usage_events(user_id, created_at desc);
create index if not exists app_usage_events_kind_created_idx on public.app_usage_events(kind, created_at desc);

alter table public.app_usage_limits enable row level security;
alter table public.app_usage_events enable row level security;
revoke all on public.app_usage_limits from anon, authenticated;
revoke all on public.app_usage_events from anon, authenticated;

create or replace function public.app_authorize_ai_usage(
  p_token text,
  p_request_id uuid,
  p_kind text,
  p_model text,
  p_units numeric,
  p_estimated_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_limit public.app_usage_limits%rowtype;
  v_daily_images numeric := 0;
  v_daily_video_seconds numeric := 0;
  v_monthly_cost numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Für kostenpflichtige Bilder und Videos musst du dich anmelden.'); end if;
  if p_request_id is null then return jsonb_build_object('error', 'Request-ID fehlt.'); end if;
  if p_kind not in ('image','video') then return jsonb_build_object('error', 'Ungültige Nutzungsart.'); end if;

  -- Alte hängen gebliebene Reservierungen blockieren kein Konto dauerhaft.
  update public.app_usage_events
  set status='cancelled', actual_cost_usd=0, error='Automatisch nach 24 Stunden freigegeben.', updated_at=now()
  where status='reserved' and created_at < now() - interval '24 hours';
  if coalesce(p_units,0) <= 0 then return jsonb_build_object('error', 'Ungültige Nutzungseinheit.'); end if;
  if exists(select 1 from public.app_usage_events where request_id = p_request_id) then
    return jsonb_build_object('error', 'Diese Anfrage wurde bereits verarbeitet.');
  end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users where id=v_id
  on conflict (user_id) do nothing;

  select * into v_limit from public.app_usage_limits where user_id = v_id for update;

  select coalesce(count(*),0) into v_daily_images
  from public.app_usage_events
  where user_id = v_id and kind = 'image'
    and status in ('reserved','completed')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(units),0) into v_daily_video_seconds
  from public.app_usage_events
  where user_id = v_id and kind = 'video'
    and status in ('reserved','completed')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd)),0) into v_monthly_cost
  from public.app_usage_events
  where user_id = v_id
    and status in ('reserved','completed')
    and created_at >= date_trunc('month', now());

  if p_kind = 'image' and not v_limit.allow_images then
    return jsonb_build_object('error', 'Bildgenerierung wurde für dieses Konto deaktiviert.');
  end if;
  if p_kind = 'video' and not v_limit.allow_videos then
    return jsonb_build_object('error', 'Videogenerierung wurde für dieses Konto deaktiviert.');
  end if;
  if p_kind = 'image' and v_limit.daily_image_limit >= 0 and v_daily_images + 1 > v_limit.daily_image_limit then
    return jsonb_build_object('error', 'Dein tägliches Bildlimit ist erreicht.');
  end if;
  if p_kind = 'video' and v_limit.daily_video_seconds_limit >= 0 and v_daily_video_seconds + p_units > v_limit.daily_video_seconds_limit then
    return jsonb_build_object('error', 'Dein tägliches Video-Sekundenlimit ist erreicht.');
  end if;
  if v_limit.monthly_budget_usd >= 0 and v_monthly_cost + coalesce(p_estimated_cost_usd,0) > v_limit.monthly_budget_usd then
    return jsonb_build_object('error', 'Dein monatliches KI-Budget ist erreicht.');
  end if;

  insert into public.app_usage_events(request_id, user_id, kind, model, units, estimated_cost_usd, status)
  values (p_request_id, v_id, p_kind, left(coalesce(p_model,''),100), p_units, greatest(coalesce(p_estimated_cost_usd,0),0), 'reserved');

  return jsonb_build_object(
    'ok', true,
    'usage', jsonb_build_object(
      'dailyImages', v_daily_images + case when p_kind='image' then 1 else 0 end,
      'dailyVideoSeconds', v_daily_video_seconds + case when p_kind='video' then p_units else 0 end,
      'monthlyCostUsd', v_monthly_cost + coalesce(p_estimated_cost_usd,0)
    ),
    'limits', jsonb_build_object(
      'dailyImageLimit', v_limit.daily_image_limit,
      'dailyVideoSecondsLimit', v_limit.daily_video_seconds_limit,
      'monthlyBudgetUsd', v_limit.monthly_budget_usd,
      'allowImages', v_limit.allow_images,
      'allowVideos', v_limit.allow_videos
    )
  );
end;
$$;

create or replace function public.app_finish_ai_usage(
  p_token text,
  p_request_id uuid,
  p_status text,
  p_actual_cost_usd numeric default null,
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  if p_status not in ('completed','failed','cancelled') then return jsonb_build_object('error', 'Ungültiger Status.'); end if;

  update public.app_usage_events
  set status = p_status,
      actual_cost_usd = case when p_status in ('failed','cancelled') then 0 else coalesce(p_actual_cost_usd, estimated_cost_usd) end,
      error = left(coalesce(p_error,''),1000),
      updated_at = now()
  where request_id = p_request_id and user_id = v_id
    and (status = 'reserved' or status = p_status);

  if not found then return jsonb_build_object('error', 'Nutzungseintrag nicht gefunden oder Status bereits abgeschlossen.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_my_usage(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_limit public.app_usage_limits%rowtype;
  v_daily_images numeric := 0;
  v_daily_video_seconds numeric := 0;
  v_monthly_cost numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users where id=v_id
  on conflict(user_id) do nothing;
  select * into v_limit from public.app_usage_limits where user_id = v_id;

  select coalesce(count(*),0) into v_daily_images from public.app_usage_events
   where user_id=v_id and kind='image' and status='completed' and created_at >= date_trunc('day',now());
  select coalesce(sum(units),0) into v_daily_video_seconds from public.app_usage_events
   where user_id=v_id and kind='video' and status='completed' and created_at >= date_trunc('day',now());
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_monthly_cost from public.app_usage_events
   where user_id=v_id and status='completed' and created_at >= date_trunc('month',now());

  return jsonb_build_object(
    'usage', jsonb_build_object('dailyImages',v_daily_images,'dailyVideoSeconds',v_daily_video_seconds,'monthlyCostUsd',v_monthly_cost),
    'limits', jsonb_build_object('dailyImageLimit',v_limit.daily_image_limit,'dailyVideoSecondsLimit',v_limit.daily_video_seconds_limit,'monthlyBudgetUsd',v_limit.monthly_budget_usd,'allowImages',v_limit.allow_images,'allowVideos',v_limit.allow_videos)
  );
end;
$$;

create or replace function public.app_admin_usage(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_users jsonb;
  v_total_month numeric := 0;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users on conflict(user_id) do nothing;

  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_total_month
  from public.app_usage_events where status='completed' and created_at >= date_trunc('month',now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,
    'username',u.username::text,
    'role',u.role,
    'active',u.active,
    'limits',jsonb_build_object(
      'dailyImageLimit',l.daily_image_limit,
      'dailyVideoSecondsLimit',l.daily_video_seconds_limit,
      'monthlyBudgetUsd',l.monthly_budget_usd,
      'allowImages',l.allow_images,
      'allowVideos',l.allow_videos
    ),
    'usage',jsonb_build_object(
      'dailyImages',(select count(*) from public.app_usage_events e where e.user_id=u.id and e.kind='image' and e.status='completed' and e.created_at>=date_trunc('day',now())),
      'dailyVideoSeconds',(select coalesce(sum(e.units),0) from public.app_usage_events e where e.user_id=u.id and e.kind='video' and e.status='completed' and e.created_at>=date_trunc('day',now())),
      'monthlyCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.status='completed' and e.created_at>=date_trunc('month',now()))
    )
  ) order by u.created_at), '[]'::jsonb) into v_users
  from public.app_users u join public.app_usage_limits l on l.user_id=u.id;

  return jsonb_build_object('users',v_users,'totalMonthlyCostUsd',v_total_month);
end;
$$;

create or replace function public.app_admin_set_usage_limits(
  p_token text,
  p_user_id uuid,
  p_daily_image_limit integer,
  p_daily_video_seconds_limit integer,
  p_monthly_budget_usd numeric,
  p_allow_images boolean,
  p_allow_videos boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;
  if not exists(select 1 from public.app_users where id=p_user_id) then return jsonb_build_object('error','Konto nicht gefunden.'); end if;
  if coalesce(p_daily_image_limit,-2) < -1 or coalesce(p_daily_video_seconds_limit,-2) < -1 or coalesce(p_monthly_budget_usd,-2) < -1 then
    return jsonb_build_object('error','Limits müssen mindestens -1 sein. -1 bedeutet unbegrenzt.');
  end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd,allow_images,allow_videos,updated_at)
  values(p_user_id,p_daily_image_limit,p_daily_video_seconds_limit,p_monthly_budget_usd,coalesce(p_allow_images,true),coalesce(p_allow_videos,true),now())
  on conflict(user_id) do update set
    daily_image_limit=excluded.daily_image_limit,
    daily_video_seconds_limit=excluded.daily_video_seconds_limit,
    monthly_budget_usd=excluded.monthly_budget_usd,
    allow_images=excluded.allow_images,
    allow_videos=excluded.allow_videos,
    updated_at=now();
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.app_authorize_ai_usage(text,uuid,text,text,numeric,numeric) to anon,authenticated;
grant execute on function public.app_finish_ai_usage(text,uuid,text,numeric,text) to anon,authenticated;
grant execute on function public.app_my_usage(text) to anon,authenticated;
grant execute on function public.app_admin_usage(text) to anon,authenticated;
grant execute on function public.app_admin_set_usage_limits(text,uuid,integer,integer,numeric,boolean,boolean) to anon,authenticated;

-- Private Zuordnung externer Medienaufträge zum jeweiligen Konto.
alter table public.app_usage_events add column if not exists provider_id text not null default '';
create index if not exists app_usage_events_provider_idx on public.app_usage_events(provider_id) where provider_id <> '';

create or replace function public.app_bind_ai_provider_id(
  p_token text,
  p_request_id uuid,
  p_provider_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if nullif(trim(coalesce(p_provider_id,'')),'') is null then return jsonb_build_object('error','Provider-ID fehlt.'); end if;

  update public.app_usage_events
  set provider_id=left(trim(p_provider_id),255), updated_at=now()
  where request_id=p_request_id and user_id=v_id and kind='video'
    and (provider_id='' or provider_id=left(trim(p_provider_id),255));

  if not found then return jsonb_build_object('error','Videoauftrag gehört nicht zu diesem Konto.'); end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.app_verify_ai_usage(
  p_token text,
  p_request_id uuid,
  p_provider_id text,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if not exists(
    select 1 from public.app_usage_events
    where request_id=p_request_id and user_id=v_id and kind=p_kind
      and provider_id=left(trim(coalesce(p_provider_id,'')),255)
  ) then
    return jsonb_build_object('error','Kein Zugriff auf diesen Medienauftrag.');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.app_bind_ai_provider_id(text,uuid,text) to anon,authenticated;
grant execute on function public.app_verify_ai_usage(text,uuid,text,text) to anon,authenticated;




-- ===== PRO-KERN: Nutzung und Limits =====

-- Yildiz AI PRO-KERN V1
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Fügt serverseitige Kostenkontrolle, Nutzungsprotokoll und Admin-Limits hinzu.

create table if not exists public.app_usage_limits (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  daily_image_limit integer not null default 20 check (daily_image_limit >= -1),
  daily_video_seconds_limit integer not null default 24 check (daily_video_seconds_limit >= -1),
  monthly_budget_usd numeric(12,4) not null default 10 check (monthly_budget_usd >= -1),
  allow_images boolean not null default true,
  allow_videos boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Bestehende Admin-Konten starten unbegrenzt; Mitarbeiter erhalten sichere Standardlimits.
insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
select id,
       case when role='admin' then -1 else 20 end,
       case when role='admin' then -1 else 24 end,
       case when role='admin' then -1 else 10 end
from public.app_users
on conflict(user_id) do nothing;

update public.app_usage_limits l
set daily_image_limit=-1, daily_video_seconds_limit=-1, monthly_budget_usd=-1, updated_at=now()
from public.app_users u
where u.id=l.user_id and u.role='admin'
  and l.daily_image_limit=20 and l.daily_video_seconds_limit=24 and l.monthly_budget_usd=10;

create table if not exists public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  model text not null default '',
  units numeric(12,3) not null default 1,
  estimated_cost_usd numeric(12,4) not null default 0,
  actual_cost_usd numeric(12,4),
  status text not null default 'reserved' check (status in ('reserved','completed','failed','cancelled')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_usage_events_user_created_idx on public.app_usage_events(user_id, created_at desc);
create index if not exists app_usage_events_kind_created_idx on public.app_usage_events(kind, created_at desc);

alter table public.app_usage_limits enable row level security;
alter table public.app_usage_events enable row level security;
revoke all on public.app_usage_limits from anon, authenticated;
revoke all on public.app_usage_events from anon, authenticated;

create or replace function public.app_authorize_ai_usage(
  p_token text,
  p_request_id uuid,
  p_kind text,
  p_model text,
  p_units numeric,
  p_estimated_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_limit public.app_usage_limits%rowtype;
  v_daily_images numeric := 0;
  v_daily_video_seconds numeric := 0;
  v_monthly_cost numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Für kostenpflichtige Bilder und Videos musst du dich anmelden.'); end if;
  if p_request_id is null then return jsonb_build_object('error', 'Request-ID fehlt.'); end if;
  if p_kind not in ('image','video') then return jsonb_build_object('error', 'Ungültige Nutzungsart.'); end if;

  -- Alte hängen gebliebene Reservierungen blockieren kein Konto dauerhaft.
  update public.app_usage_events
  set status='cancelled', actual_cost_usd=0, error='Automatisch nach 24 Stunden freigegeben.', updated_at=now()
  where status='reserved' and created_at < now() - interval '24 hours';
  if coalesce(p_units,0) <= 0 then return jsonb_build_object('error', 'Ungültige Nutzungseinheit.'); end if;
  if exists(select 1 from public.app_usage_events where request_id = p_request_id) then
    return jsonb_build_object('error', 'Diese Anfrage wurde bereits verarbeitet.');
  end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users where id=v_id
  on conflict (user_id) do nothing;

  select * into v_limit from public.app_usage_limits where user_id = v_id for update;

  select coalesce(count(*),0) into v_daily_images
  from public.app_usage_events
  where user_id = v_id and kind = 'image'
    and status in ('reserved','completed')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(units),0) into v_daily_video_seconds
  from public.app_usage_events
  where user_id = v_id and kind = 'video'
    and status in ('reserved','completed')
    and created_at >= date_trunc('day', now());

  select coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd)),0) into v_monthly_cost
  from public.app_usage_events
  where user_id = v_id
    and status in ('reserved','completed')
    and created_at >= date_trunc('month', now());

  if p_kind = 'image' and not v_limit.allow_images then
    return jsonb_build_object('error', 'Bildgenerierung wurde für dieses Konto deaktiviert.');
  end if;
  if p_kind = 'video' and not v_limit.allow_videos then
    return jsonb_build_object('error', 'Videogenerierung wurde für dieses Konto deaktiviert.');
  end if;
  if p_kind = 'image' and v_limit.daily_image_limit >= 0 and v_daily_images + 1 > v_limit.daily_image_limit then
    return jsonb_build_object('error', 'Dein tägliches Bildlimit ist erreicht.');
  end if;
  if p_kind = 'video' and v_limit.daily_video_seconds_limit >= 0 and v_daily_video_seconds + p_units > v_limit.daily_video_seconds_limit then
    return jsonb_build_object('error', 'Dein tägliches Video-Sekundenlimit ist erreicht.');
  end if;
  if v_limit.monthly_budget_usd >= 0 and v_monthly_cost + coalesce(p_estimated_cost_usd,0) > v_limit.monthly_budget_usd then
    return jsonb_build_object('error', 'Dein monatliches KI-Budget ist erreicht.');
  end if;

  insert into public.app_usage_events(request_id, user_id, kind, model, units, estimated_cost_usd, status)
  values (p_request_id, v_id, p_kind, left(coalesce(p_model,''),100), p_units, greatest(coalesce(p_estimated_cost_usd,0),0), 'reserved');

  return jsonb_build_object(
    'ok', true,
    'usage', jsonb_build_object(
      'dailyImages', v_daily_images + case when p_kind='image' then 1 else 0 end,
      'dailyVideoSeconds', v_daily_video_seconds + case when p_kind='video' then p_units else 0 end,
      'monthlyCostUsd', v_monthly_cost + coalesce(p_estimated_cost_usd,0)
    ),
    'limits', jsonb_build_object(
      'dailyImageLimit', v_limit.daily_image_limit,
      'dailyVideoSecondsLimit', v_limit.daily_video_seconds_limit,
      'monthlyBudgetUsd', v_limit.monthly_budget_usd,
      'allowImages', v_limit.allow_images,
      'allowVideos', v_limit.allow_videos
    )
  );
end;
$$;

create or replace function public.app_finish_ai_usage(
  p_token text,
  p_request_id uuid,
  p_status text,
  p_actual_cost_usd numeric default null,
  p_error text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  if p_status not in ('completed','failed','cancelled') then return jsonb_build_object('error', 'Ungültiger Status.'); end if;

  update public.app_usage_events
  set status = p_status,
      actual_cost_usd = case when p_status in ('failed','cancelled') then 0 else coalesce(p_actual_cost_usd, estimated_cost_usd) end,
      error = left(coalesce(p_error,''),1000),
      updated_at = now()
  where request_id = p_request_id and user_id = v_id
    and (status = 'reserved' or status = p_status);

  if not found then return jsonb_build_object('error', 'Nutzungseintrag nicht gefunden oder Status bereits abgeschlossen.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.app_my_usage(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_limit public.app_usage_limits%rowtype;
  v_daily_images numeric := 0;
  v_daily_video_seconds numeric := 0;
  v_monthly_cost numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error', 'Nicht angemeldet.'); end if;
  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users where id=v_id
  on conflict(user_id) do nothing;
  select * into v_limit from public.app_usage_limits where user_id = v_id;

  select coalesce(count(*),0) into v_daily_images from public.app_usage_events
   where user_id=v_id and kind='image' and status='completed' and created_at >= date_trunc('day',now());
  select coalesce(sum(units),0) into v_daily_video_seconds from public.app_usage_events
   where user_id=v_id and kind='video' and status='completed' and created_at >= date_trunc('day',now());
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_monthly_cost from public.app_usage_events
   where user_id=v_id and status='completed' and created_at >= date_trunc('month',now());

  return jsonb_build_object(
    'usage', jsonb_build_object('dailyImages',v_daily_images,'dailyVideoSeconds',v_daily_video_seconds,'monthlyCostUsd',v_monthly_cost),
    'limits', jsonb_build_object('dailyImageLimit',v_limit.daily_image_limit,'dailyVideoSecondsLimit',v_limit.daily_video_seconds_limit,'monthlyBudgetUsd',v_limit.monthly_budget_usd,'allowImages',v_limit.allow_images,'allowVideos',v_limit.allow_videos)
  );
end;
$$;

create or replace function public.app_admin_usage(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_users jsonb;
  v_total_month numeric := 0;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,
         case when role='admin' then -1 else 20 end,
         case when role='admin' then -1 else 24 end,
         case when role='admin' then -1 else 10 end
  from public.app_users on conflict(user_id) do nothing;

  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_total_month
  from public.app_usage_events where status='completed' and created_at >= date_trunc('month',now());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,
    'username',u.username::text,
    'role',u.role,
    'active',u.active,
    'limits',jsonb_build_object(
      'dailyImageLimit',l.daily_image_limit,
      'dailyVideoSecondsLimit',l.daily_video_seconds_limit,
      'monthlyBudgetUsd',l.monthly_budget_usd,
      'allowImages',l.allow_images,
      'allowVideos',l.allow_videos
    ),
    'usage',jsonb_build_object(
      'dailyImages',(select count(*) from public.app_usage_events e where e.user_id=u.id and e.kind='image' and e.status='completed' and e.created_at>=date_trunc('day',now())),
      'dailyVideoSeconds',(select coalesce(sum(e.units),0) from public.app_usage_events e where e.user_id=u.id and e.kind='video' and e.status='completed' and e.created_at>=date_trunc('day',now())),
      'monthlyCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.status='completed' and e.created_at>=date_trunc('month',now()))
    )
  ) order by u.created_at), '[]'::jsonb) into v_users
  from public.app_users u join public.app_usage_limits l on l.user_id=u.id;

  return jsonb_build_object('users',v_users,'totalMonthlyCostUsd',v_total_month);
end;
$$;

create or replace function public.app_admin_set_usage_limits(
  p_token text,
  p_user_id uuid,
  p_daily_image_limit integer,
  p_daily_video_seconds_limit integer,
  p_monthly_budget_usd numeric,
  p_allow_images boolean,
  p_allow_videos boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;
  if not exists(select 1 from public.app_users where id=p_user_id) then return jsonb_build_object('error','Konto nicht gefunden.'); end if;
  if coalesce(p_daily_image_limit,-2) < -1 or coalesce(p_daily_video_seconds_limit,-2) < -1 or coalesce(p_monthly_budget_usd,-2) < -1 then
    return jsonb_build_object('error','Limits müssen mindestens -1 sein. -1 bedeutet unbegrenzt.');
  end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd,allow_images,allow_videos,updated_at)
  values(p_user_id,p_daily_image_limit,p_daily_video_seconds_limit,p_monthly_budget_usd,coalesce(p_allow_images,true),coalesce(p_allow_videos,true),now())
  on conflict(user_id) do update set
    daily_image_limit=excluded.daily_image_limit,
    daily_video_seconds_limit=excluded.daily_video_seconds_limit,
    monthly_budget_usd=excluded.monthly_budget_usd,
    allow_images=excluded.allow_images,
    allow_videos=excluded.allow_videos,
    updated_at=now();
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.app_authorize_ai_usage(text,uuid,text,text,numeric,numeric) to anon,authenticated;
grant execute on function public.app_finish_ai_usage(text,uuid,text,numeric,text) to anon,authenticated;
grant execute on function public.app_my_usage(text) to anon,authenticated;
grant execute on function public.app_admin_usage(text) to anon,authenticated;
grant execute on function public.app_admin_set_usage_limits(text,uuid,integer,integer,numeric,boolean,boolean) to anon,authenticated;

-- Private Zuordnung externer Medienaufträge zum jeweiligen Konto.
alter table public.app_usage_events add column if not exists provider_id text not null default '';
create index if not exists app_usage_events_provider_idx on public.app_usage_events(provider_id) where provider_id <> '';

create or replace function public.app_bind_ai_provider_id(
  p_token text,
  p_request_id uuid,
  p_provider_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if nullif(trim(coalesce(p_provider_id,'')),'') is null then return jsonb_build_object('error','Provider-ID fehlt.'); end if;

  update public.app_usage_events
  set provider_id=left(trim(p_provider_id),255), updated_at=now()
  where request_id=p_request_id and user_id=v_id and kind='video'
    and (provider_id='' or provider_id=left(trim(p_provider_id),255));

  if not found then return jsonb_build_object('error','Videoauftrag gehört nicht zu diesem Konto.'); end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.app_verify_ai_usage(
  p_token text,
  p_request_id uuid,
  p_provider_id text,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if not exists(
    select 1 from public.app_usage_events
    where request_id=p_request_id and user_id=v_id and kind=p_kind
      and provider_id=left(trim(coalesce(p_provider_id,'')),255)
  ) then
    return jsonb_build_object('error','Kein Zugriff auf diesen Medienauftrag.');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.app_bind_ai_provider_id(text,uuid,text) to anon,authenticated;
grant execute on function public.app_verify_ai_usage(text,uuid,text,text) to anon,authenticated;



-- ===== ADMIN-KONTROLLZENTRUM V2 =====

-- Yildiz AI – Admin-Kontrollzentrum V2
-- EINMAL vollständig im Supabase SQL Editor ausführen.
-- Enthält: App-Ansicht, sichere Passwort-Zurücksetzung, Admin-Lesezugriff auf Cloud-Chats und Audit-Protokoll.

create table if not exists public.app_global_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.app_users(id) on delete set null,
  target_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_admin_audit_created_idx on public.app_admin_audit_log(created_at desc);
create index if not exists app_admin_audit_target_idx on public.app_admin_audit_log(target_user_id, created_at desc);

alter table public.app_global_settings enable row level security;
alter table public.app_admin_audit_log enable row level security;
revoke all on public.app_global_settings from anon, authenticated;
revoke all on public.app_admin_audit_log from anon, authenticated;

insert into public.app_global_settings(id, settings)
values (1, jsonb_build_object(
  'defaultView','chat',
  'workView','projects',
  'allowGuest',true,
  'showFlyer',true,
  'showImage',true,
  'showVideo',true,
  'showWebsite',true,
  'showProjects',true,
  'announcement','',
  'maintenanceMode',false,
  'compactSidebar',false
))
on conflict (id) do nothing;

create or replace function public.app_get_ui_settings()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_settings jsonb;
begin
  select settings into v_settings from public.app_global_settings where id = 1;
  return jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb));
end;
$$;

create or replace function public.app_admin_save_ui_settings(p_token text, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_clean jsonb;
  v_default_view text;
  v_work_view text;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then
    return jsonb_build_object('error', 'Nur für Admins.');
  end if;

  v_default_view := coalesce(p_settings->>'defaultView', 'chat');
  if v_default_view not in ('chat','flyer','image','video','website','projects') then v_default_view := 'chat'; end if;
  v_work_view := coalesce(p_settings->>'workView', 'projects');
  if v_work_view not in ('flyer','image','video','website','projects') then v_work_view := 'projects'; end if;

  v_clean := jsonb_build_object(
    'defaultView', v_default_view,
    'workView', v_work_view,
    'allowGuest', coalesce((p_settings->>'allowGuest')::boolean, true),
    'showFlyer', coalesce((p_settings->>'showFlyer')::boolean, true),
    'showImage', coalesce((p_settings->>'showImage')::boolean, true),
    'showVideo', coalesce((p_settings->>'showVideo')::boolean, true),
    'showWebsite', coalesce((p_settings->>'showWebsite')::boolean, true),
    'showProjects', coalesce((p_settings->>'showProjects')::boolean, true),
    'announcement', left(coalesce(p_settings->>'announcement',''), 500),
    'maintenanceMode', coalesce((p_settings->>'maintenanceMode')::boolean, false),
    'compactSidebar', coalesce((p_settings->>'compactSidebar')::boolean, false)
  );

  insert into public.app_global_settings(id, settings, updated_by, updated_at)
  values (1, v_clean, v_admin, now())
  on conflict (id) do update
  set settings = excluded.settings,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.app_admin_audit_log(admin_id, action, details)
  values (v_admin, 'APP_VIEW_UPDATED', jsonb_build_object('settings', v_clean));

  return jsonb_build_object('ok', true, 'settings', v_clean);
end;
$$;

create or replace function public.app_admin_list_chat_accounts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_users jsonb;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then
    return jsonb_build_object('error', 'Nur für Admins.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'username', u.username::text,
    'role', u.role,
    'active', u.active,
    'chatCount', coalesce(jsonb_array_length(case when jsonb_typeof(s.chats)='array' then s.chats else '[]'::jsonb end), 0),
    'updatedAt', s.updated_at
  ) order by coalesce(s.updated_at, u.created_at) desc), '[]'::jsonb)
  into v_users
  from public.app_users u
  left join public.app_chat_state s on s.user_id = u.id;

  return jsonb_build_object('users', v_users);
end;
$$;

create or replace function public.app_admin_get_user_chats(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_username text;
  v_chats jsonb;
  v_updated timestamptz;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then
    return jsonb_build_object('error', 'Nur für Admins.');
  end if;

  select username::text into v_username from public.app_users where id = p_user_id;
  if v_username is null then return jsonb_build_object('error', 'Konto nicht gefunden.'); end if;

  select chats, updated_at into v_chats, v_updated
  from public.app_chat_state
  where user_id = p_user_id;

  insert into public.app_admin_audit_log(admin_id, target_user_id, action, details)
  values (v_admin, p_user_id, 'USER_CHATS_VIEWED', jsonb_build_object('chatCount', coalesce(jsonb_array_length(case when jsonb_typeof(v_chats)='array' then v_chats else '[]'::jsonb end),0)));

  return jsonb_build_object(
    'username', v_username,
    'chats', coalesce(v_chats, '[]'::jsonb),
    'updatedAt', v_updated
  );
end;
$$;

create or replace function public.app_admin_reset_password(p_token text, p_user_id uuid, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_admin uuid;
  v_username text;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then
    return jsonb_build_object('error', 'Nur für Admins.');
  end if;
  if length(coalesce(p_new_password,'')) < 8 then
    return jsonb_build_object('error', 'Das neue Passwort braucht mindestens 8 Zeichen.');
  end if;

  select username::text into v_username from public.app_users where id = p_user_id;
  if v_username is null then return jsonb_build_object('error', 'Konto nicht gefunden.'); end if;

  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf', 12)),
      must_change_password = true
  where id = p_user_id;

  delete from public.app_sessions where user_id = p_user_id;

  insert into public.app_admin_audit_log(admin_id, target_user_id, action, details)
  values (v_admin, p_user_id, 'PASSWORD_RESET', jsonb_build_object('username', v_username));

  return jsonb_build_object('ok', true, 'username', v_username);
end;
$$;

create or replace function public.app_admin_audit_log(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_events jsonb;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then
    return jsonb_build_object('error', 'Nur für Admins.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'action', l.action,
    'adminUsername', a.username::text,
    'targetUsername', t.username::text,
    'details', l.details,
    'createdAt', l.created_at
  ) order by l.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select * from public.app_admin_audit_log order by created_at desc limit 100
  ) l
  left join public.app_users a on a.id = l.admin_id
  left join public.app_users t on t.id = l.target_user_id;

  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.app_get_ui_settings() to anon, authenticated;
grant execute on function public.app_admin_save_ui_settings(text,jsonb) to anon, authenticated;
grant execute on function public.app_admin_list_chat_accounts(text) to anon, authenticated;
grant execute on function public.app_admin_get_user_chats(text,uuid) to anon, authenticated;
grant execute on function public.app_admin_reset_password(text,uuid,text) to anon, authenticated;
grant execute on function public.app_admin_audit_log(text) to anon, authenticated;
