-- PIXVA V10 COMPLETE AI SUITE
-- Ergänzt die bestehende PIXVA V9/V9.2-Datenbank.
-- Zahlungs-/PayPal-Tabellen und Zahlungslogik werden NICHT verändert.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.app_brand_kits (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  company_name text not null default '',
  logo_path text not null default '',
  primary_color text not null default '#7258ff',
  secondary_color text not null default '#39d6d0',
  font_family text not null default 'Inter',
  address text not null default '',
  opening_hours text not null default '',
  instagram text not null default '',
  language text not null default 'de',
  design_style text not null default 'modern-premium',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.app_memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  category text not null default 'general',
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_memory_items_user_idx on public.app_memory_items(user_id, updated_at desc);

create table if not exists public.app_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  ean text not null default '',
  name text not null,
  brand text not null default '',
  weight text not null default '',
  category text not null default '',
  normal_price numeric(12,2),
  offer_price numeric(12,2),
  image_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_products_user_idx on public.app_products(user_id, updated_at desc);
create index if not exists app_products_user_ean_idx on public.app_products(user_id, ean);

create table if not exists public.app_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null default '',
  size_bytes bigint not null default 0,
  extracted_text text not null default '',
  status text not null default 'ready' check (status in ('uploading','processing','ready','failed')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, storage_path)
);
create index if not exists app_knowledge_files_user_idx on public.app_knowledge_files(user_id, created_at desc);

create table if not exists public.app_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.app_knowledge_files(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique(file_id, chunk_index)
);
create index if not exists app_knowledge_chunks_user_idx on public.app_knowledge_chunks(user_id, file_id, chunk_index);

create table if not exists public.app_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.app_projects(id) on delete cascade,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  version_no integer not null,
  name text not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  reason text not null default 'autosave',
  created_at timestamptz not null default now(),
  unique(project_id, version_no)
);
create index if not exists app_project_versions_owner_idx on public.app_project_versions(owner_id, created_at desc);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  message text not null default '',
  related_id text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_user_idx on public.app_notifications(user_id, created_at desc);

create table if not exists public.app_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  prompt text not null,
  status text not null default 'planned' check (status in ('planned','running','completed','failed')),
  plan jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_agent_runs_user_idx on public.app_agent_runs(user_id, created_at desc);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  area text not null default 'app',
  public_message text not null default '',
  technical_message text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_error_logs_created_idx on public.app_error_logs(created_at desc);

create table if not exists public.app_user_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  label text not null default 'PIXVA Sicherung',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_user_snapshots_user_idx on public.app_user_snapshots(user_id, created_at desc);

create table if not exists public.app_rate_windows (
  user_id uuid not null references public.app_users(id) on delete cascade,
  scope text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key(user_id, scope)
);

create table if not exists public.app_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_recovery_codes_user_idx on public.app_recovery_codes(user_id, created_at desc);

create table if not exists public.app_public_rate_windows (
  subject_hash text not null,
  scope text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key(subject_hash, scope)
);

alter table public.app_brand_kits enable row level security;
alter table public.app_memory_items enable row level security;
alter table public.app_products enable row level security;
alter table public.app_knowledge_files enable row level security;
alter table public.app_knowledge_chunks enable row level security;
alter table public.app_project_versions enable row level security;
alter table public.app_notifications enable row level security;
alter table public.app_agent_runs enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.app_user_snapshots enable row level security;
alter table public.app_rate_windows enable row level security;
alter table public.app_recovery_codes enable row level security;
alter table public.app_public_rate_windows enable row level security;

revoke all on public.app_brand_kits from anon, authenticated;
revoke all on public.app_memory_items from anon, authenticated;
revoke all on public.app_products from anon, authenticated;
revoke all on public.app_knowledge_files from anon, authenticated;
revoke all on public.app_knowledge_chunks from anon, authenticated;
revoke all on public.app_project_versions from anon, authenticated;
revoke all on public.app_notifications from anon, authenticated;
revoke all on public.app_agent_runs from anon, authenticated;
revoke all on public.app_error_logs from anon, authenticated;
revoke all on public.app_user_snapshots from anon, authenticated;
revoke all on public.app_rate_windows from anon, authenticated;
revoke all on public.app_recovery_codes from anon, authenticated;
revoke all on public.app_public_rate_windows from anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('pixva-private','pixva-private',false,15728640)
on conflict (id) do update set public=false, file_size_limit=15728640;

create or replace function public.app_take_rate_limit(
  p_token text, p_scope text, p_limit integer default 30, p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_now timestamptz := now();
  v_row public.app_rate_windows%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_limit,30),1000));
  v_seconds integer := greatest(10,least(coalesce(p_window_seconds,60),86400));
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('allowed',false,'error','Nicht angemeldet.'); end if;
  insert into public.app_rate_windows(user_id,scope,window_started_at,request_count)
  values(v_id,lower(trim(coalesce(p_scope,'general'))),v_now,1)
  on conflict(user_id,scope) do update set
    window_started_at = case
      when public.app_rate_windows.window_started_at + make_interval(secs=>v_seconds) <= v_now then v_now
      else public.app_rate_windows.window_started_at end,
    request_count = case
      when public.app_rate_windows.window_started_at + make_interval(secs=>v_seconds) <= v_now then 1
      else public.app_rate_windows.request_count + 1 end
  returning * into v_row;
  return jsonb_build_object(
    'allowed',v_row.request_count<=v_limit,'count',v_row.request_count,'limit',v_limit,
    'resetAt',v_row.window_started_at + make_interval(secs=>v_seconds)
  );
end;
$$;
revoke all on function public.app_take_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.app_take_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.app_take_public_rate_limit(
  p_subject_hash text, p_scope text, p_limit integer default 8, p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_now timestamptz := now();
  v_row public.app_public_rate_windows%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_limit,8),100));
  v_seconds integer := greatest(60,least(coalesce(p_window_seconds,900),86400));
begin
  if length(coalesce(p_subject_hash,'')) < 32 then
    return jsonb_build_object('allowed',false);
  end if;
  insert into public.app_public_rate_windows(subject_hash,scope,window_started_at,request_count)
  values(p_subject_hash,lower(trim(coalesce(p_scope,'public'))),v_now,1)
  on conflict(subject_hash,scope) do update set
    window_started_at = case
      when public.app_public_rate_windows.window_started_at + make_interval(secs=>v_seconds) <= v_now then v_now
      else public.app_public_rate_windows.window_started_at end,
    request_count = case
      when public.app_public_rate_windows.window_started_at + make_interval(secs=>v_seconds) <= v_now then 1
      else public.app_public_rate_windows.request_count + 1 end
  returning * into v_row;
  return jsonb_build_object(
    'allowed',v_row.request_count<=v_limit,'count',v_row.request_count,'limit',v_limit,
    'resetAt',v_row.window_started_at + make_interval(secs=>v_seconds)
  );
end;
$$;
revoke all on function public.app_take_public_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.app_take_public_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.app_end_other_sessions(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_hash text;
  v_deleted integer;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  v_hash := encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex');
  delete from public.app_sessions where user_id=v_id and token_hash<>v_hash;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok',true,'ended',v_deleted);
end;
$$;
revoke all on function public.app_end_other_sessions(text) from public,anon,authenticated;
grant execute on function public.app_end_other_sessions(text) to service_role;

create or replace function public.app_reset_password_with_recovery(
  p_username text, p_code_hash text, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user public.app_users%rowtype;
  v_code public.app_recovery_codes%rowtype;
begin
  if length(coalesce(p_new_password,'')) < 10 then
    return jsonb_build_object('error','Das neue Passwort braucht mindestens 10 Zeichen.');
  end if;
  select * into v_user from public.app_users
  where username=trim(coalesce(p_username,''))::citext and active=true limit 1;
  if v_user.id is null then
    return jsonb_build_object('error','Konto oder Wiederherstellungscode ist ungültig.');
  end if;
  select * into v_code from public.app_recovery_codes
  where user_id=v_user.id and code_hash=coalesce(p_code_hash,'') and used_at is null
  order by created_at desc limit 1;
  if v_code.id is null then
    return jsonb_build_object('error','Konto oder Wiederherstellungscode ist ungültig.');
  end if;
  update public.app_recovery_codes set used_at=now() where id=v_code.id;
  update public.app_users
  set password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf',12)),
      must_change_password=false
  where id=v_user.id;
  delete from public.app_sessions where user_id=v_user.id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.app_reset_password_with_recovery(text,text,text) from public,anon,authenticated;
grant execute on function public.app_reset_password_with_recovery(text,text,text) to service_role;

create or replace function public.app_delete_account_secure(
  p_token text, p_password text, p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_id uuid;
  v_user public.app_users%rowtype;
  v_admins integer;
begin
  v_id := private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select * into v_user from public.app_users where id=v_id;
  if trim(coalesce(p_confirmation,''))<>v_user.username::text then
    return jsonb_build_object('error','Zur Bestätigung den Benutzernamen exakt eingeben.');
  end if;
  if extensions.crypt(coalesce(p_password,''),v_user.password_hash)<>v_user.password_hash then
    return jsonb_build_object('error','Passwort ist falsch.');
  end if;
  if v_user.role='admin' then
    select count(*) into v_admins from public.app_users where role='admin' and active=true;
    if v_admins<=1 then return jsonb_build_object('error','Das letzte aktive Admin-Konto kann nicht gelöscht werden.'); end if;
  end if;
  delete from public.app_users where id=v_id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.app_delete_account_secure(text,text,text) from public,anon,authenticated;
grant execute on function public.app_delete_account_secure(text,text,text) to service_role;

create or replace function private.pixva_project_version()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_next integer;
begin
  if TG_OP='UPDATE' and NEW.name is not distinct from OLD.name and NEW.data is not distinct from OLD.data then return NEW; end if;
  select coalesce(max(version_no),0)+1 into v_next from public.app_project_versions where project_id=NEW.id;
  insert into public.app_project_versions(project_id,owner_id,version_no,name,type,data,reason)
  values(NEW.id,NEW.owner_id,v_next,NEW.name,NEW.type,NEW.data,case when TG_OP='INSERT' then 'created' else 'autosave' end);
  delete from public.app_project_versions where id in (
    select id from public.app_project_versions where project_id=NEW.id order by version_no desc offset 30
  );
  return NEW;
end;
$$;

drop trigger if exists pixva_project_version_trigger on public.app_projects;
create trigger pixva_project_version_trigger
after insert or update of name,data on public.app_projects
for each row execute function private.pixva_project_version();

create or replace function private.pixva_usage_notification()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('completed','failed','cancelled') then
    insert into public.app_notifications(user_id,kind,title,message,related_id)
    values(
      NEW.user_id,
      case when NEW.status='completed' then 'success' else 'warning' end,
      case
        when NEW.kind='image' and NEW.status='completed' then 'Bild ist fertig'
        when NEW.kind='video' and NEW.status='completed' then 'Video ist fertig'
        when NEW.status='failed' then 'KI-Auftrag fehlgeschlagen'
        else 'KI-Auftrag aktualisiert'
      end,
      concat(upper(coalesce(NEW.kind,'KI')),' · ',NEW.status),
      NEW.id::text
    );
  end if;
  return NEW;
end;
$$;

do $do$
begin
  if to_regclass('public.app_usage_events') is not null then
    drop trigger if exists pixva_usage_notification_trigger on public.app_usage_events;
    create trigger pixva_usage_notification_trigger
    after update of status on public.app_usage_events
    for each row execute function private.pixva_usage_notification();
  end if;
end
$do$;

commit;

select 'PIXVA V10 Complete AI Suite erfolgreich installiert. Geld-/PayPal-System blieb unverändert.' as status;
