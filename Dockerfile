FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
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

# Start both the backend and the worker
CMD ["sh", "-c", "cd backend && node src/app.js & python worker/main.py"]