/**
 * A reset's datapack step as a batch sees it (step-05 S6, owner 2026-11-13): the batch's answers,
 * what the removal did to the store, the row's line for it, and a reset that failed after it. A
 * storefront reset (`edsResetUI`) and a headless one (`projectResetService`) both run the step;
 * the batch row says what it did. Its own file so `edsResetSampleData` keeps only the removal.
 *
 * @module features/eds/services/reset/resetDatapackStep
 */

import type { SaveAsAnswer } from './edsResetSampleData';

/**
 * A batch's answers about one project's datapack, given before any reset runs: its Uninstall
 * Datapack box, and the save question's answer for a pack with changes (a name, or `drop`).
 */
export interface AnsweredDatapack {
    removeDatapack: boolean;
    changes?: SaveAsAnswer;
}

/**
 * What a removal did to the store: `kept` is why the data did not all come out (absent when it
 * did), `partly` that some of it came out before it stopped.
 */
export interface DatapackRemoval {
    kept?: string;
    partly?: boolean;
}

/** A reset row's line for what its datapack step did to the store. */
export function datapackStepLine(removal: DatapackRemoval): string {
    if (removal.kept === undefined) return 'Its datapack was uninstalled.';
    if (removal.partly) return `Part of its datapack was uninstalled: ${removal.kept}`;
    return `Its datapack was not uninstalled: ${removal.kept}`;
}

/**
 * A reset that threw after its datapack step ran: the same failure, in the same words, carrying
 * what the step did, so the batch row can say what became of the store (review, 2026-11-13).
 */
export class FailedAfterDatapack extends Error {
    constructor(
        cause: unknown,
        readonly removal: DatapackRemoval,
    ) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = 'FailedAfterDatapack';
    }
}
