/**
 * Publishing the DA.live block library, and checking that it actually took.
 *
 * The publish and the verification are one unit because the publish alone is
 * not evidence: a bulk job that matched nothing reported success while every
 * block in the Insert-block palette failed to preview. Whoever changes the
 * publish must face the check that catches it lying.
 *
 * @module features/eds/handlers/blockLibraryPublish
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * The two Helix calls these two helpers make, out of a class with dozens.
 *
 * Declared structurally rather than as `HelixService` so a caller can hand in
 * exactly what gets used. The real service satisfies it, so both production
 * callers are unchanged — and a suite driving a caller no longer has to
 * `jest.mock` the service module to stop a construction it never asserts on
 * (ADR-016's mock wall).
 */
export interface LibraryPublishHelix {
    previewAndPublishPage(org: string, site: string, path?: string, branch?: string): Promise<void>;
    getResourceStatus(
        org: string,
        site: string,
        path: string,
        branch?: string,
    ): Promise<{ httpStatus: number; previewStatus?: number; liveStatus?: number; error?: string }>;
}

/** Library pages published concurrently per batch — the admin API is rate-sensitive. */
const LIBRARY_PUBLISH_BATCH = 5;

/**
 * Publish the block library, one page at a time.
 *
 * **The bulk API will not take these paths.** MEASURED against a live site
 * (skukla/team-bodea-demo, 2026-08-18), across two full runs of ~78 paths each:
 *
 *   bulk, relative paths (`.da/library/blocks/text`)   job succeeds, 0 previewed
 *   bulk, ABSOLUTE paths (`/.da/library/blocks/text`)  job succeeds, 0 previewed
 *   single page, `/.da/library/blocks/text`            404 -> 200
 *   single page, `.da/library/blocks/cards`            404 -> 200
 *
 * The bulk endpoint accepts them, creates a job, and polls clean —
 * `assertBulkResourcesSucceeded` finds nothing failed because it finds nothing at
 * all — then publishes none of them. A `.`-prefixed path presumably reads as
 * hidden to the job. Whatever the reason, it is not something the caller can fix
 * by sending better paths: the first fix here WAS better paths, and the spike
 * showed it changed nothing.
 *
 * So this uses the endpoint that works. It costs ~78 sequential calls instead of
 * one job, which is why they go out in batches — and it is the difference between
 * a block library that previews and one that lists blocks nobody can insert.
 *
 * Never throws for a page-level failure: one missing doc page must not cost the
 * other 77 blocks their preview. The count comes back so the caller can report it.
 *
 * @param helixService - Helix admin client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param paths - Library paths to publish
 * @param logger - Logger instance
 * @returns how many published and how many failed
 */
export async function publishLibraryPaths(
    helixService: LibraryPublishHelix,
    owner: string,
    repo: string,
    paths: string[],
    logger: Logger,
): Promise<{ published: number; failed: number }> {
    if (paths.length === 0) return { published: 0, failed: 0 };

    // Absolute, whatever the caller sent. The single-page endpoint normalises
    // this itself, but the producer's shape should be right regardless of who
    // consumes it.
    const absolute = paths.map((path) => (path.startsWith('/') ? path : `/${path}`));

    logger.debug(`[EDS] Publishing ${absolute.length} library paths`);

    let published = 0;
    const failures: string[] = [];

    for (let i = 0; i < absolute.length; i += LIBRARY_PUBLISH_BATCH) {
        const batch = absolute.slice(i, i + LIBRARY_PUBLISH_BATCH);
        const results = await Promise.allSettled(
            batch.map((path) => helixService.previewAndPublishPage(owner, repo, path)),
        );
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                published++;
            } else {
                failures.push(batch[index]);
            }
        });
    }

    if (failures.length > 0) {
        // Name what was dropped. A count with no paths sends the reader back to
        // the site to work out which blocks are missing.
        const sample = failures.slice(0, 5).join(', ');
        logger.warn(
            `[EDS] ${failures.length} of ${absolute.length} library paths failed to publish` +
                ` (first: ${sample}${failures.length > 5 ? ', ...' : ''})`,
        );
    }

    return { published, failed: failures.length };
}

/**
 * Did the block library actually become previewable?
 *
 * A bulk publish that reports success is not evidence. That is precisely how the
 * broken library shipped: the job accepted paths that matched nothing, reported
 * success, and the only log line said the library was published — while every
 * block in DA.live's Insert-block palette answered "It appears <block> has not
 * been previewed". Nothing between the two ever looked.
 *
 * This asks the same question the palette asks: is the blocks sheet on the
 * PREVIEW host? (`ew-block-library-modal.js` resolves a block through the admin
 * status API and requires `preview.status === 200`.) One HEAD, no credentials —
 * the preview CDN serves this path publicly.
 *
 * Never throws: a creation whose library may be perfectly fine must not fail on a
 * network blip. Unreachable and missing both report `false`, and the difference
 * is in the log.
 *
 * @param owner - GitHub owner (the site's org on the CDN)
 * @param repo - repository / site name
 * @param logger - logger for the warning
 * @returns true when the library sheet is previewed
 */
export async function verifyLibraryPreviewed(
    owner: string,
    repo: string,
    logger: Logger,
    helixService?: LibraryPublishHelix,
): Promise<boolean> {
    const path = '/.da/library/blocks.json';
    const url = `https://main--${repo}--${owner}.aem.page${path}`;
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        if (response.ok) {
            logger.debug(`[EDS] Block library verified previewed: ${url}`);
            return true;
        }
        logger.warn(
            `[EDS] Block library is not previewed (${response.status} for ${url}). ` +
                'Blocks will list in the DA.live Insert-block palette but fail to preview. ' +
                'Run "Demo Builder: Refresh Block Library" to republish it.',
        );
        // The CDN says it is missing; Helix knows WHY. One GET, and the reason
        // lands in the log the user pastes instead of in a session nobody kept.
        await logAdminVerdict(owner, repo, path, logger, helixService);
        return false;
    } catch (error) {
        logger.warn(
            `[EDS] Could not verify the block library preview: ${(error as Error).message}`,
        );
        return false;
    }
}

/**
 * Log what the admin API reports for a path the CDN could not serve.
 *
 * Separate from the check itself so the check stays a boolean: this only ever
 * writes to the log, and a missing `helixService` (headless callers, tests) skips
 * it rather than failing.
 */
async function logAdminVerdict(
    owner: string,
    repo: string,
    path: string,
    logger: Logger,
    helixService?: LibraryPublishHelix,
): Promise<void> {
    if (!helixService) return;
    const status = await helixService.getResourceStatus(owner, repo, path);
    logger.warn(
        `[EDS] Helix status for ${path}: HTTP ${status.httpStatus}` +
            `, preview ${status.previewStatus ?? 'none'}` +
            `, live ${status.liveStatus ?? 'none'}` +
            (status.error ? `, x-error: ${status.error}` : ''),
    );
}
