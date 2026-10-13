// Sadə service worker: yalnız tətbiqin öz fayllarını keşləyir.
// Hava və zəlzələ məlumatları heç vaxt keşdən "təzə" kimi verilmir — onları app.js idarə edir.
const CACHE = "skypulse-v2";
const FILES = ["./", "./index.html", "./app.js", "./i18n.js", "./tech.js", "./config.js", "./rules.json", "./icon.svg", "./manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return; // xarici API və server sorğuları keşlənmir
  // Əvvəl şəbəkə, alınmasa keş
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
