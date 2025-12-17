# Step 2: Create filterStepsByComponents Function

## Objective

Create a helper function that filters wizard steps based on selected components. Steps without `requiredComponents` always pass the filter (backward compatible). Steps with `requiredComponents` only pass if ALL required components are selected.

## Prerequisites

- Step 1 completed: `WizardStepConfig` interface extended with `requiredComponents`

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `src/features/project-creation/ui/wizard/wizardHelpers.ts` | New function | Add `filterStepsByComponents()` |

## Implementation Details

### 2.1 Add filterStepsByComponents Function

**Location:** `src/features/project-creation/ui/wizard/wizardHelpers.ts`

**Function signature:**
```typescript
/**
 * Filters wizard steps based on component selection.
 * Steps without requiredComponents always pass (backward compatible).
 * Steps with requiredComponents pass only if ALL required components are selected.
 *
 * @param allSteps - All configured wizard steps
 * @param selectedComponents - Currently selected components
 * @returns Filtered steps that should be displayed
 */
export function filterStepsByComponents(
    allSteps: WizardStepConfig[],
    selectedComponents: ComponentSelection | undefined,
): Array<{ id: WizardStep; name: string }> {
    return allSteps
        .filter(step => {
            // Disabled steps never shown
            if (!step.enabled) return false;

            // No requirements = always shown (backward compatible)
            if (!step.requiredComponents || step.requiredComponents.length === 0) {
                return true;
            }

            // All required components must be selected
            return step.requiredComponents.every(componentId =>
                isComponentSelected(componentId, selectedComponents)
            );
        })
        .map(step => ({
            id: step.id as WizardStep,
            name: step.name
        }));
}
```

### 2.2 Add isComponentSelected Helper

**Location:** `src/features/project-creation/ui/wizard/wizardHelpers.ts`

```typescript
/**
 * Checks if a specific component is selected in the component selection state.
 */
function isComponentSelected(
    componentId: string,
    selectedComponents: ComponentSelection | undefined
): boolean {
    if (!selectedComponents) return false;

    // Check all component categories
    const allSelectedIds = [
        ...Object.keys(selectedComponents.frontend || {}),
        ...Object.keys(selectedComponents.backend || {}),
        ...Object.keys(selectedComponents.appBuilder || {}),
        ...Object.keys(selectedComponents.content || {})
    ];

    return allSelectedIds.includes(componentId);
}
```

## Test Specifications

### Test 2.1: Backward Compatibility - Steps Without Requirements
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('filterStepsByComponents - backward compatibility', () => {
    const mockSteps: WizardStepConfig[] = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'component-selection', name: 'Components', enabled: true },
        { id: 'review', name: 'Review', enabled: true }
    ];

    it('should include all enabled steps without requiredComponents', () => {
        const result = filterStepsByComponents(mockSteps, undefined);

        expect(result).toHaveLength(3);
        expect(result.map(s => s.id)).toEqual(['welcome', 'component-selection', 'review']);
    });

    it('should exclude disabled steps', () => {
        const stepsWithDisabled = [
            ...mockSteps,
            { id: 'hidden', name: 'Hidden', enabled: false }
        ];

        const result = filterStepsByComponents(stepsWithDisabled, undefined);

        expect(result).toHaveLength(3);
        expect(result.find(s => s.id === 'hidden')).toBeUndefined();
    });
});
```

### Test 2.2: Single Component Requirement
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('filterStepsByComponents - single requirement', () => {
    const mockSteps: WizardStepConfig[] = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'mesh-config', name: 'Mesh Config', enabled: true, requiredComponents: ['commerce-mesh'] }
    ];

    it('should show step when required component is selected', () => {
        const selectedComponents: ComponentSelection = {
            backend: { 'commerce-mesh': true }
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(2);
        expect(result.find(s => s.id === 'mesh-config')).toBeDefined();
    });

    it('should hide step when required component is NOT selected', () => {
        const selectedComponents: ComponentSelection = {
            frontend: { 'citisignal-nextjs': true }
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(1);
        expect(result.find(s => s.id === 'mesh-config')).toBeUndefined();
    });

    it('should hide step when no components selected', () => {
        const result = filterStepsByComponents(mockSteps, undefined);

        expect(result).toHaveLength(1);
        expect(result.find(s => s.id === 'mesh-config')).toBeUndefined();
    });
});
```

### Test 2.3: Multiple Component Requirements (AND Logic)
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('filterStepsByComponents - multiple requirements', () => {
    const mockSteps: WizardStepConfig[] = [
        {
            id: 'advanced-config',
            name: 'Advanced Config',
            enabled: true,
            requiredComponents: ['commerce-mesh', 'citisignal-nextjs']
        }
    ];

    it('should show step when ALL required components are selected', () => {
        const selectedComponents: ComponentSelection = {
            frontend: { 'citisignal-nextjs': true },
            backend: { 'commerce-mesh': true }
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(1);
    });

    it('should hide step when only SOME required components are selected', () => {
        const selectedComponents: ComponentSelection = {
            backend: { 'commerce-mesh': true }
            // citisignal-nextjs NOT selected
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(0);
    });

    it('should hide step when NONE of required components are selected', () => {
        const selectedComponents: ComponentSelection = {
            frontend: { 'some-other-component': true }
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result).toHaveLength(0);
    });
});
```

### Test 2.4: Mixed Steps (Some With Requirements, Some Without)
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('filterStepsByComponents - mixed scenarios', () => {
    const mockSteps: WizardStepConfig[] = [
        { id: 'welcome', name: 'Welcome', enabled: true },
        { id: 'mesh-config', name: 'Mesh', enabled: true, requiredComponents: ['commerce-mesh'] },
        { id: 'citisignal-config', name: 'CitiSignal', enabled: true, requiredComponents: ['citisignal-nextjs'] },
        { id: 'review', name: 'Review', enabled: true }
    ];

    it('should show only matching component-specific steps plus always-visible steps', () => {
        const selectedComponents: ComponentSelection = {
            backend: { 'commerce-mesh': true }
        };

        const result = filterStepsByComponents(mockSteps, selectedComponents);

        expect(result.map(s => s.id)).toEqual(['welcome', 'mesh-config', 'review']);
    });

    it('should handle empty requiredComponents as always-visible', () => {
        const stepsWithEmpty = [
            { id: 'test', name: 'Test', enabled: true, requiredComponents: [] }
        ];

        const result = filterStepsByComponents(stepsWithEmpty, undefined);

        expect(result).toHaveLength(1);
    });
});
```

### Test 2.5: isComponentSelected Helper
**File:** `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`

```typescript
describe('isComponentSelected helper', () => {
    it('should find component in frontend category', () => {
        const selection: ComponentSelection = {
            frontend: { 'citisignal-nextjs': true }
        };

        expect(isComponentSelected('citisignal-nextjs', selection)).toBe(true);
    });

    it('should find component in backend category', () => {
        const selection: ComponentSelection = {
            backend: { 'commerce-mesh': true }
        };

        expect(isComponentSelected('commerce-mesh', selection)).toBe(true);
    });

    it('should find component in appBuilder category', () => {
        const selection: ComponentSelection = {
            appBuilder: { 'kukla-integration': true }
        };

        expect(isComponentSelected('kukla-integration', selection)).toBe(true);
    });

    it('should return false for unselected component', () => {
        const selection: ComponentSelection = {
            frontend: { 'citisignal-nextjs': true }
        };

        expect(isComponentSelected('commerce-mesh', selection)).toBe(false);
    });

    it('should return false for undefined selection', () => {
        expect(isComponentSelected('any-component', undefined)).toBe(false);
    });
});
```

## Acceptance Criteria

- [ ] `filterStepsByComponents()` function created and exported
- [ ] `isComponentSelected()` helper function created
- [ ] Steps without `requiredComponents` always included (backward compatible)
- [ ] Steps with `requiredComponents` included only when ALL requirements met
- [ ] Empty `requiredComponents` array treated as "always visible"
- [ ] Function handles `undefined` component selection gracefully
- [ ] All 5 test suites pass with 100% coverage of new code

## Notes

- This function is pure (no side effects) - easy to test
- The AND logic for multiple requirements is intentional - use separate steps for OR logic
- Function output type matches existing `WIZARD_STEPS` format for easy integration
