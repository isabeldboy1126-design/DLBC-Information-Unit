# DLBC Information Unit App — Backend

Python + FastAPI backend for the DLBC Information Unit App.

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.
API keys and secrets must never be committed to version control.

## Local context setup and readiness

The KJV SQLite asset is generated from the checked-in full verse corpus and vocabulary seeds. The builder is offline and refuses to overwrite either an existing output or source assets:

```powershell
python scripts/build_kjv_database.py --output data/kjv/kjv_context.sqlite
```

Use `--output` to select a fresh output path, `--corpus` for the local structured KJV JSON, and `--source-files` for the lexicon/vocabulary directory. Set `KJV_CONTEXT_DB_PATH` to the generated SQLite path before starting the backend.

This checkout lacks `source_files/names.tsv`. The local build contains **all 66 books and 31,102 verses**, plus 101 canonical/book supplement entries, 67 KJV words and 20 church terms. Its name coverage is partial; it does not recreate the previously recorded 2,808-name index. To reproduce that index, separately obtain the complete local BibleNLP `names.tsv` with `macula_eng` and `ref` columns through an approved source-retrieval process, then run:

```powershell
python scripts/build_kjv_database.py --output C:\path\to\new-kjv.sqlite --names C:\path\to\names.tsv
```

No automatic download occurs. Output metadata records source hashes, counts and completeness against the recorded canon/name baseline. Matching counts are coverage evidence, not a claim of perfect name recognition. `GET /api/readiness` distinguishes database availability, local domain context and provider configuration; configured credentials are not a live-provider health/accuracy test. `GET /api/health` remains liveness only.

## Offline regression suite

Use an environment with the existing requirements, pytest and pytest-asyncio already installed:

```powershell
python scripts/run_offline_tests.py
```

The runner creates disposable storage and SQLite databases, provisions the **full local verse corpus**, clears provider credentials, and blocks outbound sockets while allowing Windows asyncio's internal socketpair. It does not access real recordings or the development database. Optional pytest arguments can be passed to the runner. Review/approval/archive compatibility is documented in [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md).
