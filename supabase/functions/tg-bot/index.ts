// Бот @OvaBMQbot и простой вход на сайт.
// 1) Сайт: action=start — анкета (или просто вход) → билет: код для ссылки t.me/бот?start=… и секрет браузера;
//    action=poll — что с билетом; когда можно, возвращает token_hash для входа (supabase.auth.verifyOtp), как tg-login.
// 2) Telegram (webhook, заголовок X-Telegram-Bot-Api-Secret-Token): /start <код> — привязать Telegram, подать заявку, ответить.
// 3) Администратор: action=approved — сотруднику уходит «Доступ открыт» с кнопкой входа (без повторного подтверждения).
// 4) action=setup (x-cron-secret) — один раз прописать webhook у Telegram.
// 5) Беременная: /start m<код> от доя → язык → согласие → привязка; «Моя страница» (мини-приложение docs/mother.html, action=mother_app с initData),
//    тревожные признаки → сигнал сотрудникам её учреждения; /stop — отключиться. action=mother_remind (x-cron-secret) — напоминания и утренняя сводка доя.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { approvedText, bindReply, helloText, isCode, startCode } from "./texts.ts";
import { consentButtons, doyaText, isLang, langButtons, type Lang, menuButtons, motherCode, parseBp, parseCb, reminderText, SIGNS, SIGNS_PP, SIGNS_PREG,
  signButtons, signLabel, signRu, staffAlertText, staffDigestText, tx, uzLat, verifyInitData, visitText } from "./mother.ts";
import { tipText, type Topic, topicText, topicTitle, TOPICS } from "./info.ts";
import { answerText, dayButtons, type DayRow, dayText, type Hr36Row, hr36Texts, locText, markText, validLoc, parsePillCb, parseQid, parseStaffCb, pillButtons, pillDone, pillText,
  questionText, STAFF_HELLO, staffMenu, familyCode, parseFamCb, parseSurveyCb, surveyButtons, monthDigestText, RELATIONS } from "./extra.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://richerdsuper-pixel.github.io/ovabmk-companion/";
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://richerdsuper-pixel.github.io").split(",").map((s) => s.trim());
const APP_URL = SITE.replace(/\/?$/, "/") + "mother.html";
const BOT_LINK = "https://t.me/" + (Deno.env.get("BOT_USERNAME") ?? "OvaBMQbot");
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

// ---------------------------------------------------------------- беременная
async function sayKb(chat: number, text: string, kb: unknown[][]) {
  try { await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: kb } }); } catch { /* не страшно */ }
}
async function motherOf(tgId: number): Promise<Record<string, any> | null> {
  const { data } = await admin().rpc("bot_mother_view", { _tg: tgId });
  return (data as Record<string, any>) ?? null;
}
type FamRow = { telegram_id: number; relation: string; lang: string; first_name: string };
async function familyOf(tgId: number): Promise<FamRow[]> {
  const { data } = await admin().rpc("bot_family_of", { _tg: tgId });
  return (data ?? []) as FamRow[];
}
// копия сообщения родственникам беременной (муж, мама, свекровь — с её согласия)
async function toFamily(tgId: number, make: (lang: Lang, name: string) => string): Promise<number> {
  let sent = 0;
  for (const f of await familyOf(tgId)) {
    const lang: Lang = isLang(f.lang) ? f.lang : "uz";
    const x = await tg("sendMessage", { chat_id: f.telegram_id, text: make(lang, f.first_name || ""), disable_web_page_preview: true }).catch(() => null);
    if (x && x.ok) sent++;
  }
  return sent;
}
async function sendAlert(tgId: number, signs: string[]): Promise<number | null> {
  const { data, error } = await admin().rpc("bot_mother_alert", { _tg: tgId, _signs: signs });
  if (error) return null;
  const rows = (data ?? []) as { telegram_id: number; mother_id: string; mother_name: string; mother_phone: string | null; mahalla: string | null; address: string | null }[];
  let sent = 0;
  for (const r of rows) {
    const x = await tg("sendMessage", { chat_id: r.telegram_id, text: staffAlertText(signs, r, SITE.replace(/\/?$/, "/")), disable_web_page_preview: true }).catch(() => null);
    if (x && x.ok) sent++;
  }
  await toFamily(tgId, (lang, name) => tx("fam_alert", lang, { name, sign: signs.map((k) => signLabel(k, lang)).join(", ") }));
  return sent;
}
// место беременной: к последнему сигналу — точка на карте каждому получателю
async function sendLocation(tgId: number, lat: number, lon: number): Promise<{ sent: number; error?: string }> {
  const { data, error } = await admin().rpc("bot_mother_location", { _tg: tgId, _lat: lat, _lon: lon });
  if (error) return { sent: 0, error: "failed" };
  const rows = (data ?? []) as { telegram_id: number | null; mother_name: string; mother_phone: string | null; signs: string[]; error: string | null }[];
  if (rows[0]?.error) return { sent: 0, error: rows[0].error };
  let sent = 0;
  for (const r of rows) {
    if (!r.telegram_id) continue;
    await tg("sendLocation", { chat_id: r.telegram_id, latitude: lat, longitude: lon }).catch(() => null);
    const x = await tg("sendMessage", { chat_id: r.telegram_id, text: locText(r.mother_name, r.mother_phone, r.signs ?? [], signRu), disable_web_page_preview: true }).catch(() => null);
    if (x && x.ok) sent++;
  }
  return { sent };
}
// давление: запись, ответ и при высоком — сигнал сотрудникам
async function recordBp(tgId: number, sys: number, dia: number): Promise<{ level?: string; error?: string; sent?: number }> {
  const { data, error } = await admin().rpc("bot_mother_bp", { _tg: tgId, _sys: sys, _dia: dia });
  if (error) return { error: "failed" };
  const r = (data ?? {}) as { level?: string; error?: string };
  if (r.level === "high" || r.level === "severe") return { level: r.level, sent: (await sendAlert(tgId, [r.level === "severe" ? "bp_severe" : "bp_high"])) ?? 0 };
  return r;
}
function bpReply(r: { level?: string; error?: string }, sys: number, dia: number, lang: Lang): string {
  if (r.error === "too_many") return tx("bp_many", lang);
  if (r.error) return tx("bp_bad", lang);
  return tx(r.level === "severe" ? "bp_severe" : r.level === "high" ? "bp_high" : "bp_ok", lang, { v: sys + "/" + dia });
}
async function onMotherCb(q: Record<string, any>): Promise<void> {
  const chat = Number(q.message?.chat?.id ?? q.from?.id), tgId = Number(q.from?.id);
  try { await tg("answerCallbackQuery", { callback_query_id: q.id }); } catch { /* */ }
  const cb = parseCb(q.data);
  if (!cb || !chat || !tgId) return;
  if (cb.k === "ml") {
    const { data: ok } = await admin().rpc("bot_mother_code_ok", { _code: cb.code });
    if (ok !== true) { await say(chat, tx("expired", cb.lang!)); return; }
    await sayKb(chat, tx("consent", cb.lang!), consentButtons(cb.lang!, cb.code!)); return;
  }
  if (cb.k === "mc") {
    const { data } = await admin().rpc("bot_mother_link", { _code: cb.code, _tg: tgId, _lang: cb.lang });
    const r = (data ?? {}) as { ok?: boolean; first_name?: string };
    if (!r.ok) { await say(chat, tx("expired", cb.lang!)); return; }
    try { await tg("setChatMenuButton", { chat_id: chat, menu_button: { type: "web_app", text: tx("page", cb.lang!).replace("📋 ", ""), web_app: { url: APP_URL + "?l=" + cb.lang } } }); } catch { /* */ }
    await sayKb(chat, tx("welcome", cb.lang!, { name: r.first_name || "" }), menuButtons(cb.lang!, APP_URL)); return;
  }
  const mo = await motherOf(tgId), lang: Lang = mo && isLang(mo.lang) ? mo.lang : "uz";
  if (cb.k === "mn") { await say(chat, tx("declined", lang)); return; }
  if (!mo) { await say(chat, tx("not_linked", lang)); return; }
  if (cb.k === "ma") { await sayKb(chat, tx("danger_pick", lang), signButtons(lang, mo.status === "postpartum")); return; }
  if (cb.k === "mh") { await sayKb(chat, tx("help", lang), menuButtons(lang, APP_URL)); return; }
  if (cb.k === "mi" && cb.sign) {
    const k = cb.sign;
    const text = k === "visit" ? visitText(mo, lang) : k === "call" ? doyaText(mo, lang) : k === "bp" ? tx("bp_ask", lang)
      : (TOPICS as readonly string[]).includes(k) ? topicText(k as Topic, lang) : tx("help", lang);
    await sayKb(chat, text, k === "signs" ? [[{ text: tx("danger", lang), callback_data: "ma" }]] : []); return;
  }
  if (cb.k === "ms" && cb.sign) {
    const n = await sendAlert(tgId, [cb.sign]);
    await say(chat, tx(n ? "danger_sent" : "danger_nobody", lang, { sign: signLabel(cb.sign, lang), n: n ?? 0 }));
    if (n) { try { await tg("sendMessage", { chat_id: chat, text: tx("loc_ask", lang), reply_markup: { keyboard: [[{ text: tx("loc_btn", lang), request_location: true }]], resize_keyboard: true, one_time_keyboard: true } }); } catch { /* */ } }
  }
}

// ---------------------------------------------------------------- сотрудник в боте
const SITE_SLASH = SITE.replace(/\/?$/, "/");
async function staffHello(chat: number) {
  try { await tg("setChatMenuButton", { chat_id: chat, menu_button: { type: "web_app", text: "OvaBMҚ", web_app: { url: SITE_SLASH } } }); } catch { /* */ }
  await sayKb(chat, STAFF_HELLO, staffMenu(SITE_SLASH));
}
async function sendDay(chat: number, tgId: number) {
  const { data, error } = await admin().rpc("bot_staff_day", { _tg: tgId });
  if (error) { await say(chat, "Не получилось загрузить список. Попробуйте позже."); return; }
  const rows = (data ?? []) as DayRow[];
  await sayKb(chat, dayText(rows, SITE_SLASH), dayButtons(rows));
}
async function onStaffCb(q: Record<string, any>, cb: NonNullable<ReturnType<typeof parseStaffCb>>): Promise<void> {
  const chat = Number(q.message?.chat?.id ?? q.from?.id), tgId = Number(q.from?.id);
  if (cb.k === "sd") { try { await tg("answerCallbackQuery", { callback_query_id: q.id }); } catch { /* */ } await sendDay(chat, tgId); return; }
  const { data } = await admin().rpc("bot_staff_mark", { _tg: tgId, _mother: cb.mother, _kind: cb.k === "sa" ? "anc" : "home", _code: cb.code });
  const text = markText((data ?? {}) as Record<string, any>, cb.k, cb.code);
  try { await tg("answerCallbackQuery", { callback_query_id: q.id, text: text.slice(0, 190), show_alert: false }); } catch { /* */ }
  await say(chat, text);
}
async function onPillCb(q: Record<string, any>, kinds: string[]): Promise<void> {
  const chat = Number(q.message?.chat?.id ?? q.from?.id), tgId = Number(q.from?.id);
  for (const k of kinds) await admin().rpc("bot_mother_pill", { _tg: tgId, _kind: k, _on: true });
  const mo = await motherOf(tgId), lang: Lang = mo && isLang(mo.lang) ? mo.lang : "uz";
  try { await tg("answerCallbackQuery", { callback_query_id: q.id, text: pillDone(lang) }); } catch { /* */ }
  await say(chat, pillDone(lang));
}
// вопрос доя (текстом из мини-приложения или голосом в боте): сотрудникам — текст с #q, и сам голос следом
async function askDoya(tgId: number, text: string, voice?: { chat: number; msg: number }): Promise<{ qid?: number; sent: number; error?: string }> {
  const { data, error } = await admin().rpc("bot_mother_ask", { _tg: tgId, _text: text.slice(0, 1000) });
  if (error) return { sent: 0, error: "failed" };
  const r = (data ?? {}) as { error?: string; qid?: number; q?: string; mother_id?: string; mother_name?: string; mother_phone?: string | null; recipients?: number[] };
  if (r.error) return { sent: 0, error: r.error };
  let sent = 0;
  for (const id of r.recipients ?? []) {
    const x = await tg("sendMessage", { chat_id: id, text: questionText(r.qid!, r.q ?? "", r.mother_name ?? "", r.mother_phone ?? null, r.mother_id ?? "", SITE), disable_web_page_preview: true }).catch(() => null);
    if (!(x && x.ok)) continue;
    sent++;
    if (voice) {
      const j = await x.json().catch(() => null) as { result?: { message_id?: number } } | null;
      await tg("copyMessage", { chat_id: id, from_chat_id: voice.chat, message_id: voice.msg, reply_to_message_id: j?.result?.message_id }).catch(() => null);
    }
  }
  return { qid: r.qid, sent };
}
// ответ сотрудника на вопрос беременной (Reply на сообщение бота с #q…), текстом или голосом
async function onStaffReply(chat: number, tgId: number, qid: number, text: string, voiceMsg?: number): Promise<boolean> {
  const { data, error } = await admin().rpc("bot_staff_answer", { _tg: tgId, _qid: qid, _text: text });
  if (error) return false;
  const r = (data ?? {}) as { ok?: boolean; error?: string; q?: string; a?: string; staff_name?: string; telegram_id?: number; lang?: string };
  if (r.error === "not_staff") return false;
  if (!r.ok) { await say(chat, r.error === "forbidden" ? "Нет доступа к этой беременной." : "Не получилось сохранить ответ."); return true; }
  let sent = false;
  if (r.telegram_id) {
    const lang: Lang = isLang(r.lang) ? r.lang : "uz";
    const x = await tg("sendMessage", { chat_id: r.telegram_id, text: answerText(lang, r.q ?? "", r.a ?? "", r.staff_name ?? ""), disable_web_page_preview: true }).catch(() => null);
    sent = !!(x && x.ok);
    if (sent && voiceMsg) await tg("copyMessage", { chat_id: r.telegram_id, from_chat_id: chat, message_id: voiceMsg }).catch(() => null);
  }
  await say(chat, sent ? "✅ Ответ отправлен беременной." : "Ответ сохранён, но беременная не подключена к боту — позвоните ей.");
  return true;
}

// ---------------------------------------------------------------- семья и опрос
async function onFamCb(q: Record<string, any>, cb: { rel: string; code: string }): Promise<void> {
  const chat = Number(q.message?.chat?.id ?? q.from?.id), tgId = Number(q.from?.id);
  try { await tg("answerCallbackQuery", { callback_query_id: q.id }); } catch { /* */ }
  const { data } = await admin().rpc("bot_family_link", { _code: cb.code, _tg: tgId, _relation: cb.rel });
  const r = (data ?? {}) as { ok?: boolean; error?: string; first_name?: string; lang?: string };
  const lang: Lang = isLang(r.lang) ? r.lang : "uz";
  if (!r.ok) {
    const k = r.error === "is_mother" ? "fam_is_mother" : r.error === "too_many" ? "fam_too_many" : "fam_expired";
    await say(chat, tx(k, "uz") + "\n" + tx(k, "ru")); return;
  }
  await say(chat, tx("fam_welcome", lang, { name: r.first_name || "" }));
}
async function onSurveyCb(q: Record<string, any>, cb: { q: number; v: number }): Promise<void> {
  const chat = Number(q.message?.chat?.id ?? q.from?.id), tgId = Number(q.from?.id), mid = q.message?.message_id;
  try { await tg("answerCallbackQuery", { callback_query_id: q.id }); } catch { /* */ }
  const { data } = await admin().rpc("bot_survey_answer", { _tg: tgId, _q: cb.q, _v: cb.v });
  const r = (data ?? {}) as { ok?: boolean; next?: number };
  if (!r.ok) return;
  const mo = await motherOf(tgId), lang: Lang = mo && isLang(mo.lang) ? mo.lang : "uz";
  const text = r.next ? tx("sv_q" + r.next, lang) : tx("sv_thanks", lang);
  const kb = r.next ? surveyButtons(r.next, tx("sv_yes", lang), tx("sv_no", lang)) : [];
  const x = mid ? await tg("editMessageText", { chat_id: chat, message_id: mid, text, reply_markup: { inline_keyboard: kb } }).catch(() => null) : null;
  if (!(x && x.ok)) await sayKb(chat, text, kb);
}
function famChooseKb(code: string) {
  return [RELATIONS.slice(0, 2), RELATIONS.slice(2)].map((row) => row.map((rel) => ({ text: tx("rel_" + rel, "uz") + " / " + tx("rel_" + rel, "ru"), callback_data: `fr:${rel}:${code}` })));
}

// ---------------------------------------------------------------- Telegram webhook
async function onUpdate(u: Record<string, any>): Promise<void> {
  if (u.callback_query) {
    const sc = parseStaffCb(u.callback_query.data);
    if (sc) { await onStaffCb(u.callback_query, sc); return; }
    const fc = parseFamCb(u.callback_query.data);
    if (fc) { await onFamCb(u.callback_query, fc); return; }
    const sv = parseSurveyCb(u.callback_query.data);
    if (sv) { await onSurveyCb(u.callback_query, sv); return; }
    const pk = parsePillCb(u.callback_query.data);
    if (pk) { await onPillCb(u.callback_query, pk); return; }
    await onMotherCb(u.callback_query); return;
  }
  const m = u.message;
  if (!m || !m.from || m.chat?.type !== "private") return;
  const from = m.from, chat = Number(m.chat.id);
  const fcode = familyCode(m.text);
  if (fcode) {   // родственник открыл ссылку беременной
    await sayKb(chat, tx("fam_choose", "uz") + "\n\n" + tx("fam_choose", "ru"), famChooseKb(fcode)); return;
  }
  const mc = motherCode(m.text);
  if (mc) {
    const { data: ok } = await admin().rpc("bot_mother_code_ok", { _code: mc });
    if (ok !== true) { await say(chat, tx("expired", "uz") + "\n" + tx("expired", "ru")); return; }
    await sayKb(chat, tx("choose_lang", "uz") + " / " + tx("choose_lang", "uzl") + " / " + tx("choose_lang", "ru"), langButtons(mc)); return;
  }
  if (m.location) {   // беременная отправила, где она (кнопка после тревожного сигнала)
    const mo = await motherOf(Number(from.id));
    if (mo) {
      const lang: Lang = isLang(mo.lang) ? mo.lang : "uz", p = validLoc(m.location.latitude, m.location.longitude);
      const r = p ? await sendLocation(Number(from.id), p.lat, p.lon) : { sent: 0, error: "bad_location" };
      try { await tg("sendMessage", { chat_id: chat, text: r.error === "no_alert" ? tx("loc_none", lang) : r.error ? tx("help", lang) : tx("loc_sent", lang, { n: r.sent }),
        reply_markup: { remove_keyboard: true } }); } catch { /* */ }
      return;
    }
  }
  const text = typeof m.text === "string" ? m.text.trim() : "";
  const qid = parseQid(m.reply_to_message?.text);
  if (qid && text && await onStaffReply(chat, Number(from.id), qid, text)) return;
  if (m.voice || m.audio) {   // голосовой вопрос беременной или голосовой ответ сотрудника
    if (qid && await onStaffReply(chat, Number(from.id), qid, "🎤 Голосовой ответ", Number(m.message_id))) return;
    const mo = await motherOf(Number(from.id));
    if (mo) {
      const lang: Lang = isLang(mo.lang) ? mo.lang : "uz";
      const r = await askDoya(Number(from.id), "🎤 Голосовое сообщение", { chat, msg: Number(m.message_id) });
      await say(chat, r.error === "too_many" ? tx("bp_many", lang) : r.error ? tx("help", lang) : tx("voice_sent", lang, { n: r.sent })); return;
    }
  }
  if (/^\/stop(@\w+)?$/.test(text)) {
    const mo = await motherOf(Number(from.id)), lang: Lang = mo && isLang(mo.lang) ? mo.lang : "uz";
    const { data: fam } = await admin().rpc("bot_family_stop", { _tg: Number(from.id) });
    if (fam === true) { await say(chat, tx("fam_stopped", "uz") + "\n" + tx("fam_stopped", "ru")); return; }
    const { data: was } = await admin().rpc("bot_mother_stop", { _tg: Number(from.id) });
    if (was === true) { try { await tg("setChatMenuButton", { chat_id: chat, menu_button: { type: "default" } }); } catch { /* */ } }
    await say(chat, was === true ? tx("stopped", lang) : tx("not_linked", lang)); return;
  }
  const c = startCode(m.text);
  if (!c) {
    const mo = await motherOf(Number(from.id));
    if (mo) {
      const lang: Lang = isLang(mo.lang) ? mo.lang : "uz", bp = parseBp(text);
      if (bp) { await say(chat, bpReply(await recordBp(Number(from.id), bp.sys, bp.dia), bp.sys, bp.dia, lang)); return; }
      await sayKb(chat, tx("help", lang), menuButtons(lang, APP_URL)); return;
    }
  }
  if (!c) {
    const { data: staff } = await admin().rpc("user_by_telegram", { _tg_id: Number(from.id) });
    if (staff) { if (/^\/(day|list)\b/.test(text)) await sendDay(chat, Number(from.id)); else await staffHello(chat); return; }
    await say(chat, helloText(SITE), { text: "Открыть сайт / Saytni ochish", url: SITE }); return;
  }
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
  if (body.action === "announce") {   // объявление беременным учреждения / махалли — от имени сотрудника (права проверяет база)
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ") || !ANON_KEY) return reply({ error: "bad_request" }, 400, origin);
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const mah = Array.isArray(body.mahallas) ? (body.mahallas as unknown[]).map(Number).filter(Number.isInteger).slice(0, 200) : null;
    const { data: id, error } = await user.rpc("announce_create", { _inst: Number(body.institution) || 0, _mah: mah && mah.length ? mah : null, _body: String(body.body ?? "").slice(0, 1000) });
    if (error) {
      const k = ["forbidden", "bad_text", "too_many"].find((x) => (error.message ?? "").includes(x)) ?? "failed";
      return reply({ error: k }, k === "forbidden" ? 403 : 400, origin);
    }
    const db = admin();
    const { data: rows } = await db.rpc("announce_targets", { _id: id });
    let sent = 0;
    for (const r of (rows ?? []) as { telegram_id: number; lang: string; body: string; inst_name: string }[]) {
      const lang: Lang = isLang(r.lang) ? r.lang : "uz";
      const x = await tg("sendMessage", { chat_id: r.telegram_id, text: `📢 ${r.inst_name}\n\n${r.body}`, disable_web_page_preview: true,
        reply_markup: { inline_keyboard: menuButtons(lang, APP_URL) } }).catch(() => null);
      if (x && x.ok) sent++;
    }
    await db.rpc("announce_done", { _id: id, _total: (rows ?? []).length, _sent: sent });
    return reply({ id, total: (rows ?? []).length, sent }, 200, origin);
  }
  if (body.action === "staff_app") {   // сайт открыт внутри Telegram: вход сотрудника по подписи Telegram
    const who = await verifyInitData(typeof body.init === "string" ? body.init : "", BOT_TOKEN);
    if (!who) return reply({ error: "unauthorized" }, 401, origin);
    const db = admin();
    const { data: uid } = await db.rpc("user_by_telegram", { _tg_id: who.id });
    if (!uid) return reply({ error: "not_member" }, 404, origin);
    await db.rpc("touch_telegram", { _uid: uid, _tg_username: who.username });
    const th = await tokenFor(db, uid as string);
    if (!th) return reply({ error: "link_failed" }, 500, origin);
    return reply({ token_hash: th }, 200, origin);
  }
  if (body.action === "mother_app") {   // мини-приложение «Моя страница»: подпись Telegram вместо входа
    const who = await verifyInitData(typeof body.init === "string" ? body.init : "", BOT_TOKEN);
    if (!who) return reply({ error: "unauthorized" }, 401, origin);
    if (body.op === "alert") {
      const signs = Array.isArray(body.signs) ? (body.signs as unknown[]).filter((x): x is string => typeof x === "string" && SIGNS.includes(x)).slice(0, 10) : [];
      if (!signs.length) return reply({ error: "bad_request" }, 400, origin);
      const n = await sendAlert(who.id, signs);
      if (n === null) return reply({ error: "failed" }, 500, origin);
      return reply({ sent: n }, 200, origin);
    }
    if (body.op === "location") {   // «Моя страница»: место после сигнала
      const p = validLoc(body.lat, body.lon);
      if (!p) return reply({ error: "bad_location" }, 200, origin);
      const r = await sendLocation(who.id, p.lat, p.lon);
      return reply(r, r.error === "failed" ? 500 : 200, origin);
    }
    if (body.op === "birthplan") {   // план родов
      const p = body.p && typeof body.p === "object" ? body.p : {};
      const { data, error } = await admin().rpc("bot_mother_birthplan", { _tg: who.id, _p: p });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    if (body.op === "lang" && isLang(body.lang)) { await admin().rpc("bot_mother_lang", { _tg: who.id, _lang: body.lang }); return reply({ ok: true }, 200, origin); }
    if (body.op === "bp") {
      const sys = Number(body.sys), dia = Number(body.dia);
      const r = Number.isInteger(sys) && Number.isInteger(dia) ? await recordBp(who.id, sys, dia) : { error: "bad_bp" };
      return reply(r, r.error === "failed" ? 500 : 200, origin);
    }
    if (body.op === "weight") {   // дневник веса
      const kg = Number(body.kg);
      if (!Number.isFinite(kg)) return reply({ error: "bad_weight" }, 200, origin);
      const { data, error } = await admin().rpc("bot_mother_weight", { _tg: who.id, _kg: kg });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    if (body.op === "ask") {   // вопрос доя
      const r = await askDoya(who.id, typeof body.text === "string" ? body.text : "");
      if (r.error) return reply({ error: r.error }, r.error === "failed" ? 500 : 200, origin);
      return reply({ qid: r.qid, sent: r.sent }, 200, origin);
    }
    if (body.op === "family_invite") {   // ссылка для мужа / мамы / свекрови
      const { data, error } = await admin().rpc("bot_family_invite", { _tg: who.id });
      if (error) return reply({ error: "failed" }, 500, origin);
      const r = (data ?? {}) as { code?: string; error?: string };
      return reply(r.code ? { link: BOT_LINK + "?start=" + r.code } : r, 200, origin);
    }
    if (body.op === "vacc") {   // календарь прививок для вкладки «Малыш»
      const { data, error } = await admin().rpc("vacc_list");
      return reply(error ? { error: "failed" } : data ?? [], error ? 500 : 200, origin);
    }
    if (body.op === "family_remove") {
      const { data, error } = await admin().rpc("bot_family_remove", { _tg: who.id, _id: Number(body.id) || 0 });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    if (body.op === "pill_hour") {
      const h = body.hour === null ? null : Number(body.hour);
      const { data, error } = await admin().rpc("bot_mother_pill_hour", { _tg: who.id, _hour: h !== null && Number.isInteger(h) ? h : null });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    if (body.op === "baby") {
      const d = typeof body.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.d) ? body.d : null;
      const { data, error } = await admin().rpc("bot_mother_baby", { _tg: who.id, _kind: String(body.kind ?? ""), _val: String(body.val ?? "").slice(0, 80), _d: d });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    if (body.op === "pill") {   // витамины: отметка «выпила сегодня»
      if (typeof body.kind !== "string") return reply({ error: "bad_kind" }, 200, origin);
      const { data, error } = await admin().rpc("bot_mother_pill", { _tg: who.id, _kind: body.kind, _on: body.on !== false });
      return reply(error ? { error: "failed" } : data, error ? 500 : 200, origin);
    }
    const mo = await motherOf(who.id);
    if (!mo) return reply({ error: "not_linked" }, 404, origin);
    const lang: Lang = isLang(body.lang) ? body.lang : isLang(mo.lang) ? mo.lang : "uz";   // подписи для мини-приложения — из тех же текстов, что и в боте
    mo.ui = { signs: (mo.status === "postpartum" ? SIGNS_PP : SIGNS_PREG).map((k) => ({ k, label: signLabel(k, lang) })),
      topics: TOPICS.map((k) => ({ k, title: topicTitle(k, lang), text: topicText(k, lang).split("\n\n").slice(1).join("\n\n") })) };
    return reply(mo, 200, origin);
  }
  if (body.action === "mother_remind") {   // планировщик: mode=mothers — напоминания беременным; mode=staff — утренняя сводка сотрудникам
    const sec = req.headers.get("x-cron-secret") ?? "";
    const db = admin();
    if (body.mode === "weekly") {   // советы по сроку
      const { data, error } = await db.rpc("cron_mother_weekly", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; lang: string; topic: string; first_name: string; pe: string }[]) {
        const lang: Lang = isLang(r.lang) ? r.lang : "uz", text = tipText(r.topic, lang, r.first_name, r.pe);
        if (!text) continue;
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: menuButtons(lang, APP_URL) } }).catch(() => null);
        if (x && x.ok) sent++;
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "pills") {   // напоминание о витаминах в выбранный час
      const { data, error } = await db.rpc("cron_mother_pills", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; lang: string; first_name: string; kinds: string[] }[]) {
        const lang: Lang = isLang(r.lang) ? r.lang : "uz";
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text: pillText(lang, r.first_name, r.kinds), reply_markup: { inline_keyboard: pillButtons(lang, r.kinds) } }).catch(() => null);
        if (x && x.ok) sent++;
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "vaccines") {   // прививки ребёнку по календарю (до 5 лет)
      const { data, error } = await db.rpc("cron_mother_vaccines", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; lang: string; first_name: string; labels_ru: string[]; labels_uz: string[] }[]) {
        const lang: Lang = isLang(r.lang) ? r.lang : "uz";
        const list = (lang === "ru" ? r.labels_ru : r.labels_uz).join("\n• ");
        const text = tx("vac_rem", lang, { name: r.first_name || "", list: lang === "uzl" ? uzLat(list) : list });
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: menuButtons(lang, APP_URL) } }).catch(() => null);
        if (x && x.ok) sent++;
        await toFamily(r.telegram_id, (fl, name) => tx("fam_rem", fl, { name }) + "\n" + tx("vac_rem", fl, { name, list: fl === "ru" ? r.labels_ru.join("\n• ") : fl === "uzl" ? uzLat(r.labels_uz.join("\n• ")) : r.labels_uz.join("\n• ") }));
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "survey") {   // анонимный опрос после родов
      const { data, error } = await db.rpc("cron_mother_survey", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; lang: string; first_name: string }[]) {
        const lang: Lang = isLang(r.lang) ? r.lang : "uz";
        await tg("sendMessage", { chat_id: r.telegram_id, text: tx("sv_intro", lang, { name: r.first_name || "" }) }).catch(() => null);
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text: tx("sv_q1", lang), reply_markup: { inline_keyboard: surveyButtons(1, tx("sv_yes", lang), tx("sv_no", lang)) } }).catch(() => null);
        if (x && x.ok) sent++;
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "month") {   // 1-го числа: итоги прошлого месяца руководителям / хокимияту
      const { data, error } = await db.rpc("cron_month_digest", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; month: string; cur: Record<string, number>; prev: Record<string, number> }[]) {
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text: monthDigestText(String(r.month), r.cur ?? {}, r.prev ?? {}, SITE_SLASH), disable_web_page_preview: true }).catch(() => null);
        if (x && x.ok) sent++;
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "duty36") {   // дежурному роддома: женщины высокого риска на 36 неделе
      const { data, error } = await db.rpc("cron_duty_hr36", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      const by = new Map<number, Hr36Row[]>();
      for (const r of (data ?? []) as Hr36Row[]) { if (!by.has(r.telegram_id)) by.set(r.telegram_id, []); by.get(r.telegram_id)!.push(r); }
      let sent = 0;
      for (const [chat, rows] of by) {
        for (const text of hr36Texts(rows, SITE_SLASH)) {
          const x = await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch(() => null);
          if (x && x.ok) sent++;
        }
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    if (body.mode === "staff") {
      const { data, error } = await db.rpc("cron_staff_digest", { _secret: sec });
      if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
      let sent = 0;
      for (const r of (data ?? []) as { telegram_id: number; full_name: string; due: number; missed: number; home_due: number; home_missed: number; alerts: number }[]) {
        const x = await tg("sendMessage", { chat_id: r.telegram_id, text: staffDigestText(r, SITE_SLASH), disable_web_page_preview: true,
          reply_markup: { inline_keyboard: staffMenu(SITE_SLASH) } }).catch(() => null);
        if (x && x.ok) sent++;
      }
      return reply({ total: (data ?? []).length, sent }, 200, origin);
    }
    const { data, error } = await db.rpc("cron_mother_reminders", { _secret: sec });
    if (error) return reply({ error: /forbidden/.test(error.message) ? "forbidden" : "failed" }, /forbidden/.test(error.message) ? 403 : 500, origin);
    let sent = 0;
    for (const r of (data ?? []) as { telegram_id: number; lang: string; kind: string; label: string; date_to: string; tests: unknown; first_name: string }[]) {
      const lang: Lang = isLang(r.lang) ? r.lang : "uz";
      const x = await tg("sendMessage", { chat_id: r.telegram_id, text: reminderText(r), disable_web_page_preview: true,
        reply_markup: { inline_keyboard: menuButtons(lang, APP_URL) } }).catch(() => null);
      if (x && x.ok) sent++;
      await toFamily(r.telegram_id, (fl, name) => tx("fam_rem", fl, { name }) + "\n" + reminderText({ ...r, lang: fl }));
    }
    return reply({ total: (data ?? []).length, sent }, 200, origin);
  }
  if (body.action === "setup") {   // один раз: x-cron-secret
    const sec = req.headers.get("x-cron-secret") ?? "";
    const { data: ok } = await admin().rpc("cron_secret_ok", { _secret: sec });
    if (ok !== true) return reply({ error: "forbidden" }, 403, origin);
    if (body.info === true) { const i = await tg("getWebhookInfo", {}); return reply(await i.json(), 200, origin); }
    const r = await tg("setWebhook", { url: `${SUPABASE_URL}/functions/v1/tg-bot`, secret_token: await webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    return reply(await r.json(), 200, origin);
  }
  return reply({ error: "bad_request" }, 400, origin);
});
