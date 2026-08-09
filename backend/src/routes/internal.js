const express = require("express");
const { emitJobEvent } = require("../socket");

const router = express.Router();

function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
}

router.post("/status", (req, res) => {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { jobId, event, data } = req.body || {};
  if (!jobId || !event) {
    return res.status(400).json({ error: "jobId and event are required" });
  }

  emitJobEvent(jobId, event, data);
  return res.json({ ok: true });
});

module.exports = router;
