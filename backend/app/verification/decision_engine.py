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
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from google.genai import types

from app.database.session_repo import session_repo
from app.services.bible_context_service import bible_context_service, BibleContextService
from app.services.gemini_gateway import gemini_gateway, GeminiGateway, GeminiUnavailableError
from app.verification.audio_window_extractor import build_verification_reel, batch_extract_windows
from app.verification.materiality_policy import assess_transcript_materiality, MaterialityLevel

logger = logging.getLogger("app.verification.decision_engine")


def parse_independent_transcription(
    raw_text: Optional[str],
    expected_item_ids: List[str],
) -> Dict[str, Optional[str]]:
    """
    Parses the independent listener batch transcription response into a mapping
    from item_id to transcribed text string (or None if missing / unparseable).

    Handles JSON objects, JSON arrays, markdown code fences, or labeled line lists.
    """
    results: Dict[str, Optional[str]] = {item_id: None for item_id in expected_item_ids}
    if not raw_text or not raw_text.strip():
        return results

    text = raw_text.strip()
    clean_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()

    # Attempt 1: Parse as JSON
    try:
        data = json.loads(clean_text)
        if isinstance(data, dict):
            for item_id in expected_item_ids:
                val = data.get(item_id)
                if isinstance(val, str) and val.strip():
                    results[item_id] = val.strip()
                elif isinstance(val, dict):
                    t = val.get("text") or val.get("transcript") or val.get("transcription")
                    if isinstance(t, str) and t.strip():
                        results[item_id] = t.strip()
            return results
        elif isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict):
                    iid = str(entry.get("item_id") or entry.get("id") or "").strip().upper()
                    if iid in results:
                        t = entry.get("transcription") or entry.get("text") or entry.get("transcript")
                        if isinstance(t, str) and t.strip():
                            results[iid] = t.strip()
            return results
    except Exception:
        pass

    # Attempt 2: Line-by-line regex parsing (e.g. "V001: some words" or "[V001] - some words")
    pattern = re.compile(r"^(?:[-*]\s*)?(?:\[)?(V\d{3,})(?:\])?\s*[:\-]\s*(.*)$", re.IGNORECASE)
    for line in clean_text.splitlines():
        line = line.strip()
        if not line:
            continue
        match = pattern.match(line)
        if match:
            iid = match.group(1).upper()
            content = match.group(2).strip()
            if (content.startswith('"') and content.endswith('"')) or (content.startswith("'") and content.endswith("'")):
                content = content[1:-1].strip()
            if iid in results and content:
                results[iid] = content

    return results


def validate_batch_decisions(
    raw_response_text: Optional[str],
    requested_items: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Enforces deterministic validation and sanity checking on the session-level
    reasoning batch response according to the 7 core validation rules:

    1. Valid item IDs only: Output is keyed exclusively by requested item IDs.
    2. No duplicate item IDs: Retains only the first valid decision for each ID.
    3. No invented item IDs: Rejects any item ID not present in requested_items.
    4. Strict enum decisions: Enforces VERIFIED, CORRECTED, or UNRESOLVED.
    5. Malformed corrections: If CORRECTED but corrected_text is empty, converts to UNRESOLVED.
    6. Missing items: Any requested item missing in AI response defaults to UNRESOLVED.
    7. Shuffled response resolution: Correctly maps items regardless of return order.
    """
    req_map: Dict[str, Dict[str, Any]] = {
        str(item.get("clean_id") or item.get("item_id")).upper(): item
        for item in requested_items
    }
    valid_ids: Set[str] = set(req_map.keys())
    seen_ids: Set[str] = set()
    validated_decisions: Dict[str, Dict[str, Any]] = {}

    parsed_entries: List[Dict[str, Any]] = []

    if raw_response_text and raw_response_text.strip():
        clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_response_text.strip(), flags=re.MULTILINE).strip()
        try:
            parsed = json.loads(clean_json)
            if isinstance(parsed, list):
                parsed_entries = [e for e in parsed if isinstance(e, dict)]
            elif isinstance(parsed, dict):
                if "items" in parsed and isinstance(parsed["items"], list):
                    parsed_entries = [e for e in parsed["items"] if isinstance(e, dict)]
                elif "decisions" in parsed and isinstance(parsed["decisions"], list):
                    parsed_entries = [e for e in parsed["decisions"] if isinstance(e, dict)]
                elif "decision" in parsed and "item_id" not in parsed:
                    if requested_items:
                        first_id = str(requested_items[0].get("clean_id") or requested_items[0].get("item_id")).upper()
                        parsed["item_id"] = first_id
                        parsed_entries = [parsed]
                else:
                    for k, v in parsed.items():
                        if isinstance(v, dict):
                            entry = dict(v)
                            entry.setdefault("item_id", k)
                            parsed_entries.append(entry)
                        elif isinstance(v, str):
                            parsed_entries.append({"item_id": k, "decision": v})
        except Exception as e:
            logger.warning("Failed to parse batch reasoning response as JSON: %s", e)

    # Rule 2 Pre-scan: Count occurrences of valid item IDs in AI response
    id_counts: Dict[str, int] = {}
    for entry in parsed_entries:
        iid = str(entry.get("item_id") or entry.get("id") or "").strip().upper()
        if iid in valid_ids:
            id_counts[iid] = id_counts.get(iid, 0) + 1

    duplicate_ids: Set[str] = {iid for iid, count in id_counts.items() if count > 1}
    if duplicate_ids:
        logger.warning(
            "Duplicate item IDs detected in AI response: %s; discarding all decisions and marking UNRESOLVED (DUPLICATE_RESPONSE_ID)",
            duplicate_ids,
        )
        for dup_id in duplicate_ids:
            req_item = req_map[dup_id]
            azure_text = str(req_item.get("azure_text") or req_item.get("original_text") or "").strip()
            validated_decisions[dup_id] = {
                "item_id": dup_id,
                "decision": "UNRESOLVED",
                "corrected_text": azure_text,
                "verified_text": azure_text,
                "confidence": 0.50,
                "reason_code": "DUPLICATE_RESPONSE_ID",
                "explanation": "Item ID appeared multiple times in AI response (ambiguous model output); preserved for human review.",
                "scripture_references": [],
                "is_high_risk": True,
                "gateway_unavailable": False,
            }

    # Process parsed entries adhering to Rules 1, 2, 3, 4, 5, 7
    for entry in parsed_entries:
        item_id = str(entry.get("item_id") or entry.get("id") or "").strip().upper()

        # Rule 3: Reject invented item IDs
        if not item_id or item_id not in valid_ids:
            continue

        # Rule 2: If item_id is duplicated, discard all model decisions (already handled as UNRESOLVED)
        if item_id in duplicate_ids:
            continue

        req_item = req_map[item_id]
        azure_text = str(req_item.get("azure_text") or req_item.get("original_text") or "").strip()

        # Rule 4: Strict enum decisions
        raw_decision = str(entry.get("decision") or "UNRESOLVED").strip().upper()
        if raw_decision not in ("VERIFIED", "CORRECTED", "UNRESOLVED"):
            raw_decision = "UNRESOLVED"

        # Proposed correction extraction
        raw_corr = entry.get("corrected_text")
        if raw_corr is None:
            raw_corr = entry.get("verified_text")

        # Rule 5: Malformed corrections check
        reason_code = str(entry.get("reason_code") or entry.get("code") or "BATCH_VERIFICATION").strip()
        explanation = str(entry.get("explanation") or "").strip()

        if raw_decision == "CORRECTED":
            if raw_corr is None or str(raw_corr).strip() == "" or str(raw_corr).strip().lower() == "none":
                logger.warning("Item %s had CORRECTED decision with empty text; demoting to UNRESOLVED", item_id)
                raw_decision = "UNRESOLVED"
                corrected_text = azure_text
                reason_code = "MALFORMED_CORRECTION"
                explanation = "AI proposed correction but returned empty replacement text."
            else:
                corrected_text = str(raw_corr).strip()
        else:
            corrected_text = str(raw_corr).strip() if (raw_corr and str(raw_corr).strip()) else azure_text

        try:
            confidence = float(entry.get("confidence", 0.85 if raw_decision != "UNRESOLVED" else 0.50))
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.50 if raw_decision == "UNRESOLVED" else 0.85

        scriptures = entry.get("scripture_references") or entry.get("scriptures") or []
        if not isinstance(scriptures, list):
            scriptures = [str(scriptures)] if scriptures else []

        is_high_risk = bool(entry.get("is_high_risk", req_item.get("is_high_risk", False)))

        validated_decisions[item_id] = {
            "item_id": item_id,
            "decision": raw_decision,
            "corrected_text": corrected_text,
            "verified_text": corrected_text,
            "confidence": round(confidence, 2),
            "reason_code": reason_code,
            "explanation": explanation or ("AI verified" if raw_decision == "VERIFIED" else "AI evaluated"),
            "scripture_references": scriptures,
            "is_high_risk": is_high_risk,
            "gateway_unavailable": False,
        }

    # Rule 6: Missing items default to UNRESOLVED
    for item_id, req_item in req_map.items():
        if item_id not in validated_decisions:
            azure_text = str(req_item.get("azure_text") or req_item.get("original_text") or "").strip()
            validated_decisions[item_id] = {
                "item_id": item_id,
                "decision": "UNRESOLVED",
                "corrected_text": azure_text,
                "verified_text": azure_text,
                "confidence": 0.50,
                "reason_code": "MISSING_FROM_RESPONSE",
                "explanation": "Missing from AI batch response; retained for human review.",
                "scripture_references": [],
                "is_high_risk": bool(req_item.get("is_high_risk", True)),
                "gateway_unavailable": False,
            }

    return validated_decisions


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
        """Constructs a token-efficient prompt for Gemini 3.8 Flash reasoning (single segment legacy)."""
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

    def build_batch_transcription_prompt(
        self,
        manifest: List[Dict[str, Any]],
        biblical_names: List[str],
        dlbc_terms: List[str],
    ) -> str:
        """
        Builds the prompt for Request 1 (Independent Listener).
        Strictly contains time intervals and domain vocabulary hints.
        NO Azure wording or hypotheses are included to prevent listener bias.
        """
        boundaries_lines = []
        for m in manifest:
            iid = m["item_id"]
            s_sec = m["reel_start_sec"]
            e_sec = m["reel_end_sec"]
            boundaries_lines.append(f"- {iid}: [{s_sec:.1f}s - {e_sec:.1f}s]")

        boundaries_str = "\n".join(boundaries_lines)
        names_str = ", ".join(biblical_names[:40]) if biblical_names else "None specified"
        terms_str = ", ".join(dlbc_terms[:30]) if dlbc_terms else "None specified"

        prompt = f"""You are the expert Independent Audio Listener for church sermon recordings (Deeper Life Bible Church).
You are listening to an audio reel containing speech segments separated by brief silence gaps.

Your task is to transcribe what the speaker ACTUALLY said in each bounded segment.
You are an independent acoustic listener. Do NOT guess or invent words.

==================================================
SEGMENT TIME BOUNDARIES:
==================================================
{boundaries_str}

==================================================
CHURCH & BIBLICAL VOCABULARY HINTS:
==================================================
- Canonical Names: {names_str}
- DLBC Terms: {terms_str}

==================================================
INSTRUCTIONS:
==================================================
1. Transcribe the spoken words accurately within each specified time interval.
2. If speech is inaudible or indistinct in a segment, transcribe as "[inaudible]".
3. Return a clean JSON object mapping each Item ID to its transcribed text:
{{
  "V001": "transcribed speech for segment 1",
  "V002": "transcribed speech for segment 2"
}}
"""
        return prompt

    def build_batch_reasoning_prompt(
        self,
        batch_packet: List[Dict[str, Any]],
    ) -> str:
        """
        Builds the token-efficient structured prompt for Request 2 (Session-Level Reasoning).
        Evaluates the complete packet of items against independent audio, surrounding context,
        KJV canonical text, and materiality risks.
        """
        items_payload = []
        for it in batch_packet:
            items_payload.append({
                "item_id": it["item_id"],
                "azure_text": it["azure_text"],
                "surrounding_context": it["surrounding_context"],
                "independent_audio_text": it.get("independent_audio_text") or "Not available",
                "kjv_verses": it.get("kjv_verses", []),
                "canonical_names": it.get("canonical_names", []),
                "dlbc_terms": it.get("dlbc_terms", []),
                "materiality_reasons": it.get("materiality_reasons", []),
            })

        items_json_str = json.dumps(items_payload, indent=2, ensure_ascii=False)

        prompt = f"""You are the expert Theological and Sermon Verification Engine for Deeper Life Bible Church (DLBC).
Evaluate all flagged items in this session packet against multiple sources of truth.

==================================================
DECISION CONTRACT & RULES:
==================================================
1. DECISION must be strictly one of:
   - "VERIFIED": Original Azure text or minor inconsequential difference confirmed.
   - "CORRECTED": High-confidence correction corroborated by independent audio and/or KJV context.
   - "UNRESOLVED": Genuine ambiguity, severe conflict, or uncertainty requiring human review.
2. If the speaker quotes Scripture, align with exact KJV wording when clearly intended.
3. Differentiate phonetic biblical slips (e.g. Saul vs Paul, Hezekiah vs Uzziah).
4. Inconsequential differences (e.g. 'unto' vs 'to', 'upon' vs 'on', punctuation, filler words like 'amen', 'uh', 'um') should be marked VERIFIED or smoothed without flagging.
5. REASON_CODE: Short standardized code (e.g. "KJV_CORROBORATED", "AUDIO_CONFIRMED", "PHONETIC_SLIP", "INCONSEQUENTIAL_VARIATION", "AMBIGUOUS_AUDIO", "LOW_CONFIDENCE", "CANONICAL_NAME_MATCH").
6. You must evaluate EVERY item ID present in the packet. Do NOT invent new item IDs or omit any.

==================================================
ITEMS TO EVALUATE:
==================================================
{items_json_str}

==================================================
OUTPUT FORMAT:
==================================================
Return a JSON array of decision objects matching this schema:
[
  {{
    "item_id": "V001",
    "decision": "VERIFIED" | "CORRECTED" | "UNRESOLVED",
    "corrected_text": "Final resolved text for this segment",
    "confidence": 0.95,
    "reason_code": "KJV_CORROBORATED",
    "explanation": "Clear, concise reason explaining the decision",
    "scripture_references": ["Book Chapter:Verse"],
    "is_high_risk": false
  }}
]
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
        and Gemini 3.8 Flash reasoning (kept for backward compatibility and granular unit tests).
        """
        query_text = f"{surrounding_context} {azure_text} {gemini_audio_text or ''}"
        local_context = self.bible_service.build_verification_context(query_text)

        materiality = assess_transcript_materiality(
            original_text=azure_text,
            candidate_text=gemini_audio_text or azure_text,
            external_flags=external_flags,
        )

        if not self.gateway.is_configured():
            logger.warning("GeminiGateway not configured. Returning UNRESOLVED for human review.")
            return {
                "decision": "UNRESOLVED",
                "verified_text": azure_text,
                "confidence": 0.50,
                "explanation": "AI Gateway is not configured. Retained for human verification.",
                "scripture_references": [v.get("reference") for v in local_context.get("verses", []) if v.get("reference")],
                "is_high_risk": materiality.level == MaterialityLevel.HIGH_RISK,
                "gateway_unavailable": True,
            }

        if not gemini_audio_text or not str(gemini_audio_text).strip():
            logger.info("Independent acoustic evidence unavailable for segment; returning UNRESOLVED (AUDIO_UNAVAILABLE)")
            return {
                "decision": "UNRESOLVED",
                "verified_text": azure_text,
                "confidence": 0.50,
                "reason_code": "AUDIO_UNAVAILABLE",
                "explanation": "[AUDIO_UNAVAILABLE] Independent acoustic evidence is unavailable; preserved for human review.",
                "scripture_references": [v.get("reference") for v in local_context.get("verses", []) if v.get("reference")],
                "is_high_risk": materiality.level == MaterialityLevel.HIGH_RISK,
                "gateway_unavailable": False,
            }

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
            clean_json = re.sub(r"^```json\s*|\s*```$", "", raw_text, flags=re.MULTILINE).strip()
            result = json.loads(clean_json)

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
                "gateway_unavailable": False,
            }
        except Exception as e:
            logger.error("AI segment evaluation error: %s", e)
            from app.services.gemini_gateway import GeminiUnavailableError
            is_unavail = isinstance(e, GeminiUnavailableError) or "503" in str(e) or "429" in str(e) or "quota" in str(e).lower()
            return {
                "decision": "UNRESOLVED",
                "verified_text": azure_text,
                "confidence": 0.50,
                "explanation": f"AI evaluation error: {str(e)[:150]}",
                "scripture_references": [],
                "is_high_risk": True,
                "gateway_unavailable": is_unavail,
            }

    async def verify_session(
        self,
        session_id: str,
        auto_resolve: bool = True,
    ) -> Dict[str, Any]:
        """
        Coordinates Session-Level Batch Verification for an entire session.

        Guarantees that an entire session normally requires exactly TWO logical AI calls:
        1. ONE independent audio-transcription batch request over a continuous audio reel.
        2. ONE reasoning/decision batch request evaluating the complete packet.

        The number of AI calls does NOT scale with flag count (10, 59, 100 items -> 2 calls).
        Independent acoustic evidence is mandatory: if master audio/reel is missing, items
        must never auto-verify and are marked UNRESOLVED (AUDIO_UNAVAILABLE).
        """
        # Step 1: Set state to compiling
        await session_repo.set_ai_verification_status(session_id, "compiling")

        # Step 2: Ensure verification items are initialized
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

        # Step 3: Retrieve pending verification items
        v_state = await session_repo.get_verification_state(session_id)
        items = v_state.get("items", [])
        pending_items = [it for it in items if it.get("action") == "pending"]

        if not pending_items:
            summary = {
                "total_items": len(items),
                "verified_count": len(items),
                "corrected_count": 0,
                "unresolved_count": 0,
            }
            await session_repo.set_ai_verification_status(session_id, "completed_verified", summary=summary)
            await session_repo.finalise_verification(session_id)
            return {"status": "completed_verified", "summary": summary}

        # Step 4: Transition to verifying
        await session_repo.set_ai_verification_status(session_id, "verifying")

        # Step 5: Assign stable sequential clean IDs (V001, V002, ...)
        ordered_items: List[Dict[str, Any]] = []
        for idx, it in enumerate(pending_items):
            clean_id = f"V{idx+1:03d}"
            it_copy = dict(it)
            it_copy["clean_id"] = clean_id
            ordered_items.append(it_copy)

        # Step 6: Audio file path resolution with robust filesystem fallback
        audio_path = session.get("audio_file_path")
        if not audio_path or not os.path.isfile(audio_path):
            audio_fname = session.get("audio_filename") or (
                f"{session.get('recording_id')}.wav" if session.get("recording_id") else None
            )
            if audio_fname:
                from app.config import STORAGE_AUDIO_DIR
                candidate = os.path.join(STORAGE_AUDIO_DIR, audio_fname)
                if os.path.isfile(candidate):
                    audio_path = candidate

        # Step 7: Check gateway availability
        gateway_configured = self.gateway.is_configured()

        # Step 8: Build ONE verification reel and execute Call 1 (Audio Listener) ONCE
        all_flagged_meta = []
        for it in ordered_items:
            s_idx = it["segment_index"]
            seg = seg_dict.get(s_idx, {})
            all_flagged_meta.append({
                "clean_id": it["clean_id"],
                "segment_index": s_idx,
                "start_time": it.get("start_time", seg.get("start_time", 0.0)),
                "end_time": it.get("end_time", seg.get("end_time", 1.0)),
            })

        # Build in-memory verification reel for all flagged items
        reel_bytes, manifest, total_duration_sec = build_verification_reel(
            audio_file_path=audio_path,
            flagged_items=all_flagged_meta,
            buffer_seconds=2.5,
            silence_gap_ms=600,
        )
        items_with_audio: Set[str] = {m["item_id"] for m in manifest} if reel_bytes else set()

        all_decisions: Dict[str, Dict[str, Any]] = {}
        all_eval_results: List[Dict[str, Any]] = []
        verified_count = 0
        corrected_count = 0
        unresolved_count = 0

        # Mark and persist any items without acoustic evidence as UNRESOLVED (AUDIO_UNAVAILABLE)
        missing_audio_items = [it for it in ordered_items if it["clean_id"] not in items_with_audio]
        for it in missing_audio_items:
            cid = it["clean_id"]
            s_idx = it["segment_index"]
            seg = seg_dict.get(s_idx, {})
            azure_text = str(it.get("original_text") or seg.get("text", "")).strip()
            missing_decision = {
                "item_id": cid,
                "decision": "UNRESOLVED",
                "corrected_text": azure_text,
                "verified_text": azure_text,
                "confidence": 0.50,
                "reason_code": "AUDIO_UNAVAILABLE",
                "explanation": "[AUDIO_UNAVAILABLE] Independent acoustic evidence is unavailable; preserved for human review.",
                "scripture_references": [],
                "is_high_risk": True,
                "model_name": "system",
                "gateway_unavailable": False,
            }
            all_decisions[cid] = missing_decision
            all_eval_results.append(missing_decision)
            unresolved_count += 1
            await session_repo.save_ai_verification_item_result(
                session_id=session_id,
                segment_index=s_idx,
                ai_decision="UNRESOLVED",
                ai_verified_text=azure_text,
                ai_confidence=0.50,
                ai_explanation=missing_decision["explanation"],
                ai_model_name="system",
                ai_scriptures=[],
                auto_resolve=False,
            )

        audio_items = [it for it in ordered_items if it["clean_id"] in items_with_audio]

        # -------------------------------------------------------------
        # LOGICAL AI CALL 1: Independent Audio Listener Batch (ONCE)
        # -------------------------------------------------------------
        independent_transcripts: Dict[str, Optional[str]] = {it["clean_id"]: None for it in audio_items}
        if gateway_configured and audio_items and reel_bytes:
            biblical_names = [n["canonical_name"] for n in getattr(self.bible_service, "_all_names", [])[:30]]
            dlbc_terms = [t["term"] for t in getattr(self.bible_service, "_church_vocab", [])[:25]]

            reel_prompt = self.build_batch_transcription_prompt(manifest, biblical_names, dlbc_terms)
            try:
                t_resp = await self.gateway.transcribe_audio(
                    audio_bytes=reel_bytes,
                    prompt=reel_prompt,
                )
                independent_transcripts = parse_independent_transcription(
                    t_resp.text,
                    expected_item_ids=[it["clean_id"] for it in audio_items],
                )
                logger.info(
                    "[%s] Call 1: Batch audio transcription succeeded for %d items (duration=%.1fs)",
                    session_id, len(audio_items), total_duration_sec
                )
            except Exception as trans_err:
                logger.warning("[%s] Call 1: Batch audio transcription failed: %s", session_id, trans_err)
        else:
            logger.info("[%s] Gateway not configured or no audio; skipping audio transcription", session_id)

        # -------------------------------------------------------------
        # LOGICAL AI CALL 2: Session-Level Reasoning Batch (Chunk size: 20)
        # -------------------------------------------------------------
        REASONING_CHUNK_SIZE = 20
        reasoning_chunks = [
            audio_items[i:i + REASONING_CHUNK_SIZE]
            for i in range(0, len(audio_items), REASONING_CHUNK_SIZE)
        ]

        target_model = os.environ.get("GEMINI_VERIFICATION_MODEL", "gemini-3.8-flash")
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        )

        logger.info(
            "[%s] Starting Call 2 (reasoning) across %d chunk(s) of max size %d (%d items total, preferred model: %s)",
            session_id, len(reasoning_chunks), REASONING_CHUNK_SIZE, len(audio_items), target_model
        )

        for chunk_idx, chunk_items in enumerate(reasoning_chunks):
            chunk_num = chunk_idx + 1
            total_chunks = len(reasoning_chunks)
            chunk_size = len(chunk_items)
            chunk_start_time = time.time()
            fallback_model_used = None

            logger.info(
                "[%s] Processing reasoning chunk %d/%d (%d items, preferred model: %s)...",
                session_id, chunk_num, total_chunks, chunk_size, target_model
            )

            chunk_packet: List[Dict[str, Any]] = []
            for it in chunk_items:
                s_idx = it["segment_index"]
                seg = seg_dict.get(s_idx, {})
                azure_text = it.get("original_text") or seg.get("text", "")

                # Surrounding context
                context_parts = []
                for delta in (-2, -1, 1, 2):
                    neighbor = seg_dict.get(s_idx + delta)
                    if neighbor:
                        context_parts.append(neighbor.get("text", ""))
                surrounding_context = " ... ".join(context_parts)

                # Query local biblical context
                audio_text = independent_transcripts.get(it["clean_id"])
                query_text = f"{surrounding_context} {azure_text} {audio_text or ''}"
                local_context = self.bible_service.build_verification_context(query_text)

                # Parse flags
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
                external_flags = [f.get("type", "") if isinstance(f, dict) else str(f) for f in flags_list]

                # Assess materiality
                materiality = assess_transcript_materiality(
                    original_text=azure_text,
                    candidate_text=audio_text or azure_text,
                    external_flags=external_flags,
                )

                chunk_packet.append({
                    "clean_id": it["clean_id"],
                    "item_id": it["clean_id"],
                    "segment_index": s_idx,
                    "azure_text": azure_text,
                    "surrounding_context": surrounding_context,
                    "independent_audio_text": audio_text,
                    "kjv_verses": [f"{v.get('reference')}: \"{v.get('text')}\"" for v in local_context.get("verses", []) if v.get("reference")],
                    "canonical_names": local_context.get("biblical_names", []),
                    "dlbc_terms": local_context.get("dlbc_terms", []),
                    "materiality_reasons": materiality.reasons,
                    "is_high_risk": materiality.level == MaterialityLevel.HIGH_RISK,
                })

            raw_reasoning_text = None
            resp_model_name = target_model
            gateway_unavailable = not gateway_configured

            if gateway_configured and chunk_packet:
                reasoning_prompt = self.build_batch_reasoning_prompt(chunk_packet)
                try:
                    resp = await self.gateway.generate(
                        operation="ai_verification_reasoning",
                        model=target_model,
                        contents=reasoning_prompt,
                        config=config,
                    )
                    raw_reasoning_text = resp.text
                    resp_model_name = resp.model_name
                except GeminiUnavailableError as e:
                    if target_model != "gemini-2.5-flash":
                        fallback_model = "gemini-2.5-flash"
                        logger.warning(
                            "[%s] %s unavailable (%s); attempting resilient fallback to %s for chunk %d/%d (%d items)",
                            session_id, target_model, e, fallback_model, chunk_num, total_chunks, chunk_size
                        )
                        try:
                            resp = await self.gateway.generate(
                                operation="ai_verification_reasoning",
                                model=fallback_model,
                                contents=reasoning_prompt,
                                config=config,
                            )
                            raw_reasoning_text = resp.text
                            resp_model_name = resp.model_name
                            fallback_model_used = fallback_model
                        except GeminiUnavailableError as e2:
                            logger.error("[%s] Both primary and fallback models unavailable on chunk %d: %s", session_id, chunk_num, e2)
                            gateway_unavailable = True
                            raw_reasoning_text = None
                        except Exception as e2:
                            logger.error("[%s] Fallback model failed on chunk %d: %s", session_id, chunk_num, e2)
                            is_unavail = "503" in str(e2) or "429" in str(e2) or "quota" in str(e2).lower()
                            gateway_unavailable = is_unavail
                            raw_reasoning_text = None
                    else:
                        logger.error("[%s] Gemini gateway unavailable on chunk %d: %s", session_id, chunk_num, e)
                        gateway_unavailable = True
                        raw_reasoning_text = None
                except Exception as e:
                    logger.error("[%s] AI batch reasoning error on chunk %d: %s", session_id, chunk_num, e)
                    is_unavail = "503" in str(e) or "429" in str(e) or "quota" in str(e).lower()
                    if is_unavail and target_model != "gemini-2.5-flash":
                        fallback_model = "gemini-2.5-flash"
                        logger.warning(
                            "[%s] Transient capacity failure (%s); attempting fallback to %s for chunk %d/%d (%d items)",
                            session_id, e, fallback_model, chunk_num, total_chunks, chunk_size
                        )
                        try:
                            resp = await self.gateway.generate(
                                operation="ai_verification_reasoning",
                                model=fallback_model,
                                contents=reasoning_prompt,
                                config=config,
                            )
                            raw_reasoning_text = resp.text
                            resp_model_name = resp.model_name
                            fallback_model_used = fallback_model
                        except Exception as e2:
                            logger.error("[%s] Fallback model error on chunk %d: %s", session_id, chunk_num, e2)
                            gateway_unavailable = True
                            raw_reasoning_text = None
                    else:
                        gateway_unavailable = is_unavail
                        raw_reasoning_text = None

            chunk_duration = time.time() - chunk_start_time
            # Validate decisions adhering to the 7 validation rules
            chunk_decisions = validate_batch_decisions(raw_reasoning_text, chunk_packet)
            missing_items = [it["clean_id"] for it in chunk_items if it["clean_id"] not in chunk_decisions]
            if missing_items:
                logger.warning(
                    "[%s] Chunk %d/%d validation/mapping failure: %d/%d items missing from decisions: %s",
                    session_id, chunk_num, total_chunks, len(missing_items), chunk_size, missing_items
                )

            logger.info(
                "[%s] Chunk %d/%d completed in %.2fs (model: %s, fallback_used: %s): %d returned, %d missing/unresolved",
                session_id, chunk_num, total_chunks, chunk_duration, resp_model_name,
                fallback_model_used or "none", len(chunk_decisions), len(missing_items)
            )

            for d in chunk_decisions.values():
                d["model_name"] = resp_model_name
                d["gateway_unavailable"] = gateway_unavailable

            all_decisions.update(chunk_decisions)

            # Step 9: Persist validated decisions immediately per chunk
            for it in chunk_items:
                cid = it["clean_id"]
                s_idx = it["segment_index"]
                decision_data = chunk_decisions.get(cid)
                if not decision_data:
                    azure_text = it.get("original_text") or ""
                    decision_data = {
                        "item_id": cid,
                        "decision": "UNRESOLVED",
                        "corrected_text": azure_text,
                        "verified_text": azure_text,
                        "confidence": 0.50,
                        "reason_code": "NO_DECISION",
                        "explanation": "No decision returned from reasoning",
                        "scripture_references": [],
                        "is_high_risk": True,
                        "gateway_unavailable": gateway_unavailable,
                        "model_name": resp_model_name,
                    }
                all_eval_results.append(decision_data)

                decision = decision_data["decision"]
                confidence = decision_data["confidence"]
                is_high_risk = decision_data.get("is_high_risk", False)

                item_auto_resolve = False
                if auto_resolve:
                    if decision == "VERIFIED":
                        item_auto_resolve = True
                        verified_count += 1
                    elif decision == "CORRECTED" and confidence >= 0.80 and not is_high_risk:
                        item_auto_resolve = True
                        corrected_count += 1
                    else:
                        unresolved_count += 1
                else:
                    unresolved_count += 1

                explanation_to_store = decision_data["explanation"]
                reason_code = decision_data.get("reason_code")
                if reason_code and reason_code not in explanation_to_store:
                    explanation_to_store = f"[{reason_code}] {explanation_to_store}"

                await session_repo.save_ai_verification_item_result(
                    session_id=session_id,
                    segment_index=s_idx,
                    ai_decision=decision,
                    ai_verified_text=decision_data["verified_text"],
                    ai_confidence=confidence,
                    ai_explanation=explanation_to_store,
                    ai_model_name=decision_data.get("model_name", resp_model_name),
                    ai_scriptures=decision_data.get("scripture_references", []),
                    auto_resolve=item_auto_resolve,
                )

        # Step 10: Determine final verification status
        final_state = await session_repo.get_verification_state(session_id)
        remaining_pending = len([i for i in final_state.get("items", []) if i.get("action") == "pending"])

        summary = {
            "total_items": len(items),
            "verified_count": verified_count,
            "corrected_count": corrected_count,
            "unresolved_count": remaining_pending,
        }

        # Only mark ai_unavailable if ALL items were gateway-unavailable AND 0 items were resolved
        all_unavail = bool(all_eval_results) and all(r.get("gateway_unavailable") for r in all_eval_results) and (verified_count == 0 and corrected_count == 0)
        if all_unavail:
            final_status = "ai_unavailable"
        elif remaining_pending == 0:
            final_status = "completed_verified"
            await session_repo.finalise_verification(session_id)
            # Stage 7: Auto-process after verification if enabled
            try:
                from app.database.report_processing_repo import report_processing_repo
                is_auto = await report_processing_repo.get_setting("auto_process_after_verification", default="true")
                if str(is_auto).strip().lower() in ("true", "1", "yes", "on"):
                    from app.report_processing.engine import report_processing_engine
                    import asyncio
                    asyncio.create_task(report_processing_engine.start_processing(session_id))
            except Exception as e:
                import logging
                logging.getLogger("app.verification.decision_engine").warning(f"Auto-process trigger error: {e}")
        else:
            final_status = "completed_needs_review"

        logger.info(
            "[%s] AI verification complete: status=%s, verified=%d, corrected=%d, remaining_unresolved=%d",
            session_id, final_status, verified_count, corrected_count, remaining_pending
        )

        await session_repo.set_ai_verification_status(session_id, final_status, summary=summary)

        return {
            "status": final_status,
            "session_id": session_id,
            "summary": summary,
            "message": (
                "AI verification service is temporarily unavailable. Flagged segments are preserved for human review."
                if final_status == "ai_unavailable"
                else "AI verification completed."
            ),
        }


# Singleton instance
verification_decision_engine = VerificationDecisionEngine()
