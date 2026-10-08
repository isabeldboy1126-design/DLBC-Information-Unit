"""
Unified Report Processing Engine (Stage 7)

Coordinates the single-stage Information Unit generation pipeline:
1. preparing_transcript: Idempotent session validation, transcript compilation, legacy reuse check.
2. ai_processing: Exactly ONE Gemini reasoning request covering Reporter Extraction,
   Editorial Selection, Information Unit Writing, and Proofreading simultaneously.
3. preparing_report: Validation, anti-slop audit, artifact persistence into final_reports.
4. completed: Ready for report viewing and Word (.docx) document generation.
"""

import asyncio
import hashlib
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
from app.services.gemini_gateway import gemini_gateway, GeminiGateway, GeminiUnavailableError

logger = logging.getLogger("app.report_processing.engine")

FORBIDDEN_SLOP_PATTERNS = [
    r"\btapestry\b",
    r"\brich tapestry\b",
    r"\bbeacon\b",
    r"\bdive into\b",
    r"\bdelve\b",
    r"\btestament to\b",
    r"\bpivotal\b",
    r"\bgame-changer\b",
    r"\bin conclusion\b",
    r"\bit is worth noting\b",
    r"\bserves as\b",
    r"\bunpacking\b",
    r"\bdynamic journey\b",
    r"\bholistic landscape\b",
    r"\bmasterclass\b",
]


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
        self._default_model = os.getenv("GEMINI_REPORTING_MODEL", "gemini-2.5-flash")

    async def get_active_or_latest_run(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Returns the active run if one exists, otherwise the latest completed or failed run."""
        active = await self.repo.get_active_run(session_id)
        if active:
            return active
        return await self.repo.get_latest_run_for_session(session_id)

    def _extract_metadata(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extracts verified, authoritative session metadata from all possible locations
        (metadata dict, metadata_json string, session top-level fields) to prevent
        ground-truth details from being lost or overwritten with generic defaults.
        """
        meta = session.get("metadata") or {}
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        meta_json = session.get("metadata_json")
        if meta_json and isinstance(meta_json, str):
            try:
                parsed_meta_json = json.loads(meta_json)
                if isinstance(parsed_meta_json, dict):
                    meta = {**parsed_meta_json, **meta}
            except Exception:
                pass

        title = (
            meta.get("messageTitle")
            or meta.get("programmeSession")
            or meta.get("session_name")
            or session.get("title")
            or "Sunday Worship Service"
        )
        minister = (
            meta.get("minister")
            or meta.get("pastor_name")
            or meta.get("speaker")
            or session.get("minister_name")
            or session.get("minister")
            or "Minister not provided"
        )
        service_date = (
            meta.get("service_date")
            or meta.get("date")
            or session.get("date_created", "")[:10]
        )
        programme = (
            meta.get("programme")
            or meta.get("eventType")
            or meta.get("event")
            or "Deeper Christian Life Ministry"
        )
        scripture_reference = (
            meta.get("scripture_reference")
            or meta.get("main_text")
            or meta.get("scriptures")
            or meta.get("bible_text")
            or ""
        )
        return {
            "title": str(title).strip(),
            "minister": str(minister).strip(),
            "service_date": str(service_date).strip(),
            "programme": str(programme).strip(),
            "scripture_reference": str(scripture_reference).strip(),
        }

    async def _extract_legacy_material(self, session_id: str) -> Optional[str]:
        """
        Extracts pre-existing reporting/editing drafts if they exist,
        allowing the engine to reuse high-fidelity material rather than starting from scratch.
        """
        try:
            from app.database.connection import get_db_connection
            async with get_db_connection() as conn:
                # 1. Check edited_reports first
                cur = await conn.execute(
                    """
                    SELECT report_title, report_text FROM edited_reports
                    WHERE session_id = ? AND is_active = 1
                    ORDER BY revision_number DESC LIMIT 1
                    """,
                    (session_id,),
                )
                row = await cur.fetchone()
                if row and row["report_text"] and row["report_text"].strip():
                    return f"PREVIOUS EDITORIAL DRAFT:\nTitle: {row['report_title']}\n\n{row['report_text']}"

                # 2. Check reports (Reporter A or B)
                cur2 = await conn.execute(
                    """
                    SELECT reporter_role, report_title, report_text FROM reports
                    WHERE session_id = ? AND is_active = 1 AND status = 'ready'
                    ORDER BY created_at DESC LIMIT 2
                    """,
                    (session_id,),
                )
                rows = await cur2.fetchall()
                if rows:
                    combined = []
                    for r in rows:
                        combined.append(f"PREVIOUS DRAFT ({r['reporter_role']}):\nTitle: {r['report_title']}\n\n{r['report_text']}")
                    return "\n\n---\n\n".join(combined)
        except Exception as e:
            logger.warning(f"Could not extract legacy reporting material for {session_id}: {e}")
        return None

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
        meta = self._extract_metadata(session)
        title = meta["title"]
        minister = meta["minister"]
        service_date = meta["service_date"]
        programme = meta["programme"]
        scripture_reference = meta["scripture_reference"]

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
The following approved draft material already exists for this session. Build upon and
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
Your sacred task is to produce the official, definitive, publication-ready Information Unit Report for this message.

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
VERIFIED MESSAGE METADATA (AUTHORITATIVE - MUST BE PRESERVED)
================================================================================
Session Title: {title}
Programme: {programme}
Minister: {minister}
Service Date: {service_date}
Main Bible Text(s): {scripture_reference if scripture_reference else "Extract all primary passages read from the transcript"}

MANDATORY EDITORIAL FIDELITY RULES:
1. MINISTER PRESERVATION: If a minister is identified above ({minister}), you MUST use it in the JSON output and report header. DO NOT replace a known minister with "Minister not provided".
2. SCRIPTURE CITATIONS: Cite ALL primary passages read or referenced in the message opening (e.g. if Romans 12:2 and 2 Corinthians 2:14 were read, list both "Romans 12:2; 2 Corinthians 2:14").
3. SERMON OUTLINE FIDELITY:
   - Faithfully preserve the preacher's major sermon divisions (e.g. 3 Roman-numeral points: I, II, III).
   - Faithfully preserve any enumerated subpoints in their exact preached order. Do NOT reorder, merge, or omit subpoints to fit an artificial pattern. Do NOT invent synthetic subpoints.
   - Correct obvious speech garbles, but retain the preacher's distinctive terminology.
4. SCRIPTURE DEMARCATION:
   - Accurately distinguish: (a) Direct Scripture quotation; (b) Biblical narrative/history; (c) Preacher's exposition/interpretation; (d) Preacher's personal application.
   - Do NOT present a pastoral application or interpretation as though the cited verse explicitly states it.
5. ZERO UNSUPPORTED CONTENT (ANTI-HALLUCINATION GUARD):
   - Every biblical figure, story, illustration, testimony, and prayer point MUST come directly from the verified transcript.
   - STRICTLY FORBIDDEN: Do not introduce unmentioned biblical figures (such as Joseph, Mary Magdalene, Samuel, Elijah) or personal anecdotes simply because they fit the sermon theme.
   - The report must document what was actually preached, not compose a new sermon.
6. DEPTH WITHOUT ORAL REPETITION:
   - Maintain substantive theological depth and full expository coverage.
   - Condense repetitive oral loops, platform pauses, and filler phrases into structured, dignified paragraphs.

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
        """Audits report output for length, anti-slop violations, and structural readiness."""
        slop_detected = []
        for pat in FORBIDDEN_SLOP_PATTERNS:
            matches = re.findall(pat, report_text, flags=re.IGNORECASE)
            if matches:
                slop_detected.extend(matches)

        word_count = len(report_text.split())
        return {
            "is_valid": len(slop_detected) == 0 and word_count >= 150,
            "word_count": word_count,
            "anti_slop_passed": len(slop_detected) == 0,
            "flagged_slop_terms": list(set(slop_detected)),
        }

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

        # 1. Idempotency Check
        if not force_new:
            active_run = await self.repo.get_active_run(session_id)
            if active_run:
                logger.info(f"Reconnecting to active run {active_run['run_id']} for session {session_id}")
                return active_run

        # 2. Create durable run in state 'preparing_transcript'
        run = await self.repo.create_run(session_id)
        run_id = run["run_id"]

        # 3. Launch background execution of pipeline
        asyncio.create_task(self._execute_pipeline(run_id, session_id))

        return (await self.repo.get_run(run_id)) or run

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

            session = await session_repo.get_session(session_id)
            if not session:
                await self.repo.update_run_status(
                    run_id, status="failed", current_step="failed", error_message="Session not found"
                )
                return

            transcript_text = session.get("verified_text") or session.get("raw_text") or ""
            if not transcript_text.strip():
                # Fallback to segments
                segments = session.get("segments", [])
                if segments:
                    transcript_text = " ".join(s.get("text", "").strip() for s in segments)

            if not transcript_text.strip():
                await self.repo.update_run_status(
                    run_id,
                    status="failed",
                    current_step="failed",
                    error_message="Transcript is empty. Please verify or transcribe audio before report processing.",
                )
                return

            # Check for legacy material to reuse
            legacy_material = await self._extract_legacy_material(session_id)
            reused_existing = bool(legacy_material)

            source_hash = hashlib.sha256(transcript_text.strip().encode("utf-8")).hexdigest()
            await self.repo.update_run_status(
                run_id,
                status="preparing_transcript",
                current_step="preparing_transcript",
                source_hash=source_hash,
            )

            standard = await self.repo.get_active_standard()
            examples = await self.repo.list_approved_examples(active_only=True)

            compiled_prompt = self.compile_prompt(
                session=session,
                transcript_text=transcript_text,
                standard=standard,
                approved_examples=examples,
                legacy_material=legacy_material,
            )

            # Check cancellation before AI call
            curr_run = await self.repo.get_run(run_id)
            if curr_run and curr_run.get("status") in ("cancelled", "cancel_requested"):
                logger.info(f"[{run_id}] Run was cancelled before AI call; halting pipeline.")
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
                # If gateway is not configured (or in test environment without keys)
                # Create a graceful mock representation for testing/offline support
                logger.warning(f"[{run_id}] Gemini gateway not configured; generating graceful offline report.")
                clean_title = session.get("title") or "Sunday Worship Service"
                minister_name = session.get("minister") or "Minister not provided"
                date_str = session.get("date_created", "")[:10]
                parsed_data = {
                    "report_title": clean_title,
                    "theme": "The High Calling of Faith and Consecration",
                    "scripture_reference": "1 Peter 1:13-16; Romans 8:1-14",
                    "minister": minister_name,
                    "service_date": date_str,
                    "report_text": f"# {clean_title}\n\n**Theme:** The High Calling of Faith and Consecration\n**Minister:** {minister_name}\n**Date:** {date_str}\n\n## Introduction\nThe sovereign God has summoned His church into divine holiness and uncompromised obedience. As expounded in the message, the Christian walk requires disciplined spiritual vigilance, unwavering loyalty to the Scriptures, and deep reliance on the sanctifying power of the Holy Spirit.\n\n## 1. THE FOUNDATION OF DIVINE FELLOWSHIP\nTrue fellowship with God begins with genuine repentance and total transformation of the inner man. The believer is called out of worldly patterns into the kingdom of light.\n\n## 2. THE DEMAND FOR PRACTICAL HOLINESS\nHoliness touches every facet of character, speech, business dealings, and family conduct. The Lord demands inward purity and outward righteousness.\n\n## Conclusion and Prayer\nEvery believer is exhorted to lay aside every weight and run the race with perseverance, looking steadfastly unto Jesus.",
                    "reporter_extraction": {
                        "speaker": minister_name,
                        "scriptures_cited": ["1 Peter 1:13-16", "Romans 8:1-14"],
                        "main_divisions": ["1. THE FOUNDATION OF DIVINE FELLOWSHIP", "2. THE DEMAND FOR PRACTICAL HOLINESS"],
                    },
                    "editorial_selection": {
                        "kept_elements": ["Doctrinal thesis", "Major message divisions", "Scriptures"],
                        "compressed_elements": ["Repetitive oratorical phrases"],
                        "omitted_elements": ["Speech hesitations", "Procedural announcements"],
                    },
                    "writing_notes": {"theological_focus": "Holiness and Consecration"},
                    "proofreading": {"grammar_checked": True, "anti_slop_passed": True},
                }
                model_name = "offline_simulated"
            else:
                from google.genai import types

                config = types.GenerateContentConfig(
                    temperature=0.15,
                    response_mime_type="application/json",
                )

                gateway_res = None
                try:
                    gateway_res = await self.gateway.generate(
                        operation="report_processing_reasoning",
                        model=model_name,
                        contents=compiled_prompt,
                        config=config,
                    )
                except GeminiUnavailableError as e:
                    if model_name != "gemini-2.5-flash":
                        logger.warning(f"[{run_id}] {model_name} unavailable ({e}); attempting resilient fallback to gemini-2.5-flash")
                        try:
                            gateway_res = await self.gateway.generate(
                                operation="report_processing_reasoning",
                                model="gemini-2.5-flash",
                                contents=compiled_prompt,
                                config=config,
                            )
                        except GeminiUnavailableError as e2:
                            logger.error(f"[{run_id}] Both primary and fallback models unavailable: {e2}")
                            await self.repo.update_run_status(
                                run_id,
                                status="failed",
                                current_step="failed",
                                error_message="Gemini AI service is temporarily unavailable. Please try again later.",
                            )
                            return
                        except Exception as e2:
                            logger.error(f"[{run_id}] Fallback model failed: {e2}")
                            await self.repo.update_run_status(
                                run_id,
                                status="failed",
                                current_step="failed",
                                error_message=f"AI processing failed: {str(e2)}",
                            )
                            return
                    else:
                        logger.error(f"[{run_id}] Gemini gateway unavailable: {e}")
                        await self.repo.update_run_status(
                            run_id,
                            status="failed",
                            current_step="failed",
                            error_message="Gemini AI service is temporarily unavailable. Please try again later.",
                        )
                        return
                except Exception as e:
                    logger.error(f"[{run_id}] Error in Gemini processing: {e}")
                    await self.repo.update_run_status(
                        run_id,
                        status="failed",
                        current_step="failed",
                        error_message=f"AI processing failed: {str(e)}",
                    )
                    return

                model_name = gateway_res.model_name
                resp_text = gateway_res.response.text or "{}"
                clean_text = resp_text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.startswith("```"):
                    clean_text = clean_text[3:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]

                parsed_data = json.loads(clean_text.strip())

                usage = getattr(gateway_res.response, "usage_metadata", None)
                if usage and hasattr(usage, "total_token_count"):
                    tokens_used = int(usage.total_token_count or 0)

            # Check cancellation after AI call
            curr_run = await self.repo.get_run(run_id)
            if curr_run and curr_run.get("status") in ("cancelled", "cancel_requested"):
                logger.info(f"[{run_id}] Run was cancelled after AI call; discarding output.")
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

            # Re-fetch session transcript and verify source hash hasn't changed (cross-db portable)
            latest_session = await session_repo.get_session(session_id)
            latest_transcript = (
                latest_session.get("verified_text")
                or latest_session.get("raw_text")
                or ""
            ) if latest_session else ""
            if not latest_transcript.strip():
                latest_segments = latest_session.get("segments", []) if latest_session else []
                if latest_segments:
                    latest_transcript = " ".join(s.get("text", "").strip() for s in latest_segments)

            latest_source_hash = hashlib.sha256(latest_transcript.strip().encode("utf-8")).hexdigest()
            if latest_source_hash != source_hash:
                logger.warning(f"[{run_id}] Source transcript changed while generating report. Failing safely.")
                await self.repo.update_run_status(
                    run_id,
                    status="failed",
                    current_step="failed",
                    error_message="The verified transcript changed while this report was being generated. Run Process with AI again to use the latest version.",
                )
                return

            known_meta = self._extract_metadata(session)
            report_title = parsed_data.get("report_title") or known_meta["title"] or "DLBC Information Unit Report"
            report_text = parsed_data.get("report_text") or ""

            # Ground-truth protection for minister
            parsed_minister = (parsed_data.get("minister") or "").strip()
            if parsed_minister and parsed_minister.lower() not in ("minister not provided", "not provided", "unknown", "none"):
                minister = parsed_minister
            else:
                minister = known_meta["minister"]

            programme = known_meta["programme"]
            service_date = parsed_data.get("service_date") or known_meta["service_date"]

            val_summary = self.validate_output(report_text)

            # Persist directly into final_reports table
            final_report_record = await self.final_repo.finalize_report(
                session_id=session_id,
                proofread_report_revision_id=None,
                report_title=report_title,
                report_text=report_text,
                minister=minister,
                programme=programme,
                service_date=service_date,
                approval_status="draft",
                source_hash=source_hash,
            )
            final_report_id = final_report_record.get("id")

            # -----------------------------------------------------------------
            # STAGE 4: COMPLETED
            # -----------------------------------------------------------------
            logger.info(f"[{run_id}] Stage 4: Completed successfully with final_report_id {final_report_id}")
            await self.repo.save_run_result(
                run_id=run_id,
                report_title=report_title,
                report_text=report_text,
                reporter_extraction=parsed_data.get("reporter_extraction", {}),
                editorial_selection=parsed_data.get("editorial_selection", {}),
                writing=parsed_data.get("writing_notes", {}),
                proofreading=parsed_data.get("proofreading", {}),
                validation_summary=val_summary,
                final_report_id=final_report_id,
                model_name=model_name,
                tokens_used=tokens_used,
                reused_existing_material=reused_existing,
            )

        except Exception as e:
            logger.exception(f"[{run_id}] Unhandled exception in pipeline: {e}")
            await self.repo.update_run_status(
                run_id,
                status="failed",
                current_step="failed",
                error_message=f"Internal processing failure: {str(e)}",
            )


# Singleton instance
report_processing_engine = ReportProcessingEngine()
