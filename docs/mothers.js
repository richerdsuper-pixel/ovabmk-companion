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
    var m = A.errMsg(e), k = ["duplicate", "need_consent", "bad_lmp", "bad_edd", "bad_birth_date", "bad_phone", "bad_full_name", "need_institution", "bad_date", "bad_values", "bad_form", "forbidden"]
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

  // ------------------------------------------------------------------ список доя
  var FILTERS = ["all", "due", "missed", "home", "risk", "alerts", "notg", "pp"];
  function passes(m, f) {
    var s = m.state || {};
    return f === "all" ? true : f === "due" ? !!s.due : f === "missed" ? s.missed > 0 : f === "home" ? (s.home_due + s.home_missed) > 0
      : f === "risk" ? m.risk === "high" : f === "alerts" ? m.alerts > 0 : f === "notg" ? !m.tg : f === "pp" ? m.status === "postpartum" : true;
  }
  function qParam(route, k) { var r = new RegExp("[?&]" + k + "=([^&]*)").exec(route); return r ? decodeURIComponent(r[1]) : ""; }

  async function listView(route) {
    var my = A.token();
    A.shell("mothers", A.loadingBox());
    await ensureRefs();
    var archive = qParam(route, "arch") === "1";
    var r = await sb.rpc("mothers_list", { _archive: archive });
    if (my !== A.token()) return;
    if (r.error) { A.shell("mothers", A.failBox(r.error)); return; }
    var all = r.data || [], f = qParam(route, "f") || "all", inst = qParam(route, "i"), q = "";
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
          h("div", { class: "chips" }, stateChips(m)),
          h("div", { class: "mute small", text: [A.mahName(m.mahalla_id), m.address, m.phone ? A.fmtPhone(m.phone) : "", insts.length > 1 ? A.instName(m.institution_id) : ""].filter(Boolean).join(" · ") })));
      });
      listBox.appendChild(h("p", { class: "mute small", text: t("mo_shown", { n: list.length, m: all.length }) }));
    }
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
          h("div", null, h("b", { text: a.signs.map(function (k) { return t("sg_" + k); }).join(", ") }), h("div", { class: "mute small", text: A.fmtDT(a.at) })),
          h("button", { class: "btn sm pri", type: "button", text: t("mo_alert_seen"), onclick: async function () {
            var x = await sb.rpc("mother_alert_seen", { _id: a.id }); if (x.error) { A.toast(errText(x.error)); return; } reload(); } }));
      }), h("p", { class: "small", text: t("mo_alert_hint") })));
    parts.push(h("section", { class: "panel stack" }, h("h3", { text: t("mo_risk180_title") }), riskPanel(m.risk_eval, false)));
    var bpp = bpPanel(m); if (bpp) parts.push(bpp);
    var wp = weightPanel(m); if (wp) parts.push(wp);
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
    var exp = h("button", { class: "btn", type: "button", text: t("mo_export"), onclick: function () {
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
      trendPanel(tr && !tr.error ? tr.data || [] : []),
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
  function kpi(label, val, tone) { return h("div", { class: "kpi " + (tone || "") }, h("div", { class: "kv-v", text: String(val) }), h("div", { class: "small mute", text: label })); }

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

  return { canMothers: canMothers, listView: listView, formView: formView, cardView: cardView, patronageView: patronageView, summaryView: summaryView, consentView: consentView };
};
