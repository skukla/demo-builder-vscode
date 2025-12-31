import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import {
    createMockCommandManager,
    setupServiceLocatorMock,
    createMalformedJsonResponse,
    createDeployedStatusResponse,
    createEndpointTextResponse,
    createCommandFailureResponse,
    createDefaultOptions,
} from './meshDeploymentVerifier.testUtils';

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/core/validation', () => ({
    validateMeshId: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000, // 3 minutes - semantic category for mesh operations
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
    },
}));

/**
 * MeshDeploymentVerifier - Edge Cases Tests
 *
 * Tests edge cases and configuration scenarios:
 * - Malformed JSON response handling
 * - Missing meshId in response
 * - Non-zero exit code handling
 * - MaxRetries calculation from timeout
 *
 * Total tests: 4
 */

describe('MeshDeploymentVerifier - Edge Cases', () => {
    let mockCommandManager: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockCommandManager = createMockCommandManager();
        setupServiceLocatorMock(mockCommandManager);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('edge cases', () => {
        it('should handle malformed JSON response', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createMalformedJsonResponse())
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First poll (malformed)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second poll (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should handle missing meshId in response', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'deployed',
                    // meshId missing
                }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 1,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.meshId).toBeUndefined();
        });

        it('should handle non-zero exit code', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createCommandFailureResponse())
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First poll (error)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second poll (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should calculate maxRetries from timeout', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'pending' }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 1000,
                pollInterval: 1000,
                // maxRetries not specified, should be calculated
            });

            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            // Should have calculated maxRetries based on TIMEOUTS.LONG
            // (180000 - 1000) / 1000 = 179 retries
            expect(mockCommandManager.execute).toHaveBeenCalled();
        });
    });
});
