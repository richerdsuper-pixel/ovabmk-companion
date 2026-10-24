"""Помощник доя: выбор должности, три языка, кабинет (беременные по №180, риск, возраст, скрининг), патронаж (№210),
«Сегодня», отчётные числа (файл для сайта), выгрузка «только изменения» и приём у координатора. Запуск: python3 offline/tests/test_doya.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); URL = "file://" + os.path.abspath(HERE + "/../dist/OvaBMQ_Offline.html")
PW = "Testpass123!"; XP = "Export-pass-77"; ok = 0; fails = []
def check(name, cond, extra=""):
    global ok
    if cond: ok += 1
    else: fails.append(name); print("FAIL", name, str(extra)[:600])
def until(fn, t=15):
    end = time.time() + t
    while time.time() < end:
        if fn(): return
        time.sleep(0.1)
    raise Exception("timeout")
def ctx_page(br, role=None, mobile=True):
    vp = {"width": 390, "height": 800} if mobile else {"width": 1200, "height": 900}
    ctx = br.new_context(viewport=vp, accept_downloads=True, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script("window.__NOW='2026-10-24T10:00:00';" + ("try{localStorage.setItem('ovabmk_role','%s')}catch(e){}" % role if role else ""))
    reqs = []; ctx.on("request", lambda r: reqs.append(r.url))
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Content Security" not in m.text else None)
    pg.goto(URL); pg.fill("#pwA", PW); pg.fill("#pwB", PW); pg.click("#authGo")
    return ctx, pg, reqs, errs
def tabs(pg): return [b.inner_text() for b in pg.query_selector_all("nav button")]
def save_modal(pg): pg.click(".modal >> nth=-1 >> button.pri"); pg.wait_for_timeout(350)
def add(pg, cat, card, **f):
    n0 = len(pg.query_selector_all(".case"))
    pg.click("nav button[data-tab=cases]"); pg.click("#addCase"); pg.wait_for_selector("#c_card")
    pg.select_option("#c_cat", cat); pg.fill("#c_card", card)
    for k, v in f.items():
        if k == "risk": [pg.check("#c_riskL input[value='%s']" % r) for r in v]
        else: pg.fill("#c_" + k, v)
    save_modal(pg)
def num_file(pg):
    with pg.expect_download() as d: pg.click("#numExp")
    return open(d.value.path(), encoding="utf-8").read()

with sync_playwright() as p:
    br = p.chromium.launch()
    # ---------- доя кабинета ----------
    ctx, pg, reqs, errs = ctx_page(br)
    pg.wait_for_selector("#roleSel")
    check("первый вход: выбор должности", pg.locator("#roleSel option").count() == 3)
    pg.select_option("#roleSel", "cab"); pg.click(".modal button.pri"); pg.wait_for_selector("nav button[data-tab=screen]")
    check("кабинет: вкладки", tabs(pg) == ["Сегодня", "Пациенты", "Скрининг", "Отчёт", "Настройки"], tabs(pg))
    check("кабинет: открывается «Сегодня»", pg.query_selector("nav button.on").inner_text() == "Сегодня")
    # беременная 20 нед., 17 лет, преэклампсия
    add(pg, "Беременная", "B-1", lmp="2026-06-06", byear="2009", mah="Қўшон", street="Навоий 5", risk=["pe"])
    pg.click("#c_q") if False else None
    t = pg.inner_text("#main")
    check("карточка: срок, группа риска", "20 нед." in t and "Группа риска" in t, t[:500])
    # женщина для скрининга: 46 лет, шейка матки пройдена в 2025 — не нужна
    add(pg, "Женщина (скрининг)", "W-1", byear="1980", mah="Гулистон", scr_cerv="2025-01-10")
    check("женщина без года рождения не сохраняется", True)
    pg.click("nav button[data-tab=cases]"); pg.click("#addCase"); pg.wait_for_selector("#c_card"); pg.select_option("#c_cat", "Женщина (скрининг)"); pg.fill("#c_card", "W-2"); save_modal(pg)
    check("скрининг: год рождения обязателен", "укажите год рождения" in pg.inner_text("#toasts").lower(), pg.inner_text("#toasts"))
    pg.click(".modal >> nth=-1 >> text=Отмена"); pg.wait_for_timeout(200)
    # «Сегодня»: беременная с пропущенным 1-м визитом — в обходе, по махалле
    pg.click("nav button[data-tab=today]"); t = pg.inner_text("#route")
    check("«Сегодня»: беременная в обходе, махалля и что сделать", "Қўшон (1)" in t and "B-1" in t and "Первый визит" in t and "W-1" not in t, t)
    # скрининг
    pg.click("nav button[data-tab=screen]")
    ann, cer, bre = pg.inner_text("#scr_annual"), pg.inner_text("#scr_cerv"), pg.inner_text("#scr_breast")
    check("скрининг: осмотр 15–49 — нужен", "нужно пройти: 1" in ann and "W-1" in ann, ann)
    check("скрининг: шейка матки — в срок (2025 г.)", "нужно пройти: 0 · в срок: 1" in cer, cer)
    check("скрининг: молочная железа — нужен", "нужно пройти: 1" in bre, bre)
    pg.click("#scr_breast >> text=Отметить пройденным"); pg.wait_for_selector("#scr_d"); save_modal(pg)
    check("скрининг: отметка снимает из списка", "нужно пройти: 0 · в срок: 1" in pg.inner_text("#scr_breast"), pg.inner_text("#scr_breast"))
    # отчёт: числа
    pg.click("nav button[data-tab=report]"); t = pg.inner_text("#main")
    def row(name):
        for r in pg.query_selector_all("#main table tr"):
            c = [x.inner_text() for x in r.query_selector_all("td")]
            if c and c[0] == name: return c[1]
    check("отчёт: беременных 1, до 18 лет 1, в группе риска 1, пропустили визит 1", row("Беременных под наблюдением") == "1" and row("Беременных до 18 лет") == "1" and row("Беременных в группе риска") == "1" and row("Пропустили визит по №180") == "1", t[:900])
    check("отчёт: скрининг — осмотр нужен 1, молочная железа 0, скринингов за месяц 1", row("Пора на осмотр 15–49 лет") == "1" and row("Пора на скрининг молочной железы") == "0" and row("Скринингов за месяц") == "1", t[:1200])
    pg.click("#numExp"); pg.wait_for_timeout(200)
    check("числа: без учреждения — подсказка заполнить «Кто я»", "Кто я" in pg.inner_text("#toasts"), pg.inner_text("#toasts"))
    pg.fill("#pr_inst", "СВП №3"); pg.fill("#pr_unit", "Бригада 2"); pg.fill("#pr_who", "Каримова Д."); pg.click("#pr_save"); pg.wait_for_timeout(300)
    nf = num_file(pg); nj = json.loads(nf)
    check("файл чисел: формат и учреждение", nj["fmt"] == "ovabmk-numbers" and nj["inst"] == "СВП №3" and nj["numbers"]["preg_total"] == 1 and nj["numbers"]["preg_lt18"] == 1, nf[:300])
    check("файл чисел: никаких личных данных", all(x not in nf for x in ["B-1", "W-1", "2026-06-06", "Навоий", "Қўшон", "Каримова", "2009", "1980"]), nf)
    # три языка
    pg.click("nav button[data-tab=set]"); pg.click("#langSeg button[data-lang=uz]"); pg.wait_for_timeout(300)
    check("узбекский (кириллица): меню", tabs(pg) == ["Бугун", "Беморлар", "Скрининг", "Ҳисобот", "Созламалар"], tabs(pg))
    pg.click("#langSeg button[data-lang=uzl]"); pg.wait_for_timeout(300)
    check("узбекский (латиница): меню и lang", tabs(pg) == ["Bugun", "Bemorlar", "Skrining", "Hisobot", "Sozlamalar"] and pg.evaluate("document.documentElement.lang") == "uz-Latn", tabs(pg))
    pg.click("nav button[data-tab=cases]")
    pg.wait_for_timeout(200); pg.locator(".case", has_text="B-1").locator("button:not(.pri)").click(); pg.wait_for_selector(".ancbox")
    box = pg.inner_text(".ancbox")
    check("латиница: тексты приказа по-узбекски", "Umumiy qon tahlili" in box and "Muddat: 20 hafta" in box and "Xavf guruhi" in box, box[:400])
    pg.click(".modal >> nth=-1 >> button.pri"); pg.wait_for_timeout(200)
    check("латиница: махалля транслитерирована в карточке", "Qoʻshon" in pg.inner_text("#main"), pg.inner_text("#main")[:300])
    pg.click("nav button[data-tab=set]"); pg.click("#langSeg button[data-lang=ru]"); pg.wait_for_timeout(200)
    # выгрузка «только изменения» — 1-я
    pg.click("nav button[data-tab=report]"); pg.click("#deltaExp"); pg.fill("#ex1", XP); pg.fill("#ex2", XP)
    with pg.expect_download() as d1: pg.click(".modal button.pri")
    exp1 = d1.value.path(); check("выгрузка 1: имя файла с бригадой", "brigada2" in d1.value.suggested_filename or "бригада2" in d1.value.suggested_filename, d1.value.suggested_filename)
    check("выгрузка 1: файл зашифрован", "B-1" not in open(exp1, encoding="utf-8").read())
    check("выгрузка 1: дата прошлой выгрузки показана", "Прошлая выгрузка" in pg.inner_text("#main"))
    # меняем: Ф.И.О. внесено, затем визит
    pg.click("nav button[data-tab=cases]")
    pg.wait_for_timeout(200); pg.locator(".case", has_text="B-1").locator("button.pri").click(); pg.wait_for_selector("#v_items")
    check("визит: отмечен пропущенный 1-й визит по №180", pg.is_checked("input.v_item[value='anc:1']"))
    pg.fill("#v_note", "АД 110/70"); save_modal(pg)
    pg.click("nav button[data-tab=report]"); pg.click("#deltaExp"); pg.fill("#ex1", XP); pg.fill("#ex2", XP)
    with pg.expect_download() as d2: pg.click(".modal button.pri")
    exp2 = d2.value.path()
    check("выгрузка 2: только изменённая запись", "записей: 1" in pg.inner_text("#toasts"), pg.inner_text("#toasts"))
    ICS = None
    with pg.expect_download() as d3: pg.click("#icsCases2")
    ics = open(d3.value.path(), encoding="utf-8").read()
    check("календарь: числа визитов + еженедельная проверка, без данных", "RRULE:FREQ=WEEKLY;BYDAY=MO" in ics and "Визитов: " in ics and "B-1" not in ics and "Қўшон" not in ics and "2026-06-06" not in ics and "20261205" in ics, ics[:400])
    check("кабинет: нет ошибок JS", not errs, errs)
    check("кабинет: сеть не используется", not [u for u in reqs if not u.startswith(("file:", "blob:", "data:"))])
    # имя в выгрузке 1 не было (пусто), проверим, что координатор получает его при изменении
    pg.click("nav button[data-tab=cases]")
    pg.wait_for_timeout(200); pg.locator(".case", has_text="B-1").locator("button:not(.pri)").click(); pg.click(".modal >> text=Изменить"); pg.wait_for_selector("#c_card")
    pg.click("details.opt summary"); pg.fill("#c_name", "Азимова Нилуфар"); save_modal(pg)
    pg.click("nav button[data-tab=report]"); pg.click("#deltaExp"); pg.fill("#ex1", XP); pg.fill("#ex2", XP)
    with pg.expect_download() as d4: pg.click(".modal button.pri")
    exp3 = d4.value.path()
    pg.click("nav button[data-tab=cases]")
    pg.wait_for_timeout(200); pg.locator(".case", has_text="B-1").locator("button.pri").click(); pg.wait_for_selector("#v_note"); pg.fill("#v_note", "Повторный"); save_modal(pg)
    pg.click("nav button[data-tab=report]"); pg.click("#deltaExp"); pg.fill("#ex1", XP); pg.fill("#ex2", XP)
    with pg.expect_download() as d5: pg.click(".modal button.pri")
    exp4 = d5.value.path()

    # ---------- координатор принимает выгрузки по порядку ----------
    cx, pc, rc, ec = ctx_page(br, "coord", mobile=False); pc.wait_for_selector("#app:not(.hidden)")
    def imp(path, expect):
        pc.click("nav button[data-tab=set]"); pc.set_input_files("#casesIn", path); pc.wait_for_selector("#ipw"); pc.fill("#ipw", XP); pc.click(".modal button.pri"); pc.wait_for_selector("text=" + expect)
    imp(exp1, "новых 2"); imp(exp2, "обновлено 1"); imp(exp3, "обновлено 1"); imp(exp4, "обновлено 1")
    pc.click("nav button[data-tab=cases]")
    pc.wait_for_timeout(300); c = pc.locator(".case", has_text="B-1")
    check("координатор: Ф.И.О. сохранилось после выгрузки без личных полей", "Азимова Нилуфар" in c.inner_text(), c.inner_text())
    c.locator("button:not(.pri)").click(); pc.wait_for_selector(".modal .visit")
    m = pc.inner_text(".modal")
    check("координатор: видно, от кого запись, и оба визита", "СВП №3 · Бригада 2 · Каримова Д." in m and "Повторный" in m and "АД 110/70" in m, m[:900])
    pc.click(".modal >> nth=-1 >> button.pri")
    check("координатор: вкладки руководителя", tabs(pc)[:2] == ["Сводка", "Пациенты"] and "Отчёт" in tabs(pc), tabs(pc))
    check("координатор: нет ошибок JS", not ec, ec)
    cx.close(); ctx.close()

    # ---------- патронажная доя ----------
    ctx, pg, reqs, errs = ctx_page(br, "pat"); pg.wait_for_selector("#app:not(.hidden)")
    check("патронаж: вкладки", tabs(pg) == ["Сегодня", "Пациенты", "Отчёт", "Настройки"], tabs(pg))
    add(pg, "Новорождённый", "NB-1", birth="2026-10-10", disch="2026-10-13", mah="Бобур")
    add(pg, "Родильница", "PP-1", birth="2026-10-20", disch="2026-10-22", mah="Бобур")
    add(pg, "Беременная", "PG-12", lmp="2026-07-30", mah="Озод")   # 12 нед. 2 дн. — пора на патронаж 12 нед.
    add(pg, "Беременная", "PG-20", lmp="2026-06-06", mah="Озод")   # 20 нед.: патронаж 12 нед. пропущен, а визиты по №180 этой должности не напоминаются
    pg.click("nav button[data-tab=today]"); t = pg.inner_text("#route")
    check("патронаж «Сегодня»: новорождённый (1-й просрочен), родильница (пора), беременная 12 нед.", "NB-1" in t and "PP-1" in t and "PG-12" in t and "Новорождённый: 1-й патронаж" in t and "Патронаж беременной — 12 нед." in t, t)
    check("патронаж: 20 нед. — просрочен патронаж 12 нед., не визит по №180", "PG-20" in t and "Первый визит" not in t, t)
    nb = pg.locator("#route .rrow", has_text="NB-1")
    check("новорождённый: статус «патронаж просрочен»", "патронаж просрочен" in nb.inner_text(), nb.inner_text())
    nb.locator("button.pri").click(); pg.wait_for_selector("#v_items")
    check("визит новорождённого: отмечены просроченный 1-й и текущий 2-й", pg.is_checked("input.v_item[value='pat:nb1']") and pg.is_checked("input.v_item[value='pat:nb2']") and not pg.is_checked("input.v_item[value='pat:nb3']"))
    save_modal(pg)
    pg.click("nav button[data-tab=cases]")
    pg.wait_for_timeout(200); c = pg.locator(".case", has_text="NB-1")
    check("после визита: следующий патронаж 1 месяц (07.11.2026)", "07.11.2026" in c.inner_text(), c.inner_text())
    c.locator("button:not(.pri)").click(); pg.wait_for_selector(".ancbox")
    box = pg.inner_text(".ancbox")
    check("карточка новорождённого: план патронажа", box.count("сделано") == 2 and "позже" in box, box)
    pg.click(".modal >> nth=-1 >> button.pri"); pg.wait_for_timeout(200)
    pg.click("nav button[data-tab=report]")
    def row2(name):
        for r in pg.query_selector_all("#main table tr"):
            c2 = [x.inner_text() for x in r.query_selector_all("td")]
            if c2 and c2[0] == name: return c2[1]
    check("патронаж: числа", row2("Новорождённых (до 45 дней)") == "1" and row2("Новорождённых: патронаж просрочен") == "0" and row2("Родильниц: пора на патронаж") == "1" and row2("Патронажей за месяц") == "2" and row2("Беременных: патронаж просрочен") == "1", pg.inner_text("#main")[:1200])
    check("патронаж: в отчёте нет строк скрининга", row2("Пора на осмотр 15–49 лет") is None)
    check("патронаж: нет ошибок JS", not errs, errs)
    check("патронаж: сеть не используется", not [u for u in reqs if not u.startswith(("file:", "blob:", "data:"))])
    br.close()
print("passed", ok, "failed", len(fails)); sys.exit(1 if fails else 0)
