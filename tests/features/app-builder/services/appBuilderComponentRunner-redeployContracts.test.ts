/**
 * Deploy-contract runner — the REDEPLOY arm's guards and entry resolution.
 *
 * `appBuilderComponentRunner.test.ts` pins that a redeploy re-runs only its own
 * tail. This file pins the decisions around it that nothing constrained: the
 * two halves of the not-found guard, whether the CATALOG or the persisted state
 * describes the component being redeployed, the fnm preparation gate, and a
 * throw inside the run being answered rather than propagated.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { MESH_ENTRY, createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ID = MESH_ENTRY.id;

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

/**
 * A project holding a deployed mesh — instance and keyed entry.
 *
 * The keyed entry deliberately declares NO `providesEnvVars`: what a component
 * provides is the catalog's answer, and the entry-resolution tests below turn on
 * the runner asking the catalog rather than the persisted copy.
 */
function deployedMeshProject(overrides: Partial<Project> = {}): Project {
    return createProject({
        componentInstances: {
            [ID]: {
                id: ID,
                name: 'Commerce Mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
                path: `/proj/components/${ID}`,
            },
        },
        appBuilderComponents: {
            [ID]: {
                kind: 'mesh',
                status: 'deployed',
                name: 'Commerce Mesh',
                source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                endpoint: 'https://mesh/graphql',
            },
        },
        ...overrides,
    });
}

// =============================================================================
// The not-found guard — BOTH halves
// =============================================================================

describe('deployAppBuilderComponent — a component it cannot locate on disk', () => {
    it('answers not found when the project holds no component instances at all', async () => {
        const project = deployedMeshProject({ componentInstances: undefined });
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, ID, deps);

        expect(result).toEqual({ success: false, error: `AppBuilderComponent "${ID}" not found.` });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    // A keyed entry with an instance that has no path is the shape a
    // half-finished install leaves behind. Redeploying it would run the tail
    // against an undefined working directory.
    it('answers not found when the instance carries no path', async () => {
        const project = deployedMeshProject();
        project.componentInstances![ID].path = '';
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, ID, deps);

        expect(result).toEqual({ success: false, error: `AppBuilderComponent "${ID}" not found.` });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Which description of the component the redeploy uses
// =============================================================================

describe('deployAppBuilderComponent — catalog first, persisted state second', () => {
    // The catalog says a mesh provides MESH_ENDPOINT; this project's persisted
    // entry does not. Reading the catalog is what makes the storefront republish
    // with the freshly deployed endpoint — reading the stale entry would skip it.
    it('takes what the component PROVIDES from the catalog, not the stored entry', async () => {
        const project = deployedMeshProject();
        const deps = createDeps();

        const result = await deployAppBuilderComponent(project, ID, deps);

        expect(result.success).toBe(true);
        expect(deps.republishStorefront).toHaveBeenCalledTimes(1);
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.appBuilderComponents?.[ID]?.providesEnvVars).toEqual({
            MESH_ENDPOINT: 'https://mesh/graphql',
        });
    });
});

// =============================================================================
// The fnm preparation gate
// =============================================================================

describe('deployAppBuilderComponent — Node preparation', () => {
    const WITH_NODE: AppBuilderComponentCatalogEntry = { ...MESH_ENTRY, nodeVersion: '24' };

    it('prepares the Node major the entry declares, before the tail', async () => {
        const ensureNodeVersion = jest.fn().mockResolvedValue(undefined);
        const deps = createDeps({ catalog: [WITH_NODE], ensureNodeVersion });

        const result = await deployAppBuilderComponent(deployedMeshProject(), ID, deps);

        expect(result.success).toBe(true);
        expect(ensureNodeVersion).toHaveBeenCalledWith('24');
        expect(ensureNodeVersion.mock.invocationCallOrder[0]).toBeLessThan(
            (deps.deployMesh as jest.Mock).mock.invocationCallOrder[0]
        );
    });

    it('never touches fnm for an entry that declares no Node version', async () => {
        const ensureNodeVersion = jest.fn().mockResolvedValue(undefined);
        const deps = createDeps({ ensureNodeVersion });

        await deployAppBuilderComponent(deployedMeshProject(), ID, deps);

        expect(ensureNodeVersion).not.toHaveBeenCalled();
    });

    it('a Node preparation failure aborts the redeploy with fnm’s own reason', async () => {
        const deps = createDeps({
            catalog: [WITH_NODE],
            ensureNodeVersion: jest.fn().mockResolvedValue('fnm could not install Node 24'),
        });

        const result = await deployAppBuilderComponent(deployedMeshProject(), ID, deps);

        expect(result).toEqual({ success: false, error: 'fnm could not install Node 24' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});

// =============================================================================
// A throw inside the redeploy is an answer, not a crash
// =============================================================================

describe('deployAppBuilderComponent — a collaborator that throws', () => {
    it('returns the failure instead of propagating it', async () => {
        const deps = createDeps({
            saveProject: jest.fn().mockRejectedValue(new Error('manifest is read-only')),
        });

        const result = await deployAppBuilderComponent(deployedMeshProject(), ID, deps);

        expect(result).toEqual({ success: false, error: 'manifest is read-only' });
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });
});
