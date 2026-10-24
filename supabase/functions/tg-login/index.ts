// Вход через Telegram для OvaBMҚ Companion.
// 1) проверяет подпись Telegram Login Widget токеном бота (секрет TELEGRAM_BOT_TOKEN);
// 2) знакомый Telegram ID -> входит его пользователь; незнакомый -> код приглашения
//    или заявка на доступ (ФИО + должность), которую одобряет администратор;
// 3) возвращает token_hash, по которому сайт получает сессию (supabase.auth.verifyOtp). Письма не отправляются.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyTelegram } from "./telegram.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const MAX_AGE_SEC = 3600;
const EMAIL_DOMAIN = "tg.ovabmk-companion.example.com"; // служебный адрес, писем на него не бывает
const INVITE_ERRORS = ["invite_invalid", "invite_used", "invite_expired", "invite_revoked", "telegram_taken", "request_not_approved"];
const REQUEST_ERRORS = ["already_member", "bad_full_name", "bad_position", "too_many_requests"];

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

async function ensureUser(admin: ReturnType<typeof createClient>, tgId: number): Promise<{ uid: string; created: boolean } | null> {
  const email = `tg${tgId}@${EMAIL_DOMAIN}`;
  const { data: cu, error: ce } = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { telegram_id: tgId },
  });
  if (!ce && cu?.user) return { uid: cu.user.id, created: true };
  const { data: existing } = await admin.rpc("auth_user_by_email", { _email: email });
  return existing ? { uid: existing as string, created: false } : null;
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

  if (!uid && !/^[0-9a-f]{24}$/.test(invite)) {
    // Без приглашения: заявка на доступ. Учётная запись создаётся только после одобрения администратором.
    const { data: st, error: se } = await admin.rpc("request_state", { _tg_id: tgId });
    if (se) return reply({ error: "lookup_failed" }, 500, origin);
    if (st !== "approved") {
      const rq = (body as { request?: { full_name?: unknown; position?: unknown; position_code?: unknown } }).request;
      if (rq && typeof rq.full_name === "string" && typeof rq.position === "string") {
        const { data: ns, error: re } = await admin.rpc("submit_access_request", {
          _tg_id: tgId, _tg_username: username, _tg_name: name,
          _full_name: rq.full_name.slice(0, 200), _position: rq.position.slice(0, 200),
          _position_code: typeof rq.position_code === "string" ? rq.position_code.slice(0, 40) : "",
        });
        if (re) {
          const code = REQUEST_ERRORS.find((c) => (re.message ?? "").includes(c)) ?? "request_failed";
          return reply({ error: code }, 400, origin);
        }
        if (ns !== "approved") return reply({ request: ns }, 200, origin);
      } else {
        return reply({ request: st }, 200, origin);   // none | pending | rejected
      }
    }
    const u = await ensureUser(admin, tgId);
    if (!u) return reply({ error: "create_failed" }, 500, origin);
    uid = u.uid;
    const { error: ae } = await admin.rpc("accept_request", { _tg_id: tgId, _uid: uid, _tg_username: username });
    if (ae) {
      if (u.created) await admin.auth.admin.deleteUser(u.uid);
      const code = INVITE_ERRORS.find((c) => (ae.message ?? "").includes(c)) ?? "accept_failed";
      return reply({ error: code }, 403, origin);
    }
  } else if (!uid) {
    const u = await ensureUser(admin, tgId);
    if (!u) return reply({ error: "create_failed" }, 500, origin);
    uid = u.uid;
    const { error: ae } = await admin.rpc("accept_invite", {
      _code: invite, _uid: uid, _tg_id: tgId, _tg_username: username, _tg_name: name,
    });
    if (ae) {
      if (u.created) await admin.auth.admin.deleteUser(u.uid);
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
