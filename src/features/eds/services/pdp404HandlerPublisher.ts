/**
 * Smart 404 PDP handler installation — vendors the snippet into a storefront repo.
 *
 * Writes `scripts/delayed.js` (the recovery handler) plus the eager redirect in
 * `head.html` and `404.html`, through the GitHub Contents API. The snippet text
 * itself is authored in `./pdp404Snippet`, which has no I/O.
 *
 * Re-exports the authoring helpers so existing consumers and tests keep their
 * import path.
 */

import { GitHubFileOperations, isStaleShaFailure } from './githubFileOperations';
import {
    buildSmart404Snippet,
    derivePrepublishUrl,
    extractCspNonce,
    replaceMarkedBlock,
    SMART_404_HEAD_MARKER_START,
    SMART_404_HEAD_SNIPPET_TEMPLATE,
    SMART_404_MARKER_END,
    SMART_404_MARKER_START,
} from './pdp404Snippet';
import type { Logger } from '@/types/logger';

export {
    buildSmart404Snippet,
    derivePrepublishUrl,
    extractCspNonce,
} from './pdp404Snippet';

/**
 * Outcome of a single install attempt. Surfaces in the pipeline log
 * and is asserted by the tests.
 */
export interface Pdp404InstallResult {
    installed: boolean;
    /** Set when installed=false to explain why the step was skipped. */
    reason?: string;
}

/**
 * Write the snippet into `scripts/delayed.js`, re-reading once on a stale SHA.
 *
 * Inspector Tagging contributes `scripts/delayed.js` to the bulk **Git Tree**
 * commit during block installation; this publisher reads it back through the
 * **Contents** API, which serves from a different path and can lag behind a
 * tree commit. A live run lost that race 18 seconds after the tree commit, and
 * because the step is non-fatal the storefront finished with no smart-404
 * handling and still reported Complete.
 *
 * Re-read and retry exactly once — enough for staleness and for a genuine
 * interleaving, while a second rejection stays a real failure rather than
 * becoming a poll loop inside storefront setup.
 *
 * Only SHA mismatches retry. Permission and missing-file failures are certain,
 * and retrying them just doubles the latency of a known outcome.
 *
 * Safe to repeat: the caller's `SMART_404_MARKER_START` check makes the snippet
 * idempotent, and the retry re-derives content from the freshly read file.
 */
async function writeDelayedJsWithStaleShaRetry(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    sha: string | undefined,
    initialContent: string,
    snippet: string,
    logger: Logger,
): Promise<void> {
    const commit = (content: string, withSha: string | undefined) =>
        githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'scripts/delayed.js',
            content,
            'chore(demo-builder): vendor smart 404 PDP handler into delayed.js',
            withSha,
        );

    try {
        await commit(initialContent, sha);
    } catch (error) {
        if (!isStaleShaFailure(error)) throw error;

        logger.info(
            '[PDP404] delayed.js changed under us (stale SHA) — re-reading and retrying once',
        );
        const fresh = await githubFileOps.getFileContent(repoOwner, repoName, 'scripts/delayed.js');
        if (!fresh?.content) throw error;
        if (fresh.content.includes(SMART_404_MARKER_START)) return;
        await commit(fresh.content + snippet, fresh.sha);
    }
}

/**
 * Install the smart 404 handler for one storefront.
 *
 * Called from the two places that modify the storefront's GitHub repo
 * — `storefrontSetupPhase2.ts` (create/edit) and `edsResetRepoHelper.ts`
 * (reset) — alongside `installInspectorTagging`. Both operations share
 * the same shape: vendor a small JS file into the storefront's code.
 * Both run before the surrounding pipeline's bulk Helix code preview,
 * which picks up the committed change and makes it live.
 *
 * Non-fatal at every step: any genuine failure is logged and the function
 * returns `{ installed: false, reason }`. An ALREADY-installed handler is a
 * success and returns `{ installed: true, reason: 'already installed' }`. The
 * storefront still works
 * without the smart 404 — visitors hitting cold PDPs just get the
 * default Helix 404 page. We never want this step to break a create,
 * edit, or reset.
 *
 * Skip cases:
 *   - BYOM disabled (`overlayUrl` is `undefined`): nothing to install.
 *   - Overlay URL doesn't parse or doesn't have the expected shape:
 *     can't derive the trigger URL.
 *   - `scripts/delayed.js` doesn't exist in the storefront: log warning,
 *     skip (the storefront isn't an EDS storefront we recognize).
 *   - Snippet marker already present: idempotent skip (already installed).
 *   - GitHub commit fails (network, auth): log and skip.
 */
export async function installSmart404Handler(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    overlayUrl: string | undefined,
    logger: Logger,
    daLiveOrg: string,
    daLiveSite: string,
): Promise<Pdp404InstallResult> {
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

    // Read the storefront's existing `scripts/delayed.js`. If absent, the
    // storefront doesn't have the EDS delayed-load module and we have
    // nowhere to vendor into — skip with a warning rather than create the
    // file ourselves (we don't know the right surrounding boilerplate).
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, 'scripts/delayed.js');
    if (!existing?.content) {
        logger.warn('[PDP404] scripts/delayed.js not found — skipping smart 404 install');
        return { installed: false, reason: 'delayed.js missing' };
    }

    const snippet = buildSmart404Snippet(triggerUrl, daLiveOrg, daLiveSite);

    // Vendor the snippet. When a prior block is already present, RE-VENDOR it
    // in place (replace between the markers) instead of skipping — so snippet
    // behavior changes (e.g. the missing-SKU → native /404 redirect) reach
    // existing storefronts on their next reset. The commit is skipped only when
    // the rebuilt block is byte-identical, keeping no-op resets churn-free.
    let newContent: string;
    if (existing.content.includes(SMART_404_MARKER_START)) {
        const replaced = replaceMarkedBlock(
            existing.content,
            SMART_404_MARKER_START,
            SMART_404_MARKER_END,
            snippet,
        );
        if (replaced === null || replaced === existing.content) {
            logger.info('[PDP404] Smart 404 snippet already current in delayed.js — skipping');
            // installed: TRUE. The flag means "the handler is in place after this
            // call", not "I wrote it this run" — every consumer gates on
            // `!installed` to decide whether the storefront is MISSING recovery.
            // Reporting false here made a healthy storefront print "the smart-404
            // handler was not installed (already installed)" and a clean run
            // finish WITH ERRORS (observed 2026-08-14 on skukla/demo-builder-test).
            // The reason is kept so a caller can still tell the two ways of being
            // installed apart.
            return { installed: true, reason: 'already installed' };
        }
        newContent = replaced;
        logger.info('[PDP404] Re-vendoring updated smart 404 snippet into delayed.js');
    } else {
        newContent = existing.content + snippet;
    }

    try {
        await writeDelayedJsWithStaleShaRetry(
            githubFileOps, repoOwner, repoName, existing.sha, newContent, snippet, logger,
        );
        logger.info(
            `[PDP404] Vendored smart 404 snippet into scripts/delayed.js (${repoOwner}/${repoName})`,
        );
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(`[PDP404] GitHub commit failed: ${reason} — skipping smart 404 install`);
        return { installed: false, reason: `GitHub commit failed: ${reason}` };
    }

    // Vendor the eager mixed-case redirect into head.html. Non-fatal at
    // every step: a failure here means the user still gets the slower
    // path (delayed.js handles it after ~1-2s) but the storefront still
    // works. We log and continue rather than report install failure for
    // the whole handler.
    await installSmart404HeadRedirect(githubFileOps, repoOwner, repoName, logger);

    // Vendor the same eager redirect into the storefront's static
    // 404.html file. Helix serves this file on 404 responses for
    // unknown paths (NOT the authored /404 page in DA.live — that's
    // only used for direct /404 GETs). Without this, the mixed-case
    // PDP 404 → eager-redirect flow never fires because the served
    // 404 page bypasses head.html entirely.
    await installSmart404On404HtmlFile(githubFileOps, repoOwner, repoName, logger);

    return { installed: true };
}

/**
 * Vendor the eager mixed-case redirect script into `head.html`. Same
 * shape as the delayed.js install: read, idempotent-check, commit.
 *
 * Non-fatal at every step. Failures degrade the UX (visible 404 flash
 * persists until `delayed.js` fires) but never break the storefront.
 */
/**
 * Vendor the eager redirect into the storefront's static `404.html`
 * file. Helix serves this file on 404 responses for unknown paths,
 * bypassing `head.html` entirely — so the same snippet that's in
 * head.html needs to be in 404.html as well.
 *
 * Same shape as `installSmart404HeadRedirect`: read, idempotent-check,
 * extract nonce, commit. Inserts the snippet right before `</head>`
 * so it runs as part of head parsing (synchronous, before body paint).
 *
 * Non-fatal at every step. Failures degrade the UX (mixed-case URLs
 * still show the visible Helix-default 404 page until delayed.js
 * fires, ~1-2s later) but never break the storefront.
 */
async function installSmart404On404HtmlFile(
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<void> {
    const existing = await githubFileOps.getFileContent(repoOwner, repoName, '404.html');
    if (!existing?.content) {
        logger.warn('[PDP404] storefront 404.html not found — skipping eager redirect on 404.html');
        return;
    }
    if (existing.content.includes(SMART_404_HEAD_MARKER_START)) {
        logger.info('[PDP404] Eager redirect already present in 404.html — skipping');
        return;
    }
    const nonce = extractCspNonce(existing.content);
    if (!nonce) {
        logger.warn(
            '[PDP404] 404.html has no nonced script tag — skipping eager redirect on 404.html (delayed.js fallback still active)',
        );
        return;
    }
    const snippet = SMART_404_HEAD_SNIPPET_TEMPLATE.replace(/__NONCE__/g, nonce);
    // Insert before </head> so the snippet runs during head parsing,
    // before any body paint. If </head> is missing for any reason,
    // append at the end as a safe fallback.
    const headClose = existing.content.lastIndexOf('</head>');
    const newContent =
        headClose >= 0
            ? existing.content.slice(0, headClose) + snippet + existing.content.slice(headClose)
            : existing.content + snippet;
    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            '404.html',
            newContent,
            'chore(demo-builder): vendor smart 404 eager redirect into 404.html',
            existing.sha,
        );
        logger.info(
            `[PDP404] Vendored eager redirect into 404.html (${repoOwner}/${repoName}, nonce="${nonce}")`,
        );
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(
            `[PDP404] 404.html commit failed: ${reason} — eager redirect not installed on 404.html (delayed.js fallback still active)`,
        );
    }
}

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
    if (existing.content.includes(SMART_404_HEAD_MARKER_START)) {
        logger.info('[PDP404] Eager redirect already present in head.html — skipping');
        return;
    }
    // Detect the CSP nonce from an existing nonced script. If none is
    // found, the storefront either doesn't use CSP nonces or our
    // detector can't recognize the convention — either way, we can't
    // be sure our inline script will execute, so skip rather than
    // ship a snippet that will be silently blocked.
    const nonce = extractCspNonce(existing.content);
    if (!nonce) {
        logger.warn(
            '[PDP404] head.html has no nonced script tag — skipping eager redirect (delayed.js fallback still active)',
        );
        return;
    }
    const snippet = SMART_404_HEAD_SNIPPET_TEMPLATE.replace(/__NONCE__/g, nonce);
    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner,
            repoName,
            'head.html',
            existing.content + snippet,
            'chore(demo-builder): vendor smart 404 eager redirect into head.html',
            existing.sha,
        );
        logger.info(
            `[PDP404] Vendored eager redirect into head.html (${repoOwner}/${repoName}, nonce="${nonce}")`,
        );
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        logger.warn(
            `[PDP404] head.html commit failed: ${reason} — eager redirect not installed (delayed.js fallback still active)`,
        );
    }
}
