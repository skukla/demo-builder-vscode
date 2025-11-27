import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';
import {
    createMockContext,
    mockAdobeCliPrereq,
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

describe('Prerequisites Continue Handler - Edge Cases', () => {
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

    describe('empty and unusual states', () => {
        it('should handle empty prerequisites list', async () => {
            mockContext.sharedState.currentPrerequisites = [];

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkPrerequisite).not.toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisites-complete',
                expect.objectContaining({ allInstalled: true })
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(optionalResult);

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

    describe('per-node-version edge cases', () => {
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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);
            // Note: Per-node version checking happens inside checkPrerequisite which is mocked,
            // so specific Node version scenarios are tested in integration tests.

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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(adobeResult);
            // Mock the command execution sequence:
            // 1. fnm list (get installed Node versions)
            // 2. aio --version with Node 18 (succeeds)
            // 3. aio --version with Node 20 (fails)
            (mockCommandExecutor.execute as jest.Mock)
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18 check
                .mockRejectedValueOnce(new Error('Command not found')); // Node 20 check

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
    });
});
