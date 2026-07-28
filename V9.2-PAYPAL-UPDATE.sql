-- YILDIZ AI V9.2 – PAYPAL-ZAHLUNGEN UND BEZAHLTE ZUGÄNGE
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Bestehende V9-Konten, Chats, Projekte und der Admin-Login bleiben erhalten.

begin;

alter table public.app_subscriptions add column if not exists paid_until timestamptz;
alter table public.app_subscriptions add column if not exists provider text not null default '';
alter table public.app_subscriptions add column if not exists provider_reference text not null default '';

create table if not exists public.app_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  plan_id text not null,
  provider text not null default 'paypal',
  provider_order_id text not null unique,
  request_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  access_days integer not null default 30 check (access_days between 1 and 365),
  status text not null default 'created' check (status in ('created','approved','completed','failed','amount_mismatch','refunded','reversed')),
  capture_id text not null default '',
  raw_response jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_payment_orders_user_created_idx
  on public.app_payment_orders(user_id, created_at desc);
create index if not exists app_payment_orders_capture_idx
  on public.app_payment_orders(capture_id) where capture_id <> '';

alter table public.app_payment_orders enable row level security;
revoke all on public.app_payment_orders from anon, authenticated;

update public.app_global_settings
set settings = jsonb_build_object(
  'paymentsEnabled', false,
  'paymentProvider', 'paypal',
  'paymentMerchantLabel', '',
  'planPurchasable', jsonb_build_object('free',false,'creator',true,'studio',true),
  'paidAccessDays', 30
) || coalesce(settings, '{}'::jsonb),
updated_at = now()
where id = 1;

create or replace function private.expire_paid_subscription(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.app_subscriptions
  set plan_id='free',
      status='active',
      beta=true,
      paid_until=null,
      provider='',
      provider_reference='',
      canceled_at=now(),
      updated_at=now()
  where user_id=p_user_id
    and paid_until is not null
    and paid_until <= now();
end;
$$;
revoke all on function private.expire_paid_subscription(uuid) from public, anon, authenticated;

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
  perform private.expire_paid_subscription(v_id);
  select * into v_row from public.app_subscriptions where user_id=v_id;
  if not private.plan_exists(v_row.plan_id) then
    update public.app_subscriptions
    set plan_id='free',status='active',beta=true,paid_until=null,provider='',provider_reference='',updated_at=now()
    where user_id=v_id;
    select * into v_row from public.app_subscriptions where user_id=v_id;
  end if;
  return jsonb_build_object('subscription',jsonb_build_object(
    'planId',v_row.plan_id,
    'status',v_row.status,
    'beta',v_row.beta,
    'startedAt',v_row.started_at,
    'canceledAt',v_row.canceled_at,
    'updatedAt',v_row.updated_at,
    'paidUntil',v_row.paid_until,
    'provider',v_row.provider,
    'providerReference',v_row.provider_reference,
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
  v_settings jsonb := '{}'::jsonb;
  v_payments_enabled boolean := false;
  v_price numeric := 0;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  if not private.plan_exists(v_plan) then return jsonb_build_object('error','Unbekanntes oder noch nicht gespeichertes Abo.'); end if;

  select coalesce(settings,'{}'::jsonb) into v_settings from public.app_global_settings where id=1;
  v_payments_enabled := coalesce((v_settings->>'paymentsEnabled')::boolean,false);
  begin
    v_price := coalesce((v_settings->'planPrices'->>v_plan)::numeric,0);
  exception when others then
    v_price := 0;
  end;

  if v_payments_enabled and v_plan <> 'free' and v_price > 0 then
    return jsonb_build_object('error','Dieses Abo muss über den sicheren PayPal-Kauf aktiviert werden.');
  end if;

  insert into public.app_subscriptions(
    user_id,plan_id,status,beta,started_at,canceled_at,updated_at,
    paid_until,provider,provider_reference
  )
  values(v_id,v_plan,'active',true,now(),null,now(),null,'','')
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,
    status='active',
    beta=true,
    started_at=case when public.app_subscriptions.plan_id<>excluded.plan_id then now() else public.app_subscriptions.started_at end,
    canceled_at=null,
    updated_at=now(),
    paid_until=null,
    provider='',
    provider_reference='';

  select * into v_row from public.app_subscriptions where user_id=v_id;
  return jsonb_build_object('ok',true,'charged',false,'subscription',jsonb_build_object(
    'planId',v_row.plan_id,'status',v_row.status,'beta',v_row.beta,
    'startedAt',v_row.started_at,'canceledAt',v_row.canceled_at,'updatedAt',v_row.updated_at,
    'paidUntil',v_row.paid_until,'provider',v_row.provider,'providerReference',v_row.provider_reference
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
  update public.app_subscriptions
  set plan_id='free',status='active',beta=true,canceled_at=now(),updated_at=now(),
      paid_until=null,provider='',provider_reference=''
  where user_id=v_id;
  select * into v_row from public.app_subscriptions where user_id=v_id;
  return jsonb_build_object('ok',true,'charged',false,'subscription',jsonb_build_object(
    'planId',v_row.plan_id,'status',v_row.status,'beta',v_row.beta,
    'startedAt',v_row.started_at,'canceledAt',v_row.canceled_at,'updatedAt',v_row.updated_at,
    'paidUntil',v_row.paid_until,'provider',v_row.provider,'providerReference',v_row.provider_reference
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
  perform private.expire_paid_subscription(v_id);
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
    'error',case
      when v_allowed then null
      when v_kind='video' then 'Sora-Videos sind in diesem Abo nicht enthalten.'
      else 'OpenAI-Bilder sind in diesem Abo nicht enthalten.'
    end
  );
end;
$$;

grant execute on function public.app_my_subscription(text) to anon,authenticated;
grant execute on function public.app_beta_select_plan(text,text) to anon,authenticated;
grant execute on function public.app_cancel_subscription(text) to anon,authenticated;
grant execute on function public.app_plan_access(text,text) to anon,authenticated;

commit;

select 'Yildiz AI V9.2 PayPal und Bildschrift erfolgreich installiert.' as status;
