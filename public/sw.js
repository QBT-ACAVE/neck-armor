const CACHE = 'neck-armor-v6';
const ASSETS = ['/', '/workout', '/calendar', '/catches', '/nutrition', '/history', '/settings', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* */ }
  const title = data.title || 'Reid Cave';
  const options = {
    body: data.body || 'Time to take your meds',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'meds',
    requireInteraction: false,
    data: { url: data.url || '/meds' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/meds';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
