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
