/**
 * Which source paths a whole-site content copy covers, decided BEFORE anything copies.
 *
 * Enumerates the source (DA.live list API, falling back to the CDN content
 * index), drops what must not be copied (product overlays, the library index the
 * pipeline regenerates), and — on the index fallback only — backfills the
 * runtime surfaces the index omits. On either route it then adds what the
 * storefront's own code loads and the source has (`backfillCodePaths`, EDS-40).
 * The copy loop in `daLiveContentCopy.ts` consumes the result.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut).
 * Both were private methods; nothing outside the class called them.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveCopyPaths
 */

import { PLACEHOLDER_STUB_PATHS } from '../placeholderStubs';
import { getRuntimeSurfaces, type RuntimeSurfaceSource } from '../runtimeSurfaceResolver';
import { contentSiteBaseUrl, probePaths } from '../sitePathProbe';
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
 *
 * @param codePaths - what the storefront's own code loads, when it could be read.
 *   Given, the label sheets come from it (`backfillCodePaths`) and the fixed list
 *   of areas is not asked for; absent, the list is the fallback.
 */
export async function backfillEssentialPaths(
    logger: Logger,
    source: { org: string; site: string },
    contentPaths: string[],
    missingAuthPages: Array<{ path: string; blockClass: string }>,
    surfaceSource?: RuntimeSurfaceSource,
    codePaths?: readonly string[],
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

    // Spreadsheets: served as .json on the CDN, and probed there.
    for (const configPath of inventory.spreadsheets) {
        await probeAndAdd(configPath, `${baseUrl}${configPath}.json`);
    }

    // The label sheets, one per storefront area, at `/placeholders/<area>`. The
    // inventory's `/placeholders` above is a single sheet of that name, which a
    // current storefront does not have, so a brand's labels were never asked for
    // (EDS-40: a colleague's demo with 160 cart labels arrived with none).
    //
    // FALLBACK ONLY. Which areas a storefront fetches is written in its code, and
    // when that code was read the sheets come from it (`backfillCodePaths`). This
    // list describes one version of one template and is asked for only when the
    // code could not be read. A sheet copied here is served only where no stub
    // sits at its path: `placeholderStubPathsFor` leaves those areas unstubbed.
    if (codePaths === undefined) {
        for (const sheet of PLACEHOLDER_STUB_PATHS) {
            await probeAndAdd(`/${sheet}`, `${baseUrl}/${sheet}.json`);
        }
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

/**
 * Add to the enumerated paths what enumeration leaves out, in the order the copy
 * needs: the unindexed essentials on the index fallback (the DA.live list API
 * already returns them), then what the storefront's own code loads, on both routes.
 *
 * Mutates `contentPaths` and `missingAuthPages`; see the two functions it calls.
 *
 * @returns the code paths the source has; empty when the code was not read
 */
export async function backfillMissingPaths(
    logger: Logger,
    source: { org: string; site: string },
    contentPaths: string[],
    missingAuthPages: Array<{ path: string; blockClass: string }>,
    route: {
        usedDaLiveList: boolean;
        runtimeSurfaceSource?: RuntimeSurfaceSource;
        codePaths?: readonly string[];
    },
): Promise<string[]> {
    const { usedDaLiveList, runtimeSurfaceSource, codePaths } = route;
    if (!usedDaLiveList) {
        await backfillEssentialPaths(
            logger,
            source,
            contentPaths,
            missingAuthPages,
            runtimeSurfaceSource,
            codePaths,
        );
    }
    return codePaths ? backfillCodePaths(logger, source, contentPaths, codePaths) : [];
}

/** The path a document is copied under: a sheet's web path without its `.json`. */
function contentPathOf(webPath: string): string {
    return webPath.replace(/\.json$/, '');
}

/**
 * Add the documents the storefront's own code loads, when the source has them.
 *
 * `codePaths` is everything `deriveStorefrontCodePaths` read out of the
 * storefront's JavaScript, and it over-reads on purpose: a string that is not a
 * document is among them. The source is the filter. Each path not already in the
 * list is asked for on the source's published site (`probePaths`: bounded, and a
 * request that fails is "not there"), and added when the source answers.
 *
 * Runs on both routes. On the list route nearly everything is listed already and
 * costs no request.
 *
 * Mutates `contentPaths` (prepends found paths).
 *
 * @param codePaths - web paths: `/cart` for a page, `/placeholders/cart.json` for a sheet
 * @returns the code paths the source has, listed already or answered just now: what
 *   the storefront should serve once the copy is published
 */
export async function backfillCodePaths(
    logger: Logger,
    source: { org: string; site: string },
    contentPaths: string[],
    codePaths: readonly string[],
): Promise<string[]> {
    const listed = new Set(contentPaths);
    const unlisted = codePaths.filter((webPath) => !listed.has(contentPathOf(webPath)));
    const { served } = await probePaths(contentSiteBaseUrl(source), unlisted);

    for (const webPath of served) {
        const contentPath = contentPathOf(webPath);
        if (listed.has(contentPath)) continue;
        listed.add(contentPath);
        contentPaths.unshift(contentPath);
    }
    logger.info(
        `[DA.live] The storefront's code loads ${codePaths.length} paths: ` +
            `${codePaths.length - unlisted.length} already listed, ${served.length} more found on the source`,
    );
    const answered = new Set(served);
    return codePaths.filter((webPath) => !unlisted.includes(webPath) || answered.has(webPath));
}
