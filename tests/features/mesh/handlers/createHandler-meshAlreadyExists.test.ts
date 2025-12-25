/**
 * Tests for handleMeshAlreadyExists Helper Function
 *
 * Tests detection logic, logging, progress, and update command execution
 * when a mesh already exists or was partially created.
 */

import { handleMeshAlreadyExists } from '@/features/mesh/handlers/createHandlerHelpers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell/types';

// Mock getEndpoint helper (it uses ServiceLocator internally)
jest.mock('@/features/mesh/handlers/shared', () => ({
    getEndpoint: jest.fn((context: HandlerContext, meshId: string) =>
        Promise.resolve(`https://graph.adobe.io/api/${meshId}/graphql`)
    ),
}));

describe('handleMeshAlreadyExists', () => {
    let mockContext: HandlerContext;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    const meshConfigPath = '/tmp/mesh-config.json';

    beforeEach(() => {
        // Mock HandlerContext
        mockContext = {
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            },
            debugLogger: {
                trace: jest.fn(),
                debug: jest.fn(),
            },
            context: {
                extensionPath: '/extension/path',
            },
        } as unknown as HandlerContext;

        // Mock CommandExecutor
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;
    });

    const mockResult = (code: number, stdout: string, stderr: string = ''): CommandResult => ({
        code,
        stdout,
        stderr,
        duration: 0,
    });

    describe('detection logic', () => {
        it('should return undefined when mesh does not exist and not partially created', async () => {
            // Given: Create result with generic error (not "mesh exists" or "Mesh created")
            const createResult = mockResult(1, '', 'Some other error occurred');
            const lastOutput = { value: 'Some generic output' };

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Returns undefined (not our case)
            expect(result).toBeUndefined();
        });

        it('should detect "already has a mesh" in stderr', async () => {
            // Given: Create result with "already has a mesh" in stderr
            const createResult = mockResult(1, '', 'Error: workspace already has a mesh');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: abc-123'));

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should handle the case (not return undefined)
            expect(result).toBeDefined();
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });

        it('should detect "already has a mesh" in lastOutput', async () => {
            // Given: Create result with "already has a mesh" in lastOutput
            const createResult = mockResult(1, '', 'Generic error');
            const lastOutput = { value: 'Warning: workspace already has a mesh configured' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: def-456'));

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should handle the case
            expect(result).toBeDefined();
        });

        it('should detect "Mesh created" in stdout (partial creation)', async () => {
            // Given: Create result with "Mesh created" in stdout
            const createResult = mockResult(1, 'Mesh created successfully but deployment failed', 'Deployment error');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: ghi-789'));

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should handle the case
            expect(result).toBeDefined();
        });

        it('should detect "mesh created" in stdout (lowercase)', async () => {
            // Given: Create result with "mesh created" in stdout (lowercase)
            const createResult = mockResult(1, 'mesh created but failed to deploy', '');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: jkl-012'));

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should handle the case
            expect(result).toBeDefined();
        });

        it('should detect "Mesh created" in lastOutput', async () => {
            // Given: Create result with "Mesh created" in lastOutput
            const createResult = mockResult(1, '', 'Error');
            const lastOutput = { value: 'Output: Mesh created but deployment incomplete' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: mno-345'));

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should handle the case
            expect(result).toBeDefined();
        });
    });

    describe('logging and progress', () => {
        it('should log correct message for "mesh already exists" case', async () => {
            // Given: Mesh already exists scenario
            const createResult = mockResult(1, '', 'already has a mesh');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: test-123'));

            // When: handleMeshAlreadyExists called
            await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should log "updating with new configuration"
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[API Mesh] Mesh already exists, updating with new configuration'
            );
        });

        it('should log correct message for "partial creation" case', async () => {
            // Given: Mesh created but deployment failed scenario
            const createResult = mockResult(1, 'Mesh created successfully', 'Deployment failed');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: test-456'));

            // When: handleMeshAlreadyExists called
            await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should log "attempting update to redeploy"
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[API Mesh] Mesh created but deployment failed, attempting update to redeploy'
            );
        });

        it('should call onProgress with correct messages for "mesh exists" case', async () => {
            // Given: Mesh already exists + onProgress callback
            const createResult = mockResult(1, '', 'already has a mesh');
            const lastOutput = { value: '' };
            const onProgress = jest.fn();
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: test-789'));

            // When: handleMeshAlreadyExists called
            await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput,
                onProgress
            );

            // Then: Should call onProgress with appropriate messages
            expect(onProgress).toHaveBeenCalledWith(
                'Updating Existing Mesh...',
                'Found existing mesh, updating configuration'
            );
            expect(onProgress).toHaveBeenCalledWith(
                '✓ API Mesh Ready',
                'Mesh successfully deployed and ready to use'
            );
        });

        it('should call onProgress with correct messages for "partial creation" case', async () => {
            // Given: Mesh created but failed + onProgress callback
            const createResult = mockResult(1, 'Mesh created', '');
            const lastOutput = { value: '' };
            const onProgress = jest.fn();
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: test-abc'));

            // When: handleMeshAlreadyExists called
            await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput,
                onProgress
            );

            // Then: Should call onProgress with appropriate messages
            expect(onProgress).toHaveBeenCalledWith(
                'Completing API Mesh Setup...',
                'Detected partial creation, now deploying mesh'
            );
        });
    });

    describe('update command execution', () => {
        it('should execute update command with correct parameters', async () => {
            // Given: Mesh already exists scenario
            const createResult = mockResult(1, '', 'already has a mesh');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(mockResult(0, 'Mesh ID: update-test'));

            // When: handleMeshAlreadyExists called
            await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should call execute with correct command and options
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                `aio api-mesh:update "${meshConfigPath}" --autoConfirmAction`,
                expect.objectContaining({
                    streaming: true,
                    shell: true,
                    configureTelemetry: false,
                    enhancePath: true,
                })
            );
        });

        it('should extract meshId from update result stdout', async () => {
            // Given: Update returns stdout with mesh ID
            const createResult = mockResult(1, '', 'already has a mesh');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'Successfully updated mesh\nMesh ID: extracted-mesh-id-123')
            );

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should extract and return meshId
            expect(result).toBeDefined();
            expect(result?.meshId).toBe('extracted-mesh-id-123');
        });

        it('should return success result with meshId and message', async () => {
            // Given: Successful update
            const createResult = mockResult(1, 'Mesh created', '');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'Mesh ID: success-mesh-789')
            );

            // When: handleMeshAlreadyExists called
            const result = await handleMeshAlreadyExists(
                mockContext,
                mockCommandExecutor,
                meshConfigPath,
                createResult,
                lastOutput
            );

            // Then: Should return success result
            expect(result).toEqual({
                success: true,
                meshId: 'success-mesh-789',
                endpoint: expect.any(String), // Endpoint is generated from meshId
                message: 'API Mesh deployed successfully',
            });
        });

        it('should throw error when update command fails with non-zero exit code', async () => {
            // Given: Update command fails
            const createResult = mockResult(1, '', 'already has a mesh');
            const lastOutput = { value: '' };
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'Update failed: insufficient permissions')
            );

            // When/Then: handleMeshAlreadyExists should throw
            await expect(
                handleMeshAlreadyExists(
                    mockContext,
                    mockCommandExecutor,
                    meshConfigPath,
                    createResult,
                    lastOutput
                )
            ).rejects.toThrow('Update failed: insufficient permissions');

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[API Mesh] Update failed',
                expect.any(Error)
            );
        });

        it('should throw error when update command throws exception', async () => {
            // Given: Update command throws
            const createResult = mockResult(1, 'Mesh created', '');
            const lastOutput = { value: '' };
            const updateError = new Error('Network timeout during update');
            mockCommandExecutor.execute.mockRejectedValue(updateError);

            // When/Then: handleMeshAlreadyExists should throw
            await expect(
                handleMeshAlreadyExists(
                    mockContext,
                    mockCommandExecutor,
                    meshConfigPath,
                    createResult,
                    lastOutput
                )
            ).rejects.toThrow('Network timeout during update');

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[API Mesh] Failed to update existing mesh',
                updateError
            );
        });
    });
});
