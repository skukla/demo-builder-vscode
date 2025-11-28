/**
 * Unit tests for meshEndpoint
 * Tests endpoint extraction from CLI output, URL parsing, and validation
 */

import { getEndpoint } from '@/features/mesh/services/meshEndpoint';
import type { Logger } from '@/types/logger';
import type { CommandExecutor } from '@/core/shell';

// Mock validation
jest.mock('@/core/validation', () => ({
    validateMeshId: jest.fn(),
}));

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        API_CALL: 30000,
        CONFIG_READ: 5000,
    },
}));

describe('meshEndpoint', () => {
    let mockCommandManager: CommandExecutor;
    let mockLogger: Logger;
    let mockDebugLogger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandManager = {
            execute: jest.fn(),
        } as any;

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };

        mockDebugLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };
    });

    describe('getEndpoint', () => {
        const meshId = 'test-mesh-id-123';

        it('should return cached endpoint if available', async () => {
            const cachedEndpoint = 'https://cached-endpoint.adobe.io/graphql';

            const result = await getEndpoint(
                meshId,
                cachedEndpoint,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(cachedEndpoint);
            expect(mockDebugLogger.debug).toHaveBeenCalledWith('[API Mesh] Using cached endpoint');
            expect(mockCommandManager.execute).not.toHaveBeenCalled();
        });

        it('should validate meshId before using it', async () => {
            const { validateMeshId } = require('@/core/validation');

            await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(validateMeshId).toHaveBeenCalledWith(meshId);
        });

        it('should call describe command if no cached endpoint', async () => {
            // Mock plugin check first (returns plugin installed)
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                // Then mock describe command
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshEndpoint: 'https://describe-endpoint.adobe.io/graphql' }),
                    stderr: '',
                });

            await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            // Should check plugin first
            expect(mockCommandManager.execute).toHaveBeenCalledWith(
                'aio plugins',
                expect.objectContaining({
                    timeout: 5000,
                    configureTelemetry: false,
                    enhancePath: true,
                }),
            );

            // Then call describe
            expect(mockCommandManager.execute).toHaveBeenCalledWith(
                'aio api-mesh:describe',
                expect.objectContaining({
                    timeout: 30000,
                    configureTelemetry: false,
                    enhancePath: true,
                }),
            );
        });

        it('should parse meshEndpoint from describe output', async () => {
            const describeEndpoint = 'https://describe-endpoint.adobe.io/graphql';
            // Mock plugin check first, then describe
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshEndpoint: describeEndpoint }),
                    stderr: '',
                });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(describeEndpoint);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[API Mesh] Retrieved endpoint from describe:',
                describeEndpoint,
            );
        });

        it('should parse endpoint field as fallback', async () => {
            const endpoint = 'https://fallback-endpoint.adobe.io/graphql';
            // Mock plugin check first, then describe
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ endpoint }),
                    stderr: '',
                });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(endpoint);
        });

        it('should construct endpoint if describe fails', async () => {
            (mockCommandManager.execute as jest.Mock).mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error',
            });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(`https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[API Mesh] Using constructed endpoint (fallback)',
            );
        });

        it('should construct endpoint if describe throws error', async () => {
            // Mock plugin check succeeds, then describe throws
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockRejectedValueOnce(new Error('Command failed'));

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(`https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`);
            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                '[API Mesh] Describe failed, using constructed fallback',
            );
        });

        it('should construct endpoint if JSON parsing fails', async () => {
            (mockCommandManager.execute as jest.Mock).mockResolvedValue({
                code: 0,
                stdout: 'Invalid JSON',
                stderr: '',
            });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(`https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`);
        });

        it('should construct endpoint if no endpoint in JSON', async () => {
            (mockCommandManager.execute as jest.Mock).mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ someOtherField: 'value' }),
                stderr: '',
            });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(`https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`);
        });

        it('should log debug message when fetching from describe', async () => {
            // Mock plugin check first, then describe
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: JSON.stringify({ meshEndpoint: 'https://test.adobe.io/graphql' }),
                    stderr: '',
                });

            await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                '[API Mesh] Fetching endpoint via describe command',
            );
        });

        it('should handle describe output with extra whitespace', async () => {
            const endpoint = 'https://test.adobe.io/graphql';
            // Mock plugin check first, then describe
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: `\n\n  ${JSON.stringify({ meshEndpoint: endpoint })}  \n\n`,
                    stderr: '',
                });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(endpoint);
        });

        it('should handle describe output with multiple JSON objects', async () => {
            const endpoint = 'https://test.adobe.io/graphql';
            // Mock plugin check first, then describe
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: `Some text\n${JSON.stringify({ meshEndpoint: endpoint })}\nMore text`,
                    stderr: '',
                });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(endpoint);
        });

        it('should warn if mesh data parsing fails', async () => {
            // Mock plugin check first, then describe with invalid JSON
            (mockCommandManager.execute as jest.Mock)
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '@adobe/aio-cli-plugin-api-mesh',
                    stderr: '',
                })
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '{invalid json}',  // Has {} so regex matches, but JSON.parse will fail
                    stderr: '',
                });

            await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(mockLogger.warn).toHaveBeenCalledWith(
                '[Mesh Endpoint] Failed to parse mesh data',
            );
        });

        it('should handle empty stdout from describe', async () => {
            (mockCommandManager.execute as jest.Mock).mockResolvedValue({
                code: 0,
                stdout: '',
                stderr: '',
            });

            const result = await getEndpoint(
                meshId,
                undefined,
                mockCommandManager,
                mockLogger,
                mockDebugLogger,
            );

            expect(result).toBe(`https://edge-sandbox-graph.adobe.io/api/${meshId}/graphql`);
        });
    });
});
