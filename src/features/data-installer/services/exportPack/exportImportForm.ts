/**
 * A product export as the Data Installer service's `product_export` kind: the export's own rows in an
 * Import API body, which Demo Builder installs through Commerce's Import API about twice as fast as
 * products one bulk request each (`productExportKind.ts`), and which the service installs too.
 *
 * The rows go nearly as exported. Left out: the image columns (the files are not in the pack, and an
 * import refuses a row whose image it cannot find) and the source store's timestamps. A select or
 * multi-select value written with an HTML mark is set to the option it names (`exportOptions.ts`), and,
 * with a base pack, an attribute the base does not define is left out and named, as the products form
 * leaves it out.
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

/** What the rows are built against: the base pack's attributes, when there is one. */
export interface ImportFormContext {
    options: OptionLabels;
    /** The attribute codes the base pack defines; undefined without a base, when every code is kept. */
    known?: ReadonlySet<string>;
    leftOut: (code: string) => void;
}

/** A row's `additional_attributes`, each value as the option it names, unknown codes left out. */
function additional(text: string, ctx: ImportFormContext): string {
    const kept = Object.entries(pairs(text)).filter(([code]) => {
        if (!ctx.known || ctx.known.has(code)) return true;
        ctx.leftOut(code);
        return false;
    });
    return kept
        .map(
            ([code, value]) =>
                `${code}=${value
                    .split('|')
                    .map((label) => asOption(ctx.options, code, label.trim()))
                    .join('|')}`,
        )
        .join(',');
}

/** One export row as the pack carries it: no empty cells, no left-out columns. */
function importRow(fields: Record<string, string>, ctx: ImportFormContext): Record<string, string> {
    const row: Record<string, string> = {};
    for (const [column, value] of Object.entries(fields)) {
        if (value === '' || LEFT_OUT.has(column)) continue;
        row[column] = column === 'additional_attributes' ? additional(value, ctx) : value;
    }
    return row;
}

/** The `product_export` item: every export row, a store view's rows too, in one Import API body. */
export function productExportItem(
    rows: ReadonlyArray<Record<string, string>>,
    ctx: ImportFormContext,
): DatapackFile['items'][number] {
    const items = rows.map((fields) => importRow(fields, ctx));
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
