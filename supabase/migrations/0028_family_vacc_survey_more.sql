-- 0028: семья беременной в боте, календарь прививок до 5 лет, опрос после родов, нагрузка доя,
-- направление с QR (отметка «дошла» дежурным роддома), объявления беременным, журнал тяжёлых случаев, ежемесячный отчёт в Telegram.

-- ---------------------------------------------------------------- семья (муж, мама, свекровь) — по приглашению самой беременной
create table public.mother_family (
  id          bigint generated always as identity primary key,
  mother_id   uuid not null references public.mothers (id) on delete cascade,
  telegram_id bigint not null unique,
  relation    text not null default 'other' check (relation in ('husband', 'mother', 'mother_in_law', 'other')),
  linked_at   timestamptz not null default now()
);
create index mother_family_mother_idx on public.mother_family (mother_id);
alter table public.mother_family enable row level security;
revoke all on public.mother_family from public, anon, authenticated;
create table private.family_codes (
  code_hash  text primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);

-- беременная просит ссылку для родственника (не больше 2 подключённых)
create or replace function public.bot_family_invite(_tg bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; _c text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if (select count(*) from public.mother_family f where f.mother_id = g.mother_id) >= 2 then return jsonb_build_object('error', 'too_many'); end if;
  delete from private.family_codes where mother_id = g.mother_id or expires_at < now();
  insert into private.family_codes (code_hash, mother_id, expires_at) values (encode(extensions.digest(_c, 'sha256'), 'hex'), g.mother_id, now() + interval '3 days');
  insert into public.audit_log (actor, action, object, details) values (null, 'family_invite', g.mother_id::text, '{}'::jsonb);
  return jsonb_build_object('code', 'f' || _c);
end $$;

create or replace function public.bot_family_link(_code text, _tg bigint, _relation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; m record;
begin
  if _code !~ '^f[0-9a-f]{24}$' then return jsonb_build_object('error', 'bad_code'); end if;
  select * into c from private.family_codes where code_hash = encode(extensions.digest(substr(_code, 2), 'sha256'), 'hex');
  if not found or c.used_at is not null or c.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  select * into m from public.mothers where id = c.mother_id and status <> 'closed';
  if not found then return jsonb_build_object('error', 'expired'); end if;
  if exists (select 1 from public.mother_tg g where g.telegram_id = _tg) then return jsonb_build_object('error', 'is_mother'); end if;
  if (select count(*) from public.mother_family f where f.mother_id = m.id) >= 2 then return jsonb_build_object('error', 'too_many'); end if;
  delete from public.mother_family where telegram_id = _tg;
  insert into public.mother_family (mother_id, telegram_id, relation)
  values (m.id, _tg, case when _relation in ('husband', 'mother', 'mother_in_law') then _relation else 'other' end);
  update private.family_codes set used_at = now() where code_hash = c.code_hash;
  insert into public.audit_log (actor, action, object, details) values (null, 'family_linked', m.id::text, jsonb_build_object('relation', _relation));
  return jsonb_build_object('ok', true, 'first_name', split_part(m.full_name, ' ', 2),
    'lang', coalesce((select g.lang from public.mother_tg g where g.mother_id = m.id), 'uz'));
end $$;

-- родственники беременной (по её Telegram) — бот шлёт им копии напоминаний и тревожных сигналов
create or replace function public.bot_family_of(_tg bigint)
returns table (telegram_id bigint, relation text, lang text, first_name text)
language sql stable security definer set search_path = '' as $$
  select f.telegram_id, f.relation, g.lang, split_part(m.full_name, ' ', 2)
  from public.mother_tg g join public.mother_family f on f.mother_id = g.mother_id join public.mothers m on m.id = g.mother_id
  where g.telegram_id = _tg;
$$;

create or replace function public.bot_family_stop(_tg bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _m uuid;
begin
  delete from public.mother_family where telegram_id = _tg returning mother_id into _m;
  if _m is not null then insert into public.audit_log (actor, action, object, details) values (null, 'family_stopped', _m::text, '{}'::jsonb); end if;
  return _m is not null;
end $$;

-- беременная отключает родственника
create or replace function public.bot_family_remove(_tg bigint, _id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; _f bigint;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  delete from public.mother_family f where f.id = _id and f.mother_id = g.mother_id returning f.telegram_id into _f;
  return jsonb_build_object('ok', _f is not null, 'telegram_id', _f);
end $$;

-- ---------------------------------------------------------------- календарь прививок (администратор правит по действующему приказу МЗ)
create table public.vacc_schedule (
  code     text primary key check (code ~ '^[a-z0-9_]{2,20}$'),
  label_ru text not null check (length(label_ru) between 2 and 80),
  label_uz text not null check (length(label_uz) between 2 and 80),
  age_days int not null check (age_days between 0 and 1900),
  sort     int not null default 0
);
alter table public.vacc_schedule enable row level security;
revoke all on public.vacc_schedule from public, anon, authenticated;
insert into public.vacc_schedule (code, label_ru, label_uz, age_days, sort) values
  ('hepb1', 'Гепатит B (ВГВ-1)', 'Гепатит B (ВГВ-1)', 0, 10),
  ('bcg', 'БЦЖ', 'БЦЖ', 2, 20),
  ('opv0', 'Полио (ОПВ-0)', 'Полиомиелит (ОПВ-0)', 2, 30),
  ('m2', '2 месяца: пентавакцина-1, ОПВ-1, ротавирус-1, пневмококк-1', '2 ой: пентавакцина-1, ОПВ-1, ротавирус-1, пневмококк-1', 60, 40),
  ('m3', '3 месяца: пентавакцина-2, ОПВ-2, ротавирус-2, пневмококк-2', '3 ой: пентавакцина-2, ОПВ-2, ротавирус-2, пневмококк-2', 90, 50),
  ('m4', '4 месяца: пентавакцина-3, ОПВ-3, ИПВ', '4 ой: пентавакцина-3, ОПВ-3, ИПВ', 120, 60),
  ('m12', '12 месяцев: КПК-1 (корь, краснуха, паротит), пневмококк-3', '12 ой: ҚПҚ-1 (қизамиқ, қизилча, тепки), пневмококк-3', 365, 70),
  ('m16', '16 месяцев: АКДС-4, ОПВ-4', '16 ой: АКДС-4, ОПВ-4', 487, 80)
on conflict do nothing;

create or replace function public.vacc_list()
returns setof public.vacc_schedule language sql stable security definer set search_path = '' as $$
  select * from public.vacc_schedule order by age_days, sort;
$$;
create or replace function public.admin_vacc_save(_code text, _ru text, _uz text, _age int, _sort int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  insert into public.vacc_schedule (code, label_ru, label_uz, age_days, sort) values (_code, btrim(_ru), btrim(_uz), _age, coalesce(_sort, 0))
  on conflict (code) do update set label_ru = excluded.label_ru, label_uz = excluded.label_uz, age_days = excluded.age_days, sort = excluded.sort;
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), 'vacc_save', _code, jsonb_build_object('age', _age));
exception when check_violation then raise exception 'bad_value';
end $$;
create or replace function public.admin_vacc_delete(_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.vacc_schedule where code = _code;
end $$;

-- напоминание матери: подошёл срок прививки (ребёнку до 5 лет; каждая — один раз, в течение 14 дней после срока)
create or replace function public.cron_mother_vaccines(_secret text)
returns table (telegram_id bigint, lang text, first_name text, codes text[], labels_ru text[], labels_uz text[])
language plpgsql security definer set search_path = '' as $$
declare t date := private.today();
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with c as (
    select g.telegram_id tg, g.lang lg, m.id mid, split_part(m.full_name, ' ', 2) fn, v.code, v.label_ru, v.label_uz, v.sort, v.age_days
    from public.mother_tg g join public.mothers m on m.id = g.mother_id and m.outcome = 'delivered' and m.outcome_date is not null
      join public.vacc_schedule v on t - m.outcome_date between v.age_days and v.age_days + 14
    where t - m.outcome_date <= 1826
      and not exists (select 1 from public.mother_baby b where b.mother_id = m.id and b.kind = 'vaccine' and split_part(b.val, ':', 1) = v.code)
  ), ins as (
    insert into private.mother_sent (mother_id, key) select c.mid, 'vac:' || c.code from c on conflict do nothing returning mother_id, key
  )
  select c.tg, c.lg, c.fn, array_agg(c.code order by c.age_days, c.sort), array_agg(c.label_ru order by c.age_days, c.sort), array_agg(c.label_uz order by c.age_days, c.sort)
  from c join ins on ins.mother_id = c.mid and ins.key = 'vac:' || c.code
  group by c.tg, c.lg, c.fn;
end $$;

-- ---------------------------------------------------------------- опрос после родов (без имени: хранится только учреждение и месяц)
create table public.pp_survey (
  id             bigint generated always as identity primary key,
  institution_id int not null references public.institutions (id) on delete cascade,
  month          date not null,
  q              smallint not null check (q between 1 and 4),
  v              smallint not null check (v between 0 and 5)
);
create index pp_survey_idx on public.pp_survey (institution_id, month);
alter table public.pp_survey enable row level security;
revoke all on public.pp_survey from public, anon, authenticated;

-- кому отправить опрос: 10–20-й день после родов, один раз
create or replace function public.cron_mother_survey(_secret text)
returns table (telegram_id bigint, lang text, first_name text)
language plpgsql security definer set search_path = '' as $$
declare t date := private.today();
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with c as (
    select g.telegram_id tg, g.lang lg, m.id mid, split_part(m.full_name, ' ', 2) fn
    from public.mother_tg g join public.mothers m on m.id = g.mother_id and m.outcome = 'delivered'
    where t - m.outcome_date between 10 and 20
  ), ins as (insert into private.mother_sent (mother_id, key) select c.mid, 'survey' from c on conflict do nothing returning mother_id)
  select c.tg, c.lg, c.fn from c join ins on ins.mother_id = c.mid;
end $$;

-- ответ на вопрос (каждый вопрос — один раз); возвращает номер следующего вопроса или 0 — конец
create or replace function public.bot_survey_answer(_tg bigint, _q int, _v int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; m record;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if _q not between 1 and 4 or _v not between 0 and 5 or (_q in (2, 3) and _v > 1) then return jsonb_build_object('error', 'bad_value'); end if;
  select * into m from public.mothers where id = g.mother_id;
  if not exists (select 1 from private.mother_sent s where s.mother_id = m.id and s.key = 'survey') then return jsonb_build_object('error', 'no_survey'); end if;
  insert into private.mother_sent (mother_id, key) values (m.id, 'survey_q' || _q) on conflict do nothing;
  if found then
    insert into public.pp_survey (institution_id, month, q, v) values (m.institution_id, date_trunc('month', private.today())::date, _q, _v);
  end if;
  return jsonb_build_object('ok', true, 'next', case when _q < 4 then _q + 1 else 0 end);
end $$;

-- итоги опроса для руководителей: по вопросам за период
create or replace function public.survey_summary(_from date)
returns table (q int, n int, avg numeric, yes_pct int)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid());
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.q::int, count(*)::int, round(avg(s.v)::numeric, 1), round(100.0 * count(*) filter (where s.v = 1) / nullif(count(*), 0))::int
  from public.pp_survey s
  where (_ins is null or s.institution_id = any (_ins)) and s.month >= date_trunc('month', coalesce(_from, private.today() - 365))::date
  group by s.q order by s.q;
end $$;

-- ---------------------------------------------------------------- нагрузка доя: на учёте, визиты и патронаж за 30 дней
create or replace function public.staff_load()
returns table (user_id uuid, full_name text, institution_id int, registered_active int, anc_30 int, home_30 int)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); t date := private.today();
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.institution_id,
    (select count(*)::int from public.mothers m where m.created_by = p.id and m.status <> 'closed'),
    (select count(*)::int from public.anc_visits v where v.by_user = p.id and v.visit_date > t - 30),
    (select count(*)::int from public.home_visits v where v.by_user = p.id and v.visit_date > t - 30)
  from public.profiles p
  where p.removed_at is null and private.is_member(p.id) and private.preg_staff(p.id)
    and p.institution_id is not null and (_ins is null or p.institution_id = any (_ins))
  order by p.institution_id, p.full_name;
end $$;

-- ---------------------------------------------------------------- направление по QR: карточка направления и отметка «дошла»
-- видят и отмечают: сотрудники учреждения беременной, руководители района и дежурные роддома
create or replace function private.ref_ok(_uid uuid, _inst int)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.preg_ok(_uid, _inst) or (private.is_member(_uid) and exists (select 1 from public.duty_staff d where d.user_id = _uid));
$$;

create or replace function public.referral_get(_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select x.*, m.institution_id inst, m.full_name mname, m.birth_date, m.phone, m.risk, m.lmp, m.edd_us, m.status mstatus,
         (select i.name from public.institutions i where i.id = m.institution_id) iname, (select p.full_name from public.profiles p where p.id = x.created_by) by_name
    into r from public.referrals x join public.mothers m on m.id = x.mother_id where x.id = _id;
  if not found or not private.ref_ok(auth.uid(), r.inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('id', r.id, 'mother_id', r.mother_id, 'target', r.target, 'reason', r.reason, 'due_date', r.due_date, 'created_at', r.created_at,
    'arrived_at', r.arrived_at, 'result', r.result, 'by', r.by_name, 'mother_name', r.mname, 'birth_date', r.birth_date, 'phone', r.phone, 'risk', r.risk,
    'institution', r.iname, 'ga_days', case when r.mstatus = 'pregnant' then private.today() - coalesce(r.edd_us - 280, r.lmp) end,
    'can_card', private.preg_ok(auth.uid(), r.inst));
end $$;

create or replace function public.referral_arrived(_id bigint, _date date, _result text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select x.*, m.institution_id inst, m.lmp into r from public.referrals x join public.mothers m on m.id = x.mother_id where x.id = _id;
  if not found or not private.ref_ok(auth.uid(), r.inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _date is not null and (_date > private.today() or _date < r.created_at::date) then raise exception 'bad_date'; end if;
  update public.referrals set arrived_at = _date, result = left(btrim(coalesce(_result, '')), 500) where id = _id;
end $$;

-- ---------------------------------------------------------------- объявления беременным учреждения / махаллей (через бот)
create table public.mother_announcements (
  id             bigint generated always as identity primary key,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  institution_id int not null references public.institutions (id) on delete cascade,
  mahalla_ids    int[] not null default '{}',
  body           text not null check (length(body) between 5 and 1000),
  created_at     timestamptz not null default now(),
  total          int,
  sent           int
);
alter table public.mother_announcements enable row level security;
revoke all on public.mother_announcements from public, anon, authenticated;

-- сколько получат (подключены к боту): для подсказки до отправки
create or replace function public.announce_count(_inst int, _mah int[])
returns int language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.preg_ok(auth.uid(), _inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::int from public.mothers m join public.mother_tg g on g.mother_id = m.id
          where m.institution_id = _inst and m.status <> 'closed' and (coalesce(array_length(_mah, 1), 0) = 0 or m.mahalla_id = any (_mah)));
end $$;

create or replace function public.announce_create(_inst int, _mah int[], _body text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare _id bigint; _b text := btrim(coalesce(_body, ''));
begin
  if not private.preg_ok(auth.uid(), _inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(_b) < 5 or length(_b) > 1000 then raise exception 'bad_text'; end if;
  if (select count(*) from public.mother_announcements a where a.created_by = auth.uid() and a.created_at > now() - interval '1 day') >= 10 then raise exception 'too_many'; end if;
  insert into public.mother_announcements (institution_id, mahalla_ids, body) values (_inst, coalesce(_mah, '{}'), _b) returning id into _id;
  return _id;
end $$;

-- для бота: кому отправить (только неотправленное объявление)
create or replace function public.announce_targets(_id bigint)
returns table (telegram_id bigint, lang text, body text, inst_name text)
language sql security definer set search_path = '' as $$
  select g.telegram_id, g.lang, a.body, (select i.name from public.institutions i where i.id = a.institution_id)
  from public.mother_announcements a join public.mothers m on m.institution_id = a.institution_id and m.status <> 'closed'
    join public.mother_tg g on g.mother_id = m.id
  where a.id = _id and a.sent is null and (coalesce(array_length(a.mahalla_ids, 1), 0) = 0 or m.mahalla_id = any (a.mahalla_ids));
$$;
create or replace function public.announce_done(_id bigint, _total int, _sent int)
returns void language sql security definer set search_path = '' as $$
  update public.mother_announcements set total = _total, sent = _sent where id = _id and sent is null;
$$;

create or replace function public.announce_list()
returns table (id bigint, institution_id int, mahalla_ids int[], body text, created_at timestamptz, total int, sent int, by_name text)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid());
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select a.id, a.institution_id, a.mahalla_ids, a.body, a.created_at, a.total, a.sent, (select p.full_name from public.profiles p where p.id = a.created_by)
  from public.mother_announcements a where _ins is null or a.institution_id = any (_ins) order by a.created_at desc limit 30;
end $$;

-- ---------------------------------------------------------------- журнал тяжёлых случаев (только администратор)
create table public.critical_cases (
  id             bigint generated always as identity primary key,
  case_date      date not null,
  institution_id int references public.institutions (id) on delete set null,
  kind           text not null check (kind in ('severe_pph', 'eclampsia', 'sepsis', 'uterine_rupture', 'abortion', 'anesthesia', 'maternal_death', 'neonatal_death', 'other')),
  patient        text not null default '' check (length(patient) <= 120),
  description    text not null default '' check (length(description) <= 3000),
  actions        text not null default '' check (length(actions) <= 3000),
  lessons        text not null default '' check (length(lessons) <= 3000),
  status         text not null default 'open' check (status in ('open', 'reviewed')),
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.critical_cases enable row level security;
revoke all on public.critical_cases from public, anon, authenticated;

create or replace function public.cases_list()
returns setof public.critical_cases language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select * from public.critical_cases order by case_date desc, id desc;
end $$;

create or replace function public.case_save(_id bigint, _d jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare _new bigint;
begin
  perform private.require_admin();
  if _id is null then
    insert into public.critical_cases (case_date, institution_id, kind, patient, description, actions, lessons, status)
    values ((_d ->> 'case_date')::date, nullif(_d ->> 'institution_id', '')::int, _d ->> 'kind', left(btrim(coalesce(_d ->> 'patient', '')), 120),
            left(coalesce(_d ->> 'description', ''), 3000), left(coalesce(_d ->> 'actions', ''), 3000), left(coalesce(_d ->> 'lessons', ''), 3000), coalesce(_d ->> 'status', 'open'))
    returning id into _new;
  else
    update public.critical_cases set case_date = (_d ->> 'case_date')::date, institution_id = nullif(_d ->> 'institution_id', '')::int, kind = _d ->> 'kind',
      patient = left(btrim(coalesce(_d ->> 'patient', '')), 120), description = left(coalesce(_d ->> 'description', ''), 3000),
      actions = left(coalesce(_d ->> 'actions', ''), 3000), lessons = left(coalesce(_d ->> 'lessons', ''), 3000), status = coalesce(_d ->> 'status', 'open'), updated_at = now()
    where id = _id returning id into _new;
    if _new is null then raise exception 'not_found'; end if;
  end if;
  if (select case_date from public.critical_cases where id = _new) > private.today() then raise exception 'bad_date'; end if;
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), 'case_save', _new::text, '{}'::jsonb);
  return _new;
exception when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format then raise exception 'bad_form';
end $$;

create or replace function public.case_delete(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.critical_cases where id = _id;
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), 'case_delete', _id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- ежемесячный отчёт в Telegram (хокимияту, руководителям)
create table public.report_recipients (
  user_id uuid primary key references auth.users (id) on delete cascade,
  set_by  uuid references auth.users (id) on delete set null default auth.uid(),
  set_at  timestamptz not null default now()
);
alter table public.report_recipients enable row level security;
revoke all on public.report_recipients from public, anon, authenticated;

create or replace function public.admin_report_list()
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select r.user_id from public.report_recipients r;
end $$;
create or replace function public.admin_set_report(_uid uuid, _on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles p where p.id = _uid and p.removed_at is null) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(_on, false) then insert into public.report_recipients (user_id) values (_uid) on conflict do nothing;
  else delete from public.report_recipients where user_id = _uid; end if;
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), 'report_set', _uid::text, jsonb_build_object('on', coalesce(_on, false)));
end $$;

-- итоги района за месяц (без проверки прав: только для планировщика и тестов через cron_month_digest)
create or replace function private.month_totals(_a date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with b as (select (_a + interval '1 month')::date b),
       ms as (select x.*, (x.created_at at time zone 'Asia/Tashkent')::date reg, coalesce(x.edd_us - 280, x.lmp) lmp0 from public.mothers x)
  select jsonb_build_object(
    'registered', (select count(*) from ms, b where ms.reg >= _a and ms.reg < b.b),
    'early', (select count(*) from ms, b where ms.reg >= _a and ms.reg < b.b and ms.reg - ms.lmp0 < 84),
    'high_risk', (select count(*) from ms, b where ms.reg >= _a and ms.reg < b.b and ms.risk = 'high'),
    'delivered', (select count(*) from ms, b where ms.outcome = 'delivered' and ms.outcome_date >= _a and ms.outcome_date < b.b),
    'anc_visits', (select count(*) from public.anc_visits v, b where v.visit_date >= _a and v.visit_date < b.b),
    'home_visits', (select count(*) from public.home_visits v, b where v.visit_date >= _a and v.visit_date < b.b),
    'alerts', (select count(*) from public.mother_alerts al, b where al.created_at >= _a and al.created_at < b.b),
    'referred', (select count(*) from public.referrals r, b where r.created_at >= _a and r.created_at < b.b),
    'referred_arrived', (select count(*) from public.referrals r, b where r.created_at >= _a and r.created_at < b.b and r.arrived_at is not null),
    'anemia', (select count(distinct l.mother_id) from public.mother_labs l, b where l.kind = 'hb' and l.val < 110 and l.d >= _a and l.d < b.b),
    'on_register', (select count(*) from ms, b where ms.reg < b.b and (ms.status <> 'closed' or coalesce(ms.outcome_date, ms.reg) >= _a)));
$$;

create or replace function public.cron_month_digest(_secret text)
returns table (telegram_id bigint, full_name text, month date, cur jsonb, prev jsonb)
language plpgsql security definer set search_path = '' as $$
declare a date := (date_trunc('month', private.today()) - interval '1 month')::date; c jsonb; p jsonb;
begin
  if _secret is null or not exists (select 1 from private.cron_secret s where s.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  c := private.month_totals(a); p := private.month_totals((a - interval '1 month')::date);
  return query
  select distinct on (tl.telegram_id) tl.telegram_id, pr.full_name, a, c, p
  from public.report_recipients r join public.profiles pr on pr.id = r.user_id join public.telegram_links tl on tl.user_id = pr.id
  where pr.removed_at is null and private.is_member(pr.id);
end $$;

-- ---------------------------------------------------------------- карточка и «Моя страница»: + родственники в Telegram
alter function private.mother_extras(uuid) rename to mother_extras_v27_impl;
create function private.mother_extras(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.mother_extras_v27_impl(_mid) || jsonb_build_object(
    'family', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'relation', f.relation, 'linked_at', f.linked_at) order by f.linked_at)
                        from public.mother_family f where f.mother_id = _mid), '[]'));
$$;

revoke all on function public.bot_family_invite(bigint), public.bot_family_link(text, bigint, text), public.bot_family_of(bigint), public.bot_family_stop(bigint),
  public.bot_family_remove(bigint, bigint), public.vacc_list(), public.admin_vacc_save(text, text, text, int, int), public.admin_vacc_delete(text),
  public.cron_mother_vaccines(text), public.cron_mother_survey(text), public.bot_survey_answer(bigint, int, int), public.survey_summary(date), public.staff_load(),
  private.ref_ok(uuid, int), public.referral_get(bigint), public.referral_arrived(bigint, date, text), public.announce_count(int, int[]), public.announce_create(int, int[], text),
  public.announce_targets(bigint), public.announce_done(bigint, int, int), public.announce_list(), public.cases_list(), public.case_save(bigint, jsonb), public.case_delete(bigint),
  public.admin_report_list(), public.admin_set_report(uuid, boolean), private.month_totals(date), public.cron_month_digest(text),
  private.mother_extras(uuid), private.mother_extras_v27_impl(uuid)
  from public, anon, authenticated;
grant execute on function public.vacc_list(), public.admin_vacc_save(text, text, text, int, int), public.admin_vacc_delete(text), public.survey_summary(date), public.staff_load(),
  public.referral_get(bigint), public.referral_arrived(bigint, date, text), public.announce_count(int, int[]), public.announce_create(int, int[], text), public.announce_list(),
  public.cases_list(), public.case_save(bigint, jsonb), public.case_delete(bigint), public.admin_report_list(), public.admin_set_report(uuid, boolean) to authenticated;
grant execute on function public.bot_family_invite(bigint), public.bot_family_link(text, bigint, text), public.bot_family_of(bigint), public.bot_family_stop(bigint),
  public.bot_family_remove(bigint, bigint), public.vacc_list(), public.cron_mother_vaccines(text), public.cron_mother_survey(text), public.bot_survey_answer(bigint, int, int),
  public.announce_targets(bigint), public.announce_done(bigint, int, int), public.cron_month_digest(text) to service_role;
