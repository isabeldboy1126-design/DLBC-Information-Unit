# Local review instructions

Repository: https://github.com/isabeldboy1126-design/DLBC-Information-Unit

Upgrade branch: `codex/product-ux-audit`. GitHub default branch is **master**; `origin/main` pointed to the same commit when checked. Baseline at preparation: `7a33f41a6be4f7fce07f3f16fa6b9783dea978a9` (1 October 2026). Fetch again and record the actual commits used if they have moved.

For an independent comparison, first avoid `COMPARISON.md`, implementation handoffs, tickets, design research and PR commentary. Record your own findings with files and evidence. This page contains operational instructions only. Do not merge, deploy, upload church data or use paid AI services during local review.

## Get the branch

In your own clone, inspect `git status --short` first. Preserve dirty work; do not reset or force checkout. With a clean checkout:

```powershell
git fetch origin
git checkout codex/product-ux-audit
git pull --ff-only origin codex/product-ux-audit
git rev-parse HEAD
git rev-parse origin/master
```

If the local feature branch does not exist, use `git checkout --track -b codex/product-ux-audit origin/codex/product-ux-audit`. With no clone, clone the repository to a fresh directory first. To inspect the baseline in parallel, use a new disposable worktree for `origin/master`; keep the upgrade branch checked out in this clone.

## Start the frontend

Use the project's existing dependencies and a local Node runtime. From the repository root:

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/. The current login screen has Demo access. A frontend-only preview cannot demonstrate real saved sessions or backend actions.

## Optional populated synthetic preview

With that Vite server running, use an already-installed Playwright package and Chromium runtime. If Playwright is outside the project, set `NODE_PATH` to that runtime's `node_modules`; do not copy another person's absolute machine path. No production data or backend is needed:

```powershell
node frontend/tests/preview-fixture.mjs
```

This opens a separate browser with three synthetic sessions and intercepted API responses. It blocks microphone/display capture and external API traffic. Changes made inside it are fixture behavior, not real persistence. Close that browser or stop the script to finish. `--check` performs a headless smoke check instead.

## Backend tests

Use a local isolated Python environment with the dependencies in `backend/requirements.txt`, plus `pytest` and `pytest-asyncio`. Install only into that environment. From the repository root:

```powershell
python backend/scripts/run_offline_tests.py
```

The runner disables dotenv loading, clears provider credentials, builds KJV context in fresh temporary storage and blocks outbound connections. It never needs a real account, actual church audio or a cloud AI key. Authentication tests use synthetic test tokens under the test environment; these are not production credentials.

## Optional local backend preview

Use disposable storage, not the application's existing database. In a separate terminal with the isolated Python environment active, from the repository root:

```powershell
$reviewData = Join-Path $env:TEMP ('dlbc-local-review-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $reviewData | Out-Null
$env:DATA_ROOT = $reviewData
$env:DATABASE_URL = ''
$env:PYTHON_DOTENV_DISABLED = '1'
$env:APP_ENV = 'development'
Get-ChildItem Env: | Where-Object { $_.Name -match '^(GEMINI_|AZURE_|GOOGLE_|ASSEMBLYAI_|DEEPGRAM_)' } | ForEach-Object { Set-Item -LiteralPath ('Env:' + $_.Name) -Value '' }
$env:KJV_CONTEXT_DB_PATH = Join-Path $reviewData 'kjv.sqlite'
python backend/scripts/build_kjv_database.py --output $env:KJV_CONTEXT_DB_PATH
Set-Location backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Use the frontend's Demo access for local disposable review. Do not put real audio in this environment. Live microphone capture, provider quality, authenticated production account flows and cloud databases need a separately controlled acceptance test. Test synthetic uploads only after checking the environment; provider actions may fail without credentials, which is expected. Never add a cloud key just to make a local preview look successful.

## Browser checks

With an existing local preview and Playwright runtime available:

```powershell
node frontend/tests/reliability.browser.mjs
node frontend/tests/editorial.browser.mjs
node frontend/tests/editorial-desk.browser.mjs
npm --prefix frontend run build
npm --prefix frontend run lint
```

These browser suites intercept synthetic APIs. Their output is written under ignored `ux-review-screenshots/` by default; set `FRONTEND_TEST_SCREENSHOTS` to a fresh review output directory when desired. Use both branches under comparable viewport, theme and input conditions. Keep visual opinion, source inspection, automated checks and live behavior separate in your report.

After recording your independent review, read [COMPARISON.md](COMPARISON.md) and verify its individual claims. Report independently found, missed but verified, unsupported, disagreed and still-unverified items. Do not assume agreement or disagreement proves one model generally superior.
