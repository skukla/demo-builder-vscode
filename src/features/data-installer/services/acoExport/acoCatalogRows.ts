/**
 * The two catalog-wide ACO kinds, made from Commerce's lists the way the Data Installer service
 * makes them (`.rptc/research/datapack-engine/aco-export-spec.md` §3):
 *
 * - `aco_metadata`: one row per user-defined attribute per store view
 *   (`acoMetadataExportTransform.js`, and the two values `data_processors_aco_export.json`
 *   L14-17 sets on every row).
 * - `aco_categories`: one row per category per store view, Root Catalog and the store roots left
 *   out (`acoCategoriesCommerceFetch.js` L237-274, `acoCategoriesExportTransform.js` L49-78).
 *
 * Only the Commerce side of the service's mapping is ported: its pass-through of rows already in
 * ACO's shape serves its ACO import, and no Commerce answer carries those fields.
 *
 * @module features/data-installer/services/acoExport/acoCatalogRows
 */

import { customAttributeMap, slugOfPath } from './acoRowParts';
import type {
    AcoCategoryRow,
    AcoMetadataRow,
    AcoMetadataVisibility,
    CommerceAttributeRow,
    CommerceCategoryRow,
} from '@/types/acoPack';

const EVERYWHERE: AcoMetadataVisibility[] = [
    'PRODUCT_DETAIL',
    'PRODUCT_LISTING',
    'SEARCH_RESULTS',
    'PRODUCT_COMPARE',
];

/**
 * Where ACO shows an attribute. The flags are tested against `true` and `false` exactly as the
 * service tests them (L55-77), so a flag Commerce sends as `"1"` counts for nothing here: one live
 * read decides whether that should change (spec §3).
 */
function visibilityOf(attribute: CommerceAttributeRow): AcoMetadataVisibility[] {
    const shown: AcoMetadataVisibility[] = [];
    if (
        attribute.is_visible_on_front !== false &&
        attribute.is_visible_in_advanced_search !== false
    )
        shown.push('PRODUCT_DETAIL');
    if (attribute.used_in_product_listing === true || attribute.is_used_in_grid === true)
        shown.push('PRODUCT_LISTING');
    if (attribute.is_searchable === true || attribute.is_visible_in_advanced_search === true)
        shown.push('SEARCH_RESULTS');
    if (attribute.is_comparable === true) shown.push('PRODUCT_COMPARE');
    return shown.length > 0 ? shown : [...EVERYWHERE];
}

/** ACO's data type, from how Commerce enters and stores the attribute (L83-99). */
function dataTypeOf(attribute: CommerceAttributeRow): AcoMetadataRow['dataType'] {
    const input = (attribute.frontend_input ?? '').toLowerCase();
    const stored = (attribute.backend_type ?? '').toLowerCase();
    if (input === 'boolean') return 'BOOLEAN';
    if (input === 'price' || stored === 'decimal') return 'DECIMAL';
    if (stored === 'int') return 'INTEGER';
    return 'TEXT';
}

/**
 * The three search flags, each only when Commerce sent it, read with `Boolean()` as the service
 * reads them (L151-159): `"0"` is truthy, a quirk carried as it is.
 */
function searchFlags(
    attribute: CommerceAttributeRow,
): Pick<AcoMetadataRow, 'filterable' | 'sortable' | 'searchable'> {
    return {
        ...(attribute.is_filterable !== undefined
            ? { filterable: Boolean(attribute.is_filterable) }
            : {}),
        ...(attribute.used_for_sort_by !== undefined
            ? { sortable: Boolean(attribute.used_for_sort_by) }
            : {}),
        ...(attribute.is_searchable !== undefined
            ? { searchable: Boolean(attribute.is_searchable) }
            : {}),
    };
}

/** One attribute's row for one store view. */
function metadataRow(attribute: CommerceAttributeRow, locale: string): AcoMetadataRow {
    const code = attribute.attribute_code;
    return {
        code,
        source: { locale },
        visibleIn: visibilityOf(attribute),
        label: attribute.frontend_label ?? attribute.default_frontend_label ?? code,
        dataType: dataTypeOf(attribute),
        ...searchFlags(attribute),
        searchTypes: ['AUTOCOMPLETE'],
        searchWeight: 1,
    };
}

/** Every attribute, once per store view (L173-215); an attribute with no code is left out. */
export function metadataRows(
    attributes: readonly CommerceAttributeRow[],
    storeViews: readonly string[],
): AcoMetadataRow[] {
    const named = attributes.filter((attribute) => attribute.attribute_code.trim() !== '');
    return named.flatMap((attribute) => storeViews.map((locale) => metadataRow(attribute, locale)));
}

const isTop = (parentId: CommerceCategoryRow['parent_id']) =>
    parentId === 0 || parentId === '0' || parentId === null || parentId === undefined;

/**
 * The categories an ACO pack carries: every one but Root Catalog, the store roots directly under
 * it, and an id 1 named like "root" (L237-274). Every root's tree is kept, whichever store view
 * it serves, as the service keeps it.
 */
function exportable(categories: readonly CommerceCategoryRow[]): CommerceCategoryRow[] {
    const roots = new Set(categories.filter((c) => isTop(c.parent_id)).map((c) => Number(c.id)));
    if (roots.size === 0) roots.add(1);
    return categories.filter((c) => {
        if (isTop(c.parent_id) || roots.has(Number(c.parent_id))) return false;
        return !(Number(c.id) === 1 && (c.name ?? '').toLowerCase().includes('root'));
    });
}

/** The url path of a category as a slug, when it has a usable one. */
const slugOf = (category: CommerceCategoryRow) => slugOfPath(customAttributeMap(category).url_path);

/**
 * One row per category for this store view. A category without a usable url path or a name is
 * left out; the description is the category's own top-level field, else null (L71-75).
 */
export function categoryRows(
    categories: readonly CommerceCategoryRow[],
    locale: string,
): AcoCategoryRow[] {
    const rows: AcoCategoryRow[] = [];
    for (const category of exportable(categories)) {
        const slug = slugOf(category);
        const name = (category.name ?? '').trim();
        if (!slug || !name) continue;
        const description = category.description ? category.description : null;
        rows.push({ slug, source: { locale }, name, description });
    }
    return rows;
}

/** Every category's slug by id, store roots included: what a product's routes are named by. */
export function categorySlugs(categories: readonly CommerceCategoryRow[]): Map<string, string> {
    const slugs = new Map<string, string>();
    for (const category of categories) {
        const slug = slugOf(category);
        if (slug) slugs.set(String(category.id), slug);
    }
    return slugs;
}
