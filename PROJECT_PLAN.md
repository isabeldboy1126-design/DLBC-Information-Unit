# PROJECT_PLAN.md — DLBC Information Unit App

**Version:** 0.2
**Last Updated:** 2026-08-16
**Planning Approach:** Hybrid / Rolling-Wave
**Status:** Approved — Phase 0 in progress

---

## 1. Project Objective

Deliver a working Version 1 of the DLBC Information Unit App that proves the full core workflow:

> Live or recorded audio → Transcription → Verification → AI Editing → Human Review → AI Proofreading → Human Final Review → Final Document → Distribution

The system must measurably reduce the time and effort required to produce Information Unit reports while preserving accuracy, traceability, and human oversight.

---

## 2. Project Boundaries

### In Scope (V1)

- Desktop-first web application (React + Vite frontend, Python + FastAPI backend, SQLite database)
- Audio capture from laptop microphone, USB microphone, USB audio interface, or mixer
- Uploaded recording processing (MP3, WAV, M4A, MP4)
- Live audio transcription
- Session creation, storage, and history
- Transcript verification with flagging, timestamps, and audio replay
- AI editing with human review
- AI proofreading with human review
- Editor and Proofreader knowledge management
- Basic document generation
- Application settings
- Error recovery
- Local file storage for audio, recordings, and documents

### Out of Scope (V1)

See `PROJECT_SCOPE.md` Section 8 for the complete exclusion list. Key exclusions:

- Native mobile applications
- Store publishing
- Complex authentication / multi-user login
- Multi-branch administration
- Advanced analytics
- Publication design (booklets, magazines)
- YouTube downloading
- Full WhatsApp automation
- Large-scale deployment

---

## 3. Major Stakeholders

The prototype is currently being developed independently by the project owner before formal stakeholder adoption.

| Stakeholder Group | Role | Status |
|---|---|---|
| Project owner / developer | Builds, tests, and operates the system; makes product decisions | **Confirmed** |
| Information Unit reporters | Currently write manual reports; role changes with the new system | **Existing stakeholder group; project involvement not yet confirmed** |
| Information Unit editors | Review and approve AI-edited reports | **Existing stakeholder group; project involvement not yet confirmed** |
| Information Unit proofreaders | Review and approve AI-proofread reports | **Existing stakeholder group; project involvement not yet confirmed** |
| Information Unit leadership | Oversee output quality and approve workflow changes | **Existing stakeholder group; project involvement/approval not yet confirmed** |
| Media / audio team | Provide audio feeds and church equipment | **Expected dependency; confirmation pending** |
| Eventual operators | Run the application during church programmes | **Project owner initially; future operators unconfirmed** |
| Church leadership | May need to approve use of the system at certain stages | **Possible approval stakeholder; unconfirmed** |

---

## 4. Assumptions

| # | Assumption | Impact if Invalid |
|---|---|---|
| A1 | The system will initially run on a single Windows laptop | May need cross-platform support earlier |
| A2 | Reliable internet access is available for external AI API calls | Need offline transcription fallback |
| A3 | The project owner has access to existing edited reports and editorial guidelines | Editor knowledge seeding will be delayed |
| A4 | The built-in laptop microphone produces sufficient audio quality for development | May need external mic earlier in development |
| A5 | Church audio equipment presents as a standard audio input device to the OS | May need custom audio driver handling |
| A6 | SQLite is adequate for V1 data volumes | May need database migration |
| A7 | A single operator runs the application during a programme | May need concurrency handling |
| A8 | Browser-based audio capture APIs provide sufficient control | May need Electron or native audio layer |
| A9 | Gemini API or equivalent can produce Information Unit–quality editing | May need different AI approach or heavier human involvement |

---

## 5. Constraints

| # | Constraint |
|---|---|
| C1 | Church-internal project — not commercial SaaS |
| C2 | Must work on a Windows laptop |
| C3 | Budget constraints on API usage |
| C4 | No specialised hardware beyond standard audio equipment |
| C5 | All original source material must be preserved |
| C6 | Humans must remain in control of critical review stages in V1 |
| C7 | No major architectural changes without justification and approval |
| C8 | **AI development quota is limited.** Development must be planned and executed efficiently enough to deliver the complete working V1 within available model usage limits. Quota efficiency must not compromise correctness, security, data integrity, or required acceptance testing. |

---

## 6. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R01 | Poor live audio quality leads to inaccurate transcription | Medium | High | Support external audio devices; audio testing before recording; audio quality indicators | Open |
| R02 | Transcription errors propagate into reports | High | High | Verification stage with flagging and audio replay; never overwrite raw transcript | Open |
| R03 | Scripture and name recognition errors | High | High | Dedicated Bible-reference verification; church terminology knowledge base; human verification | Open |
| R04 | Internet failure during live transcription | Medium | High | Original audio always preserved locally; error recovery; offline transcription not mandatory for V1 but architecture supports future local provider | Open |
| R05 | AI provider failure or outage | Low–Medium | High | Provider abstraction layer enables switching; graceful error handling; session integrity preserved | Open |
| R06 | AI alters meaning of preacher's message | Medium | Critical | Human review mandatory in V1; side-by-side transcript comparison; strict Editor constraints | Open |
| R07 | Loss of original audio | Low | Critical | Audio saved before processing begins; never overwritten; file integrity checks | Open |
| R08 | Provider cost or rate limits exceed budget | Medium | Medium | Monitor usage; efficient API calls; ability to switch providers; local transcription option | Open |
| R09 | Hardware/audio device compatibility issues | Medium | Medium | Standard Web Audio APIs; device enumeration and testing UI; fallback to built-in mic | Open |
| R10 | Premature automation before accuracy is proven | Low | High | Automation toggles off by default; incremental trust model; explicit approval required | Open |
| R11 | Scope creep delays V1 delivery | Medium | High | Strict scope boundaries in PROJECT_SCOPE.md; change control; milestone-based delivery | Open |
| R12 | Browser audio API limitations (e.g., device selection, format control) | Medium | Medium | Investigate during Phase 1; escalate to Electron or alternative if needed | Open |
| R13 | Live transcription latency or streaming limitations | Medium | Medium | Investigate during Phase 3; may affect real-time display approach | Open |
| R14 | Lossy audio capture degrading transcription quality | Medium | High | Lossless-first capture policy; investigate PCM/FLAC capture in Phase 1; verify browser capabilities before architecture decisions | Open |

---

## 7. Major Deliverables

### Phase 0 — Project Foundation

**Objective:** Establish project context, architecture, repository structure, and development environment so that implementation can begin cleanly.

**Dependencies:** None.

**High-Level Requirements:**
- `PROJECT_SCOPE.md` — authoritative product specification
- `AGENTS.md` — operating rules for AI coding agents
- `PROJECT_PLAN.md` — this document
- Repository initialised with Git version control
- `.gitignore` configured appropriately
- Project directory structure established
- React + Vite frontend initialised
- Python + FastAPI backend initialised
- SQLite integration structure prepared (no product features yet)
- Environment-variable handling for future secrets/API keys
- Frontend and backend can both start successfully
- Minimum connection/health check proving frontend–backend communication
- High-level architecture documented in existing project documentation

**Acceptance Criteria:**
- [x] All three project documents created and approved by project owner
- [x] Repository initialised with Git and `.gitignore`
- [x] Clean project directory structure established
- [x] React + Vite frontend starts without errors
- [x] FastAPI backend starts without errors
- [x] Frontend can communicate with backend (health-check endpoint)
- [x] Secrets/API keys are not committed to version control
- [x] Architecture decisions documented
- [x] Clean Git checkpoint created

**Major Risks:** Minimal. No architecture-blocking risks identified during Phase 0.

**Status:** ✅ Completed (2026-08-16)

---

### Phase 1 — Audio Capture Lab

**Objective:** Select a laptop microphone or external audio device, detect audio, start/stop recording, and save playable audio. Investigate lossless-first audio capture architecture.

**Dependencies:** Phase 0 complete.

**High-Level Requirements:**
- Enumerate available audio input devices
- Allow user to select an audio input device
- Display audio activity indicator (visual feedback that audio is being received)
- Test audio input before committing to a recording
- Start recording
- Stop recording
- Save recording in a playable format
- Play back the recording within the application
- Handle failure states (no device, permission denied, device disconnected)
- **Investigate browser audio capture capabilities for lossless-first architecture:**
  - Test whether `MediaRecorder` can produce lossless or PCM-compatible output
  - If not, investigate Web Audio / AudioWorklet PCM capture approaches
  - Investigate FLAC as a lossless storage format
  - Document findings and chosen capture strategy

**Acceptance Criteria:**
- [ ] User can see a list of available audio input devices
- [ ] User can select a specific device
- [ ] Audio activity is visually indicated
- [ ] Recording can start and stop cleanly
- [ ] Resulting audio file can be played back successfully
- [ ] Failure states display appropriate messages and do not silently destroy the session
- [ ] Works with built-in laptop microphone
- [ ] Works with at least one external USB audio device (if available for testing)
- [ ] Audio capture format/strategy investigated and documented (lossless-first policy)
- [ ] Capture approach chosen based on actual browser capability testing, not assumptions

**Major Risks:** R09 (hardware compatibility), R12 (browser audio API limitations), R14 (lossy capture).

**Status:** ⚪ Not Started

**Note:** Phase 1 should create a minimal functional interface (audio selector, start/stop controls, level indicator) sufficient for testing. This interface does not need visual polish — that comes in Phase 10.

---

### Phase 2 — Recorded File Transcription

**Objective:** Upload an existing church recording and obtain a transcript.

**Dependencies:** Phase 0 complete. Phase 1 recommended but not strictly required (uploaded files bypass audio capture).

**High-Level Requirements:**
- Upload audio file (MP3, WAV, M4A, MP4)
- Validate uploaded file format
- Send audio to transcription provider via backend
- Receive and store raw transcript
- Display transcript to user
- Retain timestamps in transcript where technically practical
- Preserve original uploaded file

**Acceptance Criteria:**
- [ ] User can upload a supported audio file
- [ ] Invalid formats are rejected with a clear message
- [ ] Transcription completes and raw transcript is stored
- [ ] Transcript is displayed with timestamps
- [ ] Original uploaded file is preserved unchanged
- [ ] Transcription errors are handled gracefully

**Major Risks:** R02 (transcription errors), R03 (Scripture/name recognition), R05 (provider failure), R08 (cost).

**Unresolved Decision:** Primary transcription provider. Investigate Google Speech-to-Text, faster-whisper, and alternatives.

**Status:** ⚪ Not Started

---

### Phase 3 — Live Transcription

**Objective:** Stream live audio from the laptop/USB microphone and display transcript while audio is still arriving.

**Dependencies:** Phase 1 (audio capture), Phase 2 (transcription infrastructure).

**High-Level Requirements:**
- Stream audio from selected input device to transcription service
- Display transcript incrementally as audio is processed
- Retain timestamps
- Simultaneously save the original audio recording
- Handle interruptions (network drop, device disconnect) without losing captured audio or partial transcript
- Stop live transcription when recording stops

**Acceptance Criteria:**
- [ ] Transcript appears progressively while audio is still being captured
- [ ] Timestamps are retained in the live transcript
- [ ] Original audio is fully preserved regardless of transcription outcome
- [ ] Network interruption does not destroy the session or lose already-captured audio
- [ ] Latency is acceptable for the use case (transcript appears within seconds, not minutes)

**Major Risks:** R01 (audio quality), R04 (internet failure), R13 (streaming latency).

**Status:** ⚪ Not Started

---

### Phase 4 — Session Persistence

**Objective:** Store session metadata, audio, transcript, and workflow state reliably.

**Dependencies:** Phase 2 (transcript data exists to store).

**High-Level Requirements:**
- Define session data model (metadata, audio reference, transcript stages, workflow state)
- Store sessions in SQLite database
- Store audio files and documents in local file storage
- Create, read, update session records
- Session list / history view
- Session detail view showing current workflow state
- Ensure each processing stage is stored separately (raw transcript, verified transcript, etc.)
- Basic error recovery (interrupted sessions can be resumed)

**Acceptance Criteria:**
- [ ] Sessions are persisted across application restarts
- [ ] Session list displays all sessions with key metadata
- [ ] Opening a session shows its current state and all completed stages
- [ ] Audio, transcript, and processing stages are stored separately and retrievable
- [ ] A session interrupted mid-processing can be resumed without data loss

**Major Risks:** R07 (data loss), A6 (SQLite adequacy).

**Status:** ⚪ Not Started

---

### Phase 5 — Verification

**Objective:** Implement the flagging, timestamp-linked audio replay, correction, and verification workflow.

**Dependencies:** Phase 2 or 3 (transcript exists), Phase 4 (session persistence).

**High-Level Requirements:**
- Automatically identify items requiring verification: Bible references, names, numbers, dates, uncertain speech
- Allow manual flagging of transcript moments
- Display flagged items with relevant transcript section and timestamp
- Audio replay of the corresponding segment
- Correct flagged items
- Confirm flagged items as correct
- Produce a verified transcript (stored separately from raw transcript)

**Acceptance Criteria:**
- [ ] Flagged items are identified automatically after transcription
- [ ] User can manually flag additional items
- [ ] Each flagged item shows transcript context and timestamp
- [ ] Audio replay starts at the correct position for the flagged item
- [ ] User can edit the transcript at flagged positions
- [ ] User can confirm a flagged item without changes
- [ ] Verified transcript is saved as a separate record from the raw transcript

**Major Risks:** R02, R03 (transcription/recognition errors), R12 (audio replay precision).

**Status:** ⚪ Not Started

---

### Phase 6 — AI Editor

**Objective:** Integrate AI editing with Editor knowledge management and human review.

**Dependencies:** Phase 5 (verified transcript), Phase 4 (session persistence).

**High-Level Requirements:**
- Editor knowledge management UI (upload guidelines, rules, terminology, examples)
- Store and retrieve Editor knowledge
- Send verified transcript + Editor knowledge to AI provider via backend
- Receive edited report
- Display edited report for human Editor review
- Side-by-side or comparison view: verified transcript vs. edited report
- Human can correct the edited report
- Human approves or rejects the edited report
- "Automatically Continue to Proofreading" setting (OFF by default)
- Provider abstraction (EditorService)

**Acceptance Criteria:**
- [ ] Editor knowledge can be uploaded, viewed, updated, and removed via the UI
- [ ] Verified transcript is sent to the AI Editor and an edited report is returned
- [ ] Edited report is displayed alongside the verified transcript for comparison
- [ ] Human can make corrections to the edited report
- [ ] Human can approve the edited report
- [ ] Approved edited report is stored as a separate stage
- [ ] Auto-continue to proofreading defaults to OFF
- [ ] AI Editor does not proceed without a verified transcript

**Major Risks:** R06 (AI altering meaning), R05 (provider failure), R08 (cost), R10 (premature automation).

**Unresolved Decision:** Primary AI provider for editing. Gemini API is the current intended first provider, but `EditorService` must remain provider-abstracted.

**Status:** ⚪ Not Started

---

### Phase 7 — AI Proofreader

**Objective:** Implement separate proofreading logic with warnings and human review.

**Dependencies:** Phase 6 (edited report exists).

**High-Level Requirements:**
- Proofreader knowledge management UI (upload guidelines, rules, examples)
- Store and retrieve Proofreader knowledge
- Send edited report + Proofreader knowledge to AI provider via backend
- Receive proofread output with identified issues
- Display proofread report with highlighted changes/warnings
- Identify possible meaning changes
- Identify suspicious differences between verified transcript and edited report
- Human can accept/reject individual proofreading suggestions
- Human approves final proofread version
- Provider abstraction (ProofreaderService)

**Acceptance Criteria:**
- [ ] Proofreader knowledge can be managed via the UI
- [ ] Proofread output is returned with identifiable changes
- [ ] Changes/warnings are displayed to the human reviewer
- [ ] Possible meaning changes are flagged
- [ ] Human can accept or reject suggestions
- [ ] Proofread report is stored as a separate stage from the edited report
- [ ] Proofreader is logically separate from the Editor (separate service, separate knowledge)

**Major Risks:** R06 (meaning changes), R05 (provider failure).

**Status:** ⚪ Not Started

---

### Phase 8 — Final Document

**Objective:** Human final review and basic document generation.

**Dependencies:** Phase 7 (proofread report exists).

**High-Level Requirements:**
- Human final review of the proofread report
- Human can make final corrections
- Human approves the final report
- Generate a distributable document from the approved report
- Store the final approved report as the last stage

**Acceptance Criteria:**
- [ ] Human can review and correct the proofread report
- [ ] Human can approve the final version
- [ ] A document is generated in at least one distributable format
- [ ] Final approved report is stored separately
- [ ] The complete chain (audio → raw transcript → verified → edited → proofread → final) is intact and navigable

**Major Risks:** Minimal at this stage if previous phases are solid.

**Unresolved Decision:** Output format(s) — DOCX, PDF, plain text, or multiple. To be decided before implementation.

**Status:** ⚪ Not Started

---

### Phase 9 — Complete Application UX

**Objective:** Integrate all workflow stages into a cohesive application experience with dashboard, navigation, session workflow, history, and settings.

**Dependencies:** Phases 1–8 (all core functionality exists).

**Clarification:** Earlier technical phases (1–8) may and should create minimal functional interfaces required to test their features (e.g., audio selector, transcript display, review interface). Phase 9 is where these functional interfaces are integrated into the complete application UX. These test interfaces do not need visual polish before Phase 9.

**High-Level Requirements:**
- Dashboard / home screen showing recent sessions and quick actions
- Session workflow view guiding the user through stages
- Session history with search/filter
- Settings page (audio device selection, automation toggles, knowledge management access)
- Consistent navigation between all features
- Responsive layout (desktop-first but not broken at reasonable window sizes)

**Acceptance Criteria:**
- [ ] All features are accessible through a coherent navigation structure
- [ ] New session creation flows naturally into the workflow
- [ ] Session history is browsable and sessions can be resumed
- [ ] Settings are accessible and changes persist
- [ ] The application feels like one integrated product, not disconnected feature pages

**Major Risks:** R11 (scope creep — temptation to add features during integration).

**Status:** ⚪ Not Started

---

### Phase 10 — UI Integration and Polish

**Objective:** Integrate the approved Google Stitch visual design system (aligned with DLBC brand direction) without breaking established functionality.

**Dependencies:** Phase 9 (complete UX structure exists).

**Clarification:** Phase 10 applies the Google Stitch design system and visual polish. Functional test interfaces created during Phases 1–8 are expected to be clean, modular, and usable but unpolished; final visual integration comes here.

**High-Level Requirements:**
- Consistent visual design system (typography, colours aligned with DLBC brand palette, spacing, components)
- Smooth transitions and micro-interactions where appropriate
- Loading states and progress indicators for long operations
- Error states styled consistently
- Accessibility basics (readable text, keyboard navigation for critical flows)

**Acceptance Criteria:**
- [ ] All existing functionality still works after visual polish
- [ ] Visual design is consistent across all pages and aligned with DLBC brand direction
- [ ] Long operations show appropriate progress feedback
- [ ] Error states are styled and informative
- [ ] The application looks professional and trustworthy

**Major Risks:** Risk of breaking working features during restyling. Mitigate by testing each area after applying changes.

**Status:** ⚪ Not Started

---

### Phase 11 — Real-World Testing

**Objective:** Compare system performance against actual church recordings and eventually conduct approved live tests.

**Dependencies:** Phases 1–10 (complete, polished application).

**High-Level Requirements:**
- Test with multiple real church recordings of varying quality
- Evaluate transcription accuracy
- Evaluate Editor output quality against human-edited examples
- Evaluate Proofreader effectiveness
- Test full end-to-end workflow timing vs. manual process
- Conduct at least one supervised live test during a church programme (when approved)
- Collect feedback from Information Unit stakeholders
- Document findings, issues, and improvement areas

**Acceptance Criteria:**
- [ ] At least 3 real church recordings processed end-to-end successfully
- [ ] Transcription accuracy is sufficient for the verification workflow to be practical
- [ ] Editor output is recognisably Information Unit style and does not distort meaning
- [ ] Proofreader catches genuine issues without introducing new errors
- [ ] End-to-end time is measurably faster than the current manual process
- [ ] At least one live test completed (when church approval is obtained)
- [ ] Stakeholder feedback collected and documented

**Major Risks:** R01 (audio quality in real conditions), R06 (meaning accuracy at scale), R10 (premature trust).

**Status:** ⚪ Not Started

---

## 8. Rolling-Wave Planning Notes

This plan follows a **rolling-wave** approach:

- **Near-term phases** (Phase 0–1) are detailed with specific acceptance criteria and can be decomposed into tasks when implementation begins.
- **Mid-term phases** (Phase 2–5) have clear objectives and acceptance criteria but will receive detailed task-level planning as each phase approaches.
- **Later phases** (Phase 6–11) have defined objectives and high-level requirements but will be refined based on learnings from earlier phases.

Before beginning each phase:
1. Review and refine the phase requirements in this plan.
2. Identify any new risks or dependency changes.
3. Decompose into specific implementation tasks.
4. Update this document with the detailed plan.
5. Obtain project-owner approval if the detailed plan reveals scope questions.

---

## 9. Progress Tracking

| Phase | Description | Status | Planned Start | Actual Start | Actual Completion |
|---|---|---|---|---|---|
| 0 | Project Foundation | ✅ Completed | 2026-08-16 | 2026-08-16 | 2026-08-16 |
| 1 | Audio Capture Lab | ⚪ Not Started | — | — | — |
| 2 | Recorded File Transcription | ⚪ Not Started | — | — | — |
| 3 | Live Transcription | ⚪ Not Started | — | — | — |
| 4 | Session Persistence | ⚪ Not Started | — | — | — |
| 5 | Verification | ⚪ Not Started | — | — | — |
| 6 | AI Editor | ⚪ Not Started | — | — | — |
| 7 | AI Proofreader | ⚪ Not Started | — | — | — |
| 8 | Final Document | ⚪ Not Started | — | — | — |
| 9 | Complete Application UX | ⚪ Not Started | — | — | — |
| 10 | UI Integration and Polish | ⚪ Not Started | — | — | — |
| 11 | Real-World Testing | ⚪ Not Started | — | — | — |

---

## 10. Change Control

Any change to V1 scope must be:

1. Documented in `PROJECT_SCOPE.md`.
2. Reflected in this plan.
3. Approved by the project owner.

Scope additions after approval are recorded here:

| Date | Change | Reason | Impact | Approved By |
|---|---|---|---|---|
| 2026-08-16 | Confirmed V1 tech stack: React+Vite, FastAPI, SQLite, Git | Project-owner decision | Removes unresolved frontend/backend decisions | Project owner |
| 2026-08-16 | Added lossless-first audio capture policy | Audio quality is foundational to transcription accuracy | Phase 1 must investigate browser capabilities; new risk R14 added | Project owner |
| 2026-08-16 | Corrected stakeholder statuses | Prototype is independently developed; no formal adoption yet | Stakeholder table reflects actual confirmation status | Project owner |
| 2026-08-16 | Clarified V1 distribution | V1 produces downloadable document; no WhatsApp automation | No new implementation needed; scope boundary clarified | Project owner |
| 2026-08-16 | Clarified offline capability | Offline transcription not mandatory for V1 | Removes offline from V1 scope; architecture remains extensible | Project owner |
| 2026-08-16 | Added DLBC visual brand direction | Application should align with church identity | Palette documented; detailed UI design deferred to Phase 10 | Project owner |

---

## Document Control

| Field | Value |
|---|---|
| Document | PROJECT_PLAN.md |
| Purpose | Delivery roadmap and rolling-wave project plan |
| Authority | Changes require project-owner approval |
| Related documents | PROJECT_SCOPE.md, AGENTS.md |
