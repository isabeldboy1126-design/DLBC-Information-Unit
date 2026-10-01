"""Provider response schema and local checks share the same typed contract."""
import re
from typing import List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ReporterExtraction(StrictOutput):
    speaker: str
    theme: str
    scriptures_cited: List[str]
    main_divisions: List[str]
    illustrations: List[str]
    key_admonitions: List[str]


class EditorialSelection(StrictOutput):
    kept_elements: List[str]
    compressed_elements: List[str]
    omitted_elements: List[str]


class WritingNotes(StrictOutput):
    structure_summary: str
    theological_focus: str


class ProofreadingChecks(StrictOutput):
    scripture_checks: List[str]
    names_checked: List[str]
    grammar_checked: bool
    anti_slop_passed: bool
    proofreader_notes: str


class ReportDraftOutput(StrictOutput):
    report_title: str = Field(min_length=1)
    theme: str
    scripture_reference: str
    minister: str
    service_date: str
    report_text: str = Field(min_length=1)
    reporter_extraction: ReporterExtraction
    editorial_selection: EditorialSelection
    writing_notes: WritingNotes
    proofreading: ProofreadingChecks

    @field_validator("report_title", "report_text")
    @classmethod
    def require_nonblank(cls, value):
        if not value.strip():
            raise ValueError("Report title and text must contain non-whitespace content")
        return value


FORBIDDEN_SLOP_PATTERNS = [
    r"\btapestry\b", r"\bbeacon\b", r"\bdive into\b", r"\bdelve\b",
    r"\btestament to\b", r"\bpivotal\b", r"\bgame-changer\b", r"\bin conclusion\b",
    r"\bfurthermore\b", r"\bit is worth noting\b", r"\bserves as\b", r"\bunpacking\b",
    r"\bdynamic journey\b", r"\bholistic landscape\b", r"\bmasterclass\b",
]


def validate_report_text(text):
    if not isinstance(text, str):
        raise ValueError("Report text must be a string")
    slop = sorted({match for pat in FORBIDDEN_SLOP_PATTERNS
                   for match in re.findall(pat, text, flags=re.IGNORECASE)})
    # A brief source may warrant a brief report. No arbitrary minimum length.
    return {"is_valid": bool(text.strip()) and not slop,
            "word_count": len(text.split()), "anti_slop_passed": not slop,
            "flagged_slop_terms": slop}
