/**
 * One export row as the `products` row Demo Builder's engine installs (`productsKind.ts`).
 *
 * The column names and values are Commerce's export's: `product_type`, `attribute_set_code`,
 * `product_online`, `visibility` as words ("Catalog, Search"), the image columns, and the bundle,
 * configurable, grouped and gift card columns. Each is turned into the REST field the install
 * sends, as the converter that rebuilt Luma and Venia does (2026-11-05); the gift card attribute
 * codes are the ones a live gift card answers (`GIFT_CARD_6`, captured 2026-10-30).
 *
 * An attribute from `additional_attributes` is kept only when the pack defines it (`known`), or it
 * is one of Commerce's own: a product naming an attribute the store lacks would be skipped at
 * install, so it is left out here and named instead.
 *
 * @module features/data-installer/services/exportPack/exportProducts
 */

import type { ProductRow } from '../demoBuilderEngine/productsKind';
import { asOption, type OptionLabels } from './exportOptions';
import { type ExportRow, pairs, splitList } from './exportRows';

const VISIBILITY: Record<string, number> = {
    'Not Visible Individually': 1,
    Catalog: 2,
    Search: 3,
    'Catalog, Search': 4,
};
const YES_NO_CONFIG: Record<string, string> = { 'Use config': '2', Yes: '1', No: '0' };
const MSRP: Record<string, string> = {
    'Use config': '0',
    'On Gesture': '1',
    'In Cart': '2',
    'Before Order Confirmation': '3',
};
const CONTAINER: Record<string, string> = {
    'Block after Info Column': 'container2',
    'Product Info Column': 'container1',
};
const LAYOUT: Record<string, string> = {
    'Product -- Full Width': 'product-full-width',
    '1 column': '1column',
};
/** Commerce's own attributes an export lists among the extras, kept whether or not the pack defines them. */
const ALWAYS_KEPT = new Set(['gift_wrapping_available', 'gift_wrapping_price', 'is_returnable']);
const USE_CONFIG = new Set(['gift_wrapping_available', 'is_returnable']);
/** Export column → attribute code, as a live gift card answers them. */
const GIFT_CARD_FIELDS: Array<[string, string]> = [
    ['giftcard_type', 'giftcard_type'],
    ['allow_open_amount', 'giftcard_allow_open_amount'],
    ['open_amount_min', 'giftcard_open_amount_min'],
    ['open_amount_max', 'giftcard_open_amount_max'],
];

const GIFT_CARD_CODES = new Set(GIFT_CARD_FIELDS.map(([code]) => code));

/** Children before the products that link them; the install makes them in two waves anyway. */
export const TYPE_ORDER = [
    'simple',
    'virtual',
    'downloadable',
    'giftcard',
    'configurable',
    'bundle',
    'grouped',
];

/** A number, as an integer when it is one; undefined for a blank. */
export function numberOf(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** `5/22/24` as Commerce's `2024-05-22 00:00:00`; anything else as written. */
function isoDate(value: string | undefined): string | undefined {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/u.exec(value ?? '');
    return m
        ? `20${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')} 00:00:00`
        : value || undefined;
}

/** What the product rows are built against. */
export interface ProductContext {
    /** The attribute codes the pack defines. */
    known: ReadonlySet<string>;
    /**
     * The pack's multi-select attributes. An export joins their values with `|` ("Yoga|Gym"); a pack
     * holds them as a list of labels, which the install turns into option ids one by one. Read whole,
     * "Yoga|Gym" named no option and 49 Luma products were skipped (live, 2026-11-06).
     */
    multiselect: ReadonlySet<string>;
    /**
     * The pack's yes/no attributes. An export writes "Yes" or "No"; Commerce takes 1 or 0 and refuses
     * the product otherwise, which skipped 163 Luma products (live, 2026-11-06).
     */
    yesNo: ReadonlySet<string>;
    /** The option labels of the pack's select and multi-select attributes (`exportOptions.ts`). */
    options: OptionLabels;
    /** A category's full path → its url key, the key a product links it by. */
    urlKeys: ReadonlyMap<string, string>;
    /** Each SKU's price, for a bundle's parts. */
    prices: ReadonlyMap<string, number>;
    /** Told of each attribute code left out because the pack does not define it. */
    leftOut: (code: string) => void;
}

type Attribute = { attribute_code: string; value: unknown };

const present = (value: unknown): boolean =>
    value !== undefined &&
    value !== '' &&
    value !== 'no_selection' &&
    !(Array.isArray(value) && value.length === 0);

/** The row's own fields, as custom attributes. */
function ownFields(f: Record<string, string>, categories: string[]): Attribute[] {
    const fields: Array<[string, unknown]> = [
        ['image', f.base_image],
        ['small_image', f.small_image],
        ['thumbnail', f.thumbnail_image],
        ['swatch_image', f.swatch_image],
        ['page_layout', LAYOUT[f.page_layout] ?? f.page_layout],
        ['options_container', CONTAINER[f.display_product_options_in] ?? 'container2'],
        ['gift_message_available', YES_NO_CONFIG[f.gift_message_available] ?? '2'],
        ['url_key', f.url_key],
        ['msrp_display_actual_price_type', MSRP[f.msrp_display_actual_price_type] ?? '0'],
        ['required_options', '0'],
        ['has_options', '0'],
        ['meta_title', f.meta_title],
        ['meta_keyword', f.meta_keywords],
        ['meta_description', f.meta_description],
        ['tax_class_id', f.tax_class_name === 'Taxable Goods' ? '2' : '0'],
        ['category_ids', categories],
        ['short_description', f.short_description],
        ['description', f.description],
        ['news_from_date', isoDate(f.new_from_date)],
    ];
    return fields
        .filter(([, value]) => present(value))
        .map(([code, value]) => ({ attribute_code: code, value }));
}

/** An export's yes/no as Commerce stores it. */
const YES_NO: Record<string, string> = { Yes: '1', No: '0' };

/**
 * An extra's value as the pack holds it: a multi-select's labels as a list, a yes/no attribute as 1
 * or 0, a yes/no setting as Commerce's code.
 */
function extraValue(code: string, value: string, ctx: ProductContext): unknown {
    if (ctx.multiselect.has(code))
        return value.split('|').map((label) => label.trim()).filter(Boolean).map((label) => asOption(ctx.options, code, label));
    if (ctx.yesNo.has(code)) return YES_NO[value] ?? value;
    if (ctx.options.has(code)) return asOption(ctx.options, code, value);
    return USE_CONFIG.has(code) ? (YES_NO_CONFIG[value] ?? value) : value;
}

/** The extras the pack can carry, Commerce's own type-specific attributes, and the defaults. */
function customAttributes(row: ExportRow, categories: string[], ctx: ProductContext): Attribute[] {
    const attrs = ownFields(row.fields, categories);
    for (const [code, value] of Object.entries(row.extra)) {
        if (!ctx.known.has(code) && !ALWAYS_KEPT.has(code)) {
            // A gift card's own fields are carried by `typeAttributes`, so they are not left out.
            if (!GIFT_CARD_CODES.has(code)) ctx.leftOut(code);
            continue;
        }
        attrs.push({ attribute_code: code, value: extraValue(code, value, ctx) });
    }
    for (const code of ['gift_wrapping_available', 'is_returnable']) {
        if (!attrs.some((a) => a.attribute_code === code))
            attrs.push({ attribute_code: code, value: '2' });
    }
    return [...attrs, ...typeAttributes(row)];
}

/** A bundle's and a gift card's own attributes. */
function typeAttributes(row: ExportRow): Attribute[] {
    const f = row.fields;
    if (f.product_type === 'giftcard') {
        return GIFT_CARD_FIELDS.filter(([, column]) => f[column]).map(([code, column]) => ({
            attribute_code: code,
            value: f[column],
        }));
    }
    if (f.product_type !== 'bundle') return [];
    const fixed = (column: string) =>
        String(f[column] ?? '').toLowerCase() === 'dynamic' ? '0' : '1';
    return [
        {
            attribute_code: 'shipment_type',
            value: f.bundle_shipment_type === 'together' ? '0' : '1',
        },
        { attribute_code: 'price_view', value: f.bundle_price_view === 'Price range' ? '0' : '1' },
        { attribute_code: 'sku_type', value: fixed('bundle_sku_type') },
        { attribute_code: 'price_type', value: fixed('bundle_price_type') },
        { attribute_code: 'weight_type', value: fixed('bundle_weight_type') },
    ];
}

/** A bundle's options, each part by SKU with its default quantity and price. */
function bundleOptions(
    row: ExportRow,
    sku: string,
    prices: ReadonlyMap<string, number>,
): unknown[] {
    const options = new Map<
        string,
        {
            title: string;
            required: boolean;
            type: string;
            position: number;
            sku: string;
            product_links: unknown[];
        }
    >();
    for (const value of row.bundleValues) {
        const title = value.name ?? '';
        let option = options.get(title);
        if (!option) {
            option = {
                title,
                required: value.required === '1',
                type: value.type || 'select',
                position: options.size,
                sku,
                product_links: [],
            };
            options.set(title, option);
        }
        const child = (value.sku ?? '').trim();
        option.product_links.push({
            sku: child,
            qty: numberOf(value.default_qty) || 1,
            position: option.product_links.length,
            is_default: value.default === '1',
            price: prices.get(child) ?? 0,
            price_type: null,
            can_change_quantity: value.can_change_qty === '1' ? 1 : 0,
        });
    }
    return [...options.values()];
}

/**
 * A configurable's options, by the attribute codes its variations name, each value the option it names
 * (Luma's variations say size "32" where the option is "Size 32"), and its children.
 */
function configurableParts(row: ExportRow, labelsOf: OptionLabels): { options: unknown[]; children: string[] } {
    const labels = pairs(row.fields.configurable_variation_labels);
    const codes = [
        ...new Set(row.variations.flatMap((v) => Object.keys(v).filter((code) => code !== 'sku'))),
    ];
    const options = codes.map((code, position) => ({
        attribute_id: code,
        label: labels[code] || code.replace(/_/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase()),
        position,
        values: [...new Set(row.variations.filter((v) => code in v).map((v) => v[code]))].map(
            (value) => ({ value_index: asOption(labelsOf, code, value) }),
        ),
    }));
    return { options, children: row.variations.map((v) => (v.sku ?? '').trim()) };
}

/** A grouped product's children, from `associated_skus` (`24-WG085=0.000000,…`), with default quantities. */
function groupedLinks(row: ExportRow, sku: string): unknown[] {
    return splitList(row.fields.associated_skus).map((entry, position) => {
        const [child, qty] = entry.split('=');
        return {
            sku,
            link_type: 'associated',
            linked_product_sku: child.trim(),
            linked_product_type: 'simple',
            position,
            extension_attributes: { qty: numberOf(qty) ?? 0 },
        };
    });
}

/** The extension attributes: website, categories, stock, and the type's own parts. */
function extensionAttributes(
    row: ExportRow,
    sku: string,
    categories: string[],
    ctx: ProductContext,
): Record<string, unknown> {
    const kind = row.fields.product_type || 'simple';
    const ext: Record<string, unknown> = {
        // The install puts every product on its own target website, whatever this says.
        website_ids: [1],
        category_links: categories.map((key) => ({ position: -1, category_id: key })),
        stock_item: { is_in_stock: (row.fields.is_in_stock ?? '1') === '1' },
    };
    if (kind === 'bundle') ext.bundle_product_options = bundleOptions(row, sku, ctx.prices);
    if (kind === 'configurable') {
        const { options, children } = configurableParts(row, ctx.options);
        ext.configurable_product_options = options;
        ext.configurable_product_links = children;
    }
    if (kind === 'giftcard')
        ext.giftcard_amounts = splitList(row.fields.giftcard_amount).map((v) => ({
            value: numberOf(v),
        }));
    return ext;
}

/** One export row as a pack's `products` row. */
export function productRow(row: ExportRow, ctx: ProductContext): { product: ProductRow } {
    const f = row.fields;
    const sku = f.sku.trim();
    const categories = row.categories
        .map((path) => ctx.urlKeys.get(path))
        .filter((key): key is string => key !== undefined);
    const kind = f.product_type || 'simple';
    const links = kind === 'grouped' ? groupedLinks(row, sku) : [];
    const weight = numberOf(f.weight);
    const product: ProductRow = {
        sku,
        name: (f.name ?? '').trim(),
        attribute_set_id: f.attribute_set_code || 'Default',
        price: numberOf(f.price) ?? 0,
        status: (f.product_online ?? '1') === '1' ? 1 : 2,
        visibility: VISIBILITY[f.visibility] ?? 4,
        type_id: kind,
        extension_attributes: extensionAttributes(row, sku, categories, ctx),
        options: [],
        tier_prices: [],
        custom_attributes: customAttributes(row, categories, ctx),
        ...(links.length > 0 ? { product_links: links } : {}),
        ...(weight !== undefined ? { weight } : {}),
    };
    return { product };
}
