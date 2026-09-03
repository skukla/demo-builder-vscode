/**
 * Both mesh deploy paths must land the SAME deployment record.
 *
 * There are two: `deployMeshHeadless` (the DeployMeshCommand / projects-dashboard
 * / MCP path) and this keyed runner (the dashboard Add + Redeploy path). The
 * headless one persists its record through `updateMeshState`, which captures the
 * staleness baseline (`envVars` + `sourceHash`) and stamps the instance's
 * `metadata.meshId`. The runner called neither, so a dashboard-added mesh
 * persisted status + endpoint + lastDeployed and nothing else.
 *
 * Found 2026-08-04 in a user's logs, not by the reader inventory that closed the
 * "one accessor" item earlier the same day — that inventory compared READERS and
 * status WRITES, and never compared what the two paths RECORD. The live symptoms:
 *
 * - empty `envVars` sent the staleness detector to Adobe I/O on every window
 *   open ("Failed to parse mesh data"), so "Update needed" could never fire
 *   for a dashboard-added mesh — change Commerce credentials, get no prompt;
 * - a null `metadata` left meshVerifier with no mesh id, so every status request
 *   ran `aio api-mesh:describe`, failed, and logged "Verification failed".
 *
 * These assertions are about the RECORD, not the mechanism: any future path that
 * lands a poorer one fails here.
 */

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports (same preamble as appBuilderComponentRunner.test.ts)
// =============================================================================

const mockDetectAppLayout = jest.fn().mockResolvedValue('standalone');
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    ...jest.requireActual('@/features/app-builder/services/appConfigPackages'),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    MESH_ENTRY,
    INTEGRATION_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    mockDetectAppLayout.mockResolvedValue('standalone');
});

/**
 * The baseline capture is a DEP, like every other cross-feature boundary the
 * runner touches — production wires it to the mesh feature's .env reader and
 * source hasher in appBuilderComponentRunnerDeps. Fixed values here, so these
 * assertions are about WHETHER the baseline was captured, not what it holds.
 */
const BASELINE = { envVars: { ACCS_GRAPHQL_ENDPOINT: 'https://x' }, sourceHash: 'sha-abc123' };

describe('a dashboard mesh add lands the full deployment record', () => {
    it('captures the staleness baseline, not just the endpoint', async () => {
        const project = createProject();
        const deps = createDeps({
            captureMeshBaseline: jest.fn().mockResolvedValue(BASELINE),
        });

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        expect(deps.captureMeshBaseline).toHaveBeenCalledWith('/proj/components/commerce-mesh');

        const entry = project.appBuilderComponents?.[MESH_ENTRY.id];
        expect(entry).toBeDefined();

        // What the runner already recorded.
        expect(entry!.status).toBe('deployed');
        expect(entry!.endpoint).toBe('https://mesh/graphql');
        expect(entry!.lastDeployed).toBeTruthy();

        // What it did not. Without these, detectMeshChanges can never conclude
        // anything: it sees an empty baseline and goes to the network instead.
        expect(entry!.envVars).toEqual({ ACCS_GRAPHQL_ENDPOINT: 'https://x' });
        expect(entry!.sourceHash).toBe('sha-abc123');
    });

    it('stamps the mesh id where meshVerifier looks for it', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        // meshVerifier reads componentInstances[id].metadata.meshId. A null
        // metadata is what sent it to `api-mesh:describe` on every status request.
        expect(project.componentInstances?.[MESH_ENTRY.id]?.metadata?.meshId).toBe('mesh-1');
    });

    it('leaves an integration add untouched — the baseline is mesh-only', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        const entry = project.appBuilderComponents?.[INTEGRATION_ENTRY.id];
        expect(entry?.status).toBe('deployed');
        // An integration has no mesh .env and no mesh source tree; fabricating a
        // baseline for one would make it permanently "stale".
        expect(entry?.sourceHash).toBeUndefined();
        expect(deps.captureMeshBaseline).not.toHaveBeenCalled();
    });
});
