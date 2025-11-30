import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { PrerequisiteStatus } from '@/features/prerequisites/services/types';
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

describe('Prerequisites Continue Handler - Error Handling', () => {
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

    describe('missing state validation', () => {
        it('should return false when currentPrerequisites missing', async () => {
            mockContext.sharedState.currentPrerequisites = undefined;

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.prereqManager!.checkPrerequisite).not.toHaveBeenCalled();
        });

        it('should return false when currentPrerequisiteStates missing', async () => {
            mockContext.sharedState.currentPrerequisiteStates = undefined;

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.prereqManager!.checkPrerequisite).not.toHaveBeenCalled();
        });
    });

    describe('prerequisite check errors', () => {
        it('should handle prerequisite check timeout errors', async () => {
            const timeoutError: any = new Error('Timeout after 10000ms');
            timeoutError.isTimeout = true;
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValueOnce(timeoutError);

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
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValueOnce(
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

        it('should handle checkPrerequisite failures and continue', async () => {
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
            // Simulate checkPrerequisite throwing an error
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(new Error('Check failed'));

            const result = await handleContinuePrerequisites(mockContext);

            // Handler continues after individual prerequisite errors (by design)
            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to re-check'),
                expect.any(Error)
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith(
                'prerequisite-status',
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                })
            );
        });
    });

    describe('top-level errors', () => {
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
});
