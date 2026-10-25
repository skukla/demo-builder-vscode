/**
 * Publishing the overlay's category pages, in the one order that keeps authored pages
 * (EDS-61, owner decision 2026-10-22).
 *
 * Each category's page lives at its own address (`/signs`), and Helix asks the overlay
 * first on every preview (measured 2026-10-22). So:
 *
 * 1. the sheet listing every authored page at a category address
 *    (`authoredCategoryPages.ts`) is published FIRST — and when it cannot be, nothing else
 *    is published, because the overlay would replace those pages;
 * 2. then every other category address is published through the overlay (on the backend
 *    product pages are published for at setup), and each authored one is published again,
 *    now that the overlay steps aside for it, so DA.live's page is what goes out;
 * 3. then the pages Demo Builder published for categories the store no longer has come
 *    off Helix — never an address DA.live holds a document for.
 *
 * Never throws on a publish: failures come back as rows. Every dependency is handed in.
 *
 * @module features/eds/services/catalogMenu/categoryPagePublish
 */

import { findAuthoredPaths } from './authoredCategoryPages';
import { messageOf, type StorefrontPages } from './ownedPages';
import { runInBatches } from '@/core/utils/promiseUtils';
import type { CategoryPageRemovalResult } from '@/features/eds/services/storefront/productPageRemoval';

/** The overlay's category pages on Helix. */
export interface CategoryPageHost {
    /** False on a backend product pages are not published for at setup: first visits publish. */
    publishAtSetup: boolean;
    /** Write and publish the authored-pages sheet listing these paths. Throws on failure. */
    publishAuthoredSheet(paths: string[]): Promise<void>;
    /** Unpublish and delete the sheet: the overlay leaves every category address alone again. Throws on failure. */
    removeAuthoredSheet(): Promise<void>;
    /** Preview and publish one page. Throws on failure. */
    publish(path: string): Promise<void>;
    /** Take these overlay pages off Helix. Never throws. */
    remove(paths: string[]): Promise<CategoryPageRemovalResult>;
}

export interface PageFailure {
    path: string;
    error: string;
}

export interface CategoryPublishOutcome {
    /** `published`, or why the sheet could not be — and then nothing else was. */
    sheet: 'published' | { error: string };
    /** Category addresses DA.live holds a document for: the sheet's rows. */
    authored: string[];
    /** Category pages published through the overlay. */
    published: string[];
    /** Pages that could not be published (overlay ones, or authored ones re-published). */
    failed: PageFailure[];
    /** What happened to the pages of categories the store no longer has. */
    pruned?: CategoryPageRemovalResult;
    /** The overlay pages Demo Builder now has published, for the next run's clean-up. */
    categoryPaths: string[];
}

/** How many pages are published at once: Helix admin allows ~10 requests a second. */
const PUBLISH_BATCH = 5;

/** The removal outcomes after which the paths are gone. */
const GONE: Array<CategoryPageRemovalResult['status']> = ['removed', 'live-only', 'nothing'];

async function publishAll(host: CategoryPageHost, paths: string[]): Promise<{ done: string[]; failed: PageFailure[] }> {
    const results = await runInBatches(paths, PUBLISH_BATCH, async (path): Promise<{ path: string; error?: string }> => {
        try {
            await host.publish(path);
            return { path };
        } catch (error) {
            return { path, error: messageOf(error) };
        }
    });
    return {
        done: results.filter((r) => r.error === undefined).map((r) => r.path),
        failed: results.filter((r): r is PageFailure => r.error !== undefined),
    };
}

/**
 * Take recorded overlay pages down, leaving any address DA.live now holds a document for.
 * When DA.live cannot be read, nothing is removed.
 *
 * @returns the removal, and the paths still published afterwards
 */
export async function unpublishCategoryPages(
    host: CategoryPageHost,
    pages: Pick<StorefrontPages, 'read'>,
    paths: string[],
): Promise<{ result?: CategoryPageRemovalResult; remaining: string[] }> {
    if (paths.length === 0) return { remaining: [] };
    let authored: Set<string>;
    try {
        authored = await findAuthoredPaths(pages, paths);
    } catch {
        return { remaining: paths };
    }
    const toRemove = paths.filter((path) => !authored.has(path));
    if (toRemove.length === 0) return { remaining: [] };
    const result = await host.remove(toRemove);
    return { result, remaining: GONE.includes(result.status) ? [] : toRemove };
}

/**
 * The sheet, then the category pages, then the clean-up of categories that are gone.
 *
 * @param host - the overlay's category pages
 * @param pages - the storefront's pages, to tell authored addresses among the gone ones
 * @param planned - every category's page address, from the store's categories now
 * @param authored - the planned addresses DA.live holds a document for
 * @param previous - the overlay pages Demo Builder had published before this run
 */
export async function publishCategoryPages(
    host: CategoryPageHost,
    pages: Pick<StorefrontPages, 'read'>,
    planned: string[],
    authored: ReadonlySet<string>,
    previous: string[],
): Promise<CategoryPublishOutcome> {
    const authoredList = planned.filter((path) => authored.has(path));
    try {
        await host.publishAuthoredSheet(authoredList);
    } catch (error) {
        const sheet = { error: messageOf(error) };
        return { sheet, authored: authoredList, published: [], failed: [], categoryPaths: previous };
    }

    const overlay = planned.filter((path) => !authored.has(path));
    const toPublish = [...(host.publishAtSetup ? overlay : []), ...authoredList];
    const { done, failed } = await publishAll(host, toPublish);

    const gone = previous.filter((path) => !planned.includes(path));
    const { result: pruned, remaining } = await unpublishCategoryPages(host, pages, gone);
    const categoryPaths = [
        ...overlay.filter((path) => done.includes(path) || previous.includes(path)),
        ...remaining,
    ];
    return {
        sheet: 'published',
        authored: authoredList,
        published: overlay.filter((path) => done.includes(path)),
        failed,
        ...(pruned ? { pruned } : {}),
        categoryPaths,
    };
}
