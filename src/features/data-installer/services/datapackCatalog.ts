/**
 * Catalog shaping: turn a flat datapack list into something browsable.
 *
 * The service returns one row per `(name, version)` pair — 40 rows for 25 names in
 * the live catalog — and versions are free-form strings that carry real meaning
 * (`main`, `hold`, `eds-compatible`, `tierpricingfix`, `legacySkus-20260522`,
 * `main-archived-20260618`, `archive_06112026`, `dev`, `test`). Presented flat that
 * is not a list anyone can read, so the surface groups by name and picks a sensible
 * default version per group.
 *
 * **`main` cannot be assumed to exist.** Three of the eleven curated brands —
 * `citisignal_original`, `luma`, `venia` — ship only `eds-compatible` and `hold`.
 * That is 27%, not an edge case, and a default rule that reaches for `main` blindly
 * returns nothing for them so the card renders with no version. On real data this
 * rule picks `eds-compatible` for all three, which is also the right answer for an
 * EDS storefront.
 *
 * Pure — no client, no vscode, no React.
 *
 * @module features/data-installer/services/datapackCatalog
 */

import type { DatapackSummary } from '../types';

/** Every version of one datapack, ready to render as a single card. */
export interface DatapackGroup {
    name: string;
    displayName: string;
    /** True when ANY version is shared — curation is a property of the pack. */
    shared: boolean;
    /** Ordered by {@link orderVersions}: live first, archived last. */
    versions: DatapackSummary[];
}

const MAIN = 'main';

/** Matches both archived spellings seen live: `main-archived-…` and `archive_…`. */
const ARCHIVED = /archiv/i;

/**
 * Group a flat catalog by datapack name.
 *
 * First-seen order is preserved so whatever ordering the service applied survives
 * into the UI rather than being replaced by an arbitrary one.
 */
export function groupDatapacks(items: DatapackSummary[]): DatapackGroup[] {
    const byName = new Map<string, DatapackGroup>();

    for (const item of items) {
        const existing = byName.get(item.id.name);
        if (existing) {
            existing.versions.push(item);
            existing.shared = existing.shared || item.shared;
            continue;
        }
        byName.set(item.id.name, {
            name: item.id.name,
            displayName: item.displayName || item.id.name,
            shared: item.shared,
            versions: [item],
        });
    }

    for (const group of byName.values()) {
        group.versions = orderVersions(group.versions);
    }
    return [...byName.values()];
}

/**
 * Order versions for a picker: `main` first, archived last, newest between.
 *
 * Returns a new array; callers pass live state and a sort in place would mutate it.
 */
export function orderVersions(versions: DatapackSummary[]): DatapackSummary[] {
    return [...versions].sort((a, b) => rank(a) - rank(b) || byRecency(a, b));
}

/**
 * The version a card should show before the user chooses.
 *
 * `main` when present, otherwise the newest non-archived version, otherwise
 * whatever exists — an archived-only pack still has to render something.
 */
export function pickDefaultVersion(group: DatapackGroup): string | undefined {
    const ordered = orderVersions(group.versions);
    return ordered[0]?.id.version;
}

/** Sort bucket: main (0), live (1), archived (2). */
function rank(version: DatapackSummary): number {
    if (version.id.version === MAIN) {
        return 0;
    }
    return ARCHIVED.test(version.id.version) ? 2 : 1;
}

/** Newest first, treating a missing timestamp as equal so the sort stays stable. */
function byRecency(a: DatapackSummary, b: DatapackSummary): number {
    if (!a.updatedAt || !b.updatedAt) {
        return 0;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
}
