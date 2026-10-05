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
 * ## Categories added afterwards (EDS-27)
 *
 * {@link findNewCategoryPagesStep} and {@link addNewCategoryPagesStep} are the same step
 * for the watcher that runs while a project is open, and for agents: find the categories
 * with no page, and add those. ADD-ONLY — no page is rewritten or removed and the nav is
 * not touched (`newCategoryPages.ts`). They act only on a storefront that has the block
 * AND that this step has already set the menu up on (a record exists): a storefront never
 * set up would otherwise have every category "missing", and its first run belongs to
 * Republish, which also puts the menu in the nav.
 *
 * @module features/eds/services/catalogMenu/catalogMenuStep
 */

import { isEmptyRecord, readCatalogMenuRecord, writeCatalogMenuRecord } from './catalogMenuRecord';
import { applyCatalogMenu, removeCatalogMenu, type StorefrontPages } from './catalogMenuService';
import { describeAdded, describeBuild, describeRemoval } from './catalogMenuSummary';
import type { CatalogCategory } from './categoryPages';
import { addMissingCategoryPages, findMissingCategoryPages } from './newCategoryPages';
import { DaLiveAuthError } from '@/features/eds/services/types';
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

/** A category, as the SC knows it, and the address its page goes at. */
export interface NewCategory {
    name: string;
    path: string;
}

/** What a look for unpaged categories found. `signIn`: the DA.live sign-in was refused. */
export type NewCategoryPagesCheck =
    | { status: 'nothing' }
    | { status: 'missing'; categories: NewCategory[] }
    | { status: 'failed'; error: string; signIn: boolean };

export interface NewCategoryPagesAdded {
    added: NewCategory[];
    /** One sentence for the notice, the log and the agent. */
    summary: string;
    /** True when nothing was added because the DA.live sign-in was refused. */
    signIn: boolean;
}

const failure = (error: unknown): { error: string; signIn: boolean } => ({
    error: messageOf(error),
    signIn: error instanceof DaLiveAuthError,
});

/** Whether this is a storefront the add-only path acts on: set up by the step, block present. */
async function isSetUpWithBlock(project: Project, site: CatalogMenuSite): Promise<boolean> {
    if (isEmptyRecord(readCatalogMenuRecord(project))) return false;
    return site.hasBlock();
}

/**
 * The menu categories that have no page yet. A READ: it writes nothing, removes nothing,
 * and does not change the project.
 *
 * A read that fails comes back as `failed` — never as "these are all missing".
 *
 * @param project - the project, whose record is read
 * @param site - the storefront
 * @returns the categories without pages, nothing, or why it could not tell
 */
export async function findNewCategoryPagesStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<NewCategoryPagesCheck> {
    try {
        if (!(await isSetUpWithBlock(project, site))) return { status: 'nothing' };
        const missing = await findMissingCategoryPages(site, readCatalogMenuRecord(project));
        if (missing.length === 0) return { status: 'nothing' };
        return { status: 'missing', categories: missing.map(({ name, path }) => ({ name, path })) };
    } catch (error) {
        return { status: 'failed', ...failure(error) };
    }
}

/**
 * Write and publish a page for each menu category that has none. Add-only; never throws.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param site - the storefront
 * @returns the categories that got a page, and the sentence that says so
 */
export async function addNewCategoryPagesStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<NewCategoryPagesAdded> {
    try {
        if (!(await isSetUpWithBlock(project, site))) {
            return { added: [], summary: describeAdded([], []), signIn: false };
        }
        const report = await addMissingCategoryPages(site, readCatalogMenuRecord(project));
        writeCatalogMenuRecord(project, report.record);
        const added = report.written.map(({ name, path }) => ({ name, path }));
        return { added, summary: describeAdded(added, report.failed), signIn: false };
    } catch (error) {
        const { error: message, signIn } = failure(error);
        return { added: [], summary: `No category pages were added: ${message}.`, signIn };
    }
}
