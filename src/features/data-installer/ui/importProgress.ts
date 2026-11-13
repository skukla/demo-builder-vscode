/**
 * Live import progress — the per-type map turned into one line, for the progress notification a
 * running job is handed to (`importJobWatch.ts`).
 *
 * The modal showed a bare "Importing…" for the whole run, sometimes minutes,
 * and the reason was never missing data: the runner builds a partial per-type
 * map on every poll, and `classify` already depends on it being partial (the map
 * must COVER the requested types before a job counts as terminal). The map
 * simply never left the extension until the job finished.
 *
 * Pure, and deliberately so — deciding what the line says is testable without
 * rendering anything or running a poll.
 *
 * @module features/data-installer/ui/importProgress
 */

import { typesLine } from '../services/datapackTypesLine';
import type { DataTypeStatus } from '../types';
import { dataTypeLabel } from './dataTypeLabel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';

/** A type the service has finished with, whether or not it went well. */
const TERMINAL: readonly DataTypeStatus[] = ['success', 'error'];

export interface ImportProgress {
    /** Requested types the service has finished — succeeded OR failed. */
    done: number;
    /** How many the REQUEST named. */
    total: number;
    /** The types being worked on right now, in request order (often one). */
    processing: string[];
    /** The types the job asked for, in request order. */
    requested: string[];
    /** The requested types not yet finished or in flight, in request order. */
    waiting: string[];
    /** 0–100, never beyond. */
    percent: number;
}

/**
 * Summarise a poll's per-type map against what the import asked for.
 *
 * The total comes from the REQUEST rather than the map, because the map holds
 * only the types the service has reached. Counting it would show "6 of 6 done"
 * early in a fourteen-type import and then count backwards as more appeared.
 */
export function summarizeProgress(
    perType: Record<string, DataTypeStatus>,
    requestedTypes: string[],
): ImportProgress {
    const total = requestedTypes.length;
    const done = requestedTypes.filter((type) => TERMINAL.includes(perType[type])).length;
    // Scanned in REQUEST order, not map order: object key order is an accident
    // of how the service serialised its response, and the line would jitter.
    const processing = requestedTypes.filter((type) => perType[type] === 'processing');

    return {
        done,
        total,
        processing,
        requested: requestedTypes,
        waiting: requestedTypes.filter((type) => !TERMINAL.includes(perType[type]) && perType[type] !== 'processing'),
        percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)),
    };
}

/**
 * The step the job is, from the stage table: the same name creation and the
 * notification it hands over to show.
 *
 * "Uninstalling", not "Resetting": the button that starts it says "Uninstall", and a
 * project RESET restores the pack. The `reset` operation id is the wire, not
 * the wording.
 */
export function progressStep(operation: 'import' | 'reset' = 'import'): string {
    return operation === 'reset'
        ? OPERATION_STAGES.removingDatapack.label
        : OPERATION_STAGES.installingDatapack.label;
}

/**
 * The line under the step, or nothing when there is nothing honest to say. It always names what is
 * being worked on, because a bare count says nothing (owner, 2026-11-02: "1 of 1 data type").
 *
 * - One type: just its name, "Categories", from the start to the end of the job.
 * - Several: the count and the current type, "5 of 14 data types: Customer groups", worded as every
 *   datapack surface words it (`datapackTypesLine`). Between polls, nothing is in flight, so it
 *   names the next one.
 * - Every type finished and the job not yet closed: "Finishing up".
 * - When the engine counts the rows of the type in progress, the count takes the type's name:
 *   "450 of 2,046 products", or "5 of 14 data types: 450 of 2,046 products" (owner, 2026-11-05:
 *   a bulk install must still say what it is installing).
 *
 * Before the first poll of a job with several types, no count is meaningful: "0 of 14" beside a
 * spinner reads as stalled rather than starting.
 */
export function progressLabel(progress: ImportProgress, detail?: string): string | undefined {
    const { done, total, processing, requested, waiting } = progress;
    const counting = detail !== undefined && processing.length > 0;
    if (total === 1) return counting ? detail : dataTypeLabel(requested[0]);
    if (done === 0 && processing.length === 0) return undefined;
    if (done === total) return 'Finishing up';
    if (counting) return typesLine(done, total, [detail]);
    const current = processing.length > 0 ? processing : waiting.slice(0, 1);
    return typesLine(done, total, current.map(dataTypeLabel));
}
