// Deliberately minimal. Live scores must never be served stale, so this only
// caches the app shell/icons and always goes to the network for pages and the
// API. Its real job is making the app installable and surviving a brief signal
// drop on the walk between courts.
const CACHE = "compass-shell-v1";
const SHELL = ["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never cache state or scoring — always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  if (SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});
