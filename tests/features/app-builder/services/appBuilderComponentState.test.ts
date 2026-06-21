/**
 * AppBuilderComponent State Accessor Tests (Step 01)
 *
 * Pure accessors over the keyed `project.appBuilderComponents` map. In D1 these
 * READ THROUGH to the legacy singular `meshState`/`appState` so there is
 * no behavioral change yet — legacy state stays authoritative.
 */

import {
    getAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
    getMeshAppBuilderComponent,
    getIntegrationAppBuilderComponents,
    getProvidedEnvVars,
    isAppBuilderComponentState,
} from '@/features/app-builder/services/appBuilderComponentState';
import type { Project, AppBuilderComponentState } from '@/types/base';

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

function makeAppBuilderComponent(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
        ...overrides,
    };
}

describe('appBuilderComponentState accessors', () => {
    describe('getAppBuilderComponent', () => {
        it('should return undefined when appBuilderComponents is absent', () => {
            const project = makeProject();
            expect(getAppBuilderComponent(project, 'mesh')).toBeUndefined();
        });

        it('should return the entry when present in project.appBuilderComponents', () => {
            const entry = makeAppBuilderComponent();
            const project = makeProject({ appBuilderComponents: { mesh: entry } });
            expect(getAppBuilderComponent(project, 'mesh')).toEqual(entry);
        });
    });

    describe('getMeshAppBuilderComponent (read-through)', () => {
        it('should synthesize a mesh appBuilderComponent from meshState when appBuilderComponents absent', () => {
            const project = makeProject({
                meshState: {
                    envVars: {},
                    sourceHash: 'abc123',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://edge-graph.adobe.io/api/x/graphql',
                },
            });

            const mesh = getMeshAppBuilderComponent(project);

            expect(mesh).toBeDefined();
            expect(mesh?.kind).toBe('mesh');
            expect(mesh?.status).toBe('deployed');
            expect(mesh?.endpoint).toBe('https://edge-graph.adobe.io/api/x/graphql');
            expect(mesh?.sourceHash).toBe('abc123');
            expect(mesh?.lastDeployed).toBe('2026-06-20T00:00:00.000Z');
        });

        it('should prefer the keyed appBuilderComponents entry over meshState', () => {
            const keyed = makeAppBuilderComponent({ endpoint: 'https://keyed.example/graphql' });
            const project = makeProject({
                appBuilderComponents: { mesh: keyed },
                meshState: {
                    envVars: {},
                    sourceHash: 'legacy',
                    lastDeployed: '2026-01-01T00:00:00.000Z',
                    endpoint: 'https://legacy.example/graphql',
                },
            });

            expect(getMeshAppBuilderComponent(project)?.endpoint).toBe('https://keyed.example/graphql');
        });

        it('should return undefined when neither appBuilderComponents nor meshState exist', () => {
            expect(getMeshAppBuilderComponent(makeProject())).toBeUndefined();
        });
    });

    describe('getIntegrationAppBuilderComponents (read-through)', () => {
        it('should synthesize an integration appBuilderComponent from appState when appBuilderComponents absent', () => {
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

            const integrations = getIntegrationAppBuilderComponents(project);

            expect(integrations).toHaveLength(1);
            expect(integrations[0].kind).toBe('integration');
            expect(integrations[0].status).toBe('deployed');
            expect(integrations[0].url).toBe('https://erp.example/api');
            expect(integrations[0].deployedUrls).toEqual({ ping: 'https://erp.example/ping' });
            expect(integrations[0].sourceHash).toBe('def456');
        });

        it('should return an empty array when no appState and no keyed integrations', () => {
            expect(getIntegrationAppBuilderComponents(makeProject())).toEqual([]);
        });
    });

    describe('listAppBuilderComponents', () => {
        it('should merge keyed appBuilderComponents with read-through singletons without duplicate ids', () => {
            const project = makeProject({
                appBuilderComponents: {
                    'erp-integration': makeAppBuilderComponent({ kind: 'integration', url: 'https://erp/api' }),
                },
                meshState: {
                    envVars: {},
                    sourceHash: 'abc',
                    lastDeployed: '2026-06-20T00:00:00.000Z',
                    endpoint: 'https://mesh/graphql',
                },
            });

            const all = listAppBuilderComponents(project);
            const ids = all.map(d => d.id);

            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toContain('erp-integration');
            expect(ids).toContain('mesh');
        });

        it('should not duplicate the mesh when both keyed and meshState exist', () => {
            const project = makeProject({
                appBuilderComponents: { mesh: makeAppBuilderComponent({ endpoint: 'https://keyed/graphql' }) },
                meshState: {
                    envVars: {},
                    sourceHash: 'legacy',
                    lastDeployed: '2026-01-01T00:00:00.000Z',
                    endpoint: 'https://legacy/graphql',
                },
            });

            const meshEntries = listAppBuilderComponents(project).filter(d => d.id === 'mesh');
            expect(meshEntries).toHaveLength(1);
            expect(meshEntries[0].endpoint).toBe('https://keyed/graphql');
        });

        it('should return an empty array for a bare project', () => {
            expect(listAppBuilderComponents(makeProject())).toEqual([]);
        });
    });

    describe('setAppBuilderComponent (pure)', () => {
        it('should return a new project with appBuilderComponents[id] set', () => {
            const project = makeProject();
            const entry = makeAppBuilderComponent();

            const next = setAppBuilderComponent(project, 'mesh', entry);

            expect(next.appBuilderComponents?.mesh).toEqual(entry);
            expect(next).not.toBe(project);
        });

        it('should not mutate the input project', () => {
            const project = makeProject();
            setAppBuilderComponent(project, 'mesh', makeAppBuilderComponent());
            expect(project.appBuilderComponents).toBeUndefined();
        });

        it('should preserve existing appBuilderComponents when adding a new one', () => {
            const project = makeProject({ appBuilderComponents: { mesh: makeAppBuilderComponent() } });
            const next = setAppBuilderComponent(
                project,
                'erp',
                makeAppBuilderComponent({ kind: 'integration', url: 'https://erp/api' }),
            );

            expect(Object.keys(next.appBuilderComponents ?? {})).toEqual(
                expect.arrayContaining(['mesh', 'erp']),
            );
        });
    });

    describe('getProvidedEnvVars', () => {
        it('should return an empty object when no appBuilderComponent provides vars', () => {
            expect(getProvidedEnvVars(makeProject())).toEqual({});
        });

        it('should collect providesEnvVars across all appBuilderComponents', () => {
            const project = makeProject({
                appBuilderComponents: {
                    mesh: makeAppBuilderComponent({
                        providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
                    }),
                    other: makeAppBuilderComponent({
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

    describe('isAppBuilderComponentState', () => {
        it('should accept a well-formed appBuilderComponent state', () => {
            expect(isAppBuilderComponentState(makeAppBuilderComponent())).toBe(true);
        });

        it('should reject an object missing kind', () => {
            expect(isAppBuilderComponentState({ status: 'deployed', source: {} })).toBe(false);
        });

        it('should reject an invalid kind', () => {
            expect(isAppBuilderComponentState({ kind: 'frontend', status: 'deployed', source: {} })).toBe(false);
        });

        it('should reject null and non-objects', () => {
            expect(isAppBuilderComponentState(null)).toBe(false);
            expect(isAppBuilderComponentState('mesh')).toBe(false);
            expect(isAppBuilderComponentState(undefined)).toBe(false);
        });
    });
});
