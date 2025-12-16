# Step 3: Make WIZARD_STEPS Memo Reactive to Component Selection

## Objective

Update the `WIZARD_STEPS` memo in `useWizardState` hook to recalculate when component selection changes. This ensures the timeline automatically updates when users select/deselect components.

## Prerequisites

- Step 1 completed: `WizardStepConfig` interface extended
- Step 2 completed: `filterStepsByComponents()` function available

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` | Modify | Update WIZARD_STEPS memo dependencies |

## Implementation Details

### 3.1 Update WIZARD_STEPS Memo

**Location:** `src/features/project-creation/ui/wizard/hooks/useWizardState.ts`

**Current implementation** (approximately lines 167-180):
```typescript
const WIZARD_STEPS = useMemo(() => {
    return getEnabledWizardSteps();
}, []);  // Empty deps = calculated once
```

**Updated implementation:**
```typescript
import { filterStepsByComponents, getEnabledWizardSteps } from '../wizardHelpers';

const WIZARD_STEPS = useMemo(() => {
    // Get base enabled steps from configuration
    const allSteps = getEnabledWizardSteps();

    // Filter by component selection (backward compatible)
    return filterStepsByComponents(allSteps, state.components);
}, [state.components]);  // Recalculate when components change
```

### 3.2 Ensure TimelineNav Uses Updated Steps

**Location:** `src/features/project-creation/ui/wizard/TimelineNav.tsx` (verify only)

The TimelineNav component should already receive `steps` prop from WizardContainer. Verify it uses the memoized value correctly:

```typescript
// In WizardContainer.tsx - should already pass WIZARD_STEPS
<TimelineNav
    steps={WIZARD_STEPS}
    currentStep={currentStep}
    // ... other props
/>
```

### 3.3 Handle Navigation Edge Cases

**Location:** `src/features/project-creation/ui/wizard/hooks/useWizardNavigation.ts`

When steps change dynamically, ensure navigation handles edge cases:

```typescript
// If current step is no longer in filtered list, navigate to last valid step
useEffect(() => {
    if (!WIZARD_STEPS.find(s => s.id === currentStep)) {
        const lastStep = WIZARD_STEPS[WIZARD_STEPS.length - 1];
        if (lastStep) {
            setCurrentStep(lastStep.id);
        }
    }
}, [WIZARD_STEPS, currentStep]);
```

## Test Specifications

### Test 3.1: Memo Recalculates on Component Change
**File:** `tests/features/project-creation/ui/wizard/hooks/useWizardState.reactive.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useWizardState } from '@/features/project-creation/ui/wizard/hooks/useWizardState';

describe('useWizardState - WIZARD_STEPS reactivity', () => {
    // Mock wizard-steps.json with component-specific steps
    beforeEach(() => {
        jest.mock('@/features/project-creation/ui/wizard/wizardHelpers', () => ({
            ...jest.requireActual('@/features/project-creation/ui/wizard/wizardHelpers'),
            getEnabledWizardSteps: () => [
                { id: 'welcome', name: 'Welcome', enabled: true },
                { id: 'mesh-config', name: 'Mesh', enabled: true, requiredComponents: ['commerce-mesh'] },
                { id: 'review', name: 'Review', enabled: true }
            ]
        }));
    });

    it('should include all base steps when no components selected', () => {
        const { result } = renderHook(() => useWizardState());

        // Only steps without requirements should be visible
        expect(result.current.WIZARD_STEPS.map(s => s.id)).toEqual(['welcome', 'review']);
    });

    it('should add component-specific step when component selected', () => {
        const { result } = renderHook(() => useWizardState());

        act(() => {
            result.current.updateState({
                components: {
                    backend: { 'commerce-mesh': true }
                }
            });
        });

        expect(result.current.WIZARD_STEPS.map(s => s.id)).toEqual(['welcome', 'mesh-config', 'review']);
    });

    it('should remove component-specific step when component deselected', () => {
        const { result } = renderHook(() => useWizardState());

        // First, select the component
        act(() => {
            result.current.updateState({
                components: {
                    backend: { 'commerce-mesh': true }
                }
            });
        });

        expect(result.current.WIZARD_STEPS).toHaveLength(3);

        // Then, deselect it
        act(() => {
            result.current.updateState({
                components: {
                    backend: {}
                }
            });
        });

        expect(result.current.WIZARD_STEPS).toHaveLength(2);
        expect(result.current.WIZARD_STEPS.find(s => s.id === 'mesh-config')).toBeUndefined();
    });
});
```

### Test 3.2: Timeline Renders Correct Steps
**File:** `tests/features/project-creation/ui/wizard/hooks/useWizardState.reactive.test.ts`

```typescript
describe('TimelineNav integration', () => {
    it('should update timeline when WIZARD_STEPS changes', () => {
        const { result, rerender } = renderHook(() => useWizardState());

        const initialStepCount = result.current.WIZARD_STEPS.length;

        act(() => {
            result.current.updateState({
                components: {
                    backend: { 'commerce-mesh': true }
                }
            });
        });

        // Steps should have changed
        expect(result.current.WIZARD_STEPS.length).toBeGreaterThan(initialStepCount);
    });
});
```

### Test 3.3: Navigation Handles Removed Current Step
**File:** `tests/features/project-creation/ui/wizard/hooks/useWizardState.reactive.test.ts`

```typescript
describe('Navigation edge cases', () => {
    it('should navigate to valid step if current step becomes hidden', () => {
        const { result } = renderHook(() => useWizardState());

        // Navigate to mesh-config step (requires commerce-mesh)
        act(() => {
            result.current.updateState({
                components: { backend: { 'commerce-mesh': true } }
            });
        });

        act(() => {
            result.current.setCurrentStep('mesh-config');
        });

        expect(result.current.currentStep).toBe('mesh-config');

        // Deselect component - mesh-config step should disappear
        act(() => {
            result.current.updateState({
                components: { backend: {} }
            });
        });

        // Should have navigated to a valid step
        expect(result.current.currentStep).not.toBe('mesh-config');
        expect(result.current.WIZARD_STEPS.find(s => s.id === result.current.currentStep)).toBeDefined();
    });
});
```

### Test 3.4: Memoization Performance
**File:** `tests/features/project-creation/ui/wizard/hooks/useWizardState.reactive.test.ts`

```typescript
describe('WIZARD_STEPS memoization', () => {
    it('should not recalculate when unrelated state changes', () => {
        const filterSpy = jest.spyOn(wizardHelpers, 'filterStepsByComponents');
        const { result } = renderHook(() => useWizardState());

        const initialCallCount = filterSpy.mock.calls.length;

        // Update unrelated state
        act(() => {
            result.current.updateState({
                projectName: 'test-project'
            });
        });

        // Should not have called filter again
        expect(filterSpy.mock.calls.length).toBe(initialCallCount);
    });

    it('should recalculate only when components change', () => {
        const filterSpy = jest.spyOn(wizardHelpers, 'filterStepsByComponents');
        const { result } = renderHook(() => useWizardState());

        const initialCallCount = filterSpy.mock.calls.length;

        // Update components
        act(() => {
            result.current.updateState({
                components: { frontend: { 'test': true } }
            });
        });

        // Should have called filter again
        expect(filterSpy.mock.calls.length).toBe(initialCallCount + 1);
    });
});
```

## Acceptance Criteria

- [ ] `WIZARD_STEPS` memo recalculates when `state.components` changes
- [ ] Timeline UI updates automatically when component selection changes
- [ ] Steps appear when required components are selected
- [ ] Steps disappear when required components are deselected
- [ ] Navigation handles edge case of current step being removed
- [ ] Memoization prevents unnecessary recalculations
- [ ] All 4 test suites pass

## Notes

- The memo dependency array change from `[]` to `[state.components]` is the key change
- `filterStepsByComponents` is already tested in Step 2 - these tests focus on integration
- Edge case handling ensures user doesn't get stuck on a hidden step
- Performance test ensures we're not over-calculating
