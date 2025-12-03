# Step 2: Add SLOW_COMMAND_THRESHOLD Constant

## Purpose

Centralize the slow command detection threshold in TIMEOUTS config to comply with SOP §1.

## Files to Modify

- `src/core/utils/timeoutConfig.ts` - Add constant
- `src/core/logging/debugLogger.ts:208` - Use constant
- `src/core/shell/retryStrategyManager.ts:152` - Use constant (and standardize to 3000ms)
- `src/core/shell/commandSequencer.ts:79` - Use constant

## Tests to Write First

**Minimal new test** - verify constant exists:

```typescript
// In timeoutConfig test file
it('should export SLOW_COMMAND_THRESHOLD constant', () => {
    expect(TIMEOUTS.SLOW_COMMAND_THRESHOLD).toBe(3000);
});
```

## Implementation

1. Add to timeoutConfig.ts:
```typescript
/** Threshold for slow command warnings (3 seconds) */
SLOW_COMMAND_THRESHOLD: 3000,
```

2. Update each file to import and use:
```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
// Replace: if (duration > 3000)
// With: if (duration > TIMEOUTS.SLOW_COMMAND_THRESHOLD)
```

3. Standardize retryStrategyManager.ts from 5000ms to 3000ms for consistency.

## Expected Outcome

- `TIMEOUTS.SLOW_COMMAND_THRESHOLD` = 3000 exported
- All 3 consumer files use the constant
- Consistent threshold across all slow command detection

## Acceptance Criteria

- [ ] TIMEOUTS.SLOW_COMMAND_THRESHOLD exported (3000ms)
- [ ] debugLogger.ts uses constant
- [ ] retryStrategyManager.ts uses constant (3000ms, not 5000ms)
- [ ] commandSequencer.ts uses constant
- [ ] All existing tests pass
