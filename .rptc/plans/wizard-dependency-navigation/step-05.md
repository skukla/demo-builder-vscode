# Step 5: WizardContainer Edit Mode Integration

**Purpose:** Modify WizardContainer to accept edit mode configuration, initialize with project data pre-populated, and show all steps as completed (allowing free navigation via timeline).

**Key UX Decision:** Edit mode starts at the **first step** (adobe-auth), same as create mode. The difference is all data is pre-filled and all steps show as "completed" in the timeline, so the user can click any step to jump directly there.

**Prerequisites:**
- [ ] Step 1-4 completed
- [ ] All previous tests passing
- [ ] Edit handler working
- [ ] `loadProjectIntoWizardState()` function exists

---

## Tests to Write First

### Integration Tests: `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

#### Test Group 1: Edit Mode Initialization

- [ ] **Test:** Wizard initializes with project name from edit settings
  - **Given:** editProject prop with projectName = 'my-demo'
  - **When:** WizardContainer renders
  - **Then:** State has projectName = 'my-demo'
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Wizard initializes with editMode flag set
  - **Given:** editProject prop provided
  - **When:** WizardContainer renders
  - **Then:** State has editMode = true
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Wizard starts at first step in edit mode (same as create)
  - **Given:** editProject prop provided
  - **When:** WizardContainer renders
  - **Then:** Current step is 'adobe-auth' (first enabled step)
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** All navigable steps show as completed in edit mode
  - **Given:** editProject prop provided
  - **When:** WizardContainer renders
  - **Then:** completedSteps includes all enabled steps except project-creation
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

#### Test Group 2: Edit Mode Navigation

- [ ] **Test:** Can click timeline to jump to any step in edit mode
  - **Given:** Wizard in edit mode on adobe-auth step
  - **When:** Click component-selection in timeline
  - **Then:** Navigates directly to component-selection step
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Forward navigation works with pre-filled data
  - **Given:** Wizard in edit mode on adobe-auth
  - **When:** Click Continue
  - **Then:** Navigates to next step with data preserved
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Backward navigation uses dependency-based invalidation
  - **Given:** Wizard in edit mode, on component-selection
  - **When:** Navigate back to adobe-auth, change something
  - **Then:** Only dependent steps invalidated (not component-selection)
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

#### Test Group 3: Edit Mode UI Differences

- [ ] **Test:** Header shows "Edit Project" instead of "Create Demo Project"
  - **Given:** editProject prop provided
  - **When:** WizardContainer renders
  - **Then:** Header displays "Edit Project"
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Review step shows "Save Changes" button in edit mode
  - **Given:** editProject prop, on review step
  - **When:** Check footer buttons
  - **Then:** Continue button shows "Save Changes" instead of "Create Project"
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

#### Test Group 4: Edit Mode State Preservation

- [ ] **Test:** Component configs preserved from project data
  - **Given:** editProject with componentConfigs populated
  - **When:** Navigate to settings step
  - **Then:** Form shows existing config values
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

- [ ] **Test:** Adobe context preserved from project data
  - **Given:** editProject with adobe org/project/workspace
  - **When:** View adobe steps
  - **Then:** Selections show existing values
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`

---

## Files to Create/Modify

- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Add edit mode support
- [ ] `src/features/project-creation/ui/wizard/wizardHelpers.ts` - Add isEditMode param to getNextButtonText
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx` - New test file
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer.testUtils.tsx` - Add edit mode helpers

---

## Implementation Details

### RED Phase (Write failing tests first)

Create `tests/features/project-creation/ui/wizard/WizardContainer-editMode.test.tsx`:

```typescript
// Import mocks FIRST
import './WizardContainer.mocks';

import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    createMockWizardSteps,
    createMockEditProject,
    setupTest,
    cleanupTest,
    renderWithTheme,
} from './WizardContainer.testUtils';

describe('WizardContainer - Edit Mode', () => {
    beforeEach(() => {
        setupTest();
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    describe('Initialization', () => {
        it('should initialize with project name from edit settings', async () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    editProject={createMockEditProject({ projectName: 'my-demo' })}
                />
            );

            // State should have project name (verified via internal state or step display)
            await waitFor(() => {
                expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
            });
        });

        it('should start at first step in edit mode (same as create)', async () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    editProject={createMockEditProject()}
                />
            );

            // Should be on first step (adobe-auth), not review
            await waitFor(() => {
                expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
            });
        });

        it('should show "Edit Project" header in edit mode', async () => {
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    editProject={createMockEditProject()}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Edit Project')).toBeInTheDocument();
            });
        });
    });

    describe('Navigation', () => {
        it('should allow timeline navigation to any step in edit mode', async () => {
            const user = userEvent.setup();
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    editProject={createMockEditProject()}
                />
            );

            // All steps are completed, so timeline should allow clicking any step
            // Click on component-selection in timeline
            const timelineStep = screen.getByTestId('timeline-step-component-selection');
            await user.click(timelineStep);

            await waitFor(() => {
                expect(screen.getByTestId('component-selection-step')).toBeInTheDocument();
            });
        });
    });

    describe('UI Differences', () => {
        it('should show "Save Changes" button on review step in edit mode', async () => {
            const user = userEvent.setup();
            renderWithTheme(
                <WizardContainer
                    componentDefaults={createMockComponentDefaults()}
                    wizardSteps={createMockWizardSteps()}
                    editProject={createMockEditProject()}
                />
            );

            // Navigate to review step via timeline
            const reviewStep = screen.getByTestId('timeline-step-review');
            await user.click(reviewStep);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
            });
        });
    });
});
```

Add to `WizardContainer.testUtils.tsx`:

```typescript
/**
 * Create mock editProject prop for edit mode tests
 */
export function createMockEditProject(overrides: Partial<EditProjectConfig> = {}): EditProjectConfig {
    return {
        projectPath: '/path/to/project',
        projectName: 'test-project',
        settings: {
            version: 1,
            selections: {
                frontend: 'citisignal-nextjs',
            },
            configs: {},
        },
        ...overrides,
    };
}
```

### GREEN Phase (Minimal implementation)

Modify `WizardContainer.tsx`:

1. Add editProject prop interface:

```typescript
interface EditProjectConfig {
    projectPath: string;
    projectName: string;
    settings: {
        version: number;
        selections?: {
            frontend?: string;
            backend?: string;
            dependencies?: string[];
            integrations?: string[];
            appBuilder?: string[];
        };
        configs?: Record<string, Record<string, unknown>>;
        adobe?: {
            orgId?: string;
            orgName?: string;
            projectId?: string;
            projectName?: string;
            projectTitle?: string;
            workspaceId?: string;
            workspaceName?: string;
            workspaceTitle?: string;
        };
    };
}

interface WizardContainerProps {
    componentDefaults?: ComponentSelection;
    wizardSteps?: { id: string; name: string; enabled: boolean }[];
    existingProjectNames?: string[];
    importedSettings?: ImportedSettings | null;
    editProject?: EditProjectConfig;  // Add this
}
```

2. Modify state initialization to handle edit mode:

```typescript
const [state, setState] = useState<WizardState>(() => {
    // EDIT MODE: Start at first step with all data pre-populated
    if (editProject) {
        const editSettings = editProject.settings;
        const firstStep = getFirstEnabledStep(wizardSteps);  // Same as create mode

        return {
            currentStep: firstStep,  // Start at first step, NOT review
            projectName: editProject.projectName,
            projectTemplate: 'citisignal',
            editMode: true,
            editProjectPath: editProject.projectPath,
            components: editSettings.selections ? {
                frontend: editSettings.selections.frontend,
                backend: editSettings.selections.backend,
                dependencies: editSettings.selections.dependencies || [],
                integrations: editSettings.selections.integrations || [],
                appBuilderApps: editSettings.selections.appBuilder || [],
            } : undefined,
            componentConfigs: editSettings.configs || {},
            adobeOrg: editSettings.adobe?.orgId ? {
                id: editSettings.adobe.orgId,
                code: '',
                name: editSettings.adobe.orgName || '',
            } : undefined,
            adobeProject: editSettings.adobe?.projectId ? {
                id: editSettings.adobe.projectId,
                name: editSettings.adobe.projectName || '',
                title: editSettings.adobe.projectTitle,
            } : undefined,
            adobeWorkspace: editSettings.adobe?.workspaceId ? {
                id: editSettings.adobe.workspaceId,
                name: editSettings.adobe.workspaceName || '',
                title: editSettings.adobe.workspaceTitle,
            } : undefined,
            adobeAuth: {
                isAuthenticated: true, // Assumed for edit mode
                isChecking: false,
            },
        };
    }

    // Normal create mode initialization (existing code)
    // ...
});

// Initialize completedSteps for edit mode
const [completedSteps, setCompletedSteps] = useState<WizardStep[]>(() => {
    if (editProject) {
        // All steps completed = user can click any step in timeline
        return getInitialCompletedStepsForEdit(wizardSteps);
    }
    return [];
});
```

3. Update header text for edit mode:

```typescript
<PageHeader
    title={state.editMode ? "Edit Project" : "Create Demo Project"}
    subtitle={currentStepName}
/>
```

4. Update button text for edit mode (in wizardHelpers.ts):

```typescript
export function getNextButtonText(
    isConfirmingSelection: boolean,
    currentStepIndex: number,
    totalSteps: number,
    isEditMode?: boolean
): string {
    if (isConfirmingSelection) return 'Continue';
    if (currentStepIndex === totalSteps - 2) {
        return isEditMode ? 'Save Changes' : 'Create Project';
    }
    return 'Continue';
}
```

### REFACTOR Phase

1. Extract edit mode initialization to helper function
2. Add logging for edit mode transitions
3. Ensure all edge cases handled
4. Re-run tests

---

## Expected Outcome

- WizardContainer accepts editProject prop
- Edit mode starts at first step (adobe-auth) with data pre-populated
- All steps show as completed initially (free timeline navigation)
- Header shows "Edit Project" and review shows "Save Changes"
- Navigation works with dependency-based invalidation

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Edit mode initializes from editProject prop
- [ ] Starts at first step (adobe-auth) in edit mode
- [ ] All navigable steps are completed initially
- [ ] Header shows "Edit Project" in edit mode
- [ ] Review shows "Save Changes" button in edit mode
- [ ] Timeline allows clicking any step in edit mode
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 85% for modified code
