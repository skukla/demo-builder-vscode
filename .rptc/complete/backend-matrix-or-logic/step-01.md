# Step 1: Add requiredAny Field Support

## Purpose

Extend the wizard step filtering system to support OR logic via a new `requiredAny` field. Steps with `requiredAny` will appear when ANY of the listed components are selected (vs `requiredComponents` which requires ALL).

## Prerequisites

- [ ] Existing `filterStepsByComponents()` function working with AND logic
- [ ] Existing test file patterns understood

## Tests to Write First (RED Phase)

### Test Suite: `requiredAny` OR Logic

Add to `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`:

```typescript
describe('requiredAny OR logic', () => {
    const mockSteps: WizardStepConfigWithRequirements[] = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        {
            id: 'backend-config',
            name: 'Backend Config',
            enabled: true,
            requiredAny: ['commerce-backend', 'custom-backend'],
        },
    ];

    it('should show step when first component in requiredAny is selected', () => {
        const selectedComponents: ComponentSelection = {
            backend: 'commerce-backend',
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(2);
        expect(result.find(s => s.id === 'backend-config')).toBeDefined();
    });

    it('should show step when second component in requiredAny is selected', () => {
        const selectedComponents: ComponentSelection = {
            backend: 'custom-backend',
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(2);
        expect(result.find(s => s.id === 'backend-config')).toBeDefined();
    });

    it('should hide step when NONE of requiredAny components are selected', () => {
        const selectedComponents: ComponentSelection = {
            backend: 'other-backend',
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(1);
        expect(result.find(s => s.id === 'backend-config')).toBeUndefined();
    });

    it('should handle empty requiredAny array as always-visible', () => {
        const stepsWithEmpty: WizardStepConfigWithRequirements[] = [
            { id: 'test', name: 'Test', enabled: true, requiredAny: [] },
        ];

        const result = filterStepsByComponents(stepsWithEmpty, undefined);

        expect(result).toHaveLength(1);
    });
});
```

**Test Scenarios:**

- [ ] Test 1: Show step when first `requiredAny` component selected
- [ ] Test 2: Show step when second `requiredAny` component selected
- [ ] Test 3: Hide step when no `requiredAny` components selected
- [ ] Test 4: Empty `requiredAny` array treated as always-visible

## Files to Modify

### `src/features/project-creation/ui/wizard/wizardHelpers.ts`

- [ ] Add `requiredAny?: string[]` to `WizardStepConfigWithRequirements` interface
- [ ] Add OR logic check in `filterStepsByComponents()` filter callback

## Implementation Details (GREEN Phase)

### Interface Update

```typescript
export interface WizardStepConfigWithRequirements {
    id: string;
    name: string;
    enabled: boolean;
    /** Optional: Component IDs that must ALL be selected for this step to appear */
    requiredComponents?: string[];
    /** Optional: Component IDs where ANY selection makes this step appear (OR logic) */
    requiredAny?: string[];
}
```

### Filter Logic Update

Add after the existing `requiredComponents` check (around line 84):

```typescript
// requiredAny: ANY required component must be selected (OR logic)
if (step.requiredAny && step.requiredAny.length > 0) {
    return step.requiredAny.some(componentId =>
        isComponentSelected(componentId, selectedComponents),
    );
}
```

## Refactor Phase

- Verify JSDoc comments are clear and consistent
- Ensure the OR logic check order makes sense (after AND logic)
- No additional refactoring expected for this minimal change

## Expected Outcome

- [ ] Interface extended with `requiredAny` field
- [ ] Steps with `requiredAny` appear when ANY listed component is selected
- [ ] Backward compatible (existing steps unchanged)
- [ ] All 4 new tests passing

## Acceptance Criteria

- [ ] All existing tests still pass (backward compatibility)
- [ ] All 4 new `requiredAny` tests pass
- [ ] Interface correctly typed with optional `requiredAny` field
- [ ] Code follows existing patterns in wizardHelpers.ts
- [ ] No debug code or console.log statements
