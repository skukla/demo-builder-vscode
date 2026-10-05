/**
 * Removing a storefront's generated product pages from Helix (EDS-26).
 *
 * Product pages (`/products/{urlKey}/{sku}`) are published through the BYOM overlay, by
 * pre-warming and by a shopper's first visit. They never exist in DA.live, so reset and
 * delete — which unpublish the pages DA.live lists — left every one of them live
 * (CLAUDE.md property 1: a thing that cannot be undone is a finding). This is the undo.
 *
 * ## The rules (owner, 2026-10-05)
 *
 * - **True deletion.** The live copy goes, then the preview copy
 *   (`HelixService.unpublishPages`, page by page with the DA.live Bearer —
 *   `eds-publish-and-config` rule 4). A product page has no source document, so those
 *   two copies are all there is.
 * - **Live-only is said, never hidden.** If Helix refuses the preview removal (the
 *   overlay still answers for every product path), the result is `live-only` and the
 *   sentence says the preview copies remain. Never a clean zero.
 * - **The list comes from Helix** (`listPublishedPaths`), not from pre-warm's list: a
 *   page published by a shopper's first visit is recorded nowhere else. A listing that
 *   fails removes nothing and says the pages may still be live.
 * - **Only generated product pages, only on the SC's own site.** A path is handed to
 *   the remover only when it is `/products/<one segment>/<one segment>` AND DA.live has
 *   no document for it. Authored pages under `/products` — the product template
 *   `/products/default` above all — are DA.live content and are never touched here.
 * - **Refuse, don't guess, on a shared repository.** The Helix site is keyed by the
 *   GitHub owner/repo; when another local project publishes to the same one, removal
 *   would take its product pages down too, so nothing is removed and the sentence names
 *   the project. Not being able to tell is a refusal too.
 *
 * Never throws: reset and delete carry on, and report the sentence.
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

export interface ProductPageRemovalDeps {
    helix: ProductPageHelix;
    /** Web paths of the DA.live documents under `/products`. Throws when it cannot list. */
    listAuthoredProductPages(): Promise<string[]>;
    /** Display names of OTHER local projects publishing to the same repository. */
    otherProjectsOnRepo(): Promise<string[]>;
    logger: Logger;
}

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

const BRANCH = 'main';
const PRODUCT_PAGES = '/products/*';
/** `/products/{urlKey}/{sku}` — the only shape the overlay publishes. */
const GENERATED_PRODUCT_PAGE = /^\/products\/[^/]+\/[^/]+$/;
/** The authored template every product page is rendered from. Never removed here. */
const PRODUCT_TEMPLATE = '/products/default';

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

const pages = (n: number): string => `${n} product ${n === 1 ? 'page' : 'pages'}`;

function refusal(site: string, others: string[]): string {
    const quoted = others.map((name) => `"${name}"`);
    const who =
        quoted.length === 1
            ? `the project ${quoted[0]} also publishes`
            : `the projects ${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]} also publish`;
    const whose = quoted.length === 1 ? 'its' : 'their';
    return (
        `Product pages were left published: ${who} to ${site}, ` +
        `and removing them would take ${whose} product pages down too.`
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

function describe(site: string, found: number, liveFailed: number, previewFailed: number): ProductPageRemovalResult {
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

/** The generated product pages Helix lists, minus anything DA.live holds a document for. */
async function generatedPagesOn(site: ProductPageSite, deps: ProductPageRemovalDeps): Promise<string[]> {
    const authored = new Set((await deps.listAuthoredProductPages()).map((path) => path.toLowerCase()));
    const published = await deps.helix.listPublishedPaths(site.repoOwner, site.repoName, BRANCH, PRODUCT_PAGES);
    return published.filter(
        (path) =>
            GENERATED_PRODUCT_PAGE.test(path) && path !== PRODUCT_TEMPLATE && !authored.has(path.toLowerCase()),
    );
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
    const name = `${site.repoOwner}/${site.repoName}`;
    let others: string[];
    try {
        others = await deps.otherProjectsOnRepo();
    } catch (error) {
        deps.logger.warn(`[Product Pages] Shared-repository check failed for ${name}: ${rawOf(error)}`);
        return none('failed', notRemoved(name, 'check whether another project publishes product pages', error));
    }
    if (others.length > 0) return none('refused', refusal(name, others));

    let paths: string[];
    try {
        paths = await generatedPagesOn(site, deps);
    } catch (error) {
        deps.logger.warn(`[Product Pages] Listing failed for ${name}: ${rawOf(error)}`);
        return none('failed', notRemoved(name, 'list the product pages published', error));
    }
    if (paths.length === 0) return none('nothing', `Helix lists no product pages published on ${name}.`);

    try {
        const removed = await deps.helix.unpublishPages(site.repoOwner, site.repoName, BRANCH, paths);
        const result = describe(name, paths.length, removed.liveFailed, removed.previewFailed);
        deps.logger.info(`[Product Pages] ${result.summary}`);
        return result;
    } catch (error) {
        deps.logger.warn(`[Product Pages] Removal failed for ${name}: ${rawOf(error)}`);
        return {
            ...none('failed', `Removing ${pages(paths.length)} from ${name} failed (${messageOf(error)}). They may still be live.`),
            found: paths.length,
        };
    }
}
