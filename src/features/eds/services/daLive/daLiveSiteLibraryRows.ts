/**
 * The rows of a DA.live site config's `library` sheet: the lists the palette shows (DA.live renders
 * a row titled "Blocks" or "Templates" as a list; any other title is a plugin).
 *
 * Kept apart from `daLiveConfigOperations.ts`, which reads and posts the config document.
 *
 * @module features/eds/services/daLive/daLiveSiteLibraryRows
 */

/** A list to register: its title and the sheet it reads. */
export interface LibraryEntry {
    title: string;
    path: string;
}

/** A `library` row as DA.live stores it. */
export type LibraryRow = Record<string, unknown> & LibraryEntry;

function toRow(entry: LibraryEntry): LibraryRow {
    return { title: entry.title, path: entry.path, format: '', ref: '', icon: '', experience: '' };
}

function existingRows(library: unknown): LibraryRow[] {
    const isObject = typeof library === 'object' && library !== null;
    const data: unknown = isObject && 'data' in library ? library.data : undefined;
    if (!Array.isArray(data)) return [];
    return data.filter((row): row is LibraryRow =>
        typeof row === 'object' && row !== null && typeof row.title === 'string');
}

/**
 * The `library` rows to write. Without `keepOtherRows`, exactly the entries given. With it, the
 * rows already there in their order, a row with an entry's title (any case) taking the entry's
 * path and keeping its other columns, then the entries no row had.
 */
export function siteLibraryRows(
    library: unknown,
    entries: LibraryEntry[],
    keepOtherRows = false,
): LibraryRow[] {
    if (!keepOtherRows) return entries.map(toRow);
    const key = (title: string): string => title.toLowerCase();
    const byTitle = new Map(entries.map((entry) => [key(entry.title), entry]));
    const rows = existingRows(library).map((row) => {
        const entry = byTitle.get(key(row.title));
        return entry ? { ...row, title: entry.title, path: entry.path } : row;
    });
    const present = new Set(rows.map((row) => key(row.title)));
    return [...rows, ...entries.filter((entry) => !present.has(key(entry.title))).map(toRow)];
}
