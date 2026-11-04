/**
 * A datapack save (Save and Save As), in the one stage table (`operationStages.ts`, which
 * spreads them into `OPERATION_STAGES`). The same rules hold: a label of at most 25
 * characters, an expectation and a detail. Plain words for what the software does (owner,
 * 2026-11-03: "Reading the store" read as an AI talking).
 *
 * Reading measured once on a live store, 2026-11-03: 1 minute 5 seconds for about 200 items.
 */

export const DATAPACK_STAGES = {
    readingStoreChanges: {
        label: 'Reading from Commerce',
        expectation: 'Usually about a minute',
        // Shown when the save names nothing of its own; it names what it reads (`readingLine`).
        detail: "From this demo's Commerce instance",
    },
    savingToLibrary: {
        label: 'Saving to your library',
        expectation: 'Usually a few seconds',
        // Shown when the save names nothing of its own; it says which version (`savingLine`).
        detail: 'As a new version of the datapack',
    },
    // "Delete Datapack" on a project delete (step 07): one library delete per version.
    // FIRST ESTIMATE, NOT MEASURED.
    deletingOwnPack: {
        label: 'Deleting its pack',
        expectation: 'Usually a few seconds',
        detail: "This demo's pack in the library",
    },
    // Clearing a demo's stores (step 10), in the order the clearing runs. FIRST ESTIMATES, NOT
    // MEASURED: the clearing has not yet run against a live store.
    // Re-reads what it is about to remove, data type by data type (`phaseLine`), against the list
    // the SC approved (owner, 2026-11-04: "Checking the stores" named the wrong thing).
    verifyingDemoData: {
        label: 'Verifying demo data',
        expectation: 'Usually under a minute',
        detail: 'Each data type, in Commerce',
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
    // Step 11: cart rules, before the categories their conditions name.
    removingCartRules: {
        label: 'Removing cart rules',
        expectation: 'Usually a second each',
        detail: 'With their coupons',
    },
    takingRulesOff: {
        label: 'Taking rules off sites',
        expectation: 'Usually a second each',
        detail: 'Rules other websites also use',
    },
    // A demo's B2B data, attribute sets and settings (step 10, 2026-11-02). Companies before their
    // customers: Commerce refuses to delete a company's admin while the company stands.
    removingCompanies: {
        label: 'Removing companies',
        expectation: 'A few seconds each',
        detail: 'The customers in them go next',
    },
    removingCatalogs: {
        label: 'Removing shared catalogs',
        expectation: 'A few seconds each',
        detail: 'Each with its customer group',
    },
    removingCustomerGroups: {
        label: 'Removing customer groups',
        expectation: 'Usually a second each',
        detail: 'Groups no catalog uses',
    },
    removingCategories: {
        label: 'Removing categories',
        expectation: 'Usually a second each',
        detail: 'Deepest first, roots kept',
    },
    removingAttributeSets: {
        label: 'Removing attribute sets',
        expectation: 'Usually a second each',
        detail: 'Sets nothing else uses',
    },
    removingAttributes: {
        label: 'Removing attributes',
        expectation: 'Usually a second each',
        detail: 'Attributes nothing else uses',
    },
    resettingSettings: {
        label: 'Resetting site settings',
        expectation: 'Usually under a minute',
        detail: "The website's, back to the default",
    },
    refreshingErp: {
        label: 'Refreshing the ERP',
        expectation: 'Usually a few minutes',
        detail: 'Filled again from Commerce',
    },
} as const;
