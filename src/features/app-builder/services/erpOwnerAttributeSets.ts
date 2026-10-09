/**
 * Is `erp_owner` in every attribute set the store's products use, and the fix when it is not
 * (AB-74).
 *
 * Commerce drops a value written for an attribute that is not in the product's attribute set
 * and still answers 200 (measured on Bodea 2026-09-30, reference note "Commerce product create
 * gotchas"), so a product in such a set can be tagged for an ERP all day and never move. The
 * check reads which sets the products use and which of those lack `erp_owner`; the fix adds
 * it to each, and the undo takes it out again.
 *
 * Routes, from Magento's own `Catalog/etc/webapi.xml` (2.4-develop, read 2026-10-09):
 * `GET products/attribute-sets/sets/list`, `GET products/attribute-sets/{id}/attributes`,
 * `GET products/attribute-sets/groups/list`, `POST products/attribute-sets/attributes`
 * (`attributeSetId`, `attributeGroupId`, `attributeCode`, `sortOrder`; a null group is
 * refused, per the same note) and `DELETE products/attribute-sets/{id}/attributes/{code}`.
 * The REST set carries no default group, so the group is the set's "Product Details"
 * (`product-details`, where Admin puts a new attribute), else "General", else its first.
 *
 * Pure over a get and a send it is handed.
 *
 * @module features/app-builder/services/erpOwnerAttributeSets
 */

import type { CommerceSend } from './commerceBulk';
import type { CommerceGet } from './erpFillReaders';
import type {
    CommerceAttributeGroupList,
    CommerceAttributeSetList,
    CommerceProductSetPage,
    CommerceSetAttribute,
} from '@/types/commerceWire';
import type { AttributeSetWithoutOwner } from '@/types/erpAssign';

export const OWNER_CODE = 'erp_owner';
const PAGE_SIZE = 100;
/** Where the attribute sits in the group: after the set's own attributes. */
const SORT_ORDER = 900;

/** One product, as far as the set check reads it. */
export interface ProductSetRow {
    sku: string;
    attributeSetId: number;
}

/**
 * Every product's attribute set, read a page at a time with only the two fields. Throws when
 * Commerce does not say how many products there are: a count the read cannot trust is not
 * a reason to say every set is fine.
 */
export async function readProductSets(get: CommerceGet): Promise<ProductSetRow[]> {
    const rows: ProductSetRow[] = [];
    for (let page = 1; ; page += 1) {
        const query =
            `products?searchCriteria[currentPage]=${page}&searchCriteria[pageSize]=${PAGE_SIZE}` +
            '&fields=items[sku,attribute_set_id],total_count';
        const answer = (await get(query)) as CommerceProductSetPage | null;
        if (typeof answer?.total_count !== 'number') {
            throw new Error('Commerce did not say how many products it has.');
        }
        const items = answer.items ?? [];
        rows.push(...items.map((item) => ({ sku: String(item.sku ?? ''), attributeSetId: Number(item.attribute_set_id) })));
        if (items.length === 0 || rows.length >= answer.total_count) return rows;
    }
}

/** How many products use each set, by set id. */
function usageOf(products: readonly ProductSetRow[]): Map<number, number> {
    const usage = new Map<number, number>();
    for (const product of products) usage.set(product.attributeSetId, (usage.get(product.attributeSetId) ?? 0) + 1);
    return usage;
}

/** The product attribute sets' names, by id. */
async function setNames(get: CommerceGet): Promise<Map<number, string>> {
    const answer = (await get('products/attribute-sets/sets/list?searchCriteria[pageSize]=500')) as CommerceAttributeSetList | null;
    return new Map((answer?.items ?? []).map((set) => [Number(set.attribute_set_id), set.attribute_set_name]));
}

/** Whether a set's attributes include `erp_owner`. */
async function setHasOwner(get: CommerceGet, setId: number): Promise<boolean> {
    const attributes = (await get(`products/attribute-sets/${setId}/attributes`)) as CommerceSetAttribute[] | null;
    return (attributes ?? []).some((attribute) => attribute.attribute_code === OWNER_CODE);
}

/**
 * The sets the products use that lack `erp_owner`, with how many products each holds, the
 * set with the most products first.
 *
 * @param get - the signed Commerce GET
 * @param products - every product's set
 */
export async function setsWithoutOwner(
    get: CommerceGet,
    products: readonly ProductSetRow[],
): Promise<AttributeSetWithoutOwner[]> {
    const usage = usageOf(products);
    if (usage.size === 0) return [];
    const names = await setNames(get);
    const missing: AttributeSetWithoutOwner[] = [];
    // One read per set the products use: a handful.
    for (const [id, count] of usage) {
        if (!(await setHasOwner(get, id))) missing.push({ id, name: names.get(id) ?? `set ${id}`, products: count });
    }
    return missing.sort((a, b) => b.products - a.products);
}

/** The sets in words: "Default (12 products) and Gear (3 products)". */
export function setsInWords(sets: readonly AttributeSetWithoutOwner[]): string {
    const each = sets.map((set) => `${set.name} (${set.products} product${set.products === 1 ? '' : 's'})`);
    return each.length < 2 ? each.join('') : `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}`;
}

/** The group a new attribute goes in: Product Details, else General, else the set's first. */
export async function groupFor(get: CommerceGet, setId: number): Promise<number> {
    const filter =
        'searchCriteria[filter_groups][0][filters][0][field]=attribute_set_id' +
        `&searchCriteria[filter_groups][0][filters][0][value]=${setId}`;
    const answer = (await get(`products/attribute-sets/groups/list?${filter}`)) as CommerceAttributeGroupList | null;
    const groups = answer?.items ?? [];
    const pick =
        groups.find((group) => group.extension_attributes?.attribute_group_code === 'product-details') ??
        groups.find((group) => group.attribute_group_name === 'General') ??
        [...groups].sort((a, b) => Number(a.extension_attributes?.sort_order ?? 0) - Number(b.extension_attributes?.sort_order ?? 0))[0];
    if (!pick) throw new Error(`Attribute set ${setId} has no attribute group to put erp_owner in.`);
    return Number(pick.attribute_group_id);
}

/** What an add or a removal did: the sets it changed, and why it stopped when it did. */
export interface SetsChanged {
    changed: Array<{ id: number; name: string }>;
    error?: string;
}

/**
 * Add `erp_owner` to each set, in order. The first refusal stops it; what was added before
 * it is answered, so the caller records exactly that.
 */
export async function addOwnerToSets(
    get: CommerceGet,
    send: CommerceSend,
    sets: ReadonlyArray<{ id: number; name: string }>,
): Promise<SetsChanged> {
    const changed: SetsChanged['changed'] = [];
    for (const set of sets) {
        try {
            const attributeGroupId = await groupFor(get, set.id);
            await send('POST', 'products/attribute-sets/attributes', {
                attributeSetId: set.id,
                attributeGroupId,
                attributeCode: OWNER_CODE,
                sortOrder: SORT_ORDER,
            });
            changed.push({ id: set.id, name: set.name });
        } catch (error) {
            return { changed, error: `${set.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    return { changed };
}

/** Take `erp_owner` out of each set again, in order; the first refusal stops it. */
export async function removeOwnerFromSets(
    send: CommerceSend,
    sets: ReadonlyArray<{ id: number; name: string }>,
): Promise<SetsChanged> {
    const changed: SetsChanged['changed'] = [];
    for (const set of sets) {
        try {
            await send('DELETE', `products/attribute-sets/${set.id}/attributes/${OWNER_CODE}`, undefined);
            changed.push({ id: set.id, name: set.name });
        } catch (error) {
            return { changed, error: `${set.name}: ${error instanceof Error ? error.message : String(error)}` };
        }
    }
    return { changed };
}
