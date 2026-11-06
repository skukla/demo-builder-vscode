/**
 * Clearing a demo's part of the store (datapack-engine step 10): the plan the SC saw, carried out.
 * Cannot be undone: it removes things no install record lists and closes orders, so there is nothing
 * to put back.
 *
 * The plan is made again first, and the clearing goes ahead only when the new plan takes nothing
 * the shown one did not (`withinPlan`): what is gone or closed since (the pack's removal ran in
 * between) is fine, anything new is refused.
 *
 * **The order of writes:** returns, orders (the one reset rule, `wipeOrders.ts` / `wipeOrderRun.ts`);
 * companies, then customers, a company's admin included (Commerce refuses an admin's delete while the
 * company stands, live 2026-10-30); products (deleted, or only taken off the chosen websites); cart
 * rules (the same two ways, step 11); shared catalogs each with its customer group, then groups with
 * no catalog; categories deepest first; attribute sets, then attributes; website settings last. So a
 * catalog goes when nobody is in it and nobody moves to General (a pack's removal, which runs its
 * record backwards, deletes a catalog before its company, and Commerce moves whoever is in it). A
 * rule's conditions name categories, attributes and groups, so it goes before them; a set's products
 * go before it, since Magento's schema deletes them with it.
 *
 * **A write that needs another is held back when that one failed** (`WipeWrite.needs`): a company that
 * stood keeps its customers, a customer who stood keeps the catalog they would be moved out of, a product
 * that stood keeps its set. Each is counted as not done. A write Commerce refuses is named and counted,
 * and the rest carry on, so the SC is told exactly what could not be done, and a second clearing picks
 * up what is left (`WipeOutcome.unfinished`).
 *
 * When an ERP integration routes some chosen stores' websites (`wipeErp.ts`), it closes every
 * order of those stores first (the wipe closes none of them itself) and takes them out of its ERPs,
 * and the ERP is filled again from Commerce last; its counts are merged into the wipe's.
 *
 * | Write | Route | Confirmed from a real answer? |
 * |---|---|---|
 * | close a return, close off an order | see `wipeOrderRun.ts` | see there |
 * | delete a customer | `DELETE customers/{id}` | the route, yes (step 08's removal, live 2026-10-30) |
 * | delete a product | `DELETE products/{sku}` | the route, yes (the engine's removal) |
 * | take a product off a website | `DELETE products/{sku}/websites/{websiteId}` | **no**: Adobe's REST reference lists it; never called from here |
 * | delete a category | `DELETE categories/{id}` | the route, yes (the engine's removal) |
 * | delete a company | `DELETE company/{id}` | the route, yes (step 08's removal, live 2026-10-30) |
 * | delete a shared catalog, then its group | `DELETE sharedCatalog/{id}`, `DELETE customerGroups/{id}` (404 counts as gone) | the routes, yes (step 08's removal, live 2026-10-30: the catalog's delete took the group too) |
 * | delete an attribute set | `DELETE products/attribute-sets/{id}` | **no**: the engine's removal, not recorded live |
 * | delete an attribute | `DELETE products/attributes/{code}` | **no**: the engine's removal, not recorded live |
 * | set a website setting | see `wipeSettings.ts` | see there |
 * | delete a cart rule (its coupons go with it) | `DELETE salesRules/{id}` | **no** (step 11) |
 * | take a cart rule off the chosen websites | `GET salesRules/{id}`, then `PUT salesRules/{id}` with the rest of its websites | **no** (step 11) |
 *
 * Every write but the order and return ones goes through the project's store-wide access (Store: `all`);
 * those name their own order or return id.
 *
 * @module features/data-installer/services/demoDataWipe/wipeRun
 */

import { removeAttribute } from '../demoBuilderEngine/attributesKind';
import { afterImportDelete } from '../demoBuilderEngine/bulkRemoval';
import { removeCategory } from '../demoBuilderEngine/categoriesKind';
import { removeCompany } from '../demoBuilderEngine/companiesKind';
import { removeCustomer } from '../demoBuilderEngine/customerKinds';
import { deleteIfPresent, segment } from '../demoBuilderEngine/kindContext';
import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { removeEmptySet } from './wipeAttributes';
import { deleteRule, takeRuleOff } from './wipeCartRules';
import { removeEmptyGroup } from './wipeCatalogs';
import { type ErpClosed, type ErpRefreshed, closeErpOrders, erpSentence, refreshErp } from './wipeErp';
import { type OrderOutcome, closeOrder, closeReturn } from './wipeOrderRun';
import { type WipeInputs, type WipePlan, planWipeFor, withinPlan } from './wipePlan';
import { putBackSettings } from './wipeSettings';
import { stepLine } from './wipeStepLine';
import type { WipeUnfinished } from './wipeUnfinished';
import { andList } from '@/core/utils/andList';
import { DATAPACK_STAGES } from '@/core/utils/datapackStages';
import { errorText } from '@/features/app-builder/services/storePreparation/fixContract';
import type { WipePreview } from '@/types/demoDataWipe';

/** The store would now clear something the SC was not shown: nothing was written. */
export class WipeChangedError extends Error {
    constructor(readonly preview: WipePreview) {
        super(`The store changed since the list was made, so nothing was cleared. Check what would be removed again (${preview.total} things now).`);
        this.name = 'WipeChangedError';
    }
}

/** What the clearing removed, by kind. */
export interface WipeCounts {
    customers: number;
    products: number;
    takenOff: number;
    cartRules: number;
    rulesTakenOff: number;
    categories: number;
    companies: number;
    catalogs: number;
    customerGroups: number;
    attributeSets: number;
    attributes: number;
    /** Website settings set to the Default scope's value. */
    settings: number;
}

/** What it did with the orders: the ERP reset's own counts, by the same names. */
export interface OrderCounts {
    cancelled: number;
    refunded: number;
    /** Left open with a note: Commerce could neither cancel nor refund them. */
    commented: number;
    /** Closed before, or handled by a reset before: nothing written. */
    alreadyClosed: number;
    returnsClosed: number;
    failed: number;
}

type StepKey = Exclude<keyof WipeCounts, 'settings'> | 'returns' | 'orders';

/** One write of a step: named as the outcome names it, and what it needs to have gone through first. */
interface WipeWrite {
    id: string;
    write: () => Promise<OrderOutcome | void>;
    /** What a write needing this one names, and what `unfinished` is made from. */
    key?: string;
    needs?: readonly string[];
}

/** One step of the clearing, and what it is called in the outcome. */
interface WipeStep {
    /** "Could not remove 2 of the products": the verb and the kind, plural, with 1 as the count. */
    failed: string;
    stage: string;
    /** Each write, by the id the outcome names it by; an order's answers how it ended. */
    writes: WipeWrite[];
}

/** What the clearing did. */
export interface WipeOutcome {
    removed: WipeCounts;
    orders: OrderCounts;
    /** Each step with refusals: how many, and the first in Commerce's words. */
    failed: Array<{ what: string; count: number; first: string }>;
    sentence: string;
    /** What the list said stays, kind by kind, with why. */
    left: WipePreview['left'];
    /** What no read would find again, for the next clearing of these stores to look at (`wipeUnfinished.ts`). */
    unfinished?: WipeUnfinished;
    /** The ERP part, when an ERP integration routed some chosen stores' websites. */
    erp?: { integration: string; orderNumbers: string[]; removedFrom: string[]; refreshed: boolean; said?: string };
}

/** How a step's writes tie to each other. */
interface Links<T> {
    key?: (item: T) => string;
    needs?: (item: T) => readonly string[];
}

const each = <T>(items: readonly T[], idOf: (item: T) => string, write: (item: T) => Promise<OrderOutcome | void>, links: Links<T> = {}): WipeWrite[] =>
    items.map((item) => ({ id: idOf(item), write: () => write(item), ...(links.key ? { key: links.key(item) } : {}), ...(links.needs ? { needs: links.needs(item) } : {}) }));
const self = (id: string): string => id;

const GROUP_KEY = 'group:';
const SET_KEY = 'set:';
const ATTRIBUTE_KEY = 'attribute:';

function companiesStep(commerce: RemovalAccess, plan: WipePlan): WipeStep {
    return {
        failed: 'remove 1 of the companies',
        stage: DATAPACK_STAGES.removingCompanies.label,
        writes: each(plan.companyIds, self, (id) => removeCompany(commerce.send, id), { key: (id) => `company:${id}` }),
    };
}

function customersStep(commerce: RemovalAccess, plan: WipePlan): WipeStep {
    const links: Links<string> = { key: (id) => `customer:${id}`, needs: (id) => (plan.memberOf[id] ? [`company:${plan.memberOf[id]}`] : []) };
    return {
        failed: 'remove 1 of the customers',
        stage: DATAPACK_STAGES.removingCustomers.label,
        writes: each(plan.customerIds, self, (id) => removeCustomer(commerce.send, id), links),
    };
}

function groupSteps(commerce: RemovalAccess, plan: WipePlan): Pick<Record<StepKey, WipeStep>, 'catalogs' | 'customerGroups'> {
    type Group = WipePlan['groups'][number];
    const links: Links<Group> = { key: (g) => `${GROUP_KEY}${g.groupId}`, needs: (g) => g.needs };
    const remove = (group: Group): Promise<void> => removeEmptyGroup(commerce, group);
    return {
        catalogs: {
            failed: 'remove 1 of the shared catalogs',
            stage: DATAPACK_STAGES.removingCatalogs.label,
            writes: each(plan.groups.filter((g) => g.catalog), (g) => g.catalog?.name ?? g.groupName, remove, links),
        },
        customerGroups: {
            failed: 'remove 1 of the customer groups',
            stage: DATAPACK_STAGES.removingCustomerGroups.label,
            writes: each(plan.groups.filter((g) => !g.catalog), (g) => g.groupName, remove, links),
        },
    };
}

function attributeSteps(commerce: RemovalAccess, plan: WipePlan): Pick<Record<StepKey, WipeStep>, 'attributeSets' | 'attributes'> {
    return {
        attributeSets: {
            failed: 'remove 1 of the attribute sets',
            stage: DATAPACK_STAGES.removingAttributeSets.label,
            writes: each(plan.attributeSets, (s) => s.name, (s) => removeEmptySet(commerce, s), { key: (s) => `${SET_KEY}${s.id}`, needs: (s) => s.needs }),
        },
        attributes: {
            failed: 'remove 1 of the attributes',
            stage: DATAPACK_STAGES.removingAttributes.label,
            writes: each(plan.attributes, (a) => a.code, (a) => removeAttribute(commerce.send, a.code), { key: (a) => `${ATTRIBUTE_KEY}${a.code}`, needs: (a) => a.needs }),
        },
    };
}

/** In the order they run (the module comment's). */
function stepsOf(commerce: RemovalAccess, plan: WipePlan, day: string): Record<StepKey, WipeStep> {
    const { send } = commerce;
    return {
        returns: { failed: 'close 1 of the returns', stage: DATAPACK_STAGES.closingReturns.label, writes: each(plan.returnIds, self, (id) => closeReturn(commerce, id)) },
        orders: { failed: 'close 1 of the orders', stage: DATAPACK_STAGES.closingOrders.label, writes: each(plan.orders, (o) => o.number, (o) => closeOrder(commerce, o, day)) },
        companies: companiesStep(commerce, plan),
        customers: customersStep(commerce, plan),
        products: {
            failed: 'remove 1 of the products',
            stage: DATAPACK_STAGES.removingProducts.label,
            writes: each(plan.deleteSkus, self, afterImportDelete(commerce, plan.deleteSkus), { key: (sku) => `product:${sku}` }),
        },
        takenOff: {
            failed: 'take 1 of the products off a website',
            stage: DATAPACK_STAGES.takingProductsOff.label,
            writes: each(plan.takeOff, (t) => t.sku, (t) => deleteIfPresent(send, `products/${encodeURIComponent(t.sku)}/websites/${segment(t.websiteId)}`)),
        },
        cartRules: { failed: 'remove 1 of the cart rules', stage: DATAPACK_STAGES.removingCartRules.label, writes: each(plan.ruleIds, self, (id) => deleteRule(commerce, id)) },
        rulesTakenOff: {
            failed: 'take 1 of the cart rules off a website',
            stage: DATAPACK_STAGES.takingRulesOff.label,
            writes: each(plan.ruleTakeOff, (t) => t.id, (t) => takeRuleOff(commerce, t.id, t.websiteIds)),
        },
        ...groupSteps(commerce, plan),
        categories: { failed: 'remove 1 of the categories', stage: DATAPACK_STAGES.removingCategories.label, writes: each(plan.categoryIds, self, async (id) => (plan.categoryUnder[id] ? undefined : removeCategory(send, id)), { key: (id) => `category:${id}`, needs: (id) => (plan.categoryUnder[id] ? [`category:${plan.categoryUnder[id]}`] : []) }) },
        ...attributeSteps(commerce, plan),
    };
}

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "the store justrite_test_store", "the stores bodea_store and bodea_outlet". */
export function storesInWords(preview: WipePreview): string {
    const codes = preview.stores.map((s) => s.storeCode);
    return `${codes.length === 1 ? 'the store' : 'the stores'} ${andList(codes)}`;
}

/** " Canceled 1 order, refunded 2 and left 1 open with a note. Closed 1 return.", or nothing. */
function ordersSentence(orders: OrderCounts): string {
    const did = [
        orders.cancelled > 0 ? `canceled ${counted(orders.cancelled, 'order', 'orders')}` : '',
        orders.refunded > 0 ? `refunded ${counted(orders.refunded, 'order', 'orders')}` : '',
        orders.commented > 0 ? `left ${counted(orders.commented, 'order', 'orders')} open with a note` : '',
    ].filter(Boolean);
    const first = did.length > 0 ? ` ${andList(did).replace(/^./u, (c) => c.toUpperCase())}.` : '';
    return `${first}${orders.returnsClosed > 0 ? ` Closed ${counted(orders.returnsClosed, 'return', 'returns')}.` : ''}`;
}

/** What was removed, kind by kind, each with its count, or nothing. */
function removedParts(removed: WipeCounts): string[] {
    const part = (count: number, one: string, many: string): string => (count > 0 ? counted(count, one, many) : '');
    return [
        part(removed.products, 'product', 'products'),
        part(removed.categories, 'category', 'categories'),
        part(removed.customers, 'customer', 'customers'),
        part(removed.cartRules, 'cart rule', 'cart rules'),
        part(removed.companies, 'company', 'companies'),
        part(removed.catalogs, 'shared catalog with its customer group', 'shared catalogs with their customer groups'),
        part(removed.customerGroups, 'customer group', 'customer groups'),
        part(removed.attributeSets, 'attribute set', 'attribute sets'),
        part(removed.attributes, 'attribute', 'attributes'),
    ].filter(Boolean);
}

/** " Set 3 website settings to the default's value." and why they are not quite gone; or nothing. */
function settingsSentence(count: number): string {
    if (count === 0) return '';
    return ` Set ${counted(count, 'website setting', 'website settings')} to the default's value. Commerce can't clear a website's own value, so a later change to the default won't reach ${count === 1 ? 'it' : 'them'}.`;
}

/** " Left 1 of the companies (Acme): why.", kind by kind. */
function leftSentence(left: WipePreview['left']): string {
    const names = (row: WipePreview['left'][number]): string => {
        const more = row.count - row.names.length;
        return row.names.length > 0 ? ` (${row.names.join(', ')}${more > 0 ? ` and ${more} more` : ''})` : '';
    };
    return left.map((row) => ` Left ${row.count} of the ${row.kind}${names(row)}: ${row.why}.`).join('');
}

function sentenceOf(preview: WipePreview, removed: WipeCounts, orders: OrderCounts, failed: WipeOutcome['failed']): string {
    const where = storesInWords(preview);
    const parts = removedParts(removed);
    const did = parts.length > 0 ? `Removed ${andList(parts)} from ${where}.` : `Removed nothing from ${where}.`;
    const off = removed.takenOff > 0 ? ` Took ${counted(removed.takenOff, 'product', 'products')} other websites also sell off the chosen websites.` : '';
    const rulesOff = removed.rulesTakenOff > 0 ? ` Took ${counted(removed.rulesTakenOff, 'cart rule', 'cart rules')} other websites also use off the chosen websites.` : '';
    const not = failed.map((f) => ` Could not ${f.what.replace('1', String(f.count))} (${f.first}).`).join('');
    return `${did}${ordersSentence(orders)}${off}${rulesOff}${settingsSentence(removed.settings)}${not}`;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** A write held back: one it needs did not go through. */
const HELD_BACK = 'held back, since what it needs gone first could not be removed';

/** Count one write that went through. */
function count(key: StepKey, result: OrderOutcome | void, removed: WipeCounts, orders: OrderCounts): void {
    if (key === 'returns') orders.returnsClosed += 1;
    else if (key === 'orders') orders[result || 'commented'] += 1;
    else removed[key] += 1;
}

/**
 * Carry a plan out, as made: every write named in it, in order, counting what Commerce refused.
 *
 * @param report - called as each kind starts and after each of its writes, with how far it has got
 * @param day - the day the orders' notes name; today by default
 */
export async function runWipe(commerce: RemovalAccess, plan: WipePlan, report: (stage: string, step?: string) => void = () => undefined, day = today()): Promise<WipeOutcome> {
    const removed: WipeCounts = { customers: 0, products: 0, takenOff: 0, cartRules: 0, rulesTakenOff: 0, categories: 0, companies: 0, catalogs: 0, customerGroups: 0, attributeSets: 0, attributes: 0, settings: 0 };
    const orders: OrderCounts = { cancelled: 0, refunded: 0, commented: 0, alreadyClosed: plan.alreadyClosed, returnsClosed: 0, failed: 0 };
    const failed: WipeOutcome['failed'] = [];
    const notDone = new Set<string>();
    for (const [key, step] of Object.entries(stepsOf(commerce, plan, day)) as Array<[StepKey, WipeStep]>) {
        const done = (n: number): void => report(step.stage, stepLine(key, n, step.writes.length));
        if (step.writes.length > 0) done(0);
        const refused = await runStep(key, step, { removed, orders, notDone }, done);
        if (key === 'orders' || key === 'returns') orders.failed += refused.length;
        if (refused.length > 0) failed.push({ what: step.failed, count: refused.length, first: refused[0] });
    }
    await runSettings(commerce, plan, report, removed, failed);
    const unfinished = unfinishedOf(plan, notDone);
    const { left } = plan.preview;
    return { removed, orders, failed, left, sentence: `${sentenceOf(plan.preview, removed, orders, failed)}${leftSentence(left)}`, ...(unfinished ? { unfinished } : {}) };
}

/** Every write of one step, what it needs first checked; answers each it could not do, as "id: why". */
async function runStep(key: StepKey, step: WipeStep, tally: { removed: WipeCounts; orders: OrderCounts; notDone: Set<string> }, done: (n: number) => void): Promise<string[]> {
    const refused: string[] = [];
    const missed = (write: WipeWrite, why: string): void => {
        refused.push(`${write.id}: ${why}`);
        if (write.key) tally.notDone.add(write.key);
    };
    for (const [at, write] of step.writes.entries()) {
        if (write.needs?.some((need) => tally.notDone.has(need))) {
            missed(write, HELD_BACK);
        } else {
            try {
                count(key, await write.write(), tally.removed, tally.orders);
            } catch (error) {
                missed(write, errorText(error));
            }
        }
        done(at + 1);
    }
    return refused;
}

/** The website settings, last: one write per batch, so counted apart from the steps. */
async function runSettings(commerce: RemovalAccess, plan: WipePlan, report: (stage: string) => void, removed: WipeCounts, failed: WipeOutcome['failed']): Promise<void> {
    if (plan.settings.length === 0) return;
    report(DATAPACK_STAGES.resettingSettings.label);
    const outcome = await putBackSettings(commerce, plan.settings);
    removed.settings = outcome.count;
    if (outcome.refused.length > 0) failed.push({ what: 'set 1 of the website settings back', count: outcome.refused.length, first: outcome.refused[0] });
}

/** What was not done and no read would find again, or nothing when all of it was. */
function unfinishedOf(plan: WipePlan, notDone: ReadonlySet<string>): WipeUnfinished | undefined {
    const of = (prefix: string): string[] => [...notDone].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    const [groups, sets, attributes] = [of(GROUP_KEY).map(Number), of(SET_KEY).map(Number), of(ATTRIBUTE_KEY)];
    return groups.length + sets.length + attributes.length > 0 ? { scopeKey: plan.scopeKey, groups, sets, attributes } : undefined;
}

/** The wipe's outcome with the integration's close merged in, and the sentence said again. */
function withErp(outcome: WipeOutcome, plan: WipePlan, closed: ErpClosed | undefined, refreshed: ErpRefreshed | undefined): WipeOutcome {
    if (!plan.erp) return outcome;
    const orders = { ...outcome.orders };
    for (const key of Object.keys(orders) as Array<keyof OrderCounts>) orders[key] += closed?.counts[key] ?? 0;
    const failed = closed?.failed ? [closed.failed, ...outcome.failed] : outcome.failed;
    const sentence = `${sentenceOf(plan.preview, outcome.removed, orders, failed)}${erpSentence(plan.erp, closed, refreshed)}${leftSentence(outcome.left)}`;
    const said = refreshed?.said ? { said: refreshed.said } : {};
    const touched = { orderNumbers: closed?.orderNumbers ?? [], removedFrom: closed?.removedFrom ?? [] };
    const erp = { integration: plan.erp.route.name, ...touched, refreshed: refreshed?.refreshed ?? false, ...said };
    return { ...outcome, orders, failed, sentence, erp };
}

/**
 * Clear the stores as shown: make the plan again, refuse when it takes anything the shown plan did
 * not, then carry it out: the ERP integration's close first, the wipe's own writes, then the ERP
 * filled again from Commerce.
 *
 * @throws WipeChangedError, writing nothing, when the store would now clear something not shown
 */
export async function clearShown(commerce: RemovalAccess, shown: WipePlan, inputs: WipeInputs, report: (stage: string, step?: string) => void = () => undefined): Promise<WipeOutcome> {
    const { erp } = inputs;
    const now = await planWipeFor(commerce.get, shown.choices, inputs);
    if (!withinPlan(shown, now)) throw new WipeChangedError(now.preview);
    const closed = await closeErpOrders(erp, now.erp, report);
    const outcome = await runWipe(commerce, now, report);
    return withErp(outcome, now, closed, await refreshErp(erp, now.erp, report));
}
