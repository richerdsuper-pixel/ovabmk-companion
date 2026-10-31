// Бот для беременной: тексты на узбекском (кириллица и латиница) и русском, разбор кодов и кнопок, проверка данных мини-приложения.
// Без сети — проверяется в tests/mother_bot_test.ts.
export type Lang = "uz" | "uzl" | "ru";

// Узбекский кириллицей → латиницей (как на сайте, docs/i18n.js)
const M: Record<string, string> = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p",
  "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "ъ": "ʼ", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ё": "yo", "ў": "oʻ",
  "қ": "q", "ғ": "gʻ", "ҳ": "h", "ы": "i", "е": "e" };
const VOW = "аеёиоуўэюяъАЕЁИОУЎЭЮЯ";
export function uzLat(str: string): string {
  if (!str) return str;
  let out = "", prev = "";
  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i), lo = c.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(M, lo)) { out += c; prev = c; continue; }
    let r = M[lo];
    if (lo === "е" && (prev === "" || !/[A-Za-zЀ-ӿʻʼ]/.test(prev) || VOW.indexOf(prev) >= 0)) r = "ye";
    if (c !== lo && r) {
      const nx = str.charAt(i + 1), allUp = nx && nx === nx.toUpperCase() && nx !== nx.toLowerCase();
      r = allUp && r.length > 1 ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1);
    }
    out += r; prev = c;
  }
  return out;
}

export function motherCode(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = /^\/start(?:@\w+)?\s+(m[0-9a-f]{24})\s*$/.exec(text.trim());
  return m ? m[1] : null;
}
export function isLang(x: unknown): x is Lang { return x === "uz" || x === "uzl" || x === "ru"; }

// кнопки: ml:<lang>:<code> — язык; mc:<lang>:<code> — согласие; mn — отказ; ma — тревожные признаки; ms:<sign> — признак; mh — помощь
export function parseCb(data: unknown): { k: string; lang?: Lang; code?: string; sign?: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  let m = /^(ml|mc):(uz|uzl|ru):(m[0-9a-f]{24})$/.exec(data);
  if (m) return { k: m[1], lang: m[2] as Lang, code: m[3] };
  m = /^ms:([a-z_]{2,30})$/.exec(data);
  if (m && SIGNS.includes(m[1])) return { k: "ms", sign: m[1] };
  if (data === "mn" || data === "ma" || data === "mh" || data === "ma_pp") return { k: data };
  return null;
}

// тревожные признаки (ВОЗ, «опасные признаки» при беременности, после родов и у новорождённого)
export const SIGNS_PREG = ["bleeding", "headache", "convulsions", "abd_pain", "fever", "waters", "less_move", "swelling", "breath"];
export const SIGNS_PP = ["pp_bleeding", "fever", "pp_discharge", "headache", "convulsions", "breath", "baby_feed", "baby_fever", "baby_breath", "baby_jaundice", "baby_cord", "baby_convulsions"];
export const SIGNS = Array.from(new Set([...SIGNS_PREG, ...SIGNS_PP]));

const SG: Record<string, [string, string]> = {   // [русский, узбекский кириллицей]
  bleeding: ["Кровотечение", "Қон кетиши"], headache: ["Сильная головная боль, мелькание перед глазами", "Кучли бош оғриғи, кўз олди қоронғилашиши"],
  convulsions: ["Судороги", "Тутқаноқ"], abd_pain: ["Сильная боль в животе", "Қоринда кучли оғриқ"], fever: ["Высокая температура", "Юқори ҳарорат"],
  waters: ["Подтекают воды", "Сув кетяпти"], less_move: ["Ребёнок мало шевелится", "Бола кам қимирлаяпти"], swelling: ["Отёки лица и рук", "Юз ва қўл шиши"],
  breath: ["Трудно дышать", "Нафас олиш қийин"], pp_bleeding: ["Сильное кровотечение после родов", "Туғруқдан кейин кучли қон кетиши"],
  pp_discharge: ["Выделения с неприятным запахом", "Ёқимсиз ҳидли ажралма"], baby_feed: ["Малыш не сосёт", "Чақалоқ эммаяпти"],
  baby_fever: ["Малыш горячий или холодный", "Чақалоқ иссиқ ёки совуқ"], baby_breath: ["Малыш дышит часто или с трудом", "Чақалоқ тез ёки қийналиб нафас оляпти"],
  baby_jaundice: ["Малыш жёлтый", "Чақалоқ сарғайган"], baby_cord: ["Пупок красный или гноится", "Киндик қизарган ёки йиринглаган"],
  baby_convulsions: ["У малыша судороги", "Чақалоқда тутқаноқ"],
};
export function signLabel(k: string, lang: Lang): string { const x = SG[k]; if (!x) return k; return lang === "ru" ? x[0] : lang === "uzl" ? uzLat(x[1]) : x[1]; }
export function signRu(k: string): string { return SG[k] ? SG[k][0] : k; }

const T: Record<string, [string, string]> = {
  choose_lang: ["Выберите язык", "Тилни танланг"],
  consent: ["Здравствуйте! Ваша доя пригласила вас в бот «OvaBMҚ». Здесь вы увидите срок беременности, даты визитов и нужные анализы, получите напоминания, а при тревожных признаках сможете сразу сообщить доя.\n\n" +
    "Ваши данные (Ф.И.О., телефон, адрес, сведения о беременности) видят только медработники, которые вас наблюдают. Вы можете отключиться в любой момент командой /stop.\n\nВы согласны?",
    "Ассалому алайкум! Доянгиз сизни «OvaBMҚ» ботига таклиф қилди. Бу ерда ҳомиладорлик муддати, кўрик саналари ва керакли таҳлилларни кўрасиз, эслатмалар оласиз, хавфли белгилар бўлса доянгизга дарҳол хабар бера оласиз.\n\n" +
    "Маълумотларингизни (Ф.И.Ш., телефон, манзил, ҳомиладорлик ҳақидаги маълумотлар) фақат сизни кузатаётган тиббиёт ходимлари кўради. Исталган пайтда /stop буйруғи билан узилишингиз мумкин.\n\nРозимисиз?"],
  yes: ["✅ Согласна", "✅ Розиман"], no: ["Нет", "Йўқ"],
  declined: ["Хорошо, вы не подключены. Если передумаете — попросите у доя новую ссылку.", "Яхши, сиз уланмадингиз. Фикрингиз ўзгарса — доядан янги ҳавола сўранг."],
  expired: ["Ссылка устарела или уже использована. Попросите у доя новую.", "Ҳавола эскирган ёки ишлатилган. Доядан янгисини сўранг."],
  welcome: ["{name}, вы подключены! Нажмите «Моя страница», чтобы увидеть срок, визиты и анализы. Я буду напоминать о визитах.",
    "{name}, сиз уландингиз! Муддат, кўриклар ва таҳлилларни кўриш учун «Менинг саҳифам»ни босинг. Кўриклар ҳақида эслатиб тураман."],
  page: ["📋 Моя страница", "📋 Менинг саҳифам"], danger: ["⚠️ Тревожные признаки", "⚠️ Хавфли белгилар"],
  danger_pick: ["Что случилось? Выберите — я сразу сообщу вашей доя.\n\n🚑 Если состояние тяжёлое — звоните 103 прямо сейчас, не ждите.",
    "Нима бўлди? Танланг — доянгизга дарҳол хабар бераман.\n\n🚑 Аҳвол оғир бўлса — ҳозироқ 103 га қўнғироқ қилинг, кутманг."],
  danger_sent: ["🚑 «{sign}» — это опасный признак. Звоните 103 или срочно поезжайте в роддом. Не ждите звонка.\n\nСообщение отправлено вашей доя и медработникам ({n}) — с вами свяжутся.",
    "🚑 «{sign}» — бу хавфли белги. 103 га қўнғироқ қилинг ёки дарҳол туғруқхонага боринг. Қўнғироқни кутманг.\n\nДоянгиз ва тиббиёт ходимларига хабар юборилди ({n}) — сиз билан боғланишади."],
  danger_nobody: ["🚑 «{sign}» — это опасный признак. Звоните 103 или срочно поезжайте в роддом.", "🚑 «{sign}» — бу хавфли белги. 103 га қўнғироқ қилинг ёки дарҳол туғруқхонага боринг."],
  not_linked: ["Вы не подключены. Попросите у доя ссылку-приглашение.", "Сиз уланмагансиз. Доядан таклиф ҳаволасини сўранг."],
  stopped: ["Вы отключены: напоминаний больше не будет. Подключиться снова можно по новой ссылке от доя.", "Сиз узилдингиз: эслатмалар бошқа келмайди. Доядан янги ҳавола билан яна уланишингиз мумкин."],
  help: ["Выберите:", "Танланг:"],
  rem_open: ["🔔 {name}, начался срок визита: {label}. Подойдите к доя до {to}.", "🔔 {name}, кўрик муддати бошланди: {label}. {to} гача доянгизга келинг."],
  rem_soon: ["⏰ {name}, до конца срока визита «{label}» осталось 3 дня (до {to}). Пожалуйста, подойдите к доя.", "⏰ {name}, «{label}» кўрик муддати тугашига 3 кун қолди ({to} гача). Илтимос, доянгизга келинг."],
  rem_tests: ["Нужно сдать:", "Топшириш керак:"],
  staff_alert: ["⚠️ Беременная сообщила о тревожном признаке: {signs}\n{name}{phone}{where}\nПозвоните ей сейчас. Карточка: {link}", ""],
  staff_digest: ["Доброе утро, {name}! Беременные вашего учреждения на сегодня:\n{lines}\nСписок: {link}", "Хайрли тонг, {name}! Муассасангиз ҳомиладорлари бугун:\n{lines}\nРўйхат: {link}"],
};
export function tx(k: string, lang: Lang, v: Record<string, string | number> = {}): string {
  const x = T[k]; let s = !x ? k : lang === "ru" ? x[0] : lang === "uzl" ? uzLat(x[1]) : x[1];
  for (const n of Object.keys(v)) s = s.split("{" + n + "}").join(String(v[n]));
  return s;
}
export function langButtons(code: string) {
  return [[{ text: "Ўзбекча", callback_data: `ml:uz:${code}` }, { text: "Oʻzbekcha", callback_data: `ml:uzl:${code}` }, { text: "Русский", callback_data: `ml:ru:${code}` }]];
}
export function consentButtons(lang: Lang, code: string) {
  return [[{ text: tx("yes", lang), callback_data: `mc:${lang}:${code}` }, { text: tx("no", lang), callback_data: "mn" }]];
}
export function menuButtons(lang: Lang, appUrl: string) {
  return [[{ text: tx("page", lang), web_app: { url: appUrl + "?l=" + lang } }], [{ text: tx("danger", lang), callback_data: "ma" }]];
}
export function signButtons(lang: Lang, postpartum: boolean) {
  return (postpartum ? SIGNS_PP : SIGNS_PREG).map((k) => [{ text: signLabel(k, lang), callback_data: `ms:${k}` }]);
}
const d2 = (iso: string) => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) : "";
export function reminderText(r: { kind: string; label: string; date_to: string; tests: unknown; lang: string; first_name: string }): string {
  const lang: Lang = isLang(r.lang) ? r.lang : "uz";
  const label = lang === "uzl" ? uzLat(r.label) : r.label;
  let s = tx(r.kind === "soon" ? "rem_soon" : "rem_open", lang, { name: r.first_name || "", label, to: d2(r.date_to) });
  const tests = Array.isArray(r.tests) ? (r.tests as string[]).map((x) => lang === "uzl" ? uzLat(x) : x) : [];
  if (tests.length) s += "\n\n" + tx("rem_tests", lang) + "\n• " + tests.join("\n• ");
  return s;
}
export function staffAlertText(signs: string[], a: { mother_name: string; mother_phone: string | null; mahalla: string | null; address: string | null; mother_id: string }, site: string): string {
  const phone = a.mother_phone ? ", " + fmtPhone(a.mother_phone) : "";
  const where = [a.mahalla, a.address].filter(Boolean).join(", ");
  return tx("staff_alert", "ru", { signs: signs.map(signRu).join(", "), name: a.mother_name, phone, where: where ? "\n" + where : "", link: site + "#/mother/" + a.mother_id });
}
export function staffDigestText(r: { full_name: string; due: number; missed: number; home_due: number; home_missed: number; alerts: number }, site: string): string {
  const L: string[] = [];
  if (r.alerts) L.push(`⚠️ сигналы без ответа: ${r.alerts} / жавобсиз хабарлар`);
  if (r.missed) L.push(`🔴 с пропущенным визитом: ${r.missed} / кўрик ўтказиб юборилган`);
  if (r.due) L.push(`🟡 визит сейчас: ${r.due} / ҳозир кўрик`);
  if (r.home_missed) L.push(`🔴 патронаж пропущен: ${r.home_missed} / патронаж ўтказиб юборилган`);
  if (r.home_due) L.push(`🏠 патронаж сейчас: ${r.home_due} / ҳозир патронаж`);
  const first = (r.full_name || "").split(" ")[1] || r.full_name || "";
  return tx("staff_digest", "ru", { name: first, lines: L.join("\n"), link: site + "#/mothers" });
}
export function fmtPhone(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : p;
}

// Проверка данных мини-приложения Telegram (initData): HMAC-SHA256, ключ — HMAC("WebAppData", токен бота).
export async function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400, now = Date.now()): Promise<{ id: number } | null> {
  if (typeof initData !== "string" || initData.length > 4096) return null;
  const p = new URLSearchParams(initData), hash = p.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  p.delete("hash");
  const dc = Array.from(p.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = new Uint8Array(await crypto.subtle.sign("HMAC", k1, enc.encode(botToken)));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(dc)));
  const hex = Array.from(sig, (x) => x.toString(16).padStart(2, "0")).join("");
  let diff = 0; for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const at = Number(p.get("auth_date"));
  if (!at || now / 1000 - at > maxAgeSec) return null;
  try { const u = JSON.parse(p.get("user") || "null"); return u && typeof u.id === "number" ? { id: u.id } : null; } catch { return null; }
}
