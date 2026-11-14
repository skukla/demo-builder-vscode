/**
 * Typed shapes for a datapack removal's answers, so a fake removal cannot answer in a shape the
 * code no longer reads (root CLAUDE.md, "A shape written where the compiler cannot read it").
 *
 * @module tests/helpers/datapackRemovalFixtures
 */

import type {
    SampleDataDeps,
    SampleDataResult,
} from '@/features/data-installer/services/sampleDataInstall';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';

/** What the watcher hands back for a finished job (`SampleDataDeps.watch`). */
export type WatchedJob = Awaited<ReturnType<SampleDataDeps['watch']>>;

/** The engine's note on a removal that left part of the pack in Commerce on purpose. */
export const LEFT_NOTE = 'Kept 2 categories: products you added are in them.';

/** A watched removal that ran clean but left part of the pack in the store, with its note. */
export const WATCHED_LEFT_IN_STORE: WatchedJob = {
    outcome: 'success',
    perType: { categories: 'success' },
    leftInStore: true,
    note: LEFT_NOTE,
};

/** The removal phase's result for the same job (`removeSampleData`). */
export const RESULT_LEFT_IN_STORE: SampleDataResult = {
    ran: true,
    outcome: 'success',
    perType: { categories: 'success' },
    leftInStore: true,
    note: LEFT_NOTE,
};

/** What the reset's removal says of it (`removeProjectSampleDataOutcome`). */
export const REMOVAL_LEFT_IN_STORE: DatapackRemoval = { leftInStore: true, note: LEFT_NOTE };

/** The removal phase's result when no website and store view was ever recorded (`removeSampleData`). */
export const RESULT_NO_TARGET: SampleDataResult = {
    ran: false,
    skipped: true,
    noTarget: true,
    reason: 'No website and store view were recorded for this project.',
};

/**
 * What the reset's removal says of it: nothing to remove, since nothing can have been installed
 * (step-07 noTarget, owner 2026-11-14). Every door carries on with no stop and no line.
 */
export const REMOVAL_NO_TARGET: DatapackRemoval = { noTarget: true };
