/**
 * MeshDeployer Deployment Tests
 *
 * Tests for mesh deployment operations, including:
 * - Successful deployment
 * - File writing (mesh.json)
 * - Adobe CLI command execution
 * - Endpoint extraction from output
 * - Error handling
 * - Working directory management
 *
 * Target Coverage: 75%+
 */

import { MeshDeployer } from '@/features/mesh/services/meshDeployer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import * as fs from 'fs/promises';
import {
    createMockProject,
    createTestLogger,
    createMockCommandExecutor,
    createSuccessResult,
    createFailureResult
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

// Mock securityValidation
jest.mock('@/core/validation/securityValidation', () => ({
    validateMeshId: jest.fn()
}));

describe('MeshDeployer - Deployment', () => {
    let meshDeployer: MeshDeployer;
    let mockCommandExecutor: jest.Mocked<ReturnType<typeof createMockCommandExecutor>>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        meshDeployer = new MeshDeployer(createTestLogger());

        // Mock fs.writeFile
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    describe('deploy', () => {
        it('should deploy mesh successfully', async () => {
            const mockProject = createMockProject();
            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });

        it('should write mesh.json file', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/project/mesh.json',
                expect.any(String)
            );

            const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
            const meshConfig = JSON.parse(writeCall[1]);
            expect(meshConfig).toHaveProperty('meshConfig');
        });

        it('should execute aio api-mesh:create command', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:create mesh.json',
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should extract endpoint from command output', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult('Mesh created successfully\nhttps://custom-mesh.adobe.io/graphql\nDone!')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://custom-mesh.adobe.io/graphql');
        });

        it('should handle deployment without endpoint', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult('Mesh created but no endpoint provided')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.data?.endpoint).toBeUndefined();
        });

        it('should handle deployment failure', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Deployment failed')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('failed');
        });

        it('should handle file write failure', async () => {
            const mockProject = createMockProject();
            (fs.writeFile as jest.Mock).mockRejectedValue(
                new Error('Permission denied')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Permission denied');
        });

        it('should complete deployment workflow successfully', async () => {
            const mockProject = createMockProject();
            // Given: Successful CLI command
            const result = await meshDeployer.deploy(mockProject);

            // Then: Deployment should complete with endpoint
            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');

            // And: Files should be written and commands executed
            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/project/mesh.json',
                expect.any(String)
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:create mesh.json',
                expect.objectContaining({ cwd: '/test/project' })
            );
        });

        it('should handle multi-line output with endpoint', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult(`
Deploying mesh...
Configuration validated
https://mesh-123.adobe.io/graphql
Deployment complete
                `)
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://mesh-123.adobe.io/graphql');
        });

        it('should handle multiple URLs in output (use first)', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult(`
Primary endpoint: https://primary.adobe.io/graphql
Secondary endpoint: https://secondary.adobe.io/graphql
                `)
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.data!.endpoint).toBe('https://primary.adobe.io/graphql');
        });

        it('should format mesh config with proper indentation', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
            const meshConfigJson = writeCall[1] as string;

            // Verify JSON is properly formatted (has newlines and indentation)
            expect(meshConfigJson).toContain('\n');
            expect(meshConfigJson).toContain('  '); // 2-space indentation
        });
    });

    describe('Adobe CLI integration', () => {
        it('should use correct working directory for commands', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should handle relative paths in mesh.json reference', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            // Command should reference mesh.json relatively
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:create mesh.json',
                expect.any(Object)
            );
        });

        it('should properly format mesh.json path', async () => {
            const mockProject = createMockProject();
            await meshDeployer.deploy(mockProject);

            const meshJsonPath = (fs.writeFile as jest.Mock).mock.calls[0][0];
            expect(meshJsonPath).toBe('/test/project/mesh.json');
        });
    });
});
