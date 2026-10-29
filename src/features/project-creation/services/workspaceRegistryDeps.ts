/**
 * The runner's deps that reach a component's Adobe WORKSPACE through the auth service's
 * entity units (`workspaceOps` and `extensionPoints`):
 * deleting it when the component is removed (AB-23), and reading and unpublishing what
 * the deploy put in Adobe's extension-point registry on it (2026-10-08). Each names the
 * project's org and Console project outright, so an agent's selection (which never
 * reaches the auth cache) cannot send the call to the wrong project.
 *
 * Split from `appBuilderComponentRunnerDeps.ts`, which the registry pair took over its
 * size limit.
 *
 * @module features/project-creation/services/workspaceRegistryDeps
 */

import type { AppBuilderComponentRunnerDeps } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project } from '@/types/base';

/** The three workspace deps the runner declares. */
export type WorkspaceRegistryDeps = Pick<
    AppBuilderComponentRunnerDeps,
    'deleteComponentWorkspace' | 'workspaceExtensionPointsOf' | 'removeWorkspaceExtensionPoints'
>;

/** The project's org and Console project, as the workspace ops take them. */
function targetOf(project: Project): { orgId?: string; projectId?: string } {
    return { orgId: project.adobe?.organization, projectId: project.adobe?.projectId };
}

/**
 * Build the workspace deps over the auth service's entity units.
 *
 * @param authManager - the auth service the handler resolved at the boundary (ADR-015)
 * @returns the deps, ready to spread into the runner's
 */
export function buildWorkspaceRegistryDeps(authManager: AuthenticationService): WorkspaceRegistryDeps {
    const entities = () => authManager.getEntityServices();
    return {
        deleteComponentWorkspace: async (project, workspace) => {
            const result = await (await entities()).workspaceOps.deleteWorkspace(workspace.id, {
                ...targetOf(project),
                workspaceName: workspace.name,
            });
            // Adobe's own words reach the log rather than a guess. The one refusal the AB-2
            // spike predicted here — a workspace still holding live event registrations
            // answering 409 — has never been seen: three deletes on 2026-09-20 answered 200
            // in about three seconds, none holding registrations. If it starts happening,
            // the project teardown's registration sweep is the thing to reuse.
            return 'error' in result ? { error: result.error } : undefined;
        },
        workspaceExtensionPointsOf: async (project, workspace) =>
            (await entities()).extensionPoints.listWorkspaceExtensionPoints(
                workspace.id,
                targetOf(project),
            ),
        removeWorkspaceExtensionPoints: async (project, workspace, keys) => {
            const result = await (await entities()).extensionPoints.removeWorkspaceExtensionPoints(
                workspace.id,
                keys,
                targetOf(project),
            );
            return 'error' in result ? { error: result.error } : result.remaining;
        },
    };
}
