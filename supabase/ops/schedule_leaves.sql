-- Выполняется один раз на живой базе после миграции 0015: каждый будний день в 09:00 по Ташкенту (04:00 UTC)
-- проверяются заявки на отпуск, не рассмотренные 2 рабочих дня (функция leave-escalate).
select cron.schedule('leave-escalate-0900', '0 4 * * 1-5', $$
  select net.http_post(
    url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/leave-escalate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{}'::jsonb)
$$);
