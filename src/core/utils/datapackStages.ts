/**
 * A datapack save (Save and Save As), in the one stage table (`operationStages.ts`, which
 * spreads them into `OPERATION_STAGES`). The same rules hold: a label of at most 25
 * characters and an expectation; a detail only where it adds something the label does not say
 * (Phase 1, owner 2026-11-10). Plain words for what the software does (owner, 2026-11-03:
 * "Reading the store" read as an AI talking).
 *
 * Reading measured once on a live store, 2026-11-03: 1 minute 5 seconds for about 200 items.
 */

export const DATAPACK_STAGES = {
    // The save names what it reads when it has something to name (`readingLine`).
    readingStoreChanges: { label: 'Reading from Commerce', expectation: 'Usually about a minute' },
    // The save says what is going in when it has something to say (`savingLine`).
    savingToLibrary: { label: 'Saving to My Datapacks', expectation: 'Usually a few seconds' },
    // Clearing a demo's stores (step 10), in the order the clearing runs. FIRST ESTIMATES, NOT
    // MEASURED: the clearing has not yet run against a live store.
    // Re-reads what it is about to remove, data type by data type (`phaseLine`), against the list
    // the SC approved (owner, 2026-11-04: "Checking the stores" named the wrong thing).
    verifyingDemoData: {
        label: 'Verifying demo data',
        expectation: 'Usually under a minute',
        detail: 'In Commerce',
    },
    // An ERP integration serves some chosen stores ("One action, ERP included"): it closes their
    // orders first, and its ERP is filled again from Commerce last.
    closingErpOrders: { label: 'Closing orders in the ERP', expectation: 'Usually a minute or two' },
    closingReturns: {
        label: 'Closing returns',
        expectation: 'A few seconds each',
        detail: 'In the selected stores',
    },
    closingOrders: { label: 'Closing orders', expectation: 'A few seconds each' },
    // What the clearing does, in Commerce's own verbs, one per action (Flow 2.20, owner
    // 2026-11-10): Delete is gone from Commerce; Remove ... from websites still exists, no longer on
    // that website; Restore default configuration sets the website scope back to Default Config.
    // Each label stands alone, with no second line. Three run past 25 characters: the cap and the
    // verb convention for the whole extension land in Phase 1b.
    removingCustomers: { label: 'Deleting customers', expectation: 'Usually a second each' },
    removingProducts: { label: 'Deleting products', expectation: 'Usually a second each' },
    takingProductsOff: { label: 'Removing products from websites', expectation: 'Usually a second each' },
    // Step 11: cart rules, before the categories their conditions name.
    removingCartRules: { label: 'Deleting cart price rules', expectation: 'Usually a second each' },
    takingRulesOff: { label: 'Removing cart price rules from websites', expectation: 'Usually a second each' },
    // A demo's B2B data, attribute sets and settings (step 10, 2026-11-02). Companies before their
    // customers: Commerce refuses to delete a company's admin while the company stands.
    removingCompanies: { label: 'Deleting companies', expectation: 'A few seconds each' },
    removingCatalogs: { label: 'Deleting shared catalogs', expectation: 'A few seconds each' },
    removingCustomerGroups: { label: 'Deleting customer groups', expectation: 'Usually a second each' },
    removingCategories: { label: 'Deleting categories', expectation: 'Usually a second each' },
    removingAttributeSets: { label: 'Deleting attribute sets', expectation: 'Usually a second each' },
    removingAttributes: { label: 'Deleting attributes', expectation: 'Usually a second each' },
    resettingSettings: { label: 'Restoring default configuration', expectation: 'Usually under a minute' },
    refreshingErp: {
        label: 'Refreshing the ERP',
        expectation: 'Usually a few minutes',
        detail: 'From Commerce',
    },
} as const;
