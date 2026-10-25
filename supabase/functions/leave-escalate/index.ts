// Ежедневная проверка (планировщик pg_cron, заголовок x-cron-secret): заявки на отпуск, которые руководитель не рассмотрел 2 рабочих дня,
// — уведомление администраторам в Telegram. Секрет сверяет база (private.cron_secret); каждая заявка отправляется один раз.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
type Row = { leave_id: string; user_id: string; telegram_id: number; full_name: string; institution: string; date_from: string; created_at: string };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405 });
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("cron_leave_escalations", { _secret: secret });
  if (error) return new Response(JSON.stringify({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }), { status: /forbidden/.test(error.message) ? 403 : 500 });
  let sent = 0;
  for (const r of (data ?? []) as Row[]) {
    const text = `Руководитель не рассмотрел заявку на отпуск 2 рабочих дня: ${r.full_name}${r.institution ? " (" + r.institution + ")" : ""}, с ${r.date_from.split("-").reverse().join(".")}.\n` +
      `Раҳбар таътил аризасини 2 иш куни кўриб чиқмади: ${r.full_name}.\nПотребуйте рассмотрения / Кўриб чиқишни талаб қилинг: ${SITE}#/leaves`;
    try {
      const x = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: r.telegram_id, text, disable_web_page_preview: true }) });
      if (x.ok) sent++;
    } catch { /* следующая */ }
  }
  return new Response(JSON.stringify({ total: (data ?? []).length, sent }), { status: 200, headers: { "Content-Type": "application/json" } });
});
