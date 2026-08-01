import { io } from "socket.io-client";

// In production: use the current domain (where the page is served from)
// In development: fallback to localhost:5000
const SOCKET_URL = process.env.NODE_ENV === 'production' 
    ? window.location.origin  // This becomes "https://codecatalyst.onrender.com"
    : (process.env.REACT_APP_SOCKET_URL || "http://localhost:5000");

// Single shared socket instance for the whole app
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
});