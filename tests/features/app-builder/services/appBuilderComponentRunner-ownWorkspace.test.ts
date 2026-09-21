/**
 * A component deploys into its OWN workspace when it records one (AB-23 slice 1).
 *
 * The target is built by `targetFor` and handed to `withOrgContext`, which injects
 * `AIO_CONSOLE_*` onto every `aio` call underneath. So the workspace a deploy lands
 * in is decided entirely by that one argument — and a mock cannot see a wrong one:
 * every collaborator answers the same whatever target it was wrapped in, so a deploy
 * aimed at the wrong namespace reports success and every other assertion passes.
 * That is why these assert the ARGUMENT rather than the outcome (ADR-016, and four
 * live no-ops in this repo that a mocked collaborator could not see).
 *
 * The fallback is the load-bearing half. Every component in every project created
 * before this records no workspace, so "absent means the project's own" is what
 * makes the field safe to add with no migration.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
    removeAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { MESH_ENTRY, createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ID = MESH_ENTRY.id;

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

/** A deployed mesh, optionally sitting in a workspace of its own. */
function projectWithMesh(workspace?: { id: string; name: string; title?: string }): Project {
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
                ...(workspace ? { workspace } : {}),
            },
        },
    });
}

/** The target the deploy actually ran under. */
function wrappedTarget(): { orgId?: string; projectId?: string; workspaceId?: string } {
    expect(mockWithOrgContext).toHaveBeenCalled();
    return mockWithOrgContext.mock.calls[0][0] as ReturnType<typeof wrappedTarget>;
}

it("targets the component's OWN workspace when it records one", async () => {
    const project = projectWithMesh({ id: 'ws-mesh-own', name: 'CommerceMeshq3k9' });

    await deployAppBuilderComponent(project, ID, createDeps());

    expect(wrappedTarget()).toEqual(
        expect.objectContaining({
            orgId: 'org-123',
            projectId: 'proj-456',
            // NOT the project's 'ws-789'.
            workspaceId: 'ws-mesh-own',
        }),
    );
});

it("falls back to the PROJECT's workspace when the component records none", async () => {
    const project = projectWithMesh();

    await deployAppBuilderComponent(project, ID, createDeps());

    expect(wrappedTarget()).toEqual(
        expect.objectContaining({
            orgId: 'org-123',
            projectId: 'proj-456',
            workspaceId: 'ws-789',
        }),
    );
});

// Only the workspace moves. A component cannot be in another org or another
// Console project, so those two must come from the project whatever it records.
it('never moves the org or the Console project', async () => {
    const project = projectWithMesh({ id: 'ws-mesh-own', name: 'CommerceMeshq3k9' });

    await deployAppBuilderComponent(project, ID, createDeps());

    const target = wrappedTarget();
    expect(target.orgId).toBe(project.adobe!.organization);
    expect(target.projectId).toBe(project.adobe!.projectId);
});

// =============================================================================
// The ADD path: a workspace it cannot make is a HARD failure
// =============================================================================

describe('addAppBuilderComponent — the workspace comes first', () => {
    /**
     * Carrying on would deploy into the PROJECT's workspace, where an App
     * Management app's fixed package names overwrite whatever is already there
     * (AB-2 spike, proven live). That is the collision this item exists to remove,
     * so the add stops instead of half-succeeding.
     */
    it("refuses the add, and clones nothing, when the workspace can't be made", async () => {
        const deps = createDeps();
        deps.createComponentWorkspace.mockResolvedValue({
            error: 'Couldn\'t make an Adobe workspace for "Commerce Mesh". Quota exceeded.',
        });

        const result = await addAppBuilderComponent(createProject(), MESH_ENTRY, deps);

        expect(result).toEqual({
            success: false,
            error: 'Couldn\'t make an Adobe workspace for "Commerce Mesh". Quota exceeded.',
        });
        expect(deps.componentManager.installComponent).not.toHaveBeenCalled();
        expect(deps.deployMesh).not.toHaveBeenCalled();
    });

    /**
     * Order, not merely presence. The subscribe entitles a WORKSPACE's credential,
     * so running it first would grant the access to the project's workspace and
     * leave the component's own without it — a deploy that then fails on
     * permissions with everything apparently configured.
     */
    it('makes the workspace BEFORE subscribing APIs', async () => {
        const deps = createDeps();
        const order: string[] = [];
        deps.createComponentWorkspace.mockImplementation(async () => {
            order.push('workspace');
            return undefined;
        });
        deps.subscribeRequiredApis.mockImplementation(async () => {
            order.push('subscribe');
        });

        await addAppBuilderComponent(createProject(), MESH_ENTRY, deps);

        expect(order).toEqual(['workspace', 'subscribe']);
    });
});

// =============================================================================
// The REMOVE path: the workspace goes with the component
// =============================================================================

describe('removeAppBuilderComponent — releasing the workspace', () => {
    it('deletes the workspace the component held', async () => {
        const project = projectWithMesh({ id: 'ws-mesh-own', name: 'CommerceMeshq3k9' });
        const deps = createDeps();

        const result = await removeAppBuilderComponent(project, ID, deps);

        expect(result.success).toBe(true);
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(
            expect.anything(),
            { id: 'ws-mesh-own', name: 'CommerceMeshq3k9' },
        );
    });

    it('deletes nothing when the component held no workspace', async () => {
        const deps = createDeps();

        await removeAppBuilderComponent(projectWithMesh(), ID, deps);

        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
    });

    /**
     * By the time this runs the component is undeployed and cleared, so refusing
     * would hand the SC a half-removed integration to argue with. An undeleted
     * workspace is untidy; a stuck removal is not.
     */
    it('still succeeds when Adobe refuses the delete, and clears the component anyway', async () => {
        const project = projectWithMesh({ id: 'ws-mesh-own', name: 'CommerceMeshq3k9' });
        const deps = createDeps();
        deps.deleteComponentWorkspace.mockResolvedValue({
            error: 'Read-only project cannot be deleted (400).',
        });

        const result = await removeAppBuilderComponent(project, ID, deps);

        expect(result.success).toBe(true);
        // The component really is gone — the refusal leaves a stray workspace, not a
        // half-removed integration.
        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[ID]).toBeUndefined();
    });
});
