"""
Central Gemini Gateway & Failover Service for DLBC Information Unit App.

Provides resilient, single-attempt failover between primary and backup Gemini projects:
- PRIMARY: GEMINI_API_KEY (mandatory for normal operation)
- BACKUP:  GEMINI_BACKUP_KEY (optional secondary project)

Failover Rules:
1. Primary is always attempted first (1 attempt).
2. Failover occurs ONLY for transient provider/quota conditions:
   - HTTP 429 / RESOURCE_EXHAUSTED / Rate limit / Quota exceeded
   - HTTP 500 / 502 / 503 / 504 / UNAVAILABLE / DEADLINE_EXCEEDED / INTERNAL
   - Provider timeouts / Network connection failures
3. Programming, schema, validation, or client errors (HTTP 400, 401, 403, 404)
   do NOT failover to backup (to prevent wasting backup quota on broken requests).
4. No aggressive retry loops. At most 1 primary + 1 backup attempt.
5. All secrets, keys, and transcripts are strictly redacted from logs and errors.
"""

import os
import re
import time
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("app.services.gemini_gateway")


# -----------------------------------------------------------------------------
# Gateway Exceptions
# -----------------------------------------------------------------------------

class GeminiGatewayError(Exception):
    """Base exception for all Gemini Gateway operations."""
    pass


class GeminiConfigError(GeminiGatewayError):
    """Raised when required credentials are missing or unconfigured."""
    pass


class GeminiRequestError(GeminiGatewayError):
    """Raised for non-retryable client/programming errors (HTTP 400, schema, etc.)."""
    def __init__(self, message: str, category: str = "client_error", cause: Optional[Exception] = None):
        super().__init__(message)
        self.category = category
        self.cause = cause


class GeminiUnavailableError(GeminiGatewayError):
    """Raised when Gemini is unavailable (e.g. quota exhausted or all providers failed)."""
    def __init__(self, message: str, primary_category: Optional[str] = None, backup_category: Optional[str] = None):
        super().__init__(message)
        self.primary_category = primary_category
        self.backup_category = backup_category


# -----------------------------------------------------------------------------
# Gateway Response Container
# -----------------------------------------------------------------------------

@dataclass
class GatewayResponse:
    """Holds the raw Gemini SDK response along with safe internal metadata."""
    response: Any
    provider_slot: str  # 'primary' | 'backup'
    model_name: str
    latency_ms: float
    attempts: int

    @property
    def text(self) -> Optional[str]:
        t = getattr(self.response, "text", None)
        if t:
            return t
        try:
            if hasattr(self.response, "candidates") and self.response.candidates:
                cand = self.response.candidates[0]
                if cand.content and cand.content.parts:
                    part_texts = []
                    for p in cand.content.parts:
                        if getattr(p, "text", None):
                            part_texts.append(p.text)
                        elif getattr(p, "audio_transcription", None) and getattr(p.audio_transcription, "text", None):
                            part_texts.append(p.audio_transcription.text)
                    if part_texts:
                        return "".join(part_texts)
        except Exception:
            pass
        return None


# -----------------------------------------------------------------------------
# Error Sanitizer & Classifier
# -----------------------------------------------------------------------------

def sanitize_message(text: Any, keys: Optional[List[str]] = None) -> str:
    """Guarantees that no API keys or Google auth query parameters leak in logs or errors."""
    s = str(text)
    if keys:
        for k in keys:
            if k and len(k) > 5:
                s = s.replace(k, "[REDACTED_KEY]")
    s = re.sub(r"(key=)[A-Za-z0-9_\-]+", r"\1[REDACTED]", s)
    s = re.sub(r"AIza[A-Za-z0-9_\-]{20,}", "[REDACTED_API_KEY]", s)
    return s


def classify_gemini_error(e: Exception) -> Tuple[bool, str]:
    """
    Classifies a Gemini exception.
    Returns (is_failover_eligible, category_name)
    """
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    status = getattr(e, "status", None)
    err_str = str(e).lower()
    err_type = type(e).__name__.lower()

    # 1. Quota / Rate limit (HTTP 429, RESOURCE_EXHAUSTED) -> FAILOVER
    if (
        code == 429
        or status == "RESOURCE_EXHAUSTED"
        or "429" in err_str
        or "resource_exhausted" in err_str
        or "resourceexhausted" in err_str
        or "quota exceeded" in err_str
        or "quota_exceeded" in err_str
        or "rate limit" in err_str
        or "rate_limit" in err_str
        or "too many requests" in err_str
    ):
        return True, "quota_exceeded_429"

    # 2. Server transient unavailability (500, 502, 503, 504) -> FAILOVER
    if code in (500, 502, 503, 504) or status in ("UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL"):
        return True, f"server_error_{code or status}"
    if "service unavailable" in err_str or "503 unavailable" in err_str or "deadline exceeded" in err_str:
        return True, "server_unavailable_503"

    # 3. Timeouts & Connection/Network faults -> FAILOVER
    if isinstance(e, (TimeoutError, ConnectionError)) or "timeout" in err_type or "connection" in err_type or "network" in err_type:
        return True, "timeout_or_network"

    try:
        import httpx
        if isinstance(e, (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError)):
            return True, "network_error"
    except ImportError:
        pass

    # 4. Client / Programming / Non-retryable errors -> NO FAILOVER
    # HTTP 400 (Bad Request, invalid schema, malformed contents)
    if code == 400 or "400" in err_str or "invalid argument" in err_str or "invalid_argument" in err_str:
        return False, "bad_request_400"

    # HTTP 401 / 403 (Invalid key, unauthorized, permission denied)
    if code in (401, 403) or "unauthenticated" in err_str or "permission_denied" in err_str:
        return False, f"auth_error_{code}"

    # HTTP 404 (Model not found due to bad model name configuration)
    if code == 404 or "not found" in err_str or "not_found" in err_str:
        return False, "not_found_404"

    # Application bugs
    if isinstance(e, (ValueError, TypeError, KeyError, AttributeError)):
        return False, "application_error"

    # Default fallback: Treat unknown exceptions as non-failover
    return False, "unclassified_error"


# -----------------------------------------------------------------------------
# Central Gemini Gateway
# -----------------------------------------------------------------------------

class GeminiGateway:
    """
    Central gateway managing primary and backup Google GenAI clients.
    """

    def __init__(self):
        self._primary_client = None
        self._backup_client = None
        self._cached_primary_key = None
        self._cached_backup_key = None

    def _get_primary_key(self) -> str:
        return os.getenv("GEMINI_API_KEY", "").strip()

    def _get_backup_key(self) -> str:
        return os.getenv("GEMINI_BACKUP_KEY", "").strip()

    def is_configured(self) -> bool:
        """True if the mandatory primary Gemini API key is configured."""
        return bool(self._get_primary_key())

    def has_backup(self) -> bool:
        """True if an optional backup Gemini API key is configured."""
        return bool(self._get_backup_key())

    def get_status(self) -> Dict[str, Any]:
        """Returns safe diagnostic status without credentials."""
        return {
            "provider": "gemini",
            "primary_configured": self.is_configured(),
            "backup_configured": self.has_backup(),
        }

    def _get_active_keys(self) -> List[str]:
        return [k for k in [self._get_primary_key(), self._get_backup_key()] if k]

    def _get_client(self, slot: str = "primary"):
        """
        Lazily gets or instantiates the google.genai Client for the given slot.
        Re-instantiates if the underlying environment variable changes (e.g. during tests).
        """
        from google import genai
        from google.genai import types

        if slot == "primary":
            key = self._get_primary_key()
            if not key:
                raise GeminiConfigError("AI Reporting is not configured. GEMINI_API_KEY is not set.")
            if self._primary_client is None or self._cached_primary_key != key:
                self._primary_client = genai.Client(
                    api_key=key,
                    http_options=types.HttpOptions(timeout=120000),
                )
                self._cached_primary_key = key
            return self._primary_client

        elif slot == "backup":
            key = self._get_backup_key()
            if not key:
                raise GeminiConfigError("GEMINI_BACKUP_KEY is not configured.")
            if self._backup_client is None or self._cached_backup_key != key:
                self._backup_client = genai.Client(
                    api_key=key,
                    http_options=types.HttpOptions(timeout=120000),
                )
                self._cached_backup_key = key
            return self._backup_client

        raise ValueError(f"Unknown provider slot: {slot}")

    async def generate(
        self,
        operation: str,
        model: str,
        contents: Any,
        config: Optional[Any] = None,
    ) -> GatewayResponse:
        """
        Executes a Gemini generate_content request with automatic primary-to-backup failover.

        - Primary attempted first (1 attempt).
        - If failover-eligible error occurs and backup is configured:
          Backup is attempted with the EXACT SAME request configuration (1 attempt).
        - If non-retryable error occurs: raises GeminiRequestError without calling backup.
        """
        active_keys = self._get_active_keys()

        # Step 1: Ensure primary is configured
        if not self.is_configured():
            raise GeminiConfigError("AI Reporting is not configured. GEMINI_API_KEY environment variable is not set.")

        primary_client = self._get_client("primary")
        start_time = time.perf_counter()

        # Step 2: Attempt PRIMARY
        try:
            resp = await primary_client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            logger.info(
                "Gemini request succeeded via primary (operation=%s, model=%s, latency=%.0fms)",
                operation,
                model,
                latency_ms,
            )
            return GatewayResponse(
                response=resp,
                provider_slot="primary",
                model_name=model,
                latency_ms=latency_ms,
                attempts=1,
            )
        except Exception as primary_err:
            is_eligible, err_category = classify_gemini_error(primary_err)
            sanitized_primary_msg = sanitize_message(primary_err, active_keys)

            # If not failover eligible (e.g. 400 Bad Request, schema error, 404): DO NOT attempt backup
            if not is_eligible:
                logger.error(
                    "Primary Gemini failed with non-failover error [%s]: %s (operation=%s, model=%s)",
                    err_category,
                    sanitized_primary_msg,
                    operation,
                    model,
                )
                raise GeminiRequestError(
                    f"Gemini request failed ({err_category}): {sanitized_primary_msg}",
                    category=err_category,
                    cause=primary_err,
                )

            # Failover eligible: Check backup key presence
            if not self.has_backup():
                logger.warning(
                    "Primary Gemini quota/service unavailable [%s]; no backup key configured. (operation=%s, model=%s)",
                    err_category,
                    operation,
                    model,
                )
                raise GeminiUnavailableError(
                    f"Gemini service unavailable ({err_category}) and no backup configured.",
                    primary_category=err_category,
                )

            logger.warning(
                "Primary Gemini quota unavailable [%s]; attempting configured backup (operation=%s, model=%s)",
                err_category,
                operation,
                model,
            )

        # Step 3: Attempt BACKUP with EXACT SAME parameters
        backup_client = self._get_client("backup")
        backup_start_time = time.perf_counter()

        try:
            resp = await backup_client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            backup_latency_ms = (time.perf_counter() - backup_start_time) * 1000.0
            logger.info(
                "Gemini request succeeded via backup (operation=%s, model=%s, latency=%.0fms)",
                operation,
                model,
                backup_latency_ms,
            )
            return GatewayResponse(
                response=resp,
                provider_slot="backup",
                model_name=model,
                latency_ms=backup_latency_ms,
                attempts=2,
            )
        except Exception as backup_err:
            _, backup_cat = classify_gemini_error(backup_err)
            sanitized_backup_msg = sanitize_message(backup_err, active_keys)
            logger.error(
                "Both Gemini providers unavailable (operation=%s, model=%s). Backup failed [%s]: %s",
                operation,
                model,
                backup_cat,
                sanitized_backup_msg,
            )
            raise GeminiUnavailableError(
                f"Both Gemini providers unavailable (primary: {err_category}, backup: {backup_cat}).",
                primary_category=err_category,
                backup_category=backup_cat,
            )

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        mime_type: str = "audio/wav",
        model: str = "gemini-3.5-transcribe",
    ) -> GatewayResponse:
        """
        Executes an audio transcription request using Gemini 3.5 Transcribe
        with automatic primary-to-backup failover and safe transcript extraction.
        """
        from google.genai import types

        part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        return await self.generate(
            operation="audio_transcription",
            model=model,
            contents=[part],
        )


# Global singleton instance
gemini_gateway = GeminiGateway()


def get_gemini_gateway() -> GeminiGateway:
    return gemini_gateway
