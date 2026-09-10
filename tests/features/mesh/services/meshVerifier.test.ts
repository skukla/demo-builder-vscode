import { recordDeployOutcome } from '@/features/app-builder/services/appBuilderDeployOutcome';
import { getMeshEndpointUrl } from '@/types/typeGuards';
import {
    createMockProject,
    setupMeshVerifier,
    syncMeshStatus,
    verifyMeshDeployment,
    type MeshCommandExecutorFake,
} from './meshVerifier.testUtils';
import { createSuccessResult, createFailureResult } from '../../../helpers/commandResultFake';

/**
 * MeshVerifier Test Suite
 *
 * Tests mesh deployment verification with Adobe I/O:
 * - Mesh existence checking
 * - Mesh ID validation
 * - Endpoint extraction
 * - Error handling
 * - Project state synchronization
 *
 * Total tests: 17
 */

// Mock dependencies



describe('MeshVerifier', () => {
    let mockCommandManager: MeshCommandExecutorFake;

    beforeEach(() => {
        ({ mockCommandManager } = setupMeshVerifier());
    });

    describe('verifyMeshDeployment', () => {
        it('should verify mesh exists with valid response', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: mesh123\nEndpoint: https://example.com/graphql'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should parse JSON response format', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult(JSON.stringify({
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                })));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
            expect(result.data?.endpoint).toBe('https://example.com/graphql');
        });

        it('should return exists=false when no mesh component', async () => {
            const project = createMockProject();

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(false);
        });

        it('should return error when no mesh ID in metadata', async () => {
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

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No mesh ID found');
        });

        it('should handle command failure', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createFailureResult('Mesh not found'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Mesh not found');
        });

        it('should detect mesh ID mismatch', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult('meshId: abc456\nendpoint: https://example.com/graphql'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(false);
            expect(result.error).toContain('mismatch');
        });

        it('should handle command exception', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockRejectedValue(new Error('Network error'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });

        it('should use project meshId when regex fails', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            // Use stdout that doesn't contain mesh ID pattern at all
            // Avoid "mesh ID" text followed by hex chars which could false-positive match
            mockCommandManager.execute.mockResolvedValue(createSuccessResult('API configuration loaded successfully\nGraphQL URL: https://example.com/graphql'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(true);
            expect(result.data?.meshId).toBe('mesh123');
        });

        it('should handle missing endpoint gracefully', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
            });

            mockCommandManager.execute.mockResolvedValue(createSuccessResult('Mesh ID: mesh123'));

            const result = await verifyMeshDeployment(project, mockCommandManager);

            expect(result.success).toBe(true);
            expect(result.data?.exists).toBe(true);
            expect(result.data?.endpoint).toBeUndefined();
        });
    });

    describe('syncMeshStatus', () => {
        it('should update project status when mesh exists', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'ready',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01',
                                    },
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                    endpoint: 'https://example.com/graphql',
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
        });

        it('should clear meshState when mesh does not exist', async () => {
            const project = createMockProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        subType: 'mesh',
                        path: '/test/mesh',
                        status: 'deployed',
                        metadata: {
                            meshId: 'mesh123',
                        },
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                            envVars: {},
                            sourceHash: 'abc123',
                            lastDeployed: '2024-01-01',
                                    },
                },
            });

            const verificationResult = {
                success: true,
                data: {
                    exists: false,
                },
            };

            await syncMeshStatus(project, verificationResult);

            expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
        });

        it('should do nothing when no mesh component', async () => {
            const project = createMockProject();

            const verificationResult = {
                success: true,
                data: {
                    exists: true,
                    meshId: 'mesh123',
                },
            };

            await syncMeshStatus(project, verificationResult);

            // Should not throw
            expect(project.appBuilderComponents).toBeUndefined();
        });

        // ADR-011 D3 Steps 07+09: the deployment record lives on the keyed mesh
        // entry — sync must clear/read the keyed entry for keyed-only projects.
        describe('keyed appBuilderComponents handling (Steps 07+09)', () => {
            const meshInstances = {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'API Mesh',
                    subType: 'mesh' as const,
                    path: '/test/mesh',
                    status: 'deployed' as const,
                    metadata: { meshId: 'mesh123' },
                },
            };

            it('should mark the keyed mesh entry not-deployed and preserve identity fields when the mesh does not exist remotely', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'deployed',
                            name: 'API Mesh',
                            source: { owner: 'adobe', repo: 'commerce-mesh' },
                            endpoint: 'https://keyed-mesh/graphql',
                            envVars: { A: '1' },
                            lastDeployed: '2024-01-01T00:00:00.000Z',
                            sourceHash: 'abc123',
                            providesEnvVars: { MESH_ENDPOINT: 'https://keyed-mesh/graphql' },
                        },
                    },
                });

                await syncMeshStatus(project, { success: true, data: { exists: false } });

                const entry = project.appBuilderComponents?.mesh;
                // Entry SURVIVES — identity fields intact
                expect(entry).toBeDefined();
                expect(entry?.kind).toBe('mesh');
                expect(entry?.name).toBe('API Mesh');
                expect(entry?.source).toEqual({ owner: 'adobe', repo: 'commerce-mesh' });
                expect(entry?.providesEnvVars).toEqual({
                    MESH_ENDPOINT: 'https://keyed-mesh/graphql',
                });
                // Volatile deploy record cleared
                expect(entry?.status).toBe('not-deployed');
                expect(entry?.endpoint).toBeUndefined();
                expect(entry?.envVars).toBeUndefined();
                expect(entry?.lastDeployed).toBeUndefined();
                expect(entry?.sourceHash).toBeUndefined();
                // Accessor consumers treat it as "no mesh endpoint"
                expect(getMeshEndpointUrl(project)).toBeUndefined();
                expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
            });

            it('should re-land a redeploy on the SAME entry with providesEnvVars intact after sync-gone', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: 'adobe', repo: 'commerce-mesh' },
                            endpoint: 'https://old-mesh/graphql',
                            providesEnvVars: { MESH_ENDPOINT: 'https://old-mesh/graphql' },
                        },
                    },
                });

                await syncMeshStatus(project, { success: true, data: { exists: false } });

                // Redeploy lands via the writer chokepoint (recordDeployOutcome,
                // keyed by the mesh component-instance id — resolves to 'mesh').
                recordDeployOutcome(project, 'mesh', 'commerce-mesh', {
                    status: 'deployed',
                    endpoint: 'https://new-mesh/graphql',
                    envVars: { A: '2' },
                });

                const keys = Object.keys(project.appBuilderComponents ?? {}).filter(
                    (id) => project.appBuilderComponents?.[id].kind === 'mesh',
                );
                expect(keys).toEqual(['mesh']);
                const entry = project.appBuilderComponents?.mesh;
                expect(entry?.status).toBe('deployed');
                expect(entry?.endpoint).toBe('https://new-mesh/graphql');
                expect(entry?.providesEnvVars).toEqual({
                    MESH_ENDPOINT: 'https://new-mesh/graphql',
                });
            });

            it('should not promote the component to deployed from a not-deployed keyed entry', async () => {
                const project = createMockProject({
                    componentInstances: {
                        'commerce-mesh': { ...meshInstances['commerce-mesh'], status: 'ready' },
                    },
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'not-deployed',
                            source: { owner: 'adobe', repo: 'commerce-mesh' },
                            providesEnvVars: { MESH_ENDPOINT: 'https://old-mesh/graphql' },
                        },
                    },
                });

                await syncMeshStatus(project, {
                    success: true,
                    data: { exists: true, meshId: 'mesh123' },
                });

                // A surviving not-deployed entry is NOT a deployment record.
                expect(project.componentInstances?.['commerce-mesh'].status).toBe('ready');
            });

            it('should mark the component deployed from a keyed-only deployment record', async () => {
                const project = createMockProject({
                    componentInstances: {
                        'commerce-mesh': { ...meshInstances['commerce-mesh'], status: 'ready' },
                    },
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: '', repo: '' },
                            endpoint: 'https://keyed-mesh/graphql',
                        },
                    },
                });

                await syncMeshStatus(project, {
                    success: true,
                    data: { exists: true, meshId: 'mesh123' },
                });

                expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
            });

            it('should not touch keyed integration siblings when clearing the mesh entry', async () => {
                const project = createMockProject({
                    componentInstances: meshInstances,
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: '', repo: '' },
                        },
                        'acme-widget': {
                            kind: 'integration',
                            status: 'deployed',
                            source: { owner: 'acme', repo: 'widget' },
                            url: 'https://acme.example',
                        },
                    },
                });

                await syncMeshStatus(project, { success: true, data: { exists: false } });

                expect(project.appBuilderComponents?.['acme-widget']?.url).toBe(
                    'https://acme.example',
                );
            });
        });

        it('should do nothing on verification failure', async () => {
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

            const verificationResult = {
                success: false,
                error: 'Verification failed',
            };

            await syncMeshStatus(project, verificationResult);

            // Should not modify project status
            expect(project.componentInstances?.['commerce-mesh'].status).toBe('deployed');
        });
    });
});
