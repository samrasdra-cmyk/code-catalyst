const CONNECT_TIMEOUT_MS = parseInt(
  process.env.RABBITMQ_CONNECT_TIMEOUT_MS || "8000",
  10
);

function getRabbitMQUrl() {
  if (process.env.RABBITMQ_URL) {
    return process.env.RABBITMQ_URL;
  }

  const host = process.env.RABBITMQ_HOST;
  if (!host) {
    return null;
  }

  const port = process.env.RABBITMQ_PORT || "5672";
  const user = encodeURIComponent(process.env.RABBITMQ_USER || "guest");
  const pass = encodeURIComponent(process.env.RABBITMQ_PASS || "guest");
  return `amqp://${user}:${pass}@${host}:${port}`;
}

function getQueueMode() {
  const configured = (process.env.QUEUE_MODE || "").toLowerCase();
  if (configured === "inline" || configured === "rabbitmq") {
    return configured;
  }
  return getRabbitMQUrl() ? "rabbitmq" : "inline";
}

module.exports = {
  CONNECT_TIMEOUT_MS,
  getRabbitMQUrl,
  getQueueMode,
  JOB_QUEUE_NAME: process.env.JOB_QUEUE_NAME || "codecatalyst_jobs",
  STATUS_QUEUE_NAME: process.env.STATUS_QUEUE_NAME || "codecatalyst_status",
};
