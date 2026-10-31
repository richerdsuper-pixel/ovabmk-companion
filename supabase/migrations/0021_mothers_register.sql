-- 0021: регистр беременных на сайте (решение администратора: только онлайн, с письменного согласия женщины).
--  * mothers — беременная/родильница: Ф.И.О., дата рождения, телефон, махалля и адрес, № карты, ДПМ и ПДР по УЗИ,
--    риск (низкий/средний/высокий) и факторы риска, дата письменного согласия. Паспорт и подробные диагнозы не храним.
--  * anc_visits — визиты по приказу №180 (окна из anc_schedule) и дополнительные; АД, вес, сданные анализы.
--  * home_visits / home_schedule — патронаж по приказу №210 (прил. 2): беременной на 12 и 32 неделе;
--    родильнице и новорождённому — в 3 дня после выписки, на 15-й и 30-й день. Окна администратор может поправить.
--  * mother_tg — Telegram беременной (кабинет и напоминания), привязка по одноразовому коду от доя и согласию в боте.
--  * mother_alerts — тревожные признаки, о которых сообщила беременная (уходят доя её учреждения).
-- Видят и ведут: сотрудники с клинической должностью своего учреждения (доя, патронаж, акушер-гинеколог, семейный врач),
-- руководитель учреждения (область «учреждение»), главный акушер-гинеколог и руководство района.
-- Всё закрыто RLS без политик; работа только через функции.

insert into private.position_names (code, ru, folders, role) values ('doya_patronaj', 'Патронажная доя', '{9,10,12,13}', 'staff')
on conflict (code) do nothing;

create or replace function private.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Tashkent')::date $$;

-- ---------------------------------------------------------------- права
create or replace function private.preg_district(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_manager(_uid) or 'bosh_akusher' = any (private.user_pos_codes(_uid));
$$;
create or replace function private.preg_staff(_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.user_pos_codes(_uid) && array['doya_qvp', 'doya_patronaj', 'patronaj_hamshira', 'akusher_ginekolog', 'oilaviy_shifokor'];
$$;
create or replace function private.preg_ok(_uid uuid, _inst int)
returns boolean language sql stable security definer set search_path = '' as $$
  select _uid is not null and private.is_member(_uid) and (
    private.preg_district(_uid)
    or exists (select 1 from public.scopes s where s.user_id = _uid and s.kind = 'institution' and s.institution_id = _inst)
    or (private.preg_staff(_uid) and exists (select 1 from public.profiles p where p.id = _uid and p.institution_id = _inst)));
$$;
-- учреждения, которые видит пользователь (null = все)
create or replace function private.preg_insts(_uid uuid)
returns int[] language sql stable security definer set search_path = '' as $$
  select case when private.preg_district(_uid) then null else coalesce((
    select array_agg(distinct x) from (
      select s.institution_id x from public.scopes s where s.user_id = _uid and s.kind = 'institution'
      union all
      select p.institution_id from public.profiles p where p.id = _uid and p.institution_id is not null and private.preg_staff(_uid)) q), '{}') end;
$$;

-- ---------------------------------------------------------------- таблицы
create table public.mothers (
  id             uuid primary key default gen_random_uuid(),
  institution_id int not null references public.institutions (id) on delete restrict,
  mahalla_id     int references public.mahallas (id) on delete set null,
  full_name      text not null check (length(btrim(full_name)) between 5 and 120),
  birth_date     date,
  phone          text check (phone is null or phone ~ '^\+998[0-9]{9}$'),
  address        text not null default '' check (length(address) <= 200),
  card_no        text not null default '' check (length(card_no) <= 30),
  lmp            date not null,
  edd_us         date,
  gravida        int check (gravida between 1 and 30),
  para           int check (para between 0 and 30),
  risk           text not null default 'low' check (risk in ('low', 'mid', 'high')),
  risk_factors   text[] not null default '{}',
  notes          text not null default '' check (length(notes) <= 1000),
  consent_at     date not null,
  status         text not null default 'pregnant' check (status in ('pregnant', 'postpartum', 'closed')),
  outcome        text check (outcome in ('delivered', 'miscarriage', 'transferred', 'moved', 'other')),
  outcome_date   date,
  discharge_date date,
  babies         int check (babies between 0 and 5),
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index mothers_inst_idx on public.mothers (institution_id, status);
create index mothers_mah_idx on public.mothers (mahalla_id);

create table public.anc_visits (
  id         bigint generated always as identity primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  visit_no   int not null check (visit_no between 0 and 20),
  visit_date date not null,
  bp_sys     int check (bp_sys between 50 and 260),
  bp_dia     int check (bp_dia between 30 and 180),
  weight     numeric(5, 1) check (weight between 25 and 250),
  tests      text[] not null default '{}',
  note       text not null default '' check (length(note) <= 500),
  by_user    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index anc_visits_uq on public.anc_visits (mother_id, visit_no) where visit_no > 0;
create index anc_visits_mother_idx on public.anc_visits (mother_id);

create table public.home_schedule (
  kind       text primary key check (kind ~ '^[a-z0-9_]{2,20}$'),
  sort       int not null,
  base       text not null check (base in ('lmp', 'birth')),
  from_day   int not null check (from_day between 0 and 400),
  until_day  int not null check (until_day between 0 and 400 and until_day >= from_day),
  label_ru   text not null,
  label_uz   text not null,
  who        text not null default 'mother' check (who in ('mother', 'both'))
);
insert into public.home_schedule (kind, sort, base, from_day, until_day, label_ru, label_uz, who) values
  ('ant12', 1, 'lmp', 84, 97,   'Патронаж беременной, 12 недель',      'Ҳомиладор патронажи, 12 ҳафта', 'mother'),
  ('ant32', 2, 'lmp', 224, 237, 'Патронаж беременной, 32 недели',      'Ҳомиладор патронажи, 32 ҳафта', 'mother'),
  ('pp3',   3, 'birth', 0, 3,   'После выписки: в первые 3 дня (мать и ребёнок)', 'Туғруқхонадан кейин 3 кун ичида (она ва бола)', 'both'),
  ('pp15',  4, 'birth', 14, 17, '15-й день (мать и ребёнок)',          '15-кун (она ва бола)', 'both'),
  ('pp30',  5, 'birth', 29, 33, '30-й день (мать и ребёнок)',          '30-кун (она ва бола)', 'both');

create table public.home_visits (
  id         bigint generated always as identity primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  kind       text not null check (kind ~ '^[a-z0-9_]{2,20}$'),
  visit_date date not null,
  mother_ok  boolean,
  baby_ok    boolean,
  referred   boolean not null default false,
  note       text not null default '' check (length(note) <= 500),
  by_user    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index home_visits_uq on public.home_visits (mother_id, kind) where kind <> 'extra';
create index home_visits_mother_idx on public.home_visits (mother_id);

create table public.mother_tg (
  mother_id   uuid primary key references public.mothers (id) on delete cascade,
  telegram_id bigint not null unique,
  lang        text not null default 'uz' check (lang in ('ru', 'uz', 'uzl')),
  consent_at  timestamptz not null default now(),
  linked_at   timestamptz not null default now()
);
create table private.mother_codes (
  code_hash  text primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);
create table private.mother_sent (
  mother_id uuid not null references public.mothers (id) on delete cascade,
  key       text not null,
  sent_at   timestamptz not null default now(),
  primary key (mother_id, key)
);
create table public.mother_alerts (
  id         bigint generated always as identity primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  signs      text[] not null,
  created_at timestamptz not null default now(),
  seen_by    uuid references auth.users (id) on delete set null,
  seen_at    timestamptz
);
create index mother_alerts_mother_idx on public.mother_alerts (mother_id, created_at desc);

alter table public.mothers enable row level security;
alter table public.anc_visits enable row level security;
alter table public.home_schedule enable row level security;
alter table public.home_visits enable row level security;
alter table public.mother_tg enable row level security;
alter table public.mother_alerts enable row level security;
alter table private.mother_codes enable row level security;
alter table private.mother_sent enable row level security;
revoke all on public.mothers, public.anc_visits, public.home_schedule, public.home_visits, public.mother_tg, public.mother_alerts from public, anon, authenticated;
revoke all on private.mother_codes, private.mother_sent from public, anon, authenticated;

-- ---------------------------------------------------------------- план и состояние беременной
-- База срока: ПДР по УЗИ − 280 дней, иначе ДПМ. Окно визита №180: [база + from_week·7; база + until_week·7 + 6].
-- Визит «пропущен», если окно закончилось, отметки нет и окно закончилось после постановки на учёт.
create or replace function private.mother_state(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m record; b date; t date := private.today(); reg date; birth date;
  anc jsonb := '[]'; home jsonb := '[]'; s record; f date; u date; d record; st text;
  next_anc jsonb; missed int := 0; due boolean := false; h_due int := 0; h_missed int := 0; next_home jsonb;
begin
  select * into m from public.mothers where id = _id;
  if not found then return null; end if;
  b := coalesce(m.edd_us - 280, m.lmp); reg := m.created_at::date;
  birth := case when m.outcome = 'delivered' then coalesce(m.discharge_date, m.outcome_date) end;
  if m.status = 'pregnant' then
    for s in select * from public.anc_schedule where visit_no between 1 and 8 order by visit_no loop
      f := b + s.from_week * 7; u := b + s.until_week * 7 + 6;
      select v.visit_date into d from public.anc_visits v where v.mother_id = _id and v.visit_no = s.visit_no;
      st := case when d.visit_date is not null then 'done' when t between f and u then 'due' when u < t and u >= reg then 'missed'
                 when u < t then 'skip' else 'next' end;
      if st = 'missed' then missed := missed + 1; end if;
      if st = 'due' then due := true; end if;
      if next_anc is null and st in ('due', 'next') then next_anc := jsonb_build_object('no', s.visit_no, 'from', f, 'to', u, 'state', st); end if;
      anc := anc || jsonb_build_object('no', s.visit_no, 'from', f, 'to', u, 'state', st, 'date', d.visit_date);
      d := null;
    end loop;
  end if;
  for s in select * from public.home_schedule order by sort loop
    if s.base = 'lmp' and m.status <> 'pregnant' then continue; end if;
    if s.base = 'birth' and birth is null then continue; end if;
    f := case when s.base = 'lmp' then b else birth end + s.from_day;
    u := case when s.base = 'lmp' then b else birth end + s.until_day;
    select v.visit_date into d from public.home_visits v where v.mother_id = _id and v.kind = s.kind;
    st := case when d.visit_date is not null then 'done' when t between f and u then 'due' when u < t and u >= reg then 'missed'
               when u < t then 'skip' else 'next' end;
    if st = 'due' then h_due := h_due + 1; end if;
    if st = 'missed' then h_missed := h_missed + 1; end if;
    if next_home is null and st in ('due', 'next') then next_home := jsonb_build_object('kind', s.kind, 'from', f, 'to', u, 'state', st); end if;
    home := home || jsonb_build_object('kind', s.kind, 'from', f, 'to', u, 'state', st, 'date', d.visit_date);
    d := null;
  end loop;
  return jsonb_build_object('ga_days', t - b, 'edd', b + 280, 'anc', anc, 'home', home, 'next_anc', next_anc, 'missed', missed, 'due', due,
                            'home_due', h_due, 'home_missed', h_missed, 'next_home', next_home,
                            'pp_day', case when birth is not null then t - birth end);
end $$;

-- ---------------------------------------------------------------- справочник патронажа
create or replace function public.home_schedule_list()
returns setof public.home_schedule language sql stable security definer set search_path = '' as $$
  select * from public.home_schedule where private.is_member(auth.uid()) order by sort;
$$;
create or replace function public.admin_save_home_row(_kind text, _from int, _until int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if _from is null or _until is null or _from < 0 or _until < _from or _until > 400 then raise exception 'bad_window'; end if;
  update public.home_schedule set from_day = _from, until_day = _until where kind = _kind;
  if not found then raise exception 'no_such_row'; end if;
  perform private.log_event('home_schedule_changed', _kind, jsonb_build_object('from', _from, 'until', _until));
end $$;

-- ---------------------------------------------------------------- список и карточка
create or replace function public.mothers_list(_archive boolean default false)
returns table (id uuid, institution_id int, mahalla_id int, full_name text, birth_date date, phone text, address text, card_no text,
               lmp date, edd_us date, risk text, risk_factors text[], status text, outcome text, outcome_date date,
               tg boolean, alerts int, state jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare _me uuid := auth.uid(); _ins int[] := private.preg_insts(auth.uid());
begin
  if not private.is_member(_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select m.id, m.institution_id, m.mahalla_id, m.full_name, m.birth_date, m.phone, m.address, m.card_no, m.lmp, m.edd_us, m.risk, m.risk_factors,
         m.status, m.outcome, m.outcome_date, exists (select 1 from public.mother_tg g where g.mother_id = m.id),
         (select count(*)::int from public.mother_alerts a where a.mother_id = m.id and a.seen_at is null),
         private.mother_state(m.id), m.created_at
  from public.mothers m
  where (_ins is null or m.institution_id = any (_ins))
    and case when _archive then m.status = 'closed' else m.status <> 'closed' end
  order by m.full_name
  limit 3000;
end $$;

create or replace function public.mother_get(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return to_jsonb(m) || jsonb_build_object(
    'state', private.mother_state(_id),
    'tg', (select jsonb_build_object('linked_at', g.linked_at, 'lang', g.lang) from public.mother_tg g where g.mother_id = _id),
    'created_by_name', (select p.full_name from public.profiles p where p.id = m.created_by),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'no', v.visit_no, 'date', v.visit_date, 'bp_sys', v.bp_sys, 'bp_dia', v.bp_dia,
                          'weight', v.weight, 'tests', v.tests, 'note', v.note, 'by', p.full_name) order by v.visit_date, v.id)
                        from public.anc_visits v left join public.profiles p on p.id = v.by_user where v.mother_id = _id), '[]'),
    'home', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kind', v.kind, 'date', v.visit_date, 'mother_ok', v.mother_ok, 'baby_ok', v.baby_ok,
                          'referred', v.referred, 'note', v.note, 'by', p.full_name) order by v.visit_date, v.id)
                      from public.home_visits v left join public.profiles p on p.id = v.by_user where v.mother_id = _id), '[]'),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'signs', a.signs, 'at', a.created_at, 'seen_at', a.seen_at, 'seen_by', p.full_name)
                          order by a.created_at desc)
                        from public.mother_alerts a left join public.profiles p on p.id = a.seen_by where a.mother_id = _id), '[]'));
end $$;

-- ---------------------------------------------------------------- постановка на учёт и изменение
-- _d: {institution_id, mahalla_id, full_name, birth_date, phone, address, card_no, lmp, edd_us, gravida, para, risk, risk_factors[], notes, consent_at}
create or replace function public.mother_save(_id uuid, _d jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _me uuid := auth.uid(); t date := private.today(); _r uuid; _inst int; _old record;
  _name text := regexp_replace(btrim(coalesce(_d ->> 'full_name', '')), '\s+', ' ', 'g');
  _phone text := nullif(regexp_replace(coalesce(_d ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
  _lmp date; _edd date; _bd date; _cons date; _risk text := coalesce(nullif(_d ->> 'risk', ''), 'low'); _rf text[];
begin
  if not private.is_member(_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  begin
    _lmp := (_d ->> 'lmp')::date; _edd := nullif(_d ->> 'edd_us', '')::date; _bd := nullif(_d ->> 'birth_date', '')::date; _cons := nullif(_d ->> 'consent_at', '')::date;
  exception when others then raise exception 'bad_date'; end;
  if length(_name) < 5 or length(_name) > 120 then raise exception 'bad_full_name'; end if;
  if _phone is not null then
    if _phone ~ '^[0-9]{9}$' then _phone := '+998' || _phone; elsif _phone ~ '^998[0-9]{9}$' then _phone := '+' || _phone; end if;
    if _phone !~ '^\+998[0-9]{9}$' then raise exception 'bad_phone'; end if;
  end if;
  if _lmp is null or _lmp > t or _lmp < t - 320 then raise exception 'bad_lmp'; end if;
  if _edd is not null and (_edd < t - 60 or _edd > t + 300) then raise exception 'bad_edd'; end if;
  if _bd is not null and (_bd > t - 365 * 10 or _bd < t - 365 * 60) then raise exception 'bad_birth_date'; end if;
  if _risk not in ('low', 'mid', 'high') then raise exception 'bad_risk'; end if;
  select coalesce(array_agg(left(btrim(x), 60)) filter (where btrim(x) <> ''), '{}') into _rf
    from jsonb_array_elements_text(coalesce(_d -> 'risk_factors', '[]')) x;
  if array_length(_rf, 1) > 30 then raise exception 'bad_risk_factors'; end if;
  _inst := coalesce(nullif(_d ->> 'institution_id', '')::int, (select institution_id from public.profiles where id = _me));
  if _inst is null then raise exception 'need_institution'; end if;
  if not private.preg_ok(_me, _inst) then raise exception 'forbidden' using errcode = '42501'; end if;

  if _id is null then
    if _cons is null or _cons > t or _cons < t - 400 then raise exception 'need_consent'; end if;
    if exists (select 1 from public.mothers m where m.status <> 'closed' and m.institution_id = _inst and (
                (_phone is not null and m.phone = _phone) or (lower(m.full_name) = lower(_name) and m.birth_date is not distinct from _bd))) then
      raise exception 'duplicate';
    end if;
    insert into public.mothers (institution_id, mahalla_id, full_name, birth_date, phone, address, card_no, lmp, edd_us, gravida, para, risk, risk_factors, notes, consent_at)
    values (_inst, (select x.id from public.mahallas x where x.id = nullif(_d ->> 'mahalla_id', '')::int), _name, _bd, _phone,
            left(btrim(coalesce(_d ->> 'address', '')), 200), left(btrim(coalesce(_d ->> 'card_no', '')), 30), _lmp, _edd,
            nullif(_d ->> 'gravida', '')::int, nullif(_d ->> 'para', '')::int, _risk, _rf, left(btrim(coalesce(_d ->> 'notes', '')), 1000), _cons)
    returning id into _r;
    perform private.log_event('mother_added', _r::text, jsonb_build_object('institution', _inst));
  else
    select * into _old from public.mothers where id = _id;
    if not found or not private.preg_ok(_me, _old.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.mothers set institution_id = _inst, mahalla_id = (select x.id from public.mahallas x where x.id = nullif(_d ->> 'mahalla_id', '')::int),
           full_name = _name, birth_date = _bd, phone = _phone, address = left(btrim(coalesce(_d ->> 'address', '')), 200),
           card_no = left(btrim(coalesce(_d ->> 'card_no', '')), 30), lmp = _lmp, edd_us = _edd,
           gravida = nullif(_d ->> 'gravida', '')::int, para = nullif(_d ->> 'para', '')::int, risk = _risk, risk_factors = _rf,
           notes = left(btrim(coalesce(_d ->> 'notes', '')), 1000), consent_at = coalesce(_cons, consent_at), updated_at = now()
     where id = _id returning id into _r;
    perform private.log_event('mother_changed', _r::text, jsonb_build_object('institution', _inst));
  end if;
  return _r;
exception
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'bad_form';
  when check_violation then raise exception 'bad_form';
end $$;

-- исход: delivered → послеродовый патронаж; иное → в архив; null → снова беременная
create or replace function public.mother_outcome(_id uuid, _outcome text, _date date, _discharge date, _babies int)
returns void language plpgsql security definer set search_path = '' as $$
declare m record; t date := private.today();
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _outcome is null then
    update public.mothers set status = 'pregnant', outcome = null, outcome_date = null, discharge_date = null, babies = null, updated_at = now() where id = _id;
  else
    if _outcome not in ('delivered', 'miscarriage', 'transferred', 'moved', 'other') then raise exception 'bad_outcome'; end if;
    if _date is null or _date > t or _date < m.lmp then raise exception 'bad_date'; end if;
    if _discharge is not null and (_discharge < _date or _discharge > t) then raise exception 'bad_date'; end if;
    update public.mothers set status = case when _outcome = 'delivered' then 'postpartum' else 'closed' end, outcome = _outcome, outcome_date = _date,
           discharge_date = case when _outcome = 'delivered' then _discharge end, babies = case when _outcome = 'delivered' then coalesce(_babies, 1) end,
           updated_at = now() where id = _id;
  end if;
  perform private.log_event('mother_outcome', _id::text, jsonb_build_object('outcome', _outcome));
end $$;

create or replace function public.mother_archive(_id uuid, _back boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.mothers set status = case when _back then case when outcome = 'delivered' then 'postpartum' when outcome is null then 'pregnant' else 'closed' end else 'closed' end,
         updated_at = now() where id = _id;
  if not _back then delete from public.mother_tg where mother_id = _id; end if;
  perform private.log_event(case when _back then 'mother_unarchived' else 'mother_archived' end, _id::text, '{}'::jsonb);
end $$;

-- удалить ошибочную запись: администратор или автор в течение суток
create or replace function public.mother_delete(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mothers where id = _id
    and (private.has_role(auth.uid(), 'admin') or (created_by = auth.uid() and created_at > now() - interval '1 day'));
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.log_event('mother_deleted', _id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- визиты
create or replace function public.anc_visit_save(_mother uuid, _visit int, _date date, _bp_sys int, _bp_dia int, _weight numeric, _tests text[], _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare m record; _t text[];
begin
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _visit is null or _visit < 0 or _visit > 20 then raise exception 'bad_visit'; end if;
  if _date is null or _date > private.today() or _date < m.lmp then raise exception 'bad_date'; end if;
  select coalesce(array_agg(left(x, 200)), '{}') into _t from unnest(coalesce(_tests, '{}')) x where btrim(x) <> '';
  if _visit = 0 then
    insert into public.anc_visits (mother_id, visit_no, visit_date, bp_sys, bp_dia, weight, tests, note)
    values (_mother, 0, _date, _bp_sys, _bp_dia, _weight, _t, left(btrim(coalesce(_note, '')), 500));
  else
    insert into public.anc_visits (mother_id, visit_no, visit_date, bp_sys, bp_dia, weight, tests, note)
    values (_mother, _visit, _date, _bp_sys, _bp_dia, _weight, _t, left(btrim(coalesce(_note, '')), 500))
    on conflict (mother_id, visit_no) where visit_no > 0 do update set visit_date = excluded.visit_date, bp_sys = excluded.bp_sys, bp_dia = excluded.bp_dia,
       weight = excluded.weight, tests = excluded.tests, note = excluded.note, by_user = auth.uid();
  end if;
  update public.mothers set updated_at = now() where id = _mother;
exception when check_violation then raise exception 'bad_values';
end $$;

create or replace function public.anc_visit_delete(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.anc_visits v using public.mothers m
   where v.id = _id and m.id = v.mother_id and private.preg_ok(auth.uid(), m.institution_id);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.home_visit_save(_mother uuid, _kind text, _date date, _mother_ok boolean, _baby_ok boolean, _referred boolean, _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _kind is null or (_kind <> 'extra' and not exists (select 1 from public.home_schedule s where s.kind = _kind)) then raise exception 'bad_kind'; end if;
  if _date is null or _date > private.today() or _date < m.lmp then raise exception 'bad_date'; end if;
  if _kind = 'extra' then
    insert into public.home_visits (mother_id, kind, visit_date, mother_ok, baby_ok, referred, note)
    values (_mother, 'extra', _date, _mother_ok, _baby_ok, coalesce(_referred, false), left(btrim(coalesce(_note, '')), 500));
  else
    insert into public.home_visits (mother_id, kind, visit_date, mother_ok, baby_ok, referred, note)
    values (_mother, _kind, _date, _mother_ok, _baby_ok, coalesce(_referred, false), left(btrim(coalesce(_note, '')), 500))
    on conflict (mother_id, kind) where kind <> 'extra' do update set visit_date = excluded.visit_date, mother_ok = excluded.mother_ok,
       baby_ok = excluded.baby_ok, referred = excluded.referred, note = excluded.note, by_user = auth.uid();
  end if;
  update public.mothers set updated_at = now() where id = _mother;
end $$;

create or replace function public.home_visit_delete(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.home_visits v using public.mothers m
   where v.id = _id and m.id = v.mother_id and private.preg_ok(auth.uid(), m.institution_id);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.mother_alert_seen(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mother_alerts a set seen_at = now(), seen_by = auth.uid() from public.mothers m
   where a.id = _id and m.id = a.mother_id and a.seen_at is null and private.preg_ok(auth.uid(), m.institution_id);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- приглашение в Telegram (код на 7 дней)
create or replace function public.mother_invite(_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare m record; _c text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) or m.status = 'closed' then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from private.mother_codes where mother_id = _id or expires_at < now();
  insert into private.mother_codes (code_hash, mother_id, expires_at) values (encode(extensions.digest(_c, 'sha256'), 'hex'), _id, now() + interval '7 days');
  perform private.log_event('mother_invite', _id::text, '{}'::jsonb);
  return 'm' || _c;
end $$;

create or replace function public.mother_unlink(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.mother_tg where mother_id = _id;
  perform private.log_event('mother_unlinked', _id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- сводка для руководителей
create or replace function public.mothers_summary()
returns table (institution_id int, mahalla_id int, active int, pregnant int, postpartum int, high_risk int, mid_risk int, early int,
               anc_due int, anc_missed_women int, home_due int, home_missed int, tg int, alerts int,
               delivered_month int, registered_month int, teen int, age35 int)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); t date := private.today();
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with x as (
    select m.*, private.mother_state(m.id) s from public.mothers m
    where (_ins is null or m.institution_id = any (_ins)) and (m.status <> 'closed' or m.outcome_date >= date_trunc('month', t)::date or m.created_at >= date_trunc('month', t)))
  select x.institution_id, x.mahalla_id,
    count(*) filter (where x.status <> 'closed')::int,
    count(*) filter (where x.status = 'pregnant')::int,
    count(*) filter (where x.status = 'postpartum')::int,
    count(*) filter (where x.status = 'pregnant' and x.risk = 'high')::int,
    count(*) filter (where x.status = 'pregnant' and x.risk = 'mid')::int,
    count(*) filter (where x.created_at >= date_trunc('month', t) and x.created_at::date - coalesce(x.edd_us - 280, x.lmp) < 84)::int,
    count(*) filter (where x.status <> 'closed' and (x.s ->> 'due')::boolean)::int,
    count(*) filter (where x.status <> 'closed' and (x.s ->> 'missed')::int > 0)::int,
    coalesce(sum((x.s ->> 'home_due')::int) filter (where x.status <> 'closed'), 0)::int,
    coalesce(sum((x.s ->> 'home_missed')::int) filter (where x.status <> 'closed'), 0)::int,
    count(*) filter (where x.status <> 'closed' and exists (select 1 from public.mother_tg g where g.mother_id = x.id))::int,
    (select count(*)::int from public.mother_alerts a join public.mothers mm on mm.id = a.mother_id
      where a.seen_at is null and mm.institution_id = x.institution_id and mm.mahalla_id is not distinct from x.mahalla_id),
    count(*) filter (where x.outcome = 'delivered' and x.outcome_date >= date_trunc('month', t)::date)::int,
    count(*) filter (where x.created_at >= date_trunc('month', t))::int,
    count(*) filter (where x.status <> 'closed' and x.birth_date is not null and x.birth_date > t - interval '18 years')::int,
    count(*) filter (where x.status <> 'closed' and x.birth_date is not null and x.birth_date <= t - interval '35 years')::int
  from x group by x.institution_id, x.mahalla_id;
end $$;

-- ---------------------------------------------------------------- бот (только сервис)
-- привязка: код из ссылки t.me/бот?start=m…; согласие беременная даёт кнопкой в боте
create or replace function public.bot_mother_link(_code text, _tg bigint, _lang text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; m record;
begin
  if _code !~ '^m[0-9a-f]{24}$' then return jsonb_build_object('error', 'bad_code'); end if;
  select * into c from private.mother_codes where code_hash = encode(extensions.digest(substr(_code, 2), 'sha256'), 'hex');
  if not found or c.used_at is not null or c.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  select * into m from public.mothers where id = c.mother_id and status <> 'closed';
  if not found then return jsonb_build_object('error', 'expired'); end if;
  delete from public.mother_tg where telegram_id = _tg or mother_id = m.id;
  insert into public.mother_tg (mother_id, telegram_id, lang) values (m.id, _tg, case when _lang in ('ru', 'uz', 'uzl') then _lang else 'uz' end);
  update private.mother_codes set used_at = now() where code_hash = c.code_hash;
  insert into public.audit_log (actor, action, object, details) values (null, 'mother_linked', m.id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'first_name', split_part(m.full_name, ' ', 2));
end $$;

-- проверка кода без привязки (бот сначала спрашивает язык и согласие)
create or replace function public.bot_mother_code_ok(_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select _code ~ '^m[0-9a-f]{24}$' and exists (select 1 from private.mother_codes c join public.mothers m on m.id = c.mother_id
    where c.code_hash = encode(extensions.digest(substr(_code, 2), 'sha256'), 'hex') and c.used_at is null and c.expires_at > now() and m.status <> 'closed');
$$;

create or replace function public.bot_mother_lang(_tg bigint, _lang text)
returns void language sql security definer set search_path = '' as $$
  update public.mother_tg set lang = _lang where telegram_id = _tg and _lang in ('ru', 'uz', 'uzl');
$$;

-- «Моя страница»: только её данные — имя, срок, визиты, анализы, патронаж, контакты доя
create or replace function public.bot_mother_view(_tg bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g record; m record;
begin
  select * into g from public.mother_tg where telegram_id = _tg;
  if not found then return null; end if;
  select * into m from public.mothers where id = g.mother_id;
  return jsonb_build_object('lang', g.lang, 'full_name', m.full_name, 'status', m.status, 'outcome', m.outcome, 'outcome_date', m.outcome_date,
    'risk', m.risk, 'institution', (select i.name from public.institutions i where i.id = m.institution_id),
    'doya', (select jsonb_build_object('name', p.full_name, 'phone', p.phone) from public.profiles p where p.id = m.created_by),
    'state', private.mother_state(m.id),
    'schedule', (select jsonb_agg(jsonb_build_object('no', s.visit_no, 'label', s.label, 'label_uz', s.label_uz, 'tests', s.tests, 'tests_uz', s.tests_uz) order by s.visit_no)
                 from public.anc_schedule s where s.visit_no between 1 and 8),
    'home_schedule', (select jsonb_agg(jsonb_build_object('kind', h.kind, 'label', h.label_ru, 'label_uz', h.label_uz) order by h.sort) from public.home_schedule h),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('no', v.visit_no, 'date', v.visit_date, 'tests', v.tests) order by v.visit_date)
                        from public.anc_visits v where v.mother_id = m.id), '[]'));
end $$;

-- тревожные признаки: сохраняет сигнал и возвращает, кому из сотрудников написать (доя/патронаж/врач её учреждения и руководитель)
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
  select tl.telegram_id, p.full_name, m.id, m.full_name, m.phone, (select x.name from public.mahallas x where x.id = m.mahalla_id), m.address, m.status
  from public.profiles p join public.telegram_links tl on tl.user_id = p.id
  where private.is_member(p.id) and p.removed_at is null and (
    (p.institution_id = m.institution_id and private.preg_staff(p.id))
    or exists (select 1 from public.scopes s where s.user_id = p.id and s.kind = 'institution' and s.institution_id = m.institution_id));
end $$;

create or replace function public.bot_mother_stop(_tg bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _m uuid;
begin
  delete from public.mother_tg where telegram_id = _tg returning mother_id into _m;
  if _m is not null then insert into public.audit_log (actor, action, object, details) values (null, 'mother_stopped_bot', _m::text, '{}'::jsonb); end if;
  return _m is not null;
end $$;

-- ежедневные напоминания беременным: окно визита открылось сегодня; осталось 3 дня, а визита нет. Каждое — один раз.
create or replace function public.cron_mother_reminders(_secret text)
returns table (telegram_id bigint, lang text, kind text, visit_no int, label text, date_from date, date_to date, tests jsonb, first_name text)
language plpgsql security definer set search_path = '' as $$
declare t date := private.today();
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with c as (
    select g.telegram_id tg, g.lang lg, m.id mid, split_part(m.full_name, ' ', 2) fn, e
    from public.mother_tg g join public.mothers m on m.id = g.mother_id and m.status = 'pregnant',
         jsonb_array_elements(private.mother_state(m.id) -> 'anc') e
  ), r as (
    select c.*, case when (e ->> 'from')::date = t and e ->> 'state' = 'due' then 'open'
                     when (e ->> 'to')::date - 3 = t and e ->> 'state' = 'due' then 'soon' end k
    from c
  ), ins as (
    insert into private.mother_sent (mother_id, key)
    select r.mid, r.k || ':' || (r.e ->> 'no') || ':' || (r.e ->> 'from') from r where r.k is not null
    on conflict do nothing returning mother_id, key
  )
  select r.tg, r.lg, r.k, (r.e ->> 'no')::int, case when r.lg = 'ru' then s.label else s.label_uz end, (r.e ->> 'from')::date, (r.e ->> 'to')::date,
         case when r.lg = 'ru' then s.tests else s.tests_uz end, r.fn
  from r join ins on ins.mother_id = r.mid and ins.key = r.k || ':' || (r.e ->> 'no') || ':' || (r.e ->> 'from')
  join public.anc_schedule s on s.visit_no = (r.e ->> 'no')::int;
end $$;

-- ежедневная сводка сотрудникам: сколько визитов в окне, пропущено, патронажей, сигналов — по их учреждению
create or replace function public.cron_staff_digest(_secret text)
returns table (telegram_id bigint, full_name text, due int, missed int, home_due int, home_missed int, alerts int)
language plpgsql security definer set search_path = '' as $$
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with st as (
    select m.institution_id inst, private.mother_state(m.id) s,
           (select count(*) from public.mother_alerts a where a.mother_id = m.id and a.seen_at is null) al
    from public.mothers m where m.status <> 'closed'
  ), agg as (
    select inst, count(*) filter (where (s ->> 'due')::boolean)::int d, count(*) filter (where (s ->> 'missed')::int > 0)::int mi,
           coalesce(sum((s ->> 'home_due')::int), 0)::int hd, coalesce(sum((s ->> 'home_missed')::int), 0)::int hm, coalesce(sum(al), 0)::int a
    from st group by inst
  )
  select tl.telegram_id, p.full_name, a.d, a.mi, a.hd, a.hm, a.a
  from public.profiles p join public.telegram_links tl on tl.user_id = p.id join agg a on a.inst = p.institution_id
  where private.is_member(p.id) and p.removed_at is null and private.preg_staff(p.id) and (a.d + a.mi + a.hd + a.hm + a.a) > 0;
end $$;

-- ---------------------------------------------------------------- права на функции
revoke all on function public.home_schedule_list(), public.admin_save_home_row(text, int, int), public.mothers_list(boolean), public.mother_get(uuid),
  public.mother_save(uuid, jsonb), public.mother_outcome(uuid, text, date, date, int), public.mother_archive(uuid, boolean), public.mother_delete(uuid),
  public.anc_visit_save(uuid, int, date, int, int, numeric, text[], text), public.anc_visit_delete(bigint),
  public.home_visit_save(uuid, text, date, boolean, boolean, boolean, text), public.home_visit_delete(bigint), public.mother_alert_seen(bigint),
  public.mother_invite(uuid), public.mother_unlink(uuid), public.mothers_summary(),
  public.bot_mother_link(text, bigint, text), public.bot_mother_code_ok(text), public.bot_mother_lang(bigint, text), public.bot_mother_view(bigint),
  public.bot_mother_alert(bigint, text[]), public.bot_mother_stop(bigint), public.cron_mother_reminders(text), public.cron_staff_digest(text)
  from public, anon, authenticated;
grant execute on function public.home_schedule_list(), public.admin_save_home_row(text, int, int), public.mothers_list(boolean), public.mother_get(uuid),
  public.mother_save(uuid, jsonb), public.mother_outcome(uuid, text, date, date, int), public.mother_archive(uuid, boolean), public.mother_delete(uuid),
  public.anc_visit_save(uuid, int, date, int, int, numeric, text[], text), public.anc_visit_delete(bigint),
  public.home_visit_save(uuid, text, date, boolean, boolean, boolean, text), public.home_visit_delete(bigint), public.mother_alert_seen(bigint),
  public.mother_invite(uuid), public.mother_unlink(uuid), public.mothers_summary() to authenticated;
grant execute on function public.bot_mother_link(text, bigint, text), public.bot_mother_code_ok(text), public.bot_mother_lang(bigint, text), public.bot_mother_view(bigint),
  public.bot_mother_alert(bigint, text[]), public.bot_mother_stop(bigint), public.cron_mother_reminders(text), public.cron_staff_digest(text) to service_role;
