// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import {
    createStalenessProject,
    createMockProjectWithMesh,
    setupMockFileSystemWithHash,
    meshDeps,
} from './stalenessDetector.testUtils';

/**
 * StalenessDetector - Edge Cases
 *
 * Tests edge cases and error scenarios of change detection:
 * - Detect no changes when state matches
 * - Detect env var changes
 * - Detect source file changes
 * - Handle missing previous state
 *
 * The updateMeshState tests live in meshDeployBaseline.test.ts and the frontend
 * change tests in tests/core/state/projectStateSync.test.ts.
 */


/**
 * ADR-015 (2026-08-28): `detectMeshChanges` receives its collaborators now. The
 * suite passes the fake explicitly at each call site, so a reader sees the
 * real signature.
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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

            expect(result.hasChanges).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return hasChanges=true when no previous state', async () => {
            const project = createStalenessProject({
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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.sourceFilesChanged).toBe(true);
        });

        it('should return no changes when no mesh component', async () => {
            const project = createStalenessProject();

            const result = await detectMeshChanges(project, {}, meshDeps);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });

        it('should ignore PaaS vars from eds-storefront when mesh is ACCS type', async () => {
            // Bug fix: ACCS projects have PaaS vars (ADOBE_CATALOG_API_KEY, etc.)
            // in eds-storefront componentConfigs. The staleness detector must only
            // compare ACCS-relevant env vars for eds-accs-mesh, ignoring PaaS vars.
            const project = createStalenessProject({
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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.changedEnvVars).toStrictEqual([]);
        });

        it('should detect ACCS env var changes for eds-accs-mesh', async () => {
            const project = createStalenessProject({
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

            const result = await detectMeshChanges(project, newConfig, meshDeps);

            expect(result.hasChanges).toBe(true);
            expect(result.envVarsChanged).toBe(true);
            expect(result.changedEnvVars).toContain('ACCS_GRAPHQL_ENDPOINT');
            expect(result.changedEnvVars).not.toContain('ADOBE_COMMERCE_GRAPHQL_ENDPOINT');
        });
    });

});
