/**
 * Smart 404 handler installation — the writes outside `404.html`.
 *
 * The recovery script lives inline in the storefront code's `404.html` (since
 * 2026-10-29; `pdp404Page.ts` says why and places it), and `bringStorefrontUpToDate`
 * writes that file once with everything it needs. This module does the rest, through
 * the GitHub Contents API:
 *  - builds the storefront's script and keeps the eager script in `head.html` current
 *    (`prepareSmart404Handler`);
 *  - takes Demo Builder's old copy out of `scripts/delayed.js` once the one in
 *    `404.html` is in place (`retireDelayedJsHandler`).
 *
 * The script text is authored in `./pdp404Snippet`, which has no I/O.
 */

import { GitHubFileOperations, isStaleShaFailure } from '../github/githubFileOperations';
import { eagerBlock, withCurrentBlock, withoutDelayedJsHandler } from './pdp404Page';
import { buildSmart404Snippet, derivePrepublishUrl } from './pdp404Snippet';
import type { Logger } from '@/types/logger';

export { derivePrepublishUrl } from './pdp404Snippet';

/**
 * Whether a storefront has the recovery script after an install. Surfaces in the
 * pipeline log and the setup/reset reports.
 */
export interface Pdp404InstallResult {
    installed: boolean;
    /** Set when installed=false to explain why. */
    reason?: string;
}

/** The recovery script for one storefront, or why it has none. */
export type Smart404Handler = { handler: string } | { installed: false; reason: string };

const DELAYED_JS = 'scripts/delayed.js';

/**
 * Build the storefront's recovery script, and keep the eager script in `head.html`
 * current. Writing the script into `404.html` is `bringStorefrontUpToDate`'s job.
 *
 * Called from the one step creation, reset and a tested-boilerplate update share
 * (`bringStorefrontUpToDate`). Non-fatal: a storefront without the script still works,
 * and a visitor to a cold page gets the plain 404.
 *
 * No script when BYOM is off (no `overlayUrl`) or the overlay URL does not name a
 * `render-pdp` action to derive `prepublish-pdp` from.
 */
export async function prepareSmart404Handler(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Promise<Smart404Handler> {
    if (!overlayUrl) {
        logger.info('[PDP404] BYOM disabled (no overlayUrl) — skipping smart 404 install');
        return { installed: false, reason: 'BYOM disabled' };
    }

    const triggerUrl = derivePrepublishUrl(overlayUrl);
    if (!triggerUrl) {
        logger.warn(
            '[PDP404] Could not derive prepublish-pdp URL from overlay URL — skipping smart 404 install',
        );
        return { installed: false, reason: 'invalid overlay URL' };
    }

    // Non-fatal at every step: without it a mixed-case product link waits for the
    // recovery script instead of redirecting before paint.
    await installSmart404HeadRedirect(githubFileOps, repoOwner, repoName, logger);

    return { handler: buildSmart404Snippet(triggerUrl, daLiveOrg, daLiveSite) };
}

/**
 * Make the eager script in `head.html` current: read, add or swap the block, commit.
 *
 * Non-fatal at every step. Failures degrade the UX (a mixed-case product link is
 * lowercased later) but never break the storefront.
 */
async function installSmart404HeadRedirect(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<void> {
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, 'head.html');
    if (!existing?.content) {
        logger.warn('[PDP404] head.html not found — skipping eager redirect install');
        return;
    }
    const outcome = withCurrentBlock(existing.content, eagerBlock('head.html'));
    if (outcome.kind === 'current') {
        logger.info('[PDP404] Eager redirect already current in head.html — skipping');
        return;
    }
    if (outcome.kind === 'skipped') {
        logger.warn(`[PDP404] Eager redirect not added to head.html: ${outcome.reason}`);
        return;
    }
    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'head.html',
            outcome.html,
            'chore(demo-builder): vendor smart 404 eager redirect into head.html',
            existing.sha,
        );
        logger.info(`[PDP404] Vendored eager redirect into head.html (${repoOwner}/${repoName})`);
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(
            `[PDP404] head.html commit failed: ${reason} — eager redirect not installed (the recovery script still runs)`,
        );
    }
}

/**
 * Take Demo Builder's old copy of the recovery script out of `scripts/delayed.js`, so it
 * never runs beside the one in `404.html`. Call it only once that one is in place.
 *
 * Nothing to do where there is no `delayed.js` (Adobe's B2B template removed it on
 * 2026-07-30) or no copy in it. A copy with no end marker is left alone and logged:
 * where it ends would be a guess. Never throws.
 *
 * @returns false when the copy is still there and should not be: the file could not be
 *   read, or the write was refused
 */
export async function retireDelayedJsHandler(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<boolean> {
    try {
        const existing = await githubFileOps.getFileContent(repoOwner, repoName, DELAYED_JS);
        if (!existing?.content) return true;
        const outcome = withoutDelayedJsHandler(existing.content);
        if (outcome.kind === 'half-marked') {
            logger.warn(
                '[PDP404] scripts/delayed.js has the old smart 404 block with no end marker — left as it is; take it out by hand',
            );
        }
        if (outcome.kind !== 'removed') return true;
        await writeDelayedJsWithStaleShaRetry(githubFileOps, repoOwner, repoName, existing.sha, outcome.content);
        logger.info(`[PDP404] Took the old smart 404 copy out of scripts/delayed.js (${repoOwner}/${repoName})`);
        return true;
    } catch (error) {
        logger.warn(
            `[PDP404] The old smart 404 copy in scripts/delayed.js was not taken out: ${(error as Error).message ?? 'unknown'}`,
        );
        return false;
    }
}

/**
 * Write delayed.js without the copy, re-reading once on a stale SHA.
 *
 * Inspector Tagging writes `scripts/delayed.js` in the block install's **Git Tree**
 * commit just before this runs; the **Contents** API, which this reads through, can
 * serve the file from before that commit. A live run lost that race 18 seconds after
 * the tree commit (2026-08). Re-read and retry exactly once — enough for staleness
 * and for a genuine interleaving, while a second rejection stays a real failure.
 * Only SHA mismatches retry: permission and missing-file failures are certain.
 */
async function writeDelayedJsWithStaleShaRetry(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    sha: string | undefined,
    content: string,
): Promise<void> {
    const commit = (body: string, withSha: string | undefined) =>
        githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            DELAYED_JS,
            body,
            'chore(demo-builder): move the smart 404 handler from delayed.js to 404.html',
            withSha,
        );
    try {
        await commit(content, sha);
    } catch (error) {
        if (!isStaleShaFailure(error)) throw error;
        const fresh = await githubFileOps.getFileContent(repoOwner, repoName, DELAYED_JS);
        if (!fresh?.content) throw error;
        const outcome = withoutDelayedJsHandler(fresh.content);
        if (outcome.kind !== 'removed') return;
        await commit(outcome.content, fresh.sha);
    }
}
