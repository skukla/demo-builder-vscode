/**
 * Removing an App Builder component from the dashboard: guards → the runner's
 * removeAppBuilderComponent, then the outcome — with whatever the removal could
 * not clean up said out loud (Runtime leftovers, Commerce writes not undone, the
 * workspaces it deleted).
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports the handler, so the dashboard handler map keeps working.
 *
 * @module features/dashboard/handlers/appBuilderComponentRemove
 */

import { withGuardedComponentProgress } from './appBuilderComponentGuards';
import {
    answerWithWarnings,
    kindNoun,
    resolveComponentTarget,
    type GuardableResult,
} from './appBuilderComponentOperation';
import { postComponentsSnapshot, refreshProjectStatus } from './appBuilderComponentPush';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import {
    removeAppBuilderComponent,
    type RuntimeCleanupSummary,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import type { CommerceDetachResult } from '@/features/app-builder/services/erpDetach';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';

/** Run the removal inside its progress; the guards run inside it, as for an add. */
function runRemove(
    context: HandlerContext,
    project: Project,
    id: string,
    options: { progress: 'modal' | undefined; force: boolean },
): Promise<GuardableResult> {
    const { progress, force } = options;
    return withGuardedComponentProgress(
        context,
        project,
        {
            title: 'Removing',
            id,
            label: getAppBuilderComponent(project, id)?.name ?? id,
            noun: kindNoun(getAppBuilderComponent(project, id)?.kind),
            progress,
        },
        async (report): Promise<GuardableResult> => {
            // Undeploy is a slow cloud op — telegraph it, or the grid sits frozen
            // while `aio app undeploy` runs with nothing on screen saying so.
            report(OPERATION_STAGES.removing.label);
            // Every phase reports through this — it was left out, so a 3-minute
            // removal read as one line (2026-09-21).
            const deps = buildDefaultRunnerDeps(
                await buildRunnerDepsContext(context, project, {
                    authManager: ServiceLocator.getAuthenticationService(),
                    commandManager: ServiceLocator.getCommandExecutor(),
                }),
                (message, subMessage, position) => report(message, subMessage, position),
            );
            // `force` is the SC's "Remove anyway".
            return removeAppBuilderComponent(project, id, deps, { force });
        },
    );
}

/** Tell the grid the removal ended, and answer the caller — with any cleanup warning. */
async function reportRemoveOutcome(
    context: HandlerContext,
    displayName: string,
    result: GuardableResult,
): Promise<HandlerResponse> {
    if (!result.success) {
        if (result.code !== ErrorCode.COMPONENT_REMOVAL_STOPPED) {
            return { success: false, error: result.error };
        }
        // The stop is saved on the record; the card shows it and offers Remove
        // anyway once the snapshot arrives. The code tells an agent the same.
        await postComponentsSnapshot(context);
        return { success: false, error: result.error, code: result.code };
    }
    // The entry left the persisted map — without a snapshot the card lingers.
    await postComponentsSnapshot(context);
    await refreshProjectStatus(context);

    const cleanup = result.runtimeCleanup;
    const commerceDetach = result.commerceDetach;
    return answerWithWarnings(
        {
            ...(cleanup ? { runtimeCleanup: cleanup } : {}),
            ...(commerceDetach ? { commerceDetach } : {}),
            ...workspaceNote(result.workspacesDeleted),
        },
        [
            runtimeWarning(displayName, cleanup),
            detachWarning(displayName, commerceDetach),
            ...(result.warnings ?? []),
        ],
    );
}

/** Handle 'removeAppBuilderComponent' — guards → D1 removeAppBuilderComponent {id} (confirm is UI-side). */
export const handleRemoveAppBuilderComponent: MessageHandler<{
    id?: string;
    /** The SC's "Remove anyway": only a literal true counts. */
    force?: boolean;
    /** `'modal'` when the SC started it from the integrations screen (PL-59). */
    progress?: 'modal';
}> = narrateOutcomeToModal(
    async (context, payload) => {
        const target = await resolveComponentTarget(context, payload?.id);
        if (!target.ok) return target.error;
        const { id, project } = target;

        // Read before the removal: the entry leaves the map when it succeeds.
        const displayName = getAppBuilderComponent(project, id)?.name ?? id;
        const result = await runRemove(context, project, id, {
            progress: progressSurfaceOf(payload),
            force: payload?.force === true,
        });
        return reportRemoveOutcome(context, displayName, result);
    },
    (payload) => payload?.id,
);

/**
 * What a removal says about the workspaces it deleted: Adobe deletes a workspace's Runtime
 * space about 11 minutes after the workspace (measured 2026-09-27), and a background check
 * confirms it.
 */
function workspaceNote(deleted: string[] | undefined): { workspaces?: string } {
    if (!deleted || deleted.length === 0) return {};
    return {
        workspaces:
            `Deleted the ${deleted.join(' and ')} workspace${deleted.length > 1 ? 's' : ''}. ` +
            'Adobe finishes deleting its Runtime space in about 10 minutes; Demo Builder checks, and says so if it does not.',
    };
}

/** The unfinished Runtime cleanup, said out loud (AB-7), or undefined. */
function runtimeWarning(displayName: string, cleanup: RuntimeCleanupSummary | undefined): string | undefined {
    const stillRunning = cleanup?.failed ?? [];
    if (!cleanup || (stillRunning.length === 0 && cleanup.verified)) {
        return undefined;
    }
    if (cleanup.goneWithWorkspace) {
        const what = stillRunning.length > 0 ? `${stillRunning.length} item(s) Runtime would not delete` : 'what could not be checked';
        return (
            `${displayName} was removed. ${what} go with the ${cleanup.goneWithWorkspace} workspace, ` +
            'which Adobe finishes deleting in about 10 minutes.'
        );
    }
    const detail =
        stillRunning.length > 0
            ? `${stillRunning.length} item(s) are still deployed: ${stillRunning.join(', ')}`
            : (cleanup.note ?? 'the Runtime namespace could not be listed');
    return (
        `${displayName} was removed, but its Runtime cleanup did not finish — ${detail}. ` +
        `Ask the agent to run list_runtime_packages before reusing this project.`
    );
}

/** What of the ERP integration's Commerce writes could not be undone, or undefined. */
function detachWarning(displayName: string, detach: CommerceDetachResult | undefined): string | undefined {
    if (detach?.status !== 'failed') {
        return undefined;
    }
    return `${displayName} was removed, but not everything it changed in Commerce was undone. ${detach.detail ?? ''}`.trim();
}
