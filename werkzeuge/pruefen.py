#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════
#  Vorklinik – werkzeuge/pruefen.py   (läuft auch in GitHub Actions: .github/workflows/pruefen.yml)
#  Lokal im Hauptordner:  python3 werkzeuge/pruefen.py
#  FEHLER (rot): Struktur/Kapitel kaputt. HINWEISE (gelb): ansehen.
#   1. struktur.json gültig, jede Kapitel-ID genau einmal zugeordnet, Ordner kapitel/<id>/ vorhanden.
#   2. kapitel.json: Pflichtfelder, Einheiten, Karten/Fragen/Sortieren/Tabellen gültig, IDs eindeutig,
#      Seitenverweise innerhalb der Buchseiten des Kapitels (Hinweis bei Querverweisen).
#   3. tafeln.json: Bild vorhanden, Pins verweisen auf Strukturen und liegen im Bild, Bildnachweis vorhanden.
#   4. Pflichtrubriken: jedes Kapitel enthält Begriffe zu Bändern, Sehnen und Gelenken (Hinweis, wenn eine fehlt).
#   5. Kapitel-Ordner, die in struktur.json fehlen (Hinweis).
# ═══════════════════════════════════════════════════════
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
fehler, hinweise = [], []
F, H = fehler.append, hinweise.append

def lade(p):
    try: return json.loads(Path(p).read_text(encoding='utf-8'))
    except Exception as e: F(f'{p.relative_to(ROOT)}: kein gültiges JSON ({e})'); return None

# Rubrik wie in js/app.js (rubrikVon)
def rubrik(s):
    if s.get('rubrik'): return s['rubrik']
    l = s.get('lat', '')
    if re.match(r'^(Lig(g)?\.|Ligamentum|Ligamenta|Membrana|Retinaculum)', l, re.I): return 'band'
    if re.match(r'^(Tendo|Tendines|Aponeurosis|Vagina tendinis)', l, re.I): return 'sehne'
    if re.match(r'^(Art(t)?\.|Articulatio|Articulationes|Symphysis|Syndesmosis|Synchondrosis|Discus|Meniscus|Labrum|Capsula|Cavitas articularis|Bursa)', l, re.I): return 'gelenk'
    return 'weitere'

struktur = lade(ROOT / 'struktur.json') or {}
zugeordnet = {}
for t in struktur.get('themengebiete', []):
    for g in t.get('gruppen', []):
        for kid in g.get('kapitel', []):
            if kid in zugeordnet: F(f'struktur.json: Kapitel {kid} ist doppelt zugeordnet ({zugeordnet[kid]} und {g.get("id")})')
            zugeordnet[kid] = g.get('id')
for kid in zugeordnet:
    if not (ROOT / 'kapitel' / kid / 'kapitel.json').is_file(): F(f'struktur.json: kapitel/{kid}/kapitel.json fehlt')
for d in sorted((ROOT / 'kapitel').iterdir()):
    if d.is_dir() and d.name not in zugeordnet: H(f'kapitel/{d.name} ist in struktur.json keiner Gruppe zugeordnet (erscheint nicht)')

zahlen = []
for kid in zugeordnet:
    d = ROOT / 'kapitel' / kid
    K = lade(d / 'kapitel.json') if (d / 'kapitel.json').is_file() else None
    if not K: continue
    w = f'kapitel/{kid}'
    for f in ('id', 'titel', 'seiten', 'bereiche', 'einheiten', 'strukturen'):
        if f not in K: F(f'{w}: Feld „{f}“ fehlt')
    if K.get('id') != kid: F(f'{w}: id „{K.get("id")}“ passt nicht zum Ordner')
    bereiche = K.get('bereiche') or []
    def seiten_ok(ref, wo):
        for n in map(int, re.findall(r'\d+', str(ref))):
            if 1 < n < 1000 and not any(a <= n <= b for a, b in bereiche):
                H(f'{w}: {wo}: S. {n} liegt außerhalb des Kapitels ({ref})'); break
    einh = {u.get('nr') for u in K.get('einheiten', [])}
    S = K.get('strukturen', {})
    for sid, s in S.items():
        for f in ('lat', 'de', 'info', 'ref'):
            if not s.get(f): F(f'{w}: Struktur {sid} ohne „{f}“')
        seiten_ok(s.get('ref'), f'Struktur {sid}')
    ids = set()
    for k in K.get('karten', []):
        if k.get('id') in ids: F(f'{w}: Karten-ID doppelt: {k.get("id")}')
        ids.add(k.get('id'))
        if k.get('e') not in einh: F(f'{w}: Karte {k.get("id")}: Lerneinheit {k.get("e")} unbekannt')
        seiten_ok(k.get('ref'), f'Karte {k.get("id")}')
    ids = set()
    for q in K.get('fragen', []):
        if q.get('id') in ids: F(f'{w}: Fragen-ID doppelt: {q.get("id")}')
        ids.add(q.get('id'))
        o = q.get('o') or []
        if len(o) < 2 or not (0 <= q.get('r', -1) < len(o)): F(f'{w}: Frage {q.get("id")}: Optionen/Lösung ungültig')
        if len(set(o)) != len(o): F(f'{w}: Frage {q.get("id")}: Option doppelt')
        if q.get('e') not in einh: F(f'{w}: Frage {q.get("id")}: Lerneinheit {q.get("e")} unbekannt')
        seiten_ok(q.get('ref'), f'Frage {q.get("id")}')
    so = K.get('sortieren')
    if so:
        n = len(so.get('kategorien', []))
        if not 2 <= n <= 4: F(f'{w}: Sortieren braucht 2–4 Kategorien')
        for i in so.get('items', []):
            if not 0 <= i.get('k', -1) < n: F(f'{w}: Sortieren {i.get("id")}: Kategorie ungültig')
    for t in K.get('tabellen', []):
        for z in t.get('zeilen', []):
            if len(z[1]) != len(t.get('spalten', [])): F(f'{w}: Tabelle {t.get("id")}: Zeile „{z[0]}“ hat falsch viele Werte')
    rubs = {rubrik(s) for s in S.values()}
    fehlt = [n for r, n in (('band', 'Bänder'), ('sehne', 'Sehnen'), ('gelenk', 'Gelenke')) if r not in rubs]
    if fehlt: H(f'{w}: keine Begriffe zu {", ".join(fehlt)} (Pflichtrubrik)')
    # Tafeln
    tafeln = lade(d / 'tafeln.json') if (d / 'tafeln.json').is_file() else []
    nw = lade(d / 'bildnachweise.json') if (d / 'bildnachweise.json').is_file() else {}
    for t in tafeln or []:
        tw = f'{w}: Tafel {t.get("id")}'
        if not (d / 'bilder' / t.get('bild', '')).is_file(): F(f'{tw}: Bild fehlt ({t.get("bild")})')
        if t.get('nachweis') not in (nw or {}): F(f'{tw}: Bildnachweis „{t.get("nachweis")}“ fehlt')
        for pid, x, y in t.get('pins', []):
            if pid not in S: F(f'{tw}: Pin {pid} hat keine Struktur')
            if not (0 <= x <= t.get('w', 0) and 0 <= y <= t.get('h', 0)): F(f'{tw}: Pin {pid} liegt außerhalb des Bildes')
    zahlen.append(f'{kid}: {len(S)} Begriffe, {len(tafeln or [])} Tafeln, {len(K.get("karten", []))} Karten, {len(K.get("fragen", []))} Fragen')

v = re.search(r"const VERSION = '([^']+)'", (ROOT / 'sw.js').read_text(encoding='utf-8'))
print('## Vorklinik – Prüfung\n')
print(f'### ❌ {len(fehler)} Fehler' if fehler else '### ✅ Keine Fehler')
for x in fehler: print('- ' + x)
if hinweise:
    print(f'\n### ⚠️ {len(hinweise)} Hinweise')
    for x in hinweise: print('- ' + x)
print('\n### ℹ️ Werte\n- sw.js VERSION: ' + (v.group(1) if v else '?'))
for z in zahlen: print('- ' + z)
sys.exit(1 if fehler else 0)
