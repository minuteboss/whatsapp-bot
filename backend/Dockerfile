# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app

# Create media directory
RUN mkdir -p /app/media && chown -R appuser:appuser /app/media

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
