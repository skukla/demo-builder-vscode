/**
 * Which source paths a whole-site content copy covers, decided BEFORE anything copies.
 *
 * Enumerates the source (DA.live list API, falling back to the CDN content
 * index), drops what must not be copied (product overlays, the library index the
 * pipeline regenerates), and — on the index fallback only — backfills the
 * runtime surfaces the index omits. The copy loop in `daLiveContentCopy.ts`
 * consumes the result.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut).
 * Both were private methods; nothing outside the class called them.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveCopyPaths
 */

import { getRuntimeSurfaces, type RuntimeSurfaceSource } from '../runtimeSurfaceResolver';
import type { DaLiveContentSource } from '../types';
import type { DaLiveContentDiscovery } from './daLiveContentDiscovery';
import { filterProductOverlays } from './daLiveContentReferences';
import type { Logger } from '@/types/logger';

/** Paths to copy, and whether they came from the (complete) DA.live list API. */
interface EnumeratedContentPaths {
    contentPaths: string[];
    usedDaLiveList: boolean;
}

/**
 * Enumerate source content paths and apply the standard filters.
 *
 * Prefers the DA.live list API (complete), falling back to the CDN content
 * index. The list API returns 404 (mapped to empty array) for orgs the user
 * doesn't belong to, so also falls back when it succeeds but returns 0 paths.
 * Then removes product-overlay documents and the library-index spreadsheet.
 *
 * @param discoveryOps - the DA.live list API and CDN index readers
 * @param logger - logger
 * @param source - Source content configuration (org, site, indexUrl)
 * @returns The filtered content paths plus whether the list API was used
 */
export async function enumerateAndFilterContentPaths(
    discoveryOps: DaLiveContentDiscovery,
    logger: Logger,
    source: DaLiveContentSource,
): Promise<EnumeratedContentPaths> {
    let contentPaths: string[];
    let usedDaLiveList = false;

    try {
        contentPaths = await discoveryOps.getContentPathsFromDaLive(source.org, source.site);
        if (contentPaths.length > 0) {
            usedDaLiveList = true;
            logger.info(`[DA.live] Enumerated ${contentPaths.length} content files via list API`);
        } else {
            logger.info(`[DA.live] List API returned 0 files, falling back to content index`);
            contentPaths = await discoveryOps.getContentPathsFromIndex(source);
        }
    } catch {
        logger.info(`[DA.live] List API unavailable, falling back to content index`);
        contentPaths = await discoveryOps.getContentPathsFromIndex(source);
    }

    // Filter out product overlay documents (keep only /products/default)
    const originalCount = contentPaths.length;
    contentPaths = filterProductOverlays(contentPaths);
    const filteredCount = originalCount - contentPaths.length;
    if (filteredCount > 0) {
        logger.info(`[DA.live] Filtered ${filteredCount} product overlay paths`);
    }

    // Filter out ONLY the .da/library/blocks spreadsheet - we generate our own with correct paths
    // The template's spreadsheet has paths pointing to the template site, not the user's site
    // Note: The index may appear as /.da/library/blocks or /.da/library/blocks.json in full-index.json
    // BUT: Keep the individual block documentation pages (/.da/library/blocks/hero, etc.)
    // which contain example HTML and should be copied from the template
    const libraryIndexPaths = ['/.da/library/blocks', '/.da/library/blocks.json'];
    const preLibraryCount = contentPaths.length;
    contentPaths = contentPaths.filter((p) => !libraryIndexPaths.includes(p));
    if (contentPaths.length < preLibraryCount) {
        logger.info(`[DA.live] Excluded library index (will be generated with correct paths)`);
    }

    return { contentPaths, usedDaLiveList };
}

/**
 * Backfill essential content that the CDN content index omits (only needed
 * on the index-fallback path; the DA.live list API already returns it all):
 * config spreadsheets, the nav/footer fragments, and the customer auth pages.
 * Mutates `contentPaths` (prepends found paths) and `missingAuthPages`
 * (auth pages absent from source, which get destination stubs later).
 */
export async function backfillEssentialPaths(
    logger: Logger,
    source: { org: string; site: string },
    contentPaths: string[],
    missingAuthPages: Array<{ path: string; blockClass: string }>,
    surfaceSource?: RuntimeSurfaceSource,
): Promise<void> {
    const baseUrl = `https://main--${source.site}--${source.org}.aem.live`;
    // Static hand list, with the ledger's generated `runtime-surfaces.json`
    // merged in when available (ADR-008 consumer). Best-effort: falls back to
    // the static inventory when no source / unreachable.
    const inventory = await getRuntimeSurfaces(surfaceSource, logger);

    const probeAndAdd = async (path: string, probeUrl: string): Promise<boolean> => {
        if (contentPaths.includes(path)) return true;
        try {
            const response = await fetch(probeUrl, { method: 'HEAD' });
            if (response.ok) {
                contentPaths.unshift(path);
                return true;
            }
        } catch {
            // Doesn't exist / unreachable — skip.
        }
        return false;
    };

    // Spreadsheets: served as .json on CDN, stored as .xlsx on DA.live.
    for (const configPath of inventory.spreadsheets) {
        await probeAndAdd(configPath, `${baseUrl}${configPath}.json`);
    }

    // HTML fragment documents (nav, footer): not indexed but loaded at runtime.
    // `/customer/*` fragments (e.g. the code-loaded /customer/sidebar-fragment)
    // gate to a login at the bare URL, so probe the `.plain.html` we actually
    // copy — same lesson as the auth pages below. Others resolve bare.
    for (const fragmentPath of inventory.fragments) {
        const probeUrl = fragmentPath.startsWith('/customer/')
            ? `${baseUrl}${fragmentPath}.plain.html`
            : `${baseUrl}${fragmentPath}`;
        await probeAndAdd(fragmentPath, probeUrl);
    }

    // Customer auth pages: dropin-rendered, not indexed. Probe the
    // `.plain.html` we actually copy (not the bare rendered URL — dropin auth
    // pages like /customer/account gate to a login at the bare path, so a bare
    // probe can mis-stub a page whose authored content really exists). Pages
    // absent from source get destination stubs with the correct block markup.
    for (const authPage of inventory.authPages) {
        if (contentPaths.includes(authPage.path)) continue;
        const found = await probeAndAdd(authPage.path, `${baseUrl}${authPage.path}.plain.html`);
        if (!found) missingAuthPages.push(authPage);
    }
}
