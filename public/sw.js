// StockSafe service worker. It does two small things and deliberately nothing more:
//   1. keeps the app shell files (scripts, styles, icons, fonts) so the app opens fast and can be installed;
//   2. shows /offline when the server cannot be reached.
// It NEVER stores pages, API answers or anything with stock, patient or user data: every screen always comes from the
// server, so what a person sees is never stale and nothing private is left in the browser cache.
const VERSION = "stocksafe-v1";
const SHELL = "stocksafe-shell-" + VERSION;
const STATIC = "stocksafe-static-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add(new Request("/offline", { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // data is never cached

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline").then((r) => r || Response.error())));
    return;
  }
  if (isStaticAsset(url)) {
    // build files have a hash in their name, so a cached copy is always the right one
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
