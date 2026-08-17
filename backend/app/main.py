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


from app.database.session_repo import session_repo
from app.database.interruption_recovery import recover_interrupted_sessions

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    print("DLBC Information Unit App backend starting...")
    try:
        await session_repo.init_db()
        await session_repo.index_existing_storage_files()
        await recover_interrupted_sessions()
        print("SQLite Database and Session persistence initialized.")
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

# CORS configuration — allow the Vite dev server during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default dev server
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.audio.router import router as audio_router
from app.transcription.router import router as transcription_router
from app.sessions.router import router as sessions_router
from app.verification.router import router as verification_router
from app.reporting.router import router as reporting_router
from app.editing.router import router as editing_router
from app.proofreading.router import router as proofreading_router

app.include_router(audio_router)
app.include_router(transcription_router)
app.include_router(sessions_router)
app.include_router(verification_router)
app.include_router(reporting_router)
app.include_router(editing_router)
app.include_router(proofreading_router)



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
