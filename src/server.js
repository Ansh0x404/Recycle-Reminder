// Load environment variables from .env file
require("dotenv").config();

console.log("Server.js script started");

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const webpush = require("web-push");
const fs = require("fs");

const app = express();
//const HOSTNAME = "192.168.4.45";
//const HOSTNAME = "localhost";
const HOSTNAME = "0.0.0.0";
const PORT = process.env.PORT || 1002;

// VAPID KEYS CONFIGURATION
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;
const vapidEmail = process.env.VAPID_EMAIL;

if (!publicVapidKey || !privateVapidKey) {
  console.error("ERROR: VAPID Keys are missing. Check your .env file.");
  process.exit(1);
}

webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json()); // Parses JSON body (built-in body-parser)

// SUBSCRIPTION STORAGE
const DATA_FILE = path.join(__dirname, "subscriptions.json");

// initialize file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  try {
    console.log("subscriptions.json not found. Creating it...");
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
    console.log("subscriptions.json created successfully.");
  } catch (err) {
    console.error("Error creating subscriptions.json:", err);
  }
}

// Helper to safe-read subscriptions
const getSubscriptions = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return [];
  }
};

// API ENDPOINTS

// 1. Send Public Key to frontend
app.get("/api/vapidPublicKey", (req, res) => {
  res.send(publicVapidKey);
});

// 2. Save User Subscription
app.post("/api/subscribe", (req, res) => {
  const { subscription, favorites } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid subscription" });
  }

  let subs = getSubscriptions();

  // Update existing or add new (deduplicate based on endpoint)
  subs = subs.filter((s) => s.subscription.endpoint !== subscription.endpoint);

  subs.push({ subscription, favorites, timestamp: Date.now() });

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(subs, null, 2));
    res.status(201).json({ message: "Subscription saved" });
    console.log(`New subscription stored with ${favorites ? favorites.length : 0} addresses.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

// Critical middleware: Catch any direct /ZoneFinder requests and route them through the proxy
app.use("/ZoneFinder", (req, res) => {
  res.redirect(`/api/ZoneFinder${req.url}`);
});

// Proxy configuration for City of London API
app.use(
  "/api",
  createProxyMiddleware({
    target: "https://apps.london.ca",
    changeOrigin: true,
    pathRewrite: {
      "^/api": "", // Remove /api prefix when forwarding
    },
    secure: true,
  })
);

// NOTIFICATION LOGIC

// Check every hour (3600000 ms) if we need to send notifications
setInterval(() => {
  checkAndSendNotifications();
}, 60 * 60 * 1000);

function checkAndSendNotifications() {
  const now = new Date();

  //Send the notifications at 10 PM only
  if (now.getHours() !== 22) {
    console.log(`[${now.toISOString()}] Not 10 PM yet. Skipping checks.`);
    return;
  }

  console.log(`[${now.toISOString()}] 10 PM Trigger: Checking schedules...`);

  const subs = getSubscriptions();
  // Calculate "Tomorrow"
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toDateString(); // e.g., "Fri Oct 10 2025"

  subs.forEach((user) => {
    if (!user.favorites || !Array.isArray(user.favorites)) return;

    // Check each favorite address
    user.favorites.forEach((fav) => {
      // fav contains { address: "...", dates: {...} }
      if (!fav.dates) return;

      checkType(user.subscription, fav.address, "Garbage", fav.dates.garbageDateArray, tomorrowStr);
      checkType(user.subscription, fav.address, "Recycling", fav.dates.recycleDateArray, tomorrowStr);
      checkType(user.subscription, fav.address, "Yard Waste", fav.dates.yardDateArray, tomorrowStr);
      checkType(user.subscription, fav.address, "Special Collection", fav.dates.specialDateArray, tomorrowStr);
    });
  });
}

function checkType(subscription, addressName, type, dateArray, tomorrowStr) {
  if (!dateArray) return;

  // Check if any date in the array matches "tomorrow"
  const hasCollection = dateArray.some((dateStr) => {
    const d = new Date(dateStr);
    return d.toDateString() === tomorrowStr;
  });

  if (hasCollection) {
    const payload = JSON.stringify({
      title: `${type} Collection Tomorrow`,
      body: `Don't forget to put out the ${type} at ${addressName}!`,
      icon: "/icon.png",
    });

    // Send Notification
    webpush
      .sendNotification(subscription, payload)
      .then(() => console.log(`Sent ${type} alert to ${addressName}`))
      .catch((err) => {
        console.error("Push Error:", err.statusCode);
        // If 410 or 404, the user removed the subscription, we should delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          removeSubscription(subscription.endpoint);
        } else {
          console.error("Push Error:", err);
        }
      });
  }
}

function removeSubscription(endpoint) {
  let subs = getSubscriptions();
  subs = subs.filter((s) => s.subscription.endpoint !== endpoint);
  fs.writeFileSync(DATA_FILE, JSON.stringify(subs, null, 2));
  console.log("Removed dead subscription");
}

// Start the server
app.listen(PORT, HOSTNAME, () => {
  console.log(`Server is running on http://${HOSTNAME}:${PORT}`);
});
