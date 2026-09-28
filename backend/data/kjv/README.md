# DLBC Local KJV & Biblical Context Subsystem

## 1. Overview & Architectural Principle

The **DLBC Local KJV & Biblical Context Subsystem** provides a zero-latency, token-free, deterministic knowledge base for validating and cross-checking preacher speech, scripture citations, biblical proper names, and church terminology during sermon transcript verification.

### Core Non-Negotiables:
1. **Zero External AI / Gemini Calls for Context Retrieval**: The entire King James Version and biblical entity directory reside locally in SQLite. The system never queries Gemini or any external model to retrieve scripture or look up biblical names.
2. **Token Efficiency by Design**: The subsystem **never** transmits the entire Bible, entire chapters, or 3,000 biblical names to Gemini. It produces compact, bounded context packets (typically under 350 tokens) containing only the exact verse citation, immediate adjacent verses `[v-1, v, v+1]`, top matching names, and detected church terms.
3. **Protestant 66-Book Canon (31,102 Verses)**: The database is strictly validated against the 1769 Authorized King James Version Protestant Canon.
4. **Immutable Raw Transcripts**: The KJV context engine is an evidentiary and verification resource; it never alters raw audio transcript records.
5. **Contextual Recognition over Word-Substitution**: Preachers frequently cite scripture from memory or paraphrase. KJV wording is used as context for verification, not authority to silently overwrite natural spoken phrasing.

---

## 2. Directory Layout & Artifacts

```
backend/data/kjv/
├── kjv_context.sqlite         # SQLite database (13.9 MB) with WAL mode & comprehensive indexes
├── kjv_full.json              # Full 66-book hierarchical JSON (4.65 MB)
├── source_metadata.json       # Build provenance, timestamps, verse counts, and license information
├── README.md                  # Subsystem architectural documentation (this file)
└── source_files/              # Upstream source files and seeds
    ├── README_FIRST.md
    ├── SOURCE_AND_LICENSE_NOTES.md
    ├── verification_contract.json
    ├── build_full_kjv_context.py
    ├── kjv_speech_lexicon.txt
    └── dlbc_vocabulary_seed.json
```

---

## 3. Database Schema (`kjv_context.sqlite`)

The database contains 5 core tables, tuned with WAL journal mode and indexes for sub-millisecond lookups:

### A. `bible_verses` (31,102 rows)
Stores all verses of the 66-book Protestant Canon.
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `translation`: TEXT DEFAULT 'KJV'
- `book`: TEXT (e.g. `2 Corinthians`)
- `book_number`: INTEGER (1 to 66)
- `chapter`: INTEGER
- `verse`: INTEGER
- `reference`: TEXT UNIQUE (e.g. `2 Corinthians 12:9`)
- `text`: TEXT (KJV verse text)
- `text_normalized`: TEXT (case-folded and normalized for search)
- **Indexes**: `idx_verses_ref`, `idx_verses_book_chap`, `idx_verses_book_chap_ver`, `idx_verses_book_num`

### B. `bible_names` (2,808 rows)
Biblical proper names sourced from `BibleNLP/biblical-names-data` augmented with canonical entities and Bible books.
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `canonical_name`: TEXT UNIQUE (e.g. `Abiathar`, `Nebuchadnezzar`, `Maher-shalal-hash-baz`)
- `normalized_name`: TEXT
- `category`: TEXT (`person`, `place`, `people_group`, `tribe`, `book`)
- `aliases_json`: TEXT (JSON array of variant spellings and aliases)
- `phonetic_key`: TEXT (Standard American Soundex key, e.g. `A136`)
- `occurrence_count`: INTEGER
- `reference_examples_json`: TEXT (JSON array of scripture citations)
- **Indexes**: `idx_names_canonical`, `idx_names_normalized`, `idx_names_phonetic`, `idx_names_category`

### C. `bible_aliases` (343 rows)
Maps written abbreviations and spoken word variants to canonical book names.
- `alias`: TEXT PRIMARY KEY (e.g. `second corinthians`, `2 cor`, `ii corinthians`, `1 tim`, `psalm`, `deut`)
- `canonical_book`: TEXT (e.g. `2 Corinthians`, `1 Timothy`, `Psalms`, `Deuteronomy`)
- `book_number`: INTEGER
- **Indexes**: `idx_aliases_canonical`

### D. `kjv_vocabulary` (67 rows)
Curated Early Modern English spoken words commonly used in pulpit delivery.
- `term`: TEXT PRIMARY KEY (e.g. `thee`, `thou`, `hath`, `saith`, `cometh`, `brethren`, `unto`)
- `normalized_term`: TEXT
- `notes`: TEXT

### E. `church_vocabulary` (20 rows)
DLBC leaders, programmes, publications, and ministries.
- `term`: TEXT PRIMARY KEY (e.g. `Pastor W. F. Kumuyi`, `Deeper Life Bible Church`, `GCK`, `Monday Bible Study`)
- `normalized_term`: TEXT
- `category`: TEXT (`person`, `organization`, `programme`, `publication`, `ministry`)
- `aliases_json`: TEXT (e.g. `["DLBC"]`, `["Global Crusade with Kumuyi"]`)
- `notes`: TEXT
- `active`: INTEGER DEFAULT 1

---

## 4. Key Subsystem Capabilities

### 1. Spoken & Written Reference Parsing
`bible_context_service.parse_reference(text: str)` handles:
- **Written standard notation**: `2 Corinthians 12:9`, `John 3:16`, `1 Sam 22:20`
- **Standard abbreviations**: `1 Tim 6:5`, `Deut 6:4`, `Ps 23:1`, `2 Cor 12:9`
- **Spoken phrases with keywords**: `"Second Corinthians chapter twelve verse nine"`, `"Psalm twenty three verse one"`
- **Colloquial spoken cadence**: `"First Timothy six five"`, `"Deuteronomy six four"`, `"First Samuel twenty two twenty"`

### 2. Canon Validation
`bible_context_service.validate_reference(book, chapter, verse)` checks whether the reference is historically and canonically valid in the 66-book KJV:
- `2 Corinthians 12:9` $\to$ `True`
- `2 Corinthians 99:400` $\to$ `False` (clean failure, zero hallucination)

### 3. Adjacent Verse Context Retrieval
`bible_context_service.get_context(reference, verses_before=1, verses_after=1)` provides a tight, three-verse sliding window `[v-1, v, v+1]`. For example, querying `2 Corinthians 12:9` yields verses 8, 9, and 10 with exact verse text, chapter boundaries respected.

### 4. Biblical Name Recognition with Contextual Boost
Preacher speech often introduces audio ambiguities (e.g. `"Aviatha"` instead of `"Abiathar"`).
`bible_context_service.find_name_candidates(text, nearby_reference="1 Samuel 22")`:
1. Evaluates exact, alias, and Soundex matches.
2. Checks whether candidate entities appear in the chapter text or reference examples of `nearby_reference`.
3. In `1 Samuel 22`, verse 20 recounts that Abiathar escaped. The engine awards a **+0.35 contextual boost**, promoting `Abiathar` to the #1 candidate ahead of other phonetic alternatives.
4. Output is strictly bounded to the top 5 candidates.

### 5. Vocabulary Detection
- `get_kjv_vocabulary_candidates`: detects Early Modern English forms (`saith`, `hath`, `thee`, `brethren`).
- `get_church_vocabulary_candidates`: detects DLBC terms (`Pastor W. F. Kumuyi`, `GCK`, `Monday Bible Study`).

### 6. Compact Verification Context Builder
`bible_context_service.build_verification_context(transcript_text, nearby_reference)` combines detected references, adjacent verses, top name candidates, and vocabulary into a structured payload under 400 tokens:
```json
{
  "detected_reference": "2 Corinthians 12:9",
  "reference_valid": true,
  "reference_matched_text": "Second Corinthians chapter twelve verse nine",
  "kjv_context": [
    {"reference": "2 Corinthians 12:8", "verse": 8, "text": "..."},
    {"reference": "2 Corinthians 12:9", "verse": 9, "text": "And he said unto me, My grace is sufficient for thee..."},
    {"reference": "2 Corinthians 12:10", "verse": 10, "text": "..."}
  ],
  "biblical_name_candidates": [],
  "kjv_vocabulary_candidates": ["saith", "unto"],
  "church_terms": [],
  "token_count_estimate": 142
}
```

---

## 5. Verification Materiality Policy (`app.verification.materiality_policy`)

Determines which transcript differences require human attention versus automatic resolution:

| Level | Criteria / Triggers | Action |
| :--- | :--- | :--- |
| **`INCONSEQUENTIAL`** | Punctuation, capitalization, harmless filler words, or approved stylistic equivalents (`unto` vs `to`, `upon` vs `on`) | Auto-resolvable; zero human review needed |
| **`MEANING_RELEVANT`** | Substantive noun/verb substitutions that alter actions without doctrine/number triggers | Flags for editorial attention; human review required |
| **`HIGH_RISK`** | Negations (`not`, `cannot`, `never`), numbers/digits/dates, doctrinal words (`salvation`, `sanctification`, `grace`), scripture references, proper names | Never silently altered; mandatory human review |

---

## 6. Verification and Testing

Automated test suite: `backend/tests/test_kjv_context.py`
Run tests:
```bash
cd backend
.\venv\Scripts\python.exe -m pytest tests/test_kjv_context.py -v
```
All 20 test cases pass deterministically with zero external API calls.
