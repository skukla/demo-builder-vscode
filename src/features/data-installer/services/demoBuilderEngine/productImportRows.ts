/**
 * A pack's product record (the `products` kind, the form most of the service's packs use) as an Import
 * API row, so it goes in with the fast route (`productExportKind.ts`): about 4.5 minutes for Luma against
 * about 7.5 one bulk request each (2026-11-06). The pack itself is not changed: it stays in the service's
 * form, and only how this engine sends it differs.
 *
 * Only what the import form carries without loss is converted: simple and virtual products, and a
 * configurable whose children's values can all be named. Anything else answers undefined and goes by
 * the bulk route as before: gift cards, bundles, grouped and downloadable products, custom options, tier
 * prices, a value holding a comma, `=` or `|` (the import's own separators), a tax class other than the
 * two Commerce ships, and an option value the store has no option for.
 *
 * Select and multi-select values go as option LABELS, which is what the import reads; a value that is an
 * option's id is named by its label first. Store-level layout and gift settings the row may carry
 * (`page_layout`, `options_container`, `gift_message_available`, …) are left at the store's defaults.
 *
 * @module features/data-installer/services/demoBuilderEngine/productImportRows
 */

import { sameText } from './b2bReads';
import type { ExportRow } from './productExportKind';
import { isNumeric, type ProductLookups } from './productLookups';
import type { ProductRow } from './productsKind';

/**
 * The row's custom attributes, with its `additional_attributes` object turned into more of them,
 * each value as text and a missing one as empty, as the service does (`ProductImportProcessor.js`
 * L97-114). The service then drops the row's own custom attributes; here the row's own win, code
 * for code, and the rest are kept.
 */
export function additionalAsCustom(row: ProductRow): NonNullable<ProductRow['custom_attributes']> {
    const own = row.custom_attributes ?? [];
    const added = Object.entries(row.additional_attributes ?? {})
        .filter(([code]) => !own.some((a) => a.attribute_code === code))
        .map(([code, value]) => ({ attribute_code: code, value: value === null || value === undefined ? '' : String(value) }));
    return [...own, ...added];
}

/** Product types the import form carries here; a configurable also needs its children named. */
const IMPORTED_TYPES = new Set(['simple', 'virtual', 'configurable']);

/** Commerce's own visibility codes, as the import names them. */
const VISIBILITY: Record<string, string> = {
    1: 'Not Visible Individually',
    2: 'Catalog',
    3: 'Search',
    4: 'Catalog, Search',
};

/** The two tax classes Commerce ships, by id. */
const TAX_CLASS: Record<string, string> = { 0: 'None', 2: 'Taxable Goods' };

/** Custom attributes that are a column of their own in the import form. */
const COLUMN_OF: Record<string, string> = {
    url_key: 'url_key',
    description: 'description',
    short_description: 'short_description',
    meta_title: 'meta_title',
    meta_keyword: 'meta_keywords',
    meta_description: 'meta_description',
    special_price: 'special_price',
    news_from_date: 'new_from_date',
    news_to_date: 'new_to_date',
};

/** The import's separators: a value holding one cannot be written in `additional_attributes`. */
const SEPARATORS = /[,=|]/u;

/** Why a row cannot go in import form; it goes by the bulk route. */
class NotImportable extends Error {}

/** Lookups for one install's conversions: the store's category paths, read once each. */
export interface ImportRowLookups {
    lk: ProductLookups;
    /** A category's path of names from the store's root, by id, read once. */
    pathOf: (id: string) => Promise<string>;
}

/** The lookups, over this install's product lookups. */
export function importRowLookups(lk: ProductLookups): ImportRowLookups {
    const paths = new Map<string, Promise<string>>();
    const nameOf = async (id: string) => (await lk.category(id))?.name ?? '';
    const pathOf = (id: string) => {
        const known = paths.get(id);
        if (known) return known;
        const made = (async () => {
            const ids = ((await lk.category(id))?.path ?? '').split('/').filter(Boolean).slice(1);
            if (ids.length === 0) throw new NotImportable(`category ${id} has no path`);
            return (await Promise.all(ids.map(nameOf))).join('/');
        })();
        paths.set(id, made);
        return made;
    };
    return { lk, pathOf };
}

/** One select or multi-select value as its option's label. */
async function optionLabel(lk: ProductLookups, code: string, value: string): Promise<string> {
    const options = (await lk.attribute(code)).options ?? [];
    const option =
        options.find((o) => sameText(o.label, value)) ?? options.find((o) => o.value === value);
    if (!option?.label) throw new NotImportable(`${code} has no option "${value}"`);
    return option.label.trim();
}

/** A value's labels: a list, or a comma-joined string as product records hold them. */
const valuesOf = (value: unknown): string[] =>
    (Array.isArray(value) ? value : String(value).split(','))
        .map((v) => String(v).trim())
        .filter(Boolean);

/** A custom attribute as `code=value` for `additional_attributes`, or undefined for one left at the default. */
async function additionalPair(
    lk: ProductLookups,
    code: string,
    value: unknown,
): Promise<string | undefined> {
    if (value === null || value === undefined || value === '') return undefined;
    const attribute = await lk.attribute(code).catch(() => undefined);
    if (!attribute?.is_user_defined) return undefined;
    const input = attribute.frontend_input ?? '';
    let pieces: string[];
    if (input === 'select' || input === 'multiselect') pieces = await Promise.all(valuesOf(value).map((v) => optionLabel(lk, code, v)));
    else if (input === 'boolean') pieces = [['1', 'true', 'yes'].includes(String(value).toLowerCase()) ? 'Yes' : 'No'];
    else pieces = [String(value)];
    if (pieces.some((piece) => SEPARATORS.test(piece))) throw new NotImportable(`${code} holds a separator`);
    return `${code}=${pieces.join('|')}`;
}

/** The row's category paths, comma-joined, from its category links. */
async function categoriesOf(look: ImportRowLookups, row: ProductRow): Promise<string | undefined> {
    const links = (
        (row.extension_attributes?.category_links as
            | Array<{ category_id?: unknown }>
            | undefined) ?? []
    ).map((l) => String(l.category_id ?? ''));
    if (links.length === 0) return undefined;
    const ids = await Promise.all(
        links.map(async (key) => (isNumeric(key) ? key : String(await look.lk.categoryId(key)))),
    );
    const paths = await Promise.all(ids.map((id) => look.pathOf(id)));
    if (paths.some((p) => p.includes(',')))
        throw new NotImportable('a category name holds a comma');
    return paths.join(',');
}

/** A configurable's variations and their labels, each child's values named. */
async function variationsOf(
    lk: ProductLookups,
    row: ProductRow,
    children: ReadonlyMap<string, ProductRow>,
): Promise<Record<string, string>> {
    const ext = row.extension_attributes ?? {};
    const options =
        (ext.configurable_product_options as
            | Array<{ attribute_id?: unknown; label?: unknown }>
            | undefined) ?? [];
    const links = (ext.configurable_product_links as unknown[] | undefined) ?? [];
    const codes = options.map((o) => String(o.attribute_id ?? ''));
    if (codes.length === 0 || links.length === 0 || codes.some((c) => isNumeric(c)))
        throw new NotImportable('a configurable without named options');
    const variations = await Promise.all(
        links.map(async (link) => {
            const child = children.get(String(link).toLowerCase());
            if (!child) throw new NotImportable(`child ${String(link)} is not in the pack`);
            const values = additionalAsCustom(child);
            const pairs = await Promise.all(
                codes.map(async (code) => {
                    const value = values.find((a) => a.attribute_code === code)?.value;
                    if (value === undefined || value === null || value === '')
                        throw new NotImportable(`child ${child.sku} has no ${code}`);
                    return `${code}=${await optionLabel(lk, code, String(value))}`;
                }),
            );
            return [`sku=${child.sku}`, ...pairs].join(',');
        }),
    );
    const labels = options
        .map((o) => `${String(o.attribute_id)}=${String(o.label ?? o.attribute_id)}`)
        .join(',');
    return { configurable_variations: variations.join('|'), configurable_variation_labels: labels };
}

/** A record's status as the import's `product_online`: 1 enabled, 0 disabled; undefined when unsaid. */
function onlineOf(status: unknown): string | undefined {
    if (status === undefined || status === null) return undefined;
    return Number(status) === 1 ? '1' : '0';
}

/** A row's own columns: its type, set, name, prices, status and visibility. */
function ownColumns(row: ProductRow): Record<string, string> {
    const r = row as ProductRow & {
        price?: unknown;
        weight?: unknown;
        status?: unknown;
        visibility?: unknown;
    };
    const columns: Record<string, unknown> = {
        sku: row.sku,
        product_type: row.type_id,
        attribute_set_code: row.attribute_set_id,
        name: row.name,
        price: r.price,
        weight: r.weight,
        product_online: onlineOf(r.status),
        visibility: r.visibility === undefined ? undefined : VISIBILITY[String(r.visibility)],
    };
    return Object.fromEntries(
        Object.entries(columns)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)]),
    );
}

/** The custom attributes' columns: own columns, the tax class, and `additional_attributes`. */
async function customColumns(lk: ProductLookups, row: ProductRow): Promise<Record<string, string>> {
    const columns: Record<string, string> = {};
    const additional: string[] = [];
    for (const { attribute_code: code, value } of additionalAsCustom(row)) {
        if (COLUMN_OF[code]) {
            if (value !== null && value !== undefined && value !== '')
                columns[COLUMN_OF[code]] = String(value);
        } else if (code === 'tax_class_id') {
            const name = TAX_CLASS[String(value)];
            if (name === undefined) throw new NotImportable(`tax class ${String(value)}`);
            columns.tax_class_name = name;
        } else {
            const pair = await additionalPair(lk, code, value);
            if (pair) additional.push(pair);
        }
    }
    if (additional.length > 0) columns.additional_attributes = additional.join(',');
    return columns;
}

/**
 * The row as an import row, or undefined when it carries what the import form cannot (see the module
 * comment): that row goes by the bulk route.
 *
 * @param children - the pack's rows by lowercased SKU, for a configurable's children
 */
export async function importRowOf(
    look: ImportRowLookups,
    row: ProductRow,
    children: ReadonlyMap<string, ProductRow>,
): Promise<ExportRow | undefined> {
    const r = row as ProductRow & { options?: unknown[]; product_links?: unknown[] };
    if (
        !IMPORTED_TYPES.has(row.type_id) ||
        (r.options?.length ?? 0) > 0 ||
        (row.tier_prices?.length ?? 0) > 0 ||
        (r.product_links?.length ?? 0) > 0
    )
        return undefined;
    if (isNumeric(row.attribute_set_id)) return undefined;
    try {
        const categories = await categoriesOf(look, row);
        return {
            ...ownColumns(row),
            ...(await customColumns(look.lk, row)),
            ...(categories ? { categories } : {}),
            ...(row.type_id === 'configurable' ? await variationsOf(look.lk, row, children) : {}),
        } as ExportRow;
    } catch (error) {
        if (error instanceof NotImportable) return undefined;
        throw error;
    }
}
