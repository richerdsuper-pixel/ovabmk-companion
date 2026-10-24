/* ===== Интерфейс ===== */
// вкладки по должности: доя кабинета, патронажная доя, координатор (руководитель)
var TABS = {
  cab: ["today", "cases", "screen", "report", "set"],
  pat: ["today", "cases", "report", "set"],
  coord: ["home", "cases", "senders", "files", "data", "search", "ind", "report", "set"]
};
var UI = { lockTimer: null, minutes: 10, sel: null };
function tabs() { return (TABS[PROF.role] || TABS.cab).map(function (k) { return [k, L("nav_" + k)]; }); }

function $(id) { return document.getElementById(id); }
function toast(msg, bad) {
  var t = h("div", { class: "toast" + (bad ? " bad" : ""), text: msg }); $("toasts").appendChild(t);
  setTimeout(function () { t.remove(); }, bad ? 7000 : 3500);
}
function modal(title, body, buttons) {
  return new Promise(function (resolve) {
    var back = h("div", { class: "back" });
    function close(v) { back.remove(); resolve(v); }
    var box = h("div", { class: "modal", role: "dialog" }, [h("h3", { text: title }), h("div", { class: "mbody" }, body),
      h("div", { class: "mbtn" }, (buttons || [["OK", true, "pri"]]).map(function (b) { return h("button", { class: b[2] || "", type: "button", onclick: function () { close(b[1]); } }, b[0]); }))]);
    back.appendChild(box); document.body.appendChild(back);
    var f = box.querySelector("input,select,textarea"); if (f) f.focus();
  });
}
function confirmBox(text, okLabel) { return modal(L("confirm"), [h("p", { text: text })], [[L("cancel"), false, ""], [okLabel || L("yes"), true, "danger"]]); }
function copyText(txt) {
  var done = function () { toast("Скопировано — вставьте в Telegram/SMS"); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  function fallback() {
    var ta = h("textarea", { class: "hidden-ta" }); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { modal("Скопируйте текст", [h("textarea", { class: "big", rows: 8, value: txt })]); }
    ta.remove();
  }
}
function badge(st) {
  var map = { ok: ["ok", "в срок"], late: ["bad", "просрочено"], soon: ["warn", "скоро срок"], wait: ["mute", "ожидание"], case: ["mute", "по случаю"] };
  var m = map[st] || map.wait; return h("span", { class: "badge " + m[0], text: m[1] });
}
function reminderText(s, st) {
  var rn = roleName(s.role), who = s.filler ? s.filler : "коллега";
  var when = st && st.st === "late" ? "срок сдачи (" + fmtD(st.last) + ") уже прошёл" : "срок сдачи — " + (st && st.next ? fmtD(st.next) : "скоро");
  return "Здравствуйте, " + who + "! По должности «" + rn + "» " + when + ". Прошу срочно прислать заполненный Excel-файл за текущий период. Спасибо.";
}
function table(headers, rows, cls) {
  return h("div", { class: "tw" }, h("table", { class: cls || "" }, [
    h("thead", null, h("tr", null, headers.map(function (x) { return h("th", { text: x }); }))),
    h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c) { return h("td", null, c == null ? "" : c); })); }))]));
}
function roleSelect(id, withAll, only) {
  var sel = h("select", { id: id });
  if (withAll) sel.appendChild(h("option", { value: "", text: "Все должности" }));
  ROLES.forEach(function (r) { if (!only || only.indexOf(r.no) >= 0) sel.appendChild(h("option", { value: r.no, text: p2(r.no) + " · " + r.ru })); });
  return sel;
}
function allStatuses() { return Object.keys(S.senders).map(function (id) { var s = S.senders[id]; return { s: s, st: senderStatus(s) }; }); }

/* --- Сводка --- */
function homeView() {
  var all = allStatuses(), root = h("div");
  var late = all.filter(function (x) { return x.st.st === "late"; }).sort(function (a, b) { return b.st.late - a.st.late; });
  var soon = all.filter(function (x) { return x.st.st === "soon"; });
  var okc = all.filter(function (x) { return x.st.st === "ok"; }).length;
  var nsub = Object.keys(S.subs).length, dc = dueCounts();
  if (dc.late || dc.today) root.appendChild(h("div", { class: "alert " + (dc.late ? "bad" : "warn") }, [h("b", { text: L("need_visit", { a: dc.today }) + (dc.late ? ", " + L("late_n", { n: dc.late }) : "") + " " }), h("button", { type: "button", class: "sm", onclick: function () { go("cases"); } }, L("open"))]));
  root.appendChild(h("div", { class: "cards" }, [
    h("div", { class: "card" }, [h("b", { text: String(all.length) }), h("span", { text: "отправителей" })]),
    h("div", { class: "card " + (late.length ? "bad" : "ok") }, [h("b", { text: String(late.length) }), h("span", { text: "просрочили" })]),
    h("div", { class: "card " + (soon.length ? "warn" : "") }, [h("b", { text: String(soon.length) }), h("span", { text: "скоро срок" })]),
    h("div", { class: "card ok" }, [h("b", { text: String(okc) }), h("span", { text: "сдали в срок" })]),
    h("div", { class: "card" }, [h("b", { text: String(nsub) }), h("span", { text: "файлов в базе" })])]));
  if (!all.length) {
    root.appendChild(h("div", { class: "panel" }, [h("h2", { text: "С чего начать" }),
      h("ol", null, [h("li", { text: "Откройте вкладку «Файлы» и добавьте Excel-файлы, которые вам прислали специалисты (можно сразу много)." }),
        h("li", { text: "Программа сама определит должность, учреждение и период, создаст список отправителей и запомнит все данные." }),
        h("li", { text: "Здесь, в «Сводке», будет видно, кто не сдал, и можно будет скопировать текст напоминания." }),
        h("li", { text: "Кто ещё ничего не присылал — добавьте вручную во вкладке «Отправители»." })])]));
  }
  if (late.length) {
    root.appendChild(h("div", { class: "panel" }, [h("div", { class: "ph" }, [h("h2", { text: "Не сдали в срок (" + late.length + ")" }),
      h("button", { type: "button", onclick: function () { copyText(late.map(function (x) { return x.s.inst + " — " + roleName(x.s.role) + (x.s.filler ? " (" + x.s.filler + ")" : "") + (x.s.phone ? ", тел. " + x.s.phone : "") + ": " + x.st.text; }).join("\n")); } }, "Скопировать список")]),
      table(["Учреждение", "Должность", "Ответственный", "Телефон", "Статус", ""], late.map(function (x) {
        return [x.s.inst, roleName(x.s.role), x.s.filler, x.s.phone ? h("a", { href: "tel:" + x.s.phone.replace(/[^\d+]/g, ""), text: x.s.phone }) : "", x.st.text,
          h("button", { type: "button", class: "sm", onclick: function () { copyText(reminderText(x.s, x.st)); } }, "Напомнить")];
      }))]));
  }
  if (soon.length) {
    root.appendChild(h("div", { class: "panel" }, [h("h2", { text: "Скоро срок (" + soon.length + ")" }),
      table(["Учреждение", "Должность", "Ответственный", "Телефон", "Срок", ""], soon.map(function (x) {
        return [x.s.inst, roleName(x.s.role), x.s.filler, x.s.phone ? h("a", { href: "tel:" + x.s.phone.replace(/[^\d+]/g, ""), text: x.s.phone }) : "", x.st.text,
          h("button", { type: "button", class: "sm", onclick: function () { copyText(reminderText(x.s, x.st)); } }, "Напомнить")];
      }))]));
  }
  // ближайшие сроки
  var t = todayStr(), up = [];
  ROLES.forEach(function (r) {
    var mine = all.filter(function (x) { return x.s.role === r.no; }); if (!mine.length || r.rule.t === "c") return;
    var d = deadlinesBetween(r.rule, t, addDays(t, 45)).filter(function (x) { return x > t || !isPast(x, r.rule.h); })[0];
    if (d) up.push({ d: d, r: r, n: mine.length });
  });
  up.sort(function (a, b) { return a.d.localeCompare(b.d); });
  if (up.length) root.appendChild(h("div", { class: "panel" }, [h("div", { class: "ph" }, [h("h2", { text: "Ближайшие сроки" }),
    h("button", { type: "button", onclick: exportIcs }, "Календарь (.ics) для телефона")]),
    table(["Срок", "Должность", "Отправителей", "Периодичность"], up.map(function (x) { return [fmtD(x.d) + " (" + DOW_RU[dow(x.d)] + ") до " + x.r.rule.h + ":00", x.r.ru, String(x.n), ruleText(x.r.rule)]; }))]));
  return root;
}
function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsFold(l) { var out = []; while (l.length > 70) { out.push(l.slice(0, 70)); l = " " + l.slice(70); } out.push(l); return out.join("\r\n"); }
function exportIcs() {
  var t = todayStr(), end = addDays(t, 365), all = allStatuses(), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OvaBMK Offline//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"], n = 0;
  var stamp = t.replace(/-/g, "") + "T000000Z";
  ROLES.forEach(function (r) {
    var mine = all.filter(function (x) { return x.s.role === r.no; }); if (!mine.length || r.rule.t === "c") return;
    deadlinesBetween(r.rule, t, end).forEach(function (d) {
      var ds = d.replace(/-/g, ""), hh = p2(r.rule.h), hh2 = p2(r.rule.h) ;
      L.push("BEGIN:VEVENT", "UID:ovabmk-" + r.no + "-" + ds + "@offline", "DTSTAMP:" + stamp, "DTSTART:" + ds + "T" + hh + "0000", "DTEND:" + ds + "T" + hh2 + "3000",
        icsFold("SUMMARY:Срок сдачи: " + icsEsc(r.ru) + " (" + mine.length + ")"),
        icsFold("DESCRIPTION:" + icsEsc("Должны сдать Excel-файл:\n" + mine.map(function (x) { return "• " + x.s.inst + (x.s.filler ? " — " + x.s.filler : "") + (x.s.phone ? " " + x.s.phone : ""); }).join("\n"))),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Срок сдачи завтра", "TRIGGER:-P1D", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Срок сдачи сегодня", "TRIGGER:-PT1H", "END:VALARM", "END:VEVENT");
      n++;
    });
  });
  L.push("END:VCALENDAR");
  if (!n) return toast("Нет отправителей со сроками", true);
  download("Sroki_sdachi.ics", new Blob([L.join("\r\n")], { type: "text/calendar" }));
  toast("Календарь сохранён (" + n + " напоминаний). Откройте файл на телефоне — он добавится в календарь.");
}

/* --- Отправители --- */
function senderForm(s) {
  var ro = roleSelect("f_role"); var fi = h("input", { id: "f_inst", value: s ? s.inst : "", placeholder: "Например: СВП №3" });
  var ff = h("input", { id: "f_fill", value: s ? s.filler : "", placeholder: "Ф.И.О. ответственного" }), fp = h("input", { id: "f_ph", value: s ? s.phone : "", placeholder: "+998 ...", inputmode: "tel" });
  if (s) { ro.value = s.role; ro.disabled = true; }
  return { nodes: [h("label", null, ["Должность", ro]), h("label", null, ["Учреждение", fi]), h("label", null, ["Ф.И.О.", ff]), h("label", null, ["Телефон", fp])],
    get: function () { return { role: +ro.value, inst: fi.value.trim(), filler: ff.value.trim(), phone: fp.value.trim() }; } };
}
function sendersView() {
  var root = h("div"), fr = roleSelect("flt_role", true), fq = h("input", { id: "flt_q", placeholder: "Поиск по учреждению / Ф.И.О.", type: "search" });
  var holder = h("div");
  function draw() {
    var rr = fr.value, q = fq.value.trim().toLowerCase();
    var list = allStatuses().filter(function (x) { return (!rr || String(x.s.role) === rr) && (!q || (x.s.inst + " " + x.s.filler).toLowerCase().indexOf(q) >= 0); })
      .sort(function (a, b) { return a.s.role - b.s.role || a.s.inst.localeCompare(b.s.inst); });
    holder.textContent = "";
    if (!list.length) { holder.appendChild(h("p", { class: "muted", text: "Список пуст. Добавьте файлы во вкладке «Файлы» или нажмите «Добавить отправителя»." })); return; }
    holder.appendChild(table(["Должность", "Учреждение", "Ответственный", "Телефон", "Статус", "Последний период", ""], list.map(function (x) {
      var s = x.s, ls = x.st.lastSub;
      return [roleName(s.role), s.inst, s.filler, s.phone ? h("a", { href: "tel:" + s.phone.replace(/[^\d+]/g, ""), text: s.phone }) : "", [badge(x.st.st), h("div", { class: "small", text: x.st.text + (x.st.missed ? " · пропусков: " + x.st.missed : "") })],
        ls ? fmtD(ls.pStart) + "–" + fmtD(ls.pEnd) : "—",
        h("div", { class: "acts" }, [ls ? h("button", { class: "sm", type: "button", onclick: function () { UI.sel = { sub: ls.id }; go("data"); } }, "Данные") : null,
          x.st.st === "late" || x.st.st === "soon" ? h("button", { class: "sm", type: "button", onclick: function () { copyText(reminderText(s, x.st)); } }, "Напомнить") : null,
          h("button", { class: "sm", type: "button", onclick: function () { editSender(s); } }, "Изм."),
          h("button", { class: "sm danger", type: "button", onclick: function () { delSender(s); } }, "Удал.")])];
    })));
  }
  fr.onchange = draw; fq.oninput = draw;
  root.appendChild(h("div", { class: "bar" }, [fr, fq, h("button", { class: "pri", type: "button", onclick: addSender }, "Добавить отправителя"),
    h("button", { type: "button", onclick: exportStatus }, "Статус в Excel")]));
  root.appendChild(holder); draw(); return root;
}
async function addSender() {
  var form = senderForm(null);
  if (!(await modal("Новый отправитель", form.nodes, [["Отмена", false, ""], ["Добавить", true, "pri"]]))) return;
  var v = form.get(), inst = v.inst, role = v.role;
  if (!inst) return toast("Укажите учреждение", true);
  var key = norm(inst);
  if (Object.keys(S.senders).some(function (id) { return S.senders[id].role === role && S.senders[id].key === key; })) return toast("Такой отправитель уже есть", true);
  var rule = ROLE[role].rule, t = todayStr(), since = "";
  if (rule.t !== "c") { var pd = deadlinesBetween(rule, addDays(t, -100), t).filter(function (d) { return isPast(d, rule.h); }); since = pd[pd.length - 1] || ""; }
  await persistSender({ id: uid(), role: role, key: key, inst: inst, filler: v.filler, phone: v.phone, created: Date.now(), since: since });
  toast("Добавлен"); render();
}
async function editSender(s) {
  var form = senderForm(s);
  if (!(await modal("Изменить", form.nodes, [["Отмена", false, ""], ["Сохранить", true, "pri"]]))) return;
  var v = form.get(), inst = v.inst; if (!inst) return toast("Укажите учреждение", true);
  var key = norm(inst), dup = Object.keys(S.senders).some(function (id) { var o = S.senders[id]; return o.id !== s.id && o.role === s.role && o.key === key; });
  if (dup) return toast("Такой отправитель уже есть", true);
  s.inst = inst; s.key = key; s.filler = v.filler; s.phone = v.phone;
  await persistSender(s); toast("Сохранено"); render();
}
async function delSender(s) {
  var n = senderSubs(s.id).length;
  if (!(await confirmBox("Удалить «" + s.inst + "» и все его файлы (" + n + ") из программы? Это нельзя отменить.", "Удалить"))) return;
  for (var m of senderSubs(s.id)) await removeSub(m.id);
  await Vault.remove("s:" + s.id); delete S.senders[s.id]; toast("Удалено"); render();
}
function exportStatus() {
  var rows = [["Должность", "Учреждение", "Ответственный", "Телефон", "Статус", "Подробнее", "Последний период", "Файл получен", "Пропусков"]];
  allStatuses().sort(function (a, b) { return a.s.role - b.s.role; }).forEach(function (x) {
    var ls = x.st.lastSub, names = { ok: "в срок", late: "просрочено", soon: "скоро срок", wait: "ожидание", case: "по случаю" };
    rows.push([roleName(x.s.role), x.s.inst, x.s.filler, x.s.phone, names[x.st.st], x.st.text, ls ? fmtD(ls.pStart) + "–" + fmtD(ls.pEnd) : "", ls ? fmtDT(ls.imported) : "", x.st.missed]);
  });
  download("Status_otpravitelej_" + todayStr() + ".xlsx", XL.write([{ name: "Статус", rows: rows }]));
}

/* --- Файлы --- */
function filesView() {
  var root = h("div"), log = h("div", { class: "log" }), list = h("div");
  var inp = h("input", { type: "file", id: "fileIn", accept: ".xlsx", multiple: true, class: "hidden" });
  async function run(files) {
    files = Array.prototype.slice.call(files); if (!files.length) return;
    log.textContent = ""; var okc = 0;
    for (var i = 0; i < files.length; i++) {
      var line = h("div", { class: "ln", text: "⏳ " + files[i].name + " …" }); log.appendChild(line);
      var r; try { r = await importFile(files[i]); } catch (e) { r = { ok: false, msg: "ошибка: " + e.message }; }
      line.className = "ln " + (r.ok ? "ok" : r.skipped ? "warn" : "bad");
      line.textContent = (r.ok ? "✔ " : r.skipped ? "↷ " : "✖ ") + files[i].name + " — " + r.msg + (r.warn && r.warn.length ? " [" + r.warn.join("; ") + "]" : "");
      if (r.ok) okc++;
    }
    toast("Загружено файлов: " + okc + " из " + files.length, okc === 0); drawList(); inp.value = "";
  }
  inp.onchange = function () { run(inp.files); };
  var drop = h("div", { class: "drop", tabindex: "0", onclick: function () { inp.click(); } }, [h("b", { text: "Нажмите, чтобы выбрать Excel-файлы" }), h("span", { text: "или перетащите их сюда (можно много файлов сразу)" })]);
  ["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { run(e.dataTransfer.files); });
  function drawList() {
    list.textContent = "";
    var subs = Object.keys(S.subs).map(function (k) { return S.subs[k]; }).sort(function (a, b) { return b.imported - a.imported; });
    if (!subs.length) { list.appendChild(h("p", { class: "muted", text: "Файлов пока нет." })); return; }
    list.appendChild(h("h2", { text: "Загруженные файлы (" + subs.length + ")" }));
    list.appendChild(table(["Загружен", "Должность", "Учреждение", "Период", "Строк данных", "Документы", "Файл", ""], subs.map(function (m) {
      var s = S.senders[m.sender] || {};
      return [fmtDT(m.imported), roleName(m.role), m.inst || s.inst, fmtD(m.pStart) + "–" + fmtD(m.pEnd), String(m.rows),
        m.docsTotal ? m.docsHave + " из " + m.docsTotal : "—", [m.fileName, m.ready ? null : h("div", { class: "small warnt", text: "файл помечен как неполный" })],
        h("div", { class: "acts" }, [h("button", { class: "sm", type: "button", onclick: function () { UI.sel = { sub: m.id }; go("data"); } }, "Открыть"),
          h("button", { class: "sm danger", type: "button", onclick: async function () { if (await confirmBox("Удалить этот файл из программы?", "Удалить")) { await removeSub(m.id); drawList(); } } }, "Удал.")])];
    })));
  }
  root.appendChild(h("div", { class: "panel" }, [h("h2", { text: "Добавить файлы от специалистов" }), drop, inp,
    h("p", { class: "small muted", text: "Файлы читаются только на этом устройстве, никуда не отправляются. Если файл за этот период уже был — он заменится новым. После загрузки исходные файлы лучше удалить из Telegram/«Загрузок»." }), log]));
  root.appendChild(list); drawList(); return root;
}

/* --- Данные --- */
function pageTable(meta, rows, filter, state, rerender, sheetName) {
  var q = (filter || "").toLowerCase().trim(), toks = q ? q.split(/\s+/) : [];
  var rs = toks.length ? rows.filter(function (r) { return toks.every(function (t) { return r.q.indexOf(t) >= 0; }); }) : rows;
  var cols = []; for (var j = 0; j < meta.hdr.length - 1; j++) if (rs.some(function (r) { return r.c[j] !== "" && r.c[j] != null; })) cols.push(j);
  var PS = 100, pages = Math.max(1, Math.ceil(rs.length / PS)); state.page = Math.min(state.page || 0, pages - 1);
  var slice = rs.slice(state.page * PS, state.page * PS + PS);
  var wrap = h("div");
  wrap.appendChild(h("div", { class: "small muted", text: "Записей: " + rs.length + (toks.length ? " (из " + rows.length + ")" : "") }));
  wrap.appendChild(table(["№ строки"].concat(cols.map(function (j) { return meta.hdr[j + 1] || meta.hdrUz[j + 1] || ("кол." + (j + 2)); })), slice.map(function (r) { return [String(r.r - 4)].concat(cols.map(function (j) { return String(r.c[j]); })); }), "data"));
  if (pages > 1) wrap.appendChild(h("div", { class: "pager" }, [h("button", { class: "sm", type: "button", disabled: state.page === 0, onclick: function () { state.page--; rerender(); } }, "‹"), h("span", { text: (state.page + 1) + " / " + pages }),
    h("button", { class: "sm", type: "button", disabled: state.page >= pages - 1, onclick: function () { state.page++; rerender(); } }, "›")]));
  wrap.exportRows = function () { return [["№ строки"].concat(cols.map(function (j) { return meta.hdr[j + 1]; }))].concat(rs.map(function (r) { return [r.r - 4].concat(cols.map(function (j) { return r.c[j]; })); })); };
  return wrap;
}
function dataView() {
  var root = h("div"), subs = Object.keys(S.subs).map(function (k) { return S.subs[k]; });
  if (!subs.length) return h("p", { class: "muted", text: "Данных пока нет. Добавьте файлы во вкладке «Файлы»." });
  // по умолчанию — последняя версия каждого отправителя
  var latestIds = {}; Object.keys(S.senders).forEach(function (id) { var l = latestSub(id); if (l) latestIds[l.id] = 1; });
  var opts = subs.filter(function (m) { return latestIds[m.id] || (UI.sel && UI.sel.sub === m.id); }).sort(function (a, b) { return a.role - b.role || (a.inst || "").localeCompare(b.inst || ""); });
  var selSub = h("select", { id: "d_sub" }, opts.map(function (m) { return h("option", { value: m.id, text: p2(m.role) + " " + roleName(m.role) + " · " + (m.inst || "?") + " · " + fmtD(m.pEnd) }); }));
  if (UI.sel && UI.sel.sub && S.subs[UI.sel.sub]) selSub.value = UI.sel.sub;
  var body = h("div"), st = { page: 0 };
  var filter = h("input", { type: "search", placeholder: "Фильтр по записям (Ф.И.О., ПИНФЛ, телефон…)", id: "d_flt" });
  async function draw() {
    var m = S.subs[selSub.value]; body.textContent = ""; if (!m) return;
    UI.sel = UI.sel || {}; UI.sel.sub = m.id;
    var role = ROLE[m.role], data = await subData(m.id), names = Object.keys(data.sheets);
    var info = h("div", { class: "panel" }, [h("div", { class: "kv" }, [h("span", { text: "Ответственный: " }), h("b", { text: m.filler || "—" }), h("span", { text: "  Тел.: " }), h("b", { text: m.phone || "—" }),
      h("span", { text: "  Период: " }), h("b", { text: fmtD(m.pStart) + " – " + fmtD(m.pEnd) }), h("span", { text: "  Файл: " }), h("b", { text: m.fileName })]),
      m.ready ? null : h("div", { class: "small warnt", text: "Файл помечен как неполный: " + m.readyTxt }),
      m.docsMiss && m.docsMiss.length ? h("details", null, [h("summary", { text: "Не отмечены документы: " + m.docsMiss.length + " из " + m.docsTotal }), h("ul", null, m.docsMiss.map(function (d) { return h("li", { text: (d.folder ? "[папка " + d.folder + "] " : "") + (d.ru || d.uz) }); }))]) : null]);
    body.appendChild(info);
    if (!names.length) { body.appendChild(h("p", { class: "muted", text: "В журналах этого файла записей нет." })); return; }
    if (!UI.sel.sheet || names.indexOf(UI.sel.sheet) < 0) UI.sel.sheet = names[0];
    var tabs = h("div", { class: "sheets" }, names.map(function (n) { return h("button", { type: "button", class: "sm" + (n === UI.sel.sheet ? " on" : ""), onclick: function () { UI.sel.sheet = n; st.page = 0; draw(); } }, [role.sheets[n].title.split(" / ")[0].replace(/\s*—.*$/, "") || n, " (" + data.sheets[n].length + ")"]); }));
    body.appendChild(tabs);
    var sn = UI.sel.sheet, tbl = pageTable(role.sheets[sn], data.sheets[sn], filter.value, st, draw, sn);
    body.appendChild(h("div", { class: "bar" }, [h("button", { type: "button", onclick: function () { download(sn + "_" + (m.inst || "") + ".xlsx", XL.write([{ name: sn, rows: tbl.exportRows() }])); } }, "Скачать в Excel")]));
    body.appendChild(tbl);
  }
  selSub.onchange = function () { UI.sel = { sub: selSub.value }; st.page = 0; filter.value = ""; draw(); };
  filter.oninput = function () { st.page = 0; draw(); };
  root.appendChild(h("div", { class: "bar" }, [selSub, filter])); root.appendChild(body); draw(); return root;
}

/* --- Поиск --- */
function searchView() {
  var root = h("div"), q = h("input", { id: "s_q", type: "search", placeholder: "Ф.И.О., ПИНФЛ, телефон, диагноз…", autofocus: true }), old = h("input", { type: "checkbox", id: "s_old" });
  var out = h("div"), seq = 0;
  async function run() {
    var my = ++seq, query = q.value.trim().toLowerCase(); out.textContent = "";
    if (query.length < 2) { out.appendChild(h("p", { class: "muted", text: "Введите минимум 2 символа." })); return; }
    var toks = query.split(/\s+/), ids = [];
    if (old.checked) ids = Object.keys(S.subs);
    else Object.keys(S.senders).forEach(function (id) { var l = latestSub(id); if (l) ids.push(l.id); });
    var found = [], total = 0;
    for (var i = 0; i < ids.length; i++) {
      var m = S.subs[ids[i]], d = await subData(m.id); if (my !== seq) return;
      for (var sn in d.sheets) d.sheets[sn].forEach(function (r) {
        if (toks.every(function (t) { return r.q.indexOf(t) >= 0; })) { total++; if (found.length < 150) found.push({ m: m, sn: sn, r: r }); }
      });
    }
    out.textContent = "";
    out.appendChild(h("div", { class: "small muted", text: "Найдено записей: " + total + (total > found.length ? " (показаны первые " + found.length + ")" : "") }));
    found.forEach(function (f) {
      var role = ROLE[f.m.role], meta = role.sheets[f.sn], pairs = [];
      f.r.c.forEach(function (v, j) { if (v !== "" && v != null) pairs.push([meta.hdr[j + 1] || ("кол." + (j + 2)), v]); });
      var s = S.senders[f.m.sender] || {};
      out.appendChild(h("details", { class: "res" }, [h("summary", null, [h("b", { text: pairs.slice(0, 2).map(function (p) { return p[1]; }).join(" · ") }), h("span", { class: "small muted", text: "  " + meta.title.split(" / ")[0].replace(/\s*—.*$/, "") + " · " + (f.m.inst || s.inst) + " · " + roleName(f.m.role) + " · до " + fmtD(f.m.pEnd) })]),
        h("div", { class: "kvlist" }, pairs.map(function (p) { return h("div", null, [h("span", { class: "k", text: p[0] }), h("span", { class: "v", text: String(p[1]) })]); }))]));
    });
    if (!found.length) out.appendChild(h("p", { class: "muted", text: "Ничего не найдено." }));
  }
  var tm; q.oninput = function () { clearTimeout(tm); tm = setTimeout(run, 250); }; old.onchange = run;
  root.appendChild(h("div", { class: "bar" }, [q, h("label", { class: "chk" }, [old, " включая старые версии файлов"])]));
  root.appendChild(out); run(); setTimeout(function () { q.focus(); }, 50); return root;
}

/* --- Показатели --- */
function indView() {
  var used = []; Object.keys(S.senders).forEach(function (id) { var r = S.senders[id].role; if (used.indexOf(r) < 0) used.push(r); });
  used.sort(function (a, b) { return a - b; });
  if (!used.length) return h("p", { class: "muted", text: "Показателей пока нет — добавьте файлы." });
  var sel = roleSelect("i_role", false, used), body = h("div");
  if (UI.indRole && used.indexOf(UI.indRole) >= 0) sel.value = UI.indRole;
  function draw() {
    var role = ROLE[+sel.value]; UI.indRole = role.no; body.textContent = "";
    var cols = Object.keys(S.senders).map(function (id) { return S.senders[id]; }).filter(function (s) { return s.role === role.no; }).sort(function (a, b) { return a.inst.localeCompare(b.inst); })
      .map(function (s) { return { s: s, m: latestSub(s.id) }; }).filter(function (c) { return c.m; });
    if (!cols.length) { body.appendChild(h("p", { class: "muted", text: "Файлов по этой должности нет." })); return; }
    var header = ["№", "Показатель", "Ед."].concat(cols.map(function (c) { return c.s.inst + " (" + fmtD(c.m.pEnd) + ")"; })).concat(["Итого"]);
    var rows = role.ind.map(function (ind) {
      var vals = cols.map(function (c) { var f = c.m.ind.filter(function (x) { return x.n === ind.n; })[0]; return f ? f.v : ""; });
      var pct = ind.unit === "%", sum = null;
      if (!pct) { var nums = vals.filter(function (v) { return typeof v === "number"; }); if (nums.length) sum = Math.round(nums.reduce(function (a, b) { return a + b; }, 0) * 100) / 100; }
      function show(v) { return typeof v === "number" ? (pct ? Math.round(v * 1000) / 10 + "%" : String(v)) : String(v); }
      return { raw: [ind.n, ind.ru || ind.uz, ind.unit || ""].concat(vals).concat([sum == null ? "" : sum]), view: [String(ind.n), ind.ru || ind.uz, ind.unit || ""].concat(vals.map(show)).concat([sum == null ? "" : String(sum)]) };
    });
    body.appendChild(h("div", { class: "bar" }, [h("button", { type: "button", onclick: function () { download("Pokazateli_" + role.no + ".xlsx", XL.write([{ name: "Показатели", rows: [header].concat(rows.map(function (r) { return r.raw; })) }])); } }, "Скачать в Excel")]));
    body.appendChild(table(header, rows.map(function (r) { return r.view; }), "ind"));
  }
  sel.onchange = draw; draw();
  return h("div", null, [h("div", { class: "bar" }, [sel]), body]);
}

/* --- Настройки --- */
function setView() {
  var root = h("div");
  root.appendChild(roleLangPanel());
  root.appendChild(h("div", { class: "panel" }, [h("h2", { text: L("bk_title") }),
    h("p", { class: "small muted", text: L("bk_hint") }),
    h("div", { class: "bar" }, [h("button", { class: "pri", type: "button", onclick: async function () { download("OvaBMQ_kopiya_" + todayStr() + ".ovabmk", await Vault.exportBackup()); toast(L("bk_done")); } }, L("bk_save")),
      h("button", { type: "button", onclick: function () { $("restoreIn").click(); } }, L("bk_restore"))])]));
  root.appendChild(casesSettings());
  if (PROF.role !== "coord") root.appendChild(profPanel());
  var ml = h("input", { type: "number", min: "1", max: "240", value: UI.minutes, style: "width:5em" });
  ml.onchange = function () { UI.minutes = Math.max(1, Math.min(240, +ml.value || 10)); try { localStorage.setItem("ovabmk_min", UI.minutes); } catch (e) { } armLock(); toast(L("saved")); };
  root.appendChild(h("div", { class: "panel" }, [h("h2", { text: L("sec_title") }),
    h("label", { class: "inl" }, [L("sec_lock_a") + " ", ml, " " + L("sec_lock_b")]),
    h("div", { class: "bar" }, [h("button", { type: "button", onclick: lockNow }, L("sec_lock_now")), h("button", { type: "button", onclick: changePw }, L("sec_pw")),
      h("button", { class: "danger", type: "button", onclick: wipeAll }, L("sec_wipe"))]),
    h("p", { class: "small muted", text: L("sec_pw_hint") }),
    Vault.isMem() ? h("p", { class: "small warnt", text: L("sec_mem") }) : null]));
  var how = [L("how_1"), L("how_2")];
  if (PROF.role === "coord") how.push("Сроки: пн/пт — еженедельно; 3, 5, 10-е числа — ежемесячно; 10-е и 15-е в янв/апр/июл/окт — ежеквартально. Файл засчитывается за ближайший срок после конца отчётного периода.", "Чтобы данные читались, специалисты должны сохранять файл в Excel/WPS (программа читает сохранённые значения формул).");
  else how.push(L("how_3"));
  root.appendChild(h("div", { class: "panel" }, [h("h2", { text: L("how_title") }), h("ul", { class: "small" }, how.map(function (x) { return h("li", { text: x }); }))]));
  return root;
}
async function changePw() {
  var a = h("input", { type: "password", id: "pw0" }), b = h("input", { type: "password", id: "pw1" }), c = h("input", { type: "password", id: "pw2" });
  if (!(await modal(L("pw_title"), [h("label", null, [L("pw_cur"), a]), h("label", null, [L("pw_new"), b]), h("label", null, [L("pw_rep"), c])], [[L("cancel"), false, ""], [L("change"), true, "pri"]]))) return;
  if (b.value.length < 8) return toast(L("e_pw_short"), true);
  if (b.value !== c.value) return toast(L("e_pw_match"), true);
  var ok = await Vault.rekey(a.value, b.value); toast(ok ? L("pw_done") : L("pw_wrong"), !ok);
}
async function wipeAll() {
  if (!(await confirmBox(L("wipe_q"), L("sec_wipe")))) return;
  await Vault.clearAll(); Vault.lock(); S.senders = {}; S.subs = {}; S.cache = {}; S.cases = {}; S.prof = {}; showAuth();
}

/* --- Оболочка --- */
function go(tab) { S.tab = tab; render(); }
async function render() {
  var nav = $("nav"); nav.textContent = "";
  var tl = tabs(); if (!tl.some(function (t) { return t[0] === S.tab; })) S.tab = tl[0][0];
  tl.forEach(function (t) { nav.appendChild(h("button", { type: "button", class: S.tab === t[0] ? "on" : "", "data-tab": t[0], onclick: function () { go(t[0]); } }, t[1])); });
  $("brandName").textContent = L("app"); $("lockBtn").textContent = "🔒 " + L("lock");
  var main = $("main"); main.textContent = "";
  var views = { home: homeView, today: todayView, cases: casesView, screen: screenView, report: reportView, senders: sendersView, files: filesView, data: dataView, search: searchView, ind: indView, set: setView };
  main.appendChild(views[S.tab]()); window.scrollTo(0, 0);
}
function armLock() {
  clearTimeout(UI.lockTimer);
  if (Vault.isOpen()) UI.lockTimer = setTimeout(lockNow, UI.minutes * 60000);
}
function lockNow() { clearTimeout(UI.lockTimer); Vault.lock(); S.senders = {}; S.subs = {}; S.cache = {}; S.cases = {}; S.prof = {}; $("app").classList.add("hidden"); $("main").textContent = ""; showAuth(); }
["click", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (Vault.isOpen()) armLock(); }, true); });

async function enter() {
  await loadAll(); $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); armLock();
  if (S.prof && S.prof.role && TABS[S.prof.role]) setRole(S.prof.role);
  if (!PROF.role) await chooseRole(true);
  if (PROF.role === "coord") S.tab = !Object.keys(S.senders).length && activeCases().length ? "cases" : "home";
  else S.tab = "today";
  render();
  var dc = dueCounts(); if (dc.late || dc.today) toast(L("need_visit", { a: dc.today }) + (dc.late ? ", " + L("late_n", { n: dc.late }) : ""), !!dc.late);
}
async function showAuth() {
  var box = $("auth"); box.classList.remove("hidden"); box.textContent = "";
  var has = await Vault.hasVault(), err = h("div", { class: "err" }), p1 = h("input", { type: "password", id: "pwA", autocomplete: "off", placeholder: has ? L("au_pw") : L("au_newpw") });
  var p2i = h("input", { type: "password", id: "pwB", autocomplete: "off", placeholder: L("au_rep") });
  var btn = h("button", { class: "pri", type: "button", id: "authGo" }, has ? L("au_open") : L("au_create"));
  async function go1() {
    err.textContent = "";
    try {
      if (has) { if (!(await Vault.unlock(p1.value))) { err.textContent = L("au_wrong"); return; } }
      else {
        if (p1.value.length < 8) { err.textContent = L("e_pw_short"); return; }
        if (p1.value !== p2i.value) { err.textContent = L("e_pw_match"); return; }
        await Vault.create(p1.value);
      }
      await enter();
    } catch (e) { err.textContent = L("au_err", { m: e.message }); }
  }
  btn.onclick = go1; [p1, p2i].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") go1(); }); });
  box.appendChild(h("div", { class: "authbox" }, [langButtons(function () { showAuth(); }, "langSegAuth"), h("h1", { text: L("app") }), h("p", { class: "muted", text: has ? L("au_hint") : L("au_first") }),
    p1, has ? null : p2i, btn, err,
    h("div", { class: "small muted", style: "margin-top:1em" }, [h("a", { href: "#", onclick: function (e) { e.preventDefault(); $("restoreIn").click(); } }, L("bk_restore"))]),
    Vault.isMem() ? h("p", { class: "small warnt", text: L("sec_mem") }) : null]));
  setTimeout(function () { p1.focus(); }, 30);
}
async function onRestore(file) {
  if (!file) return;
  var text = await file.text(), pw = h("input", { type: "password", id: "rpw" });
  if (!(await modal(L("rs_title"), [h("p", { text: L("rs_hint") }), pw], [[L("cancel"), false, ""], [L("rs_go"), true, "pri"]]))) return;
  try {
    var ok = await Vault.importBackup(text, pw.value);
    if (!ok) return toast(L("rs_wrong"), true);
    toast(L("rs_done")); await enter();
  } catch (e) { toast(e.message, true); }
}
async function boot() {
  try { var m = +localStorage.getItem("ovabmk_min"); if (m) UI.minutes = m; } catch (e) { }
  setLang(PROF.lang);
  $("casesIn").addEventListener("change", function () { onCasesImport(this.files[0]); this.value = ""; });
  $("restoreIn").addEventListener("change", function () { onRestore(this.files[0]); this.value = ""; });
  if (!window.crypto || !crypto.subtle) { $("auth").textContent = L("au_nocrypto"); $("auth").classList.remove("hidden"); return; }
  await Vault.init(); showAuth();
}
