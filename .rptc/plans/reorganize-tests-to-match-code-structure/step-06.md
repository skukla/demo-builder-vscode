# Step 6: Update Jest Configuration for New Test Structure

## Step Overview

**Purpose:** Update jest.config.js to remove obsolete test path patterns and verify all tests in the reorganized structure are discovered correctly. This step ensures Jest configuration aligns with the new test organization after Steps 1-5 removed legacy directories.

**What This Accomplishes:**
- Removes obsolete `tests/webviews/**/*.test.ts*` patterns from React project (directory deleted in Step 4)
- Verifies Jest discovers all 91 test files in their new locations
- Confirms Node and React project separation still works correctly
- Validates test count matches expected (91 files after duplicate removal in Step 4)
- Documents pattern changes for future reference

**Files Affected:** jest.config.js (1 file modified)

**Estimated Time:** 30 minutes

---

## Prerequisites

- [ ] Step 1 completed (core infrastructure tests migrated to tests/core/)
- [ ] Step 2 completed (feature handler tests migrated to tests/features/*/handlers/)
- [ ] Step 3 completed (webview component tests migrated to tests/webview-ui/)
- [ ] Step 4 completed (duplicate hook tests consolidated, tests/webviews/ directory removed)
- [ ] Step 5 completed (missing core test directories created)
- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)

---

## Test Strategy

### Approach for Jest Configuration Update

**Test Philosophy:** Jest configuration changes should be verified incrementally to ensure no tests are accidentally excluded. This step focuses on validation rather than implementation (no new tests written).

### Validation Scenarios

#### Happy Path: Jest Config Updated Successfully

**Scenario 1: Remove Obsolete Webviews Pattern**
- [ ] **Test:** Verify obsolete pattern removal doesn't affect test discovery
  - **Given:** jest.config.js React project includes `**/tests/webviews/**/*.test.ts*` patterns
  - **When:** Removing both patterns (lines 46-47) since tests/webviews/ no longer exists
  - **Then:** Test discovery unchanged (tests/webview-ui/ patterns still match all React tests)
  - **Verification:** `npm test -- --selectProjects react --listTests | wc -l` shows expected React test count

**Scenario 2: Verify All Tests Discovered**
- [ ] **Test:** Confirm Jest finds all 91 test files after config update
  - **Given:** Test reorganization complete (Steps 1-5), 91 test files expected
  - **When:** Running `npm test -- --listTests` after pattern cleanup
  - **Then:** Jest discovers exactly 91 test files (no tests missed or duplicated)
  - **Verification:** Test count matches expected, all test paths use new locations

**Scenario 3: Node Project Tests Unaffected**
- [ ] **Test:** Verify Node project test discovery unchanged
  - **Given:** Node project testMatch patterns exclude webview tests via negation patterns
  - **When:** React project patterns updated
  - **Then:** Node project still discovers all non-React tests correctly
  - **Verification:** `npm test -- --selectProjects node --listTests` shows expected Node test count

**Scenario 4: React Project Tests All Found**
- [ ] **Test:** Verify React project discovers all webview-ui tests
  - **Given:** React project testMatch includes `**/tests/webview-ui/**/*.test.ts*`
  - **When:** Obsolete patterns removed
  - **Then:** All React tests in tests/webview-ui/ discovered correctly
  - **Verification:** `npm test -- --selectProjects react --listTests` includes all hook and component tests

**Scenario 5: Full Test Suite Passes**
- [ ] **Test:** Confirm all tests execute successfully after config update
  - **Given:** jest.config.js updated with cleaned patterns
  - **When:** Running `npm test` (both Node and React projects)
  - **Then:** All 91 tests pass, no failures introduced by config changes
  - **Verification:** npm test exits with code 0, no test execution errors

#### Edge Cases: Pattern Matching and Test Discovery

**Edge Case 1: Tests in New Locations Discovered**
- [ ] **Test:** Verify tests migrated in Steps 1-3 are discovered
  - **Given:** Tests moved from tests/utils/ to tests/core/*, tests/commands/handlers/ to tests/features/*/handlers/
  - **When:** Running test discovery with updated config
  - **Then:** All migrated tests discovered in new locations
  - **Verification:** `npm test -- --listTests | grep -E "(tests/core|tests/features)"` shows migrated tests

**Edge Case 2: Tests in tests/webview-ui/ Matched Correctly**
- [ ] **Test:** Ensure webview-ui pattern matches both .ts and .tsx tests
  - **Given:** React project testMatch includes `**/tests/webview-ui/**/*.test.ts` and `.test.tsx`
  - **When:** Running React project test discovery
  - **Then:** Both .ts (hook tests) and .tsx (component tests) discovered
  - **Verification:** Test list includes useAsyncData.test.ts and GridLayout.test.tsx

**Edge Case 3: No Duplicate Test Discovery**
- [ ] **Test:** Verify no tests discovered by both Node and React projects
  - **Given:** Node project excludes webview-ui tests, React project only includes webview-ui tests
  - **When:** Running both projects
  - **Then:** No test file appears in both project outputs
  - **Verification:** Compare Node and React test lists, intersection is empty

**Edge Case 4: New Core Test Directories (Step 5) Handled**
- [ ] **Test:** Ensure README.md files in new directories don't confuse Jest
  - **Given:** tests/core/base/, tests/core/config/, etc. contain only README.md files
  - **When:** Running test discovery
  - **Then:** Jest ignores README.md files, no test execution errors
  - **Verification:** No "no tests found" warnings, README.md not treated as test file

#### Error Conditions: Configuration Errors and Missing Tests

**Error Condition 1: Pattern Too Restrictive**
- [ ] **Test:** Detect if updated patterns exclude valid tests
  - **Given:** Modified testMatch patterns in jest.config.js
  - **When:** Test count drops below 91 after config update
  - **Then:** Investigation reveals excluded tests
  - **Recovery:** Adjust patterns to include all test directories, re-verify count
  - **Verification:** Test count returns to 91

**Error Condition 2: Jest Syntax Error in Config**
- [ ] **Test:** Detect syntax errors in jest.config.js
  - **Given:** Editing testMatch array
  - **When:** Running npm test
  - **Then:** Clear error message indicating config syntax issue
  - **Recovery:** Fix syntax error (missing comma, bracket mismatch), re-run tests
  - **Verification:** npm test executes without config errors

**Error Condition 3: Tests Run in Wrong Environment**
- [ ] **Test:** Verify React tests don't run in Node environment
  - **Given:** Pattern changes might affect project categorization
  - **When:** Running tests
  - **Then:** React tests (useAsyncData, etc.) run in jsdom environment, not node
  - **Recovery:** Verify React project testMatch patterns still match webview-ui tests
  - **Verification:** No "document is not defined" errors in React tests

---

## Implementation Details

### Phase 1: Pre-Update Validation

**Verify Current State and Test Discovery**

Run these commands to understand current Jest configuration state:

```bash
# Verify Steps 1-5 completed
echo "=== Verify previous steps completed ==="
ls tests/core/ | grep -E "communication|state|shell"  # Step 1 result
ls tests/features/lifecycle/handlers/ 2>&1 | grep "test.ts"  # Step 2 result
ls tests/webview-ui/shared/components/ 2>&1 | grep "test.tsx"  # Step 3 result
ls tests/webview-ui/shared/hooks/ | wc -l  # Step 4 result (should be 12)
ls tests/core/base/README.md 2>&1  # Step 5 result (structure created)

# Verify tests/webviews/ removed in Step 4
ls tests/webviews/ 2>&1 | grep "No such file or directory"

# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# Count current test files (should be 91 after Step 4)
echo ""
echo "=== Current test count (should be 91) ==="
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List tests Jest discovers before config update
echo ""
echo "=== Tests Jest discovers (current config) ==="
npm test -- --listTests | wc -l

# Verify Node project test discovery
echo ""
echo "=== Node project tests ==="
npm test -- --selectProjects node --listTests | wc -l

# Verify React project test discovery
echo ""
echo "=== React project tests ==="
npm test -- --selectProjects react --listTests | wc -l

# Check for obsolete patterns in jest.config.js
echo ""
echo "=== Current React project testMatch patterns ==="
grep -A 5 "displayName: 'react'" jest.config.js | grep -A 4 "testMatch"
```

**Expected Results:**
- tests/webviews/ does not exist (Step 4 cleanup verified)
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- Test count: 91 files (9 duplicates removed in Step 4)
- Jest discovers 91 tests via current config
- React project testMatch includes obsolete `**/tests/webviews/**/*.test.ts*` patterns (lines 46-47)
- Node project test count: ~76 files
- React project test count: ~15 files (12 hooks + components + layout tests)

### Phase 2: Analyze Jest Configuration

**Examine current jest.config.js patterns and identify obsolete entries:**

```bash
# Display complete jest.config.js for review
cat jest.config.js

# Focus on React project testMatch patterns
echo ""
echo "=== React project testMatch (lines 45-50) ==="
sed -n '45,50p' jest.config.js

# Expected output:
#   testMatch: [
#     '**/tests/webviews/**/*.test.ts',      ← OBSOLETE (directory removed in Step 4)
#     '**/tests/webviews/**/*.test.tsx',     ← OBSOLETE (directory removed in Step 4)
#     '**/tests/webview-ui/**/*.test.ts',    ← KEEP (matches hook tests)
#     '**/tests/webview-ui/**/*.test.tsx'    ← KEEP (matches component tests)
#   ],

# Verify what tests these patterns currently match
echo ""
echo "=== Tests matching obsolete webviews pattern (should be 0) ==="
npm test -- --selectProjects react --listTests | grep "tests/webviews/" | wc -l

echo ""
echo "=== Tests matching webview-ui pattern (should be ~15) ==="
npm test -- --selectProjects react --listTests | grep "tests/webview-ui/" | wc -l
```

**Expected Findings:**
- React project testMatch includes 4 patterns (lines 46-49)
- 2 patterns match obsolete `tests/webviews/` directory (no longer exists)
- 2 patterns match current `tests/webview-ui/` directory (active)
- Obsolete patterns match 0 tests (safe to remove)
- webview-ui patterns match all React tests (~15 files)

**Patterns to Remove:**
- Line 46: `'**/tests/webviews/**/*.test.ts'`
- Line 47: `'**/tests/webviews/**/*.test.tsx'`

**Patterns to Keep:**
- Line 48: `'**/tests/webview-ui/**/*.test.ts'` (matches hook tests)
- Line 49: `'**/tests/webview-ui/**/*.test.tsx'` (matches component tests)

### Phase 3: Update jest.config.js

**Remove obsolete test patterns from React project:**

**3A: Create Backup**
```bash
# Backup current config
cp jest.config.js jest.config.js.backup

# Verify backup
diff jest.config.js jest.config.js.backup
# Should show no differences
```

**3B: Update React Project testMatch**

Update jest.config.js lines 45-50 to remove obsolete patterns:

**Before (Current):**
```javascript
testMatch: [
  '**/tests/webviews/**/*.test.ts',
  '**/tests/webviews/**/*.test.tsx',
  '**/tests/webview-ui/**/*.test.ts',
  '**/tests/webview-ui/**/*.test.tsx'
],
```

**After (Updated):**
```javascript
testMatch: [
  '**/tests/webview-ui/**/*.test.ts',
  '**/tests/webview-ui/**/*.test.tsx'
],
```

**Implementation:**
```bash
# Option 1: Manual edit (recommended for precision)
# Open jest.config.js in editor
# Navigate to line 45 (React project testMatch)
# Remove lines 46-47 (obsolete webviews patterns)
# Save file

# Option 2: Automated sed (use with caution)
# Remove lines matching "tests/webviews" from jest.config.js
sed -i.bak "/'\*\*\/tests\/webviews\/\*\*\/\*\.test\.tsx\?',/d" jest.config.js

# Verify changes
diff jest.config.js.backup jest.config.js
```

**Expected Changes:**
- 2 lines removed from React project testMatch array (lines 46-47)
- testMatch array now contains only 2 patterns (webview-ui)
- No other configuration changes (Node project, coverage, etc. unchanged)

**3C: Verify Syntax**
```bash
# Verify jest.config.js syntax (should parse without errors)
node -c jest.config.js

# Expected output: (nothing - success)

# If syntax error, output will show line number and issue
# Common errors: missing comma, extra comma, bracket mismatch
```

**Expected Results:**
- jest.config.js parses successfully (node -c succeeds)
- No syntax errors introduced
- Only React project testMatch modified
- 2 obsolete patterns removed
- 2 active patterns remain

### Phase 4: Validate Test Discovery After Update

**Verify Jest discovers all tests correctly with updated config:**

```bash
# Verify test count unchanged (should still be 91)
echo "=== Test file count (should be 91) ==="
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# Verify Jest discovers all tests with new config
echo ""
echo "=== Tests Jest discovers (updated config, should be 91) ==="
npm test -- --listTests | wc -l

# Verify Node project test discovery unchanged
echo ""
echo "=== Node project tests (should be ~76) ==="
npm test -- --selectProjects node --listTests | wc -l

# Verify React project test discovery unchanged
echo ""
echo "=== React project tests (should be ~15) ==="
npm test -- --selectProjects react --listTests | wc -l

# List all React tests to verify they're in webview-ui/
echo ""
echo "=== React tests discovered (all should be in tests/webview-ui/) ==="
npm test -- --selectProjects react --listTests

# Verify no tests in tests/webviews/ (should be 0)
echo ""
echo "=== Tests in obsolete webviews directory (should be 0) ==="
npm test -- --listTests | grep "tests/webviews/" | wc -l

# Verify tests in webview-ui/ found (should be ~15)
echo ""
echo "=== Tests in webview-ui directory (should be ~15) ==="
npm test -- --listTests | grep "tests/webview-ui/" | wc -l

# Verify specific tests discovered (spot check)
echo ""
echo "=== Spot check: Hook tests discovered ==="
npm test -- --listTests | grep "useAsyncData.test.ts"
npm test -- --listTests | grep "useFocusTrap.test.ts"

echo ""
echo "=== Spot check: Component tests discovered ==="
npm test -- --listTests | grep "GridLayout.test.tsx"
npm test -- --listTests | grep "TwoColumnLayout.test.tsx"
```

**Expected Results:**
- Total test files: 91 (unchanged)
- Jest discovers: 91 tests (all tests found)
- Node project: ~76 tests
- React project: ~15 tests (hooks + components + layout)
- All React tests in tests/webview-ui/ path
- 0 tests in obsolete tests/webviews/ path
- Spot check tests all discovered (useAsyncData, GridLayout, etc.)
- No test discovery warnings or errors

**If Test Count Mismatch:**
1. Expected 91, but Jest discovers fewer → Patterns too restrictive, some tests excluded
2. Expected 91, but Jest discovers more → Duplicate discovery or unexpected matches
3. Investigate with: `npm test -- --listTests > discovered-tests.txt`
4. Compare with: `find tests -name "*.test.ts*" > all-test-files.txt`
5. Find missing: `comm -23 <(sort all-test-files.txt) <(sort discovered-tests.txt)`
6. Fix patterns to include all test directories

### Phase 5: Run Full Test Suite

**Execute all tests to verify no regressions from config update:**

```bash
# Run all tests (Node + React)
npm test

# Verify exit code (should be 0 - success)
echo $?

# Run tests with verbose output to verify environment assignment
echo ""
echo "=== Run React tests verbose (verify jsdom environment) ==="
npm test -- --selectProjects react --verbose

# Run tests with coverage to verify no gaps
echo ""
echo "=== Run tests with coverage ==="
npm test -- --coverage

# Verify coverage report generated
ls coverage/lcov-report/index.html
```

**Expected Results:**
- All 91 tests pass (no failures)
- npm test exits with code 0 (success)
- React tests run in jsdom environment (no "document is not defined" errors)
- Node tests run in node environment
- Coverage report generated successfully
- No warnings about missing tests or configuration issues

**If Tests Fail:**
1. Examine failure messages for specific errors
2. Common issue: React tests running in wrong environment
   - Solution: Verify React project testMatch includes webview-ui tests
3. Common issue: Import resolution failures
   - Solution: Check path aliases in jest.config.js moduleNameMapper
4. Common issue: Tests not discovered
   - Solution: Verify testMatch patterns include all test directories
5. Fix issues and re-run `npm test`

### Phase 6: Verify Project Separation

**Confirm Node and React projects properly separated:**

```bash
# Verify no test appears in both projects
echo "=== Node project tests ==="
npm test -- --selectProjects node --listTests > node-tests.txt

echo ""
echo "=== React project tests ==="
npm test -- --selectProjects react --listTests > react-tests.txt

echo ""
echo "=== Tests in both projects (should be 0) ==="
comm -12 <(sort node-tests.txt) <(sort react-tests.txt) | wc -l

# Verify Node project excludes webview-ui tests
echo ""
echo "=== webview-ui tests in Node project (should be 0) ==="
grep "webview-ui" node-tests.txt | wc -l

# Verify React project only includes webview-ui tests
echo ""
echo "=== Non-webview-ui tests in React project (should be 0) ==="
grep -v "webview-ui" react-tests.txt | wc -l

# Cleanup temp files
rm node-tests.txt react-tests.txt
```

**Expected Results:**
- 0 tests appear in both Node and React projects (proper separation)
- Node project: 0 webview-ui tests (all excluded via negation patterns)
- React project: 0 non-webview-ui tests (only includes webview-ui tests)
- Clean separation between Node and React test environments

**If Overlap Found:**
1. Check Node project negation patterns (lines 12-15)
   - Should exclude: `!**/tests/webview-ui/**/*.test.ts*`
2. Check React project testMatch patterns (lines 45-49 after update)
   - Should only include: `**/tests/webview-ui/**/*.test.ts*`
3. Verify no tests misplaced in wrong directories
4. Fix patterns and re-verify separation

### Phase 7: Document Configuration Changes

**Update jest.config.js with explanatory comment:**

Add comment above React project testMatch to document pattern cleanup:

```javascript
{
  displayName: 'react',
  testEnvironment: 'jsdom',
  // Updated in Step 6: Removed obsolete tests/webviews/** patterns
  // (directory removed in test reorganization Step 4)
  testMatch: [
    '**/tests/webview-ui/**/*.test.ts',
    '**/tests/webview-ui/**/*.test.tsx'
  ],
  // ... rest of config
}
```

**Implementation:**
```bash
# Add explanatory comment (manual edit)
# Open jest.config.js in editor
# Navigate to line 44 (before testMatch in React project)
# Add comment explaining pattern cleanup
# Save file

# Verify comment added
sed -n '42,50p' jest.config.js
```

**Expected Results:**
- Comment added above React project testMatch
- Comment explains obsolete pattern removal
- Comment references Step 4 (tests/webviews/ removal)
- Code self-documenting for future maintainers

### Phase 8: Commit Jest Configuration Update

**Create atomic commit for this configuration step:**

```bash
# Remove backup file
rm jest.config.js.backup

# Stage changes
git add jest.config.js

# Verify what will be committed
git diff --staged jest.config.js

# Expected changes:
# - 2 lines removed (obsolete webviews patterns)
# - ~3 lines added (explanatory comment)

# Create commit with descriptive message
git commit -m "test: update Jest config to remove obsolete test patterns (Step 6)

- Remove obsolete tests/webviews/**/*.test.ts* patterns from React project
  - Directory removed in Step 4 (duplicate hook tests consolidation)
  - Patterns matched 0 tests (safe to remove)
- Keep tests/webview-ui/**/*.test.ts* patterns (active)
  - Matches all React tests (hooks + components)
  - ~15 test files in webview-ui structure
- Add explanatory comment documenting pattern cleanup
- Verify all 91 tests still discovered correctly
- Verify Node/React project separation maintained

Jest configuration:
- Node project: ~76 tests (excludes webview-ui)
- React project: ~15 tests (only includes webview-ui)
- Total: 91 tests discovered and passing
- No duplicate discovery, no missing tests

Part of test reorganization plan (Step 6/7)"
```

**Expected Results:**
- Single atomic commit with configuration changes
- Commit message clearly describes pattern cleanup
- Git diff shows only jest.config.js changes (2 lines removed, comment added)
- Clean working directory after commit
- Tests passing in CI/CD (if applicable)

---

## Expected Outcome

**After Successful Completion:**

- [ ] **Jest Config Updated:** Obsolete `tests/webviews/**/*.test.ts*` patterns removed
- [ ] **Test Discovery:** All 91 tests discovered correctly by Jest
- [ ] **Node Project:** ~76 tests, excludes webview-ui tests
- [ ] **React Project:** ~15 tests, only includes webview-ui tests
- [ ] **All Tests Passing:** `npm test` succeeds with no failures
- [ ] **Project Separation:** No test overlap between Node and React projects
- [ ] **Configuration Documented:** Explanatory comment added to jest.config.js
- [ ] **Atomic Commit:** Single commit with clear message

**What Works After This Step:**
- Jest discovers all tests in reorganized structure (tests/core/, tests/features/, tests/webview-ui/)
- Obsolete patterns removed (no references to deleted tests/webviews/ directory)
- Node and React test environments properly separated
- Configuration aligns with actual test file locations
- Self-documenting config with explanatory comments
- Foundation for Step 7 (documentation update)

**Configuration Changes Summary:**
- **Removed:** 2 obsolete patterns (tests/webviews/**/*.test.ts, tests/webviews/**/*.test.tsx)
- **Kept:** 2 active patterns (tests/webview-ui/**/*.test.ts, tests/webview-ui/**/*.test.tsx)
- **Added:** Explanatory comment documenting cleanup
- **Verified:** All 91 tests discovered, Node/React separation maintained

---

## Acceptance Criteria

- [ ] All existing tests passing (`npm test` succeeds)
- [ ] Test count: 91 files (verified via `find tests -name "*.test.ts*" | wc -l`)
- [ ] Jest discovers: 91 tests (verified via `npm test -- --listTests | wc -l`)
- [ ] Node project discovers ~76 tests (no webview-ui tests)
- [ ] React project discovers ~15 tests (only webview-ui tests)
- [ ] Obsolete patterns removed from jest.config.js (tests/webviews/**/*.test.ts*)
- [ ] Active patterns retained (tests/webview-ui/**/*.test.ts*)
- [ ] No test overlap between Node and React projects
- [ ] React tests run in jsdom environment (no "document is not defined" errors)
- [ ] Node tests run in node environment
- [ ] Configuration comment added explaining pattern cleanup
- [ ] TypeScript compiler succeeds (`npx tsc --noEmit`)
- [ ] Coverage report generates successfully
- [ ] Single atomic commit with descriptive message
- [ ] No syntax errors in jest.config.js
- [ ] No test discovery warnings or errors

---

## Dependencies

**Files This Step Depends On:**
- jest.config.js (primary file to modify)
- All test files in tests/ (91 files to discover)
- tsconfig.json (path aliases referenced in moduleNameMapper)
- package.json (test scripts)

**Files This Step Modifies:**
- jest.config.js (React project testMatch patterns updated, comment added)

**Files This Step Does NOT Modify:**
- Any test files (pure configuration update)
- tsconfig.json (no changes needed)
- package.json (no changes needed)
- Any source files in src/ (configuration only)

**Subsequent Steps That Depend on This:**
- Step 7: Documentation update (references updated Jest config)
- Future test additions (will use updated patterns for discovery)

---

## Rollback Plan

**If This Step Fails:**

**Immediate Rollback (Before Commit):**
```bash
# Restore original jest.config.js from backup
cp jest.config.js.backup jest.config.js

# Verify restoration
diff jest.config.js jest.config.js.backup
# Should show no differences

# Verify tests still pass
npm test

# Verify test discovery
npm test -- --listTests | wc -l
# Should show 91 tests

# Remove backup
rm jest.config.js.backup

# Verify clean state
git status
```

**Rollback After Commit:**
```bash
# Find commit hash for this step
git log --oneline | head -5

# Revert commit (preserves history)
git revert <commit-hash>

# OR reset to previous commit (destructive)
git reset --hard HEAD~1

# Verify tests pass
npm test

# Verify jest.config.js restored
grep -A 5 "displayName: 'react'" jest.config.js | grep -A 4 "testMatch"
# Should show 4 patterns (including obsolete webviews patterns)
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] jest.config.js contains original 4 testMatch patterns
- [ ] Test discovery unchanged (91 tests)
- [ ] No uncommitted changes
- [ ] No jest.config.js syntax errors

---

## Common Issues and Solutions

### Issue 1: Test Count Drops Below 91 After Config Update

**Symptom:** Jest discovers fewer than 91 tests with updated config

**Cause:** testMatch patterns too restrictive, excluding valid tests

**Solution:**
```bash
# Find missing tests
npm test -- --listTests > discovered.txt
find tests -name "*.test.ts" -o -name "*.test.tsx" > all-files.txt
comm -23 <(sort all-files.txt) <(sort discovered.txt) > missing.txt

# Review missing tests
cat missing.txt

# Common causes:
# - Pattern missing tests/core/** or tests/features/**
# - Node project negation patterns too broad
# - React project patterns too specific

# Fix: Verify Node project testMatch includes all .test.ts files
# Fix: Verify React project testMatch includes all webview-ui tests

# Re-verify discovery
npm test -- --listTests | wc -l
# Should show 91

# Cleanup
rm discovered.txt all-files.txt missing.txt
```

### Issue 2: Jest Config Syntax Error

**Symptom:** npm test fails with "SyntaxError" in jest.config.js

**Cause:** Invalid JavaScript syntax (missing comma, bracket mismatch, etc.)

**Solution:**
```bash
# Verify syntax
node -c jest.config.js

# If error shown, examine line number
# Common errors:
# - Trailing comma after last array element (invalid in some JS versions)
# - Missing comma between array elements
# - Bracket/brace mismatch

# Fix syntax error in jest.config.js
# Re-verify
node -c jest.config.js
# Should output nothing (success)

# Re-run tests
npm test
```

### Issue 3: React Tests Run in Node Environment

**Symptom:** React tests fail with "ReferenceError: document is not defined"

**Cause:** React project testMatch doesn't include some React tests, so they run in Node project

**Solution:**
```bash
# Verify which project discovers the failing test
npm test -- --selectProjects node --listTests | grep "useAsyncData"
npm test -- --selectProjects react --listTests | grep "useAsyncData"

# If test discovered by Node project instead of React:
# Fix React project testMatch to include the test pattern

# Verify React project testMatch includes all webview-ui patterns
grep -A 5 "displayName: 'react'" jest.config.js | grep "testMatch" -A 4

# Should include:
#   '**/tests/webview-ui/**/*.test.ts',
#   '**/tests/webview-ui/**/*.test.tsx'

# Re-run tests
npm test -- --selectProjects react
```

### Issue 4: Tests Discovered by Both Node and React Projects

**Symptom:** Test count > 91, some tests run twice

**Cause:** Node project negation patterns don't exclude all React tests

**Solution:**
```bash
# Find duplicate discoveries
npm test -- --selectProjects node --listTests > node.txt
npm test -- --selectProjects react --listTests > react.txt
comm -12 <(sort node.txt) <(sort react.txt)

# If duplicates found, check Node project negation patterns
grep -A 15 "displayName: 'node'" jest.config.js | grep "testMatch" -A 10

# Should exclude:
#   '!**/tests/webview-ui/**/*.test.ts',
#   '!**/tests/webview-ui/**/*.test.tsx'

# Add missing negation patterns if needed
# Re-verify separation
npm test -- --selectProjects node --listTests | wc -l  # ~76
npm test -- --selectProjects react --listTests | wc -l  # ~15

# Cleanup
rm node.txt react.txt
```

### Issue 5: Coverage Report Missing Tests

**Symptom:** Coverage report doesn't include all test files

**Cause:** Coverage configuration doesn't match test patterns

**Solution:**
```bash
# Verify coverage configuration (lines 90-96 in jest.config.js)
grep -A 10 "collectCoverageFrom" jest.config.js

# Should include:
#   'src/**/*.{ts,tsx}',
#   '!src/**/*.d.ts',
#   'src/webviews/**/*.{ts,tsx}',

# Patterns should cover all source files tested

# Re-run with coverage
npm test -- --coverage

# Verify coverage report
ls coverage/lcov-report/index.html
open coverage/lcov-report/index.html  # macOS
# Or: xdg-open coverage/lcov-report/index.html  # Linux
```

### Issue 6: Patterns Still Reference Obsolete Directories

**Symptom:** Git commit still shows references to tests/webviews/

**Cause:** Comment or pattern update incomplete

**Solution:**
```bash
# Search for remaining webviews references
grep -n "webviews" jest.config.js

# Should only show:
# - Explanatory comment mentioning removal
# - No active testMatch patterns

# If active patterns found, remove them
# Re-verify
grep -n "tests/webviews" jest.config.js
# Should only show comment line, not in testMatch arrays

# Verify no obsolete patterns
npm test -- --listTests | grep "tests/webviews/"
# Should output nothing (0 tests)
```

---

## Cross-References

**Related Plan Sections:**
- overview.md: Overall test reorganization strategy
- overview.md Risk Assessment: Jest configuration incompatibility
- Step 4: Consolidated hook tests (removed tests/webviews/ directory)
- Step 5: Created missing core directories (established complete structure)
- Step 7: Documentation update (references updated Jest config)

**Related Documentation:**
- jest.config.js: Jest configuration (primary file modified in this step)
- package.json: Test scripts (npm test, npm run test:coverage)
- tsconfig.json: Path aliases (referenced in moduleNameMapper)
- docs/testing/README.md: Testing strategy (to be updated in Step 7)

**Related Configuration Files:**
- jest.config.js: Primary configuration (lines 45-50 modified)
- .gitignore: Excludes coverage/ directory
- package.json: Test scripts and Jest dependencies

---

## Verification Commands Summary

**Quick validation checklist:**

```bash
# 1. Pre-update validation
npm test && git status
npm test -- --listTests | wc -l  # Should show 91

# 2. Post-update validation
node -c jest.config.js  # Verify syntax
npm test  # Should pass all tests
npm test -- --listTests | wc -l  # Should show 91

# 3. Verify test discovery
npm test -- --selectProjects node --listTests | wc -l  # ~76
npm test -- --selectProjects react --listTests | wc -l  # ~15

# 4. Verify no obsolete pattern matches
npm test -- --listTests | grep "tests/webviews/" | wc -l  # Should be 0

# 5. Verify webview-ui patterns work
npm test -- --listTests | grep "tests/webview-ui/" | wc -l  # Should be ~15

# 6. Verify project separation
npm test -- --selectProjects node --listTests | grep "webview-ui" | wc -l  # Should be 0
npm test -- --selectProjects react --listTests | grep -v "webview-ui" | wc -l  # Should be 0

# 7. Verify all tests pass
npm test
echo $?  # Should output 0

# 8. Verify coverage report
npm test -- --coverage
ls coverage/lcov-report/index.html  # Should exist

# 9. Verify config changes
git diff jest.config.js
# Should show 2 removed lines (obsolete patterns) and comment addition
```

---

_Step 6 implementation ready for TDD execution_
_Previous Step: Step 5 - Create missing core test directories (completed)_
_Next Step: Step 7 - Update documentation for reorganized test structure (step-07.md)_
