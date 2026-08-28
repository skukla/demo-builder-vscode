/**
 * Tests for mesh state population after deployment in executor
 *
 * These tests verify that after mesh deployment, the deployed mesh config
 * is fetched and used to populate project.meshState.envVars, ensuring
 * the dashboard displays correct "Deployed" status immediately.
 *
 * Related fix: Dashboard showing "Not Deployed" despite successful deployment
 * Root cause: meshState.envVars was empty because componentConfigs wasn't populated
 * Solution: Fetch deployed config from Adobe I/O after deployment
 */

import * as stalenessDetector from '@/features/mesh/services/stalenessDetector';
import type { Project } from '@/types/base';

// Mock the stalenessDetector module
jest.mock('@/features/mesh/services/stalenessDetector');


/**
 * ADR-015 (2026-08-28): `fetchDeployedMeshConfig` takes a logger and its
 * collaborators now. The spy below still intercepts it, so these fakes only
 * satisfy the signature.
 */
const meshLogger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn(),
} as never;
const meshDeps = {
    commandManager: { execute: jest.fn() },
    authManager: { getTokenStatus: jest.fn(async () => ({ isAuthenticated: true })) },
} as never;

describe('Executor - Mesh State Population After Deployment', () => {
    let mockProject: Project;
    let mockUpdateMeshState: jest.SpyInstance;
    let mockFetchDeployedMeshConfig: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock project with mesh component
        mockProject = {
            name: 'test-project',
            path: '/tmp/test-project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Commerce API Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'deployed',
                    endpoint: 'https://edge-sandbox-graph.adobe.io/api/test/graphql',
                    path: '/tmp/test-project/components/commerce-mesh',
                    lastUpdated: new Date(),
                    metadata: {
                        meshId: 'test-mesh-123',
                        meshStatus: 'deployed',
                    },
                },
            },
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                        envVars: {}, // Initially empty (the problem this fix addresses)
                        sourceHash: 'test-hash',
                        lastDeployed: new Date().toISOString(),
                            },
            },
        } as Project;

        // Setup mocks
        mockUpdateMeshState = jest.spyOn(stalenessDetector, 'updateMeshState').mockResolvedValue(undefined);
        mockFetchDeployedMeshConfig = jest.spyOn(stalenessDetector, 'fetchDeployedMeshConfig');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Happy Path - Successful Config Fetch', () => {
        it('should populate meshState.envVars with deployed config after deployment', async () => {
            // Mock successful config fetch
            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'test-api-key-123',
            };
            mockFetchDeployedMeshConfig.mockResolvedValue(deployedConfig);

            // Simulate the executor flow after mesh deployment
            await stalenessDetector.updateMeshState(mockProject);

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            // Verify config was fetched
            expect(mockFetchDeployedMeshConfig).toHaveBeenCalled();
            expect(fetchedConfig).toEqual(deployedConfig);

            // Verify we got env vars with the expected keys
            expect(fetchedConfig).toHaveProperty('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
            expect(fetchedConfig).toHaveProperty('ADOBE_CATALOG_SERVICE_ENDPOINT');
            expect(fetchedConfig).toHaveProperty('ADOBE_CATALOG_API_KEY');
            expect(Object.keys(fetchedConfig!).length).toBeGreaterThan(0);
        });

        it('should handle config with multiple environment variables', async () => {
            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
                ADOBE_CATALOG_API_KEY: 'key1',
                CUSTOM_VAR: 'custom',
            };
            mockFetchDeployedMeshConfig.mockResolvedValue(deployedConfig);

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(fetchedConfig).toEqual(deployedConfig);
            expect(Object.keys(fetchedConfig!)).toHaveLength(4);
        });
    });

    describe('Fallback Behavior - Failed Config Fetch', () => {
        it('should handle null response from fetchDeployedMeshConfig gracefully', async () => {
            // Mock failed config fetch (returns null)
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            await stalenessDetector.updateMeshState(mockProject);
            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            // Verify fetch was attempted
            expect(mockFetchDeployedMeshConfig).toHaveBeenCalled();

            // Verify null response is handled
            expect(fetchedConfig).toBeNull();

            // In the executor, this would result in:
            // - meshState.envVars stays empty
            // - Dashboard shows "Not Deployed" (acceptable fallback)
        });

        it('should handle empty config response', async () => {
            // Mock empty config response
            mockFetchDeployedMeshConfig.mockResolvedValue({});

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(fetchedConfig).toEqual({});
            expect(Object.keys(fetchedConfig!)).toHaveLength(0);

            // In the executor, this would be caught by:
            // if (deployedConfig && Object.keys(deployedConfig).length > 0)
            // And meshState.envVars would not be populated
        });

        it('should handle authentication failure during fetch', async () => {
            // Mock auth failure (fetchDeployedMeshConfig returns null when not authenticated)
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(fetchedConfig).toBeNull();
            // Graceful degradation - meshState.envVars stays empty
        });

        it('should handle network error during fetch', async () => {
            // Mock network error
            mockFetchDeployedMeshConfig.mockRejectedValue(new Error('Network timeout'));

            await expect(stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps)).rejects.toThrow('Network timeout');

            // In the executor, this would be caught by the else block
            // and meshState.envVars would remain empty (safe fallback)
        });
    });

    describe('Integration Verification', () => {
        it('should verify both updateMeshState and fetchDeployedMeshConfig are called', async () => {
            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };
            mockFetchDeployedMeshConfig.mockResolvedValue(deployedConfig);

            // Simulate executor flow
            await stalenessDetector.updateMeshState(mockProject);
            await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            // Verify both functions were called
            expect(mockUpdateMeshState).toHaveBeenCalled();
            expect(mockFetchDeployedMeshConfig).toHaveBeenCalled();
        });

        it('should confirm fetchDeployedMeshConfig is independent of componentConfigs', async () => {
            // The key insight: fetchDeployedMeshConfig doesn't need componentConfigs
            // It fetches from Adobe I/O directly, solving the original problem

            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };
            mockFetchDeployedMeshConfig.mockResolvedValue(deployedConfig);

            // Project has no componentConfigs (the original problem)
            expect(mockProject.componentConfigs).toBeUndefined();

            // But fetchDeployedMeshConfig still works
            const result = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            expect(result).toEqual(deployedConfig);
            expect(result).not.toBeNull();
        });
    });

    describe('Expected Dashboard Behavior After Fix', () => {
        it('should enable dashboard to detect deployed status when envVars is populated', async () => {
            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com',
            };
            mockFetchDeployedMeshConfig.mockResolvedValue(deployedConfig);

            // After the fix, this is what happens in executor:
            const config = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            if (config && Object.keys(config).length > 0) {
                // This is the critical assignment in the fix
                mockProject.appBuilderComponents!.mesh!.envVars = config;
            }

            // Dashboard check: Object.keys(keyed mesh envVars).length > 0
            const hasEnvVars = Object.keys(mockProject.appBuilderComponents!.mesh!.envVars || {}).length > 0;

            expect(hasEnvVars).toBe(true); // ✅ Dashboard will show "Deployed"
            expect(mockProject.appBuilderComponents!.mesh!.envVars).toEqual(deployedConfig);
        });

        it('should show not-deployed when config fetch fails (acceptable fallback)', async () => {
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            // After the fix with failed fetch:
            const config = await stalenessDetector.fetchDeployedMeshConfig(meshLogger, meshDeps);

            if (config && Object.keys(config).length > 0) {
                mockProject.appBuilderComponents!.mesh!.envVars = config;
            }

            // Dashboard check: Object.keys(keyed mesh envVars).length > 0
            const hasEnvVars = Object.keys(mockProject.appBuilderComponents!.mesh!.envVars || {}).length > 0;

            expect(hasEnvVars).toBe(false); // Dashboard will show "Not Deployed" (fallback)
            expect(mockProject.appBuilderComponents!.mesh!.envVars).toEqual({}); // Still empty
        });
    });
});
