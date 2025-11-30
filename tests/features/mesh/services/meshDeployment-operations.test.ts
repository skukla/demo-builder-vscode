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
 * MeshDeployment Operations Test Suite
 *
 * Tests successful mesh deployment flows:
 * - Basic deployment success
 * - Command execution
 * - Working directory configuration
 * - Streaming output handling
 *
 * Total tests: 6
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

describe('MeshDeployment - Operations', () => {
    let mockCommandManager: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();

        // Mock waitForMeshDeployment
        setupMeshDeploymentVerifierMock();
    });

    describe('successful deployment', () => {
        it('should deploy mesh successfully', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should call progress callback during deployment', async () => {
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
            expect(onProgress).toHaveBeenCalledWith('Deploying API Mesh...', expect.any(String));
        });

        it('should handle streaming output', async () => {
            mockSuccessfulFileRead();

            const onProgress = jest.fn();

            mockCommandManager.execute.mockImplementation((cmd: string, options: any) => {
                if (options.onOutput) {
                    options.onOutput('Validating mesh configuration...');
                    options.onOutput('Updating mesh infrastructure...');
                    options.onOutput('Success! Mesh deployed.');
                }
                return Promise.resolve({
                    code: 0,
                    stdout: 'Mesh updated successfully',
                });
            });

            mockSuccessfulVerification();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalledWith('Deploying...', 'Validating configuration');
            expect(onProgress).toHaveBeenCalledWith('Deploying...', 'Updating mesh infrastructure');
            expect(onProgress).toHaveBeenCalledWith('Deploying...', 'Mesh updated successfully');
        });

        it('should use update command', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(mockCommandManager.execute).toHaveBeenCalledWith(
                expect.stringContaining('aio api-mesh:update'),
                expect.any(Object)
            );
        });

        it('should set correct working directory', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(mockCommandManager.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    cwd: '/path/to/mesh',
                })
            );
        });

        it('should read mesh configuration from mesh.json', async () => {
            mockSuccessfulFileRead();
            mockSuccessfulDeployment(mockCommandManager);
            mockSuccessfulVerification();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(mockFs.access).toHaveBeenCalledWith(
                '/path/to/mesh/mesh.json'
            );
            expect(mockFs.readFile).toHaveBeenCalledWith(
                '/path/to/mesh/mesh.json',
                'utf-8'
            );
        });
    });
});
