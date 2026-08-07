/**
 * Destination handlers — persisting where a project's integrations deploy.
 *
 * `project.adobe` is the single source of truth for the deploy target: every
 * deploy tail resolves it through `buildOrgTargetFromProjectAdobe`. Until this
 * handler existed nothing wrote it after project creation, so the Add Integration
 * flow's destination stage could show a newly-created Console project while the
 * deploy went to the previous one (found live 2026-08-07 — the Console project
 * really was created; only the local binding was left behind).
 *
 * Scope note: the destination is PROJECT-scoped, not per-integration. One
 * `organization` / `projectId` / `workspace` covers every integration in the
 * project — which is why changing it has to move them all (step-02).
 *
 * @module features/dashboard/handlers/destinationHandlers
 */

import * as vscode from 'vscode';
import { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
import { buildDefaultRunnerDeps, buildRunnerDepsContext } from '@/features/app-builder/services/appBuilderComponentRunnerDeps';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type MessageHandler } from '@/types/handlers';

/** One side of the destination — the flow's `adobeProject` / `adobeWorkspace` shape. */
interface DestinationRef {
    id?: string;
    name?: string;
    title?: string;
}

export interface SetProjectDestinationPayload {
    project?: DestinationRef;
    workspace?: DestinationRef;
}

/**
 * Persist the Adobe project/workspace a project's integrations deploy to.
 *
 * The org is deliberately NOT taken from the payload. IMS tokens are org-bound
 * and sign-in owns org selection (`adobe-org-context`); a destination change
 * moves project/workspace WITHIN the current org, so the stored org carries over
 * untouched.
 *
 * @param context - handler context (state manager, logger)
 * @param payload - the chosen project and workspace
 * @returns the saved destination plus the PREVIOUS one, which step-02 needs to
 *          address the old target after this write has overwritten it
 */
export const handleSetProjectDestination: MessageHandler<SetProjectDestinationPayload> = async (
    context,
    payload,
) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const nextProject = payload?.project;
    const nextWorkspace = payload?.workspace;
    if (!nextProject?.id || !nextWorkspace?.id) {
        return {
            success: false,
            error: 'A destination needs both an Adobe project and a workspace.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    // Integrations live in the OLD Console project's Runtime namespace, so a
    // change on a project that has any is a MOVE, not a re-point. Confirm BEFORE
    // persisting: a decline must leave the project exactly as it was.
    const movingIds = Object.keys(project.appBuilderComponents ?? {});
    if (movingIds.length > 0 && !(await confirmMove(movingIds.length, nextProject, nextWorkspace))) {
        return { success: false, error: 'Destination change cancelled.' };
    }

    // Captured BEFORE the overwrite: once `project.adobe` holds the new ref the
    // old target is unrecoverable, and the migration undeploys from it.
    const previous = project.adobe ? { ...project.adobe } : undefined;

    project.adobe = {
        ...project.adobe,
        organization: project.adobe?.organization ?? '',
        organizationName: project.adobe?.organizationName,
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

    if (movingIds.length === 0) {
        return { success: true, data: { destination: project.adobe, previous } };
    }

    // `project.adobe` already holds the NEW destination, so every deploy the
    // migration runs targets it; `previous` is what addresses the old one.
    const deps = buildDefaultRunnerDeps(await buildRunnerDepsContext(context, project));
    const move = await moveAppBuilderComponentsToDestination(project, previous, deps);
    if (!move.success) {
        const cause = move.failed.map((f) => `${f.id} (${f.error})`).join(', ');
        if (move.rolledBack) {
            // Clean abort: everything is back where it started, including the
            // project's own destination — the migration reverted `project.adobe`.
            await context.stateManager.saveProject(project);
            return {
                success: false,
                error: `Could not move ${cause}. Nothing was changed — every integration is`
                    + ' still at the previous destination.',
                data: { destination: project.adobe, previous, move },
            };
        }
        // The undo itself failed. Do NOT describe this as unchanged: the stranded
        // components are gone from the old destination and may or may not be at
        // the new one, and only naming them gives the user somewhere to start.
        const stranded = (move.stranded ?? []).map((f) => `${f.id} (${f.error})`).join(', ');
        return {
            success: false,
            error: `Could not move ${cause}, and rolling back failed for ${stranded}.`
                + ' Those integrations need attention in the Adobe Developer Console.',
            data: { destination: project.adobe, previous, move },
        };
    }

    return { success: true, data: { destination: project.adobe, previous, move } };
};

/** The confirm button's label — compared by identity, so it lives in one place. */
const MOVE_CONFIRM = 'Move integrations';

/**
 * Confirm a move before anything is written.
 *
 * Extracted to keep the handler under the complexity limit, and because the copy
 * is the only warning a user gets that this tears down real Runtime entities.
 *
 * @param count - how many components will move
 * @param nextProject - the destination Adobe project
 * @param nextWorkspace - the destination workspace
 * @returns true when the user confirmed
 */
async function confirmMove(
    count: number,
    nextProject: DestinationRef,
    nextWorkspace: DestinationRef,
): Promise<boolean> {
    const target = `${nextProject.title ?? nextProject.name} · ${nextWorkspace.title ?? nextWorkspace.name}`;
    const choice = await vscode.window.showWarningMessage(
        `Move ${count} integration${count === 1 ? '' : 's'} to ${target}?`
            + ' Each one is deployed to the new destination and then torn down at the old'
            + ' one. Tearing down removes its Adobe I/O Runtime entities and cannot be undone.',
        { modal: true },
        MOVE_CONFIRM,
    );
    return choice === MOVE_CONFIRM;
}

export const destinationHandlers = defineHandlers({
    setProjectDestination: handleSetProjectDestination,
});
