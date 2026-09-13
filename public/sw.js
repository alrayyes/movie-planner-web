// #590: a registered service worker with a fetch handler is required for
// Chrome's native install prompt (Android's beforeinstallprompt banner,
// desktop's omnibox install icon) — the manifest and icons alone (#70)
// only get the plain "Add to Home screen" shortcut. Deliberately minimal:
// network-first for same-origin GET requests, with a cache fallback for
// offline use. Cross-origin and non-GET requests (CalDAV, OMDb, TMDb —
// this app's actual data, sent with the visitor's own credentials) are
// never intercepted, so this can't cache or alter them.
const CACHE_NAME = "movie-planner-web-v1";
const APP_SHELL = ["/", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
  );
});
