# Step 4: Consolidate Duplicate Hook Tests

## Step Overview

**Purpose:** Consolidate duplicate hook tests from legacy location (tests/webviews/hooks/) to canonical location (tests/webview-ui/shared/hooks/), eliminating duplication while preserving unique test files. This step removes the last vestige of the obsolete tests/webviews/ structure.

**What This Accomplishes:**
- Eliminates 9 duplicate hook test files from tests/webviews/hooks/
- Migrates 3 unique hook test files (useDebouncedLoading, useDebouncedValue, useMinimumLoadingTime) to canonical location
- Removes entire tests/webviews/ directory tree (final cleanup of obsolete structure)
- Consolidates all 12 hook tests in tests/webview-ui/shared/hooks/ (aligned with webview-ui/src/shared/hooks/)
- Preserves git history for unique test files through git mv

**Files Affected:** 12 test files in tests/webviews/hooks/ (9 duplicates to remove, 3 unique to move)

**Estimated Time:** 1 hour

---

## Prerequisites

- [ ] Step 1 completed (legacy utils tests migrated)
- [ ] Step 2 completed (feature handler tests migrated)
- [ ] Step 3 completed (webview component tests migrated)
- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)
- [ ] TypeScript compiler available (npx tsc --noEmit)

---

## Test Strategy

### Test Scenarios for This Consolidation Step

#### Happy Path: Successful Hook Test Consolidation

**Scenario 1: Verify Canonical Tests Exist and Are Current**
- [ ] **Test:** Confirm tests/webview-ui/shared/hooks/ contains newer, more complete test implementations
  - **Given:** tests/webview-ui/shared/hooks/ contains 9 hook test files
  - **When:** Comparing test implementations between locations
  - **Then:** Canonical tests have React 19 compatibility, better async patterns, more comprehensive coverage
  - **Verification:** `diff` commands show webview-ui versions are newer (React 19 notes, async/await patterns)

**Scenario 2: Move Unique Hook Tests**
- [ ] **Test:** Migrate 3 unique hook tests to canonical location
  - **Given:** tests/webviews/hooks/ contains useDebouncedLoading, useDebouncedValue, useMinimumLoadingTime tests not in canonical location
  - **When:** git mv relocates all 3 tests to tests/webview-ui/shared/hooks/
  - **Then:** Files exist at canonical location, tests pass, git history preserved
  - **Verification:** `npm test -- tests/webview-ui/shared/hooks` passes with 12 test suites

**Scenario 3: Remove Duplicate Tests**
- [ ] **Test:** Delete 9 duplicate hook tests from obsolete location
  - **Given:** tests/webviews/hooks/ contains 9 duplicate hook tests (useAsyncData, useAutoScroll, useFocusTrap, etc.)
  - **When:** Removing tests/webviews/hooks/ directory after unique tests moved
  - **Then:** Obsolete directory deleted, only canonical tests remain in tests/webview-ui/shared/hooks/
  - **Verification:** `ls tests/webviews/hooks/ 2>&1 | grep "No such file or directory"`

**Scenario 4: Complete Webviews Directory Cleanup**
- [ ] **Test:** Remove entire obsolete tests/webviews/ directory tree
  - **Given:** tests/webviews/ only contains hooks/ subdirectory after Step 3 removed components/
  - **When:** Removing tests/webviews/ directory after hooks/ consolidated
  - **Then:** Obsolete tests/webviews/ structure completely eliminated
  - **Verification:** `ls tests/webviews/ 2>&1 | grep "No such file or directory"`

**Scenario 5: All Hook Tests Pass in Canonical Location**
- [ ] **Test:** Verify all 12 hook tests execute successfully
  - **Given:** tests/webview-ui/shared/hooks/ contains all 12 hook test files
  - **When:** Running React test suite
  - **Then:** All hook tests pass, 12 test suites execute successfully
  - **Verification:** `npm test -- tests/webview-ui/shared/hooks` shows 12 passing test suites

#### Edge Cases: Duplicate Handling and Import Compatibility

**Edge Case 1: Duplicate Test Files With Minor Differences**
- [ ] **Test:** Handle duplicate tests that have comment or style differences
  - **Given:** Comparing useAsyncData.test.ts from both locations shows only comment differences
  - **When:** Keeping canonical version (tests/webview-ui/shared/hooks/)
  - **Then:** Newer version preserved, older version deleted, no test coverage loss
  - **Verification:** Diff shows only superficial differences (comments), all test cases present in canonical version

**Edge Case 2: Duplicate Tests With Significant Implementation Differences**
- [ ] **Test:** Handle duplicate tests with different async patterns or React version compatibility
  - **Given:** useFocusTrap, useVSCodeRequest have significant implementation differences between locations
  - **When:** Keeping canonical version with React 19 compatibility and better patterns
  - **Then:** Modern test implementation preserved, legacy patterns discarded
  - **Verification:** Canonical tests use async/await patterns, have React 19 notes, pass all assertions

**Edge Case 3: Tests With Same Name But Different Coverage**
- [ ] **Test:** Verify no test cases lost when removing duplicates
  - **Given:** Both versions of test may have unique test cases
  - **When:** Comparing test coverage before and after consolidation
  - **Then:** All unique test cases preserved in canonical version
  - **Verification:** Test case count maintained or increased after consolidation

**Edge Case 4: Import Paths After Consolidation**
- [ ] **Test:** Verify moved tests have correct import paths for their new location
  - **Given:** Tests moved from tests/webviews/hooks/ to tests/webview-ui/shared/hooks/
  - **When:** Tests import from @/webview-ui/shared/hooks/ and utils/react-test-utils
  - **Then:** All imports resolve correctly for both hook implementations and test utilities
  - **Verification:** `npx tsc --noEmit` succeeds with no import errors

#### Error Conditions: Import Failures and Missing Tests

**Error Condition 1: Unique Test Cases Only in Legacy Location**
- [ ] **Test:** Detect if legacy tests have test cases not present in canonical version
  - **Given:** Comparing test case descriptions and assertions between duplicate files
  - **When:** Legacy test has unique assertions or edge cases
  - **Then:** Manual merge required before deletion
  - **Recovery:** Copy unique test cases from legacy to canonical version before deletion
  - **Verification:** `diff` command comparison, manual test case review

**Error Condition 2: Import Path Mismatches After Move**
- [ ] **Test:** Detect import errors after moving unique tests
  - **Given:** Tests moved to tests/webview-ui/shared/hooks/ from tests/webviews/hooks/
  - **When:** Import paths for react-test-utils or hooks have incorrect depth
  - **Then:** TypeScript compilation errors for module resolution
  - **Recovery:** Update import paths to match new directory structure
  - **Verification:** `npx tsc --noEmit` succeeds after path corrections

**Error Condition 3: Test Environment Mismatch**
- [ ] **Test:** Ensure moved tests run in React (jsdom) environment
  - **Given:** jest.config.js React project matches `**/tests/webview-ui/**/*.test.ts*`
  - **When:** Moved tests use React Testing Library features
  - **Then:** Tests run in jsdom environment, screen/render/etc. work correctly
  - **Recovery:** Verify jest.config.js testMatch patterns include new test location
  - **Verification:** Tests pass without "document is not defined" errors

**Error Condition 4: Git History Lost for Moved Tests**
- [ ] **Test:** Verify file history preserved for moved unique tests
  - **Given:** Using git mv for useDebouncedLoading, useDebouncedValue, useMinimumLoadingTime
  - **When:** Checking git log after migration
  - **Then:** git log --follow shows complete file history from tests/webviews/hooks/
  - **Recovery:** If history lost, revert and retry with git mv
  - **Verification:** `git log --follow` shows history for all 3 moved tests

---

## Implementation Details

### Phase 1: Pre-Migration Validation

**Verify Clean Starting State**

Run these commands to ensure clean starting point:

```bash
# Verify Steps 1-3 completed
ls tests/utils/ 2>&1 | grep "No such file or directory"  # Step 1 cleanup
ls tests/features/lifecycle/handlers/ | grep "lifecycleHandlers.test.ts"  # Step 2 result
ls tests/webviews/components/ 2>&1 | grep "No such file or directory"  # Step 3 cleanup

# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# Verify TypeScript compilation succeeds
npx tsc --noEmit

# Count current test files (should be 100 from Step 3)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List current hook test structure
ls -la tests/webviews/hooks/
ls -la tests/webview-ui/shared/hooks/
```

**Expected Results:**
- tests/utils/ does not exist (Step 1 cleanup)
- tests/features/lifecycle/handlers/ contains lifecycleHandlers.test.ts (Step 2 result)
- tests/webviews/components/ does not exist (Step 3 cleanup)
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- No TypeScript errors (npx tsc --noEmit succeeds)
- Test count: 100 files
- tests/webviews/hooks/ contains 12 test files
- tests/webview-ui/shared/hooks/ contains 9 test files

### Phase 2: Analyze Duplicate vs Unique Tests

**Identify which tests are duplicates and which are unique:**

```bash
# List files in both locations
echo "=== Legacy Location (tests/webviews/hooks/) ==="
ls tests/webviews/hooks/

echo ""
echo "=== Canonical Location (tests/webview-ui/shared/hooks/) ==="
ls tests/webview-ui/shared/hooks/

# Identify duplicates (files in both locations)
echo ""
echo "=== Duplicates (in both locations) ==="
comm -12 <(ls tests/webviews/hooks/ | sort) <(ls tests/webview-ui/shared/hooks/ | sort)

# Identify unique to legacy location
echo ""
echo "=== Unique to tests/webviews/hooks/ (need to move) ==="
comm -23 <(ls tests/webviews/hooks/ | sort) <(ls tests/webview-ui/shared/hooks/ | sort)

# Expected output:
# Duplicates (9 files):
#   useAsyncData.test.ts
#   useAutoScroll.test.ts
#   useFocusTrap.test.ts
#   useLoadingState.test.ts
#   useSearchFilter.test.ts
#   useSelectableDefault.test.ts
#   useSelection.test.ts
#   useVSCodeMessage.test.ts
#   useVSCodeRequest.test.ts
#
# Unique (3 files):
#   useDebouncedLoading.test.ts
#   useDebouncedValue.test.ts
#   useMinimumLoadingTime.test.ts
```

**Expected Output:**
- 9 duplicate test files identified (same name in both locations)
- 3 unique test files in tests/webviews/hooks/ not present in canonical location
- Total: 12 files to handle (9 duplicates to remove, 3 unique to move)

### Phase 3: Compare Duplicate Test Files

**Verify canonical versions are newer and more complete:**

```bash
# Compare a few representative duplicates to confirm canonical version is better
echo "=== Comparing useAsyncData (should show minor comment differences) ==="
diff tests/webviews/hooks/useAsyncData.test.ts tests/webview-ui/shared/hooks/useAsyncData.test.ts

echo ""
echo "=== Comparing useFocusTrap (should show async pattern differences) ==="
diff tests/webviews/hooks/useFocusTrap.test.ts tests/webview-ui/shared/hooks/useFocusTrap.test.ts | head -50

echo ""
echo "=== Comparing useVSCodeRequest (should show React 19 notes) ==="
grep -A 3 "React 19" tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts

# Expected findings:
# - Canonical versions (tests/webview-ui/) have React 19 compatibility notes
# - Canonical versions use async/await patterns instead of fake timers
# - Canonical versions have better error handling and test patterns
# - Safe to delete legacy duplicates after verification
```

**Expected Results:**
- useAsyncData: Only comment differences ("Mock vscode API" vs "Mock webviewClient")
- useFocusTrap: Canonical uses async/await, legacy uses fake timers
- useVSCodeRequest: Canonical has React 19 compatibility notes and skip directives
- Canonical versions are clearly newer and better maintained
- Safe to remove duplicates from tests/webviews/hooks/

**If Significant Differences Found:**
- Review both versions carefully
- Merge unique test cases from legacy to canonical version
- Ensure no test coverage loss
- Re-run tests after merge to verify

### Phase 4: Move Unique Hook Tests

**Relocate 3 unique hook tests using git mv:**

**4A: Move useDebouncedLoading Test**
```bash
# Move useDebouncedLoading test
git mv tests/webviews/hooks/useDebouncedLoading.test.ts tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts

# Verify
ls tests/webview-ui/shared/hooks/ | grep useDebouncedLoading
git status
```

**4B: Move useDebouncedValue Test**
```bash
# Move useDebouncedValue test
git mv tests/webviews/hooks/useDebouncedValue.test.ts tests/webview-ui/shared/hooks/useDebouncedValue.test.ts

# Verify
ls tests/webview-ui/shared/hooks/ | grep useDebouncedValue
git status
```

**4C: Move useMinimumLoadingTime Test**
```bash
# Move useMinimumLoadingTime test
git mv tests/webviews/hooks/useMinimumLoadingTime.test.ts tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts

# Verify all hook tests now in canonical location
ls tests/webview-ui/shared/hooks/
git status

# Count files (should be 12 now: 9 existing + 3 moved)
ls tests/webview-ui/shared/hooks/ | wc -l
```

**Expected Results After Phase 4:**
- 3 test files moved to tests/webview-ui/shared/hooks/
- git status shows 3 renamed files (preserving history)
- tests/webview-ui/shared/hooks/ now contains 12 hook test files
- tests/webviews/hooks/ still contains 9 duplicate files (to be removed in Phase 5)

### Phase 5: Remove Duplicate Tests and Obsolete Directory

**Delete duplicate tests and entire obsolete tests/webviews/ structure:**

```bash
# Remove entire tests/webviews/hooks/ directory (contains 9 duplicates)
git rm -r tests/webviews/hooks/

# Verify hooks directory removed
ls tests/webviews/hooks/ 2>&1 | grep "No such file or directory"

# Check if tests/webviews/ is now empty
ls -la tests/webviews/

# If tests/webviews/ is empty, remove the entire obsolete structure
# (Note: Step 3 already removed tests/webviews/components/, so only hooks/ should remain)
git rm -r tests/webviews/

# Verify complete removal of obsolete webviews test structure
ls tests/webviews/ 2>&1 | grep "No such file or directory"

# Verify git status shows deletions
git status
```

**Expected Results:**
- tests/webviews/hooks/ directory removed (9 duplicate tests deleted)
- tests/webviews/ directory removed (obsolete structure eliminated)
- git status shows deleted directories and 3 renamed files
- Only canonical tests remain in tests/webview-ui/shared/hooks/

### Phase 6: Validate Import Resolution

**Verify all imports resolve correctly for moved tests:**

```bash
# Run TypeScript compiler (no emit, just type checking)
npx tsc --noEmit

# Should succeed with no errors
echo $?  # Should output: 0

# Check hook imports in moved tests
echo "=== Verifying hook imports in moved tests ==="
grep -n "@/webview-ui/shared/hooks" tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts
grep -n "@/webview-ui/shared/hooks" tests/webview-ui/shared/hooks/useDebouncedValue.test.ts
grep -n "@/webview-ui/shared/hooks" tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts

# Check react-test-utils imports in moved tests
echo ""
echo "=== Verifying react-test-utils imports ==="
grep -n "utils/react-test-utils" tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts
grep -n "utils/react-test-utils" tests/webview-ui/shared/hooks/useDebouncedValue.test.ts
grep -n "utils/react-test-utils" tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts

# Expected: All imports use correct paths
# - Hook imports: @/webview-ui/shared/hooks/[hookName]
# - Test utils: ../../../utils/react-test-utils (3 levels up from tests/webview-ui/shared/hooks/)
```

**Expected Results:**
- TypeScript compiler succeeds
- No import resolution errors
- All hook imports via @/webview-ui/ path alias resolve correctly
- All react-test-utils imports use correct relative path (../../../utils/react-test-utils)

**If Errors Occur:**
- Examine error messages for specific import failures
- Common issue 1: react-test-utils import depth incorrect
- Common issue 2: Hook path alias misconfigured in jest.config.js
- Fix import statements in affected test files
- Re-run `npx tsc --noEmit` to verify fixes

**Note on Import Paths:**
- Tests in tests/webview-ui/shared/hooks/ are 3 levels deep from tests/
- Correct path to react-test-utils: ../../../utils/react-test-utils
- This is different from component tests (4 levels deep) which use ../../../../utils/react-test-utils

### Phase 7: Run Hook Test Suite

**Execute hook tests to verify all consolidated tests pass:**

```bash
# Run all hook tests
npm test -- tests/webview-ui/shared/hooks

# Verify test count (should be 12 test suites)
npm test -- tests/webview-ui/shared/hooks --listTests | wc -l

# Run specific moved tests to verify they pass
npm test -- tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts
npm test -- tests/webview-ui/shared/hooks/useDebouncedValue.test.ts
npm test -- tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts

# List all hook tests to verify complete set
echo "=== All Hook Tests (should show 12 files) ==="
ls tests/webview-ui/shared/hooks/
```

**Expected Results:**
- All hook tests pass (no failures)
- Test count: 12 test suites in tests/webview-ui/shared/hooks/
- All 12 hooks have corresponding test files:
  1. useAsyncData.test.ts
  2. useAutoScroll.test.ts
  3. useDebouncedLoading.test.ts (moved)
  4. useDebouncedValue.test.ts (moved)
  5. useFocusTrap.test.ts
  6. useLoadingState.test.ts
  7. useMinimumLoadingTime.test.ts (moved)
  8. useSearchFilter.test.ts
  9. useSelectableDefault.test.ts
  10. useSelection.test.ts
  11. useVSCodeMessage.test.ts
  12. useVSCodeRequest.test.ts
- Jest uses jsdom environment for all hook tests
- All moved tests pass without import or environment errors

**If Tests Fail:**
1. Examine failure messages for specific import or execution issues
2. Check react-test-utils imports use correct depth (../../../)
3. Verify hook imports use correct path aliases (@/webview-ui/)
4. Check jest.config.js React project testMatch includes `**/tests/webview-ui/**/*.test.ts*`
5. Re-run `npx tsc --noEmit` to validate imports
6. Fix issues and re-run tests

### Phase 8: Run Full Test Suite

**Execute all tests to verify no regressions:**

```bash
# Run all tests (Node + React)
npm test

# Verify overall test count (should be 91: 79 Node + 12 moved = 91)
# Note: We're consolidating, not adding, so total decreases from 100 to 91
# Breakdown: Started with 100 (76 Node + 24 React)
#            Removed 9 duplicate hook tests
#            Moved 3 unique hook tests
#            Result: 91 total (76 Node + 15 React)
# Wait, let me recalculate...
# Actually from Step 3:
#   - 76 Node tests (after Steps 1-2)
#   - 24 React tests (13 existing webview-ui + 11 moved components)
# Step 4:
#   - Remove 9 duplicate hook tests (were in tests/webviews/hooks/)
#   - Move 3 unique hook tests
#   - Result: 100 - 9 = 91 total (76 Node + 15 React)
# Hmm, but that doesn't seem right either...

# Let me recalculate properly:
# Before Step 4: 100 test files total
#   - Node tests: 76 files
#   - React tests: 24 files (13 in webview-ui + 11 moved in Step 3 from webviews/components)
#   - Hook tests: 21 files total (9 in webview-ui + 12 in webviews/hooks)
#
# After Step 4: 91 test files total
#   - Node tests: 76 files (unchanged)
#   - React tests: 15 files (12 hooks in webview-ui + 11 components + layout tests - wait...)
#
# Actually, let me just count what we have:
# - tests/webview-ui/shared/hooks/ will have 12 test files (9 existing + 3 moved)
# - tests/webviews/hooks/ will be deleted (12 files removed, but 3 were moved, so 9 truly deleted)
# - Net result: -9 test files (100 - 9 = 91)

find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List all React tests
npm test -- --selectProjects react --listTests

# List all Node tests
npm test -- --selectProjects node --listTests
```

**Expected Results:**
- All tests pass (no failures)
- Test count: 91 files total (reduced from 100 due to duplicate removal)
- React tests: Fewer files (duplicates removed), but all unique tests preserved
- Node tests: 76 files (unchanged)
- tests/webviews/ directory does not exist (obsolete structure removed)
- tests/webview-ui/shared/hooks/ contains 12 test files (all hooks tested)

**If Tests Fail:**
1. Identify failing tests via `npm test` output
2. Check if failures are in moved tests or unrelated tests
3. For moved tests: Verify import paths and environment
4. For unrelated tests: May indicate unintentional changes during consolidation
5. Fix issues and re-run full test suite

### Phase 9: Commit Consolidation

**Create atomic commit for this consolidation step:**

```bash
# Stage all changes
git add -A

# Verify what will be committed
git status

# Expected changes:
# - 3 files renamed (tests/webviews/hooks/* → tests/webview-ui/shared/hooks/*)
# - 9 files deleted (duplicate hook tests)
# - 2 directories deleted (tests/webviews/hooks/, tests/webviews/)

# Create commit with descriptive message
git commit -m "test: consolidate duplicate hook tests to canonical location (Step 4)

- Move 3 unique hook tests to tests/webview-ui/shared/hooks/
  - useDebouncedLoading.test.ts
  - useDebouncedValue.test.ts
  - useMinimumLoadingTime.test.ts
- Remove 9 duplicate hook tests from obsolete tests/webviews/hooks/
  - Canonical versions in tests/webview-ui/shared/hooks/ are newer (React 19 compatible)
  - Legacy versions used fake timers, canonical versions use async/await patterns
- Remove entire tests/webviews/ directory structure (obsolete after Steps 3-4)
- All 12 hooks now have tests in canonical location (tests/webview-ui/shared/hooks/)
- Git history preserved via git mv for moved tests
- All tests passing, imports using correct path aliases

Test consolidation: 100 → 91 files (9 duplicates removed)
Hook tests: 12 files in canonical location (9 existing + 3 moved)
Coverage: Maintained at 80%+

Part of test reorganization plan (Step 4/7)"
```

**Expected Results:**
- Single atomic commit with all consolidation changes
- Commit message clearly describes duplicate removal and unique test preservation
- Git history preserved for moved files
- Clean working directory after commit
- Tests passing in CI/CD (if applicable)

---

## Detailed File Consolidation Map

### Files to MOVE (Unique Tests)

| Source Path (Legacy) | Destination Path (Canonical) | Source Code Location | Reason |
|---------------------|------------------------------|---------------------|--------|
| `tests/webviews/hooks/useDebouncedLoading.test.ts` | `tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts` | `webview-ui/src/shared/hooks/useDebouncedLoading.ts` | Unique test, not present in canonical location |
| `tests/webviews/hooks/useDebouncedValue.test.ts` | `tests/webview-ui/shared/hooks/useDebouncedValue.test.ts` | `webview-ui/src/shared/hooks/useDebouncedValue.ts` | Unique test, not present in canonical location |
| `tests/webviews/hooks/useMinimumLoadingTime.test.ts` | `tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts` | `webview-ui/src/shared/hooks/useMinimumLoadingTime.ts` | Unique test, not present in canonical location |

### Files to DELETE (Duplicates)

| Legacy Path (To Delete) | Canonical Path (To Keep) | Reason for Deletion |
|------------------------|-------------------------|---------------------|
| `tests/webviews/hooks/useAsyncData.test.ts` | `tests/webview-ui/shared/hooks/useAsyncData.test.ts` | Duplicate, canonical version newer (comment improvements) |
| `tests/webviews/hooks/useAutoScroll.test.ts` | `tests/webview-ui/shared/hooks/useAutoScroll.test.ts` | Duplicate, canonical version identical |
| `tests/webviews/hooks/useFocusTrap.test.ts` | `tests/webview-ui/shared/hooks/useFocusTrap.test.ts` | Duplicate, canonical version uses async/await patterns |
| `tests/webviews/hooks/useLoadingState.test.ts` | `tests/webview-ui/shared/hooks/useLoadingState.test.ts` | Duplicate, canonical version has better comments |
| `tests/webviews/hooks/useSearchFilter.test.ts` | `tests/webview-ui/shared/hooks/useSearchFilter.test.ts` | Duplicate, canonical version identical |
| `tests/webviews/hooks/useSelectableDefault.test.ts` | `tests/webview-ui/shared/hooks/useSelectableDefault.test.ts` | Duplicate, canonical version identical |
| `tests/webviews/hooks/useSelection.test.ts` | `tests/webview-ui/shared/hooks/useSelection.test.ts` | Duplicate, canonical version identical |
| `tests/webviews/hooks/useVSCodeMessage.test.ts` | `tests/webview-ui/shared/hooks/useVSCodeMessage.test.ts` | Duplicate, canonical version has minor improvements |
| `tests/webviews/hooks/useVSCodeRequest.test.ts` | `tests/webview-ui/shared/hooks/useVSCodeRequest.test.ts` | Duplicate, canonical version has React 19 compatibility notes and better patterns |

### Directories to DELETE (Obsolete Structure)

| Directory Path | Reason for Deletion |
|---------------|---------------------|
| `tests/webviews/hooks/` | All tests moved or duplicates removed, directory empty |
| `tests/webviews/` | Parent directory empty after hooks/ removed (components/ removed in Step 3) |

### Import Path Verification

**Moved Tests Import Pattern:**
```typescript
// Location: tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts
// Depth: 3 levels from tests/ (tests/webview-ui/shared/hooks/)

// Import hook implementation
import { useDebouncedLoading } from '@/webview-ui/shared/hooks/useDebouncedLoading';

// Import test utilities
import { renderHook, waitFor } from '../../../utils/react-test-utils';
// ^^^^^^^^^^^^^ (3 levels up: hooks/ → shared/ → webview-ui/ → tests/)
```

**No Changes Needed:**
- Hook imports already use @/webview-ui/ path alias (correct)
- Test utility imports should already use ../../../ relative path (3 levels)
- If imports incorrect, update during Phase 6

---

## Expected Outcome

**After Successful Completion:**

- [ ] **File Count:** 91 test files total (reduced from 100)
- [ ] **Test Count Breakdown:**
  - Node tests: 76 files (unchanged)
  - React tests: 15 files (includes 12 hook tests)
- [ ] **Hook Tests:** 12 files in tests/webview-ui/shared/hooks/ (all hooks tested)
  - 9 tests that were already in canonical location
  - 3 tests moved from tests/webviews/hooks/
  - 9 duplicate tests removed
- [ ] **Directory Structure:**
  - tests/webview-ui/shared/hooks/ contains all 12 hook tests
  - tests/webviews/ directory does not exist (obsolete structure removed)
- [ ] **All Tests Passing:** `npm test` succeeds with no failures
- [ ] **Import Resolution:** `npx tsc --noEmit` succeeds with no errors
- [ ] **Git History:** `git log --follow` shows complete history for moved tests
- [ ] **Test Coverage:** Maintained at 80%+ (no reduction from consolidation)
- [ ] **Canonical Location:** All hook tests aligned with webview-ui/src/shared/hooks/ structure

**What Works After This Step:**
- All hook tests execute from canonical location (tests/webview-ui/shared/hooks/)
- Clear 1:1 mapping between test files and source files (webview-ui/src/shared/hooks/)
- No obsolete tests/webviews/ structure remains
- Foundation for remaining migration steps (Steps 5-7)

---

## Acceptance Criteria

- [ ] All tests passing for this step (`npm test` succeeds)
- [ ] Test count: 91 files total (verified via `find tests -name "*.test.ts*" | wc -l`)
- [ ] Hook test count: 12 files in tests/webview-ui/shared/hooks/
- [ ] tests/webviews/ directory no longer exists
- [ ] All 3 unique tests moved: useDebouncedLoading, useDebouncedValue, useMinimumLoadingTime
- [ ] All 9 duplicate tests removed from legacy location
- [ ] All hook tests use correct import paths (@/webview-ui/ and ../../../utils/react-test-utils)
- [ ] TypeScript compiler succeeds (`npx tsc --noEmit`)
- [ ] React tests use jsdom environment (verify via test output)
- [ ] Git history preserved for all moved files (`git log --follow` shows history)
- [ ] Coverage maintained at 80%+ (verify via coverage report)
- [ ] Single atomic commit with descriptive message
- [ ] No console.log or debugger statements introduced
- [ ] No broken imports or path resolution errors

---

## Dependencies

**Files This Step Depends On:**
- tests/webviews/hooks/*.test.ts (12 files: 9 duplicates to remove, 3 unique to move)
- tests/webview-ui/shared/hooks/*.test.ts (9 existing canonical files)
- tests/utils/react-test-utils.tsx (imported by all hook tests)
- jest.config.js (React project testMatch patterns)
- tsconfig.json (path aliases configuration)
- webview-ui/src/shared/hooks/*.ts (12 hook implementations)

**Files This Step Modifies:**
- 3 test files moved from tests/webviews/hooks/ to tests/webview-ui/shared/hooks/
- 9 duplicate test files deleted
- 2 directories deleted (tests/webviews/hooks/, tests/webviews/)
- tests/ directory structure (2 obsolete directories removed)

**Files This Step Does NOT Modify:**
- jest.config.js (no changes needed - existing patterns work)
- tsconfig.json (no changes needed - path aliases already configured)
- tests/utils/react-test-utils.tsx (utility file location unchanged)
- Any source files in webview-ui/src/ (pure test consolidation)
- Any canonical tests in tests/webview-ui/shared/hooks/ (kept as-is)

**Subsequent Steps That Depend on This:**
- Step 5: Clean up test structure and update documentation
- Step 6: Update Jest config (integrates all migration steps)
- Step 7: Final validation and documentation (references consolidated structure)

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

# Verify tests/webviews/hooks/ structure restored
ls -R tests/webviews/hooks/  # Should show 12 test files
ls tests/webview-ui/shared/hooks/ | wc -l  # Should show 9 files (pre-migration)
```

**Rollback After Commit:**
```bash
# Find commit hash for this step
git log --oneline | head -5

# Revert commit (preserves history)
git revert <commit-hash>

# OR reset to previous commit (destructive, loses commit)
git reset --hard HEAD~1

# Verify tests pass
npm test

# Verify original structure restored
ls -R tests/webviews/hooks/  # Should show 12 test files
ls tests/webview-ui/shared/hooks/ | wc -l  # Should show 9 files
```

**Partial Rollback (Fix Specific Issues):**
```bash
# Restore specific file from previous commit
git checkout HEAD~1 -- tests/webviews/hooks/useDebouncedLoading.test.ts

# Re-run tests to verify
npm test -- tests/webviews/hooks
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] tests/webviews/hooks/ directory exists with 12 test files
- [ ] tests/webview-ui/shared/hooks/ has 9 test files (pre-migration state)
- [ ] No broken imports or missing test files
- [ ] Test count: 100 files (unchanged, back to pre-consolidation state)

---

## Common Issues and Solutions

### Issue 1: Canonical Test Missing Unique Test Cases from Legacy

**Symptom:** Legacy test file has test cases not present in canonical version

**Cause:** Tests diverged over time, canonical version may not have all edge cases

**Solution:**
```bash
# Compare test files line-by-line
diff -u tests/webviews/hooks/useAsyncData.test.ts tests/webview-ui/shared/hooks/useAsyncData.test.ts

# Look for test cases (describe/it blocks) in legacy but not in canonical
grep "it(" tests/webviews/hooks/useAsyncData.test.ts
grep "it(" tests/webview-ui/shared/hooks/useAsyncData.test.ts

# If unique test cases found, manually copy them to canonical version
# Open canonical file in editor
# Add missing test cases from legacy file
# Re-run tests to verify
npm test -- tests/webview-ui/shared/hooks/useAsyncData.test.ts
```

### Issue 2: Import Path Errors After Moving Tests

**Symptom:** TypeScript errors like "Cannot find module '@/webview-ui/shared/hooks/useDebouncedLoading'"

**Cause:** Import path incorrect in moved test file

**Solution:**
```bash
# Check current import in failing test
grep -n "@/webview-ui" tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts

# Should be: import { useDebouncedLoading } from '@/webview-ui/shared/hooks/useDebouncedLoading';
# Fix if incorrect

# Check react-test-utils import depth
grep -n "react-test-utils" tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts

# Should be: import { ... } from '../../../utils/react-test-utils';
# (3 levels: hooks/ → shared/ → webview-ui/ → tests/)

# Re-run TypeScript compiler
npx tsc --noEmit
```

### Issue 3: Jest Uses Wrong Test Environment for Moved Tests

**Symptom:** Test failures with "ReferenceError: document is not defined"

**Cause:** Jest testMatch pattern doesn't recognize moved tests as React tests

**Solution:**
```bash
# Verify jest.config.js React project testMatch patterns
cat jest.config.js | grep -A 10 "projects"

# React project should match: '**/tests/webview-ui/**/*.test.ts*'
# This pattern should cover tests/webview-ui/shared/hooks/*.test.ts

# If pattern is too specific (e.g., only matches .tsx), update to include .ts:
# testMatch: [
#   '**/tests/webview-ui/**/*.test.ts',
#   '**/tests/webview-ui/**/*.test.tsx'
# ]

# Re-run tests
npm test -- tests/webview-ui/shared/hooks
```

### Issue 4: Git History Not Showing for Moved Tests

**Symptom:** `git log --follow` doesn't show commits before move

**Cause:** Didn't use git mv, or git needs --follow flag

**Solution:**
```bash
# Always use --follow flag to see history across renames
git log --follow tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts

# Should show commits from when file was in tests/webviews/hooks/

# If no history shown, verify git mv was used:
git show HEAD  # Check commit details

# Look for "rename from" and "rename to" in diff
# If shows "delete" and "new file", history was lost

# If history lost and caught early:
git reset HEAD~1  # Undo commit
# Redo migration with git mv commands from Phase 4
```

### Issue 5: Tests Fail After Consolidation

**Symptom:** Hook tests fail with import or execution errors

**Cause:** Import paths incorrect, or moved tests incompatible with canonical location

**Solution:**
```bash
# Run specific failing test with verbose output
npm test -- tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts --verbose

# Check for specific error:
# - Import errors: Fix import paths (see Issue 2)
# - Environment errors: Fix Jest config (see Issue 3)
# - Test assertion errors: Review test case logic, may need update

# If test logic needs update:
# Open test file, review failing assertion
# Compare with other passing hook tests for patterns
# Update test case to match canonical patterns
# Re-run test
```

### Issue 6: Duplicate Test Actually Has Unique Coverage

**Symptom:** After removing duplicates, coverage drops

**Cause:** Legacy test had unique test cases not in canonical version

**Solution:**
```bash
# Before deletion, thoroughly compare test files:
diff -u tests/webviews/hooks/useAsyncData.test.ts tests/webview-ui/shared/hooks/useAsyncData.test.ts > /tmp/useAsyncData.diff

# Review diff carefully for unique test cases
cat /tmp/useAsyncData.diff | less

# Extract unique test case descriptions
grep "it('.*')" /tmp/useAsyncData.diff

# If unique test cases found:
# 1. Restore legacy file: git checkout HEAD -- tests/webviews/hooks/useAsyncData.test.ts
# 2. Copy unique test cases to canonical version
# 3. Run tests to verify
# 4. Then proceed with deletion
```

---

## Cross-References

**Related Plan Sections:**
- overview.md: Overall test reorganization strategy
- overview.md Risk Assessment: Duplicate test consolidation conflicts, import resolution failures
- Step 1: Utils test migration (established git mv pattern)
- Step 2: Command handler migration (established feature colocation pattern)
- Step 3: Webview component tests migration (removed tests/webviews/components/)
- Step 5: Remaining cleanup and structure verification (builds on this consolidation)
- Step 6: Jest config update (integrates all migration steps)

**Related Documentation:**
- jest.config.js: React project testMatch patterns and path aliases
- tsconfig.json: Path alias configuration for @/webview-ui/
- tests/utils/react-test-utils.tsx: Shared React testing utilities
- webview-ui/src/shared/hooks/CLAUDE.md: Hook documentation and usage patterns

**Related Source Files:**
- webview-ui/src/shared/hooks/*.ts (12 hook implementations, all now have canonical tests)
- tests/webview-ui/shared/hooks/*.test.ts (canonical test location for all hooks)

---

## Verification Commands Summary

**Quick validation checklist:**

```bash
# 1. Pre-consolidation validation
npm test && npx tsc --noEmit && git status
find tests -name "*.test.ts*" | wc -l  # Should show 100

# 2. Post-consolidation validation
find tests -name "*.test.ts*" | wc -l  # Should show 91
npm test  # Should pass all tests
npx tsc --noEmit  # Should have no errors

# 3. Verify directory structure
ls -R tests/webview-ui/shared/hooks/  # Should show 12 test files
ls tests/webviews/ 2>&1 | grep "No such file or directory"  # Should be deleted

# 4. Verify hook test count
ls tests/webview-ui/shared/hooks/ | wc -l  # Should show 12

# 5. Verify moved tests exist
ls tests/webview-ui/shared/hooks/ | grep -E "(useDebouncedLoading|useDebouncedValue|useMinimumLoadingTime)"

# 6. Verify git history preserved for moved tests
git log --follow tests/webview-ui/shared/hooks/useDebouncedLoading.test.ts
git log --follow tests/webview-ui/shared/hooks/useDebouncedValue.test.ts
git log --follow tests/webview-ui/shared/hooks/useMinimumLoadingTime.test.ts

# 7. Verify all hook tests pass
npm test -- tests/webview-ui/shared/hooks

# 8. Verify React tests use jsdom environment
npm test -- --selectProjects react  # Should run React tests only

# 9. Verify test count breakdown
npm test -- --selectProjects react --listTests | wc -l  # React tests
npm test -- --selectProjects node --listTests | wc -l   # Node tests
```

---

_Step 4 implementation ready for TDD execution_
_Previous Step: Step 3 - Migrate webview component tests (completed)_
_Next Step: Step 5 - Clean up test structure and documentation (step-05.md)_
