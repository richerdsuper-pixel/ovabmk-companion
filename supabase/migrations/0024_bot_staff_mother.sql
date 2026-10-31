-- 0024: сотрудники в Telegram (список дня с отметкой визита), графики по месяцам для руководителей,
-- беременной — вопрос доя, напоминание о витаминах в выбранный час, карточка малыша после родов.

-- ---------------------------------------------------------------- кто пишет боту: сотрудник
create or replace function private.staff_uid(_tg bigint)
returns uuid language sql stable security definer set search_path = '' as $$
  select tl.user_id from public.telegram_links tl join public.profiles p on p.id = tl.user_id
  where tl.telegram_id = _tg and p.removed_at is null and private.is_member(p.id) limit 1;
$$;
-- кому сообщать о беременной учреждения: клинический персонал учреждения и руководство учреждения (как сигналы)
create or replace function private.mother_recipients(_inst int)
returns bigint[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct tl.telegram_id), '{}')
  from public.profiles p join public.telegram_links tl on tl.user_id = p.id
  where private.is_member(p.id) and p.removed_at is null and (
    (p.institution_id = _inst and private.preg_staff(p.id))
    or exists (select 1 from public.scopes s where s.user_id = p.id and s.kind = 'institution' and s.institution_id = _inst));
$$;

-- ---------------------------------------------------------------- список дня доя: кому сейчас визит или патронаж, кто пропустил
create or replace function public.bot_staff_day(_tg bigint)
returns table (mother_id uuid, full_name text, phone text, mahalla text, kind text, code text, state text, date_to date)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.staff_uid(_tg); _ins int[];
begin
  if u is null then return; end if;
  _ins := private.preg_insts(u);
  return query
  select * from (
    with m as (
      select mm.id, mm.full_name, mm.phone, (select x.name from public.mahallas x where x.id = mm.mahalla_id) mh, private.mother_state(mm.id) s
      from public.mothers mm where mm.status in ('pregnant', 'postpartum') and (_ins is null or mm.institution_id = any (_ins)))
    select m.id mid, m.full_name fn, m.phone ph, m.mh, 'anc'::text k, e ->> 'no' code, e ->> 'state' state, (e ->> 'to')::date date_to
      from m, jsonb_array_elements(m.s -> 'anc') e where e ->> 'state' in ('due', 'missed')
    union all
    select m.id, m.full_name, m.phone, m.mh, 'home'::text, e ->> 'kind', e ->> 'state', (e ->> 'to')::date
      from m, jsonb_array_elements(m.s -> 'home') e where e ->> 'state' in ('due', 'missed')
  ) q order by q.state desc, q.date_to, q.fn limit 40;
end $$;

-- отметка из бота: визит №N или патронаж сделан сегодня (если уже отмечен — ничего не меняется)
create or replace function public.bot_staff_mark(_tg bigint, _mother uuid, _kind text, _code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.staff_uid(_tg); m record; n int;
begin
  if u is null then return jsonb_build_object('error', 'not_staff'); end if;
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(u, m.institution_id) then return jsonb_build_object('error', 'forbidden'); end if;
  if _kind = 'anc' and _code ~ '^[1-8]$' and m.status = 'pregnant' then
    insert into public.anc_visits (mother_id, visit_no, visit_date, by_user) values (_mother, _code::int, private.today(), u)
    on conflict (mother_id, visit_no) where visit_no > 0 do nothing;
  elsif _kind = 'home' and exists (select 1 from public.home_schedule s where s.kind = _code) then
    insert into public.home_visits (mother_id, kind, visit_date, by_user) values (_mother, _code, private.today(), u)
    on conflict (mother_id, kind) where kind <> 'extra' do nothing;
  else
    return jsonb_build_object('error', 'bad_kind');
  end if;
  get diagnostics n = row_count;
  update public.mothers set updated_at = now() where id = _mother;
  return jsonb_build_object('ok', true, 'new', n > 0, 'name', m.full_name);
end $$;

-- ---------------------------------------------------------------- графики по месяцам (последние 12 месяцев)
create or replace function public.mothers_trend()
returns table (month date, registered int, early int, high_risk int, delivered int, anc_visits int, home_visits int, alerts int)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); t date := private.today();
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with mo as (select generate_series(date_trunc('month', t) - interval '11 months', date_trunc('month', t), interval '1 month')::date m),
  ms as (select x.id, (x.created_at at time zone 'Asia/Tashkent')::date reg, coalesce(x.edd_us - 280, x.lmp) lmp0, x.risk, x.outcome, x.outcome_date
         from public.mothers x where _ins is null or x.institution_id = any (_ins))
  select mo.m,
    (select count(*)::int from ms where date_trunc('month', ms.reg)::date = mo.m),
    (select count(*)::int from ms where date_trunc('month', ms.reg)::date = mo.m and ms.reg - ms.lmp0 < 84),
    (select count(*)::int from ms where date_trunc('month', ms.reg)::date = mo.m and ms.risk = 'high'),
    (select count(*)::int from ms where ms.outcome = 'delivered' and date_trunc('month', ms.outcome_date)::date = mo.m),
    (select count(*)::int from public.anc_visits v join ms on ms.id = v.mother_id where date_trunc('month', v.visit_date)::date = mo.m),
    (select count(*)::int from public.home_visits v join ms on ms.id = v.mother_id where date_trunc('month', v.visit_date)::date = mo.m),
    (select count(*)::int from public.mother_alerts a join ms on ms.id = a.mother_id where date_trunc('month', a.created_at at time zone 'Asia/Tashkent')::date = mo.m)
  from mo order by mo.m;
end $$;

-- ---------------------------------------------------------------- вопрос доя
create table public.mother_questions (
  id          bigint generated always as identity primary key,
  mother_id   uuid not null references public.mothers (id) on delete cascade,
  q           text not null check (length(q) between 2 and 1000),
  a           text check (length(a) <= 2000),
  a_by        uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index mother_questions_idx on public.mother_questions (mother_id, created_at desc);
alter table public.mother_questions enable row level security;
revoke all on public.mother_questions from public, anon, authenticated;

create or replace function public.bot_mother_ask(_tg bigint, _text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; m record; _q text := btrim(coalesce(_text, '')); _id bigint;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if length(_q) < 2 then return jsonb_build_object('error', 'empty'); end if;
  if (select count(*) from public.mother_questions x where x.mother_id = g.mother_id and x.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('error', 'too_many'); end if;
  select * into m from public.mothers where id = g.mother_id;
  insert into public.mother_questions (mother_id, q) values (m.id, left(_q, 1000)) returning id into _id;
  return jsonb_build_object('qid', _id, 'q', left(_q, 1000), 'mother_id', m.id, 'mother_name', m.full_name, 'mother_phone', m.phone,
                            'recipients', to_jsonb(private.mother_recipients(m.institution_id)));
end $$;

-- ответ сотрудника (ответом на сообщение бота в Telegram)
create or replace function public.bot_staff_answer(_tg bigint, _qid bigint, _text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.staff_uid(_tg); x record; m record; _a text := btrim(coalesce(_text, ''));
begin
  if u is null then return jsonb_build_object('error', 'not_staff'); end if;
  select * into x from public.mother_questions where id = _qid;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into m from public.mothers where id = x.mother_id;
  if not private.preg_ok(u, m.institution_id) then return jsonb_build_object('error', 'forbidden'); end if;
  if length(_a) < 1 then return jsonb_build_object('error', 'empty'); end if;
  update public.mother_questions set a = left(_a, 2000), a_by = u, answered_at = now() where id = _qid;
  return jsonb_build_object('ok', true, 'q', x.q, 'a', left(_a, 2000), 'staff_name', (select p.full_name from public.profiles p where p.id = u),
    'telegram_id', (select g.telegram_id from public.mother_tg g where g.mother_id = m.id), 'lang', (select g.lang from public.mother_tg g where g.mother_id = m.id));
end $$;

-- ---------------------------------------------------------------- напоминание о витаминах в выбранный час
alter table public.mother_tg add column pill_hour smallint check (pill_hour between 5 and 23);

create or replace function public.bot_mother_pill_hour(_tg bigint, _hour int)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if _hour is not null and (_hour < 5 or _hour > 23) then return jsonb_build_object('error', 'bad_hour'); end if;
  update public.mother_tg set pill_hour = _hour where telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- раз в час: кому сейчас напомнить (час по Ташкенту), кто ещё не отметил витамины сегодня; каждый день — один раз
create or replace function public.cron_mother_pills(_secret text)
returns table (telegram_id bigint, lang text, first_name text, kinds text[])
language plpgsql security definer set search_path = '' as $$
declare t date := private.today(); hr int := extract(hour from now() at time zone 'Asia/Tashkent')::int;
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with c as (
    select g.telegram_id tg, g.lang lg, m.id mid, split_part(m.full_name, ' ', 2) fn,
           case when t - coalesce(m.edd_us - 280, m.lmp) < 84 then array['folic', 'iodine', 'iron'] else array['iodine', 'iron'] end ks
    from public.mother_tg g join public.mothers m on m.id = g.mother_id and m.status = 'pregnant' where g.pill_hour = hr
  ), k as (
    select c.*, array(select x from unnest(c.ks) x where not exists (select 1 from public.mother_pills p where p.mother_id = c.mid and p.day = t and p.kind = x)) lft from c
  ), ins as (
    insert into private.mother_sent (mother_id, key) select k.mid, 'pill:' || t from k where cardinality(k.lft) > 0
    on conflict do nothing returning mother_id
  )
  select k.tg, k.lg, k.fn, k.lft from k join ins on ins.mother_id = k.mid;
end $$;

-- ---------------------------------------------------------------- карточка малыша (после родов): вес, прививки, кормление
create table public.mother_baby (
  id         bigint generated always as identity primary key,
  mother_id  uuid not null references public.mothers (id) on delete cascade,
  kind       text not null check (kind in ('weight', 'vaccine', 'feed')),
  val        text not null check (length(val) between 1 and 80),
  d          date not null,
  created_at timestamptz not null default now()
);
create index mother_baby_idx on public.mother_baby (mother_id, d);
alter table public.mother_baby enable row level security;
revoke all on public.mother_baby from public, anon, authenticated;

create or replace function public.bot_mother_baby(_tg bigint, _kind text, _val text, _d date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; m record; _v text := btrim(coalesce(_val, '')); dd date := coalesce(_d, private.today());
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  select * into m from public.mothers where id = g.mother_id;
  if m.outcome is distinct from 'delivered' then return jsonb_build_object('error', 'not_pp'); end if;
  if dd > private.today() or dd < coalesce(m.outcome_date, private.today()) then return jsonb_build_object('error', 'bad_date'); end if;
  if _kind = 'weight' then
    if _v !~ '^\d{3,5}$' or _v::int < 500 or _v::int > 15000 then return jsonb_build_object('error', 'bad_value'); end if;
  elsif _kind = 'feed' then
    if _v not in ('breast', 'mixed', 'formula') then return jsonb_build_object('error', 'bad_value'); end if;
  elsif _kind = 'vaccine' then
    if length(_v) < 2 or length(_v) > 60 then return jsonb_build_object('error', 'bad_value'); end if;
  else
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if (select count(*) from public.mother_baby b where b.mother_id = m.id and b.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'too_many'); end if;
  insert into public.mother_baby (mother_id, kind, val, d) values (m.id, _kind, _v, dd);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- «Моя страница» и карточка: дополнительные данные
create or replace function private.mother_extras(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'a', x.a, 'at', x.created_at, 'answered_at', x.answered_at, 'a_by', p.full_name) order by x.created_at desc)
                          from (select * from public.mother_questions q where q.mother_id = _mid order by q.created_at desc limit 20) x
                          left join public.profiles p on p.id = x.a_by), '[]'),
    'baby', coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'val', b.val, 'd', b.d) order by b.d, b.created_at)
                      from public.mother_baby b where b.mother_id = _mid), '[]'),
    'pill_hour', (select g.pill_hour from public.mother_tg g where g.mother_id = _mid));
$$;

alter function public.bot_mother_view(bigint) rename to bot_mother_view_v23;
alter function public.bot_mother_view_v23(bigint) set schema private;
alter function public.mother_get(uuid) rename to mother_get_v23;
alter function public.mother_get_v23(uuid) set schema private;

create or replace function public.bot_mother_view(_tg bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb := private.bot_mother_view_v23(_tg);
begin
  if v is null then return null; end if;
  return v || private.mother_extras((select g.mother_id from public.mother_tg g where g.telegram_id = _tg));
end $$;
create or replace function public.mother_get(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return private.mother_get_v23(_id) || private.mother_extras(_id);
end $$;

revoke all on function private.staff_uid(bigint), private.mother_recipients(int), private.mother_extras(uuid),
  private.bot_mother_view_v23(bigint), private.mother_get_v23(uuid) from public, anon, authenticated;
revoke all on function public.bot_staff_day(bigint), public.bot_staff_mark(bigint, uuid, text, text), public.mothers_trend(),
  public.bot_mother_ask(bigint, text), public.bot_staff_answer(bigint, bigint, text), public.bot_mother_pill_hour(bigint, int),
  public.cron_mother_pills(text), public.bot_mother_baby(bigint, text, text, date), public.bot_mother_view(bigint), public.mother_get(uuid)
  from public, anon, authenticated;
grant execute on function public.bot_staff_day(bigint), public.bot_staff_mark(bigint, uuid, text, text), public.bot_mother_ask(bigint, text),
  public.bot_staff_answer(bigint, bigint, text), public.bot_mother_pill_hour(bigint, int), public.cron_mother_pills(text),
  public.bot_mother_baby(bigint, text, text, date), public.bot_mother_view(bigint) to service_role;
grant execute on function public.mothers_trend(), public.mother_get(uuid) to authenticated;
