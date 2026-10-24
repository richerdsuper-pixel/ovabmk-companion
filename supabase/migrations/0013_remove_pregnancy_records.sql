-- 0013: на сервере больше не хранятся записи о беременных.
-- Остаётся только справочник окон визитов (anc_schedule) для страницы «Помощник по стандарту»:
-- срок считается в браузере, дата последней менструации никуда не отправляется.
-- Отслеживание конкретных пациенток — только на устройстве, в офлайн-программе.

-- расписание рассылок снимается заранее, чтобы задания не вызывали уже удалённые функции
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('anc-digest-0800', 'anc-purge-closed');
  end if;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in ('add_pregnancy', 'edit_pregnancy', 'close_pregnancy', 'delete_pregnancy',
              'record_anc_visit', 'remove_anc_visit', 'list_pregnancies', 'admin_anc_digest', 'cron_anc_digest'))
        or (n.nspname = 'private' and p.proname in ('anc_digest_rows', 'purge_closed_pregnancies', 'can_see_preg'))
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

drop table if exists public.pregnancy_visits;
drop table if exists public.pregnancies;
drop table if exists private.cron_secret;
