/**
 * The storefront's stages, in the one stage table (`operationStages.ts`), which spreads
 * them into `OPERATION_STAGES`: callers reach them as `OPERATION_STAGES.<key>` like any
 * other, and the same rules hold (a label of at most 25 characters, an expectation and
 * a detail). Kept in their own file so the table stays under the util size limit.
 *
 * Where a step IS one of the storefront's jobs (`storefrontJobs.ts`), its label is the
 * job's name, by reference, so the step and the job cannot be worded apart.
 */

import { STOREFRONT_JOBS } from './storefrontJobs';

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
        label: STOREFRONT_JOBS.removingProductPages,
        expectation: 'Usually under a minute',
        detail: "Removing the old store's product pages",
    },
    updatingCategoryPages: {
        label: 'Updating category pages',
        expectation: 'Usually under a minute',
        detail: "The new store's categories; pages you edited are kept",
    },
    // Configure's Republish with block library work pending (EDS-39): the libraries
    // unticked go first, then the ones ticked, then the DA.live block list follows.
    removingBlockLibraries: {
        label: 'Removing block libraries',
        expectation: 'Usually under a minute',
        detail: 'Taking their blocks out of the storefront',
    },
    addingBlockLibraries: {
        label: 'Adding block libraries',
        expectation: 'Usually under a minute',
        detail: 'Copying their blocks into the storefront',
    },
    publishingBlockList: {
        label: STOREFRONT_JOBS.publishingBlockList,
        expectation: 'Usually under a minute',
        detail: 'So DA.live offers the blocks the storefront has',
    },
    publishingProductPages: {
        label: 'Publishing product pages',
        expectation: 'A few minutes for a large catalog',
        detail: "One page per product in the new store's catalog",
    },

    // Sync Storefront (progress vocabulary slice 2, owner 2026-10-16): save, push,
    // publish the code; the three merge steps only when GitHub has work the SC does
    // not. No sync run was in the Debug Logs to measure: every expectation here is a
    // FIRST ESTIMATE, NOT MEASURED, except the code publish, which is one page's
    // preview and publish (about 4 seconds for the block list's page, 2026-10-16).
    savingChanges: {
        label: 'Saving your changes',
        expectation: 'Usually a few seconds',
        detail: 'Committing what you changed in the storefront',
    },
    mergingChanges: {
        label: 'Merging their work in',
        expectation: 'Usually a few seconds',
        detail: 'GitHub has work you do not, so it comes in first',
    },
    waitingForMerge: {
        label: 'Waiting for your merge',
        expectation: 'Until you finish it in Source Control',
        detail: 'Resolve each conflict in Source Control',
    },
    finishingMerge: {
        label: 'Finishing the merge',
        expectation: 'Usually a few seconds',
        detail: 'Your changes on top of theirs',
    },
    pushingToGitHub: {
        label: 'Pushing to GitHub',
        expectation: 'Usually a few seconds',
        detail: 'Sending your commit to the repository',
    },
    publishingCode: {
        label: STOREFRONT_JOBS.publishingCode,
        expectation: 'Usually a few seconds',
        detail: 'So the live site runs the new code',
    },

    // Refresh Blocks, then the block list above. Measured from six library-only runs
    // in the Debug Logs (2026-10-15 and 16): building took 11 to 36 seconds, the
    // DA.live settings under a second.
    buildingBlockLibrary: {
        label: STOREFRONT_JOBS.buildingBlockLibrary,
        expectation: 'Usually under a minute',
        detail: 'The blocks DA.live offers its authors',
    },
    applyingDaLiveSettings: {
        label: STOREFRONT_JOBS.applyingDaLiveSettings,
        expectation: 'Usually a few seconds',
        detail: "This site's DA.live editor settings",
    },

    // Deleting a project: the storefront taken down (`storefrontTeardown.ts`), its
    // repository, then the project's own files. Measured from two deletes in the
    // Debug Logs (2026-10-09, 119 pages: about 50 seconds unpublishing, 21 for 49
    // product pages, 15 for 68 DA.live files, under a second each for the settings and
    // the repository, 3 for the files; 2026-10-14 agrees).
    takingPagesOffSite: {
        label: 'Taking pages off the site',
        expectation: 'Usually about a minute',
        detail: 'So the live site stops serving them',
    },
    clearingDaLiveContent: {
        label: STOREFRONT_JOBS.clearingContent,
        expectation: 'Usually under a minute',
        detail: "The site's documents in DA.live",
    },
    clearingSiteSettings: {
        label: 'Clearing site settings',
        expectation: 'Usually a few seconds',
        detail: "The site's DA.live permissions and config",
    },
    deletingRepository: {
        label: 'Deleting the repository',
        expectation: 'Usually a few seconds',
        detail: "The storefront's GitHub repository",
    },
    removingProjectFiles: {
        label: 'Removing project files',
        expectation: 'Usually a few seconds',
        detail: 'Its folder on this computer',
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;
