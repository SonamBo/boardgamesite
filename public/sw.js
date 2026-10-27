// Offline helper. Always tries the network first, so visitors get the latest version;
// falls back to the last copy it saw when there is no connection.
const CACHE = 'bgs-v3';
const CORE = [
  '/',
  '/play/solitaire',
  '/play/checkers',
  '/play/reversi',
  '/play/four-in-a-row',
  '/assets/css/site.css',
  '/assets/fonts/dm-sans-latin.woff',
  '/assets/fonts/instrument-serif-latin.woff',
  '/assets/js/site.js',
  '/assets/js/store.js',
  '/assets/js/accounts.js',
  '/assets/js/firebase.js',
  '/assets/js/firebase-config.js',
  '/assets/js/game-ui.js',
  '/assets/js/sound.js',
  '/assets/js/c4-engine.js',
  '/assets/js/four-in-a-row.js',
  '/assets/js/checkers-engine.js',
  '/assets/js/checkers.js',
  '/assets/js/reversi-engine.js',
  '/assets/js/reversi.js',
  '/assets/js/solitaire-engine.js',
  '/assets/js/solitaire.js',
  '/assets/img/logo.webp',
  '/assets/img/hero.webp',
  '/assets/img/mascot-wave.webp',
  '/assets/img/mascot-confused.webp',
  '/assets/img/mascot-trophy.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts, Firebase and analytics go straight to the network
  if (url.pathname.startsWith('/__/')) return;         // Firebase's own sign-in pages
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
