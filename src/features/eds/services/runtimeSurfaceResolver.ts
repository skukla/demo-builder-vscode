/**
 * Runtime-surface resolver — consumer half of ADR-008.
 *
 * The runtime-surface inventory (orphan content a demo needs but crawling can't
 * reach) is kept honest by a drift gate in the `eds-demo-patches` repo, which
 * regenerates each ledger's `runtime-surfaces.json` from the boilerplate code and
 * PRs on drift (producer half). This module is the consumer: it fetches that
 * generated file (the same way patch ledgers are fetched) and merges it ONTO the
 * static hand list, so a merged surface-drift PR reaches storefronts on their next
 * create/reset without a human editing `runtimeSurfaceInventory.ts`.
 *
 * Safety contract: the static hand list (`RUNTIME_SURFACES`) is always the floor.
 * The fetch is best-effort — any failure (offline, no source, malformed file)
 * falls back to the static inventory, i.e. exactly today's behavior. The generated
 * file can only ADD surfaces, never remove a hand-declared one.
 *
 * Category mapping (generated `derived`/`residual` → inventory shape):
 *   - fragments        ← static.fragments ∪ derived.fragments ∪ derived.navFooter
 *   - placeholderSheets ← static.placeholderSheets ∪ derived.placeholderSheets
 *   - spreadsheets     ← static.spreadsheets ∪ residual.spreadsheets
 *   - authPages        ← static.authPages (unchanged — a new customer page needs a
 *                         human-assigned blockClass, so the gate surfaces it for
 *                         review rather than auto-stubbing it)
 *
 * @module features/eds/services/runtimeSurfaceResolver
 */

import { RUNTIME_SURFACES, type RuntimeSurfaceInventory } from './runtimeSurfaceInventory';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types';

/** Minimal locator for the patches repo ledger (satisfied by Code/ContentPatchSource). */
export interface RuntimeSurfaceSource {
    owner: string;
    repo: string;
    path: string;
}

/** Shape of a ledger's `runtime-surfaces.json` (only the fields we consume). */
export interface GeneratedRuntimeSurfaces {
    derived?: {
        fragments?: string[];
        navFooter?: string[];
        placeholderSheets?: string[];
        customerPages?: string[];
    };
    residual?: {
        spreadsheets?: string[];
    };
}

const RUNTIME_SURFACES_FILENAME = 'runtime-surfaces.json';

const uniq = (...lists: (string[] | undefined)[]): string[] =>
    [...new Set(lists.flat().filter((x): x is string => typeof x === 'string'))];

/**
 * Pure merge: union the generated surfaces onto the static hand list (the floor).
 * `authPages` is intentionally left as the static list — see module docs.
 */
export function mergeRuntimeSurfaces(
    generated: GeneratedRuntimeSurfaces | null,
    base: RuntimeSurfaceInventory = RUNTIME_SURFACES,
): RuntimeSurfaceInventory {
    if (!generated) return base;
    const d = generated.derived ?? {};
    const r = generated.residual ?? {};
    return {
        spreadsheets: uniq(base.spreadsheets, r.spreadsheets),
        fragments: uniq(base.fragments, d.fragments, d.navFooter),
        authPages: base.authPages,
        placeholderSheets: uniq(base.placeholderSheets, d.placeholderSheets),
    };
}

const cache = new Map<string, Promise<GeneratedRuntimeSurfaces | null>>();

/** Test helper: clear the per-source cache between tests. */
export function _clearRuntimeSurfaceCacheForTests(): void {
    cache.clear();
}

/**
 * Best-effort fetch of a ledger's `runtime-surfaces.json`. Returns `null` on any
 * failure (the caller falls back to the static inventory). Cached per source;
 * a rejected/empty fetch is evicted so the next call retries.
 */
export function fetchRuntimeSurfaces(
    source: RuntimeSurfaceSource,
    logger: Logger,
): Promise<GeneratedRuntimeSurfaces | null> {
    const cacheKey = `${source.owner}/${source.repo}/${source.path}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/${source.path}/${RUNTIME_SURFACES_FILENAME}`;
    const promise = (async (): Promise<GeneratedRuntimeSurfaces | null> => {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK) });
            if (!response.ok) {
                logger.info(`[RuntimeSurfaces] No generated inventory for ${source.path} (${response.status}); using static list`);
                return null;
            }
            const data = (await response.json()) as GeneratedRuntimeSurfaces;
            logger.info(`[RuntimeSurfaces] Merged derived inventory from ${source.owner}/${source.repo}/${source.path}`);
            return data;
        } catch (error) {
            logger.warn(`[RuntimeSurfaces] Could not fetch generated inventory (${(error as Error).message}); using static list`);
            return null;
        }
    })();

    cache.set(cacheKey, promise);
    promise.then((v) => { if (v === null) cache.delete(cacheKey); }).catch(() => cache.delete(cacheKey));
    return promise;
}

/** Dependency seam for tests. */
export interface RuntimeSurfaceDeps {
    fetcher?: typeof fetchRuntimeSurfaces;
}

/**
 * Resolve the effective runtime-surface inventory: the static hand list, with the
 * ledger's generated `derived`/`residual` surfaces merged in when a source is
 * given and reachable. Always returns a usable inventory (never throws).
 */
export async function getRuntimeSurfaces(
    source: RuntimeSurfaceSource | undefined,
    logger: Logger,
    deps: RuntimeSurfaceDeps = {},
): Promise<RuntimeSurfaceInventory> {
    if (!source) return RUNTIME_SURFACES;
    const fetcher = deps.fetcher ?? fetchRuntimeSurfaces;
    const generated = await fetcher(source, logger);
    return mergeRuntimeSurfaces(generated);
}
