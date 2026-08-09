"""
Run a single job inline (spawned by the Node backend when RabbitMQ is
unavailable). Reads JOB_JSON from the environment and exits when done.
"""

import json
import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from worker.main import process_job  # noqa: E402


def main():
    raw = os.getenv("JOB_JSON")
    if not raw:
        print("[run_job] Missing JOB_JSON environment variable", file=sys.stderr)
        sys.exit(1)

    try:
        job = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[run_job] Invalid JOB_JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    job_id = job.get("jobId") or job.get("job_id") or "unknown"
    print(f"[run_job] Starting inline job {job_id}")
    process_job(job)
    print(f"[run_job] Finished inline job {job_id}")


if __name__ == "__main__":
    main()
