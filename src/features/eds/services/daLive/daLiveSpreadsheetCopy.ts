/**
 * Spreadsheet copy — the one content kind that cannot go through the normal path.
 *
 * A DA.live spreadsheet is an Excel document served as JSON on the CDN. It has no
 * `.plain.html` version, so the HTML copy path cannot see it, and a cross-org copy
 * cannot use the DA.live admin API at all because there is no auth for the SOURCE
 * org. Both facts force the same shape: read the public CDN JSON, convert it to an
 * HTML table, and POST that to the destination, where DA.live turns it back into a
 * sheet.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-09-10 — 1,157 lines against a
 * 400-line service limit, and coupled. This pair is the cleanest seam in that file:
 * it uses nothing else in the class, and nothing else in the class uses it beyond
 * two call sites. Dependencies arrive as parameters (ADR-015); the class keeps its
 * public API and delegates.
 *
 * The 401 behaviour is load-bearing and unchanged: it THROWS rather than returning
 * false, so the caller can pause and prompt for re-auth instead of logging a failure
 * the user cannot act on.
 *
 * @module features/eds/services/daLive/daLiveSpreadsheetCopy
 */

import { DaLiveAuthError } from '../types';
import type { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL, normalizePath } from './daLiveConstants';
import { convertSpreadsheetJsonToHtml } from './daLiveSpreadsheetUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Is this path a spreadsheet?
 *
 * Spreadsheets are served as JSON; HTML pages 404 on the same URL. There is no
 * cheaper signal — the path carries no extension, which is exactly why the probe
 * exists.
 *
 * @param baseUrl - the CDN origin to probe against
 * @param path - the extensionless content path
 * @returns true only when the URL answers with `application/json`
 */
export async function isSpreadsheetPath(baseUrl: string, path: string): Promise<boolean> {
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
 * Copy one spreadsheet from source to destination.
 *
 * Fetches JSON from the public CDN and converts it to an HTML table for upload —
 * the admin API is unavailable for cross-org copies because there is no auth
 * against the source org.
 *
 * @throws DaLiveAuthError on a 401, so the caller can pause and prompt for re-auth
 * @returns false for every other failure; this step is not fatal to a copy run
 */
export async function copySpreadsheetFile(
    deps: { apiClient: DaLiveApiClient; logger: Logger },
    token: string,
    source: { org: string; site: string },
    sourcePath: string,
    destination: { org: string; site: string },
    destPath: string,
): Promise<boolean> {
    const { apiClient, logger } = deps;

    // Fetch JSON from public CDN (works without auth for any org)
    const sourceUrl = `https://main--${source.site}--${source.org}.aem.live${sourcePath}.json`;

    try {
        const sourceResponse = await fetch(sourceUrl, {
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });

        if (!sourceResponse.ok) {
            logger.warn(
                `[DA.live] Failed to fetch spreadsheet JSON ${sourcePath}: ${sourceResponse.status}`,
            );
            return false;
        }

        const jsonData = await sourceResponse.json();

        // Convert JSON to HTML table format that DA.live can process
        const htmlContent = convertSpreadsheetJsonToHtml(jsonData);
        if (!htmlContent) {
            logger.warn(`[DA.live] Failed to convert spreadsheet ${sourcePath} to HTML`);
            return false;
        }

        // Upload as HTML to destination DA.live (will be converted to sheet)
        const destNormalizedPath = normalizePath(destPath);
        const destUrl = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}/${destNormalizedPath}.html`;

        // DA.live write via the shared client (retry + fresh FormData per
        // attempt; page-level 429 tolerance).
        const response = await apiClient.fetchWithRetry(
            destUrl,
            () => {
                const formData = new FormData();
                formData.append('data', new Blob([htmlContent], { type: 'text/html' }));
                return {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                };
            },
            { rateLimit: 'return' },
        );

        if (response.ok) {
            logger.info(`[DA.live] Copied spreadsheet ${sourcePath}`);
            return true;
        }

        // Token expired — throw so caller can pause-and-prompt for re-auth
        if (response.status === 401) {
            throw new DaLiveAuthError('DA.live token expired during spreadsheet copy');
        }

        logger.warn(`[DA.live] Failed to upload spreadsheet ${destPath}: ${response.status}`);
        return false;
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        logger.error(`[DA.live] Spreadsheet copy error for ${destPath}`, error as Error);
        return false;
    }
}
