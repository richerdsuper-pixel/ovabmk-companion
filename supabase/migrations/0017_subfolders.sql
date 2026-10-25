-- Подпапки (разделы) внутри 20 папок-дел: куда что сдаётся, кто сдаёт, как часто, нужен ли бумажный оригинал.
-- Названия подпапок — узбекский (латиница) и русский; узбекской кириллицы здесь нет намеренно.
-- storage:  site    — файл загружается на сайт (документы без данных пациентов);
--           numbers — сам список с ФИО остаётся на бумаге/в офлайн-программе, на сайт — только число и отметка «сдано»;
--           offline — на сайт ничего не загружается, только отметка «сдано на бумаге».
-- Цикл сдачи обозначается датой срока (period_key = 'YYYY-MM-DD'), для однократных — 'once'.

create table public.subfolders (
  id        text primary key check (id ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  folder_id int  not null references public.folders (id),
  no        int  not null check (no between 1 and 99),
  title_uz  text not null check (length(btrim(title_uz)) between 1 and 300),
  title_ru  text not null check (length(btrim(title_ru)) between 1 and 300),
  storage   text not null check (storage in ('site', 'numbers', 'offline')),
  positions text[] not null default '{}' check (array_length(positions, 1) is null or array_length(positions, 1) <= 10),
  period    text not null check (period in ('once', 'month', 'quarter', 'year', 'incoming', 'case')),
  paper     boolean not null default true,
  note_ru   text not null default '' check (length(note_ru) <= 300),
  unique (folder_id, no),
  check (id = folder_id::text || '.' || no::text)
);
alter table public.subfolders enable row level security;
create policy subfolders_read on public.subfolders for select to authenticated
  using (private.can_access_folder(auth.uid(), folder_id));
revoke insert, update, delete on public.subfolders from anon, authenticated;

-- Документ можно положить в подпапку той же папки и только если подпапка принимает файлы (storage = site).
alter table public.documents add column subfolder_id text references public.subfolders (id);
alter table public.documents add column period_key text check (period_key is null or period_key = 'once' or period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
create index documents_sub_idx on public.documents (subfolder_id, period_key);

create or replace function private.trg_documents_subfolder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare _s public.subfolders;
begin
  if new.subfolder_id is null then new.period_key := null; return new; end if;
  select * into _s from public.subfolders s where s.id = new.subfolder_id;
  if _s.id is null or _s.folder_id <> new.folder_id then raise exception 'subfolder_mismatch' using errcode = '22023'; end if;
  if _s.storage <> 'site' then raise exception 'subfolder_no_files' using errcode = '22023'; end if;
  if _s.period in ('incoming', 'case') then new.period_key := null;
  elsif _s.period = 'once' then new.period_key := 'once';
  elsif new.period_key is null or new.period_key = 'once' then raise exception 'period_required' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger documents_subfolder before insert or update of subfolder_id, period_key, folder_id on public.documents
  for each row execute function private.trg_documents_subfolder();

-- Отметки о сдаче: одна строка на подпапку × цикл × сотрудника. Только число — текста нет, поэтому данные пациентов сюда не попадут.
create table public.subfolder_marks (
  subfolder_id text not null references public.subfolders (id),
  period_key   text not null check (period_key = 'once' or period_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  user_id      uuid not null references auth.users (id),
  value        int  check (value between 0 and 1000000),
  submitted_at timestamptz,
  paper_at     timestamptz,
  paper_by     uuid references auth.users (id),
  primary key (subfolder_id, period_key, user_id)
);
alter table public.subfolder_marks enable row level security;
create policy marks_read on public.subfolder_marks for select to authenticated
  using ((user_id = auth.uid() or private.is_manager(auth.uid()))
         and private.can_access_folder(auth.uid(), (select s.folder_id from public.subfolders s where s.id = subfolder_id)));
revoke insert, update, delete on public.subfolder_marks from anon, authenticated;

-- Сотрудник отмечает сдачу (число — для подпапок «только цифры»; для «только бумага» число не нужно).
create or replace function public.subfolder_report(_sub text, _period text, _value int)
returns void language plpgsql security definer set search_path = '' as $$
declare _s public.subfolders; _uid uuid := auth.uid();
begin
  select * into _s from public.subfolders s where s.id = _sub;
  if _s.id is null or not private.can_access_folder(_uid, _s.folder_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _s.storage = 'site' then raise exception 'subfolder_use_upload' using errcode = '22023'; end if;
  if _s.period = 'once' then _period := 'once';
  elsif _period is null or _period !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'period_required' using errcode = '22023';
  end if;
  if _s.storage = 'numbers' and _value is null then raise exception 'value_required' using errcode = '22023'; end if;
  insert into public.subfolder_marks (subfolder_id, period_key, user_id, value, submitted_at)
  values (_sub, _period, _uid, _value, now())
  on conflict (subfolder_id, period_key, user_id) do update set value = excluded.value, submitted_at = now();
  perform private.log_event('subfolder_report', _sub, jsonb_build_object('period', _period, 'value', _value));
end $$;

-- Сотрудник отменяет свою отметку (если ошибся), пока бумажный оригинал не принят.
create or replace function public.subfolder_unreport(_sub text, _period text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.subfolder_marks set submitted_at = null, value = null
  where subfolder_id = _sub and period_key = _period and user_id = auth.uid() and paper_at is null;
  delete from public.subfolder_marks where subfolder_id = _sub and period_key = _period and user_id = auth.uid()
    and submitted_at is null and paper_at is null;
end $$;

-- Руководитель (администратор или заместитель) отмечает: бумажный оригинал с подписью и печатью получен.
create or replace function public.subfolder_paper(_sub text, _period text, _user uuid, _on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare _s public.subfolders; _uid uuid := auth.uid();
begin
  if not (private.has_role(_uid, 'admin') or private.has_role(_uid, 'deputy')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into _s from public.subfolders s where s.id = _sub;
  if _s.id is null or not private.can_access_folder(_uid, _s.folder_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _period is null or (_period <> 'once' and _period !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'period_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = _user and p.removed_at is null) then raise exception 'bad_user' using errcode = '22023'; end if;
  if _on then
    insert into public.subfolder_marks (subfolder_id, period_key, user_id, paper_at, paper_by)
    values (_sub, _period, _user, now(), _uid)
    on conflict (subfolder_id, period_key, user_id) do update set paper_at = now(), paper_by = _uid;
  else
    update public.subfolder_marks set paper_at = null, paper_by = null where subfolder_id = _sub and period_key = _period and user_id = _user;
    delete from public.subfolder_marks where subfolder_id = _sub and period_key = _period and user_id = _user and submitted_at is null and paper_at is null;
  end if;
  perform private.log_event(case when _on then 'paper_received' else 'paper_unmarked' end, _sub, jsonb_build_object('period', _period, 'user', _user));
end $$;

-- Администратор меняет настройки подпапки (распределение было черновиком).
create or replace function public.admin_set_subfolder(_id text, _storage text, _positions text[], _period text, _paper boolean, _note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if exists (select 1 from unnest(coalesce(_positions, '{}')) p where p !~ '^[a-z_]{1,40}$') then raise exception 'bad_position' using errcode = '22023'; end if;
  update public.subfolders set storage = _storage, positions = coalesce(_positions, '{}'), period = _period, paper = coalesce(_paper, true),
         note_ru = left(btrim(coalesce(_note, '')), 300)
  where id = _id;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  perform private.log_event('subfolder_settings', _id, jsonb_build_object('storage', _storage, 'positions', _positions, 'period', _period, 'paper', _paper));
end $$;

-- Администратор переносит уже загруженный документ в подпапку (или убирает из подпапки).
create or replace function public.admin_move_document(_doc uuid, _sub text, _period text)
returns void language plpgsql security definer set search_path = '' as $$
declare _f int;
begin
  perform private.require_admin();
  select d.folder_id into _f from public.documents d where d.id = _doc;
  if _f is null or not private.can_access_folder(auth.uid(), _f) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.documents set subfolder_id = nullif(_sub, ''), period_key = nullif(_period, '') where id = _doc;
  perform private.log_event('document_moved', _doc::text, jsonb_build_object('subfolder', _sub, 'period', _period));
end $$;

-- Кому напомнить в Telegram о подпапке: администратор передаёт список несдавших (его считает сайт),
-- база оставляет только тех, у кого есть доступ к папке и привязан Telegram.
create or replace function public.admin_subfolder_targets(_sub text, _users uuid[])
returns table (user_id uuid, telegram_id bigint, title text)
language plpgsql stable security definer set search_path = '' as $$
declare _s public.subfolders;
begin
  perform private.require_admin();
  select * into _s from public.subfolders s where s.id = _sub;
  if _s.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if coalesce(array_length(_users, 1), 0) > 500 then raise exception 'too_many' using errcode = '22023'; end if;
  return query
  select tl.user_id, tl.telegram_id, _s.id || ' ' || _s.title_ru
  from public.telegram_links tl join public.profiles p on p.id = tl.user_id
  where tl.user_id = any (coalesce(_users, '{}')) and p.removed_at is null and private.can_access_folder(tl.user_id, _s.folder_id);
end $$;

revoke execute on function public.subfolder_report(text, text, int), public.subfolder_unreport(text, text),
  public.subfolder_paper(text, text, uuid, boolean), public.admin_set_subfolder(text, text, text[], text, boolean, text),
  public.admin_move_document(uuid, text, text), public.admin_subfolder_targets(text, uuid[]) from public, anon;
grant execute on function public.subfolder_report(text, text, int), public.subfolder_unreport(text, text),
  public.subfolder_paper(text, text, uuid, boolean), public.admin_set_subfolder(text, text, text[], text, boolean, text),
  public.admin_move_document(uuid, text, text), public.admin_subfolder_targets(text, uuid[]) to authenticated;
