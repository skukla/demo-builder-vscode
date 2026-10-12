/**
 * DA.live spreadsheet utilities: the ONE place that knows the shape of a DA.live
 * sheet document, plus the HTML escape the generated pages share.
 *
 * A sheet is stored in DA.live as a JSON document at `<path>.json`. The same
 * document is what the block library writes (`DaLiveBlockLibrarySheet`) and what
 * a sheet copied from another site is written as (`daLiveSpreadsheetCopy`); both
 * build it with {@link buildSheetDocument}.
 *
 * There is no HTML form of a sheet. Until 2026-10-12 a copied sheet was turned
 * into an HTML table and posted to `<path>.html`; DA.live stored a page, the page
 * was served as a page, and `<path>.json` answered 404 (EDS-40, measured on a
 * scratch storefront). That converter is removed.
 *
 * Pure functions, no I/O.
 */

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** One row of a sheet: column name to cell value. */
export type SheetRow = Record<string, unknown>;

/** A sheet by name, the form both readers and writers of a document meet in. */
export interface NamedSheet {
    name: string;
    rows: SheetRow[];
    /** Column names, when the writer knows them. Taken from the first row when absent. */
    columns?: string[];
}

/**
 * A sheet as the CDN served it: possibly one PAGE of it. `rows` is what this
 * response held; `total` is how many rows the server says the sheet has.
 */
export interface ServedSheet extends NamedSheet {
    total: number;
    /**
     * The `sheet` query value that asks the CDN for this sheet alone. Absent for
     * a single sheet, which is the whole document and is asked for bare.
     */
    sheetParam?: string;
}

/** One sheet inside a stored document. */
export interface DaLiveSheet {
    total: number;
    limit: number;
    offset: number;
    data: SheetRow[];
    ':colWidths': number[];
}

/**
 * A sheet document as DA.live stores it: one {@link DaLiveSheet} per name in
 * `:names`, always in multi-sheet form.
 */
export interface DaLiveSheetDocument {
    ':names': string[];
    ':version': 3;
    ':type': 'multi-sheet';
    [sheetName: string]: DaLiveSheet | string[] | 3 | 'multi-sheet';
}

/** The width DA.live's sheet editor opens every column at. */
const DEFAULT_COLUMN_WIDTH = 300;

/**
 * Build the document DA.live stores for these sheets.
 *
 * Always multi-sheet, whatever the count: a storefront asks for
 * `<path>.json?sheet=data`, and only a multi-sheet document has a sheet to answer
 * by name. The shape is the one `/.da/library/blocks.json` has on every storefront,
 * which answers 200 with and without the query.
 *
 * @param sheets - the sheets, in the order the document names them
 * @returns the document to POST to `/source/{org}/{site}/{path}.json`
 */
export function buildSheetDocument(sheets: NamedSheet[]): DaLiveSheetDocument {
    const byName: Record<string, DaLiveSheet> = {};
    for (const sheet of sheets) {
        const columns = sheet.columns ?? Object.keys(sheet.rows[0] ?? {});
        byName[sheet.name] = {
            total: sheet.rows.length,
            limit: sheet.rows.length,
            offset: 0,
            data: sheet.rows,
            ':colWidths': columns.map(() => DEFAULT_COLUMN_WIDTH),
        };
    }
    return {
        ...byName,
        ':names': sheets.map((sheet) => sheet.name),
        ':version': 3,
        ':type': 'multi-sheet',
    };
}

/** The rows and stated total of a served sheet, or null when it has no row list. */
function pageOf(sheet: unknown): { rows: SheetRow[]; total: number } | null {
    const { data, total } = (sheet ?? {}) as { data?: unknown; total?: unknown };
    if (!Array.isArray(data)) return null;
    return { rows: data as SheetRow[], total: typeof total === 'number' ? total : data.length };
}

/**
 * Read the sheets out of what aem.live serves at `<path>.json`.
 *
 * Two shapes are served. A multi-sheet document names its sheets in `:names` and
 * holds each under its name; every one is kept, `dnt` included (it is the author's
 * do-not-translate setting, and a copy that drops it is not the same document). A
 * single sheet holds its rows at the top level and has no name, so it is read as
 * one sheet named `data`.
 *
 * A response can be one page of a longer sheet: compare `rows.length` with `total`.
 *
 * @param served - the parsed JSON body
 * @returns the sheets in served order, or null when the body is not a sheet
 */
export function readServedSheets(served: unknown): ServedSheet[] | null {
    if (typeof served !== 'object' || served === null) return null;
    const document = served as Record<string, unknown>;

    if (document[':type'] === 'multi-sheet' && Array.isArray(document[':names'])) {
        const sheets: ServedSheet[] = [];
        for (const name of document[':names'] as string[]) {
            const page = pageOf(document[name]);
            if (page) sheets.push({ name, ...page, sheetParam: name });
        }
        return sheets.length > 0 ? sheets : null;
    }

    const page = pageOf(document);
    return page ? [{ name: 'data', ...page }] : null;
}
