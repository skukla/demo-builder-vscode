/**
 * Commerce REST answers that "Assign products" and the attribute-set check read (AB-74), in
 * the fields they read. Typed here so the services and the tests' fixtures share one shape.
 *
 * Where each shape comes from:
 * - the bulk accept and the bulk status: Adobe's REST docs, `use-rest/bulk-endpoints` and
 *   `use-rest/operation-status-endpoints` (read 2026-10-09); the sandbox answered a
 *   `bulk_uuid` the same way on 2026-09-30 (backlog item demo-data-authoring);
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
 * "Prepare this store" (AB-77). Where each shape comes from:
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
    customer_group_id?: number;
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
}

export interface CommerceSharedCatalogList {
    items?: CommerceSharedCatalog[];
    total_count?: number;
}
