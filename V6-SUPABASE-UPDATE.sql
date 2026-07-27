-- YILDIZ AI V6 – BETA-ABOS, PLANZUGRIFF UND DATENKONTROLLE
-- Kann mehrfach ausgeführt werden.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Behebt bei bestehenden Installationen den Fehler:
-- function crypt(text, text) does not exist
do $$
declare
  v_pgcrypto_schema text;
  v_path text;
begin
  select n.nspname into v_pgcrypto_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_pgcrypto_schema is not null then
    v_path := format('pg_catalog, public, private, %I', v_pgcrypto_schema);
    if to_regprocedure('public.app_login(text,text)') is not null then
      execute 'alter function public.app_login(text,text) set search_path = ' || v_path;
    end if;
    if to_regprocedure('public.app_change_password(text,text,text)') is not null then
      execute 'alter function public.app_change_password(text,text,text) set search_path = ' || v_path;
    end if;
    if to_regprocedure('public.app_create_user(text,text,text,text)') is not null then
      execute 'alter function public.app_create_user(text,text,text,text) set search_path = ' || v_path;
    end if;
    if to_regprocedure('public.app_admin_reset_password(text,uuid,text)') is not null then
      execute 'alter function public.app_admin_reset_password(text,uuid,text) set search_path = ' || v_path;
    end if;
  end if;
end
$$;

create table if not exists public.app_subscriptions (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  plan_id text not null default 'free' check (plan_id in ('free','creator','studio')),
  status text not null default 'active' check (status in ('active','canceled')),
  beta boolean not null default true,
  started_at timestamptz not null default now(),
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists app_subscriptions_plan_idx on public.app_subscriptions(plan_id, status);
alter table public.app_subscriptions enable row level security;
revoke all on public.app_subscriptions from anon, authenticated;

insert into public.app_subscriptions(user_id, plan_id, status, beta)
select id, case when role='admin' then 'studio' else 'free' end, 'active', true
from public.app_users
on conflict (user_id) do nothing;

-- Neue Konten erhalten automatisch Free.
create or replace function private.ensure_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.app_subscriptions(user_id, plan_id, status, beta)
  values (p_user_id, case when private.is_admin(p_user_id) then 'studio' else 'free' end, 'active', true)
  on conflict (user_id) do nothing;
end;
$$;
revoke all on function private.ensure_subscription(uuid) from public, anon, authenticated;

create or replace function public.app_my_subscription(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_role text;
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  perform private.ensure_subscription(v_id);
  select role into v_role from public.app_users where id=v_id;
  select * into v_row from public.app_subscriptions where user_id=v_id;
  if v_role='admin' then
    v_row.plan_id := 'studio';
    v_row.status := 'active';
  end if;
  return jsonb_build_object('subscription',jsonb_build_object(
    'planId',v_row.plan_id,
    'status',v_row.status,
    'beta',v_row.beta,
    'startedAt',v_row.started_at,
    'canceledAt',v_row.canceled_at,
    'updatedAt',v_row.updated_at,
    'adminOverride',(v_role='admin')
  ));
end;
$$;

create or replace function public.app_beta_select_plan(p_token text, p_plan_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_role text;
  v_plan text := lower(trim(coalesce(p_plan_id,'')));
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if v_plan not in ('free','creator','studio') then return jsonb_build_object('error','Unbekanntes Abo.'); end if;
  select role into v_role from public.app_users where id=v_id;
  if v_role='admin' then v_plan := 'studio'; end if;

  insert into public.app_subscriptions(user_id,plan_id,status,beta,started_at,canceled_at,updated_at)
  values(v_id,v_plan,'active',true,now(),null,now())
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,status='active',beta=true,
    started_at=case when public.app_subscriptions.plan_id<>excluded.plan_id then now() else public.app_subscriptions.started_at end,
    canceled_at=null,updated_at=now();

  select * into v_row from public.app_subscriptions where user_id=v_id;
  return jsonb_build_object('ok',true,'charged',false,'subscription',jsonb_build_object(
    'planId',v_row.plan_id,'status',v_row.status,'beta',v_row.beta,
    'startedAt',v_row.started_at,'canceledAt',v_row.canceled_at,'updatedAt',v_row.updated_at
  ));
end;
$$;

create or replace function public.app_cancel_subscription(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_role text;
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select role into v_role from public.app_users where id=v_id;
  if v_role='admin' then return jsonb_build_object('error','Admin-Vollzugriff kann nicht gekündigt werden.'); end if;
  perform private.ensure_subscription(v_id);
  update public.app_subscriptions set plan_id='free',status='active',canceled_at=now(),updated_at=now() where user_id=v_id;
  select * into v_row from public.app_subscriptions where user_id=v_id;
  return jsonb_build_object('ok',true,'charged',false,'subscription',jsonb_build_object(
    'planId',v_row.plan_id,'status',v_row.status,'beta',v_row.beta,
    'startedAt',v_row.started_at,'canceledAt',v_row.canceled_at,'updatedAt',v_row.updated_at
  ));
end;
$$;

create or replace function public.app_plan_access(p_token text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_role text;
  v_plan text;
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_allowed boolean := false;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('allowed',false,'error','Nicht angemeldet.'); end if;
  select role into v_role from public.app_users where id=v_id;
  perform private.ensure_subscription(v_id);
  select plan_id into v_plan from public.app_subscriptions where user_id=v_id;
  if v_role='admin' then v_plan:='studio'; end if;
  v_allowed := case
    when v_role='admin' then true
    when v_kind='image' then v_plan in ('creator','studio')
    when v_kind='video' then v_plan='studio'
    else true
  end;
  return jsonb_build_object(
    'allowed',v_allowed,
    'planId',v_plan,
    'error',case when v_allowed then null when v_kind='video' then 'Sora-Videos sind im Studio-Pro-Zugang enthalten. Während der Beta kannst du ihn für 0,00 € aktivieren.' else 'OpenAI-Bilder sind ab Creator enthalten. Während der Beta kannst du Creator für 0,00 € aktivieren.' end
  );
end;
$$;

create or replace function public.app_admin_subscription_overview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_users jsonb;
  v_summary jsonb;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;
  insert into public.app_subscriptions(user_id,plan_id,status,beta)
  select id,case when role='admin' then 'studio' else 'free' end,'active',true from public.app_users
  on conflict(user_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'username',u.username::text,'role',u.role,
    'planId',case when u.role='admin' then 'studio' else s.plan_id end,
    'status','active','beta',true,'updatedAt',s.updated_at
  ) order by u.created_at),'[]'::jsonb)
  into v_users
  from public.app_users u join public.app_subscriptions s on s.user_id=u.id;

  select jsonb_build_object(
    'free',count(*) filter(where u.role<>'admin' and s.plan_id='free'),
    'creator',count(*) filter(where u.role<>'admin' and s.plan_id='creator'),
    'studio',count(*) filter(where s.plan_id='studio' or u.role='admin')
  ) into v_summary
  from public.app_users u join public.app_subscriptions s on s.user_id=u.id;

  return jsonb_build_object('users',v_users,'summary',v_summary,'beta',true,'paymentsEnabled',false);
end;
$$;

create or replace function public.app_admin_set_subscription(p_token text,p_user_id uuid,p_plan_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin uuid;
  v_plan text:=lower(trim(coalesce(p_plan_id,'')));
  v_role text;
begin
  v_admin:=private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;
  if v_plan not in ('free','creator','studio') then return jsonb_build_object('error','Unbekanntes Abo.'); end if;
  select role into v_role from public.app_users where id=p_user_id;
  if v_role is null then return jsonb_build_object('error','Konto nicht gefunden.'); end if;
  if v_role='admin' then v_plan:='studio'; end if;
  insert into public.app_subscriptions(user_id,plan_id,status,beta,started_at,canceled_at,updated_at)
  values(p_user_id,v_plan,'active',true,now(),null,now())
  on conflict(user_id) do update set plan_id=excluded.plan_id,status='active',beta=true,canceled_at=null,updated_at=now();
  if to_regclass('public.app_admin_audit_log') is not null then
    insert into public.app_admin_audit_log(admin_id,target_user_id,action,details)
    values(v_admin,p_user_id,'subscription_changed',jsonb_build_object('planId',v_plan,'charged',false,'beta',true));
  end if;
  return jsonb_build_object('ok',true,'planId',v_plan,'charged',false);
end;
$$;

create or replace function public.app_export_my_data(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_user jsonb;
  v_subscription jsonb;
  v_chats jsonb;
  v_projects jsonb;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  perform private.ensure_subscription(v_id);
  select jsonb_build_object('id',id,'username',username::text,'role',role,'active',active,'createdAt',created_at) into v_user from public.app_users where id=v_id;
  select jsonb_build_object('planId',plan_id,'status',status,'beta',beta,'startedAt',started_at,'canceledAt',canceled_at,'updatedAt',updated_at) into v_subscription from public.app_subscriptions where user_id=v_id;
  select coalesce(chats,'[]'::jsonb) into v_chats from public.app_chat_state where user_id=v_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'data',data,'createdAt',created_at,'updatedAt',updated_at) order by updated_at desc),'[]'::jsonb) into v_projects from public.app_projects where owner_id=v_id;
  return jsonb_build_object('exportedAt',now(),'user',v_user,'subscription',v_subscription,'chats',coalesce(v_chats,'[]'::jsonb),'projects',v_projects);
end;
$$;

create or replace function public.app_delete_my_chats(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare v_id uuid;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  insert into public.app_chat_state(user_id,chats,updated_at) values(v_id,'[]'::jsonb,now())
  on conflict(user_id) do update set chats='[]'::jsonb,updated_at=now();
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.app_delete_my_projects(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare v_id uuid; v_count integer;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  delete from public.app_projects where owner_id=v_id;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'deleted',v_count);
end;
$$;

-- Ergänzt die globale UI-Konfiguration, ohne bestehende Anpassungen zu löschen.
do $$
declare v_settings jsonb;
begin
  if to_regclass('public.app_global_settings') is not null then
    select settings into v_settings from public.app_global_settings where id=1;
    if v_settings is not null then
      update public.app_global_settings
      set settings = settings || jsonb_build_object('showPlans',true), updated_at=now()
      where id=1;
    end if;
  end if;
end
$$;


-- Serverseitige Projektregeln: Free keine Cloud-Projekte, Creator bis 30 und ohne Video/Website, Studio Pro alle.
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
  v_role text;
  v_plan text;
  v_count integer;
  v_type text:=left(lower(coalesce(p_type,'design')),30);
  v_project public.app_projects%rowtype;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select role into v_role from public.app_users where id=v_id;
  perform private.ensure_subscription(v_id);
  select plan_id into v_plan from public.app_subscriptions where user_id=v_id;
  if v_role='admin' then v_plan:='studio'; end if;
  if v_plan='free' then return jsonb_build_object('error','Cloud-Projekte sind ab Creator enthalten. Während der Beta kannst du Creator für 0,00 € aktivieren.'); end if;
  if v_type in ('video','website') and v_plan<>'studio' then return jsonb_build_object('error','Video- und Website-Projekte sind im Studio-Pro-Zugang enthalten.'); end if;
  if v_plan='creator' then
    select count(*) into v_count from public.app_projects where owner_id=v_id;
    if v_count>=30 then return jsonb_build_object('error','Das Creator-Limit von 30 Cloud-Projekten ist erreicht.'); end if;
  end if;
  insert into public.app_projects(owner_id,name,type,data)
  values(v_id,left(coalesce(nullif(trim(p_name),''),'Unbenanntes Projekt'),100),v_type,coalesce(p_data,'{}'::jsonb))
  returning * into v_project;
  return jsonb_build_object('project',jsonb_build_object(
    'id',v_project.id,'ownerId',v_project.owner_id,'name',v_project.name,'type',v_project.type,'data',v_project.data,
    'createdAt',v_project.created_at,'updatedAt',v_project.updated_at
  ));
end;
$$;

grant execute on function public.app_create_project(text,text,text,jsonb) to anon,authenticated;

grant execute on function public.app_my_subscription(text) to anon,authenticated;
grant execute on function public.app_beta_select_plan(text,text) to anon,authenticated;
grant execute on function public.app_cancel_subscription(text) to anon,authenticated;
grant execute on function public.app_plan_access(text,text) to anon,authenticated;
grant execute on function public.app_admin_subscription_overview(text) to anon,authenticated;
grant execute on function public.app_admin_set_subscription(text,uuid,text) to anon,authenticated;
grant execute on function public.app_export_my_data(text) to anon,authenticated;
grant execute on function public.app_delete_my_chats(text) to anon,authenticated;
grant execute on function public.app_delete_my_projects(text) to anon,authenticated;

select 'Yildiz AI V6 erfolgreich installiert: Login-Fix, Beta-Abos, Zugriffe und Datenkontrolle.' as status;
