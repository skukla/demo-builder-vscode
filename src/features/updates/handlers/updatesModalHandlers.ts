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
 * same headless apply the agent's `apply_updates` uses. The Updates modal tells the run
 * itself (2026-10-21): each row's status is pushed as it starts and ends
 * (`updateRowStatus`), and the stage, its questions and the end reach the modal on the
 * operation's progress channel.
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
import { rowIdsOf, selectionsForIds, toPendingUpdateRows } from '@/features/updates/services/pendingUpdateRows';
import type { ItemObserver } from '@/features/updates/services/updateApplyEach';
import type { ApplyUpdatesResult, ItemOutcome } from '@/features/updates/services/updateApplyResult';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest, PendingUpdateRow, UpdateRowState, UpdateRowStatus } from '@/types/pendingUpdates';
import { toError } from '@/types/typeGuards';

/** The check the screen is showing; the ticked ids are applied against it, once. */
let shown: { found: FoundUpdates; rows: PendingUpdateRow[] } | undefined;

const OUT_OF_DATE = 'This list of updates is out of date. Check for updates again.';
const DEMO_RUNNING = 'Not updated, because its demo is running.';
const EXTENSION_FAILED = 'Not updated. Details are in Debug Logs.';

/** Tells the screen where one row has got to, and counts the rows that did not apply. */
interface RowTeller {
    tell: (id: string, state: UpdateRowState, message?: string) => void;
    notApplied: () => number;
}

/** Push one row's status. A screen closed mid-run cannot be told; never the run's problem. */
async function tellScreen(context: HandlerContext, status: UpdateRowStatus): Promise<void> {
    try {
        await context.sendMessage('updateRowStatus', status);
    } catch {
        // See above.
    }
}

function rowTellerFor(context: HandlerContext): RowTeller {
    let notApplied = 0;
    return {
        tell: (id, state, message) => {
            if (state === 'failed' || state === 'skipped') notApplied++;
            void tellScreen(context, { id, state, ...(message ? { message } : {}) });
        },
        notApplied: () => notApplied,
    };
}

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
    const rowOf = rowIdsOf(found.selections);
    const rows = rowTellerFor(context);
    const { selections } = await stopRunningDemos(picked.selections, found.currentProjectPath, () =>
        vscode.commands.executeCommand('demoBuilder.stopDemo'),
    );
    const kept = rowIdsOf(selections);
    for (const entry of rowIdsOf(picked.selections).keys()) {
        if (!kept.has(entry)) rows.tell(rowOf.get(entry) ?? '', 'skipped', DEMO_RUNNING);
    }
    const onItem: ItemObserver = (_kind, entry, outcome) => {
        const id = rowOf.get(entry);
        if (!id) return;
        rows.tell(id, outcome.state, lineOf(outcome));
    };
    const updateContext = updateContextFor(context);
    const result = await applyUpdatesHeadless(selections, updateContext, report, { questions: questionsInModal, onItem });
    // A clash the SC chose to fix with AI is kept; open their AI on it (EDS-57).
    await openFixWithAi(keptClashProjects(selections, result), updateContext, (request) =>
        vscode.commands.executeCommand('demoBuilder.openInClaude', request),
    );
    // Last: it ends by offering a reload, which closes this screen.
    if (picked.extension && found.extension?.releaseInfo) {
        rows.tell('extension', 'running');
        try {
            await new ExtensionUpdater(context.logger).updateExtension(
                found.extension.releaseInfo.downloadUrl,
                found.extension.latest,
            );
            rows.tell('extension', 'done');
        } catch (error) {
            context.logger.error('[Updates] The extension update failed', toError(error));
            rows.tell('extension', 'failed', EXTENSION_FAILED);
        }
    }
    const notApplied = rows.notApplied();
    if (notApplied === 0) return { success: true };
    // A success with a warning, not a failure: the run ended, and a failure's Retry
    // could not re-run a list that has been applied. Each row says why.
    const noun = notApplied === 1 ? 'update' : 'updates';
    return { success: true, warning: `${notApplied} ${noun} did not apply.` };
}

/** What a row says under it once it has ended: a note when done, why when not. */
function lineOf(outcome: ItemOutcome): string | undefined {
    if (outcome.state === 'done') return outcome.note;
    return outcome.state === 'running' ? undefined : outcome.message;
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
