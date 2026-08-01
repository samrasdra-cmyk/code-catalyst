"""
Thin wrapper around pika for publishing agent_status events onto the
STATUS_QUEUE_NAME queue. The Node backend consumes this queue and
forwards each event to the right Socket.IO room by job_id.
"""

import json
import os
import pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
STATUS_QUEUE_NAME = os.getenv("STATUS_QUEUE_NAME", "codecatalyst_status")

_connection = None
_channel = None


import time

_last_failed_time = 0


def _get_channel():
    global _connection, _channel, _last_failed_time
    if _channel and _channel.is_open:
        return _channel

    # If connection failed within last 5 seconds, don't block trying again immediately
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
    Publish a status event. Never raises - if RabbitMQ is unreachable
    the worker should keep running the graph and just skip live
    updates rather than crashing the whole job.
    """
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
