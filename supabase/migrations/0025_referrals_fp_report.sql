-- 0025: направления (куда направили, дошла ли), планирование семьи после родов, отчёт за месяц по учреждениям,
-- пол малыша (для графика веса по нормам ВОЗ).

-- ---------------------------------------------------------------- направления
create table public.referrals (
  id          bigint generated always as identity primary key,
  mother_id   uuid not null references public.mothers (id) on delete cascade,
  target      text not null check (length(target) between 2 and 200),
  reason      text not null default '' check (length(reason) <= 500),
  due_date    date not null,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  arrived_at  date,
  result      text not null default '' check (length(result) <= 500)
);
create index referrals_mother_idx on public.referrals (mother_id);
alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;

create or replace function public.referral_save(_mother uuid, _target text, _reason text, _due date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m record; _id bigint;
begin
  select * into m from public.mothers where id = _mother;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(_target, ''))) < 2 then raise exception 'bad_target'; end if;
  if _due is null or _due < private.today() or _due > private.today() + 90 then raise exception 'bad_date'; end if;
  insert into public.referrals (mother_id, target, reason, due_date) values (_mother, left(btrim(_target), 200), left(btrim(coalesce(_reason, '')), 500), _due)
  returning id into _id;
  update public.mothers set updated_at = now() where id = _mother;
  return _id;
end $$;

-- дошла (дата и что сказали) или отмена отметки (_date = null)
create or replace function public.referral_arrived(_id bigint, _date date, _result text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select x.*, m.institution_id inst, m.lmp into r from public.referrals x join public.mothers m on m.id = x.mother_id where x.id = _id;
  if not found or not private.preg_ok(auth.uid(), r.inst) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _date is not null and (_date > private.today() or _date < r.created_at::date) then raise exception 'bad_date'; end if;
  update public.referrals set arrived_at = _date, result = left(btrim(coalesce(_result, '')), 500) where id = _id;
end $$;

create or replace function public.referral_delete(_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.referrals x using public.mothers m where x.id = _id and m.id = x.mother_id and private.preg_ok(auth.uid(), m.institution_id);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- планирование семьи после родов
alter table public.mothers add column fp_method text check (fp_method in ('none', 'lam', 'condom', 'pills', 'injection', 'implant', 'iud', 'sterilization')),
                           add column fp_date date;

create or replace function public.mother_fp_save(_id uuid, _method text, _date date)
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.mothers where id = _id;
  if not found or not private.preg_ok(auth.uid(), m.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _method is not null and _method not in ('none', 'lam', 'condom', 'pills', 'injection', 'implant', 'iud', 'sterilization') then raise exception 'bad_method'; end if;
  if _method is not null and (_date is null or _date > private.today() or _date < coalesce(m.outcome_date, m.lmp)) then raise exception 'bad_date'; end if;
  update public.mothers set fp_method = _method, fp_date = case when _method is null then null else _date end, updated_at = now() where id = _id;
end $$;

-- ---------------------------------------------------------------- метки для списка: направления и планирование семьи
create or replace function public.mothers_flags()
returns table (mother_id uuid, ref_open int, ref_overdue int, fp_method text, fp_date date)
language plpgsql stable security definer set search_path = '' as $$
declare _ins int[] := private.preg_insts(auth.uid()); t date := private.today();
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select m.id,
    (select count(*)::int from public.referrals r where r.mother_id = m.id and r.arrived_at is null),
    (select count(*)::int from public.referrals r where r.mother_id = m.id and r.arrived_at is null and r.due_date < t),
    m.fp_method, m.fp_date
  from public.mothers m where (_ins is null or m.institution_id = any (_ins)) and m.status <> 'closed';
end $$;

-- ---------------------------------------------------------------- отчёт за месяц по учреждениям
create or replace function public.mothers_month_report(_month date)
returns table (institution_id int, on_register int, registered int, early int, high_risk int, delivered int, anc_visits int, home_visits int,
               referred int, referred_arrived int, fp_counseled int, alerts int, tg int)
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
    (select count(*)::int from ms join public.mother_tg g on g.mother_id = ms.id where ms.institution_id = i.iid)
  from (select distinct ms.institution_id iid from ms) i order by i.iid;
end $$;

-- ---------------------------------------------------------------- пол малыша (для норм ВОЗ)
alter table public.mother_baby drop constraint mother_baby_kind_check;
alter table public.mother_baby add constraint mother_baby_kind_check check (kind in ('weight', 'vaccine', 'feed', 'sex'));
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
  elsif _kind = 'sex' then
    if _v not in ('m', 'f') then return jsonb_build_object('error', 'bad_value'); end if;
    delete from public.mother_baby b where b.mother_id = m.id and b.kind = 'sex';
  else
    return jsonb_build_object('error', 'bad_kind');
  end if;
  if (select count(*) from public.mother_baby b where b.mother_id = m.id and b.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'too_many'); end if;
  insert into public.mother_baby (mother_id, kind, val, d) values (m.id, _kind, _v, dd);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- «Моя страница» и карточка: направления и планирование семьи
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
    'fp', (select jsonb_build_object('method', m.fp_method, 'date', m.fp_date) from public.mothers m where m.id = _mid));
$$;

revoke all on function public.referral_save(uuid, text, text, date), public.referral_arrived(bigint, date, text), public.referral_delete(bigint),
  public.mother_fp_save(uuid, text, date), public.mothers_flags(), public.mothers_month_report(date), public.bot_mother_baby(bigint, text, text, date)
  from public, anon, authenticated;
grant execute on function public.referral_save(uuid, text, text, date), public.referral_arrived(bigint, date, text), public.referral_delete(bigint),
  public.mother_fp_save(uuid, text, date), public.mothers_flags(), public.mothers_month_report(date) to authenticated;
grant execute on function public.bot_mother_baby(bigint, text, text, date) to service_role;
