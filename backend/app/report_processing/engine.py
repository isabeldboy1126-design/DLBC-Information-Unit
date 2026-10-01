"""
Unified Report Processing Engine (Stage 7)

Coordinates the single-stage Information Unit generation pipeline:
1. preparing_transcript: Idempotent session validation, transcript compilation, legacy reuse check.
2. ai_processing: Exactly ONE Gemini reasoning request covering Reporter Extraction,
   Editorial Selection, Information Unit Writing, and Proofreading simultaneously.
3. preparing_report: Validation and persistence of an editor draft and reviewable report revision.
4. completed: Draft ready for human review; approval is required before final export.
"""

import asyncio
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from app.database.final_report_repo import final_report_repo
from app.database.report_processing_repo import (
    DEFAULT_ANTI_SLOP_RULES,
    report_processing_repo,
)
from app.database.session_repo import session_repo
from app.database.connection import get_db_connection
from app.database.generation_source import (
    SourceChangedError, begin_source_transaction, capture_generation_snapshot,
    read_legacy_material, require_unchanged_source,
)
from app.services.gemini_gateway import gemini_gateway, GeminiGateway, GeminiUnavailableError

logger = logging.getLogger("app.report_processing.engine")

from app.report_processing.output_schema import ReportDraftOutput, validate_report_text
from app.database.editing_repo import editing_repo


class InvalidReportOutput(ValueError):
    pass


class ReportProcessingEngine:
    def __init__(
        self,
        gateway: Optional[GeminiGateway] = None,
        repo=None,
        final_repo=None,
    ):
        self.gateway = gateway or gemini_gateway
        self.repo = repo or report_processing_repo
        self.final_repo = final_repo or final_report_repo
        self._start_lock = asyncio.Lock()
        self._default_model = os.getenv("GEMINI_REPORTING_MODEL", "gemini-3.8-flash")

    async def get_active_or_latest_run(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Returns the active run if one exists, otherwise the latest completed or failed run."""
        active = await self.repo.get_active_run(session_id)
        if active:
            return active
        return await self.repo.get_latest_run_for_session(session_id)

    async def _extract_legacy_material(self, session_id: str) -> Optional[str]:
        """Prompt-preview compatibility; generation reads this in its input transaction."""
        async with get_db_connection() as conn:
            material, _ = await read_legacy_material(conn, session_id)
            return material

    def compile_prompt(
        self,
        session: Dict[str, Any],
        transcript_text: str,
        standard: Dict[str, Any],
        approved_examples: List[Dict[str, Any]],
        legacy_material: Optional[str] = None,
    ) -> str:
        """
        Assembles the authoritative single-stage prompt incorporating:
        1. System Mission & Anti-AI-slop rules
        2. 4 Phase Task Specifications (Reporter Extraction, Editorial Selection, Writing, Proofreading)
        3. Few-shot Approved Exemplars Library
        4. Session Metadata
        5. Legacy Material (if available)
        6. Full Authoritative Verified Transcript
        """
        title = session.get("title") or "Sunday Worship Service"
        minister = session.get("minister") or session.get("metadata", {}).get("minister") or ""
        service_date = session.get("date_created", "")[:10]
        programme = "Deeper Christian Life Ministry"

        meta_json = session.get("metadata_json")
        if meta_json:
            try:
                meta = json.loads(meta_json) if isinstance(meta_json, str) else meta_json
                if meta.get("programme"):
                    programme = meta["programme"]
                if meta.get("minister"):
                    minister = meta["minister"]
                if meta.get("programmeSession"):
                    title = meta["programmeSession"]
            except Exception:
                pass

        # Build few-shot examples block
        examples_str = ""
        for ex in approved_examples[:3]:
            examples_str += f"""
--- APPROVED EXEMPLAR: [{ex.get('section_letter', 'SEED')}] {ex.get('title')} ---
Goal: {ex.get('teaching_goal', '')}
Focus: {ex.get('editorial_focus', '')}
Text:
{ex.get('approved_content', '').strip()}
"""

        legacy_block = ""
        if legacy_material:
            legacy_block = f"""
================================================================================
PRE-EXISTING DRAFT REUSED AS FOUNDATIONAL MATERIAL
================================================================================
The following unapproved draft material already exists for this session. Build upon and
synthesize it with the verified transcript below rather than discarding it:

{legacy_material.strip()}
"""

        unified_instruction = standard.get("unified_instructions")
        if unified_instruction and str(unified_instruction).strip():
            editorial_instructions_block = f"""================================================================================
UNIFIED REPORT PROCESSING & EDITORIAL STANDARDS
================================================================================
{str(unified_instruction).strip()}"""
        else:
            editorial_instructions_block = f"""================================================================================
ANTI-AI-SLOP RULES & TONE MANDATE (ZERO TOLERANCE)
================================================================================
{standard.get('anti_slop_rules', DEFAULT_ANTI_SLOP_RULES)}

================================================================================
1. REPORTER EXTRACTION STANDARDS
================================================================================
{standard.get('reporter_extraction_instructions', '')}

================================================================================
2. EDITORIAL SELECTION STANDARDS
================================================================================
{standard.get('editorial_selection_instructions', '')}

================================================================================
3. INFORMATION UNIT WRITING STANDARDS
================================================================================
{standard.get('writing_instructions', '')}

================================================================================
4. PROOFREADING & VALIDATION STANDARDS
================================================================================
{standard.get('proofreading_instructions', '')}"""

        prompt = f"""You are the Master Editor and Theological Document Specialist for the Deeper Life Bible Church (DLBC) Information Unit.
Your sacred task is to produce the reviewable Information Unit draft report for this message.

CRITICAL ARCHITECTURE REQUIREMENT:
You must execute the entire reporting pipeline in this SINGLE response:
1. REPORTER EXTRACTION: Identify speaker roles, key doctrines, all scripture readings/citations, major divisions, and illustrations.
2. EDITORIAL SELECTION: Apply the KEEP / COMPRESS / OMIT editorial rules.
3. INFORMATION UNIT WRITING: Compose the full, publication-grade markdown report in the authentic DLBC house style.
4. PROOFREADING: Verify biblical precision, accurate names, grammatical flawlessness, and compliance with anti-slop rules.

{editorial_instructions_block}

================================================================================
APPROVED REFERENCE EXEMPLARS FROM THE LIBRARY
================================================================================
{examples_str.strip()}
{legacy_block}
================================================================================
MESSAGE METADATA
================================================================================
Session Title: {title}
Programme: {programme}
Minister: {minister}
Service Date: {service_date}

================================================================================
AUTHORITATIVE VERIFIED TRANSCRIPT
================================================================================
{transcript_text.strip()}

================================================================================
REQUIRED JSON OUTPUT SCHEMA
================================================================================
You MUST output valid, parseable JSON conforming strictly to this format:
{{
  "report_title": "Clean, compellng publication title",
  "theme": "Overarching theological theme",
  "scripture_reference": "Primary Bible references (e.g. 1 Peter 1:13-16)",
  "minister": "{minister}",
  "service_date": "{service_date}",
  "report_text": "The COMPLETE, high-density, authoritative publication report text in Markdown format. Include Title, Theme, Scripture, Minister, Date, Introduction, Roman Numeral Headings with structured expository paragraphs, Pastoral Admonitions, and Conclusion with Prayer Points.",
  "reporter_extraction": {{
    "speaker": "{minister}",
    "theme": "Theme statement",
    "scriptures_cited": ["Book Chapter:Verses"],
    "main_divisions": ["Heading 1", "Heading 2", "Heading 3"],
    "illustrations": ["List of biblical and real-life analogies cited"],
    "key_admonitions": ["Core pastoral exhortations"]
  }},
  "editorial_selection": {{
    "kept_elements": ["List of core theological principles and key points preserved"],
    "compressed_elements": ["List of rhetorical repetitions or conversational pauses condensed"],
    "omitted_elements": ["List of speech disfluencies, filler words, or procedural remarks removed"]
  }},
  "writing_notes": {{
    "structure_summary": "Summary of report layout",
    "theological_focus": "Central doctrine emphasized"
  }},
  "proofreading": {{
    "scripture_checks": ["Confirmed all scripture references"],
    "names_checked": ["Confirmed spelling of all names"],
    "grammar_checked": true,
    "anti_slop_passed": true,
    "proofreader_notes": "All anti-slop rules enforced; authentic DLBC tone verified."
  }}
}}
"""
        return prompt

    def validate_output(self, report_text: str) -> Dict[str, Any]:
        """Rejects empty text and prohibited terms without imposing a minimum length."""
        return validate_report_text(report_text)

    async def start_processing(
        self,
        session_id: str,
        force_new: bool = False,
    ) -> Dict[str, Any]:
        """
        Entry point for Unified Report Processing.
        Enforces idempotency: if a run is currently active, returns that active run immediately.
        Otherwise creates a new run and executes the pipeline.
        """
        await self.repo.init_db()

        # Retry requests must never duplicate an in-flight provider operation.
        async with self._start_lock:
            active_run = await self.repo.get_active_run(session_id)
            if active_run:
                return active_run
            run = await self.repo.create_run(session_id)
            asyncio.create_task(self._execute_pipeline(run["run_id"], session_id))
            return (await self.repo.get_run(run["run_id"])) or run

    async def _persist_generated_draft(self, run_id, snapshot, standard, parsed_data,
                                       val_summary, model_name, tokens_used):
        """Compare input and commit editor, final draft and run under one write lock."""
        session = snapshot.session
        sid = session['session_id']
        async with get_db_connection() as conn:
            await begin_source_transaction(conn, write=True)
            try:
                await require_unchanged_source(conn, snapshot)
                cur = await conn.execute('SELECT status FROM report_processing_runs WHERE run_id=?', (run_id,))
                run = await cur.fetchone()
                if not run or run[0] == 'cancelled':
                    await conn.rollback()
                    return
                title, text = parsed_data['report_title'], parsed_data['report_text']
                await editing_repo.save_edited_report_revision(
                    session_id=sid, report_title=title, report_text=text,
                    revision_source='ai_generated', standard_version=standard['version'],
                    standard_version_label=standard['version_label'], model_name=model_name,
                    transcript_id=session.get('transcript_id'),
                    review_notes=['Consolidated AI draft; requires human review and approval.'],
                    connection=conn,
                )
                final = await self.final_repo.finalize_report(
                    session_id=sid, proofread_report_revision_id=None, source_run_id=run_id,
                    report_title=title, report_text=text,
                    minister=parsed_data.get('minister') or session.get('minister') or session['metadata'].get('minister') or '',
                    programme=session['metadata'].get('programme') or 'Sunday Worship Service',
                    service_date=parsed_data.get('service_date') or session.get('date_created', '')[:10],
                    generation_input_signature=snapshot.signature, connection=conn,
                )
                await self.repo.save_run_result(
                    run_id=run_id, report_title=title, report_text=text,
                    reporter_extraction=parsed_data['reporter_extraction'],
                    editorial_selection=parsed_data['editorial_selection'], writing=parsed_data['writing_notes'],
                    proofreading=parsed_data['proofreading'], validation_summary=val_summary,
                    final_report_id=final['id'], model_name=model_name, tokens_used=tokens_used,
                    reused_existing_material=bool(snapshot.legacy_material), connection=conn,
                )
                await conn.commit()
            except BaseException:
                await conn.rollback()
                raise

    async def _execute_pipeline(self, run_id: str, session_id: str):
        """Asynchronously drives the 4 pipeline stages with full durability."""
        try:
            # -----------------------------------------------------------------
            # STAGE 1: PREPARING TRANSCRIPT
            # -----------------------------------------------------------------
            logger.info(f"[{run_id}] Stage 1: Preparing Transcript for session {session_id}")
            await self.repo.update_run_status(
                run_id, status="preparing_transcript", current_step="preparing_transcript"
            )

            # Initialize outside the source transaction: migrations must not
            # commit the snapshot or open a second writer during persistence.
            await session_repo.init_db()
            await editing_repo.init_db()
            await self.final_repo.init_db()
            snapshot = await capture_generation_snapshot(session_id)
            session = snapshot.session
            if session and session.get("is_archived"):
                raise ValueError("Restore the archived session before processing")
            transcript_text = snapshot.transcript_text

            if not transcript_text.strip():
                await self.repo.update_run_status(
                    run_id,
                    status="failed",
                    current_step="failed",
                    error_message="Transcript is empty. Please verify or transcribe audio before report processing.",
                    error_code="processing_failed",
                )
                return

            # Check for legacy material to reuse
            legacy_material = snapshot.legacy_material
            reused_existing = bool(legacy_material)

            standard = await self.repo.get_active_standard()
            examples = await self.repo.list_approved_examples(active_only=True)

            compiled_prompt = self.compile_prompt(
                session=session,
                transcript_text=transcript_text,
                standard=standard,
                approved_examples=examples,
                legacy_material=legacy_material,
            )
            await self.repo.save_run_input(run_id, snapshot, compiled_prompt)

            # Check cancellation before AI call
            curr_run = await self.repo.get_run(run_id)
            if curr_run and curr_run.get("status") == "cancelled":
                return

            # -----------------------------------------------------------------
            # STAGE 2: AI PROCESSING (Single Gemini Reasoning Request)
            # -----------------------------------------------------------------
            logger.info(f"[{run_id}] Stage 2: AI Processing (Single Gemini Call)")
            await self.repo.update_run_status(
                run_id,
                status="ai_processing",
                current_step="ai_processing",
                reused_existing_material=reused_existing,
            )

            model_name = os.getenv("GEMINI_REPORTING_MODEL", self._default_model)
            tokens_used = 0
            parsed_data: Dict[str, Any] = {}

            if not self.gateway.is_configured():
                raise GeminiUnavailableError("AI report generation is not configured. Configure a provider before retrying.")
            from google.genai import types
            config = types.GenerateContentConfig(
                temperature=0.15, response_mime_type="application/json",
                response_schema=ReportDraftOutput,
            )
            # Model compatibility is deployment-specific; no universal 2.5 fallback.
            gateway_res = await self.gateway.generate(
                operation="report_processing_reasoning", model=model_name,
                contents=compiled_prompt, config=config,
            )
            model_name = gateway_res.model_name
            try:
                parsed_data = ReportDraftOutput.model_validate_json(
                    gateway_res.response.text or "").model_dump()
            except (ValueError, TypeError) as exc:
                raise InvalidReportOutput("AI response rejected: invalid report schema") from exc
            usage = getattr(gateway_res.response, "usage_metadata", None)
            if usage:
                tokens_used = int(getattr(usage, "total_token_count", 0) or 0)

            # Check cancellation after AI call
            curr_run = await self.repo.get_run(run_id)
            if curr_run and curr_run.get("status") == "cancelled":
                return

            # -----------------------------------------------------------------
            # STAGE 3: PREPARING REPORT (Validation & Artifact Persistence)
            # -----------------------------------------------------------------
            logger.info(f"[{run_id}] Stage 3: Preparing Report & Persisting Final Artifacts")
            await self.repo.update_run_status(
                run_id,
                status="preparing_report",
                current_step="preparing_report",
                model_name=model_name,
                tokens_used=tokens_used,
            )

            report_text = parsed_data.get("report_text") or ""

            val_summary = self.validate_output(report_text)

            if not val_summary["is_valid"] or not parsed_data["proofreading"]["grammar_checked"] or not parsed_data["proofreading"]["anti_slop_passed"]:
                raise InvalidReportOutput("AI response rejected: empty text or report quality checks failed")

            await self._persist_generated_draft(
                run_id, snapshot, standard, parsed_data, val_summary, model_name, tokens_used)

        except SourceChangedError as e:
            await self.repo.update_run_status(
                run_id, status='failed', current_step='failed', error_message=str(e), error_code='source_changed')
        except (GeminiUnavailableError, InvalidReportOutput) as e:
            await self.repo.update_run_status(
                run_id, status="failed", current_step="failed", error_message=str(e),
                error_code="provider_unavailable" if isinstance(e, GeminiUnavailableError) else "invalid_output",
            )
        except Exception as e:
            logger.error("[%s] Report processing failed (%s)", run_id, type(e).__name__)
            await self.repo.update_run_status(
                run_id,
                status="failed",
                current_step="failed",
                error_message="Report processing failed. Your sources and previous reports are preserved; retry after checking configuration.",
                error_code="processing_failed",
            )


# Singleton instance
report_processing_engine = ReportProcessingEngine()
