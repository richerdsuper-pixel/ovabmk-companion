// Ключ активации офлайн-программы. Вызывает принятый на сайте сотрудник; должность в офлайн-программе назначил администратор.
// Ключ подписан закрытым ключом сервера (ECDSA P-256; хранится в закрытой таблице базы, читается от имени сервиса); офлайн-программа проверяет подпись открытым ключом,
// поэтому подделать должность нельзя. В ключе нет данных пациентов: только должность, Ф.И.О., учреждение и открытый ключ администратора.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const DAYS = 30;

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
export function b64url(u: Uint8Array): string {
  let s = ""; for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function signToken(payload: Record<string, unknown>, jwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body)));
  return body + "." + b64url(sig);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return reply({ error: "server_config" }, 500, origin);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return reply({ error: "unauthorized" }, 401, origin);
  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  // {uid} — ключ для сотрудника выдаёт администратор (проверка прав — в базе), без тела — свой ключ
  let body: { uid?: unknown } = {}; try { body = await req.json(); } catch { body = {}; }
  const uid = typeof body.uid === "string" && /^[0-9a-f-]{36}$/i.test(body.uid) ? body.uid : "";
  const { data, error } = uid ? await user.rpc("admin_offline_activation", { _uid: uid }) : await user.rpc("my_offline_activation");
  if (error) {
    const m = error.message ?? "";
    const code = /no_offline_role/.test(m) ? "no_offline_role" : /no_admin_key/.test(m) ? "no_admin_key" : /no_user/.test(m) ? "no_user" : /forbidden|permission/i.test(m) ? "forbidden" : "failed";
    return reply({ error: code }, code === "failed" ? 500 : 403, origin);
  }
  const d = data as { uid: string; role: string; name: string; pos: string; inst: string; k: { x: string; y: string } | null };
  const now = Math.floor(Date.now() / 1000);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const sk = await admin.rpc("offline_sign_jwk");
  const jwk = sk.data as JsonWebKey | null;
  if (sk.error || !jwk || !(jwk as { d?: string }).d) return reply({ error: "server_config" }, 500, origin);
  const token = await signToken({ v: 1, uid: d.uid, role: d.role, name: d.name, pos: d.pos, inst: d.inst, k: d.k, iat: now, exp: now + DAYS * 86400 }, jwk);
  return reply({ token, role: d.role, exp: now + DAYS * 86400 }, 200, origin);
});
