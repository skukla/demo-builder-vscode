# Step 1: Magic Timeout Constants

## Purpose

Fix 2 HIGH priority magic timeout violations per SOP code-patterns.md Section 1.

## Prerequisites

- Understanding of FRONTEND_TIMEOUTS pattern in `src/core/ui/utils/frontendTimeouts.ts`

## Tests to Write First (RED phase)

### Test 1.1: Verify FRONTEND_TIMEOUTS exports DOUBLE_CLICK_PREVENTION

```typescript
// In: tests/core/ui/utils/frontendTimeouts.test.ts
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

describe('FRONTEND_TIMEOUTS', () => {
  it('should export DOUBLE_CLICK_PREVENTION constant', () => {
    expect(FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION).toBe(1000);
  });

  it('should export MICROTASK_DEFER constant', () => {
    // Already exists but verify it's still present
    expect(FRONTEND_TIMEOUTS.MICROTASK_DEFER).toBe(0);
  });
});
```

## Files to Modify

| File | Change |
|------|--------|
| `src/core/ui/utils/frontendTimeouts.ts` | Add `DOUBLE_CLICK_PREVENTION: 1000` constant |
| `src/features/dashboard/ui/ProjectDashboardScreen.tsx` | Import `FRONTEND_TIMEOUTS`, use for double-click prevention |
| `src/features/components/ui/hooks/useConfigNavigation.ts` | Replace magic `0` with `FRONTEND_TIMEOUTS.MICROTASK_DEFER` |

## Implementation Details

### RED Phase

Write failing test for `DOUBLE_CLICK_PREVENTION` constant (the constant doesn't exist yet).

### GREEN Phase

#### 1. Add constant to frontendTimeouts.ts

Add `DOUBLE_CLICK_PREVENTION` after `LOADING_MIN_DISPLAY`:

```typescript
/**
 * Double-click prevention delay for buttons that open external resources.
 * Prevents multiple browser tabs from opening on rapid clicks.
 */
DOUBLE_CLICK_PREVENTION: 1000,
```

#### 2. Fix ProjectDashboardScreen.tsx:169

File already imports `TIMEOUTS` from backend. Add import for `FRONTEND_TIMEOUTS`:

```typescript
// Add to imports
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

// Line 169 - Before:
setTimeout(() => setIsOpeningBrowser(false), 1000);

// After:
setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
```

#### 3. Fix useConfigNavigation.ts:212

File already imports `FRONTEND_TIMEOUTS` (line 2). `MICROTASK_DEFER` already exists (line 47 of frontendTimeouts.ts):

```typescript
// Line 212 - Before:
const scrollTimeout = setTimeout(() => navigateToSection(sectionId), 0);

// After:
const scrollTimeout = setTimeout(() => navigateToSection(sectionId), FRONTEND_TIMEOUTS.MICROTASK_DEFER);
```

### REFACTOR Phase

- Verify JSDoc comments are clear and consistent
- Confirm no other magic timeout usages remain in these files

## Expected Outcome

- 2 magic timeout violations resolved
- `DOUBLE_CLICK_PREVENTION` constant documented with clear purpose
- Both files use named constants instead of magic numbers

## Acceptance Criteria

- [ ] `FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION` exists with value 1000
- [ ] `FRONTEND_TIMEOUTS.MICROTASK_DEFER` still exists with value 0
- [ ] `ProjectDashboardScreen.tsx:169` uses `FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION`
- [ ] `useConfigNavigation.ts:212` uses `FRONTEND_TIMEOUTS.MICROTASK_DEFER`
- [ ] All existing tests pass
- [ ] TypeScript compilation succeeds

## Dependencies

- None (independent step)

## Estimated Time

- 15 minutes
