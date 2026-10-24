-- Служебные функции прав переносятся в схему private, которая не публикуется через API.
-- Политики RLS продолжают их вызывать, но вызвать их напрямую через /rest/v1/rpc нельзя.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.has_role(_uid uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = _uid and r.role = _role);
$$;

create or replace function private.is_member(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = _uid);
$$;

create or replace function private.is_manager(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r
                 where r.user_id = _uid and r.role in ('admin', 'deputy', 'chief_physician'));
$$;

create or replace function private.can_access_folder(_uid uuid, _fid int)
returns boolean language sql stable security definer set search_path = '' as $$
  select _uid is not null
     and exists (select 1 from public.folders f where f.id = _fid and not f.restricted)
     and (private.is_manager(_uid)
          or (private.has_role(_uid, 'staff')
              and exists (select 1 from public.folder_members m where m.folder_id = _fid and m.user_id = _uid)));
$$;

create or replace function private.folder_of_path(_name text)
returns int language sql immutable set search_path = '' as $$
  select case when _name ~ '^[0-9]{1,2}/' then split_part(_name, '/', 1)::int end;
$$;

create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function private.log_event(_action text, _object text, _details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), _action, _object, coalesce(_details, '{}'::jsonb));
$$;

-- Создание приглашения. Первое приглашение администратора владелец создаёт сам в SQL Editor:
--   select private.make_invite(null, 'admin', 'ФИО', 'Должность', '{}', 24);
create or replace function private.make_invite(_by uuid, _role public.app_role, _full_name text, _position text,
                                               _folders int[], _hours int)
returns text language plpgsql security definer set search_path = '' as $$
declare _code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if _hours is null or _hours < 1 or _hours > 24 * 14 then raise exception 'bad_expiry'; end if;
  insert into public.invites (code_hash, role, full_name, position, folder_ids, created_by, expires_at)
  values (encode(extensions.digest(_code, 'sha256'), 'hex'), _role,
          left(btrim(coalesce(_full_name, '')), 200), left(btrim(coalesce(_position, '')), 200),
          coalesce((select array_agg(f.id) from public.folders f where f.id = any (coalesce(_folders, '{}')) and not f.restricted), '{}'),
          _by, now() + make_interval(hours => _hours));
  insert into public.audit_log (actor, action, object, details)
  values (_by, 'invite_created', null, jsonb_build_object('role', _role, 'name', _full_name, 'hours', _hours));
  return _code;
end $$;

create or replace function private.trg_documents_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, object, details)
    values (auth.uid(), 'document_added', new.id::text, jsonb_build_object('folder', new.folder_id, 'title', new.title));
    return new;
  else
    insert into public.audit_log (actor, action, object, details)
    values (auth.uid(), 'document_deleted', old.id::text, jsonb_build_object('folder', old.folder_id, 'title', old.title));
    return old;
  end if;
end $$;

revoke execute on all functions in schema private from public;
grant execute on function private.has_role(uuid, public.app_role), private.is_member(uuid), private.is_manager(uuid),
                          private.can_access_folder(uuid, int), private.folder_of_path(text)
  to authenticated;

-- триггер журнала
drop trigger documents_audit on public.documents;
create trigger documents_audit after insert or delete on public.documents
  for each row execute function private.trg_documents_audit();

-- политики RLS заново, через private.*
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_member(auth.uid()));
drop policy tg_read on public.telegram_links;
create policy tg_read on public.telegram_links for select to authenticated
  using (user_id = auth.uid() or private.has_role(auth.uid(), 'admin'));
drop policy roles_read on public.user_roles;
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or private.has_role(auth.uid(), 'admin'));
drop policy folders_read on public.folders;
create policy folders_read on public.folders for select to authenticated
  using (private.is_member(auth.uid()));
drop policy members_read on public.folder_members;
create policy members_read on public.folder_members for select to authenticated
  using (user_id = auth.uid() or private.is_manager(auth.uid()));
drop policy documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (private.can_access_folder(auth.uid(), folder_id));
drop policy documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (private.can_access_folder(auth.uid(), folder_id) and uploaded_by = auth.uid());
drop policy documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (private.has_role(auth.uid(), 'admin') and private.can_access_folder(auth.uid(), folder_id));
drop policy invites_read on public.invites;
create policy invites_read on public.invites for select to authenticated
  using (private.has_role(auth.uid(), 'admin'));
drop policy audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (private.has_role(auth.uid(), 'admin'));

drop policy documents_files_read on storage.objects;
create policy documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.can_access_folder(auth.uid(), private.folder_of_path(name)));
drop policy documents_files_insert on storage.objects;
create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.can_access_folder(auth.uid(), private.folder_of_path(name)));
drop policy documents_files_delete on storage.objects;
create policy documents_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.has_role(auth.uid(), 'admin')
         and private.can_access_folder(auth.uid(), private.folder_of_path(name)));

-- публичные функции интерфейса — на private.*
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
    order by p.created_at;
end $$;

create or replace function public.admin_set_role(_uid uuid, _role public.app_role, _on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles where id = _uid) then
    raise exception 'no_such_user';
  end if;
  if _on then
    insert into public.user_roles (user_id, role, granted_by) values (_uid, _role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    if _role = 'admin' and (select count(*) from public.user_roles where role = 'admin' and user_id <> _uid) = 0 then
      raise exception 'last_admin';
    end if;
    delete from public.user_roles where user_id = _uid and role = _role;
  end if;
  perform private.log_event(case when _on then 'role_granted' else 'role_revoked' end, _uid::text, jsonb_build_object('role', _role));
end $$;

create or replace function public.admin_set_folders(_uid uuid, _folders int[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.folder_members where user_id = _uid and folder_id <> all (coalesce(_folders, '{}'));
  insert into public.folder_members (folder_id, user_id, added_by)
    select f.id, _uid, auth.uid() from public.folders f where f.id = any (coalesce(_folders, '{}')) and not f.restricted
  on conflict do nothing;
  perform private.log_event('folders_set', _uid::text, jsonb_build_object('folders', _folders));
end $$;

create or replace function public.admin_update_profile(_uid uuid, _full_name text, _position text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.profiles set full_name = left(btrim(coalesce(_full_name, '')), 200),
                             position  = left(btrim(coalesce(_position, '')), 200)
  where id = _uid;
  perform private.log_event('profile_updated', _uid::text, '{}'::jsonb);
end $$;

create or replace function public.create_invite(_role public.app_role, _full_name text, _position text,
                                                _folders int[], _days int)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.make_invite(auth.uid(), _role, _full_name, _position, _folders, coalesce(_days, 3) * 24);
end $$;

create or replace function public.revoke_invite(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.invites set revoked_at = now() where id = _id and used_at is null and revoked_at is null;
  perform private.log_event('invite_revoked', _id::text, '{}'::jsonb);
end $$;

-- старые публичные версии больше не нужны
drop function public.has_role(uuid, public.app_role);
drop function public.is_member(uuid);
drop function public.is_manager(uuid);
drop function public.can_access_folder(uuid, int);
drop function public.folder_of_path(text);
drop function public.require_admin();
drop function public.log_event(text, text, jsonb);
drop function public.make_invite(uuid, public.app_role, text, text, int[], int);
drop function public.trg_documents_audit();
