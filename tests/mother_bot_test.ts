// node --experimental-strip-types tests/mother_bot_test.ts
import { motherCode, parseCb, uzLat, tx, signLabel, reminderText, staffAlertText, staffDigestText, verifyInitData, signButtons, menuButtons, SIGNS, langButtons } from "../supabase/functions/tg-bot/mother.ts";
import { startCode } from "../supabase/functions/tg-bot/texts.ts";
import { parseBp, visitText, doyaText, SIGNS_PREG } from "../supabase/functions/tg-bot/mother.ts";
import { TOPICS, topicText, tipText, TIP_TOPICS } from "../supabase/functions/tg-bot/info.ts";
import { parseStaffCb, dayText, dayButtons, markText, questionText, parseQid, answerText, pillText, pillButtons, parsePillCb, staffMenu } from "../supabase/functions/tg-bot/extra.ts";
let pass = 0, fail = 0;
function t(name: string, cond: boolean, info: unknown = "") { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  <- " + JSON.stringify(info))); cond ? pass++ : fail++; }
const C = "m0123456789abcdef01234567";
t("код беременной распознаётся", motherCode("/start " + C) === C && motherCode("/start@OvaBMQbot " + C) === C);
t("код сотрудника не путается с кодом беременной", motherCode("/start AbCdEfGhIjKlMnOpQrStUvWx12345678") === null && startCode("/start AbCdEfGhIjKlMnOpQrStUvWx12345678") !== null);
t("неверный код беременной", motherCode("/start m0123") === null && motherCode("/start M0123456789ABCDEF01234567") === null);
t("кнопка языка", JSON.stringify(parseCb("ml:uzl:" + C)) === JSON.stringify({ k: "ml", lang: "uzl", code: C }));
t("кнопка согласия", parseCb("mc:ru:" + C)?.k === "mc");
t("кнопка признака — только из списка", parseCb("ms:bleeding")?.sign === "bleeding" && parseCb("ms:hack") === null);
t("чужие данные кнопки отклоняются", parseCb("xx") === null && parseCb(42) === null && parseCb("ml:de:" + C) === null);
t("кнопки языков укладываются в 64 байта", langButtons(C)[0].every((b) => b.callback_data.length <= 64));
t("латиница", uzLat("Ҳомиладор ўз ғамини") === "Homilador oʻz gʻamini" && uzLat("Ёқимсиз") === "Yoqimsiz", uzLat("Ҳомиладор ўз ғамини"));
t("согласие на трёх языках", /Вы согласны/.test(tx("consent", "ru")) && /Розимисиз/.test(tx("consent", "uz")) && /Rozimisiz/.test(tx("consent", "uzl")));
t("согласие упоминает /stop", tx("consent", "ru").includes("/stop") && tx("consent", "uz").includes("/stop"));
t("признак при тревоге — звонить 103", tx("danger_sent", "uz", { sign: signLabel("bleeding", "uz"), n: 2 }).includes("103") && tx("danger_sent", "ru", { sign: "x", n: 1 }).includes("103"));
t("признаки беременной — список протокола 180 (13 + судороги)", SIGNS_PREG.length === 14 && ["vomit", "discharge", "contractions", "trauma", "moves", "urine", "itch", "fever38"].every((k) => SIGNS_PREG.includes(k)));
t("признаки беременной и после родов разные", signButtons("ru", false).length === 14 && signButtons("ru", true).some((r) => r[0].callback_data === "ms:baby_feed"));
t("все признаки подписаны", SIGNS.every((k) => signLabel(k, "ru") !== k && signLabel(k, "uz") !== k));
t("меню: мини-приложение с языком", (menuButtons("uzl", "https://x/mother.html")[0][0] as { web_app: { url: string } }).web_app.url === "https://x/mother.html?l=uzl");
const rem = reminderText({ kind: "open", label: "2-кўрик (18–20 ҳафта)", date_to: "2026-12-05", tests: ["Ҳомила УТТ"], lang: "uzl", first_name: "Dilnoza" });
t("напоминание: латиница, дата, анализы", rem.includes("2-koʻrik") && rem.includes("05.12") && rem.includes("Homila UTT") && rem.includes("Dilnoza"), rem);
t("напоминание «осталось 3 дня»", reminderText({ kind: "soon", label: "Визит 3", date_to: "2026-12-05", tests: [], lang: "ru", first_name: "Д" }).includes("3 дня"));
const al = staffAlertText(["bleeding", "fever"], { mother_name: "Каримова Д.", mother_phone: "+998901234567", mahalla: "Навбаҳор", address: "ул. 1", mother_id: "abc" }, "https://s/");
t("сигнал сотруднику: признаки, телефон, ссылка", al.includes("кровотечение, Высокая температура") && al.includes("+998 90 123 45 67") && al.includes("https://s/#/mother/abc"), al);
const dg = staffDigestText({ full_name: "Холова Жамила Ибрагимовна", due: 3, missed: 1, home_due: 0, home_missed: 0, alerts: 0 }, "https://s/");
t("сводка доя: только ненулевые строки", dg.includes("Жамила") && dg.includes("визит сейчас: 3") && !dg.includes("патронаж"), dg);

// давление в чате
t("давление: 120/80, 120 80, 120\\80", JSON.stringify(parseBp("120/80")) === '{"sys":120,"dia":80}' && parseBp(" 135 85 ")?.dia === 85 && parseBp("120\\80")?.sys === 120);
t("давление: мусор и нижнее > верхнего — нет", parseBp("привет") === null && parseBp("80/120") === null && parseBp("12/8") === null && parseBp(42) === null);
// меню: все кнопки укладываются в 64 байта и есть разделы
const mb = menuButtons("ru", "https://x/m.html").flat() as { callback_data?: string }[];
t("меню: разделы и тревога", ["mi:visit", "mi:bp", "mi:food", "mi:life", "mi:signs", "mi:birth", "mi:after", "mi:call", "ma"].every((c) => mb.some((b) => b.callback_data === c)));
t("кнопки разделов разбираются", parseCb("mi:food")?.sign === "food" && parseCb("mi:hack") === null);
// справка и советы
t("справка: все разделы на трёх языках", TOPICS.every((k) => topicText(k, "ru").length > 200 && topicText(k, "uz").length > 200 && !/[а-яё]/i.test(topicText(k, "uzl").replace(/[^а-яёА-ЯЁ]/g, "").slice(0, 1) || "")));
t("справка: витамины по протоколу", topicText("food", "ru").includes("400 мкг") && topicText("food", "ru").includes("200 мкг") && topicText("food", "uz").includes("йодиди"));
t("справка: тревожные признаки протокола", ["больше 5 раз", "4–5 схваток", "38°", "24 недель"].every((x) => topicText("signs", "ru").includes(x)));
t("советы: все сроки, при высоком риске ПЭ — про давление", TIP_TOPICS.includes("w24") && tipText("w24", "ru", "Дилноза", "high").includes("давление") && !tipText("pp1", "ru", "", "high").includes("преэклампсии"));
t("советы: латиница", tipText("w28", "uzl", "Dilnoza", "low").includes("hafta") && tipText("nope", "ru", "", "") === "");
const VV = { status: "pregnant", institution: "ОШП №3", doya: { name: "Холова Жамила", phone: "+998901112233" },
  state: { ga_days: 129, edd: "2027-03-17", next_anc: { no: 2, from: "2026-11-04", to: "2026-11-24", state: "due" }, anc: [{ no: 1, state: "missed" }], home: [{ kind: "ant32", from: "2027-01-27", to: "2027-02-09", state: "next" }] },
  schedule: [{ no: 1, label: "Первый визит", label_uz: "1-кўрик", tests: [] }, { no: 2, label: "Визит 2", label_uz: "2-кўрик", tests: ["УЗИ плода"], tests_uz: ["Ҳомила УТТ"] }] };
const vt = visitText(VV, "ru");
t("мой визит: срок, пропуск, визит сейчас, анализы, патронаж", ["18 нед 3 дн", "пропустили визит: Первый визит", "Сейчас время визита: Визит 2", "УЗИ плода", "домой"].every((x) => vt.includes(x)), vt);
t("мой визит: узбекский", visitText(VV, "uz").includes("Ҳомила УТТ"));
t("моя доя: имя и телефон", doyaText(VV, "ru").includes("+998 90 111 22 33") && doyaText(VV, "uzl").includes("Xolova"));

// подпись мини-приложения
const BOT = "123456:ABC-test";
async function sign(fields: Record<string, string>): Promise<string> {
  const enc = new TextEncoder();
  const dc = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sec = new Uint8Array(await crypto.subtle.sign("HMAC", k1, enc.encode(BOT)));
  const k2 = await crypto.subtle.importKey("raw", sec, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(dc))), (x) => x.toString(16).padStart(2, "0")).join("");
  return new URLSearchParams({ ...fields, hash: h }).toString();
}
const now = Date.now(), f = { auth_date: String(Math.floor(now / 1000) - 60), query_id: "AAE", user: JSON.stringify({ id: 777, first_name: "Dilnoza" }) };
const good = await sign(f);
t("подпись Telegram верна", (await verifyInitData(good, BOT, 86400, now))?.id === 777);
t("чужой токен — отказ", (await verifyInitData(good, "999:other", 86400, now)) === null);
t("подменённый пользователь — отказ", (await verifyInitData(good.replace("777", "778"), BOT, 86400, now)) === null);
t("старая подпись — отказ", (await verifyInitData(await sign({ ...f, auth_date: String(Math.floor(now / 1000) - 90000) }), BOT, 86400, now)) === null);
t("мусор — отказ", (await verifyInitData("hash=zz", BOT)) === null && (await verifyInitData("", BOT)) === null);

// сотрудник в боте
const U = "0b5e2a6c-1d2f-4a3b-9c8d-7e6f5a4b3c2d";
t("кнопки сотрудника: список, визит, патронаж", parseStaffCb("sd")?.k === "sd" && JSON.stringify(parseStaffCb(`sa:${U}:2`)) === JSON.stringify({ k: "sa", mother: U, code: "2" }) && parseStaffCb(`sh:${U}:pp15`)?.k === "sh");
t("кнопки сотрудника: мусор и визит 9 — нет", parseStaffCb(`sa:${U}:9`) === null && parseStaffCb("sa:x:1") === null && parseStaffCb(`zz:${U}:1`) === null);
const rows = [{ mother_id: U, full_name: "Каримова Дилноза Анваровна", phone: "+998901234567", mahalla: "Навбаҳор", kind: "anc", code: "2", state: "missed", date_to: "2026-10-20" },
  { mother_id: U, full_name: "Холова Шаҳло", phone: null, mahalla: null, kind: "home", code: "pp15", state: "due", date_to: "2026-11-04" }];
const dt = dayText(rows, "https://s/");
t("список дня: пропущенные, телефон, патронаж, ссылка", dt.includes("🔴 Каримова Дилноза Анваровна — визит 2 (пропущен)") && dt.includes("+998 90 123 45 67") && dt.includes("патронаж 15 дн (до 04.11)") && dt.includes("https://s/#/mothers"), dt);
const db = dayButtons(rows).flat() as { callback_data: string; text: string }[];
t("список дня: кнопки отметки ≤ 64 байт", db.every((b) => b.callback_data.length <= 64) && db[0].text.startsWith("✅ Каримова Д.") && db[0].callback_data === `sa:${U}:2`);
t("список дня: пусто — понятно", dayText([], "https://s/").includes("нет"));
t("отметка: новая и повтор", markText({ ok: true, new: true, name: "К" }, "sa", "2").includes("Отмечено сегодня") && markText({ ok: true, new: false, name: "К" }, "sh", "pp3").includes("Уже было"));
t("меню сотрудника: сайт внутри Telegram", (staffMenu("https://s/")[0][0] as { web_app: { url: string } }).web_app.url === "https://s/");
// вопрос и ответ
const qt = questionText(123, "Можно кофе?", "Каримова Д.", "+998901234567", U, "https://s/");
t("вопрос: номер, текст, как ответить", qt.includes("#q123") && qt.includes("«Можно кофе?»") && qt.includes("Ответить") && parseQid(qt) === 123 && parseQid("без номера") === null);
t("ответ беременной: язык", answerText("ru", "Можно кофе?", "Не больше 2 чашек", "Холова Жамила").includes("Не больше 2 чашек") && answerText("uzl", "Q", "A", "Холова").includes("Xolova"));
// витамины
t("напоминание о витаминах: список и кнопки", pillText("ru", "Дилноза", ["iodine", "iron"]).includes("Калия йодид, Железо") && pillButtons("uz", ["iodine", "iron"])[1][0].callback_data === "mp:all:iodine,iron");
t("кнопки витаминов разбираются", JSON.stringify(parsePillCb("mp:iron")) === '["iron"]' && JSON.stringify(parsePillCb("mp:all:iodine,iron")) === '["iodine","iron"]' && parsePillCb("mp:aspirin") === null);
console.log(`\n${pass}/${pass + fail} passed`); if (fail) process.exit(1);
