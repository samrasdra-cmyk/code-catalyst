"""
Entry point for the Python worker. Connects to RabbitMQ, waits for
jobs pushed by the Node backend (see backend/src/queue/producer.js),
runs each job through the LangGraph defined in core/graph.py, and
emits agent_status events the whole way via core/status.py.

Run with:  python main.py
"""

import json
import os
import sys
import traceback

import concurrent.futures


import pika
from dotenv import load_dotenv

# Allow `python main.py` from the worker/ folder by adding the repo root
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

load_dotenv()

from worker.core.graph import build_graph
from worker.core.state import new_state
from worker.core.status import emit_status
from worker.rag.indexer import index_repo

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
JOB_QUEUE_NAME = os.getenv("JOB_QUEUE_NAME", "codecatalyst_jobs")
MAX_LOOPS = int(os.getenv("MAX_LOOPS", "3"))
ENABLE_RAG_INDEXING = os.getenv("ENABLE_RAG_INDEXING", "true").lower() == "true"

_graph = build_graph()

# ...

def process_job(job: dict):
    job_id = job["jobId"]
    repo_url = job["repo_url"]
    instruction = job.get("instruction", "Analyze and suggest a migration plan")

    emit_status(job_id, "agent_status", {"agent": "system", "status": "job_received"})

    state = new_state(job_id, repo_url, instruction, max_loops=MAX_LOOPS)

    try:
        final_state = _graph.invoke(state)
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        emit_status(job_id, "job_error", {"message": str(exc)})
        return

    # Tell the frontend the pipeline is done FIRST, before any
    # best-effort extra work that could stall or fail.
    emit_status(
        job_id, "agent_status",
        {
            "agent": "system", "status": "completed",
            "message": "Pipeline finished successfully",
            "next": "end",
            "result": final_state.get("refactored_code", ""),
        },
    )
    emit_status(
        job_id, "job_complete",
        {
            "status": "completed",
            "files": final_state.get("files", []),
            "dependencies": final_state.get("dependencies", {}),
            "vulnerabilities": final_state.get("vulnerabilities", []),
            "refactored_code": final_state.get("refactored_code", ""),
            "critic_feedback": final_state.get("critic_feedback"),
            "critic_passed": final_state.get("critic_passed", False),
            "error": final_state.get("error"),
            "log": final_state.get("log", []),
        },
    )

    local_path = final_state.get("local_path")
    if local_path and ENABLE_RAG_INDEXING:
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(index_repo, local_path)
                files_indexed, chunks_indexed = future.result(timeout=60)
                emit_status(
                    job_id, "agent_log",
                    {"agent": "system", "message": f"Indexed {chunks_indexed} chunks from {files_indexed} files into ChromaDB"},
                )
        except concurrent.futures.TimeoutError:
            print(f"[main] indexing timed out for job {job_id}, skipping")
        except Exception as exc:  # noqa: BLE001
            print(f"[main] indexing failed for job {job_id}: {exc}")
    elif local_path:
        print(f"[main] ENABLE_RAG_INDEXING=false, skipping ChromaDB indexing for job {job_id}")
def _on_message(channel, method, _properties, body):
    try:
        job = json.loads(body.decode("utf-8"))
        job_id = job.get("jobId") or job.get("job_id") or "unknown"
        print(f"[main] picked up job {job_id}, starting pipeline...")
        process_job(job)
        print(f"[main] finished job {job_id}")
    except Exception as exc:  # noqa: BLE001
        print(f"[main] failed to process message: {exc}")
    finally:
        try:
            channel.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as exc:  # noqa: BLE001
            print(f"[main] could not ack message (connection likely dropped during processing): {exc}")


import time

def main():
    print(f"[main] Connecting to RabbitMQ at '{RABBITMQ_URL}'...")
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.socket_timeout = 2.0
            params.connection_attempts = 1
            params.heartbeat = 600
            params.blocked_connection_timeout = 300
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.queue_declare(queue=JOB_QUEUE_NAME, durable=True)
            channel.basic_qos(prefetch_count=1)
            channel.basic_consume(queue=JOB_QUEUE_NAME, on_message_callback=_on_message)

            print(f"[main] Connected! CodeCatalyst worker listening on '{JOB_QUEUE_NAME}'. Waiting for jobs...")
            try:
                channel.start_consuming()
            except KeyboardInterrupt:
                print("[main] Worker stopping...")
                channel.stop_consuming()
                connection.close()
                break
        except (pika.exceptions.AMQPConnectionError, Exception) as exc:
            print(f"[main] Could not connect to RabbitMQ ({exc}). Retrying in 5s...")
            print("[main] Tip: Run 'docker-compose up -d' to start the RabbitMQ broker container.")
            try:
                time.sleep(5)
            except KeyboardInterrupt:
                print("[main] Worker stopped by user.")
                break


if __name__ == "__main__":
    main()
