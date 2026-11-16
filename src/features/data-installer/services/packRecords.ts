/**
 * A pack's records by name, per data type, for the install window's Review Records (datapack
 * simplification step 03, S4). Each record is named as the pack names it, by `keyOf`
 * (`packForm.ts`): the name a repeat install finds it by, so the spot check and the install agree.
 * A data type that keeps no record (`keyOf` has no key for it) has no names to show.
 *
 * Rows are read as the install reads them (`rowsByKey`), so a kind a pack holds as an object
 * is listed too: categories are `{ root_category, categories: [...] }`, and this read skipped
 * them, leaving Review Records' Categories empty under a count of 10 (walk F148, 2026-11-16).
 * The root's key is `(root)`, so it is shown by its own name.
 *
 * Pure: no store, no read.
 *
 * @module features/data-installer/services/packRecords
 */

import { ROOT_KEY } from './demoBuilderEngine/packForm';
import type { TreeListNode } from '@/core/ui/components/ui/TreeList';
import type { PackItems } from './demoBuilderEngine/runPack';
import { rowsByKey } from './demoBuilderEngine/storeCopies';

/** The root category's own name, for the row the pack keys `(root)`. */
function rootName(records: unknown): string | undefined {
    const name = (records as { root_category?: { name?: unknown } } | null)?.root_category?.name;
    return typeof name === 'string' && name !== '' ? name : undefined;
}

/** The kinds whose rows are products, named by SKU. */
const PRODUCT_KINDS = ['products', 'giftcards'];

/**
 * Each product's name by its SKU, for Review Records' Name column beside the SKU (walk F147). Only
 * products with a name; none when the pack holds no products.
 */
export function productNamesOf(items: PackItems): Record<string, string> {
    const names: Record<string, string> = {};
    for (const kind of PRODUCT_KINDS) {
        for (const row of rowsByKey(kind, items[kind]).values()) {
            const product = (row as { product?: { sku?: unknown; name?: unknown } }).product;
            if (typeof product?.sku === 'string' && typeof product.name === 'string' && product.name !== '') names[product.sku] = product.name;
        }
    }
    return names;
}

type CategoryRow = { name?: unknown; path?: unknown };

/** The category rows, the pack's root first, each with its place: its parents' names, joined by '/'. */
function categoryRows(records: unknown): CategoryRow[] {
    const holder = (records ?? {}) as { root_category?: CategoryRow; categories?: Array<{ category?: CategoryRow }> };
    const root = holder.root_category ? [{ ...holder.root_category, path: '' }] : [];
    return [...root, ...(holder.categories ?? []).map((row) => row.category ?? {})];
}

/**
 * The pack's categories as a tree, each under its parent, for Review Records (owner yes,
 * 2026-11-16: Steve expected the tree, and Clear's spot check draws one). A category whose parent
 * the pack does not hold (the store's own root) is at the top.
 */
export function categoryTreeOf(items: PackItems): TreeListNode[] {
    const nodes = new Map<string, TreeListNode>();
    const top: TreeListNode[] = [];
    for (const row of categoryRows(items.categories)) {
        if (typeof row.name !== 'string' || row.name === '') continue;
        const parent = typeof row.path === 'string' ? row.path : '';
        const place = parent ? `${parent}/${row.name}` : row.name;
        const node: TreeListNode = { name: row.name, id: place };
        nodes.set(place, node);
        const above = nodes.get(parent);
        if (above) (above.children ??= []).push(node);
        else top.push(node);
    }
    return top;
}

/** The pack's root category by its name, when it has one: what an SC calls the `(root)` record. */
export function packRootName(items: PackItems): string | undefined {
    return rootName(items.categories);
}

/**
 * Category records named by key ("Coffee/Bagged Coffee", the place under the pack's root) as a
 * tree, for an uninstall's Review Records (owner, 2026-11-16: the same tree Install, Switch and
 * Save draw). The root record (`(root)`) heads it, named `rootLabel`; a key whose parent is not
 * among them (kept, or the store's own root) is at the top.
 */
export function categoryTreeOfKeys(keys: readonly string[], rootLabel: string): TreeListNode[] {
    const root: TreeListNode | undefined = keys.includes(ROOT_KEY) ? { name: rootLabel, id: ROOT_KEY } : undefined;
    const nodes = new Map<string, TreeListNode>();
    const top: TreeListNode[] = [];
    const depth = (key: string): number => key.split('/').length;
    for (const key of keys.filter((k) => k !== ROOT_KEY).sort((a, b) => depth(a) - depth(b))) {
        const cut = key.lastIndexOf('/');
        const node: TreeListNode = { name: key.slice(cut + 1), id: key };
        nodes.set(key, node);
        const above = cut < 0 ? root : nodes.get(key.slice(0, cut));
        if (above) (above.children ??= []).push(node);
        else top.push(node);
    }
    return root ? [root, ...top] : top;
}

/** Each kind's record names, in the pack's order; kinds with no key or no rows are left out. */
export function recordNames(items: PackItems): Record<string, string[]> {
    const named: Record<string, string[]> = {};
    for (const [kind, records] of Object.entries(items)) {
        const names = [...rowsByKey(kind, records).keys()].map((key) =>
            key === ROOT_KEY ? (rootName(records) ?? key) : key,
        );
        if (names.length > 0) named[kind] = names;
    }
    return named;
}
