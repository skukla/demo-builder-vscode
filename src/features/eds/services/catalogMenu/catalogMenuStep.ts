/**
 * The catalog menu as a storefront step (EDS-24, owner-approved 2026-10-05).
 *
 * There is no button. Storefront setup (project creation), reset and republish each run
 * {@link applyCatalogMenuStep}; reset first runs {@link removeCatalogMenuStep} with the
 * stored record, so what it wrote comes out before the content is re-copied and goes back
 * in after. After a store change (EDS-44), {@link replaceCatalogMenuStep} runs those two
 * in that order for the store-change service (`storefront/storeScopePages.ts`). These are
 * the only callers — `tests/templates/spine-chokepoints.test.ts` pins them.
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

/** What one run of a step did: its sentence, and the counts a store change reports. */
interface StepOutcome {
    summary: string;
    /** False when a page or the nav could not be changed, or the step could not run. */
    ok: boolean;
    /** Category pages written and published. */
    written: number;
    /** Pages Demo Builder wrote that the SC has edited since, so were left alone. */
    edited: string[];
}

const failedStep = (summary: string): StepOutcome => ({ summary, ok: false, written: 0, edited: [] });

function outcomeOf(
    summary: string,
    facts: { failed: unknown[]; nav: string; skipped: Array<{ path: string; reason: string }> },
    written: number,
): StepOutcome {
    return {
        summary,
        ok: facts.failed.length === 0 && facts.nav !== 'failed',
        written,
        edited: facts.skipped.filter((s) => s.reason === 'edited').map((s) => s.path),
    };
}

async function removal(project: Project, pages: StorefrontPages): Promise<StepOutcome | undefined> {
    if (isEmptyRecord(readCatalogMenuRecord(project))) return undefined;
    try {
        const { record, ...facts } = await removeCatalogMenu({ pages }, readCatalogMenuRecord(project));
        writeCatalogMenuRecord(project, record);
        return outcomeOf(describeRemoval(facts), facts, 0);
    } catch (error) {
        return failedStep(`The category pages Demo Builder wrote could not be removed: ${messageOf(error)}.`);
    }
}

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
    return (await removal(project, pages))?.summary;
}

async function applyWithBlock(project: Project, site: CatalogMenuSite): Promise<StepOutcome> {
    let report;
    try {
        report = await applyCatalogMenu(
            { pages: site.pages, readCategories: site.readCategories },
            readCatalogMenuRecord(project),
        );
    } catch (error) {
        // `applyCatalogMenu` throws only while reading — the category tree, or the
        // storefront's existing pages — before any write.
        return failedStep(
            `Category pages were not written: ${messageOf(error)}. Republish the storefront to try again.`,
        );
    }
    const { record, ...facts } = report;
    writeCatalogMenuRecord(project, record);
    return outcomeOf(describeBuild(facts), facts, facts.written.length);
}

async function build(project: Project, site: CatalogMenuSite): Promise<StepOutcome | undefined> {
    let hasBlock: boolean;
    try {
        hasBlock = await site.hasBlock();
    } catch (error) {
        return failedStep(
            `Couldn't check the storefront for the catalog menu block (${messageOf(error)}), so its category pages were not changed.`,
        );
    }
    if (hasBlock) {
        try {
            return await applyWithBlock(project, site);
        } catch (error) {
            return failedStep(`Category pages were not written: ${messageOf(error)}.`);
        }
    }
    const removed = await removal(project, site.pages);
    return removed === undefined
        ? undefined
        : {
              ...removed,
              summary: `The storefront no longer has the catalog menu block, so Demo Builder took its menu out. ${removed.summary}`,
          };
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
    return (await build(project, site))?.summary;
}

/** What replacing the category pages after a store change did (EDS-44). */
export interface CatalogMenuReplacement {
    /** Category pages written and published for the store now live. */
    written: number;
    /** Web paths of pages Demo Builder wrote for the old store that the SC edited; kept. */
    kept: string[];
    /** Both steps' sentences, for the log; undefined when there was nothing to say. */
    summary?: string;
    /** The sentence of a step that could not finish, for the SC. */
    problem?: string;
}

/**
 * After a store change: take the old store's category pages out, then write the new
 * store's — reset's two steps in reset's order. A page the SC edited stays (the record's
 * hash guard) and comes back in `kept`. Never throws.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param site - the storefront, reading the categories of the store now live
 * @returns the counts and sentences the store-change summary needs
 */
export async function replaceCatalogMenuStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<CatalogMenuReplacement> {
    const removed = await removal(project, site.pages);
    const built = await build(project, site);
    const outcomes = [removed, built].filter((o): o is StepOutcome => o !== undefined);
    const join = (sentences: string[]): string | undefined => sentences.join(' ') || undefined;
    return {
        written: outcomes.reduce((sum, o) => sum + o.written, 0),
        kept: [...new Set(outcomes.flatMap((o) => o.edited))],
        summary: join(outcomes.map((o) => o.summary)),
        problem: join(outcomes.filter((o) => !o.ok).map((o) => o.summary)),
    };
}

/** A category, as the SC knows it, and the address its page goes at. */
export interface NewCategory {
    name: string;
    path: string;
}

/** What a look for unpaged categories found. `signIn`: the DA.live sign-in was refused. */
type NewCategoryPagesCheck =
    | { status: 'nothing' }
    | { status: 'missing'; categories: NewCategory[] }
    | { status: 'failed'; error: string; signIn: boolean };

interface NewCategoryPagesAdded {
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
