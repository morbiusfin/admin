/* SW — network-first p/ o app; licencas.json NUNCA é cacheado (sempre fresco da API/Pages) */
const CACHE = "mfadmin-v1";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/sign.js", "./js/github.js", "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // nunca cachear chamadas à API do GitHub nem o próprio licencas.json
  if (url.hostname === "api.github.com" || /licencas\.json/.test(url.pathname)) return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); return res; })
      .catch(() => caches.match(e.request).then(h => h || caches.match("./index.html")))
  );
});
