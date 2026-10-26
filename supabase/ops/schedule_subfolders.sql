-- Выполняется один раз на живой базе после миграции 0019.
-- Каждый день в 09:07 по Ташкенту (04:07 UTC) — напоминания сотрудникам; по понедельникам в 09:12 — сводка администраторам.
select cron.schedule('sub-remind-daily', '7 4 * * *', $$
  select net.http_post(
    url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/sub-remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"mode":"daily"}'::jsonb)
$$);
select cron.schedule('sub-remind-weekly', '12 4 * * 1', $$
  select net.http_post(
    url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/sub-remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{"mode":"weekly"}'::jsonb)
$$);
