const { spawn } = require("child_process");
const path = require("path");

const WORKER_SCRIPT = path.join(__dirname, "../../../worker/run_job.py");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

const activeJobs = new Set();

function publishJobInline(jobId, repoUrl, instruction, port) {
  if (activeJobs.has(jobId)) {
    return Promise.resolve({ jobId, status: "already_running" });
  }

  const statusUrl = `http://127.0.0.1:${port}/internal/status`;
  const job = {
    jobId,
    repo_url: repoUrl,
    instruction: instruction || "Analyze and suggest a migration plan",
    created_at: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    activeJobs.add(jobId);

    const child = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
      cwd: path.join(__dirname, "../../.."),
      env: {
        ...process.env,
        JOB_JSON: JSON.stringify(job),
        STATUS_HTTP_URL: statusUrl,
        ENABLE_RAG_INDEXING: process.env.ENABLE_RAG_INDEXING || "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[worker:${jobId}] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[worker:${jobId}] ${chunk}`);
    });

    child.on("error", (err) => {
      activeJobs.delete(jobId);
      reject(err);
    });

    child.on("close", (code) => {
      activeJobs.delete(jobId);
      if (code !== 0) {
        console.error(`[queue/inline] worker for job ${jobId} exited with code ${code}`);
      }
    });

    // Resolve immediately so the API can return 202 while the worker runs.
    console.log(`[queue/inline] Job ${jobId} started inline worker (pid ${child.pid})`);
    resolve(job);
  });
}

module.exports = { publishJobInline, activeJobs };
