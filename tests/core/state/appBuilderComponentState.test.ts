/**
 * AppBuilderComponent State Accessor Tests
 *
 * Pure accessors over the keyed `project.appBuilderComponents` map — the ONLY
 * in-memory carrier since PL-1 phase 2 (the legacy `meshState`/`appState`
 * read-through synthesis was deleted with the fields themselves; legacy
 * manifests fold into the keyed map at load).
 */

import {
    getAppBuilderComponent,
    getIdentifiedMeshAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
    getMeshAppBuilderComponent,
    getProvidedEnvVars,
    hasMeshDeploymentRecord,
    getMeshEndpoint,
} from '@/core/state/appBuilderComponentState';
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

    describe('getMeshAppBuilderComponent (keyed-only)', () => {
        it('should return the entry under the migrated "mesh" key', () => {
            const keyed = makeAppBuilderComponent();
            const project = makeProject({ appBuilderComponents: { mesh: keyed } });

            expect(getMeshAppBuilderComponent(project)).toBe(keyed);
        });

        it('should find a keyed mesh stored under a non-canonical id (matches by kind)', () => {
            const keyed = makeAppBuilderComponent({ endpoint: 'https://keyed.example/graphql' });
            const project = makeProject({
                appBuilderComponents: {
                    'acme-widget': makeAppBuilderComponent({ kind: 'integration' }),
                    'commerce-mesh': keyed,
                },
            });

            expect(getMeshAppBuilderComponent(project)?.endpoint).toBe(
                'https://keyed.example/graphql',
            );
        });

        it('should return undefined for a project with no keyed mesh', () => {
            expect(getMeshAppBuilderComponent(makeProject())).toBeUndefined();
        });

        it('should return the live object (mutations land on the map entry)', () => {
            const keyed = makeAppBuilderComponent();
            const project = makeProject({ appBuilderComponents: { mesh: keyed } });

            const entry = getMeshAppBuilderComponent(project);
            (entry as { userDeclinedUpdate?: boolean }).userDeclinedUpdate = true;

            expect(
                (project.appBuilderComponents?.mesh as { userDeclinedUpdate?: boolean })
                    .userDeclinedUpdate,
            ).toBe(true);
        });
    });

    describe('listAppBuilderComponents', () => {
        it('should list every keyed entry with the id it is stored under', () => {
            const project = makeProject({
                appBuilderComponents: {
                    'erp-integration': makeAppBuilderComponent({
                        kind: 'integration',
                        url: 'https://erp/api',
                    }),
                    mesh: makeAppBuilderComponent({ endpoint: 'https://mesh/graphql' }),
                },
            });

            const all = listAppBuilderComponents(project);
            const ids = all.map((d) => d.id);

            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toContain('erp-integration');
            expect(ids).toContain('mesh');
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

    it("prefers the canonical 'mesh' key, matching getMeshAppBuilderComponent", () => {
        const project = makeProject({
            appBuilderComponents: {
                'other-mesh': { kind: 'mesh', status: 'error', source: { owner: 'a', repo: 'b' } },
                mesh: { kind: 'mesh', status: 'deployed', source: { owner: 'a', repo: 'b' } },
            },
        });

        expect(getIdentifiedMeshAppBuilderComponent(project)!.id).toBe('mesh');
    });

    it('returns undefined when the project has no mesh component', () => {
        const project = makeProject({ appBuilderComponents: {} });

        expect(getIdentifiedMeshAppBuilderComponent(project)).toBeUndefined();
    });
});

describe('hasMeshDeploymentRecord — answered from the deploy record', () => {
    function withMesh(fields: Partial<AppBuilderComponentState>): Project {
        return makeProject({
            appBuilderComponents: {
                mesh: makeAppBuilderComponent({ status: 'not-deployed', ...fields }),
            },
        });
    }

    it('is false for a project with no mesh', () => {
        expect(hasMeshDeploymentRecord(makeProject({ appBuilderComponents: {} }))).toBe(false);
    });

    it('is false for a mesh with no record at all', () => {
        expect(hasMeshDeploymentRecord(withMesh({}))).toBe(false);
    });

    it('is true on an endpoint alone', () => {
        expect(hasMeshDeploymentRecord(withMesh({ endpoint: 'https://mesh/graphql' }))).toBe(true);
    });

    it('is true on a lastDeployed timestamp alone', () => {
        expect(hasMeshDeploymentRecord(withMesh({ lastDeployed: '2026-07-15T00:00:00Z' }))).toBe(true);
    });

    it('is true on a staleness baseline alone (a migrated legacy mesh)', () => {
        expect(hasMeshDeploymentRecord(withMesh({ envVars: { MESH_KEY: 'x' } }))).toBe(true);
    });

    it('is false on an EMPTY staleness baseline', () => {
        expect(hasMeshDeploymentRecord(withMesh({ envVars: {} }))).toBe(false);
    });
});

describe('getMeshEndpoint', () => {
    function withEndpoint(endpoint: unknown): Project {
        return makeProject({
            appBuilderComponents: {
                // The endpoint comes off an untyped manifest, so a wrong-typed
                // value is a real input; the cast plants exactly that.
                mesh: makeAppBuilderComponent({ endpoint: endpoint as string }),
            },
        });
    }

    it('returns the deployed endpoint', () => {
        expect(getMeshEndpoint(withEndpoint('https://mesh/graphql'))).toBe('https://mesh/graphql');
    });

    it('is undefined for a project with no mesh', () => {
        expect(getMeshEndpoint(makeProject({ appBuilderComponents: {} }))).toBeUndefined();
    });

    it.each([
        ['an empty string', ''],
        ['whitespace only', '   '],
        ['a non-string', 42],
    ])('is undefined for %s, without throwing', (_label, value) => {
        expect(getMeshEndpoint(withEndpoint(value))).toBeUndefined();
    });
});
