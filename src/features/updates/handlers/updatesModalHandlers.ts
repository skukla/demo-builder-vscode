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
import { forgetKeptRows, watchKeptRows, type KeptRow } from './fixEndedNotice';
import { questionsInModal, stopRunningDemos } from './updateQuestionsInModal';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createNonSwitchingStateManager } from '@/core/state/workingProjectStateManager';
import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import { narrateOutcomeToModal } from '@/core/vscode/operationProgress';
import { withOperationProgress, type OperationOutcome, type ReportStage } from '@/core/vscode/withOperationProgress';
import { integrationUpdateProbe, updateIntegrationPairFor } from '@/features/dashboard/handlers/integrationUpdateHandlers';
import { findAllUpdates, type FoundUpdates } from '@/features/updates/services/allUpdates';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { openFixWithAi } from '@/features/updates/services/fixWithAi';
import {
    matchFresh,
    rowIdsOf,
    selectionsForIds,
    type GoneRow,
    stillWaitingCount,
    toPendingUpdateRows,
    untickedRows,
} from '@/features/updates/services/pendingUpdateRows';
import type { ItemObserver } from '@/features/updates/services/updateApplyEach';
import type { ApplyUpdatesResult, ItemOutcome } from '@/features/updates/services/updateApplyResult';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import {
    localCopyRowId,
    type ApplyUpdatesRequest,
    type PendingUpdateRow,
    type RecheckUpdatesResponse,
    type UpdateRowState,
    type UpdateRowStatus,
} from '@/types/pendingUpdates';
import { toError } from '@/types/typeGuards';

/** A check and the rows made from it. */
interface Presented {
    found: FoundUpdates;
    rows: PendingUpdateRow[];
}

/** The check the screen is showing; the ticked ids are applied against it, once. */
let shown: Presented | undefined;
/** Whether a run is going: a second Apply would otherwise check again and run it twice. */
let applying = false;

const OUT_OF_DATE = 'This list of updates is out of date. Check for updates again.';
const ALREADY_APPLYING = 'Updates are already being applied.';
const CHECKING = 'Checking for updates';
/** Rows whose update lands in the storefront repository. */
const STOREFRONT_KINDS = new Set(['forkSync', 'template', 'boilerplate', 'finish', 'blockLibrary', 'blockLibraryInstall']);
const DEMO_RUNNING = 'Not updated — its demo is running.';
const EXTENSION_FAILED = 'Not updated — details are in Debug Logs.';

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

/** @param shownId - the id the screen knows a row of the applied check by */
function rowTellerFor(context: HandlerContext, shownId: (id: string) => string = (id) => id): RowTeller {
    let notApplied = 0;
    return {
        tell: (id, state, message) => {
            if (state === 'failed' || state === 'skipped') notApplied++;
            void tellScreen(context, { id: shownId(id), state, ...(message ? { message } : {}) });
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
    // Another list: the last run's ids would name its rows.
    forgetKeptRows();
    const rows = rowsOf(found);
    shown = { found, rows };
    return rows;
}

function rowsOf(found: FoundUpdates): PendingUpdateRow[] {
    const extension = found.extension && { current: found.extension.current, latest: found.extension.latest };
    return toPendingUpdateRows(found.selections, extension, found.currentProjectPath);
}

/** The rows of the check the modal was handed; empty once applied, or before any. */
export function presentedRows(): PendingUpdateRow[] {
    return shown?.rows ?? [];
}

/**
 * `recheckUpdates`: "Back to updates" after a run (owner, 2026-10-22). The run changed
 * storefronts, so the list it started from is stale: this runs Check for Updates again,
 * the check the window opens on, which says "up to date" in its own notification when
 * nothing waits and otherwise presents what it found.
 */
export const handleRecheckUpdates: MessageHandler<unknown, RecheckUpdatesResponse> = async () => {
    shown = undefined;
    await vscode.commands.executeCommand('demoBuilder.checkForUpdates');
    return { success: true, data: { rows: presentedRows() } };
};

/**
 * `applyUpdates`: apply the ticked rows, in the progress modal.
 *
 * When the extension no longer holds the check the screen shows (it restarted while the
 * window stayed open, 2026-10-24), it checks again and applies the ticked rows the fresh
 * check lists as the SC saw them, rather than send the SC to check again themselves.
 */
export const handleApplyUpdates: MessageHandler<ApplyUpdatesRequest> = narrateOutcomeToModal(
    async (context, payload) => {
        if (applying) return { success: false, error: ALREADY_APPLYING };
        const presented = shown;
        const tickedRows = payload?.rows ?? [];
        if (!presented && tickedRows.length === 0) return { success: false, error: OUT_OF_DATE };
        shown = undefined;
        applying = true;
        forgetKeptRows();
        // The run saves every project it updates; none of them may become the open one.
        const runContext = { ...context, stateManager: createNonSwitchingStateManager(context.stateManager) };
        try {
            return await withOperationProgress({ id: UPDATES_OPERATION_ID, title: 'Applying updates', inModal: true }, (report) =>
                presented
                    ? applyTicked(runContext, { ...presented, ids: payload?.ids ?? [] }, report)
                    : applyOnFreshCheck(runContext, tickedRows, report),
            );
        } finally {
            applying = false;
        }
    },
    () => UPDATES_OPERATION_ID,
);

/** The check the screen showed is gone: check again, say which rows dropped out, apply the rest. */
async function applyOnFreshCheck(
    context: HandlerContext,
    tickedRows: PendingUpdateRow[],
    report: ReportStage,
): Promise<HandlerResponse & OperationOutcome> {
    report(CHECKING);
    const found = await findAllUpdates(context, integrationUpdateProbe(context));
    const rows = rowsOf(found);
    const { shownIdOf, gone } = matchFresh(tickedRows, rows);
    let newer = 0;
    for (const { row, why } of gone) {
        if (why === 'newer') newer++;
        // Already applied is not a problem, so it is told as done.
        void tellScreen(context, { id: row.id, state: why === 'newer' ? 'skipped' : 'done', message: goneLine({ row, why }) });
    }
    const ids = [...shownIdOf.keys()];
    return applyTicked(context, { found, rows, ids, shownId: (id) => shownIdOf.get(id) ?? id, dropped: newer }, report);
}

/** What a ticked row that dropped out of the fresh check says. */
function goneLine({ row, why }: GoneRow): string {
    if (why === 'newer') {
        const who = row.kind === 'adobeMcp' ? 'Adobe' : 'Demo Builder';
        return `${who} released a newer version. You'll see it next time you check.`;
    }
    if (STOREFRONT_KINDS.has(row.kind)) return 'Demo Builder skipped this because the storefront already has it.';
    if (row.kind === 'extension') return 'Demo Builder skipped this because it is already on this version.';
    return 'Demo Builder skipped this because the project already has it.';
}

/** One run: the check, the ids to apply from it, and how the screen knows its rows. */
interface Run extends Presented {
    ids: string[];
    shownId?: (id: string) => string;
    /** Ticked rows already told as not applied, before the run. */
    dropped?: number;
}

async function applyTicked(
    context: HandlerContext,
    { found, rows: shownRows, ids, shownId, dropped = 0 }: Run,
    report: ReportStage,
): Promise<HandlerResponse & OperationOutcome> {
    const picked = selectionsForIds(found.selections, ids);
    const rowOf = rowIdsOf(found.selections);
    const rows = rowTellerFor(context, shownId);
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
    // Down the list the SC is watching: one project at a time, as its headings run.
    const projectOrder = [...new Set(shownRows.map((row) => row.group.key))];
    const result = await applyUpdatesHeadless(selections, updateContext, report, {
        questions: questionsInModal,
        onItem,
        projectOrder,
        // A step of its own, but not an update: told without counting toward "did not apply".
        onLocalCopy: (project, outcome) => {
            const message = lineOf(outcome);
            void tellScreen(context, { id: localCopyRowId(project.path), state: outcome.state, ...(message ? { message } : {}) });
        },
    });
    // A clash the SC chose to fix with AI is kept; open their AI on it (EDS-57), and leave
    // its row where the AI's finish can flip it while this run is on screen (EDS-56).
    const keptForAi = keptClashes(selections, result);
    await openFixWithAi(uniqueProjects(keptForAi), updateContext, (request) =>
        vscode.commands.executeCommand('demoBuilder.openInClaude', request),
    );
    const screenId = shownId ?? ((id: string) => id);
    const keptRows = keptRowsOf(keptForAi, (entry) => screenId(rowOf.get(entry) ?? ''));
    watchKeptRows(keptRows, (status) => void tellScreen(context, status));
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
    const remaining = await stillWaiting(context, shownRows, ids);
    const left = remaining > 0 ? { remaining } : {};
    const notApplied = rows.notApplied() + dropped;
    if (notApplied === 0) return { success: true, ...left };
    // A success with a warning, not a failure: the run ended, and a failure's Retry
    // could not re-run a list that has been applied. Each row says why.
    const noun = notApplied === 1 ? 'update' : 'updates';
    return { success: true, warning: `${notApplied} ${noun} did not apply.`, ...left };
}

/**
 * How many rows the SC left unticked are still waiting, by a fresh check (owner,
 * 2026-10-22): what "Back to updates" would list again. Nothing left unticked checks
 * nothing; a check that fails says nothing waits, since the run itself has ended.
 */
async function stillWaiting(context: HandlerContext, listed: PendingUpdateRow[], ids: string[]): Promise<number> {
    if (untickedRows(listed, ids).length === 0) return 0;
    try {
        const fresh = await findAllUpdates(context, integrationUpdateProbe(context));
        return stillWaitingCount(listed, ids, rowsOf(fresh));
    } catch (error) {
        context.logger.warn(`[Updates] Could not check what is still waiting: ${toError(error).message}`);
        return 0;
    }
}

/** What a row says under it once it has ended: a note when done, why when not. */
function lineOf(outcome: ItemOutcome): string | undefined {
    if (outcome.state === 'done') return outcome.note;
    return outcome.state === 'running' ? undefined : outcome.message;
}

/** A selection entry whose clash the apply kept for fixing. */
type KeptEntry = { project: Project };

/** The entries whose clash the apply kept for fixing, each with its own category's row. */
function keptClashes(selections: UpdateSelections, result: ApplyUpdatesResult): KeptEntry[] {
    return (['template', 'boilerplate', 'finish'] as const).flatMap((category) => {
        const kept = new Set((result[category].clashes ?? []).filter((clash) => clash.keptIn).map((clash) => clash.projectName));
        return (selections[category] as KeptEntry[]).filter(({ project }) => kept.has(project.name));
    });
}

/** Each kept entry's project, once. */
function uniqueProjects(kept: KeptEntry[]): Project[] {
    return [...new Map(kept.map(({ project }) => [project.name, project])).values()];
}

/** Where each kept clash sits on the screen: its row, and its project's local copy step. */
function keptRowsOf(kept: KeptEntry[], screenIdOf: (entry: object) => string): KeptRow[] {
    return kept.map((entry) => ({
        projectName: entry.project.name,
        rowId: screenIdOf(entry),
        localCopyId: localCopyRowId(entry.project.path),
    }));
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
