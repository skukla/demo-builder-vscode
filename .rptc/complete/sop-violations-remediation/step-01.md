# Step 1: Magic Timeout Constants

**Status:** ✅ Complete
**Priority:** HIGH
**Effort:** ~30 minutes
**Risk:** Low
**Completed:** 2025-12-31

---

## Purpose

Replace hardcoded timeout/delay values with semantic constants from the established FRONTEND_TIMEOUTS pattern.

---

## Files to Fix

### 1. `src/core/ui/components/TimelineNav.tsx`
- **Issue:** Uses hardcoded delay values
- **Fix:** Import `FRONTEND_TIMEOUTS` from `@/core/ui/utils/frontendTimeouts`

### 2. `src/features/eds/ui/steps/DaLiveSetupStep.tsx:30`
- **Issue:** `setTimeout(..., 2000)` magic number
- **Fix:** Use `FRONTEND_TIMEOUTS.ANIMATION_SETTLE` or appropriate semantic constant

---

## Implementation Pattern

```typescript
// BEFORE (magic number)
setTimeout(() => setStep('next'), 2000);

// AFTER (semantic constant)
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
setTimeout(() => setStep('next'), FRONTEND_TIMEOUTS.ANIMATION_SETTLE);
```

---

## Tests to Write First

### Test Scenarios
1. **TimelineNav uses FRONTEND_TIMEOUTS**: Verify no hardcoded numbers
2. **DaLiveSetupStep uses FRONTEND_TIMEOUTS**: Verify semantic constants

### Test Approach
- Grep-based verification that no magic timeout numbers exist in UI components
- Run existing tests to verify no regressions

---

## Expected Outcome

- No raw numeric timeouts in UI components
- All timeouts use `FRONTEND_TIMEOUTS.*` or `TIMEOUTS.*` constants
- Constants have clear semantic names

---

## Acceptance Criteria

- [x] TimelineNav.tsx uses FRONTEND_TIMEOUTS constants
- [x] DaLiveSetupStep.tsx - **N/A**: setTimeout is inside bookmarklet code (browser-executed, not extension code)
- [x] No hardcoded timeout numbers in UI components
- [x] All existing tests pass (5 new SOP tests + full suite)

---

## Implementation Notes

### Changes Made

1. **Added two new constants to `src/core/ui/utils/frontendTimeouts.ts`**:
   - `ANIMATION_SETTLE: 300` - Duration for CSS animations and transitions
   - `INIT_ANIMATION_DELAY: 500` - Delay before enabling animations after initial render

2. **Updated `src/core/ui/components/TimelineNav.tsx`**:
   - Replaced `const ANIMATION_DURATION = 300` with `FRONTEND_TIMEOUTS.ANIMATION_SETTLE`
   - Replaced local `INIT_DELAY_MS = 500` with `FRONTEND_TIMEOUTS.INIT_ANIMATION_DELAY`

3. **Created SOP compliance test `tests/sop/magic-timeouts.test.ts`**:
   - Detects magic timeout patterns in UI components
   - Allows `FRONTEND_TIMEOUTS.*` and `TIMEOUTS.*` usage
   - Excludes bookmarklet code from validation

### DaLiveSetupStep.tsx Analysis

Investigation revealed the `setTimeout(..., 800)` is inside bookmarklet code:
```typescript
javascript:window.dnt=(()=>{...; setTimeout(()=>s.remove(),800); ...})()
```
This is intentionally standalone - bookmarklet runs in the browser, not the extension context. Not a violation.
