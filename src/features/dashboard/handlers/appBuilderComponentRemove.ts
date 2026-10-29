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
import { undoErpSetup, type TeardownOutcome } from './erpSetupTeardown';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { getAppBuilderComponent, setAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { narrateOutcomeToModal, progressSurfaceOf } from '@/core/vscode/operationProgress';
import type { CredentialStore } from '@/features/ai/server/savedRestCredential';
import type {
    RuntimeCleanupSummary,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderRemoveRun';
import type { CommerceDetachResult } from '@/features/app-builder/services/erpDetach';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { isMeshNeededByPackage, MESH_NEEDED_NOTE } from '@/features/components/services/demoPackageLoader';
import {
    buildDefaultRunnerDeps,
    buildRunnerDepsContext,
    resolveAppManagementAuth,
} from '@/features/project-creation/services/appBuilderComponentRunnerDeps';
import { applyErpOwnership } from '@/features/project-creation/services/erpOwnershipReconcile';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler, HandlerContext, HandlerResponse } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

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
        (report) => removeWithCleanup(context, project, id, report, force),
    );
}

/**
 * Remove one App Builder component, guards already passed: the runner's removal,
 * what it could not clean up as notes, and the ERP ownership pass after an ERP
 * leaves its integration. The Integrations screen's Remove and an Edit that
 * unticks an integration (PL-75) both remove through this.
 *
 * @param context - the handler context
 * @param project - the project to remove from; updated and saved by the removal
 * @param id - the component's id
 * @param report - the stage reporter
 * @param force - the SC's "Remove anyway"
 * @returns the removal's outcome, with its notes as warnings
 */
export async function removeWithCleanup(
    context: HandlerContext,
    project: Project,
    id: string,
    report: (stage: string, step?: string, position?: OperationPosition) => void,
    force = false,
): Promise<GuardableResult> {
    // Read before the removal: the entry leaves the map when it succeeds.
    const integrationId = getAppBuilderComponent(project, id)?.usedBy;
    const neededMesh =
        getAppBuilderComponent(project, id)?.kind === 'mesh' &&
        isMeshNeededByPackage(project.selectedPackage, project.selectedStack);
    // The store setup first, while the integration's Commerce access stands: its undo and
    // the record of old values go with the entry (owner, 2026-10-19). Not fully undone, the
    // removal stops and the card offers Remove anyway, which goes ahead and says what is left.
    const undone = await undoErpSetup(context, project, id, report);
    if (undone && undone.failed.length > 0 && !force) return stopForSetup(context, project, id, undone);
    if (undone) context.logger.info(`[ERP] Removing ${id}: ${[...undone.done, ...undone.failed].join(' ') || 'nothing to undo in the store'}`);
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
    const removed = withCleanupNotes(
        getAppBuilderComponent(project, id)?.name ?? id,
        await removeAppBuilderComponent(project, id, deps, { force }),
    );
    // Said again after the removal, for an agent: it never saw the Remove dialog.
    if (removed.success && neededMesh) {
        return { ...removed, warnings: [...(removed.warnings ?? []), MESH_NEEDED_NOTE] };
    }
    if (removed.success && undone && undone.failed.length > 0) {
        const left = `Its store setup was not fully undone: ${undone.failed.join(' ')}`;
        return { ...removed, warnings: [...(removed.warnings ?? []), left] };
    }
    if (!removed.success || !integrationId) return removed;
    return applyOwnershipAfterRemove(removed, project, integrationId, report, context.context?.secrets);
}

/**
 * Stop a removal whose store setup was not fully undone: nothing is taken down, the card says
 * why and offers Remove anyway (the `removalStopped` a stopped teardown sets).
 */
async function stopForSetup(context: HandlerContext, project: Project, id: string, undone: TeardownOutcome): Promise<GuardableResult> {
    const why = `Its store setup was not fully undone, so nothing was removed. ${undone.failed.join(' ')}`;
    const state = getAppBuilderComponent(project, id);
    if (state) await context.stateManager.saveProject(setAppBuilderComponent(project, id, { ...state, removalStopped: why }));
    await postComponentsSnapshot(context);
    return { success: false, error: why, code: ErrorCode.COMPONENT_REMOVAL_STOPPED };
}

/**
 * An ERP taken out of its integration leaves the others' rules as they were, so the products it
 * owned belonged to nobody (AB-70). The pass runs when the integration still serves an ERP:
 * one left goes back to owning everything; several left are told how many products nobody
 * owns. What the pass says joins the removal's warnings; the removal stands either way.
 */
async function applyOwnershipAfterRemove(
    removed: GuardableResult,
    project: Project,
    integrationId: string,
    report: (message: string, subMessage?: string) => void,
    credentials: CredentialStore | undefined,
): Promise<GuardableResult> {
    if (systemsUsedBy(project, integrationId, getAppBuilderComponentCatalog()).length === 0) return removed;
    const authManager = ServiceLocator.getAuthenticationService();
    const applied = await applyErpOwnership(
        project,
        integrationId,
        {
            authManager,
            credentials,
            getAuth: () => resolveAppManagementAuth(project, authManager),
            onProgress: (step) => report(OPERATION_STAGES.loadingErpDemoData.label, step),
        },
        'remove',
    );
    const said =
        applied.status === 'applied'
            ? applied.notes
            : [`Ownership was not applied across the remaining ERPs: ${applied.detail} Use Fill ERPs from Commerce on the integration's card.`];
    return { ...removed, warnings: [...(removed.warnings ?? []), ...said] };
}

/**
 * What the removal left behind, as notes ahead of its own: they belong to the run's
 * result so the modal ends on them, not to the answer alone.
 */
function withCleanupNotes(displayName: string, removed: GuardableResult): GuardableResult {
    if (!removed.success) return removed;
    const notes = [
        runtimeWarning(displayName, removed.runtimeCleanup),
        detachWarning(displayName, removed.commerceDetach),
        ...(removed.warnings ?? []),
    ].filter((note): note is string => Boolean(note));
    return notes.length > 0 ? { ...removed, warnings: notes } : removed;
}

/** Tell the grid the removal ended, and answer the caller — with any cleanup warning. */
async function reportRemoveOutcome(
    context: HandlerContext,
    result: GuardableResult,
    progress: 'modal' | undefined,
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
        result.warnings ?? [],
        progress,
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
        const progress = progressSurfaceOf(payload);
        const result = await runRemove(context, project, id, { progress, force: payload?.force === true });
        return reportRemoveOutcome(context, result, progress);
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
