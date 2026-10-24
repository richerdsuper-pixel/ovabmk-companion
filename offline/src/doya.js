/* ===== Помощник доя: «Сегодня» (маршрут), скрининг, отчёт и выгрузки, календарь ===== */
// «Сегодня»: кого посетить сегодня и кто просрочен — по махаллям и улицам, чтобы спланировать обход
function dueWhat(c) {
  var d = caseDue(c);
  if (d.std) {
    var x = planStates(c).filter(function (p) { return p.src === d.src; })[0].s;
    var item = d.src === "anc" ? (x.missed[0] || x.cur) : (x.missed[0] || x.cur);
    if (item) return d.src === "anc" ? ancLabel(item) : itemLabel(item.k);
  }
  return c.next ? L("planned_visit") : "";
}
function todayView() {
  var root = h("div"), t = todayStr();
  var due = activeCases().filter(function (c) { var k = caseDue(c).k; return k === "late" || k === "today"; });
  var tom = activeCases().filter(function (c) { return caseDue(c).k === "tomorrow"; });
  root.appendChild(h("div", { class: "cards" }, [
    h("div", { class: "card " + (due.some(function (c) { return caseDue(c).k === "late"; }) ? "bad" : "ok") }, [h("b", { text: String(due.filter(function (c) { return caseDue(c).k === "late"; }).length) }), h("span", { text: L("k_late") })]),
    h("div", { class: "card warn" }, [h("b", { text: String(due.filter(function (c) { return caseDue(c).k === "today"; }).length) }), h("span", { text: L("k_today") })]),
    h("div", { class: "card" }, [h("b", { text: String(tom.length) }), h("span", { text: L("k_tomorrow") })])]));
  root.appendChild(h("div", { class: "bar" }, [h("button", { class: "pri big", type: "button", id: "addCase2", onclick: function () { addCase(""); } }, "＋ " + L("new_patient"))]));
  if (!due.length) { root.appendChild(h("div", { class: "panel", id: "route" }, [h("h2", { text: L("route_title", { d: fmtD(t) }) }), h("p", { class: "muted", text: L("route_empty") })])); }
  else {
    var by = {}; due.forEach(function (c) { var m = c.mahalla || L("no_mahalla"); (by[m] = by[m] || []).push(c); });
    var box = h("div", { class: "panel", id: "route" }, [h("h2", { text: L("route_title", { d: fmtD(t) }) + " · " + due.length }), h("p", { class: "small muted", text: L("route_hint") })]);
    Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || a.localeCompare(b); }).forEach(function (m) {
      var list = by[m].sort(function (a, b) { return (a.street || "").localeCompare(b.street || "") || caseTitle(a).localeCompare(caseTitle(b)); });
      box.appendChild(h("div", { class: "mgrp" }, [h("h3", { text: dispText(m) + " (" + list.length + ")" })].concat(list.map(function (c) {
        return h("div", { class: "rrow " + caseDue(c).k }, [h("div", { class: "rmain" }, [h("b", { text: caseTitle(c) }), " ", dueBadge(c),
          h("div", { class: "small muted", text: [c.street, catName(c.cat), dueWhat(c)].filter(Boolean).join(" · ") })]),
          h("div", { class: "acts" }, [h("button", { type: "button", class: "pri sm", onclick: function () { addVisit(c); } }, L("visit")), h("button", { type: "button", class: "sm", onclick: function () { openCase(c); } }, L("card"))])]);
      }))));
    });
    root.appendChild(box);
  }
  if (tom.length) root.appendChild(h("details", { class: "panel" }, [h("summary", { text: L("g_tomorrow") + " (" + tom.length + ")" }), h("div", { class: "cases" }, tom.map(caseCard))]));
  return root;
}
// «Скрининг»: женщины, которым пора на скрининг шейки матки / молочной железы / ежегодный осмотр
function screenView() {
  var root = h("div"), women = activeCases().filter(function (c) { return c.cat === CAT_WOMAN && !c.closed; });
  root.appendChild(h("p", { class: "small muted", text: L("scr_intro") }));
  root.appendChild(h("div", { class: "bar" }, [h("button", { class: "pri big", type: "button", id: "addWoman", onclick: function () { addCase(CAT_WOMAN); } }, "＋ " + L("new_woman"))]));
  var noYear = women.filter(function (c) { return !c.byear; });
  SCR.forEach(function (x) {
    var list = [], ok = 0;
    women.forEach(function (c) { var s = scrState(c).filter(function (y) { return y.k === x.k; })[0]; if (!s) return; if (s.need) list.push({ c: c, s: s }); else ok++; });
    list.sort(function (a, b) { return (a.s.due || "0").localeCompare(b.s.due || "0") || (a.c.mahalla || "").localeCompare(b.c.mahalla || ""); });
    var panel = h("div", { class: "panel", id: "scr_" + x.k }, [h("h2", { text: L("scr_" + x.k) + " · " + L("scr_rule_" + x.k) }),
      h("div", { class: "small muted", text: L("scr_counts", { need: list.length, ok: ok }) })]);
    if (list.length) panel.appendChild(h("div", { class: "cases" }, list.map(function (it) {
      var c = it.c;
      return h("div", { class: "case today" }, [h("div", { class: "ch" }, [h("b", { text: caseTitle(c) }), h("span", { class: "badge warn", text: it.s.never ? L("scr_never") : L("scr_due_since", { d: fmtD(it.s.due) }) })]),
        h("div", { class: "small muted", text: [L("age_n", { n: caseAge(c) }), c.mahalla, c.street].filter(Boolean).join(" · ") }),
        h("div", { class: "acts" }, [h("button", { type: "button", class: "pri", onclick: function () { markScr(c, x.k); } }, L("scr_mark")), h("button", { type: "button", onclick: function () { openCase(c); } }, L("card"))])]);
    })));
    root.appendChild(panel);
  });
  if (noYear.length) root.appendChild(h("p", { class: "small warnc", text: L("scr_no_byear", { n: noYear.length }) }));
  return root;
}
async function markScr(c, k) {
  var d = h("input", { type: "date", id: "scr_d", value: todayStr(), max: todayStr() });
  if (!(await modal(L("scr_mark") + ": " + L("scr_" + k), [h("p", { class: "small muted", text: caseTitle(c) }), h("label", null, [L("scr_date"), d])], [[L("cancel"), false, ""], [L("save"), true, "pri"]]))) return;
  c.scr = c.scr || {}; c.scr[k] = d.value || todayStr();
  c.visits.unshift({ id: uid(), d: c.scr[k], t: Date.now(), note: L("scr_" + k), ph: [], items: ["scr:" + k] });
  await persistCase(c); toast(L("saved")); render();
}

/* --- Отчёт: числа для сайта и выгрузка для координатора --- */
function monthStart(t) { return t.slice(0, 8) + "01"; }
// только числа, без людей: файл 1 (загружается на сайт)
function computeNumbers() {
  var t = todayStr(), m0 = monthStart(t), n = {}, inc = function (k, v) { n[k] = (n[k] || 0) + (v == null ? 1 : v); };
  ["preg_total", "preg_t1", "preg_t2", "preg_t3", "preg_lt18", "preg_35plus", "preg_risk", "anc_missed", "anc_due_now", "pat_preg_missed", "pat_preg_due", "pp_total", "pp_missed", "pp_due", "nb_total", "nb_missed", "nb_due",
    "women_total", "scr_annual_need", "scr_cerv_need", "scr_breast_need", "visits_month", "pat_done_month", "anc_done_month", "scr_done_month"].forEach(function (k) { n[k] = 0; });
  activeCases().forEach(function (c) {
    (c.visits || []).forEach(function (v) {
      if (v.d >= m0 && v.d <= t) { inc("visits_month"); (v.items || (v.std ? ["anc:" + v.std] : [])).forEach(function (k) { inc(k.indexOf("pat:") === 0 ? "pat_done_month" : k.indexOf("anc:") === 0 ? "anc_done_month" : "scr_done_month"); }); }
    });
    if (c.closed) return;
    if (c.cat === CAT_PREG) {
      inc("preg_total"); var a = ancState(c), ag = ageGroup(c);
      if (a) inc(a.wk.w < 14 ? "preg_t1" : a.wk.w < 28 ? "preg_t2" : "preg_t3");
      if (ag === "lt18") inc("preg_lt18"); if (ag === "35plus") inc("preg_35plus");
      if ((c.risk || []).length) inc("preg_risk");
      if (a && a.kind === "missed") inc("anc_missed"); if (a && a.kind === "cur") inc("anc_due_now");
      var p = patState(c); if (p && p.kind === "missed") inc("pat_preg_missed"); if (p && p.kind === "cur") inc("pat_preg_due");
    } else if (c.cat === CAT_PP || c.cat === CAT_NB) {
      var pre = c.cat === CAT_PP ? "pp" : "nb", ps = patState(c);
      if (c.birth && diffDays(t, c.birth) > 45) return;
      inc(pre + "_total"); if (ps && ps.kind === "missed") inc(pre + "_missed"); if (ps && ps.kind === "cur") inc(pre + "_due");
    } else if (c.cat === CAT_WOMAN) {
      inc("women_total"); scrState(c).forEach(function (x) { if (x.need) inc("scr_" + x.k + "_need"); });
    }
  });
  return n;
}
var NUM_ROWS = { cab: ["preg_total", "preg_t1", "preg_t2", "preg_t3", "preg_lt18", "preg_35plus", "preg_risk", "anc_missed", "anc_due_now", "anc_done_month", "women_total", "scr_annual_need", "scr_cerv_need", "scr_breast_need", "scr_done_month", "visits_month"],
  pat: ["preg_total", "preg_lt18", "preg_35plus", "preg_risk", "pat_preg_missed", "pat_preg_due", "pp_total", "pp_missed", "pp_due", "nb_total", "nb_missed", "nb_due", "pat_done_month", "visits_month"] };
function numRows() { return PROF.role === "pat" ? NUM_ROWS.pat : PROF.role === "cab" ? NUM_ROWS.cab : NUM_ROWS.cab.concat(NUM_ROWS.pat.filter(function (k) { return NUM_ROWS.cab.indexOf(k) < 0; })); }
async function exportNumbers() {
  var p = S.prof || {};
  if (!p.inst) { toast(L("e_prof"), true); return; }
  var all = computeNumbers(), keep = {}; numRows().forEach(function (k) { keep[k] = all[k]; });
  var t = todayStr(), out = { fmt: "ovabmk-numbers", v: 1, role: PROF.role, inst: p.inst, unit: p.unit || "", date: t, month: t.slice(0, 7), numbers: keep };
  shareOrSave("Raqamlar_" + (norm(p.unit || p.inst).slice(0, 20) || "doya") + "_" + t + ".json", new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }), "application/json").then(function (how) { if (how !== "cancel") toast(L(how === "shared" ? "num_shared" : "num_saved")); });
}
function profPanel() {
  var p = S.prof || {};
  var inst = h("input", { id: "pr_inst", value: p.inst || "", placeholder: L("ph_inst") }), unit = h("input", { id: "pr_unit", value: p.unit || "", placeholder: L("ph_unit") }), who = h("input", { id: "pr_who", value: p.who || "", placeholder: L("ph_who") });
  var btn = h("button", { type: "button", id: "pr_save", onclick: async function () { var np = JSON.parse(JSON.stringify(S.prof || {})); np.inst = inst.value.trim(); np.unit = unit.value.trim(); np.who = who.value.trim(); await saveProf(np); toast(L("saved")); render(); } }, L("save"));
  return h("div", { class: "panel" }, [h("h2", { text: L("prof_title") }), h("p", { class: "small muted", text: L("prof_hint") }),
    h("label", null, [L("f_inst"), inst]), h("label", null, [L("f_unit"), unit]), h("label", null, [L("f_who"), who]), h("div", { class: "bar" }, [btn])]);
}
function reportView() {
  var root = h("div"), n = computeNumbers(), p = S.prof || {};
  if (!p.inst) root.appendChild(h("div", { class: "alert warn" }, [h("b", { text: L("rep_need_prof") })]));
  // главное — две большие кнопки: отправить координатору и числа для сайта
  root.appendChild(h("div", { class: "panel bigacts" }, [
    h("button", { class: "pri big wide", type: "button", id: "deltaExp", onclick: function () { exportCasesUi(true); } }, "📤 " + L("delta_btn")),
    h("p", { class: "small muted", text: L("delta_hint") + (p.lastExport ? " " + L("delta_last", { d: fmtDT(p.lastExport) }) : "") }),
    h("button", { class: "big wide", type: "button", id: "numExp", onclick: exportNumbers }, "📊 " + L("num_btn")),
    h("p", { class: "small muted", text: L("num_hint") }),
    h("button", { class: "big wide", type: "button", id: "icsCases2", onclick: exportCasesIcs }, "📅 " + L("ics_btn")),
    h("p", { class: "small muted", text: L("ics_hint") })]));
  root.appendChild(h("div", { class: "panel" }, [h("h2", { text: L("rep_title", { m: todayStr().slice(0, 7) }) }), h("p", { class: "small muted", text: L("rep_hint") }),
    table([L("rep_ind"), L("rep_val")], numRows().map(function (k) { return [L("n_" + k), String(n[k])]; }), "ind")]));
  root.appendChild(profPanel());
  root.appendChild(h("div", { class: "bar" }, [h("button", { type: "button", id: "fullExp", class: "sm", onclick: function () { exportCasesUi(false); } }, L("exp_full"))]));
  return root;
}
// календарь БЕЗ личных данных: по дням только число визитов («визитов: 3 — откройте OvaBMQ»), на все будущие окна по плану + еженедельная проверка
function exportCasesIcs() {
  var t = todayStr(), by = {};
  function add(d) { if (d && d >= t) by[d] = (by[d] || 0) + 1; }
  activeCases().forEach(function (c) {
    if (c.closed) return;
    var seen = {};
    function once(d) { if (d && !seen[d]) { seen[d] = 1; add(d); } }
    once(c.next);
    if (PROF.role !== "pat") { var a = ancState(c); if (a) { if (a.kind === "missed" || a.kind === "cur") once(t); ANC.forEach(function (r) { if (!a.done[r.visit_no]) { var f = addDays(c.lmp, r.from_week * 7); if (f > t) once(f); } }); } }
    if (PROF.role !== "cab") { var p = patState(c); if (p) { if (p.kind === "missed" || p.kind === "cur") once(t); p.items.forEach(function (x) { if (!p.done[x.k] && x.from > t) once(x.from); }); } }
  });
  var days = Object.keys(by).sort();
  var L2 = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OvaBMK Offline//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"], stamp = t.replace(/-/g, "") + "T000000Z";
  days.forEach(function (d) {
    var ds = d.replace(/-/g, "");
    L2.push("BEGIN:VEVENT", "UID:ovabmk-visits-" + ds + "@offline", "DTSTAMP:" + stamp, "DTSTART:" + ds + "T080000", "DTEND:" + ds + "T083000",
      "SUMMARY:" + icsEsc(L("ics_sum", { n: by[d] })), "DESCRIPTION:" + icsEsc(L("ics_desc")),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(L("ics_alarm")), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
  });
  // еженедельное напоминание по понедельникам: открыть программу и проверить просроченные
  var mon = t; while (dow(mon) !== 1) mon = addDays(mon, 1);
  L2.push("BEGIN:VEVENT", "UID:ovabmk-weekly@offline", "DTSTAMP:" + stamp, "DTSTART:" + mon.replace(/-/g, "") + "T083000", "DTEND:" + mon.replace(/-/g, "") + "T084500", "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=40",
    "SUMMARY:" + icsEsc(L("ics_weekly")), "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(L("ics_weekly")), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
  L2.push("END:VCALENDAR");
  download("Vizity_napominaniya.ics", new Blob([L2.join("\r\n")], { type: "text/calendar" }));
  toast(L("ics_done", { n: days.length }));
}

/* --- Должность и язык --- */
var ROLE_OPTS = [["cab", "role_cab"], ["pat", "role_pat"], ["coord", "role_coord"]];
function langButtons(after, id) {
  return h("div", { class: "seg", id: id || "langSeg" }, [["ru", "Рус"], ["uz", "Ўзб"], ["uzl", "Oʻzb"]].map(function (x) {
    return h("button", { type: "button", class: "sm" + (PROF.lang === x[0] ? " on" : ""), "data-lang": x[0], onclick: function () { setLang(x[0]); if (after) after(); } }, x[1]);
  }));
}
async function chooseRole(first) {
  var sel = h("select", { id: "roleSel" }, ROLE_OPTS.map(function (x) { return h("option", { value: x[0], text: L(x[1]) }); }));
  sel.value = PROF.role || "cab";
  var ok = await modal(L("role_title"), [h("p", { class: "small muted", text: L("role_hint") }), sel], first ? [[L("role_go"), true, "pri"]] : [[L("cancel"), false, ""], [L("save"), true, "pri"]]);
  if (!ok) return false;
  setRole(sel.value);
  // должность хранится и в зашифрованном хранилище: так она не потеряется, если браузер очистит свои настройки
  if (Vault.isOpen()) { var np = JSON.parse(JSON.stringify(S.prof || {})); np.role = sel.value; await saveProf(np); }
  return true;
}
function roleLangPanel() {
  var cur = (ROLE_OPTS.filter(function (x) { return x[0] === PROF.role; })[0] || ROLE_OPTS[0])[1];
  return h("div", { class: "panel" }, [h("h2", { text: L("set_role_lang") }),
    h("div", { class: "bar" }, [h("span", { text: L("role_now") + ": " }), h("b", { id: "roleNow", text: L(cur) }), h("button", { type: "button", id: "roleChange", onclick: async function () { if (await chooseRole(false)) { S.tab = tabs()[0][0]; render(); } } }, L("change"))]),
    h("div", { class: "bar" }, [h("span", { text: L("lang") + ": " }), langButtons(function () { render(); })])]);
}
