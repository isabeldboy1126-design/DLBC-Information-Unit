"""
DLBC Information Unit App — FastAPI Application Entry Point

Provides the FastAPI application instance and core configuration.
Phase 0: Health-check endpoint only.
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file
load_dotenv()
_backend_env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(_backend_env_path):
    load_dotenv(_backend_env_path)


from app.database.session_repo import session_repo
from app.database.programmes_repo import programmes_repo
from app.database.interruption_recovery import recover_interrupted_sessions
from app.database.account_repo import account_repo
from app.database.device_repo import device_repo

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    print("DLBC Information Unit App backend starting...")
    try:
        await account_repo.init_db()
        await session_repo.init_db()
        await programmes_repo.init_db()
        await device_repo.init_db()
        from app.database.report_processing_repo import report_processing_repo
        await report_processing_repo.init_db()
        await session_repo.index_existing_storage_files()
        await recover_interrupted_sessions()
        print("Database, Accounts, and Session persistence initialized.")
    except Exception as e:
        print(f"Database startup initialization error: {e}")

    yield
    # Shutdown
    print("DLBC Information Unit App backend shutting down...")


app = FastAPI(
    title="DLBC Information Unit App",
    description="Backend API for the DLBC Information Unit App",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration — allow local dev servers, Tauri desktop, Capacitor, and Vercel domains
cors_origins_env = os.getenv("CORS_ORIGINS", "")
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost",
    "https://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "capacitor://localhost",
]
if cors_origins_env:
    for origin in cors_origins_env.split(","):
        origin = origin.strip()
        if origin and origin not in allowed_origins:
            allowed_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"(https://.*\.vercel\.app|^(https?|tauri)://.*localhost(:\d+)?$)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.auth.router import router as auth_router
from app.audio.router import router as audio_router
from app.transcription.router import router as transcription_router
from app.sessions.router import router as sessions_router
from app.verification.router import router as verification_router
from app.reporting.router import router as reporting_router
from app.editing.router import router as editing_router
from app.proofreading.router import router as proofreading_router
from app.final_report.router import router as final_report_router
from app.programmes.router import router as programmes_router
from app.youtube.router import router as youtube_router
from app.report_processing.router import router as report_processing_router
from app.remote.router import router as remote_router

app.include_router(auth_router)
app.include_router(audio_router)
app.include_router(transcription_router)
app.include_router(verification_router)
app.include_router(sessions_router)
app.include_router(reporting_router)
app.include_router(editing_router)
app.include_router(proofreading_router)
app.include_router(final_report_router)
app.include_router(programmes_router)
app.include_router(youtube_router)
app.include_router(report_processing_router)
app.include_router(remote_router)



from fastapi.responses import FileResponse
from fastapi import HTTPException

@app.get("/api/download/android")
async def download_android_apk():
    """
    Directly serve the compiled Android APK installer.
    """
    candidate_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "DLBC-Information-Unit.apk")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")),
    ]
    for apk_path in candidate_paths:
        if os.path.exists(apk_path):
            return FileResponse(
                path=apk_path,
                filename="DLBC-Information-Unit.apk",
                media_type="application/vnd.android.package-archive"
            )
    raise HTTPException(status_code=404, detail="Android APK build not found")


@app.get("/api/health")
async def health_check():
    """
    Health-check endpoint.

    Returns basic application status to verify the backend is running
    and can be reached by the frontend.
    """
    return {
        "status": "healthy",
        "application": "DLBC Information Unit App",
        "version": "0.1.0",
        "environment": os.getenv("APP_ENV", "development"),
    }
