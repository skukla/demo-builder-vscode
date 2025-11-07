import { waitForMeshDeployment } from '@/features/mesh/services/meshDeploymentVerifier';
import type { VerificationOptions } from '@/features/mesh/services/meshDeploymentVerifier';

/**
 * MeshDeploymentVerifier Test Suite
 *
 * Tests mesh deployment verification and polling:
 * - Deployment verification polling
 * - Status detection (deployed, error, pending)
 * - Endpoint retrieval
 * - Timeout handling
 * - Progress callbacks
 * - Retry logic
 *
 * Total tests: 20
 */

// Mock dependencies
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(),
    },
}));

jest.mock('@/core/validation', () => ({
    validateMeshId: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        API_MESH_UPDATE: 180000, // 3 minutes
    },
}));

describe('MeshDeploymentVerifier', () => {
    let mockCommandManager: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockCommandManager = {
            execute: jest.fn(),
        };

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getCommandExecutor.mockReturnValue(mockCommandManager);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('successful deployment verification', () => {
        it('should verify deployment when status is deployed', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'deployed',
                    meshId: 'mesh123',
                }),
            }).mockResolvedValueOnce({
                code: 0,
                stdout: 'Endpoint: https://example.com/graphql',
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.meshId).toBe('mesh123');
        });

        it('should verify deployment when status is success', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'success',
                    meshId: 'mesh123',
                }),
            }).mockResolvedValueOnce({
                code: 0,
                stdout: 'Endpoint: https://example.com/graphql',
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should retrieve endpoint using describe command', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        meshStatus: 'deployed',
                        meshId: 'mesh123',
                    }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'Endpoint: https://example.com/graphql',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.endpoint).toBe('https://example.com/graphql');
        });

        it('should extract endpoint from JSON response', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        meshStatus: 'deployed',
                        meshId: 'mesh123',
                    }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        endpoint: 'https://example.com/graphql',
                    }),
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.endpoint).toBe('https://example.com/graphql');
        });

        it('should fallback to constructed endpoint if describe fails', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        meshStatus: 'deployed',
                        meshId: 'mesh123',
                    }),
                })
                .mockResolvedValueOnce({
                    code: 1,
                    stderr: 'Failed to describe',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.endpoint).toBe('https://graph.adobe.io/api/mesh123/graphql');
        });
    });

    describe('deployment failures', () => {
        it('should detect error status', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'error',
                }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(false);
            expect(result.error).toContain('failed with error status');
        });

        it('should detect failed status', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'failed',
                }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(false);
        });

        it('should timeout after max retries', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'pending',
                }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 3,
            });

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should handle command execution errors gracefully', async () => {
            mockCommandManager.execute
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({
                        meshStatus: 'deployed',
                        meshId: 'mesh123',
                    }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'Endpoint: https://example.com/graphql',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First attempt (error)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second attempt (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });
    });

    describe('polling behavior', () => {
        it('should poll until deployed status', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshStatus: 'pending' }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshStatus: 'building' }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'Endpoint: https://example.com/graphql',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(4);
        });

        it('should wait between poll attempts', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'pending' }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 500,
                maxRetries: 2,
            });

            // Advance through initial wait
            await jest.advanceTimersByTimeAsync(100);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(1);

            // Advance through poll interval
            await jest.advanceTimersByTimeAsync(500);
            expect(mockCommandManager.execute).toHaveBeenCalledTimes(2);

            // Complete any remaining timers
            await jest.runAllTimersAsync();
            await promise;
        });

        it('should call progress callback with elapsed time', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'pending' }),
            });

            const onProgress = jest.fn();

            const promise = waitForMeshDeployment({
                initialWait: 1000,
                pollInterval: 500,
                maxRetries: 3,
                onProgress,
            });

            jest.advanceTimersByTime(1000); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(500); // First poll
            await Promise.resolve();

            expect(onProgress).toHaveBeenCalledWith(1, 3, 1); // 1 second elapsed

            jest.advanceTimersByTime(500); // Second poll
            await Promise.resolve();

            expect(onProgress).toHaveBeenCalledWith(2, 3, 1); // 1.5 seconds elapsed (rounded to 1)
        });
    });

    describe('configuration options', () => {
        it('should use default poll interval', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
            }).mockResolvedValueOnce({
                code: 0,
                stdout: 'Endpoint: https://example.com/graphql',
            });

            const promise = waitForMeshDeployment({
                maxRetries: 1,
            });

            // Run all timers to completion
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should calculate maxRetries from timeout', async () => {
            mockCommandManager.execute.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'pending' }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 1000,
                pollInterval: 1000,
                // maxRetries not specified, should be calculated
            });

            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            // Should have calculated maxRetries based on TIMEOUTS.API_MESH_UPDATE
            // (180000 - 1000) / 1000 = 179 retries
            expect(mockCommandManager.execute).toHaveBeenCalled();
        });

        it('should use provided logger', async () => {
            const mockLogger = {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            };

            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
            }).mockResolvedValueOnce({
                code: 0,
                stdout: 'Endpoint: https://example.com/graphql',
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 1,
                logger: mockLogger as any,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            await promise;

            expect(mockLogger.info).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle malformed JSON response', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'not json',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'Endpoint: https://example.com/graphql',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First poll (malformed)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second poll (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });

        it('should handle missing meshId in response', async () => {
            mockCommandManager.execute.mockResolvedValueOnce({
                code: 0,
                stdout: JSON.stringify({
                    meshStatus: 'deployed',
                    // meshId missing
                }),
            });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 1,
            });

            jest.advanceTimersByTime(150);
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
            expect(result.meshId).toBeUndefined();
        });

        it('should handle non-zero exit code', async () => {
            mockCommandManager.execute
                .mockResolvedValueOnce({
                    code: 1,
                    stderr: 'Command failed',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshStatus: 'deployed', meshId: 'mesh123' }),
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: 'Endpoint: https://example.com/graphql',
                });

            const promise = waitForMeshDeployment({
                initialWait: 100,
                pollInterval: 100,
                maxRetries: 5,
            });

            jest.advanceTimersByTime(100); // Initial wait
            await Promise.resolve();

            jest.advanceTimersByTime(100); // First poll (error)
            await Promise.resolve();

            jest.advanceTimersByTime(100); // Second poll (success)
            await Promise.resolve();

            const result = await promise;

            expect(result.deployed).toBe(true);
        });
    });
});
