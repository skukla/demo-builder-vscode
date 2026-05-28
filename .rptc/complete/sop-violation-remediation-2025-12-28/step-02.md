# Step 2: Fix Nested Ternaries

## Summary
Verify and refactor any remaining nested ternary operators to helper functions with explicit if/else chains.

## Prerequisites
- Step 1 complete (optional - independent step)

## Current Status
Several nested ternaries have already been refactored with documented patterns:
- `stepStatusHelpers.ts` - `getStepStatus()` function
- `wizardHelpers.ts` - `getNextButtonText()` function
- `installHandler.ts` - `getTargetNodeVersions()` function

## Tests to Write First (RED Phase)

- [ ] Test helper function returns correct value for primary condition
- [ ] Test helper function returns correct value for secondary condition
- [ ] Test helper function returns default for fallback case
- [ ] Test edge cases (null/undefined inputs where applicable)

## Pattern: Extract to Named Helper Function

**Before (nested ternary):**
```typescript
const status = hasValue ? (isCompleted ? 'completed' : 'pending') : 'empty';
```

**After (explicit helper):**
```typescript
function getStepStatus(hasValue: boolean, isCompleted: boolean): 'completed' | 'pending' | 'empty' {
    if (!hasValue) return 'empty';
    if (isCompleted) return 'completed';
    return 'pending';
}
```

## Files to Verify/Modify

- [ ] `src/features/project-creation/ui/components/stepStatusHelpers.ts` - Already refactored
- [ ] `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Already refactored
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Already refactored
- [ ] Run search to confirm no remaining nested ternaries

## Implementation Details (GREEN Phase)

1. Search for remaining nested ternary patterns: `? .* ? .* : .* :`
2. For each found instance:
   - Create helper function with descriptive name
   - Use explicit if/else or early returns
   - Add JSDoc comment documenting the extracted pattern
3. Replace inline ternary with helper call

## Expected Outcome
- [x] 0 nested ternaries remaining in codebase
- [x] All logic in named helper functions with JSDoc
- [x] Search confirms no violations

## Acceptance Criteria
- [x] `grep -rn '? .* ? .* : .* :' src/` returns only comments
- [x] All tests pass
- [x] No behavior changes

## Estimated Time
30 minutes (mostly verification)

---

## Completion Notes

**Status:** ✅ Complete
**Date:** 2025-12-29
**Tests Added:** 7 (shouldShowWizardFooter + getNextButtonText edit mode)
**Full Suite:** 5998 tests passing
**Finding:** All nested ternaries already refactored - filled test coverage gap
