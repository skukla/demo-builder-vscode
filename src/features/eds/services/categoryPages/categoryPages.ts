/**
 * Category pages: one storefront page per Commerce category, and the undo.
 *
 * EDS-24, steps 1–2. On an Adobe Commerce Optimizer boilerplate storefront a
 * category page is an ordinary DA.live page at the category's path holding the
 * `product-list-page` block with one `urlPath` row — the boilerplate's own
 * `/apparel` page is the whole recipe. A category without a page is a 404, which
 * is how a store with a full tree in Commerce ends up with a storefront that
 * cannot reach any of it.
 *
 * ## The authorship record (ADR-013, in spirit)
 *
 * The SC edits these pages by hand. So every page written is recorded with the
 * hash of what was written ({@link pageHash}), and:
 *
 * - a re-run rewrites a page only when its current source still hashes to the
 *   record (or it is gone); a changed page is skipped and reported;
 * - a page that exists with NO record is not ours — skipped, never overwritten;
 * - the removal deletes only pages whose source still matches, and forgets a
 *   page only once it is actually gone.
 *
 * The record is handed to `persist` after every page, so a run that dies half
 * way still knows what it wrote and can be undone.
 *
 * `vscode`-free; the page store arrives as a parameter (ADR-015).
 *
 * @module features/eds/services/categoryPages/categoryPages
 */

import { createHash } from 'crypto';
import {
    readPage,
    removePage,
    toWebPath,
    writePage,
    type PageRemoveResult,
    type PageServices,
    type PageWriteResult,
} from '../daLive/storefrontPages';
import type { CommerceCategory } from './categoryTree';
import type { GeneratedCategoryPages } from '@/types/base';

/** Commerce's "Include in Menu" switch, as Catalog Service reports it. */
const IN_MENU = 'show_in_menu';
/** Commerce's "Enable Category" switch. */
const ACTIVE = 'active';

/**
 * The characters a path segment may hold and still be served by aem.live: the
 * CDN 404s percent-encoded paths, so anything outside this alphabet becomes a
 * page that exists in DA.live and can never be visited (ADR-007).
 */
const SERVABLE_SEGMENT = /^[a-z0-9_-]+$/;

/** One page to write. */
export interface PlannedCategoryPage {
    categoryId: string;
    name: string;
    urlPath: string;
    /** `/` + urlPath. */
    path: string;
    html: string;
}

/** A category that gets no page, and why, in words. */
export interface SkippedCategory {
    id: string;
    name: string;
    reason: string;
}

export interface CategoryPagePlan {
    pages: PlannedCategoryPage[];
    skipped: SkippedCategory[];
}

/** Where pages are read, written (and published) and removed — one storefront. */
export interface CategoryPageStore {
    read(path: string): Promise<{ status: number; body: string }>;
    write(path: string, html: string): Promise<PageWriteResult>;
    remove(path: string): Promise<PageRemoveResult>;
}

/**
 * The page store over one storefront's DA.live + Helix services: the same write
 * (publish included) and removal (unpublish first) the `write_page` and
 * `delete_page` tools go through.
 */
export function pageStoreFor(services: PageServices): CategoryPageStore {
    return {
        read: (path) => readPage(services, path),
        write: (path, html) => writePage(services, path, html, true),
        remove: (path) => removePage(services, path),
    };
}

/** Save the record; called after every change to it. */
export type PersistRecord = (record: GeneratedCategoryPages) => Promise<void>;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/**
 * The page: the category name as the heading, then the product-list-page block
 * with its one `urlPath` row. The block reads the row with `readBlockConfig`,
 * which lower-cases the key, and filters Live Search on `categoryPath`.
 */
export function categoryPageHtml(name: string, urlPath: string): string {
    return (
        `<body><header></header><main><div><h1>${escapeHtml(name)}</h1>` +
        '<div class="product-list-page"><div><div>urlPath</div>' +
        `<div>${escapeHtml(urlPath)}</div></div></div>` +
        '</div></main><footer></footer></body>'
    );
}

/**
 * The hash a page is recognised by. Whitespace between and around tags is
 * dropped first, so a source that comes back re-indented still reads as the
 * page that was written; any change to the words or the markup does not.
 */
export function pageHash(html: string): string {
    const normalised = html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(normalised).digest('hex');
}

/** Why this category gets no page, or undefined when it gets one. */
function skipReason(category: CommerceCategory): string | undefined {
    if (!category.roles.includes(ACTIVE)) return 'disabled';
    if (!category.roles.includes(IN_MENU)) return 'not in the menu';
    if (!category.urlPath) return 'no URL path in Commerce';
    const servable = category.urlPath.split('/').every((segment) => SERVABLE_SEGMENT.test(segment));
    if (!servable || !toWebPath(category.urlPath)) {
        return `URL path "${category.urlPath}" has characters the live site cannot serve`;
    }
    return undefined;
}

/**
 * Decide which categories get a page. The root is the store's container, not a
 * category anyone shops, so it gets none and is not reported.
 */
export function planCategoryPages(categories: CommerceCategory[], rootId: string): CategoryPagePlan {
    const plan: CategoryPagePlan = { pages: [], skipped: [] };
    for (const category of categories) {
        if (category.id === rootId) continue;
        const reason = skipReason(category);
        if (reason) {
            plan.skipped.push({ id: category.id, name: category.name, reason });
            continue;
        }
        plan.pages.push({
            categoryId: category.id,
            name: category.name,
            urlPath: category.urlPath,
            path: `/${category.urlPath}`,
            html: categoryPageHtml(category.name, category.urlPath),
        });
    }
    return plan;
}

/** What one generate run did. */
export interface GenerateCategoryPagesResult {
    /** Written (and, unless listed in `unpublished`, published). */
    written: string[];
    /** Changed since Demo Builder wrote them; left alone. */
    handEdited: string[];
    /** A page already there that Demo Builder did not write; left alone. */
    notOurs: string[];
    /** Written, but the publish failed: in DA.live, not yet on the live site. */
    unpublished: Array<{ path: string; error: string }>;
    failed: Array<{ path: string; error: string }>;
    /** Pages written by an earlier run whose category no longer gets one. */
    noLongerInTree: string[];
    record: GeneratedCategoryPages;
}

/** May this page be written? The answer, or the list it belongs on instead. */
async function writeVerdict(
    store: CategoryPageStore,
    path: string,
    recorded: { hash: string } | undefined,
): Promise<'write' | 'handEdited' | 'notOurs' | { error: string }> {
    const current = await store.read(path);
    if (current.status === 404) return 'write';
    if (current.status < 200 || current.status >= 300) {
        return { error: `Could not read the current page (HTTP ${current.status})` };
    }
    if (!recorded) return 'notOurs';
    return pageHash(current.body) === recorded.hash ? 'write' : 'handEdited';
}

function copyRecord(record: GeneratedCategoryPages | undefined): GeneratedCategoryPages {
    return { pages: { ...(record?.pages ?? {}) }, updatedAt: record?.updatedAt ?? new Date().toISOString() };
}

/**
 * Write every planned page, through the authorship guard.
 *
 * @param store   - the storefront's pages
 * @param plan    - from {@link planCategoryPages}
 * @param record  - what earlier runs wrote (undefined on the first run)
 * @param persist - saves the record after each page written
 */
export async function generateCategoryPages(
    store: CategoryPageStore,
    plan: CategoryPagePlan,
    record: GeneratedCategoryPages | undefined,
    persist?: PersistRecord,
): Promise<GenerateCategoryPagesResult> {
    const next = copyRecord(record);
    const result: GenerateCategoryPagesResult = {
        written: [],
        handEdited: [],
        notOurs: [],
        unpublished: [],
        failed: [],
        noLongerInTree: [],
        record: next,
    };
    for (const page of plan.pages) {
        const verdict = await writeVerdict(store, page.path, next.pages[page.path]);
        if (verdict === 'handEdited' || verdict === 'notOurs') {
            result[verdict].push(page.path);
            continue;
        }
        if (verdict !== 'write') {
            result.failed.push({ path: page.path, ...verdict });
            continue;
        }
        const write = await store.write(page.path, page.html);
        if (!write.written) {
            result.failed.push({ path: page.path, error: write.error ?? 'The write failed' });
            continue;
        }
        result.written.push(page.path);
        if (write.publishError) result.unpublished.push({ path: page.path, error: write.publishError });
        next.pages[page.path] = { categoryId: page.categoryId, hash: pageHash(page.html) };
        next.updatedAt = new Date().toISOString();
        await persist?.(next);
    }
    const planned = new Set(plan.pages.map((p) => p.path));
    result.noLongerInTree = Object.keys(next.pages).filter((path) => !planned.has(path));
    return result;
}

/** What one removal did. */
export interface RemoveCategoryPagesResult {
    removed: string[];
    /** Changed since Demo Builder wrote them; left in place and still recorded. */
    handEdited: string[];
    /** Already deleted by someone else; forgotten. */
    alreadyGone: string[];
    /** Still recorded, so a retry picks them up. */
    failed: Array<{ path: string; error: string }>;
    record: GeneratedCategoryPages;
}

/**
 * Remove exactly the pages the record says were written, through the same guard.
 *
 * @param store   - the storefront's pages
 * @param record  - what was written
 * @param persist - saves the record after each page forgotten
 */
export async function removeCategoryPages(
    store: CategoryPageStore,
    record: GeneratedCategoryPages | undefined,
    persist?: PersistRecord,
): Promise<RemoveCategoryPagesResult> {
    const next = copyRecord(record);
    const result: RemoveCategoryPagesResult = { removed: [], handEdited: [], alreadyGone: [], failed: [], record: next };
    const forget = async (path: string): Promise<void> => {
        delete next.pages[path];
        next.updatedAt = new Date().toISOString();
        await persist?.(next);
    };
    for (const [path, recorded] of Object.entries(record?.pages ?? {})) {
        const current = await store.read(path);
        if (current.status === 404) {
            result.alreadyGone.push(path);
            await forget(path);
            continue;
        }
        if (current.status < 200 || current.status >= 300) {
            result.failed.push({ path, error: `Could not read the current page (HTTP ${current.status})` });
            continue;
        }
        if (pageHash(current.body) !== recorded.hash) {
            result.handEdited.push(path);
            continue;
        }
        const removal = await store.remove(path);
        if (!removal.deleted) {
            result.failed.push({ path, error: removal.error ?? 'The removal failed' });
            continue;
        }
        result.removed.push(path);
        await forget(path);
    }
    return result;
}
