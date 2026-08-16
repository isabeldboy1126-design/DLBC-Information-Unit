"""
Service layer package for the DLBC Information Unit App.

Contains provider abstractions for external AI services.
Each service defines an interface that can be implemented
by different providers, allowing provider swaps without
rewriting the application.

Services to be implemented in later phases:
- TranscriptionProvider (Phase 2)
- EditorService (Phase 6)
- ProofreaderService (Phase 7)
- DocumentService (Phase 8)
"""
