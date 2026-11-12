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
 * | orders | `wipeOrders.ts`, the one reset rule shared with the ERP reset: placed in a chosen store's views, those on a website an ERP integration sends to an ERP included (Commerce is the source system, erp-order-close step 5); noted first; each one's open returns closed; not invoiced or shipped, cancelled; any other, invoiced in full and refunded with an offline credit memo, so Commerce closes it. Never deleted | already Canceled or Closed, or left open by a reset before; in payment review (left open, noted) |
 * | the ERP, when an ERP integration routes some chosen websites | `wipeErp.ts`: brought in line after the clearing (the integration forgets the stores' orders and its ERPs remove them), then filled again from Commerce. Nothing here is counted in `total` | the integration must be updated first, or could not be asked: the ERP is not brought in line, the line says why; the orders are closed all the same |
 * | cart rules (step 11) | `wipeCartRules.ts`: on wholly chosen websites only, deleted with their coupons; also on a website not chosen, taken off the chosen ones | on a website only partly chosen; holding a coupon Demo Builder installed |
 * | companies, and the customers in them | `wipeCompanies.ts`: every customer in the company, its admin included, on a wholly chosen website, with no order in a store not chosen | a customer elsewhere, or with an order elsewhere; an install record lists it or a customer in it; who is in it not read |
 * | shared catalogs and customer groups, one unit | `wipeCatalogs.ts`: everyone in the group going, no cart rule that stays naming it | a customer, company or rule that stays uses it (it would move those customers to General); an install record lists it. Commerce's own groups and the public catalog: never |
 * | attribute sets and attributes | `wipeAttributes.ts`: used by the products going, and nothing else on the instance uses them | a product that stays; a set that stays holds it; a rule that stays tests it; an integration's; a read that fails. System attributes and the Default set: never |
 * | website settings | `wipeSettings.ts`: on wholly chosen websites, a value that differs from the Default scope's is set to it. Commerce cannot clear a website's own row, so it stays the website's own, with the same value | base URLs, cookies, the Admin's, credentials; written by a datapack or the setup guide; no default value; the website not read |
 *
 * "Only the chosen stores use it" is decided in that order, each kind reading the one before: who is
 * going decides which companies go, those two which groups, the products going which sets and
 * attributes. Everything is decided before anything is written.
 *
 * Never touched, whatever is there: anything an install record lists (every local project's,
 * `readWipeClaims`; the pack's removal takes those, by its own rules); Commerce's own customer groups
 * and attributes, the public catalog and the Default attribute set; stocks and sources (the Default
 * Stock and Source included); websites, stores, store views and root categories; the Default scope's
 * settings and another website's; admin users; the integration's credential.
 *
 * @module features/data-installer/services/demoDataWipe/wipePlan
 */

import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { named } from '../demoBuilderEngine/saveOutcome';
import { type AttributeDecision, attributesLeft, decideAttributes } from './wipeAttributes';
import { type CartRuleDecision, decideCartRules } from './wipeCartRules';
import { type CatalogDecision, catalogsLeft, decideCatalogs } from './wipeCatalogs';
import { type CategoryDecision, categoryOrder, decideCategories } from './wipeCategories';
import type { WipeRespects } from './wipeClaims';
import { type CompanyDecision, companiesLeft, decideCompanies } from './wipeCompanies';
import { type CustomerDecision, decideCustomers } from './wipeCustomers';
import { type WipeErp, type WipeErpPlan, type WipeErpRoute, erpPartOf, erpPlanOf, erpStoresAsked, websiteCodesOf } from './wipeErp';
import { leftRow, rowsWithAny } from './wipeLeft';
import { type OrderReturn, type OrderStep, openReturns, orderStepOf } from './wipeOrders';
import { type ProductDecision, decideProducts } from './wipeProducts';
import { type WipeCategory, readCategoryTree, readOrderReturns, readViewOrders, readWebsiteProducts, readWipeStructure } from './wipeReads';
import { type Recorded, type RecordedOnInstance, installedCounts, recordedIds, recordedOnInstance } from './wipeRecorded';
import { type WipeScope, choicesOfScope, resolveWipeScope } from './wipeScope';
import { type SettingsDecision, decideSettings, settingsLeft } from './wipeSettings';
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
    /** The top categories going first, then each one under them (`categoryUnder`). */
    categoryIds: string[];
    /**
     * Each category going with one above it, by id: Commerce deletes a category's children with it, so
     * no request is sent for these, and each is held back if the one above it could not be removed.
     */
    categoryUnder: Record<string, string>;
    /** Customers going, those in a company going after it. */
    customerIds: string[];
    /** Companies going, before their customers: Commerce refuses to delete an admin while the company stands. */
    companyIds: string[];
    /** Each customer in a company going, by id: written after that company, or held back. */
    memberOf: Record<string, string>;
    /** Customer groups going, each with its shared catalog when it has one: after everyone in them. */
    groups: CatalogDecision['remove'];
    attributeSets: AttributeDecision['sets'];
    attributes: AttributeDecision['attributes'];
    /** Website settings to set to the Default scope's value. */
    settings: SettingsDecision['reset'];
    /** Cart rules on only the chosen websites (step 11): deleted, their coupons with them. */
    ruleIds: string[];
    /** Cart rules also on websites not chosen: each kept on these websites only. */
    ruleTakeOff: Array<{ id: string; websiteIds: number[] }>;
    /** Each order the wipe closes itself, with its open returns. */
    orders: OrderStep[];
    /** Orders in the chosen stores already Canceled or Closed, or left open by a reset before. */
    alreadyClosed: number;
    /** The ERP step, when an ERP integration routes some chosen stores' websites: their orders are in `orders`. */
    erp?: WipeErpPlan;
}

/**
 * What a plan must respect beyond the store: every install record, and the ERP integration serving the
 * instance. Without `everyRecord` the records on the chosen websites stand in for it.
 */
export interface WipeInputs extends Pick<WipeRespects, 'records'>, Partial<Omit<WipeRespects, 'records'>> {
    erp?: WipeErp;
    /** Told as each of `WIPE_PHASES` starts, by its place in the list: the check's progress. */
    onPhase?: (at: number) => void;
}

export const NEVER_TOUCHED =
    "Never touched: what Demo Builder installed (its removal takes that), Commerce's own customer groups and attributes, " +
    'the public catalog and the Default attribute set, stocks and sources, websites, stores, store views and root categories, ' +
    "the default settings and other websites' settings, admin users and the integration's credential. Orders are closed, never deleted.";

const skus = (products: readonly CommerceProduct[]) => products.map((p) => p.sku);
const categoryNames = (categories: readonly WipeCategory[]) => categories.map((c) => c.name ?? String(c.id));
const emails = (customers: CustomerDecision['remove']) => customers.map((c) => c.email);
const ruleNames = (rules: CartRuleDecision['remove']) => rules.map((r) => r.name);

function leftOf({ products, categories, customers, cartRules, companies, catalogs, attributes, settings }: Decided): WipeLeft[] {
    return rowsWithAny([
        leftRow('products', skus(products.cannotTell), "nothing ties them to the chosen stores (no category, or only categories other stores share), so which demo they belong to can't be told"),
        leftRow('products', skus(products.elsewhere), 'they are in the categories of a store not chosen'),
        leftRow('products', skus(products.variants), 'shown only as part of another product, which may be one another website sells'),
        leftRow('products', skus(products.unknown), 'Commerce did not say which websites they are on or whether they are shown on their own'),
        ...categories.shared.map((s) => leftRow('categories', categoryNames(s.under), `under root category ${s.root}, which ${s.with.join(' and ')} also shows`)),
        leftRow('categories', categoryNames(categories.holding), 'they hold a category Demo Builder installed'),
        leftRow('customers', emails(customers.inCompany), 'they are in a company that stays'),
        leftRow('customers', emails(customers.elsewhere), 'they were made in, or have orders in, a store not chosen'),
        leftRow('customers', emails(customers.unknownStore), 'Commerce did not say which store they were made in'),
        leftRow('cart rules', ruleNames(cartRules.partWebsite), 'they apply on a website a store not chosen also sells on'),
        leftRow('cart rules', ruleNames(cartRules.holding), 'they hold a coupon Demo Builder installed'),
        ...companiesLeft(companies),
        ...catalogsLeft(catalogs),
        ...attributesLeft(attributes),
        ...settingsLeft(settings),
    ]);
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
    companies: CompanyDecision;
    catalogs: CatalogDecision;
    attributes: AttributeDecision;
    settings: SettingsDecision;
    orders: OrderStep[];
    alreadyClosed: number;
    erp?: WipeErpPlan;
}

/**
 * Each order's step, with its open returns: those are closed inside the order's work, after its note.
 * One finished before is only counted, and its returns are not read: a return is written to only
 * after its order's note.
 */
async function decideOrders(get: CommerceGet, orders: readonly CommerceOrder[]): Promise<Pick<Decided, 'orders' | 'alreadyClosed'>> {
    const steps = orders.map(orderStepOf).filter((s): s is OrderStep => s !== 'done');
    const returns = openReturns(await readOrderReturns(get, steps.map((s) => Number(s.id))));
    const returnsOf = (id: string): OrderReturn[] =>
        returns.filter((r) => String(r.order_id) === id).map((r) => ({ id: String(r.entity_id), number: r.increment_id ?? String(r.entity_id) }));
    return { orders: steps.map((s) => ({ ...s, returns: returnsOf(s.id) })), alreadyClosed: orders.length - steps.length };
}

/** Every order of the chosen stores' views, the wipe's own; and the ERP step, when an integration routes some of them. */
async function decideAllOrders(get: CommerceGet, scope: WipeScope, route: WipeErpRoute | undefined): Promise<Pick<Decided, 'orders' | 'alreadyClosed' | 'erp'>> {
    const own = await decideOrders(get, await readViewOrders(get, [...scope.viewIds]));
    return { ...own, ...(route ? { erp: erpPlanOf(scope, route) } : {}) };
}

/** Every return the plan's orders close, by id and number. */
const returnsOf = (orders: readonly OrderStep[]): OrderReturn[] => orders.flatMap((o) => o.returns);

/** What deciding is handed: the records, read as ids by kind, and the rest of what a plan respects. */
interface Respecting {
    recorded: Recorded;
    onInstance: RecordedOnInstance;
    route?: WipeErpRoute;
    settingsKept: ReadonlySet<string>;
    unfinished?: WipeRespects['unfinished'];
    onPhase?: WipeInputs['onPhase'];
}

/** Customers on wholly chosen websites no record lists: the only ones a company may hold and still go. */
function wholeCustomerIds(customers: CustomerDecision, scope: WipeScope): Set<number> {
    return new Set([...customers.remove, ...customers.inCompany].filter((c) => scope.websites.whole.includes(Number(c.website_id))).map((c) => Number(c.id)));
}

/** Those in a company going leave the list that stays, and join those going. */
function withMembers(customers: CustomerDecision, companies: CompanyDecision): CustomerDecision {
    const members = new Set(companies.remove.flatMap((c) => c.memberIds));
    const isMember = (customer: CustomerDecision['remove'][number]): boolean => members.has(String(customer.id));
    return { ...customers, remove: [...customers.remove, ...customers.inCompany.filter(isMember)], inCompany: customers.inCompany.filter((c) => !isMember(c)) };
}

/** The B2B kinds, each reading the one before: who goes decides the companies, those two the groups. */
async function decideB2b(get: CommerceGet, scope: WipeScope, read: CustomerDecision, stayingRules: CartRuleDecision['staying'], respecting: Respecting): Promise<Pick<Decided, 'customers' | 'companies' | 'catalogs'>> {
    const { onInstance, unfinished } = respecting;
    const companies = await decideCompanies(get, { scope, inCompany: read.inCompany, wholeCustomerIds: wholeCustomerIds(read, scope), recorded: onInstance });
    const customers = withMembers(read, companies);
    const catalogs = await decideCatalogs(get, { goingCustomers: customers.remove, goingCompanies: companies.remove, stayingRules, recorded: onInstance, unfinishedGroups: unfinished?.groups ?? [] });
    return { customers, companies, catalogs };
}

async function decideAll(get: CommerceGet, scope: WipeScope, structure: CommerceStoreStructure, respecting: Respecting): Promise<Decided> {
    const { recorded, onInstance, unfinished } = respecting;
    const phase = respecting.onPhase ?? (() => undefined);
    phase(0);
    const tree = await readCategoryTree(get);
    phase(1);
    const products = decideProducts(await readScopeProducts(get, scope), scope, tree, recorded.products);
    phase(2);
    const cartRules = await decideCartRules(get, scope, { rules: recorded.rules, coupons: recorded.coupons });
    phase(3);
    const customers = await decideCustomers(get, scope, structure, recorded.customers);
    phase(4);
    const b2b = await decideB2b(get, scope, customers, cartRules.staying, respecting);
    phase(5);
    const attributes = await decideAttributes(get, {
        goingProducts: products.remove,
        stayingRules: cartRules.staying,
        recorded: onInstance,
        unfinished: { sets: unfinished?.sets ?? [], attributes: unfinished?.attributes ?? [] },
    });
    phase(6);
    const settings = await decideSettings(get, scope, respecting.settingsKept);
    phase(7);
    const orders = await decideAllOrders(get, scope, respecting.route);
    return { products, categories: decideCategories(tree, scope, recorded.categories), cartRules, ...b2b, attributes, settings, ...orders };
}

function previewOf(scope: WipeScope, decided: Decided, plan: Omit<WipePlan, 'preview' | 'choices' | 'scopeKey'>, records: readonly InstallRecord[]): WipePreview {
    const { orders } = plan;
    const total =
        plan.deleteSkus.length +
        plan.takeOff.length +
        plan.categoryIds.length +
        plan.customerIds.length +
        plan.companyIds.length +
        plan.groups.length +
        plan.attributeSets.length +
        plan.attributes.length +
        plan.settings.length +
        plan.ruleIds.length +
        plan.ruleTakeOff.length +
        orders.length +
        returnsOf(orders).length;
    return {
        stores: scope.stores.map((s) => ({ websiteCode: s.website.code, websiteName: s.website.name, storeCode: s.code, storeName: s.name })),
        remove: {
            products: named(plan.deleteSkus),
            categories: named(categoryNames(decided.categories.remove)),
            customers: named(emails(decided.customers.remove)),
            cartRules: named(ruleNames(decided.cartRules.remove)),
            companies: named(decided.companies.remove.map((c) => c.name)),
            catalogs: named(plan.groups.flatMap((g) => g.catalog?.name ?? [])),
            customerGroups: named(plan.groups.filter((g) => !g.catalog).map((g) => g.groupName)),
            attributeSets: named(plan.attributeSets.map((s) => s.name)),
            attributes: named(plan.attributes.map((a) => a.code)),
        },
        settings: named(plan.settings.map((s) => s.path)),
        takenOff: named([...new Set(plan.takeOff.map((t) => t.sku))]),
        rulesTakenOff: named(decided.cartRules.takeOff.map((t) => t.rule.name)),
        orders: {
            cancel: named(orders.filter((o) => o.action === 'cancel').map((o) => o.number)),
            refund: named(orders.filter((o) => o.action === 'refund').map((o) => o.number)),
            leftOpen: named(orders.filter((o) => o.action === 'note').map((o) => o.number)),
            returns: named(returnsOf(orders).map((r) => r.number)),
        },
        ...(plan.erp ? { erp: erpPartOf(plan.erp) } : {}),
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
    const decided = await decideAll(get, scope, structure, {
        recorded: recordedIds(records),
        onInstance: recordedOnInstance(inputs.everyRecord ?? records),
        route,
        settingsKept: inputs.settingsKept ?? new Set(),
        ...(inputs.unfinished ? { unfinished: inputs.unfinished } : {}),
        ...(inputs.onPhase ? { onPhase: inputs.onPhase } : {}),
    });
    const ids = {
        deleteSkus: skus(decided.products.remove),
        takeOff: decided.products.takeOff.flatMap((t) => t.websiteIds.map((websiteId) => ({ sku: t.product.sku, websiteId }))),
        ...categoryOrder(decided.categories.remove),
        customerIds: decided.customers.remove.map((c) => String(c.id)),
        companyIds: decided.companies.remove.map((c) => c.id),
        memberOf: Object.fromEntries(decided.companies.remove.flatMap((c) => c.memberIds.map((id) => [id, c.id]))),
        groups: decided.catalogs.remove,
        attributeSets: decided.attributes.sets,
        attributes: decided.attributes.attributes,
        settings: decided.settings.reset,
        ruleIds: decided.cartRules.remove.map((r) => String(r.rule_id)),
        ruleTakeOff: decided.cartRules.takeOff.map((t) => ({ id: String(t.rule.rule_id), websiteIds: t.websiteIds })),
        orders: decided.orders,
        alreadyClosed: decided.alreadyClosed,
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
export async function planWipeFor(get: CommerceGet, choices: readonly WipeStoreChoice[], inputs: WipeInputs): Promise<WipePlan> {
    const structure = await readWipeStructure(get);
    return planWipe(get, structure, resolveWipeScope(structure, choices), inputs);
}

const orderIds = (plan: WipePlan, step: (o: OrderStep) => boolean) => plan.orders.filter(step).map((o) => o.id);

/** Every id a plan would write to, a list per kind: what `withinPlan` compares. */
const WRITES: Array<(plan: WipePlan) => readonly string[]> = [
    (p) => p.deleteSkus,
    (p) => p.takeOff.map((t) => `${t.sku}@${t.websiteId}`),
    (p) => p.categoryIds,
    (p) => p.customerIds,
    (p) => p.companyIds,
    (p) => p.groups.map((g) => String(g.groupId)),
    (p) => p.groups.flatMap((g) => (g.catalog ? [String(g.catalog.id)] : [])),
    (p) => p.attributeSets.map((s) => String(s.id)),
    (p) => p.attributes.map((a) => a.code),
    (p) => p.settings.map((s) => `${s.websiteCode}/${s.path}`),
    (p) => p.ruleIds,
    (p) => p.ruleTakeOff.map((t) => `${t.id}@${t.websiteIds.join(',')}`),
    (p) => orderIds(p, (o) => o.action === 'cancel'),
    (p) => orderIds(p, (o) => o.action === 'refund'),
    (p) => orderIds(p, (o) => o.invoice),
    (p) => orderIds(p, (o) => o.unhold),
    (p) => returnsOf(p.orders).map((r) => r.id),
    (p) => erpStoresAsked(p.erp),
];

/**
 * Whether a plan made now takes nothing the plan the SC saw did not: the same stores, and every id
 * it would delete, take off, clear, set back, cancel, invoice, refund, release or close was in the
 * one shown, and the ERP integration is asked about no store the list said it would not be (it was
 * held then). Things gone or closed since are fine.
 */
export function withinPlan(shown: WipePlan, now: WipePlan): boolean {
    return now.scopeKey === shown.scopeKey && WRITES.every((ids) => ids(now).every((id) => ids(shown).includes(id)));
}
