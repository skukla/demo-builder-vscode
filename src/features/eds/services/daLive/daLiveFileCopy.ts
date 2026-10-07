/**
 * Copy ONE document from a public EDS site into a DA.live site.
 *
 * Reads the source from the CDN (`.aem.live`, or `.aem.page` for preview-only
 * block docs), patches and transforms HTML for DA.live, routes spreadsheets to
 * `daLiveSpreadsheetCopy`, and writes the result through the shared DA.live
 * client. Every bulk path in `daLiveContentCopy.ts` is a loop over this.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut). The
 * class keeps `copySingleFile` with its positional signature — it is public, and
 * the account-chrome overlay borrows it — and delegates here.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveFileCopy
 */

import {
    addContentResult,
    addLinkedFrom,
    addMissingOnSource,
    type PatchReport,
} from '../patches/patchReportHelper';
import { DaLiveAuthError } from '../types';
import type { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL, MAX_RETRY_ATTEMPTS, getRetryDelay } from './daLiveConstants';
import { transformHtmlForDaLive, buildSourceUrl, resolveDaPath } from './daLiveContentHelpers';
import { extractReferencedPaths } from './daLiveContentReferences';
import { copySpreadsheetFile, isSpreadsheetPath } from './daLiveSpreadsheetCopy';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ContentPatchSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** What a single-file copy needs from the DA.live stack. */
interface FileCopyDeps {
    apiClient: DaLiveApiClient;
    logger: Logger;
}

/**
 * The positional signature `DaLiveContentCopy.copySingleFile` exposes, and the
 * shape every collaborator that borrows it (batch copy, account chrome) is typed to.
 */
export type CopySingleFile = (
    token: string,
    source: { org: string; site: string; preview?: boolean },
    sourcePath: string,
    destination: { org: string; site: string },
    destPath: string,
    contentPatchIds?: string[],
    contentPatchSource?: ContentPatchSource,
    patchReport?: PatchReport,
    discoveredPaths?: Set<string>,
) => Promise<boolean>;

/** One document to copy — the same fields as `CopySingleFile`'s parameters. */
interface SingleFileCopy {
    token: string;
    source: { org: string; site: string; preview?: boolean };
    sourcePath: string;
    destination: { org: string; site: string };
    destPath: string;
    contentPatchIds?: string[];
    contentPatchSource?: ContentPatchSource;
    patchReport?: PatchReport;
    discoveredPaths?: Set<string>;
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
async function processHtmlContent(
    logger: Logger,
    sourceResponse: Response,
    sourceBaseUrl: string,
    copy: SingleFileCopy,
): Promise<Blob> {
    const { sourcePath, contentPatchIds, contentPatchSource, patchReport, discoveredPaths } = copy;
    let htmlText = await sourceResponse.text();

    // Collect internal document references (e.g. the /customer/nav fragment
    // embedded by the account page) so the copy loop can pull them from
    // canonical — they are often absent from the index and backfill lists.
    if (discoveredPaths) {
        for (const ref of extractReferencedPaths(htmlText, sourceBaseUrl)) {
            discoveredPaths.add(ref);
            if (patchReport) addLinkedFrom(patchReport, ref, sourcePath);
        }
    }

    if (contentPatchIds && contentPatchIds.length > 0) {
        const { applyContentPatches } = await import('../patches/contentPatchRegistry');
        const { html: patchedHtml, results } = await applyContentPatches(
            htmlText,
            sourcePath,
            contentPatchIds,
            logger,
            contentPatchSource,
        );
        htmlText = patchedHtml;

        for (const result of results) {
            if (patchReport) {
                addContentResult(patchReport, result);
            } else if (!result.applied && result.reason) {
                logger.debug(
                    `[DA.live] Content patch '${result.patchId}' not applied to ${sourcePath}: ${result.reason}`,
                );
            }
        }
    }

    const transformedHtml = transformHtmlForDaLive(htmlText, sourceBaseUrl);
    return new Blob([transformedHtml], { type: 'text/html' });
}

/**
 * One attempt: read the source from the CDN, then write it to DA.live.
 *
 * Returns the outcome; THROWS for a network error (the caller's retry loop
 * decides) and for `DaLiveAuthError` (never retried).
 */
async function attemptCopy(
    deps: FileCopyDeps,
    copy: SingleFileCopy,
    sourceBaseUrl: string,
    isHtmlPath: boolean,
): Promise<boolean> {
    const { logger, apiClient } = deps;
    const { token, sourcePath, destination, destPath } = copy;
    const sourceUrl = buildSourceUrl(sourceBaseUrl, sourcePath, isHtmlPath);

    // CDN read: raw fetch on purpose (see the jurisdiction note on
    // `DaLiveContentCopy`). Non-OK is terminal — only network errors retry,
    // via the caller's loop.
    const sourceResponse = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    if (!sourceResponse.ok) {
        // 404 is expected for blocks without doc pages on the CDN — log at debug
        const logLevel = sourceResponse.status === 404 ? 'debug' : 'warn';
        logger[logLevel](`[DA.live] Failed to fetch source ${sourcePath}: ${sourceResponse.status}`);
        // Told apart for the completeness audit: a 404 means the source has no
        // such page, so a link to it is a broken link there, not a failed copy.
        if (sourceResponse.status === 404 && copy.patchReport) {
            addMissingOnSource(copy.patchReport, sourcePath);
        }
        return false;
    }

    const contentType = sourceResponse.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || isHtmlPath;
    const daPath = resolveDaPath(destPath, isHtml);

    const contentBlob = isHtml
        ? await processHtmlContent(logger, sourceResponse, sourceBaseUrl, copy)
        : await sourceResponse.blob();

    const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${daPath}`;

    // DA.live write via the shared client: 5xx/network retries live
    // THERE now (this loop used to re-run the whole source+dest
    // pair); the factory rebuilds the one-shot FormData per attempt
    // from the reusable blob.
    const response = await apiClient.fetchWithRetry(
        destUrl,
        () => {
            const formData = new FormData();
            formData.append('data', contentBlob);
            return {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            };
        },
        { rateLimit: 'return' },
    );

    if (response.ok) return true;

    // Token expired — throw so caller can pause-and-prompt for re-auth
    if (response.status === 401) {
        throw new DaLiveAuthError('DA.live token expired during content copy');
    }

    let errorDetail = '';
    try {
        const errorBody = await response.text();
        errorDetail = errorBody ? `: ${errorBody}` : '';
    } catch {
        // Ignore if response body can't be read
    }

    logger.warn(`[DA.live] Copy failed for ${destPath}: ${response.status}${errorDetail}`);
    return false;
}

/**
 * Copy a single file with retry logic.
 *
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
 */
export async function copySingleFile(deps: FileCopyDeps, copy: SingleFileCopy): Promise<boolean> {
    const { token, source, sourcePath, destination, destPath } = copy;
    const sourceHost = source.preview ? 'aem.page' : 'aem.live';
    const sourceBaseUrl = `https://main--${source.site}--${source.org}.${sourceHost}`;

    // A DA.live spreadsheet is an Excel doc served as JSON, with no `.plain.html`,
    // so it cannot use the normal copy path at all.
    if (await isSpreadsheetPath(sourceBaseUrl, sourcePath)) {
        return copySpreadsheetFile(deps, token, source, sourcePath, destination, destPath);
    }

    const isHtmlPath = !sourcePath.match(/\.[a-z0-9]+$/i) || sourcePath.endsWith('.html');

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
            return await attemptCopy(deps, copy, sourceBaseUrl, isHtmlPath);
        } catch (error) {
            // Auth errors must propagate immediately — never retry or swallow
            if (error instanceof DaLiveAuthError) throw error;

            if (attempt < MAX_RETRY_ATTEMPTS) {
                await sleep(getRetryDelay(attempt));
                continue;
            }
            deps.logger.error(`[DA.live] Copy error for ${destPath}`, error as Error);
            return false;
        }
    }
    return false;
}
