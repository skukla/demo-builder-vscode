// IMPORTANT: Mock must be declared before imports

import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import {
    createStalenessProject,
    setupMockCommandExecutor,
    setupMockFileSystemWithHash,
    meshDeps,
} from './stalenessDetector.testUtils';
import type { Project } from '@/types/base';

/**
 * StalenessDetector - State Detection Tests
 *
 * Tests unknown deployed state handling:
 * - Detect unknown deployed state when fetch fails
 * - Populate baseline mesh state when fetch succeeds
 * - Handle scenarios where mesh is not deployed
 *
 * The getCurrentMeshState tests live in meshDeployBaseline.test.ts.
 */


/**
 * ADR-015 (2026-08-28): `detectMeshChanges` receives its collaborators now. The
 * suite passes the fake explicitly at each call site, so a reader sees the
 * real signature.
 */

describe('StalenessDetector - State Detection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('detectMeshChanges - unknownDeployedState handling', () => {
        it('should return unknownDeployedState=true and hasChanges=false when fetch fails (timeout)', async () => {
            const project = createStalenessProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
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
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '',
                    },
                },
            });

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                new Error('Timeout')
            );

            const result = await detectMeshChanges(project, {}, meshDeps);

            expect(result.unknownDeployedState).toBe(true);
            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
        });

        it('should populate the keyed entry envVars and set shouldSaveProject when fetch succeeds (keyed-only)', async () => {
            const project: Project = createStalenessProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                    },
                },
                // Post-Step-07 shape: the deployment record lives on the keyed
                // entry only (empty envVars = baseline never captured).
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://example.com/graphql',
                        envVars: {},
                        sourceHash: null,
                    },
                },
            });

            const deployedConfig = {
                ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
            };

            setupMockCommandExecutor(
                { code: 0, stdout: '{"org":"test"}' },
                {
                    code: 0,
                    stdout: JSON.stringify({
                        meshConfig: {
                            sources: [
                                {
                                    name: 'magento',
                                    handler: {
                                        graphql: {
                                            endpoint: 'https://example.com/graphql',
                                        },
                                    },
                                },
                            ],
                        },
                    }),
                }
            );

            setupMockFileSystemWithHash('hash123');

            const newConfig = {
                'commerce-mesh': {
                    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: 'https://example.com/graphql',
                },
            };

            const result = await detectMeshChanges(project, newConfig, meshDeps);

            expect(result.shouldSaveProject).toBe(true);
            expect(result.hasChanges).toBe(false);
            expect(result.unknownDeployedState).toBeUndefined();
            expect(project.appBuilderComponents?.mesh?.envVars).toEqual(deployedConfig);
        });

        it('should handle an empty keyed baseline with fetch returning null (no mesh deployed)', async () => {
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
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'not-deployed',
                        source: { owner: '', repo: '' },
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: '',
                    },
                },
            });

            setupMockCommandExecutor({
                code: 1,
                stdout: '',
                stderr: 'Not authenticated',
            });

            const result = await detectMeshChanges(project, {}, meshDeps);

            expect(result.unknownDeployedState).toBe(true);
            expect(result.hasChanges).toBe(false);
        });

        it('should handle missing mesh component gracefully', async () => {
            const project = createStalenessProject();

            const result = await detectMeshChanges(project, {}, meshDeps);

            expect(result.hasChanges).toBe(false);
            expect(result.envVarsChanged).toBe(false);
            expect(result.sourceFilesChanged).toBe(false);
        });
    });
});
