import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import {
    createMockCommandManager,
    setupServiceLocatorMock,
    createErrorStatusResponse,
    createFailedStatusResponse,
    createPendingStatusResponse,
    createDeployedStatusResponse,
    createEndpointTextResponse,
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
        LONG: 180000, // Mesh operations (replaces API_MESH_UPDATE)
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
    },
}));

/**
 * MeshDeploymentVerifier - Error Handling Tests
 *
 * Tests error scenarios and failure handling:
 * - Error status detection
 * - Failed status detection
 * - Timeout after max retries
 * - Command execution error recovery
 *
 * Total tests: 4
 */

describe('MeshDeploymentVerifier - Error Handling', () => {
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

    describe('deployment failures', () => {
        it('should detect error status', async () => {
            mockCommandManager.execute.mockResolvedValueOnce(createErrorStatusResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(false);
            expect(result.error).toContain('failed with error status');
        });

        it('should detect failed status', async () => {
            mockCommandManager.execute.mockResolvedValueOnce(createFailedStatusResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(false);
        });

        it('should timeout after max retries', async () => {
            mockCommandManager.execute.mockResolvedValue(createPendingStatusResponse());

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 3,
            });

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should handle command execution errors gracefully', async () => {
            mockCommandManager.execute
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First attempt (error)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second attempt (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });
    });
});
