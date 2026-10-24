-- Учреждения и области видимости («заведующий видит свой отдел»).
--  * institutions — список учреждений и отделов (СВП, ОШП, отделения больницы, внешние организации), его ведёт администратор;
--  * у сотрудника есть учреждение (profiles.institution_id), его указывают при заявке или приглашении;
--  * scopes — кому какие отчёты показателей видны сверх своих: по учреждению (весь отдел) и/или по специальности (должности).
--    Видны только числа показателей и имена (имена и должности и так видят все сотрудники). Права записи не меняются.

create table public.institutions (
  id         int generated always as identity primary key,
  name       text not null check (length(btrim(name)) between 2 and 120),
  kind       text not null default 'svp' check (kind in ('svp', 'hospital', 'external', 'other')),
  created_at timestamptz not null default now()
);
create unique index institutions_name_uq on public.institutions (lower(btrim(name)));

alter table public.profiles        add column institution_id int references public.institutions (id) on delete set null;
alter table public.access_requests add column institution_id int references public.institutions (id) on delete set null;
alter table public.access_requests add column institution_text text not null default '' check (length(institution_text) <= 120);
alter table public.invites         add column institution_id int references public.institutions (id) on delete set null;

create table public.scopes (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('institution', 'position')),
  institution_id int references public.institutions (id) on delete cascade,
  position_code  text check (position_code ~ '^[a-z_]{1,40}$'),
  granted_at     timestamptz not null default now(),
  check ((kind = 'institution' and institution_id is not null and position_code is null)
      or (kind = 'position' and position_code is not null and institution_id is null))
);
create unique index scopes_uq on public.scopes (user_id, kind, coalesce(institution_id, 0), coalesce(position_code, ''));
create index scopes_user_idx on public.scopes (user_id);

alter table public.institutions enable row level security;
alter table public.scopes       enable row level security;
-- список учреждений нужен и до входа (форма заявки): названия не секретны
create policy inst_read on public.institutions for select to anon, authenticated using (true);
create policy scopes_read on public.scopes for select to authenticated
  using (user_id = auth.uid() or private.has_role(auth.uid(), 'admin'));
revoke all on public.institutions, public.scopes from anon, authenticated;
grant select on public.institutions to anon, authenticated;
grant select on public.scopes to authenticated;

-- виден ли отчёт этого сотрудника по должности/учреждению смотрящему
create or replace function private.in_scope(_viewer uuid, _owner uuid, _position_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.scopes s
    where s.user_id = _viewer
      and ((s.kind = 'position' and s.position_code = _position_code)
        or (s.kind = 'institution' and s.institution_id is not null
            and s.institution_id = (select p.institution_id from public.profiles p where p.id = _owner)))
  ) and private.is_member(_viewer);
$$;

drop policy ind_read on public.indicator_reports;
create policy ind_read on public.indicator_reports for select to authenticated
  using (user_id = auth.uid() or private.is_manager(auth.uid()) or private.in_scope(auth.uid(), user_id, position_code));

-- ---------------------------------------------------------------- администратор: учреждения
create or replace function public.admin_save_institution(_id int, _name text, _kind text default 'svp')
returns int language plpgsql security definer set search_path = '' as $$
declare _n text := left(btrim(coalesce(_name, '')), 120); _k text := coalesce(nullif(_kind, ''), 'svp'); _r int;
begin
  perform private.require_admin();
  if length(_n) < 2 then raise exception 'bad_name'; end if;
  if _k not in ('svp', 'hospital', 'external', 'other') then raise exception 'bad_kind'; end if;
  if _id is null then
    insert into public.institutions (name, kind) values (_n, _k) returning id into _r;
    perform private.log_event('institution_added', _r::text, jsonb_build_object('name', _n));
  else
    update public.institutions set name = _n, kind = _k where id = _id returning id into _r;
    if _r is null then raise exception 'no_such_institution'; end if;
    perform private.log_event('institution_changed', _r::text, jsonb_build_object('name', _n));
  end if;
  return _r;
exception when unique_violation then raise exception 'institution_exists';
end $$;

-- добавить сразу много (по одному названию на строку); уже существующие пропускаются; возвращает сколько добавлено
create or replace function public.admin_add_institutions(_names text[], _kind text default 'svp')
returns int language plpgsql security definer set search_path = '' as $$
declare _n int; _k text := coalesce(nullif(_kind, ''), 'svp');
begin
  perform private.require_admin();
  if _k not in ('svp', 'hospital', 'external', 'other') then raise exception 'bad_kind'; end if;
  if array_length(_names, 1) > 300 then raise exception 'too_many'; end if;
  with ins as (
    insert into public.institutions (name, kind)
    select distinct on (lower(btrim(x))) left(btrim(x), 120), _k from unnest(coalesce(_names, '{}')) x
     where length(btrim(x)) >= 2
    on conflict do nothing
    returning id)
  select count(*) into _n from ins;
  perform private.log_event('institutions_added', null, jsonb_build_object('count', _n));
  return _n;
end $$;

create or replace function public.admin_delete_institution(_id int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.institutions where id = _id;
  perform private.log_event('institution_deleted', _id::text, '{}'::jsonb);
end $$;

create or replace function public.admin_set_institution(_uid uuid, _inst int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _inst is not null and not exists (select 1 from public.institutions where id = _inst) then raise exception 'no_such_institution'; end if;
  update public.profiles set institution_id = _inst where id = _uid and removed_at is null;
  if not found then raise exception 'no_such_user'; end if;
  perform private.log_event('user_institution_set', _uid::text, jsonb_build_object('institution', _inst));
end $$;

-- заменить области видимости сотрудника: учреждения и должности (специальности)
create or replace function public.admin_set_scopes(_uid uuid, _institutions int[], _positions text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles where id = _uid and removed_at is null) then raise exception 'no_such_user'; end if;
  if exists (select 1 from unnest(coalesce(_positions, '{}')) x where x !~ '^[a-z_]{1,40}$') then raise exception 'bad_position'; end if;
  delete from public.scopes where user_id = _uid;
  insert into public.scopes (user_id, kind, institution_id)
    select _uid, 'institution', i.id from public.institutions i where i.id = any (coalesce(_institutions, '{}'));
  insert into public.scopes (user_id, kind, position_code)
    select _uid, 'position', x from (select distinct unnest(coalesce(_positions, '{}')) x) q;
  perform private.log_event('scopes_set', _uid::text, jsonb_build_object('institutions', _institutions, 'positions', _positions));
end $$;

-- ---------------------------------------------------------------- список сотрудников: учреждение и области
drop function public.admin_list_users();
create function public.admin_list_users()
returns table (user_id uuid, full_name text, user_position text, telegram_username text,
               roles public.app_role[], folders int[], created_at timestamptz,
               institution_id int, scope_institutions int[], scope_positions text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.full_name, p.position, t.username,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
           coalesce((select array_agg(m.folder_id order by m.folder_id) from public.folder_members m where m.user_id = p.id), '{}'),
           p.created_at, p.institution_id,
           coalesce((select array_agg(s.institution_id order by s.institution_id) from public.scopes s where s.user_id = p.id and s.kind = 'institution'), '{}'),
           coalesce((select array_agg(s.position_code order by s.position_code) from public.scopes s where s.user_id = p.id and s.kind = 'position'), '{}')
    from public.profiles p left join public.telegram_links t on t.user_id = p.id
    where p.removed_at is null
    order by p.created_at;
end $$;

-- при закрытии доступа области тоже снимаются
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
    delete from public.scopes where user_id = _uid;
    update public.profiles set removed_at = now() where id = _uid;
    perform private.log_event('user_deactivated', _uid::text, jsonb_build_object('name', _name));
    return 'deactivated';
  end if;
  delete from auth.users where id = _uid;
  perform private.log_event('user_deleted', _uid::text, jsonb_build_object('name', _name));
  return 'deleted';
end $$;

-- ---------------------------------------------------------------- заявки и приглашения: учреждение
drop function public.submit_access_request(bigint, text, text, text, text, text);
create function public.submit_access_request(_tg_id bigint, _tg_username text, _tg_name text,
                                             _full_name text, _position text, _position_code text,
                                             _institution_id int default null, _institution_text text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare _fn text := left(btrim(coalesce(_full_name, '')), 200);
        _ps text := left(btrim(coalesce(_position, '')), 200);
        _pc text := case when coalesce(_position_code, '') ~ '^[a-z_]{1,40}$' then _position_code else '' end;
        _ii int := (select i.id from public.institutions i where i.id = _institution_id);
        _it text := left(btrim(coalesce(_institution_text, '')), 120);
        _st text;
begin
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id) then raise exception 'already_member'; end if;
  if length(_fn) < 3 then raise exception 'bad_full_name'; end if;
  if length(_ps) < 2 then raise exception 'bad_position'; end if;
  if (select count(*) from public.access_requests where telegram_id = _tg_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests';
  end if;

  select status into _st from public.access_requests
   where telegram_id = _tg_id and used_at is null and status in ('pending', 'approved') for update;
  if _st = 'approved' then return 'approved'; end if;
  if _st = 'pending' then
    update public.access_requests set full_name = _fn, position = _ps, position_code = _pc, tg_username = left(_tg_username, 64),
                                      tg_name = left(coalesce(_tg_name, ''), 200), institution_id = _ii, institution_text = _it
     where telegram_id = _tg_id and used_at is null and status = 'pending';
    return 'pending';
  end if;

  insert into public.access_requests (telegram_id, tg_username, tg_name, full_name, position, position_code, institution_id, institution_text)
  values (_tg_id, left(_tg_username, 64), left(coalesce(_tg_name, ''), 200), _fn, _ps, _pc, _ii, _it);
  insert into public.audit_log (actor, action, object, details)
  values (null, 'request_submitted', null, jsonb_build_object('name', _fn, 'position', _ps));
  return 'pending';
end $$;

-- администратор при одобрении может выбрать/поправить учреждение
drop function public.decide_request(uuid, boolean, public.app_role, int[]);
create function public.decide_request(_id uuid, _approve boolean, _role public.app_role, _folders int[], _institution_id int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare rq public.access_requests;
begin
  perform private.require_admin();
  select * into rq from public.access_requests where id = _id for update;
  if not found then raise exception 'no_such_request'; end if;
  if rq.status <> 'pending' or rq.used_at is not null then raise exception 'request_closed'; end if;
  if _approve then
    if _role is null then raise exception 'need_role'; end if;
    update public.access_requests
       set status = 'approved', role = _role, decided_at = now(), decided_by = auth.uid(),
           institution_id = coalesce((select i.id from public.institutions i where i.id = _institution_id), rq.institution_id),
           folder_ids = coalesce((select array_agg(f.id order by f.id) from public.folders f
                                   where f.id = any (coalesce(_folders, '{}')) and not f.restricted), '{}')
     where id = _id;
  else
    update public.access_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = _id;
  end if;
  perform private.log_event(case when _approve then 'request_approved' else 'request_rejected' end, _id::text,
                            jsonb_build_object('role', _role, 'name', rq.full_name, 'folders', _folders));
end $$;

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
  insert into public.profiles (id, full_name, position, institution_id) values (_uid, rq.full_name, rq.position, rq.institution_id)
  on conflict (id) do update set full_name = excluded.full_name, position = excluded.position,
                                 institution_id = excluded.institution_id, removed_at = null;
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

drop function private.make_invite(uuid, public.app_role, text, text, int[], int);
create function private.make_invite(_by uuid, _role public.app_role, _full_name text, _position text,
                                    _folders int[], _hours int, _institution_id int default null)
returns text language plpgsql security definer set search_path = '' as $$
declare _code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if _hours is null or _hours < 1 or _hours > 24 * 14 then raise exception 'bad_expiry'; end if;
  insert into public.invites (code_hash, role, full_name, position, folder_ids, created_by, expires_at, institution_id)
  values (encode(extensions.digest(_code, 'sha256'), 'hex'), _role,
          left(btrim(coalesce(_full_name, '')), 200), left(btrim(coalesce(_position, '')), 200),
          coalesce((select array_agg(f.id) from public.folders f where f.id = any (coalesce(_folders, '{}')) and not f.restricted), '{}'),
          _by, now() + make_interval(hours => _hours),
          (select i.id from public.institutions i where i.id = _institution_id));
  insert into public.audit_log (actor, action, object, details)
  values (_by, 'invite_created', null, jsonb_build_object('role', _role, 'name', _full_name, 'hours', _hours));
  return _code;
end $$;

drop function public.create_invite(public.app_role, text, text, int[], int);
create function public.create_invite(_role public.app_role, _full_name text, _position text,
                                     _folders int[], _days int, _institution_id int default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return private.make_invite(auth.uid(), _role, _full_name, _position, _folders, coalesce(_days, 3) * 24, _institution_id);
end $$;

create or replace function public.accept_invite(_code text, _uid uuid, _tg_id bigint, _tg_username text, _tg_name text)
returns public.app_role language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites
   where code_hash = encode(extensions.digest(coalesce(_code, ''), 'sha256'), 'hex')
   for update;
  if not found then raise exception 'invite_invalid'; end if;
  if inv.revoked_at is not null then raise exception 'invite_revoked'; end if;
  if inv.used_at is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id and user_id <> _uid) then
    raise exception 'telegram_taken';
  end if;

  update public.invites set used_at = now(), used_by = _uid where id = inv.id;
  insert into public.profiles (id, full_name, position, institution_id)
  values (_uid, coalesce(nullif(inv.full_name, ''), left(coalesce(_tg_name, ''), 200)), inv.position, inv.institution_id)
  on conflict (id) do update
    set full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        position  = coalesce(nullif(excluded.position, ''), public.profiles.position),
        institution_id = coalesce(excluded.institution_id, public.profiles.institution_id),
        removed_at = null;
  insert into public.telegram_links (user_id, telegram_id, username)
  values (_uid, _tg_id, _tg_username)
  on conflict (user_id) do update set telegram_id = excluded.telegram_id, username = excluded.username;
  insert into public.user_roles (user_id, role, granted_by) values (_uid, inv.role, inv.created_by)
  on conflict (user_id, role) do nothing;
  insert into public.folder_members (folder_id, user_id, added_by)
    select unnest(inv.folder_ids), _uid, inv.created_by
  on conflict do nothing;
  insert into public.audit_log (actor, action, object, details)
  values (_uid, 'invite_accepted', inv.id::text, jsonb_build_object('role', inv.role));
  return inv.role;
end $$;

-- ---------------------------------------------------------------- права
revoke execute on all functions in schema private from public;
grant execute on function private.in_scope(uuid, uuid, text) to authenticated;
revoke execute on function public.admin_save_institution(int, text, text), public.admin_add_institutions(text[], text),
                           public.admin_delete_institution(int), public.admin_set_institution(uuid, int),
                           public.admin_set_scopes(uuid, int[], text[]), public.admin_list_users(),
                           public.create_invite(public.app_role, text, text, int[], int, int),
                           public.decide_request(uuid, boolean, public.app_role, int[], int)
  from public, anon;
grant execute on function public.admin_save_institution(int, text, text), public.admin_add_institutions(text[], text),
                          public.admin_delete_institution(int), public.admin_set_institution(uuid, int),
                          public.admin_set_scopes(uuid, int[], text[]), public.admin_list_users(),
                          public.create_invite(public.app_role, text, text, int[], int, int),
                          public.decide_request(uuid, boolean, public.app_role, int[], int)
  to authenticated;
revoke execute on function public.submit_access_request(bigint, text, text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.submit_access_request(bigint, text, text, text, text, text, int, text) to service_role;
revoke execute on function public.admin_remove_user(uuid) from public, anon;
grant execute on function public.admin_remove_user(uuid) to authenticated;
revoke execute on function public.accept_request(bigint, uuid, text), public.accept_invite(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.accept_request(bigint, uuid, text), public.accept_invite(text, uuid, bigint, text, text) to service_role;
