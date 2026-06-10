/**
 * Shared external-patch fetcher.
 *
 * Both {@link contentPatchRegistry} and {@link codePatchRegistry} fetch
 * `{file}.json` patch ledgers from a GitHub-hosted `eds-demo-patches`-style
 * repo with the same shape (`{ patches: T[] }`), the same per-source
 * caching, and the same failure-evicts-from-cache discipline. This module
 * is the one place that knows the HTTP shape + URL convention.
 *
 * Caching: the cache key is the full path (owner/repo/path/fileName), so
 * different file names (e.g. `patches.json` vs `code-patches.json`) for
 * the same source coexist without interference. On rejection the entry
 * is evicted so the next call retries from network.
 *
 * @module features/eds/services/externalPatchFetcher
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types';

/** Minimal shape both ContentPatchSource and CodePatchSource satisfy. */
interface PatchSourceLike {
    owner: string;
    repo: string;
    path: string;
}

interface PatchFetchResponse<T> {
    patches?: T[];
}

const sharedCache = new Map<string, Promise<unknown[]>>();

/**
 * Fetch an external patches-style JSON ledger with per-source caching.
 *
 * The expected file shape is `{ patches: T[] }`. Returns the `patches`
 * array (or `[]` if the field is missing). Throws on HTTP error or fetch
 * timeout — callers translate that into the appropriate non-applied
 * result + warning.
 *
 * @param source - `{owner, repo, path}` of the patches repo + family directory
 * @param fileName - File name within `path`, e.g. `'patches.json'` or `'code-patches.json'`
 * @param logger - Logger for `[Patch]` info/warn lines
 */
export function fetchExternalPatches<T>(
    source: PatchSourceLike,
    fileName: string,
    logger: Logger,
): Promise<T[]> {
    const cacheKey = `${source.owner}/${source.repo}/${source.path}/${fileName}`;
    const cached = sharedCache.get(cacheKey);
    if (cached) return cached as Promise<T[]>;

    logger.info(`[Patch] Fetching ${fileName} from ${source.owner}/${source.repo}`);
    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/${source.path}/${fileName}`;

    const promise = (async () => {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${fileName}: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as PatchFetchResponse<T>;
        return data.patches ?? [];
    })();

    sharedCache.set(cacheKey, promise as Promise<unknown[]>);
    promise.catch(() => sharedCache.delete(cacheKey));

    return promise;
}

/**
 * Test helper: clear the shared cache between tests.
 *
 * Not part of the production API. Test files for either patch registry
 * call this in `beforeEach` to avoid cross-test cache pollution.
 */
export function _clearExternalPatchCacheForTests(): void {
    sharedCache.clear();
}
