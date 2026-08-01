import { io } from "socket.io-client";

// Use environment variable or fallback to same origin in production
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 
                   (process.env.NODE_ENV === 'production' 
                     ? window.location.origin 
                     : 'http://localhost:5000');

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
});