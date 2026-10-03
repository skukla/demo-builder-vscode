/**
 * Removing pages from a site's preview and live CDN partitions.
 *
 * The DELETE half of the Helix page operations: one resource from one partition
 * (with 429 back-off), and the page-by-page unpublish of many paths from both
 * partitions in rate-limited batches. Every DELETE carries the DA.live Bearer
 * alone — the only credential the Admin API accepts while the content source
 * still exists in fstab.yaml (ADR-002; {@link HelixAdminAuth.getDeleteAuthHeaders}).
 *
 * Extracted from `helixService.ts` on 2026-10-03 (EDS-8, its fourth cut). The
 * facade keeps `deletePreview`, `unpublishPage` and `unpublishPages` with their
 * signatures and delegates here.
 *
 * @module features/eds/services/helix/helixPageDeletion
 */

import type { HelixAdminAuth } from './helixAdminAuth';
import { captureErrorDetail } from './helixAdminErrors';
import { buildPartitionUrl, normalizeWebPath as normalizeHelixPath } from './helixApiClient';
import { runInBatches } from '@/core/utils/promiseUtils';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Max concurrent DELETE requests per batch.
 * Helix Admin API enforces 10 req/s per project — batching at 5 keeps
 * well under the limit even with sequential live + parallel preview DELETEs.
 */
const HELIX_DELETE_BATCH_SIZE = 5;

/** Max retry attempts for 429 Too Many Requests responses */
const HELIX_RATE_LIMIT_MAX_RETRIES = 3;

/** What a DELETE needs: the credential seam and somewhere to log. */
interface PageDeletionDeps {
    auth: HelixAdminAuth;
    logger: Logger;
}

/** The outcome of unpublishing many paths; see {@link unpublishPages}. */
export interface UnpublishPagesResult {
    success: boolean;
    count: number;
    total: number;
    liveFailed: number;
    previewFailed: number;
}

/**
 * Delete a resource from preview or live CDN partition.
 * Shared implementation for deletePreview and unpublishPage.
 *
 * Uses DA.live Bearer token auth which bypasses the "source exists" restriction.
 * See `HelixAdminAuth.getDeleteAuthHeaders()` for auth strategy details.
 *
 * @returns `{ success }` — false on auth failure (401/403)
 */
export async function deleteResource(
    deps: PageDeletionDeps,
    partition: 'live' | 'preview',
    org: string,
    site: string,
    path: string,
    branch: string,
    retryCount: number = 0,
): Promise<{ success: boolean }> {
    const { logger } = deps;
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl(partition, org, site, branch, cleanPath);
    const action = partition === 'live' ? 'Unpublishing' : 'Deleting preview';
    const successLog = partition === 'live' ? 'Unpublished' : 'Preview deleted';
    const errorPrefix = partition === 'live' ? 'unpublish' : 'delete preview';

    logger.debug(`[Helix] ${action}: ${url}`);

    const headers = await deps.auth.getDeleteAuthHeaders();
    const response = await fetch(url, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(TIMEOUTS.LONG),
    });

    if (response.status === 401 || response.status === 403) {
        const detail = await captureErrorDetail(response);
        logger.warn(`[Helix] ${action} failed (${response.status}): ${detail}`);
        return { success: false };
    }
    if (response.status === 429) {
        if (retryCount >= HELIX_RATE_LIMIT_MAX_RETRIES) {
            throw new Error(`Rate limited after ${retryCount} retries: ${partition} ${cleanPath}`);
        }
        const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10);
        const waitMs = Math.min(retryAfter * 1000, 30000);
        logger.warn(
            `[Helix] Rate limited on ${partition} ${cleanPath}, ` +
                `retrying after ${retryAfter}s (attempt ${retryCount + 1}/${HELIX_RATE_LIMIT_MAX_RETRIES})`,
        );
        await sleep(waitMs);
        return deleteResource(deps, partition, org, site, path, branch, retryCount + 1);
    }
    if (response.status === 204 || response.status === 404) {
        logger.debug(`[Helix] ${successLog}: ${cleanPath}`);
        return { success: true };
    }
    if (!response.ok) {
        throw new Error(`Failed to ${errorPrefix}: ${response.status} ${response.statusText}`);
    }
    return { success: true };
}

/**
 * Unpublish pages from both live and preview CDN.
 *
 * Uses page-by-page DELETE with DA.live Bearer token authentication,
 * which bypasses the "source exists" restriction. No need to manipulate
 * fstab.yaml or Configuration Service config before unpublishing.
 *
 * See ADR-002 for auth strategy investigation history.
 *
 * @param deps - credential seam and logger
 * @param org - GitHub organization/owner
 * @param site - GitHub repository name
 * @param branch - Branch name
 * @param webPaths - Web paths to unpublish (e.g., ['/about', '/products'])
 * @returns Whether unpublish succeeded and count processed
 */
export async function unpublishPages(
    deps: PageDeletionDeps,
    org: string,
    site: string,
    branch: string,
    webPaths: string[],
): Promise<UnpublishPagesResult> {
    if (webPaths.length === 0) {
        return { success: true, count: 0, total: 0, liveFailed: 0, previewFailed: 0 };
    }

    deps.logger.info(`[Helix] Unpublishing ${webPaths.length} pages (page-by-page)`);

    // Delete live and preview CDN entries in batches to respect rate limits
    const liveResults = await runInBatches(
        webPaths,
        HELIX_DELETE_BATCH_SIZE,
        async (path) => (await deleteResource(deps, 'live', org, site, path, branch)).success,
    );
    const liveCount = liveResults.filter(Boolean).length;

    const previewResults = await runInBatches(
        webPaths,
        HELIX_DELETE_BATCH_SIZE,
        async (path) => (await deleteResource(deps, 'preview', org, site, path, branch)).success,
    );
    const previewCount = previewResults.filter(Boolean).length;

    deps.logger.info(
        `[Helix] Unpublish complete: ${liveCount}/${webPaths.length} live, ${previewCount}/${webPaths.length} preview`,
    );
    // `success` and `count` keep their meanings: the DELETE path asks "did we
    // manage to unpublish anything", and best-effort cleanup is the right
    // question there. The RESET path needs the other one — "did everything go"
    // — and could not ask it, because `success` is true when ONE path of 52
    // succeeds and `count` folds live and preview together with Math.max.
    //
    // A reset where all 52 live deletes 403'd therefore reported success while
    // the stale pages kept serving. `liveFailed` is the count users feel: the
    // live entry is what the CDN serves.
    return {
        success: liveCount > 0 || previewCount > 0,
        count: Math.max(liveCount, previewCount),
        total: webPaths.length,
        liveFailed: webPaths.length - liveCount,
        previewFailed: webPaths.length - previewCount,
    };
}
