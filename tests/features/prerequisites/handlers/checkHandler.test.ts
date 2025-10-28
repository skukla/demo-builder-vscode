import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import type { HandlerContext } from '@/types/handlers';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';
import * as shared from '@/features/prerequisites/handlers/shared';

/**
 * Prerequisites Check Handler Test Suite
 *
 * Tests the check-prerequisites handler:
 * - Loads config and resolves dependencies
 * - Checks each prerequisite with multi-version Node.js support
 * - Handles timeout errors gracefully
 * - Sends UI updates with proper status
 * - Detects per-node-version prerequisite status
 *
 * Total tests: 22
 */

// Mock shared utilities
jest.mock('@/features/prerequisites/handlers/shared', () => ({
    getNodeVersionMapping: jest.fn(),
    checkPerNodeVersionStatus: jest.fn(),
    areDependenciesInstalled: jest.fn(),
}));

// Mock timeout utilities
jest.mock('@/types/typeGuards', () => ({
    toError: (error: any) => (error instanceof Error ? error : new Error(String(error))),
    isTimeoutError: (error: any) => error?.message?.includes('timeout'),
}));

// Test data
const mockConfig = {
    version: '1.0',
    prerequisites: [
        {
            id: 'node',
            name: 'Node.js',
            description: 'JavaScript runtime',
            check: { command: 'node --version' },
        } as PrerequisiteDefinition,
        {
            id: 'npm',
            name: 'npm',
            description: 'Package manager',
            depends: ['node'],
            check: { command: 'npm --version' },
        } as PrerequisiteDefinition,
    ],
};

const mockNodeResult: PrerequisiteStatus = {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript runtime',
    installed: true,
    version: 'v18.0.0',
    optional: false,
    canInstall: false,
};

const mockNpmResult: PrerequisiteStatus = {
    id: 'npm',
    name: 'npm',
    description: 'Package manager',
    installed: true,
    version: '9.0.0',
    optional: false,
    canInstall: false,
};

// Helper to create mock HandlerContext
function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        prereqManager: {
            loadConfig: jest.fn(),
            resolveDependencies: jest.fn(),
            checkPrerequisite: jest.fn(),
            checkMultipleNodeVersions: jest.fn(),
        } as any,
        authManager: {} as any,
        componentHandler: {} as any,
        errorLogger: {} as any,
        progressUnifier: {} as any,
        stepLogger: {
            log: jest.fn(),
        } as any,
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any,
        debugLogger: {
            debug: jest.fn(),
        } as any,
        context: {} as any,
        panel: undefined,
        stateManager: {} as any,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
            currentPrerequisites: undefined,
            currentPrerequisiteStates: undefined,
            currentComponentSelection: undefined,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}

describe('Prerequisites Check Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
    });

    describe('happy path', () => {
        it('should load prerequisites config and send to UI', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            expect(context.prereqManager.loadConfig).toHaveBeenCalledTimes(1);
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisites-loaded',
                expect.objectContaining({
                    prerequisites: expect.arrayContaining([
                        expect.objectContaining({ name: 'Node.js' }),
                        expect.objectContaining({ name: 'npm' }),
                    ]),
                })
            );
        });

        it('should check all prerequisites in dependency order', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            expect(context.prereqManager.checkPrerequisite).toHaveBeenCalledTimes(2);
            expect(context.prereqManager.checkPrerequisite).toHaveBeenNthCalledWith(
                1,
                mockConfig.prerequisites[0]
            );
            expect(context.prereqManager.checkPrerequisite).toHaveBeenNthCalledWith(
                2,
                mockConfig.prerequisites[1]
            );
        });

        it('should handle all prerequisites installed successfully', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(true);
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({
                    allInstalled: true,
                })
            );
        });

        it('should handle optional prerequisites marked correctly', async () => {
            const optionalConfig = {
                version: '1.0',
                prerequisites: [
                    { ...mockConfig.prerequisites[0], optional: false },
                    { ...mockConfig.prerequisites[1], optional: true },
                ],
            };
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(optionalConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                optionalConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce({ ...mockNpmResult, installed: false });

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    name: 'npm',
                    required: false,
                })
            );
        });

        it('should detect Node multi-version requirements from component selection', async () => {
            const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);
            (context.prereqManager.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: '18', component: 'v18.0.0', installed: true },
                { version: '20', component: 'v20.0.0', installed: true },
            ]);

            await handleCheckPrerequisites(context);

            expect(context.prereqManager.checkMultipleNodeVersions).toHaveBeenCalledWith(
                nodeMapping
            );
        });

        it('should check per-node-version prerequisites (Adobe CLI)', async () => {
            const nodeMapping = { '18': 'commerce-paas' };
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
                perNodeVersionStatus: [{ version: 'Node 18', component: '10.0.0', installed: true }],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });

            const adobeCliPrereq = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as PrerequisiteDefinition;

            const configWithCli = {
                version: '1.0',
                prerequisites: [mockConfig.prerequisites[0], adobeCliPrereq],
            };

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(configWithCli);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                configWithCli.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce({ installed: true, canInstall: false });

            await handleCheckPrerequisites(context);

            expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(
                adobeCliPrereq,
                ['18'],
                context
            );
        });

        it('should send progress updates during checking', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            // Should send checking status for each prerequisite
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'checking',
                    name: 'Node.js',
                })
            );
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'checking',
                    name: 'npm',
                })
            );
        });

        it('should complete with allInstalled=true when all required installed', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({
                    allInstalled: true,
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle prerequisite check timeout errors', async () => {
            const timeoutError = new Error('Operation timeout');
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                [mockConfig.prerequisites[0]]
            );
            (context.prereqManager.checkPrerequisite as jest.Mock).mockRejectedValue(timeoutError);

            await handleCheckPrerequisites(context);

            expect(context.logger.warn).toHaveBeenCalledWith(
                expect.stringMatching(/check timed out/)
            );
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    message: expect.stringMatching(/timed out/),
                })
            );
        });

        it('should handle general check errors and continue', async () => {
            const checkError = new Error('Check failed');
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockRejectedValueOnce(checkError)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            expect(context.logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/Failed to check/),
                checkError
            );
            // Should continue to check npm despite Node.js failure
            expect(context.prereqManager.checkPrerequisite).toHaveBeenCalledTimes(2);
        });

        it('should handle config loading failures', async () => {
            const loadError = new Error('Config not found');
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockRejectedValue(loadError);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(false);
            expect(context.logger.error).toHaveBeenCalledWith(
                'Prerequisites check failed:',
                loadError
            );
            expect(context.sendMessage).toHaveBeenCalledWith(
                'error',
                expect.objectContaining({
                    message: 'Failed to check prerequisites',
                })
            );
        });

        it('should handle dependency resolution failures', async () => {
            const resolveError = new Error('Circular dependency');
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockImplementation(() => {
                throw resolveError;
            });

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(false);
            expect(context.logger.error).toHaveBeenCalledWith(
                'Prerequisites check failed:',
                resolveError
            );
        });

        it('should handle sendMessage failures gracefully', async () => {
            const sendError = new Error('WebView not ready');
            const context = createMockContext();

            // First call (prerequisites-loaded) fails, subsequent calls succeed
            (context.sendMessage as jest.Mock)
                .mockRejectedValueOnce(sendError)
                .mockResolvedValue(undefined);

            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(false);
        });

        it('should handle ComponentRegistryManager failures in node mapping', async () => {
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'nodejs',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: [],
                    },
                },
            });
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle empty prerequisites list', async () => {
            const emptyConfig = { version: '1.0', prerequisites: [] };
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(emptyConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue([]);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(true);
            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({
                    allInstalled: true,
                    prerequisites: [],
                })
            );
        });

        it('should handle prerequisites with no component selection', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(true);
            expect(shared.getNodeVersionMapping).toHaveBeenCalled();
        });

        it('should handle mix of installed and not-installed prerequisites', async () => {
            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce({ installed: false, canInstall: true });

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({
                    allInstalled: false,
                })
            );
        });

        it('should handle Node prerequisite with missing specific versions', async () => {
            const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);

            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);
            (context.prereqManager.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: '18', component: 'v18.0.0', installed: true },
                { version: '20', component: '', installed: false },
            ]);

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    name: 'Node.js',
                    status: 'error',
                })
            );
        });

        it('should handle per-node-version prerequisite with partial installs', async () => {
            const nodeMapping = { '18': 'commerce-paas', '20': 'adobe-app-builder' };
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(nodeMapping);
            (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
            });

            const adobeCliPrereq = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                perNodeVersion: true,
                check: { command: 'aio --version' },
            } as PrerequisiteDefinition;

            const configWithCli = {
                version: '1.0',
                prerequisites: [mockConfig.prerequisites[0], adobeCliPrereq],
            };

            const context = createMockContext({
                sharedState: {
                    isAuthenticating: false,
                    currentComponentSelection: {
                        frontend: 'react-app',
                        backend: 'commerce-paas',
                        dependencies: [],
                        externalSystems: [],
                        appBuilder: ['action'],
                    },
                },
            });
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(configWithCli);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                configWithCli.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce({ installed: true, canInstall: false });

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    name: 'Adobe I/O CLI',
                    status: 'error',
                    installed: false,
                })
            );
        });

        it('should handle prerequisites with unmet dependencies', async () => {
            (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(false);

            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce({ installed: false, canInstall: true });

            await handleCheckPrerequisites(context);

            expect(context.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    name: 'npm',
                    canInstall: false, // Dependencies not met
                })
            );
        });

        it('should store component selection in sharedState', async () => {
            const componentSelection = {
                frontend: 'react-app',
                backend: 'commerce-paas',
                dependencies: [],
                externalSystems: [],
                appBuilder: [],
            };

            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context, { componentSelection });

            expect(context.sharedState.currentComponentSelection).toEqual(componentSelection);
        });

        it('should handle 100ms delay for UI updates', async () => {
            jest.useFakeTimers();
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            const context = createMockContext();
            (context.prereqManager.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            const promise = handleCheckPrerequisites(context);

            // Fast-forward past the 100ms delay
            await jest.advanceTimersByTimeAsync(100);

            await promise;

            // Verify the delay was called with 100ms
            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);

            setTimeoutSpy.mockRestore();
            jest.useRealTimers();
        });
    });
});
