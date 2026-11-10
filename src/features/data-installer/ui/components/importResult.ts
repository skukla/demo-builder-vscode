/**
 * What the import modal's result view shows, decided from state.
 *
 * Pure: no React, no requests. Extracted from `ImportDatapackModal` because that
 * file was 831 lines against a 500-line cap, and because deciding "which outcome
 * does the user see" is testable without rendering a modal — which the modal's
 * own suites had to do for every branch.
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
import { dataTypeLabel } from '../dataTypeLabel';
import type { DataInstallerRequest } from '../hooks/useDataInstallerRequest';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import { ErrorCode } from '@/types/errorCodes';

/**
 * One line per data type: its human name and what the service says it did.
 *
 * Shared with the modal's in-flight `WatchProgress`, which had built this list
 * with a byte-identical expression. Two copies of one job — and the moment the
 * codes became labels, the copy that got missed would have shown the raw code
 * for the whole duration of the import and the finished name only at the end.
 */
export function describePerType(
    perType: ImportJobRecord['perType'],
    options: { troubledOnly?: boolean } = {},
): string[] {
    return Object.entries(perType)
        .filter(([, state]) => !options.troubledOnly || state !== 'success')
        .map(([type, state]) => `${dataTypeLabel(type)}: ${state}`);
}

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

/** The store settings, the one data type that fails without stopping the import. */
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
    /** "Imported" / "Removed" */
    done: string;
    /** "Import" / "Remove", for a title */
    verbTitle: string;
    /** "import" / "removal", for a sentence */
    noun: string;
    /** "Import" / "Removal", for a title */
    nounTitle: string;
}

function wordsFor(operation: 'start' | 'reset' | undefined): OperationWords {
    return operation === 'reset'
        ? { done: 'Uninstalled', verbTitle: 'Uninstall', noun: 'uninstall', nounTitle: 'Uninstall' }
        : { done: 'Imported', verbTitle: 'Import', noun: 'import', nounTitle: 'Import' };
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
        start: DataInstallerRequest<{ activationId: string }>;
        reset: DataInstallerRequest<{ activationId: string; savedNote?: string }>;
        record: ImportJobRecord | null;
        startedActivation: string | undefined;
        /** The import replaces the demo's pack (walk F97): that pack's name, and the types asked for. */
        replacing?: { name: string; dataTypes: string[] };
    },
): ResultContent | null {
    const { name, dryRun, start, reset, record, startedActivation } = sources;

    switch (lastAction) {
        case 'dryRun':
            return dryRunResult(dryRun);
        case 'start':
        case 'reset': {
            const request = lastAction === 'start' ? start : reset;
            const words = wordsFor(lastAction);
            if (request.failure?.code === ErrorCode.CHANGES_NOT_SAVED && lastAction === 'start' && sources.replacing) {
                return notSavedRun(request.failure.message, sources.replacing);
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
                if (record.operation !== 'reset' && ranOnRows(record)) return runResult(record, name, sources.retries ?? 0);
                return withSavedNote(terminalResult(record, name), lastAction === 'reset' ? reset.value?.savedNote : undefined);
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
function notSavedRun(reason: string, replacing: { name: string; dataTypes: string[] }): ResultContent {
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
    return { variant: 'error', title: 'Import Stopped', run, lead: 'Nothing was uninstalled or installed.', backToConfirm: true };
}

/**
 * Whether the import's ending goes on its rows: an import that finished or stopped part-way. One
 * that never started, was stopped watching, or could not be watched has no rows to keep.
 */
function ranOnRows(record: ImportJobRecord): boolean {
    return record.outcome === 'success' || record.outcome === 'partial' || record.outcome === 'error';
}

/** What a clean import's result says when the SC's changes were saved first (walk F134). */
export const SAVED_LINE = 'Your changes are saved in Version History.';

/**
 * What is left to know after a clean import: where the SC's changes went, the engine's lines for the
 * SC (what it kept of theirs, a step left in the Admin), then how long search takes. Without engine
 * lines it is one sentence; with them, a line each (review, 2026-11-10).
 */
function leftToKnow(record: ImportJobRecord): Pick<ResultContent, 'message' | 'details'> {
    const scLines = record.scLines ?? [];
    const lines = [record.savedAs ? SAVED_LINE : undefined, ...scLines, record.searchDelay].filter(
        (line): line is string => Boolean(line),
    );
    if (lines.length === 0) return {};
    return scLines.length > 0 ? { details: lines } : { message: lines.join(' ') };
}

/** Something on the steps the SC should see: a data type that failed, a row's note, a check that differs. */
function hasProblem(record: ImportJobRecord, failed: string[]): boolean {
    if (failed.length > 0 || Object.keys(record.rowNotes ?? {}).length > 0) return true;
    return record.check !== undefined && record.check.verdict !== 'matches';
}

/**
 * An import's ending (owner, 2026-11-10, walk F134). A clean finish hands off to the small result:
 * "My Luma Imported", then only what is left to know (`leftToKnow`). Only a problem keeps the steps:
 * the same title in amber, how long search takes and "Took …" under them, with Fix with AI. A run that stopped is "Import Stopped" on its steps, with Retry while a retry can get past
 * the stop, else Fix with AI. It ran to the end when nothing failed but the store settings, which
 * fail without stopping it, and the work after the data types did not stop.
 */
function runResult(record: ImportJobRecord, name: string, retries: number): ResultContent {
    const took = record.processingTimeMs !== undefined ? { tookMs: record.processingTimeMs } : {};
    const failed = Object.entries(record.perType).filter(([, state]) => state === 'error').map(([kind]) => kind);
    const ranToEnd = record.stoppedAt !== FINISHING_STOP && failed.every((kind) => kind === SETTINGS_KIND && record.stoppedAt === SETTINGS_KIND);
    if (!ranToEnd) {
        const retry = record.retryable === true && retries < RETRIES_BEFORE_FIX;
        return { variant: 'error', title: 'Import Stopped', run: record, action: retry ? 'retry' : 'fix', ...took };
    }
    const title = `${name} Imported`;
    if (!hasProblem(record, failed)) return { variant: 'success', title, finished: true, ...leftToKnow(record) };
    const lead = record.searchDelay ? { lead: record.searchDelay } : {};
    return { variant: 'warning', title, run: record, finished: true, action: 'fix', ...lead, ...took };
}

/** Where the changes went: what a removal that saved them first has left to say, however it ended. */
function withSavedNote(result: ResultContent, savedNote: string | undefined): ResultContent {
    if (!savedNote) return result;
    return { ...result, message: [result.message, savedNote].filter(Boolean).join(' ') };
}

/** A dry run's answer. A refusal is an ANSWER the button exists to fetch: amber, not red. */
function dryRunResult(dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>): ResultContent | null {
    if (dryRun.failure) return { variant: 'error', title: 'Dry Run Failed', message: dryRun.failure.message };
    if (!dryRun.value) return null;
    return dryRun.value.valid
        ? { variant: 'success', title: 'Dry Run Passed', message: 'Nothing was written.' }
        : { variant: 'warning', title: 'Validation Failed', message: dryRun.value.reason };
}

/** A finished job, worded for ITS operation: a removal must not say "Imported". */
function terminalResult(record: ImportJobRecord, name: string): ResultContent {
    const words = wordsFor(record.operation === 'reset' ? 'reset' : 'start');
    const took = record.processingTimeMs !== undefined ? { tookMs: record.processingTimeMs } : {};
    if (record.outcome === 'success') return { ...successResult(record, name, words), ...took };
    return { ...unfinishedResult(record, name, words), ...took };
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
            title: `Action Required to Uninstall ${name}`,
            message: `${record.keptRoot.store} still uses the datapack's root category, ${record.keptRoot.category}, so it stayed.`,
            keptRoot: record.keptRoot,
        };
    }
    // The pack, then what happened to it, as "My Luma Imported" (review, 2026-11-10).
    return { variant: 'success', title: `${name} ${words.done}`, ...(record.note ? { message: record.note } : {}) };
}

/**
 * Anything short of success, narrowed to the types that need attention: on a partial run the
 * successes are the noise and the failures are the answer.
 */
function unfinishedResult(record: ImportJobRecord, name: string, words: OperationWords): ResultContent {
    const troubled = describePerType(record.perType, { troubledOnly: true });
    const kept = record.note ? [record.note] : [];
    const later = `The ${words.noun} continues in the background. See the Activity tab for the result.`;
    switch (record.outcome) {
        case 'partial':
            return {
                variant: 'warning',
                title: `Some Data Types Not ${words.done}`,
                details: [...kept, ...troubled, 'Running it again skips existing items.'],
            };
        case 'error':
            return { variant: 'error', title: `Couldn't ${words.verbTitle} ${name}`, message: record.reason, details: [...kept, ...troubled] };
        case 'never-registered':
            return { variant: 'error', title: `${words.nounTitle} Did Not Start`, message: record.reason };
        case 'stopped':
            return { variant: 'info', title: 'Running in Background', message: `The ${words.noun} continues in the background.` };
        case 'still-running':
            return { variant: 'info', title: 'Still Running', message: later };
        case 'unwatchable':
            return { variant: 'warning', title: `${words.nounTitle} Status Unknown`, message: 'It is still running. See the Activity tab for the result.' };
        default:
            return { variant: 'info', title: String(record.outcome) };
    }
}
