-- 0027: анализы с автоматическими отметками (анемия, сахар, белок в моче), план родов, место беременной при тревожном сигнале.
-- Пороги — ВОЗ: анемия при беременности Hb < 110 г/л (100–109 лёгкая, 70–99 средняя, < 70 тяжёлая);
-- глюкоза натощак 5,1–6,9 ммоль/л — гестационный диабет, ≥ 7,0 — манифестный (ВОЗ 2013); белок в моче «+» и выше.

-- ---------------------------------------------------------------- анализы
create table public.mother_labs (
  id         bigint generated always as identity primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  kind       text not null check (kind in ('hb', 'glucose', 'urine_protein')),
  val        numeric not null,
  d          date not null,
  by_user    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index mother_labs_mother_idx on public.mother_labs (mother_id, kind, d desc);
alter table public.mother_labs enable row level security;
revoke all on public.mother_labs from public, anon, authenticated;

create or replace function public.lab_save(_mother uuid, _kind text, _val numeric, _d date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m record; _id bigint;
begin
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _kind = 'hb' then if _val is null or _val < 30 or _val > 200 then raise exception 'bad_value'; end if;
  elsif _kind = 'glucose' then if _val is null or _val < 1.5 or _val > 35 then raise exception 'bad_value'; end if;
  elsif _kind = 'urine_protein' then if _val is null or _val not in (0, 1, 2, 3) then raise exception 'bad_value'; end if;
  else raise exception 'bad_kind'; end if;
  if _d is null or _d > private.today() or _d < m.lmp - 30 then raise exception 'bad_date'; end if;
  insert into public.mother_labs (mother_id, kind, val, d) values (_mother, _kind, round(_val, 1), _d) returning id into _id;
  return _id;
end $$;

create or replace function public.lab_delete(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare _inst int;
begin
  select m.institution_id into _inst from public.mother_labs l join public.mothers m on m.id = l.mother_id where l.id = _id;
  if _inst is null or not private.preg_ok(auth.uid(), _inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.mother_labs where id = _id;
end $$;

-- отметки по последним результатам (сахар — только во время беременности)
create or replace function private.lab_flags(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with last as (select distinct on (l.kind) l.kind, l.val, l.d from public.mother_labs l where l.mother_id = _mid order by l.kind, l.d desc, l.id desc),
       m as (select mm.status from public.mothers mm where mm.id = _mid)
  select jsonb_build_object(
    'anemia', (select case when val < 70 then 'severe' when val < 100 then 'moderate' when val < 110 then 'mild' end from last where kind = 'hb'),
    'hb', (select val from last where kind = 'hb'),
    'gdm', (select case when val >= 7.0 then 'overt' when val >= 5.1 then 'gdm' end from last, m where kind = 'glucose' and m.status = 'pregnant'),
    'protein', coalesce((select val >= 1 from last, m where kind = 'urine_protein' and m.status = 'pregnant'), false));
$$;

-- ---------------------------------------------------------------- план родов
create table public.mother_birthplan (
  mother_id    uuid primary key references public.mothers (id) on delete cascade,
  place        text not null default '' check (length(place) <= 120),
  companion    text not null default '' check (length(companion) <= 120),
  driver       text not null default '' check (length(driver) <= 120),
  driver_phone text check (driver_phone is null or driver_phone ~ '^\+998[0-9]{9}$'),
  docs         boolean not null default false,
  bag          boolean not null default false,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);
alter table public.mother_birthplan enable row level security;
revoke all on public.mother_birthplan from public, anon, authenticated;

create or replace function private.birthplan_put(_mid uuid, _p jsonb, _by uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _ph text := nullif(regexp_replace(coalesce(_p ->> 'driver_phone', ''), '[^0-9+]', '', 'g'), '');
begin
  if _ph is not null then
    if _ph ~ '^998[0-9]{9}$' then _ph := '+' || _ph; elsif _ph ~ '^[0-9]{9}$' then _ph := '+998' || _ph; end if;
    if _ph !~ '^\+998[0-9]{9}$' then return jsonb_build_object('error', 'bad_phone'); end if;
  end if;
  insert into public.mother_birthplan as b (mother_id, place, companion, driver, driver_phone, docs, bag, updated_at, updated_by)
  values (_mid, left(btrim(coalesce(_p ->> 'place', '')), 120), left(btrim(coalesce(_p ->> 'companion', '')), 120), left(btrim(coalesce(_p ->> 'driver', '')), 120),
          _ph, coalesce((_p ->> 'docs')::boolean, false), coalesce((_p ->> 'bag')::boolean, false), now(), _by)
  on conflict (mother_id) do update set place = excluded.place, companion = excluded.companion, driver = excluded.driver, driver_phone = excluded.driver_phone,
    docs = excluded.docs, bag = excluded.bag, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('ok', true);
exception when invalid_text_representation then return jsonb_build_object('error', 'bad_form');
end $$;

create or replace function public.birthplan_save(_mother uuid, _p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.birthplan_put(_mother, coalesce(_p, '{}'), auth.uid());
end $$;

create or replace function public.bot_mother_birthplan(_tg bigint, _p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  return private.birthplan_put(g.mother_id, coalesce(_p, '{}'), null);
end $$;

-- ---------------------------------------------------------------- место беременной при тревожном сигнале
alter table public.mother_alerts add column lat double precision, add column lon double precision, add column loc_at timestamptz;

-- кому уходит сигнал: доя и руководители учреждения, дежурные роддома (кроме одного давления 140/90)
create or replace function private.alert_recipients(_mid uuid, _duty boolean)
returns table (telegram_id bigint, full_name text)
language sql stable security definer set search_path = '' as $$
  select distinct on (tl.telegram_id) tl.telegram_id, p.full_name
  from public.mothers m, public.profiles p join public.telegram_links tl on tl.user_id = p.id
  where m.id = _mid and private.is_member(p.id) and p.removed_at is null and (
    (p.institution_id = m.institution_id and private.preg_staff(p.id))
    or exists (select 1 from public.scopes s where s.user_id = p.id and s.kind = 'institution' and s.institution_id = m.institution_id)
    or (_duty and exists (select 1 from public.duty_staff d where d.user_id = p.id)));
$$;

create or replace function public.bot_mother_alert(_tg bigint, _signs text[])
returns table (telegram_id bigint, full_name text, mother_id uuid, mother_name text, mother_phone text, mahalla text, address text, status text)
language plpgsql security definer set search_path = '' as $$
declare g record; m record; _s text[];
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return; end if;
  select * into m from public.mothers where id = g.mother_id;
  select coalesce(array_agg(left(x, 40)), '{}') into _s from unnest(coalesce(_signs, '{}')) x where x ~ '^[a-z_]{2,40}$';
  if array_length(_s, 1) is null then return; end if;
  if exists (select 1 from public.mother_alerts a where a.mother_id = m.id and a.signs = _s and a.created_at > now() - interval '10 minutes') then return; end if;
  insert into public.mother_alerts (mother_id, signs) values (m.id, _s);
  return query
  select r.telegram_id, r.full_name, m.id, m.full_name, m.phone, (select x.name from public.mahallas x where x.id = m.mahalla_id), m.address, m.status
  from private.alert_recipients(m.id, _s <> array['bp_high']) r;
end $$;

-- место приходит после сигнала (кнопка «Отправить, где я» в боте или из «Моей страницы»): к последнему сигналу за 2 часа
create or replace function public.bot_mother_location(_tg bigint, _lat double precision, _lon double precision)
returns table (telegram_id bigint, mother_name text, mother_phone text, signs text[], error text)
language plpgsql security definer set search_path = '' as $$
declare g record; m record; a record;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return query select null::bigint, null::text, null::text, null::text[], 'not_linked'; return; end if;
  if _lat is null or _lon is null or _lat < 35 or _lat > 47 or _lon < 55 or _lon > 75 then
    return query select null::bigint, null::text, null::text, null::text[], 'bad_location'; return; end if;
  select * into m from public.mothers where id = g.mother_id;
  select * into a from public.mother_alerts x where x.mother_id = m.id and x.created_at > now() - interval '2 hours' order by x.created_at desc limit 1;
  if not found then return query select null::bigint, null::text, null::text, null::text[], 'no_alert'; return; end if;
  update public.mother_alerts set lat = _lat, lon = _lon, loc_at = now() where id = a.id;
  return query select r.telegram_id, m.full_name, m.phone, a.signs, null::text from private.alert_recipients(m.id, a.signs <> array['bp_high']) r;
end $$;

-- ---------------------------------------------------------------- метки для списка: + анемия, сахар, белок, план родов
drop function public.mothers_flags();
create function public.mothers_flags()
returns table (mother_id uuid, ref_open int, ref_overdue int, fp_method text, fp_date date, anemia text, gdm text, protein boolean, plan_missing boolean)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); t date := private.today();
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select m.id,
    (select count(*)::int from public.referrals r where r.mother_id = m.id and r.arrived_at is null),
    (select count(*)::int from public.referrals r where r.mother_id = m.id and r.arrived_at is null and r.due_date < t),
    m.fp_method, m.fp_date, f ->> 'anemia', f ->> 'gdm', coalesce((f ->> 'protein')::boolean, false),
    m.status = 'pregnant' and t - coalesce(m.edd_us - 280, m.lmp) >= 252
      and not exists (select 1 from public.mother_birthplan b where b.mother_id = m.id and b.place <> '')
  from public.mothers m, lateral (select private.lab_flags(m.id) f) lf
  where (_ins is null or m.institution_id = any (_ins)) and m.status <> 'closed';
end $$;

-- ---------------------------------------------------------------- отчёт за месяц: + анемия (результаты за месяц)
drop function public.mothers_month_report(date);
create function public.mothers_month_report(_month date)
returns table (institution_id int, on_register int, registered int, early int, high_risk int, delivered int, anc_visits int, home_visits int,
               referred int, referred_arrived int, fp_counseled int, alerts int, tg int, anemia int)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); a date := date_trunc('month', coalesce(_month, private.today()))::date; b date;
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  b := (a + interval '1 month')::date;
  return query
  with ms as (select x.*, (x.created_at at time zone 'Asia/Tashkent')::date reg, coalesce(x.edd_us - 280, x.lmp) lmp0
              from public.mothers x where _ins is null or x.institution_id = any (_ins))
  select i.iid,
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.reg < b and (ms.status <> 'closed' or coalesce(ms.outcome_date, ms.reg) >= a)),
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.reg >= a and ms.reg < b),
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.reg >= a and ms.reg < b and ms.reg - ms.lmp0 < 84),
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.reg >= a and ms.reg < b and ms.risk = 'high'),
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.outcome = 'delivered' and ms.outcome_date >= a and ms.outcome_date < b),
    (select count(*)::int from public.anc_visits v join ms on ms.id = v.mother_id where ms.institution_id = i.iid and v.visit_date >= a and v.visit_date < b),
    (select count(*)::int from public.home_visits v join ms on ms.id = v.mother_id where ms.institution_id = i.iid and v.visit_date >= a and v.visit_date < b),
    (select count(*)::int from public.referrals r join ms on ms.id = r.mother_id where ms.institution_id = i.iid and r.created_at >= a and r.created_at < b),
    (select count(*)::int from public.referrals r join ms on ms.id = r.mother_id where ms.institution_id = i.iid and r.created_at >= a and r.created_at < b and r.arrived_at is not null),
    (select count(*)::int from ms where ms.institution_id = i.iid and ms.fp_date >= a and ms.fp_date < b),
    (select count(*)::int from public.mother_alerts al join ms on ms.id = al.mother_id where ms.institution_id = i.iid and al.created_at >= a and al.created_at < b),
    (select count(*)::int from ms join public.mother_tg g on g.mother_id = ms.id where ms.institution_id = i.iid),
    (select count(distinct l.mother_id)::int from public.mother_labs l join ms on ms.id = l.mother_id
       where ms.institution_id = i.iid and l.kind = 'hb' and l.val < 110 and l.d >= a and l.d < b)
  from (select distinct ms.institution_id iid from ms) i order by i.iid;
end $$;

-- ---------------------------------------------------------------- карточка и «Моя страница»: + анализы, план родов, места сигналов
create or replace function private.mother_extras(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'a', x.a, 'at', x.created_at, 'answered_at', x.answered_at, 'a_by', p.full_name) order by x.created_at desc)
                          from (select * from public.mother_questions q where q.mother_id = _mid order by q.created_at desc limit 20) x
                          left join public.profiles p on p.id = x.a_by), '[]'),
    'baby', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'val', b.val, 'd', b.d) order by b.d, b.created_at)
                      from public.mother_baby b where b.mother_id = _mid), '[]'),
    'pill_hour', (select g.pill_hour from public.mother_tg g where g.mother_id = _mid),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target', r.target, 'reason', r.reason, 'due_date', r.due_date, 'created_at', r.created_at,
                                  'arrived_at', r.arrived_at, 'result', r.result, 'by', p.full_name) order by r.created_at desc)
                          from public.referrals r left join public.profiles p on p.id = r.created_by where r.mother_id = _mid), '[]'),
    'fp', (select jsonb_build_object('method', m.fp_method, 'date', m.fp_date) from public.mothers m where m.id = _mid),
    'labs', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'val', l.val, 'd', l.d, 'by', p.full_name) order by l.d desc, l.id desc)
                      from public.mother_labs l left join public.profiles p on p.id = l.by_user where l.mother_id = _mid), '[]'),
    'lab_flags', private.lab_flags(_mid),
    'birthplan', (select jsonb_build_object('place', b.place, 'companion', b.companion, 'driver', b.driver, 'driver_phone', b.driver_phone,
                                            'docs', b.docs, 'bag', b.bag, 'updated_at', b.updated_at, 'by_mother', b.updated_by is null)
                  from public.mother_birthplan b where b.mother_id = _mid),
    'locs', coalesce((select jsonb_agg(jsonb_build_object('alert_id', a.id, 'lat', a.lat, 'lon', a.lon, 'at', a.loc_at) order by a.created_at desc)
                      from public.mother_alerts a where a.mother_id = _mid and a.lat is not null), '[]'));
$$;

revoke all on function public.lab_save(uuid, text, numeric, date), public.lab_delete(bigint), private.lab_flags(uuid),
  private.birthplan_put(uuid, jsonb, uuid), public.birthplan_save(uuid, jsonb), public.bot_mother_birthplan(bigint, jsonb),
  private.alert_recipients(uuid, boolean), public.bot_mother_alert(bigint, text[]), public.bot_mother_location(bigint, double precision, double precision),
  public.mothers_flags(), public.mothers_month_report(date), private.mother_extras(uuid)
  from public, anon, authenticated;
grant execute on function public.lab_save(uuid, text, numeric, date), public.lab_delete(bigint), public.birthplan_save(uuid, jsonb),
  public.mothers_flags(), public.mothers_month_report(date) to authenticated;
grant execute on function public.bot_mother_birthplan(bigint, jsonb), public.bot_mother_alert(bigint, text[]),
  public.bot_mother_location(bigint, double precision, double precision) to service_role;
