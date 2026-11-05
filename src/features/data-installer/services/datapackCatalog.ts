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
import type { DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** Every version of one datapack, ready to render as a single card. */
export interface DatapackGroup {
    /**
     * Unique across the grid: the store and the name. The one list already shows a pack
     * held in both as the datapack store's (`mergedCatalog`), so this keeps apart only what
     * a caller asked of both on its own.
     */
    key: string;
    name: string;
    displayName: string;
    /** Which catalog holds it. */
    store: DatapackStoreName;
    /** True when ANY version is shared — curation is a property of the pack. */
    shared: boolean;
    /** True when the signed-in SC owns ANY version. Only library packs can be. */
    mine: boolean;
    /** True when ANY version is an official team pack. Only library packs can be. */
    team: boolean;
    /** Ordered by {@link orderVersions}: live first, archived last. */
    versions: DatapackSummary[];
}

/**
 * Whether a card is the demo's own pack: the same name, in the store the project records.
 *
 * @param group - the card's pack
 * @param held - the pack the open project records
 * @returns whether it is that pack
 */
export function isHeld(group: DatapackGroup, held?: ProjectDatapack): boolean {
    return held !== undefined && group.name === held.name && group.store === (held.store ?? 'installer');
}

const MAIN = 'main';

/** The data kind of one store setting per row (datapack-engine step 09). */
export const STORE_CONFIG_KIND = 'store_config';

const LAYER_SUFFIX = '-settings';

/** The library pack that holds a pack's settings layer (step 09, decision 1). */
export function settingsLayerName(packName: string): string {
    return `${packName}${LAYER_SUFFIX}`;
}

/**
 * Whether a row is a settings layer: named as one, AND holding nothing but store settings. A demo
 * whose name happens to end in `-settings` holds data, and stays a demo.
 */
export function isSettingsLayer(row: Pick<DatapackSummary, 'id' | 'dataTypes'>): boolean {
    const named = row.id.name.endsWith(LAYER_SUFFIX) && row.id.name.length > LAYER_SUFFIX.length;
    return named && row.dataTypes.length > 0 && row.dataTypes.every((kind) => kind === STORE_CONFIG_KIND);
}

/**
 * The rows a catalog offers as cards: all but the settings layers whose pack is listed too, which
 * are reached from that pack's flyout (its "Store settings" row, and "Remove its store settings"
 * on the SC's own). A layer keeps its card when hiding it would strand it: no pack of its name is
 * listed, so no flyout reaches it, or it was installed on its own, and a card is where a pack is
 * removed from the store.
 *
 * @param installed - the names of the packs on this store
 */
export function withoutLayerCards<T extends Pick<DatapackSummary, 'id' | 'dataTypes'>>(rows: T[], installed: ReadonlySet<string> = new Set()): T[] {
    const names = new Set(rows.map((row) => row.id.name));
    return rows.filter((row) => {
        if (!isSettingsLayer(row) || installed.has(row.id.name)) return true;
        return !names.has(row.id.name.slice(0, -LAYER_SUFFIX.length));
    });
}

/**
 * The newest version by its date, which `main` does not outrank here (the default a card opens on
 * is `pickDefaultVersion`'s question, not this one). Archived versions only when nothing else is left.
 */
export function newestVersion<T extends Pick<DatapackSummary, 'id' | 'updatedAt'>>(versions: readonly T[]): T | undefined {
    const live = versions.filter((version) => !ARCHIVED.test(version.id.version));
    return [...(live.length > 0 ? live : versions)].sort(byRecency)[0];
}

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
        const store = item.store ?? 'installer';
        const key = `${store}:${item.id.name}`;
        const existing = byName.get(key);
        if (existing) {
            existing.versions.push(item);
            existing.shared = existing.shared || item.shared;
            existing.mine = existing.mine || item.mine === true;
            existing.team = existing.team || item.team === true;
            continue;
        }
        byName.set(key, {
            key,
            name: item.id.name,
            displayName: item.displayName || item.id.name,
            store,
            shared: item.shared,
            mine: item.mine === true,
            team: item.team === true,
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
function byRecency(a: Pick<DatapackSummary, 'updatedAt'>, b: Pick<DatapackSummary, 'updatedAt'>): number {
    if (!a.updatedAt || !b.updatedAt) {
        return 0;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
}
