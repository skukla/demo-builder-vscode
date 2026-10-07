/**
 * Which content paths a DA.live copy should carry, read off paths and HTML alone.
 *
 * Pure path and markup analysis: which enumerated paths to drop (product
 * overlays), which documents a copied page points at (fragments, internal links),
 * and which of those references the copy never managed to bring across. Nothing
 * here fetches or writes; the copy pipeline in `daLiveContentCopy.ts` calls it.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut).
 * `daLiveContentCopy.ts` re-exports the two path functions, so their importers did
 * not change.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveContentReferences
 */

import {
    addBrokenLink,
    addReferenceResult,
    isDeferredReference,
    type PatchReport,
} from '../patches/patchReportHelper';
import type { Logger } from '@/types/logger';

/**
 * Filter out product overlay documents from content paths.
 *
 * Product overlays (e.g., /products/sku-123) are template documents used by
 * EDS routing but should not be copied during content migration. Only the
 * default product page template (/products/default) should be copied.
 *
 * @param paths - Array of content paths from the index
 * @returns Filtered paths with product overlays removed
 */
export function filterProductOverlays(paths: string[]): string[] {
    return paths.filter((path) => {
        // Check if this is a product path
        if (path.includes('/products/')) {
            // Keep /products/default and anything under it
            // e.g., /products/default, /products/default/something
            return path.endsWith('/products/default') || path.includes('/products/default/');
        }
        // Keep all non-product paths unchanged
        return true;
    });
}

/**
 * Extract internal document references from a page's authored HTML.
 *
 * EDS pages can embed other authored documents (fragments) and link to other
 * pages. Some of those targets — notably the account left-nav fragment
 * `/customer/nav` — are NOT in the content index and NOT in any hardcoded
 * backfill list, so the copy pipeline never pulls them and the feature renders
 * empty (see `.rptc/research/content-copy-completeness`). Following these
 * references lets the pipeline copy them from canonical, no fork.
 *
 * Returns extension-free, site-relative paths (matching the enumerated path
 * shape, so callers can dedup against already-copied paths). Excludes external
 * hosts, anchors/mailto/relative links, media/asset/icon URLs, and
 * `/products/*` catalog overlays (handled elsewhere).
 *
 * @param html - The source page HTML (e.g. from `.plain.html`)
 * @param sourceBaseUrl - The source CDN base (e.g. `https://main--site--org.aem.live`)
 */
export function extractReferencedPaths(html: string, sourceBaseUrl: string): string[] {
    const refs = new Set<string>();

    // Normalize one candidate reference and add it if it's a copyable internal path.
    const consider = (raw: string): void => {
        let href = raw.trim();
        if (!href) return;

        // Normalize an absolute same-site URL to a site-relative path; skip any
        // other absolute/protocol-relative URL (external host).
        if (href.startsWith(sourceBaseUrl)) {
            href = href.slice(sourceBaseUrl.length) || '/';
        } else if (/^[a-z]+:/i.test(href) || href.startsWith('//')) {
            return;
        }

        // Internal site-relative paths only (drops #anchors, ./relatives, mailto:).
        if (!href.startsWith('/')) return;

        href = href.split('#')[0].split('?')[0];
        if (!href || href === '/') return;

        // Skip media, static assets, icons, and catalog product overlays.
        if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|json|pdf|mp4|woff2?|ttf)$/i.test(href)) return;
        if (href.includes('/media_') || href.startsWith('/icons/') || href.startsWith('/styles/'))
            return;
        if (href.startsWith('/products/')) return;

        // Match the enumerated path shape (extension-free).
        href = href.replace(/\.html$/i, '');
        if (href && href !== '/') refs.add(href);
    };

    let match: RegExpExecArray | null;

    // 1. Anchor hrefs — links, and link-style fragment references.
    const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
    while ((match = hrefPattern.exec(html)) !== null) consider(match[1]);

    // 2. EDS fragment-block convention: a `<div class="fragment">` whose cell text
    //    IS the path (no <a>), e.g. the account page's
    //    `<div class="fragment"><div><div>/customer/nav</div></div></div>`. Scope the
    //    match to fragment blocks (not any bare-path leaf) so it stays precise to the
    //    convention and doesn't over-discover stray paths elsewhere in content.
    const fragmentPattern =
        /class=["'][^"']*\bfragment\b[^"']*["'][\s\S]*?>\s*(\/[a-z0-9][^<>\s"']*)\s*</gi;
    while ((match = fragmentPattern.exec(html)) !== null) consider(match[1]);

    return [...refs];
}

/**
 * Completeness audit: every internal document referenced by copied content
 * but not itself copied.
 *
 * Two kinds, said differently (2026-10-07):
 * - The source has no such page either (it answered 404): a broken link in
 *   the source, carried over. Nothing was left out, so it is not a warning:
 *   it goes to `patchReport.brokenLinks`, which the caller records on the
 *   project for the Storefront Report.
 * - Anything else (the source has it and the copy failed, or discovery
 *   stopped before reaching it): a real gap, surfaced via the proceed-and-warn
 *   report. The demo still proceeds; this never fails the copy.
 *
 * References a later stage is configured to supply are not gaps — see
 * `deferredReferencePrefixes`. Skipping them keeps this channel worth reading.
 */
export function auditUncopiedReferences(
    logger: Logger,
    discoveredPaths: Set<string>,
    copiedFiles: string[],
    patchReport?: PatchReport,
): void {
    const copiedSet = new Set(copiedFiles);
    for (const ref of discoveredPaths) {
        if (copiedSet.has(ref) || isDeferredReference(patchReport, ref)) continue;
        if (patchReport?.missingOnSource?.has(ref)) {
            logger.info(`[DA.live] Broken link carried over from the source: ${ref} (no such page there)`);
            addBrokenLink(patchReport, ref);
            continue;
        }
        logger.warn(`[DA.live] Completeness audit — referenced document not copied: ${ref}`);
        if (patchReport) {
            addReferenceResult(patchReport, ref, 'referenced by copied content but could not be copied');
        }
    }
}
