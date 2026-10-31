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

import type { ImportJobRecord, KeptRootStep } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import type { DataInstallerRequest } from '../hooks/useDataInstallerRequest';

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
    /** The kept root's Admin step, shown as the setup step's Where / Enter / Then. */
    keptRoot?: KeptRootStep;
}

/** Which operation, in the words each place needs. */
interface OperationWords {
    /** "Imported" / "Removed" */
    done: string;
    /** "import" / "remove" */
    verb: string;
    /** "import" / "removal" */
    noun: string;
}

function wordsFor(operation: 'start' | 'reset' | undefined): OperationWords {
    return operation === 'reset'
        ? { done: 'Removed', verb: 'remove', noun: 'removal' }
        : { done: 'Imported', verb: 'import', noun: 'import' };
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
        dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>;
        start: DataInstallerRequest<{ activationId: string }>;
        reset: DataInstallerRequest<{ activationId: string }>;
        record: ImportJobRecord | null;
        startedActivation: string | undefined;
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
            if (request.failure) {
                return { variant: 'error', title: `Couldn't start the ${words.noun}`, message: request.failure.message };
            }
            // The terminal record for THIS session's job. A running record is
            // the watching view's business, not a result.
            if (
                record &&
                record.outcome !== 'watching' &&
                record.activationId === startedActivation
            ) {
                return terminalResult(record, name);
            }
            return null;
        }
        default:
            return null;
    }
}

/** A dry run's answer. A refusal is an ANSWER the button exists to fetch: amber, not red. */
function dryRunResult(dryRun: DataInstallerRequest<{ valid: boolean; reason?: string }>): ResultContent | null {
    if (dryRun.failure) return { variant: 'error', title: 'Dry run failed', message: dryRun.failure.message };
    if (!dryRun.value) return null;
    return dryRun.value.valid
        ? { variant: 'success', title: 'Dry run passed', message: 'Nothing was written.' }
        : { variant: 'warning', title: 'The service would refuse this', message: dryRun.value.reason };
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
            title: `${words.done} ${name}, except 1 category`,
            message: `${record.keptRoot.store} uses ${record.keptRoot.category} as its root category, so it stayed.`,
            keptRoot: record.keptRoot,
        };
    }
    return { variant: 'success', title: `${words.done} ${name}`, ...(record.note ? { message: record.note } : {}) };
}

/**
 * Anything short of success, narrowed to the types that need attention: on a partial run the
 * successes are the noise and the failures are the answer.
 */
function unfinishedResult(record: ImportJobRecord, name: string, words: OperationWords): ResultContent {
    const troubled = describePerType(record.perType, { troubledOnly: true });
    const kept = record.note ? [record.note] : [];
    const later = `The ${words.noun} carries on without you. Its result shows on the Activity tab.`;
    switch (record.outcome) {
        case 'partial':
            return {
                variant: 'warning',
                title: `${words.done} ${name}, except some data types`,
                details: [...kept, ...troubled, 'Running it again skips what is already there.'],
            };
        case 'error':
            return { variant: 'error', title: `Couldn't ${words.verb} ${name}`, message: record.reason, details: [...kept, ...troubled] };
        case 'never-registered':
            return { variant: 'error', title: `The ${words.noun} never started`, message: record.reason };
        case 'stopped':
            return { variant: 'info', title: 'Stopped watching', message: `The ${words.noun} carries on without you.` };
        case 'still-running':
            return { variant: 'info', title: 'Still running', message: later };
        case 'unwatchable':
            return { variant: 'warning', title: `Lost track of the ${words.noun}`, message: 'It is still running. Its result shows on the Activity tab.' };
        default:
            return { variant: 'info', title: String(record.outcome) };
    }
}
