"""Генерирует SQL с подпапками из tools/subfolders_data.py (вывод в stdout)."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ns = {}
exec(open(os.path.join(HERE, "subfolders_data.py"), encoding="utf-8").read(), ns)
P, A = ns["P"], ns["A"]

def uz(s):  # узбекская латиница: oʻ gʻ и тутуқ белгиси ʼ
    s = re.sub(r"([oOgG])'", lambda m: m.group(1) + "ʻ", s)
    return s.replace("'", "ʼ")

# Кто сдаёт → коды должностей сайта (docs/positions.js)
ROLE = {"R0": ["orinbosar"], "DEV": ["orinbosar"], "AG": ["bosh_akusher"], "PED": ["bosh_pediatr"], "STAT": ["statistik"],
        "SCH": ["maktab_mtm_hamshira"], "VAC": ["emlash_xonasi"], "EPI": ["dsenm"], "SVP": ["oilaviy_shifokor"],
        "DOYA": ["doya_qvp"], "RSM": ["reproduktiv_markaz"], "SKR": ["skrining_markazi"], "TER": ["bosh_terapevt"],
        "AK": ["akusherlik_kompleksi"], "BRIG": ["onalar_olimi"], "HR": ["kadrlar"], "APT": ["ombor_dorixona"], "ARX": ["arxiv"]}
EXTRA = {"3.1": ["bosh_pediatr"], "3.2": ["bosh_pediatr"], "14.4": ["ombor_dorixona"]}
ST = {"S": "site", "R": "numbers", "O": "offline"}
PER = {"1": "once", "M": "month", "Q": "quarter", "Y": "year", "K": "incoming", "H": "case"}

def q(s): return "'" + s.replace("'", "''") + "'"

rows = []
for n, _, _, subs in P:
    assert len(subs) == len(A[n]), n
    for i, ((u, r), (st, ro, pe, pa, note)) in enumerate(zip(subs, A[n]), 1):
        sid = f"{n}.{i}"
        pos = ROLE[ro] + [p for p in EXTRA.get(sid, []) if p not in ROLE[ro]]
        if n == 15: st = "O"   # папка 15 закрыта на сайте для всех
        rows.append(f"({q(sid)}, {n}, {i}, {q(uz(u))}, {q(r)}, {q(ST[st])}, array[{', '.join(q(p) for p in pos)}]::text[], {q(PER[pe])}, {'true' if pa else 'false'}, {q(note)})")
print("-- Сгенерировано tools/gen_subfolders.py из tools/subfolders_data.py — не править вручную.")
print("insert into public.subfolders (id, folder_id, no, title_uz, title_ru, storage, positions, period, paper, note_ru) values")
print(",\n".join(rows))
print("on conflict (id) do update set title_uz = excluded.title_uz, title_ru = excluded.title_ru, storage = excluded.storage,")
print("  positions = excluded.positions, period = excluded.period, paper = excluded.paper, note_ru = excluded.note_ru;")
