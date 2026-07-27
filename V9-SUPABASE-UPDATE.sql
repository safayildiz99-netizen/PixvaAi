begin;

-- Flexible Beta-Abos: die alte feste 3-Abo-Prüfung entfernen.
do $do$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.app_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan_id%'
  loop
    execute format('alter table public.app_subscriptions drop constraint if exists %I', r.conname);
  end loop;
end
$do$;

create or replace function private.plan_exists(p_plan text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan,'')));
  v_settings jsonb := '{}'::jsonb;
begin
  if v_plan in ('free','creator','studio') then return true; end if;
  select coalesce(settings,'{}'::jsonb) into v_settings from public.app_global_settings where id=1;
  return exists(
    select 1
    from jsonb_array_elements(case when jsonb_typeof(v_settings->'customPlans')='array' then v_settings->'customPlans' else '[]'::jsonb end) item
    where lower(trim(item->>'id')) = v_plan
  );
end;
$$;
revoke all on function private.plan_exists(text) from public, anon, authenticated;

create or replace function private.plan_access_json(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_plan text := lower(trim(coalesce(p_plan,'')));
  v_settings jsonb := '{}'::jsonb;
  v_access jsonb;
begin
  if v_plan='free' then
    return '{"chat":true,"freeImageSearch":true,"files":true,"flyer":false,"image":false,"paidImages":false,"video":false,"paidVideos":false,"website":false,"projects":false}'::jsonb;
  elsif v_plan='creator' then
    return '{"chat":true,"freeImageSearch":true,"files":true,"flyer":true,"image":true,"paidImages":true,"video":false,"paidVideos":false,"website":false,"projects":true}'::jsonb;
  elsif v_plan='studio' then
    return '{"chat":true,"freeImageSearch":true,"files":true,"flyer":true,"image":true,"paidImages":true,"video":true,"paidVideos":true,"website":true,"projects":true}'::jsonb;
  end if;

  select coalesce(settings,'{}'::jsonb) into v_settings from public.app_global_settings where id=1;
  select item->'access' into v_access
  from jsonb_array_elements(case when jsonb_typeof(v_settings->'customPlans')='array' then v_settings->'customPlans' else '[]'::jsonb end) item
  where lower(trim(item->>'id')) = v_plan
  limit 1;
  return coalesce(v_access,'{}'::jsonb);
end;
$$;
revoke all on function private.plan_access_json(text) from public, anon, authenticated;

-- Neue Konten starten mit Free; auch Admins können in der Beta jeden Plan auswählen.
create or replace function private.ensure_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.app_subscriptions(user_id, plan_id, status, beta)
  values (p_user_id, 'free', 'active', true)
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
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  perform private.ensure_subscription(v_id);
  select * into v_row from public.app_subscriptions where user_id=v_id;
  if not private.plan_exists(v_row.plan_id) then
    update public.app_subscriptions set plan_id='free',status='active',updated_at=now() where user_id=v_id;
    select * into v_row from public.app_subscriptions where user_id=v_id;
  end if;
  return jsonb_build_object('subscription',jsonb_build_object(
    'planId',v_row.plan_id,
    'status',v_row.status,
    'beta',v_row.beta,
    'startedAt',v_row.started_at,
    'canceledAt',v_row.canceled_at,
    'updatedAt',v_row.updated_at,
    'adminOverride',false
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
  v_plan text := lower(trim(coalesce(p_plan_id,'')));
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if not private.plan_exists(v_plan) then return jsonb_build_object('error','Unbekanntes oder noch nicht gespeichertes Abo.'); end if;

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
  v_row public.app_subscriptions%rowtype;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
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
  v_access jsonb;
  v_allowed boolean := false;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('allowed',false,'error','Nicht angemeldet.'); end if;
  select role into v_role from public.app_users where id=v_id;
  perform private.ensure_subscription(v_id);
  select plan_id into v_plan from public.app_subscriptions where user_id=v_id;
  if not private.plan_exists(v_plan) then v_plan:='free'; end if;
  v_access := private.plan_access_json(v_plan);
  v_allowed := case
    when v_role='admin' then true
    when v_kind='image' then coalesce((v_access->>'paidImages')::boolean,false)
    when v_kind='video' then coalesce((v_access->>'paidVideos')::boolean,false)
    else true
  end;
  return jsonb_build_object(
    'allowed',v_allowed,
    'planId',v_plan,
    'error',case when v_allowed then null when v_kind='video' then 'Sora-Videos sind in diesem Abo nicht enthalten. Aktiviere in der Beta kostenlos einen passenden Zugang.' else 'OpenAI-Bilder sind in diesem Abo nicht enthalten. Aktiviere in der Beta kostenlos einen passenden Zugang.' end
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
  select id,'free','active',true from public.app_users
  on conflict(user_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'username',u.username::text,'role',u.role,
    'planId',case when private.plan_exists(s.plan_id) then s.plan_id else 'free' end,
    'status',s.status,'beta',s.beta,'updatedAt',s.updated_at
  ) order by u.created_at),'[]'::jsonb)
  into v_users
  from public.app_users u join public.app_subscriptions s on s.user_id=u.id;

  select coalesce(jsonb_object_agg(plan_id,total),'{}'::jsonb) into v_summary
  from (
    select case when private.plan_exists(s.plan_id) then s.plan_id else 'free' end as plan_id, count(*)::int as total
    from public.app_subscriptions s
    group by 1
  ) counts;

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
begin
  v_admin:=private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;
  if not private.plan_exists(v_plan) then return jsonb_build_object('error','Unbekanntes oder noch nicht gespeichertes Abo.'); end if;
  if not exists(select 1 from public.app_users where id=p_user_id) then return jsonb_build_object('error','Konto nicht gefunden.'); end if;
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

-- Tages- und Monatskosten getrennt für Bilder und Videos.
create or replace function public.app_my_usage(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_limit public.app_usage_limits%rowtype;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_daily_images numeric := 0;
  v_daily_video_seconds numeric := 0;
  v_daily_image_cost numeric := 0;
  v_monthly_image_cost numeric := 0;
  v_daily_video_cost numeric := 0;
  v_monthly_video_cost numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,case when role='admin' then -1 else 20 end,case when role='admin' then -1 else 24 end,case when role='admin' then -1 else 10 end
  from public.app_users where id=v_id on conflict(user_id) do nothing;
  select * into v_limit from public.app_usage_limits where user_id=v_id;

  select
    coalesce(count(*) filter(where kind='image' and created_at>=v_day_start),0),
    coalesce(sum(units) filter(where kind='video' and created_at>=v_day_start),0),
    coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where kind='image' and created_at>=v_day_start),0),
    coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where kind='image' and created_at>=v_month_start),0),
    coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where kind='video' and created_at>=v_day_start),0),
    coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where kind='video' and created_at>=v_month_start),0)
  into v_daily_images,v_daily_video_seconds,v_daily_image_cost,v_monthly_image_cost,v_daily_video_cost,v_monthly_video_cost
  from public.app_usage_events where user_id=v_id and status='completed';

  return jsonb_build_object(
    'usage',jsonb_build_object(
      'dailyImages',v_daily_images,'dailyVideoSeconds',v_daily_video_seconds,
      'dailyImageCostUsd',v_daily_image_cost,'monthlyImageCostUsd',v_monthly_image_cost,
      'dailyVideoCostUsd',v_daily_video_cost,'monthlyVideoCostUsd',v_monthly_video_cost,
      'dailyCostUsd',v_daily_image_cost+v_daily_video_cost,
      'monthlyCostUsd',v_monthly_image_cost+v_monthly_video_cost
    ),
    'limits',jsonb_build_object('dailyImageLimit',v_limit.daily_image_limit,'dailyVideoSecondsLimit',v_limit.daily_video_seconds_limit,'monthlyBudgetUsd',v_limit.monthly_budget_usd,'allowImages',v_limit.allow_images,'allowVideos',v_limit.allow_videos)
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
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  v_total_day numeric := 0;
  v_total_month numeric := 0;
begin
  v_admin := private.session_user_id(p_token);
  if v_admin is null or not private.is_admin(v_admin) then return jsonb_build_object('error','Nur für Admins.'); end if;

  insert into public.app_usage_limits(user_id,daily_image_limit,daily_video_seconds_limit,monthly_budget_usd)
  select id,case when role='admin' then -1 else 20 end,case when role='admin' then -1 else 24 end,case when role='admin' then -1 else 10 end
  from public.app_users on conflict(user_id) do nothing;

  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where created_at>=v_day_start),0),
         coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where created_at>=v_month_start),0)
  into v_total_day,v_total_month
  from public.app_usage_events where status='completed';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'username',u.username::text,'role',u.role,'active',u.active,
    'limits',jsonb_build_object('dailyImageLimit',l.daily_image_limit,'dailyVideoSecondsLimit',l.daily_video_seconds_limit,'monthlyBudgetUsd',l.monthly_budget_usd,'allowImages',l.allow_images,'allowVideos',l.allow_videos),
    'usage',jsonb_build_object(
      'dailyImages',(select count(*) from public.app_usage_events e where e.user_id=u.id and e.kind='image' and e.status='completed' and e.created_at>=v_day_start),
      'dailyVideoSeconds',(select coalesce(sum(e.units),0) from public.app_usage_events e where e.user_id=u.id and e.kind='video' and e.status='completed' and e.created_at>=v_day_start),
      'dailyImageCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.kind='image' and e.status='completed' and e.created_at>=v_day_start),
      'monthlyImageCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.kind='image' and e.status='completed' and e.created_at>=v_month_start),
      'dailyVideoCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.kind='video' and e.status='completed' and e.created_at>=v_day_start),
      'monthlyVideoCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.kind='video' and e.status='completed' and e.created_at>=v_month_start),
      'dailyCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.status='completed' and e.created_at>=v_day_start),
      'monthlyCostUsd',(select coalesce(sum(coalesce(e.actual_cost_usd,e.estimated_cost_usd)),0) from public.app_usage_events e where e.user_id=u.id and e.status='completed' and e.created_at>=v_month_start)
    )
  ) order by u.created_at),'[]'::jsonb) into v_users
  from public.app_users u join public.app_usage_limits l on l.user_id=u.id;

  return jsonb_build_object('users',v_users,'totalDailyCostUsd',v_total_day,'totalMonthlyCostUsd',v_total_month);
end;
$$;

grant execute on function public.app_my_subscription(text) to anon,authenticated;
grant execute on function public.app_beta_select_plan(text,text) to anon,authenticated;
grant execute on function public.app_cancel_subscription(text) to anon,authenticated;
grant execute on function public.app_plan_access(text,text) to anon,authenticated;
grant execute on function public.app_admin_subscription_overview(text) to anon,authenticated;
grant execute on function public.app_admin_set_subscription(text,uuid,text) to anon,authenticated;
grant execute on function public.app_my_usage(text) to anon,authenticated;
grant execute on function public.app_admin_usage(text) to anon,authenticated;

commit;

select 'Yildiz AI V9 erfolgreich installiert.' as status;
