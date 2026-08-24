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
 * @module features/eds/services/patches/externalPatchFetcher
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

/** Resolved git ref per `owner/repo`. Only successful tag resolutions are
 *  cached — see {@link resolveRef}. */
const refCache = new Map<string, Promise<string>>();

/** Branch used when a patches repo has no published release yet. */
const UNPINNED_REF = 'main';

/**
 * Resolve which git ref to read patches from.
 *
 * Prefers the repo's latest published release, so shipping a patch is a
 * deliberate act with a record and a rollback target. Falls back to `main` when
 * no release exists — without that fallback this change would take every
 * storefront build down until the first release is cut, since no patches repo
 * has one today.
 *
 * A fallback is never cached: a transient failure on the release lookup must
 * not leave the channel unpinned for the rest of the session.
 *
 * Exported as the ONE ref authority for the patches repo: `readLkgSha`
 * (lkgReader) resolves through this too, so the ledger and the LKG pointer
 * always come from the same snapshot — a release freezes both together, and
 * the main fallback tracks both together. Split refs meant release-day
 * ledgers applied against a daily-advancing canonical.
 */
export async function resolvePatchRef(
    owner: string,
    repo: string,
    logger: Logger,
): Promise<string> {
    const key = `${owner}/${repo}`;
    const cached = refCache.get(key);
    if (cached) return cached;

    const pending = (async () => {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
                { signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK) },
            );
            if (response.ok) {
                const data = (await response.json()) as { tag_name?: string };
                if (data?.tag_name) return data.tag_name;
            }
        } catch {
            // Fall through to the unpinned path — reported below.
        }
        return '';
    })();

    const tag = await pending;
    if (tag) {
        refCache.set(key, Promise.resolve(tag));
        logger.info(`[Patch] Pinned ${key} to release ${tag}`);
        return tag;
    }

    logger.warn(
        `[Patch] No published release for ${key} — falling back to ${UNPINNED_REF}. `
            + `Patches are unpinned until a release is cut.`,
    );
    return UNPINNED_REF;
}

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

    const promise = (async () => {
        const ref = await resolvePatchRef(source.owner, source.repo, logger);
        const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${ref}/${source.path}/${fileName}`;
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
    refCache.clear();
}
