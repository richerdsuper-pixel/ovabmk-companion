-- 0022: группа риска — автоматически по НКП «Антенатальный уход. Ведение беременных групп риска» (прил. 2 к приказу МЗ РУз №180 от 23.06.2025).
-- Протокол выделяет две группы: низкий риск (нормальная беременность) и высокий риск (все, кто не отвечает критериям нормальной
-- беременности, и все с факторами риска ПЭ, ГСД, ЗРП, преждевременных родов, венозных ТЭО, послеродовых кровотечений).
-- Отдельно считаются: риск ПЭ (1 фактор высокого или ≥2 умеренного риска), ГСД (≥1 фактор), ЗРП (≥1 большой или ≥3 малых),
-- венозные ТЭО (баллы: 1–2 умеренный, ≥3 высокий), ПРК (≥1 фактор), преждевременные роды, резус-отрицательная кровь, анемия.
-- Специалист отмечает факторы, а возраст, паритет и ИМТ сайт берёт из анкеты (дата рождения, роды, рост и вес).
-- Также: дневник давления беременной (из бота; ≥140/90 — сигнал доя) и еженедельные советы по сроку.

alter table public.mothers add column height_cm int check (height_cm between 120 and 220);
alter table public.mothers add column weight_kg numeric(5, 1) check (weight_kg between 30 and 250);
alter table public.mothers add column risk_eval jsonb;

-- прежние коды факторов → коды протокола
update public.mothers set risk_factors = (select coalesce(array_agg(distinct x), '{}') from (
  select case f when 'pe_history' then 'pe_hist' when 'hypertension' then 'chronic_htn' when 'pph_history' then 'pph_hist' when 'loss_history' then 'stillbirth'
                when 'short_interval' then 'interval_lt6' when 'grand_multi' then null when 'age_35' then null when 'age_lt18' then null when 'obesity' then 'obesity'
                when 'infection' then null when 'other' then 'doctor_high' else f end x
  from unnest(risk_factors) f) q where x is not null);

create or replace function private.risk180(_rf text[], _age int, _para int, _bmi numeric)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  f text[] := coalesce(_rf, '{}'); has_bmi boolean := _bmi is not null;
  obese30 boolean := (has_bmi and _bmi >= 30) or 'obesity' = any (f);
  reasons text[] := '{}'; pe_hi text[]; pe_mod text[]; gdm text[]; fgr_maj text[]; fgr_min text[]; pph text[]; ptb text[];
  vte int := 0; vte_somatic boolean; lvl text;
begin
  -- преэклампсия
  pe_hi := array(select x from unnest(array['pe_hist', 'chronic_htn', 'kidney', 'diabetes', 'autoimmune']) x where x = any (f));
  pe_mod := array_remove(array[case when _para = 0 then 'nullipara' end, case when _age >= 40 then 'age_40' end,
                               case when has_bmi and _bmi >= 35 then 'bmi_35' end, case when 'pe_family' = any (f) then 'pe_family' end,
                               case when 'interval_gt10y' = any (f) then 'interval_gt10y' end, case when 'multiple' = any (f) then 'multiple' end], null);
  -- гестационный сахарный диабет
  gdm := array_remove(array[case when obese30 then 'bmi_30' end, case when 'gdm_hist' = any (f) then 'gdm_hist' end, case when _age >= 40 then 'age_40' end,
                            case when 'dm_family' = any (f) then 'dm_family' end, case when 'macrosomia_hist' = any (f) then 'macrosomia_hist' end,
                            case when 'large_fetus' = any (f) then 'large_fetus' end, case when 'stillbirth' = any (f) then 'stillbirth' end,
                            case when 'neonatal_death' = any (f) then 'neonatal_death' end], null);
  -- задержка роста плода
  fgr_maj := array_remove(array[case when _age > 40 then 'age_40' end, case when 'smoking_heavy' = any (f) then 'smoking_heavy' end,
                                case when 'sga_hist' = any (f) then 'sga_hist' end, case when 'stillbirth' = any (f) then 'stillbirth' end,
                                case when 'pe_hist' = any (f) then 'pe_hist' end, case when 'chronic_htn' = any (f) then 'chronic_htn' end,
                                case when 'diabetes' = any (f) then 'diabetes' end, case when 'kidney' = any (f) then 'kidney' end,
                                case when 'autoimmune' = any (f) then 'autoimmune' end, case when 'bleeding_now' = any (f) then 'bleeding_now' end], null);
  fgr_min := array_remove(array[case when _age > 35 and _age <= 40 then 'age_35' end, case when 'smoking' = any (f) then 'smoking' end,
                                case when _para = 0 then 'nullipara' end, case when has_bmi and (_bmi < 20 or (_bmi >= 25 and _bmi <= 35)) then 'bmi_fgr' end,
                                case when 'interval_lt6' = any (f) or 'interval_gt60' = any (f) or 'interval_gt10y' = any (f) then 'interval' end], null);
  -- венозные ТЭО: баллы
  vte := case when 'vte_hist' = any (f) then 3 else 0 end + case when 'thrombophilia' = any (f) then 3 else 0 end
       + case when 'vte_family' = any (f) then 1 else 0 end + case when _age > 35 then 1 else 0 end
       + case when 'smoking' = any (f) or 'smoking_heavy' = any (f) then 1 else 0 end + case when obese30 then 1 else 0 end
       + case when 'varicose' = any (f) then 1 else 0 end + case when _para >= 3 then 1 else 0 end + case when 'multiple' = any (f) then 1 else 0 end
       + case when 'pe_now' = any (f) then 1 else 0 end;
  vte_somatic := f && array['chronic_htn', 'kidney', 'diabetes', 'heart', 'autoimmune'];
  if vte_somatic then vte := vte + 2; end if;
  -- послеродовые кровотечения
  pph := array_remove(array[case when 'multiple' = any (f) then 'multiple' end, case when _para >= 4 then 'para4' end,
                            case when 'anemia_severe' = any (f) then 'anemia_severe' end, case when 'pph_hist' = any (f) then 'pph_hist' end,
                            case when 'pe_now' = any (f) then 'pe_now' end, case when 'large_fetus' = any (f) then 'large_fetus' end,
                            case when 'previa' = any (f) then 'previa' end, case when 'abruption_hist' = any (f) then 'abruption_hist' end,
                            case when 'miscarriage' = any (f) then 'miscarriage' end, case when 'cs_scar' = any (f) then 'cs_scar' end,
                            case when 'coagulopathy' = any (f) then 'coagulopathy' end, case when 'heart' = any (f) then 'heart' end], null);
  -- преждевременные роды
  ptb := array_remove(array[case when 'ptb_hist' = any (f) then 'ptb_hist' end, case when 'short_cervix' = any (f) then 'short_cervix' end], null);

  -- высокий риск: не отвечает критериям нормальной беременности или есть риск по одному из направлений
  reasons := array(select x from unnest(array['multiple', 'fetal_anomaly', 'cs_scar', 'stillbirth', 'neonatal_death', 'miscarriage', 'ptb_hist', 'isoimmun',
                                              'gdm_hist', 'heart', 'chronic_htn', 'diabetes', 'epilepsy', 'asthma', 'substance', 'mental', 'previa', 'pe_now',
                                              'doctor_high']) x where x = any (f));
  if has_bmi and (_bmi > 35 or _bmi < 17) then reasons := reasons || 'bmi_extreme'::text;
  elsif obese30 or (has_bmi and _bmi <= 18.5) then reasons := reasons || 'bmi_risk'::text; end if;
  if cardinality(pe_hi) >= 1 or cardinality(pe_mod) >= 2 then reasons := reasons || 'pe_risk'::text; end if;
  if cardinality(gdm) >= 1 then reasons := reasons || 'gdm_risk'::text; end if;
  if cardinality(fgr_maj) >= 1 or cardinality(fgr_min) >= 3 then reasons := reasons || 'fgr_risk'::text; end if;
  if vte >= 3 then reasons := reasons || 'vte_risk'::text; end if;
  if cardinality(pph) >= 1 then reasons := reasons || 'pph_risk'::text; end if;
  if cardinality(ptb) >= 1 then reasons := reasons || 'ptb_risk'::text; end if;
  select coalesce(array_agg(distinct r), '{}') into reasons from unnest(reasons) r;
  lvl := case when cardinality(reasons) > 0 then 'high' else 'low' end;
  return jsonb_build_object(
    'level', lvl, 'reasons', to_jsonb(reasons), 'bmi', case when has_bmi then round(_bmi, 1) end, 'age', _age, 'para', _para,
    'pe', case when cardinality(pe_hi) >= 1 or cardinality(pe_mod) >= 2 then 'high' else 'low' end, 'pe_high', to_jsonb(pe_hi), 'pe_mod', to_jsonb(pe_mod),
    'gdm', cardinality(gdm) >= 1, 'gdm_f', to_jsonb(gdm),
    'fgr', case when cardinality(fgr_maj) >= 1 or cardinality(fgr_min) >= 3 then 'high' else 'low' end, 'fgr_major', to_jsonb(fgr_maj), 'fgr_minor', to_jsonb(fgr_min),
    'vte_score', vte, 'vte', case when vte >= 3 then 'high' when vte >= 1 then 'moderate' else 'none' end,
    'pph', cardinality(pph) >= 1, 'pph_f', to_jsonb(pph), 'ptb', cardinality(ptb) >= 1, 'ptb_f', to_jsonb(ptb),
    'rh_neg', 'rh_neg' = any (f), 'anemia', 'anemia' = any (f) or 'anemia_severe' = any (f), 'teen', _age < 18);
end $$;

-- оценка по анкете (для предпросмотра на сайте и для сохранения)
create or replace function private.risk180_of(_d jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare _bd date; _age int; _h numeric; _w numeric; _bmi numeric; _rf text[];
begin
  begin _bd := nullif(_d ->> 'birth_date', '')::date; exception when others then _bd := null; end;
  _age := case when _bd is not null then extract(year from age(private.today(), _bd))::int end;
  _h := nullif(_d ->> 'height_cm', '')::numeric; _w := nullif(_d ->> 'weight_kg', '')::numeric;
  _bmi := case when _h between 120 and 220 and _w between 30 and 250 then _w / ((_h / 100) ^ 2) end;
  select coalesce(array_agg(x), '{}') into _rf from jsonb_array_elements_text(coalesce(_d -> 'risk_factors', '[]')) x;
  return private.risk180(_rf, _age, nullif(_d ->> 'para', '')::int, _bmi);
exception when others then return private.risk180('{}', null, null, null);
end $$;

create or replace function public.risk180_preview(_d jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.risk180_of(_d);
end $$;

-- постановка / изменение: группа риска — только по протоколу
create or replace function public.mother_save(_id uuid, _d jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _me uuid := auth.uid(); t date := private.today(); _r uuid; _inst int; _old record; _ev jsonb;
  _name text := regexp_replace(btrim(coalesce(_d ->> 'full_name', '')), '\s+', ' ', 'g');
  _phone text := nullif(regexp_replace(coalesce(_d ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
  _lmp date; _edd date; _bd date; _cons date; _rf text[];
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
  select coalesce(array_agg(distinct left(btrim(x), 40)) filter (where btrim(x) ~ '^[a-z0-9_]{2,40}$'), '{}') into _rf
    from jsonb_array_elements_text(coalesce(_d -> 'risk_factors', '[]')) x;
  if array_length(_rf, 1) > 40 then raise exception 'bad_risk_factors'; end if;
  _ev := private.risk180_of(_d || jsonb_build_object('risk_factors', to_jsonb(_rf)));
  _inst := coalesce(nullif(_d ->> 'institution_id', '')::int, (select institution_id from public.profiles where id = _me));
  if _inst is null then raise exception 'need_institution'; end if;
  if not private.preg_ok(_me, _inst) then raise exception 'forbidden' using errcode = '42501'; end if;

  if _id is null then
    if _cons is null or _cons > t or _cons < t - 400 then raise exception 'need_consent'; end if;
    if exists (select 1 from public.mothers m where m.status <> 'closed' and m.institution_id = _inst and (
                (_phone is not null and m.phone = _phone) or (lower(m.full_name) = lower(_name) and m.birth_date is not distinct from _bd))) then
      raise exception 'duplicate';
    end if;
    insert into public.mothers (institution_id, mahalla_id, full_name, birth_date, phone, address, card_no, lmp, edd_us, gravida, para, risk, risk_factors, notes, consent_at,
                                height_cm, weight_kg, risk_eval)
    values (_inst, (select x.id from public.mahallas x where x.id = nullif(_d ->> 'mahalla_id', '')::int), _name, _bd, _phone,
            left(btrim(coalesce(_d ->> 'address', '')), 200), left(btrim(coalesce(_d ->> 'card_no', '')), 30), _lmp, _edd,
            nullif(_d ->> 'gravida', '')::int, nullif(_d ->> 'para', '')::int, _ev ->> 'level', _rf, left(btrim(coalesce(_d ->> 'notes', '')), 1000), _cons,
            nullif(_d ->> 'height_cm', '')::int, nullif(_d ->> 'weight_kg', '')::numeric, _ev)
    returning id into _r;
    perform private.log_event('mother_added', _r::text, jsonb_build_object('institution', _inst));
  else
    select * into _old from public.mothers where id = _id;
    if not found or not private.preg_ok(_me, _old.institution_id) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.mothers set institution_id = _inst, mahalla_id = (select x.id from public.mahallas x where x.id = nullif(_d ->> 'mahalla_id', '')::int),
           full_name = _name, birth_date = _bd, phone = _phone, address = left(btrim(coalesce(_d ->> 'address', '')), 200),
           card_no = left(btrim(coalesce(_d ->> 'card_no', '')), 30), lmp = _lmp, edd_us = _edd,
           gravida = nullif(_d ->> 'gravida', '')::int, para = nullif(_d ->> 'para', '')::int, risk = _ev ->> 'level', risk_factors = _rf,
           notes = left(btrim(coalesce(_d ->> 'notes', '')), 1000), consent_at = coalesce(_cons, consent_at),
           height_cm = nullif(_d ->> 'height_cm', '')::int, weight_kg = nullif(_d ->> 'weight_kg', '')::numeric, risk_eval = _ev, updated_at = now()
     where id = _id returning id into _r;
    perform private.log_event('mother_changed', _r::text, jsonb_build_object('institution', _inst));
  end if;
  return _r;
exception
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'bad_form';
  when check_violation then raise exception 'bad_form';
end $$;

-- пересчитать всех, кто уже на учёте
update public.mothers m set risk_eval = private.risk180_of(jsonb_build_object('birth_date', m.birth_date, 'para', m.para, 'height_cm', m.height_cm, 'weight_kg', m.weight_kg,
                                                                              'risk_factors', to_jsonb(m.risk_factors))),
                             risk = (private.risk180_of(jsonb_build_object('birth_date', m.birth_date, 'para', m.para, 'height_cm', m.height_cm, 'weight_kg', m.weight_kg,
                                                                              'risk_factors', to_jsonb(m.risk_factors))) ->> 'level');

-- ---------------------------------------------------------------- дневник давления беременной (из бота)
create table public.mother_bp (
  id        bigint generated always as identity primary key,
  mother_id uuid not null references public.mothers (id) on delete cascade,
  sys       int not null check (sys between 60 and 260),
  dia       int not null check (dia between 30 and 180),
  at        timestamptz not null default now()
);
create index mother_bp_idx on public.mother_bp (mother_id, at desc);
alter table public.mother_bp enable row level security;
revoke all on public.mother_bp from public, anon, authenticated;

-- запись давления; при ≥140/90 — сигнал (bp_high, при ≥160/110 — bp_severe) и список, кому сообщить
create or replace function public.bot_mother_bp(_tg bigint, _sys int, _dia int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; lvl text;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return jsonb_build_object('error', 'not_linked'); end if;
  if _sys is null or _dia is null or _sys < 60 or _sys > 260 or _dia < 30 or _dia > 180 or _dia >= _sys then return jsonb_build_object('error', 'bad_bp'); end if;
  if (select count(*) from public.mother_bp b where b.mother_id = g.mother_id and b.at > now() - interval '1 day') >= 12 then return jsonb_build_object('error', 'too_many'); end if;
  insert into public.mother_bp (mother_id, sys, dia) values (g.mother_id, _sys, _dia);
  lvl := case when _sys >= 160 or _dia >= 110 then 'severe' when _sys >= 140 or _dia >= 90 then 'high' else 'ok' end;
  return jsonb_build_object('level', lvl);
end $$;

-- ---------------------------------------------------------------- карточка и «Моя страница»: давление, оценка риска
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
                    from (select * from public.mother_bp b where b.mother_id = _id order by b.at desc limit 30) b), '[]'));
end $$;

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
    'doya', (select jsonb_build_object('name', p.full_name, 'phone', p.phone) from public.profiles p where p.id = m.created_by),
    'state', private.mother_state(m.id),
    'schedule', (select jsonb_agg(jsonb_build_object('no', s.visit_no, 'label', s.label, 'label_uz', s.label_uz, 'tests', s.tests, 'tests_uz', s.tests_uz) order by s.visit_no)
                 from public.anc_schedule s where s.visit_no between 1 and 8),
    'home_schedule', (select jsonb_agg(jsonb_build_object('kind', h.kind, 'label', h.label_ru, 'label_uz', h.label_uz) order by h.sort) from public.home_schedule h),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('no', v.visit_no, 'date', v.visit_date, 'tests', v.tests) order by v.visit_date)
                        from public.anc_visits v where v.mother_id = m.id), '[]'),
    'bp', coalesce((select jsonb_agg(jsonb_build_object('sys', b.sys, 'dia', b.dia, 'at', b.at) order by b.at desc)
                    from (select * from public.mother_bp b where b.mother_id = m.id order by b.at desc limit 14) b), '[]'));
end $$;

-- ---------------------------------------------------------------- советы по сроку (раз в неделю на ключевых сроках, каждый один раз)
create or replace function public.cron_mother_weekly(_secret text)
returns table (telegram_id bigint, lang text, topic text, first_name text, pe text, rh_neg boolean)
language plpgsql security definer set search_path = '' as $$
declare t date := private.today();
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with c as (
    select g.telegram_id tg, g.lang lg, m.id mid, split_part(m.full_name, ' ', 2) fn, coalesce(m.risk_eval ->> 'pe', 'low') pe_, coalesce((m.risk_eval ->> 'rh_neg')::boolean, false) rh,
           case when m.status = 'pregnant' then (t - coalesce(m.edd_us - 280, m.lmp)) / 7 end wk,
           case when m.status = 'postpartum' then t - coalesce(m.discharge_date, m.outcome_date) end ppd
    from public.mother_tg g join public.mothers m on m.id = g.mother_id and m.status in ('pregnant', 'postpartum')
  ), w as (
    select c.*, case
      when c.wk between 4 and 11 then 'w08' when c.wk between 16 and 17 then 'w16' when c.wk between 20 and 21 then 'w20'
      when c.wk between 24 and 25 then 'w24' when c.wk between 28 and 29 then 'w28' when c.wk between 32 and 33 then 'w32'
      when c.wk between 36 and 37 then 'w36' when c.wk = 38 or c.wk = 39 then 'w38' when c.wk >= 40 and c.wk <= 42 then 'w40'
      when c.ppd between 0 and 6 then 'pp1' when c.ppd between 14 and 20 then 'pp2' when c.ppd between 35 and 41 then 'pp6' end tp
    from c
  ), ins as (
    insert into private.mother_sent (mother_id, key)
    select w.mid, 'tip:' || w.tp from w where w.tp is not null
    on conflict do nothing returning mother_id, key
  )
  select w.tg, w.lg, w.tp, w.fn, w.pe_, w.rh from w join ins on ins.mother_id = w.mid and ins.key = 'tip:' || w.tp;
end $$;

revoke all on function public.risk180_preview(jsonb), public.bot_mother_bp(bigint, int, int), public.cron_mother_weekly(text) from public, anon, authenticated;
grant execute on function public.risk180_preview(jsonb) to authenticated;
grant execute on function public.bot_mother_bp(bigint, int, int), public.cron_mother_weekly(text) to service_role;
