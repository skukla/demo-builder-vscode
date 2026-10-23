/**
 * The catalog menu as a storefront step (EDS-24; category pages through the overlay,
 * EDS-61).
 *
 * There is no button. Storefront setup (project creation), reset and republish each run
 * {@link applyCatalogMenuStep}; reset first runs {@link removeCatalogMenuStep}, so what it
 * made comes out before the content is re-copied and goes back in after. After a store
 * change (EDS-44), {@link replaceCatalogMenuStep} runs those two in that order for the
 * store-change service (`storefront/storeScopePages.ts`). These are the only callers —
 * `tests/templates/spine-chokepoints.test.ts` pins them.
 *
 * - The step acts only when the storefront's OWN repository has `blocks/catalog-menu/`
 *   (the Demo Builder Blocks library) and the product page overlay is on (owner decision
 *   D5). Then it publishes the authored-pages sheet (`authoredCategoryPages.ts`), which is
 *   also what opts the site in: the overlay renders category pages only where that sheet
 *   exists. Without the block or the overlay it takes out what it made earlier — sheet
 *   included, so the site is back to the overlay leaving every category address alone.
 * - Each category's page is its own url path (`/signs`), published through the overlay and
 *   filled from `/categories/default`. A category added in Commerce later gets its page at
 *   the next republish, or on a shopper's first visit when the smart-404 script has it.
 * - A category that already has a hand-built page, at any address, keeps it: the menu
 *   links to theirs, and the summary says so ("Signs uses your page at /safety-signage.").
 * - The record of what was written lives on the project
 *   (`componentInstances['eds-storefront'].metadata.catalogMenu`). The step changes the
 *   project in place; the caller's own save keeps it.
 * - Never throws. A storefront without its category pages is still a working storefront,
 *   and none of the flows should fail over it. Every outcome comes back as one plain
 *   sentence for the flow's progress line and log; `undefined` means there was nothing to
 *   say (no block and nothing of ours on the site).
 *
 * @module features/eds/services/catalogMenu/catalogMenuStep
 */

import { authoredAddresses } from './authoredCategoryPages';
import { isEmptyRecord, readCatalogMenuRecord, writeCatalogMenuRecord } from './catalogMenuRecord';
import { applyCatalogMenu, removeCatalogMenu, type CategoryPageHost } from './catalogMenuService';
import { describeBuild, describeRemoval } from './catalogMenuSummary';
import { planCategoryPages, type CatalogCategory } from './categoryPagePlan';
import { messageOf, type StorefrontPages } from './ownedPages';
import type { Project } from '@/types/base';

/** One storefront, as the step needs it. Built by `createCatalogMenuSite`. */
export interface CatalogMenuSite {
    pages: StorefrontPages;
    /** Whether the storefront's repository has the block. Throws when it cannot tell. */
    hasBlock(): Promise<boolean>;
    /** Every category of the project's store view. */
    readCategories(): Promise<CatalogCategory[]>;
    /** Whether the product page overlay is registered for this storefront. */
    overlay: boolean;
    /** The overlay's category pages on Helix. */
    categoryPages: CategoryPageHost;
}

/** Owner decision D5: one sentence for a storefront whose overlay is off. */
const OVERLAY_OFF =
    'Category pages come from the product page overlay, which is off for this storefront, ' +
    'so no category pages were published and the catalog menu was not added.';

/** What one run of a step did: its sentence, and the counts a store change reports. */
interface StepOutcome {
    summary: string;
    /** False when a page or the nav could not be changed, or the step could not run. */
    ok: boolean;
    /** Category pages published. */
    written: number;
    /** Pages Demo Builder wrote that the SC has edited since, so were left alone. */
    edited: string[];
}

const failedStep = (summary: string): StepOutcome => ({ summary, ok: false, written: 0, edited: [] });

/**
 * What a step did, for its callers: the sentence, and whether it did everything. A
 * reset shows a step that did not as a warning, and one that did as a note (2026-10-23:
 * "13 category pages couldn't be published" reached only the Debug Logs).
 */
export type CatalogMenuStepResult = Pick<StepOutcome, 'summary' | 'ok'>;

const resultOf = (outcome: StepOutcome | undefined): CatalogMenuStepResult | undefined =>
    outcome && { summary: outcome.summary, ok: outcome.ok };

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

/**
 * Take out what Demo Builder made, when the record says it made anything — the sheet
 * included. `unpublish`: take the overlay category pages it published down too — when no
 * build follows (no block, no overlay). Before a build (reset, a store change) they stay on
 * the record, and the build keeps the ones the store still has and takes the rest down.
 */
async function removal(project: Project, site: CatalogMenuSite, unpublish: boolean): Promise<StepOutcome | undefined> {
    const record = readCatalogMenuRecord(project);
    if (isEmptyRecord(record)) return undefined;
    try {
        const { record: next, ...facts } = await removeCatalogMenu(
            { pages: site.pages, categoryPages: site.categoryPages, unpublish },
            record,
        );
        writeCatalogMenuRecord(project, next);
        return outcomeOf(describeRemoval(facts), facts, 0);
    } catch (error) {
        return failedStep(`The category pages Demo Builder made could not be removed: ${messageOf(error)}.`);
    }
}

/**
 * Take out the template, the old model's pages and the switch Demo Builder made — and
 * nothing else. The overlay category pages it published stay on the record: the build
 * that follows keeps those the store still has and takes the rest down.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param site - the storefront
 * @returns what happened, or undefined when there was nothing of ours to remove
 */
export async function removeCatalogMenuStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<CatalogMenuStepResult | undefined> {
    return resultOf(await removal(project, site, false));
}

async function applyWithBlock(project: Project, site: CatalogMenuSite): Promise<StepOutcome> {
    let report;
    try {
        report = await applyCatalogMenu(site, readCatalogMenuRecord(project));
    } catch (error) {
        // `applyCatalogMenu` throws only while reading — the categories, or the
        // storefront's existing pages — before any change.
        return failedStep(
            `Category pages were not published: ${messageOf(error)}. Republish the storefront to try again.`,
        );
    }
    const { record, ...facts } = report;
    writeCatalogMenuRecord(project, record);
    const outcome = outcomeOf(describeBuild(facts), facts, facts.published.length);
    return facts.legacyFailed.length ? { ...outcome, ok: false } : outcome;
}

/** No block, or no overlay: take out what we made, with the sentence that says why. */
async function takeOut(project: Project, site: CatalogMenuSite, why: string | undefined): Promise<StepOutcome | undefined> {
    const removed = await removal(project, site, true);
    if (why === undefined) {
        return removed && {
            ...removed,
            summary: `The storefront no longer has the catalog menu block, so Demo Builder took its menu out. ${removed.summary}`,
        };
    }
    return removed ? { ...removed, summary: `${why} ${removed.summary}` } : { summary: why, ok: true, written: 0, edited: [] };
}

async function build(project: Project, site: CatalogMenuSite): Promise<StepOutcome | undefined> {
    if (!site.overlay) return takeOut(project, site, OVERLAY_OFF);
    let hasBlock: boolean;
    try {
        hasBlock = await site.hasBlock();
    } catch (error) {
        return failedStep(
            `Couldn't check the storefront for the catalog menu block (${messageOf(error)}), so its category pages were not changed.`,
        );
    }
    if (!hasBlock) return takeOut(project, site, undefined);
    try {
        return await applyWithBlock(project, site);
    } catch (error) {
        return failedStep(`Category pages were not published: ${messageOf(error)}.`);
    }
}

/**
 * Publish a page per category through the overlay, write the template when there is none,
 * and switch the catalog menu on in `/nav` — when the storefront has the block and the
 * overlay. Re-running re-publishes every page (so a template edit reaches them), takes
 * down pages of categories that are gone, and leaves every authored page alone.
 *
 * @param project - the project, whose record is read and then replaced in place
 * @param site - the storefront
 * @returns what happened, or undefined when there was nothing to do
 */
export async function applyCatalogMenuStep(
    project: Project,
    site: CatalogMenuSite,
): Promise<CatalogMenuStepResult | undefined> {
    return resultOf(await build(project, site));
}

/** What replacing the category pages after a store change did (EDS-44). */
export interface CatalogMenuReplacement {
    /** Category pages published for the store now live. */
    written: number;
    /** Web paths of pages Demo Builder wrote that the SC edited; kept. */
    kept: string[];
    /** Both steps' sentences, for the log; undefined when there was nothing to say. */
    summary?: string;
    /** The sentence of a step that could not finish, for the SC. */
    problem?: string;
}

/**
 * After a store change: take the old store's category pages down, then publish the new
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
    const removed = await removal(project, site, false);
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

/**
 * Before republish's bulk publish: publish the authored-pages sheet, so no authored page at
 * a category address is replaced by the overlay while every DA.live page is previewed
 * (owner, 2026-10-22). Only where the step will publish category pages (block and overlay
 * on). The same computation as the step's (`authoredAddresses`); the step writes the sheet
 * again after the content, then the category pages. Publishes no page. Never throws: a
 * category or block read that fails is the step's to report, and says nothing here.
 *
 * @param project - the project, whose record notes the sheet
 * @param site - the storefront
 * @param options.onlyWhenPublished - only refresh a sheet the record says is live: writing
 *   one opts the site in, which is the category step's to do (storefront setup, EDS-61)
 * @returns a sentence when the sheet could not be published, else undefined
 */
export async function publishAuthoredListStep(
    project: Project,
    site: CatalogMenuSite,
    options: { onlyWhenPublished?: boolean } = {},
): Promise<string | undefined> {
    if (options.onlyWhenPublished && !readCatalogMenuRecord(project).authoredSheet) return undefined;
    let planned: string[];
    try {
        if (!site.overlay || !(await site.hasBlock())) return undefined;
        planned = planCategoryPages(await site.readCategories()).pages.map((p) => p.path);
    } catch {
        return undefined;
    }
    try {
        const record = readCatalogMenuRecord(project);
        const authored = await authoredAddresses(site.pages, planned, record.legacyPages);
        await site.categoryPages.publishAuthoredSheet(planned.filter((path) => authored.has(path)));
        writeCatalogMenuRecord(project, { ...record, authoredSheet: true });
        return undefined;
    } catch (error) {
        return (
            `Couldn't publish the list of pages you wrote at category addresses before publishing the content ` +
            `(${messageOf(error)}); the catalog menu step tries again after it.`
        );
    }
}
