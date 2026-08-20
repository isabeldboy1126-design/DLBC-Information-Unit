"""
Centralized Runtime Storage and Configuration Resolver (Azure Container Apps / Cloud Ready)

Resolves runtime directories for SQLite databases, live WAV/PCM audio recordings,
uploaded media files, raw transcripts, and verified transcript JSONs.

Supports DATA_ROOT environment variable (e.g. DATA_ROOT=/data when mounted from Azure Files).
Falls back to local project 'storage/' directory for local development.
"""

import os

APP_DIR = os.path.dirname(os.path.abspath(__file__))               # backend/app
BACKEND_DIR = os.path.dirname(APP_DIR)                             # backend
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)                        # workspace root

# Top-level storage root: configurable via DATA_ROOT (e.g., /data in Azure Container Apps)
DATA_ROOT = os.getenv("DATA_ROOT", os.path.join(PROJECT_ROOT, "storage"))

# Subdirectories for data assets
STORAGE_AUDIO_DIR = os.path.join(DATA_ROOT, "audio")
STORAGE_UPLOADS_DIR = os.path.join(DATA_ROOT, "uploads")
STORAGE_TRANSCRIPTS_DIR = os.path.join(DATA_ROOT, "transcripts")
STORAGE_VERIFIED_DIR = os.path.join(DATA_ROOT, "verified_transcripts")
STORAGE_MODELS_DIR = os.path.join(DATA_ROOT, "models", "whisper")
DEFAULT_DB_PATH = os.path.join(DATA_ROOT, "app.db")

# Ensure all persistent directories exist
for directory in [
    DATA_ROOT,
    STORAGE_AUDIO_DIR,
    STORAGE_UPLOADS_DIR,
    STORAGE_TRANSCRIPTS_DIR,
    STORAGE_VERIFIED_DIR,
    STORAGE_MODELS_DIR,
]:
    os.makedirs(directory, exist_ok=True)
