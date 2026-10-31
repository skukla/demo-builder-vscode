/**
 * How each recorded kind is taken back out of the store (DI-5), and which may be (step 05). Shared
 * by removing a whole pack (`runPack.ts`), by a repeat install taking out what the pack no longer
 * has (`repeatInstall.ts`), and by the preview of one, so the three never decide two ways.
 *
 * A category, an attribute set or a cart rule this engine made is kept while it holds anything the
 * engine did not make, or is not taking out in the same removal (a rule's coupons go with it, step 11): Commerce deletes a category's children with
 * it and leaves its products in no category, and (by Magento's schema, from memory, not yet checked
 * live) deletes a set's products with it.
 *
 * Everything is decided before anything is written, so no write touches an object a later decision
 * keeps (live, 2026-10-30: the assignments went first, unassigning a company a later decision kept,
 * which moved it and the SC's customer in it to group 1). Companies are decided first, since what a
 * kept company keeps (`b2bContainers.ts`) the other containers must see as staying; the assignments
 * last, since one is taken out only when neither side it links is staying.
 *
 * @module features/data-installer/services/demoBuilderEngine/removers
 */

import { removeAssignment, removeAttributeSet } from './attributeSetsKind';
import { removeAttribute, removeAttributeOption } from './attributesKind';
import { type Taking, b2bHeldByOthers, isB2bContainer } from './b2bContainers';
import { type AssignmentKind, CATALOG_CATEGORIES_KIND, CATALOG_COMPANIES_KIND, CATALOG_KIND, CATALOG_PRODUCTS_KIND, COMPANY_KIND, isAssignmentKind } from './b2bKeys';
import { CART_RULE_KIND, removeCartRule } from './cartRulesKind';
import { removeCategory } from './categoriesKind';
import { removeCompany } from './companiesKind';
import { COUPON_KIND, couponsOfRule, removeCoupon } from './couponsKind';
import { removeCustomer, removeCustomerGroup } from './customerKinds';
import type { CreatedObject } from './installRecord';
import { readOrNull, segment } from './kindContext';
import { ROOT_KEY } from './packForm';
import { storeShowingRoot } from './packRootStep';
import type { StoreCategory } from './productLookups';
import { PRODUCT_KINDS, removeProduct } from './productsKind';
import { removeAssignmentPair, removeCatalog, splitPair } from './sharedCatalogKinds';
import { removeSource, removeStock, removeStockSourceLink } from './stockKinds';
import { andList } from '@/core/utils/andList';
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
    giftcards: (c, o) => removeProduct(c.send, o.id),
    // Step 08.
    customer_groups: (c, o) => removeCustomerGroup(c.send, o.id),
    customers: (c, o) => removeCustomer(c.send, o.id),
    b2b_shared_catalogs: (c, o) => removeCatalog(c.send, o.id),
    b2b_companies: (c, o) => removeCompany(c.send, o.id),
    b2b_shared_catalog_company_assignments: (c, o) => removeAssignmentPair(c.send, CATALOG_COMPANIES_KIND, o.id),
    b2b_shared_catalog_categories: (c, o) => removeAssignmentPair(c.send, CATALOG_CATEGORIES_KIND, o.id),
    b2b_shared_catalog_products: (c, o) => removeAssignmentPair(c.send, CATALOG_PRODUCTS_KIND, o.id),
    // Step 11: Commerce deletes a rule's coupons with it.
    cart_rules: (c, o) => removeCartRule(c.send, o.id),
    coupons: (c, o) => removeCoupon(c.send, o.id),
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
    kind: 'category' | 'set' | 'company' | 'shared catalog' | 'customer group' | 'customer' | 'cart rule';
    name: string;
    /** How many things of the SC's it holds. */
    count: number;
    holds: 'category' | 'product' | 'coupon' | 'thing';
    /**
     * Why it was kept, in words, when one count of one thing cannot say it (step 08: a catalog
     * holding products and a company; a company whose members could not be read).
     */
    reason?: string;
    /**
     * Kept with it, as one, and on the record too (live, 2026-10-30; `b2bContainers.ts`): a shared
     * catalog's customer group, which Commerce deletes with the catalog; a company's admin, which
     * Commerce will not delete while the company stands, and its catalog with that catalog's group.
     */
    with?: KeptPartner[];
    /** The pack's root, kept because this store (as the Admin names it) shows it as its root (step 12). */
    rootOfStore?: string;
}

/** One thing kept with a container, and how its line names it ("its admin"; "its <kind>" by default). */
export interface KeptPartner {
    object: CreatedObject;
    kind: KeptContainer['kind'];
    name: string;
    as?: string;
}

/** Every object a removal kept: each container, and what was kept with it. */
export function keptObjects(kept: readonly KeptContainer[]): CreatedObject[] {
    return kept.flatMap((k) => [k.object, ...(k.with ?? []).map((p) => p.object)]);
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

/** Whether a SKU is a product or gift card the same removal is taking. */
const takingSku = (taking: ReadonlySet<string>, sku: string): boolean => PRODUCT_KINDS.some((kind) => taking.has(keyOfObject(kind, sku)));

/**
 * A cart rule this engine made, kept while it holds a coupon not going with it (step 11): Commerce
 * deletes a rule's coupons with it. Its coupons are `GET coupons/search` on `rule_id`; a read that
 * fails keeps it. Named as the store calls it now (`GET salesRules/{id}`, `name`).
 */
async function cartRuleHeld(get: CommerceGet, object: CreatedObject, taking: ReadonlySet<string>): Promise<KeptContainer | undefined> {
    let others: number;
    try {
        others = (await couponsOfRule(get, object.id)).filter((c) => !taking.has(keyOfObject(COUPON_KIND, String(c.coupon_id)))).length;
    } catch (error) {
        if (error instanceof CommerceReadError && error.status === 404) return undefined;
        return { object, kind: 'cart rule', name: object.key ?? object.id, count: 0, holds: 'thing', reason: 'Demo Builder could not read its coupons' };
    }
    if (others === 0) return undefined;
    const rule = await readOrNull<{ name?: string }>(get, `salesRules/${segment(object.id)}`).catch(() => null);
    return { object, kind: 'cart rule', name: rule?.name || object.key || object.id, count: others, holds: 'coupon' };
}

/** What a container holds that is not being taken out with it, or undefined when nothing. */
async function heldByOthers(get: CommerceGet, object: CreatedObject, removal: Taking, taking: ReadonlySet<string>): Promise<KeptContainer | undefined> {
    if (object.kind === CART_RULE_KIND) return cartRuleHeld(get, object, taking);
    if (object.kind === 'categories') {
        const category = await readOrNull<StoreCategory>(get, `categories/${segment(object.id)}`);
        const name = category?.name ?? object.id;
        // Step 12: a store the SC pointed at the pack's root would be left with no root at all.
        const showing = object.key === ROOT_KEY ? await storeShowingRoot(get, object.id) : undefined;
        if (showing) return { object, kind: 'category', name, count: 0, holds: 'thing', reason: showing.reason, ...(showing.store ? { rootOfStore: showing.store } : {}) };
        const others = (category?.children ?? '').split(',').map((id) => id.trim()).filter((id) => id !== '' && !taking.has(keyOfObject('categories', id)));
        if (others.length > 0) return { object, kind: 'category', name, count: others.length, holds: 'category' };
        // Its products too: deleting the category would leave the SC's own in no category at all.
        const products = (await productsWhere(get, 'category_id', object.id)).filter((sku) => !takingSku(taking, sku));
        if (products.length === 0) return undefined;
        return { object, kind: 'category', name, count: products.length, holds: 'product' };
    }
    if (isB2bContainer(object.kind)) return b2bHeldByOthers(get, object, removal);
    if (object.kind === 'attribute_sets') {
        const others = (await productsWhere(get, 'attribute_set_id', object.id)).filter((sku) => !takingSku(taking, sku));
        if (others.length === 0) return undefined;
        const set = await readOrNull<{ attribute_set_name?: string }>(get, `products/attribute-sets/${segment(object.id)}`);
        return { object, kind: 'set', name: set?.attribute_set_name ?? object.id, count: others.length, holds: 'product' };
    }
    return undefined;
}

/** The kind an assignment's member is recorded under. */
const MEMBER_KIND: Record<AssignmentKind, string> = {
    [CATALOG_COMPANIES_KIND]: COMPANY_KIND,
    [CATALOG_CATEGORIES_KIND]: 'categories',
    [CATALOG_PRODUCTS_KIND]: 'products',
};

/** Companies first, then the other containers newest first; assignments are not containers. */
function decisionOrder(newestFirst: readonly CreatedObject[]): CreatedObject[] {
    const others = newestFirst.filter((o) => !isAssignmentKind(o.kind));
    return [...others.filter((o) => o.kind === COMPANY_KIND), ...others.filter((o) => o.kind !== COMPANY_KIND)];
}

/**
 * Which of these objects to take out and which containers to keep, read-only and up front. An
 * object kept with a container (`KeptContainer.with`) is decided with it; an assignment is taken
 * out only when neither the catalog nor the member it links is staying. Every object not taken
 * stays on the record.
 *
 * @param newestFirst - what a removal would take out, newest first, so a child is decided
 *   before the container it sits in; a kept child keeps its container too
 * @returns `take` in the order given, so writes still run newest first
 */
export async function decideRemovals(get: CommerceGet, newestFirst: readonly CreatedObject[]): Promise<{ take: CreatedObject[]; kept: KeptContainer[] }> {
    const listed = new Set(newestFirst.map((o) => keyOfObject(o.kind, o.id)));
    // Still to be taken: shrinks as decisions keep things.
    const taking = new Set(listed);
    const byKey = new Map(newestFirst.map((o) => [keyOfObject(o.kind, o.id), o]));
    const removal: Taking = {
        has: (kind, id) => taking.has(keyOfObject(kind, id)),
        find: (kind, id) => (taking.has(keyOfObject(kind, id)) ? byKey.get(keyOfObject(kind, id)) : undefined),
        of: (kind) => newestFirst.filter((o) => o.kind === kind && taking.has(keyOfObject(o.kind, o.id))),
    };
    const kept: KeptContainer[] = [];
    for (const object of decisionOrder(newestFirst)) {
        // Kept already, with a container decided before it (a company's catalog, a catalog's group).
        if (!taking.has(keyOfObject(object.kind, object.id))) continue;
        const held = await heldByOthers(get, object, removal, taking);
        if (!held) continue;
        for (const one of keptObjects([held])) taking.delete(keyOfObject(one.kind, one.id));
        kept.push(held);
    }
    const staying = (kind: string, id: string) => listed.has(keyOfObject(kind, id)) && !taking.has(keyOfObject(kind, id));
    for (const pair of newestFirst.filter((o) => isAssignmentKind(o.kind))) {
        const { catalogId, ref } = splitPair(pair.id);
        if (staying(CATALOG_KIND, catalogId) || staying(MEMBER_KIND[pair.kind as AssignmentKind], ref)) taking.delete(keyOfObject(pair.kind, pair.id));
    }
    return { take: newestFirst.filter((o) => taking.has(keyOfObject(o.kind, o.id))), kept };
}

/** "1 product", "2 products", "2 categories". */
function plural(count: number, word: KeptContainer['holds']): string {
    if (count === 1) return `1 ${word}`;
    return word === 'category' ? `${count} categories` : `${count} ${word}s`;
}

/** Why one container was kept: its own words, or one count of one thing. */
const reasonOf = (kept: KeptContainer): string => kept.reason ?? `it holds ${plural(kept.count, kept.holds)} you added`;

/** "the shared catalog Gold and its customer group Gold"; "the company Acme, its admin …, …". */
const namedAs = (kept: KeptContainer): string =>
    andList([`the ${kept.kind} ${kept.name}`, ...(kept.with ?? []).map((p) => `${p.as ?? `its ${p.kind}`} ${p.name}`)]);

/** The one line a removal says about the containers it kept, or nothing when it kept none. */
export function containersLine(kept: readonly KeptContainer[]): string | undefined {
    if (kept.length === 0) return undefined;
    if (kept.length === 1) {
        const [one] = kept;
        return `Kept ${namedAs(one)}: ${reasonOf(one)}.`;
    }
    const names = kept.map(namedAs);
    return `Kept ${kept.length} things that hold what you added: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}
