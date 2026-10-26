-- Автонапоминания по подпапкам (Telegram, раз в день в 09:00 по Ташкенту):
--   «before»  — за 2 дня до срока, если ещё не сдано;
--   «overdue» — после срока (один раз, в течение недели после срока), если не сдано.
-- Еженедельно (понедельник) администраторам — сводка несданного к прошедшим срокам.
-- Кто должен сдавать: должность в профиле (по названию) + папка открыта (или руководитель); заместитель/администратор — «orinbosar».
-- Сотрудникам в утверждённом отпуске напоминания не отправляются. Сроки считаются с 1 ноября 2026 г. (как на сайте).
-- В сообщениях только номер и название подпапки и срок — никаких данных пациентов.

-- Названия должностей → коды (как в docs/positions.js; при изменении списка должностей обновить и здесь).
create table private.position_names (code text primary key check (code ~ '^[a-z_]{1,40}$'), ru text not null unique);
alter table private.position_names enable row level security;
revoke all on private.position_names from public, anon, authenticated;
insert into private.position_names (code, ru) values
('doya_qvp', 'Акушерка СВП (кабинет доя)'),
('akusher_ginekolog', 'Врач акушер-гинеколог'),
('oilaviy_shifokor', 'Семейный врач (СВП)'),
('patronaj_hamshira', 'Патронажная медсестра'),
('pediatr', 'Врач-педиатр'),
('neonatolog', 'Врач-неонатолог'),
('bolalar_ginekologi', 'Детский гинеколог'),
('emlash_xonasi', 'Медсестра прививочного кабинета'),
('maktab_mtm_hamshira', 'Медсестра школы / ДДУ'),
('skrining_markazi', 'Скрининг-центр'),
('akusherlik_kompleksi', 'Акушерский комплекс (роддом)'),
('reproduktiv_markaz', 'Репродуктивный центр'),
('bosh_akusher', 'Главный акушер-гинеколог'),
('bosh_pediatr', 'Главный педиатр'),
('bosh_terapevt', 'Главный терапевт'),
('statistik', 'Статистик'),
('kadrlar', 'Отдел кадров'),
('ombor_dorixona', 'Склад / аптека'),
('arxiv', 'Медицинский архив'),
('onalar_olimi', 'Бригада по материнской смертности'),
('dsenm', 'ДСЭНМ (санэпиднадзор)'),
('maorif', 'Отдел образования (Маориф)'),
('nikoh', 'ЗАГС (Никоҳ бўлими)'),
('adliya', 'Юстиция (Адлия)'),
('soglom_avlod', 'Фонд «Соғлом авлод учун»'),
('ijtimoiy_himoya', 'Социальная защита'),
('bosh_vrach', 'Главный врач'),
('orinbosar', 'Заместитель главного врача')
on conflict (code) do update set ru = excluded.ru;

create table private.subfolder_reminders (
  subfolder_id text not null references public.subfolders (id) on delete cascade,
  period_key   text not null,
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('before', 'overdue')),
  sent_at      timestamptz not null default now(),
  primary key (subfolder_id, period_key, user_id, kind)
);
alter table private.subfolder_reminders enable row level security;
revoke all on private.subfolder_reminders from public, anon, authenticated;

-- Сроки периодической подпапки между двумя датами: ежемесячно 5-го, ежеквартально 10-го (янв/апр/июл/окт), ежегодно 15 января.
create or replace function private.sub_dues(_period text, _from date, _to date)
returns setof date language sql immutable set search_path = '' as $$
  select d from (
    select case _period
             when 'month'   then make_date(extract(year from m)::int, extract(month from m)::int, 5)
             when 'quarter' then case when extract(month from m)::int in (1, 4, 7, 10) then make_date(extract(year from m)::int, extract(month from m)::int, 10) end
             when 'year'    then case when extract(month from m)::int = 1 then make_date(extract(year from m)::int, 1, 15) end
           end as d
    from generate_series(date_trunc('month', _from)::date, _to, interval '1 month') g(m)
  ) x where d is not null and d between _from and _to;
$$;

-- Коды должностей сотрудника.
create or replace function private.user_pos_codes(_uid uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}') from (
    select n.code c from public.profiles p join private.position_names n on n.ru = btrim(p.position) where p.id = _uid
    union all
    select 'orinbosar' where exists (select 1 from public.user_roles r where r.user_id = _uid and r.role in ('admin', 'deputy'))
  ) x;
$$;

-- Кто должен сдавать подпапку (действующие сотрудники с ролью).
create or replace function private.sub_expected()
returns table (subfolder_id text, user_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.id, p.id
  from public.subfolders s
  join public.folders f on f.id = s.folder_id and not f.restricted
  cross join public.profiles p
  where p.removed_at is null
    and exists (select 1 from public.user_roles r where r.user_id = p.id)
    and s.positions && private.user_pos_codes(p.id)
    and (private.is_manager(p.id) or exists (select 1 from public.folder_members m where m.folder_id = s.folder_id and m.user_id = p.id));
$$;

create or replace function private.sub_done(_sub text, _period text, _uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.documents d where d.subfolder_id = _sub and d.period_key = _period and d.uploaded_by = _uid)
      or exists (select 1 from public.subfolder_marks m where m.subfolder_id = _sub and m.period_key = _period and m.user_id = _uid
                 and (m.submitted_at is not null or m.paper_at is not null));
$$;

create or replace function private.on_leave(_uid uuid, _day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leaves l where l.user_id = _uid and l.status = 'approved' and _day between l.date_from and l.date_to);
$$;

-- Ежедневно: кому что напомнить. Каждое напоминание отправляется один раз (отметка в private.subfolder_reminders).
-- _today — только для проверок; по умолчанию сегодняшняя дата в Ташкенте.
create or replace function public.cron_subfolder_reminders(_secret text, _today date default null)
returns table (user_id uuid, telegram_id bigint, kind text, subfolder_id text, title_ru text, title_uz text, due date)
language plpgsql security definer set search_path = '' as $$
declare _d date := coalesce(_today, (now() at time zone 'Asia/Tashkent')::date);
        _start constant date := date '2026-11-01';
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with cand as (
    select e.subfolder_id sid, e.user_id uid, x.due, case when x.due > _d then 'before' else 'overdue' end k
    from private.sub_expected() e
    join public.subfolders s on s.id = e.subfolder_id and s.period in ('month', 'quarter', 'year')
    cross join lateral private.sub_dues(s.period, greatest(_start, _d - 7), _d + 2) x(due)
    where (x.due between _d + 1 and _d + 2 or x.due between _d - 7 and _d - 1)
      and not private.sub_done(e.subfolder_id, x.due::text, e.user_id)
      and not private.on_leave(e.user_id, _d)
  ), ins as (
    insert into private.subfolder_reminders (subfolder_id, period_key, user_id, kind)
    select c.sid, c.due::text, c.uid, c.k from cand c
    where exists (select 1 from public.telegram_links tl where tl.user_id = c.uid)
    on conflict do nothing
    returning subfolder_reminders.subfolder_id, subfolder_reminders.period_key, subfolder_reminders.user_id, subfolder_reminders.kind
  )
  select i.user_id, tl.telegram_id, i.kind, i.subfolder_id, s.title_ru, s.title_uz, i.period_key::date
  from ins i join public.telegram_links tl on tl.user_id = i.user_id join public.subfolders s on s.id = i.subfolder_id
  order by i.user_id, s.folder_id, s.no;
end $$;

-- Еженедельно: сводка администраторам — по каждой подпапке последний прошедший срок и сколько не сдали.
create or replace function public.cron_subfolder_digest(_secret text, _today date default null)
returns table (admin_id uuid, telegram_id bigint, subfolder_id text, title_ru text, due date, missing int, expected int)
language plpgsql security definer set search_path = '' as $$
declare _d date := coalesce(_today, (now() at time zone 'Asia/Tashkent')::date);
        _start constant date := date '2026-11-01';
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with last as (
    select s.id sid, s.title_ru t, s.folder_id f, s.no n,
           (select max(x) from private.sub_dues(s.period, greatest(_start, _d - 400), _d - 1) x) due
    from public.subfolders s join public.folders fo on fo.id = s.folder_id and not fo.restricted
    where s.period in ('month', 'quarter', 'year')
  ), cnt as (
    select l.sid, l.t, l.f, l.n, l.due, count(*)::int exp,
           count(*) filter (where not private.sub_done(l.sid, l.due::text, e.user_id))::int miss
    from last l join private.sub_expected() e on e.subfolder_id = l.sid
    where l.due is not null
    group by l.sid, l.t, l.f, l.n, l.due
  )
  select r.user_id, tl.telegram_id, c.sid, c.t, c.due, c.miss, c.exp
  from cnt c
  cross join public.user_roles r join public.telegram_links tl on tl.user_id = r.user_id
  where r.role = 'admin' and c.miss > 0
  order by r.user_id, c.miss desc, c.f, c.n;
end $$;

-- Для сайта: последние автонапоминания (руководители видят, кому бот уже писал).
create or replace function public.subfolder_reminder_log(_sub text)
returns table (period_key text, user_id uuid, kind text, sent_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_manager(auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select r.period_key, r.user_id, r.kind, r.sent_at from private.subfolder_reminders r
    where r.subfolder_id = _sub and r.sent_at > now() - interval '120 days' order by r.sent_at desc;
end $$;

revoke execute on function public.cron_subfolder_reminders(text, date), public.cron_subfolder_digest(text, date) from public, anon, authenticated;
grant execute on function public.cron_subfolder_reminders(text, date), public.cron_subfolder_digest(text, date) to service_role;
revoke execute on function public.subfolder_reminder_log(text) from public, anon;
grant execute on function public.subfolder_reminder_log(text) to authenticated;
revoke execute on function private.sub_dues(text, date, date), private.user_pos_codes(uuid), private.sub_expected(),
  private.sub_done(text, text, uuid), private.on_leave(uuid, date) from public, anon, authenticated;
