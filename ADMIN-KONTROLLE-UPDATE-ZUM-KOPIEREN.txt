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
