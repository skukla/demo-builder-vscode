import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
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
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/core/validation/validators/AdobeResourceValidator', () => ({
    validateMeshId: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000, // 3 minutes - semantic category for mesh operations
        NORMAL: 30000,
        POLL: {
            INITIAL: 500,
            MAX: 5000,
            INTERVAL: 1000,
            PROCESS_CHECK: 100,
        },
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
                ...createDefaultOptions(),
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

            const _promise = waitForMeshDeployment({
                ...createDefaultOptions(),
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
                ...createDefaultOptions(),
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
                ...createDefaultOptions(),
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 1,
                logger: mockLogger,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            await promise;

            expect(mockLogger.info).toHaveBeenCalled();
        });
    });
    // The options the poll command carries are not decoration: telemetry
    // configuration derails the CLI, the node version has to be the one the mesh
    // was built for, and both PATH enhancement and a shell are what make `aio`
    // resolvable at all.
    describe('the poll command itself', () => {
        it('runs `aio api-mesh get` with the exact options the CLI needs', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 1 });

            await jest.runAllTimersAsync();
            await promise;

            expect(mockCommandManager.execute).toHaveBeenNthCalledWith(1, 'aio api-mesh get', {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
                shell: true,
            });
        });

        // A non-zero exit means the CLI did not answer the question, whatever it
        // printed. Reading that output would report a deployment on the strength
        // of a failed command.
        it('ignores the output of a poll that exited non-zero, even when it looks deployed', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 1,
                stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
                stderr: 'boom',
                duration: 0,
            });

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 2 });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.deployed).toBe(false);
            expect(result.error).toContain('timed out');
        });
    });

    // With no maxRetries the loop sizes itself from the configured mesh timeout,
    // and the elapsed time it reports has to be the time that actually passed.
    describe('deriving maxRetries from the timeout', () => {
        it('polls (LONG - initialWait) / pollInterval times and reports real elapsed seconds', async () => {
            mockCommandManager.execute.mockResolvedValue(createPendingStatusResponse());
            const onProgress = jest.fn();

            const promise = waitForMeshDeployment({
                ...createDefaultOptions(),
                initialWait: 1000,
                pollInterval: 1000,
                maxRetries: undefined,
                onProgress,
            });

            await jest.advanceTimersByTimeAsync(1000);
            // (180000 - 1000) / 1000
            expect(onProgress).toHaveBeenNthCalledWith(1, 1, 179, 1);

            await jest.advanceTimersByTimeAsync(2000);
            expect(onProgress).toHaveBeenNthCalledWith(3, 3, 179, 3);

            await jest.runAllTimersAsync();
            await promise;
        });
    });
});
