/**
 * Which of the chosen websites' products a wipe deletes, takes off, or leaves (owner, 2026-10-30).
 * Products are website-scoped in Commerce, so a product is tied to the chosen STORES through its
 * websites and, on a website only partly chosen, its categories:
 *
 * | The product's websites | Done |
 * |---|---|
 * | every one wholly chosen, or partly chosen with every category link inside a cleared root | deleted (and a configurable's children with it) |
 * | some of those, the rest not chosen | taken off the ones it is tied to |
 * | a partly chosen one where it has no category, or only categories other stores share | left: "can't tell which demo it belongs to" |
 * | a partly chosen one where it sits in a store not chosen's own categories | left: it belongs to that store |
 *
 * A configurable's child usually has no categories of its own: it is judged by its parent's. A
 * product not shown on its own (a variant) that is no child of a product being deleted is left, as
 * before, since it may belong to a product another website sells. A product whose websites or
 * visibility Commerce did not answer is left.
 *
 * @module features/data-installer/services/demoDataWipe/wipeProducts
 */

import type { WipeCategory } from './wipeReads';
import type { WipeScope } from './wipeScope';
import type { CommerceProduct } from '@/types/commerceWire';

/** Commerce's "Not Visible Individually": a product shown only as part of another. */
const NOT_VISIBLE = 1;

/** The decision for each product, by what is done to it. */
export interface ProductDecision {
    remove: CommerceProduct[];
    /** Taken off these websites only. */
    takeOff: Array<{ product: CommerceProduct; websiteIds: number[] }>;
    variants: CommerceProduct[];
    unknown: CommerceProduct[];
    /** On a partly chosen website with nothing tying it to the chosen stores. */
    cannotTell: CommerceProduct[];
    /** On a partly chosen website, in a store not chosen's own categories. */
    elsewhere: CommerceProduct[];
}

type Tie = 'tied' | 'cannot-tell' | 'elsewhere';

const websitesOf = (p: CommerceProduct): number[] | undefined => p.extension_attributes?.website_ids?.map(Number);
const ownLinks = (p: CommerceProduct): string[] => (p.extension_attributes?.category_links ?? []).map((l) => String(l.category_id));
const shown = (p: CommerceProduct): boolean => p.visibility !== undefined && Number(p.visibility) !== NOT_VISIBLE;

/** Which root each category sits under, from its path ("1/150/151" is under 150). */
function rootsByCategory(tree: readonly WipeCategory[]): Map<string, string> {
    return new Map(tree.map((c) => [String(c.id), (c.path ?? '').split('/').filter(Boolean)[1] ?? '']));
}

/** How the product's categories tie it to the chosen stores on a partly chosen website. */
function tieOf(links: readonly string[], scope: WipeScope, rootOf: Map<string, string>): Tie {
    const roots = links.map((id) => rootOf.get(id) ?? '');
    if (roots.length === 0) return 'cannot-tell';
    if (roots.every((r) => scope.clearedRoots.has(r))) return 'tied';
    return roots.some((r) => scope.otherRoots.has(r)) ? 'elsewhere' : 'cannot-tell';
}

/** Each product's category links, a child taking its parent's when it has none. */
function linksResolver(products: readonly CommerceProduct[]): (p: CommerceProduct) => string[] {
    const parentOf = new Map<string, CommerceProduct>();
    for (const parent of products) for (const child of parent.extension_attributes?.configurable_product_links ?? []) parentOf.set(String(child), parent);
    return (p) => {
        const own = ownLinks(p);
        const parent = parentOf.get(String(p.id));
        return own.length > 0 || !parent ? own : ownLinks(parent);
    };
}

interface Ties {
    tied: number[];
    worst: Tie | undefined;
}

/** Of the product's websites, the ones it is tied to, and the worst reason a partly chosen one is not. */
function tiesOf(websites: readonly number[], links: readonly string[], scope: WipeScope, rootOf: Map<string, string>): Ties {
    const ties: Ties = { tied: [], worst: undefined };
    for (const id of websites) {
        if (scope.websites.whole.includes(id)) ties.tied.push(id);
        else if (scope.websites.part.includes(id)) {
            const tie = tieOf(links, scope, rootOf);
            if (tie === 'tied') ties.tied.push(id);
            else if (ties.worst !== 'elsewhere') ties.worst = tie;
        }
    }
    return ties;
}

function place(decided: ProductDecision, product: CommerceProduct, websites: number[], ties: Ties): 'remove' | undefined {
    if (ties.tied.length === websites.length) return 'remove';
    if (ties.tied.length > 0) decided.takeOff.push({ product, websiteIds: ties.tied });
    if (ties.worst === 'elsewhere') decided.elsewhere.push(product);
    else if (ties.worst === 'cannot-tell') decided.cannotTell.push(product);
    return undefined;
}

/**
 * What happens to each of the chosen websites' products.
 *
 * @param recorded - SKUs an install record lists, lower-cased: never touched
 */
export function decideProducts(products: readonly CommerceProduct[], scope: WipeScope, tree: readonly WipeCategory[], recorded: Set<string>): ProductDecision {
    const decided: ProductDecision = { remove: [], takeOff: [], variants: [], unknown: [], cannotTell: [], elsewhere: [] };
    const rootOf = rootsByCategory(tree);
    const linksOf = linksResolver(products);
    const deletable: CommerceProduct[] = [];
    for (const product of products.filter((p) => !recorded.has(p.sku.toLowerCase()))) {
        const websites = websitesOf(product);
        if (websites === undefined || websites.length === 0 || product.visibility === undefined) decided.unknown.push(product);
        else if (place(decided, product, websites, tiesOf(websites, linksOf(product), scope, rootOf)) === 'remove') deletable.push(product);
    }
    const children = new Set(deletable.filter(shown).flatMap((p) => (p.extension_attributes?.configurable_product_links ?? []).map(String)));
    for (const product of deletable) (shown(product) || children.has(String(product.id)) ? decided.remove : decided.variants).push(product);
    return decided;
}
