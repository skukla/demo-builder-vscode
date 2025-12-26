# Coverage Gap Remediation

## Status Tracking
- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review (skipped - test-only implementation)
- [x] Security Review (skipped - test-only implementation)
- [x] Complete

**Completion Date:** 2025-12-26

**Created:** 2025-12-26
**Last Updated:** 2025-12-26
**Audit Phase:** Post-Phase 6 Remediation

---

## Executive Summary

**Feature:** Add test coverage for identified gaps across security, data integrity, user-facing, and internal modules

**Purpose:** Raise overall statement coverage from 71.13% to 80%+ threshold; ensure critical paths have comprehensive test protection

**Approach:** TDD-style addition of tests for uncovered branches/functions, prioritizing by risk (security first, then data integrity, then UX, then internal)

**Estimated Complexity:** Medium-High (7 steps across 4 priority tiers)

**Key Risks:**
1. Async path testing may require mocking filesystem operations
2. progressUnifier tests at `tests/unit/utils/` may need migration to structure-aligned location
3. fileWatcher branch coverage depends on VS Code API mocking complexity

---

## Context Analysis

### Coverage State (Before → After)

| Module | Before | After | Tests Added | Priority |
|--------|--------|-------|-------------|----------|
| validateGitHubDownloadURL | 0% | 100% | 35 | Security |
| validatePathSafety (async) | 62% | 91.52% | 19 | Security |
| processCleanup.ts | 51% | 84.46% | 8 | Data Integrity |
| fileWatcher.ts | 31% branches | Exercised | 8 | Data Integrity |
| progressUnifier/ | Unknown | 87.23% | 25 (migrated) | User-Facing |
| Logging infrastructure | 0% | 94.18% | 122 | User-Facing |
| State utilities | 0% | ~98% | 41 | Internal |
| **Total** | **71.13%** | **TBD** | **258** | |

### Existing Test Patterns to Reuse

- `tests/core/validation/securityValidation-*.test.ts` - Security test patterns
- `tests/core/shell/processCleanup*.test.ts` - Shell/process mocking patterns
- `tests/unit/utils/progressUnifier-*.test.ts` - Progress tracking patterns (may need migration)

---

## Test Strategy

- **Framework:** Jest with @swc/jest
- **Coverage Goals:** 80%+ statements and branches for all targeted modules
- **Test Distribution:** Unit tests only (no integration/E2E needed for coverage gaps)

Note: Detailed test scenarios are in each step file (step-01.md through step-07.md)

---

## Implementation Constraints

- **File Size:** <300 lines per test file (split by concern)
- **Complexity:** <50 lines per test function
- **Dependencies:** Reuse existing mock patterns from testUtils files
- **Platform:** Node.js 18+ with TypeScript strict mode
- **Performance:** Tests should complete in <5s per file

---

## Acceptance Criteria

### Definition of Done
- [ ] All new tests pass (`npm run test:fast`)
- [ ] Coverage reaches 80%+ for each targeted module
- [ ] No regressions in existing 5761 tests
- [ ] Tests follow established patterns from similar test files
- [ ] No console.log or debug statements in test code

---

## Risk Assessment

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|------------|--------|------------|
| fileWatcher VS Code API mocking complexity | Technical | Medium | Medium | Use existing VS Code test patterns from codebase |
| progressUnifier test migration breaks existing tests | Technical | Low | High | Run full test suite after each step |
| Async path testing flakiness | Technical | Medium | Low | Use deterministic mocks, avoid timers |

---

## Dependencies

### Existing Test Infrastructure
- Jest configuration with @swc/jest transformer
- VS Code extension test harness
- Existing testUtils files (debugLogger.testUtils.ts, etc.)

### New Test Files (Summary)
- Step 1-2: Security validation tests in `tests/core/validation/`
- Step 3-4: Shell tests in `tests/core/shell/`
- Step 5: Progress tests in `tests/core/utils/progressUnifier/`
- Step 6: Logging tests in `tests/core/logging/`
- Step 7: State tests in `tests/core/state/`

---

## File Reference Map

### Source Files (Being Tested)

**Security:**
- `src/core/validation/URLValidator.ts`
- `src/core/validation/PathSafetyValidator.ts`

**Data Integrity:**
- `src/core/shell/processCleanup.ts`
- `src/core/shell/fileWatcher.ts`

**User-Facing:**
- `src/core/utils/progressUnifier/*.ts`
- `src/core/logging/errorLogger.ts`
- `src/core/logging/logger.ts`
- `src/core/logging/stepLogger.ts`

**Internal:**
- `src/core/state/sessionUIState.ts`
- `src/core/state/projectStateSync.ts`

---

## Step Summary

| Step | Focus | Files | Priority |
|------|-------|-------|----------|
| 1 | validateGitHubDownloadURL | URLValidator.ts | Security |
| 2 | validatePathSafety async paths | PathSafetyValidator.ts | Security |
| 3 | processCleanup coverage | processCleanup.ts | Data Integrity |
| 4 | fileWatcher branch coverage | fileWatcher.ts | Data Integrity |
| 5 | progressUnifier verification | progressUnifier/*.ts | User-Facing |
| 6 | Logging infrastructure | errorLogger, logger, stepLogger | User-Facing |
| 7 | State utilities | sessionUIState, projectStateSync | Internal |

---

_Plan created by Master Feature Planner_
_Status: Ready for TDD Implementation_
