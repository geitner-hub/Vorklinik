# Vorklinik – Testat-Trainer

Lerntrainer für die Vorklinik (zunächst Anatomie): echte Tafeln beschriften, Begriffe, Karteikarten, Testatfragen,
Sortieren und Lückentabellen – mit Verweisen auf Seite und Abbildung im Prometheus LernAtlas.
Statische Website ohne Build-Schritt, gehostet über GitHub Pages: `https://geitner-hub.github.io/vorklinik/`.

## Aufbau
```
index.html, css/app.css, js/app.js     Oberfläche (Startseite = Kapitelübersicht, Kapitel mit Bereichen)
js/vendor/qrcode.js                    QR-Code (MIT, Kazuhiko Arase)
struktur.json                          Zuordnung: Themengebiete → Gruppen (Testate) → Kapitel-IDs
kapitel/<id>/kapitel.json              Begriffe, Lerneinheiten, Karten, Fragen, Sortieren, Tabellen
kapitel/<id>/tafeln.json               Tafeln: Bild, Masken über der Originalbeschriftung, Pins in Bildpixeln
kapitel/<id>/bildnachweise.json        Quelle, Autor, Lizenz je Bild
kapitel/<id>/bilder/                   Bilder (nur gemeinfrei, CC0, CC BY, CC BY-SA – nie Prometheus/Sobotta)
manifest.webmanifest, sw.js, icons/    „Zum Home-Bildschirm“ und offline
werkzeuge/pruefen.py                   Prüfung (läuft bei jedem Upload in GitHub Actions)
```

## Zuordnung ändern
Nur `struktur.json` bearbeiten: Kapitel-IDs zwischen Gruppen verschieben, Gruppen (z. B. Testate) umbenennen,
neu anlegen oder umsortieren, neue Themengebiete (z. B. Histologie) ergänzen. Die Kapitel selbst bleiben unverändert.

## Neues Kapitel
1. Ordner `kapitel/<id>/` mit `kapitel.json` anlegen (Muster: vorhandene Kapitel). Pflicht: `id`, `titel`, `seiten`,
   `bereiche` (Buchseiten, z. B. `[[250, 309]]` – für den Seitensprung), `einheiten`, `strukturen`.
   Optional `rubrik` je Struktur (`knochen`, `band`, `sehne`, `gelenk`, `weitere`) – sonst wird sie aus dem Namen erschlossen.
2. Die ID in `struktur.json` einer Gruppe hinzufügen.
3. `python3 werkzeuge/pruefen.py` – keine roten Fehler. Bänder, Sehnen und Gelenke sind Pflichtrubriken (gelber Hinweis).
4. In `sw.js` die `VERSION` erhöhen.

## Format (kurz)
- Struktur: `{ "lat", "de", "info", "ref": "S. 254 A", "rubrik"? }`
- Karte: `{ "id", "f", "a", "e": "1.3", "ref" }` · Frage: `{ "id", "f", "o": [4 Optionen], "r": Index, "x": Erklärung, "e", "ref" }`
- Sortieren: `{ "titel", "ref", "kategorien": [2–4], "items": [{ "id", "t", "k" }] }`
- Tabelle: `{ "id", "titel", "ref", "spalten": [...], "zeilen": [["Zeile", ["Wert", ...]]], "fuss" }`
- Tafel: `{ "id", "title", "view", "unit", "ref", "bild", "w", "h", "nachweis", "masken": [[x,y,b,h,"#farbe"?]], "pins": [["strukturId", x, y]] }`

## Lernstand und Datenschutz
Nur im Browser (`localStorage` „vorklinik“), kein Server, keine externen Dienste oder Schriften.
Sichern/Übertragen über ⋯ → Lernstand exportieren/importieren. Beim ersten Öffnen wird ein vorhandener Stand
des Anatomie-Trainers aus der Lernwelt (gleiche Domain) übernommen.

## Urheberrecht
Alle Texte sind eigene Formulierungen; Seitenzahlen verweisen auf den Prometheus, dessen Texte und Abbildungen
nicht enthalten sind. PDFs aus dem Buch gehören nie ins Repo.
