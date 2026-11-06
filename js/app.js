/* ═══════════════════════════════════════════════════════
   Vorklinik – js/app.js
   Ohne Build-Schritt und ohne Abhängigkeiten (außer js/vendor/qrcode.js, MIT).
   Daten:  struktur.json                 Themengebiete → Gruppen (Testate) → Kapitel-IDs (Zuordnung frei änderbar)
           kapitel/<id>/kapitel.json     Begriffe, Einheiten, Karten, Fragen, Sortieren, Tabellen
           kapitel/<id>/tafeln.json      Tafeln (Bild, Masken, Pins in Bildpixeln)
           kapitel/<id>/bildnachweise.json
   Adressen: #/                          Kapitelübersicht
             #/k/<id>/<bereich>          bereich: uebersicht, tafeln, begriffe, karten, fragen, sortieren, tabellen, bilder
             #/k/<id>/uebersicht?seite=N  springt zur Lerneinheit mit Buchseite N
   Speicher: localStorage „vorklinik“ (nur dieses Gerät; Export/Import über das Menü)
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sicher = u => /^https:\/\/(commons|upload)\.wikimedia\.org\//.test(String(u || '')) || /^https:\/\/creativecommons\.org\//.test(String(u || ''));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const refHtml = r => `<span class="ref">Prometheus <b>${esc(r)}</b></span>`;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const app = $('#app');

  /* ---------- Speicher ---------- */
  const SPEICHER_KEY = 'vorklinik';
  let alles = { version: 1, kap: {}, thema: 'auto' };
  try {
    const raw = localStorage.getItem(SPEICHER_KEY);
    if (raw) alles = Object.assign(alles, JSON.parse(raw));
    else {
      // Einmalige Übernahme aus dem Anatomie-Trainer der Lernwelt (gleiche Domain)
      const alt = localStorage.getItem('lernwelt-anatomie');
      if (alt) { const a = JSON.parse(alt); if (a && a.kap) { alles.kap = a.kap; alles.uebernommen = new Date().toISOString().slice(0, 10); } }
    }
  } catch (e) { /* ohne Speicher weiter */ }
  if (!alles.kap || typeof alles.kap !== 'object') alles.kap = {};
  const save = () => { try { localStorage.setItem(SPEICHER_KEY, JSON.stringify(alles)); } catch (e) { } };
  const stand = id => (alles.kap[id] = Object.assign({ str: {}, box: {}, quiz: {}, sort: {}, ui: {} }, alles.kap[id] || {}));

  /* ---------- Darstellung ---------- */
  const setzeThema = t => {
    if (t === 'hell') document.documentElement.dataset.thema = 'hell';
    else if (t === 'dunkel') document.documentElement.dataset.thema = 'dunkel';
    else delete document.documentElement.dataset.thema;
  };
  setzeThema(alles.thema);
  // Sichtbarer Schalter in der Kopfleiste: wechselt zwischen hell und dunkel (ausgehend von der aktuellen Darstellung)
  const istDunkel = () => alles.thema === 'dunkel' || (alles.thema !== 'hell' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const zeigeThemaKnopf = () => {
    const d = istDunkel(), k = $('#themaKnopf');
    k.textContent = d ? '☀' : '☾';
    k.setAttribute('aria-label', d ? 'Helle Darstellung' : 'Dunkle Darstellung');
    k.title = d ? 'Hell' : 'Dunkel';
  };
  $('#themaKnopf').onclick = () => { alles.thema = istDunkel() ? 'hell' : 'dunkel'; save(); setzeThema(alles.thema); zeigeThemaKnopf(); };
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', zeigeThemaKnopf);
  zeigeThemaKnopf();

  /* ---------- Daten laden ---------- */
  let STRUKTUR = null;
  const CACHE = {};
  const holeJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ': ' + r.status); return r.json(); };
  async function ladeStruktur() { if (!STRUKTUR) STRUKTUR = await holeJson('struktur.json'); return STRUKTUR; }
  async function ladeKapitel(id) {
    if (CACHE[id]) return CACHE[id];
    const basis = 'kapitel/' + encodeURIComponent(id) + '/';
    const [meta, tafeln, nachweise] = await Promise.all([
      holeJson(basis + 'kapitel.json'),
      holeJson(basis + 'tafeln.json').catch(() => []),
      holeJson(basis + 'bildnachweise.json').catch(() => ({}))
    ]);
    ['karten', 'fragen', 'tabellen', 'einheiten'].forEach(f => { if (!Array.isArray(meta[f])) meta[f] = []; });
    if (!meta.sortieren || !Array.isArray(meta.sortieren.items) || !meta.sortieren.items.length) meta.sortieren = null;
    meta.tafeln = (tafeln || []).map(t => Object.assign({}, t, { bild: basis + 'bilder/' + t.bild }));
    Object.values(nachweise).forEach(n => { n.bild = basis + 'bilder/' + n.bild; });
    meta.nachweise = nachweise;
    meta.basis = basis;
    return (CACHE[id] = meta);
  }
  const alleKapitelIds = () => STRUKTUR.themengebiete.flatMap(t => t.gruppen.flatMap(g => g.kapitel));
  const gruppeVon = id => { for (const t of STRUKTUR.themengebiete) for (const g of t.gruppen) if (g.kapitel.includes(id)) return { thema: t, gruppe: g }; return null; };

  /* Fortschritt eines Kapitels (0–1) aus Tafeln, Karten, Fragen, Sortieren */
  function fortschritt(K) {
    const s = stand(K.id); let a = 0, b = 0;
    const ids = new Set(); K.tafeln.forEach(t => t.pins.forEach(p => ids.add(p[0])));
    ids.forEach(id => { b++; if (s.str[id] && s.str[id].last) a++; });
    K.karten.forEach(k => { b++; if ((s.box[k.id] || 0) >= 3) a++; });
    K.fragen.forEach(f => { b++; if (s.quiz[f.id] === 1) a++; });
    if (K.sortieren) K.sortieren.items.forEach(i => { b++; if (s.sort[i.id] === 1) a++; });
    return b ? a / b : 0;
  }
  const ring = (anteil, gross = 64) => {
    const r = 26, u = 2 * Math.PI * r, p = Math.round(anteil * 100);
    return `<svg class="ring" viewBox="0 0 64 64" width="${gross}" height="${gross}" role="img" aria-label="${p} Prozent geschafft"><circle class="bahn" cx="32" cy="32" r="${r}"/><circle class="wert" cx="32" cy="32" r="${r}" stroke-dasharray="${(u * anteil).toFixed(1)} ${u.toFixed(1)}"/><text x="32" y="32">${p}%</text></svg>`;
  };

  /* Buchseite → Kapitel und Lerneinheit */
  function findeSeite(n, kapitelListe) {
    for (const K of kapitelListe) {
      if (!(K.bereiche || []).some(([a, b]) => n >= a && n <= b)) continue;
      const einh = K.einheiten.filter(u => u.seite <= n).sort((x, y) => y.seite - x.seite)[0] || K.einheiten[0];
      return { K, einh };
    }
    return null;
  }

  /* Inhaltsverzeichnis: je Kapitel ein Aufklappmenü mit den Lerneinheiten und ihren Startseiten */
  function inhaltsverzeichnis(ks, offenId) {
    return `<div class="toc">${STRUKTUR.themengebiete.map(t => t.gruppen.map(g => g.kapitel.map(id => {
      const K = ks.find(k => k && k.id === id); if (!K) return '';
      return `<details class="toc-kap"${id === offenId ? ' open' : ''}><summary><span class="seiten">${esc(K.seiten)}</span><span>${esc(K.titel)}</span><span class="toc-pfeil" aria-hidden="true">▾</span></summary>
        <ul>${K.einheiten.map(u => `<li><a href="#/k/${esc(id)}/uebersicht?seite=${u.seite}"><span class="pg">S. ${u.seite}</span><span class="nr">${esc(u.nr)}</span><span>${esc(u.titel)}</span></a></li>`).join('')}</ul></details>`;
    }).join('')).join('')).join('')}</div>`;
  }

  /* ---------- Blatt (Dialog von unten) ---------- */
  let blattZurueck = null;
  function oeffneBlatt(titel, html, beiOeffnen) {
    blattZurueck = document.activeElement;
    $('#blattTitel').textContent = titel;
    $('#blattInhalt').innerHTML = html;
    $('#blatt').hidden = false; $('#blattHinter').hidden = false;
    document.body.style.overflow = 'hidden';
    if (beiOeffnen) beiOeffnen($('#blattInhalt'));
    $('#blattZu').focus();
  }
  function schliesseBlatt() {
    $('#blatt').hidden = true; $('#blattHinter').hidden = true; document.body.style.overflow = '';
    if (blattZurueck && blattZurueck.focus) blattZurueck.focus();
  }
  $('#blattZu').onclick = schliesseBlatt;
  $('#blattHinter').onclick = schliesseBlatt;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#blatt').hidden) schliesseBlatt(); });

  async function kapitelWaehlen(aktuell) {
    const ks = await Promise.all(alleKapitelIds().map(id => ladeKapitel(id).catch(() => null)));
    const html = STRUKTUR.themengebiete.map(t => t.gruppen.map(g => `<h3>${esc(t.titel)} · ${esc(g.titel)}</h3><ul class="blatt-liste">${g.kapitel.map(id => {
      const K = ks.find(k => k && k.id === id); if (!K) return '';
      return `<li><a href="#/k/${esc(id)}/uebersicht" aria-current="${id === aktuell}"><span class="seiten">${esc(K.seiten)}</span><span>${esc(K.titel)}</span><span class="pz">${Math.round(fortschritt(K) * 100)}%</span></a></li>`;
    }).join('')}</ul>`).join('')).join('');
    oeffneBlatt('Kapitel wechseln', `${html}<h3>Nach Buchseiten</h3>${inhaltsverzeichnis(ks, aktuell)}`, inh => {
      $$('a', inh).forEach(a => a.addEventListener('click', schliesseBlatt));
    });
  }
  $('#kapitelKnopf').onclick = () => kapitelWaehlen(aktuellesKapitel);

  /* ---------- Menü: Teilen, Lernstand, Darstellung, Installieren ---------- */
  let installEreignis = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEreignis = e; });
  const istIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const istInstalliert = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  $('#menuKnopf').onclick = () => {
    const th = alles.thema || 'auto';
    oeffneBlatt('Menü', `
      <ul class="blatt-liste">
        <li><button class="menue-knopf" data-a="qr" type="button"><span aria-hidden="true">▦</span><span><b>Teilen</b> – QR-Code und Link zu dieser Seite</span></button></li>
        ${istInstalliert() ? '' : '<li><button class="menue-knopf" data-a="install" type="button"><span aria-hidden="true">＋</span><span><b>Zum Home-Bildschirm</b> – als App mit eigenem Symbol, auch offline</span></button></li>'}
        <li><button class="menue-knopf" data-a="export" type="button"><span aria-hidden="true">⇩</span><span><b>Lernstand exportieren</b> – als Datei sichern</span></button></li>
        <li><button class="menue-knopf" data-a="import" type="button"><span aria-hidden="true">⇧</span><span><b>Lernstand importieren</b> – Datei von einem anderen Gerät laden</span></button></li>
      </ul>
      <h3>Darstellung</h3>
      <div class="seg" id="themaWahl" role="group" aria-label="Darstellung">${[['auto', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(([k, t]) => `<button type="button" data-t="${k}" aria-pressed="${th === k}">${t}</button>`).join('')}</div>
      <input type="file" id="importDatei" accept="application/json,.json" hidden>
      <div id="menuMeldung" class="hinweis" style="margin-top:12px"></div>`, inh => {
      $$('#themaWahl button', inh).forEach(b => b.onclick = () => { alles.thema = b.dataset.t; save(); setzeThema(alles.thema); zeigeThemaKnopf(); $$('#themaWahl button', inh).forEach(x => x.setAttribute('aria-pressed', x === b)); });
      $('[data-a="qr"]', inh).onclick = zeigeQR;
      const ib = $('[data-a="install"]', inh); if (ib) ib.onclick = installieren;
      $('[data-a="export"]', inh).onclick = () => {
        const blob = new Blob([JSON.stringify({ app: 'vorklinik', exportiert: new Date().toISOString(), daten: alles }, null, 1)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `vorklinik-lernstand-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        $('#menuMeldung', inh).textContent = 'Datei gespeichert. Auf dem anderen Gerät über „Lernstand importieren“ laden.';
      };
      $('[data-a="import"]', inh).onclick = () => $('#importDatei', inh).click();
      $('#importDatei', inh).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const j = JSON.parse(await f.text());
          const d = j && j.app === 'vorklinik' ? j.daten : null;
          if (!d || typeof d.kap !== 'object') throw new Error('keine Vorklinik-Datei');
          if (!confirm('Lernstand aus der Datei übernehmen? Der Stand auf diesem Gerät wird ersetzt.')) return;
          alles = Object.assign({ version: 1, kap: {}, thema: 'auto' }, d); save(); setzeThema(alles.thema); zeigeThemaKnopf();
          schliesseBlatt(); route();
        } catch (err) { $('#menuMeldung', inh).textContent = 'Import nicht möglich: ' + err.message; }
      };
    });
  };
  function zeigeQR() {
    const url = location.href;
    let bild = '';
    try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); bild = `<img alt="QR-Code zu dieser Seite" src="${q.createDataURL(6, 2)}">`; } catch (e) { bild = '<p class="hinweis">QR-Code nicht verfügbar.</p>'; }
    oeffneBlatt('Teilen', `<div class="qr-feld">${bild}<code>${esc(url)}</code><div class="zeile"><button class="knopf haupt" id="linkKopie" type="button">Link kopieren</button>${navigator.share ? '<button class="knopf" id="linkTeilen" type="button">Teilen …</button>' : ''}</div><div class="hinweis" id="qrMeldung"></div></div>`, inh => {
      $('#linkKopie', inh).onclick = async () => { try { await navigator.clipboard.writeText(url); $('#qrMeldung', inh).textContent = 'Link kopiert.'; } catch (e) { $('#qrMeldung', inh).textContent = 'Kopieren nicht möglich – Link oben markieren.'; } };
      const t = $('#linkTeilen', inh); if (t) t.onclick = () => navigator.share({ title: document.title, url }).catch(() => {});
    });
  }
  function installieren() {
    if (installEreignis) { installEreignis.prompt(); installEreignis.userChoice.finally(() => { installEreignis = null; schliesseBlatt(); }); return; }
    const ios = istIOS();
    oeffneBlatt('Zum Home-Bildschirm', ios
      ? `<ol style="padding-left:20px;font-size:17px;line-height:1.7"><li>Unten (iPhone) bzw. oben (iPad) in Safari auf <b>Teilen</b> <span aria-hidden="true">⎙</span> tippen.</li><li><b>„Zum Home-Bildschirm“</b> wählen.</li><li>Mit <b>„Hinzufügen“</b> bestätigen.</li></ol><p class="hinweis">Funktioniert in Safari. Danach startet Vorklinik wie eine App, auch offline.</p>`
      : `<ol style="padding-left:20px;font-size:17px;line-height:1.7"><li>Im Browsermenü <b>⋮</b> auf <b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b> tippen.</li><li>Bestätigen.</li></ol><p class="hinweis">Danach startet Vorklinik wie eine App, auch offline.</p>`);
  }

  /* ---------- Router ---------- */
  const BEREICHE = [
    ['uebersicht', 'Übersicht', '◎'], ['tafeln', 'Tafeln', '◧'], ['karten', 'Karten', '▤'], ['fragen', 'Fragen', '?'],
    ['begriffe', 'Begriffe', 'Aa'], ['sortieren', 'Sortieren', '⇄'], ['tabellen', 'Tabellen', '▦'], ['bilder', 'Bildnachweise', '©']
  ];
  const UNTEN = ['uebersicht', 'tafeln', 'karten', 'fragen'];
  let aktuellesKapitel = null;
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  async function route() {
    zoomAus();
    const h = location.hash.replace(/^#\/?/, '');
    const [pfad, query] = h.split('?');
    const teile = pfad.split('/').filter(Boolean);
    const q = new URLSearchParams(query || '');
    try {
      await ladeStruktur();
      if (teile[0] === 'k' && teile[1]) {
        const id = decodeURIComponent(teile[1]);
        if (!alleKapitelIds().includes(id)) { location.hash = '#/'; return; }
        const K = await ladeKapitel(id);
        zeigeKapitel(K, teile[2] || 'uebersicht', q);
      } else zeigeStart();
    } catch (e) {
      app.innerHTML = `<div class="karte"><h2>Laden nicht möglich</h2><p>${esc(e.message)}</p><p class="hinweis">Ohne Internet funktionieren nur Kapitel, die schon einmal geöffnet waren.</p></div>`;
    }
    app.focus({ preventScroll: true });
  }

  /* ---------- Startseite ---------- */
  async function zeigeStart() {
    aktuellesKapitel = null;
    document.title = 'Vorklinik – Testat-Trainer';
    $('#kopfKapitel').hidden = true; $('#reiter').hidden = true; $('#unten').hidden = true;
    const ks = await Promise.all(alleKapitelIds().map(id => ladeKapitel(id).catch(() => null)));
    const finde = id => ks.find(k => k && k.id === id);
    const zuletzt = alles.zuletzt && finde(alles.zuletzt);
    app.innerHTML = `
      <section class="start-kopf">
        <div><h1>Kapitel wählen</h1><p class="leise" style="margin:0">Nach Testat und Buchkapitel geordnet. Seitenzahlen beziehen sich auf den Prometheus.</p></div>
        <div><button class="knopf haupt" id="tocKnopf" type="button" aria-expanded="false" aria-controls="tocStart">📖 Nach Buchseiten <span aria-hidden="true">▾</span></button></div>
      </section>
      <div id="tocStart" class="karte toc-start" hidden><p class="hinweis" style="margin-top:0">Kapitel aufklappen und die Lerneinheit wählen, die du gerade im Buch aufgeschlagen hast.</p>${inhaltsverzeichnis(ks)}</div>
      ${zuletzt ? `<a class="knopf" style="margin-bottom:8px" href="#/k/${esc(zuletzt.id)}/${esc(alles.zuletztBereich || 'uebersicht')}">▶ Weiter mit: ${esc(zuletzt.titel)} <span class="ref"><b>${esc(zuletzt.seiten)}</b></span></a>` : ''}
      ${alles.uebernommen ? '<p class="hinweis">Dein Lernstand aus der Lernwelt wurde übernommen.</p>' : ''}
      ${STRUKTUR.themengebiete.map(t => t.gruppen.map(g => `
        <section class="gruppe">
          <div class="gruppe-kopf"><span class="fach-marke">${esc(t.titel)}</span><h2>${esc(g.titel)}</h2>${g.untertitel ? `<span class="leise">${esc(g.untertitel)}</span>` : ''}</div>
          <div class="kacheln">${g.kapitel.map(id => {
            const K = finde(id);
            if (!K) return `<div class="kachel"><div><div class="seiten">?</div><h3>${esc(id)}</h3><div class="mini">nicht gefunden</div></div></div>`;
            return `<a class="kachel" href="#/k/${esc(id)}/uebersicht"><div><div class="seiten">${esc(K.seiten)}</div><h3>${esc(K.titel)}</h3>
              <div class="mini">${Object.keys(K.strukturen).length} Begriffe · ${K.tafeln.length ? K.tafeln.length + ' Tafeln · ' : ''}${K.karten.length} Karten · ${K.fragen.length} Fragen</div></div>${ring(fortschritt(K))}</a>`;
          }).join('')}</div>
        </section>`).join('')).join('')}`;
    $('#tocKnopf').onclick = () => {
      const box = $('#tocStart'), auf = box.hidden;
      box.hidden = !auf; $('#tocKnopf').setAttribute('aria-expanded', String(auf));
      if (auf) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  }

  /* ---------- Kapitel ---------- */
  let K = null, store = null;
  function zeigeKapitel(Kap, bereich, q) {
    K = Kap; store = stand(K.id); aktuellesKapitel = K.id;
    const vorhanden = { tafeln: true, sortieren: !!K.sortieren, tabellen: K.tabellen.length > 0, bilder: K.tafeln.length > 0 };
    if (!BEREICHE.some(b => b[0] === bereich) || vorhanden[bereich] === false) bereich = 'uebersicht';
    alles.zuletzt = K.id; alles.zuletztBereich = bereich; save();
    document.title = `${K.titel} – Vorklinik`;
    $('#kopfKapitel').hidden = false;
    $('#kkTitel').textContent = K.titel; $('#kkSeiten').textContent = K.seiten;
    $('#kapitelKnopf').setAttribute('aria-label', `Kapitel: ${K.titel}, ${K.seiten}. Kapitel wechseln`);
    const sichtbar = BEREICHE.filter(b => vorhanden[b[0]] !== false);
    const reiter = $('#reiter'); reiter.hidden = false;
    reiter.innerHTML = sichtbar.map(([k, t]) => `<a href="#/k/${esc(K.id)}/${k}" aria-current="${k === bereich ? 'page' : 'false'}">${t}</a>`).join('');
    const unten = $('#unten'); unten.hidden = false;
    const mehrAktiv = !UNTEN.includes(bereich);
    unten.innerHTML = UNTEN.map(k => { const b = BEREICHE.find(x => x[0] === k); return `<a href="#/k/${esc(K.id)}/${k}" aria-current="${k === bereich ? 'page' : 'false'}"><span class="sym" aria-hidden="true">${b[2]}</span>${b[1]}</a>`; }).join('')
      + `<button type="button" id="mehrKnopf" aria-current="${mehrAktiv ? 'page' : 'false'}"><span class="sym" aria-hidden="true">⋯</span>Mehr</button>`;
    $('#mehrKnopf').onclick = () => oeffneBlatt('Mehr in diesem Kapitel', `<ul class="blatt-liste">${sichtbar.filter(b => !UNTEN.includes(b[0])).map(([k, t, s]) => `<li><a class="menue-knopf" href="#/k/${esc(K.id)}/${k}"><span aria-hidden="true">${s}</span><span><b>${t}</b></span></a></li>`).join('')}</ul>`, inh => $$('a', inh).forEach(a => a.addEventListener('click', schliesseBlatt)));
    app.innerHTML = '';
    ({ uebersicht: vUebersicht, tafeln: vTafeln, begriffe: vBegriffe, karten: vKarten, fragen: vFragen, sortieren: vSortieren, tabellen: vTabellen, bilder: vBilder })[bereich](q);
  }

  const markStr = (id, ok) => { const s = store.str[id] || { r: 0, f: 0 }; ok ? s.r++ : s.f++; s.last = ok ? 1 : 0; store.str[id] = s; save(); };
  const strState = id => { const s = store.str[id]; if (!s) return ''; return s.last ? 'ok' : 'bad'; };
  const kurz = id => K.strukturen[id].lat.replace(/\s*\(.*\)$/, '');

  /* Rubrik eines Begriffs: ausdrücklich (rubrik) oder aus dem Namen erschlossen */
  const RUBRIKEN = [['knochen', 'Knochen'], ['band', 'Bänder'], ['sehne', 'Sehnen'], ['gelenk', 'Gelenke'], ['weitere', 'Weitere']];
  function rubrikVon(s) {
    if (s.rubrik) return s.rubrik;
    const l = s.lat;
    if (/^(Lig(g)?\.|Ligamentum|Ligamenta|Membrana|Retinaculum)/i.test(l)) return 'band';
    if (/^(Tendo|Tendines|Aponeurosis|Vagina tendinis)/i.test(l)) return 'sehne';
    if (/^(Art(t)?\.|Articulatio|Articulationes|Symphysis|Syndesmosis|Synchondrosis|Discus|Meniscus|Labrum|Capsula|Cavitas articularis|Bursa)/i.test(l)) return 'gelenk';
    if (/^(Os |Ossa |Processus|Proc\.|Corpus|Caput|Collum|Tuberculum|Tuberositas|Spina|Crista|Fossa|Foramen|Fovea|Facies|Incisura|Condylus|Epicondylus|Trochanter|Malleolus|Arcus|Lamina|Pediculus|Atlas|Axis|Dens|Sternum|Costa|Clavicula|Scapula|Humerus|Radius|Ulna|Femur|Tibia|Fibula|Patella|Calcaneus|Talus)/i.test(l)) return 'knochen';
    return 'weitere';
  }

  /* --- Übersicht --- */
  function vUebersicht(q) {
    const ziel = q && +q.get('seite');
    const zielEinheit = ziel ? (K.einheiten.filter(u => u.seite <= ziel).sort((a, b) => b.seite - a.seite)[0] || null) : null;
    const g = gruppeVon(K.id);
    const strIds = new Set(); K.tafeln.forEach(t => t.pins.forEach(p => strIds.add(p[0])));
    const zeilen = [
      ['Strukturen auf Tafeln sicher', [...strIds].filter(id => strState(id) === 'ok').length, strIds.size],
      ['Karten ab Fach 3', K.karten.filter(k => (store.box[k.id] || 0) >= 3).length, K.karten.length],
      ['Testatfragen richtig', K.fragen.filter(f => store.quiz[f.id] === 1).length, K.fragen.length],
      ['Merkmale sortiert', K.sortieren ? K.sortieren.items.filter(i => store.sort[i.id] === 1).length : 0, K.sortieren ? K.sortieren.items.length : 0]
    ].filter(z => z[2] > 0);
    const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
    const modus = (k, sym, titel, text) => `<a class="modus" href="#/k/${esc(K.id)}/${k}"><span class="sym" aria-hidden="true">${sym}</span><h3>${titel}</h3><p>${text}</p></a>`;
    app.innerHTML = `
      <div class="kap-kopf"><div class="pfad">${g ? esc(g.thema.titel + ' › ' + g.gruppe.titel) : ''}</div><h1>${esc(K.titel)} <span class="ref"><b>${esc(K.seiten)}</b></span></h1></div>
      ${zielEinheit ? `<div class="karte" style="border-color:var(--ocker);margin-bottom:14px"><b>S. ${ziel}</b> gehört zu Lerneinheit <b>${esc(zielEinheit.nr)} ${esc(zielEinheit.titel)}</b> (ab S. ${zielEinheit.seite}).
        <div class="zeile" style="margin-top:10px"><a class="knopf haupt klein" href="#/k/${esc(K.id)}/karten?einheit=${esc(zielEinheit.nr)}">Karten dazu</a><a class="knopf klein" href="#/k/${esc(K.id)}/fragen?einheit=${esc(zielEinheit.nr)}">Fragen dazu</a></div></div>` : ''}
      <section class="uebersicht">
        <div><p style="margin-top:0">${esc(K.intro || '')}</p>
          <div class="modi">
            ${modus('tafeln', '◧', 'Tafeln', K.tafeln.length ? K.tafeln.length + ' echte Abbildungen: erkunden, zuordnen, finden, benennen.' : 'Folgen noch für dieses Kapitel.')}
            ${modus('begriffe', 'Aa', 'Begriffe', Object.keys(K.strukturen).length + ' Begriffe, nach Knochen, Bändern, Sehnen und Gelenken filterbar.')}
            ${modus('karten', '▤', 'Karteikarten', K.karten.length + ' Karten in fünf Fächern.')}
            ${modus('fragen', '?', 'Testatfragen', K.fragen.length + ' Fragen mit Erklärung.')}
            ${K.sortieren ? modus('sortieren', '⇄', 'Sortieren', esc(K.sortieren.titel)) : ''}
            ${K.tabellen.length ? modus('tabellen', '▦', 'Lückentabellen', K.tabellen.map(t => esc(t.titel)).join(' · ')) : ''}
          </div></div>
        <div class="karte"><h2>Dein Stand</h2>${zeilen.map(([t, a, b]) => `<div style="margin:10px 0"><div class="zeile" style="justify-content:space-between"><span>${t}</span><span class="ref">${a} / ${b}</span></div><div class="balken"><i style="width:${pct(a, b)}%"></i></div></div>`).join('')}</div>
      </section>
      <h2 style="margin-top:8px">Lerneinheiten im Buch</h2>
      <ul class="einheiten">${K.einheiten.map(u => `<li class="${zielEinheit && u.nr === zielEinheit.nr ? 'ziel' : ''}" id="einheit-${esc(u.nr)}"><span class="nr">${esc(u.nr)}</span><span>${esc(u.titel)}</span><span class="pg">S. ${u.seite}</span>
        <span class="aktion"><a class="knopf klein" href="#/k/${esc(K.id)}/karten?einheit=${esc(u.nr)}">Karten</a><a class="knopf klein" href="#/k/${esc(K.id)}/fragen?einheit=${esc(u.nr)}">Fragen</a></span></li>`).join('')}</ul>`;
    if (zielEinheit) { const z = document.getElementById('einheit-' + zielEinheit.nr); if (z) setTimeout(() => z.scrollIntoView({ block: 'center' }), 50); }
  }

  /* --- Tafeln --- */
  let tState = null;
  function vTafeln() {
    if (!K.tafeln.length) {
      app.innerHTML = `<div class="karte" style="max-width:640px"><h2>Tafeln folgen</h2><p>Für „${esc(K.titel)}“ werden die Tafeln mit freien Abbildungen noch ergänzt. Bis dahin: <a href="#/k/${esc(K.id)}/begriffe">Begriffe</a>, <a href="#/k/${esc(K.id)}/karten">Karteikarten</a> und <a href="#/k/${esc(K.id)}/fragen">Testatfragen</a>.</p></div>`;
      return;
    }
    tState = { idx: Math.min(store.ui.tafel || 0, K.tafeln.length - 1), mode: store.ui.tmode || 'erkunden' };
    const lay = el('div', { class: 'tafel-layout' });
    lay.innerHTML = `<div>
        <div class="tafel-wahl"><select id="tpick" aria-label="Tafel wählen">${K.tafeln.map((t, i) => `<option value="${i}">${i + 1} · ${esc(t.title)} – ${esc(t.view)}</option>`).join('')}</select>
          <button class="knopf klein" id="tvor" type="button" aria-label="Vorige Tafel">‹</button><button class="knopf klein" id="tnach" type="button" aria-label="Nächste Tafel">›</button></div>
        <div class="seg" id="tmode" role="group" aria-label="Modus" style="margin-bottom:10px">${[['erkunden', 'Erkunden'], ['zuordnen', 'Zuordnen'], ['finden', 'Finden'], ['benennen', 'Benennen']].map(([k, t]) => `<button type="button" data-m="${k}">${t}</button>`).join('')}</div>
        <figure class="plate" id="plate"><div class="plate-kopf"><h2 id="ttitle"></h2><span class="ansicht" id="tview"></span></div>
        <div class="fig" id="fig"></div>
        <figcaption><div class="zeile" style="justify-content:space-between;margin-top:8px"><span id="tref"></span><span class="ref" id="tunit"></span></div>
        <div class="zeile" style="justify-content:space-between;margin-top:4px"><button class="quelle" id="tquelle" type="button" aria-expanded="false">Bildquelle</button><span class="hinweis">Zoom: ＋/−, Doppeltipp, zwei Finger</span></div>
        <div id="tquellbox" hidden></div></figcaption></figure></div>
      <aside class="seite" id="side"></aside>`;
    app.appendChild(lay);
    const wechsel = i => { tState.idx = (i + K.tafeln.length) % K.tafeln.length; store.ui.tafel = tState.idx; save(); renderTafel(); };
    $('#tpick').onchange = e => wechsel(+e.target.value);
    $('#tvor').onclick = () => wechsel(tState.idx - 1);
    $('#tnach').onclick = () => wechsel(tState.idx + 1);
    $$('#tmode button').forEach(b => b.onclick = () => { tState.mode = b.dataset.m; store.ui.tmode = tState.mode; save(); renderTafel(); });
    $('#tquelle').onclick = () => { const box = $('#tquellbox'); box.hidden = !box.hidden; $('#tquelle').setAttribute('aria-expanded', String(!box.hidden)); };
    renderTafel();
  }
  function nachweisHtml(key) {
    const n = K.nachweise[key];
    if (!n) return '<div class="quellbox">Kein Nachweis hinterlegt.</div>';
    const link = sicher(n.seite) ? `<a href="${esc(n.seite)}" target="_blank" rel="noopener">${esc(n.titel)}</a>` : esc(n.titel);
    const liz = sicher(n.lizenzUrl) ? `<a href="${esc(n.lizenzUrl)}" target="_blank" rel="noopener">${esc(n.lizenz)}</a>` : esc(n.lizenz);
    return `<div class="quellbox">${link}<br>${esc(n.autor)} · ${liz}${n.aenderung ? '<br><span class="leise">' + esc(n.aenderung) + '</span>' : ''}</div>`;
  }

  /* Zoom: viewBox verschieben/skalieren; Pins und Schilder behalten ihre Bildschirmgröße */
  let Z = null;
  const ZMAX = 6, PIN_PX = 12;
  function zoomAus() { if (Z && Z.ende) Z.ende(); Z = null; }
  function setView() {
    if (!Z) return;
    const { t, svg } = Z;
    const vw = t.w / Z.s, vh = t.h / Z.s;
    Z.x = Math.max(0, Math.min(t.w - vw, Z.x)); Z.y = Math.max(0, Math.min(t.h - vh, Z.y));
    svg.setAttribute('viewBox', `${Z.x} ${Z.y} ${vw} ${vh}`);
    const breite = svg.getBoundingClientRect().width || 600;
    const k = (vw / breite) * (PIN_PX / 10);
    svg.querySelectorAll('.pin, .tag').forEach(g => g.setAttribute('transform', `translate(${g.dataset.x} ${g.dataset.y}) scale(${k})`));
    Z.fig.classList.toggle('zoomed', Z.s > 1.01);
    const zi = Z.fig.querySelector('.zoomhint'); if (zi) zi.textContent = Z.s > 1.01 ? Math.round(Z.s * 10) / 10 + '×' : '';
    Z.fig.querySelector('[data-z="aus"]').disabled = Z.s <= 1.01;
    Z.fig.querySelector('[data-z="ein"]').disabled = Z.s >= ZMAX - .01;
  }
  function bildPunkt(cx, cy) {
    const r = Z.svg.getBoundingClientRect(), vw = Z.t.w / Z.s, vh = Z.t.h / Z.s;
    const m = Math.min(r.width / vw, r.height / vh), ox = (r.width - vw * m) / 2, oy = (r.height - vh * m) / 2;
    return [Z.x + (cx - r.left - ox) / m, Z.y + (cy - r.top - oy) / m, m];
  }
  function zoomUm(faktor, cx, cy) {
    const alt = Z.s, neu = Math.max(1, Math.min(ZMAX, alt * faktor));
    if (neu === alt) return;
    const r = Z.svg.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const [bx, by] = bildPunkt(cx, cy);
    const fx = (bx - Z.x) / (Z.t.w / alt), fy = (by - Z.y) / (Z.t.h / alt);
    Z.s = neu; Z.x = bx - fx * Z.t.w / neu; Z.y = by - fy * Z.t.h / neu;
    setView();
  }
  function zoomStart(t, svg, fig) {
    const behalten = Z && Z.t === t ? { x: Z.x, y: Z.y, s: Z.s } : { x: 0, y: 0, s: 1 };
    zoomAus();
    Z = Object.assign({ t, svg, fig }, behalten);
    const zb = el('div', { class: 'zoom' }, '<button type="button" data-z="ein" aria-label="Vergrößern">＋</button><button type="button" data-z="aus" aria-label="Verkleinern">−</button><button type="button" data-z="gross" aria-label="Vollbild">⛶</button>');
    fig.appendChild(zb); fig.appendChild(el('div', { class: 'zoomhint' }));
    zb.querySelector('[data-z="ein"]').onclick = () => zoomUm(1.6);
    zb.querySelector('[data-z="aus"]').onclick = () => zoomUm(1 / 1.6);
    zb.querySelector('[data-z="gross"]').onclick = () => {
      const p = $('#plate'), an = !p.classList.contains('gross');
      p.classList.toggle('gross', an); document.body.style.overflow = an ? 'hidden' : '';
      zb.querySelector('[data-z="gross"]').textContent = an ? '✕' : '⛶';
      zb.querySelector('[data-z="gross"]').setAttribute('aria-label', an ? 'Vollbild schließen' : 'Vollbild');
      requestAnimationFrame(setView);
    };
    let zug = null, verschoben = false, letzterTipp = 0;
    fig.addEventListener('click', e => { if (verschoben) { e.stopPropagation(); e.preventDefault(); verschoben = false; } }, true);
    fig.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || Z.s <= 1.01 || e.target.closest('.zoom')) return;
      zug = { x: e.clientX, y: e.clientY, zx: Z.x, zy: Z.y }; verschoben = false;
    });
    const mausZug = e => {
      if (!zug) return;
      const dx = e.clientX - zug.x, dy = e.clientY - zug.y;
      if (!verschoben && Math.hypot(dx, dy) < 6) return;
      verschoben = true;
      const m = bildPunkt(0, 0)[2]; Z.x = zug.zx - dx / m; Z.y = zug.zy - dy / m; setView();
    };
    const mausEnde = () => { zug = null; setTimeout(() => { verschoben = false; }, 0); };
    window.addEventListener('pointermove', mausZug); window.addEventListener('pointerup', mausEnde);
    let tz = null;
    const abst = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    fig.addEventListener('touchstart', e => {
      if (e.target.closest('.zoom')) return;
      if (e.touches.length === 2) { tz = { art: 2, d: abst(e.touches), s: Z.s }; verschoben = true; }
      else if (e.touches.length === 1) { const p = e.touches[0]; tz = { art: 1, x: p.clientX, y: p.clientY, zx: Z.x, zy: Z.y }; verschoben = false; }
    }, { passive: true });
    fig.addEventListener('touchmove', e => {
      if (!tz) return;
      if (tz.art === 2 && e.touches.length === 2) {
        e.preventDefault();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomUm((tz.s * abst(e.touches) / tz.d) / Z.s, mx, my);
      } else if (tz.art === 1 && Z.s > 1.01) {
        e.preventDefault();
        const p = e.touches[0], dx = p.clientX - tz.x, dy = p.clientY - tz.y;
        if (!verschoben && Math.hypot(dx, dy) < 8) return;
        verschoben = true;
        const m = bildPunkt(0, 0)[2]; Z.x = tz.zx - dx / m; Z.y = tz.zy - dy / m; setView();
      }
    }, { passive: false });
    fig.addEventListener('touchend', e => {
      if (tz && tz.art === 1 && !verschoben && e.changedTouches.length === 1 && !e.target.closest('.pin, .zoom')) {
        const jetzt = Date.now(), p = e.changedTouches[0];
        if (jetzt - letzterTipp < 320) { e.preventDefault(); if (Z.s >= ZMAX - .01) { Z.s = 1; setView(); } else zoomUm(2, p.clientX, p.clientY); letzterTipp = 0; }
        else letzterTipp = jetzt;
      }
      if (e.touches.length === 0) { tz = null; setTimeout(() => { verschoben = false; }, 350); }
    });
    fig.addEventListener('dblclick', e => { if (e.target.closest('.pin, .zoom')) return; if (Z.s >= ZMAX - .01) { Z.s = 1; setView(); } else zoomUm(2, e.clientX, e.clientY); });
    fig.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoomUm(Math.exp(-e.deltaY / 200), e.clientX, e.clientY); }, { passive: false });
    const neu = () => setView();
    window.addEventListener('resize', neu);
    Z.ende = () => { window.removeEventListener('pointermove', mausZug); window.removeEventListener('pointerup', mausEnde); window.removeEventListener('resize', neu); document.body.style.overflow = ''; };
    setView();
  }

  function drawFigure(t, opts = {}) {
    let pins = '';
    t.pins.forEach(([id, x, y], i) => {
      pins += `<g class="pin" data-id="${esc(id)}" data-i="${i}" data-x="${x}" data-y="${y}" tabindex="0" role="button" aria-label="Struktur ${i + 1}"><circle class="hit" r="17"/><circle class="dot" r="10"/><text style="font-size:11px">${opts.noNumbers ? '' : i + 1}</text></g>`;
    });
    const masken = (t.masken || []).map(([x, y, w, h, f]) => `<rect class="maske" x="${x}" y="${y}" width="${w}" height="${h}"${/^#[0-9a-f]{3,6}$/i.test(f || '') ? ` style="fill:${f}"` : ''}/>`).join('');
    const fig = $('#fig');
    fig.className = 'fig';
    fig.innerHTML = `<svg viewBox="0 0 ${t.w} ${t.h}" role="img" aria-label="${esc(t.title)}, ${esc(t.view)}" style="aspect-ratio:${t.w}/${t.h}">
      <image href="${esc(t.bild)}" x="0" y="0" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/>
      <g class="masken">${masken}</g><g class="tags"></g>${pins}</svg>`;
    const svg = $('svg', fig);
    zoomStart(t, svg, fig);
    return { svg };
  }
  function tagFor(svg, t, id, zeig) {
    const p = t.pins.find(p => p[0] === id); if (!p) return;
    const name = kurz(id);
    const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('class', 'tag' + (zeig ? ' zeig' : ''));
    g.dataset.x = p[1]; g.dataset.y = p[2];
    const tw = name.length * 6.6 + 12, links = p[1] > t.w * 0.62;
    const x = links ? -13 - tw : 13;
    g.innerHTML = `<rect x="${x}" y="-10" width="${tw}" height="20" rx="4"/><text x="${x + 6}" y="0">${esc(name)}</text>`;
    $('.tags', svg).appendChild(g);
    setView();
  }
  function renderTafel() {
    const t = K.tafeln[tState.idx];
    const p = $('#plate'); if (p.classList.contains('gross')) { p.classList.remove('gross'); document.body.style.overflow = ''; }
    $('#tpick').value = tState.idx;
    $$('#tmode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === tState.mode));
    $('#ttitle').textContent = `Tafel ${tState.idx + 1} · ${t.title}`;
    $('#tview').textContent = t.view;
    $('#tref').innerHTML = refHtml(t.ref);
    $('#tunit').textContent = 'Lerneinheit ' + t.unit;
    $('#tquellbox').innerHTML = nachweisHtml(t.nachweis);
    ({ erkunden: mErkunden, zuordnen: mZuordnen, finden: mFinden, benennen: mBenennen })[tState.mode](t);
  }
  function infoBox(id) {
    const s = K.strukturen[id];
    return `<div class="karte info"><span class="lat">${esc(s.lat)}</span><div class="de">${esc(s.de)}</div><p>${esc(s.info)}</p>${refHtml(s.ref)}</div>`;
  }
  const onPin = (svg, fn) => svg.querySelectorAll('.pin').forEach(p => {
    p.addEventListener('click', () => fn(p));
    p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(p); } });
  });

  function mErkunden(t) {
    const { svg } = drawFigure(t);
    const side = $('#side');
    side.innerHTML = `<div id="ibox"><div class="karte hinweis">Tippe auf eine Nummer oder einen Begriff in der Liste.</div></div>
      <div class="karte"><div class="zeile" style="justify-content:space-between;margin-bottom:8px"><strong>Strukturen</strong><button class="knopf klein" id="allTags" type="button">Beschriftung zeigen</button></div>
      <ul class="legende">${t.pins.map(([id], i) => `<li data-id="${esc(id)}"><span class="k">${i + 1}</span><span class="lat">${esc(K.strukturen[id].lat)}</span><span class="st ${strState(id)}"></span></li>`).join('')}</ul></div>`;
    let shown = false;
    const select = id => {
      svg.querySelectorAll('.pin').forEach(p => p.classList.toggle('sel', p.dataset.id === id));
      $$('.legende li', side).forEach(li => li.classList.toggle('an', li.dataset.id === id));
      $('#ibox').innerHTML = infoBox(id);
    };
    onPin(svg, p => select(p.dataset.id));
    $$('.legende li', side).forEach(li => li.onclick = () => select(li.dataset.id));
    $('#allTags').onclick = () => {
      shown = !shown; $('.tags', svg).innerHTML = '';
      if (shown) t.pins.forEach(([id]) => tagFor(svg, t, id, true));
      $('#allTags').textContent = shown ? 'Beschriftung ausblenden' : 'Beschriftung zeigen';
    };
  }
  function mZuordnen(t) {
    const { svg } = drawFigure(t);
    const side = $('#side');
    const ids = t.pins.map(p => p[0]);
    let errors = 0, done = 0, selChip = null;
    side.innerHTML = `<div class="karte">Ziehe jeden Begriff auf seine Nummer – oder tippe erst den Begriff, dann die Nummer.</div>
      <div class="karte"><div class="chips" id="chips">${shuffle(ids).map(id => `<button class="chip" type="button" data-id="${esc(id)}">${esc(kurz(id))}</button>`).join('')}</div></div>
      <div id="zfb"></div>`;
    const finish = () => {
      $('#zfb').innerHTML = `<div class="karte"><div class="punkte">${ids.length - Math.min(errors, ids.length)} / ${ids.length}</div><p>${errors === 0 ? 'Alles auf Anhieb richtig.' : errors + ' Fehlversuch' + (errors > 1 ? 'e' : '') + '.'}</p><button class="knopf haupt" id="again" type="button">Noch einmal</button></div>`;
      $('#again').onclick = renderTafel;
    };
    const tryDrop = (chipId, pin) => {
      if (!pin || pin.classList.contains('ok')) return;
      const chip = side.querySelector(`.chip[data-id="${chipId}"]`);
      if (pin.dataset.id === chipId) {
        pin.classList.add('ok'); chip.classList.add('weg'); tagFor(svg, t, chipId, false); done++;
        markStr(chipId, !chip.dataset.miss);
        if (done === ids.length) finish();
      } else {
        errors++; chip.dataset.miss = 1; chip.classList.add('wackel'); setTimeout(() => chip.classList.remove('wackel'), 400);
        pin.classList.add('bad'); setTimeout(() => pin.classList.remove('bad'), 500);
      }
      selChip = null; $$('.chip', side).forEach(c => c.classList.remove('sel'));
    };
    onPin(svg, p => { if (selChip) tryDrop(selChip, p); });
    $$('.chip', side).forEach(chip => {
      chip.addEventListener('click', () => {
        selChip = selChip === chip.dataset.id ? null : chip.dataset.id;
        $$('.chip', side).forEach(c => c.classList.toggle('sel', c.dataset.id === selChip));
      });
      chip.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY; let ghost = null;
        const move = ev => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add('ziehbild'); document.body.appendChild(ghost); }
          ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
          svg.querySelectorAll('.pin').forEach(p => p.classList.remove('sel'));
          const over = document.elementFromPoint(ev.clientX, ev.clientY); const pin = over && over.closest && over.closest('.pin');
          if (pin) pin.classList.add('sel');
        };
        const up = ev => {
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          if (!ghost) return;
          ghost.remove(); svg.querySelectorAll('.pin').forEach(p => p.classList.remove('sel'));
          const over = document.elementFromPoint(ev.clientX, ev.clientY);
          tryDrop(chip.dataset.id, over && over.closest && over.closest('.pin'));
          chip.addEventListener('click', ev2 => ev2.stopImmediatePropagation(), { once: true, capture: true });
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      });
    });
  }
  function mFinden(t) {
    const { svg } = drawFigure(t, { noNumbers: true });
    const side = $('#side');
    let queue = shuffle(t.pins.map(p => p[0])), cur = null, first = 0; const total = queue.length, missed = new Set(); let locked = false;
    const next = () => {
      locked = false;
      svg.querySelectorAll('.pin').forEach(p => p.classList.remove('bad', 'sel'));
      if (!queue.length) {
        side.innerHTML = `<div class="karte"><div class="punkte">${first} / ${total}</div><p>beim ersten Versuch gefunden.</p><button class="knopf haupt" id="again" type="button">Neue Runde</button></div>`;
        $('#again').onclick = renderTafel; return;
      }
      cur = queue.shift();
      side.innerHTML = `<div class="karte prompt">Tippe auf:<span class="lat">${esc(K.strukturen[cur].lat)}</span><span class="leise">${esc(K.strukturen[cur].de)}</span></div>
        <div id="ffb"></div><div class="ref">${total - queue.length} von ${total} · Fehler kommen am Ende noch einmal</div>`;
    };
    onPin(svg, p => {
      if (locked || p.classList.contains('ok')) return;
      if (p.dataset.id === cur) {
        locked = true; p.classList.add('ok');
        if (!missed.has(cur)) first++;
        markStr(cur, !missed.has(cur));
        $('#ffb').innerHTML = `<div class="rm ok">Richtig. ${esc(K.strukturen[cur].info)}</div>`;
        setTimeout(next, 1100);
      } else {
        p.classList.add('bad'); setTimeout(() => p.classList.remove('bad'), 600);
        if (!missed.has(cur)) { missed.add(cur); queue.push(cur); }
        const s = K.strukturen[p.dataset.id];
        $('#ffb').innerHTML = `<div class="rm bad">Das ist <span class="lat">${esc(s.lat)}</span>. Versuch es noch einmal.</div>`;
      }
    });
    next();
  }
  function mBenennen(t) {
    const { svg } = drawFigure(t, { noNumbers: true });
    const side = $('#side');
    const ids = t.pins.map(p => p[0]);
    let queue = shuffle(ids), first = 0; const total = queue.length, missed = new Set();
    const pool = Object.keys(K.strukturen);
    const next = () => {
      svg.querySelectorAll('.pin').forEach(p => { p.classList.remove('ask'); p.classList.toggle('dim', !p.classList.contains('ok')); });
      if (!queue.length) {
        side.innerHTML = `<div class="karte"><div class="punkte">${first} / ${total}</div><p>beim ersten Versuch richtig benannt.</p><button class="knopf haupt" id="again" type="button">Neue Runde</button></div>`;
        $('#again').onclick = renderTafel; return;
      }
      const cur = queue.shift();
      const pin = svg.querySelector(`.pin[data-id="${cur}"]`); pin.classList.remove('dim'); pin.classList.add('ask');
      const same = shuffle(ids.filter(i => i !== cur && K.strukturen[i].lat !== K.strukturen[cur].lat));
      const other = shuffle(pool.filter(i => !ids.includes(i)));
      const opts = shuffle([cur, ...same.slice(0, 2), ...(same.length > 2 ? same.slice(2, 3) : other.slice(0, 1))]);
      side.innerHTML = `<div class="karte">Wie heißt die markierte Struktur?</div>
        <div class="optionen">${opts.map(o => `<button class="opt" type="button" data-id="${esc(o)}">${esc(K.strukturen[o].lat)}</button>`).join('')}</div><div id="bfb"></div>
        <div class="ref">${total - queue.length} von ${total}</div>`;
      $$('.opt', side).forEach(b => b.onclick = () => {
        if (b.dataset.id === cur) {
          b.classList.add('ok'); pin.classList.remove('ask'); pin.classList.add('ok');
          if (!missed.has(cur)) first++;
          markStr(cur, !missed.has(cur));
          $$('.opt', side).forEach(x => x.disabled = true);
          $('#bfb').innerHTML = `<div class="rm ok" style="margin-top:8px"><strong>${esc(K.strukturen[cur].de)}.</strong> ${esc(K.strukturen[cur].info)}<br>${refHtml(K.strukturen[cur].ref)}</div><button class="knopf haupt" id="nx" type="button" style="margin-top:10px">Weiter</button>`;
          $('#nx').onclick = next; $('#nx').focus();
        } else {
          b.classList.add('bad'); b.disabled = true;
          if (!missed.has(cur)) { missed.add(cur); queue.push(cur); }
        }
      });
    };
    next();
  }

  /* --- Begriffe --- */
  function vBegriffe() {
    const alle = Object.entries(K.strukturen);
    let rub = store.ui.rubrik || '';
    app.innerHTML = `<div class="leiste"><input id="bsuche" type="search" placeholder="Suchen (lateinisch oder deutsch) …" aria-label="Begriffe durchsuchen" autocomplete="off" style="flex:1 1 260px">
      <span class="ref" id="bzahl"></span></div>
      <div class="seg" id="rubriken" role="group" aria-label="Rubrik" style="margin-bottom:14px"><button type="button" data-r="">Alle</button>${RUBRIKEN.map(([k, t]) => `<button type="button" data-r="${k}">${t}</button>`).join('')}</div>
      <ul class="begriffe" id="bliste"></ul>`;
    const zeig = () => {
      const q = $('#bsuche').value.trim().toLowerCase();
      $$('#rubriken button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === rub));
      const treffer = alle.filter(([, s]) => (!rub || rubrikVon(s) === rub) && (!q || (s.lat + ' ' + s.de + ' ' + s.info).toLowerCase().includes(q)));
      $('#bzahl').textContent = `${treffer.length} von ${alle.length}`;
      $('#bliste').innerHTML = treffer.map(([, s]) => { const r = RUBRIKEN.find(x => x[0] === rubrikVon(s)); return `<li><span class="lat">${esc(s.lat)}</span> <span class="de">${esc(s.de)}</span>${r && r[0] !== 'weitere' ? `<span class="rubrik">${r[1]}</span>` : ''}<p>${esc(s.info)}</p>${refHtml(s.ref)}</li>`; }).join('') || '<li class="leise">Keine Treffer.</li>';
    };
    $('#bsuche').oninput = zeig;
    $$('#rubriken button').forEach(b => b.onclick = () => { rub = b.dataset.r; store.ui.rubrik = rub; save(); zeig(); });
    zeig();
  }

  /* --- Karteikarten (5 Fächer) --- */
  function einheitWahl(id, cur) {
    return `<select id="${id}" aria-label="Lerneinheit" style="flex:1 1 240px"><option value="">Alle Lerneinheiten</option>${K.einheiten.map(u => `<option value="${esc(u.nr)}" ${u.nr === cur ? 'selected' : ''}>${esc(u.nr)} ${esc(u.titel)} (S. ${u.seite})</option>`).join('')}</select>`;
  }
  function vKarten(q) {
    if (q && q.get('einheit') !== null) { store.ui.kunit = q.get('einheit'); save(); }
    const unit = store.ui.kunit || '';
    const pool = K.karten.filter(k => !unit || k.e === unit);
    app.innerHTML = `<div class="leiste">${einheitWahl('kunit', unit)}<span class="hinweis">Fach 1 kommt am häufigsten dran.</span></div>
      <div class="karten-layout"><div id="cardArea"></div><aside class="karte"><strong>Fächer</strong><div class="faecher" id="boxes"></div><div class="faecher-n"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
      <p class="hinweis" style="margin:14px 0 0">„Gewusst“ schiebt die Karte ein Fach weiter, „Nicht gewusst“ zurück in Fach 1.</p></aside></div>`;
    $('#kunit').onchange = e => { store.ui.kunit = e.target.value; save(); location.hash = `#/k/${K.id}/karten`; vKartenNeu(); };
    const drawBoxes = () => {
      const c = [0, 0, 0, 0, 0]; pool.forEach(k => c[Math.min(4, store.box[k.id] || 0)]++);
      const max = Math.max(1, ...c);
      $('#boxes').innerHTML = c.map(n => `<div style="height:${8 + 82 * n / max}%"><span>${n}</span></div>`).join('');
    };
    let last = null;
    const pickCard = () => {
      const w = pool.map(k => k === last && pool.length > 1 ? 0 : [16, 8, 4, 2, 1][Math.min(4, store.box[k.id] || 0)]);
      let x = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
      return pool[0];
    };
    const show = () => {
      drawBoxes();
      if (!pool.length) { $('#cardArea').innerHTML = '<div class="karte">Keine Karten für diese Auswahl.</div>'; return; }
      const k = pickCard(); last = k;
      $('#cardArea').innerHTML = `<div class="lernkarte" id="card" tabindex="0" role="button" aria-label="Karte umdrehen"><div class="ref">Lerneinheit ${esc(k.e)} · Fach ${Math.min(4, store.box[k.id] || 0) + 1}</div><div class="q">${esc(k.f)}</div><div class="a" hidden id="ans">${esc(k.a)}</div>
        <div class="meta"><span class="hinweis" id="flipHint">Antippen zum Umdrehen</span>${refHtml(k.ref)}</div></div>
        <div class="bewerten" id="rate" hidden><button class="knopf nein" type="button" data-v="0">Nicht gewusst</button><button class="knopf" type="button" data-v="1">Unsicher</button><button class="knopf ja" type="button" data-v="2">Gewusst</button></div>`;
      const flip = () => { $('#ans').hidden = false; $('#rate').hidden = false; $('#flipHint').hidden = true; };
      $('#card').onclick = flip; $('#card').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
      $$('#rate button').forEach(b => b.onclick = () => {
        const v = +b.dataset.v, cur = store.box[k.id] || 0;
        store.box[k.id] = v === 0 ? 0 : v === 2 ? Math.min(4, cur + 1) : cur; save(); show();
      });
    };
    show();
  }
  function vKartenNeu() { app.innerHTML = ''; vKarten(); }

  /* --- Testatfragen --- */
  function vFragen(q) {
    if (q && q.get('einheit') !== null) { store.ui.funit = q.get('einheit'); save(); }
    const unit = store.ui.funit || '';
    app.innerHTML = `<div class="quiz"><div class="leiste">${einheitWahl('funit', unit)}
      <div class="seg" id="flen" role="group" aria-label="Anzahl">${[10, 20, 0].map(n => `<button type="button" data-n="${n}" aria-pressed="${(store.ui.flen ?? 10) === n}">${n || 'Alle'}</button>`).join('')}</div></div><div id="qArea"></div></div>`;
    $('#funit').onchange = e => { store.ui.funit = e.target.value; save(); location.hash = `#/k/${K.id}/fragen`; vFragenNeu(); };
    $$('#flen button').forEach(b => b.onclick = () => { store.ui.flen = +b.dataset.n; save(); vFragenNeu(); });
    let pool = K.fragen.filter(f => !unit || f.e === unit);
    const n = store.ui.flen ?? 10;
    pool = shuffle(pool).sort((a, b) => (store.quiz[a.id] === 1) - (store.quiz[b.id] === 1));
    runQuiz(n ? pool.slice(0, n) : pool);
  }
  function vFragenNeu() { app.innerHTML = ''; vFragen(); }
  function runQuiz(list) {
    let i = 0, right = 0; const wrong = [];
    const area = $('#qArea');
    const show = () => {
      if (!list.length) { area.innerHTML = '<div class="karte">Keine Fragen für diese Auswahl.</div>'; return; }
      if (i >= list.length) {
        area.innerHTML = `<div class="karte"><div class="punkte">${right} / ${list.length}</div><p>${right === list.length ? 'Alle richtig.' : 'Die falschen Fragen kannst du direkt wiederholen.'}</p>
          <div class="zeile">${wrong.length ? '<button class="knopf haupt" id="rep" type="button">Falsche wiederholen</button>' : ''}<button class="knopf" id="neu" type="button">Neue Runde</button></div></div>`;
        if (wrong.length) $('#rep').onclick = () => runQuiz(shuffle(wrong));
        $('#neu').onclick = vFragenNeu; return;
      }
      const f = list[i];
      const order = shuffle(f.o.map((t, k) => k));
      area.innerHTML = `<div class="fortschritt"><i style="width:${100 * i / list.length}%"></i></div>
        <div class="ref">Frage ${i + 1} von ${list.length} · Lerneinheit ${esc(f.e)}</div>
        <p class="qtext">${esc(f.f)}</p>
        <div class="qopts">${order.map((k, j) => `<button type="button" data-k="${k}"><b>${'ABCD'[j]}</b><span>${esc(f.o[k])}</span></button>`).join('')}</div><div id="qfb"></div>`;
      $$('.qopts button', area).forEach(b => b.onclick = () => {
        const k = +b.dataset.k, ok = k === f.r;
        $$('.qopts button', area).forEach(x => { x.disabled = true; if (+x.dataset.k === f.r) x.classList.add('ok'); });
        if (!ok) { b.classList.add('bad'); wrong.push(f); } else right++;
        store.quiz[f.id] = ok ? 1 : 0; save();
        $('#qfb').innerHTML = `<div class="rm ${ok ? 'ok' : 'bad'}" style="margin-top:12px"><strong>${ok ? 'Richtig.' : 'Leider falsch.'}</strong> ${esc(f.x)}<br>${refHtml(f.ref)}</div><button class="knopf haupt" id="qn" type="button" style="margin-top:12px">Weiter</button>`;
        $('#qn').onclick = () => { i++; show(); }; $('#qn').focus();
      });
    };
    show();
  }

  /* --- Sortieren --- */
  function vSortieren() {
    const S = K.sortieren;
    let queue = shuffle(S.items), right = 0, cur = null;
    app.innerHTML = `<div class="leiste"><h2 style="margin:0">${esc(S.titel)}</h2>${refHtml(S.ref)}</div>
      <div class="sort-buehne"><div class="sort-karte" id="scard"></div><div id="sfb" class="hinweis">Wähle die passende Gruppe.</div></div>
      <div class="sort-spalten" id="scols" style="--sp:${Math.min(4, S.kategorien.length)}">${S.kategorien.map((k, i) => `<div class="sort-spalte"><button type="button" data-k="${i}">${esc(k)}</button><ul id="sc${i}"></ul></div>`).join('')}</div>`;
    const next = () => {
      cur = queue.shift();
      if (!cur) {
        $('#scard').textContent = `${right} / ${S.items.length} richtig`;
        $('#sfb').innerHTML = '<button class="knopf haupt" id="sagain" type="button">Noch einmal</button>';
        $('#sagain').onclick = () => { app.innerHTML = ''; vSortieren(); };
        $$('#scols button').forEach(b => b.disabled = true); return;
      }
      $('#scard').textContent = cur.t;
    };
    $$('#scols button').forEach(b => b.onclick = () => {
      if (!cur) return;
      const ok = +b.dataset.k === cur.k;
      if (ok) right++;
      store.sort[cur.id] = ok ? 1 : 0; save();
      $('#sc' + cur.k).appendChild(el('li', ok ? {} : { class: 'bad' }, esc(cur.t)));
      $('#sfb').innerHTML = ok ? `<span style="color:var(--ok)">✓ Richtig: ${esc(S.kategorien[cur.k])}</span>` : `<span style="color:var(--bad)">✗ Gehört zu: ${esc(S.kategorien[cur.k])}</span>`;
      next();
    });
    next();
  }

  /* --- Lückentabellen --- */
  function vTabellen() {
    const idx = Math.min(store.ui.tab || 0, K.tabellen.length - 1), gap = store.ui.gap ?? 0.35;
    app.innerHTML = `<div class="leiste"><div class="seg" id="tabsel" role="group" aria-label="Tabelle">${K.tabellen.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${i === idx}">${esc(t.titel.replace(/\s*\(.*\)$/, ''))}</button>`).join('')}</div>
      <div class="seg" id="gap" role="group" aria-label="Lücken">${[['wenig', 0.35], ['viele', 0.7], ['alle', 1]].map(([t, v]) => `<button type="button" data-v="${v}" aria-pressed="${gap === v}">Lücken: ${t}</button>`).join('')}</div></div><div class="karte" id="tbl"></div>`;
    $$('#tabsel button').forEach(b => b.onclick = () => { store.ui.tab = +b.dataset.i; save(); vTabellenNeu(); });
    $$('#gap button').forEach(b => b.onclick = () => { store.ui.gap = +b.dataset.v; save(); vTabellenNeu(); });
    const T = K.tabellen[idx];
    const cells = []; T.zeilen.forEach((z, r) => z[1].forEach((v, c) => cells.push([r, c])));
    const blanks = new Set(shuffle(cells).slice(0, Math.max(1, Math.round(cells.length * gap))).map(([r, c]) => r + ':' + c));
    $('#tbl').innerHTML = `<div class="zeile" style="justify-content:space-between"><h2 style="margin:0">${esc(T.titel)}</h2>${refHtml(T.ref)}</div>
      <div class="tab-wrap"><table><thead><tr><th></th>${T.spalten.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>
      ${T.zeilen.map((z, r) => `<tr><th>${esc(z[0])}</th>${z[1].map((v, c) => blanks.has(r + ':' + c)
        ? `<td><input data-a="${esc(v)}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="${/^[\d–,\-/ ]+$/.test(v) ? 'decimal' : 'text'}" aria-label="${esc(z[0])}, ${esc(T.spalten[c])}"></td>`
        : `<td><span class="gegeben">${esc(v)}</span></td>`).join('')}</tr>`).join('')}
      </tbody></table></div><p class="hinweis">${esc(T.fuss || '')} Ein Gedankenstrich bedeutet: keine Bewegung bzw. trifft nicht zu.</p>
      <div class="zeile"><button class="knopf haupt" id="tcheck" type="button">Prüfen</button><button class="knopf" id="tsol" type="button">Lösung zeigen</button><button class="knopf" id="tnew" type="button">Neue Lücken</button><span id="tres" class="ref"></span></div>`;
    const norm = s => s.toLowerCase().replace(/\s+/g, '').replace(/[-–—]/g, '–').replace(/^(–|0|keine?)$/, '–').replace(/\./g, ',');
    $('#tcheck').onclick = () => {
      let ok = 0, all = 0;
      $$('#tbl input').forEach(inp => { all++; const good = norm(inp.value) === norm(inp.dataset.a); inp.classList.toggle('ok', good); inp.classList.toggle('bad', !good); if (good) ok++; });
      $('#tres').textContent = `${ok} von ${all} richtig`;
    };
    $('#tsol').onclick = () => $$('#tbl input').forEach(inp => { if (!inp.classList.contains('ok')) { inp.value = inp.dataset.a; inp.classList.remove('bad'); } });
    $('#tnew').onclick = vTabellenNeu;
  }
  function vTabellenNeu() { app.innerHTML = ''; vTabellen(); }

  /* --- Bildnachweise --- */
  function vBilder() {
    const benutzt = {};
    K.tafeln.forEach((t, i) => { (benutzt[t.nachweis] = benutzt[t.nachweis] || []).push(i + 1); });
    const keys = Object.keys(K.nachweise).filter(k => benutzt[k]);
    app.innerHTML = `<h2>Bildnachweise</h2>
      <p class="hinweis" style="max-width:70ch">Alle Tafeln sind Originalabbildungen von Wikimedia Commons. Die Beschriftungen sind in der App abgedeckt; das Bild selbst ist unverändert. Keine Abbildung stammt aus dem Prometheus oder einem anderen geschützten Atlas.</p>
      <ul class="nachweise">${keys.map(k => { const n = K.nachweise[k]; return `<li><img src="${esc(n.bild)}" alt="" loading="lazy"><div><strong>${esc(n.titel)}</strong> <span class="ref">Tafel ${benutzt[k].join(', ')}</span>${nachweisHtml(k)}</div></li>`; }).join('')}</ul>`;
  }

  /* ---------- Offline (Service Worker) ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  route();
})();
