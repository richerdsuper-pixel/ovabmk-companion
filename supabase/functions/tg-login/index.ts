// Вход через Telegram для OvaBMҚ Companion.
// 1) проверяет подпись Telegram Login Widget токеном бота (секрет TELEGRAM_BOT_TOKEN);
// 2) знакомый Telegram ID -> входит его пользователь; незнакомый -> нужен действующий код приглашения;
// 3) возвращает token_hash, по которому сайт получает сессию (supabase.auth.verifyOtp). Письма не отправляются.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyTelegram } from "./telegram.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const MAX_AGE_SEC = 3600;
const EMAIL_DOMAIN = "tg.ovabmk-companion.example.com"; // служебный адрес, писем на него не бывает
const INVITE_ERRORS = ["invite_invalid", "invite_used", "invite_expired", "invite_revoked", "telegram_taken"];

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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!BOT_TOKEN) return reply({ error: "bot_token_missing" }, 500, origin);
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: "server_config" }, 500, origin);

  let body: { telegram?: unknown; invite?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "bad_request" }, 400, origin); }
  if (!(await verifyTelegram(body.telegram, BOT_TOKEN, MAX_AGE_SEC))) return reply({ error: "bad_signature" }, 401, origin);

  const tg = body.telegram as Record<string, string | number>;
  const tgId = Number(tg.id);
  const username = typeof tg.username === "string" ? tg.username.slice(0, 64) : null;
  const name = [tg.first_name, tg.last_name].filter((x) => typeof x === "string" && x).join(" ").slice(0, 200);
  const invite = typeof body.invite === "string" ? body.invite.trim().toLowerCase() : "";

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: known, error: ke } = await admin.rpc("user_by_telegram", { _tg_id: tgId });
  if (ke) return reply({ error: "lookup_failed" }, 500, origin);
  let uid: string | null = known ?? null;

  if (!uid) {
    if (!/^[0-9a-f]{24}$/.test(invite)) return reply({ error: "no_invite" }, 403, origin);
    const email = `tg${tgId}@${EMAIL_DOMAIN}`;
    let created = false;
    const { data: cu, error: ce } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { telegram_id: tgId },
    });
    if (ce || !cu?.user) {
      const { data: existing } = await admin.rpc("auth_user_by_email", { _email: email });
      if (!existing) return reply({ error: "create_failed", detail: ce?.message ?? "" }, 500, origin);
      uid = existing as string;
    } else {
      uid = cu.user.id;
      created = true;
    }
    const { error: ae } = await admin.rpc("accept_invite", {
      _code: invite, _uid: uid, _tg_id: tgId, _tg_username: username, _tg_name: name,
    });
    if (ae) {
      if (created) await admin.auth.admin.deleteUser(uid);
      const code = INVITE_ERRORS.find((c) => (ae.message ?? "").includes(c)) ?? "accept_failed";
      return reply({ error: code }, 403, origin);
    }
  } else {
    await admin.rpc("touch_telegram", { _uid: uid, _tg_username: username });
  }

  const { data: gu, error: ge } = await admin.auth.admin.getUserById(uid);
  if (ge || !gu?.user?.email) return reply({ error: "user_missing" }, 500, origin);
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email: gu.user.email });
  const tokenHash = link?.properties?.hashed_token;
  if (le || !tokenHash) return reply({ error: "link_failed" }, 500, origin);
  return reply({ token_hash: tokenHash }, 200, origin);
});
