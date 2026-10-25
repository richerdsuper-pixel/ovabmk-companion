-- 0015: ставки, отпуска и замещение.
--  * Сотрудник сам указывает, сколько ставок работает (0,25…1,5); администратор подтверждает.
--  * Заявка на отпуск: сотрудник выбирает замещающего коллегу; замещающий даёт согласие (ТК РУз, ст. 116),
--    нагрузка замещения — 0,3 ставки; вместе с подтверждённой ставкой и другими замещениями не больше 1,5.
--  * Рассматривает руководитель учреждения («мудир» — у кого есть область видимости на учреждение сотрудника).
--    Если он не ответил 2 рабочих дня — уведомление администратору; администратор может потребовать рассмотрения.
--  * На время одобренного отпуска замещающий получает в ключе офлайн-программы вторую должность до даты окончания;
--    пациентки передаются напрямую — файл шифруется ключом устройства замещающего (открытый ключ хранится здесь).

create or replace function private.max_rate() returns numeric language sql immutable as $$ select 1.5::numeric $$;
create or replace function private.sub_load() returns numeric language sql immutable as $$ select 0.3::numeric $$;

alter table public.profiles add column rate numeric(3,2) check (rate between 0.25 and 1.5);
alter table public.profiles add column rate_req numeric(3,2) check (rate_req between 0.25 and 1.5);
alter table public.profiles add column rate_req_at timestamptz;
-- открытый ключ устройства в офлайн-программе (для передачи пациенток напрямую при замещении)
alter table public.profiles add column offline_pub jsonb;

create table public.leaves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null default 'vacation' check (kind in ('vacation', 'sick', 'study', 'other')),
  date_from    date not null,
  date_to      date not null check (date_to >= date_from),
  note         text not null default '' check (length(note) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 500),
  created_at   timestamptz not null default now(),
  escalated_at timestamptz,          -- когда администратору ушло уведомление о просрочке
  demanded_at  timestamptz           -- когда администратор потребовал рассмотрения
);
create index leaves_user_idx on public.leaves (user_id, date_from desc);
create index leaves_status_idx on public.leaves (status, created_at);

create table public.substitutions (
  id          uuid primary key default gen_random_uuid(),
  leave_id    uuid not null references public.leaves (id) on delete cascade,
  substitute  uuid not null references auth.users (id) on delete cascade,
  load        numeric(3,2) not null default 0.3 check (load > 0 and load <= 1),
  consent     text not null default 'pending' check (consent in ('pending', 'accepted', 'declined')),
  consent_at  timestamptz,
  unique (leave_id, substitute)
);
create index subs_sub_idx on public.substitutions (substitute);

alter table public.leaves enable row level security;
alter table public.substitutions enable row level security;
revoke all on public.leaves, public.substitutions from public, anon, authenticated;

-- руководитель учреждения сотрудника: область видимости на его учреждение (не сам сотрудник)
create or replace function private.is_head_of(_viewer uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select _viewer <> _uid and private.is_member(_viewer) and exists (
    select 1 from public.scopes s join public.profiles p on p.id = _uid
    where s.user_id = _viewer and s.kind = 'institution' and s.institution_id = p.institution_id);
$$;
-- 2 рабочих дня (пн–пт) после подачи
create or replace function private.add_workdays(_from timestamptz, _n int)
returns timestamptz language plpgsql stable as $$
declare _d timestamptz := _from; _k int := 0;
begin
  while _k < _n loop
    _d := _d + interval '1 day';
    if extract(isodow from _d) < 6 then _k := _k + 1; end if;
  end loop;
  return _d;
end $$;
-- нагрузка сотрудника на дату: подтверждённая ставка + замещения (согласованные, по неотменённым отпускам) в эти даты
create or replace function private.load_in(_uid uuid, _from date, _to date, _skip uuid default null)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select p.rate from public.profiles p where p.id = _uid), 1.0)
       + coalesce((select sum(s.load) from public.substitutions s join public.leaves l on l.id = s.leave_id
                   where s.substitute = _uid and s.consent <> 'declined' and l.status in ('pending', 'approved')
                     and l.date_from <= _to and l.date_to >= _from and (s.id <> _skip or _skip is null)), 0);
$$;

-- ---------------------------------------------------------------- ставки
create or replace function public.request_rate(_rate numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _rate is null or _rate < 0.25 or _rate > private.max_rate() or (_rate * 4) <> trunc(_rate * 4) then raise exception 'bad_rate'; end if;
  update public.profiles set rate_req = _rate, rate_req_at = now() where id = auth.uid();
  perform private.log_event('rate_request', auth.uid()::text, jsonb_build_object('rate', _rate));
end $$;

create or replace function public.admin_rates()
returns table (user_id uuid, full_name text, user_position text, rate numeric, rate_req numeric, rate_req_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select p.id, p.full_name, p.position, p.rate, p.rate_req, p.rate_req_at from public.profiles p
    where p.removed_at is null and private.is_member(p.id) order by (p.rate_req is null), p.rate_req_at, p.full_name;
end $$;

create or replace function public.admin_confirm_rate(_uid uuid, _ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare _r numeric;
begin
  perform private.require_admin();
  select rate_req into _r from public.profiles where id = _uid;
  if _r is null then raise exception 'no_request'; end if;
  if _ok then update public.profiles set rate = _r, rate_req = null, rate_req_at = null where id = _uid;
  else update public.profiles set rate_req = null, rate_req_at = null where id = _uid; end if;
  perform private.log_event(case when _ok then 'rate_confirmed' else 'rate_rejected' end, _uid::text, jsonb_build_object('rate', _r));
end $$;

-- ---------------------------------------------------------------- отпуска
-- коллеги для замещения: того же учреждения, с подтверждённой ставкой и запасом до 1,5 на эти даты
create or replace function public.leave_candidates(_from date, _to date)
returns table (user_id uuid, full_name text, user_position text, rate numeric, load_now numeric, can boolean)
language plpgsql stable security definer set search_path = '' as $$
declare _inst int;
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select institution_id into _inst from public.profiles where id = auth.uid();
  return query select p.id, p.full_name, p.position, p.rate, private.load_in(p.id, _from, _to),
                      private.load_in(p.id, _from, _to) + private.sub_load() <= private.max_rate()
    from public.profiles p
    where p.id <> auth.uid() and p.removed_at is null and private.is_member(p.id) and _inst is not null and p.institution_id = _inst
    order by p.full_name;
end $$;

create or replace function public.request_leave(_kind text, _from date, _to date, _note text, _substitute uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid; _inst int;
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _from is null or _to is null or _to < _from then raise exception 'bad_dates'; end if;
  if _to - _from > 120 then raise exception 'too_long'; end if;
  if exists (select 1 from public.leaves l where l.user_id = auth.uid() and l.status in ('pending', 'approved') and l.date_from <= _to and l.date_to >= _from) then raise exception 'overlap'; end if;
  insert into public.leaves (user_id, kind, date_from, date_to, note) values (auth.uid(), coalesce(nullif(_kind, ''), 'vacation'), _from, _to, left(btrim(coalesce(_note, '')), 500)) returning id into _id;
  if _substitute is not null then
    select institution_id into _inst from public.profiles where id = auth.uid();
    if _substitute = auth.uid() or not private.is_member(_substitute) or (select institution_id from public.profiles where id = _substitute) is distinct from _inst then raise exception 'bad_substitute'; end if;
    if private.load_in(_substitute, _from, _to) + private.sub_load() > private.max_rate() then raise exception 'over_limit'; end if;
    insert into public.substitutions (leave_id, substitute, load) values (_id, _substitute, private.sub_load());
  end if;
  perform private.log_event('leave_request', _id::text, jsonb_build_object('from', _from, 'to', _to, 'substitute', _substitute));
  return _id;
end $$;

create or replace function public.cancel_leave(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leaves set status = 'cancelled' where id = _id and user_id = auth.uid() and status in ('pending', 'approved') and date_to >= current_date;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.log_event('leave_cancelled', _id::text, '{}'::jsonb);
end $$;

-- согласие замещающего (ст. 116 ТК: только с согласия работника)
create or replace function public.substitution_consent(_leave uuid, _accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare _s record;
begin
  select s.*, l.date_from, l.date_to, l.status into _s from public.substitutions s join public.leaves l on l.id = s.leave_id
    where s.leave_id = _leave and s.substitute = auth.uid();
  if not found or _s.status not in ('pending', 'approved') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _accept and private.load_in(auth.uid(), _s.date_from, _s.date_to, _s.id) + _s.load > private.max_rate() then raise exception 'over_limit'; end if;
  update public.substitutions set consent = case when _accept then 'accepted' else 'declined' end, consent_at = now() where id = _s.id;
  perform private.log_event(case when _accept then 'substitution_accepted' else 'substitution_declined' end, _leave::text, '{}'::jsonb);
end $$;

-- решение руководителя (или администратора)
create or replace function public.decide_leave(_id uuid, _approve boolean, _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare _l record;
begin
  select * into _l from public.leaves where id = _id;
  if not found or _l.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (private.is_head_of(auth.uid(), _l.user_id) or private.has_role(auth.uid(), 'admin')) or auth.uid() = _l.user_id then raise exception 'forbidden' using errcode = '42501'; end if;
  if _approve and exists (select 1 from public.substitutions s where s.leave_id = _id and s.consent <> 'accepted') then raise exception 'no_consent'; end if;
  update public.leaves set status = case when _approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         decision_note = left(btrim(coalesce(_note, '')), 500) where id = _id;
  perform private.log_event(case when _approve then 'leave_approved' else 'leave_rejected' end, _id::text, '{}'::jsonb);
end $$;

-- список: мои заявки, где меня просят замещать, что мне рассматривать (руководитель), всё (администратор)
create or replace function public.leaves_list()
returns table (id uuid, user_id uuid, full_name text, user_position text, institution text, kind text, date_from date, date_to date, note text,
               status text, decided_by_name text, decided_at timestamptz, decision_note text, created_at timestamptz, due_at timestamptz,
               overdue boolean, escalated_at timestamptz, demanded_at timestamptz,
               substitute uuid, substitute_name text, load numeric, consent text, mine boolean, i_substitute boolean, i_decide boolean)
language plpgsql stable security definer set search_path = '' as $$
declare _me uuid := auth.uid(); _adm boolean := private.has_role(auth.uid(), 'admin');
begin
  if not private.is_member(_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select l.id, l.user_id, p.full_name, p.position, coalesce(i.name, ''), l.kind, l.date_from, l.date_to, l.note,
         l.status, d.full_name, l.decided_at, l.decision_note, l.created_at, private.add_workdays(l.created_at, 2),
         l.status = 'pending' and now() > private.add_workdays(l.created_at, 2), l.escalated_at, l.demanded_at,
         s.substitute, sp.full_name, s.load, s.consent, l.user_id = _me, s.substitute = _me,
         l.status = 'pending' and l.user_id <> _me and (private.is_head_of(_me, l.user_id) or _adm)
  from public.leaves l join public.profiles p on p.id = l.user_id
  left join public.institutions i on i.id = p.institution_id
  left join public.profiles d on d.id = l.decided_by
  left join public.substitutions s on s.leave_id = l.id
  left join public.profiles sp on sp.id = s.substitute
  where l.user_id = _me or s.substitute = _me or private.is_head_of(_me, l.user_id) or _adm
  order by (l.status = 'pending') desc, l.date_from desc
  limit 300;
end $$;

-- администратор требует от руководителя рассмотреть заявку (уведомление уходит через функцию leave-notify)
create or replace function public.admin_demand_review(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.leaves set demanded_at = now() where id = _id and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
  perform private.log_event('leave_demand', _id::text, '{}'::jsonb);
end $$;

-- кому отправить Telegram-уведомление о событии заявки. Проверяет, что вызывающий участвует в заявке.
-- event: request (замещающему и руководителям), consent (руководителям), decided (сотруднику и замещающему), demand (руководителям; только администратор)
create or replace function public.leave_notify_targets(_id uuid, _event text)
returns table (user_id uuid, telegram_id bigint, who text, full_name text, date_from date, date_to date, status text)
language plpgsql stable security definer set search_path = '' as $$
declare _l record; _me uuid := auth.uid();
begin
  select l.*, p.full_name as fname into _l from public.leaves l join public.profiles p on p.id = l.user_id where l.id = _id;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if _event = 'request' and _l.user_id <> _me then raise exception 'forbidden' using errcode = '42501'; end if;
  if _event = 'consent' and not exists (select 1 from public.substitutions s where s.leave_id = _id and s.substitute = _me) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _event = 'decided' and _l.decided_by is distinct from _me then raise exception 'forbidden' using errcode = '42501'; end if;
  if _event = 'demand' and not private.has_role(_me, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _event not in ('request', 'consent', 'decided', 'demand') then raise exception 'bad_event'; end if;
  return query
  select x.uid, tl.telegram_id, x.who, _l.fname, _l.date_from, _l.date_to, _l.status from (
    select s.substitute as uid, 'substitute'::text as who from public.substitutions s where s.leave_id = _id and _event in ('request', 'decided')
    union
    select sc.user_id, 'head' from public.scopes sc join public.profiles p on p.id = _l.user_id
      where _event in ('request', 'consent', 'demand') and sc.kind = 'institution' and sc.institution_id = p.institution_id and sc.user_id <> _l.user_id and private.is_member(sc.user_id)
    union
    select _l.user_id, 'owner' where _event = 'decided'
  ) x join public.telegram_links tl on tl.user_id = x.uid;
end $$;

-- просроченные заявки для ежедневной проверки (вызывается только сервисом с секретом планировщика)
create table private.cron_secret (
  id     boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32)
);
alter table private.cron_secret enable row level security;
revoke all on private.cron_secret from public, anon, authenticated;
insert into private.cron_secret (secret) values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create or replace function public.cron_leave_escalations(_secret text)
returns table (leave_id uuid, user_id uuid, telegram_id bigint, full_name text, institution text, date_from date, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with due as (
    update public.leaves l set escalated_at = now()
    where l.status = 'pending' and l.escalated_at is null and now() > private.add_workdays(l.created_at, 2)
    returning l.id, l.user_id, l.date_from, l.created_at)
  select d.id, r.user_id, tl.telegram_id, p.full_name, coalesce(i.name, ''), d.date_from, d.created_at
  from due d join public.profiles p on p.id = d.user_id left join public.institutions i on i.id = p.institution_id
  cross join lateral (select ur.user_id from public.user_roles ur where ur.role = 'admin') r
  join public.telegram_links tl on tl.user_id = r.user_id;
end $$;

-- ---------------------------------------------------------------- офлайн-программа: ключ устройства и должности на время замещения
create or replace function public.set_my_offline_pub(_x text, _y text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _x !~ '^[A-Za-z0-9_-]{43}$' or _y !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad_key'; end if;
  update public.profiles set offline_pub = jsonb_build_object('x', _x, 'y', _y, 'at', now()) where id = auth.uid();
  perform private.log_event('offline_pub', auth.uid()::text, '{}'::jsonb);
end $$;

-- дополнительные должности и передача пациенток для ключа активации: одобренные отпуска, которые ещё не закончились
create or replace function private.offline_extra(_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    -- я замещаю: должность отсутствующего до конца его отпуска + его ключ (вернуть пациенток)
    'extra', coalesce((select jsonb_agg(jsonb_build_object('role', ap.offline_role, 'from', l.date_from, 'until', l.date_to, 'of', ap.full_name, 'uid', l.user_id, 'k', ap.offline_pub - 'at'))
                       from public.substitutions s join public.leaves l on l.id = s.leave_id join public.profiles ap on ap.id = l.user_id
                       where s.substitute = _uid and s.consent = 'accepted' and l.status = 'approved' and l.date_to >= current_date and ap.offline_role in ('cab', 'pat')), '[]'::jsonb),
    -- меня замещают: кому передать пациенток
    'handover', coalesce((select jsonb_agg(jsonb_build_object('to', sp.full_name, 'from', l.date_from, 'until', l.date_to, 'k', sp.offline_pub - 'at'))
                          from public.leaves l join public.substitutions s on s.leave_id = l.id join public.profiles sp on sp.id = s.substitute
                          where l.user_id = _uid and s.consent = 'accepted' and l.status = 'approved' and l.date_to >= current_date and sp.offline_pub is not null), '[]'::jsonb));
$$;

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
  return jsonb_build_object('uid', auth.uid(), 'role', _p.offline_role, 'name', _p.full_name, 'pos', _p.position, 'inst', coalesce(_p.inst, ''), 'k', _key)
         || private.offline_extra(auth.uid());
end $$;

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
  return jsonb_build_object('uid', _uid, 'role', _p.offline_role, 'name', _p.full_name, 'pos', _p.position, 'inst', coalesce(_p.inst, ''), 'k', _key)
         || private.offline_extra(_uid);
end $$;

-- моя ставка и ключ устройства (для страницы сайта)
create or replace function public.my_work_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object('rate', p.rate, 'rate_req', p.rate_req, 'offline_role', p.offline_role, 'has_pub', p.offline_pub is not null,
                                    'is_head', exists (select 1 from public.scopes s where s.user_id = p.id and s.kind = 'institution'),
                                    'max', private.max_rate(), 'sub_load', private.sub_load())
          from public.profiles p where p.id = auth.uid());
end $$;

revoke all on function public.request_rate(numeric), public.admin_rates(), public.admin_confirm_rate(uuid, boolean), public.leave_candidates(date, date),
  public.request_leave(text, date, date, text, uuid), public.cancel_leave(uuid), public.substitution_consent(uuid, boolean), public.decide_leave(uuid, boolean, text),
  public.leaves_list(), public.admin_demand_review(uuid), public.leave_notify_targets(uuid, text), public.set_my_offline_pub(text, text), public.my_work_profile(),
  public.cron_leave_escalations(text) from public, anon;
grant execute on function public.request_rate(numeric), public.admin_rates(), public.admin_confirm_rate(uuid, boolean), public.leave_candidates(date, date),
  public.request_leave(text, date, date, text, uuid), public.cancel_leave(uuid), public.substitution_consent(uuid, boolean), public.decide_leave(uuid, boolean, text),
  public.leaves_list(), public.admin_demand_review(uuid), public.leave_notify_targets(uuid, text), public.set_my_offline_pub(text, text), public.my_work_profile() to authenticated;
revoke execute on function public.cron_leave_escalations(text) from authenticated;
grant execute on function public.cron_leave_escalations(text) to service_role;
