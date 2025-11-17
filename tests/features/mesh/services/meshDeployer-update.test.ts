/**
 * MeshDeployer Update Tests
 *
 * Tests for mesh update operations, including:
 * - Successful updates
 * - File writing for updates
 * - Adobe CLI update command execution
 * - Endpoint extraction
 * - Error handling
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
    createSuccessResult
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

// Mock securityValidation
jest.mock('@/core/validation/securityValidation', () => ({
    validateMeshId: jest.fn()
}));

describe('MeshDeployer - Update', () => {
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

    describe('update', () => {
        it('should update mesh successfully', async () => {
            const mockProject = createMockProject();
            const result = await meshDeployer.update(mockProject);

            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });

        it('should write updated mesh.json file', async () => {
            const mockProject = createMockProject();
            await meshDeployer.update(mockProject);

            expect(fs.writeFile).toHaveBeenCalledWith(
                '/test/project/mesh.json',
                expect.any(String)
            );
        });

        it('should execute aio api-mesh:update command', async () => {
            const mockProject = createMockProject();
            await meshDeployer.update(mockProject);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh:update mesh.json',
                expect.objectContaining({
                    cwd: '/test/project'
                })
            );
        });

        it('should extract endpoint from update output', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult('Mesh updated\nhttps://updated-mesh.adobe.io/graphql')
            );

            const result = await meshDeployer.update(mockProject);

            expect(result.data!.endpoint).toBe('https://updated-mesh.adobe.io/graphql');
        });

        it('should handle update without endpoint', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult('Update complete')
            );

            const result = await meshDeployer.update(mockProject);

            expect(result.success).toBe(false);
            expect(result.data?.endpoint).toBeUndefined();
        });

        it('should handle update failure', async () => {
            const mockProject = createMockProject();
            // Given: Update command fails
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Update failed')
            );

            // When: Updating mesh
            const result = await meshDeployer.update(mockProject);

            // Then: Should return failure
            expect(result.success).toBe(false);
            expect(result.error).toContain('failed');
        });

        it('should complete update workflow successfully', async () => {
            const mockProject = createMockProject();
            // When: Updating mesh
            const result = await meshDeployer.update(mockProject);

            // Then: Should succeed with endpoint
            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });
    });

    describe('concurrent operations', () => {
        it('should handle concurrent deploy calls', async () => {
            const mockProject = createMockProject();
            const deploy1 = meshDeployer.deploy(mockProject);
            const deploy2 = meshDeployer.deploy(mockProject);

            const results = await Promise.all([deploy1, deploy2]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should handle concurrent update calls', async () => {
            const mockProject = createMockProject();
            const update1 = meshDeployer.update(mockProject);
            const update2 = meshDeployer.update(mockProject);

            const results = await Promise.all([update1, update2]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should handle mixed deploy and update calls', async () => {
            const mockProject = createMockProject();
            const deploy = meshDeployer.deploy(mockProject);
            const update = meshDeployer.update(mockProject);

            const results = await Promise.all([deploy, update]);

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });
    });
});
