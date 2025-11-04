# Implementation Plan: Fix Remaining Test Failures

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2025-10-31
**Last Updated:** 2025-10-31
**Steps:** 7 total steps

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

**Note**: Efficiency review will optimize test code patterns. Security review disabled as changes are test-only.

---

## Executive Summary

**Feature:** Fix remaining 58 test suite failures to achieve 100% passing test suite (95/95 suites, all 1141 tests passing)

**Purpose:** Restore full test coverage after architectural refactor (path aliases, directory restructuring). Currently 37/95 suites passing due to configuration and mock interface mismatches.

**Approach:** Sequential category-based fixing: jest-dom configuration → file path updates → logger mock alignment → type/export fixes → auth mock updates → test logic corrections. Each category verified with targeted tests before proceeding.

**Estimated Complexity:** Medium

**Estimated Timeline:** 2-3 hours

**Key Risks:** Breaking currently passing tests during fixes, jest-dom configuration impacting multiple test files, mock interface mismatches requiring coordinated updates

---

## Test Strategy

- **Framework:** Jest 29.x with ts-jest, React Testing Library 16.x
- **Goal:** 100% suite passing (95/95 suites, 1141/1141 tests)
- **Approach:** Fix existing tests (not writing new ones) - restore post-refactor functionality

**Verification points:**
- Step 1: ~20 component tests pass (jest-dom)
- Step 2: ~8 backend tests pass (file paths)
- Step 3: ~3 logger tests pass (mock interfaces)
- Step 4: ~3 type tests pass (exports)
- Step 5: ~10 auth tests pass (mock updates)
- Step 6: ~15 tests pass (test logic/timing)
- Step 7: Full suite verification (95/95)

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 95 test suites passing (1141 individual tests)
- [ ] **Testing:** Zero skipped tests, zero failing tests
- [ ] **Coverage:** No reduction in coverage metrics from pre-refactor baseline
- [ ] **Code Quality:** No act() warnings, no console errors during test runs
- [ ] **TypeScript:** Compilation clean (zero errors, existing in clean state)
- [ ] **Test Execution:** `npm test` runs without failures
- [ ] **Performance:** Test execution time within ±10% of baseline

**Feature-Specific Criteria:**

- [ ] jest-dom matchers (toBeInTheDocument, toHaveClass, etc.) work in all component tests
- [ ] Logger mocks match current LoggingService/StepLogger interfaces
- [ ] Auth mocks align with refactored authentication utilities
- [ ] All import paths use path aliases correctly (@shared/*, @features/*, @utils/*)
- [ ] No mock method signature mismatches

---

## Risk Assessment

### Risk 1: Breaking Currently Passing Tests

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Fixes to one category (e.g., jest-dom setup) may inadvertently break currently passing tests in other categories
- **Mitigation:**
  1. Run full test suite after each category completion
  2. Use git commits after each successful category fix
  3. If regression detected, immediately revert and investigate
- **Contingency Plan:** Revert to last known good state, fix in isolation with targeted test runs

### Risk 2: jest-dom Configuration Issues

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** High
- **Priority:** Critical
- **Description:** jest-dom setup affects ~20 tests. Configuration issues (import location, tsconfig compatibility, React Testing Library version mismatch) could block multiple test files
- **Mitigation:**
  1. Investigate jest-dom import mechanism first (Step 1 priority)
  2. Check setupFilesAfterEnv configuration in jest.config.js
  3. Verify @testing-library/jest-dom version compatibility with React Testing Library 16.x
- **Contingency Plan:** If global setup fails, use per-file imports as temporary workaround

### Risk 3: Mock Interface Drift

- **Category:** Technical
- **Likelihood:** High
- **Impact:** Medium
- **Priority:** High
- **Description:** Logger, auth, and state mocks may have fallen out of sync with refactored interfaces. Multiple test files depend on these mocks, creating coordinated update requirement
- **Mitigation:**
  1. Update mock definitions in central test utilities first
  2. Verify mock signatures match actual interfaces (use TypeScript checking)
  3. Run dependent tests after each mock update
- **Contingency Plan:** Create backward-compatible mock adapters if immediate interface alignment not feasible

### Risk 4: Test Timeout During Full Suite Runs

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Medium
- **Priority:** Medium
- **Description:** Running full 95-suite test suite after each category may timeout or consume excessive CI resources
- **Mitigation:**
  1. Use targeted test runs during category work (jest --testPathPattern)
  2. Run full suite only after category completion
  3. Monitor test execution time, optimize slow tests if needed
- **Contingency Plan:** Split test execution into parallel jobs if timeouts occur

---

## Dependencies

### New Packages to Install

None - all required packages already installed:
- jest@29.x
- ts-jest
- @testing-library/react@16.x
- @testing-library/jest-dom
- @testing-library/user-event

### Configuration Changes

None - existing jest.config.js and tsconfig.json already configured for dual-mode testing (Node backend + React webview)

---

## File Reference Map

### Existing Files (To Modify)

**Test Setup Files:**
- `tests/setup/react.ts` - jest-dom import configuration (Step 1)
- `jest.config.js` - Verify setupFilesAfterEnv configuration (Step 1)

**Test Utility Files:**
- `tests/utils/mocks/logger.ts` - Update logger mock interfaces (Step 3)
- `tests/utils/mocks/auth.ts` - Update auth mock interfaces (Step 5)
- `tests/utils/mocks/state.ts` - Update state manager mocks (Step 5)

**Component Test Files (~20 files):**
- `src/webviews/**/*.test.tsx` - jest-dom matcher usage (Step 1)

**Backend Test Files (~8 files):**
- `tests/unit/utils/progressUnifierHelpers.test.ts` - Old src/utils/* import paths (Step 2)
- `tests/commands/**/*.test.ts` - Old src/utils/* import paths (Step 2)
- `tests/utils/**/*.test.ts` - Old src/utils/* import paths (Step 2)

**Logger-Dependent Tests (~3 files):**
- Tests importing logger mocks (Step 3)

**Type-Dependent Tests (~3 files):**
- Tests importing renamed types/exports (Step 4)

**Auth-Dependent Tests (~10 files):**
- Tests importing auth utilities/mocks (Step 5)

**Test Logic Files (~15 files):**
- Various test files with assertion issues, act() warnings, or logic problems (Step 6)

### New Files (To Create)

None - all fixes to existing test files

**Total Files:** ~56 test files to modify, 0 created

---

## Coordination Notes

**Step Dependencies:**

- Step 1 (jest-dom): Blocks React component test fixes (affects ~20 tests in Step 6)
- Step 2 (file paths): Independent of Step 1, blocks all tests with path errors (~8 files)
- Step 3 (logger mocks): Depends on Step 2 (tests must locate files first)
- Step 4 (type/export): Independent, can run after Steps 1-3 complete
- Step 5 (auth mocks): Depends on Step 3 (logger mocks) - auth code uses logger, mocks must align
- Step 6 (test logic): Depends on Steps 1-5 - can't fix assertions until imports/mocks/types correct
- Step 7 (verification): Depends on all previous steps - final validation after all categories fixed

**Integration Points:**
- jest-dom (Step 1) → React component tests
- Logger mocks (Step 3) → auth mocks (Step 5)
- File paths (Step 2) → all test imports

**Execution Strategy:**
- Run targeted tests after each step
- Run full suite after each category
- Git commit after successful verification

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan, confirm priority order (jest-dom first)
2. **For Developer:** Execute with `/rptc:tdd "@fix-remaining-test-failures/"`
3. **Quality Gates:** Efficiency Agent after Step 7 complete (Security Agent disabled)
4. **Completion:** Verify all 95 suites passing via `npm test`

**First Step:** Run `/rptc:tdd "@fix-remaining-test-failures/"` to begin Step 1 (jest-dom setup investigation and fix)

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md, step-02.md, step-03.md, step-04.md, step-05.md, step-06.md, step-07.md_
