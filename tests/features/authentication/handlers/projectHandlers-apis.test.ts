/**
 * Project Handlers - API Tests
 *
 * Tests for project API verification:
 * - handleCheckProjectApis: Verify API Mesh access
 * - Plugin detection
 * - Fallback command strategies
 */

import { handleCheckProjectApis } from '@/features/authentication/handlers/projectHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockContext, createMockCommandExecutor } from './projectHandlers.testUtils';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str))
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        PROJECT_LIST: 30000,
        WORKSPACE_LIST: 30000
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('projectHandlers - API Verification', () => {
    let mockContext: ReturnType<typeof createMockContext>;
    let mockCommandExecutor: ReturnType<typeof createMockCommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        mockCommandExecutor = createMockCommandExecutor();

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);
    });

    describe('handleCheckProjectApis', () => {
        it('should detect API Mesh when enabled', async () => {
            // Mock CLI commands
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --active --json
                    stdout: JSON.stringify({ meshId: 'mesh-123' })
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh access confirmed')
            );
        });

        it('should detect when API Mesh is not enabled', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: 403 Forbidden',
                    stderr: 'not authorized',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh not enabled')
            );
        });

        it('should handle when plugin is not installed', async () => {
            mockCommandExecutor.execute.mockResolvedValueOnce({
                // aio plugins --json
                stdout: JSON.stringify([
                    { name: '@adobe/aio-cli-plugin-something-else' }
                ])
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh CLI plugin not installed')
            );
        });

        it('should handle no active mesh but API enabled', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json
                    message: 'Error: No active mesh found',
                    stderr: 'not found',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] API Mesh enabled; no active mesh found')
            );
        });

        it('should try fallback commands on error', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active --json fails
                    message: 'Unknown command',
                    stderr: '',
                    stdout: ''
                })
                .mockResolvedValueOnce({
                    // aio api-mesh:get --help succeeds
                    stdout: 'Usage: aio api-mesh:get'
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(true);
        });

        it('should return false when all probes fail', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce({
                    // aio plugins --json
                    stdout: JSON.stringify([
                        { name: '@adobe/aio-cli-plugin-api-mesh' }
                    ])
                })
                .mockResolvedValueOnce({
                    // aio console projects get --json
                    stdout: JSON.stringify({ id: 'proj-123' })
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --active fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh:get --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                })
                .mockRejectedValueOnce({
                    // aio api-mesh --help fails
                    message: 'Unknown',
                    stderr: '',
                    stdout: ''
                });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Setup] Unable to confirm API Mesh access')
            );
        });

        it('should handle plugin list parsing errors', async () => {
            mockCommandExecutor.execute.mockResolvedValueOnce({
                // aio plugins --json with invalid JSON
                stdout: 'invalid json'
            });

            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
        });

        it('should handle general errors', async () => {
            const error = new Error('CLI command failed');
            mockCommandExecutor.execute.mockRejectedValue(error);

            // Implementation catches errors and returns success with hasMesh: false
            const result = await handleCheckProjectApis(mockContext);

            expect(result.success).toBe(true);
            expect(result.data!.hasMesh).toBe(false);
            expect(mockContext.debugLogger.debug).toHaveBeenCalledWith(
                '[Adobe Setup] Failed to verify plugins; continuing',
                expect.objectContaining({ error: expect.any(String) })
            );
        });
    });
});
