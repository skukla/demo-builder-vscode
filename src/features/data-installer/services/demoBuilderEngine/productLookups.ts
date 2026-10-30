/**
 * The lookups a product row needs before Commerce will take it: a pack names things by what
 * a person reads (an attribute set's name, a category's url key, an option's label, a customer
 * group's code, a child's SKU), and Commerce wants this store's ids (DI-5; catalog spec §8).
 *
 * Every field runs both ways (step 05): install turns names into this store's ids, capture turns
 * ids back into names, so a captured pack installs anywhere. The two directions of a field sit
 * together and share one read of the store. A name the store cannot answer stops an install; an
 * id capture cannot name answers `undefined`, and capture keeps the id, as the service's export
 * does (export spec §2), and tells `unnamed` (step 14), so the save says which.
 *
 * Each answer is cached for one install or capture, as the service caches its own.
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
import { type KindContext, readOrNull, segment } from './kindContext';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';

/** What the store holds for an attribute: how it is entered and its options. */
export interface StoreAttribute {
    attribute_id?: number | string;
    attribute_code?: string;
    frontend_input?: string;
    /** False for Commerce's own attributes, whose select values stay numeric both ways. */
    is_user_defined?: boolean;
    options?: Array<{ label?: string; value?: string }>;
}

/** The names Commerce gives two groups that packs spell another way (the service's aliases). */
const GROUP_ALIASES: Record<string, string> = { General: 'Default (General)', 'NOT LOGGED IN': 'Guest' };

/** The same two groups the other way round, tried when the pack's own spelling finds nothing (step 08). */
const OTHER_SPELLING: Record<string, string> = { 'Default (General)': 'General', Guest: 'NOT LOGGED IN' };

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

/** A category as `GET categories/{id}` answers it, in the fields the engine reads. */
export interface StoreCategory {
    id: number;
    name: string;
    parent_id?: number;
    /** Ids from the top of the tree, slash-separated: `1/2/41`. */
    path?: string;
    is_active?: boolean;
    position?: number;
    include_in_menu?: boolean;
    /** The category's children's ids, comma-separated. */
    children?: string;
    custom_attributes?: Array<{ attribute_code: string; value: unknown }>;
}

/** Lookups for one install's or capture's products: each field, name to id and id to name. */
export interface ProductLookups {
    setId(name: string): Promise<number>;
    setName(id: number | string): Promise<string | undefined>;
    categoryId(urlKey: string): Promise<string>;
    categoryUrlKey(id: number | string): Promise<string | undefined>;
    /** The category itself, or null when the store has none by that id. */
    category(id: number | string): Promise<StoreCategory | null>;
    attribute(code: string): Promise<StoreAttribute>;
    attributeCode(id: number | string): Promise<string | undefined>;
    optionId(code: string, label: string): Promise<string>;
    optionLabel(code: string, id: number | string): Promise<string | undefined>;
    groupId(code: string): Promise<number>;
    groupCode(id: number | string): Promise<string | undefined>;
    productId(sku: string): Promise<number>;
    productSku(id: number | string): Promise<string | undefined>;
    /**
     * Told of each id capture could not turn into a name and kept as it is (`nameOrId`,
     * `packForm.ts`), so a save can name them in its outcome rather than keep them silently
     * (step 14, item 14). Absent outside a save.
     */
    unnamed?: (what: string, id: string) => void;
}

function cached<T>(read: (key: string) => Promise<T>): (key: number | string) => Promise<T> {
    const answers = new Map<string, Promise<T>>();
    return (raw) => {
        const key = String(raw);
        if (!answers.has(key)) answers.set(key, read(key));
        return answers.get(key) as Promise<T>;
    };
}

/** The url key a category carries among its custom attributes. */
export function urlKeyOf(category: StoreCategory): string | undefined {
    const value = category.custom_attributes?.find((a) => a.attribute_code === 'url_key')?.value;
    return typeof value === 'string' ? value : undefined;
}

/** The first item of a search filtered on one field, or undefined. */
async function firstWhere<T>(ctx: KindContext, path: string, field: string, value: string): Promise<T | undefined> {
    return (await readAllPages<T>(ctx.get, path, `&${search(field, value)}`))[0];
}

/** Attribute sets: name to id and back, from the one list of the store's sets. */
function setLookups(ctx: KindContext): Pick<ProductLookups, 'setId' | 'setName'> {
    return {
        setId: cached(async (name) => {
            await loadStoreSets(ctx);
            const id = ctx.session.setIds.get(name);
            if (id === undefined) throw new Error(`The store has no attribute set named ${name}.`);
            return id;
        }),
        setName: async (id) => {
            await loadStoreSets(ctx);
            return [...ctx.session.setIds].find(([, setId]) => String(setId) === String(id))?.[0];
        },
    };
}

/** Categories: url key to id (under the pack's root first) and id back to url key. */
function categoryLookups(ctx: KindContext): Pick<ProductLookups, 'categoryId' | 'categoryUrlKey' | 'category'> {
    const category = cached((id) => readOrNull<StoreCategory>(ctx.get, `categories/${segment(id)}`));
    return {
        categoryId: cached(async (urlKey) => {
            const found = await readAllPages<{ id: number; path?: string }>(ctx.get, 'categories/list', `&${search('url_key', urlKey)}`);
            const root = `/${ctx.session.rootCategory.id}/`;
            const pick = found.find((c) => `${c.path ?? ''}/`.includes(root)) ?? found[0];
            if (!pick) throw new Error(`The store has no category with the url key ${urlKey}.`);
            return String(pick.id);
        }),
        categoryUrlKey: async (id) => {
            const found = await category(String(id));
            return found ? urlKeyOf(found) : undefined;
        },
        category: (id) => category(String(id)),
    };
}

/** Attributes and their options: code to attribute and back, label to option id and back. */
function attributeLookups(ctx: KindContext): Pick<ProductLookups, 'attribute' | 'attributeCode' | 'optionId' | 'optionLabel'> {
    const attribute = cached(async (code) => {
        const found = await readOrNull<StoreAttribute>(ctx.get, `products/attributes/${encodeURIComponent(code)}`);
        if (!found) throw new Error(`The store has no attribute ${code}.`);
        return found;
    });
    return {
        attribute,
        attributeCode: cached(async (id) => (await firstWhere<{ attribute_code?: string }>(ctx, 'products/attributes', 'attribute_id', id))?.attribute_code),
        optionId: async (code, label) => {
            // By label first; then by the option's own code, which is what a layout field
            // stores and a pack sends (`1column`, never "1 column").
            const options = (await attribute(code)).options ?? [];
            const option = options.find((o) => equalLabel(o.label, label)) ?? options.find((o) => o.value === label);
            if (!option?.value) throw new Error(`The attribute ${code} has no option "${label}".`);
            return option.value;
        },
        optionLabel: async (code, id) => {
            const option = ((await attribute(code)).options ?? []).find((o) => o.value === String(id));
            return option?.label?.trim() || undefined;
        },
    };
}

/** Customer groups: code to id (with the service's aliases) and id back to code. */
function groupLookups(ctx: KindContext): Pick<ProductLookups, 'groupId' | 'groupCode'> {
    return {
        groupId: cached(async (code) => {
            if (isNumeric(code)) return Number(code);
            // The pack's spelling's alias first, as before, then the other spelling (step 08).
            const first = GROUP_ALIASES[code] ?? code;
            for (const wanted of first === code ? [code, OTHER_SPELLING[code]] : [first, code]) {
                if (wanted === undefined) continue;
                const found = await readAllPages<{ id: number; code: string }>(ctx.get, 'customerGroups/search', `&${search('customer_group_code', wanted)}`);
                const pick = found.find((g) => g.code === wanted);
                if (pick) return pick.id;
            }
            throw new Error(`The store has no customer group ${code}.`);
        }),
        groupCode: cached(async (id) => (await readOrNull<{ code?: string }>(ctx.get, `customerGroups/${segment(id)}`))?.code),
    };
}

/** Products: SKU to id and id back to SKU, the SKU kept exactly as the store holds it. */
function productIdLookups(ctx: KindContext): Pick<ProductLookups, 'productId' | 'productSku'> {
    return {
        productId: cached(async (sku) => {
            const found = await readOrNull<{ id?: number }>(ctx.get, `products/${encodeURIComponent(sku)}`);
            if (found?.id === undefined) throw new Error(`The store has no product ${sku}.`);
            return found.id;
        }),
        productSku: cached(async (id) => (await firstWhere<{ sku?: string }>(ctx, 'products', 'entity_id', id))?.sku),
    };
}

/** The lookups, over this install's or capture's Commerce access and session. */
export function productLookups(ctx: KindContext): ProductLookups {
    return {
        ...setLookups(ctx),
        ...categoryLookups(ctx),
        ...attributeLookups(ctx),
        ...groupLookups(ctx),
        ...productIdLookups(ctx),
    };
}
