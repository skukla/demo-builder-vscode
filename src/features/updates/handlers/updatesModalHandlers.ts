/**
 * The Updates modal's two messages, on the projects list (PL-80).
 *
 * - `checkUpdates` checks the extension and every project and answers the rows to draw
 *   (Pattern B). The check is kept: it is what the ticked ids are applied against.
 * - `applyUpdates` applies the ticked rows through the same headless apply the agent's
 *   `apply_updates` uses, told in the projects list's progress modal, with its questions
 *   asked there. It answers the report the modal lists once the run ends.
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
import {
    integrationUpdateProbe,
    updateIntegrationPairFor,
} from '@/features/dashboard/handlers/integrationUpdateHandlers';
import { findAllUpdates, type FoundUpdates } from '@/features/updates/services/allUpdates';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { selectionsForIds, toPendingUpdateRows } from '@/features/updates/services/pendingUpdateRows';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import { reportOf } from '@/features/updates/services/updatesApplyReport';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest } from '@/types/pendingUpdates';
import { toError } from '@/types/typeGuards';

/** The check the screen is showing; the ticked ids are applied against it, once. */
let shown: FoundUpdates | undefined;

const CHECK_FAILED = "Couldn't check for updates. Details are in Debug Logs.";
const OUT_OF_DATE = 'This list of updates is out of date. Check for updates again.';

/** `checkUpdates`: the rows for everything waiting. */
export const handleCheckUpdates: MessageHandler = async (context) => {
    try {
        const found = await findAllUpdates(context, integrationUpdateProbe(context));
        shown = found;
        const extension = found.extension && { current: found.extension.current, latest: found.extension.latest };
        return {
            success: true,
            data: { rows: toPendingUpdateRows(found.selections, extension, found.currentProjectPath) },
        };
    } catch (error) {
        context.logger.error('[Updates] The check for the Updates list failed', toError(error));
        return { success: false, error: CHECK_FAILED };
    }
};

/** `applyUpdates`: apply the ticked rows, in the progress modal. */
export const handleApplyUpdates: MessageHandler<ApplyUpdatesRequest> = narrateOutcomeToModal(
    async (context, payload) => {
        const found = shown;
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
    const result = await applyUpdatesHeadless(selections, updateContextFor(context), report, {
        questions: questionsInModal,
    });
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
