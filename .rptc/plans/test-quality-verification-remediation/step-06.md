# Step 6: Final Cleanup Verification (Manual Checklist)

## Status Tracking

- [x] Planned
- [ ] In Progress
- [ ] Complete

**Step:** 6 of 6 (FINAL STEP)
**Estimated Time:** 4-6 hours
**Prerequisites:** Steps 1-5 MUST be complete

---

## Overview

**Purpose:** Ensure absolute zero dead code, orphaned files, and unused test artifacts remain in the codebase before marking the test quality remediation plan complete.

**Critical User Requirement:** "I want to be SURE to delete all unused files and folders before marking this complete" - This step is the comprehensive verification checklist that ensures nothing is left behind from the refactoring work in Steps 1-4.

**Approach:** Manual verification using existing tools (grep, find, madge, Jest). This is a VERIFICATION step, not new work—all cleanup should have happened during Steps 1-4. This step answers definitively: "Are we absolutely certain no dead code remains?"

**Philosophy:** YAGNI principle - no automation for one-time cleanup. Use manual checklist with reproducible commands for thorough verification.

**What This Step Accomplishes:**
- Verifies 100% of test files have corresponding implementation
- Confirms NO dead imports pointing to non-existent files
- Identifies and removes any orphaned test directories
- Removes migration artifacts (backup files, temp files, old patterns)
- Ensures no debug code (console.log, debugger) in test files
- Final test suite verification (all passing, coverage ≥85%)
- Confirms no circular dependencies remain
- Validates no TODO/FIXME comments in test code

**Why This Step Matters:**
- Clean codebase = easier maintenance
- Prevents confusion from dead code
- Ensures test suite accurately reflects implementation
- No false positives from unused tests
- Professional code quality before completion

---

## Test Strategy

### Testing Approach

**Framework:** Jest with ts-jest, @testing-library/react (existing test suite)
**Coverage Goal:** Maintain ≥85% coverage (no regression)
**Test Type:** Verification only - run existing test suite to confirm nothing broken

### Test Scenarios

**Verification Tests:**

- [ ] **Test:** Full test suite passes after cleanup
  - **Given:** All cleanup verification steps completed
  - **When:** Run `npm test`
  - **Then:** All tests pass, no failures, no skipped tests
  - **File:** All existing test files

- [ ] **Test:** Coverage maintained at ≥85%
  - **Given:** All cleanup verification steps completed
  - **When:** Run `npm test -- --coverage`
  - **Then:** Overall coverage ≥85%, no regression from baseline
  - **File:** Coverage report generated

**Note:** This is a verification step—tests should already be passing from previous steps. Any failures indicate issues introduced during Steps 1-5 that must be fixed.

---

## Implementation Steps

### Phase 1: Test File Verification

**Purpose:** Ensure every test file has a corresponding implementation file (no orphaned tests).

**Steps:**

1. **List all test files**

   ```bash
   # List all .test.ts files
   find tests/ -name "*.test.ts" -type f | sort > /tmp/test-files-ts.txt

   # List all .test.tsx files
   find tests/ -name "*.test.tsx" -type f | sort > /tmp/test-files-tsx.txt

   # Display combined list
   cat /tmp/test-files-ts.txt /tmp/test-files-tsx.txt
   ```

2. **For each test file, verify corresponding implementation exists**

   **Manual Checklist:**

   - [ ] Review `/tmp/test-files-ts.txt` - for each file, check corresponding `src/` file exists
   - [ ] Review `/tmp/test-files-tsx.txt` - for each file, check corresponding `src/` file exists
   - [ ] Note any test files WITHOUT corresponding implementation in `/tmp/orphaned-tests.txt`

   **Example verification:**
   ```bash
   # For test file: tests/unit/utils/progressUnifier.test.ts
   # Check: src/utils/progressUnifier.ts exists
   ls -la src/utils/progressUnifier.ts

   # For test file: tests/webview-ui/shared/components/layout/GridLayout.test.tsx
   # Check: src/webviews/shared/components/layout/GridLayout.tsx exists
   ls -la src/webviews/shared/components/layout/GridLayout.tsx
   ```

3. **Delete orphaned test files (if any found)**

   - [ ] Review `/tmp/orphaned-tests.txt` (should be empty if Steps 1-4 done properly)
   - [ ] If any orphaned tests exist, delete them:
     ```bash
     # Example (replace with actual orphaned file paths)
     # rm tests/path/to/orphaned.test.ts
     ```
   - [ ] Document deleted files in Progress Tracking section below

**Expected Outcome:** 100% of test files have corresponding implementation, 0 orphaned test files.

---

### Phase 2: Dead Import Detection

**Purpose:** Find and remove imports pointing to non-existent files (broken dependencies).

**Steps:**

1. **Search for all imports in test files**

   ```bash
   # Find all imports from src/ in test files
   grep -r "from ['\"].*src/" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/test-imports.txt

   # Display imports
   cat /tmp/test-imports.txt
   ```

2. **Verify each import path exists**

   **Manual Checklist:**

   - [ ] Review `/tmp/test-imports.txt` - for each import, verify file exists
   - [ ] Check for common dead import patterns:
     - [ ] Imports using old file names (pre-refactoring)
     - [ ] Imports to deleted utility files
     - [ ] Imports to moved files (check for path changes)
   - [ ] Note any dead imports in `/tmp/dead-imports.txt`

   **Example verification:**
   ```bash
   # For import: from '@/shared/communication/WebviewCommunicationManager'
   # Check: src/shared/communication/WebviewCommunicationManager.ts exists
   ls -la src/shared/communication/WebviewCommunicationManager.ts

   # For import: from '@/utils/oldHelpers'
   # Check: src/utils/oldHelpers.ts exists (may be dead if file deleted)
   ls -la src/utils/oldHelpers.ts
   ```

3. **Fix dead imports**

   - [ ] Review `/tmp/dead-imports.txt` (should be empty if Steps 1-4 done properly)
   - [ ] If any dead imports found, either:
     - Fix import path to correct location
     - Remove import if no longer needed
     - Delete test file if implementation deleted
   - [ ] Document fixes in Progress Tracking section below

**Expected Outcome:** 0 dead imports in test files, all imports resolve to existing files.

---

### Phase 3: Orphaned Directory Detection

**Purpose:** Find and remove empty test directories or directories containing only dead files.

**Steps:**

1. **Find empty test directories**

   ```bash
   # Find empty directories in tests/
   find tests/ -type d -empty > /tmp/empty-test-dirs.txt

   # Display empty directories
   cat /tmp/empty-test-dirs.txt
   ```

2. **Find directories with only dead files**

   **Manual Checklist:**

   - [ ] Review test directory structure:
     ```bash
     tree tests/ -d -L 3
     ```
   - [ ] For each directory, check if all files are dead (no corresponding implementation)
   - [ ] Common patterns to check:
     - [ ] Old feature directories (e.g., `tests/old-ui/`)
     - [ ] Backup directories (e.g., `tests/backup/`)
     - [ ] Migration directories (e.g., `tests/migration-temp/`)
   - [ ] Note orphaned directories in `/tmp/orphaned-dirs.txt`

3. **Delete empty and orphaned directories**

   - [ ] Review `/tmp/empty-test-dirs.txt` and `/tmp/orphaned-dirs.txt`
   - [ ] Delete empty directories:
     ```bash
     # Example (replace with actual paths)
     # rmdir tests/empty/directory/path
     ```
   - [ ] Delete orphaned directories:
     ```bash
     # Example (replace with actual paths)
     # rm -rf tests/orphaned/directory/path
     ```
   - [ ] Document deletions in Progress Tracking section below

**Expected Outcome:** 0 empty directories, 0 orphaned directories in `tests/`.

---

### Phase 4: Migration Artifact Cleanup

**Purpose:** Remove temporary files, backups, and other artifacts from refactoring work.

**Steps:**

1. **Search for backup files**

   ```bash
   # Find backup files (common patterns)
   find tests/ -name "*.backup" -o -name "*.bak" -o -name "*.old" -o -name "*~" | sort > /tmp/backup-files.txt

   # Display backup files
   cat /tmp/backup-files.txt
   ```

2. **Search for temporary files**

   ```bash
   # Find temp files (common patterns)
   find tests/ -name "*.tmp" -o -name "*.temp" -o -name ".DS_Store" | sort > /tmp/temp-files.txt

   # Display temp files
   cat /tmp/temp-files.txt
   ```

3. **Search for migration-specific files**

   **Manual Checklist:**

   - [ ] Check for files with "migration" in name:
     ```bash
     find tests/ -iname "*migration*" | sort
     ```
   - [ ] Check for files with "old" in name:
     ```bash
     find tests/ -iname "*old*" | sort
     ```
   - [ ] Check for numbered backup versions:
     ```bash
     find tests/ -regex ".*\.[0-9]+\.test\.tsx?" | sort
     ```
   - [ ] Note migration artifacts in `/tmp/migration-artifacts.txt`

4. **Delete all artifacts**

   - [ ] Review `/tmp/backup-files.txt`, `/tmp/temp-files.txt`, `/tmp/migration-artifacts.txt`
   - [ ] Delete all artifacts:
     ```bash
     # Backup files
     cat /tmp/backup-files.txt | xargs rm -f

     # Temp files
     cat /tmp/temp-files.txt | xargs rm -f

     # Migration artifacts (manual deletion, verify each)
     # rm tests/path/to/migration-artifact.test.ts
     ```
   - [ ] Document deletions in Progress Tracking section below

**Expected Outcome:** 0 backup files, 0 temp files, 0 migration artifacts in `tests/`.

---

### Phase 5: Debug Code Detection

**Purpose:** Ensure no debug code (console.log, debugger) remains in test files.

**Steps:**

1. **Search for console.log statements**

   ```bash
   # Find console.log in test files
   grep -rn "console\.log" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/console-logs.txt

   # Display results
   cat /tmp/console-logs.txt
   ```

2. **Search for debugger statements**

   ```bash
   # Find debugger in test files
   grep -rn "debugger" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/debuggers.txt

   # Display results
   cat /tmp/debuggers.txt
   ```

3. **Search for other debug patterns**

   ```bash
   # Find console.error, console.warn, console.debug
   grep -rn "console\.\(error\|warn\|debug\|info\)" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/other-console.txt

   # Display results
   cat /tmp/other-console.txt
   ```

4. **Remove debug code**

   **Manual Checklist:**

   - [ ] Review `/tmp/console-logs.txt` - remove all console.log statements
   - [ ] Review `/tmp/debuggers.txt` - remove all debugger statements
   - [ ] Review `/tmp/other-console.txt` - remove console.error/warn/debug UNLESS part of test expectations
   - [ ] Exception: Keep console statements that are part of test assertions (e.g., testing error logging)
   - [ ] Document removals in Progress Tracking section below

**Expected Outcome:** 0 debug code in test files (except legitimate test assertions).

---

### Phase 6: Test Suite Verification

**Purpose:** Verify all tests pass and coverage is maintained after cleanup.

**Steps:**

1. **Run full test suite**

   ```bash
   # Run all tests
   npm test
   ```

   **Manual Checklist:**

   - [ ] All tests pass (0 failures)
   - [ ] No skipped tests (0 skipped)
   - [ ] No error messages in output
   - [ ] Test execution time reasonable (not significantly increased)

2. **Run coverage report**

   ```bash
   # Run tests with coverage
   npm test -- --coverage
   ```

   **Manual Checklist:**

   - [ ] Overall coverage ≥85% (check coverage summary)
   - [ ] No significant coverage regression from baseline
   - [ ] Critical paths have 100% coverage (verify in coverage report)
   - [ ] Coverage report generates successfully

3. **Verify no test warnings**

   **Manual Checklist:**

   - [ ] No deprecation warnings in test output
   - [ ] No unhandled promise rejections
   - [ ] No React warnings (act(), useEffect, etc.)
   - [ ] No import resolution warnings

**Expected Outcome:** All tests pass, coverage ≥85%, no warnings.

---

### Phase 7: TODO/FIXME Comment Verification

**Purpose:** Ensure no incomplete work remains in test code.

**Steps:**

1. **Search for TODO comments**

   ```bash
   # Find TODO comments in test files
   grep -rn "TODO\|todo" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/todos.txt

   # Display results
   cat /tmp/todos.txt
   ```

2. **Search for FIXME comments**

   ```bash
   # Find FIXME comments in test files
   grep -rn "FIXME\|fixme" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/fixmes.txt

   # Display results
   cat /tmp/fixmes.txt
   ```

3. **Search for other incomplete markers**

   ```bash
   # Find HACK, XXX, TEMP markers
   grep -rn "HACK\|XXX\|TEMP\|WIP" tests/ --include="*.test.ts" --include="*.test.tsx" | grep -v "node_modules" > /tmp/other-markers.txt

   # Display results
   cat /tmp/other-markers.txt
   ```

4. **Resolve all incomplete markers**

   **Manual Checklist:**

   - [ ] Review `/tmp/todos.txt` - complete TODO items or remove comments
   - [ ] Review `/tmp/fixmes.txt` - fix FIXME issues or remove comments
   - [ ] Review `/tmp/other-markers.txt` - resolve or remove markers
   - [ ] Exception: Keep comments documenting known issues with linked GitHub issues
   - [ ] Document resolutions in Progress Tracking section below

**Expected Outcome:** 0 TODO/FIXME/HACK comments in test code (or all linked to tracked issues).

---

### Phase 8: Unused Test Utility Detection

**Purpose:** Find and remove test helper functions/utilities that are no longer used.

**Steps:**

1. **List all test utility files**

   ```bash
   # Common test utility locations
   find tests/ -path "*/helpers/*" -o -path "*/utils/*" -o -path "*/mocks/*" -o -path "*/fixtures/*" | grep -E "\.(ts|tsx)$" > /tmp/test-utils.txt

   # Display test utilities
   cat /tmp/test-utils.txt
   ```

2. **For each utility, check if it's imported anywhere**

   **Manual Checklist:**

   - [ ] Review `/tmp/test-utils.txt` - for each utility file, search for imports:
     ```bash
     # Example: Check if helpers/testHelper.ts is used
     grep -r "from.*testHelper" tests/ --include="*.test.ts" --include="*.test.tsx"
     ```
   - [ ] Common utility patterns to check:
     - [ ] Mock factories (e.g., `createMockUser()`)
     - [ ] Test data fixtures (e.g., `mockUserData.ts`)
     - [ ] Test helpers (e.g., `renderWithProviders()`)
     - [ ] Custom matchers (e.g., `toHaveErrorMessage()`)
   - [ ] Note unused utilities in `/tmp/unused-utils.txt`

3. **Delete unused utilities**

   - [ ] Review `/tmp/unused-utils.txt`
   - [ ] Delete unused utility files:
     ```bash
     # Example (replace with actual paths)
     # rm tests/helpers/unusedHelper.ts
     ```
   - [ ] Document deletions in Progress Tracking section below

**Expected Outcome:** 0 unused test utility files, all utilities have ≥1 import.

---

### Phase 9: Circular Dependency Verification

**Purpose:** Ensure no circular dependencies exist in test code (final madge check).

**Steps:**

1. **Run madge circular dependency check**

   ```bash
   # Check for circular dependencies in test files
   npx madge --circular --extensions ts,tsx tests/
   ```

   **Manual Checklist:**

   - [ ] No circular dependencies found (madge output clean)
   - [ ] If circular dependencies found, review and fix:
     - Move shared code to common utility
     - Break dependency chain via dependency injection
     - Restructure test files to remove circular imports
   - [ ] Document fixes in Progress Tracking section below

2. **Run madge on entire codebase (final verification)**

   ```bash
   # Check for circular dependencies in entire codebase
   npx madge --circular --extensions ts,tsx src/
   ```

   **Manual Checklist:**

   - [ ] No circular dependencies found in src/ (madge output clean)
   - [ ] If circular dependencies found, document as separate issue (out of scope for test quality plan)

**Expected Outcome:** 0 circular dependencies in tests, 0 new circular dependencies in src.

---

### Phase 10: Final Verification Checklist

**Purpose:** Complete final checklist before marking plan complete.

**Final Checklist:**

- [ ] **Test File Verification:** 100% of test files have corresponding implementation (Phase 1)
- [ ] **Dead Imports:** 0 dead imports in test files (Phase 2)
- [ ] **Orphaned Directories:** 0 empty or orphaned test directories (Phase 3)
- [ ] **Migration Artifacts:** 0 backup, temp, or migration files in tests/ (Phase 4)
- [ ] **Debug Code:** 0 console.log/debugger in test files (Phase 5)
- [ ] **Test Suite:** All tests passing, coverage ≥85% (Phase 6)
- [ ] **TODO Comments:** 0 unresolved TODO/FIXME in test files (Phase 7)
- [ ] **Unused Utilities:** 0 unused test helper/utility files (Phase 8)
- [ ] **Circular Dependencies:** 0 circular dependencies in tests (Phase 9)
- [ ] **Documentation:** All deletions/fixes documented in Progress Tracking below

**If ALL checklist items verified:** Mark Step 6 Complete, proceed to plan completion.

**If ANY checklist item fails:** Resolve issue before marking complete. Document resolution in Progress Tracking.

---

## Acceptance Criteria

**Definition of Done:**

- [ ] All 10 verification phases completed successfully
- [ ] All manual checklist items verified
- [ ] All cleanup commands executed and results documented
- [ ] 0 dead code remaining in test suite (verified via checklist)
- [ ] Full test suite passing with ≥85% coverage
- [ ] No orphaned files, directories, or artifacts
- [ ] Progress Tracking section updated with all findings

**Success Metrics:**

- **Test Files:** 100% have corresponding implementation
- **Dead Imports:** 0 found
- **Orphaned Directories:** 0 found
- **Migration Artifacts:** 0 found
- **Debug Code:** 0 found (except legitimate test assertions)
- **TODO/FIXME:** 0 unresolved
- **Unused Utilities:** 0 found
- **Circular Dependencies:** 0 found
- **Test Suite:** 100% passing
- **Coverage:** ≥85% maintained

---

## Progress Tracking

**Status:** Planned

**Completion Notes:** (Update during implementation)

### Phase 1: Test File Verification
- **Status:** Not started
- **Orphaned Tests Found:** TBD
- **Deletions:** TBD

### Phase 2: Dead Import Detection
- **Status:** Not started
- **Dead Imports Found:** TBD
- **Fixes:** TBD

### Phase 3: Orphaned Directory Detection
- **Status:** Not started
- **Orphaned Directories Found:** TBD
- **Deletions:** TBD

### Phase 4: Migration Artifact Cleanup
- **Status:** Not started
- **Artifacts Found:** TBD
- **Deletions:** TBD

### Phase 5: Debug Code Detection
- **Status:** Not started
- **Debug Code Found:** TBD
- **Removals:** TBD

### Phase 6: Test Suite Verification
- **Status:** Not started
- **Tests Passing:** TBD
- **Coverage:** TBD
- **Issues Found:** TBD

### Phase 7: TODO/FIXME Verification
- **Status:** Not started
- **TODOs Found:** TBD
- **FIXMEs Found:** TBD
- **Resolutions:** TBD

### Phase 8: Unused Utility Detection
- **Status:** Not started
- **Unused Utilities Found:** TBD
- **Deletions:** TBD

### Phase 9: Circular Dependency Verification
- **Status:** Not started
- **Circular Dependencies Found:** TBD
- **Fixes:** TBD

### Phase 10: Final Verification
- **Status:** Not started
- **Final Checklist Completion:** TBD
- **Plan Completion Approved:** TBD

---

## Integration Notes

**Tools Used:**

- `find` - File and directory discovery
- `grep` - Pattern matching for imports, debug code, comments
- `madge` - Circular dependency detection
- `npm test` - Jest test execution
- `tree` - Directory structure visualization (optional)

**Existing Infrastructure:**

- Jest configuration (`jest.config.js`)
- TypeScript path aliases (`tsconfig.json`)
- Test coverage settings (Jest config)

**No New Dependencies:** This step uses only existing tools and commands.

**Performance:** Verification steps are manual and may take 4-6 hours due to thorough checking. This is acceptable for one-time cleanup verification.

---

## Next Steps After Completion

**When Step 6 is marked Complete:**

1. **Update Plan Overview:** Mark plan as Complete in `overview.md`
2. **Generate Completion Report:** Run Step 5 completion report generation (if not already done)
3. **Move Plan to Complete:** Move entire plan directory to `.rptc/complete/test-quality-verification-remediation/`
4. **Final Verification:** Ensure all acceptance criteria in `overview.md` are met
5. **Quality Gates:** Execute Efficiency Agent review (if enabled)
6. **Quality Gates:** Execute Security Agent review (if enabled)
7. **Commit Changes:** Commit all cleanup changes with descriptive message
8. **Celebrate:** Test quality improved from 5.5/10 to 8+/10!

---

## Important Reminders

**User Emphasis:** "I want to be SURE to delete all unused files and folders before marking this complete"

**Thoroughness Over Speed:** Take the time to verify each checklist item carefully. Missing dead code defeats the purpose of this step.

**Document Everything:** Update Progress Tracking section with all findings, even if "0 found" (proves verification was done).

**When in Doubt, Verify:** If unsure whether a file is dead, check git history and recent usage before deleting.

**This is the FINAL step:** After completion, plan is marked complete. Ensure absolute certainty before marking done.

---

_Step 6 created by Master Feature Planner_
_Status: Ready for TDD Implementation_
_Blocks: Plan Completion (this must be final step)_
