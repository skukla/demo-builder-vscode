// IMPORTANT: Mock must be declared before imports

import { detectMeshChanges } from '@/features/mesh/services/stalenessDetector';
import { createStalenessProject, setupMockFileSystemWithHash, meshDeps } from './stalenessDetector.testUtils';
import type { Project } from '@/types';

/**
 * The mesh staleness detector is the THIRD resolver over `componentConfigs`, and
 * the only one that did not honour `BACKEND_OWNED_SCOPE_KEYS`.
 *
 * Website / store / store-view codes are duplicated onto mesh component configs,
 * and only the BACKEND's copy is updated when the user changes them. The detector
 * flattened every component with `Object.assign`, so manifest iteration order
 * decided the winner.
 *
 * The observed 2026-08-10 symptom — a correct "Update needed" — was luck:
 * `adobe-commerce-accs` happened to sort after `eds-accs-mesh`. Flip the order and
 * the detector compares the deployed snapshot against the mesh's own STALE copy,
 * finds them equal, and reports clean while the mesh queries a website with no
 * products. That is the failure `4b517cfb` was filed for, on the surface whose
 * entire job is catching it.
 */

const BACKEND_ID = 'adobe-commerce-accs';
const MESH_ID = 'eds-accs-mesh';
const SOURCE_HASH = 'abc123';
const ENDPOINT = 'https://backend.example/graphql';

/** ACCS project with a deployed mesh whose snapshot is supplied per test. */
function projectWithDeployedScope(websiteCode: string): Project {
    return createStalenessProject({
        componentSelections: { backend: BACKEND_ID },
        componentInstances: {
            [MESH_ID]: {
                id: MESH_ID,
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
                    envVars: {
                        ACCS_GRAPHQL_ENDPOINT: ENDPOINT,
                        ACCS_WEBSITE_CODE: websiteCode,
                    },
                    sourceHash: SOURCE_HASH,
                    lastDeployed: '2026-08-01T00:00:00Z',
                    },
        },
    });
}

/** Backend first, mesh second — mesh wins the flatten, so the stale copy decides. */
function configsBackendFirst(backendCode: string, meshCode: string) {
    return {
        [BACKEND_ID]: {
            ACCS_GRAPHQL_ENDPOINT: ENDPOINT,
            ACCS_WEBSITE_CODE: backendCode,
        },
        [MESH_ID]: {
            ACCS_WEBSITE_CODE: meshCode,
        },
    };
}

/** Mesh first, backend second — the order that happened to be live on 2026-08-10. */
function configsMeshFirst(backendCode: string, meshCode: string) {
    return {
        [MESH_ID]: {
            ACCS_WEBSITE_CODE: meshCode,
        },
        [BACKEND_ID]: {
            ACCS_GRAPHQL_ENDPOINT: ENDPOINT,
            ACCS_WEBSITE_CODE: backendCode,
        },
    };
}


/**
 * ADR-015 (2026-08-28): `detectMeshChanges` receives its collaborators now. The
 * suite passes the fake explicitly at each call site, so a reader sees the
 * real signature.
 */

beforeEach(() => {
    jest.clearAllMocks();
});

describe('mesh staleness resolves the store scope from the backend', () => {
    it("reports stale when the snapshot matches the mesh's stale copy but the backend differs", async () => {
        // THE false negative. Deployed with `base`; the mesh config still says
        // `base`; the backend has moved to `citisignal`. Flattening let the mesh
        // copy win, so snapshot === flattened and the badge stayed green.
        const project = projectWithDeployedScope('base');
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, configsBackendFirst('citisignal', 'base'), meshDeps);

        expect(result.changedEnvVars).toContain('ACCS_WEBSITE_CODE');
        expect(result.envVarsChanged).toBe(true);
        expect(result.hasChanges).toBe(true);
    });

    it('reaches the same verdict with the componentConfigs keys in either order', async () => {
        setupMockFileSystemWithHash(SOURCE_HASH);
        const backendFirst = await detectMeshChanges(
            projectWithDeployedScope('base'),
            configsBackendFirst('citisignal', 'base')
        ,
            meshDeps,
        );

        setupMockFileSystemWithHash(SOURCE_HASH);
        const meshFirst = await detectMeshChanges(
            projectWithDeployedScope('base'),
            configsMeshFirst('citisignal', 'base')
        ,
            meshDeps,
        );

        expect(meshFirst.changedEnvVars).toEqual(backendFirst.changedEnvVars);
        expect(meshFirst.hasChanges).toBe(backendFirst.hasChanges);
    });

    it('reports clean when backend and mesh agree and the snapshot matches — control', async () => {
        // Without this, "always stale" would satisfy the two cases above.
        const project = projectWithDeployedScope('citisignal');
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(
            project,
            configsBackendFirst('citisignal', 'citisignal')
        ,
            meshDeps,
        );

        expect(result.changedEnvVars).toEqual([]);
        expect(result.hasChanges).toBe(false);
    });

    it('still reports stale for a genuine backend-side change — control', async () => {
        const project = projectWithDeployedScope('base');
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(
            project,
            configsBackendFirst('citisignal', 'citisignal')
        ,
            meshDeps,
        );

        expect(result.changedEnvVars).toContain('ACCS_WEBSITE_CODE');
        expect(result.hasChanges).toBe(true);
    });

    it('does not treat a watch-list key absent everywhere as a change', async () => {
        // ACCS_CUSTOMER_GROUP is in the watch list and in BACKEND_OWNED_SCOPE_KEYS,
        // but no component declares it, so it reaches no .env and no snapshot.
        // Counting absent-vs-absent as a difference marks every ACCS mesh
        // permanently stale.
        const project = projectWithDeployedScope('citisignal');
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(
            project,
            configsBackendFirst('citisignal', 'citisignal')
        ,
            meshDeps,
        );

        expect(result.changedEnvVars).not.toContain('ACCS_CUSTOMER_GROUP');
    });

    it('keeps cross-boundary non-scope vars reachable from the backend config', async () => {
        // The flatten exists so vars living only on the backend (the GraphQL
        // endpoint) still reach the comparison. The fix must not narrow that.
        const project = projectWithDeployedScope('citisignal');
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, {
            [BACKEND_ID]: {
                ACCS_GRAPHQL_ENDPOINT: 'https://moved.example/graphql',
                ACCS_WEBSITE_CODE: 'citisignal',
            },
            [MESH_ID]: {},
        },
            meshDeps,
        );

        expect(result.changedEnvVars).toContain('ACCS_GRAPHQL_ENDPOINT');
    });
});

/**
 * For NON-scope keys the detector must agree with the `.env` generator.
 *
 * 12 of the detector's 13 watched keys are declared by more than one component;
 * the scope list protects 6. For the other six — the Commerce endpoint, URL,
 * environment id and catalog key — the question is not "who owns this?" but
 * "what will actually be deployed?". The baseline was read FROM the mesh `.env`,
 * and the next deploy regenerates that `.env` via
 * `envFileGenerator.resolveFromComponentConfigs`, which takes the FIRST component
 * defining a key.
 *
 * The detector flattened LAST-wins — the exact opposite — so it could compare the
 * baseline against a value the generator would never write, and report clean on a
 * mesh that would come up pointing at the previous Commerce instance.
 *
 * These assert the agreement, not a winner: whichever copy the generator would
 * pick is the one the detector must call current.
 */
describe('mesh staleness agrees with the .env generator on non-scope keys', () => {
    const OLD = 'https://old.example/graphql';
    const NEW = 'https://new.example/graphql';

    function projectDeployedWith(endpoint: string): Project {
        return createStalenessProject({
            componentSelections: { backend: BACKEND_ID },
            componentInstances: {
                [MESH_ID]: {
                    id: MESH_ID,
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
                        envVars: { ACCS_GRAPHQL_ENDPOINT: endpoint, ACCS_WEBSITE_CODE: 'citisignal' },
                        sourceHash: SOURCE_HASH,
                        lastDeployed: '2026-08-01T00:00:00Z',
                            },
            },
        });
    }

    it('reports stale when the FIRST-defining component moved on', async () => {
        // Backend comes first, so the generator writes NEW. The deployed baseline
        // says OLD, which is also what the mesh's stale duplicate says — last-wins
        // matched that duplicate and called the mesh clean.
        const project = projectDeployedWith(OLD);
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, {
            [BACKEND_ID]: { ACCS_GRAPHQL_ENDPOINT: NEW, ACCS_WEBSITE_CODE: 'citisignal' },
            [MESH_ID]: { ACCS_GRAPHQL_ENDPOINT: OLD },
        },
            meshDeps,
        );

        expect(result.changedEnvVars).toContain('ACCS_GRAPHQL_ENDPOINT');
        expect(result.hasChanges).toBe(true);
    });

    it('reports clean once that value is the one deployed — control', async () => {
        const project = projectDeployedWith(NEW);
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, {
            [BACKEND_ID]: { ACCS_GRAPHQL_ENDPOINT: NEW, ACCS_WEBSITE_CODE: 'citisignal' },
            [MESH_ID]: { ACCS_GRAPHQL_ENDPOINT: OLD },
        },
            meshDeps,
        );

        expect(result.changedEnvVars).toEqual([]);
        expect(result.hasChanges).toBe(false);
    });

    it('takes the MESH copy when the mesh is the first to define it', async () => {
        // Not "the backend always wins" — that would contradict the generator in
        // the other direction and flag a mesh that is deployed exactly right.
        // The generator would write OLD here, and OLD is deployed, so: clean.
        const project = projectDeployedWith(OLD);
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, {
            [MESH_ID]: { ACCS_GRAPHQL_ENDPOINT: OLD },
            [BACKEND_ID]: { ACCS_GRAPHQL_ENDPOINT: NEW, ACCS_WEBSITE_CODE: 'citisignal' },
        },
            meshDeps,
        );

        expect(result.changedEnvVars).toEqual([]);
    });

    it('still resolves the store SCOPE from the backend, whatever the order', async () => {
        // The scope keys keep their STRONGER rule — first-wins does not apply to
        // them, or the mesh-first ordering above would reinstate the original bug.
        // Deployed against `base`; the mesh config still says `base` and comes
        // first; the backend says `citisignal`. Only the scope may differ.
        const project = createStalenessProject({
            componentSelections: { backend: BACKEND_ID },
            componentInstances: {
                [MESH_ID]: {
                    id: MESH_ID,
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
                        envVars: { ACCS_GRAPHQL_ENDPOINT: OLD, ACCS_WEBSITE_CODE: 'base' },
                        sourceHash: SOURCE_HASH,
                        lastDeployed: '2026-08-01T00:00:00Z',
                            },
            },
        });
        setupMockFileSystemWithHash(SOURCE_HASH);

        const result = await detectMeshChanges(project, {
            [MESH_ID]: { ACCS_GRAPHQL_ENDPOINT: OLD, ACCS_WEBSITE_CODE: 'base' },
            [BACKEND_ID]: { ACCS_GRAPHQL_ENDPOINT: NEW, ACCS_WEBSITE_CODE: 'citisignal' },
        },
            meshDeps,
        );

        // The endpoint is NOT flagged (the generator would still write OLD, which
        // is deployed); the scope IS (the backend moved to citisignal).
        expect(result.changedEnvVars).toEqual(['ACCS_WEBSITE_CODE']);
    });
});
