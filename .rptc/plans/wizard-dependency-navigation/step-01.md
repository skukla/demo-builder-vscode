# Step 1: Step Dependency Infrastructure

**Purpose:** Define the step dependency graph and create helper functions for determining which steps need invalidation when a step changes.

**Prerequisites:**
- [x] Research document reviewed
- [x] Existing `wizardHelpers.ts` read and understood
- [x] Current navigation behavior understood

---

## Tests to Write First

### Unit Tests: `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

#### Test Group 1: STEP_DEPENDENCIES Constant

- [ ] **Test:** STEP_DEPENDENCIES defines adobe-auth dependencies correctly
  - **Given:** STEP_DEPENDENCIES constant exists
  - **When:** Access `STEP_DEPENDENCIES['adobe-auth']`
  - **Then:** Returns `['adobe-project', 'adobe-workspace', 'api-mesh']`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** STEP_DEPENDENCIES defines adobe-project dependencies correctly
  - **Given:** STEP_DEPENDENCIES constant exists
  - **When:** Access `STEP_DEPENDENCIES['adobe-project']`
  - **Then:** Returns `['adobe-workspace', 'api-mesh']`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** STEP_DEPENDENCIES defines component-selection dependencies correctly
  - **Given:** STEP_DEPENDENCIES constant exists
  - **When:** Access `STEP_DEPENDENCIES['component-selection']`
  - **Then:** Returns `['settings']`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Steps without dependents return empty array
  - **Given:** STEP_DEPENDENCIES constant exists
  - **When:** Access `STEP_DEPENDENCIES['settings']`
  - **Then:** Returns `[]` or undefined
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

#### Test Group 2: getStepsToInvalidate Function

- [ ] **Test:** Returns direct dependents for adobe-auth
  - **Given:** `changedStep = 'adobe-auth'`
  - **When:** Call `getStepsToInvalidate(changedStep)`
  - **Then:** Returns array containing 'adobe-project', 'adobe-workspace', 'api-mesh'
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Returns direct dependents for component-selection
  - **Given:** `changedStep = 'component-selection'`
  - **When:** Call `getStepsToInvalidate(changedStep)`
  - **Then:** Returns array containing 'settings'
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Returns empty array for terminal steps
  - **Given:** `changedStep = 'settings'`
  - **When:** Call `getStepsToInvalidate(changedStep)`
  - **Then:** Returns empty array `[]`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Returns empty array for review step
  - **Given:** `changedStep = 'review'`
  - **When:** Call `getStepsToInvalidate(changedStep)`
  - **Then:** Returns empty array `[]`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Returns empty array for unknown step
  - **Given:** `changedStep = 'unknown-step' as WizardStep`
  - **When:** Call `getStepsToInvalidate(changedStep)`
  - **Then:** Returns empty array `[]`
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

#### Test Group 3: filterCompletedStepsByDependency Function

- [ ] **Test:** Removes only dependent steps when navigating back to adobe-auth
  - **Given:** `completedSteps = ['adobe-auth', 'adobe-project', 'adobe-workspace', 'component-selection']`
  - **When:** Call `filterCompletedStepsByDependency(completedSteps, 'adobe-auth')`
  - **Then:** Returns `['component-selection']` (adobe-project and adobe-workspace removed)
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Removes only settings when navigating back to component-selection
  - **Given:** `completedSteps = ['adobe-auth', 'adobe-project', 'component-selection', 'settings']`
  - **When:** Call `filterCompletedStepsByDependency(completedSteps, 'component-selection')`
  - **Then:** Returns `['adobe-auth', 'adobe-project']` (component-selection and settings removed)
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Keeps all steps when navigating back to step with no dependents
  - **Given:** `completedSteps = ['adobe-auth', 'adobe-project', 'settings', 'review']`
  - **When:** Call `filterCompletedStepsByDependency(completedSteps, 'settings')`
  - **Then:** Returns `['adobe-auth', 'adobe-project']` (only settings removed, review kept)
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

- [ ] **Test:** Always removes the target step itself
  - **Given:** `completedSteps = ['adobe-auth', 'adobe-project']`
  - **When:** Call `filterCompletedStepsByDependency(completedSteps, 'adobe-project')`
  - **Then:** Returns `['adobe-auth']` (target step removed)
  - **File:** `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`

---

## Files to Create/Modify

- [ ] `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Add dependency constants and functions
- [ ] `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts` - New test file

---

## Implementation Details

### RED Phase (Write failing tests first)

Create new test file `tests/features/project-creation/ui/wizard/wizardHelpers-dependencies.test.ts`:

```typescript
/**
 * Tests for wizard step dependency helpers
 *
 * These helpers determine which steps need to be invalidated (marked incomplete)
 * when the user navigates backward to a particular step.
 */

import {
    STEP_DEPENDENCIES,
    getStepsToInvalidate,
    filterCompletedStepsByDependency,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardStep } from '@/types/webview';

describe('wizardHelpers - Step Dependencies', () => {
    describe('STEP_DEPENDENCIES constant', () => {
        it('should define adobe-auth dependencies correctly', () => {
            expect(STEP_DEPENDENCIES['adobe-auth']).toEqual(
                expect.arrayContaining(['adobe-project', 'adobe-workspace', 'api-mesh'])
            );
        });

        it('should define adobe-project dependencies correctly', () => {
            expect(STEP_DEPENDENCIES['adobe-project']).toEqual(
                expect.arrayContaining(['adobe-workspace', 'api-mesh'])
            );
        });

        it('should define component-selection dependencies correctly', () => {
            expect(STEP_DEPENDENCIES['component-selection']).toEqual(['settings']);
        });

        it('should return empty array for steps without dependents', () => {
            const deps = STEP_DEPENDENCIES['settings'];
            expect(deps || []).toEqual([]);
        });
    });

    describe('getStepsToInvalidate', () => {
        it('should return direct dependents for adobe-auth', () => {
            const result = getStepsToInvalidate('adobe-auth');
            expect(result).toContain('adobe-project');
            expect(result).toContain('adobe-workspace');
            expect(result).toContain('api-mesh');
        });

        it('should return direct dependents for component-selection', () => {
            const result = getStepsToInvalidate('component-selection');
            expect(result).toContain('settings');
        });

        it('should return empty array for terminal steps', () => {
            const result = getStepsToInvalidate('settings');
            expect(result).toEqual([]);
        });

        it('should return empty array for review step', () => {
            const result = getStepsToInvalidate('review');
            expect(result).toEqual([]);
        });

        it('should return empty array for unknown step', () => {
            const result = getStepsToInvalidate('unknown-step' as WizardStep);
            expect(result).toEqual([]);
        });
    });

    describe('filterCompletedStepsByDependency', () => {
        it('should remove only dependent steps when navigating back to adobe-auth', () => {
            const completedSteps: WizardStep[] = [
                'adobe-auth',
                'adobe-project',
                'adobe-workspace',
                'component-selection',
            ];
            const result = filterCompletedStepsByDependency(completedSteps, 'adobe-auth');

            expect(result).not.toContain('adobe-auth');
            expect(result).not.toContain('adobe-project');
            expect(result).not.toContain('adobe-workspace');
            expect(result).toContain('component-selection');
        });

        it('should remove only settings when navigating back to component-selection', () => {
            const completedSteps: WizardStep[] = [
                'adobe-auth',
                'adobe-project',
                'component-selection',
                'settings',
            ];
            const result = filterCompletedStepsByDependency(completedSteps, 'component-selection');

            expect(result).toContain('adobe-auth');
            expect(result).toContain('adobe-project');
            expect(result).not.toContain('component-selection');
            expect(result).not.toContain('settings');
        });

        it('should keep unrelated steps when navigating back to step with no dependents', () => {
            const completedSteps: WizardStep[] = [
                'adobe-auth',
                'adobe-project',
                'settings',
                'review',
            ];
            const result = filterCompletedStepsByDependency(completedSteps, 'settings');

            expect(result).toContain('adobe-auth');
            expect(result).toContain('adobe-project');
            expect(result).not.toContain('settings');
            expect(result).toContain('review');
        });

        it('should always remove the target step itself', () => {
            const completedSteps: WizardStep[] = ['adobe-auth', 'adobe-project'];
            const result = filterCompletedStepsByDependency(completedSteps, 'adobe-project');

            expect(result).toContain('adobe-auth');
            expect(result).not.toContain('adobe-project');
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

Add to `src/features/project-creation/ui/wizard/wizardHelpers.ts`:

```typescript
// ============================================================================
// Step Dependency System
// ============================================================================

/**
 * Step dependency graph - maps each step to its dependents.
 *
 * When a step changes, all dependent steps must be invalidated (marked incomplete).
 *
 * Dependency Rules:
 * - adobe-auth: Changes org context, invalidates project/workspace/mesh
 * - adobe-project: Changes project context, invalidates workspace/mesh
 * - adobe-workspace: Changes deployment target, invalidates mesh
 * - component-selection: Changes what gets configured, invalidates settings
 *
 * Independent steps (no dependents):
 * - settings: Only affects .env values, no downstream impact
 * - prerequisites: System check, doesn't affect wizard state
 * - review: Display only
 * - api-mesh: Terminal step for mesh selection
 */
export const STEP_DEPENDENCIES: Partial<Record<WizardStep, WizardStep[]>> = {
    'adobe-auth': ['adobe-project', 'adobe-workspace', 'api-mesh'],
    'adobe-project': ['adobe-workspace', 'api-mesh'],
    'adobe-workspace': ['api-mesh'],
    'component-selection': ['settings'],
};

/**
 * Get all steps that depend on the given step.
 *
 * @param changedStep - The step that is being navigated to (will be re-done)
 * @returns Array of steps that should be invalidated
 */
export function getStepsToInvalidate(changedStep: WizardStep): WizardStep[] {
    return STEP_DEPENDENCIES[changedStep] || [];
}

/**
 * Filter completed steps based on dependency rules when navigating backward.
 *
 * Removes:
 * - The target step itself (user is going back to redo it)
 * - All steps that depend on the target step
 *
 * Keeps:
 * - Steps that came before the target (already validated)
 * - Steps that don't depend on the target (independent branches)
 *
 * @param completedSteps - Current list of completed steps
 * @param targetStep - The step user is navigating back to
 * @returns Filtered list of completed steps
 */
export function filterCompletedStepsByDependency(
    completedSteps: WizardStep[],
    targetStep: WizardStep
): WizardStep[] {
    const stepsToInvalidate = new Set<WizardStep>([
        targetStep,
        ...getStepsToInvalidate(targetStep),
    ]);

    return completedSteps.filter(step => !stepsToInvalidate.has(step));
}
```

### REFACTOR Phase (Improve while keeping tests green)

1. Add JSDoc comments with examples
2. Consider adding `isDependentOn(step, potentialParent)` helper if needed
3. Ensure consistent ordering in dependency arrays
4. Re-run tests to verify still passing

---

## Expected Outcome

- New dependency constants and helper functions in `wizardHelpers.ts`
- All 13 tests passing
- Clear dependency rules documented
- Foundation for smart navigation in Step 2

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] `STEP_DEPENDENCIES` constant defined with correct mappings
- [ ] `getStepsToInvalidate()` returns correct dependent steps
- [ ] `filterCompletedStepsByDependency()` preserves independent steps
- [ ] Code follows project style guide (SOP compliance)
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 95% for new code

---

## Estimated Time

**1-2 hours**

- Writing tests: 30 minutes
- Implementation: 30 minutes
- Refactoring and documentation: 30 minutes
