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
    {user_id:'%s', full_name:'Сотрудник Тест', user_position:'Доя', telegram_username:'staff_t', roles:['staff'], folders:[1], created_at:'2026-10-21T08:00:00Z'}]; },
  create_invite: function(){ return '0123456789abcdef01234567'; },
  admin_set_role: function(a){ return a._role==='admin' && !a._on ? {error:{message:'last_admin'}} : null; },
  decide_request: function(){ return null; },
  admin_set_folders: function(){ return null; }, admin_update_profile: function(){ return null; }, revoke_invite: function(){ return null; }
};""" % (A, S_)

def page_for(p, sc, w=1280, h=900, scheme="light", search=""):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
    ctx.add_init_script("window.__MOCK=" + json.dumps(sc, ensure_ascii=False) + ";" + RPC)
    ctx.route("**/supabase.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MOCK))
    ctx.route("**/telegram-widget.js*", lambda r: r.fulfill(status=200, content_type="application/javascript", body="/* stub */"))
    ctx.route("**/fonts.g*/**", lambda r: r.abort())
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(SITE + search); pg.wait_for_timeout(400)
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
    pg.screenshot(path=str(SHOTS / "c_users.png"), full_page=True)
    pg.goto(SITE + "#/admin/invites"); pg.wait_for_timeout(300)
    pg.fill("form input[type=text] >> nth=0", "Новый сотрудник"); pg.click("form button[type=submit]"); pg.wait_for_timeout(300)
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
    ok("заявки: одобрение с ролью и изменёнными папками", dec and dec[0][2] == {"_id": "r1", "_approve": True, "_role": "staff", "_folders": [9, 10, 12]}, dec)
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

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
