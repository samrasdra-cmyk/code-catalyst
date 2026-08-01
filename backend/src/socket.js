const { Server } = require("socket.io");

let io = null;

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
  io.to(jobId).emit(eventName, payload);
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

module.exports = { initSocket, emitJobEvent, getIO };
