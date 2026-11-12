// Pantarr service worker: only the share target of the phone (« Share » → Pantarr with a photo of a receipt or a PDF).
// The files are kept in the browser's cache, then the Pantry page sends them to the household's receipts.
const SHARED = "pantarr-shared";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;   // everything else: the network, untouched
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const cache = await caches.open(SHARED);
      let n = 0;
      for (const f of form.getAll("files")) {
        if (!(f instanceof File)) continue;
        await cache.put(`/shared/${Date.now()}-${n++}`, new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-filename": encodeURIComponent(f.name || "partage") } }));
      }
    } catch (e) { /* nothing shared: the page says so */ }
    return Response.redirect("/pantry?shared=1", 303);
  })());
});
