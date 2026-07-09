/**
 * managedStorefrontFiles
 *
 * Predicate identifying the storefront files the EDS pipeline authoritatively
 * generates and pushes on the user's behalf, so Sync Storefront can silently
 * take the remote copy when one of them conflicts during a rebase.
 *
 * The set is grounded in what the pipeline actually writes via the GitHub API:
 *   - `config.json` — produced by `configSyncService` (Config Service → repo).
 *   - `fstab.yaml`  — produced by `fstabGenerator`.
 * Both are root-level, machine-owned, and never hand-edited by the user, and the
 * remote copy is authoritative.
 *
 * Anything not in this set is treated as user CONTENT (safe default → false), so
 * an unknown file always falls back to the manual merge flow and its bytes are
 * never silently discarded.
 */

const MANAGED_FILES: ReadonlySet<string> = new Set(['config.json', 'fstab.yaml']);

/**
 * True only for the exact root-level files the EDS pipeline owns. Normalizes a
 * leading `/` and back-slashes to POSIX, then requires an exact match — a nested
 * `blocks/config.json` or any unknown path is content (false).
 */
export function isManagedStorefrontFile(rel: string): boolean {
    const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    return MANAGED_FILES.has(normalized);
}
