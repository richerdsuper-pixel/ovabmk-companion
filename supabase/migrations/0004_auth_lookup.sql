-- Только для Edge Function tg-login: найти пользователя Auth по служебному адресу
-- (нужно, если прошлая попытка входа создала пользователя, но не завершилась).
create or replace function public.auth_user_by_email(_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = lower(_email) limit 1;
$$;
revoke execute on function public.auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_email(text) to service_role;
