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
        "pe": "high", "bp": [{"sys": 128, "dia": 82, "at": "2026-10-31T08:00:00Z"}, {"sys": 122, "dia": 78, "at": "2026-10-25T08:00:00Z"}], "today": "2026-11-01", "bmi": 22.5, "height_cm": 160,
        "weights": [{"d": "2026-08-01", "kg": 58, "src": "reg", "ga": 36}, {"d": "2026-10-01", "kg": 61.5, "src": "visit", "ga": 97}, {"d": "2026-10-30", "kg": 66, "src": "self", "ga": 126}],
        "pills": [{"day": "2026-10-30", "kind": "iron"}, {"day": "2026-11-01", "kind": "iodine"}], "pill_hour": 9,
        "questions": [{"id": 3, "q": "Можно ли кофе?", "a": "Не больше 2 чашек", "a_by": "Холова Жамила", "at": "2026-10-30T05:00:00Z"}], "baby": [], "referrals": [{"id": 1, "target": "Акушер-гинеколог", "reason": "Анемия", "due_date": "2026-11-05", "arrived_at": None}],
        "ui": {"signs": [{"k": "bleeding", "label": "Қонли ажралма, қон кетиши"}, {"k": "contractions", "label": "Бир соатда 4–5 тадан кўп тўлғоқ"}, {"k": "vomit", "label": "5 мартадан кўп қусиш"}],
               "topics": [{"k": "food", "title": "🍎 Овқатланиш ва витаминлар", "text": "• Фолий кислотаси 400 мкг"}, {"k": "signs", "title": "⚠️ Қачон дарҳол шифокорга", "text": "• 5 мартадан кўп қусиш"}]}}
VACC = [{"code": "hepb1", "label_ru": "Гепатит B (1)", "label_uz": "Гепатит B (1)", "age_days": 0, "sort": 1}, {"code": "bcg", "label_ru": "БЦЖ", "label_uz": "БЦЖ", "age_days": 2, "sort": 2},
        {"code": "m2", "label_ru": "2 месяца: пентавалентная, полио, ротавирус, пневмококк", "label_uz": "2 ой: пентавалент, полио, ротавирус, пневмококк", "age_days": 60, "sort": 1},
        {"code": "m12", "label_ru": "12 месяцев: КПК", "label_uz": "12 ой: ҚПҚ", "age_days": 365, "sort": 1}]
def run(p, view, tg=True, status=200, search="?l=uz"):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 840}, geolocation={"latitude": 37.95, "longitude": 67.6}, permissions=["geolocation"])
    calls = []
    def fn(route):
        body = json.loads(route.request.post_data or "{}"); calls.append(body)
        if body.get("op") == "alert": route.fulfill(status=200, content_type="application/json", body=json.dumps({"sent": 3}))
        elif body.get("op") == "ask": route.fulfill(status=200, content_type="application/json", body=json.dumps({"qid": 9, "sent": 3}))
        elif body.get("op") == "vacc": route.fulfill(status=200, content_type="application/json", body=json.dumps(VACC))
        elif body.get("op") == "family_invite": route.fulfill(status=200, content_type="application/json", body=json.dumps({"link": "https://t.me/OvaBMQbot?start=f" + "ab" * 12}))
        elif body.get("op") == "family_remove": route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
        elif body.get("op") == "location": route.fulfill(status=200, content_type="application/json", body=json.dumps({"sent": 3}))
        elif body.get("op") in ("weight", "pill", "pill_hour", "baby", "birthplan"): route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
        elif body.get("op") == "bp":
            a, b = body["sys"], body["dia"]; lv = "severe" if a >= 160 or b >= 110 else "high" if a >= 140 or b >= 90 else "ok"
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"level": lv}))
        else: route.fulfill(status=status, content_type="application/json", body=json.dumps(view if status == 200 else {"error": "not_linked"}))
    ctx.route("**/functions/v1/tg-bot", fn)
    ctx.route("**/telegram-web-app.js*", lambda r: r.fulfill(status=200, content_type="application/javascript",
        body=("window.Telegram={WebApp:{initData:'query_id=1&user=%7B%22id%22%3A777%7D&auth_date=1&hash=ab',colorScheme:'light',ready:function(){},expand:function(){},setHeaderColor:function(){},BackButton:{show:function(){},hide:function(){},onClick:function(){}},HapticFeedback:{notificationOccurred:function(){},impactOccurred:function(){}}}};" if tg else "")))
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
    ok("главная: кольцо срока, триместр, до родов", pg.locator("#herocard svg.ring").count() == 1 and "2-триместр" in t and "Туғруққача ≈ 136 кун" in t, t[:400])
    ok("главная: размер малыша по неделям", "банан" not in pg.inner_text("#baby") and "булғор қалампири" in pg.inner_text("#baby"), pg.inner_text("#baby"))
    ok("главная: полоса визитов (пропущен — красный)", pg.locator("#dots .d.missed").count() == 1 and pg.locator("#dots .d.due").count() == 1)
    ok("главная: направление — куда и до какого числа", "Акушер-гинеколог" in pg.inner_text("#ref") and "05.11.2026" in pg.inner_text("#ref"), pg.inner_text("#ref") if pg.locator("#ref").count() else "нет")
    ok("главная: витамины сегодня (после 12 нед без фолиевой)", [x.get_attribute("data-k") for x in pg.query_selector_all("#pills .pill")] == ["iodine", "iron"] and pg.locator("#pills .pill.on").count() == 1)
    pg.click("#pills .pill[data-k=iron]"); pg.wait_for_timeout(300)
    ok("витамины: отметка уходит на сервер", calls[-1].get("op") == "pill" and calls[-1].get("kind") == "iron" and calls[-1].get("on") is True and pg.locator("#pills .pill.on").count() == 2, calls[-1])
    ok("нижнее меню: 5 разделов", [b.get_attribute("data-t") for b in pg.query_selector_all("#tabs button")] == ["home", "charts", "diary", "tips", "more"], [b.inner_text() for b in pg.query_selector_all("#tabs button")])
    pg.click("#sosbtn"); pg.wait_for_timeout(200)
    pg.click("#send"); pg.wait_for_timeout(200)
    ok("без отметки признака — подсказка", "Камида битта" in pg.inner_text("#danger"))
    ok("признаки — с сервера (список протокола)", pg.locator("input[value=vomit]").count() == 1 and "5 мартадан кўп қусиш" in pg.inner_text("#danger"))
    pg.check("input[value=bleeding]"); pg.click("#send"); pg.wait_for_timeout(400)
    ok("сигнал: отправлены признаки", calls[-1].get("op") == "alert" and calls[-1].get("signs") == ["bleeding"], calls[-1])
    ok("сигнал: ответ и кнопка 103", "Хабар юборилди (3)" in pg.inner_text("#danger") and pg.locator("a[href='tel:103']").count() >= 1)
    ok("сигнал: кнопка «отправить, где я»", pg.locator("#loc_btn").count() == 1)
    pg.click("#loc_btn"); pg.wait_for_timeout(800)
    ok("место: координаты уходят на сервер, ответ", calls[-1].get("op") == "location" and abs(calls[-1].get("lat", 0) - 37.95) < 0.01 and "Жой юборилди (3)" in pg.inner_text("#loc"), (calls[-1], pg.inner_text("#loc") if pg.locator("#loc").count() else ""))
    pg.click("#sosmini"); pg.wait_for_timeout(100)
    ok("SOS в шапке открывает тревожные признаки", pg.locator("#danger").count() == 1)
    pg.click("#tabs button[data-t=charts]"); pg.wait_for_timeout(200)
    ok("графики: давление — линия, границы 140/90, последнее значение", pg.locator("#c_bp svg.chart polyline").count() == 2 and pg.locator("#c_bp line.lim").count() == 2 and "128/82" in pg.inner_text("#c_bp"))
    cw = pg.inner_text("#c_w")
    ok("графики: прибавка веса с полосой нормы IOM", pg.locator("#c_w polygon.bandf").count() == 1 and "+8" in cw and "18 ҳафтагача" in cw, cw)
    ok("графики: прибавка больше нормы — совет", "меъёрдан кўп" in cw, cw)
    ok("графики: витамины за 14 дней", pg.locator("#c_pills .c.on").count() == 3 and "2 кун" in pg.inner_text("#c_pills"), pg.inner_text("#c_pills"))
    pg.screenshot(path=str(ROOT / "tests/shots/m_mother_charts.png"), full_page=True)
    pg.click("#tabs button[data-t=tips]"); pg.wait_for_timeout(200)
    ok("вопрос доя: прошлый вопрос с ответом", "Не больше 2 чашек — Холова Жамила" in pg.inner_text("#ask"))
    pg.fill("#q_text", "Когда делать УЗИ?"); pg.click("#q_send"); pg.wait_for_timeout(300)
    ok("вопрос доя: отправлен, ждёт ответа", calls[-1].get("op") == "ask" and calls[-1].get("text") == "Когда делать УЗИ?" and "доянгизга юборилди" in pg.inner_text("#ask") and "жавоб кутилмоқда" in pg.inner_text("#ask"), pg.inner_text("#ask"))
    ok("советы: питание — 9 разделов, первый открыт", pg.locator("details.food").count() == 9 and "Ликопчанинг ярми" in pg.inner_text("#food_plate") and pg.locator("#food_how").count() == 0, pg.inner_text("main")[:300])
    pg.click("#food_vit summary"); pg.wait_for_timeout(100)
    ok("советы: витамины по протоколу и «нельзя»", "400 мкг" in pg.inner_text("#food_vit") and pg.locator("#food_no").count() == 1)
    ok("советы: остальные темы из бота (без повтора питания)", "Қачон дарҳол шифокорга" in pg.inner_text("main") and "Овқатланиш ва витаминлар" not in pg.inner_text("main"))
    pg.click("#tabs button[data-t=diary]"); pg.wait_for_timeout(200)
    ok("дневник: подсказка про риск ПЭ и прошлая запись", "преэклампсия хавфи юқори" in pg.inner_text("main") and "128/82" in pg.inner_text("#bp_list"))
    pg.fill("#bp_sys", "80"); pg.fill("#bp_dia", "120"); pg.click("#bp_save"); pg.wait_for_timeout(200)
    ok("давление: проверка цифр", "текширинг" in pg.inner_text("#bp_out") and not any(c.get("op") == "bp" for c in calls))
    pg.fill("#bp_sys", "150"); pg.fill("#bp_dia", "95"); pg.click("#bp_save"); pg.wait_for_timeout(400)
    ok("давление: 150/95 — высокое, совет и 103", calls[-1].get("op") == "bp" and calls[-1].get("sys") == 150 and "юқори" in pg.inner_text("#bp_out") and pg.locator("#bp_out a[href='tel:103']").count() == 1)
    ok("давление: запись появилась в списке", "150/95" in pg.inner_text("#bp_list"))
    ok("витамины: выбран час напоминания", pg.input_value("#pill_hour") == "9")
    pg.select_option("#pill_hour", "21"); pg.wait_for_timeout(300)
    ok("витамины: новый час уходит на сервер", calls[-1].get("op") == "pill_hour" and calls[-1].get("hour") == 21 and "21:00" in pg.inner_text("#ph_out"), calls[-1])
    pg.fill("#w_kg", "15"); pg.click("#w_save"); pg.wait_for_timeout(200)
    ok("вес: проверка диапазона", "30 дан 200" in pg.inner_text("#w_out") and not any(c.get("op") == "weight" for c in calls))
    pg.fill("#w_kg", "66,4"); pg.click("#w_save"); pg.wait_for_timeout(300)
    ok("вес: запись (запятая как точка)", calls[-1].get("op") == "weight" and calls[-1].get("kg") == 66.4 and "Вазн ёзилди" in pg.inner_text("#w_out"), calls[-1])
    pg.screenshot(path=str(ROOT / "tests/shots/m_mother_diary.png"), full_page=True)
    pg.click("#tabs button[data-t=home]"); pg.wait_for_timeout(200)
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
    pg.click("#tabs button[data-t=more]"); pg.wait_for_timeout(200)
    ok("ещё: план родов на 33 неделе — сверху", pg.locator("#plan").count() == 1 and pg.locator("main .card").first.get_attribute("id") == "plan")
    pg.fill("#pl_place", "Шўрчи туғруқхонаси"); pg.fill("#pl_driver_phone", "901234567"); pg.check("#pl_bag"); pg.click("#pl_save"); pg.wait_for_timeout(300)
    ok("план родов: сохраняется", calls[-1].get("op") == "birthplan" and calls[-1]["p"]["place"] == "Шўрчи туғруқхонаси" and calls[-1]["p"]["bag"] is True and "Сақланди" in pg.inner_text("#plan"), calls[-1])
    ok("ещё: счётчик схваток с 24 недель, шевелений — с 28 (33 нед: оба)", pg.locator("#ct_btn").count() == 1 and pg.locator("#k_btn").count() == 1 and pg.locator("#bag").count() == 1)
    for i in range(4):
        pg.click("#ct_btn"); pg.wait_for_timeout(60); pg.click("#ct_btn"); pg.wait_for_timeout(60)
    ok("схватки: 4 за час до 37 нед — опасный признак и кнопка «сообщить доя»", "4" in pg.inner_text("#ct_hour") and "37 ҳафтагача" in pg.inner_text("#ct_warn") and pg.locator("#ct_alert").count() == 1)
    pg.click("#ct_alert"); pg.wait_for_timeout(300)
    ok("схватки: сигнал доя с признаком «схватки»", calls[-1].get("op") == "alert" and calls[-1].get("signs") == ["contractions"])
    for i in range(10): pg.click("#k_btn"); pg.wait_for_timeout(30)
    ok("шевеления: 10 — хорошо", "10 та қимирлаш — яхши" in pg.inner_text("#kick"), pg.inner_text("#kick"))
    pg.locator("#bag input").nth(0).check(); pg.wait_for_timeout(100); pg.locator("#bag input").nth(2).check(); pg.wait_for_timeout(100)
    ok("сумка в роддом: отметки считаются", "10 тадан 2 таси" in pg.inner_text("#bag_n"), pg.inner_text("#bag_n"))
    pg.screenshot(path=str(ROOT / "tests/shots/m_mother_more.png"), full_page=True)
    ok("ошибок JS нет (схватки)", not errs, errs); b.close()
    fv = dict(VIEW); fv["family"] = [{"id": 5, "relation": "husband", "linked_at": "2026-10-20T10:00:00Z"}]
    b, pg, errs, calls = run(p, fv)
    ok("семья: родственник в списке", "Эри · 20.10.2026" in pg.inner_text("#family"), pg.inner_text("#family"))
    pg.click("#fm_btn"); pg.wait_for_timeout(300)
    ok("семья: ссылка для родственника", calls[-1].get("op") == "family_invite" and "start=fabab" in pg.inner_text("#fm_out") and pg.locator("#fm_share").count() == 1, pg.inner_text("#fm_out"))
    pg.click("#family .vis button"); pg.wait_for_timeout(300)
    ok("семья: отключить родственника", calls[-1].get("op") == "family_remove" and calls[-1].get("id") == 5 and "Эри ·" not in pg.inner_text("#family"))
    fv["family"] = [{"id": 1, "relation": "husband", "linked_at": "2026-10-20"}, {"id": 2, "relation": "mother", "linked_at": "2026-10-21"}]
    pg.close(); b.close(); b, pg, errs, calls = run(p, fv)
    ok("семья: двое — кнопки ссылки нет", pg.locator("#fm_btn").count() == 0 and "Онаси" in pg.inner_text("#family"))
    ok("ошибок JS нет (семья)", not errs, errs); b.close()
    pp = dict(VIEW); pp["status"] = "postpartum"; pp["outcome"] = "delivered"; pp["outcome_date"] = "2026-10-27"; pp["baby"] = []; pp.pop("ui"); pp["state"] = {"pp_day": 5, "anc": [], "home": [{"kind": "pp15", "from": "2026-12-01", "to": "2026-12-04", "state": "next"}]}
    b, pg, errs, calls = run(p, pp)
    ok("после родов: день и признаки ребёнка", "Туғруқдан кейин 5-кун" in pg.inner_text("body") and pg.locator("#tabs button[data-t=more]").count() == 0)
    ok("после родов: вкладка «Малыш»", pg.locator("#tabs button[data-t=baby]").count() == 1)
    pg.click("#tabs button[data-t=baby]"); pg.wait_for_timeout(200)
    ok("малыш: день жизни", "6-куни" in pg.inner_text("#b_day"), pg.inner_text("main")[:200])
    pg.fill("#b_w", "99"); pg.click("#b_w_save"); pg.wait_for_timeout(150)
    ok("малыш: проверка веса", "500 дан 15000" in pg.inner_text("main") and not any(c.get("op") == "baby" for c in calls))
    pg.fill("#b_w", "3400"); pg.click("#b_w_save"); pg.wait_for_timeout(300)
    ok("малыш: вес записан", calls[-1].get("op") == "baby" and calls[-1].get("kind") == "weight" and calls[-1].get("val") == "3400", calls[-1])
    pg.fill("#b_w", "3650"); pg.click("#b_w_save"); pg.wait_for_timeout(300)
    ok("малыш: график веса появился, без пола — просьба указать", pg.locator("#b_chart svg.chart polyline").count() == 1 and "ўғил ёки қиз" in pg.inner_text("#b_chart").lower(), pg.inner_text("#b_chart"))
    pg.click("#b_sex .pill[data-k=f]"); pg.wait_for_timeout(300)
    ok("малыш: пол — девочка, полоса нормы ВОЗ", calls[-1].get("kind") == "sex" and calls[-1].get("val") == "f" and pg.locator("#b_chart polygon.bandf").count() == 1 and "ЖССТ" in pg.inner_text("#b_chart"), pg.inner_text("#b_chart"))
    pg.click("#b_feed .pill[data-k=breast]"); pg.wait_for_timeout(300)
    ok("малыш: кормление грудью отмечено", calls[-1].get("val") == "breast" and pg.locator("#b_feed .pill.on[data-k=breast]").count() == 1)
    vt = pg.inner_text("#vc")
    ok("малыш: календарь прививок — сделать сейчас, скоро, без далёких", pg.locator("#vc .vis[data-code=bcg] button").count() == 1 and "2 ой" in vt and "12 ой" not in vt and pg.locator("#vc .vis[data-code=m2] button").count() == 0, vt)
    pg.click("#vc .vis[data-code=bcg] button"); pg.wait_for_timeout(300)
    ok("малыш: прививка из календаря — «Сделано»", calls[-1].get("op") == "baby" and calls[-1].get("kind") == "vaccine" and calls[-1].get("val") == "bcg" and pg.locator("#vc .vis[data-code=bcg] .chip").count() == 1, calls[-1])
    pg.fill("#b_vac", "БЦЖ"); pg.click("#b_v_save"); pg.wait_for_timeout(300)
    ok("малыш: прививка записана с датой", calls[-1].get("kind") == "vaccine" and calls[-1].get("val") == "БЦЖ" and calls[-1].get("d") and "БЦЖ" in pg.inner_text("#b_vacs"))
    pg.screenshot(path=str(ROOT / "tests/shots/m_mother_baby.png"), full_page=True)
    pg.click("#sosbtn") if pg.locator("#sosbtn").count() else pg.click("#sosmini"); pg.wait_for_timeout(200)
    ok("после родов: признаки ребёнка", pg.locator("input[value=baby_feed]").count() == 1 and pg.locator("input[value=waters]").count() == 0)
    ok("ошибок JS нет (после родов)", not errs, errs); b.close()
    b, pg, errs, calls = run(p, VIEW, status=404)
    ok("не подключена — понятное сообщение", "уланмагансиз" in pg.inner_text("body"))
    b.close()
    b, pg, errs, calls = run(p, VIEW, tg=False)
    ok("вне Telegram — открыть из бота", "@OvaBMQbot" in pg.inner_text("body") and not calls)
    b.close()
print(f"\n{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
