-- 0014: активация офлайн-программы.
-- Должность в офлайн-программе назначает только администратор на сайте (profiles.offline_role).
-- Сотрудник, принятый на сайте, получает подписанный ключ активации (Edge Function offline-key);
-- офлайн-программа проверяет подпись и по ключу сама включает нужные вкладки — сменить должность в ней нельзя.
-- В ключ входит открытый ключ шифрования администратора: файлы доя шифруются им и открываются только у администратора.

alter table public.profiles add column offline_role text check (offline_role in ('cab', 'pat', 'coord'));

-- настройки сайта (закрытая таблица): сейчас — открытый ключ шифрования администратора из его офлайн-программы
create table public.app_settings (
  k          text primary key check (k ~ '^[a-z_]{1,40}$'),
  v          jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;

create or replace function public.admin_set_offline_role(_uid uuid, _role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _role is not null and _role not in ('cab', 'pat', 'coord') then raise exception 'bad_role'; end if;
  if _role = 'coord' and not private.has_role(_uid, 'admin') then raise exception 'coord_admin_only'; end if;
  update public.profiles set offline_role = _role where id = _uid;
  if not found then raise exception 'no_user'; end if;
  perform private.log_event('offline_role', _uid::text, jsonb_build_object('role', _role));
end $$;

create or replace function public.admin_offline_roles()
returns table (user_id uuid, offline_role text) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select p.id, p.offline_role from public.profiles p where p.offline_role is not null;
end $$;

-- открытый ключ шифрования администратора (две половины точки P-256 в base64url)
create or replace function public.admin_set_offline_key(_x text, _y text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _x !~ '^[A-Za-z0-9_-]{43}$' or _y !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad_key'; end if;
  insert into public.app_settings (k, v, updated_by) values ('offline_admin_key', jsonb_build_object('x', _x, 'y', _y), auth.uid())
  on conflict (k) do update set v = excluded.v, updated_by = excluded.updated_by, updated_at = now();
  perform private.log_event('offline_key', 'app_settings', '{}'::jsonb);
end $$;

create or replace function public.admin_get_offline_key()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (select s.v from public.app_settings s where s.k = 'offline_admin_key');
end $$;

-- что входит в ключ активации текущего пользователя (вызывает Edge Function offline-key от имени пользователя)
create or replace function public.my_offline_activation()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _p record; _key jsonb;
begin
  if auth.uid() is null or not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select p.full_name, p.position, p.offline_role, i.name as inst into _p
    from public.profiles p left join public.institutions i on i.id = p.institution_id where p.id = auth.uid();
  if _p.offline_role is null then raise exception 'no_offline_role'; end if;
  _key := (select s.v from public.app_settings s where s.k = 'offline_admin_key');
  if _key is null and _p.offline_role <> 'coord' then raise exception 'no_admin_key'; end if;
  perform private.log_event('offline_activation', auth.uid()::text, jsonb_build_object('role', _p.offline_role));
  return jsonb_build_object('uid', auth.uid(), 'role', _p.offline_role, 'name', _p.full_name, 'pos', _p.position, 'inst', coalesce(_p.inst, ''), 'k', _key);
end $$;

-- то же для любого сотрудника — ключ выдаёт администратор и сам отправляет его сотруднику
create or replace function public.admin_offline_activation(_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _p record; _key jsonb;
begin
  perform private.require_admin();
  if not private.is_member(_uid) then raise exception 'no_user'; end if;
  select p.full_name, p.position, p.offline_role, i.name as inst into _p
    from public.profiles p left join public.institutions i on i.id = p.institution_id where p.id = _uid;
  if _p.offline_role is null then raise exception 'no_offline_role'; end if;
  _key := (select s.v from public.app_settings s where s.k = 'offline_admin_key');
  if _key is null and _p.offline_role <> 'coord' then raise exception 'no_admin_key'; end if;
  perform private.log_event('offline_activation', _uid::text, jsonb_build_object('role', _p.offline_role, 'by_admin', true));
  return jsonb_build_object('uid', _uid, 'role', _p.offline_role, 'name', _p.full_name, 'pos', _p.position, 'inst', coalesce(_p.inst, ''), 'k', _key);
end $$;

revoke all on function public.admin_set_offline_role(uuid, text), public.admin_offline_roles(), public.admin_set_offline_key(text, text),
  public.admin_get_offline_key(), public.my_offline_activation(), public.admin_offline_activation(uuid) from public, anon;
grant execute on function public.admin_set_offline_role(uuid, text), public.admin_offline_roles(), public.admin_set_offline_key(text, text),
  public.admin_get_offline_key(), public.my_offline_activation(), public.admin_offline_activation(uuid) to authenticated;

-- закрытый ключ подписи ключей активации (ECDSA P-256, JWK). Хранится в закрытой таблице; значение вносится отдельно (не в миграции),
-- читает его только Edge Function offline-key от имени сервиса. Открытая половина встроена в офлайн-программу (offline/sign_pub.json).
create table private.offline_sign_key (
  id  boolean primary key default true check (id),
  jwk jsonb not null
);
alter table private.offline_sign_key enable row level security;
revoke all on private.offline_sign_key from public, anon, authenticated;
create or replace function public.offline_sign_jwk()
returns jsonb language sql stable security definer set search_path = '' as $$ select k.jwk from private.offline_sign_key k where k.id $$;
revoke all on function public.offline_sign_jwk() from public, anon, authenticated;
grant execute on function public.offline_sign_jwk() to service_role;
