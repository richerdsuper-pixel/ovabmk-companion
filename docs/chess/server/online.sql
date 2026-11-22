-- «Шахматы царств»: онлайн-игра с другом по коду комнаты.
-- Применить в Supabase: проект kingdoms-chess → SQL Editor → вставить весь файл → Run.
-- Аккаунтов нет: у каждого игрока случайный секрет, его проверяет только сервер.
-- Комнаты можно читать, а менять — только через функции ниже.

create table public.rooms (
  code         text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  armies       jsonb not null,
  back_rank    text not null default 'rnbqkbnr' check (back_rank ~ '^[kqrbn]{8}$'),
  clock_ms     integer check (clock_ms is null or clock_ms between 60000 and 3600000),
  host_color   char(1) not null check (host_color in ('w', 'b')),
  joined       boolean not null default false,
  moves        text[] not null default '{}',
  clocks       jsonb,
  turn_started timestamptz,
  draw_offer   char(1) check (draw_offer in ('w', 'b')),
  result       jsonb,
  chat         jsonb not null default '[]',
  next_code    text
);

create table public.room_secrets (
  code     text primary key references public.rooms(code) on delete cascade,
  secret_w text not null,
  secret_b text
);

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;

create policy "rooms are readable by anyone with the code"
  on public.rooms for select to anon, authenticated using (true);

revoke insert, update, delete on public.rooms from anon, authenticated;
revoke all on public.room_secrets from anon, authenticated;

alter publication supabase_realtime add table public.rooms;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.player_color(p_code text, p_secret text)
returns char(1) language sql stable security definer set search_path = '' as $$
  select case when s.secret_w = p_secret then 'w' when s.secret_b = p_secret then 'b' end
  from public.room_secrets s where s.code = p_code and length(p_secret) >= 32;
$$;

create or replace function private.new_room(p_armies jsonb, p_back_rank text, p_clock_ms integer, p_host_color text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_secret text := encode(extensions.gen_random_bytes(24), 'hex');
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_tries int := 0;
begin
  if p_host_color not in ('w', 'b') then raise exception 'bad colour'; end if;
  if jsonb_typeof(p_armies->'w') <> 'string' or jsonb_typeof(p_armies->'b') <> 'string' then raise exception 'bad armies'; end if;
  delete from public.rooms where updated_at < now() - interval '7 days';
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 20 then raise exception 'no free code'; end if;
  end loop;
  insert into public.rooms (code, armies, back_rank, clock_ms, host_color, clocks)
  values (v_code, jsonb_build_object('w', left(p_armies->>'w', 20), 'b', left(p_armies->>'b', 20)), coalesce(p_back_rank, 'rnbqkbnr'), p_clock_ms, p_host_color,
          case when p_clock_ms is null then null else jsonb_build_object('w', p_clock_ms, 'b', p_clock_ms) end);
  if p_host_color = 'w' then
    insert into public.room_secrets (code, secret_w) values (v_code, v_secret);
  else
    insert into public.room_secrets (code, secret_w, secret_b) values (v_code, encode(extensions.gen_random_bytes(24), 'hex'), v_secret);
  end if;
  return jsonb_build_object('code', v_code, 'secret', v_secret, 'color', p_host_color);
end $$;

create or replace function public.create_room(p_armies jsonb, p_back_rank text, p_clock_ms integer, p_host_color text)
returns jsonb language sql security definer set search_path = '' as $$
  select private.new_room(p_armies, p_back_rank, p_clock_ms, p_host_color);
$$;

create or replace function public.join_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  v_secret text := encode(extensions.gen_random_bytes(24), 'hex');
  v_color char(1);
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then raise exception 'room not found'; end if;
  if r.joined then raise exception 'room is full'; end if;
  v_color := case when r.host_color = 'w' then 'b' else 'w' end;
  if v_color = 'b' then
    update public.room_secrets set secret_b = v_secret where code = r.code;
  else
    update public.room_secrets set secret_w = v_secret where code = r.code;
  end if;
  update public.rooms set joined = true, updated_at = now() where code = r.code;
  return jsonb_build_object('code', r.code, 'secret', v_secret, 'color', v_color);
end $$;

create or replace function public.play_move(p_code text, p_secret text, p_ply integer, p_uci text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  v_color char(1) := private.player_color(upper(p_code), p_secret);
  v_turn char(1);
  v_left bigint;
  v_clocks jsonb;
begin
  if v_color is null then raise exception 'not a player'; end if;
  if p_uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then raise exception 'bad move'; end if;
  select * into r from public.rooms where code = upper(p_code) for update;
  if not r.joined then raise exception 'waiting for opponent'; end if;
  if r.result is not null then raise exception 'game over'; end if;
  if coalesce(array_length(r.moves, 1), 0) <> p_ply then raise exception 'out of sync'; end if;
  v_turn := case when p_ply % 2 = 0 then 'w' else 'b' end;
  if v_turn <> v_color then raise exception 'not your turn'; end if;
  v_clocks := r.clocks;
  if r.clock_ms is not null and p_ply >= 1 then
    v_left := (r.clocks->>v_color)::bigint - floor(extract(epoch from (now() - r.turn_started)) * 1000)::bigint;
    if v_left <= 0 then
      update public.rooms set clocks = jsonb_set(r.clocks, array[v_color::text], '0'::jsonb),
        result = jsonb_build_object('winner', case when v_color = 'w' then 'b' else 'w' end, 'reason', 'time'),
        updated_at = now() where code = r.code;
      return jsonb_build_object('ok', false, 'reason', 'time');
    end if;
    v_clocks := jsonb_set(r.clocks, array[v_color::text], to_jsonb(v_left));
  end if;
  update public.rooms set moves = array_append(r.moves, p_uci), clocks = v_clocks, turn_started = now(),
    draw_offer = null, updated_at = now() where code = r.code;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.end_game(p_code text, p_secret text, p_reason text, p_winner text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  v_color char(1) := private.player_color(upper(p_code), p_secret);
  v_other char(1);
  v_turn char(1);
  v_left bigint;
begin
  if v_color is null then raise exception 'not a player'; end if;
  select * into r from public.rooms where code = upper(p_code) for update;
  if r.result is not null then return jsonb_build_object('ok', false); end if;
  v_other := case when v_color = 'w' then 'b' else 'w' end;
  if p_reason = 'resign' then
    update public.rooms set result = jsonb_build_object('winner', v_other, 'reason', 'resign'), updated_at = now() where code = r.code;
  elsif p_reason = 'draw_offer' then
    if r.draw_offer = v_other then
      update public.rooms set result = jsonb_build_object('winner', null, 'reason', 'agreed'), draw_offer = null, updated_at = now() where code = r.code;
    else
      update public.rooms set draw_offer = v_color, updated_at = now() where code = r.code;
    end if;
  elsif p_reason = 'draw_decline' then
    update public.rooms set draw_offer = null, updated_at = now() where code = r.code and draw_offer = v_other;
  elsif p_reason = 'time' then
    if r.clock_ms is null or coalesce(array_length(r.moves, 1), 0) < 1 then raise exception 'no clock'; end if;
    v_turn := case when coalesce(array_length(r.moves, 1), 0) % 2 = 0 then 'w' else 'b' end;
    v_left := (r.clocks->>v_turn)::bigint - floor(extract(epoch from (now() - r.turn_started)) * 1000)::bigint;
    if v_left > 0 then return jsonb_build_object('ok', false, 'left', v_left); end if;
    update public.rooms set clocks = jsonb_set(r.clocks, array[v_turn::text], '0'::jsonb),
      result = jsonb_build_object('winner', case when v_turn = 'w' then 'b' else 'w' end, 'reason', 'time'), updated_at = now() where code = r.code;
  elsif p_reason in ('mate', 'stalemate', 'fifty', 'repetition', 'material') then
    if p_reason = 'mate' and coalesce(p_winner, '') not in ('w', 'b') then raise exception 'bad winner'; end if;
    update public.rooms set result = jsonb_build_object('winner', case when p_reason = 'mate' then p_winner end, 'reason', p_reason), updated_at = now() where code = r.code;
  else
    raise exception 'bad reason';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.send_chat(p_code text, p_secret text, p_phrase integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_color char(1) := private.player_color(upper(p_code), p_secret);
begin
  if v_color is null then raise exception 'not a player'; end if;
  if p_phrase < 0 or p_phrase > 20 then raise exception 'bad phrase'; end if;
  update public.rooms
    set chat = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                  select x from jsonb_array_elements(chat || jsonb_build_array(jsonb_build_object('c', v_color, 'p', p_phrase, 't', floor(extract(epoch from now()) * 1000)))) x
                  offset greatest(jsonb_array_length(chat) + 1 - 30, 0)) q),
        updated_at = now()
    where code = upper(p_code);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.rematch(p_code text, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  s public.room_secrets;
  v_color char(1) := private.player_color(upper(p_code), p_secret);
  v_new jsonb;
begin
  if v_color is null then raise exception 'not a player'; end if;
  select * into r from public.rooms where code = upper(p_code) for update;
  if r.result is null then raise exception 'game not over'; end if;
  if r.next_code is not null then return jsonb_build_object('code', r.next_code); end if;
  select * into s from public.room_secrets where code = r.code;
  v_new := private.new_room(jsonb_build_object('w', r.armies->>'b', 'b', r.armies->>'w'), r.back_rank, r.clock_ms, 'w');
  update public.room_secrets set secret_w = s.secret_b, secret_b = s.secret_w where code = v_new->>'code';
  update public.rooms set joined = true where code = v_new->>'code';
  update public.rooms set next_code = v_new->>'code', updated_at = now() where code = r.code;
  return jsonb_build_object('code', v_new->>'code');
end $$;

create or replace function public.my_color(p_code text, p_secret text)
returns text language sql stable security definer set search_path = '' as $$
  select private.player_color(upper(p_code), p_secret)::text;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_room(jsonb, text, integer, text), public.join_room(text), public.play_move(text, text, integer, text),
  public.end_game(text, text, text, text), public.send_chat(text, text, integer), public.rematch(text, text), public.my_color(text, text) from public;
grant execute on function public.create_room(jsonb, text, integer, text) to anon, authenticated;
grant execute on function public.join_room(text) to anon, authenticated;
grant execute on function public.play_move(text, text, integer, text) to anon, authenticated;
grant execute on function public.end_game(text, text, text, text) to anon, authenticated;
grant execute on function public.send_chat(text, text, integer) to anon, authenticated;
grant execute on function public.rematch(text, text) to anon, authenticated;
grant execute on function public.my_color(text, text) to anon, authenticated;
