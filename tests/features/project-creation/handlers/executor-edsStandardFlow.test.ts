/**
 * Tests for EDS standard component flow in executor
 *
 * With the refactored architecture, EDS frontends:
 * 1. Are included in componentDefinitions (not skipped)
 * 2. Use edsConfig.repoUrl as the source
 * 3. Get cloned via the standard cloneAllComponents flow
 * 4. Have metadata populated after cloning
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';

// Track component definitions passed to cloneAllComponents
let componentDefinitionIds: string[] = [];
let clonedComponents: Map<string, any> = new Map();

// Mock dependencies
jest.mock('@/features/mesh/services/meshDeployment');
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: jest.fn().mockResolvedValue({}),
    updateMeshState: jest.fn().mockResolvedValue(undefined),
    fetchDeployedMeshConfig: jest.fn().mockResolvedValue({}),
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

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: jest.fn().mockImplementation((project, componentDef) => {
            const component = {
                id: componentDef.id,
                name: componentDef.name,
                type: componentDef.type,
                status: 'installed',
                path: `/tmp/test-project/components/${componentDef.id}`,
                lastUpdated: new Date(),
            };
            clonedComponents.set(componentDef.id, component);
            return Promise.resolve({ success: true, component });
        }),
        installNpmDependencies: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }),
        getFrontends: jest.fn().mockResolvedValue([
            {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                // No source - will be provided by edsConfig.repoUrl
            },
            {
                id: 'headless',
                name: 'Headless Storefront',
                type: 'frontend',
                source: { type: 'git', url: 'https://github.com/test/headless' },
            },
        ]),
        getDependencies: jest.fn().mockResolvedValue([{
            id: 'eds-commerce-mesh',
            name: 'EDS Commerce Mesh',
            type: 'dependency',
            subType: 'mesh',
            source: { type: 'git', url: 'https://github.com/test/eds-mesh' },
        }]),
        getAppBuilder: jest.fn().mockResolvedValue([]),
        getComponentById: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/project-creation/helpers/envFileGenerator', () => ({
    generateComponentEnvFile: jest.fn().mockResolvedValue(undefined),
    generateComponentConfigFiles: jest.fn().mockResolvedValue(undefined),
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
    cloneAllComponents: jest.fn().mockImplementation(({ componentDefinitions, project }) => {
        componentDefinitionIds = Array.from(componentDefinitions.keys());
        // Simulate component creation
        for (const [id, entry] of componentDefinitions.entries()) {
            const component = {
                id,
                name: entry.definition.name,
                type: entry.definition.type,
                status: 'installed',
                path: `${project.path}/components/${id}`,
                lastUpdated: new Date(),
            };
            project.componentInstances = project.componentInstances || {};
            project.componentInstances[id] = component;
        }
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

describe('Executor - EDS Standard Flow', () => {
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
        clonedComponents.clear();
        mockContext = createMockContext();
    });

    describe('EDS Frontend Inclusion in componentDefinitions', () => {
        it('should include eds-storefront in componentDefinitions for EDS stacks', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    repoUrl: 'https://github.com/testuser/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: {
                    frontend: 'eds-storefront',
                    dependencies: ['eds-commerce-mesh'],
                },
                componentConfigs: {},
            };

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // EDS frontend SHOULD be in component definitions
            expect(componentDefinitionIds).toContain('eds-storefront');
        });

        it('should use edsConfig.repoUrl as the source for EDS frontend', async () => {
            const edsConfig = {
                projectName: 'test-eds-project',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'my-custom-repo',
                    repoMode: 'new' as const,
                    repoUrl: 'https://github.com/myuser/my-custom-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'myuser',
                },
                components: {
                    frontend: 'eds-storefront',
                    dependencies: [],
                },
                componentConfigs: {},
            };

            // Override mock to capture component definitions
            const { cloneAllComponents } = await import('@/features/project-creation/services');
            let capturedDefinitions: Map<string, any> | null = null;
            (cloneAllComponents as jest.Mock).mockImplementation(({ componentDefinitions, project }) => {
                capturedDefinitions = componentDefinitions;
                componentDefinitionIds = Array.from(componentDefinitions.keys());
                for (const [id, entry] of componentDefinitions.entries()) {
                    project.componentInstances = project.componentInstances || {};
                    project.componentInstances[id] = {
                        id,
                        name: entry.definition.name,
                        type: entry.definition.type,
                        status: 'installed',
                        path: `${project.path}/components/${id}`,
                        lastUpdated: new Date(),
                    };
                }
                return Promise.resolve();
            });

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Verify the source URL was set from edsConfig
            expect(capturedDefinitions).not.toBeNull();
            const edsEntry = capturedDefinitions!.get('eds-storefront');
            expect(edsEntry).toBeDefined();
            expect(edsEntry.definition.source.url).toBe('https://github.com/myuser/my-custom-repo');
            expect(edsEntry.definition.source.type).toBe('git');
        });

        it('should include dependency components alongside EDS frontend', async () => {
            const edsConfig = {
                projectName: 'test-eds-with-deps',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    repoUrl: 'https://github.com/testuser/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                },
                components: {
                    frontend: 'eds-storefront',
                    dependencies: ['eds-commerce-mesh'],
                },
                componentConfigs: {},
            };

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Both frontend and dependencies should be in component definitions
            expect(componentDefinitionIds).toContain('eds-storefront');
            expect(componentDefinitionIds).toContain('eds-commerce-mesh');
        });
    });

    describe('EDS Metadata Population', () => {
        it('should populate EDS metadata after cloning', async () => {
            let savedProjects: any[] = [];

            const edsConfig = {
                projectName: 'test-eds-metadata',
                selectedStack: 'eds-paas',
                edsConfig: {
                    repoName: 'test-repo',
                    repoMode: 'new' as const,
                    repoUrl: 'https://github.com/testuser/test-repo',
                    previewUrl: 'https://main--test-repo--testuser.aem.page',
                    liveUrl: 'https://main--test-repo--testuser.aem.live',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    githubOwner: 'testuser',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate',
                    contentSource: {
                        org: 'source-org',
                        site: 'source-site',
                    },
                },
                components: {
                    frontend: 'eds-storefront',
                    dependencies: [],
                },
                componentConfigs: {},
            };

            mockContext = createMockContext();
            // Capture saved projects to verify metadata
            mockContext.stateManager = {
                getCurrentProject: jest.fn().mockResolvedValue(null),
                saveProject: jest.fn().mockImplementation((project) => {
                    savedProjects.push(JSON.parse(JSON.stringify(project)));
                    return Promise.resolve();
                }),
            } as any;

            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, edsConfig);

            // Find the project save that has metadata populated
            const projectWithMetadata = savedProjects.find(p =>
                p.componentInstances?.['eds-storefront']?.metadata?.liveUrl
            );

            expect(projectWithMetadata).toBeDefined();
            const edsInstance = projectWithMetadata?.componentInstances?.['eds-storefront'];
            expect(edsInstance?.metadata).toMatchObject({
                previewUrl: 'https://main--test-repo--testuser.aem.page',
                liveUrl: 'https://main--test-repo--testuser.aem.live',
                repoUrl: 'https://github.com/testuser/test-repo',
                githubRepo: 'testuser/test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                templateOwner: 'adobe',
                templateRepo: 'aem-boilerplate',
            });
        });
    });

    describe('Non-EDS Stack Behavior', () => {
        it('should use frontendSource for non-EDS stacks', async () => {
            const headlessConfig = {
                projectName: 'test-headless-project',
                selectedStack: 'headless-paas',
                components: {
                    frontend: 'headless',
                    dependencies: [],
                },
                componentConfigs: {},
                frontendSource: {
                    type: 'git',
                    url: 'https://github.com/adobe/citisignal-nextjs',
                    branch: 'main',
                },
            };

            // Override mock to capture component definitions
            const { cloneAllComponents } = await import('@/features/project-creation/services');
            let capturedDefinitions: Map<string, any> | null = null;
            (cloneAllComponents as jest.Mock).mockImplementation(({ componentDefinitions, project }) => {
                capturedDefinitions = componentDefinitions;
                componentDefinitionIds = Array.from(componentDefinitions.keys());
                for (const [id, entry] of componentDefinitions.entries()) {
                    project.componentInstances = project.componentInstances || {};
                    project.componentInstances[id] = {
                        id,
                        name: entry.definition.name,
                        type: entry.definition.type,
                        status: 'installed',
                        path: `${project.path}/components/${id}`,
                        lastUpdated: new Date(),
                    };
                }
                return Promise.resolve();
            });

            mockContext = createMockContext();
            const { executeProjectCreation } = await import(
                '@/features/project-creation/handlers/executor'
            );

            await executeProjectCreation(mockContext as HandlerContext, headlessConfig);

            // Verify the source URL was set from frontendSource
            expect(capturedDefinitions).not.toBeNull();
            const headlessEntry = capturedDefinitions!.get('headless');
            expect(headlessEntry).toBeDefined();
            expect(headlessEntry.definition.source.url).toBe('https://github.com/adobe/citisignal-nextjs');
        });
    });
});
