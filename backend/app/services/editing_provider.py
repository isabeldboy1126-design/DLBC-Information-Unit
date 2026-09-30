"""
Editing Provider Service Abstraction & Gemini Implementation (Phase 7)

Defines:
1. Protected Backend Editor Rules (immutable system guardrails).
2. EditingProvider abstract base class.
3. GeminiEditingProvider using the official google-genai SDK.
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.services.gemini_error_handler import handle_gemini_error

load_dotenv()

# Protected Backend Editor Rules (16 Immutable Guardrails)
PROTECTED_BACKEND_EDITOR_RULES = """### PROTECTED SYSTEM RULES (IMMUTABLE GUARDRAILS)
1. The Verified Transcript provided below is the ABSOLUTE and EXCLUSIVE factual source of truth.
2. NEVER invent, fabricate, hallucinate, or extrapolate facts, events, names, numbers, dates, locations, quotations, Scripture references, or spiritual points not explicitly substantiated by the Verified Transcript.
3. NEVER resolve disagreements between Reporter A and Reporter B by guessing or selecting what sounds more pleasant. All disagreements MUST be cross-referenced and reconciled against the Verified Transcript.
4. If a detail in Reporter A or Reporter B is NOT supported by the Verified Transcript, DO NOT include it as fact in the edited report.
5. If the Verified Transcript itself does not support a confident resolution of a detail, DO NOT invent an answer. Either omit the uncertain nuance or surface it in "source_uncertainties".
6. Preserve the exact factual, doctrinal, and spiritual meaning of what was preached by the minister.
7. Do not silently change factual claims or the preacher's theological thrust.
8. Reporter A and Reporter B are derived draft inputs; they must never override the authoritative Verified Transcript.
9. You must synthesize the material into ONE coherent, publication-ready Information Unit report.
10. Do NOT produce a transcript, a bullet-point comparison between A and B, a chatbot response, or meta-commentary about how you edited the text. Output the actual compiled report in markdown.
11. Maintain a single, dignified, unified voice throughout the report.
12. Output MUST be returned in the requested structured JSON format.
13. Protected backend rules strictly override any conflicting guidance in the editable standard.
"""


class EditingOutputSchema(BaseModel):
    report_title: str = Field(description="The clear, formal topic/title of the preached message.")
    report_text: str = Field(description="The complete, well-formatted markdown compiled report containing all sections, points, and conclusions.")
    review_notes: List[str] = Field(default_factory=list, description="Genuine editorial synthesis notes or points requiring human attention.")
    source_uncertainties: List[str] = Field(default_factory=list, description="Any ambiguities or discrepancies in source drafts that could not be verified.")


class EditingResult:
    def __init__(
        self,
        is_success: bool,
        standard_version: int,
        standard_version_label: str,
        report_title: Optional[str] = None,
        report_text: Optional[str] = None,
        review_notes: Optional[List[str]] = None,
        source_uncertainties: Optional[List[str]] = None,
        model_name: Optional[str] = None,
        error_message: Optional[str] = None,
        raw_response: Optional[str] = None,
    ):
        self.is_success = is_success
        self.standard_version = standard_version
        self.standard_version_label = standard_version_label
        self.report_title = report_title or "Edited Message Report"
        self.report_text = report_text or ""
        self.review_notes = review_notes or []
        self.source_uncertainties = source_uncertainties or []
        self.model_name = model_name or "unknown"
        self.error_message = error_message
        self.raw_response = raw_response

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_success": self.is_success,
            "standard_version": self.standard_version,
            "standard_version_label": self.standard_version_label,
            "report_title": self.report_title,
            "report_text": self.report_text,
            "review_notes": self.review_notes,
            "source_uncertainties": self.source_uncertainties,
            "model_name": self.model_name,
            "error_message": self.error_message,
        }


class EditingProvider(ABC):
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
    async def generate_edited_report(
        self,
        session_metadata: Dict[str, Any],
        verified_text: str,
        reporter_a_report: Dict[str, Any],
        reporter_b_report: Dict[str, Any],
        standard: Dict[str, Any],
    ) -> EditingResult:
        """Compiles Reporter A, Reporter B, and Verified Transcript into one unified edited report."""
        pass


class GeminiEditingProvider(EditingProvider):
    def __init__(self):
        self._default_model = os.getenv("GEMINI_EDITING_MODEL", os.getenv("GEMINI_REPORTING_MODEL", "gemini-3.5-flash-lite"))

    def is_configured(self) -> bool:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        return bool(key)

    def get_provider_name(self) -> str:
        return "gemini"

    def get_model_name(self) -> str:
        return os.getenv("GEMINI_EDITING_MODEL", os.getenv("GEMINI_REPORTING_MODEL", self._default_model))

    def _build_prompt(
        self,
        session_metadata: Dict[str, Any],
        verified_text: str,
        reporter_a_report: Dict[str, Any],
        reporter_b_report: Dict[str, Any],
        standard: Dict[str, Any],
    ) -> str:
        """
        Layered Prompt Construction for Editor:
        1. Protected Editor Rules (Immutable Guardrails)
        2. Active Editor Standard (General Guidelines & Compilation Guidance)
        3. Church Terminology & Approved Reference Example
        4. Session Metadata
        5. Authoritative Verified Transcript (Factual Authority)
        6. Reporter A Draft (Structure & Outline)
        7. Reporter B Draft (Details & Omission Watch)
        """
        version_label = standard.get("version_label", "v1")
        general_guidelines = standard.get("general_guidelines", "")
        compilation_guidance = standard.get("compilation_guidance", "")
        terminology = standard.get("terminology", "")
        examples = standard.get("approved_examples", "")

        session_title = session_metadata.get("title", "Church Programme Message")
        session_date = session_metadata.get("date_created", "")
        speaker = session_metadata.get("metadata", {}).get("speaker") or session_metadata.get("speaker", "Pastor W.F. Kumuyi")
        programme = session_metadata.get("metadata", {}).get("programme") or session_metadata.get("programme", "Deeper Life Bible Church Service")

        rep_a_title = reporter_a_report.get("report_title", "Reporter A Draft")
        rep_a_text = reporter_a_report.get("report_text", "")
        rep_b_title = reporter_b_report.get("report_title", "Reporter B Draft")
        rep_b_text = reporter_b_report.get("report_text", "")

        prompt = f"""{PROTECTED_BACKEND_EDITOR_RULES}

================================================================================
LAYER 1: ACTIVE EDITOR STANDARD ({version_label}) — GENERAL GUIDELINES
================================================================================
{general_guidelines}

================================================================================
LAYER 2: COMPILATION & RECONCILIATION GUIDANCE ({version_label})
================================================================================
{compilation_guidance}

================================================================================
LAYER 3: CHURCH TERMINOLOGY & APPROVED FINISHED EXAMPLE
================================================================================
--- Terminology & Glossary ---
{terminology}

--- Reference Approved Finished Report ---
{examples}

================================================================================
LAYER 4: SESSION METADATA
================================================================================
- Message Title / Topic: {session_title}
- Preacher / Minister: {speaker}
- Programme / Service: {programme}
- Date / Timestamp: {session_date}

================================================================================
LAYER 5: AUTHORITATIVE VERIFIED TRANSCRIPT (EXCLUSIVE FACTUAL AUTHORITY)
================================================================================
{verified_text}

================================================================================
LAYER 6: INPUT DRAFT 1 — REPORTER A (MAIN MESSAGE & STRUCTURE)
================================================================================
Title: {rep_a_title}

{rep_a_text}

================================================================================
LAYER 7: INPUT DRAFT 2 — REPORTER B (DETAIL & OMISSION WATCH)
================================================================================
Title: {rep_b_title}

{rep_b_text}

================================================================================
INSTRUCTIONS FOR FINAL EDITED REPORT:
================================================================================
1. Synthesize Reporter A and Reporter B into ONE unified, publication-ready Information Unit report.
2. Adopt Reporter A's strong thematic structure and major point headings.
3. Seamlessly weave in Reporter B's supporting facts, specific illustrations, quotes, names, numbers, and biblical citations.
4. Eliminate duplicated thoughts, spoken verbal filler, and conversational repetition.
5. Ensure every fact in the final report is verified against the Verified Transcript in Layer 5.
6. Return the result in JSON matching the schema.
"""
        return prompt

    async def generate_edited_report(
        self,
        session_metadata: Dict[str, Any],
        verified_text: str,
        reporter_a_report: Dict[str, Any],
        reporter_b_report: Dict[str, Any],
        standard: Dict[str, Any],
    ) -> EditingResult:
        standard_version = standard.get("version", 1)
        standard_version_label = standard.get("version_label", "v1")
        model_name = self.get_model_name()

        # 1. Check configuration
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            return EditingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="AI Editing is not configured. GEMINI_API_KEY environment variable is not set.",
            )

        if not verified_text or not verified_text.strip():
            return EditingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="Verified Transcript is empty. Cannot compile report.",
            )

        if not reporter_a_report or not reporter_b_report:
            return EditingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="Both Reporter A and Reporter B drafts are required before editing.",
            )

        # 2. Build layered prompt
        prompt = self._build_prompt(
            session_metadata=session_metadata,
            verified_text=verified_text,
            reporter_a_report=reporter_a_report,
            reporter_b_report=reporter_b_report,
            standard=standard,
        )

        # 3. Call Gemini SDK
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120000))

            config = types.GenerateContentConfig(
                temperature=0.2, # Low temperature for factual precision
                response_mime_type="application/json",
                response_schema=EditingOutputSchema,
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
            parsed_json = EditingOutputSchema.model_validate_json(response_text, strict=True).model_dump()
            from app.report_processing.output_schema import validate_report_text
            if not validate_report_text(parsed_json["report_text"])["is_valid"]:
                raise ValueError("AI output rejected: empty text or report quality checks failed")

            title = parsed_json.get("report_title", "").strip() or session_metadata.get("title", "Edited Message Report")
            report_text = parsed_json.get("report_text", "").strip()
            review_notes = parsed_json.get("review_notes", [])
            source_uncertainties = parsed_json.get("source_uncertainties", [])

            if not report_text:
                raise ValueError("Empty report text received from AI Editor.")

            return EditingResult(
                is_success=True,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                report_title=title,
                report_text=report_text,
                review_notes=review_notes,
                source_uncertainties=source_uncertainties,
                model_name=model_name,
                raw_response=response_text,
            )

        except Exception as e:
            user_error = handle_gemini_error(e, context="Editing synthesis")
            return EditingResult(
                is_success=False,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message=user_error,
            )


# Global singleton editing provider
gemini_editing_provider = GeminiEditingProvider()
