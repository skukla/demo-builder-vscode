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

import type { DataTypeStatus } from '../types';
import { dataTypeLabel } from './dataTypeLabel';

/** A type the service has finished with, whether or not it went well. */
const TERMINAL: readonly DataTypeStatus[] = ['success', 'error'];

export interface ImportProgress {
    /** Requested types the service has finished — succeeded OR failed. */
    done: number;
    /** How many the REQUEST named. */
    total: number;
    /** The type being worked on right now, when the service names one. */
    current?: string;
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
    const current = requestedTypes.find((type) => perType[type] === 'processing');

    return {
        done,
        total,
        ...(current ? { current } : {}),
        percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)),
    };
}

/**
 * The spinner's subMessage, or nothing when there is nothing honest to say.
 *
 * Before the first poll lands, no type has reported and no count is meaningful;
 * "0 of 14 done" beside a spinner reads as stalled rather than starting.
 */
export function progressLabel(
    progress: ImportProgress,
    operation: 'import' | 'reset' = 'import',
): string | undefined {
    const { done, total, current } = progress;
    const count = `${done} of ${total} done`;

    if (current) {
        const verb = operation === 'reset' ? 'Resetting' : 'Importing';
        return `${verb} ${dataTypeLabel(current)}… ${count}`;
    }
    if (done === 0) {
        return undefined;
    }
    return count;
}
