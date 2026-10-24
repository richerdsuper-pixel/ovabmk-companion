/* ===== Визиты: пациенты, фото осмотра, напоминания. Всё хранится только на этом устройстве, в шифрованном виде ===== */
var MAHALLAS = ["А. Навоий", "Бахштепа", "Бахштепа-1", "Боботог", "Бобур", "Бунёдкор", "Бўстон", "Гулистон", "Гўзаллик", "Дўстлик", "Жарқишлоқ", "Жойилма", "Зарбдор", "Ибн Сино", "Какан", "Канобод", "Катта Совур", "Кўклам", "Лайлакхона", "Наврўз", "Ободон", "Озод", "Ойнакўл", "Олатемир", "Олий ҳиммат", "Офтоб макон", "Оқтумшуқ", "Оққамар", "Оққўрғон", "Саксанкапа", "Сауртепа", "Совжирон", "Тамаддун", "Тамшуш", "Толли", "Тўла", "Хайрабод", "Хўшчекка", "Шакаркўл", "Шолдироқ", "Эгарчи", "Эзгулик", "Элбаён", "Яккабоғ", "Ялти", "Янги ариқ", "Ёшғайрат", "Ғармакўрғон", "Қораариқ", "Қоқайди", "Қўшон", "Қўштегирмон", "Ҳурлик"];
var CATS = ["Беременная", "Родильница", "Новорождённый", "Ребёнок до 1 года", "Ребёнок 1–5 лет", "Женщина (ВОП/диспансер)", "Другое"];
var CS = { q: "" };
// в списках пациент обозначается номером карты; Ф.И.О. необязательно (чтобы личные данные не копировались лишний раз)
function caseTitle(c) { return c.card ? "Карта № " + c.card + (c.name ? " · " + c.name : "") : (c.name || "Без номера"); }

function dueBadge(c) {
  var d = caseDue(c), m = { late: ["bad", "просрочено на " + (-d.n) + " дн."], today: ["warn", "сегодня"], tomorrow: ["warn", "завтра"], week: ["mute", "через " + d.n + " дн."], later: ["mute", fmtD(c.next)], none: ["mute", "дата не назначена"], closed: ["mute", "закрыт"] }[d.k];
  return h("span", { class: "badge " + m[0], text: m[1] });
}
function readPhoto(file) {
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onerror = function () { rej(new Error("не удалось прочитать фото")); };
    fr.onload = function () {
      var im = new Image();
      im.onerror = function () { rej(new Error("не удалось открыть фото")); };
      im.onload = function () {
        var k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/jpeg", 0.72));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
// выбор фото: «Снять» открывает камеру телефона, «Из галереи» — выбор файлов
function photoPicker() {
  var list = [], row = h("div", { class: "thumbs" });
  function draw() {
    row.textContent = "";
    list.forEach(function (d, i) {
      row.appendChild(h("div", { class: "th" }, [h("img", { src: d, alt: "фото" }), h("button", { type: "button", class: "x", "aria-label": "убрать", onclick: function () { list.splice(i, 1); draw(); } }, "×")]));
    });
  }
  async function add(files) {
    for (var i = 0; i < files.length; i++) { try { list.push(await readPhoto(files[i])); } catch (e) { toast(e.message, true); } }
    draw();
  }
  var cam = h("input", { type: "file", accept: "image/*", capture: "environment", class: "hidden", id: "ph_cam" });
  var gal = h("input", { type: "file", accept: "image/*", multiple: true, class: "hidden", id: "ph_gal" });
  cam.onchange = function () { add(cam.files).then(function () { cam.value = ""; }); };
  gal.onchange = function () { add(gal.files).then(function () { gal.value = ""; }); };
  return { node: h("div", { class: "phpick" }, [h("div", { class: "bar" }, [h("button", { type: "button", onclick: function () { cam.click(); } }, "📷 Снять осмотр"), h("button", { type: "button", onclick: function () { gal.click(); } }, "🖼 Из галереи")]), cam, gal, row]), get: function () { return list.slice(); } };
}
async function savePhotos(list) {
  var ids = [];
  for (var i = 0; i < list.length; i++) { var id = uid(); await Vault.save("f:" + id, { id: id, data: list[i] }); ids.push(id); }
  return ids;
}
function nextPicker(initial) {
  var inp = h("input", { type: "date", id: "c_next", value: initial || "" });
  var quick = h("div", { class: "chips" }, [["+1 дн", 1], ["+3", 3], ["+7", 7], ["+14", 14], ["+30", 30]].map(function (q) {
    return h("button", { type: "button", class: "sm", onclick: function () { inp.value = addDays(todayStr(), q[1]); } }, q[0]);
  }).concat([h("button", { type: "button", class: "sm", onclick: function () { inp.value = ""; } }, "без даты")]));
  return { node: h("label", null, ["Следующий визит", inp, quick]), get: function () { return inp.value; } };
}
function mahallaDatalist() {
  var seen = {}, all = [];
  MAHALLAS.concat(activeCases().map(function (c) { return c.mahalla; })).forEach(function (m) { if (m && !seen[m]) { seen[m] = 1; all.push(m); } });
  return h("datalist", { id: "mah_dl" }, all.map(function (m) { return h("option", { value: m }); }));
}

async function caseForm(c) {
  var f = { card: h("input", { id: "c_card", value: c ? c.card || "" : "", placeholder: "Например: 1234/5", autocomplete: "off", inputmode: "text" }),
    name: h("input", { id: "c_name", value: c ? c.name || "" : "", placeholder: "Фамилия Имя Отчество", autocomplete: "off" }),
    cat: h("select", { id: "c_cat" }, CATS.map(function (x) { return h("option", { value: x, text: x }); })),
    mah: h("input", { id: "c_mah", value: c ? c.mahalla : "", placeholder: "Выберите или впишите", list: "mah_dl", autocomplete: "off" }),
    street: h("input", { id: "c_street", value: c ? c.street : "", placeholder: "Улица, дом, квартира", autocomplete: "off" }),
    phone: h("input", { id: "c_phone", value: c ? c.phone : "", inputmode: "tel", placeholder: "+998 ..." }),
    diag: h("input", { id: "c_diag", value: c ? c.diag : "", placeholder: "Диагноз / причина наблюдения", autocomplete: "off" }),
    note: h("textarea", { id: "c_note", rows: 2, placeholder: "Примечание (необязательно)" }, c ? c.note : "") };
  if (c) f.cat.value = c.cat;
  var nx = nextPicker(c ? c.next : addDays(todayStr(), 7)), ph = c ? null : photoPicker();
  var body = [mahallaDatalist(), h("label", null, ["№ карты (вместо Ф.И.О.)", f.card]), h("label", null, ["Категория", f.cat]), h("label", null, ["Махалля", f.mah]), h("label", null, ["Улица, дом", f.street]),
    h("label", null, ["Диагноз", f.diag]), h("label", null, ["Примечание", f.note]), nx.node,
    h("details", { class: "opt" }, [h("summary", { text: "Ф.И.О. и телефон (необязательно, лучше не вносить)" }), h("label", null, ["Ф.И.О.", f.name]), h("label", null, ["Телефон", f.phone])])];
  if (ph) { body.push(h("label", null, "Фото осмотра (необязательно)")); body.push(ph.node); }
  while (true) {
    var ok = await modal(c ? "Изменить данные" : "Новый пациент", body, [["Отмена", false, ""], [c ? "Сохранить" : "Добавить", true, "pri"]]);
    if (!ok) return null;
    var card = f.card.value.trim();
    if (!card && f.name.value.trim().length < 2) { toast("Укажите № карты", true); continue; }
    if (card && activeCases().some(function (o) { return o.card === card && (!c || o.id !== c.id); })) { toast("Пациент с картой № " + card + " уже есть", true); continue; }
    return { card: card, name: f.name.value.trim(), cat: f.cat.value, mahalla: f.mah.value.trim(), street: f.street.value.trim(), phone: f.phone.value.trim(), diag: f.diag.value.trim(), note: f.note.value.trim(), next: nx.get(), photos: ph ? ph.get() : [] };
  }
}
async function addCase() {
  var v = await caseForm(null); if (!v) return;
  var c = { id: uid(), created: Date.now(), card: v.card, name: v.name, cat: v.cat, mahalla: v.mahalla, street: v.street, phone: v.phone, diag: v.diag, note: v.note, next: v.next, closed: false, visits: [] };
  if (v.photos.length) c.visits.push({ id: uid(), d: todayStr(), t: Date.now(), note: "Первичный осмотр", ph: await savePhotos(v.photos) });
  await persistCase(c); toast("Пациент добавлен"); render();
}
async function editCase(c) {
  var v = await caseForm(c); if (!v) return;
  c.card = v.card; c.name = v.name; c.cat = v.cat; c.mahalla = v.mahalla; c.street = v.street; c.phone = v.phone; c.diag = v.diag; c.note = v.note; c.next = v.next;
  await persistCase(c); toast("Сохранено"); render();
}
async function addVisit(c) {
  var dt = h("input", { type: "date", id: "v_date", value: todayStr() }), note = h("textarea", { id: "v_note", rows: 3, placeholder: "Что выявлено, рекомендации" });
  var ph = photoPicker(), nx = nextPicker(addDays(todayStr(), 7)), diag = h("input", { id: "v_diag", value: c.diag, placeholder: "Диагноз" });
  var ok = await modal("Визит: " + caseTitle(c), [h("label", null, ["Дата визита", dt]), h("label", null, ["Заметка", note]), h("label", null, ["Диагноз", diag]), h("label", null, "Фото осмотра"), ph.node, nx.node,
    h("label", { class: "inl" }, [h("input", { type: "checkbox", id: "v_close" }), " Закрыть случай (наблюдение закончено)"])], [["Отмена", false, ""], ["Сохранить визит", true, "pri"]]);
  if (!ok) return;
  var closeIt = $("v_close") ? $("v_close").checked : false;
  c.visits.unshift({ id: uid(), d: dt.value || todayStr(), t: Date.now(), note: note.value.trim(), ph: await savePhotos(ph.get()) });
  c.visits.sort(function (a, b) { return (b.d || "").localeCompare(a.d || "") || (b.t || 0) - (a.t || 0); });
  c.diag = diag.value.trim(); c.next = closeIt ? "" : nx.get(); c.closed = closeIt;
  await persistCase(c); toast(closeIt ? "Визит сохранён, случай закрыт" : "Визит сохранён"); render();
}
async function showPhoto(id) {
  var f = await Vault.load("f:" + id); if (!f) return toast("Фото не найдено (возможно, не включено в выгрузку)", true);
  await modal("Фото осмотра", [h("img", { src: f.data, class: "bigph", alt: "фото осмотра" })], [["Закрыть", true, "pri"]]);
}
async function openCase(c) {
  var vis = c.visits.map(function (v) {
    return h("div", { class: "visit" }, [h("b", { text: fmtD(v.d) }), v.note ? h("div", { text: v.note }) : null,
      (v.ph || []).length ? h("div", { class: "thumbs" }, v.ph.map(function (id) { var img = h("img", { alt: "фото", class: "lazy" }); Vault.load("f:" + id).then(function (f) { if (f) img.src = f.data; }); return h("div", { class: "th", onclick: function () { showPhoto(id); } }, img); })) : null]);
  });
  var rows = [["Категория", c.cat], ["Махалля", c.mahalla], ["Улица, дом", c.street], ["Телефон", c.phone], ["Диагноз", c.diag], ["Примечание", c.note]].filter(function (r) { return r[1]; });
  var act = await modal(caseTitle(c), [h("div", { class: "kvlist" }, rows.map(function (r) { return h("div", null, [h("span", { class: "k", text: r[0] }), h("span", { class: "v", text: r[1] })]); })),
    h("div", { class: "bar" }, [dueBadge(c), c.next && !c.closed ? h("span", { class: "small muted", text: "следующий визит: " + fmtD(c.next) }) : null]),
    h("h2", { text: "Визиты (" + c.visits.length + ")" }), vis.length ? vis : h("p", { class: "muted small", text: "Визитов пока нет." })],
    [["Удалить", "del", "danger"], ["Изменить", "edit", ""], c.closed ? ["Вернуть в наблюдение", "reopen", ""] : null, ["Закрыть", false, "pri"]].filter(Boolean));
  if (act === "del") { if (await confirmBox("Удалить пациента «" + caseTitle(c) + "» и все его фото с этого устройства? Это нельзя отменить.", "Удалить")) { await deleteCase(c); toast("Удалено"); render(); } }
  else if (act === "edit") editCase(c);
  else if (act === "reopen") { c.closed = false; c.next = c.next || addDays(todayStr(), 7); await persistCase(c); render(); }
}
function caseCard(c) {
  var lastV = c.visits[0];
  return h("div", { class: "case " + caseDue(c).k }, [
    h("div", { class: "ch" }, [h("b", { text: caseTitle(c) }), dueBadge(c)]),
    h("div", { class: "small muted", text: [c.cat, c.mahalla, c.street].filter(Boolean).join(" · ") }),
    c.diag ? h("div", { class: "small", text: c.diag }) : null,
    lastV ? h("div", { class: "small muted", text: "последний визит: " + fmtD(lastV.d) + (lastV.ph && lastV.ph.length ? " · 📷 " + lastV.ph.length : "") }) : null,
    h("div", { class: "acts" }, [c.closed ? null : h("button", { type: "button", class: "pri", onclick: function () { addVisit(c); } }, "Визит"),
      c.phone ? h("a", { class: "btnlink", href: "tel:" + c.phone.replace(/[^\d+]/g, ""), text: "📞" }) : null,
      h("button", { type: "button", onclick: function () { openCase(c); } }, "Карточка")])]);
}
function casesView() {
  var root = h("div"), cnt = dueCounts(), list = h("div"), q = h("input", { type: "search", id: "c_q", placeholder: "Поиск: № карты, махалля, улица, диагноз", value: CS.q });
  var banner = null;
  if (cnt.late || cnt.today) banner = h("div", { class: "alert " + (cnt.late ? "bad" : "warn"), id: "cases_alert" }, [h("b", { text: "Нужно посетить: сегодня " + cnt.today + (cnt.late ? ", просрочено " + cnt.late : "") }), cnt.tomorrow ? h("span", { text: " · завтра " + cnt.tomorrow }) : null]);
  root.appendChild(h("div", { class: "cards" }, [
    h("div", { class: "card " + (cnt.late ? "bad" : "ok") }, [h("b", { text: String(cnt.late) }), h("span", { text: "просрочено" })]),
    h("div", { class: "card " + (cnt.today ? "warn" : "") }, [h("b", { text: String(cnt.today) }), h("span", { text: "сегодня" })]),
    h("div", { class: "card" }, [h("b", { text: String(cnt.tomorrow) }), h("span", { text: "завтра" })]),
    h("div", { class: "card" }, [h("b", { text: String(cnt.week + cnt.later + cnt.none + cnt.late + cnt.today + cnt.tomorrow) }), h("span", { text: "под наблюдением" })])]));
  if (banner) root.appendChild(banner);
  root.appendChild(h("div", { class: "bar" }, [h("button", { class: "pri big", type: "button", id: "addCase", onclick: addCase }, "＋ Новый пациент"), q]));
  function draw() {
    CS.q = q.value; var toks = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean); list.textContent = "";
    var all = activeCases().filter(function (c) { var s = [c.card, c.name, c.mahalla, c.street, c.diag, c.phone, c.cat].join(" ").toLowerCase(); return toks.every(function (t) { return s.indexOf(t) >= 0; }); });
    if (!activeCases().length) { list.appendChild(h("div", { class: "panel" }, [h("h2", { text: "Здесь будут ваши пациенты" }), h("p", { class: "small muted", text: "Нажмите «Новый пациент»: впишите № карты, махаллю, улицу, диагноз, сделайте фото осмотра и назначьте дату следующего визита — программа напомнит. Все данные хранятся только на этом телефоне, в зашифрованном виде; в интернет ничего не уходит." })])); return; }
    if (!all.length) { list.appendChild(h("p", { class: "muted", text: "Ничего не найдено." })); return; }
    var groups = [["late", "Просрочено"], ["today", "Сегодня"], ["tomorrow", "Завтра"], ["week", "В ближайшие 7 дней"], ["later", "Позже"], ["none", "Без даты визита"], ["closed", "Закрытые"]];
    groups.forEach(function (g) {
      var items = all.filter(function (c) { return caseDue(c).k === g[0]; }).sort(function (a, b) { return (a.next || "9").localeCompare(b.next || "9") || caseTitle(a).localeCompare(caseTitle(b)); });
      if (!items.length) return;
      var box = h("div", { class: "grp" }, [h("h2", { text: g[1] + " (" + items.length + ")" }), h("div", { class: "cases" }, items.map(caseCard))]);
      if (g[0] === "closed") list.appendChild(h("details", null, [h("summary", { text: g[1] + " (" + items.length + ")" }), h("div", { class: "cases" }, items.map(caseCard))])); else list.appendChild(box);
    });
  }
  q.oninput = draw; root.appendChild(list); draw(); return root;
}
// календарь БЕЗ личных данных: в телефон попадает только «сегодня N визитов — откройте OvaBMQ»
function exportCasesIcs() {
  var by = {}; activeCases().forEach(function (c) { if (!c.closed && c.next && c.next >= todayStr()) by[c.next] = (by[c.next] || 0) + 1; });
  var days = Object.keys(by).sort(); if (!days.length) return toast("Нет назначенных визитов", true);
  var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OvaBMK Offline//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"], stamp = todayStr().replace(/-/g, "") + "T000000Z";
  days.forEach(function (d) {
    var ds = d.replace(/-/g, "");
    L.push("BEGIN:VEVENT", "UID:ovabmk-visits-" + ds + "@offline", "DTSTAMP:" + stamp, "DTSTART:" + ds + "T080000", "DTEND:" + ds + "T083000",
      "SUMMARY:Визитов запланировано: " + by[d] + " — откройте OvaBMQ", "DESCRIPTION:Список только в программе OvaBMQ (личные данные в календарь не попадают)",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Визиты на сегодня", "TRIGGER:PT0S", "END:VALARM", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  download("Vizity_napominaniya.ics", new Blob([L.join("\r\n")], { type: "text/calendar" }));
  toast("Календарь сохранён (" + days.length + " дн.). В нём только числа визитов, без имён и адресов.");
}
function casesSettings() {
  var cnt = activeCases().length;
  return h("div", { class: "panel" }, [h("h2", { text: "Пациенты и визиты (" + cnt + ")" }),
    h("p", { class: "small muted", text: "Хранятся только на этом устройстве в зашифрованном виде. Для переноса на сервер или другой компьютер сделайте зашифрованную выгрузку: она открывается только паролем выгрузки, который знаете вы." }),
    h("div", { class: "bar" }, [h("button", { type: "button", id: "expCases", onclick: exportCasesUi }, "Выгрузка пациентов (зашифрованная)"),
      h("button", { type: "button", id: "impCases", onclick: function () { $("casesIn").click(); } }, "Принять выгрузку"),
      h("button", { type: "button", id: "icsCases", onclick: exportCasesIcs }, "Календарь напоминаний (без данных)")])]);
}
async function exportCasesUi() {
  if (!Object.keys(S.cases).length) return toast("Пока нечего выгружать", true);
  var a = h("input", { type: "password", id: "ex1", placeholder: "Пароль выгрузки (от 8 знаков)", autocomplete: "off" }), b = h("input", { type: "password", id: "ex2", placeholder: "Повторите", autocomplete: "off" });
  var chk = h("input", { type: "checkbox", id: "ex_ph", checked: true });
  if (!(await modal("Выгрузка пациентов", [h("p", { class: "small muted", text: "Файл зашифрован этим паролем (AES-256). Пароль не сохраняется — без него файл не открыть." }), a, b, h("label", { class: "inl" }, [chk, " вместе с фото осмотров"])], [["Отмена", false, ""], ["Выгрузить", true, "pri"]]))) return;
  if (a.value.length < 8) return toast("Пароль не короче 8 знаков", true);
  if (a.value !== b.value) return toast("Пароли не совпадают", true);
  download("OvaBMQ_pacienty_" + todayStr() + ".ovabmkc", await exportCases(a.value, chk.checked)); toast("Выгрузка сохранена");
}
async function onCasesImport(file) {
  if (!file) return;
  var text = await file.text(), pw = h("input", { type: "password", id: "ipw", autocomplete: "off" });
  if (!(await modal("Приём выгрузки", [h("p", { class: "small muted", text: "Записи добавятся к имеющимся; если запись есть в обоих местах — останется более новая, визиты объединятся." }), h("label", null, ["Пароль выгрузки", pw])], [["Отмена", false, ""], ["Принять", true, "pri"]]))) return;
  try {
    var r = await importCases(text, pw.value);
    if (!r) return toast("Неверный пароль выгрузки", true);
    toast("Принято: новых " + r.added + ", обновлено " + r.updated + ", без изменений " + r.same + (r.photos ? ", фото " + r.photos : "")); render();
  } catch (e) { toast(e.message, true); }
}
