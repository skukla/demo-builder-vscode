/**
 * Install Handler Tests - Error Handling
 *
 * Tests error scenarios including:
 * - Prerequisite state not found
 * - No installation steps defined
 * - Installation step execution failures
 * - Post-installation verification timeout
 * - Post-installation verification general error
 * - Node version check failures
 * - Per-node prerequisite check failures
 * - fnm list failures
 * - sendMessage failures
 * - Complete error with error logging
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di/serviceLocator');

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockNodePrereq,
    mockAdobeCliPrereq,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Error Handling', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();
    });

    it('should throw error when prerequisite state not found', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 99 });

        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                index: 99,
                status: 'error',
            })
        );
    });

    it('should throw error when no installation steps defined', async () => {
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(null);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'error',
                message: 'No installation steps defined for npm',
            })
        );
    });

    it('should handle installation step execution failures', async () => {
        (mockContext.progressUnifier!.executeStep as jest.Mock).mockRejectedValue(
            new Error('Command execution failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle post-installation verification timeout', async () => {
        const timeoutError: any = new Error('Timeout after 10000ms');
        timeoutError.isTimeout = true;
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(timeoutError);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true); // Installation steps completed
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: expect.stringContaining('verification timed out'),
            })
        );
    });

    it('should handle post-installation verification general error', async () => {
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(
            new Error('Verification failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true); // Installation steps completed
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: expect.stringContaining('verification failed'),
            })
        );
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    /**
     * Verification that THROWS is a warning — the install ran, we just could not confirm
     * it. Verification that returns NOTHING is different: there is no result to report,
     * so the handler cannot say installed or not-installed and must fail outright rather
     * than push a status built from an absent result. No test covered it; five mutants
     * sat on the branch with no coverage at all.
     */
    it('fails outright when verification returns no result at all', async () => {
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(undefined);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result).toEqual(
            expect.objectContaining({ success: false, error: 'Installation verification failed' })
        );
        // And it must NOT report a status built from a result it does not have.
        expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({ installed: true })
        );
    });

    it('should handle Node version check failures during multi-version', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockRejectedValue(
            new Error('Node check failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle per-node prerequisite check failures', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        // Note: Per-node checking happens inside checkPrerequisite which is mocked

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Should continue with installation even if check fails
        expect(result.success).toBe(true);
    });

    it('should handle fnm list failures', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        // Mock getRequiredNodeVersions to throw error (simulates fnm list failure internally)
        (shared.getRequiredNodeVersions as jest.Mock).mockRejectedValue(new Error('List failed'));

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle sendMessage failures gracefully', async () => {
        (mockContext.sendMessage as jest.Mock)
            .mockRejectedValueOnce(new Error('WebView not ready'))
            .mockResolvedValue(undefined);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
    });

    it('should handle complete error with error logging', async () => {
        const criticalError = new Error('Critical installation failure');
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation(() => {
            throw criticalError;
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install prerequisite'),
            criticalError
        );
        expect(mockContext.errorLogger!.logError).toHaveBeenCalledWith(
            criticalError,
            'Prerequisite Installation',
            true
        );
    });

    /**
     * The message an UNRESOLVED install target produces.
     *
     * `describeUnresolvedTarget` has three branches and its own docstring says why —
     * "the two addresses fail for unrelated reasons". Mutation testing found all three
     * unconstrained: every string could be rewritten and both conditions flipped with
     * this suite green, because the existing tests assert `status: 'error'` and never
     * read the message.
     *
     * The message is not decoration. Two of the three tell an AGENT what to do next
     * ("Run check_prerequisites and use a prereqId it reports"), and it is the only
     * thing the caller gets — the throw is what pushes `prerequisite-status`, so a
     * wrong message is the whole diagnosis.
     *
     * Each asserts the WHOLE string. A partial match would survive a mutation that
     * dropped the id or the index, which is the part carrying the information.
     */
    describe('the unresolved-target message', () => {
        /** The `message` of the last `prerequisite-status` the handler pushed. */
        function lastStatusMessage(): string | undefined {
            const calls = (mockContext.sendMessage as jest.Mock).mock.calls.filter(
                ([type]: [string]) => type === 'prerequisite-status'
            );
            return calls.at(-1)?.[1]?.message;
        }

        it('names the id when a prerequisiteId resolves to nothing', async () => {
            (mockContext.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({
                prerequisites: [],
            });
            (mockContext.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

            const result = await handleInstallPrerequisite(mockContext, {
                prerequisiteId: 'no-such-tool',
            });

            expect(result.success).toBe(false);
            expect(lastStatusMessage()).toBe(
                'No prerequisite with id "no-such-tool". Run check_prerequisites and use a prereqId it reports.'
            );
        });

        it('names the INDEX when a numeric prereqId has no state', async () => {
            // Distinct from the case above on purpose: the two addresses fail for
            // unrelated reasons, and telling the caller which one they used is the
            // entire job of this function.
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 99 });

            expect(result.success).toBe(false);
            expect(lastStatusMessage()).toBe(
                'Prerequisite state not found for index 99. Run the prerequisites check first, or address it by prerequisiteId.'
            );
        });

        it('asks for either address when the payload carries neither', async () => {
            const result = await handleInstallPrerequisite(mockContext, {});

            expect(result.success).toBe(false);
            expect(lastStatusMessage()).toBe(
                'Either prerequisiteId (preferred) or prereqId is required.'
            );
        });

        it('prefers the prerequisiteId message when BOTH are present and neither resolves', async () => {
            // The order of the two branches is load-bearing: `prerequisiteId` is the
            // preferred address, so its failure is the one worth reporting. A flipped
            // condition would report the index instead and send the caller to the
            // wrong fix.
            (mockContext.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({
                prerequisites: [],
            });
            (mockContext.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

            const result = await handleInstallPrerequisite(mockContext, {
                prerequisiteId: 'no-such-tool',
                prereqId: 99,
            });

            expect(result.success).toBe(false);
            expect(lastStatusMessage()).toContain('No prerequisite with id "no-such-tool"');
        });
    });

});
