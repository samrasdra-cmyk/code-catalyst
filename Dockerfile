FROM python:3.10-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install Node for frontend build, and supervisor to run backend+worker together
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    git \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies for the worker
COPY worker/requirements.txt worker/
RUN pip install --no-cache-dir -r worker/requirements.txt

# Copy and install Node dependencies for the backend
COPY backend/package*.json backend/
RUN cd backend && npm install

# Copy the rest of the application code
COPY . .

# Accept Render's env vars as build args so Create React App can bake them in
ARG REACT_APP_API_URL
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_SOCKET_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_SOCKET_URL=$REACT_APP_SOCKET_URL

# Build the React frontend
RUN cd frontend && npm install && npm run build

# Copy the frontend build into the backend static assets
RUN mkdir -p backend/public && cp -r frontend/build/* backend/public/

# Run backend + worker together in this single (free) web service via supervisord
CMD ["supervisord", "-c", "/app/supervisord.conf"]
