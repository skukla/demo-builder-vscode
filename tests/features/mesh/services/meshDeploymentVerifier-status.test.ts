import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import {
    createMockCommandManager,
    setupServiceLocatorMock,
    createPendingStatusResponse,
    createBuildingStatusResponse,
    createDeployedStatusResponse,
    createEndpointTextResponse,
    createDefaultOptions,
    createMockLogger,
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
        API_MESH_UPDATE: 180000, // 3 minutes
    },
}));

/**
 * MeshDeploymentVerifier - Status Checking and Polling Tests
 *
 * Tests deployment status polling behavior:
 * - Polling until deployed status
 * - Poll interval timing
 * - Progress callbacks
 * - Default poll interval
 * - Logger integration
 *
 * Total tests: 5
 */

describe('MeshDeploymentVerifier - Status and Polling', () => {
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

    describe('polling behavior', () => {
        it('should poll until deployed status', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createPendingStatusResponse())
                .mockResolvedValueOnce(createBuildingStatusResponse())
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(4);
        });

        it('should wait between poll attempts', async () => {
            mockCommandManager.execute.mockResolvedValue(createPendingStatusResponse());

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 500,
                maxRetries: 2,
            });

            // Advance through initial wait
            await jest.advanceTimersByTimeAsync(100);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(1);

            // Advance through poll interval
            await jest.advanceTimersByTimeAsync(500);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(2);

            // Complete any remaining timers
            await jest.runAllTimersAsync();
            await promise;
        });

        it('should call progress callback with elapsed time', async () => {
            mockCommandManager.execute.mockResolvedValue(createPendingStatusResponse());

            const onProgress = jest.fn();

            const promise = waitForMeshDeployment({
                initialWait: 1000,
                pollInterval: 500,
                maxRetries: 3,
                onProgress,
            });

            jest.advanceTimersByTime(1000); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(500); // First poll
            await Promise.resolve();

            expect(onProgress).toHaveBeenCalledWith(1, 3, 1); // 1 second elapsed

            jest.advanceTimersByTime(500); // Second poll
            await Promise.resolve();

            expect(onProgress).toHaveBeenCalledWith(2, 3, 1); // 1.5 seconds elapsed (rounded to 1)
        });
    });

    describe('configuration options', () => {
        it('should use default poll interval', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment({
                maxRetries: 1,
            });

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should use provided logger', async () => {
            const mockLogger = createMockLogger();

            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 1,
                logger: mockLogger as any,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            await promise;

            expect(mockLogger.info).toHaveBeenCalled();
        });
    });
});
