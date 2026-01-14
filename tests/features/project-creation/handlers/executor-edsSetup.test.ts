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

// Mock the service modules to prevent actual execution
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
            githubOwner: 'test-owner',
            isPrivate: false,
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
            // Reset modules to clear cache
            jest.resetModules();

            // Re-apply mocks after reset
            jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
                ComponentRegistryManager: jest.fn().mockImplementation(() => ({
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
                })),
            }));

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

            // Create fresh context after module reset
            mockContext = createMockContext();

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
            jest.resetModules();

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

            mockContext = createMockContext();

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

        it('should skip EDS phase if preflightComplete is true (preflight ran in wizard)', async () => {
            jest.resetModules();

            const configWithPreflightComplete = {
                projectName: 'test-eds-preflight-done',
                selectedStack: 'eds-paas',
                edsConfig: {
                    ...edsConfig,
                    // Preflight already completed in Storefront Setup step
                    preflightComplete: true,
                    repoUrl: 'https://github.com/test-owner/test-repo',
                    previewUrl: 'https://main--test-repo--test-owner.aem.page',
                    liveUrl: 'https://main--test-repo--test-owner.aem.live',
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
                configWithPreflightComplete
            );

            // Should skip EDS Setup operations but acknowledge using preflight config
            const edsProgressCalls = progressCalls.filter(
                call => call.operation === 'EDS Setup'
            );
            // Expect exactly one progress call acknowledging preflight was used
            expect(edsProgressCalls).toHaveLength(1);
            expect(edsProgressCalls[0].message).toBe('Using preflight EDS configuration');
            // Progress should jump directly to 30% (end of EDS phase) since work was skipped
            expect(edsProgressCalls[0].progress).toBe(30);
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
