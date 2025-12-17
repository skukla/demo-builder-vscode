# Step 1: Magic Timeout Constants

## Objective

Replace magic timeout numbers with centralized `TIMEOUTS.*` constants per SOP §1.

## Violations

| File | Line | Current | Suggested Constant |
|------|------|---------|-------------------|
| `src/features/welcome/commands/showWelcome.ts` | 52 | `50` | `TIMEOUTS.WEBVIEW_INIT_DELAY` |
| `src/features/mesh/ui/hooks/useMeshOperations.ts` | 178 | `1000` | `TIMEOUTS.PROGRESS_MESSAGE_DELAY` |
| `src/features/mesh/ui/hooks/useMeshOperations.ts` | 183 | `2000` | `TIMEOUTS.PROGRESS_MESSAGE_DELAY_LONG` |

## TDD Approach

### RED: Write Tests First

```typescript
// tests/core/utils/timeoutConfig.test.ts
describe('TIMEOUTS constants', () => {
    it('should have WEBVIEW_INIT_DELAY constant', () => {
        expect(TIMEOUTS.WEBVIEW_INIT_DELAY).toBeDefined();
        expect(typeof TIMEOUTS.WEBVIEW_INIT_DELAY).toBe('number');
    });

    it('should have PROGRESS_MESSAGE_DELAY constant', () => {
        expect(TIMEOUTS.PROGRESS_MESSAGE_DELAY).toBeDefined();
        expect(typeof TIMEOUTS.PROGRESS_MESSAGE_DELAY).toBe('number');
    });

    it('should have PROGRESS_MESSAGE_DELAY_LONG constant', () => {
        expect(TIMEOUTS.PROGRESS_MESSAGE_DELAY_LONG).toBeDefined();
        expect(TIMEOUTS.PROGRESS_MESSAGE_DELAY_LONG).toBeGreaterThan(TIMEOUTS.PROGRESS_MESSAGE_DELAY);
    });
});
```

### GREEN: Implementation

1. Add new constants to `src/core/utils/timeoutConfig.ts`:

```typescript
export const TIMEOUTS = {
    // ... existing constants ...

    // UI Progress indicators
    WEBVIEW_INIT_DELAY: 50,           // Small delay for webview initialization
    PROGRESS_MESSAGE_DELAY: 1000,     // First progress message update (1 second)
    PROGRESS_MESSAGE_DELAY_LONG: 2000, // Second progress message update (2 seconds)
} as const;
```

2. Update `src/features/welcome/commands/showWelcome.ts`:

```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Line 52: Replace magic number
await new Promise(resolve => setTimeout(resolve, TIMEOUTS.WEBVIEW_INIT_DELAY));
```

3. Update `src/features/mesh/ui/hooks/useMeshOperations.ts`:

```typescript
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// Line 178
const timeout1 = setTimeout(() => {
    if (isChecking) setSubMessage('Verifying API availability');
}, TIMEOUTS.PROGRESS_MESSAGE_DELAY);

// Line 183
const timeout2 = setTimeout(() => {
    if (isChecking) setSubMessage('Checking for existing mesh');
}, TIMEOUTS.PROGRESS_MESSAGE_DELAY_LONG);
```

### REFACTOR: Verify

- Run full test suite
- Verify SOP scan shows 0 magic timeout violations in these files

## Files Changed

- `src/core/utils/timeoutConfig.ts` - Add 3 new constants
- `src/features/welcome/commands/showWelcome.ts` - Use TIMEOUTS constant
- `src/features/mesh/ui/hooks/useMeshOperations.ts` - Use TIMEOUTS constants

## Acceptance Criteria

- [ ] 3 new TIMEOUTS constants defined with descriptive names
- [ ] All 3 magic number sites updated to use constants
- [ ] Existing tests pass (no behavior change)
- [ ] SOP scan shows 0 magic timeout violations in modified files
