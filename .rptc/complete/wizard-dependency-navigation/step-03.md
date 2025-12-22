# Step 3: Edit Mode Foundation

**Purpose:** Add edit mode state to WizardState and create a loader function to populate wizard state from an existing project.

**Prerequisites:**
- [ ] Step 1 completed (dependency infrastructure)
- [ ] Step 2 completed (smart navigation)
- [ ] All previous tests passing

---

## Tests to Write First

### Unit Tests: `tests/features/project-creation/helpers/projectToWizardState.test.ts`

#### Test Group 1: loadProjectIntoWizardState Function

- [ ] **Test:** Loads project name correctly
  - **Given:** A project with name "my-demo-project"
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with `projectName = 'my-demo-project'`
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Loads Adobe context from project
  - **Given:** A project with adobe.projectId, adobe.organization, adobe.workspace
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with adobeOrg, adobeProject, adobeWorkspace populated
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Loads component selections correctly
  - **Given:** A project with componentSelections.frontend = 'citisignal-nextjs'
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with components.frontend = 'citisignal-nextjs'
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Loads component configs correctly
  - **Given:** A project with componentConfigs containing env vars
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with componentConfigs populated
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Sets editMode flag to true
  - **Given:** Any valid project
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with `editMode = true`
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Sets editProjectPath for reference
  - **Given:** A project with path "/path/to/project"
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns WizardState with `editProjectPath = '/path/to/project'`
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Handles project with minimal data gracefully
  - **Given:** A project with only name and path (no adobe, no components)
  - **When:** Call `loadProjectIntoWizardState(project)`
  - **Then:** Returns valid WizardState with editMode true, other fields undefined
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

#### Test Group 2: getInitialCompletedStepsForEdit Function

- [ ] **Test:** Returns all navigable steps as completed for edit mode
  - **Given:** Standard wizard steps configuration
  - **When:** Call `getInitialCompletedStepsForEdit(wizardSteps)`
  - **Then:** Returns array of all enabled step IDs except project-creation
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** Excludes disabled steps from completed list
  - **Given:** Wizard steps with api-mesh disabled
  - **When:** Call `getInitialCompletedStepsForEdit(wizardSteps)`
  - **Then:** Returned array does not include 'api-mesh'
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

#### Test Group 3: WizardState Type Extension

- [ ] **Test:** WizardState accepts editMode property
  - **Given:** WizardState type definition
  - **When:** Create state with `{ editMode: true, ... }`
  - **Then:** TypeScript compiles without error
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

- [ ] **Test:** WizardState accepts editProjectPath property
  - **Given:** WizardState type definition
  - **When:** Create state with `{ editProjectPath: '/path', ... }`
  - **Then:** TypeScript compiles without error
  - **File:** `tests/features/project-creation/helpers/projectToWizardState.test.ts`

---

## Files to Create/Modify

- [ ] `src/types/webview.ts` - Add `editMode` and `editProjectPath` to WizardState
- [ ] `src/features/project-creation/helpers/projectToWizardState.ts` - New file with loader function
- [ ] `src/features/project-creation/helpers/index.ts` - Export new helper
- [ ] `tests/features/project-creation/helpers/projectToWizardState.test.ts` - New test file

---

## Implementation Details

### RED Phase (Write failing tests first)

Create `tests/features/project-creation/helpers/projectToWizardState.test.ts`:

```typescript
/**
 * Tests for loading project data into wizard state for edit mode
 */

import {
    loadProjectIntoWizardState,
    getInitialCompletedStepsForEdit,
} from '@/features/project-creation/helpers/projectToWizardState';
import type { Project } from '@/types/base';
import type { WizardState } from '@/types/webview';

// Mock project factory
function createMockProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/path/to/test-project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    };
}

describe('projectToWizardState', () => {
    describe('loadProjectIntoWizardState', () => {
        it('should load project name correctly', () => {
            const project = createMockProject({ name: 'my-demo-project' });
            const result = loadProjectIntoWizardState(project);
            expect(result.projectName).toBe('my-demo-project');
        });

        it('should load Adobe context from project', () => {
            const project = createMockProject({
                adobe: {
                    organization: 'MyOrg',
                    projectId: 'proj-123',
                    projectName: 'MyProject',
                    projectTitle: 'My Project Title',
                    workspace: 'Production',
                    workspaceTitle: 'Production Workspace',
                },
            });
            const result = loadProjectIntoWizardState(project);

            expect(result.adobeOrg?.name).toBe('MyOrg');
            expect(result.adobeProject?.id).toBe('proj-123');
            expect(result.adobeProject?.name).toBe('MyProject');
            expect(result.adobeProject?.title).toBe('My Project Title');
            expect(result.adobeWorkspace?.name).toBe('Production');
        });

        it('should load component selections correctly', () => {
            const project = createMockProject({
                componentSelections: {
                    frontend: 'citisignal-nextjs',
                    backend: 'commerce-backend',
                    dependencies: ['commerce-mesh', 'demo-inspector'],
                },
            });
            const result = loadProjectIntoWizardState(project);

            expect(result.components?.frontend).toBe('citisignal-nextjs');
            expect(result.components?.backend).toBe('commerce-backend');
            expect(result.components?.dependencies).toContain('commerce-mesh');
            expect(result.components?.dependencies).toContain('demo-inspector');
        });

        it('should load component configs correctly', () => {
            const project = createMockProject({
                componentConfigs: {
                    'citisignal-nextjs': {
                        NEXT_PUBLIC_API_URL: 'https://api.example.com',
                    },
                },
            });
            const result = loadProjectIntoWizardState(project);

            expect(result.componentConfigs?.['citisignal-nextjs']?.NEXT_PUBLIC_API_URL)
                .toBe('https://api.example.com');
        });

        it('should set editMode flag to true', () => {
            const project = createMockProject();
            const result = loadProjectIntoWizardState(project);
            expect(result.editMode).toBe(true);
        });

        it('should set editProjectPath for reference', () => {
            const project = createMockProject({ path: '/custom/path/project' });
            const result = loadProjectIntoWizardState(project);
            expect(result.editProjectPath).toBe('/custom/path/project');
        });

        it('should handle project with minimal data gracefully', () => {
            const project = createMockProject({
                adobe: undefined,
                componentSelections: undefined,
                componentConfigs: undefined,
            });
            const result = loadProjectIntoWizardState(project);

            expect(result.editMode).toBe(true);
            expect(result.projectName).toBe('test-project');
            expect(result.adobeOrg).toBeUndefined();
            expect(result.components).toBeUndefined();
        });
    });

    describe('getInitialCompletedStepsForEdit', () => {
        const mockWizardSteps = [
            { id: 'adobe-auth', name: 'Auth', enabled: true },
            { id: 'adobe-project', name: 'Project', enabled: true },
            { id: 'adobe-workspace', name: 'Workspace', enabled: true },
            { id: 'component-selection', name: 'Components', enabled: true },
            { id: 'prerequisites', name: 'Prerequisites', enabled: true },
            { id: 'api-mesh', name: 'Mesh', enabled: false },
            { id: 'settings', name: 'Settings', enabled: true },
            { id: 'review', name: 'Review', enabled: true },
            { id: 'project-creation', name: 'Create', enabled: true },
        ];

        it('should return all navigable steps as completed', () => {
            const result = getInitialCompletedStepsForEdit(mockWizardSteps);

            expect(result).toContain('adobe-auth');
            expect(result).toContain('adobe-project');
            expect(result).toContain('component-selection');
            expect(result).toContain('settings');
            expect(result).toContain('review');
        });

        it('should exclude disabled steps', () => {
            const result = getInitialCompletedStepsForEdit(mockWizardSteps);
            expect(result).not.toContain('api-mesh');
        });

        it('should exclude project-creation step', () => {
            const result = getInitialCompletedStepsForEdit(mockWizardSteps);
            expect(result).not.toContain('project-creation');
        });
    });
});
```

### GREEN Phase (Minimal implementation)

1. Update `src/types/webview.ts` - Add edit mode fields:

```typescript
export interface WizardState {
    // ... existing fields ...

    /**
     * Edit mode flag - true when editing existing project
     * When true, all steps appear "completed" initially
     */
    editMode?: boolean;

    /**
     * Path to the project being edited
     * Used by executor to update existing project vs create new
     */
    editProjectPath?: string;
}
```

2. Create `src/features/project-creation/helpers/projectToWizardState.ts`:

```typescript
/**
 * Project to WizardState Loader
 *
 * Converts an existing project into WizardState for edit mode.
 * Used when user clicks "Edit..." on a project card.
 */

import type { Project } from '@/types/base';
import type { WizardState, WizardStep } from '@/types/webview';

/**
 * Steps that should not appear as "completed" in edit mode
 * - project-creation: Terminal step, not navigable
 */
const NON_COMPLETABLE_STEPS: WizardStep[] = ['project-creation'];

/**
 * Load project data into WizardState for edit mode
 *
 * @param project - Existing project to edit
 * @returns WizardState pre-populated with project data
 */
export function loadProjectIntoWizardState(project: Project): Partial<WizardState> {
    return {
        // Edit mode flags
        editMode: true,
        editProjectPath: project.path,

        // Project identity
        projectName: project.name,
        projectTemplate: project.template || 'citisignal',

        // Adobe context
        adobeOrg: project.adobe?.organization
            ? {
                  id: '', // Will be resolved from current auth
                  code: '',
                  name: project.adobe.organization,
              }
            : undefined,

        adobeProject: project.adobe?.projectId
            ? {
                  id: project.adobe.projectId,
                  name: project.adobe.projectName || '',
                  title: project.adobe.projectTitle,
              }
            : undefined,

        adobeWorkspace: project.adobe?.workspace
            ? {
                  id: '', // Will be resolved from project
                  name: project.adobe.workspace,
                  title: project.adobe.workspaceTitle,
              }
            : undefined,

        // Component selections
        components: project.componentSelections
            ? {
                  frontend: project.componentSelections.frontend,
                  backend: project.componentSelections.backend,
                  dependencies: project.componentSelections.dependencies,
                  integrations: project.componentSelections.integrations,
                  appBuilderApps: project.componentSelections.appBuilder,
              }
            : undefined,

        // Component configs
        componentConfigs: project.componentConfigs,

        // Auth state - will be verified when wizard opens
        adobeAuth: {
            isAuthenticated: false,
            isChecking: true,
        },
    };
}

/**
 * Get list of steps that should appear completed in edit mode
 *
 * @param wizardSteps - Wizard step configuration
 * @returns Array of step IDs that should be marked complete
 */
export function getInitialCompletedStepsForEdit(
    wizardSteps: Array<{ id: string; enabled: boolean }>
): WizardStep[] {
    return wizardSteps
        .filter(step => step.enabled)
        .filter(step => !NON_COMPLETABLE_STEPS.includes(step.id as WizardStep))
        .map(step => step.id as WizardStep);
}
```

3. Update `src/features/project-creation/helpers/index.ts`:

```typescript
// Add to existing exports
export {
    loadProjectIntoWizardState,
    getInitialCompletedStepsForEdit,
} from './projectToWizardState';
```

### REFACTOR Phase

1. Add comprehensive JSDoc with examples
2. Consider edge cases (project with mesh but no mesh step enabled)
3. Ensure type safety with strict null checks
4. Re-run tests

---

## Expected Outcome

- WizardState type extended with editMode fields
- `loadProjectIntoWizardState()` converts project to wizard state
- `getInitialCompletedStepsForEdit()` returns steps to mark complete
- Foundation ready for edit mode initialization

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] WizardState type includes editMode and editProjectPath
- [ ] loadProjectIntoWizardState handles all project fields
- [ ] loadProjectIntoWizardState handles minimal project gracefully
- [ ] getInitialCompletedStepsForEdit excludes disabled steps
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 95% for new code

---

## Estimated Time

**2-3 hours**

- Writing tests: 1 hour
- Implementation: 1 hour
- Type definitions and exports: 30 minutes
