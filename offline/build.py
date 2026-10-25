import json, pathlib, sys
d = pathlib.Path(__file__).parent
t = (d/"src/template.html").read_text(encoding="utf-8")
roles = (d/"roles.json").read_text(encoding="utf-8").replace("</", "<\\/")
parts = {"/*CSS*/": (d/"src/style.css").read_text(encoding="utf-8"),
         "/*ROLES*/": "var ROLES=" + roles + ";",
         "/*ANC*/": "var ANC=" + (d/"anc.json").read_text(encoding="utf-8").replace("</", "<\\/") + ";var SIGN_PUB=" + (d/"sign_pub.json").read_text(encoding="utf-8").strip() + ";",
         "/*XLSX*/": (d/"src/xlsx.js").read_text(encoding="utf-8"),
         "/*I18N*/": (d/"src/i18n.js").read_text(encoding="utf-8"),
         "/*CORE*/": (d/"src/core.js").read_text(encoding="utf-8"),
         "/*CASES*/": (d/"src/cases.js").read_text(encoding="utf-8"),
         "/*DOYA*/": (d/"src/doya.js").read_text(encoding="utf-8"),
         "/*UI*/": (d/"src/ui.js").read_text(encoding="utf-8")}
for k, v in parts.items():
    assert t.count(k) == 1, k
    t = t.replace(k, v.replace("</script", "<\\/script"))
out = d/"dist"/"OvaBMQ_Offline.html"
out.parent.mkdir(exist_ok=True)
out.write_text(t, encoding="utf-8")
print(out, len(t)//1024, "KB")

# копия для скачивания с сайта: HTML (открывается сразу) и ZIP (скачивается как файл на любом телефоне)
import zipfile
docs = d.parent/"docs"
(docs/"OvaBMQ_Offline.html").write_text(t, encoding="utf-8")
with zipfile.ZipFile(docs/"OvaBMQ_Offline.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("OvaBMQ_Offline.html", t.encode("utf-8"))

# устанавливаемое приложение (PWA) на сайте: docs/app/ — открывается по ссылке, ставится иконкой на телефон и работает без интернета.
# Политика безопасности та же (сеть странице запрещена); разрешён только свой service worker и манифест.
import hashlib
app = docs/"app"; app.mkdir(exist_ok=True)
ver = hashlib.sha256(t.encode("utf-8")).hexdigest()[:12]
pwa = t.replace("form-action 'none'", "form-action 'none'; worker-src 'self'; manifest-src 'self'").replace("img-src data:", "img-src data: 'self'")
pwa = pwa.replace('<meta name="color-scheme" content="light dark">', '<meta name="color-scheme" content="light dark">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#0f6b5c">\n<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="mobile-web-app-capable" content="yes">')
pwa = pwa.replace("<script>boot();</script>", "<script>boot();if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('sw.js').catch(function(){});}</script>")
assert "worker-src" in pwa and "manifest.webmanifest" in pwa and "serviceWorker" in pwa
(app/"index.html").write_text(pwa, encoding="utf-8")
(app/"manifest.webmanifest").write_text(json.dumps({"name": "OvaBMQ — Доя", "short_name": "OvaBMQ", "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "#ffffff", "theme_color": "#0f6b5c", "lang": "uz",
  "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]}, ensure_ascii=False, indent=1), encoding="utf-8")
(app/"sw.js").write_text("""// OvaBMQ: работа без интернета. Версия %s
var C = "ovabmq-%s", FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var u = new URL(e.request.url); if (u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
    var net = fetch(e.request).then(function (res) { if (res && res.ok) { var cp = res.clone(); caches.open(C).then(function (c) { c.put(e.request, cp); }); } return res; }).catch(function () { return r || caches.match("index.html"); });
    return r || net;
  }));
});
""" % (ver, ver), encoding="utf-8")
for n in (192, 512):
    ip = app/("icon-%d.png" % n)
    if not ip.exists():
        from PIL import Image, ImageDraw, ImageFont
        im = Image.new("RGB", (n, n), "#0f6b5c"); dr = ImageDraw.Draw(im)
        try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(n * 0.42))
        except Exception: f = ImageFont.load_default()
        w = dr.textlength("OB", font=f); dr.text(((n - w) / 2, n * 0.27), "OB", fill="white", font=f)
        im.save(ip)
print("app", ver)
