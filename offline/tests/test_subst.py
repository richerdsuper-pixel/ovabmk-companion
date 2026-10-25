"""Замещение в офлайн-программе: вторая должность на время отпуска коллеги (из ключа активации), передача пациенток
напрямую замещающей и возврат после отпуска; файлы открываются только у получателя. Запуск: python3 offline/tests/test_subst.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from tok import init_script, token
HERE = os.path.dirname(os.path.abspath(__file__)); URL = "file://" + os.path.abspath(HERE + "/../dist/OvaBMQ_Offline.html")
PW = "Testpass123!"; ok = 0; fails = []
ADMIN = {"x": "Bfulls4vL1m2clJKWzu548Zh10po9zTxmO4wXcpCV3Q", "y": "Gn6WNxqWbOHzmZB27UAIjIZhrwyPV8lO4NM9nhTQRPw"}   # любой допустимый ключ
def check(name, cond, extra=""):
    global ok
    if cond: ok += 1
    else: fails.append(name); print("FAIL", name, str(extra)[:500])
def start(br, role, uid, now="2026-10-24T10:00:00", name="Тест"):
    ctx = br.new_context(viewport={"width": 390, "height": 800}, accept_downloads=True, is_mobile=True, has_touch=True)
    ctx.add_init_script(init_script(None, now=now))
    ctx.add_init_script("try{if(!localStorage.getItem('ovabmk_tok'))localStorage.setItem('ovabmk_tok',%s)}catch(e){}" % json.dumps(token(role, k=ADMIN, uid=uid, name=name)))
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.fill("#pwA", PW); pg.fill("#pwB", PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)"); pg.wait_for_timeout(300)
    return ctx, pg, errs
def tabs(pg): return [b.inner_text() for b in pg.query_selector_all("nav button")]
def pub_of(pg):
    pg.click("nav button[data-tab=set]"); href = pg.get_attribute("#dkLink", "href")
    x, y = href.split("pub=")[1].split("."); return {"x": x, "y": y}
def new_key(pg, tok):
    pg.click("nav button[data-tab=set]"); pg.click("#newKey"); pg.wait_for_selector("#actIn"); pg.fill("#actIn", tok); pg.click(".modal >> nth=-1 >> button.pri"); pg.wait_for_timeout(600)

with sync_playwright() as p:
    br = p.chromium.launch()
    # A — доя кабинета (уходит в отпуск), B — патронажная доя (замещает)
    ca, pa, ea = start(br, "cab", "u-A", name="Азимова Н.")
    cb, pb, eb = start(br, "pat", "u-B", name="Холова Ж.")
    pubA, pubB = pub_of(pa), pub_of(pb)
    check("ключ устройства: ссылка на сайт для сохранения", len(pubA["x"]) == 43 and pubA != pubB)
    check("ключ устройства: ссылка ведёт на страницу «Офлайн-программа» сайта", "/#/offline?pub=" in pa.get_attribute("#dkLink", "href"))
    # у A пациентка
    pa.click("nav button[data-tab=cases]"); pa.click("#addCase"); pa.wait_for_selector("#c_card")
    pa.select_option("#c_cat", "Беременная"); pa.fill("#c_card", "A-77"); pa.fill("#c_lmp", "2026-06-06"); pa.fill("#c_mah", "Қўшон"); pa.click(".modal >> nth=-1 >> button.pri"); pa.wait_for_timeout(400)
    # отпуск разрешён: A получает ключ с «кому передать», B — с должностью A до конца отпуска
    new_key(pa, token("cab", k=ADMIN, uid="u-A", name="Азимова Н.", handover=[{"to": "Холова Ж.", "from": "2026-10-24", "until": "2026-11-10", "k": pubB}]))
    pa.click("nav button[data-tab=report]")
    check("отсутствующая: блок «Вас замещает»", "Вас замещает Холова Ж." in pa.inner_text("#substPanel"), pa.inner_text("#main")[:300])
    with pa.expect_download() as d1: pa.click("#substPanel button[data-ho]")
    f1 = d1.value.path(); raw = open(f1, encoding="utf-8").read()
    check("передача: файл зашифрован", "A-77" not in raw and '"v": 3' in raw.replace('"v":3', '"v": 3'))
    new_key(pb, token("pat", k=ADMIN, uid="u-B", name="Холова Ж.", extra=[{"role": "cab", "from": "2026-10-24", "until": "2026-11-10", "of": "Азимова Н.", "uid": "u-A", "k": pubA}]))
    check("замещающая: вкладки двух должностей (скрининг — от доя кабинета)", "Скрининг" in tabs(pb) and "Отчёт" in tabs(pb), tabs(pb))
    pb.click("nav button[data-tab=set]")
    check("замещающая: в настройках видна временная должность", "Доя кабинета" in pb.inner_text("#extraNow") and "Азимова Н." in pb.inner_text("#extraNow"), pb.inner_text("#main")[:400])
    pb.set_input_files("#casesIn", f1); pb.wait_for_selector("text=новых 1")
    pb.click("nav button[data-tab=cases]")
    card = pb.locator(".case", has_text="A-77")
    check("замещающая: пациентка получена, видны визиты по №180 (вторая должность)", card.count() == 1 and "визит по стандарту" in card.inner_text(), card.inner_text() if card.count() else "")
    # чужой не откроет
    cc, pc, ec = start(br, "pat", "u-C")
    pc.click("nav button[data-tab=set]"); pc.set_input_files("#casesIn", f1); pc.wait_for_selector("text=другого администратора")
    check("передача: третий сотрудник файл не открывает", pc.evaluate("Object.keys(S.cases).length") == 0); cc.close()
    # B делает визит и возвращает
    card.locator("button.pri").click(); pb.wait_for_selector("#v_note"); pb.fill("#v_note", "Осмотр замещающей"); pb.click(".modal >> nth=-1 >> button.pri"); pb.wait_for_timeout(500)
    pb.click("nav button[data-tab=report]")
    check("замещающая: блок «Вы замещаете», к возврату 1 пациентка", "Вы замещаете" in pb.inner_text("#substPanel") and "Пациенток от неё у вас: 1" in pb.inner_text("#substPanel"), pb.inner_text("#substPanel"))
    with pb.expect_download() as d2: pb.click("#substPanel button[data-ret]")
    pa.click("nav button[data-tab=set]"); pa.set_input_files("#casesIn", d2.value.path()); pa.wait_for_selector("text=обновлено 1")
    pa.click("nav button[data-tab=cases]"); pa.locator(".case", has_text="A-77").locator("button:not(.pri)").click(); pa.wait_for_selector(".modal .visit")
    check("возврат: визит замещающей виден у отсутствующей", "Осмотр замещающей" in pa.inner_text(".modal"))
    pa.click(".modal >> nth=-1 >> button.pri")
    # после отпуска вторая должность пропадает
    cb2 = br.new_context(viewport={"width": 390, "height": 800}); cb2.add_init_script(init_script(None, now="2026-11-15T10:00:00"))
    cb2.add_init_script("try{localStorage.setItem('ovabmk_tok',%s)}catch(e){}" % json.dumps(token("pat", k=ADMIN, uid="u-B", iat=time.mktime(time.strptime("2026-11-15", "%Y-%m-%d")),
        extra=[{"role": "cab", "from": "2026-10-24", "until": "2026-11-10", "of": "Азимова Н.", "uid": "u-A", "k": pubA}])))
    p2 = cb2.new_page(); p2.goto(URL); p2.fill("#pwA", PW); p2.fill("#pwB", PW); p2.click("#authGo"); p2.wait_for_selector("#app:not(.hidden)"); p2.wait_for_timeout(300)
    check("после отпуска: только своя должность", "Скрининг" not in [b.inner_text() for b in p2.query_selector_all("nav button")], [b.inner_text() for b in p2.query_selector_all("nav button")])
    check("ошибок JS нет", not ea and not eb, ea + eb)
    br.close()
print("passed", ok, "failed", len(fails)); sys.exit(1 if fails else 0)
