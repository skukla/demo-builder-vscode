# Step 1: Fix Magic Timeouts

## Summary

Replace 3 hardcoded timeout values with centralized FRONTEND_TIMEOUTS constants from `@/core/ui/utils/frontendTimeouts`.

## Prerequisites

- None (first step)

## Tests to Write First (RED Phase)

### Test 1: Verify constant usage in SearchableList

- [ ] Test that SearchableList scroll delay uses FRONTEND_TIMEOUTS.SCROLL_SETTLE
- [ ] Verify scroll behavior remains unchanged (200ms delay)

### Test 2: Verify constant usage in useFieldFocusTracking

- [ ] Test that focus tracking scroll delay uses FRONTEND_TIMEOUTS.SCROLL_ANIMATION
- [ ] Verify scroll behavior remains unchanged (150ms delay)

### Test 3: Verify constant usage in useComponentSelection

- [ ] Test that debounce delay uses FRONTEND_TIMEOUTS constant
- [ ] Verify debounce behavior remains unchanged (500ms delay)

## Files to Modify

### File 1: `src/core/ui/utils/frontendTimeouts.ts`

**Changes**: Add COMPONENT_DEBOUNCE constant (500ms) if not present
**Pattern**: Follow existing naming convention

### File 2: `src/core/ui/components/navigation/SearchableList.tsx`

**Changes**: Replace `}, 200);` with `}, FRONTEND_TIMEOUTS.SCROLL_SETTLE);`
**Line**: ~212
**Import**: Add `import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';`

### File 3: `src/features/dashboard/ui/configure/hooks/useFieldFocusTracking.ts`

**Changes**: Replace `}, 150);` with `}, FRONTEND_TIMEOUTS.SCROLL_ANIMATION);`
**Line**: ~97
**Import**: Add `import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';`

### File 4: `src/features/components/ui/hooks/useComponentSelection.ts`

**Changes**: Replace `500` in useDebouncedValue calls with `FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE`
**Lines**: 64-69 (6 occurrences)
**Import**: Add `import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';`

## Implementation Details (GREEN Phase)

1. Add constant to frontendTimeouts.ts if needed:
   ```typescript
   COMPONENT_DEBOUNCE: 500,  // Debounce delay for component selection changes
   ```

2. Update each file with import and constant usage

3. Verify existing constants match values:
   - SCROLL_SETTLE: 200 (matches SearchableList)
   - SCROLL_ANIMATION: 150 (matches useFieldFocusTracking)

## Refactor Notes

- All frontend timeout values should use FRONTEND_TIMEOUTS
- Backend code uses TIMEOUTS from timeoutConfig.ts
- Keep values in sync between frontend and backend where applicable

## Expected Outcome

- [x] 0 magic timeout values in identified files
- [x] All timeouts use FRONTEND_TIMEOUTS.* constants
- [x] No behavior changes (same delay values)

## Acceptance Criteria

- [x] SearchableList uses FRONTEND_TIMEOUTS.SCROLL_SETTLE
- [x] useFieldFocusTracking uses FRONTEND_TIMEOUTS.SCROLL_ANIMATION
- [x] useComponentSelection uses FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE
- [x] No TypeScript errors
- [x] Existing tests pass

---

## Completion Notes

**Status:** ✅ Complete
**Date:** 2025-12-29
**Tests Added:** 2 (COMPONENT_DEBOUNCE constant tests)
**Full Suite:** 5991 tests passing
