require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");

const path = require("path");
const { initSocket, emitJobEvent } = require("./socket");
const { consumeStatusEvents, initQueueMode, getQueueStatus } = require("./queue/producer");
const repoRoutes = require("./routes/repo");
const internalRoutes = require("./routes/internal");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.NODE_ENV === "production" ? true : FRONTEND_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", queue: getQueueStatus() });
});
app.use("/internal", internalRoutes);
app.use("/api/repo", repoRoutes);

// --- Serve React Frontend (Production monolith only) ---
const frontendBuildPath = path.join(__dirname, "../../frontend/build");
const backendPublicPath = path.join(__dirname, "../public");
const staticPath = fs.existsSync(frontendBuildPath) ? frontendBuildPath : backendPublicPath;

if (fs.existsSync(path.join(staticPath, "index.html"))) {
  app.use(express.static(staticPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/internal")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

const server = http.createServer(app);
initSocket(server, process.env.NODE_ENV === "production" ? "*" : FRONTEND_ORIGIN);

process.on("uncaughtException", (err) => {
  console.error("[app] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[app] unhandledRejection:", reason);
  if (promise) {
    console.error("[app] rejected promise:", promise);
  }
});

let _retryDelay = 2000;

function startStatusConsumer() {
  consumeStatusEvents((payload) => {
    const { jobId, event, data } = payload;
    if (!jobId || !event) return;
    console.log(`[status] job ${jobId}: ${event}`, data || "");
    emitJobEvent(jobId, event, data);
  })
    .then(() => {
      _retryDelay = 2000;
    })
    .catch((err) => {
      console.error(
        `[app] Status consumer failed (${err.message}). Retrying in ${_retryDelay / 1000}s...`
      );
      setTimeout(() => {
        _retryDelay = Math.min(_retryDelay * 2, 30000);
        startStatusConsumer();
      }, _retryDelay);
    });
}

async function start() {
  await initQueueMode();
  startStatusConsumer();

  server.listen(PORT, HOST, () => {
    console.log(`CodeCatalyst backend listening on http://${HOST}:${PORT}`);
    console.log(`[app] Queue mode: ${getQueueStatus().mode}`);
  });
}

start();
