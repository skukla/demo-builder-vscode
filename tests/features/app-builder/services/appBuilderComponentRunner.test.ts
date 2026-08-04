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
 * Org-context discipline mirrors appComponentManager.test.ts: withOrgContext is
 * mocked to record its target and run the callback (no global mutation).
 *
 * The keyed-state slice (caller-reference sync + display-name persistence)
 * lives in the sibling appBuilderComponentRunner-keyed-state.test.ts; shared
 * factories in appBuilderComponentRunner.testUtils.ts.
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
// integration happy paths run, override to false for the rejection test.
const mockIsStandaloneApp = jest.fn().mockResolvedValue(true);
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    isStandaloneApp: (...args: unknown[]) => mockIsStandaloneApp(...args),
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
        mockIsStandaloneApp.mockResolvedValueOnce(false);
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not a standalone App Builder app/);
        // Cloned+installed, but never deployed (isolation could not be guaranteed).
        expect(deps.componentManager.installComponent).toHaveBeenCalledTimes(1);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('does NOT gate the mesh on the standalone check (mesh is not app-deployed)', async () => {
        mockIsStandaloneApp.mockResolvedValue(false);
        const project = createProject();
        const deps = createDeps();

        const result = await addAppBuilderComponent(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);
        mockIsStandaloneApp.mockResolvedValue(true);
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
            expect.objectContaining({ name: 'Order Sync', url: 'https://orders/api' }),
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
            },
        );

        await addAppBuilderComponent(project, MESH_ENTRY, {
            ...deps,
            onProgress: (m: string) => seen.push(m),
        } as never);

        expect(seen).toEqual(['Reading mesh configuration...', 'Deploying...']);
    });

    it('forwards progress from the INTEGRATION deploy tail too', async () => {
        const project = createProject();
        const deps = createDeps();
        const seen: string[] = [];

        (deps.deployApp as jest.Mock).mockImplementation(
            async (_path, _pkg, _cmd, _log, onProgress?: (m: string, s?: string) => void) => {
                onProgress?.('Building…');
                return { success: true, data: { url: 'https://app/api' } };
            },
        );

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, {
            ...deps,
            onProgress: (m: string) => seen.push(m),
        } as never);

        expect(seen).toEqual(['Building…']);
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
            deployApp: jest.fn().mockResolvedValue({ success: false, error: 'runtime rejected it' }),
        });

        await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps as never);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[INTEGRATION_ENTRY.id]?.error).toMatch(
            /runtime rejected it/,
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

describe('removeAppBuilderComponent — a removed mesh is a mesh the project no longer wants', () => {
    // LIVE 2026-08-04: removing the mesh cleared its keyed entry and nothing else,
    // so `hasMesh` (showDashboard.ts — instance OR state OR dependency) stayed
    // true. The card kept rendering over a component that no longer existed,
    // stuck on "Checking requirements…", and its Redeploy answered "This project
    // does not have an API Mesh component."
    //
    // Removing a mesh means the project does not want one. A selected-but-absent
    // mesh is an error state, not a resting state, so the SELECTION goes too.
    function meshProject(): Project {
        return createProject({
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: ['eds-accs-mesh', 'some-other-dep'],
                integrations: [],
                appBuilder: [],
            } as never,
            componentInstances: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    name: 'Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'ready',
                    path: '/proj/components/eds-accs-mesh',
                } as never,
            },
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh' },
                    endpoint: 'https://mesh/graphql',
                },
            },
        });
    }

    it('drops the mesh from componentSelections.dependencies', async () => {
        const project = meshProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'eds-accs-mesh', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        // All THREE arms of showDashboard's `hasMesh` must fall together —
        // instance OR keyed-state OR dependency. Any one left standing keeps the
        // card alive over a component that no longer exists.
        expect(saved.componentSelections?.dependencies).toEqual(['some-other-dep']);
        expect(saved.appBuilderComponents?.['eds-accs-mesh']).toBeUndefined();
        expect(saved.componentInstances?.['eds-accs-mesh']).toBeUndefined();
    });

    it('leaves the selections of a NON-mesh removal alone', async () => {
        const project = createProject({
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: ['eds-accs-mesh'],
                integrations: [],
                appBuilder: ['erp-bridge'],
            } as never,
            appBuilderComponents: {
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                },
            },
        });
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        // The mesh dependency belongs to the mesh, not to the integration.
        expect(saved.componentSelections?.dependencies).toEqual(['eds-accs-mesh']);
    });
});

describe('removeAppBuilderComponent (integration)', () => {
    function integrationProject(): Project {
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
                'erp-bridge': {
                    id: 'erp-bridge',
                    name: 'ERP',
                    type: 'app-builder',
                    status: 'ready',
                    path: '/proj/components/erp-bridge',
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
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                    url: 'https://app/api',
                },
            },
        });
    }

    it('runs `aio app undeploy` under withOrgContext, clears the entry, deletes the folder', async () => {
        const project = integrationProject();
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(result.success).toBe(true);
        const undeployCall = deps.commandManager.execute.mock.calls.find((c: unknown[]) =>
            String(c[0]).includes('app undeploy')
        );
        expect(undeployCall).toBeDefined();
        expect(mockWithOrgContext).toHaveBeenCalled();
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(
            project,
            'erp-bridge',
            true
        );

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.['erp-bridge']).toBeUndefined();
        // The sibling mesh appBuilderComponent is untouched.
        expect(persisted.appBuilderComponents?.['commerce-mesh']).toBeDefined();
    });

    it('does NOT republish (integration provided no env vars)', async () => {
        const project = integrationProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it('does NOT call api-mesh:delete for an integration', async () => {
        const project = integrationProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const meshDeleteCall = deps.commandManager.execute.mock.calls.find((c: unknown[]) =>
            String(c[0]).includes('api-mesh:delete')
        );
        expect(meshDeleteCall).toBeUndefined();
    });
});

describe('removeAppBuilderComponent (mesh)', () => {
    function meshProject(): Project {
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

    it('runs `aio api-mesh:delete` under withOrgContext and clears the entry', async () => {
        const project = meshProject();
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, 'commerce-mesh', deps as never);

        expect(result.success).toBe(true);
        const deleteCall = deps.commandManager.execute.mock.calls.find((c: unknown[]) =>
            String(c[0]).includes('api-mesh:delete')
        );
        expect(deleteCall).toBeDefined();
        expect(mockWithOrgContext).toHaveBeenCalled();

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.['commerce-mesh']).toBeUndefined();
    });

    it('regenerates the storefront config WITHOUT the mesh env vars after removal', async () => {
        const project = meshProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'commerce-mesh', deps as never);

        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
        const republishArg = deps.republishStorefront.mock.calls[0][0] as { project: Project };
        // The project passed to republish no longer carries the mesh endpoint.
        expect(republishArg.project.appBuilderComponents?.['commerce-mesh']).toBeUndefined();
    });

    it('does NOT call `aio app undeploy` for a mesh', async () => {
        const project = meshProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'commerce-mesh', deps as never);

        const undeployCall = deps.commandManager.execute.mock.calls.find((c: unknown[]) =>
            String(c[0]).includes('app undeploy')
        );
        expect(undeployCall).toBeUndefined();
    });

    it('errors when removing an unknown id', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, 'nope', deps as never);

        expect(result.success).toBe(false);
    });
});
