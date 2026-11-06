/**
 * A datapack from a Commerce product export (owner, 2026-11-05: building packs took one-off scripts,
 * and "a missing tool is the finding").
 *
 * The export gives products, gift cards, the categories they sit in, and stock. It does not define
 * attributes: a product's colour and size need the attribute, its options and the attribute set to
 * exist. So a base pack (a datapack file) can supply them: the new pack is the base pack with its
 * products, gift cards and stock replaced by the export's, and its categories when it has none.
 * That is how Luma and Venia were rebuilt on 2026-11-05, with the Data Installer's own packs as the
 * base. Without a base pack the products keep Commerce's own fields, and the attributes left out
 * are named.
 *
 * @module features/data-installer/services/exportPack/buildPackFromExport
 */

import type { DatapackFile } from '../datapackZip';
import { CsvError } from './csvTable';
import {
    categoriesFromPaths,
    categoryUrlKeys,
    onRoot,
    type PackCategories,
} from './exportCategories';
import { optionLabels } from './exportOptions';
import { numberOf, productRow, TYPE_ORDER } from './exportProducts';
import { firstRows, openRow, readExportTable } from './exportRows';
import type { DatapackId } from '@/types/datapack';

/** What to build. */
export interface ExportPackInput {
    exportText: string;
    /** The export file's name: `.json` is read as JSON, anything else as CSV. */
    exportName: string;
    id: DatapackId;
    displayName: string;
    description?: string;
    /** A datapack file whose attributes, sets, categories and other kinds the new pack carries. */
    base?: DatapackFile;
}

/** The pack, and what an SC should know about how it was made. */
export interface ExportPackResult {
    pack: DatapackFile;
    products: number;
    giftCards: number;
    categories: number;
    /** Attribute codes the export's products name that the pack does not define, so left out. */
    leftOutAttributes: string[];
    /** Category paths the products name that the base pack's tree lacks, so not linked. */
    unmatchedCategories: string[];
}

/** The kinds the export supplies; a base pack's own rows of these are replaced. */
const FROM_EXPORT = new Set(['products', 'giftcards', 'source_items', 'stock_source_links']);

const STOCK_LINKS = {
    stockSourceLinks: [
        {
            stockSourceLink: {
                stock_id: 'Default Stock',
                source_code: 'default',
                priority: 1,
                extension_attributes: {},
            },
        },
    ],
};

const rank = (type: string | undefined): number => {
    const at = TYPE_ORDER.indexOf(type || 'simple');
    return at < 0 ? TYPE_ORDER.length : at;
};

type BaseAttribute = { attribute?: { attribute_code?: unknown; frontend_input?: unknown } };

/** The attribute codes a base pack defines, all of them or only those of one input type. */
function definedCodes(base: DatapackFile | undefined, input?: string): Set<string> {
    const rows = base?.items.find((item) => item.dataType === 'product_attributes')?.records;
    const attributes = Array.isArray(rows) ? (rows as BaseAttribute[]) : [];
    const codes = attributes
        .filter((row) => !input || row.attribute?.frontend_input === input)
        .map((row) => row.attribute?.attribute_code);
    return new Set(codes.filter((code): code is string => typeof code === 'string'));
}

/**
 * Build the pack.
 *
 * @throws CsvError when the file is not a product export or holds no products
 */
export function buildPackFromExport(input: ExportPackInput): ExportPackResult {
    const rows = firstRows(readExportTable(input.exportText, input.exportName).map(openRow));
    if (rows.length === 0) throw new CsvError(`${input.exportName} holds no products.`);
    const baseTree = input.base?.items.find((item) => item.dataType === 'categories')?.records as
        | PackCategories
        | undefined;
    const root = baseTree?.root_category?.name ?? `${input.displayName} Catalog`;
    for (const row of rows) row.categories = onRoot(row.categories, root);
    const tree =
        baseTree ??
        categoriesFromPaths(
            rows.flatMap((row) => row.categories),
            root,
        );
    const urlKeys = categoryUrlKeys(tree);
    const unmatched = [
        ...new Set(rows.flatMap((row) => row.categories).filter((path) => !urlKeys.has(path))),
    ].sort();
    rows.sort((a, b) => rank(a.fields.product_type) - rank(b.fields.product_type));
    const leftOut = new Set<string>();
    const known = definedCodes(input.base);
    const multiselect = definedCodes(input.base, 'multiselect');
    const yesNo = definedCodes(input.base, 'boolean');
    const options = optionLabels(input.base);
    const prices = new Map(
        rows.map((row) => [row.fields.sku.trim(), numberOf(row.fields.price) ?? 0]),
    );
    const made = rows.map((row) =>
        productRow(row, {
            known,
            multiselect,
            yesNo,
            options,
            urlKeys,
            prices,
            leftOut: (code) => leftOut.add(code),
        }),
    );
    const products = made.filter((r) => r.product.type_id !== 'giftcard');
    const giftCards = made.filter((r) => r.product.type_id === 'giftcard');
    const stock = rows
        .filter((row) => row.fields.product_type !== 'configurable')
        .map((row) => ({
            sku: row.fields.sku.trim(),
            source_code: 'default',
            quantity: numberOf(row.fields.qty) ?? 0,
            status: (row.fields.is_in_stock ?? '1') === '1' ? 1 : 0,
            extension_attributes: {},
        }));
    const kept = (input.base?.items ?? []).filter(
        (item) => !FROM_EXPORT.has(item.dataType) && item.dataType !== 'categories',
    );
    const items: DatapackFile['items'] = [
        ...kept,
        { dataType: 'categories', records: tree },
        { dataType: 'products', records: products },
        ...(giftCards.length > 0 ? [{ dataType: 'giftcards', records: giftCards }] : []),
        { dataType: 'source_items', records: { sourceItems: stock } },
        { dataType: 'stock_source_links', records: STOCK_LINKS },
    ];
    return {
        pack: {
            id: input.id,
            displayName: input.displayName,
            ...(input.description ? { description: input.description } : {}),
            items,
        },
        products: products.length,
        giftCards: giftCards.length,
        categories: tree.categories.length,
        leftOutAttributes: [...leftOut].sort(),
        unmatchedCategories: unmatched,
    };
}
