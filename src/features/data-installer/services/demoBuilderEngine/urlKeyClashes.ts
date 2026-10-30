/**
 * Url keys a pack's categories would collide on (owner, 2026-10-30, after the service parity read).
 *
 * Under a store's root a category gets a storefront url, and two categories with one parent and
 * one url key would share it, which Commerce refuses ("URL key for specified store already
 * exists", from Commerce's rules, not yet seen live here). A pack's own root is attached to no
 * store, so this can only happen when the categories go under the store's root: step 12's
 * placement `store`, or a pack with no root of its own. The Data Installer service never checks.
 *
 * So the install reads first, writes nothing, and stops before any write when one would collide;
 * the preview says the same. Read the way the install walks the tree (`installCategories`): a
 * category found under its parent by name is reused, so only one it would create is checked, and
 * one under a category it would create cannot collide. Categories the install record holds were
 * made by an earlier install of this pack and are never counted against it.
 *
 * Reads `GET categories/list` with `parent_id` and `name`, then `parent_id` and `url_key`.
 *
 * @module features/data-installer/services/demoBuilderEngine/urlKeyClashes
 */

import { CATEGORY_KIND, type CategoryPack, childrenWhere, findChild, parseCategoryPack } from './categoriesKind';
import type { CreatedObject } from './installRecord';
import { ownedKey } from './kindContext';
import { keyOf } from './packForm';
import type { RootPlacement } from './packRoot';
import type { CommerceGet } from '@/types/commerceWire';

/** One of the pack's categories, and the store's own category already using its url key. */
export interface UrlKeyClash {
    name: string;
    urlKey: string;
    /** The store's category with that url key under the same parent. */
    storeCategory: string;
}

type PackCategory = CategoryPack['categories'][number]['category'];

/** The url key the pack gives a category, else the one Commerce would make from its name (accents not folded). */
export function packUrlKey(category: PackCategory): string {
    const own = category.custom_attributes?.find((a) => a.attribute_code === 'url_key')?.value;
    if (typeof own === 'string' && own !== '') return own;
    return category.name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

const depth = (path: string) => path.split('/').length;

/** What the check is told about this install: where the categories go and what the pack made before. */
export interface ClashScope {
    /** The root they go under. */
    storeRootId: number;
    /** What the install record lists: a category on it is the pack's own, never a clash. */
    created: readonly CreatedObject[];
    /** The install's own plan of what it made before (`ownedFrom`): an id, or null for one the SC deleted. */
    owned: ReadonlyMap<string, string | null>;
}

/**
 * The pack's categories that would take a url key the store already uses under the same parent.
 *
 * @param categories - the pack's categories as this install places them (no root of their own)
 */
export async function findUrlKeyClashes(get: CommerceGet, categories: CategoryPack['categories'], scope: ClashScope): Promise<UrlKeyClash[]> {
    const madeIds = new Set(scope.created.filter((o) => o.kind === CATEGORY_KIND).map((o) => o.id));
    const rows = [...categories].sort((a, b) => depth(a.category.path) - depth(b.category.path));
    // The path's first name stands for the store's root (`installCategories`).
    const top = rows[0]?.category.path.split('/')[0] ?? '';
    // A path the store already has, by its id; one the install would create (or leave out) is absent.
    const existing = new Map<string, number>([[top, scope.storeRootId]]);
    const clashes: UrlKeyClash[] = [];
    for (const { category } of rows) {
        const parentId = existing.get(category.path);
        if (parentId === undefined) continue;
        // As the install decides it (`findOrCreate`): its own by id, one the SC deleted left out.
        const mine = scope.owned.get(ownedKey(CATEGORY_KIND, keyOf(CATEGORY_KIND, { category }) ?? ''));
        if (mine === null) continue;
        const found = mine ?? (await findChild(get, parentId, category.name));
        if (found !== undefined) {
            existing.set(`${category.path}/${category.name}`, Number(found));
            continue;
        }
        const urlKey = packUrlKey(category);
        const taken = (await childrenWhere(get, parentId, 'url_key', urlKey)).find((c) => !madeIds.has(String(c.id)));
        if (taken) clashes.push({ name: category.name, urlKey, storeCategory: taken.name ?? String(taken.id) });
    }
    return clashes;
}

/**
 * The clashes for one install, as it places the pack: none when the categories keep a root of
 * their own or the install holds no categories.
 *
 * @param items - the pack's rows as placed (`placeCategories`)
 */
export async function placedClashes(get: CommerceGet, items: Record<string, unknown>, placement: RootPlacement | undefined, scope: ClashScope): Promise<UrlKeyClash[]> {
    if (placement === 'own' || !(CATEGORY_KIND in items)) return [];
    return findUrlKeyClashes(get, parseCategoryPack(items[CATEGORY_KIND]).categories, scope);
}

/** The sentence the preview shows (and the install stops with), or undefined when nothing collides. */
export function clashLine(clashes: readonly UrlKeyClash[]): string | undefined {
    if (clashes.length === 0) return undefined;
    const which = clashes.length === 1 ? "one of the pack's categories" : `${clashes.length} of the pack's categories`;
    const each = clashes.map((c) => `${c.name} (url key "${c.urlKey}", already used by the store's category ${c.storeCategory})`).join(', ');
    return (
        `Commerce would refuse ${which}: ${each}. ` +
        "In the Admin, Catalog > Categories, change the store's category's URL Key (Search Engine Optimization), then install."
    );
}

/** Thrown before any write when the pack's categories would collide on a url key. */
export class UrlKeyClashError extends Error {
    constructor(readonly clashes: UrlKeyClash[]) {
        super(`Nothing was installed. ${clashLine(clashes)}`);
        this.name = 'UrlKeyClashError';
    }
}
