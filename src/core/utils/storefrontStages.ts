/**
 * The storefront's stages, in the one stage table (`operationStages.ts`), which spreads
 * them into `OPERATION_STAGES`: callers reach them as `OPERATION_STAGES.<key>` like any
 * other, and the same rules hold (a label of at most 25 characters, an expectation and
 * a detail). Kept in their own file so the table stays under the util size limit.
 */

export const STOREFRONT_STAGES = {
    // A mesh redeploy that changed its address left the storefront on the old one
    // until someone republished by hand (2026-09-21).
    republishingStorefront: {
        label: 'Republishing storefront',
        expectation: 'Usually under a minute',
        detail: 'So it reads the mesh at its current address',
    },
    // A republish after the store changed (EDS-44): the config, then the old store's
    // product pages out, the category pages swapped, the new store's product pages in.
    publishingConfig: {
        label: 'Publishing the config',
        expectation: 'Usually under a minute',
        detail: 'Publishing the configuration',
    },
    removingProductPages: {
        label: 'Removing product pages',
        expectation: 'Usually under a minute',
        detail: "Removing the old store's product pages",
    },
    updatingCategoryPages: {
        label: 'Updating category pages',
        expectation: 'Usually under a minute',
        detail: "The new store's categories; pages you edited are kept",
    },
    publishingProductPages: {
        label: 'Publishing product pages',
        expectation: 'A few minutes for a large catalog',
        detail: "One page per product in the new store's catalog",
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;
