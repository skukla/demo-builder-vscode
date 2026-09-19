import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    createMockCommandManager,
    createMockLogger,
    setupMeshDeploymentVerifierMock,
    getMeshDeploymentVerifier,
    mockSuccessfulFileRead,
    mockSuccessfulDeployment,
    mockSuccessfulVerification,
} from './meshDeployment.testUtils';

/**
 * MeshDeployment Progress Reporting Test Suite
 *
 * Tests progress callback functionality:
 * - Reading configuration progress
 * - Deployment start progress
 * - Verification status progress
 * - Completion progress
 * - Multi-phase progress tracking
 *
 * Total tests: 5
 */

// Mock dependencies
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
    },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        LONG: 180000, // Mesh operations (replaces API_MESH_UPDATE)
    },
}));

describe('MeshDeployment - Progress Reporting', () => {
    let mockCommandManager: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();

        // Mock waitForMeshDeployment
        setupMeshDeploymentVerifierMock();
    });

    describe('progress callbacks', () => {
        it('should report reading configuration', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalledWith(OPERATION_STAGES.readingMeshConfig.label);
        });

        it('should report deployment start', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            // Now uses create-first approach (create, then fallback to update if mesh exists)
            expect(onProgress).toHaveBeenCalledWith(OPERATION_STAGES.deployingMesh.label, 'Creating the mesh');
        });

        it('should report verification status', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);

            const { waitForMeshDeployment } = getMeshDeploymentVerifier();
            waitForMeshDeployment.mockImplementation(async (options: any) => {
                if (options.onProgress) {
                    options.onProgress(1, 5, 10);
                }
                return {
                    deployed: true,
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                };
            });

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            // Each poll carries the seconds so far: Adobe says nothing else while
            // it builds, so the count IS the movement (owner, 2026-09-19).
            expect(onProgress).toHaveBeenCalledWith(
                OPERATION_STAGES.verifyingMesh.label,
                expect.stringMatching(/^Waiting for Adobe — \d+s$/),
            );
        });

        it('should report completion', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalledWith(OPERATION_STAGES.verifyingMesh.label, 'Mesh deployed');
        });

        it('should track all progress phases in order', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            const onProgress = jest.fn();
            const progressCalls: Array<[string, string]> = [];

            onProgress.mockImplementation((message: string, detail: string) => {
                progressCalls.push([message, detail]);
            });

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            // Verify progress phases appear in correct order
            const messages = progressCalls.map(([msg]) => msg);
            expect(messages).toContain(OPERATION_STAGES.readingMeshConfig.label);
            expect(messages).toContain(OPERATION_STAGES.deployingMesh.label);
            expect(messages).toContain(OPERATION_STAGES.verifyingMesh.label);

            // Reading should come before deploying
            const readingIndex = messages.indexOf(OPERATION_STAGES.readingMeshConfig.label);
            const deployingIndex = messages.indexOf(OPERATION_STAGES.deployingMesh.label);
            const completeIndex = messages.indexOf(OPERATION_STAGES.verifyingMesh.label);

            expect(readingIndex).toBeLessThan(deployingIndex);
            expect(deployingIndex).toBeLessThan(completeIndex);
        });
    });
});
