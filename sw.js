// Service Worker: Offline-Fähigkeit (stale-while-revalidate)
// Bei Änderungen an Dateien die Versionsnummer erhöhen.
const V = 'voidbreakers-v1';
const FILES = ['./', 'index.html', 'style.css', 'game.js', 'data.json', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(V).then(cache =>
      cache.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit || cache.match('index.html'));
        return hit || net;
      })
    )
  );
});
