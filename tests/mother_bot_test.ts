// node --experimental-strip-types tests/mother_bot_test.ts
import { motherCode, parseCb, uzLat, tx, signLabel, reminderText, staffAlertText, staffDigestText, verifyInitData, signButtons, menuButtons, SIGNS, langButtons } from "../supabase/functions/tg-bot/mother.ts";
import { startCode } from "../supabase/functions/tg-bot/texts.ts";
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
t("признаки беременной и после родов разные", signButtons("ru", false).length === 9 && signButtons("ru", true).some((r) => r[0].callback_data === "ms:baby_feed"));
t("все признаки подписаны", SIGNS.every((k) => signLabel(k, "ru") !== k && signLabel(k, "uz") !== k));
t("меню: мини-приложение с языком", (menuButtons("uzl", "https://x/mother.html")[0][0] as { web_app: { url: string } }).web_app.url === "https://x/mother.html?l=uzl");
const rem = reminderText({ kind: "open", label: "2-кўрик (18–20 ҳафта)", date_to: "2026-12-05", tests: ["Ҳомила УТТ"], lang: "uzl", first_name: "Dilnoza" });
t("напоминание: латиница, дата, анализы", rem.includes("2-koʻrik") && rem.includes("05.12") && rem.includes("Homila UTT") && rem.includes("Dilnoza"), rem);
t("напоминание «осталось 3 дня»", reminderText({ kind: "soon", label: "Визит 3", date_to: "2026-12-05", tests: [], lang: "ru", first_name: "Д" }).includes("3 дня"));
const al = staffAlertText(["bleeding", "fever"], { mother_name: "Каримова Д.", mother_phone: "+998901234567", mahalla: "Навбаҳор", address: "ул. 1", mother_id: "abc" }, "https://s/");
t("сигнал сотруднику: признаки, телефон, ссылка", al.includes("Кровотечение, Высокая температура") && al.includes("+998 90 123 45 67") && al.includes("https://s/#/mother/abc"), al);
const dg = staffDigestText({ full_name: "Холова Жамила Ибрагимовна", due: 3, missed: 1, home_due: 0, home_missed: 0, alerts: 0 }, "https://s/");
t("сводка доя: только ненулевые строки", dg.includes("Жамила") && dg.includes("визит сейчас: 3") && !dg.includes("патронаж"), dg);

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
console.log(`\n${pass}/${pass + fail} passed`); if (fail) process.exit(1);
