# PROJECT_SCOPE.md — DLBC Information Unit App

**Version:** 0.2
**Last Updated:** 2026-08-16
**Status:** Approved — Phase 0 in progress

---

## 1. Product Description

The DLBC Information Unit App is an internal desktop-first web application built for the Information Unit of Deeper Life Bible Church.

It captures, transcribes, edits, proofreads, and delivers reports of messages preached during church programmes. The system combines audio capture, AI-assisted transcription and editing, and structured human review to automate and streamline significant portions of the current labour-intensive manual reporting process while retaining human oversight.

This is a church-focused internal tool. It is **not** a commercial SaaS product.

---

## 2. Current Information Unit Workflow

The existing process is entirely manual:

1. Multiple reporters independently listen to a preached message and write reports.
2. Reports capture: speaker/preacher, message topic/title, major Bible text, programme/service, message start and end times, main message content, major points, illustrations, Bible references, and other important information.
3. Reports are typed or compiled.
4. An editor examines multiple reports and produces one properly edited report according to Information Unit standards.
5. A proofreader checks grammar, punctuation, clarity, consistency, possible mistakes, and overall quality.
6. The final report is distributed through Information Unit communication channels (including WhatsApp).
7. For larger programmes, reports may later be combined with photographs and designed into publications.

### Problems With the Current Process

| Problem | Impact |
|---|---|
| Multiple reporters independently report the same message | Duplicated effort |
| Reports are manually written, typed, and compiled | Slow, labour-intensive |
| Editor must manually reconcile multiple report versions | Time-consuming, stressful |
| Proofreading is entirely manual | Quality depends on individual availability and fatigue |
| No systematic traceability between the final edited report and the original preached message within the reporting workflow | Difficult to verify accuracy after editing; existing sermon recordings may exist independently but the reporting workflow does not automatically connect report content to timestamped source audio |
| Entire pipeline is sequential and human-dependent | Bottlenecks at every stage |
| No standardised minimum quality baseline | Inconsistent output across programmes |

---

## 3. Business Objective

The purpose of this software is to:

- Dramatically reduce the time required to process messages.
- Reduce repetitive manual work.
- Reduce stress on Information Unit workers.
- Reduce unnecessary duplication of reporting.
- Reduce omissions.
- Improve consistency.
- Create a more standardised minimum quality of editing and proofreading.
- Preserve the original source so AI output can always be checked.
- Make the process faster and easier.
- Eventually allow fewer humans to supervise work that currently requires several people.

**Long-term possibility:** If proven reliable, the same system could help Information Units in multiple branches produce more consistent output. This is a future vision, not a V1 requirement.

---

## 4. Target Users

The prototype is currently being developed independently by the project owner before formal stakeholder adoption. The following groups are potential users and stakeholders; their involvement statuses reflect the current development stage.

| User Group | Role | V1 Relevance |
|---|---|---|
| Project owner / developer | Builds, tests, and operates the system | Primary — **confirmed** |
| Information Unit reporters | Currently write manual reports; role changes with the new system | Existing stakeholder group — **project involvement not yet confirmed** |
| Information Unit editors | Review and approve AI-edited reports | Existing stakeholder group — **project involvement not yet confirmed** |
| Information Unit proofreaders | Review and approve AI-proofread reports | Existing stakeholder group — **project involvement not yet confirmed** |
| Information Unit leadership | Oversee output quality and approve workflow changes | Existing stakeholder group — **project involvement/approval not yet confirmed** |
| Media / audio team | Provide audio feeds and equipment | Expected dependency — **confirmation pending** |
| Eventual operators | Run the application during church programmes | Project owner initially — **future operators unconfirmed** |
| Church leadership | May need to approve use of the system | Possible approval stakeholder — **unconfirmed** |

---

## 5. Product Principles

> **Capture once. Verify what matters. Process consistently. Deliver faster.**

The system is optimised around creating a dependable Information Unit production workflow, not maximising the number of AI features.

### Core Principles

1. **Traceability** — Every processing stage is preserved separately. Original audio and raw transcripts are never silently overwritten.
2. **Human oversight** — Humans remain in control of critical review stages. AI assists; humans approve.
3. **Accuracy over speed** — The system must not invent teachings, add unsupported claims, change the preacher's intended meaning, or silently alter Scripture content.
4. **Simplicity** — Prefer the simplest architecture that satisfies the current requirement.
5. **Incremental trust** — Automation of review stages is disabled by default and enabled only after sufficient testing and explicit approval.
6. **Provider independence** — External AI services are accessed through abstraction layers so providers can be changed without rewriting the application.
7. **Audio quality preservation** — The transcription pipeline should preserve audio quality and avoid introducing lossy compression before transcription whenever technically practical. The highest-quality original source available must always be preserved.

---

## 6. Proposed Workflow

```
Live Audio / Uploaded Recording
        ↓
   Transcription
        ↓
   Verification
        ↓
    AI Editor
        ↓
 Human Editor Review
        ↓
  AI Proofreader
        ↓
 Human Final Review
        ↓
  Final Document
        ↓
  Distribution
```

Every message becomes a **Session**. Each session preserves each stage:

```
Original Audio
      ↓
Raw Transcript
      ↓
Verified Transcript
      ↓
Edited Report
      ↓
Proofread Report
      ↓
Final Approved Report
```

---

## 7. Functional Scope — Version 1

### 7.1 Audio Input

**Current requirement:**

- Select any compatible audio-input device detected by the laptop:
  - Built-in laptop microphone
  - Connected USB microphone
  - USB audio interface
  - Church mixer recognised by the computer as an audio device
- Test audio input before recording
- Manually start and stop recording for each message
- Preserve original audio recording
- Upload existing church recordings for processing
- Supported upload formats: MP3, WAV, M4A, MP4

**Audio quality policy (lossless-first):**

Audio quality is a core product requirement because transcription accuracy is foundational to everything downstream.

- Capture the incoming audio signal without intentionally applying lossy compression where technically practical.
- Investigate PCM / LINEAR16-compatible capture for the live transcription stream.
- Investigate FLAC as a lossless storage format where technically practical.
- Preserve the highest-quality original source available.
- Phase 1 must investigate and verify browser audio capture capabilities on the actual development environment before deciding on capture architecture.
- Do not assume that browser `MediaRecorder` can directly generate FLAC or LINEAR16. If standard `MediaRecorder` cannot provide the required lossless capture, investigate Web Audio / AudioWorklet or equivalent browser-compatible PCM capture approaches.

Desired architecture:

```
Audio Input Device
        ↓
Highest practical lossless source/capture
        ├──→ Live Transcription Stream
        │
        └──→ Preserved Source Recording
```

For already-recorded uploaded files (MP3, MP4, M4A):

- Preserve the original uploaded file unchanged.
- Do not claim that converting an already-lossy recording to FLAC restores lost quality.
- Process the best source that is actually available.

**Assumption:** The built-in laptop microphone is the primary development/testing input. Church equipment (mixer → USB audio → laptop) is the eventual production setup.

**Future possibility:** Direct YouTube URL importing is explicitly deferred beyond V1.

### 7.2 Transcription

**Current requirement:**

- Transcribe uploaded recordings
- Transcribe live audio (streaming transcription while audio is still arriving)
- Retain timestamps connecting transcript content to corresponding audio positions where technically practical
- Preserve the raw transcript as an immutable record

**Unresolved decision:** Primary transcription provider (Google Speech-to-Text, faster-whisper/local, or other). This will be investigated during Phase 2.

### 7.3 Verification

**Current requirement:**

After transcription, the system identifies items that may require human verification:

- Bible references
- Names
- Numbers
- Dates
- Uncertain speech
- Manually flagged moments

For each flagged item, the human can:

- See the relevant transcript section
- See its timestamp
- Replay the corresponding audio segment
- Correct the item
- Confirm the item as correct

**Goal:** Humans review exceptions rather than manually rechecking every word.

### 7.4 AI Editor

**Current requirement:**

- Transform the verified transcript into an Information Unit–style report
- Use editing guidelines, rules, church terminology, previous edited reports, raw-to-edited examples, and additional Information Unit knowledge
- Must not: invent teachings, add unsupported claims, change the preacher's intended meaning, or silently alter important Scripture content
- Edited report is available for human inspection and correction before continuing
- Application setting: "Automatically Continue to Proofreading" — **OFF by default**

**Assumption (V1):** Editor configuration is provisional and will initially use information and historical examples currently available to the project owner.

### 7.5 AI Proofreader

**Current requirement:**

- Logically separate from the Editor
- Checks: grammar, spelling, punctuation, clarity, consistency, readability, basic formatting consistency
- Identifies possible meaning changes
- Identifies suspicious differences between the verified transcript and the edited report
- Does not perform an uncontrolled rewrite

### 7.6 Knowledge Management

**Current requirement:**

The application frontend provides settings for managing the working knowledge of both AI agents.

**Editor Knowledge:**
- Upload editing guidelines
- Add editing rules
- Upload previous edited reports
- Pair raw reports/transcripts with corresponding edited versions where possible
- Add church terminology
- View existing Editor knowledge
- Update or remove outdated knowledge

**Proofreader Knowledge:**
- Upload proofreading guidelines
- Add proofreading rules
- Upload examples
- Manage formatting/language expectations
- Update or remove outdated knowledge

Improving agents should not require modifying source code.

### 7.7 Session Management

**Current requirement:**

- Create new sessions
- Store session metadata, audio, transcript, and workflow state
- Session history / dashboard
- Error recovery (failure states do not silently destroy sessions)

### 7.8 Final Document and Distribution

**Current requirement:**

- Human final review of proofread report
- Basic document generation from the approved report
- Distribution means producing a downloadable/exportable final document that is ready to be shared through the Information Unit's existing communication channels (e.g., WhatsApp, email)
- Automatic WhatsApp sending or other channel automation is explicitly out of scope for V1

**Unresolved decision:** Exact output format(s) for document generation (e.g., DOCX, PDF, plain text). To be decided before Phase 8.

### 7.9 Settings

**Current requirement:**

- Application settings UI
- Audio device selection
- Editor/Proofreader knowledge management (see 7.6)
- Automation toggles (e.g., auto-continue to proofreading)

---

## 8. Out of Scope — Version 1

The following are explicitly excluded from V1:

| Item | Status |
|---|---|
| Native Android application | Future possibility |
| Microsoft Store publishing | Future possibility |
| Play Store publishing | Future possibility |
| Complex authentication / multi-user login | Future possibility |
| Multi-branch administration | Future possibility |
| Advanced analytics | Future possibility |
| AI photograph enhancement | Future possibility |
| Automated publication / booklet design | Future possibility |
| Automatic photo selection | Future possibility |
| Complex magazine layouts | Future possibility |
| Direct YouTube downloading | Future possibility |
| Full WhatsApp automation | Future possibility |
| Large-scale church deployment | Future possibility |
| Training a custom foundation model | Future possibility |
| Eliminating human oversight | Explicitly not a goal |

---

## 9. Technical Direction

### Confirmed V1 Technical Stack

| Component | Technology | Status |
|---|---|---|
| Frontend | React + Vite | **Confirmed** |
| Backend | Python + FastAPI | **Confirmed** |
| Database | SQLite | **Confirmed** |
| Storage | Local file storage | **Confirmed** |
| Primary runtime | Windows laptop | **Confirmed** |
| Version control | Git | **Confirmed** |

Do not introduce Next.js, Node.js backend, Firebase, Supabase, Electron, Flutter, or another major framework unless a later requirement proves it necessary and project-owner approval is obtained.

### Frontend

- Desktop-first web application
- React + Vite

### Backend

- Python + FastAPI

### Database

- SQLite

**Assumption:** Single-user or small-team local usage for V1. SQLite is sufficient for this scale.

### Storage

- Local file storage for: source audio, uploaded recordings, generated documents

### AI / API Architecture

- External AI services accessed exclusively through the backend
- API keys never exposed in frontend code
- Abstraction / service layers for provider independence:

```
TranscriptionProvider
EditorService
ProofreaderService
DocumentService
```

- Transcription provider: **Unresolved** — to be benchmarked during Phase 2 using real church recordings. Potential providers include Google Speech-to-Text, faster-whisper, and others. Do not prematurely lock to one provider.
- Editor and Proofreader AI provider: Gemini API is the current intended first provider, but `EditorService` and `ProofreaderService` must remain provider-abstracted.
- Other providers may be added later.

**Constraint:** Do not hard-wire the entire application to one AI provider.

### Offline Capability

- Offline transcription is **not** a mandatory V1 requirement.
- The architecture should remain capable of supporting a local provider (e.g., faster-whisper) later, but do not add offline functionality merely because it may be useful.
- Internet/network failure must not cause loss of locally captured source audio.

### Visual Brand Direction

The application is intended for Deeper Life Bible Church and should visually align with its identity.

Current working palette:

| Colour | Value | Usage |
|---|---|---|
| Primary Blue | `#338FE0` | Dominant brand colour |
| Off-White | `#FBFBFC` | Backgrounds |
| Black / Dark Neutral | `#000000` | Text, dark elements |
| Red | TBD — take from official DLBC/DCLM brand asset | Secondary accent |

Blue should remain dominant. Red should be used selectively for:

- Live/recording indicators
- Critical alerts
- Destructive actions
- Important status emphasis

This is a visual direction for later integration. Detailed UI design will be developed separately and integrated without changing working backend architecture.

---

## 10. Assumptions

| # | Assumption |
|---|---|
| A1 | The system will initially run on a single Windows laptop |
| A2 | Reliable internet access is available for external AI API calls |
| A3 | The project owner has access to existing edited reports and editorial guidelines for seeding Editor knowledge |
| A4 | The built-in laptop microphone produces sufficient audio quality for development and testing |
| A5 | Church audio equipment can present as a standard audio input device to the operating system |
| A6 | SQLite is adequate for V1 data volumes |
| A7 | A single operator runs the application during a programme |
| A8 | Browser-based audio capture APIs provide sufficient control for the required audio functionality |

---

## 11. Constraints

| # | Constraint |
|---|---|
| C1 | Church-internal project; not a commercial SaaS product |
| C2 | V1 must work on a Windows laptop |
| C3 | Budget constraints on API usage (pay-per-use AI services) |
| C4 | Must not require specialised hardware beyond standard audio equipment |
| C5 | Must preserve all original source material at every stage |
| C6 | Humans must remain in control of critical review stages in V1 |
| C7 | Must not introduce major architectural components (Firebase, Supabase, Flutter, cloud databases, etc.) without explicit justification and approval |

---

## 12. Known Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Poor live audio quality | Inaccurate transcription | Support external audio devices; audio testing before recording |
| Transcription errors | Incorrect reports | Verification stage with flagging and audio replay |
| Scripture / name recognition errors | Doctrinal inaccuracy | Dedicated Bible-reference verification; church terminology knowledge |
| Internet failure during live transcription | Session interrupted | Error recovery; local audio always preserved; offline transcription not mandatory for V1 but architecture supports future local provider |
| AI provider failure or outage | Processing blocked | Provider abstraction enables switching; graceful error handling |
| AI altering meaning | Doctrinal or factual errors | Human review mandatory in V1; transcript comparison |
| Loss of original audio | Unrecoverable | Audio saved before processing begins; never overwritten |
| Provider cost / rate limits | Unexpected expenses or throttling | Monitor usage; design for efficient API calls |
| Hardware compatibility | Audio devices not detected | Standard Web Audio APIs; device enumeration and testing UI |
| Premature automation before accuracy is proven | Unreliable output distributed | Automation toggles off by default; incremental trust model |
| Scope creep | Delayed delivery, unfocused product | Strict scope boundaries; change control; milestone-based delivery |
| Lossy audio capture degrading transcription quality | Reduced transcription accuracy | Lossless-first audio capture policy; investigate PCM/FLAC capture; verify browser capabilities before architecture decisions |

---

## 13. Success Criteria

Version 1 is successful when:

1. A church recording (uploaded or live-captured) can be transcribed with usable accuracy.
2. The transcript can be verified using flagged-item review with audio replay.
3. The verified transcript can be transformed by the AI Editor into a report matching Information Unit style.
4. The edited report can be reviewed and corrected by a human editor.
5. The AI Proofreader can identify grammar, punctuation, clarity, and consistency issues.
6. The proofread report can be reviewed and approved by a human.
7. A final document can be generated and is ready for distribution.
8. Original audio, raw transcript, and each processing stage are preserved and accessible.
9. The end-to-end process is measurably faster than the current fully manual workflow.
10. Information Unit workers report reduced effort compared to the current process.

---

## 14. Future Vision

If V1 proves reliable:

- The system could be deployed to multiple branches to standardise Information Unit output.
- Automation toggles could be enabled for trusted stages, further reducing human workload.
- Publication design features (combining reports with photographs) could be added.
- Integration with distribution channels could be deepened.
- The system could evolve to handle multiple concurrent sessions or programmes.

These are possibilities, not commitments. Each would require its own scoping and approval.

---

## Document Control

| Field | Value |
|---|---|
| Document | PROJECT_SCOPE.md |
| Purpose | Authoritative product specification |
| Authority | Changes require project-owner approval |
| Related documents | AGENTS.md, PROJECT_PLAN.md |
