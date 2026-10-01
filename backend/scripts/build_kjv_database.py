"""
DLBC KJV Context Database Builder (Step 4)

Builds backend/data/kjv/kjv_context.sqlite containing:
1. Full 66-book King James Version Protestant Canon (31,102 verses)
2. Comprehensive Biblical Proper-Name Index (BibleNLP + canonical entities)
3. Bible Book Aliases & Spoken Number Variations
4. KJV Speech Lexicon
5. DLBC / Church Vocabulary

All data is indexed locally in SQLite for token-free, sub-millisecond lookups.
"""

from __future__ import annotations

import argparse
import hashlib
import csv
import io
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "kjv"
SOURCE_FILES_DIR = DATA_DIR / "source_files"
DB_PATH = DATA_DIR / "kjv_context.sqlite"
FULL_JSON_PATH = DATA_DIR / "kjv_full.json"
METADATA_PATH = DATA_DIR / "source_metadata.json"

# Sources
KJV_SOURCE_URL = "https://cdn.jsdelivr.net/npm/kjv@1.0.0/json/verses-1769.json"
BIBLENLP_NAMES_URL = "https://raw.githubusercontent.com/BibleNLP/biblical-names-data/main/names.tsv"
EXPECTED_VERSES = 31102
# Recorded complete name index in the checked-in source_metadata.json.
EXPECTED_NAMES = 2808

BOOK_ORDER = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
    "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
    "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
    "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
    "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
    "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
]

BOOK_TO_NUMBER = {b: i + 1 for i, b in enumerate(BOOK_ORDER)}

ALIASES_MAP = {
    "Genesis": ["Gen", "Ge", "Gn"],
    "Exodus": ["Exod", "Exo", "Ex"],
    "Leviticus": ["Lev", "Le", "Lv"],
    "Numbers": ["Num", "Nu", "Nm", "Nb"],
    "Deuteronomy": ["Deut", "De", "Dt"],
    "Joshua": ["Josh", "Jos", "Jsh"],
    "Judges": ["Judg", "Jdg", "Jg", "Jdgs"],
    "Ruth": ["Rth", "Ru"],
    "1 Samuel": ["First Samuel", "1st Samuel", "1st Sam", "I Samuel", "1Sam", "1 Sa", "1S", "I Sam", "1 Sam"],
    "2 Samuel": ["Second Samuel", "2nd Samuel", "2nd Sam", "II Samuel", "2Sam", "2 Sa", "2S", "II Sam", "2 Sam"],
    "1 Kings": ["First Kings", "1st Kings", "I Kings", "1Kgs", "1 Ki", "1K", "I Kgs", "1 Kings", "1 Kgs"],
    "2 Kings": ["Second Kings", "2nd Kings", "II Kings", "2Kgs", "2 Ki", "2K", "II Kgs", "2 Kings", "2 Kgs"],
    "1 Chronicles": ["First Chronicles", "1st Chronicles", "I Chronicles", "1Chron", "1 Chr", "1Ch", "I Chr", "1 Chron"],
    "2 Chronicles": ["Second Chronicles", "2nd Chronicles", "II Chronicles", "2Chron", "2 Chr", "2Ch", "II Chr", "2 Chron"],
    "Ezra": ["Ezr"],
    "Nehemiah": ["Neh", "Ne"],
    "Esther": ["Esth", "Est", "Es"],
    "Job": ["Jb"],
    "Psalms": ["Psalm", "Psa", "Ps", "Psm"],
    "Proverbs": ["Prov", "Pro", "Pr", "Prv"],
    "Ecclesiastes": ["Eccles", "Ecc", "Ec", "Qoh"],
    "Song of Solomon": ["Song of Songs", "Song", "Canticles", "Canticle of Canticles", "SOS", "Cant"],
    "Isaiah": ["Isa", "Is"],
    "Jeremiah": ["Jer", "Je", "Jr"],
    "Lamentations": ["Lam", "La"],
    "Ezekiel": ["Ezek", "Eze", "Ezk"],
    "Daniel": ["Dan", "Da", "Dn"],
    "Hosea": ["Hos", "Ho"],
    "Joel": ["Joe", "Jl"],
    "Amos": ["Amo", "Am"],
    "Obadiah": ["Obad", "Ob"],
    "Jonah": ["Jnh", "Jon"],
    "Micah": ["Mic", "Mc"],
    "Nahum": ["Nah", "Na"],
    "Habakkuk": ["Hab", "Hb"],
    "Zephaniah": ["Zeph", "Zep", "Zp"],
    "Haggai": ["Hag", "Hg"],
    "Zechariah": ["Zech", "Zec", "Zc"],
    "Malachi": ["Mal", "Ml"],
    "Matthew": ["Matt", "Mat", "Mt"],
    "Mark": ["Mrk", "Mar", "Mk", "Mr"],
    "Luke": ["Luk", "Lk"],
    "John": ["Joh", "Jhn", "Jn"],
    "Acts": ["Act", "Ac", "Acts of the Apostles"],
    "Romans": ["Rom", "Ro", "Rm"],
    "1 Corinthians": ["First Corinthians", "1st Corinthians", "I Corinthians", "1Cor", "1 Co", "I Cor", "1 Cor"],
    "2 Corinthians": ["Second Corinthians", "2nd Corinthians", "II Corinthians", "2Cor", "2 Co", "II Cor", "2 Cor"],
    "Galatians": ["Gal", "Ga"],
    "Ephesians": ["Ephes", "Eph"],
    "Philippians": ["Phil", "Php", "Pp"],
    "Colossians": ["Col", "Cl"],
    "1 Thessalonians": ["First Thessalonians", "1st Thessalonians", "I Thessalonians", "1Thess", "1 Th", "I Thess", "1 Thess"],
    "2 Thessalonians": ["Second Thessalonians", "2nd Thessalonians", "II Thessalonians", "2Thess", "2 Th", "II Thess", "2 Thess"],
    "1 Timothy": ["First Timothy", "1st Timothy", "I Timothy", "1Tim", "1 Ti", "I Tim", "1 Tim"],
    "2 Timothy": ["Second Timothy", "2nd Timothy", "II Timothy", "2Tim", "2 Ti", "II Tim", "2 Tim"],
    "Titus": ["Tit", "Ti"],
    "Philemon": ["Philem", "Phm", "Pm"],
    "Hebrews": ["Heb"],
    "James": ["Jas", "Jm"],
    "1 Peter": ["First Peter", "1st Peter", "I Peter", "1Pet", "1 Pe", "1P", "I Pet", "1 Pet"],
    "2 Peter": ["Second Peter", "2nd Peter", "II Peter", "2Pet", "2 Pe", "2P", "II Pet", "2 Pet"],
    "1 John": ["First John", "1st John", "I John", "1Jn", "1 Jn", "1J", "I Jn", "1 John"],
    "2 John": ["Second John", "2nd John", "II John", "2Jn", "2 Jn", "2J", "II Jn", "2 John"],
    "3 John": ["Third John", "3rd John", "III John", "3Jn", "3 Jn", "3J", "III Jn", "3 John"],
    "Jude": ["Jud", "Jd"],
    "Revelation": ["The Revelation", "Revelations", "Rev", "Re", "Apocalypse"]
}


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


def norm(s: str) -> str:
    """Case-folds and normalizes whitespace and typographic apostrophes."""
    return " ".join(s.lower().replace("’", "'").replace("—", " ").replace("-", " ").split())


def clean_verse_text(text: str) -> str:
    text = text.lstrip("# ")
    text = text.replace("[", "").replace("]", "")
    return " ".join(text.split())


def build_database(output_path=None, corpus_path=None, source_files_dir=None, names_path=None):
    """Offline by default; never overwrites source assets or an existing output."""
    global DB_PATH, FULL_JSON_PATH, SOURCE_FILES_DIR, METADATA_PATH
    DB_PATH = Path(output_path or DB_PATH).resolve()
    FULL_JSON_PATH = Path(corpus_path or FULL_JSON_PATH).resolve()
    SOURCE_FILES_DIR = Path(source_files_dir or SOURCE_FILES_DIR).resolve()
    METADATA_PATH = DB_PATH.with_suffix(".metadata.json")
    if DB_PATH.exists() or METADATA_PATH.exists():
        raise FileExistsError("Output already exists; select a new output path. No files overwritten.")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Required local seeds must be available, never silently omitted.
    for required in (FULL_JSON_PATH, SOURCE_FILES_DIR / "kjv_speech_lexicon.txt", SOURCE_FILES_DIR / "dlbc_vocabulary_seed.json"):
        if not required.is_file():
            raise FileNotFoundError(f"Missing local source: {required}")
    start_time = time.perf_counter()
    print("=" * 60)
    print("DLBC KJV Context Database Builder")
    print("=" * 60)

    # -------------------------------------------------------------------------
    # 1. Fetch & Validate KJV 1769 Verses
    # -------------------------------------------------------------------------
    print(f"Reading local KJV corpus: {FULL_JSON_PATH}")
    source_bytes = FULL_JSON_PATH.read_bytes()
    local_corpus = json.loads(source_bytes.decode("utf-8-sig"))
    if all(isinstance(v, dict) for v in local_corpus.values()):
        kjv_data = {f"{book} {chapter}:{verse}": text
                    for book, chapters in local_corpus.items()
                    for chapter, verses in chapters.items() for verse, text in verses.items()}
    else:
        kjv_data = local_corpus
    ref_re = re.compile(r"^(?P<book>.+?)\s+(?P<chapter>\d+):(?P<verse>\d+)$")

    parsed_verses = []
    seen_books = set()

    for ref, raw_text in kjv_data.items():
        m = ref_re.match(ref.strip())
        if not m:
            continue
        book = m.group("book")
        if book == "Solomon's Song":
            book = "Song of Solomon"
        chapter = int(m.group("chapter"))
        verse = int(m.group("verse"))
        text = clean_verse_text(str(raw_text))
        book_num = BOOK_TO_NUMBER.get(book, 0)
        parsed_verses.append((
            "KJV",
            book,
            book_num,
            chapter,
            verse,
            f"{book} {chapter}:{verse}",
            text,
            norm(text),
        ))
        seen_books.add(book)

    print(f"Loaded {len(parsed_verses)} verses across {len(seen_books)} books.")
    if len(parsed_verses) != EXPECTED_VERSES:
        raise RuntimeError(f"Integrity failure: expected {EXPECTED_VERSES} verses, got {len(parsed_verses)}")
    if set(BOOK_ORDER) != seen_books:
        missing = set(BOOK_ORDER) - seen_books
        raise RuntimeError(f"Integrity failure: missing Protestant canon books: {missing}")

    # Local structured corpus is immutable; do not rewrite it.
    names_source = Path(names_path).resolve() if names_path else SOURCE_FILES_DIR / "names.tsv"
    names_source_available = names_source.is_file()
    names_complete = names_source_available
    if names_path and not names_complete:
        raise FileNotFoundError(f"Requested proper-name source is missing: {names_source}")
    if names_complete:
        names_tsv_bytes = names_source.read_bytes()
        reader = list(csv.DictReader(io.StringIO(names_tsv_bytes.decode("utf-8-sig")), delimiter="\t"))
        if not reader or not {"macula_eng", "ref"}.issubset(reader[0]):
            raise ValueError("names.tsv requires populated macula_eng and ref columns")
    else:
        print("PARTIAL NAMES: names.tsv absent; using documented canonical supplement only.")
        reader = []

    names_dict: dict[str, dict[str, Any]] = {}

    ignored_names = {"LORD", "God", "Father", "Son", "Spirit", "Holy Spirit", "Holy Ghost", "Almighty", "Most High"}

    for row in reader:
        eng = (row.get("macula_eng") or "").strip()
        ref = (row.get("ref") or "").strip()
        if not eng or eng in ignored_names:
            continue

        key = eng.strip()
        if key not in names_dict:
            names_dict[key] = {
                "canonical_name": key,
                "normalized_name": norm(key),
                "category": "person",  # refined below
                "aliases": set(),
                "occurrence_count": 0,
                "reference_examples": [],
            }

        names_dict[key]["occurrence_count"] += 1
        if ref and len(names_dict[key]["reference_examples"]) < 5:
            # Clean ref like 'LUK 1:5!15' -> 'LUK 1:5'
            clean_ref = ref.split("!")[0]
            if clean_ref not in names_dict[key]["reference_examples"]:
                names_dict[key]["reference_examples"].append(clean_ref)

    # Canonical supplement for names that appear with specific KJV spellings or compounds
    supplementary_entities = [
        ("Maher-shalal-hash-baz", ["Mahershalalhashbaz"], "person", ["ISA 8:1", "ISA 8:3"]),
        ("Mahershalalhashbaz", ["Maher-shalal-hash-baz"], "person", ["ISA 8:1", "ISA 8:3"]),
        ("Abiathar", ["Aviathar", "Abiatar"], "person", ["1SA 22:20", "2SA 15:24", "1KI 2:26", "MRK 2:26"]),
        ("Ahithophel", ["Achitophel"], "person", ["2SA 15:12", "2SA 16:20", "2SA 17:1"]),
        ("Mephibosheth", ["Merib-baal"], "person", ["2SA 4:4", "2SA 9:6", "2SA 16:1", "2SA 19:24"]),
        ("Melchizedek", ["Melchisedec", "Melchizedek"], "person", ["GEN 14:18", "PSA 110:4", "HEB 5:6", "HEB 7:1"]),
        ("Melchisedec", ["Melchizedek"], "person", ["HEB 5:6", "HEB 6:20", "HEB 7:1"]),
        ("Nebuchadnezzar", ["Nebuchadrezzar"], "person", ["2KI 24:1", "DAN 1:1", "JER 21:2"]),
        ("Zerubbabel", ["Zorobabel"], "person", ["EZR 2:2", "HAG 1:1", "ZEC 4:6", "MAT 1:12"]),
        ("Jehoshaphat", ["Josaphat"], "person", ["1KI 15:24", "2CH 17:1", "JOE 3:2"]),
        ("Chedorlaomer", [], "person", ["GEN 14:1"]),
        ("Tiglath-pileser", ["Tilgath-pilneser"], "person", ["2KI 15:29", "1CH 5:6"]),
        ("Epaphroditus", ["Epaphras"], "person", ["PHP 2:25", "PHP 4:18"]),
        ("Nicodemus", [], "person", ["JHN 3:1", "JHN 7:50", "JHN 19:39"]),
        ("Gamaliel", [], "person", ["ACT 5:34", "ACT 22:3"]),
        ("Onesimus", [], "person", ["PHM 1:10", "COL 4:9"]),
        ("Bartholomew", ["Nathanael"], "person", ["MAT 10:3", "MRK 3:18", "LUK 6:14", "ACT 1:13"]),
        ("Jerusalem", ["Zion", "Sion"], "place", ["2SA 5:5", "PSA 122:6", "MAT 23:37"]),
        ("Bethlehem", ["Bethlehem-judah", "Ephrath"], "place", ["MIC 5:2", "MAT 2:1", "LUK 2:4"]),
        ("Nazareth", [], "place", ["MAT 2:23", "LUK 1:26", "JHN 1:46"]),
        ("Capernaum", [], "place", ["MAT 4:13", "MAT 11:23", "JHN 6:59"]),
        ("Antioch", [], "place", ["ACT 11:26", "ACT 13:1", "GAL 2:11"]),
        ("Damascus", [], "place", ["GEN 14:15", "ACT 9:2", "2CO 11:32"]),
        ("Babylon", ["Babel"], "place", ["GEN 11:9", "JER 50:1", "REV 17:5"]),
        ("Nineveh", [], "place", ["GEN 10:11", "JON 1:2", "MAT 12:41"]),
        ("Egypt", ["Mizraim"], "place", ["GEN 12:10", "EXO 1:1", "MAT 2:13"]),
        ("Jordan", [], "place", ["GEN 13:10", "JOS 3:1", "MAT 3:6"]),
        ("Philistines", ["Philistine"], "people_group", ["1SA 17:1", "JDG 14:1"]),
        ("Moabites", ["Moab"], "people_group", ["RUT 1:4", "GEN 19:37"]),
        ("Edomites", ["Edom"], "people_group", ["GEN 36:1", "NUM 20:14"]),
        ("Ammonites", ["Ammon"], "people_group", ["GEN 19:38", "DEU 2:19"]),
        ("Samaritans", ["Samaritan"], "people_group", ["LUK 10:33", "JHN 4:9"]),
        ("Levites", ["Levi"], "tribe", ["EXO 32:26", "NUM 1:47", "HEB 7:11"]),
        ("Judah", ["Juda"], "tribe", ["GEN 29:35", "HEB 7:14", "REV 5:5"]),
        ("Benjamin", [], "tribe", ["GEN 35:18", "ROM 11:1", "PHP 3:5"]),
    ]

    for name, aliases, cat, refs in supplementary_entities:
        if name not in names_dict:
            names_dict[name] = {
                "canonical_name": name,
                "normalized_name": norm(name),
                "category": cat,
                "aliases": set(aliases),
                "occurrence_count": 1,
                "reference_examples": refs,
            }
        else:
            names_dict[name]["category"] = cat
            for a in aliases:
                names_dict[name]["aliases"].add(a)
            for r in refs:
                if r not in names_dict[name]["reference_examples"]:
                    names_dict[name]["reference_examples"].append(r)

    # Also add all 66 Bible books as proper names (category: 'book')
    for b in BOOK_ORDER:
        if b not in names_dict:
            names_dict[b] = {
                "canonical_name": b,
                "normalized_name": norm(b),
                "category": "book",
                "aliases": set(ALIASES_MAP.get(b, [])),
                "occurrence_count": 1,
                "reference_examples": [],
            }
        else:
            names_dict[b]["category"] = "book"
            for a in ALIASES_MAP.get(b, []):
                names_dict[b]["aliases"].add(a)

    print(f"Total biblical names indexed: {len(names_dict)}")

    # -------------------------------------------------------------------------
    # 3. Load KJV Speech Lexicon
    # -------------------------------------------------------------------------
    lexicon_file = SOURCE_FILES_DIR / "kjv_speech_lexicon.txt"
    kjv_vocab: set[str] = set()
    if lexicon_file.exists():
        for line in lexicon_file.read_text(encoding="utf-8").splitlines():
            w = line.strip().lower()
            if w and not w.startswith("#"):
                kjv_vocab.add(w)

    # Additional standard KJV speech words
    additional_kjv_vocab = [
        "thee", "thou", "thy", "thine", "ye", "hath", "doth", "saith", "shalt", "wilt",
        "art", "wert", "wast", "didst", "canst", "couldest", "shouldest", "wouldest",
        "cometh", "goeth", "maketh", "knoweth", "believeth", "abideth", "heareth", "giveth",
        "taketh", "leadeth", "walketh", "standeth", "dwelleth", "blesseth", "curseth",
        "behold", "verily", "wherefore", "wherein", "whereby", "thereof", "therein",
        "unto", "lest", "begat", "brethren", "iniquity", "righteousness", "sanctification",
        "justification", "tribulation", "peradventure", "shew", "sheweth", "whosoever",
        "whatsoever", "wherewithal", "therewith", "thereunto", "henceforth", "thereby",
        "forasmuch", "inasmuch", "heretofore", "howbeit", "anon", "nay", "hither", "thither"
    ]
    kjv_vocab.update(additional_kjv_vocab)
    print(f"Loaded {len(kjv_vocab)} KJV speech vocabulary terms.")

    # -------------------------------------------------------------------------
    # 4. Load DLBC / Church Vocabulary
    # -------------------------------------------------------------------------
    dlbc_vocab_file = SOURCE_FILES_DIR / "dlbc_vocabulary_seed.json"
    dlbc_terms = []
    if dlbc_vocab_file.exists():
        dlbc_terms = json.loads(dlbc_vocab_file.read_text(encoding="utf-8"))

    # Additional common DLBC terms
    additional_church_terms = [
        {"term": "Deeper Christian Life Ministry", "category": "organization", "aliases": ["DCLM"]},
        {"term": "International Bible Training Centre", "category": "organization", "aliases": ["IBTC"]},
        {"term": "Gospel Hymn and Songs", "category": "publication", "aliases": ["GHS"]},
        {"term": "Search the Scriptures", "category": "publication", "aliases": ["STS"]},
        {"term": "Life Press", "category": "organization", "aliases": []},
        {"term": "December Retreat", "category": "programme", "aliases": ["National Retreat"]},
        {"term": "Easter Retreat", "category": "programme", "aliases": []},
        {"term": "Youth Success Camp", "category": "programme", "aliases": ["YSC"]},
        {"term": "Campus Choir", "category": "ministry", "aliases": []},
        {"term": "Youth Choir", "category": "ministry", "aliases": []},
        {"term": "Adult Choir", "category": "ministry", "aliases": []},
    ]

    existing_terms = {t["term"].lower() for t in dlbc_terms}
    for item in additional_church_terms:
        if item["term"].lower() not in existing_terms:
            dlbc_terms.append(item)
            existing_terms.add(item["term"].lower())

    print(f"Loaded {len(dlbc_terms)} DLBC church vocabulary terms.")

    # -------------------------------------------------------------------------
    # 5. Populate SQLite Database
    # -------------------------------------------------------------------------

    print(f"Creating SQLite database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript("""
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    -- Verses table
    CREATE TABLE bible_verses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        translation TEXT NOT NULL DEFAULT 'KJV',
        book TEXT NOT NULL,
        book_number INTEGER NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL,
        text_normalized TEXT NOT NULL
    );

    CREATE INDEX idx_verses_ref ON bible_verses(reference);
    CREATE INDEX idx_verses_book_chap ON bible_verses(book, chapter);
    CREATE INDEX idx_verses_book_chap_ver ON bible_verses(book, chapter, verse);
    CREATE INDEX idx_verses_book_num ON bible_verses(book_number);

    -- Proper Names table
    CREATE TABLE bible_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_name TEXT NOT NULL UNIQUE,
        normalized_name TEXT NOT NULL,
        category TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        phonetic_key TEXT NOT NULL,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        reference_examples_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX idx_names_canonical ON bible_names(canonical_name);
    CREATE INDEX idx_names_normalized ON bible_names(normalized_name);
    CREATE INDEX idx_names_phonetic ON bible_names(phonetic_key);
    CREATE INDEX idx_names_category ON bible_names(category);

    -- Book Aliases table
    CREATE TABLE bible_aliases (
        alias TEXT PRIMARY KEY,
        canonical_book TEXT NOT NULL,
        book_number INTEGER NOT NULL
    );

    CREATE INDEX idx_aliases_canonical ON bible_aliases(canonical_book);

    -- KJV Speech Vocabulary table
    CREATE TABLE kjv_vocabulary (
        term TEXT PRIMARY KEY,
        normalized_term TEXT NOT NULL,
        notes TEXT
    );

    -- DLBC Church Vocabulary table
    CREATE TABLE church_vocabulary (
        term TEXT PRIMARY KEY,
        normalized_term TEXT NOT NULL,
        category TEXT,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1
    );
    """)

    # Insert verses
    print("Inserting verses...")
    cur.executemany(
        """
        INSERT INTO bible_verses (translation, book, book_number, chapter, verse, reference, text, text_normalized)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        parsed_verses,
    )

    # Insert proper names
    print("Inserting proper names...")
    names_tuples = []
    for item in names_dict.values():
        p_key = soundex(item["canonical_name"])
        names_tuples.append((
            item["canonical_name"],
            item["normalized_name"],
            item["category"],
            json.dumps(sorted(list(item["aliases"]))),
            p_key,
            item["occurrence_count"],
            json.dumps(item["reference_examples"]),
        ))

    cur.executemany(
        """
        INSERT OR REPLACE INTO bible_names (canonical_name, normalized_name, category, aliases_json, phonetic_key, occurrence_count, reference_examples_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        names_tuples,
    )

    # Insert aliases
    print("Inserting book aliases...")
    alias_rows = []
    for book, bnum in BOOK_TO_NUMBER.items():
        # Canonical name itself
        alias_rows.append((norm(book), book, bnum))
        # Direct aliases
        for alias in ALIASES_MAP.get(book, []):
            alias_rows.append((norm(alias), book, bnum))

    # Also add spoken numbers variations for numbered books
    spoken_num_map = {
        "1": ["first", "1st", "one"],
        "2": ["second", "2nd", "two"],
        "3": ["third", "3rd", "three"],
    }
    for b in BOOK_ORDER:
        bnum = BOOK_TO_NUMBER[b]
        for prefix, words in spoken_num_map.items():
            if b.startswith(f"{prefix} "):
                stem = b[2:]
                for w in words:
                    alias_rows.append((norm(f"{w} {stem}"), b, bnum))

    cur.executemany(
        "INSERT OR IGNORE INTO bible_aliases (alias, canonical_book, book_number) VALUES (?, ?, ?)",
        alias_rows,
    )

    # Insert KJV Vocabulary
    print("Inserting KJV vocabulary...")
    cur.executemany(
        "INSERT OR REPLACE INTO kjv_vocabulary (term, normalized_term, notes) VALUES (?, ?, ?)",
        [(w, norm(w), "KJV speech lexicon") for w in sorted(kjv_vocab)],
    )

    # Insert Church Vocabulary
    print("Inserting Church vocabulary...")
    cur.executemany(
        """
        INSERT OR REPLACE INTO church_vocabulary (term, normalized_term, category, aliases_json, notes, active)
        VALUES (?, ?, ?, ?, ?, 1)
        """,
        [
            (t["term"], norm(t["term"]), t.get("category"), json.dumps(t.get("aliases", [])), t.get("notes"))
            for t in dlbc_terms
        ],
    )

    conn.commit()

    # -------------------------------------------------------------------------
    # 6. Integrity Verification Queries
    # -------------------------------------------------------------------------
    print("Running database integrity checks...")
    cur.execute("SELECT COUNT(*) FROM bible_verses")
    verse_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT book) FROM bible_verses")
    book_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM bible_names")
    names_count = cur.fetchone()[0]
    # A populated but reduced TSV must not masquerade as the comprehensive asset.
    names_complete = names_complete and names_count == EXPECTED_NAMES

    cur.execute("SELECT COUNT(DISTINCT category) FROM bible_names")
    cat_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM kjv_vocabulary")
    kjv_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM church_vocabulary")
    church_count = cur.fetchone()[0]

    # Verify key test verses
    test_refs = ["Genesis 1:1", "Revelation 22:21", "2 Corinthians 12:9", "1 Timothy 6:5", "Deuteronomy 6:4"]
    for tr in test_refs:
        cur.execute("SELECT text FROM bible_verses WHERE reference = ?", (tr,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"Missing essential verse: {tr}")
        print(f"  Verified {tr}: {row[0][:40]}...")

    metadata_record = {
        "verse_corpus_complete": verse_count == EXPECTED_VERSES and book_count == 66,
        "proper_names_complete": names_complete,
        "missing_sources": [] if names_complete else ["Complete BibleNLP names.tsv (macula_eng, ref); expected 2,808 supplemented entries"],
        "corpus_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "names_sha256": hashlib.sha256(names_tsv_bytes).hexdigest() if names_source_available else None,
        "book_count": book_count, "verse_count": verse_count, "proper_names_count": names_count,
    }
    cur.execute("CREATE TABLE build_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    cur.executemany("INSERT INTO build_metadata VALUES (?, ?)",
                    [(key, json.dumps(value)) for key, value in metadata_record.items()])
    conn.commit()
    conn.close()

    # -------------------------------------------------------------------------
    # 7. Write Source Metadata
    # -------------------------------------------------------------------------
    elapsed = time.perf_counter() - start_time
    with sqlite3.connect(DB_PATH) as metadata_conn:
        categories = [row[0] for row in metadata_conn.execute("SELECT DISTINCT category FROM bible_names ORDER BY category").fetchall()]

    metadata = {
        **metadata_record,
        "title": "DLBC KJV Context & Biblical Knowledge Base",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "build_duration_seconds": round(elapsed, 2),
        "translation": "King James Version (KJV 1769)",
        "canon": "66-book Protestant Canon",
        "book_count": book_count,
        "verse_count": verse_count,
        "proper_names_count": names_count,
        "name_categories": categories,
        "kjv_vocabulary_count": kjv_count,
        "church_vocabulary_count": church_count,
        "sources": {
            "kjv_text": {
                "source": "npm kjv@1.0.0 (verses-1769.json)",
                "url": KJV_SOURCE_URL,
                "license": "Public Domain",
                "notes": "1769 Authorized Version with cleaned paragraph/supplied markers"
            },
            "biblical_proper_names": {
                "source": "Local names.tsv + Canonical Entities Supplement" if names_source_available else "Canonical Entities Supplement only",
                "url": BIBLENLP_NAMES_URL,
                "license": "Open Data / MIT",
                "notes": "Name coverage differs from the recorded complete index" if not names_complete else "Local name source matches recorded count; hash recorded for provenance"
            },
            "kjv_speech_lexicon": {
                "source": "DLBC KJV Verification Pack v3 (kjv_speech_lexicon.txt)",
                "notes": "Curated Early Modern English spoken forms"
            },
            "church_vocabulary": {
                "source": "DLBC Vocabulary Seed (dlbc_vocabulary_seed.json) + DLBC Standard Ministries",
                "notes": "Church programmes, leader names, and publications"
            }
        },
        "database_file": "kjv_context.sqlite",
        "database_size_bytes": DB_PATH.stat().st_size
    }

    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Wrote metadata: {METADATA_PATH}")

    print("=" * 60)
    print(f"BUILD COMPLETE in {elapsed:.2f}s!")
    print(f"  Books: {book_count}")
    print(f"  Verses: {verse_count:,}")
    print(f"  Biblical Proper Names: {names_count:,}")
    print(f"  Name Categories: {', '.join(categories)}")
    print(f"  KJV Vocabulary: {kjv_count}")
    print(f"  Church Vocabulary: {church_count}")
    print(f"  Database Size: {DB_PATH.stat().st_size / (1024 * 1024):.2f} MB")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build local KJV context offline, preserving source assets.")
    parser.add_argument("--output", type=Path, default=DB_PATH)
    parser.add_argument("--corpus", type=Path, default=FULL_JSON_PATH)
    parser.add_argument("--source-files", type=Path, default=SOURCE_FILES_DIR)
    parser.add_argument("--names", type=Path, help="Local BibleNLP names.tsv; absence produces honestly partial names readiness")
    args = parser.parse_args()
    build_database(args.output, args.corpus, args.source_files, args.names)

