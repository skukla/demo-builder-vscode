/**
 * The storefront's jobs, one name each, and how a progress line says what a job is
 * doing ("Copying the content: 40 of 103 files").
 *
 * WHY one name per job (owner, 2026-10-16 release walk: "Everything should be
 * consistent"): the same piece of work, copying the demo's pages into DA.live, was
 * shown as "Populating DA.live content", "Copying content from template" and
 * "Content populated" depending on which flow ran it. Reset, Republish, project
 * creation, storefront setup and Refresh Blocks all run the shared content pipeline,
 * so its emitters take their words from here and every flow says the same thing.
 *
 * A name is also a step label where a flow's step IS the job. Counts go after the
 * name, never in it.
 * The vocabulary is `.rptc/plans/progress-vocabulary/overview.md`.
 *
 * vscode-free: the MCP server's process runs the same pipeline.
 *
 * @module core/utils/storefrontJobs
 */

export const STOREFRONT_JOBS = {
    creatingRepository: 'Creating the repository',
    resettingRepository: 'Resetting the repository',
    publishingCode: 'Publishing the code',
    settingSitePermissions: 'Setting site permissions',
    publishingSettings: 'Publishing the settings',
    updatingSiteConfig: 'Updating the site config',
    clearingContent: 'Clearing DA.live content',
    copyingContent: 'Copying the content',
    buildingBlockLibrary: 'Building block library',
    applyingDaLiveSettings: 'Applying DA.live settings',
    clearingCache: 'Clearing the cache',
    previewingPages: 'Previewing the pages',
    publishingPages: 'Publishing the pages',
    publishingSheets: 'Publishing the sheets',
    publishingBlockList: 'Publishing the block list',
    removingOldPages: 'Removing old pages',
    checkingCopiedPages: 'Checking copied pages',
    warmingProductPages: 'Warming product pages',
    addingCatalogMenu: 'Adding the catalog menu',
    updatingCatalogMenu: 'Updating the catalog menu',
    removingCatalogMenu: 'Removing the catalog menu',
    removingProductPages: 'Removing product pages',
    installingDatapack: 'Installing the datapack',
} as const;

/**
 * A job's name with what it is doing now.
 *
 * @param name - the job's name, from {@link STOREFRONT_JOBS}
 * @param detail - a count or a short phrase: "40 of 103 files", "finding the pages"
 * @returns "Copying the content: 40 of 103 files"
 */
export function jobLine(name: string, detail: string): string {
    return `${name}: ${detail}`;
}

/**
 * How many items there are, in the singular for one.
 *
 * @param total - how many
 * @param unit - the singular noun: "sheet"
 * @returns "2 sheets", "1 sheet"
 */
export function itemCount(total: number, unit: string): string {
    return `${total} ${total === 1 ? unit : `${unit}s`}`;
}

/**
 * How far a job has got through its items.
 *
 * @param done - items done so far
 * @param total - items in all
 * @param unit - the singular noun: "page"
 * @returns "32 of 64 pages", "1 of 1 page"
 */
export function countLine(done: number, total: number, unit: string): string {
    return `${done} of ${itemCount(total, unit)}`;
}
