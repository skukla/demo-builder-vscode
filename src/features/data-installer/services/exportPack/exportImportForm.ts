/**
 * A product export as the Data Installer service's `product_export` kind: the export's own rows in an
 * Import API body, which Demo Builder installs through Commerce's Import API about twice as fast as
 * products one bulk request each (`productExportKind.ts`), and which the service installs too.
 *
 * The rows go nearly as exported. Left out: the image columns (the files are not in the pack, and an
 * import refuses a row whose image it cannot find) and the source store's timestamps. A select or
 * multi-select value written with an HTML mark is set to the option it names (`exportOptions.ts`). Every
 * attribute code is kept: a base pack lists only custom attributes, and an export also names Commerce's
 * own (a gift card's settings, a download's link titles), which the store already has.
 *
 * @module features/data-installer/services/exportPack/exportImportForm
 */

import type { DatapackFile } from '../datapackZip';
import { asOption, type OptionLabels } from './exportOptions';
import { pairs } from './exportRows';

/** Columns not carried: files the pack does not hold, and when the source store saved the row. */
const LEFT_OUT = new Set([
    'base_image',
    'base_image_label',
    'small_image',
    'small_image_label',
    'thumbnail_image',
    'thumbnail_image_label',
    'swatch_image',
    'swatch_image_label',
    'additional_images',
    'additional_image_labels',
    'hide_from_product_page',
    'created_at',
    'updated_at',
]);

/** A row's `additional_attributes`, each value as the option it names (the base pack's options). */
function additional(text: string, options: OptionLabels): string {
    return Object.entries(pairs(text))
        .map(
            ([code, value]) =>
                `${code}=${value
                    .split('|')
                    .map((label) => asOption(options, code, label.trim()))
                    .join('|')}`,
        )
        .join(',');
}

/**
 * A configurable's `configurable_variations` (`sku=X,size=32,color=Black|…`), each value the option it
 * names. Luma's say size "32" where the option is "Size 32", and Commerce refused all 50 trouser and
 * shorts configurables for it (2026-11-06).
 */
function variations(text: string, options: OptionLabels): string {
    return text
        .split('|')
        .map((variation) => Object.entries(pairs(variation)).map(([code, value]) => `${code}=${code === 'sku' ? value : asOption(options, code, value)}`).join(','))
        .join('|');
}

/** Columns whose values name options, and how each is read. */
const OPTION_COLUMNS: Record<string, (text: string, options: OptionLabels) => string> = {
    additional_attributes: additional,
    configurable_variations: variations,
};

/** One export row as the pack carries it: no empty cells, no left-out columns. */
function importRow(fields: Record<string, string>, options: OptionLabels): Record<string, string> {
    const row: Record<string, string> = {};
    for (const [column, value] of Object.entries(fields)) {
        if (value === '' || LEFT_OUT.has(column)) continue;
        row[column] = OPTION_COLUMNS[column] ? OPTION_COLUMNS[column](value, options) : value;
    }
    return row;
}

/** The `product_export` item: every export row, a store view's rows too, in one Import API body. */
export function productExportItem(
    rows: ReadonlyArray<Record<string, string>>,
    options: OptionLabels,
): DatapackFile['items'][number] {
    const items = rows.map((fields) => importRow(fields, options));
    return {
        dataType: 'product_export',
        records: {
            source: {
                entity: 'catalog_product',
                behavior: 'append',
                validation_strategy: 'validation-skip-errors',
                allowed_error_count: String(items.length),
                items,
            },
        },
    };
}
