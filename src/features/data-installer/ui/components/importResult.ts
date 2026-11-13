/**
 * What a datapack job window's result shows, decided from state.
 *
 * Pure: no React, no requests, so deciding "which outcome does the user see" is
 * testable without rendering a window.
 *
 * The rule these encode, and the one worth not losing: **the result is keyed on
 * the LAST ACTION**, not on which request objects happen to hold values. Request
 * state persists after settling (`useVSCodeRequest` never clears `data`), so a
 * fixed precedence replays an old outcome over a new one — an earlier import's
 * failure would outrank the dry run the user just ran.
 *
 * @module features/data-installer/ui/components/importResult
 */

import { FINISHING_STOP, type ImportJobRecord, type KeptRootStep, SAVE_STOP } from '../../types';
import type { DataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { endsSmall, type RunEnding } from '@/core/ui/utils/runEnding';
import { jobPurpose, jobWords } from '@/features/data-installer/datapackWords';
import { ErrorCode } from '@/types/errorCodes';

/** The operation whose outcome the result view should show. */
export type LastAction = 'dryRun' | 'start' | 'reset';

/**
 * One rendered outcome, whatever produced it, in the dialog design rules' result shape
 * (`docs/development/sop/dialog-design.md`): the outcome as the dialog's title, with its status as
 * an icon before it, then only what is left to know or do.
 */
export interface ResultContent {
    /** The title's status icon; `info` has none (stopping watching is neither good nor bad). */
    variant: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message?: string;
    details?: string[];
    /** How long the job ran, when it reported it. */
    tookMs?: number;
    /** The kept root's Admin step, shown as the setup step's Where / Set / Then. */
    keptRoot?: KeptRootStep;
    /** Back goes to the confirm it came from, not the form: saving failed and nothing was removed. */
    backToConfirm?: true;
    /**
     * An import Demo Builder's engine ran that ended with a problem or a stop: the window keeps its
     * steps and draws the ending under them, from this record. A clean finish has none and shows as
     * the small result (owner, 2026-11-10, walk F134).
     */
    run?: ImportJobRecord;
    /** The import ran to its end, cleanly or not: the window closes, with nothing to go back to (walk F117). */
    finished?: true;
    /** The ending under the rows: where the pack went and how long search takes. */
    lead?: string;
    /** The footer's main action: run the same import again, or hand the problem to the SC's AI. */
    action?: 'retry' | 'fix';
}

/**
 * How many times Retry may be pressed on one import before the window offers Fix with AI instead:
 * a stop that comes back twice is not one a retry gets past.
 */
export const RETRIES_BEFORE_FIX = 2;

/** The store configuration, the one data type that fails without stopping the import. */
const SETTINGS_KIND = 'store_config';

const RESULT_STATUS: Record<ResultContent['variant'], ModalStatus | undefined> = {
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: undefined,
};

/** The icon before a result's title. */
export function resultStatus(result: ResultContent): ModalStatus | undefined {
    return RESULT_STATUS[result.variant];
}

/** Which operation, in the words each place needs. */
interface OperationWords {
    /** "Installed" / "Uninstalled" */
    done: string;
    /** "Install" / "Uninstall", for a title */
    verbTitle: string;
    /** "install" / "uninstall", for a sentence */
    noun: string;
    /** "Install" / "Uninstall", for a title */
    nounTitle: string;
}

function wordsFor(operation: 'start' | 'reset' | undefined): OperationWords {
    return operation === 'reset'
        ? { done: 'Uninstalled', verbTitle: 'Uninstall', noun: 'uninstall', nounTitle: 'Uninstall' }
        : { done: 'Installed', verbTitle: 'Install', noun: 'install', nounTitle: 'Install' };
}

/**
 * The outcome to show, or null for none.
 *
 * Keyed on the last action deliberately: request state persists after
 * settling, so any fixed precedence across requests replays an old outcome
 * over the one the user just caused.
 */
export function resolveResult(
    lastAction: LastAction | null,
    sources: {
        /** The pack, by the name the SC knows it by, for the result's title. */
        name: string;
        /** How many times Retry was pressed on this import. */
        retries?: number;
        dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>;
        start: DataInstallerRequest<unknown>;
        reset: DataInstallerRequest<unknown>;
        record: ImportJobRecord | null;
        startedActivation: string | undefined;
        /** The import replaces the demo's pack (walk F97): that pack's name, and the types asked for. */
        replacing?: { name: string; dataTypes: string[] };
    },
): ResultContent | null {
    const { name, dryRun, start, reset, record, startedActivation } = sources;

    switch (lastAction) {
        case 'dryRun':
            return dryRunResult(dryRun, name);
        case 'start':
        case 'reset': {
            const request = lastAction === 'start' ? start : reset;
            const words = wordsFor(lastAction);
            if (request.failure?.code === ErrorCode.CHANGES_NOT_SAVED && lastAction === 'start' && sources.replacing) {
                return notSavedRun(request.failure.message, name, sources.replacing);
            }
            if (request.failure?.code === ErrorCode.CHANGES_NOT_SAVED) {
                return { variant: 'error', title: "Couldn't Save Changes", message: 'Nothing was uninstalled.', details: [request.failure.message], backToConfirm: true };
            }
            if (request.failure) {
                // Named, as every datapack result is (owner, 2026-11-10): "Couldn't Uninstall My Luma".
                return { variant: 'error', title: `Couldn't ${words.verbTitle} ${name}`, message: request.failure.message };
            }
            // The terminal record for THIS session's job. A running record is
            // the watching view's business, not a result.
            if (
                record &&
                record.outcome !== 'watching' &&
                record.activationId === startedActivation
            ) {
                if (ranOnRows(record)) {
                    return record.operation === 'reset' ? uninstallResult(record, name) : runResult(record, name, sources.retries ?? 0);
                }
                return terminalResult(record);
            }
            return null;
        }
        default:
            return null;
    }
}

/**
 * An import replacing the demo's pack whose save of the SC's changes failed (walk F97): no job ran,
 * so the steps are drawn from the request, Save Your Changes red with why and every step after it
 * not run, in the same box (review, 2026-11-10). Back goes to the confirm, as a removal's does.
 */
function notSavedRun(reason: string, name: string, replacing: { name: string; dataTypes: string[] }): ResultContent {
    const run: ImportJobRecord = {
        // No job was started: nothing here names one.
        activationId: '',
        datapackName: '',
        version: '',
        commerceInstance: '',
        startedAt: '',
        outcome: 'error',
        dataTypes: replacing.dataTypes,
        perType: Object.fromEntries(replacing.dataTypes.map((kind) => [kind, 'error' as const])),
        replaces: replacing.name,
        stoppedAt: SAVE_STOP,
        reason,
    };
    // A switch and an install fail in the same words (`jobWords`).
    return { variant: 'error', title: jobWords('install', name).failed, run, lead: 'Nothing was uninstalled or installed.', backToConfirm: true };
}

/**
 * Whether the import's ending goes on its rows: an import that finished or stopped part-way. One
 * that never started, was stopped watching, or could not be watched has no rows to keep.
 */
function ranOnRows(record: ImportJobRecord): boolean {
    return record.outcome === 'success' || record.outcome === 'partial' || record.outcome === 'error';
}

/**
 * What is left to know after a clean import: the engine's lines for the SC (what it kept of theirs, a
 * step left in the Admin), then how long search takes. Without engine lines it is one sentence; with
 * them, a line each (review, 2026-11-10). A save made first is not repeated: its own step said
 * where the changes went (Phase 2, owner 2026-11-12; rule 3, say a fact once).
 */
function leftToKnow(record: ImportJobRecord): Pick<ResultContent, 'message' | 'details'> {
    const scLines = record.scLines ?? [];
    const lines = [...scLines, record.searchDelay].filter(
        (line): line is string => Boolean(line),
    );
    if (lines.length === 0) return {};
    return scLines.length > 0 ? { details: lines } : { message: lines.join(' ') };
}

/**
 * The import as the shared ending rule reads it: a data type that failed is a row's problem, a row's
 * note is a note, and a check that differs is the run's warning.
 */
function endingOf(record: ImportJobRecord, ranToEnd: boolean): RunEnding {
    const failed = Object.values(record.perType).map((state) => ({ problem: state === 'error' }));
    const notes = Object.values(record.rowNotes ?? {}).map((note) => ({ note }));
    return {
        succeeded: ranToEnd,
        warning: record.check !== undefined && record.check.verdict !== 'matches',
        rows: [...failed, ...notes],
    };
}

/**
 * An import's ending (owner, 2026-11-10, walk F134). A clean finish hands off to the small result:
 * "My Luma Installed", then only what is left to know (`leftToKnow`). Only a problem keeps the steps:
 * the same title in amber, how long search takes and "Took …" under them, with Fix with AI. A run that
 * stopped is its failed title, "Couldn't Install My Luma", on its steps, with Retry while a retry can
 * get past the stop, else Fix with AI. Every title is the job's (`jobWords`), by what it was for. It ran to the end when nothing failed but the store configuration, which
 * fail without stopping it, and the work after the data types did not stop.
 */
function runResult(record: ImportJobRecord, name: string, retries: number): ResultContent {
    const took = record.processingTimeMs !== undefined ? { tookMs: record.processingTimeMs } : {};
    const failed = Object.entries(record.perType).filter(([, state]) => state === 'error').map(([kind]) => kind);
    const ranToEnd = record.stoppedAt !== FINISHING_STOP && failed.every((kind) => kind === SETTINGS_KIND && record.stoppedAt === SETTINGS_KIND);
    const words = jobWords(jobPurpose(record), name);
    if (!ranToEnd) {
        const retry = record.retryable === true && retries < RETRIES_BEFORE_FIX;
        return { variant: 'error', title: words.failed, run: record, action: retry ? 'retry' : 'fix', ...took };
    }
    const title = words.done;
    if (endsSmall(endingOf(record, ranToEnd))) return { variant: 'success', title, finished: true, ...leftToKnow(record) };
    const lead = record.searchDelay ? { lead: record.searchDelay } : {};
    return { variant: 'warning', title, run: record, finished: true, action: 'fix', ...lead, ...took };
}

/**
 * An uninstall's ending, on its steps like an install's (step 03, S7; decisions J5-2). A clean one
 * is the small result, "My Luma Uninstalled", the kept root's Admin step when the store kept it; the
 * save made first is not repeated, its own step said where (rule 3). One that stopped, or left part
 * of the datapack behind, stays on its steps as "Couldn't Uninstall My Luma", with Retry: uninstalling
 * again tries what is left again.
 */
function uninstallResult(record: ImportJobRecord, name: string): ResultContent {
    if (record.outcome === 'success') return { ...successResult(record, name, wordsFor('reset')), finished: true };
    const took = record.processingTimeMs !== undefined ? { tookMs: record.processingTimeMs } : {};
    return { variant: 'error', title: jobWords('uninstall', name).failed, run: record, action: 'retry', ...took };
}

/**
 * The Dry Run's answer (D6). A refusal is an ANSWER the button exists to fetch: amber, not red. A
 * pass says what it means for this datapack, and its footer offers the install itself (Flow 2.14).
 */
function dryRunResult(dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>, name: string): ResultContent | null {
    if (dryRun.failure) return { variant: 'error', title: 'Dry Run Failed', message: dryRun.failure.message };
    if (!dryRun.value) return null;
    return dryRun.value.valid
        ? { variant: 'success', title: 'Dry Run Passed', message: `${name} can be installed here. Nothing was written.` }
        : { variant: 'warning', title: 'Dry Run Found a Problem', message: dryRun.value.reason, action: 'fix' };
}

/**
 * A job with no rows to end on, worded for ITS operation (a removal must not say "Installed"): one
 * that never started, was stopped watching, or could not be watched. A job that ran ends on its steps
 * (`runResult`, `uninstallResult`).
 */
function terminalResult(record: ImportJobRecord): ResultContent {
    const words = wordsFor(record.operation === 'reset' ? 'reset' : 'start');
    const took = record.processingTimeMs !== undefined ? { tookMs: record.processingTimeMs } : {};
    return { ...unfinishedResult(record, words), ...took };
}

/**
 * A job that succeeded: the title says it, and nothing else does unless there is something left
 * to know (what installing again kept, step 05) or to do (the root a removal kept for a store,
 * step 12, with the Admin step that frees it).
 */
function successResult(record: ImportJobRecord, name: string, words: OperationWords): ResultContent {
    if (record.keptRoot) {
        return {
            variant: 'warning',
            title: `One Step Left to Uninstall ${name}`,
            message: `${record.keptRoot.store} still uses the datapack's root category, ${record.keptRoot.category}, so it stayed.`,
            keptRoot: record.keptRoot,
        };
    }
    // The datapack, then what happened to it, as "My Luma Installed" (review, 2026-11-10).
    return { variant: 'success', title: `${name} ${words.done}`, ...(record.note ? { message: record.note } : {}) };
}

/** What is left to say of a job that has no rows to end on. */
function unfinishedResult(record: ImportJobRecord, words: OperationWords): ResultContent {
    const later = 'Still running. The result will be on the Activity tab.';
    switch (record.outcome) {
        case 'never-registered':
            return { variant: 'error', title: `${words.nounTitle} Did Not Start`, message: record.reason };
        case 'stopped':
            return { variant: 'info', title: 'Running in Background', message: `The ${words.noun} continues in the background.` };
        case 'still-running':
            return { variant: 'info', title: 'Still Running', message: later };
        case 'unwatchable':
            return { variant: 'warning', title: `${words.nounTitle} Status Unknown`, message: later };
        default:
            return { variant: 'info', title: String(record.outcome) };
    }
}
