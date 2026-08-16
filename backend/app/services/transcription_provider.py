"""
Transcription Provider Abstraction

Defines standard data structures and interfaces for transcription services.
Enables provider swaps (Google Cloud Speech, Whisper, AssemblyAI, etc.)
without altering application business logic.
"""

from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field


class SegmentFlag(BaseModel):
    """A flag associated with a segment for low confidence, terminology checks, or manual review."""
    flag_id: str = Field(..., description="Unique flag identifier")
    flag_type: str = Field("low_confidence", description="Flag category: 'low_confidence', 'manual_flag', 'unclear_audio'")
    confidence: Optional[float] = Field(None, description="Confidence score associated with this flag (0.0 to 1.0)")
    reason: Optional[str] = Field(None, description="Reason or threshold description for the flag")
    is_verified: bool = Field(False, description="Whether this flag has been reviewed and verified")
    verified_by: Optional[str] = Field(None, description="User or role who verified this flag")
    verified_at: Optional[str] = Field(None, description="ISO timestamp of verification")
    notes: Optional[str] = Field(None, description="Optional reviewer notes")


class TranscriptionSegment(BaseModel):
    """A timestamped segment within the raw transcript."""
    start_time: float = Field(..., description="Start offset in seconds")
    end_time: float = Field(..., description="End offset in seconds")
    text: str = Field(..., description="Transcribed text content for this segment")
    confidence: Optional[float] = Field(None, description="Confidence score if provided by provider (0.0 to 1.0)")
    is_low_confidence: bool = Field(False, description="True if segment confidence is below quality threshold")
    flags: List[SegmentFlag] = Field(default_factory=list, description="Automated or manual verification flags")
    words: List[Dict[str, Any]] = Field(default_factory=list, description="Word-level timestamps and confidence offsets where supported")


class TranscriptionResult(BaseModel):
    """The normalized output produced by any TranscriptionProvider."""
    provider_name: str = Field(..., description="Identifier of the provider that produced this transcript")
    raw_text: str = Field(..., description="Complete unedited transcript text")
    segments: List[TranscriptionSegment] = Field(default_factory=list, description="Timestamped segments")
    duration_seconds: Optional[float] = Field(None, description="Total duration of processed audio in seconds")
    language_code: str = Field("en-US", description="Language code used for transcription")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Provider-specific diagnostic metadata")


class TranscriptionProvider(ABC):
    """Abstract interface for all transcription provider implementations."""

    @abstractmethod
    async def transcribe_audio(
        self,
        audio_file_path: str,
        language_code: str = "en-US",
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> TranscriptionResult:
        """
        Transcribes the given local audio file.

        Args:
            audio_file_path: Path to the local audio file to transcribe.
            language_code: BCP-47 language tag (e.g. 'en-US', 'en-GB').
            progress_callback: Optional async or sync callable for progress reporting (stage_name, percent).

        Returns:
            TranscriptionResult containing raw_text and timestamped segments.
        """
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider has all required credentials/configurations to operate."""
        pass

    @abstractmethod
    def get_configuration_instructions(self) -> str:
        """Returns clear, human-readable instructions on how to configure this provider."""
        pass
