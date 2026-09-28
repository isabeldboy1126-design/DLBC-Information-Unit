"""
Service layer package for the DLBC Information Unit App.

Contains provider abstractions and services for speech transcription,
Gemini failover gateway, reporting, and local KJV biblical context.
"""

from app.services.bible_context_service import (
    BibleContextService,
    bible_context_service,
    get_bible_context_service,
)
from app.services.gemini_gateway import gemini_gateway, GeminiGateway

__all__ = [
    "BibleContextService",
    "bible_context_service",
    "get_bible_context_service",
    "gemini_gateway",
    "GeminiGateway",
]

