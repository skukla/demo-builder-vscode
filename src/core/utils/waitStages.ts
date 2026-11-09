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

import { DATAPACK_STAGES } from './datapackStages';
import type { OperationStage } from './operationStages';

/**
 * A wait's words: a stage's, with the detail optional. Some waits need no line 2: the label
 * already says all there is (owner, 2026-11-08, of Share and Stop Sharing).
 */
export type WaitStage = Omit<OperationStage, 'detail'> & { readonly detail?: string };

const FEW_SECONDS = 'Usually a few seconds';
const FROM_COMMERCE = "From this demo's Commerce instance";

export const WAIT_STAGES = {
    // A re-import's comparison, before its form (EDS walk F56). Measured 2026-11-08: 58 seconds for
    // Luma's 12 data types on a live store.
    comparingWithCommerce: {
        label: 'Comparing with Commerce',
        expectation: 'Usually about a minute',
        detail: 'Each data type in the datapack',
    },
    readingWebsites: { label: 'Reading websites', expectation: FEW_SECONDS, detail: FROM_COMMERCE },
    // Before Remove: the same read as a save's, of what changed since the import.
    readingChangesSinceImport: {
        ...DATAPACK_STAGES.readingStoreChanges,
        detail: 'Changes since the import',
    },
    readingWhatToSelect: {
        label: 'Reading from Commerce',
        expectation: FEW_SECONDS,
        detail: 'What there is to select',
    },
    readingCatalogViews: {
        label: 'Reading catalog views',
        expectation: FEW_SECONDS,
        detail: 'From Adobe Commerce Optimizer',
    },
    readingErpCatalog: {
        label: 'Reading from Commerce',
        expectation: FEW_SECONDS,
        detail: 'The catalog the ERP will hold',
    },
    readingProducts: { label: 'Reading products', expectation: FEW_SECONDS, detail: FROM_COMMERCE },
    readingDemoData: {
        label: 'Reading demo data',
        expectation: FEW_SECONDS,
        detail: 'Each data type, in Commerce',
    },
    readingProjectsDemoData: {
        label: 'Reading demo data',
        expectation: FEW_SECONDS,
        detail: "Each selected project's Commerce",
    },
    readingProjects: {
        label: 'Reading projects',
        expectation: FEW_SECONDS,
        detail: 'What each selected project holds',
    },
    readingErpStatus: {
        label: 'Reading the ERP status',
        expectation: FEW_SECONDS,
        detail: 'From the ERP',
    },
    checkingDemoSetup: {
        label: 'Checking the demo setup',
        expectation: FEW_SECONDS,
        detail: 'What this integration needs',
    },
    // The first read of an org's APIs is slow on Adobe's side (the old helper text said so).
    readingAdobeServices: {
        label: 'Reading Adobe services',
        expectation: 'First load: a few minutes',
        detail: "Your organization's APIs",
    },
    readingDemo: {
        label: 'Reading the demo',
        expectation: FEW_SECONDS,
        detail: 'Its package and storefront',
    },
    checkingSharedDemo: {
        label: 'Checking the shared demo',
        expectation: FEW_SECONDS,
        detail: 'Its package and datapack',
    },
    checkingAiSetup: {
        label: 'Checking the AI setup',
        expectation: FEW_SECONDS,
        detail: 'Files and MCP servers',
    },
    // The datapack flyout: its own load, then each menu row's work.
    // Its versions, data types and settings, wherever the pack is kept.
    readingPack: { label: 'Reading the datapack', expectation: FEW_SECONDS, detail: 'Its versions and data types' },
    savingPackFile: {
        label: 'Saving to a file',
        expectation: FEW_SECONDS,
        detail: 'Every data type in the pack',
    },
    // Share and Stop Sharing: the label alone (owner, 2026-11-08). Each changes every version.
    sharingPack: { label: 'Sharing the datapack', expectation: FEW_SECONDS },
    makingPackPrivate: { label: 'Making it private', expectation: FEW_SECONDS },
    removingPack: {
        label: 'Removing the datapack',
        expectation: FEW_SECONDS,
        detail: 'This version, from the library',
    },
    removingPackSettings: {
        label: 'Removing store settings',
        expectation: FEW_SECONDS,
        detail: 'Saved with this datapack',
    },
} as const satisfies Record<string, WaitStage>;

/**
 * One kind's list in Create Datapack's picker ("Reading categories"), in the words of
 * `readingProducts` and `readingWebsites` (owner, 2026-11-08, F79: the pane's spinner said nothing).
 *
 * @param many - the kind's plural noun, as `KIND_NOUNS` gives it
 */
export function readingKind(many: string): WaitStage {
    return { label: `Reading ${many}`, expectation: FEW_SECONDS, detail: FROM_COMMERCE };
}
