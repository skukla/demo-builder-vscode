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
 * project — which is why changing it has to move them all (step-02). An integration
 * with a workspace of its own (AB-23) moves only when the Adobe project changes, and
 * then by leaving the old one (see `confirmLeavingAdobeProject`).
 *
 * @module features/dashboard/handlers/destinationHandlers
 */

import * as vscode from 'vscode';
import {
    postComponentsSnapshot,
    postDestination,
    postMeshStatus,
    postRowStatus,
    runGuards,
} from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { DESTINATION_OPERATION_ID } from '@/core/utils/operationIds';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import { withOperationProgress, type ReportStage } from '@/core/vscode/withOperationProgress';
import { moveAppBuilderComponentsToDestination } from '@/features/app-builder/services/appBuilderComponentMigration';
import { ownWorkspaceGroups } from '@/features/app-builder/services/componentRelocation';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type MessageHandler } from '@/types/handlers';
import type { Project } from '@/types/base';
import type {
    DestinationRef,
    SetProjectDestinationRequestPayload as SetProjectDestinationPayload,
} from '@/types/webviewRequests';

/** One side of the destination — the flow's `adobeProject` / `adobeWorkspace` shape. */
// The request wire shapes live in @/types/webviewRequests — ONE declaration
// shared with the webview senders. Re-exported for existing importers.
export type {
    DestinationRef,
    SetProjectDestinationRequestPayload as SetProjectDestinationPayload,
} from '@/types/webviewRequests';

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
export const handleSetProjectDestination: MessageHandler<SetProjectDestinationPayload> =
    narrateOutcomeToModal(async (context, payload) => {
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
    return withOperationProgress(
        {
            // No card options: the destination is PROJECT-scoped, so no single card
            // owns it. The per-component cards are telegraphed separately, by the
            // callback handed to the migration below — this slot has no card to fill,
            // which is NOT the same as the move having nothing to say.
            id: payload?.id ?? DESTINATION_OPERATION_ID,
            title: `Changing destination to ${target}`,
            inModal: progressSurfaceOf(payload) === 'modal',
        },
        async (report) =>
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
    },
    (payload) => payload?.id ?? '',
);

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
    report: ReportStage,
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

    // The machine name is not decoration: an App Management install sends it, and a
    // destination stored without one leaves the project unable to install any such
    // integration. The failure surfaces days later as "missing workspaceName", naming
    // a field the SC has never seen (Kukla Bodea, moved 2026-09-18, found 2026-09-20).
    // Refused here rather than resolved, so the caller that omitted it is the thing
    // that gets fixed.
    if (!nextWorkspace.name) {
        return {
            success: false,
            error:
                'That workspace was given without its name, so the destination was not ' +
                'changed. Choose the workspace again.',
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    report(OPERATION_STAGES.checkingRequirements.label);
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    // NO confirmation for a move that only deploys. It was a modal in front of an
    // operation that destroys nothing and is undone by changing the destination
    // back — the prompt cost a click on every change and bought no safety (user
    // decision 2026-08-07). The notification and the per-card status say what is
    // happening while it happens, which is the affordance that actually helps.
    //
    // The exception deletes live resources, so it is confirmed: leaving the Adobe
    // project removes each integration with a workspace of its own from it (AB-23,
    // owner 2026-09-21).
    if (!(await confirmLeavingAdobeProject(project, nextProject))) {
        return { success: false, cancelled: true, error: 'The destination was not changed.' };
    }
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

    report('Saving the new destination');
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
    // One stage for the whole move, carrying WHICH of the N is in flight. The
    // count is known up front, which is the only case a count is allowed (PL-59).
    const at = (id: string): { index: number; total: number; name: string } => ({
        index: Math.max(1, movingIds.indexOf(id) + 1),
        total: movingIds.length,
        name: project.appBuilderComponents?.[id]?.name ?? id,
    });
    let moving = movingIds[0] ?? '';
    report('Moving the integrations', undefined, at(moving));
    const deps = buildDefaultRunnerDeps(
        await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
        // The deploy tails narrate their own steps; surface them as sub-messages so
        // a multi-minute move reads as progress rather than a stalled notification.
        (message, subMessage) =>
            report(
                'Moving the integrations',
                subMessage ? `${message} — ${subMessage}` : message,
                at(moving),
            ),
    );
    // The per-card channel. The notification above is project-scoped and owns no
    // card, so this is what keeps the grid from reading DEPLOYED throughout a move
    // that may run for minutes.
    const move = await moveAppBuilderComponentsToDestination(
        project,
        previous,
        deps,
        (id, status, message) => {
            // The migration moves them one at a time; its card updates are what
            // say which one, so the modal's count follows them.
            moving = id;
            routeCardStatus(project, id, status, message);
        },
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
        // Once an integration's old side is gone the project is NOT pointed back,
        // and there is no previous destination still serving it to point at.
        if (!move.rolledBack && previous) {
            return {
                success: false,
                error:
                    `Moved to ${target}, but ${cause} did not finish. Redeploy it to try ` +
                    'again: it is already set up in the new Adobe project.',
                data: { destination: project.adobe, previous, move },
            };
        }
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

/**
 * Ask before a move that takes integrations out of their Adobe project.
 *
 * Only a change of Adobe PROJECT asks, and only when an integration has a workspace
 * of its own: that workspace belongs to the project being left, so the move removes
 * the integration there — uninstalled from Commerce, its workspace deleted — before
 * adding it again (componentRelocation).
 *
 * @returns true to go ahead
 */
async function confirmLeavingAdobeProject(
    project: Project,
    nextProject: DestinationRef & { id: string },
): Promise<boolean> {
    const current = project.adobe?.projectId;
    const groups = current && current !== nextProject.id ? ownWorkspaceGroups(project) : [];
    if (groups.length === 0) return true;

    const from = project.adobe?.projectTitle ?? project.adobe?.projectName ?? 'the previous Adobe project';
    const to = nextProject.title ?? nextProject.name ?? nextProject.id;
    const names = groups.map((group) => group.workspace.title ?? group.workspace.name).join(', ');
    const theirs = groups.length > 1 ? 'their workspaces' : 'its workspace';
    const choice = await vscode.window.showWarningMessage(
        `Move this project to ${to}?`,
        {
            modal: true,
            detail:
                `${names} will be removed from ${from} — uninstalled from Commerce and ` +
                `${theirs} deleted — then added again in ${to}.`,
        },
        'Move',
    );
    return choice === 'Move';
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
