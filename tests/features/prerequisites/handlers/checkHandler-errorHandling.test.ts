import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockConfig,
    mockNodeResult,
    mockNpmResult,
    createMockContext,
    createComponentSelection,
    setupStandardMocks,
    cleanupTests,
} from './checkHandler.testUtils';

/**
 * Prerequisites Check Handler - Error Handling & Edge Cases
 *
 * Tests error handling and edge cases:
 * - Timeout errors
 * - General check errors
 * - Config loading failures
 * - Dependency resolution failures
 * - SendMessage failures
 * - Empty prerequisites
 * - Unmet dependencies
 * - Component selection storage
 * - UI update delays
 *
 * Total tests: 11
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

describe('Prerequisites Check Handler - Error Handling & Edge Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupStandardMocks();
    });

    afterEach(() => {
        cleanupTests();
    });

    describe('error handling', () => {
        it('should handle prerequisite check timeout errors', async () => {
            const timeoutError = new Error('Operation timeout');
            const context = createMockContext();
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                [mockConfig.prerequisites[0]]
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(timeoutError);

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
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
                .mockRejectedValueOnce(checkError)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context);

            expect(context.logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/Failed to check/),
                checkError
            );
            // Should continue to check npm despite Node.js failure
            expect(context.prereqManager!.checkPrerequisite).toHaveBeenCalledTimes(2);
        });

        it('should handle config loading failures', async () => {
            const loadError = new Error('Config not found');
            const context = createMockContext();
            (context.prereqManager!.loadConfig as jest.Mock).mockRejectedValue(loadError);

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
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockImplementation(() => {
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

            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
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
                    currentComponentSelection: createComponentSelection('nodejs'),
                },
            });
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
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
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(emptyConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

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
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            const result = await handleCheckPrerequisites(context);

            expect(result.success).toBe(true);
            expect(shared.getNodeVersionMapping).toHaveBeenCalled();
        });

        it('should handle prerequisites with unmet dependencies', async () => {
            (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(false);

            const context = createMockContext();
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
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
            const componentSelection = createComponentSelection('commerce-paas');

            const context = createMockContext();
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
                .mockResolvedValueOnce(mockNodeResult)
                .mockResolvedValueOnce(mockNpmResult);

            await handleCheckPrerequisites(context, { componentSelection });

            expect(context.sharedState.currentComponentSelection).toEqual(componentSelection);
        });

        it('should handle 100ms delay for UI updates', async () => {
            jest.useFakeTimers();
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            const context = createMockContext();
            (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(mockConfig);
            (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(
                mockConfig.prerequisites
            );
            (context.prereqManager!.checkPrerequisite as jest.Mock)
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
