# Step 4: Fix Type/Export Mismatches

## Summary

Update test files to use renamed type exports after refactoring. Primary issue: `LoadingDisplayPresets` was renamed to `LoadingDisplayProps`, causing import failures in test files.

---

## Purpose

Resolve TypeScript compilation errors in tests caused by imports referencing old export names that were renamed during the codebase refactor.

---

## Prerequisites

- [x] Step 1 complete (jest-dom matchers configured)
- [x] Step 2 complete (test file paths updated)
- [x] Step 3 complete (logger interface mismatches fixed)

---

## Tests to Write First

**Verification Tests** (confirm fixes work):

- [x] **Test:** LoadingDisplay tests compile and run
  - **Given:** LoadingDisplay.test.tsx with updated imports
  - **When:** Run `npm test LoadingDisplay.test.tsx`
  - **Then:** Tests pass without TypeScript errors
  - **File:** `tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx`

- [x] **Test:** Full test suite shows improved pass count
  - **Given:** All renamed exports updated
  - **When:** Run `npm test`
  - **Then:** ~3 additional tests pass (fewer failures than before)

---

## Files to Modify

- [x] `tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx`
  - Update `LoadingDisplayPresets` → `LoadingDisplayProps`
  - Verify all type imports from LoadingDisplay component

- [x] Search and update any other tests with renamed imports
  - Use Grep to find other instances of old export names

---

## Implementation Details

### RED Phase (Current State - Failing)

**Current Error:**
```typescript
// TypeScript compilation error
Error: Module '"@/webviews/shared/components/feedback/LoadingDisplay"'
has no exported member named 'LoadingDisplayPresets'.
Did you mean 'LoadingDisplayProps'?
```

**Failing Tests:**
- LoadingDisplay.test.tsx cannot compile
- Other tests with similar renamed import issues

### GREEN Phase (Minimal Implementation)

**Step 1: Identify All Renamed Exports**

```bash
# Search for problematic imports in test files
grep -r "LoadingDisplayPresets" tests/
```

**Step 2: Update Import Statements**

In `tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx`:

```typescript
// BEFORE (incorrect)
import { LoadingDisplay, LoadingDisplayPresets } from '@/webviews/shared/components/feedback/LoadingDisplay';

// AFTER (correct)
import { LoadingDisplay, LoadingDisplayProps } from '@/webviews/shared/components/feedback/LoadingDisplay';
```

**Step 3: Update Type Usage**

If the type is used in test code, update references:

```typescript
// BEFORE
const props: LoadingDisplayPresets = { ... };

// AFTER
const props: LoadingDisplayProps = { ... };
```

**Step 4: Verify Compilation**

```bash
# Run TypeScript compilation
npm run build

# Run affected tests
npm test LoadingDisplay.test.tsx
```

**Step 5: Search for Other Renamed Exports**

```bash
# Check for other common renamed patterns
grep -r "Presets" tests/ | grep "import"
```

### REFACTOR Phase (Improve Quality)

**1. Verify Consistency**
- Ensure all import statements use current export names
- Check that no old export names remain in test files

**2. Document Pattern**
- If multiple types were renamed, document the mapping for future reference

**3. Run Full Test Suite**
```bash
npm test
```

**4. Confirm Improvement**
- Note new passing test count
- Verify ~3 tests now pass that were previously failing

---

## Expected Outcome

**After Step 4 Completion:**

- **Tests Fixed:** ~3 tests now passing
- **Remaining Failures:** ~55 (down from ~58)
- **TypeScript Compilation:** No errors in LoadingDisplay.test.tsx
- **Import Statements:** All use renamed export names

**Demonstrable:**
```bash
npm test LoadingDisplay.test.tsx
# ✓ Should pass without import errors

npm test
# Should show ~3 fewer failures than before
```

---

## Acceptance Criteria

- [x] All import statements updated to use renamed exports
- [x] `LoadingDisplay.test.tsx` compiles without TypeScript errors
- [x] `LoadingDisplay.test.tsx` tests pass
- [x] No remaining references to `LoadingDisplayPresets` in test files
- [x] Test suite shows ~3 additional passing tests
- [x] No new test failures introduced

---

## Dependencies

**No New Dependencies Required**

This step only updates existing test files to match refactored code exports.

---

## Estimated Time

**15-20 minutes**

- Search for renamed exports: 5 minutes
- Update import statements: 5 minutes
- Verify and test: 5-10 minutes
