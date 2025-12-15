/**
 * MeshDeployer Error Handling Tests
 *
 * Tests for error scenarios and edge cases, including:
 * - Command execution timeouts
 * - Network errors
 * - Authentication failures
 * - Invalid mesh configurations
 * - Workspace not found
 * - Adobe CLI errors
 *
 * Target Coverage: 75%+
 */

import { MeshDeployer } from '@/features/mesh/services/meshDeployer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { ErrorCode } from '@/types/errorCodes';
import * as fs from 'fs/promises';
import {
    createMockProject,
    createTestLogger,
    createMockCommandExecutor,
    createFailureResult
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

// Mock securityValidation
jest.mock('@/core/validation', () => ({
    validateMeshId: jest.fn()
}));

describe('MeshDeployer - Error Handling', () => {
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

    describe('error handling and edge cases', () => {
        it('should handle command execution timeout', async () => {
            const mockProject = createMockProject();
            // Given: Command times out
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Command timed out after 120000ms')
            );

            // When: Deploying mesh
            const result = await meshDeployer.deploy(mockProject);

            // Then: Should fail with timeout error code
            expect(result.success).toBe(false);
            expect(result.code).toBe(ErrorCode.TIMEOUT);
        });

        it('should handle network errors', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('ENOTFOUND: DNS lookup failed')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle Adobe CLI not authenticated', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Not authenticated. Please run: aio auth login')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle invalid mesh configuration', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Invalid configuration: missing required field "sources"',
                code: 1,
                duration: 100
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle workspace not found', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Workspace not found')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle file system errors gracefully', async () => {
            const mockProject = createMockProject();
            (fs.writeFile as jest.Mock).mockRejectedValue(
                new Error('ENOSPC: No space left on device')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No space left on device');
        });

        it('should handle permission errors on file write', async () => {
            const mockProject = createMockProject();
            (fs.writeFile as jest.Mock).mockRejectedValue(
                new Error('EACCES: Permission denied')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Permission denied');
        });

        it('should handle malformed CLI output', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'Unexpected output format without endpoint',
                stderr: '',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
        });

        it('should handle CLI stderr with warnings', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'https://mesh-endpoint.adobe.io/graphql',
                stderr: 'Warning: Some deprecated configuration detected',
                code: 0,
                duration: 1000
            });

            const result = await meshDeployer.deploy(mockProject);

            // Should succeed despite warnings in stderr
            expect(result.success).toBe(true);
            expect(result.data!.endpoint).toBe('https://mesh-endpoint.adobe.io/graphql');
        });

        it('should handle quota exceeded errors', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Quota exceeded: Maximum number of meshes reached')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Quota exceeded');
        });

        it('should handle rate limiting errors', async () => {
            const mockProject = createMockProject();
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Rate limit exceeded. Please try again later.')
            );

            const result = await meshDeployer.deploy(mockProject);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Rate limit exceeded');
        });
    });
});
