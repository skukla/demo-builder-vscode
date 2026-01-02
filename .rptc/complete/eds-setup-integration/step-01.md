# Step 1: Add EDS Setup Phase to Executor

## Purpose

Detect EDS stack via `selectedStack` prefix and execute EdsProjectService.setupProject() between Project Init and Component Installation phases. This step adds the detection logic and phase placeholder, deferring service instantiation to Step 3.

## Prerequisites

- [ ] Overview.md reviewed and understood
- [ ] executor.ts structure understood (phases: Pre-flight, Project Init, Load Components, Component Installation, Mesh Config, Finalization)
- [ ] EdsProjectService.setupProject() signature reviewed (takes EdsProjectConfig and optional EdsProgressCallback)
- [ ] stacks.json understood (eds-paas and eds-accs have requiresGitHub/requiresDaLive flags)

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

#### Test Suite 1: EDS Stack Detection

- [ ] Test: should detect eds-paas as EDS stack
  - **Given:** Config with selectedStack: 'eds-paas'
  - **When:** isEdsStack detection logic executes
  - **Then:** isEdsStack evaluates to true
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should detect eds-accs as EDS stack
  - **Given:** Config with selectedStack: 'eds-accs'
  - **When:** isEdsStack detection logic executes
  - **Then:** isEdsStack evaluates to true
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should NOT detect headless-paas as EDS stack
  - **Given:** Config with selectedStack: 'headless-paas'
  - **When:** isEdsStack detection logic executes
  - **Then:** isEdsStack evaluates to false
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should NOT detect headless-accs as EDS stack
  - **Given:** Config with selectedStack: 'headless-accs'
  - **When:** isEdsStack detection logic executes
  - **Then:** isEdsStack evaluates to false
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should handle undefined selectedStack gracefully
  - **Given:** Config with no selectedStack field
  - **When:** isEdsStack detection logic executes
  - **Then:** isEdsStack evaluates to false (no error thrown)
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

#### Test Suite 2: EDS Setup Phase Execution

- [ ] Test: should report EDS Setup progress for EDS stacks
  - **Given:** Config with selectedStack: 'eds-paas' and valid edsConfig
  - **When:** executeProjectCreation runs
  - **Then:** progressTracker called with 'EDS Setup' operation
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should NOT report EDS Setup progress for non-EDS stacks
  - **Given:** Config with selectedStack: 'headless-paas'
  - **When:** executeProjectCreation runs
  - **Then:** progressTracker NOT called with 'EDS Setup' operation
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

- [ ] Test: should skip EDS phase if edsConfig is missing for EDS stack
  - **Given:** Config with selectedStack: 'eds-paas' but NO edsConfig
  - **When:** executeProjectCreation runs
  - **Then:** EDS phase skipped (no progress reported), no error thrown
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

#### Test Suite 3: Progress Callback Mapping

- [ ] Test: should map EDS progress to executor progress range (16-30)
  - **Given:** EDS progressCallback receives progress 0, 50, 100
  - **When:** Callback executed
  - **Then:** progressTracker receives mapped values 16, 23, 30 respectively
  - **File:** `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

## Files to Create/Modify

### Create: `tests/features/project-creation/handlers/executor-edsSetup.test.ts`

**Purpose:** Test EDS stack detection and phase execution

### Modify: `src/features/project-creation/handlers/executor.ts`

**Changes:**

1. **Extend ProjectCreationConfig interface** (around line 51-80):
   - Add optional `edsConfig` field for EDS-specific configuration

2. **Add EDS Setup phase** (after line ~159, before line 163):
   - Add EDS stack detection logic
   - Add progress reporting for EDS phase
   - Add placeholder comment for Step 3 service instantiation

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
/**
 * Tests for EDS setup integration in executor
 * Step 1: Add EDS Setup Phase to Executor
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Mock dependencies (follow existing executor test patterns)
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
        installComponent: jest.fn().mockResolvedValue({
            success: true,
            component: {
                id: 'eds',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'installed',
                path: '/tmp/test-project/components/eds',
                lastUpdated: new Date(),
            },
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([{
            id: 'eds',
            name: 'EDS Storefront',
            type: 'frontend',
            source: { type: 'git', url: 'https://github.com/test/eds' },
        }]),
        getDependencies: jest.fn().mockResolvedValue([{
            id: 'commerce-mesh',
            name: 'Commerce API Mesh',
            type: 'dependency',
            subType: 'mesh',
            source: { type: 'git', url: 'https://github.com/test/commerce-mesh' },
        }]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
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

describe('Executor - EDS Setup Integration', () => {
    let mockContext: Partial<HandlerContext>;
    let progressCalls: Array<{ operation: string; progress: number; message: string }>;

    const createMockContext = (): Partial<HandlerContext> => {
        progressCalls = [];
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
            sendMessage: jest.fn().mockImplementation((type: string, data: any) => {
                if (type === 'creationProgress') {
                    progressCalls.push({
                        operation: data.currentOperation,
                        progress: data.progress,
                        message: data.message,
                    });
                }
            }),
            panel: { visible: false, dispose: jest.fn() } as any,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('EDS Stack Detection', () => {
        it('should detect eds-paas as EDS stack', () => {
            const selectedStack = 'eds-paas';
            const isEdsStack = selectedStack?.startsWith('eds-');
            expect(isEdsStack).toBe(true);
        });

        it('should detect eds-accs as EDS stack', () => {
            const selectedStack = 'eds-accs';
            const isEdsStack = selectedStack?.startsWith('eds-');
            expect(isEdsStack).toBe(true);
        });

        it('should NOT detect headless-paas as EDS stack', () => {
            const selectedStack = 'headless-paas';
            const isEdsStack = selectedStack?.startsWith('eds-');
            expect(isEdsStack).toBe(false);
        });

        it('should NOT detect headless-accs as EDS stack', () => {
            const selectedStack = 'headless-accs';
            const isEdsStack = selectedStack?.startsWith('eds-');
            expect(isEdsStack).toBe(false);
        });

        it('should handle undefined selectedStack gracefully', () => {
            const selectedStack: string | undefined = undefined;
            const isEdsStack = selectedStack?.startsWith('eds-');
            expect(isEdsStack).toBeFalsy();
        });
    });

    describe('EDS Setup Phase Execution', () => {
        const edsConfig = {
            projectName: 'test-eds-project',
            repoName: 'test-repo',
            repoMode: 'new' as const,
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
        };

        it('should report EDS Setup progress for EDS stacks', async () => {
            const configWithEds = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig,
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
                configWithEds
            );

            const edsProgressCalls = progressCalls.filter(
                call => call.operation === 'EDS Setup'
            );
            expect(edsProgressCalls.length).toBeGreaterThan(0);
        });

        it('should NOT report EDS Setup progress for non-EDS stacks', async () => {
            const configWithoutEds = {
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

            // Update mock to return headless frontend
            const { ComponentRegistryManager } = require('@/features/components/services/ComponentRegistryManager');
            ComponentRegistryManager.mockImplementation(() => ({
                loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
                getFrontends: jest.fn().mockResolvedValue([{
                    id: 'headless',
                    name: 'Headless Storefront',
                    type: 'frontend',
                    source: { type: 'git', url: 'https://github.com/test/headless' },
                }]),
                getDependencies: jest.fn().mockResolvedValue([{
                    id: 'commerce-mesh',
                    name: 'Commerce API Mesh',
                    type: 'dependency',
                    source: { type: 'git', url: 'https://github.com/test/commerce-mesh' },
                }]),
                getAppBuilder: jest.fn().mockResolvedValue([]),
                getComponentById: jest.fn().mockResolvedValue(undefined),
            }));

            // Clear module cache to pick up new mock
            jest.resetModules();

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                configWithoutEds
            );

            const edsProgressCalls = progressCalls.filter(
                call => call.operation === 'EDS Setup'
            );
            expect(edsProgressCalls).toHaveLength(0);
        });

        it('should skip EDS phase if edsConfig is missing for EDS stack', async () => {
            const configEdsMissingConfig = {
                projectName: 'test-eds-no-config',
                selectedStack: 'eds-paas',
                // No edsConfig provided
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

            // Should not throw
            await expect(
                executeProjectCreation(
                    mockContext as HandlerContext,
                    configEdsMissingConfig
                )
            ).resolves.not.toThrow();

            // Should skip EDS phase (no progress reported)
            const edsProgressCalls = progressCalls.filter(
                call => call.operation === 'EDS Setup'
            );
            expect(edsProgressCalls).toHaveLength(0);
        });
    });

    describe('Progress Callback Mapping', () => {
        it('should map EDS progress to executor progress range (16-30)', () => {
            // EDS progress range: 0-100
            // Executor progress range for EDS: 16-30 (14 points)
            // Formula: mappedProgress = 16 + Math.round(progress * 0.14)

            const mapEdsProgress = (progress: number): number => {
                return 16 + Math.round(progress * 0.14);
            };

            expect(mapEdsProgress(0)).toBe(16);
            expect(mapEdsProgress(50)).toBe(23);
            expect(mapEdsProgress(100)).toBe(30);
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

**1. Extend ProjectCreationConfig interface** (executor.ts, around line 51):

```typescript
interface ProjectCreationConfig {
    projectName: string;
    adobe?: AdobeConfig;
    components?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
    componentConfigs?: Record<string, Record<string, unknown>>;
    apiMesh?: {
        meshId?: string;
        endpoint?: string;
        meshStatus?: string;
        workspace?: string;
    };
    meshStepEnabled?: boolean;
    importedWorkspaceId?: string;
    importedMeshEndpoint?: string;
    selectedPackage?: string;
    selectedStack?: string;
    frontendSource?: FrontendSource;
    editMode?: boolean;
    editProjectPath?: string;
    // EDS-specific configuration (Step 1: Add type - complete for Step 3)
    edsConfig?: {
        repoName: string;
        repoMode: 'new' | 'existing';
        existingRepo?: string;
        resetToTemplate?: boolean;
        daLiveOrg: string;
        daLiveSite: string;
        accsEndpoint?: string;
        githubOwner?: string;   // Used by Step 3 for EdsProjectConfig
        isPrivate?: boolean;    // Used by Step 3 for EdsProjectConfig
        skipContent?: boolean;
        skipTools?: boolean;
    };
}
```

**2. Add EDS Setup phase** (executor.ts, after line ~159, before line 163):

```typescript
    context.logger.debug('[Project Creation] Deferring project state save until after installation');

    // ========================================================================
    // EDS SETUP (if EDS stack selected)
    // ========================================================================

    const isEdsStack = typedConfig.selectedStack?.startsWith('eds-');

    if (isEdsStack && typedConfig.edsConfig) {
        progressTracker('EDS Setup', 16, 'Initializing Edge Delivery Services...');

        // Map EdsProgressCallback to executor progressTracker
        // EDS progress (0-100) maps to executor progress (16-30)
        const mapEdsProgress = (progress: number): number => {
            return 16 + Math.round(progress * 0.14);
        };

        context.logger.info('[Project Creation] EDS setup phase - placeholder for Step 3 service instantiation');

        // TODO (Step 3): Instantiate EdsProjectService and call setupProject()
        // const edsProgressCallback: EdsProgressCallback = (phase, progress, message) => {
        //     progressTracker('EDS Setup', mapEdsProgress(progress), message);
        // };
        // const edsResult = await edsProjectService.setupProject(edsProjectConfig, edsProgressCallback);

        progressTracker('EDS Setup', 30, 'EDS initialization complete');
    }

    // ========================================================================
    // LOAD COMPONENT DEFINITIONS
    // ========================================================================
```

### REFACTOR Phase

1. Ensure consistent naming with existing patterns
2. Verify progress range (16-30) integrates correctly (EDS Setup executes after Project Init)
3. Add appropriate logging for debugging
4. Keep placeholder comment clear for Step 3 implementation

## Expected Outcome

After this step:

- [ ] EDS stacks detected via `selectedStack?.startsWith('eds-')`
- [ ] ProjectCreationConfig extended with `edsConfig` field
- [ ] EDS setup phase added between Project Init and Load Components
- [ ] Progress callback mapping implemented (0-100 to 16-30)
- [ ] Placeholder ready for EdsProjectService instantiation in Step 3
- [ ] Non-EDS stack behavior unchanged
- [ ] All unit tests passing

## Acceptance Criteria

- [ ] All tests passing for EDS detection logic
- [ ] All tests passing for EDS phase execution
- [ ] All tests passing for progress mapping
- [ ] Code follows project style guide (see CLAUDE.md)
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 80% for new code

## Dependencies from Other Steps

- **Step 3 provides:** EdsProjectService instantiation and actual setupProject() call
- **Step 2 provides:** Frontend cloning skip logic for EDS stacks

## Estimated Complexity

- **Lines of code:** ~40-50 (new interface field + phase block)
- **Test lines:** ~200-250
- **Cyclomatic complexity:** Low (simple if/else)
- **Time estimate:** 1-2 hours

---

_Step created by Step Generator Sub-Agent_
_Target: TDD-ready implementation with clear test-first approach_
