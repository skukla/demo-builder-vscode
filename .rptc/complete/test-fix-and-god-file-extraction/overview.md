# Test Fix and God File Extraction Plan

## Status Tracking

- [x] Planned
- [x] In Progress
- [x] Reviews Complete
- [x] Complete

**Completed:** 2025-12-26 (verified - issues already resolved)

## Executive Summary

| Aspect | Details |
|--------|---------|
| **Feature** | Fix 61 failing tests and extract edsHandlers.ts to <800 lines |
| **Purpose** | Complete SOP remediation work - tests passing and god file resolved |
| **Approach** | Add missing test mocks, extract handlers by domain |
| **Complexity** | Simple (2 steps) |
| **Key Risks** | Mock changes could affect test behavior |

## Test Strategy

- **Framework**: Jest with ts-jest (node) and @testing-library/react (react)
- **Coverage Goals**: All 61 failing tests passing (5,670/5,670)
- **Test Scenarios**: See individual step files

## Acceptance Criteria

- [x] All 5,994 tests passing (5991 pass, 3 skipped)
- [x] edsHandlers.ts is 137 lines (well under 800)
- [x] No regression in existing functionality
- [x] Handler registry still works correctly

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mock changes break tests | Low | Medium | Verify each test passes individually |
| Handler extraction breaks DI | Low | High | Verify registry registration after extraction |

## Dependencies

- **None** - All work is internal refactoring

## File Reference Map

### Files to Modify

| File | Change |
|------|--------|
| `tests/features/project-creation/ui/wizard/WizardContainer.mocks.tsx` | Add brandStackLoader mock |
| `src/features/eds/handlers/edsHandlers.ts` | Extract handlers |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/features/eds/handlers/edsGitHubHandlers.ts` | GitHub-related handlers |
| `src/features/eds/handlers/edsDaLiveHandlers.ts` | DA.live-related handlers |
| `tests/features/eds/handlers/edsGitHubHandlers.test.ts` | GitHub handlers tests |
| `tests/features/eds/handlers/edsDaLiveHandlers.test.ts` | DA.live handlers tests |

## Coordination Notes

- Step 1 must complete first (test failures block verification of Step 2)
- Step 2 extractions must maintain backward compatibility via re-exports

## Next Actions

1. Start with Step 1: Fix WizardContainer test mocks
2. After tests pass, proceed to Step 2: Extract handlers

---

_Generated for SOP Violation Remediation Phase 2_
