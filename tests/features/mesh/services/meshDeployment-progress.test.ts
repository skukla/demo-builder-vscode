import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    mockFs,
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
        API_MESH_UPDATE: 180000,
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

            expect(onProgress).toHaveBeenCalledWith('Reading mesh configuration...', '');
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
            expect(onProgress).toHaveBeenCalledWith('Deploying API Mesh...', 'Creating mesh');
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

            expect(onProgress).toHaveBeenCalledWith('Verifying deployment...', 'Checking deployment status...');
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

            expect(onProgress).toHaveBeenCalledWith('✓ Deployment Complete', 'Mesh deployed successfully');
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
            expect(messages).toContain('Reading mesh configuration...');
            expect(messages).toContain('Deploying API Mesh...');
            expect(messages).toContain('✓ Deployment Complete');

            // Reading should come before deploying
            const readingIndex = messages.indexOf('Reading mesh configuration...');
            const deployingIndex = messages.indexOf('Deploying API Mesh...');
            const completeIndex = messages.indexOf('✓ Deployment Complete');

            expect(readingIndex).toBeLessThan(deployingIndex);
            expect(deployingIndex).toBeLessThan(completeIndex);
        });
    });
});
