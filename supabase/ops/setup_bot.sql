-- Выполняется один раз после развёртывания функции tg-bot: Telegram начинает присылать сообщения бота в эту функцию.
-- Проверить: тот же запрос с body := '{"action":"setup","info":true}' и посмотреть ответ в net._http_response.
select net.http_post(
  url := 'https://hisbflzmobndjbtmntjg.supabase.co/functions/v1/tg-bot',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret)),
  body := '{"action":"setup"}'::jsonb);
