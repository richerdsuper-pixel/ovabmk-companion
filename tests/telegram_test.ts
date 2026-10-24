// node --experimental-strip-types tests/telegram_test.ts
import { telegramHash, verifyTelegram, checkString } from "../supabase/functions/tg-login/telegram.ts";
const token = "123456:TEST-ONLY-NOT-A-REAL-TOKEN";
const now = 1_800_000_000;
let pass = 0, fail = 0;
function t(name: string, cond: boolean) { console.log((cond ? "PASS " : "FAIL ") + name); cond ? pass++ : fail++; }
const base: Record<string, unknown> = { id: 777000111, first_name: "Иван", username: "ivan_t", auth_date: now - 30 };
const hash = await telegramHash(base, token);
const good = { ...base, hash };
t("строка проверки отсортирована и без hash", checkString(good) === `auth_date=${now - 30}\nfirst_name=Иван\nid=777000111\nusername=ivan_t`);
t("верная подпись принимается", await verifyTelegram(good, token, 3600, now));
t("подмена id отклоняется", !(await verifyTelegram({ ...good, id: 777000112 }, token, 3600, now)));
t("подмена имени отклоняется", !(await verifyTelegram({ ...good, first_name: "Пётр" }, token, 3600, now)));
t("чужой токен бота отклоняется", !(await verifyTelegram(good, "999:OTHER", 3600, now)));
t("старые данные (>1 ч) отклоняются", !(await verifyTelegram(good, token, 3600, now + 4000)));
t("данные из будущего отклоняются", !(await verifyTelegram(good, token, 3600, now - 1000)));
t("без hash отклоняется", !(await verifyTelegram(base, token, 3600, now)));
t("лишнее поле-объект отклоняется", !(await verifyTelegram({ ...good, x: { a: 1 } }, token, 3600, now)));
t("пустой токен отклоняется", !(await verifyTelegram(good, "", 3600, now)));
t("null отклоняется", !(await verifyTelegram(null, token, 3600, now)));
t("hash в верхнем регистре тоже принимается", await verifyTelegram({ ...base, hash: hash.toUpperCase() }, token, 3600, now));
console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
