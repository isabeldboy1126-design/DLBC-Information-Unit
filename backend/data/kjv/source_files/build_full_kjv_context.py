"""
Downloads and indexes the complete 66-book King James Version for local
DLBC transcript verification.

Run on a machine with internet access:
    python build_full_kjv_context.py

Outputs:
    kjv_full.json
    kjv_context.sqlite

The default source is the `kjv` npm package's machine-readable 1769 KJV.
The script checks 66 books / 31,102 verses before accepting the corpus.
"""
from __future__ import annotations

import json
import re
import sqlite3
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FULL_JSON = ROOT / "kjv_full.json"
DB = ROOT / "kjv_context.sqlite"

# Whole 1769 KJV as a reference -> verse mapping.
SOURCE_URL = "https://cdn.jsdelivr.net/npm/kjv@1.0.0/json/verses-1769.json"
EXPECTED_VERSES = 31102

BOOK_ORDER = [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth",
    "1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah",
    "Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah",
    "Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum",
    "Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts",
    "Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians",
    "1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James",
    "1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"
]

ALIASES = {
    "Psalms": ["Psalm"],
    "Song of Solomon": ["Song of Songs", "Canticles"],
    "1 Samuel": ["First Samuel", "I Samuel"],
    "2 Samuel": ["Second Samuel", "II Samuel"],
    "1 Kings": ["First Kings", "I Kings"],
    "2 Kings": ["Second Kings", "II Kings"],
    "1 Chronicles": ["First Chronicles", "I Chronicles"],
    "2 Chronicles": ["Second Chronicles", "II Chronicles"],
    "1 Corinthians": ["First Corinthians", "I Corinthians"],
    "2 Corinthians": ["Second Corinthians", "II Corinthians"],
    "1 Thessalonians": ["First Thessalonians", "I Thessalonians"],
    "2 Thessalonians": ["Second Thessalonians", "II Thessalonians"],
    "1 Timothy": ["First Timothy", "I Timothy"],
    "2 Timothy": ["Second Timothy", "II Timothy"],
    "1 Peter": ["First Peter", "I Peter"],
    "2 Peter": ["Second Peter", "II Peter"],
    "1 John": ["First John", "I John"],
    "2 John": ["Second John", "II John"],
    "3 John": ["Third John", "III John"],
    "Revelation": ["The Revelation", "Revelations"]
}

REF_RE = re.compile(r"^(?P<book>.+?)\s+(?P<chapter>\d+):(?P<verse>\d+)$")

def norm(s: str) -> str:
    return " ".join(s.lower().replace("’", "'").split())

def fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "DLBC-KJV-Context-Builder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def clean_verse_text(text: str) -> str:
    # The source uses a leading # for paragraph starts and [] for italicized
    # supplied words. Preserve the actual words while removing layout markers.
    text = text.lstrip("# ")
    text = text.replace("[", "").replace("]", "")
    return " ".join(text.split())

def main():
    print("Downloading complete KJV...")
    verses = fetch_json(SOURCE_URL)
    if not isinstance(verses, dict):
        raise RuntimeError("Unexpected source schema: expected reference->text object")

    parsed = []
    seen_books = set()
    for ref, raw_text in verses.items():
        m = REF_RE.match(ref.strip())
        if not m:
            continue
        book = m.group("book")
        chapter = int(m.group("chapter"))
        verse = int(m.group("verse"))
        text = clean_verse_text(str(raw_text))
        parsed.append((book, chapter, verse, f"{book} {chapter}:{verse}", text, norm(text)))
        seen_books.add(book)

    if len(parsed) != EXPECTED_VERSES:
        raise RuntimeError(f"Expected {EXPECTED_VERSES} verses, got {len(parsed)}")
    if set(BOOK_ORDER) != seen_books:
        missing = set(BOOK_ORDER) - seen_books
        extra = seen_books - set(BOOK_ORDER)
        raise RuntimeError(f"Book mismatch. Missing={sorted(missing)} Extra={sorted(extra)}")

    # Save a normalized full JSON for easy application import.
    structured = {b: {} for b in BOOK_ORDER}
    for book, chapter, verse, ref, text, _ in parsed:
        structured[book].setdefault(str(chapter), {})[str(verse)] = text
    FULL_JSON.write_text(json.dumps(structured, ensure_ascii=False, indent=2), encoding="utf-8")

    if DB.exists():
        DB.unlink()
    conn = sqlite3.connect(DB)
    conn.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE bible_verses (
        id INTEGER PRIMARY KEY,
        translation TEXT NOT NULL DEFAULT 'KJV',
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        text TEXT NOT NULL,
        text_normalized TEXT NOT NULL
    );
    CREATE INDEX idx_bible_book_chapter ON bible_verses(book, chapter);
    CREATE INDEX idx_bible_reference ON bible_verses(reference);
    CREATE TABLE bible_aliases (
        alias TEXT PRIMARY KEY,
        canonical_book TEXT NOT NULL
    );
    CREATE TABLE church_vocabulary (
        term TEXT PRIMARY KEY,
        category TEXT,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1
    );
    """)
    conn.executemany(
        "INSERT INTO bible_verses(book,chapter,verse,reference,text,text_normalized) VALUES(?,?,?,?,?,?)",
        [(b,c,v,r,t,n) for b,c,v,r,t,n in parsed]
    )
    for book in BOOK_ORDER:
        conn.execute("INSERT OR REPLACE INTO bible_aliases(alias,canonical_book) VALUES(?,?)", (norm(book), book))
        for alias in ALIASES.get(book, []):
            conn.execute("INSERT OR REPLACE INTO bible_aliases(alias,canonical_book) VALUES(?,?)", (norm(alias), book))

    vocab_path = ROOT / "dlbc_vocabulary_seed.json"
    if vocab_path.exists():
        for item in json.loads(vocab_path.read_text(encoding="utf-8")):
            conn.execute(
                "INSERT OR REPLACE INTO church_vocabulary(term,category,aliases_json,notes,active) VALUES(?,?,?,NULL,1)",
                (item["term"], item.get("category"), json.dumps(item.get("aliases", [])))
            )
    conn.commit()
    conn.close()

    print(f"OK: {len(seen_books)} books, {len(parsed)} verses")
    print(f"Wrote: {FULL_JSON}")
    print(f"Wrote: {DB}")

if __name__ == "__main__":
    main()
