// Проверка данных Telegram Login Widget (https://core.telegram.org/widgets/login#checking-authorization)
export type TgUser = {
  id: number | string; first_name?: string; last_name?: string; username?: string;
  photo_url?: string; auth_date: number | string; hash: string;
};

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function checkString(d: Record<string, unknown>): string {
  return Object.keys(d)
    .filter((k) => k !== "hash" && d[k] !== undefined && d[k] !== null)
    .sort()
    .map((k) => `${k}=${d[k]}`)
    .join("\n");
}

export async function telegramHash(d: Record<string, unknown>, botToken: string): Promise<string> {
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(checkString(d))));
}

/** true, если подпись верна и данные не старше maxAgeSec */
export async function verifyTelegram(d: unknown, botToken: string, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!d || typeof d !== "object" || !botToken) return false;
  const o = d as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (!/^[a-z_]{1,20}$/.test(k)) return false;
    if (typeof v !== "string" && typeof v !== "number") return false;
  }
  if (typeof o.hash !== "string" || !/^[0-9a-f]{64}$/i.test(o.hash)) return false;
  if (!/^[0-9]{1,15}$/.test(String(o.id)) || !/^[0-9]{1,12}$/.test(String(o.auth_date))) return false;
  const age = nowSec - Number(o.auth_date);
  if (age < -60 || age > maxAgeSec) return false;
  return safeEqual(await telegramHash(o, botToken), o.hash.toLowerCase());
}
