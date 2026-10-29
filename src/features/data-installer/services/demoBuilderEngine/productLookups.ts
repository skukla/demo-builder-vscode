/**
 * The lookups a product row needs before Commerce will take it: a pack names things by what
 * a person reads (an attribute set's name, a category's url key, an option's label, a customer
 * group's code, a child's SKU), and Commerce wants this store's ids (DI-5; catalog spec §8).
 *
 * Each answer is cached for one install, as the service caches its own.
 *
 * Where this deliberately differs from the service: a url key is matched under the pack's root
 * category first, since a url key is not unique across a store; and a name that cannot be found
 * stops the install, where the service dropped it or sent it on unchanged.
 *
 * Endpoints (spec §8): `GET categories/list`, `GET products/attributes/{code}`,
 * `GET customerGroups/search`, `GET products/{sku}`.
 *
 * @module features/data-installer/services/demoBuilderEngine/productLookups
 */

import { loadStoreSets } from './attributeSetsKind';
import { type KindContext, readOrNull } from './kindContext';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';

/** What the store holds for an attribute: how it is entered and its options. */
export interface StoreAttribute {
    attribute_id?: number | string;
    frontend_input?: string;
    options?: Array<{ label?: string; value?: string }>;
}

/** The names Commerce gives two groups that packs spell another way (the service's aliases). */
const GROUP_ALIASES: Record<string, string> = { General: 'Default (General)', 'NOT LOGGED IN': 'Guest' };

export const isNumeric = (value: unknown): boolean => /^\d+$/u.test(String(value));

function equalLabel(a: string | undefined, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
}

function search(field: string, value: string): string {
    return (
        `searchCriteria[filterGroups][0][filters][0][field]=${field}` +
        `&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(value)}`
    );
}

/** Lookups for one install's products. */
export interface ProductLookups {
    setId(name: string): Promise<number>;
    categoryId(urlKey: string): Promise<string>;
    attribute(code: string): Promise<StoreAttribute>;
    optionId(code: string, label: string): Promise<string>;
    groupId(code: string): Promise<number>;
    productId(sku: string): Promise<number>;
}

function cached<T>(read: (key: string) => Promise<T>): (key: string) => Promise<T> {
    const answers = new Map<string, Promise<T>>();
    return (key) => {
        if (!answers.has(key)) answers.set(key, read(key));
        return answers.get(key) as Promise<T>;
    };
}

/** The lookups, over this install's Commerce access and session. */
export function productLookups(ctx: KindContext): ProductLookups {
    const attribute = cached(async (code) => {
        const found = await readOrNull<StoreAttribute>(ctx.get, `products/attributes/${encodeURIComponent(code)}`);
        if (!found) throw new Error(`The store has no attribute ${code}.`);
        return found;
    });
    return {
        setId: cached(async (name) => {
            await loadStoreSets(ctx);
            const id = ctx.session.setIds.get(name);
            if (id === undefined) throw new Error(`The store has no attribute set named ${name}.`);
            return id;
        }),
        categoryId: cached(async (urlKey) => {
            const found = await readAllPages<{ id: number; path?: string }>(ctx.get, 'categories/list', `&${search('url_key', urlKey)}`);
            const root = `/${ctx.session.rootCategory.id}/`;
            const pick = found.find((c) => `${c.path ?? ''}/`.includes(root)) ?? found[0];
            if (!pick) throw new Error(`The store has no category with the url key ${urlKey}.`);
            return String(pick.id);
        }),
        attribute,
        optionId: async (code, label) => {
            // By label first; then by the option's own code, which is what a layout field
            // stores and a pack sends (`1column`, never "1 column").
            const options = (await attribute(code)).options ?? [];
            const option = options.find((o) => equalLabel(o.label, label)) ?? options.find((o) => o.value === label);
            if (!option?.value) throw new Error(`The attribute ${code} has no option "${label}".`);
            return option.value;
        },
        groupId: cached(async (code) => {
            if (isNumeric(code)) return Number(code);
            const wanted = GROUP_ALIASES[code] ?? code;
            const found = await readAllPages<{ id: number; code: string }>(ctx.get, 'customerGroups/search', `&${search('customer_group_code', wanted)}`);
            const pick = found.find((g) => g.code === wanted);
            if (!pick) throw new Error(`The store has no customer group ${code}.`);
            return pick.id;
        }),
        productId: cached(async (sku) => {
            const found = await readOrNull<{ id?: number }>(ctx.get, `products/${encodeURIComponent(sku)}`);
            if (found?.id === undefined) throw new Error(`The store has no product ${sku}.`);
            return found.id;
        }),
    };
}

