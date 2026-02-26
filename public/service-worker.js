const CACHE_NAME = "recycle-reminder-v3";

// Assets to cache immediately
const CORE_ASSETS = ["/", "/index.html", "/styles.css", "/script.js", "/recycle.png", "/manifest.json"];

// Install event - cache core assets
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching core assets");
      return cache.addAll(CORE_ASSETS);
    }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheWhitelist.includes(cacheName)) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        // Force the service worker to take control of all clients immediately
        return self.clients.claim();
      }),
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener("fetch", (event) => {
  // For API requests
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Check if valid response before caching
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          // FIX: Only cache GET requests. The Cache API throws error on POST.
          if (event.request.method === "GET") {
            // Clone the response
            const responseToCache = response.clone();

            // Cache the successful API response
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        })
        .catch(() => {
          // If network request fails, try to serve from cache
          return caches.match(event.request);
        }),
    );
  }
  // For static assets
  else {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Return cached response if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network
        return fetch(event.request).then((response) => {
          // Clone the response
          const responseToCache = response.clone();

          // Cache the successful response
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      }),
    );
  }
});

// Helper function to get all addresses from IndexedDB
function getAllAddressesFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GarbageAppDB", 1);
    request.onerror = () => resolve([]); // Fail safe
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("addresses")) {
        resolve([]);
        return;
      }
      const transaction = db.transaction(["addresses"], "readonly");
      const store = transaction.objectStore("addresses");
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => resolve([]);
    };
  });
}
// Helper function to update addresses in IndexedDB
function updateAddressInDB(updatedAddress) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GarbageAppDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(["addresses"], "readwrite");
      const store = transaction.objectStore("addresses");
      const putRequest = store.put(updatedAddress);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

// Push event - show notification and cleanup old dates
self.addEventListener("push", (event) => {
  if (event.data) {
    const payload = event.data.json();

    // If this is the "Check Schedule" signal from the server
    if (payload.type === "CHECK_SCHEDULE") {
      event.waitUntil(
        new Promise(async (resolve, reject) => {
          try {
            const addressArray = await getAllAddressesFromDB();
            if (!addressArray || addressArray.length === 0) {
              resolve();
              return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize to start of day
            
            // For notification check (Tomorrow)
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toDateString();

            const notifications = [];
            const cleanupPromises = [];

            for (const fav of addressArray) {
              const dates = fav.datesArray; 
              if (!dates) continue;

              // 1. Generate Notifications
              checkType(fav.address, "Garbage", dates.garbageDateArray, tomorrowStr, notifications);
              checkType(fav.address, "Recycling", dates.recycleDateArray, tomorrowStr, notifications);
              checkType(fav.address, "Yard Waste", dates.yardDateArray, tomorrowStr, notifications);
              checkType(fav.address, "Special", dates.specialDateArray, tomorrowStr, notifications);

              // 2. Cleanup Past Dates
              let modified = false;

              // Helper to filter dates
              const filterDates = (dateArr) => {
                if (!dateArr || !Array.isArray(dateArr)) return [];
                const originalLength = dateArr.length;
                
                // Keep dates that are today or in the future
                // We use new Date(dStr) to parse the stored string
                const filtered = dateArr.filter((dStr) => {
                  const d = new Date(dStr);
                  d.setHours(0, 0, 0, 0); // normalize
                  return d.getTime() >= today.getTime();
                });

                if (filtered.length !== originalLength) {
                  modified = true;
                }
                return filtered;
              };

              fav.datesArray.garbageDateArray = filterDates(dates.garbageDateArray);
              fav.datesArray.recycleDateArray = filterDates(dates.recycleDateArray);
              fav.datesArray.yardDateArray = filterDates(dates.yardDateArray);
              fav.datesArray.specialDateArray = filterDates(dates.specialDateArray);

              if (modified) {
                // If we changed arrays, save updated object back
                cleanupPromises.push(updateAddressInDB(fav));
              }
            }

            // Wait for notifications and cleanup to finish
            await Promise.all([
               ...notifications.map((n) => self.registration.showNotification(n.title, n.options)),
               ...cleanupPromises
            ]);
            
            resolve();
          } catch (err) {
            console.error("Error in push event:", err);
            // Even if cleanup fails, resolve so SW doesn't stay alive forever
            resolve();
          }
        })
      );
    }
  }
});

// Function to check collection types and prepare notifications
function checkType(addressName, type, dateArray, tomorrowStr, notifications) {
  if (!dateArray) return;
  const hasCollection = dateArray.some((dStr) => new Date(dStr).toDateString() === tomorrowStr);

  if (hasCollection) {
    notifications.push({
      title: `${type} Collection Tomorrow`,
      options: {
        body: `Don't forget the ${type} at ${addressName}`,
        icon: "/recycle.png",
        tag: `${addressName}-${type}-${tomorrowStr}`, // Prevents duplicates
      },
    });
  }
}

// Notification click event - handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Open the app
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === "/" && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    }),
  );
});
