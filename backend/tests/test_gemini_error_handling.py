"""
Test Gemini Quota / 429 Error Handling (Rate Limits & Resource Exhaustion)

Verifies that:
1. HTTP 429 / RESOURCE_EXHAUSTED / quota exceeded exceptions are caught.
2. Clean, operator-safe error messages are returned.
3. Raw Gemini bodies, URLs, project IDs, stack traces, and internal metric names are NOT leaked to users.
"""

import pytest
from app.services.gemini_error_handler import handle_gemini_error
from app.services.reporting_provider import GeminiReportingProvider
from app.services.editing_provider import GeminiEditingProvider
from app.services.proofreading_provider import GeminiProofreadingProvider


def test_handle_gemini_error_http_429():
    class MockHttp429Error(Exception):
        def __init__(self):
            super().__init__("429 RESOURCE_EXHAUSTED: Quota exceeded for metric 'GenerateContent' in project 12345. URL: https://generativelanguage.googleapis.com/v1beta/...")
            self.code = 429

    msg = handle_gemini_error(MockHttp429Error(), context="Testing 429")
    assert msg == "AI request limit reached. Please try again later."
    assert "https://" not in msg
    assert "project" not in msg
    assert "RESOURCE_EXHAUSTED" not in msg


def test_handle_gemini_error_resource_exhausted_string():
    class MockGenaiError(Exception):
        pass

    e = MockGenaiError("ResourceExhausted: 429 Quota exceeded for quota metric 'queries' and limit 'DefaultRequestsPerMinute'")
    msg = handle_gemini_error(e, context="Testing ResourceExhausted")
    assert msg == "AI request limit reached. Please try again later."
    assert "queries" not in msg
    assert "DefaultRequestsPerMinute" not in msg


def test_handle_gemini_error_with_retry_delay():
    class MockRetryError(Exception):
        pass

    e = MockRetryError("429 Too Many Requests: Please retry in 5 seconds.")
    msg = handle_gemini_error(e, context="Testing retry")
    assert msg == "AI request limit reached. Please try again shortly."


def test_handle_gemini_error_generic():
    e = Exception("Internal server connection reset by peer")
    msg = handle_gemini_error(e, context="Testing generic")
    assert msg == "AI generation could not be completed. Please try again later."
    assert "reset by peer" not in msg
