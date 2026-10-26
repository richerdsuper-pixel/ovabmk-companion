// node --experimental-strip-types tests/tg_bot_test.ts
import { startCode, bindReply, helloText, approvedText, fmtPhone, isCode } from "../supabase/functions/tg-bot/texts.ts";
let pass = 0, fail = 0;
function t(name: string, cond: boolean, info = "") { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  <- " + info)); cond ? pass++ : fail++; }
const C = "AbCdEfGhIjKlMnOpQrStUvWx12";
t("/start с кодом", startCode("/start " + C) === C);
t("/start@бот с кодом", startCode("/start@OvaBMQbot " + C) === C);
t("/start без кода", startCode("/start") === null);
t("код с чужими символами отклоняется", startCode("/start abc$%^&*()1234567890xyz") === null);
t("короткий код отклоняется", startCode("/start abc") === null);
t("не команда", startCode("привет") === null && startCode(undefined) === null);
t("isCode", isCode(C) && !isCode("x") && !isCode(42));
const S = "https://example.test/";
t("ответ: вход подтверждён на трёх языках", /Вход подтверждён/.test(bindReply("member", S)) && /Kirish tasdiqlandi/.test(bindReply("member", S)) && /тасдиқланди/.test(bindReply("member", S)));
t("ответ: заявка отправлена", /Заявка отправлена/.test(bindReply("pending", S)));
t("ответ: устаревшая ссылка ведёт на сайт", bindReply("expired", S).endsWith(S) && bindReply("что-то", S).endsWith(S));
t("ответ: без анкеты — на сайт", /анкету/.test(bindReply("need_form", S)) && bindReply("need_form", S).endsWith(S));
t("приветствие с адресом сайта", helloText(S).endsWith(S));
t("доступ открыт — с ФИО", approvedText("Каримова Дилноза").startsWith("✅ Каримова Дилноза"));
t("телефон красиво", fmtPhone("+998901234567") === "+998 90 123 45 67");
console.log(`\n${pass}/${pass + fail} passed`); if (fail) process.exit(1);
