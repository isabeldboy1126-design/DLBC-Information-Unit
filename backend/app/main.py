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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    print("DLBC Information Unit App backend starting...")
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

app.include_router(audio_router)


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
