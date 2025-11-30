# Implementation Plan: Fix Test Failures from Authentication Refactoring

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase)
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-10-31
**Last Updated:** 2025-10-31
**Steps:** 1 step (consolidated category-by-category approach)

---

## Configuration

### Quality Gates

**Efficiency Review**: enabled
**Security Review**: disabled

**Note**: Security review disabled since this is pure test file migration work with no functional changes.

---

## Executive Summary

**Feature:** Fix all 71 failing test suites after authentication and webview refactoring

**Purpose:** Unblock consolidation commit by resolving test import paths and type mismatches caused by file moves (src/utils/auth/* → src/features/authentication/services/* and src/webviews/hooks/* → webview-ui/src/shared/hooks/*)

**Approach:** Hybrid automated/manual strategy with category-by-category verification. Script updates for obvious import path changes, manual fixes for complex type mismatches and cross-module dependencies. Run specific test suites after each category to catch cascading issues early.

**Estimated Complexity:** Medium

**Estimated Timeline:** 1-2 hours

**Key Risks:**
- Breaking currently working tests during batch fixes (mitigate with category-by-category verification)
- Cascading type mismatches requiring iterative fixes (mitigate with TypeScript compiler feedback)
- Missing complex migration patterns in automated script (mitigate with manual review of failures)

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with React Testing Library for webview tests
- **Coverage Goal:** 100% test suite passing (95/95 suites, up from 24/95)
- **Test Distribution:** Pure test file migration work - no new tests written, all existing tests must pass

### Test Scenarios Summary

**Happy Path:** All 71 failing test suites pass after import path and type updates

**Edge Cases:** Tests with cross-module dependencies, tests using re-exported types, tests with complex mock setups requiring updated paths

**Error Conditions:** TypeScript compilation errors from missing types, runtime errors from incorrect import paths, Jest module resolution failures

**Detailed test scenarios are in step-01.md**

### Coverage Goals

**Overall Target:** 100% test suite passing (95/95)

**Category Breakdown (estimates - actual total is 71 from test output):**

- Webview hook tests (`tests/webviews/hooks/*`): Fix ~10 suites
- Webview component tests (`tests/webviews/components/*`): Fix ~12 suites
- Authentication handler tests (`tests/features/authentication/*`): Fix ~5 suites
- Utility tests with auth imports (`tests/unit/`, `tests/integration/`, `tests/core/*`): Fix ~15 suites
- Feature UI tests (`tests/features/*/ui/*`): Fix ~10 suites
- Additional scattered test files across other directories: ~19 suites

---

## Acceptance Criteria

**Definition of Done for this feature:**

- [ ] **Functionality:** All 95 test suites passing (100% success rate)
- [ ] **Testing:** No regression in previously working 24 test suites
- [ ] **Coverage:** No change to coverage metrics (same tests, different paths)
- [ ] **Code Quality:** TypeScript compiler reports no errors
- [ ] **Documentation:** No documentation updates needed (internal test changes only)
- [ ] **Security:** No security impact (test-only changes)

**Feature-Specific Criteria:**

- [ ] All authentication test imports updated to @/features/authentication/services/*
- [ ] All webview hook test imports updated to @/webview-ui/shared/hooks/*
- [ ] All type imports resolved via path aliases (@/types, @/core/types)
- [ ] Jest runs without module resolution errors
- [ ] No skipped or disabled tests (all 95 must run)
- [ ] Git history clean with descriptive commit messages per category (enables rollback)

---

## Risk Assessment

### Risk 1: Breaking Working Tests During Batch Updates

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** High
- **Description:** Automated script may incorrectly update paths in the 24 currently passing test suites, introducing new failures
- **Mitigation:**
  1. Category-by-category approach with test runs after each category
  2. Git commit after each verified category (enables easy rollback)
  3. Manual review of script changes before applying to working tests
- **Contingency Plan:** Git revert to last passing state, switch to manual-only approach

### Risk 2: Missing Complex Migration Patterns

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Medium
- **Description:** Automated script may miss edge cases like conditional imports, dynamic requires, or re-exported types
- **Mitigation:**
  1. Manual review of all script-generated changes before committing
  2. TypeScript compiler feedback reveals missed type imports
  3. Jest error messages guide manual fixes for complex cases
- **Contingency Plan:** Manual fix for remaining failures after script completes

### Risk 3: Cascading Type Mismatch Fixes

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:** Fixing one type import may reveal additional type errors in dependent code, requiring iterative fixes
- **Mitigation:**
  1. Run TypeScript compiler after each category to catch cascades early
  2. Fix type errors in dependency order (types → mocks → tests)
  3. Leverage TypeScript quick fixes for straightforward cases
- **Contingency Plan:** Isolate problematic test files, fix individually after batch completes

---

## Dependencies

### Prerequisites

- [ ] **Git working tree clean** - Required for safe category-by-category rollback strategy
- [ ] **TypeScript compiler accessible** - `tsc --noEmit` for validation
- [ ] **Jest test runner configured** - Path aliases already set up in jest.config.js

### New Packages to Install

**None required** - using existing Jest, React Testing Library, TypeScript

### Configuration Changes

**None required** - path aliases already configured in tsconfig.json and jest.config.js

---

## File Reference Map

### Existing Files (To Modify)

**Webview Hook Test Files (~10 files):**
- `tests/webviews/hooks/*.test.ts` - Update imports from src/webviews/hooks/* → @/webview-ui/shared/hooks/*
- `tests/webview-ui/shared/hooks/*.test.ts` - Verify using correct paths already

**Webview Component Test Files (~12 files):**
- `tests/webviews/components/atoms/*.test.tsx` - Update imports → @/webview-ui/shared/components/ui/*
- `tests/webviews/components/molecules/*.test.tsx` - Update imports → @/webview-ui/shared/components/feedback/* or ui/*
- `tests/webviews/components/organisms/*.test.tsx` - Update imports → @/webview-ui/shared/components/ui/*
- `tests/webview-ui/shared/components/**/*.test.tsx` - Verify using correct paths already

**Authentication Handler Test Files (~5 files):**
- `tests/features/authentication/handlers/*.test.ts` - Update imports to @/features/authentication/handlers/* and @/features/authentication/services/*
- Files importing types from old src/utils/auth/types → @/features/authentication/services/types

**Utility Test Files with Auth Imports (~15 files):**
- `tests/unit/utils/*.test.ts` - Update any auth imports to @/features/authentication/services/*
- `tests/integration/**/*.test.ts` - Update cross-module imports to new paths
- `tests/core/**/*.test.ts` - Update if using auth or webview imports

**Feature UI Test Files (~10 files):**
- `tests/features/*/ui/**/*.test.tsx` - Update webview component imports to @/webview-ui/shared/components/*
- `tests/features/components/ui/**/*.test.tsx` - Verify path aliases correct

### New Files (To Create)

**None** - pure test file migration work

**Total Files:** ~71 test files modified (across all categories), 0 created

---

## Coordination Notes

**Step Dependencies:**

Single consolidated step with internal category checkpoints:
1. Webview hook tests (verify before proceeding)
2. Webview component tests (verify before proceeding)
3. Authentication handler tests (verify before proceeding)
4. Utility tests with auth imports (verify before proceeding)
5. Feature UI tests (verify before proceeding)
6. Full test suite run (final verification)

**Integration Points:**

- TypeScript compiler validates type import correctness
- Jest validates module resolution correctness
- Git commits after each category enable rollback if needed

---

## Next Actions

**After Plan Approval:**

1. **For PM:** Review and approve plan
2. **For Developer:** Execute with `/rptc:tdd "@fix-test-failures-from-refactoring"`
3. **Quality Gates:** Efficiency Agent review after completion (Security review disabled)
4. **Completion:** Verify all acceptance criteria met (100% test passing)

**First Step:** Run `/rptc:tdd "@fix-test-failures-from-refactoring"` to begin test migration

---

_Plan overview created by Master Feature Planner_
_Detailed steps in: step-01.md_
