"""
Verification Materiality Policy (Step 4)

Governs autonomous and human verification thresholds for DLBC sermon transcripts.

Core Principle:
The system's goal is NOT mechanical word-for-word perfection.
The goal is: Preserve factual meaning and prevent transcript errors from
causing a materially incorrect final report.

Classification Categories:
1. INCONSEQUENTIAL:
   - Grammatical variations that preserve meaning ("went unto" vs "went to")
   - Minor filler-word differences ("and", "so", "well")
   - Punctuation and capitalization differences
   - Harmless article/preposition differences ("a", "the", "in", "at")
   - Stylistic variations that cannot change the sermon/report meaning
   -> Automatically resolvable or non-actionable; does NOT consume human effort.

2. MEANING_RELEVANT:
   - Noun/verb substitutions that alter what happened
   - Omitted substantive clauses
   - Changed subject or object of an action
   - Substantive quotation wording differences
   -> Candidate for AI-assisted review; flags for editorial attention.

3. HIGH_RISK:
   - Negation reversals: can / cannot, is / is not, never / always
   - Numbers, counts, statistical facts
   - Dates, years, chronological markers
   - Bible chapter and verse references (e.g. 2 Corinthians 12:9)
   - Proper names: preacher names (W.F. Kumuyi), biblical persons/places
   - Doctrinal and salvation terminology (justification, sanctification, iniquity)
   - Direct Scripture quotation where exact biblical doctrine is at stake
   - Severe audio ambiguity or model disagreement on consequential phrases
   -> NEVER silently auto-corrected without high-confidence corroboration;
      must be surfaced for human verification if any uncertainty remains.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set


class MaterialityLevel(str, Enum):
    INCONSEQUENTIAL = "inconsequential"
    MEANING_RELEVANT = "meaning_relevant"
    HIGH_RISK = "high_risk"


@dataclass
class MaterialityAssessment:
    level: MaterialityLevel
    score: float  # 0.0 (negligible) to 1.0 (critical risk)
    reasons: List[str] = field(default_factory=list)
    risk_tags: List[str] = field(default_factory=list)
    requires_human_review: bool = False
    auto_resolvable: bool = False


# High-Risk Dictionaries & Patterns
NEGATION_WORDS: Set[str] = {
    "not", "no", "never", "cannot", "can't", "cant", "wont", "won't",
    "dont", "don't", "didnt", "didn't", "isnt", "isn't", "arent", "aren't",
    "wasnt", "wasn't", "werent", "weren't", "neither", "nor", "none", "nothing",
    "nowhere", "hardly", "scarcely", "barely"
}

DOCTRINE_WORDS: Set[str] = {
    "salvation", "saved", "righteousness", "sanctification", "justification",
    "redemption", "atonement", "repentance", "repent", "faith", "grace",
    "iniquity", "sin", "sins", "hell", "heaven", "eternity", "eternal",
    "born again", "holy ghost", "holy spirit", "trinity", "resurrection",
    "crucifixion", "damnation", "judgment", "covenant", "righteous", "unrighteous",
    "holiness", "consecration", "deliverance", "baptize", "baptism"
}

NUMBER_WORDS: Set[str] = {
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    "hundred", "thousand", "million", "billion", "first", "second", "third", "fourth", "fifth"
}

INCONSEQUENTIAL_PAIRS: List[Tuple[Set[str], Set[str]]] = [
    ({"unto"}, {"to"}),
    ({"upon"}, {"on"}),
    ({"into"}, {"in"}),
    ({"amongst"}, {"among"}),
    ({"whilst"}, {"while"}),
    ({"toward"}, {"towards"}),
]

FILLER_WORDS: Set[str] = {"um", "uh", "ah", "er", "you know", "like", "actually", "basically"}


def normalize_words(text: str) -> List[str]:
    """Extracts lowercase alphabetic/numeric tokens."""
    return re.findall(r"\b[A-Za-z0-9']+\b", text.lower())


def assess_transcript_materiality(
    original_text: str,
    candidate_text: str,
    external_flags: Optional[List[str]] = None,
) -> MaterialityAssessment:
    """
    Evaluates whether the difference between an original machine transcription
    and a candidate/verified text is INCONSEQUENTIAL, MEANING_RELEVANT, or HIGH_RISK.
    """
    reasons: List[str] = []
    risk_tags: List[str] = []
    orig_clean = original_text.strip()
    cand_clean = candidate_text.strip()

    # Exact or purely whitespace/punctuation match
    if orig_clean.lower() == cand_clean.lower():
        norm_orig = re.sub(r"[^a-z0-9]", "", orig_clean.lower())
        norm_cand = re.sub(r"[^a-z0-9]", "", cand_clean.lower())
        if norm_orig == norm_cand:
            return MaterialityAssessment(
                level=MaterialityLevel.INCONSEQUENTIAL,
                score=0.0,
                reasons=["Identical text or punctuation/capitalization only"],
                risk_tags=["punctuation_only"],
                requires_human_review=False,
                auto_resolvable=True,
            )

    orig_tokens = set(normalize_words(orig_clean))
    cand_tokens = set(normalize_words(cand_clean))
    diff_added = cand_tokens - orig_tokens
    diff_removed = orig_tokens - cand_tokens
    all_diffs = diff_added | diff_removed

    # 1. Check NEGATION (Critical High-Risk)
    neg_diff = all_diffs & NEGATION_WORDS
    if neg_diff:
        reasons.append(f"Negation difference detected: {', '.join(sorted(neg_diff))}")
        risk_tags.append("negation")

    # 2. Check NUMBERS / DIGITS / DATES (High-Risk)
    orig_digits = set(re.findall(r"\b\d+\b", orig_clean))
    cand_digits = set(re.findall(r"\b\d+\b", cand_clean))
    if orig_digits != cand_digits:
        reasons.append(f"Numerical digit mismatch: original={orig_digits}, candidate={cand_digits}")
        risk_tags.append("date_or_number")
    num_diff = all_diffs & NUMBER_WORDS
    if num_diff:
        reasons.append(f"Number word mismatch: {', '.join(sorted(num_diff))}")
        risk_tags.append("date_or_number")

    # 3. Check DOCTRINE / SALVATION terminology (High-Risk)
    doctrine_diff = all_diffs & DOCTRINE_WORDS
    if doctrine_diff:
        reasons.append(f"Doctrinal/salvation terminology difference: {', '.join(sorted(doctrine_diff))}")
        risk_tags.append("doctrinally_consequential_wording")

    # 4. Check SCRIPTURE REFERENCES (High-Risk)
    scripture_pattern = re.compile(
        r"\b(?:chapter|verse|genesis|exodus|corinthians|timothy|deuteronomy|psalms?|matthew|john|romans|revelation)\b",
        re.IGNORECASE,
    )
    if scripture_pattern.search(orig_clean) or scripture_pattern.search(cand_clean):
        # If words related to chapter/verse numbers changed
        if any(w in all_diffs for w in ("chapter", "verse", "verses")) or orig_digits != cand_digits:
            reasons.append("Scripture chapter/verse citation altered")
            risk_tags.append("scripture_reference")

    # 5. External flags passed in (e.g. manual flags, very low confidence)
    if external_flags:
        for f in external_flags:
            f_lower = f.lower()
            if "manual" in f_lower:
                reasons.append("Manual flag set by operator")
                risk_tags.append("manual_flag")
            elif "low_confidence" in f_lower:
                risk_tags.append("very_low_audio_confidence")

    # Determine Level based on findings
    if risk_tags:
        return MaterialityAssessment(
            level=MaterialityLevel.HIGH_RISK,
            score=0.90,
            reasons=reasons,
            risk_tags=risk_tags,
            requires_human_review=True,
            auto_resolvable=False,
        )

    # 6. Check Inconsequential substitutions (e.g. "went unto" -> "went to")
    is_inconsequential = False
    for pair_a, pair_b in INCONSEQUENTIAL_PAIRS:
        if (diff_removed == pair_a and diff_added == pair_b) or (diff_removed == pair_b and diff_added == pair_a):
            is_inconsequential = True
            reasons.append(f"Grammatical/stylistic equivalence: {'/'.join(pair_a)} vs {'/'.join(pair_b)}")
            risk_tags.append("stylistic_variation")
            break

    # Check filler words only
    if not is_inconsequential and all_diffs.issubset(FILLER_WORDS):
        is_inconsequential = True
        reasons.append("Filler word difference only")
        risk_tags.append("filler_word")

    if is_inconsequential:
        return MaterialityAssessment(
            level=MaterialityLevel.INCONSEQUENTIAL,
            score=0.15,
            reasons=reasons,
            risk_tags=risk_tags,
            requires_human_review=False,
            auto_resolvable=True,
        )

    # 7. Otherwise: Substantive meaning change
    return MaterialityAssessment(
        level=MaterialityLevel.MEANING_RELEVANT,
        score=0.55,
        reasons=[f"Substantive word difference: {', '.join(sorted(all_diffs)[:5])}"],
        risk_tags=["substantive_wording"],
        requires_human_review=True,
        auto_resolvable=False,
    )

