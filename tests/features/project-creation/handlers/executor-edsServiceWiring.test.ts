/**
 * Tests for EDS service wiring in executor
 * Step 3: Instantiate EDS Dependencies and Pass Config
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import type { EdsProjectSetupResult, EdsProgressCallback } from '@/features/eds/services/types';

// Mock EDS services - track constructor calls
let edsServiceConstructorCalled = false;
const mockSetupProject = jest.fn();

jest.mock('@/features/eds/services/edsProjectService', () => ({
    EdsProjectService: jest.fn().mockImplementation(() => {
        edsServiceConstructorCalled = true;
        return { setupProject: mockSetupProject };
    }),
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

// Standard test mocks
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
    generateComponentConfigFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/project-creation/services', () => ({
    cloneAllComponents: jest.fn().mockResolvedValue(undefined),
    installAllComponents: jest.fn().mockResolvedValue(undefined),
    deployNewMesh: jest.fn().mockResolvedValue(undefined),
    linkExistingMesh: jest.fn().mockResolvedValue(undefined),
    shouldConfigureExistingMesh: jest.fn().mockReturnValue(false),
    generateEnvironmentFiles: jest.fn().mockResolvedValue(undefined),
    finalizeProject: jest.fn().mockResolvedValue(undefined),
    sendCompletionAndCleanup: jest.fn().mockResolvedValue(undefined),
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
        edsServiceConstructorCalled = false;
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
        it('should instantiate EdsProjectService for EDS stacks', async () => {
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

            expect(edsServiceConstructorCalled).toBe(true);
        });

        it('should NOT instantiate EDS services for non-EDS stacks', async () => {
            jest.resetModules();
            edsServiceConstructorCalled = false;

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

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, headlessConfig);

            expect(edsServiceConstructorCalled).toBe(false);
        });

        it('should NOT instantiate EDS services when edsConfig is missing', async () => {
            jest.resetModules();
            edsServiceConstructorCalled = false;

            const configMissingEds = {
                projectName: 'test-eds-no-config',
                selectedStack: 'eds-paas',
                // No edsConfig provided
                components: { frontend: 'eds' },
                componentConfigs: {},
            };

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, configMissingEds);

            expect(edsServiceConstructorCalled).toBe(false);
        });
    });

    describe('EdsProjectConfig Mapping', () => {
        it('should call setupProject with correct EdsProjectConfig', async () => {
            jest.resetModules();

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

            mockContext = createMockContext();
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
            jest.resetModules();

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

            mockContext = createMockContext();
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

    describe('setupProject Call', () => {
        it('should call setupProject with progress callback', async () => {
            jest.resetModules();

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

            mockContext = createMockContext();
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
            jest.resetModules();

            // Capture the progress callback
            mockSetupProject.mockImplementation((config, callback) => {
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

            mockContext = createMockContext();
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
            // Don't reset modules - use existing mocks
            let savedProjects: any[] = [];

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

            mockContext = createMockContext();
            // Override stateManager to capture all saved projects
            mockContext.stateManager = {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockImplementation((project) => {
                    // Deep clone to capture state at save time
                    savedProjects.push(JSON.parse(JSON.stringify(project)));
                    return Promise.resolve();
                }),
            } as any;

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Find the project with component instances (last save should have them)
            // Note: COMPONENT_IDS.EDS_STOREFRONT is 'eds-storefront', not 'eds'
            const projectWithInstances = savedProjects.find(p =>
                p.componentInstances && p.componentInstances['eds-storefront']
            );

            // Verify frontend instance has EDS metadata
            expect(projectWithInstances).toBeDefined();
            expect(projectWithInstances?.componentInstances?.['eds-storefront']).toBeDefined();
            expect(projectWithInstances?.componentInstances?.['eds-storefront']?.metadata).toMatchObject({
                previewUrl: expect.stringContaining('.aem.page'),
                liveUrl: expect.stringContaining('.aem.live'),
            });
        });
    });

    describe('Error Handling', () => {
        it('should throw on EDS setup failure', async () => {
            jest.resetModules();

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

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await expect(
                executeProjectCreation(mockContext as HandlerContext, edsConfig)
            ).rejects.toThrow(/EDS setup failed/);
        });

        it('should skip EDS setup if AuthenticationService unavailable', async () => {
            jest.resetModules();
            edsServiceConstructorCalled = false;

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

            mockContext = createMockContext();
            mockContext.authManager = undefined;

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

            // EDS services should not be instantiated
            expect(edsServiceConstructorCalled).toBe(false);
        });
    });
});
