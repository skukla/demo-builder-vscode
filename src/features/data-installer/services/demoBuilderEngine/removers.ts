/**
 * How each recorded kind is taken back out of the store (DI-5), and which may be (step 05). Shared
 * by removing a whole pack (`runPack.ts`), by a repeat install taking out what the pack no longer
 * has (`repeatInstall.ts`), and by the preview of one, so the three never decide two ways.
 *
 * A category or an attribute set this engine made is kept while it holds anything the engine did
 * not make, or is not taking out in the same removal: Commerce deletes a category's children with
 * it and leaves its products in no category, and (by Magento's schema, from memory, not yet checked
 * live) deletes a set's products with it.
 *
 * @module features/data-installer/services/demoBuilderEngine/removers
 */

import { removeAssignment, removeAttributeSet } from './attributeSetsKind';
import { removeAttribute, removeAttributeOption } from './attributesKind';
import { removeCategory } from './categoriesKind';
import type { CreatedObject } from './installRecord';
import { readOrNull, segment } from './kindContext';
import type { StoreCategory } from './productLookups';
import { removeProduct } from './productsKind';
import { removeSource, removeStock, removeStockSourceLink } from './stockKinds';
import { CommerceReadError, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

/** Commerce access for removal. */
export interface RemovalAccess {
    get: CommerceGet;
    send: CommerceSend;
}

type Remover = (commerce: RemovalAccess, object: CreatedObject) => Promise<void>;

/** How each recorded kind is taken back. */
const REMOVERS: Record<string, Remover> = {
    attribute_sets: (c, o) => removeAttributeSet(c.send, o.id),
    product_attributes: (c, o) => removeAttribute(c.send, o.id),
    attribute_options: (c, o) => removeAttributeOption(c.send, o.id),
    attribute_assign_to_set: (c, o) => removeAssignment(c.send, o.id),
    categories: (c, o) => removeCategory(c.send, o.id),
    stocks: (c, o) => removeStock(c, o),
    sources: (c, o) => removeSource(c, o.id),
    stock_source_links: (c, o) => removeStockSourceLink(c.send, o.id),
    products: (c, o) => removeProduct(c.send, o.id),
};

/**
 * Take one recorded object back out of the store.
 *
 * @throws Error naming the object when its kind cannot be taken back or Commerce refuses
 */
export async function takeBack(commerce: RemovalAccess, object: CreatedObject): Promise<void> {
    const remover = REMOVERS[object.kind];
    if (!remover) throw new Error(`The install record lists a ${object.kind}, which Demo Builder cannot take back.`);
    try {
        await remover(commerce, object);
    } catch (error) {
        throw new Error(`Could not take back ${object.kind} ${object.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** A container kept because it holds what the engine did not make. */
export interface KeptContainer {
    object: CreatedObject;
    kind: 'category' | 'set';
    name: string;
    /** How many things of the SC's it holds. */
    count: number;
    holds: 'category' | 'product';
}

const keyOfObject = (kind: string, id: string) => `${kind}\u0000${id}`;

/** The products in a set or a category, by SKU; none when the store has no such search. */
async function productsWhere(get: CommerceGet, field: 'attribute_set_id' | 'category_id', id: string): Promise<string[]> {
    const criteria = `&searchCriteria[filterGroups][0][filters][0][field]=${field}&searchCriteria[filterGroups][0][filters][0][value]=${segment(id)}`;
    try {
        return (await readAllPages<{ sku: string }>(get, 'products', criteria)).map((p) => p.sku);
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return [];
        throw error;
    }
}

/** What a container holds that is not being taken out with it, or undefined when nothing. */
async function heldByOthers(get: CommerceGet, object: CreatedObject, taking: ReadonlySet<string>): Promise<KeptContainer | undefined> {
    if (object.kind === 'categories') {
        const category = await readOrNull<StoreCategory>(get, `categories/${segment(object.id)}`);
        const name = category?.name ?? object.id;
        const others = (category?.children ?? '').split(',').map((id) => id.trim()).filter((id) => id !== '' && !taking.has(keyOfObject('categories', id)));
        if (others.length > 0) return { object, kind: 'category', name, count: others.length, holds: 'category' };
        // Its products too: deleting the category would leave the SC's own in no category at all.
        const products = (await productsWhere(get, 'category_id', object.id)).filter((sku) => !taking.has(keyOfObject('products', sku)));
        if (products.length === 0) return undefined;
        return { object, kind: 'category', name, count: products.length, holds: 'product' };
    }
    if (object.kind === 'attribute_sets') {
        const others = (await productsWhere(get, 'attribute_set_id', object.id)).filter((sku) => !taking.has(keyOfObject('products', sku)));
        if (others.length === 0) return undefined;
        const set = await readOrNull<{ attribute_set_name?: string }>(get, `products/attribute-sets/${segment(object.id)}`);
        return { object, kind: 'set', name: set?.attribute_set_name ?? object.id, count: others.length, holds: 'product' };
    }
    return undefined;
}

/**
 * Which of these objects to take out and which containers to keep, read-only and up front.
 *
 * @param newestFirst - what a removal would take out, newest first, so a child is decided
 *   before the container it sits in; a kept child keeps its container too
 */
export async function decideRemovals(get: CommerceGet, newestFirst: readonly CreatedObject[]): Promise<{ take: CreatedObject[]; kept: KeptContainer[] }> {
    const taking = new Set(newestFirst.map((o) => keyOfObject(o.kind, o.id)));
    const take: CreatedObject[] = [];
    const kept: KeptContainer[] = [];
    for (const object of newestFirst) {
        const held = await heldByOthers(get, object, taking);
        if (held) {
            taking.delete(keyOfObject(object.kind, object.id));
            kept.push(held);
        } else {
            take.push(object);
        }
    }
    return { take, kept };
}

/** "1 product", "2 products", "2 categories". */
function plural(count: number, word: 'category' | 'product'): string {
    if (count === 1) return `1 ${word}`;
    return word === 'category' ? `${count} categories` : `${count} products`;
}

/** The one line a removal says about the containers it kept, or nothing when it kept none. */
export function containersLine(kept: readonly KeptContainer[]): string | undefined {
    if (kept.length === 0) return undefined;
    if (kept.length === 1) {
        const [one] = kept;
        return `Kept the ${one.kind} ${one.name}: it holds ${plural(one.count, one.holds)} you added.`;
    }
    const names = kept.map((k) => `the ${k.kind} ${k.name}`);
    return `Kept ${kept.length} things that hold what you added: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}
