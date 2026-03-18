// Service Worker — injects Basic Auth for ultra.cc audio requests.
// Credentials live here (never sent to the client page, only used inside the SW context).
const ULTRA_USER = 'bennen011';
const ULTRA_PASS = 'YOUR_ULTRA_PASS'; // replace with your actual password
const ULTRA_HOST = 'bennen011.nova.usbx.me';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname !== ULTRA_HOST) return; // ignore everything else

  event.respondWith(
    fetch(event.request, {
      headers: {
        ...Object.fromEntries(event.request.headers),
        Authorization: 'Basic ' + btoa(`${ULTRA_USER}:${ULTRA_PASS}`),
      },
    })
  );
});
