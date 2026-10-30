/**
 * What clearing a demo's part of the store would remove (datapack-engine step 10, owner
 * 2026-10-27): everything on one website that Demo Builder did NOT install, decided from reads
 * alone. Writes nothing; `wipeRun.ts` carries the plan out.
 *
 * The sandbox holds several demos (JustRite's live demo, Bodea, BJU, CitiSignal), so the plan
 * only ever takes what is this website's alone:
 *
 * | Kind | Removed | Left, and said why |
 * |---|---|---|
 * | products | on this website only: deleted | also on another website: only taken off this one. Not shown on its own (a variant) and not a variant of a product being deleted: left, it may belong to a product another website sells. Websites or visibility not answered: left |
 * | categories | under a root only this website's store groups show, deepest first | under a root another website shows too (`justrite_test_website` and JustRite share root 119): all left. One holding a category Demo Builder installed: left |
 * | customers | accounts of this website | in a B2B company (an admin cannot be deleted while its company stands): left |
 *
 * Never touched, whatever is there: anything an install record lists, this project's or another local
 * project's on the same website (`readWipeClaims`; the pack's removal takes those, by its own rules); product attributes and attribute sets; customer groups,
 * companies and shared catalogs (a catalog and its group are one unit, and deleting either moves
 * customers to General); stocks and sources (the Default Stock and Source included); websites,
 * stores and root categories; orders and invoices; store settings; admin users; the integration's
 * credential.
 *
 * @module features/data-installer/services/demoDataWipe/wipePlan
 */

import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { type Named, named } from '../demoBuilderEngine/storeChanges';
import { type WipeCategory, type WipeWebsite, readCategoryTree, readWebsiteCustomers, readWebsiteProducts, readWipeWebsite } from './wipeReads';
import { sha256 } from '@/core/utils/sha256';
import type { CommerceCustomer, CommerceGet, CommerceProduct } from '@/types/commerceWire';

export type WipeKind = 'products' | 'categories' | 'customers';

/** Things of one kind the wipe leaves, and the one reason. */
export interface WipeLeft extends Named {
    kind: WipeKind;
    why: string;
}

/** What the SC and the agent see before anything is written. Counts and a few names, never rows. */
export interface WipePreview {
    website: { code: string; name: string };
    /** What would be deleted, by kind. */
    remove: Record<WipeKind, Named>;
    /** Products another website also sells: taken off this website only. */
    takenOff: Named;
    left: WipeLeft[];
    /** What the install records list (this project's, and other local projects' on this website), by kind: their packs' removal takes those. */
    installed: Record<string, number>;
    /** How many things the wipe would change. */
    total: number;
    /** Names this exact plan; the clearing must be handed it back. */
    token: string;
    /** What is never touched, in one sentence. */
    never: string;
}

/** The plan in full: the preview, and every id it would write to. */
export interface WipePlan {
    websiteId: number;
    preview: WipePreview;
    deleteSkus: string[];
    takeOffSkus: string[];
    /** Deepest first, so no delete takes a category another delete still names. */
    categoryIds: string[];
    customerIds: string[];
}

export const NEVER_TOUCHED =
    'Never touched: what Demo Builder installed (its removal takes that), product attributes and sets, customer groups, ' +
    'companies and shared catalogs, stocks and sources, websites, stores and root categories, orders and invoices, ' +
    "store settings, admin users and the integration's credential.";

/** Commerce's "Not Visible Individually": a product shown only as part of another. */
const NOT_VISIBLE = 1;

type Recorded = Record<'products' | 'categories' | 'customers', Set<string>>;

function recordedIds(records: readonly InstallRecord[]): Recorded {
    const of = (kind: string, lower = false) =>
        new Set(records.flatMap((r) => r.created.filter((o) => o.kind === kind).map((o) => (lower ? o.id.toLowerCase() : o.id))));
    return { products: of('products', true), categories: of('categories'), customers: of('customers') };
}

function installedCounts(records: readonly InstallRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const object of records.flatMap((r) => r.created)) counts[object.kind] = (counts[object.kind] ?? 0) + 1;
    return counts;
}

interface ProductDecision {
    remove: CommerceProduct[];
    takeOff: CommerceProduct[];
    variants: CommerceProduct[];
    unknown: CommerceProduct[];
}

const websitesOf = (p: CommerceProduct): number[] | undefined => p.extension_attributes?.website_ids?.map(Number);
const isOnlyHere = (p: CommerceProduct, websiteId: number): boolean => websitesOf(p)?.length === 1 && websitesOf(p)?.[0] === websiteId;

/** Which of the website's products go, which are only taken off it, and which stay. */
function decideProducts(products: readonly CommerceProduct[], websiteId: number, recorded: Set<string>): ProductDecision {
    const mine = products.filter((p) => !recorded.has(p.sku.toLowerCase()) && websitesOf(p)?.includes(websiteId) !== false);
    const decided: ProductDecision = { remove: [], takeOff: [], variants: [], unknown: [] };
    const shown = (p: CommerceProduct) => p.visibility !== undefined && Number(p.visibility) !== NOT_VISIBLE;
    const parents = mine.filter((p) => isOnlyHere(p, websiteId) && shown(p));
    const children = new Set(parents.flatMap((p) => (p.extension_attributes?.configurable_product_links ?? []).map(String)));
    for (const product of mine) {
        if (websitesOf(product) === undefined || product.visibility === undefined) decided.unknown.push(product);
        else if (!isOnlyHere(product, websiteId)) decided.takeOff.push(product);
        else if (shown(product) || children.has(String(product.id))) decided.remove.push(product);
        else decided.variants.push(product);
    }
    return decided;
}

interface CategoryDecision {
    remove: WipeCategory[];
    shared: Array<{ root: string; under: WipeCategory[]; with: string[] }>;
    holding: WipeCategory[];
}

const segmentsOf = (c: WipeCategory): string[] => (c.path ?? '').split('/').filter(Boolean);

/** The categories under each of the website's roots: deleted, or left with the reason. */
function decideCategories(tree: readonly WipeCategory[], website: WipeWebsite, recorded: Set<string>): CategoryDecision {
    const decided: CategoryDecision = { remove: [], shared: [], holding: [] };
    const holdsRecorded = new Set(tree.filter((c) => recorded.has(String(c.id))).flatMap((c) => segmentsOf(c).slice(0, -1)));
    for (const root of website.roots) {
        const under = tree.filter((c) => segmentsOf(c)[1] === root && segmentsOf(c).length > 2);
        const others = website.sharedRoots.get(root);
        if (others) {
            decided.shared.push({ root, under, with: others });
            continue;
        }
        for (const category of under) {
            if (recorded.has(String(category.id))) continue;
            if (holdsRecorded.has(String(category.id))) decided.holding.push(category);
            else decided.remove.push(category);
        }
    }
    decided.remove.sort((a, b) => segmentsOf(b).length - segmentsOf(a).length);
    return decided;
}

function decideCustomers(customers: readonly CommerceCustomer[], recorded: Set<string>): { remove: CommerceCustomer[]; inCompany: CommerceCustomer[] } {
    const mine = customers.filter((c) => c.id !== undefined && !recorded.has(String(c.id)));
    const inCompany = mine.filter((c) => Number(c.extension_attributes?.company_attributes?.company_id ?? 0) > 0);
    return { remove: mine.filter((c) => !inCompany.includes(c)), inCompany };
}

const skus = (products: readonly CommerceProduct[]) => products.map((p) => p.sku);
const categoryNames = (categories: readonly WipeCategory[]) => categories.map((c) => c.name ?? String(c.id));

function leftOf(products: ProductDecision, categories: CategoryDecision, inCompany: readonly CommerceCustomer[]): WipeLeft[] {
    const left: WipeLeft[] = [
        { kind: 'products', ...named(skus(products.variants)), why: 'shown only as part of another product, which may be one another website sells' },
        { kind: 'products', ...named(skus(products.unknown)), why: 'Commerce did not say which websites they are on or whether they are shown on their own' },
        ...categories.shared.map((s): WipeLeft => ({ kind: 'categories', ...named(categoryNames(s.under)), why: `under root category ${s.root}, which ${s.with.join(', ')} also shows` })),
        { kind: 'categories', ...named(categoryNames(categories.holding)), why: 'they hold a category Demo Builder installed' },
        { kind: 'customers', ...named(inCompany.map((c) => c.email)), why: 'they are in a B2B company, which a wipe does not clear' },
    ];
    return left.filter((l) => l.count > 0);
}

/**
 * What clearing the website would do, read-only.
 *
 * @param records - every install record the wipe must respect (`readWipeClaims`); what they list is left
 * @throws WipeScopeError when the store has no such website; any read Commerce refuses
 */
export async function planWipe(get: CommerceGet, websiteCode: string, records: readonly InstallRecord[]): Promise<WipePlan> {
    const website = await readWipeWebsite(get, websiteCode);
    const recorded = recordedIds(records);
    const products = decideProducts(await readWebsiteProducts(get, website.id), website.id, recorded.products);
    const categories = decideCategories(await readCategoryTree(get), website, recorded.categories);
    const customers = decideCustomers(await readWebsiteCustomers(get, website.id), recorded.customers);
    const ids = {
        deleteSkus: skus(products.remove),
        takeOffSkus: skus(products.takeOff),
        categoryIds: categories.remove.map((c) => String(c.id)),
        customerIds: customers.remove.map((c) => String(c.id)),
    };
    const total = ids.deleteSkus.length + ids.takeOffSkus.length + ids.categoryIds.length + ids.customerIds.length;
    const preview: WipePreview = {
        website: { code: website.code, name: website.name },
        remove: { products: named(ids.deleteSkus), categories: named(categoryNames(categories.remove)), customers: named(customers.remove.map((c) => c.email)) },
        takenOff: named(ids.takeOffSkus),
        left: leftOf(products, categories, customers.inCompany),
        installed: installedCounts(records),
        total,
        token: sha256(JSON.stringify({ website: website.code, ...ids })),
        never: NEVER_TOUCHED,
    };
    return { websiteId: website.id, preview, ...ids };
}

/**
 * Whether a plan made now takes nothing the plan the SC saw did not: same website, and every id
 * it would delete, take off or clear was in the one shown. Things gone since are fine.
 */
export function withinPlan(shown: WipePlan, now: WipePlan): boolean {
    const inside = (a: readonly string[], b: readonly string[]) => a.every((id) => b.includes(id));
    return (
        now.preview.website.code === shown.preview.website.code &&
        inside(now.deleteSkus, shown.deleteSkus) &&
        inside(now.takeOffSkus, shown.takeOffSkus) &&
        inside(now.categoryIds, shown.categoryIds) &&
        inside(now.customerIds, shown.customerIds)
    );
}
