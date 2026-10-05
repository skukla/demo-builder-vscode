/**
 * The catalog menu as a storefront step (EDS-24, owner-approved 2026-10-05).
 *
 * There is no button. Storefront setup (project creation), reset and republish each run
 * {@link applyCatalogMenuStep}; reset first runs {@link removeCatalogMenuStep} with the
 * stored record, so what it wrote comes out before the content is re-copied and goes back
 * in after. The three call sites are the only callers — `tests/templates/
 * spine-chokepoints.test.ts` pins them.
 *
 * - The step acts only when the storefront's OWN repository has `blocks/catalog-menu/`
 *   (the Demo Builder Blocks library). When the block has gone, it takes out what it
 *   wrote, so the nav never names a block the site does not have.
 * - Pages someone else made are never touched (`catalogMenuService`, ADR-013 in spirit);
 *   they come back in the summary by category name and address — the clash report.
 * - A category that already has a hand-built page, at any address, gets no page from us:
 *   the menu links to theirs, and the summary says so ("Signs uses your page at
 *   /safety-signage.").
 * - The record of what was written lives on the project
 *   (`componentInstances['eds-storefront'].metadata.catalogMenu`). The step changes the
 *   project in place; the caller's own save keeps it.
 * - Never throws. A storefront without its category pages is still a working storefront,
 *   and none of the three flows should fail over it. Every outcome comes back as one
 *   plain sentence for the flow's progress line and log; `undefined` means there was
 *   nothing to say (no block and nothing of ours on the site).
 *
 * @module features/eds/services/catalogMenu/catalogMenuStep
 */

import { isEmptyRecord, readCatalogMenuRecord, writeCatalogMenuRecord } from './catalogMenuRecord';
import { applyCatalogMenu, removeCatalogMenu, type StorefrontPages } from './catalogMenuService';
import { describeBuild, describeRemoval } from './catalogMenuSummary';
import type { CatalogCategory } from './categoryPages';
import type { Project } from '@/types/base';

/** One storefront, as the step needs it. Built by `createCatalogMenuSite`. */
export interface CatalogMenuSite {
    pages: StorefrontPages;
    /** Whether the storefront's repository has the block. Throws when it cannot tell. */
    hasBlock(): Promise<boolean>;
    /** Categories with "Include in Menu" on, for the project's store view. */
    readCategories(): Promise<CatalogCategory[]>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Take out the pages and the switch Demo Builder recorded writing — and nothing else.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param pages - the storefront's pages
 * @returns what happened, or undefined when there was nothing of ours to remove
 */
export async function removeCatalogMenuStep(
    project: Project,
    pages: StorefrontPages,
): Promise<string | undefined> {
    if (isEmptyRecord(readCatalogMenuRecord(project))) return undefined;
    try {
        const { record, ...facts } = await removeCatalogMenu({ pages }, readCatalogMenuRecord(project));
        writeCatalogMenuRecord(project, record);
        return describeRemoval(facts);
    } catch (error) {
        return `The category pages Demo Builder wrote could not be removed: ${messageOf(error)}.`;
    }
}

async function applyWithBlock(project: Project, site: CatalogMenuSite): Promise<string> {
    let report;
    try {
        report = await applyCatalogMenu(
            { pages: site.pages, readCategories: site.readCategories },
            readCatalogMenuRecord(project),
        );
    } catch (error) {
        // `applyCatalogMenu` throws only while reading — the category tree, or the
        // storefront's existing pages — before any write.
        return `Category pages were not written: ${messageOf(error)}. Republish the storefront to try again.`;
    }
    const { record, ...facts } = report;
    writeCatalogMenuRecord(project, record);
    return describeBuild(facts);
}

/**
 * Write a page per menu category and switch the catalog menu on in `/nav` — when the
 * storefront has the block. Re-running refreshes our unedited pages, adds pages for new
 * categories, and leaves every other page alone.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param site - the storefront
 * @returns what happened, or undefined when there was nothing to do
 */
export async function applyCatalogMenuStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<string | undefined> {
    let hasBlock: boolean;
    try {
        hasBlock = await site.hasBlock();
    } catch (error) {
        return `Couldn't check the storefront for the catalog menu block (${messageOf(error)}), so its category pages were not changed.`;
    }
    if (hasBlock) {
        try {
            return await applyWithBlock(project, site);
        } catch (error) {
            return `Category pages were not written: ${messageOf(error)}.`;
        }
    }
    const removed = await removeCatalogMenuStep(project, site.pages);
    return removed === undefined
        ? undefined
        : `The storefront no longer has the catalog menu block, so Demo Builder took its menu out. ${removed}`;
}
