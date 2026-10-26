// node --experimental-strip-types tests/sub_remind_test.ts
import { dailyText, weeklyText } from "../supabase/functions/sub-remind/text.ts";
let pass = 0, fail = 0;
function t(name: string, cond: boolean, info = "") { console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  <- " + info)); cond ? pass++ : fail++; }
const r = (kind: string, id: string, due: string) => ({ user_id: "u", telegram_id: 1, kind, subfolder_id: id, title_ru: "Отчёт " + id, title_uz: "Hisobot " + id, due });
const d = dailyText([r("before", "10.2", "2026-11-05"), r("overdue", "10.7", "2026-10-05")]);
t("ежедневное: оба раздела и дата по-нашему", d.includes("Скоро срок") && d.includes("Срок прошёл") && d.includes("10.2 Отчёт 10.2 / Hisobot 10.2 — 05.11.2026"), d);
t("ежедневное: ссылка на «Сроки сдачи»", d.endsWith("#/due"), d);
t("ежедневное: без просрочек нет красного блока", !dailyText([r("before", "1.4", "2026-11-05")]).includes("🔴"));
const many = dailyText(Array.from({ length: 20 }, (_, i) => r("before", "2." + i, "2026-11-05")));
t("ежедневное: длинный список обрезан", many.includes("… +5") && many.split("\n").length < 22, many);
const w = weeklyText([{ admin_id: "a", telegram_id: 1, subfolder_id: "10.1", title_ru: "Данные", due: "2026-11-05", missing: 3, expected: 7 },
  { admin_id: "a", telegram_id: 1, subfolder_id: "5.2", title_ru: "Охват", due: "2026-11-05", missing: 2, expected: 2 }]);
t("сводка: итог и строки", w.includes("Топширилмаган / Topshirilmagan: 5") && w.includes("10.1 Данные — 05.11.2026: не сдали 3 из 7"), w);
t("в текстах нет узбекской кириллицы в названиях подпапок", !/[ўқғҳ]/.test(d.split("\n").filter((x) => x.startsWith("•")).join("")));
console.log(`\n${pass}/${pass + fail} passed`); if (fail) process.exit(1);
