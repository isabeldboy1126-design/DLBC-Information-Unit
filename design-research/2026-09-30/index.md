# DLBC Information Unit interface reference research

**Collected:** 2026-09-30
**Purpose:** Compare visual evidence for a tool that records sermons, checks transcripts against audio, edits reports, and supports human approval.
**Decision status:** Reference research only. The sources inform two contrasting directions; neither direction is selected, and no redesign is approved.

## Research questions

- Can session history and a review queue stay useful without turning the home screen into oversized dashboard cards? Where might capture and upload sit?
- What makes active recording status, elapsed time, input signal, and pause/finish actions easy to trust?
- How can reviewers move between audio and time-stamped speaker text, notice flagged phrases, correct them, and track review progress?
- How can a long report remain comfortable to read and edit while retaining source context, revisions, and approval state?
- Which visual rules could unify the work without importing unrelated podcast production or AI features?

## Source ledger

Screenshots are local captures of what was visible in a browser, including nested concept mockups. Links go to the visible Dribbble shots or Pinterest pins. A screenshot of a design concept does not establish that the pictured product exists or behaves as shown.

| ID | Source and provenance | Job / local evidence | Limits |
|---|---|---|---|
| D1 / P1 | [Transcript Editor (WIP), richard.ux — Dribbble](https://dribbble.com/shots/6854685-Transcript-Editor-WIP); [Pinterest pin](https://www.pinterest.com/pin/270004940150735849/) also links to this same Dribbble shot. | Transcript verification and notes. **dribbble-transcript-editor-wip.jpg**; **pinterest-transcript-editor.jpg**; **pinterest-transcript-editor-detail.jpg**. | One design, not two independent references. Static WIP presentation; audio synchronization, keyboard correction, responsive layout, and actual save behavior are unknown. |
| D2 | [Happyscribe — Editor Exploration, André Givenchy — Dribbble](https://dribbble.com/shots/18279598-Happyscribe-Editor-Expl). | Long transcript with source context. **dribbble-happyscribe-editor.jpg**; search context: **dribbble-transcription-search.jpg**. | The shot description calls this a redesign exploration. Text describes proposed tool placement; it does not prove working behavior. Interface is small inside a tablet mockup. |
| D3 | [Sonet — AI Podcast Editor, Panggih for Callour Studio — Dribbble](https://dribbble.com/shots/27215810-Sonet-AI-Podcast-Editor). | Technical playback and editing contrast. **dribbble-sonet-editor-overview.jpg**; **dribbble-sonet-timeline-detail.jpg**. | The page describes a Figma concept for podcast production. It shows editing/playback, not verified live recording. Multi-track DAW lanes, AI overdub/removal, and collaboration comments are outside known DLBC needs. |
| D4 | [Minimal Productivity Dashboard with Audio Recording, Smart Notes, Diana Larussa — Dribbble](https://dribbble.com/shots/27105938-Minimal-Productivity-Dashboard-with-Audio-Recording-Smart-Notes). | Calm active-recording state. **dribbble-minimal-recording-state.jpg**. | Static concept for voice notes. It visibly shows a waveform, 1:12, pause, and finish/save controls, but no input meter, device selector, microphone permission, upload, or failure state. Text labels are Polish. |
| D5 | [Audio to text — transcription \| AI for Newsrooms, Michał Samojlik — Dribbble](https://dribbble.com/shots/22591046-Audio-to-text-transcription-AI-for-Newsrooms). | Editorial document hierarchy and a recording import frame. **dribbble-newsroom-editor.jpg**; **dribbble-newsroom-import-frame.jpg**. | The description claims speaker detection and highlighted moments, but those behaviors are not independently demonstrated. The hosted concept video changes frames while playing; its trigger and app state are ambiguous. The example is an article editor, not a sermon report. |
| P2 | [AI-Powered Meeting Transcription — Recording Details, Pickolab Studio — Pinterest](https://www.pinterest.com/pin/27443878975733432/); [original Dribbble shot](https://dribbble.com/shots/25829429-AI-Powered-Meeting-Transcription-Recording-Details). | Recording-detail hierarchy. **pinterest-recording-details.jpg**; **pinterest-recording-details-large.jpg**. | Meeting software concept. The visible playback bar and Summary/Transcript/Calendar/Attachments tabs inform detail organization; an AI chat panel and meeting-specific sections are not established DLBC requirements. This is playback detail, not active capture. |
| P3 | [HQ documentation for modern organizations — Editor, Maciek Balasinski (magic) — Pinterest](https://www.pinterest.com/pin/80220437105704772/); [original Dribbble shot](https://dribbble.com/shots/9513583-HQ-documentation-for-modern-organizations-Editor). | Long-form composition. **pinterest-document-editor.jpg**; **pinterest-document-editor-detail.jpg**. | The pin credits the author and links to the shot. The captured source is cropped and mostly shows a document, compact toolbar, and table of contents; whole-screen hierarchy is weak. |
| P4 | [Team creation and editing of documents, Vlad Musienko — Pinterest](https://www.pinterest.com/pin/314829830215732306/); [original Dribbble shot](https://dribbble.com/shots/21535637-Team-creation-and-editing-of-documents). | Report review composition. **pinterest-review-editor.jpg**; **pinterest-review-editor-detail.jpg**. | The visible page thumbnails, centered document, comments column, and compact toolbar are useful layout evidence. Avatars and live multi-user collaboration are not known DLBC requirements. |

The Pinterest search captures (**pinterest-transcript-search.jpg**, **pinterest-recording-search.jpg**, **pinterest-document-search.jpg**) are discovery context, not additional product designs. The recording search surfaced listener dashboards, which were set aside because listening and discovery do not answer the sermon capture and review jobs. D1/P1 is counted once in cross-reference patterns.

## Comparison by work context

### Capture and session orientation

D4 is the clearest calm active-recording composition: a soft neutral workspace keeps a note readable, places a waveform beneath it, shows a timer, and offers two prominent pause/finish actions. This supports a focused recording state, while leaving microphone readiness and upload workflow unproven. It is a voice-note concept rather than an operational DLBC console.

D3 supplies a contrasting technical treatment for playback: elapsed/total time, playback speed, volume, transport controls, a time ruler, and colored tracks sit below the transcript. This is a podcast-editing surface, not evidence for live recording. A small transport and time ruler could be useful if they help sermon reviewers navigate; its multi-track density, audio-production labels, and AI editing actions should remain deferred.

P2 organizes a recording detail around source title/metadata, playback, content tabs, and a side panel. It can inform where source context lives after capture. Its AI-chat panel and meeting metadata add visual weight without known value here.

No inspected reference provides reliable session-history evidence with realistic long sermon titles, draft/review states, primary capture and upload actions, or a compact review queue. Home-screen density remains an open question.

### Transcript verification

D1/P1 is the strongest direct visual reference for the review task. The captured screen places an audio strip above speaker-labeled paragraphs, highlights selected text, and keeps All/Notes/Highlights in a right panel. A contextual toolbar is visible over selected text. These are observed visual details; the screenshot does not prove timecode synchronization, correction navigation, keyboard support, or transcript-save behavior.

D2 pairs a long central transcript with a narrow source/video area and a bottom playback strip. Its description says it explored moving frequently used document controls and find/replace into reachable places; that is reported design intent, not tested interaction. The nested tablet makes small labels hard to inspect, but the long text area is useful for thinking about realistic paragraph density.

D3 demonstrates transcript segments, audio-file labels, comments, playback controls, and a time ruler in one dense workspace. It is a technical alternative for source navigation; its podcast production assumptions should not define sermon verification.

### Report composition and approval

P4 has the most legible review layout among the document references: page thumbnails at left, a centered document, comments at right, and a compact formatting bar. This could help keep comments and report text in context. It does not establish revision history or an approval lifecycle.

P3 reinforces a compact table of contents and restrained toolbar, but the screenshot crop prevents a reliable whole-screen judgment. D5 shows a readable page, a Draft label, a Publish action, and an editor toolbar; because it is an article-editor concept, those labels do not prove DLBC approval semantics. D2 also shows a long transcript, but not a final report revision history.

Across this corpus, there is no clear visual precedent for preserving original machine text beside human corrections, showing accepted changes, exposing revision history, or marking a human approval decision. Those are product requirements to design from DLBC workflow evidence, not copy from these shots.

## Patterns, contrasts, and evidence strength

| Pattern | Best evidence | Possible value | Cost or risk |
|---|---|---|---|
| Readable central text with nearby source playback | D1/P1, D2, D3 | Helps a reviewer verify a phrase without losing the document context. | Dense three-column layouts can squeeze long paragraphs; responsive behavior is unknown. |
| Speaker or segment context beside transcript text | D1/P1, D3; D5 description is reported | May help reviewers find a correction in the recording. | Exact time synchronization is not demonstrated by a static shot. |
| Lightweight notes/comments alongside the document | D1/P1, P4, D3 | Gives review context a place without burying the report. | Live collaboration UI may imply roles and workflows the product does not have. |
| A distinctive active-recording state | D4 | A clear timer and pause/finish actions can make capture status obvious. | No real input meter, mic/device status, permission, or recovery states are shown. |
| Audio timeline and color-coded tracks | D3 | Can support time navigation if reviewers need precise playback jumps. | Easy to overbuild into a DAW and distract from human transcript/report review. |

The corpus includes a light editorial approach (D1, D2, P4) and a dark technical control-room alternative (D3), with a soft recording-state example (D4). This reduces single-direction selection bias, but most evidence remains polished design concepts, not live-product observation. Search results also included unrelated landing pages, audio community/listener screens, and production dashboards; they were excluded from the useful set.

## Two coherent directions to discuss

**Calm editorial studio.** Use a light, quiet reading surface, clear type hierarchy, and a restrained accent for focus, corrections, and approval state. Keep one central document with audio/time context directly attached; offer comments, notes, or revision history in a narrow side area that can yield space on smaller screens. A compact session list can prioritize ongoing work, review status, and recent reports while giving record/upload clear placement. D1/P1, D2, P4, and the focused reading area in D4 support parts of this direction. The source set does not determine the DLBC color system or exact home-screen structure.

**Technical recording room.** Give active capture its own deliberate workspace with unmistakable microphone/input state, readable elapsed time, input-level feedback, and explicit record/pause/stop controls. Keep the waveform or time ruler subordinate to the transcript and make the next step into verification obvious. D3 informs transport/time navigation and D4 shows a focused timer plus pause/finish controls. The dark surface could clarify a live state, but the corpus does not prove low-light use or that dark mode suits DLBC. A full multitrack timeline, AI editing actions, persistent chat, and production mixing should stay out unless the actual workflow requires them.

These are discussion territories, not a decision. Shared workflow evidence should drive any later visual choice.

## Evidence limits and next observation

- Dribbble shots are mockups or design presentations. Their descriptions can be recorded as designer claims, but do not verify working application behavior. The newsroom source includes a hosted video; frames change during playback, but no user-triggered interaction was demonstrated.
- Pinterest items are pin captures linked to Dribbble originals. P1 and D1 are the same design and should not be counted as independent evidence.
- No source establishes a desktop live-recording flow with microphone permission/device selection, input meter, upload validation or recovery, nor a complete session queue with realistic sermon titles.
- No reference proves original-machine-text preservation, correction/rejection states, revision history, final approval, keyboard behavior, screen-reader behavior, reduced motion, or a responsive mobile equivalent. Mobile-only concepts do not establish a desktop product's mobile adaptation.
- Long transcript paragraphs appear, especially in D1 and D2, but the nested mockups are too small to evaluate comfortable body type or long-title wrapping reliably. Those should be checked against real DLBC content.

**Recommended next observation:** Walk through one real or representative session from capture/upload to transcript correction and report approval. Record the actual mic/input states, source timecode, flags, title lengths, original-vs-corrected text rule, revision events, and approver decision. That evidence will answer the main gaps before anyone chooses a visual territory or commits to a screen architecture.
