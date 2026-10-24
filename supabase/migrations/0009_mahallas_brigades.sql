-- Махалли и бригады.
--  * mahallas — справочник махаллей; mahalla_links — какое учреждение (ОП/ОШП/филиал) обслуживает махаллю
--    (у одной махалли может быть два учреждения: Қораариқ, Лайлакхона);
--  * indicator_reports.mahalla_id — показатели можно вводить по махалле; один и тот же сотрудник/период может иметь отдельный отчёт по каждой махалле;
--  * brigade_posts — состав бригады махалли: ставки врача, патронажа и доя. Норма проверяется на сайте
--    (врач 1.0, патронаж 1.0, доя 0.5 — кабинет или патронаж).

create table public.mahallas (
  id         int generated always as identity primary key,
  name       text not null check (length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);
create unique index mahallas_name_uq on public.mahallas (lower(btrim(name)));

create table public.mahalla_links (
  mahalla_id     int not null references public.mahallas (id) on delete cascade,
  institution_id int not null references public.institutions (id) on delete cascade,
  primary key (mahalla_id, institution_id)
);
create index mahalla_links_inst_idx on public.mahalla_links (institution_id);

create table public.brigade_posts (
  id         bigint generated always as identity primary key,
  mahalla_id int not null references public.mahallas (id) on delete cascade,
  kind       text not null check (kind in ('doctor', 'patronage', 'doya_cab', 'doya_pat')),
  rate       numeric(3, 2) not null check (rate > 0 and rate <= 2),
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index brigade_posts_mahalla_idx on public.brigade_posts (mahalla_id);

alter table public.mahallas      enable row level security;
alter table public.mahalla_links enable row level security;
alter table public.brigade_posts enable row level security;
create policy mah_read   on public.mahallas      for select to authenticated using (private.is_member(auth.uid()));
create policy mahl_read  on public.mahalla_links for select to authenticated using (private.is_member(auth.uid()));
create policy brig_read  on public.brigade_posts for select to authenticated using (private.is_member(auth.uid()));
revoke all on public.mahallas, public.mahalla_links, public.brigade_posts from anon, authenticated;
grant select on public.mahallas, public.mahalla_links, public.brigade_posts to authenticated;

-- показатели по махалле
alter table public.indicator_reports add column mahalla_id int references public.mahallas (id) on delete set null;
do $$ declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.indicator_reports'::regclass and contype = 'u';
  if c is not null then execute format('alter table public.indicator_reports drop constraint %I', c); end if;
end $$;
create unique index indicator_reports_uq on public.indicator_reports
  (user_id, position_code, institution, period_end, coalesce(mahalla_id, 0));
create index indicator_reports_mahalla_idx on public.indicator_reports (mahalla_id, period_end desc);

-- ---------------------------------------------------------------- администратор
create or replace function public.admin_save_mahalla(_id int, _name text, _institutions int[] default '{}')
returns int language plpgsql security definer set search_path = '' as $$
declare _n text := left(btrim(coalesce(_name, '')), 120); _r int;
begin
  perform private.require_admin();
  if length(_n) < 2 then raise exception 'bad_name'; end if;
  if _id is null then
    insert into public.mahallas (name) values (_n) returning id into _r;
    perform private.log_event('mahalla_added', _r::text, jsonb_build_object('name', _n));
  else
    update public.mahallas set name = _n where id = _id returning id into _r;
    if _r is null then raise exception 'no_such_mahalla'; end if;
    perform private.log_event('mahalla_changed', _r::text, jsonb_build_object('name', _n));
  end if;
  delete from public.mahalla_links where mahalla_id = _r;
  insert into public.mahalla_links (mahalla_id, institution_id)
    select _r, i.id from public.institutions i where i.id = any (coalesce(_institutions, '{}'));
  return _r;
exception when unique_violation then raise exception 'mahalla_exists';
end $$;

create or replace function public.admin_delete_mahalla(_id int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  -- махалля с отчётами не удаляется (её можно переименовать): иначе отчёты потеряли бы привязку и могли бы столкнуться друг с другом
  if exists (select 1 from public.indicator_reports where mahalla_id = _id) then raise exception 'mahalla_has_reports'; end if;
  delete from public.mahallas where id = _id;
  perform private.log_event('mahalla_deleted', _id::text, '{}'::jsonb);
end $$;

-- заменить состав бригады махалли: _posts = [{"kind":"doctor","rate":1,"user_id":"…"|null}, …]
create or replace function public.admin_set_brigade(_mahalla int, _posts jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p jsonb; n int := 0;
begin
  perform private.require_admin();
  if not exists (select 1 from public.mahallas where id = _mahalla) then raise exception 'no_such_mahalla'; end if;
  if jsonb_typeof(coalesce(_posts, '[]'::jsonb)) <> 'array' then raise exception 'bad_posts'; end if;
  delete from public.brigade_posts where mahalla_id = _mahalla;
  for p in select * from jsonb_array_elements(coalesce(_posts, '[]'::jsonb)) loop
    n := n + 1;
    if n > 20 or jsonb_typeof(p) <> 'object' then raise exception 'bad_posts'; end if;
    if (p ->> 'kind') not in ('doctor', 'patronage', 'doya_cab', 'doya_pat') then raise exception 'bad_posts'; end if;
    if coalesce((p ->> 'rate')::numeric, 0) <= 0 or (p ->> 'rate')::numeric > 2 then raise exception 'bad_posts'; end if;
    insert into public.brigade_posts (mahalla_id, kind, rate, user_id)
    values (_mahalla, p ->> 'kind', (p ->> 'rate')::numeric,
            (select pr.id from public.profiles pr where pr.id = nullif(p ->> 'user_id', '')::uuid and pr.removed_at is null));
  end loop;
  perform private.log_event('brigade_set', _mahalla::text, jsonb_build_object('posts', n));
end $$;

revoke execute on all functions in schema private from public;
revoke execute on function public.admin_save_mahalla(int, text, int[]), public.admin_delete_mahalla(int),
                           public.admin_set_brigade(int, jsonb) from public, anon;
grant execute on function public.admin_save_mahalla(int, text, int[]), public.admin_delete_mahalla(int),
                          public.admin_set_brigade(int, jsonb) to authenticated;
