import {
    shared,
    setupContinueHandler,
} from './continueHandler.testUtils';
import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { PrerequisiteStatus } from '@/features/prerequisites/services/types';
import {
    mockAdobeCliPrereq,
} from './continueHandler.testUtils';

describe('Prerequisites Continue Handler - Error Handling', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockContext } = setupContinueHandler());
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
