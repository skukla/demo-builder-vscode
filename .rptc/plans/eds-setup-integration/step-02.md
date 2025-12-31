# Step 2: Modify Frontend Cloning for EDS

## Purpose

Skip regular frontend cloning when EDS stack is detected. EdsProjectService handles GitHub repo cloning internally (via GitHubRepoPhase), so the executor should not attempt to clone the frontend component through the standard componentInstallationOrchestrator flow.

## Prerequisites

- [ ] Step 1 complete (isEdsStack detection implemented, edsConfig in ProjectCreationConfig)
- [ ] loadComponentDefinitions function understood (lines 385-488 in executor.ts)
- [ ] EdsProjectService repo cloning behavior understood (setupProject clones to projectPath)
- [ ] ComponentInstance structure understood (id, name, type, path, status, lastUpdated)

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

#### Test Suite 1: Frontend Skip for EDS Stacks

- [ ] Test: should NOT include frontend in componentDefinitions for EDS stacks
  - **Given:** Config with selectedStack: 'eds-paas' and frontend: 'eds'
  - **When:** loadComponentDefinitions is called with isEdsStack: true
  - **Then:** Returned Map does NOT contain 'eds' frontend component
  - **File:** `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

- [ ] Test: should include frontend in componentDefinitions for non-EDS stacks
  - **Given:** Config with selectedStack: 'headless-paas' and frontend: 'headless'
  - **When:** loadComponentDefinitions is called with isEdsStack: false
  - **Then:** Returned Map CONTAINS 'headless' frontend component
  - **File:** `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

- [ ] Test: should still include dependency components for EDS stacks
  - **Given:** Config with selectedStack: 'eds-paas' and dependencies: ['commerce-mesh']
  - **When:** loadComponentDefinitions is called with isEdsStack: true
  - **Then:** Returned Map CONTAINS 'commerce-mesh' dependency component
  - **File:** `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

- [ ] Test: should still include app-builder components for EDS stacks
  - **Given:** Config with selectedStack: 'eds-paas' and appBuilder: ['some-app']
  - **When:** loadComponentDefinitions is called with isEdsStack: true
  - **Then:** Returned Map CONTAINS 'some-app' app-builder component
  - **File:** `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

#### Test Suite 2: Verify Frontend Not Cloned

- [ ] Test: should NOT create duplicate frontend instance for EDS stacks
  - **Given:** EDS stack with frontend in components config
  - **When:** cloneAllComponents executes
  - **Then:** Frontend is NOT in installComponentCalls (componentDefinitions doesn't include it)
  - **File:** `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

**Note**: Tests for frontend ComponentInstance creation with EDS metadata are in Step 3 (`executor-edsServiceWiring.test.ts`).

## Files to Create/Modify

### Create: `tests/features/project-creation/handlers/executor-edsFrontendSkip.test.ts`

**Purpose:** Test frontend skip logic for EDS stacks

### Modify: `src/features/project-creation/handlers/executor.ts`

**Changes:**

1. **Update loadComponentDefinitions signature** (line 385-388):
   - Add `isEdsStack: boolean` parameter

2. **Skip frontend in allComponents when EDS** (line 404-405):
   - Conditional logic to exclude frontend for EDS stacks

3. **Update call site** (around line 174):
   - Pass `isEdsStack` to `loadComponentDefinitions`

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
/**
 * Tests for frontend skip logic when EDS stack is detected
 * Step 2: Modify Frontend Cloning for EDS
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Track component installation calls
let installComponentCalls: string[] = [];

// Mock dependencies
jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        }),
    },
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('Not found')),
    readdir: jest.fn().mockResolvedValue([]),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockImplementation((project, definition) => {
            installComponentCalls.push(definition.id);
            return Promise.resolve({
                success: true,
                component: {
                    id: definition.id,
                    name: definition.name,
                    type: definition.type,
                    status: 'installed',
                    path: `/tmp/test-project/components/${definition.id}`,
                    lastUpdated: new Date(),
                },
            });
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([
            {
                id: 'eds',
                name: 'EDS Storefront',
                type: 'frontend',
                source: { type: 'git', url: 'https://github.com/test/eds' },
            },
            {
                id: 'headless',
                name: 'Headless Storefront',
                type: 'frontend',
                source: { type: 'git', url: 'https://github.com/test/headless' },
            },
        ]),
        getDependencies: jest.fn().mockResolvedValue([{
            id: 'commerce-mesh',
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            source: { type: 'git', url: 'https://github.com/test/commerce-mesh' },
        }]),
        getAppBuilder: jest.fn().mockResolvedValue([{
            id: 'some-app',
            name: 'Some App Builder',
            type: 'app-builder',
            source: { type: 'git', url: 'https://github.com/test/some-app' },
        }]),
        getComponentById: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
    updateMeshState: jest.fn().mockResolvedValue(undefined),
    fetchDeployedMeshConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        }),
    },
    window: { setStatusBarMessage: jest.fn() },
    commands: { executeCommand: jest.fn() },
}), { virtual: true });

describe('Executor - EDS Frontend Skip', () => {
    let mockContext: Partial<HandlerContext>;

    const createMockContext = (): Partial<HandlerContext> => {
        return {
            context: { extensionPath: '/test/extension' } as any,
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockResolvedValue(undefined),
            } as any,
            sharedState: {},
            sendMessage: jest.fn(),
            panel: { visible: false, dispose: jest.fn() } as any,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        installComponentCalls = [];
        mockContext = createMockContext();
    });

    describe('Frontend Skip for EDS Stacks', () => {
        it('should NOT clone frontend for EDS stacks', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
                components: {
                    frontend: 'eds',
                    dependencies: ['commerce-mesh'],
                },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/test/eds',
                    branch: 'main',
                },
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                edsConfig
            );

            // Frontend should NOT be in install calls (EDS handles it)
            expect(installComponentCalls).not.toContain('eds');
        });

        it('should clone frontend for non-EDS stacks', async () => {
            const headlessConfig = {
                projectName: 'test-headless-project',
                selectedStack: 'headless-paas',
                components: {
                    frontend: 'headless',
                    dependencies: ['commerce-mesh'],
                },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/test/headless',
                    branch: 'main',
                },
            };

            // Clear module cache and re-import with fresh mock state
            jest.resetModules();

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                headlessConfig
            );

            // Frontend SHOULD be in install calls for non-EDS
            expect(installComponentCalls).toContain('headless');
        });

        it('should still clone dependency components for EDS stacks', async () => {
            const edsConfig = {
                projectName: 'test-eds-with-deps',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
                components: {
                    frontend: 'eds',
                    dependencies: ['commerce-mesh'],
                },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/test/eds',
                    branch: 'main',
                },
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                edsConfig
            );

            // Dependencies SHOULD still be cloned for EDS
            expect(installComponentCalls).toContain('commerce-mesh');
        });
    });

    // Note: Tests for frontend ComponentInstance creation with EDS metadata
    // are in Step 3 (executor-edsServiceWiring.test.ts)
});
```

### GREEN Phase (Minimal implementation to pass tests)

**1. Update loadComponentDefinitions signature** (executor.ts, line 385):

```typescript
async function loadComponentDefinitions(
    typedConfig: ProjectCreationConfig,
    registryManager: import('@/features/components/services/ComponentRegistryManager').ComponentRegistryManager,
    context: HandlerContext,
    isEdsStack: boolean = false,  // NEW PARAMETER
): Promise<Map<string, ComponentDefinitionEntry>> {
```

**2. Skip frontend in allComponents when EDS** (executor.ts, around line 404):

```typescript
    // Filter out submodule IDs from dependencies
    const filteredDependencies = (typedConfig.components?.dependencies || [])
        .filter((id: string) => !frontendSubmoduleIds.has(id));

    // Build component list - skip frontend for EDS stacks (EdsProjectService clones it)
    const allComponents = [
        // Only include frontend if NOT EDS stack (EDS handles repo cloning internally)
        ...(!isEdsStack && typedConfig.components?.frontend
            ? [{ id: typedConfig.components.frontend, type: 'frontend' }]
            : []),
        ...filteredDependencies.map((id: string) => ({ id, type: 'dependency' })),
        ...(typedConfig.components?.appBuilder || []).map((id: string) => ({ id, type: 'app-builder' })),
    ];
```

**3. Update loadComponentDefinitions call site** (executor.ts, around line 174):

```typescript
    const isEdsStack = typedConfig.selectedStack?.startsWith('eds-');
    const componentDefinitions = await loadComponentDefinitions(typedConfig, registryManager, context, isEdsStack);
```

**Note**: The frontend ComponentInstance creation (with EDS metadata) is handled by **Step 3** after `setupProject()` returns the result. Step 2 only skips the frontend in `loadComponentDefinitions`.

### REFACTOR Phase

1. Ensure logging is consistent with existing patterns
2. Ensure isEdsStack is computed once and reused (not duplicated)
3. Verify skip logic doesn't affect non-EDS stacks

## Expected Outcome

After this step:

- [ ] loadComponentDefinitions accepts isEdsStack parameter
- [ ] Frontend component excluded from componentDefinitions for EDS stacks
- [ ] Dependencies (commerce-mesh) still loaded and cloned for EDS
- [ ] Non-EDS stacks unchanged (frontend cloned normally)
- [ ] All unit tests passing

**Note**: Frontend ComponentInstance creation is handled by Step 3 (after EdsProjectService.setupProject() returns).

## Acceptance Criteria

- [ ] All tests passing for frontend skip logic
- [ ] Non-EDS frontend cloning unchanged
- [ ] Dependencies still cloned for EDS stacks
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 80% for new code

## Dependencies from Other Steps

- **Step 1 provides:**
  - `isEdsStack` detection logic (`selectedStack?.startsWith('eds-')`)
  - `edsConfig` field in ProjectCreationConfig interface
  - EDS Setup phase placeholder in executor

- **Step 3 depends on Step 2:**
  - Uses the `isEdsStack` parameter in `loadComponentDefinitions` to skip frontend
  - Creates frontend ComponentInstance after setupProject() returns (owns this responsibility)
  - Uses result metadata (previewUrl, liveUrl, repoUrl) for ComponentInstance

## Estimated Complexity

- **Lines of code:** ~15-20 (parameter addition + conditional skip logic)
- **Test lines:** ~150-200
- **Cyclomatic complexity:** Low (simple conditional)
- **Time estimate:** 1 hour

---

_Step created by Step Generator Sub-Agent_
_Target: TDD-ready implementation with clear test-first approach_
