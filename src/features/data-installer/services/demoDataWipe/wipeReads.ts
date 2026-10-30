/**
 * What a wipe reads from the store (datapack-engine step 10): the store structure (websites, stores,
 * store views), the products and customers on the chosen websites, the category tree, and the
 * orders and returns placed in the chosen stores' views. Reads only.
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | the structure | `GET store/websites` (`id`, `code`, `name`), `GET store/storeGroups` (`id`, `code`, `name`, `website_id`, `root_category_id`), `GET store/storeViews` (`id`, `code`, `name`, `website_id`, `store_group_id`) | yes: `storeScopeOf` reads all three on every install, and store discovery reads the same lists |
 * | a website's products | `GET products`, `website_id` eq, fields `items[id,sku,name,type_id,visibility,extension_attributes[website_ids,configurable_product_links,category_links]]` | the `website_id` filter and `website_ids` yes (Assign products, 2026-10-19); `visibility`, `configurable_product_links` and `category_links` in a LIST answer **no** |
 * | the category tree | `GET categories/list`: `id`, `name`, `path` | yes: `listCategoryLabels` |
 * | a website's customers | `GET customers/search`, `website_id` eq: `id`, `email`, `website_id`, `store_id`, `created_in`, `extension_attributes.company_attributes.company_id` | `company_attributes` yes (2026-10-30, `…_DB08`); the `website_id` filter, `store_id` and `created_in` **no** |
 * | the chosen stores' orders | `GET orders`, `store_id` in, fields `items[entity_id,increment_id,state,status,store_id,customer_id,base_shipping_invoiced,base_shipping_refunded,status_histories[comment],items[item_id,parent_item_id,sku,qty_ordered,qty_invoiced,qty_refunded,qty_canceled,qty_shipped]]` | **no**. The `qty_*` fields and `status_histories` are the ones the ERP integration's reset reads (`commerce-erp-integration` `src/lib/close-orders.js:48-65`), from `GET orders/{id}` |
 * | where some customers ordered | `GET orders`, `customer_id` in, fields `items[entity_id,customer_id,store_id]` | **no** |
 * | those orders' returns | `GET returns`, `order_id` in (`entity_id`, `increment_id`, `order_id`, `status`) | **no** from here; the ERP integration's `listOrderReturns` filters the same route on `order_id` (one order at a time). A store without returns answers 404, read as none |
 *
 * A field a read does not answer makes the thing it belongs to stay: a product whose websites are
 * not listed is left, a child whose parents are not listed is left, a customer whose store is not
 * said is left, and an order line whose quantities are missing counts as nothing to cancel or refund.
 *
 * @module features/data-installer/services/demoDataWipe/wipeReads
 */

import { filterBy, filterIn } from '../demoBuilderEngine/b2bReads';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceStoreGroup, CommerceStoreStructure, CommerceStoreView, CommerceWebsite } from '@/types/commerceStore';
import type { CommerceCustomer, CommerceGet, CommerceOrder, CommerceProduct, CommerceReturn } from '@/types/commerceWire';

/** A website or store the store does not have, or none named. */
export class WipeScopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WipeScopeError';
    }
}

/** The store's websites, stores and store views, as they are now. */
export async function readWipeStructure(get: CommerceGet): Promise<CommerceStoreStructure> {
    const [websites, storeGroups, storeViews] = await Promise.all([get('store/websites'), get('store/storeGroups'), get('store/storeViews')]);
    return {
        websites: (websites ?? []) as CommerceWebsite[],
        storeGroups: (storeGroups ?? []) as CommerceStoreGroup[],
        storeViews: (storeViews ?? []) as CommerceStoreView[],
    };
}

const PRODUCT_FIELDS = '&fields=total_count,items[id,sku,name,type_id,visibility,extension_attributes[website_ids,configurable_product_links,category_links]]';

/** Every product on the website, enabled or not, in the fields a wipe decides by. */
export function readWebsiteProducts(get: CommerceGet, websiteId: number): Promise<CommerceProduct[]> {
    return readAllPages<CommerceProduct>(get, 'products', `${filterBy('website_id', websiteId)}${PRODUCT_FIELDS}`);
}

/** One category of the tree, as `categories/list` answers it. */
export interface WipeCategory {
    id: number | string;
    name?: string;
    path?: string;
}

/** Every category in the store. */
export function readCategoryTree(get: CommerceGet): Promise<WipeCategory[]> {
    return readAllPages<WipeCategory>(get, 'categories/list');
}

/** Every customer account of the website. */
export async function readWebsiteCustomers(get: CommerceGet, websiteId: number): Promise<CommerceCustomer[]> {
    const found = await readAllPages<CommerceCustomer>(get, 'customers/search', filterBy('website_id', websiteId));
    // The filter is not confirmed from a real answer: a customer of another website is never taken.
    return found.filter((customer) => Number(customer.website_id) === websiteId);
}

const ORDER_FIELDS =
    '&fields=total_count,items[entity_id,increment_id,state,status,store_id,customer_id,base_shipping_invoiced,base_shipping_refunded,' +
    'status_histories[comment],items[item_id,parent_item_id,sku,qty_ordered,qty_invoiced,qty_refunded,qty_canceled,qty_shipped]]';

/** Ids per `in` search: short enough for any address. */
const IDS_PER_READ = 50;

async function readIn<T>(get: CommerceGet, path: string, field: string, ids: readonly number[], fields: string): Promise<T[]> {
    const found: T[] = [];
    for (let start = 0; start < ids.length; start += IDS_PER_READ) {
        found.push(...(await readAllPages<T>(get, path, `${filterIn(field, ids.slice(start, start + IDS_PER_READ))}${fields}`)));
    }
    return found;
}

/** Every order placed in these store views. */
export async function readViewOrders(get: CommerceGet, viewIds: readonly number[]): Promise<CommerceOrder[]> {
    const found = await readIn<CommerceOrder>(get, 'orders', 'store_id', viewIds, ORDER_FIELDS);
    return found.filter((order) => viewIds.includes(Number(order.store_id)));
}

/** Where these customers have ordered: every order of theirs, by the view it was placed in. */
export async function readCustomerOrderViews(get: CommerceGet, customerIds: readonly number[]): Promise<Array<{ customerId: number; viewId: number }>> {
    const found = await readIn<CommerceOrder>(get, 'orders', 'customer_id', customerIds, '&fields=total_count,items[entity_id,customer_id,store_id]');
    return found.filter((o) => customerIds.includes(Number(o.customer_id))).map((o) => ({ customerId: Number(o.customer_id), viewId: Number(o.store_id) }));
}

/** Every return (RMA) on these orders; none on a store without returns. */
export async function readOrderReturns(get: CommerceGet, orderIds: readonly number[]): Promise<CommerceReturn[]> {
    const found = await absentAsEmpty(() => readIn<CommerceReturn>(get, 'returns', 'order_id', orderIds, ''));
    return found.filter((rma) => orderIds.includes(Number(rma.order_id)));
}
