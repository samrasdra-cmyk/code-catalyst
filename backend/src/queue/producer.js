const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const JOB_QUEUE_NAME = process.env.JOB_QUEUE_NAME || "codecatalyst_jobs";
const STATUS_QUEUE_NAME = process.env.STATUS_QUEUE_NAME || "codecatalyst_status";

// ─── Publisher (Node → Python) ───────────────────────────────────────────────
// Uses its own connection so it never shares a channel with the consumer.

let pubConnection = null;
let pubChannel = null;

async function getPubChannel() {
  if (pubChannel && pubChannel.connection) return pubChannel;

  pubConnection = await amqp.connect(RABBITMQ_URL);
  pubChannel = await pubConnection.createChannel();
  await pubChannel.assertQueue(JOB_QUEUE_NAME, { durable: true });

  pubConnection.on("error", (err) => {
    console.warn("[queue/pub] connection error:", err.message);
    pubChannel = null;
    pubConnection = null;
  });
  pubConnection.on("close", () => {
    console.warn("[queue/pub] connection closed, will reconnect on next publish");
    pubChannel = null;
    pubConnection = null;
  });

  return pubChannel;
}

/**
 * Publishes a repo-analysis job to the worker queue.
 * jobId lets the frontend subscribe to just this job's socket room.
 */
async function publishJob(jobId, repoUrl, instruction) {
  const ch = await getPubChannel();
  const message = {
    jobId,
    repo_url: repoUrl,
    instruction: instruction || "Analyze and suggest a migration plan",
    created_at: new Date().toISOString(),
  };

  ch.sendToQueue(JOB_QUEUE_NAME, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });

  console.log(`[queue/pub] Job ${jobId} published to '${JOB_QUEUE_NAME}'`);
  return message;
}

// ─── Consumer (Python → Node) ────────────────────────────────────────────────
// Uses its OWN separate connection — AMQP best practice: one connection per
// role (publisher vs consumer) to avoid channel-flow conflicts.

let subConnection = null;
let subChannel = null;

/**
 * Connects to RabbitMQ and starts consuming status events from the worker.
 * Invokes onEvent(payload) for each message. Retries on failure.
 */
async function consumeStatusEvents(onEvent) {
  // Tear down stale connections before reconnecting
  try { if (subChannel) await subChannel.close(); } catch (_) {}
  try { if (subConnection) await subConnection.close(); } catch (_) {}
  subChannel = null;
  subConnection = null;

  subConnection = await amqp.connect(RABBITMQ_URL);
  subChannel = await subConnection.createChannel();
  await subChannel.assertQueue(STATUS_QUEUE_NAME, { durable: true });
  await subChannel.assertQueue(JOB_QUEUE_NAME, { durable: true });

  subConnection.on("error", (err) => {
    console.warn("[queue/sub] connection error:", err.message);
    subChannel = null;
    subConnection = null;
  });
  subConnection.on("close", () => {
    console.warn("[queue/sub] connection closed");
    subChannel = null;
    subConnection = null;
  });

  await subChannel.consume(STATUS_QUEUE_NAME, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      onEvent(payload);
    } catch (err) {
      console.error("[queue/sub] failed to parse status event:", err);
    } finally {
      subChannel.ack(msg);
    }
  });

  console.log(`[queue/sub] Listening on '${STATUS_QUEUE_NAME}' for worker status events`);
}

module.exports = { publishJob, consumeStatusEvents, JOB_QUEUE_NAME, STATUS_QUEUE_NAME };
