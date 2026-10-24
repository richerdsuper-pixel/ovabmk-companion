-- Показатели по должностям: ТОЛЬКО ЧИСЛА за период (без текстовых полей, без данных пациентов).
-- Сотрудник вводит и правит свои отчёты; руководители (admin, deputy, chief_physician) видят все.
-- Какие показатели есть у должности — в docs/indicators.js; база проверяет только форму: ключи i1…i99, значения — числа.

create table public.indicator_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position_code text not null check (position_code ~ '^[a-z_]{1,40}$'),
  institution   text not null check (length(btrim(institution)) between 2 and 200),
  period_start  date not null,
  period_end    date not null,
  vals          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 100),
  check (period_end <= (now() at time zone 'utc')::date + 31),
  unique (user_id, position_code, institution, period_end)
);
create index indicator_reports_pos_idx on public.indicator_reports (position_code, period_end desc);

-- форма значений: объект, не более 99 ключей вида i<номер>, значения — числа в разумных пределах
create or replace function private.check_indicator_vals()
returns trigger language plpgsql set search_path = '' as $$
declare k text; v jsonb; n int := 0;
begin
  if jsonb_typeof(new.vals) <> 'object' then raise exception 'bad_values'; end if;
  for k, v in select * from jsonb_each(new.vals) loop
    n := n + 1;
    if k !~ '^i[1-9][0-9]?$' or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between -1000000000 and 1000000000 then
      raise exception 'bad_values';
    end if;
  end loop;
  if n > 99 then raise exception 'bad_values'; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.created_at := old.created_at;      -- автора и дату создания менять нельзя
  end if;
  return new;
end $$;
create trigger indicator_reports_check before insert or update on public.indicator_reports
  for each row execute function private.check_indicator_vals();

create or replace function private.trg_indicators_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, object, details)
  values (auth.uid(), case tg_op when 'INSERT' then 'indicators_added' when 'UPDATE' then 'indicators_changed' else 'indicators_deleted' end,
          coalesce(new.id, old.id)::text,
          jsonb_build_object('position', coalesce(new.position_code, old.position_code), 'period_end', coalesce(new.period_end, old.period_end)));
  return coalesce(new, old);
end $$;
create trigger indicator_reports_audit after insert or update or delete on public.indicator_reports
  for each row execute function private.trg_indicators_audit();

alter table public.indicator_reports enable row level security;
create policy ind_read on public.indicator_reports for select to authenticated
  using (user_id = auth.uid() or private.is_manager(auth.uid()));
create policy ind_insert on public.indicator_reports for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(auth.uid()));
create policy ind_update on public.indicator_reports for update to authenticated
  using (user_id = auth.uid() and private.is_member(auth.uid()))
  with check (user_id = auth.uid() and private.is_member(auth.uid()));
create policy ind_delete on public.indicator_reports for delete to authenticated
  using ((user_id = auth.uid() and private.is_member(auth.uid())) or private.has_role(auth.uid(), 'admin'));

revoke all on public.indicator_reports from anon, authenticated;
grant select, insert, update, delete on public.indicator_reports to authenticated;
revoke execute on all functions in schema private from public;
