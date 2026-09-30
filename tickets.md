# Tickets: DLBC reliability and editorial redesign

**Current status:** parent-verified local upgrade; branch push and draft PR authorized. See final parent verification below and [review guide](docs/review/README.md). Historical permission/status notes are superseded where stated.

30 September 2026. The owner authorised implementation of the audited backend/frontend fixes, delegated design selection, and requested new GPT 6.1 chats at high effort. This local tracker is the implementation contract; no remote issues or release were created.

## Working agreement

Use the actual nested DLBC repository on its existing `codex/product-ux-audit` branch. Preserve the already-dirty frontend repair and all unrelated work. Two chats share this checkout: Backend owns `backend/**`; Frontend owns `frontend/**`. The parent owns root tickets/plan/handoff documents. Neither chat may revert the other, stage broad changes, switch branches, commit, push, deploy, or change global configuration. Tests must use synthetic fixtures and temporary storage, with real audio and provider calls offline. Existing frontend/backend dependency setup is approved; prefer existing dependencies and CSS/SVG. Any additional consequential effect needs separate authority.

Backend publishes additive API/state changes, compatibility and fixture examples in `backend/FRONTEND_CONTRACT.md`. Frontend reads that contract before integrating report states/actions. Each chat writes its own evidence handoff under its owned directory. Work is complete only after its acceptance checks pass or a specific remaining blocker is reported. No recursive agent delegation is needed.

Start backend trust fixes first. Frontend can begin the visual system, shell, dashboard, and recording layout immediately against current contracts; integrate new report/approval states after the backend contract is available. These are implementation lanes, not separate product definitions.

### Dispatch record

Both new local chats were created with model `gpt-6.1-sol` and reasoning effort `high`:

| Lane | Chat ID | Responsibility |
| --- | --- | --- |
| Backend | `01a0f2cf-f6de-7d10-bc07-c8608d4848df` | T1–T5, backend contract and backend evidence for T8 |
| Frontend | `01a0f2d0-0277-75c0-acae-9ded1772fa38` | T6–T7, consumers of T1–T5, frontend evidence for T8 |

Creation is dispatch, not completion. The checkbox states below remain open until the implementation evidence is reviewed.

The owner reaffirmed that the complete upgrade must remain on this single working branch until the brother reviews and approves it. No branch publication, main/default-branch update, PR, or merge is authorised at this stage. Independent parent review reran the backend suite (152 passed, zero outbound attempts) and then reproduced the new T9 source-change case; backend acceptance remains open until that case is repaired. Frontend was still finishing its verification at this check.

## T1: An unavailable AI provider cannot invent a successful report

**Blocked by:** None. **Producer:** Backend. **Consumer:** Frontend.
**Delivers:** A truthful unavailable/retry flow rather than canned sermon content.

- [ ] Missing credentials/provider availability produces an explicit failure/unavailable result, no fabricated report, and no successful final artifact; cover sibling generation paths.
- [ ] Retrying retains the source session/transcript and previously valid work; mock provider tests make zero external calls.
- [ ] UI displays the actual failure and retry path without a success/completion badge. Demonstrate through intercepted fixtures and the documented API contract.

## T2: Invalid generated output stops before completion

**Blocked by:** None. **Producer:** Backend. **Consumer:** Frontend.
**Delivers:** Schema and application validation protect report quality.

- [ ] Empty, malformed, wrong-shape and known quality-invalid mocked output cannot finalise; required report fields use an explicit supported response schema and local validation.
- [ ] Failure is recoverable and visible; last good report and immutable source remain intact. Test a one-word forbidden-cliché response and valid output.
- [ ] UI distinguishes rejected output from generation success; avoid an arbitrary quality threshold overriding a documented short-report exception without explaining the rule.

## T3: Generate a draft, review it, explicitly approve the final document

**Blocked by:** T1 and T2 for final acceptance; contract work may begin immediately. **Producer:** Backend. **Consumer:** Frontend.
**Delivers:** AI processing completion and human approval are separate, without requiring an unnecessary rewrite of the existing consolidated generator.

- [ ] Consolidated AI generation produces a persisted reviewable draft, not an approved final report. Preserve existing human editor/proofreader routes, deliberate automation settings and original/raw/revision records; default auto-continue-to-proofreading remains OFF.
- [ ] An explicit review/approval action alone advances to approved final output; repeat approval is idempotent, edits invalidate approval where needed, and approved export uses the approved revision. Existing ambiguous legacy finals remain accessible without inventing approval history.
- [ ] Dashboard, sessions, report workspaces, mobile and exports agree on generated/needs-review/approved states. Fixture and API tests include failure, retry, revisions, legacy data, approval and download.

## T4: Remove a session from active work without deleting protected sources

**Blocked by:** None. **Producer:** Backend. **Consumer:** Frontend.
**Delivers:** Archive/removal is consistent with the project's preservation rule.

- [ ] Normal session removal preserves original audio, raw transcript and necessary source/revision linkage; no ordinary operation silently hard-deletes source material.
- [ ] Archived sessions can be found and restored, or an existing equivalent retention workflow is demonstrably reused. Test with disposable synthetic source files inside a verified temporary directory.
- [ ] UI copy, confirmation, active-list filtering and archive/restore behaviour match the API. Permanent deletion is outside this ticket; do not invent a retention exception.

## T5: Domain context is reproducible and reports its readiness

**Blocked by:** None. **Producer:** Backend. **Consumer:** Frontend where readiness is exposed.
**Delivers:** A fresh setup does not silently lack the KJV verification database.

- [ ] Provision the full verified KJV index reproducibly from available local corpus/seeds where possible, using a configurable temporary/output path and no overwriting of source assets; missing upstream data is clearly named rather than fabricated.
- [ ] All existing KJV tests run against a representative asset, or any remaining setup gap is explicitly evidenced. Do not use a tiny fake database to make integrity tests pass.
- [ ] Readiness distinguishes missing domain context, backend availability and AI provider configuration, without exposing credentials or claiming real model/device success.

## T6: A coherent premium workspace for daily reporting

**Blocked by:** None for visual work. T3/T4/T5 only gate acceptance of changed workflow consumers. **Owner:** Frontend.
**Delivers:** The selected calm editorial direction throughout the existing application, with stronger operational recording controls.

- [ ] Shared typography, spacing, surfaces and consistent labelled icons unify shell, dashboard/history, intake, recording, verification, report editing/proofreading/final review, completed reports and settings. Preserve working features and improve source/review tools; do not rebuild routes or unmount capture state.
- [ ] Live capture and Upload recording have comparable prominence; retain existing YouTube access as secondary functionality without expanding it. Remove or implement the unsupported notification indicator. Truthful loading, retained data, retry, unknown settings and save rollback from the prior repair survive.
- [ ] Visually inspect realistic long-content desktop/mobile/short-window fixtures, dark/light mode where existing, keyboard focus and zoom/reflow. Produce before/after captures and a concise design rationale; lint/build and meaningful regression checks pass.

## T7: Motion clarifies navigation and working states

**Blocked by:** T6 shared rules, but can be developed within its slices. **Owner:** Frontend.
**Delivers:** Purposeful, consistent movement without disrupting capture or reading.

- [ ] Define triggers and settled states for drawer/source panels, selected tabs, saves, processing feedback and recording status; use CSS/DOM/SVG first and keep urgent actions immediate.
- [ ] Reduced motion snaps/stops ongoing effects and leaves every essential state/action accessible; rapid reversal, route changes and resize leave no hidden focus targets or stuck overlays.
- [ ] Test normal/reduced motion, keyboard and narrow screens; no fake progress, reading-area ambient loops, hover-only actions or gratuitous animation library.

## T8: Verify the integrated workflow and hand back reviewable evidence

**Blocked by:** T1–T7, T9 and the corrective T10–T15 acceptance for complete acceptance. **Owners:** Backend + Frontend, each within its file boundary.
**Delivers:** Demonstrated behaviour rather than a blanket 'everything works' claim.

- [ ] Synthetic cases cover generation failure, invalid output, draft review/approval/export, archive/restore, source retention, settings failure and consistent responsive stage labels. Preserve recording lifecycle and document real-device/provider tests still unrun.
- [ ] Backend publishes its contract and exact test results; Frontend verifies consumers against it and reruns the existing reliability browser suite plus changed-journey checks. No production data or external AI call is required.
- [ ] Each handoff lists changed files, evidence scope, residual issues and screenshots/fixtures. Parent can independently review the combined work before any release.

## T9: A changed source during AI generation cannot be silently rebound

**Blocked by:** None for repair. **Producer:** Backend. **Consumer:** Frontend using the existing failure/retry or stale-source contract.
**Delivers:** Correct provenance when another tab changes verified source while a provider call is pending.

- [ ] Bind generation to the source snapshot/revision it actually consumed. If that source changes before persistence, reject/retry or explicitly mark the output stale and prevent approval/export; never assign the new source signature to old-source content.
- [ ] Cover changes during the mocked provider await and the relevant persistence boundary, retaining original/raw sources and previously valid work. Include relevant reused editor/proofreader input in the source identity where it informs generation.
- [ ] A regression reproduces the parent's synthetic case: original transcript sent to the provider, verified text changed during generation, old-source response returned. It cannot appear current/approvable/exportable without renewed reconciliation. Error/retry state remains clear in the frontend.

Independent evidence: `ux-review-screenshots/independent-audit/independent-generation-race.json` and its test/log. The original 152-test suite passed; the additional challenge test failed with run completed, source_changed false, approval allowed and export enabled for old-source content. This is a new finding, not evidence that the earlier repairs failed their covered cases.

## Corrective dispatch: reviewed defects and selected editorial desk

30 September 2026. The owner rejected the first implementation's generic dashboard and navigation, selected the light editorial-desk image, and explicitly authorised planning and re-dispatching both existing GPT 6.1 / high chats. This section supersedes the first pass's visual direction where they differ. T6/T7/T8 remain open. Agent-reported completion is evidence to review, not design acceptance.

Independent read-only review found four frontend defects and one backend defect. It included unstaged/untracked files, found no staged changes, and confirmed unchanged file hashes during each review. No runtime tests were run by that reviewer. Backend's latest handoff reports T9 corrected with 169 offline tests and zero outbound attempts; the earlier parent run covered 152 tests, so the newer result remains agent-reported pending independent acceptance.

**Execution:** Backend begins T10. Frontend begins T11/T12, then delivers the shell/dashboard slice of T13 and continues T14. Frontend repairs and visual work can proceed alongside T10; final integrated approval acceptance waits for its contract. Parent owns root documents and the design brief. Reuse the existing two chats; do not spawn additional agents. Keep the existing branch and dirty work. No commits, pushes, PRs, merge, deployment, real audio, microphone access, or external AI calls.

**Dispatch verified:** Both original chats received the corrective prompts with `gpt-6.1-sol` / `high` and were confirmed active in a bounded status check. Backend reported tracing the split finalization/approval transaction; Frontend reported starting the four regressions before the selected shell/dashboard. Neither corrective lane is yet complete.

### T10: Failed finalization leaves the previous report active

**Blocked by:** None. **Owner:** Backend; Frontend consumes the published conflict behavior.
**Delivers:** A 409 approval/source conflict cannot silently replace an existing final report.

- [ ] Treat accepted-source validation, final draft creation, active-revision/session pointer updates and approval as one atomic transaction. A conflict rolls back all replacement effects; the prior source/revisions remain preserved.
- [ ] Reproduce a source change between validation and approval with synthetic temporary storage. Assert the 409, prior active revision, session pointer, and absence of a partially committed replacement. Cover successful replacement and repeat approval.
- [ ] Inspect sibling finalization callers for the same split-commit pattern without broad unrelated refactoring. Preserve T9's consumed-source snapshot guarantee and current export gates.
- [ ] Update the backend contract and handoff; rerun focused regression and the existing offline suite with zero outbound attempts. Document any remaining SQLite/cloud limitation.

### T11: Finalize the current accepted proofread revision with its reviewed title

**Blocked by:** None for implementation; T10 gates integrated conflict acceptance. **Owner:** Frontend.
**Delivers:** Operators can replace an older final deliberately, using the title they actually reviewed.

- [ ] When an older final exists and a newer accepted source can be finalized, expose an explicit replacement action showing the accepted source being used. Preserve the old report as history, maintain revision-bound approval, and require renewed review after conflict.
- [ ] Read the accepted source's proofread title; do not silently submit the session title as an override. Preserve intentional user overrides where supported.
- [ ] Browser fixtures cover first finalization, old-final/new-accepted-source replacement, distinct session/proofread titles, stale 409, approval and approved export. Add an integrated local test only against isolated synthetic storage; never modify the real storage database.

### T12: Source audio plays and seeking resets bounded replay

**Blocked by:** None. **Owner:** Frontend.
**Delivers:** Final-review audio uses the real supported media route; seeking outside a flag does not pause unexpectedly.

- [ ] Reuse the supported transcription-media URL with encoded recording ID or audio filename. Cover both source forms and a missing source, with visible unavailable/error behavior.
- [ ] Master seek clears the old segment boundary and segment-playback state, retaining keyboard-operable range semantics.
- [ ] Use a generated synthetic local audio fixture: replay a bounded segment, seek beyond its end, and verify playback remains unbounded. Check the final-review request URL and actual local playback; no microphone, personal audio, provider calls, or fabricated success.

### T13: Start or resume work from the selected editorial desk

**Blocked by:** None. **Owner:** Frontend.
**Delivers:** A substantive dashboard and shell redesign around actual session work, not a font-only restyle.

- [ ] Inspect the selected image and read PROJECT_PLAN section 12 before editing. A compact DLBC masthead with horizontal Workspace/Sessions/Reports navigation replaces the desktop sidebar. Preserve routes, settings/theme access, recording continuity and mobile keyboard navigation. Use a baseline selection indicator, not the rejected rounded pill/curved left stripe.
- [ ] Remove the marketing introduction, giant numbered intake cards, 01/02 labels and repeated overlines. Provide compact, clearly labelled Record live and Import recording actions; keep existing YouTube access as a subordinate source menu action.
- [ ] Main workspace has a narrower session work list and larger document/source preview separated by fine rules. A real selected session updates its correctly labelled available artifact and next action; do not invent reports, statements, metadata, waveforms or claim-level links. Display loading, empty, unavailable and retained-data states within the same composition.
- [ ] Use the selected concept as layout direction, not literal content: its sermons/dates are synthetic. Keep serif emphasis to document title/prose, not every heading. Preserve the real church brand asset; warm off-white, ink and blue define the light treatment, with a coherent dark counterpart and existing theme preference.
- [ ] Self-host the selected Source Sans 3 / Source Serif 4 font assets and a small Phosphor SVG set from verified official sources, retaining licenses and source/version records. No package/global install is required. Settings, theme, record, import, sessions and reports must have distinguishable silhouettes and labelled critical controls. Verify actual font loading and fallback.
- [ ] Deliver dashboard screenshots at desktop and mobile early, with a concise concept-to-implementation comparison in the frontend handoff. Continue the scoped work; do not stall for routine permission. Completion requires browser behavior plus visual evidence, not build alone.

### T14: Read, verify and review in one coherent workspace with visible motion

**Blocked by:** T13's shared shell/system for final acceptance; inspect existing workspaces while it develops. **Owner:** Frontend.
**Delivers:** The chosen identity carries into the full existing reporting journey and its interactions.

- [ ] Apply the shared navigation, type, icons, surfaces and source/document hierarchy to sessions, intake/setup, recording, verification, reporting, editing, proofreading, final review, report history and settings. Work incrementally; remove obsolete styles for changed surfaces instead of accumulating contradictory override layers.
- [ ] Retain prominent recording timer/device/signal/Stop controls; actual capture state stays mounted across navigation. The darker instrument idea may inform live capture, but must not add a decorative waveform, false readiness or duplicate record controls.
- [ ] Navigation selection moves its baseline over 180 ms; session-preview changes use a 160 ms content transition with immediate state change; source disclosures use a 200 ms bounded reveal; save feedback uses a 160 ms response-triggered change. Use one restrained easing vocabulary, interrupted actions resolve to the latest state, and focus never enters hidden content. No forced wait before clicking, seeking or stopping recording.
- [ ] Reduced motion cancels/snaps all nonessential movement even when toggled mid-transition. No page-load staging, fake processing progress or ambient reading-area animation. Native keyboard/focus states remain immediate and clear.
- [ ] Provide a short local recording or reproducible browser demonstration of ordinary navigation, source disclosure, save success/failure, rapid reversal and reduced motion. Screenshots cannot prove motion. Demonstrate real empty/error states as well as clearly labelled synthetic full-content fixtures.

### T15: Accept the repaired editorial journey with separate visual and behavioral evidence

**Blocked by:** T10–T14 for final acceptance. **Owners:** Both existing chats within their directories; Parent reviews the result.
**Delivers:** The owner can inspect the upgraded local app and assess actual design, motion and correctness.

- [ ] Backend handoff reports focused atomic-finalization regression, full offline suite and exact results; Frontend handoff reports four defect regressions, reliability/changed-journey suites, build/lint and remaining warnings.
- [ ] Browser checks cover desktop 1440x900 and the user's 1170x635 view, mobile 390x844, short 568x320 and zoom/reflow. Verify light/dark, long content, keyboard, interrupted motion, unavailable backend and stale approval. Sample rendered text/control contrast; don't claim whole-app accessibility from token-only checks.
- [ ] Handoff links the chosen concept, representative after screenshots and motion demonstration. State what changed visually and compare it directly with the concept. Clearly distinguish fixture/source/build results from live-device/provider/export verification.
- [ ] Parent checks the returned work before any release. The brother's acceptance still gates publication and merge. Missing comprehensive proper-name data remains explicit; do not fabricate it or expand this pass into a provider upgrade.

## Gemini decision

Official catalogue checked on 30 September 2026: it lists `gemini-3.5-transcribe` / `gemini-3.5-transcribe-live`, and separately 3.8 Flash, Live and TTS models; no published 3.8 Transcribe entry was found. [Official catalogue](https://ai.google.dev/gemini-api/docs/models).

Do not change providers merely for a larger model number. Keep the current configurable gateway, repair its failure/validation/approval handling, and document endpoint compatibility. A dedicated transcription adapter, statement-level provenance generation, external guideline retrieval, real-audio quality comparison, paid AI calls or data uploads are later bounded feature work, not required to repair these defects. Existing source/audio tools should be usable and visually coherent now.

## Final parent verification and publication authority — 1 October 2026

The owner explicitly authorized the parent to fix final-audit findings directly, commit/push the single `codex/product-ux-audit` branch and create a PR for the brother's review. This supersedes earlier no-commit/no-push/no-PR instructions in historical dispatch notes; it does not authorize a default-branch merge or deployment.

Both implementation chats are finished. The parent fixed late accepted-job tracking and unnamed revision controls, merged the newer upstream account/login work from `origin/master` `7a33f41`, preserved the chosen editorial desk, integrated authenticated API calls and account-scoped approval/archive/review/run boundaries, and rejected stale session responses after identity changes. Independent static recheck found no remaining introduced integration defects. Final integrated backend suite: **192 passed**, one Starlette/httpx deprecation warning, **zero outbound attempts**. All three synthetic browser suites passed; production build passed; lint exits 0 with **78 warnings**. Proper-name corpus coverage remains partial. Real devices/providers/cloud account flows remain unverified. Inherited capture/media/shared-settings authorization gaps prevent a production-readiness claim.

T1–T4 and T9–T14 have local implementation evidence; T5 remains partial. T6/T7's first visual direction is superseded by the selected editorial desk. T8/T15 local review evidence is available, while brother's visual acceptance and production-boundary acceptance remain pending. Earlier checkboxes and handoff counts record dispatch snapshots, not the current final status.

Current reviewer guide, independently sequenced prompt, comparison claims, screenshots and motion evidence are in [docs/review/README.md](docs/review/README.md). The explanatory [comparison](docs/review/COMPARISON.md) must be read **after** an independent comparison is recorded. Draft PR publication is for private local review only.
