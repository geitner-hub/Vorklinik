/* ═══════════════════════════════════════════════════════
   Vorklinik – sw.js (Service Worker: offline und „Zum Home-Bildschirm“)
   Kern wird beim Installieren gespeichert; Kapitel, Tafeln und Bilder beim ersten Öffnen.
   Bei Änderungen an ausgelieferten Dateien VERSION erhöhen (werkzeuge/pruefen.py zeigt sie an).
   ═══════════════════════════════════════════════════════ */
const VERSION = 'v2';
const CACHE = 'vorklinik-' + VERSION;
const KERN = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/vendor/qrcode.js', 'struktur.json', 'manifest.webmanifest',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(KERN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('vorklinik-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Netz zuerst (immer aktuelle Inhalte), bei Funkloch die gespeicherte Kopie; Bilder und Schriften zuerst aus dem Speicher
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fest = /\/(fonts|icons|bilder)\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (fest) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
    }
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
