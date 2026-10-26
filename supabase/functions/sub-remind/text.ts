// Тексты автонапоминаний (отдельно, чтобы проверять без сервера: tests/sub_remind_test.ts).
const SITE = (globalThis as any).Deno?.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
const MAX_LINES = 15;

export type Rem = { user_id: string; telegram_id: number; kind: string; subfolder_id: string; title_ru: string; title_uz: string; due: string };
export type Dig = { admin_id: string; telegram_id: number; subfolder_id: string; title_ru: string; due: string; missing: number; expected: number };

const dmy = (d: string) => d.split("-").reverse().join(".");

export function dailyText(rows: Rem[]): string {
  const before = rows.filter((r) => r.kind === "before"), over = rows.filter((r) => r.kind === "overdue");
  const line = (r: Rem) => `• ${r.subfolder_id} ${r.title_ru} / ${r.title_uz} — ${dmy(r.due)}`;
  const part = (head: string, list: Rem[]) => !list.length ? "" :
    `${head}\n${list.slice(0, MAX_LINES).map(line).join("\n")}${list.length > MAX_LINES ? `\n… +${list.length - MAX_LINES}` : ""}\n`;
  return [
    part("⏰ Скоро срок сдачи / Топшириш муддати яқин / Topshirish muddati yaqin:", before),
    part("🔴 Срок прошёл, не сдано / Муддати ўтди, топширилмаган / Muddati oʻtdi, topshirilmagan:", over),
    `Сдать / Топшириш / Topshirish: ${SITE}#/due`,
  ].filter(Boolean).join("\n");
}

export function weeklyText(rows: Dig[]): string {
  const total = rows.reduce((a, r) => a + r.missing, 0);
  const lines = rows.slice(0, 20).map((r) => `• ${r.subfolder_id} ${r.title_ru} — ${dmy(r.due)}: не сдали ${r.missing} из ${r.expected}`);
  return `📋 Сводка по подпапкам / Ички бўлимлар бўйича ҳисобот / Ichki boʻlimlar boʻyicha hisobot\n` +
    `Не сдано к прошедшему сроку / Топширилмаган / Topshirilmagan: ${total}\n${lines.join("\n")}` +
    `${rows.length > 20 ? `\n… +${rows.length - 20}` : ""}\nКонтроль / Назорат / Nazorat: ${SITE}#/due`;
}

