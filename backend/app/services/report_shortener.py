"""
Report Shortening Service for DLBC Information Unit.

Implements Rules 1–8 to produce a concise 40–60% shortened version of a final report
without losing essential doctrine, outline structure, minister/scripture metadata,
or introducing any new facts/illustrations.
"""

import json
import logging
import os
import re
from typing import Any, Dict, Optional

from app.services.gemini_gateway import gemini_gateway, GeminiGateway, GeminiUnavailableError

logger = logging.getLogger("app.services.report_shortener")

SHORTEN_PROMPT_TEMPLATE = """You are the Senior Executive Editor for the Deeper Life Bible Church (DLBC) Information Unit.
Your assignment is to produce a concise, authoritative SHORTENED VERSION of the following approved Final Report.

You must strictly obey these 8 SHORTENING RULES:

RULE 1 — PRESERVE ESSENTIAL METADATA:
Retain the Report Title, Minister, Main Bible Texts, Date, and Programme in the document header.
Do not invent missing metadata or alter the Minister's name ({minister}).

RULE 2 — PRESERVE SERMON STRUCTURE:
Retain all original main division headings (e.g. Points I, II, III) and essential subpoints in their exact preached order.
Do not merge unrelated points, do not reorder headings, and do not invent new headings.

RULE 3 — PRESERVE THE SUBSTANCE:
Every major division must retain its central doctrine, primary scripture expositions, distinctive authentic illustrations, pastoral admonitions, and concluding prayer directives.

RULE 4 — REMOVE UNNECESSARY REDUNDANCY:
Eliminate repetitive oratorical phrasing, wordy transitions, tautology, circular explanations, and duplicated sentences.

RULE 5 — STRICTLY ZERO NEW CONTENT:
Do NOT add any new scriptures, illustrations, biblical figures, historical anecdotes, prayers, or facts not present in the source report. The shortened version must be derived 100% from the source report below.

RULE 6 — PRESERVE THEOLOGICAL ACCURACY:
Do not alter the theological meaning or turn qualified pastoral warnings into crude absolute statements.

RULE 7 — MEANINGFUL WORD-COUNT REDUCTION:
Target approximately 40% to 60% of the original report's word count. Do not truncate prematurely or sacrifice clarity for a numerical quota.

RULE 8 — PROFESSIONAL REPORTING STYLE:
Write in polished, dignified, reverent DLBC house style with complete paragraphs and clean markdown headings. Do NOT reduce the sermon to a bare outline of bullet points.

================================================================================
SOURCE FINAL REPORT TO SHORTEN:
================================================================================
Title: {report_title}
Minister: {minister}
Programme: {programme}
Date: {service_date}

{report_text}

================================================================================
REQUIRED OUTPUT JSON FORMAT:
================================================================================
Output strictly parseable JSON conforming to this schema:
{{
  "shortened_title": "{report_title} (Concise)",
  "shortened_text": "Complete shortened report in Markdown format with header, headings, and paragraphs",
  "editorial_notes": "Brief summary of condensation applied"
}}
"""


class ReportShortenerService:
    def __init__(self, gateway: Optional[GeminiGateway] = None):
        self.gateway = gateway or gemini_gateway
        self._default_model = os.getenv("GEMINI_REPORTING_MODEL", "gemini-2.5-flash")

    def _rule_based_shorten(
        self,
        report_title: str,
        report_text: str,
        minister: str,
        programme: str,
        service_date: str,
    ) -> str:
        """
        Deterministic rule-based shortening fallback for offline or testing mode.
        Preserves metadata, all markdown headings (#, ##, ###), and condenses paragraphs
        by retaining core topic sentences and key admonitions while eliminating oral padding.
        """
        lines = report_text.splitlines()
        shortened_lines = []
        in_code_block = False

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("```"):
                in_code_block = not in_code_block
                shortened_lines.append(line)
                continue
            if in_code_block:
                shortened_lines.append(line)
                continue

            # Preserve headings and metadata lines
            if (
                stripped.startswith("#")
                or stripped.startswith("**Title")
                or stripped.startswith("**Minister")
                or stripped.startswith("**Text")
                or stripped.startswith("**Date")
                or stripped.startswith("**Theme")
                or stripped.startswith("**Programme")
            ):
                shortened_lines.append(line)
                continue

            # If line is a numbered subpoint or bullet with multi-sentence body, condense explanation
            bullet_match = re.match(r"^(\s*(?:\d+\.|\*|\-)\s+(?:\*\*[^*]+\*\*:\s*)?)(.*)$", line)
            if bullet_match:
                prefix, body = bullet_match.groups()
                sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", body.strip()) if s.strip()]
                if len(sentences) > 1:
                    shortened_lines.append(f"{prefix}{sentences[0]}")
                else:
                    shortened_lines.append(line)
                continue

            # For expository paragraphs, compress by taking the first key sentence
            if stripped:
                sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", stripped) if s.strip()]
                if len(sentences) > 2:
                    shortened_lines.append(f"{sentences[0]} {sentences[-1]}")
                elif len(sentences) == 2:
                    shortened_lines.append(sentences[0])
                else:
                    shortened_lines.append(stripped)
            else:
                shortened_lines.append("")

        result_text = "\n".join(shortened_lines).strip()
        return result_text

    async def shorten_report(
        self,
        report_title: str,
        report_text: str,
        minister: Optional[str] = None,
        programme: Optional[str] = None,
        service_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generates a 40-60% shortened version of a final report adhering strictly to Rules 1-8.
        """
        clean_title = (report_title or "Message Report").strip()
        clean_text = (report_text or "").strip()
        minister_name = (minister or "Minister not provided").strip()
        programme_name = (programme or "Deeper Christian Life Ministry").strip()
        date_str = (service_date or "").strip()

        original_word_count = len(clean_text.split())

        if not clean_text:
            return {
                "status": "error",
                "message": "Report text is empty",
                "shortened_title": clean_title,
                "shortened_text": "",
                "original_word_count": 0,
                "shortened_word_count": 0,
                "reduction_percentage": 0.0,
            }

        shortened_title = f"{clean_title} (Concise)"
        shortened_text = ""

        if not self.gateway.is_configured():
            logger.info("Gemini gateway not configured; using deterministic rule-based condensation.")
            shortened_text = self._rule_based_shorten(
                clean_title, clean_text, minister_name, programme_name, date_str
            )
        else:
            prompt = SHORTEN_PROMPT_TEMPLATE.format(
                report_title=clean_title,
                minister=minister_name,
                programme=programme_name,
                service_date=date_str,
                report_text=clean_text,
            )

            model_name = os.getenv("GEMINI_REPORTING_MODEL", self._default_model)
            try:
                from google.genai import types

                config = types.GenerateContentConfig(
                    temperature=0.1,
                    response_mime_type="application/json",
                )
                gateway_res = await self.gateway.generate(
                    operation="shorten_final_report",
                    model=model_name,
                    contents=prompt,
                    config=config,
                )
                resp_text = (gateway_res.response.text or "{}").strip()
                if resp_text.startswith("```json"):
                    resp_text = resp_text[7:]
                if resp_text.startswith("```"):
                    resp_text = resp_text[3:]
                if resp_text.endswith("```"):
                    resp_text = resp_text[:-3]

                parsed = json.loads(resp_text.strip())
                shortened_title = parsed.get("shortened_title") or f"{clean_title} (Concise)"
                shortened_text = parsed.get("shortened_text") or ""
            except Exception as e:
                logger.warning(f"AI shortening call failed ({e}); falling back to rule-based shortening.")
                shortened_text = self._rule_based_shorten(
                    clean_title, clean_text, minister_name, programme_name, date_str
                )

        if not shortened_text.strip():
            shortened_text = self._rule_based_shorten(
                clean_title, clean_text, minister_name, programme_name, date_str
            )

        shortened_word_count = len(shortened_text.split())
        reduction_percentage = 0.0
        if original_word_count > 0:
            reduction_percentage = round(
                max(0.0, (1.0 - (shortened_word_count / original_word_count))) * 100.0,
                1,
            )

        return {
            "status": "success",
            "shortened_title": shortened_title,
            "shortened_text": shortened_text,
            "original_word_count": original_word_count,
            "shortened_word_count": shortened_word_count,
            "reduction_percentage": reduction_percentage,
            "minister": minister_name,
            "programme": programme_name,
            "service_date": date_str,
        }


report_shortener_service = ReportShortenerService()
report_shortener = report_shortener_service