import { deployMeshComponent } from '@/features/mesh/services/meshDeployment';
import { promises as fsPromises } from 'fs';

/**
 * MeshDeployment Test Suite
 *
 * Tests mesh deployment orchestration:
 * - Mesh configuration reading
 * - Deployment command execution
 * - Progress callbacks
 * - Verification integration
 * - Error handling and formatting
 *
 * Total tests: 18
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

describe('MeshDeployment', () => {
    let mockCommandManager: any;
    let mockLogger: any;
    const mockFs = fsPromises as jest.Mocked<typeof fsPromises>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = {
            execute: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        // Mock waitForMeshDeployment
        jest.mock('@/features/mesh/services/meshDeploymentVerifier', () => ({
            waitForMeshDeployment: jest.fn(),
        }));
    });

    describe('successful deployment', () => {
        it('should deploy mesh successfully', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated successfully',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
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
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should call progress callback during deployment', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated successfully',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

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
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

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

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

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
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger
            );

            expect(mockCommandManager.execute).toHaveBeenCalledWith(
                expect.stringContaining('aio api-mesh update'),
                expect.any(Object)
            );
        });

        it('should set correct working directory', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

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
    });

    describe('error handling', () => {
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

        it('should handle command failure', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

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

        it('should handle verification failure', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Mesh updated',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
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

        it('should format Adobe CLI errors', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

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
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

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
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                meshConfig: {
                    sources: [
                        {
                            name: 'magento',
                            handler: {
                                graphql: {
                                    endpoint: 'https://example.com/graphql',
                                },
                            },
                        },
                    ],
                },
            }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
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

    describe('progress reporting', () => {
        it('should report reading configuration', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

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
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalledWith('Deploying API Mesh...', 'Updating mesh configuration');
        });

        it('should report verification status', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
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
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(JSON.stringify({ meshConfig: { sources: [] } }));

            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: 'Success',
            });

            const { waitForMeshDeployment } = require('@/features/mesh/services/meshDeploymentVerifier');
            waitForMeshDeployment.mockResolvedValue({
                deployed: true,
                meshId: 'mesh123',
                endpoint: 'https://example.com/graphql',
            });

            const onProgress = jest.fn();

            await deployMeshComponent(
                '/path/to/mesh',
                mockCommandManager,
                mockLogger,
                onProgress
            );

            expect(onProgress).toHaveBeenCalledWith('✓ Deployment Complete', 'https://example.com/graphql');
        });
    });
});
