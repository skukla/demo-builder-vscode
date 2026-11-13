/**
 * What clearing a demo's websites would do (datapack-engine step 10, owner 2026-10-27; whole
 * websites since datapack-simplification step 06): everything the chosen websites own that no
 * install record it respects lists, decided from reads alone. Writes nothing; `wipeRun.ts` carries
 * the plan out, and `clearCheck.ts` answers it as the check's rows and record lists.
 *
 * The sandbox holds several demos at once (JustRite's live demo, Bodea, BJU, CitiSignal), so what the
 * websites own is judged against the whole chosen set (`wipeScope.ts`):
 *
 * | Kind | Done | Kept |
 * |---|---|---|
 * | products | `wipeProducts.ts`: deleted when on chosen websites only; taken off the chosen websites when also sold elsewhere | listed by a record; variants no product going holds; fields not answered |
 * | categories | under a root only chosen websites' stores use, the top ones first | under a root a website not chosen also shows; one installed or a cart rule that stays tests, or holding one |
 * | customers | `wipeCustomers.ts`: every customer of the chosen websites | listed by a record; in a B2B company that stays |
 * | orders | `wipeOrders.ts`, the one reset rule shared with the ERP reset: placed in the chosen websites' views; noted first; each one's open returns closed; not invoiced or shipped, cancelled; any other, invoiced in full and refunded with an offline credit memo, so Commerce closes it. Never deleted | already Canceled or Closed, or left open by a reset before: not listed. In payment review: left open with a note, named by the clearing's result |
 * | the ERP, when an ERP integration routes some chosen websites | `wipeErp.ts`: brought in line after the clearing, then filled again from Commerce | the integration must be updated first, or could not be asked: the ERP is not brought in line, the line says why |
 * | cart rules (step 11) | `wipeCartRules.ts`: deleted with their coupons; also on a website not chosen, taken off the chosen ones | listed by a record, or holding a coupon one lists |
 * | companies, and the customers in them | `wipeCompanies.ts`: everyone in the company on chosen websites, with no order in a store not chosen | a customer elsewhere, or with an order elsewhere; a record lists it or a customer in it |
 * | shared catalogs and customer groups, one unit | `wipeCatalogs.ts`: everyone in the group going, no cart rule that stays naming it | a customer, company or rule that stays uses it; a record lists it. Commerce's own groups and the public catalog: never |
 * | attribute sets and attributes | `wipeAttributes.ts`: used by the products going, and nothing else on the instance uses them | a product that stays; a set that stays holds it; a rule that stays tests it; an integration's. System attributes and the Default set: never |
 * | website settings | `wipeSettings.ts`: a value that differs from the Default scope's is set to it | protected (base URLs, cookies, the Admin's, credentials; written by a datapack or the setup guide) and those with no default: not listed. Lists: named by the clearing's result |
 *
 * "Only the chosen websites use it" is decided in that order, each kind reading the one before: who is
 * going decides which companies go, those two which groups, the products going which sets and
 * attributes. Everything is decided before anything is written.
 *
 * **A read that fails** (P6-Q3) is collected per type, never thrown: that type's decision is empty, so
 * nothing of it is written, and the check marks it by its kind. A kind reading another's answer fails
 * with it where its proof is missing: catalogs, groups, attributes and categories when the cart rules
 * that stay are unknown; categories when the products are; returns with orders, which close inside
 * each order's work; and the ERP step is held when the orders are unknown.
 *
 * Never touched, whatever is there: anything an install record lists, this project's and every other
 * local project's (`readWipeClaims`; this project's datapack is left for its uninstall until step 06's
 * C3 runs that removal first); Commerce's own customer groups and attributes, the public catalog and
 * the Default attribute set; stocks and sources (the Default Stock and Source included); websites,
 * stores, store views and root categories; the Default scope's settings and another website's; admin
 * users; the integration's credential.
 *
 * @module features/data-installer/services/demoDataWipe/wipePlan
 */

import { ATTRIBUTE_SET_KIND } from '../demoBuilderEngine/attributeSetsKind';
import { ATTRIBUTE_KIND } from '../demoBuilderEngine/attributesKind';
import { CATALOG_KIND, COMPANY_KIND, CUSTOMER_GROUP_KIND, CUSTOMER_KIND } from '../demoBuilderEngine/b2bKeys';
import { CART_RULE_KIND } from '../demoBuilderEngine/cartRulesKind';
import { PRODUCT_KIND } from '../demoBuilderEngine/productKinds';
import { ORDERS, RETURNS, WEBSITE_SETTINGS, categoryTree, checkOf } from './clearCheck';
import { type AttributeDecision, decideAttributes } from './wipeAttributes';
import { type CartRuleDecision, categoriesNamedBy, decideCartRules } from './wipeCartRules';
import { type CatalogDecision, decideCatalogs } from './wipeCatalogs';
import { type CategoryDecision, categoryOrder, decideCategories } from './wipeCategories';
import type { WipeRespects } from './wipeClaims';
import { type CompanyDecision, decideCompanies } from './wipeCompanies';
import { type CustomerDecision, decideCustomers } from './wipeCustomers';
import { type WipeErp, type WipeErpPlan, type WipeErpRoute, erpPartOf, erpPlanOf, erpStoresAsked, websiteCodesOf } from './wipeErp';
import { type Failures, attempt, noteDecisionFailures, noteFailed } from './wipeFailures';
import { type OrderReturn, type OrderStep, openReturns, orderStepOf } from './wipeOrders';
import { type ProductDecision, decideProducts } from './wipeProducts';
import { type WipeCategory, readCategoryTree, readOrderReturns, readViewOrders, readWebsiteProducts, readWipeStructure } from './wipeReads';
import { type Recorded, type RecordedOnInstance, recordedIds, recordedOnInstance } from './wipeRecorded';
import { type WipeScope, resolveWipeScope } from './wipeScope';
import { type SettingsDecision, decideSettings } from './wipeSettings';
import { sha256 } from '@/core/utils/sha256';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { CommerceGet, CommerceOrder, CommerceProduct } from '@/types/commerceWire';
import type { ClearCheck, ClearRecords } from '@/types/demoDataWipe';

/** The plan in full: the check's answer, and every id it would write to. */
export interface WipePlan {
    /** The chosen websites, by code: what the clearing re-plans against. */
    websiteCodes: string[];
    /** The chosen websites as one key, the same however they were named. */
    scopeKey: string;
    check: Omit<ClearCheck, 'project' | 'warning' | 'datapack'>;
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
    /** List settings that differ from the default, which no write can put back: named by the clearing's result. */
    listSettings: string[];
    /** Cart rules on only the chosen websites (step 11): deleted, their coupons with them. */
    ruleIds: string[];
    /** Cart rules also on websites not chosen: each kept on these websites only. */
    ruleTakeOff: Array<{ id: string; websiteIds: number[] }>;
    /** Each order the wipe closes itself, with its open returns. */
    orders: OrderStep[];
    /** Orders in the chosen websites already Canceled or Closed, or left open by a reset before. */
    alreadyClosed: number;
    /** The ERP step, when an ERP integration routes some chosen websites: their orders are in `orders`. */
    erp?: WipeErpPlan;
    /** Each type a read failed for, with what Commerce said: for the Debug Logs. */
    unreadDetails: Record<string, string>;
}

/**
 * What a plan must respect beyond the store: install records, and the ERP integration serving the
 * instance. Without `everyRecord` the records on the chosen websites stand in for it.
 */
export interface WipeInputs extends Pick<WipeRespects, 'records'>, Partial<Omit<WipeRespects, 'records'>> {
    erp?: WipeErp;
    /** Told as each of `WIPE_PHASES` starts, by its place in the list: the check's progress. */
    onPhase?: (at: number) => void;
}

const skus = (products: readonly CommerceProduct[]) => products.map((p) => p.sku);
const nameOf = (category: WipeCategory): string => category.name ?? String(category.id);
const ruleName = (rule: CartRuleDecision['remove'][number]): string => rule.name ?? String(rule.rule_id);
/** The shared catalogs of these groups, those that have one. */
const catalogsOf = (groups: CatalogDecision['remove']): Array<{ id: number; name: string }> => groups.flatMap((g) => (g.catalog ? [g.catalog] : []));

/** Every product on the chosen websites, each once. */
async function readScopeProducts(get: CommerceGet, scope: WipeScope): Promise<CommerceProduct[]> {
    const bySku = new Map<string, CommerceProduct>();
    for (const websiteId of scope.websiteIds) {
        for (const product of await readWebsiteProducts(get, websiteId)) bySku.set(product.sku, product);
    }
    return [...bySku.values()];
}

interface Decided {
    tree: WipeCategory[];
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

/** Why the ERP step is held when the orders could not be read: its premise, every order closed, is not known. */
export const ORDERS_UNREAD_HELD = 'the orders could not be read';

/**
 * Every order of the chosen websites' views, the wipe's own; and the ERP step, when an integration
 * routes some of them. Held when the orders could not be read: the integration is asked only once
 * every order is closed (`wipeErp.ts`).
 */
async function decideAllOrders(get: CommerceGet, scope: WipeScope, route: WipeErpRoute | undefined, failures: Failures): Promise<Pick<Decided, 'orders' | 'alreadyClosed' | 'erp'>> {
    const own = await attempt(failures, [ORDERS, RETURNS], async () => decideOrders(get, await readViewOrders(get, [...scope.viewIds])), { orders: [], alreadyClosed: 0 });
    if (!route) return own;
    return { ...own, erp: erpPlanOf(scope, failures.has(ORDERS) ? { ...route, held: ORDERS_UNREAD_HELD } : route) };
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

/** Customers on the chosen websites no record lists: the only ones a company may hold and still go. */
function wholeCustomerIds(customers: CustomerDecision): Set<number> {
    return new Set([...customers.remove, ...customers.inCompany].map((c) => Number(c.id)));
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
    const companies = await decideCompanies(get, { scope, inCompany: read.inCompany, wholeCustomerIds: wholeCustomerIds(read), recorded: onInstance });
    const customers = withMembers(read, companies);
    const catalogs = await decideCatalogs(get, { goingCustomers: customers.remove, goingCompanies: companies.remove, stayingRules, recorded: onInstance, unfinishedGroups: unfinished?.groups ?? [] });
    return { customers, companies, catalogs };
}

const NO_RULES: CartRuleDecision = { remove: [], takeOff: [], kept: [], staying: [] };
const NO_CUSTOMERS: CustomerDecision = { remove: [], inCompany: [], kept: [] };

async function decideAll(get: CommerceGet, scope: WipeScope, respecting: Respecting, failures: Failures): Promise<Decided> {
    const { recorded, onInstance, unfinished } = respecting;
    const phase = respecting.onPhase ?? (() => undefined);
    phase(0);
    const tree = await attempt(failures, ['categories'], () => readCategoryTree(get), []);
    phase(1);
    const products = decideProducts(await attempt(failures, [PRODUCT_KIND], () => readScopeProducts(get, scope), []), scope, recorded.products);
    phase(2);
    const cartRules = await attempt(failures, [CART_RULE_KIND], () => decideCartRules(get, scope, { rules: recorded.rules, coupons: recorded.coupons }), NO_RULES);
    phase(3);
    const customers = await attempt(failures, [CUSTOMER_KIND], () => decideCustomers(get, scope, recorded.customers), NO_CUSTOMERS);
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
    const orders = await decideAllOrders(get, scope, respecting.route, failures);
    const decided = { tree, products, cartRules, ...b2b, attributes, settings, ...orders };
    noteDecisionFailures(decided, failures);
    return { ...decided, categories: categoriesOf(decided, scope, recorded, failures) };
}

/**
 * The categories, kept where a record lists one or a rule that stays tests one (a rule's conditions
 * name categories by id). Left alone when the products or the rules could not be read: which products
 * sit in them, and which rules test them, are the proof.
 */
function categoriesOf(decided: Pick<Decided, 'tree' | 'cartRules'>, scope: WipeScope, recorded: Recorded, failures: Failures): CategoryDecision {
    noteFailed(failures, ['categories'], failures.get(PRODUCT_KIND) ?? failures.get(CART_RULE_KIND));
    if (failures.has('categories')) return { remove: [], kept: [] };
    return decideCategories(decided.tree, scope, new Set([...recorded.categories, ...categoriesNamedBy(decided.cartRules.staying)]));
}

type Ids = Omit<WipePlan, 'check' | 'websiteCodes' | 'scopeKey' | 'unreadDetails'>;

/** Names by type, as the check counts them. */
function plannedOf(decided: Decided, ids: Ids, scope: WipeScope): Record<string, ClearRecords> {
    const { products, customers, cartRules, companies, catalogs, attributes } = decided;
    const several = scope.websites.length > 1;
    const going = categoryTree(decided.tree, decided.categories.remove);
    const removedCategories = decided.tree.filter((c) => ids.categoryIds.includes(String(c.id))).map(nameOf);
    const orders = ids.orders.filter((o) => o.action !== 'note');
    return {
        [PRODUCT_KIND]: { removed: [...ids.deleteSkus, ...new Set(ids.takeOff.map((t) => t.sku))], kept: skus(products.kept) },
        categories: { removed: removedCategories, kept: decided.categories.kept.map(nameOf), ...(going.length > 0 ? { tree: going } : {}) },
        [CUSTOMER_KIND]: { removed: customers.remove.map((c) => c.email), kept: [...customers.inCompany, ...customers.kept].map((c) => c.email) },
        [COMPANY_KIND]: { removed: companies.remove.map((c) => c.name), kept: companies.kept },
        [CATALOG_KIND]: { removed: catalogsOf(ids.groups).map((c) => c.name), kept: catalogs.kept.flatMap((g) => g.catalog ?? []) },
        [CART_RULE_KIND]: { removed: [...cartRules.remove, ...cartRules.takeOff.map((t) => t.rule)].map(ruleName), kept: cartRules.kept.map(ruleName) },
        [CUSTOMER_GROUP_KIND]: { removed: ids.groups.map((g) => g.groupName), kept: catalogs.kept.map((g) => g.groupName) },
        [ATTRIBUTE_SET_KIND]: { removed: ids.attributeSets.map((s) => s.name), kept: attributes.setsKept },
        [ATTRIBUTE_KIND]: { removed: ids.attributes.map((a) => a.code), kept: attributes.attributesKept },
        [WEBSITE_SETTINGS]: { removed: ids.settings.map((s) => (several ? `${s.path} (${s.websiteCode})` : s.path)), kept: [] },
        [ORDERS]: { removed: orders.map((o) => o.number), kept: [] },
        [RETURNS]: { removed: returnsOf(orders).map((r) => r.number), kept: [] },
    };
}

function idsOf(decided: Decided): Ids {
    return {
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
        listSettings: decided.settings.lists,
        ruleIds: decided.cartRules.remove.map((r) => String(r.rule_id)),
        ruleTakeOff: decided.cartRules.takeOff.map((t) => ({ id: String(t.rule.rule_id), websiteIds: t.websiteIds })),
        orders: decided.orders,
        alreadyClosed: decided.alreadyClosed,
        ...(decided.erp ? { erp: decided.erp } : {}),
    };
}

const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * What clearing the chosen websites would do, read-only.
 *
 * @param inputs - the install records the wipe must respect (`readWipeClaims`), whose lists are left;
 *   and the ERP integration serving the instance, asked which chosen websites it routes
 */
export async function planWipe(get: CommerceGet, scope: WipeScope, inputs: WipeInputs): Promise<WipePlan> {
    const { records } = inputs;
    const route = inputs.erp ? await inputs.erp.route(websiteCodesOf(scope)) : undefined;
    const failures: Failures = new Map();
    const decided = await decideAll(get, scope, {
        recorded: recordedIds(records),
        onInstance: recordedOnInstance(inputs.everyRecord ?? records),
        route,
        settingsKept: inputs.settingsKept ?? new Set(),
        ...(inputs.unfinished ? { unfinished: inputs.unfinished } : {}),
        ...(inputs.onPhase ? { onPhase: inputs.onPhase } : {}),
    }, failures);
    const ids = idsOf(decided);
    const check = {
        ...checkOf({ scope, planned: plannedOf(decided, ids, scope), failures }),
        token: sha256(JSON.stringify({ websites: scope.key, ...ids })),
        ...(ids.erp ? { erp: erpPartOf(ids.erp) } : {}),
    };
    const unreadDetails = Object.fromEntries([...failures].map(([type, error]) => [type, detailOf(error)]));
    return { websiteCodes: scope.websites.map((w) => w.code), scopeKey: scope.key, check, unreadDetails, ...ids };
}

/**
 * The same, reading the store structure first (and asking the ERP integration, when one serves the
 * instance, which chosen websites it routes): what the clearing re-plans with.
 *
 * @throws WipeScopeError when a chosen website is no longer in the store
 */
export async function planWipeFor(get: CommerceGet, websiteCodes: readonly string[], inputs: WipeInputs): Promise<WipePlan> {
    const structure: CommerceStoreStructure = await readWipeStructure(get);
    return planWipe(get, resolveWipeScope(structure, websiteCodes), inputs);
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
 * Whether a plan made now takes nothing the plan the SC saw did not: the same websites, and every id
 * it would delete, take off, clear, set back, cancel, invoice, refund, release or close was in the
 * one shown, and the ERP integration is asked about no store the list said it would not be (it was
 * held then). Things gone or closed since are fine.
 */
export function withinPlan(shown: WipePlan, now: WipePlan): boolean {
    return now.scopeKey === shown.scopeKey && WRITES.every((ids) => ids(now).every((id) => ids(shown).includes(id)));
}
