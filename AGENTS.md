# AGENTS.md — Operating Rules for AI Coding Agents

**Project:** DLBC Information Unit App
**Last Updated:** 2026-08-16

This document defines the permanent operating rules for any AI coding agent working in this repository. These rules apply at all times and must not be overridden without explicit project-owner approval.

---

## 1. Project Awareness

1. **Read first.** Before significant planning or implementation, read `PROJECT_SCOPE.md` and `PROJECT_PLAN.md`.
2. **Treat `PROJECT_SCOPE.md` as the authoritative product specification.** If a requirement is not in scope, do not build it.
3. **Treat `PROJECT_PLAN.md` as the delivery roadmap.** Follow the milestone sequence. Do not skip ahead.

---

## 2. Scope Discipline

4. **Do not expand scope without explicit approval.** If a feature sounds useful but is not in `PROJECT_SCOPE.md`, do not add it.
5. **Do not attempt to build the entire application in one shot.** Work milestone by milestone.
6. **Before implementing a milestone:**
   - Understand the requirement.
   - Inspect existing code.
   - Identify dependencies.
   - Identify risks.
   - Propose a concise implementation plan.
7. **Prioritise functional correctness before visual polish.** A feature that works correctly but looks plain is more valuable than a beautiful feature that is broken.

---

## 3. Security

8. **Never expose API keys or secrets in frontend code.** All external AI services must be accessed through the backend.
9. **Store secrets in environment variables or secure configuration files excluded from version control.** Never hard-code secrets in source files.

---

## 4. Data Integrity and Traceability

10. **Preserve original audio.** Source audio must be saved before any processing begins and must never be deleted or overwritten by the application.
11. **Never overwrite the raw transcript.** The raw transcript is an immutable record of what the transcription service produced.
12. **Preserve each major processing stage separately:**
    - Original Audio
    - Raw Transcript
    - Verified Transcript
    - Edited Report
    - Proofread Report
    - Final Approved Report
13. **Keep the Editor and Proofreader logically separate.** They are distinct stages with distinct responsibilities. Do not merge them into a single pass.

---

## 5. Architecture Discipline

14. **Do not introduce Firebase, Supabase, Flutter, Android, Node.js backend, cloud databases, or other major architectural changes simply because those tools are available.** The technical direction is defined in `PROJECT_SCOPE.md`.
15. **Major architectural changes require justification and approval.** If you believe a different technology is genuinely superior for a specific requirement, present the case — do not silently adopt it.
16. **Prefer the simplest architecture capable of satisfying the current requirement.** Do not over-engineer for hypothetical future needs unless `PROJECT_SCOPE.md` explicitly calls for it.
17. **Build provider abstractions where external AI dependencies are likely to change.** Use service layers (e.g., `TranscriptionProvider`, `EditorService`, `ProofreaderService`, `DocumentService`) so providers can be swapped without rewriting the application.

---

## 6. Quality and Verification

18. **Test each milestone before declaring it complete.** "Done" means the required behaviour can be demonstrated or tested — not merely that code was written.
19. **Do not claim something works merely because code was written.** Verify by running, testing, or demonstrating.
20. **Verify important functionality by actually running/testing it where possible.** If a test cannot be run (e.g., requires church equipment), note the limitation explicitly.
21. **Maintain useful error handling and logs.** Silent failures are unacceptable — especially for audio capture, transcription, and AI processing.

---

## 7. Development Discipline

22. **Do not remove working functionality while implementing unrelated features.** If a change risks breaking existing behaviour, note the risk and take precautions.
23. **Make changes incrementally so problems can be isolated.** Small, testable steps are preferable to large, tangled changes.
24. **Maintain clean version-control checkpoints.** Each milestone or significant sub-task should be a distinct, committable unit of work.

### AI Quota and Resource Efficiency

AI/model quota is limited and must be treated as a finite project resource. Agents must use available quota deliberately and efficiently so that the project can reach a complete working V1 within the available usage limits.

Follow these rules:

1. Avoid unnecessary full-project re-analysis when the relevant context is already documented.
2. Read only the files and sections necessary for the current task whenever possible.
3. Do not repeatedly rewrite unchanged files.
4. Avoid excessive documentation that does not directly help implementation, testing, architecture, or future maintenance.
5. Do not implement speculative features outside the current milestone.
6. Prefer small, targeted, testable changes over large unnecessary rewrites.
7. Reuse existing project context, decisions, architecture, and code rather than rediscovering them.
8. Do not repeatedly ask for approval on trivial implementation details already resolved by `PROJECT_SCOPE.md`, `PROJECT_PLAN.md`, or `AGENTS.md`.
9. Use deeper or more expensive reasoning only for high-impact architecture decisions, security issues, difficult debugging, or problems where simpler reasoning has failed.
10. Routine implementation, small fixes, straightforward tests, and repetitive development work should use the least expensive capable model available.
11. Do not perform redundant tests merely to consume another verification cycle. Test sufficiently to prove the acceptance criteria.
12. Before beginning a task, identify the smallest useful unit of work that can be implemented and verified efficiently.
13. Do not sacrifice correctness, security, data integrity, or required testing merely to save quota.

> **Use AI quota to finish the product, not to repeatedly rethink already-settled decisions.**

---

## 8. Communication

25. **If a requirement is ambiguous and making the wrong assumption could substantially affect architecture, ask before implementing.** Do not guess on decisions that are expensive to reverse.
26. **When a technical assumption becomes invalid, report it rather than quietly working around it.** For example, if a chosen API does not support a required feature, say so immediately rather than building a fragile workaround.

---

## 9. Documentation

27. **Keep `PROJECT_PLAN.md` updated as milestones are completed.** Record actual completion status, not just planned status.
28. **When a milestone reveals new risks, constraints, or scope clarifications, update the relevant documents** (`PROJECT_SCOPE.md` for scope, `PROJECT_PLAN.md` for plan and risks).
29. **Do not create excessive documentation files.** Update existing project documents rather than spawning new ones unless a genuinely new category of documentation is needed.

---

## 10. Product-Specific Rules

30. **The "Automatically Continue to Proofreading" setting must default to OFF.** The human must explicitly review the edited report before proofreading runs, unless the setting has been deliberately enabled.
31. **Timestamps must be retained in transcripts where technically practical.** These are essential for the verification workflow (linking flagged items to audio replay).
32. **Session integrity is paramount.** A failure at any processing stage must not silently destroy the session or any previously completed stage within it.
33. **Knowledge management must be user-facing.** Updating Editor and Proofreader knowledge must not require modifying source code.
34. **Preserve audio quality (lossless-first).** The transcription pipeline should preserve audio quality and avoid introducing lossy compression before transcription whenever technically practical. For uploaded files that are already lossy (e.g., MP3), preserve the original file unchanged — do not claim that converting to a lossless format restores lost quality.
35. **UI Strategy and Google Stitch Integration.** Google Stitch is being used separately to design the final UI/UX. During functional development phases (Phases 1–8), build clean, usable, logically structured functional UI without over-engineering styling or consuming excessive quota on visual polish. Keep React components modular and decouple state, API communication, and workflow behavior from styling so that functional behavior survives the later Stitch UI integration without requiring backend or core frontend rewrites.

---

## Document Control

| Field | Value |
|---|---|
| Document | AGENTS.md |
| Purpose | Permanent operating rules for AI coding agents |
| Authority | Changes require project-owner approval |
| Related documents | PROJECT_SCOPE.md, PROJECT_PLAN.md |
