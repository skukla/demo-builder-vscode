/**
 * Commerce REST answers that "Assign products" and the attribute-set check read (AB-74), in
 * the fields they read. Typed here so the services and the tests' fixtures share one shape.
 *
 * Where each shape comes from:
 * - the bulk accept and the bulk status: Adobe's REST docs, `use-rest/bulk-endpoints` and
 *   `use-rest/operation-status-endpoints` (read 2026-10-09); the sandbox answered a
 *   `bulk_uuid` the same way on 2026-09-30 (backlog item demo-data-authoring);
 * - the orders and returns the demo-data wipe closes: Adobe's ACCS REST reference
 *   (adobe-commerce-saas.redoc.ly, read 2026-10-30) and Magento's `Sales` / `Rma` service contracts;
 * - the attribute sets, their attributes and their groups: Magento's service contracts behind
 *   the routes (`Eav/Api/Data/AttributeSetInterface`, `AttributeGroupInterface` and its
 *   extension attributes `attribute_group_code` / `sort_order`, 2.4-develop, read 2026-10-09).
 *   No live answer is recorded in the repo for these.
 *
 * Imports nothing.
 *
 * @module types/commerceWire
 */

/** `POST|PUT V1/async/bulk/<path>`: the call was queued, one item per request body. */
export interface CommerceBulkAccepted {
    bulk_uuid?: string;
    request_items?: Array<{ id: number; data_hash?: string; status: string }>;
    errors?: boolean;
}

/** `GET V1/bulk/<uuid>/status`: status 1 complete, 2 and 3 failed, 4 open, 5 rejected. */
export interface CommerceBulkStatus {
    operations_list?: Array<{ id: number; status: number; result_message?: string | null; error_code?: number | null }>;
    user_type?: number;
    bulk_id?: string;
    description?: string;
    start_time?: string;
    user_id?: number | null;
    operation_count?: number;
}

/**
 * One product as `GET products` (a search page's item) answers it: the Bodea sandbox's
 * answer, captured 2026-09-27 (tests/fixtures/commerce-rest/products-page.json), in the fields
 * the datapack engine reads and writes back. Everything else a product carries passes through.
 */
export interface CommerceProduct {
    id?: number;
    sku: string;
    name?: string;
    attribute_set_id?: number | string;
    type_id?: string;
    created_at?: string;
    updated_at?: string;
    custom_attributes?: Array<{ attribute_code: string; value: unknown }>;
    extension_attributes?: {
        website_ids?: Array<number | string>;
        category_links?: Array<{ category_id: string | number; position?: number }>;
        stock_item?: Record<string, unknown>;
        configurable_product_options?: Array<{ attribute_id: string | number; values?: Array<{ value_index: string | number }>; [key: string]: unknown }>;
        configurable_product_links?: Array<string | number>;
        [key: string]: unknown;
    };
    tier_prices?: Array<{ customer_group_id: string | number; [key: string]: unknown }>;
    media_gallery_entries?: unknown[];
    [key: string]: unknown;
}

/** `GET products?…&fields=items[sku,attribute_set_id],total_count`: one page. */
export interface CommerceProductSetPage {
    items?: Array<{ sku?: string; attribute_set_id?: number }>;
    total_count?: number;
}

/** `GET products/attribute-sets/sets/list`. */
export interface CommerceAttributeSetList {
    items?: Array<{ attribute_set_id: number; attribute_set_name: string; sort_order?: number; entity_type_id?: number }>;
    total_count?: number;
}

/** One row of `GET products/attribute-sets/<id>/attributes` (a bare array of these). */
export interface CommerceSetAttribute {
    attribute_id?: number | string;
    attribute_code?: string;
    frontend_input?: string;
}

/** `GET products/attribute-sets/groups/list?…attribute_set_id…`. */
export interface CommerceAttributeGroupList {
    items?: Array<{
        attribute_group_id: number | string;
        attribute_group_name?: string;
        attribute_set_id?: number;
        extension_attributes?: { attribute_group_code?: string; sort_order?: string | number };
    }>;
    total_count?: number;
}

/*
 * the demo setup's Apply (AB-77). Where each shape comes from:
 * - system/config GET and PUT: Adobe's Commerce as a Cloud Service REST reference,
 *   `saas-integrations/system-config` (fields `path`, `value`, `scope`, `scope_code`; the PUT
 *   answer's `items` and `errors`). The round trip was run live on Justrite on 2026-10-10
 *   (`sales/totals_sort/tax` 40 -> 41 -> 40; a refused path comes back in `errors` under
 *   HTTP 200). The literal JSON was not recorded in the repo.
 * - product attribute create: Magento's `Catalog/Api/Data/ProductAttributeInterface` and the
 *   data installer's `config/schemas/product_attributes.json` (read 2026-10-10). Not recorded live.
 * - sources, stocks, stock-source links, source items: Magento's `InventoryApi` service
 *   contracts (`SourceInterface`, `StockInterface`, `StockSourceLinkInterface`) and the data
 *   installer's schemas and processors for the same routes (read 2026-10-10). The GET lists
 *   are what `setupChecks.ts` already reads. Not recorded live.
 * - shared catalogs and company assignment: Magento's `SharedCatalog/Api/Data/SharedCatalogInterface`
 *   and the data installer's `shared_catalogs_*` endpoints and processors (read 2026-10-10).
 *   Not recorded live.
 */

/** One row of `GET /V1/system/config`. */
export interface CommerceSystemConfigRow {
    path: string;
    value: string | null;
    scope: 'default' | 'website' | 'store' | string;
    scope_code?: string | null;
}

/** `GET /V1/system/config?…`: the rows at the asked scope. */
export interface CommerceSystemConfigList {
    items?: CommerceSystemConfigRow[];
}

/** One item of the `PUT /V1/system/config` body. */
export interface CommerceSystemConfigWrite {
    path: string;
    value: string;
    scope: 'default' | 'website' | 'store';
    scope_code?: string;
}

/** `PUT /V1/system/config`: what was saved, and what was refused, under HTTP 200. */
export interface CommerceSystemConfigPutAnswer {
    items?: CommerceSystemConfigRow[];
    errors?: Array<{ path: string; scope?: string; scope_code?: string | null; message: string }>;
}

/** `POST /V1/products/attributes`: the body, and the row it answers (and `GET products/attributes/<code>`). */
export interface CommerceProductAttribute {
    attribute_code: string;
    frontend_input: string;
    default_frontend_label?: string;
    frontend_labels?: Array<{ store_id: number; label: string }>;
    is_required?: boolean;
    is_user_defined?: boolean;
    scope?: string;
    backend_type?: string;
    attribute_id?: number;
}

/** `GET /V1/inventory/sources` item, `POST /V1/inventory/sources` body (`{ source }`). */
export interface CommerceInventorySource {
    source_code: string;
    name: string;
    enabled?: boolean;
    country_id?: string;
    postcode?: string;
    description?: string;
}

export interface CommerceInventorySourceList {
    items?: CommerceInventorySource[];
    total_count?: number;
}

/** `GET /V1/inventory/stocks` item, `POST /V1/inventory/stocks` body (`{ stock }`); the POST answers the new id. */
export interface CommerceInventoryStock {
    stock_id?: number;
    name: string;
    extension_attributes?: { sales_channels?: Array<{ type: string; code: string }> };
}

export interface CommerceInventoryStockList {
    items?: CommerceInventoryStock[];
    total_count?: number;
}

/** `GET /V1/inventory/stock-source-links` item, and one of `POST …/stock-source-links` `{ links }`. */
export interface CommerceStockSourceLink {
    stock_id: number;
    source_code: string;
    priority?: number;
}

export interface CommerceStockSourceLinkList {
    items?: CommerceStockSourceLink[];
    total_count?: number;
}

/** `GET /V1/company` item. */
export interface CommerceCompanyRow {
    id: number;
    company_name?: string;
    company_email?: string;
    customer_group_id?: number;
}

/**
 * Customers, customer groups and companies (datapack-engine step 08). Where each shape comes from:
 * - `GET customers/{id}`, `GET customerGroups/{id}`, `GET company/{id}`: CAPTURED live on the Bodea
 *   sandbox 2026-09-27/28 (commerce-erp-integration `test/fixtures/commerce/customer-44.json`,
 *   `customer-group-19.json`, `company-21.json`; contact details replaced). The same answers sit in
 *   `tests/helpers/commerceB2bFixtures.ts`, typed to these interfaces.
 * - A customer's `addresses[]` rows: NOT captured (the one captured customer has none); typed to
 *   Magento's `Customer/Api/Data/AddressInterface`.
 * - The searches (`customers/search`, `customerGroups/search`, `company?`), the writes
 *   (`POST customers`, `POST customerGroups`, `POST company`, their PUTs and DELETEs):
 *   Magento's service contracts and the data installer's processors
 *   (`.rptc/research/datapack-engine/customers-b2b-spec.md`). NOT recorded live.
 * - `GET hierarchy/{companyId}`, `GET company/{id}` and what a shared catalog holds: captured
 *   2026-10-30 on scratch-1028's store (the `…_DB08` fixtures).
 */

/** One row of a customer's `addresses[]` (Magento's AddressInterface; not captured live). */
export interface CommerceCustomerAddress {
    id?: number;
    customer_id?: number;
    region?: { region_code?: string; region?: string; region_id?: number };
    region_id?: number;
    country_id?: string;
    street?: string[];
    telephone?: string;
    postcode?: string;
    city?: string;
    firstname?: string;
    lastname?: string;
    default_billing?: boolean;
    default_shipping?: boolean;
    [key: string]: unknown;
}

/** `GET customers/{id}` (captured); the `customer` of `POST customers` and `PUT customers/{id}`. */
export interface CommerceCustomer {
    id?: number;
    group_id?: number;
    created_at?: string;
    updated_at?: string;
    created_in?: string;
    email: string;
    firstname: string;
    lastname: string;
    middlename?: string;
    prefix?: string;
    suffix?: string;
    dob?: string;
    gender?: number;
    taxvat?: string;
    store_id?: number;
    website_id?: number;
    default_billing?: string;
    default_shipping?: string;
    confirmation?: string;
    addresses?: CommerceCustomerAddress[];
    disable_auto_group_change?: number;
    extension_attributes?: {
        company_attributes?: { customer_id?: number; company_id?: number; status?: number; is_default?: boolean };
        [key: string]: unknown;
    };
    custom_attributes?: Array<{ attribute_code: string; value: unknown }>;
}

/** `GET customers/search?…`. */
export interface CommerceCustomerList {
    items?: CommerceCustomer[];
    total_count?: number;
}

/** `GET customerGroups/{id}` (captured); `{ group }` of `POST customerGroups` and its PUT. */
export interface CommerceCustomerGroup {
    id?: number;
    code: string;
    tax_class_id?: number;
    tax_class_name?: string;
    extension_attributes?: Record<string, unknown>;
}

/**
 * `GET directory/countries/{countryId}`, Magento's CountryInformationAcquirerInterface. NOT
 * captured, and no code in this repo or the Data Installer service read it before step 14: the
 * field names are Magento's RegionInformationInterface (`id`, `code`, `name`), the same names the
 * storefront's GraphQL `country(id) { available_regions { id code name } }` reads (the
 * storefront-account dropin's `getRegions`). A country with no regions has no list.
 */
export interface CommerceCountryInfo {
    id?: string;
    available_regions?: Array<{ id: string | number; code?: string; name?: string }>;
}

/** `GET company/{id}` (captured); `{ company }` of `POST company` and `PUT company/{id}`. */
export interface CommerceCompany {
    id?: number;
    status?: number;
    company_name: string;
    legal_name?: string;
    company_email: string;
    street: string[];
    city: string;
    country_id: string;
    /** Answered as a string ("44") in the capture; sent as a number. */
    region_id?: number | string;
    region?: string;
    postcode: string;
    telephone: string;
    customer_group_id?: number;
    sales_representative_id?: number;
    reject_reason?: string | null;
    rejected_at?: string | null;
    super_user_id?: number;
    extension_attributes?: {
        is_purchase_order_enabled?: boolean;
        quote_config?: { company_id?: string; is_quote_enabled?: boolean };
        [key: string]: unknown;
    };
}

/** One node of `GET hierarchy/{companyId}` (Magento's HierarchyInterface; captured 2026-10-30, `HIERARCHY_27_DB08`). */
export interface CommerceCompanyHierarchyNode {
    structure_id?: number;
    entity_id?: number;
    entity_type?: 'customer' | 'team' | string;
    structure_parent_id?: number;
    children?: CommerceCompanyHierarchyNode[];
}

export interface CommerceCompanyList {
    items?: CommerceCompanyRow[];
    total_count?: number;
}

/** `GET /V1/sharedCatalog` item; `POST /V1/sharedCatalog` body (`{ sharedCatalog }`) answers the new id. */
export interface CommerceSharedCatalog {
    id?: number;
    name: string;
    /** 1 public, 0 custom. */
    type?: number;
    customer_group_id?: number;
    store_id?: number;
    tax_class_id?: number;
    /** On the list item (captured 2026-09-28, `shared-catalogs-group-19.json`). */
    description?: string;
    created_at?: string;
    created_by?: number;
}

export interface CommerceSharedCatalogList {
    items?: CommerceSharedCatalog[];
    total_count?: number;
}

/**
 * One line of an order, in the fields the demo-data wipe decides by (`Sales/Api/Data/OrderItemInterface`;
 * the ERP integration's reset reads the same `qty_*` fields, `commerce-erp-integration` `src/lib/close-orders.js:48-59`).
 * A configurable's child line names its parent in `parent_item_id`. No live answer is recorded in the repo.
 */
export interface CommerceOrderItem {
    item_id?: number;
    parent_item_id?: number;
    sku?: string;
    qty_ordered?: number;
    qty_invoiced?: number;
    qty_refunded?: number;
    qty_canceled?: number;
    qty_shipped?: number;
}

/** `GET /V1/orders` item (`Sales/Api/Data/OrderInterface`), in the fields the wipe reads. */
export interface CommerceOrder {
    entity_id: number;
    increment_id?: string;
    state?: string;
    status?: string;
    store_id?: number;
    customer_id?: number;
    base_shipping_invoiced?: number;
    base_shipping_refunded?: number;
    items?: CommerceOrderItem[];
    /** The order's comments: a reset's note says it was handled before. */
    status_histories?: Array<{ comment?: string }>;
}

/**
 * `GET /V1/returns` item and `GET /V1/returns/{id}` (`Rma/Api/Data/RmaInterface`). `PUT /V1/returns/{id}`
 * takes the whole object back as `{ rmaDataObject }`: Adobe's ACCS REST reference (operation
 * `PutV1ReturnsId`, read 2026-10-30) marks every field below required, so the rest rides along untouched.
 */
export interface CommerceReturn {
    entity_id: number;
    increment_id?: string;
    order_id?: number;
    order_increment_id?: string;
    store_id?: number;
    status?: string;
    [key: string]: unknown;
}

/**
 * A Commerce GET that answers the parsed body, or throws. Shared by every feature that reads a
 * store through the signed REST call it is handed: the ERP fill and setup guide, and the
 * datapack engine (DI-5), which moved it here from app-builder so both could.
 */
export type CommerceGet = (path: string) => Promise<unknown>;

/** A signed Commerce call that answers the parsed body, or throws in Commerce's words. */
export type CommerceSend = (
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    route?: { bulk?: boolean },
) => Promise<unknown>;
