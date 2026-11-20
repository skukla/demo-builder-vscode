/**
 * Which of the chosen websites' products a wipe deletes, takes off, or keeps (owner, 2026-10-30;
 * whole websites only since datapack-simplification step 06). Products are website-scoped in
 * Commerce:
 *
 * | The product's websites | Done |
 * |---|---|
 * | every one chosen | deleted (and a configurable's children with it) |
 * | some chosen, the rest not | taken off the chosen ones |
 *
 * Kept, and listed: what an install record lists; a product not shown on its own (a variant) that is
 * no child of a product being deleted, since it may belong to a product another website sells; and a
 * product whose websites or visibility Commerce did not answer.
 *
 * @module features/data-installer/services/demoDataWipe/wipeProducts
 */

import type { WipeScope } from './wipeScope';
import type { CommerceProduct } from '@/types/commerceWire';

/** Commerce's "Not Visible Individually": a product shown only as part of another. */
const NOT_VISIBLE = 1;

/** The decision for each product, by what is done to it. */
export interface ProductDecision {
    remove: CommerceProduct[];
    /** Taken off these websites only. */
    takeOff: Array<{ product: CommerceProduct; websiteIds: number[] }>;
    kept: CommerceProduct[];
}

const websitesOf = (p: CommerceProduct): number[] | undefined => p.extension_attributes?.website_ids?.map(Number);
const shown = (p: CommerceProduct): boolean => p.visibility !== undefined && Number(p.visibility) !== NOT_VISIBLE;

/**
 * What happens to each of the chosen websites' products.
 *
 * @param recorded - SKUs an install record lists, lower-cased: never touched
 */
export function decideProducts(products: readonly CommerceProduct[], scope: WipeScope, recorded: ReadonlySet<string>): ProductDecision {
    const decided: ProductDecision = { remove: [], takeOff: [], kept: [] };
    const deletable: CommerceProduct[] = [];
    for (const product of products) {
        const websites = websitesOf(product);
        if (recorded.has(product.sku.toLowerCase()) || websites === undefined || websites.length === 0 || product.visibility === undefined) decided.kept.push(product);
        else if (websites.every((id) => scope.websiteIds.includes(id))) deletable.push(product);
        else decided.takeOff.push({ product, websiteIds: websites.filter((id) => scope.websiteIds.includes(id)) });
    }
    const children = new Set(deletable.filter(shown).flatMap((p) => (p.extension_attributes?.configurable_product_links ?? []).map(String)));
    for (const product of deletable) (shown(product) || children.has(String(product.id)) ? decided.remove : decided.kept).push(product);
    // In the store's own order, as the other lists are.
    decided.kept = products.filter((p) => decided.kept.includes(p));
    return decided;
}
