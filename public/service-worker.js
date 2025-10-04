self.addEventListener("install", (event) => {
  //console.log('Service Worker installing...');
  // You can cache assets here
  event.waitUntil(
    caches.open("v1").then((cache) => {
      //console.log('Service Worker caching files');
      return cache.addAll(["/index.html", "/styles.css", "/script.js", "/icon.png", "/manifest.json"]);
    })
  );
});

self.addEventListener("activate", (event) => {
  //console.log('Service Worker installing...');
  // You can cache assets here
  const cwl = ["v1"];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cwl.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  //console.log("Fetching:", event.request.url);
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
