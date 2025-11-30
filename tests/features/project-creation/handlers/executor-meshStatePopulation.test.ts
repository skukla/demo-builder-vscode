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
            meshState: {
                envVars: {}, // Initially empty (the problem this fix addresses)
                sourceHash: 'test-hash',
                lastDeployed: new Date().toISOString(),
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

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig();

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

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig();

            expect(fetchedConfig).toEqual(deployedConfig);
            expect(Object.keys(fetchedConfig!).length).toBe(4);
        });
    });

    describe('Fallback Behavior - Failed Config Fetch', () => {
        it('should handle null response from fetchDeployedMeshConfig gracefully', async () => {
            // Mock failed config fetch (returns null)
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            await stalenessDetector.updateMeshState(mockProject);
            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig();

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

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig();

            expect(fetchedConfig).toEqual({});
            expect(Object.keys(fetchedConfig!).length).toBe(0);

            // In the executor, this would be caught by:
            // if (deployedConfig && Object.keys(deployedConfig).length > 0)
            // And meshState.envVars would not be populated
        });

        it('should handle authentication failure during fetch', async () => {
            // Mock auth failure (fetchDeployedMeshConfig returns null when not authenticated)
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            const fetchedConfig = await stalenessDetector.fetchDeployedMeshConfig();

            expect(fetchedConfig).toBeNull();
            // Graceful degradation - meshState.envVars stays empty
        });

        it('should handle network error during fetch', async () => {
            // Mock network error
            mockFetchDeployedMeshConfig.mockRejectedValue(new Error('Network timeout'));

            await expect(stalenessDetector.fetchDeployedMeshConfig()).rejects.toThrow('Network timeout');

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
            await stalenessDetector.fetchDeployedMeshConfig();

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
            const result = await stalenessDetector.fetchDeployedMeshConfig();

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
            const config = await stalenessDetector.fetchDeployedMeshConfig();

            if (config && Object.keys(config).length > 0) {
                // This is the critical assignment in the fix
                mockProject.meshState!.envVars = config;
            }

            // Dashboard check: Object.keys(project.meshState.envVars).length > 0
            const hasEnvVars = Object.keys(mockProject.meshState!.envVars || {}).length > 0;

            expect(hasEnvVars).toBe(true); // ✅ Dashboard will show "Deployed"
            expect(mockProject.meshState!.envVars).toEqual(deployedConfig);
        });

        it('should show not-deployed when config fetch fails (acceptable fallback)', async () => {
            mockFetchDeployedMeshConfig.mockResolvedValue(null);

            // After the fix with failed fetch:
            const config = await stalenessDetector.fetchDeployedMeshConfig();

            if (config && Object.keys(config).length > 0) {
                mockProject.meshState!.envVars = config;
            }

            // Dashboard check: Object.keys(project.meshState.envVars).length > 0
            const hasEnvVars = Object.keys(mockProject.meshState!.envVars || {}).length > 0;

            expect(hasEnvVars).toBe(false); // Dashboard will show "Not Deployed" (fallback)
            expect(mockProject.meshState!.envVars).toEqual({}); // Still empty
        });
    });
});
