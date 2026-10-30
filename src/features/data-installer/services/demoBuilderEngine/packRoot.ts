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
 * Reads the store structure the wipe reads (`readWipeStructure`, `resolveWipeScope`): the three
 * store lists, and which other stores show the same root.
 *
 * @module features/data-installer/services/demoBuilderEngine/packRoot
 */

import { readWipeStructure } from '../demoDataWipe/wipeReads';
import { resolveWipeScope, storeOfView } from '../demoDataWipe/wipeScope';
import type { CreatedObject, TargetCodes } from './installRecord';
import { ROOT_KEY } from './packForm';
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
    const root = String(group.root_category_id);
    const scope = resolveWipeScope(structure, [{ websiteCode: codes.websiteCode, storeCode: group.code }]);
    return { storeCode: group.code, storeName: group.name, rootId: Number(root), sharedWith: scope.sharedRoots.get(root) ?? [] };
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

/** The pack's rows as this install places them: without the pack's root when its categories go under the store's. */
export function placeCategories(items: Record<string, unknown>, placement: RootPlacement | undefined): Record<string, unknown> {
    if (placement !== 'store') return items;
    const { root_category: _root, ...categories } = items.categories as Row;
    return { ...items, categories };
}

/** The one line an install says when the pack's categories went under the store's root. */
export function underStoreRootLine(placement: RootPlacement | undefined, categories: unknown, storeRoot: StoreRoot | undefined): string | undefined {
    const name = packRootOf(categories)?.name;
    if (placement !== 'store' || typeof name !== 'string' || !storeRoot) return undefined;
    return `${name}'s categories went under the root category of the store ${storeRoot.storeName}, so its storefront shows them.`;
}
