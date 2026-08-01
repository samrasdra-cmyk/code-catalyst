const express = require("express");
const crypto = require("crypto");
const { publishJob } = require("../queue/producer");

const router = express.Router();

/**
 * POST /api/repo/analyze
 * Body: { repoUrl: string, instruction?: string }
 * Creates a jobId, pushes the job onto RabbitMQ for the Python worker,
 * and immediately returns the jobId so the frontend can join that
 * job's socket room and start listening for agent_status events.
 */
router.post("/analyze", async (req, res) => {
  const { repoUrl, instruction } = req.body || {};

  if (!repoUrl || typeof repoUrl !== "string" || !repoUrl.includes("github.com")) {
    return res.status(400).json({ error: "A valid GitHub repo URL is required" });
  }

  const jobId = crypto.randomUUID();

  try {
    await publishJob(jobId, repoUrl, instruction);
    return res.status(202).json({ jobId, status: "queued" });
  } catch (err) {
    console.error("[repo] failed to enqueue job", err);
    return res.status(503).json({
      error: "Could not reach the job queue. Is RabbitMQ running (docker-compose up)?",
    });
  }
});

module.exports = router;
