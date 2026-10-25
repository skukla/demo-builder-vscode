/**
 * Removing a storefront's overlay-made pages from Helix: product pages (EDS-26) and
 * category pages (EDS-61).
 *
 * Product pages (`/products/{urlKey}/{sku}`) and category pages (each category's own url
 * path, `/signs`) are published through the BYOM overlay, by setup and by a shopper's first visit. They
 * never exist in DA.live, so reset and delete — which unpublish the pages DA.live lists —
 * left every one of them live (CLAUDE.md property 1: a thing that cannot be undone is a
 * finding). This is the undo.
 *
 * ## The rules (owner, 2026-10-05)
 *
 * - **True deletion.** The live copy goes, then the preview copy
 *   (`HelixService.unpublishPages`, page by page with the DA.live Bearer —
 *   `eds-publish-and-config` rule 4). An overlay page has no source document, so those
 *   two copies are all there is.
 * - **Live-only is said, never hidden.** If Helix refuses the preview removal (the
 *   overlay still answers for the path), the result is `live-only` and the sentence says
 *   the preview copies remain. Never a clean zero.
 * - **The list comes from Helix** (`listPublishedPaths`), not from what setup published:
 *   a page published by a shopper's first visit is recorded nowhere else. A listing that
 *   fails removes nothing and says the pages may still be live.
 * - **Only overlay pages, only on the SC's own site.** A path is handed to the remover
 *   only when it has the overlay's shape AND DA.live has no document for it. The
 *   templates — `/products/default`, `/categories/default` — are DA.live content and are
 *   never touched here.
 * - **Refuse, don't guess, on a shared repository.** The Helix site is keyed by the
 *   GitHub owner/repo; when another local project publishes to the same one, removal
 *   would take its pages down too, so nothing is removed and the sentence names the
 *   project. Not being able to tell is a refusal too.
 *
 * Category pages have no folder of their own to list, so their removal is handed the
 * exact paths: the ones the catalog menu step published for categories the store no
 * longer has, with every authored page already left out (`catalogMenuService`).
 *
 * Never throws: reset, republish and delete carry on, and report the sentence.
 *
 * Every dependency is handed in (ADR-015).
 *
 * @module features/eds/services/storefront/productPageRemoval
 */

import { formatHelixError } from '@/features/eds/services/errorFormatters';
import type { Logger } from '@/types/logger';

/** The Helix site, by the key Helix uses. */
export interface ProductPageSite {
    repoOwner: string;
    repoName: string;
}

/** The two Helix calls the removal makes. `HelixService` satisfies it. */
export interface ProductPageHelix {
    listPublishedPaths(org: string, site: string, branch: string, pattern: string): Promise<string[]>;
    unpublishPages(
        org: string,
        site: string,
        branch: string,
        webPaths: string[],
    ): Promise<{ total: number; liveFailed: number; previewFailed: number }>;
}

/** What both removals need besides the authored-page listing. */
interface OverlayPageRemovalDeps {
    helix: ProductPageHelix;
    /** Display names of OTHER local projects publishing to the same repository. */
    otherProjectsOnRepo(): Promise<string[]>;
    logger: Logger;
}

export interface ProductPageRemovalDeps extends OverlayPageRemovalDeps {
    /** Web paths of the DA.live documents under `/products`. Throws when it cannot list. */
    listAuthoredProductPages(): Promise<string[]>;
}

export type CategoryPageRemovalDeps = OverlayPageRemovalDeps;

export interface ProductPageRemovalResult {
    /**
     * `removed`: live and preview copies gone. `live-only`: live gone, some preview
     * copies refused. `incomplete`: some live copies remain. `nothing`: Helix lists
     * none. `refused`: another project shares the repository. `failed`: could not tell
     * or could not run — pages may still be live.
     */
    status: 'removed' | 'live-only' | 'incomplete' | 'nothing' | 'refused' | 'failed';
    found: number;
    liveRemoved: number;
    previewRemoved: number;
    /** One plain sentence (or two) for the progress line, the log and the agent. */
    summary: string;
}

/** The same result, for category pages. */
export type CategoryPageRemovalResult = ProductPageRemovalResult;

/** One kind of overlay page: its template, and its words. */
interface OverlayPageKind {
    template: string;
    /** "product", "category": the word before "page". */
    noun: string;
    /** The Debug Logs tag. */
    tag: string;
}

const BRANCH = 'main';

const PRODUCT_PATTERN = '/products/*';
/** `/products/{urlKey}/{sku}` — the only product shape the overlay publishes. */
const PRODUCT_SHAPE = /^\/products\/[^/]+\/[^/]+$/;

const PRODUCT_PAGES: OverlayPageKind = {
    template: '/products/default',
    noun: 'product',
    tag: '[Product Pages]',
};

const CATEGORY_PAGES: OverlayPageKind = {
    template: '/categories/default',
    noun: 'category',
    tag: '[Category Pages]',
};

/** The error's own words, for the Debug Logs. */
const rawOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The formatter codes whose wording fits here; its other entries are about site configuration. */
const TRANSPORT_FAILURES = new Set(['NETWORK_ERROR', 'SERVICE_UNAVAILABLE']);

/**
 * Why something failed, in words for the SC. A connection failure is said in the Helix
 * formatter's words (`errorFormatters.ts`), never the library's. Every other error that
 * reaches this module was thrown by the extension with a sentence of its own
 * (`helixPublishedPaths`, `helixPageDeletion`, the DA.live client), and passes as written.
 */
function messageOf(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const formatted = formatHelixError(error);
    if (TRANSPORT_FAILURES.has(formatted.code)) return formatted.userMessage.replace(/\.$/, '');
    return rawOf(error);
}

const pagesOf = (kind: OverlayPageKind) => (n: number): string =>
    `${n} ${kind.noun} ${n === 1 ? 'page' : 'pages'}`;

const capitalised = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function refusal(kind: OverlayPageKind, site: string, others: string[]): string {
    const quoted = others.map((name) => `"${name}"`);
    const who =
        quoted.length === 1
            ? `the project ${quoted[0]} also publishes`
            : `the projects ${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]} also publish`;
    const whose = quoted.length === 1 ? 'its' : 'their';
    return (
        `${capitalised(kind.noun)} pages were left published: ${who} to ${site}, ` +
        `and removing them would take ${whose} ${kind.noun} pages down too.`
    );
}

function notRemoved(site: string, what: string, error: unknown): string {
    return `Couldn't ${what} on ${site} (${messageOf(error)}), so none were removed. They may still be live.`;
}

const none = (status: ProductPageRemovalResult['status'], summary: string): ProductPageRemovalResult => ({
    status,
    found: 0,
    liveRemoved: 0,
    previewRemoved: 0,
    summary,
});

function describe(
    kind: OverlayPageKind,
    site: string,
    found: number,
    failed: { liveFailed: number; previewFailed: number },
): ProductPageRemovalResult {
    const pages = pagesOf(kind);
    const { liveFailed, previewFailed } = failed;
    const liveRemoved = found - liveFailed;
    const previewRemoved = found - previewFailed;
    const counts = { found, liveRemoved, previewRemoved };
    if (liveFailed === 0 && previewFailed === 0) {
        return { status: 'removed', ...counts, summary: `Removed ${pages(found)} from ${site}, live and preview.` };
    }
    const live =
        liveFailed === 0
            ? `Removed ${pages(found)} from the live site of ${site}.`
            : `Removed ${liveRemoved} of ${pages(found)} from the live site of ${site}; ` +
              `${liveFailed} could not be removed and may still be live.`;
    const preview =
        previewFailed === 0
            ? ''
            : ` Helix refused to remove the preview copy of ${previewFailed} of them, ` +
              'so those preview copies remain.';
    return { status: liveFailed === 0 ? 'live-only' : 'incomplete', ...counts, summary: `${live}${preview}` };
}


/**
 * Whether a published path is a product page the overlay made: the
 * `/products/{urlKey}/{sku}` shape, not the template, and no DA.live document behind it.
 * The storefront teardown uses it too, to leave these pages to {@link removeProductPages}
 * and its shared-repository refusal (EDS-33).
 *
 * @param path - a web path Helix lists
 * @param authoredLower - the DA.live documents' web paths, lowercased
 */
export function isGeneratedProductPage(path: string, authoredLower: ReadonlySet<string>): boolean {
    return PRODUCT_SHAPE.test(path) && path !== PRODUCT_PAGES.template && !authoredLower.has(path.toLowerCase());
}

/** The generated product pages Helix lists, minus anything DA.live holds a document for. */
async function productPagesOn(site: ProductPageSite, deps: ProductPageRemovalDeps): Promise<string[]> {
    const authored = new Set((await deps.listAuthoredProductPages()).map((path) => path.toLowerCase()));
    const published = await deps.helix.listPublishedPaths(site.repoOwner, site.repoName, BRANCH, PRODUCT_PATTERN);
    return published.filter((path) => isGeneratedProductPage(path, authored));
}

/**
 * The shared removal: refusal on a shared repository, the paths, the unpublish, the words.
 * `findPaths` says which paths go; it may throw, and then nothing is removed.
 */
async function removeOverlayPages(
    kind: OverlayPageKind,
    site: ProductPageSite,
    deps: OverlayPageRemovalDeps,
    findPaths: () => Promise<string[]>,
): Promise<ProductPageRemovalResult> {
    const name = `${site.repoOwner}/${site.repoName}`;
    const pages = pagesOf(kind);
    let others: string[];
    try {
        others = await deps.otherProjectsOnRepo();
    } catch (error) {
        deps.logger.warn(`${kind.tag} Shared-repository check failed for ${name}: ${rawOf(error)}`);
        return none('failed', notRemoved(name, `check whether another project publishes ${kind.noun} pages`, error));
    }
    if (others.length > 0) return none('refused', refusal(kind, name, others));

    let paths: string[];
    try {
        paths = (await findPaths()).filter((path) => path !== kind.template);
    } catch (error) {
        deps.logger.warn(`${kind.tag} Listing failed for ${name}: ${rawOf(error)}`);
        return none('failed', notRemoved(name, `list the ${kind.noun} pages published`, error));
    }
    if (paths.length === 0) return none('nothing', `Helix lists no ${kind.noun} pages published on ${name}.`);

    try {
        const removed = await deps.helix.unpublishPages(site.repoOwner, site.repoName, BRANCH, paths);
        const result = describe(kind, name, paths.length, removed);
        deps.logger.info(`${kind.tag} ${result.summary}`);
        return result;
    } catch (error) {
        deps.logger.warn(`${kind.tag} Removal failed for ${name}: ${rawOf(error)}`);
        return {
            ...none('failed', `Removing ${pages(paths.length)} from ${name} failed (${messageOf(error)}). They may still be live.`),
            found: paths.length,
        };
    }
}

/**
 * Remove every generated product page the site has published: live, then preview.
 *
 * @param site - the Helix site, by GitHub owner and repository
 * @param deps - Helix, the authored-page listing, the shared-repository check, a logger
 * @returns what happened, in counts and in a sentence. Never throws.
 */
export async function removeProductPages(
    site: ProductPageSite,
    deps: ProductPageRemovalDeps,
): Promise<ProductPageRemovalResult> {
    return removeOverlayPages(PRODUCT_PAGES, site, deps, () => productPagesOn(site, deps));
}

/**
 * Remove these category pages the overlay made: live, then preview. The caller has left
 * out every page DA.live holds a document for; the template is never removed.
 *
 * @param site - the Helix site, by GitHub owner and repository
 * @param deps - Helix, the shared-repository check, a logger
 * @param paths - the web paths to take down
 * @returns what happened, in counts and in a sentence. Never throws.
 */
export async function removeCategoryPages(
    site: ProductPageSite,
    deps: CategoryPageRemovalDeps,
    paths: string[],
): Promise<CategoryPageRemovalResult> {
    return removeOverlayPages(CATEGORY_PAGES, site, deps, async () => paths);
}
