-- Удаление демо-данных (вымышленные женщины учреждения «Демо ОШП (намуна)»)
delete from public.mothers where institution_id in (select id from public.institutions where name = 'Демо ОШП (намуна)');
delete from public.mahallas where name like 'Демо: %';
delete from public.institutions where name = 'Демо ОШП (намуна)';
