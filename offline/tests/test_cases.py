"""Проверка модуля «Визиты»: пациенты, фото, напоминания, шифрование, выгрузка/слияние. Запуск: python3 offline/tests/test_cases.py"""
import os, sys, io, time, json
from PIL import Image
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); URL="file://"+os.path.abspath(HERE+"/../dist/OvaBMQ_Offline.html")
PW="Testpass123!"; XP="Export-pass-77"
ok=0; fails=[]
def check(name,cond,extra=""):
    global ok
    if cond: ok+=1
    else: fails.append(name); print("FAIL",name,extra)
def jpg(color):
    b=io.BytesIO(); Image.new("RGB",(1600,1200),color).save(b,"JPEG"); return {"name":"ph.jpg","mimeType":"image/jpeg","buffer":b.getvalue()}
def start(br,vp,role="cab",url=None):
    ctx=br.new_context(viewport=vp,accept_downloads=True,is_mobile=vp["width"]<500,has_touch=vp["width"]<500)
    ctx.add_init_script("window.__NOW='2026-10-24T10:00:00';try{if(!localStorage.getItem('ovabmk_role'))localStorage.setItem('ovabmk_role','%s')}catch(e){}" % role)
    reqs=[]; ctx.on("request",lambda r: reqs.append(r.url))
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" and "Content Security" not in m.text else None)
    pg.goto(url or URL); pg.fill("#pwA",PW); pg.fill("#pwB",PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)")
    return ctx,pg,reqs,errs
def until(fn,t=15):
    end=time.time()+t
    while time.time()<end:
        if fn(): return
        time.sleep(0.1)
    raise Exception("timeout")
def settle(pg): pg.wait_for_timeout(500)
def add_patient(pg,name,mah,street,diag,nxt,photo=None):
    n0=len(pg.query_selector_all(".case")); pg.click("#addCase"); pg.wait_for_selector("#c_card")
    pg.fill("#c_card",name); pg.fill("#c_mah",mah); pg.fill("#c_street",street); pg.fill("#c_diag",diag); pg.fill("#c_next",nxt)
    if photo: pg.set_input_files("#ph_gal",photo); pg.wait_for_selector(".modal .thumbs .th")
    pg.click(".modal button.pri"); until(lambda: len(pg.query_selector_all(".case"))>n0)
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx,pg,reqs,errs=start(br,{"width":390,"height":780})
    pg.click("nav >> text=Пациенты"); check("empty hint", "Здесь будут ваши пациенты" in pg.inner_text("#main"))
    pg.screenshot(path=HERE+"/shot_cases_empty_mobile.png")
    add_patient(pg,"1234/5","Қўшон","Навоий 12","Беременность 32 нед.","2026-10-24",jpg("red"))
    add_patient(pg,"778/2","Гўзаллик","Янги 5","Новорождённый, желтуха","2026-10-23")
    add_patient(pg,"56","Қоқайди","Боғ 3","Послеродовый период","2026-10-25")
    t=pg.inner_text("#main")
    check("3 cards", len(pg.query_selector_all(".case"))==3, len(pg.query_selector_all(".case")))
    check("groups late/today/tomorrow", "Просрочено (1)" in t and "Сегодня (1)" in t and "Завтра (1)" in t, t[:600])
    check("alert", "сегодня 1, просрочено 1" in pg.inner_text("#cases_alert"))
    check("late badge", "просрочено на 1 дн." in t)
    pg.screenshot(path=HERE+"/shot_cases_mobile.png",full_page=True)
    # поиск
    pg.fill("#c_q","қоқайди"); check("search by mahalla", len(pg.query_selector_all(".case"))==1)
    pg.fill("#c_q","желтуха"); check("search by diagnosis", "778/2" in pg.inner_text("#main") and len(pg.query_selector_all(".case"))==1)
    pg.fill("#c_q","")
    # визит с фото
    card=[c for c in pg.query_selector_all(".case") if "1234/5" in c.inner_text()][0]
    card.query_selector("button.pri").click(); pg.wait_for_selector("#v_note")
    pg.fill("#v_note","АД 110/70, отёков нет"); pg.set_input_files("#ph_gal",jpg("blue")); pg.wait_for_selector(".modal .thumbs .th")
    pg.fill("#c_next","2026-10-31"); pg.click(".modal button.pri"); pg.wait_for_selector(".modal",state="detached"); settle(pg)
    t=pg.inner_text("#main"); check("visit moved to week group", "В ближайшие 7 дней (1)" in t and "Сегодня (" not in t, t[:500])
    check("alert gone for today", "сегодня 0, просрочено 1" in pg.inner_text("#cases_alert"), pg.inner_text("#cases_alert"))
    card=[c for c in pg.query_selector_all(".case") if "1234/5" in c.inner_text()][0]
    check("card shows 2 photos? last visit has 1", "📷 1" in card.inner_text())
    card.query_selector("text=Карточка").click(); pg.wait_for_selector(".modal .visit")
    check("2 visits listed", len(pg.query_selector_all(".modal .visit"))==2 and "АД 110/70" in pg.inner_text(".modal"))
    until(lambda: len(pg.query_selector_all(".modal .th img[src^='data:image/jpeg']"))==2)
    check("photos decrypted & shown", True)
    pg.click(".modal .visit .th >> nth=0"); pg.wait_for_selector(".bigph"); check("photo opens big", True)
    pg.click(".modal >> nth=-1 >> text=Закрыть"); pg.click(".modal button.pri")
    # данные в IndexedDB зашифрованы
    JS="""async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('ovabmk-offline');q.onsuccess=()=>r(q.result);q.onerror=j});
      const st=db.transaction('kv').objectStore('kv');
      const vals=await new Promise(r=>{const o=st.getAll();o.onsuccess=()=>r(o.result)});
      const keys=await new Promise(r=>{const o=st.getAllKeys();o.onsuccess=()=>r(o.result)});
      return {keys, dump: vals.map(x=>x&&x.ct?new TextDecoder('latin1').decode(x.ct):JSON.stringify(x)).join('|')}}"""
    dbi=pg.evaluate(JS); raw=json.dumps(dbi["keys"]); blob=dbi["dump"]
    check("case keys stored", '"c:' in raw and '"f:' in raw, raw[:200])
    check("no plaintext names in storage", "1234/5" not in blob and "Қўшон" not in blob and "Беременность" not in blob)
    # ics без данных
    pg.click("nav >> text=Настройки")
    with pg.expect_download() as d: pg.click("#icsCases")
    ics=open(d.value.path(),encoding="utf-8").read()
    check("ics has counts only", "Визитов: " in ics and "1234/5" not in ics and "Навоий" not in ics and "Беременность" not in ics and "778/2" not in ics, ics[:300])
    # без ключа администратора отправить нельзя — понятное объяснение, без паролей
    pg.click("nav >> text=Настройки"); pg.click("#expCases"); pg.wait_for_selector(".modal >> text=ссылку-приглашение")
    check("без ключа: просьба открыть ссылку-приглашение", "Отправить администратору" in pg.inner_text(".modal") or "ссылку-приглашение" in pg.inner_text(".modal")); pg.click(".modal button.pri")
    # --- администратор (второе устройство): ключ создаётся сам, приглашение — ссылкой или файлом
    ctxB,pb,reqsB,errsB=start(br,{"width":1100,"height":800},"coord")
    pb.click("nav >> text=Настройки"); kidB=pb.inner_text("#myKid"); link=pb.input_value("#invLink")
    check("администратор: ключ создан, ссылка-приглашение", len(kidB)==8 and "/app/#k=" in link, (kidB, link))
    with pb.expect_download() as dk: pb.click("#invFile")
    pg.set_input_files("#casesIn",dk.value.path()); pg.wait_for_selector("text=Ключ администратора получен")
    check("доя: ключ принят, код совпадает", pg.inner_text("#keyKid")==kidB, pg.inner_text("#keyKid"))
    # ссылка-приглашение: ключ из адреса запоминается до входа и сохраняется после
    ctxL,pl,_,errsL=start(br,{"width":390,"height":780},"pat",URL+"#k="+link.split("#k=")[1])
    pl.click("nav >> text=Настройки")
    check("ссылка-приглашение: ключ сохранён, адрес очищен", pl.inner_text("#keyKid")==kidB and "#k=" not in pl.url, (pl.inner_text("#keyKid"), pl.url)); ctxL.close()
    # выгрузка: без паролей
    with pg.expect_download() as d2: pg.click("#expCases")
    check("выгрузка без вопроса о пароле", pg.query_selector("#ex1") is None)
    expA=d2.value.path(); et=open(expA,encoding="utf-8").read()
    check("export encrypted", "1234/5" not in et and "ovabmk-cases" in et and "778/2" not in et and '"v": 3' in et.replace('"v":3','"v": 3'))
    pg.reload(); pg.fill("#pwA",PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)")
    check("login toast about visits", "Нужно посетить: сегодня" in pg.inner_text("#toasts"), pg.inner_text("#toasts"))
    pb.set_input_files("#casesIn",expA); pb.wait_for_selector("text=новых 3")
    check("администратор принял файл без пароля", pb.query_selector("#ipw") is None)
    pb.click("nav >> text=Пациенты"); check("B has 3 patients", len(pb.query_selector_all(".case"))==3)
    pb.locator(".case", has_text="1234/5").locator("text=Карточка").click(); pb.wait_for_selector(".modal .visit")
    until(lambda: len(pb.query_selector_all(".modal .th img[src^='data:image/jpeg']"))==2); check("B got photos", True)
    pb.click(".modal button.pri")
    pb.click("nav >> text=Настройки"); pb.set_input_files("#casesIn",expA); pb.wait_for_selector("text=без изменений 3")
    check("re-import is idempotent", True)
    # чужой администратор не откроет файл
    ctxC,pc,_,_=start(br,{"width":1100,"height":800},"coord"); pc.click("nav >> text=Настройки")
    pc.set_input_files("#casesIn",expA); pc.wait_for_selector("text=другого администратора")
    check("файл не открывается у другого администратора", len(pc.evaluate("Object.keys(S.cases)"))==0); ctxC.close()
    # A: визит Саидовой и удаление Ивановой → B получает изменения
    pg.click("nav >> text=Пациенты")
    pg.locator(".case", has_text="Карта № 56").locator("button.pri").click(); pg.wait_for_selector("#v_note"); pg.fill("#v_note","Осмотр на дому"); pg.fill("#c_next","2026-11-02"); pg.click(".modal button.pri"); pg.wait_for_selector(".modal",state="detached"); settle(pg)
    pg.locator(".case", has_text="1234/5").locator("text=Карточка").click(); pg.click(".modal button.danger"); pg.click(".modal button.danger"); pg.wait_for_selector("text=Удалено")
    check("A deleted patient", len(pg.query_selector_all(".case"))==2)
    pg.click("nav >> text=Настройки")
    with pg.expect_download() as d4: pg.click("#expCases")
    pb.set_input_files("#casesIn",d4.value.path()); pb.wait_for_selector("text=обновлено 2")
    pb.click("nav >> text=Пациенты"); tb=pb.inner_text("#main")
    check("B: deletion propagated, Saidova visit merged", "1234/5" not in tb and len(pb.query_selector_all(".case"))==2, tb[:300])
    pb.locator(".case", has_text="Карта № 56").locator("text=Карточка").click(); pb.wait_for_selector(".modal .visit")
    check("B has Saidova visit from A", "Осмотр на дому" in pb.inner_text(".modal")); pb.click(".modal button.pri")
    # перезапуск: напоминание при входе + сохранность
    pg.reload(); pg.fill("#pwA",PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)")
    check("доя: открывается «Сегодня»", pg.query_selector("nav button.on").inner_text()=="Сегодня")
    # режим «специалист»
    pg.click("nav >> text=Настройки"); pg.click("#roleChange"); pg.wait_for_selector("#roleSel"); pg.select_option("#roleSel","pat"); pg.click(".modal button.pri"); pg.wait_for_timeout(300)
    check("field mode tabs", [b.inner_text() for b in pg.query_selector_all("nav button")]==["Сегодня","Пациенты","Отчёт","Настройки"], [b.inner_text() for b in pg.query_selector_all("nav button")])
    pg.reload(); pg.fill("#pwA",PW); pg.click("#authGo"); pg.wait_for_selector("#app:not(.hidden)")
    check("field mode persists + starts on cases", pg.query_selector("nav button.on").inner_text()=="Сегодня" and len(pg.query_selector_all("nav button"))==4, [b.inner_text() for b in pg.query_selector_all("nav button")])
    # блокировка очищает память
    pg.evaluate("lockNow()"); check("lock clears cases", pg.evaluate("Object.keys(S.cases).length")==0 and "778/2" not in pg.inner_text("body"))
    # сеть
    for name,rq in (("A",reqs),("B",reqsB)):
        net=[u for u in rq if not u.startswith(("file:","blob:","data:"))]; check("no network "+name, not net, net)
    check("no JS errors A", not errs, errs); check("no JS errors B", not errsB, errsB)
    br.close()
print("passed",ok,"failed",len(fails)); sys.exit(1 if fails else 0)
