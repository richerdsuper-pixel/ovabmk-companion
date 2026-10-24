"""Собирает docs/indicators.js из offline/roles.json (показатели берутся из листа Boshqaruv файлов Baza_NN)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
roles = {r["no"]: r for r in json.load(open(root / "offline/roles.json", encoding="utf-8"))}
# номер файла Baza -> код должности на сайте (docs/positions.js)
CODES = {1:"doya_qvp",2:"akusher_ginekolog",3:"oilaviy_shifokor",4:"pediatr",5:"emlash_xonasi",6:"maktab_mtm_hamshira",7:"skrining_markazi",
 8:"akusherlik_kompleksi",9:"bosh_terapevt",10:"statistik",11:"kadrlar",12:"ombor_dorixona",13:"arxiv",14:"onalar_olimi",15:"reproduktiv_markaz",
 16:"bosh_akusher",17:"bosh_pediatr",18:"neonatolog",19:"bolalar_ginekologi",20:"dsenm",21:"maorif",22:"nikoh",23:"adliya",24:"soglom_avlod",25:"ijtimoiy_himoya"}
out = {}
for no, code in CODES.items():
    r = roles[no]
    out[code] = {"rule": r["rule"], "ind": [{"n": i["n"], "ru": i["ru"], "uz": i["uz"], "unit": i["unit"] or "", "folder": i["folder"]} for i in r["ind"]]}
js = ("// Показатели по должностям: только числа за период. Создано tools/gen_indicators.py из файлов Baza_NN (лист Boshqaruv).\n"
      "// rule: w — раз в неделю (d: 1=пн…5=пт), m — раз в месяц (d: число), q — раз в квартал (янв/апр/июл/окт), c — по случаю; h — час срока.\n"
      "window.INDICATORS = {\n" + ",\n".join(" " + json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in out.items()) + "\n};\n")
(root / "docs/indicators.js").write_text(js, encoding="utf-8")
print(len(out), "должностей,", sum(len(v["ind"]) for v in out.values()), "показателей")
