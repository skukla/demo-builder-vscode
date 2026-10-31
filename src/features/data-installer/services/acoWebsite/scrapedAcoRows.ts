/**
 * Products read off a website, as the rows of an ACO pack (PL-60 slice A, "From a website").
 *
 * The rows are the ones G5's Commerce export makes (`types/acoPack.ts`), so one pack format serves
 * every source (owner, P3). What a website cannot give is handled in the open, never made up:
 *
 * - a SKU the page did not state is made from the name (at most 8 characters, as DSC's scraper is
 *   reported to make them) and named as proposed;
 * - a product with no price gets no price row, and is named as unpriced;
 * - a product priced in another currency than the pack's, or two products stating one SKU, or an
 *   image ACO cannot fetch, is refused by name before anything is made.
 *
 * Categories are one level, each name its own slug; option dimensions (size, colour) become
 * product attributes with an `aco_metadata` row each. No variants are made: a page shows options,
 * not variant SKUs.
 *
 * @module features/data-installer/services/acoWebsite/scrapedAcoRows
 */

import { slugOfLabel } from '../acoExport/acoRowParts';
import type {
    AcoCategoryRow,
    AcoMetadataRow,
    AcoPackRows,
    AcoPriceRow,
    AcoProductAttribute,
    AcoProductRow,
} from '@/types/acoPack';
import {
    PROPOSABLE_FIELDS,
    type ProposableField,
    type ScrapedProduct,
    type ScrapedProductAttribute,
} from '@/types/scrapedProduct';

/** Longest SKU this makes from a name (DSC's rule, as reported). */
const MADE_SKU_MAX = 8;
/** The schema's longest category name. */
const CATEGORY_NAME_MAX = 128;

/** A website's products refused, in words the agent and the SC can act on. */
export class ScrapedPackError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScrapedPackError';
    }
}

/** What the pack is made for. */
export interface ScrapedPackOptions {
    locale: string;
    /** ISO 4217; every stated price must be in it. */
    currency: string;
    priceBookId: string;
    priceBookName: string;
}

/** One product's values the page did not state. */
export interface ProposedValues {
    sku: string;
    name: string;
    fields: ProposableField[];
}

/** The rows, and what the SC should review before loading them. */
export interface ScrapedPackRows {
    rows: AcoPackRows;
    proposed: ProposedValues[];
    /** SKUs of products with no price, so no price row. */
    unpriced: string[];
}

const isFetchable = (url: string): boolean => {
    try {
        const { protocol } = new URL(url);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
};

/** Refuse what cannot be made into a pack honestly, naming every product it is about. */
function refuseUnusable(products: readonly ScrapedProduct[], currency: string): void {
    if (products.length === 0) throw new ScrapedPackError('There are no products to put in an ACO pack.');
    const noImage = products.filter((p) => !isFetchable(p.data.image)).map((p) => p.data.name);
    if (noImage.length > 0)
        throw new ScrapedPackError(
            `ACO fetches each image from its URL, so it must be an http(s) URL: ${noImage.join(', ')} ${noImage.length === 1 ? 'has' : 'have'} none. Leave them out, or find each one's image URL.`,
        );
    const otherCurrency = products.filter(
        (p) => p.data.currency !== undefined && p.data.currency.trim().toUpperCase() !== currency,
    );
    if (otherCurrency.length > 0)
        throw new ScrapedPackError(
            `One pack has one price book, in one currency: ${otherCurrency.map((p) => `${p.data.name} is priced in ${String(p.data.currency).toUpperCase()}`).join(', ')}, not ${currency}.`,
        );
    const bySku = new Map<string, string[]>();
    for (const p of products) {
        const sku = p.data.sku?.trim();
        if (sku) bySku.set(sku, [...(bySku.get(sku) ?? []), p.data.name]);
    }
    const clashes = [...bySku].filter(([, names]) => names.length > 1);
    if (clashes.length > 0)
        throw new ScrapedPackError(
            `A SKU names one product: ${clashes.map(([sku, names]) => `${sku} is stated by ${names.join(' and ')}`).join('; ')}.`,
        );
}

/** A name's letters and digits, upper-cased, cut to 8, made unique with a number at its end. */
function madeSku(name: string, taken: Set<string>): string {
    const base = name.toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, MADE_SKU_MAX) || 'ITEM';
    let sku = base;
    for (let n = 2; taken.has(sku); n += 1) {
        const tail = String(n);
        sku = `${base.slice(0, MADE_SKU_MAX - tail.length)}${tail}`;
    }
    return sku;
}

/** The first unused of `base`, `base-2`, `base-3` … */
function uniqueSlug(base: string, taken: Set<string>): string {
    let slug = base;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    taken.add(slug);
    return slug;
}

const attributeCode = (name: string): string => slugOfLabel(name).replace(/-/gu, '_');

/** The option dimensions a product page offered, as product attributes. */
function attributesOf(attributes: readonly ScrapedProductAttribute[] = []): AcoProductAttribute[] {
    return attributes
        .map((a) => ({ code: attributeCode(a.name), values: a.values.map((v) => v.trim()).filter(Boolean) }))
        .filter((a) => a.code !== '' && a.values.length > 0);
}

/** The pack's categories, one per distinct slug, named as first seen. */
function categoryRows(products: readonly ScrapedProduct[], locale: string): AcoCategoryRow[] {
    const rows = new Map<string, AcoCategoryRow>();
    for (const name of products.flatMap((p) => p.data.categories ?? [])) {
        const slug = slugOfLabel(name);
        if (slug && !rows.has(slug))
            rows.set(slug, { slug, source: { locale }, name: name.trim().slice(0, CATEGORY_NAME_MAX), description: null });
    }
    return [...rows.values()];
}

/** One `aco_metadata` row per option dimension, labelled as the page first labelled it. */
function metadataRows(products: readonly ScrapedProduct[], locale: string): AcoMetadataRow[] {
    const rows = new Map<string, AcoMetadataRow>();
    for (const attribute of products.flatMap((p) => p.data.attributes ?? [])) {
        const code = attributeCode(attribute.name);
        if (code && !rows.has(code))
            rows.set(code, {
                code,
                source: { locale },
                visibleIn: ['PRODUCT_DETAIL'],
                label: attribute.name.trim(),
                dataType: 'TEXT',
                searchTypes: [],
                filterable: true,
            });
    }
    return [...rows.values()];
}

/** One product's row. */
function productRow(product: ScrapedProduct, sku: string, slug: string, locale: string): AcoProductRow {
    const { data } = product;
    const routes = (data.categories ?? []).map(slugOfLabel).filter(Boolean);
    const attributes = attributesOf(data.attributes);
    const name = data.name.trim();
    return {
        sku,
        source: { locale },
        name,
        slug,
        status: 'ENABLED',
        visibleIn: ['CATALOG', 'SEARCH'],
        description: data.description?.trim() ? data.description.trim() : null,
        images: [{ url: data.image, label: name, roles: ['BASE', 'THUMBNAIL'] }],
        ...(routes.length > 0 ? { routes: [...new Set(routes)].map((path) => ({ path })) } : {}),
        ...(attributes.length > 0 ? { attributes } : {}),
    };
}

/** The proposed fields in their one order, with `sku` when this made it. */
function proposedFields(product: ScrapedProduct, skuMade: boolean): ProposableField[] {
    const marked = new Set(product.proposed ?? []);
    if (skuMade) marked.add('sku');
    return PROPOSABLE_FIELDS.filter((field) => marked.has(field));
}

/**
 * The pack's rows for these products.
 *
 * @throws ScrapedPackError when there are no products, an image is not an http(s) URL, a price
 *   is in another currency than the pack's, or two products state one SKU
 */
export function scrapedAcoRows(products: readonly ScrapedProduct[], options: ScrapedPackOptions): ScrapedPackRows {
    const currency = options.currency.trim().toUpperCase();
    refuseUnusable(products, currency);
    const { locale, priceBookId } = options;
    const skus = new Set(products.map((p) => p.data.sku?.trim()).filter((s): s is string => Boolean(s)));
    const slugs = new Set<string>();
    const result: ScrapedPackRows = {
        rows: { aco_metadata: [], aco_categories: [], aco_products: [], aco_price_books: [], aco_prices: [] },
        proposed: [],
        unpriced: [],
    };
    const prices: AcoPriceRow[] = [];
    for (const product of products) {
        const stated = product.data.sku?.trim();
        const sku = stated || madeSku(product.data.name, skus);
        skus.add(sku);
        const slug = uniqueSlug(slugOfLabel(product.data.name) || sku.toLowerCase(), slugs);
        result.rows.aco_products.push(productRow(product, sku, slug, locale));
        const price = product.data.price;
        if (price !== undefined && Number.isFinite(price) && price >= 0) prices.push({ sku, priceBookId, regular: price });
        else result.unpriced.push(sku);
        const fields = proposedFields(product, !stated);
        if (fields.length > 0) result.proposed.push({ sku, name: product.data.name.trim(), fields });
    }
    result.rows.aco_categories = categoryRows(products, locale);
    result.rows.aco_metadata = metadataRows(products, locale);
    result.rows.aco_prices = prices;
    if (prices.length > 0)
        result.rows.aco_price_books = [{ priceBookId, name: options.priceBookName, currency }];
    return result;
}
