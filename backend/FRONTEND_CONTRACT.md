# Backend repair contract — 30 September 2026

Implemented locally and verified offline. Backend owns this contract; frontend may integrate these additive fields/routes. Existing paths remain available. No live AI/device evidence is claimed. Exact results and residual limits are in `backend/IMPLEMENTATION_HANDOFF.md`.

## State and workflow

`report_processing_status=completed` means draft generation finished, never human approval. Successful runs retain `final_report_id` as a compatibility pointer to the saved report revision, and add `draft_report_id`, `review_status=needs_review`. Failed runs have `status=failed`, `error_message`, and `error_code` (`provider_unavailable`, `invalid_output`, `source_changed`, or `processing_failed`); no new report is saved. Retry `/api/report-processing/start` with `{session_id, force_new:true}`; an already active run is always reused.

Session `final_report_status` is `not_started`, `needs_review`, or `approved`. Existing ambiguous finals migrate to `needs_review`, preserving all text/revisions and adding `approval_status=legacy_unreviewed`. Never infer approval from `complete`, `completed`, or an AI proofreading flag.

Generated reports are drafts in the existing revision table, with `approval_status=draft`, `source_run_id`, null `approved_at`, and `can_export=false`. The consolidated call remains a single draft generator; an editor revision is also saved for the existing editor/proofreader routes. It does not create a fictitious human-approved proofread stage. `proofread_report_revision_id` is nullable for this source, while `source_run_id` identifies the actual generator. Auto-continue-to-proofreading stays OFF by default.

### Source changes during generation (T9)

Generation captures transcript, session metadata and selected reused editor/reporter material in one coherent database snapshot before the provider call. The input is checked again under the persistence write lock. Editor revision, report draft, completed run and session completion commit together; a failure rolls back the whole bundle. A change to verified/raw text, fallback segment text, prompt metadata, selected reused material content/identity, proofread review identity/acceptance or archive state during generation returns `status=failed`, `error_code=source_changed`. Previous report revisions remain active and no output from the obsolete input is saved. Show the error and let the operator review the current source before retrying. Existing approved material retains its ordinary source freshness gates.

Runs expose additive `generation_input_signature` and `input_snapshot_json` (a JSON string containing hashes, reused revision/report IDs, review IDs and a hash of the actual compiled prompt). Generated drafts retain the same `generation_input_signature`. These identify the original generation input; `source_signature` separately binds the saved draft to its current review source after its new editor revision is created. They are provenance fields, not approval signals. Hashes do not prove factual accuracy. Legacy rows have null generation provenance; it is not manufactured retrospectively.

This transaction contract is implemented and tested for **local SQLite**. Consolidated generation on the cloud adapter fails closed; equivalent cloud lock/isolation support is not implemented or verified. Other existing cloud routes have not been tested. No production readiness is implied.

### Atomic finalization from accepted proofreading (T10)

`POST /api/final-report/sessions/{id}/finalize` keeps its request `{proofread_revision_id?, report_title?}` and successful `status=approved` response. Omit `report_title` to use the current accepted proofread title; an intentional override remains supported. Source selection/acceptance, editor lineage, draft creation, active revision/session pointer and approval audit now occur under one SQLite transaction. A 409 source/review conflict rolls back the replacement and its approval; the previous final remains active, the session pointer is unchanged and no partial new draft/history/approval is committed. Legitimate concurrent source changes are retained; the previous final may already need renewed review under the existing freshness gates. Reload the accepted source and report detail after a conflict before retrying. Never infer that a 409 saved a new draft.

Missing or blank proofread source, or a blank title, returns 400; stale, wrong-session, unaccepted, obsolete-editor or archived source returns 409. Missing session stays 404. Repeating successful finalization of the same current source/title returns the same report ID and creates no duplicate revision/approval, including concurrent repeat requests. `download_filename` is returned consistently on success; DOCX is still rendered by the existing export routes from the exact saved approved text/metadata. Finalization does not generate a disposable document before approving.

Fixture example: `final-old` is active and points to the older retained source; `proof-new` is the current accepted source. A request `{ "proofread_revision_id": "proof-new" }` encountering an editor conflict returns HTTP 409 `{ "detail": "The editor source has changed. Proofread the current editor revision first." }`. A subsequent detail read still has `active_final_report.id="final-old"`, and the session still has `final_report_id="final-old"`. History contains no partial replacement. A reviewed retry succeeds with a new approved ID, `proofread_report_revision_id="proof-new"`, the accepted proofread title and both final revisions retained.

Atomic finalization is also **local SQLite only**. On the unimplemented cloud isolation adapter it fails closed with 409, preserving replacement state. This is a backend capability limit, not an indication that another approval retry can enable cloud support.

## Review and export

- `GET /api/final-report/sessions/{id}` returns existing fields plus `review_status`, `can_approve`, `can_export`; `active_final_report` includes `approval_status`, `approved_at`, `source_run_id`, `can_export`, `can_approve`, `source_changed`. Use `can_approve`/`can_export` rather than inferring these permissions from processing completion.
- `POST /api/final-report/sessions/{id}/approve` body `{revision_id:"saved-report-id"}` explicitly approves the active saved revision. Returns `{status:"approved",session_id,final_report_status:"approved",final_report}`. Repeated approval of that same revision is idempotent. Wrong/stale revision: 409. No active report: 404. Archived session: 409.
- Existing `POST .../save-revision` creates a new unapproved draft, preserving earlier approval history and clearing stale export metadata. Editing/proofreading/verified-source changes invalidate final export until renewed review. Content changes under the same editor/proofreader ID and segment-only transcript changes are also detected. A consolidated draft can be updated with save-revision. For reports derived from proofreading, accept the current proofread source and use `/finalize` after source changes; an obsolete accepted source cannot be reused. Later session-label changes do not alter a report's saved metadata or revoke approval of those saved labels.
- Existing proofreader accept remains deliberate. Existing `/finalize` requires the accepted active proofread revision belonging to this session; it is an explicit final approval action, never a way to bypass acceptance.
- All three exports (`GET /api/final-report/sessions/{id}/download`, `POST /api/report-processing/generate-docx/{id}`, `GET /api/report-processing/download-docx/{id}`) require current approval and reject drafts/stale approval with 409. Export bytes derive from the exact approved saved text and saved minister/programme/date snapshot. Exports render fresh in memory; identical filenames across sessions cannot serve another report's cached file. Generate-DOCX keeps its existing `status=success`, filename, file_size and download_url response. The existing editor DOCX route remains a clearly labelled **Edited Draft** export and does not approve a final.
- Restoring an old final revision makes it a draft for renewed approval; historical approval records remain preserved.

Representative final-report detail:

```json
{"session_id":"synthetic-session","final_report_status":"needs_review","review_status":"needs_review","can_approve":true,"can_export":false,"active_final_report":{"id":"revision-1","revision_number":1,"report_title":"Synthetic report","report_text":"Saved reviewable prose.","approval_status":"draft","approved_at":null,"source_run_id":"run-1","proofread_report_revision_id":null,"can_export":false}}
```

## Archive / restore

- `GET /api/sessions` defaults to active only. `?archived=true` lists archived only; `?include_archived=true` lists both. Session records add `is_archived`, `archived_at`.
- `POST /api/sessions/{id}/archive` and compatibility `DELETE /api/sessions/{id}` return `{status:"archived",session_id}`. These retain all files, source text and revisions. Repeated archive is idempotent.
- `POST /api/sessions/{id}/restore` returns `{status:"restored",session_id}`; repeated restore is idempotent.
- `GET /api/sessions/{id}` remains readable while archived. No permanent deletion is exposed by this repair.
- Sibling `DELETE /api/audio/recordings/{recording_id}` returns 409: original recordings are protected; archive the linked session instead. Existing manifests/source files are retained. Older tombstones are respected by startup indexing and are not retroactively rewritten or recovered.

## Readiness

`GET /api/readiness` exposes backend/database availability, AI configured (configuration only, no provider probe), and KJV context availability/completeness. Health remains a liveness endpoint. Missing names source is reported as partial domain context, not full readiness. Credentials are never returned. `KJV_CONTEXT_DB_PATH` selects a reproducibly provisioned database; builder accepts local corpus/seeds/output paths and performs no network fetch. A complete local verse build has 31,102 verses/66 books; the available name supplement has 101 entries versus the recorded comprehensive baseline of 2,808. See `backend/README.md` for deterministic setup and the exact missing-source route.

Representative readiness response for an offline, provisioned checkout:

```json
{"backend_available":true,"database_available":true,"ai_provider":{"configured":false,"live_verified":false,"model":"gemini-3.8-flash"},"kjv_context":{"available":true,"complete":false,"verse_corpus_complete":true,"proper_names_complete":false,"missing_sources":["Complete BibleNLP names.tsv (macula_eng, ref); expected 2,808 supplemented entries"],"book_count":66,"verse_count":31102},"ready":false}
```

Validation requires every field in the explicit `ReportDraftOutput` schema, correct types, nonblank title/text, true AI grammar/anti-slop checks and local absence of prohibited clichés. There is no arbitrary minimum word count: a brief valid report remains reviewable. Schema/quality validation does not establish factual faithfulness; human review remains necessary. `auto_continue_to_proofreading` defaults to string `"false"` in settings; generation never launches the separate proofreader route automatically.

## Evidence plan

Offline tests use temporary DB/storage and synthetic fixtures: absent provider, provider failure, malformed/wrong-shape/empty/cliché output, valid short draft, retry preservation, active-run idempotency, approval/double approval/stale revisions, source edits after approval, legacy migration, all export gates, archive/restore/source bytes, full 66-book/31,102-verse KJV asset and honest names readiness. Exact results will be recorded in `backend/IMPLEMENTATION_HANDOFF.md`.

T9 regressions additionally exercise provider-await mutations, same-ID reused material edits, coherent capture across concurrent reads, changes immediately before persistence, a rejected concurrent write inside the persistence transaction, post-commit freshness, failures after editor/final writes and fail-closed unimplemented cloud isolation. The original independent race reproducer is rerun alongside them.

T10 regressions exercise a source conflict between draft creation and approval, an abort after approval audit writes, source changes before lock acquisition, competing writers blocked inside the transaction, successful replacement with history preserved, sequential/concurrent idempotency, stale/invalid input, reviewed/default title behavior and fail-closed cloud isolation. Original audio bytes/raw text/source revisions are checked in synthetic disposable storage.
