-- Выполняется один раз после миграции 0021 и развёртывания tg-bot.
-- 1) webhook бота заново: теперь Telegram присылает и нажатия кнопок (callback_query) — язык, согласие, тревожные признаки.
select net.http_post(
  url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
  body := '{"action":"setup"}'::jsonb);
-- 2) каждый день в 09:20 по Ташкенту (04:20 UTC) — напоминания беременным о визитах (окно открылось / осталось 3 дня).
select cron.schedule('mother-remind-0920', '20 4 * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"mothers"}'::jsonb)
$$);
-- 3) пн–сб в 08:13 по Ташкенту (03:13 UTC) — утренняя сводка доя/патронажу: визиты сейчас, пропуски, патронаж, сигналы.
select cron.schedule('staff-digest-0813', '13 3 * * 1-6', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"staff"}'::jsonb)
$$);
-- 4) (после 0022) каждый день в 09:35 по Ташкенту (04:35 UTC) — советы по сроку (8, 16, 20 … 40 нед, после родов 1/2/6 нед); каждая тема — один раз.
select cron.schedule('mother-weekly-0935', '35 4 * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"weekly"}'::jsonb)
$$);
-- 5) (после 0024) каждый час в :05 — напоминание о витаминах тем, кто выбрал этот час в «Моей странице».
select cron.schedule('mother-pills-hourly', '5 * * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"pills"}'::jsonb)
$$);
-- 6) (после 0026) каждый день в 08:25 по Ташкенту (03:25 UTC) — дежурному роддома: женщины высокого риска, которым исполнилось 36 недель.
select cron.schedule('duty-hr36-0825', '25 3 * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"duty36"}'::jsonb)
$$);
-- 7) (после 0028) каждый день в 09:41 по Ташкенту (04:41 UTC) — прививки ребёнку по календарю (копия — родственникам в боте).
select cron.schedule('mother-vacc-0941', '41 4 * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"vaccines"}'::jsonb)
$$);
-- 8) (после 0028) каждый день в 11:17 по Ташкенту (06:17 UTC) — анонимный опрос на 10–20-й день после родов (один раз).
select cron.schedule('mother-survey-1117', '17 6 * * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"survey"}'::jsonb)
$$);
-- 9) (после 0028) 1-го числа в 09:07 по Ташкенту (04:07 UTC) — итоги прошлого месяца тем, кому администратор отметил «Ежемесячный отчёт».
select cron.schedule('month-digest-1st', '7 4 1 * *', $$
  select net.http_post(url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"action":"mother_remind","mode":"month"}'::jsonb)
$$);
