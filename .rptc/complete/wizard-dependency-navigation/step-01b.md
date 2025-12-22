# Step 1b: Timeline UI Components for Invalidated State

**Purpose:** Extend TimelineNav to support "invalidated" step status and enable click-to-jump for any completed step (forward or backward).

**Prerequisites:**
- [x] Step 1 complete (dependency infrastructure)
- [x] Existing TimelineNav component reviewed
- [x] StatusDot component available in core/ui

**UX Decision:** No confirmation modals for invalidation. The navigation flow enforces resolution (Review is blocked until all invalidated steps are resolved).

---

## Context: Existing Components to Reuse

| Component | Location | Reuse |
|-----------|----------|-------|
| TimelineNav | `src/features/project-creation/ui/wizard/TimelineNav.tsx` | Extend with new status |
| StatusDot | `src/core/ui/components/ui/StatusDot.tsx` | Use `warning` variant |
| Modal | `src/core/ui/components/ui/Modal.tsx` | Pattern for confirmation |
| wizard.css | `src/core/ui/styles/wizard.css` | Add invalidated styles |

---

## Tests to Write First

### Unit Tests: `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

#### Test Group 1: Invalidated Status Rendering

- [ ] **Test:** Shows warning indicator for invalidated steps
  - **Given:** A step with status 'invalidated'
  - **When:** TimelineNav renders
  - **Then:** Step shows orange/yellow warning dot (not green checkmark)
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

- [ ] **Test:** Invalidated step remains clickable
  - **Given:** A step with status 'invalidated'
  - **When:** User clicks the step
  - **Then:** `onStepClick` is called with step ID
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

- [ ] **Test:** Invalidated step shows correct label styling
  - **Given:** A step with status 'invalidated'
  - **When:** TimelineNav renders
  - **Then:** Step label has warning color (orange/yellow), not gray
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

#### Test Group 2: Click-to-Jump Navigation

- [ ] **Test:** Completed steps ahead of current are clickable
  - **Given:** `currentStepIndex = 1`, `completedSteps = [0, 1, 2, 3]`
  - **When:** User clicks step at index 3
  - **Then:** `onStepClick` is called (forward jump allowed)
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

- [ ] **Test:** Upcoming (never-completed) steps are not clickable
  - **Given:** `currentStepIndex = 1`, `completedSteps = [0, 1]`
  - **When:** User clicks step at index 3
  - **Then:** `onStepClick` is NOT called
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

- [ ] **Test:** Invalidated steps are clickable
  - **Given:** `currentStepIndex = 0`, `invalidatedSteps = ['adobe-workspace']`
  - **When:** User clicks invalidated step
  - **Then:** `onStepClick` is called (user can go fix it)
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

### Integration Tests: `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

#### Test Group 3: Status Derivation

- [ ] **Test:** getTimelineStatus returns 'invalidated' when step is in invalidatedSteps
  - **Given:** `invalidatedSteps = ['adobe-workspace']`
  - **When:** Call `getTimelineStatus('adobe-workspace', ...)`
  - **Then:** Returns 'invalidated'
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

- [ ] **Test:** Invalidated takes precedence over completed
  - **Given:** Step is both in `completedSteps` AND `invalidatedSteps`
  - **When:** Call `getTimelineStatus(...)`
  - **Then:** Returns 'invalidated' (not 'completed')
  - **File:** `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`

---

## Files to Create/Modify

- [ ] `src/features/project-creation/ui/wizard/TimelineNav.tsx` - Add invalidated status
- [ ] `src/core/ui/styles/wizard.css` - Add invalidated visual styles
- [ ] `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx` - New/extended tests

---

## Implementation Details

### RED Phase

Create/extend test file `tests/features/project-creation/ui/wizard/TimelineNav.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import TimelineNav from '@/features/project-creation/ui/wizard/TimelineNav';
import type { WizardStep } from '@/types/webview';

const renderWithTheme = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

const mockSteps = [
    { id: 'adobe-auth' as WizardStep, name: 'Adobe Auth', enabled: true },
    { id: 'adobe-project' as WizardStep, name: 'Adobe Project', enabled: true },
    { id: 'adobe-workspace' as WizardStep, name: 'Adobe Workspace', enabled: true },
    { id: 'component-selection' as WizardStep, name: 'Components', enabled: true },
];

describe('TimelineNav - Invalidated Status', () => {
    it('shows warning indicator for invalidated steps', () => {
        renderWithTheme(
            <TimelineNav
                steps={mockSteps}
                currentStep="adobe-auth"
                completedSteps={['adobe-auth', 'adobe-project', 'adobe-workspace']}
                invalidatedSteps={['adobe-workspace']}
                onStepClick={jest.fn()}
            />
        );

        const workspaceStep = screen.getByText('Adobe Workspace').closest('.timeline-step');
        expect(workspaceStep).toHaveClass('timeline-step-invalidated');
    });

    it('invalidated step remains clickable', () => {
        const onStepClick = jest.fn();
        renderWithTheme(
            <TimelineNav
                steps={mockSteps}
                currentStep="adobe-auth"
                completedSteps={['adobe-auth', 'adobe-project', 'adobe-workspace']}
                invalidatedSteps={['adobe-workspace']}
                onStepClick={onStepClick}
            />
        );

        fireEvent.click(screen.getByText('Adobe Workspace'));
        expect(onStepClick).toHaveBeenCalledWith('adobe-workspace');
    });
});

describe('TimelineNav - Click-to-Jump', () => {
    it('allows clicking completed steps ahead of current position', () => {
        const onStepClick = jest.fn();
        renderWithTheme(
            <TimelineNav
                steps={mockSteps}
                currentStep="adobe-auth"
                completedSteps={['adobe-auth', 'adobe-project', 'adobe-workspace', 'component-selection']}
                onStepClick={onStepClick}
            />
        );

        // Click step 3 (component-selection) while at step 0 (adobe-auth)
        fireEvent.click(screen.getByText('Components'));
        expect(onStepClick).toHaveBeenCalledWith('component-selection');
    });

    it('prevents clicking never-completed steps', () => {
        const onStepClick = jest.fn();
        renderWithTheme(
            <TimelineNav
                steps={mockSteps}
                currentStep="adobe-auth"
                completedSteps={['adobe-auth']}
                onStepClick={onStepClick}
            />
        );

        // Click step 3 (component-selection) which was never completed
        fireEvent.click(screen.getByText('Components'));
        expect(onStepClick).not.toHaveBeenCalled();
    });
});
```

### GREEN Phase

Modify `src/features/project-creation/ui/wizard/TimelineNav.tsx`:

```typescript
// Add new prop
interface TimelineNavProps {
    steps: WizardStepConfig[];
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    invalidatedSteps?: WizardStep[];  // NEW
    onStepClick?: (step: WizardStep) => void;
}

// Extend TimelineStatus type
type TimelineStatus = 'completed' | 'completed-current' | 'current' | 'upcoming' | 'invalidated';

// Update getTimelineStatus function
function getTimelineStatus(
    stepId: WizardStep,
    currentStep: WizardStep,
    completedSteps: WizardStep[],
    invalidatedSteps: WizardStep[] = []
): TimelineStatus {
    // Invalidated takes precedence
    if (invalidatedSteps.includes(stepId)) {
        return 'invalidated';
    }

    const isCompleted = completedSteps.includes(stepId);
    const isCurrent = stepId === currentStep;

    if (isCompleted && isCurrent) return 'completed-current';
    if (isCompleted) return 'completed';
    if (isCurrent) return 'current';
    return 'upcoming';
}

// Update isStepClickable function
function isStepClickable(
    stepId: WizardStep,
    currentStep: WizardStep,
    completedSteps: WizardStep[],
    invalidatedSteps: WizardStep[] = []
): boolean {
    // Can click: current step, any completed step, any invalidated step
    if (stepId === currentStep) return true;
    if (completedSteps.includes(stepId)) return true;
    if (invalidatedSteps.includes(stepId)) return true;
    return false;
}
```

Add to `src/core/ui/styles/wizard.css`:

```css
/* Invalidated step - needs user attention */
.timeline-step-dot-invalidated {
    background-color: var(--spectrum-global-color-orange-600);
    border: 2px solid var(--spectrum-global-color-orange-400);
}

.timeline-step-label-invalidated {
    color: var(--spectrum-global-color-orange-700);
    font-weight: var(--spectrum-global-font-weight-medium);
}

.timeline-connector-invalidated {
    border-left-color: var(--spectrum-global-color-orange-400);
}
```

### REFACTOR Phase

1. Extract `getTimelineStatus` to a separate helper file if it grows
2. Consider using StatusDot component's warning variant instead of custom CSS
3. Add aria-labels for accessibility ("Step needs attention")

---

## New Component: ConfirmationDialog

**Location:** `src/core/ui/components/feedback/ConfirmationDialog.tsx`

**Note:** This component is NOT used for step invalidation (that uses visual feedback only). It IS used for:
- "Stop demo before editing" prompt (Step 4)
- Future: delete project confirmation, etc.

### Tests

```typescript
// tests/core/ui/components/feedback/ConfirmationDialog.test.tsx

describe('ConfirmationDialog', () => {
    it('renders title and message', () => {
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Stop Demo?"
                message="The demo must be stopped before editing. Stop now?"
                onConfirm={jest.fn()}
                onCancel={jest.fn()}
            />
        );

        expect(screen.getByText('Stop Demo?')).toBeInTheDocument();
        expect(screen.getByText('The demo must be stopped before editing. Stop now?')).toBeInTheDocument();
    });

    it('calls onConfirm when confirm button clicked', () => {
        const onConfirm = jest.fn();
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Confirm"
                message="Are you sure?"
                onConfirm={onConfirm}
                onCancel={jest.fn()}
            />
        );

        fireEvent.click(screen.getByText('Continue'));
        expect(onConfirm).toHaveBeenCalled();
    });

    it('calls onCancel when cancel button clicked', () => {
        const onCancel = jest.fn();
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Confirm"
                message="Are you sure?"
                onConfirm={jest.fn()}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalled();
    });
});
```

### Implementation

```typescript
// src/core/ui/components/feedback/ConfirmationDialog.tsx

import React from 'react';
import { DialogTrigger, Dialog, Content, Heading, Divider, ButtonGroup, Button } from '@adobe/react-spectrum';

interface ConfirmationDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: 'primary' | 'negative';
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Reusable confirmation dialog for destructive or significant actions.
 *
 * Uses Adobe Spectrum Dialog pattern for consistent UX.
 */
export function ConfirmationDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    confirmVariant = 'primary',
    onConfirm,
    onCancel,
}: ConfirmationDialogProps): React.ReactElement | null {
    if (!isOpen) return null;

    return (
        <DialogTrigger isOpen={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <></>
            <Dialog>
                <Heading>{title}</Heading>
                <Divider />
                <Content>{message}</Content>
                <ButtonGroup>
                    <Button variant="secondary" onPress={onCancel}>
                        {cancelLabel}
                    </Button>
                    <Button variant={confirmVariant} onPress={onConfirm}>
                        {confirmLabel}
                    </Button>
                </ButtonGroup>
            </Dialog>
        </DialogTrigger>
    );
}
```

---

## Expected Outcome

- TimelineNav supports 'invalidated' status with warning styling
- Click-to-jump works for any completed/invalidated step (forward or backward)
- Review step blocked when invalidated steps exist (enforced in WizardContainer, Step 2)
- ConfirmationDialog component available for "stop demo" prompt (used in Step 4)
- All existing tests still pass
- New tests cover invalidated state and click-to-jump behavior

---

## Acceptance Criteria

- [ ] Invalidated steps show orange/warning visual treatment
- [ ] Invalidated steps are clickable (user can go fix them)
- [ ] Completed steps can be clicked to jump forward (free navigation)
- [ ] Upcoming (never-completed) steps cannot be clicked
- [ ] ConfirmationDialog renders and handles callbacks
- [ ] All tests passing
- [ ] No regressions in existing TimelineNav behavior
- [ ] No confirmation modals in invalidation flow (visual feedback only)

---

## Estimated Time

**2-3 hours**

- TimelineNav updates: 1.5 hours
- ConfirmationDialog: 1 hour
- CSS styling: 30 minutes
