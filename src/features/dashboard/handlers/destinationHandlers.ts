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

import {
    postComponentsSnapshot,
    postDestination,
    postMeshStatus,
    postRowStatus,
    runGuards,
} from './appBuilderComponentHandlers';
import { withProgressRegister } from '@/core/vscode/progressRegister';
import { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/app-builder/services/appBuilderComponentRunnerDeps';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type MessageHandler } from '@/types/handlers';

/** One side of the destination — the flow's `adobeProject` / `adobeWorkspace` shape. */
// The request wire shapes live in @/types/webviewRequests — ONE declaration
// shared with the webview senders. Re-exported for existing importers.
export type {
    DestinationRef,
    SetProjectDestinationRequestPayload as SetProjectDestinationPayload,
} from '@/types/webviewRequests';
import type { DestinationRef, SetProjectDestinationRequestPayload as SetProjectDestinationPayload } from '@/types/webviewRequests';

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

    const target = `${nextProject.title ?? nextProject.name} \u00b7 ${nextWorkspace.title ?? nextWorkspace.name}`;
    return withProgressRegister(
        {
            // No card options: the destination is PROJECT-scoped, so no single card
            // owns it. The per-component cards are telegraphed separately, by the
            // callback handed to the migration below — this slot has no card to fill,
            // which is NOT the same as the move having nothing to say.
            title: `Changing destination to ${target}`,
        },
        (report) =>
            applyDestination(
                context,
                project,
                // Re-stated rather than relying on narrowing: the guard above proves
                // both ids, but TS does not carry that through the object type.
                { ...nextProject, id: nextProject.id as string },
                { ...nextWorkspace, id: nextWorkspace.id as string },
                target,
                report,
            ),
    );
};

/**
 * The destination change itself, inside the notification.
 *
 * Split out so the handler stays under the complexity limit and so every slow
 * step — guards included — runs where the user can see it.
 */
async function applyDestination(
    context: Parameters<typeof handleSetProjectDestination>[0],
    project: NonNullable<Awaited<ReturnType<HandlerContext['stateManager']['getCurrentProject']>>>,
    // `id` REQUIRED, not optional: the caller already rejects a half-specified
    // destination, and stating it here is what lets that guard do its job. The
    // narrowing does not survive the function boundary on its own.
    nextProject: DestinationRef & { id: string },
    nextWorkspace: DestinationRef & { id: string },
    target: string,
    report: (message: string) => void,
): Promise<ReturnType<MessageHandler<SetProjectDestinationPayload>>> {
    // First line, per the progress-register contract: the auth check is the slow
    // step and the user must see why they are waiting.
    // Unchanged destination: no confirmation to show, nothing to persist, nothing
    // to move. Worth catching HERE as well as in the migration — the migration's
    // guard prevents the data loss, this one prevents a pointless "move 2
    // integrations?" prompt for a change that is not one.
    if (
        project.adobe?.projectId === nextProject.id &&
        project.adobe?.workspace === nextWorkspace.id
    ) {
        context.logger.info(`[Destination] Already deploying to ${target} — no change.`);
        return { success: true, data: { destination: project.adobe, unchanged: true } };
    }

    report('Checking requirements…');
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    // NO confirmation. It was a modal in front of an operation that destroys
    // nothing and is undone by changing the destination back — the prompt cost a
    // click on every change and bought no safety (user decision 2026-08-07). The
    // notification and the per-card status say what is happening while it happens,
    // which is the affordance that actually helps.
    const movingIds = Object.keys(project.appBuilderComponents ?? {});

    // Captured BEFORE the overwrite: once `project.adobe` holds the new ref the old
    // target is otherwise unrecoverable, and an aborted move needs it to point the
    // project back. Nothing undeploys from it — a move only ever deploys.
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

    report(`Saving destination ${target}…`);
    await context.stateManager.saveProject(project);
    context.logger.info(
        `[Destination] Now deploying to ${project.adobe.projectTitle ?? project.adobe.projectName}` +
            ` · ${project.adobe.workspaceTitle ?? project.adobe.workspaceName}`,
    );

    // Immediately after the write, not after the move: `project.adobe` already
    // names the new target, every deploy below goes there, and a header still
    // showing the old one would be wrong for the whole run.
    await postDestination(project.adobe);

    if (movingIds.length === 0) {
        return { success: true, data: { destination: project.adobe, previous } };
    }

    // `project.adobe` already holds the NEW destination, so every deploy the
    // migration runs targets it; `previous` is what addresses the old one.
    report(`Moving ${movingIds.length} integration${movingIds.length === 1 ? '' : 's'}…`);
    const deps = buildDefaultRunnerDeps(
        await buildRunnerDepsContext(context, project),
        // The deploy tails narrate their own steps; surface them as sub-messages so
        // a multi-minute move reads as progress rather than a stalled notification.
        (message, subMessage) => report(subMessage ? `${message} ${subMessage}` : message),
    );
    // The per-card channel. The notification above is project-scoped and owns no
    // card, so this is what keeps the grid from reading DEPLOYED throughout a move
    // that may run for minutes.
    const move = await moveAppBuilderComponentsToDestination(
        project,
        previous,
        deps,
        (id, status, message) => routeCardStatus(project, id, status, message),
    );
    // Seed the grid from the persisted map either way: on success the entries carry
    // new deploy records, and on an abort the rows that landed must not stay stuck
    // on a transient status.
    await postComponentsSnapshot(context);
    if (!move.success) {
        // The migration pointed the project back; the header must follow, or it
        // keeps naming a destination the project no longer uses.
        await postDestination(project.adobe);
        const cause = move.failed.map((f) => `${f.id} (${f.error})`).join(', ');
        // Nothing was destroyed — the move only ever deploys — so the previous
        // destination is still serving everything and the project points back at
        // it. The components that DID land at the new destination stay there, and
        // saying so beats implying the run left no trace.
        const landed = move.moved.length
            ? ` ${move.moved.join(', ')} did reach it and were left in place.`
            : '';
        return {
            success: false,
            error:
                `Could not move ${cause}. Your integrations are all still running at the` +
                ` previous destination, which is unchanged.${landed}`,
            data: { destination: project.adobe, previous, move },
        };
    }

    if (move.moved.length > 0 && previous) {
        context.logger.info(
            `[Destination] ${move.moved.length} integration(s) now deploy to ${target}. The` +
                ' previous deployments were left in place — remove them from the Adobe' +
                ' Developer Console if you no longer need them.',
        );
    }
    return { success: true, data: { destination: project.adobe, previous, move } };
}


export const destinationHandlers = defineHandlers({
    setProjectDestination: handleSetProjectDestination,
});

/**
 * Send one component's status to the channel ITS card actually reads.
 *
 * Two card surfaces, two unrelated channels: integrations take a keyed row push,
 * the mesh takes the mesh status channel. Picking between them belongs here rather
 * than in the migration — the same caller-owns-the-channel split that
 * `progressRegister` documents for the single-component paths.
 *
 * @param project - carries the keyed map, which is where `kind` lives
 * @param id - the component id
 * @param status - what to show
 * @param message - the in-flight line
 */
async function routeCardStatus(
    project: { appBuilderComponents?: Record<string, { kind?: string }> },
    id: string,
    status: 'deploying' | 'deployed' | 'error',
    message?: string,
): Promise<void> {
    if (project.appBuilderComponents?.[id]?.kind === 'mesh') {
        await postMeshStatus(status, message);
        return;
    }
    await postRowStatus(id, status, message);
}
