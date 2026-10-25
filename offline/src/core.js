/* ===== Утилиты ===== */
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  (function add(list) {
    if (list == null || list === false) return;
    if (Array.isArray(list)) return list.forEach(add);
    e.appendChild(list.nodeType ? list : document.createTextNode(String(list)));
  })(kids);
  return e;
}
function nowD() { return window.__NOW ? new Date(window.__NOW) : new Date(); }
function p2(n) { return (n < 10 ? "0" : "") + n; }
function ymdOf(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
function todayStr() { return ymdOf(nowD()); }
function dUTC(s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
function addDays(s, n) { var d = new Date(dUTC(s) + n * 86400000); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); }
function diffDays(a, b) { return Math.round((dUTC(a) - dUTC(b)) / 86400000); }
function dow(s) { return new Date(dUTC(s)).getUTCDay(); }
function fmtD(s) { if (!s) return ""; var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s); return m ? m[3] + "." + m[2] + "." + m[1] : String(s); }
function fmtDT(ts) { var d = new Date(ts); return fmtD(ymdOf(d)) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
var DOW_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
function parseDate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") { if (v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); } return ""; }
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s))) return m[1] + "-" + m[2] + "-" + m[3];
  if ((m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/.exec(s))) return m[3] + "-" + p2(+m[2]) + "-" + p2(+m[1]);
  return "";
}
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9а-яёўқғҳ]+/gi, ""); }
function uid() { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function download(name, blob) {
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
var ROLE = {}; ROLES.forEach(function (r) { ROLE[r.no] = r; });
function roleName(no) { return (ROLE[no] || {}).ru || ("Роль " + no); }

/* ===== Шифрование и хранилище ===== */
var Vault = (function () {
  var key = null, db = null, mem = {}, usingMem = false, ITER = 250000;
  function idbOpen() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open("ovabmk-offline", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  async function init() {
    try { db = await idbOpen(); usingMem = false; } catch (e) { db = null; usingMem = true; }
    return !usingMem;
  }
  function tx(mode) { return db.transaction("kv", mode).objectStore("kv"); }
  function get(k) {
    if (usingMem) return Promise.resolve(mem[k]);
    return new Promise(function (res, rej) { var r = tx("readonly").get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }
  function put(k, v) {
    if (usingMem) { mem[k] = v; return Promise.resolve(); }
    return new Promise(function (res, rej) { var r = tx("readwrite").put(v, k); r.onsuccess = function () { res(); }; r.onerror = function () { rej(r.error); }; });
  }
  function del(k) {
    if (usingMem) { delete mem[k]; return Promise.resolve(); }
    return new Promise(function (res, rej) { var r = tx("readwrite").delete(k); r.onsuccess = function () { res(); }; r.onerror = function () { rej(r.error); }; });
  }
  function keys() {
    if (usingMem) return Promise.resolve(Object.keys(mem));
    return new Promise(function (res, rej) { var r = tx("readonly").getAllKeys(); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }
  async function clearAll() { var ks = await keys(); for (var i = 0; i < ks.length; i++) await del(ks[i]); }
  async function derive(pw, salt, iter) {
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function gz(u8) { var cs = new CompressionStream("gzip"), w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  async function gunz(u8) { var ds = new DecompressionStream("gzip"), w = ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function enc(k, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var raw = await gz(new TextEncoder().encode(JSON.stringify(obj)));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, raw));
    return { iv: iv, ct: ct };
  }
  async function dec(k, rec) {
    var raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, k, rec.ct));
    return JSON.parse(new TextDecoder().decode(await gunz(raw)));
  }
  return {
    init: init, isMem: function () { return usingMem; },
    hasVault: async function () { return !!(await get("meta")); },
    isOpen: function () { return !!key; },
    create: async function (pw) {
      var salt = crypto.getRandomValues(new Uint8Array(16));
      key = await derive(pw, salt, ITER);
      await put("meta", { salt: salt, iter: ITER, ver: await enc(key, "ovabmk-ok") });
    },
    unlock: async function (pw) {
      var m = await get("meta"); if (!m) throw new Error("нет хранилища");
      var k = await derive(pw, m.salt, m.iter);
      try { var ok = await dec(k, m.ver); if (ok !== "ovabmk-ok") throw 0; } catch (e) { return false; }
      key = k; return true;
    },
    lock: function () { key = null; },
    save: async function (k, obj) { await put(k, await enc(key, obj)); },
    load: async function (k) { var r = await get(k); return r ? dec(key, r) : null; },
    remove: del, keys: keys, clearAll: clearAll,
    rekey: async function (oldPw, newPw) {
      var m = await get("meta"), ok = await derive(oldPw, m.salt, m.iter);
      try { if ((await dec(ok, m.ver)) !== "ovabmk-ok") throw 0; } catch (e) { return false; }
      var ks = (await keys()).filter(function (k) { return k !== "meta"; }), vals = {};
      for (var i = 0; i < ks.length; i++) vals[ks[i]] = await dec(ok, await get(ks[i]));
      var salt = crypto.getRandomValues(new Uint8Array(16)), nk = await derive(newPw, salt, ITER);
      for (var j = 0; j < ks.length; j++) await put(ks[j], await enc(nk, vals[ks[j]]));
      await put("meta", { salt: salt, iter: ITER, ver: await enc(nk, "ovabmk-ok") });
      key = nk; return true;
    },
    exportBackup: async function () {
      var out = { v: 1, app: "ovabmk-offline", recs: {} }, m = await get("meta");
      out.meta = { salt: b64(m.salt), iter: m.iter, ver: { iv: b64(m.ver.iv), ct: b64(m.ver.ct) } };
      var ks = (await keys()).filter(function (k) { return k !== "meta"; });
      for (var i = 0; i < ks.length; i++) { var r = await get(ks[i]); out.recs[ks[i]] = { iv: b64(r.iv), ct: b64(r.ct) }; }
      return new Blob([JSON.stringify(out)], { type: "application/octet-stream" });
    },
    // отдельный зашифрованный файл (выгрузка пациентов): свой пароль, не пароль хранилища
    seal: async function (pw, obj) {
      var salt = crypto.getRandomValues(new Uint8Array(16)), k = await derive(pw, salt, ITER), r = await enc(k, obj);
      return new Blob([JSON.stringify({ v: 1, app: "ovabmk-cases", iter: ITER, salt: b64(salt), iv: b64(r.iv), ct: b64(r.ct) })], { type: "application/octet-stream" });
    },
    unseal: async function (text, pw) {
      var b; try { b = JSON.parse(text); } catch (e) { throw new Error("файл не является выгрузкой"); }
      if (!b || b.app !== "ovabmk-cases" || !b.ct) throw new Error("файл не является выгрузкой");
      var k = await derive(pw, unb64(b.salt), b.iter);
      try { return await dec(k, { iv: unb64(b.iv), ct: unb64(b.ct) }); } catch (e) { return null; }
    },
    // файлы для координатора: шифруются его открытым ключом (ECDH P-256 + AES-GCM). Открыть может только программа координатора — пароли не нужны
    newKeyPair: async function () {
      var kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
      var pub = await crypto.subtle.exportKey("jwk", kp.publicKey), priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
      return { pub: { x: pub.x, y: pub.y }, priv: priv };
    },
    sealPub: async function (pub, obj) {
      var cp = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
      var eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
      var k = await crypto.subtle.deriveKey({ name: "ECDH", public: cp }, eph.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      var r = await enc(k, obj), ej = await crypto.subtle.exportKey("jwk", eph.publicKey);
      return new Blob([JSON.stringify({ v: 3, app: "ovabmk-cases", kid: pub.kid || "", epk: { x: ej.x, y: ej.y }, iv: b64(r.iv), ct: b64(r.ct) })], { type: "application/octet-stream" });
    },
    openPriv: async function (b, priv) {
      try {
        var pk = await crypto.subtle.importKey("jwk", priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
        var ep = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b.epk.x, y: b.epk.y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, []);
        var k = await crypto.subtle.deriveKey({ name: "ECDH", public: ep }, pk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        return await dec(k, { iv: unb64(b.iv), ct: unb64(b.ct) });
      } catch (e) { return null; }
    },
    // восстановление: проверяем пароль копии, затем заменяем всё
    importBackup: async function (text, pw) {
      var b; try { b = JSON.parse(text); } catch (e) { throw new Error("файл не является копией"); }
      if (!b || b.app !== "ovabmk-offline" || !b.meta) throw new Error("файл не является копией");
      var salt = unb64(b.meta.salt), k = await derive(pw, salt, b.meta.iter);
      try { if ((await dec(k, { iv: unb64(b.meta.ver.iv), ct: unb64(b.meta.ver.ct) })) !== "ovabmk-ok") throw 0; } catch (e) { return false; }
      await clearAll();
      for (var n in b.recs) await put(n, { iv: unb64(b.recs[n].iv), ct: unb64(b.recs[n].ct) });
      await put("meta", { salt: salt, iter: b.meta.iter, ver: { iv: unb64(b.meta.ver.iv), ct: unb64(b.meta.ver.ct) } });
      key = k; return true;
    }
  };
})();

/* ===== Сроки сдачи ===== */
function deadlinesBetween(rule, from, to) { // даты 'YYYY-MM-DD' включительно
  var out = [];
  if (!rule || rule.t === "c") return out;
  for (var d = from; d <= to; d = addDays(d, 1)) {
    var day = +d.slice(8, 10), mo = +d.slice(5, 7);
    if (rule.t === "w" && dow(d) === rule.d) out.push(d);
    else if (rule.t === "m" && day === rule.d) out.push(d);
    else if (rule.t === "q" && day === rule.d && (mo - 1) % 3 === 0) out.push(d);
  }
  return out;
}
function tolDays(rule) { return rule.t === "w" ? 3 : 0; }
function assignDeadline(rule, pEnd) {
  if (!rule || rule.t === "c" || !pEnd) return "";
  var from = addDays(pEnd, -tolDays(rule)), list = deadlinesBetween(rule, from, addDays(from, 120));
  return list[0] || "";
}
function ruleText(rule) {
  if (!rule) return "";
  var t = " до " + rule.h + ":00";
  if (rule.t === "w") return "каждую неделю, " + ["", "пн", "вт", "ср", "чт", "пт"][rule.d] + t;
  if (rule.t === "m") return "ежемесячно, до " + rule.d + "-го числа" + t.replace(" до", ",");
  if (rule.t === "q") return "ежеквартально (янв, апр, июл, окт), до " + rule.d + "-го" + t.replace(" до", ",");
  return "по каждому случаю";
}
function isPast(dateStr, hour) {
  var n = nowD(), t = todayStr();
  if (dateStr < t) return true;
  if (dateStr > t) return false;
  return n.getHours() >= hour;
}

/* ===== Состояние ===== */
var S = { senders: {}, subs: {}, cache: {}, cases: {}, prof: {}, tab: "home", warn: [] };

function senderSubs(sid) {
  return Object.keys(S.subs).map(function (k) { return S.subs[k]; }).filter(function (m) { return m.sender === sid; })
    .sort(function (a, b) { return (b.pEnd || "").localeCompare(a.pEnd || "") || b.imported - a.imported; });
}
function latestSub(sid) { return senderSubs(sid)[0] || null; }

function senderStatus(s) {
  var rule = (ROLE[s.role] || {}).rule, t = todayStr(), res = { st: "wait", text: "", last: null, next: null, late: 0, missed: 0, rule: rule };
  var subs = senderSubs(s.id);
  res.lastSub = subs[0] || null;
  if (!rule || rule.t === "c") { res.st = subs.length ? "ok" : "case"; res.text = subs.length ? "получено файлов: " + subs.length : "по случаю"; return res; }
  var all = deadlinesBetween(rule, addDays(t, -400), addDays(t, 120));
  var got = {}; subs.forEach(function (m) { if (m.ddl) got[m.ddl] = m; });
  var past = all.filter(function (d) { return isPast(d, rule.h); });
  var fut = all.filter(function (d) { return !isPast(d, rule.h); });
  res.last = past[past.length - 1] || null; res.next = fut[0] || null;
  var since = s.since || "0000-00-00";
  var counted = past.filter(function (d) { return d >= since; }).slice(-6);
  var miss = counted.filter(function (d) { return !got[d]; });
  if (res.last && res.last >= since) {
    if (got[res.last]) { res.st = "ok"; res.text = "сдано за срок " + fmtD(res.last); res.missed = miss.length; }
    else { res.st = "late"; res.late = diffDays(t, res.last); res.text = "не сдано за " + fmtD(res.last) + (res.late > 0 ? " (" + res.late + " дн.)" : " (сегодня)"); res.missed = miss.length; }
  } else { res.text = "ждём первый срок"; }
  if (res.st !== "late" && res.next && diffDays(res.next, t) <= 3 && !got[res.next]) { res.st = "soon"; res.text = "срок " + fmtD(res.next) + " (" + DOW_RU[dow(res.next)] + ") через " + diffDays(res.next, t) + " дн."; }
  if (res.st === "wait" && res.next) res.text = "ближайший срок " + fmtD(res.next);
  return res;
}

async function persistSender(s) { await Vault.save("s:" + s.id, s); S.senders[s.id] = s; }
async function loadAll() {
  S.senders = {}; S.subs = {}; S.cache = {}; S.cases = {}; S.prof = {};
  var ks = await Vault.keys();
  for (var i = 0; i < ks.length; i++) {
    var k = ks[i];
    if (k.indexOf("s:") === 0) S.senders[k.slice(2)] = await Vault.load(k);
    else if (k.indexOf("m:") === 0) S.subs[k.slice(2)] = await Vault.load(k);
    else if (k.indexOf("c:") === 0) S.cases[k.slice(2)] = await Vault.load(k);
    else if (k === "x:prof") S.prof = await Vault.load(k);
  }
}
async function removeSub(id) { await Vault.remove("m:" + id); await Vault.remove("d:" + id); delete S.subs[id]; delete S.cache[id]; }
async function subData(id) {
  if (!S.cache[id]) {
    var d = await Vault.load("d:" + id) || { sheets: {} };
    Object.keys(d.sheets).forEach(function (sn) { d.sheets[sn].forEach(function (r) { r.q = r.c.join(" ").toLowerCase(); }); });
    S.cache[id] = d;
  }
  return S.cache[id];
}

/* ===== Импорт Excel ===== */
var HEAD_DOC_OK = /^(bor|да|yes|ha|есть|\+|✔|✓|1)/i;
function detectRole(a1, fileName) {
  var key = String(a1 || "").replace(/\s+/g, " ").trim();
  for (var i = 0; i < ROLES.length; i++) if (ROLES[i].a1.replace(/\s+/g, " ").trim() === key) return ROLES[i];
  var m = /Baza_(\d\d)_/i.exec(fileName);
  if (m && ROLE[+m[1]]) return ROLE[+m[1]];
  return null;
}
async function importFile(file) {
  var res = { name: file.name, ok: false, msg: "", warn: [] };
  if (!/\.xlsx$/i.test(file.name)) { res.msg = "это не файл .xlsx"; return res; }
  var wb;
  try { wb = await XL.read(await file.arrayBuffer()); } catch (e) { res.msg = "не удалось прочитать файл (" + e.message + ")"; return res; }
  if (!wb.has("Boshqaruv")) { res.msg = "это не файл «Baza» (нет листа Boshqaruv)"; return res; }
  var yor = wb.has("Yoriqnoma") ? await wb.sheet("Yoriqnoma") : [];
  var role = detectRole((yor[0] || [])[0], file.name);
  if (!role) { res.msg = "не удалось определить должность по файлу"; return res; }
  var bq = await wb.sheet("Boshqaruv");
  function bc(r) { return ((bq[r - 1] || [])[2]); }
  var inst = String(bc(5) || "").trim(), filler = String(bc(6) || "").trim(), phone = String(bc(8) || "").trim();
  var pStart = parseDate(bc(9)), pEnd = parseDate(bc(10));
  var readyTxt = String(bc(13) || ""), ready = readyTxt.charAt(0) === "✔";
  var fileMod = file.lastModified || Date.now();
  if (!pEnd) { pEnd = ymdOf(new Date(fileMod)); res.warn.push("не заполнен период — взята дата файла " + fmtD(pEnd)); }
  var vals = [];
  role.ind.forEach(function (ind) { var v = (bq[ind.row - 1] || [])[5]; vals.push({ n: ind.n, v: v == null ? "" : v }); });
  var sheets = {}, counts = {}, rowsTotal = 0;
  for (var sn in role.sheets) {
    if (!wb.has(sn)) continue;
    var meta = role.sheets[sn], rows = await wb.sheet(sn), out = [];
    for (var ri = 4; ri < rows.length; ri++) {
      var r = rows[ri]; if (!r) continue;
      var filled = meta.inp.some(function (ci) { var v = r[ci]; return v !== undefined && v !== "" && v != null; });
      if (!filled) continue;
      var cells = []; for (var c = 1; c < meta.hdr.length; c++) { var v2 = r[c]; cells.push(v2 == null ? "" : v2); }
      out.push({ r: ri + 1, c: cells });
    }
    if (out.length) { sheets[sn] = out; counts[sn] = out.length; rowsTotal += out.length; }
  }
  var docsTotal = 0, docsHave = 0, docsMiss = [];
  if (wb.has("Hujjatlar")) {
    var hr = await wb.sheet("Hujjatlar");
    for (var i = 4; i < hr.length; i++) {
      var q = hr[i]; if (!q || !q[2]) continue;
      docsTotal++;
      if (HEAD_DOC_OK.test(String(q[4] || ""))) docsHave++; else docsMiss.push({ folder: q[1] || "", uz: q[2], ru: q[3] || "" });
    }
  }
  // отправитель
  var sKey = norm(inst) || norm(filler) || norm(file.name), sender = null;
  Object.keys(S.senders).forEach(function (id) { var s = S.senders[id]; if (s.role === role.no && s.key === sKey) sender = s; });
  var ddl = assignDeadline(role.rule, pEnd);
  if (!sender) {
    sender = { id: uid(), role: role.no, key: sKey, inst: inst || "(без названия)", filler: filler, phone: phone, created: Date.now(), since: ddl || "" };
  } else {
    if (filler) sender.filler = filler; if (phone) sender.phone = phone; if (inst) sender.inst = inst;
    if (ddl && (!sender.since || ddl < sender.since)) sender.since = ddl;
  }
  // дубликаты
  var dupe = false, replace = [];
  senderSubs(sender.id).forEach(function (m) {
    if (m.fileName === file.name && m.fileSize === file.size && m.fileMod === fileMod) dupe = true;
    else if (m.pEnd === pEnd) replace.push(m.id);
  });
  if (dupe) { res.msg = "уже загружен ранее"; res.skipped = true; return res; }
  var newer = replace.filter(function (id) { return S.subs[id].fileMod > fileMod; });
  if (newer.length) { res.msg = "в программе уже есть более новая версия за этот период"; res.skipped = true; return res; }
  var sub = { id: uid(), sender: sender.id, role: role.no, fileName: file.name, fileSize: file.size, fileMod: fileMod, imported: Date.now(), pStart: pStart, pEnd: pEnd, inst: inst, filler: filler, phone: phone, ready: ready, readyTxt: readyTxt, ddl: ddl, ind: vals, counts: counts, rows: rowsTotal, docsTotal: docsTotal, docsHave: docsHave, docsMiss: docsMiss };
  await persistSender(sender);
  await Vault.save("d:" + sub.id, { sheets: sheets });
  await Vault.save("m:" + sub.id, sub); S.subs[sub.id] = sub;
  for (var k = 0; k < replace.length; k++) await removeSub(replace[k]);
  res.ok = true; res.sub = sub; res.sender = sender; res.replaced = replace.length;
  res.msg = roleName(role.no) + " · " + (inst || "без названия") + " · " + fmtD(pStart) + "–" + fmtD(pEnd) + " · строк данных: " + rowsTotal + (ready ? "" : " · файл помечен «не полон»");
  if (!ddl && role.rule.t !== "c") res.warn.push("не удалось привязать к сроку");
  return res;
}

/* ===== Пациенты и визиты (только на этом устройстве) ===== */
function activeCases() { return Object.keys(S.cases).map(function (k) { return S.cases[k]; }).filter(function (c) { return !c.deleted; }); }
async function persistCase(c) { c.updated = Date.now(); await Vault.save("c:" + c.id, c); S.cases[c.id] = c; }
var CAT_PREG = "Беременная", CAT_PP = "Родильница", CAT_NB = "Новорождённый", CAT_WOMAN = "Женщина (скрининг)";
// что уже сделано по плану: ключи вида anc:2, pat:p12, pat:pp1 (из отметок и из записанных визитов)
function doneMap(c) {
  var done = {};
  Object.keys(c.stdDone || {}).forEach(function (k) { if (c.stdDone[k]) done["anc:" + k] = 1; });
  Object.keys(c.done || {}).forEach(function (k) { if (c.done[k]) done[k] = 1; });
  (c.visits || []).forEach(function (v) { if (v.std) done["anc:" + v.std] = 1; (v.items || []).forEach(function (k) { done[k] = 1; }); });
  return done;
}
// ----- беременная по стандарту (приказ №180): срок и визиты считаются на устройстве по дате последней менструации (ДПМ) -----
function ancWeeks(lmp) { if (!lmp) return null; var d = diffDays(todayStr(), lmp); return d < 0 ? null : { w: Math.floor(d / 7), d: d % 7, days: d }; }
function ancLabel(r) { return Ld(r.label, r.label_uz); }
function ancTests(r) { return r.tests.map(function (x, i) { return Ld(x, (r.tests_uz || [])[i]); }); }
function ancNotes(r) { return Ld(r.notes || "", r.notes_uz); }
// состояние ведения: missed — пропущенные окна, cur — окно идёт сейчас, nxt — следующее; date — ближайшая дата, к которой нужно действовать
function ancState(c) {
  if (!c || c.cat !== CAT_PREG || !c.lmp) return null;
  var wk = ancWeeks(c.lmp); if (!wk || wk.days > 315) return null;
  var dm = doneMap(c), done = {}; ANC.forEach(function (r) { if (dm["anc:" + r.visit_no]) done[r.visit_no] = 1; });
  var rest = ANC.filter(function (r) { return !done[r.visit_no]; });
  var missed = rest.filter(function (r) { return r.until_week < wk.w; });
  var cur = rest.filter(function (r) { return r.from_week <= wk.w && wk.w <= r.until_week; })[0] || null;
  var nxt = rest.filter(function (r) { return r.from_week > wk.w; })[0] || null;
  var s = { wk: wk, missed: missed, cur: cur, nxt: nxt, done: done, edd: addDays(c.lmp, 280), date: "", kind: "" };
  if (missed.length) { s.date = addDays(c.lmp, (missed[0].until_week + 1) * 7 - 1); s.kind = "missed"; }
  else if (cur) { s.date = todayStr(); s.kind = "cur"; }
  else if (nxt) { s.date = addDays(c.lmp, nxt.from_week * 7); s.kind = "next"; }
  return s;
}
function ancWinDates(c, r) { return fmtD(addDays(c.lmp, r.from_week * 7)) + "–" + fmtD(addDays(c.lmp, (r.until_week + 1) * 7 - 1)); }
// ----- патронаж (приказ №210, приложение 2): беременная 12 и 32 нед.; родильница и новорождённый — 3 раза -----
function patItems(c) {
  if (!c) return [];
  if (c.cat === CAT_PREG && c.lmp) return [{ k: "pat:p12", t: "pat_p12", from: addDays(c.lmp, 84), to: addDays(c.lmp, 97) }, { k: "pat:p32", t: "pat_p32", from: addDays(c.lmp, 224), to: addDays(c.lmp, 237) }];
  var b = c.birth || c.disch, d = c.disch || c.birth;
  if ((c.cat === CAT_PP || c.cat === CAT_NB) && b) {
    var pre = c.cat === CAT_PP ? "pp" : "nb";
    return [{ k: "pat:" + pre + "1", t: "pat_" + pre + "1", from: d, to: addDays(d, 3) }, { k: "pat:" + pre + "2", t: "pat_" + pre + "2", from: addDays(b, 13), to: addDays(b, 17) },
      { k: "pat:" + pre + "3", t: "pat_" + pre + "3", from: addDays(b, 28), to: addDays(b, 32) }];
  }
  return [];
}
function patState(c) {
  var items = patItems(c); if (!items.length) return null;
  var dm = doneMap(c), t = todayStr();
  var rest = items.filter(function (x) { return !dm[x.k]; });
  var s = { items: items, done: dm, missed: rest.filter(function (x) { return x.to < t; }), cur: rest.filter(function (x) { return x.from <= t && t <= x.to; })[0] || null,
    nxt: rest.filter(function (x) { return x.from > t; })[0] || null, date: "", kind: "" };
  if (s.missed.length) { s.date = s.missed[0].to; s.kind = "missed"; }
  else if (s.cur) { s.date = t; s.kind = "cur"; }
  else if (s.nxt) { s.date = s.nxt.from; s.kind = "next"; }
  return s;
}
// какие планы ведёт эта должность: доя кабинета — визиты по №180, патронажная доя — патронаж по №210, координатор — оба
function planStates(c) {
  if (!c || c.closed) return [];
  var out = [];
  if (doesAnc()) { var a = ancState(c); if (a && a.date) out.push({ src: "anc", s: a }); }
  if (doesPat()) { var p = patState(c); if (p && p.date) out.push({ src: "pat", s: p }); }
  return out;
}
// ближайшая дата визита: самая ранняя из назначенной вручную и вычисленной по плану
function caseNext(c) {
  if (c.closed) return "";
  var best = c.next || "";
  planStates(c).forEach(function (x) { if (!best || x.s.date < best) best = x.s.date; });
  return best;
}
// статус визита: late / today / tomorrow / week / later / none / closed
function caseDue(c) {
  if (c.closed) return { k: "closed", n: 0 };
  var nx = caseNext(c);
  if (!nx) return { k: "none", n: 0 };
  var n = diffDays(nx, todayStr()), pl = planStates(c).filter(function (x) { return x.s.date === nx; })[0], std = !!(pl && (!c.next || pl.s.date <= c.next));
  return { k: n < 0 ? "late" : n === 0 ? "today" : n === 1 ? "tomorrow" : n <= 7 ? "week" : "later", n: n, std: std, kind: std ? pl.s.kind : "", src: std ? pl.src : "" };
}
// для отчётных чисел: сколько беременных пропустили визит по стандарту / у скольких окно идёт сейчас
function ancCounts() {
  var r = { missed: 0, cur: 0, total: 0 };
  activeCases().forEach(function (c) { if (c.closed) return; var s = ancState(c); if (!s) return; r.total++; if (s.kind === "missed") r.missed++; else if (s.kind === "cur") r.cur++; });
  return r;
}
function dueCounts() {
  var r = { late: 0, today: 0, tomorrow: 0, week: 0, later: 0, none: 0, closed: 0 };
  activeCases().forEach(function (c) { r[caseDue(c).k]++; });
  return r;
}
// ----- скрининг (приказы №210 и 47-Т): шейка матки 35–55 лет — раз в 3 года, молочная железа 45–65 — раз в 2 года, осмотр 15–49 — раз в год -----
var SCR = [{ k: "annual", from: 15, to: 49, years: 1 }, { k: "cerv", from: 35, to: 55, years: 3 }, { k: "breast", from: 45, to: 65, years: 2 }];
function caseAge(c) { return c && c.byear ? +todayStr().slice(0, 4) - c.byear : null; }
function scrState(c) {
  if (!c || c.closed || c.deleted || c.cat !== CAT_WOMAN) return [];
  var age = caseAge(c); if (age == null) return [];
  var t = todayStr(), last = c.scr || {};
  return SCR.filter(function (x) { return age >= x.from && age <= x.to; }).map(function (x) {
    var due = last[x.k] ? addDays(last[x.k], Math.round(365.25 * x.years)) : "";
    return { k: x.k, last: last[x.k] || "", due: due, need: !due || due <= t, never: !last[x.k] };
  });
}
async function deleteCase(c) {
  for (var i = 0; i < c.visits.length; i++) for (var j = 0; j < (c.visits[i].ph || []).length; j++) await Vault.remove("f:" + c.visits[i].ph[j]);
  // надгробие без личных данных: чтобы удаление дошло до других устройств при слиянии
  var t = { id: c.id, created: c.created, deleted: true, visits: [] };
  await persistCase(t);
}
// личные поля: в выгрузку «только изменения» попадают, только если поменялись с прошлой отправки
var PERSONAL = ["name", "phone", "street", "byear"];
// слияние записи пациента с входящей (с другого устройства): побеждает более новая, визиты объединяются по id
function mergeCase(local, inc) {
  if (inc && inc.partial) {
    inc = JSON.parse(JSON.stringify(inc)); delete inc.partial;
    PERSONAL.forEach(function (f) { if (!(f in inc) && local && f in local) inc[f] = local[f]; });
  }
  if (!local) return inc;
  var newer = (inc.updated || 0) > (local.updated || 0) ? inc : local, older = newer === inc ? local : inc;
  var m = JSON.parse(JSON.stringify(newer));
  if (m.deleted) { m.visits = []; return m; }
  if (!m.src && older.src) m.src = older.src;
  var byId = {};
  (older.deleted ? [] : older.visits || []).concat(newer.visits || []).forEach(function (v) { byId[v.id] = v; });
  m.visits = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || "") || (b.t || 0) - (a.t || 0); });
  return m;
}
function personalHash(c) { return PERSONAL.map(function (f) { return c[f] == null ? "" : String(c[f]); }).join("\u0001"); }
// ----- ключ активации: подписан сервером сайта (ECDSA P-256). Программа проверяет подпись и по ключу узнаёт должность — сменить её здесь нельзя -----
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return unb64(s); }
async function verifyToken(tok) {
  var m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(tok || "").trim()); if (!m) return null;
  var keys = [SIGN_PUB].concat(window.__TEST_SIGN_PUB ? [window.__TEST_SIGN_PUB] : []);
  for (var i = 0; i < keys.length; i++) {
    try {
      var k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: keys[i].x, y: keys[i].y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      if (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, unb64url(m[2]), new TextEncoder().encode(m[1]))) {
        var p = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
        if (p && p.v === 1 && TABS_ROLES.indexOf(p.role) >= 0) return p;
      }
    } catch (e) { }
  }
  return null;
}
var TABS_ROLES = ["cab", "pat", "coord"];
// применить ключ: при активации проверяется и срок; при каждом запуске — только подпись (чтобы программа не перестала работать через месяц)
async function applyToken(tok, fresh) {
  var p = await verifyToken(tok); if (!p) return { err: "bad" };
  if (fresh && p.exp && p.exp * 1000 < nowD().getTime()) return { err: "expired" };
  PROF.role = p.role; PROF.act = p; PROF.tok = String(tok).trim();
  if (fresh) try { localStorage.setItem("ovabmk_tok", PROF.tok); } catch (e) { }
  return { ok: p };
}
// должности: основная + временные (замещение отсутствующего — только в даты его отпуска)
function extraRoles() { var t = todayStr(); return ((PROF.act && PROF.act.extra) || []).filter(function (x) { return x && x.role && x.from <= t && t <= x.until; }); }
function activeRoles() { var r = PROF.role ? [PROF.role] : []; extraRoles().forEach(function (x) { if (r.indexOf(x.role) < 0) r.push(x.role); }); return r; }
function hasRole(x) { return activeRoles().indexOf(x) >= 0; }
function doesAnc() { return hasRole("cab") || hasRole("coord"); }   // визиты беременных по №180
function doesPat() { return hasRole("pat") || hasRole("coord"); }   // патронаж по №210
// код ключа: короткий отпечаток открытого ключа координатора (виден в настройках у координатора и у доя — можно сверить)
async function keyId(pub) { var hsh = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pub.x + "." + pub.y))); return b64(hsh).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase(); }
// чей ключ использовать: доя — ключ координатора (из ссылки-приглашения), координатор — свой
function sendKey() { var p = S.prof || {}; if (PROF.role === "coord") return p.ckp && p.ckp.pub; var k = PROF.act && PROF.act.k; return k && k.x ? { x: k.x, y: k.y, kid: PROF.act.kid || "" } : null; }
// пара ключей устройства: у администратора — для файлов доя (ckp), у доя — для передачи пациенток при замещении (dkp)
async function ensureCoordKey() {
  var fld = PROF.role === "coord" ? "ckp" : "dkp";
  if (!PROF.role || (S.prof && S.prof[fld])) return;
  var kp = await Vault.newKeyPair(); kp.pub.kid = await keyId(kp.pub);
  var np = JSON.parse(JSON.stringify(S.prof || {})); np[fld] = kp; await saveProf(np);
}
function myKeys() { var p = S.prof || {}; return [p.ckp, p.dkp].filter(Boolean); }
// передача пациенток при замещении: файл шифруется ключом устройства получателя (из ключа активации), открыть может только он
async function exportTo(target, cases, kind) {
  var key = { x: target.k.x, y: target.k.y }; key.kid = await keyId(key);
  var prof = S.prof || {}, me = (PROF.act && PROF.act.uid) || "", photos = {};
  var list = cases.map(function (c) { var x = JSON.parse(JSON.stringify(c)); if (!x.owner && me) x.owner = me; return x; });
  for (var i = 0; i < list.length; i++) for (var a = 0; a < (list[i].visits || []).length; a++) for (var b = 0; b < (list[i].visits[a].ph || []).length; b++) {
    var id = list[i].visits[a].ph[b], f = await Vault.load("f:" + id); if (f) photos[id] = f.data;
  }
  var blob = await Vault.sealPub(key, { fmt: "ovabmk-cases", v: 3, kind: kind, exported: Date.now(), from: { inst: prof.inst || "", unit: prof.unit || "", who: prof.who || "", role: PROF.role, uid: me }, cases: list, photos: photos });
  return { blob: blob, n: list.length };
}
async function exportCases(withPhotos, delta) {
  var key = sendKey(); if (!key) throw new Error("NO_KEY");
  var all = Object.keys(S.cases).map(function (k) { return S.cases[k]; }), photos = {}, prof = S.prof || {}, sent = prof.sent || {}, cases = all;
  if (delta) {
    var since = prof.lastExport || 0;
    cases = all.filter(function (c) { return !prof.lastExport || (c.updated || 0) > since || !(c.id in sent); }).map(function (c) {
      var x = JSON.parse(JSON.stringify(c)), hsh = personalHash(c);
      if (!c.deleted && sent[c.id] === hsh) { PERSONAL.forEach(function (f) { delete x[f]; }); x.partial = true; }
      return x;
    });
  }
  if (withPhotos) for (var i = 0; i < cases.length; i++) for (var a = 0; a < (cases[i].visits || []).length; a++) for (var b = 0; b < (cases[i].visits[a].ph || []).length; b++) {
    var id = cases[i].visits[a].ph[b], f = await Vault.load("f:" + id); if (f) photos[id] = f.data;
  }
  var blob = await Vault.sealPub(key, { fmt: "ovabmk-cases", v: 3, exported: Date.now(), delta: !!delta, from: { inst: prof.inst || "", unit: prof.unit || "", who: prof.who || "", role: PROF.role }, cases: cases, photos: photos });
  if (delta) {
    var ns = {}; all.forEach(function (c) { ns[c.id] = personalHash(c); });
    var np = JSON.parse(JSON.stringify(S.prof || {})); np.sent = ns; np.lastExport = Date.now(); await saveProf(np);
  }
  return { blob: blob, n: cases.length };
}
// приём файла: новые файлы открываются ключом координатора без вопросов; старые (с паролем) — по паролю
async function openCasesFile(text, pw) {
  var b; try { b = JSON.parse(text); } catch (e) { throw new Error(L("err_not_export")); }
  if (!b || b.app !== "ovabmk-cases" || !b.ct) throw new Error(L("err_not_export"));
  if (b.v === 3) {
    var my = myKeys().filter(function (k) { return !b.kid || !k.pub.kid || k.pub.kid === b.kid; })[0];
    if (!my) throw new Error(L("e_other_key"));
    var d = await Vault.openPriv(b, my.priv); if (!d) throw new Error(L("e_other_key"));
    return d;
  }
  if (pw == null) return { needPw: true };
  return await Vault.unseal(text, pw);
}
async function importCases(text, pw) {
  var data = await openCasesFile(text, pw); if (!data || data.needPw) return data;
  if (data.fmt !== "ovabmk-cases" || !Array.isArray(data.cases)) throw new Error(L("err_not_export"));
  var res = { added: 0, updated: 0, same: 0, photos: 0, from: data.from || null };
  var srcName = data.from ? [data.from.inst, data.from.unit, data.from.who].filter(Boolean).join(" · ") : "";
  for (var i = 0; i < data.cases.length; i++) {
    var inc = data.cases[i]; if (!inc || !inc.id) continue;
    var loc = S.cases[inc.id];
    if (srcName && !inc.src) { inc = JSON.parse(JSON.stringify(inc)); inc.src = srcName; }
    var merged = mergeCase(loc, inc);
    if (!loc) res.added++; else if (JSON.stringify(merged) === JSON.stringify(mergeCase(loc, loc))) { res.same++; continue; } else res.updated++;
    await Vault.save("c:" + merged.id, merged); S.cases[merged.id] = merged;
    for (var a = 0; a < merged.visits.length; a++) for (var b = 0; b < (merged.visits[a].ph || []).length; b++) {
      var pid = merged.visits[a].ph[b];
      if (data.photos && data.photos[pid] && !(await Vault.load("f:" + pid))) { await Vault.save("f:" + pid, { id: pid, data: data.photos[pid] }); res.photos++; }
    }
  }
  return res;
}
// профиль устройства (учреждение, бригада, кто заполняет) и учёт отправленного — тоже зашифрован в хранилище
async function saveProf(p) { S.prof = p; await Vault.save("x:prof", p); }
