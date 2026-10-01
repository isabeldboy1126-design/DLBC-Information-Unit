"""
Reporting Provider Service Abstraction & Gemini Implementation (Phase 6)

Defines:
1. Protected Backend Reporting Rules (immutable system guardrails).
2. ReportingProvider abstract base class.
3. GeminiReportingProvider using the official google-genai SDK.
"""

import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.services.gemini_error_handler import handle_gemini_error
from app.services.gemini_gateway import gemini_gateway, GeminiGateway, GeminiGatewayError

load_dotenv()


# Protected Backend Rules (Non-editable system guardrails)
PROTECTED_BACKEND_RULES = """### PROTECTED SYSTEM RULES (IMMUTABLE GUARDRAILS)
1. The Verified Transcript provided below is the ABSOLUTE and EXCLUSIVE textual source of truth.
2. NEVER invent, fabricate, hallucinate, or assume information, teachings, names, numbers, dates, locations, quotations, Scripture references, or spiritual points not explicitly substantiated by the Verified Transcript.
3. If any spoken detail is uncertain, ambiguous, or unsupported in the transcript, DO NOT invent a confident answer. Omit it or clearly state what was recorded.
4. Preserve the exact factual, doctrinal, and spiritual meaning of what the preacher spoken. Do NOT alter the speaker's message or tone.
5. Do NOT turn assumptions, guesses, or external theological opinions into facts.
6. Reports are derivative artifacts and must never purport to replace the historical audio or verified transcript.
7. Maintain strict reporting neutrality: present the message as preached by the minister.
8. Output MUST be returned in the requested structured JSON format.
"""

REPORTER_A_ROLE_DEFINITION = """### ROLE: REPORTER A — MAIN MESSAGE & STRUCTURE
You are Reporter A. Your role is to produce a coherent, well-structured Information Unit report summarizing the core message and flow of the sermon.
- Focus on the central message, overarching spiritual thrust, and major doctrinal points.
- Follow the logical or chronological structure established by the preacher.
- Highlight primary Scripture anchors and key declarations.
- Eliminate conversational hesitation and verbal filler while maintaining full completeness of thought.
- Present a clean, well-organized report suitable for official Information Unit documentation.
"""

REPORTER_B_ROLE_DEFINITION = """### ROLE: REPORTER B — DETAIL & OMISSION WATCH
You are Reporter B. Your role is to independently produce an Information Unit report with special vigilance for critical details that a high-level summary might omit.
- Be especially alert to supporting facts, numbers, dates, locations, specific examples, parables, and illustrations used by the preacher.
- Record all secondary and cited Bible verses.
- Preserve vivid metaphors, specific pastoral warnings, exact quotations, and transitions between thoughts.
- Ensure thoroughness and depth while maintaining clear, flowing, readable prose.
- You are working completely independently and must not assume another reporter will capture these details.
"""


class ReportOutputSchema(BaseModel):
    report_title: str = Field(description="The clear, formal topic/title of the preached message.")
    overview: str = Field(description="A concise overview/introduction summarizing the central theme.")
    report_text: str = Field(description="The complete, well-formatted markdown report containing all sections, points, and conclusions.")
    key_points: List[str] = Field(default_factory=list, description="List of major points or headings in the message.")
    scriptures: List[str] = Field(default_factory=list, description="All Bible references identified and referenced in the message.")
    warnings: List[str] = Field(default_factory=list, description="Any quality warnings, audio gaps, or ambiguities observed in the transcript.")
    evidence_notes: List[str] = Field(default_factory=list, description="Internal source mapping or notes for future editorial review.")



class ReportingResult:
    def __init__(
        self,
        is_success: bool,
        reporter_role: str,
        standard_version: int,
        standard_version_label: str,
        report_title: Optional[str] = None,
        report_text: Optional[str] = None,
        key_points: Optional[List[str]] = None,
        scriptures: Optional[List[str]] = None,
        warnings: Optional[List[str]] = None,
        evidence_metadata: Optional[Dict[str, Any]] = None,
        model_name: Optional[str] = None,
        error_message: Optional[str] = None,
        raw_response: Optional[str] = None,
    ):
        self.is_success = is_success
        self.reporter_role = reporter_role
        self.standard_version = standard_version
        self.standard_version_label = standard_version_label
        self.report_title = report_title or "Untitled Report Draft"
        self.report_text = report_text or ""
        self.key_points = key_points or []
        self.scriptures = scriptures or []
        self.warnings = warnings or []
        self.evidence_metadata = evidence_metadata or {}
        self.model_name = model_name or "unknown"
        self.error_message = error_message
        self.raw_response = raw_response

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_success": self.is_success,
            "reporter_role": self.reporter_role,
            "standard_version": self.standard_version,
            "standard_version_label": self.standard_version_label,
            "report_title": self.report_title,
            "report_text": self.report_text,
            "key_points": self.key_points,
            "scriptures": self.scriptures,
            "warnings": self.warnings,
            "evidence_metadata": self.evidence_metadata,
            "model_name": self.model_name,
            "error_message": self.error_message,
        }


class ReportingProvider(ABC):
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
    async def generate_report(
        self,
        reporter_role: str,  # 'reporter_a' or 'reporter_b'
        session_metadata: Dict[str, Any],
        verified_text: str,
        standard: Dict[str, Any],
    ) -> ReportingResult:
        """Generates an independent report draft from the verified transcript."""
        pass


class GeminiReportingProvider(ReportingProvider):
    def __init__(self, gateway: Optional[GeminiGateway] = None):
        # Allow model override via environment variable
        self._default_model = os.getenv("GEMINI_REPORTING_MODEL", "gemini-3.5-flash-lite")
        self._gateway = gateway or gemini_gateway

    def is_configured(self) -> bool:
        return self._gateway.is_configured()

    def get_provider_name(self) -> str:
        return "gemini"

    def get_model_name(self) -> str:
        return os.getenv("GEMINI_REPORTING_MODEL", self._default_model)

    def _build_prompt(
        self,
        reporter_role: str,
        session_metadata: Dict[str, Any],
        verified_text: str,
        standard: Dict[str, Any],
    ) -> str:
        """
        Layered Prompt Construction:
        1. Protected System Rules (Immutable Guardrails)
        2. Active Reporting Standard (General Guidelines)
        3. Reporter-Specific Role Definition & Editable Guidance
        4. Church Terminology & Approved Reference Examples
        5. Session Metadata
        6. Authoritative Verified Transcript
        """
        version_label = standard.get("version_label", "v1")
        general_guidelines = standard.get("general_guidelines", "")
        role_instructions = (
            standard.get("reporter_a_instructions", "")
            if reporter_role == "reporter_a"
            else standard.get("reporter_b_instructions", "")
        )
        terminology = standard.get("terminology", "")
        examples = standard.get("examples", "")

        role_header = (
            REPORTER_A_ROLE_DEFINITION
            if reporter_role == "reporter_a"
            else REPORTER_B_ROLE_DEFINITION
        )

        session_title = session_metadata.get("title", "Church Programme Message")
        session_date = session_metadata.get("date_created", "")
        speaker = session_metadata.get("metadata", {}).get("speaker") or session_metadata.get("speaker", "Minister")
        programme = session_metadata.get("metadata", {}).get("programme") or session_metadata.get("programme", "Deeper Life Bible Church Service")

        prompt = f"""{PROTECTED_BACKEND_RULES}

================================================================================
LAYER 1: ACTIVE REPORTING STANDARD ({version_label}) — GENERAL GUIDELINES
================================================================================
{general_guidelines}

================================================================================
LAYER 2: ROLE DEFINITION & ROLE-SPECIFIC GUIDANCE
================================================================================
{role_header}

--- Editable Guidance for this Role ({version_label}) ---
{role_instructions}

================================================================================
LAYER 3: CHURCH TERMINOLOGY & APPROVED EXAMPLES
================================================================================
--- Terminology & Glossary ---
{terminology}

--- Reference Approved Example ---
{examples}

================================================================================
LAYER 4: SESSION METADATA
================================================================================
- Message Title / Session: {session_title}
- Preacher / Minister: {speaker}
- Programme / Service: {programme}
- Date / Timestamp: {session_date}

================================================================================
LAYER 5: AUTHORITATIVE VERIFIED TRANSCRIPT (EXCLUSIVE SOURCE OF TRUTH)
================================================================================
{verified_text}

================================================================================
INSTRUCTIONS FOR FINAL OUTPUT:
================================================================================
Analyze the verified transcript thoroughly according to your assigned role.
Produce a faithful, clear, and complete Information Unit report in JSON format matching the schema.
Remember: Do not fabricate or extrapolate beyond what is in the verified transcript above.
"""
        return prompt

    async def generate_report(
        self,
        reporter_role: str,
        session_metadata: Dict[str, Any],
        verified_text: str,
        standard: Dict[str, Any],
    ) -> ReportingResult:
        standard_version = standard.get("version", 1)
        standard_version_label = standard.get("version_label", "v1")
        model_name = self.get_model_name()

        # 1. Check configuration
        if not self.is_configured():
            return ReportingResult(
                is_success=False,
                reporter_role=reporter_role,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="AI Reporting is not configured. GEMINI_API_KEY environment variable is not set.",
            )

        if not verified_text or not verified_text.strip():
            return ReportingResult(
                is_success=False,
                reporter_role=reporter_role,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message="Verified Transcript is empty. Cannot generate report.",
            )

        # 2. Build prompt
        prompt = self._build_prompt(
            reporter_role=reporter_role,
            session_metadata=session_metadata,
            verified_text=verified_text,
            standard=standard,
        )

        # 3. Call Gemini Gateway
        try:
            from google.genai import types

            # Request structured JSON output
            config = types.GenerateContentConfig(
                temperature=0.2, # Low temperature for factual precision
                response_mime_type="application/json",
                response_schema=ReportOutputSchema,
            )

            gateway_res = await self._gateway.generate(
                operation=f"reporting_{reporter_role}",
                model=model_name,
                contents=prompt,
                config=config,
            )

            response = gateway_res.response
            model_name = gateway_res.model_name
            provider_slot = gateway_res.provider_slot

            response_text = response.text or "{}"
            parsed_json = ReportOutputSchema.model_validate_json(response_text, strict=True).model_dump()
            from app.report_processing.output_schema import validate_report_text
            if not validate_report_text(parsed_json["report_text"])["is_valid"]:
                raise ValueError("AI output rejected: empty text or report quality checks failed")

            # Assemble full markdown report text
            title = parsed_json.get("report_title", "").strip() or session_metadata.get("title", "Message Report Draft")
            overview = parsed_json.get("overview", "").strip()
            raw_report_text = parsed_json.get("report_text", "").strip()

            if not raw_report_text:
                raw_report_text = overview

            key_points = parsed_json.get("key_points", [])
            scriptures = parsed_json.get("scriptures", [])
            warnings = parsed_json.get("warnings", [])
            evidence = parsed_json.get("evidence_notes", {})
            if isinstance(evidence, dict):
                evidence["provider_slot"] = provider_slot
            elif isinstance(evidence, list):
                evidence = {"notes": evidence, "provider_slot": provider_slot}
            else:
                evidence = {"provider_slot": provider_slot}

            return ReportingResult(
                is_success=True,
                reporter_role=reporter_role,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                report_title=title,
                report_text=raw_report_text,
                key_points=key_points,
                scriptures=scriptures,
                warnings=warnings,
                evidence_metadata=evidence,
                model_name=model_name,
                raw_response=response_text,
            )

        except Exception as e:
            user_error = handle_gemini_error(e, context=f"Reporting ({reporter_role})")
            return ReportingResult(
                is_success=False,
                reporter_role=reporter_role,
                standard_version=standard_version,
                standard_version_label=standard_version_label,
                model_name=model_name,
                error_message=user_error,
            )


# Global singleton reporting provider
gemini_reporting_provider = GeminiReportingProvider()
