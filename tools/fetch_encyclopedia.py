#!/usr/bin/env python3
"""Собирает данные «Энциклопедии» для «Шахмат царств» из Википедии.

Для каждой фигуры: фото (только свободные лицензии, pilicense=free) с автором
и лицензией из Wikimedia Commons, и первые предложения статьи на ru / en / uz
(если узбекской статьи нет — берётся русская). Тексты Википедии — CC BY-SA 4.0.

Запуск: python3 tools/fetch_encyclopedia.py
Результат: docs/chess/enc/data.json и docs/chess/enc/<id>.webp
"""
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'chess', 'enc')
UA = 'KingdomsChessBuild/1.0 (educational offline build script)'
CTX = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None))

# family -> role -> English Wikipedia article
PIECES = {
    'classic': {'k': 'King (chess)', 'q': 'Queen (chess)', 'r': 'Rook (chess)', 'b': 'Bishop (chess)', 'n': 'Knight (chess)', 'p': 'Pawn (chess)'},
    'savanna': {'k': 'Lion', 'q': 'African leopard', 'r': 'White rhinoceros', 'b': 'African bush elephant', 'n': 'Plains zebra', 'p': 'Vervet monkey'},
    'ocean': {'k': 'Humpback whale', 'q': 'Shark', 'r': 'Green sea turtle', 'b': 'Crab', 'n': 'Dolphin', 'p': 'Ocellaris clownfish'},
    'cats': {'k': 'Lion', 'q': 'Tiger', 'r': 'Jaguar', 'b': 'Eurasian lynx', 'n': 'Cheetah', 'p': 'Kitten'},
    'primates': {'k': 'Western gorilla', 'q': 'Orangutan', 'r': 'Baboon', 'b': 'Ring-tailed lemur', 'n': 'Gibbon', 'p': 'Capuchin monkey'},
    'birds': {'k': 'Golden eagle', 'q': 'Peregrine falcon', 'r': 'Emperor penguin', 'b': 'Greater flamingo', 'n': 'Barn owl', 'p': 'Chicken'},
    'whales': {'k': 'Blue whale', 'q': 'Orca', 'r': 'Sperm whale', 'b': 'Narwhal', 'n': 'Common bottlenose dolphin', 'p': 'Beluga whale'},
    'sharks': {'k': 'Whale shark', 'q': 'Great white shark', 'r': 'Great hammerhead', 'b': 'Sawfish', 'n': 'Giant oceanic manta ray', 'p': 'Spiny dogfish'},
    'phages': {'k': 'Escherichia virus T4', 'q': 'T7 phage', 'r': 'Lambda phage', 'b': 'Phi X 174', 'n': 'Phi29 DNA polymerase', 'p': 'Bacteriophage MS2'},
    'virions': {'k': 'Adenoviridae', 'q': 'Coronavirus', 'r': 'Tobacco mosaic virus', 'b': 'Rotavirus', 'n': 'Influenza A virus', 'p': 'Norovirus'},
    'cocci': {'k': 'Staphylococcus aureus', 'q': 'Streptococcus', 'r': 'Sarcina', 'b': 'Diplococcus', 'n': 'Streptococcus pneumoniae', 'p': 'Coccus'},
    'rods': {'k': 'Escherichia coli', 'q': 'Vibrio cholerae', 'r': 'Bacillus subtilis', 'b': 'Spirillum', 'n': 'Proteus mirabilis', 'p': 'Lactobacillus'},
    'capfungi': {'k': 'Boletus edulis', 'q': 'Amanita muscaria', 'r': 'Leccinum scabrum', 'b': 'Cantharellus cibarius', 'n': 'Lactarius deliciosus', 'p': 'Armillaria mellea'},
    'oddfungi': {'k': 'Morchella', 'q': 'Penicillium', 'r': 'Fomes fomentarius', 'b': 'Hydnum repandum', 'n': 'Puffball', 'p': 'Yeast'},
    'flowers': {'k': 'Common sunflower', 'q': 'Rose', 'r': 'Cactus', 'b': 'Tulip', 'n': 'Taraxacum officinale', 'p': 'Matricaria chamomilla'},
    'trees': {'k': 'Quercus robur', 'q': 'Sequoia sempervirens', 'r': 'Adansonia', 'b': 'Picea abies', 'n': 'Acer platanoides', 'p': 'Seedling'},
    'human': {'k': 'General officer', 'q': 'Fighter aircraft', 'r': 'Tank', 'b': 'Helicopter', 'n': 'Armoured personnel carrier', 'p': 'Special forces'},
}


def get(url, binary=False, tries=7):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
                data = r.read()
                return data if binary else json.loads(data.decode('utf-8'))
        except Exception as e:  # noqa: BLE001 — retry on any network hiccup
            if i == tries - 1:
                raise
            wait = 20 * (i + 1) if '429' in str(e) else 2 * (i + 1)
            print('  retry in', wait, 's:', str(e)[:60], flush=True)
            time.sleep(wait)


def api(lang, **params):
    params.update(format='json', formatversion='2')
    return get(f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params))


def clean(text, n=3):
    text = re.sub(r'\s*\([^()]*\)', '', text or '')            # drop parenthetical pronunciations etc.
    text = re.sub(r'\s+', ' ', text).strip()
    parts = re.split(r'(?<=[.!?])\s+(?=[A-ZА-ЯЁЎҚҒҲ«"])', text)
    out = ' '.join(parts[:n]).strip()
    return out[:600]


def extract(lang, title):
    if not title:
        return None
    d = api(lang, action='query', prop='extracts', exintro=1, explaintext=1, titles=title, redirects=1)
    page = d['query']['pages'][0]
    return clean(page.get('extract', '')) or None


def main():
    os.makedirs(ROOT, exist_ok=True)
    path = os.path.join(ROOT, 'data.json')
    out = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    done_titles = {}
    for k, rec in out.items():
        done_titles[PIECES[k.split('-')[0]][k.split('-')[1]]] = rec
    for fam, roles in PIECES.items():
        for role, title in roles.items():
            key = f'{fam}-{role}'
            if key in out:
                continue
            if title in done_titles:
                out[key] = dict(done_titles[title])
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(out, f, ensure_ascii=False, indent=0)
                print('reuse', key)
                continue
            d = api('en', action='query', prop='pageimages|langlinks|extracts|info', inprop='url', exintro=1, explaintext=1,
                    titles=title, redirects=1, pithumbsize=480, pilicense='free', lllimit=500)
            page = d['query']['pages'][0]
            links = {l['lang']: l['title'] for l in page.get('langlinks', [])}
            if not links:
                ll = api('en', action='query', prop='langlinks', titles=page['title'], lllimit=500)['query']['pages'][0].get('langlinks', [])
                links = {l['lang']: l['title'] for l in ll}
            rec = {'title': page['title'], 'url': page.get('fullurl'), 'en': clean(page.get('extract', ''))}
            rec['ru_title'] = links.get('ru')
            rec['uz_title'] = links.get('uz')
            rec['ru'] = extract('ru', links.get('ru'))
            rec['uz'] = extract('uz', links.get('uz'))
            img = page.get('pageimage')
            thumb = page.get('thumbnail', {}).get('source')
            if img and thumb:
                meta = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
                    'action': 'query', 'titles': 'File:' + img, 'prop': 'imageinfo', 'iiprop': 'extmetadata|url', 'format': 'json', 'formatversion': '2'}))
                ii = (meta['query']['pages'][0].get('imageinfo') or [{}])[0]
                em = ii.get('extmetadata', {})
                artist = re.sub(r'<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip()
                lic = em.get('LicenseShortName', {}).get('value', '')
                src = re.sub(r'^https://thumb\.wikimedia\.org/', 'https://upload.wikimedia.org/', thumb.split('?')[0])
                raw = get(src, binary=True)
                im = Image.open(io.BytesIO(raw)).convert('RGB')
                im.thumbnail((440, 330))
                im.save(os.path.join(ROOT, key + '.webp'), quality=72, method=6)
                rec.update(photo=key + '.webp', artist=artist[:120], license=lic, file='https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(img))
            out[key] = rec
            done_titles[title] = rec
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(out, f, ensure_ascii=False, indent=0)
            print('ok', key, rec.get('photo'), '| ru' if rec['ru'] else '| -ru', '| uz' if rec['uz'] else '| -uz', flush=True)
            time.sleep(2.5)
    with open(os.path.join(ROOT, 'data.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print('written', len(out))


if __name__ == '__main__':
    sys.exit(main())
