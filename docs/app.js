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
    lang: (function () { var l = store("ovabmk-lang"); return l === "uz" || l === "uzl" ? l : "ru"; })(),
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
    var L = S.lang === "uzl" ? "uz" : S.lang, own = window.I18N[L] && window.I18N[L][k];
    var s = own || window.I18N.ru[k] || k;
    if (own && S.lang === "uzl") s = window.uzLat(s);
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
  function fmtDate(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString(S.lang === "uz" ? "uz-Cyrl" : S.lang === "uzl" ? "uz-Latn" : "ru-RU"); }
  function fmtDT(s) { var d = new Date(s); return isNaN(d) ? "" : d.toLocaleString(S.lang === "uz" ? "uz-Cyrl" : S.lang === "uzl" ? "uz-Latn" : "ru-RU", { dateStyle: "short", timeStyle: "short" }); }
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
  var LANGTAG = { ru: "ru", uz: "uz-Cyrl", uzl: "uz-Latn" };
  function uzT(x) { return S.lang === "uzl" ? window.uzLat(x) : x; }
  function posTitle(p) { return S.lang === "ru" ? p.ru : uzT(p.uz); }
  function folderTitle(f) { return S.lang === "ru" ? f.title_ru : uzT(f.title_uz); }
  function folderSub(f) { return S.lang === "ru" ? uzT(f.title_uz) : f.title_ru; }

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
        await loadBadges();
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
      ["ru", "uz", "uzl"].map(function (l) {
        return h("button", { type: "button", class: S.lang === l ? "on" : "", "aria-pressed": S.lang === l ? "true" : "false",
          onclick: function () { S.lang = l; store("ovabmk-lang", l); document.documentElement.lang = LANGTAG[l]; render(); },
          text: l === "ru" ? "Рус" : l === "uz" ? "Ўзб" : "O\u02bbzb" });
      }));
  }
  function nav(cur) {
    var items = [["#/overview", "nav_overview", "overview"], ["#/folders", "nav_folders", "folders"], ["#/due", "nav_due", "due"], ["#/indicators", "nav_ind", "ind"],
      ["#/pregnant", "nav_preg", "pregnant"], ["#/broadcasts", "nav_bc", "broadcasts", "bc"], ["#/tasks", "nav_tasks", "tasks", "tk"], ["#/leaves", "nav_leaves", "leaves", "lv"], ["#/offline", "nav_offline", "offline"]];
    if (canSummary()) items.push(["#/mahallas", "nav_mah", "mahallas"], ["#/indicators/summary", "nav_indsum", "indsum"]);
    if (isAdmin()) items.push(["#/admin/requests", "nav_requests", "requests"], ["#/admin/users", "nav_users", "users"], ["#/admin/institutions", "nav_inst", "institutions"], ["#/admin/invites", "nav_invites", "invites"], ["#/admin/log", "nav_log", "log"]);
    return h("nav", { class: "nav", "aria-label": "Menu" }, items.map(function (i) {
      var n = i[3] && S.badge ? S.badge[i[3]] : 0;
      return h("a", { href: i[0], "aria-current": cur === i[2] ? "page" : null }, t(i[1]), n ? h("span", { class: "nbadge", text: String(n) }) : null);
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
    if ((m = /^\/folder\/(\d{1,2})(?:\/(\d{1,2}\.\d{1,2}))?$/.exec(route))) return folderView(+m[1], m[2]);
    if (route === "/due") return dueView();
    if (route === "/folders") return foldersView();
    if (route === "/indicators") return indicatorsView();
    if (route === "/indicators/summary") return canSummary() ? indSummaryView() : forbidden("indsum");
    if (route === "/pregnant") return pregnantView();
    if (route === "/broadcasts") return broadcastsView();
    if (route === "/tasks") return tasksView();
    if (route === "/leaves") return leavesView();
    if (route.indexOf("/offline") === 0) { var pq = /[?&]pub=([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})/.exec(route); if (pq) return registerPub(pq[1], pq[2]); return offlineView(); }
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
    s.setAttribute("data-lang", S.lang === "ru" ? "ru" : "uz");
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
          h("label", { class: "indlab", for: "ind" + i.n }, h("span", { class: "no", text: i.n + "." }), h("span", null, h("b", { text: i.ru }), h("span", { class: "sub", text: uzT(i.uz) }))),
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
    var subN = {}; try { (await loadSubs()).forEach(function (x) { subN[x.folder_id] = (subN[x.folder_id] || 0) + 1; }); } catch (e) {}
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
            : open ? [h("span", { class: "chip", text: t("docs_count", { n: counts[fd.id] || 0 }) }), subN[fd.id] ? h("span", { class: "chip", text: t("sf_count", { n: subN[fd.id] }) }) : null]
            : h("span", { class: "chip", text: t("no_access") })),
        open && !fd.restricted ? h("div", { class: "fc-m", "aria-hidden": "true" }, CH.meter((counts[fd.id] || 0) * 100 / mxc, { tone: (counts[fd.id] || 0) ? "acc" : "mute" })) : null
      ];
      if (fd.restricted) return h("div", { class: "fcard locked", title: t("locked_long") }, inner);
      if (!open) return h("div", { class: "fcard dim" }, inner);
      return h("a", { class: "fcard", href: "#/folder/" + fd.id }, inner);
    })));
  }

  // --- одна папка: подпапки (разделы) и документы без подпапки
  async function folderView(id, openSub) {
    var my = renderToken;
    if (openSub) SF_OPEN[openSub] = true;
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

    var subs = [], marks = [], people = [];
    try { subs = (await loadSubs()).filter(function (x) { return x.folder_id === id; }); } catch (e) { subs = []; }
    var d = await sb.from("documents").select("id, title, doc_number, doc_date, note, storage_path, file_name, file_size, uploaded_by, created_at, subfolder_id, period_key")
      .eq("folder_id", id).order("created_at", { ascending: false });
    if (subs.length) {
      var mk = await sb.from("subfolder_marks").select("subfolder_id, period_key, user_id, value, submitted_at, paper_at").in("subfolder_id", subs.map(function (x) { return x.id; }));
      marks = mk.data || [];
      if (isManager()) { try { people = await loadPeople(); } catch (e) { people = []; } }
    }
    if (my !== renderToken) return;
    var names = {};
    if (!d.error && d.data.length) {
      var ids = Array.from(new Set(d.data.map(function (x) { return x.uploaded_by; })));
      var p = await sb.from("profiles").select("id, full_name").in("id", ids);
      (p.data || []).forEach(function (x) { names[x.id] = x.full_name; });
      if (my !== renderToken) return;
    }
    if (d.error) return shell("folders", h("div", { class: "stack" }, back, head, failBox(d.error)));
    var docs = d.data || [];
    var ctx = { subs: subs, docs: docs, names: names, people: people, dm: subDoneMap(docs, marks), reload: function () { folderView(id); } };
    var other = docs.filter(function (x) { return !x.subfolder_id; });
    var subPanel = !subs.length ? null : h("section", { class: "panel stack" },
      h("h3", { text: t("sf_title", { n: subs.length }) }), h("p", { class: "small mute", text: t("sf_hint") }),
      h("div", { class: "stack sf-list" }, subs.map(function (s) { return subItem(f, s, ctx); })));
    var list = !other.length ? h("p", { class: "mute", text: t("empty") }) : docTable(other, ctx, id);
    shell("folders", h("div", { class: "stack" }, back, head, subPanel,
      h("section", { class: "panel stack" }, h("h3", { text: subs.length ? t("sf_other_docs") : t("docs") }), list),
      uploadForm(id), bulkForm(id)));
    if (openSub) { var el = document.getElementById("sf-" + openSub); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" }); }
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

  function uploadForm(folderId, sub, ctx) {
    var cyc = sub ? periodSelect(sub, ctx.dm, S.session.user.id) : null;
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
        cyc ? h("label", { class: "f" }, t("sf_cycle"), cyc) : null,
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
        mime_type: (fl.type || "").slice(0, 150) || null, no_patient_data: true, uploaded_by: S.session.user.id,
        subfolder_id: sub ? sub.id : null, period_key: cyc ? cyc.value : null
      });
      if (ins.error) { await sb.storage.from("documents").remove([path]); btn.disabled = false; btn.textContent = t("save"); msg.appendChild(h("div", { class: "notice bad", text: subErr(ins.error) })); return; }
      toast(t("added")); folderView(folderId);
    });
    return h("details", { class: sub ? "sf-up" : "panel" }, h("summary", { style: "cursor:pointer;font-weight:800;color:var(--head)", text: t(sub ? "sf_upload" : "add_doc") }),
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

  // ------------------------------------------------------------------ подпапки (разделы папок-дел)
  // Названия подпапок: русский и узбекский латиницей (узбекской кириллицы у подпапок нет).
  // Цикл сдачи обозначается датой срока: ежемесячно — 5 число, ежеквартально — 10 число первого месяца квартала, ежегодно — 15 января.
  var SUB_START = "2026-11-01";   // более ранние сроки не считаются просроченными (подпапки запущены 25.10.2026)
  var SUBS = null, SF_OPEN = {}, DUE = { folder: "", missing: true };
  async function loadSubs(force) {
    if (SUBS && !force) return SUBS;
    var r = await sb.from("subfolders").select("id, folder_id, no, title_uz, title_ru, storage, positions, period, paper, note_ru");
    if (r.error) throw r.error;
    SUBS = (r.data || []).slice().sort(function (a, b) { return a.folder_id - b.folder_id || a.no - b.no; });
    return SUBS;
  }
  function subTitle(s) { return S.lang === "ru" ? s.title_ru : s.title_uz; }
  function subOther(s) { return S.lang === "ru" ? s.title_uz : s.title_ru; }
  function subPeriodic(s) { return s.period === "month" || s.period === "quarter" || s.period === "year"; }
  function fmtD(s) { return s && s.length === 10 ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : ""; }
  function subDues(period, from, to) {
    var out = [];
    for (var y = +from.slice(0, 4) - 1; y <= +to.slice(0, 4) + 1; y++) {
      if (period === "month") for (var m = 1; m <= 12; m++) out.push(y + "-" + p2(m) + "-05");
      else if (period === "quarter") [1, 4, 7, 10].forEach(function (q) { out.push(y + "-" + p2(q) + "-10"); });
      else if (period === "year") out.push(y + "-01-15");
    }
    return out.filter(function (d) { return d >= from && d <= to; });
  }
  function subLast(s) {   // последний прошедший срок (день срока ещё не просрочен)
    if (!subPeriodic(s)) return "";
    var t0 = todayS(), l = subDues(s.period, addDays(t0, -400), addDays(t0, -1)), d = l[l.length - 1] || "";
    return d >= SUB_START ? d : "";
  }
  function subNext(s) { if (!subPeriodic(s)) return ""; var t0 = todayS(); return subDues(s.period, t0, addDays(t0, 400))[0] || ""; }
  function subAfter(s, d) { return d ? subDues(s.period, addDays(d, 1), addDays(d, 400))[0] || "" : ""; }
  function perText(s) { var n = subNext(s); return t("sf_per_" + s.period) + (n ? " · " + t("sf_next", { d: fmtD(n) }) : ""); }
  function storageChip(s) { return h("span", { class: "chip " + (s.storage === "site" ? "ok" : s.storage === "numbers" ? "warn" : "bad"), text: t("sf_st_" + s.storage) }); }
  function subErr(e) {
    var m = errMsg(e), k = /(subfolder_no_files|period_required|value_required)/.exec(m);
    return k ? t("err_" + k[1]) : /forbidden/.test(m) ? t("err_sub_forbidden") : t("err_action", { msg: m });
  }
  // Кто что сдал: ключ «подпапка|срок» → { id сотрудника: { files, mark, value, paper, at } }
  function subDoneMap(docs, marks) {
    var m = {};
    function get(k, uid) { m[k] = m[k] || {}; return (m[k][uid] = m[k][uid] || {}); }
    docs.forEach(function (d) {
      if (!d.subfolder_id) return;
      var x = get(d.subfolder_id + "|" + (d.period_key || ""), d.uploaded_by);
      x.files = (x.files || 0) + 1; if (!x.at || d.created_at > x.at) x.at = d.created_at;
    });
    marks.forEach(function (r) {
      var x = get(r.subfolder_id + "|" + r.period_key, r.user_id);
      if (r.submitted_at) { x.mark = true; x.value = r.value; if (!x.at || r.submitted_at > x.at) x.at = r.submitted_at; }
      if (r.paper_at) x.paper = r.paper_at;
    });
    return m;
  }
  function isDone(x) { return !!(x && (x.files || x.mark || x.paper)); }
  function doneBy(dm, s, key, uid) { return isDone((dm[s.id + "|" + key] || {})[uid]); }
  function myPosCodes() {
    var c = [], p = S.profile && posByText(S.profile.position);
    if (p) c.push(p.code);
    if (S.roles.indexOf("deputy") >= 0 || S.roles.indexOf("admin") >= 0) c.push("orinbosar");
    return c;
  }
  function isMySub(s) { var c = myPosCodes(); return (s.positions || []).some(function (p) { return c.indexOf(p) >= 0; }); }
  function subMyState(s, dm, uid) {
    if (s.period === "incoming" || s.period === "case") return { tone: "", text: t("sf_per_" + s.period), order: 3 };
    if (s.period === "once") return doneBy(dm, s, "once", uid) ? { tone: "ok", text: "✓ " + t("sf_done"), order: 4 } : { tone: "warn", text: t("sf_not_yet"), order: 1 };
    var L = subLast(s), N = subNext(s);
    if (L && !doneBy(dm, s, L, uid)) return { tone: "bad", text: t("sf_overdue", { d: fmtD(L) }), order: 0 };
    if (N && doneBy(dm, s, N, uid)) return { tone: "ok", text: "✓ " + t("sf_done_for", { d: fmtD(N) }), order: 4 };
    return { tone: N && dayDiff(N, todayS()) <= 5 ? "warn" : "", text: t("sf_until", { d: fmtD(N) }), order: N && dayDiff(N, todayS()) <= 5 ? 1 : 2 };
  }
  function periodSelect(s, dm, uid) {
    if (!subPeriodic(s)) return null;
    var L = subLast(s), N = subNext(s), opts = (L ? [L] : []).concat([N, subAfter(s, N)]).filter(Boolean);
    var sel = h("select", { "aria-label": t("sf_cycle") }, opts.map(function (d) { return h("option", { value: d, text: t("sf_cycle_opt", { d: fmtD(d) }) }); }));
    sel.value = L && !doneBy(dm, s, L, uid) ? L : N;
    return sel;
  }
  function subKey(s, sel) { return sel ? sel.value : s.period === "once" ? "once" : todayS(); }
  // Люди (только руководителям): профиль, коды должности, открытые папки.
  async function loadPeople() {
    var rs = await Promise.all([sb.from("profiles").select("id, full_name, position, removed_at"), sb.from("user_roles").select("user_id, role"),
      sb.from("folder_members").select("folder_id, user_id")]);
    var roles = {}, fold = {};
    (rs[1].data || []).forEach(function (x) { (roles[x.user_id] = roles[x.user_id] || []).push(x.role); });
    (rs[2].data || []).forEach(function (x) { (fold[x.user_id] = fold[x.user_id] || {})[x.folder_id] = 1; });
    return (rs[0].data || []).filter(function (p) { return !p.removed_at && roles[p.id]; }).map(function (p) {
      var r = roles[p.id], pos = posByText(p.position), codes = pos ? [pos.code] : [];
      if (r.indexOf("deputy") >= 0 || r.indexOf("admin") >= 0) codes.push("orinbosar");
      return { id: p.id, name: p.full_name || "—", codes: codes, mgr: r.some(function (x) { return x !== "staff"; }), folders: fold[p.id] || {} };
    });
  }
  function expectedFor(s, people) {
    return people.filter(function (u) { return (s.positions || []).some(function (c) { return u.codes.indexOf(c) >= 0; }) && (u.mgr || u.folders[s.folder_id]); });
  }
  function posName(c) { var p = posByCode(c); return p ? posTitle(p) : c; }

  // Подпапка на странице папки: свёрнутый блок, внутри — кто сдаёт, файлы, отметка, контроль руководителя.
  function subItem(f, s, ctx) {
    var uid = S.session.user.id, mine = isMySub(s), st = subMyState(s, ctx.dm, uid);
    var sdocs = ctx.docs.filter(function (d) { return d.subfolder_id === s.id; });
    var body = h("div", { class: "stack sf-body" });
    var det = h("details", { class: "sf" + (mine ? " mine" : ""), id: "sf-" + s.id },
      h("summary", { class: "sf-sum" },
        h("span", { class: "sf-no", text: s.id }),
        h("span", { class: "sf-t" }, h("b", { text: subTitle(s) }), h("span", { class: "small mute", text: subOther(s) })),
        h("span", { class: "sf-chips" }, storageChip(s),
          mine ? h("span", { class: "chip " + st.tone, text: st.text }) : h("span", { class: "chip", text: perText(s) }),
          sdocs.length ? h("span", { class: "chip acc", text: t("sf_files", { n: sdocs.length }) }) : null)),
      body);
    function fill() {
      if (body.childNodes.length) return;
      add(body, [
        h("div", { class: "small" },
          h("div", null, h("b", { text: t("sf_who") + ": " }), (s.positions || []).map(posName).join(", ") || "—"),
          h("div", null, h("b", { text: t("sf_set_period") + ": " }), perText(s)),
          h("div", { text: t(s.paper ? "sf_paper_yes" : "sf_paper_no") }),
          s.note_ru ? h("div", { class: "mute", text: s.note_ru }) : null),
        h("div", { class: "notice " + (s.storage === "site" ? "ok" : "warn"), text: t("sf_" + s.storage + "_hint") })]);
      if (s.storage === "site") {
        body.appendChild(h("h4", { text: t("sf_docs") }));
        body.appendChild(sdocs.length ? docTable(sdocs, ctx, f.id) : h("p", { class: "mute small", text: t("sf_no_docs") }));
        body.appendChild(uploadForm(f.id, s, ctx));
      } else body.appendChild(markForm(s, ctx));
      if (isManager()) { var pt = peopleTable(s, ctx); if (pt) body.appendChild(pt); }
      if (isAdmin()) body.appendChild(subSettings(s, ctx));
    }
    det.addEventListener("toggle", function () { SF_OPEN[s.id] = det.open; if (det.open) fill(); });
    if (SF_OPEN[s.id]) { det.open = true; fill(); }
    return det;
  }

  function markForm(s, ctx) {
    var uid = S.session.user.id, sel = periodSelect(s, ctx.dm, uid);
    var val = s.storage === "numbers" ? h("input", { type: "number", min: "0", max: "1000000", step: "1", inputmode: "numeric" }) : null;
    var cur = h("div"), msg = h("div");
    var btn = h("button", { class: "btn pri", type: "submit", text: t(s.storage === "numbers" ? "sf_mark_num" : "sf_mark_paper") });
    function showCur() {
      cur.textContent = ""; if (val) val.value = "";
      var key = subKey(s, sel), x = (ctx.dm[s.id + "|" + key] || {})[uid];
      if (!x || !(x.mark || x.paper)) return;
      if (val && x.value != null) val.value = x.value;
      cur.appendChild(h("div", { class: "notice ok row" },
        h("span", { text: (x.mark ? t("sf_marked", { d: fmtDT(x.at) }) : "") + (x.value != null ? " · " + t("sf_value", { n: x.value }) : "") + (x.paper ? " · " + t("sf_paper_got") : "") }),
        x.mark && !x.paper ? h("button", { class: "btn sm", type: "button", text: t("sf_unmark"), onclick: async function () {
          var r = await sb.rpc("subfolder_unreport", { _sub: s.id, _period: key });
          if (r.error) toast(subErr(r.error)); else { toast(t("saved")); ctx.reload(); }
        } }) : null));
    }
    if (sel) sel.addEventListener("change", showCur);
    var form = h("form", { class: "stack", novalidate: true },
      h("div", { class: "grid-f" },
        sel ? h("label", { class: "f" }, t("sf_cycle"), sel) : null,
        val ? h("label", { class: "f" }, t("sf_value_label"), val) : null),
      cur, msg, h("div", null, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.textContent = "";
      if (val && (val.value === "" || !(+val.value >= 0))) { msg.appendChild(h("div", { class: "notice bad", text: t("sf_need_value") })); return; }
      btn.disabled = true;
      var r = await sb.rpc("subfolder_report", { _sub: s.id, _period: subKey(s, sel), _value: val ? Math.round(+val.value) : null });
      btn.disabled = false;
      if (r.error) { msg.appendChild(h("div", { class: "notice bad", text: subErr(r.error) })); return; }
      toast(t("saved")); ctx.reload();
    });
    showCur();
    return form;
  }

  function peopleTable(s, ctx) {
    var keys = subPeriodic(s) ? [subLast(s), subNext(s)].filter(Boolean) : s.period === "once" ? ["once"] : [];
    if (!keys.length) return null;   // «по поступлению» и «по случаю» — без контроля сроков
    var exp = expectedFor(s, ctx.people), canPaper = S.roles.indexOf("admin") >= 0 || S.roles.indexOf("deputy") >= 0;
    var sel = h("select", { "aria-label": t("sf_cycle") }, keys.map(function (k) { return h("option", { value: k, text: k === "once" ? t("sf_per_once") : t("sf_cycle_opt", { d: fmtD(k) }) }); }));
    var box = h("div", { class: "stack" });
    function draw() {
      box.textContent = "";
      var k = sel.value, map = ctx.dm[s.id + "|" + k] || {}, rows = exp.slice();
      Object.keys(map).forEach(function (id) {
        if (rows.some(function (u) { return u.id === id; })) return;
        var u = ctx.people.filter(function (p) { return p.id === id; })[0]; if (u) rows.push(u);
      });
      if (!rows.length) { box.appendChild(h("p", { class: "mute small", text: t("sf_nobody") })); return; }
      var miss = rows.filter(function (u) { return !isDone(map[u.id]); }), past = k !== "once" && k < todayS();
      box.appendChild(h("p", { class: "small" }, h("b", { text: t("sf_people_sum", { a: rows.length - miss.length, b: rows.length }) })));
      box.appendChild(h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("sf_col_person") }), h("th", { text: t("sf_col_state") }), s.paper ? h("th", { text: t("sf_col_paper") }) : null)),
        h("tbody", null, rows.map(function (u) {
          var x = map[u.id], done = isDone(x), pc = null;
          if (s.paper) {
            if (canPaper) {
              var cb = h("input", { type: "checkbox", "aria-label": t("sf_col_paper") }); cb.checked = !!(x && x.paper);
              cb.addEventListener("change", async function () {
                cb.disabled = true;
                var r = await sb.rpc("subfolder_paper", { _sub: s.id, _period: k, _user: u.id, _on: cb.checked });
                cb.disabled = false;
                if (r.error) { cb.checked = !cb.checked; toast(subErr(r.error)); return; }
                var y = ((ctx.dm[s.id + "|" + k] = ctx.dm[s.id + "|" + k] || {})[u.id] = ctx.dm[s.id + "|" + k][u.id] || {});
                y.paper = cb.checked ? new Date().toISOString() : null; toast(t("saved")); draw();
              });
              pc = h("td", null, h("label", { class: "check" }, cb, h("span", { text: x && x.paper ? fmtD(String(x.paper).slice(0, 10)) : "" })));
            } else pc = h("td", { text: x && x.paper ? "✓ " + fmtD(String(x.paper).slice(0, 10)) : "—" });
          }
          return h("tr", null, h("td", { text: u.name }),
            h("td", null, done ? h("span", { class: "chip ok", text: "✓ " + (x.at ? fmtDT(x.at) : "") + (x.value != null ? " · " + x.value : "") + (x.files ? " · " + t("sf_files", { n: x.files }) : "") })
              : h("span", { class: "chip " + (past ? "bad" : ""), text: t("sf_missing") })), pc);
        })))));
      if (isAdmin() && miss.length) box.appendChild(h("div", null, h("button", { class: "btn", type: "button", text: t("sf_remind", { n: miss.length }), onclick: async function (ev) {
        var b = ev.currentTarget; b.disabled = true;
        var r = await callFn("tg-notify", { kind: "subfolder", sub: s.id, due: k === "once" ? "" : k, users: miss.map(function (u) { return u.id; }) });
        b.disabled = false;
        toast(r.error ? fnErr(r.error) : t("sf_reminded", { sent: r.data.sent, total: miss.length }));
      } })));
    }
    sel.addEventListener("change", draw); draw();
    return h("div", { class: "stack sf-ctl" }, h("h4", { text: t("sf_people") }), keys.length > 1 ? h("label", { class: "f" }, t("sf_cycle"), sel) : null, box);
  }

  function subSettings(s, ctx) {
    var st = h("select", null, ["site", "numbers", "offline"].map(function (x) { return h("option", { value: x, text: t("sf_st_" + x) }); })); st.value = s.storage;
    var per = h("select", null, ["once", "month", "quarter", "year", "incoming", "case"].map(function (x) { return h("option", { value: x, text: t("sf_per_" + x) }); })); per.value = s.period;
    var paper = h("input", { type: "checkbox" }); paper.checked = !!s.paper;
    var note = h("input", { type: "text", maxlength: "300", value: s.note_ru || "" });
    var picks = h("div", { class: "fold-picks wide" }, posList().filter(function (p) { return p.code !== "other"; }).map(function (p) {
      var cb = h("input", { type: "checkbox", value: p.code }); cb.checked = (s.positions || []).indexOf(p.code) >= 0;
      return h("label", null, cb, h("span", { text: posTitle(p) }));
    }));
    var save = h("button", { class: "btn sm pri", type: "button", text: t("save"), onclick: async function () {
      save.disabled = true;
      var r = await sb.rpc("admin_set_subfolder", { _id: s.id, _storage: st.value, _period: per.value, _paper: paper.checked, _note: note.value,
        _positions: Array.from(picks.querySelectorAll("input:checked")).map(function (x) { return x.value; }) });
      save.disabled = false;
      if (r.error) { toast(subErr(r.error)); return; }
      SUBS = null; toast(t("saved")); ctx.reload();
    } });
    return h("details", { class: "sf-set" }, h("summary", { text: t("sf_settings") }),
      h("div", { class: "stack", style: "margin-top:10px" },
        h("div", { class: "grid-f" }, h("label", { class: "f" }, t("sf_set_storage"), st), h("label", { class: "f" }, t("sf_set_period"), per), h("label", { class: "f" }, t("sf_set_note"), note)),
        h("label", { class: "check" }, paper, h("span", { text: t("sf_set_paper") })),
        h("div", { class: "f" }, h("span", { text: t("sf_set_who") }), picks), h("div", null, save)));
  }

  // Таблица документов (в подпапке или без неё). Администратор может перенести документ в подпапку.
  function docTable(list, ctx, folderId) {
    var siteSubs = ctx.subs.filter(function (s) { return s.storage === "site"; });
    return h("div", { class: "tbl" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { text: t("f_title") }), h("th", { class: "hide-sm", text: t("f_number") + " / " + t("f_date") }),
        h("th", { class: "hide-sm", text: t("uploaded_by") }), h("th"))),
      h("tbody", null, list.map(function (doc) {
        var mv = null;
        if (isAdmin() && siteSubs.length) {
          mv = h("select", { "aria-label": t("sf_move") }, [h("option", { value: "", text: t("sf_move_none") })].concat(siteSubs.map(function (s) {
            return h("option", { value: s.id, text: s.id + " " + subTitle(s).slice(0, 50) }); })));
          mv.value = doc.subfolder_id || "";
          mv.addEventListener("change", async function () {
            var s = siteSubs.filter(function (x) { return x.id === mv.value; })[0];
            var r = await sb.rpc("admin_move_document", { _doc: doc.id, _sub: mv.value, _period: s && subPeriodic(s) ? (subLast(s) || subNext(s)) : "" });
            if (r.error) { mv.value = doc.subfolder_id || ""; toast(subErr(r.error)); return; }
            toast(t("sf_moved")); ctx.reload();
          });
        }
        return h("tr", null,
          h("td", null, h("b", { text: doc.title }), doc.note ? h("div", { class: "sub", text: doc.note }) : null,
            doc.file_name ? h("div", { class: "sub mono", text: doc.file_name + " · " + fmtSize(doc.file_size) }) : null,
            doc.period_key && doc.period_key !== "once" ? h("div", { class: "sub", text: t("sf_cycle_opt", { d: fmtD(doc.period_key) }) }) : null),
          h("td", { class: "hide-sm" }, [doc.doc_number || "", doc.doc_date ? " · " + fmtDate(doc.doc_date) : ""].join("")),
          h("td", { class: "hide-sm" }, ctx.names[doc.uploaded_by] || "—", h("div", { class: "sub", text: fmtDT(doc.created_at) })),
          h("td", null, h("div", { class: "row" },
            doc.storage_path ? h("button", { class: "btn sm", type: "button", onclick: function () { openFile(doc.storage_path); }, text: t("open") }) : null,
            mv, isAdmin() ? deleteButton(doc, folderId) : null)));
      }))));
  }

  // --- сроки сдачи: мои подпапки и контроль по району
  async function dueView() {
    var my = renderToken;
    shell("due", loadingBox());
    var subs, docs, marks, people = null;
    try {
      subs = await loadSubs(true);
      var rs = await Promise.all([sb.from("documents").select("id, subfolder_id, period_key, uploaded_by, created_at").not("subfolder_id", "is", null),
        sb.from("subfolder_marks").select("subfolder_id, period_key, user_id, value, submitted_at, paper_at")]);
      if (rs[0].error) throw rs[0].error;
      docs = rs[0].data || []; marks = rs[1].data || [];
      if (isManager()) people = await loadPeople();
    } catch (e) { if (my === renderToken) shell("due", failBox(e)); return; }
    if (my !== renderToken) return;
    var uid = S.session.user.id, dm = subDoneMap(docs, marks);
    function link(s) { return h("a", { href: "#/folder/" + s.folder_id + "/" + s.id, text: s.id }); }
    var mine = subs.filter(isMySub).map(function (s) { return { s: s, st: subMyState(s, dm, uid) }; })
      .sort(function (a, b) { return a.st.order - b.st.order || a.s.folder_id - b.s.folder_id || a.s.no - b.s.no; });
    var nOver = mine.filter(function (x) { return x.st.order === 0; }).length, nSoon = mine.filter(function (x) { return x.st.order === 1; }).length;
    var minePanel = h("section", { class: "panel stack" }, h("h3", { text: t("due_mine") }),
      !myPosCodes().length ? h("div", { class: "notice warn", text: t("due_no_pos") })
        : !mine.length ? h("p", { class: "mute", text: t("due_mine_none") })
        : [h("div", { class: "row" }, h("span", { class: "chip " + (nOver ? "bad" : "ok"), text: t("due_k_overdue") + ": " + nOver }),
            h("span", { class: "chip " + (nSoon ? "warn" : ""), text: t("due_k_soon") + ": " + nSoon })),
          h("div", { class: "tbl" }, h("table", null,
            h("thead", null, h("tr", null, h("th", { text: "№" }), h("th", { text: t("due_col_sub") }), h("th", { class: "hide-sm", text: t("sf_set_storage") }), h("th", { text: t("sf_col_cycle") }))),
            h("tbody", null, mine.map(function (x) {
              return h("tr", null, h("td", null, link(x.s)), h("td", null, h("b", { text: subTitle(x.s) }), h("div", { class: "sub", text: subOther(x.s) })),
                h("td", { class: "hide-sm" }, storageChip(x.s)), h("td", null, h("span", { class: "chip " + x.st.tone, text: x.st.text })));
            }))))]);
    var parts = [h("section", { class: "panel" }, h("h2", { text: t("due_title") }), h("p", { class: "small mute", text: t("due_note") })), minePanel];
    if (people) {
      var fsel = h("select", { "aria-label": t("nav_folders") }, [h("option", { value: "", text: t("due_all_folders") })].concat(
        Array.from(new Set(subs.map(function (s) { return s.folder_id; }))).map(function (n) { return h("option", { value: String(n), text: t("folder_no", { n: n }) }); })));
      fsel.value = DUE.folder; fsel.addEventListener("change", function () { DUE.folder = fsel.value; dueView(); });
      var onlyMiss = h("input", { type: "checkbox" }); onlyMiss.checked = DUE.missing;
      onlyMiss.addEventListener("change", function () { DUE.missing = onlyMiss.checked; dueView(); });
      var total = 0;
      var rows = subs.filter(function (s) { return (subPeriodic(s) || s.period === "once") && (!DUE.folder || String(s.folder_id) === DUE.folder); }).map(function (s) {
        var exp = expectedFor(s, people), L = s.period === "once" ? "once" : subLast(s), N = subNext(s);
        function cnt(k) { var mp = dm[s.id + "|" + k] || {}; return exp.filter(function (u) { return isDone(mp[u.id]); }).length; }
        var missL = L ? exp.filter(function (u) { return !doneBy(dm, s, L, u.id); }) : [];
        total += missL.length;
        return { s: s, exp: exp, L: L, N: N, aL: L ? cnt(L) : 0, aN: N ? cnt(N) : 0, missL: missL };
      }).filter(function (r) { return r.exp.length && (!DUE.missing || r.missL.length || (r.N && r.aN < r.exp.length)); })
        .sort(function (a, b) { return b.missL.length - a.missL.length || a.s.folder_id - b.s.folder_id || a.s.no - b.s.no; });
      parts.push(h("section", { class: "panel stack" }, h("h3", { text: t("due_control") }),
        h("div", { class: "row" }, fsel, h("label", { class: "check" }, onlyMiss, h("span", { text: t("due_only_missing") })),
          h("span", { class: "chip " + (total ? "bad" : "ok"), text: t("due_overdue_total", { n: total }) })),
        !rows.length ? h("p", { class: "mute", text: t("due_none") }) :
        h("div", { class: "tbl" }, h("table", null,
          h("thead", null, h("tr", null, h("th", { text: "№" }), h("th", { text: t("due_col_sub") }), h("th", { class: "hide-sm", text: t("due_col_who") }),
            h("th", { text: t("due_col_last") }), h("th", { text: t("due_col_next") }), isAdmin() ? h("th") : null)),
          h("tbody", null, rows.map(function (r) {
            var lastTxt = !r.L ? "—" : t("due_cell", { d: r.L === "once" ? t("sf_per_once") : fmtD(r.L), a: r.aL, b: r.exp.length });
            return h("tr", null, h("td", null, link(r.s)),
              h("td", null, h("b", { text: subTitle(r.s) }), r.missL.length ? h("div", { class: "sub bad", text: r.missL.map(function (u) { return u.name; }).join(", ") }) : null),
              h("td", { class: "hide-sm", text: r.exp.length + " " + t("due_people") }),
              h("td", null, h("span", { class: "chip " + (!r.L ? "" : r.missL.length ? "bad" : "ok"), text: lastTxt })),
              h("td", null, r.N ? h("span", { class: "chip " + (r.aN < r.exp.length ? "" : "ok"), text: t("due_cell", { d: fmtD(r.N), a: r.aN, b: r.exp.length }) }) : "—"),
              isAdmin() ? h("td", null, r.missL.length ? h("button", { class: "btn sm", type: "button", title: t("sf_remind", { n: r.missL.length }), text: t("due_remind", { n: r.missL.length }), onclick: async function (ev) {
                var b = ev.currentTarget; b.disabled = true;
                var x = await callFn("tg-notify", { kind: "subfolder", sub: r.s.id, due: r.L === "once" ? "" : r.L, users: r.missL.map(function (u) { return u.id; }) });
                b.disabled = false; toast(x.error ? fnErr(x.error) : t("sf_reminded", { sent: x.data.sent, total: r.missL.length }));
              } }) : null) : null);
          }))))));
    }
    shell("due", h("div", { class: "stack" }, parts));
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
    var orl = await sb.rpc("admin_offline_roles");
    if (my !== renderToken) return;
    if (r.error) return shell("users", failBox(r.error));
    var offRole = {}; (orl.data || []).forEach(function (x) { offRole[x.user_id] = x.offline_role; });
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
        h("td", { style: "min-width:240px" }, scopeEditor(u)),
        h("td", { style: "min-width:200px" }, offlineCell(u, offRole[u.user_id] || "")));
    });
    shell("users", h("section", { class: "panel stack" }, h("h2", { text: t("u_title") }), h("p", { class: "mute small", text: t("u_folders_hint") }),
      h("div", { class: "tbl" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: t("u_name") + " / " + t("u_position") }), h("th", { text: t("u_roles") }), h("th", { text: t("u_folders") }), h("th", { text: t("u_scope") }), h("th", { text: t("off_col") }))),
        h("tbody", null, rows)))));
  }

  // --- офлайн-программа: должность назначает администратор, ключ активации подписывает сервер (функция offline-key)
  function appUrl() { return CFG.siteUrl.replace(/\/?$/, "/") + "app/"; }
  function offErr(e) {
    var m = errMsg(e);
    return /no_offline_role/.test(m) ? t("off_no_role") : /no_admin_key/.test(m) ? t("off_no_akey") : /coord_admin_only/.test(m) ? t("off_coord_admin") : t("err_action", { msg: m });
  }
  function keyBox(token) {
    var link = appUrl() + "#a=" + token, code = h("code", { text: link });
    return h("div", { class: "stack", style: "gap:6px" },
      h("div", { class: "linkbox" }, code, h("button", { class: "btn sm", type: "button", text: t("copy"), onclick: function () {
        var sel = function () { var rg = document.createRange(); rg.selectNodeContents(code); var x = getSelection(); x.removeAllRanges(); x.addRange(rg); };
        try { navigator.clipboard.writeText(link).then(function () { toast(t("copied")); }, sel); } catch (er) { sel(); }
      } })),
      h("p", { class: "mute small", text: t("off_link_hint") }));
  }
  function offlineCell(u, cur) {
    var sel = h("select", { "aria-label": t("off_col") }, [["", "off_role_none"], ["cab", "off_role_cab"], ["pat", "off_role_pat"]].concat((u.roles || []).indexOf("admin") >= 0 ? [["coord", "off_role_coord"]] : [])
      .map(function (x) { return h("option", { value: x[0], text: t(x[1]) }); }));
    sel.value = cur;
    var out = h("div");
    sel.addEventListener("change", async function () {
      var x = await sb.rpc("admin_set_offline_role", { _uid: u.user_id, _role: sel.value || null });
      if (x.error) { sel.value = cur; toast(offErr(x.error)); return; }
      cur = sel.value; toast(t("u_saved"));
    });
    var btn = h("button", { class: "btn sm", type: "button", text: t("off_key_btn"), onclick: async function () {
      if (!cur) { toast(t("off_no_role_u")); return; }
      btn.disabled = true; var r = await callFn("offline-key", { uid: u.user_id }); btn.disabled = false;
      if (r.error) { toast(offErr(r.error)); return; }
      out.textContent = ""; out.appendChild(keyBox(r.data.token));
    } });
    return h("div", { class: "stack", style: "gap:6px" }, sel, btn, out);
  }
  async function offlineView() {
    var my = renderToken;
    shell("offline", loadingBox());
    var ak = isAdmin() ? await sb.rpc("admin_get_offline_key") : null;
    if (my !== renderToken) return;
    var res = h("div", { id: "off_res" });
    var get = h("button", { class: "btn pri", type: "button", id: "off_get", text: t("off_get"), onclick: async function () {
      get.disabled = true; var r = await callFn("offline-key", {}); get.disabled = false;
      res.textContent = "";
      if (r.error) { res.appendChild(h("div", { class: "notice warn", text: offErr(r.error) })); return; }
      res.appendChild(h("div", { class: "notice", text: t("off_got", { role: t("off_role_" + r.data.role) }) }));
      res.appendChild(keyBox(r.data.token));
      res.appendChild(h("a", { class: "btn pri", href: appUrl() + "#a=" + r.data.token, target: "_blank", rel: "noopener", text: t("off_open") }));
    } });
    var parts = [h("section", { class: "panel stack" }, h("h2", { text: t("off_title") }), h("p", { text: t("off_intro") }),
      h("ol", { class: "small" }, ["off_s1", "off_s2", "off_s3"].map(function (k) { return h("li", { text: t(k) }); })), h("div", null, get), res)];
    if (isAdmin()) {
      var cur = ak && ak.data;
      var ta = h("textarea", { id: "off_akey", rows: 3, placeholder: t("off_akey_ph"), spellcheck: "false" });
      var save = h("button", { class: "btn sm pri", type: "button", text: t("save"), onclick: async function () {
        var m = /^\s*([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\s*$/.exec(ta.value);
        if (!m) { toast(t("off_akey_bad")); return; }
        var x = await sb.rpc("admin_set_offline_key", { _x: m[1], _y: m[2] });
        if (x.error) { toast(t("err_action", { msg: errMsg(x.error) })); return; }
        toast(t("u_saved")); offlineView();
      } });
      parts.push(h("section", { class: "panel stack" }, h("h2", { text: t("off_akey_title") }), h("p", { class: "mute small", text: t("off_akey_hint") }),
        h("div", { class: cur ? "notice" : "notice warn", id: "off_akey_state", text: cur ? t("off_akey_set") : t("off_akey_none") }), ta, h("div", null, save)));
    }
    shell("offline", h("div", { class: "stack" }, parts));
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

  // --- рассылки и задания («топширик»)
  var MIME = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  async function callFn(name, body) {
    var r = await sb.functions.invoke(name, { body: body });
    if (r.error) {
      var m = errMsg(r.error);
      try { var j = await r.error.context.json(); if (j && j.error) m = j.error; } catch (e) {}
      return { error: { message: m } };
    }
    return { data: r.data };
  }
  function fnErr(e) { var m = errMsg(e); return /forbidden/.test(m) ? t("bc_forbidden") : t("err_action", { msg: m }); }
  async function sendNotify(kind, id, remind) {
    var r = await callFn("tg-notify", { kind: kind, id: id, remind: !!remind });
    if (r.error) { toast(fnErr(r.error)); return null; }
    toast(t("bc_notify_done", { sent: r.data.sent, total: r.data.total, blocked: (r.data.blocked || 0) + (r.data.failed || 0) })); return r.data;
  }
  async function loadBadges() {
    var a = await sb.rpc("my_broadcasts"), b = await sb.rpc("my_tasks"), c = await sb.rpc("leaves_list");
    S.badge = { bc: (a.data || []).filter(function (x) { return !x.viewed; }).length, tk: (b.data || []).filter(function (x) { return !x.done_at; }).length, lv: leaveActionCount(c.data || []) };
  }
  // что ждёт моего действия: согласие на замещение, рассмотрение, просроченная заявка (администратору)
  function leaveActionCount(list) { return list.filter(function (x) { return (x.i_substitute && x.consent === "pending" && x.status === "pending") || x.i_decide; }).length; }

  // --- отпуск и замещение
  var RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
  function rateTxt(r) { return r == null ? "—" : String(+r).replace(".", ","); }
  async function leaveNotify(id, event) { var r = await callFn("leave-notify", { id: id, event: event }); if (!r.error && r.data && r.data.sent) toast(t("lv_notified", { n: r.data.sent })); }
  function leaveCard(x) {
    var st = x.status === "pending" ? (x.overdue ? ["bad", t("lv_overdue")] : ["warn", t("lv_pending")]) : x.status === "approved" ? ["ok", t("lv_approved")] : ["", t("lv_" + x.status)];
    var acts = h("div", { class: "row" });
    if (x.i_substitute && x.consent === "pending" && x.status === "pending") {
      acts.appendChild(h("button", { class: "btn sm pri", type: "button", text: t("lv_agree"), onclick: async function () {
        var r = await sb.rpc("substitution_consent", { _leave: x.id, _accept: true });
        if (r.error) { toast(/over_limit/.test(errMsg(r.error)) ? t("lv_over_limit") : t("err_action", { msg: errMsg(r.error) })); return; }
        toast(t("u_saved")); await leaveNotify(x.id, "consent"); leavesView();
      } }));
      acts.appendChild(h("button", { class: "btn sm", type: "button", text: t("lv_refuse"), onclick: async function () {
        var r = await sb.rpc("substitution_consent", { _leave: x.id, _accept: false });
        if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; } toast(t("u_saved")); leavesView();
      } }));
    }
    if (x.i_decide) {
      var note = h("input", { type: "text", maxlength: "500", placeholder: t("lv_dec_note"), "aria-label": t("lv_dec_note") });
      var dec = function (ok) { return async function () {
        var r = await sb.rpc("decide_leave", { _id: x.id, _approve: ok, _note: note.value });
        if (r.error) { toast(/no_consent/.test(errMsg(r.error)) ? t("lv_no_consent") : t("err_action", { msg: errMsg(r.error) })); return; }
        toast(t("u_saved")); await leaveNotify(x.id, "decided"); leavesView();
      }; };
      acts.appendChild(note);
      acts.appendChild(h("button", { class: "btn sm pri", type: "button", text: t("lv_approve"), onclick: dec(true) }));
      acts.appendChild(h("button", { class: "btn sm", type: "button", text: t("lv_reject"), onclick: dec(false) }));
    }
    if (isAdmin() && x.status === "pending" && x.overdue && !x.mine) {
      acts.appendChild(h("button", { class: "btn sm danger", type: "button", text: x.demanded_at ? t("lv_demand_again") : t("lv_demand"), onclick: async function () {
        var r = await sb.rpc("admin_demand_review", { _id: x.id });
        if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; }
        await leaveNotify(x.id, "demand"); toast(t("lv_demand_done")); leavesView();
      } }));
    }
    if (x.mine && (x.status === "pending" || x.status === "approved") && x.date_to >= todayS()) {
      var cb = h("button", { class: "btn sm", type: "button", text: t("lv_cancel") });
      armed(cb, t("lv_cancel_q"), async function () { var r = await sb.rpc("cancel_leave", { _id: x.id }); if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; } toast(t("u_saved")); leavesView(); });
      acts.appendChild(cb);
    }
    return h("div", { class: "lcard stack", "data-id": x.id, style: "gap:6px" },
      h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, h("b", { text: x.full_name + (x.user_position ? " · " + x.user_position : "") }), h("span", { class: "chip " + st[0], text: st[1] })),
      h("div", { class: "small", text: t("lv_kind_" + x.kind) + ": " + fmtDate(x.date_from) + " – " + fmtDate(x.date_to) + (x.institution ? " · " + x.institution : "") }),
      x.substitute_name ? h("div", { class: "small", text: t("lv_sub_line", { n: x.substitute_name, l: rateTxt(x.load), c: t("lv_consent_" + x.consent) }) }) : h("div", { class: "small mute", text: t("lv_no_sub") }),
      x.note ? h("div", { class: "small mute", text: x.note }) : null,
      x.status === "pending" ? h("div", { class: "small mute", text: t("lv_due", { d: fmtDate(x.due_at) }) + (x.demanded_at ? " · " + t("lv_demanded", { d: fmtDate(x.demanded_at) }) : "") }) : null,
      x.decided_at ? h("div", { class: "small mute", text: t("lv_decided", { n: x.decided_by_name || "", d: fmtDate(x.decided_at) }) + (x.decision_note ? " — " + x.decision_note : "") }) : null,
      acts.childNodes.length ? acts : null);
  }
  async function leavesView() {
    var my = renderToken;
    shell("leaves", loadingBox());
    var wp = await sb.rpc("my_work_profile"), lst = await sb.rpc("leaves_list"), rates = isAdmin() ? await sb.rpc("admin_rates") : null;
    if (my !== renderToken) return;
    if (lst.error) return shell("leaves", failBox(lst.error));
    var w = wp.data || {}, list = lst.data || [];
    S.badge = S.badge || {}; S.badge.lv = leaveActionCount(list);
    // моя ставка
    var rsel = h("select", { id: "lv_rate", "aria-label": t("lv_rate") }, RATES.map(function (r) { return h("option", { value: String(r), text: rateTxt(r) }); }));
    rsel.value = String(w.rate_req != null ? +w.rate_req : w.rate != null ? +w.rate : 1);
    var rateP = h("section", { class: "panel stack" }, h("h2", { text: t("lv_rate_title") }),
      h("p", { class: "small", text: t("lv_rate_now", { r: rateTxt(w.rate) }) + (w.rate_req != null ? " · " + t("lv_rate_wait", { r: rateTxt(w.rate_req) }) : "") }),
      h("div", { class: "row" }, rsel, h("button", { class: "btn sm", type: "button", text: t("lv_rate_send"), onclick: async function () {
        var r = await sb.rpc("request_rate", { _rate: +rsel.value }); if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; } toast(t("lv_rate_sent")); leavesView();
      } })), h("p", { class: "mute small", text: t("lv_rate_hint", { m: rateTxt(w.max || 1.5), l: rateTxt(w.sub_load || 0.3) }) }));
    // новая заявка
    var kind = h("select", { id: "lv_kind" }, ["vacation", "sick", "study", "other"].map(function (k) { return h("option", { value: k, text: t("lv_kind_" + k) }); }));
    var from = h("input", { type: "date", id: "lv_from", min: todayS() }), to = h("input", { type: "date", id: "lv_to", min: todayS() });
    var note = h("input", { type: "text", id: "lv_note", maxlength: "500", placeholder: t("lv_note") });
    var sub = h("select", { id: "lv_sub" }, h("option", { value: "", text: t("lv_sub_none") }));
    var candSeq = 0;
    async function loadCands() {
      var mySeq = ++candSeq;
      if (!from.value || !to.value || to.value < from.value) { sub.textContent = ""; sub.appendChild(h("option", { value: "", text: t("lv_sub_none") })); return; }
      var c = await sb.rpc("leave_candidates", { _from: from.value, _to: to.value });
      if (mySeq !== candSeq) return;
      sub.textContent = ""; sub.appendChild(h("option", { value: "", text: t("lv_sub_none") }));
      (c.data || []).forEach(function (u) { sub.appendChild(h("option", { value: u.user_id, disabled: !u.can, text: u.full_name + (u.user_position ? " · " + u.user_position : "") + " — " + t("lv_load", { a: rateTxt(u.load_now) }) + (u.can ? "" : " " + t("lv_full")) })); });
    }
    from.addEventListener("change", loadCands); to.addEventListener("change", loadCands);
    var send = h("button", { class: "btn pri", type: "button", id: "lv_send", text: t("lv_send"), onclick: async function () {
      if (!from.value || !to.value || to.value < from.value) { toast(t("lv_bad_dates")); return; }
      send.disabled = true;
      var r = await sb.rpc("request_leave", { _kind: kind.value, _from: from.value, _to: to.value, _note: note.value, _substitute: sub.value || null });
      send.disabled = false;
      if (r.error) { var m = errMsg(r.error); toast(/overlap/.test(m) ? t("lv_overlap") : /over_limit/.test(m) ? t("lv_over_limit") : /too_long/.test(m) ? t("lv_too_long") : t("err_action", { msg: m })); return; }
      toast(t("lv_sent")); await leaveNotify(r.data, "request"); leavesView();
    } });
    var form = h("section", { class: "panel stack" }, h("h2", { text: t("lv_new") }), h("p", { class: "mute small", text: t("lv_new_hint") }),
      h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, h("label", { class: "f" }, t("lv_kind"), kind), h("label", { class: "f" }, t("lv_from"), from), h("label", { class: "f" }, t("lv_to"), to)),
      h("label", { class: "f" }, t("lv_sub"), sub), h("label", { class: "f" }, t("lv_note"), note), h("div", null, send));
    var parts = [];
    var need = list.filter(function (x) { return (x.i_substitute && x.consent === "pending" && x.status === "pending") || x.i_decide || (isAdmin() && x.overdue && !x.mine); });
    if (need.length) parts.push(h("section", { class: "panel stack", id: "lv_need" }, h("h2", { text: t("lv_need", { n: need.length }) }), need.map(leaveCard)));
    parts.push(rateP, form);
    var rest = list.filter(function (x) { return need.indexOf(x) < 0; });
    parts.push(h("section", { class: "panel stack", id: "lv_list" }, h("h2", { text: t("lv_list") }), rest.length ? rest.map(leaveCard) : h("p", { class: "mute", text: t("lv_empty") })));
    if (rates && !rates.error) {
      var pend = (rates.data || []).filter(function (u) { return u.rate_req != null; });
      parts.push(h("section", { class: "panel stack", id: "lv_rates" }, h("h2", { text: t("lv_rates_title", { n: pend.length }) }),
        pend.length ? pend.map(function (u) {
          return h("div", { class: "row", style: "align-items:center;gap:8px;flex-wrap:wrap" }, h("span", { text: u.full_name + " · " + (u.user_position || "") + ": " + rateTxt(u.rate) + " → " }), h("b", { text: rateTxt(u.rate_req) }),
            h("button", { class: "btn sm pri", type: "button", text: t("lv_confirm"), onclick: async function () { var r = await sb.rpc("admin_confirm_rate", { _uid: u.user_id, _ok: true }); if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; } toast(t("u_saved")); leavesView(); } }),
            h("button", { class: "btn sm", type: "button", text: t("lv_reject"), onclick: async function () { var r = await sb.rpc("admin_confirm_rate", { _uid: u.user_id, _ok: false }); if (r.error) { toast(t("err_action", { msg: errMsg(r.error) })); return; } toast(t("u_saved")); leavesView(); } }));
        }) : h("p", { class: "mute small", text: t("lv_rates_none") })));
    }
    shell("leaves", h("div", { class: "stack" }, parts));
  }
  // офлайн-программа присылает открытый ключ устройства: #/offline?pub=x.y — сохраняем (нужно для передачи пациенток при замещении)
  async function registerPub(x, y) {
    var r = await sb.rpc("set_my_offline_pub", { _x: x, _y: y });
    try { history.replaceState(null, "", location.pathname + location.search + "#/offline"); } catch (e) {}
    toast(r.error ? t("err_action", { msg: errMsg(r.error) }) : t("off_pub_done"));
    return offlineView();
  }
  function armed(btn, label, fn) {   // кнопка с подтверждением вторым нажатием
    btn.addEventListener("click", function () {
      if (!btn.classList.contains("armed")) {
        btn.classList.add("armed"); btn.textContent = t("del_confirm");
        setTimeout(function () { btn.classList.remove("armed"); btn.textContent = label; }, 4000); return;
      }
      btn.disabled = true; fn();
    });
  }
  // выбор получателей: все / по должности / по учреждениям / вручную
  function audiencePicker(users) {
    var sel = h("select", { "aria-label": t("aud_label") }, ["all", "positions", "institutions", "people"].map(function (k) { return h("option", { value: k, text: t("aud_" + k) }); }));
    var body = h("div", { class: "stack", style: "gap:8px" }), chosen = { positions: {}, institutions: {}, users: {} };
    var qIn = h("input", { type: "search", placeholder: t("aud_search"), "aria-label": t("aud_search") });
    var poss = Array.from(new Set(users.map(function (u) { return (u.user_position || "").trim(); }).filter(Boolean))).sort();
    function list(key, items) {
      if (!items.length) return h("p", { class: "mute small", text: t("aud_none") });
      return h("div", { class: "fold-picks wide" }, items.map(function (it) {
        var cb = h("input", { type: "checkbox", value: String(it[0]), checked: !!chosen[key][it[0]] });
        cb.addEventListener("change", function () { if (cb.checked) chosen[key][it[0]] = 1; else delete chosen[key][it[0]]; });
        return h("label", null, cb, it[1]);
      }));
    }
    function draw() {
      body.textContent = ""; var m = sel.value;
      if (m === "positions") body.appendChild(list("positions", poss.map(function (p) { return [p, p]; })));
      else if (m === "institutions") body.appendChild(list("institutions", (S.institutions || []).map(function (i) { return [i.id, i.name]; })));
      else if (m === "people") {
        var wrap = h("div");
        var dr = function () {
          var q = qIn.value.toLowerCase().trim(); wrap.textContent = "";
          wrap.appendChild(list("users", users.filter(function (u) { return !q || (u.full_name || "").toLowerCase().indexOf(q) >= 0; })
            .map(function (u) { return [u.user_id, (u.full_name || "—") + (u.user_position ? " — " + u.user_position : "")]; })));
        };
        qIn.oninput = dr; body.appendChild(qIn); body.appendChild(wrap); dr();
      }
    }
    sel.addEventListener("change", draw); draw();
    return { node: h("div", { class: "stack", style: "gap:8px" }, h("label", { class: "f" }, t("aud_label"), sel), body),
      get: function () {
        var m = sel.value;
        if (m === "all") return { all: true };
        if (m === "positions") return { positions: Object.keys(chosen.positions) };
        if (m === "institutions") return { institutions: Object.keys(chosen.institutions).map(Number) };
        return { users: Object.keys(chosen.users) };
      } };
  }
  function statusTable(head, rows) {
    return h("div", { class: "tbl" }, h("table", null, h("thead", null, h("tr", null, head.map(function (x) { return h("th", { text: x }); }))),
      h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c) { return h("td", null, c); })); }))));
  }
  function dash(v) { return v ? fmtDT(v) : "—"; }

  function bcCard(b) {
    var chip = h("span", { class: "chip " + (b.downloaded ? "ok" : b.viewed ? "acc" : "warn"), text: t(b.downloaded ? "bc_st_dl" : b.viewed ? "bc_st_seen" : "bc_st_new") });
    var dl = h("button", { class: "btn pri", type: "button", text: t("bc_download") });
    dl.addEventListener("click", async function () {
      dl.disabled = true;
      await sb.rpc("broadcast_view", { _id: b.id });
      var r = await callFn("bc-file", { id: b.id });
      dl.disabled = false;
      if (r.error) { toast(fnErr(r.error)); return; }
      var a = h("a", { href: r.data.url, download: b.file_name, rel: "noopener" }); document.body.appendChild(a); a.click(); a.remove();
      b.downloaded = true; b.viewed = true; chip.className = "chip ok"; chip.textContent = t("bc_st_dl");
    });
    var d = h("details", { class: "fcard" + (b.viewed ? "" : " bc-new") },
      h("summary", { style: "cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
        h("b", { text: b.title }), b.urgent ? h("span", { class: "chip bad", text: t("bc_urgent") }) : null, chip,
        h("span", { class: "mute small", text: t("bc_updated", { d: fmtDate(b.updated_at) }) + (b.version > 1 ? " · " + t("bc_version", { v: b.version }) : "") })),
      h("div", { class: "stack", style: "margin-top:10px;gap:8px" }, b.note ? h("p", { text: b.note }) : null,
        h("p", { class: "mute small", text: b.file_name + (b.file_size != null ? " · " + fmtSize(b.file_size) : "") }), h("div", { class: "row" }, dl)));
    d.addEventListener("toggle", function () {
      if (d.open && !b.viewed) { b.viewed = true; sb.rpc("broadcast_view", { _id: b.id }); if (!b.downloaded) { chip.className = "chip acc"; chip.textContent = t("bc_st_seen"); } }
    });
    return d;
  }

  function bcAdminRow(b, onNewVersion) {
    var st = h("div");
    var d = h("details", { class: "fcard" },
      h("summary", { style: "cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
        h("b", { text: b.title }), b.urgent ? h("span", { class: "chip bad", text: t("bc_urgent") }) : null,
        h("span", { class: "chip", text: t("bc_opened", { a: b.viewed, n: b.total }) }), h("span", { class: "chip", text: t("bc_downloaded", { a: b.downloaded, n: b.total }) }),
        h("span", { class: "chip", text: t("bc_notified", { a: b.notified, n: b.total }) }),
        h("span", { class: "mute small", text: b.file_name + " · " + t("bc_version", { v: b.version }) + " · " + fmtDate(b.updated_at) })));
    var del = h("button", { class: "btn sm danger", type: "button", text: t("del") });
    armed(del, t("del"), async function () {
      var x = await sb.rpc("admin_delete_broadcast", { _id: b.id });
      if (x.error) { del.disabled = false; toast(t("err_action", { msg: errMsg(x.error) })); return; }
      if ((x.data || []).length) await sb.storage.from("broadcasts").remove(x.data);
      toast(t("bc_del_done")); broadcastsView();
    });
    var loaded = false;
    async function loadStatus() {
      st.textContent = ""; st.appendChild(loadingBox());
      var x = await sb.rpc("admin_broadcast_status", { _id: b.id });
      st.textContent = "";
      if (x.error) { st.appendChild(failBox(x.error)); return; }
      st.appendChild(statusTable([t("st_col_person"), t("st_col_tg"), t("st_col_opened"), t("st_col_dl")], (x.data || []).map(function (r) {
        return [h("div", null, h("b", { text: r.full_name || "—" }), h("div", { class: "mute small", text: r.user_position || "" })),
          r.notified_version === b.version ? "✓" : "—", r.viewed ? dash(r.first_view) + (r.views > 1 ? " (×" + r.views + ")" : "") : "—", r.downloaded ? dash(r.last_download) + (r.downloads > 1 ? " (×" + r.downloads + ")" : "") : "—"];
      })));
    }
    d.addEventListener("toggle", function () { if (d.open && !loaded) { loaded = true; loadStatus(); } });
    d.appendChild(h("div", { class: "stack", style: "margin-top:10px;gap:10px" }, b.note ? h("p", { text: b.note }) : null,
      h("div", { class: "row" },
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_notify"), onclick: async function () { await sendNotify("broadcast", b.id, false); broadcastsView(); } }),
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_remind"), onclick: function () { sendNotify("broadcast", b.id, true); } }),
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_newver"), onclick: function () { onNewVersion(b); } }),
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_refresh"), onclick: loadStatus }), del), st));
    return d;
  }

  function bcPublishForm(users, existing) {
    var target = h("select", { id: "bc_target", "aria-label": t("bc_f_target") }, h("option", { value: "", text: t("bc_f_new") }),
      existing.map(function (b) { return h("option", { value: b.id, text: b.title }); }));
    var title = h("input", { type: "text", id: "bc_title", maxlength: "200", "aria-label": t("bc_f_title") });
    var note = h("textarea", { rows: "2", id: "bc_note", maxlength: "2000", "aria-label": t("bc_f_note") });
    var urgent = h("input", { type: "checkbox", id: "bc_urgent" }), notify = h("input", { type: "checkbox", id: "bc_notify", checked: true });
    var file = h("input", { type: "file", id: "bc_file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" });
    var picker = audiencePicker(users), hint = h("p", { class: "mute small hidden", text: t("bc_f_newver") });
    function onTarget() {
      var b = existing.filter(function (x) { return x.id === target.value; })[0];
      hint.classList.toggle("hidden", !b);
      if (b) { title.value = b.title; note.value = b.note || ""; urgent.checked = !!b.urgent; }
    }
    target.addEventListener("change", onTarget);
    var btn = h("button", { class: "btn pri", type: "submit", text: t("bc_publish") });
    var form = h("form", { class: "stack", id: "bc_form" },
      existing.length ? h("label", { class: "f" }, t("bc_f_target"), target) : null, hint,
      h("label", { class: "f" }, t("bc_f_title"), title), h("label", { class: "f" }, t("bc_f_note"), note),
      h("label", { class: "f" }, t("bc_f_file"), file),
      h("label", { class: "row", style: "align-items:center" }, urgent, t("bc_f_urgent")), picker.node,
      h("label", { class: "row", style: "align-items:center" }, notify, t("bc_f_notify")), h("div", { class: "row" }, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = file.files[0], id = target.value || uuid();
      if (title.value.trim().length < 1) { toast(t("bc_need_title")); return; }
      if (!f) { toast(t("bc_need_file")); return; }
      if (f.size > 20 * 1024 * 1024) { toast(t("bc_too_big")); return; }
      var ext = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1] || "", mime = MIME[ext.toLowerCase()];
      if (!mime) { toast(t("bc_bad_type")); return; }
      btn.disabled = true;
      var path = id + "/" + Date.now() + "/" + safeName(f.name);
      var up = await sb.storage.from("broadcasts").upload(path, f, { contentType: mime, upsert: false });
      if (up.error) { btn.disabled = false; toast(t("err_action", { msg: errMsg(up.error) })); return; }
      var x = await sb.rpc("admin_publish_broadcast", { _id: id, _title: title.value, _note: note.value, _urgent: urgent.checked, _audience: picker.get(), _path: path, _file_name: f.name, _size: f.size });
      if (x.error) {
        await sb.storage.from("broadcasts").remove([path]); btn.disabled = false;
        toast(/no_recipients/.test(errMsg(x.error)) ? t("bc_no_recipients") : t("err_action", { msg: errMsg(x.error) })); return;
      }
      toast(t("bc_published", { n: x.data.recipients }));
      if (notify.checked) await sendNotify("broadcast", id, false);
      broadcastsView();
    });
    return { node: h("section", { class: "panel stack" }, h("h2", { text: t("bc_publish") }), form),
      newVersion: function (b) { target.value = b.id; onTarget(); form.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  }

  async function broadcastsView() {
    var my = renderToken;
    shell("broadcasts", loadingBox());
    var mine = await sb.rpc("my_broadcasts");
    var adm = isAdmin() ? await sb.rpc("admin_list_broadcasts") : null, usr = isAdmin() ? await sb.rpc("admin_list_users") : null;
    if (my !== renderToken) return;
    if (mine.error) { shell("broadcasts", failBox(mine.error)); return; }
    var list = mine.data || [];
    S.badge = S.badge || {}; S.badge.bc = list.filter(function (x) { return !x.viewed; }).length;
    var parts = [];
    if (isAdmin()) {
      var form = bcPublishForm((usr && usr.data) || [], (adm && adm.data) || []);
      parts.push(form.node);
      var rows = ((adm && adm.data) || []).map(function (b) { return bcAdminRow(b, form.newVersion); });
      parts.push(h("section", { class: "panel stack" }, h("h3", { text: t("bc_sent_list", { n: rows.length }) }), rows.length ? rows : h("p", { class: "mute", text: t("bc_empty_admin") })));
    }
    parts.push(h("section", { class: "panel stack" }, h("h2", { text: t("bc_title") }), list.length ? list.map(bcCard) : h("p", { class: "mute", text: t("bc_empty") })));
    shell("broadcasts", h("div", { class: "stack" }, parts));
  }

  // --- задания
  function tkCard(k) {
    var late = k.due_date && !k.done_at && k.due_date < new Date().toISOString().slice(0, 10);
    var chip = h("span", { class: "chip " + (k.done_at ? "ok" : k.seen_at ? "acc" : "warn"), text: t(k.done_at ? "tk_st_done" : k.seen_at ? "tk_st_seen" : "tk_st_new") });
    var note = h("textarea", { rows: "2", maxlength: "1000", placeholder: t("tk_note"), "aria-label": t("tk_note") }); note.value = k.note || "";
    var btn = h("button", { class: "btn pri", type: "button", text: t(k.done_at ? "tk_btn_undo" : "tk_btn_done") });
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      var x = await sb.rpc("task_done", { _id: k.id, _note: note.value, _done: !k.done_at });
      btn.disabled = false;
      if (x.error) { toast(t("err_action", { msg: errMsg(x.error) })); return; }
      toast(t("u_saved")); tasksView();
    });
    var d = h("details", { class: "fcard" + (k.done_at ? " dim" : "") },
      h("summary", { style: "cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
        h("b", { text: k.title }), k.urgent ? h("span", { class: "chip bad", text: t("bc_urgent") }) : null, chip,
        k.due_date ? h("span", { class: "chip " + (late ? "bad" : ""), text: late ? t("tk_overdue") + " · " + fmtDate(k.due_date) : t("tk_due", { d: fmtDate(k.due_date) }) }) : null),
      h("div", { class: "stack", style: "margin-top:10px;gap:8px" }, k.body ? h("p", { text: k.body }) : null, h("label", { class: "f" }, t("tk_note"), note), h("div", { class: "row" }, btn)));
    d.addEventListener("toggle", function () {
      if (d.open && !k.seen_at) { k.seen_at = new Date().toISOString(); sb.rpc("task_seen", { _id: k.id }); if (!k.done_at) { chip.className = "chip acc"; chip.textContent = t("tk_st_seen"); } }
    });
    return d;
  }
  function tkAdminRow(k) {
    var st = h("div"), loaded = false;
    var d = h("details", { class: "fcard" + (k.total && k.done === k.total ? " dim" : "") },
      h("summary", { style: "cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap" },
        h("b", { text: k.title }), k.urgent ? h("span", { class: "chip bad", text: t("bc_urgent") }) : null,
        h("span", { class: "chip", text: t("tk_seen_n", { a: k.seen, n: k.total }) }), h("span", { class: "chip " + (k.total && k.done === k.total ? "ok" : ""), text: t("tk_done_n", { a: k.done, n: k.total }) }),
        k.due_date ? h("span", { class: "mute small", text: t("tk_due", { d: fmtDate(k.due_date) }) }) : null));
    async function loadStatus() {
      st.textContent = ""; st.appendChild(loadingBox());
      var x = await sb.rpc("admin_task_status", { _id: k.id }); st.textContent = "";
      if (x.error) { st.appendChild(failBox(x.error)); return; }
      st.appendChild(statusTable([t("st_col_person"), t("st_col_tg"), t("st_col_seen"), t("st_col_done"), t("st_col_note")], (x.data || []).map(function (r) {
        return [h("div", null, h("b", { text: r.full_name || "—" }), h("div", { class: "mute small", text: r.user_position || "" })), r.notified_at ? "✓" : "—", dash(r.seen_at), dash(r.done_at), r.note || ""];
      })));
    }
    d.addEventListener("toggle", function () { if (d.open && !loaded) { loaded = true; loadStatus(); } });
    var del = h("button", { class: "btn sm danger", type: "button", text: t("del") });
    armed(del, t("del"), async function () {
      var x = await sb.rpc("admin_delete_task", { _id: k.id });
      if (x.error) { del.disabled = false; toast(t("err_action", { msg: errMsg(x.error) })); return; }
      toast(t("tk_deleted")); tasksView();
    });
    d.appendChild(h("div", { class: "stack", style: "margin-top:10px;gap:10px" }, k.body ? h("p", { text: k.body }) : null,
      h("div", { class: "row" },
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_notify"), onclick: async function () { await sendNotify("task", k.id, false); } }),
        h("button", { class: "btn sm", type: "button", text: t("tk_btn_remind"), onclick: function () { sendNotify("task", k.id, true); } }),
        h("button", { class: "btn sm", type: "button", text: t("bc_btn_refresh"), onclick: loadStatus }), del), st));
    return d;
  }
  function tkForm(users) {
    var title = h("input", { type: "text", id: "tk_title", maxlength: "200", "aria-label": t("tk_f_title") });
    var body = h("textarea", { rows: "3", id: "tk_body", maxlength: "4000", "aria-label": t("tk_f_body") });
    var due = h("input", { type: "date", id: "tk_due", "aria-label": t("tk_f_due") });
    var urgent = h("input", { type: "checkbox", id: "tk_urgent" }), notify = h("input", { type: "checkbox", id: "tk_notify", checked: true });
    var picker = audiencePicker(users), btn = h("button", { class: "btn pri", type: "submit", text: t("tk_create") });
    var form = h("form", { class: "stack", id: "tk_form" }, h("label", { class: "f" }, t("tk_f_title"), title), h("label", { class: "f" }, t("tk_f_body"), body),
      h("label", { class: "f" }, t("tk_f_due"), due), h("label", { class: "row", style: "align-items:center" }, urgent, t("bc_f_urgent")), picker.node,
      h("label", { class: "row", style: "align-items:center" }, notify, t("bc_f_notify")), h("div", { class: "row" }, btn));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (title.value.trim().length < 1) { toast(t("bc_need_title")); return; }
      btn.disabled = true;
      var x = await sb.rpc("admin_create_task", { _title: title.value, _body: body.value, _due: due.value || null, _urgent: urgent.checked, _audience: picker.get(), _broadcast: null });
      if (x.error) { btn.disabled = false; toast(/no_recipients/.test(errMsg(x.error)) ? t("bc_no_recipients") : t("err_action", { msg: errMsg(x.error) })); return; }
      toast(t("tk_created"));
      if (notify.checked) await sendNotify("task", x.data, false);
      tasksView();
    });
    return h("section", { class: "panel stack" }, h("h2", { text: t("tk_new") }), form);
  }
  async function tasksView() {
    var my = renderToken;
    shell("tasks", loadingBox());
    var mine = await sb.rpc("my_tasks");
    var adm = isAdmin() ? await sb.rpc("admin_list_tasks") : null, usr = isAdmin() ? await sb.rpc("admin_list_users") : null;
    if (my !== renderToken) return;
    if (mine.error) { shell("tasks", failBox(mine.error)); return; }
    var list = mine.data || [];
    S.badge = S.badge || {}; S.badge.tk = list.filter(function (x) { return !x.done_at; }).length;
    var parts = [];
    if (isAdmin()) {
      parts.push(tkForm((usr && usr.data) || []));
      var rows = ((adm && adm.data) || []).map(tkAdminRow);
      parts.push(h("section", { class: "panel stack" }, h("h3", { text: t("tk_sent_list", { n: rows.length }) }), rows.length ? rows : h("p", { class: "mute", text: t("tk_empty_admin") })));
    }
    parts.push(h("section", { class: "panel stack" }, h("h2", { text: t("tk_title") }), list.length ? list.map(tkCard) : h("p", { class: "mute", text: t("tk_empty") })));
    shell("tasks", h("div", { class: "stack" }, parts));
  }

  // --- помощник по стандарту (приказ №180): срок считается в браузере, ничего не сохраняется и не отправляется на сервер
  function pgToday() { var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
  function ancRow(no) { return (S.anc || []).filter(function (x) { return x.visit_no === no; })[0] || null; }
  // тексты графика: русский, узбекский (кириллица) или он же латиницей
  function ancLabel(r) { return S.lang === "ru" || !r.label_uz ? r.label : uzT(r.label_uz); }
  function ancNotes(r) { return S.lang === "ru" || !r.notes_uz ? (r.notes || "") : uzT(r.notes_uz); }
  function ancTestLabel(r, i) { var u = r.tests_uz || []; return S.lang === "ru" || !u[i] ? r.tests[i] : uzT(u[i]); }
  function testsList(row) {
    var tests = ((row && row.tests) || []).map(function (_, i) { return ancTestLabel(row, i); });
    return tests.length ? h("ul", { class: "small", style: "margin:4px 0 0 18px" }, tests.map(function (x) { return h("li", { text: x }); })) : h("p", { class: "mute small", text: t("pg_no_tests") });
  }
  function visitBlock(r, extra) {
    return h("div", { class: "stack", style: "gap:4px" }, h("b", { text: ancLabel(r) }), extra || null,
      h("b", { class: "small", text: t("pg_need") }), testsList(r), r.notes ? h("p", { class: "small", text: ancNotes(r) }) : null);
  }
  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function pgSchedule() {
    var rows = (S.anc || []).map(function (r) {
      var fr = h("input", { type: "number", min: "0", max: "60", value: String(r.from_week), style: "width:70px", "aria-label": t("pg_from") });
      var un = h("input", { type: "number", min: "0", max: "60", value: String(r.until_week), style: "width:70px", "aria-label": t("pg_until") });
      var sv = h("button", { class: "btn sm", type: "button", text: t("save") });
      sv.addEventListener("click", async function () {
        sv.disabled = true;
        var x = await sb.rpc("admin_save_anc_row", { _visit: r.visit_no, _from: +fr.value, _until: +un.value, _tests: null, _notes: null });
        sv.disabled = false;
        if (x.error) { toast(/bad_window/.test(errMsg(x.error)) ? t("pg_bad_window") : t("err_action", { msg: errMsg(x.error) })); return; }
        toast(t("u_saved")); pregnantView();
      });
      return h("tr", null, h("td", { text: ancLabel(r) }),
        h("td", null, isAdmin() ? h("div", { class: "row" }, fr, un, sv) : r.from_week + "–" + r.until_week),
        h("td", null, testsList(r)), h("td", { class: "small", text: ancNotes(r) }));
    });
    return h("details", { class: "panel" }, h("summary", { style: "cursor:pointer;font-weight:700", text: t("pg_schedule") }),
      h("p", { class: "mute small", style: "margin-top:8px", text: t("pg_schedule_hint") }),
      h("div", { class: "tbl" }, h("table", null, h("thead", null, h("tr", null, [t("pg_visit_no"), t("pg_window_col"), t("pg_need"), t("pg_notes")].map(function (x) { return h("th", { text: x }); }))), h("tbody", null, rows))));
  }
  // календарный файл: только номер визита и окно — ни имени, ни номера карты, ни даты менструации; создаётся в браузере и никуда не отправляется
  function pgIcs(lmpIso, rows) {
    var today = pgToday(), ymd = function (iso) { return iso.replace(/-/g, ""); };
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OvaBMK Companion//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    rows.forEach(function (r) {
      var start = addDays(lmpIso, r.from_week * 7), end = addDays(lmpIso, r.until_week * 7 + 7);
      if (start < today) start = today;
      if (end <= start) end = addDays(start, 1);
      L.push("BEGIN:VEVENT", "UID:ovabmk-anc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "-" + r.visit_no + "@companion", "DTSTAMP:" + ymd(today) + "T000000Z",
        "DTSTART;VALUE=DATE:" + ymd(start), "DTEND;VALUE=DATE:" + ymd(end),
        "SUMMARY:" + (t("pg_ics_sum") + ": " + ancLabel(r)).replace(/[,;\\]/g, " "), "DESCRIPTION:" + t("pg_ics_desc", { a: r.from_week, b: r.until_week }).replace(/[,;\\]/g, " "),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + t("pg_ics_sum"), "TRIGGER;RELATED=START:PT9H", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    var blob = new Blob([L.join("\r\n")], { type: "text/calendar;charset=utf-8" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "Vizitlar_" + today + ".ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function pgResult(lmpIso) {
    var out = h("div", { class: "stack" });
    if (!lmpIso) { out.appendChild(h("p", { class: "mute", text: t("pg_enter_lmp") })); return out; }
    var days = Math.floor((new Date(pgToday() + "T00:00:00Z") - new Date(lmpIso + "T00:00:00Z")) / 86400000);
    if (isNaN(days) || days < 0 || days > 315) { out.appendChild(h("div", { class: "notice warn", text: t("pg_bad_lmp") })); return out; }
    var w = Math.floor(days / 7), d = days % 7, rows = (S.anc || []).filter(function (r) { return r.visit_no >= 1 && r.visit_no <= 8; });
    out.appendChild(h("div", { class: "row", style: "align-items:center;gap:10px;flex-wrap:wrap" },
      h("span", { class: "chip ok", text: t("pg_calc_weeks", { w: w, d: d }) }), h("span", { class: "mute small", text: t("pg_edd", { d: fmtDate(addDays(lmpIso, 280)) }) })));
    if (w > 42) out.appendChild(h("div", { class: "notice warn", text: t("pg_check_hint") }));
    var upcoming = rows.filter(function (r) { return r.until_week >= w; });
    if (upcoming.length) {
      var ics = h("button", { class: "btn", type: "button", id: "pg_ics", text: t("pg_ics") });
      ics.addEventListener("click", function () { pgIcs(lmpIso, upcoming); });
      out.appendChild(h("div", { class: "stack", style: "gap:4px" }, ics, h("p", { class: "mute small", text: t("pg_ics_hint") })));
    }
    var cur = rows.filter(function (r) { return w >= r.from_week && w <= r.until_week; });
    var past = rows.filter(function (r) { return r.until_week < w; });
    var next = rows.filter(function (r) { return r.from_week > w; })[0];
    if (cur.length) cur.forEach(function (r) { out.appendChild(h("section", { class: "panel stack" }, h("h3", { text: t("pg_now") }), visitBlock(r, h("span", { class: "chip warn", text: t("pg_window", { a: r.from_week, b: r.until_week }) })))); });
    else out.appendChild(h("section", { class: "panel" }, h("h3", { text: t("pg_now") }), h("p", { class: "mute", text: t("pg_none_now") })));
    if (past.length) out.appendChild(h("section", { class: "panel stack" }, h("h3", { text: t("pg_before") }), h("p", { class: "mute small", text: t("pg_before_hint") }),
      past.map(function (r) { return h("details", null, h("summary", { style: "cursor:pointer", text: ancLabel(r) + " · " + t("pg_window", { a: r.from_week, b: r.until_week }) }), visitBlock(r)); })));
    if (next) out.appendChild(h("section", { class: "panel stack" }, h("h3", { text: t("pg_next") }),
      visitBlock(next, h("span", { class: "chip", text: t("pg_next_when", { a: fmtDate(addDays(lmpIso, next.from_week * 7)), b: fmtDate(addDays(lmpIso, next.until_week * 7 + 6)) }) }))));
    return out;
  }
  async function pregnantView() {
    var my = renderToken;
    shell("pregnant", loadingBox());
    var sch = await sb.rpc("anc_schedule_list");
    if (my !== renderToken) return;
    if (sch.error) { shell("pregnant", failBox(sch.error)); return; }
    S.anc = sch.data || [];
    var lmp = h("input", { type: "date", id: "pg_lmp", max: pgToday(), "aria-label": t("pg_lmp") }), res = h("div", { id: "pg_res" }, pgResult(""));
    lmp.addEventListener("input", function () { res.textContent = ""; res.appendChild(pgResult(lmp.value)); });
    shell("pregnant", h("div", { class: "stack" },
      h("section", { class: "panel stack" }, h("h2", { text: t("pg_title") }), h("div", { class: "notice", text: t("pg_privacy") }),
        h("label", { class: "f" }, t("pg_lmp"), lmp)),
      res, pgSchedule()));
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
  document.documentElement.lang = LANGTAG[S.lang] || "ru";
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
