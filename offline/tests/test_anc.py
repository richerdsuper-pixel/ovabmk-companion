"""Беременные по стандарту (приказ №180) в модуле «Визиты»: срок, окна, пропущенные визиты, напоминания, шифрование. Запуск: python3 offline/tests/test_anc.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); URL="file://"+os.path.abspath(HERE+"/../dist/OvaBMQ_Offline.html")
PW="Testpass123!"; ok=0; fails=[]
def check(name,cond,extra=""):
    global ok
    if cond: ok+=1
    else: fails.append(name); print("FAIL",name,extra)
def until(fn,t=15):
    end=time.time()+t
    while time.time()<end:
        if fn(): return
        time.sleep(0.1)
    raise Exception("timeout")
LMP="2026-06-06"   # на 2026-10-24 ровно 20 нед. 0 дн.
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={"width":390,"height":780},accept_downloads=True)
    ctx.add_init_script("window.__NOW='2026-10-24T10:00:00'")
    reqs=[]; ctx.on("request",lambda r: reqs.append(r.url)); pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)))
    pg.goto(URL); pg.fill("#pwA",PW); pg.fill("#pwB",PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)")
    pg.click("nav >> text=Визиты")
    pg.click("#addCase"); pg.wait_for_selector("#c_card")
    pg.select_option("#c_cat","Ребёнок до 1 года"); check("ДПМ скрыта для обычной категории", not pg.is_visible("#c_lmp"))
    pg.select_option("#c_cat","Беременная"); check("ДПМ появляется для беременной", pg.is_visible("#c_lmp"))
    pg.fill("#c_card","901/1"); pg.fill("#c_lmp","2026-10-30"); pg.fill("#c_next","")
    pg.click(".modal button.pri"); pg.wait_for_timeout(300)
    check("ДПМ в будущем отклоняется", "ДПМ не подходит" in pg.inner_text("body") and len(pg.query_selector_all(".case"))==0)
    pg.fill("#c_lmp",LMP); pg.click(".modal button.pri"); until(lambda: len(pg.query_selector_all(".case"))==1)
    card=pg.inner_text(".case")
    check("в карточке срок 20 нед.", "20 нед." in card, card)
    check("пропущен 1-й визит → просрочено по стандарту", "визит по стандарту просрочен" in card and "Просрочено (1)" in pg.inner_text("#main"), card)
    check("числа для показателей", "Беременных под наблюдением: 1" in pg.inner_text("#anc_counts") and "пропустили визит по стандарту: 1" in pg.inner_text("#anc_counts"), pg.inner_text("#anc_counts"))
    pg.click(".case >> text=Карточка"); pg.wait_for_selector(".ancbox")
    box=pg.inner_text(".ancbox")
    check("карточка: срок и ориентировочные роды", "Срок: 20 нед. 0 дн." in box and "13.03.2027" in box, box[:200])
    check("карточка: просрочен первый визит с анализами", "Просрочено: Первый визит" in box and "ВИЧ (антитела IgM/IgG)" in box, box[:400])
    check("карточка: сейчас визит 2 (18–20 нед.) с УЗИ", "Сейчас: Визит 2" in box and "УЗИ плода" in box and "окно 18–20 нед." in box, box)
    # отметить 1-й визит пройденным
    pg.click(".modal >> text=Пройденные визиты"); pg.wait_for_selector("input[type=checkbox][value='1']")
    pg.check("input[type=checkbox][value='1']"); pg.click(".modal >> nth=-1 >> text=Сохранить"); pg.wait_for_timeout(500)
    card=pg.inner_text(".case")
    check("после отметки: пора на визит по стандарту (сегодня)", "пора на визит по стандарту" in card and "Сегодня (1)" in pg.inner_text("#main"), card)
    check("после отметки: просрочек по стандарту нет", "пропустили визит по стандарту: 0" in pg.inner_text("#anc_counts") and "пора на визит сейчас: 1" in pg.inner_text("#anc_counts"), pg.inner_text("#anc_counts"))
    # записать визит по стандарту №2
    pg.click(".case button.pri"); pg.wait_for_selector("#v_std")
    check("в визите по умолчанию предложен текущий №2", pg.input_value("#v_std")=="2", pg.input_value("#v_std"))
    pg.fill("#v_note","УЗИ 2 триместра сделано"); pg.click(".modal button.pri"); pg.wait_for_selector(".modal",state="detached"); pg.wait_for_timeout(400)
    pg.click(".case >> text=Карточка"); pg.wait_for_selector(".ancbox")
    box=pg.inner_text(".ancbox"); modal=pg.inner_text(".modal")
    check("визит записан как №2 по стандарту", "визит 2 по стандарту" in modal, modal[:300])
    check("дальше — визит 3 (26 нед.)", "Дальше: Визит 3" in box and "ПГТТ с 75 г глюкозы" in box and "05.12.2026" in box, box)
    pg.click(".modal button.pri")
    check("после визита ближайшая дата — через 7 дней (назначена вручную)", "через 7 дн." in pg.inner_text(".case"), pg.inner_text(".case"))
    # данные в хранилище зашифрованы
    JS="""async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('ovabmk-offline');q.onsuccess=()=>r(q.result);q.onerror=j});
      const st=db.transaction('kv').objectStore('kv');
      const vals=await new Promise(r=>{const o=st.getAll();o.onsuccess=()=>r(o.result)});
      return vals.map(x=>x&&x.ct?new TextDecoder('latin1').decode(x.ct):JSON.stringify(x)).join('|')}"""
    blob=pg.evaluate(JS); check("ДПМ и номер карты не лежат открытым текстом", LMP not in blob and "901/1" not in blob)
    # календарь без личных данных
    pg.click("nav >> text=Настройки")
    with pg.expect_download() as d: pg.click("#icsCases")
    ics=open(d.value.path(),encoding="utf-8").read()
    check("ics без ДПМ и номера карты", "Визитов запланировано" in ics and LMP not in ics and "901/1" not in ics and "Беременная" not in ics, ics[:300])
    # закрытая карточка не даёт напоминаний
    pg.click("nav >> text=Визиты"); pg.wait_for_selector(".case"); pg.click(".case button.pri"); pg.wait_for_selector("#v_close"); pg.check("#v_close"); pg.click(".modal button.pri"); pg.wait_for_selector(".modal",state="detached"); pg.wait_for_timeout(400)
    check("закрытая беременная не считается", "Беременных под наблюдением" not in pg.inner_text("#main") and "Просрочено (" not in pg.inner_text("#main"), pg.inner_text("#main")[:300])
    net=[u for u in reqs if not u.startswith(("file:","blob:","data:"))]
    check("сеть не используется", not net, net); check("ошибок JS нет", not errs, errs)
    br.close()
print("passed",ok,"failed",len(fails)); sys.exit(1 if fails else 0)
