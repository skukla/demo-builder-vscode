/**
 * Deployable State Accessor Tests (Step 01)
 *
 * Pure accessors over the keyed `project.deployables` map. In D1 these
 * READ THROUGH to the legacy singular `meshState`/`appState` so there is
 * no behavioral change yet — legacy state stays authoritative.
 */

import {
    getDeployable,
    listDeployables,
    setDeployable,
    getMeshDeployable,
    getIntegrationDeployables,
    getProvidedEnvVars,
    isDeployableState,
} from '@/features/app-builder/services/deployableState';
import type { Project, DeployableState } from '@/types/base';

/** Minimal Project for accessor testing. */
function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/tmp/demo',
        status: 'stopped',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    };
}

function makeDeployable(overrides: Partial<DeployableState> = {}): DeployableState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
        ...overrides,
    };
}

describe('deployableState accessors', () => {
    describe('getDeployable', () => {
        it('should return undefined when deployables is absent', () => {
            const project = makeProject();
            expect(getDeployable(project, 'mesh')).toBeUndefined();
        });

        it('should return the entry when present in project.deployables', () => {
            const entry = makeDeployable();
            const project = makeProject({ deployables: { mesh: entry } });
            expect(getDeployable(project, 'mesh')).toEqual(entry);
        });
    });

    describe('getMeshDeployable (read-through)', () => {
        it('should synthesize a mesh deployable from meshState when deployables absent', () => {
            const project = makeProject({
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://edge-graph.adobe.io/api/x/graphql',
                },
            });

            const mesh = getMeshDeployable(project);

            expect(mesh).toBeDefined();
            expect(mesh?.kind).toBe('mesh');
            expect(mesh?.status).toBe('deployed');
            expect(mesh?.endpoint).toBe('https://edge-graph.adobe.io/api/x/graphql');
            expect(mesh?.sourceHash).toBe('abc123');
            expect(mesh?.lastDeployed).toBe('2026-06-20T00:00:00.000Z');
        });

        it('should prefer the keyed deployables entry over meshState', () => {
            const keyed = makeDeployable({ endpoint: 'https://keyed.example/graphql' });
            const project = makeProject({
                deployables: { mesh: keyed },
                meshState: {
                    envVars: {},
                    sourceHash: 'legacy',
                    lastDeployed: '2026-01-01T00:00:00.000Z',
                    endpoint: 'https://legacy.example/graphql',
                },
            });

            expect(getMeshDeployable(project)?.endpoint).toBe('https://keyed.example/graphql');
        });

        it('should return undefined when neither deployables nor meshState exist', () => {
            expect(getMeshDeployable(makeProject())).toBeUndefined();
        });
    });

    describe('getIntegrationDeployables (read-through)', () => {
        it('should synthesize an integration deployable from appState when deployables absent', () => {
            const project = makeProject({
                appState: {
                    appId: 'erp',
                    url: 'https://erp.example/api',
                    status: 'deployed',
                    deployedUrls: { ping: 'https://erp.example/ping' },
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    sourceHash: 'def456',
                },
            });

            const integrations = getIntegrationDeployables(project);

            expect(integrations).toHaveLength(1);
            expect(integrations[0].kind).toBe('integration');
            expect(integrations[0].status).toBe('deployed');
            expect(integrations[0].url).toBe('https://erp.example/api');
            expect(integrations[0].deployedUrls).toEqual({ ping: 'https://erp.example/ping' });
            expect(integrations[0].sourceHash).toBe('def456');
        });

        it('should return an empty array when no appState and no keyed integrations', () => {
            expect(getIntegrationDeployables(makeProject())).toEqual([]);
        });
    });

    describe('listDeployables', () => {
        it('should merge keyed deployables with read-through singletons without duplicate ids', () => {
            const project = makeProject({
                deployables: {
                    'erp-integration': makeDeployable({ kind: 'integration', url: 'https://erp/api' }),
                },
                meshState: {
                    envVars: {},
                    sourceHash: 'abc',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                },
            });

            const all = listDeployables(project);
            const ids = all.map(d => d.id);

            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toContain('erp-integration');
            expect(ids).toContain('mesh');
        });

        it('should not duplicate the mesh when both keyed and meshState exist', () => {
            const project = makeProject({
                deployables: { mesh: makeDeployable({ endpoint: 'https://keyed/graphql' }) },
                meshState: {
                    envVars: {},
                    sourceHash: 'legacy',
                    lastDeployed: '2026-01-01T00:00:00.000Z',
                    endpoint: 'https://legacy/graphql',
                },
            });

            const meshEntries = listDeployables(project).filter(d => d.id === 'mesh');
            expect(meshEntries).toHaveLength(1);
            expect(meshEntries[0].endpoint).toBe('https://keyed/graphql');
        });

        it('should return an empty array for a bare project', () => {
            expect(listDeployables(makeProject())).toEqual([]);
        });
    });

    describe('setDeployable (pure)', () => {
        it('should return a new project with deployables[id] set', () => {
            const project = makeProject();
            const entry = makeDeployable();

            const next = setDeployable(project, 'mesh', entry);

            expect(next.deployables?.mesh).toEqual(entry);
            expect(next).not.toBe(project);
        });

        it('should not mutate the input project', () => {
            const project = makeProject();
            setDeployable(project, 'mesh', makeDeployable());
            expect(project.deployables).toBeUndefined();
        });

        it('should preserve existing deployables when adding a new one', () => {
            const project = makeProject({ deployables: { mesh: makeDeployable() } });
            const next = setDeployable(
                project,
                'erp',
                makeDeployable({ kind: 'integration', url: 'https://erp/api' }),
            );

            expect(Object.keys(next.deployables ?? {})).toEqual(
                expect.arrayContaining(['mesh', 'erp']),
            );
        });
    });

    describe('getProvidedEnvVars', () => {
        it('should return an empty object when no deployable provides vars', () => {
            expect(getProvidedEnvVars(makeProject())).toEqual({});
        });

        it('should collect providesEnvVars across all deployables', () => {
            const project = makeProject({
                deployables: {
                    mesh: makeDeployable({
                        providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
                    }),
                    other: makeDeployable({
                        kind: 'integration',
                        providesEnvVars: { OTHER_URL: 'https://other/api' },
                    }),
                },
            });

            expect(getProvidedEnvVars(project)).toEqual({
                MESH_ENDPOINT: 'https://mesh/graphql',
                OTHER_URL: 'https://other/api',
            });
        });
    });

    describe('isDeployableState', () => {
        it('should accept a well-formed deployable state', () => {
            expect(isDeployableState(makeDeployable())).toBe(true);
        });

        it('should reject an object missing kind', () => {
            expect(isDeployableState({ status: 'deployed', source: {} })).toBe(false);
        });

        it('should reject an invalid kind', () => {
            expect(isDeployableState({ kind: 'frontend', status: 'deployed', source: {} })).toBe(false);
        });

        it('should reject null and non-objects', () => {
            expect(isDeployableState(null)).toBe(false);
            expect(isDeployableState('mesh')).toBe(false);
            expect(isDeployableState(undefined)).toBe(false);
        });
    });
});
