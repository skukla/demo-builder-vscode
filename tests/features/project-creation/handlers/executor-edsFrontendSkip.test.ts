/**
 * Tests for frontend skip logic when EDS stack is detected
 * Step 2: Modify Frontend Cloning for EDS
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Track component definitions passed to services
let componentDefinitionIds: string[] = [];

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
        installComponent: jest.fn().mockResolvedValue({
            success: true,
            component: {
                id: 'test',
                name: 'Test',
                type: 'dependency',
                status: 'installed',
                path: '/tmp/test-project/components/test',
                lastUpdated: new Date(),
            },
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

// Mock services to track what component definitions are used
jest.mock('@/features/project-creation/services', () => ({
    cloneAllComponents: jest.fn().mockImplementation(({ componentDefinitions }) => {
        componentDefinitionIds = Array.from(componentDefinitions.keys());
        return Promise.resolve();
    }),
    installAllComponents: jest.fn().mockResolvedValue(undefined),
    deployNewMesh: jest.fn().mockResolvedValue(undefined),
    linkExistingMesh: jest.fn().mockResolvedValue(undefined),
    shouldConfigureExistingMesh: jest.fn().mockReturnValue(false),
    generateEnvironmentFiles: jest.fn().mockResolvedValue(undefined),
    finalizeProject: jest.fn().mockResolvedValue(undefined),
    sendCompletionAndCleanup: jest.fn().mockResolvedValue(undefined),
}));

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
        componentDefinitionIds = [];
        mockContext = createMockContext();
    });

    describe('Frontend Skip for EDS Stacks', () => {
        it('should NOT include frontend in componentDefinitions for EDS stacks', async () => {
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

            // Frontend should NOT be in component definitions for EDS
            expect(componentDefinitionIds).not.toContain('eds');
        });

        it('should include frontend in componentDefinitions for non-EDS stacks', async () => {
            jest.resetModules();

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

            mockContext = createMockContext();

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                headlessConfig
            );

            // Frontend SHOULD be in component definitions for non-EDS
            expect(componentDefinitionIds).toContain('headless');
        });

        it('should still include dependency components for EDS stacks', async () => {
            jest.resetModules();

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

            mockContext = createMockContext();

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                edsConfig
            );

            // Dependencies SHOULD still be included for EDS
            expect(componentDefinitionIds).toContain('commerce-mesh');
        });

        it('should still include app-builder components for EDS stacks', async () => {
            jest.resetModules();

            const edsConfig = {
                projectName: 'test-eds-with-appbuilder',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
                components: {
                    frontend: 'eds',
                    dependencies: [],
                    appBuilder: ['some-app'],
                },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/test/eds',
                    branch: 'main',
                },
            };

            mockContext = createMockContext();

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(
                mockContext as HandlerContext,
                edsConfig
            );

            // App-builder SHOULD still be included for EDS
            expect(componentDefinitionIds).toContain('some-app');
        });
    });
});
