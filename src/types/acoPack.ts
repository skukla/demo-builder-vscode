/**
 * The rows of an Adobe Commerce Optimizer (ACO) datapack, and the Commerce answers Demo Builder
 * reads to make one (datapack-engine step 14 item 19, PL-60).
 *
 * Where each shape comes from:
 * - The ACO rows: the Data Installer service's own schemas for them,
 *   `config/schemas/aco_<kind>.json` (dsc-data-installer-api 3ced647, read 2026-10-30), copied
 *   verbatim into `features/data-installer/config/aco-schemas/` and checked on every save. The
 *   row shapes `aco_wknd@main` holds (PL-60's table) agree.
 * - The Commerce answers: the fields the service's ACO export reads off them
 *   (`.rptc/research/datapack-engine/aco-export-spec.md` §2-3). Products and store
 *   configs are also in the captured Bodea answers (`tests/fixtures/commerce-rest/`); the
 *   attribute list, the category list, bundle options and attribute options are not recorded
 *   live in this repo.
 *
 * Imports nothing, so the webview's export screen reads the kinds from here too.
 *
 * @module types/acoPack
 */

/** Every ACO row names the catalog it belongs to: here, a Commerce store view code. */
export interface AcoSource {
    locale: string;
}

/** Where ACO shows an attribute. */
export type AcoMetadataVisibility =
    | 'PRODUCT_DETAIL'
    | 'PRODUCT_LISTING'
    | 'SEARCH_RESULTS'
    | 'PRODUCT_COMPARE';

/** An `aco_metadata` row: one attribute, for one store view. */
export interface AcoMetadataRow {
    code: string;
    source: AcoSource;
    visibleIn: AcoMetadataVisibility[];
    label: string;
    dataType: 'TEXT' | 'DECIMAL' | 'INTEGER' | 'BOOLEAN';
    searchTypes: Array<'AUTOCOMPLETE' | 'CONTAINS' | 'STARTS_WITH'>;
    filterable?: boolean;
    sortable?: boolean;
    searchable?: boolean;
    searchWeight?: number;
}

/** An `aco_categories` row: one category, for one store view. */
export interface AcoCategoryRow {
    /** The category's url path, as ACO spells a slug: `men/tops`. */
    slug: string;
    source: AcoSource;
    name: string;
    description: string | null;
}

/** One configurable choice's value. */
export interface AcoConfigurationValue {
    variantReferenceId: string;
    label: string;
}

/** A configurable parent's choice: one super attribute. */
export interface AcoConfiguration {
    attributeCode: string;
    label: string;
    defaultVariantReferenceId: string;
    type: 'CONFIGURABLE';
    values: AcoConfigurationValue[];
}

/** One group of a bundle's selections. */
export interface AcoBundleGroup {
    group: string;
    required: boolean;
    multiSelect: boolean;
    items: Array<{ sku: string; qty: number; userDefinedQty: boolean }>;
    defaultItemSkus?: string[];
}

/** A product's attribute value; a variant's carries its reference to the parent's choice. */
export interface AcoProductAttribute {
    code: string;
    values: string[];
    variantReferenceId?: string;
}

/** A link from a variant to its parent, or a bundle selection to its bundle. */
export interface AcoProductLink {
    type: 'VARIANT_OF' | 'in_bundle';
    sku: string;
}

/** An `aco_products` row: one product, for one store view. */
export interface AcoProductRow {
    sku: string;
    source: AcoSource;
    name: string;
    slug: string;
    status: 'ENABLED' | 'DISABLED';
    description: string | null;
    shortDescription?: string;
    visibleIn?: Array<'CATALOG' | 'SEARCH'>;
    metaTags?: { title?: string; description?: string; keywords?: string[] };
    attributes?: AcoProductAttribute[];
    images?: Array<{ url: string; label: string; roles: Array<'BASE' | 'THUMBNAIL'> }>;
    links?: AcoProductLink[];
    routes?: Array<{ path: string; position?: number }>;
    configurations?: AcoConfiguration[];
    bundles?: AcoBundleGroup[];
}

/** An `aco_price_books` row: a website's book (with its currency), or a customer group's under it. */
export type AcoPriceBookRow =
    | { priceBookId: string; name: string; currency: string }
    | { priceBookId: string; parentId: string; name: string };

/** One quantity tier of a price. */
export interface AcoTierPrice {
    qty: number;
    price: number;
}

/** An `aco_prices` row: one product's price in one book. */
export interface AcoPriceRow {
    sku: string;
    priceBookId: string;
    regular: number;
    discounts?: Array<{ code: string; price: number }>;
    tierPrices?: AcoTierPrice[];
}

/** The rows of each kind an ACO pack holds. */
export interface AcoPackRows {
    aco_metadata: AcoMetadataRow[];
    aco_categories: AcoCategoryRow[];
    aco_products: AcoProductRow[];
    aco_price_books: AcoPriceBookRow[];
    aco_prices: AcoPriceRow[];
}

/** One of the ACO kinds this export makes. */
export type AcoExportKind = keyof AcoPackRows;

/**
 * The kinds an ACO pack is made of here, in the service's order (`data_processors_aco_export.json`).
 * Its sixth, `aco_product_layers`, is a stub there that exports nothing, so it is not offered.
 */
export const ACO_EXPORT_KINDS: readonly AcoExportKind[] = [
    'aco_metadata',
    'aco_categories',
    'aco_products',
    'aco_price_books',
    'aco_prices',
];

// ── What the export reads from Commerce ────────────────────────────────────

/** A Commerce custom attribute, as products and categories carry them. */
export interface CommerceCustomAttribute {
    attribute_code: string;
    value: unknown;
}

/**
 * A flag on an attribute. Magento's attribute interface types some as strings (`"0"`/`"1"`) and
 * some as booleans; which the REST answer carries is not recorded live (spec §3).
 */
export type CommerceAttributeFlag = boolean | string | number;

/** One option of a select attribute. */
export interface CommerceAttributeOption {
    label?: string;
    value?: string;
}

/** One row of `GET products/attributes`, in the fields the ACO export reads. */
export interface CommerceAttributeRow {
    attribute_id?: number | string;
    attribute_code: string;
    default_frontend_label?: string;
    frontend_label?: string;
    frontend_input?: string;
    backend_type?: string;
    is_filterable?: CommerceAttributeFlag;
    is_searchable?: CommerceAttributeFlag;
    is_comparable?: CommerceAttributeFlag;
    is_visible_on_front?: CommerceAttributeFlag;
    is_visible_in_advanced_search?: CommerceAttributeFlag;
    is_used_in_grid?: CommerceAttributeFlag;
    used_in_product_listing?: CommerceAttributeFlag;
    used_for_sort_by?: CommerceAttributeFlag;
    options?: CommerceAttributeOption[];
}

/** One row of `GET categories/list`, in the fields the ACO export reads. */
export interface CommerceCategoryRow {
    id: number | string;
    name?: string;
    parent_id?: number | string | null;
    path?: string;
    /** Read at the top level, as the service reads it (spec §3). */
    description?: string;
    custom_attributes?: CommerceCustomAttribute[];
}

/** One `configurable_product_options` entry. */
export interface CommerceConfigurableOption {
    attribute_id?: number | string;
    label?: string;
    position?: number;
    values?: Array<{ value_index?: number | string; label?: string }>;
}

/** One `bundle_product_options` entry. */
export interface CommerceBundleOption {
    title?: string;
    type?: string;
    required?: boolean | number | string;
    position?: number;
    product_links?: Array<{
        sku?: string;
        id?: number | string;
        qty?: number | string;
        can_change_quantity?: boolean | number | string;
        is_default?: boolean | number | string;
    }>;
}

/** One tier price, as `GET products` answers it. */
export interface CommerceProductTierPrice {
    customer_group_id?: number | string;
    qty?: number | string;
    value?: number | string;
    website_id?: number | string;
    extension_attributes?: { website_id?: number | string };
}

/** One media gallery entry. */
export interface CommerceMediaEntry {
    file?: string;
    label?: string | null;
    types?: string[];
}

/** One product as `GET products` (and `GET products/{sku}`) answers it, in the fields the ACO export reads. */
export interface CommerceCatalogProduct {
    id?: number | string;
    sku: string;
    name?: string;
    type_id?: string;
    status?: number | string;
    visibility?: number | string;
    price?: number | string;
    custom_attributes?: CommerceCustomAttribute[];
    media_gallery_entries?: CommerceMediaEntry[];
    tier_prices?: CommerceProductTierPrice[];
    extension_attributes?: {
        category_links?: Array<{ category_id?: number | string; position?: number | string }>;
        configurable_product_options?: CommerceConfigurableOption[];
        configurable_product_links?: Array<number | string>;
        bundle_product_options?: CommerceBundleOption[];
    };
}

/** One row of `GET customerGroups/search`. */
export interface CommerceCustomerGroupRow {
    id: number;
    code: string;
}

/** One row of `GET store/storeConfigs`, in the fields the ACO export reads. */
export interface CommerceStoreConfigRow {
    id: number;
    code: string;
    website_id: number;
    default_display_currency_code?: string;
}
