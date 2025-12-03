# Step 3: Add Progress Duration Constants

## Purpose

Centralize progress duration magic numbers in TIMEOUTS config to comply with SOP §1.

## Files to Modify

- `src/core/utils/timeoutConfig.ts` - Add constants
- `src/core/utils/progressUnifier.ts:540-541` - Use constants

## Tests to Write First

**Minimal new test** - verify constants exist:

```typescript
it('should export progress duration constants', () => {
    expect(TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT).toBe(500);
    expect(TIMEOUTS.PROGRESS_MIN_DURATION_CAP).toBe(1000);
});
```

## Implementation

1. Add to timeoutConfig.ts:
```typescript
/** Default estimated step duration for short operations (500ms) */
PROGRESS_ESTIMATED_DEFAULT_SHORT: 500,

/** Maximum duration cap for immediate operations (1 second) */
PROGRESS_MIN_DURATION_CAP: 1000,
```

2. Update progressUnifier.ts:
```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Replace:
// const estimatedDuration = step.estimatedDuration || 500;
// const minDuration = Math.min(estimatedDuration, 1000);

// With:
const estimatedDuration = step.estimatedDuration || TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT;
const minDuration = Math.min(estimatedDuration, TIMEOUTS.PROGRESS_MIN_DURATION_CAP);
```

## Expected Outcome

- Both progress constants exported from timeoutConfig
- progressUnifier.ts uses constants instead of magic numbers
- All existing tests pass

## Acceptance Criteria

- [ ] TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT exported (500ms)
- [ ] TIMEOUTS.PROGRESS_MIN_DURATION_CAP exported (1000ms)
- [ ] progressUnifier.ts uses both constants
- [ ] All existing tests pass
