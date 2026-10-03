/**
 * Helix operations on a site's CODE and CDN cache — the GitHub side, no DA.live content.
 *
 * `previewCode` syncs a file from GitHub to the CDN (config.json after an
 * update); `purgeCacheAll` invalidates every cached page. Neither reads authored
 * content, so both authenticate with the GitHub token plus the optional admin
 * Bearer a protected site requires — never the content-source credential.
 *
 * Extracted from `helixService.ts` on 2026-10-03 (EDS-8, its fourth cut). The
 * facade keeps both methods with their signatures and delegates here.
 *
 * @module features/eds/services/helix/helixCodeOperations
 */

import type { HelixAdminAuth } from './helixAdminAuth';
import { ADMIN_API_401_MESSAGE, getXError, throwCredentialRefused } from './helixAdminErrors';
import { buildPartitionUrl, normalizeWebPath as normalizeHelixPath } from './helixApiClient';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Backoff (ms) before each `previewCode` retry after a 400 from Helix Admin.
 * A 400 immediately after a push means Helix's code mirror hasn't indexed the
 * new commit yet; it typically catches up in <10s, so 3 retries at 1s/3s/7s
 * (~11s total) span that window. Only 400 retries — other statuses throw at once.
 */
const PREVIEW_RETRY_DELAYS_MS = [1000, 3000, 7000];

/** What a code or cache operation needs: the credential seam and somewhere to log. */
interface CodeOperationDeps {
    auth: HelixAdminAuth;
    logger: Logger;
}

/**
 * Purge all cached content from the live CDN
 *
 * Use this before publishing when recreating a site with the same name,
 * or when resetting/republishing to ensure stale content is cleared.
 *
 * This is especially important when:
 * - A site was deleted and recreated with the same name
 * - Reset to template operations
 * - Republishing after content source changes
 *
 * The purge request is sent to all CDN edge nodes, but propagation
 * may take a few seconds to complete globally.
 *
 * @param deps - credential seam and logger
 * @param org - Organization/owner name
 * @param site - Site/repository name
 * @param branch - Branch name
 * @throws Error on access denied (403) or network error
 */
export async function purgeCacheAll(
    deps: CodeOperationDeps,
    org: string,
    site: string,
    branch: string,
): Promise<void> {
    const { logger } = deps;
    const token = await deps.auth.getGitHubToken();
    const url = buildPartitionUrl('cache', org, site, branch, '/*');

    logger.debug(`[Helix] Purging all cached content: ${url}`);

    // Cache purge only needs GitHub token (x-auth-token) for caller auth.
    // No x-content-source-authorization needed — cache operations don't
    // access DA.live content, they only invalidate the CDN cache layer.
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...(await deps.auth.tryAdminBearer()),
            'x-auth-token': token,
        },
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    // 404 is acceptable (nothing cached yet)
    if (response.status === 404) {
        logger.debug('[Helix] No cached content to purge (404)');
        return;
    }

    // 401 is authentication failure
    if (response.status === 401) {
        throw new Error(ADMIN_API_401_MESSAGE);
    }

    // 403 is access denied
    if (response.status === 403) {
        throw new Error('Access denied. You do not have permission to purge this site cache.');
    }

    if (!response.ok) {
        throw new Error(`Failed to purge cache: ${response.status} ${response.statusText}`);
    }

    logger.debug('[Helix] Successfully purged all cached content');
}

/**
 * Preview a code file (sync from GitHub to CDN)
 *
 * This triggers the Helix Admin to fetch code from GitHub
 * and make it available on the CDN. Used for config files
 * like config.json that need to be refreshed after updates.
 *
 * Unlike content preview, code preview only requires GitHub auth
 * (no DA.live token needed since code comes from GitHub).
 *
 * @param deps - credential seam and logger
 * @param org - Organization/owner name
 * @param site - Site/repository name
 * @param path - File path (e.g., '/config.json')
 * @param branch - Branch name
 * @throws Error on access denied (403) or network error
 *
 * Retries on 400 only (up to {@link PREVIEW_RETRY_DELAYS_MS}.length times):
 * a 400 right after a push means Helix's code mirror hasn't indexed the new
 * commit yet, and it usually catches up within the backoff window. Every
 * other status keeps its immediate-throw semantics.
 */
export async function previewCode(
    deps: CodeOperationDeps,
    org: string,
    site: string,
    path: string,
    branch: string,
): Promise<void> {
    const { logger } = deps;
    const githubToken = await deps.auth.getGitHubToken();
    const cleanPath = normalizeHelixPath(path);
    const url = buildPartitionUrl('code', org, site, branch, cleanPath);

    logger.debug(`[Helix] Previewing code: ${url}`);

    // retryIndex 0 = initial attempt; 1..N = retries after a 400.
    for (let retryIndex = 0; ; retryIndex++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...(await deps.auth.tryAdminBearer()),
                'x-auth-token': githubToken,
            },
            // Fresh timeout signal per attempt — a reused signal from an
            // earlier attempt could already be aborted.
            signal: AbortSignal.timeout(TIMEOUTS.LONG),
        });

        if (response.status === 401) {
            throw new Error(ADMIN_API_401_MESSAGE);
        }

        if (response.status === 403) {
            await throwCredentialRefused(response, 'preview this code');
        }

        // Helix's code mirror hasn't caught up with the just-pushed commit
        // yet. Back off and retry; the mirror typically indexes within ~10s.
        // A 400 also means "cannot fetch this code at all" (the App not
        // covering the repo, a bad fstab), and only `x-error` says which —
        // so it is logged on every attempt and carried into the final error.
        // Measured 2026-09-30: a fresh repo 400'd through every retry on two
        // publishes and this method reported nothing but "not caught up".
        const reason = getXError(response);
        if (response.status === 400 && retryIndex < PREVIEW_RETRY_DELAYS_MS.length) {
            const delayMs = PREVIEW_RETRY_DELAYS_MS[retryIndex];
            logger.debug(
                `[Helix] previewCode 400 on attempt ${retryIndex + 1} — ` +
                    `Helix mirror not caught up, retrying in ${delayMs}ms` +
                    (reason ? ` (x-error: ${reason})` : ''),
            );
            await sleep(delayMs);
            continue;
        }

        if (!response.ok) {
            throw new Error(
                `Failed to preview code: ${response.status} ${response.statusText}` +
                    (reason ? ` — ${reason}` : ''),
            );
        }

        logger.debug(`[Helix] Successfully previewed code: ${cleanPath}`);
        return;
    }
}
