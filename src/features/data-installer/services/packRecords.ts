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
