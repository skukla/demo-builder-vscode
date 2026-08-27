// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

jest.mock('@/core/state', () => ({
    getFrontendEnvVars: jest.fn(),
}));

jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

import {
    detectMeshChanges,
    updateMeshState,
    detectFrontendChanges,
} from '@/features/mesh/services/stalenessDetector';
import {
    createMockProject,
    createMockProjectWithMesh,
    createMockProjectWithFrontend,
    setupMockFileSystemWithHash,
} from './stalenessDetector.testUtils';

/**
 * StalenessDetector - Edge Cases and Frontend Changes
 *
 * Tests edge cases, error scenarios, and frontend change detection:
 * - Detect no changes when state matches
 * - Detect env var changes
 * - Detect source file changes
 * - Handle missing previous state
 * - Update mesh state after deployment
 * - Detect frontend env var changes
 * - Handle missing frontend component
 *
 * Total tests: 9
 */

describe('StalenessDetector - Edge Cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Re-setup mock implementations
        const fs = require('fs/promises');
        const crypto = require('crypto');

        jest.mocked(fs.readFile).mockReset();
        jest.mocked(fs.readdir).mockReset();
        jest.mocked(crypto.createHash).mockReset();
    });

    describe('detectMeshChanges - change detection', () => {
        it('should detect no changes when state matches', async () => {
            const project = createMockProjectWithMesh();

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });

        it('should detect env var changes', async () => {
            const project = createMockProjectWithMesh({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {
                                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://old.com/graphql',
                            },
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01T00:00:00Z',
                                    },
                },
            });

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://new.com/graphql',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('should detect env var changes from cross-boundary component configs (e.g., backend component)', async () => {
            // Bug fix verification: Mesh env vars like ADOBE_COMMERCE_GRAPHQL_ENDPOINT
            // are stored under the backend component (adobe-commerce-paas), not the mesh component.
            // detectMeshChanges must look across ALL componentConfigs to find changes.
            const project = createMockProjectWithMesh({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {
                                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://old.com/graphql',
                            },
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01T00:00:00Z',
                                    },
                },
            });

            // Env var stored under backend component, not mesh component (cross-boundary)
            const newConfig = {
                'adobe-commerce-paas': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://new.com/graphql',
                },
                'commerce-mesh': {
                    // Empty - mesh component doesn't store these env vars
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });

        it('should detect source file changes', async () => {
            const project = createMockProjectWithMesh();

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            setupMockFileSystemWithHash('xyz789', 'different content');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return hasChanges=true when no previous state', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'ready',
                    },
                },
            });

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return no changes when no mesh component', async () => {
            const project = createMockProject();

            const result = await detectMeshChanges(project, {});

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });

        it('should ignore PaaS vars from eds-storefront when mesh is ACCS type', async () => {
            // Bug fix: ACCS projects have PaaS vars (ADOBE_CATALOG_API_KEY, etc.)
            // in eds-storefront componentConfigs. The staleness detector must only
            // compare ACCS-relevant env vars for eds-accs-mesh, ignoring PaaS vars.
            const project = createMockProject({
                componentInstances: {
                    'eds-accs-mesh': {
                        id: 'eds-accs-mesh',
                        name: 'ACCS API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {
                                ACCS_GRAPHQL_ENDPOINT: 'https://accs.example.com/graphql',
                                ACCS_WEBSITE_CODE: 'base',
                                ACCS_STORE_CODE: 'main_store',
                                ACCS_STORE_VIEW_CODE: 'default',
                                ACCS_CUSTOMER_GROUP: 'abc123',
                            },
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01T00:00:00Z',
                                    },
                },
            });

            // componentConfigs include PaaS vars from eds-storefront (should be ignored)
            const newConfig = {
                'eds-storefront': {
                    ADOBE_CATALOG_API_KEY: 'some-api-key',
                    ADOBE_COMMERCE_ENVIRONMENT_ID: 'some-env-id',
                    ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
                    ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
                    ADOBE_COMMERCE_STORE_CODE: 'citisignal_store',
                },
                'eds-accs-mesh': {
                    ACCS_GRAPHQL_ENDPOINT: 'https://accs.example.com/graphql',
                    ACCS_WEBSITE_CODE: 'base',
                    ACCS_STORE_CODE: 'main_store',
                    ACCS_STORE_VIEW_CODE: 'default',
                    ACCS_CUSTOMER_GROUP: 'abc123',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.changedEnvVars).toEqual([]);
        });

        it('should detect ACCS env var changes for eds-accs-mesh', async () => {
            const project = createMockProject({
                componentInstances: {
                    'eds-accs-mesh': {
                        id: 'eds-accs-mesh',
                        name: 'ACCS API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {
                                ACCS_GRAPHQL_ENDPOINT: 'https://old.accs.example.com/graphql',
                                ACCS_WEBSITE_CODE: 'base',
                                ACCS_STORE_CODE: 'main_store',
                                ACCS_STORE_VIEW_CODE: 'default',
                            },
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01T00:00:00Z',
                                    },
                },
            });

            const newConfig = {
                'eds-accs-mesh': {
                    ACCS_GRAPHQL_ENDPOINT: 'https://new.accs.example.com/graphql',
                    ACCS_WEBSITE_CODE: 'base',
                    ACCS_STORE_CODE: 'main_store',
                    ACCS_STORE_VIEW_CODE: 'default',
                },
            };

            setupMockFileSystemWithHash('abc123');

            const result = await detectMeshChanges(project, newConfig);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ACCS_GRAPHQL_ENDPOINT');
            expect(result.changedEnvVars).not.toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });
    });

    describe('updateMeshState', () => {
        it('should update mesh state after deployment (keyed entry; legacy write retired, Step 07)', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
            });

            // Now reads from .env file instead of componentConfigs
            const envFileContent = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql\n';
            setupMockFileSystemWithHash('abc123', envFileContent);

            await updateMeshState(project);

            const mesh = project.appBuilderComponents?.['commerce-mesh'];
            expect(mesh).toBeDefined();
            expect(mesh?.envVars).toEqual({
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            });
            expect(mesh?.sourceHash).toBe('abc123');
            expect(mesh?.lastDeployed).toBeDefined();
        });

        it('should do nothing when no mesh component', async () => {
            const project = createMockProject();

            await updateMeshState(project);

            expect(project.appBuilderComponents).toBeUndefined();
        });

        // ADR-011 D3 Steps 07+09: updateMeshState is the single writer chokepoint
        // shared by the creation-time deploy (meshSetupService), the reset-time
        // redeploys (edsResetMeshHelper, projectResetService) and deployMeshHeadless.
        // It must land the deploy outcome on the KEYED mesh appBuilderComponents
        // entry — the durable model — so every caller is covered at once.
        describe('keyed appBuilderComponents write (writer chokepoint, D3 Steps 07+09)', () => {
            const meshInstances = {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    subType: 'mesh' as const,
                    path: '/test/mesh',
                    status: 'deployed' as const,
                },
            };

            it('should write the full deploy outcome onto the keyed mesh entry', async () => {
                const project = createMockProject({ componentInstances: meshInstances });
                const envFileContent = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://example.com/graphql\n';
                setupMockFileSystemWithHash('abc123', envFileContent);

                await updateMeshState(project, 'https://mesh/graphql');

                const entries = Object.values(project.appBuilderComponents ?? {});
                const mesh = entries.find((e) => e.kind === 'mesh');
                expect(mesh).toBeDefined();
                expect(mesh?.status).toBe('deployed');
                expect(mesh?.endpoint).toBe('https://mesh/graphql');
                expect(mesh?.envVars).toEqual({
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                });
                expect(mesh?.sourceHash).toBe('abc123');
                expect(mesh?.lastDeployed).toBeDefined();
            });

            it('should land on the migrated "mesh" key instead of creating a twin', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'not-deployed',
                            source: { owner: '', repo: '' },
                        },
                    },
                });
                setupMockFileSystemWithHash('abc123', 'A=1\n');

                await updateMeshState(project, 'https://mesh/graphql');

                const meshEntries = Object.entries(project.appBuilderComponents ?? {}).filter(
                    ([, e]) => e.kind === 'mesh',
                );
                expect(meshEntries).toHaveLength(1);
                expect(meshEntries[0][0]).toBe('mesh');
                expect(meshEntries[0][1].endpoint).toBe('https://mesh/graphql');
            });

            it('should clear a previous "Later" decline on the keyed entry', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'stale',
                            source: { owner: '', repo: '' },
                            userDeclinedUpdate: true,
                            declinedAt: '2026-07-14T00:00:00.000Z',
                        },
                    },
                });
                setupMockFileSystemWithHash('abc123', 'A=1\n');

                await updateMeshState(project, 'https://mesh/graphql');

                const mesh = project.appBuilderComponents?.mesh;
                expect(mesh?.userDeclinedUpdate).toBeUndefined();
                expect(mesh?.declinedAt).toBeUndefined();
                expect(mesh?.status).toBe('deployed');
            });

            it('should refresh a provided MESH_ENDPOINT with the fresh endpoint', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: '', repo: '' },
                            providesEnvVars: { MESH_ENDPOINT: 'https://old-mesh/graphql' },
                        },
                    },
                });
                setupMockFileSystemWithHash('abc123', 'A=1\n');

                await updateMeshState(project, 'https://new-mesh/graphql');

                expect(project.appBuilderComponents?.mesh?.providesEnvVars).toEqual({
                    MESH_ENDPOINT: 'https://new-mesh/graphql',
                });
            });
        });
    });

    describe('detectFrontendChanges', () => {
        beforeEach(() => {
            const { getFrontendEnvVars } = require('@/core/state');
            getFrontendEnvVars.mockClear();
        });

        it('should detect frontend env var changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://new.com',
                OTHER_VAR: 'value',
            });

            const project = createMockProjectWithFrontend({
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://new.com',
                        OTHER_VAR: 'value',
                    },
                },
                frontendEnvState: {
                    envVars: {
                        MESH_ENDPOINT: 'https://old.com',
                        OTHER_VAR: 'value',
                    },
                    capturedAt: '2024-01-01T00:00:00Z',
                },
            });

            const result = detectFrontendChanges(project);

            expect(result).toBe(true);
        });

        it('should return false when no changes', () => {
            const { getFrontendEnvVars } = require('@/core/state');

            getFrontendEnvVars.mockReturnValue({
                MESH_ENDPOINT: 'https://example.com',
                OTHER_VAR: 'value',
            });

            const project = createMockProjectWithFrontend({
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://example.com',
                        OTHER_VAR: 'value',
                    },
                },
                frontendEnvState: {
                    envVars: {
                        MESH_ENDPOINT: 'https://example.com',
                        OTHER_VAR: 'value',
                    },
                    capturedAt: '2024-01-01T00:00:00Z',
                },
            });

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });

        it('should return false when no frontend component', () => {
            const project = createMockProject();

            const result = detectFrontendChanges(project);

            expect(result).toBe(false);
        });
    });
});
