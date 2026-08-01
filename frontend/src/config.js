// frontend/src/config.js
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 
                          (process.env.NODE_ENV === 'production' 
                            ? window.location.origin 
                            : 'http://localhost:5000');