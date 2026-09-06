// IMPORTANT: Mock must be declared before imports

import { fetchDeployedMeshConfig } from '@/features/mesh/services/stalenessDetector';
import {
    setupMockCommandExecutor,
    MOCK_MESH_CONFIG,
    MOCK_DEPLOYED_CONFIG,
    meshDeps,
} from './stalenessDetector.testUtils';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** One mesh source, shaped exactly as the parser walks it. */
function sourcesResponse(sources: unknown[]): { code: number; stdout: string } {
    return { code: 0, stdout: JSON.stringify({ meshConfig: { sources } }) };
}

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


/**
 * ADR-015 (2026-08-28): `fetchDeployedMeshConfig` receives a logger and its
 * collaborators now — and it IS the exported function, replacing a no-argument
 * wrapper that had zero production callers. The suite passes both explicitly.
 */
const meshLogger = createMockLogger();

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

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual(MOCK_DEPLOYED_CONFIG);
        });

        it('should return null when not authenticated', async () => {
            setupMockCommandExecutor({
                code: 1,
                stdout: '',
                stderr: 'Not authenticated',
            });

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toBeNull();
        });

        it('should return null when mesh fetch fails', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                new Error('Network error')
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toBeNull();
        });

        it('should return null when JSON parsing fails', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                { code: 0, stdout: 'invalid json' }
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

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

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

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

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });
    });
    /**
     * The guard decisions, asserted through what the function does — not through
     * what it logs.
     *
     * The auth pre-check exists to keep a signed-out session from reaching the
     * CLI at all, so the observable claim is that `execute` is never CALLED. A
     * test that only checks the null return passes just as happily when the
     * guard is gone, because the CLI then fails on its own and the catch returns
     * null anyway.
     */
    describe('auth pre-check', () => {
        it('never reaches the CLI when the token is not authenticated', async () => {
            const commandManager = setupMockCommandExecutor({
                code: 1,
                stdout: '',
                stderr: 'Not authenticated',
            });

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toBeNull();
            expect(commandManager.execute).not.toHaveBeenCalled();
        });

        it('never reaches the CLI when the token check itself throws', async () => {
            const commandManager = createMockCommandExecutor();
            meshDeps.commandManager = commandManager;
            meshDeps.authManager = createMockAuthenticationService({
                getTokenStatus: jest.fn().mockRejectedValue(new Error('token file unreadable')),
            });

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toBeNull();
            expect(commandManager.execute).not.toHaveBeenCalled();
        });
    });

    describe('the CLI call it makes', () => {
        it('asks for the ACTIVE mesh as JSON, with the mesh node version and a normal timeout', async () => {
            const commandManager = setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                { code: 0, stdout: JSON.stringify(MOCK_MESH_CONFIG) }
            );

            await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(commandManager.execute).toHaveBeenCalledWith(
                'aio api-mesh:get --active --json',
                expect.objectContaining({
                    timeout: TIMEOUTS.NORMAL,
                    useNodeVersion: expect.any(String),
                })
            );
        });
    });

    /**
     * Every shape below is a mesh response the CLI can really return, and each
     * one separates "this source carries nothing we want" (skip it, keep going)
     * from "reading it blew up" (the catch returns null). Both look like a
     * missing key from the outside; only the return value tells them apart.
     */
    describe('partial mesh responses are skipped, not fatal', () => {
        it('returns an empty map when the response has no meshConfig at all', async () => {
            setupMockCommandExecutor({ code: 0, stdout: '{"org":"test"}' }, { code: 0, stdout: '{}' });

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('returns an empty map when meshConfig carries no sources', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                { code: 0, stdout: JSON.stringify({ meshConfig: {} }) }
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('returns null — not an empty baseline — when the response is not an object', async () => {
            setupMockCommandExecutor({ code: 0, stdout: '{"org":"test"}' }, { code: 0, stdout: '0' });

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toBeNull();
        });

        it('skips a magento source with no handler', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([{ name: 'magento' }])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('skips a magento source whose handler has no graphql block', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([{ name: 'magento', handler: {} }])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('skips a catalog source with no handler', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([{ name: 'catalog' }])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('skips a catalog source whose handler has no graphql block', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([{ name: 'catalog', handler: {} }])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({});
        });

        it('takes a catalog endpoint even when the source carries no operationHeaders', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([
                    {
                        name: 'catalog',
                        handler: { graphql: { endpoint: 'https://catalog.example.com' } },
                    },
                ])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
            });
        });

        it('reads the API key only from the CATALOG source, never from another source that carries headers', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([
                    {
                        name: 'magento',
                        handler: {
                            graphql: {
                                endpoint: 'https://example.com/graphql',
                                operationHeaders: { 'x-api-key': 'a-magento-header-key' },
                            },
                        },
                    },
                ])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });

        it('takes a magento endpoint without looking for headers on it', async () => {
            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                sourcesResponse([
                    {
                        name: 'magento',
                        handler: { graphql: { endpoint: 'https://example.com/graphql' } },
                    },
                ])
            );

            const result = await fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
        });
    });
});
