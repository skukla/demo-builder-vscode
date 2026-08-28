/**
 * Deploy-contract runner (Step 08) — unify add/deploy/remove by `kind`.
 *
 * Strict TDD: tests written BEFORE implementation.
 *
 * The runner orchestrates the pieces built in 01/04/05/06/07 + the existing deploy
 * tails. It does NOT fork `deployMeshComponent`/`deployAppComponent` — the routing
 * tests assert the existing tails are the ones invoked (by kind). Every external
 * boundary (the two deploy tails, the API subscriber, clone/install, undeploy/
 * delete commands, and the storefront republish) is injected via deps and mocked.
 *
 * Org-context discipline: withOrgContext is
 * mocked to record its target and run the callback (no global mutation).
 *
 * Covers the ADD and REDEPLOY arms. Siblings hold the rest, split on the axis the
 * runner dispatches on: `-remove` (the remove arm), `-envFile` (the mesh .env
 * step), `-keyed-state` (caller-reference sync + display-name persistence).
 * Shared factories live in appBuilderComponentRunner.testUtils.ts.
 */

import type { Project } from '@/types/base';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

// Standalone-ness is filesystem-read at the add door; default to standalone so the
// integration happy paths run, override for the layout-mismatch rejection tests.
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
} from '@/features/app-builder/services/appBuilderComponentRunner';
import {
    MESH_ENTRY,
    INTEGRATION_ENTRY,
    createComponentManager,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

// =============================================================================
// addAppBuilderComponent — MESH
// =============================================================================

describe('addAppBuilderComponent (mesh)', () => {
    it('subscribes APIs, clones, deploys via the mesh tail, and persists a mesh appBuilderComponent', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.subscribeRequiredApis).toHaveBeenCalledTimes(1);
        expect(deps.componentManager.installComponent).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.appBuilderComponents?.[MESH_ENTRY.id];
        expect(entry).toMatchObject({
            kind: 'mesh',
            status: 'deployed',
            endpoint: 'https://mesh/graphql',
            providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
        });
    });

    // AI-1o. The skill set follows what a project BUILDS, so attaching an App
    // Builder component changes the answer — and nothing else re-asks it. The
    // activation sweep rewrites content only when AI_CONTEXT_VERSION moves, and
    // the freshness badge fires only on a MISSING package, which a storefront
    // adding an integration does not produce (commerce-extensibility was
    // already installed for the storefront). Without this the integration
    // arrived with none of the skills Adobe wrote for building one.
    it('re-derives the AI bundle after an add, from the project that was persisted', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(deps.refreshAiBundle).toHaveBeenCalledTimes(1);
        const refreshed = deps.refreshAiBundle.mock.calls[0][0] as Project;
        expect(refreshed.appBuilderComponents?.[MESH_ENTRY.id]).toBeDefined();
    });

    it('refreshes the bundle AFTER the save, never before', async () => {
        // Order matters: the refresh derives the skill set from the project, and
        // a refresh that ran first would derive it from the composition the
        // project had a moment ago.
        const order: string[] = [];
        const deps = createDeps({
            saveProject: jest.fn(async () => {
                order.push('save');
            }),
            refreshAiBundle: jest.fn(async () => {
                order.push('refresh');
            }),
        });

        await addAppBuilderComponent(createProject(), MESH_ENTRY, deps as never);

        // Two saves since the in-flight 'deploying' marker (2026-08-27):
        // marker save -> outcome save -> bundle refresh. The pin's point is
        // unchanged — refresh comes strictly AFTER the outcome save.
        expect(order).toEqual(['save', 'save', 'refresh']);
    });

    it('does NOT call the integration deploy tail for a mesh entry (dispatch by kind)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('runs the deploy inside withOrgContext targeted from project.adobe (never aio console select)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function)
        );
        const selectCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('console') && String(c[0]).includes('select')
        );
        expect(selectCall).toBeUndefined();
    });

    it('regenerates + republishes the storefront config with the resolved endpoint', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
        const republishArg = deps.republishStorefront.mock.calls[0][0] as { project: Project };
        // Republish receives the project carrying the provided endpoint.
        const entry = republishArg.project.appBuilderComponents?.[MESH_ENTRY.id];
        expect(entry?.providesEnvVars?.MESH_ENDPOINT).toBe('https://mesh/graphql');
    });

    it('subscribes the UNION of all catalog appBuilderComponents (not just the one being added)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        const subscribedAppBuilderComponents = deps.subscribeRequiredApis.mock
            .calls[0][0] as AppBuilderComponentCatalogEntry[];
        expect(subscribedAppBuilderComponents).toEqual(
            expect.arrayContaining([MESH_ENTRY, INTEGRATION_ENTRY])
        );
    });
});

// =============================================================================
// addAppBuilderComponent — INTEGRATION
// =============================================================================

describe('addAppBuilderComponent (integration)', () => {
    it('builds with a derived ow.package, deploys via the app tail, persists url/deployedUrls', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).not.toHaveBeenCalled();

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id];
        expect(entry).toMatchObject({
            kind: 'integration',
            status: 'deployed',
            url: 'https://app/api',
            deployedUrls: { 'web/app': 'https://app/api' },
        });
    });

    it('applies a distinct derived ow.package to the integration before deploy', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        // The app deploy tail is handed the resolved ow.package distinct from defaults.
        const owPackage = deps.deployApp.mock.calls[0][1] as string;
        expect(owPackage).toBeTruthy();
        expect(owPackage).not.toBe('application');
        expect(owPackage).not.toBe('dx-excshell-1');
    });

    it('does NOT republish the storefront for an integration that provides no env vars', async () => {
        const project = createProject();
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it('rejects a NON-standalone integration at the add door (no deploy)', async () => {
        mockDetectAppLayout.mockResolvedValueOnce(undefined);
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not a standalone App Builder app/);
        // Cloned+installed, but never deployed (isolation could not be guaranteed).
        expect(deps.componentManager.installComponent).toHaveBeenCalledTimes(1);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('rejects a standalone entry whose repo is extension-shaped (no deploy)', async () => {
        mockDetectAppLayout.mockResolvedValueOnce('extension');
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not a standalone App Builder app.*extension-shaped/);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('accepts and deploys an extension-layout entry over an extension-shaped repo', async () => {
        mockDetectAppLayout.mockResolvedValueOnce('extension');
        const project = createProject();
        const deps = createDeps();
        const extensionEntry = { ...INTEGRATION_ENTRY, layout: 'extension' as const };

        const result = await addAppBuilderComponent(project, extensionEntry, deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
    });

    it('rejects an extension-layout entry whose repo is standalone-shaped (no deploy)', async () => {
        // mockDetectAppLayout default resolves 'standalone'
        const project = createProject();
        const deps = createDeps();
        const extensionEntry = { ...INTEGRATION_ENTRY, layout: 'extension' as const };

        const result = await addAppBuilderComponent(project, extensionEntry, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not an extension-layout App Builder app.*standalone-shaped/);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('does NOT gate the mesh on the layout check (mesh is not app-deployed)', async () => {
        mockDetectAppLayout.mockResolvedValue(undefined);
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);
        mockDetectAppLayout.mockResolvedValue('standalone');
    });

    it('guards provider-before-consumer: a mesh-consuming integration with no mesh deployed errors', async () => {
        const project = createProject();
        const deps = createDeps();
        const consumer: AppBuilderComponentCatalogEntry = {
            ...INTEGRATION_ENTRY,
            id: 'mesh-consumer',
            envSchema: [
                { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh', providedBy: 'commerce-mesh' },
            ],
        };

        const result = await addAppBuilderComponent(project, consumer, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/provider|mesh/i);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Partial-failure handling
// =============================================================================

describe('addAppBuilderComponent partial-failure', () => {
    it('clone OK but deploy fails → persists status=error and retains the local folder', async () => {
        const project = createProject();
        const deps = createDeps({
            deployMesh: jest.fn().mockResolvedValue({ success: false, error: 'deploy boom' }),
        });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/deploy boom/);

        // The appBuilderComponent entry is persisted with status 'error' (coherent state, not cleared).
        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.appBuilderComponents?.[MESH_ENTRY.id];
        expect(entry?.status).toBe('error');
        // WITH the reason. This assertion is the gap that let the bug through: the
        // old test proved the status persisted AND that the message came back, but
        // never that the two were connected — so `errorState` dropping the reason
        // looked green. A failed add left `status:'error'` with an empty error, and
        // nothing on any surface could say why (live, 2026-08-04:
        // demo-builder-test's commerce-eds-mesh).
        expect(entry?.error).toMatch(/deploy boom/);
        // Local folder retained for retry: removeComponent must NOT have been called.
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });

    // CHARACTERISATION, guarding the consolidation onto recordDeployOutcome.
    // That writer resolves its key through resolveKeyedComponentId, whose
    // legacy-migration branch reuses the ONE existing same-kind entry's key when
    // the given id is not yet keyed. That is right for an UPDATE and catastrophic
    // for a CREATE: adding a second integration would overwrite the first. An add
    // must key by its own id, always.
    it('keys a SECOND integration under its own id, never the first ones', async () => {
        const project = createProject({
            appBuilderComponents: {
                // A DIFFERENT id from the one being added — otherwise this is an
                // update, which is the case the migration branch exists for.
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'acme', repo: 'order-sync' },
                    url: 'https://orders/api',
                },
            },
        });
        const deps = createDeps();

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        // The newcomer under its OWN key...
        expect(persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.status).toBe('deployed');
        // ...and the incumbent untouched.
        expect(persisted.appBuilderComponents?.['order-sync']).toEqual(
            expect.objectContaining({ name: 'Order Sync', url: 'https://orders/api' })
        );
    });

    // The deploy tails ALREADY report every step — buildMeshComponent,
    // "Reading mesh configuration…", "Deploying…" — and the dep type has declared
    // `onProgress` all along. The creation path passes one; dispatchDeploy called
    // the tail with three arguments and dropped it, so a dashboard add showed one
    // static title for 70 seconds while 42s of API subscribe, 21s of npm install
    // and 9s of build went unreported (live, 2026-08-04). Reusing the tail means
    // reusing its whole contract, not just its return value.
    it('forwards progress from the MESH deploy tail to its caller', async () => {
        const project = createProject();
        const deps = createDeps();
        const seen: string[] = [];

        (deps.deployMesh as jest.Mock).mockImplementation(
            async (_path, _cmd, _log, onProgress?: (m: string, s?: string) => void) => {
                onProgress?.('Reading mesh configuration...', '');
                onProgress?.('Deploying...', 'Validating configuration');
                return { success: true, data: { endpoint: 'https://mesh/graphql' } };
            }
        );

        await addAppBuilderComponent(project, MESH_ENTRY, {
            ...deps,
            onProgress: (m: string) => seen.push(m),
        } as never);

        // The env-file write reports its own step ahead of the tail's — it runs
        // before the deploy and is otherwise silent time.
        expect(seen).toEqual([
            'Subscribing Adobe APIs…',
            'Generating mesh configuration...',
            'Reading mesh configuration...',
            'Deploying...',
        ]);
    });

    it('forwards progress from the INTEGRATION deploy tail too', async () => {
        const project = createProject();
        const deps = createDeps();
        const seen: string[] = [];

        (deps.deployApp as jest.Mock).mockImplementation(
            async (
                _path,
                _pkg,
                _cmd,
                _log,
                opts?: { onProgress?: (m: string, s?: string) => void }
            ) => {
                opts?.onProgress?.('Building…');
                return { success: true, data: { url: 'https://app/api' } };
            }
        );

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, {
            ...deps,
            onProgress: (m: string) => seen.push(m),
        } as never);

        expect(seen).toEqual(['Subscribing Adobe APIs…', 'Building…']);
    });

    // BEHAVIOUR CHANGE (2026-08-04 consolidation): a redeploy used to REPLACE the
    // entry with a freshly built state, dropping every field the new state did not
    // mention. Routed through recordDeployOutcome it merges instead, so fields the
    // deploy has no opinion about survive it.
    it('a redeploy preserves fields its outcome says nothing about', async () => {
        const project = createProject({
            appBuilderComponents: {
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP Bridge',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                    sourceHash: 'abc123',
                    userDeclinedUpdate: true,
                },
            },
            componentInstances: {
                'erp-bridge': {
                    id: 'erp-bridge',
                    name: 'ERP',
                    type: 'app-builder',
                    status: 'ready',
                    path: '/proj/components/erp-bridge',
                } as never,
            },
        });
        const deps = createDeps();

        await deployAppBuilderComponent(project, 'erp-bridge', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        const entry = saved.appBuilderComponents?.['erp-bridge'];
        expect(entry?.status).toBe('deployed');
        expect(entry?.sourceHash).toBe('abc123');
        expect(entry?.userDeclinedUpdate).toBe(true);
    });

    it('persists the reason for an INTEGRATION add failure too', async () => {
        const project = createProject();
        const deps = createDeps({
            deployApp: jest
                .fn()
                .mockResolvedValue({ success: false, error: 'runtime rejected it' }),
        });

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.error).toMatch(
            /runtime rejected it/
        );
    });

    it('clone failure → no deploy, no persisted entry', async () => {
        const project = createProject();
        const componentManager = createComponentManager();
        componentManager.installComponent.mockResolvedValue({
            success: false,
            error: 'clone failed',
        });
        const deps = createDeps({ componentManager });

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(deps.deployMesh).not.toHaveBeenCalled();
        expect(project.appBuilderComponents?.[MESH_ENTRY.id]).toBeUndefined();
    });
});

// =============================================================================
// deployAppBuilderComponent (redeploy)
// =============================================================================

describe('deployAppBuilderComponent (redeploy)', () => {
    function meshDeployedProject(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    name: 'Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'ready',
                    path: '/proj/components/commerce-mesh',
                } as never,
            },
            appBuilderComponents: {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                    endpoint: 'https://mesh/graphql',
                    providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
                },
            },
        });
    }

    it('re-runs only the mesh tail for a mesh appBuilderComponent, under withOrgContext', async () => {
        const project = meshDeployedProject();
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, 'commerce-mesh', deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);
        expect(deps.deployApp).not.toHaveBeenCalled();
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        expect(mockWithOrgContext).toHaveBeenCalled();
    });

    it('errors when the id is unknown', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, 'nope', deps as never);

        expect(result.success).toBe(false);
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    it('re-runs only the integration tail for an integration appBuilderComponent', async () => {
        const project = createProject({
            componentInstances: {
                'erp-bridge': {
                    id: 'erp-bridge',
                    name: 'ERP',
                    type: 'app-builder',
                    status: 'ready',
                    path: '/proj/components/erp-bridge',
                } as never,
            },
            appBuilderComponents: {
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                    url: 'https://app/api',
                },
            },
        });
        const deps = createDeps();

        await deployAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// removeAppBuilderComponent
// =============================================================================

// ─── in-flight marker + per-entry node version (2026-08-27) ──────────────────
describe('deploying marker and nodeVersion (live-test fixes)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('writes a transient deploying entry BEFORE the deploy runs (add flow)', async () => {
        const project = createProject();
        const deps = createDeps();
        let statusDuringDeploy: string | undefined;
        (deps.deployApp as jest.Mock).mockImplementation(async () => {
            statusDuringDeploy = project.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.status;
            return { success: true, data: { url: 'https://app' } };
        });

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        // A poller reading mid-run sees deploying, not a stale prior outcome.
        expect(statusDuringDeploy).toBe('deploying');
        expect(deps.saveProject).toHaveBeenCalledTimes(2); // marker + outcome
        expect(project.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.status).toBe('deployed');
    });

    it('redeploy marks the existing entry deploying and clears its stale error', async () => {
        const project = createProject();
        project.appBuilderComponents = {
            [INTEGRATION_ENTRY.id]: {
                kind: 'integration',
                status: 'error',
                error: 'stale failure from last time',
                source: { owner: 'o', repo: 'r' },
            },
        };
        project.componentInstances = {
            [INTEGRATION_ENTRY.id]: {
                id: INTEGRATION_ENTRY.id,
                name: INTEGRATION_ENTRY.name,
                type: 'app-builder',
                status: 'ready',
                path: '/proj/components/erp',
                lastUpdated: new Date(),
            } as never,
        };
        const deps = createDeps();
        let errorDuringDeploy: string | undefined = 'unset';
        let statusDuringDeploy: string | undefined;
        (deps.deployApp as jest.Mock).mockImplementation(async () => {
            const entry = project.appBuilderComponents?.[INTEGRATION_ENTRY.id];
            statusDuringDeploy = entry?.status;
            errorDuringDeploy = entry?.error;
            return { success: true, data: { url: 'https://app' } };
        });

        await deployAppBuilderComponent(project, INTEGRATION_ENTRY.id, deps as never);

        expect(statusDuringDeploy).toBe('deploying');
        expect(errorDuringDeploy).toBeUndefined();
    });

    it('a FAILED redeploy persists the error outcome — deploying must not outlive it', async () => {
        const project = createProject();
        project.appBuilderComponents = {
            [INTEGRATION_ENTRY.id]: {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'o', repo: 'r' },
            },
        };
        project.componentInstances = {
            [INTEGRATION_ENTRY.id]: {
                id: INTEGRATION_ENTRY.id,
                name: INTEGRATION_ENTRY.name,
                type: 'app-builder',
                status: 'ready',
                path: '/proj/components/erp',
                lastUpdated: new Date(),
            } as never,
        };
        const deps = createDeps();
        (deps.deployApp as jest.Mock).mockResolvedValue({
            success: false,
            error: 'webpack said no',
        });

        const result = await deployAppBuilderComponent(
            project,
            INTEGRATION_ENTRY.id,
            deps as never
        );

        expect(result.success).toBe(false);
        const entry = project.appBuilderComponents?.[INTEGRATION_ENTRY.id];
        expect(entry?.status).toBe('error');
        expect(entry?.error).toContain('webpack said no');
    });

    it('threads the entry nodeVersion into the deploy tail', async () => {
        const project = createProject();
        const deps = createDeps();
        const entry = { ...INTEGRATION_ENTRY, nodeVersion: '24' };

        await addAppBuilderComponent(project, entry, deps as never);

        expect(deps.deployApp).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ nodeVersion: '24' })
        );
    });

    it('an ensureNodeVersion failure aborts the add before anything else runs', async () => {
        const project = createProject();
        const deps = createDeps({
            ensureNodeVersion: jest.fn().mockResolvedValue('Node 24 could not be installed'),
        });
        const entry = { ...INTEGRATION_ENTRY, nodeVersion: '24' };

        const result = await addAppBuilderComponent(project, entry, deps as never);

        expect(result).toEqual({ success: false, error: 'Node 24 could not be installed' });
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        expect(deps.deployApp).not.toHaveBeenCalled();
    });
});
