/**
 * What a wipe reads from the store (datapack-engine step 10): the chosen website and the root
 * categories its store groups show, the products and customers on it, and the category tree.
 * Reads only.
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | the website | `GET store/websites`: `id`, `code`, `name` | yes: `storeScopeOf` reads it on every install |
 * | its store groups and roots | `GET store/storeGroups`: `id`, `website_id`, `root_category_id` | yes: `storeScopeOf`, store discovery |
 * | its products | `GET products`, `website_id` eq, fields `items[id,sku,name,type_id,visibility,extension_attributes[website_ids,configurable_product_links]]` | the `website_id` filter and `website_ids` yes (Assign products, 2026-10-19); `visibility` and `configurable_product_links` in a LIST answer **no** |
 * | the category tree | `GET categories/list`: `id`, `name`, `path` | yes: `listCategoryLabels` |
 * | its customers | `GET customers/search`, `website_id` eq: `id`, `email`, `website_id`, `extension_attributes.company_attributes.company_id` | `company_attributes` yes (2026-10-30, `…_DB08`); the `website_id` filter **no** |
 *
 * A field a read does not answer makes the thing it belongs to stay: a product whose websites are
 * not listed is left, and a child whose parents are not listed is left.
 *
 * @module features/data-installer/services/demoDataWipe/wipeReads
 */

import { filterBy } from '../demoBuilderEngine/b2bReads';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceStoreGroup, CommerceWebsite } from '@/types/commerceStore';
import type { CommerceCustomer, CommerceGet, CommerceProduct } from '@/types/commerceWire';

/** The website a wipe clears, and which of its roots another website shares. */
export interface WipeWebsite {
    id: number;
    code: string;
    name: string;
    /** Root categories this website's store groups show, by id. */
    roots: string[];
    /** Of those, the ones another website's store group shows too, with that website's codes. */
    sharedRoots: Map<string, string[]>;
}

/** A website the store does not have. */
export class WipeScopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WipeScopeError';
    }
}

/**
 * The website by code, its roots, and which roots are shared.
 *
 * @throws WipeScopeError naming the code when the store has no such website
 */
export async function readWipeWebsite(get: CommerceGet, websiteCode: string): Promise<WipeWebsite> {
    const sites = ((await get('store/websites')) ?? []) as CommerceWebsite[];
    const site = sites.find((candidate) => candidate.code === websiteCode);
    if (!site) throw new WipeScopeError(`The store has no website ${websiteCode}.`);
    const groups = ((await get('store/storeGroups')) ?? []) as CommerceStoreGroup[];
    const codeOf = new Map(sites.map((s) => [String(s.id), s.code]));
    const roots = [...new Set(groups.filter((g) => String(g.website_id) === String(site.id)).map((g) => String(g.root_category_id)))];
    const sharedRoots = new Map<string, string[]>();
    for (const root of roots) {
        const others = groups.filter((g) => String(g.root_category_id) === root && String(g.website_id) !== String(site.id));
        if (others.length > 0) sharedRoots.set(root, [...new Set(others.map((g) => codeOf.get(String(g.website_id)) ?? String(g.website_id)))]);
    }
    return { id: Number(site.id), code: site.code, name: site.name, roots, sharedRoots };
}

const PRODUCT_FIELDS = '&fields=total_count,items[id,sku,name,type_id,visibility,extension_attributes[website_ids,configurable_product_links]]';

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
