FROM python:3.10-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install Node for frontend build
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies for the worker
COPY worker/requirements.txt worker/
RUN pip install --no-cache-dir -r worker/requirements.txt

# Copy and install Node dependencies for the backend
COPY backend/package*.json backend/
RUN cd backend && npm install

# Copy the rest of the application code
COPY . .

# Build the React frontend
RUN cd frontend && npm install && npm run build

# Copy the frontend build into the backend static assets
RUN mkdir -p backend/public && cp -r frontend/build/* backend/public/

# Default start command for the web service
CMD ["node", "backend/src/app.js"]