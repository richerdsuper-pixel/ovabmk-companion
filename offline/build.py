import json, pathlib, sys
d = pathlib.Path(__file__).parent
t = (d/"src/template.html").read_text(encoding="utf-8")
roles = (d/"roles.json").read_text(encoding="utf-8").replace("</", "<\\/")
parts = {"/*CSS*/": (d/"src/style.css").read_text(encoding="utf-8"),
         "/*ROLES*/": "var ROLES=" + roles + ";",
         "/*ANC*/": "var ANC=" + (d/"anc.json").read_text(encoding="utf-8").replace("</", "<\\/") + ";",
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
