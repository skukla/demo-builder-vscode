/**
 * MeshDeployer Deletion Tests
 *
 * Tests for mesh deletion operations, including:
 * - Successful deletion
 * - Mesh ID validation
 * - Security validation (command injection prevention)
 * - Error handling
 * - Edge cases (empty IDs, special characters)
 *
 * Target Coverage: 75%+
 */

import { MeshDeployer } from '@/features/mesh/services/meshDeployer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import * as fs from 'fs/promises';
import {
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

describe('MeshDeployer - Deletion', () => {
    let meshDeployer: MeshDeployer;
    let mockCommandExecutor: jest.Mocked<ReturnType<typeof createMockCommandExecutor>>;
    const { validateMeshId } = require('@/core/validation/securityValidation');

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        meshDeployer = new MeshDeployer(createTestLogger());

        // Mock successful command execution for delete
        mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
            stdout: 'Mesh deleted',
            stderr: '',
            code: 0,
            duration: 500
        });

        // Mock fs.writeFile
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    describe('delete', () => {
        it('should delete mesh successfully', async () => {
            // Given: Delete command succeeds
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: 'Mesh deleted',
                stderr: '',
                code: 0,
                duration: 500
            });

            // When: Deleting mesh
            const result = await meshDeployer.delete('mesh-123');

            // Then: Should succeed
            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:delete mesh-123'
            );
        });

        it('should validate mesh ID before deletion', async () => {
            await meshDeployer.delete('mesh-123');

            expect(validateMeshId).toHaveBeenCalledWith('mesh-123');
        });

        it('should execute aio api-mesh:delete command', async () => {
            await meshDeployer.delete('mesh-123');

            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio api-mesh:delete mesh-123'
            );
        });

        it('should handle deletion failure', async () => {
            // Given: Delete command fails
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(
                new Error('Deletion failed')
            );

            // When: Attempting deletion
            const result = await meshDeployer.delete('mesh-123');

            // Then: Should return false
            expect(result).toBe(false);
        });

        it('should prevent command injection via mesh ID', async () => {
            // Given: Malicious mesh ID that would cause injection
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (id.includes(';') || id.includes('&')) {
                    throw new Error('Invalid mesh ID');
                }
            });

            // When: Attempting to delete with malicious ID
            const result = await meshDeployer.delete('mesh-123; rm -rf /');

            // Then: Should fail without executing command
            expect(result).toBe(false);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(0);
        });

        it('should handle empty mesh ID', async () => {
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (!id || id.trim() === '') {
                    throw new Error('Mesh ID is required');
                }
            });

            const result = await meshDeployer.delete('');

            expect(result).toBe(false);
        });

        it('should handle mesh ID with special characters', async () => {
            (validateMeshId as jest.Mock).mockImplementationOnce((id: string) => {
                if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
                    throw new Error('Invalid mesh ID format');
                }
            });

            const result = await meshDeployer.delete('mesh@123');

            expect(result).toBe(false);
        });
    });
});
