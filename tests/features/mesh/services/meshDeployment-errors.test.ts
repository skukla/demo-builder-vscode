import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import {
    mockFs,
    createMockCommandManager,
    createMockLogger,
    setupMeshDeploymentVerifierMock,
    getMeshDeploymentVerifier,
    mockSuccessfulFileRead,
    VALID_MESH_CONFIG,
} from './meshDeployment.testUtils';

/**
 * MeshDeployment Error Handling Test Suite
 *
 * Tests error scenarios and validation:
 * - Missing mesh.json
 * - Invalid mesh.json format
 * - Command execution failures
 * - Verification failures
 * - Error formatting
 * - Configuration validation
 *
 * Total tests: 10
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

describe('MeshDeployment - Error Handling', () => {
    let mockCommandManager: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = createMockCommandManager();
        mockLogger = createMockLogger();

        // Mock waitForMeshDeployment
        setupMeshDeploymentVerifierMock();
    });

    describe('file system errors', () => {
        it('should handle missing mesh.json', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT: no such file'));

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle invalid mesh.json', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('not json');

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid mesh.json');
        });
    });

    describe('command execution errors', () => {
        it('should handle command failure', async () => {
            mockSuccessfulFileRead();

            mockCommandManager.execute.mockResolvedValue({
                code: 1,
                stderr: 'Deployment failed',
            });

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should format Adobe CLI errors', async () => {
            mockSuccessfulFileRead();

            mockCommandManager.execute.mockResolvedValue({
                code: 1,
                stderr: 'Error: [API_MESH_001] Invalid configuration',
            });

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            // Should have formatted error
            expect(result.error).toBeDefined();
        });

        it('should handle command exception', async () => {
            mockSuccessfulFileRead();

            mockCommandManager.execute.mockRejectedValue(new Error('Network error'));

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('verification errors', () => {
        it('should handle verification failure', async () => {
            mockSuccessfulFileRead();

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated',
            });

            const { waitForMeshDeployment } = getMeshDeploymentVerifier();
            waitForMeshDeployment.mockResolvedValue({
                deployed: false,
                error: 'Verification timeout',
            });

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Verification timeout');
        });
    });

    describe('configuration validation', () => {
        it('should validate mesh.json is valid JSON', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('{ invalid json }');

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid mesh.json');
        });

        it('should require mesh.json to be an object', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('null');

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid mesh.json');
        });

        it('should accept valid mesh.json', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify(VALID_MESH_CONFIG));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = getMeshDeploymentVerifier();
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(true);
        });

        it('should accept empty sources array', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = getMeshDeploymentVerifier();
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

            const result = await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(result.success).toBe(true);
        });
    });
});
