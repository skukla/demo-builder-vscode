/**
 * One Commerce product as one `aco_products` row, the Data Installer service's mapping
 * (`acoProductsExportTransform.js` L262-366; `.rptc/research/datapack-engine/aco-export-spec.md` §3).
 * Configurables and bundles are assembled around it in `acoProductGraph.ts`.
 *
 * @module features/data-installer/services/acoExport/acoProductRow
 */

import { customAttributeMap } from './acoRowParts';
import type {
    AcoBundleGroup,
    AcoConfiguration,
    AcoProductAttribute,
    AcoProductRow,
    CommerceCatalogProduct,
    CommerceMediaEntry,
} from '@/types/acoPack';

/** Custom attributes that are fields of the row, or nothing ACO takes, never `attributes` (L9-33). */
const STRUCTURAL = new Set([
    'url_key',
    'category_ids',
    'description',
    'short_description',
    'meta_title',
    'meta_description',
    'meta_keyword',
    'image',
    'small_image',
    'thumbnail',
    'swatch_image',
    'media_gallery',
    'gallery',
    'status',
    'visibility',
    'tax_class_id',
    'msrp_display_actual_price_type',
    'price',
    'special_price',
    'special_from_date',
    'special_to_date',
    'cost',
    'weight',
]);

/** Commerce's image roles, as ACO names them; the rest are not carried (L54-58). */
const IMAGE_ROLES: Record<string, 'BASE' | 'THUMBNAIL'> = {
    image: 'BASE',
    small_image: 'THUMBNAIL',
    thumbnail: 'THUMBNAIL',
};

/** What a configurable, a variant or a bundle adds to its row. */
export interface ProductRowExtras {
    /** Attributes left out of `attributes` (a configurable's super attributes). */
    omit?: ReadonlySet<string>;
    configurations?: AcoConfiguration[];
    bundles?: AcoBundleGroup[];
    /** A variant's own attributes, in place of the rest. */
    attributes?: AcoProductAttribute[];
}

const STATUS: Record<number, AcoProductRow['status']> = { 1: 'ENABLED', 2: 'DISABLED' };
const VISIBLE_IN: Record<number, NonNullable<AcoProductRow['visibleIn']>> = {
    2: ['CATALOG'],
    3: ['SEARCH'],
    4: ['CATALOG', 'SEARCH'],
};

/** SEO fields, keywords split on commas; undefined when there are none (L307-325). */
function metaTagsOf(map: Record<string, string>): AcoProductRow['metaTags'] {
    const { meta_title: title, meta_description: description, meta_keyword: keywords } = map;
    if (!title && !description && !keywords) return undefined;
    return {
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(keywords
            ? {
                  keywords: keywords
                      .split(',')
                      .map((k) => k.trim())
                      .filter(Boolean),
              }
            : {}),
    };
}

/** Every other custom attribute with a value, as it is stored (L200-215). */
function attributesOf(
    map: Record<string, string>,
    omit: ReadonlySet<string>,
): AcoProductAttribute[] {
    return Object.entries(map)
        .filter(([code, value]) => !STRUCTURAL.has(code) && !omit.has(code) && value.trim() !== '')
        .map(([code, value]) => ({ code, values: [value] }));
}

/** The media gallery as images: the file as the url, BASE when no role maps (L169-194). */
function imagesOf(
    entries: readonly CommerceMediaEntry[] = [],
): NonNullable<AcoProductRow['images']> {
    const images: NonNullable<AcoProductRow['images']> = [];
    for (const entry of entries) {
        const url = (entry.file ?? '').trim();
        if (!url) continue;
        const roles = [
            ...new Set((entry.types ?? []).map((type) => IMAGE_ROLES[type]).filter(Boolean)),
        ];
        const label = entry.label ?? '';
        images.push({ url, label, roles: roles.length > 0 ? roles : ['BASE'] });
    }
    return images;
}

/** A route per category with a slug, positioned as the store positions it (L128-163). */
function routesOf(
    product: CommerceCatalogProduct,
    ids: string | undefined,
    slugs: ReadonlyMap<string, string>,
): NonNullable<AcoProductRow['routes']> {
    const positions = new Map<string, number>();
    for (const link of product.extension_attributes?.category_links ?? []) {
        if (
            link.category_id === undefined ||
            link.position === undefined ||
            Number.isNaN(Number(link.position))
        )
            continue;
        positions.set(String(link.category_id), Number(link.position));
    }
    const routes: NonNullable<AcoProductRow['routes']> = [];
    for (const id of (ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        const path = slugs.get(id);
        if (!path) continue;
        const position = positions.get(id);
        routes.push(position === undefined ? { path } : { path, position });
    }
    return routes;
}

/** Only the arrays that hold something, as the service leaves empty ones out. */
function nonEmpty<K extends string, T>(key: K, list: T[] | undefined): Partial<Record<K, T[]>> {
    return list && list.length > 0 ? ({ [key]: list } as Partial<Record<K, T[]>>) : {};
}

/**
 * The product's row for one store view, or undefined when it has no SKU, name, url key or a
 * status of 1 or 2 (L267-282), as the service leaves those out.
 */
export function productRow(
    product: CommerceCatalogProduct,
    locale: string,
    slugs: ReadonlyMap<string, string>,
    extras: ProductRowExtras = {},
): AcoProductRow | undefined {
    const map = customAttributeMap(product);
    const sku = product.sku.trim();
    const name = (product.name ?? '').trim();
    const slug = (map.url_key ?? '').trim();
    const status = STATUS[Number(product.status)];
    if (!sku || !name || !slug || !status) return undefined;
    const attributes = extras.attributes?.length
        ? extras.attributes
        : attributesOf(map, extras.omit ?? new Set());
    const metaTags = metaTagsOf(map);
    return {
        sku,
        name,
        slug,
        status,
        source: { locale },
        ...nonEmpty('visibleIn', VISIBLE_IN[Number(product.visibility)]),
        description: map.description ? map.description : null,
        ...(map.short_description ? { shortDescription: map.short_description } : {}),
        ...(metaTags ? { metaTags } : {}),
        ...nonEmpty('configurations', extras.configurations),
        ...nonEmpty('bundles', extras.bundles),
        ...nonEmpty('attributes', attributes),
        ...nonEmpty('images', imagesOf(product.media_gallery_entries)),
        ...nonEmpty('routes', routesOf(product, map.category_ids, slugs)),
    };
}
