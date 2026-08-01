"""
Entry point for the Python worker. Connects to RabbitMQ, waits for
jobs pushed by the Node backend (see backend/src/queue/producer.js),
runs each job through the LangGraph defined in core/graph.py, and
emits agent_status events the whole way via core/status.py.

Run with:  python main.py
"""

import json
import os
import traceback

import pika
from dotenv import load_dotenv

load_dotenv()

from core.graph import build_graph
from core.state import new_state
from core.status import emit_status
from rag.indexer import index_repo

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
JOB_QUEUE_NAME = os.getenv("JOB_QUEUE_NAME", "codecatalyst_jobs")
MAX_LOOPS = int(os.getenv("MAX_LOOPS", "3"))

_graph = build_graph()


def process_job(job: dict):
    job_id = job["jobId"]
    repo_url = job["repo_url"]
    instruction = job.get("instruction", "Analyze and suggest a migration plan")

    emit_status(job_id, "agent_status", {"agent": "system", "status": "job_received"})

    state = new_state(job_id, repo_url, instruction, max_loops=MAX_LOOPS)

    try:
        final_state = _graph.invoke(state)

        # Best-effort RAG indexing of the whole repo, now that we know
        # local_path. Never blocks job completion if it fails.
        local_path = final_state.get("local_path")
        if local_path:
            try:
                files_indexed, chunks_indexed = index_repo(local_path)
                emit_status(
                    job_id, "agent_log",
                    {"agent": "system", "message": f"Indexed {chunks_indexed} chunks from {files_indexed} files into ChromaDB"},
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[main] indexing failed for job {job_id}: {exc}")

        emit_status(
            job_id, "job_complete",
            {
                "files": final_state.get("files", []),
                "dependencies": final_state.get("dependencies", {}),
                "vulnerabilities": final_state.get("vulnerabilities", []),
                "refactored_code": final_state.get("refactored_code", ""),
                "critic_feedback": final_state.get("critic_feedback"),
                "error": final_state.get("error"),
                "log": final_state.get("log", []),
            },
        )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        emit_status(job_id, "job_error", {"message": str(exc)})


def _on_message(channel, method, _properties, body):
    try:
        job = json.loads(body.decode("utf-8"))
        process_job(job)
    except Exception as exc:  # noqa: BLE001
        print(f"[main] failed to process message: {exc}")
    finally:
        channel.basic_ack(delivery_tag=method.delivery_tag)


import time

def main():
    print(f"[main] Connecting to RabbitMQ at '{RABBITMQ_URL}'...")
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            params.socket_timeout = 2.0
            params.connection_attempts = 1
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
