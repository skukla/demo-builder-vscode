import { fetchDeployedMeshConfig } from '@/features/mesh/services/stalenessDetector';
import {
    setupMockCommandExecutor,
    MOCK_MESH_CONFIG,
    MOCK_DEPLOYED_CONFIG,
} from './stalenessDetector.testUtils';

/**
 * StalenessDetector - File Comparison Tests
 *
 * Tests fetching and parsing deployed mesh configuration:
 * - Fetch deployed mesh config from Adobe I/O
 * - Parse mesh config and extract env vars
 * - Handle authentication failures
 * - Handle network errors and JSON parsing failures
 * - Skip placeholder values in API keys
 *
 * Total tests: 6
 */

describe('StalenessDetector - File Comparison', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchDeployedMeshConfig', () => {
        it('should fetch and parse deployed mesh config', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                {
                    code: 0,
                    stdout: JSON.stringify(MOCK_MESH_CONFIG),
                }
            );

            const result = await fetchDeployedMeshConfig();

            expect(result).toEqual(MOCK_DEPLOYED_CONFIG);
        });

        it('should return null when not authenticated', async () => {
            setupMockCommandExecutor({
                code: 1,
                stdout: '',
                stderr: 'Not authenticated',
            });

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should return null when mesh fetch fails', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                new Error('Network error')
            );

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should return null when JSON parsing fails', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                { code: 0, stdout: 'invalid json' }
            );

            const result = await fetchDeployedMeshConfig();

            expect(result).toBeNull();
        });

        it('should skip API key with context.headers placeholder', async () => {
            const configWithPlaceholder = {
                meshConfig: {
                    sources: [
                        {
                            name: 'catalog',
                            handler: {
                                graphql: {
                                    endpoint: 'https://catalog.example.com',
                                    operationHeaders: {
                                        'x-api-key': "{context.headers['x-api-key']}",
                                    },
                                },
                            },
                        },
                    ],
                },
            };

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                {
                    code: 0,
                    stdout: JSON.stringify(configWithPlaceholder),
                }
            );

            const result = await fetchDeployedMeshConfig();

            expect(result).toEqual({
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
            });
            expect(result?.ADOBE_CATALOG_API_KEY).toBeUndefined();
        });

        it('should handle empty mesh config response', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                {
                    code: 0,
                    stdout: JSON.stringify({ meshConfig: { sources: [] } }),
                }
            );

            const result = await fetchDeployedMeshConfig();

            expect(result).toEqual({});
        });
    });
});
