# Frontend corrective handoff — 1 October 2026

## Result and scope

The selected first/light editorial-desk concept is implemented locally. T11/T12 repairs and T13/T14 frontend work are ready for the parent and owner review required by T15. This is an implementation and fixture-verification result, not design acceptance or a release.

Work remains on `codex/product-ux-audit`. Source changes are confined to `frontend/`; current ignored evidence is under the repository's `ux-review-screenshots/`. An inherited earlier test default also wrote synthetic screenshots to the enclosing workspace's screenshot directory. The default is now corrected to the repository; those earlier files were left intact. Existing root-document and backend work was preserved. No commits, staging, pushes, PRs, publication, dependency installs, real microphone capture or external provider calls were made.

## Selected concept and resulting experience

Chosen reference: [selected light editorial desk](../design-research/2026-09-30/editorial-desk-selected.png).

The earlier sidebar, large numbered intake cards and promotional introduction are replaced by the reference's compact DLBC masthead and horizontal Workspace / Sessions / Reports navigation. Selection uses a thin moving baseline. Record live and Import recording are compact, labelled controls; YouTube remains in More sources. Settings and theme are accessible in the shared shell.

The desktop workspace uses a 38% work list and 62% actual document/source preview with fine separators. Selecting a session loads its saved artifact and distinguishes approved report, draft requiring review, accepted proofread source, verified transcript and raw unverified transcript. Missing data and unavailable services remain explicit. Cached content is retained during retries; aborted or late responses cannot replace another selection. Mobile switches between session list and selected document, with focus moved to the chosen pane.

Source Sans 3 carries UI and operational headings. Source Serif 4 is reserved for document titles and prose. Warm offwhite/inkblue light surfaces and a matching dark theme carry through intake, verification, reporting, editing, proofreading, final review, report history and settings. The recording view retains the prominent timer, signal state and immediate Stop and save control; capture ownership remains in App rather than the new shell.

[Asset provenance and licenses](src/assets/PROVENANCE.md) records official Adobe font and Phosphor icon sources, immutable commits, retained OFL/MIT licenses and SHA-256 hashes. Three unmodified upright WOFF2 faces are bundled (about 417 KB total). Phosphor icons use static upstream path data, with labelled critical controls. The fonts are served locally with system/Georgia fallbacks. No font/icon service or package was added.

## Four corrective regressions

- **Replacement finalization:** A newer accepted proofread source is visible even when an older final report exists. Its title, revision and source text are reviewable before the explicit replacement action. The request identifies `proofread_revision_id`; a 409 invalidates approval/export/finalize gates and requires reload and renewed human review. The UI explains that earlier versions remain in history. Backend atomic preservation is governed by the separate backend implementation and tests.
- **Reviewed title:** First finalization uses the accepted proofread title. The session title is never silently sent as an override. Only a deliberate optional title override is included in the request.
- **Supported source audio:** Final review and preview use `/api/transcription/media/{encoded identifier}` with recording ID or saved audio filename. Native audio playback was exercised using a generated 75-second WAV fixture. Encoded filenames, missing source and 404 media errors are covered.
- **Unbounded master seek:** The master range clears the old segment boundary and segment-playback state. Real synthetic playback stops at the bounded 10-second segment end; keyboard seeking to 60 seconds then continues beyond that old boundary.

## Motion and keyboard evidence

Ordinary motion is exercised and recorded, not inferred from still screenshots:

| Response | Observed duration |
| --- | --- |
| Navigation baseline | 180 ms |
| Selected document/source-panel content | 160 ms |
| Source disclosure | 200 ms |
| Saved-revision feedback | 160 ms |

Actual animation/transition start and end events are recorded in [motion evidence](../ux-review-screenshots/editorial-desk/motion/evidence.json). Immediate state changes remain usable during motion. The browser recording demonstrates navigation, preview selection, disclosure, rapid reversal, failed save, successful save and reduced-motion snapping: [local interaction recording](../ux-review-screenshots/editorial-desk/motion/editorial-desk-interactions.webm).

Mobile navigation traps focus, makes the background inert, restores focus after Escape/close/navigation/backdrop, and releases the overlay when resized to desktop. Collapsed source content is inert and hidden from accessibility APIs. Native home activation, keyboard seeking and visible focus pass. Reduced motion removes nonessential transitions, including when changed during a disclosure transition.

## Verification

All checks use an existing local Chromium/Playwright runtime and intercepted synthetic API responses; microphone/device acquisition and external API traffic are blocked.

| Check | Result |
| --- | --- |
| `npm --prefix frontend run build` | Pass: 62 modules; JS 484.60 KB / 127.49 KB gzip, CSS 278.15 KB / 44.78 KB gzip |
| `npm --prefix frontend run lint` | Exit 0; 68 warnings, no lint errors. [Full output](../ux-review-screenshots/editorial-desk/lint.log) |
| `node frontend/tests/reliability.browser.mjs` | Pass: loading/unavailable/empty distinctions, retained collections, retry, automation load/save rollback, native home and mobile navigation focus |
| `node frontend/tests/editorial.browser.mjs` | Pass: revision approval/conflicts/export gates, edit/restore invalidation, archive recovery, provider-unavailable retry contract, readiness, long content, shared screens and synthetic recording controls |
| `node frontend/tests/editorial-desk.browser.mjs` | Pass: four corrective regressions, actual synthetic audio, stale selection reversal, fonts/fallback, rendered contrast, responsive desk and recorded motion |
| `git diff --check -- frontend` | Pass |

Widths exercised: 1440×900, owner view 1170×635, mobile 390×844, short 568×320, and 720×450 logical reflow. Intake, verification, reporting, editing, proofreading, report collection and settings have owner-width captures in addition to desktop/mobile. Logical reflow is evidence of equivalent layout width, not a claim that browser zoom was physically changed.

Rendered changed desk text/control samples passed 4.5:1: light minimum 4.58:1, dark minimum 5.50:1. Sampled semantic prose tokens also passed (light 4.90:1, dark 7.37:1). These are bounded samples, not a whole-app accessibility certification. Local font loading and intentional font-request failure both passed.

Lint warnings remain, including existing unused variables/hook dependencies and component/helper fast-refresh warnings. This pass does not claim a clean warning baseline. The large legacy App.css remains a size limitation; the obsolete dashboard illustration is no longer emitted in the production bundle.

## Representative after evidence

- [Desktop selected document](../ux-review-screenshots/editorial-desk/desk-desktop.png)
- [Owner view 1170×635](../ux-review-screenshots/editorial-desk/desk-owner-viewport.png)
- [Dark owner view](../ux-review-screenshots/editorial-desk/desk-dark-owner-viewport.png)
- [Mobile selected document](../ux-review-screenshots/editorial-desk/desk-mobile-document.png)
- [Editing workspace](../ux-review-screenshots/editorial-desk/session-review-fixture-editing-owner-viewport.png)
- [Final source replacement review](../ux-review-screenshots/editorial-desk/replacement-review-owner-viewport.png)
- [Mobile urgent recording control](../ux-review-screenshots/editorial-desk/recording-synthetic-mobile.png)
- [Settings readiness and dark theme](../ux-review-screenshots/editorial-desk/settings-dark-mobile.png)

All full-content screenshots contain labelled synthetic material. Early checkpoint captures remain in `ux-review-screenshots/editorial-desk-checkpoint/`; current evidence above supersedes their unfinished states.

## Reproduce locally

Run from the repository root with the local preview available at `http://127.0.0.1:5173/`:

```powershell
$env:NODE_PATH='C:\Users\Oviks\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:FRONTEND_TEST_SCREENSHOTS=(Join-Path (Get-Location) 'ux-review-screenshots/editorial-desk')
node frontend/tests/reliability.browser.mjs
node frontend/tests/editorial.browser.mjs
node frontend/tests/editorial-desk.browser.mjs
npm --prefix frontend run build
npm --prefix frontend run lint
git diff --check -- frontend
```

The local preview was restarted on loopback when its prior process became unavailable. It remains available for owner inspection. The fixture helper rejects non-local preview URLs, blocks microphone/display capture and intercepts all backend/provider traffic.

## Limits and next action

Browser fixtures demonstrate frontend requests, UI gates, synthetic audio playback and recovery. They do not independently prove backend SQLite atomicity, real cloud success, real microphone continuity, OS audio routing or correctness of an actual exported Word document. Review the separate backend contract and implementation handoff for T10 evidence; this chat did not rerun or modify backend storage.

Comprehensive proper-name data remains missing. KJV readiness reports partial coverage rather than inventing that data. Parent review and the brother's acceptance still gate publication and merge. The next action is visual/behavioral review of this local implementation against the selected image and recorded evidence.
