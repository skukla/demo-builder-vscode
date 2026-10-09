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
