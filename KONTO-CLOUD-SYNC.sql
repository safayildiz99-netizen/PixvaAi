-- Yildiz AI – private Chats pro Konto + Cloud-Synchronisierung
-- Diese Datei EINMAL im Supabase SQL Editor vollständig ausführen.

create table if not exists public.app_chat_state (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  chats jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_chat_state_updated_idx on public.app_chat_state(updated_at desc);
alter table public.app_chat_state enable row level security;
revoke all on public.app_chat_state from anon, authenticated;

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

grant execute on function public.app_get_chat_state(text) to anon, authenticated;
grant execute on function public.app_save_chat_state(text,jsonb) to anon, authenticated;

-- Projekte sind jetzt ebenfalls privat. Admins verwalten Konten, sehen aber keine fremden Projekte.
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

grant execute on function public.app_list_projects(text) to anon, authenticated;
grant execute on function public.app_update_project(text,uuid,text,jsonb) to anon, authenticated;
grant execute on function public.app_delete_project(text,uuid) to anon, authenticated;
