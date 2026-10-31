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
    ('Каримова Дилноза Акмаловна', 24, 60, 5, 'low', '{}'::text[], '{}'::int[], '{}'::text[], true, false),
    ('Раҳимова Гулноза Анваровна', 36, 75, 20, 'mid', '{age_35}', '{1}', '{}', true, false),
    ('Тошпўлатова Мадина Баҳодировна', 27, 88, 40, 'low', '{}', '{1}', '{}', false, false),
    ('Норова Нигора Тоҳировна', 17, 95, 50, 'high', '{age_lt18,anemia}', '{1}', '{}', true, false),
    ('Холова Шаҳло Баҳодировна', 29, 110, 80, 'low', '{}', '{1}', '{ant12}', true, false),
    ('Эргашева Зарина Акмаловна', 31, 130, 100, 'mid', '{anemia}', '{1}', '{ant12}', false, false),
    ('Бобоева Малика Фарҳодовна', 38, 134, 110, 'high', '{age_35,short_interval}', '{}', '{ant12}', false, true),
    ('Турсунова Феруза Рустамовна', 22, 150, 120, 'low', '{}', '{1}', '{ant12}', true, false),
    ('Жўраева Дилфуза Баҳодировна', 33, 165, 140, 'mid', '{cs_scar}', '{1,2}', '{ant12}', true, false),
    ('Ҳамроева Нодира Акмаловна', 26, 185, 160, 'low', '{}', '{1,2}', '{ant12}', true, false),
    ('Қодирова Сабина Тоҳировна', 40, 195, 170, 'high', '{age_35,multiple,rh_neg}', '{1,2}', '{ant12}', false, false),
    ('Сафарова Гулчеҳра Фарҳодовна', 28, 213, 180, 'low', '{}', '{1,2,3}', '{ant12}', true, false),
    ('Аминова Мохира Шавкатовна', 30, 228, 200, 'mid', '{cs_scar}', '{1,2,3,4}', '{ant12}', true, false),
    ('Мирзаева Ойгул Шавкатовна', 35, 240, 210, 'mid', '{age_35}', '{1,2,3}', '{ant12}', false, false),
    ('Абдуллаева Барно Рустамовна', 37, 252, 230, 'high', '{age_35,pe_history,hypertension}', '{1,2,3,4,5}', '{ant12,ant32}', true, false),
    ('Юсупова Севара Ҳамидовна', 23, 262, 240, 'low', '{}', '{1,2,3,4,5,6}', '{ant12,ant32}', true, false),
    ('Шарипова Муниса Ботировна', 32, 272, 250, 'mid', '{obesity}', '{1,2,3,4,5,6,7}', '{ant12,ant32}', true, false),
    ('Расулова Лобар Ботировна', 25, 40, 3, 'low', '{}', '{}', '{}', false, false),
    ('Назарова Ирода Баҳодировна', 29, 50, 10, 'mid', '{pe_history}', '{}', '{}', true, false),
    ('Исмоилова Шоира Ҳамидовна', 34, 120, 15, 'mid', '{diabetes}', '{}', '{}', false, false),
    ('Ғафурова Нафиса Баҳодировна', 27, -2, 260, 'low', '{}', '{1,2,3,4,5,6,7,8}', '{ant12,ant32}', true, false),
    ('Олимова Ҳилола Анваровна', 31, -6, 260, 'mid', '{cs_scar}', '{1,2,3,4,5,6,7}', '{ant12,ant32,pp3}', true, false),
    ('Бердиева Зулфия Олимовна', 21, -15, 270, 'low', '{}', '{1,2,3,4,5,6,7,8}', '{ant12,ant32,pp3}', false, false),
    ('Тўраева Санобар Акмаловна', 39, -22, 280, 'high', '{age_35,obesity}', '{1,2,3,4,5,6}', '{ant12,ant32,pp3}', true, false)
  ) x(fio, age, ga, regago, risk, rf, vis, hv, tg, alert) loop
    k := k + 1;
    lmp := case when r.ga > 0 then current_date - r.ga else current_date + r.ga - 280 end;
    reg := current_date - r.regago;
    dis := case when r.ga < 0 then current_date + r.ga + 1 end;
    insert into public.mothers (institution_id, mahalla_id, full_name, birth_date, phone, address, card_no, lmp, gravida, para, risk, risk_factors, consent_at,
                                status, outcome, outcome_date, discharge_date, babies, created_by, created_at)
    values (i, case when k % 2 = 1 then m1 else m2 end, r.fio, current_date - r.age * 365 - (k * 11), '+99800000' || (1000 + k),
            (array['Мустақиллик кўчаси','Боғ кўчаси','Навоий кўчаси','Тинчлик кўчаси','Гулзор кўчаси'])[1 + k % 5] || ', ' || (k * 3 + 1) || '-уй', 'Д-' || (100 + k),
            lmp, 1 + k % 4, k % 3, r.risk, r.rf, reg, case when r.ga < 0 then 'postpartum' else 'pregnant' end,
            case when r.ga < 0 then 'delivered' end, case when r.ga < 0 then current_date + r.ga end, dis, case when r.ga < 0 then 1 end, a, reg::timestamptz + interval '9 hours')
    returning id into mid;
    foreach v in array r.vis loop
      select greatest(lmp + s.from_week * 7 + 3, reg) into d from public.anc_schedule s where s.visit_no = v;
      if d <= current_date then
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
end $$;
