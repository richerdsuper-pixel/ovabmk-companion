-- OvaBMҚ Companion — схема базы (Supabase / Postgres 15+)
-- Принципы:
--   * все таблицы под RLS; клиент (anon key) не может менять роли, приглашения и журнал напрямую;
--   * изменение ролей и приглашений — только через функции, которые проверяют роль admin на сервере;
--   * принятие приглашения — только Edge Function с ключом service_role;
--   * папка с restricted = true (№15) закрыта для всех, включая администратора;
--   * все SECURITY DEFINER функции с пустым search_path и полными именами объектов.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- типы и таблицы
create type public.app_role as enum ('admin', 'deputy', 'chief_physician', 'staff');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (length(full_name) <= 200),
  position    text not null default '' check (length(position) <= 200),
  created_at  timestamptz not null default now()
);

create table public.telegram_links (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  telegram_id bigint not null unique,
  username    text,
  linked_at   timestamptz not null default now()
);

create table public.user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users (id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique (user_id, role)
);

create table public.folders (
  id          int primary key check (id between 1 and 99),
  title_ru    text not null,
  title_uz    text not null,
  hint_ru     text not null default '',
  restricted  boolean not null default false
);

create table public.folder_members (
  folder_id   int  not null references public.folders (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  added_by    uuid references auth.users (id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (folder_id, user_id)
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  folder_id       int  not null references public.folders (id),
  title           text not null check (length(btrim(title)) between 1 and 300),
  doc_number      text check (length(doc_number) <= 100),
  doc_date        date,
  note            text check (length(note) <= 1000),
  storage_path    text unique check (storage_path is null or storage_path ~ '^[0-9]{1,2}/[0-9a-f-]{36}/[^/]{1,200}$'),
  file_name       text check (length(file_name) <= 200),
  file_size       bigint check (file_size between 0 and 20971520),
  mime_type       text check (length(mime_type) <= 150),
  no_patient_data boolean not null default false check (no_patient_data),  -- загрузчик подтвердил: в документе нет данных пациентов
  uploaded_by     uuid not null default auth.uid() references auth.users (id),
  created_at      timestamptz not null default now(),
  check (storage_path is null or split_part(storage_path, '/', 1)::int = folder_id)
);
create index documents_folder_idx on public.documents (folder_id, created_at desc);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  role        public.app_role not null,
  full_name   text not null default '' check (length(full_name) <= 200),
  position    text not null default '' check (length(position) <= 200),
  folder_ids  int[] not null default '{}',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);

create table public.audit_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor    uuid,
  action   text not null,
  object   text,
  details  jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------- проверки прав
create or replace function public.has_role(_uid uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = _uid and r.role = _role);
$$;

create or replace function public.is_member(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = _uid);
$$;

create or replace function public.is_manager(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r
                 where r.user_id = _uid and r.role in ('admin', 'deputy', 'chief_physician'));
$$;

-- Папка доступна: она не закрыта И (руководитель ИЛИ staff, назначенный в эту папку).
create or replace function public.can_access_folder(_uid uuid, _fid int)
returns boolean language sql stable security definer set search_path = '' as $$
  select _uid is not null
     and exists (select 1 from public.folders f where f.id = _fid and not f.restricted)
     and (public.is_manager(_uid)
          or (public.has_role(_uid, 'staff')
              and exists (select 1 from public.folder_members m where m.folder_id = _fid and m.user_id = _uid)));
$$;

-- Номер папки из пути в хранилище "<папка>/<uuid>/<файл>"; null, если путь чужого формата.
create or replace function public.folder_of_path(_name text)
returns int language sql immutable set search_path = '' as $$
  select case when _name ~ '^[0-9]{1,2}/' then split_part(_name, '/', 1)::int end;
$$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles        enable row level security;
alter table public.telegram_links  enable row level security;
alter table public.user_roles      enable row level security;
alter table public.folders         enable row level security;
alter table public.folder_members  enable row level security;
alter table public.documents       enable row level security;
alter table public.invites         enable row level security;
alter table public.audit_log       enable row level security;

-- профили сотрудников видят все, у кого есть роль (имена загрузивших и т. п.)
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member(auth.uid()));

create policy tg_read on public.telegram_links for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- свои роли видит каждый; все роли — только admin. Писать в таблицу ролей клиент не может.
create policy roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy folders_read on public.folders for select to authenticated
  using (public.is_member(auth.uid()));

create policy members_read on public.folder_members for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));

create policy documents_read on public.documents for select to authenticated
  using (public.can_access_folder(auth.uid(), folder_id));

create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_access_folder(auth.uid(), folder_id) and uploaded_by = auth.uid());

create policy documents_delete on public.documents for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') and public.can_access_folder(auth.uid(), folder_id));

create policy invites_read on public.invites for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy audit_read on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- лишние права у anon убираем полностью (RLS и так закрывает, это второй замок)
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- журнал
create or replace function public.log_event(_action text, _object text, _details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), _action, _object, coalesce(_details, '{}'::jsonb));
$$;

create or replace function public.trg_documents_audit()
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
create trigger documents_audit after insert or delete on public.documents
  for each row execute function public.trg_documents_audit();

-- ---------------------------------------------------------------- функции для интерфейса
-- Число документов по папкам (с учётом прав вызывающего: security invoker).
create or replace function public.folder_counts()
returns table (folder_id int, docs bigint) language sql stable security invoker set search_path = '' as $$
  select d.folder_id, count(*) from public.documents d group by d.folder_id;
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function public.admin_list_users()
returns table (user_id uuid, full_name text, user_position text, telegram_username text,
               roles public.app_role[], folders int[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
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
  perform public.require_admin();
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
  perform public.log_event(case when _on then 'role_granted' else 'role_revoked' end, _uid::text, jsonb_build_object('role', _role));
end $$;

create or replace function public.admin_set_folders(_uid uuid, _folders int[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.folder_members where user_id = _uid and folder_id <> all (coalesce(_folders, '{}'));
  insert into public.folder_members (folder_id, user_id, added_by)
    select f.id, _uid, auth.uid() from public.folders f where f.id = any (coalesce(_folders, '{}')) and not f.restricted
  on conflict do nothing;
  perform public.log_event('folders_set', _uid::text, jsonb_build_object('folders', _folders));
end $$;

create or replace function public.admin_update_profile(_uid uuid, _full_name text, _position text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.profiles set full_name = left(btrim(coalesce(_full_name, '')), 200),
                             position  = left(btrim(coalesce(_position, '')), 200)
  where id = _uid;
  perform public.log_event('profile_updated', _uid::text, '{}'::jsonb);
end $$;

-- Внутренняя: создать приглашение и вернуть код (код хранится только в виде хеша).
create or replace function public.make_invite(_by uuid, _role public.app_role, _full_name text, _position text,
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

-- Для администратора в интерфейсе.
create or replace function public.create_invite(_role public.app_role, _full_name text, _position text,
                                                _folders int[], _days int)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return public.make_invite(auth.uid(), _role, _full_name, _position, _folders, coalesce(_days, 3) * 24);
end $$;

create or replace function public.revoke_invite(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  update public.invites set revoked_at = now() where id = _id and used_at is null and revoked_at is null;
  perform public.log_event('invite_revoked', _id::text, '{}'::jsonb);
end $$;

-- Только для Edge Function (service_role): принять приглашение атомарно.
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
  insert into public.profiles (id, full_name, position)
  values (_uid, coalesce(nullif(inv.full_name, ''), left(coalesce(_tg_name, ''), 200)), inv.position)
  on conflict (id) do update
    set full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        position  = coalesce(nullif(excluded.position, ''), public.profiles.position);
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

-- Только для Edge Function: найти пользователя по Telegram ID.
create or replace function public.user_by_telegram(_tg_id bigint)
returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from public.telegram_links where telegram_id = _tg_id;
$$;

create or replace function public.touch_telegram(_uid uuid, _tg_username text)
returns void language sql security definer set search_path = '' as $$
  update public.telegram_links set username = _tg_username where user_id = _uid;
  insert into public.audit_log (actor, action) values (_uid, 'login');
$$;

-- ---------------------------------------------------------------- права на функции
revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_role(uuid, public.app_role), public.is_member(uuid), public.is_manager(uuid),
                          public.can_access_folder(uuid, int), public.folder_of_path(text),
                          public.folder_counts(), public.admin_list_users(),
                          public.admin_set_role(uuid, public.app_role, boolean), public.admin_set_folders(uuid, int[]),
                          public.admin_update_profile(uuid, text, text),
                          public.create_invite(public.app_role, text, text, int[], int), public.revoke_invite(uuid)
  to authenticated;
revoke execute on function public.make_invite(uuid, public.app_role, text, text, int[], int),
                           public.accept_invite(text, uuid, bigint, text, text),
                           public.user_by_telegram(bigint), public.touch_telegram(uuid, text),
                           public.log_event(text, text, jsonb), public.require_admin(),
                           public.trg_documents_audit()
  from authenticated;
grant execute on function public.accept_invite(text, uuid, bigint, text, text),
                          public.user_by_telegram(bigint), public.touch_telegram(uuid, text)
  to service_role;
-- require_admin и log_event вызываются только изнутри других SECURITY DEFINER функций (владелец — postgres).

-- ---------------------------------------------------------------- хранилище файлов
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_access_folder(auth.uid(), public.folder_of_path(name)));

create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_folder(auth.uid(), public.folder_of_path(name)));

create policy documents_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.has_role(auth.uid(), 'admin')
         and public.can_access_folder(auth.uid(), public.folder_of_path(name)));
