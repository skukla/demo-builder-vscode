/**
 * Deploy-contract runner — the REMOVE arm's guards, defaults and caller sync.
 *
 * `appBuilderComponentRunner-remove.test.ts` pins what a removal UNWINDS.
 * This file pins the decisions around that unwinding which nothing constrained:
 * the shapes a half-built project can be in (no instances, no selections, no
 * config map), the exact shell invocation the teardown makes, the app-management
 * uninstall pass's two guards, and the caller-reference sync that stops a later
 * save resurrecting what was just removed.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockListDeclaredPackageNames = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
    listDeclaredPackageNames: (...a: unknown[]) => mockListDeclaredPackageNames(...a),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    INTEGRATION_ENTRY,
    MESH_ENTRY,
    createDeps,
    createProject,
} from './appBuilderComponentRunner.testUtils';

const APP_ID = INTEGRATION_ENTRY.id;
const MESH_ID = MESH_ENTRY.id;

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    mockListDeclaredPackageNames.mockResolvedValue([]);
});

function integrationProject(overrides: Partial<Project> = {}): Project {
    return createProject({
        componentInstances: {
            [APP_ID]: {
                id: APP_ID,
                name: 'ERP Bridge',
                type: 'app-builder',
                status: 'deployed',
                path: `/proj/components/${APP_ID}`,
            },
        },
        appBuilderComponents: {
            [APP_ID]: {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'acme', repo: 'erp-bridge' },
            },
        },
        ...overrides,
    });
}

function meshProject(overrides: Partial<Project> = {}): Project {
    return createProject({
        componentInstances: {
            [MESH_ID]: {
                id: MESH_ID,
                name: 'Commerce Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
                path: `/proj/components/${MESH_ID}`,
            },
        },
        appBuilderComponents: {
            [MESH_ID]: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                endpoint: 'https://mesh/graphql',
            },
        },
        ...overrides,
    });
}

/** The `aio app undeploy` call, if the teardown made one. */
function undeployCall(deps: ReturnType<typeof createDeps>) {
    return deps.commandManager.execute.mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('app undeploy')
    );
}

// =============================================================================
// The exact shell invocation the teardown makes
// =============================================================================

describe('removeAppBuilderComponent — the teardown command', () => {
    it("runs the undeploy in the component's own directory, with the shared options", async () => {
        const deps = createDeps();

        await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(deps.commandManager.execute).toHaveBeenCalledWith('aio app undeploy', {
            cwd: `/proj/components/${APP_ID}`,
            useNodeVersion: 'auto',
            enhancePath: true,
            streaming: true,
            shell: true,
            timeout: TIMEOUTS.LONG,
        });
    });

    it('runs the mesh delete with the same options', async () => {
        const deps = createDeps();

        await removeAppBuilderComponent(meshProject(), MESH_ID, deps);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(MESH_DELETE_COMMAND, {
            cwd: `/proj/components/${MESH_ID}`,
            useNodeVersion: 'auto',
            enhancePath: true,
            streaming: true,
            shell: true,
            timeout: TIMEOUTS.LONG,
        });
    });

    // A keyed entry can outlive its local folder — a manual delete, a failed
    // clone, a project restored from a manifest alone. The teardown still runs;
    // it simply has no directory to run in.
    it('still tears down when the project holds no component instances', async () => {
        const project = integrationProject({ componentInstances: undefined });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, APP_ID, deps);

        expect(result.success).toBe(true);
        expect(undeployCall(deps)?.[1]).toMatchObject({ cwd: undefined });
    });

    it('still tears down when the instance map has no entry for this id', async () => {
        const project = integrationProject({ componentInstances: {} });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, APP_ID, deps);

        expect(result.success).toBe(true);
        expect(undeployCall(deps)?.[1]).toMatchObject({ cwd: undefined });
    });

    // Reversibility: a teardown that cannot reach Adobe must still let the SC
    // clear the component locally and try again. The remote failure is
    // best-effort by design.
    it('a failing remote teardown still clears the component locally', async () => {
        const deps = createDeps();
        deps.commandManager.execute.mockRejectedValue(new Error('namespace unreachable'));

        const result = await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(result.success).toBe(true);
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(
            expect.anything(),
            APP_ID,
            true
        );
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.appBuilderComponents?.[APP_ID]).toBeUndefined();
    });
});

// =============================================================================
// The package inventory read before the teardown
// =============================================================================

describe('removeAppBuilderComponent — the declared-package inventory', () => {
    // A mesh has no OpenWhisk packages to attribute, and its config files are not
    // an app config. Reading them would be a filesystem call for nothing.
    it('is never read for a mesh removal', async () => {
        const deps = createDeps();

        await removeAppBuilderComponent(meshProject(), MESH_ID, deps);

        expect(mockListDeclaredPackageNames).not.toHaveBeenCalled();
    });

    it("is read from the integration's own directory", async () => {
        const deps = createDeps();

        await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(mockListDeclaredPackageNames).toHaveBeenCalledWith(`/proj/components/${APP_ID}`);
    });

    it('an unreadable app config leaves the removal to proceed on the derived name alone', async () => {
        mockListDeclaredPackageNames.mockRejectedValue(new Error('app.config.yaml is gone'));
        const deps = createDeps();

        const result = await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(result.success).toBe(true);
        expect(result.runtimeCleanup?.verified).toBe(true);
    });
});

// =============================================================================
// Half-built projects — the shapes a removal must survive
// =============================================================================

describe('removeAppBuilderComponent — a project missing the maps it unwinds', () => {
    it('removes a mesh from a project that records no selections at all', async () => {
        const project = meshProject({ componentSelections: undefined });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, MESH_ID, deps);

        expect(result.success).toBe(true);
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.componentSelections).toBeUndefined();
    });

    it('removes an integration from a project that records no selections at all', async () => {
        const project = integrationProject({ componentSelections: undefined });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, APP_ID, deps);

        expect(result.success).toBe(true);
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.componentSelections).toBeUndefined();
    });

    it('removes an integration from a project that holds no component configs', async () => {
        const project = integrationProject({ componentConfigs: undefined });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, APP_ID, deps);

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// The republish gate — an EMPTY provided map is not a provided map
// =============================================================================

describe('removeAppBuilderComponent — republish only for a component that provided vars', () => {
    it('does not republish for an entry whose provided map is empty', async () => {
        const project = meshProject();
        project.appBuilderComponents![MESH_ID].providesEnvVars = {};
        const deps = createDeps();

        await removeAppBuilderComponent(project, MESH_ID, deps);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it('republishes for an entry that did provide one', async () => {
        const project = meshProject();
        project.appBuilderComponents![MESH_ID].providesEnvVars = {
            MESH_ENDPOINT: 'https://mesh/graphql',
        };
        const deps = createDeps();

        await removeAppBuilderComponent(project, MESH_ID, deps);

        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// The caller's own reference — a later save must not resurrect what went
// =============================================================================

describe("removeAppBuilderComponent — the caller's project reference is synced", () => {
    it('drops the removed id from the caller’s picks and configs, not only from the copy', async () => {
        const project = integrationProject();
        project.componentApiPicks = { [APP_ID]: ['ErpSDK'], 'order-sync': ['EventsSDK'] };
        project.componentConfigs = {
            [APP_ID]: { ERP_URL: 'https://erp' },
            'order-sync': { SYNC_URL: 'https://sync' },
        };
        const deps = createDeps();

        await removeAppBuilderComponent(project, APP_ID, deps);

        expect(project.componentApiPicks).toEqual({ 'order-sync': ['EventsSDK'] });
        expect(project.componentConfigs).toEqual({ 'order-sync': { SYNC_URL: 'https://sync' } });
    });
});

// =============================================================================
// The app-management uninstall pass — both of its guards
// =============================================================================

describe('removeAppBuilderComponent — the Commerce uninstall pass', () => {
    const APP_MGMT: AppBuilderComponentCatalogEntry = {
        ...INTEGRATION_ENTRY,
        lifecycle: 'app-management',
        layout: 'extension',
    };

    it('runs for a catalog integration that declares the app-management lifecycle', async () => {
        const project = integrationProject();
        project.appBuilderComponents![APP_ID].deployedUrls = { 'web/app': 'https://app/api' };
        const uninstallAppManagement = jest.fn().mockResolvedValue({ status: 'uninstalled' });
        const deps = createDeps({ catalog: [APP_MGMT], uninstallAppManagement });

        await removeAppBuilderComponent(project, APP_ID, deps);

        expect(uninstallAppManagement).toHaveBeenCalledWith(
            project,
            { 'web/app': 'https://app/api' },
            expect.any(Function)
        );
    });

    // A MESH never has a Commerce-side installation, whatever a same-named
    // catalog entry claims. The guard is on the persisted KIND, not the entry.
    it('never runs for a mesh, even when a catalog entry of that id says app-management', async () => {
        const meshLifecycleEntry: AppBuilderComponentCatalogEntry = {
            ...MESH_ENTRY,
            lifecycle: 'app-management',
        };
        const uninstallAppManagement = jest.fn().mockResolvedValue({ status: 'uninstalled' });
        const deps = createDeps({ catalog: [meshLifecycleEntry], uninstallAppManagement });

        const result = await removeAppBuilderComponent(meshProject(), MESH_ID, deps);

        expect(result.success).toBe(true);
        expect(uninstallAppManagement).not.toHaveBeenCalled();
    });

    it("forwards the uninstaller's progress to the caller", async () => {
        const onProgress = jest.fn();
        const deps = createDeps({
            catalog: [APP_MGMT],
            onProgress,
            uninstallAppManagement: jest.fn(
                async (
                    _p: Project,
                    _urls: Record<string, string> | undefined,
                    report?: (message: string) => void
                ) => {
                    report?.('Removing the Commerce association...');
                    return { status: 'uninstalled' as const };
                }
            ),
        });

        await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(onProgress).toHaveBeenCalledWith('Removing the Commerce association...');
    });

    // Headless and MCP callers wire no onProgress at all. The uninstaller still
    // reports, and the forwarding must be a no-op rather than a throw — a throw
    // here is swallowed by the best-effort catch, so the only way to see it is
    // that the uninstall never reached its own end.
    it('lets an uninstaller finish when nobody is listening for progress', async () => {
        let finished = false;
        const deps = createDeps({
            catalog: [APP_MGMT],
            uninstallAppManagement: jest.fn(
                async (
                    _p: Project,
                    _urls: Record<string, string> | undefined,
                    report?: (message: string) => void
                ) => {
                    report?.('Removing the Commerce association...');
                    finished = true;
                    return { status: 'uninstalled' as const };
                }
            ),
        });

        const result = await removeAppBuilderComponent(integrationProject(), APP_ID, deps);

        expect(finished).toBe(true);
        expect(result.success).toBe(true);
    });
});
