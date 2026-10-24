// Выдача файла рассылки по короткой подписанной ссылке.
// Сервер сам пишет в журнал «скачал» (функция broadcast_download вызывается от имени пользователя), поэтому получатель не может скачать мимо журнала:
// у получателей нет прямого доступа к хранилищу.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return reply({ ok: true }, 200, origin);
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return reply({ error: "server_config" }, 500, origin);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return reply({ error: "unauthorized" }, 401, origin);

  let body: { id?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "bad_request" }, 400, origin); }
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!UUID.test(id)) return reply({ error: "bad_request" }, 400, origin);

  const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: path, error } = await user.rpc("broadcast_download", { _id: id });
  if (error || typeof path !== "string") {
    const forbidden = /forbidden|permission/i.test(error?.message ?? "") || !error;
    return reply({ error: forbidden ? "forbidden" : "no_file" }, forbidden ? 403 : 404, origin);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const fileName = path.split("/").pop() ?? "file";
  const { data: signed, error: se } = await admin.storage.from("broadcasts").createSignedUrl(path, 90, { download: fileName });
  if (se || !signed?.signedUrl) return reply({ error: "sign_failed" }, 500, origin);
  return reply({ url: signed.signedUrl }, 200, origin);
});
