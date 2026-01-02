# Step 3: Instantiate EDS Dependencies and Pass Config

## Purpose

Wire up required services (GitHubServices, DaLiveServices, AuthenticationService, ComponentManager) for EdsProjectService and execute setupProject(). This step replaces the placeholder from Step 1 with actual service instantiation and the real EdsProjectService call.

## Prerequisites

- [ ] Step 1 complete (EDS detection via `isEdsStack`, `edsConfig` in ProjectCreationConfig, EDS phase placeholder)
- [ ] Step 2 complete (Frontend skip logic, frontend ComponentInstance creation from project path)
- [ ] EdsProjectService constructor dependencies understood:
  - `GitHubServicesForProject` = { tokenService: GitHubTokenService, repoOperations: GitHubRepoOperations }
  - `DaLiveServicesForProject` = { orgOperations: DaLiveOrgOperations, contentOperations: DaLiveContentOperations }
  - `AuthenticationService` (for IMS token as TokenProvider)
  - `ComponentManager` (for tool cloning)
- [ ] EdsProjectConfig structure understood (projectName, projectPath, repoName, daLiveOrg, daLiveSite, etc.)

## Tests to Write First (RED Phase)

### Test File: `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

#### Test Suite 1: EDS Service Instantiation

- [ ] Test: should instantiate EdsProjectService with correct dependencies for EDS stacks
  - **Given:** Config with selectedStack: 'eds-paas' and valid edsConfig
  - **When:** executeProjectCreation runs EDS setup phase
  - **Then:** EdsProjectService is created with GitHubServices, DaLiveServices, AuthService, ComponentManager
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should NOT instantiate EDS services for non-EDS stacks (lazy instantiation)
  - **Given:** Config with selectedStack: 'headless-paas'
  - **When:** executeProjectCreation runs
  - **Then:** No EDS service constructors called
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should NOT instantiate EDS services when edsConfig is missing
  - **Given:** Config with selectedStack: 'eds-paas' but NO edsConfig
  - **When:** executeProjectCreation runs
  - **Then:** No EDS service constructors called, phase skipped
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

#### Test Suite 2: EdsProjectConfig Mapping

- [ ] Test: should map wizard edsConfig to EdsProjectConfig correctly
  - **Given:** Wizard config with edsConfig: { repoName, daLiveOrg, daLiveSite, repoMode: 'new' }
  - **When:** EdsProjectConfig is built
  - **Then:** EdsProjectConfig has projectName, projectPath, repoName, daLiveOrg, daLiveSite, githubOwner
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should pass accsEndpoint from wizard config to EdsProjectConfig
  - **Given:** Wizard config with edsConfig including accsEndpoint
  - **When:** EdsProjectConfig is built
  - **Then:** EdsProjectConfig.accsEndpoint matches wizard value
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should handle existing repo mode in EdsProjectConfig
  - **Given:** Wizard config with repoMode: 'existing' and existingRepo: 'owner/repo'
  - **When:** EdsProjectConfig is built
  - **Then:** EdsProjectConfig.repoMode='existing', EdsProjectConfig.existingRepo='owner/repo'
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

#### Test Suite 3: EdsProjectService.setupProject() Call

- [ ] Test: should call setupProject with correct EdsProjectConfig
  - **Given:** Valid EDS config and mocked EdsProjectService
  - **When:** EDS setup phase executes
  - **Then:** setupProject called with EdsProjectConfig matching wizard values
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should call setupProject with progress callback
  - **Given:** Valid EDS config
  - **When:** EDS setup phase executes
  - **Then:** setupProject receives progressCallback that maps to progressTracker
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should map EDS progress callback to executor progress (16-30 range)
  - **Given:** EdsProjectService progress callback receives phase progress
  - **When:** Callback invoked with phase='github-repo', progress=50
  - **Then:** progressTracker receives 'EDS Setup', progress=23 (mapped)
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

#### Test Suite 4: Result Handling

- [ ] Test: should store EDS setup result for frontend ComponentInstance
  - **Given:** setupProject returns success with repoUrl, previewUrl, liveUrl
  - **When:** EDS setup phase completes
  - **Then:** Result available for frontend ComponentInstance creation
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should create frontend ComponentInstance with EDS project path
  - **Given:** EDS setup succeeded
  - **When:** Frontend instance is created
  - **Then:** ComponentInstance.path = projectPath (EDS clones to root)
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should store EDS metadata in frontend ComponentInstance
  - **Given:** EDS setup returns previewUrl and liveUrl
  - **When:** Frontend instance is created
  - **Then:** ComponentInstance.metadata includes { previewUrl, liveUrl, repoUrl }
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

#### Test Suite 5: Error Handling

- [ ] Test: should handle EDS setup failure gracefully
  - **Given:** setupProject returns { success: false, error: 'GitHub auth failed', phase: 'github-repo' }
  - **When:** EDS setup phase executes
  - **Then:** Error logged with context, project creation continues with partial state
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should throw on critical EDS setup failure
  - **Given:** setupProject throws exception
  - **When:** EDS setup phase executes
  - **Then:** Exception propagates with user-friendly message
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

- [ ] Test: should skip EDS setup if AuthenticationService unavailable
  - **Given:** context.authManager is undefined
  - **When:** EDS stack detected
  - **Then:** EDS setup skipped with warning log, project continues
  - **File:** `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

## Files to Create/Modify

### Create: `tests/features/project-creation/handlers/executor-edsServiceWiring.test.ts`

**Purpose:** Test EDS service wiring, config mapping, and error handling

### Modify: `src/features/project-creation/handlers/executor.ts`

**Changes:**

1. **Add imports for EDS services** (at top of file):
   - Import EdsProjectService, GitHubServicesForProject, DaLiveServicesForProject
   - Import GitHubTokenService, GitHubRepoOperations
   - Import DaLiveOrgOperations, DaLiveContentOperations
   - Import EdsProjectConfig, EdsProgressCallback types
   - Import ComponentManager

2. **Add helper function to create EDS services** (before executeProjectCreation):
   - Lazy instantiation function that creates services only when needed
   - Creates TokenProvider adapter from AuthenticationService

3. **Replace EDS phase placeholder with actual implementation** (in EDS setup section):
   - Build EdsProjectConfig from typedConfig.edsConfig
   - Instantiate EdsProjectService with dependencies
   - Call setupProject() with mapped progress callback
   - Store result and handle errors

4. **Update frontend ComponentInstance creation** (in EDS setup section):
   - Use EDS result metadata (previewUrl, liveUrl, repoUrl)
   - Store in ComponentInstance.metadata

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
/**
 * Tests for EDS service wiring in executor
 * Step 3: Instantiate EDS Dependencies and Pass Config
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import type { EdsProjectConfig, EdsProgressCallback, EdsProjectSetupResult } from '@/features/eds/services/types';

// Mock EDS services
const mockSetupProject = jest.fn();
jest.mock('@/features/eds/services/edsProjectService', () => ({
    EdsProjectService: jest.fn().mockImplementation(() => ({
        setupProject: mockSetupProject,
    })),
    GitHubRepoPhase: jest.fn(),
    HelixConfigPhase: jest.fn(),
    ContentPhase: jest.fn(),
    EnvConfigPhase: jest.fn(),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
        validateToken: jest.fn().mockResolvedValue({ valid: true, user: { login: 'testuser' } }),
    })),
}));

jest.mock('@/features/eds/services/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockResolvedValue({ success: true }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

// Standard test mocks (shared with other executor tests)
jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
}));
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
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([{
            id: 'eds',
            name: 'EDS Storefront',
            type: 'frontend',
            source: { type: 'git', url: 'https://github.com/test/eds' },
        }]),
        getDependencies: jest.fn().mockResolvedValue([]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
        getComponentById: jest.fn().mockResolvedValue(undefined),
    })),
}));
jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
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

describe('Executor - EDS Service Wiring', () => {
    let mockContext: Partial<HandlerContext>;
    let progressCalls: Array<{ operation: string; progress: number; message: string }>;

    const createMockContext = (): Partial<HandlerContext> => {
        progressCalls = [];
        return {
            context: {
                extensionPath: '/test/extension',
                secrets: {
                    get: jest.fn().mockResolvedValue(null),
                    store: jest.fn().mockResolvedValue(undefined),
                    delete: jest.fn().mockResolvedValue(undefined),
                },
            } as any,
            logger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            debugLogger: {
                info: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockResolvedValue(undefined),
            } as any,
            authManager: {
                getAccessToken: jest.fn().mockResolvedValue('ims-token-123'),
                isAuthenticated: jest.fn().mockResolvedValue(true),
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
        // Reset the setupProject mock for each test
        mockSetupProject.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/testuser/test-repo',
            previewUrl: 'https://main--test-repo--testuser.aem.page',
            liveUrl: 'https://main--test-repo--testuser.aem.live',
        } as EdsProjectSetupResult);
    });

    describe('EDS Service Instantiation', () => {
        it('should instantiate EdsProjectService with correct dependencies for EDS stacks', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            const { EdsProjectService } = require('@/features/eds/services/edsProjectService');
            expect(EdsProjectService).toHaveBeenCalled();
        });

        it('should NOT instantiate EDS services for non-EDS stacks', async () => {
            const headlessConfig = {
                projectName: 'test-headless-project',
                selectedStack: 'headless-paas',
                components: { frontend: 'headless' },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/test/headless',
                    branch: 'main',
                },
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, headlessConfig);

            const { EdsProjectService } = require('@/features/eds/services/edsProjectService');
            expect(EdsProjectService).not.toHaveBeenCalled();
        });

        it('should NOT instantiate EDS services when edsConfig is missing', async () => {
            const configMissingEds = {
                projectName: 'test-eds-no-config',
                selectedStack: 'eds-paas',
                // No edsConfig provided
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, configMissingEds);

            const { EdsProjectService } = require('@/features/eds/services/edsProjectService');
            expect(EdsProjectService).not.toHaveBeenCalled();
        });
    });

    describe('EdsProjectConfig Mapping', () => {
        it('should map wizard edsConfig to EdsProjectConfig correctly', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'my-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                    githubOwner: 'myuser',
                    accsEndpoint: 'https://accs.example.com',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Verify setupProject was called with correct config
            expect(mockSetupProject).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectName: 'test-eds-project',
                    repoName: 'my-repo',
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                    githubOwner: 'myuser',
                    accsEndpoint: 'https://accs.example.com',
                }),
                expect.any(Function),
            );
        });

        it('should handle existing repo mode in EdsProjectConfig', async () => {
            const edsConfig = {
                projectName: 'test-eds-existing',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'existing-repo',
                    repoMode: 'existing' as const,
                    existingRepo: 'owner/existing-repo',
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                    githubOwner: 'owner',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            expect(mockSetupProject).toHaveBeenCalledWith(
                expect.objectContaining({
                    repoMode: 'existing',
                    existingRepo: 'owner/existing-repo',
                }),
                expect.any(Function),
            );
        });
    });

    describe('EdsProjectService.setupProject() Call', () => {
        it('should call setupProject with progress callback', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Verify setupProject was called with a progress callback function
            expect(mockSetupProject).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Function),
            );
        });

        it('should map EDS progress callback to executor progress (16-30 range)', async () => {
            // Capture the progress callback
            let capturedCallback: EdsProgressCallback | undefined;
            mockSetupProject.mockImplementation((config, callback) => {
                capturedCallback = callback;
                // Simulate progress calls
                callback('github-repo', 0, 'Starting...');
                callback('github-repo', 50, 'In progress...');
                callback('complete', 100, 'Done!');
                return Promise.resolve({ success: true });
            });

            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Verify progress was mapped to 16-30 range
            const edsProgressCalls = progressCalls.filter(c => c.operation === 'EDS Setup');
            expect(edsProgressCalls.some(c => c.progress >= 16 && c.progress <= 30)).toBe(true);
        });
    });

    describe('Result Handling', () => {
        it('should create frontend ComponentInstance with EDS metadata', async () => {
            let savedProject: any = null;
            mockContext.stateManager = {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockImplementation((project) => {
                    savedProject = project;
                    return Promise.resolve();
                }),
            } as any;

            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Verify frontend instance has EDS metadata
            expect(savedProject?.componentInstances?.['eds']).toBeDefined();
            expect(savedProject?.componentInstances?.['eds']?.metadata).toMatchObject({
                previewUrl: expect.stringContaining('.aem.page'),
                liveUrl: expect.stringContaining('.aem.live'),
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle EDS setup failure gracefully', async () => {
            mockSetupProject.mockResolvedValue({
                success: false,
                error: 'GitHub authentication failed',
                phase: 'github-repo',
            } as EdsProjectSetupResult);

            const edsConfig = {
                projectName: 'test-eds-failure',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // Should not throw, but log error
            await expect(
                executeProjectCreation(mockContext as HandlerContext, edsConfig)
            ).rejects.toThrow(/EDS setup failed/);

            expect(mockContext.logger?.error).toHaveBeenCalled();
        });

        it('should skip EDS setup if AuthenticationService unavailable', async () => {
            mockContext.authManager = undefined;

            const edsConfig = {
                projectName: 'test-eds-no-auth',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            jest.resetModules();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            // Should not throw
            await expect(
                executeProjectCreation(mockContext as HandlerContext, edsConfig)
            ).resolves.not.toThrow();

            // Should log warning about missing auth
            expect(mockContext.logger?.warn).toHaveBeenCalledWith(
                expect.stringContaining('AuthenticationService'),
            );
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

**1. Add imports for EDS services** (executor.ts, at top of file):

```typescript
// Add to existing imports at top of file
import type { ComponentManager } from '@/features/components/services/componentManager';
import {
    EdsProjectService,
    type GitHubServicesForProject,
    type DaLiveServicesForProject,
} from '@/features/eds/services/edsProjectService';
import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import { GitHubRepoOperations } from '@/features/eds/services/githubRepoOperations';
import { DaLiveOrgOperations } from '@/features/eds/services/daLiveOrgOperations';
import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import type {
    EdsProjectConfig,
    EdsProgressCallback,
    EdsProjectSetupResult,
} from '@/features/eds/services/types';
```

**2. Add helper function to create EDS services** (executor.ts, after helper functions section):

```typescript
/**
 * Create EDS services for EdsProjectService
 * Lazy instantiation - only called when EDS stack is detected
 */
async function createEdsServices(
    context: HandlerContext,
): Promise<{
    githubServices: GitHubServicesForProject;
    daLiveServices: DaLiveServicesForProject;
    componentManager: ComponentManager;
} | null> {
    // AuthenticationService required for DA.live token
    if (!context.authManager) {
        context.logger.warn('[Project Creation] AuthenticationService not available - cannot create EDS services');
        return null;
    }

    // Create TokenProvider adapter from AuthenticationService
    const tokenProvider = {
        getAccessToken: () => context.authManager!.getAccessToken(),
    };

    // GitHub services
    const githubTokenService = new GitHubTokenService(context.context.secrets, context.logger);
    const githubRepoOperations = new GitHubRepoOperations(githubTokenService, context.logger);
    const githubServices: GitHubServicesForProject = {
        tokenService: githubTokenService,
        repoOperations: githubRepoOperations,
    };

    // DA.live services
    const daLiveOrgOperations = new DaLiveOrgOperations(tokenProvider, context.logger);
    const daLiveContentOperations = new DaLiveContentOperations(tokenProvider, context.logger);
    const daLiveServices: DaLiveServicesForProject = {
        orgOperations: daLiveOrgOperations,
        contentOperations: daLiveContentOperations,
    };

    // ComponentManager for tool cloning
    const { ComponentManager: CM } = await import('@/features/components/services/componentManager');
    const componentManager = new CM(context.logger);

    return { githubServices, daLiveServices, componentManager };
}

/**
 * Build EdsProjectConfig from wizard configuration
 */
function buildEdsProjectConfig(
    typedConfig: ProjectCreationConfig,
    projectPath: string,
): EdsProjectConfig | null {
    const edsConfig = typedConfig.edsConfig;
    if (!edsConfig) return null;

    return {
        projectName: typedConfig.projectName,
        projectPath,
        repoName: edsConfig.repoName,
        daLiveOrg: edsConfig.daLiveOrg,
        daLiveSite: edsConfig.daLiveSite,
        accsEndpoint: edsConfig.accsEndpoint || '',
        githubOwner: edsConfig.githubOwner || '',
        isPrivate: edsConfig.isPrivate,
        skipContent: edsConfig.skipContent,
        skipTools: edsConfig.skipTools,
        repoMode: edsConfig.repoMode,
        existingRepo: edsConfig.existingRepo,
        resetToTemplate: edsConfig.resetToTemplate,
    };
}
```

**Note**: The `ProjectCreationConfig.edsConfig` interface is fully defined in Step 1 (includes `githubOwner`, `isPrivate`, and all other fields needed). Step 3 uses the complete interface from Step 1.

**4. Replace EDS phase placeholder with actual implementation** (executor.ts, in EDS setup section):

```typescript
    // ========================================================================
    // EDS SETUP (if EDS stack selected)
    // ========================================================================

    const isEdsStack = typedConfig.selectedStack?.startsWith('eds-');
    let edsResult: EdsProjectSetupResult | undefined;

    if (isEdsStack && typedConfig.edsConfig) {
        progressTracker('EDS Setup', 16, 'Initializing Edge Delivery Services...');

        // Create EDS services (lazy instantiation)
        const edsServices = await createEdsServices(context);
        if (!edsServices) {
            context.logger.warn('[Project Creation] Skipping EDS setup - services unavailable');
        } else {
            // Build EdsProjectConfig from wizard config
            const edsProjectConfig = buildEdsProjectConfig(typedConfig, projectPath);
            if (!edsProjectConfig) {
                context.logger.warn('[Project Creation] Skipping EDS setup - config invalid');
            } else {
                // Map EdsProgressCallback to executor progressTracker
                // EDS progress (0-100) maps to executor progress (16-30)
                const edsProgressCallback: EdsProgressCallback = (phase, progress, message) => {
                    const mappedProgress = 16 + Math.round(progress * 0.14);
                    progressTracker('EDS Setup', mappedProgress, message);
                };

                // Create EdsProjectService and run setup
                const edsProjectService = new EdsProjectService(
                    edsServices.githubServices,
                    edsServices.daLiveServices,
                    context.authManager!,
                    edsServices.componentManager,
                    context.logger,
                );

                context.logger.info(`[Project Creation] Running EDS setup for: ${typedConfig.projectName}`);
                edsResult = await edsProjectService.setupProject(edsProjectConfig, edsProgressCallback);

                if (!edsResult.success) {
                    const errorMsg = `EDS setup failed at phase '${edsResult.phase}': ${edsResult.error}`;
                    context.logger.error(`[Project Creation] ${errorMsg}`);
                    throw new Error(errorMsg);
                }

                context.logger.info(`[Project Creation] EDS setup complete: ${edsResult.repoUrl}`);
            }
        }

        // Create frontend ComponentInstance from EDS project path
        const frontendId = typedConfig.components?.frontend;
        if (frontendId) {
            const frontendInstance: import('@/types').ComponentInstance = {
                id: frontendId,
                name: 'EDS Storefront',
                type: 'frontend',
                path: projectPath,  // EDS clones to project root
                status: 'installed',
                lastUpdated: new Date(),
                metadata: edsResult ? {
                    previewUrl: edsResult.previewUrl,
                    liveUrl: edsResult.liveUrl,
                    repoUrl: edsResult.repoUrl,
                } : undefined,
            };
            project.componentInstances![frontendId] = frontendInstance;

            context.logger.debug(`[Project Creation] Created EDS frontend instance: ${frontendId}`);
        }

        progressTracker('EDS Setup', 30, 'EDS initialization complete');
    }
```

### REFACTOR Phase

1. Extract the EDS service creation into a separate module if complexity grows
2. Consider adding retry logic for network-related EDS failures
3. Ensure all log messages follow consistent formatting
4. Verify progress mapping is visible to users (not too fast)
5. Add JSDoc comments to helper functions

## Expected Outcome

After this step:

- [ ] EdsProjectService instantiated with all required dependencies when EDS stack detected
- [ ] Wizard edsConfig correctly mapped to EdsProjectConfig
- [ ] setupProject() called with progress callback that maps to executor progress
- [ ] EDS setup result (repoUrl, previewUrl, liveUrl) stored in frontend ComponentInstance metadata
- [ ] Errors handled gracefully with user-friendly messages
- [ ] Non-EDS stacks completely unaffected
- [ ] All 3 steps integrate correctly end-to-end

## Acceptance Criteria

- [ ] All tests passing for service wiring
- [ ] All tests passing for config mapping
- [ ] All tests passing for result handling
- [ ] All tests passing for error handling
- [ ] Integration with Steps 1-2 verified
- [ ] Code follows project style guide
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 80% for new code

## Dependencies from Other Steps

- **Step 1 provides:**
  - `isEdsStack` detection logic (`selectedStack?.startsWith('eds-')`)
  - `edsConfig` field in ProjectCreationConfig interface
  - EDS Setup phase location in executor flow
  - Progress mapping formula (16 + progress * 0.14)

- **Step 2 provides:**
  - Frontend skip logic in loadComponentDefinitions (isEdsStack parameter)
  - Frontend ComponentInstance creation point (inside EDS setup phase)
  - Component definitions Map excluding frontend for EDS stacks

## Integration Notes

This step completes the EDS setup integration by:

1. **Connecting the placeholder** from Step 1 to actual EdsProjectService
2. **Using the frontend skip** from Step 2 to avoid duplicate cloning
3. **Storing EDS metadata** in the frontend ComponentInstance for later use (dashboard, configure UI)

The full flow now works as:
1. User selects EDS stack in wizard
2. Executor detects `isEdsStack` (Step 1) and has `edsConfig`
3. **Step 3**: Services instantiated, setupProject() called, frontend ComponentInstance created with metadata
4. **Step 2**: Frontend skipped in componentDefinitions (not cloned again by componentInstallationOrchestrator)
5. Progress reported correctly during EDS phase (Step 1 progress mapping)
6. Rest of executor continues (dependencies, mesh, finalization)

## Estimated Complexity

- **Lines of code:** ~80-100 (imports + helpers + implementation)
- **Test lines:** ~350-400
- **Cyclomatic complexity:** Medium (service instantiation, error handling)
- **Time estimate:** 2-3 hours

---

_Step created by Step Generator Sub-Agent_
_Target: TDD-ready implementation with clear test-first approach_
