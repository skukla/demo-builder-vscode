/**
 * "Save store changes to this pack", in the one stage table (`operationStages.ts`, which
 * spreads them into `OPERATION_STAGES`). The same rules hold: a label of at most 25
 * characters, an expectation and a detail.
 *
 * Datapack-engine step 05: a pack's flyout saves the store's copy of it as a new version in the
 * datapack library. FIRST ESTIMATE, NOT MEASURED: it has not yet run against a live store.
 */

export const DATAPACK_STAGES = {
    readingStoreChanges: {
        label: 'Reading the store',
        expectation: 'Usually under a minute',
        detail: 'What the pack made, and what it uses',
    },
    savingToLibrary: {
        label: 'Saving to the library',
        expectation: 'Usually a few seconds',
        detail: 'The pack, as the store has it now',
    },
} as const;
