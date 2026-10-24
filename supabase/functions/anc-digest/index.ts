// Ежедневная сводка по беременным в Telegram. В сообщении только числа («пора на осмотр — 3, просрочено — 1») и ссылка на сайт:
// ни номеров карт, ни имён, ни сроков. Подробности видны на сайте после входа.
// Запускается двумя способами: администратором с сайта (кнопка «Отправить сводку сейчас») или планировщиком (заголовок x-cron-secret).
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());

function reply(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

type Row = { user_id: string; telegram_id: number; due: number; overdue: number; is_admin: boolean };

export function digestText(r: Row): string {
  const head = r.is_admin ? "Сводка по району / Туман бўйича маълумот" : "Беременные / Ҳомиладорлар";
  return `${head}:\nпора на осмотр / кўрикка вақти — ${r.due}\nпросрочено / муддати ўтган — ${r.overdue}\nПодробности на сайте: ${SITE}#/pregnant`;
}

async function send(chat: number, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!BOT_TOKEN || !SUPABASE_URL || !ANON_KEY) return reply({ error: "server_config" }, 500, origin);

  let rows: Row[] = [];
  const cron = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && cron && cron === CRON_SECRET) {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc("cron_anc_digest");
    if (error) return reply({ error: "failed" }, 500, origin);
    rows = (data ?? []) as Row[];
  } else {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) return reply({ error: "unauthorized" }, 401, origin);
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await user.rpc("admin_anc_digest");
    if (error) { const f = /forbidden|permission/i.test(error.message); return reply({ error: f ? "forbidden" : "failed" }, f ? 403 : 500, origin); }
    rows = (data ?? []) as Row[];
  }
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].telegram_id || (rows[i].due + rows[i].overdue === 0 && !rows[i].is_admin)) continue;
    if (await send(rows[i].telegram_id, digestText(rows[i]))) sent++; else failed++;
    if (i % 20 === 19) await new Promise((res) => setTimeout(res, 1000));
  }
  return reply({ total: rows.length, sent, failed }, 200, origin);
});
