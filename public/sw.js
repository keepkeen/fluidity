// Minimal offline cache for Fluidity startpage.
// Caches the shell on install, then serves cache-first for GET requests.
const CACHE_NAME = "fluidity-static-v1"
const OFFLINE_ASSETS = ["./", "./index.html"]

self.addEventListener("install", event => {
  // In extension context, chrome-extension:// requests are not supported by Cache API.
  const isExtension = self.location.protocol === "chrome-extension:"
  if (!isExtension) {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS))
    )
  }
  self.skipWaiting()
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
  )
  self.clients.claim()
})

self.addEventListener("fetch", event => {
  const { request } = event
  if (request.method !== "GET") return
  if (request.url.startsWith("chrome-extension://")) return

  event.respondWith(
    caches.match(request).then(
      cached =>
        cached ||
        fetch(request)
          .then(response => {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
            return response
          })
          .catch(() =>
            request.mode === "navigate" ? caches.match("./index.html") : undefined
          )
    )
  )
})
