/**
 * The Updates modal's state and its apply, on the projects list (PL-80).
 *
 * Check for Updates checks in its notification (`commands/checkUpdates.ts`) and hands
 * what it found here (`presentUpdates`); the projects list then shows those rows, pushed
 * to a panel already open or taken by a new one once mounted (`updatesModalRequest.ts`).
 * The modal never checks itself: it only ever shows a list it was given (owner,
 * 2026-10-20: the notification is the check, the modal replaces the picker).
 *
 * `applyUpdates` applies the ticked rows, against the check they came from, through the
 * same headless apply the agent's `apply_updates` uses, told in the projects list's
 * progress modal, with its questions asked there. It answers the report the modal lists
 * once the run ends.
 *
 * A boundary (ADR-015): it fetches its services here and hands them in.
 *
 * @module features/updates/handlers/updatesModalHandlers
 */

import * as vscode from 'vscode';
import { questionsInModal, stopRunningDemos } from './updateQuestionsInModal';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress, type OperationOutcome, type ReportStage } from '@/core/vscode/withOperationProgress';
import { updateIntegrationPairFor } from '@/features/dashboard/handlers/integrationUpdateHandlers';
import type { FoundUpdates } from '@/features/updates/services/allUpdates';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { openFixWithAi } from '@/features/updates/services/fixWithAi';
import { selectionsForIds, toPendingUpdateRows } from '@/features/updates/services/pendingUpdateRows';
import type { ApplyUpdatesResult } from '@/features/updates/services/updateApplyResult';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import { reportOf } from '@/features/updates/services/updatesApplyReport';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest, PendingUpdateRow } from '@/types/pendingUpdates';
import { toError } from '@/types/typeGuards';

/** The check the screen is showing; the ticked ids are applied against it, once. */
let shown: { found: FoundUpdates; rows: PendingUpdateRow[] } | undefined;

const OUT_OF_DATE = 'This list of updates is out of date. Check for updates again.';

/**
 * Hand a check to the Updates modal: the rows it will show, kept with the check they
 * are applied against.
 *
 * @param found - what Check for Updates found
 * @returns the rows to show
 */
export function presentUpdates(found: FoundUpdates): PendingUpdateRow[] {
    const extension = found.extension && { current: found.extension.current, latest: found.extension.latest };
    const rows = toPendingUpdateRows(found.selections, extension, found.currentProjectPath);
    shown = { found, rows };
    return rows;
}

/** The rows of the check the modal was handed; empty once applied, or before any. */
export function presentedRows(): PendingUpdateRow[] {
    return shown?.rows ?? [];
}

/** `applyUpdates`: apply the ticked rows, in the progress modal. */
export const handleApplyUpdates: MessageHandler<ApplyUpdatesRequest> = narrateOutcomeToModal(
    async (context, payload) => {
        const found = shown?.found;
        if (!found) return { success: false, error: OUT_OF_DATE };
        shown = undefined;
        return withOperationProgress({ id: UPDATES_OPERATION_ID, title: 'Applying updates', inModal: true }, (report) =>
            applyTicked(context, found, payload?.ids ?? [], report),
        );
    },
    () => UPDATES_OPERATION_ID,
);

async function applyTicked(
    context: HandlerContext,
    found: FoundUpdates,
    ids: string[],
    report: ReportStage,
): Promise<HandlerResponse & OperationOutcome> {
    const picked = selectionsForIds(found.selections, ids);
    const { selections, skipped } = await stopRunningDemos(picked.selections, found.currentProjectPath, () =>
        vscode.commands.executeCommand('demoBuilder.stopDemo'),
    );
    const updateContext = updateContextFor(context);
    const result = await applyUpdatesHeadless(selections, updateContext, report, {
        questions: questionsInModal,
    });
    // A clash the SC chose to fix with AI is kept; open their AI on it (EDS-57).
    await openFixWithAi(keptClashProjects(selections, result), updateContext, (request) =>
        vscode.commands.executeCommand('demoBuilder.openInClaude', request),
    );
    // Last: it ends by offering a reload, which closes this screen.
    if (picked.extension && found.extension?.releaseInfo) {
        try {
            await new ExtensionUpdater(context.logger).updateExtension(
                found.extension.releaseInfo.downloadUrl,
                found.extension.latest,
            );
        } catch (error) {
            context.logger.error('[Updates] The extension update failed', toError(error));
            skipped.push('Demo Builder extension: not updated. Details are in Debug Logs.');
        }
    }
    const data = reportOf(result, skipped);
    if (data.problems.length === 0) return { success: true, data };
    // A success with a warning, not a failure: the run ended, and a failure's Retry
    // could not re-run a list that has been applied. The Updates list says why.
    const noun = data.problems.length === 1 ? 'update' : 'updates';
    return { success: true, warning: `${data.problems.length} ${noun} did not apply. The Updates list says why.`, data };
}

/** The projects whose clash the apply kept for fixing, each once. */
function keptClashProjects(selections: UpdateSelections, result: ApplyUpdatesResult): Project[] {
    const kept = new Set(
        [...(result.template.clashes ?? []), ...(result.boilerplate.clashes ?? []), ...(result.finish.clashes ?? [])]
            .filter((clash) => clash.keptIn)
            .map((clash) => clash.projectName),
    );
    const projects = new Map<string, Project>();
    for (const { project } of [...selections.template, ...selections.boilerplate, ...selections.finish]) {
        if (kept.has(project.name)) projects.set(project.name, project);
    }
    return [...projects.values()];
}

/** What the apply cores are built from, under this screen's context. */
function updateContextFor(context: HandlerContext): UpdateContext {
    return {
        secrets: context.context.secrets,
        extensionPath: context.context.extensionPath,
        stateManager: context.stateManager,
        logger: context.logger,
        commandManager: ServiceLocator.getCommandExecutor(),
        // The pair update the integration card's Update button runs.
        updateIntegrationPair: (project, id, report) => updateIntegrationPairFor(context, project, id, report),
    };
}
