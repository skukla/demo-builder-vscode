# Step 5: Create `getComponentConfigPort()` Helper

## Purpose

Create a helper function to extract PORT from component config, replacing deep optional chaining per SOP §4.

## Files to Modify

- `src/types/typeGuards.ts` - Add helper
- `src/features/project-creation/handlers/executor.ts:99` - Use helper

## Tests to Write First

**Required tests** for new helper:

```typescript
describe('getComponentConfigPort', () => {
    it('should return port when component config exists', () => {
        const configs = {
            'citisignal-nextjs': { PORT: 3000 }
        };
        expect(getComponentConfigPort(configs, 'citisignal-nextjs')).toBe(3000);
    });

    it('should return undefined for undefined configs', () => {
        expect(getComponentConfigPort(undefined, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should return undefined when component not found', () => {
        const configs = {
            'other-component': { PORT: 8080 }
        };
        expect(getComponentConfigPort(configs, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should return undefined when PORT not set', () => {
        const configs = {
            'citisignal-nextjs': { OTHER_PROP: 'value' }
        };
        expect(getComponentConfigPort(configs, 'citisignal-nextjs')).toBeUndefined();
    });

    it('should handle empty configs object', () => {
        expect(getComponentConfigPort({}, 'citisignal-nextjs')).toBeUndefined();
    });
});
```

## Implementation

Add to typeGuards.ts:
```typescript
/**
 * Get the PORT configuration for a component
 * @param componentConfigs - The component configs object
 * @param componentId - The component ID to look up
 * @returns The port number or undefined if not found
 */
export function getComponentConfigPort(
    componentConfigs: Record<string, unknown> | undefined,
    componentId: string,
): number | undefined {
    const config = componentConfigs?.[componentId] as { PORT?: number } | undefined;
    return config?.PORT;
}
```

Update executor.ts to use helper.

## Expected Outcome

- `getComponentConfigPort()` exported from typeGuards.ts
- Full test coverage for helper
- executor.ts uses helper instead of deep chaining

## Acceptance Criteria

- [ ] getComponentConfigPort() function implemented
- [ ] All 5 test cases pass
- [ ] executor.ts uses the helper
- [ ] All existing tests pass
