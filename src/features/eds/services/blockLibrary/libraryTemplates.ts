/**
 * Adobe's templates in the storefront's library: each page copied from the Adobe source site's
 * `/docs/library/templates/<id>` to `/.da/library/templates/<id>`, and the `templates.json` sheet
 * (rows `key`, `value`, as Adobe's sheet has them) listing them.
 *
 * Nothing someone wrote is replaced: a template page that is already there is kept and not copied
 * (DA.live's source POST always writes, so the existence check is what keeps it; a check that
 * fails counts as there, `sourcePresent`), and the sheet keeps every row it has, with its other
 * columns, adding ours by path or title as the blocks sheet does (`blockSheetRows.ts`).
 */

import type { LibraryEntry } from './adobeContentLibrary';
import { fillMissing, matchRows, type RowKeys, type SheetRow } from './blockSheetRows';
import { contentUrl, copyPreviewPage, inBatches, type Destination } from './libraryPages';
import type { SiteRef } from './siteRef';
import type { DaLiveApiClient } from '@/features/eds/services/daLive/daLiveApiClient';
import type { DaLiveBlockLibrarySheet } from '@/features/eds/services/daLive/daLiveBlockLibrarySheet';
import type { DaLiveContentCopy } from '@/features/eds/services/daLive/daLiveContentCopy';
import { sourcePresent } from '@/features/eds/services/daLive/daLiveSourceProbe';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

/** Adobe's template rows and the Adobe source site their pages are read from. */
export interface AdobeTemplates {
    entries: LibraryEntry[];
    source: SiteRef;
}

/** What writing the templates needs. */
export interface TemplateWriterDeps {
    apiClient: Pick<DaLiveApiClient, 'fetchWithRetry'>;
    copyOps: Pick<DaLiveContentCopy, 'copySingleFile'>;
    sheet: Pick<DaLiveBlockLibrarySheet, 'createJsonSpreadsheet' | 'readSheetRows'>;
    logger: Logger;
}

/** The templates sheet, relative to the site. */
export const TEMPLATES_SHEET = '.da/library/templates.json';
const TEMPLATE_PAGES = '.da/library/templates';
const SOURCE_PAGES = '/docs/library/templates';
const TEMPLATE_KEYS: RowKeys = { title: 'key', path: 'value' };

/**
 * Keeps or copies the template pages and writes the merged sheet. Returns the absolute paths
 * (the sheet, then each listed page), or none when the sheet could not be read or written or no
 * template has a page. Throws only an expired DA.live sign-in.
 */
export async function writeAdobeTemplates(
    deps: TemplateWriterDeps,
    dest: Destination,
    templates: AdobeTemplates,
): Promise<string[]> {
    const existing = await readTemplateRows(deps, dest);
    if (!existing) return [];
    const hasPage = await inBatches(templates.entries, (entry) =>
        keepOrCopy(deps, dest, templates, entry));
    const listed = templates.entries.filter((_, n) => hasPage[n]);
    if (listed.length === 0) return [];
    const ours = listed.map((entry) => ({
        key: entry.title,
        value: contentUrl(dest, `${TEMPLATE_PAGES}/${entry.id}`),
    }));
    const rows = templateSheetRows(existing, ours);
    const columns = [...new Set(['key', 'value', ...rows.flatMap((row) => Object.keys(row))])];
    const result = await deps.sheet.createJsonSpreadsheet(
        dest.org, dest.site, TEMPLATE_PAGES, columns, rows, { overwrite: true },
    );
    if (!result.success) {
        deps.logger.warn(`[DA.live] Templates list not written: ${result.error}`);
        return [];
    }
    return [`/${TEMPLATES_SHEET}`, ...listed.map((entry) => `/${TEMPLATE_PAGES}/${entry.id}`)];
}

/**
 * The sheet's rows in their order (a row matching one of ours kept as it is, only its missing
 * columns filled), then ours that no row matched.
 */
export function templateSheetRows(existing: SheetRow[], ours: SheetRow[]): SheetRow[] {
    const matches = matchRows(existing, ours, TEMPLATE_KEYS);
    const filled = new Map<SheetRow, SheetRow>();
    matches.forEach((mine, n) => {
        if (mine) filled.set(mine, fillMissing(mine, ours[n]));
    });
    const added = ours.filter((_, n) => !matches[n]);
    return [...existing.map((row) => filled.get(row) ?? row), ...added];
}

/** The sheet's rows ([] when there is none), or undefined when it cannot be read. */
async function readTemplateRows(
    deps: TemplateWriterDeps,
    dest: Destination,
): Promise<SheetRow[] | undefined> {
    try {
        return (await deps.sheet.readSheetRows(dest.org, dest.site, TEMPLATES_SHEET)) ?? [];
    } catch (error) {
        if (error instanceof DaLiveAuthError) throw error;
        const reason = (error as Error).message;
        deps.logger.warn(`[DA.live] Templates list not read, left unchanged: ${reason}`);
        return undefined;
    }
}

/** True when the template has a page: one already there (kept), else a copy that worked. */
async function keepOrCopy(
    deps: TemplateWriterDeps,
    dest: Destination,
    templates: AdobeTemplates,
    entry: LibraryEntry,
): Promise<boolean> {
    const page = `${dest.org}/${dest.site}/${TEMPLATE_PAGES}/${entry.id}.html`;
    if (await sourcePresent(deps, dest.token, page)) return true;
    return copyPreviewPage(
        deps.copyOps,
        dest,
        { ...templates.source, path: `${SOURCE_PAGES}/${entry.id}` },
        `/${TEMPLATE_PAGES}/${entry.id}`,
    );
}
