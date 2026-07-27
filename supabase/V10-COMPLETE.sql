-- YILDIZ AI V10 – SUPABASE AUTH, RLS, STORAGE, JOBS, BILLING UND AUDIT
-- Bei bestehender V9-Installation werden alte Tabellen nicht gelöscht.
-- Neue produktive Tabellen verwenden auth.users als Identität.

begin;

create extension if not exists pgcrypto;

-- ---------- Benutzerprofile ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  role text not null default 'user' check (role in ('admin','user')),
  blocked boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------- Hilfsfunktionen ----------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = p_user_id and role = 'admin' and blocked = false
  );
$$;

create or replace function public.is_active_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id=p_user_id and blocked=false);
$$;


create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''),'@',1)), '[^a-zA-Z0-9._-]', '', 'g')), '');
  if v_username is not null and exists(select 1 from public.profiles where username=v_username) then
    v_username := left(v_username,24) || '-' || left(new.id::text,6);
  end if;
  insert into public.profiles(id, username, display_name)
  values(new.id, v_username, nullif(new.raw_user_meta_data->>'display_name',''))
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

insert into public.profiles(id, username, display_name)
select id,
       nullif(lower(regexp_replace(split_part(coalesce(email,''),'@',1), '[^a-zA-Z0-9._-]', '', 'g')),''),
       null
from auth.users
on conflict do nothing;

-- ---------- App-, Zahlungs- und Budgeteinstellungen ----------
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id=1),
  payments_enabled boolean not null default true,
  active_payment_provider text not null default 'stripe' check (active_payment_provider in ('stripe','paypal')),
  payment_account_label text not null default '',
  prices_visible boolean not null default true,
  global_cost_prompt_mode text not null default 'always' check (global_cost_prompt_mode in ('always','account','never')),
  global_daily_budget_usd numeric(14,4) not null default -1 check (global_daily_budget_usd >= -1),
  global_monthly_budget_usd numeric(14,4) not null default 100 check (global_monthly_budget_usd >= -1),
  maintenance_mode boolean not null default false,
  allow_signup boolean not null default true,
  max_upload_mb integer not null default 25 check (max_upload_mb between 1 and 200),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.products (
  id text primary key,
  kind text not null check (kind in ('subscription','update')),
  name text not null,
  description text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'eur',
  billing_interval text check (billing_interval in ('month','year') or billing_interval is null),
  visible boolean not null default true,
  purchasable boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  stripe_price_id text not null default '',
  paypal_plan_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.products(id,kind,name,description,price_cents,billing_interval,visible,purchasable,active,sort_order,features)
values
('free','subscription','Free','Chat, Suche und lokale Entwürfe',0,'month',true,false,true,10,'{"chat":true,"search":true,"image":false,"video":false,"documents":false,"cloudProjects":false}'::jsonb),
('creator','subscription','Creator','Bilder, Dokumente und Cloud-Projekte',1990,'month',true,true,true,20,'{"chat":true,"search":true,"image":true,"video":false,"documents":true,"cloudProjects":true}'::jsonb),
('studio','subscription','Studio Pro','Bilder, Sora-Videos, Dokumente und alle Projekte',4990,'month',true,true,true,30,'{"chat":true,"search":true,"image":true,"video":true,"documents":true,"cloudProjects":true}'::jsonb),
('v10-update','update','Yildiz AI V10 Update','Einmaliger Zugang zum V10-Update',9900,null,true,true,true,40,'{"updateVersion":"10"}'::jsonb)
on conflict(id) do nothing;

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  product_id text not null default 'free' references public.products(id),
  provider text check (provider in ('stripe','paypal','manual') or provider is null),
  provider_customer_id text not null default '',
  provider_subscription_id text not null default '',
  status text not null default 'active' check (status in ('active','trialing','past_due','paused','canceled','incomplete')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscriptions(user_id,product_id,status)
select id,'free','active' from public.profiles
on conflict(user_id) do nothing;

create or replace function public.ensure_subscription()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.subscriptions(user_id,product_id,status)
  values(new.id,'free','active') on conflict(user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_profile_create_subscription on public.profiles;
create trigger on_profile_create_subscription after insert on public.profiles
for each row execute function public.ensure_subscription();

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.products(id),
  provider text not null check (provider in ('stripe','paypal','manual')),
  provider_payment_id text not null default '',
  amount_cents integer not null,
  currency text not null default 'eur',
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_hash text not null,
  successful boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_ip_idx on public.signup_attempts(ip_hash,created_at desc);
create index if not exists signup_attempts_email_idx on public.signup_attempts(email_hash,created_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  error text not null default '',
  created_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);

-- ---------- Nutzerdaten ----------
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Neuer Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check(role in ('user','assistant','system')),
  content text not null default '',
  sources jsonb not null default '[]'::jsonb,
  model text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Unbenanntes Projekt',
  project_type text not null default 'design',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  asset_type text not null check(asset_type in ('image','video','pdf','docx','xlsx','design','upload','other')),
  bucket text not null default 'user-media',
  storage_path text not null,
  original_name text not null default '',
  mime_type text not null,
  size_bytes bigint not null default 0 check(size_bytes >= 0),
  source_type text not null default 'upload' check(source_type in ('upload','ai','editor','document','video','search')),
  source_url text not null default '',
  source_provider text not null default '',
  usage_rights_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bucket,storage_path)
);

alter table public.products add column if not exists delivery_asset_id uuid references public.media_assets(id) on delete set null;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null default 'Unbenanntes Design',
  width integer not null default 1080,
  height integer not null default 1350,
  original_asset_id uuid references public.media_assets(id) on delete set null,
  current_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.design_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  design_id uuid not null references public.designs(id) on delete cascade,
  version_number integer not null,
  canvas_json jsonb not null default '{}'::jsonb,
  rendered_asset_id uuid references public.media_assets(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique(design_id,version_number)
);

create table if not exists public.websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  html text not null default '',
  css text not null default '',
  js text not null default '',
  published_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- KI-Aufträge, Kosten, Limits ----------
create table if not exists public.account_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_chat_limit integer not null default 100 check(daily_chat_limit >= -1),
  daily_image_limit integer not null default 20 check(daily_image_limit >= -1),
  daily_video_seconds_limit integer not null default 24 check(daily_video_seconds_limit >= -1),
  monthly_budget_usd numeric(14,4) not null default 20 check(monthly_budget_usd >= -1),
  cost_prompt_mode text not null default 'global' check(cost_prompt_mode in ('global','always','never')),
  allow_chat boolean not null default true,
  allow_images boolean not null default true,
  allow_videos boolean not null default true,
  allow_documents boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.account_limits(user_id,daily_chat_limit,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
select id, case when role='admin' then -1 else 100 end,
           case when role='admin' then -1 else 20 end,
           case when role='admin' then -1 else 24 end,
           case when role='admin' then -1 else 20 end
from public.profiles on conflict(user_id) do nothing;

create or replace function public.ensure_account_limits()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.account_limits(user_id,daily_chat_limit,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  values(new.id,case when new.role='admin' then -1 else 100 end,case when new.role='admin' then -1 else 20 end,case when new.role='admin' then -1 else 24 end,case when new.role='admin' then -1 else 20 end)
  on conflict(user_id) do nothing;
  return new;
end;$$;
drop trigger if exists on_profile_create_limits on public.profiles;
create trigger on_profile_create_limits after insert on public.profiles
for each row execute function public.ensure_account_limits();

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('chat','image','video','document','image_edit','search')),
  model text not null default '',
  prompt text not null default '',
  units numeric(14,3) not null default 1,
  format text not null default '',
  quality text not null default '',
  estimated_cost_usd numeric(14,6) not null default 0,
  actual_cost_usd numeric(14,6),
  status text not null default 'reserved' check(status in ('reserved','queued','in_progress','completed','failed','canceled','refunded','expired')),
  progress integer not null default 0 check(progress between 0 and 100),
  provider_job_id text not null default '',
  result_asset_id uuid references public.media_assets(id) on delete set null,
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_jobs_user_created_idx on public.ai_jobs(user_id,created_at desc);
create index if not exists ai_jobs_provider_idx on public.ai_jobs(provider_job_id) where provider_job_id<>'';

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.ai_jobs(id) on delete set null,
  request_id uuid not null,
  kind text not null check(kind in ('chat','image','video','document','image_edit','search')),
  model text not null default '',
  units numeric(14,3) not null default 1,
  quality text not null default '',
  estimated_cost_usd numeric(14,6) not null default 0,
  actual_cost_usd numeric(14,6),
  billing_status text not null default 'reserved' check(billing_status in ('reserved','charged','not_charged','refunded')),
  request_status text not null default 'reserved' check(request_status in ('reserved','completed','failed','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id)
);

create table if not exists public.request_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  request_key text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists request_events_rate_idx on public.request_events(user_id,endpoint,created_at desc);

-- ---------- Meldungen, Fehler und Audit ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  description text not null,
  related_job_id uuid references public.ai_jobs(id) on delete set null,
  status text not null default 'open' check(status in ('open','reviewing','resolved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.ai_jobs(id) on delete set null,
  function_name text not null,
  model text not null default '',
  public_message text not null,
  technical_message text not null default '',
  retryable boolean not null default false,
  resolved boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Serverseitige Reservierung ----------
create or replace function public.reserve_ai_job(
  p_request_id uuid,
  p_kind text,
  p_model text,
  p_prompt text,
  p_units numeric,
  p_format text,
  p_quality text,
  p_estimated_cost_usd numeric,
  p_metadata jsonb default '{}'::jsonb,
  p_cost_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_limit public.account_limits%rowtype;
  v_settings public.app_settings%rowtype;
  v_product public.products%rowtype;
  v_plan_id text := 'free';
  v_features jsonb := '{}'::jsonb;
  v_day timestamptz := date_trunc('day',now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_month timestamptz := date_trunc('month',now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_daily_count numeric := 0;
  v_daily_video numeric := 0;
  v_month_cost numeric := 0;
  v_global_day numeric := 0;
  v_global_month numeric := 0;
  v_need_confirm boolean := false;
  v_job public.ai_jobs%rowtype;
begin
  if v_user is null then return jsonb_build_object('error','Nicht angemeldet.','code','AUTH_REQUIRED'); end if;
  select * into v_profile from public.profiles where id=v_user;
  if v_profile.id is null or v_profile.blocked then return jsonb_build_object('error','Dieses Konto ist gesperrt.','code','ACCOUNT_BLOCKED'); end if;
  if p_request_id is null then return jsonb_build_object('error','Request-ID fehlt.','code','BAD_REQUEST'); end if;
  if p_kind not in ('chat','image','video','document','image_edit','search') then return jsonb_build_object('error','Ungültige Funktion.','code','BAD_KIND'); end if;
  if coalesce(p_units,0)<=0 then return jsonb_build_object('error','Ungültige Nutzungseinheit.','code','BAD_UNITS'); end if;

  select * into v_settings from public.app_settings where id=1;
  if v_settings.maintenance_mode and v_profile.role<>'admin' then return jsonb_build_object('error','Yildiz AI befindet sich gerade im Wartungsmodus.','code','MAINTENANCE'); end if;
  select * into v_limit from public.account_limits where user_id=v_user for update;
  if v_limit.user_id is null then
    insert into public.account_limits(user_id) values(v_user) returning * into v_limit;
  end if;

  select product_id into v_plan_id from public.subscriptions
   where user_id=v_user and status in ('active','trialing') limit 1;
  v_plan_id := coalesce(v_plan_id,'free');
  select * into v_product from public.products where id=v_plan_id and active=true;
  v_features := coalesce(v_product.features,'{}'::jsonb);

  if v_profile.role<>'admin' then
    if p_kind='chat' and (not v_limit.allow_chat or not coalesce((v_features->>'chat')::boolean,false)) then return jsonb_build_object('error','Chat ist in diesem Zugang nicht freigeschaltet.','code','PLAN_DENIED'); end if;
    if p_kind in ('image','image_edit') and (not v_limit.allow_images or not coalesce((v_features->>'image')::boolean,false)) then return jsonb_build_object('error','Bilder sind in diesem Abo nicht enthalten.','code','PLAN_DENIED'); end if;
    if p_kind='video' and (not v_limit.allow_videos or not coalesce((v_features->>'video')::boolean,false)) then return jsonb_build_object('error','Videos sind in diesem Abo nicht enthalten.','code','PLAN_DENIED'); end if;
    if p_kind='document' and (not v_limit.allow_documents or not coalesce((v_features->>'documents')::boolean,false)) then return jsonb_build_object('error','Dateierstellung ist in diesem Abo nicht enthalten.','code','PLAN_DENIED'); end if;
  end if;

  -- Idempotenz: ein Doppelklick startet nie einen zweiten Auftrag.
  if exists(select 1 from public.ai_jobs where request_id=p_request_id) then
    select * into v_job from public.ai_jobs where request_id=p_request_id;
    return jsonb_build_object('ok',true,'duplicate',true,'job',to_jsonb(v_job));
  end if;

  -- Rate Limit: maximal 30 reservierbare KI-Anfragen in 10 Minuten, Admin ausgenommen.
  if v_profile.role<>'admin' and (select count(*) from public.request_events where user_id=v_user and endpoint='ai' and created_at>now()-interval '10 minutes')>=30 then
    return jsonb_build_object('error','Zu viele Anfragen. Bitte kurz warten.','code','RATE_LIMIT');
  end if;
  insert into public.request_events(user_id,endpoint,request_key) values(v_user,'ai',p_request_id::text);

  select count(*) into v_daily_count from public.usage_events
   where user_id=v_user and kind=p_kind and request_status in ('reserved','completed') and created_at>=v_day;
  select coalesce(sum(units),0) into v_daily_video from public.usage_events
   where user_id=v_user and kind='video' and request_status in ('reserved','completed') and created_at>=v_day;
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_month_cost from public.usage_events
   where user_id=v_user and billing_status in ('reserved','charged') and created_at>=v_month;
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_global_day from public.usage_events
   where billing_status in ('reserved','charged') and created_at>=v_day;
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0) into v_global_month from public.usage_events
   where billing_status in ('reserved','charged') and created_at>=v_month;

  if v_profile.role<>'admin' then
    if p_kind='chat' and v_limit.daily_chat_limit>=0 and v_daily_count+1>v_limit.daily_chat_limit then return jsonb_build_object('error','Tägliches Chatlimit erreicht.','code','DAILY_LIMIT'); end if;
    if p_kind in ('image','image_edit') and v_limit.daily_image_limit>=0 and v_daily_count+1>v_limit.daily_image_limit then return jsonb_build_object('error','Tägliches Bildlimit erreicht.','code','DAILY_LIMIT'); end if;
    if p_kind='video' and v_limit.daily_video_seconds_limit>=0 and v_daily_video+p_units>v_limit.daily_video_seconds_limit then return jsonb_build_object('error','Tägliches Videolimit erreicht.','code','DAILY_LIMIT'); end if;
    if v_limit.monthly_budget_usd>=0 and v_month_cost+greatest(coalesce(p_estimated_cost_usd,0),0)>v_limit.monthly_budget_usd then return jsonb_build_object('error','Monatsbudget dieses Kontos erreicht.','code','ACCOUNT_BUDGET'); end if;
  end if;
  if v_settings.global_daily_budget_usd>=0 and v_global_day+greatest(coalesce(p_estimated_cost_usd,0),0)>v_settings.global_daily_budget_usd then return jsonb_build_object('error','Globales Tagesbudget erreicht.','code','GLOBAL_BUDGET'); end if;
  if v_settings.global_monthly_budget_usd>=0 and v_global_month+greatest(coalesce(p_estimated_cost_usd,0),0)>v_settings.global_monthly_budget_usd then return jsonb_build_object('error','Globales Monatsbudget erreicht.','code','GLOBAL_BUDGET'); end if;

  v_need_confirm := case
    when coalesce(p_estimated_cost_usd,0)<=0 then false
    when v_limit.cost_prompt_mode='always' then true
    when v_limit.cost_prompt_mode='never' then false
    when v_settings.global_cost_prompt_mode='always' then true
    when v_settings.global_cost_prompt_mode='never' then false
    else true
  end;
  if v_need_confirm and not coalesce(p_cost_confirmed,false) then
    return jsonb_build_object('error','Kostenbestätigung erforderlich.','code','COST_CONFIRMATION_REQUIRED','estimatedCostUsd',p_estimated_cost_usd);
  end if;

  insert into public.ai_jobs(request_id,user_id,kind,model,prompt,units,format,quality,estimated_cost_usd,status,metadata,started_at)
  values(p_request_id,v_user,p_kind,left(coalesce(p_model,''),100),left(coalesce(p_prompt,''),12000),p_units,left(coalesce(p_format,''),50),left(coalesce(p_quality,''),30),greatest(coalesce(p_estimated_cost_usd,0),0),'reserved',coalesce(p_metadata,'{}'::jsonb),now())
  returning * into v_job;

  insert into public.usage_events(user_id,job_id,request_id,kind,model,units,quality,estimated_cost_usd,billing_status,request_status)
  values(v_user,v_job.id,p_request_id,p_kind,v_job.model,p_units,v_job.quality,v_job.estimated_cost_usd,'reserved','reserved');

  return jsonb_build_object('ok',true,'duplicate',false,'job',to_jsonb(v_job),'planId',v_plan_id,'costWarningRequired',v_need_confirm);
end;
$$;

grant execute on function public.reserve_ai_job(uuid,text,text,text,numeric,text,text,numeric,jsonb,boolean) to authenticated;


-- ---------- Sichere Profilfunktionen ----------
create or replace function public.update_my_profile(p_username text, p_display_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid:=auth.uid(); v_username text:=nullif(lower(trim(p_username)),'');
begin
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if v_username is not null and v_username !~ '^[a-z0-9._-]{3,32}$' then return jsonb_build_object('error','Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.'); end if;
  if v_username is not null and exists(select 1 from public.profiles where username=v_username and id<>v_id) then return jsonb_build_object('error','Benutzername ist bereits vergeben.'); end if;
  update public.profiles set username=v_username,display_name=left(nullif(trim(p_display_name),''),120),updated_at=now() where id=v_id;
  return jsonb_build_object('ok',true);
end;$$;

grant execute on function public.update_my_profile(text,text) to authenticated;

create or replace function public.mark_password_changed()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  update public.profiles set must_change_password=false,updated_at=now() where id=auth.uid();
  return jsonb_build_object('ok',true);
end;$$;
grant execute on function public.mark_password_changed() to authenticated;

-- ---------- Admin-Sicherheitsfunktionen ----------
create or replace function public.admin_set_blocked(p_user_id uuid,p_blocked boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then return jsonb_build_object('error','Nur für Admins.'); end if;
  if p_user_id=auth.uid() and p_blocked then return jsonb_build_object('error','Das eigene Konto kann nicht gesperrt werden.'); end if;
  update public.profiles set blocked=coalesce(p_blocked,false),updated_at=now() where id=p_user_id;
  insert into public.audit_logs(admin_id,target_user_id,action,details) values(auth.uid(),p_user_id,'ACCOUNT_BLOCK_CHANGED',jsonb_build_object('blocked',p_blocked));
  return jsonb_build_object('ok',true);
end;$$;
grant execute on function public.admin_set_blocked(uuid,boolean) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.products enable row level security;
alter table public.subscriptions enable row level security;
alter table public.purchases enable row level security;
alter table public.signup_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.projects enable row level security;
alter table public.media_assets enable row level security;
alter table public.designs enable row level security;
alter table public.design_versions enable row level security;
alter table public.websites enable row level security;
alter table public.account_limits enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.usage_events enable row level security;
alter table public.request_events enable row level security;
alter table public.reports enable row level security;
alter table public.system_errors enable row level security;
alter table public.audit_logs enable row level security;

-- Profile
drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists "admin profile manage" on public.profiles;
create policy "admin profile manage" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Settings/products: lesbar, nur Admin schreibt
drop policy if exists "settings authenticated read" on public.app_settings;
create policy "settings authenticated read" on public.app_settings for select to authenticated using(true);
drop policy if exists "settings admin write" on public.app_settings;
create policy "settings admin write" on public.app_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "products visible read" on public.products;
create policy "products visible read" on public.products for select to authenticated using(visible or public.is_admin());
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Eigene Datensätze oder Admin
drop policy if exists "subscription owner read" on public.subscriptions;
create policy "subscription owner read" on public.subscriptions for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "subscription admin manage" on public.subscriptions;
create policy "subscription admin manage" on public.subscriptions for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "purchase owner read" on public.purchases;
create policy "purchase owner read" on public.purchases for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "purchase admin manage" on public.purchases;
create policy "purchase admin manage" on public.purchases for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "signup attempts admin" on public.signup_attempts;
create policy "signup attempts admin" on public.signup_attempts for select to authenticated using(public.is_admin());
drop policy if exists "payment events admin" on public.payment_events;
create policy "payment events admin" on public.payment_events for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "chats own" on public.chats;
create policy "chats own" on public.chats for all to authenticated using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
drop policy if exists "messages own" on public.chat_messages;
create policy "messages own" on public.chat_messages for all to authenticated
using(
  public.is_admin() or (
    user_id=auth.uid() and exists(select 1 from public.chats c where c.id=chat_id and c.user_id=auth.uid())
  )
)
with check(
  public.is_admin() or (
    user_id=auth.uid() and exists(select 1 from public.chats c where c.id=chat_id and c.user_id=auth.uid())
  )
);
drop policy if exists "projects own" on public.projects;
create policy "projects own" on public.projects for all to authenticated using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
drop policy if exists "assets own" on public.media_assets;
create policy "assets own" on public.media_assets for all to authenticated
using(public.is_admin() or (user_id=auth.uid() and storage_path like auth.uid()::text || '/%'))
with check(public.is_admin() or (user_id=auth.uid() and storage_path like auth.uid()::text || '/%' and source_type='upload'));
drop policy if exists "designs own" on public.designs;
create policy "designs own" on public.designs for all to authenticated
using(user_id=auth.uid() or public.is_admin())
with check(
  public.is_admin() or (
    user_id=auth.uid() and (project_id is null or exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()))
  )
);
drop policy if exists "versions own" on public.design_versions;
create policy "versions own" on public.design_versions for all to authenticated
using(
  public.is_admin() or (
    user_id=auth.uid() and exists(select 1 from public.designs d where d.id=design_id and d.user_id=auth.uid())
  )
)
with check(
  public.is_admin() or (
    user_id=auth.uid() and exists(select 1 from public.designs d where d.id=design_id and d.user_id=auth.uid())
  )
);
drop policy if exists "websites own" on public.websites;
create policy "websites own" on public.websites for all to authenticated using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());

drop policy if exists "limits own read" on public.account_limits;
create policy "limits own read" on public.account_limits for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "limits admin write" on public.account_limits;
create policy "limits admin write" on public.account_limits for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "jobs own read" on public.ai_jobs;
create policy "jobs own read" on public.ai_jobs for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "usage own read" on public.usage_events;
create policy "usage own read" on public.usage_events for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "request events admin" on public.request_events;
create policy "request events admin" on public.request_events for select to authenticated using(public.is_admin());
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "reports own read" on public.reports;
create policy "reports own read" on public.reports for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "reports admin update" on public.reports;
create policy "reports admin update" on public.reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "errors own read" on public.system_errors;
create policy "errors own read" on public.system_errors for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "errors admin update" on public.system_errors;
create policy "errors admin update" on public.system_errors for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "audit admin only" on public.audit_logs;
create policy "audit admin only" on public.audit_logs for select to authenticated using(public.is_admin());



-- Gesperrte Konten verlieren auch bei direkter Browsermanipulation den Datenzugriff.
drop policy if exists "active account profiles" on public.profiles;
create policy "active account profiles" on public.profiles as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account app_settings" on public.app_settings;
create policy "active account app_settings" on public.app_settings as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account products" on public.products;
create policy "active account products" on public.products as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account subscriptions" on public.subscriptions;
create policy "active account subscriptions" on public.subscriptions as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account purchases" on public.purchases;
create policy "active account purchases" on public.purchases as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account chats" on public.chats;
create policy "active account chats" on public.chats as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account chat_messages" on public.chat_messages;
create policy "active account chat_messages" on public.chat_messages as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account projects" on public.projects;
create policy "active account projects" on public.projects as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account media_assets" on public.media_assets;
create policy "active account media_assets" on public.media_assets as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account designs" on public.designs;
create policy "active account designs" on public.designs as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account design_versions" on public.design_versions;
create policy "active account design_versions" on public.design_versions as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account websites" on public.websites;
create policy "active account websites" on public.websites as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account account_limits" on public.account_limits;
create policy "active account account_limits" on public.account_limits as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account ai_jobs" on public.ai_jobs;
create policy "active account ai_jobs" on public.ai_jobs as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account usage_events" on public.usage_events;
create policy "active account usage_events" on public.usage_events as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account reports" on public.reports;
create policy "active account reports" on public.reports as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());
drop policy if exists "active account system_errors" on public.system_errors;
create policy "active account system_errors" on public.system_errors as restrictive for all to authenticated using(public.is_active_user()) with check(public.is_active_user());

-- ---------- Privater Storage ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('user-media','user-media',false,209715200,array[
  'image/png','image/jpeg','image/webp','image/svg+xml',
  'video/mp4','video/webm','video/quicktime','application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','text/csv','application/json','text/html','text/markdown',
  'application/zip','application/x-zip-compressed'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "storage active account" on storage.objects;
create policy "storage active account" on storage.objects as restrictive for all to authenticated
using(public.is_active_user()) with check(public.is_active_user());

drop policy if exists "storage own select" on storage.objects;
create policy "storage own select" on storage.objects for select to authenticated
using(bucket_id='user-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists "storage own insert" on storage.objects;
create policy "storage own insert" on storage.objects for insert to authenticated
with check(
  bucket_id='user-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[2] in ('bilder','videos','pdf','designs','uploads')
  and (lower(coalesce(storage.extension(name),''))<>'zip' or public.is_admin())
);
drop policy if exists "storage own update" on storage.objects;
create policy "storage own update" on storage.objects for update to authenticated
using(bucket_id='user-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))
with check(bucket_id='user-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists "storage own delete" on storage.objects;
create policy "storage own delete" on storage.objects for delete to authenticated
using(bucket_id='user-media' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));


-- ---------- Minimale Tabellenrechte; RLS bleibt zusätzlich zwingend ----------
grant select on public.profiles,public.app_settings,public.products,public.subscriptions,public.purchases,
 public.chats,public.chat_messages,public.projects,public.media_assets,public.designs,public.design_versions,
 public.websites,public.account_limits,public.ai_jobs,public.usage_events,public.reports,public.system_errors to authenticated;
grant insert,update,delete on public.chats,public.chat_messages,public.projects,public.media_assets,
 public.designs,public.design_versions,public.websites to authenticated;
grant insert on public.reports to authenticated;

commit;

select 'Yildiz AI V10 vollständig installiert.' as status;
