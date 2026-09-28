"""
Autonomous AI Verification Decision Engine (Stage 6)

Core Verification Principles:
1. Multi-modal Evidence: Compares original Azure Live Speech segment against
   independent Gemini 3.5 Transcribe audio text, local KJV canonical verses,
   and Early Modern / DLBC vocabulary.
2. Materiality-Led: Differentiates inconsequential variations (e.g. unto vs to,
   punctuation, filler words) from high-risk errors (negations, numbers, names, scripture citations).
3. Tri-State Decision Contract:
   - VERIFIED: Original text or minor inconsequential difference confirmed.
   - CORRECTED: High-confidence correction corroborated by audio + KJV context.
   - UNRESOLVED: Genuine ambiguity, model conflict, or low confidence requiring human review.
4. Non-Destructive: Raw Azure transcripts are strictly immutable; verified outputs
   and AI audit traces are stored separately in SQLite.
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from google.genai import types

from app.database.session_repo import session_repo
from app.services.bible_context_service import bible_context_service, BibleContextService
from app.services.gemini_gateway import gemini_gateway, GeminiGateway
from app.verification.audio_window_extractor import batch_extract_windows
from app.verification.materiality_policy import assess_transcript_materiality, MaterialityLevel

logger = logging.getLogger("app.verification.decision_engine")


class VerificationDecisionEngine:
    def __init__(
        self,
        gateway: Optional[GeminiGateway] = None,
        bible_service: Optional[BibleContextService] = None,
    ):
        self.gateway = gateway or gemini_gateway
        self.bible_service = bible_service or bible_context_service

    def build_comparison_prompt(
        self,
        azure_text: str,
        surrounding_context: str,
        gemini_audio_text: Optional[str],
        local_bible_context: Dict[str, Any],
        materiality_reasons: List[str],
    ) -> str:
        """Constructs a token-efficient prompt for Gemini 3.8 Flash reasoning."""
        verses_formatted = []
        for v in local_bible_context.get("verses", []):
            verses_formatted.append(f"- {v.get('reference', '')}: \"{v.get('text', '')}\"")
        verses_str = "\n".join(verses_formatted) if verses_formatted else "None matched locally."

        names_str = ", ".join(local_bible_context.get("biblical_names", [])) or "None identified."
        dlbc_str = ", ".join(local_bible_context.get("dlbc_terms", [])) or "None."

        audio_section = (
            f"INDEPENDENT AUDIO TRANSCRIPTION (from Gemini 3.5 Transcribe):\n\"{gemini_audio_text}\""
            if gemini_audio_text
            else "AUDIO TRANSCRIPTION: Not available (evaluating text against biblical canon and materiality)."
        )

        prompt = f"""You are the expert Theological and Sermon Verification Engine for Deeper Life Bible Church (DLBC).
Your duty is to produce a decision-ready transcript verification evaluating an uncertain segment against multiple sources of truth.

==================================================
EVIDENCE SOURCES
==================================================

1. AZURE LIVE TRANSCRIPT SEGMENT (Original flagged text):
\"{azure_text}\"

2. SURROUNDING TRANSCRIPT CONTEXT:
\"{surrounding_context}\"

3. {audio_section}

4. LOCAL KJV BIBLICAL CONTEXT (Canonical King James Version):
{verses_str}

5. CANONICAL BIBLICAL NAMES / TERMS:
Names: {names_str}
DLBC Terms: {dlbc_str}

6. DETECTED MATERIALITY RISKS:
{', '.join(materiality_reasons) if materiality_reasons else 'Standard confidence verification.'}

==================================================
DECISION RULES
==================================================
- If the sermon quotes Scripture, align with the exact KJV wording when clearly intended.
- Differentiate phonetic biblical name slips (e.g. Saul vs Paul, Hezekiah vs Uzziah).
- Inconsequential differences (e.g. 'unto' vs 'to', 'upon' vs 'on', punctuation, filler words like 'amen', 'uh', 'um') should be marked VERIFIED or smoothed without flagging.
- If the audio or KJV text clearly corroborates a correction with high certainty, choose CORRECTED.
- If there is genuine ambiguity, severe audio conflict, or uncertainty on a high-risk phrase (negation, numbers, doctrine), choose UNRESOLVED.

Return a valid JSON object matching this EXACT schema:
{{
  "decision": "VERIFIED" | "CORRECTED" | "UNRESOLVED",
  "verified_text": "Final resolved text for this segment",
  "confidence": 0.95,
  "explanation": "Clear, concise reason explaining the decision",
  "scripture_references": ["Book Chapter:Verse"],
  "is_high_risk": false
}}
"""
        return prompt

    async def evaluate_segment(
        self,
        azure_text: str,
        surrounding_context: str,
        gemini_audio_text: Optional[str] = None,
        external_flags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates a single flagged transcript segment using local biblical context
        and Gemini 3.8 Flash reasoning.
        """
        # 1. Query local biblical context engine (zero Bible whole-database sent!)
        query_text = f"{surrounding_context} {azure_text} {gemini_audio_text or ''}"
        local_context = self.bible_service.build_verification_context(query_text)

        # 2. Assess materiality baseline
        materiality = assess_transcript_materiality(
            original_text=azure_text,
            candidate_text=gemini_audio_text or azure_text,
            external_flags=external_flags,
        )

        # 3. If primary & backup keys are completely unconfigured, fallback gracefully
        if not self.gateway.is_configured():
            logger.warning("GeminiGateway not configured. Returning UNRESOLVED for human review.")
            return {
                "decision": "UNRESOLVED",
                "verified_text": azure_text,
                "confidence": 0.50,
                "explanation": "AI Gateway is not configured. Retained for human verification.",
                "scripture_references": [v.get("reference") for v in local_context.get("verses", []) if v.get("reference")],
                "is_high_risk": materiality.level == MaterialityLevel.HIGH_RISK,
            }

        # 4. Build prompt & call Gemini 3.8 Flash
        prompt = self.build_comparison_prompt(
            azure_text=azure_text,
            surrounding_context=surrounding_context,
            gemini_audio_text=gemini_audio_text,
            local_bible_context=local_context,
            materiality_reasons=materiality.reasons,
        )

        target_model = os.environ.get("GEMINI_VERIFICATION_MODEL", "gemini-3.8-flash")
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        )

        try:
            resp = await self.gateway.generate(
                operation="ai_verification_reasoning",
                model=target_model,
                contents=prompt,
                config=config,
            )
            raw_text = (resp.text or "").strip()
            # Clean markdown codeblocks if returned
            clean_json = re.sub(r"^```json\s*|\s*```$", "", raw_text, flags=re.MULTILINE).strip()
            result = json.loads(clean_json)

            # Validate decision
            decision = str(result.get("decision", "UNRESOLVED")).upper()
            if decision not in ("VERIFIED", "CORRECTED", "UNRESOLVED"):
                decision = "UNRESOLVED"

            verified_text = str(result.get("verified_text") or azure_text).strip()
            confidence = float(result.get("confidence", 0.85))
            explanation = str(result.get("explanation") or "AI verified")
            scriptures = result.get("scripture_references") or []
            is_high_risk = bool(result.get("is_high_risk", materiality.level == MaterialityLevel.HIGH_RISK))

            return {
                "decision": decision,
                "verified_text": verified_text,
                "confidence": round(confidence, 2),
                "explanation": explanation,
                "scripture_references": scriptures,
                "is_high_risk": is_high_risk,
                "model_name": resp.model_name,
                "provider_slot": resp.provider_slot,
            }
        except Exception as e:
            logger.error("AI segment evaluation error: %s", e)
            return {
                "decision": "UNRESOLVED",
                "verified_text": azure_text,
                "confidence": 0.50,
                "explanation": f"AI evaluation error: {str(e)[:150]}",
                "scripture_references": [],
                "is_high_risk": True,
            }

    async def verify_session(
        self,
        session_id: str,
        auto_resolve: bool = True,
    ) -> Dict[str, Any]:
        """
        Coordinates full verification pipeline for a session:
        1. Compiling: gathers flagged items & bounded audio slices.
        2. Transcribing: independent Gemini 3.5 Transcribe audio windows.
        3. Verifying: Gemini 3.8 Flash evaluation with local KJV context.
        4. State transition to completed_verified or completed_needs_review.
        """
        # Set state to compiling
        await session_repo.set_ai_verification_status(session_id, "compiling")

        # Ensure verification items are initialized
        init_res = await session_repo.init_verification(session_id)
        if "error" in init_res:
            await session_repo.set_ai_verification_status(session_id, "failed")
            return {"error": init_res["error"]}

        session = await session_repo.get_session(session_id)
        if not session:
            await session_repo.set_ai_verification_status(session_id, "failed")
            return {"error": "Session not found"}

        segments = session.get("segments", [])
        seg_dict = {s["segment_index"]: s for s in segments}

        # Retrieve pending verification items
        v_state = await session_repo.get_verification_state(session_id)
        items = v_state.get("items", [])
        pending_items = [it for it in items if it.get("action") == "pending"]

        if not pending_items:
            # Nothing to verify or all already resolved
            summary = {"total_items": len(items), "verified_count": len(items), "corrected_count": 0, "unresolved_count": 0}
            await session_repo.set_ai_verification_status(session_id, "completed_verified", summary=summary)
            await session_repo.finalise_verification(session_id)
            return {"status": "completed_verified", "summary": summary}

        # Transition to verifying
        await session_repo.set_ai_verification_status(session_id, "verifying")

        # Audio file path
        audio_path = session.get("audio_file_path")
        if not audio_path and session.get("audio_filename"):
            from app.config import STORAGE_AUDIO_DIR
            audio_path = os.path.join(STORAGE_AUDIO_DIR, session["audio_filename"])

        # Extract bounded audio windows
        flagged_meta = []
        for it in pending_items:
            s_idx = it["segment_index"]
            seg = seg_dict.get(s_idx, {})
            flagged_meta.append({
                "segment_index": s_idx,
                "start_time": it.get("start_time", seg.get("start_time", 0.0)),
                "end_time": it.get("end_time", seg.get("end_time", 1.0)),
            })

        audio_windows = batch_extract_windows(audio_path, flagged_meta, buffer_seconds=5.0)

        # Transcribe audio windows via Gemini 3.5 Transcribe
        window_transcripts: Dict[int, str] = {}
        for win in audio_windows:
            if win.get("audio_bytes") and self.gateway.is_configured():
                try:
                    t_resp = await self.gateway.transcribe_audio(win["audio_bytes"])
                    win_text = t_resp.text or ""
                    for s_idx in win["segment_indices"]:
                        window_transcripts[s_idx] = win_text
                except Exception as trans_err:
                    logger.warning("Window transcription failed: %s", trans_err)

        # Evaluate each pending item
        verified_count = 0
        corrected_count = 0
        unresolved_count = 0

        for it in pending_items:
            s_idx = it["segment_index"]
            seg = seg_dict.get(s_idx, {})
            azure_text = it.get("original_text") or seg.get("text", "")

            # Build surrounding context (up to 2 segments before & after)
            context_parts = []
            for delta in (-2, -1, 1, 2):
                neighbor = seg_dict.get(s_idx + delta)
                if neighbor:
                    context_parts.append(neighbor.get("text", ""))
            surrounding_context = " ... ".join(context_parts)

            gemini_audio_text = window_transcripts.get(s_idx)

            raw_flags = it.get("flag_reasons")
            if isinstance(raw_flags, str):
                try:
                    flags_list = json.loads(raw_flags)
                except Exception:
                    flags_list = []
            elif isinstance(raw_flags, list):
                flags_list = raw_flags
            else:
                flags_list = []

            external_flags = [
                f.get("type", "") if isinstance(f, dict) else str(f)
                for f in flags_list
            ]

            eval_res = await self.evaluate_segment(
                azure_text=azure_text,
                surrounding_context=surrounding_context,
                gemini_audio_text=gemini_audio_text,
                external_flags=external_flags,
            )

            decision = eval_res["decision"]
            confidence = eval_res["confidence"]

            # Decision Contract: auto-resolve only if verified OR high-confidence corrected without high-risk conflict
            item_auto_resolve = False
            if auto_resolve:
                if decision == "VERIFIED":
                    item_auto_resolve = True
                    verified_count += 1
                elif decision == "CORRECTED" and confidence >= 0.80 and not eval_res.get("is_high_risk"):
                    item_auto_resolve = True
                    corrected_count += 1
                else:
                    unresolved_count += 1
            else:
                unresolved_count += 1

            await session_repo.save_ai_verification_item_result(
                session_id=session_id,
                segment_index=s_idx,
                ai_decision=decision,
                ai_verified_text=eval_res["verified_text"],
                ai_confidence=confidence,
                ai_explanation=eval_res["explanation"],
                ai_model_name=eval_res.get("model_name", "gemini-3.8-flash"),
                ai_scriptures=eval_res.get("scripture_references", []),
                auto_resolve=item_auto_resolve,
            )

        # Determine final status
        final_state = await session_repo.get_verification_state(session_id)
        remaining_pending = len([i for i in final_state.get("items", []) if i.get("action") == "pending"])

        summary = {
            "total_items": len(items),
            "verified_count": verified_count,
            "corrected_count": corrected_count,
            "unresolved_count": remaining_pending,
        }

        if remaining_pending == 0:
            final_status = "completed_verified"
            await session_repo.finalise_verification(session_id)
        else:
            final_status = "completed_needs_review"

        await session_repo.set_ai_verification_status(session_id, final_status, summary=summary)

        return {
            "status": final_status,
            "session_id": session_id,
            "summary": summary,
        }


# Singleton instance
verification_decision_engine = VerificationDecisionEngine()
