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
    // config.json, published: ONE job wherever it runs (progress vocabulary slice 3,
    // owner 2026-10-16). The dashboard's and Configure's Republish, the mesh deploy's
    // follow-up (a redeploy that changed the mesh's address left the storefront on the
    // old one until someone republished by hand, 2026-09-21) and Repair Site
    // Configuration each named it differently until then. Measured from five config
    // publishes in the Debug Logs (2026-10-12 and 15): 8 to 9 seconds from the push to
    // the CDN check, under a second when config.json had not changed.
    publishingSettings: {
        label: STOREFRONT_JOBS.publishingSettings,
        expectation: 'Usually about 10 seconds',
        detail: 'config.json, which the storefront reads',
    },
    // The Configuration Service entry Repair Site Configuration writes again. Measured
    // from one reset (2026-10-16): 13 seconds, an Admin API key made on the way.
    updatingSiteConfig: {
        label: STOREFRONT_JOBS.updatingSiteConfig,
        expectation: 'Usually under a minute',
        detail: "The site's entry in the Configuration Service",
    },
    // Republish's steps between the code and the pages. Measured in two resets of the
    // scratch storefront (2026-10-16), which run the same calls: the permissions in
    // under a second, the cache purge in about half a second.
    settingSitePermissions: {
        label: STOREFRONT_JOBS.settingSitePermissions,
        expectation: 'Usually a few seconds',
        detail: 'Your access to edit the site in DA.live',
    },
    clearingCache: {
        label: STOREFRONT_JOBS.clearingCache,
        expectation: 'Usually a few seconds',
        detail: 'So the live site serves the new pages',
    },
    // A republish after the store changed (EDS-44): the config, then the old store's
    // product pages out, the catalog menu swapped, the new store's product pages warmed
    // (`warmingProductPages`, Reset's step for the same job).
    removingProductPages: {
        label: STOREFRONT_JOBS.removingProductPages,
        expectation: 'Usually under a minute',
        detail: "Removing the old store's product pages",
    },
    // Republish refreshes the catalog menu, or swaps it after a store change. Measured
    // from one reset (2026-10-16): 47 seconds for 11 category pages.
    updatingCatalogMenu: {
        label: STOREFRONT_JOBS.updatingCatalogMenu,
        expectation: 'Usually under a minute',
        detail: 'A page per category; pages you edited are kept',
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
    // Republish's step too, where it publishes the whole code tree: about a second in
    // two resets of the scratch storefront (2026-10-16), which make the same call.
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

    // The wizard's storefront setup, before the work it shares with Reset (whose steps
    // it shows for that part: 'Publishing code, settings', 'Copying the content',
    // 'Setting up authoring', 'Publishing the pages' and the rest). Measured from five
    // setups in the Debug Logs (2026-10-12, four new repositories, and 2026-10-15, an
    // existing one): 19 to 35 seconds from the start to the content source being
    // connected for a new repository, about a second for an existing one; the code
    // step 21 seconds with two block libraries.
    settingUpRepository: {
        label: 'Setting up the repository',
        expectation: 'Usually under a minute',
        detail: 'Your GitHub repository, from the template',
    },
    settingUpCode: {
        label: 'Setting up the code',
        expectation: 'Usually under a minute',
        detail: 'The content source, block libraries and inspector tagging',
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
    // Site Access's "check access": a poll of about two minutes (`waitForConfigAccess`
    // sleeps 30s, 30s, 45s). The checks it has made are a count, on the line under it.
    waitingForSiteAccess: {
        label: 'Waiting for site access',
        expectation: 'Up to about two minutes',
        detail: 'Checking whether the admin role has landed',
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;
