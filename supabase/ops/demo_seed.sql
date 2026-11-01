-- Демо-данные для показа в хокимияте: 24 вымышленные женщины в учреждении «Демо ОШП (намуна)» (телефоны +99800000…, Telegram 9000000000xx — не настоящие).
-- Удалить: supabase/ops/demo_remove.sql
do $$
declare i int; m1 int; m2 int; mid uuid; r record; v int; a uuid := '8a2325a1-51a5-4635-ba2f-137dab02dcae';
  lmp date; reg date; dis date; d date; k int := 0;
begin
  insert into public.institutions (name, kind) values ('Демо ОШП (намуна)', 'svp') returning id into i;
  insert into public.mahallas (name) values ('Демо: Гулистон маҳалласи') returning id into m1;
  insert into public.mahallas (name) values ('Демо: Навбаҳор маҳалласи') returning id into m2;
  insert into public.mahalla_links values (m1, i), (m2, i);
  -- ф.и.о., возраст, ga (дней) или роды (дней назад, со знаком минус), постановка (дней назад), риск, факторы, визиты №180, патронаж, telegram, сигнал
  for r in select * from (values
    ('Каримова Дилноза Акмаловна', 24, 60, 0, 'low', '{}'::text[], '{}'::int[], '{}'::text[], true, false),
    ('Раҳимова Гулноза Анваровна', 36, 75, 20, 'mid', '{}', '{1}', '{}', true, false),
    ('Тошпўлатова Мадина Баҳодировна', 27, 88, 40, 'low', '{}', '{1}', '{}', false, false),
    ('Норова Нигора Тоҳировна', 17, 95, 50, 'high', '{anemia_severe}', '{1}', '{}', true, false),
    ('Холова Шаҳло Баҳодировна', 29, 110, 80, 'low', '{}', '{1}', '{ant12}', true, false),
    ('Эргашева Зарина Акмаловна', 31, 130, 100, 'mid', '{anemia}', '{1}', '{ant12}', false, false),
    ('Бобоева Малика Фарҳодовна', 38, 134, 110, 'high', '{interval_lt6,miscarriage}', '{}', '{ant12}', false, true),
    ('Турсунова Феруза Рустамовна', 22, 150, 120, 'low', '{}', '{1}', '{ant12}', true, false),
    ('Жўраева Дилфуза Баҳодировна', 33, 165, 140, 'mid', '{cs_scar}', '{1,2}', '{ant12}', true, false),
    ('Ҳамроева Нодира Акмаловна', 26, 185, 160, 'low', '{}', '{1,2}', '{ant12}', true, false),
    ('Қодирова Сабина Тоҳировна', 40, 195, 170, 'high', '{multiple,rh_neg}', '{1,2}', '{ant12}', false, false),
    ('Сафарова Гулчеҳра Фарҳодовна', 28, 213, 180, 'low', '{}', '{1,2,3}', '{ant12}', true, false),
    ('Аминова Мохира Шавкатовна', 30, 228, 200, 'mid', '{cs_scar}', '{1,2,3,4}', '{ant12}', true, false),
    ('Мирзаева Ойгул Шавкатовна', 35, 240, 210, 'mid', '{rh_neg}', '{1,2,3}', '{ant12}', false, false),
    ('Абдуллаева Барно Рустамовна', 37, 252, 230, 'high', '{pe_hist,chronic_htn}', '{1,2,3,4,5}', '{ant12,ant32}', true, false),
    ('Юсупова Севара Ҳамидовна', 23, 262, 240, 'low', '{}', '{1,2,3,4,5,6}', '{ant12,ant32}', true, false),
    ('Шарипова Муниса Ботировна', 32, 272, 250, 'mid', '{}', '{1,2,3,4,5,6,7}', '{ant12,ant32}', true, false),
    ('Расулова Лобар Ботировна', 25, 40, 0, 'low', '{}', '{}', '{}', false, false),
    ('Назарова Ирода Баҳодировна', 29, 50, 0, 'mid', '{pe_hist}', '{}', '{}', true, false),
    ('Исмоилова Шоира Ҳамидовна', 34, 120, 15, 'mid', '{diabetes}', '{}', '{}', false, false),
    ('Ғафурова Нафиса Баҳодировна', 27, -2, 260, 'low', '{}', '{1,2,3,4,5,6,7,8}', '{ant12,ant32}', true, false),
    ('Олимова Ҳилола Анваровна', 31, -6, 260, 'mid', '{cs_scar}', '{1,2,3,4,5,6,7}', '{ant12,ant32,pp3}', true, false),
    ('Бердиева Зулфия Олимовна', 21, -15, 270, 'low', '{}', '{1,2,3,4,5,6,7,8}', '{ant12,ant32,pp3}', false, false),
    ('Тўраева Санобар Акмаловна', 39, -22, 280, 'high', '{}', '{1,2,3,4,5,6}', '{ant12,ant32,pp3}', true, false)
  ) x(fio, age, ga, regago, risk, rf, vis, hv, tg, alert) loop
    k := k + 1;
    lmp := case when r.ga > 0 then private.today() - r.ga else private.today() + r.ga - 280 end;
    reg := private.today() - r.regago;
    dis := case when r.ga < 0 then private.today() + r.ga + 1 end;
    insert into public.mothers (institution_id, mahalla_id, full_name, birth_date, phone, address, card_no, lmp, gravida, para, risk, risk_factors, consent_at,
                                status, outcome, outcome_date, discharge_date, babies, created_by, created_at, height_cm, weight_kg)
    values (i, case when k % 2 = 1 then m1 else m2 end, r.fio, private.today() - r.age * 365 - (k * 11), '+99800000' || (1000 + k),
            (array['Мустақиллик кўчаси','Боғ кўчаси','Навоий кўчаси','Тинчлик кўчаси','Гулзор кўчаси'])[1 + k % 5] || ', ' || (k * 3 + 1) || '-уй', 'Д-' || (100 + k),
            lmp, 1 + k % 4, k % 3, r.risk, r.rf, reg, case when r.ga < 0 then 'postpartum' else 'pregnant' end,
            case when r.ga < 0 then 'delivered' end, case when r.ga < 0 then private.today() + r.ga end, dis, case when r.ga < 0 then 1 end, a,
            case when r.regago = 0 then now() - interval '2 hours' else reg::timestamptz + interval '9 hours' end,
            152 + k % 15, case when r.fio like 'Шарипова%' then 92 when r.fio like 'Тўраева%' then 84 else 54 + k % 14 end)
    returning id into mid;
    foreach v in array r.vis loop
      select greatest(lmp + s.from_week * 7 + 3, reg) into d from public.anc_schedule s where s.visit_no = v;
      if d <= private.today() then
        insert into public.anc_visits (mother_id, visit_no, visit_date, bp_sys, bp_dia, weight, by_user)
        values (mid, v, d, case when r.risk = 'high' then 130 + v else 110 + (k + v) % 12 end, case when r.risk = 'high' then 88 else 70 + (k + v) % 8 end, 58 + k % 9 + v * 1.5, a);
      end if;
    end loop;
    if 'ant12' = any (r.hv) then insert into public.home_visits (mother_id, kind, visit_date, mother_ok, by_user) values (mid, 'ant12', greatest(lmp + 86, reg), true, a); end if;
    if 'ant32' = any (r.hv) then insert into public.home_visits (mother_id, kind, visit_date, mother_ok, by_user) values (mid, 'ant32', lmp + 226, true, a); end if;
    if 'pp3' = any (r.hv) then insert into public.home_visits (mother_id, kind, visit_date, mother_ok, baby_ok, by_user) values (mid, 'pp3', dis + 1, true, true, a); end if;
    if r.tg then insert into public.mother_tg (mother_id, telegram_id, lang) values (mid, 900000000000 + k, 'uz'); end if;
    if r.alert then insert into public.mother_alerts (mother_id, signs, created_at) values (mid, array['bleeding', 'abd_pain'], now() - interval '40 minutes'); end if;
  end loop;
  -- группа риска — по протоколу №180 (как при сохранении на сайте)
  update public.mothers m set risk_eval = private.risk180_of(jsonb_build_object('birth_date', m.birth_date, 'para', m.para, 'height_cm', m.height_cm,
                                                                               'weight_kg', m.weight_kg, 'risk_factors', to_jsonb(m.risk_factors)))
   where m.institution_id = i;
  update public.mothers m set risk = m.risk_eval ->> 'level' where m.institution_id = i;
  -- дневник давления у беременной с высоким риском преэклампсии (последняя запись — высокая)
  insert into public.mother_bp (mother_id, sys, dia, at)
  select m.id, x.s, x.d, now() - (x.h || ' hours')::interval from public.mothers m,
    (values (124, 80, 120), (128, 82, 96), (131, 84, 72), (126, 81, 48), (138, 88, 24), (142, 92, 2)) x(s, d, h)
  where m.institution_id = i and m.full_name = 'Абдуллаева Барно Рустамовна';
  -- дневник веса (раз в 2 недели с постановки) и витамины за 2 недели — у беременных, подключённых к боту (для графиков на «Моей странице» и в карточке)
  insert into public.mother_weight (mother_id, kg, at)
  select m.id, round(m.weight_kg + (w.n * 14) / 7.0 * (case when m.full_name like 'Абдуллаева%' then 0.62 else 0.42 end), 1),
         (m.consent_at::date + w.n * 14)::timestamptz + interval '8 hours'
  from public.mothers m join public.mother_tg g on g.mother_id = m.id, generate_series(1, 20) w(n)
  where m.institution_id = i and m.status = 'pregnant' and m.consent_at::date + w.n * 14 <= private.today();
  insert into public.mother_pills (mother_id, day, kind)
  select m.id, private.today() - dd, k from public.mothers m join public.mother_tg g on g.mother_id = m.id, generate_series(0, 13) dd, unnest(array['iodine', 'iron']) k
  where m.institution_id = i and m.status = 'pregnant' and (dd + length(m.full_name)) % 4 <> 0;
  -- вопросы доя (один с ответом, один ждёт), час напоминания о витаминах, карточка малыша у родившей
  insert into public.mother_questions (mother_id, q, a, a_by, created_at, answered_at)
  select m.id, 'Можно ли мне пить кофе?', 'Можно, но не больше 2 чашек в день. Лучше чай без сахара и вода.', a, now() - interval '1 day', now() - interval '20 hours'
  from public.mothers m where m.institution_id = i and m.full_name like 'Абдуллаева%';
  insert into public.mother_questions (mother_id, q, created_at)
  select m.id, 'Когда мне делать УЗИ второго триместра?', now() - interval '3 hours' from public.mothers m where m.institution_id = i and m.full_name like 'Ҳамроева%';
  update public.mother_tg g set pill_hour = 9 from public.mothers m where m.id = g.mother_id and m.institution_id = i and m.status = 'pregnant';
  insert into public.mother_baby (mother_id, kind, val, d)
  select m.id, x.k, x.v, m.outcome_date + x.dd from public.mothers m,
    (values ('weight', '3350', 0), ('vaccine', 'БЦЖ', 1), ('vaccine', 'Гепатит B', 0), ('feed', 'breast', 2), ('weight', '3290', 4), ('weight', '3420', 10), ('weight', '3610', 15)) x(k, v, dd)
  where m.institution_id = i and m.full_name like 'Олимова%' and m.outcome_date + x.dd <= private.today();
  -- направления (одно просрочено, одно открыто, одно — дошла), планирование семьи после родов, пол малыша
  insert into public.referrals (mother_id, target, reason, due_date, created_by, created_at, arrived_at, result)
  select m.id, x.t, x.r, private.today() + x.dd, a, now() - (x.ago || ' days')::interval, case when x.ok then private.today() - 1 end, case when x.ok then 'Осмотрена, назначено лечение' else '' end
  from public.mothers m join (values ('Абдуллаева%', 'Роддом', 'Давление 142/92, риск преэклампсии', -1, 3, false),
                                     ('Норова%', 'Акушер-гинеколог', 'Тяжёлая анемия, 17 лет', 2, 1, false),
                                     ('Қодирова%', 'УЗИ', 'Многоплодная беременность — контроль роста', -2, 5, true)) x(n, t, r, dd, ago, ok)
    on m.full_name like x.n where m.institution_id = i;
  update public.mothers set fp_method = 'iud', fp_date = outcome_date + 5 where institution_id = i and full_name like 'Бердиева%' and outcome_date + 5 <= private.today();
  update public.mothers set fp_method = 'lam', fp_date = outcome_date + 3 where institution_id = i and full_name like 'Олимова%' and outcome_date + 3 <= private.today();
  insert into public.mother_baby (mother_id, kind, val, d) select m.id, 'sex', 'f', m.outcome_date from public.mothers m where m.institution_id = i and m.full_name like 'Олимова%';
  -- одни роды сегодня (для «родили в этом месяце»)
  update public.mothers set outcome_date = private.today(), discharge_date = private.today() where institution_id = i and full_name = 'Ғафурова Нафиса Баҳодировна';
end $$;
