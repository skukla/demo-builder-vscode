/**
 * A sandbox shaped like the owner's (datapack-engine step 10): several demos on one Commerce
 * instance, so a wipe of some stores must leave every other's things. Typed to the real interfaces
 * so a shape the wipe reads cannot be invented here.
 *
 * **None of these bodies is captured.** The website codes and the shared root are facts of
 * scratch-1028's store (`justrite_test_website` shows JustRite's root 119, recorded in step 09 and 10's
 * plans); every id, name and SKU below is made up for the test, and Bodea's second store
 * (`bodea_outlet`) is invented to give a website that is only partly chosen. The field names are the
 * ones the engine already reads live (`storeScopeOf`, Assign products' `website_ids`, step 08's
 * `company_attributes`); the rest are not confirmed from a real answer (see `wipeReads.ts`).
 */

import type { CommerceStoreGroup, CommerceStoreView, CommerceWebsite } from '@/types/commerceStore';
import type { CommerceCustomer, CommerceOrder, CommerceProduct } from '@/types/commerceWire';

/** The test website a wipe is pointed at, and the website ids of the demos beside it. */
export const TEST_SITE_ID = 5;
export const JUSTRITE_ID = 2;
export const BODEA_ID = 3;

export const SANDBOX_WEBSITES: CommerceWebsite[] = [
    { id: 1, code: 'base', name: 'Main Website' },
    { id: JUSTRITE_ID, code: 'justrite', name: 'JustRite' },
    { id: BODEA_ID, code: 'bodea', name: 'Bodea' },
    { id: TEST_SITE_ID, code: 'justrite_test_website', name: 'JustRite Test' },
];

/** `justrite_test_store` shows JustRite's root 119; Bodea's two stores have roots of their own, 150 and 160. */
export const SANDBOX_GROUPS: CommerceStoreGroup[] = [
    { id: 1, code: 'main_website_store', name: 'Main Website Store', website_id: 1, root_category_id: 2 },
    { id: 2, code: 'justrite_store', name: 'JustRite Store', website_id: JUSTRITE_ID, root_category_id: 119 },
    { id: 3, code: 'bodea_store', name: 'Bodea Store', website_id: BODEA_ID, root_category_id: 150 },
    { id: 6, code: 'justrite_test_store', name: 'JustRite Test Store', website_id: TEST_SITE_ID, root_category_id: 119 },
    { id: 7, code: 'bodea_outlet', name: 'Bodea Outlet', website_id: BODEA_ID, root_category_id: 160 },
];

/** One store view per store; the ids are what orders and customers name in `store_id`. */
export const SANDBOX_VIEWS: CommerceStoreView[] = [
    { id: 1, code: 'default', name: 'Default Store View', store_group_id: 1, website_id: 1, is_active: 1 },
    { id: 2, code: 'justrite_us', name: 'JustRite US', store_group_id: 2, website_id: JUSTRITE_ID, is_active: 1 },
    { id: 3, code: 'bodea_en', name: 'Bodea English', store_group_id: 3, website_id: BODEA_ID, is_active: 1 },
    { id: 4, code: 'bodea_outlet_en', name: 'Bodea Outlet English', store_group_id: 7, website_id: BODEA_ID, is_active: 1 },
    { id: 6, code: 'justrite_test_view', name: 'JustRite Test View', store_group_id: 6, website_id: TEST_SITE_ID, is_active: 1 },
];

/** Commerce's visibility: 1 not visible individually, 4 catalog and search. */
function product(id: number, sku: string, websites: number[], visibility: number, extra: { links?: number[]; categories?: number[] } = {}): CommerceProduct {
    return {
        id,
        sku,
        name: sku,
        type_id: extra.links ? 'configurable' : 'simple',
        visibility,
        extension_attributes: {
            website_ids: websites,
            ...(extra.links ? { configurable_product_links: extra.links } : {}),
            ...(extra.categories ? { category_links: extra.categories.map((id) => ({ category_id: String(id) })) } : {}),
        },
    };
}

/** The products a `website_id` filter on the test website answers. */
export const TEST_SITE_PRODUCTS: CommerceProduct[] = [
    product(900, 'ZZ-ONLY-HERE', [TEST_SITE_ID], 4),
    product(901, 'ZZ-SHARED-WITH-JUSTRITE', [JUSTRITE_ID, TEST_SITE_ID], 4),
    product(902, 'ZZ-JACKET', [TEST_SITE_ID], 4, { links: [903] }),
    product(903, 'ZZ-JACKET-RED', [TEST_SITE_ID], 1),
    product(904, 'ZZ-LONE-VARIANT', [TEST_SITE_ID], 1),
    product(905, 'ZZ-MADE-BY-DEMO-BUILDER', [TEST_SITE_ID], 4),
];

/** Bodea's products, for a wipe of `bodea_store` alone (its website only partly chosen). */
export const BODEA_PRODUCTS: CommerceProduct[] = [
    product(950, 'BD-RACK', [BODEA_ID], 4, { categories: [151] }),
    product(951, 'BD-CLEARANCE', [BODEA_ID], 4, { categories: [161] }),
    product(952, 'BD-NO-CATEGORY', [BODEA_ID], 4),
    product(953, 'BD-ALSO-ON-MAIN', [BODEA_ID, 1], 4, { categories: [151] }),
    product(954, 'BD-BOTH-STORES', [BODEA_ID], 4, { categories: [151, 161] }),
    product(955, 'BD-CHAIR', [BODEA_ID], 4, { links: [956], categories: [152] }),
    product(956, 'BD-CHAIR-RED', [BODEA_ID], 1),
];

/** The customers a `website_id` filter on the test website answers, one of another website's included. */
export const TEST_SITE_CUSTOMERS: CommerceCustomer[] = [
    { id: 70, email: 'zz.shopper@example.com', firstname: 'Zz', lastname: 'Shopper', website_id: TEST_SITE_ID, extension_attributes: { company_attributes: { company_id: 0 } } },
    { id: 71, email: 'zz.admin@example.com', firstname: 'Zz', lastname: 'Admin', website_id: TEST_SITE_ID, extension_attributes: { company_attributes: { customer_id: 71, company_id: 28 } } },
    { id: 72, email: 'zz.made@example.com', firstname: 'Zz', lastname: 'Made', website_id: TEST_SITE_ID },
    { id: 80, email: 'justrite.buyer@example.com', firstname: 'Jr', lastname: 'Buyer', website_id: JUSTRITE_ID },
];

/** Bodea's customers: made in each of its two stores, one with an order in the other, one made in the Admin. */
export const BODEA_CUSTOMERS: CommerceCustomer[] = [
    { id: 90, email: 'bd.store@example.com', firstname: 'Bd', lastname: 'Store', website_id: BODEA_ID, store_id: 3, created_in: 'Bodea English' },
    { id: 91, email: 'bd.outlet@example.com', firstname: 'Bd', lastname: 'Outlet', website_id: BODEA_ID, store_id: 4, created_in: 'Bodea Outlet English' },
    { id: 92, email: 'bd.both@example.com', firstname: 'Bd', lastname: 'Both', website_id: BODEA_ID, store_id: 3, created_in: 'Bodea English' },
    { id: 93, email: 'bd.admin@example.com', firstname: 'Bd', lastname: 'Admin', website_id: BODEA_ID, store_id: 0, created_in: 'Admin' },
];

const line = (item: number, qty: number, done: { invoiced?: number; shipped?: number } = {}) => ({
    item_id: item,
    sku: `LINE-${item}`,
    qty_ordered: qty,
    qty_invoiced: done.invoiced ?? 0,
    qty_refunded: 0,
    qty_canceled: 0,
    qty_shipped: done.shipped ?? 0,
});

/**
 * Orders beyond the reset rule's five (`resetRuleOrders.ts`), in the test website's view (6): one on
 * hold, one a reset already noted, one shipped but never invoiced, and a configurable line with its
 * child.
 */
export const EDGE_ORDERS: CommerceOrder[] = [
    { entity_id: 504, increment_id: '000000504', state: 'holded', status: 'holded', store_id: 6, items: [line(6, 1)] },
    {
        entity_id: 507,
        increment_id: '000000507',
        state: 'new',
        status: 'pending',
        store_id: 6,
        items: [line(10, 1)],
        status_histories: [{ comment: 'Canceled by the demo reset on 2026-10-29.' }],
    },
    { entity_id: 508, increment_id: '000000508', state: 'processing', status: 'processing', store_id: 6, items: [line(11, 1, { shipped: 1 })] },
    {
        entity_id: 509,
        increment_id: '000000509',
        state: 'processing',
        status: 'processing',
        store_id: 6,
        base_shipping_invoiced: 0,
        items: [line(12, 1, { invoiced: 1 }), { ...line(13, 1, { invoiced: 1 }), parent_item_id: 12 }],
    },
];

/** An order of customer 92 in Bodea's outlet store, so 92 belongs to a store not chosen as well. */
export const BODEA_OUTLET_ORDER: CommerceOrder = { entity_id: 600, increment_id: '000000600', state: 'new', status: 'pending', store_id: 4, customer_id: 92, items: [line(9, 1)] };

/** The category tree, as `categories/list` answers it: JustRite's root 119 and Bodea's roots 150 and 160. */
export const SANDBOX_CATEGORIES = [
    { id: 119, name: 'JustRite Root', path: '1/119' },
    { id: 120, name: 'Safety Cans', path: '1/119/120' },
    { id: 150, name: 'Bodea Root', path: '1/150' },
    { id: 151, name: 'Racks', path: '1/150/151' },
    { id: 152, name: 'Server Racks', path: '1/150/151/152' },
    { id: 154, name: 'Cables', path: '1/150/154' },
    { id: 155, name: 'Pack Cables', path: '1/150/154/155' },
    { id: 160, name: 'Outlet Root', path: '1/160' },
    { id: 161, name: 'Clearance', path: '1/160/161' },
];
