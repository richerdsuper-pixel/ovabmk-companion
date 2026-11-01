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
  m = /^mi:(visit|food|life|signs|birth|after|call|bp)$/.exec(data);
  if (m) return { k: "mi", sign: m[1] };
  m = /^ms:([a-z0-9_]{2,30})$/.exec(data);
  if (m && SIGNS.includes(m[1])) return { k: "ms", sign: m[1] };
  if (data === "mn" || data === "ma" || data === "mh" || data === "ma_pp") return { k: data };
  return null;
}

// тревожные признаки (ВОЗ, «опасные признаки» при беременности, после родов и у новорождённого)
// при беременности — список «тревожных признаков» протокола №180 (+ судороги)
export const SIGNS_PREG = ["bleeding", "waters", "discharge", "abd_pain", "contractions", "moves", "headache", "swelling", "vomit", "fever38", "urine", "itch", "trauma", "convulsions"];
export const SIGNS_PP = ["pp_bleeding", "fever", "pp_discharge", "headache", "convulsions", "breath", "baby_feed", "baby_fever", "baby_breath", "baby_jaundice", "baby_cord", "baby_convulsions"];
export const SIGNS = Array.from(new Set([...SIGNS_PREG, ...SIGNS_PP, "less_move", "bp_high", "bp_severe"]));

const SG: Record<string, [string, string]> = {   // [русский, узбекский кириллицей]
  bleeding: ["Кровянистые выделения, кровотечение", "Қонли ажралма, қон кетиши"],
  vomit: ["Рвота больше 5 раз", "5 мартадан кўп қусиш"], discharge: ["Обильные жидкие выделения", "Кўп суюқ ажралма"],
  fever38: ["Температура 38° и выше", "Ҳарорат 38° ва юқори"], itch: ["Сильный зуд, жжение, выделения", "Кучли қичишиш, ачишиш, ажралма"],
  urine: ["Жжение и боль при мочеиспускании", "Сийганда ачишиш ва оғриқ"], contractions: ["Больше 4–5 схваток за час", "Бир соатда 4–5 тадан кўп тўлғоқ"],
  trauma: ["Ушиб живота (падение, удар)", "Қоринга зарба (йиқилиш, урилиш)"], moves: ["Ребёнок шевелится слишком сильно или слабо", "Бола жуда кучли ёки кучсиз қимирлаяпти"],
  bp_high: ["Давление 140/90 и выше", "Қон босими 140/90 ва юқори"], bp_severe: ["Давление 160/110 и выше", "Қон босими 160/110 ва юқори"], headache: ["Постоянная головная боль, пятна или вспышки перед глазами", "Доимий бош оғриғи, кўз олдида доғ ёки учқунлар"],
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
  help: ["Выберите, что нужно. Давление можно просто написать сообщением, например 120/80.", "Кераклисини танланг. Қон босимини хабар қилиб ёзиш мумкин, масалан 120/80."],
  m_visit: ["🗓 Мой визит и анализы", "🗓 Кўригим ва таҳлиллар"], m_bp: ["🩺 Давление", "🩺 Қон босими"], m_food: ["🍎 Питание, витамины", "🍎 Овқат, витаминлар"],
  m_life: ["🚶 Образ жизни", "🚶 Турмуш тарзи"], m_signs: ["⚠️ Когда к врачу", "⚠️ Қачон шифокорга"], m_birth: ["🤰 Роды", "🤰 Туғруқ"],
  m_after: ["👶 После родов", "👶 Туғруқдан кейин"], m_call: ["📞 Моя доя", "📞 Доям"],
  v_ga: ["Срок: {w} нед {d} дн. Предполагаемая дата родов: {edd}.", "Муддат: {w} ҳафта {d} кун. Тахминий туғиш санаси: {edd}."],
  v_pp: ["После родов: {d}-й день.", "Туғруқдан кейин {d}-кун."],
  v_missed: ["❗ Вы пропустили визит: {v}. Пожалуйста, подойдите к доя как можно скорее.", "❗ Сиз кўрикни ўтказиб юбордингиз: {v}. Илтимос, иложи борича тезроқ доянгизга келинг."],
  v_now: ["🗓 Сейчас время визита: {v} — до {b}.", "🗓 Ҳозир кўрик вақти: {v} — {b} гача."],
  v_next: ["🗓 Следующий визит: {v} — с {a} по {b}.", "🗓 Кейинги кўрик: {v} — {a} дан {b} гача."],
  v_home: ["🏠 Доя придёт к вам домой: с {a} по {b}.", "🏠 Доя уйингизга келади: {a} дан {b} гача."],
  v_none: ["Плановых визитов сейчас нет.", "Ҳозир режали кўрик йўқ."],
  doya: ["📞 Ваша доя: {name}\n{inst}\nТелефон: {phone}", "📞 Доянгиз: {name}\n{inst}\nТелефон: {phone}"],
  no_phone: ["не указан — спросите в поликлинике", "кўрсатилмаган — поликлиникадан сўранг"],
  bp_ask: ["Напишите давление сообщением, например: 120/80", "Қон босимини хабар қилиб ёзинг, масалан: 120/80"],
  bp_ok: ["✅ Записано: {v}. Давление в норме.", "✅ Ёзиб қўйдим: {v}. Қон босими меъёрда."],
  bp_high: ["⚠️ Записано: {v}. Это высокое давление (140/90 и выше). Ваша доя получила сообщение. Отдохните 15 минут и измерьте ещё раз. Если болит голова, мелькает перед глазами, боль под рёбрами — звоните 103.",
            "⚠️ Ёзиб қўйдим: {v}. Бу юқори қон босими (140/90 ва юқори). Доянгизга хабар юборилди. 15 дақиқа дам олиб, қайта ўлчанг. Бош оғриса, кўз олди учқунласа, қовурға остида оғриқ бўлса — 103 га қўнғироқ қилинг."],
  bp_severe: ["🚑 Записано: {v}. Очень высокое давление (160/110 и выше). Звоните 103 сейчас. Ваша доя получила сообщение.",
              "🚑 Ёзиб қўйдим: {v}. Жуда юқори қон босими (160/110 ва юқори). Ҳозир 103 га қўнғироқ қилинг. Доянгизга хабар юборилди."],
  bp_bad: ["Не удалось разобрать цифры. Напишите так: 120/80", "Рақамларни тушунмадим. Шундай ёзинг: 120/80"],
  bp_many: ["Сегодня записей уже много. Если давление высокое — звоните 103 или доя.", "Бугун ёзувлар кўп. Қон босими юқори бўлса — 103 га ёки доянгизга қўнғироқ қилинг."],
  rem_open: ["🔔 {name}, начался срок визита: {label}. Подойдите к доя до {to}.", "🔔 {name}, кўрик муддати бошланди: {label}. {to} гача доянгизга келинг."],
  rem_soon: ["⏰ {name}, до конца срока визита «{label}» осталось 3 дня (до {to}). Пожалуйста, подойдите к доя.", "⏰ {name}, «{label}» кўрик муддати тугашига 3 кун қолди ({to} гача). Илтимос, доянгизга келинг."],
  rem_tests: ["Нужно сдать:", "Топшириш керак:"],
  loc_ask: ["Если вы не дома — нажмите кнопку ниже: доя и роддом увидят, где вы.", "Уйда бўлмасангиз — пастдаги тугмани босинг: доя ва туғруқхона қаердалигингизни кўради."],
  loc_btn: ["📍 Отправить, где я", "📍 Қаердалигимни юбориш"],
  loc_sent: ["📍 Место отправлено доя и медработникам ({n}).", "📍 Жой доянгиз ва тиббиёт ходимларига юборилди ({n})."],
  loc_none: ["Место получено, но тревожного сигнала за последние 2 часа нет. Если что-то случилось — нажмите «Тревожные признаки».", "Жой олинди, лекин охирги 2 соатда хавф хабари йўқ. Бирор нарса бўлса — «Хавфли белгилар»ни босинг."],
  voice_sent: ["🎤 Голосовое сообщение отправлено доя ({n}). Ответ придёт сюда.", "🎤 Овозли хабар доянгизга юборилди ({n}). Жавоб шу ерга келади."],
  fam_choose: ["Вас пригласили в бот «OvaBMҚ» как родственника беременной. Кем вы ей приходитесь?", "Сизни «OvaBMҚ» ботига ҳомиладор аёлнинг қариндоши сифатида таклиф қилишди. Сиз унинг кимисиз?"],
  rel_husband: ["Муж", "Эри"], rel_mother: ["Мама", "Онаси"], rel_mother_in_law: ["Свекровь", "Қайнонаси"], rel_other: ["Другой родственник", "Бошқа қариндош"],
  fam_welcome: ["Вы подключены. Будете получать напоминания о визитах и прививках ({name}) и сообщение, если она отметит тревожный признак. Отключиться — /stop.",
    "Сиз уландингиз. Кўриклар ва эмлашлар ҳақида эслатмалар ({name}) ва у хавфли белгини белгиласа хабар оласиз. Узилиш — /stop."],
  fam_expired: ["Ссылка устарела. Попросите новую: «Моя страница» → «Семья» (внизу главной).", "Ҳавола эскирган. Янгисини сўранг: «Менинг саҳифам» → «Оила» (бош саҳифа пастида)."],
  fam_is_mother: ["Это ссылка для родственника — откройте её с телефона мужа или мамы.", "Бу қариндош учун ҳавола — уни эри ёки онасининг телефонидан очинг."],
  fam_too_many: ["Уже подключены 2 родственника.", "Аллақачон 2 та қариндош уланган."],
  fam_alert: ["🚑 {name} сообщила о тревожном признаке: «{sign}». Помогите ей: звоните 103 или отвезите в роддом. Доя уже получила сообщение.",
    "🚑 {name} хавфли белги ҳақида хабар берди: «{sign}». Унга ёрдам беринг: 103 га қўнғироқ қилинг ёки туғруқхонага олиб боринг. Доя хабар олди."],
  fam_rem: ["👪 Для семьи ({name}):", "👪 Оила учун ({name}):"],
  fam_stopped: ["Вы отключены от напоминаний.", "Сиз эслатмалардан узилдингиз."],
  vac_rem: ["💉 {name}, малышу пора сделать прививку:\n• {list}\nСходите в поликлинику (СВП/ОШП). После прививки отметьте её в «Моей странице».",
    "💉 {name}, чақалоқни эмлаш вақти келди:\n• {list}\nПоликлиникага (ҚВП/ОШП) боринг. Эмлагандан кейин «Менинг саҳифам»да белгиланг."],
  sv_intro: ["{name}, поздравляем с малышом! Ответьте, пожалуйста, на 4 коротких вопроса — без имени, чтобы помощь беременным стала лучше.",
    "{name}, чақалоқ муборак бўлсин! Илтимос, 4 та қисқа саволга жавоб беринг — исмсиз, ҳомиладорларга ёрдам яхшиланиши учун."],
  sv_q1: ["1/4. Как вас приняли в роддоме? (1 — плохо, 5 — отлично)", "1/4. Туғруқхонада сизни қандай қабул қилишди? (1 — ёмон, 5 — аъло)"],
  sv_q2: ["2/4. Вам объяснили, как кормить малыша и ухаживать за ним?", "2/4. Чақалоқни қандай боқиш ва парвариш қилишни тушунтиришдими?"],
  sv_q3: ["3/4. Приходила ли доя к вам домой после выписки?", "3/4. Туғруқхонадан чиққандан кейин доя уйингизга келдими?"],
  sv_q4: ["4/4. Оцените работу вашей доя (1 — плохо, 5 — отлично).", "4/4. Доянгиз ишини баҳоланг (1 — ёмон, 5 — аъло)."],
  sv_yes: ["Да", "Ҳа"], sv_no: ["Нет", "Йўқ"],
  sv_thanks: ["Спасибо! Ваши ответы помогут роддому и поликлинике стать лучше.", "Раҳмат! Жавобларингиз туғруқхона ва поликлиникага яхшиланишга ёрдам беради."],
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
  const b = (k: string, cb: string) => ({ text: tx(k, lang), callback_data: cb });
  return [[{ text: tx("page", lang), web_app: { url: appUrl + "?l=" + lang } }],
    [b("m_visit", "mi:visit"), b("m_bp", "mi:bp")],
    [b("m_food", "mi:food"), b("m_life", "mi:life")],
    [b("m_signs", "mi:signs"), b("m_birth", "mi:birth")],
    [b("m_after", "mi:after"), b("m_call", "mi:call")],
    [{ text: tx("danger", lang), callback_data: "ma" }]];
}
// давление, которое беременная пишет в чат: «120/80», «120 80»
export function parseBp(text: unknown): { sys: number; dia: number } | null {
  if (typeof text !== "string") return null;
  const m = /^\s*(\d{2,3})\s*[\/\\ ,.-]\s*(\d{2,3})\s*$/.exec(text);
  if (!m) return null;
  const sys = +m[1], dia = +m[2];
  return sys >= 60 && sys <= 260 && dia >= 30 && dia <= 180 && dia < sys ? { sys, dia } : null;
}
export function visitText(v: Record<string, any>, lang: Lang): string {
  const st = v.state || {}, sch: any[] = v.schedule || [];
  const name = (no: number) => { const r = sch.find((x) => x.no === no); return !r ? "№" + no : lang === "ru" ? r.label : lang === "uzl" ? uzLat(r.label_uz || r.label) : (r.label_uz || r.label); };
  const tests = (no: number) => { const r = sch.find((x) => x.no === no); if (!r) return []; const a = lang === "ru" ? r.tests : (r.tests_uz && r.tests_uz.length ? r.tests_uz : r.tests); return (a || []).map((x: string) => lang === "uzl" ? uzLat(x) : x); };
  const d = (iso: string) => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "";
  const out: string[] = [];
  if (v.status === "postpartum") out.push(tx("v_pp", lang, { d: st.pp_day ?? "—" }));
  else if (typeof st.ga_days === "number") out.push(tx("v_ga", lang, { w: Math.floor(st.ga_days / 7), d: st.ga_days % 7, edd: d(st.edd) }));
  const missed = (st.anc || []).filter((a: any) => a.state === "missed").map((a: any) => name(a.no));
  if (missed.length) out.push(tx("v_missed", lang, { v: missed.join(", ") }));
  if (st.next_anc) {
    out.push(tx(st.next_anc.state === "due" ? "v_now" : "v_next", lang, { v: name(st.next_anc.no), a: d(st.next_anc.from), b: d(st.next_anc.to) }));
    const t = tests(st.next_anc.no);
    if (t.length) out.push(tx("rem_tests", lang) + "\n• " + t.join("\n• "));
  }
  const home = (st.home || []).find((h: any) => h.state === "due" || h.state === "next");
  if (home) out.push(tx("v_home", lang, { a: d(home.from), b: d(home.to) }));
  return out.join("\n\n") || tx("v_none", lang);
}
export function doyaText(v: Record<string, any>, lang: Lang): string {
  const dy = v.doya || {};
  return tx("doya", lang, { name: lang === "uzl" ? uzLat(dy.name || "") : (dy.name || "—"), inst: lang === "uzl" ? uzLat(v.institution || "") : (v.institution || ""),
    phone: dy.phone ? fmtPhone(dy.phone) : tx("no_phone", lang) });
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
export async function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400, now = Date.now()): Promise<{ id: number; username: string | null } | null> {
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
  try { const u = JSON.parse(p.get("user") || "null"); return u && typeof u.id === "number" ? { id: u.id, username: typeof u.username === "string" ? u.username : null } : null; } catch { return null; }
}
