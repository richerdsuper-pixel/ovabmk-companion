// Беременные на сайте (миграция 0021): список доя, карточка с планом по приказу №180, патронаж по приказу №210 (прил. 2),
// приглашение беременной в Telegram, сводка для руководителей, бланк согласия.
// Модуль получает помощники из app.js (window.MothersModule(api)) и сам ничего не хранит в браузере.
window.MothersModule = function (A) {
  var h = A.h, t = A.t, sb = A.sb, S = A.S;
  // факторы риска по НКП «Антенатальный уход. Ведение беременных групп риска» (прил. 2 к приказу №180), по группам
  var RF_GROUPS = [
    ["rg_ob", ["cs_scar", "stillbirth", "neonatal_death", "miscarriage", "ptb_hist", "isoimmun", "gdm_hist", "pe_hist", "pph_hist", "abruption_hist", "macrosomia_hist", "sga_hist"]],
    ["rg_som", ["chronic_htn", "diabetes", "kidney", "autoimmune", "heart", "epilepsy", "asthma", "mental", "substance", "vte_hist", "thrombophilia", "varicose", "coagulopathy"]],
    ["rg_fam", ["dm_family", "pe_family", "vte_family"]],
    ["rg_now", ["multiple", "fetal_anomaly", "previa", "large_fetus", "short_cervix", "pe_now", "bleeding_now", "rh_neg", "doctor_high"]]
  ];
  var RF_SELECTS = { smoke: ["", "smoking", "smoking_heavy"], interval: ["", "interval_lt6", "interval_gt60", "interval_gt10y"], anemia: ["", "anemia", "anemia_severe"] };
  var CLIN = ["doya_qvp", "doya_patronaj", "patronaj_hamshira", "akusher_ginekolog", "oilaviy_shifokor"];
  var HS = null;   // справочник патронажа

  function canMothers() {
    var c = A.myPosCodes();
    return A.isManager() || A.isHead() || c.indexOf("bosh_akusher") >= 0 || CLIN.some(function (x) { return c.indexOf(x) >= 0; });
  }
  function today() { return A.todayS(); }
  function fmtD(s) { return s ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : ""; }
  function gaTxt(days) { return days == null ? "" : t("mo_ga", { w: Math.floor(days / 7), d: days % 7 }); }
  function ageTxt(n) {   // «21 год», «22 года», «25 лет»; по-узбекски — «25 ёш»
    if (S.lang !== "ru") return t("mo_age", { n: n });
    var d = n % 10, h = n % 100;
    return n + " " + (d === 1 && h !== 11 ? "год" : d >= 2 && d <= 4 && (h < 12 || h > 14) ? "года" : "лет");
  }
  function ageOf(bd) { if (!bd) return null; var a = today(), y = +a.slice(0, 4) - +bd.slice(0, 4); if (a.slice(5) < bd.slice(5)) y--; return y; }
  function errText(e) {
    var m = A.errMsg(e), k = ["duplicate", "need_consent", "bad_lmp", "bad_edd", "bad_birth_date", "bad_phone", "bad_full_name", "need_institution", "bad_date", "bad_values", "bad_value", "bad_kind", "bad_form", "forbidden"]
      .filter(function (x) { return m.indexOf(x) >= 0; })[0];
    return k ? t("mo_err_" + k) : t("err_action", { msg: m });
  }
  function telLink(p) { return p ? h("a", { href: "tel:" + p, text: A.fmtPhone(p) }) : null; }
  function riskChip(r) { return h("span", { class: "chip " + (r === "high" ? "bad" : r === "mid" ? "warn" : "ok"), text: t("mo_risk_" + r) }); }
  async function ensureRefs() {
    if (!S.anc) { var a = await sb.rpc("anc_schedule_list"); S.anc = a.data || []; }
    if (!HS) { var b = await sb.rpc("home_schedule_list"); HS = b.data || []; }
    await A.loadInstitutions();
  }
  function hsRow(kind) { return (HS || []).filter(function (x) { return x.kind === kind; })[0] || null; }
  function hsLabel(kind) { var r = hsRow(kind); return kind === "extra" ? t("mo_home_extra") : !r ? kind : S.lang === "ru" ? r.label_ru : A.uzT(r.label_uz); }
  function ancName(no) { var r = A.ancRow(no); return no === 0 ? t("mo_visit_extra") : r ? A.ancLabel(r) : "№" + no; }

  // что сейчас главное по беременной: сигнал, пропуск, визит в окне, патронаж
  function urgency(m) {
    var s = m.state || {};
    return (m.alerts ? 1000 : 0) + (s.missed || 0) * 100 + (s.home_missed || 0) * 60 + (s.due ? 40 : 0) + (s.home_due || 0) * 30 + (m.risk === "high" ? 10 : m.risk === "mid" ? 3 : 0);
  }
  function stateChips(m) {
    var s = m.state || {}, out = [];
    if (m.alerts) out.push(h("span", { class: "chip bad", text: "⚠ " + t("mo_alerts_n", { n: m.alerts }) }));
    if (m.status === "postpartum") out.push(h("span", { class: "chip acc", text: t("mo_pp_day", { d: s.pp_day == null ? "—" : s.pp_day }) }));
    else out.push(h("span", { class: "chip", text: gaTxt(s.ga_days) }));
    if (s.missed) out.push(h("span", { class: "chip bad", text: t("mo_missed_n", { n: s.missed }) }));
    if (s.due && s.next_anc) out.push(h("span", { class: "chip warn", text: t("mo_due_until", { v: s.next_anc.no, d: fmtD(s.next_anc.to) }) }));
    else if (s.next_anc && m.status === "pregnant") out.push(h("span", { class: "chip", text: t("mo_next_from", { v: s.next_anc.no, d: fmtD(s.next_anc.from) }) }));
    if (s.home_missed) out.push(h("span", { class: "chip bad", text: t("mo_home_missed_n", { n: s.home_missed }) }));
    if (s.home_due) out.push(h("span", { class: "chip warn", text: t("mo_home_due_n", { n: s.home_due }) }));
    out.push(riskChip(m.risk));
    out.push(h("span", { class: "chip " + (m.tg ? "acc" : ""), title: t(m.tg ? "mo_tg_on" : "mo_tg_off"), text: m.tg ? "✈ Telegram" : t("mo_tg_no") }));
    return out;
  }

  // ------------------------------------------------------------------ без интернета: список, сохранённый на телефоне
  // Сохраняется при каждой загрузке списка; удаляется при выходе из сайта. Только чтение.
  var OFF_KEY = "ovabmk-offline";
  function netDown(msg) { return !navigator.onLine || /fetch|network|load failed|timed? ?out|ERR_INTERNET/i.test(String(msg || "")); }
  function offSave(all) {
    try {
      var rows = all.slice(0, 600).map(function (m) {
        return { id: m.id, full_name: m.full_name, phone: m.phone, address: m.address, card_no: m.card_no, birth_date: m.birth_date, lmp: m.lmp, edd_us: m.edd_us,
          risk: m.risk, status: m.status, state: m.state, alerts: m.alerts, tg: m.tg, ref_open: m.ref_open, ref_overdue: m.ref_overdue, anemia: m.anemia, gdm: m.gdm, protein: m.protein, plan_missing: m.plan_missing,
          _mah: m.mahalla_id != null ? A.mahName(m.mahalla_id) : "", _inst: A.instName(m.institution_id) };
      });
      localStorage.setItem(OFF_KEY, JSON.stringify({ uid: S.session && S.session.user.id, at: new Date().toISOString(), rows: rows }));
    } catch (e) { /* хранилище недоступно — без офлайна */ }
  }
  function offlineCache(uid) {
    try { var c = JSON.parse(localStorage.getItem(OFF_KEY) || "null"); return c && c.rows && (!uid || c.uid === uid) ? c : null; } catch (e) { return null; }
  }
  function offlineView(uid) {
    var c = offlineCache(uid);
    var at = c ? new Date(c.at) : null, atTxt = at ? fmtD(at.toISOString().slice(0, 10)) + " " + String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0") : "";
    var all = (c ? c.rows : []).map(function (m) {
      var x = Object.assign({}, m, { state: Object.assign({}, m.state || {}) });
      if (x.status === "pregnant") { var l0 = x.edd_us ? A.addDays(x.edd_us, -280) : x.lmp; if (l0) x.state.ga_days = A.dayDiff(today(), l0); }
      return x;
    }).sort(function (a, b) { return urgency(b) - urgency(a) || a.full_name.localeCompare(b.full_name); });
    var search = h("input", { type: "search", id: "ol_q", placeholder: t("mo_search"), "aria-label": t("mo_search") });
    var box = h("div", { class: "stack", id: "ol_list" });
    function draw() {
      var q = search.value.trim().toLowerCase(); box.textContent = "";
      all.filter(function (m) { return !q || (m.full_name + " " + (m.phone || "") + " " + m.address + " " + m._mah).toLowerCase().indexOf(q) >= 0; }).forEach(function (m) {
        var edd = m.edd_us || (m.lmp ? A.addDays(m.lmp, 280) : null);
        box.appendChild(h("div", { class: "mcard" + (m.alerts ? " alert" : "") },
          h("b", { class: "mname", text: m.full_name }),
          h("div", { class: "chips" }, stateChips(m)),
          h("div", { class: "mute small" }, [m._mah, m.address, m._inst].filter(Boolean).join(" · "), m.status === "pregnant" && edd ? " · " + t("ol_edd") + " " + fmtD(edd) : ""),
          m.phone ? h("div", null, "📞 ", telLink(m.phone)) : null));
      });
    }
    search.addEventListener("input", draw);
    A.mount(h("div", null, A.hero(null), h("div", { class: "stack" },
      h("div", { class: "notice warn", id: "ol_notice" }, h("b", { text: "📴 " + t("ol_title") }), h("p", { text: t("ol_hint", { at: atTxt }) }),
        h("p", null, h("button", { class: "btn", type: "button", text: t("ol_retry"), onclick: function () { location.reload(); } }))),
      h("section", { class: "panel stack" }, h("h2", { text: t("mo_title") }), search), box)));
    draw();
  }

  // ------------------------------------------------------------------ список доя
  var FILTERS = ["all", "due", "missed", "home", "risk", "alerts", "ref", "anemia", "noplan", "fp", "notg", "pp"];
  function passes(m, f) {
    var s = m.state || {};
    return f === "all" ? true : f === "due" ? !!s.due : f === "missed" ? s.missed > 0 : f === "home" ? (s.home_due + s.home_missed) > 0
      : f === "risk" ? m.risk === "high" : f === "alerts" ? m.alerts > 0 : f === "notg" ? !m.tg : f === "pp" ? m.status === "postpartum"
      : f === "ref" ? m.ref_open > 0 : f === "anemia" ? !!m.anemia : f === "noplan" ? !!m.plan_missing : f === "fp" ? m.status === "postpartum" && !m.fp_method : true;
  }
  function qParam(route, k) { var r = new RegExp("[?&]" + k + "=([^&]*)").exec(route); return r ? decodeURIComponent(r[1]) : ""; }

  async function listView(route) {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await ensureRefs();
    var archive = qParam(route, "arch") === "1";
    var rr = await Promise.all([sb.rpc("mothers_list", { _archive: archive }), archive ? Promise.resolve({ data: [] }) : sb.rpc("mothers_flags")]), r = rr[0];
    if (my !== A.token()) return;
    if (r.error) { if (netDown(A.errMsg(r.error)) && offlineCache(S.session && S.session.user.id)) return offlineView(S.session.user.id); A.shell("mothers", A.failBox(r.error)); return; }
    var flags = {}; ((rr[1] && rr[1].data) || []).forEach(function (x) { flags[x.mother_id] = x; });
    (r.data || []).forEach(function (m) { var x = flags[m.id] || {}; m.ref_open = x.ref_open || 0; m.ref_overdue = x.ref_overdue || 0; m.fp_method = x.fp_method || null;
      m.anemia = x.anemia || null; m.gdm = x.gdm || null; m.protein = !!x.protein; m.plan_missing = !!x.plan_missing; });
    var all = r.data || [], f = qParam(route, "f") || "all", inst = qParam(route, "i"), q = "";
    if (!archive) offSave(all);
    var insts = Array.from(new Set(all.map(function (m) { return m.institution_id; })));
    var cnt = {}; FILTERS.forEach(function (k) { cnt[k] = all.filter(function (m) { return passes(m, k); }).length; });
    var listBox = h("div", { class: "stack", id: "mo_list" });
    var search = h("input", { type: "search", id: "mo_q", placeholder: t("mo_search"), "aria-label": t("mo_search") });
    var mahSel = h("select", { id: "mo_mah", "aria-label": t("mo_mahalla") }, h("option", { value: "", text: t("mo_all_mah") }),
      Array.from(new Set(all.map(function (m) { return m.mahalla_id; }).filter(function (x) { return x != null; })))
        .map(function (id) { return { id: id, n: A.mahName(id) }; }).sort(function (a, b) { return a.n.localeCompare(b.n); })
        .map(function (x) { return h("option", { value: String(x.id), text: x.n }); }));
    var instSel = insts.length > 1 ? h("select", { id: "mo_inst", "aria-label": t("inst_label") }, h("option", { value: "", text: t("mo_all_inst") }),
      insts.map(function (id) { return h("option", { value: String(id), selected: String(id) === inst, text: A.instName(id) }); })) : null;
    function draw() {
      q = search.value.trim().toLowerCase();
      var list = all.filter(function (m) {
        if (!passes(m, f)) return false;
        if (mahSel.value && String(m.mahalla_id) !== mahSel.value) return false;
        var iv = instSel ? instSel.value : inst;
        if (iv && String(m.institution_id) !== iv) return false;
        if (q && (m.full_name + " " + (m.phone || "") + " " + m.card_no + " " + m.address).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return urgency(b) - urgency(a) || a.full_name.localeCompare(b.full_name); });
      listBox.textContent = "";
      if (!list.length) { listBox.appendChild(h("p", { class: "mute", text: all.length ? t("mo_none_filter") : t("mo_empty") })); return; }
      list.forEach(function (m) {
        var age = ageOf(m.birth_date);
        listBox.appendChild(h("a", { class: "mcard" + (m.alerts ? " alert" : ""), href: "#/mother/" + m.id },
          h("div", { class: "row", style: "justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap" },
            h("b", { class: "mname", text: m.full_name }), h("span", { class: "mute small", text: [age != null ? ageTxt(age) : "", m.card_no ? "№ " + m.card_no : ""].filter(Boolean).join(" · ") })),
          h("div", { class: "chips" }, stateChips(m), m.ref_overdue ? h("span", { class: "chip bad", text: t("mo_ref_overdue") }) : m.ref_open ? h("span", { class: "chip warn", text: t("mo_ref_open") }) : null, labChips(m)),
          h("div", { class: "mute small", text: [A.mahName(m.mahalla_id), m.address, m.phone ? A.fmtPhone(m.phone) : "", insts.length > 1 ? A.instName(m.institution_id) : ""].filter(Boolean).join(" · ") })));
      });
      listBox.appendChild(h("p", { class: "mute small", text: t("mo_shown", { n: list.length, m: all.length }) }));
    }
    var mq = qParam(route, "m"); if (mq) mahSel.value = mq;
    search.addEventListener("input", draw); mahSel.addEventListener("change", draw); if (instSel) instSel.addEventListener("change", draw);
    var seg = h("div", { class: "fchips", role: "tablist" }, FILTERS.map(function (k) {
      return h("button", { type: "button", class: "fchip" + (k === f ? " on" : "") + (k === "alerts" && cnt[k] ? " hot" : ""), "data-f": k, onclick: function () {
        f = k; Array.from(seg.children).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-f") === k); }); draw();
      } }, t("mo_f_" + k), h("span", { class: "n", text: String(cnt[k]) }));
    }));
    var exp = h("button", { class: "btn", type: "button", text: t("mo_export"), onclick: function () { exportList(all); } });
    A.shell("mothers", h("div", { class: "stack" },
      h("section", { class: "panel stack" },
        h("div", { class: "row", style: "justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" },
          h("h2", { text: archive ? t("mo_archive_title") : t("mo_title") }),
          h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" },
            archive ? h("a", { class: "btn", href: "#/mothers", text: t("mo_back_active") }) : h("a", { class: "btn pri", id: "mo_add", href: "#/mother/new", text: "+ " + t("mo_add") }),
            archive ? null : h("a", { class: "btn", id: "mo_import", href: "#/mothers/import", text: "📥 " + t("im_btn") }),
            archive ? null : h("a", { class: "btn", id: "mo_announce", href: "#/announce", text: "📢 " + t("an_btn") }),
            exp, archive ? null : h("a", { class: "btn", href: "#/mothers?arch=1", text: t("mo_archive") }))),
        archive ? null : seg,
        h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" }, search, mahSel, instSel)),
      listBox));
    draw();
  }
  function exportList(all) {
    var head = [t("u_name"), t("mo_birth"), t("mo_phone"), t("mo_mahalla"), t("mo_address"), t("mo_card"), t("inst_label"), t("mo_lmp"), t("mo_edd"), t("mo_ga_col"),
      t("mo_risk"), t("mo_next_visit"), t("mo_missed_col"), t("mo_status"), "Telegram"];
    var rows = all.map(function (m) {
      var s = m.state || {};
      return [m.full_name, fmtD(m.birth_date), m.phone || "", A.mahName(m.mahalla_id), m.address, m.card_no, A.instName(m.institution_id), fmtD(m.lmp), fmtD(s.edd),
        m.status === "pregnant" ? gaTxt(s.ga_days) : "", t("mo_risk_" + m.risk), s.next_anc ? "№" + s.next_anc.no + " " + fmtD(s.next_anc.from) + "–" + fmtD(s.next_anc.to) : "",
        s.missed || 0, t("mo_st_" + m.status), m.tg ? "+" : ""];
    });
    download(window.XLW.write([{ name: t("mo_title"), rows: [head].concat(rows) }]), "Homiladorlar_" + today() + ".xlsx");
  }
  function download(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ------------------------------------------------------------------ форма постановки / изменения
  function myInsts() {
    var ids = [];
    if (S.profile && S.profile.institution_id != null) ids.push(S.profile.institution_id);
    S.scopes.institutions.forEach(function (x) { if (ids.indexOf(x) < 0) ids.push(x); });
    var district = A.isManager() || A.myPosCodes().indexOf("bosh_akusher") >= 0;
    return district ? (S.institutions || []).map(function (i) { return i.id; }) : ids;
  }
  async function formView(id) {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await ensureRefs();
    var m = null;
    if (id) { var r = await sb.rpc("mother_get", { _id: id }); if (my !== A.token()) return; if (r.error) { A.shell("mothers", A.failBox(r.error)); return; } m = r.data; }
    if (my !== A.token()) return;
    var ins = myInsts();
    if (!ins.length) { A.shell("mothers", h("div", { class: "notice warn", text: t("mo_no_inst") })); return; }
    var v = m || {};
    function inp(type, key, attrs) { var a = Object.assign({ type: type, id: "mf_" + key, value: v[key] == null ? "" : String(v[key]) }, attrs || {}); return h("input", a); }
    var name = inp("text", "full_name", { maxlength: "120", required: true, autocomplete: "off", placeholder: t("mo_name_ph") });
    var bd = inp("date", "birth_date", { max: today() }), phone = inp("tel", "phone", { placeholder: "+998 90 123 45 67", inputmode: "tel" });
    if (v.phone) phone.value = A.fmtPhone(v.phone);
    var instSel = h("select", { id: "mf_inst" }, ins.map(function (i) { return h("option", { value: String(i), text: A.instName(i) }); }));
    instSel.value = String(v.institution_id != null ? v.institution_id : ins[0]);
    var mahSel = h("select", { id: "mf_mahalla" });
    function fillMah() {
      var cur = mahSel.value || (v.mahalla_id != null ? String(v.mahalla_id) : ""), inst = +instSel.value;
      var list = S.mahallas.filter(function (x) { var l = A.mahInsts(x.id); return !l.length || l.indexOf(inst) >= 0; });
      mahSel.textContent = ""; mahSel.appendChild(h("option", { value: "", text: t("mo_mah_pick") }));
      list.forEach(function (x) { mahSel.appendChild(h("option", { value: String(x.id), text: x.name })); });
      mahSel.value = list.some(function (x) { return String(x.id) === cur; }) ? cur : "";
    }
    fillMah(); instSel.addEventListener("change", fillMah);
    var addr = inp("text", "address", { maxlength: "200", placeholder: t("mo_address_ph") }), card = inp("text", "card_no", { maxlength: "30" });
    var lmp = inp("date", "lmp", { max: today(), required: true }), edd = inp("date", "edd_us"), gr = inp("number", "gravida", { min: "1", max: "30" }), pa = inp("number", "para", { min: "0", max: "30" });
    var gaOut = h("span", { class: "chip", id: "mf_ga" });
    function showGa() {
      var base = edd.value ? A.addDays(edd.value, -280) : lmp.value;
      if (!base) { gaOut.textContent = t("mo_ga_enter"); return; }
      var d = A.dayDiff(today(), base);
      gaOut.textContent = d < 0 || d > 320 ? t("mo_ga_bad") : gaTxt(d) + " · " + t("mo_edd_s", { d: fmtD(A.addDays(base, 280)) });
    }
    lmp.addEventListener("input", showGa); edd.addEventListener("input", showGa); showGa();
    var have = v.risk_factors || [];
    var ht = inp("number", "height_cm", { min: "120", max: "220", placeholder: "160" }), wt = inp("number", "weight_kg", { min: "30", max: "250", step: "0.1", placeholder: "60" });
    var rfBox = h("div", { class: "stack", id: "mf_rf" }, RF_GROUPS.map(function (g) {
      return h("div", null, h("b", { class: "small", text: t(g[0]) }), h("div", { class: "rf" }, g[1].map(function (k) {
        return h("label", { class: "check small" }, h("input", { type: "checkbox", value: k, checked: have.indexOf(k) >= 0 }), h("span", { text: t("rf_" + k) }));
      })));
    }));
    var sel = {};
    Object.keys(RF_SELECTS).forEach(function (g) {
      sel[g] = h("select", { id: "mf_" + g }, RF_SELECTS[g].map(function (k) { return h("option", { value: k, text: k ? t("rf_" + k) : t("rf_none_" + g) }); }));
      sel[g].value = RF_SELECTS[g].filter(function (k) { return k && have.indexOf(k) >= 0; })[0] || "";
    });
    if (have.indexOf("obesity") >= 0 && !v.weight_kg) rfBox.appendChild(h("p", { class: "small mute", text: t("mo_obesity_legacy") }));
    function factors() {
      var f = Array.from(rfBox.querySelectorAll("input:checked")).map(function (x) { return x.value; });
      Object.keys(sel).forEach(function (g) { if (sel[g].value) f.push(sel[g].value); });
      if (have.indexOf("obesity") >= 0 && !wt.value) f.push("obesity");
      return f;
    }
    var riskOut = h("div", { id: "mf_riskout" }), rq = 0, rtimer = null;
    function evalRisk() {
      clearTimeout(rtimer);
      rtimer = setTimeout(async function () {
        var my2 = ++rq;
        var x = await sb.rpc("risk180_preview", { _d: { birth_date: bd.value, para: pa.value, height_cm: ht.value, weight_kg: wt.value, risk_factors: factors() } });
        if (my2 !== rq || x.error) return;
        riskOut.textContent = ""; riskOut.appendChild(riskPanel(x.data, true));
      }, 250);
    }
    [bd, pa, ht, wt].forEach(function (el) { el.addEventListener("input", evalRisk); el.addEventListener("change", evalRisk); });
    rfBox.addEventListener("change", evalRisk); Object.keys(sel).forEach(function (g) { sel[g].addEventListener("change", evalRisk); });
    evalRisk();
    var notes = h("textarea", { id: "mf_notes", rows: "2", maxlength: "1000", placeholder: t("mo_notes_ph") }); notes.value = v.notes || "";
    var consentChk = h("input", { type: "checkbox", id: "mf_consent", checked: !!v.consent_at }), consentDate = inp("date", "consent_at", { max: today() });
    if (!v.consent_at) consentDate.value = today();
    var err = h("div", { id: "mf_err" });
    var save = h("button", { class: "btn pri", type: "submit", id: "mf_save", text: id ? t("save") : t("mo_add_btn") });
    var form = h("form", { class: "stack" },
      h("section", { class: "panel stack" }, h("h2", { text: id ? t("mo_edit_title") : t("mo_add_title") }),
        h("div", { class: "grid-f" },
          h("label", { class: "f" }, t("mo_full_name"), name), h("label", { class: "f" }, t("mo_birth"), bd), h("label", { class: "f" }, t("mo_phone"), phone),
          h("label", { class: "f" }, t("inst_label"), instSel), h("label", { class: "f" }, t("mo_mahalla"), mahSel), h("label", { class: "f" }, t("mo_address"), addr),
          h("label", { class: "f" }, t("mo_card"), card))),
      h("section", { class: "panel stack" }, h("h3", { text: t("mo_preg_block") }),
        h("div", { class: "grid-f" }, h("label", { class: "f" }, t("mo_lmp"), lmp), h("label", { class: "f" }, t("mo_edd_us"), edd),
          h("label", { class: "f" }, t("mo_gravida"), gr), h("label", { class: "f" }, t("mo_para"), pa)), h("div", null, gaOut)),
      h("section", { class: "panel stack" }, h("h3", { text: t("mo_risk180_title") }), h("p", { class: "mute small", text: t("mo_risk_hint") }),
        h("div", { class: "grid-f" }, h("label", { class: "f" }, t("mo_height"), ht), h("label", { class: "f" }, t("mo_weight0"), wt),
          h("label", { class: "f" }, t("rf_sel_smoke"), sel.smoke), h("label", { class: "f" }, t("rf_sel_interval"), sel.interval), h("label", { class: "f" }, t("rf_sel_anemia"), sel.anemia)),
        rfBox, riskOut, h("label", { class: "f" }, t("mo_notes"), notes)),
      h("section", { class: "panel stack consent" }, h("h3", { text: t("mo_consent") }),
        h("label", { class: "check" }, consentChk, h("span", { text: t("mo_consent_chk") })),
        h("div", { class: "row", style: "gap:10px;flex-wrap:wrap;align-items:end" }, h("label", { class: "f" }, t("mo_consent_date"), consentDate),
          h("a", { class: "btn sm", href: "#/consent", target: "_blank", rel: "noopener", text: "🖨 " + t("mo_consent_print") })),
        h("p", { class: "mute small", text: t("mo_consent_hint") })),
      err, h("div", { class: "row", style: "gap:8px" }, save, h("a", { class: "btn", href: id ? "#/mother/" + id : "#/mothers", text: t("cancel") })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); err.textContent = "";
      if (!id && !consentChk.checked) { err.appendChild(h("div", { class: "notice bad", text: t("mo_err_need_consent") })); return; }
      var d = { full_name: name.value, birth_date: bd.value, phone: phone.value, institution_id: +instSel.value, mahalla_id: mahSel.value ? +mahSel.value : null,
        address: addr.value, card_no: card.value, lmp: lmp.value, edd_us: edd.value, gravida: gr.value, para: pa.value, height_cm: ht.value, weight_kg: wt.value,
        risk_factors: factors(), notes: notes.value,
        consent_at: consentChk.checked ? consentDate.value : "" };
      save.disabled = true;
      var x = await sb.rpc("mother_save", { _id: id || null, _d: d });
      save.disabled = false;
      if (x.error) { err.appendChild(h("div", { class: "notice bad", text: errText(x.error) })); return; }
      A.toast(t("u_saved")); location.hash = "#/mother/" + x.data;
    });
    A.shell("mothers", form);
    if (!id) name.focus();
  }

  // результат оценки риска по протоколу и что делать (тексты рекомендаций — из протокола)
  var DERIVED = ["nullipara", "age_40", "age_35", "bmi_35", "bmi_30", "bmi_fgr", "interval", "para4"];
  function rfName(k) { return DERIVED.indexOf(k) >= 0 ? t("rd_" + k) : t("rf_" + k); }
  function riskPanel(e, preview) {
    if (!e) return h("p", { class: "mute small", text: t("mo_risk_none") });
    var hi = e.level === "high", recs = [];
    recs.push(hi ? "rc_high" : "rc_low");
    if (e.pe === "high") recs.push("rc_pe");
    if (e.gdm) recs.push("rc_gdm");
    if (e.fgr === "high") recs.push("rc_fgr");
    if (e.vte === "high") recs.push("rc_vte_high"); else if (e.vte === "moderate") recs.push("rc_vte_mod");
    if (e.pph) recs.push("rc_pph");
    if ((e.ptb_f || []).indexOf("ptb_hist") >= 0) recs.push("rc_ptb_hist");
    if ((e.ptb_f || []).indexOf("short_cervix") >= 0) recs.push("rc_short_cervix");
    if (e.rh_neg) recs.push("rc_rh");
    if (e.anemia) recs.push("rc_anemia");
    recs.push("rc_all");
    function line(key, list) { return list && list.length ? h("li", null, h("b", { text: t(key) + ": " }), list.map(rfName).join(", ")) : null; }
    var why = h("ul", { class: "small", style: "margin:4px 0 0 18px" },
      (e.reasons || []).filter(function (r) { return !/_risk$/.test(r) && r.indexOf("bmi_") !== 0; }).length
        ? h("li", null, h("b", { text: t("rs_not_normal") + ": " }), (e.reasons || []).filter(function (r) { return !/_risk$/.test(r) && r.indexOf("bmi_") !== 0; }).map(rfName).join(", ")) : null,
      (e.reasons || []).indexOf("bmi_extreme") >= 0 ? h("li", { text: t("rs_bmi_extreme", { b: e.bmi }) }) : (e.reasons || []).indexOf("bmi_risk") >= 0 ? h("li", { text: t("rs_bmi_risk", { b: e.bmi }) }) : null,
      e.pe === "high" ? h("li", null, h("b", { text: t("rs_pe") + ": " }), (e.pe_high || []).concat(e.pe_mod || []).map(rfName).join(", ")) : null,
      e.gdm ? line("rs_gdm", e.gdm_f) : null,
      e.fgr === "high" ? line("rs_fgr", (e.fgr_major || []).concat(e.fgr_minor || [])) : null,
      e.vte !== "none" ? h("li", { text: t("rs_vte", { n: e.vte_score, l: t("vte_" + e.vte) }) }) : null,
      e.pph ? line("rs_pph", e.pph_f) : null,
      e.ptb ? line("rs_ptb", e.ptb_f) : null);
    return h("div", { class: "riskbox " + (hi ? "hi" : "lo"), id: preview ? "mf_riskbox" : "mc_riskbox" },
      h("div", { class: "row", style: "gap:10px;align-items:center;flex-wrap:wrap" }, h("span", { class: "chip " + (hi ? "bad" : "ok"), text: t("mo_risk_" + e.level) }),
        e.bmi ? h("span", { class: "chip", text: t("mo_bmi", { b: e.bmi }) }) : null, e.teen ? h("span", { class: "chip warn", text: t("rs_teen") }) : null,
        h("span", { class: "mute small", text: preview ? t("mo_risk_auto") : t("mo_risk_by180") })),
      hi ? why : null,
      h("b", { class: "small", text: t("rc_title") }), h("ul", { class: "small", style: "margin:4px 0 0 18px" }, recs.map(function (k) { return h("li", { text: t(k) }); })));
  }
  function bpPanel(m) {
    var list = m.bp || [];
    if (!list.length) return null;
    return h("section", { class: "panel stack", id: "mc_bp" }, h("h3", { text: t("mo_bp_diary") }), h("p", { class: "mute small", text: t("mo_bp_diary_hint") }),
      h("div", { class: "chips" }, list.slice(0, 14).map(function (b) {
        var c = b.sys >= 160 || b.dia >= 110 ? "bad" : b.sys >= 140 || b.dia >= 90 ? "warn" : "ok";
        return h("span", { class: "chip " + c, title: A.fmtDT(b.at), text: b.sys + "/" + b.dia + " · " + A.fmtDT(b.at).slice(0, 5) });
      })));
  }

  function weightPanel(m) {
    var ws = m.weights || [], pills = m.pills || [];
    if (!ws.length && !pills.length) return null;
    var days = {}; pills.forEach(function (p) { days[p.day] = 1; });
    var gain = ws.length > 1 ? Math.round((ws[ws.length - 1].kg - ws[0].kg) * 10) / 10 : null;
    return h("section", { class: "panel stack", id: "mc_w" }, h("h3", { text: t("mo_w_diary") }),
      ws.length ? h("div", { class: "chips" }, ws.slice(-12).map(function (w) {
        return h("span", { class: "chip" + (w.src === "self" ? "" : " ok"), text: A.fmtD(w.d).slice(0, 5) + " · " + w.kg + " kg" });
      })) : null,
      gain != null ? h("div", { class: "small", text: t("mo_w_gain", { k: (gain > 0 ? "+" : "") + gain }) }) : null,
      pills.length ? h("div", { class: "small", text: t("mo_pills14", { n: Object.keys(days).length }) }) : null);
  }

  var REF_TARGETS = ["ref_t_maternity", "ref_t_obgyn", "ref_t_therapist", "ref_t_endo", "ref_t_us", "ref_t_lab"];
  function referralsPanel(m, reload) {
    var refs = m.referrals || [], td = today();
    var sel = h("select", { id: "rf_target" }, REF_TARGETS.map(function (k) { return h("option", { value: t(k), text: t(k) }); }), h("option", { value: "", text: t("ref_t_other") }));
    var other = h("input", { id: "rf_other", placeholder: t("ref_other_ph"), maxlength: "200", style: "display:none" });
    sel.addEventListener("change", function () { other.style.display = sel.value ? "none" : ""; });
    var reason = h("input", { id: "rf_reason", placeholder: t("ref_reason"), maxlength: "500" });
    var due = h("input", { id: "rf_due", type: "date", value: addDays(td, 3), min: td, max: addDays(td, 90) });
    var add = h("button", { class: "btn primary", type: "button", id: "rf_add", text: t("ref_add"), onclick: async function () {
      var target = sel.value || other.value.trim();
      if (target.length < 2) { A.toast(t("ref_need_target")); return; }
      add.disabled = true;
      var x = await sb.rpc("referral_save", { _mother: m.id, _target: target, _reason: reason.value, _due: due.value });
      add.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      A.toast(t("ref_saved")); reload();
    } });
    return h("section", { class: "panel stack", id: "mc_ref" }, h("h3", { text: t("ref_title") }), h("p", { class: "mute small", text: t("ref_hint") }),
      refs.map(function (r) {
        var over = !r.arrived_at && r.due_date < td;
        var res = h("input", { placeholder: t("ref_result"), maxlength: "500", class: "rf_res" });
        return h("div", { class: "qa rf" }, h("div", null, h("b", { text: "➡️ " + r.target }), r.reason ? " — " + r.reason : "",
            " ", h("span", { class: "chip " + (r.arrived_at ? "ok" : over ? "bad" : "warn"), text: r.arrived_at ? t("ref_arrived_on", { d: A.fmtD(r.arrived_at) }) + (r.result ? ": " + r.result : "") : over ? t("mo_ref_overdue") : t("ref_until", { d: A.fmtD(r.due_date) }) })),
          h("div", { class: "mute small" }, A.fmtDT(r.created_at) + (r.by ? " · " + r.by : "") + " ", h("a", { class: "btn sm", href: "#/ref/" + r.id, text: "🖨 " + t("rfp_btn") })),
          r.arrived_at ? null : h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" }, res, h("button", { class: "btn sm", type: "button", text: t("ref_mark_arrived"), onclick: async function () {
            var x = await sb.rpc("referral_arrived", { _id: r.id, _date: td, _result: res.value });
            if (x.error) { A.toast(errText(x.error)); return; } reload();
          } })));
      }),
      h("div", { class: "grid2" }, h("label", null, t("ref_target"), sel, other), h("label", null, t("ref_due"), due)), h("label", null, t("ref_reason"), reason), add);
  }
  // ------------------------------------------------------------------ анализы: гемоглобин, сахар натощак, белок в моче (пороги ВОЗ — на сервере)
  function labChips(m) {
    var out = [];
    if (m.anemia) out.push(h("span", { class: "chip " + (m.anemia === "mild" ? "warn" : "bad"), text: t("lab_anemia_" + m.anemia) }));
    if (m.gdm) out.push(h("span", { class: "chip bad", text: t("lab_gdm_" + m.gdm) }));
    if (m.protein) out.push(h("span", { class: "chip bad", text: t("lab_protein") }));
    if (m.plan_missing) out.push(h("span", { class: "chip warn", text: t("bp_missing") }));
    return out;
  }
  var PROT = ["−", "+", "++", "+++"];
  function labVal(l) { return l.kind === "urine_protein" ? PROT[+l.val] || l.val : String(l.val).replace(".", ",") + " " + t("lab_unit_" + l.kind); }
  function labsPanel(m, reload) {
    var labs = m.labs || [], fl = m.lab_flags || {}, td = today();
    var kind = h("select", { id: "lab_kind" }, ["hb", "glucose", "urine_protein"].map(function (k) { return h("option", { value: k, text: t("lab_k_" + k) }); }));
    var val = h("input", { id: "lab_val", type: "text", inputmode: "decimal", placeholder: "110", maxlength: "6" });
    var prot = h("select", { id: "lab_prot", style: "display:none" }, PROT.map(function (x, i) { return h("option", { value: String(i), text: x }); }));
    kind.addEventListener("change", function () { var p = kind.value === "urine_protein"; prot.style.display = p ? "" : "none"; val.style.display = p ? "none" : ""; val.placeholder = kind.value === "hb" ? "110" : "4,8"; });
    var d = h("input", { id: "lab_d", type: "date", value: td, max: td });
    var add = h("button", { class: "btn primary", type: "button", id: "lab_add", text: t("lab_add"), onclick: async function () {
      var v = kind.value === "urine_protein" ? +prot.value : parseFloat(String(val.value).replace(",", "."));
      if (!isFinite(v)) { A.toast(t("mo_err_bad_value")); return; }
      add.disabled = true;
      var x = await sb.rpc("lab_save", { _mother: m.id, _kind: kind.value, _val: v, _d: d.value });
      add.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      A.toast(t("u_saved")); reload();
    } });
    var flags = labChips({ anemia: fl.anemia, gdm: fl.gdm, protein: fl.protein });
    return h("section", { class: "panel stack", id: "mc_labs" }, h("h3", { text: t("lab_title") }),
      flags.length ? h("div", { class: "chips", id: "lab_flags" }, flags, h("span", { class: "mute small", text: t("lab_flag_hint") })) : h("p", { class: "mute small", text: t("lab_hint") }),
      labs.length ? h("div", { class: "tbl" }, h("table", { id: "lab_tbl" }, h("tbody", null, labs.slice(0, 12).map(function (l) {
        return h("tr", null, h("td", { text: A.fmtD(l.d) }), h("td", { text: t("lab_k_" + l.kind) }), h("td", null, h("b", { text: labVal(l) })), h("td", { class: "mute small", text: l.by || "" }),
          h("td", null, h("button", { class: "btn sm", type: "button", title: t("lab_del"), text: "✕", onclick: async function () {
            var x = await sb.rpc("lab_delete", { _id: l.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); } })));
      })))) : null,
      h("div", { class: "row", style: "gap:8px;align-items:end;flex-wrap:wrap" }, h("label", null, t("lab_kind"), kind), h("label", null, t("lab_val"), val, prot), h("label", null, t("lab_date"), d), add));
  }
  // ------------------------------------------------------------------ план родов (доя или сама беременная в «Моей странице»)
  function birthplanPanel(m, reload) {
    var b = m.birthplan || {};
    function inp(k, ph, attrs) { return h("input", Object.assign({ id: "bp_" + k, value: b[k] || "", placeholder: ph || "", maxlength: "120" }, attrs || {})); }
    var place = inp("place", t("bp_place_ph")), comp = inp("companion", t("bp_companion_ph")), drv = inp("driver", t("bp_driver_ph"));
    var ph = inp("driver_phone", "+998 90 123 45 67", { type: "tel", inputmode: "tel", value: b.driver_phone ? A.fmtPhone(b.driver_phone) : "" });
    var docs = h("input", { type: "checkbox", id: "bp_docs", checked: !!b.docs }), bag = h("input", { type: "checkbox", id: "bp_bag", checked: !!b.bag });
    var save = h("button", { class: "btn primary", type: "button", id: "bp_save", text: t("save"), onclick: async function () {
      save.disabled = true;
      var x = await sb.rpc("birthplan_save", { _mother: m.id, _p: { place: place.value, companion: comp.value, driver: drv.value, driver_phone: ph.value, docs: docs.checked, bag: bag.checked } });
      save.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      if (x.data && x.data.error) { A.toast(t(x.data.error === "bad_phone" ? "mo_err_bad_phone" : "mo_err_bad_form")); return; }
      A.toast(t("u_saved")); reload();
    } });
    var ga = (m.state || {}).ga_days || 0;
    return h("section", { class: "panel stack", id: "mc_bplan" }, h("h3", { text: "🚗 " + t("bp_title") }),
      h("p", { class: "mute small", text: t("bp_hint") + (b.updated_at ? " · " + t(b.by_mother ? "bp_by_mother" : "bp_by_staff") + " " + A.fmtDT(b.updated_at) : "") }),
      !b.place && ga >= 252 ? h("div", { class: "notice warn", text: t("bp_missing_long") }) : null,
      h("div", { class: "grid2" }, h("label", null, t("bp_place"), place), h("label", null, t("bp_companion"), comp), h("label", null, t("bp_driver"), drv), h("label", null, t("bp_driver_phone"), ph)),
      h("div", { class: "row", style: "gap:16px;flex-wrap:wrap" }, h("label", { class: "check" }, docs, h("span", { text: t("bp_docs") })), h("label", { class: "check" }, bag, h("span", { text: t("bp_bag") }))), save);
  }
  // место беременной при сигнале: ссылки на карты
  function locLink(m, alertId) {
    var l = (m.locs || []).filter(function (x) { return x.alert_id === alertId; })[0];
    if (!l) return null;
    var q = l.lat + "," + l.lon;
    return h("div", { class: "small", style: "margin-top:4px" }, "📍 ", h("a", { href: "https://maps.google.com/?q=" + q, target: "_blank", rel: "noopener", class: "loc-g", text: "Google" }), " · ",
      h("a", { href: "https://yandex.uz/maps/?pt=" + l.lon + "," + l.lat + "&z=16", target: "_blank", rel: "noopener", text: "Яндекс" }));
  }

  var FP = ["none", "lam", "condom", "pills", "injection", "implant", "iud", "sterilization"];
  function fpPanel(m, reload) {
    var fp = m.fp || {};
    var sel = h("select", { id: "fp_method" }, h("option", { value: "", text: "—" }), FP.map(function (k) { return h("option", { value: k, selected: fp.method === k ? "" : null, text: t("fp_" + k) }); }));
    var dt = h("input", { id: "fp_date", type: "date", value: fp.date || today(), max: today() });
    return h("section", { class: "panel stack", id: "mc_fp" }, h("h3", { text: t("fp_title") }), h("p", { class: "mute small", text: t("fp_hint") }),
      fp.method ? h("div", null, h("span", { class: "chip ok", text: t("fp_" + fp.method) + " · " + A.fmtD(fp.date) })) : h("div", null, h("span", { class: "chip warn", text: t("fp_not_yet") })),
      h("div", { class: "grid2" }, h("label", null, t("fp_method"), sel), h("label", null, t("fp_date"), dt)),
      h("button", { class: "btn", type: "button", id: "fp_save", text: t("save"), onclick: async function () {
        var x = await sb.rpc("mother_fp_save", { _id: m.id, _method: sel.value || null, _date: sel.value ? dt.value : null });
        if (x.error) { A.toast(errText(x.error)); return; } A.toast(t("fp_saved")); reload();
      } }));
  }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function questionsPanel(m) {
    var qs = m.questions || [];
    if (!qs.length) return null;
    return h("section", { class: "panel stack", id: "mc_q" }, h("h3", { text: t("mo_questions") }), h("p", { class: "mute small", text: t("mo_q_hint") }),
      qs.slice(0, 10).map(function (x) {
        return h("div", { class: "qa" }, h("div", null, h("b", { text: "❓ " + x.q }), " ", h("span", { class: "mute small", text: A.fmtDT(x.at) })),
          x.a ? h("div", { text: "💬 " + x.a + (x.a_by ? " — " + x.a_by : "") }) : h("span", { class: "chip warn", text: t("mo_q_wait") }));
      }));
  }
  function babyPanel(m) {
    var b = m.baby || [];
    if (!b.length) return null;
    function of(k) { return b.filter(function (x) { return x.kind === k; }); }
    var w = of("weight"), v = of("vaccine"), f = of("feed");
    return h("section", { class: "panel stack", id: "mc_baby" }, h("h3", { text: t("mo_baby") }),
      w.length ? h("div", null, h("b", { class: "small", text: t("mo_b_weight") + ": " }), w.slice(-8).map(function (x) { return h("span", { class: "chip", text: A.fmtD(x.d).slice(0, 5) + " · " + x.val + " g" }); })) : null,
      f.length ? h("div", { class: "small" }, h("b", { text: t("mo_b_feed") + ": " }), t("mo_feed_" + f[f.length - 1].val) + " (" + A.fmtD(f[f.length - 1].d) + ")") : null,
      v.length ? h("div", { class: "small" }, h("b", { text: t("mo_b_vaccine") + ": " }), v.map(function (x) { return x.val + " (" + A.fmtD(x.d).slice(0, 5) + ")"; }).join(", ")) : null);
  }

  // ------------------------------------------------------------------ карточка
  async function cardView(id) {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await ensureRefs();
    var r = await sb.rpc("mother_get", { _id: id });
    if (my !== A.token()) return;
    if (r.error) { A.shell("mothers", A.failBox(r.error)); return; }
    var m = r.data, s = m.state || {}, age = ageOf(m.birth_date), reload = function () { cardView(id); };
    var parts = [];
    // шапка
    parts.push(h("section", { class: "panel stack" },
      h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap" },
        h("div", null, h("a", { href: "#/mothers", class: "small", text: "← " + t("mo_title") }), h("h2", { id: "mc_name", text: m.full_name }),
          h("div", { class: "mute small", text: [age != null ? ageTxt(age) : "", m.card_no ? "№ " + m.card_no : "", A.instName(m.institution_id)].filter(Boolean).join(" · ") })),
        h("div", { class: "row", style: "gap:6px;flex-wrap:wrap;align-items:start" },
          h("a", { class: "btn sm", href: "#/mother/" + id + "/edit", text: t("edit") }),
          m.status !== "closed" ? archiveBtn(m, reload) : h("button", { class: "btn sm", type: "button", text: t("mo_unarchive"), onclick: async function () {
            var x = await sb.rpc("mother_archive", { _id: id, _back: true }); if (x.error) { A.toast(errText(x.error)); return; } reload(); } }),
          (A.isAdmin() || (m.created_by === S.session.user.id && Date.now() - new Date(m.created_at).getTime() < 86400000)) ? delBtn(m) : null)),
      h("div", { class: "chips" }, stateChips({ state: s, status: m.status, risk: m.risk, tg: !!m.tg, alerts: (m.alerts || []).filter(function (a) { return !a.seen_at; }).length })),
      h("div", { class: "kv" },
        kv(t("mo_phone"), telLink(m.phone) || "—"), kv(t("mo_mahalla"), A.mahName(m.mahalla_id) || "—"), kv(t("mo_address"), m.address || "—"),
        kv(t("mo_lmp"), fmtD(m.lmp)), kv(t("mo_edd"), fmtD(s.edd) + (m.edd_us ? " (" + t("mo_by_us") + ")" : "")),
        kv(t("mo_gp"), (m.gravida ? "G" + m.gravida : "") + (m.para != null ? " P" + m.para : "") || "—"),
        kv(t("mo_hw"), m.height_cm || m.weight_kg ? (m.height_cm || "—") + " см / " + (m.weight_kg || "—") + " кг" : "—"),
        kv(t("mo_consent"), fmtD(m.consent_at)), m.notes ? kv(t("mo_notes"), m.notes) : null,
        m.outcome ? kv(t("mo_outcome"), t("mo_out_" + m.outcome) + " · " + fmtD(m.outcome_date) + (m.discharge_date ? " · " + t("mo_discharge_s", { d: fmtD(m.discharge_date) }) : "")) : null)));
    // тревожные сигналы
    var unseen = (m.alerts || []).filter(function (a) { return !a.seen_at; });
    if (unseen.length) parts.push(h("section", { class: "panel stack alertbox", id: "mc_alerts" }, h("h3", { text: "⚠ " + t("mo_alerts_title") }),
      unseen.map(function (a) {
        return h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap" },
          h("div", null, h("b", { text: a.signs.map(function (k) { return t("sg_" + k); }).join(", ") }), h("div", { class: "mute small", text: A.fmtDT(a.at) }), locLink(m, a.id)),
          h("button", { class: "btn sm pri", type: "button", text: t("mo_alert_seen"), onclick: async function () {
            var x = await sb.rpc("mother_alert_seen", { _id: a.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); } }));
      }), h("p", { class: "small", text: t("mo_alert_hint") })));
    parts.push(h("section", { class: "panel stack" }, h("h3", { text: t("mo_risk180_title") }), riskPanel(m.risk_eval, false)));
    var bpp = bpPanel(m); if (bpp) parts.push(bpp);
    var wp = weightPanel(m); if (wp) parts.push(wp);
    if (m.status !== "closed") parts.push(referralsPanel(m, reload));
    if (m.status !== "closed") parts.push(labsPanel(m, reload));
    if (m.status === "pregnant") parts.push(birthplanPanel(m, reload));
    if (m.outcome === "delivered" && m.status !== "closed") parts.push(fpPanel(m, reload));
    var qp = questionsPanel(m); if (qp) parts.push(qp);
    var bb = babyPanel(m); if (bb) parts.push(bb);
    // план визитов
    if (m.status === "pregnant") parts.push(ancPanel(m, s, reload));
    parts.push(homePanel(m, s, reload));
    if (m.status !== "closed") parts.push(tgPanel(m, reload), outcomePanel(m, reload));
    // история
    parts.push(historyPanel(m, reload));
    A.shell("mothers", h("div", { class: "stack" }, parts));
  }
  function kv(k, v) { return h("div", null, h("span", { class: "mute small", text: k }), h("div", null, v)); }
  function archiveBtn(m, reload) {
    var b = h("button", { class: "btn sm", type: "button", text: t("mo_to_archive") });
    A.armed(b, t("mo_to_archive"), async function () { var x = await sb.rpc("mother_archive", { _id: m.id, _back: false }); if (x.error) { A.toast(errText(x.error)); b.disabled = false; return; } A.toast(t("mo_archived")); location.hash = "#/mothers"; });
    return b;
  }
  function delBtn(m) {
    var b = h("button", { class: "btn sm danger", type: "button", text: t("del") });
    A.armed(b, t("del"), async function () { var x = await sb.rpc("mother_delete", { _id: m.id }); if (x.error) { A.toast(errText(x.error)); b.disabled = false; return; } A.toast(t("mo_deleted")); location.hash = "#/mothers"; });
    return b;
  }
  function stLabel(st) { return h("span", { class: "chip " + (st === "done" ? "ok" : st === "missed" ? "bad" : st === "due" ? "warn" : ""), text: t("mo_st_v_" + st) }); }

  function ancPanel(m, s, reload) {
    var box = h("div", { class: "stack", id: "mc_anc" });
    (s.anc || []).forEach(function (a) {
      var row = A.ancRow(a.no), formBox = h("div");
      var btn = a.state === "skip" ? null : h("button", { class: "btn sm" + (a.state === "due" || a.state === "missed" ? " pri" : ""), type: "button", "data-visit": String(a.no),
        text: a.state === "done" ? t("mo_change") : t("mo_mark"), onclick: function () { formBox.textContent = ""; formBox.appendChild(ancForm(m, a.no, row, reload)); btn.style.display = "none"; } });
      box.appendChild(h("div", { class: "vrow " + a.state },
        h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center" },
          h("div", null, h("b", { text: ancName(a.no) }), h("div", { class: "mute small", text: fmtD(a.from) + " – " + fmtD(a.to) + (a.date ? " · " + t("mo_done_on", { d: fmtD(a.date) }) : "") })),
          h("div", { class: "row", style: "gap:6px;align-items:center" }, stLabel(a.state), btn)), formBox));
    });
    var extraBox = h("div");
    var extra = h("button", { class: "btn sm", type: "button", id: "mc_extra", text: "+ " + t("mo_visit_extra"), onclick: function () { extraBox.textContent = ""; extraBox.appendChild(ancForm(m, 0, null, reload)); } });
    return h("section", { class: "panel stack" }, h("h3", { text: t("mo_anc_title") }), h("p", { class: "mute small", text: t("mo_anc_hint") }), box, h("div", null, extra), extraBox);
  }
  function ancForm(m, no, row, reload) {
    var prev = (m.visits || []).filter(function (v) { return v.no === no && no > 0; })[0] || {};
    var date = h("input", { type: "date", class: "vf_date", value: prev.date || today(), max: today(), min: m.lmp });
    var sys = h("input", { type: "number", class: "vf_sys", min: "50", max: "260", placeholder: "120", value: prev.bp_sys || "", style: "width:80px" });
    var dia = h("input", { type: "number", class: "vf_dia", min: "30", max: "180", placeholder: "80", value: prev.bp_dia || "", style: "width:80px" });
    var wt = h("input", { type: "number", class: "vf_wt", min: "25", max: "250", step: "0.1", value: prev.weight || "", style: "width:90px" });
    var done = prev.tests || [];
    var tests = row && row.tests && row.tests.length ? h("div", { class: "rf" }, row.tests.map(function (x, i) {
      return h("label", { class: "check small" }, h("input", { type: "checkbox", value: x, checked: done.indexOf(x) >= 0 }), h("span", { text: A.ancTestLabel(row, i) }));
    })) : null;
    var note = h("input", { type: "text", class: "vf_note", maxlength: "500", value: prev.note || "", placeholder: t("mo_note_ph") });
    var bpWarn = h("div");
    function checkBp() {
      bpWarn.textContent = "";
      if ((+sys.value >= 140) || (+dia.value >= 90)) bpWarn.appendChild(h("div", { class: "notice bad", text: t("mo_bp_high") }));
    }
    sys.addEventListener("input", checkBp); dia.addEventListener("input", checkBp);
    var save = h("button", { class: "btn pri sm", type: "submit", text: t("save") });
    var f = h("form", { class: "vform stack" },
      h("div", { class: "row", style: "gap:10px;flex-wrap:wrap;align-items:end" }, h("label", { class: "f" }, t("mo_date"), date),
        h("label", { class: "f" }, t("mo_bp"), h("div", { class: "row", style: "gap:4px;align-items:center" }, sys, "/", dia)), h("label", { class: "f" }, t("mo_weight"), wt)),
      bpWarn, tests ? h("div", null, h("b", { class: "small", text: t("mo_tests_done") }), tests) : null, h("label", { class: "f" }, t("mo_note"), note), h("div", null, save));
    f.addEventListener("submit", async function (e) {
      e.preventDefault(); save.disabled = true;
      var x = await sb.rpc("anc_visit_save", { _mother: m.id, _visit: no, _date: date.value, _bp_sys: sys.value ? +sys.value : null, _bp_dia: dia.value ? +dia.value : null,
        _weight: wt.value ? +wt.value : null, _tests: tests ? Array.from(tests.querySelectorAll("input:checked")).map(function (c) { return c.value; }) : [], _note: note.value });
      save.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      A.toast(t("mo_visit_saved")); reload();
    });
    return f;
  }

  function homePanel(m, s, reload) {
    var box = h("div", { class: "stack", id: "mc_home" });
    (s.home || []).forEach(function (a) {
      var formBox = h("div");
      var btn = a.state === "skip" ? null : h("button", { class: "btn sm" + (a.state === "due" || a.state === "missed" ? " pri" : ""), type: "button", "data-home": a.kind,
        text: a.state === "done" ? t("mo_change") : t("mo_mark"), onclick: function () { formBox.textContent = ""; formBox.appendChild(homeForm(m, a.kind, reload)); btn.style.display = "none"; } });
      box.appendChild(h("div", { class: "vrow " + a.state },
        h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center" },
          h("div", null, h("b", { text: hsLabel(a.kind) }), h("div", { class: "mute small", text: fmtD(a.from) + " – " + fmtD(a.to) + (a.date ? " · " + t("mo_done_on", { d: fmtD(a.date) }) : "") })),
          h("div", { class: "row", style: "gap:6px;align-items:center" }, stLabel(a.state), btn)), formBox));
    });
    if (!(s.home || []).length) box.appendChild(h("p", { class: "mute small", text: t("mo_home_none") }));
    var extraBox = h("div");
    var extra = h("button", { class: "btn sm", type: "button", text: "+ " + t("mo_home_extra"), onclick: function () { extraBox.textContent = ""; extraBox.appendChild(homeForm(m, "extra", reload)); } });
    return h("section", { class: "panel stack" }, h("h3", { text: t("mo_home_title") }), h("p", { class: "mute small", text: t("mo_home_hint") }), box, h("div", null, extra), extraBox);
  }
  function homeForm(m, kind, reload) {
    var prev = (m.home || []).filter(function (v) { return v.kind === kind && kind !== "extra"; })[0] || {};
    var row = hsRow(kind), both = (row && row.who === "both") || (kind === "extra" && m.status === "postpartum");
    var date = h("input", { type: "date", class: "hf_date", value: prev.date || today(), max: today(), min: m.lmp });
    function yn(cls, val) { var s = h("select", { class: cls }, h("option", { value: "", text: "—" }), h("option", { value: "1", text: t("mo_ok") }), h("option", { value: "0", text: t("mo_not_ok") })); s.value = val === true ? "1" : val === false ? "0" : ""; return s; }
    var mo = yn("hf_mother", prev.mother_ok), ba = both ? yn("hf_baby", prev.baby_ok) : null;
    var ref = h("input", { type: "checkbox", class: "hf_ref", checked: !!prev.referred });
    var note = h("input", { type: "text", class: "hf_note", maxlength: "500", value: prev.note || "", placeholder: t("mo_home_note_ph") });
    var save = h("button", { class: "btn pri sm", type: "submit", text: t("save") });
    var f = h("form", { class: "vform stack" },
      h("div", { class: "row", style: "gap:10px;flex-wrap:wrap;align-items:end" }, h("label", { class: "f" }, t("mo_date"), date),
        h("label", { class: "f" }, t("mo_mother_state"), mo), ba ? h("label", { class: "f" }, t("mo_baby_state"), ba) : null),
      h("label", { class: "check small" }, ref, h("span", { text: t("mo_referred") })), h("label", { class: "f" }, t("mo_note"), note), h("div", null, save));
    f.addEventListener("submit", async function (e) {
      e.preventDefault(); save.disabled = true;
      var x = await sb.rpc("home_visit_save", { _mother: m.id, _kind: kind, _date: date.value, _mother_ok: mo.value === "" ? null : mo.value === "1",
        _baby_ok: !ba || ba.value === "" ? null : ba.value === "1", _referred: ref.checked, _note: note.value });
      save.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      A.toast(t("mo_visit_saved")); reload();
    });
    return f;
  }

  function tgPanel(m, reload) {
    var box = h("div", { class: "stack", id: "mc_tg" });
    if (m.tg) {
      var off = h("button", { class: "btn sm", type: "button", text: t("mo_tg_unlink") });
      A.armed(off, t("mo_tg_unlink"), async function () { var x = await sb.rpc("mother_unlink", { _id: m.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); });
      box.appendChild(h("div", { class: "notice ok", text: t("mo_tg_linked", { d: fmtD((m.tg.linked_at || "").slice(0, 10)) }) }));
      var fp = familyPanel(m); if (fp) box.appendChild(fp);
      box.appendChild(h("div", null, off));
    } else {
      var out = h("div", { class: "stack" });
      var gen = h("button", { class: "btn pri", type: "button", id: "mc_invite", text: t("mo_tg_invite"), onclick: async function () {
        gen.disabled = true;
        var x = await sb.rpc("mother_invite", { _id: m.id });
        gen.disabled = false;
        if (x.error) { A.toast(errText(x.error)); return; }
        var link = "https://t.me/" + A.CFG.botName + "?start=" + x.data;
        out.textContent = "";
        var qr = h("div", { class: "qr", id: "mc_qr" });
        out.appendChild(h("div", { class: "row", style: "gap:16px;flex-wrap:wrap;align-items:center" }, qr,
          h("div", { class: "stack", style: "gap:8px;min-width:0;flex:1" },
            h("p", { text: t("mo_tg_scan") }),
            h("input", { type: "text", readonly: true, value: link, id: "mc_link", onclick: function (e) { e.target.select(); } }),
            h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" },
              h("button", { class: "btn sm", type: "button", text: t("copy"), onclick: function () { try { navigator.clipboard.writeText(link); A.toast(t("copied")); } catch (e) {} } }),
              m.phone ? h("a", { class: "btn sm", href: "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(t("mo_tg_share_text")), target: "_blank", rel: "noopener", text: t("mo_tg_share") }) : null),
            h("p", { class: "mute small", text: t("mo_tg_valid") }))));
        drawQr(qr, link);
      } });
      box.appendChild(h("p", { class: "small", text: t("mo_tg_why") }));
      box.appendChild(h("div", null, gen)); box.appendChild(out);
    }
    return h("section", { class: "panel stack" }, h("h3", { text: "✈ " + t("mo_tg_title") }), box);
  }
  var qrLib = null;
  function drawQr(el, text) {
    function go() { try { var q = window.qrcode(0, "M"); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { el.textContent = ""; } }
    if (window.qrcode) return go();
    if (!qrLib) qrLib = new Promise(function (res) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    qrLib.then(go);
  }

  function outcomePanel(m, reload) {
    var out = h("select", { id: "mo_out" }, ["delivered", "miscarriage", "transferred", "moved", "other"].map(function (k) { return h("option", { value: k, text: t("mo_out_" + k) }); }));
    if (m.outcome) out.value = m.outcome;
    var date = h("input", { type: "date", id: "mo_out_date", max: today(), min: m.lmp, value: m.outcome_date || today() });
    var dis = h("input", { type: "date", id: "mo_out_dis", max: today(), value: m.discharge_date || "" });
    var babies = h("input", { type: "number", id: "mo_out_babies", min: "0", max: "5", value: String(m.babies || 1), style: "width:70px" });
    var disL = h("label", { class: "f" }, t("mo_discharge"), dis), babL = h("label", { class: "f" }, t("mo_babies"), babies);
    function sync() { var d = out.value === "delivered"; disL.style.display = d ? "" : "none"; babL.style.display = d ? "" : "none"; }
    out.addEventListener("change", sync); sync();
    var save = h("button", { class: "btn sm pri", type: "button", id: "mo_out_save", text: t("save"), onclick: async function () {
      save.disabled = true;
      var x = await sb.rpc("mother_outcome", { _id: m.id, _outcome: out.value, _date: date.value, _discharge: out.value === "delivered" && dis.value ? dis.value : null, _babies: +babies.value || 1 });
      save.disabled = false;
      if (x.error) { A.toast(errText(x.error)); return; }
      A.toast(t("u_saved")); if (out.value === "delivered") reload(); else location.hash = "#/mothers";
    } });
    var undo = m.outcome ? h("button", { class: "btn sm", type: "button", text: t("mo_out_undo"), onclick: async function () {
      var x = await sb.rpc("mother_outcome", { _id: m.id, _outcome: null, _date: null, _discharge: null, _babies: null }); if (x.error) { A.toast(errText(x.error)); return; } reload(); } }) : null;
    return h("details", { class: "panel", open: m.status === "pregnant" && (m.state || {}).ga_days >= 259 ? true : null },
      h("summary", { style: "cursor:pointer;font-weight:800", text: m.status === "postpartum" ? t("mo_outcome") : t("mo_outcome_set") }),
      h("div", { class: "stack", style: "margin-top:10px" },
        h("div", { class: "row", style: "gap:10px;flex-wrap:wrap;align-items:end" }, h("label", { class: "f" }, t("mo_outcome"), out), h("label", { class: "f" }, t("mo_date"), date), disL, babL),
        h("p", { class: "mute small", text: t("mo_outcome_hint") }), h("div", { class: "row", style: "gap:6px" }, save, undo)));
  }

  function historyPanel(m, reload) {
    var items = [];
    (m.visits || []).forEach(function (v) {
      var del = h("button", { class: "btn sm danger", type: "button", text: "×", title: t("del") });
      A.armed(del, "×", async function () { var x = await sb.rpc("anc_visit_delete", { _id: v.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); });
      items.push({ d: v.date, el: h("tr", null, h("td", { class: "mono small", text: fmtD(v.date) }), h("td", { text: ancName(v.no) }),
        h("td", { class: "small", text: [v.bp_sys ? t("mo_bp") + " " + v.bp_sys + "/" + (v.bp_dia || "—") : "", v.weight ? v.weight + " " + t("mo_kg") : "", (v.tests || []).length ? t("mo_tests_n", { n: v.tests.length }) : "", v.note].filter(Boolean).join(" · ") }),
        h("td", { class: "small mute", text: v.by || "" }), h("td", null, del)) });
    });
    (m.home || []).forEach(function (v) {
      var del = h("button", { class: "btn sm danger", type: "button", text: "×", title: t("del") });
      A.armed(del, "×", async function () { var x = await sb.rpc("home_visit_delete", { _id: v.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); });
      var st = [v.mother_ok === true ? t("mo_mother_ok") : v.mother_ok === false ? t("mo_mother_bad") : "", v.baby_ok === true ? t("mo_baby_ok") : v.baby_ok === false ? t("mo_baby_bad") : "",
        v.referred ? t("mo_referred_s") : "", v.note].filter(Boolean).join(" · ");
      items.push({ d: v.date, el: h("tr", null, h("td", { class: "mono small", text: fmtD(v.date) }), h("td", { text: "🏠 " + hsLabel(v.kind) }), h("td", { class: "small", text: st }),
        h("td", { class: "small mute", text: v.by || "" }), h("td", null, del)) });
    });
    items.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
    return h("section", { class: "panel stack" }, h("h3", { text: t("mo_history") }),
      items.length ? h("div", { class: "tbl" }, h("table", null, h("tbody", null, items.map(function (x) { return x.el; })))) : h("p", { class: "mute small", text: t("mo_history_empty") }));
  }

  // ------------------------------------------------------------------ патронаж: обход по махаллям
  async function patronageView(route) {
    var my = A.token();
    A.shell("patronage", A.loadingBox());
    await ensureRefs();
    var r = await sb.rpc("mothers_list", { _archive: false });
    if (my !== A.token()) return;
    if (r.error) { A.shell("patronage", A.failBox(r.error)); return; }
    var horizon = qParam(route, "w") === "1" ? 7 : 0, t0 = today(), until = A.addDays(t0, horizon);
    var items = [];
    (r.data || []).forEach(function (m) {
      var s = m.state || {};
      (s.home || []).forEach(function (a) {
        if (a.state === "missed" || a.state === "due" || (a.state === "next" && a.from <= until)) items.push({ m: m, kind: a.kind, st: a.state, from: a.from, to: a.to });
      });
      if (s.missed > 0) items.push({ m: m, kind: "invite", st: "missed", n: s.missed });
      if (m.alerts) items.push({ m: m, kind: "alert", st: "missed" });
    });
    var groups = {};
    items.forEach(function (it) { var k = it.m.mahalla_id == null ? "" : String(it.m.mahalla_id); (groups[k] = groups[k] || []).push(it); });
    var keys = Object.keys(groups).sort(function (a, b) { return (A.mahName(+a) || "я").localeCompare(A.mahName(+b) || "я"); });
    var body = keys.map(function (k) {
      var list = groups[k].sort(function (a, b) { return (a.m.address || "").localeCompare(b.m.address || "") || a.m.full_name.localeCompare(b.m.full_name); });
      return h("section", { class: "panel stack route" }, h("h3", { text: (k ? A.mahName(+k) : t("mo_no_mah")) + " · " + list.length }),
        list.map(function (it) { return routeItem(it); }));
    });
    A.shell("patronage", h("div", { class: "stack" },
      h("section", { class: "panel stack" },
        h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center" }, h("h2", { text: t("pt_title") }),
          h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" },
            h("a", { class: "btn sm" + (horizon ? "" : " pri"), href: "#/patronage", text: t("pt_today") }),
            h("a", { class: "btn sm" + (horizon ? " pri" : ""), href: "#/patronage?w=1", text: t("pt_week") }),
            h("button", { class: "btn sm", type: "button", text: "🖨 " + t("pt_print"), onclick: function () { window.print(); } }))),
        h("p", { class: "mute small", text: t("pt_hint") })),
      items.length ? body : h("div", { class: "notice ok", text: t("pt_empty") })));
  }
  function routeItem(it) {
    var m = it.m, formBox = h("div");
    var what = it.kind === "invite" ? h("span", { class: "chip bad", text: t("pt_invite", { n: it.n }) })
      : it.kind === "alert" ? h("span", { class: "chip bad", text: "⚠ " + t("mo_alerts_n", { n: m.alerts }) })
      : h("span", { class: "chip " + (it.st === "missed" ? "bad" : it.st === "due" ? "warn" : ""), text: hsLabel(it.kind) + " · " + fmtD(it.from) + "–" + fmtD(it.to) });
    var btn = it.kind === "invite" || it.kind === "alert" ? h("a", { class: "btn sm", href: "#/mother/" + m.id, text: t("mo_open") })
      : h("button", { class: "btn sm pri", type: "button", "data-home": it.kind, text: t("mo_mark"), onclick: async function () {
          var r = await sb.rpc("mother_get", { _id: m.id }); if (r.error) { A.toast(errText(r.error)); return; }
          formBox.textContent = ""; formBox.appendChild(homeForm(r.data, it.kind, function () { patronageView(location.hash.slice(1)); })); btn.style.display = "none"; } });
    return h("div", { class: "vrow " + it.st },
      h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center" },
        h("div", null, h("a", { href: "#/mother/" + m.id, class: "mname", text: m.full_name }),
          h("div", { class: "small mute" }, [m.address || "", m.status === "postpartum" ? t("mo_pp_day", { d: (m.state || {}).pp_day }) : gaTxt((m.state || {}).ga_days)].filter(Boolean).join(" · "), " ", telLink(m.phone))),
        h("div", { class: "row", style: "gap:6px;align-items:center;flex-wrap:wrap" }, what, btn)), formBox);
  }

  // ------------------------------------------------------------------ сводка для руководителей
  async function summaryView() {
    var my = A.token();
    A.shell("mosum", A.loadingBox());
    await ensureRefs();
    var res = await Promise.all([sb.rpc("mothers_summary"), sb.rpc("mothers_trend")]), r = res[0], tr = res[1];
    if (my !== A.token()) return;
    if (r.error) { A.shell("mosum", A.failBox(r.error)); return; }
    var rows = r.data || [];
    var COLS = ["active", "pregnant", "postpartum", "high_risk", "anc_due", "anc_missed_women", "home_due", "home_missed", "tg", "alerts", "registered_month", "early", "delivered_month", "teen", "age35"];
    function sum(list) { var o = {}; COLS.forEach(function (c) { o[c] = list.reduce(function (a, x) { return a + (x[c] || 0); }, 0); }); return o; }
    var byInst = {};
    rows.forEach(function (x) { (byInst[x.institution_id] = byInst[x.institution_id] || []).push(x); });
    var total = sum(rows);
    function cells(o, inst) {
      return COLS.map(function (c) {
        var v = o[c], bad = (c === "anc_missed_women" || c === "home_missed" || c === "alerts") && v > 0;
        var txt = c === "tg" ? v + (o.active ? " (" + Math.round(v * 100 / o.active) + "%)" : "") : c === "early" ? v + (o.registered_month ? " (" + Math.round(v * 100 / o.registered_month) + "%)" : "") : String(v);
        var link = inst != null && (c === "anc_missed_women" || c === "home_missed" || c === "alerts" || c === "high_risk") && v > 0
          ? h("a", { href: "#/mothers?i=" + inst + "&f=" + (c === "anc_missed_women" ? "missed" : c === "home_missed" ? "home" : c === "alerts" ? "alerts" : "risk"), text: txt }) : txt;
        return h("td", { class: "num" + (bad ? " badn" : "") }, link);
      });
    }
    var body = [];
    Object.keys(byInst).sort(function (a, b) { return A.instName(+a).localeCompare(A.instName(+b)); }).forEach(function (k) {
      var list = byInst[k], o = sum(list);
      body.push(h("tr", { class: "inst" }, h("th", { text: A.instName(+k) }), cells(o, +k)));
      list.filter(function (x) { return x.mahalla_id != null; }).sort(function (a, b) { return A.mahName(a.mahalla_id).localeCompare(A.mahName(b.mahalla_id)); })
        .forEach(function (x) { body.push(h("tr", { class: "sub" }, h("td", { text: "— " + A.mahName(x.mahalla_id) }), cells(x, null))); });
    });
    body.push(h("tr", { class: "tot" }, h("th", { text: t("ms_total") }), cells(total, null)));
    var exp = h("button", { class: "btn", type: "button", id: "ms_xlsx", text: t("mo_export"), onclick: function () {
      var head = [t("inst_label"), t("mo_mahalla")].concat(COLS.map(function (c) { return t("ms_" + c); }));
      var data = rows.map(function (x) { return [A.instName(x.institution_id), A.mahName(x.mahalla_id)].concat(COLS.map(function (c) { return x[c] || 0; })); });
      data.push([t("ms_total"), ""].concat(COLS.map(function (c) { return total[c]; })));
      download(window.XLW.write([{ name: t("ms_title"), rows: [head].concat(data) }]), "Homiladorlar_svodka_" + today() + ".xlsx");
    } });
    A.shell("mosum", h("div", { class: "stack" },
      h("div", { class: "kpis" },
        kpi(t("ms_active"), total.active), kpi(t("ms_high_risk"), total.high_risk, total.high_risk ? "warn" : ""), kpi(t("ms_anc_missed_women"), total.anc_missed_women, total.anc_missed_women ? "bad" : "ok"),
        kpi(t("ms_home_missed"), total.home_missed, total.home_missed ? "bad" : "ok"), kpi(t("ms_early_pct"), total.registered_month ? Math.round(total.early * 100 / total.registered_month) + "%" : "—"),
        kpi(t("ms_tg_pct"), total.active ? Math.round(total.tg * 100 / total.active) + "%" : "—")),
      mapPanel(rows),
      trendPanel(tr && !tr.error ? tr.data || [] : []),
      monthPanel(),
      comparePanel(),
      staffLoadPanel(),
      surveyPanel(),
      h("section", { class: "panel stack" },
        h("div", { class: "row", style: "justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center" }, h("h2", { text: t("ms_title") }), exp),
        h("p", { class: "mute small", text: t("ms_hint") }),
        rows.length ? h("div", { class: "tbl" }, h("table", { class: "sumtbl", id: "ms_tbl" },
          h("thead", null, h("tr", null, h("th", { text: t("inst_label") }), COLS.map(function (c) { return h("th", { class: "num", text: t("ms_" + c) }); }))),
          h("tbody", null, body))) : h("p", { class: "mute", text: t("mo_empty") }))));
  }
  // графики по месяцам (12 месяцев): постановка и ранняя постановка, высокий риск, роды, визиты и патронаж, сигналы
  function trendPanel(rows) {
    if (!rows.length || !window.CH) return null;
    var MO = t("ms_months").split(",");
    function lbl(m) { return MO[+m.slice(5, 7) - 1] + " " + m.slice(2, 4); }
    function chart(id, title, key, tipFn) {
      var total = rows.reduce(function (a, x) { return a + (x[key] || 0); }, 0);
      return h("div", { class: "trend", id: id }, h("div", { class: "row", style: "justify-content:space-between;gap:6px" }, h("b", { text: title }), h("span", { class: "mute small", text: t("ms_t_year") + ": " + total })),
        window.CH.line(rows.map(function (x) { return { x: lbl(x.month), y: x[key] || 0, tip: tipFn ? tipFn(x) : String(x[key] || 0) }; }), { aria: title, caption: title }));
    }
    return h("section", { class: "panel stack", id: "ms_trend" }, h("h2", { text: t("ms_trend") }), h("p", { class: "mute small", text: t("ms_trend_hint") }),
      h("div", { class: "trends" },
        chart("tr_reg", t("ms_t_reg"), "registered", function (x) { return x.registered + " · " + t("ms_t_early") + ": " + x.early + (x.registered ? " (" + Math.round(x.early * 100 / x.registered) + "%)" : ""); }),
        chart("tr_high", t("ms_t_high"), "high_risk"),
        chart("tr_birth", t("ms_t_birth"), "delivered"),
        chart("tr_anc", t("ms_t_anc"), "anc_visits", function (x) { return x.anc_visits + " · " + t("ms_t_home") + ": " + x.home_visits; }),
        chart("tr_alerts", t("ms_t_alerts"), "alerts")));
  }
  // карта района: плитка на каждую махаллю — цвет по пропускам и сигналам, число на учёте и высокий риск
  function mapPanel(rows) {
    var mh = rows.filter(function (x) { return x.mahalla_id != null; });
    if (!mh.length) return null;
    var by = {};
    mh.forEach(function (x) { var o = by[x.mahalla_id] = by[x.mahalla_id] || { id: x.mahalla_id, active: 0, high: 0, missed: 0, alerts: 0, insts: [] };
      o.active += x.active || 0; o.high += x.high_risk || 0; o.missed += (x.anc_missed_women || 0) + (x.home_missed || 0); o.alerts += x.alerts || 0; o.insts.push(x.institution_id); });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return A.mahName(a.id).localeCompare(A.mahName(b.id)); });
    var max = Math.max.apply(null, list.map(function (o) { return o.active; }).concat([1]));
    return h("section", { class: "panel stack", id: "ms_map" }, h("h2", { text: t("ms_map") }), h("p", { class: "mute small", text: t("ms_map_hint") }),
      h("div", { class: "mapgrid" }, list.map(function (o) {
        var tone = o.alerts || o.missed >= 2 ? "bad" : o.missed || o.high ? "warn" : "ok";
        return h("a", { class: "mtile t-" + tone, href: "#/mothers?i=" + o.insts[0] + "&m=" + o.id, title: A.mahName(o.id),
            style: "--w:" + Math.max(0.35, o.active / max).toFixed(2) },
          h("b", { text: A.mahName(o.id) }), h("span", { class: "big", text: String(o.active) }),
          h("span", { class: "small", text: [o.high ? t("ms_map_high", { n: o.high }) : "", o.missed ? t("ms_map_missed", { n: o.missed }) : "", o.alerts ? "⚠️ " + o.alerts : ""].filter(Boolean).join(" · ") || t("ms_map_ok") }));
      })),
      h("div", { class: "legend small mute" }, h("span", { class: "chip ok", text: t("ms_map_ok") }), " ", h("span", { class: "chip warn", text: t("ms_map_l_warn") }), " ", h("span", { class: "chip bad", text: t("ms_map_l_bad") })));
  }
  // отчёт за месяц по учреждениям — Excel
  var MR_COLS = ["on_register", "registered", "early", "high_risk", "delivered", "anc_visits", "home_visits", "referred", "referred_arrived", "fp_counseled", "anemia", "alerts", "tg"];
  function monthPanel() {
    var cur = today().slice(0, 7);
    var mi = h("input", { type: "month", id: "mr_month", value: cur, max: cur });
    var out = h("div", { id: "mr_out" });
    var btn = h("button", { class: "btn primary", type: "button", id: "mr_go", text: t("mr_go"), onclick: async function () {
      btn.disabled = true; out.textContent = "";
      var r = await sb.rpc("mothers_month_report", { _month: (mi.value || cur) + "-01" });
      btn.disabled = false;
      if (r.error) { A.toast(errText(r.error)); return; }
      var rows = r.data || [], tot = {}; MR_COLS.forEach(function (c) { tot[c] = rows.reduce(function (a, x) { return a + (x[c] || 0); }, 0); });
      var head = [t("inst_label")].concat(MR_COLS.map(function (c) { return t("mr_" + c); }));
      var data = rows.map(function (x) { return [A.instName(x.institution_id)].concat(MR_COLS.map(function (c) { return x[c] || 0; })); });
      data.push([t("ms_total")].concat(MR_COLS.map(function (c) { return tot[c]; })));
      out.appendChild(h("div", { class: "tbl" }, h("table", { class: "sumtbl", id: "mr_tbl" }, h("thead", null, h("tr", null, head.map(function (x, i) { return h("th", { class: i ? "num" : "", text: x }); }))),
        h("tbody", null, data.map(function (row, ri) { return h("tr", { class: ri === data.length - 1 ? "tot" : "" }, row.map(function (v, i) { return h(i ? "td" : "th", { class: i ? "num" : "", text: String(v) }); })); })))));
      out.appendChild(h("button", { class: "btn", type: "button", id: "mr_xlsx", text: t("mo_export"), onclick: function () {
        download(window.XLW.write([{ name: t("mr_title"), rows: [[t("mr_title") + " — " + (mi.value || cur)], head].concat(data) }]), "Homiladorlar_oylik_" + (mi.value || cur) + ".xlsx");
      } }));
    } });
    return h("section", { class: "panel stack", id: "ms_month" }, h("h2", { text: t("mr_title") }), h("p", { class: "mute small", text: t("mr_hint") }),
      h("div", { class: "row", style: "gap:8px;align-items:end;flex-wrap:wrap" }, h("label", null, t("mr_month"), mi), btn), out);
  }
  // до и после: два месяца рядом по району (для оценки пилота)
  function comparePanel() {
    var cur = today().slice(0, 7), d = new Date(cur + "-15T12:00:00"); d.setMonth(d.getMonth() - 3);
    var ma = h("input", { type: "month", id: "cmp_a", value: d.toISOString().slice(0, 7), max: cur }), mb = h("input", { type: "month", id: "cmp_b", value: cur, max: cur });
    var out = h("div", { id: "cmp_out" });
    function sum(rows) { var o = {}; MR_COLS.forEach(function (c) { o[c] = (rows || []).reduce(function (a, x) { return a + (x[c] || 0); }, 0); }); return o; }
    function pct(a, b) { return b ? Math.round(a * 100 / b) : null; }
    // [ключ, значение, «больше — лучше» (null — без оценки), проценты]
    function ind(o) {
      return [["cmp_early_pct", pct(o.early, o.registered), true, true], ["cmp_registered", o.registered, null], ["cmp_hr", o.high_risk, null],
        ["cmp_anc", o.anc_visits, true], ["cmp_home", o.home_visits, true], ["cmp_ref_pct", pct(o.referred_arrived, o.referred), true, true],
        ["cmp_fp", o.fp_counseled, true], ["cmp_tg_pct", pct(o.tg, o.on_register), true, true], ["cmp_anemia", o.anemia, null], ["cmp_alerts", o.alerts, null]];
    }
    var btn = h("button", { class: "btn primary", type: "button", id: "cmp_go", text: t("cmp_go"), onclick: async function () {
      btn.disabled = true; out.textContent = "";
      var r = await Promise.all([sb.rpc("mothers_month_report", { _month: (ma.value || cur) + "-01" }), sb.rpc("mothers_month_report", { _month: (mb.value || cur) + "-01" })]);
      btn.disabled = false;
      if (r[0].error || r[1].error) { A.toast(errText(r[0].error || r[1].error)); return; }
      var A_ = ind(sum(r[0].data)), B_ = ind(sum(r[1].data));
      function fmt(v, p) { return v == null ? "—" : v + (p ? "%" : ""); }
      out.appendChild(h("div", { class: "tbl" }, h("table", { class: "sumtbl", id: "cmp_tbl" },
        h("thead", null, h("tr", null, h("th", { text: t("cmp_ind") }), h("th", { class: "num", text: t("cmp_a") + " · " + ma.value }), h("th", { class: "num", text: t("cmp_b") + " · " + mb.value }), h("th", { class: "num", text: t("cmp_diff") }))),
        h("tbody", null, A_.map(function (a, i) {
          var b = B_[i], dv = a[1] == null || b[1] == null ? null : b[1] - a[1];
          var tone = dv == null || dv === 0 || a[2] == null ? "" : (dv > 0) === a[2] ? "ok" : "bad";
          var dTxt = dv == null ? "—" : (dv > 0 ? "+" : "") + dv + (a[3] ? " " + t("cmp_pp") : "") + (tone ? " · " + t(tone === "ok" ? "cmp_better" : "cmp_worse") : "");
          return h("tr", null, h("th", { text: t(a[0]) }), h("td", { class: "num", text: fmt(a[1], a[3]) }), h("td", { class: "num", text: fmt(b[1], b[3]) }),
            h("td", { class: "num" }, h("span", { class: tone ? "chip " + tone : "", text: dTxt })));
        })))));
    } });
    return h("section", { class: "panel stack", id: "ms_cmp" }, h("h2", { text: t("cmp_title") }), h("p", { class: "mute small", text: t("cmp_hint") }),
      h("div", { class: "row", style: "gap:8px;align-items:end;flex-wrap:wrap" }, h("label", null, t("cmp_a"), ma), h("label", null, t("cmp_b"), mb), btn), out);
  }
  function kpi(label, val, tone) { return h("div", { class: "kpi " + (tone || "") }, h("div", { class: "kv-v", text: String(val) }), h("div", { class: "small mute", text: label })); }

  // ------------------------------------------------------------------ советы: питание беременной и кормящей, памятка доя
  function adviceCards(list, conv) {
    return h("div", { class: "adv" }, list.map(function (x) {
      return h("section", { class: "panel adv-card t-" + x.tone + (x.doya ? " noprint" : ""), id: "adv_" + x.id },
        h("h3", null, h("span", { "aria-hidden": "true", text: x.icon + " " }), conv(x.title)),
        h("ul", null, x.items.map(function (it) { return h("li", { text: conv(it) }); })));
    }));
  }
  function adviceView(route) {
    var tab = ["memo", "vacc"].indexOf(qParam(route, "t")) >= 0 ? qParam(route, "t") : "food";
    var L = S.lang === "ru" ? "ru" : "uz", conv = S.lang === "uzl" ? window.uzLat : function (x) { return x; };
    var data = (window.ADVICE && window.ADVICE[tab] && window.ADVICE[tab][L]) || [];
    var tabs = h("div", { class: "fchips noprint", role: "tablist" }, ["food", "memo", "vacc"].map(function (k) {
      return h("a", { class: "fchip" + (k === tab ? " on" : ""), href: "#/advice?t=" + k, role: "tab", "aria-selected": k === tab ? "true" : "false", text: t("adv_" + k) });
    }));
    A.shell("advice", h("div", { class: "stack" },
      h("section", { class: "panel stack" },
        h("div", { class: "row", style: "justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" },
          h("h2", { text: t(tab === "food" ? "adv_food_title" : tab === "vacc" ? "vc_title" : "adv_memo_title") }),
          h("button", { class: "btn pri", type: "button", id: "adv_print", text: "🖨 " + t("pt_print"), onclick: function () { window.print(); } })),
        h("p", { class: "mute small", text: t(tab === "food" ? "adv_food_hint" : tab === "vacc" ? "vc_sub" : "adv_memo_hint") }), tabs),
      tab === "vacc" ? (function () { var b = h("section", { class: "panel stack", id: "vc_box" }, A.loadingBox()); vaccTab(b); return b; })() : adviceCards(data, conv),
      h("p", { class: "mute small", text: t("adv_src") })));
  }

  // ------------------------------------------------------------------ загрузка беременных из Excel (готовый список доя)
  // Столбцы — по шаблону (русские или узбекские заголовки). Каждая строка сохраняется как обычная постановка на учёт (mother_save):
  // те же проверки, дубли не создаются, группа риска считается сервером. Факторы риска доя отмечает потом в карточке.
  var IM_COLS = [["full_name", "im_c_name"], ["birth_date", "im_c_bd"], ["phone", "im_c_phone"], ["mahalla", "im_c_mah"], ["address", "im_c_addr"], ["card_no", "im_c_card"],
    ["lmp", "im_c_lmp"], ["edd_us", "im_c_edd"], ["gravida", "im_c_g"], ["para", "im_c_p"], ["height_cm", "im_c_h"], ["weight_kg", "im_c_w"], ["consent_at", "im_c_cons"]];
  var XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (ok, bad) { var sc = document.createElement("script"); sc.src = XLSX_URL; sc.onload = function () { ok(window.XLSX); }; sc.onerror = bad; document.head.appendChild(sc); });
  }
  function normH(x) { return String(x == null ? "" : x).toLowerCase().replace(/[^a-zа-яёўқғҳ0-9]/g, ""); }
  function headerMap(row) {
    var idx = {};
    row.forEach(function (cell, i) {
      var n = normH(cell);
      IM_COLS.forEach(function (c) {
        var ru = normH(window.I18N.ru[c[1]]), uz = normH(window.I18N.uz[c[1]]), uzl = normH(window.uzLat(window.I18N.uz[c[1]]));
        if (n && (n === ru || n === uz || n === uzl) && idx[c[0]] == null) idx[c[0]] = i;
      });
    });
    return idx;
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function imDate(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + "-" + p2(v.getMonth() + 1) + "-" + p2(v.getDate());
    if (typeof v === "number" && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); }
    var s = String(v).trim(), m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(s);
    if (m) return m[3] + "-" + p2(+m[2]) + "-" + p2(+m[1]);
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : "bad";
  }
  function imPhone(v) {
    var d = String(v == null ? "" : v).replace(/\D/g, "");
    if (!d) return "";
    if (d.length === 9) d = "998" + d;
    return d.length === 12 && d.slice(0, 3) === "998" ? "+" + d : "bad";
  }
  // строки файла → данные для mother_save + замечания
  function imRows(aoa, inst, consentAll) {
    var idx = headerMap(aoa[0] || []), byOrder = Object.keys(idx).length < 2;
    if (byOrder) IM_COLS.forEach(function (c, i) { idx[c[0]] = i; });
    var mahs = (S.mahallas || []).filter(function (x) { return A.mahInsts(x.id).indexOf(inst) >= 0; });
    var first = aoa[0] || [], skip = !byOrder || ["", "bad"].indexOf(imDate(first[6])) >= 0 ? 1 : 0;   // без узнаваемых заголовков: первая строка — данные, если в ней дата ДПМ
    return aoa.slice(skip)
      .filter(function (r) { return r && r.some(function (x) { return x != null && String(x).trim() !== ""; }); }).slice(0, 500)
      .map(function (r) {
        var g = function (k) { return idx[k] == null ? "" : r[idx[k]]; }, warn = [];
        var d = { institution_id: inst, full_name: String(g("full_name") || "").trim(), birth_date: imDate(g("birth_date")), phone: imPhone(g("phone")),
          address: String(g("address") || "").trim(), card_no: String(g("card_no") || "").trim(), lmp: imDate(g("lmp")), edd_us: imDate(g("edd_us")),
          gravida: String(g("gravida") || "").trim(), para: String(g("para") || "").trim(), height_cm: String(g("height_cm") || "").trim(),
          weight_kg: String(g("weight_kg") || "").replace(",", ".").trim(), consent_at: imDate(g("consent_at")) || consentAll || "", risk_factors: [], notes: "", mahalla_id: null };
        var mh = String(g("mahalla") || "").trim().toLowerCase();
        if (mh) { var hit = mahs.filter(function (x) { return x.name.toLowerCase() === mh || window.uzLat(x.name).toLowerCase() === mh; })[0]; if (hit) d.mahalla_id = hit.id; else warn.push(t("im_w_mah", { m: g("mahalla") })); }
        var err = d.full_name.length < 5 ? "mo_err_bad_full_name" : !d.lmp && !d.edd_us ? "im_e_lmp" : d.lmp === "bad" || d.edd_us === "bad" || d.birth_date === "bad" || d.consent_at === "bad" ? "im_e_date"
          : d.phone === "bad" ? "mo_err_bad_phone" : !d.consent_at ? "mo_err_need_consent" : null;
        if (!d.lmp && d.edd_us && d.edd_us !== "bad") d.lmp = A.addDays(d.edd_us, -280);
        return { d: d, err: err, warn: warn };
      });
  }
  function importView() {
    var ins = myInsts();
    if (!ins.length) { A.shell("mothers", h("div", { class: "notice warn", text: t("mo_no_inst") })); return; }
    var instSel = h("select", { id: "im_inst" }, ins.map(function (id) { return h("option", { value: String(id), text: A.instName(id) }); }));
    var file = h("input", { type: "file", id: "im_file", accept: ".xlsx,.xls,.csv" });
    var allChk = h("input", { type: "checkbox", id: "im_all" }), allDate = h("input", { type: "date", id: "im_all_date", value: today(), max: today() });
    var out = h("div", { id: "im_out", class: "stack" });
    var rows = [];
    var tpl = h("button", { class: "btn", type: "button", id: "im_tpl", text: "⬇ " + t("im_tpl"), onclick: function () {
      var head = IM_COLS.map(function (c) { return t(c[1]); });
      var ex = [t("im_ex_name"), "15.03.1998", "+998 90 123 45 67", (S.mahallas || [])[0] ? S.mahallas[0].name : "", t("im_ex_addr"), "125", "02.08.2026", "", "2", "1", "160", "58", today().split("-").reverse().join(".")];
      download(window.XLW.write([{ name: t("im_title"), rows: [head, ex] }]), "Homiladorlar_shablon.xlsx");
    } });
    function draw() {
      out.textContent = "";
      if (!rows.length) return;
      var okN = rows.filter(function (r) { return !r.err; }).length;
      out.appendChild(h("p", { id: "im_sum", text: t("im_found", { n: rows.length, ok: okN, bad: rows.length - okN }) }));
      out.appendChild(h("div", { class: "tbl" }, h("table", { id: "im_tbl" },
        h("thead", null, h("tr", null, ["#", t("im_c_name"), t("im_c_lmp"), t("im_c_phone"), t("im_c_mah"), t("im_state")].map(function (x) { return h("th", { text: x }); }))),
        h("tbody", null, rows.map(function (r, i) {
          return h("tr", { class: r.err ? "im-bad" : "" }, h("td", { text: String(i + 1) }), h("td", { text: r.d.full_name || "—" }), h("td", { text: r.d.lmp && r.d.lmp !== "bad" ? fmtD(r.d.lmp) : "—" }),
            h("td", { text: r.d.phone && r.d.phone !== "bad" ? A.fmtPhone(r.d.phone) : "" }), h("td", { text: r.d.mahalla_id ? A.mahName(r.d.mahalla_id) : "" }),
            h("td", { class: "im-st" }, r.res ? h("span", { class: "chip " + (r.res.ok ? "ok" : "bad"), text: r.res.text }) : r.err ? h("span", { class: "chip bad", text: t(r.err) }) : h("span", { class: "chip", text: t("im_ready") }),
              r.warn.length ? h("div", { class: "mute small", text: r.warn.join("; ") }) : null));
        })))));
      var go = h("button", { class: "btn primary", type: "button", id: "im_go", disabled: !okN, text: t("im_go", { n: okN }), onclick: async function () {
        go.disabled = true; var done = 0, dup = 0, fail = 0;
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i]; if (r.err || r.res) continue;
          var x = await sb.rpc("mother_save", { _id: null, _d: r.d });
          if (x.error) { var dp = /duplicate/.test(A.errMsg(x.error)); if (dp) dup++; else fail++; r.res = { ok: false, text: dp ? t("im_dup") : errText(x.error) }; }
          else { done++; r.res = { ok: true, text: t("im_done1") }; }
          if (i % 10 === 9) draw();
        }
        draw();
        out.insertBefore(h("div", { class: "notice " + (fail ? "warn" : "ok"), id: "im_result", text: t("im_result", { ok: done, dup: dup, bad: fail }) }), out.firstChild);
        out.appendChild(h("a", { class: "btn", href: "#/mothers", text: t("mo_title") }));
      } });
      out.appendChild(h("div", { class: "row", style: "gap:8px" }, go));
      out.appendChild(h("p", { class: "mute small", text: t("im_after") }));
    }
    async function parse() {
      var f = file.files && file.files[0]; if (!f) return;
      out.textContent = ""; out.appendChild(A.loadingBox());
      try {
        var X = await loadXlsx();
        var wb = /\.csv$/i.test(f.name) ? X.read(await f.text(), { type: "string", raw: true }) : X.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        var aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
        rows = imRows(aoa, +instSel.value, allChk.checked ? allDate.value : "");
        if (!rows.length) { out.textContent = ""; out.appendChild(h("div", { class: "notice warn", text: t("im_empty") })); return; }
        draw();
      } catch (e) { out.textContent = ""; out.appendChild(h("div", { class: "notice bad", text: t("im_read_err") })); }
    }
    file.addEventListener("change", parse); allChk.addEventListener("change", parse); allDate.addEventListener("change", parse); instSel.addEventListener("change", parse);
    A.shell("mothers", h("div", { class: "stack" },
      h("section", { class: "panel stack" },
        h("div", { class: "row", style: "justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" }, h("h2", { text: t("im_title") }), tpl),
        h("p", { class: "mute small", text: t("im_hint") }),
        h("div", { class: "row", style: "gap:12px;align-items:end;flex-wrap:wrap" }, ins.length > 1 ? h("label", null, t("inst_label"), instSel) : null, h("label", null, t("im_file"), file)),
        h("label", { class: "check" }, allChk, h("span", { text: t("im_all") }), allDate)),
      out));
  }

  // ------------------------------------------------------------------ бланк согласия (печать)
  function consentView() {
    var inst = S.profile && S.profile.institution_id != null ? A.instName(S.profile.institution_id) : "";
    function block(lang) {
      var T = function (k) { var L = window.I18N[lang === "ru" ? "ru" : "uz"]; var s = L[k] || window.I18N.ru[k]; return lang === "uzl" ? window.uzLat(s) : s; };
      return h("div", { class: "consent-doc" },
        h("h2", { style: "text-align:center", text: T("cf_title") }), h("p", { style: "text-align:center", class: "small", text: T("cf_law") }),
        h("p", { text: T("cf_i") + " ________________________________________________" }),
        h("p", { text: T("cf_born") + " ______________ · " + T("cf_phone") + " ____________________" }),
        h("p", { text: T("cf_body").replace("{inst}", inst || "____________________") }),
        h("ul", null, ["cf_p1", "cf_p2", "cf_p3", "cf_p4"].map(function (k) { return h("li", { text: T(k) }); })),
        h("p", { text: T("cf_withdraw") }),
        h("p", { style: "margin-top:24px", text: T("cf_sign") + " ____________________      " + T("cf_date") + " ____.____.20____" }),
        h("p", { text: T("cf_staff") + " ____________________________      " + T("cf_sign") + " ______________" }));
    }
    A.shell("mothers", h("div", { class: "stack" },
      h("div", { class: "row noprint", style: "gap:8px" }, h("button", { class: "btn pri", type: "button", text: "🖨 " + t("pt_print"), onclick: function () { window.print(); } }),
        h("a", { class: "btn", href: "#/mothers", text: t("mo_title") })),
      h("section", { class: "panel" }, block(S.lang === "uzl" ? "uzl" : "uz")), h("section", { class: "panel pbreak" }, block("ru"))));
  }


  // ------------------------------------------------------------------ 0028: нагрузка доя, опрос после родов (в «Сводке»)
  function asyncPanel(id, load) {
    var box = h("section", { class: "panel stack", id: id }, A.loadingBox());
    load().then(function (el) { box.textContent = ""; if (el) box.appendChild(el); else box.remove(); }).catch(function () { box.remove(); });
    return box;
  }
  function staffLoadPanel() {
    return asyncPanel("ms_load", async function () {
      var r = await sb.rpc("staff_load");
      if (r.error || !(r.data || []).length) return null;
      var rows = r.data, max = Math.max.apply(null, rows.map(function (x) { return x.registered_active; }).concat([1]));
      return h("div", { class: "stack" }, h("h2", { text: t("sl_title") }), h("p", { class: "mute small", text: t("sl_hint") }),
        h("div", { class: "tbl" }, h("table", { class: "sumtbl", id: "sl_tbl" },
          h("thead", null, h("tr", null, h("th", { text: t("sl_name") }), h("th", { text: t("inst_label") }), h("th", { class: "num", text: t("sl_active") }),
            h("th", { class: "num", text: t("sl_anc") }), h("th", { class: "num", text: t("sl_home") }))),
          h("tbody", null, rows.map(function (x) {
            var over = x.registered_active > 60;
            return h("tr", null, h("td", { text: x.full_name || "—" }), h("td", { text: A.instName(x.institution_id) }),
              h("td", { class: "num" + (over ? " badn" : "") }, h("span", { class: "bar", style: "--w:" + Math.round(x.registered_active * 100 / max) + "%" }), String(x.registered_active)),
              h("td", { class: "num", text: String(x.anc_30) }), h("td", { class: "num", text: String(x.home_30) }));
          })))));
    });
  }
  function surveyPanel() {
    return asyncPanel("ms_survey", async function () {
      var r = await sb.rpc("survey_summary", { _from: null });
      if (r.error) return null;
      var by = {}; (r.data || []).forEach(function (x) { by[x.q] = x; });
      return h("div", { class: "stack" }, h("h2", { text: t("sv_title") }), h("p", { class: "mute small", text: t("sv_hint") }),
        !(r.data || []).length ? h("p", { class: "mute", text: t("sv_empty") }) :
        h("div", { class: "kpis" }, [1, 2, 3, 4].map(function (q) {
          var x = by[q]; if (!x) return kpi(t("sv_q" + q), "—");
          var v = q === 2 || q === 3 ? x.yes_pct + "% " + t("sv_yes") : x.avg + " / 5";
          var bad = q === 2 || q === 3 ? x.yes_pct < 70 : Number(x.avg) < 3.5;
          return kpi(t("sv_q" + q) + " (n=" + x.n + ")", v, bad ? "warn" : "ok");
        })));
    });
  }

  // ------------------------------------------------------------------ направление для печати, с QR: роддом/специалист сканирует и отмечает «дошла»
  async function refView(id) {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await A.loadInstitutions();
    var r = await sb.rpc("referral_get", { _id: id });
    if (my !== A.token()) return;
    if (r.error) { A.shell("mothers", A.failBox(r.error)); return; }
    var x = r.data, link = A.CFG.siteUrl.replace(/\/?$/, "/") + "#/ref/" + x.id, qr = h("div", { class: "qr", id: "rf_qr" });
    var res = h("input", { id: "rf_result", placeholder: t("ref_result"), maxlength: "500" });
    var mark = x.arrived_at ? null : h("div", { class: "panel stack noprint", id: "rf_mark" }, h("b", { text: t("rfp_mark") }), res,
      h("button", { class: "btn pri", type: "button", id: "rf_arrived", text: "✅ " + t("ref_mark_arrived"), onclick: async function () {
        var y = await sb.rpc("referral_arrived", { _id: x.id, _date: today(), _result: res.value });
        if (y.error) { A.toast(errText(y.error)); return; }
        A.toast(t("u_saved")); refView(id);
      } }));
    A.shell("mothers", h("div", { class: "stack" },
      h("div", { class: "row noprint", style: "gap:8px;flex-wrap:wrap" },
        x.can_card ? h("a", { class: "btn", href: "#/mother/" + x.mother_id, text: "← " + t("mo_open") }) : null,
        h("button", { class: "btn pri", type: "button", id: "rf_print", text: "🖨 " + t("pt_print"), onclick: function () { window.print(); } })),
      h("section", { class: "panel stack refsheet", id: "rf_sheet" },
        h("div", { class: "row", style: "justify-content:space-between;gap:16px;align-items:start;flex-wrap:wrap" },
          h("div", { class: "stack", style: "gap:6px;flex:1;min-width:220px" },
            h("div", { class: "mute small", text: x.institution || "" }),
            h("h2", { text: t("rfp_title") + " №" + x.id }),
            h("div", { class: "kv" },
              kv(t("rfp_patient"), x.mother_name), kv(t("mo_birth"), fmtD(x.birth_date)), kv(t("mo_phone"), x.phone ? A.fmtPhone(x.phone) : "—"),
              x.ga_days != null ? kv(t("mo_ga_col"), gaTxt(x.ga_days)) : null, kv(t("mo_risk"), t("mo_risk_" + (x.risk || "low"))),
              kv(t("ref_target"), x.target), kv(t("ref_reason"), x.reason || "—"), kv(t("ref_due"), fmtD(x.due_date)),
              kv(t("rfp_by"), (x.by || "—") + " · " + A.fmtDT(x.created_at)),
              x.arrived_at ? kv(t("rfp_status"), t("ref_arrived_on", { d: fmtD(x.arrived_at) }) + (x.result ? ": " + x.result : "")) : null)),
          h("div", { class: "stack", style: "gap:4px;align-items:center" }, qr, h("div", { class: "mute small", style: "max-width:180px;text-align:center", text: t("rfp_scan") }))),
        h("p", { class: "small", text: t("rfp_note") })),
      mark));
    drawQr(qr, link);
  }

  // ------------------------------------------------------------------ объявление беременным (через бот): учреждение и махалли
  async function announceView() {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await A.loadInstitutions();
    var ls = await sb.rpc("announce_list");
    if (my !== A.token()) return;
    var insts = (S.institutions || []).filter(function (i) { return !S.profile || S.profile.institution_id == null || A.isManager() || A.isHead() || i.id === S.profile.institution_id; });
    var inst = h("select", { id: "an_inst" }, insts.map(function (i) { return h("option", { value: String(i.id), text: i.name }); }));
    if (S.profile && S.profile.institution_id != null) inst.value = String(S.profile.institution_id);
    var mahBox = h("div", { class: "chips", id: "an_mah" }), cnt = h("span", { class: "chip", id: "an_cnt" });
    var body = h("textarea", { id: "an_body", rows: "5", maxlength: "1000", placeholder: t("an_ph") });
    function picked() { return Array.prototype.slice.call(mahBox.querySelectorAll("input:checked")).map(function (c) { return +c.value; }); }
    async function count() {
      var x = await sb.rpc("announce_count", { _inst: +inst.value, _mah: picked().length ? picked() : null });
      cnt.textContent = x.error ? "—" : t("an_count", { n: x.data });
    }
    function mahs() {
      mahBox.textContent = "";
      (S.mahallas || []).filter(function (m) { return A.mahInsts(m.id).indexOf(+inst.value) >= 0; }).forEach(function (m) {
        var c = h("input", { type: "checkbox", value: String(m.id) }); c.addEventListener("change", count);
        mahBox.appendChild(h("label", { class: "check small" }, c, h("span", { text: m.name })));
      });
      count();
    }
    inst.addEventListener("change", mahs);
    var send = h("button", { class: "btn pri", type: "button", id: "an_send", text: "📢 " + t("an_send") });
    A.armed(send, t("an_send_confirm"), async function () {
      var txt = body.value.trim();
      if (txt.length < 5) { A.toast(t("an_short")); send.disabled = false; return; }
      var x = await sb.functions.invoke("tg-bot", { body: { action: "announce", institution: +inst.value, mahallas: picked(), body: txt } });
      send.disabled = false;
      var d = x.data || {};
      if (x.error || d.error) {
        var e = d.error; if (!e && x.error && x.error.context && x.error.context.json) { try { e = (await x.error.context.json()).error; } catch (q) { /* */ } }
        A.toast(e === "too_many" ? t("an_too_many") : e === "forbidden" ? t("forbidden") : t("err_action", { msg: e || (x.error && x.error.message) || "" })); return;
      }
      A.toast(t("an_done", { sent: d.sent, total: d.total })); announceView();
    });
    A.shell("mothers", h("div", { class: "stack" },
      h("section", { class: "panel stack" },
        h("div", null, h("a", { href: "#/mothers", class: "small", text: "← " + t("mo_title") }), h("h2", { text: "📢 " + t("an_title") })),
        h("p", { class: "mute small", text: t("an_hint") }),
        h("label", null, t("inst_label"), inst), h("div", null, h("b", { class: "small", text: t("an_mah") }), mahBox),
        h("label", null, t("an_text"), body), h("div", { class: "row", style: "gap:8px;align-items:center;flex-wrap:wrap" }, send, cnt)),
      h("section", { class: "panel stack", id: "an_list" }, h("h3", { text: t("an_history") }),
        (ls.data || []).length ? (ls.data || []).map(function (a) {
          return h("div", { class: "qa" }, h("div", { class: "mute small", text: A.fmtDT(a.created_at) + " · " + A.instName(a.institution_id) + (a.mahalla_ids && a.mahalla_ids.length ? " · " + a.mahalla_ids.map(A.mahName).join(", ") : "") + (a.by_name ? " · " + a.by_name : "") }),
            h("div", { text: a.body }), h("span", { class: "chip " + (a.sent ? "ok" : "warn"), text: a.sent == null ? t("an_pending") : t("an_done", { sent: a.sent, total: a.total }) }));
        }) : h("p", { class: "mute", text: t("an_none") }))));
    mahs();
  }

  // ------------------------------------------------------------------ журнал тяжёлых случаев (near-miss, смерти) — только администратор
  var CASE_KINDS = ["severe_pph", "eclampsia", "sepsis", "uterine_rupture", "abortion", "anesthesia", "maternal_death", "neonatal_death", "other"];
  async function casesView() {
    var my = A.token();
    A.shell("cases", A.loadingBox());
    await A.loadInstitutions();
    var r = await sb.rpc("cases_list");
    if (my !== A.token()) return;
    if (r.error) { A.shell("cases", A.failBox(r.error)); return; }
    var rows = r.data || [];
    function form(c) {
      c = c || {};
      var f = {
        case_date: h("input", { type: "date", value: c.case_date || today(), max: today() }),
        institution_id: h("select", null, h("option", { value: "", text: "—" }), (S.institutions || []).map(function (i) { return h("option", { value: String(i.id), text: i.name }); })),
        kind: h("select", null, CASE_KINDS.map(function (k) { return h("option", { value: k, text: t("cs_k_" + k) }); })),
        patient: h("input", { maxlength: "120", value: c.patient || "", placeholder: t("cs_patient_ph") }),
        description: h("textarea", { rows: "3", maxlength: "3000" }), actions: h("textarea", { rows: "3", maxlength: "3000" }), lessons: h("textarea", { rows: "3", maxlength: "3000" }),
        status: h("select", null, ["open", "reviewed"].map(function (k) { return h("option", { value: k, text: t("cs_st_" + k) }); }))
      };
      f.institution_id.value = c.institution_id != null ? String(c.institution_id) : ""; f.kind.value = c.kind || "severe_pph"; f.status.value = c.status || "open";
      ["description", "actions", "lessons"].forEach(function (k) { f[k].value = c[k] || ""; });
      var save = h("button", { class: "btn pri", type: "button", text: t("save"), onclick: async function () {
        var d = {}; Object.keys(f).forEach(function (k) { d[k] = f[k].value; });
        save.disabled = true;
        var x = await sb.rpc("case_save", { _id: c.id || null, _d: d });
        save.disabled = false;
        if (x.error) { A.toast(errText(x.error)); return; }
        A.toast(t("u_saved")); casesView();
      } });
      var del = c.id ? h("button", { class: "btn sm", type: "button", text: t("del") }) : null;
      if (del) A.armed(del, t("del"), async function () { var x = await sb.rpc("case_delete", { _id: c.id }); if (x.error) { A.toast(errText(x.error)); del.disabled = false; return; } casesView(); });
      return h("div", { class: "stack cs-form" },
        h("div", { class: "grid2" }, h("label", null, t("cs_date"), f.case_date), h("label", null, t("inst_label"), f.institution_id),
          h("label", null, t("cs_kind"), f.kind), h("label", null, t("cs_patient"), f.patient)),
        h("label", null, t("cs_desc"), f.description), h("label", null, t("cs_actions"), f.actions), h("label", null, t("cs_lessons"), f.lessons),
        h("div", { class: "row", style: "gap:8px;align-items:end;flex-wrap:wrap" }, h("label", null, t("cs_status"), f.status), save, del));
    }
    A.shell("cases", h("div", { class: "stack" },
      h("section", { class: "panel stack" }, h("h2", { text: t("cs_title") }), h("p", { class: "mute small", text: t("cs_hint") }),
        h("details", { id: "cs_new" }, h("summary", { style: "cursor:pointer;font-weight:800", text: "+ " + t("cs_add") }), form(null))),
      h("section", { class: "panel stack", id: "cs_list" },
        rows.length ? rows.map(function (c) {
          return h("details", { class: "qa" }, h("summary", { style: "cursor:pointer" },
            h("b", { text: fmtD(c.case_date) + " · " + t("cs_k_" + c.kind) }), " · " + (A.instName(c.institution_id) || "—") + (c.patient ? " · " + c.patient : "") + " ",
            h("span", { class: "chip " + (c.status === "open" ? "warn" : "ok"), text: t("cs_st_" + c.status) })), form(c));
        }) : h("p", { class: "mute", text: t("cs_none") }))));
  }

  // ------------------------------------------------------------------ календарь прививок (в «Советах»): администратор правит по действующему приказу
  async function vaccTab(box) {
    var r = await sb.rpc("vacc_list");
    box.textContent = "";
    if (r.error) { box.appendChild(A.failBox(r.error)); return; }
    var L = S.lang === "ru";
    function ageLbl(d) { return d < 30 ? t("vc_days", { n: d }) : d < 365 ? t("vc_months", { n: Math.round(d / 30.4) }) : t("vc_years", { n: Math.round(d / 365.25 * 10) / 10 }); }
    box.appendChild(h("p", { class: "mute small", text: t("vc_hint") }));
    box.appendChild(h("div", { class: "tbl" }, h("table", { class: "sumtbl", id: "vc_tbl" },
      h("thead", null, h("tr", null, h("th", { text: t("vc_age") }), h("th", { text: t("vc_name") }), A.isAdmin() ? h("th") : null)),
      h("tbody", null, (r.data || []).map(function (v) {
        return h("tr", null, h("td", { text: ageLbl(v.age_days) }), h("td", { text: L ? v.label_ru : A.uzT(v.label_uz) }),
          A.isAdmin() ? h("td", null, h("button", { class: "btn sm", type: "button", text: t("del"), onclick: async function () {
            var x = await sb.rpc("admin_vacc_delete", { _code: v.code }); if (x.error) { A.toast(errText(x.error)); return; } vaccTab(box); } })) : null);
      })))));
    if (A.isAdmin()) {
      var f = { code: h("input", { placeholder: "code", maxlength: "20", style: "max-width:110px" }), ru: h("input", { placeholder: t("vc_name") + " (рус)" }),
        uz: h("input", { placeholder: t("vc_name") + " (ўзб)" }), age: h("input", { type: "number", min: "0", max: "1826", placeholder: t("vc_age_days"), style: "max-width:120px" }) };
      box.appendChild(h("div", { class: "row noprint", style: "gap:6px;flex-wrap:wrap;align-items:center", id: "vc_add" }, f.code, f.ru, f.uz, f.age,
        h("button", { class: "btn sm pri", type: "button", text: t("save"), onclick: async function () {
          var x = await sb.rpc("admin_vacc_save", { _code: f.code.value.trim(), _ru: f.ru.value.trim(), _uz: f.uz.value.trim(), _age: +f.age.value, _sort: 0 });
          if (x.error) { A.toast(errText(x.error)); return; } A.toast(t("u_saved")); vaccTab(box); } })));
    }
  }
  function familyPanel(m) {
    var f = m.family || [];
    if (!f.length) return null;
    return h("div", { class: "small", id: "mc_family" }, h("b", { text: "👪 " + t("fm_title") + ": " }),
      f.map(function (x) { return t("fm_" + x.relation) + " (" + fmtD(String(x.linked_at).slice(0, 10)) + ")"; }).join(", "));
  }

  return { refView: refView, announceView: announceView, casesView: casesView, canMothers: canMothers, listView: listView, formView: formView, cardView: cardView, patronageView: patronageView, summaryView: summaryView, consentView: consentView, adviceView: adviceView, importView: importView, offlineView: offlineView, offlineCache: offlineCache, netDown: netDown };
};
