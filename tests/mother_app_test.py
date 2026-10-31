"""Мини-приложение беременной (docs/mother.html) на мок-данных: python3 tests/mother_app_test.py"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]; URL = (ROOT / "docs/mother.html").as_uri()
res = []
def ok(n, c, i=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  <- {i}"))
VIEW = {"lang": "uz", "full_name": "Каримова Дилноза Анваровна", "status": "pregnant", "risk": "high", "institution": "ОШП №3",
        "doya": {"name": "Холова Жамила", "phone": "+998901112233"},
        "state": {"ga_days": 129, "edd": "2027-03-17", "next_anc": {"no": 2, "from": "2026-11-04", "to": "2026-11-24", "state": "due"},
                  "anc": [{"no": 1, "from": "2026-07-01", "to": "2026-09-29", "state": "missed", "date": None}, {"no": 2, "from": "2026-11-04", "to": "2026-11-24", "state": "due", "date": None},
                          {"no": 3, "from": "2026-12-09", "to": "2026-12-29", "state": "next", "date": None}],
                  "home": [{"kind": "ant32", "from": "2027-01-27", "to": "2027-02-09", "state": "next", "date": None}]},
        "schedule": [{"no": 1, "label": "Первый визит", "label_uz": "1-кўрик", "tests": [], "tests_uz": []},
                     {"no": 2, "label": "Визит 2 (18–20 недель)", "label_uz": "2-кўрик (18–20 ҳафта)", "tests": ["УЗИ плода"], "tests_uz": ["Ҳомила УТТ"]},
                     {"no": 3, "label": "Визит 3", "label_uz": "3-кўрик", "tests": [], "tests_uz": []}],
        "home_schedule": [{"kind": "ant32", "label": "Патронаж беременной, 32 недели", "label_uz": "Ҳомиладор патронажи, 32 ҳафта"}], "visits": [],
        "pe": "high", "bp": [{"sys": 128, "dia": 82, "at": "2026-10-31T08:00:00Z"}],
        "ui": {"signs": [{"k": "bleeding", "label": "Қонли ажралма, қон кетиши"}, {"k": "contractions", "label": "Бир соатда 4–5 тадан кўп тўлғоқ"}, {"k": "vomit", "label": "5 мартадан кўп қусиш"}],
               "topics": [{"k": "food", "title": "🍎 Овқатланиш ва витаминлар", "text": "• Фолий кислотаси 400 мкг"}, {"k": "signs", "title": "⚠️ Қачон дарҳол шифокорга", "text": "• 5 мартадан кўп қусиш"}]}}
def run(p, view, tg=True, status=200, search="?l=uz"):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 840})
    calls = []
    def fn(route):
        body = json.loads(route.request.post_data or "{}"); calls.append(body)
        if body.get("op") == "alert": route.fulfill(status=200, content_type="application/json", body=json.dumps({"sent": 3}))
        elif body.get("op") == "bp":
            a, b = body["sys"], body["dia"]; lv = "severe" if a >= 160 or b >= 110 else "high" if a >= 140 or b >= 90 else "ok"
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"level": lv}))
        else: route.fulfill(status=status, content_type="application/json", body=json.dumps(view if status == 200 else {"error": "not_linked"}))
    ctx.route("**/functions/v1/tg-bot", fn)
    ctx.route("**/telegram-web-app.js*", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=("window.Telegram={WebApp:{initData:'query_id=1&user=%7B%22id%22%3A777%7D&auth_date=1&hash=ab',colorScheme:'light',ready:function(){},expand:function(){},HapticFeedback:{notificationOccurred:function(){}}}};" if tg else "")))
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + search); pg.wait_for_timeout(500)
    return b, pg, errs, calls
with sync_playwright() as p:
    b, pg, errs, calls = run(p, VIEW)
    t = pg.inner_text("body")
    ok("приветствие по имени", "Ассалому алайкум, Дилноза!" in t, t[:200])
    ok("срок 18 ҳафта 3 кун и ПДР", pg.inner_text("#ga") == "18 ҳафта 3 кун" and "17.03.2027" in t)
    ok("пропущенный визит — просьба прийти", "ўтказиб юбордингиз: 1-кўрик" in t)
    ok("следующий визит с анализами", "2-кўрик (18–20 ҳафта)" in pg.inner_text("#next") and "Ҳомила УТТ" in pg.inner_text("#next"))
    ok("контакт доя: кнопка звонка", pg.get_attribute("a.call", "href") == "tel:+998901112233")
    ok("подпись Telegram отправлена на сервер", calls and calls[0]["init"].startswith("query_id=") and calls[0]["action"] == "mother_app" and calls[0]["op"] == "view", calls[:1])
    pg.click("#send"); pg.wait_for_timeout(200)
    ok("без отметки признака — подсказка", "Камида битта" in pg.inner_text("#danger"))
    ok("признаки — с сервера (список протокола)", pg.locator("input[value=vomit]").count() == 1 and "5 мартадан кўп қусиш" in pg.inner_text("#danger"))
    pg.check("input[value=bleeding]"); pg.click("#send"); pg.wait_for_timeout(400)
    ok("сигнал: отправлены признаки", calls[-1].get("op") == "alert" and calls[-1].get("signs") == ["bleeding"], calls[-1])
    ok("сигнал: ответ и кнопка 103", "Хабар юборилди (3)" in pg.inner_text("#danger") and pg.locator("#danger a[href='tel:103']").count() >= 1)
    ok("вкладки: главное, советы, давление (без схваток до 24 нед)", [b.inner_text() for b in pg.query_selector_all("#tabs button")] == ["Асосий", "Маслаҳатлар", "Қон босими"], [b.inner_text() for b in pg.query_selector_all("#tabs button")])
    pg.click("#tabs button[data-t=tips]"); pg.wait_for_timeout(200)
    ok("советы: разделы справки", "Овқатланиш ва витаминлар" in pg.inner_text("main") and "400 мкг" in pg.inner_text("main"))
    pg.click("#tabs button[data-t=bp]"); pg.wait_for_timeout(200)
    ok("давление: подсказка про риск ПЭ и прошлая запись", "преэклампсия хавфи юқори" in pg.inner_text("main") and "128/82" in pg.inner_text("#bp_list"))
    pg.fill("#bp_sys", "80"); pg.fill("#bp_dia", "120"); pg.click("#bp_save"); pg.wait_for_timeout(200)
    ok("давление: проверка цифр", "текширинг" in pg.inner_text("#bp_out") and not any(c.get("op") == "bp" for c in calls))
    pg.fill("#bp_sys", "150"); pg.fill("#bp_dia", "95"); pg.click("#bp_save"); pg.wait_for_timeout(400)
    ok("давление: 150/95 — высокое, совет и 103", calls[-1].get("op") == "bp" and calls[-1].get("sys") == 150 and "юқори" in pg.inner_text("#bp_out") and pg.locator("#bp_out a[href='tel:103']").count() == 1)
    ok("давление: запись появилась в списке", "150/95" in pg.inner_text("#bp_list"))
    pg.click("#tabs button[data-t=main]"); pg.wait_for_timeout(200)
    pg.click(".langs button[data-l=uzl]"); pg.wait_for_timeout(300)
    ok("латиница", "Assalomu alaykum, Dilnoza!" in pg.inner_text("body") and pg.inner_text("#ga") == "18 hafta 3 kun", pg.inner_text("body")[:200])
    ok("смена языка сохраняется", any(c.get("op") == "lang" and c.get("lang") == "uzl" for c in calls))
    pg.click(".langs button[data-l=ru]"); pg.wait_for_timeout(300)
    ok("русский", "Здравствуйте, Дилноза!" in pg.inner_text("body") and "УЗИ плода" in pg.inner_text("#next"))
    ok("без прокрутки вбок", not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"))
    pg.screenshot(path=str(ROOT / "tests/shots/m_mother_app.png"), full_page=True)
    ok("ошибок JS нет", not errs, errs); b.close()
    late = json.loads(json.dumps(VIEW)); late["state"]["ga_days"] = 230
    b, pg, errs, calls = run(p, late)
    ok("схватки: вкладка с 24 недель", pg.locator("#tabs button[data-t=ct]").count() == 1)
    pg.click("#tabs button[data-t=ct]"); pg.wait_for_timeout(200)
    for i in range(4):
        pg.click("#ct_btn"); pg.wait_for_timeout(60); pg.click("#ct_btn"); pg.wait_for_timeout(60)
    ok("схватки: 4 за час до 37 нед — опасный признак и кнопка «сообщить доя»", "4" in pg.inner_text("#ct_hour") and "37 ҳафтагача" in pg.inner_text("#ct_warn") and pg.locator("main button.danger").count() == 1)
    pg.click("main button.danger"); pg.wait_for_timeout(300)
    ok("схватки: сигнал доя с признаком «схватки»", calls[-1].get("op") == "alert" and calls[-1].get("signs") == ["contractions"])
    ok("ошибок JS нет (схватки)", not errs, errs); b.close()
    pp = dict(VIEW); pp["status"] = "postpartum"; pp.pop("ui"); pp["state"] = {"pp_day": 5, "anc": [], "home": [{"kind": "pp15", "from": "2026-12-01", "to": "2026-12-04", "state": "next"}]}
    b, pg, errs, calls = run(p, pp)
    ok("после родов: день и признаки ребёнка", "Туғруқдан кейин 5-кун" in pg.inner_text("body") and pg.locator("input[value=baby_feed]").count() == 1 and pg.locator("input[value=waters]").count() == 0)
    ok("ошибок JS нет (после родов)", not errs, errs); b.close()
    b, pg, errs, calls = run(p, VIEW, status=404)
    ok("не подключена — понятное сообщение", "уланмагансиз" in pg.inner_text("body"))
    b.close()
    b, pg, errs, calls = run(p, VIEW, tg=False)
    ok("вне Telegram — открыть из бота", "@OvaBMQbot" in pg.inner_text("body") and not calls)
    b.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
