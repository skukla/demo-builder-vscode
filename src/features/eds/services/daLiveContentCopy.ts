/**
 * DaLiveContentCopy — copy authored content between DA.live sites.
 *
 * The content-copy cluster of the DA.live stack: single-file and recursive
 * copy, spreadsheet handling, HTML patching/transform, whole-site duplication,
 * reference-following discovery, and the account-chrome overlay. Extracted from
 * `DaLiveContentOperations` as part of its decomposition; the facade constructs
 * one and delegates.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLiveContentCopy
 */

import { DaLiveApiClient } from './daLiveApiClient';
import {
    CONTENT_COPY_BATCH_SIZE,
    DA_LIVE_BASE_URL,
    MAX_RETRY_ATTEMPTS,
    RETRYABLE_STATUS_CODES,
    getRetryDelay,
    normalizePath,
} from './daLiveConstants';
import { DaLiveContentDiscovery } from './daLiveContentDiscovery';
import { transformHtmlForDaLive, buildSourceUrl, resolveDaPath } from './daLiveContentHelpers';
import { DaLiveSourceOperations } from './daLiveSourceOperations';
import { convertSpreadsheetJsonToHtml } from './daLiveSpreadsheetUtils';
import {
    addContentResult,
    addReferenceResult,
    isDeferredReference,
    type PatchReport,
} from './patchReportHelper';
import { RUNTIME_SURFACES } from './runtimeSurfaceInventory';
import { getRuntimeSurfaces, type RuntimeSurfaceSource } from './runtimeSurfaceResolver';
import {
    DaLiveAuthError,
    type DaLiveCopyResult,
    type DaLiveProgressCallback,
    type DaLiveContentSource,
} from './types';
import { sleep } from '@/core/utils/sleep';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ContentPatchSource } from '@/types/demoPackages';
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

/** Copy authored content between DA.live sites. */
export class DaLiveContentCopy {
    constructor(
        private readonly apiClient: DaLiveApiClient,
        private readonly sourceOps: DaLiveSourceOperations,
        private readonly discoveryOps: DaLiveContentDiscovery,
        private readonly logger: Logger,
    ) {}

    /**
     * Copy content from source to destination
     * @param source - Source location {org, site, path}
     * @param destination - Destination location {org, site, path}
     * @param options - Copy options {recursive}
     * @returns Copy result with success status and file lists
     */
    async copyContent(
        source: { org: string; site: string; path: string },
        destination: { org: string; site: string; path: string },
        options: { recursive?: boolean } = {},
    ): Promise<DaLiveCopyResult> {
        const token = await this.apiClient.getImsToken();
        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];

        // Check if source is a directory (needs recursive handling)
        if (options.recursive) {
            // List source directory
            const entries = await this.sourceOps.listDirectory(
                source.org,
                source.site,
                source.path,
            );

            // Process all entries
            // In DA.live API, folders don't have an 'ext' field, only files do
            for (const entry of entries) {
                const isFolder = !entry.ext;
                if (isFolder) {
                    // Recursively copy subdirectory
                    const subResult = await this.copyContent(
                        { org: source.org, site: source.site, path: entry.path },
                        {
                            org: destination.org,
                            site: destination.site,
                            path: entry.path.replace(source.path, destination.path),
                        },
                        { recursive: true },
                    );
                    copiedFiles.push(...subResult.copiedFiles);
                    failedFiles.push(...subResult.failedFiles);
                } else {
                    // Copy individual file
                    const destPath = entry.path.replace(source.path, destination.path);
                    const success = await this.copySingleFile(
                        token,
                        source,
                        entry.path,
                        destination,
                        destPath,
                    );
                    if (success) {
                        copiedFiles.push(destPath);
                    } else {
                        failedFiles.push({ path: destPath, error: 'Copy failed' });
                    }
                }
            }
        } else {
            // Single file copy
            const success = await this.copySingleFile(
                token,
                source,
                source.path,
                destination,
                destination.path,
            );
            if (success) {
                copiedFiles.push(destination.path);
            } else {
                failedFiles.push({ path: destination.path, error: 'Copy failed' });
            }
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles: copiedFiles.length + failedFiles.length,
        };
    }

    /**
     * Process HTML content: apply patches and transform for DA.live.
     *
     * When `patchReport` is supplied, each content-patch result (applied or
     * not) is routed into the unified report via `addContentResult` so the
     * pipeline's final `reportUnapplied` toast can name unapplied content
     * patches alongside unapplied code patches. Without a report (e.g.
     * one-off content copies outside the create/reset pipeline), the
     * previous debug-log behavior is preserved.
     */
    private async processHtmlContent(
        sourceResponse: Response,
        sourcePath: string,
        sourceBaseUrl: string,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
        discoveredPaths?: Set<string>,
    ): Promise<Blob> {
        let htmlText = await sourceResponse.text();

        // Collect internal document references (e.g. the /customer/nav fragment
        // embedded by the account page) so the copy loop can pull them from
        // canonical — they are often absent from the index and backfill lists.
        if (discoveredPaths) {
            for (const ref of extractReferencedPaths(htmlText, sourceBaseUrl)) {
                discoveredPaths.add(ref);
            }
        }

        if (contentPatchIds && contentPatchIds.length > 0) {
            const { applyContentPatches } = await import('./contentPatchRegistry');
            const { html: patchedHtml, results } = await applyContentPatches(
                htmlText,
                sourcePath,
                contentPatchIds,
                this.logger,
                contentPatchSource,
            );
            htmlText = patchedHtml;

            for (const result of results) {
                if (patchReport) {
                    addContentResult(patchReport, result);
                } else if (!result.applied && result.reason) {
                    this.logger.debug(
                        `[DA.live] Content patch '${result.patchId}' not applied to ${sourcePath}: ${result.reason}`,
                    );
                }
            }
        }

        const transformedHtml = transformHtmlForDaLive(htmlText, sourceBaseUrl);
        return new Blob([transformedHtml], { type: 'text/html' });
    }

    /**
     * Copy a single file with retry logic
     * Uses the /source endpoint (like storefront-tools) which creates content directly,
     * rather than /copy which requires the destination site to already exist.
     *
     * For HTML content, fetches .plain.html to get just the main content without
     * the full page wrapper, then transforms and wraps it in document structure.
     *
     * `source.preview` reads the PREVIEW host (`.aem.page`) instead of the
     * published one. Content pages are published, so `.aem.live` is right for
     * them. Block-library doc pages are a different matter: a library source
     * publishes SOME of its doc pages and not others, and which is which is a
     * per-block property nobody maintains deliberately. Measured 2026-08-18
     * across the two library sources this extension ships:
     *
     *     accs-citisignal  cards, hero              preview 200, live 404
     *     accs-citisignal  carousel, product-teaser preview 200, live 200
     *     bodea-source     guided-selling-luxe, …   preview 200, live 200
     *
     * Preview is the superset — publishing requires previewing first — so it is
     * the only host where everything a source HAS is reachable.
     *
     * Aimed at the published host, this copy silently skipped whichever blocks
     * happened to be preview-only, and those fell through to
     * `generateStubDocPages`: an author opening the DA.live palette got a box
     * with the block's name where the authored example should be, for some
     * blocks and not others. That is worse than a clean failure, because a
     * library half full of stubs looks like it worked.
     *
     * @param contentPatchIds - Optional content patch IDs to apply to HTML content
     * @param contentPatchSource - Optional external source for content patches
     */
    async copySingleFile(
        token: string,
        source: { org: string; site: string; preview?: boolean },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
        discoveredPaths?: Set<string>,
    ): Promise<boolean> {
        const sourceHost = source.preview ? 'aem.page' : 'aem.live';
        const sourceBaseUrl = `https://main--${source.site}--${source.org}.${sourceHost}`;

        const isSpreadsheet = await this.isSpreadsheetPath(sourceBaseUrl, sourcePath);
        if (isSpreadsheet) {
            return this.copySpreadsheetFile(token, source, sourcePath, destination, destPath);
        }

        const isHtmlPath = !sourcePath.match(/\.[a-z0-9]+$/i) || sourcePath.endsWith('.html');
        const sourceUrl = buildSourceUrl(sourceBaseUrl, sourcePath, isHtmlPath);

        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const sourceResponse = await fetch(sourceUrl, {
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (!sourceResponse.ok) {
                    // 404 is expected for blocks without doc pages on the CDN — log at debug
                    const logLevel = sourceResponse.status === 404 ? 'debug' : 'warn';
                    this.logger[logLevel](
                        `[DA.live] Failed to fetch source ${sourcePath}: ${sourceResponse.status}`,
                    );
                    return false;
                }

                const contentType = sourceResponse.headers.get('content-type') || '';
                const isHtml = contentType.includes('text/html') || isHtmlPath;
                const daPath = resolveDaPath(destPath, isHtml);

                const contentBlob = isHtml
                    ? await this.processHtmlContent(
                          sourceResponse,
                          sourcePath,
                          sourceBaseUrl,
                          contentPatchIds,
                          contentPatchSource,
                          patchReport,
                          discoveredPaths,
                      )
                    : await sourceResponse.blob();

                const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${daPath}`;
                const formData = new FormData();
                formData.append('data', contentBlob);

                const response = await fetch(destUrl, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                    signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                });

                if (response.ok) return true;

                // Token expired — throw so caller can pause-and-prompt for re-auth
                if (response.status === 401) {
                    throw new DaLiveAuthError('DA.live token expired during content copy');
                }

                if (
                    RETRYABLE_STATUS_CODES.includes(response.status) &&
                    attempt < MAX_RETRY_ATTEMPTS
                ) {
                    await sleep(getRetryDelay(attempt));
                    continue;
                }

                let errorDetail = '';
                try {
                    const errorBody = await response.text();
                    errorDetail = errorBody ? `: ${errorBody}` : '';
                } catch {
                    // Ignore if response body can't be read
                }

                this.logger.warn(
                    `[DA.live] Copy failed for ${destPath}: ${response.status}${errorDetail}`,
                );
                return false;
            } catch (error) {
                // Auth errors must propagate immediately — never retry or swallow
                if (error instanceof DaLiveAuthError) throw error;

                if (attempt < MAX_RETRY_ATTEMPTS) {
                    await sleep(getRetryDelay(attempt));
                    continue;
                }
                this.logger.error(`[DA.live] Copy error for ${destPath}`, error as Error);
                return false;
            }
        }
        return false;
    }

    /**
     * Check if a path is a spreadsheet (Excel file in DA.live, served as JSON on CDN)
     * Spreadsheets don't have .plain.html versions, they're served as .json
     */
    private async isSpreadsheetPath(baseUrl: string, path: string): Promise<boolean> {
        // Skip paths that already have extensions or are obviously HTML
        if (path.match(/\.(html|htm)$/i) || path === '/' || path.endsWith('/')) {
            return false;
        }

        // Try fetching as JSON - spreadsheets return JSON, HTML pages return 404
        const jsonUrl = `${baseUrl}${path}.json`;
        try {
            const response = await fetch(jsonUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(TIMEOUTS.QUICK),
            });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                return contentType.includes('application/json');
            }
        } catch {
            // Ignore errors - not a spreadsheet
        }
        return false;
    }

    /**
     * Copy a spreadsheet file from source to destination
     * Fetches JSON from public CDN and converts to HTML table for DA.live upload
     * (Can't use DA.live admin API for cross-org copies - no auth access to source)
     */
    private async copySpreadsheetFile(
        token: string,
        source: { org: string; site: string },
        sourcePath: string,
        destination: { org: string; site: string },
        destPath: string,
    ): Promise<boolean> {
        // Fetch JSON from public CDN (works without auth for any org)
        const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${sourcePath}.json`;

        try {
            const sourceResponse = await fetch(sourceUrl, {
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (!sourceResponse.ok) {
                this.logger.warn(
                    `[DA.live] Failed to fetch spreadsheet JSON ${sourcePath}: ${sourceResponse.status}`,
                );
                return false;
            }

            const jsonData = await sourceResponse.json();

            // Convert JSON to HTML table format that DA.live can process
            const htmlContent = convertSpreadsheetJsonToHtml(jsonData);
            if (!htmlContent) {
                this.logger.warn(`[DA.live] Failed to convert spreadsheet ${sourcePath} to HTML`);
                return false;
            }

            // Upload as HTML to destination DA.live (will be converted to sheet)
            const destNormalizedPath = normalizePath(destPath);
            const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${destNormalizedPath}.html`;

            const formData = new FormData();
            formData.append('data', new Blob([htmlContent], { type: 'text/html' }));

            const response = await fetch(destUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
            });

            if (response.ok) {
                this.logger.info(`[DA.live] Copied spreadsheet ${sourcePath}`);
                return true;
            }

            // Token expired — throw so caller can pause-and-prompt for re-auth
            if (response.status === 401) {
                throw new DaLiveAuthError('DA.live token expired during spreadsheet copy');
            }

            this.logger.warn(
                `[DA.live] Failed to upload spreadsheet ${destPath}: ${response.status}`,
            );
            return false;
        } catch (error) {
            if (error instanceof DaLiveAuthError) throw error;
            this.logger.error(`[DA.live] Spreadsheet copy error for ${destPath}`, error as Error);
            return false;
        }
    }

    /**
     * Copy an entire DA.live site tree to a new site name in one operation.
     *
     * Uses DA's `POST /copy/{org}/{site}` endpoint with `destination=/{org}/{destSite}/`
     * — a single request that recursively duplicates the source tree under
     * the destination path. The destination namespace is auto-created.
     *
     * Used by the storefront name-migration path on reset to move content
     * from a legacy `<repo>-content` site to the matching `<repo>` site
     * before re-registering Helix against the new DA URL. The source is
     * NOT modified; the caller deletes it after verifying the new site.
     *
     * @param srcOrg - source DA.live org
     * @param srcSite - source DA.live site
     * @param destOrg - destination DA.live org (typically same as srcOrg)
     * @param destSite - destination DA.live site
     * @returns success or failure with status detail
     */
    async copyDaLiveSite(
        srcOrg: string,
        srcSite: string,
        destOrg: string,
        destSite: string,
    ): Promise<{ success: true } | { success: false; error: string; status?: number }> {
        const token = await this.apiClient.getImsToken();
        const url = `${DA_LIVE_BASE_URL}/copy/${srcOrg}/${srcSite}/`;
        const formData = new FormData();
        formData.append('destination', `/${destOrg}/${destSite}/`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
            });

            if (response.status === 204 || response.ok) {
                this.logger.info(
                    `[DA.live] Copied site ${srcOrg}/${srcSite} → ${destOrg}/${destSite} (status=${response.status})`,
                );
                return { success: true };
            }

            const bodyText = await response.text().catch(() => '');
            return {
                success: false,
                status: response.status,
                error: `Copy failed: ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`,
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Enumerate source content paths and apply the standard filters.
     *
     * Prefers the DA.live list API (complete), falling back to the CDN content
     * index. The list API returns 404 (mapped to empty array) for orgs the user
     * doesn't belong to, so also falls back when it succeeds but returns 0 paths.
     * Then removes product-overlay documents and the library-index spreadsheet.
     *
     * @param source - Source content configuration (org, site, indexUrl)
     * @returns The filtered content paths plus whether the list API was used
     */
    private async enumerateAndFilterContentPaths(
        source: DaLiveContentSource,
    ): Promise<{ contentPaths: string[]; usedDaLiveList: boolean }> {
        let contentPaths: string[];
        let usedDaLiveList = false;

        try {
            contentPaths = await this.discoveryOps.getContentPathsFromDaLive(
                source.org,
                source.site,
            );
            if (contentPaths.length > 0) {
                usedDaLiveList = true;
                this.logger.info(
                    `[DA.live] Enumerated ${contentPaths.length} content files via list API`,
                );
            } else {
                this.logger.info(
                    `[DA.live] List API returned 0 files, falling back to content index`,
                );
                contentPaths = await this.discoveryOps.getContentPathsFromIndex(source);
            }
        } catch {
            this.logger.info(`[DA.live] List API unavailable, falling back to content index`);
            contentPaths = await this.discoveryOps.getContentPathsFromIndex(source);
        }

        // Filter out product overlay documents (keep only /products/default)
        const originalCount = contentPaths.length;
        contentPaths = filterProductOverlays(contentPaths);
        const filteredCount = originalCount - contentPaths.length;
        if (filteredCount > 0) {
            this.logger.info(`[DA.live] Filtered ${filteredCount} product overlay paths`);
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
            this.logger.info(
                `[DA.live] Excluded library index (will be generated with correct paths)`,
            );
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
    private async backfillEssentialPaths(
        source: { org: string; site: string },
        contentPaths: string[],
        missingAuthPages: Array<{ path: string; blockClass: string }>,
        surfaceSource?: RuntimeSurfaceSource,
    ): Promise<void> {
        const baseUrl = `https://main--${source.site}--${source.org}.aem.live`;
        // Static hand list, with the ledger's generated `runtime-surfaces.json`
        // merged in when available (ADR-008 consumer). Best-effort: falls back to
        // the static inventory when no source / unreachable.
        const inventory = await getRuntimeSurfaces(surfaceSource, this.logger);

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

    /**
     * Follow internal references discovered while copying and pull them from
     * canonical. Transitive (depth-capped) and deduped against everything already
     * enumerated/copied. Best-effort: a referenced doc that 404s is skipped, not
     * fatal — the completeness audit surfaces genuine dangling refs separately.
     *
     * @returns the discovered paths that were successfully copied
     */
    private async discoverAndCopyReferences(
        source: { org: string; site: string },
        dest: { org: string; site: string },
        enumeratedPaths: string[],
        discoveredPaths: Set<string>,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
    ): Promise<string[]> {
        const copied: string[] = [];
        const visited = new Set<string>(enumeratedPaths);
        const MAX_DISCOVERY_DEPTH = 3;

        for (let depth = 0; depth < MAX_DISCOVERY_DEPTH; depth++) {
            const newPaths = [...discoveredPaths].filter((p) => !visited.has(p));
            if (newPaths.length === 0) break;
            for (const p of newPaths) visited.add(p);

            this.logger.info(
                `[DA.live] Discovered ${newPaths.length} referenced document(s) not in the index (depth ${depth + 1}): ${newPaths.join(', ')}`,
            );

            for (let i = 0; i < newPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
                const batch = newPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
                const token = await this.apiClient.getImsToken();
                const results = await Promise.all(
                    batch.map(async (sourcePath) => {
                        const success = await this.copySingleFile(
                            token,
                            source,
                            sourcePath,
                            dest,
                            sourcePath,
                            contentPatchIds,
                            contentPatchSource,
                            patchReport,
                            discoveredPaths,
                        );
                        return { path: sourcePath, success };
                    }),
                );
                for (const result of results) {
                    if (result.success) {
                        copied.push(result.path);
                    } else {
                        this.logger.debug(
                            `[DA.live] Discovered reference not copyable (skipped): ${result.path}`,
                        );
                    }
                }
            }
        }

        return copied;
    }

    /**
     * Overlay pass: copy the customer account chrome (the auth pages + the
     * fragments they reference, e.g. `/customer/nav`) from a SECOND content
     * source, on top of already-copied brand content.
     *
     * Used by hybrid packages whose brand/catalog content lives on one site but
     * whose B2B account experience must come from the canonical B2B content site
     * (B2B base + brand overlay). Additive; pulls live from the public CDN (no
     * fork); copies only what exists on the account source (no stubs — the brand
     * copy already created any base stubs). Reference-following then pulls
     * `/customer/nav` automatically.
     *
     * @param accountSource - The content site to source `/customer/*` chrome from.
     * @returns Copy result for the overlaid files (best-effort; never throws).
     */
    async overlayAccountChrome(
        accountSource: { org: string; site: string },
        destOrg: string,
        destSite: string,
        patchReport?: PatchReport,
    ): Promise<DaLiveCopyResult> {
        const baseUrl = `https://main--${accountSource.site}--${accountSource.org}.aem.live`;
        const dest = { org: destOrg, site: destSite };
        const discoveredPaths = new Set<string>();
        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];

        // Entry points: the auth pages that actually exist on the account source.
        const entryPaths: string[] = [];
        for (const authPage of RUNTIME_SURFACES.authPages) {
            try {
                const probe = await fetch(`${baseUrl}${authPage.path}.plain.html`, {
                    method: 'HEAD',
                });
                if (probe.ok) entryPaths.push(authPage.path);
            } catch {
                // Unreachable on the account source — skip.
            }
        }

        if (entryPaths.length === 0) {
            this.logger.warn(
                `[DA.live] Account-chrome overlay: no auth pages found on ${accountSource.org}/${accountSource.site}`,
            );
            return { success: true, copiedFiles, failedFiles, totalFiles: 0 };
        }

        const token = await this.apiClient.getImsToken();
        for (const path of entryPaths) {
            const ok = await this.copySingleFile(
                token,
                accountSource,
                path,
                dest,
                path,
                undefined,
                undefined,
                patchReport,
                discoveredPaths,
            );
            if (ok) copiedFiles.push(path);
            else failedFiles.push({ path, error: 'Copy failed' });
        }

        // Follow references (pulls /customer/nav + any sub-fragments) from the account source.
        const discovered = await this.discoverAndCopyReferences(
            accountSource,
            dest,
            entryPaths,
            discoveredPaths,
            undefined,
            undefined,
            patchReport,
        );
        copiedFiles.push(...discovered);

        this.logger.info(
            `[DA.live] Account-chrome overlay from ${accountSource.org}/${accountSource.site}: ${copiedFiles.join(', ') || '(none)'}`,
        );
        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles: copiedFiles.length + failedFiles.length,
        };
    }

    /**
     * Copy content from source site to destination site
     * @param source - Source content configuration (org, site, indexUrl)
     * @param destOrg - Destination organization
     * @param destSite - Destination site
     * @param progressCallback - Optional progress callback
     * @param contentPatchIds - Optional content patch IDs to apply
     * @param contentPatchSource - Optional external source for content patches
     * @param patchReport - Optional patch report. When supplied, per-page
     *   content-patch results (applied or not) are routed into the report
     *   via `addContentResult`, so the pipeline's final `reportUnapplied`
     *   call surfaces unapplied content patches in the same toast as
     *   unapplied code patches. Without a report, the old debug-log
     *   behavior is preserved (for callers outside the create/reset
     *   pipeline that don't aggregate patch results).
     * @returns Copy result
     */
    async copyContentFromSource(
        source: DaLiveContentSource,
        destOrg: string,
        destSite: string,
        progressCallback?: DaLiveProgressCallback,
        contentPatchIds?: string[],
        contentPatchSource?: ContentPatchSource,
        patchReport?: PatchReport,
        runtimeSurfaceSource?: RuntimeSurfaceSource,
    ): Promise<DaLiveCopyResult> {
        // Report initialization progress
        progressCallback?.({
            processed: 0,
            total: 0,
            percentage: 0,
            message: 'Enumerating source content...',
        });

        // Enumerate and filter source content paths (list API w/ CDN-index fallback,
        // product-overlay filter, library-index exclusion).
        const { contentPaths, usedDaLiveList } = await this.enumerateAndFilterContentPaths(source);

        progressCallback?.({
            processed: 0,
            total: 0,
            percentage: 0,
            message: 'Checking configurations...',
        });

        // Auth pages missing from source — stubs created after the main copy loop
        const missingAuthPages: Array<{ path: string; blockClass: string }> = [];

        // When using CDN index fallback, add essential content that may not
        // be in the content index. The DA.live list API already returns
        // everything, so this is only needed for the fallback path.
        if (!usedDaLiveList) {
            await this.backfillEssentialPaths(
                source,
                contentPaths,
                missingAuthPages,
                runtimeSurfaceSource,
            );
        }

        const copiedFiles: string[] = [];
        const failedFiles: { path: string; error: string }[] = [];
        let totalFiles = contentPaths.length;

        // Internal document references discovered while copying (e.g. the
        // /customer/nav fragment embedded by the account page). Drained after the
        // main loop so referenced-but-unindexed docs get pulled from canonical.
        const discoveredPaths = new Set<string>();

        // Copy files in parallel batches for improved performance (~5x faster)
        const contentStart = Date.now();
        for (let i = 0; i < contentPaths.length; i += CONTENT_COPY_BATCH_SIZE) {
            const batch = contentPaths.slice(i, i + CONTENT_COPY_BATCH_SIZE);
            const token = await this.apiClient.getImsToken();
            const batchNum = Math.floor(i / CONTENT_COPY_BATCH_SIZE) + 1;
            const batchStart = Date.now();

            // Report progress at batch start
            if (progressCallback) {
                progressCallback({
                    currentFile: batch[0],
                    processed: i,
                    total: totalFiles,
                    percentage: Math.round((i / totalFiles) * 100),
                });
            }

            // Copy batch in parallel
            const results = await Promise.all(
                batch.map(async (sourcePath) => {
                    const success = await this.copySingleFile(
                        token,
                        { org: source.org, site: source.site },
                        sourcePath,
                        { org: destOrg, site: destSite },
                        sourcePath,
                        contentPatchIds,
                        contentPatchSource,
                        patchReport,
                        discoveredPaths,
                    );
                    return { path: sourcePath, success };
                }),
            );

            this.logger.debug(
                `[DA.live] Content batch ${batchNum}: ${batch.length} files in ${formatDuration(Date.now() - batchStart)}`,
            );

            // Track results
            for (const result of results) {
                if (result.success) {
                    copiedFiles.push(result.path);
                } else {
                    failedFiles.push({ path: result.path, error: 'Copy failed' });
                }
            }
        }
        this.logger.debug(
            `[DA.live] Content copy total: ${totalFiles} files in ${formatDuration(Date.now() - contentStart)}`,
        );

        // Reference-following discovery: copy internal documents referenced by
        // already-copied pages but absent from the index + backfill lists (e.g.
        // the /customer/nav account-menu fragment). Closes the "silently-dropped
        // content" bug class without hardcoding paths or forking content.
        const discoveredCopied = await this.discoverAndCopyReferences(
            { org: source.org, site: source.site },
            { org: destOrg, site: destSite },
            contentPaths,
            discoveredPaths,
            contentPatchIds,
            contentPatchSource,
            patchReport,
        );
        for (const path of discoveredCopied) {
            copiedFiles.push(path);
            totalFiles++;
        }

        // Completeness audit: any internal document referenced by copied content
        // but not itself copied (e.g. a fragment that 404s on source) is surfaced
        // via the proceed-and-warn report — the loud signal for the
        // "silently-dropped content" class even if discovery missed a shape. The
        // demo still proceeds; this never fails the copy.
        // References a later stage is configured to supply are not gaps — see
        // `deferredReferencePrefixes`. Skipping them keeps this channel worth reading.
        const copiedSet = new Set(copiedFiles);
        for (const ref of discoveredPaths) {
            if (!copiedSet.has(ref) && !isDeferredReference(patchReport, ref)) {
                this.logger.warn(
                    `[DA.live] Completeness audit — referenced document not copied: ${ref}`,
                );
                if (patchReport) {
                    addReferenceResult(
                        patchReport,
                        ref,
                        'referenced by copied content but not found on source',
                    );
                }
            }
        }

        // Create stub pages for auth pages that don't exist on source.
        // Each stub uses the correct block class so the dropin renders properly.
        if (missingAuthPages.length > 0) {
            const token = await this.apiClient.getImsToken();
            for (const { path: authPath, blockClass } of missingAuthPages) {
                try {
                    const daPath = resolveDaPath(authPath, true);
                    const stubHtml = [
                        '<body><header></header><main><div>',
                        `<div class="${blockClass}"><div><div></div></div></div>`,
                        '</div></main><footer></footer></body>',
                    ].join('');
                    const blob = new Blob([stubHtml], { type: 'text/html' });
                    const formData = new FormData();
                    formData.append('data', blob);

                    const destUrl = `${DA_LIVE_BASE_URL}/source/${destOrg}/${destSite}/${daPath}`;
                    const response = await fetch(destUrl, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                        body: formData,
                        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
                    });

                    if (response.ok) {
                        copiedFiles.push(authPath);
                        totalFiles++;
                        this.logger.info(`[DA.live] Created stub page for ${authPath}`);
                    } else {
                        this.logger.warn(
                            `[DA.live] Failed to create stub for ${authPath}: ${response.status}`,
                        );
                    }
                } catch (error) {
                    this.logger.warn(
                        `[DA.live] Failed to create stub for ${authPath}: ${(error as Error).message}`,
                    );
                }
            }
        }

        // Final progress update
        if (progressCallback) {
            progressCallback({
                processed: totalFiles,
                total: totalFiles,
                percentage: 100,
            });
        }

        return {
            success: failedFiles.length === 0,
            copiedFiles,
            failedFiles,
            totalFiles,
        };
    }
}
