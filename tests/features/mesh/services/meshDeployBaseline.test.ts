// IMPORTANT: Mock must be declared before imports
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

jest.mock('crypto', () => ({
    createHash: jest.fn(),
}));

import {
    getCurrentMeshState,
    updateMeshState,
} from '@/features/mesh/services/meshDeployBaseline';
import {
    createStalenessProject,
    setupMockFileSystemWithHash,
} from './stalenessDetector.testUtils';

/**
 * meshDeployBaseline — the record of what was deployed.
 *
 * `updateMeshState` writes it onto the keyed mesh entry after every deploy;
 * `getCurrentMeshState` reads it back for the staleness check. Moved here from
 * the stalenessDetector suites when the file was split by job (EDS-8).
 */

const MESH_INSTANCES = {
    'commerce-mesh': {
        id: 'commerce-mesh',
        name: 'API Mesh',
        subType: 'mesh' as const,
        path: '/test/mesh',
        status: 'deployed' as const,
    },
};

describe('meshDeployBaseline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const fs = require('fs/promises');
        const crypto = require('crypto');
        jest.mocked(fs.readFile).mockReset();
        jest.mocked(fs.readdir).mockReset();
        jest.mocked(crypto.createHash).mockReset();
    });

    describe('getCurrentMeshState', () => {
        it('should return mesh state from project', () => {
            const project = createStalenessProject({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        envVars: { VAR1: 'value1' },
                        sourceHash: 'abc123',
                        lastDeployed: '2024-01-01T00:00:00Z',
                    },
                },
            });

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: { VAR1: 'value1' },
                sourceHash: 'abc123',
                lastDeployed: new Date('2024-01-01T00:00:00Z'),
            });
        });

        it('should return null when no mesh state', () => {
            const project = createStalenessProject();

            const result = getCurrentMeshState(project);

            expect(result).toBeNull();
        });

        it('should handle partial mesh state', () => {
            const project = createStalenessProject({
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

            const result = getCurrentMeshState(project);

            expect(result).toEqual({
                envVars: {},
                sourceHash: null,
                lastDeployed: null,
            });
        });

        // The deployed baseline reads from the keyed mesh appBuilderComponents
        // entry — the only carrier since PL-1 phase 2.
        describe('keyed-first read (ADR-011 D3 Step 06)', () => {
            it('should read envVars/sourceHash/lastDeployed from the keyed mesh entry (keyed-only)', () => {
                const project = createStalenessProject({
                    appBuilderComponents: {
                        'commerce-mesh': {
                            kind: 'mesh',
                            status: 'deployed',
                            source: { owner: '', repo: '' },
                            endpoint: 'https://mesh/graphql',
                            envVars: { VAR1: 'keyed-value' },
                            sourceHash: 'keyed-hash',
                            lastDeployed: '2026-07-01T00:00:00Z',
                        },
                    },
                });

                const result = getCurrentMeshState(project);

                expect(result).toEqual({
                    envVars: { VAR1: 'keyed-value' },
                    sourceHash: 'keyed-hash',
                    lastDeployed: new Date('2026-07-01T00:00:00Z'),
                });
            });

            it('should return null for an undeployed keyed entry with no runtime fields (fresh-deploy semantics)', () => {
                const project = createStalenessProject({
                    appBuilderComponents: {
                        mesh: {
                            kind: 'mesh',
                            status: 'not-deployed',
                            source: { owner: '', repo: '' },
                        },
                    },
                });

                expect(getCurrentMeshState(project)).toBeNull();
            });
        });
    });

    describe('getCurrentMeshState — what counts as deployment evidence', () => {
        it('reports state from a sourceHash alone, with no envVars and no lastDeployed', () => {
            const project = createStalenessProject({
                componentInstances: MESH_INSTANCES,
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        sourceHash: 'abc123',
                    },
                },
            });

            expect(getCurrentMeshState(project)).toEqual({
                envVars: {},
                sourceHash: 'abc123',
                lastDeployed: null,
            });
        });
    });

    describe('updateMeshState', () => {
        it('should update mesh state after deployment (keyed entry; legacy write retired, Step 07)', async () => {
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
            const project = createStalenessProject();

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
                const project = createStalenessProject({ componentInstances: meshInstances });
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
                const project = createStalenessProject({
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
                const project = createStalenessProject({
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
                const project = createStalenessProject({
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
});
