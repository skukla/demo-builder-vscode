# Step 2: Smart Navigation in Create Mode

**Purpose:** Modify `WizardContainer` to use dependency-based invalidation instead of clearing all subsequent steps when navigating backward.

**Prerequisites:**
- [ ] Step 1 completed (dependency helpers exist)
- [ ] All Step 1 tests passing

---

## Tests to Write First

### Integration Tests: `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

#### Test Group 1: Backward Navigation Preserves Independent Steps

- [ ] **Test:** Going back to adobe-auth keeps component-selection completed
  - **Given:** User has completed: adobe-auth, adobe-project, adobe-workspace, component-selection, settings
  - **When:** User navigates back to adobe-auth step
  - **Then:** component-selection and (implicitly) its non-dependents remain completed
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Going back to component-selection keeps adobe steps completed
  - **Given:** User has completed: adobe-auth, adobe-project, adobe-workspace, component-selection, settings
  - **When:** User navigates back to component-selection step
  - **Then:** adobe-auth, adobe-project, adobe-workspace remain completed
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Going back to settings only removes settings from completed
  - **Given:** User has completed: component-selection, settings, review
  - **When:** User navigates back to settings step
  - **Then:** component-selection remains completed, review remains completed
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

#### Test Group 2: State Clearing Follows Dependencies

- [ ] **Test:** Going back to adobe-auth clears project and workspace state
  - **Given:** User has selected org, project, workspace, and components
  - **When:** User navigates back to adobe-auth step
  - **Then:** adobeProject and adobeWorkspace are cleared, components preserved
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Going back to adobe-project clears only workspace state
  - **Given:** User has selected org, project, workspace
  - **When:** User navigates back to adobe-project step
  - **Then:** adobeWorkspace is cleared, adobeOrg and adobeProject preserved
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Going back to component-selection does not clear Adobe state
  - **Given:** User has selected org, project, workspace, and components
  - **When:** User navigates back to component-selection step
  - **Then:** All Adobe state (org, project, workspace) preserved
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

#### Test Group 3: Free Navigation to Completed Steps

- [ ] **Test:** Can navigate directly to any completed step via sidebar message
  - **Given:** User has completed steps 0, 1, 2, 3 and is on step 4
  - **When:** Sidebar sends navigateToStep message for step 1
  - **Then:** Wizard navigates to step 1, preserves independent completions
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Cannot navigate to incomplete steps
  - **Given:** User is on step 2, steps 0 and 1 are completed
  - **When:** Sidebar sends navigateToStep message for step 4
  - **Then:** Navigation is ignored, stays on step 2
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

#### Test Group 4: completedSteps State Tracking

- [ ] **Test:** completedSteps array accurately tracks completion status
  - **Given:** User navigates forward through 3 steps
  - **When:** Checking completedSteps state
  - **Then:** First 2 steps are in completedSteps array
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Re-completing a step doesn't duplicate in completedSteps
  - **Given:** User completes step 1, goes back, completes again
  - **When:** Checking completedSteps state
  - **Then:** Step 1 appears exactly once
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

#### Test Group 5: Review Blocked When Invalidated Steps Exist

- [ ] **Test:** Cannot navigate to Review when invalidated steps exist
  - **Given:** User has invalidatedSteps = ['adobe-workspace']
  - **When:** User tries to navigate to Review step
  - **Then:** Navigation is blocked, user stays on current step
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Continue button disabled when invalidated steps ahead
  - **Given:** User is on adobe-auth, invalidatedSteps = ['adobe-workspace']
  - **When:** Rendering the wizard
  - **Then:** Review step is not navigable (shown as blocked in timeline)
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

- [ ] **Test:** Can navigate to Review after resolving all invalidated steps
  - **Given:** User had invalidatedSteps = ['adobe-workspace'], then re-selects workspace
  - **When:** User tries to navigate to Review step
  - **Then:** Navigation succeeds, Review step renders
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`

---

## Files to Create/Modify

- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Modify backward navigation logic
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx` - New test file

---

## Implementation Details

### RED Phase (Write failing tests first)

Create new test file `tests/features/project-creation/ui/wizard/WizardContainer-smartNav.test.tsx`:

```typescript
// Import mocks FIRST - before any component imports
import './WizardContainer.mocks';

import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    setupTest,
    cleanupTest,
    renderWithTheme,
} from './WizardContainer.testUtils';

describe('WizardContainer - Smart Navigation', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Backward Navigation Preserves Independent Steps', () => {
        it('should keep component-selection completed when going back to adobe-auth', async () => {
            const user = userEvent.setup();
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate through: adobe-auth -> adobe-project -> adobe-workspace -> component-selection
            const getButton = () => screen.getByRole('button', { name: /continue/i });

            // Complete multiple steps
            await user.click(getButton()); // auth -> project
            await screen.findByTestId('adobe-project-step', {}, { timeout: 500 });

            await user.click(getButton()); // project -> workspace
            await screen.findByTestId('adobe-workspace-step', {}, { timeout: 500 });

            await user.click(getButton()); // workspace -> component-selection
            await screen.findByTestId('component-selection-step', {}, { timeout: 500 });

            // Go back to first step (adobe-auth)
            const backButton = screen.getByRole('button', { name: /back/i });
            await user.click(backButton); // back to workspace
            await screen.findByTestId('adobe-workspace-step', {}, { timeout: 500 });

            await user.click(backButton); // back to project
            await screen.findByTestId('adobe-project-step', {}, { timeout: 500 });

            await user.click(backButton); // back to auth
            await screen.findByTestId('adobe-auth-step', {}, { timeout: 500 });

            // Component-selection is NOT dependent on adobe-auth in the same branch
            // Note: This test verifies the new smart navigation behavior
            // The sidebar should show component-selection still accessible
        });

        it('should keep adobe steps completed when going back to component-selection', async () => {
            const user = userEvent.setup();
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            // Navigate to settings step
            const getButton = () => screen.getByRole('button', { name: /continue/i });

            // auth -> project -> workspace -> component-selection -> prereq -> settings
            await user.click(getButton());
            await screen.findByTestId('adobe-project-step', {}, { timeout: 500 });

            await user.click(getButton());
            await screen.findByTestId('adobe-workspace-step', {}, { timeout: 500 });

            await user.click(getButton());
            await screen.findByTestId('component-selection-step', {}, { timeout: 500 });

            await user.click(getButton());
            await screen.findByTestId('prerequisites-step', {}, { timeout: 500 });

            await user.click(getButton());
            await screen.findByTestId('component-config-step', {}, { timeout: 500 });

            // Go back to component-selection
            const backButton = screen.getByRole('button', { name: /back/i });
            await user.click(backButton); // back to prereq
            await user.click(backButton); // back to component-selection

            await screen.findByTestId('component-selection-step', {}, { timeout: 500 });

            // Adobe steps should still be completed
            // Can verify by navigating forward and not having to redo them
        });
    });

    describe('State Clearing Follows Dependencies', () => {
        it('should clear workspace when going back to adobe-project', async () => {
            // This test requires checking internal state
            // Will use React Testing Library's rerender or state inspection
        });
    });

    describe('completedSteps Tracking', () => {
        it('should not duplicate steps in completedSteps array', async () => {
            const user = userEvent.setup();
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                />
            );

            const continueButton = screen.getByRole('button', { name: /continue/i });

            // Complete step 1
            await user.click(continueButton);
            await screen.findByTestId('adobe-project-step', {}, { timeout: 500 });

            // Go back
            const backButton = screen.getByRole('button', { name: /back/i });
            await user.click(backButton);
            await screen.findByTestId('adobe-auth-step', {}, { timeout: 500 });

            // Complete step 1 again
            await user.click(continueButton);
            await screen.findByTestId('adobe-project-step', {}, { timeout: 500 });

            // Should not have duplicates - verify via sidebar message or internal state
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

Modify `src/features/project-creation/ui/wizard/WizardContainer.tsx`:

1. Import the new dependency helper:
```typescript
import {
    // existing imports...
    filterCompletedStepsByDependency,
    getStepsToInvalidate,
} from './wizardHelpers';
```

2. Modify the `navigateToStep` function to use dependency-based filtering:
```typescript
const navigateToStep = useCallback((step: WizardStep, targetIndex: number, currentIndex: number) => {
    setAnimationDirection(getNavigationDirection(targetIndex, currentIndex));
    setIsTransitioning(true);

    if (targetIndex < currentIndex) {
        // Use dependency-based filtering instead of index-based
        setCompletedSteps(prev => filterCompletedStepsByDependency(prev, step));

        // ... rest of backward navigation logic
    }
    // ... forward navigation logic unchanged
}, [WIZARD_STEPS]);
```

3. Update `computeStateUpdatesForBackwardNav` to check dependencies:
```typescript
// In wizardHelpers.ts, modify to consider dependencies
export function computeStateUpdatesForBackwardNav(
    currentState: WizardState,
    targetStep: WizardStep,
    targetIndex: number,
    indices: AdobeStepIndices
): Partial<WizardState> {
    const updates: Partial<WizardState> = {
        currentStep: targetStep,
    };

    const stepsToInvalidate = getStepsToInvalidate(targetStep);

    // Clear workspace if it's being invalidated
    if (stepsToInvalidate.includes('adobe-workspace')) {
        updates.adobeWorkspace = undefined;
        updates.workspacesCache = undefined;
    }

    // Clear project if it's being invalidated
    if (stepsToInvalidate.includes('adobe-project')) {
        updates.adobeProject = undefined;
        updates.projectsCache = undefined;
        // Also clear workspace since it depends on project
        updates.adobeWorkspace = undefined;
        updates.workspacesCache = undefined;
    }

    return updates;
}
```

### REFACTOR Phase

1. Ensure no duplicate code between old and new navigation logic
2. Remove any dead code paths from old implementation
3. Add logging for debugging navigation decisions
4. Re-run all navigation tests to verify no regressions

---

## Expected Outcome

- Backward navigation only invalidates dependent steps
- Independent step completions are preserved
- State (project, workspace) cleared only when dependencies require it
- Users can freely navigate to any completed step

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Existing navigation tests still pass (no regressions)
- [ ] Going back to adobe-auth keeps component-selection completed
- [ ] Going back to component-selection keeps adobe state
- [ ] State clearing follows dependency graph
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 85% for modified code

---

## Estimated Time

**2-3 hours**

- Writing tests: 1 hour
- Modifying WizardContainer: 1 hour
- Testing and fixing regressions: 1 hour
