-- Простая регистрация: сначала анкета на сайте (ФИО, телефон, место работы, должности со ставками),
-- потом одна кнопка — бот @OvaBMQbot, «Старт». Окно входа Telegram и повторное подтверждение после одобрения не нужны.
-- «Билет входа»: сайт создаёт два случайных кода — start (уходит в ссылку t.me/бот?start=…) и poll (остаётся в браузере);
-- бот по /start привязывает Telegram к билету и подаёт заявку; сайт по poll-коду узнаёт, что делать дальше.
-- В базе хранятся только хеши кодов. Папки открываются по всем выбранным должностям (как в docs/positions.js).

-- ---------------------------------------------------------------- должности: папки и роль на сервере
alter table private.position_names add column folders int[] not null default '{}';
alter table private.position_names add column role public.app_role not null default 'staff';
update private.position_names n set folders = v.f, role = v.r::public.app_role
from (values
('doya_qvp', '{9,10,12,13}'::int[], 'staff'),
('akusher_ginekolog', '{7,9,10,12,13,14}'::int[], 'staff'),
('oilaviy_shifokor', '{5,8,9,10,12,13,19}'::int[], 'staff'),
('patronaj_hamshira', '{5,9,10}'::int[], 'staff'),
('pediatr', '{4,5,17}'::int[], 'staff'),
('neonatolog', '{7,11,14,17}'::int[], 'staff'),
('bolalar_ginekologi', '{9,19}'::int[], 'staff'),
('emlash_xonasi', '{5}'::int[], 'staff'),
('maktab_mtm_hamshira', '{4}'::int[], 'staff'),
('skrining_markazi', '{11}'::int[], 'staff'),
('akusherlik_kompleksi', '{7,14,18}'::int[], 'staff'),
('reproduktiv_markaz', '{10,12}'::int[], 'staff'),
('bosh_akusher', '{1,3,7,9,10,11,12,13,14,16}'::int[], 'staff'),
('bosh_pediatr', '{1,3,4,5,11,16,17}'::int[], 'staff'),
('bosh_terapevt', '{7,8,13}'::int[], 'staff'),
('statistik', '{2,7,12,17}'::int[], 'staff'),
('kadrlar', '{16}'::int[], 'staff'),
('ombor_dorixona', '{14,18}'::int[], 'staff'),
('arxiv', '{20}'::int[], 'staff'),
('onalar_olimi', '{7}'::int[], 'staff'),
('dsenm', '{4,5}'::int[], 'staff'),
('maorif', '{4,19}'::int[], 'staff'),
('nikoh', '{19}'::int[], 'staff'),
('adliya', '{19}'::int[], 'staff'),
('soglom_avlod', '{6}'::int[], 'staff'),
('ijtimoiy_himoya', '{6,8}'::int[], 'staff'),
('bosh_vrach', '{}'::int[], 'chief_physician'),
('orinbosar', '{}'::int[], 'deputy')
) v(c, f, r) where n.code = v.c;

-- ---------------------------------------------------------------- анкета: телефон и должности со ставками
alter table public.profiles add column phone text check (phone is null or phone ~ '^\+998[0-9]{9}$');
alter table public.profiles add column positions jsonb not null default '[]'::jsonb check (jsonb_typeof(positions) = 'array');
alter table public.access_requests add column phone text check (phone is null or phone ~ '^\+998[0-9]{9}$');
alter table public.access_requests add column positions jsonb not null default '[]'::jsonb check (jsonb_typeof(positions) = 'array');

-- Проверка и нормализация анкеты. Возвращает {full_name, phone, institution_id, institution_text, positions:[{code,rate,ru}], position, position_code, rate}.
create or replace function private.clean_form(_f jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare _fn text := regexp_replace(btrim(coalesce(_f ->> 'full_name', '')), '\s+', ' ', 'g');
        _ph text := regexp_replace(coalesce(_f ->> 'phone', ''), '[^0-9]', '', 'g');
        _ii int; _it text := left(regexp_replace(btrim(coalesce(_f ->> 'institution_text', '')), '\s+', ' ', 'g'), 120);
        _pos jsonb := '[]'::jsonb; _e jsonb; _c text; _r numeric; _ru text; _sum numeric := 0; _n int := 0;
begin
  if jsonb_typeof(_f) <> 'object' then raise exception 'bad_form'; end if;
  if length(_fn) < 5 or length(_fn) > 200 or _fn !~ ' ' then raise exception 'bad_full_name'; end if;
  if length(_ph) = 9 then _ph := '998' || _ph; end if;
  if _ph !~ '^998[0-9]{9}$' then raise exception 'bad_phone'; end if;
  if (_f ->> 'institution_id') ~ '^[0-9]{1,9}$' then select i.id into _ii from public.institutions i where i.id = (_f ->> 'institution_id')::int; end if;
  if _ii is null and length(_it) < 2 then raise exception 'need_institution'; end if;
  if _ii is not null then _it := ''; end if;
  if jsonb_typeof(_f -> 'positions') <> 'array' or jsonb_array_length(_f -> 'positions') not between 1 and 4 then raise exception 'bad_positions'; end if;
  for _e in select * from jsonb_array_elements(_f -> 'positions') loop
    _c := _e ->> 'code';
    _r := case when (_e ->> 'rate') ~ '^[0-9]+(\.[0-9]+)?$' then (_e ->> 'rate')::numeric end;
    if _r is null or _r < 0.25 or _r > private.max_rate() or _r * 4 <> trunc(_r * 4) then raise exception 'bad_rate'; end if;
    if _c = 'other' then
      _ru := left(regexp_replace(btrim(coalesce(_e ->> 'other', '')), '\s+', ' ', 'g'), 100);
      if length(_ru) < 2 then raise exception 'bad_positions'; end if;
    else
      select n.ru into _ru from private.position_names n where n.code = _c;
      if _ru is null then raise exception 'bad_positions'; end if;
      if _pos @> jsonb_build_array(jsonb_build_object('code', _c)) then raise exception 'bad_positions'; end if;
    end if;
    _pos := _pos || jsonb_build_array(jsonb_build_object('code', _c, 'rate', _r, 'ru', _ru));
    _sum := _sum + _r; _n := _n + 1;
  end loop;
  if _sum > private.max_rate() then raise exception 'over_rate'; end if;
  return jsonb_build_object('full_name', _fn, 'phone', '+' || _ph, 'institution_id', _ii, 'institution_text', _it, 'positions', _pos,
    'position', _pos -> 0 ->> 'ru', 'position_code', _pos -> 0 ->> 'code', 'rate', _sum);
end $$;

-- Папки и роль по должностям (объединение).
create or replace function private.folders_for(_positions jsonb)
returns int[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct f order by f), '{}') from private.position_names n, unnest(n.folders) f
  where n.code in (select e ->> 'code' from jsonb_array_elements(coalesce(_positions, '[]')) e)
    and f in (select fo.id from public.folders fo where not fo.restricted);
$$;
create or replace function private.role_for(_positions jsonb)
returns public.app_role language sql stable security definer set search_path = '' as $$
  select coalesce((select n.role from private.position_names n
                   where n.code in (select e ->> 'code' from jsonb_array_elements(coalesce(_positions, '[]')) e) and n.role <> 'staff'
                   order by n.role limit 1), 'staff');
$$;

-- Коды должностей сотрудника: все из анкеты + основная (по названию) + заместитель.
create or replace function private.user_pos_codes(_uid uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}') from (
    select n.code c from public.profiles p join private.position_names n on n.ru = btrim(p.position) where p.id = _uid
    union all
    select e ->> 'code' from public.profiles p, jsonb_array_elements(p.positions) e where p.id = _uid and e ->> 'code' <> 'other'
    union all
    select 'orinbosar' where exists (select 1 from public.user_roles r where r.user_id = _uid and r.role in ('admin', 'deputy'))
  ) x;
$$;

-- ---------------------------------------------------------------- заявка из анкеты (вызывает бот)
create or replace function private.submit_form_request(_tg_id bigint, _tg_username text, _tg_name text, _form jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare _st text; _f jsonb := private.clean_form(_form);
begin
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id) then return 'member'; end if;
  if (select count(*) from public.access_requests where telegram_id = _tg_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests';
  end if;
  select status into _st from public.access_requests
   where telegram_id = _tg_id and used_at is null and status in ('pending', 'approved') for update;
  if _st = 'approved' then return 'approved'; end if;
  if _st = 'pending' then
    update public.access_requests set full_name = _f ->> 'full_name', position = _f ->> 'position', position_code = _f ->> 'position_code',
           phone = _f ->> 'phone', positions = _f -> 'positions', institution_id = (_f ->> 'institution_id')::int,
           institution_text = _f ->> 'institution_text', tg_username = left(_tg_username, 64), tg_name = left(coalesce(_tg_name, ''), 200)
     where telegram_id = _tg_id and used_at is null and status = 'pending';
    return 'pending';
  end if;
  insert into public.access_requests (telegram_id, tg_username, tg_name, full_name, position, position_code, institution_id, institution_text, phone, positions, folder_ids, role)
  values (_tg_id, left(_tg_username, 64), left(coalesce(_tg_name, ''), 200), _f ->> 'full_name', _f ->> 'position', _f ->> 'position_code',
          (_f ->> 'institution_id')::int, _f ->> 'institution_text', _f ->> 'phone', _f -> 'positions',
          private.folders_for(_f -> 'positions'), null);
  insert into public.audit_log (actor, action, object, details)
  values (null, 'request_submitted', null, jsonb_build_object('name', _f ->> 'full_name', 'position', _f ->> 'position'));
  return 'pending';
end $$;

-- Принятие одобренной заявки: теперь с телефоном, должностями и суммарной ставкой.
create or replace function public.accept_request(_tg_id bigint, _uid uuid, _tg_username text)
returns public.app_role language plpgsql security definer set search_path = '' as $$
declare rq public.access_requests; _rate numeric;
begin
  select * into rq from public.access_requests
   where telegram_id = _tg_id and used_at is null and status = 'approved'
   for update;
  if not found then raise exception 'request_not_approved'; end if;
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id and user_id <> _uid) then
    raise exception 'telegram_taken';
  end if;
  _rate := (select sum((e ->> 'rate')::numeric) from jsonb_array_elements(rq.positions) e);
  if _rate is not null and (_rate < 0.25 or _rate > private.max_rate()) then _rate := null; end if;

  update public.access_requests set used_at = now(), used_by = _uid where id = rq.id;
  insert into public.profiles (id, full_name, position, institution_id, phone, positions, rate)
  values (_uid, rq.full_name, rq.position, rq.institution_id, rq.phone, rq.positions, _rate)
  on conflict (id) do update set full_name = excluded.full_name, position = excluded.position, institution_id = excluded.institution_id,
                                 phone = coalesce(excluded.phone, public.profiles.phone), positions = excluded.positions,
                                 rate = coalesce(excluded.rate, public.profiles.rate), removed_at = null;
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

-- ---------------------------------------------------------------- билеты входа
create table private.login_tickets (
  id          uuid primary key default gen_random_uuid(),
  start_hash  text not null unique,
  poll_hash   text not null unique,
  form        jsonb,
  invite      text check (invite is null or invite ~ '^[0-9a-f]{24}$'),
  telegram_id bigint,
  tg_username text,
  tg_name     text,
  state       text not null default 'new' check (state in ('new', 'bound', 'used')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index login_tickets_created_idx on private.login_tickets (created_at);
alter table private.login_tickets enable row level security;
revoke all on private.login_tickets from public, anon, authenticated;

create or replace function private.h(_s text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(_s, ''), 'sha256'), 'hex');
$$;

-- Сайт (через функцию tg-bot): новый билет. Анкета проверяется сразу, чтобы ошибки показать до перехода в Telegram.
create or replace function public.ticket_create(_start text, _poll text, _form jsonb, _invite text)
returns void language plpgsql security definer set search_path = '' as $$
declare _f jsonb;
begin
  if coalesce(_start, '') !~ '^[A-Za-z0-9_-]{20,64}$' or coalesce(_poll, '') !~ '^[A-Za-z0-9_-]{20,64}$' then raise exception 'bad_ticket'; end if;
  if (select count(*) from private.login_tickets where created_at > now() - interval '10 minutes') >= 300 then raise exception 'too_many_requests'; end if;
  delete from private.login_tickets where expires_at < now() - interval '1 day';
  if _form is not null then _f := private.clean_form(_form); end if;
  insert into private.login_tickets (start_hash, poll_hash, form, invite, expires_at)
  values (private.h(_start), private.h(_poll), _f, nullif(lower(btrim(coalesce(_invite, ''))), ''), now() + interval '30 minutes');
end $$;

-- Бот: /start <код>. Привязывает Telegram к билету и при необходимости подаёт заявку.
-- Ответ: member | pending | approved | rejected | invite | need_form | expired
create or replace function public.ticket_bind(_start text, _tg_id bigint, _tg_username text, _tg_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare _t private.login_tickets; _st text;
begin
  select * into _t from private.login_tickets where start_hash = private.h(_start) for update;
  if _t.id is null or _t.expires_at < now() or (_t.state <> 'new' and _t.telegram_id is distinct from _tg_id) then return 'expired'; end if;
  update private.login_tickets set telegram_id = _tg_id, tg_username = left(_tg_username, 64), tg_name = left(coalesce(_tg_name, ''), 200),
         state = case when state = 'used' then 'used' else 'bound' end,
         expires_at = greatest(expires_at, now() + interval '30 days')
   where id = _t.id;
  if exists (select 1 from public.telegram_links where telegram_id = _tg_id) then return 'member'; end if;
  if _t.invite is not null then return 'invite'; end if;
  if _t.form is not null then return private.submit_form_request(_tg_id, _tg_username, _tg_name, _t.form); end if;
  _st := public.request_state(_tg_id);
  return case when _st = 'none' then 'need_form' else _st end;
end $$;

-- Сайт: что с моим билетом. state: wait | expired | used | bound (+ данные Telegram для входа).
create or replace function public.ticket_poll(_poll text)
returns table (state text, telegram_id bigint, tg_username text, tg_name text, invite text, request text)
language plpgsql security definer set search_path = '' as $$
declare _t private.login_tickets;
begin
  select * into _t from private.login_tickets t where t.poll_hash = private.h(_poll);
  if _t.id is null or _t.expires_at < now() then return query select 'expired'::text, null::bigint, null::text, null::text, null::text, null::text; return; end if;
  if _t.state = 'used' then return query select 'used'::text, null::bigint, null::text, null::text, null::text, null::text; return; end if;
  if _t.state = 'new' then return query select 'wait'::text, null::bigint, null::text, null::text, null::text, null::text; return; end if;
  return query select 'bound'::text, _t.telegram_id, _t.tg_username, _t.tg_name, _t.invite,
    case when exists (select 1 from public.telegram_links l where l.telegram_id = _t.telegram_id) then 'member' else public.request_state(_t.telegram_id) end;
end $$;

create or replace function public.ticket_used(_poll text)
returns void language sql security definer set search_path = '' as $$
  update private.login_tickets set state = 'used', expires_at = now() + interval '1 day' where poll_hash = private.h(_poll);
$$;

-- Администратор одобрил: билет для входа одной кнопкой из сообщения бота (вызывает tg-bot от имени администратора).
create or replace function public.admin_request_ticket(_id uuid, _start text, _poll text)
returns table (telegram_id bigint, full_name text)
language plpgsql security definer set search_path = '' as $$
declare rq public.access_requests;
begin
  perform private.require_admin();
  select * into rq from public.access_requests r where r.id = _id;
  if rq.id is null or rq.status <> 'approved' or rq.used_at is not null then raise exception 'request_closed'; end if;
  if coalesce(_start, '') !~ '^[A-Za-z0-9_-]{20,64}$' or coalesce(_poll, '') !~ '^[A-Za-z0-9_-]{20,64}$' then raise exception 'bad_ticket'; end if;
  insert into private.login_tickets (start_hash, poll_hash, telegram_id, tg_username, tg_name, state, expires_at)
  values (private.h(_start), private.h(_poll), rq.telegram_id, rq.tg_username, rq.tg_name, 'bound', now() + interval '14 days');
  return query select rq.telegram_id, rq.full_name;
end $$;

-- ---------------------------------------------------------------- одобрение: папки и роль по должностям, если не переданы
drop function public.decide_request(uuid, boolean, public.app_role, int[], int);
create function public.decide_request(_id uuid, _approve boolean, _role public.app_role, _folders int[], _institution_id int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare rq public.access_requests;
begin
  perform private.require_admin();
  select * into rq from public.access_requests where id = _id for update;
  if not found then raise exception 'no_such_request'; end if;
  if rq.status <> 'pending' or rq.used_at is not null then raise exception 'request_closed'; end if;
  if _approve then
    update public.access_requests
       set status = 'approved', role = coalesce(_role, private.role_for(rq.positions)), decided_at = now(), decided_by = auth.uid(),
           institution_id = coalesce((select i.id from public.institutions i where i.id = _institution_id), rq.institution_id),
           folder_ids = case when _folders is null then private.folders_for(rq.positions)
                             else coalesce((select array_agg(f.id order by f.id) from public.folders f where f.id = any (_folders) and not f.restricted), '{}') end
     where id = _id;
  else
    update public.access_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = _id;
  end if;
  perform private.log_event(case when _approve then 'request_approved' else 'request_rejected' end, _id::text,
                            jsonb_build_object('role', _role, 'name', rq.full_name, 'folders', _folders));
end $$;

-- ---------------------------------------------------------------- список сотрудников: телефон и должности
drop function public.admin_list_users();
create function public.admin_list_users()
returns table (user_id uuid, full_name text, user_position text, telegram_username text,
               roles public.app_role[], folders int[], created_at timestamptz,
               institution_id int, scope_institutions int[], scope_positions text[], phone text, positions jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.full_name, p.position, t.username,
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
           coalesce((select array_agg(m.folder_id order by m.folder_id) from public.folder_members m where m.user_id = p.id), '{}'),
           p.created_at, p.institution_id,
           coalesce((select array_agg(s.institution_id order by s.institution_id) from public.scopes s where s.user_id = p.id and s.kind = 'institution'), '{}'),
           coalesce((select array_agg(s.position_code order by s.position_code) from public.scopes s where s.user_id = p.id and s.kind = 'position'), '{}'),
           p.phone, p.positions
    from public.profiles p left join public.telegram_links t on t.user_id = p.id
    where p.removed_at is null
    order by p.created_at;
end $$;

-- ---------------------------------------------------------------- права
revoke execute on function public.ticket_create(text, text, jsonb, text), public.ticket_bind(text, bigint, text, text),
  public.ticket_poll(text), public.ticket_used(text), public.accept_request(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.ticket_create(text, text, jsonb, text), public.ticket_bind(text, bigint, text, text),
  public.ticket_poll(text), public.ticket_used(text), public.accept_request(bigint, uuid, text) to service_role;
revoke execute on function public.admin_request_ticket(uuid, text, text), public.decide_request(uuid, boolean, public.app_role, int[], int),
  public.admin_list_users() from public, anon;
grant execute on function public.admin_request_ticket(uuid, text, text), public.decide_request(uuid, boolean, public.app_role, int[], int),
  public.admin_list_users() to authenticated;
revoke execute on function private.clean_form(jsonb), private.folders_for(jsonb), private.role_for(jsonb), private.user_pos_codes(uuid),
  private.submit_form_request(bigint, text, text, jsonb), private.h(text) from public, anon, authenticated;

-- Проверка секрета планировщика (для разовой настройки webhook бота).
create or replace function public.cron_secret_ok(_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select _secret is not null and exists (select 1 from private.cron_secret c where c.secret = _secret);
$$;
revoke execute on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;
