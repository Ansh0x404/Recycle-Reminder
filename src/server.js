console.log("Server.js script started");

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const HOSTNAME = "192.168.4.45";
const PORT = process.env.PORT || 1002;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "../public")));

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

// Start the server
app.listen(PORT, HOSTNAME, () => {
  console.log(`Server is running on http://${HOSTNAME}:${PORT}`);
});
