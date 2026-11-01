// OvaBMҚ: сайт открывается без интернета. Сначала сеть, при её отсутствии — сохранённая копия.
// Данные (Supabase) не кэшируются: список беременных без сети — из сохранённого в браузере (docs/mothers.js, только чтение).
// Кэш офлайн-программы (docs/app/, имя «ovabmq-…») не трогаем.
var C = "ovabmk-site-v1";
var FILES = ["./", "index.html", "styles.css", "config.js", "i18n.js", "i18n_mothers.js", "positions.js", "indicators.js", "xlsx.js", "charts.js",
  "advice.js", "mothers.js", "app.js", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(C).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(new Request(f, { cache: "reload" })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("ovabmk-site-") === 0 && k !== C; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var u = new URL(e.request.url);
  var mine = u.origin === location.origin, lib = u.href.indexOf("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@") === 0;
  if (!mine && !lib) return;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res && res.ok) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); }
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || (e.request.mode === "navigate" ? caches.match("index.html") : undefined); })
      .then(function (r) { return r || Response.error(); });
  }));
});
