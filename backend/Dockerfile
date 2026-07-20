# Shared image for both Python services (FastAPI data API + Flask LLM server).
# The compose file picks the command per service.
FROM python:3.12-slim

WORKDIR /app/backend

# deps first for better layer caching
COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

# app code (the DB in data/ is mounted at runtime, not baked in — see .dockerignore)
COPY . .

# FastAPI on 8000, Flask on 3000 (compose sets the actual command)
EXPOSE 8000 3000
