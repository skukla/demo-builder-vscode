# Step 1: Migrate Legacy Utils Tests to Features and Core

## Step Overview

**Purpose:** Eliminate the legacy tests/utils/ directory by migrating test files to structure-aligned paths that mirror the current src/ organization. This step addresses the primary misalignment where tests for feature-based and core infrastructure code still reside in the obsolete utils/ directory.

**What This Accomplishes:**
- Removes duplicate authentication tests (3 files) that are outdated copies
- Relocates 11 unique test files from tests/utils/ to correct locations
- Creates necessary test directory structure in tests/core/ and tests/features/
- Preserves git history through exclusive use of git mv and git rm
- Updates Jest configuration to recognize new test locations
- Validates all imports resolve correctly and all tests pass

**Files Affected:** 14 test files in tests/utils/, plus directory structure changes

**Estimated Time:** 1.5-2 hours

---

## Prerequisites

- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)
- [ ] TypeScript compiler available (npx tsc --noEmit)
- [ ] Understanding that this step uses git operations (git mv, git rm)

---

## Test Strategy

### Test Scenarios for This Migration Step

#### Happy Path: Successful Migration with All Tests Passing

**Scenario 1: Delete Duplicate Authentication Tests**
- [ ] **Test:** Verify duplicate auth tests are safely removed
  - **Given:** tests/utils/auth/ contains 3 test files that are outdated copies
  - **When:** git rm is executed on these duplicate files
  - **Then:** Files removed from filesystem, canonical versions in tests/features/authentication/services/ still exist
  - **Verification:** `npm test -- tests/features/authentication` passes with no test count reduction

**Scenario 2: Move Core Infrastructure Tests**
- [ ] **Test:** Verify core tests relocated to structure-aligned paths
  - **Given:** 8 test files in tests/utils/ and tests/utils/commands/ test core functionality
  - **When:** git mv relocates them to tests/core/communication/, tests/core/state/, tests/core/validation/, tests/core/utils/, tests/core/shell/
  - **Then:** All files exist at new locations, git history preserved, imports resolve correctly
  - **Verification:** `npm test -- tests/core` passes with all relocated tests executing

**Scenario 3: Move Feature Tests**
- [ ] **Test:** Verify feature tests relocated to services/utils subdirectories
  - **Given:** 3 test files in tests/utils/ test feature services (componentManager, meshDeployer, errorFormatter)
  - **When:** git mv relocates them to tests/features/components/services/, tests/features/mesh/services/, tests/features/mesh/utils/
  - **Then:** All files exist at new locations, tests pass in new locations
  - **Verification:** `npm test -- tests/features/components` and `npm test -- tests/features/mesh` pass

**Scenario 4: All Imports Resolve Correctly**
- [ ] **Test:** Verify path alias resolution after migration
  - **Given:** Moved tests already use path aliases (@/core/, @/features/)
  - **When:** TypeScript compiler validates all imports
  - **Then:** No import resolution errors, all path aliases resolve to correct source files
  - **Verification:** `npx tsc --noEmit` succeeds with no errors

#### Edge Cases: Special Handling Required

**Edge Case 1: React Test Utility File**
- [ ] **Test:** Verify react-test-utils.tsx is handled appropriately
  - **Given:** tests/utils/react-test-utils.tsx is a utility, not a test file
  - **When:** Analyzing file usage in codebase
  - **Then:** If unused, delete; if used, move to tests/helpers/ or tests/setup/
  - **Verification:** Grep for imports of react-test-utils, validate new location if moved

**Edge Case 2: Empty Directories After Migration**
- [ ] **Test:** Verify obsolete directories are cleaned up
  - **Given:** tests/utils/auth/, tests/utils/commands/, tests/utils/ will be empty after migration
  - **When:** git rm -r executed on empty directories
  - **Then:** Directories removed from git tracking
  - **Verification:** `ls tests/utils/` shows "No such file or directory"

**Edge Case 3: Jest TestMatch Patterns**
- [ ] **Test:** Verify Jest finds all tests in new locations
  - **Given:** Jest config testMatch patterns are `**/tests/**/*.test.ts`
  - **When:** Running npm test after migration
  - **Then:** Jest discovers same test count as before (92 files - 3 deleted duplicates = 89 active files)
  - **Verification:** `npm test -- --listTests | wc -l` shows expected count

#### Error Conditions: Failure Scenarios and Recovery

**Error Condition 1: Import Resolution Failures**
- [ ] **Test:** Detect and resolve broken imports
  - **Given:** Some test may have relative imports or misconfigured path aliases
  - **When:** TypeScript compiler attempts to resolve imports
  - **Then:** Compiler errors clearly indicate which imports failed
  - **Recovery:** Fix import paths to use correct path aliases, verify source file location
  - **Verification:** `npx tsc --noEmit` succeeds after fixes

**Error Condition 2: Jest Cannot Find Tests**
- [ ] **Test:** Detect missing tests after migration
  - **Given:** Jest testMatch patterns may not include new directories
  - **When:** Running npm test after migration
  - **Then:** Test count lower than expected, or specific tests not found
  - **Recovery:** Update jest.config.js testMatch patterns, verify directory names match patterns
  - **Verification:** `npm test -- --listTests` shows all expected test files

**Error Condition 3: Tests Fail After Migration**
- [ ] **Test:** Identify test failures caused by migration
  - **Given:** Tests may have path-dependent logic or relative imports
  - **When:** Running npm test on relocated tests
  - **Then:** Test failures with import or path-related errors
  - **Recovery:** Update test imports to use path aliases, fix mock paths if needed
  - **Verification:** `npm test` succeeds with no failures

**Error Condition 4: Git History Lost**
- [ ] **Test:** Verify file history preserved through git mv
  - **Given:** Using git mv instead of copy/delete
  - **When:** Checking git log after migration
  - **Then:** git log --follow shows complete file history at new location
  - **Recovery:** If history lost, revert commit and retry with git mv
  - **Verification:** `git log --follow tests/core/state/stateManager.test.ts` shows history from tests/utils/

---

## Implementation Details

### Phase 1: Pre-Migration Validation

**Verify Clean Starting State**

Run these commands to ensure clean starting point:

```bash
# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# Verify TypeScript compilation succeeds
npx tsc --noEmit

# Count current test files (should be 92 total)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l
```

**Expected Results:**
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- No TypeScript errors (npx tsc --noEmit succeeds)
- Test count: 92 files

### Phase 2: Delete Duplicate Authentication Tests

**Why:** tests/utils/auth/ contains outdated copies of tests that already exist in tests/features/authentication/services/ with more comprehensive coverage (556 vs 303 lines for authCacheManager, 551 vs 259 for organizationValidator, 458 vs 215 for tokenManager).

**Commands:**

```bash
# Delete duplicate auth tests (canonical versions exist in tests/features/authentication/services/)
git rm tests/utils/auth/authCacheManager.test.ts
git rm tests/utils/auth/organizationValidator.test.ts
git rm tests/utils/auth/tokenManager.test.ts
git rm -r tests/utils/auth/

# Verify canonical tests still pass
npm test -- tests/features/authentication/services
```

**Expected Output:**
- git rm removes files from tracking
- tests/utils/auth/ directory removed
- Authentication tests pass in tests/features/ location
- Test count: 89 files remaining (92 - 3 deleted)

### Phase 3: Create New Test Directory Structure

**Create necessary directories for relocated tests:**

```bash
# Create core test directories
mkdir -p tests/core/communication
mkdir -p tests/core/state
mkdir -p tests/core/utils
mkdir -p tests/core/shell

# Create feature test directories (if don't exist)
mkdir -p tests/features/components/services
mkdir -p tests/features/mesh/services
mkdir -p tests/features/mesh/utils

# Verify directory structure
ls -R tests/core/
ls -R tests/features/
```

**Expected Output:**
- All directories created successfully
- ls commands show new directory structure
- No errors about existing directories (mkdir -p is idempotent)

### Phase 4: Move Core Infrastructure Tests

**Relocate tests for core/ modules using git mv:**

**4A: Communication Tests**
```bash
# Move webview communication test
git mv tests/utils/webviewCommunicationManager.test.ts tests/core/communication/webviewCommunicationManager.test.ts

# Verify
ls tests/core/communication/
git status
```

**4B: State Management Tests**
```bash
# Move state manager test
git mv tests/utils/stateManager.test.ts tests/core/state/stateManager.test.ts

# Verify
ls tests/core/state/
git status
```

**4C: Validation Tests**
```bash
# Move validation tests (core/validation/)
git mv tests/utils/fieldValidation.test.ts tests/core/validation/fieldValidation.test.ts
git mv tests/utils/securityValidation.test.ts tests/core/validation/securityValidation.test.ts

# Verify
ls tests/core/validation/
git status
```

**4D: Core Utilities Tests**
```bash
# Move timeout config test (core/utils/)
git mv tests/utils/timeoutConfig.test.ts tests/core/utils/timeoutConfig.test.ts

# Verify
ls tests/core/utils/
git status
```

**4E: Shell/Command Execution Tests**
```bash
# Move command execution utilities (core/shell/)
git mv tests/utils/commands/pollingService.test.ts tests/core/shell/pollingService.test.ts
git mv tests/utils/commands/resourceLocker.test.ts tests/core/shell/resourceLocker.test.ts
git mv tests/utils/commands/retryStrategyManager.test.ts tests/core/shell/retryStrategyManager.test.ts

# Remove empty commands directory
git rm -r tests/utils/commands/

# Verify
ls tests/core/shell/
git status
```

**Expected Results After Phase 4:**
- 8 test files moved to tests/core/ subdirectories
- tests/utils/commands/ directory removed
- git status shows renamed files (preserving history)
- File count unchanged (moves, not deletes)

### Phase 5: Move Feature Tests

**Relocate tests for features/ modules using git mv:**

**5A: Component Management Tests**
```bash
# Move component manager test
git mv tests/utils/componentManager.test.ts tests/features/components/services/componentManager.test.ts

# Verify
ls tests/features/components/services/
git status
```

**5B: Mesh Deployment Tests**
```bash
# Move mesh deployer test (services)
git mv tests/utils/meshDeployer.test.ts tests/features/mesh/services/meshDeployer.test.ts

# Move mesh error formatter test (utils)
git mv tests/utils/errorFormatter.test.ts tests/features/mesh/utils/errorFormatter.test.ts

# Verify
ls tests/features/mesh/services/
ls tests/features/mesh/utils/
git status
```

**Expected Results After Phase 5:**
- 3 test files moved to tests/features/ subdirectories
- All feature tests now colocated with their source code structure
- git status shows renamed files

### Phase 6: Handle Non-Test Utility File

**Check if react-test-utils.tsx is used and relocate appropriately:**

```bash
# Search for imports of react-test-utils
grep -r "react-test-utils" tests/ --include="*.ts" --include="*.tsx"

# If no results (unused), delete:
git rm tests/utils/react-test-utils.tsx

# OR if used, move to helpers:
# git mv tests/utils/react-test-utils.tsx tests/helpers/react-test-utils.tsx
```

**Expected Results:**
- If unused: File deleted
- If used: File moved to tests/helpers/ and imports updated
- React test utility properly located

### Phase 7: Clean Up Empty Directories

**Remove obsolete tests/utils/ directory:**

```bash
# Verify tests/utils/ is now empty
ls -la tests/utils/

# If empty, remove directory
git rm -r tests/utils/

# Verify removal
ls tests/
```

**Expected Results:**
- tests/utils/ no longer exists
- tests/ directory shows only structure-aligned directories (core/, features/, etc.)
- git status shows deleted directory

### Phase 8: Validate Import Resolution

**Verify all imports resolve correctly:**

```bash
# Run TypeScript compiler (no emit, just type checking)
npx tsc --noEmit

# Should succeed with no errors
echo $?  # Should output: 0
```

**Expected Results:**
- TypeScript compiler succeeds
- No import resolution errors
- All path aliases (@/core/, @/features/) resolve correctly

**If Errors Occur:**
- Examine error messages for specific import failures
- Verify source files exist at expected locations
- Check that path aliases match jest.config.js moduleNameMapper
- Fix import statements to use correct path aliases

### Phase 9: Run Test Suite

**Execute full test suite to verify all tests pass:**

```bash
# Run all tests
npm test

# Verify test count (should be 89 files: 92 original - 3 deleted duplicates)
npm test -- --listTests | wc -l

# Run specific test suites to verify relocated tests
npm test -- tests/core/communication
npm test -- tests/core/state
npm test -- tests/core/validation
npm test -- tests/core/utils
npm test -- tests/core/shell
npm test -- tests/features/components/services
npm test -- tests/features/mesh/services
npm test -- tests/features/mesh/utils
```

**Expected Results:**
- All tests pass (no failures)
- Test count: 89 files (92 - 3 deleted duplicates)
- All relocated tests execute successfully in new locations
- Jest finds all tests via existing testMatch patterns

**If Tests Fail:**
1. Examine failure messages for specific test/import issues
2. Check that all test files use path aliases (not relative imports)
3. Verify mock paths are correct (update relative paths in jest.mock())
4. Re-run `npx tsc --noEmit` to validate imports
5. Fix issues and re-run tests

### Phase 10: Commit Migration

**Create atomic commit for this migration step:**

```bash
# Stage all changes
git add -A

# Verify what will be committed
git status

# Create commit with descriptive message
git commit -m "test: migrate legacy utils tests to structure-aligned paths (Step 1)

- Delete duplicate auth tests (outdated copies in tests/utils/auth/)
- Move 8 core infrastructure tests to tests/core/ subdirectories
- Move 3 feature tests to tests/features/ subdirectories
- Remove obsolete tests/utils/ directory
- All tests passing, imports using path aliases
- Git history preserved via git mv

Tests: 89 files (92 original - 3 deleted duplicates)
Coverage: Maintained at 80%+

Part of test reorganization plan (Step 1/7)"
```

**Expected Results:**
- Single atomic commit with all migration changes
- Commit message clearly describes changes
- Git history preserved for all moved files
- Clean working directory after commit

---

## Detailed File Migration Map

### Files to DELETE (Duplicates)
| Legacy Path | Reason | Canonical Location |
|-------------|--------|-------------------|
| `tests/utils/auth/authCacheManager.test.ts` | Outdated copy (303 lines vs 556) | `tests/features/authentication/services/authCacheManager.test.ts` |
| `tests/utils/auth/organizationValidator.test.ts` | Outdated copy (259 lines vs 551) | `tests/features/authentication/services/organizationValidator.test.ts` |
| `tests/utils/auth/tokenManager.test.ts` | Outdated copy (215 lines vs 458) | `tests/features/authentication/services/tokenManager.test.ts` |

### Files to MOVE (Core Infrastructure)
| Source Path | Destination Path | Source Code Location |
|-------------|-----------------|---------------------|
| `tests/utils/webviewCommunicationManager.test.ts` | `tests/core/communication/webviewCommunicationManager.test.ts` | `src/core/communication/webviewCommunicationManager.ts` |
| `tests/utils/stateManager.test.ts` | `tests/core/state/stateManager.test.ts` | `src/core/state/stateManager.ts` |
| `tests/utils/fieldValidation.test.ts` | `tests/core/validation/fieldValidation.test.ts` | `src/core/validation/fieldValidation.ts` |
| `tests/utils/securityValidation.test.ts` | `tests/core/validation/securityValidation.test.ts` | `src/core/validation/securityValidation.ts` |
| `tests/utils/timeoutConfig.test.ts` | `tests/core/utils/timeoutConfig.test.ts` | `src/core/utils/timeoutConfig.ts` |
| `tests/utils/commands/pollingService.test.ts` | `tests/core/shell/pollingService.test.ts` | `src/core/shell/pollingService.ts` |
| `tests/utils/commands/resourceLocker.test.ts` | `tests/core/shell/resourceLocker.test.ts` | `src/core/shell/resourceLocker.ts` |
| `tests/utils/commands/retryStrategyManager.test.ts` | `tests/core/shell/retryStrategyManager.test.ts` | `src/core/shell/retryStrategyManager.ts` |

### Files to MOVE (Features)
| Source Path | Destination Path | Source Code Location |
|-------------|-----------------|---------------------|
| `tests/utils/componentManager.test.ts` | `tests/features/components/services/componentManager.test.ts` | `src/features/components/services/componentManager.ts` |
| `tests/utils/meshDeployer.test.ts` | `tests/features/mesh/services/meshDeployer.test.ts` | `src/features/mesh/services/meshDeployer.ts` |
| `tests/utils/errorFormatter.test.ts` | `tests/features/mesh/utils/errorFormatter.test.ts` | `src/features/mesh/utils/errorFormatter.ts` |

### Utility File
| Path | Action | Notes |
|------|--------|-------|
| `tests/utils/react-test-utils.tsx` | Delete if unused, OR move to `tests/helpers/` | Check usage with grep before decision |

---

## Expected Outcome

**After Successful Completion:**

- [ ] **File Count:** 89 test files (92 original - 3 deleted duplicates)
- [ ] **Directory Structure:**
  - tests/core/ contains 11 tests (8 moved + 3 existing)
  - tests/features/ contains 25 tests (22 existing + 3 moved)
  - tests/utils/ directory completely removed
- [ ] **All Tests Passing:** `npm test` succeeds with no failures
- [ ] **Import Resolution:** `npx tsc --noEmit` succeeds with no errors
- [ ] **Git History:** `git log --follow` shows complete history for moved files
- [ ] **Jest Configuration:** No changes needed (existing patterns work)
- [ ] **Test Coverage:** Maintained at 80%+ (no reduction from reorganization)

**What Works After This Step:**
- All tests execute in structure-aligned locations
- No duplicate/outdated test files
- Clear mapping between test location and source code location
- Foundation for remaining migration steps (Steps 2-7)

---

## Acceptance Criteria

- [ ] All tests passing for this step (`npm test` succeeds)
- [ ] Test count: 89 files (verified via `npm test -- --listTests | wc -l`)
- [ ] tests/utils/ directory no longer exists
- [ ] All moved tests use path aliases (@/core/, @/features/)
- [ ] TypeScript compiler succeeds (`npx tsc --noEmit`)
- [ ] Git history preserved for all moved files
- [ ] Coverage maintained at 80%+ (verify via coverage report)
- [ ] Single atomic commit with descriptive message
- [ ] No console.log or debugger statements introduced
- [ ] No broken imports or path resolution errors

---

## Dependencies

**Files This Step Depends On:**
- jest.config.js (existing testMatch patterns must support new locations)
- tsconfig.json (path aliases must be correctly configured)
- All source files in src/core/ and src/features/ (tests verify these)

**Files This Step Modifies:**
- 14 test files (3 deleted, 11 moved)
- tests/ directory structure (new subdirectories created, obsolete directory removed)

**Files This Step Does NOT Modify:**
- jest.config.js (no changes needed - existing patterns work)
- tsconfig.json (no changes needed - path aliases already configured)
- Any source files in src/ (pure test reorganization)

**Subsequent Steps That Depend on This:**
- Step 2: Migrate command handler tests (depends on core/ structure being ready)
- Step 6: Update Jest config (integrates all migration steps)

---

## Rollback Plan

**If This Step Fails:**

**Immediate Rollback (Before Commit):**
```bash
# Discard all changes
git reset --hard HEAD

# Verify clean state
git status
npm test
```

**Rollback After Commit:**
```bash
# Find commit hash for this step
git log --oneline | head -5

# Revert commit
git revert <commit-hash>

# OR reset to previous commit (destructive)
git reset --hard HEAD~1

# Verify tests pass
npm test
```

**Partial Rollback (Fix Specific Issues):**
```bash
# Restore specific file from previous commit
git checkout HEAD~1 -- tests/utils/stateManager.test.ts

# Re-run tests to verify
npm test -- tests/utils
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] tests/utils/ directory exists with original files
- [ ] No broken imports or missing test files
- [ ] Test count: 92 files (original count)

---

## Common Issues and Solutions

### Issue 1: Import Resolution Fails

**Symptom:** TypeScript errors like "Cannot find module '@/core/state/stateManager'"

**Cause:** Path aliases misconfigured or test imports use relative paths

**Solution:**
```bash
# Verify tsconfig.json has correct path aliases
cat tsconfig.json | grep -A 10 "paths"

# Verify jest.config.js has matching moduleNameMapper
cat jest.config.js | grep -A 10 "moduleNameMapper"

# Fix test imports to use path aliases
# Change: import { StateManager } from '../../../src/core/state/stateManager';
# To: import { StateManager } from '@/core/state/stateManager';
```

### Issue 2: Jest Can't Find Tests

**Symptom:** Test count lower than expected, or specific tests not found

**Cause:** jest.config.js testMatch patterns don't include new directories

**Solution:**
```bash
# Check which tests Jest will find
npm test -- --listTests

# Verify testMatch patterns
cat jest.config.js | grep -A 5 "testMatch"

# Current pattern: '**/tests/**/*.test.ts' should work for new structure
# If not, update testMatch to explicitly include new directories
```

### Issue 3: Tests Fail After Migration

**Symptom:** Tests pass in old location, fail in new location

**Cause:** Tests have path-dependent logic or relative mock paths

**Solution:**
```bash
# Identify failing test
npm test -- tests/core/state

# Check test for relative paths in jest.mock()
# Change: jest.mock('../../../src/core/logging/logger')
# To: jest.mock('@/core/logging/logger')

# Re-run test
npm test -- tests/core/state
```

### Issue 4: Git History Not Preserved

**Symptom:** `git log --follow` doesn't show history before move

**Cause:** Used copy/delete instead of git mv

**Solution:**
```bash
# If caught before commit:
git reset HEAD
# Redo migration using git mv commands

# If caught after commit:
# History is still preserved, but --follow flag needed
git log --follow tests/core/state/stateManager.test.ts
```

### Issue 5: Directories Not Created

**Symptom:** git mv fails with "No such file or directory"

**Cause:** Destination directory doesn't exist

**Solution:**
```bash
# Create destination directory
mkdir -p tests/core/communication

# Retry git mv
git mv tests/utils/webviewCommunicationManager.test.ts tests/core/communication/
```

---

## Cross-References

**Related Plan Sections:**
- Overview.md: Overall test reorganization strategy
- Overview.md Risk Assessment: Import resolution failures, Jest configuration issues
- Step 2: Command handler migration (depends on this step's completion)
- Step 6: Jest config update (integrates all migration steps)

**Related Documentation:**
- jest.config.js: Test matching patterns and path aliases
- tsconfig.json: Path alias configuration
- CLAUDE.md: Test structure documentation (to be updated in Step 7)

**Related Source Files:**
- src/core/communication/webviewCommunicationManager.ts
- src/core/state/stateManager.ts
- src/core/validation/fieldValidation.ts, securityValidation.ts
- src/core/utils/timeoutConfig.ts
- src/core/shell/pollingService.ts, resourceLocker.ts, retryStrategyManager.ts
- src/features/components/services/componentManager.ts
- src/features/mesh/services/meshDeployer.ts
- src/features/mesh/utils/errorFormatter.ts

---

## Verification Commands Summary

**Quick validation checklist:**

```bash
# 1. Pre-migration validation
npm test && npx tsc --noEmit && git status

# 2. Post-migration validation
npm test -- --listTests | wc -l  # Should show 89
npm test                          # Should pass all tests
npx tsc --noEmit                  # Should have no errors
git log --follow tests/core/state/stateManager.test.ts  # Should show history

# 3. Verify directory structure
ls -R tests/core/
ls -R tests/features/
ls tests/utils/  # Should show "No such file or directory"

# 4. Verify test count by category
find tests/core -name "*.test.ts" | wc -l      # Should show 11
find tests/features -name "*.test.ts" -o -name "*.test.tsx" | wc -l  # Should show 25
```

---

_Step 1 implementation ready for TDD execution_
_Next Step: Step 2 - Migrate command handler tests (step-02.md)_
