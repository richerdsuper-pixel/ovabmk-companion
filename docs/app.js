/* OvaBMҚ Companion — клиент. Все права проверяет база (RLS); интерфейс только показывает то, что разрешено. */
(function () {
  "use strict";
  var CFG = window.OVABMK_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  var ROLES = ["admin", "deputy", "chief_physician", "staff"];
  var MAX_FILE = 20 * 1024 * 1024;
  var TYPES = ["application/pdf", "image/jpeg", "image/png", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

  // ------------------------------------------------------------------ state
  var S = {
    lang: store("ovabmk-lang") || "ru",
    session: null,
    roleState: "idle",        // idle | loading | ok | none | error
    roles: [],
    roleError: "",
    profile: null,
    myFolders: [],
    scopes: { institutions: [], positions: [] },   // области видимости заведующего (учреждения / специальности)
    institutions: null,                            // справочник учреждений (null — ещё не загружен)
    mahallas: [], mlinks: [], brigades: [],        // махалли, их связь с учреждениями и состав бригад
    loginBusy: false,
    loginError: "",
    invite: readInvite(),
    req: "",                  // заявка без приглашения: "" | none | pending | rejected
    tgUser: null              // подписанные данные Telegram для повторной отправки заявки (действуют 1 час)
  };

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function readInvite() {
    var m = /[?&]invite=([0-9a-fA-F]{24})\b/.exec(location.search);
    if (m) {
      try { sessionStorage.setItem("ovabmk-invite", m[1].toLowerCase()); } catch (e) {}
      history.replaceState(null, "", location.pathname + location.hash);   // код не остаётся в адресной строке
      return m[1].toLowerCase();
    }
    try { return sessionStorage.getItem("ovabmk-invite") || ""; } catch (e) { return ""; }
  }
  function clearInvite() { S.invite = ""; try { sessionStorage.removeItem("ovabmk-invite"); } catch (e) {} }

  // ------------------------------------------------------------------ helpers
  function t(k, vars) {
    var s = (window.I18N[S.lang] && window.I18N[S.lang][k]) || window.I18N.ru[k] || k;
    if (vars) Object.keys(vars).forEach(function (n) { s = s.split("{" + n + "}").join(String(vars[n])); });
    return s;
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function mount(node) { var a = document.getElementById("app"); a.textContent = ""; a.appendChild(node); }
  function toast(m) {
    var el = document.getElementById("toast"); el.textContent = m; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("on"); }, 3200);
  }
  function fmtDate(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString(S.lang === "uz" ? "uz-Cyrl" : "ru-RU"); }
  function fmtDT(s) { var d = new Date(s); return isNaN(d) ? "" : d.toLocaleString(S.lang === "uz" ? "uz-Cyrl" : "ru-RU", { dateStyle: "short", timeStyle: "short" }); }
  function fmtSize(n) { if (!n && n !== 0) return ""; return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " КБ" : (n / 1024 / 1024).toFixed(1) + " МБ"; }
  function errMsg(e) { return (e && (e.message || e.error_description || e.error)) || String(e); }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.from(b, function (v) { return v.toString(16).padStart(2, "0"); }).join("");
    return x.slice(0, 8) + "-" + x.slice(8, 12) + "-" + x.slice(12, 16) + "-" + x.slice(16, 20) + "-" + x.slice(20);
  }
  function safeName(name) {
    var tr = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"j",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"x",ц:"ts",ч:"ch",ш:"sh",щ:"sh",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",ў:"o",қ:"q",ғ:"g",ҳ:"h" };
    var s = String(name || "file").toLowerCase().replace(/[а-яёўқғҳ]/g, function (c) { return tr[c] || ""; });
    s = s.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+/, "");
    return (s || "file").slice(-120);
  }
  function isAdmin() { return S.roles.indexOf("admin") >= 0; }
  function isManager() { return S.roles.some(function (r) { return r !== "staff"; }); }
  function isHead() { return S.scopes.institutions.length + S.scopes.positions.length > 0; }
  function canSummary() { return isManager() || isHead(); }
  async function loadInstitutions(force) {
    if (S.institutions && !force) return S.institutions;
    var r = await sb.from("institutions").select("id, name, kind").order("name");
    S.institutions = r.error ? [] : (r.data || []);
    return S.institutions;
  }
  async function loadMahallas() {
    var rs = await Promise.all([sb.from("mahallas").select("id, name").order("name"), sb.from("mahalla_links").select("mahalla_id, institution_id"),
      sb.from("brigade_posts").select("id, mahalla_id, kind, rate, user_id")]);
    S.mahallas = rs[0].error ? [] : (rs[0].data || []);
    S.mlinks = rs[1].error ? [] : (rs[1].data || []);
    S.brigades = rs[2].error ? [] : (rs[2].data || []);
  }
  function mahName(id) { var m = S.mahallas.filter(function (x) { return x.id === id; })[0]; return m ? m.name : ""; }
  function mahInsts(id) { return S.mlinks.filter(function (l) { return l.mahalla_id === id; }).map(function (l) { return l.institution_id; }); }
  // норма бригады: врач 1.0 + патронаж 1.0 + доя 0.5 (кабинет или патронаж)
  var NORM = { doctor: 1, patronage: 1, doya: 0.5 };
  function brigadeSum(mid) {
    var o = { doctor: 0, patronage: 0, doya: 0 };
    S.brigades.forEach(function (b) {
      if (b.mahalla_id !== mid) return;
      var k = b.kind === "doctor" ? "doctor" : b.kind === "patronage" ? "patronage" : "doya";
      o[k] += Number(b.rate);
    });
    return o;
  }
  function brigadeGaps(mid) {
    var sm = brigadeSum(mid), gaps = [];
    ["doctor", "patronage", "doya"].forEach(function (k) {
      if (sm[k] + 1e-9 < NORM[k]) gaps.push(t("br_gap_" + k, { have: String(Math.round(sm[k] * 100) / 100), need: String(NORM[k]) }));
    });
    return gaps;
  }
  function instName(id) {
    var x = (S.institutions || []).filter(function (i) { return i.id === id; })[0];
    return x ? x.name : "";
  }
  function instOptions(sel, emptyText) {
    sel.appendChild(h("option", { value: "", text: emptyText }));
    (S.institutions || []).forEach(function (i) { sel.appendChild(h("option", { value: String(i.id), text: i.name })); });
    return sel;
  }
  // попадает ли сотрудник в область видимости: админ/руководитель видят всех
  function inMyScope(prof) {
    if (isManager()) return true;
    var pc = posByText(prof.position);
    return (prof.institution_id != null && S.scopes.institutions.indexOf(prof.institution_id) >= 0) ||
      (!!pc && S.scopes.positions.indexOf(pc.code) >= 0);
  }
  function canOpenFolder(f) {
    if (f.restricted) return false;
    return isManager() || S.myFolders.indexOf(f.id) >= 0;
  }
  function posList() { return window.POSITIONS || []; }
  function posByCode(c) { return posList().filter(function (p) { return p.code === c; })[0] || null; }
  function posByText(txt) {
    var x = String(txt || "").trim().toLowerCase();
    return !x ? null : posList().filter(function (p) { return p.code !== "other" && (p.ru.toLowerCase() === x || p.uz.toLowerCase() === x); })[0] || null;
  }
  function posTitle(p) { return S.lang === "uz" ? p.uz : p.ru; }
  function folderTitle(f) { return S.lang === "uz" ? f.title_uz : f.title_ru; }
  function folderSub(f) { return S.lang === "uz" ? f.title_ru : f.title_uz; }

  // ------------------------------------------------------------------ auth
  window.onTelegramAuth = function (user) { telegramLogin(user); };

  async function telegramLogin(user, request) {
    S.loginBusy = true; S.loginError = ""; render();
    try {
      var payload = { telegram: user, invite: S.invite || "" };
      if (request) payload.request = request;
      var res = await fetch(CFG.supabaseUrl + "/functions/v1/tg-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
        body: JSON.stringify(payload)
      });
      var data = {};
      try { data = await res.json(); } catch (e) {}
      if (res.ok && data.request) {           // нет доступа: заявка (none | pending | rejected)
        if (data.request === "none" || data.request === "rejected") await loadInstitutions();
        S.loginBusy = false; S.tgUser = user; S.req = data.request; render(); return;
      }
      if (!res.ok || !data.token_hash) throw new Error(data.error || "generic");
      var r = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: "email" });
      if (r.error) r = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (r.error) throw new Error("generic");
      clearInvite();
      S.loginBusy = false; S.req = ""; S.tgUser = null;
      onSession(r.data.session);
    } catch (e) {
      S.loginBusy = false;
      var code = errMsg(e);
      S.loginError = window.I18N.ru["err_" + code] ? t("err_" + code) : t("err_generic");
      render();
    }
  }

  async function logout() {
    try { await sb.auth.signOut(); } catch (e) {}
    resetUser(); render();
  }

  function resetUser() {
    S.session = null; S.roles = []; S.roleState = "idle"; S.roleError = ""; S.profile = null; S.myFolders = []; S.scopes = { institutions: [], positions: [] }; S.mahallas = []; S.mlinks = []; S.brigades = [];
  }

  function onSession(session) {
    var prevUid = S.session && S.session.user && S.session.user.id;
    var uid = session && session.user && session.user.id;
    if (!uid) { resetUser(); render(); return; }
    S.session = session;
    if (uid !== prevUid || S.roleState === "idle") loadAccess();
    else render();
  }

  // Роли: различаем «загружается», «нет роли» и «ошибка». Ошибка никогда не даёт прав.
  async function loadAccess() {
    var uid = S.session.user.id;
    S.roleState = "loading"; S.roles = []; S.roleError = ""; render();
    try {
      var r = await sb.from("user_roles").select("role").eq("user_id", uid);
      if (!S.session || S.session.user.id !== uid) return;          // за это время вышли/сменили пользователя
      if (r.error) throw r.error;
      S.roles = (r.data || []).map(function (x) { return x.role; }).filter(function (x) { return ROLES.indexOf(x) >= 0; });
      S.roleState = S.roles.length ? "ok" : "none";
      if (S.roleState === "ok") {
        var p = await sb.from("profiles").select("full_name, position, institution_id").eq("id", uid).maybeSingle();
        S.profile = p.data || null;
        var sc = await sb.from("scopes").select("kind, institution_id, position_code").eq("user_id", uid);
        S.scopes = { institutions: [], positions: [] };
        (sc.data || []).forEach(function (x) {
          if (x.kind === "institution" && x.institution_id != null) S.scopes.institutions.push(x.institution_id);
          else if (x.kind === "position" && x.position_code) S.scopes.positions.push(x.position_code);
        });
        await loadInstitutions();
        await loadMahallas();
        var m = await sb.from("folder_members").select("folder_id").eq("user_id", uid);
        S.myFolders = (m.data || []).map(function (x) { return x.folder_id; });
      }
    } catch (e) {
      S.roles = []; S.roleState = "error"; S.roleError = errMsg(e);
    }
    render();
  }

  // ------------------------------------------------------------------ layout
  function header() {
    var name = (S.profile && S.profile.full_name) || "";
    var roleChip;
    if (S.roleState === "loading") roleChip = h("span", { class: "chip", text: t("roles_loading") });
    else if (S.roleState === "none") roleChip = h("span", { class: "chip warn", text: t("roles_none") });
    else if (S.roleState === "error") roleChip = h("span", { class: "chip bad", text: t("roles_error") });
    else if (S.roleState === "ok") roleChip = S.roles.map(function (r) { return h("span", { class: "chip acc", text: t("role_" + r) }); });
    return h("header", { class: "top" },
      h("div", { class: "brand" },
        h("div", { class: "mark", "aria-hidden": "true", html: null }, svgEmblem()),
        h("div", null, h("h1", { text: "OvaBMҚ Companion" }), h("p", { text: t("subtitle") }))),
      h("div", { class: "who" },
        langSwitch(),
        S.session ? [name ? h("span", { class: "nm", text: name }) : null, roleChip,
          h("button", { class: "btn sm", type: "button", onclick: logout, text: t("logout") })] : null));
  }
  // эмблема «мать и дитя»
  function svgEmblem() {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 32 32");
    [["circle", { cx: 13, cy: 8, r: 4 }], ["path", { d: "M6 28c0-8 2-13 7-13 3 0 5 2 6 4" }],
     ["circle", { cx: 21, cy: 21, r: 3, class: "em-child" }], ["path", { d: "M16 25c2 2 7 2 9-1" }]].forEach(function (x) {
      var e = document.createElementNS(ns, x[0]); Object.keys(x[1]).forEach(function (k) { e.setAttribute(k, x[1][k]); }); s.appendChild(e);
    });
    return s;
  }
  // синяя шапка с орнаментом и волной: заголовок + меню
  function hero(navEl) { return h("div", { class: "hero" }, header(), navEl); }
  function langSwitch() {
    return h("div", { class: "seg", role: "group", "aria-label": t("lang") },
      ["ru", "uz"].map(function (l) {
        return h("button", { type: "button", class: S.lang === l ? "on" : "", "aria-pressed": S.lang === l ? "true" : "false",
          onclick: function () { S.lang = l; store("ovabmk-lang", l); document.documentElement.lang = l === "uz" ? "uz-Cyrl" : "ru"; render(); },
          text: l === "ru" ? "Рус" : "Ўзб" });
      }));
  }
  function nav(cur) {
    var items = [["#/overview", "nav_overview", "overview"], ["#/folders", "nav_folders", "folders"], ["#/indicators", "nav_ind", "ind"]];
    if (canSummary()) items.push(["#/mahallas", "nav_mah", "mahallas"], ["#/indicators/summary", "nav_indsum", "indsum"]);
    if (isAdmin()) items.push(["#/admin/requests", "nav_requests", "requests"], ["#/admin/users", "nav_users", "users"], ["#/admin/institutions", "nav_inst", "institutions"], ["#/admin/invites", "nav_invites", "invites"], ["#/admin/log", "nav_log", "log"]);
    return h("nav", { class: "nav", "aria-label": "Menu" }, items.map(function (i) {
      return h("a", { href: i[0], "aria-current": cur === i[2] ? "page" : null, text: t(i[1]) });
    }));
  }

  // ------------------------------------------------------------------ views
  var renderToken = 0;
  function render() {
    renderToken++;
    var route = (location.hash || "#/overview").slice(1);
    if (!S.session) return mount(h("div", null, hero(null), loginView()));
    if (S.roleState === "loading" || S.roleState === "idle") return mount(h("div", null, hero(null), h("p", { class: "boot", text: t("loading") })));
    if (S.roleState === "error") return mount(h("div", null, hero(null), h("div", { class: "notice bad" }, t("roles_error"),
      h("p", { text: t("roles_error_long") }), h("p", { class: "mono small", text: S.roleError }),
      h("p", null, h("button", { class: "btn", type: "button", onclick: loadAccess, text: t("retry") })))));
    if (S.roleState === "none") return mount(h("div", null, hero(null), h("div", { class: "notice warn" }, t("roles_none"), h("p", { text: t("roles_none_long") }))));

    var m;
    if ((m = /^\/folder\/(\d{1,2})$/.exec(route))) return folderView(+m[1]);
    if (route === "/folders") return foldersView();
    if (route === "/indicators") return indicatorsView();
    if (route === "/indicators/summary") return canSummary() ? indSummaryView() : forbidden("indsum");
    if (route === "/mahallas") return canSummary() ? mahallasView() : forbidden("mahallas");
    if (route === "/admin/institutions") return isAdmin() ? institutionsView() : forbidden("institutions");
    if (route === "/admin/requests") return isAdmin() ? requestsView() : forbidden("requests");
    if (route === "/admin/users") return isAdmin() ? usersView() : forbidden("users");
    if (route === "/admin/invites") return isAdmin() ? invitesView() : forbidden("invites");
    if (route === "/admin/log") return isAdmin() ? logView() : forbidden("log");
    return overviewView();
  }
  function shell(cur, body) { mount(h("div", null, hero(nav(cur)), body)); }
  function forbidden(cur) { shell(cur, h("div", { class: "notice warn", text: t("forbidden") })); }
  function loadingBox() { return h("p", { class: "boot", text: t("loading") }); }
  function failBox(e) { return h("div", { class: "notice bad", text: t("load_failed", { msg: errMsg(e) }) }); }

  function loginView() {
    if (!S.loginBusy && S.tgUser && (S.req === "none" || S.req === "rejected")) return requestForm();
    if (!S.loginBusy && S.tgUser && S.req === "pending") return requestPending();
    var box = h("div", { class: "tgbox", id: "tgbox" }, h("span", { class: "mute small", text: t("widget_wait") }));
    var panel = h("section", { class: "panel login stack" },
      h("h2", { text: t("login_title") }),
      h("p", { class: "mute", text: t("login_text") }),
      S.invite ? h("div", { class: "notice ok", text: t("invite_note") }) : null,
      S.loginError ? h("div", { class: "notice bad", text: S.loginError }) : null,
      S.loginBusy ? h("p", { class: "boot", text: t("signing_in") }) : box);
    if (!S.loginBusy) setTimeout(function () { insertWidget(box); }, 0);
    return panel;
  }

  // Заявка на доступ: человек вошёл через Telegram, но ещё не сотрудник.
  function requestForm() {
    var tg = S.tgUser || {};
    var nameIn = h("input", { type: "text", maxlength: "200", required: true, autocomplete: "name",
      value: [tg.last_name, tg.first_name].filter(Boolean).join(" ") });
    var posSel = h("select", { required: true },
      h("option", { value: "", text: t("r_pick_pos") }),
      posList().map(function (p) { return h("option", { value: p.code, text: posTitle(p) }); }));
    var otherIn = h("input", { type: "text", maxlength: "200", placeholder: t("r_other_ph") });
    var otherBox = h("label", { class: "f", style: "display:none" }, t("r_other"), otherIn);
    posSel.addEventListener("change", function () { otherBox.style.display = posSel.value === "other" ? "" : "none"; });
    var insts = S.institutions || [];
    var instSel = instOptions(h("select", { "aria-label": t("inst_label") }), t("r_pick_inst"));
    instSel.appendChild(h("option", { value: "other", text: t("r_inst_other") }));
    var instIn = h("input", { type: "text", maxlength: "120", placeholder: t("r_inst_other_ph"), "aria-label": t("r_inst_other_ph") });
    var instBox = h("label", { class: "f", style: "display:none" }, t("r_inst_other"), instIn);
    instSel.addEventListener("change", function () { instBox.style.display = instSel.value === "other" ? "" : "none"; });
    var msg = h("div");
    var form = h("form", { class: "stack", novalidate: true },
      h("label", { class: "f" }, t("u_name"), nameIn),
      h("label", { class: "f" }, t("u_position"), posSel),
      otherBox,
      insts.length ? [h("label", { class: "f" }, t("inst_label"), instSel), instBox] : null,
      msg,
      h("div", null, h("button", { class: "btn pri", type: "submit", text: t("r_send") })));
    form.addEventListener("submit", function (e) {
      e.preventDefault(); msg.textContent = "";
      var fn = nameIn.value.trim().replace(/\s+/g, " "), p = posByCode(posSel.value);
      var pos = !p ? "" : p.code === "other" ? otherIn.value.trim() : p.ru;
      var iid = /^\d+$/.test(instSel.value) ? +instSel.value : null, itext = instSel.value === "other" ? instIn.value.trim().replace(/\s+/g, " ") : "";
      var err = fn.length < 3 ? t("err_bad_full_name") : !p ? t("r_need_pos") : pos.length < 2 ? t("err_bad_position") :
        insts.length && !iid && itext.length < 2 ? t("r_need_inst") : "";
      if (err) { msg.appendChild(h("div", { class: "notice bad", text: err })); return; }
      telegramLogin(S.tgUser, { full_name: fn, position: pos, position_code: p.code, institution_id: iid, institution_text: itext });
    });
    return h("section", { class: "panel login stack" },
      h("h2", { text: t("r_title") }),
      h("p", { class: "mute", text: t("r_text") }),
      S.req === "rejected" ? h("div", { class: "notice warn", text: t("r_rejected") }) : null,
      S.loginError ? h("div", { class: "notice bad", text: S.loginError }) : null,
      form);
  }
  function requestPending() {
    return h("section", { class: "panel login stack" },
      h("h2", { text: t("r_title") }),
      h("div", { class: "notice ok" }, t("r_pending"), h("p", { text: t("r_pending_long") })),
      S.loginError ? h("div", { class: "notice bad", text: S.loginError }) : null,
      h("div", { class: "row" },
        h("button", { class: "btn pri", type: "button", text: t("r_check"), onclick: function () { telegramLogin(S.tgUser); } }),
        h("button", { class: "btn", type: "button", text: t("r_edit"), onclick: function () { S.req = "none"; render(); } })));
  }
  function insertWidget(box) {
    if (!box.isConnected) return;
    var s = document.createElement("script");
    s.async = true; s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", CFG.botName);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "10");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-lang", S.lang === "uz" ? "uz" : "ru");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.onerror = function () { box.textContent = t("widget_fail"); };
    box.appendChild(s);
    setTimeout(function () { if (box.isConnected && !box.querySelector("iframe")) box.firstChild && (box.firstChild.textContent = t("widget_fail")); }, 8000);
  }

  // ------------------------------------------------------------------ показатели (только числа)
  var INDS = window.INDICATORS || {};
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function nowDate() { return window.__NOW ? new Date(window.__NOW) : new Date(); }
  function todayS() { var d = nowDate(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function utc(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function addDays(s, n) { var d = new Date(utc(s) + n * 86400000); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); }
  function dayDiff(a, b) { return Math.round((utc(a) - utc(b)) / 86400000); }
  function dowOf(s) { return new Date(utc(s)).getUTCDay(); }
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function indPositions() { return posList().filter(function (p) { return INDS[p.code]; }); }
  function unitLabel(u) { return !u ? "" : u === "%" ? "%" : (window.I18N.ru["ind_unit_" + u] ? t("ind_unit_" + u) : u); }
  function sumable(u) { return u !== "%" && u !== "yil"; }
  function ruleText(rule) {
    var days = t("ind_days").split(",");
    if (rule.t === "w") return t("ind_rule_w", { day: days[rule.d % 7], h: rule.h });
    if (rule.t === "m") return t("ind_rule_m", { d: rule.d, h: rule.h });
    if (rule.t === "q") return t("ind_rule_q", { d: rule.d, h: rule.h });
    return t("ind_rule_c");
  }
  function deadlinesBetween(rule, from, to) {
    var out = [];
    if (!rule || rule.t === "c") return out;
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var day = +d.slice(8, 10), mo = +d.slice(5, 7);
      if ((rule.t === "w" && dowOf(d) === rule.d) || (rule.t === "m" && day === rule.d) || (rule.t === "q" && day === rule.d && (mo - 1) % 3 === 0)) out.push(d);
    }
    return out;
  }
  // Какому сроку соответствует отчёт: первый срок не раньше конца периода (для еженедельных допуск 3 дня).
  function dueFor(rule, periodEnd) {
    if (!rule || rule.t === "c") return "";
    var from = addDays(periodEnd, rule.t === "w" ? -3 : 0);
    return deadlinesBetween(rule, from, addDays(from, 120))[0] || "";
  }
  function lastDeadline(rule) {
    var n = nowDate(), t0 = todayS(), list = deadlinesBetween(rule, addDays(t0, -130), t0).filter(function (d) { return d < t0 || n.getHours() >= rule.h; });
    return list[list.length - 1] || "";
  }
  function defaultPeriod(rule) {
    var t0 = todayS(), y = +t0.slice(0, 4), m = +t0.slice(5, 7);
    if (rule.t === "w") {
      var mon = addDays(t0, -((dowOf(t0) + 6) % 7));
      return rule.d === 1 ? [addDays(mon, -7), addDays(mon, -1)] : [mon, addDays(mon, rule.d - 1)];
    }
    if (rule.t === "m") { var py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [py + "-" + p2(pm) + "-01", py + "-" + p2(pm) + "-" + p2(lastDay(py, pm))]; }
    if (rule.t === "q") {
      var q = Math.floor((m - 1) / 3), sy = q === 0 ? y - 1 : y, sm = q === 0 ? 10 : (q - 1) * 3 + 1, em = sm + 2;
      return [sy + "-" + p2(sm) + "-01", sy + "-" + p2(em) + "-" + p2(lastDay(sy, em))];
    }
    return [t0, t0];
  }
  function myIndPos() {
    var pos = S.profile && S.profile.position;
    var p = indPositions().filter(function (x) { return x.ru === pos; })[0];
    return p ? p.code : "";
  }
  // крупные кнопки − / + рядом с полем числа
  function stepBtn(inp, d, unit) {
    return h("button", { type: "button", class: "stp" + (d > 0 ? " plus" : ""), "aria-label": t(d > 0 ? "step_plus" : "step_minus"),
      onclick: function () {
        var v = parseFloat(inp.value.trim().replace(/\s/g, "").replace(",", "."));
        if (!isFinite(v)) v = 0;
        v = Math.max(0, Math.round((v + d) * 100) / 100);
        if (unit === "%" && v > 100) v = 100;
        inp.value = String(v); inp.removeAttribute("aria-invalid");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      } }, svgIcon(d > 0 ? "M12 5v14M5 12h14" : "M5 12h14"));
  }
  function svgIcon(d) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  function nextDeadline(rule) {
    var n = nowDate(), t0 = todayS();
    return deadlinesBetween(rule, t0, addDays(t0, 130)).filter(function (d) { return d > t0 || n.getHours() < rule.h; })[0] || "";
  }
  function valText(v, unit) { return v === undefined || v === null || v === "" ? "" : unit === "%" ? String(v) + "%" : String(v); }

  async function indicatorsView() {
    var my = renderToken;
    shell("ind", loadingBox());
    var r = await sb.from("indicator_reports").select("id, position_code, institution, mahalla_id, period_start, period_end, vals, updated_at")
      .eq("user_id", S.session.user.id).order("period_end", { ascending: false });
    if (my !== renderToken) return;
    if (r.error) return shell("ind", failBox(r.error));
    var mine = r.data || [];
    var st = { pos: myIndPos() || (mine[0] && INDS[mine[0].position_code] ? mine[0].position_code : indPositions()[0].code), inst: store("ovabmk-inst") || "", ps: "", pe: "", vals: {}, key: "" };
    if (mine[0] && !store("ovabmk-inst")) st.inst = mine[0].institution;
    var myInst = S.profile && S.profile.institution_id != null ? instName(S.profile.institution_id) : "";
    if (myInst) st.inst = myInst;                       // учреждение, которое человек указал при входе
    var dp = defaultPeriod(INDS[st.pos].rule); st.ps = dp[0]; st.pe = dp[1];

    var posSel = h("select", { "aria-label": t("ind_pos") }, indPositions().map(function (p) { return h("option", { value: p.code, text: posTitle(p) }); }));
    var instIn = h("input", { type: "text", maxlength: "200", value: st.inst, autocomplete: "off" });
    var psIn = h("input", { type: "date", value: st.ps }), peIn = h("input", { type: "date", value: st.pe });
    posSel.value = st.pos;
    // махалля: из тех, что обслуживает учреждение сотрудника (если оно указано), иначе все
    var myMah = S.mahallas.filter(function (m) { return !S.profile || S.profile.institution_id == null || mahInsts(m.id).indexOf(S.profile.institution_id) >= 0; });
    var mahSel = h("select", { "aria-label": t("mah_label") }, h("option", { value: "", text: t("mah_whole") }),
      myMah.map(function (m) { return h("option", { value: String(m.id), text: m.name }); }));
    var note = h("div", { class: "small mute" }), rule = h("p", { class: "small mute" });
    var grid = h("div", { class: "indgrid" }), msg = h("div");
    var inputs = {}, fromEx = false;
    function findMine() {
      var inst = instIn.value.trim().toLowerCase(), mid = mahSel.value ? +mahSel.value : null;
      return mine.filter(function (x) { return x.position_code === posSel.value && x.institution.trim().toLowerCase() === inst && x.period_end === peIn.value && (x.mahalla_id || null) === mid; })[0] || null;
    }
    function collect() { var o = {}; Object.keys(inputs).forEach(function (n) { o[n] = inputs[n].value; }); return o; }
    function drawGrid(keepTyped) {
      var def = INDS[posSel.value], typed = keepTyped && !fromEx ? collect() : {}, ex = findMine();
      fromEx = !!ex;      // значения чужого (уже сохранённого) отчёта в новый не переносим
      grid.textContent = ""; inputs = {};
      rule.textContent = t("ind_deadline", { rule: ruleText(def.rule) });
      note.textContent = ex ? t("ind_editing") : t("ind_new");
      def.ind.forEach(function (i) {
        var val = ex && ex.vals["i" + i.n] !== undefined ? String(ex.vals["i" + i.n]) : (typed[i.n] || "");
        var inp = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", maxlength: "14", value: val, id: "ind" + i.n, "aria-label": i.ru });
        inputs[i.n] = inp;
        grid.appendChild(h("div", { class: "indrow" },
          h("label", { class: "indlab", for: "ind" + i.n }, h("span", { class: "no", text: i.n + "." }), h("span", null, h("b", { text: i.ru }), h("span", { class: "sub", text: i.uz }))),
          h("div", { class: "indval" }, stepBtn(inp, -1, i.unit), inp, stepBtn(inp, 1, i.unit), h("span", { class: "unit", text: unitLabel(i.unit) }))));
      });
    }
    posSel.addEventListener("change", function () {
      var d = defaultPeriod(INDS[posSel.value].rule); psIn.value = d[0]; peIn.value = d[1]; drawGrid(false);
    });
    [instIn, peIn, mahSel].forEach(function (el) { el.addEventListener("change", function () { drawGrid(true); }); });
    drawGrid(false);

    var btn = h("button", { class: "btn pri", type: "submit", text: t("ind_save") });
    var form = h("form", { class: "stack", novalidate: true },
      h("div", { class: "notice warn", text: t("ind_only_numbers") }),
      h("div", { class: "grid-f" }, h("label", { class: "f" }, t("ind_pos"), posSel), h("label", { class: "f" }, t("ind_inst"), instIn),
        S.mahallas.length ? h("label", { class: "f" }, t("mah_label"), mahSel) : null,
        h("label", { class: "f" }, t("ind_ps"), psIn), h("label", { class: "f" }, t("ind_pe"), peIn)),
      rule, note, h("h3", { text: t("ind_values") }), grid, msg, h("div", null, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.textContent = "";
      var def = INDS[posSel.value], vals = {}, bad = false, cnt = 0;
      def.ind.forEach(function (i) {
        var raw = inputs[i.n].value.trim().replace(/\s/g, "").replace(",", ".");
        if (raw === "") return;
        var v = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
        if (!isFinite(v) || v < 0 || v > 1e9 || (i.unit === "%" && v > 100)) { bad = true; inputs[i.n].setAttribute("aria-invalid", "true"); return; }
        inputs[i.n].removeAttribute("aria-invalid"); vals["i" + i.n] = v; cnt++;
      });
      var inst = instIn.value.trim().replace(/\s+/g, " "), ps = psIn.value, pe = peIn.value;
      var err = inst.length < 2 ? t("ind_err_inst") : (!ps || !pe || ps > pe || dayDiff(pe, ps) > 100) ? t("ind_err_period") : bad ? t("ind_err_bad") : !cnt ? t("ind_err_none") : "";
      if (err) { msg.appendChild(h("div", { class: "notice bad", text: err })); return; }
      btn.disabled = true;
      var ex = findMine(), res, mid = mahSel.value ? +mahSel.value : null;
      if (ex) res = await sb.from("indicator_reports").update({ institution: inst, period_start: ps, vals: vals }).eq("id", ex.id);
      else res = await sb.from("indicator_reports").insert({ user_id: S.session.user.id, position_code: posSel.value, institution: inst, mahalla_id: mid, period_start: ps, period_end: pe, vals: vals });
      btn.disabled = false;
      if (res.error) { msg.appendChild(h("div", { class: "notice bad", text: /duplicate|23505/.test(errMsg(res.error)) ? t("ind_err_dup") : t("err_action", { msg: errMsg(res.error) }) })); return; }
      store("ovabmk-inst", inst); toast(t("ind_saved")); indicatorsView();
    });

    var list = !mine.length ? h("p", { class: "mute", text: t("ind_my_empty") }) :
      h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("ind_period") }), h("th", { text: t("ind_pos") }), h("th", { class: "hide-sm", text: t("ind_inst_short") }), h("th", { class: "hide-sm" }), h("th"))),
        h("tbody", null, mine.map(function (x) {
          var def = INDS[x.position_code], p = posByCode(x.position_code), n = Object.keys(x.vals || {}).length;
          return h("tr", null,
            h("td", null, fmtDate(x.period_start) + " – " + fmtDate(x.period_end)),
            h("td", null, p ? posTitle(p) : x.position_code),
            h("td", { class: "hide-sm" }, x.institution, x.mahalla_id ? h("div", { class: "sub", text: mahName(x.mahalla_id) }) : null),
            h("td", { class: "hide-sm small mute", text: def ? t("ind_filled", { n: n, m: def.ind.length }) : "" }),
            h("td", null, h("div", { class: "row" },
              h("button", { class: "btn sm", type: "button", text: t("ind_edit"), onclick: function () {
                posSel.value = x.position_code; instIn.value = x.institution; mahSel.value = x.mahalla_id ? String(x.mahalla_id) : ""; psIn.value = x.period_start; peIn.value = x.period_end; drawGrid(false);
                form.scrollIntoView({ behavior: "smooth", block: "start" });
              } }),
              indDeleteButton(x))));
        }))));
    shell("ind", h("div", { class: "stack" }, h("section", { class: "panel stack" }, h("h2", { text: t("ind_title") }), form),
      h("section", { class: "panel stack" }, h("h3", { text: t("ind_my") }), list)));
  }
  function indDeleteButton(x) {
    var b = h("button", { class: "btn sm danger", type: "button", text: t("del") });
    b.addEventListener("click", async function () {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed"); b.textContent = t("del_confirm");
        setTimeout(function () { b.classList.remove("armed"); b.textContent = t("del"); }, 4000);
        return;
      }
      b.disabled = true;
      var r = await sb.from("indicator_reports").delete().eq("id", x.id).select("id");
      if (r.error || !r.data || !r.data.length) { b.disabled = false; toast(t("err_action", { msg: errMsg(r.error || "0 rows") })); return; }
      toast(t("ind_deleted")); indicatorsView();
    });
    return b;
  }

  // Сводка для руководителей: показатели одной должности по всем сотрудникам.
  var SUM = { pos: "", mode: "latest", ind: 0, inst: "", group: "reports" };
  async function indSummaryView() {
    var my = renderToken;
    shell("indsum", loadingBox());
    var plist = indPositions();
    // заведующий, у которого область видимости только по специальностям, видит в списке только их
    if (!isManager() && !S.scopes.institutions.length) plist = plist.filter(function (x) { return S.scopes.positions.indexOf(x.code) >= 0; });
    if (!plist.length) return shell("indsum", h("div", { class: "notice warn", text: t("ind_sum_nopos") }));
    if (!SUM.pos || !plist.some(function (x) { return x.code === SUM.pos; })) SUM.pos = plist[0].code;
    var def = INDS[SUM.pos], p = posByCode(SUM.pos);
    var r = await sb.from("indicator_reports").select("id, user_id, institution, mahalla_id, period_start, period_end, vals, updated_at")
      .eq("position_code", SUM.pos).order("period_end", { ascending: false });
    var pr = await sb.from("profiles").select("id, full_name, position, removed_at, institution_id");
    if (my !== renderToken) return;
    if (r.error) return shell("indsum", failBox(r.error));
    var names = {}, instOf = {}, people = (pr.data || []).filter(inMyScope);
    (pr.data || []).forEach(function (x) { names[x.id] = x.full_name; instOf[x.id] = x.institution_id; });
    people = people.filter(function (x) { return !SUM.inst || String(x.institution_id) === SUM.inst; });
    var all = (r.data || []).filter(function (x) { return !SUM.inst || String(instOf[x.user_id]) === SUM.inst; });
    var ends = Array.from(new Set(all.map(function (x) { return x.period_end; }))).slice(0, 12);
    if (SUM.mode !== "latest" && ends.indexOf(SUM.mode) < 0) SUM.mode = "latest";
    var rows;
    if (SUM.mode === "latest") {
      var seen = {}; rows = all.filter(function (x) { var k = x.user_id + "|" + x.institution.toLowerCase() + "|" + (x.mahalla_id || 0); if (seen[k]) return false; seen[k] = 1; return true; });
    } else rows = all.filter(function (x) { return x.period_end === SUM.mode; });
    rows.sort(function (a, b) { return a.institution.localeCompare(b.institution); });

    var posSel = h("select", { "aria-label": t("ind_sum_pos") }, plist.map(function (x) { return h("option", { value: x.code, text: posTitle(x) }); }));
    posSel.value = SUM.pos;
    var grpSel = h("select", { "aria-label": t("sum_group") }, ["reports", "mahalla", "inst", "district"].map(function (g) { return h("option", { value: g, text: t("sum_g_" + g) }); }));
    grpSel.value = SUM.group;
    grpSel.addEventListener("change", function () { SUM.group = grpSel.value; indSummaryView(); });
    var instSel = (S.institutions || []).length > 1 ? instOptions(h("select", { "aria-label": t("inst_label") }), t("ind_sum_all_inst")) : null;
    if (instSel) { instSel.value = SUM.inst; instSel.addEventListener("change", function () { SUM.inst = instSel.value; SUM.mode = "latest"; indSummaryView(); }); }
    posSel.addEventListener("change", function () { SUM.pos = posSel.value; SUM.mode = "latest"; SUM.ind = 0; indSummaryView(); });
    var modeSel = h("select", { "aria-label": t("ind_sum_mode") }, h("option", { value: "latest", text: t("ind_sum_latest") }),
      ends.map(function (d) { return h("option", { value: d, text: t("ind_sum_period", { d: fmtDate(d) }) }); }));
    modeSel.value = SUM.mode;
    modeSel.addEventListener("change", function () { SUM.mode = modeSel.value; indSummaryView(); });

    // столбцы: каждый отчёт отдельно или группа отчётов (махалля / учреждение / весь район): сумма, а для процентов — среднее
    var cols;
    if (SUM.group === "reports") cols = rows.map(function (x) { return { label: x.institution + (x.mahalla_id ? " / " + mahName(x.mahalla_id) : "") + " · " + (names[x.user_id] || "") + " (" + fmtDate(x.period_end) + ")", rows: [x] }; });
    else {
      var gm = {};
      rows.forEach(function (x) {
        var k = SUM.group === "mahalla" ? (x.mahalla_id ? mahName(x.mahalla_id) : t("mah_whole_short")) : SUM.group === "inst" ? (instName(instOf[x.user_id]) || x.institution) : t("sum_district");
        (gm[k] = gm[k] || []).push(x);
      });
      cols = Object.keys(gm).sort(function (a, b) { return a.localeCompare(b); }).map(function (k) { return { label: k + " (" + gm[k].length + ")", rows: gm[k] }; });
    }
    function agg(list, i, mean) {
      var nums = list.map(function (x) { return x.vals["i" + i.n]; }).filter(function (v) { return typeof v === "number"; });
      if (!nums.length) return "";
      var sm = nums.reduce(function (a, b) { return a + b; }, 0);
      return Math.round((sumable(i.unit) ? sm : mean ? sm / nums.length : NaN) * 100) / 100;
    }
    var header = ["№", p ? posTitle(p) : SUM.pos, ""].concat(cols.map(function (c) { return c.label; })).concat(SUM.group === "district" ? [] : [t("ind_total")]);
    var body = def.ind.map(function (i) {
      var vals = cols.map(function (c) { return agg(c.rows, i, SUM.group !== "reports"); }).map(function (v) { return isNaN(v) ? "" : v; });
      var total = agg(rows, i, false); if (total !== "" && isNaN(total)) total = "";
      var tail = SUM.group === "district" ? [] : [total];
      return { raw: [i.n, i.ru, unitLabel(i.unit)].concat(vals).concat(tail), view: [String(i.n), i.ru, unitLabel(i.unit)].concat(vals.map(function (v) { return valText(v, i.unit); })).concat(tail.map(function (v) { return v === "" ? "" : String(v); })) };
    });
    var table = !rows.length ? h("p", { class: "mute", text: t("ind_sum_empty") }) :
      h("div", { class: "tbl" }, h("table", { class: "indsum" },
        h("thead", null, h("tr", null, header.map(function (x) { return h("th", { text: x }); }))),
        h("tbody", null, body.map(function (b) { return h("tr", null, b.view.map(function (c, ci) { return h("td", { class: ci > 2 ? "num" : "", text: c }); })); }))));
    var exp = !rows.length ? null : h("button", { class: "btn", type: "button", text: t("ind_export"), onclick: function () {
      var blob = window.XLW.write([{ name: "Показатели", rows: [header].concat(body.map(function (b) { return b.raw; })) }]);
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Pokazateli_" + SUM.pos + "_" + todayS() + ".xlsx";
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    } });

    // кто не сдал за последний срок
    var missBox = null, ld = lastDeadline(def.rule);
    if (def.rule.t !== "c" && ld) {
      var expected = people.filter(function (x) { return p && x.position === p.ru && !x.removed_at; });
      var got = {}; all.forEach(function (x) { if (dueFor(def.rule, x.period_end) === ld) got[x.user_id] = 1; });
      var miss = expected.filter(function (x) { return !got[x.id]; });
      missBox = h("div", { class: "notice " + (!expected.length ? "warn" : miss.length ? "bad" : "ok") },
        h("b", { text: t("ind_missing_title", { d: fmtDate(ld) }) }), " · ",
        !expected.length ? t("ind_missing_unknown") : miss.length ? t("ind_missing_list", { n: miss.length }) + " " + miss.map(function (x) { return x.full_name; }).join(", ") : t("ind_missing_none"));
    }
    // динамика одного показателя по периодам: сумма или среднее по учреждениям
    var trend = null;
    if (all.length) {
      var ni = def.ind.some(function (i) { return i.n === SUM.ind; }) ? SUM.ind : def.ind[0].n;
      var idef = def.ind.filter(function (i) { return i.n === ni; })[0], isPct = idef.unit === "%", byEnd = {};
      all.forEach(function (x) { var v = x.vals["i" + ni]; if (typeof v === "number") (byEnd[x.period_end] = byEnd[x.period_end] || []).push(v); });
      var keys = Object.keys(byEnd).sort().slice(-12);
      var pts = keys.map(function (k) {
        var a = byEnd[k], sm = a.reduce(function (x, y) { return x + y; }, 0), v = sumable(idef.unit) ? sm : sm / a.length;
        v = Math.round(v * 100) / 100;
        return { x: shortDate(k), y: v, tip: valText(v, idef.unit) + " " + (isPct ? "" : unitLabel(idef.unit)) + " · " + fmtDate(k) };
      });
      var indSel = h("select", { "aria-label": t("ind_trend_pick") }, def.ind.map(function (i) { return h("option", { value: i.n, text: i.n + ". " + i.ru }); }));
      indSel.value = ni;
      indSel.addEventListener("change", function () { SUM.ind = +indSel.value; indSummaryView(); });
      trend = h("section", { class: "panel stack" }, panelHead(t("ind_trend_title"), sumable(idef.unit) ? t("ind_trend_sum") : t("ind_trend_avg")),
        h("label", { class: "f" }, t("ind_trend_pick"), indSel),
        pts.length < 2 ? h("p", { class: "mute", text: t("ind_trend_empty") }) :
          CH.line(pts, { aria: t("ind_trend_title") + ": " + idef.ru, caption: idef.ru, yMax: isPct ? 100 : undefined, yFmt: isPct ? function (v) { return Math.round(v) + "%"; } : undefined }));
    }
    shell("indsum", h("div", { class: "stack" }, trend, h("section", { class: "panel stack" }, h("h2", { text: t("ind_sum_title") }),
      h("div", { class: "grid-f" }, h("label", { class: "f" }, t("ind_sum_pos"), posSel), h("label", { class: "f" }, t("ind_sum_mode"), modeSel),
        instSel ? h("label", { class: "f" }, t("inst_label"), instSel) : null, h("label", { class: "f" }, t("sum_group"), grpSel)),
      h("p", { class: "small mute", text: t("ind_deadline", { rule: ruleText(def.rule) }) }), missBox, exp, table)));
  }



  // --- махалли: работает ли, полная ли бригада; администратор правит справочник и состав бригад
  var MAH = { inst: "" }, MAH_DAYS = 14;
  var BR_KINDS = ["doctor", "patronage", "doya_cab", "doya_pat"];
  async function mahallasView() {
    var my = renderToken;
    shell("mahallas", loadingBox());
    var rs = await Promise.all([
      sb.from("indicator_reports").select("mahalla_id, period_end").order("period_end", { ascending: false }).limit(5000),
      loadMahallas(), loadInstitutions(true),
      isAdmin() ? sb.from("profiles").select("id, full_name, removed_at") : Promise.resolve({ data: [] })
    ]);
    if (my !== renderToken) return;
    if (rs[0].error) return shell("mahallas", failBox(rs[0].error));
    var last = {}; (rs[0].data || []).forEach(function (x) { if (x.mahalla_id != null && (!last[x.mahalla_id] || x.period_end > last[x.mahalla_id])) last[x.mahalla_id] = x.period_end; });
    var people = (rs[3].data || []).filter(function (x) { return !x.removed_at; });
    var since = addDays(todayS(), -MAH_DAYS), insts = S.institutions || [];
    var scoped = !isManager() && S.scopes.institutions.length ? S.scopes.institutions : null;
    var vis = S.mahallas.filter(function (m) {
      var li = mahInsts(m.id);
      if (scoped && !li.some(function (i) { return scoped.indexOf(i) >= 0; })) return false;
      return !MAH.inst || li.indexOf(+MAH.inst) >= 0 || (MAH.inst === "none" && !li.length);
    });
    function works(m) { return !!last[m.id] && last[m.id] >= since; }
    var nW = vis.filter(works).length, nB = vis.filter(function (m) { return !brigadeGaps(m.id).length; }).length;
    var pw = pctOf(nW, vis.length), pb = pctOf(nB, vis.length);
    var kpis = h("div", { class: "kpis" },
      kpi(t("mah_k_work"), CH.ring(pw, { label: pw === null ? "" : pw + "%" }), vis.length ? t("mah_k_work_of", { n: nW, m: vis.length, d: MAH_DAYS }) : t("mah_none")),
      kpi(t("mah_k_br"), CH.ring(pb, { label: pb === null ? "" : pb + "%" }), vis.length ? t("mah_k_br_of", { n: nB, m: vis.length }) : t("mah_none")),
      kpi(t("mah_k_down"), h("span", { class: "big", text: String(vis.length - nW) }), t("mah_k_down_sub")));

    var groups = insts.filter(function (i) { return !MAH.inst || MAH.inst === String(i.id); }).map(function (i) { return { id: i.id, name: i.name, list: vis.filter(function (m) { return mahInsts(m.id).indexOf(i.id) >= 0; }) }; })
      .filter(function (g) { return g.list.length; });
    var orphan = vis.filter(function (m) { return !mahInsts(m.id).length; });
    if (orphan.length && (!MAH.inst || MAH.inst === "none")) groups.push({ id: 0, name: t("mah_no_inst"), list: orphan });

    var bars = groups.map(function (g) {
      var n = g.list.filter(works).length, p = pctOf(n, g.list.length);
      return { label: g.name, sub: n + " / " + g.list.length, pct: p, text: p + "%", tone: CH.tone(p) };
    }).sort(function (a, b) { return a.pct - b.pct || a.label.localeCompare(b.label); });
    var barPanel = !bars.length ? null : h("section", { class: "panel" }, panelHead(t("mah_chart"), t("mah_chart_sub", { d: MAH_DAYS })), CH.hbars(bars, { aria: t("mah_chart") }));

    var filter = h("select", { "aria-label": t("inst_label") }, h("option", { value: "", text: t("ind_sum_all_inst") }),
      insts.map(function (i) { return h("option", { value: String(i.id), text: i.name }); }), h("option", { value: "none", text: t("mah_no_inst") }));
    filter.value = MAH.inst;
    filter.addEventListener("change", function () { MAH.inst = filter.value; mahallasView(); });

    function row(m, g) {
      var gaps = brigadeGaps(m.id), ok = works(m);
      var cells = [
        h("td", null, h("b", { text: m.name }), mahInsts(m.id).length > 1 ? h("div", { class: "sub", text: t("mah_shared") }) : null),
        h("td", null, h("span", { class: "chip " + (ok ? "ok" : "bad"), text: ok ? t("mah_works") : t("mah_down") }),
          h("div", { class: "sub", text: last[m.id] ? t("mah_last", { d: fmtDate(last[m.id]) }) : t("mah_never") })),
        h("td", null, !S.brigades.some(function (b) { return b.mahalla_id === m.id; }) ? h("span", { class: "chip warn", text: t("br_none") })
          : !gaps.length ? h("span", { class: "chip ok", text: t("br_full") })
          : [h("span", { class: "chip warn", text: t("br_incomplete") }), h("div", { class: "sub", text: gaps.join("; ") })])
      ];
      if (isAdmin()) cells.push(h("td", null, mahEditor(m, people, function () { mahallasView(); })));
      return h("tr", null, cells);
    }
    var tables = groups.map(function (g) {
      return h("section", { class: "panel stack" }, h("h3", { text: g.name }),
        h("div", { class: "tbl" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { text: t("mah_label") }), h("th", { text: t("mah_status") }), h("th", { text: t("br_title") }), isAdmin() ? h("th") : null)),
          h("tbody", null, g.list.map(function (m) { return row(m, g); })))));
    });
    shell("mahallas", h("div", { class: "stack" },
      h("div", { class: "ovh" }, h("h2", { text: t("mah_title") }), h("label", { class: "f", style: "min-width:220px" }, filter)),
      kpis, barPanel,
      isAdmin() ? mahAddForm(function () { mahallasView(); }) : null,
      tables.length ? tables : h("p", { class: "panel mute", text: t("mah_none") })));
  }

  function mahErr(e) {
    var m = errMsg(e);
    return /mahalla_exists/.test(m) ? t("mah_exists") : /mahalla_has_reports/.test(m) ? t("mah_has_reports") : /bad_name/.test(m) ? t("inst_bad_name") : t("err_action", { msg: m });
  }
  function instChecks(selected) {
    return h("div", { class: "fold-picks wide" }, (S.institutions || []).map(function (i) {
      return h("label", null, h("input", { type: "checkbox", value: String(i.id), checked: selected.indexOf(i.id) >= 0 }), i.name);
    }));
  }
  function mahAddForm(done) {
    var nameIn = h("input", { type: "text", maxlength: "120", "aria-label": t("mah_label") }), checks = instChecks([]);
    var form = h("form", { class: "stack" }, h("label", { class: "f" }, t("mah_label"), nameIn),
      h("b", { class: "small mute", text: t("mah_inst_serving") }), checks,
      h("div", null, h("button", { class: "btn pri", type: "submit", text: t("inst_add") })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var ids = Array.from(checks.querySelectorAll("input:checked")).map(function (x) { return +x.value; });
      var x = await sb.rpc("admin_save_mahalla", { _id: null, _name: nameIn.value, _institutions: ids });
      if (x.error) { toast(mahErr(x.error)); return; }
      toast(t("mah_added")); done();
    });
    return h("details", { class: "panel" }, h("summary", { style: "cursor:pointer;font-weight:800;color:var(--head)", text: t("mah_add") }), h("div", { style: "margin-top:12px" }, form));
  }
  function mahEditor(m, people, done) {
    var nameIn = h("input", { type: "text", value: m.name, maxlength: "120", "aria-label": t("mah_label") });
    var checks = instChecks(mahInsts(m.id));
    var posts = S.brigades.filter(function (b) { return b.mahalla_id === m.id; }).map(function (b) { return { kind: b.kind, rate: Number(b.rate), user_id: b.user_id || "" }; });
    var box = h("div", { class: "stack", style: "gap:6px" });
    function drawPosts() {
      box.textContent = "";
      posts.forEach(function (p, idx) {
        var ks = h("select", { "aria-label": t("br_kind") }, BR_KINDS.map(function (k) { return h("option", { value: k, text: t("br_kind_" + k) }); })); ks.value = p.kind;
        var ri = h("input", { type: "number", min: "0.25", max: "2", step: "0.25", value: String(p.rate), "aria-label": t("br_rate"), style: "width:80px" });
        var us = h("select", { "aria-label": t("br_person") }, h("option", { value: "", text: t("br_vacant") }),
          people.map(function (x) { return h("option", { value: x.id, text: x.full_name }); })); us.value = p.user_id || "";
        ks.addEventListener("change", function () { p.kind = ks.value; });
        ri.addEventListener("change", function () { p.rate = Number(ri.value) || 0; });
        us.addEventListener("change", function () { p.user_id = us.value; });
        box.appendChild(h("div", { class: "row" }, ks, ri, us, h("button", { class: "btn sm danger", type: "button", text: "×", "aria-label": t("del"), onclick: function () { posts.splice(idx, 1); drawPosts(); } })));
      });
    }
    drawPosts();
    var msg = h("div");
    var save = h("button", { class: "btn pri", type: "button", text: t("save") });
    save.addEventListener("click", async function () {
      var ids = Array.from(checks.querySelectorAll("input:checked")).map(function (x) { return +x.value; });
      save.disabled = true;
      var x = await sb.rpc("admin_save_mahalla", { _id: m.id, _name: nameIn.value, _institutions: ids });
      if (!x.error) x = await sb.rpc("admin_set_brigade", { _mahalla: m.id, _posts: posts.filter(function (p) { return p.rate > 0; }).map(function (p) { return { kind: p.kind, rate: p.rate, user_id: p.user_id || null }; }) });
      save.disabled = false;
      if (x.error) { toast(mahErr(x.error)); return; }
      toast(t("u_saved")); done();
    });
    var del = h("button", { class: "btn danger", type: "button", text: t("del") });
    del.addEventListener("click", async function () {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = t("del_confirm"); setTimeout(function () { del.classList.remove("armed"); del.textContent = t("del"); }, 4000); return; }
      var x = await sb.rpc("admin_delete_mahalla", { _id: m.id });
      if (x.error) { toast(mahErr(x.error)); return; }
      toast(t("mah_deleted")); done();
    });
    return h("details", null, h("summary", { style: "cursor:pointer;font-weight:700", text: t("mah_edit") }),
      h("div", { class: "stack", style: "margin-top:8px;min-width:260px" },
        h("label", { class: "f" }, t("mah_label"), nameIn), h("b", { class: "small mute", text: t("mah_inst_serving") }), checks,
        h("b", { class: "small mute", text: t("br_title") + " — " + t("br_norm") }), box,
        h("div", null, h("button", { class: "btn sm", type: "button", text: t("br_add"), onclick: function () { posts.push({ kind: "doctor", rate: 1, user_id: "" }); drawPosts(); } })),
        msg, h("div", { class: "row" }, save, del)));
  }

  // --- обзор: проценты и графики
  function shortDate(s) { return s.slice(8, 10) + "." + s.slice(5, 7); }
  function weekStart(s) { return addDays(s, -((dowOf(s) + 6) % 7)); }
  function pctOf(a, b) { return b ? Math.round(a * 100 / b) : null; }
  function panelHead(title, sub) { return h("div", { class: "ph" }, h("h3", { text: title }), sub ? h("p", { class: "small mute", text: sub }) : null); }
  function kpi(label, body, foot) {
    return h("div", { class: "kpi" }, h("p", { class: "kpi-l", text: label }), h("div", { class: "kpi-b" }, body), foot ? h("p", { class: "kpi-f small mute" }, foot) : null);
  }
  // большая карточка «что сделать сейчас» на главной
  function actionCard(tone, title, sub, chip, btnText, href, primary, pct) {
    return h("section", { class: "act t-" + tone },
      h("div", { class: "act-txt" },
        chip ? h("span", { class: "act-chip" }, svgIcon("M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"), chip) : null,
        h("h2", { text: title }),
        h("p", { text: sub }),
        typeof pct === "number" ? h("div", { class: "meter act-m t-" + tone }, h("i", { style: "width:" + pct + "%" })) : null),
      h("a", { class: "btn " + (primary ? "pri big" : "big"), href: href },
        h("span", { class: "act-plus" }, svgIcon(href === "#/indicators" && primary ? "M12 5v14M5 12h14" : "M5 12h14M13 6l6 6-6 6")), btnText));
  }
  async function overviewView() {
    var my = renderToken, mgr = canSummary();
    shell("overview", loadingBox());
    var rs = await Promise.all([
      sb.from("folders").select("id, title_ru, title_uz, hint_ru, restricted").order("id"),
      sb.rpc("folder_counts"),
      sb.from("documents").select("created_at").order("created_at", { ascending: false }).limit(5000),
      sb.from("indicator_reports").select("user_id, position_code, period_end").order("period_end", { ascending: false }).limit(5000),
      mgr ? sb.from("profiles").select("id, full_name, position, removed_at, institution_id") : Promise.resolve({ data: [] })
    ]);
    if (my !== renderToken) return;
    var f = rs[0], c = rs[1], d = rs[2], ir = rs[3], pr = rs[4];
    if (f.error) return shell("overview", failBox(f.error));
    var counts = {}; (c.data || []).forEach(function (x) { counts[x.folder_id] = x.docs; });
    var open = f.data.filter(canOpenFolder);
    var filled = open.filter(function (x) { return (counts[x.id] || 0) > 0; }).length;
    var total = open.reduce(function (a, x) { return a + (counts[x.id] || 0); }, 0);
    var t0 = todayS(), since = addDays(t0, -30);
    var docs = d.data || [];
    var last30 = docs.filter(function (x) { return String(x.created_at).slice(0, 10) >= since; }).length;

    // показатели: сданы ли за последний срок
    var reports = ir.data || [], people = (pr.data || []).filter(inMyScope), comp = [], gotAll = 0, expAll = 0, mine = null, heroCard = null;
    if (mgr) {
      indPositions().forEach(function (p) {
        var rule = INDS[p.code].rule, ld = rule.t === "c" ? "" : lastDeadline(rule);
        if (!ld) return;
        var exp = people.filter(function (x) { return x.position === p.ru && !x.removed_at; });
        if (!exp.length) return;
        var ids = {}; exp.forEach(function (x) { ids[x.id] = 1; });
        var got = {}; reports.forEach(function (x) { if (x.position_code === p.code && ids[x.user_id] && dueFor(rule, x.period_end) === ld) got[x.user_id] = 1; });
        var n = Object.keys(got).length;
        gotAll += n; expAll += exp.length;
        comp.push({ label: posTitle(p), sub: n + " / " + exp.length, pct: pctOf(n, exp.length), text: pctOf(n, exp.length) + "%", tone: CH.tone(pctOf(n, exp.length)) });
      });
      comp.sort(function (a, b) { return a.pct - b.pct || a.label.localeCompare(b.label); });
    } else {
      var code = myIndPos(), rule = code ? INDS[code].rule : null, ld = rule && rule.t !== "c" ? lastDeadline(rule) : "";
      if (ld) mine = { done: reports.some(function (x) { return x.position_code === code && dueFor(rule, x.period_end) === ld; }), d: ld };
      var nd = rule && rule.t !== "c" ? nextDeadline(rule) : "";
      if (nd) {
        var doneNext = reports.some(function (x) { return x.position_code === code && dueFor(rule, x.period_end) === nd; });
        if (doneNext) heroCard = actionCard("ok", t("hb_done"), t("hb_next", { d: fmtDate(nd) }), null, t("hb_open"), "#/indicators");
        else if (mine && !mine.done) heroCard = actionCard("bad", t("hb_late"), t("hb_late_d", { d: fmtDate(mine.d) }), t("hb_due", { d: fmtDate(nd) }), t("hb_go"), "#/indicators", true);
        else heroCard = actionCard("warn", t("hb_todo"), t("ind_deadline", { rule: ruleText(rule) }), t("hb_due", { d: fmtDate(nd) }), t("hb_go"), "#/indicators", true);
      }
    }
    if (mgr && expAll) {
      var miss = expAll - gotAll;
      heroCard = actionCard(miss ? (miss * 2 > expAll ? "bad" : "warn") : "ok", miss ? t("hb_mgr", { n: miss, m: expAll }) : t("hb_mgr_ok"), t("hb_mgr_sub"), null,
        t("hb_mgr_go"), "#/indicators/summary", !!miss, pctOf(gotAll, expAll));
    }
    var indTile;
    if (mgr) {
      var ip = pctOf(gotAll, expAll);
      indTile = kpi(t("ov_ind_title"), CH.ring(ip, { label: ip === null ? "" : ip + "%" }), ip === null ? t("ov_empty_comp") : t("ov_ind_of", { n: gotAll, m: expAll }));
    } else {
      indTile = kpi(t("ov_ind_title"), mine ? CH.ring(mine.done ? 100 : 0, { tone: mine.done ? "ok" : "bad" }) : CH.ring(null),
        mine ? [h("b", { text: mine.done ? t("ov_ind_mine_done") : t("ov_ind_mine_miss") }), " · ", t("ov_ind_mine_for", { d: fmtDate(mine.d) })] : t("ov_ind_mine_none"));
    }
    var fp = pctOf(filled, open.length);
    var kpis = h("div", { class: "kpis" },
      kpi(t("ov_folders_filled"), CH.ring(fp, { label: fp === null ? "" : fp + "%" }), open.length ? t("ov_folders_of", { n: filled, m: open.length }) : t("ov_none_folders")),
      kpi(t("ov_docs_total"), h("span", { class: "big", text: String(total) }), t("ov_docs_30", { n: last30 })),
      indTile);

    // документы по папкам
    var mx = Math.max.apply(null, open.map(function (x) { return counts[x.id] || 0; }).concat([1]));
    var fb = open.slice().sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0) || a.id - b.id; }).map(function (x) {
      return { label: folderTitle(x), sub: t("folder_no", { n: x.id }), pct: (counts[x.id] || 0) * 100 / mx, text: String(counts[x.id] || 0),
        tone: (counts[x.id] || 0) ? "acc" : "mute", href: "#/folder/" + x.id, title: folderTitle(x) + " — " + t("ov_docs_word", { n: counts[x.id] || 0 }) };
    });
    var foldersPanel = h("section", { class: "panel" }, panelHead(t("ov_chart_folders"), t("ov_chart_folders_sub")),
      fb.length ? CH.hbars(fb, { aria: t("ov_chart_folders") }) : h("p", { class: "mute", text: t("ov_none_folders") }));

    // по неделям
    var ws0 = weekStart(t0), weeks = [];
    for (var i = 0; i < 12; i++) weeks.push(addDays(ws0, -7 * (11 - i)));
    var wc = weeks.map(function () { return 0; });
    docs.forEach(function (x) {
      var day = String(x.created_at).slice(0, 10), k = dayDiff(weekStart(day), weeks[0]) / 7;
      if (k >= 0 && k < 12 && k === Math.floor(k)) wc[k]++;
    });
    var wpts = weeks.map(function (w, i) { return { x: shortDate(w), y: wc[i], tip: t("ov_week_tip", { a: shortDate(w), b: shortDate(addDays(w, 6)), n: wc[i] }) }; });
    var weeksPanel = h("section", { class: "panel" }, panelHead(t("ov_chart_weeks"), t("ov_chart_weeks_sub")),
      CH.line(wpts, { aria: t("ov_chart_weeks"), caption: t("ov_chart_weeks"), minMax: 4 }));

    var compPanel = !mgr ? null : h("section", { class: "panel" }, panelHead(t("ov_chart_comp"), t("ov_chart_comp_sub")),
      comp.length ? CH.hbars(comp, { aria: t("ov_chart_comp") }) : h("p", { class: "mute", text: t("ov_empty_comp") }));

    shell("overview", h("div", { class: "stack" },
      h("div", { class: "ovh" }, h("h2", { text: t("ov_title") }), h("span", { class: "small mute", text: t("ov_updated", { d: fmtDate(t0) }) })),
      heroCard, kpis, h("div", { class: "ovgrid" }, foldersPanel, h("div", { class: "stack" }, compPanel, weeksPanel))));
  }

  // --- папки
  async function foldersView() {
    var my = renderToken;
    shell("folders", loadingBox());
    var f = await sb.from("folders").select("id, title_ru, title_uz, hint_ru, restricted").order("id");
    var c = await sb.rpc("folder_counts");
    if (my !== renderToken) return;
    if (f.error) return shell("folders", failBox(f.error));
    var counts = {}; (c.data || []).forEach(function (x) { counts[x.folder_id] = x.docs; });
    var mxc = Math.max.apply(null, f.data.filter(canOpenFolder).map(function (x) { return counts[x.id] || 0; }).concat([1]));
    shell("folders", h("div", { class: "folders" }, f.data.map(function (fd) {
      var open = canOpenFolder(fd);
      var inner = [
        h("span", { class: "no", text: t("folder_no", { n: fd.id }) }),
        h("b", { text: folderTitle(fd) }),
        h("span", { class: "uz", text: folderSub(fd) }),
        h("div", { class: "ft" },
          fd.restricted ? h("span", { class: "chip bad", text: "🔒 " + t("locked") })
            : open ? h("span", { class: "chip", text: t("docs_count", { n: counts[fd.id] || 0 }) })
            : h("span", { class: "chip", text: t("no_access") })),
        open && !fd.restricted ? h("div", { class: "fc-m", "aria-hidden": "true" }, CH.meter((counts[fd.id] || 0) * 100 / mxc, { tone: (counts[fd.id] || 0) ? "acc" : "mute" })) : null
      ];
      if (fd.restricted) return h("div", { class: "fcard locked", title: t("locked_long") }, inner);
      if (!open) return h("div", { class: "fcard dim" }, inner);
      return h("a", { class: "fcard", href: "#/folder/" + fd.id }, inner);
    })));
  }

  // --- одна папка
  async function folderView(id) {
    var my = renderToken;
    shell("folders", loadingBox());
    var fr = await sb.from("folders").select("id, title_ru, title_uz, hint_ru, restricted").eq("id", id).maybeSingle();
    if (my !== renderToken) return;
    if (fr.error) return shell("folders", failBox(fr.error));
    var f = fr.data;
    var back = h("p", null, h("a", { href: "#/folders", text: t("back") }));
    if (!f) return shell("folders", h("div", { class: "stack" }, back, h("div", { class: "notice warn", text: t("no_access_long") })));
    var head = h("section", { class: "panel" },
      h("span", { class: "mono small mute", text: t("folder_no", { n: f.id }) }),
      h("h2", { text: folderTitle(f) }), h("p", { class: "mute small", text: folderSub(f) }),
      f.hint_ru ? h("p", { class: "small", style: "margin-top:6px", text: f.hint_ru }) : null);
    if (f.restricted) return shell("folders", h("div", { class: "stack" }, back, head, h("div", { class: "notice bad", text: "🔒 " + t("locked_long") })));
    if (!canOpenFolder(f)) return shell("folders", h("div", { class: "stack" }, back, head, h("div", { class: "notice warn", text: t("no_access_long") })));

    var d = await sb.from("documents").select("id, title, doc_number, doc_date, note, storage_path, file_name, file_size, uploaded_by, created_at")
      .eq("folder_id", id).order("created_at", { ascending: false });
    if (my !== renderToken) return;
    var names = {};
    if (!d.error && d.data.length) {
      var ids = Array.from(new Set(d.data.map(function (x) { return x.uploaded_by; })));
      var p = await sb.from("profiles").select("id, full_name").in("id", ids);
      (p.data || []).forEach(function (x) { names[x.id] = x.full_name; });
      if (my !== renderToken) return;
    }
    var list = d.error ? failBox(d.error) : !d.data.length ? h("p", { class: "mute", text: t("empty") }) :
      h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("f_title") }), h("th", { class: "hide-sm", text: t("f_number") + " / " + t("f_date") }),
          h("th", { class: "hide-sm", text: t("uploaded_by") }), h("th"))),
        h("tbody", null, d.data.map(function (doc) {
          return h("tr", null,
            h("td", null, h("b", { text: doc.title }), doc.note ? h("div", { class: "sub", text: doc.note }) : null,
              doc.file_name ? h("div", { class: "sub mono", text: doc.file_name + " · " + fmtSize(doc.file_size) }) : null),
            h("td", { class: "hide-sm" }, [doc.doc_number || "", doc.doc_date ? " · " + fmtDate(doc.doc_date) : ""].join("")),
            h("td", { class: "hide-sm" }, names[doc.uploaded_by] || "—", h("div", { class: "sub", text: fmtDT(doc.created_at) })),
            h("td", null, h("div", { class: "row" },
              doc.storage_path ? h("button", { class: "btn sm", type: "button", onclick: function () { openFile(doc.storage_path); }, text: t("open") }) : null,
              isAdmin() ? deleteButton(doc, id) : null)));
        }))));
    shell("folders", h("div", { class: "stack" }, back, head, uploadForm(id), bulkForm(id),
      h("section", { class: "panel stack" }, h("h3", { text: t("docs") }), list)));
  }

  async function openFile(path) {
    var w = window.open("", "_blank");
    var r = await sb.storage.from("documents").createSignedUrl(path, 120);
    if (r.error || !r.data) { if (w) w.close(); toast(t("err_action", { msg: errMsg(r.error) })); return; }
    if (w) { w.opener = null; w.location.href = r.data.signedUrl; } else location.href = r.data.signedUrl;
  }

  function deleteButton(doc, folderId) {
    var b = h("button", { class: "btn sm danger", type: "button", text: t("del") });
    b.addEventListener("click", async function () {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed"); b.textContent = t("del_confirm");
        setTimeout(function () { b.classList.remove("armed"); b.textContent = t("del"); }, 4000);
        return;
      }
      b.disabled = true;
      var r = await sb.from("documents").delete().eq("id", doc.id).select("id");
      if (r.error || !r.data || !r.data.length) { b.disabled = false; toast(t("err_action", { msg: errMsg(r.error || "0 rows") })); return; }
      if (doc.storage_path) await sb.storage.from("documents").remove([doc.storage_path]);
      toast(t("deleted")); folderView(folderId);
    });
    return b;
  }

  function uploadForm(folderId) {
    var title = h("input", { type: "text", maxlength: "300", required: true });
    var num = h("input", { type: "text", maxlength: "100" });
    var date = h("input", { type: "date" });
    var note = h("textarea", { rows: "2", maxlength: "1000" });
    var file = h("input", { type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" });
    var conf = h("input", { type: "checkbox" });
    var msg = h("div");
    var btn = h("button", { class: "btn pri", type: "submit", text: t("save") });
    var form = h("form", { class: "stack", novalidate: true },
      h("div", { class: "notice warn", text: t("pd_warning") }),
      h("div", { class: "grid-f" },
        h("label", { class: "f" }, t("f_title"), title),
        h("label", { class: "f" }, t("f_number"), num),
        h("label", { class: "f" }, t("f_date"), date)),
      h("label", { class: "f" }, t("f_note"), note),
      h("label", { class: "f" }, t("f_file"), file),
      h("label", { class: "check" }, conf, h("span", { text: t("f_confirm") })),
      msg, h("div", null, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      msg.textContent = "";
      var fl = file.files && file.files[0];
      var err = !title.value.trim() ? t("err_need_title") : !fl ? t("err_need_file") : fl.size > MAX_FILE ? t("err_file_big")
        : (fl.type && TYPES.indexOf(fl.type) < 0) ? t("err_file_type") : !conf.checked ? t("err_need_confirm") : "";
      if (err) { msg.appendChild(h("div", { class: "notice bad", text: err })); return; }
      btn.disabled = true; btn.textContent = t("uploading");
      var path = folderId + "/" + uuid() + "/" + safeName(fl.name);
      var up = await sb.storage.from("documents").upload(path, fl, { contentType: fl.type || "application/octet-stream", upsert: false });
      if (up.error) { btn.disabled = false; btn.textContent = t("save"); msg.appendChild(h("div", { class: "notice bad", text: t("err_action", { msg: errMsg(up.error) }) })); return; }
      var ins = await sb.from("documents").insert({
        folder_id: folderId, title: title.value.trim(), doc_number: num.value.trim() || null, doc_date: date.value || null,
        note: note.value.trim() || null, storage_path: path, file_name: fl.name.slice(0, 200), file_size: fl.size,
        mime_type: (fl.type || "").slice(0, 150) || null, no_patient_data: true, uploaded_by: S.session.user.id
      });
      if (ins.error) { btn.disabled = false; btn.textContent = t("save"); msg.appendChild(h("div", { class: "notice bad", text: t("err_action", { msg: errMsg(ins.error) }) })); return; }
      toast(t("added")); folderView(folderId);
    });
    return h("details", { class: "panel" }, h("summary", { style: "cursor:pointer;font-weight:800;color:var(--head)", text: t("add_doc") }),
      h("div", { style: "margin-top:12px" }, form));
  }

  // Пакетная загрузка: сразу несколько файлов в одну папку, названия берутся из имён файлов и правятся перед отправкой.
  function bulkForm(folderId) {
    var file = h("input", { type: "file", multiple: true, accept: ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" });
    var conf = h("input", { type: "checkbox" });
    var list = h("div", { class: "stack", style: "gap:8px" });
    var msg = h("div");
    var btn = h("button", { class: "btn pri", type: "submit", text: t("b_upload", { n: 0 }), disabled: true });
    var rows = [];
    function titleOf(name) { return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 300) || name; }
    file.addEventListener("change", function () {
      rows = []; list.textContent = ""; msg.textContent = "";
      Array.prototype.forEach.call(file.files || [], function (fl) {
        var bad = fl.size > MAX_FILE ? t("err_file_big") : (fl.type && TYPES.indexOf(fl.type) < 0) ? t("err_file_type") : "";
        var inp = h("input", { type: "text", maxlength: "300", value: titleOf(fl.name), "aria-label": t("f_title") });
        var st = h("span", { class: "small " + (bad ? "bad" : "mute"), text: bad || fmtSize(fl.size) });
        list.appendChild(h("div", { class: "row", style: "flex-wrap:wrap;gap:8px;align-items:center" }, inp, st));
        rows.push({ fl: fl, inp: inp, st: st, bad: !!bad });
      });
      var n = rows.filter(function (r) { return !r.bad; }).length;
      btn.textContent = t("b_upload", { n: n }); btn.disabled = n === 0;
    });
    var form = h("form", { class: "stack", novalidate: true },
      h("div", { class: "notice warn", text: t("pd_warning") }),
      h("p", { class: "mute small", text: t("b_hint") }),
      h("label", { class: "f" }, t("b_files"), file), list,
      h("label", { class: "check" }, conf, h("span", { text: t("b_confirm") })),
      msg, h("div", null, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.textContent = "";
      var todo = rows.filter(function (r) { return !r.bad && !r.done; });
      if (!todo.length) { msg.appendChild(h("div", { class: "notice bad", text: t("err_need_file") })); return; }
      if (!conf.checked) { msg.appendChild(h("div", { class: "notice bad", text: t("err_need_confirm") })); return; }
      if (todo.some(function (r) { return !r.inp.value.trim(); })) { msg.appendChild(h("div", { class: "notice bad", text: t("err_need_title") })); return; }
      btn.disabled = true; file.disabled = true; var okN = 0;
      for (var i = 0; i < todo.length; i++) {
        var r = todo[i], fl = r.fl;
        btn.textContent = t("uploading") + " " + (i + 1) + "/" + todo.length;
        r.st.className = "small mute"; r.st.textContent = t("uploading");
        var path = folderId + "/" + uuid() + "/" + safeName(fl.name);
        var up = await sb.storage.from("documents").upload(path, fl, { contentType: fl.type || "application/octet-stream", upsert: false });
        if (up.error) { r.st.className = "small bad"; r.st.textContent = errMsg(up.error); continue; }
        var ins = await sb.from("documents").insert({
          folder_id: folderId, title: r.inp.value.trim(), storage_path: path, file_name: fl.name.slice(0, 200), file_size: fl.size,
          mime_type: (fl.type || "").slice(0, 150) || null, no_patient_data: true, uploaded_by: S.session.user.id
        });
        if (ins.error) { await sb.storage.from("documents").remove([path]); r.st.className = "small bad"; r.st.textContent = errMsg(ins.error); continue; }
        okN++; r.done = true; r.st.className = "small ok"; r.st.textContent = "✓";
      }
      toast(t("b_done", { ok: okN, n: todo.length }));
      if (okN === todo.length) folderView(folderId);
      else { btn.disabled = false; btn.textContent = t("b_upload", { n: todo.length - okN }); msg.appendChild(h("div", { class: "notice warn", text: t("b_partial", { ok: okN, n: todo.length }) })); }
    });
    return h("details", { class: "panel" }, h("summary", { style: "cursor:pointer;font-weight:800;color:var(--head)", text: t("b_add") }),
      h("div", { style: "margin-top:12px" }, form));
  }

  // --- администратор: заявки на доступ
  async function requestsView() {
    var my = renderToken;
    shell("requests", loadingBox());
    var r = await sb.from("access_requests").select("id, full_name, position, position_code, institution_id, institution_text, tg_username, tg_name, status, role, folder_ids, created_at, decided_at, used_at")
      .order("created_at", { ascending: false }).limit(200);
    await loadInstitutions(true);
    if (my !== renderToken) return;
    if (r.error) return shell("requests", failBox(r.error));
    var pending = r.data.filter(function (x) { return x.status === "pending"; });
    var done = r.data.filter(function (x) { return x.status !== "pending"; });
    var link = CFG.siteUrl;
    var code = h("code", { text: link });
    var share = h("section", { class: "panel stack" }, h("h2", { text: t("q_share_title") }), h("p", { class: "mute small", text: t("q_share_text") }),
      h("div", { class: "linkbox" }, code, h("button", { class: "btn sm", type: "button", text: t("copy"), onclick: function () {
        var sel = function () { var rg = document.createRange(); rg.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(rg); };
        try { navigator.clipboard.writeText(link).then(function () { toast(t("copied")); }, sel); } catch (er) { sel(); }
      } })));
    function card(rq) {
      var p = posByCode(rq.position_code);
      var roleSel = h("select", null, ROLES.map(function (x) {
        return h("option", { value: x, selected: x === (p ? p.role : "staff"), text: t("role_" + x) }); }));
      var picks = h("div", { class: "fold-picks" });
      var def = p ? p.folders : [];
      for (var i = 1; i <= 20; i++) picks.appendChild(h("label", { class: i === 15 ? "off" : "", title: i === 15 ? t("locked_long") : null },
        h("input", { type: "checkbox", value: String(i), disabled: i === 15, checked: i !== 15 && def.indexOf(i) >= 0 }), String(i)));
      var instSel = instOptions(h("select", { "aria-label": t("inst_label") }), t("inst_none"));
      instSel.value = rq.institution_id != null ? String(rq.institution_id) : "";
      var instNote = null;
      if (rq.institution_id == null && rq.institution_text) {
        var addBtn = h("button", { class: "btn sm", type: "button", text: t("q_inst_add"), onclick: async function () {
          addBtn.disabled = true;
          var y = await sb.rpc("admin_save_institution", { _id: null, _name: rq.institution_text, _kind: "svp" });
          if (y.error) {
            addBtn.disabled = false;
            toast(/institution_exists/.test(errMsg(y.error)) ? t("inst_exists") : t("err_action", { msg: errMsg(y.error) })); return;
          }
          await loadInstitutions(true);
          instSel.textContent = ""; instOptions(instSel, t("inst_none")); instSel.value = String(y.data);
          addBtn.remove();
        } });
        instNote = h("div", { class: "notice warn small" }, t("q_inst_typed", { x: rq.institution_text }), " ", addBtn);
      }
      var hint = h("p", { class: "mute small", text: p && p.code !== "other" ? t("q_auto", { pos: posTitle(p) }) : t("q_manual") });
      function syncHint() { hint.style.display = roleSel.value === "staff" ? "" : "none"; picks.style.opacity = roleSel.value === "staff" ? "" : ".5"; }
      roleSel.addEventListener("change", syncHint); syncHint();
      var ok = h("button", { class: "btn pri", type: "button", text: t("q_approve") });
      var no = h("button", { class: "btn danger", type: "button", text: t("q_reject") });
      async function decide(approve) {
        ok.disabled = no.disabled = true;
        var folders = Array.from(picks.querySelectorAll("input:checked")).map(function (x) { return +x.value; });
        var x = await sb.rpc("decide_request", { _id: rq.id, _approve: approve, _role: approve ? roleSel.value : null, _folders: approve ? folders : [],
          _institution_id: approve && instSel.value ? +instSel.value : null });
        if (x.error) { ok.disabled = no.disabled = false; toast(t("err_action", { msg: errMsg(x.error) })); return; }
        toast(approve ? t("q_approved") : t("q_rejected")); requestsView();
      }
      ok.addEventListener("click", function () { decide(true); });
      no.addEventListener("click", function () {
        if (!no.classList.contains("armed")) { no.classList.add("armed"); no.textContent = t("q_reject_confirm");
          setTimeout(function () { no.classList.remove("armed"); no.textContent = t("q_reject"); }, 4000); return; }
        decide(false);
      });
      return h("div", { class: "panel stack req" },
        h("div", null, h("b", { text: rq.full_name }), h("div", { class: "sub", text: rq.position }),
          h("div", { class: "sub mono", text: (rq.tg_username ? "@" + rq.tg_username + " · " : "") + (rq.tg_name ? "Telegram: " + rq.tg_name + " · " : "") + fmtDT(rq.created_at) })),
        h("div", { class: "grid-f" }, h("label", { class: "f" }, t("i_role"), roleSel), h("label", { class: "f" }, t("inst_label"), instSel)),
        instNote,
        h("div", { class: "f small" }, h("b", { class: "mute", text: t("u_folders") }), picks, hint),
        h("div", { class: "row" }, ok, no));
    }
    function stLabel(x) {
      if (x.status === "rejected") return h("span", { class: "chip", text: t("q_st_rejected") });
      if (x.used_at) return h("span", { class: "chip ok", text: t("q_st_used") });
      return h("span", { class: "chip acc", text: t("q_st_approved") });
    }
    var hist = !done.length ? h("p", { class: "mute", text: t("q_none_done") }) : h("div", { class: "tbl" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { text: t("u_name") + " / " + t("u_position") }), h("th", { text: t("i_role") }), h("th", { class: "hide-sm", text: t("u_folders") }), h("th"))),
      h("tbody", null, done.map(function (x) {
        return h("tr", null,
          h("td", null, h("b", { text: x.full_name }), h("div", { class: "sub", text: x.position + " · " + fmtDT(x.decided_at || x.created_at) })),
          h("td", { text: x.role ? t("role_" + x.role) : "—" }),
          h("td", { class: "hide-sm mono small", text: (x.folder_ids || []).join(", ") }),
          h("td", null, stLabel(x)));
      }))));
    shell("requests", h("div", { class: "stack" }, share,
      h("section", { class: "stack" }, h("h2", { text: t("q_pending", { n: pending.length }) }),
        pending.length ? pending.map(card) : h("p", { class: "panel mute", text: t("q_none") })),
      h("section", { class: "panel stack" }, h("h3", { text: t("q_done") }), hist)));
  }

  // --- администратор: сотрудники
  function removeButton(u) {
    var b = h("button", { class: "btn sm danger", type: "button", text: t("u_remove") });
    b.addEventListener("click", async function () {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed"); b.textContent = t("u_remove_confirm");
        setTimeout(function () { b.classList.remove("armed"); b.textContent = t("u_remove"); }, 4000);
        return;
      }
      b.disabled = true;
      var x = await sb.rpc("admin_remove_user", { _uid: u.user_id });
      if (x.error) {
        b.disabled = false; b.classList.remove("armed"); b.textContent = t("u_remove");
        var m = errMsg(x.error);
        toast(/cannot_remove_self/.test(m) ? t("u_self") : /last_admin/.test(m) ? t("u_last_admin") : /no_such_user/.test(m) ? t("u_not_found") : t("err_action", { msg: m }));
        return;
      }
      toast(x.data === "deactivated" ? t("u_deactivated") : t("u_removed")); usersView();
    });
    return b;
  }
  async function usersView() {
    var my = renderToken;
    shell("users", loadingBox());
    var r = await sb.rpc("admin_list_users");
    await loadInstitutions(true);
    if (my !== renderToken) return;
    if (r.error) return shell("users", failBox(r.error));
    var rows = r.data.map(function (u) {
      var nameIn = h("input", { type: "text", value: u.full_name || "", maxlength: "200", "aria-label": t("u_name") });
      var posIn = h("input", { type: "text", value: u.user_position || "", maxlength: "200", "aria-label": t("u_position") });
      var save = h("button", { class: "btn sm", type: "button", text: t("save"), onclick: async function () {
        var x = await sb.rpc("admin_update_profile", { _uid: u.user_id, _full_name: nameIn.value, _position: posIn.value });
        toast(x.error ? t("err_action", { msg: errMsg(x.error) }) : t("u_saved"));
      } });
      var roleBoxes = ROLES.map(function (role) {
        var cb = h("input", { type: "checkbox", checked: (u.roles || []).indexOf(role) >= 0 });
        cb.addEventListener("change", async function () {
          var x = await sb.rpc("admin_set_role", { _uid: u.user_id, _role: role, _on: cb.checked });
          if (x.error) { cb.checked = !cb.checked; toast(/last_admin/.test(errMsg(x.error)) ? t("u_last_admin") : t("err_action", { msg: errMsg(x.error) })); }
          else { toast(t("u_saved")); if (u.user_id === S.session.user.id) loadAccess(); }
        });
        return h("label", { class: "check small" }, cb, h("span", { text: t("role_" + role) }));
      });
      var picks = h("div", { class: "fold-picks" });
      for (var i = 1; i <= 20; i++) (function (n) {
        var off = n === 15;
        var cb = h("input", { type: "checkbox", checked: (u.folders || []).indexOf(n) >= 0, disabled: off });
        cb.addEventListener("change", async function () {
          var chosen = Array.from(picks.querySelectorAll("input")).map(function (x, k) { return x.checked ? k + 1 : 0; }).filter(Boolean);
          var x = await sb.rpc("admin_set_folders", { _uid: u.user_id, _folders: chosen });
          if (x.error) { cb.checked = !cb.checked; toast(t("err_action", { msg: errMsg(x.error) })); } else toast(t("u_saved"));
        });
        picks.appendChild(h("label", { class: off ? "off" : "", title: off ? t("locked_long") : null }, cb, String(n)));
      })(i);
      var byPos = h("button", { class: "btn sm", type: "button", text: t("u_by_pos"), onclick: async function () {
        var p = posByText(posIn.value);
        if (!p) { toast(t("u_pos_unknown")); return; }
        if (p.role !== "staff") { toast(t("u_pos_manager")); return; }
        var boxes = Array.from(picks.querySelectorAll("input"));
        var x = await sb.rpc("admin_set_folders", { _uid: u.user_id, _folders: p.folders });
        if (x.error) { toast(t("err_action", { msg: errMsg(x.error) })); return; }
        boxes.forEach(function (cb, k) { cb.checked = p.folders.indexOf(k + 1) >= 0; });
        toast(t("u_pos_applied", { n: p.folders.length }));
      } });
      return h("tr", null,
        h("td", null, h("div", { class: "stack", style: "gap:6px" }, nameIn, posIn, h("div", { class: "row" }, save, removeButton(u))),
          h("div", { class: "sub", text: (u.telegram_username ? "@" + u.telegram_username + " · " : "") + fmtDate(u.created_at) })),
        h("td", null, h("div", { class: "stack", style: "gap:4px" }, roleBoxes)),
        h("td", { style: "min-width:220px" }, picks, h("div", { style: "margin-top:8px" }, byPos)),
        h("td", { style: "min-width:240px" }, scopeEditor(u)));
    });
    shell("users", h("section", { class: "panel stack" }, h("h2", { text: t("u_title") }), h("p", { class: "mute small", text: t("u_folders_hint") }),
      h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("u_name") + " / " + t("u_position") }), h("th", { text: t("u_roles") }), h("th", { text: t("u_folders") }), h("th", { text: t("u_scope") }))),
        h("tbody", null, rows)))));
  }

  // Учреждение сотрудника и область видимости заведующего (по учреждениям и по специальностям)
  var BRANCHES = {
    obst: ["doya_qvp", "akusher_ginekolog", "patronaj_hamshira", "bolalar_ginekologi", "akusherlik_kompleksi", "reproduktiv_markaz", "bosh_akusher", "skrining_markazi"],
    child: ["pediatr", "neonatolog", "emlash_xonasi", "maktab_mtm_hamshira", "bosh_pediatr"]
  };
  function scopeEditor(u) {
    var insts = S.institutions || [];
    var mine = h("select", { "aria-label": t("inst_label") });
    instOptions(mine, t("inst_none")); mine.value = u.institution_id != null ? String(u.institution_id) : "";
    mine.addEventListener("change", async function () {
      var x = await sb.rpc("admin_set_institution", { _uid: u.user_id, _inst: mine.value ? +mine.value : null });
      toast(x.error ? t("err_action", { msg: errMsg(x.error) }) : t("u_saved"));
    });
    var chosenI = (u.scope_institutions || []).slice(), chosenP = (u.scope_positions || []).slice();
    function count() { return chosenI.length + chosenP.length; }
    var sum = h("summary", { style: "cursor:pointer;font-weight:700", text: t("u_scope_sum", { n: count() }) });
    var instBoxes = h("div", { class: "fold-picks wide" }, insts.map(function (i) {
      var cb = h("input", { type: "checkbox", value: String(i.id), checked: chosenI.indexOf(i.id) >= 0 });
      return h("label", null, cb, i.name);
    }));
    var posBoxes = h("div", { class: "fold-picks wide" }, posList().filter(function (p) { return p.code !== "other"; }).map(function (p) {
      var cb = h("input", { type: "checkbox", value: p.code, checked: chosenP.indexOf(p.code) >= 0 });
      return h("label", null, cb, posTitle(p));
    }));
    function setPos(codes) { Array.from(posBoxes.querySelectorAll("input")).forEach(function (cb) { cb.checked = codes.indexOf(cb.value) >= 0; }); }
    var save = h("button", { class: "btn sm pri", type: "button", text: t("save"), onclick: async function () {
      var ii = Array.from(instBoxes.querySelectorAll("input:checked")).map(function (x) { return +x.value; });
      var pp = Array.from(posBoxes.querySelectorAll("input:checked")).map(function (x) { return x.value; });
      save.disabled = true;
      var x = await sb.rpc("admin_set_scopes", { _uid: u.user_id, _institutions: ii, _positions: pp });
      save.disabled = false;
      if (x.error) { toast(t("err_action", { msg: errMsg(x.error) })); return; }
      chosenI = ii; chosenP = pp; sum.textContent = t("u_scope_sum", { n: count() }); toast(t("u_saved"));
      if (u.user_id === S.session.user.id) loadAccess();
    } });
    return h("div", { class: "stack", style: "gap:8px" },
      h("label", { class: "f small" }, t("inst_label"), mine),
      h("details", null, sum,
        h("div", { class: "stack", style: "margin-top:8px;gap:8px" },
          h("p", { class: "mute small", text: t("u_scope_hint") }),
          insts.length ? [h("b", { class: "small mute", text: t("u_scope_inst") }), instBoxes] : h("p", { class: "mute small", text: t("inst_empty") }),
          h("b", { class: "small mute", text: t("u_scope_pos") }),
          h("div", { class: "row" },
            h("button", { class: "btn sm", type: "button", text: t("u_scope_obst"), onclick: function () { setPos(BRANCHES.obst); } }),
            h("button", { class: "btn sm", type: "button", text: t("u_scope_child"), onclick: function () { setPos(BRANCHES.child); } }),
            h("button", { class: "btn sm", type: "button", text: t("u_scope_clear"), onclick: function () { setPos([]); } })),
          posBoxes, h("div", null, save))));
  }

  // --- администратор: учреждения
  var KINDS = ["svp", "hospital", "external", "other"];
  async function institutionsView() {
    var my = renderToken;
    shell("institutions", loadingBox());
    var u = await sb.rpc("admin_list_users");
    await loadInstitutions(true);
    if (my !== renderToken) return;
    var cnt = {}; (u.data || []).forEach(function (x) { if (x.institution_id != null) cnt[x.institution_id] = (cnt[x.institution_id] || 0) + 1; });
    function kindSel(v) { var s = h("select", { "aria-label": t("inst_kind") }, KINDS.map(function (k) { return h("option", { value: k, text: t("inst_kind_" + k) }); })); s.value = v; return s; }
    function errText(e) {
      var m = errMsg(e);
      return /institution_exists/.test(m) ? t("inst_exists") : /bad_name/.test(m) ? t("inst_bad_name") : t("err_action", { msg: m });
    }
    var rows = (S.institutions || []).map(function (i) {
      var nameIn = h("input", { type: "text", value: i.name, maxlength: "120", "aria-label": t("inst_label") }), ks = kindSel(i.kind);
      var save = h("button", { class: "btn sm", type: "button", text: t("save"), onclick: async function () {
        var x = await sb.rpc("admin_save_institution", { _id: i.id, _name: nameIn.value, _kind: ks.value });
        if (x.error) { toast(errText(x.error)); return; }
        toast(t("u_saved")); institutionsView();
      } });
      var del = h("button", { class: "btn sm danger", type: "button", text: t("del") });
      del.addEventListener("click", async function () {
        if (!del.classList.contains("armed")) {
          del.classList.add("armed"); del.textContent = t("del_confirm");
          setTimeout(function () { del.classList.remove("armed"); del.textContent = t("del"); }, 4000); return;
        }
        del.disabled = true;
        var x = await sb.rpc("admin_delete_institution", { _id: i.id });
        if (x.error) { del.disabled = false; toast(t("err_action", { msg: errMsg(x.error) })); return; }
        toast(t("inst_deleted")); institutionsView();
      });
      return h("tr", null, h("td", null, nameIn), h("td", null, ks),
        h("td", { class: "num", text: String(cnt[i.id] || 0) }), h("td", null, h("div", { class: "row" }, save, del)));
    });
    var oneIn = h("input", { type: "text", maxlength: "120", "aria-label": t("inst_label") }), oneKind = kindSel("svp");
    var oneForm = h("form", { class: "row" }, oneIn, oneKind, h("button", { class: "btn pri", type: "submit", text: t("inst_add") }));
    oneForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var x = await sb.rpc("admin_save_institution", { _id: null, _name: oneIn.value, _kind: oneKind.value });
      if (x.error) { toast(errText(x.error)); return; }
      toast(t("inst_added")); institutionsView();
    });
    var bulk = h("textarea", { rows: "6", placeholder: t("inst_bulk_ph"), "aria-label": t("inst_bulk") }), bulkKind = kindSel("svp");
    var bulkForm = h("form", { class: "stack" }, h("label", { class: "f" }, t("inst_bulk"), bulk),
      h("div", { class: "row" }, bulkKind, h("button", { class: "btn pri", type: "submit", text: t("inst_bulk_btn") })));
    bulkForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var names = Array.from(new Set(bulk.value.split(/\r?\n/).map(function (x) { return x.trim().replace(/\s+/g, " "); }).filter(function (x) { return x.length >= 2; })));
      if (!names.length) return;
      var x = await sb.rpc("admin_add_institutions", { _names: names, _kind: bulkKind.value });
      if (x.error) { toast(errText(x.error)); return; }
      toast(t("inst_bulk_done", { n: x.data, m: names.length })); institutionsView();
    });
    shell("institutions", h("div", { class: "stack" },
      h("section", { class: "panel stack" }, h("h2", { text: t("inst_title") }), h("p", { class: "mute small", text: t("inst_hint") }), oneForm,
        h("details", null, h("summary", { style: "cursor:pointer;font-weight:700", text: t("inst_bulk") }), h("div", { style: "margin-top:8px" }, bulkForm))),
      h("section", { class: "panel stack" }, h("h3", { text: t("inst_list", { n: rows.length }) }),
        rows.length ? h("div", { class: "tbl" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { text: t("inst_label") }), h("th", { text: t("inst_kind") }), h("th", { text: t("inst_people") }), h("th"))),
          h("tbody", null, rows))) : h("p", { class: "mute", text: t("inst_empty") }))));
  }

  // --- администратор: приглашения
  async function invitesView() {
    var my = renderToken;
    shell("invites", loadingBox());
    var r = await sb.from("invites").select("id, role, full_name, position, folder_ids, created_at, expires_at, used_at, revoked_at").order("created_at", { ascending: false }).limit(200);
    if (my !== renderToken) return;
    var nameIn = h("input", { type: "text", maxlength: "200" });
    var posSel = h("select", { "aria-label": t("u_position") }, h("option", { value: "", text: t("i_pos_pick") }),
      posList().map(function (p) { return h("option", { value: p.code, text: posTitle(p) }); }));
    var posIn = h("input", { type: "text", maxlength: "200", placeholder: t("i_pos_other"), style: "display:none", "aria-label": t("i_pos_other") });
    var roleSel = h("select", null, ROLES.map(function (x) { return h("option", { value: x, selected: x === "staff", text: t("role_" + x) }); }));
    var daysIn = h("input", { type: "number", min: "1", max: "14", value: "3" });
    await loadInstitutions(true);
    if (my !== renderToken) return;
    var instSel = instOptions(h("select", { "aria-label": t("inst_label") }), t("inst_none"));
    var picks = h("div", { class: "fold-picks" });
    for (var i = 1; i <= 20; i++) picks.appendChild(h("label", { class: i === 15 ? "off" : "" }, h("input", { type: "checkbox", value: String(i), disabled: i === 15 }), String(i)));
    var out = h("div"), autoNote = h("p", { class: "mute small" });
    posSel.addEventListener("change", function () {
      var p = posByCode(posSel.value);
      posIn.style.display = posSel.value === "other" ? "" : "none";
      autoNote.textContent = "";
      if (!p) return;
      roleSel.value = p.role;
      Array.from(picks.querySelectorAll("input")).forEach(function (cb) { cb.checked = p.role === "staff" && p.folders.indexOf(+cb.value) >= 0; });
      if (p.code !== "other") autoNote.textContent = t("i_auto");
    });
    var btn = h("button", { class: "btn pri", type: "submit", text: t("i_create") });
    var form = h("form", { class: "stack" },
      h("div", { class: "grid-f" }, h("label", { class: "f" }, t("u_name"), nameIn), h("label", { class: "f" }, t("u_position"), posSel, posIn),
        h("label", { class: "f" }, t("i_role"), roleSel), h("label", { class: "f" }, t("inst_label"), instSel), h("label", { class: "f" }, t("i_days"), daysIn)),
      h("div", { class: "f small" }, h("b", { class: "mute", text: t("u_folders") }), picks, h("span", { class: "mute small", text: t("u_folders_hint") }), autoNote),
      h("div", null, btn), out);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      btn.disabled = true;
      var folders = Array.from(picks.querySelectorAll("input:checked")).map(function (x) { return +x.value; });
      var days = Math.min(14, Math.max(1, parseInt(daysIn.value, 10) || 3));
      var sp = posByCode(posSel.value), posText = !sp ? "" : sp.code === "other" ? posIn.value.trim() : sp.ru;
      var x = await sb.rpc("create_invite", { _role: roleSel.value, _full_name: nameIn.value, _position: posText, _folders: folders, _days: days, _institution_id: instSel.value ? +instSel.value : null });
      btn.disabled = false;
      out.textContent = "";
      if (x.error || !x.data) { out.appendChild(h("div", { class: "notice bad", text: t("err_action", { msg: errMsg(x.error) }) })); return; }
      var link = CFG.siteUrl + "?invite=" + x.data;
      var code = h("code", { text: link });
      out.appendChild(h("div", { class: "stack" }, h("div", { class: "notice ok", text: t("i_ready") }),
        h("div", { class: "linkbox" }, code, h("button", { class: "btn sm", type: "button", text: t("copy"), onclick: function () {
          var sel = function () { var rg = document.createRange(); rg.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(rg); };
          try { navigator.clipboard.writeText(link).then(function () { toast(t("copied")); }, sel); } catch (er) { sel(); }
        } }))));
      nameIn.value = ""; posIn.value = ""; posSel.value = ""; instSel.value = ""; posIn.style.display = "none"; autoNote.textContent = "";
      reloadList();
    });
    var listBox = h("div");
    function inviteStatus(iv) {
      if (iv.revoked_at) return h("span", { class: "chip", text: t("st_revoked") });
      if (iv.used_at) return h("span", { class: "chip ok", text: t("st_used") });
      if (new Date(iv.expires_at) < new Date()) return h("span", { class: "chip warn", text: t("st_expired") });
      return h("span", { class: "chip acc", text: t("st_active", { d: fmtDT(iv.expires_at) }) });
    }
    function drawList(data) {
      listBox.textContent = "";
      listBox.appendChild(h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("i_for") }), h("th", { text: t("i_role") }), h("th", { class: "hide-sm", text: t("u_folders") }), h("th"), h("th"))),
        h("tbody", null, data.map(function (iv) {
          var active = !iv.revoked_at && !iv.used_at && new Date(iv.expires_at) > new Date();
          return h("tr", null,
            h("td", null, h("b", { text: iv.full_name || "—" }), h("div", { class: "sub", text: (iv.position || "") + " · " + fmtDT(iv.created_at) })),
            h("td", { text: t("role_" + iv.role) }),
            h("td", { class: "hide-sm mono small", text: (iv.folder_ids || []).join(", ") }),
            h("td", null, inviteStatus(iv)),
            h("td", null, active ? h("button", { class: "btn sm danger", type: "button", text: t("revoke"), onclick: async function () {
              var y = await sb.rpc("revoke_invite", { _id: iv.id });
              if (y.error) toast(t("err_action", { msg: errMsg(y.error) })); else reloadList();
            } }) : null));
        })))));
    }
    async function reloadList() {
      var y = await sb.from("invites").select("id, role, full_name, position, folder_ids, created_at, expires_at, used_at, revoked_at").order("created_at", { ascending: false }).limit(200);
      if (y.error) { listBox.textContent = ""; listBox.appendChild(failBox(y.error)); } else drawList(y.data);
    }
    if (r.error) listBox.appendChild(failBox(r.error)); else drawList(r.data);
    shell("invites", h("div", { class: "stack" },
      h("section", { class: "panel stack" }, h("h2", { text: t("i_title") }), form),
      h("section", { class: "panel stack" }, h("h3", { text: t("i_list") }), listBox)));
  }

  // --- администратор: журнал
  async function logView() {
    var my = renderToken;
    shell("log", loadingBox());
    var r = await sb.from("audit_log").select("at, actor, action, object, details").order("at", { ascending: false }).limit(200);
    var u = await sb.rpc("admin_list_users");
    if (my !== renderToken) return;
    if (r.error) return shell("log", failBox(r.error));
    var names = {}; (u.data || []).forEach(function (x) { names[x.user_id] = x.full_name || ("@" + (x.telegram_username || "?")); });
    shell("log", h("section", { class: "panel stack" }, h("h2", { text: t("l_title") }),
      h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("l_when") }), h("th", { text: t("l_who") }), h("th", { text: t("l_what") }))),
        h("tbody", null, r.data.map(function (e) {
          var d = e.details || {};
          var extra = d.title ? "«" + d.title + "»" + (d.folder ? " · " + t("folder_no", { n: d.folder }) : "")
            : d.role ? t("role_" + d.role) + (d.name ? " · " + d.name : "")
            : d.folders ? (d.folders || []).join(", ") : "";
          var target = e.object && names[e.object] && e.object !== e.actor ? " → " + names[e.object] : "";
          return h("tr", null, h("td", { class: "mono small", text: fmtDT(e.at) }),
            h("td", { text: names[e.actor] || "—" }),
            h("td", null, t("a_" + e.action), h("div", { class: "sub", text: extra + target })));
        }))))));
  }

  // ------------------------------------------------------------------ start
  document.documentElement.lang = S.lang === "uz" ? "uz-Cyrl" : "ru";
  window.addEventListener("hashchange", function () { if (S.session && S.roleState === "ok") render(); });
  sb.auth.onAuthStateChange(function (event, session) {
    // без await внутри обработчика: работа откладывается, чтобы не блокировать клиент Supabase
    setTimeout(function () {
      if (event === "SIGNED_OUT") { resetUser(); render(); return; }
      if (event === "TOKEN_REFRESHED" && session) { S.session = session; return; }
      if (session) onSession(session);
    }, 0);
  });
  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session) onSession(r.data.session); else render();
  }, function () { render(); });
})();
