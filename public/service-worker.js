const CACHE_NAME = "garbage-collector-v1";
const SCHEDULED_NOTIFICATIONS = "scheduled-notifications";

// Assets to cache immediately
const CORE_ASSETS = ["/", "/index.html", "/styles.css", "/script.js", "/icon.png", "/manifest.json"];

// Install event - cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching core assets");
      return cache.addAll(CORE_ASSETS);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME;
          })
          .map((cacheName) => {
            return caches.delete(cacheName);
          })
      );
    })
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener("fetch", (event) => {
  // For API requests
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response
          const responseToCache = response.clone();

          // Cache the successful API response
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // If network request fails, try to serve from cache
          return caches.match(event.request);
        })
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
      })
    );
  }
});

// Handle messages from the client (main script)
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "scheduleNotification") {
    const notification = event.data.notification;
    scheduleNotification(notification);
  }
});

// Store notification data in IndexedDB
function scheduleNotification(notification) {
  // Open (or create) the IndexedDB database
  const dbPromise = indexedDB.open("garbage-notifications", 1);

  dbPromise.onupgradeneeded = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(SCHEDULED_NOTIFICATIONS)) {
      db.createObjectStore(SCHEDULED_NOTIFICATIONS, { keyPath: "id" });
    }
  };

  dbPromise.onsuccess = function (event) {
    const db = event.target.result;
    const tx = db.transaction(SCHEDULED_NOTIFICATIONS, "readwrite");
    const store = tx.objectStore(SCHEDULED_NOTIFICATIONS);

    // Store the notification
    store.put(notification);

    // Set up a periodic check for pending notifications
    //setupPeriodicSync();
  };
}

// Check for pending notifications every minute
// function setupPeriodicSync() {
//   setInterval(() => {
//     checkScheduledNotifications();
//   }, 360000); // Check every minute
// }

// Check if any notifications need to be shown
function checkScheduledNotifications() {
  const now = Date.now();

  // Open the database
  const dbPromise = indexedDB.open("garbage-notifications", 1);

  dbPromise.onsuccess = function (event) {
    const db = event.target.result;
    const tx = db.transaction(SCHEDULED_NOTIFICATIONS, "readwrite");
    const store = tx.objectStore(SCHEDULED_NOTIFICATIONS);

    // Get all notifications
    const request = store.getAll();

    request.onsuccess = function () {
      const notifications = request.result;

      // Check each notification
      notifications.forEach((notification) => {
        // If the notification time has passed and it's within the last hour (to avoid duplicate notifications)
        if (notification.timestamp <= now && now - notification.timestamp < 3600000) {
          // Show the notification
          self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: notification.icon,
          });

          // Delete this notification from the store
          store.delete(notification.id);
        }
      });
    };
  };
}

// Initialize the periodic check when service worker starts
checkScheduledNotifications();
//setupPeriodicSync();
