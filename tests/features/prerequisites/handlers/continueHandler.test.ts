import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';

// Mock all dependencies
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di');

describe('Prerequisites Continue Handler', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockNodeManager: any;
    let mockCommandExecutor: any;

    // Mock prerequisite definitions
    const mockNodePrereq: PrerequisiteDefinition = {
        id: 'node',
        name: 'Node.js',
        description: 'JavaScript runtime',
        check: { command: 'node --version' },
    } as any;

    const mockNpmPrereq: PrerequisiteDefinition = {
        id: 'npm',
        name: 'npm',
        description: 'Package manager',
        depends: ['node'],
        check: { command: 'npm --version' },
    } as any;

    const mockAdobeCliPrereq: PrerequisiteDefinition = {
        id: 'adobe-cli',
        name: 'Adobe I/O CLI',
        description: 'Adobe I/O command-line tool',
        perNodeVersion: true,
        check: { command: 'aio --version', parseVersion: '@adobe/aio-cli/(\\S+)' },
    } as any;

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

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock NodeVersionManager
        mockNodeManager = {
            list: jest.fn().mockResolvedValue(['v18.0.0', 'v20.0.0']),
        };
        (ServiceLocator.getNodeVersionManager as jest.Mock).mockReturnValue(mockNodeManager);

        // Mock CommandExecutor
        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({ stdout: '@adobe/aio-cli/10.0.0' }),
        };
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Mock shared utilities
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({
            '18': 'React App',
            '20': 'Node Backend',
        });
        (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);

        // Create mock context
        mockContext = createMockContext();
    });

    // Helper to create mock HandlerContext
    function createMockContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        states.set(1, { prereq: mockNpmPrereq, result: mockNpmResult });

        return {
            prereqManager: {
                checkPrerequisite: jest.fn().mockResolvedValue(mockNodeResult),
                checkMultipleNodeVersions: jest.fn().mockResolvedValue([
                    { version: 'Node 18', component: 'v18.0.0', installed: true },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ]),
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            } as any,
            debugLogger: {
                debug: jest.fn(),
            } as any,
            stepLogger: {
                log: jest.fn(),
            } as any,
            sharedState: {
                currentPrerequisites: [mockNodePrereq, mockNpmPrereq],
                currentPrerequisiteStates: states,
            },
            ...overrides,
        } as jest.Mocked<HandlerContext>;
    }

    describe('happy path', () => {
        it('should re-check prerequisites from index 0', async () => {
            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager.checkPrerequisite).toHaveBeenCalledTimes(2);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
            );
        });

        it('should re-check from specific index', async () => {
            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager.checkPrerequisite).toHaveBeenCalledTimes(1);
            expect(mockContext.prereqManager.checkPrerequisite).toHaveBeenCalledWith(mockNpmPrereq);
        });

        it('should re-check Node.js with multi-version mapping', async () => {
            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 0 });

            expect(result.success).toBe(true);
            expect(shared.getNodeVersionMapping).toHaveBeenCalled();
            expect(mockContext.prereqManager.checkMultipleNodeVersions).toHaveBeenCalledWith({
                '18': 'React App',
                '20': 'Node Backend',
            });
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    index: 0,
                    name: 'Node.js',
                    status: 'success',
                    nodeVersionStatus: expect.arrayContaining([
                        expect.objectContaining({ version: 'Node 18', installed: true }),
                        expect.objectContaining({ version: 'Node 20', installed: true }),
                    ]),
                })
            );
        });

        it('should re-check per-node-version prerequisite when installed', async () => {
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: true,
                version: '10.0.0',
                optional: false,
                canInstall: true,
            };
            states.set(0, { prereq: mockAdobeCliPrereq, result: adobeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockAdobeCliPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockNodeManager.list).toHaveBeenCalled();
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio --version',
                expect.objectContaining({ useNodeVersion: '18' })
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio --version',
                expect.objectContaining({ useNodeVersion: '20' })
            );
        });

        it('should re-check per-node-version prerequisite when not installed', async () => {
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: false,
                optional: false,
                canInstall: true,
            };
            states.set(0, { prereq: mockAdobeCliPrereq, result: adobeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockAdobeCliPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            // Should not check per-node versions when main tool not installed
            expect(mockNodeManager.list).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    installed: false,
                    status: 'error',
                })
            );
        });

        it('should apply dependency gating', async () => {
            (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(false);

            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(result.success).toBe(true);
            expect(shared.areDependenciesInstalled).toHaveBeenCalledWith(mockNpmPrereq, mockContext);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    index: 1,
                    canInstall: false, // Dependencies not installed
                })
            );
        });

        it('should complete with allRequiredInstalled=true when all installed', async () => {
            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
            );
        });
    });

    describe('error handling', () => {
        it('should return false when currentPrerequisites missing', async () => {
            mockContext.sharedState.currentPrerequisites = undefined;

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.prereqManager.checkPrerequisite).not.toHaveBeenCalled();
        });

        it('should return false when currentPrerequisiteStates missing', async () => {
            mockContext.sharedState.currentPrerequisiteStates = undefined;

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.prereqManager.checkPrerequisite).not.toHaveBeenCalled();
        });

        it('should handle prerequisite check timeout errors', async () => {
            const timeoutError: any = new Error('Timeout after 10000ms');
            timeoutError.isTimeout = true;
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockRejectedValueOnce(timeoutError);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true); // Continue checking other prerequisites
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('timed out')
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    message: expect.stringContaining('timed out'),
                })
            );
        });

        it('should handle prerequisite check general errors', async () => {
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockRejectedValueOnce(
                new Error('Check failed')
            );

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true); // Continue checking other prerequisites
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to re-check'),
                expect.any(Error)
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    message: 'Failed to check: Check failed',
                })
            );
        });

        it('should handle NodeManager.list() failures for per-node check', async () => {
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: true,
                version: '10.0.0',
                optional: false,
                canInstall: true,
            };
            states.set(0, { prereq: mockAdobeCliPrereq, result: adobeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockAdobeCliPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);
            (mockNodeManager.list as jest.Mock).mockRejectedValue(new Error('List failed'));

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to continue prerequisites'),
                expect.any(Error)
            );
        });

        it('should handle top-level errors', async () => {
            // Throw from getNodeVersionMapping which is called before the loop
            (shared.getNodeVersionMapping as jest.Mock).mockRejectedValue(
                new Error('Critical failure')
            );

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to continue prerequisites'),
                expect.any(Error)
            );
        });
    });

    describe('edge cases', () => {
        it('should default fromIndex to 0 when not specified', async () => {
            const result = await handleContinuePrerequisites(mockContext, {});

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager.checkPrerequisite).toHaveBeenCalledTimes(2);
        });

        it('should handle empty prerequisites list', async () => {
            mockContext.sharedState.currentPrerequisites = [];

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager.checkPrerequisite).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
            );
        });

        it('should handle per-node prerequisite with Node version not installed', async () => {
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: true,
                version: '10.0.0',
                optional: false,
                canInstall: true,
            };
            states.set(0, { prereq: mockAdobeCliPrereq, result: adobeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockAdobeCliPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);
            (mockNodeManager.list as jest.Mock).mockResolvedValue(['v18.0.0']); // Only Node 18 installed

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                    message: expect.stringContaining('missing in Node'),
                })
            );
        });

        it('should handle per-node prerequisite partially installed', async () => {
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: true,
                version: '10.0.0',
                optional: false,
                canInstall: true,
            };
            states.set(0, { prereq: mockAdobeCliPrereq, result: adobeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockAdobeCliPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);
            // Node 18 has CLI, Node 20 doesn't
            (mockCommandExecutor.execute as jest.Mock)
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0' })
                .mockRejectedValueOnce(new Error('Command not found'));

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                    message: expect.stringContaining('missing in Node 20'),
                })
            );
        });

        it('should handle Node.js with some versions missing', async () => {
            (mockContext.prereqManager.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ]);

            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 0 });

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    index: 0,
                    name: 'Node.js',
                    status: 'error', // At least one version missing
                    canInstall: true,
                })
            );
        });

        it('should handle all optional prerequisites', async () => {
            const optionalPrereq: PrerequisiteDefinition = {
                id: 'docker',
                name: 'Docker',
                description: 'Container platform',
                optional: true,
                check: { command: 'docker --version' },
            } as any;
            const optionalResult: PrerequisiteStatus = {
                id: 'docker',
                name: 'Docker',
                description: 'Container platform',
                installed: false,
                optional: true,
                canInstall: true,
            };
            const states = new Map();
            states.set(0, { prereq: optionalPrereq, result: optionalResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [optionalPrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager.checkPrerequisite as jest.Mock).mockResolvedValue(optionalResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true }) // All required installed (none required)
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'warning', // Optional prerequisite not installed
                })
            );
        });
    });
});
