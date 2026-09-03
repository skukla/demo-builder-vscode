/**
 * appBuilderComponentRunner — keyed-state slice: caller-reference sync of the
 * keyed `appBuilderComponents` writes + display-name persistence (shell
 * instancing). Split from appBuilderComponentRunner.test.ts to keep both files
 * under the eslint max-lines limit; add/deploy/remove routing coverage lives in
 * that sibling, shared factories in appBuilderComponentRunner.testUtils.ts.
 *
 * Org-context discipline: withOrgContext is
 * mocked to record its target and run the callback (no global mutation).
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

// Standalone-ness is filesystem-read at the add door; default to standalone so
// the integration add paths run (the rejection test lives in the sibling file).
const mockDetectAppLayout = jest.fn().mockResolvedValue('standalone');
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    MESH_ENTRY,
    INTEGRATION_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

// =============================================================================
// Caller-reference sync (regression, found by an on-disk audit)
// =============================================================================

// The runner persisted IMMUTABLY: setAppBuilderComponent/`cleared` copies were
// saved and returned, but the CALLER's project reference never carried the
// change. Any later save from a reference-holder (the creation executor's
// finalization saves at executor.ts:853/:1132/:1233) clobbered the runner's
// write — a creation-deployed integration vanished from the manifest (and a
// removed one could resurrect). The runner must sync the passed project's
// keyed map in place, like recordDeployOutcome does.
describe("runner keyed writes sync the CALLER's project reference", () => {
    it('add: the passed project carries the new keyed entry (stale-save clobber pin)', async () => {
        const project = createProject();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, createDeps());

        expect(project.appBuilderComponents?.[INTEGRATION_ENTRY.id]).toMatchObject({
            kind: 'integration',
            status: 'deployed',
        });
    });

    it('remove: the passed project drops the entry (stale-save resurrection pin)', async () => {
        const project = createProject({
            appBuilderComponents: {
                [INTEGRATION_ENTRY.id]: {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                },
            },
            componentInstances: {
                [INTEGRATION_ENTRY.id]: {
                    id: INTEGRATION_ENTRY.id,
                    name: INTEGRATION_ENTRY.name,
                    status: 'ready',
                    path: '/proj/components/erp-bridge',
                },
            },
        });

        await removeAppBuilderComponent(project, INTEGRATION_ENTRY.id, createDeps());

        expect(project.appBuilderComponents?.[INTEGRATION_ENTRY.id]).toBeUndefined();
    });
});

// =============================================================================
// Display name persistence (shell instancing)
// =============================================================================

// The keyed entry is the DURABLE home for the user-facing name: N shell
// instances share one template repo, so the name must survive in
// `appBuilderComponents[id].name` (deployed AND error states) and a redeploy
// built from persisted state must not clobber it with the id.
describe('keyed entry persists the display name', () => {
    it('add (integration): persists name from the catalog entry', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.name).toBe('ERP Bridge');
    });

    it('add (mesh): persists name from the catalog entry', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[MESH_ENTRY.id]?.name).toBe('Commerce Mesh');
    });

    it('add failure: the error-status entry carries the name too', async () => {
        const project = createProject();
        const deps = createDeps({
            deployApp: jest.fn().mockResolvedValue({ success: false, error: 'deploy boom' }),
        });

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id];
        expect(entry?.status).toBe('error');
        expect(entry?.name).toBe('ERP Bridge');
    });

    function instanceProject(name?: string): Project {
        return createProject({
            componentInstances: {
                'order-sync': {
                    id: 'order-sync',
                    name: 'Order Sync',
                    type: 'app-builder',
                    status: 'ready',
                    path: '/proj/components/order-sync',
                },
            },
            appBuilderComponents: {
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    ...(name !== undefined ? { name } : {}),
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                    url: 'https://app/api',
                },
            },
        });
    }

    it('redeploy from persisted state (not in catalog) keeps the display name, not the id', async () => {
        const project = instanceProject('Order Sync');
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, 'order-sync', deps);

        expect(result.success).toBe(true);
        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.['order-sync']?.name).toBe('Order Sync');
    });

    it('redeploy from persisted state WITHOUT a name falls back to the id', async () => {
        const project = instanceProject();
        const deps = createDeps();

        await deployAppBuilderComponent(project, 'order-sync', deps);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.['order-sync']?.name).toBe('order-sync');
    });
});

// The OTHER half of "the add persisted": alongside the keyed
// `appBuilderComponents` entry, the add must attach the installed
// ComponentInstance to `project.componentInstances`.
//
// REGRESSION (2026-08-04, live): a mesh added from the dashboard deployed
// successfully, persisted a correct keyed entry, republished the storefront —
// and then reported `mesh=none` on the next reload, with the integrations grid
// rendering EMPTY. `installComponent` builds the instance carrying
// `subType: 'mesh'` and RETURNS it; `cloneAndInstall` kept only
// `result.component.path` and dropped the rest. With no instance persisted, the
// next project load let `discoverComponents` synthesize a thin one from the
// directory — no `subType` — so `getMeshComponentInstance` (which matches on
// subType === 'mesh') found nothing. The dashboard reads the INSTANCE while the
// projects-list card reads the KEYED MAP, which is why one said Deployed and
// the other said none.
describe('the add attaches the installed component instance', () => {
    it('persists a componentInstances entry for a mesh, carrying subType', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        const instance = project.componentInstances?.[MESH_ENTRY.id];
        expect(instance).toBeDefined();
        // subType is the whole point: getMeshComponentInstance matches on it, so
        // an instance without it is invisible to every mesh-aware surface.
        expect(instance?.subType).toBe('mesh');
        expect(instance?.path).toBe(`/proj/components/${MESH_ENTRY.id}`);
    });

    it('persists a componentInstances entry for an integration too', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        expect(project.componentInstances?.[INTEGRATION_ENTRY.id]).toBeDefined();
    });

    it('saves the instance, not just the keyed entry', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps);

        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.componentInstances?.[MESH_ENTRY.id]?.subType).toBe('mesh');
    });
});
