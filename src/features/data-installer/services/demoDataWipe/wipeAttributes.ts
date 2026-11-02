/**
 * Which attribute sets and product attributes a wipe removes (owner, 2026-11-02): only when nothing
 * else on the instance uses them. The ones looked at are those the products going use, and any a
 * clearing before this one could not finish (`wipeUnfinished.ts`). A set or attribute no product going
 * uses may be another demo's, about to be used, so it is not looked at.
 *
 * | Attribute set | Done |
 * |---|---|
 * | no product that stays, anywhere, is in it | removed, once its products are gone |
 * | the Default set (id 4) | never, and not reported: the list of what is never touched says it |
 * | an install record lists it | stays, named |
 * | a product that stays is in it, or that could not be read | stays, named. Magento's schema deletes a set's products with it |
 *
 * | Attribute | Done |
 * |---|---|
 * | in a set going, or on a product going, `is_user_defined`, and passing every row below | removed, once its products and sets are gone |
 * | not `is_user_defined` | never, and not reported |
 * | `erp_owner`, `brand`, or starting `erp_`: an ERP integration's | stays, named |
 * | an install record lists it, its option, or its place in a set | stays, named |
 * | a set that stays holds it | stays, named. Commerce drops a value on a product whose set lacks the attribute (memory `reference_commerce_product_create_gotchas`), so this is the strong proof |
 * | a cart rule that stays tests it | stays, named |
 * | a product that stays carries a value for it | stays, named |
 * | any of those could not be read | stays, named: "unused" was not proved |
 *
 * | Read | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | every set | `GET products/attribute-sets/sets/list`: `attribute_set_id`, `attribute_set_name` | yes (`loadStoreSets`) |
 * | what a set holds | `GET products/attribute-sets/{id}/attributes`: `attribute_code` | yes (`erpOwnerAttributeSets`) |
 * | the products in a set | `GET products`, `attribute_set_id` eq, through `productsWhere` (the pack's own removal) | **no** |
 * | an attribute | `GET products/attributes/{code}`: `is_user_defined` | yes (`storeItems.ts`) |
 * | the products carrying one | `GET products`, the attribute's code `notnull`, value 1 | **no**, and it may be read only at the default scope, so a value set on one store view alone may not show. The set rule above is why that does not decide it. A search Commerce refuses keeps the attribute |
 *
 * @module features/data-installer/services/demoDataWipe/wipeAttributes
 */

import { removeAttributeSet } from '../demoBuilderEngine/attributeSetsKind';
import { readOrNull, segment } from '../demoBuilderEngine/kindContext';
import { type RemovalAccess, productsWhere } from '../demoBuilderEngine/removers';
import { leftRow } from './wipeLeft';
import { readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { ERP_ATTRIBUTE_CODES } from '@/features/app-builder/services/storePreparation/erpAttributesFix';
import type { CommerceRuleCondition, CommerceSalesRule } from '@/types/commerceSalesRule';
import type { CommerceAttributeSetList, CommerceGet, CommerceProduct, CommerceProductAttribute, CommerceSetAttribute } from '@/types/commerceWire';
import type { WipeLeft } from '@/types/demoDataWipe';

/** Magento's Default attribute set: the one every new set is copied from. */
const DEFAULT_SET_ID = 4;
const INTEGRATION_ATTRIBUTE = /^erp_/u;

type StoreSet = NonNullable<CommerceAttributeSetList['items']>[number];

/** A set a wipe removes; `needs` are written before it, or it stays. */
export interface GoingSet {
    id: number;
    name: string;
    needs: string[];
}

export interface GoingAttribute {
    code: string;
    needs: string[];
}

export interface AttributeDecision {
    sets: GoingSet[];
    attributes: GoingAttribute[];
    /** Names of what stays, by why. */
    setsInstalled: string[];
    setsInUse: string[];
    setsUnread: string[];
    attributesOwned: string[];
    attributesInstalled: string[];
    attributesInSet: string[];
    attributesInRule: string[];
    attributesOnProduct: string[];
    attributesUnread: string[];
}

type AttributeStays = 'attributesOwned' | 'attributesInstalled' | 'attributesInSet' | 'attributesInRule' | 'attributesOnProduct' | 'attributesUnread';

/** What deciding the sets and attributes is handed. */
export interface AttributeInputs {
    goingProducts: readonly CommerceProduct[];
    stayingRules: readonly CommerceSalesRule[];
    recorded: { sets: ReadonlySet<string>; attributes: ReadonlySet<string> };
    unfinished: { sets: readonly number[]; attributes: readonly string[] };
}

/** The set each product going is in. */
function candidateSets(inputs: AttributeInputs): number[] {
    const ids = inputs.goingProducts.map((p) => p.attribute_set_id).filter((id) => id !== undefined).map(Number);
    return [...new Set([...ids, ...inputs.unfinished.sets])].filter((id) => id !== DEFAULT_SET_ID);
}

async function judgeSet(get: CommerceGet, set: StoreSet, inputs: AttributeInputs, going: ReadonlySet<string>, decided: AttributeDecision): Promise<void> {
    const name = set.attribute_set_name;
    if (inputs.recorded.sets.has(String(set.attribute_set_id))) return void decided.setsInstalled.push(name);
    try {
        const elsewhere = (await productsWhere(get, 'attribute_set_id', String(set.attribute_set_id))).some((sku) => !going.has(sku));
        if (elsewhere) return void decided.setsInUse.push(name);
    } catch {
        return void decided.setsUnread.push(name);
    }
    const needs = inputs.goingProducts.filter((p) => Number(p.attribute_set_id) === set.attribute_set_id).map((p) => `product:${p.sku}`);
    decided.sets.push({ id: set.attribute_set_id, name, needs });
}

const codesIn = async (get: CommerceGet, setId: number): Promise<string[]> =>
    (((await get(`products/attribute-sets/${segment(setId)}/attributes`)) ?? []) as CommerceSetAttribute[]).flatMap((a) => a.attribute_code ?? []);

/** Whether a rule's condition tree tests this attribute anywhere. */
function testsAttribute(condition: CommerceRuleCondition | undefined, code: string): boolean {
    if (!condition) return false;
    return condition.attribute_name === code || (condition.conditions ?? []).some((child) => testsAttribute(child, code));
}

const NOT_NULL = (code: string): string =>
    `&searchCriteria[filterGroups][0][filters][0][field]=${code}&searchCriteria[filterGroups][0][filters][0][value]=1&searchCriteria[filterGroups][0][filters][0][conditionType]=notnull&fields=total_count,items[sku]`;

/** Why an attribute stays, by the row of the module's table; undefined when it goes. Refused reads keep it. */
async function whyAttributeStays(get: CommerceGet, code: string, inputs: AttributeInputs, heldBySets: ReadonlySet<string>, going: ReadonlySet<string>): Promise<AttributeStays | undefined> {
    if (ERP_ATTRIBUTE_CODES.includes(code) || INTEGRATION_ATTRIBUTE.test(code)) return 'attributesOwned';
    if (inputs.recorded.attributes.has(code)) return 'attributesInstalled';
    if (heldBySets.has(code)) return 'attributesInSet';
    if (inputs.stayingRules.some((rule) => testsAttribute(rule.condition, code) || testsAttribute(rule.action_condition, code))) return 'attributesInRule';
    try {
        const carriers = await readAllPages<{ sku: string }>(get, 'products', NOT_NULL(code));
        return carriers.some((p) => !going.has(p.sku)) ? 'attributesOnProduct' : undefined;
    } catch {
        return 'attributesUnread';
    }
}

/** What must be gone before an attribute goes: the sets holding it, and the products carrying it. */
function attributeNeeds(code: string, inputs: AttributeInputs, setsHolding: ReadonlyMap<string, number[]>): string[] {
    const carrying = inputs.goingProducts.filter((p) => (p.custom_attributes ?? []).some((a) => a.attribute_code === code)).map((p) => `product:${p.sku}`);
    return [...(setsHolding.get(code) ?? []).map((id) => `set:${id}`), ...carrying];
}

/** The codes every set staying holds, and the sets going that hold each code. */
interface Holders {
    heldByStaying: Set<string>;
    setsHolding: Map<string, number[]>;
}

/** Read each set once. */
async function readHolders(get: CommerceGet, sets: readonly StoreSet[], goingSets: ReadonlySet<number>): Promise<Holders> {
    const heldByStaying = new Set<string>();
    const setsHolding = new Map<string, number[]>();
    for (const set of sets) {
        const codes = await codesIn(get, set.attribute_set_id);
        if (!goingSets.has(set.attribute_set_id)) codes.forEach((code) => heldByStaying.add(code));
        else for (const code of codes) setsHolding.set(code, [...(setsHolding.get(code) ?? []), set.attribute_set_id]);
    }
    return { heldByStaying, setsHolding };
}

/** One attribute against every rule; a read that fails keeps it, and a system attribute is simply not ours. */
async function judgeAttribute(get: CommerceGet, code: string, inputs: AttributeInputs, holders: Holders, going: ReadonlySet<string>, decided: AttributeDecision): Promise<void> {
    const attribute = await readOrNull<CommerceProductAttribute>(get, `products/attributes/${segment(code)}`).catch(() => undefined);
    if (attribute === undefined) return void decided.attributesUnread.push(code);
    if (attribute?.is_user_defined !== true) return;
    const why = await whyAttributeStays(get, code, inputs, holders.heldByStaying, going);
    if (why) decided[why].push(code);
    else decided.attributes.push({ code, needs: attributeNeeds(code, inputs, holders.setsHolding) });
}

async function judgeAttributes(get: CommerceGet, sets: readonly StoreSet[], inputs: AttributeInputs, going: ReadonlySet<string>, decided: AttributeDecision): Promise<void> {
    const named = [...inputs.goingProducts.flatMap((p) => (p.custom_attributes ?? []).map((a) => a.attribute_code)), ...inputs.unfinished.attributes];
    let holders: Holders;
    try {
        holders = await readHolders(get, sets, new Set(decided.sets.map((s) => s.id)));
    } catch {
        // Which sets hold what is the proof: without it every candidate stays.
        return void decided.attributesUnread.push(...new Set(named));
    }
    for (const code of new Set([...named, ...holders.setsHolding.keys()])) await judgeAttribute(get, code, inputs, holders, going, decided);
}

/** Decide the sets and attributes the products going use. Reads only. */
export async function decideAttributes(get: CommerceGet, inputs: AttributeInputs): Promise<AttributeDecision> {
    const decided: AttributeDecision = { sets: [], attributes: [], setsInstalled: [], setsInUse: [], setsUnread: [], attributesOwned: [], attributesInstalled: [], attributesInSet: [], attributesInRule: [], attributesOnProduct: [], attributesUnread: [] };
    const hasCandidates = inputs.goingProducts.length > 0 || inputs.unfinished.sets.length > 0 || inputs.unfinished.attributes.length > 0;
    if (!hasCandidates) return decided;
    const going = new Set(inputs.goingProducts.map((p) => p.sku));
    let sets: StoreSet[];
    try {
        sets = await readAllPages<StoreSet>(get, 'products/attribute-sets/sets/list');
    } catch {
        decided.setsUnread.push(...candidateSets(inputs).map((id) => `set ${id}`));
        return decided;
    }
    const candidates = candidateSets(inputs);
    for (const set of sets.filter((s) => candidates.includes(s.attribute_set_id))) await judgeSet(get, set, inputs, going, decided);
    await judgeAttributes(get, sets, inputs, going, decided);
    return decided;
}

/**
 * Delete a set, reading first: Magento's schema deletes a set's products with it, so one still holding
 * any is refused here, whatever the plan said.
 *
 * @throws Error when a product is still in it
 */
export async function removeEmptySet(commerce: RemovalAccess, set: GoingSet): Promise<void> {
    const still = await productsWhere(commerce.get, 'attribute_set_id', String(set.id));
    if (still.length > 0) throw new Error(`${still.length} products are still in it, and removing it would delete them`);
    await removeAttributeSet(commerce.send, String(set.id));
}

/** What the SC is told about the sets and attributes that stay. */
export function attributesLeft(decided: AttributeDecision): WipeLeft[] {
    return [
        leftRow('attribute sets', decided.setsInstalled, 'Demo Builder installed them, so removing that datapack decides'),
        leftRow('attribute sets', decided.setsInUse, 'products that stay are in them'),
        leftRow('attribute sets', decided.setsUnread, "which products are in them could not be read, so they can't be called unused"),
        leftRow('attributes', decided.attributesOwned, 'an ERP integration owns them'),
        leftRow('attributes', decided.attributesInstalled, 'Demo Builder installed them, so removing that datapack decides'),
        leftRow('attributes', decided.attributesInSet, 'an attribute set that stays holds them'),
        leftRow('attributes', decided.attributesInRule, 'a cart rule that stays tests them'),
        leftRow('attributes', decided.attributesOnProduct, 'products that stay carry a value for them'),
        leftRow('attributes', decided.attributesUnread, "Commerce would not say what uses them, so they can't be called unused"),
    ];
}
