/**
 * Code Patch Registry (v2 — externalized).
 *
 * Generic engine that applies named patches to files in a cloned storefront
 * repo at create/reset time. Definitions are fetched from an external patches
 * repo (per ADR-006 D3 → `skukla/eds-demo-patches`); the engine itself knows
 * no canonical file by name.
 *
 * Per-patch failure discipline (proceed-and-warn, D1):
 *   - Precondition mismatch → `applied: false` with descriptive reason
 *   - Target not in working file map → `applied: false`
 *   - External fetch failure → batch returns `applied: false` per requested ID
 *   - Unknown patch ID → warn + non-applied result
 *   - critical: true patch failure → throws CodePatchCriticalError after the
 *     result is recorded (escape hatch for the rare load-bearing case)
 *
 * Recovered from v1 `templatePatchRegistry` (`git show 'f6a7d029^:…'`).
 * Three deltas from v1:
 *   - `filePath` → `target` (matches content-patch naming family)
 *   - Definitions externalized (v1's one structural flaw was bundled payloads)
 *   - Reuses content-patch fetch+cache via the shared `fetchExternalPatches`
 *     helper (avoids parallel fetch/cache infrastructure)
 *
 * Cross-references:
 *   - ADR-006 (the decision record)
 *   - `.rptc/plans/thin-layer-storefront-adr-006/v1-prior-art.md` (file inventory
 *     + verified v1 shapes)
 *   - `contentPatchRegistry.ts` (uses the same `fetchExternalPatches` helper)
 *
 * @module features/eds/services/codePatchRegistry
 */

import { fetchExternalPatches, _clearExternalPatchCacheForTests } from './externalPatchFetcher';
import type { Logger } from '@/types';
import type { CodePatchSource } from '@/types/demoPackages';

/**
 * Code patch definition (loaded from external `code-patches.json` ledger).
 *
 * Same family as {@link ContentPatch} but operates on cloned repo files
 * (not DA.live HTML). The `target` is a repo-relative path; `precondition`
 * is an anchored search string that must match exactly once.
 */
export interface CodePatch {
    /** Unique identifier; referenced from `demo-packages.json`'s `patches: [...]` field */
    id: string;
    /** Repo-relative file path, e.g. `'blocks/header/header.js'` */
    target: string;
    /** Description of what the patch fixes */
    description: string;
    /** Anchored precondition (exact substring match against the target file's content) */
    precondition: string;
    /** Replacement content */
    replacement: string;
    /** Human-readable "what makes this obsolete" (e.g., `PR to hlxsites → delete on merge`) */
    exit?: string;
    /**
     * Optional hard-abort escape hatch (defaults `false` per D1).
     * When true and the patch fails to apply, `applyCodePatches` throws
     * {@link CodePatchCriticalError} after recording the result. Reserve
     * for patches that produce a fundamentally broken demo when missed.
     */
    critical?: boolean;
}

/**
 * Result of applying a single code patch.
 *
 * `applied: false` is the explicit failure shape (never a silent skip);
 * the `reason` field is what the report helper surfaces in the toast.
 */
export interface CodePatchResult {
    patchId: string;
    target: string;
    applied: boolean;
    reason?: string;
}

/**
 * Thrown only when a `critical: true` patch fails to apply. Non-critical
 * failures are returned in the results array; this is the escape hatch
 * for patches load-bearing enough that proceeding would produce a broken
 * demo. The failed result is attached so the caller can surface it via
 * the same report path as non-critical failures.
 */
export class CodePatchCriticalError extends Error {
    constructor(public readonly result: CodePatchResult) {
        super(`Critical patch '${result.patchId}' failed: ${result.reason ?? 'unknown'}`);
        this.name = 'CodePatchCriticalError';
    }
}

const CODE_PATCHES_FILENAME = 'code-patches.json';

/**
 * Fetch the external code-patch ledger for a source, filter to requested IDs.
 *
 * Per-source caching (single in-flight HTTP request shared by concurrent
 * callers, failed-promise eviction) is delegated to the shared
 * {@link fetchExternalPatches} helper — same caching contract as
 * `contentPatchRegistry`.
 *
 * Returns `[]` on any fetch failure (and logs a warning); the caller's
 * `applyCodePatches` translates that empty ledger into per-ID failure
 * results so the toast can surface what didn't apply.
 */
export async function getCodePatches(
    patchIds: string[],
    source: CodePatchSource,
    logger: Logger,
): Promise<CodePatch[]> {
    if (!patchIds || patchIds.length === 0) return [];

    let allPatches: CodePatch[];
    try {
        allPatches = await fetchExternalPatches<CodePatch>(source, CODE_PATCHES_FILENAME, logger);
    } catch (error) {
        logger.warn(`[CodePatch] External fetch failed: ${(error as Error).message}`);
        return [];
    }

    const patchMap = new Map(allPatches.map(p => [p.id, p]));
    return patchIds
        .map(id => patchMap.get(id))
        .filter((p): p is CodePatch => p !== undefined);
}

/**
 * Apply code patches to a working map of files.
 *
 * The `files` map is mutated in place (v1 behavior; multiple patches per
 * target file compose via repeated reads/writes against the same key).
 * The caller owns populating the map — the engine never fetches the
 * target file itself, only patches what's there.
 *
 * Returns one {@link CodePatchResult} per requested ID, including non-applied
 * results for fetch failures, unknown IDs, missing targets, and precondition
 * mismatches. Throws {@link CodePatchCriticalError} only when a `critical: true`
 * patch fails (after recording the result).
 */
export async function applyCodePatches(
    files: Map<string, string>,
    patchIds: string[],
    source: CodePatchSource,
    logger: Logger,
): Promise<CodePatchResult[]> {
    const results: CodePatchResult[] = [];

    if (!patchIds || patchIds.length === 0) return results;

    const patches = await getCodePatches(patchIds, source, logger);

    // External fetch failed (or every requested ID is unknown). Translate
    // to per-ID non-applied results so the toast can surface them. We can't
    // distinguish "fetch failed" from "all IDs unknown" without re-fetching,
    // so the reason is intentionally broad.
    if (patches.length === 0) {
        for (const id of patchIds) {
            results.push({
                patchId: id,
                target: '(unknown)',
                applied: false,
                reason: 'Patch ledger unavailable (external fetch failed or no requested IDs in ledger)',
            });
        }
        return results;
    }

    // Some IDs returned, some didn't — warn + record per-ID failure for the missing ones.
    const foundIds = new Set(patches.map(p => p.id));
    const unknownIds = patchIds.filter(id => !foundIds.has(id));
    if (unknownIds.length > 0) {
        logger.warn(`[CodePatch] Unknown patch IDs: ${unknownIds.join(', ')}`);
        for (const id of unknownIds) {
            results.push({
                patchId: id,
                target: '(unknown)',
                applied: false,
                reason: 'Patch ID not in external ledger',
            });
        }
    }

    for (const patch of patches) {
        const result = tryApplyOne(files, patch, logger);
        results.push(result);
        if (patch.critical && !result.applied) {
            throw new CodePatchCriticalError(result);
        }
    }

    return results;
}

/**
 * Apply a single patch to the working file map. Returns the result without
 * throwing — critical-flag handling is the caller's responsibility (so the
 * result is always recorded before any throw).
 */
function tryApplyOne(
    files: Map<string, string>,
    patch: CodePatch,
    logger: Logger,
): CodePatchResult {
    const content = files.get(patch.target);
    if (content === undefined) {
        return {
            patchId: patch.id,
            target: patch.target,
            applied: false,
            reason: `Target file '${patch.target}' not in working set`,
        };
    }

    if (!content.includes(patch.precondition)) {
        return {
            patchId: patch.id,
            target: patch.target,
            applied: false,
            reason: 'Precondition not found (file may already be patched or has changed)',
        };
    }

    const patched = content.replace(patch.precondition, patch.replacement);
    files.set(patch.target, patched);
    logger.info(`[CodePatch] Applied '${patch.id}' to ${patch.target}`);
    return {
        patchId: patch.id,
        target: patch.target,
        applied: true,
    };
}

/**
 * Test helper: clear the shared external-patch cache between tests.
 *
 * Re-exported from the shared `externalPatchFetcher` so test files for
 * `codePatchRegistry` don't have to import from two places. Not part of
 * the production API.
 */
export function _clearCodePatchCacheForTests(): void {
    _clearExternalPatchCacheForTests();
}
