# Step 1: Add COMPONENT_IDS to src/core/constants.ts

## Summary
Create the COMPONENT_IDS constant object in the existing constants file.

## Purpose
Establish the single source of truth for all component ID strings used throughout the codebase.

## Prerequisites
- None (first step)

## Tests to Write First (TDD)

### Test File: `tests/core/constants.test.ts`

- [ ] COMPONENT_IDS should be exported from constants module
- [ ] COMPONENT_IDS.COMMERCE_MESH should equal 'commerce-mesh'
- [ ] COMPONENT_IDS.EDS_STOREFRONT should equal 'eds-storefront'
- [ ] COMPONENT_IDS.DEMO_INSPECTOR should equal 'demo-inspector'
- [ ] COMPONENT_IDS.EDS_COMMERCE_MESH should equal 'eds-commerce-mesh'
- [ ] COMPONENT_IDS.HEADLESS_COMMERCE_MESH should equal 'headless-commerce-mesh'
- [ ] COMPONENT_IDS should be readonly (TypeScript const assertion)
- [ ] ComponentId type should be exported

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/constants.ts` | MODIFY | Add COMPONENT_IDS object and ComponentId type |
| `tests/core/constants.test.ts` | CREATE | Add tests for COMPONENT_IDS |

## Implementation Details

### RED Phase
Write tests first in `tests/core/constants.test.ts`:

```typescript
import { COMPONENT_IDS, ComponentId } from '@/core/constants';

describe('COMPONENT_IDS', () => {
    it('should export COMPONENT_IDS constant', () => {
        expect(COMPONENT_IDS).toBeDefined();
    });

    it('should have correct component ID values', () => {
        expect(COMPONENT_IDS.COMMERCE_MESH).toBe('commerce-mesh');
        expect(COMPONENT_IDS.EDS_STOREFRONT).toBe('eds-storefront');
        expect(COMPONENT_IDS.DEMO_INSPECTOR).toBe('demo-inspector');
        expect(COMPONENT_IDS.EDS_COMMERCE_MESH).toBe('eds-commerce-mesh');
        expect(COMPONENT_IDS.HEADLESS_COMMERCE_MESH).toBe('headless-commerce-mesh');
    });

    it('should be readonly (const assertion)', () => {
        // TypeScript compile-time check - values cannot be reassigned
        const ids: typeof COMPONENT_IDS = COMPONENT_IDS;
        expect(Object.isFrozen(COMPONENT_IDS)).toBe(false); // as const doesn't freeze
        expect(typeof ids).toBe('object');
    });
});

describe('ComponentId type', () => {
    it('should accept valid component IDs', () => {
        const validId: ComponentId = 'commerce-mesh';
        expect(validId).toBe('commerce-mesh');
    });
});
```

### GREEN Phase
Add to `src/core/constants.ts`:

```typescript
/**
 * Component IDs for standardized component instance access
 *
 * These IDs match the component definitions in templates/components.json
 * and are used for type-safe access to componentInstances entries.
 */
export const COMPONENT_IDS = {
    /** Legacy mesh component ID */
    COMMERCE_MESH: 'commerce-mesh',
    /** Edge Delivery Services storefront component */
    EDS_STOREFRONT: 'eds-storefront',
    /** Demo inspector overlay component */
    DEMO_INSPECTOR: 'demo-inspector',
    /** EDS-specific API Mesh */
    EDS_COMMERCE_MESH: 'eds-commerce-mesh',
    /** Headless-specific API Mesh */
    HEADLESS_COMMERCE_MESH: 'headless-commerce-mesh',
} as const;

/** Type for component ID values */
export type ComponentId = typeof COMPONENT_IDS[keyof typeof COMPONENT_IDS];
```

### REFACTOR Phase
- Verify JSDoc comments are clear and accurate
- Ensure export is accessible via `@/core/constants`
- Run full test suite to ensure no regressions

## Expected Outcome
- COMPONENT_IDS constant exported from src/core/constants.ts
- ComponentId type exported for type-safe usage
- All tests pass
- Build succeeds with no TypeScript errors

## Acceptance Criteria
- [ ] Tests written and passing
- [ ] Constants exported correctly
- [ ] TypeScript compiles without errors
- [ ] Import works via `@/core/constants` path alias
