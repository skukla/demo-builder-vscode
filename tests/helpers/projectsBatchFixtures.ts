/**
 * The prepare's answer for the projects list's batch window (`prepareProjectsBatch`), typed to the
 * contract (`@/types/projectsBatch`), so a hand-written answer that leaves out a field the window
 * reads fails to compile here rather than passing a suite (step-05 S1: `ownNames`).
 */

import type {
    BatchDeleteRow,
    BatchResetRow,
    BatchSaveNames,
    PrepareProjectsBatchResponse,
} from '@/types/projectsBatch';

/** No datapacks of the SC's, and the setting asks: what a prepare with nothing to save answers. */
const NO_SAVE_NAMES: BatchSaveNames = { ownNames: [], alwaysSave: false };

/** A reset's questions over these rows. */
export function resetQuestions(
    rows: BatchResetRow[],
    save: Partial<BatchSaveNames> = {}
): PrepareProjectsBatchResponse {
    return { action: 'reset', rows, ...NO_SAVE_NAMES, ...save };
}

/** A delete's questions over these rows. */
export function deleteQuestions(
    rows: BatchDeleteRow[],
    save: Partial<BatchSaveNames> = {}
): PrepareProjectsBatchResponse {
    return { action: 'delete', rows, ...NO_SAVE_NAMES, ...save };
}
