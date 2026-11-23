#!/usr/bin/env python3
"""Встраивает рендеры людей (Blender) в игру.

Запуск: python3 tools/embed_units.py <папка с PNG>
Каждый PNG обрезается по фигуре, ставится на квадрат (низ по низу), сжимается в WebP
и записывается в docs/chess/units/<имя>.webp; затем все картинки встраиваются data-URI
в docs/chess/zoo-chess.html (объект перед ART['hu_' + k]).
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.join(HERE, '..', 'docs', 'chess', 'units')
GAME = os.path.join(HERE, '..', 'docs', 'chess', 'zoo-chess.html')
NAMES = ['general', 'jet', 'tank', 'helicopter', 'apc', 'spetsnaz',
         'stone_chief', 'stone_shaman', 'stone_mammoth', 'stone_hunter', 'stone_slinger', 'stone_gatherer',
         'iron_king', 'iron_chariot', 'iron_tower', 'iron_archer', 'iron_rider', 'iron_legion',
         'ind_emperor', 'ind_train', 'ind_armored', 'ind_airship', 'ind_cavalry', 'ind_rifleman',
         'tech_ai', 'tech_mech', 'tech_laser', 'tech_drone', 'tech_exo', 'tech_robot']
SIZE = 300


def prepare(png):
    im = Image.open(png).convert('RGBA')
    im = im.crop(im.getbbox())
    S = max(im.size)
    pad = int(S * 0.03)
    can = Image.new('RGBA', (S + 2 * pad, S + pad), (0, 0, 0, 0))
    can.paste(im, ((S + 2 * pad - im.width) // 2, S + pad - im.height), im)
    can = can.resize((SIZE, SIZE * can.height // can.width), Image.LANCZOS)
    sq = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sq.paste(can, (0, SIZE - can.height), can)
    buf = io.BytesIO()
    sq.save(buf, 'WEBP', quality=80, method=6)
    return buf.getvalue()


def main(src):
    os.makedirs(UNITS, exist_ok=True)
    uris = {}
    for n in NAMES:
        p = os.path.join(src, n + '.png')
        if not os.path.exists(p):
            print('missing', n)
            continue
        data = prepare(p)
        open(os.path.join(UNITS, n + '.webp'), 'wb').write(data)
        uris[n] = 'data:image/webp;base64,' + base64.b64encode(data).decode()
        print(n, len(data) // 1024, 'KB')
    html = open(GAME, encoding='utf-8').read()
    pat = re.compile(r'Object\.entries\(\{"[a-z_]+": "data:image/webp;base64,[^)]*\}\)\.forEach\(\(\[k, uri\]\) => \{ ART\[\'hu_\' \+ k\]')
    m = pat.search(html)
    assert m, 'embed block not found'
    new = 'Object.entries(' + json.dumps(uris) + ").forEach(([k, uri]) => { ART['hu_' + k]"
    html = html[:m.start()] + new + html[m.end():]
    open(GAME, 'w', encoding='utf-8').write(html)
    print('embedded', len(uris))


if __name__ == '__main__':
    main(sys.argv[1])
