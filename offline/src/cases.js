/* ===== Пациенты: визиты, фото осмотра, напоминания. Всё хранится только на этом устройстве, в шифрованном виде ===== */
var MAHALLAS = ["А. Навоий", "Бахштепа", "Бахштепа-1", "Боботог", "Бобур", "Бунёдкор", "Бўстон", "Гулистон", "Гўзаллик", "Дўстлик", "Жарқишлоқ", "Жойилма", "Зарбдор", "Ибн Сино", "Какан", "Канобод", "Катта Совур", "Кўклам", "Лайлакхона", "Наврўз", "Ободон", "Озод", "Ойнакўл", "Олатемир", "Олий ҳиммат", "Офтоб макон", "Оқтумшуқ", "Оққамар", "Оққўрғон", "Саксанкапа", "Сауртепа", "Совжирон", "Тамаддун", "Тамшуш", "Толли", "Тўла", "Хайрабод", "Хўшчекка", "Шакаркўл", "Шолдироқ", "Эгарчи", "Эзгулик", "Элбаён", "Яккабоғ", "Ялти", "Янги ариқ", "Ёшғайрат", "Ғармакўрғон", "Қораариқ", "Қоқайди", "Қўшон", "Қўштегирмон", "Ҳурлик"];
// значения категорий хранятся по-русски (совместимость со старыми записями), на экране — на выбранном языке
var CATS = [CAT_PREG, CAT_PP, CAT_NB, "Ребёнок до 1 года", "Ребёнок 1–5 лет", CAT_WOMAN, "Женщина (ВОП/диспансер)", "Другое"];
var CAT_KEY = { "Беременная": "cat_preg", "Родильница": "cat_pp", "Новорождённый": "cat_nb", "Ребёнок до 1 года": "cat_ch1", "Ребёнок 1–5 лет": "cat_ch5", "Женщина (скрининг)": "cat_woman", "Женщина (ВОП/диспансер)": "cat_disp", "Другое": "cat_other" };
function catName(x) { return CAT_KEY[x] ? L(CAT_KEY[x]) : x; }
// категории, с которыми работает должность (остальные можно выбрать, но в списке они ниже)
function roleCats() { return PROF.role === "cab" ? [CAT_PREG, CAT_WOMAN, "Другое"] : PROF.role === "pat" ? [CAT_PREG, CAT_PP, CAT_NB, "Другое"] : CATS; }
var RISKS = ["pe", "gdm", "fgr", "ptb", "vte", "pph", "anemia", "other"];
var CS = { q: "", cat: "" };
// в списках пациент обозначается номером карты; Ф.И.О. необязательно (чтобы личные данные не копировались лишний раз)
function caseTitle(c) { return c.card ? L("card_no", { n: c.card }) + (c.name ? " · " + c.name : "") : (c.name || L("no_card")); }
function ageGroup(c) { var a = caseAge(c); return a == null ? "" : a < 18 ? "lt18" : a >= 35 ? "35plus" : "18_34"; }
function itemLabel(k) {
  if (k.indexOf("anc:") === 0) { var r = ANC.filter(function (x) { return "anc:" + x.visit_no === k; })[0]; return r ? ancLabel(r) : k; }
  return L(k.replace(":", "_"));
}

function dueBadge(c) {
  var d = caseDue(c), m = { late: ["bad", L("due_late", { n: -d.n })], today: ["warn", L("due_today")], tomorrow: ["warn", L("due_tomorrow")], week: ["mute", L("due_in", { n: d.n })], later: ["mute", fmtD(caseNext(c))], none: ["mute", L("due_none")], closed: ["mute", L("due_closed")] }[d.k];
  if (d.std && d.kind === "cur") m = ["warn", L(d.src === "pat" ? "due_pat_now" : "due_std_now")];
  if (d.std && d.kind === "missed") m = ["bad", L(d.src === "pat" ? "due_pat_late" : "due_std_late", { n: -d.n })];
  return h("span", { class: "badge " + m[0], text: m[1] });
}
function readPhoto(file) {
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onerror = function () { rej(new Error(L("ph_read_err"))); };
    fr.onload = function () {
      var im = new Image();
      im.onerror = function () { rej(new Error(L("ph_open_err"))); };
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
      row.appendChild(h("div", { class: "th" }, [h("img", { src: d, alt: L("photo") }), h("button", { type: "button", class: "x", "aria-label": L("remove"), onclick: function () { list.splice(i, 1); draw(); } }, "×")]));
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
  return { node: h("div", { class: "phpick" }, [h("div", { class: "bar" }, [h("button", { type: "button", onclick: function () { cam.click(); } }, "📷 " + L("ph_shoot")), h("button", { type: "button", onclick: function () { gal.click(); } }, "🖼 " + L("ph_gallery"))]), cam, gal, row]), get: function () { return list.slice(); } };
}
async function savePhotos(list) {
  var ids = [];
  for (var i = 0; i < list.length; i++) { var id = uid(); await Vault.save("f:" + id, { id: id, data: list[i] }); ids.push(id); }
  return ids;
}
function nextPicker(initial) {
  var inp = h("input", { type: "date", id: "c_next", value: initial || "" });
  var quick = h("div", { class: "chips" }, [["+1", 1], ["+3", 3], ["+7", 7], ["+14", 14], ["+30", 30]].map(function (q) {
    return h("button", { type: "button", class: "sm", onclick: function () { inp.value = addDays(todayStr(), q[1]); } }, q[0] + " " + L("days_short"));
  }).concat([h("button", { type: "button", class: "sm", onclick: function () { inp.value = ""; } }, L("no_date"))]));
  return { node: h("label", null, [L("next_visit"), inp, quick]), get: function () { return inp.value; } };
}
function mahallaDatalist() {
  var seen = {}, all = [];
  MAHALLAS.concat(activeCases().map(function (c) { return c.mahalla; })).forEach(function (m) { if (m && !seen[m]) { seen[m] = 1; all.push(m); } });
  return h("datalist", { id: "mah_dl" }, all.map(function (m) { return h("option", { value: m }); }));
}

async function caseForm(c, presetCat) {
  var f = { card: h("input", { id: "c_card", value: c ? c.card || "" : "", placeholder: L("ph_card"), autocomplete: "off", inputmode: "text" }),
    name: h("input", { id: "c_name", value: c ? c.name || "" : "", placeholder: L("ph_name"), autocomplete: "off" }),
    cat: h("select", { id: "c_cat" }, roleCats().concat(CATS.filter(function (x) { return roleCats().indexOf(x) < 0; })).map(function (x) { return h("option", { value: x, text: catName(x) }); })),
    byear: h("input", { id: "c_byear", type: "number", min: "1940", max: todayStr().slice(0, 4), value: c && c.byear ? String(c.byear) : "", placeholder: L("ph_byear"), inputmode: "numeric" }),
    mah: h("input", { id: "c_mah", value: c ? c.mahalla : "", placeholder: L("ph_mah"), list: "mah_dl", autocomplete: "off" }),
    street: h("input", { id: "c_street", value: c ? c.street : "", placeholder: L("ph_street"), autocomplete: "off" }),
    phone: h("input", { id: "c_phone", value: c ? c.phone : "", inputmode: "tel", placeholder: "+998 ..." }),
    diag: h("input", { id: "c_diag", value: c ? c.diag : "", placeholder: L("ph_diag"), autocomplete: "off" }),
    note: h("textarea", { id: "c_note", rows: 2, placeholder: L("ph_note") }, c ? c.note : ""),
    lmp: h("input", { type: "date", id: "c_lmp", value: c && c.lmp ? c.lmp : "", max: todayStr() }),
    birth: h("input", { type: "date", id: "c_birth", value: c && c.birth ? c.birth : "", max: todayStr() }),
    disch: h("input", { type: "date", id: "c_disch", value: c && c.disch ? c.disch : "", max: addDays(todayStr(), 1) }) };
  f.cat.value = c ? c.cat : (presetCat || roleCats()[0]);
  var riskBoxes = RISKS.map(function (k) { var cb = h("input", { type: "checkbox", value: k }); cb.checked = !!(c && (c.risk || []).indexOf(k) >= 0); return h("label", { class: "inl" }, [cb, " " + L("risk_" + k)]); });
  var lmpL = h("label", { id: "c_lmpL" }, [L("f_lmp"), f.lmp]);
  var riskL = h("div", { id: "c_riskL" }, [h("div", { class: "lbl", text: L("f_risk") }), h("div", { class: "riskgrid" }, riskBoxes)]);
  var birthL = h("label", { id: "c_birthL" }, [L("f_birth"), f.birth]), dischL = h("label", { id: "c_dischL" }, [L("f_disch"), f.disch]);
  var scr = (c && c.scr) || {}, scrIn = {};
  var scrL = h("div", { id: "c_scrL" }, [h("div", { class: "lbl", text: L("f_scr_last") })].concat(SCR.map(function (x) {
    scrIn[x.k] = h("input", { type: "date", id: "c_scr_" + x.k, value: scr[x.k] || "", max: todayStr() });
    return h("label", null, [L("scr_" + x.k), scrIn[x.k]]);
  })));
  function show() {
    var v = f.cat.value;
    lmpL.style.display = riskL.style.display = v === CAT_PREG ? "" : "none";
    birthL.style.display = dischL.style.display = v === CAT_PP || v === CAT_NB ? "" : "none";
    scrL.style.display = v === CAT_WOMAN ? "" : "none";
  }
  f.cat.addEventListener("change", show); show();
  var nx = nextPicker(c ? c.next : (PROF.role === "coord" ? addDays(todayStr(), 7) : "")), ph = c ? null : photoPicker();
  var body = [mahallaDatalist(), h("label", null, [L("f_card"), f.card]), h("label", null, [L("f_cat"), f.cat]), lmpL, riskL, birthL, dischL, scrL,
    h("label", null, [L("f_byear"), f.byear]), h("label", null, [L("f_mah"), f.mah]), h("label", null, [L("f_street"), f.street]),
    h("label", null, [L("f_diag"), f.diag]), h("label", null, [L("f_note"), f.note]), nx.node,
    h("details", { class: "opt" }, [h("summary", { text: L("f_personal") }), h("label", null, [L("f_name"), f.name]), h("label", null, [L("f_phone"), f.phone])])];
  if (ph) { body.push(h("label", null, L("f_photo"))); body.push(ph.node); }
  while (true) {
    var ok = await modal(c ? L("t_edit") : L("t_new"), body, [[L("cancel"), false, ""], [c ? L("save") : L("add"), true, "pri"]]);
    if (!ok) return null;
    var card = f.card.value.trim(), cat = f.cat.value, t = todayStr();
    if (!card && f.name.value.trim().length < 2) { toast(L("e_card"), true); continue; }
    var lm = cat === CAT_PREG ? f.lmp.value : "";
    if (lm && (diffDays(t, lm) < 0 || diffDays(t, lm) > 315)) { toast(L("e_lmp"), true); continue; }
    var by = f.byear.value ? +f.byear.value : null;
    if (by != null && (by < 1940 || by > +t.slice(0, 4))) { toast(L("e_byear"), true); continue; }
    if (cat === CAT_WOMAN && !by) { toast(L("e_byear_need"), true); continue; }
    var bd = cat === CAT_PP || cat === CAT_NB ? f.birth.value : "", dd = cat === CAT_PP || cat === CAT_NB ? f.disch.value : "";
    if (bd && bd > t) { toast(L("e_birth"), true); continue; }
    if (bd && dd && dd < bd) { toast(L("e_disch"), true); continue; }
    if (card && activeCases().some(function (o) { return o.card === card && (!c || o.id !== c.id); })) { toast(L("e_card_dup", { n: card }), true); continue; }
    var risk = cat === CAT_PREG ? riskBoxes.map(function (l) { return l.querySelector("input"); }).filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }) : [];
    var scrv = {}; if (cat === CAT_WOMAN) SCR.forEach(function (x) { if (scrIn[x.k].value) scrv[x.k] = scrIn[x.k].value; });
    return { lmp: lm, card: card, name: f.name.value.trim(), cat: cat, byear: by, risk: risk, birth: bd, disch: dd, scr: scrv, mahalla: f.mah.value.trim(), street: f.street.value.trim(), phone: f.phone.value.trim(), diag: f.diag.value.trim(), note: f.note.value.trim(), next: nx.get(), photos: ph ? ph.get() : [] };
  }
}
var CASE_FIELDS = ["card", "lmp", "name", "cat", "byear", "risk", "birth", "disch", "scr", "mahalla", "street", "phone", "diag", "note", "next"];
async function addCase(presetCat) {
  var v = await caseForm(null, typeof presetCat === "string" ? presetCat : ""); if (!v) return;
  var c = { id: uid(), created: Date.now(), closed: false, visits: [] };
  CASE_FIELDS.forEach(function (k) { c[k] = v[k]; });
  if (v.photos.length) c.visits.push({ id: uid(), d: todayStr(), t: Date.now(), note: L("first_exam"), ph: await savePhotos(v.photos) });
  await persistCase(c); toast(L("t_added")); render();
}
async function editCase(c) {
  var v = await caseForm(c); if (!v) return;
  CASE_FIELDS.forEach(function (k) { c[k] = v[k]; });
  await persistCase(c); toast(L("saved")); render();
}
// что можно отметить в визите: пункты плана (визиты по №180, патронаж по №210), ещё не выполненные
function visitItems(c) {
  var out = [], a = ancState(c), p = patState(c), t = todayStr();
  if (a && PROF.role !== "pat") ANC.forEach(function (r) { if (!a.done[r.visit_no]) out.push({ k: "anc:" + r.visit_no, pre: (a.missed[0] === r) || a.cur === r }); });
  if (p && PROF.role !== "cab") p.items.forEach(function (x) { if (!p.done[x.k]) out.push({ k: x.k, pre: (p.missed[0] === x) || p.cur === x }); });
  if (PROF.role === "coord") { var first = out.filter(function (x) { return x.pre; })[0]; out.forEach(function (x) { x.pre = x === first; }); }
  return out;
}
async function addVisit(c) {
  var dt = h("input", { type: "date", id: "v_date", value: todayStr() }), note = h("textarea", { id: "v_note", rows: 3, placeholder: L("ph_vnote") });
  var ph = photoPicker(), nx = nextPicker(PROF.role === "coord" ? addDays(todayStr(), 7) : ""), diag = h("input", { id: "v_diag", value: c.diag, placeholder: L("f_diag") });
  var items = visitItems(c), boxes = items.map(function (x) { var cb = h("input", { type: "checkbox", value: x.k, class: "v_item" }); cb.checked = !!x.pre; return h("label", { class: "inl" }, [cb, " " + itemLabel(x.k)]); });
  var scr = scrState(c), scrBoxes = scr.map(function (x) { var cb = h("input", { type: "checkbox", value: x.k, class: "v_scr" }); cb.checked = false; return h("label", { class: "inl" }, [cb, " " + L("scr_" + x.k)]); });
  var closeCb = h("input", { type: "checkbox", id: "v_close" });
  var ok = await modal(L("t_visit", { t: caseTitle(c) }), [h("label", null, [L("v_date"), dt]), boxes.length ? h("div", { id: "v_items" }, [h("div", { class: "lbl", text: L("v_items") })].concat(boxes)) : null,
    scrBoxes.length ? h("div", { id: "v_scrs" }, [h("div", { class: "lbl", text: L("v_scr") })].concat(scrBoxes)) : null,
    h("label", null, [L("v_note"), note]), h("label", null, [L("f_diag"), diag]), h("label", null, L("f_photo")), ph.node, nx.node,
    h("label", { class: "inl" }, [closeCb, " " + L("v_close")])], [[L("cancel"), false, ""], [L("v_save"), true, "pri"]]);
  if (!ok) return;
  var closeIt = closeCb.checked, d = dt.value || todayStr();
  var keys = boxes.map(function (l) { return l.querySelector("input"); }).filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
  var vrec = { id: uid(), d: d, t: Date.now(), note: note.value.trim(), ph: await savePhotos(ph.get()) };
  if (keys.length) vrec.items = keys;
  var anc1 = keys.filter(function (k) { return k.indexOf("anc:") === 0; })[0]; if (anc1) vrec.std = +anc1.slice(4);
  scrBoxes.forEach(function (l) { var cb = l.querySelector("input"); if (cb.checked) { c.scr = c.scr || {}; c.scr[cb.value] = d; } });
  c.visits.unshift(vrec);
  c.visits.sort(function (a, b) { return (b.d || "").localeCompare(a.d || "") || (b.t || 0) - (a.t || 0); });
  c.diag = diag.value.trim(); c.next = closeIt ? "" : nx.get(); c.closed = closeIt;
  await persistCase(c); toast(closeIt ? L("t_visit_closed") : L("t_visit_saved")); render();
}
async function showPhoto(id) {
  var f = await Vault.load("f:" + id); if (!f) return toast(L("ph_missing"), true);
  await modal(L("photo_exam"), [h("img", { src: f.data, class: "bigph", alt: L("photo_exam") })], [[L("close"), true, "pri"]]);
}
// блок «по стандарту» в карточке беременной: срок, что просрочено, что нужно сейчас и дальше
function ancBlock(c) {
  var s = ancState(c); if (!s) return c.cat === CAT_PREG && !c.lmp ? h("p", { class: "small muted", text: L("anc_need_lmp") }) : null;
  function one(title, r, cls) {
    var tests = ancTests(r);
    return h("div", { class: "anc " + cls }, [h("b", { text: title + ": " + ancLabel(r) }), h("div", { class: "small muted", text: L("anc_window", { a: r.from_week, b: r.until_week, d: ancWinDates(c, r) }) }),
      tests.length ? h("ul", { class: "small" }, tests.map(function (x) { return h("li", { text: x }); })) : h("div", { class: "small muted", text: L("anc_no_tests") }),
      r.notes ? h("div", { class: "small", text: ancNotes(r) }) : null]);
  }
  var out = [h("div", { class: "bar" }, [h("b", { text: L("anc_term", { w: s.wk.w, d: s.wk.d }) }), h("span", { class: "small muted", text: L("anc_edd", { d: fmtD(s.edd) }) })])];
  if (s.wk.w > 42) out.push(h("p", { class: "small warnc", text: L("anc_over42") }));
  if ((c.risk || []).length) out.push(h("div", { class: "small bad-t", text: L("risk_group") + ": " + c.risk.map(function (k) { return L("risk_" + k); }).join(", ") }));
  if (PROF.role !== "pat") {
    s.missed.forEach(function (r) { out.push(one(L("anc_missed"), r, "bad")); });
    if (s.cur) out.push(one(L("anc_now"), s.cur, "warn"));
    else if (s.nxt) out.push(one(L("anc_next"), s.nxt, ""));
  }
  return h("div", { class: "ancbox" }, out);
}
function patBlock(c) {
  var p = patState(c); if (!p || PROF.role === "cab") return null;
  return h("div", { class: "ancbox" }, [h("b", { text: L("pat_title") })].concat(p.items.map(function (x) {
    var st = p.done[x.k] ? ["ok", L("pat_done")] : x.to < todayStr() ? ["bad", L("pat_missed")] : x.from <= todayStr() ? ["warn", L("pat_now")] : ["mute", L("pat_later")];
    return h("div", { class: "anc " + (st[0] === "ok" ? "" : st[0]) }, [h("span", { class: "badge " + st[0], text: st[1] }), " ", h("b", { text: itemLabel(x.k) }), h("div", { class: "small muted", text: fmtD(x.from) + "–" + fmtD(x.to) })]);
  })));
}
function scrBlock(c) {
  var s = scrState(c); if (!s.length) return c.cat === CAT_WOMAN && !c.byear ? h("p", { class: "small muted", text: L("scr_need_byear") }) : null;
  return h("div", { class: "ancbox" }, [h("b", { text: L("scr_title") + " · " + L("age_n", { n: caseAge(c) }) })].concat(s.map(function (x) {
    return h("div", { class: "anc " + (x.need ? "warn" : "") }, [h("span", { class: "badge " + (x.need ? "warn" : "ok"), text: x.need ? L("scr_need") : L("scr_ok") }), " ", h("b", { text: L("scr_" + x.k) }),
      h("div", { class: "small muted", text: (x.last ? L("scr_last", { d: fmtD(x.last) }) : L("scr_never")) + (x.due && !x.need ? " · " + L("scr_next", { d: fmtD(x.due) }) : "") })]);
  })));
}
// отметить, что уже пройдено по плану (например, у пациентки, взятой на учёт позже)
async function markStd(c) {
  var a = ancState(c), p = patState(c), keys = [];
  if (a) ANC.forEach(function (r) { keys.push("anc:" + r.visit_no); });
  if (p) p.items.forEach(function (x) { keys.push(x.k); });
  if (!keys.length) return;
  var fromVisit = {}; (c.visits || []).forEach(function (v) { if (v.std) fromVisit["anc:" + v.std] = 1; (v.items || []).forEach(function (k) { fromVisit[k] = 1; }); });
  var dm = doneMap(c);
  var boxes = keys.map(function (k) {
    var cb = h("input", { type: "checkbox", value: k }); cb.checked = !!dm[k]; if (fromVisit[k]) cb.disabled = true;
    return h("label", { class: "inl" }, [cb, " " + itemLabel(k) + (fromVisit[k] ? " (" + L("visit_recorded") + ")" : "")]);
  });
  var ok = await modal(L("t_done_items"), [h("p", { class: "small muted", text: L("done_items_hint") })].concat(boxes), [[L("cancel"), false, ""], [L("save"), true, "pri"]]);
  if (!ok) return;
  c.done = {}; delete c.stdDone;
  boxes.forEach(function (l) { var cb = l.querySelector("input"); if (cb.checked && !cb.disabled) c.done[cb.value] = 1; });
  await persistCase(c); toast(L("saved")); render();
}
async function openCase(c) {
  var vis = c.visits.map(function (v) {
    var what = (v.items || (v.std ? ["anc:" + v.std] : [])).map(itemLabel).join(", ");
    return h("div", { class: "visit" }, [h("b", { text: fmtD(v.d) + (what ? " · " + what : "") }), v.note ? h("div", { text: v.note }) : null,
      (v.ph || []).length ? h("div", { class: "thumbs" }, v.ph.map(function (id) { var img = h("img", { alt: L("photo"), class: "lazy" }); Vault.load("f:" + id).then(function (f) { if (f) img.src = f.data; }); return h("div", { class: "th", onclick: function () { showPhoto(id); } }, img); })) : null]);
  });
  var ag = ageGroup(c);
  var rows = [[L("f_cat"), catName(c.cat)], [L("f_byear"), c.byear ? c.byear + " (" + L("ag_" + ag) + ")" : ""], [L("f_birth"), fmtD(c.birth)], [L("f_disch"), fmtD(c.disch)], [L("f_mah"), c.mahalla], [L("f_street"), c.street], [L("f_phone"), c.phone], [L("f_diag"), c.diag], [L("f_note"), c.note], [L("f_src"), c.src]].filter(function (r) { return r[1]; });
  var canMark = (ancState(c) && PROF.role !== "pat") || (patState(c) && PROF.role !== "cab");
  var act = await modal(caseTitle(c), [h("div", { class: "kvlist" }, rows.map(function (r) { return h("div", null, [h("span", { class: "k", text: r[0] }), h("span", { class: "v", text: r[1] })]); })),
    h("div", { class: "bar" }, [dueBadge(c), caseNext(c) && !c.closed ? h("span", { class: "small muted", text: L("next_visit_d", { d: fmtD(caseNext(c)) }) }) : null]),
    ancBlock(c), patBlock(c), scrBlock(c),
    h("h2", { text: L("visits_n", { n: c.visits.length }) }), vis.length ? vis : h("p", { class: "muted small", text: L("no_visits") })],
    [[L("del"), "del", "danger"], [L("edit"), "edit", ""], canMark ? [L("t_done_items"), "std", ""] : null, c.closed ? [L("reopen"), "reopen", ""] : null, [L("close"), false, "pri"]].filter(Boolean));
  if (act === "del") { if (await confirmBox(L("del_case_q", { t: caseTitle(c) }), L("del"))) { await deleteCase(c); toast(L("deleted")); render(); } }
  else if (act === "edit") editCase(c);
  else if (act === "std") { await markStd(c); }
  else if (act === "reopen") { c.closed = false; c.next = c.next || (planStates(c).length ? "" : addDays(todayStr(), 7)); await persistCase(c); render(); }
}
function caseSub(c) {
  var a = ancState(c), bits = [catName(c.cat)];
  if (a) bits.push(L("weeks_n", { n: a.wk.w }));
  if (c.cat === CAT_NB && c.birth) bits.push(L("age_days", { n: diffDays(todayStr(), c.birth) }));
  if (c.cat === CAT_PP && c.birth) bits.push(L("pp_day", { n: diffDays(todayStr(), c.birth) + 1 }));
  if (c.cat === CAT_WOMAN && c.byear) bits.push(L("age_n", { n: caseAge(c) }));
  if ((c.risk || []).length) bits.push("⚠ " + L("risk_group"));
  return bits.concat([dispText(c.mahalla), dispText(c.street)]).filter(Boolean).join(" · ");
}
function caseCard(c) {
  var lastV = c.visits[0];
  return h("div", { class: "case " + caseDue(c).k }, [
    h("div", { class: "ch" }, [h("b", { text: caseTitle(c) }), dueBadge(c)]),
    h("div", { class: "small muted", text: caseSub(c) }),
    c.diag ? h("div", { class: "small", text: c.diag }) : null,
    lastV ? h("div", { class: "small muted", text: L("last_visit", { d: fmtD(lastV.d) }) + (lastV.ph && lastV.ph.length ? " · 📷 " + lastV.ph.length : "") }) : null,
    h("div", { class: "acts" }, [c.closed ? null : h("button", { type: "button", class: "pri", onclick: function () { addVisit(c); } }, L("visit")),
      c.phone ? h("a", { class: "btnlink", href: "tel:" + c.phone.replace(/[^\d+]/g, ""), text: "📞" }) : null,
      h("button", { type: "button", onclick: function () { openCase(c); } }, L("card"))])]);
}
function casesView() {
  var root = h("div"), cnt = dueCounts(), list = h("div"), q = h("input", { type: "search", id: "c_q", placeholder: L("ph_search"), value: CS.q });
  var banner = null;
  if (cnt.late || cnt.today) banner = h("div", { class: "alert " + (cnt.late ? "bad" : "warn"), id: "cases_alert" }, [h("b", { text: L("need_visit", { a: cnt.today }) + (cnt.late ? ", " + L("late_n", { n: cnt.late }) : "") }), cnt.tomorrow ? h("span", { text: " · " + L("tomorrow_n", { n: cnt.tomorrow }) }) : null]);
  root.appendChild(h("div", { class: "cards" }, [
    h("div", { class: "card " + (cnt.late ? "bad" : "ok") }, [h("b", { text: String(cnt.late) }), h("span", { text: L("k_late") })]),
    h("div", { class: "card " + (cnt.today ? "warn" : "") }, [h("b", { text: String(cnt.today) }), h("span", { text: L("k_today") })]),
    h("div", { class: "card" }, [h("b", { text: String(cnt.tomorrow) }), h("span", { text: L("k_tomorrow") })]),
    h("div", { class: "card" }, [h("b", { text: String(cnt.week + cnt.later + cnt.none + cnt.late + cnt.today + cnt.tomorrow) }), h("span", { text: L("k_watch") })])]));
  var ac = ancCounts();
  if (ac.total && PROF.role !== "pat") root.appendChild(h("p", { class: "small muted", id: "anc_counts", text: L("anc_counts", { t: ac.total, m: ac.missed, c: ac.cur }) }));
  if (banner) root.appendChild(banner);
  var catSel = h("select", { id: "c_catf" }, [h("option", { value: "", text: L("all_cats") })].concat(CATS.map(function (x) { return h("option", { value: x, text: catName(x) }); })));
  catSel.value = CS.cat || "";
  root.appendChild(h("div", { class: "bar" }, [h("button", { class: "pri big", type: "button", id: "addCase", onclick: function () { addCase(CS.cat || ""); } }, "＋ " + L("new_patient")), q, catSel]));
  function draw() {
    CS.q = q.value; CS.cat = catSel.value; var toks = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean); list.textContent = "";
    var all = activeCases().filter(function (c) { if (CS.cat && c.cat !== CS.cat) return false; var s = [c.card, c.name, c.mahalla, c.street, c.diag, c.phone, c.cat, catName(c.cat)].join(" ").toLowerCase(); return toks.every(function (t) { return s.indexOf(t) >= 0; }); });
    if (!activeCases().length) { list.appendChild(h("div", { class: "panel" }, [h("h2", { text: L("empty_title") }), h("p", { class: "small muted", text: L("empty_hint") })])); return; }
    if (!all.length) { list.appendChild(h("p", { class: "muted", text: L("nothing_found") })); return; }
    var groups = [["late", "g_late"], ["today", "g_today"], ["tomorrow", "g_tomorrow"], ["week", "g_week"], ["later", "g_later"], ["none", "g_none"], ["closed", "g_closed"]];
    groups.forEach(function (g) {
      var items = all.filter(function (c) { return caseDue(c).k === g[0]; }).sort(function (a, b) { return (caseNext(a) || "9").localeCompare(caseNext(b) || "9") || caseTitle(a).localeCompare(caseTitle(b)); });
      if (!items.length) return;
      var title = L(g[1]) + " (" + items.length + ")";
      if (g[0] === "closed") list.appendChild(h("details", null, [h("summary", { text: title }), h("div", { class: "cases" }, items.map(caseCard))]));
      else list.appendChild(h("div", { class: "grp" }, [h("h2", { text: title }), h("div", { class: "cases" }, items.map(caseCard))]));
    });
  }
  q.oninput = draw; catSel.onchange = draw; root.appendChild(list); draw(); return root;
}
function casesSettings() {
  var cnt = activeCases().length;
  return h("div", { class: "panel" }, [h("h2", { text: L("set_cases", { n: cnt }) }),
    h("p", { class: "small muted", text: L("set_cases_hint") }),
    h("div", { class: "bar" }, [h("button", { type: "button", id: "expCases", onclick: function () { exportCasesUi(false); } }, L("exp_full")),
      h("button", { type: "button", id: "impCases", onclick: function () { $("casesIn").click(); } }, L("imp_cases")),
      h("button", { type: "button", id: "icsCases", onclick: exportCasesIcs }, L("ics_btn"))])]);
}
// отдать файл: на телефоне — сразу в Telegram/другое приложение (меню «Поделиться»), иначе — сохранить в «Загрузки»
async function shareOrSave(name, blob, type) {
  try {
    var f = new File([blob], name, { type: type || "application/octet-stream" });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
  download(name, blob); return "saved";
}
// панель ключей: администратор копирует свой открытый ключ на сайт; у доя — ключ администратора из ключа активации
function keyPanel() {
  var p = S.prof || {};
  if (PROF.role === "coord") {
    var k = p.ckp ? p.ckp.pub.x + "." + p.ckp.pub.y : "";
    return h("div", { class: "panel", id: "keyPanel" }, [h("h2", { text: L("ak_title") }), h("p", { class: "small muted", text: L("ak_hint") }),
      h("p", null, [h("span", { text: L("key_code") + ": " }), h("b", { id: "myKid", text: p.ckp ? p.ckp.pub.kid : "—" })]),
      h("textarea", { id: "myPub", readonly: true, rows: 3, class: "small" }, k),
      h("div", { class: "bar" }, [h("button", { class: "pri", type: "button", id: "copyPub", onclick: function () { copyText(k); } }, L("ak_copy"))])]);
  }
  var a = PROF.act && PROF.act.k;
  return h("div", { class: "panel", id: "keyPanel" }, [h("h2", { text: L("key_title") }),
    a ? h("p", null, [h("span", { class: "badge ok", text: L("key_ok") }), " ", h("span", { text: L("key_code") + ": " }), h("b", { id: "keyKid", text: PROF.act.kid || "" })]) : h("p", { class: "badge warn", id: "keyKid", text: L("key_none") }),
    h("p", { class: "small muted", text: L("key_hint") })]);
}
async function exportCasesUi(delta) {
  if (!Object.keys(S.cases).length) return toast(L("e_nothing"), true);
  if (!sendKey()) { await modal(L("key_title"), [h("p", { text: L("key_need") })], [[L("close"), true, "pri"]]); return; }
  var r = await exportCases(!delta, delta);
  var who = (S.prof && (S.prof.unit || S.prof.inst)) || "";
  var how = await shareOrSave("OvaBMQ_" + (delta ? "yangilash_" : "pacienty_") + (who ? norm(who).slice(0, 20) + "_" : "") + todayStr() + ".ovabmkc", r.blob);
  if (how !== "cancel") toast(L(how === "shared" ? "exp_shared" : "exp_done", { n: r.n }));
  if (delta) render();
}
async function onCasesImport(file) {
  if (!file) return;
  var text = await file.text(), j = null;
  try { j = JSON.parse(text); } catch (e) { }
  try {
    var r = await importCases(text);
    if (r && r.needPw) {   // старый файл, зашифрованный паролем
      var pw = h("input", { type: "password", id: "ipw", autocomplete: "off" });
      if (!(await modal(L("t_import"), [h("p", { class: "small muted", text: L("import_old") }), h("label", null, [L("import_pw"), pw])], [[L("cancel"), false, ""], [L("import_go"), true, "pri"]]))) return;
      r = await importCases(text, pw.value);
      if (!r) return toast(L("e_import_pw"), true);
    }
    toast(L("import_done", { a: r.added, u: r.updated, s: r.same }) + (r.photos ? ", " + L("photos_n", { n: r.photos }) : "") + (r.from && (r.from.unit || r.from.inst) ? " · " + (r.from.unit || r.from.inst) : "")); render();
  } catch (e) { toast(e.message, true); }
}
