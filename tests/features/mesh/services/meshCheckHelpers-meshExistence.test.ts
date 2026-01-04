/**
 * Tests for checkMeshExistence helper function
 *
 * Tests mesh existence detection via CLI commands.
 *
 * Note: Function was inlined into checkHandler.ts (Step 6.3)
 * per "Extract for Reuse, Section for Clarity" SOP.
 */

import { checkMeshExistence } from '@/features/mesh/handlers/checkHandler';
import { CommandExecutor } from '@/core/shell';

describe('checkMeshExistence', () => {
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;
    });

    const mockResult = (
        code: number,
        stdout: string | object,
        stderr: string = ''
    ) => ({
        code,
        stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
        stderr,
        duration: 0,
    });

    describe('returns meshExists false when no mesh found', () => {
        it('should return meshExists false when CLI returns "no mesh found"', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'Error: no mesh found for this workspace')
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: false,
            });
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio api-mesh get'
            );
        });

        it('should return meshExists false when CLI fails with error code', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'no mesh found')
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: false,
            });
        });
    });

    describe('returns deployed status for active mesh', () => {
        it('should return deployed status when meshStatus is "deployed"', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(
                    0,
                    JSON.stringify({
                        meshId: 'test-mesh-123',
                        meshStatus: 'deployed',
                    })
                )
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: 'test-mesh-123',
                endpoint: undefined,
            });
        });

        it('should handle CLI output with extra text before JSON', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(
                    0,
                    'Successfully retrieved mesh\n' +
                        JSON.stringify({
                            meshId: 'test-mesh-456',
                            meshStatus: 'deployed',
                        })
                )
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: 'test-mesh-456',
                endpoint: undefined,
            });
        });
    });

    describe('returns error status for failed mesh', () => {
        it('should return error status when meshStatus indicates error', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, {
                    meshId: 'error-mesh',
                    meshStatus: 'error',
                    error: 'Deployment failed: Invalid configuration',
                })
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'error',
                meshId: 'error-mesh',
                endpoint: undefined,
                error: 'Deployment failed: Invalid configuration',
            });
        });

        it('should categorize "failed" status as error', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, {
                    meshId: 'failed-mesh',
                    meshStatus: 'failed',
                })
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result.meshStatus).toBe('error');
        });
    });

    describe('returns pending status for provisioning mesh', () => {
        it('should return pending status when meshStatus is "provisioning"', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, {
                    meshId: 'pending-mesh',
                    meshStatus: 'provisioning',
                })
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'pending',
                meshId: 'pending-mesh',
                endpoint: undefined,
            });
        });

        it('should categorize building/deploying statuses as pending', async () => {
            const pendingStatuses = ['building', 'deploying', 'updating'];

            for (const status of pendingStatuses) {
                mockCommandExecutor.execute.mockResolvedValue(
                    mockResult(0, {
                        meshId: `mesh-${status}`,
                        meshStatus: status,
                    })
                );

                const result = await checkMeshExistence(mockCommandExecutor);

                expect(result.meshStatus).toBe('pending');
            }
        });
    });

    describe('handles edge cases', () => {
        it('should handle missing meshId in response', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, {
                    meshStatus: 'deployed',
                })
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: undefined,
                endpoint: undefined,
            });
        });

        it('should handle unparseable JSON gracefully', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(0, 'This is not valid JSON')
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: false,
            });
        });

        it('should handle command execution errors', async () => {
            mockCommandExecutor.execute.mockRejectedValue(
                new Error('Network timeout')
            );

            const result = await checkMeshExistence(mockCommandExecutor);

            expect(result).toEqual({
                meshExists: false,
            });
        });
    });
});
