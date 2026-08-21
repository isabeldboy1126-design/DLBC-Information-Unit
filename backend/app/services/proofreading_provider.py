"""
Proofreading Provider Service Abstraction & Gemini Implementation (Phase 8)

Defines:
1. Protected Backend Proofreading Rules (16 immutable system guardrails).
2. ProofreadingChangeItem and ProofreadingOutputSchema structured models.
3. ProofreadingProvider abstract base class.
4. GeminiProofreadingProvider using the official google-genai SDK.
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.services.gemini_error_handler import handle_gemini_error

load_dotenv()

# Protected Backend Proofreading Rules (16 Immutable Guardrails)
PROTECTED_BACKEND_PROOFREADING_RULES = """### PROTECTED SYSTEM RULES (IMMUTABLE GUARDRAILS)
1. DO NOT change the factual meaning, theological message, or doctrinal substance of the report.
2. DO NOT invent, fabricate, extrapolate, or introduce new facts, illustrations, examples, or ideas.
3. DO NOT remove substantive sentences, points, or biblical explanations.
4. DO NOT restructure, re-order, summarize, shorten, or expand the report.
5. DO NOT alter theology, sermon interpretation, claims, or the preacher's theological thrust.
6. DO NOT change names, numbers, dates, or Scripture references unless fixing a clear typographical or mechanical slip.
7. Preserve the reverent tone, dignified style, and third-person voice of the Edited Report.
8. Preserve the original paragraph structure and headings unless a minor punctuation/grammatical correction directly requires it.
9. BE CONSERVATIVE: When uncertain whether a correction is necessary, LEAVE THE ORIGINAL TEXT UNCHANGED and surface the item in "review_notes".
10. If no grammatical, spelling, typographical, capitalization, or punctuation errors exist, return the EXACT unchanged text and an EMPTY list of changes. Never manufacture changes.
11. Output MUST be returned in the requested structured JSON format with all corrections documented in "changes".
12. Do NOT produce a chatbot conversational reply or meta-commentary inside the report text.
13. The Edited Report is the primary source artifact; proofreading creates a new, separate derivative revision.
14. Protected backend rules strictly override any conflicting guidance in the editable standard.
15. Maintain strict respect for Deeper Life Bible Church reverence capitalization conventions.
16. Ensure API credentials remain backend-only.
"""


class ProofreadingChangeItem(BaseModel):
    original_text: str = Field(description="The exact snippet of text from the Edited Report prior to correction.")
    suggested_text: str = Field(description="The corrected replacement snippet.")
    change_type: str = Field(
        description="Type of change: 'spelling', 'grammar', 'punctuation', 'capitalization', 'consistency', 'scripture_reference', or 'minor_clarity'."
    )
    reason: str = Field(description="A concise reason for the suggested correction.")


class ProofreadingOutputSchema(BaseModel):
    proofread_title: str = Field(description="The formal message topic/title.")
    proofread_text: str = Field(description="The complete, polished markdown report incorporating only conservative corrections.")
    changes: List[ProofreadingChangeItem] = Field(
        default_factory=list,
        description="List of specific mechanical and grammatical changes made to the text. Empty if no changes were needed.",
    )
    review_notes: List[str] = Field(
        default_factory=list,
        description="Non-intrusive notes or uncertain points flagged for human review without altering the text.",
    )


class ProofreadingResult:
    def __init__(
        self,
        is_success: bool,
        standard_version: int,
        standard_version_label: str,
        proofread_title: Optional[str] = None,
        proofread_text: Optional[str] = None,
        changes: Optional[List[Dict[str, Any]]] = None,
        review_notes: Optional[List[str]] = None,
        model_name: Optional[str] = None,
        error_message: Optional[str] = None,
        raw_response: Optional[str] = None,
    ):
        self.is_success = is_success
        self.standard_version = standard_version
        self.standard_version_label = standard_version_label
        self.proofread_title = proofread_title or "Proofread Message Report"
        self.proofread_text = proofread_text or ""
        self.changes = changes or []
        self.review_notes = review_notes or []
        self.model_name = model_name or "unknown"
        self.error_message = error_message
        self.raw_response = raw_response

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_success": self.is_success,
            "standard_version": self.standard_version,
            "standard_version_label": self.standard_version_label,
            "proofread_title": self.proofread_title,
            "proofread_text": self.proofread_text,
            "changes": self.changes,
            "review_notes": self.review_notes,
            "model_name": self.model_name,
            "error_message": self.error_message,
        }


class ProofreadingProvider(ABC):
    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the required API credentials are set."""
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        """Returns provider identifier string."""
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        """Returns model identifier string."""
        pass

    @abstractmethod
    async def proofread_report(
        self,
        session_metadata: Dict[str, Any],
        edited_report_text: str,
        edited_report_title: str,
        standard: Dict[str, Any],
    ) -> ProofreadingResult:
        """Performs conservative proofreading on the Edited Report."""
        pass


class GeminiProofreadingProvider(ProofreadingProvider):
    def __init__(self):
        self._default_model = os.getenv("GEMINI_PROOFREADING_MODEL", os.getenv("GEMINI_REPORTING_MODEL", "gemini-3.5-flash-lite"))

    def is_configured(self) -> bool:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        return bool(key)

    def get_provider_name(self) -> str:
        return "gemini"

    def get_model_name(self) -> str:
        return os.getenv("GEMINI_PROOFREADING_MODEL", os.getenv("GEMINI_REPORTING_MODEL", self._default_model))

    def _build_prompt(
        self,
        session_metadata: Dict[str, Any],
        edited_report_text: str,
        edited_report_title: str,
        standard: Dict[str, Any],
    ) -> str:
        """
        Layered Prompt Construction for Proofreader:
        1. Protected Proofreading Rules (Immutable Guardrails)
        2. Active Proofreading Standard (Guidelines, Terminology, Formatting Rules)
        3. Session Metadata
        4. Edited Report (The exclusive primary source to proofread)
        """
        version_label = standard.get("version_label", "v1")
        guidelines = standard.get("guidelines", "")
        terminology = standard.get("terminology", "")
        formatting_rules = standard.get("formatting_rules", "")

        session_title = session_metadata.get("title", edited_report_title)
        speaker = session_metadata.get("metadata", {}).get("speaker") or session_metadata.get("speaker", "Pastor W.F. Kumuyi")
        programme = session_metadata.get("metadata", {}).get("programme") or session_metadata.get("programme", "Deeper Life Bible Church Service")

        prompt = f"""{PROTECTED_BACKEND_PROOFREADING_RULES}

================================================================================
LAYER 1: ACTIVE PROOFREADING STANDARD ({version_label}) — GUIDELINES
================================================================================
{guidelines}

================================================================================
LAYER 2: CHURCH TERMINOLOGY & REVERENCE CAPITALIZATION ({version_label})
================================================================================
{terminology}

================================================================================
LAYER 3: SCRIPTURE & FORMATTING RULES ({version_label})
================================================================================
{formatting_rules}

================================================================================
LAYER 4: SESSION CONTEXT
================================================================================
- Message Topic: {session_title}
- Preacher / Minister: {speaker}
- Service / Programme: {programme}

================================================================================
LAYER 5: EDITED REPORT TO PROOFREAD (PRIMARY DOCUMENT)
================================================================================
Title: {edited_report_title}

{edited_report_text}

================================================================================
TASK INSTRUCTIONS FOR THE PROOFREADER:
================================================================================
1. Perform a conservative proofreading review on the Edited Report above.
2. Fix typographical errors, misspelled words, subject-verb disagreements, punctuation errors, reverence capitalization slips, and Scripture citation formatting.
3. DO NOT rewrite sentences for stylistic preference or paraphrase. DO NOT change meaning.
4. If no corrections are needed, return the exact original report text and an empty changes list.
5. Return your result in valid JSON matching the schema.
"""
        return prompt

    async def proofread_report(
        self,
        session_metadata: Dict[str, Any],
        edited_report_text: str,
        edited_report_title: str,
        standard: Dict[str, Any],
    ) -> ProofreadingResult:
        standard_version = standard.get("version", 1)
        standard_version_label = standard.get("version_label", "v1")
        model_name = self.get_model_name()

        # 1. Check configuration
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            return ProofreadingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="AI Proofreading is not configured. GEMINI_API_KEY environment variable is not set.",
            )

        if not edited_report_text or not edited_report_text.strip():
            return ProofreadingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="Edited Report text is empty. Cannot proofread.",
            )

        # 2. Build layered prompt
        prompt = self._build_prompt(
            session_metadata=session_metadata,
            edited_report_text=edited_report_text,
            edited_report_title=edited_report_title,
            standard=standard,
        )

        # 3. Call Gemini SDK
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120000))

            config = types.GenerateContentConfig(
                temperature=0.1,  # Very low temperature for conservative proofreading
                response_mime_type="application/json",
                response_schema=ProofreadingOutputSchema,
            )

            # Use non-blocking async generation with fallback
            models_to_try = [model_name]
            for fb in ["gemini-3.5-flash-lite", "gemini-3.6-flash"]:
                if fb not in models_to_try:
                    models_to_try.append(fb)

            response = None
            last_err = None
            for m in models_to_try:
                try:
                    response = await client.aio.models.generate_content(
                        model=m,
                        contents=prompt,
                        config=config,
                    )
                    model_name = m
                    break
                except Exception as ex:
                    last_err = ex
                    continue

            if response is None:
                raise last_err or RuntimeError("All Gemini models failed.")

            response_text = response.text or "{}"
            parsed_json = json.loads(response_text)

            title = parsed_json.get("proofread_title", "").strip() or edited_report_title
            proofread_text = parsed_json.get("proofread_text", "").strip()
            changes = parsed_json.get("changes", [])
            review_notes = parsed_json.get("review_notes", [])

            if not proofread_text:
                raise ValueError("Empty proofread text received from AI Proofreader.")

            return ProofreadingResult(
                is_success=True,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                proofread_title=title,
                proofread_text=proofread_text,
                changes=changes,
                review_notes=review_notes,
                model_name=model_name,
                raw_response=response_text,
            )

        except Exception as e:
            user_error = handle_gemini_error(e, context="Proofreading run")
            return ProofreadingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message=user_error,
            )


# Global singleton proofreading provider
gemini_proofreading_provider = GeminiProofreadingProvider()
