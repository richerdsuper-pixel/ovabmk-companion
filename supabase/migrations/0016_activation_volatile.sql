-- 0016: ключ активации пишет запись в журнал, поэтому функции не могут быть STABLE:
-- PostgREST выполняет STABLE-функции в транзакции только для чтения («cannot execute INSERT in a read-only transaction»).
alter function public.my_offline_activation() volatile;
alter function public.admin_offline_activation(uuid) volatile;
