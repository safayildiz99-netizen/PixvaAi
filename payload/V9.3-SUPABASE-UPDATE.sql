begin;

create table if not exists public.app_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.app_projects(id) on delete cascade,
  owner_id uuid not null references public.app_users(id) on delete cascade,
  version_no integer not null,
  name text not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  reason text not null default 'Speicherung',
  created_at timestamptz not null default now(),
  unique(project_id,version_no)
);
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  message text not null default '',
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  function_name text not null default '',
  model text not null default '',
  message text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.app_rate_windows (
  user_id uuid not null references public.app_users(id) on delete cascade,
  scope text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,scope)
);
create table if not exists public.app_brand_profiles (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  company_name text not null default '',
  logo_url text not null default '',
  primary_color text not null default '#63c7ff',
  secondary_color text not null default '#ffd400',
  font_family text not null default 'Arial',
  updated_at timestamptz not null default now()
);

create index if not exists app_project_versions_project_idx on public.app_project_versions(project_id,version_no desc);
create index if not exists app_notifications_user_idx on public.app_notifications(user_id,created_at desc);
create index if not exists app_error_logs_created_idx on public.app_error_logs(created_at desc);

alter table public.app_project_versions enable row level security;
alter table public.app_notifications enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.app_rate_windows enable row level security;
alter table public.app_brand_profiles enable row level security;
revoke all on public.app_project_versions from anon,authenticated;
revoke all on public.app_notifications from anon,authenticated;
revoke all on public.app_error_logs from anon,authenticated;
revoke all on public.app_rate_windows from anon,authenticated;
revoke all on public.app_brand_profiles from anon,authenticated;

create or replace function private.capture_project_version()
returns trigger language plpgsql security definer set search_path=public,private as $$
declare v_next integer;
begin
  if tg_op='UPDATE' and new.name is not distinct from old.name and new.data is not distinct from old.data then return new; end if;
  select coalesce(max(version_no),0)+1 into v_next from public.app_project_versions where project_id=new.id;
  insert into public.app_project_versions(project_id,owner_id,version_no,name,type,data,reason)
  values(new.id,new.owner_id,v_next,new.name,new.type,new.data,case when tg_op='INSERT' then 'Erste Speicherung' else 'Automatische Version' end);
  delete from public.app_project_versions where id in (
    select id from public.app_project_versions where project_id=new.id order by version_no desc offset 30
  );
  return new;
end; $$;
drop trigger if exists app_project_version_trigger on public.app_projects;
create trigger app_project_version_trigger after insert or update of name,data on public.app_projects
for each row execute function private.capture_project_version();

insert into public.app_project_versions(project_id,owner_id,version_no,name,type,data,reason)
select p.id,p.owner_id,1,p.name,p.type,p.data,'Bestehendes Projekt übernommen'
from public.app_projects p
where not exists(select 1 from public.app_project_versions v where v.project_id=p.id);

create or replace function private.notify_usage_change()
returns trigger language plpgsql security definer set search_path=public,private as $$
begin
  if new.status is distinct from old.status and new.status in ('completed','failed','cancelled') then
    insert into public.app_notifications(user_id,kind,title,message,related_id)
    values(
      new.user_id,
      case when new.status='completed' then 'success' when new.status='failed' then 'error' else 'warning' end,
      case when new.kind='video' and new.status='completed' then 'Video fertig'
           when new.kind='image' and new.status='completed' then 'Bild fertig'
           when new.status='failed' then 'KI-Auftrag fehlgeschlagen'
           else 'KI-Auftrag beendet' end,
      case when new.status='failed' then left(coalesce(new.error,'Unbekannter Fehler'),800)
           else upper(left(new.kind,1))||substr(new.kind,2)||' · '||new.status end,
      new.id
    );
    if new.status='failed' then
      insert into public.app_error_logs(user_id,function_name,model,message)
      values(new.user_id,'KI-'||new.kind,new.model,left(coalesce(new.error,'KI-Auftrag fehlgeschlagen'),800));
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists app_usage_notification_trigger on public.app_usage_events;
create trigger app_usage_notification_trigger after update of status on public.app_usage_events
for each row execute function private.notify_usage_change();

create or replace function public.app_list_project_versions(p_token text,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid; v_owner uuid; v_versions jsonb;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select owner_id into v_owner from public.app_projects where id=p_project_id;
  if v_owner is null then return jsonb_build_object('error','Projekt nicht gefunden.'); end if;
  if v_owner<>v_id then return jsonb_build_object('error','Kein Zugriff.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'projectId',v.project_id,'versionNo',v.version_no,'name',v.name,
    'type',v.type,'reason',v.reason,'createdAt',v.created_at
  ) order by v.version_no desc),'[]'::jsonb)
  into v_versions from public.app_project_versions v where v.project_id=p_project_id and v.owner_id=v_id;
  return jsonb_build_object('versions',v_versions);
end; $$;

create or replace function public.app_restore_project_version(p_token text,p_version_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid; v_version public.app_project_versions%rowtype; v_project public.app_projects%rowtype;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select * into v_version from public.app_project_versions where id=p_version_id;
  if v_version.id is null then return jsonb_build_object('error','Version nicht gefunden.'); end if;
  if v_version.owner_id<>v_id then return jsonb_build_object('error','Kein Zugriff.'); end if;
  update public.app_projects set name=v_version.name,data=v_version.data,updated_at=now()
  where id=v_version.project_id and owner_id=v_id returning * into v_project;
  return jsonb_build_object('project',jsonb_build_object(
    'id',v_project.id,'ownerId',v_project.owner_id,'name',v_project.name,'type',v_project.type,
    'data',v_project.data,'createdAt',v_project.created_at,'updatedAt',v_project.updated_at
  ));
end; $$;

create or replace function public.app_take_rate_limit(p_token text,p_scope text,p_limit integer,p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare
  v_id uuid; v_row public.app_rate_windows%rowtype;
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),1000));
  v_seconds integer:=greatest(10,least(coalesce(p_window_seconds,60),86400));
  v_allowed boolean; v_retry integer;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  insert into public.app_rate_windows(user_id,scope,request_count)
  values(v_id,left(coalesce(nullif(trim(p_scope),''),'general'),80),0)
  on conflict(user_id,scope) do nothing;
  select * into v_row from public.app_rate_windows
  where user_id=v_id and scope=left(coalesce(nullif(trim(p_scope),''),'general'),80) for update;
  if v_row.window_started_at < now()-make_interval(secs=>v_seconds) then
    update public.app_rate_windows set window_started_at=now(),request_count=1,updated_at=now()
    where user_id=v_id and scope=v_row.scope returning * into v_row;
  else
    update public.app_rate_windows set request_count=request_count+1,updated_at=now()
    where user_id=v_id and scope=v_row.scope returning * into v_row;
  end if;
  v_allowed:=v_row.request_count<=v_limit;
  v_retry:=greatest(0,ceil(extract(epoch from (v_row.window_started_at+make_interval(secs=>v_seconds)-now())))::integer);
  return jsonb_build_object('allowed',v_allowed,'remaining',greatest(0,v_limit-v_row.request_count),'retryAfterSeconds',v_retry);
end; $$;

create or replace function public.app_security_overview(p_token text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid; v_role text; v_jobs jsonb; v_notes jsonb; v_errors jsonb:='[]'::jsonb; v_brand jsonb; v_sessions integer;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select role into v_role from public.app_users where id=v_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'requestId',e.request_id,'kind',e.kind,'model',e.model,'status',e.status,
    'error',e.error,'createdAt',e.created_at,'updatedAt',e.updated_at
  ) order by e.created_at desc),'[]'::jsonb)
  into v_jobs from (select * from public.app_usage_events where user_id=v_id order by created_at desc limit 40) e;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,'kind',n.kind,'title',n.title,'message',n.message,'readAt',n.read_at,'createdAt',n.created_at
  ) order by n.created_at desc),'[]'::jsonb)
  into v_notes from (select * from public.app_notifications where user_id=v_id order by created_at desc limit 40) n;
  select count(*)::integer into v_sessions from public.app_sessions where user_id=v_id and expires_at>now();
  select jsonb_build_object(
    'companyName',coalesce(b.company_name,''),'logoUrl',coalesce(b.logo_url,''),
    'primaryColor',coalesce(b.primary_color,'#63c7ff'),'secondaryColor',coalesce(b.secondary_color,'#ffd400'),
    'fontFamily',coalesce(b.font_family,'Arial'),'updatedAt',b.updated_at
  ) into v_brand from public.app_brand_profiles b where b.user_id=v_id;
  if v_role='admin' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'userId',x.user_id,'function',x.function_name,'model',x.model,
      'message',x.message,'resolvedAt',x.resolved_at,'createdAt',x.created_at
    ) order by x.created_at desc),'[]'::jsonb)
    into v_errors from (select * from public.app_error_logs order by created_at desc limit 80) x;
  end if;
  return jsonb_build_object('jobs',v_jobs,'notifications',v_notes,'sessionCount',v_sessions,
    'brand',coalesce(v_brand,'{}'::jsonb),'adminErrors',v_errors,'role',v_role);
end; $$;

create or replace function public.app_mark_notification_read(p_token text,p_notification_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  update public.app_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=v_id;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.app_end_other_sessions(p_token text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid; v_deleted integer;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  delete from public.app_sessions where user_id=v_id and token_hash<>encode(digest(coalesce(p_token,''),'sha256'),'hex');
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'ended',v_deleted);
end; $$;

create or replace function public.app_save_brand_profile(
  p_token text,p_company_name text,p_logo_url text,p_primary_color text,p_secondary_color text,p_font_family text
)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  insert into public.app_brand_profiles(user_id,company_name,logo_url,primary_color,secondary_color,font_family,updated_at)
  values(v_id,left(coalesce(p_company_name,''),120),left(coalesce(p_logo_url,''),1000),
    case when coalesce(p_primary_color,'')~'^#[0-9A-Fa-f]{6}$' then p_primary_color else '#63c7ff' end,
    case when coalesce(p_secondary_color,'')~'^#[0-9A-Fa-f]{6}$' then p_secondary_color else '#ffd400' end,
    left(coalesce(nullif(trim(p_font_family),''),'Arial'),80),now())
  on conflict(user_id) do update set company_name=excluded.company_name,logo_url=excluded.logo_url,
    primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,font_family=excluded.font_family,updated_at=now();
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.app_admin_resolve_error(p_token text,p_error_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null or not private.is_admin(v_id) then return jsonb_build_object('error','Nur für Admins.'); end if;
  update public.app_error_logs set resolved_at=coalesce(resolved_at,now()) where id=p_error_id;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.app_full_data_export(p_token text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_id uuid; v_user jsonb; v_chats jsonb; v_projects jsonb; v_versions jsonb; v_jobs jsonb; v_notes jsonb; v_brand jsonb;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select jsonb_build_object('id',u.id,'username',u.username::text,'role',u.role,'createdAt',u.created_at) into v_user from public.app_users u where u.id=v_id;
  select coalesce(c.chats,'[]'::jsonb) into v_chats from public.app_chat_state c where c.user_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc),'[]'::jsonb) into v_projects from public.app_projects p where p.owner_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]'::jsonb) into v_versions from public.app_project_versions v where v.owner_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) into v_jobs from public.app_usage_events e where e.user_id=v_id;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into v_notes from public.app_notifications n where n.user_id=v_id;
  select coalesce(to_jsonb(b),'{}'::jsonb) into v_brand from public.app_brand_profiles b where b.user_id=v_id;
  return jsonb_build_object('exportedAt',now(),'user',v_user,'chats',coalesce(v_chats,'[]'::jsonb),
    'projects',v_projects,'projectVersions',v_versions,'aiJobs',v_jobs,'notifications',v_notes,'brandProfile',v_brand);
end; $$;

create or replace function public.app_delete_account(p_token text,p_password text,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_catalog as $$
declare v_id uuid; v_hash text; v_username text;
begin
  v_id:=private.session_user_id(p_token);
  if v_id is null then return jsonb_build_object('error','Nicht angemeldet.'); end if;
  select password_hash,username::text into v_hash,v_username from public.app_users where id=v_id;
  if trim(coalesce(p_confirmation,''))<>v_username then return jsonb_build_object('error','Benutzername zur Bestätigung exakt eingeben.'); end if;
  if crypt(coalesce(p_password,''),v_hash)<>v_hash then return jsonb_build_object('error','Passwort ist falsch.'); end if;
  if exists(select 1 from public.app_users where id=v_id and role='admin') and
     (select count(*) from public.app_users where role='admin' and active)=1 then
    return jsonb_build_object('error','Das letzte aktive Admin-Konto kann nicht gelöscht werden.');
  end if;
  delete from public.app_users where id=v_id;
  return jsonb_build_object('ok',true);
end; $$;

grant execute on function public.app_list_project_versions(text,uuid) to anon,authenticated;
grant execute on function public.app_restore_project_version(text,uuid) to anon,authenticated;
grant execute on function public.app_take_rate_limit(text,text,integer,integer) to anon,authenticated;
grant execute on function public.app_security_overview(text) to anon,authenticated;
grant execute on function public.app_mark_notification_read(text,uuid) to anon,authenticated;
grant execute on function public.app_end_other_sessions(text) to anon,authenticated;
grant execute on function public.app_save_brand_profile(text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.app_admin_resolve_error(text,uuid) to anon,authenticated;
grant execute on function public.app_full_data_export(text) to anon,authenticated;
grant execute on function public.app_delete_account(text,text,text) to anon,authenticated;

commit;
select 'Yildiz AI V9.3 Sicherheit und Daten erfolgreich installiert. Geldfunktionen wurden nicht verändert.' as status;
