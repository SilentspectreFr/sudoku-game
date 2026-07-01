// Service worker du Sudoku — offline + installable.
// Stratégie : pré-cache des fichiers du jeu ; navigations en network-first
// (pour voir les mises à jour en ligne) avec repli cache hors-ligne ; reste
// en cache-first. Les polices Google sont mises en cache à la volée.
//
// Le nom du cache dérive de la SOURCE UNIQUE js/version.js : bumper APP_VERSION
// là-bas renomme ce cache et déclenche la mise à jour. NE PAS coder le numéro ici.
// (Les navigateurs modernes re-vérifient les scripts importés à chaque update,
//  donc un changement de version.js suffit à mettre le service worker à jour.)
importScripts('./js/version.js');
const CACHE = 'sudoku-v' + self.APP_VERSION;

const CORE = [
  './',
  './index.html',
  './play.html',
  './train.html',
  './css/styles.css',
  './js/version.js',
  './js/sudoku-engine.js',
  './js/board.js',
  './js/game.js',
  './js/main.js',
  './js/techniques.js',
  './js/trainer.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Navigations (HTML) : réseau d'abord, repli cache hors-ligne.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Reste : cache d'abord, sinon réseau (et on met en cache à la volée).
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && (req.url.startsWith(self.location.origin) || req.url.includes('fonts.g'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
