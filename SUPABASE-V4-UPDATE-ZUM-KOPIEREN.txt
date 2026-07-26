-- Yildiz AI V4 – nur dieses Update im Supabase SQL Editor ausführen

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

  v_clean := coalesce(p_settings, '{}'::jsonb) || jsonb_build_object(
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
    'compactSidebar', coalesce((p_settings->>'compactSidebar')::boolean, false),
    'mobileHistoryDrawer', coalesce((p_settings->>'mobileHistoryDrawer')::boolean, true)
  );

  if jsonb_typeof(v_clean->'navItems') is distinct from 'array' then v_clean := v_clean - 'navItems'; end if;
  if jsonb_typeof(v_clean->'texts') is distinct from 'object' then v_clean := v_clean - 'texts'; end if;
  if jsonb_typeof(v_clean->'theme') is distinct from 'object' then v_clean := v_clean - 'theme'; end if;

  insert into public.app_global_settings(id, settings, updated_by, updated_at)
  values (1, v_clean, v_admin, now())
  on conflict (id) do update set settings=excluded.settings, updated_by=excluded.updated_by, updated_at=excluded.updated_at;

  insert into public.app_admin_audit_log(admin_id, action, details)
  values (v_admin, 'APP_VIEW_UPDATED', jsonb_build_object('settings', v_clean));

  return jsonb_build_object('ok', true, 'settings', v_clean);
end;
$$;

grant execute on function public.app_admin_save_ui_settings(text,jsonb) to anon, authenticated;
