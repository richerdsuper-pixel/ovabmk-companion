-- 0023: «Моя страница» беременной как приложение — дневник веса, отметка витаминов, данные для графиков.
-- Пишет только бот (service_role) от имени привязанного Telegram; сотрудники видят дневники в карточке (mother_get).

-- ---------------------------------------------------------------- дневник веса (сама беременная)
create table public.mother_weight (
  id        bigint generated always as identity primary key,
  mother_id uuid not null references public.mothers (id) on delete cascade,
  kg        numeric(5,1) not null check (kg between 30 and 200),
  at        timestamptz not null default now()
);
create index mother_weight_idx on public.mother_weight (mother_id, at desc);
alter table public.mother_weight enable row level security;
revoke all on public.mother_weight from public, anon, authenticated;

create or replace function public.bot_mother_weight(_tg bigint, _kg numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if _kg is null or _kg < 30 or _kg > 200 then return jsonb_build_object('error', 'bad_weight'); end if;
  if (select count(*) from public.mother_weight w where w.mother_id = g.mother_id and w.at > now() - interval '1 day') >= 3 then return jsonb_build_object('error', 'too_many'); end if;
  insert into public.mother_weight (mother_id, kg) values (g.mother_id, round(_kg, 1));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- витамины по протоколу №180 (фолиевая кислота, калия йодид, железо): отметка «выпила сегодня»
create table public.mother_pills (
  mother_id uuid not null references public.mothers (id) on delete cascade,
  day       date not null,
  kind      text not null check (kind in ('folic', 'iodine', 'iron')),
  primary key (mother_id, day, kind)
);
alter table public.mother_pills enable row level security;
revoke all on public.mother_pills from public, anon, authenticated;

create or replace function public.bot_mother_pill(_tg bigint, _kind text, _on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if _kind is null or _kind not in ('folic', 'iodine', 'iron') then return jsonb_build_object('error', 'bad_kind'); end if;
  if coalesce(_on, true) then
    insert into public.mother_pills (mother_id, day, kind) values (g.mother_id, private.today(), _kind) on conflict do nothing;
  else
    delete from public.mother_pills p where p.mother_id = g.mother_id and p.day = private.today() and p.kind = _kind;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- данные для графиков
-- вес: при постановке, на визитах (доя) и свои записи; срок в днях на дату — для графика прибавки
create or replace function private.mother_weights(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with m as (select coalesce(mm.edd_us - 280, mm.lmp) lmp0, mm.weight_kg, mm.consent_at from public.mothers mm where mm.id = _mid),
  x as (
    select (select consent_at from m)::date d, (select weight_kg from m) kg, 'reg' src, (select consent_at from m)::date::timestamptz t where (select weight_kg from m) is not null
    union all select v.visit_date, v.weight, 'visit', v.visit_date::timestamptz + interval '12 hours' from public.anc_visits v where v.mother_id = _mid and v.weight is not null
    union all select (w.at at time zone 'Asia/Tashkent')::date, w.kg, 'self', w.at from (select * from public.mother_weight w where w.mother_id = _mid order by w.at desc limit 60) w
  )
  select coalesce(jsonb_agg(jsonb_build_object('d', x.d, 'kg', x.kg, 'src', x.src, 'ga', x.d - (select lmp0 from m)) order by x.t), '[]') from x;
$$;
create or replace function private.mother_pills_14(_mid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', p.day, 'kind', p.kind) order by p.day), '[]')
  from public.mother_pills p where p.mother_id = _mid and p.day > private.today() - 14;
$$;

create or replace function public.bot_mother_view(_tg bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g record; m record;
begin
  select * into g from public.mother_tg where telegram_id = _tg;
  if not found then return null; end if;
  select * into m from public.mothers where id = g.mother_id;
  return jsonb_build_object('lang', g.lang, 'full_name', m.full_name, 'status', m.status, 'outcome', m.outcome, 'outcome_date', m.outcome_date,
    'risk', m.risk, 'institution', (select i.name from public.institutions i where i.id = m.institution_id),
    'pe', coalesce(m.risk_eval ->> 'pe', 'low'), 'rh_neg', coalesce((m.risk_eval ->> 'rh_neg')::boolean, false),
    'anemia', coalesce((m.risk_eval ->> 'anemia')::boolean, false), 'bmi', m.risk_eval -> 'bmi', 'height_cm', m.height_cm,
    'today', private.today(),
    'doya', (select jsonb_build_object('name', p.full_name, 'phone', p.phone) from public.profiles p where p.id = m.created_by),
    'state', private.mother_state(m.id),
    'schedule', (select jsonb_agg(jsonb_build_object('no', s.visit_no, 'label', s.label, 'label_uz', s.label_uz, 'tests', s.tests, 'tests_uz', s.tests_uz) order by s.visit_no)
                 from public.anc_schedule s where s.visit_no between 1 and 8),
    'home_schedule', (select jsonb_agg(jsonb_build_object('kind', h.kind, 'label', h.label_ru, 'label_uz', h.label_uz) order by h.sort) from public.home_schedule h),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('no', v.visit_no, 'date', v.visit_date, 'tests', v.tests, 'bp_sys', v.bp_sys, 'bp_dia', v.bp_dia) order by v.visit_date)
                        from public.anc_visits v where v.mother_id = m.id), '[]'),
    'bp', coalesce((select jsonb_agg(jsonb_build_object('sys', b.sys, 'dia', b.dia, 'at', b.at) order by b.at desc)
                    from (select * from public.mother_bp b where b.mother_id = m.id order by b.at desc limit 30) b), '[]'),
    'weights', private.mother_weights(m.id),
    'pills', private.mother_pills_14(m.id));
end $$;

-- карточка на сайте: те же дневники для доя
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
                        from public.mother_alerts a left join public.profiles p on p.id = a.seen_by where a.mother_id = _id), '[]'),
    'bp', coalesce((select jsonb_agg(jsonb_build_object('sys', b.sys, 'dia', b.dia, 'at', b.at) order by b.at desc)
                    from (select * from public.mother_bp b where b.mother_id = _id order by b.at desc limit 30) b), '[]'),
    'weights', private.mother_weights(_id),
    'pills', private.mother_pills_14(_id));
end $$;

revoke all on function public.bot_mother_weight(bigint, numeric), public.bot_mother_pill(bigint, text, boolean),
  private.mother_weights(uuid), private.mother_pills_14(uuid) from public, anon, authenticated;
grant execute on function public.bot_mother_weight(bigint, numeric), public.bot_mother_pill(bigint, text, boolean) to service_role;
