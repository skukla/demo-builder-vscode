/**
 * Recording the Adobe project and workspace a project's integrations deploy to.
 *
 * Lifted out of `applyDestination` so an add can record the destination its own steps
 * chose before it makes anything. The add handler cannot import the destination
 * handler: that one imports the component handlers, which import the add.
 *
 * @module features/dashboard/handlers/projectDestinationRecord
 */

import { sendProjectDestinationUpdate } from '@/features/dashboard/services/projectPanelPushes';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { DestinationRef } from '@/types/webviewRequests';

/**
 * The org the destination is recorded under.
 *
 * A stored org carries over untouched (sign-in owns org selection). A project
 * that has NONE — created from a package that deploys no mesh, so creation
 * recorded no Adobe context — takes the signed-in org, the only one its IMS
 * token can address. Left empty, the destination looked complete while every
 * credential read refused it: "no Adobe org, project and workspace to take a
 * credential from" (2026-09-30, a project pointed at a fresh Console project).
 */
async function orgOf(
    project: Project,
    context: HandlerContext,
): Promise<{ organization: string; organizationName: string | undefined }> {
    const stored = project.adobe?.organization;
    if (stored) return { organization: stored, organizationName: project.adobe?.organizationName };
    // Resolved, not read from the cache: the cache is empty until something
    // resolves the org, and after a window reload nothing has (measured
    // 2026-09-30 — the cached read answered undefined and wrote '' again).
    const signedIn = await context.authManager?.getEntityServices()
        .then((units) => units.resolver.getCurrentOrganization());
    return { organization: signedIn?.id ?? '', organizationName: signedIn?.name };
}

/**
 * Write the destination onto the project, save it, and tell the open screens.
 *
 * @param context - the handler context (state manager, auth, logger)
 * @param project - the project, changed in place and saved
 * @param nextProject - the Adobe project to deploy to
 * @param nextWorkspace - its workspace
 */
export async function recordDestination(
    context: HandlerContext,
    project: Project,
    nextProject: DestinationRef & { id: string },
    nextWorkspace: DestinationRef & { id: string },
): Promise<void> {
    project.adobe = {
        ...project.adobe,
        ...(await orgOf(project, context)),
        authenticated: project.adobe?.authenticated ?? true,
        projectId: nextProject.id,
        projectName: nextProject.name ?? nextProject.title ?? nextProject.id,
        projectTitle: nextProject.title,
        workspace: nextWorkspace.id,
        workspaceName: nextWorkspace.name,
        workspaceTitle: nextWorkspace.title,
    };
    await context.stateManager.saveProject(project);
    context.logger.info(
        `[Destination] Now deploying to ${project.adobe.projectTitle ?? project.adobe.projectName}` +
            ` · ${project.adobe.workspaceTitle ?? project.adobe.workspaceName}`,
    );
    // Immediately after the write: `project.adobe` already names the new target,
    // every deploy after this goes there, and a header still showing the old one
    // would be wrong for the whole run.
    await sendProjectDestinationUpdate(project.adobe);
}
