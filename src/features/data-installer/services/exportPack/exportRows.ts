/**
 * The rows of a Commerce product export: the CSV that System › Data Transfer › Export writes, or
 * the same table as JSON (`{ data: { productExport: { data: "<a JSON table>" } } }`, which is how
 * Luma's public source repo keeps it, or a bare table: a list whose first entry is the header).
 *
 * A row's list and map columns are opened here: `categories` (paths, comma-separated),
 * `additional_attributes` (`code=value,code=value`), and `bundle_values` and
 * `configurable_variations` (entries separated by `|`, each a map). A value may hold a comma, so a
 * comma only separates two entries when a new `key=` follows it.
 *
 * A product exported once per store view has several rows; the store-wide one (no
 * `store_view_code`) is the one kept, else the first.
 *
 * @module features/data-installer/services/exportPack/exportRows
 */

import { CsvError, parseCsv } from './csvTable';

/** One product's row, its list and map columns opened. */
export interface ExportRow {
    /** Every column as written. */
    fields: Record<string, string>;
    categories: string[];
    extra: Record<string, string>;
    bundleValues: Array<Record<string, string>>;
    variations: Array<Record<string, string>>;
}

/** `a=1,b=two, with comma,c=3`: a comma only separates when a new key follows it. */
export function pairs(text: string | undefined): Record<string, string> {
    if (!text) return {};
    const out: Record<string, string> = {};
    for (const part of text.split(/,(?=[a-zA-Z_0-9]+=)/u)) {
        const at = part.indexOf('=');
        if (at > 0) out[part.slice(0, at)] = part.slice(at + 1);
    }
    return out;
}

/** A comma-separated list, trimmed, empties dropped. */
export function splitList(text: string | undefined): string[] {
    return (text ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

/** The table as header + rows, from CSV or JSON. */
function tableOf(text: string, fileName: string): unknown[][] {
    if (!fileName.toLowerCase().endsWith('.json')) return parseCsv(text);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text.replace(/^\uFEFF/u, ''));
    } catch {
        throw new CsvError(`${fileName} is not valid JSON.`);
    }
    const inner = (parsed as { data?: { productExport?: { data?: unknown } } })?.data?.productExport
        ?.data;
    const table = typeof inner === 'string' ? (JSON.parse(inner) as unknown) : parsed;
    if (!Array.isArray(table) || !Array.isArray(table[0])) {
        throw new CsvError(
            `${fileName} holds no product table: expected a header row and rows, as a Commerce export writes.`,
        );
    }
    return table as unknown[][];
}

/**
 * The export's rows as column → value, blank lines skipped.
 *
 * @throws CsvError when the file is not a table, or has no `sku` column (it is not a product export)
 */
export function readExportTable(text: string, fileName: string): Array<Record<string, string>> {
    const [header, ...rows] = tableOf(text, fileName);
    const columns = (header ?? []).map((cell) => String(cell ?? '').trim());
    if (!columns.includes('sku')) {
        throw new CsvError(
            `${fileName} has no sku column, so it is not a Commerce product export.`,
        );
    }
    return rows
        .filter((cells) => cells.some((cell) => String(cell ?? '').trim() !== ''))
        .map((cells) =>
            Object.fromEntries(columns.map((column, i) => [column, String(cells[i] ?? '')])),
        );
}

/** A row with its list and map columns opened. */
export function openRow(fields: Record<string, string>): ExportRow {
    const entries = (column: string) =>
        (fields[column] ?? '')
            .split('|')
            .filter(Boolean)
            .map((entry) => pairs(entry));
    return {
        fields,
        categories: splitList(fields.categories),
        extra: pairs(fields.additional_attributes),
        bundleValues: entries('bundle_values'),
        variations: entries('configurable_variations'),
    };
}

/** One row per SKU: the store-wide row when a product has one, otherwise its first. */
export function firstRows(rows: readonly ExportRow[]): ExportRow[] {
    const chosen = new Map<string, ExportRow>();
    for (const row of rows) {
        const sku = row.fields.sku?.trim();
        if (!sku) continue;
        const held = chosen.get(sku);
        if (!held || (held.fields.store_view_code && !row.fields.store_view_code))
            chosen.set(sku, row);
    }
    return [...chosen.values()];
}
