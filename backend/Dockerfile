FROM python:3.11-slim

# Install system dependencies, ffmpeg, curl, and Microsoft ODBC Driver 18 for Azure SQL connectivity
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    gnupg2 \
    build-essential \
    unixodbc \
    unixodbc-dev \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,arm64,armhf signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Ensure runtime storage directories exist
RUN mkdir -p storage/audio storage/uploads storage/transcripts storage/verified_transcripts

# Default port
ENV PORT=8000
EXPOSE 8000

# Run FastAPI backend with uvicorn
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
