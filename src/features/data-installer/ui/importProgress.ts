/**
 * Live import progress — the per-type map turned into one line and a ring.
 *
 * The modal showed a bare "Importing…" for the whole run, sometimes minutes,
 * and the reason was never missing data: the runner builds a partial per-type
 * map on every poll, and `classify` already depends on it being partial (the map
 * must COVER the requested types before a job counts as terminal). The map
 * simply never left the extension until the job finished.
 *
 * Pure, and deliberately so — deciding what the spinner says is testable without
 * rendering a modal or running a poll.
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
        percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)),
    };
}

/**
 * The step the job is, from the stage table: the same name creation and the
 * notification it hands over to show.
 *
 * "Removing", not "Resetting": the button that starts a removal says "Remove data",
 * and a project RESET restores the pack. The `reset` operation id is the wire, not
 * the wording.
 */
export function progressStep(operation: 'import' | 'reset' = 'import'): string {
    return operation === 'reset'
        ? OPERATION_STAGES.removingDatapack.label
        : OPERATION_STAGES.installingDatapack.label;
}

/**
 * The line under the step, or nothing when there is nothing honest to say: the types
 * finished and the ones in flight ("5 of 14 data types: Customer groups"), worded as
 * every datapack surface words it (`datapackTypesLine`).
 *
 * Before the first poll lands, no type has reported and no count is meaningful;
 * "0 of 14" beside a spinner reads as stalled rather than starting.
 */
export function progressLabel(progress: ImportProgress): string | undefined {
    const { done, total, processing } = progress;
    if (done === 0 && processing.length === 0) {
        return undefined;
    }
    return typesLine(done, total, processing.map(dataTypeLabel));
}
