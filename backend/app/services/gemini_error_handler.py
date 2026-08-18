import logging

logger = logging.getLogger("app.services.gemini")


def handle_gemini_error(e: Exception, context: str = "AI operation") -> str:
    """
    Safely logs the original full technical Gemini exception for backend/developer debugging,
    and returns a clean, human-readable user-facing error message.

    Prevents raw Gemini error bodies, quota metric names, project information,
    API details, provider URLs, stack traces, and secrets from being exposed to operators.
    """
    logger.error("Gemini error during %s: %s", context, str(e), exc_info=True)

    err_str = str(e).lower()
    code = getattr(e, "code", None) or getattr(e, "status_code", None)

    # Detect HTTP 429 / RESOURCE_EXHAUSTED / Quota exceeded / Rate limit exceeded
    is_quota = (
        code == 429
        or "429" in err_str
        or "resource_exhausted" in err_str
        or "resourceexhausted" in err_str
        or "quota exceeded" in err_str
        or "quota_exceeded" in err_str
        or "rate limit" in err_str
        or "rate_limit" in err_str
        or "too many requests" in err_str
    )

    if is_quota:
        # If reliable short retry delay is present in the message
        if "retry" in err_str and ("second" in err_str or "shortly" in err_str):
            return "AI request limit reached. Please try again shortly."
        return "AI request limit reached. Please try again later."

    return "AI generation could not be completed. Please try again later."
