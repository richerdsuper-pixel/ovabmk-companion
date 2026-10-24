-- Расписание (выполняется один раз на живой базе, это не миграция: расширения и расписание есть только в Supabase).
-- 08:00 по Ташкенту (UTC+5, без перехода на летнее время) = 03:00 UTC.
--   * ежедневная сводка по беременным в Telegram — по будням;
--   * удаление закрытых наблюдений старше 12 месяцев — каждую ночь.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('anc-digest-0800', '0 3 * * 1-5', $job$
  select net.http_post(
    url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/anc-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
    body := '{}'::jsonb);
$job$);
select cron.schedule('anc-purge-closed', '10 3 * * *', $job$ select private.purge_closed_pregnancies(); $job$);
