/**
 * Catalog menu service — category pages through the product page overlay, the sheet that
 * keeps authored pages, their template, and the nav switch; and the undo (EDS-24, EDS-61).
 *
 * Every dependency is handed in (ADR-015): the category reader, the storefront's pages
 * (DA.live read / write-and-publish / unpublish-and-delete) and the overlay's category
 * pages (`categoryPagePublish.ts`).
 *
 * ## Category pages are the overlay's, at each category's own address
 *
 * `/signs`, `/signs/danger-signs` (`categoryPagePlan.ts`; owner decision 2026-10-22),
 * rendered by the shared `render-pdp` action from the site's `/categories/default`
 * (`categoryTemplate.ts`). Helix asks the overlay FIRST on every preview, so an authored
 * page at a category's address survives only because the overlay steps aside for the
 * paths `/authored-category-pages.json` lists. One run, in this order:
 *
 * 1. read — the categories, the nav, the storefront's pages, and which category addresses
 *    DA.live holds a document for — and stop before any change if a read fails;
 * 2. remove the pages the old model wrote (one DA.live page per category, EDS-24) that
 *    nobody edited, so they are not mistaken for authored ones; an edited one stays, and
 *    is authored now;
 * 3. write the starter template where there is none;
 * 4. publish the sheet, then the category pages, then take down the pages of categories
 *    that are gone (`publishCategoryPages`);
 * 5. switch the menu on in `/nav`.
 *
 * ## An SC's hand edits are never overwritten
 *
 * ADR-013's rule, applied to DA.live pages (`ownedPages.ts`): the template is written only
 * where there is none, and anything is removed only while it holds what was recorded.
 *
 * ## A hand-built page for a category is always honored
 *
 * Owner's rule, 2026-10-05. A page at the category's own address is its page (and goes on
 * the sheet). A page elsewhere whose `product-list-page` block names the category gets a
 * "category → page" row in the nav's `catalog-menu` table, so the menu links to it; a row
 * the SC typed counts the same way (`existingCategoryPages.ts`).
 *
 * The record lives on the project (`catalogMenuRecord.ts`); this service takes the
 * previous record and returns the next one.
 *
 * @module features/eds/services/catalogMenu/catalogMenuService
 */

import { authoredAddresses } from './authoredCategoryPages';
import { planCategoryPages, categoryPagePath, normaliseUrlPath, type CatalogCategory } from './categoryPagePlan';
import {
    publishCategoryPages,
    unpublishCategoryPages,
    type CategoryPageHost,
    type CategoryPublishOutcome,
    type PageFailure,
} from './categoryPagePublish';
import { ensureCategoryTemplate, removeCategoryTemplate, type TemplateOutcome } from './categoryTemplate';
import { findOwnCategoryPages } from './existingCategoryPages';
import {
    addCatalogMenuSwitch,
    readCategoryLinks,
    removeCatalogMenuSwitch,
    type AddSwitchStatus,
    type MenuLine,
    type CategoryLink,
    type RemoveSwitchStatus,
} from './navSwitch';
import { hashOf, messageOf, removeOwnedPage, type StorefrontPages } from './ownedPages';
import type { CategoryPageRemovalResult } from '@/features/eds/services/storefront/productPageRemoval';

export type { CategoryPageHost, PageFailure } from './categoryPagePublish';

export interface CatalogMenuDeps {
    pages: StorefrontPages;
    /** Every category of the project's store view. */
    readCategories(): Promise<CatalogCategory[]>;
    /** Which line the storefront's copy of the block reads, so the nav is written in it. */
    menuLine(): Promise<MenuLine>;
    categoryPages: CategoryPageHost;
}

/** What this service made — the proof of authorship the undo needs. */
export interface CatalogMenuRecord {
    /** Pages the old model wrote, one per category, still to be removed (stored as `pages`). */
    legacyPages: Array<{ path: string; hash: string }>;
    /** The category → page rows this service wrote in the nav's `catalog-menu` table. */
    links: CategoryLink[];
    /** True once the nav switch has been added by this service. */
    navSwitch: boolean;
    /** The starter `/categories/default`'s hash, while it is as Demo Builder wrote it. */
    templateHash?: string;
    /** The overlay category pages this service published, for taking down later. */
    categoryPaths?: string[];
    /** True once this service published the authored-pages sheet, which opts the site in. */
    authoredSheet?: boolean;
}

export interface PageSkip {
    path: string;
    reason: 'edited' | 'has-own-page';
    /** The category the page is for. */
    name?: string;
    /** `has-own-page`: the page the category already has, which the menu links to. */
    ownPage?: string;
}

export interface ApplyReport extends Omit<CategoryPublishOutcome, 'categoryPaths'> {
    /** True when setup publishes no overlay page on this backend: a shopper's first visit does. */
    deferred: boolean;
    /** Pages the old model wrote, removed now. */
    legacyRemoved: string[];
    legacyFailed: PageFailure[];
    skipped: PageSkip[];
    unsafe: Array<{ name: string; urlPath: string }>;
    template: TemplateOutcome;
    nav: AddSwitchStatus | 'missing' | 'failed';
    navError?: string;
    record: CatalogMenuRecord;
}

export interface RemoveReport {
    /** Pages the old model wrote, removed. */
    removed: string[];
    alreadyGone: string[];
    skipped: PageSkip[];
    failed: PageFailure[];
    template: Awaited<ReturnType<typeof removeCategoryTemplate>>;
    /** The overlay's category pages, when the caller asked for them to go too. */
    categoryPages?: CategoryPageRemovalResult;
    /** The authored-pages sheet: taken out, not this service's, or why it stayed. */
    sheet: 'removed' | 'not-recorded' | { error: string };
    nav: RemoveSwitchStatus | 'not-recorded' | 'missing' | 'failed';
    navError?: string;
    /** What is still claimed afterwards. */
    record: CatalogMenuRecord;
}

const NAV_PATH = '/nav';

/** Why nothing is changed: a menu switched on over an empty tree would only hide the SC's items. */
const NO_MENU_CATEGORIES =
    'Catalog Service returned no categories marked "Include in Menu" for this store view';

/** The nav outcomes that leave the switch in the nav. */
const IN_NAV: Array<ApplyReport['nav']> = ['added', 'line-updated', 'links-updated', 'already-present'];

const EMPTY_RECORD: CatalogMenuRecord = { legacyPages: [], links: [], navSwitch: false };

/** The nav as it stands before the run: its source, or why it could not be read. */
type NavRead = { html: string | null } | { error: string };

async function readNav(pages: StorefrontPages): Promise<NavRead> {
    try {
        return { html: await pages.read(NAV_PATH) };
    } catch (error) {
        return { error: messageOf(error) };
    }
}

/**
 * The page each category already has: a row the SC typed in the nav table first, then a
 * hand-built page found elsewhere on the site.
 */
async function ownPages(
    pages: StorefrontPages,
    categories: CatalogCategory[],
    previous: CatalogMenuRecord,
    nav: NavRead,
): Promise<{ typed: Map<string, string>; found: Map<string, string> }> {
    const navHtml = 'html' in nav ? nav.html : null;
    const ourRows = previous.links.map((l) => `${normaliseUrlPath(l.urlPath)} ${l.path}`);
    const typed = new Map(
        readCategoryLinks(navHtml ?? '')
            .filter((l) => !ourRows.includes(`${normaliseUrlPath(l.urlPath)} ${l.path}`))
            .map((l) => [normaliseUrlPath(l.urlPath), l.path]),
    );
    // A page the old model wrote, still as written, is ours — not a hand-built page.
    const hashes = new Map(previous.legacyPages.map((p) => [p.path, p.hash]));
    const found = await findOwnCategoryPages(pages, categories, (path, html) => hashes.get(path) === hashOf(html));
    return { typed, found };
}

async function switchNavOn(
    pages: StorefrontPages,
    nav: NavRead,
    links: CategoryLink[],
    previous: CatalogMenuRecord,
    menuLine: MenuLine,
): Promise<Pick<ApplyReport, 'nav' | 'navError'> & { links: CategoryLink[] }> {
    if ('error' in nav) return { nav: 'failed', navError: nav.error, links: previous.links };
    if (nav.html === null) return { nav: 'missing', links: [] };
    try {
        const result = addCatalogMenuSwitch(nav.html, links, previous.links, menuLine);
        if (result.html !== nav.html) await pages.write(NAV_PATH, result.html);
        return { nav: result.status, links: result.links };
    } catch (error) {
        return { nav: 'failed', navError: messageOf(error), links: previous.links };
    }
}

/** Remove the old model's pages while unedited; keep claiming the ones that failed. */
async function removeLegacyPages(
    pages: StorefrontPages,
    legacy: CatalogMenuRecord['legacyPages'],
): Promise<Pick<RemoveReport, 'removed' | 'alreadyGone' | 'skipped' | 'failed'> & { kept: CatalogMenuRecord['legacyPages'] }> {
    const outcome = { removed: [] as string[], alreadyGone: [] as string[], skipped: [] as PageSkip[], failed: [] as PageFailure[] };
    const kept: CatalogMenuRecord['legacyPages'] = [];
    for (const { path, hash } of legacy) {
        const result = await removeOwnedPage(pages, path, hash);
        if (result === 'removed') outcome.removed.push(path);
        else if (result === 'gone') outcome.alreadyGone.push(path);
        else if (result === 'edited') outcome.skipped.push({ path, reason: 'edited' });
        else {
            outcome.failed.push({ path, error: result.error });
            kept.push({ path, hash });
        }
    }
    return { ...outcome, kept };
}

/** Which categories already have a page somewhere else, as skips the summary names. */
function ownPageSkips(categories: CatalogCategory[], ownPageOf: (urlPath: string) => string | undefined): PageSkip[] {
    const skips: PageSkip[] = [];
    const seen = new Set<string>();
    for (const { name, urlPath } of categories) {
        const ownPage = urlPath ? ownPageOf(urlPath) : undefined;
        const path = categoryPagePath(urlPath) ?? `/${urlPath}`;
        if (ownPage === undefined || seen.has(path)) continue;
        seen.add(path);
        skips.push({ path, reason: 'has-own-page', name, ownPage });
    }
    return skips;
}

/**
 * Publish the authored-pages sheet and a page per category through the overlay, make sure
 * the template exists, take down pages of categories that are gone, and switch the catalog
 * menu on. Stops before changing anything if a read fails, or no category is in the menu.
 */
export async function applyCatalogMenu(
    deps: CatalogMenuDeps,
    previous: CatalogMenuRecord = EMPTY_RECORD,
): Promise<ApplyReport> {
    const categories = await deps.readCategories();
    if (!categories.some((c) => c.urlPath && c.inMenu !== false)) {
        throw new Error(NO_MENU_CATEGORIES);
    }
    const plan = planCategoryPages(categories);
    const planned = plan.pages.map((p) => p.path);
    const nav = await readNav(deps.pages);
    const menuLine = await deps.menuLine();
    const { typed, found } = await ownPages(deps.pages, categories, previous, nav);
    // Read before any change; an old page of ours, as written, is never authored.
    const authored = await authoredAddresses(deps.pages, planned, previous.legacyPages);
    const ownPageOf = (urlPath: string): string | undefined =>
        typed.get(normaliseUrlPath(urlPath)) ?? found.get(urlPath);
    // The menu links these categories to the SC's page at another address, so a page at
    // their own address would be one nobody reaches (Bodea's /products/racks beside /racks).
    const elsewhere = new Set(
        plan.pages.filter((p) => ![undefined, p.path].includes(ownPageOf(p.urlPath))).map((p) => p.path),
    );

    // The old model's unedited pages first, so the overlay serves their addresses next.
    const legacy = await removeLegacyPages(deps.pages, previous.legacyPages);
    const template = await ensureCategoryTemplate(deps.pages, previous.templateHash);
    const { categoryPaths, ...published } = await publishCategoryPages(
        deps.categoryPages,
        deps.pages,
        planned,
        authored,
        previous.categoryPaths ?? [],
        elsewhere,
    );

    // Our rows: the pages we found. A row the SC typed is theirs, and stays as typed.
    const links = [...found]
        .filter(([urlPath]) => !typed.has(normaliseUrlPath(urlPath)))
        .map(([urlPath, path]) => ({ urlPath, path }));
    const switched = await switchNavOn(deps.pages, nav, links, previous, menuLine);
    return {
        ...published,
        deferred: !deps.categoryPages.publishAtSetup,
        legacyRemoved: legacy.removed,
        legacyFailed: legacy.failed,
        skipped: [...ownPageSkips(categories, ownPageOf), ...legacy.skipped],
        unsafe: plan.unsafe.filter((u) => ownPageOf(u.urlPath) === undefined),
        template,
        nav: switched.nav,
        navError: switched.navError,
        record: {
            legacyPages: legacy.kept,
            links: switched.links,
            navSwitch: IN_NAV.includes(switched.nav) || previous.navSwitch,
            ...('hash' in template ? { templateHash: template.hash } : {}),
            ...(categoryPaths.length ? { categoryPaths } : {}),
            ...(published.sheet === 'published' || previous.authoredSheet ? { authoredSheet: true } : {}),
        },
    };
}

/** Take the sheet out, when the record says this service published it. */
async function removeSheet(
    host: CategoryPageHost | undefined,
    record: CatalogMenuRecord,
): Promise<RemoveReport['sheet']> {
    if (!record.authoredSheet || !host) return 'not-recorded';
    try {
        await host.removeAuthoredSheet();
        return 'removed';
    } catch (error) {
        return { error: messageOf(error) };
    }
}

async function switchNavOff(
    pages: StorefrontPages,
    record: CatalogMenuRecord,
): Promise<{ nav: RemoveReport['nav']; navError?: string }> {
    if (!record.navSwitch) return { nav: 'not-recorded' };
    try {
        const nav = await pages.read(NAV_PATH);
        if (nav === null) return { nav: 'missing' };
        const result = removeCatalogMenuSwitch(nav, record.links);
        if (result.html !== nav) await pages.write(NAV_PATH, result.html);
        return { nav: result.status };
    } catch (error) {
        return { nav: 'failed', navError: messageOf(error) };
    }
}

/**
 * The undo: remove what this service wrote in DA.live (and the SC has not since edited)
 * and take the switch back out of the nav. With `unpublish`, the overlay category pages
 * it published come off Helix too (never an authored address); otherwise they stay on the
 * record for the next build to keep or take down. The
 * authored-pages sheet goes LAST, after the pages, with the host: without it the overlay
 * renders no category page and leaves every authored one alone, which is the site before
 * Demo Builder opted it in. A build that follows writes it again first.
 */
export async function removeCatalogMenu(
    deps: { pages: StorefrontPages; categoryPages?: CategoryPageHost; unpublish?: boolean },
    record: CatalogMenuRecord,
): Promise<RemoveReport> {
    const legacy = await removeLegacyPages(deps.pages, record.legacyPages);
    const template = await removeCategoryTemplate(deps.pages, record.templateHash);
    const recorded = record.categoryPaths ?? [];
    const unpublished = deps.categoryPages && deps.unpublish
        ? await unpublishCategoryPages(deps.categoryPages, deps.pages, recorded)
        : { remaining: recorded };
    const sheet = await removeSheet(deps.categoryPages, record);
    const nav = await switchNavOff(deps.pages, record);
    // A nav that could not be changed still holds the switch and our rows.
    const navFailed = nav.nav === 'failed';
    const templateFailed = typeof template !== 'string';
    return {
        removed: legacy.removed,
        alreadyGone: legacy.alreadyGone,
        skipped: legacy.skipped,
        failed: [
            ...legacy.failed,
            ...(templateFailed ? [{ path: '/categories/default', error: template.error }] : []),
        ],
        template,
        ...(unpublished.result ? { categoryPages: unpublished.result } : {}),
        sheet,
        ...nav,
        record: {
            legacyPages: legacy.kept,
            links: navFailed ? record.links : [],
            navSwitch: navFailed,
            ...(templateFailed && record.templateHash ? { templateHash: record.templateHash } : {}),
            ...(unpublished.remaining.length ? { categoryPaths: unpublished.remaining } : {}),
            ...(typeof sheet === 'object' || (record.authoredSheet && !deps.categoryPages) ? { authoredSheet: true } : {}),
        },
    };
}
