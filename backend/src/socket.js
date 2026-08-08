const { Server } = require("socket.io");

let io = null;
const JOB_EVENT_TTL_MS = 10 * 60 * 1000;
const MAX_BUFFERED_EVENTS = 200;
const jobEventBuffer = new Map();

function bufferJobEvent(jobId, eventName, payload) {
  if (!jobId) return;

  const now = Date.now();
  const entry = jobEventBuffer.get(jobId) || {
    events: [],
    cleanupTimer: null,
  };

  entry.events.push({ eventName, payload, timestamp: now });
  if (entry.events.length > MAX_BUFFERED_EVENTS) {
    entry.events.shift();
  }

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
  }
  entry.cleanupTimer = setTimeout(() => {
    jobEventBuffer.delete(jobId);
  }, JOB_EVENT_TTL_MS);

  jobEventBuffer.set(jobId, entry);
}

function replayBufferedEvents(socket, jobId) {
  const entry = jobEventBuffer.get(jobId);
  if (!entry || entry.events.length === 0) return;

  entry.events.forEach(({ eventName, payload }) => {
    socket.emit(eventName, payload);
  });
}

/**
 * Initialize the Socket.IO server on top of an existing HTTP server.
 * Rooms are keyed by jobId so multiple concurrent repo analyses
 * don't leak logs into each other's browser tabs.
 */
function initSocket(httpServer, frontendOrigin) {
  io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin || "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    socket.on("join_job", (jobId) => {
      socket.join(jobId);
      console.log(`[socket] ${socket.id} joined room ${jobId}`);
      replayBufferedEvents(socket, jobId);
    });

    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Called by the RabbitMQ status consumer whenever the Python worker
 * publishes an agent_status event. Forwards it straight to the
 * browser room for that job.
 */
function emitJobEvent(jobId, eventName, payload) {
  if (!io) return;
  bufferJobEvent(jobId, eventName, payload);
  io.to(jobId).emit(eventName, payload);
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

module.exports = { initSocket, emitJobEvent, getIO };
