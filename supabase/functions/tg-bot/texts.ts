// Тексты бота и разбор /start (без сети — проверяются в tests/tg_bot_test.ts).
export type BindResult = "member" | "pending" | "approved" | "rejected" | "invite" | "need_form" | "expired";

const CODE = /^[A-Za-z0-9_-]{20,64}$/;
export function startCode(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = /^\/start(?:@\w+)?\s+(\S+)\s*$/.exec(text.trim());
  return m && CODE.test(m[1]) ? m[1] : null;
}
export function isCode(s: unknown): s is string { return typeof s === "string" && CODE.test(s); }

export function bindReply(r: BindResult | string, site: string): string {
  switch (r) {
    case "member": case "approved": case "invite":
      return "✅ Вход подтверждён. Вернитесь на сайт — он откроется сам.\n✅ Кириш тасдиқланди. Сайтга қайтинг — у ўзи очилади.\n✅ Kirish tasdiqlandi. Saytga qayting — u oʻzi ochiladi.";
    case "pending":
      return "✅ Заявка отправлена. Администратор проверит её. Когда доступ откроется, я пришлю сообщение с кнопкой «Войти».\n" +
        "✅ Ариза юборилди. Администратор кўриб чиқади. Рухсат очилганда «Кириш» тугмаси билан хабар юбораман.\n" +
        "✅ Ariza yuborildi. Administrator koʻrib chiqadi. Ruxsat ochilganda «Kirish» tugmasi bilan xabar yuboraman.";
    case "rejected":
      return "Заявка отклонена администратором. Если это ошибка, обратитесь к заместителю главного врача по ОМиД.\n" +
        "Ариза администратор томонидан рад этилди.\nAriza administrator tomonidan rad etildi.";
    case "need_form":
      return `Сначала заполните анкету на сайте и нажмите «Подтвердить в Telegram»:\nАввал сайтда анкетани тўлдиринг:\nAvval saytda anketani toʻldiring:\n${site}`;
    case "too_many_requests":
      return "Слишком много попыток за сутки. Попробуйте завтра.\nБир кунда жуда кўп уриниш. Эртага қайта уриниб кўринг.\nBir kunda juda koʻp urinish. Ertaga qayta urinib koʻring.";
    default:
      return `Ссылка устарела. Откройте сайт и нажмите кнопку ещё раз:\nҲавола эскирган. Сайтни очиб, тугмани яна босинг:\nHavola eskirgan. Saytni ochib, tugmani yana bosing:\n${site}`;
  }
}

export function helloText(site: string): string {
  return `Здравствуйте! Это бот сайта «OvaBMҚ» (папки-дела по охране материнства и детства). Чтобы войти или зарегистрироваться, откройте сайт:\n` +
    `Ассалому алайкум! Бу «OvaBMҚ» сайти боти. Кириш ёки рўйхатдан ўтиш учун сайтни очинг:\nAssalomu alaykum! Bu «OvaBMҚ» sayti boti. Kirish yoki roʻyxatdan oʻtish uchun saytni oching:\n${site}`;
}

export function approvedText(fullName: string): string {
  return `✅ ${fullName}, доступ к сайту открыт. Нажмите «Войти» — подтверждать ничего не нужно.\n` +
    `✅ Сайтга рухсат очилди. «Кириш» тугмасини босинг.\n✅ Saytga ruxsat ochildi. «Kirish» tugmasini bosing.`;
}

// Номер телефона для показа: +998 90 123 45 67
export function fmtPhone(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : p;
}
