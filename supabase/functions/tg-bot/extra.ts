// Сотрудник в боте (список дня, отметка визита, ответ на вопрос беременной) и напоминание беременной о витаминах.
// Без сети — проверяется в tests/mother_bot_test.ts.
import { fmtPhone, type Lang, uzLat } from "./mother.ts";

type Pair = [string, string];
const P = (x: Pair, lang: Lang) => lang === "ru" ? x[0] : lang === "uzl" ? uzLat(x[1]) : x[1];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// ---------------------------------------------------------------- сотрудник
export function staffMenu(site: string) {
  return [[{ text: "🖥 Открыть OvaBMҚ / Saytni ochish", web_app: { url: site } }],
    [{ text: "📋 Список на сегодня / Bugungi roʻyxat", callback_data: "sd" }]];
}
export const STAFF_HELLO = "Здравствуйте! Сайт OvaBMҚ открывается прямо здесь — кнопка «Открыть OvaBMҚ» (или «Меню» слева внизу). «Список на сегодня» — кому сейчас визит или патронаж; отмечайте сделанное кнопками.\n" +
  "Ассалому алайкум! OvaBMҚ сайти шу ерда очилади. «Bugungi roʻyxat» — бугун кимга кўрик ёки патронаж.";

export function parseStaffCb(data: unknown): { k: "sd" } | { k: "sa" | "sh"; mother: string; code: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  if (data === "sd") return { k: "sd" };
  const m = new RegExp(`^(sa|sh):(${UUID}):([a-z0-9_]{1,12})$`).exec(data);
  if (!m) return null;
  if (m[1] === "sa" && !/^[1-8]$/.test(m[3])) return null;
  return { k: m[1] as "sa" | "sh", mother: m[2], code: m[3] };
}

export type DayRow = { mother_id: string; full_name: string; phone: string | null; mahalla: string | null; kind: string; code: string; state: string; date_to: string };
const HOME: Record<string, string> = { ant12: "патронаж 12 нед", ant32: "патронаж 32 нед", pp3: "патронаж 1–3 дн", pp15: "патронаж 15 дн", pp30: "патронаж 30 дн" };
function what(r: DayRow): string { return r.kind === "anc" ? `визит ${r.code}` : (HOME[r.code] ?? `патронаж ${r.code}`); }
function short(fio: string): string { const p = (fio || "").split(" ").filter(Boolean); return p.length > 1 ? `${p[0]} ${p[1].charAt(0)}.` : (fio || ""); }
const dm = (iso: string) => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) : "";

export function dayText(rows: DayRow[], site: string): string {
  if (!rows.length) return "✅ На сегодня визитов и патронажа нет. Bugun koʻrik va patronaj yoʻq.";
  const L = rows.map((r, i) => `${i + 1}. ${r.state === "missed" ? "🔴" : "🟡"} ${r.full_name} — ${what(r)}${r.state === "missed" ? " (пропущен)" : ` (до ${dm(r.date_to)})`}` +
    (r.phone ? `\n    📞 ${fmtPhone(r.phone)}` : "") + (r.mahalla ? ` · ${r.mahalla}` : ""));
  return `📋 Список на сегодня (${rows.length}):\n\n${L.join("\n")}\n\nНажмите кнопку, когда визит сделан. Все: ${site.replace(/\/?$/, "/")}#/mothers`;
}
export function dayButtons(rows: DayRow[]) {
  return rows.slice(0, 20).map((r) => [{ text: `✅ ${short(r.full_name)} — ${what(r)}`.slice(0, 60), callback_data: `${r.kind === "anc" ? "sa" : "sh"}:${r.mother_id}:${r.code}` }])
    .concat([[{ text: "🔄 Обновить / Yangilash", callback_data: "sd" }]]);
}
export function markText(r: { ok?: boolean; new?: boolean; name?: string; error?: string }, kind: "sa" | "sh", code: string): string {
  if (r.error === "forbidden") return "Нет доступа к этой беременной.";
  if (r.error === "not_staff") return "Вы не сотрудник сайта OvaBMҚ.";
  if (r.error || !r.ok) return "Не получилось отметить. Попробуйте на сайте.";
  const w = kind === "sa" ? `визит ${code}` : (HOME[code] ?? "патронаж");
  return r.new ? `✅ Отмечено сегодня: ${r.name} — ${w}.` : `Уже было отмечено: ${r.name} — ${w}.`;
}

// ---------------------------------------------------------------- вопрос беременной → сотрудник отвечает ответом (Reply) на сообщение
export function questionText(qid: number, q: string, name: string, phone: string | null, motherId: string, site: string): string {
  return `❓ Вопрос от беременной #q${qid}\n${name}${phone ? ", " + fmtPhone(phone) : ""}\n\n«${q}»\n\n` +
    `Чтобы ответить, нажмите на это сообщение → «Ответить» и напишите ответ — он уйдёт ей в Telegram.\nKarta: ${site.replace(/\/?$/, "/")}#/mother/${motherId}`;
}
export function parseQid(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = /#q(\d{1,12})\b/.exec(text);
  return m ? Number(m[1]) : null;
}
const ANSWER: Pair = ["💬 Ответ на ваш вопрос «{q}»\n\n{a}\n\n— {who}", "💬 «{q}» саволингизга жавоб\n\n{a}\n\n— {who}"];
export function answerText(lang: Lang, q: string, a: string, who: string): string {
  const qq = q.length > 80 ? q.slice(0, 77) + "…" : q;
  return P(ANSWER, lang).split("{q}").join(qq).split("{a}").join(a).split("{who}").join(lang === "uzl" ? uzLat(who) : who);
}

// ---------------------------------------------------------------- напоминание о витаминах
const PILL: Record<string, Pair> = { folic: ["Фолиевая кислота", "Фолий кислотаси"], iodine: ["Калия йодид", "Калий йодиди"], iron: ["Железо", "Темир"] };
export const PILL_KINDS = ["folic", "iodine", "iron"];
const REM: Pair = ["💊 {name}, пора выпить витамины: {list}. Отметьте, когда выпьете.", "💊 {name}, витаминларни ичиш вақти: {list}. Ичганингизда белгиланг."];
const ALL: Pair = ["✅ Всё выпила", "✅ Ҳаммасини ичдим"];
const DONE: Pair = ["✅ Отмечено. Молодец!", "✅ Белгиланди. Баракалла!"];
export function pillText(lang: Lang, name: string, kinds: string[]): string {
  return P(REM, lang).replace("{name}", name || "").replace("{list}", kinds.map((k) => PILL[k] ? P(PILL[k], lang) : k).join(", ")).replace(/^💊 , /, "💊 ");
}
export function pillButtons(lang: Lang, kinds: string[]) {
  const ks = kinds.filter((k) => PILL_KINDS.includes(k));
  return [ks.map((k) => ({ text: "✅ " + P(PILL[k], lang), callback_data: `mp:${k}` })), [{ text: P(ALL, lang), callback_data: `mp:all:${ks.join(",")}` }]];
}
export function parsePillCb(data: unknown): string[] | null {
  if (typeof data !== "string" || data.length > 64) return null;
  let m = /^mp:(folic|iodine|iron)$/.exec(data);
  if (m) return [m[1]];
  m = /^mp:all:((?:folic|iodine|iron)(?:,(?:folic|iodine|iron)){0,2})$/.exec(data);
  return m ? m[1].split(",") : null;
}
export function pillDone(lang: Lang): string { return P(DONE, lang); }

// ---------------------------------------------------------------- дежурный роддома: высокий риск, 36 недель (раз в день)
export type Hr36Row = { telegram_id: number; mother_id: string; mother_name: string; mother_phone: string | null; institution: string | null;
  mahalla: string | null; address: string | null; ga_days: number; edd: string };
// по 15 женщин в сообщении (лимит Telegram — 4096 знаков)
export function hr36Texts(rows: Hr36Row[], site: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 15) {
    const part = rows.slice(i, i + 15).map((r, k) => {
      const ga = `${Math.floor(r.ga_days / 7)} нед ${r.ga_days % 7} дн`;
      const where = [r.institution, r.mahalla, r.address].filter(Boolean).join(", ");
      return `${i + k + 1}. ${r.mother_name} — ${ga}, ПДР ${r.edd ? r.edd.slice(8, 10) + "." + r.edd.slice(5, 7) + "." + r.edd.slice(0, 4) : "—"}` +
        (r.mother_phone ? `, ${fmtPhone(r.mother_phone)}` : "") + (where ? `\n   ${where}` : "") + `\n   ${site}#/mother/${r.mother_id}`;
    });
    out.push((i === 0 ? `🏥 Высокий риск — 36 недель (${rows.length})\nЮқори хавф — 36 ҳафта\n\n` +
      "Женщины высокого риска, которым исполнилось 36 недель: заранее решите место родов, предупредите врача, уточните, как она доберётся.\n\n" : "") +
      part.join("\n\n"));
  }
  return out;
}
