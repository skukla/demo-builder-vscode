/**
 * A Commerce store held in memory that keeps what it is sent (step 14, item 16), for a round trip:
 * install a pack, then save the store back. The path-table fake (`fakeContext`) answers fixed
 * replies; a round trip needs a store whose reads show its writes.
 *
 * It answers the routes the catalog kinds' install and capture use, in the shapes the engine reads
 * (`StoreCategory`, `CommerceProduct`, the search pages `readAllPages` walks): one website (`base`,
 * id 1) whose store shows root category 2, the Default attribute set (4), the `default` source,
 * and the attributes named in `ATTRIBUTES`. Like Commerce it gives a new category its id and
 * path, and a new product's custom options and their values their own ids, so a capture that
 * kept them would carry this store's ids. Any other route answers 404.
 */

import { CommerceReadError } from '@/features/app-builder/services/erpFillReaders';
import type { StoreAttribute, StoreCategory } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import type { CommerceGet, CommerceProduct, CommerceSend } from '@/types/commerceWire';

/** The store's own attributes the packs here name: Commerce's, none of them user-defined. */
const ATTRIBUTES: Record<string, StoreAttribute> = {
    url_key: { attribute_id: 121, attribute_code: 'url_key', frontend_input: 'text', is_user_defined: false },
    description: { attribute_id: 75, attribute_code: 'description', frontend_input: 'textarea', is_user_defined: false },
};

const ROOT: StoreCategory = { id: 2, name: 'Default Category', path: '1/2', parent_id: 1, is_active: true };

interface SourceItem {
    sku: string;
    source_code: string;
    quantity: number;
    status: number;
}

/** What the store holds, and every write it was sent. */
export interface MemoryStore {
    get: CommerceGet;
    send: CommerceSend;
    categories: Map<number, StoreCategory>;
    products: Map<string, CommerceProduct>;
    sourceItems: SourceItem[];
    sent: Array<{ method: string; path: string }>;
}

/** Every `field=value` filter of a search, by field, and its condition. */
function filtersOf(path: string): Map<string, { value: string; condition: string }> {
    const query = new URLSearchParams(path.split('?')[1] ?? '');
    const filters = new Map<string, { value: string; condition: string }>();
    for (const [key, field] of query) {
        const at = /^searchCriteria\[filterGroups\]\[(\d+)\]\[filters\]\[0\]\[field\]$/u.exec(key);
        if (!at) continue;
        const base = `searchCriteria[filterGroups][${at[1]}][filters][0]`;
        filters.set(field, { value: query.get(`${base}[value]`) ?? '', condition: query.get(`${base}[conditionType]`) ?? 'eq' });
    }
    return filters;
}

const matches = (filter: { value: string; condition: string } | undefined, actual: unknown): boolean => {
    if (!filter) return true;
    if (filter.condition === 'in') return filter.value.split(',').map((v) => v.toLowerCase()).includes(String(actual).toLowerCase());
    return String(actual).toLowerCase() === filter.value.toLowerCase();
};

const page = <T>(items: T[]) => ({ items, total_count: items.length });
const urlKey = (c: StoreCategory) => c.custom_attributes?.find((a) => a.attribute_code === 'url_key')?.value;

function notFound(path: string): never {
    throw new CommerceReadError(`Commerce answered 404 for ${path}`, 404);
}

/** A new, empty store. */
export function memoryStore(): MemoryStore {
    const categories = new Map<number, StoreCategory>([[ROOT.id, ROOT]]);
    const products = new Map<string, CommerceProduct>();
    const sourceItems: SourceItem[] = [];
    const sent: Array<{ method: string; path: string }> = [];
    let nextId = 100;

    const categoryList = (path: string) => {
        const f = filtersOf(path);
        return page([...categories.values()].filter((c) => matches(f.get('parent_id'), c.parent_id) && matches(f.get('name'), c.name) && matches(f.get('url_key'), urlKey(c))));
    };
    const productList = (path: string) => {
        const f = filtersOf(path);
        const website = f.get('website_id');
        return page([...products.values()].filter((p) => matches(f.get('sku'), p.sku) && matches(f.get('entity_id'), p.id) && (!website || (p.extension_attributes?.website_ids ?? []).map(String).includes(website.value))));
    };
    const reads: Array<[RegExp, (path: string, match: RegExpExecArray) => unknown]> = [
        [/^store\/websites$/u, () => [{ id: 1, code: 'base', name: 'Main Website', default_group_id: 1 }]],
        [/^store\/storeGroups$/u, () => [{ id: 1, code: 'main_website_store', name: 'Main Store', website_id: 1, root_category_id: ROOT.id }]],
        [/^store\/storeViews$/u, () => [{ id: 1, code: 'default', name: 'Default Store View', website_id: 1, store_group_id: 1 }]],
        [/^categories\/list\?/u, categoryList],
        [/^categories\/(\d+)$/u, (path, m) => categories.get(Number(m[1])) ?? notFound(path)],
        [/^products\/attribute-sets\/sets\/list\?/u, () => page([{ attribute_set_id: 4, attribute_set_name: 'Default', entity_type_id: 4 }])],
        [/^products\/attribute-sets\/\d+\/attributes$/u, () => []],
        [/^products\/attributes\?/u, (path) => page(Object.values(ATTRIBUTES).filter((a) => matches(filtersOf(path).get('attribute_id'), a.attribute_id)))],
        [/^products\/attributes\/([^/?]+)$/u, (path, m) => ATTRIBUTES[decodeURIComponent(m[1])] ?? notFound(path)],
        [/^products\/([^/?]+)$/u, (path, m) => products.get(decodeURIComponent(m[1])) ?? notFound(path)],
        [/^products\?/u, productList],
        [/^inventory\/source-items\?/u, (path) => page(sourceItems.filter((i) => matches(filtersOf(path).get('sku'), i.sku)))],
        [/^inventory\/sources\?/u, () => page([{ source_code: 'default', name: 'Default Source', enabled: true }])],
        [/^inventory\/(stocks|stock-source-links)\?/u, () => page([])],
    ];

    const get: CommerceGet = async (path) => {
        for (const [route, answer] of reads) {
            const m = route.exec(path);
            if (m) return answer(path, m);
        }
        return notFound(path);
    };

    const send: CommerceSend = async (method, path, body) => {
        sent.push({ method, path });
        if (method === 'POST' && path === 'categories') {
            const { category } = body as { category: StoreCategory & { parent_id: number } };
            const id = nextId++;
            const made: StoreCategory = { ...category, id, path: `${categories.get(category.parent_id)?.path ?? '1'}/${id}` };
            categories.set(id, made);
            return made;
        }
        if (method === 'POST' && path === 'products') {
            const { product } = body as { product: CommerceProduct };
            const options = (product.options ?? []).map((o) => ({ ...o, option_id: nextId++, values: o.values?.map((v) => ({ ...v, option_type_id: nextId++ })) }));
            const made: CommerceProduct = { ...product, id: nextId++, created_at: '2026-10-30 12:00:00', updated_at: '2026-10-30 12:00:00', ...(product.options ? { options } : {}) };
            products.set(product.sku, made);
            return made;
        }
        if (method === 'POST' && path === 'inventory/source-items') {
            sourceItems.push(...(body as { sourceItems: SourceItem[] }).sourceItems);
            return [];
        }
        return {};
    };

    return { get, send, categories, products, sourceItems, sent };
}
