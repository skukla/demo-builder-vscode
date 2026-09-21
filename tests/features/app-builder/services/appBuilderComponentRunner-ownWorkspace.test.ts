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

import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
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
