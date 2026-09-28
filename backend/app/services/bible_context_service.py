"""
DLBC Local KJV + Biblical Context Engine (Step 4)

Provides high-speed, token-free, deterministic local context for transcript verification:
1. Protestant 66-book KJV 1769 verse lookup (31,102 verses)
2. Spoken and written Bible reference parsing and validation
3. Adjacent verse context retrieval [v-1, v, v+1]
4. Biblical proper-name recognition with Soundex phonetic matching,
   fuzzy distance matching, and contextual nearby-reference boosting
5. KJV Early Modern English speech vocabulary detection
6. DLBC / church vocabulary recognition
7. Token-efficient verification context packet builder

This module executes entirely locally against backend/data/kjv/kjv_context.sqlite.
It makes ZERO external AI / Gemini calls.
"""

from __future__ import annotations

import difflib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "kjv" / "kjv_context.sqlite"

# Spoken and Ordinal Number Mappings
NUMBER_WORDS: Dict[str, int] = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "hundred": 100,
    # Ordinals
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15,
    "sixteenth": 16, "seventeenth": 17, "eighteenth": 18, "nineteenth": 19,
    "twentieth": 20, "thirtieth": 30, "fortieth": 40, "fiftieth": 50,
    "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5,
}

TENS_WORDS = {20, 30, 40, 50, 60, 70, 80, 90}


def soundex(name: str) -> str:
    """Calculates standard American Soundex phonetic key for a word."""
    clean = re.sub(r"[^A-Za-z]", "", name).upper()
    if not clean:
        return "0000"
    mapping = {
        'B': '1', 'F': '1', 'P': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6',
    }
    first_letter = clean[0]
    tail = clean[1:]
    encoded = []
    prev_code = mapping.get(first_letter, '0')
    for char in tail:
        code = mapping.get(char, '0')
        if code != '0':
            if code != prev_code:
                encoded.append(code)
            prev_code = code
        else:
            prev_code = '0'
    return (first_letter + "".join(encoded) + "000")[:4]


def tokens_to_int(tokens: List[str]) -> Tuple[Optional[int], int]:
    """
    Parses a number from the start of a token list.
    Supports digits ("12"), single words ("twelve"), compound hyphens ("twenty-three"),
    multi-word numbers ("twenty three", "one hundred nineteen"), and ordinals ("first").
    Returns (integer_value, tokens_consumed).
    """
    if not tokens:
        return None, 0

    t0 = tokens[0].lower().strip(",.;:()\"'")

    # Raw digits
    if t0.isdigit():
        return int(t0), 1

    # Hyphenated numbers like "twenty-three"
    if "-" in t0:
        parts = t0.split("-")
        if len(parts) == 2 and parts[0] in NUMBER_WORDS and parts[1] in NUMBER_WORDS:
            val = NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]]
            return val, 1

    if t0 not in NUMBER_WORDS:
        return None, 0

    val = NUMBER_WORDS[t0]
    consumed = 1

    # Check for "one hundred [and] [X]"
    if len(tokens) > 1 and tokens[1].lower().strip(",.;:()\"'") == "hundred":
        val = val * 100
        consumed = 2
        idx = 2
        if len(tokens) > idx and tokens[idx].lower().strip(",.;:()\"'") == "and":
            idx += 1
        if len(tokens) > idx:
            sub_val, sub_cons = tokens_to_int(tokens[idx:])
            if sub_val is not None:
                return val + sub_val, idx + sub_cons
        return val, consumed

    # Check for tens + units: "twenty" followed by "three"
    if val in TENS_WORDS and len(tokens) > 1:
        t1 = tokens[1].lower().strip(",.;:()\"'")
        if t1 in NUMBER_WORDS and 1 <= NUMBER_WORDS[t1] <= 9:
            return val + NUMBER_WORDS[t1], 2

    return val, consumed


class BibleContextService:
    """
    Central local service for KJV scripture lookup, reference parsing,
    proper-name fuzzy matching, and token-efficient context assembly.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self._aliases: Dict[str, str] = {}
        self._kjv_vocab: Dict[str, str] = {}
        self._church_vocab: List[Dict[str, Any]] = []
        self._all_names: List[Dict[str, Any]] = []
        self._names_by_phonetic: Dict[str, List[Dict[str, Any]]] = {}
        self._initialized = False

        if self.db_path.exists():
            self._init_in_memory_indexes()

    def _get_connection(self) -> sqlite3.Connection:
        """Returns a read-only SQLite connection."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"KJV SQLite database not found at {self.db_path}")
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_in_memory_indexes(self) -> None:
        """Caches compact reference mappings and vocabulary into memory for microsecond lookups."""
        try:
            with self._get_connection() as conn:
                cur = conn.cursor()

                # 1. Book aliases
                for row in cur.execute("SELECT alias, canonical_book FROM bible_aliases"):
                    self._aliases[row["alias"].lower()] = row["canonical_book"]

                # 2. KJV Speech Vocabulary
                for row in cur.execute("SELECT term, notes FROM kjv_vocabulary"):
                    self._kjv_vocab[row["term"].lower()] = row["notes"] or ""

                # 3. Church Vocabulary
                for row in cur.execute("SELECT term, normalized_term, category, aliases_json FROM church_vocabulary"):
                    aliases = json.loads(row["aliases_json"]) if row["aliases_json"] else []
                    self._church_vocab.append({
                        "term": row["term"],
                        "normalized_term": row["normalized_term"],
                        "category": row["category"],
                        "aliases": aliases,
                    })

                # 4. Biblical Proper Names
                for row in cur.execute(
                    "SELECT canonical_name, normalized_name, category, aliases_json, phonetic_key, reference_examples_json "
                    "FROM bible_names"
                ):
                    aliases = json.loads(row["aliases_json"]) if row["aliases_json"] else []
                    ref_examples = json.loads(row["reference_examples_json"]) if row["reference_examples_json"] else []
                    p_key = row["phonetic_key"]
                    name_entry = {
                        "canonical_name": row["canonical_name"],
                        "normalized_name": row["normalized_name"],
                        "category": row["category"],
                        "aliases": aliases,
                        "phonetic_key": p_key,
                        "reference_examples": ref_examples,
                    }
                    self._all_names.append(name_entry)
                    self._names_by_phonetic.setdefault(p_key, []).append(name_entry)

            self._initialized = True
        except Exception as e:
            # Fallback if DB is being built or unavailable
            self._initialized = False

    def is_ready(self) -> bool:
        """Returns True if the database and in-memory caches are loaded."""
        return self._initialized and self.db_path.exists()

    # -------------------------------------------------------------------------
    # 1. Reference Parsing & Validation
    # -------------------------------------------------------------------------

    def parse_reference(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Extracts and parses a Bible reference from spoken or written text.
        Supports:
        - Written: "2 Corinthians 12:9", "1 Tim 6:5", "Deut 6:4", "Ps 23:1"
        - Spoken with keywords: "Second Corinthians chapter twelve verse nine", "Psalm twenty three verse one"
        - Spoken colloquial: "First Timothy six five", "Deuteronomy six four", "First Samuel twenty two twenty"
        
        Returns:
            {
                "book": str,
                "chapter": int,
                "verse": int,
                "reference": str,
                "matched_text": str,
                "valid": bool
            }
        or None if no Bible reference pattern is detected.
        """
        if not text or not self._aliases:
            return None

        # Clean text preserving tokens
        clean_text = text.strip()

        # Strategy A: Written standard notation (e.g. "2 Corinthians 12:9", "1 Tim 6:5")
        written_pattern = re.compile(
            r"\b([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+)\s*[:.]\s*(\d+)\b"
        )
        for match in written_pattern.finditer(clean_text):
            candidate_book = " ".join(match.group(1).lower().split())
            if candidate_book in self._aliases:
                canonical_book = self._aliases[candidate_book]
                chapter = int(match.group(2))
                verse = int(match.group(3))
                ref_str = f"{canonical_book} {chapter}:{verse}"
                is_valid = self.validate_reference(canonical_book, chapter, verse)
                return {
                    "book": canonical_book,
                    "chapter": chapter,
                    "verse": verse,
                    "reference": ref_str,
                    "matched_text": match.group(0),
                    "valid": is_valid,
                }

        # Strategy B: Token-based scan for spoken book names and numbers
        # Extract word and digit tokens
        raw_tokens = re.findall(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?", clean_text)
        n = len(raw_tokens)

        skip_words = {"chapter", "chap", "ch", "verse", "verses", "v", "vs", "and"}

        for i in range(n):
            for book_len in (3, 2, 1):
                if i + book_len <= n:
                    candidate_book_str = " ".join(raw_tokens[i:i + book_len]).lower()
                    if candidate_book_str in self._aliases:
                        canonical_book = self._aliases[candidate_book_str]
                        pos = i + book_len

                        # Skip optional 'chapter'
                        if pos < n and raw_tokens[pos].lower() in ("chapter", "chap", "ch"):
                            pos += 1

                        chap, cons1 = tokens_to_int(raw_tokens[pos:])
                        if chap is not None and cons1 > 0:
                            pos += cons1

                            # Skip optional 'verse' / 'verses' / 'and'
                            if pos < n and raw_tokens[pos].lower() in ("verse", "verses", "v", "vs", "and"):
                                pos += 1

                            verse, cons2 = tokens_to_int(raw_tokens[pos:])
                            if verse is not None and cons2 > 0:
                                end_pos = pos + cons2
                                matched_substr = " ".join(raw_tokens[i:end_pos])
                                ref_str = f"{canonical_book} {chap}:{verse}"
                                is_valid = self.validate_reference(canonical_book, chap, verse)
                                return {
                                    "book": canonical_book,
                                    "chapter": chap,
                                    "verse": verse,
                                    "reference": ref_str,
                                    "matched_text": matched_substr,
                                    "valid": is_valid,
                                }

        return None

    def validate_reference(self, book: str, chapter: int, verse: int) -> bool:
        """
        Verifies whether a reference exists in the Protestant 66-book KJV canon.
        Accepts book names or aliases.
        """
        canonical_book = self._aliases.get(book.lower().strip(), book)
        try:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT 1 FROM bible_verses WHERE book = ? AND chapter = ? AND verse = ? LIMIT 1",
                    (canonical_book, chapter, verse),
                )
                return cur.fetchone() is not None
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # 2. Verse & Context Lookup
    # -------------------------------------------------------------------------

    def get_verse(self, reference_or_book: str, chapter: Optional[int] = None, verse: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single verse by reference string or (book, chapter, verse).
        Returns {book, book_number, chapter, verse, reference, text} or None.
        """
        if chapter is not None and verse is not None:
            canonical_book = self._aliases.get(reference_or_book.lower().strip(), reference_or_book)
            ref_str = f"{canonical_book} {chapter}:{verse}"
        else:
            parsed = self.parse_reference(reference_or_book)
            if not parsed:
                return None
            canonical_book = parsed["book"]
            chapter = parsed["chapter"]
            verse = parsed["verse"]
            ref_str = parsed["reference"]

        try:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT book, book_number, chapter, verse, reference, text FROM bible_verses WHERE book = ? AND chapter = ? AND verse = ?",
                    (canonical_book, chapter, verse),
                )
                row = cur.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception:
            return None

    def get_context(self, reference: str, verses_before: int = 1, verses_after: int = 1) -> List[Dict[str, Any]]:
        """
        Retrieves adjacent verses within the same chapter [v - before, v, v + after].
        e.g., for "2 Corinthians 12:9" returns verses 8, 9, 10.
        """
        parsed = self.parse_reference(reference)
        if not parsed or not parsed["valid"]:
            return []

        canonical_book = parsed["book"]
        chapter = parsed["chapter"]
        verse = parsed["verse"]

        start_verse = max(1, verse - verses_before)
        end_verse = verse + verses_after

        try:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT book, book_number, chapter, verse, reference, text "
                    "FROM bible_verses "
                    "WHERE book = ? AND chapter = ? AND verse BETWEEN ? AND ? "
                    "ORDER BY verse ASC",
                    (canonical_book, chapter, start_verse, end_verse),
                )
                return [dict(row) for row in cur.fetchall()]
        except Exception:
            return []

    # -------------------------------------------------------------------------
    # 3. Biblical Proper Names with Contextual Boost
    # -------------------------------------------------------------------------

    def find_name_candidates(
        self,
        text: str,
        nearby_reference: Optional[str] = None,
        max_candidates: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Scans text for biblical proper names, misspellings, or phonetic variants.
        Applies a contextual score boost if the candidate name appears in the
        verses of a supplied nearby reference (e.g. "1 Samuel 22").
        Bounds output to top max_candidates (default 5, max 8).
        """
        if not text or not self._all_names:
            return []

        # Extract tokens and candidate multi-word entities
        tokens = re.findall(r"\b[A-Za-z]+(?:-[A-Za-z]+)*\b", text)
        if not tokens:
            return []

        # Parse nearby reference for chapter-level contextual checking
        nearby_book: Optional[str] = None
        nearby_chapter: Optional[int] = None
        chapter_verses_text: str = ""

        if nearby_reference:
            parsed_nearby = self.parse_reference(nearby_reference)
            if parsed_nearby:
                nearby_book = parsed_nearby["book"]
                nearby_chapter = parsed_nearby["chapter"]
            else:
                # Try simple "Book Chapter" pattern like "1 Samuel 22"
                m_chap = re.match(r"^([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+)$", nearby_reference.strip())
                if m_chap:
                    candidate_b = " ".join(m_chap.group(1).lower().split())
                    if candidate_b in self._aliases:
                        nearby_book = self._aliases[candidate_b]
                        nearby_chapter = int(m_chap.group(2))

            if nearby_book and nearby_chapter:
                try:
                    with self._get_connection() as conn:
                        cur = conn.cursor()
                        cur.execute(
                            "SELECT text FROM bible_verses WHERE book = ? AND chapter = ?",
                            (nearby_book, nearby_chapter),
                        )
                        rows = cur.fetchall()
                        chapter_verses_text = " ".join([r["text"] for r in rows]).lower()
                except Exception:
                    pass

        # Score candidates across unique tokens
        scored: Dict[str, Dict[str, Any]] = {}
        unique_tokens = {t for t in tokens if len(t) >= 3}

        for token in unique_tokens:
            t_lower = token.lower()
            len_t = len(t_lower)
            t_soundex = soundex(token)

            for entry in self._all_names:
                c_name = entry["canonical_name"]
                n_name = entry["normalized_name"]
                p_key = entry["phonetic_key"]
                aliases = [a.lower() for a in entry["aliases"]]

                score = 0.0
                match_type = "none"

                # 1. Exact match
                if t_lower == n_name or t_lower in aliases:
                    score = 1.0
                    match_type = "exact"
                # 2. Soundex match
                elif t_soundex == p_key:
                    sim = difflib.SequenceMatcher(None, t_lower, n_name).ratio()
                    score = 0.70 + (sim * 0.20)
                    match_type = "phonetic"
                # 3. Fuzzy similarity match (with mathematical length filter)
                else:
                    len_n = len(n_name)
                    if (2 * min(len_t, len_n) / (len_t + len_n)) >= 0.75:
                        sim = difflib.SequenceMatcher(None, t_lower, n_name).ratio()
                        for alias in aliases:
                            len_a = len(alias)
                            if (2 * min(len_t, len_a) / (len_t + len_a)) >= 0.75:
                                a_sim = difflib.SequenceMatcher(None, t_lower, alias).ratio()
                                if a_sim > sim:
                                    sim = a_sim
                        if sim >= 0.75:
                            score = sim * 0.85
                            match_type = "fuzzy"

                if score > 0.0:
                    # 4. Apply Contextual Boost
                    boost = 0.0
                    context_matched = False

                    # Check if the name appears in the chapter's verses
                    if chapter_verses_text and n_name in chapter_verses_text:
                        boost += 0.35
                        context_matched = True

                    # Check if reference examples match nearby reference
                    if nearby_book and not context_matched:
                        for ref_ex in entry["reference_examples"]:
                            if nearby_book.lower()[:3] in ref_ex.lower() or (nearby_chapter and f"{nearby_chapter}:" in ref_ex):
                                boost += 0.25
                                context_matched = True
                                break

                    final_score = round(min(1.5, score + boost), 3)

                    if c_name not in scored or final_score > scored[c_name]["score"]:
                        scored[c_name] = {
                            "canonical_name": c_name,
                            "category": entry["category"],
                            "phonetic_key": p_key,
                            "match_type": match_type,
                            "score": final_score,
                            "context_boosted": context_matched,
                            "reference_examples": entry["reference_examples"][:3],
                        }

        sorted_results = sorted(scored.values(), key=lambda x: x["score"], reverse=True)
        limit = min(max(max_candidates, 1), 8)
        return sorted_results[:limit]

    # -------------------------------------------------------------------------
    # 4. KJV Speech Vocabulary
    # -------------------------------------------------------------------------

    def get_kjv_vocabulary_candidates(self, text: str) -> List[Dict[str, str]]:
        """
        Scans text for Early Modern English / KJV spoken vocabulary words
        (e.g., "thee", "thou", "saith", "hath", "cometh", "brethren").
        """
        if not text or not self._kjv_vocab:
            return []

        tokens = re.findall(r"\b[A-Za-z]+\b", text.lower())
        detected = []
        seen = set()

        for t in tokens:
            if t in self._kjv_vocab and t not in seen:
                seen.add(t)
                detected.append({
                    "term": t,
                    "notes": self._kjv_vocab[t],
                })

        return detected

    # -------------------------------------------------------------------------
    # 5. DLBC Church Vocabulary
    # -------------------------------------------------------------------------

    def get_church_vocabulary_candidates(self, text: str) -> List[Dict[str, Any]]:
        """
        Scans text for DLBC / church specific terms, leader names, and programmes
        (e.g. "Pastor W. F. Kumuyi", "Deeper Life Bible Church", "GCK", "Monday Bible Study").
        """
        if not text or not self._church_vocab:
            return []

        t_lower = " " + " ".join(text.lower().replace("’", "'").replace(".", " ").split()) + " "
        detected = []
        seen = set()

        for item in self._church_vocab:
            term = item["term"]
            term_clean = " ".join(term.lower().replace(".", " ").split())
            
            # Check primary term
            matched = False
            if f" {term_clean} " in t_lower:
                matched = True
            else:
                # Check aliases
                for a in item["aliases"]:
                    a_clean = " ".join(a.lower().replace(".", " ").split())
                    if f" {a_clean} " in t_lower:
                        matched = True
                        break

            if matched and term not in seen:
                seen.add(term)
                detected.append({
                    "term": term,
                    "category": item["category"],
                })

        return detected

    # -------------------------------------------------------------------------
    # 6. Compact Verification Context Builder
    # -------------------------------------------------------------------------

    def build_verification_context(
        self,
        transcript_text: str,
        nearby_reference: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Assembles a token-efficient local context packet for a transcript segment.
        Contains ONLY the necessary verses, candidate names, and vocabulary.
        Never transmits full books or exhaustive name lists.
        """
        parsed_ref = self.parse_reference(transcript_text)
        target_ref = parsed_ref["reference"] if (parsed_ref and parsed_ref["valid"]) else nearby_reference

        kjv_context: List[Dict[str, Any]] = []
        if target_ref:
            kjv_context = self.get_context(target_ref, verses_before=1, verses_after=1)

        name_candidates = self.find_name_candidates(
            text=transcript_text,
            nearby_reference=target_ref,
            max_candidates=5,
        )

        kjv_vocab = self.get_kjv_vocabulary_candidates(transcript_text)
        church_vocab = self.get_church_vocabulary_candidates(transcript_text)

        # Estimate compact token size (approx 4 chars per token)
        raw_chars = (
            sum(len(v.get("text", "")) for v in kjv_context)
            + sum(len(n["canonical_name"]) for n in name_candidates)
            + sum(len(k["term"]) for k in kjv_vocab)
            + sum(len(c["term"]) for c in church_vocab)
            + len(transcript_text)
        )
        est_tokens = max(1, raw_chars // 4)

        return {
            "detected_reference": parsed_ref["reference"] if parsed_ref else None,
            "reference_valid": parsed_ref["valid"] if parsed_ref else None,
            "reference_matched_text": parsed_ref["matched_text"] if parsed_ref else None,
            "kjv_context": kjv_context,
            "verses": kjv_context,
            "biblical_name_candidates": name_candidates,
            "biblical_names": [n["canonical_name"] for n in name_candidates],
            "kjv_vocabulary_candidates": [k["term"] for k in kjv_vocab],
            "church_terms": church_vocab,
            "dlbc_terms": [c["term"] for c in church_vocab],
            "token_count_estimate": est_tokens,
        }


# Singleton Instance
bible_context_service = BibleContextService()


def get_bible_context_service() -> BibleContextService:
    """Dependency provider for BibleContextService."""
    return bible_context_service
