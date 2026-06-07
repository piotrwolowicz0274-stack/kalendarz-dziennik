/* ========================================================
   Service Worker — Kalendarz-Dziennik
   Strategia:
     • App shell (HTML, manifest, ikony) → Cache First
     • Google Fonts                       → Network First + cache
     • Reszta żądań GET                   → Network First + cache fallback
   ======================================================== */

const CACHE_NAME  = 'dziennik-v4';
const SHELL_URLS  = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())        // aktywuj niezwłocznie
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)    // usuń stare cache'e
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())       // przejmij otwarte karty
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;     // pomijaj POST itp.

  const url = new URL(request.url);
  const isFont = url.hostname.includes('fonts.googleapis.com') ||
                 url.hostname.includes('fonts.gstatic.com');

  if (isFont) {
    /* Google Fonts — Network First, cache fallback */
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* Wszystko inne — Cache First, sieć jako zapasowa */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => {
        /* Offline fallback — zwróć główną stronę dla nawigacji */
        if (request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

/* ---------- PUSH NOTIFICATIONS ---------- */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '📅 Przypomnienie', {
      body:    data.body  || '',
      icon:    './icons/icon.svg',
      badge:   './icons/icon.svg',
      vibrate: [200, 100, 200],
      data:    { url: './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
        if (existing) return existing.focus();
        return clients.openWindow('./');
      })
  );
});
