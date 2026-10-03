/**
 * Duplicate a whole DA.live site tree under a new site name, in one request.
 *
 * A different operation from the page-by-page copy in `daLiveContentCopy.ts`:
 * DA.live to DA.live (not CDN to DA.live), one server-side `POST /copy`, no
 * patching, no reference following. Used by the storefront name migration.
 *
 * Extracted from `daLiveContentCopy.ts` on 2026-10-03 (EDS-8, its third cut). The
 * class keeps `copyDaLiveSite` — it is public — and delegates here.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack
 * in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveSiteCopy
 */

import type { DaLiveApiClient } from './daLiveApiClient';
import { DA_LIVE_BASE_URL } from './daLiveConstants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** The outcome of a whole-site copy: success, or the failure with its status. */
export type SiteCopyResult = { success: true } | { success: false; error: string; status?: number };

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
 * @param deps - the DA.live client (for the IMS token) and the logger
 * @param srcOrg - source DA.live org
 * @param srcSite - source DA.live site
 * @param dest - destination DA.live org (typically the source org) and site
 * @returns success or failure with status detail
 */
export async function copyDaLiveSite(
    deps: { apiClient: DaLiveApiClient; logger: Logger },
    srcOrg: string,
    srcSite: string,
    dest: { org: string; site: string },
): Promise<SiteCopyResult> {
    const token = await deps.apiClient.getImsToken();
    const url = `${DA_LIVE_BASE_URL}/copy/${srcOrg}/${srcSite}/`;
    const formData = new FormData();
    formData.append('destination', `/${dest.org}/${dest.site}/`);

    try {
        // Deliberately NOT via fetchWithRetry: one whole-site bulk copy on
        // a VERY_LONG timeout — auto-retrying 5xx here could triple a
        // multi-minute operation, and the reset flow that calls this owns
        // its own recovery.
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
            signal: AbortSignal.timeout(TIMEOUTS.VERY_LONG),
        });

        if (response.status === 204 || response.ok) {
            deps.logger.info(
                `[DA.live] Copied site ${srcOrg}/${srcSite} → ${dest.org}/${dest.site} (status=${response.status})`,
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
