# Step 2: Update Test File Paths for Moved Utilities

## Summary
Update test files referencing old `src/utils/*` locations to use correct paths after architectural refactor moved files to `src/core/` subdirectories. Fixes ~8 test files with ENOENT errors.

## Purpose
The architectural refactor moved utility files from flat `src/utils/*` structure to categorized `src/core/{utils,logging,validation,shell}/*` structure. Test files using hardcoded relative paths or jest.mock() calls now reference non-existent files, causing ENOENT errors and test failures.

## Prerequisites
- [x] Step 1 complete (jest-dom TypeScript declarations working)
- [x] TypeScript compilation clean for source files
- [x] Understanding of new src/core/* directory structure

## Tests to Write First (TDD - RED Phase)

### Test Scenario 1: Verify Files Exist at New Locations
- [x] **Test Description:** Confirm test files can locate moved utility files at new paths
- [x] **Test Files:** All 8 affected test files
- [x] **Verification Method:** Run tests and confirm no ENOENT errors
- [x] **Expected:** Tests find files, may still fail on assertions but no path errors

### Test Scenario 2: Verify jest.mock() Paths Resolve
- [x] **Test Description:** Ensure jest.mock() calls reference correct paths for mocking
- [x] **Test Files:** Files using jest.mock() (lifecycleHandlers, resourceLocker, pollingService, retryStrategyManager, tokenManager, organizationValidator)
- [x] **Expected:** Mock system successfully mocks modules without "Cannot find module" errors

### Test Scenario 3: Verify Tests Execute Successfully
- [x] **Test Description:** After path updates, affected tests should execute (pass or fail on logic, not paths)
- [x] **Test Files:** All 8 affected test files
- [x] **Expected:** Tests run to completion, no path-related errors in output

## Files to Create/Modify

### Modified Test Files (8 files)

#### File: tests/unit/utils/progressUnifierHelpers.test.ts
**Issue:** 9 instances of `'../../../src/utils/progressUnifier.ts'` (lines 14, 26, 36, 47, 58, 69, 78, 88, 97)
**Fix:** Update to `'../../../src/core/utils/progressUnifier.ts'`
**Impact:** All helper function tests currently fail with ENOENT

#### File: tests/commands/handlers/lifecycleHandlers.test.ts
**Issue:** `jest.mock('../../../src/utils/securityValidation')` (line 53)
**Fix:** Update to `jest.mock('../../../src/core/validation/securityValidation')`
**Impact:** Mock not applying, causing test failures

#### File: tests/utils/commands/resourceLocker.test.ts
**Issue:** `jest.mock('../../../src/utils/debugLogger')` (line 3)
**Fix:** Update to `jest.mock('../../../src/core/logging/debugLogger')`
**Impact:** Mock not applying, logger calls may fail

#### File: tests/utils/commands/pollingService.test.ts
**Issue:** `jest.mock('../../../src/utils/debugLogger')` (line 3)
**Fix:** Update to `jest.mock('../../../src/core/logging/debugLogger')`
**Impact:** Mock not applying, logger calls may fail

#### File: tests/utils/commands/retryStrategyManager.test.ts
**Issue:** `jest.mock('../../../src/utils/debugLogger')` (line 4)
**Fix:** Update to `jest.mock('../../../src/core/logging/debugLogger')`
**Impact:** Mock not applying, logger calls may fail

#### File: tests/utils/auth/tokenManager.test.ts
**Issue:** `jest.mock('../../../src/utils/commands/commandExecutor')` (line 6)
**Fix:** Update to `jest.mock('../../../src/core/shell/commandExecutor')`
**Impact:** Mock not applying, command execution tests fail

#### File: tests/utils/auth/organizationValidator.test.ts
**Issue:** `jest.mock('../../../src/utils/logger')` (line 16)
**Fix:** Update to `jest.mock('../../../src/core/logging/logger')`
**Impact:** Mock not applying, logger calls may fail

#### File: tests/utils/meshDeployer.test.ts
**Issue:** `require('../../src/utils/securityValidation')` (line 425)
**Fix:** Update to `require('../../src/core/validation/securityValidation')`
**Impact:** Dynamic require fails with ENOENT

## Implementation Details (GREEN Phase)

### RED: Current Failing State

**Error Pattern:**
```
ENOENT: no such file or directory, open '.../src/utils/progressUnifier.ts'
Cannot find module '../../../src/utils/securityValidation' from 'tests/...'
```

**Affected Tests (8 files, multiple failures):**
- progressUnifierHelpers.test.ts (9 path references)
- lifecycleHandlers.test.ts (1 jest.mock)
- resourceLocker.test.ts (1 jest.mock)
- pollingService.test.ts (1 jest.mock)
- retryStrategyManager.test.ts (1 jest.mock)
- tokenManager.test.ts (1 jest.mock)
- organizationValidator.test.ts (1 jest.mock)
- meshDeployer.test.ts (1 require path)

### GREEN: Implementation Steps

**Path Mapping Reference:**
- `src/utils/progressUnifier.ts` → `src/core/utils/progressUnifier.ts`
- `src/utils/securityValidation` → `src/core/validation/securityValidation`
- `src/utils/debugLogger` → `src/core/logging/debugLogger`
- `src/utils/commands/commandExecutor` → `src/core/shell/commandExecutor`
- `src/utils/logger` → `src/core/logging/logger`

**Update Strategy:**

1. **Update progressUnifierHelpers.test.ts (9 replacements)**
   - Replace all instances: `src/utils/progressUnifier.ts` → `src/core/utils/progressUnifier.ts`
   - Run: `npm test -- tests/unit/utils/progressUnifierHelpers.test.ts --no-coverage`
   - Expected: Test executes, no ENOENT errors

2. **Update jest.mock() calls (6 files)**
   - **lifecycleHandlers.test.ts**: `src/utils/securityValidation` → `src/core/validation/securityValidation`
   - **resourceLocker.test.ts**: `src/utils/debugLogger` → `src/core/logging/debugLogger`
   - **pollingService.test.ts**: `src/utils/debugLogger` → `src/core/logging/debugLogger`
   - **retryStrategyManager.test.ts**: `src/utils/debugLogger` → `src/core/logging/debugLogger`
   - **tokenManager.test.ts**: `src/utils/commands/commandExecutor` → `src/core/shell/commandExecutor`
   - **organizationValidator.test.ts**: `src/utils/logger` → `src/core/logging/logger`
   - Run each: `npm test -- tests/[path]/[file].test.ts --no-coverage`
   - Expected: Mocks apply correctly, tests execute

3. **Update meshDeployer.test.ts require path**
   - Replace: `../../src/utils/securityValidation` → `../../src/core/validation/securityValidation`
   - Run: `npm test -- tests/utils/meshDeployer.test.ts --no-coverage`
   - Expected: Dynamic require succeeds, test executes

4. **Run full verification**
   - Run: `npm test -- tests/unit/utils/progressUnifierHelpers.test.ts tests/commands/handlers/lifecycleHandlers.test.ts tests/utils/commands/*.test.ts tests/utils/auth/*.test.ts tests/utils/meshDeployer.test.ts --no-coverage`
   - Expected: All 8 test files execute without path errors
   - Note: Tests may still fail on logic/assertions (fixed in later steps)

### REFACTOR: Path Alias Consideration

**Decision:** Keep relative paths for now, do NOT convert to path aliases (@/core/*)
**Rationale:**
- Test files use jest.mock() which requires relative paths (path aliases don't work in jest.mock)
- require() calls in tests also need relative paths
- Path alias conversion would require additional jest configuration complexity
- Relative paths are explicit and clear for test files

**Future Enhancement:** If tsconfig path alias support for jest.mock() becomes available, consider converting in future refactor

## Expected Outcome
- All 8 test files locate source files at new locations
- No ENOENT or "Cannot find module" errors in test output
- jest.mock() calls successfully mock target modules
- Tests execute to completion (may still have assertion failures addressed in later steps)
- Test suite progress: ~8 additional test files executable (may not all pass yet)

## Acceptance Criteria
- [x] progressUnifierHelpers.test.ts: All 9 path references updated to `src/core/utils/progressUnifier.ts`
- [x] lifecycleHandlers.test.ts: jest.mock updated to `src/core/validation/securityValidation`
- [x] resourceLocker.test.ts: jest.mock updated to `src/core/logging/debugLogger`
- [x] pollingService.test.ts: jest.mock updated to `src/core/logging/debugLogger`
- [x] retryStrategyManager.test.ts: jest.mock updated to `src/core/logging/debugLogger`
- [x] tokenManager.test.ts: jest.mock updated to `src/core/shell/commandExecutor`
- [x] organizationValidator.test.ts: jest.mock updated to `src/core/logging/logger`
- [x] meshDeployer.test.ts: require path updated to `src/core/validation/securityValidation`
- [x] All 8 test files execute without ENOENT errors
- [x] No new path-related errors introduced in other tests

## Dependencies from Other Steps
**Depends on:** Step 1 (jest-dom setup - TypeScript configuration clean)

**Blocks:**
- Step 3: Logger mock interface updates (tests must execute first)
- Step 4: Type/export fixes (tests must locate files first)
- Step 5: Auth mock updates (tests must execute first)
- Step 6: Test logic fixes (tests must execute before fixing assertions)

## Estimated Time
15-20 minutes

**Breakdown:**
- Update progressUnifierHelpers.test.ts (9 replacements): 3 minutes
- Update 6 jest.mock() files (1 replacement each): 6 minutes
- Update meshDeployer.test.ts require: 2 minutes
- Run targeted verification tests: 5 minutes
- Run full verification suite: 3 minutes
- Document changes: 2 minutes

---

## Reference
- **Architecture Refactor:** Files moved from `src/utils/*` to `src/core/{utils,logging,validation,shell}/*`
- **Test Path Patterns:** Relative paths required for jest.mock() and require() in tests
- **Path Alias Limitation:** jest.mock() incompatible with TypeScript path aliases (tsconfig paths)
