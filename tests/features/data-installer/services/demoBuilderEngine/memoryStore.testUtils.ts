/**
 * A Commerce store held in memory that keeps what it is sent (step 14, item 16), for a round trip and
 * a full cycle: install a pack, install it again, save the store back, remove it. The path-table fake
 * (`fakeContext`) answers fixed replies; these need a store whose reads show its writes.
 *
 * This file holds the catalog (one website, `base`, id 1, whose store shows root category 2) and the
 * products, and is the one entry. The rest lives beside it, one part per job, each answering the routes
 * the engine reads and writes in their `commerceWire` shapes: attributes and sets
 * (`memoryStore.attributes`), inventory (`memoryStore.inventory`), customers and promotions
 * (`memoryStore.people`). Like Commerce it gives a new category its id and path, a new product's custom
 * options and their values their own ids, so a capture that kept them would carry this store's ids, and
 * deleting a product deletes its stock quantities. Any other route answers 404.
 */

import { attributePart } from './memoryStore.attributes.testUtils';
import { inventoryPart } from './memoryStore.inventory.testUtils';
import { peoplePart } from './memoryStore.people.testUtils';
import {
    type ReadRoute,
    type WriteRoute,
    filtersOf,
    idSource,
    matches,
    notFound,
    page,
} from './memoryStore.routes.testUtils';
import { withBulkQueue } from './bulkQueue.testUtils';
import type { StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceGet, CommerceProduct, CommerceSend } from '@/types/commerceWire';

const ROOT: StoreCategory = {
    id: 2,
    name: 'Default Category',
    path: '1/2',
    parent_id: 1,
    is_active: true,
};

/** What the store holds, and every write it was sent. */
export interface MemoryStore {
    get: CommerceGet;
    send: CommerceSend;
    categories: Map<number, StoreCategory>;
    products: Map<string, CommerceProduct>;
    sent: Array<{ method: string; path: string; body?: unknown }>;
    /** The parts' own holdings, for a suite to read what the store holds now. */
    attributes: ReturnType<typeof attributePart>['attributes'];
    sets: ReturnType<typeof attributePart>['sets'];
    sources: ReturnType<typeof inventoryPart>['sources'];
    stocks: ReturnType<typeof inventoryPart>['stocks'];
    links: ReturnType<typeof inventoryPart>['links'];
    sourceItems: ReturnType<typeof inventoryPart>['sourceItems'];
    groups: ReturnType<typeof peoplePart>['groups'];
    customers: ReturnType<typeof peoplePart>['customers'];
    rules: ReturnType<typeof peoplePart>['rules'];
    coupons: ReturnType<typeof peoplePart>['coupons'];
}

const urlKey = (c: StoreCategory) =>
    c.custom_attributes?.find((a) => a.attribute_code === 'url_key')?.value;

/** A new, empty store. */
export function memoryStore(): MemoryStore {
    const ids = idSource();
    const attributes = attributePart(ids);
    const inventory = inventoryPart(ids);
    const people = peoplePart(ids);
    const categories = new Map<number, StoreCategory>([[ROOT.id, ROOT]]);
    const products = new Map<string, CommerceProduct>();
    const sent: MemoryStore['sent'] = [];
    /** A set named where Commerce takes an id (the Import API's `attribute_set_code`), as its id. */
    const setIdOf = (named: unknown): unknown =>
        [...attributes.sets.values()].find((s) => s.set.attribute_set_name === named)?.set
            .attribute_set_id ?? named;

    const categoryList = (path: string) => {
        const f = filtersOf(path);
        return page(
            [...categories.values()].filter(
                (c) =>
                    matches(f.get('parent_id'), c.parent_id) &&
                    matches(f.get('name'), c.name) &&
                    matches(f.get('url_key'), urlKey(c))
            )
        );
    };
    const productList = (path: string) => {
        const f = filtersOf(path);
        const website = f.get('website_id');
        const category = f.get('category_id');
        const inCategory = (p: CommerceProduct) =>
            !category ||
            (p.extension_attributes?.category_links ?? []).some(
                (l) => String(l.category_id) === category.value
            );
        const onWebsite = (p: CommerceProduct) =>
            !website ||
            (p.extension_attributes?.website_ids ?? []).map(String).includes(website.value);
        return page(
            [...products.values()].filter(
                (p) =>
                    matches(f.get('sku'), p.sku) &&
                    matches(f.get('entity_id'), p.id) &&
                    matches(f.get('attribute_set_id'), p.attribute_set_id) &&
                    inCategory(p) &&
                    onWebsite(p)
            )
        );
    };
    const reads: ReadRoute[] = [
        [
            /^store\/websites$/u,
            () => [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }],
        ],
        [
            /^store\/storeGroups$/u,
            () => [
                {
                    id: 1,
                    code: 'main_website_store',
                    name: 'Main Store',
                    website_id: 1,
                    root_category_id: ROOT.id,
                },
            ],
        ],
        [
            /^store\/storeViews$/u,
            () => [
                {
                    id: 1,
                    code: 'default',
                    name: 'Default Store View',
                    website_id: 1,
                    store_group_id: 1,
                },
            ],
        ],
        [/^categories\/list\?/u, categoryList],
        [/^categories\/(\d+)$/u, (path, m) => categories.get(Number(m[1])) ?? notFound(path)],
        ...attributes.reads,
        [
            /^products\/([^/?]+)$/u,
            (path, m) => products.get(decodeURIComponent(m[1])) ?? notFound(path),
        ],
        [/^products\?/u, productList],
        ...inventory.reads,
        ...people.reads,
    ];
    const writes: WriteRoute[] = [
        [
            'POST',
            /^categories$/u,
            (body) => {
                const { category } = body as { category: StoreCategory & { parent_id: number } };
                const id = ids.next();
                const made: StoreCategory = {
                    ...category,
                    id,
                    path: `${categories.get(category.parent_id)?.path ?? '1'}/${id}`,
                };
                categories.set(id, made);
                return made;
            },
        ],
        [
            'POST',
            /^products$/u,
            (body) => {
                const { product } = body as { product: CommerceProduct };
                const options = (product.options ?? []).map((o) => ({
                    ...o,
                    option_id: ids.next(),
                    values: o.values?.map((v) => ({ ...v, option_type_id: ids.next() })),
                }));
                const made: CommerceProduct = {
                    ...product,
                    id: ids.next(),
                    attribute_set_id: setIdOf(
                        product.attribute_set_id
                    ) as CommerceProduct['attribute_set_id'],
                    created_at: '2026-10-30 12:00:00',
                    updated_at: '2026-10-30 12:00:00',
                    ...(product.options ? { options } : {}),
                };
                products.set(product.sku, made);
                return made;
            },
        ],
        [
            'DELETE',
            /^products\/([^/?]+)$/u,
            (_body, m) => {
                const sku = decodeURIComponent(m[1]);
                products.delete(sku);
                const kept = inventory.sourceItems.filter((i) => i.sku !== sku);
                inventory.sourceItems.splice(0, inventory.sourceItems.length, ...kept);
                return true;
            },
        ],
        ['DELETE', /^categories\/(\d+)$/u, (_body, m) => (categories.delete(Number(m[1])), true)],
        ...attributes.writes,
        ...inventory.writes,
        ...people.writes,
    ];

    const get: CommerceGet = async (path) => {
        for (const [route, answer] of reads) {
            const m = route.exec(path);
            if (m) return answer(path, m);
        }
        return notFound(path);
    };

    const send: CommerceSend = async (method, path, body) => {
        sent.push({ method, path, body });
        for (const [verb, route, take] of writes) {
            const m = verb === method ? route.exec(path) : null;
            if (m) return take(body, m);
        }
        return {};
    };

    // Commerce's bulk queue runs each request through the single route above (`bulkQueue.testUtils.ts`).
    return {
        ...withBulkQueue(get, send),
        categories,
        products,
        sent,
        attributes: attributes.attributes,
        sets: attributes.sets,
        sources: inventory.sources,
        stocks: inventory.stocks,
        links: inventory.links,
        sourceItems: inventory.sourceItems,
        groups: people.groups,
        customers: people.customers,
        rules: people.rules,
        coupons: people.coupons,
    };
}
