/**
 * Deploy-contract runner — the REMOVE arm.
 *
 * Split out of appBuilderComponentRunner.test.ts, which covered add + redeploy +
 * remove in one file and grew past the 500-line limit. The split follows the
 * axis the runner itself dispatches on, so a change to one arm touches one file
 * (the keyed-state slice already lives in appBuilderComponentRunner-keyed-state).
 *
 * Remove is the arm with the most state to unwind — remote undeploy/delete, the
 * keyed entry, the dependency mirror, and the storefront republish that must run
 * WITHOUT the removed component's provided vars — so it earns its own file.
 *
 * Org-context discipline mirrors the sibling: withOrgContext is mocked to record
 * its target and run the callback (no global mutation).
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

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

    it('drops the removed mesh\u2019s componentConfigs entry — an orphan copy outlives every write', async () => {
        // The fan-out audit (2026-08-23): Configure writes a shared field only to
        // SELECTED declaring components, but two readers sweep the WHOLE map —
        // and configGenerator gives mesh entries override priority. A removed
        // mesh's leftover copy of ADOBE_COMMERCE_URL would beat the backend's
        // fresh value on the next config.json publish. The orphan dies with the
        // component.
        const project = meshProject();
        project.componentConfigs = {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://fresh.example/graphql' },
            'eds-accs-mesh': { ACCS_GRAPHQL_ENDPOINT: 'https://stale.example/graphql' },
        };
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'eds-accs-mesh', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        expect(saved.componentConfigs?.['eds-accs-mesh']).toBeUndefined();
        expect(saved.componentConfigs?.['adobe-commerce-accs']).toEqual({
            ACCS_GRAPHQL_ENDPOINT: 'https://fresh.example/graphql',
        });
    });

    /**
     * The integration half of the same rule, found by probing live (2026-08-17).
     *
     * `add_integration` then `remove_integration` left `app-builder-shell` sitting
     * in `componentSelections.appBuilder` while its keyed entry and its component
     * instance were both gone. The mesh branch above had been fixed on exactly the
     * argument that applies here — a selected-but-absent component is an error
     * state, not a resting one — and nobody carried it across.
     *
     * It matters most at RESET: `projectResetService` rebuilds the component list
     * from the selections, so a stale id is a component reset tries to re-clone.
     *
     * `reconcileComponentSelections` cannot do this. It is additive by design (its
     * own docstring says so), because a wizard selection that is not installed yet
     * is legitimate mid-creation. Its docstring also assumed removal already
     * cleaned up after itself — true for meshes, and this is what made it true for
     * integrations.
     */
    function integrationSelectionProject(): Project {
        return createProject({
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: ['eds-accs-mesh'],
                integrations: [],
                appBuilder: ['erp-bridge', 'order-sync'],
            } as never,
            appBuilderComponents: {
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                },
            },
        });
    }

    it('drops the integration from componentSelections.appBuilder', async () => {
        const project = integrationSelectionProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        expect(saved.componentSelections?.appBuilder).toEqual(['order-sync']);
        // The other two arms must fall with it, as they already did.
        expect(saved.appBuilderComponents?.['erp-bridge']).toBeUndefined();
    });

    it('leaves the mesh DEPENDENCY of a non-mesh removal alone', async () => {
        const project = integrationSelectionProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        // The mesh dependency belongs to the mesh, not to the integration —
        // removing an integration must not revoke it.
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

    // AI-1o's inverse, and it was broken for longer: removing the last App
    // Builder component left its seven skills behind forever. Nothing else
    // re-asks the question — the activation sweep rewrites content only when
    // AI_CONTEXT_VERSION moves, and the freshness badge fires only on a MISSING
    // package, which a removal never produces.
    it('re-derives the AI bundle after a removal, from the project that was persisted', async () => {
        const project = integrationProject();
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(deps.refreshAiBundle).toHaveBeenCalledTimes(1);
        // The CLEARED project, not the caller's stale reference — the skill set
        // is derived from composition, so refreshing off the pre-removal copy
        // would rewrite exactly the skills we just decided it should not have.
        const refreshed = deps.refreshAiBundle.mock.calls[0][0] as Project;
        expect(refreshed.appBuilderComponents?.['erp-bridge']).toBeUndefined();
    });

    it('still succeeds when the bundle refresh throws', async () => {
        // A deploy or removal that landed must not report failure because a
        // markdown file could not be rewritten. The sweep repairs it later.
        const project = integrationProject();
        const deps = createDeps({
            refreshAiBundle: jest.fn().mockRejectedValue(new Error('disk full')),
        });

        const result = await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(result.success).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    });

    // Attribution only pays off if removal spends it. `componentApiPicks` records
    // WHICH integration wanted an API precisely so this moment can answer "is it
    // safe to drop?" — but nothing dropped anything: three writers, no remover.
    // Harmless until a dashboard add started attributing picks (2026-08-04);
    // after that a removed integration's APIs stayed in resolveDesiredApis' union
    // forever, so the next reconcile PUT kept subscribing for a component that no
    // longer exists and Manage APIs kept listing it.
    it('drops the removed integration’s API picks', async () => {
        const project = integrationProject();
        project.componentApiPicks = {
            'erp-bridge': ['ErpSDK'],
            'order-sync': ['EventsSDK'],
        };
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.componentApiPicks).toEqual({ 'order-sync': ['EventsSDK'] });
    });

    it('leaves UNATTRIBUTED picks alone — they have no owner to have been removed', async () => {
        // `__existing__` holds picks made from the union view (Manage APIs) and
        // migrated legacy ones. No component claims them, so no removal can prove
        // them safe to drop — dropping them here would silently unsubscribe APIs
        // the user chose deliberately.
        const project = integrationProject();
        project.componentApiPicks = {
            'erp-bridge': ['ErpSDK'],
            __existing__: ['commerceeventing'],
        };
        const deps = createDeps();

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.componentApiPicks).toEqual({ __existing__: ['commerceeventing'] });
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

describe('removeAppBuilderComponent — the Commerce uninstall pass (AB-4)', () => {
    // `aio app undeploy` removes the ACTIONS only; what the app's installer
    // created (event registrations, binding packages, Commerce-side eventing
    // config, the association) is removed by the app's own uninstall API —
    // which must be called BEFORE the undeploy takes that API down with the
    // actions (residue measured live, 2026-08-27).
    const KIT_URLS = {
        'app-management/installation':
            'https://ns.adobeioruntime.net/api/v1/web/app-management/installation',
    };

    function appManagementProject(id: string): Project {
        return createProject({
            appBuilderComponents: {
                [id]: {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Kit App',
                    source: {
                        owner: 'adobe',
                        repo: 'commerce-integration-starter-kit',
                        branch: 'main',
                    },
                    deployedUrls: KIT_URLS,
                },
            } as never,
            componentInstances: {
                [id]: {
                    id,
                    name: 'Kit App',
                    type: 'app-builder',
                    status: 'ready',
                    path: `/proj/components/${id}`,
                } as never,
            },
        });
    }

    function appManagementCatalogEntry(id: string) {
        return {
            id,
            name: 'Kit App',
            description: 'App Management app',
            kind: 'integration' as const,
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
            layout: 'extension' as const,
            lifecycle: 'app-management' as const,
        };
    }

    it('uninstalls from Commerce BEFORE the undeploy, with the persisted URLs', async () => {
        const project = appManagementProject('kit-app');
        const uninstallAppManagement = jest.fn().mockResolvedValue({ status: 'uninstalled' });
        const deps = createDeps({
            catalog: [appManagementCatalogEntry('kit-app')],
            uninstallAppManagement,
        });

        const result = await removeAppBuilderComponent(project, 'kit-app', deps as never);

        expect(result.success).toBe(true);
        expect(uninstallAppManagement).toHaveBeenCalledWith(
            project,
            KIT_URLS,
            expect.any(Function)
        );
        // Order: the app's API must still exist when the uninstall runs.
        const uninstallOrder = uninstallAppManagement.mock.invocationCallOrder[0];
        const undeployOrder = (deps.commandManager.execute as jest.Mock).mock
            .invocationCallOrder[0];
        expect(uninstallOrder).toBeLessThan(undeployOrder);
    });

    it('recognizes a SEEDED kit instance outside the catalog by its source', async () => {
        // A kit clone under a user-chosen id has no catalog row; entryFromState
        // routes through buildCustomIntegrationEntry, whose source recognition
        // restores lifecycle: 'app-management' from the bundled catalog.
        const project = appManagementProject('my-erp-sync');
        const uninstallAppManagement = jest.fn().mockResolvedValue({ status: 'uninstalled' });
        const deps = createDeps({ uninstallAppManagement });

        await removeAppBuilderComponent(project, 'my-erp-sync', deps as never);

        expect(uninstallAppManagement).toHaveBeenCalled();
    });

    it('never runs for a standalone integration or a mesh', async () => {
        const uninstallAppManagement = jest.fn().mockResolvedValue({ status: 'uninstalled' });
        const project = createProject({
            appBuilderComponents: {
                'erp-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP Bridge',
                    source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
                },
            } as never,
            componentInstances: {
                'erp-bridge': {
                    id: 'erp-bridge',
                    type: 'app-builder',
                    status: 'ready',
                    path: '/proj/components/erp-bridge',
                } as never,
            },
        });
        const deps = createDeps({ uninstallAppManagement });

        await removeAppBuilderComponent(project, 'erp-bridge', deps as never);

        expect(uninstallAppManagement).not.toHaveBeenCalled();
    });

    it('a failed or throwing uninstall never blocks the remove', async () => {
        const project = appManagementProject('kit-app');
        const deps = createDeps({
            catalog: [appManagementCatalogEntry('kit-app')],
            uninstallAppManagement: jest.fn().mockRejectedValue(new Error('api down')),
        });

        const result = await removeAppBuilderComponent(project, 'kit-app', deps as never);

        expect(result.success).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Commerce uninstall warning')
        );
        const saved = (deps.saveProject as jest.Mock).mock.calls.at(-1)![0] as Project;
        expect(saved.appBuilderComponents?.['kit-app']).toBeUndefined();
    });
});
