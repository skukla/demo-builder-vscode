/**
 * Where a pack's own root category goes (datapack-engine step 12, owner 2026-10-30).
 *
 * A pack can bring a top category of its own (Frescopa's is "Frescopa"). Made as a new root, it
 * shows on no storefront until a store uses it as its root, and no API can change a store's root:
 * `POST/PUT /V1/store/storeGroups` answer 404 on ACCS (measured 2026-10-30), and Commerce's REST
 * spec and PaaS's `webapi.xml` expose the store routes as GET only. So:
 *
 * - **the store has a root of its own** (no other store shows it): the pack's root is not made,
 *   and its categories go straight under the store's root. That is what the storefront would
 *   show had the store's root been switched to the pack's, with nothing to do in the Admin, and
 *   removal takes them back with no store change.
 * - **the root is shared** with another store (`justrite_test_website` shows JustRite's root 119):
 *   the pack keeps its own root, and the SC is asked for the one Admin step (`packRootStep.ts`).
 *
 * The choice is made once, at the first install, and a repeat install follows what the record
 * says was done: a recorded root means the pack has its own; recorded categories with no root
 * mean they went under the store's. A record from before this step always has its root, so an
 * existing install keeps it (rule 3).
 *
 * Dropping the root is all "under the store's root" needs: a pack's paths start with its root's
 * name, and a pack with no root of its own has its paths' first name mapped onto the store's root
 * (`installCategories`). A category's key leaves that first name out (`packForm.categoryKey`), so
 * the keys, the record and a repeat install are the same either way.
 *
 * Reads the store structure the wipe reads (`readWipeStructure`): the three store lists, and
 * which other stores show the same root.
 *
 * @module features/data-installer/services/demoBuilderEngine/packRoot
 */

import { readWipeStructure } from '../demoDataWipe/wipeReads';
import { CATALOG_CATEGORIES_KIND } from './b2bKeys';
import type { CreatedObject, TargetCodes } from './installRecord';
import { ROOT_KEY } from './packForm';
import type { CommerceStoreGroup, CommerceStoreStructure } from '@/types/commerceStore';
import type { CommerceGet } from '@/types/commerceWire';

/** The store a pack is installed for, and the root category it shows. */
export interface StoreRoot {
    /** The store (store group) the install target's store view belongs to. */
    storeCode: string;
    storeName: string;
    /** `root_category_id` of that store, from `GET store/storeGroups`. */
    rootId: number;
    /** The other stores showing the same root: "the store justrite_store (website justrite)". */
    sharedWith: string[];
}

/** Where the pack's own root goes: made as a root of its own, or left out, its categories under the store's. */
export type RootPlacement = 'own' | 'store';

type Row = Record<string, unknown>;

/** The kinds whose rows are products, and so name their categories by url key. */
const PRODUCT_ROW_KINDS = ['products', 'giftcards'];

/** The pack's own root category row, when it has one. */
export function packRootOf(categories: unknown): Row | undefined {
    const root = (categories as Row | null | undefined)?.root_category;
    return root && typeof root === 'object' ? (root as Row) : undefined;
}

/**
 * The install target's store and its root, read from the store as it is now. Undefined when the
 * store view is not in the store's lists (the install target's own read refuses that first).
 */
export async function readStoreRoot(get: CommerceGet, codes: TargetCodes): Promise<StoreRoot | undefined> {
    const structure = await readWipeStructure(get);
    const group = storeOfView(structure, codes.websiteCode, codes.storeCode);
    if (!group) return undefined;
    return { storeCode: group.code, storeName: group.name, rootId: Number(group.root_category_id), sharedWith: othersShowing(structure, group) };
}

/** The store a store view belongs to, on that website: how an install target's view names its store. */
function storeOfView(structure: CommerceStoreStructure, websiteCode: string, viewCode: string): CommerceStoreGroup | undefined {
    const site = structure.websites.find((w) => w.code === websiteCode);
    const view = structure.storeViews.find((v) => v.code === viewCode && String(v.website_id) === String(site?.id));
    return view ? structure.storeGroups.find((g) => String(g.id) === String(view.store_group_id)) : undefined;
}

/** Every other store showing the store's root: "the store justrite_store (website justrite)". */
function othersShowing(structure: CommerceStoreStructure, group: CommerceStoreGroup): string[] {
    const codeOf = new Map(structure.websites.map((w) => [String(w.id), w.code]));
    return structure.storeGroups
        .filter((g) => String(g.id) !== String(group.id) && String(g.root_category_id) === String(group.root_category_id))
        .map((g) => `the store ${g.code} (website ${codeOf.get(String(g.website_id)) ?? g.website_id})`);
}

/**
 * Where this install puts the pack's root: what the record says was done, else (a first install)
 * under the store's root when no other store shows it. Undefined when the pack has no root of its
 * own, so there is nothing to decide.
 *
 * @param categories - the pack's `categories` rows
 * @param created - what the install record lists
 * @param storeRoot - the install target's store; absent (unread) keeps the pack's own root, as before
 */
export function rootPlacement(categories: unknown, created: readonly CreatedObject[], storeRoot: StoreRoot | undefined): RootPlacement | undefined {
    if (!packRootOf(categories)) return undefined;
    const made = created.filter((o) => o.kind === 'categories');
    // A root on the record, or a category recorded before keys were kept (every such record made its root).
    if (made.some((o) => o.key === undefined || o.key === ROOT_KEY)) return 'own';
    if (made.length > 0) return 'store';
    if (!storeRoot) return 'own';
    return storeRoot.sharedWith.length > 0 ? 'own' : 'store';
}

/** The url key a pack's root names, when it names one. */
function rootUrlKey(root: Row | undefined): string | undefined {
    const attributes = (root?.custom_attributes ?? []) as Row[];
    const key = attributes.find((a) => a.attribute_code === 'url_key')?.value;
    return typeof key === 'string' ? key : undefined;
}

/** One product row, with the root left out of the two places a product names its categories. */
function productWithoutRoot(row: Row, key: string): Row {
    const product = row.product as Row | undefined;
    if (!product) return row;
    const ext = product.extension_attributes as Row | undefined;
    const links = ext?.category_links as Row[] | undefined;
    const attributes = product.custom_attributes as Row[] | undefined;
    return {
        ...row,
        product: {
            ...product,
            ...(links ? { extension_attributes: { ...ext, category_links: links.filter((l) => l.category_id !== key) } } : {}),
            ...(attributes
                ? {
                      custom_attributes: attributes.map((a) =>
                          a.attribute_code === 'category_ids' && Array.isArray(a.value)
                              ? { ...a, value: a.value.filter((id) => id !== key) }
                              : a,
                      ),
                  }
                : {}),
        },
    };
}

/** A shared catalog's categories, with the root left out. */
function catalogsWithoutRoot(records: Row, key: string): Row {
    const catalogs = records.catalogs as Row[] | undefined;
    if (!Array.isArray(catalogs)) return records;
    return { ...records, catalogs: catalogs.map((c) => ({ ...c, categories: (c.categories as Row[]).filter((m) => m.id !== key) })) };
}

/**
 * The rows that name the pack's root by its url key, with the root left out: it is not made, so no
 * category has that key. A product keeps its other categories, and its place in the store's root
 * is what the storefront shows anyway.
 */
function withoutRootLinks(items: Record<string, unknown>, key: string): Record<string, unknown> {
    const out = { ...items };
    for (const kind of PRODUCT_ROW_KINDS) {
        if (Array.isArray(out[kind])) out[kind] = (out[kind] as Row[]).map((row) => productWithoutRoot(row, key));
    }
    if (out[CATALOG_CATEGORIES_KIND]) out[CATALOG_CATEGORIES_KIND] = catalogsWithoutRoot(out[CATALOG_CATEGORIES_KIND] as Row, key);
    return out;
}

/** The pack's rows as this install places them: without the pack's root when its categories go under the store's. */
export function placeCategories(items: Record<string, unknown>, placement: RootPlacement | undefined): Record<string, unknown> {
    if (placement !== 'store') return items;
    const { root_category: root, ...categories } = items.categories as Row;
    const key = rootUrlKey(root as Row | undefined);
    return { ...(key ? withoutRootLinks(items, key) : items), categories };
}

/** The one line an install says when the pack's categories went under the store's root. */
export function underStoreRootLine(placement: RootPlacement | undefined, categories: unknown, storeRoot: StoreRoot | undefined): string | undefined {
    const name = packRootOf(categories)?.name;
    if (placement !== 'store' || typeof name !== 'string' || !storeRoot) return undefined;
    return `${name}'s categories went under the root category of the store ${storeRoot.storeName}, so its storefront shows them.`;
}
