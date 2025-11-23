/**
 * Tests for Create Handler Helper Functions (Step 8 - Phase 3)
 *
 * Tests for extracted helper functions to reduce cognitive complexity in createHandler.ts
 */

import { createProgressCallback, handleMeshAlreadyExists } from '@/features/mesh/handlers/createHandlerHelpers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell/types';

// Mock getEndpoint helper (it uses ServiceLocator internally)
jest.mock('@/features/mesh/handlers/shared', () => ({
    getEndpoint: jest.fn((context: HandlerContext, meshId: string) =>
        Promise.resolve(`https://graph.adobe.io/api/${meshId}/graphql`)
    ),
}));

describe('createProgressCallback', () => {
    describe('create operation', () => {
        it('should call onProgress with validating message when output contains "validating"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "validating"
            callback('Validating mesh configuration...');

            // Then: onProgress called with create + validating message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Validating configuration'
            );
        });

        it('should call onProgress with creating message when output contains "creating"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "creating"
            callback('Creating mesh instance...');

            // Then: onProgress called with create + creating message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Provisioning mesh infrastructure'
            );
        });

        it('should call onProgress with deploying message when output contains "deploying"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "deploying"
            callback('Deploying mesh to Adobe infrastructure...');

            // Then: onProgress called with create + deploying message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Deploying mesh'
            );
        });

        it('should call onProgress with success message when output contains "success"', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data with "success"
            callback('Success! Mesh created');

            // Then: onProgress called with create + success message
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Finalizing mesh setup'
            );
        });

        it('should accumulate output when outputAccumulator is provided', () => {
            // Given: Output accumulator and callback
            const outputAccumulator = { value: '' };
            const callback = createProgressCallback('create', undefined, outputAccumulator);

            // When: Callback receives multiple data chunks
            callback('First chunk\n');
            callback('Second chunk\n');
            callback('Third chunk');

            // Then: All chunks accumulated in outputAccumulator.value
            expect(outputAccumulator.value).toBe('First chunk\nSecond chunk\nThird chunk');
        });

        it('should handle case-insensitive matching', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives UPPERCASE data
            callback('VALIDATING mesh configuration');

            // Then: onProgress called (case-insensitive match)
            expect(onProgress).toHaveBeenCalledWith(
                'Creating API Mesh...',
                'Validating configuration'
            );
        });

        it('should not throw when onProgress is undefined', () => {
            // Given: No onProgress callback
            const callback = createProgressCallback('create');

            // When/Then: Calling callback with data should not throw
            expect(() => callback('validating...')).not.toThrow();
        });
    });

    describe('update operation', () => {
        it('should call onProgress with validating message when output contains "validating"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "validating"
            callback('Validating mesh configuration...');

            // Then: onProgress called with update + validating message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Validating mesh configuration'
            );
        });

        it('should call onProgress with updating message when output contains "updating"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "updating"
            callback('Updating mesh infrastructure...');

            // Then: onProgress called with update + updating message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Updating mesh infrastructure'
            );
        });

        it('should call onProgress with deploying message when output contains "deploying"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "deploying"
            callback('Deploying to Adobe infrastructure...');

            // Then: onProgress called with update + deploying message
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Deploying to Adobe infrastructure'
            );
        });

        it('should call onProgress with success message when output contains "success"', () => {
            // Given: Mock onProgress callback for update
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives data with "success"
            callback('Success! Mesh deployed');

            // Then: onProgress called with update + success message
            expect(onProgress).toHaveBeenCalledWith(
                'API Mesh Ready',
                'Mesh deployed successfully'
            );
        });

        it('should NOT accumulate output even when outputAccumulator is provided', () => {
            // Given: Output accumulator (should be ignored for update operation)
            const outputAccumulator = { value: '' };
            const callback = createProgressCallback('update', undefined, outputAccumulator);

            // When: Callback receives data
            callback('Update data chunk');

            // Then: outputAccumulator remains empty (update doesn't accumulate)
            expect(outputAccumulator.value).toBe('');
        });

        it('should handle case-insensitive matching', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('update', onProgress);

            // When: Callback receives UPPERCASE data
            callback('UPDATING infrastructure');

            // Then: onProgress called (case-insensitive match)
            expect(onProgress).toHaveBeenCalledWith(
                'Deploying API Mesh...',
                'Updating mesh infrastructure'
            );
        });

        it('should not throw when onProgress is undefined', () => {
            // Given: No onProgress callback
            const callback = createProgressCallback('update');

            // When/Then: Calling callback with data should not throw
            expect(() => callback('updating...')).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle output with no matching keywords gracefully', () => {
            // Given: Mock onProgress callback
            const onProgress = jest.fn();
            const callback = createProgressCallback('create', onProgress);

            // When: Callback receives data without keywords
            callback('Some random output text');

            // Then: onProgress not called
            expect(onProgress).not.toHaveBeenCalled();
        });

        it('should handle empty string output', () => {
            // Given: Mock onProgress callback and accumulator
            const onProgress = jest.fn();
            const outputAccumulator = { value: 'initial' };
            const callback = createProgressCallback('create', onProgress, outputAccumulator);

            // When: Callback receives empty string
            callback('');

            // Then: onProgress not called, accumulator still works
            expect(onProgress).not.toHaveBeenCalled();
            expect(outputAccumulator.value).toBe('initial');
        });
    });
});

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
            },
            debugLogger: {
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
            expect(mockContext.logger.info).toHaveBeenCalledWith(
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
            expect(mockContext.logger.info).toHaveBeenCalledWith(
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
                    useNodeVersion: null,
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
