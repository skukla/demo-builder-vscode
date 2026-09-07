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
import { createMockProject } from '../../helpers/projectFake';

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

function makeAppBuilderComponent(
    overrides: Partial<AppBuilderComponentState> = {}
): AppBuilderComponentState {
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
                'https://keyed.example/graphql'
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
                    .userDeclinedUpdate
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
            const project = makeProject({
                appBuilderComponents: { mesh: makeAppBuilderComponent() },
            });
            const next = setAppBuilderComponent(
                project,
                'erp',
                makeAppBuilderComponent({ kind: 'integration', url: 'https://erp/api' })
            );

            expect(Object.keys(next.appBuilderComponents ?? {})).toEqual(
                expect.arrayContaining(['mesh', 'erp'])
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

/**
 * The two mesh-record accessors below arrived here on 2026-09-07 from
 * `dashboardStatusService.test.ts`, where they tested THIS module through the
 * service that consumes it. Suites are matched to modules by filename, so all
 * 15 were scored against the service and killed nothing there.
 *
 * They replace the six thinner cases this file had for the same two functions:
 * these cover the keyed-only record, whitespace and empty endpoints, and the
 * single-source-of-truth rule, which those did not.
 */
describe('hasMeshDeploymentRecord', () => {
    it('should return true when meshState has envVars', () => {
        // Given: A project with mesh deployment record
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {
                        MESH_ENDPOINT: 'https://mesh.adobe.io/graphql',
                    },
                    sourceHash: 'abc123',
                    lastDeployed: '2024-01-01T00:00:00Z',
                },
            },
        };

        // When: Checking for mesh deployment record
        const result = hasMeshDeploymentRecord(project);

        // Then: Should return true
        expect(result).toBe(true);
    });

    // REGRESSION (2026-08-04, live): a mesh added from the dashboard verified
    // successfully, wrote a keyed entry reading `status: 'deployed'` with an
    // endpoint and a lastDeployed timestamp — and the integrations grid still
    // said "Not Deployed", because this predicate tested `envVars`.
    //
    // `envVars` is the mesh STALENESS BASELINE (ADR-011 D3 Step 06), written by
    // `updateMeshState` on the deployMeshHeadless path and NOT by the keyed
    // runner's add. So a redeploy looked deployed and an add did not. The
    // question this predicate answers — "has this mesh ever been deployed?" —
    // is answered by the deploy record, not by a staleness baseline that only
    // one of two deploy paths happens to write.
    it('returns true for a keyed entry with an endpoint but NO staleness baseline', () => {
        const project = createMockProject({
            name: 'test-project',
            path: '/path/to/project',
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    endpoint: 'https://edge-sandbox-graph.adobe.io/api/abc/graphql',
                    lastDeployed: '2026-08-04T23:37:12.261Z',
                    source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                },
            },
        });

        expect(hasMeshDeploymentRecord(project)).toBe(true);
    });

    it('returns true on lastDeployed alone (deployed, endpoint since cleared)', () => {
        const project = createMockProject({
            name: 'test-project',
            path: '/path/to/project',
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'error',
                    lastDeployed: '2026-08-04T23:37:12.261Z',
                    source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                },
            },
        });

        expect(hasMeshDeploymentRecord(project)).toBe(true);
    });

    // Control: a mesh that exists but has never deployed is still not-deployed.
    it('returns false for a keyed entry with no endpoint, timestamp or baseline', () => {
        const project = createMockProject({
            name: 'test-project',
            path: '/path/to/project',
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'not-deployed',
                    source: { owner: 'skukla', repo: 'eds-accs-mesh' },
                },
            },
        });

        expect(hasMeshDeploymentRecord(project)).toBe(false);
    });

    it('should return false when meshState is undefined', () => {
        // Given: A project without meshState
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
        };

        // When: Checking for mesh deployment record
        const result = hasMeshDeploymentRecord(project);

        // Then: Should return false
        expect(result).toBe(false);
    });

    it('should return false when meshState.envVars is empty', () => {
        // Given: A project with empty envVars
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
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
        };

        // When: Checking for mesh deployment record
        const result = hasMeshDeploymentRecord(project);

        // Then: Should return false
        expect(result).toBe(false);
    });

    // ADR-011 D3 Steps 07+09: after Step 07 the manifest carries no meshState,
    // so the deployment record must be read from the keyed mesh entry.
    it('should return true when the record lives only on the keyed mesh entry (keyed-only)', () => {
        const project = createMockProject({
            name: 'test-project',
            path: '/path/to/project',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://mesh.adobe.io/graphql',
                    envVars: { MESH_ENDPOINT: 'https://mesh.adobe.io/graphql' },
                },
            },
        });

        expect(hasMeshDeploymentRecord(project)).toBe(true);
    });

    it('should return false when the keyed mesh entry has empty envVars (keyed-only)', () => {
        const project = createMockProject({
            name: 'test-project',
            path: '/path/to/project',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'not-deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                },
            },
        });

        expect(hasMeshDeploymentRecord(project)).toBe(false);
    });
});

describe('getMeshEndpoint', () => {
    it('should return endpoint from meshState (single source of truth)', () => {
        // Given: A project with meshState.endpoint
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '2024-01-01',
                    endpoint: 'https://mesh.adobe.io/graphql',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return the endpoint from meshState
        expect(result).toBe('https://mesh.adobe.io/graphql');
    });

    it('should return undefined when meshState is undefined', () => {
        // Given: A project without meshState
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return undefined
        expect(result).toBeUndefined();
    });

    it('should return undefined when meshState.endpoint is undefined', () => {
        // Given: A project with meshState but no endpoint
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '2024-01-01',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return undefined
        expect(result).toBeUndefined();
    });

    it('should return undefined when endpoint is empty string', () => {
        // Given: A project with empty meshState.endpoint
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '2024-01-01',
                    endpoint: '',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return undefined
        expect(result).toBeUndefined();
    });

    it('should return undefined when endpoint is whitespace only', () => {
        // Given: A project with whitespace-only meshState.endpoint
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '2024-01-01',
                    endpoint: '   ',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return undefined
        expect(result).toBeUndefined();
    });

    it('should ignore MESH_ENDPOINT in componentConfigs (single source of truth)', () => {
        // Given: A project with MESH_ENDPOINT in componentConfigs but no meshState.endpoint
        // meshState.endpoint is the ONLY source — componentConfigs is never consulted
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            componentConfigs: {
                frontend: {
                    MESH_ENDPOINT: 'https://old-mesh.adobe.io/graphql',
                    OTHER_VAR: 'value',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return undefined (NOT the componentConfigs value)
        // This validates the single source of truth behavior
        expect(result).toBeUndefined();
    });

    it('should return meshState endpoint even when componentConfigs has a different value', () => {
        // Given: A project with MESH_ENDPOINT in componentConfigs AND meshState.endpoint
        // This tests that meshState is the ONLY source (not a fallback)
        const project: Project = {
            name: 'test-project',
            path: '/path/to/project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
            componentConfigs: {
                frontend: {
                    MESH_ENDPOINT: 'https://old-stale-endpoint.adobe.io/graphql',
                },
            },
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    envVars: {},
                    sourceHash: null,
                    lastDeployed: '2024-01-01',
                    endpoint: 'https://correct-endpoint.adobe.io/graphql',
                },
            },
        };

        // When: Getting mesh endpoint
        const result = getMeshEndpoint(project);

        // Then: Should return the meshState endpoint
        expect(result).toBe('https://correct-endpoint.adobe.io/graphql');
    });
});
