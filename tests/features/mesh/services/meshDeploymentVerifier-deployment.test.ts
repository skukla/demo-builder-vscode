import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import {
    createMockCommandManager,
    setupServiceLocatorMock,
    createDeployedStatusResponse,
    createSuccessStatusResponse,
    createEndpointTextResponse,
    createEndpointJsonResponse,
    createDescribeFailureResponse,
    createDefaultOptions,
    advanceTimersAndResolve,
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
});
