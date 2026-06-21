/**
 * Collision-free `ow.package` generator (Step 05) — the prune-isolation primitive.
 *
 * Derives a deterministic, shell-safe OpenWhisk package name from an App Builder component
 * `id`. Per the D1 spike (Q1/Q2), `aio app deploy`'s prune is keyed to the
 * package name (`projectName === ow.package`): two integrations left on the
 * default `application`/`dx-excshell-1` package clobber each other on deploy AND
 * undeploy. A DISTINCT per-appBuilderComponent package name is the load-bearing isolation
 * boundary. This module produces that name; step 08 applies it to the deploy.
 *
 * Guarantees (all test-pinned):
 * - deterministic (same id -> same name)
 * - collision-free (distinct ids -> distinct names, even when sanitization alone
 *   would collapse them — a stable hash suffix keeps them apart)
 * - shell-safe charset `[a-z0-9-]`, lowercase, no leading/trailing hyphen
 * - never a reserved default (`application` / `dx-excshell-1`)
 * - bounded length (truncate the readable stem; the hash suffix preserves
 *   distinctness)
 */

import { createHash } from 'crypto';

/** Reserved OpenWhisk package names that re-introduce the prune collision. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(['application', 'dx-excshell-1']);

/** Max length of the full derived package name (well within OpenWhisk limits). */
const MAX_LENGTH = 50;
/** Length of the stable hash suffix appended for distinctness. */
const HASH_LENGTH = 8;
/** Fallback stem when an id sanitizes to nothing (e.g. all metacharacters). */
const FALLBACK_STEM = 'pkg';

/** Lowercase, strip to `[a-z0-9-]`, collapse runs, trim leading/trailing hyphens. */
function sanitizeStem(id: string): string {
    const cleaned = id
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || FALLBACK_STEM;
}

/** Short, stable hex hash of the RAW id (keeps sanitization-collisions distinct). */
function shortHash(id: string): string {
    return createHash('sha1').update(id).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Derive a distinct, deterministic, shell-safe `ow.package` name from a
 * appBuilderComponent id.
 *
 * An id that is ALREADY a clean, in-budget, non-reserved package name passes
 * through verbatim (readable names stay readable). Otherwise a stable hash of
 * the RAW id is appended so distinct ids never collide — even when sanitization
 * alone would collapse them — and reserved defaults can never be produced.
 */
export function deriveOwPackage(appBuilderComponentId: string): string {
    const stem = sanitizeStem(appBuilderComponentId);
    const isClean =
        stem === appBuilderComponentId &&
        stem.length <= MAX_LENGTH &&
        !RESERVED_NAMES.has(stem);
    if (isClean) {
        return stem;
    }

    const hash = shortHash(appBuilderComponentId);
    const stemBudget = MAX_LENGTH - HASH_LENGTH - 1; // 1 for the joining hyphen
    const truncatedStem = stem.slice(0, stemBudget).replace(/-+$/g, '') || FALLBACK_STEM;

    return `${truncatedStem}-${hash}`;
}
