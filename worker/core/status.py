"""
Thin wrapper for publishing agent_status events onto the
STATUS_QUEUE_NAME queue (or HTTP callback when inline mode is used).
The Node backend consumes these events and forwards each one to the
right Socket.IO room by job_id.
"""

import json
import os
import time

import pika
import requests

RABBITMQ_URL = os.getenv("RABBITMQ_URL")
if not RABBITMQ_URL:
    _host = os.getenv("RABBITMQ_HOST")
    if _host:
        _port = os.getenv("RABBITMQ_PORT", "5672")
        _user = os.getenv("RABBITMQ_USER", "guest")
        _pass = os.getenv("RABBITMQ_PASS", "guest")
        RABBITMQ_URL = f"amqp://{_user}:{_pass}@{_host}:{_port}"
    else:
        RABBITMQ_URL = "amqp://guest:guest@localhost:5672"

STATUS_QUEUE_NAME = os.getenv("STATUS_QUEUE_NAME", "codecatalyst_status")
STATUS_HTTP_URL = os.getenv("STATUS_HTTP_URL")

_connection = None
_channel = None
_last_failed_time = 0


def _emit_via_http(job_id: str, event: str, data: dict) -> bool:
    if not STATUS_HTTP_URL:
        return False
    try:
        requests.post(
            STATUS_HTTP_URL,
            json={"jobId": job_id, "event": event, "data": data},
            timeout=3,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[status] HTTP emit failed for '{event}' (job {job_id}): {exc}")
        return False


def _get_channel():
    global _connection, _channel, _last_failed_time
    if _channel and _channel.is_open:
        return _channel

    if time.time() - _last_failed_time < 5:
        return None

    try:
        params = pika.URLParameters(RABBITMQ_URL)
        params.socket_timeout = 1.0
        params.connection_attempts = 1
        _connection = pika.BlockingConnection(params)
        _channel = _connection.channel()
        _channel.queue_declare(queue=STATUS_QUEUE_NAME, durable=True)
        return _channel
    except Exception:
        _last_failed_time = time.time()
        raise


def emit_status(job_id: str, event: str, data: dict):
    """
    Publish a status event. Never raises - if delivery fails the worker
    should keep running the graph rather than crashing the whole job.
    """
    if _emit_via_http(job_id, event, data):
        return

    try:
        channel = _get_channel()
        if channel is None:
            return
        payload = json.dumps({"jobId": job_id, "event": event, "data": data})
        channel.basic_publish(
            exchange="",
            routing_key=STATUS_QUEUE_NAME,
            body=payload.encode("utf-8"),
            properties=pika.BasicProperties(delivery_mode=2),
        )
    except Exception as exc:  # noqa: BLE001 - deliberately broad, see docstring
        print(f"[status] could not emit event '{event}' for job {job_id}: {exc}")
