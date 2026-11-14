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
