-- 0026: дежурный роддома. Администратор отмечает сотрудников («Сотрудники» → «Дежурный роддома»).
-- Им в Telegram приходят: тревожные сигналы беременных и родильниц со всего района (кроме одного только давления 140/90 —
-- его получает доя), и раз в день — список женщин высокого риска, которым исполнилось 36 недель (каждая — один раз).

create table public.duty_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  set_by  uuid references auth.users (id) on delete set null default auth.uid(),
  set_at  timestamptz not null default now()
);
alter table public.duty_staff enable row level security;
revoke all on public.duty_staff from public, anon, authenticated;

create table public.duty_notices (
  mother_id uuid not null references public.mothers (id) on delete cascade,
  kind      text not null check (kind in ('hr36')),
  sent_at   timestamptz not null default now(),
  primary key (mother_id, kind)
);
alter table public.duty_notices enable row level security;
revoke all on public.duty_notices from public, anon, authenticated;

-- Telegram дежурных: действующие сотрудники с привязанным Telegram
create or replace function private.duty_recipients()
returns bigint[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct tl.telegram_id), '{}')
  from public.duty_staff d join public.profiles p on p.id = d.user_id join public.telegram_links tl on tl.user_id = p.id
  where private.is_member(p.id) and p.removed_at is null;
$$;

-- ---------------------------------------------------------------- администратор
create or replace function public.admin_duty_list()
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select d.user_id from public.duty_staff d;
end $$;

create or replace function public.admin_set_duty(_uid uuid, _on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.profiles p where p.id = _uid and p.removed_at is null) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(_on, false) then
    insert into public.duty_staff (user_id) values (_uid) on conflict (user_id) do nothing;
  else
    delete from public.duty_staff where user_id = _uid;
  end if;
  insert into public.audit_log (actor, action, object, details) values (auth.uid(), 'duty_set', _uid::text, jsonb_build_object('on', coalesce(_on, false)));
end $$;

-- ---------------------------------------------------------------- тревожный сигнал: доя и руководители учреждения + дежурные роддома
create or replace function public.bot_mother_alert(_tg bigint, _signs text[])
returns table (telegram_id bigint, full_name text, mother_id uuid, mother_name text, mother_phone text, mahalla text, address text, status text)
language plpgsql security definer set search_path = '' as $$
declare g record; m record; _s text[]; _duty boolean;
begin
  select * into g from public.mother_tg mt where mt.telegram_id = _tg;
  if not found then return; end if;
  select * into m from public.mothers where id = g.mother_id;
  select coalesce(array_agg(left(x, 40)), '{}') into _s from unnest(coalesce(_signs, '{}')) x where x ~ '^[a-z_]{2,40}$';
  if array_length(_s, 1) is null then return; end if;
  if exists (select 1 from public.mother_alerts a where a.mother_id = m.id and a.signs = _s and a.created_at > now() - interval '10 minutes') then return; end if;
  insert into public.mother_alerts (mother_id, signs) values (m.id, _s);
  _duty := _s <> array['bp_high'];
  return query
  select distinct on (tl.telegram_id) tl.telegram_id, p.full_name, m.id, m.full_name, m.phone, (select x.name from public.mahallas x where x.id = m.mahalla_id), m.address, m.status
  from public.profiles p join public.telegram_links tl on tl.user_id = p.id
  where private.is_member(p.id) and p.removed_at is null and (
    (p.institution_id = m.institution_id and private.preg_staff(p.id))
    or exists (select 1 from public.scopes s where s.user_id = p.id and s.kind = 'institution' and s.institution_id = m.institution_id)
    or (_duty and exists (select 1 from public.duty_staff d where d.user_id = p.id)));
end $$;

-- ---------------------------------------------------------------- высокий риск, 36 недель: раз в день, каждая женщина один раз
-- Срок 36 нед 0 дн — 38 нед 6 дн (если сервер не работал в день 36 недель, сообщение придёт позже, но не после 39 недель).
-- Если дежурных нет — ничего не отмечается: список придёт, когда дежурного назначат.
create or replace function public.cron_duty_hr36(_secret text)
returns table (telegram_id bigint, mother_id uuid, mother_name text, mother_phone text, institution text, mahalla text, address text,
               ga_days int, edd date, risk_factors text[])
language plpgsql security definer set search_path = '' as $$
declare t date := private.today(); _r bigint[] := private.duty_recipients();
begin
  if _secret is null or not exists (select 1 from private.cron_secret c where c.secret = _secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  if array_length(_r, 1) is null then return; end if;
  create temporary table if not exists _hr36 (mid uuid) on commit drop;
  delete from _hr36;
  insert into _hr36
    select m.id from public.mothers m
    where m.status = 'pregnant' and m.risk = 'high' and t - coalesce(m.edd_us - 280, m.lmp) between 252 and 272
      and not exists (select 1 from public.duty_notices n where n.mother_id = m.id and n.kind = 'hr36');
  insert into public.duty_notices (mother_id, kind) select mid, 'hr36' from _hr36 on conflict do nothing;
  return query
  select r.tg, m.id, m.full_name, m.phone, i.name, (select x.name from public.mahallas x where x.id = m.mahalla_id), m.address,
         (t - coalesce(m.edd_us - 280, m.lmp))::int, coalesce(m.edd_us, m.lmp + 280), m.risk_factors
  from _hr36 h join public.mothers m on m.id = h.mid join public.institutions i on i.id = m.institution_id, unnest(_r) r(tg)
  order by r.tg, m.full_name;
end $$;

revoke all on function private.duty_recipients() from public, anon, authenticated;
revoke all on function public.admin_duty_list(), public.admin_set_duty(uuid, boolean), public.bot_mother_alert(bigint, text[]), public.cron_duty_hr36(text)
  from public, anon, authenticated;
grant execute on function public.admin_duty_list(), public.admin_set_duty(uuid, boolean) to authenticated;
grant execute on function public.bot_mother_alert(bigint, text[]), public.cron_duty_hr36(text) to service_role;
