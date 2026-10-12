/**
 * Spreadsheet copy — the one content kind that cannot go through the normal path.
 *
 * A sheet is served as JSON on the CDN and has no `.plain.html` version, so the
 * HTML copy path cannot see it, and a cross-org copy cannot use the DA.live admin
 * API at all because there is no auth for the SOURCE org. So: read the public CDN
 * JSON, rebuild DA.live's own sheet document from it, and POST that to the
 * destination's `<path>.json`.
 *
 * It is written as a sheet because nothing else becomes one. Until 2026-10-12 this
 * posted an HTML table to `<path>.html`, on the belief that DA.live would turn it
 * back into a sheet. It never did: the result was served as a page and
 * `<path>.json` answered 404, which is why a storefront whose log said "Copied
 * spreadsheet /metadata" had no `/metadata.json` (EDS-40, measured on a scratch
 * storefront). The document shape lives in `daLiveSpreadsheetUtils`, shared with
 * the block library's sheet, which is the proof the shape is served.
 *
 * A sheet in DA.live is not served until it is previewed and published, and the
 * whole-site publish skips sheets. The caller collects {@link sheetWebPath} for
 * every sheet written here and the pipeline publishes that list by path.
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
import {
    buildSheetDocument,
    readServedSheets,
    type ServedSheet,
    type SheetRow,
} from './daLiveSpreadsheetUtils';
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
 * The web path a copied sheet is previewed and published at: `/metadata` is
 * served, and published, as `/metadata.json`.
 *
 * @param destPath - the extensionless content path the sheet was copied to
 */
export function sheetWebPath(destPath: string): string {
    return `/${normalizePath(destPath)}.json`;
}

/**
 * The most follow-up pages read for one sheet: the hard stop for a `total` the
 * server never delivers.
 */
const MAX_FOLLOW_UP_PAGES = 50;

/** One follow-up page of a sheet's rows, or null when it cannot be read. */
async function readSheetPage(pageUrl: string): Promise<SheetRow[] | null> {
    const response = await fetch(pageUrl, { signal: AbortSignal.timeout(TIMEOUTS.NORMAL) });
    if (!response.ok) return null;
    // A sheet asked for by name comes back alone, in single-sheet form.
    const page = readServedSheets(await response.json());
    return page?.length === 1 ? page[0].rows : null;
}

/**
 * Read the rest of a sheet whose first response was only a page of it.
 *
 * The CDN pages a sheet: `total` is the whole sheet and `data` the rows of this
 * page. Follow-up pages are asked for with `offset` and `limit`, and with
 * `sheet=<name>` for a sheet of a multi-sheet document. Those parameter names are
 * the ones the served fields and the storefront's own `?sheet=data` request show;
 * the paged request itself was NOT measured against a live site when this was
 * written (2026-10-12), so every way it can go wrong ends the loop: an unreadable
 * page, an empty page, or {@link MAX_FOLLOW_UP_PAGES}. The sheet is then copied
 * with the rows in hand and the shortfall is logged.
 *
 * Replaces `sheet.rows` with the longer list.
 */
async function readRemainingRows(
    logger: Logger,
    sheetUrl: string,
    sheet: ServedSheet,
): Promise<void> {
    const pageSize = sheet.rows.length;
    const selector = sheet.sheetParam ? `sheet=${encodeURIComponent(sheet.sheetParam)}&` : '';
    for (let page = 0; page < MAX_FOLLOW_UP_PAGES && sheet.rows.length < sheet.total; page++) {
        const rows = await readSheetPage(
            `${sheetUrl}?${selector}offset=${sheet.rows.length}&limit=${pageSize}`,
        );
        if (!rows || rows.length === 0) break;
        sheet.rows = [...sheet.rows, ...rows];
    }
    if (sheet.rows.length < sheet.total) {
        logger.warn(
            `[DA.live] Sheet "${sheet.name}" of ${sheetUrl} copied short: ` +
                `${sheet.rows.length} of ${sheet.total} rows`,
        );
    }
}

/**
 * Copy one spreadsheet from source to destination, as a sheet.
 *
 * Fetches JSON from the public CDN (the admin API is unavailable for cross-org
 * copies because there is no auth against the source org) and writes DA.live's
 * native sheet document, with every sheet the source has and every page of each,
 * to `<destPath>.json`.
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

        const sheets = readServedSheets(await sourceResponse.json());
        if (!sheets) {
            logger.warn(`[DA.live] Source JSON for ${sourcePath} is not a spreadsheet`);
            return false;
        }
        for (const sheet of sheets) {
            if (sheet.rows.length > 0 && sheet.rows.length < sheet.total) {
                await readRemainingRows(logger, sourceUrl, sheet);
            }
        }
        const sheetJson = JSON.stringify(buildSheetDocument(sheets));

        // A sheet lives at <path>.json. Posted to <path>.html it is stored, and
        // served, as a page.
        const destSite = `${DA_LIVE_BASE_URL}/source/${destination.org}/${destination.site}`;
        const destUrl = `${destSite}${sheetWebPath(destPath)}`;

        // DA.live write via the shared client (retry + fresh FormData per
        // attempt; page-level 429 tolerance).
        const response = await apiClient.fetchWithRetry(
            destUrl,
            () => {
                const formData = new FormData();
                formData.append('data', new Blob([sheetJson], { type: 'application/json' }));
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
