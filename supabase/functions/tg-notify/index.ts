// Telegram-уведомления о рассылках и заданиях. Вызывает администратор с сайта.
// В сообщении только название рассылки/задания и ссылка на сайт — никаких данных пациентов.
// Кому слать, определяет база (admin_notify_targets проверяет, что вызывает администратор); после отправки функция отмечает получателей.
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

type Target = { user_id: string; telegram_id: number; title: string; urgent: boolean; due_date: string | null };

export function messageFor(kind: string, t: Target, remind: boolean): string {
  const hot = t.urgent ? "🔴 СРОЧНО / ШОШИЛИНЧ\n" : "";
  const due = t.due_date ? `\nСрок / Муддат: ${t.due_date.split("-").reverse().join(".")}` : "";
  if (kind === "task") {
    return `${hot}${remind ? "Напоминание — задание / Эслатма — топшириқ" : "Новое задание / Янги топшириқ"}:\n«${t.title}»${due}\nОткройте сайт: ${SITE}#/tasks`;
  }
  return `${hot}${remind ? "Напоминание — файл не открыт / Эслатма — файл очилмаган" : "Новый файл / Янги файл"}:\n«${t.title}»\nОткройте сайт: ${SITE}#/broadcasts`;
}

async function send(chat: number, text: string): Promise<{ ok: boolean; blocked: boolean }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    if (r.ok) return { ok: true, blocked: false };
    return { ok: false, blocked: r.status === 403 || r.status === 400 };
  } catch { return { ok: false, blocked: false }; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!BOT_TOKEN || !SUPABASE_URL || !ANON_KEY) return reply({ error: "server_config" }, 500, origin);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return reply({ error: "unauthorized" }, 401, origin);

  let body: { kind?: unknown; id?: unknown; remind?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "bad_request" }, 400, origin); }
  const kind = body.kind === "task" ? "task" : body.kind === "broadcast" ? "broadcast" : "";
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!kind || !UUID.test(id)) return reply({ error: "bad_request" }, 400, origin);
  const remind = body.remind === true;

  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await user.rpc("admin_notify_targets", { _kind: kind, _id: id, _remind: remind });
  if (error) return reply({ error: /forbidden|permission/i.test(error.message) ? "forbidden" : "failed" }, /forbidden|permission/i.test(error.message) ? 403 : 500, origin);
  const targets = (data ?? []) as Target[];

  const sent: string[] = []; let blocked = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = await send(targets[i].telegram_id, messageFor(kind, targets[i], remind));
    if (r.ok) sent.push(targets[i].user_id); else if (r.blocked) blocked++; else failed++;
    if (i % 20 === 19) await new Promise((res) => setTimeout(res, 1000)); // лимит Telegram ~30 сообщений/сек
  }
  if (sent.length) await user.rpc("admin_mark_notified", { _kind: kind, _id: id, _users: sent });
  return reply({ total: targets.length, sent: sent.length, blocked, failed }, 200, origin);
});
