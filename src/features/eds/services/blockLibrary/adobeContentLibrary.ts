/**
 * Reads Adobe's content library (the block and template sheets) from Adobe's source site.
 *
 * Each row's path points at whatever site Adobe copied the sheet from (on the B2B site it names
 * the non-B2B one), so only the last path segment, the id, is used. The caller reads the example
 * page from the source site itself. A missing or unreadable sheet gives an empty list.
 */

import { previewOrigin, type SiteRef } from './siteRef';

/** One row of a library sheet: the block or template id and its display title. */
export interface LibraryEntry {
    id: string;
    title: string;
}

/** Adobe's library as published on its source site. */
export interface AdobeContentLibrary {
    blocks: LibraryEntry[];
    templates: LibraryEntry[];
}

type Row = Record<string, unknown>;

/** Reads `/docs/library/blocks.json` and `/docs/library/templates.json` from the site. */
export async function readAdobeContentLibrary(
    site: SiteRef,
    fetchJson: (url: string) => Promise<unknown | undefined>,
): Promise<AdobeContentLibrary> {
    const origin = previewOrigin(site);
    const [blockSheet, templateSheet] = await Promise.all([
        fetchSafely(fetchJson, `${origin}/docs/library/blocks.json`),
        fetchSafely(fetchJson, `${origin}/docs/library/templates.json`),
    ]);
    return {
        blocks: toEntries(sheetRows(blockSheet), 'name', 'path'),
        templates: toEntries(sheetRows(templateSheet), 'key', 'value'),
    };
}

async function fetchSafely(
    fetchJson: (url: string) => Promise<unknown | undefined>,
    url: string,
): Promise<unknown> {
    try {
        return await fetchJson(url);
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The rows of a single sheet (`{data:[...]}`) or of a multi-sheet's `data` sheet. */
function sheetRows(sheet: unknown): Row[] {
    if (!isRecord(sheet)) return [];
    const data = isRecord(sheet.data) ? sheet.data.data : sheet.data;
    return Array.isArray(data) ? data.filter(isRecord) : [];
}

function toEntries(rows: Row[], titleKey: string, pathKey: string): LibraryEntry[] {
    const entries: LibraryEntry[] = [];
    for (const row of rows) {
        const title = row[titleKey];
        const path = row[pathKey];
        if (typeof title !== 'string' || typeof path !== 'string') continue;
        const id = lastSegment(path);
        if (title && id) entries.push({ id, title });
    }
    return entries;
}

function lastSegment(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? '';
}
