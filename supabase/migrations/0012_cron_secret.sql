-- Секрет для планировщика ежедневной сводки: хранится в закрытой таблице схемы private (RLS без политик), создаётся случайно прямо в базе.
-- Edge Function anc-digest получает его в заголовке x-cron-secret от pg_cron и передаёт в cron_anc_digest(_secret), которая сверяет его с таблицей.
-- Так секрет не нужно переносить в настройки функции и он нигде не выводится.
create table private.cron_secret (
  id     boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32)
);
alter table private.cron_secret enable row level security;
revoke all on private.cron_secret from public, anon, authenticated;
insert into private.cron_secret (secret) values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

drop function public.cron_anc_digest();
create or replace function public.cron_anc_digest(_secret text)
returns table (user_id uuid, telegram_id bigint, due int, overdue int, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select d.user_id, d.telegram_id, d.due, d.overdue, false from private.anc_digest_rows() d where d.user_id is not null
  union all
  select r.user_id, tl.telegram_id, (select d.due from private.anc_digest_rows() d where d.user_id is null), (select d.overdue from private.anc_digest_rows() d where d.user_id is null), true
  from public.user_roles r join public.telegram_links tl on tl.user_id = r.user_id where r.role = 'admin';
end $$;
revoke execute on function public.cron_anc_digest(text) from public, anon, authenticated;
grant execute on function public.cron_anc_digest(text) to service_role;
