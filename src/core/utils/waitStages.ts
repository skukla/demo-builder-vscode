/**
 * What a waiting dialog or flyout says while it reads what it will show (owner, 2026-11-08,
 * walk F72): the progress window's three rows, from a table in the same shape as
 * `OPERATION_STAGES`. A label of at most 25 characters (what it is doing), a detail (on what), and
 * an expectation of at most 25 (how long), checked by `waitStages.test.ts` with the same rules.
 *
 * Kept apart from `OPERATION_STAGES` on purpose: that table is also looked up BY LABEL for a
 * background notification's lines (`expectationFor`), and a wait reusing a label there with
 * another expectation ("Reading from Commerce", about a minute for a save, a few seconds for a pick
 * list) would answer the wrong one. A wait doing the very same work as a stage reuses that stage.
 *
 * Words follow the stages': "Reading from Commerce", never "Reading the store" (owner, 2026-11-03:
 * it read as an AI talking). EXPECTATIONS ARE FIRST ESTIMATES unless a comment says measured,
 * as in the stage tables; correct them from the step timings in Debug Logs.
 *
 * @module core/utils/waitStages
 */

import type { OperationStage } from './operationStages';

/**
 * A wait's words: a stage's, with the detail optional. Some waits need no line 2: the label
 * already says all there is (owner, 2026-11-08, of Share and Stop Sharing).
 */
export type WaitStage = Omit<OperationStage, 'detail'> & { readonly detail?: string };

const FEW_SECONDS = 'Usually a few seconds';
const ABOUT_A_MINUTE = 'Usually about a minute';
const FROM_COMMERCE = 'From Commerce';

export const WAIT_STAGES = {
    // The check before an action that overwrites or removes: it reads the edits the action would lose
    // and what it goes back to or puts in, so it is named for the action it prepares, as installers do
    // (walk F200, owner 2026-11-17; "Finding unsaved changes" named one read, and the question after
    // it is about the other). Before Update and Save Changes, whose point is the edits, the comparison
    // itself (F193). Measured 2026-11-08: 58 seconds for Luma's 12 data types on a live instance.
    preparingRestore: { label: 'Preparing to restore', expectation: ABOUT_A_MINUTE },
    preparingUninstall: { label: 'Preparing to uninstall', expectation: ABOUT_A_MINUTE },
    preparingSwitch: { label: 'Preparing to switch', expectation: ABOUT_A_MINUTE },
    preparingInstall: { label: 'Preparing to install', expectation: ABOUT_A_MINUTE },
    comparingWithCommerce: { label: 'Comparing with Commerce', expectation: ABOUT_A_MINUTE },
    // A Dry Run of an install: the request is checked and nothing is written (D6; the name Dry Run
    // is kept, owner 2026-11-10). The label alone; the result says nothing was written.
    checkingImport: { label: 'Running the dry run', expectation: FEW_SECONDS },
    readingWhatToSelect: { label: 'Reading from Commerce', expectation: FEW_SECONDS },
    readingCatalogViews: {
        label: 'Reading catalog views',
        expectation: FEW_SECONDS,
        detail: 'From Adobe Commerce Optimizer',
    },
    readingErpCatalog: { label: 'Reading the catalog', expectation: FEW_SECONDS, detail: FROM_COMMERCE },
    readingProducts: { label: 'Reading products', expectation: FEW_SECONDS, detail: FROM_COMMERCE },
    readingDemoData: {
        label: 'Reading demo data',
        expectation: FEW_SECONDS,
        detail: FROM_COMMERCE,
    },
    readingProjectsDemoData: {
        label: 'Reading demo data',
        expectation: FEW_SECONDS,
        detail: 'From each selected project',
    },
    readingProjects: { label: 'Reading projects', expectation: FEW_SECONDS },
    // One project is read as one (owner, release test 2.7, 2026-11-16); its name goes on the line under.
    readingProject: { label: 'Reading the project', expectation: FEW_SECONDS },
    readingErpStatus: { label: 'Reading the ERP status', expectation: FEW_SECONDS },
    checkingDemoSetup: { label: 'Checking the demo setup', expectation: FEW_SECONDS },
    // The first read of an org's APIs is slow on Adobe's side (the old helper text said so).
    readingAdobeServices: {
        label: 'Reading Adobe services',
        expectation: 'Usually a few minutes',
        detail: "Your organization's APIs",
    },
    readingDemo: { label: 'Reading the demo', expectation: FEW_SECONDS },
    checkingSharedDemo: { label: 'Checking the shared demo', expectation: FEW_SECONDS },
    checkingAiSetup: {
        label: 'Checking the AI setup',
        expectation: FEW_SECONDS,
        detail: 'Files and MCP servers',
    },
    // The datapack flyout: its own load, then each menu row's work.
    readingPack: { label: 'Reading the datapack', expectation: FEW_SECONDS },
    // Review Records, while it reads what an install, a switch or an uninstall would put in or take
    // out (owner, 2026-11-16: it said "Opening Uninstall Frescopa?").
    readingRecords: { label: 'Reading the records', expectation: FEW_SECONDS },
    savingPackFile: { label: 'Saving to a file', expectation: FEW_SECONDS },
    // Share and Stop Sharing: the label alone (owner, 2026-11-08). Each changes every version.
    sharingPack: { label: 'Sharing the datapack', expectation: FEW_SECONDS },
    makingPackPrivate: { label: 'Making it private', expectation: FEW_SECONDS },
    deletingPack: { label: 'Deleting the datapack', expectation: FEW_SECONDS },
    // Undo Last Save, until its run is accepted and its window takes over (Phase 2).
    startingUndo: { label: 'Starting the undo', expectation: FEW_SECONDS },
    // Retry on a failed install, until its run is accepted and its window takes over (step-04 S8).
    startingInstall: { label: 'Starting the install', expectation: FEW_SECONDS },
} as const satisfies Record<string, WaitStage>;

/**
 * One kind's list in Create Datapack's picker ("Reading categories"), in the words of
 * `readingProducts` (owner, 2026-11-08, F79: the pane's spinner said nothing).
 *
 * @param many - the kind's plural noun, as `KIND_NOUNS` gives it
 */
export function readingKind(many: string): WaitStage {
    return { label: `Reading ${many}`, expectation: FEW_SECONDS, detail: FROM_COMMERCE };
}
