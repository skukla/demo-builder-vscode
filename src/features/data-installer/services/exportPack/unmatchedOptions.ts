/**
 * The select and multi-select values a built pack carries that name no option of the base pack's
 * attribute: an install either refuses the row or, worse, sets a different option. Luma's export wrote
 * sizes as "32" where the option was "Size 32"; read as an option id, about 500 products got the wrong
 * size and every install still looked clean (2026-11-06). Said when the pack is built, before any store
 * sees it.
 *
 * Read from the finished pack, in both forms: product records (`custom_attributes`, a configurable's
 * option values) and import rows (`additional_attributes`, `configurable_variations`).
 *
 * @module features/data-installer/services/exportPack/unmatchedOptions
 */

import type { DatapackFile } from '../datapackZip';
import type { OptionLabels } from './exportOptions';
import { pairs } from './exportRows';

type Row = Record<string, unknown>;

/** Each `code value` pair a row carries for a choice attribute, its values one by one. */
function recordValues(product: Row): Array<[string, string]> {
    const own = (product.custom_attributes as Array<{ attribute_code: string; value: unknown }> | undefined) ?? [];
    const out: Array<[string, string]> = own.flatMap(({ attribute_code: code, value }) =>
        (Array.isArray(value) ? value : [value]).filter((v) => v !== null && v !== undefined && v !== '').map((v): [string, string] => [code, String(v)]),
    );
    const options = ((product.extension_attributes as Row | undefined)?.configurable_product_options as Array<{ attribute_id?: unknown; values?: Array<{ value_index?: unknown }> }> | undefined) ?? [];
    for (const option of options) for (const value of option.values ?? []) out.push([String(option.attribute_id), String(value.value_index)]);
    return out;
}

/** The same for an import row. */
function importValues(row: Row): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [code, value] of Object.entries(pairs(String(row.additional_attributes ?? '')))) for (const v of value.split('|')) out.push([code, v.trim()]);
    for (const variation of String(row.configurable_variations ?? '').split('|').filter(Boolean)) {
        for (const [code, value] of Object.entries(pairs(variation))) if (code !== 'sku') out.push([code, value]);
    }
    return out;
}

/** Every product row of the pack, in either form, with how to read its values. */
function valuesOf(pack: DatapackFile): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const item of pack.items) {
        if (item.dataType === 'products' || item.dataType === 'giftcards') {
            for (const row of (item.records as Array<{ product?: Row }>) ?? []) if (row.product) out.push(...recordValues(row.product));
        }
        if (item.dataType === 'product_export') {
            for (const row of ((item.records as { source?: { items?: Row[] } }).source?.items ?? [])) out.push(...importValues(row));
        }
    }
    return out;
}

/**
 * The values naming no option, as `code: value` once each, sorted. An attribute the base pack does not
 * list options for is not checked (nothing to check it against).
 */
export function unmatchedOptions(pack: DatapackFile, options: OptionLabels): string[] {
    const found = new Set<string>();
    for (const [code, value] of valuesOf(pack)) {
        const labels = options.get(code);
        if (labels && labels.length > 0 && !labels.includes(value)) found.add(`${code}: ${value}`);
    }
    return [...found].sort();
}
