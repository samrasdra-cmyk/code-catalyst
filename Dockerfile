# CodeCatalyst Render / Single-Container Production Dockerfile
FROM node:18-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV QUEUE_MODE=inline
ENV ENABLE_RAG_INDEXING=false
ENV PYTHONUNBUFFERED=1
ENV PORT=10000
ENV HOST=0.0.0.0

# Prevent React build from freezing/OOM on Render's 512MB build server
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true

# Install Python 3, Pip, and Git for the inline worker
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install lightweight Python dependencies
COPY worker/requirements.render.txt worker/
RUN pip3 install --no-cache-dir -r worker/requirements.render.txt

# Install backend dependencies
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

# Copy application source
COPY . .

# Build React frontend with sourcemaps disabled for 5x faster compilation
RUN cd frontend && npm install && npm run build

# Copy React build to backend public folder for static serving
RUN mkdir -p backend/public && cp -r frontend/build/* backend/public/

WORKDIR /app/backend
EXPOSE 10000

CMD ["node", "src/app.js"]
