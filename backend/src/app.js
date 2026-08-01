require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");

const path = require("path");
const { initSocket, emitJobEvent } = require("./socket");
const { consumeStatusEvents } = require("./queue/producer");
const repoRoutes = require("./routes/repo");

const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

const app = express();
app.use(cors({ origin: process.env.NODE_ENV === "production" ? true : FRONTEND_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/repo", repoRoutes);

// --- Serve React Frontend (Production) ---
const frontendBuildPath = path.join(__dirname, "../../frontend/build");
const backendPublicPath = path.join(__dirname, "../public");
const staticPath = fs.existsSync(frontendBuildPath) ? frontendBuildPath : backendPublicPath;

if (fs.existsSync(path.join(staticPath, "index.html"))) {
  app.use(express.static(staticPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

const server = http.createServer(app);
initSocket(server, process.env.NODE_ENV === "production" ? "*" : FRONTEND_ORIGIN);

// Bridge: every status event the Python worker drops on RabbitMQ gets
// forwarded straight into the browser room for that job.
function startStatusConsumer() {
  consumeStatusEvents((payload) => {
    const { jobId, event, data } = payload;
    if (!jobId || !event) return;
    emitJobEvent(jobId, event, data);
  }).catch((err) => {
    console.error(
      "[app] could not start status consumer - is RabbitMQ up? Retrying in 5s...",
      err.message
    );
    setTimeout(startStatusConsumer, 5000);
  });
}

startStatusConsumer();

server.listen(PORT, () => {
  console.log(`CodeCatalyst backend listening on http://localhost:${PORT}`);
});