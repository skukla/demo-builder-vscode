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
 * ## Where the record lives
 *
 * The caller's choice. This service takes the previous record and returns the next
 * one; persisting it is the surface's job (see `.rptc/plans/category-pages/overview.md`).
 *
 * @module features/eds/services/catalogMenu/catalogMenuService
 */

import { createHash } from 'crypto';
import { planCategoryPages, type CatalogCategory } from './categoryPages';
import {
    addCatalogMenuSwitch,
    removeCatalogMenuSwitch,
    type AddSwitchStatus,
    type RemoveSwitchStatus,
} from './navSwitch';

/** The storefront's pages, by web path (`/nav`, `/safety-signs`). */
export interface StorefrontPages {
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
    /** True once the nav switch has been added by this service. */
    navSwitch: boolean;
}

export interface PageSkip {
    path: string;
    reason: 'edited' | 'not-ours';
}

export interface PageFailure {
    path: string;
    error: string;
}

export interface ApplyReport {
    written: string[];
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
export const NO_MENU_CATEGORIES =
    'Catalog Service returned no categories marked "Include in Menu" for this store view';

const EMPTY_RECORD: CatalogMenuRecord = { pages: [], navSwitch: false };

function hashOf(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type PageOutcome =
    | { kind: 'written'; hash: string }
    | { kind: 'skipped'; reason: PageSkip['reason'] }
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

async function switchNavOn(
    pages: StorefrontPages,
): Promise<{ nav: ApplyReport['nav']; navError?: string }> {
    try {
        const nav = await pages.read(NAV_PATH);
        if (nav === null) return { nav: 'missing' };
        const result = addCatalogMenuSwitch(nav);
        if (result.status === 'added') await pages.write(NAV_PATH, result.html);
        return { nav: result.status };
    } catch (error) {
        return { nav: 'failed', navError: messageOf(error) };
    }
}

/**
 * Write the category pages and switch the catalog menu on.
 *
 * Reads the tree first and stops before writing anything if it cannot, or if it is
 * empty — a menu switched on over nothing would only hide the SC's own items.
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
    const recorded = new Map(previous.pages.map((p) => [p.path, p.hash]));
    const report: ApplyReport = {
        written: [],
        skipped: [],
        failed: [],
        unsafe: plan.unsafe,
        nav: 'missing',
        record: { pages: [], navSwitch: previous.navSwitch },
    };

    for (const page of plan.pages) {
        const outcome = await writeOwnedPage(deps.pages, page.path, page.html, recorded.get(page.path));
        recorded.delete(page.path);
        if (outcome.kind === 'written') {
            report.written.push(page.path);
            report.record.pages.push({ path: page.path, hash: outcome.hash });
        } else if (outcome.kind === 'skipped') {
            report.skipped.push({ path: page.path, reason: outcome.reason });
        } else {
            report.failed.push({ path: page.path, error: outcome.error });
            const earlier = previous.pages.find((p) => p.path === page.path);
            if (earlier) report.record.pages.push(earlier);
        }
    }
    // Pages written on an earlier run whose category has since left the tree are
    // still ours: keep claiming them so the undo can remove them.
    recorded.forEach((hash, path) => report.record.pages.push({ path, hash }));

    Object.assign(report, await switchNavOn(deps.pages));
    if (report.nav === 'added' || report.nav === 'already-present') report.record.navSwitch = true;
    return report;
}

async function removeOwnedPage(
    pages: StorefrontPages,
    path: string,
    hash: string,
): Promise<'removed' | 'gone' | PageSkip['reason'] | { error: string }> {
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

async function switchNavOff(
    pages: StorefrontPages,
    record: CatalogMenuRecord,
): Promise<{ nav: RemoveReport['nav']; navError?: string }> {
    if (!record.navSwitch) return { nav: 'not-recorded' };
    try {
        const nav = await pages.read(NAV_PATH);
        if (nav === null) return { nav: 'missing' };
        const result = removeCatalogMenuSwitch(nav);
        if (result.status === 'removed') await pages.write(NAV_PATH, result.html);
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
        record: { pages: [], navSwitch: false },
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
    report.record.navSwitch = report.nav === 'failed';
    return report;
}
