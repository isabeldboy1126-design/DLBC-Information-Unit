"""
Automated Test Suite for Central GeminiGateway (Step 3)

Tests:
1. Primary success — backup is never called.
2. Primary 429/quota error — backup called exactly once and succeeds.
3. Primary 503/service unavailable error — backup is attempted.
4. Primary non-retryable 400 bad-request/programming error — backup is NOT called.
5. Primary failover-eligible failure + backup failure — clean GeminiUnavailableError produced.
6. Backup key absent — primary success works normally; primary 429 raises clean unavailable error without crash.
7. No secrets or API keys appear in logged errors or sanitized messages.
8. Unconfigured primary key raises GeminiConfigError.
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from google.genai.errors import APIError, ClientError, ServerError

from app.services.gemini_gateway import (
    GeminiGateway,
    GeminiGatewayError,
    GeminiConfigError,
    GeminiRequestError,
    GeminiUnavailableError,
    classify_gemini_error,
    sanitize_message,
)


@pytest.fixture
def mock_gateway():
    """Returns a fresh GeminiGateway instance with dummy keys configured."""
    gw = GeminiGateway()
    gw._get_primary_key = lambda: "fake-primary-key-12345"
    gw._get_backup_key = lambda: "fake-backup-key-67890"
    return gw


# -----------------------------------------------------------------------------
# 1. Primary Success
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_success_backup_never_called(mock_gateway):
    """When primary succeeds, backup client must never be invoked."""
    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    mock_resp = MagicMock()
    mock_resp.text = '{"report_title": "Test Title"}'
    mock_primary_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    mock_backup_client.aio.models.generate_content = AsyncMock()

    mock_gateway._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    result = await mock_gateway.generate(
        operation="test_primary",
        model="gemini-3.5-flash-lite",
        contents="Hello",
    )

    assert result.provider_slot == "primary"
    assert result.attempts == 1
    assert result.text == '{"report_title": "Test Title"}'
    mock_primary_client.aio.models.generate_content.assert_called_once()
    mock_backup_client.aio.models.generate_content.assert_not_called()


# -----------------------------------------------------------------------------
# 2. Primary 429 Quota Error -> Failover to Backup
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_429_quota_calls_backup_once_and_succeeds(mock_gateway):
    """When primary encounters 429 / quota error, backup is called exactly once and succeeds."""
    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    quota_err = ClientError(429, {"error": {"code": 429, "message": "Resource has been exhausted", "status": "RESOURCE_EXHAUSTED"}})
    mock_primary_client.aio.models.generate_content = AsyncMock(side_effect=quota_err)

    mock_resp = MagicMock()
    mock_resp.text = '{"report_title": "From Backup"}'
    mock_backup_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    mock_gateway._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    result = await mock_gateway.generate(
        operation="test_quota_failover",
        model="gemini-3.5-flash-lite",
        contents="Generate something",
    )

    assert result.provider_slot == "backup"
    assert result.attempts == 2
    assert result.text == '{"report_title": "From Backup"}'
    mock_primary_client.aio.models.generate_content.assert_called_once()
    mock_backup_client.aio.models.generate_content.assert_called_once()


# -----------------------------------------------------------------------------
# 3. Primary 503 Service Unavailable -> Attempts Backup
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_503_service_unavailable_attempts_backup(mock_gateway):
    """When primary receives 503 / ServerError, backup is attempted."""
    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    server_err = ServerError(503, {"error": {"code": 503, "message": "Service unavailable", "status": "UNAVAILABLE"}})
    mock_primary_client.aio.models.generate_content = AsyncMock(side_effect=server_err)

    mock_resp = MagicMock()
    mock_resp.text = "OK from backup"
    mock_backup_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    mock_gateway._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    result = await mock_gateway.generate(
        operation="test_503_failover",
        model="gemini-3.5-flash-lite",
        contents="Ping",
    )

    assert result.provider_slot == "backup"
    assert result.attempts == 2
    mock_primary_client.aio.models.generate_content.assert_called_once()
    mock_backup_client.aio.models.generate_content.assert_called_once()


# -----------------------------------------------------------------------------
# 4. Primary 400 Bad Request / Schema Error -> Backup is NOT called
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_400_bad_request_does_not_call_backup(mock_gateway):
    """Client/programming errors (400, invalid argument) must NOT failover to backup."""
    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    bad_request_err = ClientError(400, {"error": {"code": 400, "message": "Invalid schema argument", "status": "INVALID_ARGUMENT"}})
    mock_primary_client.aio.models.generate_content = AsyncMock(side_effect=bad_request_err)
    mock_backup_client.aio.models.generate_content = AsyncMock()

    mock_gateway._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    with pytest.raises(GeminiRequestError) as exc_info:
        await mock_gateway.generate(
            operation="test_bad_request",
            model="gemini-3.5-flash-lite",
            contents="Malformed request",
        )

    assert "bad_request" in exc_info.value.category
    mock_primary_client.aio.models.generate_content.assert_called_once()
    mock_backup_client.aio.models.generate_content.assert_not_called()


# -----------------------------------------------------------------------------
# 5. Primary and Backup Both Fail -> Clean GeminiUnavailableError
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_and_backup_both_fail_raises_clean_unavailable_error(mock_gateway):
    """When both primary and backup fail, raise one clean GeminiUnavailableError."""
    mock_primary_client = MagicMock()
    mock_backup_client = MagicMock()

    err1 = ClientError(429, {"error": {"code": 429, "message": "Primary quota exhausted", "status": "RESOURCE_EXHAUSTED"}})
    err2 = ClientError(429, {"error": {"code": 429, "message": "Backup quota exhausted", "status": "RESOURCE_EXHAUSTED"}})

    mock_primary_client.aio.models.generate_content = AsyncMock(side_effect=err1)
    mock_backup_client.aio.models.generate_content = AsyncMock(side_effect=err2)

    mock_gateway._get_client = lambda slot: mock_primary_client if slot == "primary" else mock_backup_client

    with pytest.raises(GeminiUnavailableError) as exc_info:
        await mock_gateway.generate(
            operation="test_both_fail",
            model="gemini-3.5-flash-lite",
            contents="Try failover",
        )

    assert "Both Gemini providers unavailable" in str(exc_info.value)
    mock_primary_client.aio.models.generate_content.assert_called_once()
    mock_backup_client.aio.models.generate_content.assert_called_once()


# -----------------------------------------------------------------------------
# 6. Backup Key Absent
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_backup_key_absent_primary_works_and_quota_raises_cleanly():
    """If backup key is absent, primary works normally; on 429, raises clean error without crash."""
    gw = GeminiGateway()
    gw._get_primary_key = lambda: "fake-primary-key"
    gw._get_backup_key = lambda: ""  # Absent backup

    assert gw.is_configured() is True
    assert gw.has_backup() is False

    mock_client = MagicMock()
    gw._get_client = lambda slot: mock_client

    # A. Primary success works normally
    mock_resp = MagicMock()
    mock_resp.text = "Success"
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    res = await gw.generate(operation="test_no_backup", model="gemini-3.5-flash-lite", contents="Hi")
    assert res.provider_slot == "primary"
    assert res.attempts == 1

    # B. Primary 429 quota failure raises GeminiUnavailableError without attempting missing backup
    quota_err = ClientError(429, {"error": {"code": 429, "message": "Quota limit", "status": "RESOURCE_EXHAUSTED"}})
    mock_client.aio.models.generate_content = AsyncMock(side_effect=quota_err)

    with pytest.raises(GeminiUnavailableError) as exc_info:
        await gw.generate(operation="test_no_backup_err", model="gemini-3.5-flash-lite", contents="Hi")

    assert "no backup configured" in str(exc_info.value)


# -----------------------------------------------------------------------------
# 7. No Secrets in Logged Errors or Sanitized Messages
# -----------------------------------------------------------------------------

def test_no_secrets_appear_in_sanitized_messages():
    """Verifies that API keys and Google URL parameters are scrubbed completely."""
    secret_primary = "AIzaSyD_SECRET_PRIMARY_KEY_99999"
    secret_backup = "AIzaSyD_SECRET_BACKUP_KEY_88888"

    raw_err = f"Failed to call https://generativelanguage.googleapis.com/v1beta/models?key={secret_primary} with backup {secret_backup}"
    sanitized = sanitize_message(raw_err, keys=[secret_primary, secret_backup])

    assert secret_primary not in sanitized
    assert secret_backup not in sanitized
    assert "[REDACTED" in sanitized


# -----------------------------------------------------------------------------
# 8. Unconfigured Primary Key
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unconfigured_primary_raises_config_error():
    """Unconfigured primary key must raise GeminiConfigError."""
    gw = GeminiGateway()
    gw._get_primary_key = lambda: ""
    gw._get_backup_key = lambda: ""

    assert gw.is_configured() is False
    with pytest.raises(GeminiConfigError):
        await gw.generate(operation="test_unconfigured", model="gemini-3.5-flash-lite", contents="Hi")


# -----------------------------------------------------------------------------
# 9. Error Classification Accuracy
# -----------------------------------------------------------------------------

def test_classify_gemini_error_categories():
    """Verifies error classification for different error types."""
    # 429 Quota
    is_eligible, cat = classify_gemini_error(ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}))
    assert is_eligible is True
    assert "429" in cat or "quota" in cat

    # 503 Server Unavailable
    is_eligible, cat = classify_gemini_error(ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}}))
    assert is_eligible is True
    assert "503" in cat or "server" in cat

    # 400 Bad Request
    is_eligible, cat = classify_gemini_error(ClientError(400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}}))
    assert is_eligible is False
    assert "400" in cat

    # Application TypeError
    is_eligible, cat = classify_gemini_error(TypeError("unexpected argument"))
    assert is_eligible is False
    assert cat == "application_error"


# -----------------------------------------------------------------------------
# 10. Audio Transcription & Extraction Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_transcribe_audio_extracts_from_audio_transcription_part(mock_gateway):
    """Verifies that GatewayResponse.text extracts transcription from part.audio_transcription.text."""
    mock_primary = MagicMock()
    mock_part = MagicMock()
    mock_part.text = None
    mock_trans = MagicMock()
    mock_trans.text = "In the beginning was the Word"
    mock_part.audio_transcription = mock_trans

    mock_candidate = MagicMock()
    mock_candidate.content.parts = [mock_part]

    mock_resp = MagicMock()
    mock_resp.text = None
    mock_resp.candidates = [mock_candidate]

    mock_primary.aio.models.generate_content = AsyncMock(return_value=mock_resp)
    mock_gateway._get_client = lambda slot: mock_primary

    dummy_audio = b"RIFF....WAVEfmt...."
    res = await mock_gateway.transcribe_audio(dummy_audio)

    assert res.provider_slot == "primary"
    assert res.model_name == "gemini-3.5-transcribe"
    assert res.text == "In the beginning was the Word"


@pytest.mark.asyncio
async def test_transcribe_audio_failover_on_429(mock_gateway):
    """Verifies that transcribe_audio fails over to backup on 429 quota error."""
    mock_primary = MagicMock()
    mock_primary.aio.models.generate_content = AsyncMock(
        side_effect=ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})
    )

    mock_backup = MagicMock()
    mock_part = MagicMock()
    mock_part.text = None
    mock_trans = MagicMock()
    mock_trans.text = "God is our refuge and strength"
    mock_part.audio_transcription = mock_trans

    mock_candidate = MagicMock()
    mock_candidate.content.parts = [mock_part]

    mock_resp = MagicMock()
    mock_resp.text = None
    mock_resp.candidates = [mock_candidate]

    mock_backup.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    mock_gateway._get_client = lambda slot: mock_primary if slot == "primary" else mock_backup

    dummy_audio = b"RIFF....WAVEfmt...."
    res = await mock_gateway.transcribe_audio(dummy_audio)

    assert res.provider_slot == "backup"
    assert res.attempts == 2
    assert res.text == "God is our refuge and strength"


