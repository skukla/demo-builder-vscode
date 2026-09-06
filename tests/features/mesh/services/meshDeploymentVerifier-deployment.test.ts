import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import { getMeshNodeVersion } from '@/core/utils/meshConfig';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    createMockCommandManager,
    setupServiceLocatorMock,
    createDeployedStatusResponse,
    createSuccessStatusResponse,
    createEndpointTextResponse,
    createEndpointJsonResponse,
    createDescribeFailureResponse,
    createDefaultOptions,
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
        LONG: 180000, // Mesh operations (replaces API_MESH_UPDATE)
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
 * MeshDeploymentVerifier - Deployment Verification Tests
 *
 * Tests successful deployment verification scenarios:
 * - Deployed status detection
 * - Success status detection
 * - Endpoint retrieval from describe command
 * - Endpoint extraction from JSON
 * - Fallback endpoint construction
 *
 * Total tests: 5
 */

describe('MeshDeploymentVerifier - Deployment Verification', () => {
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

    describe('successful deployment verification', () => {
        it('should verify deployment when status is deployed', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.meshId).toBe('mesh123');
        });

        it('should verify deployment when status is success', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createSuccessStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should retrieve endpoint using describe command', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse('https://example.com/graphql'));

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.endpoint).toBe('https://example.com/graphql');
        });

        it('should extract endpoint from JSON response', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointJsonResponse('https://example.com/graphql'));

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.endpoint).toBe('https://example.com/graphql');
        });

        it('should fallback to constructed endpoint if describe fails', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createDescribeFailureResponse());

            const promise = waitForMeshDeployment(createDefaultOptions());

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.endpoint).toBe('https://graph.adobe.io/api/mesh123/graphql');
        });
    });
    // Asking Adobe for the endpoint is a second CLI call with its own options,
    // and a decision about when it is worth making at all.
    describe('retrieving the endpoint', () => {
        it('runs `aio api-mesh:describe` with the exact options the CLI needs', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce(createEndpointTextResponse());

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 1 });

            await jest.runAllTimersAsync();
            await promise;

            expect(mockCommandManager.execute).toHaveBeenNthCalledWith(2, 'aio api-mesh:describe', {
                timeout: TIMEOUTS.NORMAL,
                configureTelemetry: false,
                useNodeVersion: getMeshNodeVersion(),
                enhancePath: true,
            });
        });

        // describe is addressed by mesh id. With no id there is nothing to ask
        // about, so the call is not made at all.
        it('does not run describe when the deployed response carries no meshId', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'deployed' }),
                stderr: '',
                duration: 0,
            });

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 1 });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result).toStrictEqual({ deployed: true, meshId: undefined, endpoint: undefined });
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(1);
        });

        // A non-zero describe did not answer the question, so its output is not
        // an endpoint however much it looks like one.
        it('ignores the output of a describe that exited non-zero', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce({
                    code: 1,
                    stdout: 'endpoint: https://not-the-answer.test/graphql',
                    stderr: 'boom',
                    duration: 0,
                });

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 1 });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.endpoint).toBe('https://graph.adobe.io/api/mesh123/graphql');
        });

        it('falls back to the constructed endpoint when describe returns JSON without one', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce(createDeployedStatusResponse())
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshId: 'mesh123' }),
                    stderr: '',
                    duration: 0,
                });

            const promise = waitForMeshDeployment({ ...createDefaultOptions(), maxRetries: 1 });

            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result.endpoint).toBe('https://graph.adobe.io/api/mesh123/graphql');
        });
    });
});
