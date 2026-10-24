-- Заявки на доступ по общей ссылке.
-- Сотрудник входит через Telegram без приглашения, пишет ФИО и должность -> заявка "pending".
-- Администратор на сайте одобряет (выбирает роль и папки) или отклоняет.
-- После одобрения сотрудник снова нажимает «Войти через Telegram» и получает доступ.
-- Учётная запись в auth.users создаётся только после одобрения; до этого у человека нет сессии и нет доступа к данным.

create table public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  bigint not null,
  tg_username  text check (length(tg_username) <= 64),
  tg_name      text not null default '' check (length(tg_name) <= 200),
  full_name    text not null check (length(btrim(full_name)) between 3 and 200),
  position     text not null check (length(btrim(position)) between 2 and 200),
  position_code text not null default '' check (position_code ~ '^[a-z_]{0,40}$'),  -- код из списка должностей сайта (docs/positions.js)
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  role         public.app_role,
  folder_ids   int[] not null default '{}',
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users (id) on delete set null,
  used_at      timestamptz,
  used_by      uuid references auth.users (id) on delete set null,
  check (status <> 'approved' or role is not null)
);
-- у одного Telegram может быть только одна открытая заявка (ожидает или одобрена и ещё не использована)
create unique index access_requests_open_tg on public.access_requests (telegram_id)
  where used_at is null and status in ('pending', 'approved');
create index access_requests_created_idx on public.access_requests (created_at desc);

alter table public.access_requests enable row level security;
create policy requests_read on public.access_requests for select to authenticated
  using (private.has_role(auth.uid(), 'admin'));
revoke all on public.access_requests from anon;

-- ---------------------------------------------------------------- для Edge Function (service_role)
-- Состояние заявки этого Telegram: none | pending | approved | rejected
create or replace function public.request_state(_tg_id bigint)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.status from public.access_requests r
      where r.telegram_id = _tg_id and r.used_at is null
      order by (r.status <> 'rejected') desc, r.created_at desc limit 1),
    'none');
$$;

-- Подать заявку (или обновить ФИО/должность в ещё не рассмотренной).
create or replace function public.submit_access_request(_tg_id bigint, _tg_username text, _tg_name text,
                                                         _full_name text, _position text, _position_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare _fn text := left(btrim(coalesce(_full_name, '')), 200);
        _ps text := left(btrim(coalesce(_position, '')), 200);
        _pc text := case when coalesce(_position_code, '') ~ '^[a-z_]{1,40}$' then _position_code else '' end;
        _st text;
begin
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id) then raise exception 'already_member'; end if;
  if length(_fn) < 3 then raise exception 'bad_full_name'; end if;
  if length(_ps) < 2 then raise exception 'bad_position'; end if;
  -- защита от засорения: не больше 5 заявок с одного Telegram за сутки
  if (select count(*) from public.access_requests where telegram_id = _tg_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests';
  end if;

  select status into _st from public.access_requests
   where telegram_id = _tg_id and used_at is null and status in ('pending', 'approved') for update;
  if _st = 'approved' then return 'approved'; end if;
  if _st = 'pending' then
    update public.access_requests set full_name = _fn, position = _ps, position_code = _pc, tg_username = left(_tg_username, 64),
                                      tg_name = left(coalesce(_tg_name, ''), 200)
     where telegram_id = _tg_id and used_at is null and status = 'pending';
    return 'pending';
  end if;

  insert into public.access_requests (telegram_id, tg_username, tg_name, full_name, position, position_code)
  values (_tg_id, left(_tg_username, 64), left(coalesce(_tg_name, ''), 200), _fn, _ps, _pc);
  insert into public.audit_log (actor, action, object, details)
  values (null, 'request_submitted', null, jsonb_build_object('name', _fn, 'position', _ps));
  return 'pending';
end $$;

-- Принять одобренную заявку: профиль, Telegram, роль, папки (атомарно).
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
  on conflict (id) do update set full_name = excluded.full_name, position = excluded.position;
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

-- ---------------------------------------------------------------- для администратора
create or replace function public.decide_request(_id uuid, _approve boolean, _role public.app_role, _folders int[])
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
           folder_ids = coalesce((select array_agg(f.id order by f.id) from public.folders f
                                   where f.id = any (coalesce(_folders, '{}')) and not f.restricted), '{}')
     where id = _id;
  else
    update public.access_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = _id;
  end if;
  perform private.log_event(case when _approve then 'request_approved' else 'request_rejected' end, _id::text,
                            jsonb_build_object('role', _role, 'name', rq.full_name, 'folders', _folders));
end $$;

-- ---------------------------------------------------------------- права
revoke execute on function public.request_state(bigint),
                           public.submit_access_request(bigint, text, text, text, text, text),
                           public.accept_request(bigint, uuid, text),
                           public.decide_request(uuid, boolean, public.app_role, int[])
  from public, anon, authenticated;
grant execute on function public.request_state(bigint),
                          public.submit_access_request(bigint, text, text, text, text, text),
                          public.accept_request(bigint, uuid, text)
  to service_role;
grant execute on function public.decide_request(uuid, boolean, public.app_role, int[]) to authenticated;
