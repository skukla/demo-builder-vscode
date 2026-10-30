/**
 * A sandbox shaped like the owner's (datapack-engine step 10): several demos on one Commerce
 * instance, so a wipe of one website must leave every other's things. Typed to the real interfaces
 * so a shape the wipe reads cannot be invented here.
 *
 * **None of these bodies is captured.** The website codes and the shared root are facts of
 * scratch-1028's store (`justrite_test_website` shows JustRite's root 119, recorded in step 09 and 10's
 * plans); every id, name and SKU below is made up for the test. The field names are the ones the
 * engine already reads live (`storeScopeOf`, Assign products' `website_ids`, step 08's
 * `company_attributes`); `visibility` and `configurable_product_links` in a product LIST answer are
 * not confirmed from a real answer (see `wipeReads.ts`).
 */

import type { CommerceStoreGroup, CommerceWebsite } from '@/types/commerceStore';
import type { CommerceCustomer, CommerceProduct } from '@/types/commerceWire';

/** The test website a wipe is pointed at, and the website ids of the demos beside it. */
export const TEST_SITE_ID = 5;
export const JUSTRITE_ID = 2;

export const SANDBOX_WEBSITES: CommerceWebsite[] = [
    { id: 1, code: 'base', name: 'Main Website' },
    { id: JUSTRITE_ID, code: 'justrite', name: 'JustRite' },
    { id: 3, code: 'bodea', name: 'Bodea' },
    { id: TEST_SITE_ID, code: 'justrite_test_website', name: 'JustRite Test' },
];

/** `justrite_test_website` shows JustRite's root 119; Bodea has a root of its own, 150. */
export const SANDBOX_GROUPS: CommerceStoreGroup[] = [
    { id: 1, code: 'main_website_store', name: 'Main Website Store', website_id: 1, root_category_id: 2 },
    { id: 2, code: 'justrite_store', name: 'JustRite Store', website_id: JUSTRITE_ID, root_category_id: 119 },
    { id: 3, code: 'bodea_store', name: 'Bodea Store', website_id: 3, root_category_id: 150 },
    { id: 6, code: 'justrite_test_store', name: 'JustRite Test Store', website_id: TEST_SITE_ID, root_category_id: 119 },
];

/** Commerce's visibility: 1 not visible individually, 4 catalog and search. */
const product = (id: number, sku: string, websites: number[], visibility: number, links?: number[]): CommerceProduct => ({
    id,
    sku,
    name: sku,
    type_id: links ? 'configurable' : 'simple',
    visibility,
    extension_attributes: { website_ids: websites, ...(links ? { configurable_product_links: links } : {}) },
});

/** The products a `website_id` filter on the test website answers. */
export const TEST_SITE_PRODUCTS: CommerceProduct[] = [
    product(900, 'ZZ-ONLY-HERE', [TEST_SITE_ID], 4),
    product(901, 'ZZ-SHARED-WITH-JUSTRITE', [JUSTRITE_ID, TEST_SITE_ID], 4),
    product(902, 'ZZ-JACKET', [TEST_SITE_ID], 4, [903]),
    product(903, 'ZZ-JACKET-RED', [TEST_SITE_ID], 1),
    product(904, 'ZZ-LONE-VARIANT', [TEST_SITE_ID], 1),
    product(905, 'ZZ-MADE-BY-DEMO-BUILDER', [TEST_SITE_ID], 4),
];

/** The customers a `website_id` filter on the test website answers, one of another website's included. */
export const TEST_SITE_CUSTOMERS: CommerceCustomer[] = [
    { id: 70, email: 'zz.shopper@example.com', firstname: 'Zz', lastname: 'Shopper', website_id: TEST_SITE_ID, extension_attributes: { company_attributes: { company_id: 0 } } },
    { id: 71, email: 'zz.admin@example.com', firstname: 'Zz', lastname: 'Admin', website_id: TEST_SITE_ID, extension_attributes: { company_attributes: { customer_id: 71, company_id: 28 } } },
    { id: 72, email: 'zz.made@example.com', firstname: 'Zz', lastname: 'Made', website_id: TEST_SITE_ID },
    { id: 80, email: 'justrite.buyer@example.com', firstname: 'Jr', lastname: 'Buyer', website_id: JUSTRITE_ID },
];

/** The category tree, as `categories/list` answers it: JustRite's root 119 and Bodea's root 150. */
export const SANDBOX_CATEGORIES = [
    { id: 119, name: 'JustRite Root', path: '1/119' },
    { id: 120, name: 'Safety Cans', path: '1/119/120' },
    { id: 150, name: 'Bodea Root', path: '1/150' },
    { id: 151, name: 'Racks', path: '1/150/151' },
    { id: 152, name: 'Server Racks', path: '1/150/151/152' },
    { id: 154, name: 'Cables', path: '1/150/154' },
    { id: 155, name: 'Pack Cables', path: '1/150/154/155' },
];
