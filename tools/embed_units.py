#!/usr/bin/env python3
"""Встраивает Blender-рендеры фигур в игру.

Запуск: python3 tools/embed_units.py <папка> [<папка> …]   (более поздние папки важнее)

* люди пяти эпох: <имя>.png → ART['hu_<имя>'];
* новые семейства природы: nt_* / nf_* / nb_* / nv_* → ART['<имя>'];
* реалистичные животные: an_* → ART['<имя>'] (кому они достаются — REAL_ART в игре);
* если рядом лежат кадры шага <имя>_a.png и <имя>_b.png, они встраиваются тоже
  (все три обрезаются по общей рамке, чтобы фигура не «прыгала»).
Картинки пишутся в docs/chess/units/ (WebP) и data-URI в docs/chess/zoo-chess.html.
"""
import base64
import glob
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.join(HERE, '..', 'docs', 'chess', 'units')
GAME = os.path.join(HERE, '..', 'docs', 'chess', 'zoo-chess.html')
HUMANS = ['general', 'jet', 'tank', 'helicopter', 'apc', 'spetsnaz',
          'stone_chief', 'stone_shaman', 'stone_mammoth', 'stone_hunter', 'stone_slinger', 'stone_gatherer',
          'iron_king', 'iron_chariot', 'iron_tower', 'iron_archer', 'iron_rider', 'iron_legion',
          'ind_emperor', 'ind_train', 'ind_armored', 'ind_airship', 'ind_cavalry', 'ind_rifleman',
          'tech_ai', 'tech_mech', 'tech_laser', 'tech_drone', 'tech_exo', 'tech_robot']
SIZE = 280


def find(dirs, name):
    for d in reversed(dirs):
        p = os.path.join(d, name + '.png')
        if os.path.exists(p):
            return p
    return None


def encode(ims, box):
    out = []
    for im in ims:
        im = im.crop(box)
        S = max(im.size)
        pad = int(S * 0.03)
        can = Image.new('RGBA', (S + 2 * pad, S + pad), (0, 0, 0, 0))
        can.paste(im, ((S + 2 * pad - im.width) // 2, S + pad - im.height), im)
        can = can.resize((SIZE, SIZE * can.height // can.width), Image.LANCZOS)
        sq = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        sq.paste(can, (0, SIZE - can.height), can)
        buf = io.BytesIO()
        sq.save(buf, 'WEBP', quality=78, method=6)
        out.append(buf.getvalue())
    return out


def main(dirs):
    os.makedirs(UNITS, exist_ok=True)
    nature = sorted({os.path.basename(p)[:-4] for d in dirs for p in glob.glob(os.path.join(d, 'n[tfbv]_*.png')) + glob.glob(os.path.join(d, 'an_*.png')) if not re.search(r'_[ab]\.png$', p)})
    data = {}
    total = 0
    for name in HUMANS + nature:
        p0 = find(dirs, name)
        if not p0:
            print('missing', name)
            continue
        d0 = os.path.dirname(p0)
        frames = [p0] + [os.path.join(d0, f'{name}_{f}.png') for f in 'ab' if os.path.exists(os.path.join(d0, f'{name}_{f}.png'))]
        ims = [Image.open(p).convert('RGBA') for p in frames]
        boxes = [im.getbbox() for im in ims]
        box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        blobs = encode(ims, box)
        for suf, b in zip(['', '_a', '_b'], blobs):
            open(os.path.join(UNITS, name + suf + '.webp'), 'wb').write(b)
            total += len(b)
        key = ('hu_' + name) if name in HUMANS else name
        data[key] = ['data:image/webp;base64,' + base64.b64encode(b).decode() for b in blobs]
    html = open(GAME, encoding='utf-8').read()
    pat = re.compile(r"Object\.entries\(\{\"[a-z_]+\": [\[\"].*?\}\)\.forEach\(\(\[k, (?:uri|fr)\]\) => \{ ART\[[^\n]*?\}\);", re.S)
    m = pat.search(html)
    assert m, 'embed block not found'
    new = ('Object.entries(' + json.dumps(data) + ").forEach(([k, fr]) => { ART[k] = fr.map((u, i) => "
           "`<image class=\"hf${i}\" href=\"${u}\" x=\"2\" y=\"2\" width=\"96\" height=\"92\" preserveAspectRatio=\"xMidYMax meet\"/>`).join(''); });")
    html = html[:m.start()] + new + html[m.end():]
    open(GAME, 'w', encoding='utf-8').write(html)
    print('embedded', len(data), 'figures,', total // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1:])
