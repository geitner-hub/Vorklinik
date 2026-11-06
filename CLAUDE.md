# CLAUDE.md – Vorklinik

Statische Lern-Website (HTML/CSS/Vanilla-JS, kein Build, kein npm) für eine Person im Medizinstudium. Sprache: Deutsch
(Code, Kommentare, Texte). README.md ist die Referenz für Aufbau und Datenformat.

## Regeln
- Zuordnung nur über `struktur.json`; Kapitel-IDs, Struktur-IDs, Karten-/Fragen-IDs nie umbenennen (Lernstand hängt daran).
- Inhalte immer in eigenen Worten, jede Angabe mit Buchseite und Abbildungsbuchstabe (`"ref": "S. 254 A"`). Keine Buchtexte,
  keine Buchabbildungen; PDFs nie committen. Bilder nur gemeinfrei/CC0/CC BY/CC BY-SA mit Eintrag in `bildnachweise.json`.
- Pflichtrubriken je Kapitel: Bänder, Sehnen, Gelenke.
- Pins einzeln am gerenderten Bild prüfen, Originalbeschriftung mit Masken in Bildfarbe abdecken.
- Nach Änderungen an ausgelieferten Dateien `VERSION` in `sw.js` erhöhen.
- Keine externen Dienste, CDNs oder Fonts; Lernstand nur lokal (`localStorage` „vorklinik“).
- Design „Klinik-Petrol“ (Tokens in `css/app.css`), hell Standard, dunkel automatisch; Rot/Blau/Gelb/Beige bleiben für
  anatomische Bedeutungen frei; richtig/falsch nie nur über Farbe (✓/✗). Tippflächen ≥ 44 px, kein seitliches Scrollen.

## Befehle
```bash
python3 werkzeuge/pruefen.py     # Prüfung (auch in CI)
python3 -m http.server 8000      # lokal ansehen
```
