/**
 * What clearing a demo's part of the store would do (datapack-engine step 10, owner 2026-10-27,
 * widened from one website to a set of STORES 2026-10-30): everything the chosen stores own that
 * Demo Builder did NOT install, decided from reads alone. Writes nothing; `wipeRun.ts` carries the
 * plan out.
 *
 * The sandbox holds several demos at once (JustRite's live demo, Bodea, BJU, CitiSignal), so what a
 * store owns is judged against the whole chosen set (`wipeScope.ts`):
 *
 * | Kind | Done | Left, and said why |
 * |---|---|---|
 * | products | `wipeProducts.ts`: deleted when tied to the chosen stores on every website they are on; taken off the chosen websites when also sold elsewhere | can't tell which demo they belong to; in a store not chosen; variants; fields not answered |
 * | categories | under a root every store using it is chosen, deepest first | under a root a store not chosen also shows (`justrite_test_store` and JustRite's share 119): all left. One holding a category Demo Builder installed: left |
 * | customers | `wipeCustomers.ts`: of a wholly chosen website, or made in a chosen store with no order elsewhere | made in or ordering from a store not chosen; store not said; in a B2B company |
 * | orders | `wipeOrders.ts`, the one reset rule shared with the ERP reset: placed in a chosen store's views and not invoiced or shipped, cancelled; any other, refunded with an offline credit memo; noted; open returns closed. Never deleted | already Canceled or Closed, or noted by a reset before; neither cancellable nor refundable |
 * | orders an ERP integration handles | `wipeErp.ts`: on a website whose orders an ERP integration sends to an ERP, closed by that integration, not here; its ERP refreshed after | the integration must be updated first, or could not be asked: left open, the line says why |
 * | cart rules (step 11) | `wipeCartRules.ts`: on wholly chosen websites only, deleted with their coupons; also on a website not chosen, taken off the chosen ones | on a website only partly chosen; holding a coupon Demo Builder installed |
 *
 * Never touched, whatever is there: anything an install record lists (every local project's on the
 * chosen websites, `readWipeClaims`; the pack's removal takes those, by its own rules); product
 * attributes and attribute sets; customer groups, companies and shared catalogs (a catalog and its
 * group are one unit, and deleting either moves customers to General); stocks and sources (the
 * Default Stock and Source included); websites, stores, store views and root categories; store
 * settings; admin users; the integration's credential.
 *
 * @module features/data-installer/services/demoDataWipe/wipePlan
 */

import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { named } from '../demoBuilderEngine/saveOutcome';
import { type CartRuleDecision, decideCartRules } from './wipeCartRules';
import { type CustomerDecision, decideCustomers } from './wipeCustomers';
import { type WipeErp, type WipeErpPlan, type WipeErpRoute, erpCloseIds, erpPartOf, erpPlanOf, splitByErp, websiteCodesOf } from './wipeErp';
import { type OrderStep, openReturns, orderStepOf } from './wipeOrders';
import { type ProductDecision, decideProducts } from './wipeProducts';
import { type WipeCategory, readCategoryTree, readOrderReturns, readViewOrders, readWebsiteProducts, readWipeStructure } from './wipeReads';
import { type WipeScope, choicesOfScope, resolveWipeScope } from './wipeScope';
import { sha256 } from '@/core/utils/sha256';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { CommerceGet, CommerceOrder, CommerceProduct } from '@/types/commerceWire';
import type { WipeLeft, WipePreview, WipeStoreChoice } from '@/types/demoDataWipe';

/** The plan in full: the preview, and every id it would write to. */
export interface WipePlan {
    /** The chosen stores, by code: what the clearing re-plans against. */
    choices: WipeStoreChoice[];
    /** The chosen stores as one key, the same however they were named. */
    scopeKey: string;
    preview: WipePreview;
    deleteSkus: string[];
    takeOff: Array<{ sku: string; websiteId: number }>;
    /** Deepest first, so no delete takes a category another delete still names. */
    categoryIds: string[];
    customerIds: string[];
    /** Cart rules on only the chosen websites (step 11): deleted, their coupons with them. */
    ruleIds: string[];
    /** Cart rules also on websites not chosen: each kept on these websites only. */
    ruleTakeOff: Array<{ id: string; websiteIds: number[] }>;
    orders: OrderStep[];
    /** Orders in the chosen stores already Canceled or Closed, or handled by a reset before. */
    alreadyClosed: number;
    returnIds: string[];
    /** Orders an ERP integration handles, when one routes some chosen stores' websites: not in `orders`. */
    erp?: WipeErpPlan;
}

/** What a plan must respect beyond the store: every install record, and the ERP integration serving the instance. */
export interface WipeInputs {
    records: readonly InstallRecord[];
    erp?: WipeErp;
}

export const NEVER_TOUCHED =
    'Never touched: what Demo Builder installed (its removal takes that), product attributes and sets, customer groups, ' +
    'companies and shared catalogs, stocks and sources, websites, stores, store views and root categories, ' +
    "store settings, admin users and the integration's credential. Orders are closed, never deleted.";

type Recorded = Record<'products' | 'categories' | 'customers' | 'rules' | 'coupons', Set<string>>;

function recordedIds(records: readonly InstallRecord[]): Recorded {
    const of = (kinds: string[], lower = false) =>
        new Set(records.flatMap((r) => r.created.filter((o) => kinds.includes(o.kind)).map((o) => (lower ? o.id.toLowerCase() : o.id))));
    return {
        // A gift card is a product (step 11).
        products: of(['products', 'giftcards'], true),
        categories: of(['categories']),
        customers: of(['customers']),
        rules: of(['cart_rules']),
        coupons: of(['coupons']),
    };
}

function installedCounts(records: readonly InstallRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const object of records.flatMap((r) => r.created)) counts[object.kind] = (counts[object.kind] ?? 0) + 1;
    return counts;
}

interface CategoryDecision {
    remove: WipeCategory[];
    shared: Array<{ root: string; under: WipeCategory[]; with: string[] }>;
    holding: WipeCategory[];
}

const segmentsOf = (c: WipeCategory): string[] => (c.path ?? '').split('/').filter(Boolean);

/** The categories under each chosen store's root: deleted, or left with the reason. */
function decideCategories(tree: readonly WipeCategory[], scope: WipeScope, recorded: Set<string>): CategoryDecision {
    const decided: CategoryDecision = { remove: [], shared: [], holding: [] };
    const holdsRecorded = new Set(tree.filter((c) => recorded.has(String(c.id))).flatMap((c) => segmentsOf(c).slice(0, -1)));
    const under = (root: string) => tree.filter((c) => segmentsOf(c)[1] === root && segmentsOf(c).length > 2);
    for (const [root, others] of scope.sharedRoots) decided.shared.push({ root, under: under(root), with: others });
    for (const root of scope.clearedRoots) {
        for (const category of under(root)) {
            if (recorded.has(String(category.id))) continue;
            (holdsRecorded.has(String(category.id)) ? decided.holding : decided.remove).push(category);
        }
    }
    decided.remove.sort((a, b) => segmentsOf(b).length - segmentsOf(a).length);
    return decided;
}

const skus = (products: readonly CommerceProduct[]) => products.map((p) => p.sku);
const categoryNames = (categories: readonly WipeCategory[]) => categories.map((c) => c.name ?? String(c.id));
const emails = (customers: CustomerDecision['remove']) => customers.map((c) => c.email);
const ruleNames = (rules: CartRuleDecision['remove']) => rules.map((r) => r.name);
const leftRow = (kind: WipeLeft['kind'], names: string[], why: string): WipeLeft => ({ kind, ...named(names), why });

function leftOf({ products, categories, customers, cartRules }: Decided): WipeLeft[] {
    const left: WipeLeft[] = [
        leftRow('products', skus(products.cannotTell), "nothing ties them to the chosen stores (no category, or only categories other stores share), so which demo they belong to can't be told"),
        leftRow('products', skus(products.elsewhere), 'they are in the categories of a store not chosen'),
        leftRow('products', skus(products.variants), 'shown only as part of another product, which may be one another website sells'),
        leftRow('products', skus(products.unknown), 'Commerce did not say which websites they are on or whether they are shown on their own'),
        ...categories.shared.map((s) => leftRow('categories', categoryNames(s.under), `under root category ${s.root}, which ${s.with.join(' and ')} also shows`)),
        leftRow('categories', categoryNames(categories.holding), 'they hold a category Demo Builder installed'),
        leftRow('customers', emails(customers.inCompany), 'they are in a B2B company, which a wipe does not clear'),
        leftRow('customers', emails(customers.elsewhere), 'they were made in, or have orders in, a store not chosen'),
        leftRow('customers', emails(customers.unknownStore), 'Commerce did not say which store they were made in'),
        leftRow('cart rules', ruleNames(cartRules.partWebsite), 'they apply on a website a store not chosen also sells on'),
        leftRow('cart rules', ruleNames(cartRules.holding), 'they hold a coupon Demo Builder installed'),
    ];
    return left.filter((l) => l.count > 0);
}

/** Every product on the chosen websites, each once. */
async function readScopeProducts(get: CommerceGet, scope: WipeScope): Promise<CommerceProduct[]> {
    const bySku = new Map<string, CommerceProduct>();
    for (const websiteId of [...scope.websites.whole, ...scope.websites.part]) {
        for (const product of await readWebsiteProducts(get, websiteId)) bySku.set(product.sku, product);
    }
    return [...bySku.values()];
}

interface Decided {
    products: ProductDecision;
    categories: CategoryDecision;
    customers: CustomerDecision;
    cartRules: CartRuleDecision;
    orders: OrderStep[];
    alreadyClosed: number;
    returns: Array<{ id: string; number: string }>;
    erp?: WipeErpPlan;
}

/** Each order's step; one closed or handled before is only counted. */
function decideOrders(orders: readonly CommerceOrder[]): Pick<Decided, 'orders' | 'alreadyClosed'> {
    const steps = orders.map(orderStepOf);
    return { orders: steps.filter((s): s is OrderStep => s !== 'done'), alreadyClosed: steps.filter((s) => s === 'done').length };
}

/** The orders the wipe closes itself, and the ERP part: what an ERP integration's websites hold. */
async function decideAllOrders(get: CommerceGet, scope: WipeScope, route: WipeErpRoute | undefined): Promise<Pick<Decided, 'orders' | 'alreadyClosed' | 'returns' | 'erp'>> {
    const split = splitByErp(scope, route, await readViewOrders(get, [...scope.viewIds]));
    // Returns of the ERP's orders are the integration's to close, with their orders.
    const returns = openReturns(await readOrderReturns(get, split.own.map((o) => Number(o.entity_id))));
    const own = decideOrders(split.own);
    const erp = route ? erpPlanOf(scope, route, split.erp) : undefined;
    return {
        orders: own.orders,
        alreadyClosed: own.alreadyClosed + (erp?.alreadyClosed ?? 0),
        returns: returns.map((r) => ({ id: String(r.entity_id), number: r.increment_id ?? String(r.entity_id) })),
        ...(erp ? { erp: erp.plan } : {}),
    };
}

async function decideAll(get: CommerceGet, scope: WipeScope, structure: CommerceStoreStructure, inputs: { recorded: Recorded; route?: WipeErpRoute }): Promise<Decided> {
    const { recorded } = inputs;
    const tree = await readCategoryTree(get);
    return {
        products: decideProducts(await readScopeProducts(get, scope), scope, tree, recorded.products),
        categories: decideCategories(tree, scope, recorded.categories),
        customers: await decideCustomers(get, scope, structure, recorded.customers),
        cartRules: await decideCartRules(get, scope, { rules: recorded.rules, coupons: recorded.coupons }),
        ...(await decideAllOrders(get, scope, inputs.route)),
    };
}

function previewOf(scope: WipeScope, decided: Decided, plan: Omit<WipePlan, 'preview' | 'choices' | 'scopeKey'>, records: readonly InstallRecord[]): WipePreview {
    const { orders } = plan;
    const total =
        plan.deleteSkus.length +
        plan.takeOff.length +
        plan.categoryIds.length +
        plan.customerIds.length +
        plan.ruleIds.length +
        plan.ruleTakeOff.length +
        orders.length +
        plan.returnIds.length +
        erpCloseIds(plan.erp).length;
    return {
        stores: scope.stores.map((s) => ({ websiteCode: s.website.code, websiteName: s.website.name, storeCode: s.code, storeName: s.name })),
        remove: {
            products: named(plan.deleteSkus),
            categories: named(categoryNames(decided.categories.remove)),
            customers: named(emails(decided.customers.remove)),
            cartRules: named(ruleNames(decided.cartRules.remove)),
        },
        takenOff: named([...new Set(plan.takeOff.map((t) => t.sku))]),
        rulesTakenOff: named(decided.cartRules.takeOff.map((t) => t.rule.name)),
        orders: {
            cancel: named(orders.filter((o) => o.action === 'cancel').map((o) => o.number)),
            refund: named(orders.filter((o) => o.action === 'refund').map((o) => o.number)),
            leftOpen: named(orders.filter((o) => o.action === 'note').map((o) => o.number)),
            returns: named(decided.returns.map((r) => r.number)),
        },
        ...(plan.erp ? { erp: erpPartOf(plan.erp, named) } : {}),
        left: leftOf(decided),
        installed: installedCounts(records),
        total,
        token: sha256(JSON.stringify({ stores: scope.key, ...plan })),
        never: NEVER_TOUCHED,
    };
}

/**
 * What clearing the chosen stores would do, read-only.
 *
 * @param inputs - every install record the wipe must respect (`readWipeClaims`), whose lists are
 *   left; and the ERP integration serving the instance, asked which chosen websites it routes
 */
export async function planWipe(get: CommerceGet, structure: CommerceStoreStructure, scope: WipeScope, inputs: WipeInputs): Promise<WipePlan> {
    const { records } = inputs;
    const route = inputs.erp ? await inputs.erp.route(websiteCodesOf(scope)) : undefined;
    const decided = await decideAll(get, scope, structure, { recorded: recordedIds(records), route });
    const ids = {
        deleteSkus: skus(decided.products.remove),
        takeOff: decided.products.takeOff.flatMap((t) => t.websiteIds.map((websiteId) => ({ sku: t.product.sku, websiteId }))),
        categoryIds: decided.categories.remove.map((c) => String(c.id)),
        customerIds: decided.customers.remove.map((c) => String(c.id)),
        ruleIds: decided.cartRules.remove.map((r) => String(r.rule_id)),
        ruleTakeOff: decided.cartRules.takeOff.map((t) => ({ id: String(t.rule.rule_id), websiteIds: t.websiteIds })),
        orders: decided.orders,
        alreadyClosed: decided.alreadyClosed,
        returnIds: decided.returns.map((r) => r.id),
        ...(decided.erp ? { erp: decided.erp } : {}),
    };
    return { choices: choicesOfScope(scope), scopeKey: scope.key, preview: previewOf(scope, decided, ids, records), ...ids };
}

/**
 * The same, reading the store structure first (and asking the ERP integration, when one serves the
 * instance, which chosen websites it routes): what the clearing re-plans with.
 *
 * @throws WipeScopeError when a chosen website or store is no longer in the store
 */
export async function planWipeFor(get: CommerceGet, choices: readonly WipeStoreChoice[], records: readonly InstallRecord[], erp?: WipeErp): Promise<WipePlan> {
    const structure = await readWipeStructure(get);
    return planWipe(get, structure, resolveWipeScope(structure, choices), { records, erp });
}

const orderIds = (plan: WipePlan, step: (o: OrderStep) => boolean) => plan.orders.filter(step).map((o) => o.id);

/**
 * Whether a plan made now takes nothing the plan the SC saw did not: the same stores, and every id
 * it would delete, take off, clear, cancel, refund, release or close (itself, or through the ERP
 * integration) was in the one shown. Things
 * gone or closed since are fine.
 */
export function withinPlan(shown: WipePlan, now: WipePlan): boolean {
    const inside = (a: readonly string[], b: readonly string[]) => a.every((id) => b.includes(id));
    const offKeys = (plan: WipePlan) => plan.takeOff.map((t) => `${t.sku}@${t.websiteId}`);
    const ruleOffKeys = (plan: WipePlan) => plan.ruleTakeOff.map((t) => `${t.id}@${t.websiteIds.join(',')}`);
    const steps: Array<(o: OrderStep) => boolean> = [(o) => o.action === 'cancel', (o) => o.action === 'refund', (o) => o.unhold];
    return (
        now.scopeKey === shown.scopeKey &&
        inside(now.deleteSkus, shown.deleteSkus) &&
        inside(offKeys(now), offKeys(shown)) &&
        inside(now.categoryIds, shown.categoryIds) &&
        inside(now.customerIds, shown.customerIds) &&
        inside(now.ruleIds, shown.ruleIds) &&
        inside(ruleOffKeys(now), ruleOffKeys(shown)) &&
        steps.every((step) => inside(orderIds(now, step), orderIds(shown, step))) &&
        inside(now.returnIds, shown.returnIds) &&
        inside(erpCloseIds(now.erp), erpCloseIds(shown.erp))
    );
}
