/**
 * Tests for checkHandler refactored helper functions (Step 8 - Phase 2)
 *
 * Tests written BEFORE extraction (TDD: RED → GREEN → REFACTOR)
 */

import {
    checkApiMeshEnabled,
    checkMeshExistence,
    fallbackMeshCheck,
} from '@/features/mesh/handlers/checkHandlerHelpers';
import { CommandExecutor } from '@/core/shell';

describe('checkApiMeshEnabled', () => {
    describe('returns false when mesh service not found', () => {
        it('should return false when services array is empty', () => {
            // Given: workspace config with empty services array
            const services: unknown[] = [];
            const config = undefined; // No custom config

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: false }
            expect(result).toEqual({ enabled: false });
        });

        it('should return false when services have no mesh-related entries', () => {
            // Given: services array without mesh-related services
            const services = [
                { name: 'Analytics API', code: 'AnalyticsAPI' },
                { name: 'Asset Compute API', code: 'AssetComputeAPI' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: false }
            expect(result).toEqual({ enabled: false });
        });
    });

    describe('returns true when MeshAPI code found', () => {
        it('should detect mesh via code property', () => {
            // Given: services array with { code: 'MeshAPI' }
            const services = [
                { name: 'Some API', code: 'SomeAPI' },
                { code: 'MeshAPI' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: true }
            expect(result).toEqual({ enabled: true });
        });

        it('should detect mesh via code_name property', () => {
            // Given: services array with { code_name: 'MeshAPI' }
            const services = [
                { code_name: 'MeshAPI' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: true }
        });
    });

    describe('detects mesh via name pattern', () => {
        it('should detect mesh when name includes "API Mesh"', () => {
            // Given: services array with { name: 'API Mesh Service' }
            const services = [
                { name: 'API Mesh Service' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: true }
            expect(result).toEqual({ enabled: true });
        });

        it('should detect mesh with partial name match', () => {
            // Given: services with name containing "API Mesh"
            const services = [
                { name: 'Adobe API Mesh for Adobe Developer App Builder' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns { enabled: true }
            expect(result).toEqual({ enabled: true });
        });
    });

    describe('uses config patterns when provided', () => {
        it('should use custom namePatterns from config', () => {
            // Given: config with custom namePatterns
            const services = [
                { name: 'Custom Mesh Gateway' },
            ];
            const config = {
                services: {
                    apiMesh: {
                        detection: {
                            namePatterns: ['Custom Mesh'],
                            codes: ['MeshAPI'],
                            codeNames: ['MeshAPI'],
                        },
                    },
                },
            };

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: uses custom patterns for detection
            expect(result).toEqual({ enabled: true });
        });

        it('should use custom codes from config', () => {
            // Given: config with custom codes
            const services = [
                { code: 'CustomMeshCode' },
            ];
            const config = {
                services: {
                    apiMesh: {
                        detection: {
                            namePatterns: ['API Mesh'],
                            codes: ['CustomMeshCode'],
                            codeNames: ['MeshAPI'],
                        },
                    },
                },
            };

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: detects via custom code
            expect(result).toEqual({ enabled: true });
        });

        it('should fallback to defaults when config is undefined', () => {
            // Given: services with standard MeshAPI code, no config
            const services = [
                { code: 'MeshAPI' },
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: uses hardcoded defaults successfully
            expect(result).toEqual({ enabled: true });
        });
    });

    describe('handles edge cases', () => {
        it('should handle services with missing properties gracefully', () => {
            // Given: services with partial/missing properties
            const services = [
                { name: 'Incomplete Service' }, // No code
                { code: 'SomeCode' }, // No name
                {}, // Empty object
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: returns false without errors
            expect(result).toEqual({ enabled: false });
        });

        it('should be case-sensitive for code matching', () => {
            // Given: services with lowercase mesh code
            const services = [
                { code: 'meshapi' }, // lowercase
            ];
            const config = undefined;

            // When: checkApiMeshEnabled(services, config)
            const result = checkApiMeshEnabled(services, config);

            // Then: should NOT match (case-sensitive)
            expect(result).toEqual({ enabled: false });
        });
    });
});

describe('checkMeshExistence', () => {
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        // Create mock command executor
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;
    });

    // Helper to create mock CommandResult with required duration field
    // Handles both string and object stdout (objects are auto-stringified to JSON)
    const mockResult = (code: number, stdout: string | object, stderr: string = '') => ({
        code,
        stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
        stderr,
        duration: 0,
    });

    describe('returns meshExists false when no mesh found', () => {
        it('should return meshExists false when CLI returns "no mesh found"', async () => {
            // Given: CLI returns "no mesh found"
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'Error: no mesh found for this workspace')
            );

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns { meshExists: false }
            expect(result).toEqual({
                meshExists: false,
            });
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith('aio api-mesh get');
        });

        it('should return meshExists false when CLI fails with error code', async () => {
            // Given: CLI returns non-zero exit code
            mockCommandExecutor.execute.mockResolvedValue(
                mockResult(1, '', 'no mesh found')
            );

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns { meshExists: false }
            expect(result).toEqual({
                meshExists: false,
            });
        });
    });

    describe('returns deployed status for active mesh', () => {
        it('should return deployed status when meshStatus is "deployed"', async () => {
            // Given: CLI returns JSON with meshStatus: 'deployed'
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                JSON.stringify({
                    meshId: 'test-mesh-123',
                    meshStatus: 'deployed',
                })
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns { meshExists: true, meshStatus: 'deployed', meshId }
            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: 'test-mesh-123',
                endpoint: undefined, // endpoint is fetched separately in actual handler
            });
        });

        it('should handle CLI output with extra text before JSON', async () => {
            // Given: CLI returns message + JSON
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'Successfully retrieved mesh\n' + JSON.stringify({
                    meshId: 'test-mesh-456',
                    meshStatus: 'deployed',
                })
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: parses JSON correctly despite extra text
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
            // Given: CLI returns JSON with meshStatus: 'error'
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                {
                    meshId: 'error-mesh',
                    meshStatus: 'error',
                    error: 'Deployment failed: Invalid configuration',
                }
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns { meshExists: true, meshStatus: 'error' }
            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'error',
                meshId: 'error-mesh',
                endpoint: undefined,
                error: 'Deployment failed: Invalid configuration',
            });
        });

        it('should categorize "failed" status as error', async () => {
            // Given: CLI returns meshStatus "failed" (without hyphen)
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                {
                    meshId: 'failed-mesh',
                    meshStatus: 'failed',
                }
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: categorizes as error
            expect(result.meshStatus).toBe('error');
        });
    });

    describe('returns pending status for provisioning mesh', () => {
        it('should return pending status when meshStatus is "provisioning"', async () => {
            // Given: CLI returns JSON with meshStatus: 'provisioning'
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                {
                    meshId: 'pending-mesh',
                    meshStatus: 'provisioning',
                }
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns { meshExists: true, meshStatus: 'pending' }
            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'pending',
                meshId: 'pending-mesh',
                endpoint: undefined,
            });
        });

        it('should categorize building/deploying statuses as pending', async () => {
            // Given: CLI returns various pending statuses
            const pendingStatuses = ['building', 'deploying', 'updating'];

            for (const status of pendingStatuses) {
                mockCommandExecutor.execute.mockResolvedValue(mockResult(
                    0,
                    {
                        meshId: `mesh-${status}`,
                        meshStatus: status,
                    }
                ));

                // When: checkMeshExistence(commandManager)
                const result = await checkMeshExistence(mockCommandExecutor);

                // Then: categorizes as pending
                expect(result.meshStatus).toBe('pending');
            }
        });
    });

    describe('handles edge cases', () => {
        it('should handle missing meshId in response', async () => {
            // Given: Response has no meshId
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                {
                    meshStatus: 'deployed',
                }
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns result with undefined meshId
            expect(result).toEqual({
                meshExists: true,
                meshStatus: 'deployed',
                meshId: undefined,
                endpoint: undefined,
            });
        });

        it('should handle unparseable JSON gracefully', async () => {
            // Given: CLI returns invalid JSON
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'This is not valid JSON'
            ));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns meshExists false
            expect(result).toEqual({
                meshExists: false,
            });
        });

        it('should handle command execution errors', async () => {
            // Given: Command execution throws error
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network timeout'));

            // When: checkMeshExistence(commandManager)
            const result = await checkMeshExistence(mockCommandExecutor);

            // Then: returns meshExists false
            expect(result).toEqual({
                meshExists: false,
            });
        });
    });
});

describe('fallbackMeshCheck', () => {
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;
    });

    // Helper for creating mock results
    const mockResult = (code: number, stdout: string | object, stderr: string = '') => ({
        code,
        stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
        stderr,
        duration: 0,
    });

    describe('detects API not enabled from output patterns', () => {
        it('should detect API not enabled from "unable to get mesh config" in stdout', async () => {
            // Given: CLI success but stdout contains "unable to get mesh config"
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'Unable to get mesh config for this workspace'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: returns { apiEnabled: false, meshExists: false }
            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith('aio api-mesh get --active');
        });

        it('should detect API not enabled from "unable to get mesh config" in stderr', async () => {
            // Given: CLI error with "unable to get mesh config" in stderr
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                1,
                '',
                'Error: Unable to get mesh config'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: returns { apiEnabled: false }
            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should handle case-insensitive "unable to get" pattern', async () => {
            // Given: Mixed case error message
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'UNABLE TO GET MESH CONFIG'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: detects pattern regardless of case
            expect(result.apiEnabled).toBe(false);
        });
    });

    describe('detects API enabled but no mesh', () => {
        it('should detect "no mesh found" without "unable to get"', async () => {
            // Given: "no mesh found" but NOT "unable to get"
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                1,
                '',
                'Error: No mesh found for this workspace'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: returns { apiEnabled: true, meshExists: false }
            expect(result).toEqual({
                apiEnabled: true,
                meshExists: false,
            });
        });

        it('should prioritize "unable to get" over "no mesh found" when both present', async () => {
            // Given: Both patterns in output
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                1,
                'Unable to get mesh config. No mesh found.'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: "unable to get" takes precedence (API not enabled)
            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });
    });

    describe('detects existing mesh', () => {
        it('should extract meshId from stdout when mesh exists', async () => {
            // Given: Success with meshId in output
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'Mesh ID: abc-123-def\nStatus: active'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: returns mesh details
            expect(result).toEqual({
                apiEnabled: true,
                meshExists: true,
                meshId: 'abc-123-def',
                meshStatus: 'deployed',
            });
        });

        it('should handle mesh_id format with underscore', async () => {
            // Given: mesh_id instead of meshId
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'mesh_id: xyz-789-abc'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: extracts meshId correctly
            expect(result.meshId).toBe('xyz-789-abc');
        });

        it('should handle mesh-id format with hyphen separator', async () => {
            // Given: mesh-id with hyphen
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'mesh-id:123-456'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: extracts meshId
            expect(result.meshId).toBe('123-456');
        });

        it('should return mesh exists without meshId if pattern not found', async () => {
            // Given: Success but no meshId pattern
            mockCommandExecutor.execute.mockResolvedValue(mockResult(
                0,
                'Mesh is active and deployed'
            ));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: mesh exists but no ID extracted
            expect(result).toEqual({
                apiEnabled: true,
                meshExists: true,
                meshId: undefined,
                meshStatus: 'deployed',
            });
        });
    });

    describe('handles command execution errors', () => {
        it('should detect permission denied (403) as API not enabled', async () => {
            // Given: CLI throws with 403 error
            mockCommandExecutor.execute.mockRejectedValue(new Error('403 Forbidden'));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: treats as API not enabled
            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should detect "forbidden" keyword as API not enabled', async () => {
            // Given: Error with "forbidden" keyword
            mockCommandExecutor.execute.mockRejectedValue(new Error('Access forbidden'));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: API not enabled
            expect(result.apiEnabled).toBe(false);
        });

        it('should detect "not authorized" as API not enabled', async () => {
            // Given: Authorization error
            mockCommandExecutor.execute.mockRejectedValue(new Error('User not authorized'));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: API not enabled
            expect(result.apiEnabled).toBe(false);
        });

        it('should handle "unable to get" in thrown error', async () => {
            // Given: Error with "unable to get mesh config"
            const error = new Error('Unable to get mesh config');
            mockCommandExecutor.execute.mockRejectedValue(error);

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: API not enabled
            expect(result).toEqual({
                apiEnabled: false,
                meshExists: false,
            });
        });

        it('should handle "no mesh found" in thrown error', async () => {
            // Given: Error with "no mesh found" only
            mockCommandExecutor.execute.mockRejectedValue(new Error('No mesh found'));

            // When: fallbackMeshCheck(commandExecutor)
            const result = await fallbackMeshCheck(mockCommandExecutor);

            // Then: API enabled, no mesh
            expect(result).toEqual({
                apiEnabled: true,
                meshExists: false,
            });
        });

        it('should rethrow unknown errors', async () => {
            // Given: Unexpected error
            const unknownError = new Error('Network timeout');
            mockCommandExecutor.execute.mockRejectedValue(unknownError);

            // When/Then: fallbackMeshCheck rethrows
            await expect(fallbackMeshCheck(mockCommandExecutor)).rejects.toThrow('Network timeout');
        });
    });
});
