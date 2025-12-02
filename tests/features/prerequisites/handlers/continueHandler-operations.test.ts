import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { PrerequisiteStatus } from '@/features/prerequisites/services/types';
import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';
import {
    createMockContext,
    mockNodePrereq,
    mockNpmPrereq,
    mockAdobeCliPrereq,
    mockNodeResult,
} from './continueHandler.testUtils';

// Mock dependencies - but keep handlePrerequisiteCheckError real
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
        // Keep handlePrerequisiteCheckError as the real implementation
    };
});
jest.mock('@/core/di');

describe('Prerequisites Continue Handler - Operations', () => {
    let mockContext: any;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

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
        // Object utility helpers (used for Object.keys patterns)
        (shared.hasNodeVersions as jest.Mock).mockImplementation((mapping: Record<string, string>) => {
            return mapping && Object.keys(mapping).length > 0;
        });
        (shared.getNodeVersionKeys as jest.Mock).mockImplementation((mapping: Record<string, string>) => {
            return Object.keys(mapping || {}).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        });

        // Create mock context
        mockContext = createMockContext();
    });

    describe('basic operations', () => {
        it('should re-check prerequisites from index 0', async () => {
            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalledTimes(2);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
            );
        });

        it('should re-check from specific index', async () => {
            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalledTimes(1);
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalledWith(mockNpmPrereq);
        });

        it('should default fromIndex to 0 when not specified', async () => {
            const result = await handleContinuePrerequisites(mockContext, {});

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalledTimes(2);
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

    describe('Node.js multi-version support', () => {
        it('should re-check Node.js with multi-version mapping', async () => {
            const result = await handleContinuePrerequisites(mockContext, { fromIndex: 0 });

            expect(result.success).toBe(true);
            expect(shared.getNodeVersionMapping).toHaveBeenCalled();
            expect(mockContext.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledWith({
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

        it('should allow continuation when Node versions installed', async () => {
            const states = new Map();
            const nodeResult: PrerequisiteStatus = {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                installed: true,
                version: 'v18.0.0',
                optional: false,
                canInstall: false,
            };
            states.set(0, { prereq: mockNodePrereq, result: nodeResult });
            mockContext.sharedState = {
                isAuthenticating: false,
                currentPrerequisites: [mockNodePrereq],
                currentPrerequisiteStates: states,
            };
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(nodeResult);
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
            );
        });

        it('should handle Node.js with some versions missing', async () => {
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
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
    });

    describe('per-node-version prerequisites', () => {
        it('should execute fnm list with shell option', async () => {
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list with shell
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18 check
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }); // Node 20 check

            (mockCommandExecutor.execute as jest.Mock) = mockExecute;

            await handleContinuePrerequisites(mockContext);

            // Verify fnm list was called with shell option
            expect(mockExecute).toHaveBeenCalledWith('fnm list', expect.objectContaining({
                shell: expect.any(String), // Expects shell path (e.g., '/bin/bash')
                timeout: expect.any(Number),
            }));
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            // Note: Per-node version checking happens inside checkPrerequisite which is mocked,
            // so we can't verify fnm list calls here. The behavior is tested in integration tests.
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            // Note: Per-node version checking happens inside checkPrerequisite which is mocked,
            // so we can't verify fnm list calls here. The behavior is tested in integration tests.
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    installed: false,
                    status: 'error',
                })
            );
        });

        it('should mark tool as NOT installed when command returns non-zero exit code', async () => {
            // This test verifies the fix for: "Adobe IO CLI shows success overall but failures for each node version"
            // The bug was that continueHandler only checked for thrown exceptions, not exit codes.
            // Commands like "aio --version" return exit code 127 when not found, but don't throw.
            const states = new Map();
            const adobeResult: PrerequisiteStatus = {
                id: 'adobe-cli',
                name: 'Adobe I/O CLI',
                description: 'Adobe I/O CLI',
                installed: true, // Main check shows installed (for Node 18)
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);

            // Mock fnm list to return two Node versions
            // Mock aio check: Node 18 = installed (code: 0), Node 20 = NOT installed (code: 127)
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18: installed
                .mockResolvedValueOnce({ stdout: '', stderr: 'command not found: aio', code: 127, duration: 100 }); // Node 20: NOT installed (exit code 127)

            (mockCommandExecutor.execute as jest.Mock) = mockExecute;

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);

            // Verify the status sent to UI correctly shows Node 20 as NOT installed
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    name: 'Adobe I/O CLI',
                    status: 'error', // Should be error because Node 20 is missing
                    installed: false, // Should be false because perNodeVariantMissing
                    nodeVersionStatus: expect.arrayContaining([
                        expect.objectContaining({ version: 'Node 18', installed: true }),
                        expect.objectContaining({ version: 'Node 20', installed: false }), // NOT installed due to exit code 127
                    ]),
                })
            );
        });
    });

    describe('dependency gating', () => {
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
    });
});
