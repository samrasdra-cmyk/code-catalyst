const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
const JOB_QUEUE_NAME = process.env.JOB_QUEUE_NAME || "codecatalyst_jobs";
const STATUS_QUEUE_NAME = process.env.STATUS_QUEUE_NAME || "codecatalyst_status";

let connection = null;
let channel = null;

/**
 * Lazily connects to RabbitMQ and asserts both the job queue
 * (Node -> Python) and the status queue (Python -> Node) as durable,
 * so jobs survive a broker restart.
 */
async function getChannel() {
  if (channel) return channel;

  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertQueue(JOB_QUEUE_NAME, { durable: true });
  await channel.assertQueue(STATUS_QUEUE_NAME, { durable: true });

  connection.on("close", () => {
    console.warn("[queue] RabbitMQ connection closed, will reconnect on next publish");
    channel = null;
    connection = null;
  });

  return channel;
}

/**
 * Publishes a repo-analysis job to the worker queue.
 * jobId lets the frontend subscribe to just this job's socket room.
 */
async function publishJob(jobId, repoUrl, instruction) {
  const ch = await getChannel();
  const message = {
    jobId,
    repo_url: repoUrl,
    instruction: instruction || "Analyze and suggest a migration plan",
    created_at: new Date().toISOString(),
  };

  ch.sendToQueue(JOB_QUEUE_NAME, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });

  return message;
}

/**
 * Consumes status events published by the Python worker and invokes
 * the provided callback (typically socket.js's emitJobEvent) for each.
 */
async function consumeStatusEvents(onEvent) {
  const ch = await getChannel();
  await ch.consume(STATUS_QUEUE_NAME, (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      onEvent(payload);
    } catch (err) {
      console.error("[queue] failed to parse status event", err);
    } finally {
      ch.ack(msg);
    }
  });
}

module.exports = { publishJob, consumeStatusEvents, JOB_QUEUE_NAME, STATUS_QUEUE_NAME };
