/**
 * Commerce answers for "Assign products" and the attribute-set check (AB-74), typed to the
 * shapes in `src/types/commerceWire.ts`, so a fixture that drifts from them fails
 * `typecheck:tests`.
 *
 * Where they come from (said per fixture too):
 * - products: NOT here; the suites read the Bodea sandbox's captured `GET products` page
 *   (tests/fixtures/commerce-rest/products-page.json, 2026-09-27) for the product shape;
 * - bulk accept / status: the examples on Adobe's `bulk-endpoints` and
 *   `operation-status-endpoints` pages (read 2026-10-09), with our own SKUs and uuid. No live
 *   status answer is recorded in the repo;
 * - attribute sets, their attributes, their groups: Magento's service contracts for those routes
 *   (read 2026-10-09). No live answer is recorded in the repo. Set 4 "Default" and group 7
 *   "Product Details" follow the reference note on product create gotchas (Justrite, 2026-09-30).
 */

import type {
    CommerceAttributeGroupList,
    CommerceAttributeSetList,
    CommerceBulkAccepted,
    CommerceBulkStatus,
    CommerceProductSetPage,
    CommerceSetAttribute,
} from '@/types/commerceWire';

/** The bulk-endpoints page's example answer, with our uuid. */
export function bulkAccepted(count: number, uuid = '799a59c0-09ca-4d60-b432-2953986c1c38'): CommerceBulkAccepted {
    return {
        bulk_uuid: uuid,
        request_items: Array.from({ length: count }, (_unused, id) => ({ id, data_hash: `h${id}`, status: 'accepted' })),
        errors: false,
    };
}

/** The operation-status page's example answer, one operation per status given. */
export function bulkStatus(statuses: number[], messages: Record<number, string> = {}): CommerceBulkStatus {
    return {
        operations_list: statuses.map((status, id) => ({
            id,
            status,
            result_message: messages[id] ?? (status === 1 ? 'Service execution success Magento\\Catalog\\Model\\ProductRepository\\Interceptor::save' : null),
            error_code: null,
        })),
        user_type: 2,
        bulk_id: '799a59c0-09ca-4d60-b432-2953986c1c38',
        description: 'Topic async.magento.catalog.api.productrepositoryinterface.save.put',
        start_time: '2026-10-09 10:00:00',
        user_id: null,
        operation_count: statuses.length,
    };
}

/** Two product sets: the store's Default (4) and a gear set (15, the Bodea products' set). */
export const SET_LIST: CommerceAttributeSetList = {
    items: [
        { attribute_set_id: 4, attribute_set_name: 'Default', sort_order: 1, entity_type_id: 4 },
        { attribute_set_id: 15, attribute_set_name: 'Bodea Plans', sort_order: 0, entity_type_id: 4 },
    ],
    total_count: 2,
};

/** A set's attributes with and without erp_owner. */
export const WITH_OWNER: CommerceSetAttribute[] = [
    { attribute_id: 73, attribute_code: 'name', frontend_input: 'text' },
    { attribute_id: 300, attribute_code: 'erp_owner', frontend_input: 'text' },
];
export const WITHOUT_OWNER: CommerceSetAttribute[] = [{ attribute_id: 73, attribute_code: 'name', frontend_input: 'text' }];

/** A set's groups: "Product Details" is where Admin puts a new attribute. */
export const GROUPS: CommerceAttributeGroupList = {
    items: [
        { attribute_group_id: 8, attribute_group_name: 'Content', attribute_set_id: 4, extension_attributes: { attribute_group_code: 'content', sort_order: '20' } },
        { attribute_group_id: 7, attribute_group_name: 'Product Details', attribute_set_id: 4, extension_attributes: { attribute_group_code: 'product-details', sort_order: '10' } },
    ],
    total_count: 2,
};

/** One page of products with only sku and attribute_set_id. */
export function productSetPage(rows: Array<[string, number]>, total = rows.length): CommerceProductSetPage {
    return { items: rows.map(([sku, attribute_set_id]) => ({ sku, attribute_set_id })), total_count: total };
}
