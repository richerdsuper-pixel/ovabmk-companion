// Автонапоминания по подпапкам (планировщик pg_cron, заголовок x-cron-secret; секрет сверяет база).
// body.mode = "daily"  — сотрудникам: за 2 дня до срока и после срока, если не сдано (каждое напоминание один раз);
// body.mode = "weekly" — администраторам: сводка несданного к прошедшим срокам.
// В сообщениях только номер и название подпапки и срок — никаких данных пациентов.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { dailyText, weeklyText, type Rem, type Dig } from "./text.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

async function send(chat: number, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>(); for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); } return m;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return json({ error: "forbidden" }, 403);
  let mode = "daily";
  try { const b = await req.json(); if (b && b.mode === "weekly") mode = "weekly"; } catch { /* по умолчанию daily */ }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc(mode === "weekly" ? "cron_subfolder_digest" : "cron_subfolder_reminders", { _secret: secret });
  if (error) return json({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500);
  const rows = (data ?? []) as (Rem & Dig)[];
  const groups = groupBy(rows, (r) => String(r.telegram_id));
  let sent = 0, i = 0;
  for (const list of groups.values()) {
    const text = mode === "weekly" ? weeklyText(list as Dig[]) : dailyText(list as Rem[]);
    if (await send(list[0].telegram_id, text)) sent++;
    if (++i % 20 === 0) await new Promise((r) => setTimeout(r, 1000));   // лимит Telegram
  }
  return json({ mode, rows: rows.length, people: groups.size, sent });
});
