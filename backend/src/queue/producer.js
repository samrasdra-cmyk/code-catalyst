const amqp = require("amqplib");
const {
  CONNECT_TIMEOUT_MS,
  getRabbitMQUrl,
  getQueueMode,
  JOB_QUEUE_NAME,
  STATUS_QUEUE_NAME,
} = require("./config");
const { publishJobInline } = require("./inline");

let activeMode = getQueueMode();
let rabbitReady = false;

// ─── Publisher (Node → Python) ───────────────────────────────────────────────

let pubConnection = null;
let pubChannel = null;

function connectWithTimeout(url) {
  return Promise.race([
    amqp.connect(url, { timeout: CONNECT_TIMEOUT_MS }),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`RabbitMQ connection timed out after ${CONNECT_TIMEOUT_MS}ms`)),
        CONNECT_TIMEOUT_MS
      );
    }),
  ]);
}

async function getPubChannel() {
  const url = getRabbitMQUrl();
  if (!url) {
    throw new Error("RabbitMQ URL is not configured");
  }

  if (pubChannel && pubChannel.connection) return pubChannel;

  pubConnection = await connectWithTimeout(url);
  pubChannel = await pubConnection.createChannel();
  await pubChannel.assertQueue(JOB_QUEUE_NAME, { durable: true });
  rabbitReady = true;

  pubConnection.on("error", (err) => {
    console.warn("[queue/pub] connection error:", err.message);
    pubChannel = null;
    pubConnection = null;
    rabbitReady = false;
  });
  pubConnection.on("close", () => {
    console.warn("[queue/pub] connection closed, will reconnect on next publish");
    pubChannel = null;
    pubConnection = null;
    rabbitReady = false;
  });

  return pubChannel;
}

async function publishJobRabbitMQ(jobId, repoUrl, instruction) {
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

  console.log(`[queue/rabbitmq] Job ${jobId} published to '${JOB_QUEUE_NAME}'`);
  return message;
}

async function publishJob(jobId, repoUrl, instruction, port) {
  if (activeMode === "inline") {
    return publishJobInline(jobId, repoUrl, instruction, port);
  }

  try {
    return await publishJobRabbitMQ(jobId, repoUrl, instruction);
  } catch (err) {
    console.warn(`[queue] RabbitMQ publish failed (${err.message}), falling back to inline worker`);
    activeMode = "inline";
    return publishJobInline(jobId, repoUrl, instruction, port);
  }
}

// ─── Consumer (Python → Node) ────────────────────────────────────────────────

let subConnection = null;
let subChannel = null;

async function consumeStatusEvents(onEvent) {
  if (activeMode === "inline") {
    console.log("[queue/sub] Inline mode active — status events arrive via /internal/status");
    return;
  }

  const url = getRabbitMQUrl();
  if (!url) {
    throw new Error("RabbitMQ URL is not configured");
  }

  try { if (subChannel) await subChannel.close(); } catch (_) {}
  try { if (subConnection) await subConnection.close(); } catch (_) {}
  subChannel = null;
  subConnection = null;

  subConnection = await connectWithTimeout(url);
  subChannel = await subConnection.createChannel();
  await subChannel.assertQueue(STATUS_QUEUE_NAME, { durable: true });
  await subChannel.assertQueue(JOB_QUEUE_NAME, { durable: true });
  rabbitReady = true;

  subConnection.on("error", (err) => {
    console.warn("[queue/sub] connection error:", err.message);
    subChannel = null;
    subConnection = null;
    rabbitReady = false;
  });
  subConnection.on("close", () => {
    console.warn("[queue/sub] connection closed");
    subChannel = null;
    subConnection = null;
    rabbitReady = false;
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

async function initQueueMode() {
  if (activeMode === "inline") {
    console.log("[queue] Using inline worker mode (no RabbitMQ required)");
    return activeMode;
  }

  const url = getRabbitMQUrl();
  if (!url) {
    activeMode = "inline";
    console.log("[queue] No RabbitMQ URL configured — using inline worker mode");
    return activeMode;
  }

  try {
    const conn = await connectWithTimeout(url);
    await conn.close();
    rabbitReady = true;
    console.log("[queue] RabbitMQ reachable — using rabbitmq mode");
    return activeMode;
  } catch (err) {
    activeMode = "inline";
    rabbitReady = false;
    console.warn(`[queue] RabbitMQ unavailable (${err.message}) — using inline worker mode`);
    return activeMode;
  }
}

function getQueueStatus() {
  return {
    mode: activeMode,
    rabbitmqReady: rabbitReady,
    rabbitmqUrlConfigured: Boolean(getRabbitMQUrl()),
  };
}

module.exports = {
  publishJob,
  consumeStatusEvents,
  initQueueMode,
  getQueueStatus,
  JOB_QUEUE_NAME,
  STATUS_QUEUE_NAME,
};
