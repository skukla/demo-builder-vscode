# Implementation Plan: Fix Prerequisites Exit Code Bug and Eliminate Duplication

## Status Tracking

- [x] Planned
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-01-12
**Last Updated:** 2025-01-12

---

## Executive Summary

**Feature:** Fix `checkPerNodeVersionStatus()` exit code handling and eliminate code duplication in `installHandler.ts`

**Purpose:** Fix critical bug where `CommandExecutor.execute()` result codes are incorrectly handled via try-catch instead of checking `result.code`. This bug causes false positives (treating failed commands as successful) and code duplication (logic duplicated across files instead of calling shared utility).

**Approach:**
1. Fix root cause in `shared.ts` by checking `result.code === 0`
2. Eliminate duplication in `installHandler.ts` by calling `checkPerNodeVersionStatus()`
3. Ensure all existing tests pass with enhanced coverage

**Estimated Complexity:** Simple

**Estimated Timeline:** 2-3 hours

**Key Risks:**
- Breaking existing behavior that depends on incorrect logic
- Test assertion updates needed to match corrected behavior

---

## Configuration

**Efficiency Review**: enabled
**Security Review**: enabled

---

## Research References

**Context:** Discovered during prerequisite system refactoring. Two locations in `installHandler.ts` (lines 185-204, 342-361) were already fixed. The shared utility `checkPerNodeVersionStatus()` in `shared.ts` (lines 210-247) still has the bug.

**Key Findings:**
- `CommandExecutor.execute()` NEVER throws on non-zero exit codes
- Only throws on process errors (ENOENT) or timeouts
- Existing tests use mocks that hide this bug
- Three locations had identical bug pattern

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Coverage Goal:** 90% overall (critical path function)
- **Test Distribution:** Unit (100%) - no integration needed for this fix

### Happy Path Scenarios

#### Scenario 1: Command succeeds with exit code 0

- **Test:** `checkPerNodeVersionStatus` detects installed tool when command exits 0
  - **Given:** Adobe CLI installed for Node 18 and 20, command returns exit code 0
  - **When:** `checkPerNodeVersionStatus()` called with `['18', '20']`
  - **Then:** Returns all versions with `installed: true`
  - **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

#### Scenario 2: Command fails with non-zero exit code

- **Test:** `checkPerNodeVersionStatus` detects missing tool when command exits non-zero
  - **Given:** Adobe CLI NOT installed for Node 20, command returns exit code 127
  - **When:** `checkPerNodeVersionStatus()` called with `['18', '20']`
  - **Then:** Returns Node 20 with `installed: false`, `perNodeVariantMissing: true`
  - **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

### Edge Case Scenarios

#### Edge Case 1: Mixed success and failure across versions

- **Test:** Some Node versions succeed (code 0), others fail (code != 0)
  - **Given:** Adobe CLI installed for Node 18 (code 0), not for Node 20 (code 127)
  - **When:** `checkPerNodeVersionStatus()` checks both
  - **Then:** Returns mixed status with correct `missingVariantMajors`
  - **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

#### Edge Case 2: Process error (ENOENT) still throws

- **Test:** Command not found (ENOENT) still throws as expected
  - **Given:** Command executable doesn't exist (fnm not installed)
  - **When:** `checkPerNodeVersionStatus()` executes
  - **Then:** Error propagates (existing behavior preserved)
  - **File:** `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`

---

## Implementation Steps

**Total Steps:** 5

1. Add test for non-zero exit code handling in shared utility
2. Fix exit code handling in `checkPerNodeVersionStatus()`
3. Refactor installHandler pre-check to use shared utility
4. Refactor installHandler post-check to use shared utility
5. Verify all tests pass and coverage maintained

---

## Dependencies

### No New Packages

This refactoring uses only existing dependencies:

- Jest (testing)
- TypeScript (type checking)
- Existing project utilities

### Modified Components

**Existing Files Modified:**

- `src/features/prerequisites/handlers/shared.ts` - Fix exit code handling
  - **Current Dependents:** `installHandler.ts`, `continueHandler.ts`, various tests
  - **Impact:** Low - behavior correction, no API changes
  - **Breaking Changes:** No - fixing bug, not changing interface

- `src/features/prerequisites/handlers/installHandler.ts` - Replace duplicated logic
  - **Current Dependents:** Command handlers, integration tests
  - **Impact:** Low - internal refactoring only
  - **Breaking Changes:** No - preserves all external behavior

**Test Files Modified:**

- `tests/features/prerequisites/handlers/shared-per-node-status.test.ts` - Add exit code tests
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Add spy tests

**Total Files:** 4 modified, 0 created

---

## Acceptance Criteria

**Definition of Done for this refactoring:**

- [ ] **Bug Fixed:** `checkPerNodeVersionStatus()` checks `result.code === 0` instead of try-catch
- [ ] **Duplication Eliminated:** Pre-check and post-check in `installHandler` use shared utility
- [ ] **Testing:** All tests passing (unit tests)
- [ ] **Coverage:** Coverage ≥ 90% for modified functions
- [ ] **Code Quality:** No debug code, follows style guide
- [ ] **Documentation:** Code comments updated if needed
- [ ] **Behavior Preserved:** All existing functionality works identically
- [ ] **Debug Logging:** All debug logs preserved and working
- [ ] **No Regressions:** Existing tests still pass

**Refactoring-Specific Criteria:**

- [ ] Exit code 0 → `installed: true`
- [ ] Exit code non-zero → `installed: false`
- [ ] Process errors (ENOENT) still throw as expected
- [ ] ~50 lines of duplicated code removed
- [ ] Single source of truth for per-node checking

---

## Risk Assessment

### Risk 1: Tests may expect incorrect behavior

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:** Existing tests might assert incorrect behavior (assuming try-catch works). Tests may need assertion updates to match corrected logic.
- **Mitigation:**
  1. Review all existing tests before changing implementation
  2. Update test assertions to match correct behavior
  3. Add explicit tests for exit code handling
- **Contingency Plan:** If many tests break, create compatibility shim temporarily while fixing tests incrementally
- **Owner:** TDD implementer

### Risk 2: Hidden dependencies on incorrect behavior

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Code outside prerequisite handlers might depend on current (incorrect) behavior. Unlikely but possible.
- **Mitigation:**
  1. Search codebase for all callers of `checkPerNodeVersionStatus()`
  2. Review each caller's expectations
  3. Run full integration test suite
- **Contingency Plan:** If external dependencies found, fix them in same PR to maintain atomicity
- **Owner:** TDD implementer

### Risk 3: Performance change from utility calls

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:** Replacing inline code with function calls adds minimal overhead. Negligible but measurable.
- **Mitigation:**
  1. Shared utility already parallelizes checks (no performance loss)
  2. Function call overhead is microseconds (insignificant)
  3. Existing performance optimizations preserved
- **Contingency Plan:** Profile if performance issues reported (highly unlikely)
- **Owner:** TDD implementer

---

## File Reference Map

### Existing Files (To Modify)

**Core Files:**

- `src/features/prerequisites/handlers/shared.ts` - Fix bug in `checkPerNodeVersionStatus()` function (lines 210-247)
- `src/features/prerequisites/handlers/installHandler.ts` - Replace pre-check (lines 185-204) and post-check (lines 342-361) with shared utility calls

**Test Files:**

- `tests/features/prerequisites/handlers/shared-per-node-status.test.ts` - Add 2 test cases for exit code handling
- `tests/features/prerequisites/handlers/installHandler.test.ts` - Add 2 spy tests for shared utility usage

### New Files (To Create)

None - refactoring only modifies existing files.

**Total Files:** 4 modified, 0 created

---

## Assumptions

**IMPORTANT:** Verify these assumptions before implementation:

- **Assumption 1:** `CommandExecutor.execute()` returns `CommandResult` with `code` property
  - **Source:** FROM: codebase inspection (multiple files confirm this pattern)
  - **Impact if Wrong:** Would need different approach to detect command success/failure

- **Assumption 2:** Exit code 0 means success, non-zero means failure (POSIX standard)
  - **Source:** FROM: standard practice and existing fixed code (lines 185-204, 342-361 already use this)
  - **Impact if Wrong:** Would need to define different success criteria

- **Assumption 3:** Existing tests use mocks that return `CommandResult` objects
  - **Source:** FROM: test file inspection
  - **Impact if Wrong:** Would need to update mock structure

- **Assumption 4:** No external callers of `checkPerNodeVersionStatus()` outside prerequisites feature
  - **Source:** ASSUMED based on feature isolation pattern
  - **Impact if Wrong:** May need to coordinate changes with other features

---

## Implementation Constraints

No specific constraints defined for this refactoring. Apply standard best practices:

- **KISS (Keep It Simple):** Use straightforward if-else for exit code checking
- **YAGNI (You Aren't Gonna Need It):** No additional abstractions beyond using the shared utility
- **DRY (Don't Repeat Yourself):** Primary goal - eliminate duplication
- **File Size:** All files remain well under 500 lines
- **Function Size:** All functions remain under 50 lines

---

_Plan created by Master Feature Planner_
_Status: ✅ Ready for TDD Implementation_
