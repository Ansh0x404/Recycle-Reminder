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
  const { subscription } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid subscription" });
  }

  let subs = getSubscriptions();

  // Update existing or add new (deduplicate based on endpoint)
  subs = subs.filter((s) => s.subscription.endpoint !== subscription.endpoint);

  subs.push({ subscription, timestamp: Date.now() });

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(subs, null, 2));
    res.status(201).json({ message: "Subscription saved" });
    console.log(`New subscription stored.`);
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

// Configuration
const NOTIFICATION_HOUR = 18; // 6 PM
const NOTIFICATION_MINUTE = 0;

// Start the scheduling loop
scheduleNextCheck();

function scheduleNextCheck() {
  const now = new Date();
  const nextCheck = new Date(now);

  // Set target time today
  nextCheck.setHours(NOTIFICATION_HOUR, NOTIFICATION_MINUTE, 0, 0);

  // If the time has already passed today
  if (now >= nextCheck) {
    // Grace Period Logic:
    // If it's less than 4 hours late (e.g., it's 7 PM or 8 PM), send it anyway!
    const hoursLate = (now - nextCheck) / (1000 * 60 * 60);

    if (hoursLate < 4) {
      console.log("Server started late within grace period. Sending notification now.");
      sendNotifications();
    }

    // Schedule for next day
    nextCheck.setDate(nextCheck.getDate() + 1);
  }

  const delay = nextCheck.getTime() - now.getTime();

  console.log(`[${now.toLocaleString()}] Next notification check scheduled for: ${nextCheck.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} mins)`);

  setTimeout(() => {
    // 1. Run the check
    sendNotifications();

    // 2. Schedule the next check (effectively creating a daily loop)
    scheduleNextCheck();
  }, delay);
}

function sendNotifications() {
  console.log(`[${new Date().toLocaleString()}] Triggering scheduled notification check...`);

  const subs = getSubscriptions();

  subs.forEach((user) => {
    // Send a GENERIC signals. Payload contains NO user data.
    const payload = JSON.stringify({
      type: "CHECK_SCHEDULE",
      timestamp: Date.now(),
    });

    webpush.sendNotification(user.subscription, payload).catch((err) => {
      console.error("Error sending notification:", err); // Add logging

      if (err.statusCode === 410 || err.statusCode === 404) {
        removeSubscription(user.subscription.endpoint);
      }
    });
  });
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
