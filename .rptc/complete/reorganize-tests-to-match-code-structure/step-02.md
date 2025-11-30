# Step 2: Migrate Feature Handler Tests from commands/handlers/ to features/

## Step Overview

**Purpose:** Migrate feature-specific handler tests from the centralized tests/commands/handlers/ location to feature-colocated paths in tests/features/*/handlers/. This step separates core infrastructure tests (HandlerContext, HandlerRegistry) from feature handler tests, aligning test organization with the feature-based architecture.

**What This Accomplishes:**
- Moves 3 feature handler test files from tests/commands/handlers/ to feature-colocated locations
- Keeps 2 core infrastructure tests in tests/commands/handlers/ (HandlerContext, HandlerRegistry)
- Creates tests/features/lifecycle/handlers/ directory structure
- Updates authentication handler test locations (projectHandlers, workspaceHandlers already have canonical location)
- Preserves git history through exclusive use of git mv
- Validates all imports resolve correctly and all tests pass

**Files Affected:** 3 test files to move, 2 test files to keep in place

**Estimated Time:** 45-60 minutes

---

## Prerequisites

- [ ] Step 1 completed (legacy utils tests migrated)
- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)
- [ ] TypeScript compiler available (npx tsc --noEmit)
- [ ] tests/features/authentication/handlers/ directory exists (created in prior work)

---

## Test Strategy

### Test Scenarios for This Migration Step

#### Happy Path: Successful Feature Handler Migration

**Scenario 1: Move Lifecycle Handler Tests**
- [ ] **Test:** Verify lifecycle handlers test relocated to feature location
  - **Given:** tests/commands/handlers/lifecycleHandlers.test.ts tests src/features/lifecycle/handlers/lifecycleHandlers.ts
  - **When:** git mv relocates test to tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
  - **Then:** File exists at new location, git history preserved, imports resolve correctly
  - **Verification:** `npm test -- tests/features/lifecycle/handlers` passes with lifecycleHandlers tests executing

**Scenario 2: Move Authentication Handler Tests**
- [ ] **Test:** Verify project and workspace handler tests relocated to authentication feature
  - **Given:** tests/commands/handlers/ contains projectHandlers.test.ts and workspaceHandlers.test.ts
  - **When:** git mv relocates both tests to tests/features/authentication/handlers/
  - **Then:** Both files exist at new location, tests pass, no conflicts with existing authenticationHandlers.test.ts
  - **Verification:** `npm test -- tests/features/authentication/handlers` passes with all 3 handler test files

**Scenario 3: Core Infrastructure Tests Remain**
- [ ] **Test:** Verify core handler tests stay in commands/handlers/
  - **Given:** HandlerContext.test.ts and HandlerRegistry.test.ts test core infrastructure in src/commands/handlers/
  - **When:** Step 2 migration completes
  - **Then:** Both tests remain at tests/commands/handlers/, continue to pass
  - **Verification:** `npm test -- tests/commands/handlers` passes with 2 tests (HandlerContext, HandlerRegistry)

**Scenario 4: All Imports Resolve Correctly**
- [ ] **Test:** Verify path alias resolution after migration
  - **Given:** Moved tests use path aliases (@/features/lifecycle/, @/features/authentication/)
  - **When:** TypeScript compiler validates all imports
  - **Then:** No import resolution errors, all path aliases resolve to correct source files
  - **Verification:** `npx tsc --noEmit` succeeds with no errors

#### Edge Cases: Directory and Test Conflicts

**Edge Case 1: Existing Authentication Handler Tests**
- [ ] **Test:** Verify no conflicts with existing authenticationHandlers.test.ts
  - **Given:** tests/features/authentication/handlers/ already contains authenticationHandlers.test.ts
  - **When:** Adding projectHandlers.test.ts and workspaceHandlers.test.ts to same directory
  - **Then:** All 3 test files coexist without conflicts, all pass independently
  - **Verification:** `npm test -- tests/features/authentication/handlers` shows 3 test suites

**Edge Case 2: Lifecycle Handlers Directory Creation**
- [ ] **Test:** Verify new directory created if doesn't exist
  - **Given:** tests/features/lifecycle/ may not have handlers/ subdirectory
  - **When:** Creating tests/features/lifecycle/handlers/ for test migration
  - **Then:** Directory created successfully, test file placed correctly
  - **Verification:** `ls tests/features/lifecycle/handlers/` shows lifecycleHandlers.test.ts

**Edge Case 3: Jest Discovers Tests in New Locations**
- [ ] **Test:** Verify Jest finds all moved tests
  - **Given:** Jest testMatch patterns are `**/tests/**/*.test.ts`
  - **When:** Running npm test after migration
  - **Then:** Jest discovers same test count as before (89 files from Step 1, no additions/deletions)
  - **Verification:** `npm test -- --listTests | wc -l` shows 89 files

#### Error Conditions: Import and Test Failures

**Error Condition 1: Import Resolution Failures**
- [ ] **Test:** Detect and resolve broken imports in moved tests
  - **Given:** Tests may have incorrect path aliases or relative imports
  - **When:** TypeScript compiler attempts to resolve imports after migration
  - **Then:** Compiler errors indicate which imports failed (e.g., HandlerContext import)
  - **Recovery:** Update imports to use correct path aliases (@/commands/handlers/HandlerContext)
  - **Verification:** `npx tsc --noEmit` succeeds after fixes

**Error Condition 2: Mock Path Resolution Failures**
- [ ] **Test:** Detect mock path issues in moved tests
  - **Given:** Tests use jest.mock() with relative or absolute paths
  - **When:** Running tests after migration
  - **Then:** Jest reports "Cannot find module" errors for mocks
  - **Recovery:** Update jest.mock() calls to use path aliases
  - **Verification:** `npm test` succeeds after mock path fixes

**Error Condition 3: Tests Fail After Migration**
- [ ] **Test:** Identify test failures specific to relocation
  - **Given:** Tests may have location-dependent logic (rare)
  - **When:** Running npm test on relocated tests
  - **Then:** Test failures with clear error messages
  - **Recovery:** Investigate test logic, update any path-dependent code
  - **Verification:** `npm test` succeeds with no failures

**Error Condition 4: Git History Lost**
- [ ] **Test:** Verify file history preserved through git mv
  - **Given:** Using git mv instead of copy/delete
  - **When:** Checking git log after migration
  - **Then:** git log --follow shows complete file history at new location
  - **Recovery:** If history lost, revert commit and retry with git mv
  - **Verification:** `git log --follow tests/features/lifecycle/handlers/lifecycleHandlers.test.ts` shows history

---

## Implementation Details

### Phase 1: Pre-Migration Validation

**Verify Clean Starting State**

Run these commands to ensure clean starting point:

```bash
# Verify Step 1 completed (tests/utils/ should not exist)
ls tests/utils/ 2>&1 | grep "No such file or directory"

# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# Verify TypeScript compilation succeeds
npx tsc --noEmit

# Verify current test count (should be 89 from Step 1)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List current tests in commands/handlers/
ls tests/commands/handlers/
```

**Expected Results:**
- tests/utils/ does not exist (Step 1 cleanup)
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- No TypeScript errors (npx tsc --noEmit succeeds)
- Test count: 89 files (unchanged from Step 1)
- commands/handlers/ contains 5 test files: HandlerContext.test.ts, HandlerRegistry.test.ts, lifecycleHandlers.test.ts, projectHandlers.test.ts, workspaceHandlers.test.ts

### Phase 2: Analyze Test File Destinations

**Understand which tests move and which stay:**

```bash
# Check source files to confirm test destinations
ls src/features/lifecycle/handlers/
ls src/features/authentication/handlers/
ls src/commands/handlers/

# Expected mapping:
# lifecycleHandlers.test.ts → tests/features/lifecycle/handlers/ (matches src/features/lifecycle/handlers/lifecycleHandlers.ts)
# projectHandlers.test.ts → tests/features/authentication/handlers/ (matches src/features/authentication/handlers/projectHandlers.ts)
# workspaceHandlers.test.ts → tests/features/authentication/handlers/ (matches src/features/authentication/handlers/workspaceHandlers.ts)
# HandlerContext.test.ts → STAYS in tests/commands/handlers/ (matches src/commands/handlers/HandlerContext.ts)
# HandlerRegistry.test.ts → STAYS in tests/commands/handlers/ (matches src/commands/handlers/HandlerRegistry.ts)
```

**Expected Output:**
- src/features/lifecycle/handlers/ contains lifecycleHandlers.ts
- src/features/authentication/handlers/ contains projectHandlers.ts, workspaceHandlers.ts, authenticationHandlers.ts
- src/commands/handlers/ contains HandlerContext.ts, HandlerRegistry.ts
- Test migration plan matches source file locations

### Phase 3: Create New Test Directory Structure

**Create necessary directories for relocated feature handler tests:**

```bash
# Create lifecycle handlers test directory
mkdir -p tests/features/lifecycle/handlers

# Verify authentication handlers test directory exists (should exist from prior work)
ls tests/features/authentication/handlers/ || mkdir -p tests/features/authentication/handlers

# Verify directory structure
ls -R tests/features/lifecycle/
ls -R tests/features/authentication/handlers/
```

**Expected Output:**
- tests/features/lifecycle/handlers/ directory created
- tests/features/authentication/handlers/ directory exists (contains authenticationHandlers.test.ts)
- No errors about directory creation

### Phase 4: Move Lifecycle Handler Tests

**Relocate lifecycle handlers test using git mv:**

```bash
# Move lifecycle handlers test to feature location
git mv tests/commands/handlers/lifecycleHandlers.test.ts tests/features/lifecycle/handlers/lifecycleHandlers.test.ts

# Verify move
ls tests/features/lifecycle/handlers/
git status

# Verify test passes in new location
npm test -- tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
```

**Expected Results:**
- lifecycleHandlers.test.ts exists at tests/features/lifecycle/handlers/
- git status shows renamed file (preserving history)
- Test passes in new location
- Git history preserved

### Phase 5: Move Authentication Handler Tests

**Relocate project and workspace handler tests using git mv:**

```bash
# Move project handlers test
git mv tests/commands/handlers/projectHandlers.test.ts tests/features/authentication/handlers/projectHandlers.test.ts

# Move workspace handlers test
git mv tests/commands/handlers/workspaceHandlers.test.ts tests/features/authentication/handlers/workspaceHandlers.test.ts

# Verify moves
ls tests/features/authentication/handlers/
git status

# Verify all authentication handler tests pass
npm test -- tests/features/authentication/handlers
```

**Expected Results:**
- projectHandlers.test.ts and workspaceHandlers.test.ts exist at tests/features/authentication/handlers/
- git status shows 2 renamed files
- tests/features/authentication/handlers/ now contains 3 test files:
  - authenticationHandlers.test.ts (already existed)
  - projectHandlers.test.ts (moved)
  - workspaceHandlers.test.ts (moved)
- All 3 test suites pass

### Phase 6: Verify Core Infrastructure Tests Remain

**Confirm HandlerContext and HandlerRegistry tests stayed in place:**

```bash
# Verify core infrastructure tests still in commands/handlers/
ls tests/commands/handlers/

# Expected: HandlerContext.test.ts, HandlerRegistry.test.ts (only these 2 files)

# Verify they still pass
npm test -- tests/commands/handlers
```

**Expected Results:**
- tests/commands/handlers/ contains exactly 2 files: HandlerContext.test.ts, HandlerRegistry.test.ts
- Both tests pass (test core infrastructure, not feature-specific handlers)
- No other tests remain in tests/commands/handlers/

### Phase 7: Validate Import Resolution

**Verify all imports resolve correctly:**

```bash
# Run TypeScript compiler (no emit, just type checking)
npx tsc --noEmit

# Should succeed with no errors
echo $?  # Should output: 0

# Check specific imports in moved tests (optional verification)
grep -n "from '@/commands/handlers/HandlerContext'" tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
grep -n "from '@/commands/handlers/HandlerContext'" tests/features/authentication/handlers/projectHandlers.test.ts
grep -n "from '@/commands/handlers/HandlerContext'" tests/features/authentication/handlers/workspaceHandlers.test.ts
```

**Expected Results:**
- TypeScript compiler succeeds
- No import resolution errors
- All moved tests correctly import HandlerContext from @/commands/handlers/HandlerContext
- All path aliases (@/features/, @/commands/) resolve correctly

**If Errors Occur:**
- Examine error messages for specific import failures
- Common issue: HandlerContext import path may need updating to @/commands/handlers/HandlerContext
- Fix import statements in affected test files
- Re-run `npx tsc --noEmit` to verify fixes

### Phase 8: Run Test Suite

**Execute full test suite to verify all tests pass:**

```bash
# Run all tests
npm test

# Verify test count unchanged (should be 89 files)
npm test -- --listTests | wc -l

# Run specific test suites to verify relocated tests
npm test -- tests/features/lifecycle/handlers
npm test -- tests/features/authentication/handlers
npm test -- tests/commands/handlers

# Verify test suite counts
echo "Lifecycle handlers: should show 1 test suite"
npm test -- tests/features/lifecycle/handlers --listTests

echo "Authentication handlers: should show 3 test suites"
npm test -- tests/features/authentication/handlers --listTests

echo "Commands/handlers (core): should show 2 test suites"
npm test -- tests/commands/handlers --listTests
```

**Expected Results:**
- All tests pass (no failures)
- Test count: 89 files (unchanged from Step 1)
- Lifecycle handlers: 1 test suite (lifecycleHandlers.test.ts)
- Authentication handlers: 3 test suites (authenticationHandlers.test.ts, projectHandlers.test.ts, workspaceHandlers.test.ts)
- Commands/handlers: 2 test suites (HandlerContext.test.ts, HandlerRegistry.test.ts)
- Jest finds all tests via existing testMatch patterns

**If Tests Fail:**
1. Examine failure messages for specific test/import issues
2. Check that all moved test files use correct path aliases for HandlerContext import
3. Verify mock paths are correct (update relative paths in jest.mock())
4. Re-run `npx tsc --noEmit` to validate imports
5. Fix issues and re-run tests

### Phase 9: Commit Migration

**Create atomic commit for this migration step:**

```bash
# Stage all changes
git add -A

# Verify what will be committed
git status

# Create commit with descriptive message
git commit -m "test: migrate feature handler tests to feature-colocated locations (Step 2)

- Move lifecycleHandlers test to tests/features/lifecycle/handlers/
- Move projectHandlers test to tests/features/authentication/handlers/
- Move workspaceHandlers test to tests/features/authentication/handlers/
- Keep HandlerContext and HandlerRegistry tests in tests/commands/handlers/ (core infrastructure)
- All tests passing, imports using correct path aliases
- Git history preserved via git mv

Feature handlers: 3 tests moved (lifecycle, project, workspace)
Core infrastructure: 2 tests remain (HandlerContext, HandlerRegistry)
Tests: 89 files (unchanged from Step 1)
Coverage: Maintained at 80%+

Part of test reorganization plan (Step 2/7)"
```

**Expected Results:**
- Single atomic commit with all migration changes
- Commit message clearly describes changes
- Git history preserved for all moved files
- Clean working directory after commit
- Tests passing in CI/CD (if applicable)

---

## Detailed File Migration Map

### Files to MOVE (Feature Handlers)

| Source Path | Destination Path | Source Code Location | Reason |
|-------------|-----------------|---------------------|---------|
| `tests/commands/handlers/lifecycleHandlers.test.ts` | `tests/features/lifecycle/handlers/lifecycleHandlers.test.ts` | `src/features/lifecycle/handlers/lifecycleHandlers.ts` | Feature-specific lifecycle handlers (ready, cancel, openProject, etc.) |
| `tests/commands/handlers/projectHandlers.test.ts` | `tests/features/authentication/handlers/projectHandlers.test.ts` | `src/features/authentication/handlers/projectHandlers.ts` | Feature-specific Adobe project handlers |
| `tests/commands/handlers/workspaceHandlers.test.ts` | `tests/features/authentication/handlers/workspaceHandlers.test.ts` | `src/features/authentication/handlers/workspaceHandlers.ts` | Feature-specific Adobe workspace handlers |

### Files to KEEP (Core Infrastructure)

| Current Path | Source Code Location | Reason to Keep |
|-------------|---------------------|----------------|
| `tests/commands/handlers/HandlerContext.test.ts` | `src/commands/handlers/HandlerContext.ts` | Core infrastructure type definitions used by all handlers |
| `tests/commands/handlers/HandlerRegistry.test.ts` | `src/commands/handlers/HandlerRegistry.ts` | Core infrastructure registry for all handler types |

### New Directory Structure Created

```text
tests/features/lifecycle/handlers/
└── lifecycleHandlers.test.ts

tests/features/authentication/handlers/
├── authenticationHandlers.test.ts (already existed)
├── projectHandlers.test.ts (moved)
└── workspaceHandlers.test.ts (moved)

tests/commands/handlers/
├── HandlerContext.test.ts (kept)
└── HandlerRegistry.test.ts (kept)
```

---

## Expected Outcome

**After Successful Completion:**

- [ ] **File Count:** 89 test files (unchanged from Step 1)
- [ ] **Directory Structure:**
  - tests/features/lifecycle/handlers/ contains 1 test (lifecycleHandlers.test.ts)
  - tests/features/authentication/handlers/ contains 3 tests (authenticationHandlers, projectHandlers, workspaceHandlers)
  - tests/commands/handlers/ contains 2 tests (HandlerContext, HandlerRegistry)
- [ ] **All Tests Passing:** `npm test` succeeds with no failures
- [ ] **Import Resolution:** `npx tsc --noEmit` succeeds with no errors
- [ ] **Git History:** `git log --follow` shows complete history for moved files
- [ ] **Test Coverage:** Maintained at 80%+ (no reduction from reorganization)
- [ ] **Handler Organization:** Feature handlers colocated with features, core handlers remain in commands/

**What Works After This Step:**
- Feature handler tests execute in feature-colocated locations
- Core infrastructure handler tests remain in centralized location
- Clear separation between feature handlers and core infrastructure
- Foundation for remaining migration steps (Steps 3-7)

---

## Acceptance Criteria

- [ ] All tests passing for this step (`npm test` succeeds)
- [ ] Test count: 89 files (verified via `npm test -- --listTests | wc -l`)
- [ ] tests/features/lifecycle/handlers/ contains lifecycleHandlers.test.ts
- [ ] tests/features/authentication/handlers/ contains 3 test files (authenticationHandlers, projectHandlers, workspaceHandlers)
- [ ] tests/commands/handlers/ contains exactly 2 test files (HandlerContext, HandlerRegistry)
- [ ] All moved tests use correct path aliases (@/commands/handlers/HandlerContext, @/features/)
- [ ] TypeScript compiler succeeds (`npx tsc --noEmit`)
- [ ] Git history preserved for all moved files
- [ ] Coverage maintained at 80%+ (verify via coverage report)
- [ ] Single atomic commit with descriptive message
- [ ] No console.log or debugger statements introduced
- [ ] No broken imports or path resolution errors

---

## Dependencies

**Files This Step Depends On:**
- tests/commands/handlers/HandlerContext.test.ts (staying in place)
- tests/commands/handlers/HandlerRegistry.test.ts (staying in place)
- tests/commands/handlers/lifecycleHandlers.test.ts (moving)
- tests/commands/handlers/projectHandlers.test.ts (moving)
- tests/commands/handlers/workspaceHandlers.test.ts (moving)
- src/commands/handlers/HandlerContext.ts (imported by moved tests)
- src/commands/handlers/HandlerRegistry.ts (imported by tests staying in place)
- jest.config.js (existing testMatch patterns must support new locations)
- tsconfig.json (path aliases must be correctly configured)

**Files This Step Modifies:**
- 3 test files moved from tests/commands/handlers/ to tests/features/
- tests/ directory structure (new subdirectory tests/features/lifecycle/handlers/)
- 2 test files remain in tests/commands/handlers/ (HandlerContext, HandlerRegistry)

**Files This Step Does NOT Modify:**
- jest.config.js (no changes needed - existing patterns work)
- tsconfig.json (no changes needed - path aliases already configured)
- Any source files in src/ (pure test reorganization)

**Subsequent Steps That Depend on This:**
- Step 3: Migrate webview hook tests (continues feature test organization)
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

# Verify tests/commands/handlers/ still has all 5 original test files
ls tests/commands/handlers/
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
ls tests/commands/handlers/  # Should show 5 test files
```

**Partial Rollback (Fix Specific Issues):**
```bash
# Restore specific file from previous commit
git checkout HEAD~1 -- tests/commands/handlers/lifecycleHandlers.test.ts

# Re-run tests to verify
npm test -- tests/commands/handlers
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] tests/commands/handlers/ contains all 5 original test files
- [ ] No broken imports or missing test files
- [ ] Test count: 89 files (unchanged)

---

## Common Issues and Solutions

### Issue 1: Import Resolution Fails for HandlerContext

**Symptom:** TypeScript errors like "Cannot find module '@/commands/handlers/HandlerContext'"

**Cause:** Moved tests may have incorrect import path after relocation

**Solution:**
```bash
# Check current HandlerContext imports in moved tests
grep -n "HandlerContext" tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
grep -n "HandlerContext" tests/features/authentication/handlers/projectHandlers.test.ts
grep -n "HandlerContext" tests/features/authentication/handlers/workspaceHandlers.test.ts

# Correct import should be:
# import { HandlerContext } from '@/commands/handlers/HandlerContext';

# Update if needed (example for lifecycleHandlers.test.ts)
# Change: import { HandlerContext } from '../../../commands/handlers/HandlerContext';
# To: import { HandlerContext } from '@/commands/handlers/HandlerContext';

# Re-run TypeScript compiler
npx tsc --noEmit
```

### Issue 2: Jest Can't Find Moved Tests

**Symptom:** Test count lower than expected, or specific tests not found

**Cause:** Jest testMatch patterns don't include new directories (unlikely with `**/tests/**/*.test.ts`)

**Solution:**
```bash
# Check which tests Jest will find
npm test -- --listTests | grep -E "(lifecycle|authentication)"

# Verify testMatch patterns
cat jest.config.js | grep -A 5 "testMatch"

# Current pattern: '**/tests/**/*.test.ts' should work for new structure
# If tests not found, verify directory names match exactly
ls -R tests/features/lifecycle/
ls -R tests/features/authentication/handlers/
```

### Issue 3: Tests Fail After Migration

**Symptom:** Tests pass in old location, fail in new location

**Cause:** Tests have path-dependent logic or relative mock paths

**Solution:**
```bash
# Identify failing test
npm test -- tests/features/lifecycle/handlers

# Check test for relative paths in jest.mock()
# Example: jest.mock('../../../features/components/handlers/componentHandlers')
# Should be: jest.mock('@/features/components/handlers/componentHandlers')

# Update mock paths to use path aliases
# Re-run test
npm test -- tests/features/lifecycle/handlers
```

### Issue 4: Git History Not Preserved

**Symptom:** `git log --follow` doesn't show history before move

**Cause:** Used copy/delete instead of git mv

**Solution:**
```bash
# If caught before commit:
git reset HEAD
# Redo migration using git mv commands from Phase 4-5

# If caught after commit:
# History is still preserved, but --follow flag needed
git log --follow tests/features/lifecycle/handlers/lifecycleHandlers.test.ts

# Should show commits from when file was in tests/commands/handlers/
```

### Issue 5: Conflict with Existing authenticationHandlers.test.ts

**Symptom:** Import conflicts or naming collisions in tests/features/authentication/handlers/

**Cause:** All 3 test files import similar mocks or have overlapping test descriptions

**Solution:**
```bash
# Verify no actual conflicts (tests should be independent)
npm test -- tests/features/authentication/handlers

# If conflicts exist, check for duplicate mock setups
grep -n "jest.mock" tests/features/authentication/handlers/*.test.ts

# Ensure each test file has isolated setup (no shared global state)
# Update test file to use unique mock setups if needed
```

### Issue 6: Directory Not Created Before git mv

**Symptom:** git mv fails with "No such file or directory"

**Cause:** Destination directory doesn't exist

**Solution:**
```bash
# Create destination directory
mkdir -p tests/features/lifecycle/handlers

# Retry git mv
git mv tests/commands/handlers/lifecycleHandlers.test.ts tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
```

---

## Cross-References

**Related Plan Sections:**
- Overview.md: Overall test reorganization strategy
- Overview.md Risk Assessment: Import resolution failures, Jest configuration issues
- Step 1: Utils test migration (completed prerequisite)
- Step 3: Webview hook tests migration (continues feature test organization)
- Step 6: Jest config update (integrates all migration steps)

**Related Documentation:**
- jest.config.js: Test matching patterns and path aliases
- tsconfig.json: Path alias configuration
- src/commands/CLAUDE.md: Command and handler architecture documentation

**Related Source Files:**
- src/commands/handlers/HandlerContext.ts (core infrastructure)
- src/commands/handlers/HandlerRegistry.ts (core infrastructure)
- src/features/lifecycle/handlers/lifecycleHandlers.ts
- src/features/authentication/handlers/projectHandlers.ts
- src/features/authentication/handlers/workspaceHandlers.ts
- src/features/authentication/handlers/authenticationHandlers.ts

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

# 3. Verify directory structure
ls tests/features/lifecycle/handlers/  # Should show lifecycleHandlers.test.ts
ls tests/features/authentication/handlers/  # Should show 3 test files
ls tests/commands/handlers/  # Should show 2 test files (HandlerContext, HandlerRegistry)

# 4. Verify test count by category
find tests/features/lifecycle -name "*.test.ts" | wc -l  # Should show 1
find tests/features/authentication/handlers -name "*.test.ts" | wc -l  # Should show 3
find tests/commands/handlers -name "*.test.ts" | wc -l  # Should show 2

# 5. Verify git history preserved
git log --follow tests/features/lifecycle/handlers/lifecycleHandlers.test.ts
git log --follow tests/features/authentication/handlers/projectHandlers.test.ts
git log --follow tests/features/authentication/handlers/workspaceHandlers.test.ts

# 6. Verify specific test suites pass
npm test -- tests/features/lifecycle/handlers
npm test -- tests/features/authentication/handlers
npm test -- tests/commands/handlers
```

---

_Step 2 implementation ready for TDD execution_
_Previous Step: Step 1 - Migrate legacy utils tests (completed)_
_Next Step: Step 3 - Migrate webview hook tests (step-03.md)_
