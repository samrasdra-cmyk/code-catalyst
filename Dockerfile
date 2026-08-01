FROM python:3.10-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies and RabbitMQ/supervisor for multi-process deployment
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    supervisor \
    rabbitmq-server \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies for your worker
COPY worker/requirements.txt worker/
RUN pip install --no-cache-dir -r worker/requirements.txt

# Copy and install Node dependencies for your backend
COPY backend/package*.json backend/
RUN cd backend && npm install

# Copy the rest of the application code
COPY . .

# Build the React frontend
RUN cd frontend && npm install && npm run build

# Copy the build to the backend's static directory
RUN mkdir -p backend/public && cp -r frontend/build/* backend/public/

# Default container start command for Render
CMD ["supervisord", "-c", "supervisord.conf"]