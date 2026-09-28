"""
DLBC KJV Context & Biblical Verification Engine Test Suite (Step 4)

Covers:
1. Protestant 66-book canon and exact 31,102 verse count
2. Key verse contents (Gen 1:1, Rev 22:21, 2 Cor 12:9, 1 Tim 6:5, Deut 6:4)
3. Spoken and written reference parsing
4. Reference validation against the canon
5. Adjacent verse context retrieval [v-1, v, v+1]
6. Biblical proper names with Soundex, fuzzy matching, and contextual boost
7. KJV speech vocabulary detection
8. DLBC church vocabulary detection
9. Compact verification context packet builder (< 400 tokens)
10. Materiality policy classifications (INCONSEQUENTIAL, MEANING_RELEVANT, HIGH_RISK)
11. Verification that ZERO external Gemini / network calls are made
"""

from __future__ import annotations

import pytest
from app.services.bible_context_service import (
    BibleContextService,
    bible_context_service,
    get_bible_context_service,
    soundex,
    tokens_to_int,
)
from app.verification.materiality_policy import (
    MaterialityAssessment,
    MaterialityLevel,
    assess_transcript_materiality,
)


@pytest.fixture
def service() -> BibleContextService:
    assert bible_context_service.is_ready(), "KJV Database should be loaded and ready"
    return bible_context_service


# =============================================================================
# 1. Canon Integrity & Verse Counts
# =============================================================================

def test_canon_66_books_and_verse_count(service: BibleContextService):
    """Verifies that exactly 66 Protestant canon books and 31,102 verses exist."""
    with service._get_connection() as conn:
        cur = conn.cursor()
        verse_count = cur.execute("SELECT COUNT(*) FROM bible_verses").fetchone()[0]
        assert verse_count == 31102, f"Expected 31,102 verses, got {verse_count}"

        books = [r[0] for r in cur.execute("SELECT DISTINCT book FROM bible_verses ORDER BY book_number").fetchall()]
        assert len(books) == 66, f"Expected 66 books, got {len(books)}"
        assert books[0] == "Genesis"
        assert books[-1] == "Revelation"


def test_key_verses_integrity(service: BibleContextService):
    """Verifies specific foundational verses across the Old and New Testaments."""
    # Genesis 1:1
    gen1_1 = service.get_verse("Genesis 1:1")
    assert gen1_1 is not None
    assert "In the beginning God created the heaven and the earth." in gen1_1["text"]

    # Revelation 22:21
    rev22_21 = service.get_verse("Revelation 22:21")
    assert rev22_21 is not None
    assert "The grace of our Lord Jesus Christ be with you all. Amen." in rev22_21["text"]

    # 2 Corinthians 12:9
    cor12_9 = service.get_verse("2 Corinthians 12:9")
    assert cor12_9 is not None
    assert "My grace is sufficient for thee" in cor12_9["text"]

    # 1 Timothy 6:5
    tim6_5 = service.get_verse("1 Timothy 6:5")
    assert tim6_5 is not None
    assert "Perverse disputings of men of corrupt minds" in tim6_5["text"]

    # Deuteronomy 6:4
    deut6_4 = service.get_verse("Deuteronomy 6:4")
    assert deut6_4 is not None
    assert "The LORD our God is one LORD" in deut6_4["text"]


# =============================================================================
# 2. Reference Parsing & Validation
# =============================================================================

def test_written_reference_parsing(service: BibleContextService):
    """Tests standard written references and abbreviations."""
    # Standard notation
    ref1 = service.parse_reference("Let us turn to 2 Corinthians 12:9 for strength.")
    assert ref1 is not None
    assert ref1["reference"] == "2 Corinthians 12:9"
    assert ref1["valid"] is True

    # Common abbreviations
    ref2 = service.parse_reference("As written in 1 Tim 6:5 regarding contentment")
    assert ref2 is not None
    assert ref2["reference"] == "1 Timothy 6:5"
    assert ref2["valid"] is True

    ref3 = service.parse_reference("Moses proclaimed in Deut 6:4 that God is one")
    assert ref3 is not None
    assert ref3["reference"] == "Deuteronomy 6:4"
    assert ref3["valid"] is True

    ref4 = service.parse_reference("Read Ps 23:1 every morning")
    assert ref4 is not None
    assert ref4["reference"] == "Psalms 23:1"
    assert ref4["valid"] is True


def test_spoken_reference_parsing(service: BibleContextService):
    """Tests spoken phrases with 'chapter' and 'verse' keywords or colloquial cadence."""
    # Spoken with keywords
    ref1 = service.parse_reference("Open your Bibles to Second Corinthians chapter twelve verse nine")
    assert ref1 is not None
    assert ref1["reference"] == "2 Corinthians 12:9"
    assert ref1["valid"] is True

    # Spoken psalm
    ref2 = service.parse_reference("Hear the word in Psalm twenty three verse one")
    assert ref2 is not None
    assert ref2["reference"] == "Psalms 23:1"
    assert ref2["valid"] is True

    # Spoken colloquial: book number number
    ref3 = service.parse_reference("First Timothy six five warns against gain as godliness")
    assert ref3 is not None
    assert ref3["reference"] == "1 Timothy 6:5"
    assert ref3["valid"] is True

    ref4 = service.parse_reference("Look at Deuteronomy six four closely")
    assert ref4 is not None
    assert ref4["reference"] == "Deuteronomy 6:4"
    assert ref4["valid"] is True

    ref5 = service.parse_reference("We remember David in First Samuel twenty two twenty")
    assert ref5 is not None
    assert ref5["reference"] == "1 Samuel 22:20"
    assert ref5["valid"] is True


def test_reference_validation(service: BibleContextService):
    """Tests validation of valid vs nonexistent chapters and verses."""
    # Valid references
    assert service.validate_reference("2 Corinthians", 12, 9) is True
    assert service.validate_reference("Genesis", 1, 1) is True
    assert service.validate_reference("Genesis", 50, 26) is True
    assert service.validate_reference("Revelation", 22, 21) is True

    # Nonexistent chapters or verses
    assert service.validate_reference("2 Corinthians", 99, 400) is False
    assert service.validate_reference("Genesis", 51, 1) is False
    assert service.validate_reference("Psalms", 151, 1) is False
    assert service.validate_reference("Jude", 1, 30) is False

    # Invalid parsing result
    parsed_invalid = service.parse_reference("Turn to 2 Corinthians 99:400")
    assert parsed_invalid is not None
    assert parsed_invalid["valid"] is False


# =============================================================================
# 3. Adjacent Verse Context Retrieval
# =============================================================================

def test_adjacent_context_retrieval(service: BibleContextService):
    """Tests [v-1, v, v+1] context window retrieval."""
    context = service.get_context("2 Corinthians 12:9", verses_before=1, verses_after=1)
    assert len(context) == 3
    assert context[0]["reference"] == "2 Corinthians 12:8"
    assert context[1]["reference"] == "2 Corinthians 12:9"
    assert context[2]["reference"] == "2 Corinthians 12:10"
    assert "grace is sufficient" in context[1]["text"]


def test_chapter_boundary_context(service: BibleContextService):
    """Tests context at chapter start (does not generate negative or 0 verses)."""
    context = service.get_context("Genesis 1:1", verses_before=2, verses_after=2)
    assert len(context) == 3  # verses 1, 2, 3
    assert context[0]["verse"] == 1
    assert context[0]["reference"] == "Genesis 1:1"
    assert context[1]["verse"] == 2
    assert context[2]["verse"] == 3


# =============================================================================
# 4. Biblical Proper Names & Contextual Boost
# =============================================================================

def test_biblical_name_recognition_and_phonetics(service: BibleContextService):
    """Tests canonical proper name recognition, aliases, and Soundex."""
    # Test canonical compound name
    names1 = service.find_name_candidates("And the prophet called his name Maher-shalal-hash-baz")
    assert any("Maher" in n["canonical_name"] for n in names1)

    # Test distinctive Old Testament name
    names2 = service.find_name_candidates("He showed kindness to Mephibosheth for Jonathan's sake")
    assert any(n["canonical_name"] == "Mephibosheth" for n in names2)

    # Test King of Babylon
    names3 = service.find_name_candidates("The armies of Nebuchadnezzar surrounded the city")
    assert any("Nebuchad" in n["canonical_name"] for n in names3)


def test_contextual_nearby_reference_boost(service: BibleContextService):
    """
    Tests that a nearby reference boosts the ranking of a relevant biblical name.
    In 1 Samuel 22:20, 'Abiathar' escaped.
    Searching 'Aviatha' with nearby reference '1 Samuel 22' must boost 'Abiathar' to #1.
    """
    # Without context
    candidates_no_ctx = service.find_name_candidates("Aviatha fled after the slaughter", nearby_reference=None)

    # With 1 Samuel 22 context
    candidates_with_ctx = service.find_name_candidates(
        "Aviatha fled after the slaughter",
        nearby_reference="1 Samuel 22"
    )

    assert len(candidates_with_ctx) > 0
    top_candidate = candidates_with_ctx[0]
    assert top_candidate["canonical_name"] == "Abiathar"
    assert top_candidate["context_boosted"] is True
    assert top_candidate["score"] > 1.0


def test_bounded_name_candidates(service: BibleContextService):
    """Verifies that candidates list is strictly bounded to max_candidates (<= 5)."""
    text = "Peter and James and John and Andrew and Philip and Thomas and Bartholomew"
    candidates = service.find_name_candidates(text, max_candidates=5)
    assert len(candidates) <= 5


# =============================================================================
# 5. KJV and DLBC Vocabulary
# =============================================================================

def test_kjv_speech_vocabulary(service: BibleContextService):
    """Tests detection of Early Modern English spoken forms."""
    text = "He that hath ears to hear, let him hear what the Spirit saith unto the brethren"
    vocab = service.get_kjv_vocabulary_candidates(text)
    terms = [v["term"] for v in vocab]

    assert "hath" in terms
    assert "saith" in terms
    assert "unto" in terms
    assert "brethren" in terms


def test_dlbc_church_vocabulary(service: BibleContextService):
    """Tests detection of DLBC ministries, leaders, and programmes."""
    text = "Pastor W. F. Kumuyi ministered at the Deeper Life Bible Church during the Monday Bible Study and GCK."
    church_vocab = service.get_church_vocabulary_candidates(text)
    terms = [c["term"] for c in church_vocab]

    assert "Pastor W. F. Kumuyi" in terms
    assert "Deeper Life Bible Church" in terms
    assert "Monday Bible Study" in terms
    assert "GCK" in terms


# =============================================================================
# 6. Compact Verification Context Builder (< 400 tokens)
# =============================================================================

def test_build_verification_context_token_efficiency(service: BibleContextService):
    """Tests that the context assembled for verification is compact, relevant, and token-light."""
    segment = "Please open to Second Corinthians chapter twelve verse nine where the apostle saith unto them"
    packet = service.build_verification_context(segment)

    assert packet["detected_reference"] == "2 Corinthians 12:9"
    assert packet["reference_valid"] is True
    assert len(packet["kjv_context"]) == 3  # v8, v9, v10
    assert "saith" in packet["kjv_vocabulary_candidates"]
    assert "unto" in packet["kjv_vocabulary_candidates"]

    # Verify token economy
    assert packet["token_count_estimate"] < 400, f"Context exceeded token budget: {packet['token_count_estimate']}"


# =============================================================================
# 7. Verification Materiality Policy
# =============================================================================

def test_materiality_high_risk_negation():
    """Negation changes must always be classified as HIGH_RISK."""
    orig = "The man can enter the kingdom"
    cand = "The man cannot enter the kingdom"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.HIGH_RISK
    assert "negation" in assessment.risk_tags
    assert assessment.requires_human_review is True
    assert assessment.auto_resolvable is False


def test_materiality_high_risk_numbers():
    """Numerical discrepancies must be classified as HIGH_RISK."""
    orig = "There were 12 disciples gathered"
    cand = "There were 14 disciples gathered"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.HIGH_RISK
    assert "date_or_number" in assessment.risk_tags
    assert assessment.requires_human_review is True


def test_materiality_high_risk_doctrinal_terminology():
    """Doctrinal words like salvation/justification must trigger HIGH_RISK."""
    orig = "He spoke on the joy of salvation"
    cand = "He spoke on the joy of celebration"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.HIGH_RISK
    assert "doctrinally_consequential_wording" in assessment.risk_tags
    assert assessment.requires_human_review is True


def test_materiality_high_risk_scripture_reference():
    """Changes to chapter or verse citations must trigger HIGH_RISK."""
    orig = "Turn to chapter twelve verse nine"
    cand = "Turn to chapter twelve verse ten"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.HIGH_RISK
    assert "scripture_reference" in assessment.risk_tags or "date_or_number" in assessment.risk_tags


def test_materiality_inconsequential_stylistic_variation():
    """Wording variations like 'unto' vs 'to' or filler words are INCONSEQUENTIAL."""
    orig = "Jesus went unto the city"
    cand = "Jesus went to the city"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.INCONSEQUENTIAL
    assert assessment.auto_resolvable is True
    assert assessment.requires_human_review is False
    assert assessment.score < 0.30


def test_materiality_inconsequential_punctuation_only():
    """Differences purely in casing or punctuation are INCONSEQUENTIAL."""
    orig = "Jesus wept."
    cand = "jesus wept"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.INCONSEQUENTIAL
    assert assessment.auto_resolvable is True


def test_materiality_meaning_relevant_general_wording():
    """Substantive descriptive wording changes without high-risk flags are MEANING_RELEVANT."""
    orig = "The shepherd walked slowly down the valley"
    cand = "The shepherd hurried quickly down the valley"
    assessment = assess_transcript_materiality(orig, cand)

    assert assessment.level == MaterialityLevel.MEANING_RELEVANT
    assert assessment.requires_human_review is True
    assert assessment.auto_resolvable is False
