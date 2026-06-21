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
 */

import type { Project } from '@/types/base';
import type { DeployableCatalogEntry } from '@/types/deployables';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockWithOrgContext = jest.fn(
    (_target: unknown, fn: () => Promise<unknown>) => fn(),
);
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) =>
        mockWithOrgContext(target, fn),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    addDeployable,
    deployDeployable,
    removeDeployable,
} from '@/features/app-builder/services/deployableRunner';

// =============================================================================
// Catalog entries
// =============================================================================

const MESH_ENTRY: DeployableCatalogEntry = {
    id: 'commerce-mesh',
    name: 'Commerce Mesh',
    description: 'API Mesh',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    requiredApis: ['GraphQLServiceSDK'],
    providesEnvVars: ['MESH_ENDPOINT'],
};

const INTEGRATION_ENTRY: DeployableCatalogEntry = {
    id: 'erp-bridge',
    name: 'ERP Bridge',
    description: 'Custom integration',
    kind: 'integration',
    source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
    requiredApis: ['AdobeIOManagementAPISDK'],
};

// =============================================================================
// Mock factories
// =============================================================================

interface ComponentManagerLike {
    installComponent: jest.Mock;
    removeComponent: jest.Mock;
}

function createComponentManager(): ComponentManagerLike {
    return {
        installComponent: jest.fn(async (project: Project, def: { id: string; name?: string }) => {
            const instance = {
                id: def.id,
                name: def.name ?? def.id,
                type: 'app-builder',
                status: 'ready',
                path: `/proj/components/${def.id}`,
                lastUpdated: new Date(),
            };
            project.componentInstances = project.componentInstances ?? {};
            project.componentInstances[def.id] = instance as never;
            return { success: true, component: instance };
        }),
        removeComponent: jest.fn(async (project: Project, id: string) => {
            if (project.componentInstances) {
                delete project.componentInstances[id];
            }
        }),
    };
}

function createCommandManager() {
    return {
        execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    };
}

function createLogger() {
    return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

function createDeps(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        componentManager: createComponentManager(),
        commandManager: createCommandManager(),
        logger: createLogger(),
        saveProject: jest.fn().mockResolvedValue(undefined),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        // The two deploy tails (mocked; production wires the real ones).
        deployMesh: jest.fn().mockResolvedValue({
            success: true,
            data: { meshId: 'mesh-1', endpoint: 'https://mesh/graphql' },
        }),
        deployApp: jest.fn().mockResolvedValue({
            success: true,
            data: { url: 'https://app/api', deployedUrls: { 'web/app': 'https://app/api' } },
        }),
        // API subscriber (mocked).
        subscribeRequiredApis: jest.fn().mockResolvedValue(undefined),
        // Storefront republish (mocked; production wires republishStorefrontConfig).
        republishStorefront: jest.fn().mockResolvedValue({ success: true }),
        // The catalog of all deployables (for the union subscribe).
        catalog: [MESH_ENTRY, INTEGRATION_ENTRY],
        secrets: {} as never,
        ...overrides,
    };
}

function createProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/proj',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        componentInstances: {},
        ...overrides,
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation(
        (_target: unknown, fn: () => Promise<unknown>) => fn(),
    );
});

// =============================================================================
// addDeployable — MESH
// =============================================================================

describe('addDeployable (mesh)', () => {
    it('subscribes APIs, clones, deploys via the mesh tail, and persists a mesh deployable', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addDeployable(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.subscribeRequiredApis).toHaveBeenCalledTimes(1);
        expect(deps.componentManager.installComponent).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.deployables?.[MESH_ENTRY.id];
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

        await addDeployable(project, MESH_ENTRY, deps as never);

        expect(deps.deployApp).not.toHaveBeenCalled();
    });

    it('runs the deploy inside withOrgContext targeted from project.adobe (never aio console select)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addDeployable(project, MESH_ENTRY, deps as never);

        expect(mockWithOrgContext).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789',
            }),
            expect.any(Function),
        );
        const selectCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('console') && String(c[0]).includes('select'),
        );
        expect(selectCall).toBeUndefined();
    });

    it('regenerates + republishes the storefront config with the resolved endpoint', async () => {
        const project = createProject();
        const deps = createDeps();

        await addDeployable(project, MESH_ENTRY, deps as never);

        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
        const republishArg = deps.republishStorefront.mock.calls[0][0] as { project: Project };
        // Republish receives the project carrying the provided endpoint.
        const entry = republishArg.project.deployables?.[MESH_ENTRY.id];
        expect(entry?.providesEnvVars?.MESH_ENDPOINT).toBe('https://mesh/graphql');
    });

    it('subscribes the UNION of all catalog deployables (not just the one being added)', async () => {
        const project = createProject();
        const deps = createDeps();

        await addDeployable(project, MESH_ENTRY, deps as never);

        const subscribedDeployables = deps.subscribeRequiredApis.mock.calls[0][0] as DeployableCatalogEntry[];
        expect(subscribedDeployables).toEqual(expect.arrayContaining([MESH_ENTRY, INTEGRATION_ENTRY]));
    });
});

// =============================================================================
// addDeployable — INTEGRATION
// =============================================================================

describe('addDeployable (integration)', () => {
    it('builds with a derived ow.package, deploys via the app tail, persists url/deployedUrls', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await addDeployable(project, INTEGRATION_ENTRY, deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).not.toHaveBeenCalled();

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.deployables?.[INTEGRATION_ENTRY.id];
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

        await addDeployable(project, INTEGRATION_ENTRY, deps as never);

        // The app deploy tail is handed the resolved ow.package distinct from defaults.
        const owPackage = deps.deployApp.mock.calls[0][1] as string;
        expect(owPackage).toBeTruthy();
        expect(owPackage).not.toBe('application');
        expect(owPackage).not.toBe('dx-excshell-1');
    });

    it('does NOT republish the storefront for an integration that provides no env vars', async () => {
        const project = createProject();
        const deps = createDeps();

        await addDeployable(project, INTEGRATION_ENTRY, deps as never);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it('guards provider-before-consumer: a mesh-consuming integration with no mesh deployed errors', async () => {
        const project = createProject();
        const deps = createDeps();
        const consumer: DeployableCatalogEntry = {
            ...INTEGRATION_ENTRY,
            id: 'mesh-consumer',
            envSchema: [{ name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh', providedBy: 'commerce-mesh' }],
        };

        const result = await addDeployable(project, consumer, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/provider|mesh/i);
        expect(deps.deployApp).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Partial-failure handling
// =============================================================================

describe('addDeployable partial-failure', () => {
    it('clone OK but deploy fails → persists status=error and retains the local folder', async () => {
        const project = createProject();
        const deps = createDeps({
            deployMesh: jest.fn().mockResolvedValue({ success: false, error: 'deploy boom' }),
        });

        const result = await addDeployable(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/deploy boom/);

        // The deployable entry is persisted with status 'error' (coherent state, not cleared).
        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        const entry = persisted.deployables?.[MESH_ENTRY.id];
        expect(entry?.status).toBe('error');
        // Local folder retained for retry: removeComponent must NOT have been called.
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
    });

    it('clone failure → no deploy, no persisted entry', async () => {
        const project = createProject();
        const componentManager = createComponentManager();
        componentManager.installComponent.mockResolvedValue({ success: false, error: 'clone failed' });
        const deps = createDeps({ componentManager });

        const result = await addDeployable(project, MESH_ENTRY, deps as never);

        expect(result.success).toBe(false);
        expect(deps.deployMesh).not.toHaveBeenCalled();
        expect(project.deployables?.[MESH_ENTRY.id]).toBeUndefined();
    });
});

// =============================================================================
// deployDeployable (redeploy)
// =============================================================================

describe('deployDeployable (redeploy)', () => {
    function meshDeployedProject(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh', name: 'Mesh', type: 'dependency',
                    subType: 'mesh', status: 'ready', path: '/proj/components/commerce-mesh',
                } as never,
            },
            deployables: {
                'commerce-mesh': {
                    kind: 'mesh', status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                    endpoint: 'https://mesh/graphql',
                    providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
                },
            },
        });
    }

    it('re-runs only the mesh tail for a mesh deployable, under withOrgContext', async () => {
        const project = meshDeployedProject();
        const deps = createDeps();

        const result = await deployDeployable(project, 'commerce-mesh', deps as never);

        expect(result.success).toBe(true);
        expect(deps.deployMesh).toHaveBeenCalledTimes(1);
        expect(deps.deployApp).not.toHaveBeenCalled();
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        expect(mockWithOrgContext).toHaveBeenCalled();
    });

    it('errors when the id is unknown', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await deployDeployable(project, 'nope', deps as never);

        expect(result.success).toBe(false);
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    it('re-runs only the integration tail for an integration deployable', async () => {
        const project = createProject({
            componentInstances: {
                'erp-bridge': {
                    id: 'erp-bridge', name: 'ERP', type: 'app-builder',
                    status: 'ready', path: '/proj/components/erp-bridge',
                } as never,
            },
            deployables: {
                'erp-bridge': {
                    kind: 'integration', status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                    url: 'https://app/api',
                },
            },
        });
        const deps = createDeps();

        await deployDeployable(project, 'erp-bridge', deps as never);

        expect(deps.deployApp).toHaveBeenCalledTimes(1);
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// removeDeployable
// =============================================================================

describe('removeDeployable (integration)', () => {
    function integrationProject(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh', name: 'Mesh', type: 'dependency',
                    subType: 'mesh', status: 'ready', path: '/proj/components/commerce-mesh',
                } as never,
                'erp-bridge': {
                    id: 'erp-bridge', name: 'ERP', type: 'app-builder',
                    status: 'ready', path: '/proj/components/erp-bridge',
                } as never,
            },
            deployables: {
                'commerce-mesh': {
                    kind: 'mesh', status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                    endpoint: 'https://mesh/graphql',
                    providesEnvVars: { MESH_ENDPOINT: 'https://mesh/graphql' },
                },
                'erp-bridge': {
                    kind: 'integration', status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-bridge' },
                    url: 'https://app/api',
                },
            },
        });
    }

    it('runs `aio app undeploy` under withOrgContext, clears the entry, deletes the folder', async () => {
        const project = integrationProject();
        const deps = createDeps();

        const result = await removeDeployable(project, 'erp-bridge', deps as never);

        expect(result.success).toBe(true);
        const undeployCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('app undeploy'),
        );
        expect(undeployCall).toBeDefined();
        expect(mockWithOrgContext).toHaveBeenCalled();
        expect(deps.componentManager.removeComponent).toHaveBeenCalledWith(project, 'erp-bridge', true);

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.deployables?.['erp-bridge']).toBeUndefined();
        // The sibling mesh deployable is untouched.
        expect(persisted.deployables?.['commerce-mesh']).toBeDefined();
    });

    it('does NOT republish (integration provided no env vars)', async () => {
        const project = integrationProject();
        const deps = createDeps();

        await removeDeployable(project, 'erp-bridge', deps as never);

        expect(deps.republishStorefront).not.toHaveBeenCalled();
    });

    it('does NOT call api-mesh:delete for an integration', async () => {
        const project = integrationProject();
        const deps = createDeps();

        await removeDeployable(project, 'erp-bridge', deps as never);

        const meshDeleteCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('api-mesh:delete'),
        );
        expect(meshDeleteCall).toBeUndefined();
    });
});

describe('removeDeployable (mesh)', () => {
    function meshProject(): Project {
        return createProject({
            componentInstances: {
                'commerce-mesh': {
                    id: 'commerce-mesh', name: 'Mesh', type: 'dependency',
                    subType: 'mesh', status: 'ready', path: '/proj/components/commerce-mesh',
                } as never,
            },
            deployables: {
                'commerce-mesh': {
                    kind: 'mesh', status: 'deployed',
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

        const result = await removeDeployable(project, 'commerce-mesh', deps as never);

        expect(result.success).toBe(true);
        const deleteCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('api-mesh:delete'),
        );
        expect(deleteCall).toBeDefined();
        expect(mockWithOrgContext).toHaveBeenCalled();

        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.deployables?.['commerce-mesh']).toBeUndefined();
    });

    it('regenerates the storefront config WITHOUT the mesh env vars after removal', async () => {
        const project = meshProject();
        const deps = createDeps();

        await removeDeployable(project, 'commerce-mesh', deps as never);

        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
        const republishArg = deps.republishStorefront.mock.calls[0][0] as { project: Project };
        // The project passed to republish no longer carries the mesh endpoint.
        expect(republishArg.project.deployables?.['commerce-mesh']).toBeUndefined();
    });

    it('does NOT call `aio app undeploy` for a mesh', async () => {
        const project = meshProject();
        const deps = createDeps();

        await removeDeployable(project, 'commerce-mesh', deps as never);

        const undeployCall = deps.commandManager.execute.mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('app undeploy'),
        );
        expect(undeployCall).toBeUndefined();
    });

    it('errors when removing an unknown id', async () => {
        const project = createProject();
        const deps = createDeps();

        const result = await removeDeployable(project, 'nope', deps as never);

        expect(result.success).toBe(false);
    });
});
