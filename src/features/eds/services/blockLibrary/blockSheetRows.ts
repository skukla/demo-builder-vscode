/**
 * The rows of the storefront's library sheets. Blocks: ours in the list's order, then the rows
 * already in the sheet that match none of ours (an SC's own), in their order. A row matching one
 * of ours by path, else by lower-cased name, stays as it is in our place: its own name and every
 * column it has are kept, and only a missing column is filled from ours. An unmatched row whose
 * page is in this site's own block-page folder is one Demo Builder wrote for a block no longer
 * listed (the old Universal Editor child components such as `accordion-item`), so it is dropped;
 * every other unmatched row is kept.
 *
 * This deviates from Import Blocks' `mergeBlockRows` (adobe/da-live
 * `blocks/config/blocks-import/blocks.js`), which overwrites a matched row's name and path, on
 * purpose: a user's own edits are never overwritten (CLAUDE.md property 2).
 */

import type { ImportedBlockRow } from './blockDoc';

/** A sheet row as DA.live stores it: every value a string. */
export type SheetRow = Record<string, string>;

/** The columns a sheet names a row and its page by (`name`/`path`, or `key`/`value`). */
export interface RowKeys {
    title: string;
    path: string;
}

const BLOCK_KEYS: RowKeys = { title: 'name', path: 'path' };

/**
 * For each of ours, the existing row it matches (same path, else same lower-cased title), or
 * undefined. Each existing row is matched at most once.
 */
export function matchRows(
    existing: SheetRow[],
    ours: SheetRow[],
    keys: RowKeys,
): Array<SheetRow | undefined> {
    const taken = new Set<SheetRow>();
    const title = (row: SheetRow): string => (row[keys.title] ?? '').toLowerCase();
    const free = (row: SheetRow): boolean => !taken.has(row);
    return ours.map((row) => {
        const same = existing.find((r) => free(r) && r[keys.path] === row[keys.path])
            ?? existing.find((r) => free(r) && title(r) !== '' && title(r) === title(row));
        if (same) taken.add(same);
        return same;
    });
}

/** The existing row with only its missing or empty columns taken from ours. */
export function fillMissing(mine: SheetRow, ours: SheetRow): SheetRow {
    const missing = Object.entries(ours).filter(([column]) => !mine[column]);
    return { ...mine, ...Object.fromEntries(missing) };
}

/**
 * Ours first in order (a matched row in our place, kept as it is), then the unmatched existing
 * rows, less those whose path starts with `ownPagesUrl` (this site's block-page folder URL,
 * ending in `/`).
 */
export function blockSheetRows(
    existing: SheetRow[],
    ours: ImportedBlockRow[],
    ownPagesUrl: string,
): SheetRow[] {
    // Deliberately not Import Blocks' mergeBlockRows: a matched row keeps its own name (property 2).
    const matches = matchRows(existing, ours, BLOCK_KEYS);
    const front = ours.map((row, n) => {
        const mine = matches[n];
        return mine ? fillMissing(mine, row) : row;
    });
    const taken = new Set(matches);
    const rest = existing.filter((row) =>
        !taken.has(row) && !(row.path ?? '').startsWith(ownPagesUrl));
    return [...front, ...rest];
}

/** The sheet's columns: `name` and `path`, then any other column a row carries. */
export function sheetColumns(rows: SheetRow[]): string[] {
    return [...new Set(['name', 'path', ...rows.flatMap((row) => Object.keys(row))])];
}
