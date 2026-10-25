// Telegram-уведомления по заявкам на отпуск и замещение. Вызывает участник заявки сразу после действия на сайте.
// Кому слать, решает база (leave_notify_targets проверяет, что вызывающий участвует в заявке). В сообщении — только имя, даты и ссылка.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reply(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}
type Target = { user_id: string; telegram_id: number; who: string; full_name: string; date_from: string; date_to: string; status: string };
const d = (s: string) => s.split("-").reverse().join(".");

export function leaveText(event: string, t: Target): string {
  const when = `${d(t.date_from)}–${d(t.date_to)}`, link = `\n${SITE}#/leaves`;
  if (event === "request" && t.who === "substitute")
    return `Вас просят замещать: ${t.full_name}, ${when}. Подтвердите согласие на сайте.\nСизни ўрнига ишлашга сўрашмоқда: ${t.full_name}, ${when}. Сайтда розилигингизни тасдиқланг.${link}`;
  if (event === "request") return `Заявка на отпуск: ${t.full_name}, ${when}. Рассмотрите на сайте.\nТаътил аризаси: ${t.full_name}, ${when}. Сайтда кўриб чиқинг.${link}`;
  if (event === "consent") return `Замещающий дал согласие: ${t.full_name}, ${when}. Заявку можно рассмотреть.\nЎрнини босувчи розилик берди: ${t.full_name}, ${when}.${link}`;
  if (event === "demand") return `🔴 Администратор требует рассмотреть заявку на отпуск: ${t.full_name}, ${when}.\n🔴 Администратор таътил аризасини кўриб чиқишни талаб қилмоқда: ${t.full_name}, ${when}.${link}`;
  const ok = t.status === "approved";
  return `${ok ? "Отпуск разрешён" : "Отпуск не разрешён"}: ${t.full_name}, ${when}.\n${ok ? "Таътил рухсат этилди" : "Таътил рад этилди"}: ${t.full_name}, ${when}.${ok ? "\nПолучите новый ключ офлайн-программы на сайте («Офлайн-программа»)." : ""}${link}`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!BOT_TOKEN || !SUPABASE_URL || !ANON_KEY) return reply({ error: "server_config" }, 500, origin);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return reply({ error: "unauthorized" }, 401, origin);
  let body: { id?: unknown; event?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "bad_request" }, 400, origin); }
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  const event = typeof body.event === "string" ? body.event : "";
  if (!UUID.test(id) || !["request", "consent", "decided", "demand"].includes(event)) return reply({ error: "bad_request" }, 400, origin);
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await user.rpc("leave_notify_targets", { _id: id, _event: event });
  if (error) { const f = /forbidden|permission/i.test(error.message); return reply({ error: f ? "forbidden" : "failed" }, f ? 403 : 500, origin); }
  let sent = 0, failed = 0;
  for (const t of (data ?? []) as Target[]) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: t.telegram_id, text: leaveText(event, t), disable_web_page_preview: true }) });
      if (r.ok) sent++; else failed++;
    } catch { failed++; }
  }
  return reply({ total: (data ?? []).length, sent, failed }, 200, origin);
});
