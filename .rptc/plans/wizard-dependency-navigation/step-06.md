# Step 6: Change Executor for Edit Mode

**Purpose:** Create an edit mode variant of the project executor that handles component add/remove/update while preserving unchanged data.

**Prerequisites:**
- [ ] Steps 1-5 completed
- [ ] All previous tests passing
- [ ] Edit mode wizard working
- [ ] Existing `executeProjectCreation` understood

---

## Tests to Write First

### Unit Tests: `tests/features/project-creation/handlers/editExecutor.test.ts`

#### Test Group 1: Change Detection

- [ ] **Test:** Detects when no changes were made
  - **Given:** Original project and wizard state with identical selections
  - **When:** Call `detectProjectChanges(original, wizardState)`
  - **Then:** Returns `{ hasChanges: false }`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Detects component additions
  - **Given:** Original with frontend only, wizard state with frontend + demo-inspector
  - **When:** Call `detectProjectChanges(original, wizardState)`
  - **Then:** Returns `{ hasChanges: true, added: ['demo-inspector'], removed: [], updated: [] }`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Detects component removals
  - **Given:** Original with demo-inspector, wizard state without it
  - **When:** Call `detectProjectChanges(original, wizardState)`
  - **Then:** Returns `{ hasChanges: true, added: [], removed: ['demo-inspector'], updated: [] }`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Detects config changes
  - **Given:** Original with PORT=3000, wizard state with PORT=3001
  - **When:** Call `detectProjectChanges(original, wizardState)`
  - **Then:** Returns `{ hasChanges: true, configChanges: { 'citisignal-nextjs': [...] } }`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Detects Adobe context changes
  - **Given:** Original with workspace A, wizard state with workspace B
  - **When:** Call `detectProjectChanges(original, wizardState)`
  - **Then:** Returns `{ hasChanges: true, adobeContextChanged: true }`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

#### Test Group 2: Edit Executor

- [ ] **Test:** Returns success with no changes when nothing changed
  - **Given:** No changes detected
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Returns success with message "No changes to apply"
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Installs new components when components added
  - **Given:** demo-inspector added to selections
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Calls componentManager.installComponent for demo-inspector
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Removes component directory when component removed
  - **Given:** demo-inspector removed from selections
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Removes demo-inspector directory from components/
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Updates .env files when configs changed
  - **Given:** Config changes for citisignal-nextjs
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Regenerates .env file for citisignal-nextjs
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Updates project manifest after changes
  - **Given:** Any changes detected
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Writes updated .demo-builder.json
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Warns when Adobe context changed (mesh needs redeploy)
  - **Given:** Workspace changed from A to B
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Returns with `requiresMeshRedeploy: true`
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

#### Test Group 3: Rollback on Failure

- [ ] **Test:** Creates snapshot before making changes
  - **Given:** Changes to apply
  - **When:** Call `executeProjectEdit(context, config)`
  - **Then:** Creates backup of current component state
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

- [ ] **Test:** Rolls back on installation failure
  - **Given:** Component installation fails
  - **When:** Error thrown during install
  - **Then:** Restores previous state from snapshot
  - **File:** `tests/features/project-creation/handlers/editExecutor.test.ts`

---

## Files to Create/Modify

- [ ] `src/features/project-creation/handlers/editExecutor.ts` - New file with edit logic
- [ ] `src/features/project-creation/handlers/index.ts` - Export editExecutor
- [ ] `src/features/project-creation/handlers/executor.ts` - Add routing to edit executor
- [ ] `tests/features/project-creation/handlers/editExecutor.test.ts` - New test file

---

## Implementation Details

### RED Phase (Write failing tests first)

Create `tests/features/project-creation/handlers/editExecutor.test.ts`:

```typescript
/**
 * Tests for project edit executor
 */

import { detectProjectChanges, executeProjectEdit } from '@/features/project-creation/handlers/editExecutor';
import type { Project } from '@/types/base';
import type { WizardState } from '@/types/webview';

// Mocks
jest.mock('fs/promises');
jest.mock('@/features/components/services/componentManager');

describe('editExecutor', () => {
    describe('detectProjectChanges', () => {
        const createMockProject = (overrides = {}): Project => ({
            name: 'test-project',
            path: '/path/to/project',
            status: 'ready',
            created: new Date(),
            lastModified: new Date(),
            componentSelections: {
                frontend: 'citisignal-nextjs',
                dependencies: [],
            },
            componentConfigs: {},
            ...overrides,
        });

        const createMockWizardState = (overrides = {}): Partial<WizardState> => ({
            projectName: 'test-project',
            components: {
                frontend: 'citisignal-nextjs',
                dependencies: [],
            },
            componentConfigs: {},
            ...overrides,
        });

        it('should detect no changes when selections identical', () => {
            const project = createMockProject();
            const state = createMockWizardState();

            const result = detectProjectChanges(project, state);

            expect(result.hasChanges).toBe(false);
        });

        it('should detect component additions', () => {
            const project = createMockProject();
            const state = createMockWizardState({
                components: {
                    frontend: 'citisignal-nextjs',
                    dependencies: ['demo-inspector'],
                },
            });

            const result = detectProjectChanges(project, state);

            expect(result.hasChanges).toBe(true);
            expect(result.added).toContain('demo-inspector');
        });

        it('should detect component removals', () => {
            const project = createMockProject({
                componentSelections: {
                    frontend: 'citisignal-nextjs',
                    dependencies: ['demo-inspector'],
                },
            });
            const state = createMockWizardState({
                components: {
                    frontend: 'citisignal-nextjs',
                    dependencies: [],
                },
            });

            const result = detectProjectChanges(project, state);

            expect(result.hasChanges).toBe(true);
            expect(result.removed).toContain('demo-inspector');
        });

        it('should detect config changes', () => {
            const project = createMockProject({
                componentConfigs: {
                    'citisignal-nextjs': { PORT: '3000' },
                },
            });
            const state = createMockWizardState({
                componentConfigs: {
                    'citisignal-nextjs': { PORT: '3001' },
                },
            });

            const result = detectProjectChanges(project, state);

            expect(result.hasChanges).toBe(true);
            expect(result.configChanges).toBeDefined();
        });
    });

    describe('executeProjectEdit', () => {
        // Tests for the main executor
        it('should return success with no changes message when nothing changed', async () => {
            // Implementation
        });

        it('should install new components when added', async () => {
            // Implementation
        });
    });
});
```

### GREEN Phase (Minimal implementation)

Create `src/features/project-creation/handlers/editExecutor.ts`:

```typescript
/**
 * Edit Executor
 *
 * Handles applying changes to an existing project in edit mode.
 * Compares original project state with wizard selections and applies
 * only the differences.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import type { Project } from '@/types/base';
import type { WizardState } from '@/types/webview';

/**
 * Change detection result
 */
export interface ProjectChanges {
    hasChanges: boolean;
    added: string[];
    removed: string[];
    configChanges: Record<string, string[]>;
    adobeContextChanged: boolean;
}

/**
 * Detect what changed between original project and wizard state
 */
export function detectProjectChanges(
    original: Project,
    wizardState: Partial<WizardState>
): ProjectChanges {
    const result: ProjectChanges = {
        hasChanges: false,
        added: [],
        removed: [],
        configChanges: {},
        adobeContextChanged: false,
    };

    // Get all components from both
    const originalDeps = new Set(original.componentSelections?.dependencies || []);
    const newDeps = new Set(wizardState.components?.dependencies || []);

    // Find additions
    for (const dep of newDeps) {
        if (!originalDeps.has(dep)) {
            result.added.push(dep);
            result.hasChanges = true;
        }
    }

    // Find removals
    for (const dep of originalDeps) {
        if (!newDeps.has(dep)) {
            result.removed.push(dep);
            result.hasChanges = true;
        }
    }

    // Check frontend change
    if (original.componentSelections?.frontend !== wizardState.components?.frontend) {
        if (original.componentSelections?.frontend) {
            result.removed.push(original.componentSelections.frontend);
        }
        if (wizardState.components?.frontend) {
            result.added.push(wizardState.components.frontend);
        }
        result.hasChanges = true;
    }

    // Check config changes
    const originalConfigs = original.componentConfigs || {};
    const newConfigs = wizardState.componentConfigs || {};

    for (const componentId of Object.keys({ ...originalConfigs, ...newConfigs })) {
        const origConfig = originalConfigs[componentId] || {};
        const newConfig = newConfigs[componentId] || {};

        const changedKeys: string[] = [];
        for (const key of Object.keys({ ...origConfig, ...newConfig })) {
            if (origConfig[key] !== newConfig[key]) {
                changedKeys.push(key);
            }
        }

        if (changedKeys.length > 0) {
            result.configChanges[componentId] = changedKeys;
            result.hasChanges = true;
        }
    }

    // Check Adobe context
    if (original.adobe?.workspace !== wizardState.adobeWorkspace?.name ||
        original.adobe?.projectId !== wizardState.adobeProject?.id) {
        result.adobeContextChanged = true;
        result.hasChanges = true;
    }

    return result;
}

/**
 * Execute project edit - apply changes to existing project
 */
export async function executeProjectEdit(
    context: HandlerContext,
    config: {
        editProjectPath: string;
        wizardState: Partial<WizardState>;
    }
): Promise<{ success: boolean; message: string; requiresMeshRedeploy?: boolean }> {
    // Load original project
    const original = await context.stateManager.loadProjectFromPath(config.editProjectPath);
    if (!original) {
        throw new Error('Original project not found');
    }

    // Detect changes
    const changes = detectProjectChanges(original, config.wizardState);

    if (!changes.hasChanges) {
        return {
            success: true,
            message: 'No changes to apply',
        };
    }

    context.logger.info(`[Edit Executor] Changes detected:`, {
        added: changes.added,
        removed: changes.removed,
        configChanges: Object.keys(changes.configChanges),
        adobeChanged: changes.adobeContextChanged,
    });

    // TODO: Create snapshot for rollback

    try {
        // Handle component removals
        for (const componentId of changes.removed) {
            const componentPath = path.join(original.path, 'components', componentId);
            await fs.rm(componentPath, { recursive: true, force: true });
            delete original.componentInstances?.[componentId];
            context.logger.info(`[Edit Executor] Removed: ${componentId}`);
        }

        // Handle component additions
        if (changes.added.length > 0) {
            const { ComponentManager } = await import('@/features/components/services/componentManager');
            const { ComponentRegistryManager } = await import('@/features/components/services/ComponentRegistryManager');

            const registryManager = new ComponentRegistryManager(context.context.extensionPath);
            const componentManager = new ComponentManager(context.logger);

            for (const componentId of changes.added) {
                // Find component definition
                const allDeps = await registryManager.getDependencies();
                const componentDef = allDeps.find(d => d.id === componentId);

                if (componentDef) {
                    const result = await componentManager.installComponent(original, componentDef, {});
                    if (result.success && result.component) {
                        original.componentInstances![componentId] = result.component;
                        context.logger.info(`[Edit Executor] Added: ${componentId}`);
                    }
                }
            }
        }

        // Handle config changes
        if (Object.keys(changes.configChanges).length > 0) {
            // Update componentConfigs
            original.componentConfigs = config.wizardState.componentConfigs as Record<string, Record<string, string | boolean | number | undefined>>;

            // Regenerate .env files for changed components
            // (Implementation similar to executor.ts Phase 4)
        }

        // Update project manifest
        original.lastModified = new Date();
        original.componentSelections = {
            frontend: config.wizardState.components?.frontend,
            backend: config.wizardState.components?.backend,
            dependencies: config.wizardState.components?.dependencies || [],
            integrations: config.wizardState.components?.integrations || [],
            appBuilder: config.wizardState.components?.appBuilderApps || [],
        };

        await context.stateManager.saveProject(original);

        return {
            success: true,
            message: `Applied ${changes.added.length} additions, ${changes.removed.length} removals`,
            requiresMeshRedeploy: changes.adobeContextChanged,
        };
    } catch (error) {
        context.logger.error('[Edit Executor] Failed to apply changes', error as Error);
        // TODO: Rollback from snapshot
        throw error;
    }
}
```

### REFACTOR Phase

1. Add snapshot/rollback logic using existing componentUpdater pattern
2. Add progress tracking like main executor
3. Ensure .env regeneration follows existing patterns
4. Add comprehensive logging

---

## Expected Outcome

- `detectProjectChanges()` accurately identifies all differences
- `executeProjectEdit()` applies only necessary changes
- Component additions install correctly
- Component removals clean up properly
- Config changes update .env files
- Adobe context changes flag mesh redeploy

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] detectProjectChanges accurately detects all change types
- [ ] executeProjectEdit handles additions correctly
- [ ] executeProjectEdit handles removals correctly
- [ ] executeProjectEdit handles config changes correctly
- [ ] Adobe context changes trigger mesh redeploy warning
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 85% for new code

---

## Estimated Time

**4-5 hours**

- Writing tests: 1.5 hours
- Implementation: 2 hours
- Snapshot/rollback logic: 1 hour
- Testing and refinement: 30 minutes
