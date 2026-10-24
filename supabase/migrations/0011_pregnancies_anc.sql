-- Беременные по неделям: график визитов и анализов (приказ №180 от 23.06.2025, прил. 2 «Антенатальный уход»).
-- На сервер попадает только обезличенная запись: № карты, год рождения, махалля, дата последней менструации. Ф.И.О., телефон и адрес не хранятся.
-- Окна визитов (с какой по какую неделю) — рабочие допуски вокруг сроков из протокола; администратор может править их на сайте.
-- Всё закрыто RLS без политик; работа через функции.

create table public.anc_schedule (
  visit_no   int primary key check (visit_no between 1 and 20),
  label      text not null check (length(label) between 1 and 120),
  from_week  int not null check (from_week between 0 and 60),
  until_week int not null check (until_week between 0 and 60 and until_week >= from_week),
  tests      jsonb not null default '[]'::jsonb,
  notes      text check (length(notes) <= 4000)
);
insert into public.anc_schedule (visit_no, label, from_week, until_week, tests, notes) values
  (1, 'Первый визит (до 12 недель)', 0, 12, '["Группа крови AB0 и резус-фактор", "Антирезусные антитела (если резус-отрицательная)", "ВИЧ (антитела IgM/IgG)", "HBsAg (гепатит B)", "Anti-HCV (гепатит C)", "Сифилис (антитела к Treponema pallidum)", "Посев средней порции мочи (бессимптомная бактериурия)", "Общий анализ крови", "Глюкоза плазмы натощак", "ПГТТ — при факторах риска ГСД", "Цитология шейки матки", "УЗИ и скрининг 1 триместра (11–13 нед 6 дн)", "Осмотр стоматолога"]'::jsonb, 'Однократно: сбор анамнеза, срок по ДПМ и УЗИ. Осмотр: АД, пульс, пальпация молочных желёз, гинекологический осмотр. Спросить о домашнем насилии и психическом здоровье. Оценить группу риска (преэклампсия, ГСД, ЗРП, преждевременные роды, ВТЭО, кровотечение). Фолиевая кислота 400 мкг до 12 нед, йод 200 мкг, железо 30–60 мг с фолатом; аспирин при высоком риске преэклампсии — по протоколу.'),
  (2, 'Визит 2 (18–20 недель)', 18, 20, '["УЗИ плода, скрининг 2 триместра (18–20 нед 6 дн)"]'::jsonb, 'При каждом визите: жалобы, АД и пульс, высота дна матки, ЧСС плода, расспрос о шевелениях, белок в моче. Проверить группу риска.'),
  (3, 'Визит 3 (26 недель)', 25, 27, '["Общий анализ крови (26 нед)", "Антирезусные антитела — если резус-отрицательная (26–28 нед)", "ПГТТ при факторах риска ГСД, если не выявлен диабет раньше (26–28 нед)"]'::jsonb, 'Резус-отрицательной без антител — иммуноглобулин анти-D в 28–30 нед. ВНИМАНИЕ: в тексте протокола второй визит II триместра указан на 24-й неделе, а в таблице — на 26-й; здесь взята таблица, проверьте по приказу.'),
  (4, 'Визит 4 (30 недель)', 29, 31, '["ВИЧ — повтор", "HBsAg — повтор", "Anti-HCV — повтор", "Сифилис — повтор"]'::jsonb, 'Повторное обследование на инфекции лучше провести до 36 нед. При находках — направить к профильному специалисту.'),
  (5, 'Визит 5 (34 недели)', 33, 35, '[]'::jsonb, 'Положение и предлежание плода — при каждом визите после 34–36 нед. УЗИ в III триместре — при подозрении на неправильное положение, ЗРП, крупный плод. Анти-D профилактика, если не сделана, возможна до 34 нед.'),
  (6, 'Визит 6 (36 недель)', 35, 37, '[]'::jsonb, 'Мониторинг состояния беременной и плода, подготовка к родам, план родоразрешения.'),
  (7, 'Визит 7 (38 недель)', 37, 39, '[]'::jsonb, 'Консультирование о рисках переношенной беременности, мониторинг матери и плода.'),
  (8, 'Визит 8 (40 недель)', 39, 41, '[]'::jsonb, 'Направление на индукцию родов при переношенной беременности, мониторинг.'),
  (9, 'После родов', 42, 60, '[]'::jsonb, 'Послеродовое наблюдение (в напоминаниях не учитывается).');

create table public.pregnancies (
  id             uuid primary key default gen_random_uuid(),
  card_no        text not null check (length(btrim(card_no)) between 1 and 30),
  birth_year     int check (birth_year between 1950 and 2020),
  mahalla_id     int references public.mahallas (id) on delete set null,
  institution_id int references public.institutions (id) on delete set null,
  owner          uuid references auth.users (id) on delete set null default auth.uid(),
  lmp            date not null check (lmp >= date '2020-01-01'),
  risk           boolean not null default false,
  outcome        text check (outcome in ('delivered', 'miscarriage', 'transferred', 'other')),
  outcome_date   date,
  created_at     timestamptz not null default now()
);
create unique index pregnancies_card_uq on public.pregnancies (lower(btrim(card_no)), coalesce(institution_id, 0));
create index pregnancies_owner_idx on public.pregnancies (owner);
create index pregnancies_inst_idx on public.pregnancies (institution_id);

create table public.pregnancy_visits (
  id           bigint generated always as identity primary key,
  pregnancy_id uuid not null references public.pregnancies (id) on delete cascade,
  visit_no     int not null check (visit_no between 0 and 20),
  visit_date   date not null,
  tests        text[] not null default '{}',
  by_user      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create unique index pregnancy_visits_uq on public.pregnancy_visits (pregnancy_id, visit_no) where visit_no > 0;
create index pregnancy_visits_preg_idx on public.pregnancy_visits (pregnancy_id);

alter table public.anc_schedule     enable row level security;
alter table public.pregnancies      enable row level security;
alter table public.pregnancy_visits enable row level security;
revoke all on public.anc_schedule, public.pregnancies, public.pregnancy_visits from anon, authenticated;

-- кто видит чужие записи: руководители (admin/deputy/chief_physician) и заведующие с областью «по учреждению»
create or replace function private.can_see_preg(_viewer uuid, _inst int)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_manager(_viewer) or (_inst is not null and exists (
    select 1 from public.scopes s where s.user_id = _viewer and s.kind = 'institution' and s.institution_id = _inst));
$$;

-- график (читают все участники)
create or replace function public.anc_schedule_list()
returns table (visit_no int, label text, from_week int, until_week int, tests jsonb, notes text)
language sql stable security definer set search_path = '' as $$
  select s.visit_no, s.label, s.from_week, s.until_week, s.tests, s.notes from public.anc_schedule s
  where private.is_member(auth.uid()) order by s.visit_no;
$$;

create or replace function public.admin_save_anc_row(_visit int, _from int, _until int, _tests jsonb, _notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _from is null or _until is null or _until < _from or _from < 0 or _until > 60 then raise exception 'bad_window'; end if;
  if jsonb_typeof(coalesce(_tests, '[]'::jsonb)) <> 'array' then raise exception 'bad_tests'; end if;
  update public.anc_schedule set from_week = _from, until_week = _until, tests = coalesce(_tests, tests), notes = coalesce(left(_notes, 4000), notes) where visit_no = _visit;
  if not found then raise exception 'no_such_visit'; end if;
  perform private.log_event('anc_schedule_changed', _visit::text, jsonb_build_object('from', _from, 'until', _until));
end $$;

-- добавить беременную
create or replace function public.add_pregnancy(_card text, _birth_year int, _mahalla int, _lmp date, _risk boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid; _inst int; _c text := btrim(coalesce(_card, ''));
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(_c) < 1 or length(_c) > 30 then raise exception 'bad_card'; end if;
  if _lmp is null or _lmp > current_date or _lmp < current_date - 300 then raise exception 'bad_lmp'; end if;
  select institution_id into _inst from public.profiles where id = auth.uid();
  insert into public.pregnancies (card_no, birth_year, mahalla_id, institution_id, lmp, risk)
  values (_c, _birth_year, (select m.id from public.mahallas m where m.id = _mahalla), _inst, _lmp, coalesce(_risk, false)) returning id into _id;
  return _id;
exception when unique_violation then raise exception 'card_exists';
end $$;

-- изменить (владелец или администратор)
create or replace function public.edit_pregnancy(_id uuid, _birth_year int, _mahalla int, _lmp date, _risk boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if _lmp is null or _lmp > current_date or _lmp < current_date - 300 then raise exception 'bad_lmp'; end if;
  update public.pregnancies set birth_year = _birth_year, mahalla_id = (select m.id from public.mahallas m where m.id = _mahalla), lmp = _lmp, risk = coalesce(_risk, false)
  where id = _id and (owner = auth.uid() or private.has_role(auth.uid(), 'admin'));
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- закрыть наблюдение (роды и т. п.) или вернуть (_outcome = null)
create or replace function public.close_pregnancy(_id uuid, _outcome text, _date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if _outcome is not null and _outcome not in ('delivered', 'miscarriage', 'transferred', 'other') then raise exception 'bad_outcome'; end if;
  update public.pregnancies set outcome = _outcome, outcome_date = case when _outcome is null then null else coalesce(_date, current_date) end
  where id = _id and (owner = auth.uid() or private.has_role(auth.uid(), 'admin'));
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_pregnancy(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pregnancies where id = _id and (owner = auth.uid() or private.has_role(auth.uid(), 'admin'));
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- записать визит (повторная запись того же номера обновляет дату и анализы)
create or replace function public.record_anc_visit(_id uuid, _visit int, _date date, _tests text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pregnancies where id = _id and (owner = auth.uid() or private.has_role(auth.uid(), 'admin'))) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _visit is null or _visit < 0 or _visit > 20 then raise exception 'bad_visit'; end if;
  if _date is null or _date > current_date then raise exception 'bad_date'; end if;
  if _visit = 0 then
    insert into public.pregnancy_visits (pregnancy_id, visit_no, visit_date, tests) values (_id, 0, _date, coalesce(_tests, '{}'));
  else
    insert into public.pregnancy_visits (pregnancy_id, visit_no, visit_date, tests) values (_id, _visit, _date, coalesce(_tests, '{}'))
    on conflict (pregnancy_id, visit_no) where visit_no > 0 do update set visit_date = excluded.visit_date, tests = excluded.tests, by_user = auth.uid();
  end if;
end $$;

create or replace function public.remove_anc_visit(_id uuid, _visit int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pregnancies where id = _id and (owner = auth.uid() or private.has_role(auth.uid(), 'admin'))) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.pregnancy_visits where pregnancy_id = _id and visit_no = _visit;
end $$;

-- список с расчётом срока и состояния: ok / due (пора) / overdue (окно прошло, визит не записан) / check (срок > 42 нед, исход не внесён) / closed
create or replace function public.list_pregnancies(_all boolean default false)
returns table (id uuid, card_no text, birth_year int, mahalla_id int, institution_id int, owner_id uuid, owner_name text, lmp date, weeks int, risk boolean,
               outcome text, state text, visit_no int, due_from int, due_until int, done int[], last_visit date, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.*, ((current_date - p.lmp) / 7) as wk
    from public.pregnancies p
    where private.is_member(auth.uid()) and (p.owner = auth.uid() or (_all and private.can_see_preg(auth.uid(), p.institution_id)))
  ), dn as (
    select v.pregnancy_id, array_agg(distinct v.visit_no order by v.visit_no) filter (where v.visit_no > 0) as done, max(v.visit_date) as last_visit
    from public.pregnancy_visits v group by v.pregnancy_id
  ), calc as (
    select b.*, coalesce(dn.done, '{}'::int[]) as done, dn.last_visit,
      (select min(s.visit_no) from public.anc_schedule s where s.visit_no between 1 and 8 and s.visit_no <> all (coalesce(dn.done, '{}'::int[])) and s.until_week < b.wk) as ov,
      (select min(s.visit_no) from public.anc_schedule s where s.visit_no between 1 and 8 and s.visit_no <> all (coalesce(dn.done, '{}'::int[])) and b.wk between s.from_week and s.until_week) as du,
      (select min(s.visit_no) from public.anc_schedule s where s.visit_no between 1 and 8 and s.visit_no <> all (coalesce(dn.done, '{}'::int[])) and s.from_week > b.wk) as nx
    from base b left join dn on dn.pregnancy_id = b.id
  )
  select c.id, c.card_no, c.birth_year, c.mahalla_id, c.institution_id, c.owner, pr.full_name, c.lmp, c.wk, c.risk, c.outcome,
         case when c.outcome is not null then 'closed' when c.wk > 42 then 'check' when c.ov is not null then 'overdue' when c.du is not null then 'due' else 'ok' end,
         coalesce(c.ov, c.du, c.nx), s.from_week, s.until_week, c.done, c.last_visit, c.created_at
  from calc c left join public.anc_schedule s on s.visit_no = coalesce(c.ov, c.du, c.nx)
  left join public.profiles pr on pr.id = c.owner
  order by (case when c.outcome is not null then 3 when c.wk > 42 then 1 when c.ov is not null then 0 when c.du is not null then 1 else 2 end), c.wk desc;
$$;

-- сводка для Telegram: по каждому владельцу — сколько пора и сколько просрочено (без номеров карт и без данных);
-- первой строкой (user_id null) — итог по району для администратора
create or replace function private.anc_digest_rows()
returns table (user_id uuid, telegram_id bigint, due int, overdue int)
language sql stable security definer set search_path = '' as $$
  with st as (
    select p.owner,
      case when p.outcome is not null or ((current_date - p.lmp) / 7) > 42 then 'x'
           when exists (select 1 from public.anc_schedule s where s.visit_no between 1 and 8 and s.until_week < ((current_date - p.lmp) / 7)
                          and not exists (select 1 from public.pregnancy_visits v where v.pregnancy_id = p.id and v.visit_no = s.visit_no)) then 'overdue'
           when exists (select 1 from public.anc_schedule s where s.visit_no between 1 and 8 and ((current_date - p.lmp) / 7) between s.from_week and s.until_week
                          and not exists (select 1 from public.pregnancy_visits v where v.pregnancy_id = p.id and v.visit_no = s.visit_no)) then 'due'
           else 'ok' end as s
    from public.pregnancies p)
  select null::uuid, null::bigint, count(*) filter (where s = 'due')::int, count(*) filter (where s = 'overdue')::int from st
  union all
  select st.owner, tl.telegram_id, count(*) filter (where s = 'due')::int, count(*) filter (where s = 'overdue')::int
  from st join public.telegram_links tl on tl.user_id = st.owner where st.owner is not null group by st.owner, tl.telegram_id
  having count(*) filter (where s in ('due', 'overdue')) > 0;
$$;
create or replace function public.admin_anc_digest()
returns table (user_id uuid, telegram_id bigint, due int, overdue int, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select d.user_id, d.telegram_id, d.due, d.overdue, false from private.anc_digest_rows() d where d.user_id is not null
    union all
    select r.user_id, tl.telegram_id, (select d.due from private.anc_digest_rows() d where d.user_id is null), (select d.overdue from private.anc_digest_rows() d where d.user_id is null), true
    from public.user_roles r join public.telegram_links tl on tl.user_id = r.user_id where r.role = 'admin';
end $$;
create or replace function public.cron_anc_digest()
returns table (user_id uuid, telegram_id bigint, due int, overdue int, is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select d.user_id, d.telegram_id, d.due, d.overdue, false from private.anc_digest_rows() d where d.user_id is not null
  union all
  select r.user_id, tl.telegram_id, (select d.due from private.anc_digest_rows() d where d.user_id is null), (select d.overdue from private.anc_digest_rows() d where d.user_id is null), true
  from public.user_roles r join public.telegram_links tl on tl.user_id = r.user_id where r.role = 'admin';
$$;

revoke execute on function private.can_see_preg(uuid, int), private.anc_digest_rows() from public;
revoke execute on function public.anc_schedule_list(), public.admin_save_anc_row(int, int, int, jsonb, text), public.add_pregnancy(text, int, int, date, boolean),
  public.edit_pregnancy(uuid, int, int, date, boolean), public.close_pregnancy(uuid, text, date), public.delete_pregnancy(uuid), public.record_anc_visit(uuid, int, date, text[]),
  public.remove_anc_visit(uuid, int), public.list_pregnancies(boolean), public.admin_anc_digest(), public.cron_anc_digest() from public, anon, authenticated;
grant execute on function private.can_see_preg(uuid, int) to authenticated;
grant execute on function public.anc_schedule_list(), public.admin_save_anc_row(int, int, int, jsonb, text), public.add_pregnancy(text, int, int, date, boolean),
  public.edit_pregnancy(uuid, int, int, date, boolean), public.close_pregnancy(uuid, text, date), public.delete_pregnancy(uuid), public.record_anc_visit(uuid, int, date, text[]),
  public.remove_anc_visit(uuid, int), public.list_pregnancies(boolean), public.admin_anc_digest() to authenticated;
grant execute on function public.cron_anc_digest() to service_role;
