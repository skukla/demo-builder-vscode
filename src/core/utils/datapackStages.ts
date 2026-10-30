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
    // "Also delete its pack" on a project delete (step 07): one library delete per version.
    // FIRST ESTIMATE, NOT MEASURED.
    deletingOwnPack: {
        label: 'Deleting its pack',
        expectation: 'Usually a few seconds',
        detail: "This demo's pack in the library",
    },
    // Clearing a demo's stores (step 10), in the order the clearing runs. FIRST ESTIMATES, NOT
    // MEASURED: the clearing has not yet run against a live store.
    checkingStores: {
        label: 'Checking the stores',
        expectation: 'Usually under a minute',
        detail: 'That the list shown still holds',
    },
    // An ERP integration serves some chosen stores ("One action, ERP included"): it closes their
    // orders first, and its ERP is filled again from Commerce last.
    closingErpOrders: {
        label: 'Closing orders in the ERP',
        expectation: 'Usually a minute or two',
        detail: 'Through the ERP integration',
    },
    closingReturns: {
        label: 'Closing returns',
        expectation: 'A few seconds each',
        detail: 'Returns placed in the chosen stores',
    },
    closingOrders: {
        label: 'Closing orders',
        expectation: 'A few seconds each',
        detail: 'Canceled, or refunded, then noted',
    },
    removingCustomers: {
        label: 'Removing customers',
        expectation: 'Usually a second each',
        detail: "Accounts the chosen stores own",
    },
    removingProducts: {
        label: 'Removing products',
        expectation: 'Usually a second each',
        detail: 'Products the chosen stores own',
    },
    takingProductsOff: {
        label: 'Taking products off sites',
        expectation: 'Usually a second each',
        detail: 'Products other websites also sell',
    },
    removingCategories: {
        label: 'Removing categories',
        expectation: 'Usually a second each',
        detail: 'Deepest first, roots kept',
    },
    refreshingErp: {
        label: 'Refreshing the ERP',
        expectation: 'Usually a few minutes',
        detail: 'Filled again from Commerce',
    },
} as const;
