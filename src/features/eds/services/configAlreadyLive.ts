/**
 * Is this config.json already where a sync would put it? (2026-10-15)
 *
 * A Configure Republish after a block library change syncs a config.json identical
 * to the one GitHub has and the live storefront serves: it pushed, previewed, then
 * waited for the edge — ~9s for nothing. This checks the end state instead of
 * assuming it: GitHub's copy is the same text, AND the live site answers the same
 * JSON. Either check failing (or not answering) means sync as before, so a CDN left
 * stale by an earlier run is still published.
 *
 * @module features/eds/services/configAlreadyLive
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** The same JSON, written however it was formatted. */
function sameJson(a: string, b: string): boolean {
    try {
        return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    } catch {
        return false;
    }
}

/**
 * Whether GitHub has this config.json already and the live storefront serves it.
 *
 * @param local - the config.json about to be synced
 * @param onGitHub - GitHub's copy, as `getFileContent` read it; null when absent
 * @param repoOwner - GitHub repository owner
 * @param repoName - GitHub repository name
 * @returns true only when both already match
 */
export async function configAlreadyLive(
    local: string,
    onGitHub: { content: string } | null,
    repoOwner: string,
    repoName: string,
): Promise<boolean> {
    if (onGitHub?.content !== local) return false;
    try {
        const response = await fetch(`https://main--${repoName}--${repoOwner}.aem.live/config.json`, {
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        return response.ok && sameJson(await response.text(), local);
    } catch {
        return false;
    }
}
