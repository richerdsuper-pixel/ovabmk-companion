-- Рассылки (файл → получатели → кто открыл и скачал) и задания («топширик»).
--  * Файл лежит в закрытом хранилище broadcasts; загружает и удаляет только администратор.
--  * Скачивание выдаёт Edge Function bc-file: она вызывает broadcast_download от имени пользователя (журнал ведёт сервер), затем подписывает ссылку.
--    Получатели прямого доступа к хранилищу не имеют, поэтому обойти журнал нельзя.
--  * Новая версия того же файла заменяет старую: получатели видят свежую, статусы «открыл/скачал» считаются по текущей версии.
--  * Таблицы закрыты RLS без политик: всё через функции.

create table public.broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(btrim(title)) between 1 and 200),
  note       text check (length(note) <= 2000),
  urgent     boolean not null default false,
  audience   jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.broadcast_versions (
  id           bigint generated always as identity primary key,
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  version      int not null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9]{1,15}/[^/]{1,200}$'),
  file_name    text not null check (length(file_name) between 1 and 200),
  file_size    bigint check (file_size between 0 and 20971520),
  created_at   timestamptz not null default now(),
  unique (broadcast_id, version)
);
create table public.broadcast_recipients (
  broadcast_id     uuid not null references public.broadcasts (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  notified_at      timestamptz,
  notified_version int,
  primary key (broadcast_id, user_id)
);
create index broadcast_recipients_user_idx on public.broadcast_recipients (user_id);
create table public.broadcast_events (
  id           bigint generated always as identity primary key,
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  version      int not null,
  user_id      uuid references auth.users (id) on delete cascade,
  action       text not null check (action in ('view', 'download')),
  at           timestamptz not null default now()
);
create index broadcast_events_idx on public.broadcast_events (broadcast_id, version, user_id, action);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 1 and 200),
  body         text check (length(body) <= 4000),
  due_date     date,
  urgent       boolean not null default false,
  broadcast_id uuid references public.broadcasts (id) on delete set null,
  audience     jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create table public.task_recipients (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  notified_at timestamptz,
  seen_at     timestamptz,
  done_at     timestamptz,
  note        text check (length(note) <= 1000),
  primary key (task_id, user_id)
);
create index task_recipients_user_idx on public.task_recipients (user_id);

alter table public.broadcasts           enable row level security;
alter table public.broadcast_versions   enable row level security;
alter table public.broadcast_recipients enable row level security;
alter table public.broadcast_events     enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_recipients      enable row level security;
revoke all on public.broadcasts, public.broadcast_versions, public.broadcast_recipients, public.broadcast_events,
              public.tasks, public.task_recipients from anon, authenticated;

-- ---------------------------------------------------------------- хранилище
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broadcasts', 'broadcasts', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create policy broadcasts_files_admin_read   on storage.objects for select to authenticated
  using (bucket_id = 'broadcasts' and private.has_role(auth.uid(), 'admin'));
create policy broadcasts_files_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'broadcasts' and private.has_role(auth.uid(), 'admin'));
create policy broadcasts_files_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'broadcasts' and private.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- аудитория
-- _aud = {"all":true} | {"positions":["Главный врач"], "institutions":[3,4], "users":["uuid"]}; только действующие участники
create or replace function private.resolve_audience(_aud jsonb)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  from public.profiles p
  where p.removed_at is null and private.is_member(p.id)
    and (coalesce((_aud ->> 'all')::boolean, false)
      or p.id in (select (jsonb_array_elements_text(coalesce(_aud -> 'users', '[]'::jsonb)))::uuid)
      or p.institution_id in (select (jsonb_array_elements_text(coalesce(_aud -> 'institutions', '[]'::jsonb)))::int)
      or lower(btrim(p.position)) in (select lower(btrim(x)) from jsonb_array_elements_text(coalesce(_aud -> 'positions', '[]'::jsonb)) x));
$$;

-- ---------------------------------------------------------------- рассылки: администратор
-- Опубликовать файл: _id null → новая рассылка (id нужен заранее для пути файла, поэтому передаётся всегда); если такая есть — новая версия.
create or replace function public.admin_publish_broadcast(_id uuid, _title text, _note text, _urgent boolean, _audience jsonb,
                                                          _path text, _file_name text, _size bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _ver int; _users uuid[]; _n int; _t text := left(btrim(coalesce(_title, '')), 200);
begin
  perform private.require_admin();
  if _id is null or length(_t) < 1 then raise exception 'bad_title'; end if;
  if _path is null or _path !~ '^[0-9a-f-]{36}/[0-9]{1,15}/[^/]{1,200}$' or split_part(_path, '/', 1) <> _id::text then raise exception 'bad_path'; end if;
  _users := private.resolve_audience(coalesce(_audience, '{}'::jsonb));
  if exists (select 1 from public.broadcasts where id = _id) then
    update public.broadcasts set title = _t, note = left(_note, 2000), urgent = coalesce(_urgent, false), updated_at = now() where id = _id;
    select coalesce(max(version), 0) + 1 into _ver from public.broadcast_versions where broadcast_id = _id;
  else
    if coalesce(array_length(_users, 1), 0) = 0 then raise exception 'no_recipients'; end if;
    insert into public.broadcasts (id, title, note, urgent, audience, created_by)
    values (_id, _t, left(_note, 2000), coalesce(_urgent, false), coalesce(_audience, '{}'::jsonb), auth.uid());
    _ver := 1;
  end if;
  insert into public.broadcast_versions (broadcast_id, version, storage_path, file_name, file_size)
  values (_id, _ver, _path, left(coalesce(_file_name, 'file'), 200), _size);
  insert into public.broadcast_recipients (broadcast_id, user_id) select _id, u from unnest(_users) u on conflict do nothing;
  select count(*) into _n from public.broadcast_recipients where broadcast_id = _id;
  perform private.log_event('broadcast_published', _id::text, jsonb_build_object('title', _t, 'version', _ver, 'urgent', coalesce(_urgent, false), 'recipients', _n));
  return jsonb_build_object('id', _id, 'version', _ver, 'recipients', _n);
end $$;

create or replace function public.admin_delete_broadcast(_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare _paths text[];
begin
  perform private.require_admin();
  select coalesce(array_agg(storage_path), '{}') into _paths from public.broadcast_versions where broadcast_id = _id;
  delete from public.broadcasts where id = _id;
  perform private.log_event('broadcast_deleted', _id::text, '{}'::jsonb);
  return _paths;
end $$;

create or replace function public.admin_list_broadcasts()
returns table (id uuid, title text, note text, urgent boolean, version int, file_name text, file_size bigint, updated_at timestamptz,
               total int, notified int, viewed int, downloaded int)
language sql stable security definer set search_path = '' as $$
  select b.id, b.title, b.note, b.urgent, v.version, v.file_name, v.file_size, b.updated_at,
         (select count(*)::int from public.broadcast_recipients r where r.broadcast_id = b.id),
         (select count(*)::int from public.broadcast_recipients r where r.broadcast_id = b.id and r.notified_version = v.version),
         (select count(distinct e.user_id)::int from public.broadcast_events e where e.broadcast_id = b.id and e.version = v.version and e.action = 'view'
            and exists (select 1 from public.broadcast_recipients r where r.broadcast_id = b.id and r.user_id = e.user_id)),
         (select count(distinct e.user_id)::int from public.broadcast_events e where e.broadcast_id = b.id and e.version = v.version and e.action = 'download'
            and exists (select 1 from public.broadcast_recipients r where r.broadcast_id = b.id and r.user_id = e.user_id))
  from public.broadcasts b
  join public.broadcast_versions v on v.broadcast_id = b.id and v.version = (select max(version) from public.broadcast_versions x where x.broadcast_id = b.id)
  where private.has_role(auth.uid(), 'admin')
  order by b.updated_at desc;
$$;

create or replace function public.admin_broadcast_status(_id uuid)
returns table (user_id uuid, full_name text, user_position text, institution_id int, notified_at timestamptz, notified_version int,
               viewed boolean, first_view timestamptz, last_view timestamptz, downloaded boolean, last_download timestamptz, views int, downloads int)
language plpgsql stable security definer set search_path = '' as $$
declare _ver int;
begin
  perform private.require_admin();
  select max(v.version) into _ver from public.broadcast_versions v where v.broadcast_id = _id;
  return query
  select r.user_id, p.full_name, p."position", p.institution_id, r.notified_at, r.notified_version,
         exists (select 1 from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'view'),
         (select min(e.at) from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'view'),
         (select max(e.at) from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'view'),
         exists (select 1 from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'download'),
         (select max(e.at) from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'download'),
         (select count(*)::int from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'view'),
         (select count(*)::int from public.broadcast_events e where e.broadcast_id = _id and e.version = _ver and e.user_id = r.user_id and e.action = 'download')
  from public.broadcast_recipients r join public.profiles p on p.id = r.user_id
  where r.broadcast_id = _id
  order by p.full_name;
end $$;

-- ---------------------------------------------------------------- рассылки: получатель
create or replace function public.my_broadcasts()
returns table (id uuid, title text, note text, urgent boolean, version int, file_name text, file_size bigint, updated_at timestamptz, viewed boolean, downloaded boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.title, b.note, b.urgent, v.version, v.file_name, v.file_size, b.updated_at,
         exists (select 1 from public.broadcast_events e where e.broadcast_id = b.id and e.version = v.version and e.user_id = auth.uid() and e.action = 'view'),
         exists (select 1 from public.broadcast_events e where e.broadcast_id = b.id and e.version = v.version and e.user_id = auth.uid() and e.action = 'download')
  from public.broadcast_recipients r
  join public.broadcasts b on b.id = r.broadcast_id
  join public.broadcast_versions v on v.broadcast_id = b.id and v.version = (select max(version) from public.broadcast_versions x where x.broadcast_id = b.id)
  where r.user_id = auth.uid() and private.is_member(auth.uid())
  order by b.updated_at desc;
$$;

-- отметка «открыл» (не чаще раза в 10 минут от одного человека)
create or replace function public.broadcast_view(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare _ver int;
begin
  if not exists (select 1 from public.broadcast_recipients where broadcast_id = _id and user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select max(version) into _ver from public.broadcast_versions where broadcast_id = _id;
  if _ver is null then return; end if;
  if not exists (select 1 from public.broadcast_events where broadcast_id = _id and version = _ver and user_id = auth.uid() and action = 'view' and at > now() - interval '10 minutes') then
    insert into public.broadcast_events (broadcast_id, version, user_id, action) values (_id, _ver, auth.uid(), 'view');
  end if;
end $$;

-- вызывается Edge Function bc-file от имени пользователя: проверяет доступ, пишет «скачал», возвращает путь к файлу
create or replace function public.broadcast_download(_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare _ver int; _path text; _rcp boolean;
begin
  _rcp := exists (select 1 from public.broadcast_recipients where broadcast_id = _id and user_id = auth.uid());
  if not (_rcp or private.has_role(auth.uid(), 'admin')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select version, storage_path into _ver, _path from public.broadcast_versions where broadcast_id = _id order by version desc limit 1;
  if _path is null then raise exception 'no_file'; end if;
  if _rcp then insert into public.broadcast_events (broadcast_id, version, user_id, action) values (_id, _ver, auth.uid(), 'download'); end if;
  return _path;
end $$;

-- ---------------------------------------------------------------- Telegram-уведомления (вызывает Edge Function tg-notify от имени администратора)
-- кому слать: впервые/о новой версии; при _remind — только тем, кто ещё не открыл (рассылка) или не выполнил (задание)
create or replace function public.admin_notify_targets(_kind text, _id uuid, _remind boolean default false)
returns table (user_id uuid, telegram_id bigint, title text, urgent boolean, due_date date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _kind = 'broadcast' then
    return query
    select r.user_id, tl.telegram_id, b.title, b.urgent, null::date
    from public.broadcast_recipients r join public.broadcasts b on b.id = r.broadcast_id
    join public.telegram_links tl on tl.user_id = r.user_id
    where r.broadcast_id = _id
      and (case when _remind then not exists (select 1 from public.broadcast_events e where e.broadcast_id = _id
                   and e.version = (select max(version) from public.broadcast_versions x where x.broadcast_id = _id) and e.user_id = r.user_id and e.action = 'view')
                else r.notified_version is distinct from (select max(version) from public.broadcast_versions x where x.broadcast_id = _id) end);
  elsif _kind = 'task' then
    return query
    select r.user_id, tl.telegram_id, t.title, t.urgent, t.due_date
    from public.task_recipients r join public.tasks t on t.id = r.task_id
    join public.telegram_links tl on tl.user_id = r.user_id
    where r.task_id = _id and (case when _remind then r.done_at is null else r.notified_at is null end);
  else raise exception 'bad_kind';
  end if;
end $$;

create or replace function public.admin_mark_notified(_kind text, _id uuid, _users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _kind = 'broadcast' then
    update public.broadcast_recipients set notified_at = now(), notified_version = (select max(version) from public.broadcast_versions x where x.broadcast_id = _id)
    where broadcast_id = _id and user_id = any (_users);
  elsif _kind = 'task' then
    update public.task_recipients set notified_at = now() where task_id = _id and user_id = any (_users);
  else raise exception 'bad_kind';
  end if;
end $$;

-- ---------------------------------------------------------------- задания
create or replace function public.admin_create_task(_title text, _body text, _due date, _urgent boolean, _audience jsonb, _broadcast uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid; _users uuid[]; _t text := left(btrim(coalesce(_title, '')), 200);
begin
  perform private.require_admin();
  if length(_t) < 1 then raise exception 'bad_title'; end if;
  _users := private.resolve_audience(coalesce(_audience, '{}'::jsonb));
  if coalesce(array_length(_users, 1), 0) = 0 then raise exception 'no_recipients'; end if;
  insert into public.tasks (title, body, due_date, urgent, broadcast_id, audience, created_by)
  values (_t, left(_body, 4000), _due, coalesce(_urgent, false), (select b.id from public.broadcasts b where b.id = _broadcast), coalesce(_audience, '{}'::jsonb), auth.uid())
  returning id into _id;
  insert into public.task_recipients (task_id, user_id) select _id, u from unnest(_users) u;
  perform private.log_event('task_created', _id::text, jsonb_build_object('title', _t, 'recipients', array_length(_users, 1), 'due', _due));
  return _id;
end $$;

create or replace function public.admin_delete_task(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.tasks where id = _id;
  perform private.log_event('task_deleted', _id::text, '{}'::jsonb);
end $$;

create or replace function public.admin_list_tasks()
returns table (id uuid, title text, body text, due_date date, urgent boolean, broadcast_id uuid, created_at timestamptz, total int, seen int, done int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.body, t.due_date, t.urgent, t.broadcast_id, t.created_at,
         (select count(*)::int from public.task_recipients r where r.task_id = t.id),
         (select count(*)::int from public.task_recipients r where r.task_id = t.id and r.seen_at is not null),
         (select count(*)::int from public.task_recipients r where r.task_id = t.id and r.done_at is not null)
  from public.tasks t where private.has_role(auth.uid(), 'admin')
  order by (select count(*) from public.task_recipients r where r.task_id = t.id and r.done_at is null) = 0, t.due_date nulls last, t.created_at desc;
$$;

create or replace function public.admin_task_status(_id uuid)
returns table (user_id uuid, full_name text, user_position text, institution_id int, notified_at timestamptz, seen_at timestamptz, done_at timestamptz, note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select r.user_id, p.full_name, p."position", p.institution_id, r.notified_at, r.seen_at, r.done_at, r.note
  from public.task_recipients r join public.profiles p on p.id = r.user_id where r.task_id = _id order by p.full_name;
end $$;

create or replace function public.my_tasks()
returns table (id uuid, title text, body text, due_date date, urgent boolean, broadcast_id uuid, created_at timestamptz, seen_at timestamptz, done_at timestamptz, note text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.body, t.due_date, t.urgent, t.broadcast_id, t.created_at, r.seen_at, r.done_at, r.note
  from public.task_recipients r join public.tasks t on t.id = r.task_id
  where r.user_id = auth.uid() and private.is_member(auth.uid())
  order by r.done_at is not null, t.due_date nulls last, t.created_at desc;
$$;

create or replace function public.task_seen(_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.task_recipients set seen_at = now() where task_id = _id and user_id = auth.uid() and seen_at is null;
$$;

create or replace function public.task_done(_id uuid, _note text default null, _done boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.task_recipients set done_at = case when _done then coalesce(done_at, now()) else null end, seen_at = coalesce(seen_at, now()), note = left(_note, 1000)
  where task_id = _id and user_id = auth.uid();
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- права
revoke execute on function private.resolve_audience(jsonb) from public;
revoke execute on function public.admin_publish_broadcast(uuid, text, text, boolean, jsonb, text, text, bigint), public.admin_delete_broadcast(uuid),
  public.admin_list_broadcasts(), public.admin_broadcast_status(uuid), public.my_broadcasts(), public.broadcast_view(uuid), public.broadcast_download(uuid),
  public.admin_notify_targets(text, uuid, boolean), public.admin_mark_notified(text, uuid, uuid[]),
  public.admin_create_task(text, text, date, boolean, jsonb, uuid), public.admin_delete_task(uuid), public.admin_list_tasks(), public.admin_task_status(uuid),
  public.my_tasks(), public.task_seen(uuid), public.task_done(uuid, text, boolean) from public, anon;
grant execute on function public.admin_publish_broadcast(uuid, text, text, boolean, jsonb, text, text, bigint), public.admin_delete_broadcast(uuid),
  public.admin_list_broadcasts(), public.admin_broadcast_status(uuid), public.my_broadcasts(), public.broadcast_view(uuid), public.broadcast_download(uuid),
  public.admin_notify_targets(text, uuid, boolean), public.admin_mark_notified(text, uuid, uuid[]),
  public.admin_create_task(text, text, date, boolean, jsonb, uuid), public.admin_delete_task(uuid), public.admin_list_tasks(), public.admin_task_status(uuid),
  public.my_tasks(), public.task_seen(uuid), public.task_done(uuid, text, boolean) to authenticated;
