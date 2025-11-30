# Step 3: Migrate Webview Component Tests to Webview-UI Structure

## Step Overview

**Purpose:** Migrate webview component tests from the obsolete atomic design structure (tests/webviews/components/) to the current functional structure (tests/webview-ui/shared/components/). This step eliminates the atomic design pattern (atoms/, molecules/, organisms/) in favor of functional categorization (ui/, forms/, feedback/, navigation/) that aligns with the refactored webview-ui codebase.

**What This Accomplishes:**
- Flattens atomic design hierarchy (atoms/Button.test.tsx → ui/Button.test.tsx)
- Relocates 11 component test files from tests/webviews/components/ to tests/webview-ui/shared/components/
- Creates new functional test directories (ui/, forms/, navigation/)
- Updates test imports to reflect new directory depth (../../../../utils/react-test-utils)
- Preserves git history through exclusive use of git mv
- Validates all React tests pass in new locations

**Files Affected:** 11 test files in tests/webviews/components/ (atomic design), plus directory structure changes

**Estimated Time:** 1.5-2 hours

---

## Prerequisites

- [ ] Step 1 completed (legacy utils tests migrated)
- [ ] Step 2 completed (feature handler tests migrated)
- [ ] All tests currently passing (run `npm test` to verify)
- [ ] No uncommitted changes (clean working directory)
- [ ] TypeScript compiler available (npx tsc --noEmit)
- [ ] React test environment configured (jest.config.js jsdom project)

---

## Test Strategy

### Test Scenarios for This Migration Step

#### Happy Path: Successful Atomic Design to Functional Structure Migration

**Scenario 1: Move UI Component Tests (Atoms → ui/)**
- [ ] **Test:** Verify atomic component tests relocated to ui/ directory
  - **Given:** tests/webviews/components/atoms/ contains Spinner, Badge, StatusDot, Icon test files
  - **When:** git mv relocates all 4 tests to tests/webview-ui/shared/components/ui/
  - **Then:** All files exist at new location, imports updated, React tests pass
  - **Verification:** `npm test -- tests/webview-ui/shared/components/ui` passes with 4 test suites

**Scenario 2: Move Form Component Tests (Molecules → forms/)**
- [ ] **Test:** Verify form component tests relocated to forms/ directory
  - **Given:** tests/webviews/components/molecules/ contains FormField, ConfigSection test files
  - **When:** git mv relocates both tests to tests/webview-ui/shared/components/forms/
  - **Then:** Files exist at new location, tests pass in forms/ subdirectory
  - **Verification:** `npm test -- tests/webview-ui/shared/components/forms` passes with 2 test suites

**Scenario 3: Move Feedback Component Tests (Molecules → feedback/)**
- [ ] **Test:** Verify feedback component tests relocated to feedback/ directory
  - **Given:** tests/webviews/components/molecules/ contains ErrorDisplay, StatusCard, EmptyState test files
  - **When:** git mv relocates all 3 tests to tests/webview-ui/shared/components/feedback/
  - **Then:** Files join existing LoadingDisplay.test.tsx, all 4 tests pass
  - **Verification:** `npm test -- tests/webview-ui/shared/components/feedback` passes with 4 test suites

**Scenario 4: Move Navigation Component Tests (Organisms → navigation/)**
- [ ] **Test:** Verify navigation component tests relocated to navigation/ directory
  - **Given:** tests/webviews/components/organisms/ contains SearchableList, NavigationPanel test files
  - **When:** git mv relocates both tests to tests/webview-ui/shared/components/navigation/
  - **Then:** Files exist at new location, navigation tests pass
  - **Verification:** `npm test -- tests/webview-ui/shared/components/navigation` passes with 2 test suites

**Scenario 5: All React Test Utils Imports Resolve**
- [ ] **Test:** Verify react-test-utils imports updated for new directory depth
  - **Given:** Tests currently import from `../../../utils/react-test-utils` (3 levels up from atoms/)
  - **When:** Tests moved to tests/webview-ui/shared/components/ui/ (4 levels deep)
  - **Then:** Imports updated to `../../../../utils/react-test-utils`, all resolve correctly
  - **Verification:** `npx tsc --noEmit` succeeds with no import errors

#### Edge Cases: Directory Creation and Import Depth

**Edge Case 1: New Directory Creation (ui/, forms/, navigation/)**
- [ ] **Test:** Verify new functional directories created successfully
  - **Given:** tests/webview-ui/shared/components/ only has feedback/, layout/ subdirectories
  - **When:** Creating ui/, forms/, navigation/ subdirectories for component tests
  - **Then:** All directories created, ready to receive migrated tests
  - **Verification:** `ls tests/webview-ui/shared/components/` shows ui/, forms/, feedback/, navigation/, layout/

**Edge Case 2: Existing Feedback Directory Tests**
- [ ] **Test:** Verify migrated tests coexist with existing LoadingDisplay.test.tsx
  - **Given:** tests/webview-ui/shared/components/feedback/ already contains LoadingDisplay.test.tsx
  - **When:** Adding ErrorDisplay, StatusCard, EmptyState tests to same directory
  - **Then:** All 4 test files coexist, no conflicts, all pass independently
  - **Verification:** `npm test -- tests/webview-ui/shared/components/feedback` shows 4 test suites

**Edge Case 3: React Test Environment Detection**
- [ ] **Test:** Verify Jest uses jsdom environment for migrated tests
  - **Given:** jest.config.js React project matches `**/tests/webview-ui/**/*.test.tsx`
  - **When:** Tests moved to tests/webview-ui/shared/components/ subdirectories
  - **Then:** Jest uses jsdom environment, React Testing Library works correctly
  - **Verification:** Tests using `screen.getByRole()` pass (requires jsdom)

**Edge Case 4: Path Alias Resolution for Webview-UI Components**
- [ ] **Test:** Verify component imports use correct @/webview-ui/ path alias
  - **Given:** Tests import components via `@/webview-ui/shared/components/ui/Spinner`
  - **When:** TypeScript compiler validates imports after migration
  - **Then:** Path alias resolves to webview-ui/src/shared/components/ui/Spinner.tsx
  - **Verification:** `npx tsc --noEmit` succeeds, no module resolution errors

#### Error Conditions: Import Failures and Test Environment Issues

**Error Condition 1: React Test Utils Import Depth Error**
- [ ] **Test:** Detect incorrect import depth for react-test-utils
  - **Given:** Tests moved to 4-level-deep directory (tests/webview-ui/shared/components/ui/)
  - **When:** Import still uses `../../../utils/react-test-utils` (3 levels)
  - **Then:** TypeScript error "Cannot find module '../../../utils/react-test-utils'"
  - **Recovery:** Update import to `../../../../utils/react-test-utils` (4 levels)
  - **Verification:** `npx tsc --noEmit` succeeds after fix

**Error Condition 2: Wrong Jest Environment (Node vs jsdom)**
- [ ] **Test:** Detect tests running in wrong environment (Node instead of jsdom)
  - **Given:** React tests require jsdom for DOM APIs (document, screen, etc.)
  - **When:** Jest testMatch pattern fails to match tests as React tests
  - **Then:** Test failures with "ReferenceError: document is not defined"
  - **Recovery:** Verify jest.config.js React project testMatch includes `**/tests/webview-ui/**/*.test.tsx`
  - **Verification:** `npm test -- tests/webview-ui` uses jsdom environment

**Error Condition 3: Component Import Path Alias Failures**
- [ ] **Test:** Detect broken component imports after migration
  - **Given:** Tests import components via path aliases (@/webview-ui/)
  - **When:** Path alias misconfigured or component moved in src/
  - **Then:** TypeScript error "Cannot find module '@/webview-ui/shared/components/ui/Spinner'"
  - **Recovery:** Verify component exists at expected location, check jest.config.js moduleNameMapper
  - **Verification:** `npx tsc --noEmit` succeeds, component imports resolve

**Error Condition 4: Git History Lost in Flattening**
- [ ] **Test:** Verify file history preserved when flattening atomic design structure
  - **Given:** Using git mv to relocate atoms/Spinner.test.tsx → ui/Spinner.test.tsx
  - **When:** Checking git log after migration
  - **Then:** git log --follow shows complete file history from atoms/ location
  - **Recovery:** If history lost, revert commit and retry with git mv
  - **Verification:** `git log --follow tests/webview-ui/shared/components/ui/Spinner.test.tsx` shows history

---

## Implementation Details

### Phase 1: Pre-Migration Validation

**Verify Clean Starting State**

Run these commands to ensure clean starting point:

```bash
# Verify Steps 1-2 completed
ls tests/utils/ 2>&1 | grep "No such file or directory"  # Step 1 cleanup
ls tests/features/lifecycle/handlers/ | grep "lifecycleHandlers.test.ts"  # Step 2 result

# Verify all tests currently pass
npm test

# Verify no uncommitted changes
git status

# Verify TypeScript compilation succeeds
npx tsc --noEmit

# Verify current test count (should be 89 from Steps 1-2)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List current atomic design test structure
ls -R tests/webviews/components/
```

**Expected Results:**
- tests/utils/ does not exist (Step 1 cleanup)
- tests/features/lifecycle/handlers/ contains lifecycleHandlers.test.ts (Step 2 result)
- All tests passing (npm test exits with code 0)
- Clean working directory (git status shows "nothing to commit")
- No TypeScript errors (npx tsc --noEmit succeeds)
- Test count: 89 files (unchanged from Step 2)
- tests/webviews/components/ contains atoms/, molecules/, organisms/ subdirectories

### Phase 2: Analyze Atomic Design to Functional Mapping

**Understand component categorization and target directories:**

```bash
# Check source files in webview-ui to confirm mapping
ls webview-ui/src/shared/components/ui/        # Should show Icon, StatusDot, Badge, Spinner
ls webview-ui/src/shared/components/forms/     # Should show FormField, ConfigSection
ls webview-ui/src/shared/components/feedback/  # Should show ErrorDisplay, StatusCard, EmptyState
ls webview-ui/src/shared/components/navigation/  # Should show SearchableList, NavigationPanel

# Expected mapping:
# atoms/Spinner.test.tsx → ui/Spinner.test.tsx (flatten atomic design)
# atoms/Badge.test.tsx → ui/Badge.test.tsx
# atoms/StatusDot.test.tsx → ui/StatusDot.test.tsx
# atoms/Icon.test.tsx → ui/Icon.test.tsx
# molecules/FormField.test.tsx → forms/FormField.test.tsx
# molecules/ConfigSection.test.tsx → forms/ConfigSection.test.tsx
# molecules/ErrorDisplay.test.tsx → feedback/ErrorDisplay.test.tsx
# molecules/StatusCard.test.tsx → feedback/StatusCard.test.tsx
# molecules/EmptyState.test.tsx → feedback/EmptyState.test.tsx
# organisms/SearchableList.test.tsx → navigation/SearchableList.test.tsx
# organisms/NavigationPanel.test.tsx → navigation/NavigationPanel.test.tsx
```

**Expected Output:**
- webview-ui/src/shared/components/ organized by function (ui/, forms/, feedback/, navigation/)
- Atomic design directories (atoms/, molecules/, organisms/) obsolete
- Mapping validates 11 tests relocate to 4 functional directories

### Phase 3: Create New Functional Test Directory Structure

**Create necessary directories for reorganized component tests:**

```bash
# Create ui directory for atomic component tests
mkdir -p tests/webview-ui/shared/components/ui

# Create forms directory for form component tests
mkdir -p tests/webview-ui/shared/components/forms

# Create navigation directory for navigation component tests
mkdir -p tests/webview-ui/shared/components/navigation

# feedback directory already exists from previous work
ls tests/webview-ui/shared/components/feedback/  # Should show LoadingDisplay.test.tsx

# Verify directory structure
ls -R tests/webview-ui/shared/components/
```

**Expected Output:**
- tests/webview-ui/shared/components/ui/ directory created
- tests/webview-ui/shared/components/forms/ directory created
- tests/webview-ui/shared/components/navigation/ directory created
- tests/webview-ui/shared/components/feedback/ exists with LoadingDisplay.test.tsx
- No errors about directory creation

### Phase 4: Move UI Component Tests (Atoms → ui/)

**Relocate atomic component tests using git mv:**

**4A: Move Spinner Test**
```bash
# Move Spinner test from atoms to ui
git mv tests/webviews/components/atoms/Spinner.test.tsx tests/webview-ui/shared/components/ui/Spinner.test.tsx

# Verify
ls tests/webview-ui/shared/components/ui/
git status
```

**4B: Move Badge Test**
```bash
# Move Badge test
git mv tests/webviews/components/atoms/Badge.test.tsx tests/webview-ui/shared/components/ui/Badge.test.tsx

# Verify
ls tests/webview-ui/shared/components/ui/
git status
```

**4C: Move StatusDot Test**
```bash
# Move StatusDot test
git mv tests/webviews/components/atoms/StatusDot.test.tsx tests/webview-ui/shared/components/ui/StatusDot.test.tsx

# Verify
ls tests/webview-ui/shared/components/ui/
git status
```

**4D: Move Icon Test**
```bash
# Move Icon test
git mv tests/webviews/components/atoms/Icon.test.tsx tests/webview-ui/shared/components/ui/Icon.test.tsx

# Verify all ui tests
ls tests/webview-ui/shared/components/ui/
git status

# Remove empty atoms directory
git rm -r tests/webviews/components/atoms/
```

**Expected Results After Phase 4:**
- 4 test files moved to tests/webview-ui/shared/components/ui/
- tests/webviews/components/atoms/ directory removed
- git status shows 4 renamed files (preserving history)
- All ui component tests in functional location

### Phase 5: Move Form Component Tests (Molecules → forms/)

**Relocate form component tests using git mv:**

**5A: Move FormField Test**
```bash
# Move FormField test
git mv tests/webviews/components/molecules/FormField.test.tsx tests/webview-ui/shared/components/forms/FormField.test.tsx

# Verify
ls tests/webview-ui/shared/components/forms/
git status
```

**5B: Move ConfigSection Test**
```bash
# Move ConfigSection test
git mv tests/webviews/components/molecules/ConfigSection.test.tsx tests/webview-ui/shared/components/forms/ConfigSection.test.tsx

# Verify all forms tests
ls tests/webview-ui/shared/components/forms/
git status
```

**Expected Results After Phase 5:**
- 2 test files moved to tests/webview-ui/shared/components/forms/
- git status shows 2 renamed files
- Form component tests in functional location

### Phase 6: Move Feedback Component Tests (Molecules → feedback/)

**Relocate feedback component tests using git mv:**

**6A: Move ErrorDisplay Test**
```bash
# Move ErrorDisplay test
git mv tests/webviews/components/molecules/ErrorDisplay.test.tsx tests/webview-ui/shared/components/feedback/ErrorDisplay.test.tsx

# Verify
ls tests/webview-ui/shared/components/feedback/
git status
```

**6B: Move StatusCard Test**
```bash
# Move StatusCard test
git mv tests/webviews/components/molecules/StatusCard.test.tsx tests/webview-ui/shared/components/feedback/StatusCard.test.tsx

# Verify
ls tests/webview-ui/shared/components/feedback/
git status
```

**6C: Move EmptyState Test**
```bash
# Move EmptyState test
git mv tests/webviews/components/molecules/EmptyState.test.tsx tests/webview-ui/shared/components/feedback/EmptyState.test.tsx

# Verify all feedback tests
ls tests/webview-ui/shared/components/feedback/
git status

# Should show 4 files: LoadingDisplay (existed), ErrorDisplay, StatusCard, EmptyState (moved)
```

**Expected Results After Phase 6:**
- 3 test files moved to tests/webview-ui/shared/components/feedback/
- feedback/ now contains 4 test files total (1 existing + 3 moved)
- git status shows 3 renamed files
- All feedback component tests colocated

### Phase 7: Move Navigation Component Tests (Organisms → navigation/)

**Relocate navigation component tests using git mv:**

**7A: Move SearchableList Test**
```bash
# Move SearchableList test
git mv tests/webviews/components/organisms/SearchableList.test.tsx tests/webview-ui/shared/components/navigation/SearchableList.test.tsx

# Verify
ls tests/webview-ui/shared/components/navigation/
git status
```

**7B: Move NavigationPanel Test**
```bash
# Move NavigationPanel test
git mv tests/webviews/components/organisms/NavigationPanel.test.tsx tests/webview-ui/shared/components/navigation/NavigationPanel.test.tsx

# Verify all navigation tests
ls tests/webview-ui/shared/components/navigation/
git status

# Remove empty organisms directory
git rm -r tests/webviews/components/organisms/
```

**Expected Results After Phase 7:**
- 2 test files moved to tests/webview-ui/shared/components/navigation/
- tests/webviews/components/organisms/ directory removed
- git status shows 2 renamed files
- Navigation component tests in functional location

### Phase 8: Clean Up Empty Molecules Directory

**Remove obsolete molecules directory after migration:**

```bash
# Verify molecules directory is now empty (all tests moved)
ls -la tests/webviews/components/molecules/

# If empty, remove directory
git rm -r tests/webviews/components/molecules/

# Verify components directory is now empty
ls -la tests/webviews/components/

# If empty, remove entire obsolete atomic design structure
# (Note: Keep if other tests exist, but mark for cleanup in future steps)
git rm -r tests/webviews/components/

# Verify removal
ls tests/webviews/  # Should show only hooks/ if exists
```

**Expected Results:**
- tests/webviews/components/molecules/ removed
- tests/webviews/components/organisms/ removed (from Phase 7)
- tests/webviews/components/atoms/ removed (from Phase 4)
- tests/webviews/components/ directory removed (atomic design structure eliminated)
- git status shows deleted directories

### Phase 9: Update React Test Utils Imports

**Update import depth for react-test-utils in migrated tests:**

**Critical:** Tests moved from 3-level-deep (tests/webviews/components/atoms/) to 4-level-deep (tests/webview-ui/shared/components/ui/) directories, requiring import path update.

```bash
# Search for react-test-utils imports in migrated tests
grep -r "react-test-utils" tests/webview-ui/shared/components/ --include="*.tsx"

# Expected: All imports use '../../../utils/react-test-utils' (incorrect depth)
# Required: Update to '../../../../utils/react-test-utils' (correct depth)

# Automated update (use sed or manual edit)
# Example for ui/ tests:
find tests/webview-ui/shared/components/ui -name "*.test.tsx" -exec sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' {} \;

# Example for forms/ tests:
find tests/webview-ui/shared/components/forms -name "*.test.tsx" -exec sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' {} \;

# Example for feedback/ tests (only update newly moved tests):
find tests/webview-ui/shared/components/feedback -name "*.test.tsx" ! -name "LoadingDisplay.test.tsx" -exec sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' {} \;

# Example for navigation/ tests:
find tests/webview-ui/shared/components/navigation -name "*.test.tsx" -exec sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' {} \;

# Verify all imports updated
grep -r "react-test-utils" tests/webview-ui/shared/components/ --include="*.tsx"

# Expected: All imports use '../../../../utils/react-test-utils'
```

**Expected Results:**
- All migrated tests use correct import depth (../../../../utils/react-test-utils)
- react-test-utils import resolves correctly
- No import depth mismatches

**Alternative Manual Update:**

If automated sed fails or you prefer manual update:

1. Open each migrated test file
2. Find import statement: `import { ... } from '../../../utils/react-test-utils';`
3. Update to: `import { ... } from '../../../../utils/react-test-utils';`
4. Save file

**Files to Update:**
- tests/webview-ui/shared/components/ui/Spinner.test.tsx
- tests/webview-ui/shared/components/ui/Badge.test.tsx
- tests/webview-ui/shared/components/ui/StatusDot.test.tsx
- tests/webview-ui/shared/components/ui/Icon.test.tsx
- tests/webview-ui/shared/components/forms/FormField.test.tsx
- tests/webview-ui/shared/components/forms/ConfigSection.test.tsx
- tests/webview-ui/shared/components/feedback/ErrorDisplay.test.tsx
- tests/webview-ui/shared/components/feedback/StatusCard.test.tsx
- tests/webview-ui/shared/components/feedback/EmptyState.test.tsx
- tests/webview-ui/shared/components/navigation/SearchableList.test.tsx
- tests/webview-ui/shared/components/navigation/NavigationPanel.test.tsx

### Phase 10: Validate Import Resolution

**Verify all imports resolve correctly:**

```bash
# Run TypeScript compiler (no emit, just type checking)
npx tsc --noEmit

# Should succeed with no errors
echo $?  # Should output: 0

# Check specific imports in migrated tests (optional verification)
grep -n "@/webview-ui/shared/components" tests/webview-ui/shared/components/**/*.test.tsx | head -20

# Verify react-test-utils imports
grep -n "utils/react-test-utils" tests/webview-ui/shared/components/**/*.test.tsx | head -20
```

**Expected Results:**
- TypeScript compiler succeeds
- No import resolution errors
- All component imports via @/webview-ui/ path alias resolve correctly
- All react-test-utils imports resolve to tests/utils/react-test-utils.tsx

**If Errors Occur:**
- Examine error messages for specific import failures
- Common issue 1: react-test-utils import depth incorrect (should be ../../../../)
- Common issue 2: Component path alias misconfigured in jest.config.js
- Fix import statements in affected test files
- Re-run `npx tsc --noEmit` to verify fixes

### Phase 11: Run React Test Suite

**Execute React tests to verify all migrated tests pass:**

```bash
# Run all React tests (jsdom environment)
npm test -- --selectProjects react

# Verify test count (should be 24: 13 existing webview-ui + 11 moved)
npm test -- --selectProjects react --listTests | wc -l

# Run specific test suites to verify migrated tests
npm test -- tests/webview-ui/shared/components/ui
npm test -- tests/webview-ui/shared/components/forms
npm test -- tests/webview-ui/shared/components/feedback
npm test -- tests/webview-ui/shared/components/navigation

# Verify test suite counts
echo "UI components: should show 4 test suites"
npm test -- tests/webview-ui/shared/components/ui --listTests

echo "Forms components: should show 2 test suites"
npm test -- tests/webview-ui/shared/components/forms --listTests

echo "Feedback components: should show 4 test suites (1 existing + 3 moved)"
npm test -- tests/webview-ui/shared/components/feedback --listTests

echo "Navigation components: should show 2 test suites"
npm test -- tests/webview-ui/shared/components/navigation --listTests
```

**Expected Results:**
- All React tests pass (no failures)
- Test count: 24 React test files (13 existing + 11 migrated)
- UI components: 4 test suites (Spinner, Badge, StatusDot, Icon)
- Forms components: 2 test suites (FormField, ConfigSection)
- Feedback components: 4 test suites (LoadingDisplay, ErrorDisplay, StatusCard, EmptyState)
- Navigation components: 2 test suites (SearchableList, NavigationPanel)
- Jest uses jsdom environment for all migrated tests

**If Tests Fail:**
1. Examine failure messages for specific test/import issues
2. Check that react-test-utils imports use correct depth (../../../../)
3. Verify component imports use correct path aliases (@/webview-ui/)
4. Check that jest.config.js React project testMatch includes `**/tests/webview-ui/**/*.test.tsx`
5. Re-run `npx tsc --noEmit` to validate imports
6. Fix issues and re-run tests

### Phase 12: Run Full Test Suite

**Execute all tests to verify no regressions:**

```bash
# Run all tests (Node + React)
npm test

# Verify overall test count (should be 100: 89 Node + 11 migrated React = 100)
# (Note: 89 Node from Steps 1-2, 11 React moved from webviews to webview-ui, 13 existing webview-ui = 24 React total)
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l

# List all React tests
npm test -- --selectProjects react --listTests

# List all Node tests
npm test -- --selectProjects node --listTests
```

**Expected Results:**
- All tests pass (no failures)
- Test count: 100 files total (76 Node tests + 24 React tests)
- React tests: 24 files (13 existing webview-ui + 11 migrated from webviews)
- Node tests: 76 files (unchanged from Steps 1-2, as only React tests migrated in Step 3)
- No atomic design tests remain in tests/webviews/components/ (directory deleted)

**If Tests Fail:**
1. Identify failing tests via `npm test` output
2. Check if failures are in migrated tests or unrelated tests
3. For migrated tests: Verify import paths and depth
4. For unrelated tests: May indicate unintentional changes during migration
5. Fix issues and re-run full test suite

### Phase 13: Commit Migration

**Create atomic commit for this migration step:**

```bash
# Stage all changes
git add -A

# Verify what will be committed
git status

# Expected changes:
# - 11 files renamed (tests/webviews/components/* → tests/webview-ui/shared/components/*)
# - 3 directories deleted (atoms/, molecules/, organisms/)
# - 1 directory deleted (tests/webviews/components/)
# - 11 files modified (import depth updates for react-test-utils)
# - 3 directories created (ui/, forms/, navigation/)

# Create commit with descriptive message
git commit -m "test: migrate webview component tests from atomic design to functional structure (Step 3)

- Flatten atomic design hierarchy (atoms/molecules/organisms → ui/forms/feedback/navigation)
- Move 4 ui component tests to tests/webview-ui/shared/components/ui/
- Move 2 form component tests to tests/webview-ui/shared/components/forms/
- Move 3 feedback component tests to tests/webview-ui/shared/components/feedback/
- Move 2 navigation component tests to tests/webview-ui/shared/components/navigation/
- Update react-test-utils imports for new directory depth (../../../../)
- Remove obsolete atomic design structure (tests/webviews/components/)
- All React tests passing, imports using correct path aliases
- Git history preserved via git mv

Webview tests: 24 files total (13 existing + 11 migrated)
Functional structure: ui/ (4 tests), forms/ (2 tests), feedback/ (4 tests), navigation/ (2 tests)
Coverage: Maintained at 80%+

Part of test reorganization plan (Step 3/7)"
```

**Expected Results:**
- Single atomic commit with all migration changes
- Commit message clearly describes atomic design to functional structure transformation
- Git history preserved for all moved files
- Clean working directory after commit
- Tests passing in CI/CD (if applicable)

---

## Detailed File Migration Map

### Files to MOVE (Atomic Design → Functional Structure)

#### Atoms → UI Components

| Source Path (Atomic Design) | Destination Path (Functional) | Source Code Location | Reason |
|----------------------------|-------------------------------|---------------------|--------|
| `tests/webviews/components/atoms/Spinner.test.tsx` | `tests/webview-ui/shared/components/ui/Spinner.test.tsx` | `webview-ui/src/shared/components/ui/Spinner.tsx` | Basic UI component (loading indicator) |
| `tests/webviews/components/atoms/Badge.test.tsx` | `tests/webview-ui/shared/components/ui/Badge.test.tsx` | `webview-ui/src/shared/components/ui/Badge.tsx` | Basic UI component (status badge) |
| `tests/webviews/components/atoms/StatusDot.test.tsx` | `tests/webview-ui/shared/components/ui/StatusDot.test.tsx` | `webview-ui/src/shared/components/ui/StatusDot.tsx` | Basic UI component (status indicator) |
| `tests/webviews/components/atoms/Icon.test.tsx` | `tests/webview-ui/shared/components/ui/Icon.test.tsx` | `webview-ui/src/shared/components/ui/Icon.tsx` | Basic UI component (icon wrapper) |

#### Molecules → Form Components

| Source Path (Atomic Design) | Destination Path (Functional) | Source Code Location | Reason |
|----------------------------|-------------------------------|---------------------|--------|
| `tests/webviews/components/molecules/FormField.test.tsx` | `tests/webview-ui/shared/components/forms/FormField.test.tsx` | `webview-ui/src/shared/components/forms/FormField.tsx` | Form-related component (field wrapper) |
| `tests/webviews/components/molecules/ConfigSection.test.tsx` | `tests/webview-ui/shared/components/forms/ConfigSection.test.tsx` | `webview-ui/src/shared/components/forms/ConfigSection.tsx` | Form-related component (configuration section) |

#### Molecules → Feedback Components

| Source Path (Atomic Design) | Destination Path (Functional) | Source Code Location | Reason |
|----------------------------|-------------------------------|---------------------|--------|
| `tests/webviews/components/molecules/ErrorDisplay.test.tsx` | `tests/webview-ui/shared/components/feedback/ErrorDisplay.test.tsx` | `webview-ui/src/shared/components/feedback/ErrorDisplay.tsx` | User feedback component (error messages) |
| `tests/webviews/components/molecules/StatusCard.test.tsx` | `tests/webview-ui/shared/components/feedback/StatusCard.test.tsx` | `webview-ui/src/shared/components/feedback/StatusCard.tsx` | User feedback component (status display) |
| `tests/webviews/components/molecules/EmptyState.test.tsx` | `tests/webview-ui/shared/components/feedback/EmptyState.test.tsx` | `webview-ui/src/shared/components/feedback/EmptyState.tsx` | User feedback component (empty list placeholder) |

#### Organisms → Navigation Components

| Source Path (Atomic Design) | Destination Path (Functional) | Source Code Location | Reason |
|----------------------------|-------------------------------|---------------------|--------|
| `tests/webviews/components/organisms/SearchableList.test.tsx` | `tests/webview-ui/shared/components/navigation/SearchableList.test.tsx` | `webview-ui/src/shared/components/navigation/SearchableList.tsx` | Navigation component (searchable list UI) |
| `tests/webviews/components/organisms/NavigationPanel.test.tsx` | `tests/webview-ui/shared/components/navigation/NavigationPanel.test.tsx` | `webview-ui/src/shared/components/navigation/NavigationPanel.tsx` | Navigation component (panel for navigation) |

### Directories to DELETE (Obsolete Atomic Design Structure)

| Directory Path | Reason for Deletion |
|---------------|---------------------|
| `tests/webviews/components/atoms/` | Atomic design pattern replaced by functional categorization (ui/) |
| `tests/webviews/components/molecules/` | Atomic design pattern replaced by functional categorization (forms/, feedback/) |
| `tests/webviews/components/organisms/` | Atomic design pattern replaced by functional categorization (navigation/) |
| `tests/webviews/components/` | Parent directory empty after atomic design subdirectories removed |

### Directories to CREATE (Functional Structure)

| Directory Path | Purpose |
|---------------|---------|
| `tests/webview-ui/shared/components/ui/` | Basic UI components (atoms → ui) |
| `tests/webview-ui/shared/components/forms/` | Form-related components (molecules → forms) |
| `tests/webview-ui/shared/components/navigation/` | Navigation components (organisms → navigation) |

**Note:** `tests/webview-ui/shared/components/feedback/` already exists with LoadingDisplay.test.tsx (3 molecules tests added here)

### Import Updates Required

**Before Migration:**
```typescript
// From 3-level-deep directory: tests/webviews/components/atoms/Spinner.test.tsx
import { renderWithProviders, screen } from '../../../utils/react-test-utils';
import { Spinner } from '@/webview-ui/shared/components/ui/Spinner';
```

**After Migration:**
```typescript
// From 4-level-deep directory: tests/webview-ui/shared/components/ui/Spinner.test.tsx
import { renderWithProviders, screen } from '../../../../utils/react-test-utils';
import { Spinner } from '@/webview-ui/shared/components/ui/Spinner';
```

**Change Required:** Update relative import depth from `../../../` (3 levels) to `../../../../` (4 levels)

**Component Imports:** No changes needed (already use @/webview-ui/ path alias)

---

## Expected Outcome

**After Successful Completion:**

- [ ] **File Count:** 100 test files total (76 Node + 24 React)
- [ ] **React Tests:** 24 files (13 existing webview-ui + 11 migrated from webviews)
- [ ] **Directory Structure:**
  - tests/webview-ui/shared/components/ui/ contains 4 tests (Spinner, Badge, StatusDot, Icon)
  - tests/webview-ui/shared/components/forms/ contains 2 tests (FormField, ConfigSection)
  - tests/webview-ui/shared/components/feedback/ contains 4 tests (LoadingDisplay, ErrorDisplay, StatusCard, EmptyState)
  - tests/webview-ui/shared/components/navigation/ contains 2 tests (SearchableList, NavigationPanel)
  - tests/webviews/components/ directory completely removed
- [ ] **All Tests Passing:** `npm test` succeeds with no failures
- [ ] **Import Resolution:** `npx tsc --noEmit` succeeds with no errors
- [ ] **Git History:** `git log --follow` shows complete history for moved files
- [ ] **Test Coverage:** Maintained at 80%+ (no reduction from reorganization)
- [ ] **Functional Structure:** Atomic design pattern eliminated, functional categorization implemented

**What Works After This Step:**
- React component tests execute in functional structure locations
- Clear mapping between test location and component location in webview-ui/src/
- No obsolete atomic design structure remains
- Foundation for remaining migration steps (Steps 4-7)

---

## Acceptance Criteria

- [ ] All tests passing for this step (`npm test` succeeds)
- [ ] Test count: 100 files total (76 Node + 24 React, verified via `find tests -name "*.test.ts*" | wc -l`)
- [ ] tests/webviews/components/ directory no longer exists
- [ ] tests/webview-ui/shared/components/ has ui/, forms/, feedback/, navigation/ subdirectories
- [ ] All migrated tests use correct react-test-utils import depth (../../../../utils/react-test-utils)
- [ ] All component imports use @/webview-ui/ path aliases
- [ ] TypeScript compiler succeeds (`npx tsc --noEmit`)
- [ ] React tests use jsdom environment (verify via test output or jest config)
- [ ] Git history preserved for all moved files
- [ ] Coverage maintained at 80%+ (verify via coverage report)
- [ ] Single atomic commit with descriptive message
- [ ] No console.log or debugger statements introduced
- [ ] No broken imports or path resolution errors

---

## Dependencies

**Files This Step Depends On:**
- tests/webviews/components/atoms/*.test.tsx (4 files to migrate)
- tests/webviews/components/molecules/*.test.tsx (5 files to migrate)
- tests/webviews/components/organisms/*.test.tsx (2 files to migrate)
- tests/utils/react-test-utils.tsx (imported by all migrated tests)
- jest.config.js (React project testMatch patterns must support new locations)
- tsconfig.json (path aliases must be correctly configured)

**Files This Step Modifies:**
- 11 test files moved from tests/webviews/components/ to tests/webview-ui/shared/components/
- 11 test files modified (import depth updates)
- tests/ directory structure (3 new subdirectories created, 4 obsolete directories removed)

**Files This Step Does NOT Modify:**
- jest.config.js (no changes needed - existing patterns work)
- tsconfig.json (no changes needed - path aliases already configured)
- tests/utils/react-test-utils.tsx (utility file location unchanged)
- Any source files in webview-ui/src/ (pure test reorganization)

**Subsequent Steps That Depend on This:**
- Step 4: Migrate webview hook tests (may consolidate duplicates from tests/webviews/hooks/)
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

# Verify tests/webviews/components/ structure restored
ls -R tests/webviews/components/  # Should show atoms/, molecules/, organisms/
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
ls -R tests/webviews/components/  # Should show atoms/, molecules/, organisms/
ls tests/webview-ui/shared/components/  # Should only show feedback/, layout/ (pre-migration state)
```

**Partial Rollback (Fix Specific Issues):**
```bash
# Restore specific file from previous commit
git checkout HEAD~1 -- tests/webviews/components/atoms/Spinner.test.tsx

# Re-run tests to verify
npm test -- tests/webviews/components/atoms
```

**Validation After Rollback:**
- [ ] All tests passing
- [ ] tests/webviews/components/ directory exists with atoms/, molecules/, organisms/ subdirectories
- [ ] tests/webview-ui/shared/components/ only has feedback/, layout/ subdirectories (pre-migration state)
- [ ] No broken imports or missing test files
- [ ] Test count: 100 files (unchanged, but in original locations)

---

## Common Issues and Solutions

### Issue 1: React Test Utils Import Depth Error

**Symptom:** TypeScript errors like "Cannot find module '../../../utils/react-test-utils'"

**Cause:** Import depth not updated after moving tests from 3-level to 4-level directory structure

**Solution:**
```bash
# Check current import in failing test
grep -n "react-test-utils" tests/webview-ui/shared/components/ui/Spinner.test.tsx

# Should be: import { ... } from '../../../../utils/react-test-utils';
# If incorrect: import { ... } from '../../../utils/react-test-utils';

# Fix import manually or use sed:
sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' tests/webview-ui/shared/components/ui/Spinner.test.tsx

# Re-run TypeScript compiler
npx tsc --noEmit
```

### Issue 2: Jest Uses Wrong Test Environment (Node instead of jsdom)

**Symptom:** Test failures with "ReferenceError: document is not defined" or "screen is not defined"

**Cause:** Jest testMatch pattern fails to categorize tests as React tests, uses Node environment

**Solution:**
```bash
# Check which environment Jest uses for test
npm test -- tests/webview-ui/shared/components/ui/Spinner.test.tsx

# Verify jest.config.js React project testMatch patterns
cat jest.config.js | grep -A 10 "testMatch"

# React project should match: '**/tests/webview-ui/**/*.test.tsx'
# Verify pattern includes new test location

# If pattern missing, update jest.config.js testMatch
# Add: '**/tests/webview-ui/**/*.test.tsx'
```

### Issue 3: Component Import Path Alias Fails

**Symptom:** TypeScript errors like "Cannot find module '@/webview-ui/shared/components/ui/Spinner'"

**Cause:** Path alias misconfigured in jest.config.js or component moved in src/

**Solution:**
```bash
# Verify component exists at expected location
ls webview-ui/src/shared/components/ui/Spinner.tsx

# Check jest.config.js moduleNameMapper for @/webview-ui alias
cat jest.config.js | grep -A 5 "moduleNameMapper"

# React project should have:
# '^@/webview-ui/(.*)$': '<rootDir>/webview-ui/src/$1'

# If alias missing or incorrect, update jest.config.js
# Re-run TypeScript compiler
npx tsc --noEmit
```

### Issue 4: Git History Lost After Flattening

**Symptom:** `git log --follow` doesn't show history before move from atoms/ to ui/

**Cause:** Used copy/delete instead of git mv

**Solution:**
```bash
# If caught before commit:
git reset HEAD
# Redo migration using git mv commands from Phases 4-7

# If caught after commit:
# History is still preserved, but --follow flag needed
git log --follow tests/webview-ui/shared/components/ui/Spinner.test.tsx

# Should show commits from when file was in tests/webviews/components/atoms/
# If not, history was lost - consider reverting and redoing with git mv
```

### Issue 5: Sed Command Fails on Import Updates

**Symptom:** sed command doesn't update imports, or creates backup files (.bak)

**Cause:** Different sed behavior on macOS vs Linux, or sed not installed

**Solution:**
```bash
# macOS sed requires -i '' for in-place edit without backup
# Linux sed uses -i for in-place edit

# For macOS:
sed -i '' 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' <file>

# For Linux:
sed -i 's|../../../utils/react-test-utils|../../../../utils/react-test-utils|g' <file>

# Alternative: Manual update
# Open each test file in editor, update import depth manually
```

### Issue 6: Atomic Design Directories Not Fully Removed

**Symptom:** `ls tests/webviews/components/` shows atoms/, molecules/, or organisms/ still exist

**Cause:** git rm -r not executed, or hidden files remain

**Solution:**
```bash
# Remove directories explicitly
git rm -r tests/webviews/components/atoms/
git rm -r tests/webviews/components/molecules/
git rm -r tests/webviews/components/organisms/

# Verify removal
ls -la tests/webviews/components/

# If parent directory now empty, remove it
git rm -r tests/webviews/components/

# Commit cleanup
git add -A
git commit --amend  # Add to Step 3 commit
```

---

## Cross-References

**Related Plan Sections:**
- Overview.md: Overall test reorganization strategy
- Overview.md Risk Assessment: Import resolution failures, Jest configuration issues
- Step 1: Utils test migration (established path alias validation pattern)
- Step 2: Command handler migration (established feature colocation pattern)
- Step 4: Webview hook tests migration (continues webview test organization)
- Step 6: Jest config update (integrates all migration steps)

**Related Documentation:**
- jest.config.js: React project testMatch patterns and path aliases
- tsconfig.json: Path alias configuration for @/webview-ui/
- tests/utils/react-test-utils.tsx: Shared React testing utilities

**Related Source Files:**
- webview-ui/src/shared/components/ui/Spinner.tsx, Badge.tsx, StatusDot.tsx, Icon.tsx
- webview-ui/src/shared/components/forms/FormField.tsx, ConfigSection.tsx
- webview-ui/src/shared/components/feedback/ErrorDisplay.tsx, StatusCard.tsx, EmptyState.tsx, LoadingDisplay.tsx
- webview-ui/src/shared/components/navigation/SearchableList.tsx, NavigationPanel.tsx

---

## Verification Commands Summary

**Quick validation checklist:**

```bash
# 1. Pre-migration validation
npm test && npx tsc --noEmit && git status

# 2. Post-migration validation
find tests -name "*.test.ts" -o -name "*.test.tsx" | wc -l  # Should show 100
npm test  # Should pass all tests
npx tsc --noEmit  # Should have no errors

# 3. Verify directory structure
ls -R tests/webview-ui/shared/components/
ls tests/webviews/components/ 2>&1 | grep "No such file or directory"  # Should be deleted

# 4. Verify test count by category
find tests/webview-ui/shared/components/ui -name "*.test.tsx" | wc -l  # Should show 4
find tests/webview-ui/shared/components/forms -name "*.test.tsx" | wc -l  # Should show 2
find tests/webview-ui/shared/components/feedback -name "*.test.tsx" | wc -l  # Should show 4
find tests/webview-ui/shared/components/navigation -name "*.test.tsx" | wc -l  # Should show 2

# 5. Verify git history preserved
git log --follow tests/webview-ui/shared/components/ui/Spinner.test.tsx
git log --follow tests/webview-ui/shared/components/forms/FormField.test.tsx
git log --follow tests/webview-ui/shared/components/feedback/ErrorDisplay.test.tsx
git log --follow tests/webview-ui/shared/components/navigation/SearchableList.test.tsx

# 6. Verify specific test suites pass
npm test -- tests/webview-ui/shared/components/ui
npm test -- tests/webview-ui/shared/components/forms
npm test -- tests/webview-ui/shared/components/feedback
npm test -- tests/webview-ui/shared/components/navigation

# 7. Verify React tests use jsdom environment
npm test -- --selectProjects react  # Should run 24 React tests
npm test -- --selectProjects node   # Should run 76 Node tests

# 8. Verify import updates
grep -r "utils/react-test-utils" tests/webview-ui/shared/components/ --include="*.tsx"
# All should show: '../../../../utils/react-test-utils'
```

---

_Step 3 implementation ready for TDD execution_
_Previous Step: Step 2 - Migrate feature handler tests (completed)_
_Next Step: Step 4 - Migrate webview hook tests (step-04.md)_
