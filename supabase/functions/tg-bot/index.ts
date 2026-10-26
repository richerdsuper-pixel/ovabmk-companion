// Бот @OvaBMQbot и простой вход на сайт.
// 1) Сайт: action=start — анкета (или просто вход) → билет: код для ссылки t.me/бот?start=… и секрет браузера;
//    action=poll — что с билетом; когда можно, возвращает token_hash для входа (supabase.auth.verifyOtp), как tg-login.
// 2) Telegram (webhook, заголовок X-Telegram-Bot-Api-Secret-Token): /start <код> — привязать Telegram, подать заявку, ответить.
// 3) Администратор: action=approved — сотруднику уходит «Доступ открыт» с кнопкой входа (без повторного подтверждения).
// 4) action=setup (x-cron-secret) — один раз прописать webhook у Telegram.
// Данных пациентов здесь нет: анкета — ФИО, телефон, место работы и должности сотрудника.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { approvedText, bindReply, helloText, isCode, startCode } from "./texts.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const EMAIL_DOMAIN = "tg.ovabmk-companion.example.com"; // как в tg-login: служебный адрес, писем нет
const FORM_ERRORS = ["bad_full_name", "bad_phone", "need_institution", "bad_positions", "bad_rate", "over_rate", "bad_form", "too_many_requests"];
const ACCEPT_ERRORS = ["invite_invalid", "invite_used", "invite_expired", "invite_revoked", "telegram_taken", "request_not_approved"];

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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
function code(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function webhookSecret(): Promise<string> {   // выводится из ключа сервиса, нигде не хранится
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("ovabmq-tg-webhook")));
  return Array.from(s, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function tg(method: string, body: unknown): Promise<Response> {
  return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function say(chat: number, text: string, button?: { text: string; url: string }) {
  try {
    await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}) });
  } catch { /* не страшно */ }
}
async function ensureUser(db: ReturnType<typeof admin>, tgId: number): Promise<{ uid: string; created: boolean } | null> {
  const email = `tg${tgId}@${EMAIL_DOMAIN}`;
  const { data: cu, error: ce } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telegram_id: tgId } });
  if (!ce && cu?.user) return { uid: cu.user.id, created: true };
  const { data: existing } = await db.rpc("auth_user_by_email", { _email: email });
  return existing ? { uid: existing as string, created: false } : null;
}
async function tokenFor(db: ReturnType<typeof admin>, uid: string): Promise<string | null> {
  const { data: gu } = await db.auth.admin.getUserById(uid);
  if (!gu?.user?.email) return null;
  const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email: gu.user.email });
  return link?.properties?.hashed_token ?? null;
}

// ---------------------------------------------------------------- сайт: опрос билета
type Poll = { state: string; telegram_id: number | null; tg_username: string | null; tg_name: string | null; invite: string | null; request: string | null };
async function poll(pollCode: string, origin: string): Promise<Response> {
  const db = admin();
  const { data, error } = await db.rpc("ticket_poll", { _poll: pollCode });
  if (error) return reply({ error: "failed" }, 500, origin);
  const t = ((data ?? []) as Poll[])[0];
  if (!t || t.state !== "bound" || !t.telegram_id) return reply({ state: t?.state ?? "expired" }, 200, origin);
  const tgId = Number(t.telegram_id);
  let uid: string | null = null;
  if (t.request === "member") {
    const { data: known } = await db.rpc("user_by_telegram", { _tg_id: tgId });
    uid = (known as string) ?? null;
    if (uid) await db.rpc("touch_telegram", { _uid: uid, _tg_username: t.tg_username });
  } else if (t.invite || t.request === "approved") {
    const u = await ensureUser(db, tgId);
    if (!u) return reply({ error: "create_failed" }, 500, origin);
    const { error: ae } = t.invite
      ? await db.rpc("accept_invite", { _code: t.invite, _uid: u.uid, _tg_id: tgId, _tg_username: t.tg_username, _tg_name: t.tg_name ?? "" })
      : await db.rpc("accept_request", { _tg_id: tgId, _uid: u.uid, _tg_username: t.tg_username });
    if (ae) {
      if (u.created) await db.auth.admin.deleteUser(u.uid);
      const c = ACCEPT_ERRORS.find((x) => (ae.message ?? "").includes(x)) ?? "accept_failed";
      return reply({ error: c }, 403, origin);
    }
    uid = u.uid;
  } else {
    return reply({ state: t.request === "none" ? "need_form" : (t.request ?? "pending") }, 200, origin);   // pending | rejected | need_form
  }
  if (!uid) return reply({ error: "user_missing" }, 500, origin);
  const th = await tokenFor(db, uid);
  if (!th) return reply({ error: "link_failed" }, 500, origin);
  await db.rpc("ticket_used", { _poll: pollCode });
  return reply({ state: "login", token_hash: th }, 200, origin);
}

// ---------------------------------------------------------------- Telegram webhook
async function onUpdate(u: Record<string, any>): Promise<void> {
  const m = u.message;
  if (!m || !m.from || m.chat?.type !== "private") return;
  const from = m.from, chat = Number(m.chat.id);
  const c = startCode(m.text);
  if (!c) { await say(chat, helloText(SITE), { text: "Открыть сайт / Saytni ochish", url: SITE }); return; }
  const name = [from.first_name, from.last_name].filter((x: unknown) => typeof x === "string" && x).join(" ").slice(0, 200);
  const { data, error } = await admin().rpc("ticket_bind", { _start: c, _tg_id: Number(from.id), _tg_username: typeof from.username === "string" ? from.username : null, _tg_name: name });
  const r = error ? (FORM_ERRORS.find((x) => (error.message ?? "").includes(x)) === "too_many_requests" ? "too_many_requests" : "expired") : String(data);
  await say(chat, bindReply(r, SITE), r === "expired" || r === "need_form" ? { text: "Открыть сайт / Saytni ochish", url: SITE } : undefined);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return reply({ error: "server_config" }, 500, origin);

  const hook = req.headers.get("x-telegram-bot-api-secret-token");
  if (hook !== null) {
    if (hook !== await webhookSecret()) return new Response("forbidden", { status: 403 });
    try { await onUpdate(await req.json()); } catch { /* Telegram всегда получает 200, чтобы не повторял */ }
    return new Response("ok", { status: 200 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "bad_request" }, 400, origin); }

  if (body.action === "start") {
    const s = code(), p = code();
    const form = body.form && typeof body.form === "object" ? body.form : null;
    const invite = typeof body.invite === "string" && /^[0-9a-f]{24}$/.test(body.invite) ? body.invite : null;
    const { error } = await admin().rpc("ticket_create", { _start: s, _poll: p, _form: form, _invite: invite });
    if (error) return reply({ error: FORM_ERRORS.find((x) => (error.message ?? "").includes(x)) ?? "failed" }, 400, origin);
    return reply({ start: s, poll: p }, 200, origin);
  }
  if (body.action === "poll") {
    if (!isCode(body.poll)) return reply({ error: "bad_request" }, 400, origin);
    return await poll(body.poll, origin);
  }
  if (body.action === "approved") {   // от имени администратора
    const auth = req.headers.get("authorization") ?? "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!auth.toLowerCase().startsWith("bearer ") || !/^[0-9a-f-]{36}$/.test(id) || !ANON_KEY) return reply({ error: "bad_request" }, 400, origin);
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const s = code(), p = code();
    const { data, error } = await user.rpc("admin_request_ticket", { _id: id, _start: s, _poll: p });
    if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 400, origin);
    const row = ((data ?? []) as { telegram_id: number; full_name: string }[])[0];
    if (!row) return reply({ error: "failed" }, 400, origin);
    const url = SITE.replace(/\/?$/, "/") + "?login=" + p;
    const r = await tg("sendMessage", { chat_id: row.telegram_id, text: approvedText(row.full_name), disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "Войти / Kirish", url }]] } }).catch(() => null);
    return reply({ sent: !!(r && r.ok) }, 200, origin);
  }
  if (body.action === "setup") {   // один раз: x-cron-secret
    const sec = req.headers.get("x-cron-secret") ?? "";
    const { data: ok } = await admin().rpc("cron_secret_ok", { _secret: sec });
    if (ok !== true) return reply({ error: "forbidden" }, 403, origin);
    if (body.info === true) { const i = await tg("getWebhookInfo", {}); return reply(await i.json(), 200, origin); }
    const r = await tg("setWebhook", { url: `${SUPABASE_URL}/functions/v1/tg-bot`, secret_token: await webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
    return reply(await r.json(), 200, origin);
  }
  return reply({ error: "bad_request" }, 400, origin);
});
