/* SW — network-first p/ o painel admin (Supabase). */
const CACHE = "mfadmin-v14";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/admin.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   // Supabase/CDN: deixa a rede cuidar
  e.respondWith(
    fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {}); return res; })
      .catch(() => caches.match(e.request).then(h => h || caches.match("./index.html")))
  );
});
