-- Удаление сотрудника администратором.
--  * если у сотрудника нет документов и показателей — учётная запись удаляется полностью;
--  * если есть — доступ закрывается (роли, папки, Telegram), а запись остаётся, чтобы в документах и показателях
--    сохранился автор; такой человек скрыт из списка сотрудников и может подать заявку заново.

alter table public.profiles add column removed_at timestamptz;

create or replace function public.admin_remove_user(_uid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare _name text; _keep boolean;
begin
  perform private.require_admin();
  if _uid = auth.uid() then raise exception 'cannot_remove_self'; end if;
  select full_name into _name from public.profiles where id = _uid and removed_at is null;
  if not found then raise exception 'no_such_user'; end if;
  if private.has_role(_uid, 'admin') and (select count(*) from public.user_roles where role = 'admin' and user_id <> _uid) = 0 then
    raise exception 'last_admin';
  end if;
  _keep := exists (select 1 from public.documents where uploaded_by = _uid)
        or exists (select 1 from public.indicator_reports where user_id = _uid);
  if _keep then
    delete from public.user_roles where user_id = _uid;
    delete from public.folder_members where user_id = _uid;
    delete from public.telegram_links where user_id = _uid;
    update public.profiles set removed_at = now() where id = _uid;
    perform private.log_event('user_deactivated', _uid::text, jsonb_build_object('name', _name));
    return 'deactivated';
  end if;
  delete from auth.users where id = _uid;
  perform private.log_event('user_deleted', _uid::text, jsonb_build_object('name', _name));
  return 'deleted';
end $$;

-- в списке сотрудников скрытые не показываем
create or replace function public.admin_list_users()
returns table (user_id uuid, full_name text, user_position text, telegram_username text,
               roles public.app_role[], folders int[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.full_name, p.position, t.username,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
           coalesce((select array_agg(m.folder_id order by m.folder_id) from public.folder_members m where m.user_id = p.id), '{}'),
           p.created_at
    from public.profiles p left join public.telegram_links t on t.user_id = p.id
    where p.removed_at is null
    order by p.created_at;
end $$;

-- повторное одобрение заявки возвращает скрытого сотрудника
create or replace function public.accept_request(_tg_id bigint, _uid uuid, _tg_username text)
returns public.app_role language plpgsql security definer set search_path = '' as $$
declare rq public.access_requests;
begin
  select * into rq from public.access_requests
   where telegram_id = _tg_id and used_at is null and status = 'approved'
   for update;
  if not found then raise exception 'request_not_approved'; end if;
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id and user_id <> _uid) then
    raise exception 'telegram_taken';
  end if;

  update public.access_requests set used_at = now(), used_by = _uid where id = rq.id;
  insert into public.profiles (id, full_name, position) values (_uid, rq.full_name, rq.position)
  on conflict (id) do update set full_name = excluded.full_name, position = excluded.position, removed_at = null;
  insert into public.telegram_links (user_id, telegram_id, username) values (_uid, _tg_id, _tg_username)
  on conflict (user_id) do update set telegram_id = excluded.telegram_id, username = excluded.username;
  insert into public.user_roles (user_id, role, granted_by) values (_uid, rq.role, rq.decided_by)
  on conflict (user_id, role) do nothing;
  insert into public.folder_members (folder_id, user_id, added_by)
    select f.id, _uid, rq.decided_by from public.folders f where f.id = any (rq.folder_ids) and not f.restricted
  on conflict do nothing;
  insert into public.audit_log (actor, action, object, details)
  values (_uid, 'request_accepted', rq.id::text, jsonb_build_object('role', rq.role));
  return rq.role;
end $$;

revoke execute on function public.admin_remove_user(uuid) from public, anon;
grant execute on function public.admin_remove_user(uuid) to authenticated;
revoke execute on function public.accept_request(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_request(bigint, uuid, text) to service_role;
