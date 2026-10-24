"""Проверка RLS и функций на локальном Postgres с имитацией Supabase.
Запуск: sh tests/reset_local.sh && python3 tests/rls_test.py
"""
import subprocess, uuid, json, sys

PSQL = ["psql", "-h", "/tmp/pgsock", "-p", "54329", "-U", "postgres", "-d", "t1", "-At", "-q", "-v", "ON_ERROR_STOP=1"]
results = []

def sql(q, role=None, uid=None):
    pre = "begin;\n"
    if role:
        pre += f"set local role {role};\n"
    if uid:
        pre += f"set local request.jwt.claims = '{json.dumps({'sub': uid, 'role': role})}';\n"
    q = q.strip()
    if not q.endswith(";"):
        q += ";"
    p = subprocess.run(PSQL + ["-c", pre + q + "\ncommit;"], capture_output=True, text=True)
    return p.returncode, (p.stdout.strip(), p.stderr.strip())

def ok(name, cond, info=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"   <- {info}"))

def expect_ok(name, q, role=None, uid=None, out=None):
    rc, (o, e) = sql(q, role, uid)
    ok(name, rc == 0 and (out is None or o == out), f"rc={rc} out={o!r} err={e[:200]}")
    return o

def expect_err(name, q, role=None, uid=None, contains=""):
    rc, (o, e) = sql(q, role, uid)
    ok(name, rc != 0 and contains in e, f"rc={rc} out={o!r} err={e[:200]}")

def new_user(email):
    u = str(uuid.uuid4())
    sql(f"insert into auth.users(id,email) values ('{u}','{email}')")
    return u

def invite(role, by="null", folders="'{}'", hours=24, name="Тест"):
    rc, (o, e) = sql(f"select private.make_invite({by}, '{role}', '{name}', 'должность', {folders}::int[], {hours})")
    assert rc == 0, e
    return o

def accept(code, uid, tg):
    return sql(f"select public.accept_invite('{code}', '{uid}', {tg}, 'u{tg}', 'TG name')", role="service_role")

# ---------------- пользователи через настоящий путь приглашений
A = new_user("a@t"); D = new_user("d@t"); S = new_user("s@t"); S2 = new_user("s2@t"); N = new_user("n@t")
c = invite("admin");                       rc, r = accept(c, A, 1001); ok("bootstrap: первое приглашение admin принимается", rc == 0 and r[0] == "admin", r)
rc, r = accept(c, D, 1002);                ok("повторное использование приглашения отклоняется", rc != 0 and "invite_used" in r[1], r)
c = invite("deputy", by=f"'{A}'");         rc, r = accept(c, D, 1002); ok("deputy через приглашение", rc == 0, r)
c = invite("staff", by=f"'{A}'", folders="'{1,15}'"); rc, r = accept(c, S, 1003); ok("staff через приглашение (папки 1 и 15)", rc == 0, r)
expect_ok("папка 15 из приглашения не назначена", f"select array_agg(folder_id) from public.folder_members where user_id='{S}'", out="{1}")
c = invite("staff", by=f"'{A}'");          rc, r = accept(c, S2, 1004); ok("staff без папок", rc == 0, r)

# ---------------- приглашения: ошибки
rc, r = accept("deadbeef", N, 2001);       ok("неверный код отклоняется", rc != 0 and "invite_invalid" in r[1], r)
c = invite("staff", hours=1); sql(f"update public.invites set expires_at = now() - interval '1 minute' where code_hash = encode(extensions.digest('{c}','sha256'),'hex')")
rc, r = accept(c, N, 2001);                ok("истёкшее приглашение отклоняется", rc != 0 and "invite_expired" in r[1], r)
c = invite("staff"); sql(f"update public.invites set revoked_at = now() where code_hash = encode(extensions.digest('{c}','sha256'),'hex')")
rc, r = accept(c, N, 2001);                ok("отменённое приглашение отклоняется", rc != 0 and "invite_revoked" in r[1], r)
c = invite("staff");                       rc, r = accept(c, N, 1003)
ok("чужой Telegram ID отклоняется", rc != 0 and "telegram_taken" in r[1], r)
expect_ok("у N после неудач нет ролей", f"select count(*) from public.user_roles where user_id='{N}'", out="0")
expect_err("authenticated не может вызвать accept_invite", f"select public.accept_invite('{c}', '{N}', 3001, 'x', 'x')", "authenticated", N, "permission denied")
expect_err("authenticated не может вызвать make_invite", f"select private.make_invite(null,'admin','x','x','{{}}',24)", "authenticated", N, "permission denied")
expect_err("authenticated не может вызвать require_admin/log_event", "select private.log_event('fake','x','{}')", "authenticated", N, "permission denied")
expect_err("служебных функций прав больше нет в public (не видны через API)", f"select public.has_role('{N}','admin')", "authenticated", N, "does not exist")
expect_err("authenticated не может искать пользователей по почте", "select public.auth_user_by_email('a@t')", "authenticated", N, "permission denied")
expect_err("anon не может вызвать accept_invite", f"select public.accept_invite('{c}', '{N}', 3001, 'x', 'x')", "anon", None, "permission denied")

# ---------------- anon
expect_err("anon не читает роли", "select count(*) from public.user_roles", "anon", None, "permission denied")
expect_err("anon не читает документы", "select count(*) from public.documents", "anon", None, "permission denied")

# ---------------- роли: нельзя повысить себе права
expect_err("staff не может вставить себе admin", f"insert into public.user_roles(user_id, role) values ('{S}','admin')", "authenticated", S, "row-level security")
expect_ok("staff: update своей роли ничего не меняет", f"with u as (update public.user_roles set role='admin' where user_id='{S}' returning 1) select count(*) from u", "authenticated", S, out="0")
expect_err("staff не может вызвать admin_set_role", f"select public.admin_set_role('{S}','admin',true)", "authenticated", S, "forbidden")
expect_err("deputy не может вызвать admin_set_role", f"select public.admin_set_role('{D}','admin',true)", "authenticated", D, "forbidden")
expect_err("staff не может создать приглашение", "select public.create_invite('admin','x','x','{}',3)", "authenticated", S, "forbidden")
expect_err("user без роли не может создать приглашение", "select public.create_invite('admin','x','x','{}',3)", "authenticated", N, "forbidden")
expect_ok("staff видит только свою роль", "select count(*) from public.user_roles", "authenticated", S, out="1")
expect_ok("admin видит все роли", "select count(*) from public.user_roles", "authenticated", A, out="4")
expect_ok("user без роли: роль не найдена (0 строк, без ошибки)", "select count(*) from public.user_roles", "authenticated", N, out="0")
expect_ok("user без роли не видит папки", "select count(*) from public.folders", "authenticated", N, out="0")
expect_err("admin не может снять с себя последнюю роль admin", f"select public.admin_set_role('{A}','admin',false)", "authenticated", A, "last_admin")
expect_ok("admin выдаёт роль chief_physician", f"select public.admin_set_role('{S2}','chief_physician',true)", "authenticated", A)
expect_ok("admin снимает роль chief_physician", f"select public.admin_set_role('{S2}','chief_physician',false)", "authenticated", A)
expect_ok("admin_list_users работает", "select count(*) from public.admin_list_users()", "authenticated", A, out="4")
expect_err("staff не может admin_list_users", "select count(*) from public.admin_list_users()", "authenticated", S, "forbidden")

# ---------------- документы
ins = "insert into public.documents (folder_id, title, no_patient_data) values ({f}, 'Приказ', {npd}) returning folder_id"
expect_ok("staff добавляет документ в свою папку 1", ins.format(f=1, npd="true"), "authenticated", S, out="1")
expect_err("staff не может добавить в чужую папку 2", ins.format(f=2, npd="true"), "authenticated", S, "row-level security")
expect_err("staff не может добавить в папку 15", ins.format(f=15, npd="true"), "authenticated", S, "row-level security")
expect_err("без подтверждения «нет данных пациентов» нельзя", ins.format(f=1, npd="false"), "authenticated", S, "check constraint")
expect_err("staff без папок не может добавить", ins.format(f=1, npd="true"), "authenticated", S2, "row-level security")
expect_ok("deputy видит документ в папке 1", "select count(*) from public.documents where folder_id=1", "authenticated", D, out="1")
expect_ok("deputy добавляет в папку 2", ins.format(f=2, npd="true"), "authenticated", D, out="2")
expect_err("deputy не может добавить в папку 15", ins.format(f=15, npd="true"), "authenticated", D, "row-level security")
expect_err("admin не может добавить в папку 15", ins.format(f=15, npd="true"), "authenticated", A, "row-level security")
sql("insert into public.documents (folder_id, title, no_patient_data, uploaded_by) values (15, 'Старый документ', true, (select id from auth.users limit 1))")
expect_ok("admin не видит содержимое папки 15", "select count(*) from public.documents where folder_id=15", "authenticated", A, out="0")
expect_ok("staff видит только папку 1", "select count(*) from public.documents", "authenticated", S, out="1")
expect_ok("staff: удаление ничего не удаляет", "with d as (delete from public.documents returning 1) select count(*) from d", "authenticated", S, out="0")
expect_ok("deputy: удаление ничего не удаляет", "with d as (delete from public.documents returning 1) select count(*) from d", "authenticated", D, out="0")
expect_ok("admin удаляет документ папки 2", "with d as (delete from public.documents where folder_id=2 returning 1) select count(*) from d", "authenticated", A, out="1")
expect_ok("admin не может удалить документ папки 15", "with d as (delete from public.documents where folder_id=15 returning 1) select count(*) from d", "authenticated", A, out="0")
expect_ok("folder_counts учитывает права staff", "select string_agg(folder_id||':'||docs, ',') from public.folder_counts()", "authenticated", S, out="1:1")
expect_ok("журнал: admin читает", "select count(*) > 0 from public.audit_log", "authenticated", A, out="t")
expect_ok("журнал: staff не видит", "select count(*) from public.audit_log", "authenticated", S, out="0")
expect_err("журнал: staff не может писать", "insert into public.audit_log(action) values ('fake')", "authenticated", S, "row-level security")
expect_ok("приглашения: staff не видит", "select count(*) from public.invites", "authenticated", S, out="0")

# ---------------- хранилище
obj = "insert into storage.objects (bucket_id, name) values ('documents', '{p}') returning 1"
u = str(uuid.uuid4())
expect_ok("файл: staff загружает в папку 1", obj.format(p=f"1/{u}/a.pdf"), "authenticated", S, out="1")
expect_err("файл: staff не загружает в папку 2", obj.format(p=f"2/{u}/a.pdf"), "authenticated", S, "row-level security")
expect_err("файл: никто не загружает в папку 15", obj.format(p=f"15/{u}/a.pdf"), "authenticated", A, "row-level security")
expect_err("файл: путь без номера папки отклоняется", obj.format(p="abc/x.pdf"), "authenticated", A, "row-level security")
expect_ok("файл: staff видит свой файл", "select count(*) from storage.objects", "authenticated", S, out="1")
expect_ok("файл: staff без папок не видит", "select count(*) from storage.objects", "authenticated", S2, out="0")
expect_ok("файл: staff не может удалить", "with d as (delete from storage.objects returning 1) select count(*) from d", "authenticated", S, out="0")

# ---------------- заявки на доступ (общая ссылка)
def submit(tg, fn="Иванова Мария Петровна", pos="Акушерка СВП (кабинет доя)", code="doya_qvp"):
    return sql(f"select public.submit_access_request({tg}, 'u{tg}', 'TG', '{fn}', '{pos}', '{code}')", role="service_role")
def state(tg):
    return sql(f"select public.request_state({tg})", role="service_role")[1][0]
ok("заявка: нового Telegram нет в заявках", state(5001) == "none")
rc, r = submit(5001);                      ok("заявка: подана (pending)", rc == 0 and r[0] == "pending", r)
rc, r = submit(5001, fn="Иванова Мария"); ok("заявка: повторная подача обновляет, не дублирует", rc == 0 and r[0] == "pending", r)
expect_ok("заявка: одна открытая заявка на Telegram", "select count(*)||':'||max(full_name) from public.access_requests where telegram_id=5001", out="1:Иванова Мария")
rc, r = submit(5002, fn="Аб");             ok("заявка: короткое ФИО отклоняется", rc != 0 and "bad_full_name" in r[1], r)
rc, r = submit(1003);                      ok("заявка: уже сотрудник не может подать", rc != 0 and "already_member" in r[1], r)
rc, r = submit(5003, code="Bad-Code;");    ok("заявка: мусорный код должности обнуляется", rc == 0, r)
expect_ok("заявка: код должности пустой", "select position_code from public.access_requests where telegram_id=5003", out="")
expect_err("заявка: anon не может подать", "select public.submit_access_request(1,'x','x','Иванов Иван','Врач','')", "anon", None, "permission denied")
expect_err("заявка: authenticated не может подать напрямую", "select public.submit_access_request(1,'x','x','Иванов Иван','Врач','')", "authenticated", N, "permission denied")
expect_err("заявка: authenticated не может принять заявку", f"select public.accept_request(5001, '{N}', 'x')", "authenticated", N, "permission denied")
expect_ok("заявки: staff не видит", "select count(*) from public.access_requests", "authenticated", S, out="0")
expect_ok("заявки: admin видит", "select count(*) from public.access_requests", "authenticated", A, out="2")
expect_err("заявки: staff не может вставить", "insert into public.access_requests(telegram_id, full_name, position) values (9,'Иванов Иван','Врач')", "authenticated", S, "row-level security")
rid = sql("select id from public.access_requests where telegram_id=5001")[1][0]
rid3 = sql("select id from public.access_requests where telegram_id=5003")[1][0]
U5 = new_user("tg5001@t")
rc, r = sql(f"select public.accept_request(5001, '{U5}', 'u5001')", role="service_role")
ok("заявка: до одобрения войти нельзя", rc != 0 and "request_not_approved" in r[1], r)
expect_err("заявка: staff не может одобрить", f"select public.decide_request('{rid}', true, 'admin', '{{}}')", "authenticated", S, "forbidden")
expect_err("заявка: deputy не может одобрить", f"select public.decide_request('{rid}', true, 'staff', '{{}}')", "authenticated", D, "forbidden")
expect_ok("заявка: admin одобряет (папки 9,10,15)", f"select public.decide_request('{rid}', true, 'staff', '{{9,10,15}}')", "authenticated", A)
expect_ok("заявка: папка 15 отброшена при одобрении", f"select folder_ids from public.access_requests where id='{rid}'", out="{9,10}")
ok("заявка: состояние approved", state(5001) == "approved")
expect_err("заявка: повторно решить нельзя", f"select public.decide_request('{rid}', false, null, '{{}}')", "authenticated", A, "request_closed")
rc, r = sql(f"select public.accept_request(5001, '{U5}', 'u5001')", role="service_role")
ok("заявка: вход после одобрения выдаёт роль", rc == 0 and r[0] == "staff", r)
expect_ok("заявка: профиль из заявки", f"select full_name||'|'||position from public.profiles where id='{U5}'", out="Иванова Мария|Акушерка СВП (кабинет доя)")
expect_ok("заявка: папки назначены", f"select array_agg(folder_id order by folder_id) from public.folder_members where user_id='{U5}'", out="{9,10}")
expect_ok("заявка: Telegram привязан", "select user_id from public.telegram_links where telegram_id=5001", out=U5)
rc, r = sql(f"select public.accept_request(5001, '{U5}', 'u5001')", role="service_role")
ok("заявка: второй раз принять нельзя", rc != 0 and "request_not_approved" in r[1], r)
expect_ok("заявка: admin отклоняет", f"select public.decide_request('{rid3}', false, null, '{{}}')", "authenticated", A)
ok("заявка: состояние rejected", state(5003) == "rejected")
rc, r = submit(5003);                      ok("заявка: после отказа можно подать снова", rc == 0 and r[0] == "pending", r)
for i in range(4): submit(5004 + 0)
expect_ok("заявка: повторы одного Telegram не плодят строки", "select count(*) from public.access_requests where telegram_id=5004", out="1")

# ---------------- функции: безопасный search_path
expect_ok("у всех SECURITY DEFINER функций задан search_path",
          "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')",
          out="0")

failed = [n for n, r in results if not r]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
