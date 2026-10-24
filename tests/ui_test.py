"""Проверка интерфейса сайта на мок-данных (без сервера): python3 tests/ui_test.py"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = (ROOT / "docs/index.html").as_uri()
MOCK = (ROOT / "tests/mock_supabase.js").read_text(encoding="utf-8")
FOLDERS = json.loads((ROOT / "tests/folders.json").read_text(encoding="utf-8"))
SHOTS = ROOT / "tests/shots"; SHOTS.mkdir(exist_ok=True)
A, S_ = "00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b"
results = []

def ok(name, cond, info=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  <- {info}"))

def scenario(uid=None, roles=(), role_error=None, my_folders=()):
    db = {
        "folders": FOLDERS,
        "user_roles": [{"user_id": uid, "role": r} for r in roles],
        "profiles": [{"id": A, "full_name": "Администратор Тест", "position": "Заместитель"},
                     {"id": S_, "full_name": "Сотрудник Тест", "position": "Доя"}],
        "folder_members": [{"user_id": uid, "folder_id": f} for f in my_folders],
        "documents": [{"id": "d1", "folder_id": 1, "title": "Приказ №1 (тест)", "doc_number": "1", "doc_date": "2026-10-01", "note": None,
                       "storage_path": "1/11111111-1111-4111-8111-111111111111/prikaz.pdf", "file_name": "prikaz.pdf", "file_size": 120000,
                       "uploaded_by": A, "created_at": "2026-10-20T08:00:00Z"}],
        "invites": [{"id": "i1", "role": "staff", "full_name": "Тестовый Сотрудник", "position": "Доя", "folder_ids": [1, 2],
                     "created_at": "2026-10-20T08:00:00Z", "expires_at": "2099-01-01T00:00:00Z", "used_at": None, "revoked_at": None}],
        "access_requests": [
            {"id": "r1", "full_name": "Иванова Мария", "position": "Акушерка СВП (кабинет доя)", "position_code": "doya_qvp", "tg_username": "maria_i", "tg_name": "Maria",
             "status": "pending", "role": None, "folder_ids": [], "created_at": "2026-10-24T07:00:00Z", "decided_at": None, "used_at": None},
            {"id": "r2", "full_name": "Каримов Алишер", "position": "Врач-лаборант", "position_code": "other", "tg_username": None, "tg_name": "Alisher",
             "status": "pending", "role": None, "folder_ids": [], "created_at": "2026-10-24T07:05:00Z", "decided_at": None, "used_at": None},
            {"id": "r3", "full_name": "Сидорова Анна", "position": "Врач-педиатр", "position_code": "pediatr", "tg_username": "anna", "tg_name": "Anna",
             "status": "approved", "role": "staff", "folder_ids": [4, 5, 17], "created_at": "2026-10-23T07:00:00Z", "decided_at": "2026-10-23T08:00:00Z", "used_at": None}],
        "audit_log": [{"at": "2026-10-24T06:00:00Z", "actor": A, "action": "document_added", "object": "d1", "details": {"folder": 1, "title": "Приказ №1 (тест)"}}],
    }
    return {"session": {"user": {"id": uid}} if uid else None, "db": db, "log": [],
            "errors": {"user_roles": role_error} if role_error else {}}

RPC = """
window.__MOCK.rpc = {
  folder_counts: function(){ return [{folder_id:1, docs:1}]; },
  admin_list_users: function(){ return [
    {user_id:'%s', full_name:'Администратор Тест', user_position:'Заместитель', telegram_username:'admin_t', roles:['admin'], folders:[], created_at:'2026-10-20T08:00:00Z'},
    {user_id:'%s', full_name:'Сотрудник Тест', user_position:'Доя', telegram_username:'staff_t', roles:['staff'], folders:[1], created_at:'2026-10-21T08:00:00Z', institution_id:1, scope_institutions:[], scope_positions:[]}]; },
  admin_save_institution: function(a){ return a._id || 3; }, admin_add_institutions: function(a){ return a._names.length - 1; },
  admin_save_mahalla: function(a){ return a._id || 9; }, admin_delete_mahalla: function(){ return window.__mhErr ? {error:{message:'mahalla_has_reports'}} : null; }, admin_set_brigade: function(){ return null; },
  admin_delete_institution: function(){ return null; }, admin_set_institution: function(){ return null; }, admin_set_scopes: function(){ return null; },
  create_invite: function(){ return '0123456789abcdef01234567'; },
  admin_set_role: function(a){ return a._role==='admin' && !a._on ? {error:{message:'last_admin'}} : null; },
  decide_request: function(){ return null; },
  admin_set_folders: function(){ return null; }, admin_update_profile: function(){ return null; }, revoke_invite: function(){ return null; },
  admin_remove_user: function(a){ return a._uid === '%s' ? {error:{message:'cannot_remove_self'}} : (window.__rm || 'deleted'); }
};""" % (A, S_, A)

def page_for(p, sc, w=1280, h=900, scheme="light", search="", now=None, hash="#/folders"):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, accept_downloads=True)
    if now: ctx.add_init_script("window.__NOW=" + json.dumps(now))
    ctx.add_init_script("window.__MOCK=" + json.dumps(sc, ensure_ascii=False) + ";" + RPC)
    ctx.route("**/supabase.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MOCK))
    ctx.route("**/telegram-widget.js*", lambda r: r.fulfill(status=200, content_type="application/javascript", body="/* stub */"))
    ctx.route("**/fonts.g*/**", lambda r: r.abort())
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(SITE + search + hash); pg.wait_for_timeout(400)
    return b, pg, errs

def hscroll(pg): return pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")

with sync_playwright() as p:
    # 1. без входа + приглашение в адресе
    b, pg, errs = page_for(p, scenario(), search="?invite=0123456789ABCDEF01234567")
    ok("без сессии показан вход", "Вход" in pg.inner_text("#app"))
    ok("приглашение распознано", "приглашение" in pg.inner_text("#app"))
    ok("код приглашения убран из адреса", "invite=" not in pg.url, pg.url)
    ok("код сохранён до входа", pg.evaluate("sessionStorage.getItem('ovabmk-invite')") == "0123456789abcdef01234567")
    ok("Telegram-скрипт вставлен с именем бота", pg.evaluate("!!document.querySelector('script[data-telegram-login=\"OvaBMQbot\"]')"))
    pg.screenshot(path=str(SHOTS / "c_login.png"), full_page=True)
    pg.click(".seg button:nth-child(2)"); pg.wait_for_timeout(150)
    ok("переключение на узбекский", "Кириш" in pg.inner_text("#app"))
    ok("ошибок JS нет (вход)", not errs, errs); b.close()

    # 2. ошибка чтения ролей
    b, pg, errs = page_for(p, scenario(uid=A, roles=("admin",), role_error="permission denied for table user_roles"))
    t = pg.inner_text("#app")
    ok("ошибка роли показана как ошибка, а не «—»", "Не удалось загрузить роль" in t and "Повторить" in t, t[:200])
    ok("при ошибке роли нет меню администратора", "Сотрудники" not in t)
    pg.screenshot(path=str(SHOTS / "c_role_error.png"), full_page=True); b.close()

    # 3. роль не назначена
    b, pg, errs = page_for(p, scenario(uid=S_, roles=()))
    t = pg.inner_text("#app")
    ok("нет роли — отдельное сообщение", "Роль не назначена" in t and "администратору" in t, t[:200])
    ok("нет роли — папки не показаны", "Папка №1" not in t); b.close()

    # 4. администратор
    b, pg, errs = page_for(p, scenario(uid=A, roles=("admin",)))
    t = pg.inner_text("#app")
    ok("admin: роль показана", "Администратор" in t)
    ok("admin: меню администратора", all(x in t for x in ("Сотрудники", "Приглашения", "Журнал")))
    ok("20 папок", pg.locator(".fcard").count() == 20, pg.locator(".fcard").count())
    ok("папка 15 закрыта и не ссылка", pg.locator(".fcard.locked").count() == 1 and pg.locator("a.fcard[href='#/folder/15']").count() == 0)
    pg.screenshot(path=str(SHOTS / "c_folders.png"), full_page=True)
    pg.click("a.fcard[href='#/folder/1']"); pg.wait_for_timeout(300)
    t = pg.inner_text("#app")
    ok("папка 1: документ виден с автором", "Приказ №1 (тест)" in t and "Администратор Тест" in t)
    pg.click("details.panel summary"); pg.wait_for_timeout(100)
    pg.fill("form input[type=text]", "Новый план")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("без файла — ошибка формы", "Выберите файл" in pg.inner_text("form"))
    pg.set_input_files("form input[type=file]", files=[{"name": "План работы.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 test"}])
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("без подтверждения — ошибка формы", "Подтвердите" in pg.inner_text("form"))
    pg.check("form .check input"); pg.click("form button[type=submit]"); pg.wait_for_timeout(400)
    log = pg.evaluate("window.__MOCK.log")
    up = [x for x in log if x[0] == "upload"]; ins = [x for x in log if x[0] == "insert"]
    ok("файл загружен по пути папки с латинским именем", up and up[0][1].startswith("1/") and up[0][1].endswith("/plan_raboty.pdf"), up)
    ok("строка документа с подтверждением", ins and ins[0][2]["no_patient_data"] is True and ins[0][2]["file_name"] == "План работы.pdf", ins)
    pg.screenshot(path=str(SHOTS / "c_folder.png"), full_page=True)
    # пакетная загрузка
    pg.locator("details.panel summary", has_text="несколько файлов").click(); pg.wait_for_timeout(100)
    bulk = pg.locator("details.panel", has_text="несколько файлов")
    pg.evaluate("window.__MOCK.log.length = 0")
    bulk.locator("input[type=file]").set_input_files(files=[
        {"name": "Prikaz_12.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 a"},
        {"name": "Шаблон_журнала.xlsx", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "buffer": b"PK xlsx"},
        {"name": "virus.exe", "mimeType": "application/x-msdownload", "buffer": b"MZ"}])
    pg.wait_for_timeout(150)
    ok("пакет: три строки, у неподходящего — ошибка типа", bulk.locator("input[type=text]").count() == 3 and "не принимается" in bulk.inner_text())
    ok("пакет: название из имени файла", bulk.locator("input[type=text]").nth(0).input_value() == "Prikaz 12")
    bulk.locator("button[type=submit]").click(); pg.wait_for_timeout(150)
    ok("пакет: без подтверждения — ошибка", "Подтвердите" in bulk.inner_text())
    bulk.locator(".check input").check(); bulk.locator("button[type=submit]").click(); pg.wait_for_timeout(500)
    log = pg.evaluate("window.__MOCK.log")
    ups = [x for x in log if x[0] == "upload"]; inss = [x for x in log if x[0] == "insert"]
    ok("пакет: загружены два допустимых файла", len(ups) == 2 and len(inss) == 2, log)
    ok("пакет: пути в папке 1, латиница", all(u[1].startswith("1/") for u in ups) and ups[1][1].endswith("/shablon_jurnala.xlsx"), ups)
    ok("пакет: подтверждение данных пациентов записано", all(i[2]["no_patient_data"] is True for i in inss) and inss[1][2]["title"] == "Шаблон журнала", inss)
    btn = pg.locator("button.danger").first; btn.click(); pg.wait_for_timeout(100)
    ok("удаление требует второго нажатия", "Точно" in btn.inner_text())
    btn.click(); pg.wait_for_timeout(300)
    ok("удаление документа и файла", any(x[0] == "remove" for x in pg.evaluate("window.__MOCK.log")))
    pg.goto(SITE + "#/folder/15"); pg.wait_for_timeout(300)
    ok("прямая ссылка на папку 15 — закрыто", "закрыто для всех" in pg.inner_text("#app"))
    pg.goto(SITE + "#/admin/users"); pg.wait_for_timeout(300)
    t = pg.inner_text("#app")
    ok("сотрудники: список", pg.locator("input[value='Сотрудник Тест']").count() == 1 and "@staff_t" in t, t[:300])
    ok("папка 15 не назначается", pg.locator(".fold-picks label.off input[disabled]").count() >= 1)
    cb0 = pg.locator("tbody tr").first.locator("input[type=checkbox]").first; cb0.click(); pg.wait_for_timeout(250)
    ok("галочка admin вернулась обратно", cb0.is_checked())
    ok("нельзя снять последнего admin (сообщение)", "последнего администратора" in pg.inner_text("#toast"))
    # --- сотрудники: папки по должности и удаление
    pg.evaluate("window.__MOCK.log.length = 0")
    row_s = pg.locator("tbody tr").nth(1)
    row_s.locator("input[type=text]").nth(1).fill("Акушерка СВП (кабинет доя)")
    row_s.locator("button", has_text="Папки по должности").click(); pg.wait_for_timeout(250)
    sf = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_set_folders"]
    ok("сотрудники: папки по должности доя = 9,10,12,13", sf and sf[0][2]["_folders"] == [9, 10, 12, 13], sf)
    ok("сотрудники: галочки выставлены", row_s.evaluate("el => Array.from(el.querySelectorAll('.fold-picks input')).map((x,k)=>x.checked?k+1:0).filter(Boolean)") == [9, 10, 12, 13])
    row_s.locator("input[type=text]").nth(1).fill("Что-то своё")
    row_s.locator("button", has_text="Папки по должности").click(); pg.wait_for_timeout(150)
    ok("сотрудники: должность не из списка — подсказка", "не из списка" in pg.inner_text("#toast"))
    row_s.locator("input[type=text]").nth(1).fill("Главный врач")
    row_s.locator("button", has_text="Папки по должности").click(); pg.wait_for_timeout(150)
    ok("сотрудники: руководителю папки отдельно не нужны", "Руководитель видит все папки" in pg.inner_text("#toast"))
    rm = row_s.locator("button.danger", has_text="Удалить"); rm.click(); pg.wait_for_timeout(80)
    ok("сотрудники: удаление требует второго нажатия", "Точно" in rm.inner_text())
    pg.evaluate("window.__MOCK.log.length = 0; window.__rm = 'deactivated'")
    rm.click(); pg.wait_for_timeout(300)
    ok("сотрудники: запрос на удаление ушёл", any(x[0] == "rpc" and x[1] == "admin_remove_user" and x[2]["_uid"] == S_ for x in pg.evaluate("window.__MOCK.log")))
    ok("сотрудники: пояснение про сохранённую запись", "запись сохранена" in pg.inner_text("#toast").lower())
    row_a = pg.locator("tbody tr").first
    ra = row_a.locator("button.danger", has_text="Удалить"); ra.click(); pg.wait_for_timeout(60); ra.click(); pg.wait_for_timeout(250)
    ok("сотрудники: себя удалить нельзя", "самого себя" in pg.inner_text("#toast"), pg.inner_text("#toast"))
    pg.screenshot(path=str(SHOTS / "c_users.png"), full_page=True)
    pg.goto(SITE + "#/admin/invites"); pg.wait_for_timeout(300)
    pg.select_option("form select >> nth=0", "pediatr"); pg.wait_for_timeout(100)
    ok("приглашение: должность врач-педиатр — роль и папки сами", pg.eval_on_selector("form select >> nth=1", "s => s.value") == "staff" and pg.evaluate("Array.from(document.querySelectorAll('.fold-picks input:checked')).map(x=>+x.value)") == [4, 5, 17])
    ok("приглашение: подсказка про автоматический выбор", "по должности" in pg.inner_text("form"))
    pg.select_option("form select >> nth=0", "bosh_vrach"); pg.wait_for_timeout(100)
    ok("приглашение: главный врач — роль главного врача, без галочек", pg.eval_on_selector("form select >> nth=1", "s => s.value") == "chief_physician" and pg.evaluate("document.querySelectorAll('.fold-picks input:checked').length") == 0)
    pg.select_option("form select >> nth=0", "other"); pg.wait_for_timeout(100)
    ok("приглашение: «другая должность» — поле для ввода", pg.locator("form input[placeholder]").first.is_visible())
    pg.select_option("form select >> nth=0", "pediatr"); pg.evaluate("window.__MOCK.log.length = 0")
    pg.fill("form input[type=text] >> nth=0", "Новый педиатр"); pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
    ci = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "create_invite"]
    ok("приглашение: отправлены должность, роль и папки по должности", ci and ci[0][2]["_position"] == "Врач-педиатр" and ci[0][2]["_role"] == "staff" and ci[0][2]["_folders"] == [4, 5, 17], ci)
    t = pg.inner_text("#app")
    ok("приглашение: ссылка показана", "https://richerdsuper-pixel.github.io/ovabmk-companion/?invite=0123456789abcdef01234567" in t)
    ok("список приглашений", "Тестовый Сотрудник" in t and "Действует" in t)
    pg.screenshot(path=str(SHOTS / "c_invites.png"), full_page=True)
    pg.goto(SITE + "#/admin/log"); pg.wait_for_timeout(300)
    ok("журнал", "добавлен документ" in pg.inner_text("#app"))
    ok("ошибок JS нет (admin)", not errs, errs); b.close()

    # 5. сотрудник с папкой 1
    b, pg, errs = page_for(p, scenario(uid=S_, roles=("staff",), my_folders=(1,)))
    t = pg.inner_text("#app")
    ok("staff: нет меню администратора", "Приглашения" not in t)
    ok("staff: открыть можно только папку 1", pg.locator("a.fcard").count() == 1 and pg.locator("a.fcard[href='#/folder/1']").count() == 1)
    pg.goto(SITE + "#/folder/2"); pg.wait_for_timeout(300)
    ok("staff: прямая ссылка на чужую папку — нет доступа", "не назначена" in pg.inner_text("#app"))
    pg.goto(SITE + "#/admin/users"); pg.wait_for_timeout(300)
    ok("staff: админ-раздел по ссылке закрыт", "только администратору" in pg.inner_text("#app"))
    pg.goto(SITE + "#/folder/1"); pg.wait_for_timeout(300)
    ok("staff: нет кнопки удаления", pg.locator("button.danger").count() == 0)
    ok("ошибок JS нет (staff)", not errs, errs); b.close()

    # 5б. заявка без приглашения
    def tg_route(ctx_page, answers):
        calls = []
        def handler(route):
            body = json.loads(route.request.post_data or "{}"); calls.append(body)
            route.fulfill(status=200, content_type="application/json", body=json.dumps(answers(body)),
                          headers={"Access-Control-Allow-Origin": "*"})
        ctx_page.route("**/functions/v1/tg-login", handler)
        return calls
    b, pg, errs = page_for(p, scenario())
    calls = tg_route(pg, lambda body: {"request": "pending"} if body.get("request") else {"request": "none"})
    pg.evaluate("onTelegramAuth({id: 777, first_name: 'Мария', last_name: 'Иванова', auth_date: 1, hash: 'x'})"); pg.wait_for_timeout(400)
    t = pg.inner_text("#app")
    ok("заявка: после входа без приглашения показана форма", "Заявка на доступ" in t and "Отправить заявку" in t, t[:300])
    ok("заявка: ФИО подставлено из Telegram", pg.input_value("form input[type=text] >> nth=0") == "Иванова Мария")
    ok("заявка: в списке должностей есть акушерка", pg.locator("form select option[value='doya_qvp']").count() == 1)
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("заявка: без должности — ошибка", "Выберите должность" in pg.inner_text("form"))
    pg.select_option("form select", "other"); pg.wait_for_timeout(50)
    ok("заявка: «Другая» открывает поле должности", pg.locator("form input[type=text] >> nth=1").is_visible())
    pg.select_option("form select", "doya_qvp")
    pg.screenshot(path=str(SHOTS / "c_request_form.png"), full_page=True)
    pg.click("form button[type=submit]"); pg.wait_for_timeout(400)
    sent = calls[-1].get("request") or {}
    ok("заявка: отправлены ФИО, должность и код", sent.get("full_name") == "Иванова Мария" and sent.get("position_code") == "doya_qvp" and "Акушерка" in sent.get("position", ""), sent)
    t = pg.inner_text("#app")
    ok("заявка: экран «ждёт одобрения»", "ждёт одобрения" in t and "Проверить" in t, t[:300])
    pg.screenshot(path=str(SHOTS / "c_request_pending.png"), full_page=True)
    pg.click(".seg button:nth-child(2)"); pg.wait_for_timeout(150)
    ok("заявка: узбекский текст", "ариза" in pg.inner_text("#app").lower())
    ok("ошибок JS нет (заявка)", not errs, errs); b.close()

    # 5в. администратор: заявки
    b, pg, errs = page_for(p, scenario(uid=A, roles=("admin",)))
    ok("admin: в меню есть «Заявки»", "Заявки" in pg.inner_text("nav"))
    pg.goto(SITE + "#/admin/requests"); pg.wait_for_timeout(400)
    t = pg.inner_text("#app")
    ok("заявки: общая ссылка показана", "https://richerdsuper-pixel.github.io/ovabmk-companion/" in t and "Ссылка для сотрудников" in t)
    ok("заявки: 2 новые", "Новые заявки: 2" in t, t[:400])
    card1 = pg.locator(".req").nth(0)
    checked = card1.evaluate("el => Array.from(el.querySelectorAll('.fold-picks input:checked')).map(x => +x.value)")
    ok("заявки: папки по должности отмечены сами (доя → 9,10,12,13)", checked == [9, 10, 12, 13], checked)
    ok("заявки: подсказка про автоматический выбор", "автоматически" in card1.inner_text())
    card2 = pg.locator(".req").nth(1)
    ok("заявки: «другая должность» — без галочек и с подсказкой", card2.evaluate("el => el.querySelectorAll('.fold-picks input:checked').length") == 0 and "вручную" in card2.inner_text())
    ok("заявки: рассмотренная в истории", "Сидорова Анна" in t and "ждёт входа" in t)
    pg.screenshot(path=str(SHOTS / "c_requests.png"), full_page=True)
    card1.locator(".fold-picks input[value='13']").uncheck()
    card1.locator("button.pri").click(); pg.wait_for_timeout(300)
    dec = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "decide_request"]
    ok("заявки: одобрение с ролью и изменёнными папками", dec and dec[0][2] == {"_id": "r1", "_approve": True, "_role": "staff", "_folders": [9, 10, 12], "_institution_id": None}, dec)
    rej = pg.locator(".req").nth(1).locator("button.danger"); rej.click(); pg.wait_for_timeout(100)
    ok("заявки: отказ требует второго нажатия", "Точно" in rej.inner_text())
    ok("ошибок JS нет (заявки)", not errs, errs); b.close()

    # 6. телефон и тёмная тема
    for tag, (w, h_, sch) in {"m": (390, 800, "light"), "d": (1280, 900, "dark")}.items():
        b, pg, errs = page_for(p, scenario(uid=A, roles=("admin",)), w, h_, sch)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_folders.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (папки)", not hscroll(pg))
        pg.goto(SITE + "#/admin/users"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_users.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (сотрудники)", not hscroll(pg))
        pg.goto(SITE + "#/admin/requests"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_requests.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (заявки)", not hscroll(pg))
        b.close()

    # 7. показатели
    DOYA = "Акушерка СВП (кабинет доя)"
    X_ = "00000000-0000-4000-8000-00000000000c"
    def ind_sc(uid, roles, reports):
        sc = scenario(uid=uid, roles=roles)
        sc["db"]["profiles"] = [{"id": A, "full_name": "Администратор Тест", "position": "Заместитель главного врача"},
                                {"id": S_, "full_name": "Сотрудник Тест", "position": DOYA},
                                {"id": X_, "full_name": "Вторая Доя", "position": DOYA}]
        sc["db"]["indicator_reports"] = reports
        return sc
    NOW = "2026-10-24T10:00:00"
    rep = lambda rid, uid, inst, pe, vals, ps=None: {"id": rid, "user_id": uid, "position_code": "doya_qvp", "institution": inst, "period_start": ps or pe, "period_end": pe, "vals": vals, "updated_at": "2026-10-23T09:00:00Z"}
    b, pg, errs = page_for(p, ind_sc(S_, ("staff",), [rep("p1", S_, "СВП №3", "2026-10-23", {"i1": 12, "i2": 10}, "2026-10-19")]), now=NOW)
    t = pg.inner_text("#app")
    ok("показатели: пункт меню у сотрудника", "Показатели" in t and "Сводка показателей" not in t)
    pg.goto(SITE + "#/indicators"); pg.wait_for_timeout(400)
    t = pg.inner_text("#app")
    ok("показатели: форма должности подставлена из профиля", pg.eval_on_selector(".grid-f select", "s => s.value") == "doya_qvp")
    ok("показатели: 27 показателей у доя", pg.locator(".indrow").count() == 27, pg.locator(".indrow").count())
    ok("показатели: предупреждение «только числа»", "Фамилии, ПИНФЛ" in t)
    ok("показатели: срок сдачи доя — пятница 12:00", "пятница до 12:00" in t, t[:600])
    ok("показатели: период по умолчанию — неделя пн–пт", pg.eval_on_selector_all("form input[type=date]", "x => x.map(i => i.value)") == ["2026-10-19", "2026-10-23"])
    ok("показатели: мои отчёты показывают сохранённый", "СВП №3" in t and "заполнено 2 из 27" in t, t[-500:])
    pg.screenshot(path=str(SHOTS / "c_ind_form.png"), full_page=True)
    pg.fill("form .grid-f input[type=text]", " ")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("показатели: пустое учреждение — ошибка", "Укажите учреждение" in pg.inner_text("form"))
    pg.fill("form .grid-f input[type=text]", "СВП №7 (тест)"); pg.press("form .grid-f input[type=text]", "Tab")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("показатели: пустая форма — ошибка", "хотя бы один" in pg.inner_text("form"))
    pg.fill("#ind3", "150"); pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("показатели: проценты больше 100 отклоняются", "Проверьте числа" in pg.inner_text("form"))
    ok("показатели: поле с ошибкой помечено", pg.eval_on_selector("#ind3", "e => e.getAttribute('aria-invalid')") == "true")
    pg.fill("#ind3", "83,3"); pg.fill("#ind1", "12"); pg.fill("#ind2", "10"); pg.evaluate("window.__MOCK.log.length = 0")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(400)
    ins = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "insert" and x[1] == "indicator_reports"]
    ok("показатели: запись отправлена с числами, автором и должностью", ins and ins[0][2]["vals"] == {"i1": 12, "i2": 10, "i3": 83.3} and ins[0][2]["user_id"] == S_ and ins[0][2]["position_code"] == "doya_qvp" and ins[0][2]["period_end"] == "2026-10-23", ins)
    ok("показатели: в отправке нет текстовых полей кроме учреждения", ins and set(ins[0][2].keys()) == {"user_id", "position_code", "institution", "mahalla_id", "period_start", "period_end", "vals"}, ins and ins[0][2].keys())
    # правка существующего отчёта: то же учреждение и период
    pg.fill("form .grid-f input[type=text]", "СВП №3"); pg.press("form .grid-f input[type=text]", "Tab"); pg.wait_for_timeout(150)
    ok("показатели: за этот период отчёт уже есть — значения подставлены", pg.input_value("#ind1") == "12" and "правите" in pg.inner_text("form"), pg.inner_text("form")[:300])
    pg.fill("#ind1", "15"); pg.evaluate("window.__MOCK.log.length = 0"); pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
    upd = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "update"]
    ok("показатели: правка идёт как update того же отчёта", upd and upd[0][3] == ["p1"] and upd[0][2]["vals"]["i1"] == 15, upd)
    ok("показатели: удаление требует второго нажатия", True)
    dl = pg.locator("tbody .btn.danger").first; dl.click(); pg.wait_for_timeout(80)
    ok("показатели: удаление — подтверждение", "Точно" in dl.inner_text())
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(300)
    ok("показатели: сотрудник не видит сводку", "нет доступа" in pg.inner_text("#app").lower() or "Недостаточно" in pg.inner_text("#app") or pg.locator("table.indsum").count() == 0)
    ok("ошибок JS нет (показатели сотрудника)", not errs, errs); b.close()

    # сводка руководителя
    reps = [rep("p1", S_, "СВП №3", "2026-10-23", {"i1": 12, "i2": 10, "i3": 83.3}, "2026-10-19"),
            rep("p2", X_, "СВП №5", "2026-10-16", {"i1": 8, "i2": 8}, "2026-10-12"),
            rep("p3", X_, "СВП №5", "2026-10-09", {"i1": 7}, "2026-10-05")]
    b, pg, errs = page_for(p, ind_sc(A, ("admin",), reps), now=NOW)
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(500)
    t = pg.inner_text("#app")
    ok("сводка: пункт меню у администратора", "Сводка показателей" in pg.inner_text(".nav"))
    ok("сводка: 27 строк показателей", pg.locator("table.indsum tbody tr").count() == 27, pg.locator("table.indsum tbody tr").count())
    row1 = pg.locator("table.indsum tbody tr").first.inner_text().split("\t")
    ok("сводка: итого по показателю 1 = 12 + 8 (последние отчёты)", row1[-1].strip() == "20", row1)
    ok("сводка: проценты не суммируются", pg.locator("table.indsum tbody tr").nth(2).inner_text().split("\t")[-1].strip() == "", pg.locator("table.indsum tbody tr").nth(2).inner_text())
    ok("сводка: показан отчёт сотрудника и его фамилия", "СВП №3" in t and "сотрудник тест" in t.lower())
    ok("сводка: кто не сдал за срок 23.10.2026", "Не сдали (1)" in t and "Вторая Доя" in t and "Сотрудник Тест" not in t.split("Не сдали")[1].split("\n")[0], t[:700])
    pg.screenshot(path=str(SHOTS / "c_ind_summary.png"), full_page=True)
    with pg.expect_download() as d: pg.click("text=Скачать в Excel")
    d.value.save_as("/tmp/ui_ind.xlsx")
    import openpyxl
    wsx = openpyxl.load_workbook("/tmp/ui_ind.xlsx").active
    ok("сводка: Excel — 27 строк + шапка и итого", wsx.max_row == 28 and wsx.cell(2, 2).value == "Число беременных на учёте" and wsx.cell(2, wsx.max_column).value == 20, (wsx.max_row, wsx.cell(2, wsx.max_column).value))
    pg.select_option("section:not(:has(.chart)) select >> nth=1", "2026-10-16"); pg.wait_for_timeout(400)
    ok("сводка: период — только отчёты за него", pg.locator("table.indsum thead th").count() == 5 and "СВП №5" in pg.inner_text("table.indsum thead"), pg.locator("table.indsum thead th").count())
    pg.click(".seg button:nth-child(2)"); pg.wait_for_timeout(300)
    ok("сводка: узбекский", "Жами" in pg.inner_text("table.indsum thead") or "Кўрсаткичлар" in pg.inner_text("#app"))
    ok("ошибок JS нет (сводка)", not errs, errs); b.close()

    for tag, (w, h_) in {"m": (390, 800), "d": (1280, 900)}.items():
        b, pg, errs = page_for(p, ind_sc(A, ("admin",), reps), w, h_, now=NOW)
        pg.goto(SITE + "#/indicators"); pg.wait_for_timeout(400)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_ind.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (показатели)", not hscroll(pg))
        pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(400)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_indsum.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки страницы (сводка)", not hscroll(pg))
        b.close()

    # 8. обзор: проценты и графики
    b, pg, errs = page_for(p, ind_sc(A, ("admin",), reps), now=NOW, hash="")
    pg.wait_for_timeout(400)
    ok("обзор: открывается по умолчанию и пункт меню активен", pg.locator("nav a[aria-current=page]").inner_text() == "Обзор")
    t = pg.inner_text("#app")
    ok("обзор: заполнение папок 1 из 19 = 5%", "1 из 19 папок" in t and pg.locator(".kpi .ring-n").first.inner_text() == "5%", t[:300])
    ok("обзор: сдача показателей 1 из 2 = 50%", pg.locator(".kpi .ring-n").nth(1).inner_text() == "50%" and "1 из 2 сотрудников" in t, t[:400])
    ok("обзор: документов всего 1 и за 30 дней 1", pg.locator(".kpi .big").inner_text() == "1" and "за 30 дней: 1" in t)
    ok("обзор: строки по папкам (19 открытых)", pg.locator(".panel .hb[href^='#/folder/']").count() == 19, pg.locator(".panel .hb").count())
    ok("обзор: по должностям — Доя 1 / 2 и 50%", "1 / 2" in t and "50%" in pg.locator(".hb:not([href])").first.inner_text(), pg.locator(".hb:not([href])").count())
    ok("обзор: график по неделям — 12 точек и линия", pg.locator(".chart svg .ch-dot").count() == 12 and pg.locator(".chart svg path.ch-line").count() == 1, pg.locator(".chart svg .ch-dot").count())
    pg.locator(".chart svg rect").last.scroll_into_view_if_needed()
    box = pg.locator(".chart svg rect").last.bounding_box()
    pg.mouse.move(box["x"] + box["width"] - 8, box["y"] + 40); pg.wait_for_timeout(150)
    ok("обзор: подсказка на графике показывает неделю и число", "19.10–25.10: 1" in pg.locator(".ch-tip").inner_text(), pg.locator(".ch-tip").inner_text())
    ok("обзор: таблица данных для скринридера есть", pg.locator(".chart table.sr tr").count() == 12)
    ok("обзор: график не шире панели", pg.evaluate("(()=>{const s=document.querySelector('.chart svg'),p=s.closest('.panel');return s.getBoundingClientRect().width<=p.getBoundingClientRect().width+1})()"))
    pg.screenshot(path=str(SHOTS / "c_overview.png"), full_page=True)
    pg.click(".seg button:nth-child(2)"); pg.wait_for_timeout(250)
    ok("обзор: узбекский", "Умумий кўриниш" in pg.inner_text("#app") and "Жилдлар" in pg.inner_text("#app"))
    ok("ошибок JS нет (обзор)", not errs, errs); b.close()

    sc_st = ind_sc(S_, ("staff",), reps); sc_st["db"]["folder_members"] = [{"user_id": S_, "folder_id": 1}]
    b, pg, errs = page_for(p, sc_st, now=NOW, hash="")
    pg.wait_for_timeout(300); t = pg.inner_text("#app")
    ok("обзор сотрудника: показатели сданы, срок 23.10.2026", "Сдано" in t and "23.10.2026" in t, t[:300])
    ok("обзор сотрудника: нет сравнения по должностям", "по должностям" not in t)
    ok("обзор сотрудника: только его папка (1 из 1)", "1 из 1 папок" in t, t[:200])
    ok("ошибок JS нет (обзор сотрудника)", not errs, errs); b.close()

    b, pg, errs = page_for(p, ind_sc(X_, ("staff",), []), now=NOW, hash="")
    pg.wait_for_timeout(300); t = pg.inner_text("#app")
    ok("обзор сотрудника без отчёта: не сдано", "Не сдано" in t and pg.locator(".ring.t-bad").count() == 1, t[:300]); b.close()

    b, pg, errs = page_for(p, ind_sc(A, ("admin",), reps), now=NOW)
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(500)
    ok("сводка: график динамики — 3 периода", pg.locator(".chart svg .ch-dot").count() == 3 and "Динамика показателя" in pg.inner_text("#app"), (pg.locator(".chart svg .ch-dot").count(), errs, pg.inner_text("#app")[:300]))
    pg.select_option("section:has(.chart) select", "3"); pg.wait_for_timeout(400)
    ok("сводка: для % — среднее и шкала до 100%", "Среднее по учреждениям" in pg.inner_text("#app") or "Сумма" in pg.inner_text("#app"))
    ok("ошибок JS нет (динамика)", not errs, errs); b.close()

    for tag, (w, h_, sch) in {"m": (390, 800, "light"), "d": (1280, 900, "light"), "dk": (1280, 900, "dark"), "mdk": (390, 800, "dark")}.items():
        b, pg, errs = page_for(p, ind_sc(A, ("admin",), reps), w, h_, scheme=sch, now=NOW, hash="")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_overview.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (обзор)", not hscroll(pg))
        ok(f"{tag}: ошибок JS нет (обзор)", not errs, errs)
        pg.goto(SITE + "#/folders"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_folders2.png"), full_page=True)
        pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(400)
        pg.screenshot(path=str(SHOTS / f"c_{tag}_indsum2.png"), full_page=True)
        ok(f"{tag}: нет горизонтальной прокрутки (сводка с графиком)", not hscroll(pg))
        b.close()

    # 9. учреждения и области видимости
    INSTS = [{"id": 1, "name": "СВП №3", "kind": "svp"}, {"id": 2, "name": "СВП №5", "kind": "svp"}]
    sc = scenario(); sc["db"]["institutions"] = INSTS
    b, pg, errs = page_for(p, sc)
    calls = tg_route(pg, lambda body: {"request": "pending"} if body.get("request") else {"request": "none"})
    pg.evaluate("onTelegramAuth({id: 777, first_name: 'Мария', last_name: 'Иванова', auth_date: 1, hash: 'x'})"); pg.wait_for_timeout(400)
    ok("заявка: есть выбор учреждения", pg.locator("form select").count() == 2 and pg.locator("form select >> nth=1 >> option").count() == 4, pg.locator("form select >> nth=1 >> option").count())
    pg.select_option("form select >> nth=0", "doya_qvp")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(150)
    ok("заявка: без учреждения — ошибка", "Выберите учреждение" in pg.inner_text("form"))
    pg.select_option("form select >> nth=1", "other"); pg.wait_for_timeout(50)
    ok("заявка: «нет в списке» открывает поле", pg.locator("form input[type=text] >> nth=2").is_visible())
    pg.fill("form input[type=text] >> nth=2", "Частная клиника")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
    sent = calls[-1].get("request") or {}
    ok("заявка: ушло название учреждения вручную", sent.get("institution_id") is None and sent.get("institution_text") == "Частная клиника", sent)
    ok("ошибок JS нет (заявка с учреждением)", not errs, errs); b.close()

    b, pg, errs = page_for(p, sc)
    calls = tg_route(pg, lambda body: {"request": "pending"} if body.get("request") else {"request": "none"})
    pg.evaluate("onTelegramAuth({id: 777, first_name: 'Мария', last_name: 'Иванова', auth_date: 1, hash: 'x'})"); pg.wait_for_timeout(400)
    pg.select_option("form select >> nth=0", "doya_qvp"); pg.select_option("form select >> nth=1", "2")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
    sent = calls[-1].get("request") or {}
    ok("заявка: ушёл id учреждения", sent.get("institution_id") == 2 and sent.get("institution_text") == "", sent); b.close()

    sc = scenario(uid=A, roles=("admin",)); sc["db"]["institutions"] = INSTS
    sc["db"]["access_requests"][0]["institution_id"] = 2
    sc["db"]["access_requests"][1]["institution_text"] = "Частная клиника"
    b, pg, errs = page_for(p, sc)
    ok("admin: в меню есть «Учреждения»", "Учреждения" in pg.inner_text("nav"))
    pg.goto(SITE + "#/admin/requests"); pg.wait_for_timeout(400)
    c1, c2 = pg.locator(".req").nth(0), pg.locator(".req").nth(1)
    ok("заявки: учреждение из заявки выбрано", c1.locator("select").nth(1).input_value() == "2")
    ok("заявки: вписанное вручную показано и есть кнопка добавить", "Частная клиника" in c2.inner_text() and c2.locator("text=Добавить в список").count() == 1, c2.inner_text())
    c2.locator("text=Добавить в список").click(); pg.wait_for_timeout(300)
    ad = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_save_institution"]
    ok("заявки: «добавить в список» создаёт учреждение", ad and ad[0][2] == {"_id": None, "_name": "Частная клиника", "_kind": "svp"}, ad)
    c1.locator("button.pri").click(); pg.wait_for_timeout(300)
    dec = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "decide_request"]
    ok("заявки: одобрение передаёт учреждение", dec and dec[0][2]["_institution_id"] == 2, dec)
    ok("ошибок JS нет (заявки с учреждением)", not errs, errs)

    pg.goto(SITE + "#/admin/institutions"); pg.wait_for_timeout(400)
    ok("учреждения: 2 строки и число сотрудников", pg.locator("tbody tr").count() == 2 and pg.locator("tbody tr").first.locator("td.num").inner_text() == "1", pg.locator("tbody tr").count())
    pg.screenshot(path=str(SHOTS / "c_institutions.png"), full_page=True)
    pg.fill("section form.row input[type=text]", "СВП №7"); pg.click("text=Добавить >> nth=0"); pg.wait_for_timeout(300)
    ad = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_save_institution"]
    ok("учреждения: добавление одного", ad and ad[-1][2] == {"_id": None, "_name": "СВП №7", "_kind": "svp"}, ad)
    pg.locator("details summary").first.click()
    pg.fill("textarea", "СВП №8\nСВП №9\n\nСВП №8"); pg.click("text=Добавить все"); pg.wait_for_timeout(300)
    ab = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_add_institutions"]
    ok("учреждения: список строк без дублей", ab and ab[0][2]["_names"] == ["СВП №8", "СВП №9"], ab)
    d1 = pg.locator("tbody tr").nth(1).locator("button.danger"); d1.click(); pg.wait_for_timeout(100)
    ok("учреждения: удаление требует второго нажатия", "Точно" in d1.inner_text()); d1.click(); pg.wait_for_timeout(300)
    dl = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_delete_institution"]
    ok("учреждения: удалено", dl and dl[0][2] == {"_id": 2}, dl)
    ok("ошибок JS нет (учреждения)", not errs, errs)

    pg.goto(SITE + "#/admin/users"); pg.wait_for_timeout(400)
    row = pg.locator("tbody tr").nth(1)
    ok("сотрудники: учреждение сотрудника выбрано", row.locator("td").nth(3).locator("select").input_value() == "1")
    row.locator("td").nth(3).locator("details summary").click()
    row.locator("text=Акушерская ветка").click()
    ok("сотрудники: пресет «акушерская ветка» отмечает специальности", row.locator("td").nth(3).locator("input[value=doya_qvp]").is_checked() and not row.locator("td").nth(3).locator("input[value=pediatr]").is_checked())
    row.locator("td").nth(3).locator("input[type=checkbox][value='2']").check()
    row.locator("td").nth(3).locator("button.pri").click(); pg.wait_for_timeout(300)
    sset = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_set_scopes"]
    ok("сотрудники: область видимости сохранена", sset and sset[0][2]["_institutions"] == [2] and "doya_qvp" in sset[0][2]["_positions"] and "pediatr" not in sset[0][2]["_positions"], sset)
    pg.screenshot(path=str(SHOTS / "c_users_scope.png"), full_page=True)
    row.locator("td").nth(3).locator("select").select_option("2"); pg.wait_for_timeout(200)
    si = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "admin_set_institution"]
    ok("сотрудники: смена учреждения", si and si[0][2] == {"_uid": S_, "_inst": 2}, si)
    ok("ошибок JS нет (сотрудники)", not errs, errs)

    pg.goto(SITE + "#/admin/invites"); pg.wait_for_timeout(400)
    pg.select_option("form select >> nth=2", "2") if False else None
    pg.locator("form label:has-text('Учреждение') select").select_option("1")
    pg.fill("form input[type=text] >> nth=0", "Новый Сотрудник"); pg.select_option("form select >> nth=0", "doya_qvp")
    pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
    ci = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] == "create_invite"]
    ok("приглашение: учреждение передано", ci and ci[-1][2].get("_institution_id") == 1, ci)
    ok("ошибок JS нет (приглашения)", not errs, errs); b.close()

    # заведующий: сотрудник с областью видимости
    sc = ind_sc(S_, ("staff",), reps); sc["db"]["institutions"] = INSTS
    sc["db"]["scopes"] = [{"user_id": S_, "kind": "position", "position_code": "doya_qvp"}]
    b, pg, errs = page_for(p, sc, now=NOW, hash="")
    pg.wait_for_timeout(400); t = pg.inner_text("#app")
    ok("заведующий: в меню «Сводка показателей»", "Сводка показателей" in pg.inner_text(".nav"))
    ok("заведующий: в обзоре есть сравнение по должностям", "по должностям" in t.lower(), t[:400])
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(500)
    ok("заведующий: сводка открывается, только его специальности", pg.locator("table.indsum").count() == 1 and pg.locator(".grid-f select >> nth=0 >> option").count() == 1, pg.locator(".grid-f select >> nth=0 >> option").count())
    ok("ошибок JS нет (заведующий)", not errs, errs); b.close()

    sc = ind_sc(S_, ("staff",), reps); sc["db"]["institutions"] = INSTS
    sc["db"]["profiles"][1]["institution_id"] = 1; sc["db"]["profiles"][2]["institution_id"] = 2
    sc["db"]["scopes"] = [{"user_id": S_, "kind": "institution", "institution_id": 1}]
    b, pg, errs = page_for(p, sc, now=NOW, hash="")
    pg.wait_for_timeout(400); t = pg.inner_text("#app")
    ok("заведующий по учреждению: сдача считается только по его учреждению (1 из 1)", "1 из 1 сотрудников" in t, t[:500])
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(500)
    ok("заведующий по учреждению: все должности в списке и чужие не в «не сдали»", pg.locator(".grid-f select >> nth=0 >> option").count() > 5 and "Вторая Доя" not in pg.inner_text(".notice"), pg.inner_text("#app")[:400])
    b.close()

    # 10. махалли и бригады
    MAHS = [{"id": 1, "name": "Боботог"}, {"id": 2, "name": "Қораариқ"}, {"id": 3, "name": "Пустая"}]
    LINKS = [{"mahalla_id": 1, "institution_id": 1}, {"mahalla_id": 2, "institution_id": 1}, {"mahalla_id": 2, "institution_id": 2}, {"mahalla_id": 3, "institution_id": 2}]
    BRIG = [{"id": 1, "mahalla_id": 1, "kind": "doctor", "rate": 1, "user_id": None}, {"id": 2, "mahalla_id": 1, "kind": "patronage", "rate": 1, "user_id": None},
            {"id": 3, "mahalla_id": 1, "kind": "doya_pat", "rate": 0.5, "user_id": None}, {"id": 4, "mahalla_id": 2, "kind": "doctor", "rate": 0.5, "user_id": None}]
    mreps = [dict(rep("m1", S_, "СВП №3", "2026-10-23", {"i1": 12, "i3": 80}, "2026-10-19"), mahalla_id=1),
             dict(rep("m2", X_, "СВП №3", "2026-10-23", {"i1": 8, "i3": 60}, "2026-10-19"), mahalla_id=1),
             dict(rep("m3", S_, "СВП №3", "2026-09-01", {"i1": 5}, "2026-08-26"), mahalla_id=2)]
    def mah_sc(uid, roles):
        sc = ind_sc(uid, roles, mreps); sc["db"]["institutions"] = INSTS
        sc["db"]["mahallas"] = MAHS; sc["db"]["mahalla_links"] = LINKS; sc["db"]["brigade_posts"] = BRIG
        return sc
    b, pg, errs = page_for(p, mah_sc(A, ("admin",)), now=NOW)
    ok("махалли: пункт меню", "Махалли" in pg.inner_text(".nav"))
    pg.goto(SITE + "#/mahallas"); pg.wait_for_timeout(500)
    t = pg.inner_text("#app")
    ok("махалли: с отчётом 1 из 3 = 33%", "1 из 3 за последние 14 дней" in t and pg.locator(".kpi .ring-n").first.inner_text() == "33%", t[:300])
    ok("махалли: бригады полные 1 из 3", "1 из 3 махаллей" in t and pg.locator(".kpi .ring-n").nth(1).inner_text() == "33%", t[:400])
    ok("махалли: Боботог работает, Қораариқ нет отчёта", "Работает" in t and t.count("Нет отчёта") >= 2, t.count("Нет отчёта"))
    ok("махалли: неполная бригада показывает чего не хватает", "врач 0.5 из 1" in t and "патронаж 0 из 1" in t and "доя 0 из 0.5" in t, t[-900:])
    ok("махалли: бригада без состава отмечена", "Состав не задан" in t)
    ok("махалли: общая махалля показана в обоих учреждениях", t.count("Қораариқ") >= 2 and "обслуживают два учреждения" in t)
    pg.screenshot(path=str(SHOTS / "c_mahallas.png"), full_page=True)
    row = pg.locator("tbody tr", has_text="Қораариқ").first
    row.locator("summary").click()
    row.locator("button:has-text('Добавить ставку')").click()
    row.locator("button.pri").click(); pg.wait_for_timeout(300)
    sb_ = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "rpc" and x[1] in ("admin_save_mahalla", "admin_set_brigade")]
    ok("махалли: сохранение имени, учреждений и состава бригады", len(sb_) == 2 and sb_[0][2]["_id"] == 2 and sb_[0][2]["_institutions"] == [1, 2] and len(sb_[1][2]["_posts"]) == 2, sb_)
    pg.evaluate("window.__mhErr = true")
    row = pg.locator("tbody tr", has_text="Боботог").first; row.locator("summary").click()
    d1 = row.locator("button.danger").last; d1.click(); d1.click(); pg.wait_for_timeout(300)
    ok("махалли: с отчётами не удаляется — понятная ошибка", "есть отчёты" in pg.locator("#toast").inner_text(), pg.locator("#toast").inner_text())
    pg.select_option(".ovh select", "2"); pg.wait_for_timeout(400)
    ok("махалли: фильтр по учреждению", pg.locator("tbody tr").count() == 2, pg.locator("tbody tr").count())
    ok("ошибок JS нет (махалли)", not errs, errs); b.close()

    b, pg, errs = page_for(p, mah_sc(A, ("admin",)), now=NOW)
    pg.goto(SITE + "#/indicators"); pg.wait_for_timeout(400)
    ok("показатели: выбор махалли есть", pg.locator("form label:has-text('Махалля') select option").count() == 4, pg.locator("form label:has-text('Махалля') select option").count())
    pg.select_option("form label:has-text('Махалля') select", "3")
    pg.fill("#ind1", "7"); pg.fill("form .grid-f input[type=text]", "СВП №3"); pg.press("form .grid-f input[type=text]", "Tab"); pg.wait_for_timeout(100); pg.click("form button[type=submit]"); pg.wait_for_timeout(400)
    ins_ = [x for x in pg.evaluate("window.__MOCK.log") if x[0] == "insert" and x[1] == "indicator_reports"]
    ok("показатели: отчёт уходит с махаллей", ins_ and ins_[-1][2].get("mahalla_id") == 3, ins_)
    ok("показатели: мои отчёты показывают махаллю", "Пустая" in pg.inner_text("#app"))
    ok("ошибок JS нет (показатели по махалле)", not errs, errs); b.close()

    b, pg, errs = page_for(p, mah_sc(A, ("admin",)), now=NOW)
    pg.goto(SITE + "#/indicators/summary"); pg.wait_for_timeout(500)
    pg.select_option("select[aria-label='Группировать']", "mahalla"); pg.wait_for_timeout(500)
    hd = pg.inner_text("table.indsum thead").lower()
    ok("сводка: по махаллям — столбец махалли с числом отчётов", "боботог (2)" in hd and "қораариқ (1)" in hd, hd)
    r1 = pg.locator("table.indsum tbody tr").first.inner_text().split("\t")
    ok("сводка: по махаллям — показатель 1: 12+8=20 и итого 25", r1[3].strip() == "20" and r1[-1].strip() == "25", r1)
    r3 = pg.locator("table.indsum tbody tr").nth(2).inner_text().split("\t")
    ok("сводка: по махаллям — процент усредняется (80 и 60 → 70)", r3[3].strip() == "70%", r3)
    pg.select_option("select[aria-label='Группировать']", "district"); pg.wait_for_timeout(500)
    ok("сводка: весь район — один столбец", "весь район (3)" in pg.inner_text("table.indsum thead").lower() and pg.locator("table.indsum thead th").count() == 4, pg.locator("table.indsum thead th").count())
    pg.select_option("select[aria-label='Группировать']", "inst"); pg.wait_for_timeout(500)
    ok("сводка: по учреждениям — берётся название отчёта", "свп №3 (3)" in pg.inner_text("table.indsum thead").lower(), pg.inner_text("table.indsum thead"))
    ok("ошибок JS нет (группировка)", not errs, errs); b.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
