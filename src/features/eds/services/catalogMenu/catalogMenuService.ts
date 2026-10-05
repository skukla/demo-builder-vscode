/**
 * Catalog menu service — writes one page per Commerce category plus the nav switch,
 * and undoes both (EDS-24).
 *
 * Every dependency is handed in (ADR-015): the category reader, and the storefront's
 * pages — read, write-and-publish, unpublish-and-delete, the same DA.live and Helix
 * operations the `read_page` / `write_page` / `delete_page` tools perform.
 *
 * ## An SC's hand edits are never overwritten
 *
 * ADR-013's rule, applied to DA.live pages: a page is rewritten or removed only when
 * its current content matches the hash recorded when this service wrote it. A page
 * that exists without a record is someone else's (`not-ours`); one whose content moved
 * is the SC's now (`edited`) and drops out of the record, so the undo will not touch
 * it either. The hash is taken from a read AFTER the write, so the record describes
 * what DA.live actually stores rather than what was sent.
 *
 * The nav is never replaced: the switch is merged into whatever the SC authored
 * (`navSwitch.ts`), and removing it takes out exactly the switch.
 *
 * ## A hand-built page for a category is always honored
 *
 * Owner's rule, 2026-10-05. A category page may live at ANY address — its
 * `product-list-page` block names the category, not its path — so before writing, the
 * storefront's pages are read (`existingCategoryPages.ts`). A category that already has
 * a page gets none from us (`has-own-page`), and the nav's `catalog-menu` table gains a
 * "category → page" row so the menu links to it. A row the SC typed there themselves
 * counts the same way. If we wrote a page for that category earlier, it is removed —
 * but only when nobody has edited it.
 *
 * ## Where the record lives
 *
 * On the project, `componentInstances['eds-storefront'].metadata.catalogMenu`
 * (`catalogMenuRecord.ts`). This service takes the previous record and returns the next
 * one; `catalogMenuStep.ts` reads and keeps it for storefront setup, reset and republish.
 *
 * @module features/eds/services/catalogMenu/catalogMenuService
 */

import { createHash } from 'crypto';
import { normaliseUrlPath, planCategoryPages, type CatalogCategory, type PlannedPage } from './categoryPages';
import { findOwnCategoryPages } from './existingCategoryPages';
import {
    addCatalogMenuSwitch,
    readCategoryLinks,
    removeCatalogMenuSwitch,
    type AddSwitchStatus,
    type CategoryLink,
    type RemoveSwitchStatus,
} from './navSwitch';

/** The storefront's pages, by web path (`/nav`, `/safety-signs`). */
export interface StorefrontPages {
    /**
     * Every page that could be a category page, by web path: no product pages,
     * fragments, drafts, nav or footer documents, and nothing that is not a page.
     */
    listPages(): Promise<string[]>;
    /** The page's DA.live source, or null when there is none. */
    read(path: string): Promise<string | null>;
    /** Write the source and preview+publish it. Throws on failure. */
    write(path: string, html: string): Promise<void>;
    /** Unpublish the page and delete its source. Throws on failure. */
    remove(path: string): Promise<void>;
}

export interface CatalogMenuDeps {
    pages: StorefrontPages;
    /** Categories with "Include in Menu" on, for the project's store view. */
    readCategories(): Promise<CatalogCategory[]>;
}

/** What this service wrote — the proof of authorship the undo needs. */
export interface CatalogMenuRecord {
    pages: Array<{ path: string; hash: string }>;
    /** The category → page rows this service wrote in the nav's `catalog-menu` table. */
    links: CategoryLink[];
    /** True once the nav switch has been added by this service. */
    navSwitch: boolean;
}

export interface PageSkip {
    path: string;
    reason: 'edited' | 'not-ours' | 'has-own-page';
    /** The category the page is for, when the skip came from a build. */
    name?: string;
    /** `has-own-page`: the page the category already has, which the menu links to. */
    ownPage?: string;
}

export interface PageFailure {
    path: string;
    error: string;
}

export interface ApplyReport {
    written: string[];
    /** Pages we wrote earlier and removed because the category now has a hand-built one. */
    replaced: string[];
    skipped: PageSkip[];
    failed: PageFailure[];
    unsafe: Array<{ name: string; urlPath: string }>;
    nav: AddSwitchStatus | 'missing' | 'failed';
    navError?: string;
    record: CatalogMenuRecord;
}

export interface RemoveReport {
    removed: string[];
    alreadyGone: string[];
    skipped: PageSkip[];
    failed: PageFailure[];
    nav: RemoveSwitchStatus | 'not-recorded' | 'missing' | 'failed';
    navError?: string;
    /** What is still claimed afterwards: the pages that failed to go. */
    record: CatalogMenuRecord;
}

const NAV_PATH = '/nav';

/** Why nothing is written: a menu switched on over an empty tree would only hide the SC's items. */
const NO_MENU_CATEGORIES =
    'Catalog Service returned no categories marked "Include in Menu" for this store view';

/** The nav outcomes that leave the switch in the nav. */
const IN_NAV: Array<ApplyReport['nav']> = ['added', 'links-updated', 'already-present'];

const EMPTY_RECORD: CatalogMenuRecord = { pages: [], links: [], navSwitch: false };

function hashOf(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type PageOutcome =
    | { kind: 'written'; hash: string }
    | { kind: 'skipped'; reason: 'edited' | 'not-ours' }
    | { kind: 'failed'; error: string };

async function writeOwnedPage(
    pages: StorefrontPages,
    path: string,
    html: string,
    recordedHash: string | undefined,
): Promise<PageOutcome> {
    try {
        const current = await pages.read(path);
        if (current !== null) {
            if (recordedHash === undefined) return { kind: 'skipped', reason: 'not-ours' };
            if (hashOf(current) !== recordedHash) return { kind: 'skipped', reason: 'edited' };
        }
        await pages.write(path, html);
        const stored = await pages.read(path);
        return { kind: 'written', hash: hashOf(stored ?? html) };
    } catch (error) {
        return { kind: 'failed', error: messageOf(error) };
    }
}

async function removeOwnedPage(
    pages: StorefrontPages,
    path: string,
    hash: string,
): Promise<'removed' | 'gone' | 'edited' | { error: string }> {
    try {
        const current = await pages.read(path);
        if (current === null) return 'gone';
        if (hashOf(current) !== hash) return 'edited';
        await pages.remove(path);
        return 'removed';
    } catch (error) {
        return { error: messageOf(error) };
    }
}

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
 * hand-built page found on the site. Keyed by normalised url path.
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
    const hashes = new Map(previous.pages.map((p) => [p.path, p.hash]));
    const found = await findOwnCategoryPages(pages, categories, (path, html) => hashes.get(path) === hashOf(html));
    return { typed, found };
}

async function switchNavOn(
    pages: StorefrontPages,
    nav: NavRead,
    links: CategoryLink[],
    previous: CatalogMenuRecord,
): Promise<Pick<ApplyReport, 'nav' | 'navError'> & { links: CategoryLink[] }> {
    if ('error' in nav) return { nav: 'failed', navError: nav.error, links: previous.links };
    if (nav.html === null) return { nav: 'missing', links: [] };
    try {
        const result = addCatalogMenuSwitch(nav.html, links, previous.links);
        if (result.html !== nav.html) await pages.write(NAV_PATH, result.html);
        return { nav: result.status, links: result.links };
    } catch (error) {
        return { nav: 'failed', navError: messageOf(error), links: previous.links };
    }
}

/** A category that already has a page: write none, and take our earlier one away if unedited. */
async function yieldToOwnPage(
    pages: StorefrontPages,
    page: Pick<PlannedPage, 'path' | 'name'>,
    ownPage: string,
    recordedHash: string | undefined,
    report: ApplyReport,
): Promise<void> {
    report.skipped.push({ path: page.path, reason: 'has-own-page', name: page.name, ownPage });
    if (recordedHash === undefined) return;
    const outcome = await removeOwnedPage(pages, page.path, recordedHash);
    if (outcome === 'removed') report.replaced.push(page.path);
    else if (outcome === 'edited') report.skipped.push({ path: page.path, reason: 'edited', name: page.name });
    else if (typeof outcome !== 'string') {
        report.failed.push({ path: page.path, error: `the earlier page could not be removed: ${outcome.error}` });
        report.record.pages.push({ path: page.path, hash: recordedHash });
    }
}

async function writePlannedPage(
    pages: StorefrontPages,
    page: PlannedPage,
    recordedHash: string | undefined,
    report: ApplyReport,
): Promise<void> {
    const outcome = await writeOwnedPage(pages, page.path, page.html, recordedHash);
    if (outcome.kind === 'written') {
        report.written.push(page.path);
        report.record.pages.push({ path: page.path, hash: outcome.hash });
    } else if (outcome.kind === 'skipped') {
        report.skipped.push({ path: page.path, reason: outcome.reason, name: page.name });
    } else {
        report.failed.push({ path: page.path, error: outcome.error });
        if (recordedHash !== undefined) report.record.pages.push({ path: page.path, hash: recordedHash });
    }
}

/**
 * Write the category pages and switch the catalog menu on.
 *
 * Reads first — the tree, the nav, and the storefront's existing pages — and stops
 * before writing anything if the tree or the pages cannot be read, or the tree is empty:
 * a menu switched on over nothing would only hide the SC's own items, and pages written
 * blind could double a page somebody built by hand.
 */
export async function applyCatalogMenu(
    deps: CatalogMenuDeps,
    previous: CatalogMenuRecord = EMPTY_RECORD,
): Promise<ApplyReport> {
    const categories = await deps.readCategories();
    if (categories.length === 0) {
        throw new Error(NO_MENU_CATEGORIES);
    }
    const plan = planCategoryPages(categories);
    const nav = await readNav(deps.pages);
    const { typed, found } = await ownPages(deps.pages, categories, previous, nav);
    const ownPageOf = (urlPath: string): string | undefined =>
        typed.get(normaliseUrlPath(urlPath)) ?? found.get(urlPath);

    const recorded = new Map(previous.pages.map((p) => [p.path, p.hash]));
    const report: ApplyReport = {
        written: [],
        replaced: [],
        skipped: [],
        failed: [],
        unsafe: plan.unsafe.filter((u) => ownPageOf(u.urlPath) === undefined),
        nav: 'missing',
        record: { pages: [], links: [], navSwitch: previous.navSwitch },
    };

    for (const page of plan.pages) {
        const ownPage = ownPageOf(page.urlPath);
        const hash = recorded.get(page.path);
        recorded.delete(page.path);
        if (ownPage === undefined) await writePlannedPage(deps.pages, page, hash, report);
        else await yieldToOwnPage(deps.pages, page, ownPage, hash, report);
    }
    for (const { name, urlPath } of plan.unsafe) {
        const ownPage = ownPageOf(urlPath);
        if (ownPage !== undefined) {
            report.skipped.push({ path: `/${urlPath}`, reason: 'has-own-page', name, ownPage });
        }
    }
    // Pages written on an earlier run whose category has since left the tree are
    // still ours: keep claiming them so the undo can remove them.
    recorded.forEach((hash, path) => report.record.pages.push({ path, hash }));

    // Our rows: the pages we found. A row the SC typed is theirs, and stays as typed.
    const links = [...found]
        .filter(([urlPath]) => !typed.has(normaliseUrlPath(urlPath)))
        .map(([urlPath, path]) => ({ urlPath, path }));
    const switched = await switchNavOn(deps.pages, nav, links, previous);
    report.nav = switched.nav;
    report.navError = switched.navError;
    report.record.links = switched.links;
    if (IN_NAV.includes(report.nav)) report.record.navSwitch = true;
    return report;
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
 * The undo: remove the pages this service wrote (and the SC has not since edited) and
 * take the switch back out of the nav. Removes nothing it has no record of writing.
 */
export async function removeCatalogMenu(
    deps: Pick<CatalogMenuDeps, 'pages'>,
    record: CatalogMenuRecord,
): Promise<RemoveReport> {
    const report: RemoveReport = {
        removed: [],
        alreadyGone: [],
        skipped: [],
        failed: [],
        nav: 'not-recorded',
        record: { pages: [], links: [], navSwitch: false },
    };
    for (const { path, hash } of record.pages) {
        const outcome = await removeOwnedPage(deps.pages, path, hash);
        if (outcome === 'removed') report.removed.push(path);
        else if (outcome === 'gone') report.alreadyGone.push(path);
        else if (typeof outcome === 'string') report.skipped.push({ path, reason: outcome });
        else {
            report.failed.push({ path, error: outcome.error });
            report.record.pages.push({ path, hash });
        }
    }
    Object.assign(report, await switchNavOff(deps.pages, record));
    // A nav that could not be changed still holds the switch and our rows.
    report.record.navSwitch = report.nav === 'failed';
    if (report.nav === 'failed') report.record.links = record.links;
    return report;
}
